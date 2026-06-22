import React, { useState, useCallback, useRef } from 'react';
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

// ── Types ─────────────────────────────────────────────────────────────────────

export type FilterKey = 'none';

export const STORY_FILTERS = [{ key: 'none' as FilterKey, label: 'Original', overlay: 'transparent', opacity: 0 }];

export type TextBg = 'none' | 'solid' | 'semi';

export interface TextLayer {
  id: string;
  text: string;
  color: string;
  bg: TextBg;
  bgColor: string;
  fontSize: number;
  x: number;
  y: number;
  bold: boolean;
  rotation: number;
  scale: number;
}

export interface DrawPath {
  id: string;
  d: string;
  color: string;
  width: number;
}

export interface MaskRect {
  id: string;
  x: number; y: number;
  w: number; h: number;
}

export interface StickerLayer {
  id: string;
  emoji: string;
  x: number; y: number;
  scale: number;
  rotation: number;
}

export interface EditorResult {
  uri:        string;
  filterKey:  FilterKey;
  trimData?:  { start: number; end: number };
  textLayers: TextLayer[];
  drawPaths:  DrawPath[];
  masks:      MaskRect[];
  stickers:   StickerLayer[];
}

interface Props {
  uri:       string;
  mediaType: 'image' | 'video';
  duration?: number;
  onConfirm: (result: EditorResult) => void;
  onCancel:  () => void;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const DRAW_COLORS = ['#FFFFFF','#000000','#E91E63','#2196F3','#4CAF50','#FF9800','#9C27B0','#F44336','#FFEB3B','#00BCD4'];
const TEXT_COLORS = ['#FFFFFF','#000000','#E91E63','#2196F3','#4CAF50','#FF9800','#9C27B0','#FFEB3B','#F44336','#00BCD4'];
const TEXT_BG_COLORS = ['#000000','#FFFFFF','#7B3FF2','#E91E63','#2196F3','#4CAF50','#FF9800','#FF5722'];
const STICKER_LIST = ['😂','❤️','🔥','👍','😍','🎉','💯','😭','🤔','👀','✨','💀','🙏','😤','💪','🥳','😊','🤣','👏','💥','🎵','🌈','⚡','🦋','🌸','🍕','🏆','🎯','🌙','💎'];
const TRIM_W = W - 48;
const MAX_DUR = 90;

// Convertit un tableau de points en commande SVG Path avec courbes cubiques
function pointsToSvgPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const cp1x = (pts[i - 1].x + pts[i].x) / 2;
    const cp1y = (pts[i - 1].y + pts[i].y) / 2;
    const cp2x = (pts[i].x + pts[i + 1].x) / 2;
    const cp2y = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${cp1x} ${cp1y} ${cp2x} ${cp2y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

// ── VideoEditorPreview ────────────────────────────────────────────────────────

const VideoEditorPreview: React.FC<{
  uri: string;
  style: any;
  playerRef: React.RefObject<any>;
}> = ({ uri, style, playerRef }) => {
  const player = useVideoPlayer({ uri }, p => { p.loop = true; p.muted = false; });
  playerRef.current = player;
  return <VideoView player={player} style={style} resizeMode="cover" />;
};

// ── TrimBar ───────────────────────────────────────────────────────────────────

const TrimBar: React.FC<{
  duration: number;
  onChange: (start: number, end: number) => void;
  playerRef: React.RefObject<any>;
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

  const leftPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderMove: (_, g) => {
      const nr = clamp(startRef.current / duration + g.dx / TRIM_W);
      const maxEnd = Math.min(nr + MAX_DUR / duration, 1);
      const newEnd = endRef.current / duration > maxEnd ? maxEnd * duration : endRef.current;
      startRef.current = nr * duration;
      endRef.current   = newEnd;
      setStartR(nr);
      setEndR(newEnd / duration);
      commit(Math.round(nr * duration * 10) / 10, Math.round(newEnd * 10) / 10);
    },
  });

  const rightPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderMove: (_, g) => {
      const maxRatio = Math.min(startRef.current / duration + MAX_DUR / duration, 1);
      const nr = Math.min(maxRatio, clamp(endRef.current / duration + g.dx / TRIM_W));
      if (nr * duration < startRef.current + 1) return;
      endRef.current = nr * duration;
      setEndR(nr);
      commit(Math.round(startRef.current * 10) / 10, Math.round(nr * duration * 10) / 10);
    },
  });

  const startX = startR * TRIM_W;
  const endX   = endR   * TRIM_W;
  const tooLong = (endRef.current - startRef.current) > MAX_DUR;

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

  return (
    <View style={tb.wrap}>
      <Text style={tb.time}>
        {fmt(disp.start)} — {fmt(disp.end)}
        {'  '}
        <Text style={{ color: tooLong ? '#E91E63' : '#7B3FF2' }}>
          ({Math.round((disp.end - disp.start) * 10) / 10}s)
        </Text>
      </Text>
      <View style={tb.track}>
        <View style={[tb.sel, { left: startX, width: Math.max(0, endX - startX) }]} />
        <View style={[tb.handle, tb.hL, { left: startX }]} {...leftPan.panHandlers}>
          <View style={tb.bar} />
        </View>
        <View style={[tb.handle, tb.hR, { left: Math.max(0, endX - 22) }]} {...rightPan.panHandlers}>
          <View style={tb.bar} />
        </View>
      </View>
      <TouchableOpacity onPress={togglePlay} style={tb.playBtn}>
        <Icon name={playing ? 'pause' : 'play'} size={16} color="#fff" />
        <Text style={tb.playLabel}>{playing ? 'Pause' : 'Apercu du segment'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const tb = StyleSheet.create({
  wrap:    { paddingHorizontal: 24, gap: 10, marginTop: 4 },
  time:    { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  track:   { height: 48, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, position: 'relative', overflow: 'visible' },
  sel:     { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(123,63,242,0.35)', borderWidth: 2, borderColor: '#7B3FF2', borderRadius: 6 },
  handle:  { position: 'absolute', top: 0, bottom: 0, width: 22, backgroundColor: '#7B3FF2', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  hL:     { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  hR:     { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  bar:     { width: 3, height: 20, backgroundColor: '#fff', borderRadius: 2 },
  playBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(123,63,242,0.25)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'center' },
  playLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

// ── MaskOverlay ───────────────────────────────────────────────────────────────

const MaskOverlay: React.FC<{
  width: number; height: number;
  masks: MaskRect[];
  active: boolean;
  onNewMask: (m: MaskRect) => void;
  onRemoveMask: (id: string) => void;
}> = ({ masks, active, onNewMask, onRemoveMask }) => {
  const startPos = useRef({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => active,
    onMoveShouldSetPanResponder:  () => active,
    onPanResponderGrant: (e) => {
      startPos.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      setDrawing({ x: startPos.current.x, y: startPos.current.y, w: 0, h: 0 });
    },
    onPanResponderMove: (e) => {
      const dx = e.nativeEvent.locationX - startPos.current.x;
      const dy = e.nativeEvent.locationY - startPos.current.y;
      setDrawing({
        x: dx < 0 ? e.nativeEvent.locationX : startPos.current.x,
        y: dy < 0 ? e.nativeEvent.locationY : startPos.current.y,
        w: Math.abs(dx), h: Math.abs(dy),
      });
    },
    onPanResponderRelease: () => {
      if (drawing && drawing.w > 20 && drawing.h > 20) {
        onNewMask({ id: Date.now().toString(), ...drawing });
      }
      setDrawing(null);
    },
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={active ? 'box-only' : 'none'} {...(active ? pan.panHandlers : {})}>
      {masks.map(m => (
        <TouchableOpacity
          key={m.id}
          onPress={() => onRemoveMask(m.id)}
          style={[ms.mask, { left: m.x, top: m.y, width: m.w, height: m.h }]}
        >
          <View style={ms.maskInner} />
          <View style={ms.maskX}>
            <Icon name="x" size={10} color="#fff" />
          </View>
        </TouchableOpacity>
      ))}
      {drawing && drawing.w > 5 && drawing.h > 5 && (
        <View style={[ms.maskPreview, { left: drawing.x, top: drawing.y, width: drawing.w, height: drawing.h }]} />
      )}
    </View>
  );
};

const ms = StyleSheet.create({
  mask:        { position: 'absolute', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 4 },
  maskInner:   { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.85)' },
  maskX:       { position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E91E63', alignItems: 'center', justifyContent: 'center' },
  maskPreview: { position: 'absolute', borderWidth: 2, borderColor: '#fff', borderStyle: 'dashed', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4 },
});

// ── DraggableSticker — pan + pinch + rotation ─────────────────────────────────

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

  const savedX   = useSharedValue(sticker.x * containerW);
  const savedY   = useSharedValue(sticker.y * containerH);
  const savedSc  = useSharedValue(sticker.scale);
  const savedRot = useSharedValue(sticker.rotation);

  const panG = Gesture.Pan()
    .onStart(() => { savedX.value = x.value; savedY.value = y.value; })
    .onUpdate(e => { x.value = savedX.value + e.translationX; y.value = savedY.value + e.translationY; })
    .onEnd(() => { onUpdate(sticker.id, x.value / containerW, y.value / containerH, sc.value, rot.value); });

  const pinchG = Gesture.Pinch()
    .onStart(() => { savedSc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(0.3, Math.min(4, savedSc.value * e.scale)); })
    .onEnd(() => { onUpdate(sticker.id, x.value / containerW, y.value / containerH, sc.value, rot.value); });

  const rotG = Gesture.Rotation()
    .onStart(() => { savedRot.value = rot.value; })
    .onUpdate(e => { rot.value = savedRot.value + e.rotation; })
    .onEnd(() => { onUpdate(sticker.id, x.value / containerW, y.value / containerH, sc.value, rot.value); });

  const combined = Gesture.Simultaneous(panG, Gesture.Simultaneous(pinchG, rotG));

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x.value - 24,
    top:  y.value - 24,
    transform: [{ scale: sc.value }, { rotate: `${rot.value}rad` }],
  }));

  return (
    <GestureDetector gesture={combined}>
      <Animated.View style={style}>
        <Text style={{ fontSize: 42 }}>{sticker.emoji}</Text>
        <TouchableOpacity onPress={() => onRemove(sticker.id)} style={sk.removeBtn}>
          <Icon name="x" size={8} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

const sk = StyleSheet.create({
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E91E63', alignItems: 'center', justifyContent: 'center' },
});

// ── DraggableText — pan + pinch + rotation ────────────────────────────────────

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

  const savedX   = useSharedValue(layer.x * containerW);
  const savedY   = useSharedValue(layer.y * containerH);
  const savedSc  = useSharedValue(layer.scale);
  const savedRot = useSharedValue(layer.rotation);

  const panG = Gesture.Pan()
    .onStart(() => { savedX.value = x.value; savedY.value = y.value; })
    .onUpdate(e => { x.value = savedX.value + e.translationX; y.value = savedY.value + e.translationY; })
    .onEnd(() => { onUpdate(layer.id, x.value / containerW, y.value / containerH, sc.value, rot.value); });

  const pinchG = Gesture.Pinch()
    .onStart(() => { savedSc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(0.5, Math.min(4, savedSc.value * e.scale)); })
    .onEnd(() => { onUpdate(layer.id, x.value / containerW, y.value / containerH, sc.value, rot.value); });

  const rotG = Gesture.Rotation()
    .onStart(() => { savedRot.value = rot.value; })
    .onUpdate(e => { rot.value = savedRot.value + e.rotation; })
    .onEnd(() => { onUpdate(layer.id, x.value / containerW, y.value / containerH, sc.value, rot.value); });

  const combined = Gesture.Simultaneous(panG, Gesture.Simultaneous(pinchG, rotG));

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x.value,
    top:  y.value,
    transform: [{ scale: sc.value }, { rotate: `${rot.value}rad` }],
  }));

  const bgStyle = layer.bg === 'none'
    ? {}
    : { backgroundColor: layer.bg === 'solid' ? layer.bgColor : layer.bgColor + 'BB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 };

  return (
    <GestureDetector gesture={combined}>
      <Animated.View style={[style, bgStyle]}>
        <Text style={{
          color: layer.color,
          fontSize: layer.fontSize,
          fontWeight: layer.bold ? 'bold' : 'normal',
          textShadowColor: layer.bg === 'none' ? 'rgba(0,0,0,0.7)' : 'transparent',
          textShadowOffset: { width: 1, height: 1 },
          textShadowRadius: 3,
        }}>
          {layer.text}
        </Text>
        <TouchableOpacity onPress={() => onRemove(layer.id)} style={sk.removeBtn}>
          <Icon name="x" size={8} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

// ── StoryMediaEditor ──────────────────────────────────────────────────────────

type Tool = 'crop' | 'draw' | 'text' | 'mask' | 'sticker' | 'trim';

export const StoryMediaEditor: React.FC<Props> = ({
  uri, mediaType, duration = 0, onConfirm, onCancel,
}) => {
  const insets = useSafeAreaInsets();

  // ── Tool state ────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<Tool>(mediaType === 'image' ? 'crop' : 'trim');

  // ── Undo stack ────────────────────────────────────────────────────────────
  type HistoryEntry =
    | { type: 'draw'; path: DrawPath }
    | { type: 'mask'; mask: MaskRect }
    | { type: 'text'; layer: TextLayer }
    | { type: 'sticker'; sticker: StickerLayer };
  const history = useRef<HistoryEntry[]>([]);

  // ── Crop ──────────────────────────────────────────────────────────────────
  const tx = useSharedValue(0); const ty = useSharedValue(0); const sc = useSharedValue(1);
  const stx = useSharedValue(0); const sty = useSharedValue(0); const ssc = useSharedValue(1);
  const cropRef = useRef({ tx: 0, ty: 0, scale: 1 });

  const panG = Gesture.Pan()
    .onStart(() => { stx.value = tx.value; sty.value = ty.value; })
    .onUpdate(e => { tx.value = stx.value + e.translationX; ty.value = sty.value + e.translationY; })
    .onEnd(() => { cropRef.current.tx = tx.value; cropRef.current.ty = ty.value; });

  const pinchG = Gesture.Pinch()
    .onStart(() => { ssc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(1, Math.min(5, ssc.value * e.scale)); })
    .onEnd(() => { cropRef.current.scale = sc.value; });

  const cropGesture = Gesture.Simultaneous(panG, pinchG);

  const cropStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
  }));

  const resetCrop = () => {
    tx.value = withSpring(0); ty.value = withSpring(0); sc.value = withSpring(1);
    cropRef.current = { tx: 0, ty: 0, scale: 1 };
  };

  // ── Draw ──────────────────────────────────────────────────────────────────
  const [drawColor,  setDrawColor]  = useState(DRAW_COLORS[0]);
  const [drawWidth,  setDrawWidth]  = useState(4);
  const [drawPaths,  setDrawPaths]  = useState<DrawPath[]>([]);
  const [erasing,    setErasing]    = useState(false);
  const [livePoints, setLivePoints] = useState<{ x: number; y: number }[]>([]);

  const drawPan = PanResponder.create({
    onStartShouldSetPanResponder: () => activeTool === 'draw' && !erasing,
    onMoveShouldSetPanResponder:  () => activeTool === 'draw' && !erasing,
    onPanResponderGrant: (e) => {
      setLivePoints([{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]);
    },
    onPanResponderMove: (e) => {
      setLivePoints(prev => [...prev, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]);
    },
    onPanResponderRelease: () => {
      setLivePoints(prev => {
        if (prev.length >= 2) {
          const newPath: DrawPath = {
            id: Date.now().toString(),
            d: pointsToSvgPath(prev),
            color: drawColor,
            width: drawWidth,
          };
          setDrawPaths(old => [...old, newPath]);
          history.current.push({ type: 'draw', path: newPath });
        }
        return [];
      });
    },
  });

  const erasePath = (id: string) => setDrawPaths(prev => prev.filter(p => p.id !== id));

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
    const newLayer: TextLayer = {
      id:       Date.now().toString(),
      text:     textInput.trim(),
      color:    textColor,
      bg:       textBg,
      bgColor:  textBgColor,
      fontSize: textSize,
      x: 0.4,
      y: 0.4,
      bold:     textBold,
      rotation: 0,
      scale:    1,
    };
    setTextLayers(prev => [...prev, newLayer]);
    history.current.push({ type: 'text', layer: newLayer });
    setTextInput('');
    setShowTextModal(false);
  };

  const updateText = (id: string, x: number, y: number, scale: number, rotation: number) =>
    setTextLayers(prev => prev.map(l => l.id === id ? { ...l, x, y, scale, rotation } : l));
  const removeText = (id: string) => setTextLayers(prev => prev.filter(l => l.id !== id));

  // ── Mask ──────────────────────────────────────────────────────────────────
  const [masks, setMasks] = useState<MaskRect[]>([]);
  const addMask    = (m: MaskRect) => { setMasks(prev => [...prev, m]); history.current.push({ type: 'mask', mask: m }); };
  const removeMask = (id: string)  => setMasks(prev => prev.filter(m => m.id !== id));

  // ── Sticker ───────────────────────────────────────────────────────────────
  const [stickers,          setStickers]          = useState<StickerLayer[]>([]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const addSticker = (emoji: string) => {
    const newSticker: StickerLayer = { id: Date.now().toString(), emoji, x: 0.45, y: 0.45, scale: 1, rotation: 0 };
    setStickers(prev => [...prev, newSticker]);
    history.current.push({ type: 'sticker', sticker: newSticker });
    setShowStickerPicker(false);
  };
  const updateSticker = (id: string, x: number, y: number, scale: number, rotation: number) =>
    setStickers(prev => prev.map(s => s.id === id ? { ...s, x, y, scale, rotation } : s));
  const removeSticker = (id: string) => setStickers(prev => prev.filter(s => s.id !== id));

  // ── Trim ──────────────────────────────────────────────────────────────────
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd,   setTrimEnd]   = useState(duration);
  const playerRef = useRef<any>(null);

  // ── Undo global ───────────────────────────────────────────────────────────
  const undo = () => {
    const last = history.current.pop();
    if (!last) return;
    if (last.type === 'draw')    setDrawPaths(prev => prev.filter(p => p.id !== last.path.id));
    if (last.type === 'mask')    setMasks(prev => prev.filter(m => m.id !== last.mask.id));
    if (last.type === 'text')    setTextLayers(prev => prev.filter(l => l.id !== last.layer.id));
    if (last.type === 'sticker') setStickers(prev => prev.filter(s => s.id !== last.sticker.id));
  };

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    const hasTrim = mediaType === 'video' && (trimStart > 0.1 || trimEnd < duration - 0.1);
    onConfirm({
      uri,
      filterKey: 'none',
      trimData:   hasTrim ? { start: trimStart, end: trimEnd } : undefined,
      textLayers,
      drawPaths,
      masks,
      stickers,
    });
  }, [uri, mediaType, trimStart, trimEnd, duration, textLayers, drawPaths, masks, stickers, onConfirm]);

  // ── Outils selon le type de media ────────────────────────────────────────
  const tools: { key: Tool; icon: string; label: string }[] = mediaType === 'image'
    ? [
        { key: 'crop',    icon: 'crop',         label: 'Rogner'   },
        { key: 'draw',    icon: 'edit-2',        label: 'Dessiner' },
        { key: 'text',    icon: 'type',          label: 'Texte'    },
        { key: 'mask',    icon: 'eye-off',       label: 'Masquer'  },
        { key: 'sticker', icon: 'smile',         label: 'Sticker'  },
      ]
    : [
        { key: 'trim',    icon: 'scissors',      label: 'Rogner'   },
        { key: 'text',    icon: 'type',          label: 'Texte'    },
        { key: 'sticker', icon: 'smile',         label: 'Sticker'  },
      ];

  const isCrop = activeTool === 'crop';
  const isDraw = activeTool === 'draw';
  const isMask = activeTool === 'mask';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[st.root, { paddingBottom: insets.bottom }]}>

      {/* ── Header ── */}
      <View style={[st.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TouchableOpacity onPress={onCancel} style={st.iconBtn}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Undo toujours dispo */}
        <TouchableOpacity onPress={undo} style={st.iconBtn}>
          <Icon name="corner-ccw" size={18} color="#fff" />
        </TouchableOpacity>

        {/* Reset crop */}
        {isCrop && (
          <TouchableOpacity onPress={resetCrop} style={st.iconBtn}>
            <Icon name="refresh-cw" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Eraser toggle quand dessiner */}
        {isDraw && (
          <TouchableOpacity
            onPress={() => setErasing(e => !e)}
            style={[st.iconBtn, erasing && st.iconBtnOn]}
          >
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

      {/* ── Preview ── */}
      <View style={st.previewWrap}>
        <View style={[st.frame, { width: PREVIEW_W, height: PREVIEW_H }]}>

          {/* Media */}
          {isCrop ? (
            <GestureDetector gesture={cropGesture}>
              <Animated.View style={[StyleSheet.absoluteFill, cropStyle]}>
                {mediaType === 'image'
                  ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <VideoEditorPreview uri={uri} style={StyleSheet.absoluteFill} playerRef={playerRef} />
                }
              </Animated.View>
            </GestureDetector>
          ) : (
            <View style={StyleSheet.absoluteFill}>
              {mediaType === 'image'
                ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : <VideoEditorPreview uri={uri} style={StyleSheet.absoluteFill} playerRef={playerRef} />
              }
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

          {/* Dessin SVG — zone de touch active si outil dessin */}
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents={isDraw ? 'box-only' : 'none'}
            {...(isDraw && !erasing ? drawPan.panHandlers : {})}
          >
            <Svg width={PREVIEW_W} height={PREVIEW_H} style={StyleSheet.absoluteFill}>
              {drawPaths.map(p => (
                <Path
                  key={p.id}
                  d={p.d}
                  stroke={p.color}
                  strokeWidth={p.width}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onPress={erasing ? () => erasePath(p.id) : undefined}
                />
              ))}
              {livePoints.length >= 2 && (
                <Path
                  d={pointsToSvgPath(livePoints)}
                  stroke={drawColor}
                  strokeWidth={drawWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </Svg>
          </View>

          {/* Masques */}
          <MaskOverlay
            width={PREVIEW_W} height={PREVIEW_H}
            masks={masks}
            active={isMask}
            onNewMask={addMask}
            onRemoveMask={removeMask}
          />

          {/* Textes */}
          {textLayers.map(l => (
            <DraggableText
              key={l.id} layer={l}
              containerW={PREVIEW_W} containerH={PREVIEW_H}
              onUpdate={updateText} onRemove={removeText}
            />
          ))}

          {/* Stickers */}
          {stickers.map(s => (
            <DraggableSticker
              key={s.id} sticker={s}
              containerW={PREVIEW_W} containerH={PREVIEW_H}
              onUpdate={updateSticker} onRemove={removeSticker}
            />
          ))}
        </View>
      </View>

      {/* ── Barre d'outils ── */}
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

      {/* ── Panneau contextuel ── */}

      {/* Dessin : couleurs + epaisseur + gomme */}
      {isDraw && (
        <View style={st.panel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.colorRow}>
            {DRAW_COLORS.map(c => (
              <TouchableOpacity key={c} onPress={() => { setDrawColor(c); setErasing(false); }}
                style={[st.colorDot, { backgroundColor: c }, drawColor === c && !erasing && st.colorDotSel]} />
            ))}
          </ScrollView>
          <View style={st.widthRow}>
            {[2, 4, 8, 14].map(w => (
              <TouchableOpacity key={w} onPress={() => setDrawWidth(w)}
                style={[st.widthBtn, drawWidth === w && st.widthBtnSel]}>
                <View style={[st.widthDot, { width: w + 6, height: w + 6, borderRadius: (w + 6) / 2, backgroundColor: erasing ? '#aaa' : drawColor }]} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setErasing(e => !e)}
              style={[st.eraserBtn, erasing && st.eraserBtnOn]}
            >
              <Icon name="delete" size={16} color={erasing ? '#7B3FF2' : 'rgba(255,255,255,0.6)'} />
              <Text style={[st.eraserLabel, erasing && { color: '#7B3FF2' }]}>Gomme</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Masquer : hint */}
      {isMask && (
        <View style={st.panel}>
          <Text style={st.hintText}>Dessinez un rectangle sur la zone a masquer</Text>
          <Text style={st.hintSub}>Appuyez sur un masque pour le supprimer</Text>
        </View>
      )}

      {/* Rogner : hint */}
      {isCrop && (
        <View style={st.panel}>
          <Text style={st.hintText}>Pincez pour zoomer — glissez pour repositionner</Text>
        </View>
      )}

      {/* Trim video */}
      {activeTool === 'trim' && mediaType === 'video' && duration > 0 && (
        <View style={st.panel}>
          <TrimBar duration={duration} onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }} playerRef={playerRef} />
        </View>
      )}

      {/* ── Modal texte ── */}
      <Modal visible={showTextModal} transparent animationType="fade">
        <KeyboardAvoidingView style={st.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowTextModal(false)} />
          <View style={st.textModal}>
            <Text style={st.textModalTitle}>Ajouter du texte</Text>

            <TextInput
              style={[st.textInput, { color: textColor, fontWeight: textBold ? 'bold' : 'normal', fontSize: textSize }]}
              placeholder="Votre texte..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={textInput}
              onChangeText={setTextInput}
              autoFocus
              multiline
              maxLength={120}
            />

            {/* Couleur texte */}
            <Text style={st.pickerLabel}>Couleur du texte</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.colorRow} style={{ marginBottom: 4 }}>
              {TEXT_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setTextColor(c)}
                  style={[st.colorDot, { backgroundColor: c }, textColor === c && st.colorDotSel]} />
              ))}
            </ScrollView>

            {/* Style de fond */}
            <Text style={st.pickerLabel}>Fond</Text>
            <View style={st.bgRow}>
              {(['none', 'semi', 'solid'] as TextBg[]).map(b => (
                <TouchableOpacity
                  key={b}
                  onPress={() => setTextBg(b)}
                  style={[st.bgBtn, textBg === b && st.bgBtnOn]}
                >
                  <Text style={[st.bgBtnLabel, textBg === b && { color: '#7B3FF2' }]}>
                    {b === 'none' ? 'Aucun' : b === 'semi' ? 'Semi' : 'Plein'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Couleur de fond si applicable */}
            {textBg !== 'none' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.colorRow} style={{ marginBottom: 4 }}>
                {TEXT_BG_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setTextBgColor(c)}
                    style={[st.colorDot, { backgroundColor: c }, textBgColor === c && st.colorDotSel]} />
                ))}
              </ScrollView>
            )}

            {/* Taille + Gras */}
            <View style={st.textOptions}>
              <Text style={st.textOptionLabel}>Taille</Text>
              {[16, 20, 26, 34].map(sz => (
                <TouchableOpacity key={sz} onPress={() => setTextSize(sz)}
                  style={[st.sizeBtn, textSize === sz && st.sizeBtnSel]}>
                  <Text style={[st.sizeBtnLabel, textSize === sz && { color: '#7B3FF2' }]}>{sz}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setTextBold(b => !b)}
                style={[st.boldBtn, textBold && st.boldBtnOn]}>
                <Text style={[st.boldLabel, textBold && { color: '#7B3FF2' }]}>G</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={addText} style={st.addTextBtn} activeOpacity={0.85}>
              <LinearGradient colors={['#7B3FF2','#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.addTextBtnInner}>
                <Text style={st.addTextBtnLabel}>Ajouter</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Picker stickers ── */}
      <Modal visible={showStickerPicker} transparent animationType="slide">
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowStickerPicker(false)} />
        <View style={st.stickerModal}>
          <Text style={st.textModalTitle}>Choisir un sticker</Text>
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

const st = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#0A0A0A' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  iconBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  iconBtnOn:    { backgroundColor: 'rgba(123,63,242,0.25)', borderWidth: 1, borderColor: '#7B3FF2' },
  doneBtn:      { borderRadius: 20, overflow: 'hidden' },
  doneBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9 },
  doneLabel:    { color: '#fff', fontWeight: '700', fontSize: 14 },

  previewWrap:  { alignItems: 'center', flex: 1, justifyContent: 'center' },
  frame:        { borderRadius: 14, overflow: 'hidden', backgroundColor: '#111' },
  grid:         { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.18)' },

  toolBar:      { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  toolBtn:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 7, borderRadius: 10 },
  toolBtnOn:    { backgroundColor: 'rgba(123,63,242,0.18)' },
  toolLabel:    { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },
  toolLabelOn:  { color: '#7B3FF2' },

  panel:        { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  colorRow:     { gap: 8, paddingHorizontal: 4, paddingVertical: 4, alignItems: 'center' },
  colorDot:     { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorDotSel:  { borderColor: '#fff', transform: [{ scale: 1.2 }] },
  widthRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  widthBtn:     { padding: 6, borderRadius: 8 },
  widthBtnSel:  { backgroundColor: 'rgba(123,63,242,0.2)' },
  widthDot:     {},
  eraserBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  eraserBtnOn:  { backgroundColor: 'rgba(123,63,242,0.2)', borderWidth: 1, borderColor: '#7B3FF2' },
  eraserLabel:  { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  hintText:     { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' },
  hintSub:      { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' },

  // Modal texte
  modalBg:         { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  textModal:       { backgroundColor: '#1A1A2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  textModalTitle:  { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 2 },
  textInput:       { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, fontSize: 20, color: '#fff', minHeight: 72, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pickerLabel:     { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  bgRow:           { flexDirection: 'row', gap: 8 },
  bgBtn:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  bgBtnOn:         { backgroundColor: 'rgba(123,63,242,0.22)', borderWidth: 1, borderColor: '#7B3FF2' },
  bgBtnLabel:      { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  textOptions:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textOptionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginRight: 4 },
  sizeBtn:         { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)' },
  sizeBtnSel:      { backgroundColor: 'rgba(123,63,242,0.25)' },
  sizeBtnLabel:    { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  boldBtn:         { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  boldBtnOn:       { backgroundColor: 'rgba(123,63,242,0.25)' },
  boldLabel:       { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '900' },
  addTextBtn:      { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  addTextBtnInner: { paddingVertical: 13, alignItems: 'center' },
  addTextBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Modal stickers
  stickerModal: { backgroundColor: '#1A1A2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  stickerGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stickerItem:  { width: (W - 80) / 5, alignItems: 'center', paddingVertical: 8 },
});
