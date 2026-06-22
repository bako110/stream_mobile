/**
 * StoryMediaEditor — éditeur inline pour story photo/vidéo (style WhatsApp)
 * - Filtres  : 9 presets visuels en temps réel
 * - Recadrer : pan + pinch → crop réel via FFmpeg (image) ou FFmpeg (vidéo)
 * - Rogner   : poignées + lecture preview → trim réel via FFmpeg (vidéo)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Image, ScrollView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import {
  Gesture, GestureDetector,
  PanGestureHandler, State,
} from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { getVideoMetaData } from 'react-native-compressor';

const { width: W, height: H } = Dimensions.get('window');
const PREVIEW_H = H * 0.62;
const PREVIEW_W = PREVIEW_H * (9 / 16);
const CACHE     = ReactNativeBlobUtil.fs.dirs.CacheDir;

// ── Filtres ───────────────────────────────────────────────────────────────────

export type FilterKey =
  | 'none' | 'vivid' | 'warm' | 'cool' | 'bw' | 'vintage'
  | 'fade' | 'bright' | 'dramatic';

interface FilterDef {
  key:     FilterKey;
  label:   string;
  overlay: string;
  opacity: number;
  // Paramètre FFmpeg eq= pour export réel
  ffmpegEq?: string;
}

export const STORY_FILTERS: FilterDef[] = [
  { key: 'none',     label: 'Original',   overlay: 'transparent', opacity: 0 },
  { key: 'vivid',    label: 'Vivid',      overlay: '#FF5F6D',     opacity: 0.12, ffmpegEq: 'brightness=0.02:saturation=1.4:contrast=1.1' },
  { key: 'warm',     label: 'Chaud',      overlay: '#FF8C42',     opacity: 0.18, ffmpegEq: 'brightness=0.01:saturation=1.2:contrast=1.05' },
  { key: 'cool',     label: 'Froid',      overlay: '#4A90E2',     opacity: 0.18, ffmpegEq: 'brightness=0:saturation=0.9:contrast=1.05' },
  { key: 'bw',       label: 'N&B',        overlay: '#808080',     opacity: 0.45, ffmpegEq: 'brightness=0:saturation=0:contrast=1.1' },
  { key: 'vintage',  label: 'Vintage',    overlay: '#C68B59',     opacity: 0.25, ffmpegEq: 'brightness=-0.02:saturation=0.8:contrast=1.05' },
  { key: 'fade',     label: 'Fade',       overlay: '#FFFFFF',     opacity: 0.22, ffmpegEq: 'brightness=0.05:saturation=0.7:contrast=0.9' },
  { key: 'bright',   label: 'Lumineux',   overlay: '#FFFDE7',     opacity: 0.15, ffmpegEq: 'brightness=0.08:saturation=1.1:contrast=1.0' },
  { key: 'dramatic', label: 'Dramatique', overlay: '#1A0533',     opacity: 0.28, ffmpegEq: 'brightness=-0.05:saturation=1.3:contrast=1.3' },
];

type Tab = 'filter' | 'crop' | 'trim';

export interface EditorResult {
  uri:       string;
  filterKey: FilterKey;
  trimData?: { start: number; end: number };
}

interface Props {
  uri:       string;
  mediaType: 'image' | 'video';
  duration?: number;
  onConfirm: (result: EditorResult) => void;
  onCancel:  () => void;
}

// ── Helpers FFmpeg ────────────────────────────────────────────────────────────

async function normalizeUri(uri: string): Promise<string> {
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) return uri;
  const dest = `${CACHE}/edit_src_${Date.now()}.mp4`;
  try { await ReactNativeBlobUtil.fs.cp(uri, dest); }
  catch {
    const data = await ReactNativeBlobUtil.fs.readFile(uri, 'base64');
    await ReactNativeBlobUtil.fs.writeFile(dest, data, 'base64');
  }
  return `file://${dest}`;
}

async function ffmpegRun(cmd: string): Promise<boolean> {
  const session = await FFmpegKit.execute(cmd);
  const rc      = await session.getReturnCode();
  return ReturnCode.isSuccess(rc);
}

// ── FilterThumb ───────────────────────────────────────────────────────────────

const FilterThumb: React.FC<{
  filter: FilterDef; uri: string; mediaType: 'image' | 'video';
  selected: boolean; onPress: () => void;
}> = ({ filter, uri, mediaType, selected, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={ft.wrap}>
    <View style={[ft.thumb, selected && ft.thumbSel]}>
      {mediaType === 'image'
        ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="video" size={18} color="rgba(255,255,255,0.4)" />
          </View>
      }
      {filter.opacity > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: filter.overlay, opacity: filter.opacity }]} />
      )}
    </View>
    <Text style={[ft.label, selected && ft.labelSel]} numberOfLines={1}>{filter.label}</Text>
  </TouchableOpacity>
);
const ft = StyleSheet.create({
  wrap:     { alignItems: 'center', gap: 5, width: 68 },
  thumb:    { width: 60, height: 80, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbSel: { borderColor: '#7B3FF2' },
  label:    { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  labelSel: { color: '#7B3FF2', fontWeight: '700' },
});

// ── TrimBar ───────────────────────────────────────────────────────────────────

const TRIM_W = W - 48;
const HNDL_W = 22;
const MAX_DUR = 90;

const TrimBar: React.FC<{
  duration: number;
  onChange: (start: number, end: number) => void;
  playerRef: React.MutableRefObject<any>;
}> = ({ duration, onChange, playerRef }) => {
  const startRef = useRef(0);
  const endRef   = useRef(Math.min(duration, MAX_DUR));
  const [startR, setStartR] = useState(0);
  const [endR,   setEndR]   = useState(endRef.current / duration);
  const [disp,   setDisp]   = useState({ start: 0, end: endRef.current });
  const [playing, setPlaying] = useState(false);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const commit = (s: number, e: number) => {
    setDisp({ start: s, end: e });
    onChange(s, e);
  };

  const leftPanHandler = useCallback((dx: number) => {
    const nr = clamp(startRef.current / duration + dx / TRIM_W);
    const maxEnd = Math.min(nr + MAX_DUR / duration, 1);
    const newEnd = endRef.current / duration > maxEnd ? maxEnd * duration : endRef.current;
    startRef.current = nr * duration;
    endRef.current   = newEnd;
    setStartR(nr);
    setEndR(newEnd / duration);
    commit(Math.round(nr * duration * 10) / 10, Math.round(newEnd * 10) / 10);
  }, [duration]);

  const rightPanHandler = useCallback((dx: number) => {
    const maxRatio = Math.min(startRef.current / duration + MAX_DUR / duration, 1);
    const nr = clamp(endRef.current / duration + dx / TRIM_W);
    const clamped = Math.min(nr, maxRatio);
    if (clamped * duration < startRef.current + 1) return;
    endRef.current = clamped * duration;
    setEndR(clamped);
    commit(Math.round(startRef.current * 10) / 10, Math.round(clamped * duration * 10) / 10);
  }, [duration]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pause();
      setPlaying(false);
    } else {
      playerRef.current.currentTime = startRef.current;
      playerRef.current.play();
      setPlaying(true);
    }
  };

  const startX = startR * TRIM_W;
  const endX   = endR   * TRIM_W;
  const tooLong = (endRef.current - startRef.current) > MAX_DUR;

  return (
    <View style={tb.wrap}>
      <Text style={tb.time}>
        {fmt(disp.start)} — {fmt(disp.end)}
        {'  '}
        <Text style={{ color: tooLong ? '#E91E63' : '#7B3FF2' }}>
          ({Math.round((disp.end - disp.start) * 10) / 10}s{tooLong ? ' — trop long' : ''})
        </Text>
      </Text>

      <View style={tb.track}>
        <View style={[tb.selected, { left: startX, width: Math.max(0, endX - startX) }]} />

        <PanGestureHandler onGestureEvent={({ nativeEvent: e }) => {
          if (e.state === State.ACTIVE) leftPanHandler(e.translationX);
        }}>
          <Animated.View style={[tb.handle, tb.hLeft, { left: startX }]}>
            <View style={tb.bar} />
          </Animated.View>
        </PanGestureHandler>

        <PanGestureHandler onGestureEvent={({ nativeEvent: e }) => {
          if (e.state === State.ACTIVE) rightPanHandler(e.translationX);
        }}>
          <Animated.View style={[tb.handle, tb.hRight, { left: Math.max(0, endX - HNDL_W) }]}>
            <View style={tb.bar} />
          </Animated.View>
        </PanGestureHandler>
      </View>

      <TouchableOpacity onPress={togglePlay} style={tb.playBtn}>
        <Icon name={playing ? 'pause' : 'play'} size={16} color="#fff" />
        <Text style={tb.playLabel}>{playing ? 'Pause' : 'Aperçu du segment'}</Text>
      </TouchableOpacity>

      <Text style={tb.hint}>Faites glisser les poignees — max {MAX_DUR}s</Text>
    </View>
  );
};

const tb = StyleSheet.create({
  wrap:    { paddingHorizontal: 24, gap: 10, marginTop: 4 },
  time:    { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  track:   { height: 48, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, position: 'relative', overflow: 'visible' },
  selected:{ position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(123,63,242,0.35)', borderWidth: 2, borderColor: '#7B3FF2', borderRadius: 6 },
  handle:  { position: 'absolute', top: 0, bottom: 0, width: HNDL_W, backgroundColor: '#7B3FF2', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  hLeft:   { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  hRight:  { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  bar:     { width: 3, height: 20, backgroundColor: '#fff', borderRadius: 2 },
  playBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(123,63,242,0.25)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'center' },
  playLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  hint:    { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center' },
});

// ── StoryMediaEditor ──────────────────────────────────────────────────────────

export const StoryMediaEditor: React.FC<Props> = ({
  uri, mediaType, duration = 0, onConfirm, onCancel,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('filter');
  const [filterKey, setFilterKey] = useState<FilterKey>('none');
  const [applying,  setApplying]  = useState(false);
  const [applyMsg,  setApplyMsg]  = useState('');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd,   setTrimEnd]   = useState(duration);

  // Dimensions réelles du fichier source (pour calcul crop)
  const srcW = useRef(0);
  const srcH = useRef(0);

  // Crop — valeurs partagées Reanimated
  const tx      = useSharedValue(0);
  const ty      = useSharedValue(0);
  const sc      = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const savedSc = useSharedValue(1);

  // Crop final en pixels (calculé au confirm)
  const cropRef = useRef({ tx: 0, ty: 0, scale: 1 });

  const currentFilter = STORY_FILTERS.find(f => f.key === filterKey) ?? STORY_FILTERS[0];

  const player = useVideoPlayer(
    mediaType === 'video' ? { uri } : (null as any),
    p => { if (mediaType === 'video') { p.loop = true; p.muted = false; } }
  );
  const playerRef = useRef<any>(player);
  useEffect(() => { playerRef.current = player; }, [player]);

  // Charger les dimensions réelles de l'image/vidéo
  useEffect(() => {
    if (mediaType === 'image') {
      Image.getSize(uri, (w, h) => { srcW.current = w; srcH.current = h; }, () => {});
    } else if (mediaType === 'video' && duration > 0) {
      getVideoMetaData(uri).then(meta => {
        srcW.current = meta.width ?? 1080;
        srcH.current = meta.height ?? 1920;
      }).catch(() => { srcW.current = 1080; srcH.current = 1920; });
    }
  }, [uri, mediaType]);

  // ── Gestes crop ──────────────────────────────────────────────────────────

  const panGesture = Gesture.Pan()
    .onStart(() => { savedTx.value = tx.value; savedTy.value = ty.value; })
    .onUpdate(e => { tx.value = savedTx.value + e.translationX; ty.value = savedTy.value + e.translationY; })
    .onEnd(() => { cropRef.current.tx = tx.value; cropRef.current.ty = ty.value; });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => { savedSc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(1, Math.min(4, savedSc.value * e.scale)); })
    .onEnd(() => { cropRef.current.scale = sc.value; });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

  const cropStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: sc.value },
    ],
  }));

  const resetCrop = () => {
    tx.value = withSpring(0); ty.value = withSpring(0); sc.value = withSpring(1);
    cropRef.current = { tx: 0, ty: 0, scale: 1 };
  };

  // ── Confirm : applique vraiment le crop/trim/filtre via FFmpeg ────────────

  const handleConfirm = useCallback(async () => {
    setApplying(true);
    try {
      const src = await normalizeUri(uri);
      const srcPath = src.replace('file://', '');
      let finalUri = src;

      const { tx: dtx, ty: dty, scale: dsc } = cropRef.current;
      const hasCrop   = dsc > 1.01 || Math.abs(dtx) > 2 || Math.abs(dty) > 2;
      const hasTrim   = mediaType === 'video' && (trimStart > 0.1 || trimEnd < duration - 0.1);
      const hasFilter = filterKey !== 'none' && currentFilter.ffmpegEq;

      if (mediaType === 'image') {
        // ── Image : crop + filtre via FFmpeg ─────────────────────────────
        const vfParts: string[] = [];

        if (hasCrop && srcW.current > 0) {
          // Calculer la zone crop en pixels source
          // Le preview montre PREVIEW_W x PREVIEW_H du fichier source scalé
          // scale=dsc → on voit 1/dsc de l'image dans le cadre
          const visW = srcW.current / dsc;
          const visH = srcH.current / dsc;

          // Offset en pixels source (tx/ty en px preview → ratio → pixels source)
          const ratioX = srcW.current / PREVIEW_W;
          const ratioY = srcH.current / PREVIEW_H;
          const offsetX = (-dtx) * ratioX / dsc;
          const offsetY = (-dty) * ratioY / dsc;

          const cropX = Math.max(0, Math.round(offsetX + (srcW.current - visW) / 2));
          const cropY = Math.max(0, Math.round(offsetY + (srcH.current - visH) / 2));
          const cropW = Math.min(Math.round(visW), srcW.current - cropX);
          const cropH = Math.min(Math.round(visH), srcH.current - cropY);

          if (cropW > 10 && cropH > 10) {
            vfParts.push(`crop=${cropW}:${cropH}:${cropX}:${cropY}`);
          }
        }

        if (hasFilter) {
          vfParts.push(`eq=${currentFilter.ffmpegEq}`);
        }

        // Toujours scaler vers 1080x1920 (format story 9:16)
        vfParts.push('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2');

        const outPath = `${CACHE}/story_edit_${Date.now()}.jpg`;
        const vf = vfParts.join(',');
        setApplyMsg('Traitement…');
        const ok = await ffmpegRun(`-i "${srcPath}" -vf "${vf}" -q:v 2 -frames:v 1 "${outPath}"`);
        if (ok) finalUri = `file://${outPath}`;

      } else if (mediaType === 'video') {
        // ── Vidéo : trim + crop + filtre via FFmpeg ───────────────────────
        const vfParts: string[] = [];

        if (hasCrop && srcW.current > 0) {
          const visW = srcW.current / dsc;
          const visH = srcH.current / dsc;
          const ratioX = srcW.current / PREVIEW_W;
          const ratioY = srcH.current / PREVIEW_H;
          const offsetX = (-dtx) * ratioX / dsc;
          const offsetY = (-dty) * ratioY / dsc;
          const cropX = Math.max(0, Math.round(offsetX + (srcW.current - visW) / 2));
          const cropY = Math.max(0, Math.round(offsetY + (srcH.current - visH) / 2));
          const cropW = Math.min(Math.round(visW), srcW.current - cropX);
          const cropH = Math.min(Math.round(visH), srcH.current - cropY);
          if (cropW > 10 && cropH > 10) {
            vfParts.push(`crop=${cropW}:${cropH}:${cropX}:${cropY}`);
          }
        }

        if (hasFilter) {
          vfParts.push(`eq=${currentFilter.ffmpegEq}`);
        }

        vfParts.push('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2');

        const outPath = `${CACHE}/story_edit_${Date.now()}.mp4`;
        const trimFlag = hasTrim
          ? `-ss ${trimStart.toFixed(3)} -t ${(trimEnd - trimStart).toFixed(3)}`
          : '';
        const vfFlag = vfParts.length > 0 ? `-vf "${vfParts.join(',')}"` : '';
        const needReencode = hasCrop || hasFilter || vfParts.length > 0;

        setApplyMsg(hasTrim && needReencode ? 'Traitement vidéo…' : hasTrim ? 'Découpe…' : 'Traitement…');

        const codec = needReencode
          ? `-c:v libx264 -preset ultrafast -crf 23 -c:a aac -b:a 128k`
          : `-c copy`;

        const ok = await ffmpegRun(
          `${trimFlag} -i "${srcPath}" ${vfFlag} ${codec} -avoid_negative_ts make_zero "${outPath}"`
        );
        if (ok) finalUri = `file://${outPath}`;
        else Alert.alert('Erreur', 'Le traitement vidéo a échoué.');
      }

      onConfirm({
        uri:      finalUri,
        filterKey,
        trimData: hasTrim ? { start: trimStart, end: trimEnd } : undefined,
      });
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Traitement échoué.');
      onConfirm({ uri, filterKey });
    } finally {
      setApplying(false);
      setApplyMsg('');
    }
  }, [uri, mediaType, filterKey, currentFilter, trimStart, trimEnd, duration, onConfirm]);

  // ── Render ────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'filter', icon: 'sliders',  label: 'Filtres'  },
    { key: 'crop',   icon: 'crop',     label: 'Recadrer' },
    ...(mediaType === 'video' ? [{ key: 'trim' as Tab, icon: 'scissors', label: 'Rogner' }] : []),
  ];

  return (
    <View style={st.root}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={onCancel} style={st.iconBtn} disabled={applying}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={st.title}>Modifier</Text>
        <TouchableOpacity onPress={handleConfirm} disabled={applying} style={st.doneBtn} activeOpacity={0.85}>
          <LinearGradient colors={applying ? ['#555','#555'] : ['#7B3FF2','#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.doneBtnInner}>
            {applying
              ? <><ActivityIndicator size="small" color="#fff" /><Text style={st.doneLabel}>{applyMsg || 'Traitement…'}</Text></>
              : <><Text style={st.doneLabel}>Suivant</Text><Icon name="chevron-right" size={14} color="#fff" /></>
            }
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Preview */}
      <View style={st.previewWrap}>
        <View style={[st.frame, { width: PREVIEW_W, height: PREVIEW_H }]}>
          {activeTab === 'crop' ? (
            <GestureDetector gesture={composed}>
              <Animated.View style={[StyleSheet.absoluteFill, cropStyle]}>
                {mediaType === 'image'
                  ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" />
                }
              </Animated.View>
            </GestureDetector>
          ) : (
            <>
              {mediaType === 'image'
                ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" />
              }
              {currentFilter.opacity > 0 && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: currentFilter.overlay, opacity: currentFilter.opacity }]} pointerEvents="none" />
              )}
            </>
          )}

          {/* Grille crop */}
          {activeTab === 'crop' && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {([33.33, 66.66] as number[]).map(p => (
                <View key={`h${p}`} style={[st.gridLine, { top: `${p}%` as any, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
              ))}
              {([33.33, 66.66] as number[]).map(p => (
                <View key={`v${p}`} style={[st.gridLine, { left: `${p}%` as any, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
              ))}
            </View>
          )}
        </View>

        {activeTab === 'crop' && (
          <TouchableOpacity onPress={resetCrop} style={st.resetBtn}>
            <Icon name="refresh-cw" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={st.resetLabel}>Réinitialiser</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={st.tabs}>
        {tabs.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)} style={[st.tab, activeTab === t.key && st.tabOn]} activeOpacity={0.75}>
            <Icon name={t.icon} size={16} color={activeTab === t.key ? '#7B3FF2' : 'rgba(255,255,255,0.45)'} />
            <Text style={[st.tabLabel, activeTab === t.key && st.tabLabelOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={st.divider} />

      {/* ── Filtres ── */}
      {activeTab === 'filter' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
          {STORY_FILTERS.map(f => (
            <FilterThumb key={f.key} filter={f} uri={uri} mediaType={mediaType} selected={filterKey === f.key} onPress={() => setFilterKey(f.key)} />
          ))}
        </ScrollView>
      )}

      {/* ── Recadrer ── */}
      {activeTab === 'crop' && (
        <View style={st.hints}>
          <View style={st.hintRow}>
            <Icon name="move"    size={14} color="rgba(255,255,255,0.55)" />
            <Text style={st.hintText}>Faites glisser pour repositionner</Text>
          </View>
          <View style={st.hintRow}>
            <Icon name="zoom-in" size={14} color="rgba(255,255,255,0.55)" />
            <Text style={st.hintText}>Pincez pour zoomer / dézoomer</Text>
          </View>
          <Text style={[st.hintText, { color: 'rgba(123,63,242,0.8)', marginTop: 4 }]}>
            Le recadrage sera appliqué lors du traitement
          </Text>
        </View>
      )}

      {/* ── Rogner (vidéo) ── */}
      {activeTab === 'trim' && mediaType === 'video' && duration > 0 && (
        <TrimBar
          duration={duration}
          playerRef={playerRef}
          onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
        />
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#0A0A0A' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: Platform.OS === 'android' ? 48 : 56, paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  title:        { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
  doneBtn:      { borderRadius: 20, overflow: 'hidden' },
  doneBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9 },
  doneLabel:    { color: '#fff', fontWeight: '700', fontSize: 14 },

  previewWrap:  { alignItems: 'center', flex: 1, justifyContent: 'center', gap: 8 },
  frame:        { borderRadius: 16, overflow: 'hidden', backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  gridLine:     { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.2)' },
  resetBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20 },
  resetLabel:   { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },

  tabs:         { flexDirection: 'row', paddingHorizontal: 16, gap: 4 },
  tab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  tabOn:        { borderBottomWidth: 2, borderBottomColor: '#7B3FF2' },
  tabLabel:     { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
  tabLabelOn:   { color: '#7B3FF2' },
  divider:      { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  filterRow:    { paddingHorizontal: 16, paddingVertical: 8, gap: 10, alignItems: 'center' },
  hints:        { paddingHorizontal: 24, gap: 10, marginTop: 4 },
  hintRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hintText:     { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
});
