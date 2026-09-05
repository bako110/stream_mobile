import { Video, createVideoThumbnail, getVideoMetaData } from 'react-native-compressor';
import { trim as nativeTrim } from 'react-native-video-trim';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';

const CACHE = ReactNativeBlobUtil.fs.dirs.CacheDir;

export interface CompressOptions {
  maxDurationSec?: number;
  crf?: number;
  onProgress?: (pct: number) => void;
}

export interface CompressResult {
  uri:          string;
  thumbnailUri: string | null;
  durationSec:  number;
  width:        number | null;
  height:       number | null;
  segments:     string[];
  isTempFile:   boolean;
}

/** Copie un content:// Android vers le cache (react-native-compressor en a besoin) */
async function toFileUri(uri: string): Promise<{ fileUri: string; isCopy: boolean }> {
  if (Platform.OS === 'android' && uri.startsWith('content://')) {
    const dest = `${CACHE}/upload_${Date.now()}.mp4`;
    try {
      await ReactNativeBlobUtil.fs.cp(uri, dest);
    } catch {
      const data = await ReactNativeBlobUtil.fs.readFile(uri, 'base64');
      await ReactNativeBlobUtil.fs.writeFile(dest, data, 'base64');
    }
    return { fileUri: `file://${dest}`, isCopy: true };
  }
  const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
  return { fileUri, isCopy: false };
}

export async function compressVideo(
  inputUri: string,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const { onProgress } = opts;

  // Génère le thumbnail depuis l'URI original AVANT compression —
  // le player natif iOS/Android décode les frames source sans frame noire initiale.
  // On essaie d'abord avec l'URI tel quel, puis avec file:// si content://
  let thumbnailUri: string | null = null;
  try {
    // Normalise vers file:// sans jamais doubler le préfixe
    let thumbSrc = inputUri;
    if (inputUri.startsWith('content://')) {
      thumbSrc = (await toFileUri(inputUri)).fileUri;
    } else if (!inputUri.startsWith('file://')) {
      thumbSrc = `file://${inputUri}`;
    }
    const thumb = await createVideoThumbnail(thumbSrc);
    thumbnailUri = thumb.path.startsWith('file://') ? thumb.path : `file://${thumb.path}`;
  } catch {}

  const { fileUri, isCopy } = await toFileUri(inputUri);

  // Taille source — si la vidéo est déjà légère, on saute la compression
  // (react-native-compressor réencode TOUT même quand c'est inutile → 10-60 s
  // perdues). Seuil : 25 Mo. Au-delà, on compresse mais avec des réglages
  // "rapides" plutôt que 'auto' (qui vise une qualité max coûteuse).
  let srcSizeMB = Infinity;
  try {
    const p = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
    const stat = await ReactNativeBlobUtil.fs.stat(p);
    srcSizeMB = Number(stat.size) / (1024 * 1024);
  } catch {}

  let compressed: string;
  if (srcSizeMB <= 25) {
    // Pas de recompression : upload direct de la source.
    compressed = fileUri;
    onProgress?.(90);
  } else {
    compressed = await Video.compress(
      fileUri,
      {
        // 'manual' + bitrate cible : bien plus rapide que 'auto' pour un rendu
        // équivalent en feed. ~2.5 Mbps @ 1080p reste net à l'échelle mobile.
        compressionMethod: 'manual',
        maxSize: 1280,
        bitrate: 2_500_000,
        minimumFileSizeForCompress: 25,
      },
      (progress) => {
        onProgress?.(10 + Math.round(progress * 80));
      },
    );
  }

  // Si on a fait une copie temporaire de l'original, on la supprime maintenant
  if (isCopy) {
    const copyPath = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
    ReactNativeBlobUtil.fs.unlink(copyPath).catch(() => {});
  }

  onProgress?.(90);

  // Durée et dimensions réelles via metadata
  let durationSec = 0;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await getVideoMetaData(compressed);
    if (meta.duration && meta.duration > 0) durationSec = Math.round(meta.duration);
    if (meta.width  && meta.width  > 0) width  = meta.width;
    if (meta.height && meta.height > 0) height = meta.height;
  } catch {}

  // Si le thumbnail n'a pas pu être généré depuis l'original, fallback sur la vidéo compressée
  if (!thumbnailUri) {
    try {
      const thumb = await createVideoThumbnail(compressed);
      thumbnailUri = thumb.path.startsWith('file://') ? thumb.path : `file://${thumb.path}`;
    } catch {}
  }

  return {
    uri:          compressed,
    thumbnailUri,
    durationSec,
    width,
    height,
    segments:     [compressed],
    isTempFile:   compressed !== fileUri,
  };
}

export interface TrimInfo {
  uri: string;
  startSec: number;
  endSec: number;
}

/**
 * Coupe une vidéo localement avant l'upload.
 * Utilise les APIs natives iOS/Android (AVFoundation / MediaMuxer) — pas de ré-encodage.
 * Retourne l'URI du fichier coupé (fichier temporaire à nettoyer après upload).
 */
export async function trimVideo(
  inputUri: string,
  startSec: number,
  endSec: number,
): Promise<string> {
  const { fileUri, isCopy } = await toFileUri(inputUri);
  const path = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;

  const result = await nativeTrim(path, {
    startTime: Math.round(startSec * 1000),
    endTime:   Math.round(endSec   * 1000),
    outputExt: 'mp4',
  });

  if (isCopy) {
    ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
  }

  if (!result.success || !result.outputPath) {
    throw new Error('Trim échoué');
  }

  return result.outputPath.startsWith('file://')
    ? result.outputPath
    : `file://${result.outputPath}`;
}

export async function splitVideo(
  inputUri: string,
  _segmentSec = 60,
  _crf = 23,
  onProgress?: (pct: number) => void,
): Promise<string[]> {
  const { uri } = await compressVideo(inputUri, { onProgress });
  return [uri];
}

export async function cleanupTempVideos(uris: string[]): Promise<void> {
  await Promise.allSettled(
    uris.map(uri => {
      const path = uri.startsWith('file://') ? uri.slice(7) : uri;
      return ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
    }),
  );
}
