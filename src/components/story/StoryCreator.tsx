import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Dimensions, StatusBar, Alert, Keyboard,
  Modal, KeyboardAvoidingView, Platform, ScrollView,
  PermissionsAndroid, PanResponder, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInRight,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { SoundPicker } from './SoundPicker';
import { storyService } from '../../services/storyService';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import type { StoryMediaType, StoryAudienceType } from '../../types/story';
import { compressVideo, cleanupTempVideos } from '../../services/videoCompressService';
import { uploadVideoFromUri, uploadImageFromUri, uploadAudioFile } from '../../services/uploadService';
import { storyUploadState } from '../../services/storyUploadState';
import { VideoTrimmer } from './VideoTrimmer';

const AudioRecorderPlayerModule = require('react-native-audio-recorder-player');
const AudioRecorderPlayerClass = AudioRecorderPlayerModule.default || AudioRecorderPlayerModule;
const audioRecorder = new AudioRecorderPlayerClass();

const { width: W, height: H } = Dimensions.get('window');

// ── Types overlays ────────────────────────────────────────────────────────────

interface TextLayer {
  id: string; text: string; color: string; bg: 'none' | 'solid' | 'semi';
  bgColor: string; fontSize: number; x: number; y: number;
  bold: boolean; rotation: number; scale: number;
}
interface DrawPath { id: string; d: string; color: string; width: number; }
interface MaskRect { id: string; x: number; y: number; w: number; h: number; }
interface StickerLayer { id: string; emoji: string; x: number; y: number; scale: number; rotation: number; }

// ── Constantes ────────────────────────────────────────────────────────────────

const DRAW_COLORS = ['#FFFFFF','#000000','#E91E63','#2196F3','#4CAF50','#FF9800','#9C27B0','#F44336','#FFEB3B','#00BCD4'];
const TEXT_COLORS = ['#FFFFFF','#000000','#E91E63','#2196F3','#4CAF50','#FF9800','#9C27B0','#FFEB3B'];
const TEXT_BG_COLORS_EDITOR = ['#000000','#FFFFFF','#7B3FF2','#E91E63','#2196F3','#4CAF50'];
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
type Step = 'pick_mode' | 'pick_media' | 'record_voice' | 'pick_audio' | 'compose';
type Tool = 'none' | 'crop' | 'draw' | 'text' | 'sticker' | 'caption' | 'trim';

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

function normalizeUri(uri: string): Promise<string> {
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) return Promise.resolve(uri);
  const ext = uri.includes('.') ? uri.split('.').pop() : 'tmp';
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/story_${Date.now()}.${ext}`;
  return ReactNativeBlobUtil.fs.cp(uri, dest)
    .catch(() => ReactNativeBlobUtil.fs.readFile(uri, 'base64').then(d => ReactNativeBlobUtil.fs.writeFile(dest, d, 'base64')))
    .then(() => `file://${dest}`);
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

const VideoPreview: React.FC<{ uri: string; playerRef: React.MutableRefObject<any> }> = ({ uri, playerRef }) => {
  const player = useVideoPlayer({ uri }, p => { p.loop = true; p.muted = false; p.play(); });
  playerRef.current = player;
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
  const x = useSharedValue(sticker.x * containerW);
  const y = useSharedValue(sticker.y * containerH);
  const sc = useSharedValue(sticker.scale);
  const rot = useSharedValue(sticker.rotation);
  const sx = useSharedValue(sticker.x * containerW);
  const sy = useSharedValue(sticker.y * containerH);
  const ssc = useSharedValue(sticker.scale);
  const srot = useSharedValue(sticker.rotation);

  const pan = Gesture.Pan()
    .onStart(() => { sx.value = x.value; sy.value = y.value; })
    .onUpdate(e => { x.value = sx.value + e.translationX; y.value = sy.value + e.translationY; })
    .onEnd(() => onUpdate(sticker.id, x.value/containerW, y.value/containerH, sc.value, rot.value));
  const pinch = Gesture.Pinch()
    .onStart(() => { ssc.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(0.3, Math.min(4, ssc.value * e.scale)); })
    .onEnd(() => onUpdate(sticker.id, x.value/containerW, y.value/containerH, sc.value, rot.value));
  const rotate = Gesture.Rotation()
    .onStart(() => { srot.value = rot.value; })
    .onUpdate(e => { rot.value = srot.value + e.rotation; })
    .onEnd(() => onUpdate(sticker.id, x.value/containerW, y.value/containerH, sc.value, rot.value));

  const style = useAnimatedStyle(() => ({
    position: 'absolute', left: x.value - 24, top: y.value - 24,
    transform: [{ scale: sc.value }, { rotate: `${rot.value}rad` }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={style}>
        <Text style={{ fontSize: 42 }}>{sticker.emoji}</Text>
        <TouchableOpacity onPress={() => onRemove(sticker.id)} style={ol.rmBtn}>
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

  const [step,         setStep]         = useState<Step>('pick_mode');
  const [mode,         setMode]         = useState<StoryMode>('text');
  const [localUri,     setLocalUri]     = useState<string | null>(null);
  const [audioUri,     setAudioUri]     = useState<string | null>(null);
  const [bgColor,      setBgColor]      = useState(BG_COLORS[0]);
  const [fontStyleKey, setFontStyleKey] = useState('classic');
  const [caption,      setCaption]      = useState('');
  const [showTrimmer,  setShowTrimmer]  = useState(false);
  const [videoDuration,setVideoDuration]= useState(0);
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

  const resetCrop = () => {};

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
    setStep('pick_mode'); setMode('text'); setLocalUri(null); setAudioUri(null);
    setCaption(''); setBgColor(BG_COLORS[0]); setFontStyleKey('classic');
    setActiveTool('none'); setDrawPaths([]); setLivePath(''); setErasing(false);
    setTextLayers([]); setStickers([]);
    setShowTrimmer(false); setVideoDuration(0);
    setAudienceType('everyone'); setSelectedUsers([]);
    setShowCaptionInput(false); setShowSuccess(false);
    history.current = [];
    try { audioRecorder.stopPlayer(); audioRecorder.removePlayBackListener(); } catch {}
    setAudioPlaying(false);
  };

  const resetAndClose = () => { reset(); onClose(); };
  const goBack = () => {
    if (showAudienceSheet) { setShowAudienceSheet(false); return; }
    if (step === 'compose') { reset(); }
    else if (step === 'pick_audio') { setStep('compose'); setAudioUri(null); }
    else if (['pick_media','record_voice'].includes(step)) { setStep('pick_mode'); setLocalUri(null); }
    else { resetAndClose(); }
  };

  // ── Dimension canvas (plein écran) ────────────────────────────────────────
  const canvasW = W;
  const canvasH = H;

  // ── Permissions galerie ───────────────────────────────────────────────────
  const requestGalleryPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const sdk = parseInt((Platform.Version as string).toString(), 10);
    if (sdk >= 33) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
      ]);
      return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
    }
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  // ── Pickers ───────────────────────────────────────────────────────────────
  const pickImage = async (source: 'gallery'|'camera') => {
    if (source === 'camera') {
      if (!(await requestCameraPermission())) { Alert.alert('Permission', 'Accès à la caméra requis'); return; }
    } else {
      if (!(await requestGalleryPermission())) { Alert.alert('Permission', 'Accès à la galerie requis'); return; }
    }
    const res = await (source==='camera' ? launchCamera : launchImageLibrary)({ mediaType:'photo', selectionLimit:1 });
    if (res.didCancel || !res.assets?.[0]?.uri) return;
    setLocalUri(res.assets[0].uri); setStep('compose');
  };

  const pickVideo = async (source: 'gallery'|'camera') => {
    if (source === 'camera') {
      if (!(await requestCameraPermission())) { Alert.alert('Permission', 'Accès à la caméra requis'); return; }
    } else {
      if (!(await requestGalleryPermission())) { Alert.alert('Permission', 'Accès à la galerie requis'); return; }
    }
    const res = await (source==='camera' ? launchCamera : launchImageLibrary)({ mediaType:'video', selectionLimit:1 });
    if (res.didCancel || !res.assets?.[0]?.uri) return;
    const dur = (res.assets[0].duration ?? 0) / 1000;
    setLocalUri(res.assets[0].uri); setVideoDuration(dur);
    if (dur > 90) { setShowTrimmer(true); } else { setStep('compose'); }
  };

  const pickAudioFile = async () => {
    try {
      const [file] = await pick({ type:[types.audio], allowMultiSelection:false });
      if (!file?.uri) return;
      setAudioUri(file.uri); setStep('compose');
    } catch (e) {
      if (isErrorWithCode(e) && (e as any).code === errorCodes.OPERATION_CANCELED) return;
    }
  };

  // ── Vocal ─────────────────────────────────────────────────────────────────
  const requestMic = async () => {
    if (Platform.OS !== 'android') return true;
    return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) === PermissionsAndroid.RESULTS.GRANTED;
  };
  const startRecording = async () => {
    if (!(await requestMic())) { Alert.alert('Permission', 'Microphone requis'); return; }
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
  const doUploadImage = async (uri: string) => {
    const n = await normalizeUri(uri);
    return (await uploadImageFromUri(n, 'stories', `s_${Date.now()}.jpg`)).url;
  };
  const doUploadVideo = async (uri: string) => {
    const c = await compressVideo(uri, { maxDurationSec:90, crf:23, onProgress:()=>{} });
    tempFiles.current.push(c.uri);
    const r = await uploadVideoFromUri(c.uri, 'stories', `s_${Date.now()}.mp4`, 'video/mp4');
    let thumbnailUrl: string|undefined;
    if (c.thumbnailUri) {
      try { thumbnailUrl = (await uploadImageFromUri(c.thumbnailUri, 'stories', `st_${Date.now()}.jpg`)).url; } catch {}
    }
    return { url: r.hls_url??r.url, duration: c.durationSec, thumbnailUrl };
  };
  const doUploadAudio = async (uri: string) => {
    const ext = uri.split('.').pop()?.toLowerCase()??'mp4';
    const mime: Record<string,string> = { mp3:'audio/mpeg', m4a:'audio/x-m4a', aac:'audio/aac', wav:'audio/wav', ogg:'audio/ogg', mp4:'audio/mp4' };
    return (await uploadAudioFile(uri, `s_${Date.now()}.${ext}`, mime[ext]??'audio/mp4', 'stories')).url;
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = () => {
    const _mode = mode, _localUri = localUri, _audioUri = audioUri;
    const _caption = caption, _bgColor = bgColor, _fontStyleKey = fontStyleKey;
    const _audienceType = audienceType, _selectedUsers = [...selectedUsers];
    const _tempFiles = [...tempFiles.current]; tempFiles.current = [];
    const _overlaysJson = (drawPaths.length > 0 || textLayers.length > 0 || stickers.length > 0)
      ? JSON.stringify({ textLayers, drawPaths, masks: [], stickers })
      : undefined;

    onCreated(); resetAndClose();
    storyUploadState.setUploading(true);
    (async () => {
      try {
        let media_url: string|undefined, media_type: StoryMediaType = 'image';
        let thumbnail_url: string|undefined, audio_url: string|undefined;
        let duration_sec = 5, background_color: string|undefined;

        if (_mode === 'text')  { media_type = 'text'; background_color = _bgColor; }
        else if (_mode === 'image') { media_url = await doUploadImage(_localUri!); media_type = 'image'; thumbnail_url = media_url; }
        else if (_mode === 'video') {
          const v = await doUploadVideo(_localUri!);
          media_url = v.url; media_type = 'video';
          duration_sec = Math.min(Math.ceil(v.duration), 90); thumbnail_url = v.thumbnailUrl;
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
          media_url, media_type, thumbnail_url,
          caption: _caption.trim()||undefined,
          duration_sec, background_color, audio_url,
          font_style: _mode==='text' ? _fontStyleKey : undefined,
          overlays_json: _overlaysJson,
          audience_type: _audienceType,
          audience_user_ids: _audienceType!=='everyone' ? _selectedUsers : [],
        });
        await cleanupTempVideos(_tempFiles);
      } catch { await cleanupTempVideos(_tempFiles); }
      finally { storyUploadState.setUploading(false); }
    })();
  };

  const selectMode = (m: StoryMode) => {
    setMode(m);
    if (m === 'text') { setStep('compose'); setTimeout(() => setShowCaptionInput(true), 200); }
    else if (m === 'voice') { setStep('record_voice'); }
    else { setStep('pick_media'); }
  };

  const currentOpt = MODE_OPTIONS.find(o => o.key === mode) ?? MODE_OPTIONS[0];
  const canPublish = mode !== 'text' || caption.trim().length > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack} statusBarTranslucent>
      <View style={{flex:1}}>

      {/* ── STEP pick_mode ───────────────────────────────────────────────── */}
      {step === 'pick_mode' && !showTrimmer && (
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
          <LinearGradient colors={['#0F0C29','#302B63','#24243E']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.pickHeader}>
            <TouchableOpacity onPress={resetAndClose} style={s.closeBtn}>
              <Icon name="x" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <View style={s.pickHeaderText}>
              <Text style={s.pickTitle}>Nouvelle story</Text>
              <Text style={s.pickSub}>Que souhaitez-vous partager ?</Text>
            </View>
          </LinearGradient>
          <ScrollView style={{flex:1,backgroundColor:colors.background}} contentContainerStyle={s.modeList} showsVerticalScrollIndicator={false}>
            {MODE_OPTIONS.map((opt,i) => (
              <Animated.View key={opt.key} entering={FadeInRight.delay(i*60).springify()}>
                <TouchableOpacity style={[s.modeRow,{backgroundColor:colors.surface??colors.background}]} onPress={()=>selectMode(opt.key)} activeOpacity={0.75}>
                  <View style={[s.modeAccentBar,{backgroundColor:opt.accent}]} />
                  <LinearGradient colors={opt.gradient} style={s.modeIconBox}>
                    {opt.iconLib==='material' ? <MaterialIcon name={opt.icon} size={22} color="#fff" /> : <Icon name={opt.icon} size={20} color="#fff" />}
                  </LinearGradient>
                  <View style={s.modeTexts}>
                    <Text style={[s.modeLabel,{color:colors.textPrimary}]}>{opt.label}</Text>
                    <Text style={[s.modeSub,{color:colors.textSecondary}]}>{opt.sub}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textTertiary??colors.textSecondary} />
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── STEP pick_media ──────────────────────────────────────────────── */}
      {step === 'pick_media' && (
        <View style={[s.root,{backgroundColor:colors.background}]}>
          <StatusBar barStyle="dark-content" />
          <View style={[s.subHeader,{paddingTop:Platform.OS==='android'?48:56,borderBottomColor:colors.border??'#eee'}]}>
            <TouchableOpacity onPress={goBack} style={s.subHeaderBtn}><Icon name="arrow-left" size={20} color={colors.textPrimary} /></TouchableOpacity>
            <Text style={[s.subHeaderTitle,{color:colors.textPrimary}]}>{mode==='video'?'Choisir une video':'Choisir une photo'}</Text>
            <View style={{width:40}} />
          </View>
          <View style={s.sourceGrid}>
            {[
              { source:'gallery' as const, icon:mode==='video'?'film':'image', label:'Galerie', sub:'Depuis vos photos', gradient:['#1565C0','#2196F3'] as [string,string] },
              { source:'camera'  as const, icon:mode==='video'?'video':'camera', label:mode==='video'?'Filmer':'Photographier', sub:'Utiliser la camera', gradient:['#AD1457','#E91E63'] as [string,string] },
            ].map((opt,i) => (
              <Animated.View key={opt.source} entering={FadeInDown.delay(i*90).springify()} style={{flex:1}}>
                <TouchableOpacity style={s.sourceCard} onPress={()=>mode==='video'?pickVideo(opt.source):pickImage(opt.source)} activeOpacity={0.8}>
                  <LinearGradient colors={opt.gradient} start={{x:0,y:0}} end={{x:0,y:1}} style={s.sourceCardInner}>
                    <View style={s.sourceIconWrap}><Icon name={opt.icon} size={24} color="#fff" /></View>
                    <Text style={s.sourceLabel}>{opt.label}</Text>
                    <Text style={s.sourceSub}>{opt.sub}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>
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
          onSelectOnline={(uri:string) => { setAudioUri(uri); setStep('compose'); }}
        />
      )}

      {/* ── TRIMMER ──────────────────────────────────────────────────────── */}
      {showTrimmer && localUri && (
        <VideoTrimmer
          uri={localUri}
          duration={videoDuration}
          onConfirm={trimmedUri => { setLocalUri(trimmedUri); tempFiles.current.push(trimmedUri); setShowTrimmer(false); setStep('compose'); }}
          onCancel={() => { setShowTrimmer(false); setLocalUri(null); setStep('pick_media'); }}
        />
      )}

      {/* ── STEP compose — écran unique édition + publication ────────────── */}
      {!showTrimmer && step === 'compose' && (
        <View style={s.composeRoot}>
          <StatusBar hidden />

          {/* FOND / MEDIA */}
          {mode === 'text' && <View style={[StyleSheet.absoluteFill,{backgroundColor:bgColor}]} />}
          {mode === 'image' && localUri && <Image source={{uri:localUri}} style={StyleSheet.absoluteFill} resizeMode="cover" />}
          {mode === 'video' && localUri && <VideoPreview uri={localUri} playerRef={playerRef} />}
          {mode === 'voice' && (
            <LinearGradient colors={['#0F0C29','#302B63']} style={StyleSheet.absoluteFill}>
              <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
                <MaterialIcon name="microphone-outline" size={120} color="rgba(255,255,255,0.1)" />
              </View>
            </LinearGradient>
          )}

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

          {/* GRADIENTS UI */}
          <LinearGradient colors={['rgba(0,0,0,0.65)','transparent']} style={s.gradTop} pointerEvents="none" />
          <LinearGradient colors={['transparent','rgba(0,0,0,0.75)']} style={s.gradBottom} pointerEvents="none" />

          {/* HEADER */}
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

          {/* BARRE OUTILS DROITE (style WhatsApp) */}
          <View style={[s.toolsRight,{top:Math.max(insets.top,16)+60}]}>
            {/* Crop — image et video seulement */}
            {(mode==='image'||mode==='video') && (
              <TouchableOpacity onPress={()=>setActiveTool(t=>t==='crop'?'none':'crop')} style={[s.toolBtn,activeTool==='crop'&&s.toolBtnOn]}>
                <Icon name="crop" size={20} color={activeTool==='crop'?'#7B3FF2':'#fff'} />
              </TouchableOpacity>
            )}
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
              <Icon name="type" size={18} color={activeTool==='caption'?'#7B3FF2':'rgba(255,255,255,0.7)'} />
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
          </View>

          {/* PANNEAU CROP */}
          {activeTool === 'crop' && (
            <View style={s.hintPanel}>
              <Text style={s.hintText}>Pincez pour zoomer · glissez pour repositionner</Text>
              <TouchableOpacity onPress={resetCrop} style={s.hintBtn}>
                <Icon name="refresh-cw" size={14} color="#fff" />
                <Text style={s.hintBtnLabel}>Réinitialiser</Text>
              </TouchableOpacity>
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
              <TouchableOpacity onPress={()=>setAudioUri(null)}><Icon name="x" size={14} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
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
              <Animated.View entering={FadeInDown.duration(220)} style={s.audSheet}>
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

  sourceGrid: { flex:1, flexDirection:'row',gap:12,paddingHorizontal:16,paddingTop:20,paddingBottom:28,alignItems:'flex-start' },
  sourceCard: { flex:1,borderRadius:20,overflow:'hidden',height:180,elevation:7 },
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
  audSheet: { position:'absolute',left:0,right:0,bottom:0,backgroundColor:'#1A1A2E',borderTopLeftRadius:24,borderTopRightRadius:24,paddingBottom:Platform.OS==='ios'?34:20,zIndex:11,maxHeight:H*0.75 },
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

