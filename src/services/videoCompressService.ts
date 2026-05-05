import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

const CACHE = ReactNativeBlobUtil.fs.dirs.CacheDir;

export interface CompressOptions {
  maxDurationSec?: number; // coupe à cette durée (défaut 60s)
  crf?: number;            // qualité H.264 (18=excellent, 23=pro, 28=bon) — défaut 23
  onProgress?: (pct: number) => void;
}

export interface CompressResult {
  uri:         string;  // file:// path
  durationSec: number;
  segments:    string[]; // si coupé en segments
}

/**
 * Compresse une vidéo en H.264 CRF et la coupe à maxDurationSec.
 * Retourne le path file:// du fichier compressé.
 */
export async function compressVideo(
  inputUri: string,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const { maxDurationSec = 60, crf = 23, onProgress } = opts;
  const input = inputUri.startsWith('file://') ? inputUri.slice(7) : inputUri;
  const outName = `cv_${Date.now()}.mp4`;
  const output  = `${CACHE}/${outName}`;

  // Durée réelle via ffprobe
  const duration = await probeDuration(input);

  // Construit la commande FFmpeg
  // -t coupe à maxDurationSec, -crf 23 = qualité pro, -preset fast = rapide
  // -vf scale=-2:720 = max 720p (préserve ratio), -movflags +faststart = streaming
  const durationArg = duration > maxDurationSec ? `-t ${maxDurationSec}` : '';
  const cmd = `-y -i "${input}" ${durationArg} -c:v libx264 -crf ${crf} -preset fast -vf "scale='min(1280,iw)':-2" -c:a aac -b:a 128k -movflags +faststart "${output}"`;

  onProgress?.(5);

  const session = await FFmpegKit.execute(cmd);
  const rc      = await session.getReturnCode();

  if (!ReturnCode.isSuccess(rc)) {
    const logs = await session.getAllLogsAsString();
    throw new Error(`FFmpeg error: ${logs?.slice(-300)}`);
  }

  onProgress?.(95);

  const finalDuration = Math.min(duration, maxDurationSec);
  return {
    uri:         `file://${output}`,
    durationSec: finalDuration,
    segments:    [`file://${output}`],
  };
}

/**
 * Coupe une vidéo longue en segments de segmentSec secondes.
 * Utile pour WhatsApp-style multi-segment.
 */
export async function splitVideo(
  inputUri: string,
  segmentSec = 60,
  crf = 23,
  onProgress?: (pct: number) => void,
): Promise<string[]> {
  const input    = inputUri.startsWith('file://') ? inputUri.slice(7) : inputUri;
  const duration = await probeDuration(input);
  const count    = Math.ceil(duration / segmentSec);
  const segments: string[] = [];

  for (let i = 0; i < count; i++) {
    const start   = i * segmentSec;
    const outPath = `${CACHE}/seg_${Date.now()}_${i}.mp4`;
    const cmd     = `-y -ss ${start} -t ${segmentSec} -i "${input}" -c:v libx264 -crf ${crf} -preset fast -vf "scale='min(1280,iw)':-2" -c:a aac -b:a 128k -movflags +faststart "${outPath}"`;

    const session = await FFmpegKit.execute(cmd);
    const rc      = await session.getReturnCode();
    if (!ReturnCode.isSuccess(rc)) {
      const logs = await session.getAllLogsAsString();
      throw new Error(`FFmpeg segment ${i} error: ${logs?.slice(-200)}`);
    }

    segments.push(`file://${outPath}`);
    onProgress?.(Math.round(((i + 1) / count) * 100));
  }

  return segments;
}

async function probeDuration(filePath: string): Promise<number> {
  try {
    const session = await FFmpegKit.execute(`-i "${filePath}" -f null -`);
    const logs    = await session.getAllLogsAsString() ?? '';
    const match   = logs.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    if (match) {
      return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
    }
  } catch {}
  return 60;
}

/** Supprime les fichiers temporaires générés */
export async function cleanupTempVideos(uris: string[]): Promise<void> {
  await Promise.allSettled(
    uris.map(uri => {
      const path = uri.startsWith('file://') ? uri.slice(7) : uri;
      return ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
    })
  );
}
