/**
 * CreateReelScreen
 * Flow : choisir vidéo → éditeur plein écran → caption + détails → publier
 *
 * Règle de sécurité : UN SEUL player actif à la fois.
 * - showEditor = true  → ce composant retourne <ReelEditorScreen>, son player existe seul
 * - showEditor = false → ce composant affiche la preview avec son propre player (pausé)
 * Les deux branches sont mutuellement exclusives, jamais rendues ensemble.
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  ScrollView, Alert, Platform, StatusBar,
  Dimensions, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getVideoMetaData } from 'react-native-compressor';
import { launchImageLibrary } from 'react-native-image-picker';
import RNBlobUtil from 'react-native-blob-util';

import { useTheme } from '../../hooks/useTheme';
import { reelService } from '../../services';
import { MentionInput } from '../../components/common/MentionInput';
import { backgroundUploadService } from '../../services/backgroundUploadService';
import { ReelEditorScreen, type ReelEditResult, type FilterKey, FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2 } from './ReelEditorScreen';
import Sound from 'react-native-sound';

const { width: W, height: SCREEN_H } = Dimensions.get('window');
// Hauteur de l'aperçu vidéo/picker — plus l'espace réservé au reste de la page
// (header, carte détails, marges) ne dépasse jamais SCREEN_H, pour que toute la
// page tienne sur un seul écran sans jamais avoir besoin de scroller. Un ratio
// 16:9 plein largeur (l'ancien calcul) dépassait largement l'écran disponible
// une fois le header et la carte détails ajoutés — d'où le scroll qu'on retire ici.
// header (~60) + carte détails avec champ 72px (~110) + carte musique quand
// présente (~70) + marges — pris au plus large pour ne jamais déborder, que la
// musique soit sélectionnée ou non.
const RESERVED_FOR_REST = 300;
const PREVIEW_H = Math.min(Math.round(W * 16 / 9), SCREEN_H - RESERVED_FOR_REST);

// Limites d'upload — mêmes valeurs sur Android et iOS (le fichier source, avant trim/édition ;
// ReelEditorScreen limite ensuite le clip final à 90s via MAX_TRIM, mais la source elle-même
// doit déjà être rejetée avant tout traitement pour ne pas gaspiller réseau/mémoire pour rien).
const MAX_VIDEO_DURATION_SEC = 10 * 60;
const MAX_VIDEO_SIZE_BYTES   = 500 * 1024 * 1024;

interface Props {
  onBack: () => void;
  sourceReelId?: string;
  sourceReelUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview interne — player pausé sur la première frame, avec overlay filtre
// Séparé pour que le player soit créé seulement quand videoUri existe
// ─────────────────────────────────────────────────────────────────────────────

interface PreviewProps {
  videoUri: string;
  editResult: ReelEditResult | null;
  videoDuration: number;
  onEdit: () => void;
  onRemove: () => void;
}

const VideoPreview: React.FC<PreviewProps> = ({ videoUri, editResult, videoDuration, onEdit, onRemove }) => {
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const videoSource = useMemo(() => ({ uri: videoUri }), [videoUri]);
  const player = useVideoPlayer(videoSource, p => {
    p.loop  = false;
    p.muted = false;
  });

  const startSec = editResult?.startSec ?? 0;
  const endSec   = editResult?.endSec   ?? videoDuration;

  // Figé sur la première frame du segment sélectionné
  useEffect(() => {
    try {
      player.pause();
      player.currentTime = startSec;
      setPreviewPlaying(false);
    } catch {}
  }, [player, startSec]);

  // Stoppe le player dès qu'il dépasse endSec et rebobine au début du segment
  const endSecRef   = useRef(endSec);
  const startSecRef = useRef(startSec);
  useEffect(() => { endSecRef.current = endSec; },    [endSec]);
  useEffect(() => { startSecRef.current = startSec; }, [startSec]);

  useEffect(() => {
    const sub = player.addEventListener('onProgress', ({ currentTime: t }: { currentTime: number }) => {
      if (t >= endSecRef.current - 0.1) {
        try { player.pause(); player.currentTime = startSecRef.current; } catch {}
        setPreviewPlaying(false);
      }
    });
    return () => sub.remove();
  }, [player]);

  const togglePreviewPlay = useCallback(() => {
    if (previewPlaying) {
      player.pause();
      try { player.currentTime = startSec; } catch {}
      setPreviewPlaying(false);
    } else {
      try { player.currentTime = startSec; } catch {}
      player.play();
      setPreviewPlaying(true);
    }
  }, [previewPlaying, player, startSec]);

  // Chips résumé édition
  const editChips: { icon: string; label: string }[] = [];
  if (editResult) {
    const filterDef = FILTERS.find(f => f.key === editResult.filter);
    if (editResult.filter !== 'original') editChips.push({ icon: 'sliders', label: filterDef?.label ?? editResult.filter });
    if (editResult.speed !== 1)           editChips.push({ icon: 'zap',     label: `${editResult.speed}×` });
    if (editResult.layers.length > 0)     editChips.push({ icon: 'type',    label: `${editResult.layers.length} texte${editResult.layers.length > 1 ? 's' : ''}` });
    if ((editResult.stickers?.length ?? 0) > 0) editChips.push({ icon: 'smile', label: `${editResult.stickers.length}` });
    if ((editResult.drawings?.length ?? 0) > 0) editChips.push({ icon: 'edit-2', label: 'Dessin' });
    const trimSec = editResult.endSec - editResult.startSec;
    if (Math.abs(trimSec - videoDuration) > 1) editChips.push({ icon: 'scissors', label: `${Math.round(trimSec)}s` });
  }

  const filterDef = editResult ? FILTERS.find(f => f.key === editResult.filter) : null;
  const filterOp  = editResult ? (FILTER_VIDEO_OPACITY[editResult.filter as FilterKey] ?? 0) : 0;

  return (
    <View style={s.videoPreview}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        controls={false}
      />

      {/* Overlay filtre principal */}
      {filterDef && filterOp > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: filterDef.overlay, opacity: filterOp }]} />
      )}
      {(() => {
        const op2 = filterDef ? (FILTER_VIDEO_OPACITY2[editResult!.filter as FilterKey] ?? 0) : 0;
        return filterDef?.overlay2 && op2 > 0
          ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: filterDef.overlay2, opacity: op2 }]} />
          : null;
      })()}

      {/* Text layers en preview (non interactifs) */}
      {editResult?.layers.map(l => (
        <View key={l.id} pointerEvents="none" style={[s.previewTextLayer, { left: l.x, top: l.y }]}>
          <Text style={{
            color:             l.color,
            fontSize:          l.fontSize,
            fontWeight:        l.bold ? '800' : '400',
            fontStyle:         l.italic ? 'italic' : 'normal',
            textAlign:         l.align ?? 'center',
            backgroundColor:   l.bg && l.bgColor !== 'transparent' ? l.bgColor : 'transparent',
            paddingHorizontal: l.bg ? 10 : 0,
            paddingVertical:   l.bg ? 4 : 0,
            borderRadius:      l.bg ? 8 : 0,
            textShadowColor:   'rgba(0,0,0,0.9)',
            textShadowOffset:  { width: 0, height: 1 },
            textShadowRadius:  4,
          }}>
            {l.text}
          </Text>
        </View>
      ))}

      {/* Stickers en preview */}
      {editResult?.stickers?.map(st => (
        <View key={st.id} pointerEvents="none" style={{ position: 'absolute', left: st.x, top: st.y }}>
          <Text style={{ fontSize: 44 * (st.scale ?? 1) }}>{st.emoji}</Text>
        </View>
      ))}

      {/* Drawings en preview */}
      {editResult?.drawings?.map(path =>
        path.points.slice(0, -1).map((pt, i) => {
          const next = path.points[i + 1];
          const dx = next.x - pt.x; const dy = next.y - pt.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <View key={`${path.id}_${i}`} pointerEvents="none" style={{
              position: 'absolute', left: pt.x, top: pt.y - path.width / 2,
              width: len, height: path.width, borderRadius: path.width / 2,
              backgroundColor: path.color,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: 'left center',
            }} />
          );
        })
      )}

      {/* Video adjust overlays en preview — simulés via couches de couleur */}
      {editResult?.adjust && (() => {
        const { brightness, contrast, saturation, temperature } = editResult.adjust;
        return (
          <>
            {brightness > 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${brightness * 0.35})` }]} />}
            {brightness < 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${Math.abs(brightness) * 0.45})` }]} />}
            {temperature > 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,120,0,${temperature * 0.18})` }]} />}
            {temperature < 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,120,255,${Math.abs(temperature) * 0.18})` }]} />}
            {saturation < 0  && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(128,128,128,${Math.abs(saturation) * 0.45})` }]} />}
            {contrast   > 0  && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${contrast * 0.12})` }]} />}
          </>
        );
      })()}

      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.45)', 'transparent']} style={[StyleSheet.absoluteFill, { height: 80 }]} />
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }} />

      {/* Tap play/pause */}
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={togglePreviewPlay} activeOpacity={1}>
        {!previewPlaying && (
          <View style={s.playOverlay} pointerEvents="none">
            <View style={s.playCircle}>
              <Icon name="play" size={28} color="#fff" />
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Chips édit */}
      {editChips.length > 0 && (
        <View style={s.editChips} pointerEvents="none">
          {editChips.map((c, i) => (
            <View key={i} style={s.editChip}>
              <Icon name={c.icon} size={10} color="#fff" />
              <Text style={s.editChipTxt}>{c.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Bouton retirer */}
      <TouchableOpacity style={s.removeBtn} onPress={onRemove} activeOpacity={0.8}>
        <Icon name="x" size={16} color="#fff" />
      </TouchableOpacity>

      {/* Bouton modifier */}
      <TouchableOpacity style={s.editBtn} onPress={onEdit} activeOpacity={0.85}>
        <View style={s.editBtnInner}>
          <Icon name="edit-2" size={13} color="#fff" />
          <Text style={s.editBtnTxt}>Modifier</Text>
        </View>
      </TouchableOpacity>

      {/* Durée */}
      {videoDuration > 0 && (
        <View style={s.durationBadge} pointerEvents="none">
          <Icon name="clock" size={10} color="#fff" />
          <Text style={s.durationTxt}>
            {editResult ? `${Math.round(editResult.endSec - editResult.startSec)}s` : `${Math.round(videoDuration)}s`}
          </Text>
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export const CreateReelScreen: React.FC<Props> = ({ onBack, sourceReelId, sourceReelUrl }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [caption,           setCaption]           = useState('');
  const [category,          setCategory]          = useState<string | null>(null);
  const [captionMentionIds, setCaptionMentionIds] = useState<string[]>([]);
  // Remix : sourceReelUrl est une URL distante (mp4_url/hls_url) — jamais utilisée
  // directement comme videoUri, on attend le téléchargement local (voir effect ci-dessous).
  const isRemoteSource = !!sourceReelUrl && /^https?:\/\//.test(sourceReelUrl);
  const [videoUri,          setVideoUri]          = useState<string | null>(isRemoteSource ? null : sourceReelUrl ?? null);
  const [videoThumb,        setVideoThumb]        = useState<string | null>(null);
  const [videoDuration,     setVideoDuration]     = useState(0);
  const [loadingMeta,       setLoadingMeta]       = useState(false);
  const [showEditor,        setShowEditor]        = useState(!!sourceReelUrl && !isRemoteSource);
  const [downloadingSource, setDownloadingSource] = useState(isRemoteSource);
  const [downloadError,     setDownloadError]     = useState<string | null>(null);
  const [editResult,        setEditResult]        = useState<ReelEditResult | null>(null);
  const [trimmedVideoUri,   setTrimmedVideoUri]   = useState<string | null>(null);
  const [isTrimming,        setIsTrimming]        = useState(false);
  const [isPhotoReel,       setIsPhotoReel]       = useState(false);
  const editResultRef     = useRef<ReelEditResult | null>(null);
  const trimmedVideoUriRef = useRef<string | null>(null);

  // ── Preview musique ────────────────────────────────────────────────────────
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewSoundRef = useRef<Sound | null>(null);

  const stopPreviewSound = useCallback(() => {
    if (previewSoundRef.current) {
      previewSoundRef.current.stop();
      previewSoundRef.current.release();
      previewSoundRef.current = null;
    }
    setPreviewPlaying(false);
  }, []);

  const togglePreviewMusic = useCallback(() => {
    if (previewPlaying) { stopPreviewSound(); return; }
    const uri = editResultRef.current?.musicUri;
    const startSec = editResultRef.current?.musicStartSec ?? 0;
    if (!uri) { console.warn('[previewMusic] no uri in editResultRef'); return; }
    Sound.setCategory('Playback');
    // uri est déjà un chemin absolu (résolu par resolveAudioUri dans l'éditeur)
    const cleanUri = uri.startsWith('file://') ? uri.slice(7) : uri;
    console.log('[previewMusic] loading:', cleanUri, 'from:', startSec);
    // '' = chemin absolu sur Android (react-native-sound détecte via File.exists())
    const snd = new Sound(cleanUri, '', err => {
      if (err) {
        console.warn('[previewMusic] Sound error:', err, 'uri:', cleanUri);
        snd.release();
        return;
      }
      console.log('[previewMusic] loaded, duration:', snd.getDuration());
      snd.setCurrentTime(startSec);
      previewSoundRef.current = snd;
      setPreviewPlaying(true);
      snd.play(success => {
        if (!success) console.warn('[previewMusic] playback failed');
        setPreviewPlaying(false);
        previewSoundRef.current = null;
        snd.release();
      });
    });
  }, [previewPlaying, stopPreviewSound]);

  // Stoppe le son quand on repart vers l'éditeur ou qu'on démonte
  useEffect(() => () => { stopPreviewSound(); }, [stopPreviewSound]);

  // Stoppe si editResult change (nouveau son ou suppression)
  useEffect(() => { stopPreviewSound(); }, [editResult, stopPreviewSound]);

  // Charge la durée de la vidéo source en arrière-plan
  useEffect(() => {
    if (!sourceReelUrl) return;
    getVideoMetaData(sourceReelUrl)
      .then(meta => setVideoDuration(meta.duration ?? 60))
      .catch(() => setVideoDuration(60));
  }, [sourceReelUrl]);

  // Remix : télécharge la vidéo source en local avant d'ouvrir l'éditeur — les filtres/trim
  // et l'upload final manipulent un fichier local, jamais un flux/URL distante directement
  // (c'était la cause du remix qui n'appliquait pas les filtres et échouait à l'upload).
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
        setShowEditor(true);
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

  // ── Picker ─────────────────────────────────────────────────────────────────
  const handlePickVideo = useCallback(() => {
    launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1 }, async res => {
      if (res.didCancel) return;
      if (res.errorCode) {
        Alert.alert('Erreur', res.errorMessage ?? 'Impossible de sélectionner la vidéo.');
        return;
      }
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      const isImage = asset.type?.startsWith('image/') || (!asset.duration && !asset.uri.match(/\.(mp4|mov|avi|mkv|webm)$/i));

      setLoadingMeta(true);

      if (isImage) {
        setIsPhotoReel(true);
        setVideoUri(asset.uri);
        setVideoThumb(asset.uri);
        setVideoDuration(5);
        setEditResult(null);
        setLoadingMeta(false);
        setShowEditor(true);
        return;
      }

      setIsPhotoReel(false);
      let dur = asset.duration ?? 0;
      if (!dur || dur < 0.5) {
        try { const meta = await getVideoMetaData(asset.uri); dur = meta.duration ?? 0; } catch {}
      }
      if (!dur) dur = 30;

      if (dur > MAX_VIDEO_DURATION_SEC) {
        setLoadingMeta(false);
        Alert.alert(
          'Vidéo trop longue',
          `La vidéo dure ${Math.round(dur / 60)} min. La durée maximale autorisée est de 10 minutes.`,
        );
        return;
      }
      if ((asset.fileSize ?? 0) > MAX_VIDEO_SIZE_BYTES) {
        setLoadingMeta(false);
        Alert.alert(
          'Fichier trop volumineux',
          `Cette vidéo pèse ${(asset.fileSize! / (1024 * 1024)).toFixed(0)} Mo. La taille maximale autorisée est de ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)} Mo.`,
        );
        return;
      }

      setVideoUri(asset.uri);
      setVideoThumb(asset.uri);
      setVideoDuration(dur);
      setEditResult(null);
      setLoadingMeta(false);
      setShowEditor(true);
    });
  }, []);

  const handleRemove = useCallback(() => {
    Alert.alert('Retirer la vidéo ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer', style: 'destructive', onPress: () => {
          setVideoUri(null);
          setVideoDuration(0);
          setEditResult(null);
          editResultRef.current = null;
          setTrimmedVideoUri(null);
          trimmedVideoUriRef.current = null;
          setShowEditor(false);
        },
      },
    ]);
  }, []);

  const handleEditorConfirm = useCallback(async (result: ReelEditResult) => {
    editResultRef.current = result;
    setEditResult(result);
    setShowEditor(false);

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
        Alert.alert('Erreur trim', e?.message ?? 'Impossible de découper la vidéo.');
      } finally {
        setIsTrimming(false);
      }
    } else {
      trimmedVideoUriRef.current = null;
      setTrimmedVideoUri(null);
    }
  }, [videoUri, videoDuration]);

  const handleEditorCancel = useCallback(() => {
    setShowEditor(false);
    // Si c'est un remix et qu'on annule l'éditeur sans avoir confirmé,
    // on reste sur la preview de la vidéo source (ne pas effacer)
    if (!editResult && videoUri && !sourceReelUrl) {
      setVideoUri(null);
      setVideoDuration(0);
    }
  }, [editResult, videoUri, sourceReelUrl]);

  const handlePublish = useCallback(() => {
    if (!videoUri) return;

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

    onBack();

    const snap = publishRef.current;
    if (!snap) return;

    // ── Photo reel : upload direct via image-to-reel, pas de backgroundUploadService ──
    if (snapIsPhoto) {
      const { uploadImageAsReel, uploadLocalAudio } = require('../../services/uploadService');
      uploadImageAsReel(snap.uri, 5).then(async (result: any) => {
        if (!result.hls_url) {
          Alert.alert('Publication echouee', 'La conversion image→video a echoue. Reessaie.');
          return;
        }
        try {
          const { edit } = snap;

          // Upload l'audio local vers R2 si présent
          let musicPublicUrl: string | undefined;
          if (edit?.musicUri) {
            try {
              musicPublicUrl = await uploadLocalAudio(
                edit.musicUri,
                edit.musicName || 'audio.mp3',
              );
            } catch (audioErr) {
              console.warn('[publish] audio upload failed, skipping music:', audioErr);
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
        } catch (err: any) {
          Alert.alert('Publication echouee', err?.message ?? 'Erreur inconnue.');
        }
      }).catch((err: any) => {
        Alert.alert('Publication echouee', 'La conversion de l\'image a echoue. Reessaie dans quelques secondes.');
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
          Alert.alert(
            'Publication echouee',
            'La video a ete uploadee mais le lien de lecture est manquant. Reessaie dans quelques minutes.',
          );
          return;
        }
        const { edit, dur, cap, category: snapCategory, mentionIds } = snap;
        try {
          // Upload l'audio local vers R2 si présent
          let musicPublicUrl: string | undefined;
          if (edit?.musicUri) {
            try {
              const { uploadLocalAudio } = await import('../../services/uploadService');
              musicPublicUrl = await uploadLocalAudio(
                edit.musicUri,
                edit.musicName || 'audio.mp3',
              );
            } catch (audioErr) {
              console.warn('[publish] audio upload failed, skipping music:', audioErr);
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
          Alert.alert(
            'Publication echouee',
            err?.message ?? 'Erreur inconnue lors de la creation du reel.',
          );
        }
      },
      onError: (err) => {
        Alert.alert(
          'Upload echoue',
          err?.message ?? 'Erreur inconnue lors de l\'upload de la video.',
        );
      },
    });
  }, [videoUri, caption, captionMentionIds, editResult, videoDuration, onBack, sourceReelId, isPhotoReel]);

  // ── Téléchargement de la vidéo source (remix) — avant même l'éditeur ────────
  if (downloadingSource) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color={colors.primary} />
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

  // ── ÉDITEUR — branch exclusive, aucun player dans ce composant quand rendu ─
  if (showEditor && videoUri) {
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

  const canPublish = !!videoUri && !loadingMeta;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ══ HEADER ══ */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[s.headerClose, { backgroundColor: colors.backgroundSecondary }]}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="x" size={19} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{sourceReelId ? 'Remixer' : 'Nouveau Reel'}</Text>
        <TouchableOpacity
          style={[s.publishBtn, { opacity: canPublish ? 1 : 0.4 }]}
          onPress={handlePublish}
          disabled={!canPublish}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#7B3FF2', '#C026D3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.publishBtnInner}>
            <Icon name="send" size={14} color="#fff" />
            <Text style={s.publishBtnTxt}>Publier</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Page fixe, non scrollable — PREVIEW_H est calculé pour que le reste
          (carte détails + marges) tienne toujours dans l'espace restant.
          KeyboardAvoidingView reste utile pour ne pas laisser le clavier
          recouvrir le champ description sans pour autant introduire de scroll. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.page}>

          {/* ══ ZONE VIDÉO ══ */}
          <View style={s.videoSection}>
            {videoUri ? (
              isPhotoReel ? (
                // Preview image fixe
                <View style={s.videoPreview}>
                  <Image source={{ uri: videoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <View style={[s.pickerGrid, { opacity: 0 }]} pointerEvents="none" />
                  <TouchableOpacity style={s.removeBtn} onPress={handleRemove} activeOpacity={0.8}>
                    <Icon name="x" size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.editBtn} onPress={() => setShowEditor(true)} activeOpacity={0.85}>
                    <View style={s.editBtnInner}>
                      <Icon name="sliders" size={13} color="#fff" />
                      <Text style={s.editBtnTxt}>Modifier</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={[s.durationBadge, { backgroundColor: 'rgba(123,63,242,0.8)' }]} pointerEvents="none">
                    <Icon name="image" size={10} color="#fff" />
                    <Text style={s.durationTxt}>Photo · 5s</Text>
                  </View>
                  {previewPlaying && editResult?.musicName ? (
                    <View style={s.nowPlayingBadge} pointerEvents="none">
                      <Icon name="music" size={10} color="#fff" />
                      <Text style={s.nowPlayingTxt} numberOfLines={1}>{editResult.musicName}</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
              <VideoPreview
                videoUri={trimmedVideoUri ?? videoUri}
                editResult={trimmedVideoUri ? null : editResult}
                videoDuration={
                  trimmedVideoUri && editResult
                    ? editResult.endSec - editResult.startSec
                    : videoDuration
                }
                onEdit={() => setShowEditor(true)}
                onRemove={handleRemove}
              />
              )
            ) : (
              <TouchableOpacity style={s.videoPicker} onPress={handlePickVideo} activeOpacity={0.9} disabled={loadingMeta}>
                {/* Fond dégradé sombre */}
                <LinearGradient
                  colors={['#0D0A1A', '#1A0D2E', '#0D0A1A']}
                  style={StyleSheet.absoluteFill}
                />

                {/* Grille décorative */}
                <View style={s.pickerGrid} pointerEvents="none">
                  {[0,1,2,3,4,5].map(i => (
                    <View key={i} style={[s.pickerGridCell, { opacity: 0.06 + (i % 3) * 0.03 }]}>
                      <Icon name={i % 2 === 0 ? 'video' : 'image'} size={22} color="#fff" />
                    </View>
                  ))}
                </View>

                {loadingMeta ? (
                  <View style={s.pickerInner}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={[s.pickerLabel, { color: 'rgba(255,255,255,0.6)' }]}>Lecture des informations…</Text>
                  </View>
                ) : (
                  <View style={s.pickerInner} pointerEvents="none">
                    <LinearGradient
                      colors={['#7B3FF2', '#C026D3']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={s.pickerIconWrap}
                    >
                      <Icon name="video" size={30} color="#fff" />
                    </LinearGradient>

                    <Text style={s.pickerLabel}>Ajouter une vidéo</Text>
                    <Text style={s.pickerSub}>MP4 · max 90 s · 1080p recommandé</Text>

                    <View style={s.pickerCta}>
                      <Icon name="image" size={16} color="#fff" />
                      <Text style={s.pickerCtaTxt}>Ouvrir la galerie</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* ══ DÉTAILS ══ */}
          <View style={[s.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.fieldRow}>
              <View style={s.fieldIcon}><Icon name="align-left" size={15} color={colors.textSecondary} /></View>
              <View style={{ flex: 1 }}>
                {/* maxHeight plafonne la croissance du champ multiline — sans ça,
                    un texte long ferait grandir la carte et déborder la page fixe
                    (voir RESERVED_FOR_REST plus haut, calculé pour cette hauteur). */}
                <MentionInput
                  value={caption}
                  onChangeText={(text, ids) => { setCaption(text); setCaptionMentionIds(ids); }}
                  colors={colors}
                  placeholder="Décris ton reel… #hashtag @mention"
                  maxLength={300}
                  inputStyle={{ fontSize: 14, lineHeight: 21, minHeight: 72, maxHeight: 72 }}
                />
                <Text style={[s.charCount, { color: colors.textTertiary }]}>{caption.length}/300</Text>
              </View>
            </View>
          </View>

          {/* ══ MUSIQUE SÉLECTIONNÉE ══ */}
          {editResult?.musicUri ? (
            <View style={[s.musicCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity style={s.musicPlayBtn} onPress={togglePreviewMusic} activeOpacity={0.8}>
                <Icon name={previewPlaying ? 'pause' : 'play'} size={14} color="#fff" />
              </TouchableOpacity>
              <View style={s.musicCardLeft}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.musicCardLabel, { color: colors.textSecondary }]}>Son ajouté</Text>
                  <Text style={[s.musicCardName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {editResult.musicName || 'Son sélectionné'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={s.musicCardEdit} onPress={() => { stopPreviewSound(); setShowEditor(true); }} activeOpacity={0.8}>
                <Icon name="edit-2" size={14} color="#7B3FF2" />
              </TouchableOpacity>
            </View>
          ) : null}

        </View>
      </KeyboardAvoidingView>

      {isTrimming && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <ActivityIndicator size="large" color="#7B3FF2" />
          <Text style={{ color: '#fff', marginTop: 12, fontWeight: '600', fontSize: 15 }}>Découpage en cours…</Text>
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  headerClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  publishBtn: { borderRadius: 22, overflow: 'hidden' },
  publishBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9 },
  publishBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  videoSection: { width: W },
  videoPreview: { width: W, height: PREVIEW_H, backgroundColor: '#000', overflow: 'hidden' },
  previewTextLayer: { position: 'absolute', zIndex: 8 },

  playOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  playCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },

  editChips: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(123,63,242,0.85)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  editChipTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },

  removeBtn: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  editBtn: { position: 'absolute', bottom: 14, right: 14, borderRadius: 20, overflow: 'hidden' },
  editBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(123,63,242,0.88)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  editBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  durationBadge: { position: 'absolute', bottom: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  durationTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  nowPlayingBadge: { position: 'absolute', top: 14, left: 14, right: 60, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(123,63,242,0.88)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  nowPlayingTxt: { color: '#fff', fontSize: 11, fontWeight: '700', flex: 1 },

  videoPicker:    { width: W, height: PREVIEW_H, overflow: 'hidden', backgroundColor: '#08060F' },
  pickerGrid:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap' },
  pickerGridCell: { width: W / 3, height: PREVIEW_H / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  pickerInner:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  pickerIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  pickerLabel:    { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 0.2, textAlign: 'center' },
  pickerSub:      { fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: -4 },
  pickerActions:  { flexDirection: 'row', gap: 12, marginTop: 16 },
  pickerBtnPrimary: { borderRadius: 28, overflow: 'hidden' },
  pickerBtnGrad:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 14 },
  pickerBtnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pickerCta:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 26, marginTop: 16, backgroundColor: 'rgba(123,63,242,0.85)', borderWidth: 1, borderColor: 'rgba(192,38,211,0.5)' },
  pickerCtaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  detailsCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  fieldIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  fieldLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  divider:    { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  charCount:  { fontSize: 11, textAlign: 'right', marginTop: 4, opacity: 0.6 },

  musicCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, gap: 12 },
  musicCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  musicPlayBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  musicCardLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 1 },
  musicCardName: { fontSize: 13, fontWeight: '700' },
  musicCardEdit: { padding: 6 },
});
