import { useState, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { storage } from '../utils/storage';
import { downloadToastService } from '../services/downloadToastService';
import { toastService } from '../services';

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

    // WRITE_EXTERNAL_STORAGE n'existe plus au-delà d'Android 9 (API 29) — déclarée avec
    // maxSdkVersion="29" dans le Manifest, donc PermissionsAndroid.request() la refuse
    // systématiquement sur Android 10+ (scoped storage), peu importe le choix utilisateur.
    // Le dossier public Téléchargements (RNBlobUtil.fs.dirs.DownloadDir) est déjà accessible
    // en écriture sans permission depuis Android 10+ : ne demander qu'en dessous.
    if (Platform.OS === 'android' && Platform.Version < 29) {
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
        toastService.error('Permission refusée', 'Impossible de sauvegarder sans permission.');
        return;
      }
    }

    const ext = isHls ? 'mp4' : (url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? (isVideo ? 'mp4' : 'jpg'));
    const mime = mimeForExt(ext, isVideo);
    // Nom lisible pour l'utilisateur — l'id technique (UUID/hash) ne doit jamais apparaître
    // dans le fichier téléchargé, seulement servir de clé interne pour suivre la progression.
    const filename = `GoFolyX_${isVideo ? 'video' : 'image'}_${Date.now()}.${ext}`;
    const destPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${filename}`;

    setStates(prev => ({ ...prev, [id]: { progress: 0, localUri: null, downloading: true } }));
    // Toast global — visible sur n'importe quel écran, pas seulement celui qui a lancé le
    // téléchargement, et disparaît automatiquement une fois terminé.
    downloadToastService.start(id);

    try {
      await RNBlobUtil.config({
        path: destPath,
        // Reconstruction HLS→MP4 : peut prendre plusieurs secondes (téléchargement des
        // segments + remux côté serveur) avant que le premier octet de réponse arrive.
        timeout: isHls ? 120_000 : 60_000,
        // useDownloadManager délègue la requête au DownloadManager natif Android, qui ne
        // gère pas fiablement le header Authorization custom ni une réponse chunked sans
        // Content-Length connu à l'avance (cas de l'endpoint HLS→MP4, streamée dynamiquement
        // côté serveur) — la requête échouait silencieusement, restant bloquée à 0% avant de
        // finir en erreur. RNBlobUtil gère lui-même le fetch + la notification à la place.
        addAndroidDownloads: {
          useDownloadManager: false,
          notification: true,
          title: filename,
          description: 'Téléchargement en cours…',
          mime,
        },
      })
        .fetch('GET', fetchUrl, token ? { Authorization: `Bearer ${token}` } : undefined)
        .progress((received: number, total: number) => {
          // total vaut 0/NaN pour une réponse sans Content-Length (streaming HLS→MP4) —
          // dans ce cas on ne peut pas connaître le pourcentage réel, mais on ne doit
          // jamais figer l'affichage à 0% : on progresse quand même visuellement par
          // paliers croissants pour montrer que le téléchargement avance réellement.
          const tot = Number(total);
          const rec = Number(received);
          const pct = tot > 0
            ? Math.min(99, Math.round((rec / tot) * 100))
            : Math.min(95, Math.round(Math.log10(Math.max(rec, 1) / 1024 + 1) * 30));
          setStates(prev => ({ ...prev, [id]: { progress: pct, localUri: null, downloading: true } }));
          downloadToastService.update(id, pct);
        });

      setStates(prev => ({
        ...prev,
        [id]: { progress: 100, localUri: `file://${destPath}`, downloading: false },
      }));
      downloadToastService.finish(id);
    } catch {
      toastService.error('Erreur', 'Le téléchargement a échoué. Réessaie plus tard.');
      setStates(prev => ({ ...prev, [id]: { progress: 0, localUri: null, downloading: false } }));
      downloadToastService.fail(id);
    }
  }, [states]);

  return { get, download };
}
