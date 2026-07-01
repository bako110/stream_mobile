/**
 * imageCacheService — Cache disque des images distantes.
 * Même principe que videoCacheService.ts : télécharge une fois, ressert depuis le disque
 * pour éviter de re-télécharger la même image à chaque scroll/re-render.
 */
import RNBlobUtil from 'react-native-blob-util';
import { storage } from '../utils/storage';

const CACHE_DIR     = `${RNBlobUtil.fs.dirs.CacheDir}/gofolyx_images`;
const INDEX_KEY      = 'image_cache_index';
const INDEX_KEY_BAK  = 'image_cache_index_bak';
const MAX_AGE_MS     = 7 * 24 * 3600 * 1000; // 7 jours
const MAX_SIZE_B     = 120 * 1024 * 1024;     // 120 Mo

interface CacheEntry { path: string; size: number; ts: number; }
type CacheIndex = Record<string, CacheEntry>;

let _index: CacheIndex | null = null;
const _downloading = new Map<string, Promise<string | null>>();

function loadIndex(): CacheIndex {
  try {
    const raw = storage.getItem(INDEX_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    const bak = storage.getItem(INDEX_KEY_BAK);
    if (bak) return JSON.parse(bak);
  } catch {}
  return {};
}

function saveIndex(idx: CacheIndex): void {
  try {
    const json = JSON.stringify(idx);
    storage.setItem(INDEX_KEY_BAK, json);
    storage.setItem(INDEX_KEY, json);
  } catch {}
}

function getIndex(): CacheIndex {
  if (!_index) _index = loadIndex();
  return _index;
}

function normalizeUrl(url: string): string {
  return url.split('?')[0];
}

function urlToFilename(url: string): string {
  const norm = normalizeUrl(url);
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = (h * 33) ^ norm.charCodeAt(i);
  const ext = norm.split('.').pop()?.toLowerCase().slice(0, 4) ?? 'jpg';
  return `${(h >>> 0).toString(36)}.${/^[a-z0-9]+$/.test(ext) ? ext : 'jpg'}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await RNBlobUtil.fs.stat(path);
    return !!stat && parseInt(String(stat.size), 10) > 0;
  } catch {
    return false;
  }
}

/** Retourne file:// si déjà en cache sur disque, sinon null (fallback : url distante). */
export function getCachedUri(url: string): string | null {
  if (!url) return null;
  const key   = normalizeUrl(url);
  const entry = getIndex()[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return `file://${entry.path}`;
}

/**
 * Télécharge l'image en arrière-plan et la met en cache disque.
 * Retourne le chemin local une fois prêt (ou null en cas d'échec).
 */
export async function cacheImage(url: string): Promise<string | null> {
  if (!url) return null;

  const cached = getCachedUri(url);
  if (cached) return cached;

  const key      = normalizeUrl(url);
  const filename = urlToFilename(url);
  const destPath = `${CACHE_DIR}/${filename}`;

  if (_downloading.has(key)) return _downloading.get(key)!;

  const promise = (async () => {
    try {
      await RNBlobUtil.fs.mkdir(CACHE_DIR).catch(() => {});

      const alreadyExists = await fileExists(destPath);
      if (alreadyExists) {
        const stat = await RNBlobUtil.fs.stat(destPath).catch(() => null);
        const size = stat?.size ? parseInt(String(stat.size), 10) : 0;
        const idx  = getIndex();
        idx[key]   = { path: destPath, size, ts: Date.now() };
        _index     = idx;
        await _pruneIfNeeded(idx);
        saveIndex(idx);
        return `file://${destPath}`;
      }

      await RNBlobUtil.config({
        path:           destPath,
        overwrite:      true,
        timeout:        20000,
        followRedirect: true,
      }).fetch('GET', url);

      const stat = await RNBlobUtil.fs.stat(destPath).catch(() => null);
      const size = stat?.size ? parseInt(String(stat.size), 10) : 0;
      if (size === 0) throw new Error('empty file');

      const idx = getIndex();
      idx[key]  = { path: destPath, size, ts: Date.now() };
      _index    = idx;
      await _pruneIfNeeded(idx);
      saveIndex(idx);

      return `file://${destPath}`;
    } catch {
      await RNBlobUtil.fs.unlink(destPath).catch(() => {});
      return null;
    } finally {
      _downloading.delete(key);
    }
  })();

  _downloading.set(key, promise);
  return promise;
}

async function _pruneIfNeeded(idx: CacheIndex): Promise<void> {
  const entries = Object.entries(idx).sort(([, a], [, b]) => b.ts - a.ts);
  let total = entries.reduce((s, [, e]) => s + e.size, 0);
  if (total <= MAX_SIZE_B) return;

  for (let i = entries.length - 1; i >= 0 && total > MAX_SIZE_B; i--) {
    const [url, entry] = entries[i];
    await RNBlobUtil.fs.unlink(entry.path).catch(() => {});
    delete idx[url];
    total -= entry.size;
  }
}

/** Purge expirés + zombies + dépassement de taille. À appeler au démarrage de l'app. */
export async function cleanupImageCache(): Promise<void> {
  try {
    const idx = getIndex();
    const now = Date.now();
    const kept: CacheIndex = {};
    let total = 0;

    const entries = Object.entries(idx).sort(([, a], [, b]) => b.ts - a.ts);

    for (const [url, entry] of entries) {
      if (now - entry.ts > MAX_AGE_MS) {
        await RNBlobUtil.fs.unlink(entry.path).catch(() => {});
        continue;
      }
      const exists = await fileExists(entry.path);
      if (!exists) continue;
      total += entry.size;
      if (total > MAX_SIZE_B) {
        await RNBlobUtil.fs.unlink(entry.path).catch(() => {});
        continue;
      }
      kept[url] = entry;
    }

    _index = kept;
    saveIndex(kept);
  } catch {}
}
