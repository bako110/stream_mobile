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
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Platform, StatusBar,
  Dimensions, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getVideoMetaData } from 'react-native-compressor';
import { launchImageLibrary } from 'react-native-image-picker';

import { useTheme } from '../../hooks/useTheme';
import { reelService } from '../../services';
import { MentionInput } from '../../components/common/MentionInput';
import { backgroundUploadService } from '../../services/backgroundUploadService';
import { ReelEditorScreen, type ReelEditResult, type FilterKey } from './ReelEditorScreen';

const { width: W } = Dimensions.get('window');
const PREVIEW_H = Math.round(W * 16 / 9);

interface Props {
  onBack: () => void;
  sourceReelId?: string;
  sourceReelUrl?: string;
}

// Correspondance filtre → overlay couleur (doit rester synchro avec ReelEditorScreen)
const FILTER_OVERLAY: Record<FilterKey, { color: string; opacity: number }> = {
  original: { color: 'transparent', opacity: 0 },
  vivid:    { color: '#FF3CAC',     opacity: 0.15 },
  warm:     { color: '#FF7E00',     opacity: 0.18 },
  cold:     { color: '#00BFFF',     opacity: 0.18 },
  fade:     { color: '#FFFFFF',     opacity: 0.20 },
  noir:     { color: '#000000',     opacity: 0.55 },
  drama:    { color: '#1A003A',     opacity: 0.35 },
  golden:   { color: '#FFD700',     opacity: 0.14 },
};

const FILTER_LABELS: Record<FilterKey, string> = {
  original: 'Normal',
  vivid:    'Vivid',
  warm:     'Warm',
  cold:     'Cold',
  fade:     'Fade',
  noir:     'Noir',
  drama:    'Drama',
  golden:   'Golden',
};

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

  // Seeké au début, jamais autoplay
  useEffect(() => {
    try { player.pause(); player.currentTime = 0; } catch {}
  }, [player]);

  const togglePreviewPlay = useCallback(() => {
    if (previewPlaying) {
      player.pause();
      setPreviewPlaying(false);
    } else {
      try { player.currentTime = editResult ? editResult.startSec : 0; } catch {}
      player.play();
      setPreviewPlaying(true);
    }
  }, [previewPlaying, player, editResult]);

  // Chips résumé édition
  const editChips: { icon: string; label: string }[] = [];
  if (editResult) {
    if (editResult.filter !== 'original') editChips.push({ icon: 'sliders', label: FILTER_LABELS[editResult.filter] });
    if (editResult.speed !== 1)           editChips.push({ icon: 'zap',     label: `${editResult.speed}×` });
    if (editResult.layers.length > 0)     editChips.push({ icon: 'type',    label: `${editResult.layers.length} texte${editResult.layers.length > 1 ? 's' : ''}` });
    const trimSec = editResult.endSec - editResult.startSec;
    if (Math.abs(trimSec - videoDuration) > 1) editChips.push({ icon: 'scissors', label: `${Math.round(trimSec)}s` });
  }

  const filterOv = editResult ? FILTER_OVERLAY[editResult.filter] : null;

  return (
    <View style={s.videoPreview}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        controls={false}
      />

      {/* Overlay filtre — reflète ce que l'utilisateur a choisi dans l'éditeur */}
      {filterOv && filterOv.opacity > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: filterOv.color, opacity: filterOv.opacity }]} />
      )}
      {editResult?.filter === 'noir' && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 0.45 }]} />
      )}

      {/* Text layers en preview (non interactifs) */}
      {editResult?.layers.map(l => (
        <View key={l.id} pointerEvents="none" style={[s.previewTextLayer, { left: l.x, top: l.y }]}>
          <Text style={{
            color:             l.color,
            fontSize:          l.fontSize,
            fontWeight:        l.bold ? '800' : '400',
            textAlign:         l.align ?? 'center',
            backgroundColor:   l.bg ? 'rgba(0,0,0,0.6)' : 'transparent',
            paddingHorizontal: l.bg ? 10 : 0,
            paddingVertical:   l.bg ? 4 : 0,
            borderRadius:      l.bg ? 6 : 0,
            textShadowColor:   'rgba(0,0,0,0.9)',
            textShadowOffset:  { width: 0, height: 1 },
            textShadowRadius:  4,
          }}>
            {l.text}
          </Text>
        </View>
      ))}

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
  const [captionMentionIds, setCaptionMentionIds] = useState<string[]>([]);
  const [videoUri,          setVideoUri]          = useState<string | null>(sourceReelUrl ?? null);
  const [videoDuration,     setVideoDuration]     = useState(0);
  const [loadingMeta,       setLoadingMeta]       = useState(false);
  const [showEditor,        setShowEditor]        = useState(!!sourceReelUrl);
  const [editResult,        setEditResult]        = useState<ReelEditResult | null>(null);

  // Charge la durée de la vidéo source en arrière-plan
  useEffect(() => {
    if (!sourceReelUrl) return;
    getVideoMetaData(sourceReelUrl)
      .then(meta => setVideoDuration(meta.duration ?? 60))
      .catch(() => setVideoDuration(60));
  }, [sourceReelUrl]);

  const publishRef = useRef<{
    uri: string; cap: string; mentionIds: string[];
    edit: ReelEditResult | null; dur: number;
  } | null>(null);

  // ── Picker ─────────────────────────────────────────────────────────────────
  const handlePickVideo = useCallback(() => {
    launchImageLibrary({ mediaType: 'video', selectionLimit: 1 }, async res => {
      if (res.didCancel) return;
      if (res.errorCode) {
        Alert.alert('Erreur', res.errorMessage ?? 'Impossible de sélectionner la vidéo.');
        return;
      }
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      setLoadingMeta(true);
      let dur = asset.duration ?? 0;
      if (!dur || dur < 0.5) {
        try { const meta = await getVideoMetaData(asset.uri); dur = meta.duration ?? 0; } catch {}
      }
      if (!dur) dur = 30;

      setVideoUri(asset.uri);
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
          setShowEditor(false);
        },
      },
    ]);
  }, []);

  const handleEditorConfirm = useCallback((result: ReelEditResult) => {
    setEditResult(result);
    setShowEditor(false);
  }, []);

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

    publishRef.current = {
      uri:        videoUri,
      cap:        caption.trim(),
      mentionIds: [...captionMentionIds],
      edit:       editResult,
      dur:        videoDuration,
    };

    onBack();

    const snap = publishRef.current;
    if (!snap) return;

    backgroundUploadService.enqueueVideo({
      localUri: snap.uri,
      folder:   'reels',
      type:     'reel',
      label:    snap.cap || 'Nouveau Reel',
      onDone: async (result) => {
        if (!result.hlsUrl) return;
        const { edit, dur, cap, mentionIds } = snap;
        await reelService.create({
          hls_url:       result.hlsUrl,
          caption:       cap || undefined,
          thumbnail_url: result.thumbnailUrl,
          duration_sec:  result.durationSec ? Math.round(result.durationSec) : undefined,
          mention_ids:   mentionIds.length ? mentionIds : undefined,
          ...(edit && edit.startSec > 0.5        ? { trim_start:     Math.round(edit.startSec * 1000) } : {}),
          ...(edit && edit.endSec   < dur - 0.5  ? { trim_end:       Math.round(edit.endSec   * 1000) } : {}),
          ...(edit && edit.speed !== 1           ? { playback_speed: edit.speed    } : {}),
          ...(edit && edit.filter !== 'original' ? { filter:         edit.filter   } : {}),
          ...(sourceReelId ? { source_reel_id: sourceReelId, remix_type: 'remix' as const } : {}),
        });
      },
      onError: (err) => { console.warn('[CreateReel] upload error:', err.message); },
    });
  }, [videoUri, caption, captionMentionIds, editResult, videoDuration, onBack, sourceReelId]);

  // ── ÉDITEUR — branch exclusive, aucun player dans ce composant quand rendu ─
  if (showEditor && videoUri) {
    return (
      <ReelEditorScreen
        uri={videoUri}
        durationSec={videoDuration}
        initialResult={editResult ?? undefined}
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ══ ZONE VIDÉO ══ */}
          <View style={s.videoSection}>
            {videoUri ? (
              // Preview avec player pausé — seul player actif dans cette branche
              <VideoPreview
                videoUri={videoUri}
                editResult={editResult}
                videoDuration={videoDuration}
                onEdit={() => setShowEditor(true)}
                onRemove={handleRemove}
              />
            ) : (
              <TouchableOpacity style={s.videoPicker} onPress={handlePickVideo} activeOpacity={0.8} disabled={loadingMeta}>
                <LinearGradient colors={[colors.gradientStart + '22', colors.gradientEnd + '18']} style={StyleSheet.absoluteFill} />
                {loadingMeta ? (
                  <>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[s.pickerLabel, { color: colors.textSecondary }]}>Lecture des informations…</Text>
                  </>
                ) : (
                  <>
                    <View style={[s.pickerIconWrap, { backgroundColor: colors.primary + '22' }]}>
                      <Icon name="video" size={32} color={colors.primary} />
                    </View>
                    <Text style={[s.pickerLabel, { color: colors.textPrimary }]}>Choisir une vidéo</Text>
                    <Text style={[s.pickerSub, { color: colors.textTertiary }]}>MP4 · max 90 s · 1080p recommandé</Text>
                    <View style={[s.pickerCta, { backgroundColor: colors.primary }]}>
                      <Icon name="upload" size={15} color="#fff" />
                      <Text style={s.pickerCtaTxt}>Depuis la galerie</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* ══ DÉTAILS ══ */}
          <View style={[s.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.fieldRow}>
              <View style={s.fieldIcon}><Icon name="align-left" size={15} color={colors.textSecondary} /></View>
              <View style={{ flex: 1 }}>
                <MentionInput
                  value={caption}
                  onChangeText={(text, ids) => { setCaption(text); setCaptionMentionIds(ids); }}
                  colors={colors}
                  placeholder="Décris ton reel… #hashtag @mention"
                  maxLength={300}
                  inputStyle={{ fontSize: 14, lineHeight: 21, minHeight: 72 }}
                />
                <Text style={[s.charCount, { color: colors.textTertiary }]}>{caption.length}/300</Text>
              </View>
            </View>
            <View style={[s.divider, { backgroundColor: colors.divider }]} />
            <View style={s.fieldRow}>
              <View style={s.fieldIcon}><Icon name="globe" size={15} color={colors.textSecondary} /></View>
              <Text style={[s.fieldLabel, { color: colors.textPrimary }]}>Tout le monde</Text>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </View>
            <View style={[s.divider, { backgroundColor: colors.divider }]} />
            <View style={s.fieldRow}>
              <View style={s.fieldIcon}><Icon name="message-circle" size={15} color={colors.textSecondary} /></View>
              <Text style={[s.fieldLabel, { color: colors.textPrimary }]}>Commentaires activés</Text>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </View>
          </View>

          {/* ══ BOUTON PUBLIER ══ */}
          {videoUri && (
            <TouchableOpacity
              style={[s.publishBtnFull, { opacity: canPublish ? 1 : 0.4 }]}
              onPress={handlePublish}
              disabled={!canPublish}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#7B3FF2', '#C026D3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.publishBtnFullInner}>
                <Icon name="send" size={16} color="#fff" />
                <Text style={s.publishBtnFullTxt}>Publier le Reel</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  headerClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  publishBtn: { borderRadius: 22, overflow: 'hidden' },
  publishBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9 },
  publishBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  videoSection: { width: W },
  videoPreview: { width: W, height: PREVIEW_H, backgroundColor: '#000', overflow: 'hidden' },
  previewTextLayer: { position: 'absolute', zIndex: 8 },

  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
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

  videoPicker: { width: W, height: PREVIEW_H, alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden', backgroundColor: '#08060F' },
  pickerIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  pickerLabel: { fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  pickerSub:   { fontSize: 12, marginTop: -4 },
  pickerCta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 26, marginTop: 8 },
  pickerCtaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  detailsCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  fieldIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  fieldLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  divider:    { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  charCount:  { fontSize: 11, textAlign: 'right', marginTop: 4, opacity: 0.6 },

  publishBtnFull: { marginHorizontal: 16, marginTop: 20, borderRadius: 26, overflow: 'hidden' },
  publishBtnFullInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  publishBtnFullTxt: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
});
