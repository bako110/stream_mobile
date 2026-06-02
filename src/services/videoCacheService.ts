/**
 * videoCacheService — Cache local des vidéos stories sur disque.
 * Style WhatsApp : télécharge silencieusement pendant/après visionnage,
 * restitue depuis le disque la prochaine fois sans réseau.
 *
 * Cycle de vie :
 *  1. getLocalUri(url)  → chemin local si disponible, null sinon
 *  2. cacheInBackground(url) → télécharge en bg, résolu quand prêt
 *  3. cleanup() → supprime les fichiers > 7 jours et > 200 Mo
 */
import RNBlobUtil from 'react-native-blob-util';
import { storage } from '../utils/storage';

const CACHE_DIR    = `${RNBlobUtil.fs.dirs.CacheDir}/folix_story_videos`;
const INDEX_KEY    = 'video_cache_index';  // { url → { path, size, ts } }
const MAX_AGE_MS   = 26 * 3600 * 1000;    // 26h — légèrement > 24h pour couvrir les décalages
const MAX_SIZE_B   = 150 * 1024 * 1024;   // 150 Mo (stories durent 24h, pas besoin de plus)

interface CacheEntry { path: string; size: number; ts: number; }
type CacheIndex = Record<string, CacheEntry>;

// ── Index en mémoire ──────────────────────────────────────────────────────────

let _index: CacheIndex | null = null;
const _downloading = new Map<string, Promise<string | null>>();

function loadIndex(): CacheIndex {
  try { return JSON.parse(storage.getItem(INDEX_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveIndex(idx: CacheIndex): void {
  try { storage.setItem(INDEX_KEY, JSON.stringify(idx)); }
  catch {}
}

function getIndex(): CacheIndex {
  if (!_index) _index = loadIndex();
  return _index;
}

// Normalise l'URL — supprime les query params (tokens) pour éviter les doublons
function normalizeUrl(url: string): string {
  return url.split('?')[0];
}

function urlToFilename(url: string): string {
  const normalized = normalizeUrl(url);
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) h = (h * 33) ^ normalized.charCodeAt(i);
  const ext = normalized.endsWith('.m3u8') ? 'm3u8' : normalized.split('.').pop() ?? 'mp4';
  return `${(h >>> 0).toString(36)}.${ext}`;
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Retourne le chemin local si la vidéo est déjà en cache, null sinon.
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
 * Télécharge la vidéo en arrière-plan et retourne le chemin local.
 * Si déjà en cache → retourne immédiatement.
 * Si déjà en cours → attend la même promesse (pas de doublon).
 */
export async function cacheInBackground(url: string): Promise<string | null> {
  if (!url || url.includes('.m3u8')) return null;

  const cached = getLocalUri(url);
  if (cached) return cached;

  const key = normalizeUrl(url);
  if (_downloading.has(key)) return _downloading.get(key)!;

  const promise = (async () => {
    const filename = urlToFilename(url);
    const destPath = `${CACHE_DIR}/${filename}`;
    try {
      await RNBlobUtil.fs.mkdir(CACHE_DIR).catch(() => {});

      await RNBlobUtil.config({
        path:           destPath,
        overwrite:      true,     // overwrite pour remplacer les fichiers partiels
        timeout:        30000,
        followRedirect: true,
        wifiOnly:       false,
      }).fetch('GET', url);

      const stat = await RNBlobUtil.fs.stat(destPath).catch(() => null);
      const size = stat?.size ? parseInt(String(stat.size), 10) : 0;
      if (size === 0) throw new Error('empty file');

      const idx = getIndex();
      idx[key] = { path: destPath, size, ts: Date.now() };
      _index = idx;
      saveIndex(idx);

      return `file://${destPath}`;
    } catch {
      // Nettoyer le fichier partiel en cas d'erreur
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
 * Purge les fichiers expirés (> 7j) et réduit à 200 Mo max.
 * À appeler au démarrage ou quand le stockage est faible.
 */
export async function cleanup(): Promise<void> {
  try {
    const idx   = getIndex();
    const now   = Date.now();
    let   total = 0;

    // Supprimer les expirés
    const entries = Object.entries(idx)
      .filter(([, e]) => now - e.ts <= MAX_AGE_MS)
      .sort(([, a], [, b]) => b.ts - a.ts); // les plus récents en premier

    // Calculer la taille totale et couper si > 200 Mo
    const kept: CacheIndex = {};
    for (const [url, entry] of entries) {
      total += entry.size;
      if (total <= MAX_SIZE_B) {
        kept[url] = entry;
      } else {
        await RNBlobUtil.fs.unlink(entry.path).catch(() => {});
      }
    }

    // Supprimer les entrées expirées du disque
    const expiredUrls = Object.keys(idx).filter(u => !kept[u]);
    for (const url of expiredUrls) {
      const e = idx[url];
      if (e) await RNBlobUtil.fs.unlink(e.path).catch(() => {});
    }

    _index = kept;
    saveIndex(kept);
  } catch {}
}
