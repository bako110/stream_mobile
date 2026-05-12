import { Video, createVideoThumbnail, getVideoMetaData } from 'react-native-compressor';
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
  thumbnailUri: string | null; // file:// path du thumbnail généré
  durationSec:  number;
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
    const thumbSrc = inputUri.startsWith('content://')
      ? `file://${(await toFileUri(inputUri)).fileUri.replace('file://', '')}`
      : inputUri.startsWith('file://') ? inputUri : `file://${inputUri}`;
    const thumb = await createVideoThumbnail(thumbSrc);
    thumbnailUri = thumb.path.startsWith('file://') ? thumb.path : `file://${thumb.path}`;
  } catch {}

  const { fileUri, isCopy } = await toFileUri(inputUri);

  const compressed = await Video.compress(
    fileUri,
    {
      compressionMethod: 'auto',
      maxSize: 1280,
      minimumFileSizeForCompress: 10,
    },
    (progress) => {
      onProgress?.(10 + Math.round(progress * 80));
    },
  );

  // Si on a fait une copie temporaire de l'original, on la supprime maintenant
  if (isCopy) {
    const copyPath = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
    ReactNativeBlobUtil.fs.unlink(copyPath).catch(() => {});
  }

  onProgress?.(90);

  // Durée réelle via metadata
  let durationSec = 60;
  try {
    const meta = await getVideoMetaData(compressed);
    if (meta.duration) durationSec = Math.round(meta.duration);
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
    segments:     [compressed],
    isTempFile:   compressed !== fileUri,
  };
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
