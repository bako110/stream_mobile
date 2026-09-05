/**
 * CreateReelScreen
 * Flow en 4 étapes façon TikTok :
 *   1. camera  → StoryCameraScreen (caméra live photo + vidéo + galerie,
 *                partagée avec les stories — tap = photo, appui long = vidéo)
 *   2. edit    → ReelEditorScreen (filtres, texte, trim, musique...)
 *   3. caption → CreateCaptionScreen (description)
 *   4. recap   → CreateRecapScreen (aperçu final + Publier)
 *
 * Règle de sécurité : UN SEUL player actif à la fois — chaque étape est une
 * branche de rendu exclusive (return anticipé), jamais deux montées ensemble.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { getVideoMetaData } from 'react-native-compressor';
import RNBlobUtil from 'react-native-blob-util';
import Icon from 'react-native-vector-icons/Feather';

import { useTheme } from '../../hooks/useTheme';
import { reelService, toastService } from '../../services';
import { GofolyxLoader } from '../../components/common';
import { backgroundUploadService } from '../../services/backgroundUploadService';
import { ReelEditorScreen, type ReelEditResult } from './ReelEditorScreen';
import { StoryCameraScreen, type StoryCameraResult } from './StoryCameraScreen';
import { CreateCaptionScreen } from './CreateCaptionScreen';
import { CreateRecapScreen } from './CreateRecapScreen';
import Sound from 'react-native-sound';

// Limites d'upload — le fichier source, avant trim/édition ; ReelEditorScreen
// limite ensuite le clip final à 90s via MAX_TRIM, mais la source elle-même
// doit déjà être rejetée avant tout traitement pour ne pas gaspiller réseau/mémoire.
const MAX_VIDEO_DURATION_SEC = 10 * 60;
const MAX_VIDEO_SIZE_BYTES   = 500 * 1024 * 1024;

type Step = 'camera' | 'edit' | 'caption' | 'recap';

interface Props {
  onBack: () => void;
  sourceReelId?: string;
  sourceReelUrl?: string;
}

export const CreateReelScreen: React.FC<Props> = ({ onBack, sourceReelId, sourceReelUrl }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  // Remix : sourceReelUrl est une URL distante (mp4_url/hls_url) — jamais utilisée
  // directement comme videoUri, on attend le téléchargement local (voir effect ci-dessous).
  const isRemoteSource = !!sourceReelUrl && /^https?:\/\//.test(sourceReelUrl);

  const [step,              setStep]              = useState<Step>(isRemoteSource ? 'camera' : sourceReelUrl ? 'edit' : 'camera');
  const [caption,           setCaption]           = useState('');
  const [category]                                = useState<string | null>(null);
  const [captionMentionIds, setCaptionMentionIds] = useState<string[]>([]);
  const [videoUri,          setVideoUri]          = useState<string | null>(isRemoteSource ? null : sourceReelUrl ?? null);
  const [videoThumb,        setVideoThumb]        = useState<string | null>(null);
  const [videoDuration,     setVideoDuration]     = useState(0);
  const [downloadingSource, setDownloadingSource] = useState(isRemoteSource);
  const [downloadError,     setDownloadError]     = useState<string | null>(null);
  const [editResult,        setEditResult]        = useState<ReelEditResult | null>(null);
  const [trimmedVideoUri,   setTrimmedVideoUri]   = useState<string | null>(null);
  const [isTrimming,        setIsTrimming]        = useState(false);
  const [isPhotoReel,       setIsPhotoReel]       = useState(false);
  const [publishing,        setPublishing]        = useState(false);
  const editResultRef      = useRef<ReelEditResult | null>(null);
  const trimmedVideoUriRef = useRef<string | null>(null);

  // ── Preview musique (utilisée par CreateRecapScreen via togglePreviewMusic
  //    indirectement — conservé pour l'arrêt propre du son à la sortie) ──────
  const previewSoundRef = useRef<Sound | null>(null);
  const stopPreviewSound = useCallback(() => {
    if (previewSoundRef.current) {
      previewSoundRef.current.stop();
      previewSoundRef.current.release();
      previewSoundRef.current = null;
    }
  }, []);
  useEffect(() => () => { stopPreviewSound(); }, [stopPreviewSound]);

  // Charge la durée de la vidéo source en arrière-plan (remix)
  useEffect(() => {
    if (!sourceReelUrl) return;
    getVideoMetaData(sourceReelUrl)
      .then(meta => setVideoDuration(meta.duration ?? 60))
      .catch(() => setVideoDuration(60));
  }, [sourceReelUrl]);

  // Remix : télécharge la vidéo source en local avant d'ouvrir l'éditeur — les filtres/trim
  // et l'upload final manipulent un fichier local, jamais un flux/URL distante directement.
  useEffect(() => {
    if (!isRemoteSource || !sourceReelUrl) return;
    let cancelled = false;
    setDownloadingSource(true);
    setDownloadError(null);

    (async () => {
      try {
        const ext      = sourceReelUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
        const destPath = `${RNBlobUtil.fs.dirs.CacheDir}/remix_${Date.now()}.${ext}`;
        await RNBlobUtil.config({ path: destPath, overwrite: true, timeout: 30000 }).fetch('GET', sourceReelUrl);
        const stat = await RNBlobUtil.fs.stat(destPath).catch(() => null);
        if (!stat || parseInt(String(stat.size), 10) === 0) throw new Error('Fichier vide');
        if (cancelled) return;

        const localUri = `file://${destPath}`;
        setVideoUri(localUri);
        setVideoThumb(localUri);
        setStep('edit');
      } catch (e: any) {
        if (cancelled) return;
        setDownloadError(e?.message ?? 'Impossible de télécharger la vidéo source.');
      } finally {
        if (!cancelled) setDownloadingSource(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isRemoteSource, sourceReelUrl]);

  const publishRef = useRef<{
    uri: string; cap: string; category?: string; mentionIds: string[];
    edit: ReelEditResult | null; dur: number;
  } | null>(null);

  // ── Étape 1 : caméra / galerie ───────────────────────────────────────────
  const handleCameraPicked = useCallback(async (picked: StoryCameraResult) => {
    if (picked.isPhoto) {
      setIsPhotoReel(true);
      setVideoUri(picked.uri);
      setVideoThumb(picked.uri);
      setVideoDuration(5);
      setEditResult(null);
      setStep('edit');
      return;
    }

    setIsPhotoReel(false);
    let dur = 0;
    try { const meta = await getVideoMetaData(picked.uri); dur = meta.duration ?? 0; } catch {}
    if (!dur) dur = 30;

    if (dur > MAX_VIDEO_DURATION_SEC) {
      toastService.error(
        'Vidéo trop longue',
        `La vidéo dure ${Math.round(dur / 60)} min. La durée maximale autorisée est de 10 minutes.`,
      );
      return;
    }

    setVideoUri(picked.uri);
    setVideoThumb(picked.uri);
    setVideoDuration(dur);
    setEditResult(null);
    setStep('edit');
  }, []);

  // ── Étape 2 : éditeur ─────────────────────────────────────────────────────
  const handleEditorConfirm = useCallback(async (result: ReelEditResult) => {
    editResultRef.current = result;
    setEditResult(result);
    setStep('caption');

    const hasTrim = result.startSec > 0.5 || result.endSec < videoDuration - 0.5;
    if (hasTrim && videoUri) {
      setIsTrimming(true);
      try {
        const { trimVideo } = await import('../../services/videoCompressService');
        const cutUri = await trimVideo(videoUri, result.startSec, result.endSec);
        trimmedVideoUriRef.current = cutUri;
        setTrimmedVideoUri(cutUri);
      } catch (e: any) {
        console.error('[trimVideo] ERREUR:', e?.message ?? e);
        toastService.error('Erreur trim', e?.message ?? 'Impossible de découper la vidéo.');
      } finally {
        setIsTrimming(false);
      }
    } else {
      trimmedVideoUriRef.current = null;
      setTrimmedVideoUri(null);
    }
  }, [videoUri, videoDuration]);

  const handleEditorCancel = useCallback(() => {
    // Remix : ne jamais effacer la source, revenir juste en arrière visuellement
    // n'a pas de sens ici (pas d'étape avant l'éditeur) — on quitte l'écran.
    if (sourceReelUrl) { onBack(); return; }
    setVideoUri(null);
    setVideoDuration(0);
    setStep('camera');
  }, [sourceReelUrl, onBack]);

  // ── Étape 3 : description ────────────────────────────────────────────────
  const handleCaptionChange = useCallback((text: string, mentionIds: string[]) => {
    setCaption(text);
    setCaptionMentionIds(mentionIds);
  }, []);

  // ── Étape 4 : récap + publication ────────────────────────────────────────
  const handlePublish = useCallback(() => {
    if (!videoUri || publishing) return;
    setPublishing(true);

    const freshEdit = editResultRef.current;
    const freshTrimmedUri = trimmedVideoUriRef.current;
    const hasTrim = !!(freshEdit && (freshEdit.startSec > 0.5 || freshEdit.endSec < videoDuration - 0.5));
    const snapIsPhoto = isPhotoReel;

    publishRef.current = {
      uri:        freshTrimmedUri ?? videoUri,
      cap:        caption.trim(),
      category:   category ?? undefined,
      mentionIds: [...captionMentionIds],
      edit:       freshEdit,
      dur:        hasTrim && freshEdit ? freshEdit.endSec - freshEdit.startSec : videoDuration,
    };

    const snap = publishRef.current;
    if (!snap) { setPublishing(false); return; }

    onBack();

    // ── Photo reel : conversion image→vidéo + création, suivie par une pill
    //    "Reel en cours d'envoi…" en haut de l'écran (via track). ──────────────
    if (snapIsPhoto) {
      const { uploadImageAsReel, uploadLocalAudio } = require('../../services/uploadService');
      backgroundUploadService.track('reel', snap.cap || 'Nouveau Reel', async () => {
        const result: any = await uploadImageAsReel(snap.uri, 5);
        if (!result.hls_url) {
          toastService.error('Publication echouee', 'La conversion image→video a echoue. Reessaie.');
          throw new Error('image_to_reel_failed');
        }
        {
          const { edit } = snap;

          // Un son choisi depuis "Mes sons" (catalogue déjà en base) est une URL
          // http(s) directement utilisable — le ré-uploader comme un fichier local
          // échouait silencieusement (URL non lisible comme un chemin de fichier),
          // ce qui faisait disparaître la musique choisie à la publication.
          let musicPublicUrl: string | undefined;
          if (edit?.musicUri) {
            if (/^https?:\/\//i.test(edit.musicUri)) {
              musicPublicUrl = edit.musicUri;
            } else {
              try {
                musicPublicUrl = await uploadLocalAudio(edit.musicUri, edit.musicName || 'audio.mp3');
              } catch (audioErr) {
                console.warn('[publish] audio upload failed, skipping music:', audioErr);
              }
            }
          }

          await reelService.create({
            hls_url:       result.hls_url,
            mp4_url:       result.mp4_url,
            caption:       snap.cap || undefined,
            category:      snap.category,
            thumbnail_url: result.thumbnail_url,
            duration_sec:  5,
            mention_ids:   snap.mentionIds.length ? snap.mentionIds : undefined,
            ...(edit && edit.filter !== 'original' ? { filter:         edit.filter   } : {}),
            ...(edit && edit.layers.length > 0   ? { text_layers:    JSON.stringify(edit.layers)    } : {}),
            ...(edit && edit.stickers.length > 0 ? { sticker_layers: JSON.stringify(edit.stickers) } : {}),
            ...(edit && edit.drawings.length > 0 ? { draw_layers:    JSON.stringify(edit.drawings)  } : {}),
            ...(edit && Object.values(edit.adjust).some(v => v !== 0) ? { video_adjust: JSON.stringify(edit.adjust) } : {}),
            ...(musicPublicUrl ? {
              music_url:       musicPublicUrl,
              music_name:      edit?.musicName,
              music_start_sec: edit?.musicStartSec,
              music_end_sec:   edit?.musicEndSec,
            } : {}),
          });
        }
      }).catch((err: any) => {
        if (err?.message !== 'image_to_reel_failed') {
          toastService.error('Publication echouee', err?.message ?? "La conversion de l'image a echoue. Reessaie dans quelques secondes.");
        }
      });
      return;
    }

    backgroundUploadService.enqueueVideo({
      localUri: snap.uri,
      folder:   'reels',
      type:     'reel',
      label:    snap.cap || 'Nouveau Reel',
      onDone: async (result) => {
        const playUrl = result.hlsUrl ?? result.videoUrl;
        if (!playUrl) {
          toastService.error(
            'Publication echouee',
            'La video a ete uploadee mais le lien de lecture est manquant. Reessaie dans quelques minutes.',
          );
          return;
        }
        const { edit, dur, cap, category: snapCategory, mentionIds } = snap;
        try {
          // Un son choisi depuis "Mes sons" (catalogue déjà en base) est une URL
          // http(s) directement utilisable — le ré-uploader comme un fichier local
          // échouait silencieusement (URL non lisible comme un chemin de fichier),
          // ce qui faisait disparaître la musique choisie à la publication.
          let musicPublicUrl: string | undefined;
          if (edit?.musicUri) {
            if (/^https?:\/\//i.test(edit.musicUri)) {
              musicPublicUrl = edit.musicUri;
            } else {
              try {
                const { uploadLocalAudio } = await import('../../services/uploadService');
                musicPublicUrl = await uploadLocalAudio(edit.musicUri, edit.musicName || 'audio.mp3');
              } catch (audioErr) {
                console.warn('[publish] audio upload failed, skipping music:', audioErr);
              }
            }
          }

          await reelService.create({
            hls_url:       playUrl,
            mp4_url:       result.mp4Url ?? undefined,
            caption:       cap || undefined,
            category:      snapCategory,
            thumbnail_url: result.thumbnailUrl,
            duration_sec:  result.durationSec ? Math.round(result.durationSec) : Math.round(dur),
            mention_ids:   mentionIds.length ? mentionIds : undefined,
            ...(edit && edit.speed !== 1           ? { playback_speed: edit.speed    } : {}),
            ...(edit && edit.filter !== 'original' ? { filter:         edit.filter   } : {}),
            ...(edit && edit.layers.length > 0   ? { text_layers:    JSON.stringify(edit.layers)    } : {}),
            ...(edit && edit.stickers.length > 0 ? { sticker_layers: JSON.stringify(edit.stickers) } : {}),
            ...(edit && edit.drawings.length > 0 ? { draw_layers:    JSON.stringify(edit.drawings)  } : {}),
            ...(edit && Object.values(edit.adjust).some(v => v !== 0) ? { video_adjust: JSON.stringify(edit.adjust) } : {}),
            ...(musicPublicUrl ? {
              music_url:        musicPublicUrl,
              music_name:       edit?.musicName,
              music_start_sec:  edit?.musicStartSec,
              music_end_sec:    edit?.musicEndSec,
            } : {}),
            ...(sourceReelId ? { source_reel_id: sourceReelId, remix_type: 'remix' as const } : {}),
          });
        } catch (err: any) {
          toastService.error('Publication echouee', err?.message ?? 'Erreur inconnue lors de la creation du reel.');
        }
      },
      onError: (err) => {
        toastService.error('Upload echoue', err?.message ?? "Erreur inconnue lors de l'upload de la video.");
      },
    });
  }, [videoUri, publishing, caption, captionMentionIds, category, videoDuration, onBack, sourceReelId, isPhotoReel]);

  // ── Téléchargement de la vidéo source (remix) — avant même l'éditeur ────────
  if (downloadingSource) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <GofolyxLoader color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 16, fontSize: 14 }}>Préparation de la vidéo…</Text>
      </View>
    );
  }

  if (downloadError) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <Icon name="alert-triangle" size={40} color={colors.error ?? '#EF4444'} />
        <Text style={{ color: colors.textPrimary, marginTop: 16, fontSize: 15, textAlign: 'center', fontWeight: '600' }}>
          Impossible de préparer la vidéo
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 6, fontSize: 13, textAlign: 'center' }}>{downloadError}</Text>
        <TouchableOpacity onPress={onBack} style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── ÉTAPE 1 — Caméra / galerie ───────────────────────────────────────────
  if (step === 'camera') {
    return (
      <StoryCameraScreen
        onBack={onBack}
        onCaptured={handleCameraPicked}
        maxDurationSec={MAX_VIDEO_DURATION_SEC}
      />
    );
  }

  // ── ÉTAPE 2 — Éditeur (branche exclusive, aucun autre player monté) ──────
  if (step === 'edit' && videoUri) {
    return (
      <ReelEditorScreen
        uri={videoUri}
        durationSec={videoDuration}
        thumbnailUri={videoThumb ?? undefined}
        initialResult={editResult ?? undefined}
        isPhoto={isPhotoReel}
        onConfirm={handleEditorConfirm}
        onCancel={handleEditorCancel}
      />
    );
  }

  // ── ÉTAPE 3 — Description ────────────────────────────────────────────────
  // Le découpage (isTrimming) peut encore tourner en arrière-plan ici — il démarre
  // dès la confirmation de l'éditeur, avant même d'arriver sur cette étape. On
  // bloque le passage à l'étape 4 tant qu'il n'est pas fini, sinon CreateRecapScreen
  // afficherait la vidéo NON coupée (trimmedVideoUri encore null) sans le signaler.
  if (step === 'caption') {
    return (
      <>
        <CreateCaptionScreen
          thumbnailUri={videoThumb}
          isPhoto={isPhotoReel}
          caption={caption}
          onCaptionChange={handleCaptionChange}
          onBack={() => setStep('edit')}
          onNext={() => { if (!isTrimming) setStep('recap'); }}
        />
        {isTrimming && (
          <View style={s.trimOverlay}>
            <GofolyxLoader variant="reel" color="#7B3FF2" />
            <Text style={{ color: '#fff', marginTop: 12, fontWeight: '600', fontSize: 15 }}>Découpage en cours…</Text>
          </View>
        )}
      </>
    );
  }

  // ── ÉTAPE 4 — Récapitulatif + publication ────────────────────────────────
  if (step === 'recap' && videoUri) {
    return (
      <CreateRecapScreen
        mediaUri={trimmedVideoUri ?? videoUri}
        isPhoto={isPhotoReel}
        thumbnailUri={videoThumb}
        caption={caption}
        editResult={editResult}
        videoDuration={videoDuration}
        isRemix={!!sourceReelId}
        publishing={publishing}
        onBack={() => setStep('caption')}
        onEditCaption={() => setStep('caption')}
        onPublish={handlePublish}
      />
    );
  }

  return null;
};

const s = StyleSheet.create({
  root: { flex: 1 },
  trimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
});
