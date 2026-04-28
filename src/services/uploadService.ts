/**
 * Service d'upload d'images vers Cloudinary via le backend FoliX.
 *
 * Usage :
 *   const result = await uploadService.pickAndUpload('concerts');
 *   // result = [{ url, public_id, width, height, format }]
 *
 * Dépendances natives :
 *   - react-native-image-picker (launchImageLibrary)
 */
import { launchImageLibrary } from 'react-native-image-picker';
import type { ImageLibraryOptions, Asset } from 'react-native-image-picker';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { apiClient, Endpoints } from '../api';

export type UploadFolder = 'concerts' | 'events' | 'avatars' | 'reels' | 'stories' | 'messages';
export type VideoFolder = 'reels' | 'stories' | 'messages';

/**
 * Copie un fichier content:// vers un chemin file:// en cache.
 * En mode dev, le bridge JS ne résout pas les URIs content:// pour FormData.
 * En release/build, le réseau natif le gère directement.
 */
async function normalizeUri(uri: string): Promise<string> {
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) return uri;
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/upload_${Date.now()}.tmp`;
  try {
    await ReactNativeBlobUtil.fs.cp(uri, dest);
  } catch {
    // cp peut échouer sur certains content:// — fallback lecture base64
    const data = await ReactNativeBlobUtil.fs.readFile(uri, 'base64');
    await ReactNativeBlobUtil.fs.writeFile(dest, data, 'base64');
  }
  return `file://${dest}`;
}

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

export interface PickResult {
  assets: UploadedImage[];
  /** Images sélectionnées localement (avant upload — pour preview immédiate) */
  localUris: string[];
}

/**
 * Ouvre la galerie, laisse l'utilisateur choisir jusqu'à `maxImages` images,
 * les uploade toutes sur Cloudinary et retourne les URLs distantes.
 */
export async function pickAndUpload(
  folder: UploadFolder,
  maxImages: number = 5,
): Promise<PickResult> {
  const options: ImageLibraryOptions = {
    mediaType:        'photo',
    selectionLimit:   maxImages,
    quality:          0.85 as any,
    includeBase64:    false,
  };

  return new Promise((resolve, reject) => {
    launchImageLibrary(options, async (response) => {
      if (response.didCancel) {
        resolve({ assets: [], localUris: [] });
        return;
      }
      if (response.errorCode) {
        reject(new Error(response.errorMessage ?? 'Erreur galerie'));
        return;
      }

      const selected = response.assets ?? [];
      if (selected.length === 0) {
        resolve({ assets: [], localUris: [] });
        return;
      }

      const localUris = selected.map(a => a.uri ?? '').filter(Boolean);

      try {
        const uploaded = await uploadAssets(selected, folder);
        resolve({ assets: uploaded, localUris });
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Upload un tableau d'Asset react-native-image-picker vers le backend. */
async function uploadAssets(assets: Asset[], folder: UploadFolder): Promise<UploadedImage[]> {
  const formData = new FormData();

  for (const asset of assets) {
    if (!asset.uri) continue;
    const fileUri = await normalizeUri(asset.uri);
    formData.append('files', {
      uri:  fileUri,
      name: asset.fileName ?? `photo_${Date.now()}.jpg`,
      type: asset.type    ?? 'image/jpeg',
    } as any);
  }

  const endpoint = Endpoints.upload.images(folder);
  const result = await apiClient.upload<{ uploaded: UploadedImage[] }>(endpoint, formData);
  return result.data?.uploaded ?? [];
}

/** Supprime une image Cloudinary via le backend. */
export async function deleteUploadedImage(publicId: string): Promise<void> {
  await apiClient.delete(Endpoints.upload.deleteImage, {
    body: { public_id: publicId },
  } as any);
}

/**
 * Ouvre la galerie vidéo, laisse l'utilisateur choisir une vidéo,
 * l'uploade sur Cloudinary et retourne l'URL + thumbnail + durée.
 */
export async function pickAndUploadVideo(
  folder: VideoFolder = 'reels',
): Promise<{ video: UploadedVideo; localUri: string } | null> {
  const options: ImageLibraryOptions = {
    mediaType:      'video',
    selectionLimit: 1,
    videoQuality:   'medium' as any,

  };

  return new Promise((resolve, reject) => {
    launchImageLibrary(options, async (response) => {
      if (response.didCancel) {
        resolve(null);
        return;
      }
      if (response.errorCode) {
        reject(new Error(response.errorMessage ?? 'Erreur galerie'));
        return;
      }

      const asset = response.assets?.[0];
      if (!asset?.uri) {
        resolve(null);
        return;
      }

      try {
        const fileUri = await normalizeUri(asset.uri);
        const formData = new FormData();
        formData.append('file', {
          uri:  fileUri,
          name: asset.fileName ?? `video_${Date.now()}.mp4`,
          type: asset.type    ?? 'video/mp4',
        } as any);

        const endpoint = Endpoints.upload.video(folder);
        const result = await apiClient.upload<UploadedVideo>(endpoint, formData);
        resolve({ video: result.data, localUri: asset.uri });
      } catch (err) {
        reject(err);
      }
    });
  });
}

export interface UploadedAudio {
  url:       string;
  public_id: string;
  duration?: number;
  format?:   string;
}

/**
 * Upload un fichier audio (vocal) vers Cloudinary via le backend.
 */
export async function uploadAudioFile(
  filePath: string,
  fileName: string,
  mimeType: string = 'audio/mp4',
): Promise<UploadedAudio> {
  const fileUri = await normalizeUri(filePath);
  const formData = new FormData();
  formData.append('file', {
    uri:  fileUri,
    name: fileName,
    type: mimeType,
  } as any);

  const endpoint = Endpoints.upload.audio('messages');
  const result = await apiClient.upload<UploadedAudio>(endpoint, formData);
  return result.data;
}

/**
 * Upload une image pour un message (depuis un uri local).
 */
export async function uploadMessageImage(
  uri: string,
  fileName?: string,
  mimeType?: string,
): Promise<UploadedImage> {
  const fileUri = await normalizeUri(uri);
  const formData = new FormData();
  formData.append('files', {
    uri:  fileUri,
    name: fileName ?? `msg_img_${Date.now()}.jpg`,
    type: mimeType ?? 'image/jpeg',
  } as any);

  const endpoint = Endpoints.upload.images('messages');
  const result = await apiClient.upload<{ uploaded: UploadedImage[] }>(endpoint, formData);
  return result.data?.uploaded?.[0];
}

/**
 * Upload une vidéo depuis un URI local vers le backend (sans ouvrir la galerie).
 */
export async function uploadVideoFromUri(
  uri: string,
  folder: VideoFolder = 'reels',
  fileName?: string,
  mimeType?: string,
): Promise<UploadedVideo> {
  const fileUri = await normalizeUri(uri);
  const filePath = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
  const endpoint = Endpoints.upload.video(folder);

  const { storage } = await import('../utils/storage');
  const { STORAGE_KEYS, API_BASE_URL } = await import('../utils/constants');
  const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'multipart/form-data',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await ReactNativeBlobUtil.fetch(
    'POST',
    `${API_BASE_URL}${endpoint}`,
    headers,
    [{
      name:     'file',
      filename: fileName ?? `video_${Date.now()}.mp4`,
      type:     mimeType ?? 'video/mp4',
      data:     ReactNativeBlobUtil.wrap(filePath),
    }],
  );

  const status = response.respInfo.status;
  const json   = response.json();
  if (status < 200 || status >= 300) {
    throw new Error(json?.detail ?? json?.message ?? 'Upload vidéo échoué');
  }
  return json as UploadedVideo;
}

/**
 * Upload une vidéo pour un message (depuis un uri local).
 */
export async function uploadMessageVideo(
  uri: string,
  fileName?: string,
  mimeType?: string,
): Promise<UploadedVideo> {
  const fileUri = await normalizeUri(uri);
  const formData = new FormData();
  formData.append('file', {
    uri:  fileUri,
    name: fileName ?? `msg_video_${Date.now()}.mp4`,
    type: mimeType ?? 'video/mp4',
  } as any);

  const endpoint = Endpoints.upload.video('messages');
  const result = await apiClient.upload<UploadedVideo>(endpoint, formData);
  return result.data;
}

export const uploadService = {
  pickAndUpload,
  pickAndUploadVideo,
  uploadVideoFromUri,
  deleteUploadedImage,
  uploadAudioFile,
  uploadMessageImage,
  uploadMessageVideo,
};
