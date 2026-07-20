import { useState, useCallback } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { storage } from '../utils/storage';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RNBlobUtil = require('react-native-blob-util').default;

function getToken(): string | null {
  return storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

export type DlState = {
  progress: number;   // 0-100
  localUri: string | null;  // null = pas encore téléchargé
  downloading: boolean;
};

function mimeForExt(ext: string, isVideo: boolean): string {
  const imgMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  };
  const vidMap: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm',
  };
  if (isVideo) return vidMap[ext] ?? 'video/mp4';
  return imgMap[ext] ?? 'image/jpeg';
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export { fmtSize };

export function useMediaDownload() {
  const [states, setStates] = useState<Record<string, DlState>>({});

  const get = useCallback((id: string): DlState => {
    return states[id] ?? { progress: 0, localUri: null, downloading: false };
  }, [states]);

  const download = useCallback(async (id: string, url: string, isVideo: boolean) => {
    if (!url || states[id]?.downloading || states[id]?.localUri) return;

    // Aucun MP4 n'est jamais stocké côté serveur — seul le HLS existe. Pour un .m3u8,
    // le backend reconstruit le MP4 à la volée (endpoint unique réutilisé par tous les
    // écrans) et le stream directement ; sinon (image/mp4/audio déjà direct) on télécharge
    // l'URL telle quelle.
    const isHls = url.includes('.m3u8');
    const fetchUrl = isHls
      ? `${API_BASE_URL}/api/v1/upload/download?url=${encodeURIComponent(url)}`
      : url;
    const token = getToken();

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'Permission requise',
          message: 'Autoriser la sauvegarde dans vos téléchargements.',
          buttonPositive: 'Autoriser',
          buttonNegative: 'Refuser',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission refusée', 'Impossible de sauvegarder sans permission.');
        return;
      }
    }

    const ext = isHls ? 'mp4' : (url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? (isVideo ? 'mp4' : 'jpg'));
    const mime = mimeForExt(ext, isVideo);
    const filename = `${isVideo ? 'video' : 'image'}_${id}.${ext}`;
    const destPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${filename}`;

    setStates(prev => ({ ...prev, [id]: { progress: 0, localUri: null, downloading: true } }));

    try {
      await RNBlobUtil.config({
        path: destPath,
        // Reconstruction HLS→MP4 : peut prendre plusieurs secondes (téléchargement des
        // segments + remux côté serveur) avant que le premier octet de réponse arrive.
        timeout: isHls ? 120_000 : 60_000,
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title: filename,
          description: 'Téléchargement en cours…',
          mime,
        },
      })
        .fetch('GET', fetchUrl, token ? { Authorization: `Bearer ${token}` } : undefined)
        .progress((received: number, total: number) => {
          const pct = Math.round((Number(received) / Number(total)) * 100);
          setStates(prev => ({ ...prev, [id]: { progress: pct, localUri: null, downloading: true } }));
        });

      setStates(prev => ({
        ...prev,
        [id]: { progress: 100, localUri: `file://${destPath}`, downloading: false },
      }));
    } catch {
      Alert.alert('Erreur', 'Le téléchargement a échoué. Réessaie plus tard.');
      setStates(prev => ({ ...prev, [id]: { progress: 0, localUri: null, downloading: false } }));
    }
  }, [states]);

  return { get, download };
}
