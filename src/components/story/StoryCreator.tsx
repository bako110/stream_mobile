import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Dimensions, StatusBar, Keyboard,
  Modal, KeyboardAvoidingView, Platform, ScrollView,
  PermissionsAndroid, PanResponder, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { SoundPicker } from './SoundPicker';
import { storyService } from '../../services/storyService';
import { toastService } from '../../services/toastService';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import type { StoryMediaType, StoryAudienceType } from '../../types/story';
import { cleanupTempVideos, trimVideo } from '../../services/videoCompressService';
import { cacheInBackground } from '../../services/videoCacheService';
import ImageEditor from '@react-native-community/image-editor';
import { uploadVideoFromUri, uploadImageFromUri, uploadAudioFile } from '../../services/uploadService';
import { soundService } from '../../services/soundService';
import { storyUploadState } from '../../services/storyUploadState';
import { VideoTrimmer } from './VideoTrimmer';
import { StoryCameraScreen, type StoryCameraResult } from '../../screens/Create/StoryCameraScreen';
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';

const AudioRecorderPlayerModule = require('react-native-audio-recorder-player');
const AudioRecorderPlayerClass = AudioRecorderPlayerModule.default || AudioRecorderPlayerModule;
const audioRecorder = new AudioRecorderPlayerClass();

const { width: W, height: H } = Dimensions.get('window');
const CROP_PAD_H = 40;
const CROP_PAD_V = 80;
const CROP_FW = W - CROP_PAD_H * 2;
const CROP_FH = H - CROP_PAD_V * 2;

// ── Types overlays ────────────────────────────────────────────────────────────

interface TextLayer {
  id: string; text: string; color: string; bg: 'none' | 'solid' | 'semi';
  bgColor: string; fontSize: number; x: number; y: number;
  bold: boolean; rotation: number; scale: number;
}
interface DrawPath { id: string; d: string; color: string; width: number; }
interface MaskRect { id: string; x: number; y: number; w: number; h: number; color?: string; opacity?: number; }
interface StickerLayer { id: string; emoji: string; x: number; y: number; scale: number; rotation: number; }

// ── Constantes ────────────────────────────────────────────────────────────────

const DRAW_COLORS = ['#FFFFFF','#000000','#E91E63','#2196F3','#4CAF50','#FF9800','#9C27B0','#F44336','#FFEB3B','#00BCD4'];
const TEXT_COLORS = ['#FFFFFF','#000000','#E91E63','#2196F3','#4CAF50','#FF9800','#9C27B0','#FFEB3B'];
const TEXT_BG_COLORS_EDITOR = ['#000000','#FFFFFF','#7B3FF2','#E91E63','#2196F3','#4CAF50'];
const MASK_COLORS: { label: string; color: string; opacity: number }[] = [
  { label: 'Noir',   color: '#000000', opacity: 1 },
  { label: 'Blanc',  color: '#FFFFFF', opacity: 1 },
  { label: 'Violet', color: '#7B3FF2', opacity: 1 },
  { label: 'Rose',   color: '#E91E63', opacity: 1 },
  { label: 'Bleu',   color: '#1565C0', opacity: 1 },
];
const STICKER_LIST = ['😂','❤️','🔥','👍','😍','🎉','💯','😭','🤔','👀','✨','💀','🙏','😤','💪','🥳','😊','🤣','👏','💥','🎵','🌈','⚡','🦋','🌸','🍕','🏆','🎯','🌙','💎'];
const BG_COLORS = ['#7B3FF2','#E91E63','#FF5722','#009688','#2196F3','#4CAF50','#FF9800','#795548','#000000','#1A237E'];

const FONT_STYLES: { key: string; label: string; fontFamily?: string; fontWeight?: 'normal'|'bold'|'900'; fontStyle?: 'normal'|'italic' }[] = [
  { key: 'classic',   label: 'Classique', fontWeight: 'bold' },
  { key: 'serif',     label: 'Elegant',   fontFamily: 'serif', fontWeight: 'normal' },
  { key: 'mono',      label: 'Mono',      fontFamily: 'monospace', fontWeight: 'bold' },
  { key: 'condensed', label: 'Compact',   fontFamily: 'sans-serif-condensed', fontWeight: '900' },
  { key: 'italic',    label: 'Italique',  fontFamily: 'serif', fontWeight: 'normal', fontStyle: 'italic' },
];

type StoryMode = 'text' | 'image' | 'video' | 'voice';
type Step = 'pick_mode' | 'pick_media' | 'camera' | 'record_voice' | 'pick_audio' | 'compose';
type Tool = 'none' | 'crop' | 'draw' | 'text' | 'sticker' | 'caption' | 'trim' | 'mask';


interface ModeOption {
  key: StoryMode; icon: string; iconLib: 'feather'|'material';
  label: string; sub: string; accent: string; gradient: [string, string];
}

const MODE_OPTIONS: ModeOption[] = [
  { key: 'text',  icon: 'format-text', iconLib: 'material', label: 'Texte',  sub: 'Message sur fond coloré',    accent: '#7B3FF2', gradient: ['#7B3FF2','#9B65F5'] },
  { key: 'image', icon: 'image',       iconLib: 'feather',  label: 'Photo',  sub: 'Depuis la galerie ou caméra', accent: '#2196F3', gradient: ['#1565C0','#2196F3'] },
  { key: 'video', icon: 'video',       iconLib: 'feather',  label: 'Video',  sub: "Clip jusqu'a 1m30s",          accent: '#E91E63', gradient: ['#AD1457','#E91E63'] },
  { key: 'voice', icon: 'microphone',  iconLib: 'material', label: 'Vocal',  sub: 'Message vocal direct',        accent: '#00BCD4', gradient: ['#00838F','#00BCD4'] },
];

interface Props { visible: boolean; onClose: () => void; onCreated: () => void; }

async function normalizeUri(uri: string): Promise<string> {
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) return uri;
  const ext  = uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/story_${Date.now()}.${ext}`;
  try {
    const data = await ReactNativeBlobUtil.fs.readFile(uri, 'base64');
    await ReactNativeBlobUtil.fs.writeFile(dest, data, 'base64');
  } catch {
    await ReactNativeBlobUtil.fetch('GET', uri).then(r => r.base64()).then(b64 =>
      ReactNativeBlobUtil.fs.writeFile(dest, b64, 'base64')
    );
  }
  return `file://${dest}`;
}

function pointsToPath(pts: {x:number;y:number}[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i+1].x) / 2;
    const my = (pts[i].y + pts[i+1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  d += ` L ${pts[pts.length-1].x} ${pts[pts.length-1].y}`;
  return d;
}

// ── VideoPreview ──────────────────────────────────────────────────────────────

const VideoPreview: React.FC<{ uri: string; playerRef: React.MutableRefObject<any>; startSec?: number | null }> = ({ uri, playerRef, startSec }) => {
  const start = startSec ?? 0;
  const player = useVideoPlayer({ uri }, p => {
    p.loop  = start <= 0;
    p.muted = false;
    if (start > 0) p.currentTime = start;
    p.play();
  });
  playerRef.current = player;

  useEffect(() => {
    if (start <= 0) return;
    const sub = player.addEventListener('onEnd', () => {
      player.currentTime = start;
      player.play();
    });
    return () => sub.remove();
  }, [player, start]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" />;
};

// ── DraggableText ─────────────────────────────────────────────────────────────

const DraggableText: React.FC<{
  layer: TextLayer; containerW: number; containerH: number;
  onUpdate: (id: string, x: number, y: number, scale: number, rotation: number) => void;
  onRemove: (id: string) => void;
}> = ({ layer, containerW, containerH, onUpdate, onRemove }) => {
  const x = useSharedValue(layer.x * containerW);
  const y = useSharedValue(layer.y * containerH);
  const sc = useSharedValue(layer.scale);
  const rot = useSharedValue(layer.rotation);
  const sx = useSharedValue(layer.x * containerW);
  const sy = useSharedValue(layer.y * containerH);
  const ssc = useSharedValue(layer.scale);
  const srot = useSharedValue(layer.rotation);

  const pan = Gesture.Pan()
    .onStart(() => { sx.value = x.value; sy.value = y.value; })
    .onUpdate(e => { x.value = sx.value + e.translationX; y.value = sy.value + e.translationY; })
    .onEnd(() => onUpdate(layer.id, x.value/containerW, y.value/containerH, sc.value, rot.value));
  const pinch = Gesture.Pinch()
    .onStart(() => { ssc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(0.5, Math.min(4, ssc.value * e.scale)); })
    .onEnd(() => onUpdate(layer.id, x.value/containerW, y.value/containerH, sc.value, rot.value));
  const rotate = Gesture.Rotation()
    .onStart(() => { srot.value = rot.value; })
    .onUpdate(e => { rot.value = srot.value + e.rotation; })
    .onEnd(() => onUpdate(layer.id, x.value/containerW, y.value/containerH, sc.value, rot.value));

  const style = useAnimatedStyle(() => ({
    position: 'absolute', left: x.value, top: y.value,
    transform: [{ scale: sc.value }, { rotate: `${rot.value}rad` }],
  }));

  const bgStyle = layer.bg === 'none' ? {} : {
    backgroundColor: layer.bg === 'solid' ? layer.bgColor : layer.bgColor + 'BB',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  };

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={[style, bgStyle]}>
        <Text style={{ color: layer.color, fontSize: layer.fontSize, fontWeight: layer.bold ? 'bold' : 'normal',
          textShadowColor: layer.bg === 'none' ? 'rgba(0,0,0,0.7)' : 'transparent',
          textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 }}>
          {layer.text}
        </Text>
        <TouchableOpacity onPress={() => onRemove(layer.id)} style={ol.rmBtn}>
          <Icon name="x" size={8} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

// ── DraggableSticker ──────────────────────────────────────────────────────────

const DraggableSticker: React.FC<{
  sticker: StickerLayer; containerW: number; containerH: number;
  onUpdate: (id: string, x: number, y: number, scale: number, rotation: number) => void;
  onRemove: (id: string) => void;
}> = ({ sticker, containerW, containerH, onUpdate, onRemove }) => {
  const x   = useSharedValue(sticker.x * containerW);
  const y   = useSharedValue(sticker.y * containerH);
  const sc  = useSharedValue(sticker.scale);
  const rot = useSharedValue(sticker.rotation);
  const sx  = useSharedValue(sticker.x * containerW);
  const sy  = useSharedValue(sticker.y * containerH);
  const ssc = useSharedValue(sticker.scale);
  const srot = useSharedValue(sticker.rotation);

  const id = sticker.id;

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => { sx.value = x.value; sy.value = y.value; })
    .onUpdate(e => { x.value = sx.value + e.translationX; y.value = sy.value + e.translationY; })
    .onEnd(() => onUpdate(id, x.value / containerW, y.value / containerH, sc.value, rot.value));

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => { ssc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(0.3, Math.min(5, ssc.value * e.scale)); })
    .onEnd(() => onUpdate(id, x.value / containerW, y.value / containerH, sc.value, rot.value));

  const rotate = Gesture.Rotation()
    .runOnJS(true)
    .onStart(() => { srot.value = rot.value; })
    .onUpdate(e => { rot.value = srot.value + e.rotation; })
    .onEnd(() => onUpdate(id, x.value / containerW, y.value / containerH, sc.value, rot.value));

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x.value - 28,
    top:  y.value - 28,
    transform: [{ scale: sc.value }, { rotate: `${rot.value}rad` }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, Gesture.Simultaneous(pinch, rotate))}>
      <Animated.View style={style}>
        <Text style={{ fontSize: 48 }}>{sticker.emoji}</Text>
        <TouchableOpacity onPress={() => onRemove(id)} style={ol.rmBtn}>
          <Icon name="x" size={8} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

const ol = StyleSheet.create({
  rmBtn: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E91E63', alignItems: 'center', justifyContent: 'center' },
});

// ── StoryCreator ──────────────────────────────────────────────────────────────

export const StoryCreator: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [step,         setStep]         = useState<Step>('camera');
  const [mode,         setMode]         = useState<StoryMode>('text');
  const [localUri,     setLocalUri]     = useState<string | null>(null);
  const [audioUri,     setAudioUri]     = useState<string | null>(null);
  const [audioName,    setAudioName]    = useState<string | null>(null);
  const [bgColor,      setBgColor]      = useState(BG_COLORS[0]);
  const [fontStyleKey, setFontStyleKey] = useState('classic');
  const [caption,      setCaption]      = useState('');
  const [showTrimmer,  setShowTrimmer]  = useState(false);
  const [isTrimming,   setIsTrimming]   = useState(false);
  const [videoDuration,setVideoDuration]= useState(0);
  const [trimStart,    setTrimStart]    = useState<number | null>(null);
  const [trimEnd,      setTrimEnd]      = useState<number | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [recording,    setRecording]    = useState(false);
  const [recordTime,   setRecordTime]   = useState('00:00');
  const [showSuccess,  setShowSuccess]  = useState(false);
  const playerRef   = useRef<any>(null);
  const tempFiles   = useRef<string[]>([]);
  const inputRef    = useRef<TextInput>(null);

  // ── Audience ──────────────────────────────────────────────────────────────
  const [audienceType,      setAudienceType]      = useState<StoryAudienceType>('everyone');
  const [selectedUsers,     setSelectedUsers]     = useState<string[]>([]);
  const [contacts,          setContacts]          = useState<{id:string;name:string;avatar_url:string|null}[]>([]);
  const [contactsLoading,   setContactsLoading]   = useState(false);
  const [showAudienceSheet, setShowAudienceSheet] = useState(false);
  const [contactSearch,     setContactSearch]     = useState('');
  const [myId,              setMyId]              = useState<string|null>(null);

  // ── Outil actif ───────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<Tool>('none');

  // ── Crop style WhatsApp — rectangle redimensionnable ─────────────────────
  const MIN_CROP = 80;
  const FULL      = { x: 0,  y: 0,  w: W, h: H };
  // rectangle initial avec marge pour le header (haut) et les boutons (bas)
  const CROP_INIT = { x: 16, y: 80, w: W - 32, h: H - 180 };
  const [cropRect,    setCropRect]    = useState(CROP_INIT);
  const cropRectRef   = useRef(CROP_INIT);
  const [appliedCrop, setAppliedCrop] = useState(FULL);
  const dragHandleRef = useRef<string | null>(null);
  const dragStartRef  = useRef({ x: 0, y: 0, rect: CROP_INIT });

  const resetCrop = useCallback(() => {
    setCropRect(CROP_INIT); cropRectRef.current = CROP_INIT;
    setAppliedCrop(FULL);
  }, []);

  const applyCrop = useCallback(() => {
    setAppliedCrop({ ...cropRectRef.current });
  }, []);

  const cropPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: e => {
      const tx = e.nativeEvent.pageX;
      const ty = e.nativeEvent.pageY;
      const r  = cropRectRef.current;
      const HIT = 36;
      const nearL = Math.abs(tx - r.x) < HIT;
      const nearR = Math.abs(tx - (r.x + r.w)) < HIT;
      const nearT = Math.abs(ty - r.y) < HIT;
      const nearB = Math.abs(ty - (r.y + r.h)) < HIT;
      if      (nearT && nearL) dragHandleRef.current = 'tl';
      else if (nearT && nearR) dragHandleRef.current = 'tr';
      else if (nearB && nearL) dragHandleRef.current = 'bl';
      else if (nearB && nearR) dragHandleRef.current = 'br';
      else if (nearT)          dragHandleRef.current = 't';
      else if (nearB)          dragHandleRef.current = 'b';
      else if (nearL)          dragHandleRef.current = 'l';
      else if (nearR)          dragHandleRef.current = 'r';
      else                     dragHandleRef.current = null;
      dragStartRef.current = { x: tx, y: ty, rect: { ...r } };
    },
    onPanResponderMove: e => {
      const handle = dragHandleRef.current;
      if (!handle) return;
      const dx = e.nativeEvent.pageX - dragStartRef.current.x;
      const dy = e.nativeEvent.pageY - dragStartRef.current.y;
      const s  = dragStartRef.current.rect;
      let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
      if (handle === 'l'  || handle === 'tl' || handle === 'bl') { nx = Math.min(s.x + dx, s.x + s.w - MIN_CROP); nw = s.w - (nx - s.x); }
      if (handle === 'r'  || handle === 'tr' || handle === 'br') { nw = Math.max(MIN_CROP, s.w + dx); }
      if (handle === 't'  || handle === 'tl' || handle === 'tr') { ny = Math.min(s.y + dy, s.y + s.h - MIN_CROP); nh = s.h - (ny - s.y); }
      if (handle === 'b'  || handle === 'bl' || handle === 'br') { nh = Math.max(MIN_CROP, s.h + dy); }
      nx = Math.max(0, nx); ny = Math.max(0, ny);
      nw = Math.min(nw, W - nx); nh = Math.min(nh, H - ny);
      const nr = { x: nx, y: ny, w: nw, h: nh };
      cropRectRef.current = nr;
      setCropRect(nr);
    },
    onPanResponderRelease: () => { dragHandleRef.current = null; },
  }), []);

  // ── Dessin ────────────────────────────────────────────────────────────────
  const [drawColor,   setDrawColor]   = useState(DRAW_COLORS[0]);
  const [drawWidth,   setDrawWidth]   = useState(4);
  const [drawPaths,   setDrawPaths]   = useState<DrawPath[]>([]);
  const [livePath,    setLivePath]    = useState('');
  const [erasing,     setErasing]     = useState(false);
  const livePointsRef  = useRef<{x:number;y:number}[]>([]);
  const drawColorRef   = useRef(drawColor);
  const drawWidthRef   = useRef(drawWidth);
  const erasingRef     = useRef(erasing);
  const activeToolRef  = useRef(activeTool);
  drawColorRef.current  = drawColor;
  drawWidthRef.current  = drawWidth;
  erasingRef.current    = erasing;
  activeToolRef.current = activeTool;

  const drawPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => activeToolRef.current === 'draw' && !erasingRef.current,
    onMoveShouldSetPanResponder:  () => activeToolRef.current === 'draw' && !erasingRef.current,
    onPanResponderGrant: e => {
      livePointsRef.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
      setLivePath('');
    },
    onPanResponderMove: e => {
      livePointsRef.current = [...livePointsRef.current, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
      setLivePath(pointsToPath(livePointsRef.current));
    },
    onPanResponderRelease: () => {
      if (livePointsRef.current.length >= 2) {
        const np: DrawPath = { id: Date.now().toString(), d: pointsToPath(livePointsRef.current), color: drawColorRef.current, width: drawWidthRef.current };
        setDrawPaths(p => [...p, np]);
      }
      livePointsRef.current = [];
      setLivePath('');
    },
  }), []);

  // ── Masques ───────────────────────────────────────────────────────────────
  const [masks,        setMasks]        = useState<MaskRect[]>([]);
  const [liveMask,     setLiveMask]     = useState<MaskRect | null>(null);
  const [maskColorIdx, setMaskColorIdx] = useState(0);
  const maskColorIdxRef = useRef(0);
  maskColorIdxRef.current = maskColorIdx;
  const maskStartRef   = useRef<{ x: number; y: number } | null>(null);

  const maskPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => activeToolRef.current === 'mask',
    onMoveShouldSetPanResponder:  () => activeToolRef.current === 'mask',
    onPanResponderGrant: e => {
      maskStartRef.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      setLiveMask({ id: 'live', x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, w: 0, h: 0 });
    },
    onPanResponderMove: e => {
      if (!maskStartRef.current) return;
      const sx = maskStartRef.current.x, sy = maskStartRef.current.y;
      const cx = e.nativeEvent.locationX, cy = e.nativeEvent.locationY;
      setLiveMask({ id: 'live', x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) });
    },
    onPanResponderRelease: () => {
      setLiveMask(prev => {
        if (prev && prev.w > 20 && prev.h > 20) {
          const mc = MASK_COLORS[maskColorIdxRef.current];
          const norm: MaskRect = {
            id: Date.now().toString(),
            x: prev.x / W,
            y: prev.y / H,
            w: prev.w / W,
            h: prev.h / H,
            color: mc.color,
            opacity: mc.opacity,
          };
          setMasks(m => [...m, norm]);
        }
        maskStartRef.current = null;
        return null;
      });
    },
  }), []);

  const removeLastMask = () => setMasks(m => m.slice(0, -1));

  // ── Texte overlay ─────────────────────────────────────────────────────────
  const [textLayers,    setTextLayers]    = useState<TextLayer[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput,     setTextInput]     = useState('');
  const [textColor,     setTextColor]     = useState(TEXT_COLORS[0]);
  const [textBg,        setTextBg]        = useState<'none'|'solid'|'semi'>('none');
  const [textBgColor,   setTextBgColor]   = useState(TEXT_BG_COLORS_EDITOR[0]);
  const [textBold,      setTextBold]      = useState(false);
  const [textSize,      setTextSize]      = useState(22);

  const addTextLayer = () => {
    if (!textInput.trim()) { setShowTextModal(false); return; }
    const nl: TextLayer = { id: Date.now().toString(), text: textInput.trim(), color: textColor, bg: textBg, bgColor: textBgColor, fontSize: textSize, x: 0.35, y: 0.4, bold: textBold, rotation: 0, scale: 1 };
    setTextLayers(p => [...p, nl]);
    setTextInput(''); setShowTextModal(false);
  };
  const updateText   = useCallback((id:string, x:number, y:number, scale:number, rotation:number) =>
    setTextLayers(p => p.map(l => l.id===id ? {...l,x,y,scale,rotation} : l)), []);
  const removeText   = useCallback((id:string) => setTextLayers(p => p.filter(l => l.id!==id)), []);

  // ── Stickers ──────────────────────────────────────────────────────────────
  const [stickers,          setStickers]          = useState<StickerLayer[]>([]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const addSticker    = (emoji: string) => {
    setStickers(p => [...p, { id: Date.now().toString(), emoji, x: 0.45, y: 0.45, scale: 1, rotation: 0 }]);
    setShowStickerPicker(false);
  };
  const updateSticker = useCallback((id:string, x:number, y:number, scale:number, rotation:number) =>
    setStickers(p => p.map(s => s.id===id ? {...s,x,y,scale,rotation} : s)), []);
  const removeSticker = useCallback((id:string) => setStickers(p => p.filter(s => s.id!==id)), []);

  // ── Caption ───────────────────────────────────────────────────────────────
  const [showCaptionInput, setShowCaptionInput] = useState(false);

  // ── Undo ──────────────────────────────────────────────────────────────────
  type HE = { type:'draw'; id:string } | { type:'text'; id:string } | { type:'sticker'; id:string };
  const history = useRef<HE[]>([]);
  const undo = () => {
    const last = history.current.pop();
    if (!last) return;
    if (last.type === 'draw')    setDrawPaths(p => p.filter(x => x.id !== last.id));
    if (last.type === 'text')    setTextLayers(p => p.filter(x => x.id !== last.id));
    if (last.type === 'sticker') setStickers(p => p.filter(x => x.id !== last.id));
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = () => {
    setStep('camera'); setMode('text'); setLocalUri(null); setAudioUri(null); setAudioName(null);
    setCaption(''); setBgColor(BG_COLORS[0]); setFontStyleKey('classic');
    setActiveTool('none'); setDrawPaths([]); setLivePath(''); setErasing(false);
    setTextLayers([]); setStickers([]); setMasks([]); setLiveMask(null);
    resetCrop();
    setShowTrimmer(false); setVideoDuration(0); setTrimStart(null); setTrimEnd(null);
    setAudienceType('everyone'); setSelectedUsers([]);
    setShowCaptionInput(false); setShowSuccess(false);
    history.current = [];
    try { audioRecorder.stopPlayer(); audioRecorder.removePlayBackListener(); } catch {}
    setAudioPlaying(false);
  };

  // Repart d'un état propre à chaque ouverture — pas à la fermeture (voir
  // resetAndClose ci-dessous) pour ne jamais remonter StoryCameraScreen
  // pendant que le Modal est encore en train de se fermer.
  useEffect(() => {
    if (visible) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Ferme sans repasser par 'camera' d'abord : un reset() avant onClose() force
  // un re-render avec step='camera', qui remonte StoryCameraScreen (et relance
  // sa demande de permission caméra/micro) pendant la fenêtre où le parent
  // traite encore onClose() — l'utilisateur voit l'écran de permission au lieu
  // de fermer. onClose() doit être le seul effet visible ; reset() se fera au
  // prochain montage (visible redevient true plus tard, avec un state propre).
  const resetAndClose = () => { onClose(); };
  const goBack = () => {
    if (showAudienceSheet) { setShowAudienceSheet(false); return; }
    if (step === 'compose') { reset(); }
    else if (step === 'pick_audio') { setStep('compose'); setAudioUri(null); setAudioName(null); }
    else if (['pick_media','record_voice'].includes(step)) { setStep('camera'); setLocalUri(null); }
    else { resetAndClose(); }
  };

  // ── Dimension canvas (plein écran) ────────────────────────────────────────
  const canvasW = W;
  const canvasH = H;

  // Résultat de la caméra intégrée (StoryCameraScreen) : photo → compose direct,
  // vidéo → trimmer (même flux que la galerie, cohérent pour l'édition finale).
  const handleCameraCaptured = (result: StoryCameraResult) => {
    if (result.isPhoto) {
      setMode('image'); setLocalUri(result.uri); setStep('compose');
    } else {
      setMode('video'); setLocalUri(result.uri); setVideoDuration(result.durationSec ?? 0);
      setShowTrimmer(true);
    }
  };

  const pickAudioFile = async () => {
    try {
      const [file] = await pick({ type:[types.audio], allowMultiSelection:false });
      if (!file?.uri) return;
      // Le picker renvoie souvent une URI content:// sur Android, illisible
      // directement par react-native-audio-recorder-player (preview) — sans
      // cette résolution, le bouton play de la barre audio ne jouait rien
      // (URI content:// non supportée par le lecteur natif).
      let resolved = file.uri;
      if (Platform.OS === 'android' && file.uri.startsWith('content://')) {
        try {
          const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/story_audio_${Date.now()}.mp3`;
          await ReactNativeBlobUtil.fs.cp(file.uri, dest);
          resolved = `file://${dest}`;
        } catch (e) {
          console.warn('[pickAudioFile] résolution content:// échouée:', e);
        }
      }
      setAudioUri(resolved);
      setAudioName(file.name ? file.name.replace(/\.[^.]+$/, '') : null);
      setStep('compose');
    } catch (e) {
      if (isErrorWithCode(e) && (e as any).code === errorCodes.OPERATION_CANCELED) return;
      toastService.error('Erreur', "Impossible d'ouvrir le fichier audio sélectionné.");
    }
  };

  // ── Vocal ─────────────────────────────────────────────────────────────────
  const requestMic = async () => {
    if (Platform.OS !== 'android') return true;
    return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) === PermissionsAndroid.RESULTS.GRANTED;
  };
  const startRecording = async () => {
    if (!(await requestMic())) { toastService.warning('Permission', 'Microphone requis'); return; }
    const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/story_voice_${Date.now()}.mp4`;
    await audioRecorder.startRecorder(path);
    audioRecorder.addRecordBackListener((e:any) => {
      const s = Math.floor((e.currentPosition??0)/1000);
      setRecordTime(`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`);
    });
    setRecording(true);
  };
  const stopRecording = async () => {
    const result = await audioRecorder.stopRecorder();
    audioRecorder.removeRecordBackListener();
    setRecording(false);
    if (result) { setAudioUri(result.startsWith('file://') ? result : `file://${result}`); setStep('compose'); }
  };
  const playAudioPreview = async () => {
    if (!audioUri) return;
    await audioRecorder.startPlayer(audioUri);
    setAudioPlaying(true);
    audioRecorder.addPlayBackListener((e:any) => { if (e.currentPosition >= e.duration) { audioRecorder.stopPlayer(); setAudioPlaying(false); } });
  };
  const stopAudioPreview = () => { try { audioRecorder.stopPlayer(); audioRecorder.removePlayBackListener(); } catch {} setAudioPlaying(false); };

  // ── Audience ──────────────────────────────────────────────────────────────
  const openAudience = async () => {
    setShowAudienceSheet(true);
    if (contacts.length > 0) return;
    setContactsLoading(true);
    try {
      const me = await authService.getMe();
      setMyId(String(me.id));
      const [followers, following] = await Promise.all([userService.getFollowers(String(me.id)), userService.getFollowing(String(me.id))]);
      const seen = new Set<string>(); const merged: typeof contacts = [];
      for (const u of [...followers, ...following]) {
        const id = String(u.id);
        if (!seen.has(id)) { seen.add(id); merged.push({ id, name: u.display_name||u.username||id, avatar_url: u.avatar_url??null }); }
      }
      setContacts(merged);
    } catch {} finally { setContactsLoading(false); }
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const doUploadImage = async (uri: string, crop?: typeof FULL) => {
    let finalUri = uri;
    const isCropped = crop && !(crop.x === 0 && crop.y === 0 && crop.w === W && crop.h === H);
    if (isCropped) {
      try {
        if (Platform.OS === 'android' && finalUri.startsWith('content://')) {
          const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/story_src_${Date.now()}.jpg`;
          const b64  = await ReactNativeBlobUtil.fetch('GET', finalUri).then(r => r.base64());
          await ReactNativeBlobUtil.fs.writeFile(dest, b64, 'base64');
          finalUri = `file://${dest}`;
        }
        console.log('[crop] uri=', finalUri, 'crop=', JSON.stringify(crop));
        const { width: imgW, height: imgH } = await new Promise<{width:number;height:number}>((res, rej) =>
          Image.getSize(finalUri, (w, h) => res({width:w, height:h}), rej)
        );
        console.log('[crop] imgSize=', imgW, imgH);
        const scaleX = imgW / W;
        const scaleY = imgH / H;
        const cropped = await ImageEditor.cropImage(finalUri, {
          offset: { x: Math.round(crop!.x * scaleX), y: Math.round(crop!.y * scaleY) },
          size:   { width: Math.round(crop!.w * scaleX), height: Math.round(crop!.h * scaleY) },
        });
        finalUri = typeof cropped === 'string' ? cropped : (cropped as any).uri ?? finalUri;
        console.log('[crop] result=', finalUri);
      } catch (e) { console.error('[crop native ERROR]', e); }
    }
    return (await uploadImageFromUri(finalUri, 'stories', `s_${Date.now()}.jpg`)).url;
  };
  const doUploadVideo = async (uri: string, _trimStart: number | null, _trimEnd: number | null) => {
    const r = await uploadVideoFromUri(uri, 'stories', `s_${Date.now()}.mp4`, 'video/mp4');
    const thumbnailUrl = r.thumbnail_url ?? undefined;
    const hasTrim = _trimStart !== null && _trimEnd !== null && _trimEnd > _trimStart;
    const duration = hasTrim ? (_trimEnd! - _trimStart!) : (r.duration ?? 5);
    // mp4_url retourné par le backend — MP4 brut stocké sur R2 pour 24h
    const mp4Url = r.mp4_url ?? undefined;
    return { url: r.hls_url ?? r.url, mp4Url, duration, thumbnailUrl };
  };
  const doUploadAudio = async (uri: string) => {
    const ext = uri.split('.').pop()?.toLowerCase()??'mp4';
    const mime: Record<string,string> = { mp3:'audio/mpeg', m4a:'audio/x-m4a', aac:'audio/aac', wav:'audio/wav', ogg:'audio/ogg', mp4:'audio/mp4' };
    const fileName = `s_${Date.now()}.${ext}`;
    // Ajoute au catalogue partagé (recherche/populaires) — non-bloquant, en parallèle
    soundService.uploadFromUri(uri, fileName);
    return (await uploadAudioFile(uri, fileName, mime[ext]??'audio/mp4', 'stories')).url;
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = () => {
    const _mode = mode, _localUri = localUri, _audioUri = audioUri, _audioName = audioName;
    const _caption = caption, _bgColor = bgColor, _fontStyleKey = fontStyleKey;
    const _audienceType = audienceType, _selectedUsers = [...selectedUsers];
    const _tempFiles = [...tempFiles.current]; tempFiles.current = [];
    const _appliedCrop = { ...appliedCrop };
    const _trimStart = trimStart, _trimEnd = trimEnd;
    const _overlaysJson = (drawPaths.length > 0 || textLayers.length > 0 || stickers.length > 0 || masks.length > 0)
      ? JSON.stringify({ textLayers, drawPaths, masks, stickers })
      : undefined;

    onCreated(); resetAndClose();
    storyUploadState.setUploading(true);
    (async () => {
      try {
        let media_url: string|undefined, media_type: StoryMediaType = 'image';
        let thumbnail_url: string|undefined, audio_url: string|undefined;
        let mp4_url: string|undefined;
        let duration_sec = 5, background_color: string|undefined;

        if (_mode === 'text')  { media_type = 'text'; background_color = _bgColor; }
        else if (_mode === 'image') { media_url = await doUploadImage(_localUri!, _appliedCrop); media_type = 'image'; thumbnail_url = media_url; }
        else if (_mode === 'video') {
          const v = await doUploadVideo(_localUri!, _trimStart, _trimEnd);
          media_url = v.url; media_type = 'video';
          duration_sec = Math.min(Math.ceil(v.duration), 90); thumbnail_url = v.thumbnailUrl;
          mp4_url = v.mp4Url;
          // Démarre le cache du MP4 R2 en arrière-plan pour lecture offline future
          if (mp4_url) cacheInBackground(mp4_url).catch(() => {});
        } else if (_mode === 'voice') {
          audio_url = _audioUri!.startsWith('http') ? _audioUri! : await doUploadAudio(_audioUri!);
          media_type = 'voice'; background_color = '#1A237E'; duration_sec = 15;
        }

        if (_audioUri && _mode !== 'voice') {
          audio_url = _audioUri.startsWith('http') ? _audioUri : await doUploadAudio(_audioUri);
          if (_mode === 'text') { media_type = 'audio'; }
          duration_sec = 15;
        }

        await storyService.create({
          media_url, media_type, thumbnail_url, mp4_url,
          caption: _caption.trim()||undefined,
          duration_sec, background_color, audio_url,
          audio_name: audio_url ? (_audioName ?? undefined) : undefined,
          font_style: _mode==='text' ? _fontStyleKey : undefined,
          overlays_json: _overlaysJson,
          audience_type: _audienceType,
          audience_user_ids: _audienceType!=='everyone' ? _selectedUsers : [],
        });
        await cleanupTempVideos(_tempFiles);
        try {
          await notifee.createChannel({ id: 'uploads_v1', name: 'Publications', importance: AndroidImportance.DEFAULT, visibility: AndroidVisibility.PRIVATE });
          await notifee.displayNotification({
            id:    `story_done_${Date.now()}`,
            title: 'Story publiée !',
            body:  'Ta story est maintenant visible par tes abonnés.',
            android: { channelId: 'uploads_v1', importance: AndroidImportance.DEFAULT, pressAction: { id: 'default', launchActivity: 'default' }, smallIcon: 'ic_notification' },
          });
        } catch {}
      } catch (e) {
        console.error('[publish] error:', e);
        toastService.error('Erreur', String((e as any)?.message ?? e));
        await cleanupTempVideos(_tempFiles);
      }
      finally { storyUploadState.setUploading(false); }
    })();
  };

  const currentOpt = MODE_OPTIONS.find(o => o.key === mode) ?? MODE_OPTIONS[0];
  const canPublish = mode !== 'text' || caption.trim().length > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack} statusBarTranslucent>
      <GestureHandlerRootView style={{flex:1}}>
      <View style={{flex:1}}>


      {/* ── STEP camera — point d'entrée : viewfinder live, tap=photo / appui long=vidéo ── */}
      {step === 'camera' && (
        <StoryCameraScreen
          onBack={resetAndClose}
          onCaptured={handleCameraCaptured}
          onSelectText={() => { setMode('text'); setStep('compose'); setTimeout(() => setShowCaptionInput(true), 200); }}
          onSelectVoice={() => { setMode('voice'); setStep('record_voice'); }}
        />
      )}

      {/* ── STEP record_voice ────────────────────────────────────────────── */}
      {step === 'record_voice' && (
        <View style={[s.root,{backgroundColor:colors.background}]}>
          <View style={[s.subHeader,{paddingTop:Platform.OS==='android'?48:56,borderBottomColor:colors.border??'#eee'}]}>
            <TouchableOpacity onPress={goBack} style={s.subHeaderBtn}><Icon name="arrow-left" size={20} color={colors.textPrimary} /></TouchableOpacity>
            <Text style={[s.subHeaderTitle,{color:colors.textPrimary}]}>Message vocal</Text>
            <View style={{width:40}} />
          </View>
          <View style={s.recordBody}>
            <LinearGradient colors={recording?['#AD1457','#E91E63']:['#00838F','#00BCD4']} style={s.recordOrb}>
              <MaterialIcon name="microphone" size={54} color="#fff" />
            </LinearGradient>
            <Text style={[s.recordTimer,{color:colors.textPrimary}]}>{recordTime}</Text>
            <Text style={[s.recordStatus,{color:recording?'#E91E63':colors.textSecondary}]}>{recording?'Enregistrement...':'Pret a enregistrer'}</Text>
            <TouchableOpacity style={[s.recordBtn,{backgroundColor:recording?'#E91E63':'#00BCD4'}]} onPress={recording?stopRecording:startRecording} activeOpacity={0.82}>
              <MaterialIcon name={recording?'stop':'microphone'} size={22} color="#fff" />
              <Text style={s.recordBtnLabel}>{recording?'Terminer':'Commencer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── STEP pick_audio ──────────────────────────────────────────────── */}
      {step === 'pick_audio' && (
        <SoundPicker
          colors={colors}
          onGoBack={goBack}
          onSelectLocal={pickAudioFile}
          onSelectSaved={(url: string, title?: string) => { setAudioUri(url); setAudioName(title ?? null); setStep('compose'); }}
        />
      )}

      {/* ── TRIMMER ──────────────────────────────────────────────────────── */}
      {showTrimmer && localUri && (
        <VideoTrimmer
          uri={localUri}
          duration={videoDuration}
          onConfirm={async (originalUri, startSec, endSec) => {
            setIsTrimming(true);
            try {
              const cutUri = await trimVideo(originalUri, startSec, endSec);
              tempFiles.current.push(cutUri);
              setLocalUri(cutUri);
              setTrimStart(startSec);
              setTrimEnd(endSec);
              setShowTrimmer(false);
              setStep('compose');
            } catch {
              toastService.error('Erreur', 'Impossible de découper la vidéo.');
            } finally {
              setIsTrimming(false);
            }
          }}
          onCancel={() => { setShowTrimmer(false); setLocalUri(null); setStep('pick_media'); }}
        />
      )}
      {isTrimming && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <ActivityIndicator size="large" color="#7B3FF2" />
          <Text style={{ color: '#fff', marginTop: 12, fontWeight: '600' }}>Découpage en cours…</Text>
        </View>
      )}

      {/* ── STEP compose — écran unique édition + publication ────────────── */}
      {!showTrimmer && step === 'compose' && (
        <View style={s.composeRoot}>
          <StatusBar hidden />

          {/* FOND / MEDIA */}
          {mode === 'text' && <View style={[StyleSheet.absoluteFill,{backgroundColor:bgColor}]} />}

          {/* IMAGE / VIDEO — clippée par appliedCrop (crop uniquement pour les images) */}
          {(mode === 'image' || mode === 'video') && localUri && (() => {
            const ac = appliedCrop;
            const isFull = mode === 'video' || (ac.x === 0 && ac.y === 0 && ac.w === W && ac.h === H);
            if (isFull) {
              return (
                <View style={StyleSheet.absoluteFill}>
                  {mode === 'image'
                    ? (
                      <>
                        {/* Fond flouté agrandi — comble l'espace autour d'une photo dont
                            le ratio ne correspond pas à l'écran, sans jamais la recadrer
                            tant que l'utilisateur n'a pas explicitement utilisé l'outil
                            crop (même pattern que ReelEditorScreen/StoryViewer). */}
                        <Image source={{uri:localUri}} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={Platform.OS === 'android' ? 24 : 40} />
                        <View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor:'rgba(0,0,0,0.35)'}]} />
                        <Image source={{uri:localUri}} style={StyleSheet.absoluteFill} resizeMode="contain" />
                      </>
                    )
                    : <VideoPreview uri={localUri} playerRef={playerRef} startSec={trimStart} />
                  }
                </View>
              );
            }
            // Zone rognée affichée à sa taille réelle, centrée, fond noir (images uniquement)
            return (
              <View style={[StyleSheet.absoluteFill, {backgroundColor:'#000'}]}>
                <View style={{
                  position: 'absolute',
                  left: (W - ac.w) / 2,
                  top:  (H - ac.h) / 2,
                  width: ac.w,
                  height: ac.h,
                  overflow: 'hidden',
                }}>
                  <Image
                    source={{uri: localUri}}
                    style={{
                      position: 'absolute',
                      left: -ac.x,
                      top:  -ac.y,
                      width: W,
                      height: H,
                    }}
                    resizeMode="cover"
                  />
                </View>
              </View>
            );
          })()}
          {mode === 'voice' && (
            <LinearGradient colors={['#0F0C29','#302B63']} style={StyleSheet.absoluteFill}>
              <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
                <MaterialIcon name="microphone-outline" size={120} color="rgba(255,255,255,0.1)" />
              </View>
            </LinearGradient>
          )}

          {/* OVERLAY CROP style WhatsApp — images uniquement */}
          {mode === 'image' && localUri && activeTool === 'crop' && (
            <View style={StyleSheet.absoluteFill} {...cropPan.panHandlers}>
              {/* Zones sombres autour du rectangle */}
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={{position:'absolute',left:0,top:0,right:0,height:cropRect.y,backgroundColor:'rgba(0,0,0,0.6)'}} />
                <View style={{position:'absolute',left:0,top:cropRect.y+cropRect.h,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.6)'}} />
                <View style={{position:'absolute',left:0,top:cropRect.y,width:cropRect.x,height:cropRect.h,backgroundColor:'rgba(0,0,0,0.6)'}} />
                <View style={{position:'absolute',left:cropRect.x+cropRect.w,top:cropRect.y,right:0,height:cropRect.h,backgroundColor:'rgba(0,0,0,0.6)'}} />
                {/* Cadre + grille */}
                <View style={{position:'absolute',left:cropRect.x,top:cropRect.y,width:cropRect.w,height:cropRect.h,borderWidth:1.5,borderColor:'#fff'}}>
                  <View style={{position:'absolute',top:'33.3%',left:0,right:0,height:StyleSheet.hairlineWidth,backgroundColor:'rgba(255,255,255,0.5)'}} />
                  <View style={{position:'absolute',top:'66.6%',left:0,right:0,height:StyleSheet.hairlineWidth,backgroundColor:'rgba(255,255,255,0.5)'}} />
                  <View style={{position:'absolute',left:'33.3%',top:0,bottom:0,width:StyleSheet.hairlineWidth,backgroundColor:'rgba(255,255,255,0.5)'}} />
                  <View style={{position:'absolute',left:'66.6%',top:0,bottom:0,width:StyleSheet.hairlineWidth,backgroundColor:'rgba(255,255,255,0.5)'}} />
                </View>
                {/* Poignees coins */}
                <View style={{position:'absolute',top:cropRect.y-2,left:cropRect.x-2,width:24,height:4,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y-2,left:cropRect.x-2,width:4,height:24,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y-2,left:cropRect.x+cropRect.w-22,width:24,height:4,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y-2,left:cropRect.x+cropRect.w-2,width:4,height:24,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y+cropRect.h-2,left:cropRect.x-2,width:24,height:4,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y+cropRect.h-24,left:cropRect.x-2,width:4,height:24,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y+cropRect.h-2,left:cropRect.x+cropRect.w-22,width:24,height:4,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y+cropRect.h-24,left:cropRect.x+cropRect.w-2,width:4,height:24,backgroundColor:'#7B3FF2'}} />
                {/* Poignees bords milieu */}
                <View style={{position:'absolute',top:cropRect.y-2,left:cropRect.x+cropRect.w/2-12,width:24,height:4,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y+cropRect.h-2,left:cropRect.x+cropRect.w/2-12,width:24,height:4,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y+cropRect.h/2-12,left:cropRect.x-2,width:4,height:24,backgroundColor:'#7B3FF2'}} />
                <View style={{position:'absolute',top:cropRect.y+cropRect.h/2-12,left:cropRect.x+cropRect.w-2,width:4,height:24,backgroundColor:'#7B3FF2'}} />
              </View>
            </View>
          )}

          {/* MASQUES FIGES + live mask */}
          {/* Masques — rendu opaque */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {masks.map(m => (
              <View
                key={m.id}
                style={{
                  position: 'absolute',
                  left: m.x * canvasW, top: m.y * canvasH,
                  width: m.w * canvasW, height: m.h * canvasH,
                  backgroundColor: m.color ?? '#000000',
                  opacity: 1,
                  borderRadius: 4,
                  borderWidth: activeTool === 'mask' ? 1.5 : 0,
                  borderColor: '#fff',
                }}
              />
            ))}
            {liveMask && liveMask.w > 0 && liveMask.h > 0 && (
              <View style={{
                position:'absolute', left:liveMask.x, top:liveMask.y, width:liveMask.w, height:liveMask.h,
                backgroundColor: MASK_COLORS[maskColorIdx].color,
                opacity: 1,
                borderRadius:4, borderWidth:1.5, borderColor:'rgba(255,255,255,0.8)',
              }} />
            )}
          </View>
          {/* Zone de dessin du masque — PanResponder */}
          {activeTool === 'mask' && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-only" {...maskPan.panHandlers} />
          )}
          {/* Croix de suppression — au-dessus du PanResponder */}
          {activeTool === 'mask' && masks.map(m => (
            <TouchableOpacity
              key={`del-${m.id}`}
              onPress={() => setMasks(prev => prev.filter(x => x.id !== m.id))}
              style={{
                position: 'absolute',
                left: m.x * canvasW + m.w * canvasW - 9,
                top:  m.y * canvasH - 9,
                width: 22, height: 22,
                borderRadius: 11,
                backgroundColor: '#E91E63',
                alignItems: 'center', justifyContent: 'center',
                zIndex: 999,
              }}
            >
              <Icon name="x" size={12} color="#fff" />
            </TouchableOpacity>
          ))}

          {/* DESSIN SVG */}
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents={activeTool==='draw' && !erasing ? 'box-only' : 'none'}
            {...(activeTool==='draw' && !erasing ? drawPan.panHandlers : {})}
          >
            <Svg width={canvasW} height={canvasH} style={StyleSheet.absoluteFill}>
              {drawPaths.map(p => (
                <Path key={p.id} d={p.d} stroke={p.color} strokeWidth={p.width}
                  fill="none" strokeLinecap="round" strokeLinejoin="round"
                  onPress={erasing ? () => setDrawPaths(dp => dp.filter(x => x.id!==p.id)) : undefined}
                />
              ))}
              {livePath.length > 0 && (
                <Path d={livePath} stroke={drawColor} strokeWidth={drawWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </Svg>
          </View>

          {/* TEXTES OVERLAY */}
          {textLayers.map(l => (
            <DraggableText key={l.id} layer={l} containerW={canvasW} containerH={canvasH} onUpdate={updateText} onRemove={removeText} />
          ))}

          {/* STICKERS */}
          {stickers.map(s => (
            <DraggableSticker key={s.id} sticker={s} containerW={canvasW} containerH={canvasH} onUpdate={updateSticker} onRemove={removeSticker} />
          ))}

          {/* CAPTION (story texte) */}
          {caption.length > 0 && mode === 'text' && (
            <View style={s.captionCenter} pointerEvents="none">
              <Text style={[s.captionText, {
                fontSize: caption.length>100?18:caption.length>50?24:30,
                fontFamily: FONT_STYLES.find(f=>f.key===fontStyleKey)?.fontFamily,
                fontWeight: FONT_STYLES.find(f=>f.key===fontStyleKey)?.fontWeight??'bold',
                fontStyle:  FONT_STYLES.find(f=>f.key===fontStyleKey)?.fontStyle??'normal',
              }]}>{caption}</Text>
            </View>
          )}
          {caption.length > 0 && mode !== 'text' && (
            <View style={s.captionBottom} pointerEvents="none">
              <Text style={s.captionText}>{caption}</Text>
            </View>
          )}

          {/* GRADIENTS UI — masqués en mode crop */}
          {activeTool !== 'crop' && (
            <>
              <LinearGradient colors={['rgba(0,0,0,0.65)','transparent']} style={s.gradTop} pointerEvents="none" />
              <LinearGradient colors={['transparent','rgba(0,0,0,0.75)']} style={s.gradBottom} pointerEvents="none" />
            </>
          )}

          {/* HEADER — masqué en mode crop */}
          {activeTool !== 'crop' && (
            <View style={[s.composeHeader,{paddingTop:Math.max(insets.top,16)+6}]}>
              <TouchableOpacity onPress={goBack} style={s.hBtn}><Icon name="arrow-left" size={20} color="#fff" /></TouchableOpacity>
              <TouchableOpacity onPress={undo} style={s.hBtn}><Icon name="corner-ccw" size={18} color="#fff" /></TouchableOpacity>
              <View style={{flex:1}} />
              <TouchableOpacity onPress={handlePublish} disabled={!canPublish} style={[s.publishBtn,!canPublish&&{opacity:0.4}]} activeOpacity={0.85}>
                <LinearGradient colors={['#7B3FF2','#E0389A']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.publishBtnInner}>
                  <Icon name="send" size={14} color="#fff" />
                  <Text style={s.publishLabel}>Publier</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* BARRE OUTILS DROITE — masquée en mode crop */}
          {activeTool !== 'crop' && <View style={[s.toolsRight,{top:Math.max(insets.top,16)+60}]}>
            {/* Crop — image uniquement (le crop vidéo nécessiterait FFmpeg côté client) */}
            {mode==='image' && (
              <TouchableOpacity onPress={()=>setActiveTool((t: Tool) => t==='crop' ? 'none' : 'crop')} style={[s.toolBtn,activeTool==='crop'&&s.toolBtnOn]}>
                <Icon name="crop" size={20} color={activeTool==='crop'?'#7B3FF2':'#fff'} />
              </TouchableOpacity>
            )}
            {/* Masque */}
            <TouchableOpacity onPress={()=>setActiveTool(t=>t==='mask'?'none':'mask')} style={[s.toolBtn,activeTool==='mask'&&s.toolBtnOn]}>
              <MaterialIcon name="blur" size={20} color={activeTool==='mask'?'#7B3FF2':'#fff'} />
            </TouchableOpacity>
            {/* Dessin */}
            <TouchableOpacity onPress={()=>setActiveTool(t=>t==='draw'?'none':'draw')} style={[s.toolBtn,activeTool==='draw'&&s.toolBtnOn]}>
              <Icon name="edit-2" size={20} color={activeTool==='draw'?'#7B3FF2':'#fff'} />
            </TouchableOpacity>
            {/* Texte */}
            <TouchableOpacity onPress={()=>{setActiveTool('text');setShowTextModal(true);}} style={[s.toolBtn,activeTool==='text'&&s.toolBtnOn]}>
              <Icon name="type" size={20} color={activeTool==='text'?'#7B3FF2':'#fff'} />
            </TouchableOpacity>
            {/* Sticker */}
            <TouchableOpacity onPress={()=>{setActiveTool('sticker');setShowStickerPicker(true);}} style={[s.toolBtn,activeTool==='sticker'&&s.toolBtnOn]}>
              <Icon name="smile" size={20} color={activeTool==='sticker'?'#7B3FF2':'#fff'} />
            </TouchableOpacity>
            {/* Caption / légende */}
            <TouchableOpacity onPress={()=>{setActiveTool('caption');setShowCaptionInput(true);}} style={[s.toolBtn,activeTool==='caption'&&s.toolBtnOn]}>
              <MaterialIcon name="subtitles" size={20} color={activeTool==='caption'?'#7B3FF2':'rgba(255,255,255,0.7)'} />
            </TouchableOpacity>
            {/* Trim vidéo */}
            {mode==='video' && (
              <TouchableOpacity onPress={()=>setActiveTool(t=>t==='trim'?'none':'trim')} style={[s.toolBtn,activeTool==='trim'&&s.toolBtnOn]}>
                <Icon name="scissors" size={18} color={activeTool==='trim'?'#7B3FF2':'#fff'} />
              </TouchableOpacity>
            )}
            {/* Son */}
            {mode !== 'voice' && (
              <TouchableOpacity onPress={()=>setStep('pick_audio')} style={[s.toolBtn,audioUri&&s.toolBtnOn]}>
                <MaterialIcon name="music-note" size={20} color={audioUri?'#7B3FF2':'#fff'} />
              </TouchableOpacity>
            )}
            {/* Audience */}
            <TouchableOpacity onPress={openAudience} style={s.toolBtn}>
              <Icon name={audienceType==='everyone'?'globe':audienceType==='selected'?'users':'eye-off'} size={18} color="#fff" />
            </TouchableOpacity>
          </View>}

          {/* PANNEAU CROP */}
          {activeTool === 'crop' && (
            <View style={{
              position:'absolute', bottom: Math.max(insets.bottom, 16) + 12,
              left: 0, right: 0, flexDirection:'row', justifyContent:'center', gap: 16,
            }}>
              <TouchableOpacity
                onPress={resetCrop}
                style={{paddingHorizontal:20,paddingVertical:10,borderRadius:24,backgroundColor:'rgba(0,0,0,0.7)',flexDirection:'row',alignItems:'center',gap:6}}
              >
                <Icon name="refresh-cw" size={15} color="#fff" />
                <Text style={{color:'#fff',fontSize:14,fontWeight:'600'}}>Reinit.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { applyCrop(); setActiveTool('none'); }}
                style={{paddingHorizontal:24,paddingVertical:10,borderRadius:24,backgroundColor:'rgba(123,63,242,0.9)',flexDirection:'row',alignItems:'center',gap:6}}
              >
                <Icon name="check" size={15} color="#fff" />
                <Text style={{color:'#fff',fontSize:14,fontWeight:'700'}}>OK</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* PANNEAU MASQUE */}
          {activeTool === 'mask' && (
            <View style={[s.drawPanel, {gap:8}]}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <Text style={[s.hintText,{flex:1,fontSize:12}]}>Glissez pour masquer · appuyez pour supprimer</Text>
                {masks.length > 0 && (
                  <TouchableOpacity onPress={removeLastMask} style={s.hintBtn}>
                    <Icon name="corner-ccw" size={13} color="#fff" />
                    <Text style={s.hintBtnLabel}>Annuler</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* Palette couleur masque */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingHorizontal:4,alignItems:'center'}}>
                {MASK_COLORS.map((mc, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setMaskColorIdx(idx)}
                    style={[{
                      width: 34, height: 34, borderRadius: 17,
                      backgroundColor: mc.color,
                      opacity: mc.opacity,
                      borderWidth: maskColorIdx === idx ? 3 : 1.5,
                      borderColor: maskColorIdx === idx ? '#7B3FF2' : 'rgba(255,255,255,0.5)',
                      alignItems: 'center', justifyContent: 'center',
                    }]}
                  >
                    {maskColorIdx === idx && <Icon name="check" size={14} color={mc.color === '#000000' ? '#fff' : '#000'} />}
                  </TouchableOpacity>
                ))}
                <View style={{marginLeft:4}}>
                  <Text style={{color:'rgba(255,255,255,0.5)',fontSize:10}}>{MASK_COLORS[maskColorIdx].label}</Text>
                </View>
              </ScrollView>
            </View>
          )}

          {/* PANNEAU TRIM */}
          {activeTool === 'trim' && mode === 'video' && (
            <View style={s.hintPanel}>
              <Text style={s.hintText}>Utilisez le trimmer pour couper la vidéo</Text>
              <TouchableOpacity onPress={()=>setShowTrimmer(true)} style={s.hintBtn}>
                <Icon name="scissors" size={14} color="#fff" />
                <Text style={s.hintBtnLabel}>Ouvrir le trimmer</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* PANNEAU DESSIN */}
          {activeTool === 'draw' && (
            <View style={s.drawPanel}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.colorRow}>
                {DRAW_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={()=>{setDrawColor(c);setErasing(false);}} style={[s.dot,{backgroundColor:c},drawColor===c&&!erasing&&s.dotSel]} />
                ))}
              </ScrollView>
              <View style={s.widthRow}>
                {[2,4,8,14].map(w => (
                  <TouchableOpacity key={w} onPress={()=>setDrawWidth(w)} style={[s.wBtn,drawWidth===w&&s.wBtnOn]}>
                    <View style={{width:w+6,height:w+6,borderRadius:(w+6)/2,backgroundColor:drawColor}} />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={()=>setErasing(e=>!e)} style={[s.eraserBtn,erasing&&s.eraserBtnOn]}>
                  <Icon name="delete" size={15} color={erasing?'#7B3FF2':'rgba(255,255,255,0.6)'} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* COULEURS FOND (mode texte) */}
          {mode === 'text' && activeTool === 'none' && (
            <View style={s.bgColorBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.colorRow}>
                {BG_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={()=>setBgColor(c)} style={[s.dot,{backgroundColor:c},bgColor===c&&s.dotSel]} />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.colorRow}>
                {FONT_STYLES.map(f => (
                  <TouchableOpacity key={f.key} onPress={()=>setFontStyleKey(f.key)} style={[s.fontChip,fontStyleKey===f.key&&s.fontChipOn]}>
                    <Text style={[s.fontChipAa,{fontFamily:f.fontFamily,fontWeight:f.fontWeight,fontStyle:f.fontStyle??'normal'},fontStyleKey===f.key&&s.fontChipAaOn]}>Aa</Text>
                    <Text style={[s.fontChipName,fontStyleKey===f.key&&{color:'#fff'}]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* AUDIO INDICATOR */}
          {audioUri && mode !== 'voice' && (
            <View style={s.audioBar}>
              <TouchableOpacity style={s.audioBarBtn} onPress={audioPlaying?stopAudioPreview:playAudioPreview}>
                <Icon name={audioPlaying?'pause':'play'} size={16} color="#fff" />
              </TouchableOpacity>
              <View style={s.audioBarWave}>
                {[...Array(14)].map((_,k) => <View key={k} style={[s.audioBarLine,{height:4+Math.sin(k*0.9)*8,opacity:audioPlaying?1:0.4}]} />)}
              </View>
              <TouchableOpacity onPress={()=>{setAudioUri(null); setAudioName(null);}}><Icon name="x" size={14} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
            </View>
          )}

          {/* SAISIE CAPTION */}
          {showCaptionInput && (
            <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={s.captionInputWrap}>
              <View style={s.captionInputRow}>
                <TextInput
                  ref={inputRef} autoFocus
                  style={s.captionInput}
                  placeholder={mode==='text'?'Votre message...':'Ajouter une legende...'}
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  value={caption} onChangeText={setCaption}
                  maxLength={300} multiline
                  onBlur={()=>{setShowCaptionInput(false);setActiveTool('none');}}
                />
                <TouchableOpacity onPress={()=>{Keyboard.dismiss();setShowCaptionInput(false);setActiveTool('none');}} style={s.captionDoneBtn}>
                  <Text style={s.captionDoneLabel}>OK</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}

          {/* AUDIENCE SHEET */}
          {showAudienceSheet && (
            <>
              <TouchableOpacity style={s.audOverlay} activeOpacity={1} onPress={()=>{setShowAudienceSheet(false);setContactSearch('');}} />
              <Animated.View entering={FadeInDown.duration(220)} style={[s.audSheet, { paddingBottom: (Platform.OS === 'ios' ? 34 : 20) + insets.bottom }]}>
                <View style={s.audHandle} />
                <Text style={s.audSheetTitle}>Qui peut voir cette story ?</Text>
                <View style={s.audOptions}>
                  {([
                    {key:'everyone',icon:'globe',  label:'Tout le monde', sub:'Tous vos abonnes'},
                    {key:'except',  icon:'eye-off', label:'Sauf...',        sub:'Tout le monde sauf certains'},
                    {key:'selected',icon:'users',   label:'Seulement...',   sub:'Uniquement les personnes choisies'},
                  ] as {key:StoryAudienceType;icon:string;label:string;sub:string}[]).map(opt => {
                    const active = audienceType===opt.key;
                    return (
                      <TouchableOpacity key={opt.key} style={[s.audOptRow,active&&s.audOptRowActive]} onPress={()=>{setAudienceType(opt.key);if(opt.key==='everyone')setSelectedUsers([]);}} activeOpacity={0.75}>
                        <View style={[s.audOptIcon,active&&s.audOptIconActive]}><Icon name={opt.icon} size={18} color={active?'#7B3FF2':'rgba(255,255,255,0.7)'} /></View>
                        <View style={{flex:1}}>
                          <Text style={[s.audOptLabel,active&&{color:'#fff'}]}>{opt.label}</Text>
                          <Text style={s.audOptSub}>{opt.sub}</Text>
                        </View>
                        {active && <Icon name="check-circle" size={18} color="#7B3FF2" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {audienceType!=='everyone' && (
                  <View style={s.audContactsWrap}>
                    <View style={s.audSearchRow}>
                      <Icon name="search" size={14} color="rgba(255,255,255,0.4)" />
                      <TextInput style={s.audSearchInput} placeholder="Rechercher..." placeholderTextColor="rgba(255,255,255,0.3)" value={contactSearch} onChangeText={setContactSearch} autoCorrect={false} autoCapitalize="none" />
                    </View>
                    {contactsLoading ? <ActivityIndicator color="#7B3FF2" style={{marginVertical:16}} /> : (
                      <ScrollView style={s.audContactsList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {contacts.filter(c=>c.name.toLowerCase().includes(contactSearch.toLowerCase())).map((c,i,arr) => {
                          const checked = selectedUsers.includes(c.id);
                          return (
                            <TouchableOpacity key={c.id} style={[s.audContactRow,i<arr.length-1&&s.audContactRowBorder]} onPress={()=>setSelectedUsers(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id])} activeOpacity={0.7}>
                              {c.avatar_url ? <Image source={{uri:c.avatar_url}} style={s.audAvatar} /> : (
                                <LinearGradient colors={['#7B3FF2','#E0389A']} style={s.audAvatarFallback}><Text style={s.audAvatarInitial}>{(c.name[0]??'?').toUpperCase()}</Text></LinearGradient>
                              )}
                              <Text style={s.audContactName} numberOfLines={1}>{c.name}</Text>
                              <View style={[s.audCheckbox,checked&&s.audCheckboxOn]}>{checked&&<Icon name="check" size={12} color="#fff" />}</View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                )}
                <TouchableOpacity style={s.audDoneBtn} onPress={()=>{setShowAudienceSheet(false);setContactSearch('');}} activeOpacity={0.8}>
                  <Text style={s.audDoneLabel}>Confirmer</Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}
        </View>
      )}

      {/* MODAL TEXTE OVERLAY */}
      <Modal visible={showTextModal} transparent animationType="fade">
        <KeyboardAvoidingView style={s.modalBg} behavior={Platform.OS==='ios'?'padding':'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={()=>setShowTextModal(false)} />
          <View style={s.textModal}>
            <Text style={s.modalTitle}>Ajouter du texte</Text>
            <TextInput
              style={[s.textModalInput,{color:textColor,fontWeight:textBold?'bold':'normal',fontSize:textSize}]}
              placeholder="Votre texte..." placeholderTextColor="rgba(255,255,255,0.3)"
              value={textInput} onChangeText={setTextInput} autoFocus multiline maxLength={120}
            />
            <Text style={s.pickerLabel}>Couleur</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.colorRow}>
              {TEXT_COLORS.map(c=><TouchableOpacity key={c} onPress={()=>setTextColor(c)} style={[s.dot,{backgroundColor:c},textColor===c&&s.dotSel]} />)}
            </ScrollView>
            <View style={s.textOptRow}>
              {[16,20,26,34].map(sz=>(
                <TouchableOpacity key={sz} onPress={()=>setTextSize(sz)} style={[s.szBtn,textSize===sz&&s.szBtnOn]}>
                  <Text style={[s.szBtnLabel,textSize===sz&&{color:'#7B3FF2'}]}>{sz}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={()=>setTextBold(b=>!b)} style={[s.boldBtn,textBold&&s.boldBtnOn]}>
                <Text style={[s.boldLabel,textBold&&{color:'#7B3FF2'}]}>G</Text>
              </TouchableOpacity>
              {(['none','semi','solid'] as const).map(b=>(
                <TouchableOpacity key={b} onPress={()=>setTextBg(b)} style={[s.bgModeBtn,textBg===b&&s.bgModeBtnOn]}>
                  <Text style={[s.bgModeLabel,textBg===b&&{color:'#7B3FF2'}]}>{b==='none'?'Sans':b==='semi'?'Semi':'Plein'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={addTextLayer} style={s.addBtn} activeOpacity={0.85}>
              <LinearGradient colors={['#7B3FF2','#E0389A']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.addBtnInner}>
                <Text style={s.addBtnLabel}>Ajouter</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PICKER STICKERS */}
      <Modal visible={showStickerPicker} transparent animationType="slide">
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={()=>setShowStickerPicker(false)} />
        <View style={s.stickerModal}>
          <Text style={s.modalTitle}>Choisir un sticker</Text>
          <View style={s.stickerGrid}>
            {STICKER_LIST.map(e=><TouchableOpacity key={e} onPress={()=>addSticker(e)} style={s.stickerItem}><Text style={{fontSize:34}}>{e}</Text></TouchableOpacity>)}
          </View>
        </View>
      </Modal>

      </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex:1 },

  pickHeader: { paddingTop:Platform.OS==='android'?48:60, paddingBottom:24, paddingHorizontal:20, flexDirection:'row', alignItems:'center', gap:16 },
  closeBtn: { width:36,height:36,borderRadius:18,backgroundColor:'rgba(255,255,255,0.15)',alignItems:'center',justifyContent:'center' },
  pickHeaderText: { flex:1,gap:3 },
  pickTitle: { fontSize:20,fontWeight:'800',color:'#fff',letterSpacing:0.2 },
  pickSub:   { fontSize:13,color:'rgba(255,255,255,0.65)',fontWeight:'500' },

  modeList: { paddingTop:12,paddingBottom:32,paddingHorizontal:16,gap:10 },
  modeRow: { flexDirection:'row',alignItems:'center',borderRadius:16,paddingVertical:14,paddingRight:16,gap:14,overflow:'hidden',elevation:3 },
  modeAccentBar: { width:4,height:'100%',position:'absolute',left:0 },
  modeIconBox: { width:48,height:48,borderRadius:14,alignItems:'center',justifyContent:'center',marginLeft:14 },
  modeTexts: { flex:1,gap:3 },
  modeLabel: { fontSize:15,fontWeight:'700' },
  modeSub:   { fontSize:12 },

  subHeader: { flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8,paddingBottom:14,borderBottomWidth:StyleSheet.hairlineWidth },
  subHeaderBtn: { width:40,height:40,alignItems:'center',justifyContent:'center' },
  subHeaderTitle: { fontSize:16,fontWeight:'700' },

  sourceGrid: { flexDirection:'row',gap:12,paddingHorizontal:16,paddingTop:24,paddingBottom:28,alignItems:'flex-start' },
  sourceCard: { flex:1,borderRadius:20,overflow:'hidden',height:160,elevation:4 },
  sourceCardInner: { flex:1,alignItems:'center',justifyContent:'center',paddingVertical:14,gap:8 },
  sourceIconWrap: { width:52,height:52,borderRadius:26,backgroundColor:'rgba(255,255,255,0.22)',alignItems:'center',justifyContent:'center' },
  sourceLabel: { fontSize:14,fontWeight:'800',color:'#fff' },
  sourceSub:   { fontSize:11,color:'rgba(255,255,255,0.75)',textAlign:'center',paddingHorizontal:8 },

  recordBody: { flex:1,alignItems:'center',justifyContent:'center',gap:24 },
  recordOrb: { width:136,height:136,borderRadius:68,alignItems:'center',justifyContent:'center',elevation:12 },
  recordTimer: { fontSize:44,fontWeight:'800' },
  recordStatus: { fontSize:14,fontWeight:'600' },
  recordBtn: { flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:40,paddingVertical:16,borderRadius:32,elevation:6 },
  recordBtnLabel: { color:'#fff',fontSize:16,fontWeight:'700' },

  // ── Compose (écran unique) ─────────────────────────────────────────────────
  composeRoot: { flex:1,backgroundColor:'#000' },

  composeHeader: { position:'absolute',top:0,left:0,right:0,flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingBottom:10,gap:8 },
  hBtn: { width:36,height:36,borderRadius:18,backgroundColor:'rgba(0,0,0,0.4)',alignItems:'center',justifyContent:'center' },
  publishBtn: { borderRadius:22,overflow:'hidden' },
  publishBtnInner: { flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:20,paddingVertical:10 },
  publishLabel: { color:'#fff',fontSize:14,fontWeight:'800' },

  toolsRight: { position:'absolute',right:12,gap:10 },
  toolBtn: { width:40,height:40,borderRadius:20,backgroundColor:'rgba(0,0,0,0.45)',alignItems:'center',justifyContent:'center' },
  toolBtnOn: { backgroundColor:'rgba(123,63,242,0.35)',borderWidth:1.5,borderColor:'#7B3FF2' },

  hintPanel: { position:'absolute',bottom:40,left:0,right:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingVertical:12,backgroundColor:'rgba(0,0,0,0.55)',gap:12 },
  hintText: { flex:1,color:'rgba(255,255,255,0.7)',fontSize:13 },
  hintBtn: { flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:7,borderRadius:14,backgroundColor:'rgba(255,255,255,0.15)' },
  hintBtnLabel: { color:'#fff',fontSize:12,fontWeight:'600' },
  drawPanel: { position:'absolute',bottom:40,left:0,right:0,gap:10,paddingHorizontal:16,backgroundColor:'rgba(0,0,0,0.55)',paddingVertical:12 },
  colorRow: { gap:8,paddingHorizontal:4,alignItems:'center' },
  dot: { width:28,height:28,borderRadius:14,borderWidth:2,borderColor:'transparent' },
  dotSel: { borderColor:'#fff',transform:[{scale:1.2}] },
  widthRow: { flexDirection:'row',alignItems:'center',gap:12 },
  wBtn: { padding:6,borderRadius:8 },
  wBtnOn: { backgroundColor:'rgba(123,63,242,0.2)' },
  eraserBtn: { width:36,height:36,borderRadius:18,backgroundColor:'rgba(255,255,255,0.08)',alignItems:'center',justifyContent:'center',marginLeft:'auto' },
  eraserBtnOn: { backgroundColor:'rgba(123,63,242,0.18)',borderWidth:1,borderColor:'#7B3FF2' },

  bgColorBar: { position:'absolute',bottom:40,left:0,right:0,gap:8,paddingHorizontal:16,backgroundColor:'rgba(0,0,0,0.55)',paddingVertical:10 },
  fontChip: { alignItems:'center',paddingHorizontal:12,paddingVertical:7,borderRadius:12,backgroundColor:'rgba(255,255,255,0.15)' },
  fontChipOn: { backgroundColor:'rgba(255,255,255,0.35)' },
  fontChipAa: { color:'rgba(255,255,255,0.7)',fontSize:17 },
  fontChipAaOn: { color:'#fff' },
  fontChipName: { color:'rgba(255,255,255,0.5)',fontSize:9,marginTop:1 },

  gradTop:    { position:'absolute',top:0,left:0,right:0,height:140 },
  gradBottom: { position:'absolute',bottom:0,left:0,right:0,height:180 },

  captionCenter: { position:'absolute',top:0,left:0,right:0,bottom:0,justifyContent:'center',alignItems:'center',paddingHorizontal:28 },
  captionBottom: { position:'absolute',top:'44%',left:24,right:24,alignItems:'center' },
  captionText: { color:'#fff',fontSize:22,fontWeight:'700',textAlign:'center',textShadowColor:'rgba(0,0,0,0.7)',textShadowOffset:{width:0,height:1},textShadowRadius:8 },

  audioBar: { position:'absolute',bottom:110,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'rgba(0,0,0,0.55)',paddingHorizontal:16,paddingVertical:8,borderRadius:28 },
  audioBarBtn: { width:32,height:32,borderRadius:16,backgroundColor:'rgba(255,255,255,0.2)',alignItems:'center',justifyContent:'center' },
  audioBarWave: { flexDirection:'row',alignItems:'center',gap:2 },
  audioBarLine: { width:2.5,borderRadius:2,backgroundColor:'#fff' },

  captionInputWrap: { position:'absolute',bottom:0,left:0,right:0 },
  captionInputRow: { flexDirection:'row',alignItems:'flex-end',gap:10,backgroundColor:'rgba(0,0,0,0.88)',paddingHorizontal:16,paddingVertical:14 },
  captionInput: { flex:1,color:'#fff',fontSize:16,fontWeight:'500',minHeight:40,maxHeight:110 },
  captionDoneBtn: { paddingHorizontal:12,paddingVertical:8 },
  captionDoneLabel: { color:'#7B3FF2',fontSize:15,fontWeight:'800' },

  // ── Audience ──────────────────────────────────────────────────────────────
  audOverlay: { ...StyleSheet.absoluteFill,backgroundColor:'rgba(0,0,0,0.45)',zIndex:10 },
  audSheet: { position:'absolute',left:0,right:0,bottom:0,backgroundColor:'#1A1A2E',borderTopLeftRadius:24,borderTopRightRadius:24,zIndex:11,maxHeight:H*0.75 },
  audHandle: { width:36,height:4,borderRadius:2,backgroundColor:'rgba(255,255,255,0.2)',alignSelf:'center',marginTop:10,marginBottom:14 },
  audSheetTitle: { fontSize:15,fontWeight:'700',color:'#fff',paddingHorizontal:20,marginBottom:12 },
  audOptions: { paddingHorizontal:14,gap:8 },
  audOptRow: { flexDirection:'row',alignItems:'center',gap:14,borderRadius:14,padding:13,backgroundColor:'rgba(255,255,255,0.07)' },
  audOptRowActive: { backgroundColor:'#7B3FF22E',borderWidth:1,borderColor:'#7B3FF280' },
  audOptIcon: { width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.08)' },
  audOptIconActive: { backgroundColor:'#7B3FF240' },
  audOptLabel: { fontSize:14,fontWeight:'700',color:'rgba(255,255,255,0.75)' },
  audOptSub: { fontSize:11,color:'rgba(255,255,255,0.4)',marginTop:2 },
  audContactsWrap: { paddingHorizontal:14,marginTop:16 },
  audSearchRow: { flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(255,255,255,0.08)',borderRadius:10,paddingHorizontal:12,paddingVertical:8,marginBottom:10 },
  audSearchInput: { flex:1,color:'#fff',fontSize:13,padding:0 },
  audContactsList: { maxHeight:200 },
  audContactRow: { flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10 },
  audContactRowBorder: { borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'rgba(255,255,255,0.1)' },
  audAvatar: { width:38,height:38,borderRadius:19 },
  audAvatarFallback: { width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center' },
  audAvatarInitial: { color:'#fff',fontSize:14,fontWeight:'700' },
  audContactName: { flex:1,fontSize:13,fontWeight:'500',color:'#fff' },
  audCheckbox: { width:22,height:22,borderRadius:11,borderWidth:2,borderColor:'rgba(255,255,255,0.3)',alignItems:'center',justifyContent:'center' },
  audCheckboxOn: { backgroundColor:'#7B3FF2',borderColor:'#7B3FF2' },
  audDoneBtn: { marginHorizontal:14,marginTop:16,backgroundColor:'#7B3FF2',borderRadius:14,paddingVertical:14,alignItems:'center' },
  audDoneLabel: { color:'#fff',fontSize:14,fontWeight:'800' },

  // ── Modal texte ───────────────────────────────────────────────────────────
  modalBg: { flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.7)' },
  textModal: { backgroundColor:'#1A1A2E',borderTopLeftRadius:20,borderTopRightRadius:20,padding:20,gap:10 },
  modalTitle: { color:'#fff',fontWeight:'800',fontSize:16,marginBottom:2 },
  textModalInput: { backgroundColor:'rgba(255,255,255,0.07)',borderRadius:12,padding:14,fontSize:20,color:'#fff',minHeight:72,borderWidth:1,borderColor:'rgba(255,255,255,0.1)' },
  pickerLabel: { color:'rgba(255,255,255,0.45)',fontSize:11,fontWeight:'700',letterSpacing:0.7,textTransform:'uppercase' },
  textOptRow: { flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap' },
  szBtn: { paddingHorizontal:10,paddingVertical:6,borderRadius:8,backgroundColor:'rgba(255,255,255,0.07)' },
  szBtnOn: { backgroundColor:'rgba(123,63,242,0.25)' },
  szBtnLabel: { color:'rgba(255,255,255,0.6)',fontSize:13,fontWeight:'600' },
  boldBtn: { width:36,height:36,borderRadius:8,backgroundColor:'rgba(255,255,255,0.07)',alignItems:'center',justifyContent:'center' },
  boldBtnOn: { backgroundColor:'rgba(123,63,242,0.25)' },
  boldLabel: { color:'rgba(255,255,255,0.6)',fontSize:18,fontWeight:'900' },
  bgModeBtn: { paddingHorizontal:10,paddingVertical:6,borderRadius:8,backgroundColor:'rgba(255,255,255,0.07)' },
  bgModeBtnOn: { backgroundColor:'rgba(123,63,242,0.25)' },
  bgModeLabel: { color:'rgba(255,255,255,0.6)',fontSize:12,fontWeight:'600' },
  addBtn: { borderRadius:16,overflow:'hidden',marginTop:4 },
  addBtnInner: { paddingVertical:13,alignItems:'center' },
  addBtnLabel: { color:'#fff',fontWeight:'700',fontSize:15 },

  // ── Stickers ──────────────────────────────────────────────────────────────
  stickerModal: { backgroundColor:'#1A1A2E',borderTopLeftRadius:20,borderTopRightRadius:20,padding:20,gap:12 },
  stickerGrid: { flexDirection:'row',flexWrap:'wrap',gap:8 },
  stickerItem: { width:(W-80)/5,alignItems:'center',paddingVertical:8 },
});

