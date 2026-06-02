/**
 * videoCacheService — Cache local des vidéos stories sur disque.
 * Style WhatsApp : télécharge silencieusement, restitue depuis le disque.
 *
 * Corrections v2 :
 * - getLocalUri vérifie l'existence réelle du fichier (plus d'entrées zombies)
 * - saveIndex avec backup pour résister aux crashes
 * - cleanup() nettoie aussi les zombies (fichier absent du disque)
 * - cacheInBackground évite de retélécharger si fichier physique présent
 * - cleanup() appelé avant chaque saveIndex pour tenir sous MAX_SIZE_B
 */
import RNBlobUtil from 'react-native-blob-util';
import { storage } from '../utils/storage';

const CACHE_DIR      = `${RNBlobUtil.fs.dirs.CacheDir}/folix_story_videos`;
const INDEX_KEY      = 'video_cache_index';
const INDEX_KEY_BAK  = 'video_cache_index_bak';  // backup anti-crash
const MAX_AGE_MS     = 26 * 3600 * 1000;          // 26h (stories = 24h)
const MAX_SIZE_B     = 150 * 1024 * 1024;          // 150 Mo

interface CacheEntry { path: string; size: number; ts: number; }
type CacheIndex = Record<string, CacheEntry>;

let _index: CacheIndex | null = null;
const _downloading = new Map<string, Promise<string | null>>();

// ── Index MMKV avec backup anti-crash ─────────────────────────────────────────

function loadIndex(): CacheIndex {
  try {
    const raw = storage.getItem(INDEX_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Tentative de restauration depuis backup
  try {
    const bak = storage.getItem(INDEX_KEY_BAK);
    if (bak) return JSON.parse(bak);
  } catch {}
  return {};
}

function saveIndex(idx: CacheIndex): void {
  try {
    const json = JSON.stringify(idx);
    // Écrire d'abord le backup, puis l'index principal
    storage.setItem(INDEX_KEY_BAK, json);
    storage.setItem(INDEX_KEY, json);
  } catch {}
}

function getIndex(): CacheIndex {
  if (!_index) _index = loadIndex();
  return _index;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  return url.split('?')[0];
}

function urlToFilename(url: string): string {
  const norm = normalizeUrl(url);
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = (h * 33) ^ norm.charCodeAt(i);
  const ext = norm.split('.').pop()?.toLowerCase() ?? 'mp4';
  return `${(h >>> 0).toString(36)}.${ext}`;
}

/** Vérifie si un fichier existe réellement sur le disque. */
async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await RNBlobUtil.fs.stat(path);
    return !!stat && parseInt(String(stat.size), 10) > 0;
  } catch {
    return false;
  }
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Retourne file:// si le fichier est en cache ET existe sur disque.
 * Supprime l'entrée zombie si le fichier a disparu.
 */
export async function getLocalUriAsync(url: string): Promise<string | null> {
  if (!url || url.includes('.m3u8')) return null;
  const key   = normalizeUrl(url);
  const entry = getIndex()[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;

  // Vérification disque — supprime les zombies
  const exists = await fileExists(entry.path);
  if (!exists) {
    const idx = getIndex();
    delete idx[key];
    _index = idx;
    saveIndex(idx);
    return null;
  }
  return `file://${entry.path}`;
}

/**
 * Version synchrone — retourne depuis l'index sans vérifier le disque.
 * Utiliser pour les décisions de lecture rapide (le fallback onError gère les zombies).
 */
export function getLocalUri(url: string): string | null {
  if (!url || url.includes('.m3u8')) return null;
  const key   = normalizeUrl(url);
  const entry = getIndex()[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return `file://${entry.path}`;
}

/**
 * Supprime une entrée zombie de l'index (appelé par le fallback onError).
 */
export function invalidateCacheEntry(url: string): void {
  const key = normalizeUrl(url);
  const idx = getIndex();
  if (idx[key]) {
    delete idx[key];
    _index = idx;
    saveIndex(idx);
  }
}

/**
 * Télécharge en arrière-plan.
 * - Si fichier physique présent → met à jour le timestamp sans retélécharger
 * - Si déjà en cours → attend la même promesse
 * - Nettoie les fichiers partiels en cas d'erreur
 */
export async function cacheInBackground(url: string): Promise<string | null> {
  if (!url || url.includes('.m3u8')) return null;

  const cached = getLocalUri(url);
  if (cached) return cached;

  const key      = normalizeUrl(url);
  const filename = urlToFilename(url);
  const destPath = `${CACHE_DIR}/${filename}`;

  if (_downloading.has(key)) return _downloading.get(key)!;

  const promise = (async () => {
    try {
      await RNBlobUtil.fs.mkdir(CACHE_DIR).catch(() => {});

      // Si le fichier existe déjà physiquement, rafraîchir juste le timestamp
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

      // Téléchargement
      await RNBlobUtil.config({
        path:           destPath,
        overwrite:      true,
        timeout:        30000,
        followRedirect: true,
        wifiOnly:       false,
      }).fetch('GET', url);

      const stat = await RNBlobUtil.fs.stat(destPath).catch(() => null);
      const size = stat?.size ? parseInt(String(stat.size), 10) : 0;
      if (size === 0) throw new Error('empty file');

      const idx = getIndex();
      idx[key]  = { path: destPath, size, ts: Date.now() };
      _index    = idx;
      await _pruneIfNeeded(idx);  // nettoyage AVANT saveIndex
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

/**
 * Vérifie si la taille totale dépasse MAX_SIZE_B et supprime les plus anciens.
 * Appelé avant chaque saveIndex pour toujours rester sous la limite.
 */
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

/**
 * Purge complète : expirés + zombies (fichier absent du disque) + dépassement taille.
 * À appeler au démarrage de l'app.
 */
export async function cleanup(): Promise<void> {
  try {
    const idx = getIndex();
    const now = Date.now();
    const kept: CacheIndex = {};
    let total = 0;

    const entries = Object.entries(idx).sort(([, a], [, b]) => b.ts - a.ts);

    for (const [url, entry] of entries) {
      // 1. Expirés
      if (now - entry.ts > MAX_AGE_MS) {
        await RNBlobUtil.fs.unlink(entry.path).catch(() => {});
        continue;
      }
      // 2. Zombies (fichier absent du disque)
      const exists = await fileExists(entry.path);
      if (!exists) continue;
      // 3. Limite de taille (les plus récents gardés en priorité)
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
