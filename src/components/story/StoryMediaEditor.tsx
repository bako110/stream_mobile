/**
 * StoryMediaEditor — éditeur inline pour story photo/vidéo
 * - Filtres : 9 filtres visuels (overlay teinté en temps réel)
 * - Recadrer : pan + pinch pour positionner l'image dans le cadre 9:16
 * - Rogner (vidéo) : poignées glissables pour choisir le segment
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Image, ScrollView, Platform, ActivityIndicator,
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
import { Image as CompressorImage } from 'react-native-compressor';

const { width: W, height: H } = Dimensions.get('window');
const PREVIEW_H = H * 0.62;
const PREVIEW_W = PREVIEW_H * (9 / 16);

// ── Types ─────────────────────────────────────────────────────────────────────

export type FilterKey =
  | 'none' | 'vivid' | 'warm' | 'cool' | 'bw' | 'vintage'
  | 'fade' | 'bright' | 'dramatic';

interface FilterDef {
  key:     FilterKey;
  label:   string;
  overlay: string;
  opacity: number;
}

export const STORY_FILTERS: FilterDef[] = [
  { key: 'none',      label: 'Original',   overlay: 'transparent', opacity: 0    },
  { key: 'vivid',     label: 'Vivid',      overlay: '#FF5F6D',     opacity: 0.12 },
  { key: 'warm',      label: 'Chaud',      overlay: '#FF8C42',     opacity: 0.18 },
  { key: 'cool',      label: 'Froid',      overlay: '#4A90E2',     opacity: 0.18 },
  { key: 'bw',        label: 'N&B',        overlay: '#808080',     opacity: 0.45 },
  { key: 'vintage',   label: 'Vintage',    overlay: '#C68B59',     opacity: 0.25 },
  { key: 'fade',      label: 'Fade',       overlay: '#FFFFFF',     opacity: 0.22 },
  { key: 'bright',    label: 'Lumineux',   overlay: '#FFFDE7',     opacity: 0.15 },
  { key: 'dramatic',  label: 'Dramatique', overlay: '#1A0533',     opacity: 0.28 },
];

type Tab = 'filter' | 'crop' | 'trim';

export interface EditorResult {
  uri:       string;
  filterKey: FilterKey;
  cropData?: { x: number; y: number; w: number; h: number; scale: number };
  trimData?: { start: number; end: number };
}

interface Props {
  uri:       string;
  mediaType: 'image' | 'video';
  duration?: number;
  onConfirm: (result: EditorResult) => void;
  onCancel:  () => void;
}

// ── FilterThumb ───────────────────────────────────────────────────────────────

const FilterThumb: React.FC<{
  filter: FilterDef; uri: string; mediaType: 'image' | 'video';
  selected: boolean; onPress: () => void;
}> = ({ filter, uri, mediaType, selected, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={ft.wrap}>
    <View style={[ft.thumb, selected && ft.thumbSelected]}>
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
    <Text style={[ft.label, selected && ft.labelOn]} numberOfLines={1}>{filter.label}</Text>
  </TouchableOpacity>
);

const ft = StyleSheet.create({
  wrap:        { alignItems: 'center', gap: 5, width: 68 },
  thumb:       { width: 60, height: 80, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbSelected: { borderColor: '#7B3FF2' },
  label:       { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  labelOn:     { color: '#7B3FF2', fontWeight: '700' },
});

// ── TrimBar ───────────────────────────────────────────────────────────────────

const TRIM_W  = W - 48;
const HNDL_W  = 22;

const TrimBar: React.FC<{
  duration: number;
  startSec: number;
  endSec:   number;
  onChange: (start: number, end: number) => void;
}> = ({ duration, startSec, endSec, onChange }) => {
  const startRatioRef = useRef(startSec / duration);
  const endRatioRef   = useRef(endSec   / duration);
  const [disp, setDisp] = useState({ start: startSec, end: endSec });

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const onStartMove = useCallback((dx: number) => {
    const nr = clamp(startRatioRef.current + dx / TRIM_W);
    if (nr * duration < endRatioRef.current * duration - 1) {
      startRatioRef.current = nr;
      const s = Math.round(nr * duration * 10) / 10;
      const e = Math.round(endRatioRef.current * duration * 10) / 10;
      setDisp({ start: s, end: e });
      onChange(s, e);
    }
  }, [duration, onChange]);

  const onEndMove = useCallback((dx: number) => {
    const nr = clamp(endRatioRef.current + dx / TRIM_W);
    if (nr * duration > startRatioRef.current * duration + 1) {
      endRatioRef.current = nr;
      const s = Math.round(startRatioRef.current * duration * 10) / 10;
      const e = Math.round(nr * duration * 10) / 10;
      setDisp({ start: s, end: e });
      onChange(s, e);
    }
  }, [duration, onChange]);

  const startX = startRatioRef.current * TRIM_W;
  const endX   = endRatioRef.current   * TRIM_W;

  return (
    <View style={tb.wrap}>
      <Text style={tb.time}>
        {fmt(disp.start)} — {fmt(disp.end)}
        {'  '}
        <Text style={{ color: '#7B3FF2' }}>({Math.round((disp.end - disp.start) * 10) / 10}s)</Text>
      </Text>

      <View style={tb.track}>
        <View style={[tb.selected, { left: startX, width: Math.max(0, endX - startX) }]} />

        <PanGestureHandler onGestureEvent={({ nativeEvent: e }) => {
          if (e.state === State.ACTIVE) onStartMove(e.translationX);
        }}>
          <Animated.View style={[tb.handle, tb.hLeft, { left: startX }]}>
            <View style={tb.bar} />
          </Animated.View>
        </PanGestureHandler>

        <PanGestureHandler onGestureEvent={({ nativeEvent: e }) => {
          if (e.state === State.ACTIVE) onEndMove(e.translationX);
        }}>
          <Animated.View style={[tb.handle, tb.hRight, { left: endX - HNDL_W }]}>
            <View style={tb.bar} />
          </Animated.View>
        </PanGestureHandler>
      </View>

      <Text style={tb.hint}>Faites glisser les poignees pour choisir le segment</Text>
    </View>
  );
};

const tb = StyleSheet.create({
  wrap:  { paddingHorizontal: 24, gap: 12, marginTop: 8 },
  time:  { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  track: {
    height: 48, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10, position: 'relative', overflow: 'visible',
  },
  selected: {
    position: 'absolute', top: 0, bottom: 0,
    backgroundColor: 'rgba(123,63,242,0.35)',
    borderWidth: 2, borderColor: '#7B3FF2', borderRadius: 6,
  },
  handle: {
    position: 'absolute', top: 0, bottom: 0, width: HNDL_W,
    backgroundColor: '#7B3FF2', borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  hLeft:  { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  hRight: { borderTopLeftRadius: 0,  borderBottomLeftRadius: 0  },
  bar:    { width: 3, height: 20, backgroundColor: '#fff', borderRadius: 2 },
  hint:   { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center' },
});

// ── StoryMediaEditor ──────────────────────────────────────────────────────────

export const StoryMediaEditor: React.FC<Props> = ({
  uri, mediaType, duration = 0, onConfirm, onCancel,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('filter');
  const [filterKey, setFilterKey] = useState<FilterKey>('none');
  const [applying,  setApplying]  = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd,   setTrimEnd]   = useState(duration);

  // Crop — valeurs partagées pour Reanimated
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const savedSc = useSharedValue(1);

  const cropRef = useRef({ x: 0, y: 0, scale: 1 });

  const currentFilter = STORY_FILTERS.find(f => f.key === filterKey) ?? STORY_FILTERS[0];

  const player = useVideoPlayer(mediaType === 'video' ? { uri } : (null as any), p => {
    if (mediaType === 'video') { p.loop = true; p.muted = false; }
  });

  // Gestes crop — API Gesture v2
  const panGesture = Gesture.Pan()
    .onStart(() => { savedTx.value = tx.value; savedTy.value = ty.value; })
    .onUpdate(e => { tx.value = savedTx.value + e.translationX; ty.value = savedTy.value + e.translationY; })
    .onEnd(() => { cropRef.current.x = tx.value; cropRef.current.y = ty.value; });

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
    cropRef.current = { x: 0, y: 0, scale: 1 };
  };

  // ── Confirm ───────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    setApplying(true);
    try {
      let finalUri = uri;
      const c = cropRef.current;
      if (mediaType === 'image' && c.scale !== 1) {
        const tw = Math.round(1080 / c.scale);
        const th = Math.round(1920 / c.scale);
        finalUri = await CompressorImage.compress(uri, {
          maxWidth: tw, maxHeight: th, quality: 0.9,
          output: 'jpg', returnableOutputType: 'uri',
        });
      }
      onConfirm({
        uri: finalUri,
        filterKey,
        cropData: c.scale !== 1 ? { x: c.x, y: c.y, w: 1, h: 1, scale: c.scale } : undefined,
        trimData: mediaType === 'video' && (trimStart > 0 || trimEnd < duration)
          ? { start: trimStart, end: trimEnd } : undefined,
      });
    } catch {
      onConfirm({ uri, filterKey });
    } finally {
      setApplying(false);
    }
  }, [uri, mediaType, filterKey, trimStart, trimEnd, duration, onConfirm]);

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
        <TouchableOpacity onPress={onCancel} style={st.iconBtn}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={st.title}>Modifier</Text>
        <TouchableOpacity onPress={handleConfirm} disabled={applying} style={st.doneBtn} activeOpacity={0.85}>
          {applying
            ? <ActivityIndicator size="small" color="#fff" />
            : (
              <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.doneBtnInner}>
                <Text style={st.doneLabel}>Suivant</Text>
                <Icon name="chevron-right" size={14} color="#fff" />
              </LinearGradient>
            )
          }
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
              {[33.33, 66.66].map(p => (
                <View key={`h${p}`} style={[st.gridLine, { top: `${p}%` as any, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
              ))}
              {[33.33, 66.66].map(p => (
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
        </View>
      )}

      {/* ── Rogner ── */}
      {activeTab === 'trim' && mediaType === 'video' && duration > 0 && (
        <TrimBar
          duration={duration}
          startSec={trimStart}
          endSec={trimEnd}
          onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
        />
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  title:       { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
  doneBtn:     { borderRadius: 20, overflow: 'hidden' },
  doneBtnInner:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9 },
  doneLabel:   { color: '#fff', fontWeight: '700', fontSize: 14 },

  previewWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', gap: 8 },
  frame: {
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  gridLine:    { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.2)' },

  resetBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20 },
  resetLabel:  { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },

  tabs:      { flexDirection: 'row', paddingHorizontal: 16, gap: 4 },
  tab:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  tabOn:     { borderBottomWidth: 2, borderBottomColor: '#7B3FF2' },
  tabLabel:  { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
  tabLabelOn:{ color: '#7B3FF2' },
  divider:   { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },

  filterRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 10, alignItems: 'center' },

  hints:    { paddingHorizontal: 24, gap: 10, marginTop: 4 },
  hintRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hintText: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
});
