import { useState, useCallback } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RNBlobUtil = require('react-native-blob-util').default;

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

    const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? (isVideo ? 'mp4' : 'jpg');
    const mime = mimeForExt(ext, isVideo);
    const filename = `${isVideo ? 'video' : 'image'}_${id}.${ext}`;
    const destPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${filename}`;

    setStates(prev => ({ ...prev, [id]: { progress: 0, localUri: null, downloading: true } }));

    try {
      await RNBlobUtil.config({
        path: destPath,
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title: filename,
          description: 'Téléchargement en cours…',
          mime,
        },
      })
        .fetch('GET', url)
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
