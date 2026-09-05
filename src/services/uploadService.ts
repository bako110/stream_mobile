import { launchImageLibrary } from 'react-native-image-picker';
import type { ImageLibraryOptions, Asset } from 'react-native-image-picker';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Image as CompressorImage } from 'react-native-compressor';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { storage } from '../utils/storage';
import { compressVideo, cleanupTempVideos } from './videoCompressService';
import { apiClient } from '../api/client';

export type UploadFolder = 'concerts' | 'events' | 'avatars' | 'reels' | 'stories' | 'messages' | 'posts' | 'communities' | 'content' | 'tournaments';
export type VideoFolder  = 'reels' | 'stories' | 'messages' | 'events' | 'concerts' | 'content' | 'posts';
export type AudioFolder  = 'messages' | 'stories' | 'reels';

export interface UploadedImage {
  url:       string;
  public_id: string;
  width?:    number;
  height?:   number;
  format?:   string;
}

export interface UploadedVideo {
  url:            string;
  public_id:      string;
  job_id?:        string;
  duration?:      number;
  thumbnail_url?: string;
  hls_url?:       string;
  mp4_url?:       string;
  width?:         number;
  height?:        number;
  format?:        string;
}

export interface UploadedAudio {
  url:       string;
  public_id: string;
  duration?: number;
  format?:   string;
}

export interface PickResult {
  assets:    UploadedImage[];
  localUris: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function normalizeUri(uri: string): Promise<string> {
  if (!uri) throw new Error('URI image invalide');
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) return uri;
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/upload_${Date.now()}.jpg`;
  try {
    // cp gère nativement les content:// URIs Android (SAF, Google Photos, etc.) — plus fiable
    // que le fetch+base64 ci-dessous, qui échoue sur certains providers de fichiers streamés.
    await ReactNativeBlobUtil.fs.cp(uri, dest);
  } catch {
    const b64 = await ReactNativeBlobUtil.fetch('GET', uri).then(r => r.base64());
    await ReactNativeBlobUtil.fs.writeFile(dest, b64, 'base64');
  }
  return `file://${dest}`;
}

// Comme normalizeUri mais préserve l'extension d'origine (pour les fichiers non-image)
async function normalizeFileUri(uri: string, fileName: string): Promise<string> {
  if (!uri) throw new Error('URI fichier invalide');
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) return uri;
  const ext  = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/upload_${Date.now()}.${ext}`;
  try {
    // cp gère nativement les content:// URIs Android sans passer par base64
    await ReactNativeBlobUtil.fs.cp(uri, dest);
  } catch {
    // fallback base64 si cp échoue
    const b64 = await ReactNativeBlobUtil.fetch('GET', uri).then((r: any) => r.base64());
    await ReactNativeBlobUtil.fs.writeFile(dest, b64, 'base64');
  }
  return `file://${dest}`;
}

function getToken(): string | null {
  return storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

async function getPresignedUrl(folder: string, filename: string, contentType: string): Promise<{ upload_url: string; public_url: string; key?: string }> {
  const token = getToken();
  const res = await ReactNativeBlobUtil.fetch(
    'POST',
    `${API_BASE_URL}/api/v1/upload/presigned`,
    {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    JSON.stringify({ folder, filename, content_type: contentType }),
  );
  if (res.respInfo.status >= 300) {
    let detail = `Presign error ${res.respInfo.status}`;
    try { detail = (res.json() as any)?.detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

/**
 * PUT direct vers R2 avec :
 *  - streaming depuis le disque (ReactNativeBlobUtil.wrap) → jamais tout le
 *    fichier en RAM, même pour plusieurs Go
 *  - suivi de progression réel (uploadProgress) → l'utilisateur voit avancer
 *  - 3 tentatives avec backoff sur erreur réseau transitoire (l'upload direct
 *    R2 est idempotent : rejouer un PUT sur la même clé écrase, pas de doublon)
 */
async function putToR2(
  uploadUrl: string,
  filePath: string,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const path = filePath.startsWith('file://') ? filePath.slice(7) : filePath;
  const MAX_ATTEMPTS = 3;
  let lastErr: any;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const task = ReactNativeBlobUtil.fetch(
        'PUT',
        uploadUrl,
        { 'Content-Type': contentType },
        ReactNativeBlobUtil.wrap(path) as any,
      );
      if (onProgress) {
        task.uploadProgress({ interval: 250 }, (written, total) => {
          if (total > 0) onProgress(Math.min(100, Math.round((written / total) * 100)));
        });
      }
      const res = await task;
      if (res.respInfo.status >= 300) {
        throw new Error(`R2 upload error ${res.respInfo.status}`);
      }
      return;
    } catch (err: any) {
      lastErr = err;
      // Ne pas retenter sur une vraie erreur HTTP 4xx (clé invalide, etc.)
      const msg = String(err?.message ?? '');
      if (/error 4\d\d/.test(msg)) break;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise<void>(r => setTimeout(() => r(), 1000 * attempt)); // 1s, 2s
      }
    }
  }
  throw lastErr ?? new Error('R2 upload échoué');
}

// ── Images ────────────────────────────────────────────────────────────────────

async function compressAndNormalizeImage(uri: string): Promise<string> {
  const normalized = await normalizeUri(uri);
  try {
    return await CompressorImage.compress(normalized, {
      compressionMethod: 'auto',
      maxWidth:  1280,
      maxHeight: 1280,
      quality:   0.8,
      output:    'jpg',
      returnableOutputType: 'uri',
    });
  } catch {
    return normalized;
  }
}

async function uploadAsset(asset: Asset, folder: string): Promise<UploadedImage> {
  if (!asset.uri) throw new Error('URI asset manquante');
  const uri         = await compressAndNormalizeImage(asset.uri);
  const contentType = 'image/jpeg';
  const filename    = `photo_${Date.now()}.jpg`;
  const { upload_url, public_url } = await getPresignedUrl(folder, filename, contentType);
  await putToR2(upload_url, uri, contentType);
  return { url: public_url, public_id: public_url };
}

export async function uploadAssets(assets: Asset[], folder: UploadFolder): Promise<UploadedImage[]> {
  return Promise.all(assets.filter(a => a.uri).map(a => uploadAsset(a, folder)));
}

export async function pickAndUpload(folder: UploadFolder, maxImages = 5): Promise<PickResult> {
  const options: ImageLibraryOptions = { mediaType: 'photo', selectionLimit: maxImages, quality: 1 as any };
  return new Promise((resolve, reject) => {
    launchImageLibrary(options, async (response) => {
      if (response.didCancel) { resolve({ assets: [], localUris: [] }); return; }
      if (response.errorCode) { reject(new Error(response.errorMessage ?? 'Erreur galerie')); return; }
      const selected = response.assets ?? [];
      if (!selected.length) { resolve({ assets: [], localUris: [] }); return; }
      const localUris = selected.map(a => a.uri ?? '').filter(Boolean);
      try {
        const uploaded = await uploadAssets(selected, folder);
        resolve({ assets: uploaded, localUris });
      } catch (err) { reject(err); }
    });
  });
}

export async function uploadImageFromUri(
  uri: string,
  folder: UploadFolder,
  fileName?: string,
): Promise<UploadedImage> {
  const compressed = await compressAndNormalizeImage(uri);
  const token      = getToken();
  const filename   = fileName ?? `photo_${Date.now()}.jpg`;
  const path       = compressed.startsWith('file://') ? compressed.slice(7) : compressed;
  const res = await ReactNativeBlobUtil.fetch(
    'POST',
    `${API_BASE_URL}/api/v1/upload/images?folder=${folder}`,
    {
      Accept: 'application/json',
      'Content-Type': 'multipart/form-data',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    [{ name: 'file', filename, type: 'image/jpeg', data: ReactNativeBlobUtil.wrap(path) as any }],
  );
  if (res.respInfo.status >= 300) {
    let detail = `Upload error ${res.respInfo.status}`;
    try { detail = (res.json() as any)?.detail ?? detail; } catch {}
    throw new Error(detail);
  }
  const json = res.json() as any;
  const url = json?.uploaded?.[0]?.url ?? json?.url ?? json?.public_url;
  if (!url) throw new Error('Upload: pas de URL retournée');
  return { url, public_id: url };
}

export async function uploadMessageImage(uri: string, fileName?: string): Promise<UploadedImage> {
  return uploadImageFromUri(uri, 'messages', fileName);
}

export async function deleteUploadedImage(_publicId: string): Promise<void> {
  // suppression gérée côté backend si nécessaire
}

// ── Vidéo ─────────────────────────────────────────────────────────────────────

export async function uploadVideoFromUri(
  uri: string,
  folder: VideoFolder = 'reels',
  fileName?: string,
  mimeType?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadedVideo> {
  const compressed = await compressVideo(uri, { onProgress });

  const contentType = mimeType ?? 'video/mp4';
  const filename    = fileName ?? `video_${Date.now()}.mp4`;
  const token       = getToken();

  // ── Upload DIRECT client → R2 (bypass backend) pour tous les dossiers HLS ──
  // Avant : le fichier transitait par FastAPI (multipart) → goulot serveur, lent,
  // pas de reprise. Maintenant : presigned PUT direct vers R2 (2-5× plus rapide,
  // streaming disque, retry sur coupure), puis on demande juste au backend de
  // lancer le pipeline HLS avec la clé.
  if (['reels', 'stories', 'messages', 'events', 'concerts', 'content', 'posts'].includes(folder)) {
    let jobId: string | undefined;
    let data: any = {};
    try {
      // 1) presigned URL
      const presign = await getPresignedUrl(folder, filename, contentType);
      const r2Key = presign.key ?? presign.public_url.split(`${folder}/`).slice(1).join(`${folder}/`);

      // 2) PUT direct vers R2 avec progression réelle (upload = 10→70 %)
      await putToR2(presign.upload_url, compressed.uri, contentType, (pct) => {
        onProgress?.(10 + Math.round(pct * 0.6));
      });
      onProgress?.(70);

      // 3) demander la génération HLS au backend (léger, réponse immédiate)
      const procRes = await ReactNativeBlobUtil.fetch(
        'POST',
        `${API_BASE_URL}/api/v1/upload/video/process`,
        {
          Accept:         'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        JSON.stringify({ key: presign.key ?? r2Key, folder }),
      );
      if (procRes.respInfo.status >= 300) {
        let detail = `Process error ${procRes.respInfo.status}`;
        try { detail = (procRes.json() as any)?.detail ?? detail; } catch {}
        throw new Error(detail);
      }
      data = procRes.json() as any;
      jobId = data.job_id;
    } finally {
      if (compressed.isTempFile) {
        await cleanupTempVideos([compressed.uri]).catch(() => {});
      }
    }

    // Poll HLS jusqu'à done. Cadence adaptative : rapide au début (le HLS d'un
    // reel court est souvent prêt en < 15 s), plus lente ensuite pour économiser
    // les requêtes sur les longues vidéos.
    if (jobId) {
      const MAX_TOTAL_MS    = 6 * 60_000;   // 6 min de garde
      const MAX_REAL_ERRORS = 5;
      let realErrors = 0;
      let elapsed = 0;

      while (elapsed < MAX_TOTAL_MS) {
        const wait = elapsed < 20_000 ? 1_500 : elapsed < 60_000 ? 3_000 : 5_000;
        await new Promise<void>(r => setTimeout(() => r(), wait));
        elapsed += wait;
        onProgress?.(Math.min(95, 70 + Math.round((elapsed / MAX_TOTAL_MS) * 25)));
        try {
          const statusRes = await apiClient.get<any>(
            `/api/v1/upload/video/status/${jobId}`,
          );
          const status = statusRes.data;
          realErrors = 0;
          if (status.status === 'done') {
            onProgress?.(100);
            return {
              url:           status.url  ?? data.url,
              public_id:     data.public_id ?? data.url,
              job_id:        jobId,
              duration:      status.duration  ?? data.duration,
              thumbnail_url: status.thumbnail_url ?? undefined,
              hls_url:       status.hls_url   ?? undefined,
              mp4_url:       status.mp4_url   ?? undefined,
              width:         compressed.width  ?? undefined,
              height:        compressed.height ?? undefined,
            };
          }
          if (status.status === 'error') {
            throw new Error(status.detail ?? 'Erreur de traitement video cote serveur');
          }
          // status === 'processing' → continuer le poll
        } catch (pollErr: any) {
          // 404 = job pas encore écrit dans Redis (BackgroundTask pas encore exécutée)
          // On ne compte pas ça comme une vraie erreur réseau
          const is404 = pollErr?.status === 404 || pollErr?.message?.includes('404');
          if (!is404) {
            realErrors++;
            if (realErrors >= MAX_REAL_ERRORS) {
              throw new Error(`Upload interrompu apres ${MAX_REAL_ERRORS} erreurs reseau : ${pollErr?.message ?? 'erreur inconnue'}`);
            }
          }
        }
      }
      // Poll expiré — la vidéo est uploadée mais le HLS n'est pas encore prêt.
      // On retourne l'URL de base pour ne pas bloquer la publication.
      return {
        url:           data.url ?? '',
        public_id:     data.public_id ?? '',
        job_id:        jobId,
        duration:      data.duration  ?? undefined,
        thumbnail_url: data.thumbnail_url ?? undefined,
        hls_url:       data.hls_url ?? data.url ?? undefined,
        mp4_url:       data.mp4_url ?? undefined,
        width:         compressed.width  ?? undefined,
        height:        compressed.height ?? undefined,
      };
    }

    // Fallback sans jobId : hls_url si disponible
    const fallbackHls = data.hls_url ?? data.url ?? undefined;
    return {
      url:           fallbackHls ?? '',
      public_id:     data.public_id ?? '',
      duration:      data.duration  ?? undefined,
      thumbnail_url: data.thumbnail_url ?? undefined,
      hls_url:       fallbackHls,
      mp4_url:       data.mp4_url ?? undefined,
      width:         compressed.width  ?? undefined,
      height:        compressed.height ?? undefined,
    };
  }

  // Autres dossiers : presigned URL directe (pas besoin de HLS).
  // Vidéo ET thumbnail en PARALLÈLE (Promise.all) — avant : séquentiel (+1-2 s).
  onProgress?.(10);
  const thumbSrc = compressed.thumbnailUri;
  const [{ public_url }, thumbnailPublicUrl] = await Promise.all([
    (async () => {
      const p = await getPresignedUrl(folder, filename, contentType);
      await putToR2(p.upload_url, compressed.uri, contentType, (pct) => onProgress?.(10 + Math.round(pct * 0.8)));
      return p;
    })(),
    (async (): Promise<string | undefined> => {
      if (!thumbSrc) return undefined;
      try {
        const p = await getPresignedUrl(folder, `thumb_${Date.now()}.jpg`, 'image/jpeg');
        await putToR2(p.upload_url, thumbSrc, 'image/jpeg');
        const tp = thumbSrc.startsWith('file://') ? thumbSrc.slice(7) : thumbSrc;
        ReactNativeBlobUtil.fs.unlink(tp).catch(() => {});
        return p.public_url;
      } catch { return undefined; }
    })(),
  ]);
  onProgress?.(95);

  if (compressed.isTempFile) {
    await cleanupTempVideos([compressed.uri]);
  }

  return {
    url:           public_url,
    public_id:     public_url,
    duration:      compressed.durationSec,
    thumbnail_url: thumbnailPublicUrl,
    width:         compressed.width  ?? undefined,
    height:        compressed.height ?? undefined,
  };
}

export async function uploadImageAsReel(
  uri: string,
  durationSec: number = 5,
  onProgress?: (pct: number) => void,
): Promise<UploadedVideo> {
  const token    = getToken();
  const filename = `reel_photo_${Date.now()}.jpg`;
  const path     = uri.startsWith('file://') ? uri.slice(7) : uri;

  onProgress?.(10);

  const res = await ReactNativeBlobUtil.fetch(
    'POST',
    `${API_BASE_URL}/api/v1/upload/image-to-reel?duration=${durationSec}`,
    {
      Accept:         'application/json',
      'Content-Type': 'multipart/form-data',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    [{ name: 'file', filename, type: 'image/jpeg', data: ReactNativeBlobUtil.wrap(path) as any }],
  );

  if (res.respInfo.status >= 300) {
    let detail = `Upload error ${res.respInfo.status}`;
    try { detail = (res.json() as any)?.detail ?? detail; } catch {}
    throw new Error(detail);
  }

  onProgress?.(60);

  const data   = res.json() as any;
  const jobId: string | undefined = data.job_id;

  if (jobId) {
    const MAX_POLLS = 60;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise<void>(r => setTimeout(() => r(), 4000));
      onProgress?.(Math.min(95, 60 + Math.round(i * 35 / MAX_POLLS)));
      try {
        const { apiClient } = await import('../api/client');
        const status = (await apiClient.get<any>(`/api/v1/upload/video/status/${jobId}`)).data;
        if (status.status === 'done') {
          onProgress?.(100);
          return {
            url:           status.url  ?? data.url,
            public_id:     data.public_id,
            job_id:        jobId,
            duration:      durationSec,
            thumbnail_url: status.thumbnail_url ?? undefined,
            hls_url:       status.hls_url ?? undefined,
          };
        }
        if (status.status === 'error') throw new Error(status.detail ?? 'Erreur conversion image');
      } catch (e: any) {
        if (!e?.message?.includes('404')) throw e;
      }
    }
    throw new Error('Timeout conversion image→reel');
  }

  return {
    url:       data.url,
    public_id: data.public_id,
    duration:  durationSec,
    hls_url:   data.hls_url,
  };
}

export async function pickAndUploadVideo(folder: VideoFolder = 'reels'): Promise<{ video: UploadedVideo; localUri: string } | null> {
  const options: ImageLibraryOptions = { mediaType: 'video', selectionLimit: 1 };
  return new Promise((resolve, reject) => {
    launchImageLibrary(options, async (response) => {
      if (response.didCancel) { resolve(null); return; }
      if (response.errorCode) { reject(new Error(response.errorMessage ?? 'Erreur galerie')); return; }
      const asset = response.assets?.[0];
      if (!asset?.uri) { resolve(null); return; }
      try {
        const video = await uploadVideoFromUri(asset.uri, folder, asset.fileName, asset.type);
        resolve({ video, localUri: asset.uri });
      } catch (err) { reject(err); }
    });
  });
}

export async function uploadMessageVideo(uri: string, fileName?: string, mimeType?: string): Promise<UploadedVideo> {
  return uploadVideoFromUri(uri, 'messages', fileName, mimeType);
}

// ── Audio ─────────────────────────────────────────────────────────────────────

export async function uploadAudioFile(
  filePath: string,
  fileName: string,
  mimeType = 'audio/mp4',
  folder: AudioFolder = 'messages',
): Promise<UploadedAudio> {
  const normalized = await normalizeUri(filePath);
  const { upload_url, public_url } = await getPresignedUrl(folder, fileName, mimeType);
  await putToR2(upload_url, normalized, mimeType);
  return { url: public_url, public_id: public_url };
}

// Upload d'un fichier audio local (chemin absolu ou file://) vers R2
export async function uploadLocalAudio(
  localPath: string,
  originalName: string,
  folder: AudioFolder = 'reels',
): Promise<string> {
  const ext      = originalName.includes('.') ? originalName.split('.').pop()! : 'mp3';
  const fileName = `audio_${Date.now()}.${ext}`;
  const mimeType = ext === 'mp3' ? 'audio/mpeg' : ext === 'aac' ? 'audio/aac' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
  const cleanPath = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
  const { upload_url, public_url } = await getPresignedUrl(folder, fileName, mimeType);
  await putToR2(upload_url, cleanPath, mimeType);
  return public_url;
}

export interface UploadedFile {
  url:       string;
  filename:  string;
  size?:     number;
  mime_type: string;
}

export async function uploadFileFromUri(
  uri: string,
  fileName: string,
  mimeType = 'application/octet-stream',
  folder = 'messages',
): Promise<UploadedFile> {
  const normalized = await normalizeFileUri(uri, fileName);
  const { upload_url, public_url } = await getPresignedUrl(folder, fileName, mimeType);
  await putToR2(upload_url, normalized, mimeType);
  return { url: public_url, filename: fileName, mime_type: mimeType };
}

// ── Export ────────────────────────────────────────────────────────────────────

export const uploadService = {
  pickAndUpload,
  pickAndUploadVideo,
  uploadVideoFromUri,
  uploadImageFromUri,
  uploadAudioFile,
  uploadMessageImage,
  uploadMessageVideo,
  deleteUploadedImage,
};
