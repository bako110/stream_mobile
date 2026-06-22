import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Image, TextInput, ScrollView, Modal, PanResponder,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Svg, { Path } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');
const PREVIEW_H = H * 0.62;
const PREVIEW_W = PREVIEW_H * (9 / 16);
const TRIM_W = W - 48;
const MAX_DUR = 90;

// ── Types ─────────────────────────────────────────────────────────────────────

export type FilterKey = 'none';
export const STORY_FILTERS = [{ key: 'none' as FilterKey, label: 'Original', overlay: 'transparent', opacity: 0 }];
export type TextBg = 'none' | 'solid' | 'semi';

export interface TextLayer {
  id: string; text: string; color: string; bg: TextBg; bgColor: string;
  fontSize: number; x: number; y: number; bold: boolean; rotation: number; scale: number;
}
export interface DrawPath {
  id: string; d: string; color: string; width: number;
}
export interface MaskRect {
  id: string; x: number; y: number; w: number; h: number;
}
export interface StickerLayer {
  id: string; emoji: string; x: number; y: number; scale: number; rotation: number;
}
export interface EditorResult {
  uri: string; filterKey: FilterKey; trimData?: { start: number; end: number };
  textLayers: TextLayer[]; drawPaths: DrawPath[]; masks: MaskRect[]; stickers: StickerLayer[];
}

interface Props {
  uri: string; mediaType: 'image' | 'video'; duration?: number;
  onConfirm: (result: EditorResult) => void; onCancel: () => void;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const DRAW_COLORS = ['#FFFFFF','#000000','#E91E63','#2196F3','#4CAF50','#FF9800','#9C27B0','#F44336','#FFEB3B','#00BCD4'];
const TEXT_COLORS = ['#FFFFFF','#000000','#E91E63','#2196F3','#4CAF50','#FF9800','#9C27B0','#FFEB3B','#F44336','#00BCD4'];
const TEXT_BG_COLORS = ['#000000','#FFFFFF','#7B3FF2','#E91E63','#2196F3','#4CAF50','#FF9800','#FF5722'];
const STICKER_LIST = ['😂','❤️','🔥','👍','😍','🎉','💯','😭','🤔','👀','✨','💀','🙏','😤','💪','🥳','😊','🤣','👏','💥','🎵','🌈','⚡','🦋','🌸','🍕','🏆','🎯','🌙','💎'];

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  return d;
}

// ── VideoEditorPreview ────────────────────────────────────────────────────────

const VideoEditorPreview: React.FC<{ uri: string; style: any; playerRef: React.RefObject<any> }> = ({ uri, style, playerRef }) => {
  const player = useVideoPlayer({ uri }, p => { p.loop = true; p.muted = false; });
  playerRef.current = player;
  return <VideoView player={player} style={style} resizeMode="cover" />;
};

// ── TrimBar ───────────────────────────────────────────────────────────────────

const TrimBar: React.FC<{ duration: number; onChange: (s: number, e: number) => void; playerRef: React.RefObject<any> }> = ({ duration, onChange, playerRef }) => {
  const startRef = useRef(0);
  const endRef   = useRef(Math.min(duration, MAX_DUR));
  const [startR, setStartR] = useState(0);
  const [endR,   setEndR]   = useState(endRef.current / duration);
  const [disp,   setDisp]   = useState({ start: 0, end: endRef.current });
  const [playing, setPlaying] = useState(false);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const leftPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const nr = clamp(startRef.current / duration + g.dx / TRIM_W);
      const maxEnd = Math.min(nr + MAX_DUR / duration, 1);
      const newEnd = endRef.current / duration > maxEnd ? maxEnd * duration : endRef.current;
      startRef.current = nr * duration; endRef.current = newEnd;
      setStartR(nr); setEndR(newEnd / duration);
      setDisp({ start: Math.round(nr * duration * 10) / 10, end: Math.round(newEnd * 10) / 10 });
      onChange(startRef.current, endRef.current);
    },
  }), [duration]);

  const rightPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const max = Math.min(startRef.current / duration + MAX_DUR / duration, 1);
      const nr = Math.min(max, clamp(endRef.current / duration + g.dx / TRIM_W));
      if (nr * duration < startRef.current + 1) return;
      endRef.current = nr * duration; setEndR(nr);
      setDisp(d => ({ ...d, end: Math.round(nr * duration * 10) / 10 }));
      onChange(startRef.current, endRef.current);
    },
  }), [duration]);

  const startX = startR * TRIM_W;
  const endX   = endR   * TRIM_W;

  return (
    <View style={tb.wrap}>
      <Text style={tb.time}>{fmt(disp.start)} — {fmt(disp.end)}{'  '}
        <Text style={{ color: '#7B3FF2' }}>({Math.round((disp.end - disp.start) * 10) / 10}s)</Text>
      </Text>
      <View style={tb.track}>
        <View style={[tb.sel, { left: startX, width: Math.max(0, endX - startX) }]} />
        <View style={[tb.handle, tb.hL, { left: startX }]} {...leftPan.panHandlers}><View style={tb.bar} /></View>
        <View style={[tb.handle, tb.hR, { left: Math.max(0, endX - 22) }]} {...rightPan.panHandlers}><View style={tb.bar} /></View>
      </View>
      <TouchableOpacity onPress={() => {
        if (!playerRef.current) return;
        if (playing) { playerRef.current.pause(); setPlaying(false); }
        else { playerRef.current.currentTime = startRef.current; playerRef.current.play(); setPlaying(true); }
      }} style={tb.playBtn}>
        <Icon name={playing ? 'pause' : 'play'} size={16} color="#fff" />
        <Text style={tb.playLabel}>{playing ? 'Pause' : 'Apercu'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const tb = StyleSheet.create({
  wrap:     { paddingHorizontal: 24, gap: 10, marginTop: 4 },
  time:     { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  track:    { height: 48, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, position: 'relative' },
  sel:      { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(123,63,242,0.35)', borderWidth: 2, borderColor: '#7B3FF2', borderRadius: 6 },
  handle:   { position: 'absolute', top: 0, bottom: 0, width: 22, backgroundColor: '#7B3FF2', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  hL:       { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  hR:       { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  bar:      { width: 3, height: 20, backgroundColor: '#fff', borderRadius: 2 },
  playBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(123,63,242,0.25)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'center' },
  playLabel:{ color: '#fff', fontSize: 13, fontWeight: '600' },
});

// ── DraggableSticker ──────────────────────────────────────────────────────────

const DraggableSticker: React.FC<{
  sticker: StickerLayer;
  onUpdate: (id: string, x: number, y: number, scale: number, rotation: number) => void;
  onRemove: (id: string) => void;
  containerW: number; containerH: number;
}> = ({ sticker, onUpdate, onRemove, containerW, containerH }) => {
  const x   = useSharedValue(sticker.x * containerW);
  const y   = useSharedValue(sticker.y * containerH);
  const sc  = useSharedValue(sticker.scale);
  const rot = useSharedValue(sticker.rotation);
  const sx  = useSharedValue(sticker.x * containerW);
  const sy  = useSharedValue(sticker.y * containerH);
  const ssc = useSharedValue(sticker.scale);
  const srot= useSharedValue(sticker.rotation);

  const pan   = Gesture.Pan()
    .onStart(() => { sx.value = x.value; sy.value = y.value; })
    .onUpdate(e => { x.value = sx.value + e.translationX; y.value = sy.value + e.translationY; })
    .onEnd(() => onUpdate(sticker.id, x.value / containerW, y.value / containerH, sc.value, rot.value));
  const pinch = Gesture.Pinch()
    .onStart(() => { ssc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(0.3, Math.min(4, ssc.value * e.scale)); })
    .onEnd(() => onUpdate(sticker.id, x.value / containerW, y.value / containerH, sc.value, rot.value));
  const rotate= Gesture.Rotation()
    .onStart(() => { srot.value = rot.value; })
    .onUpdate(e => { rot.value = srot.value + e.rotation; })
    .onEnd(() => onUpdate(sticker.id, x.value / containerW, y.value / containerH, sc.value, rot.value));

  const style = useAnimatedStyle(() => ({
    position: 'absolute', left: x.value - 24, top: y.value - 24,
    transform: [{ scale: sc.value }, { rotate: `${rot.value}rad` }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={style}>
        <Text style={{ fontSize: 42 }}>{sticker.emoji}</Text>
        <TouchableOpacity onPress={() => onRemove(sticker.id)} style={sk.rm}>
          <Icon name="x" size={8} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

// ── DraggableText ─────────────────────────────────────────────────────────────

const DraggableText: React.FC<{
  layer: TextLayer;
  onUpdate: (id: string, x: number, y: number, scale: number, rotation: number) => void;
  onRemove: (id: string) => void;
  containerW: number; containerH: number;
}> = ({ layer, onUpdate, onRemove, containerW, containerH }) => {
  const x   = useSharedValue(layer.x * containerW);
  const y   = useSharedValue(layer.y * containerH);
  const sc  = useSharedValue(layer.scale);
  const rot = useSharedValue(layer.rotation);
  const sx  = useSharedValue(layer.x * containerW);
  const sy  = useSharedValue(layer.y * containerH);
  const ssc = useSharedValue(layer.scale);
  const srot= useSharedValue(layer.rotation);

  const pan   = Gesture.Pan()
    .onStart(() => { sx.value = x.value; sy.value = y.value; })
    .onUpdate(e => { x.value = sx.value + e.translationX; y.value = sy.value + e.translationY; })
    .onEnd(() => onUpdate(layer.id, x.value / containerW, y.value / containerH, sc.value, rot.value));
  const pinch = Gesture.Pinch()
    .onStart(() => { ssc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(0.5, Math.min(4, ssc.value * e.scale)); })
    .onEnd(() => onUpdate(layer.id, x.value / containerW, y.value / containerH, sc.value, rot.value));
  const rotate= Gesture.Rotation()
    .onStart(() => { srot.value = rot.value; })
    .onUpdate(e => { rot.value = srot.value + e.rotation; })
    .onEnd(() => onUpdate(layer.id, x.value / containerW, y.value / containerH, sc.value, rot.value));

  const style = useAnimatedStyle(() => ({
    position: 'absolute', left: x.value, top: y.value,
    transform: [{ scale: sc.value }, { rotate: `${rot.value}rad` }],
  }));

  const bgStyle = layer.bg === 'none' ? {}
    : { backgroundColor: layer.bg === 'solid' ? layer.bgColor : layer.bgColor + 'BB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 };

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={[style, bgStyle]}>
        <Text style={{
          color: layer.color, fontSize: layer.fontSize, fontWeight: layer.bold ? 'bold' : 'normal',
          textShadowColor: layer.bg === 'none' ? 'rgba(0,0,0,0.7)' : 'transparent',
          textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3,
        }}>{layer.text}</Text>
        <TouchableOpacity onPress={() => onRemove(layer.id)} style={sk.rm}>
          <Icon name="x" size={8} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

const sk = StyleSheet.create({
  rm: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E91E63', alignItems: 'center', justifyContent: 'center' },
});

// ── StoryMediaEditor ──────────────────────────────────────────────────────────

type Tool = 'crop' | 'draw' | 'text' | 'mask' | 'sticker' | 'trim';

export const StoryMediaEditor: React.FC<Props> = ({ uri, mediaType, duration = 0, onConfirm, onCancel }) => {
  const insets = useSafeAreaInsets();
  const [activeTool, setActiveTool] = useState<Tool>(mediaType === 'image' ? 'crop' : 'trim');

  // ── Undo ──────────────────────────────────────────────────────────────────
  type HE = { type: 'draw'; path: DrawPath } | { type: 'mask'; mask: MaskRect }
          | { type: 'text'; layer: TextLayer } | { type: 'sticker'; sticker: StickerLayer };
  const history = useRef<HE[]>([]);

  // ── Crop (Reanimated gestures — sur la preview uniquement) ────────────────
  const tx  = useSharedValue(0); const ty  = useSharedValue(0); const csc = useSharedValue(1);
  const stx = useSharedValue(0); const sty = useSharedValue(0); const ssc = useSharedValue(1);

  const cropPan = Gesture.Pan()
    .onStart(() => { stx.value = tx.value; sty.value = ty.value; })
    .onUpdate(e => { tx.value = stx.value + e.translationX; ty.value = sty.value + e.translationY; });
  const cropPinch = Gesture.Pinch()
    .onStart(() => { ssc.value = csc.value; })
    .onUpdate(e => { csc.value = Math.max(1, Math.min(5, ssc.value * e.scale)); });
  const cropGesture = Gesture.Simultaneous(cropPan, cropPinch);
  const cropStyle   = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: csc.value }],
  }));
  const resetCrop = () => { tx.value = withSpring(0); ty.value = withSpring(0); csc.value = withSpring(1); };

  // ── Draw — PanResponder stable via useMemo ────────────────────────────────
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(4);
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [erasing,   setErasing]   = useState(false);
  const livePointsRef = useRef<{ x: number; y: number }[]>([]);
  const [livePath, setLivePath] = useState('');
  const drawColorRef = useRef(drawColor);
  const drawWidthRef = useRef(drawWidth);
  const erasingRef   = useRef(erasing);
  drawColorRef.current = drawColor;
  drawWidthRef.current = drawWidth;
  erasingRef.current   = erasing;
  const activeToolRef  = useRef(activeTool);
  activeToolRef.current = activeTool;

  const drawPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => activeToolRef.current === 'draw' && !erasingRef.current,
    onMoveShouldSetPanResponder:  () => activeToolRef.current === 'draw' && !erasingRef.current,
    onPanResponderGrant: (e) => {
      livePointsRef.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
      setLivePath('');
    },
    onPanResponderMove: (e) => {
      livePointsRef.current = [...livePointsRef.current, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
      setLivePath(pointsToPath(livePointsRef.current));
    },
    onPanResponderRelease: () => {
      const pts = livePointsRef.current;
      if (pts.length >= 2) {
        const np: DrawPath = { id: Date.now().toString(), d: pointsToPath(pts), color: drawColorRef.current, width: drawWidthRef.current };
        setDrawPaths(old => [...old, np]);
        history.current.push({ type: 'draw', path: np });
      }
      livePointsRef.current = [];
      setLivePath('');
    },
  }), []);

  const erasePath = useCallback((id: string) => setDrawPaths(p => p.filter(x => x.id !== id)), []);

  // ── Mask — PanResponder stable via useMemo ────────────────────────────────
  const [masks, setMasks] = useState<MaskRect[]>([]);
  const maskStartRef  = useRef({ x: 0, y: 0 });
  const [drawingMask, setDrawingMask] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const isMaskRef = useRef(false);
  isMaskRef.current = activeTool === 'mask';

  const maskPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => isMaskRef.current,
    onMoveShouldSetPanResponder:  () => isMaskRef.current,
    onPanResponderGrant: (e) => {
      maskStartRef.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      setDrawingMask({ x: maskStartRef.current.x, y: maskStartRef.current.y, w: 0, h: 0 });
    },
    onPanResponderMove: (e) => {
      const dx = e.nativeEvent.locationX - maskStartRef.current.x;
      const dy = e.nativeEvent.locationY - maskStartRef.current.y;
      setDrawingMask({
        x: dx < 0 ? e.nativeEvent.locationX : maskStartRef.current.x,
        y: dy < 0 ? e.nativeEvent.locationY : maskStartRef.current.y,
        w: Math.abs(dx), h: Math.abs(dy),
      });
    },
    onPanResponderRelease: () => {
      setDrawingMask(prev => {
        if (prev && prev.w > 15 && prev.h > 15) {
          const nm: MaskRect = { id: Date.now().toString(), ...prev };
          setMasks(old => [...old, nm]);
          history.current.push({ type: 'mask', mask: nm });
        }
        return null;
      });
    },
  }), []);

  const removeMask = useCallback((id: string) => setMasks(m => m.filter(x => x.id !== id)), []);

  // ── Text ──────────────────────────────────────────────────────────────────
  const [textLayers,    setTextLayers]    = useState<TextLayer[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput,     setTextInput]     = useState('');
  const [textColor,     setTextColor]     = useState(TEXT_COLORS[0]);
  const [textBg,        setTextBg]        = useState<TextBg>('none');
  const [textBgColor,   setTextBgColor]   = useState(TEXT_BG_COLORS[0]);
  const [textBold,      setTextBold]      = useState(false);
  const [textSize,      setTextSize]      = useState(22);

  const addText = () => {
    if (!textInput.trim()) { setShowTextModal(false); return; }
    const nl: TextLayer = { id: Date.now().toString(), text: textInput.trim(), color: textColor, bg: textBg, bgColor: textBgColor, fontSize: textSize, x: 0.4, y: 0.4, bold: textBold, rotation: 0, scale: 1 };
    setTextLayers(p => [...p, nl]);
    history.current.push({ type: 'text', layer: nl });
    setTextInput(''); setShowTextModal(false);
  };
  const updateText   = useCallback((id: string, x: number, y: number, scale: number, rotation: number) =>
    setTextLayers(p => p.map(l => l.id === id ? { ...l, x, y, scale, rotation } : l)), []);
  const removeText   = useCallback((id: string) => setTextLayers(p => p.filter(l => l.id !== id)), []);

  // ── Sticker ───────────────────────────────────────────────────────────────
  const [stickers,          setStickers]          = useState<StickerLayer[]>([]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const addSticker    = (emoji: string) => {
    const ns: StickerLayer = { id: Date.now().toString(), emoji, x: 0.45, y: 0.45, scale: 1, rotation: 0 };
    setStickers(p => [...p, ns]);
    history.current.push({ type: 'sticker', sticker: ns });
    setShowStickerPicker(false);
  };
  const updateSticker = useCallback((id: string, x: number, y: number, scale: number, rotation: number) =>
    setStickers(p => p.map(s => s.id === id ? { ...s, x, y, scale, rotation } : s)), []);
  const removeSticker = useCallback((id: string) => setStickers(p => p.filter(s => s.id !== id)), []);

  // ── Trim ──────────────────────────────────────────────────────────────────
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd,   setTrimEnd]   = useState(duration);
  const playerRef = useRef<any>(null);

  // ── Undo ──────────────────────────────────────────────────────────────────
  const undo = () => {
    const last = history.current.pop();
    if (!last) return;
    if (last.type === 'draw')    setDrawPaths(p => p.filter(x => x.id !== last.path.id));
    if (last.type === 'mask')    setMasks(p => p.filter(x => x.id !== last.mask.id));
    if (last.type === 'text')    setTextLayers(p => p.filter(x => x.id !== last.layer.id));
    if (last.type === 'sticker') setStickers(p => p.filter(x => x.id !== last.sticker.id));
  };

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    const hasTrim = mediaType === 'video' && (trimStart > 0.1 || trimEnd < duration - 0.1);
    onConfirm({ uri, filterKey: 'none', trimData: hasTrim ? { start: trimStart, end: trimEnd } : undefined, textLayers, drawPaths, masks, stickers });
  }, [uri, mediaType, trimStart, trimEnd, duration, textLayers, drawPaths, masks, stickers, onConfirm]);

  // ── Outils ────────────────────────────────────────────────────────────────
  const tools: { key: Tool; icon: string; label: string }[] = mediaType === 'image'
    ? [
        { key: 'crop',    icon: 'crop',    label: 'Rogner'   },
        { key: 'draw',    icon: 'edit-2',  label: 'Dessiner' },
        { key: 'text',    icon: 'type',    label: 'Texte'    },
        { key: 'mask',    icon: 'eye-off', label: 'Masquer'  },
        { key: 'sticker', icon: 'smile',   label: 'Sticker'  },
      ]
    : [
        { key: 'trim',    icon: 'scissors',label: 'Rogner'   },
        { key: 'text',    icon: 'type',    label: 'Texte'    },
        { key: 'sticker', icon: 'smile',   label: 'Sticker'  },
      ];

  const isCrop = activeTool === 'crop';
  const isDraw = activeTool === 'draw';
  const isMask = activeTool === 'mask';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[st.root, { paddingBottom: insets.bottom }]}>

      {/* Header */}
      <View style={[st.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TouchableOpacity onPress={onCancel} style={st.iconBtn}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={undo} style={st.iconBtn}>
          <Icon name="corner-ccw" size={18} color="#fff" />
        </TouchableOpacity>
        {isCrop && (
          <TouchableOpacity onPress={resetCrop} style={st.iconBtn}>
            <Icon name="refresh-cw" size={16} color="#fff" />
          </TouchableOpacity>
        )}
        {isDraw && (
          <TouchableOpacity onPress={() => setErasing(e => !e)} style={[st.iconBtn, erasing && st.iconBtnOn]}>
            <Icon name="delete" size={18} color={erasing ? '#7B3FF2' : '#fff'} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={handleConfirm} style={st.doneBtn} activeOpacity={0.85}>
          <LinearGradient colors={['#7B3FF2','#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.doneBtnInner}>
            <Text style={st.doneLabel}>Suivant</Text>
            <Icon name="chevron-right" size={14} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Preview */}
      <View style={st.previewWrap}>
        <View style={[st.frame, { width: PREVIEW_W, height: PREVIEW_H }]}>

          {/* Media — crop utilise GestureDetector, sinon View simple */}
          {isCrop ? (
            <GestureDetector gesture={cropGesture}>
              <Animated.View style={[StyleSheet.absoluteFill, cropStyle]}>
                {mediaType === 'image'
                  ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <VideoEditorPreview uri={uri} style={StyleSheet.absoluteFill} playerRef={playerRef} />}
              </Animated.View>
            </GestureDetector>
          ) : (
            <View style={StyleSheet.absoluteFill}>
              {mediaType === 'image'
                ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : <VideoEditorPreview uri={uri} style={StyleSheet.absoluteFill} playerRef={playerRef} />}
            </View>
          )}

          {/* Grille crop */}
          {isCrop && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {[33.33, 66.66].map(p => (
                <View key={`h${p}`} style={[st.grid, { top: `${p}%` as any, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
              ))}
              {[33.33, 66.66].map(p => (
                <View key={`v${p}`} style={[st.grid, { left: `${p}%` as any, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
              ))}
            </View>
          )}

          {/* Dessin SVG — PanResponder actif seulement en mode dessin */}
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents={isDraw ? 'box-only' : 'none'}
            {...(isDraw && !erasing ? drawPan.panHandlers : {})}
          >
            <Svg width={PREVIEW_W} height={PREVIEW_H} style={StyleSheet.absoluteFill}>
              {drawPaths.map(p => (
                <Path key={p.id} d={p.d} stroke={p.color} strokeWidth={p.width}
                  fill="none" strokeLinecap="round" strokeLinejoin="round"
                  onPress={erasing ? () => erasePath(p.id) : undefined} />
              ))}
              {livePath.length > 0 && (
                <Path d={livePath} stroke={drawColor} strokeWidth={drawWidth}
                  fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </Svg>
          </View>

          {/* Masques — PanResponder actif seulement en mode masque */}
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents={isMask ? 'box-only' : 'none'}
            {...(isMask ? maskPan.panHandlers : {})}
          >
            {masks.map(m => (
              <TouchableOpacity
                key={m.id}
                onPress={() => removeMask(m.id)}
                style={[ms.mask, { left: m.x, top: m.y, width: m.w, height: m.h }]}
              >
                <View style={ms.inner} />
                <View style={ms.x}><Icon name="x" size={10} color="#fff" /></View>
              </TouchableOpacity>
            ))}
            {drawingMask && drawingMask.w > 5 && drawingMask.h > 5 && (
              <View style={[ms.preview, { left: drawingMask.x, top: drawingMask.y, width: drawingMask.w, height: drawingMask.h }]} />
            )}
          </View>

          {/* Textes */}
          {textLayers.map(l => (
            <DraggableText key={l.id} layer={l} containerW={PREVIEW_W} containerH={PREVIEW_H} onUpdate={updateText} onRemove={removeText} />
          ))}

          {/* Stickers */}
          {stickers.map(s => (
            <DraggableSticker key={s.id} sticker={s} containerW={PREVIEW_W} containerH={PREVIEW_H} onUpdate={updateSticker} onRemove={removeSticker} />
          ))}
        </View>
      </View>

      {/* Barre d'outils */}
      <View style={st.toolBar}>
        {tools.map(t => (
          <TouchableOpacity
            key={t.key}
            onPress={() => {
              if (t.key === 'text')    { setActiveTool('text'); setShowTextModal(true); }
              else if (t.key === 'sticker') { setActiveTool('sticker'); setShowStickerPicker(true); }
              else { setActiveTool(t.key); setErasing(false); }
            }}
            style={[st.toolBtn, activeTool === t.key && st.toolBtnOn]}
            activeOpacity={0.75}
          >
            <Icon name={t.icon} size={20} color={activeTool === t.key ? '#7B3FF2' : 'rgba(255,255,255,0.6)'} />
            <Text style={[st.toolLabel, activeTool === t.key && st.toolLabelOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Panneau contextuel dessin */}
      {isDraw && (
        <View style={st.panel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.colorRow}>
            {DRAW_COLORS.map(c => (
              <TouchableOpacity key={c} onPress={() => { setDrawColor(c); setErasing(false); }}
                style={[st.dot, { backgroundColor: c }, drawColor === c && !erasing && st.dotSel]} />
            ))}
          </ScrollView>
          <View style={st.widthRow}>
            {[2, 4, 8, 14].map(w => (
              <TouchableOpacity key={w} onPress={() => setDrawWidth(w)} style={[st.wBtn, drawWidth === w && st.wBtnOn]}>
                <View style={{ width: w + 6, height: w + 6, borderRadius: (w + 6) / 2, backgroundColor: erasing ? '#666' : drawColor }} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setErasing(e => !e)} style={[st.eraserBtn, erasing && st.eraserBtnOn]}>
              <Icon name="delete" size={15} color={erasing ? '#7B3FF2' : 'rgba(255,255,255,0.6)'} />
              <Text style={[st.eraserLabel, erasing && { color: '#7B3FF2' }]}>Gomme</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Panneau contextuel masque */}
      {isMask && (
        <View style={st.panel}>
          <Text style={st.hint}>Tracez un rectangle sur la zone a masquer</Text>
          <Text style={st.hintSub}>Appuyez sur un masque pour le supprimer</Text>
        </View>
      )}

      {/* Panneau contextuel crop */}
      {isCrop && (
        <View style={st.panel}>
          <Text style={st.hint}>Pincez pour zoomer · glissez pour repositionner</Text>
        </View>
      )}

      {/* Trim */}
      {activeTool === 'trim' && mediaType === 'video' && duration > 0 && (
        <View style={st.panel}>
          <TrimBar duration={duration} onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }} playerRef={playerRef} />
        </View>
      )}

      {/* Modal texte */}
      <Modal visible={showTextModal} transparent animationType="fade">
        <KeyboardAvoidingView style={st.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowTextModal(false)} />
          <View style={st.textModal}>
            <Text style={st.modalTitle}>Ajouter du texte</Text>
            <TextInput
              style={[st.textInput, { color: textColor, fontWeight: textBold ? 'bold' : 'normal', fontSize: textSize }]}
              placeholder="Votre texte..." placeholderTextColor="rgba(255,255,255,0.3)"
              value={textInput} onChangeText={setTextInput} autoFocus multiline maxLength={120}
            />
            <Text style={st.pickerLabel}>Couleur du texte</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.colorRow}>
              {TEXT_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setTextColor(c)} style={[st.dot, { backgroundColor: c }, textColor === c && st.dotSel]} />
              ))}
            </ScrollView>
            <Text style={st.pickerLabel}>Fond</Text>
            <View style={st.bgRow}>
              {(['none', 'semi', 'solid'] as TextBg[]).map(b => (
                <TouchableOpacity key={b} onPress={() => setTextBg(b)} style={[st.bgBtn, textBg === b && st.bgBtnOn]}>
                  <Text style={[st.bgBtnLabel, textBg === b && { color: '#7B3FF2' }]}>
                    {b === 'none' ? 'Aucun' : b === 'semi' ? 'Semi' : 'Plein'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {textBg !== 'none' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.colorRow}>
                {TEXT_BG_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setTextBgColor(c)} style={[st.dot, { backgroundColor: c }, textBgColor === c && st.dotSel]} />
                ))}
              </ScrollView>
            )}
            <View style={st.textOpts}>
              <Text style={st.textOptLabel}>Taille</Text>
              {[16, 20, 26, 34].map(sz => (
                <TouchableOpacity key={sz} onPress={() => setTextSize(sz)} style={[st.szBtn, textSize === sz && st.szBtnOn]}>
                  <Text style={[st.szBtnLabel, textSize === sz && { color: '#7B3FF2' }]}>{sz}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setTextBold(b => !b)} style={[st.boldBtn, textBold && st.boldBtnOn]}>
                <Text style={[st.boldLabel, textBold && { color: '#7B3FF2' }]}>G</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={addText} style={st.addBtn} activeOpacity={0.85}>
              <LinearGradient colors={['#7B3FF2','#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.addBtnInner}>
                <Text style={st.addBtnLabel}>Ajouter</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Picker stickers */}
      <Modal visible={showStickerPicker} transparent animationType="slide">
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowStickerPicker(false)} />
        <View style={st.stickerModal}>
          <Text style={st.modalTitle}>Choisir un sticker</Text>
          <View style={st.stickerGrid}>
            {STICKER_LIST.map(e => (
              <TouchableOpacity key={e} onPress={() => addSticker(e)} style={st.stickerItem}>
                <Text style={{ fontSize: 34 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  mask:    { position: 'absolute', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 4 },
  inner:   { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.82)' },
  x:       { position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E91E63', alignItems: 'center', justifyContent: 'center' },
  preview: { position: 'absolute', borderWidth: 2, borderColor: '#fff', borderStyle: 'dashed', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 4 },
});

const st = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#0A0A0A' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  iconBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  iconBtnOn:    { backgroundColor: 'rgba(123,63,242,0.25)', borderWidth: 1, borderColor: '#7B3FF2' },
  doneBtn:      { borderRadius: 20, overflow: 'hidden' },
  doneBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9 },
  doneLabel:    { color: '#fff', fontWeight: '700', fontSize: 14 },

  previewWrap: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  frame:       { borderRadius: 14, overflow: 'hidden', backgroundColor: '#111' },
  grid:        { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.18)' },

  toolBar:   { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  toolBtn:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 7, borderRadius: 10 },
  toolBtnOn: { backgroundColor: 'rgba(123,63,242,0.18)' },
  toolLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },
  toolLabelOn:{ color: '#7B3FF2' },

  panel:    { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  colorRow: { gap: 8, paddingHorizontal: 4, paddingVertical: 4, alignItems: 'center' },
  dot:      { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  dotSel:   { borderColor: '#fff', transform: [{ scale: 1.2 }] },
  widthRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wBtn:     { padding: 6, borderRadius: 8 },
  wBtnOn:   { backgroundColor: 'rgba(123,63,242,0.2)' },
  eraserBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  eraserBtnOn:{ backgroundColor: 'rgba(123,63,242,0.18)', borderWidth: 1, borderColor: '#7B3FF2' },
  eraserLabel:{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  hint:     { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' },
  hintSub:  { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' },

  modalBg:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  textModal:  { backgroundColor: '#1A1A2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  modalTitle: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 2 },
  textInput:  { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, fontSize: 20, color: '#fff', minHeight: 72, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pickerLabel:{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  bgRow:      { flexDirection: 'row', gap: 8 },
  bgBtn:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  bgBtnOn:    { backgroundColor: 'rgba(123,63,242,0.22)', borderWidth: 1, borderColor: '#7B3FF2' },
  bgBtnLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  textOpts:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textOptLabel:{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginRight: 4 },
  szBtn:      { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)' },
  szBtnOn:    { backgroundColor: 'rgba(123,63,242,0.25)' },
  szBtnLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  boldBtn:    { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  boldBtnOn:  { backgroundColor: 'rgba(123,63,242,0.25)' },
  boldLabel:  { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '900' },
  addBtn:     { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  addBtnInner:{ paddingVertical: 13, alignItems: 'center' },
  addBtnLabel:{ color: '#fff', fontWeight: '700', fontSize: 15 },

  stickerModal:{ backgroundColor: '#1A1A2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stickerItem: { width: (W - 80) / 5, alignItems: 'center', paddingVertical: 8 },
});
