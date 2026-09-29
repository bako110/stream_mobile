/**
 * reelVideoCacheService — Cache local des vidéos MP4 des reels sur disque.
 * Même principe que videoCacheService (stories) mais dossier/index/limites
 * séparés : les reels sont du contenu permanent (pas 24h comme les stories),
 * et le mp4_url est un fichier brut d'une seule qualité (pas de HLS ici —
 * le HLS reste utilisé comme source de lecture normale, ce cache ne concerne
 * que le mp4_url quand il existe).
 *
 * - getLocalUri retourne file:// si déjà en cache — permet de ne JAMAIS
 *   retélécharger un reel déjà vu, tant qu'il n'a pas expiré ou été évincé.
 * - cacheInBackground télécharge silencieusement en tâche de fond, jamais
 *   avant/pendant la lecture réseau normale : la lecture démarre toujours
 *   en streaming, le cache ne sert que pour la PROCHAINE fois.
 * - Plafond dur en taille (_pruneIfNeeded) : évince les plus anciens dès que
 *   la limite est dépassée, le cache ne grossit donc jamais indéfiniment.
 */
import RNBlobUtil from 'react-native-blob-util';
import { storage } from '../utils/storage';

const CACHE_DIR      = `${RNBlobUtil.fs.dirs.CacheDir}/gofolyx_reel_videos`;
const INDEX_KEY      = 'reel_video_cache_index';
const INDEX_KEY_BAK  = 'reel_video_cache_index_bak';
const MAX_AGE_MS     = 7 * 24 * 3600 * 1000;   // 7 jours — contenu permanent, pas éphémère
const MAX_SIZE_B     = 1024 * 1024 * 1024;      // 1 Go

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
  const ext = norm.split('.').pop()?.toLowerCase() ?? 'mp4';
  return `${(h >>> 0).toString(36)}.${ext}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await RNBlobUtil.fs.stat(path);
    return !!stat && parseInt(String(stat.size), 10) > 0;
  } catch {
    return false;
  }
}

/**
 * Version synchrone — retourne file:// depuis l'index sans vérifier le disque.
 * Utilisée pour la décision de lecture rapide (pas d'await avant de choisir
 * la source du player) ; le fallback onError du lecteur gère les zombies via
 * invalidateCacheEntry si le fichier a disparu entre-temps.
 */
export function getLocalUri(url: string): string | null {
  if (!url) return null;
  const key   = normalizeUrl(url);
  const entry = getIndex()[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return `file://${entry.path}`;
}

/**
 * Invalide une entrée (fallback onError du lecteur vidéo — fichier corrompu).
 * Supprime AUSSI le fichier physique du disque, pas seulement l'entrée
 * d'index : sinon cacheInBackground() retrouverait le même fichier cassé via
 * fileExists() et le réutiliserait sans jamais le retélécharger.
 */
export function invalidateCacheEntry(url: string): void {
  const key = normalizeUrl(url);
  const idx = getIndex();
  if (idx[key]) {
    const path = idx[key].path;
    delete idx[key];
    _index = idx;
    saveIndex(idx);
    RNBlobUtil.fs.unlink(path).catch(() => {});
  }
}

/**
 * Télécharge en arrière-plan — jamais avant/pendant la lecture réseau normale.
 * - Si fichier physique déjà présent → rafraîchit juste le timestamp, ne
 *   retélécharge JAMAIS (c'est le point critique demandé : pas de download
 *   en double pour un reel déjà en cache).
 * - Si un téléchargement de la même URL est déjà en cours → réutilise la
 *   même promesse au lieu d'en démarrer un second en parallèle.
 */
export async function cacheInBackground(url: string): Promise<string | null> {
  if (!url) return null;

  const cached = getLocalUri(url);
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
        timeout:        60000,
        followRedirect: true,
        wifiOnly:       false,
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

/** Évince les plus anciens dès que MAX_SIZE_B est dépassé — plafond jamais franchi. */
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
 * Purge complète : expirés + zombies + dépassement taille. À appeler au
 * démarrage de l'app (voir App.tsx, même pattern que videoCacheService).
 */
export async function cleanup(): Promise<void> {
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

/**
 * Supprime TOUT le cache disque — appelée quand l'app passe en arrière-plan
 * (voir App.tsx, listener AppState). Choix explicite de l'utilisateur : le
 * cache ne sert alors qu'à éviter la compétition réseau entre reels
 * préchargés et le reel actif PENDANT une session, jamais à persister entre
 * deux ouvertures de l'app.
 */
export async function clearAll(): Promise<void> {
  try {
    const idx = getIndex();
    for (const entry of Object.values(idx)) {
      await RNBlobUtil.fs.unlink(entry.path).catch(() => {});
    }
    // Filet de sécurité : supprime aussi le dossier entier au cas où des
    // fichiers physiques existeraient sans entrée d'index (téléchargement
    // interrompu avant d'être indexé, etc.) — jamais de résidu oublié.
    await RNBlobUtil.fs.unlink(CACHE_DIR).catch(() => {});
    _index = {};
    saveIndex({});
  } catch {}
}
