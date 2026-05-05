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

  // Génère le thumbnail depuis la vidéo compressée
  let thumbnailUri: string | null = null;
  try {
    const thumb = await createVideoThumbnail(compressed);
    thumbnailUri = thumb.path.startsWith('file://') ? thumb.path : `file://${thumb.path}`;
  } catch {}

  // Durée réelle via metadata
  let durationSec = 60;
  try {
    const meta = await getVideoMetaData(compressed);
    if (meta.duration) durationSec = Math.round(meta.duration);
  } catch {}

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
