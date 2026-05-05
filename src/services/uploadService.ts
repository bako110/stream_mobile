import { launchImageLibrary } from 'react-native-image-picker';
import type { ImageLibraryOptions, Asset } from 'react-native-image-picker';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { storage } from '../utils/storage';
import { compressVideo, cleanupTempVideos } from './videoCompressService';

export type UploadFolder = 'concerts' | 'events' | 'avatars' | 'reels' | 'stories' | 'messages' | 'posts' | 'communities' | 'content';
export type VideoFolder  = 'reels' | 'stories' | 'messages' | 'events' | 'concerts' | 'content';
export type AudioFolder  = 'messages' | 'stories';

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
  duration?:      number;
  thumbnail_url?: string;
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
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) return uri;
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/upload_${Date.now()}.tmp`;
  try {
    await ReactNativeBlobUtil.fs.cp(uri, dest);
  } catch {
    const data = await ReactNativeBlobUtil.fs.readFile(uri, 'base64');
    await ReactNativeBlobUtil.fs.writeFile(dest, data, 'base64');
  }
  return `file://${dest}`;
}

function getToken(): string | null {
  return storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

async function getPresignedUrl(folder: string, filename: string, contentType: string): Promise<{ upload_url: string; public_url: string }> {
  const token = getToken();
  console.log('[upload] getPresignedUrl', { folder, filename, contentType, hasToken: !!token });
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
  console.log('[upload] presign status', res.respInfo.status, res.data);
  if (res.respInfo.status >= 300) {
    const err = res.json();
    throw new Error(err?.detail ?? `Presign error ${res.respInfo.status}`);
  }
  return res.json();
}

async function putToR2(uploadUrl: string, filePath: string, contentType: string): Promise<void> {
  const path = filePath.startsWith('file://') ? filePath.slice(7) : filePath;
  console.log('[upload] putToR2', { uploadUrl: uploadUrl.slice(0, 60), path, contentType });
  const res = await ReactNativeBlobUtil.fetch(
    'PUT',
    uploadUrl,
    { 'Content-Type': contentType },
    ReactNativeBlobUtil.wrap(path) as any,
  );
  console.log('[upload] R2 PUT status', res.respInfo.status);
  if (res.respInfo.status >= 300) {
    throw new Error(`R2 upload error ${res.respInfo.status}`);
  }
}

// ── Images ────────────────────────────────────────────────────────────────────

async function uploadAsset(asset: Asset, folder: string): Promise<UploadedImage> {
  const uri         = await normalizeUri(asset.uri!);
  const contentType = asset.type ?? 'image/jpeg';
  const filename    = asset.fileName ?? `photo_${Date.now()}.jpg`;
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
  mimeType?: string,
): Promise<UploadedImage> {
  const normalized  = await normalizeUri(uri);
  const contentType = mimeType ?? 'image/jpeg';
  const filename    = fileName ?? `photo_${Date.now()}.jpg`;
  const { upload_url, public_url } = await getPresignedUrl(folder, filename, contentType);
  await putToR2(upload_url, normalized, contentType);
  return { url: public_url, public_id: public_url };
}

export async function uploadMessageImage(uri: string, fileName?: string, mimeType?: string): Promise<UploadedImage> {
  return uploadImageFromUri(uri, 'messages', fileName, mimeType);
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
  // Compression H.264 CRF 23 avant upload
  const compressed = await compressVideo(uri, { crf: 23, onProgress });
  const tempUri    = compressed.uri;

  const contentType = mimeType ?? 'video/mp4';
  const filename    = fileName ?? `video_${Date.now()}.mp4`;
  const { upload_url, public_url } = await getPresignedUrl(folder, filename, contentType);
  await putToR2(upload_url, tempUri, contentType);

  await cleanupTempVideos([tempUri]);
  return { url: public_url, public_id: public_url, duration: compressed.durationSec };
}

export async function pickAndUploadVideo(folder: VideoFolder = 'reels'): Promise<{ video: UploadedVideo; localUri: string } | null> {
  const options: ImageLibraryOptions = { mediaType: 'video', selectionLimit: 1, videoQuality: 'high' as any };
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
