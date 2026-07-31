import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, PanResponder, Animated as RNAnimated, Dimensions, Platform,
  StatusBar, Keyboard, ActivityIndicator, Image, PermissionsAndroid,
} from 'react-native';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import RNBlobUtil from 'react-native-blob-util';
import Sound from 'react-native-sound';
import { SoundPicker } from '../../components/story/SoundPicker';
import { soundService } from '../../services/soundService';
import { toastService, showConfirm } from '../../services';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  withRepeat, withSequence, Easing,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W, height: H } = Dimensions.get('window');
const TRIM_W   = W - 48;
const HANDLE_W = 20;
// Durée max d'un reel après découpage — alignée sur MAX_VIDEO_DURATION_SEC
// (CreateReelScreen.tsx, limite de la source avant édition). Les stories ont
// leur propre limite indépendante de 90s (StoryCreator.tsx), non affectée ici.
const MAX_TRIM = 600;

// ─────────────────────────────────────────────────────────────────────────────
// Types exportés
// ─────────────────────────────────────────────────────────────────────────────

export type FilterKey =
  | 'original'
  // Cinema
  | 'vivid' | 'drama' | 'noir' | 'fade'
  // Mood
  | 'warm' | 'cold' | 'golden' | 'rose'
  // Neon
  | 'neon' | 'cyber' | 'acid'
  // Vintage
  | 'retro' | 'sepia' | 'vhs' | 'lomo';

export type TextAnimKey = 'none' | 'fade' | 'slide' | 'bounce' | 'pulse' | 'wave';
export type TextFontKey = 'default' | 'bold' | 'thin' | 'mono' | 'serif';

export interface TextLayer {
  id:         string;
  text:       string;
  x:          number;
  y:          number;
  color:      string;
  fontSize:   number;
  bold:       boolean;
  italic:     boolean;
  bg:         boolean;
  bgColor:    string;
  align:      'left' | 'center' | 'right';
  font:       TextFontKey;
  anim:       TextAnimKey;
  outline:    boolean;
}

export interface StickerLayer {
  id:       string;
  emoji:    string;
  x:        number;
  y:        number;
  scale:    number;
}

export interface DrawPath {
  id:     string;
  color:  string;
  width:  number;
  points: { x: number; y: number }[];
}

export interface VideoAdjust {
  brightness: number;  // -1.0 → 1.0, défaut 0
  contrast:   number;  // -1.0 → 1.0, défaut 0
  saturation: number;  // -1.0 → 1.0, défaut 0
  temperature:number;  // -1.0 → 1.0, défaut 0
}

export interface ReelEditResult {
  uri:          string;
  thumbnailUri?: string;
  startSec:     number;
  endSec:       number;
  speed:        number;
  filter:       FilterKey;
  adjust:       VideoAdjust;
  layers:       TextLayer[];
  stickers:     StickerLayer[];
  drawings:     DrawPath[];
  musicUri?:      string;
  musicName?:     string;
  musicStartSec?: number;
  musicEndSec?:   number;
}

interface Props {
  uri:            string;
  durationSec:    number;
  thumbnailUri?:  string;
  initialResult?: ReelEditResult;
  isPhoto?:       boolean;
  onConfirm:      (r: ReelEditResult) => void;
  onCancel:       () => void;
}

type ToolKey = 'trim' | 'filter' | 'adjust' | 'text' | 'sticker' | 'draw' | 'speed' | 'music';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

interface FilterDef {
  key:       FilterKey;
  label:     string;
  category:  string;
  overlay:   string;
  opacity:   number;
  blendBg?:  string;
  // second overlay for double-layer effects
  overlay2?: string;
  opacity2?: number;
}

export const FILTERS: FilterDef[] = [
  { key: 'original', label: 'Normal',  category: 'Base',    overlay: 'transparent',  opacity: 0 },
  // Cinema
  { key: 'vivid',    label: 'Vivid',   category: 'Cinema',  overlay: '#FF3CAC',      opacity: 0.25, blendBg: '#1A0030' },
  { key: 'drama',    label: 'Drama',   category: 'Cinema',  overlay: '#1A003A',      opacity: 0.45, blendBg: '#0D001F' },
  { key: 'noir',     label: 'Noir',    category: 'Cinema',  overlay: '#000000',      opacity: 0.60, blendBg: '#000' },
  { key: 'fade',     label: 'Fade',    category: 'Cinema',  overlay: '#FFFFFF',      opacity: 0.30, blendBg: '#1A1830' },
  // Mood
  { key: 'warm',     label: 'Warm',    category: 'Mood',    overlay: '#FF7E00',      opacity: 0.28, blendBg: '#1A0800' },
  { key: 'cold',     label: 'Cold',    category: 'Mood',    overlay: '#00BFFF',      opacity: 0.25, blendBg: '#000D1A' },
  { key: 'golden',   label: 'Golden',  category: 'Mood',    overlay: '#FFD700',      opacity: 0.24, blendBg: '#1A1200' },
  { key: 'rose',     label: 'Rose',    category: 'Mood',    overlay: '#FF6B9D',      opacity: 0.22, blendBg: '#1A0010' },
  // Neon
  { key: 'neon',     label: 'Neon',    category: 'Neon',    overlay: '#00FF88',      opacity: 0.18, blendBg: '#001A0A', overlay2: '#FF00FF', opacity2: 0.10 },
  { key: 'cyber',    label: 'Cyber',   category: 'Neon',    overlay: '#00F5FF',      opacity: 0.20, blendBg: '#00081A', overlay2: '#FF00AA', opacity2: 0.08 },
  { key: 'acid',     label: 'Acid',    category: 'Neon',    overlay: '#AAFF00',      opacity: 0.22, blendBg: '#0A1A00' },
  // Vintage
  { key: 'retro',    label: 'Retro',   category: 'Vintage', overlay: '#FF8C00',      opacity: 0.30, blendBg: '#1A0800', overlay2: '#000000', opacity2: 0.15 },
  { key: 'sepia',    label: 'Sepia',   category: 'Vintage', overlay: '#C8A96E',      opacity: 0.40, blendBg: '#1A1200' },
  { key: 'vhs',      label: 'VHS',     category: 'Vintage', overlay: '#0066FF',      opacity: 0.15, blendBg: '#000',    overlay2: '#FF0000', opacity2: 0.08 },
  { key: 'lomo',     label: 'Lomo',    category: 'Vintage', overlay: '#1A0030',      opacity: 0.35, blendBg: '#0A0014', overlay2: '#FF6600', opacity2: 0.12 },
];

export const FILTER_VIDEO_OPACITY: Record<FilterKey, number> = {
  original: 0, vivid: 0.15, warm: 0.18, cold: 0.18, fade: 0.20, noir: 0.55,
  drama: 0.35, golden: 0.14, rose: 0.16, neon: 0.14, cyber: 0.16, acid: 0.18,
  retro: 0.22, sepia: 0.32, vhs: 0.12, lomo: 0.26,
};
export const FILTER_VIDEO_OPACITY2: Record<FilterKey, number> = {
  original: 0, vivid: 0, warm: 0, cold: 0, fade: 0, noir: 0,
  drama: 0, golden: 0, rose: 0, neon: 0.07, cyber: 0.06, acid: 0,
  retro: 0.10, sepia: 0, vhs: 0.06, lomo: 0.09,
};

const FILTER_CATEGORIES = ['Base', 'Cinema', 'Mood', 'Neon', 'Vintage'];

const SPEEDS = [
  { v: 0.3, label: '0.3×' },
  { v: 0.5, label: '0.5×' },
  { v: 1.0, label: '1×'   },
  { v: 1.5, label: '1.5×' },
  { v: 2.0, label: '2×'   },
  { v: 3.0, label: '3×'   },
];

const PALETTE = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9F0A',
  '#FFD60A', '#30D158', '#0A84FF', '#BF5AF2',
  '#FF375F', '#5AC8FA', '#FF6B6B', '#4ECDC4',
  '#FF8C00', '#A8E063', '#C13584', '#F77737',
  '#00F5FF', '#FF00FF', '#00FF88', '#AAFF00',
];

const BG_COLORS = [
  'transparent', 'rgba(0,0,0,0.70)', 'rgba(255,255,255,0.85)',
  'rgba(123,63,242,0.85)', 'rgba(0,132,255,0.85)', 'rgba(255,59,48,0.85)',
  'rgba(255,159,10,0.85)', 'rgba(48,209,88,0.85)',
];

const TEXT_ANIMS: { key: TextAnimKey; label: string; icon: string }[] = [
  { key: 'none',      label: 'Fixe',      icon: 'minus'    },
  { key: 'fade',      label: 'Fade',      icon: 'eye'      },
  { key: 'slide',     label: 'Slide',     icon: 'arrow-up' },
  { key: 'bounce',    label: 'Bounce',    icon: 'activity' },
  { key: 'pulse',     label: 'Pulse',     icon: 'radio'    },
  { key: 'wave',      label: 'Vague',     icon: 'wind'     },
];

const TEXT_FONTS: { key: TextFontKey; label: string; style: object }[] = [
  { key: 'default', label: 'Aa',      style: {} },
  { key: 'bold',    label: 'Aa',      style: { fontWeight: '900' as const } },
  { key: 'thin',    label: 'Aa',      style: { fontWeight: '300' as const } },
  { key: 'mono',    label: '##',      style: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' } },
  { key: 'serif',   label: 'Aa',      style: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' } },
];

const STICKER_SETS = [
  ['❤️', '🔥', '😂', '😍', '🙌', '💯', '👏', '🎉'],
  ['✨', '💫', '⭐', '🌟', '💥', '🎯', '🏆', '👑'],
  ['🎵', '🎶', '🎸', '🥁', '🎤', '🎧', '🎬', '🎞️'],
  ['🌈', '☀️', '🌙', '⚡', '❄️', '🌊', '🍀', '🦋'],
  ['😎', '🤩', '😈', '🤑', '🥺', '😤', '🤯', '🥳'],
];

const DRAW_COLORS = [
  '#FFFFFF', '#FF3B30', '#FF9F0A', '#FFD60A', '#30D158',
  '#0A84FF', '#BF5AF2', '#FF375F', '#00F5FF', '#FF00FF',
];
const DRAW_WIDTHS = [3, 6, 12, 20];

const DEFAULT_ADJUST: VideoAdjust = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 };

const TOOLS: { key: ToolKey; icon: string; label: string; iconLib?: 'mc' }[] = [
  { key: 'trim',    icon: 'scissors',   label: 'Rogner'   },
  { key: 'filter',  icon: 'sliders',    label: 'Filtre'   },
  { key: 'adjust',  icon: 'sun',        label: 'Réglages' },
  { key: 'text',    icon: 'type',       label: 'Texte'    },
  { key: 'sticker', icon: 'smile',      label: 'Sticker'  },
  { key: 'draw',    icon: 'edit-2',     label: 'Dessin'   },
  { key: 'speed',   icon: 'zap',        label: 'Vitesse'  },
  { key: 'music',   icon: 'music',      label: 'Musique'  },
];

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ─────────────────────────────────────────────────────────────────────────────
// FilterThumb
// ─────────────────────────────────────────────────────────────────────────────

const FilterThumb: React.FC<{
  f: FilterDef; active: boolean; thumbnailUri?: string; onPress: () => void;
}> = ({ f, active, thumbnailUri, onPress }) => (
  <TouchableOpacity style={s.filterItem} onPress={onPress} activeOpacity={0.8}>
    <View style={[s.filterThumb, active && s.filterThumbActive]}>
      {thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: f.blendBg ?? '#1A1830' }]} />
      )}
      {f.opacity > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay, opacity: f.opacity }]} />
      )}
      {f.overlay2 && f.opacity2 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay2, opacity: f.opacity2 }]} />
      )}
      {active && (
        <View style={s.filterCheck}>
          <Icon name="check" size={9} color="#fff" />
        </View>
      )}
    </View>
    <Text style={[s.filterLbl, active && { color: '#A78BFA', fontWeight: '700' }]}>{f.label}</Text>
  </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────────────────────
// AnimatedTextLayer — applique l'animation choisie
// ─────────────────────────────────────────────────────────────────────────────

// Calcule la distance entre 2 touches
function _dist(t1: any, t2: any): number {
  const dx = t1.pageX - t2.pageX;
  const dy = t1.pageY - t2.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

const AnimatedTextLayer: React.FC<{
  layer: TextLayer;
  pan: RNAnimated.ValueXY;
  scale: RNAnimated.Value;
  onPress: () => void;
  onLongPress: () => void;
  panHandlers: object;
}> = ({ layer, pan, scale, onPress, onLongPress, panHandlers }) => {
  const fontStyle = TEXT_FONTS.find(f => f.key === layer.font)?.style ?? {};

  return (
    <RNAnimated.View
      style={[s.textLayer, pan.getLayout(), { transform: [{ scale }] }]}
      {...panHandlers}
    >
      <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}>
        <Text
          style={[
            s.textLayerTxt,
            {
              color:             layer.color,
              fontSize:          layer.fontSize,
              fontWeight:        layer.bold ? '800' : '400',
              fontStyle:         layer.italic ? 'italic' : 'normal',
              textAlign:         layer.align,
              backgroundColor:   layer.bg && layer.bgColor !== 'transparent' ? layer.bgColor : 'transparent',
              paddingHorizontal: layer.bg ? 10 : 0,
              paddingVertical:   layer.bg ? 5 : 0,
              borderRadius:      layer.bg ? 8 : 0,
              ...(layer.outline ? {
                textShadowColor: layer.color === '#FFFFFF' ? '#000' : '#fff',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 2,
              } : {
                textShadowColor: 'rgba(0,0,0,0.85)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              }),
            },
            fontStyle,
          ]}
        >
          {layer.text}
        </Text>
      </TouchableOpacity>
    </RNAnimated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// StickerLayerView
// ─────────────────────────────────────────────────────────────────────────────

const StickerLayerView: React.FC<{
  sticker: StickerLayer;
  pan: RNAnimated.ValueXY;
  scale: RNAnimated.Value;
  onLongPress: () => void;
  panHandlers: object;
}> = ({ sticker, pan, scale, onLongPress, panHandlers }) => {
  return (
    <RNAnimated.View style={[s.stickerLayer, pan.getLayout(), { transform: [{ scale }] }]} {...panHandlers}>
      <TouchableOpacity onLongPress={onLongPress} activeOpacity={0.85}>
        <Text style={{ fontSize: 44 }}>{sticker.emoji}</Text>
      </TouchableOpacity>
    </RNAnimated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AdjustSlider — slider horizontal draggable (-1 → +1)
// ─────────────────────────────────────────────────────────────────────────────

const SLIDER_W = W - 48 - 14 - 68 - 36 - 40; // approx width disponible

const AdjustSlider: React.FC<{
  value: number;
  onChange: (v: number) => void;
}> = ({ value, onChange }) => {
  const startValRef = useRef(value);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => { startValRef.current = value; },
    onPanResponderMove: (_, g) => {
      const delta = g.dx / SLIDER_W;
      const next = Math.max(-1, Math.min(1, +(startValRef.current + delta * 2).toFixed(2)));
      onChange(next);
    },
  })).current;

  const pct = (value + 1) * 50; // 0% = -1, 50% = 0, 100% = +1
  const fillLeft  = value < 0 ? `${50 + value * 50}%` : '50%';
  const fillWidth = `${Math.abs(value) * 50}%`;

  return (
    <View style={sAdj.track} {...pan.panHandlers}>
      <View style={[sAdj.fill, { left: fillLeft, width: fillWidth }]} />
      <View style={[sAdj.thumb, { left: `${pct}%` }]} />
    </View>
  );
};

const sAdj = StyleSheet.create({
  track: { flex: 1, height: 28, justifyContent: 'center' },
  fill:  { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: '#A78BFA' },
  thumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', marginLeft: -10, top: 4, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export const ReelEditorScreen: React.FC<Props> = ({
  uri, durationSec, thumbnailUri, initialResult, isPhoto = false, onConfirm, onCancel,
}) => {
  const insets = useSafeAreaInsets();

  const player = useVideoPlayer({ uri }, p => {
    if (!isPhoto) { p.loop = false; p.muted = false; }
  });

  const [isPlaying,  setIsPlaying]  = useState(false);
  const [playRatio,  setPlayRatio]  = useState(0);

  const init        = initialResult;
  const initStartR  = init ? (durationSec > 0 ? init.startSec / durationSec : 0) : 0;
  const initEndR    = init
    ? (durationSec > 0 ? init.endSec / durationSec : 1)
    : durationSec > MAX_TRIM ? MAX_TRIM / durationSec : 1;

  const [startRatio, setStartRatio] = useState(initStartR);
  const [endRatio,   setEndRatio]   = useState(initEndR);
  const startRef   = useRef(initStartR);
  const endRef     = useRef(initEndR);
  const durationRef = useRef(Math.max(durationSec, 1));
  useEffect(() => { durationRef.current = Math.max(durationSec, 1); }, [durationSec]);

  const [filter,   setFilter]   = useState<FilterKey>(init?.filter ?? 'original');
  const [adjust,   setAdjust]   = useState<VideoAdjust>(init?.adjust ?? { ...DEFAULT_ADJUST });
  const [speed,    setSpeed]    = useState(init?.speed ?? 1.0);
  const [layers,   setLayers]   = useState<TextLayer[]>(init?.layers ?? []);
  const [stickers, setStickers] = useState<StickerLayer[]>(init?.stickers ?? []);
  const [drawings, setDrawings] = useState<DrawPath[]>(init?.drawings ?? []);
  const [tool,     setTool]     = useState<ToolKey | null>(null);

  // Filter category tabs
  const [filterCat, setFilterCat] = useState('Base');

  // Musique
  const [musicUri,        setMusicUri]        = useState<string | undefined>(init?.musicUri);
  const [musicName,       setMusicName]       = useState<string | undefined>(init?.musicName);
  const [musicDuration,   setMusicDuration]   = useState(0);
  const [musicStartSec,   setMusicStartSec]   = useState(init?.musicStartSec ?? 0);
  const [musicEndSec,     setMusicEndSec]     = useState(init?.musicEndSec ?? 0);
  const [musicPlaying,    setMusicPlaying]    = useState(false);
  const [musicPicking,    setMusicPicking]    = useState(false);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const soundRef   = useRef<Sound | null>(null);
  const musicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicPosRef   = useRef(0);

  const MUSIC_TRIM_W = W - 48;

  const stopSound = useCallback(() => {
    if (musicTimerRef.current) { clearInterval(musicTimerRef.current); musicTimerRef.current = null; }
    if (soundRef.current) {
      soundRef.current.stop(() => { soundRef.current?.release(); soundRef.current = null; });
    }
    setMusicPlaying(false);
  }, []);

  const loadMusicMeta = useCallback((uri: string, defaultStart = 0, defaultEnd = 0) => {
    const FALLBACK_DUR = 30;
    const applyDur = (dur: number) => {
      const d = dur > 0 ? dur : FALLBACK_DUR;
      setMusicDuration(d);
      const videoDur = endRef.current * durationRef.current - startRef.current * durationRef.current;
      const clip = Math.min(videoDur > 0 ? videoDur : FALLBACK_DUR, d);
      setMusicStartSec(defaultStart > 0 ? defaultStart : 0);
      setMusicEndSec(defaultEnd > 0 ? defaultEnd : Math.min(clip, d));
    };
    const timer = setTimeout(() => applyDur(FALLBACK_DUR), 3000);
    Sound.setCategory('Playback');
    // file:// retiré pour Sound, content:// passé tel quel (Android MediaPlayer le gère)
    const cleanUri = uri.startsWith('file://') ? uri.slice(7) : uri;
    const snd = new Sound(cleanUri, '', err => {
      clearTimeout(timer);
      if (err) { snd.release(); applyDur(FALLBACK_DUR); return; }
      const dur = snd.getDuration();
      snd.release();
      applyDur(dur);
    });
  }, []);

  const playMusicSegment = useCallback((uri: string, fromSec: number) => {
    stopSound();
    Sound.setCategory('Playback');
    // Sur Android, Sound.MAIN_BUNDLE = '' — le path absolu doit commencer par /
    // On s'assure de ne pas avoir le préfixe file://
    const cleanUri = uri.startsWith('file://') ? uri.slice(7) : uri;
    const snd = new Sound(cleanUri, '', err => {
      if (err) {
        console.warn('[playMusicSegment] Sound error:', err, 'uri:', cleanUri);
        snd.release();
        return;
      }
      snd.setCurrentTime(fromSec);
      soundRef.current = snd;
      musicPosRef.current = fromSec;
      setMusicPlaying(true);
      snd.play(success => {
        if (!success) console.warn('[playMusicSegment] playback failed');
        setMusicPlaying(false);
      });
      musicTimerRef.current = setInterval(() => {
        snd.getCurrentTime(t => { musicPosRef.current = t; });
      }, 200);
    });
  }, [stopSound]);

  // Résout une URI audio vers un path absolu lisible par react-native-sound
  const resolveAudioUri = useCallback(async (uri: string): Promise<string> => {
    if (uri.startsWith('file://')) return uri.slice(7);
    if (uri.startsWith('/')) return uri;
    if (!uri.startsWith('content://')) return uri;
    // content:// → copie via cp (gère nativement SAF/Google Photos/etc., cf.
    // normalizeUri dans uploadService.ts) — plus fiable que la lecture base64,
    // qui échoue sur certains fournisseurs de fichiers Android. Sans ce fix, le
    // fichier choisi ne se copiait jamais correctement : ni la preview (son
    // muet/erreur) ni l'upload final (musique jamais envoyée au backend) ne
    // fonctionnaient pour une URI content:// provenant de certains gestionnaires
    // de fichiers.
    const dest = `${RNBlobUtil.fs.dirs.CacheDir}/music_preview_${Date.now()}.mp3`;
    try {
      await RNBlobUtil.fs.cp(uri, dest);
    } catch {
      const b64 = await RNBlobUtil.fs.readFile(uri, 'base64');
      await RNBlobUtil.fs.writeFile(dest, b64, 'base64');
    }
    return dest;
  }, []);

  const handlePickMusicLocal = useCallback(async () => {
    setMusicPicking(true);

    // Demande de permission audio sur Android
    if (Platform.OS === 'android') {
      const perm = Number(Platform.Version) >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      const granted = await PermissionsAndroid.request(perm, {
        title: 'Accès aux fichiers audio',
        message: 'GoFolyX a besoin d\'accéder à vos fichiers audio.',
        buttonPositive: 'Autoriser',
        buttonNegative: 'Refuser',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setMusicPicking(false);
        toastService.warning('Permission refusée', 'Autorisez l\'accès aux fichiers audio dans les paramètres.');
        return;
      }
    }

    let file: { uri: string; name?: string | null } | null = null;
    try {
      const results = await pick({ type: [types.audio] });
      file = results[0] ?? null;
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
        setMusicPicking(false);
        return;
      }
      console.warn('[handlePickMusicLocal] pick error:', e);
      setMusicPicking(false);
      toastService.error('Erreur', "Impossible d'ouvrir le sélecteur de fichiers.");
      return;
    }

    if (!file) { setMusicPicking(false); return; }

    const name = file.name ?? file.uri.split('/').pop() ?? 'Son';
    stopSound();

    let resolvedUri = file.uri;
    try {
      resolvedUri = await resolveAudioUri(file.uri);
    } catch (e) {
      console.warn('[handlePickMusicLocal] resolveAudioUri error:', e);
      // On tente quand même avec l'URI d'origine
    }

    setMusicUri(resolvedUri);
    setMusicName(name);
    loadMusicMeta(resolvedUri);
    setMusicPicking(false);
    // Ajoute au catalogue partagé — retrouvable ensuite via "Mes sons"/Recherche.
    // Échec non-bloquant pour la publication (le son local reste utilisable),
    // mais signalé pour que l'absence dans "Mes sons" ne soit pas un mystère.
    soundService.uploadFromUri(resolvedUri, name).then(result => {
      if (!result) toastService.warning('Son non enregistré', "Le son sera utilisé pour ce reel mais n'a pas pu être ajouté à \"Mes sons\".");
    });
  }, [stopSound, loadMusicMeta, resolveAudioUri]);

  const handleRemoveMusic = useCallback(() => {
    stopSound();
    setMusicUri(undefined);
    setMusicName(undefined);
    setMusicDuration(0);
    setMusicStartSec(0);
    setMusicEndSec(0);
  }, [stopSound]);

  useEffect(() => {
    if (init?.musicUri && init.musicUri === musicUri) {
      loadMusicMeta(init.musicUri, init.musicStartSec, init.musicEndSec);
    }
  }, []);

  useEffect(() => () => { stopSound(); }, [stopSound]);

  // ── Texte ─────────────────────────────────────────────────────────────────
  const [draft,       setDraft]       = useState('');
  const [txtColor,    setTxtColor]    = useState('#FFFFFF');
  const [txtSize,     setTxtSize]     = useState(28);
  const [txtBold,     setTxtBold]     = useState(true);
  const [txtItalic,   setTxtItalic]   = useState(false);
  const [txtBg,       setTxtBg]       = useState(false);
  const [txtBgColor,  setTxtBgColor]  = useState('rgba(0,0,0,0.70)');
  const [txtAlign,    setTxtAlign]    = useState<'left' | 'center' | 'right'>('center');
  const [txtFont,     setTxtFont]     = useState<TextFontKey>('default');
  const [txtAnim,     setTxtAnim]     = useState<TextAnimKey>('none');
  const [txtOutline,  setTxtOutline]  = useState(false);
  const [editLayerId, setEditLayerId] = useState<string | null>(null);
  const [textOverlay, setTextOverlay] = useState(false);
  const [textTab,     setTextTab]     = useState<'style' | 'anim' | 'font'>('style');

  // ── Stickers ──────────────────────────────────────────────────────────────
  const [stickerSet, setStickerSet] = useState(0);

  // ── Dessin ────────────────────────────────────────────────────────────────
  const [drawColor,   setDrawColor]   = useState('#FFFFFF');
  const [drawWidth,   setDrawWidth]   = useState(6);
  const [drawActive,  setDrawActive]  = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const drawAreaRef = useRef<View>(null);

  // ── Animation panneau bas ─────────────────────────────────────────────────
  const panelH  = useSharedValue(0);
  const PANEL_H_BASE = 260;

  useEffect(() => {
    const open = tool && tool !== 'text' && tool !== 'draw' && tool !== 'sticker';
    const h = open
      ? (tool === 'music' && musicUri && musicDuration > 0 ? 380 : PANEL_H_BASE)
      : 0;
    panelH.value = withSpring(h, { damping: 18, stiffness: 200 });
  }, [tool, musicUri, musicDuration]);

  const panelStyle = useAnimatedStyle(() => ({ height: panelH.value, overflow: 'hidden' }));

  // ── Player events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = player.addEventListener('onProgress', ({ currentTime: t }: { currentTime: number }) => {
      const ratio = durationSec > 0 ? t / durationSec : 0;
      setPlayRatio(ratio);
      if (isPlaying && t >= endRef.current * durationSec - 0.1) {
        try { player.currentTime = startRef.current * durationSec; } catch {}
      }
    });
    const subEnd = player.addEventListener('onEnd', () => {
      try { player.currentTime = startRef.current * durationSec; player.play(); } catch {}
    });
    return () => { sub.remove(); subEnd.remove(); };
  }, [player, isPlaying, durationSec]);

  useEffect(() => { if (!isPhoto) { try { player.rate = speed; } catch {} } }, [isPhoto, speed, player]);

  const togglePlay = useCallback(() => {
    if (isPlaying) { player.pause(); setIsPlaying(false); }
    else {
      try { player.currentTime = startRef.current * durationSec; } catch {}
      player.play(); setIsPlaying(true);
    }
  }, [isPlaying, player, durationSec]);

  const pauseAndSeekStart = useCallback(() => {
    try { player.currentTime = startRef.current * durationRef.current; } catch {}
    setTimeout(() => {
      try { player.play(); setIsPlaying(true); } catch {}
    }, 120);
  }, [player]);

  // ── Trim PanResponders ────────────────────────────────────────────────────
  // On capture la valeur au moment du grant pour calculer depuis une base fixe,
  // pas en accumulant les deltas frame par frame.
  const leftGrantRatio  = useRef(0);
  const rightGrantRatio = useRef(1);

  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder:         () => true,
      onMoveShouldSetPanResponderCapture:  () => true,
      onPanResponderGrant: () => {
        leftGrantRatio.current = startRef.current;
        player.pause();
        setIsPlaying(false);
      },
      onPanResponderMove: (_, g) => {
        const dur = durationRef.current;
        const raw = leftGrantRatio.current + g.dx / TRIM_W;
        const r   = Math.max(0, Math.min(raw, endRef.current - 1 / dur));
        const minEnd = Math.min(r + MAX_TRIM / dur, 1);
        if (endRef.current > minEnd) { endRef.current = minEnd; setEndRatio(minEnd); }
        startRef.current = r;
        setStartRatio(r);
        try { player.currentTime = r * dur; } catch {}
      },
      onPanResponderRelease: () => pauseAndSeekStart(),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder:         () => true,
      onMoveShouldSetPanResponderCapture:  () => true,
      onPanResponderGrant: () => {
        rightGrantRatio.current = endRef.current;
        player.pause();
        setIsPlaying(false);
      },
      onPanResponderMove: (_, g) => {
        const dur  = durationRef.current;
        const raw  = rightGrantRatio.current + g.dx / TRIM_W;
        const maxR = Math.min(startRef.current + MAX_TRIM / dur, 1);
        const r    = Math.min(maxR, Math.max(raw, startRef.current + 1 / dur));
        endRef.current = r;
        setEndRatio(r);
        try { player.currentTime = Math.max(0, r * dur - 0.1); } catch {}
      },
      onPanResponderRelease: () => pauseAndSeekStart(),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // ── Drag + Pinch-to-scale — textes et stickers ───────────────────────────
  type ItemDrag = {
    pan:          RNAnimated.ValueXY;
    scale:        RNAnimated.Value;
    responder:    ReturnType<typeof PanResponder.create>;
    dragging:     boolean;
    cur:          { x: number; y: number };
    curScale:     number;
    pinchDist:    number | null; // distance initiale au grant du 2e doigt
  };

  function _makeDrag(
    id: string,
    initX: number, initY: number, initScale: number,
    onRelease: (finalX: number, finalY: number, finalScale: number) => void,
  ): ItemDrag {
    const pan   = new RNAnimated.ValueXY({ x: initX, y: initY });
    const scale = new RNAnimated.Value(initScale);
    const entry: ItemDrag = {
      pan, scale,
      dragging: false, cur: { x: initX, y: initY },
      curScale: initScale, pinchDist: null,
      responder: PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder:  () => true,
        onPanResponderGrant: (evt) => {
          const d = entry;
          d.dragging = true;
          d.pinchDist = null;
          pan.setOffset({ x: d.cur.x, y: d.cur.y });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (evt, g) => {
          const d = entry;
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            // Pinch — calculer le ratio
            const dist = _dist(touches[0], touches[1]);
            if (d.pinchDist === null) {
              d.pinchDist = dist;
            } else {
              const ratio = dist / d.pinchDist;
              const next  = Math.max(0.3, Math.min(4, d.curScale * ratio));
              scale.setValue(next);
            }
          } else {
            // 1 doigt — déplacement normal
            d.pinchDist = null;
            pan.x.setValue(g.dx);
            pan.y.setValue(g.dy);
          }
        },
        onPanResponderRelease: (evt, g) => {
          const d = entry;
          pan.flattenOffset();
          const finalX = d.cur.x + (d.pinchDist !== null ? 0 : g.dx);
          const finalY = d.cur.y + (d.pinchDist !== null ? 0 : g.dy);
          // Lire le scale courant depuis l'Animated.Value via listener ponctuel
          let finalScale = d.curScale;
          const id2 = scale.addListener(({ value }) => { finalScale = value; });
          scale.removeListener(id2);
          d.cur = { x: finalX, y: finalY };
          d.curScale = finalScale;
          d.dragging = false;
          d.pinchDist = null;
          onRelease(finalX, finalY, finalScale);
        },
      }),
    };
    return entry;
  }

  const layerDragsRef   = useRef<Record<string, ItemDrag>>({});
  const stickerDragsRef = useRef<Record<string, ItemDrag>>({});

  const getLayerDrag = useCallback((id: string, initX: number, initY: number): ItemDrag => {
    if (!layerDragsRef.current[id]) {
      layerDragsRef.current[id] = _makeDrag(id, initX, initY, 1, (fx, fy, fs) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, x: fx, y: fy, fontSize: Math.round(l.fontSize * fs / (layerDragsRef.current[id]?.curScale || 1) * fs) } : l));
        // plus simple : juste stocker x,y — la scale reste dans l'Animated.Value
        setLayers(prev => prev.map(l => l.id === id ? { ...l, x: fx, y: fy } : l));
      });
    }
    return layerDragsRef.current[id];
  }, []);

  const getStickerDrag = useCallback((id: string, initX: number, initY: number, initScale: number): ItemDrag => {
    if (!stickerDragsRef.current[id]) {
      stickerDragsRef.current[id] = _makeDrag(id, initX, initY, initScale, (fx, fy, fs) => {
        setStickers(prev => prev.map(st => st.id === id ? { ...st, x: fx, y: fy, scale: fs } : st));
      });
    }
    return stickerDragsRef.current[id];
  }, []);

  // Sync depuis l'extérieur (ajout/suppression)
  useEffect(() => {
    layers.forEach(l => {
      const d = layerDragsRef.current[l.id];
      if (d && !d.dragging) { d.cur = { x: l.x, y: l.y }; d.pan.setValue({ x: l.x, y: l.y }); }
    });
    const ids = new Set(layers.map(l => l.id));
    Object.keys(layerDragsRef.current).forEach(id => { if (!ids.has(id)) delete layerDragsRef.current[id]; });
  }, [layers]);

  useEffect(() => {
    stickers.forEach(st => {
      const d = stickerDragsRef.current[st.id];
      if (d && !d.dragging) { d.cur = { x: st.x, y: st.y }; d.pan.setValue({ x: st.x, y: st.y }); }
    });
    const ids = new Set(stickers.map(st => st.id));
    Object.keys(stickerDragsRef.current).forEach(id => { if (!ids.has(id)) delete stickerDragsRef.current[id]; });
  }, [stickers]);

  // ── Dessin PanResponder ───────────────────────────────────────────────────
  const drawPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => drawActive,
      onMoveShouldSetPanResponder:  () => drawActive,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        setCurrentPath([{ x, y }]);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        setCurrentPath(prev => [...prev, { x, y }]);
      },
      onPanResponderRelease: () => {
        setCurrentPath(pts => {
          if (pts.length > 1) {
            setDrawings(prev => [...prev, {
              id: `draw_${Date.now()}`,
              color: drawColor,
              width: drawWidth,
              points: pts,
            }]);
          }
          return [];
        });
      },
    }),
  ).current;

  // ── Text overlay ──────────────────────────────────────────────────────────
  const openTextOverlay = useCallback((layer?: TextLayer) => {
    if (layer) {
      setDraft(layer.text); setTxtColor(layer.color); setTxtSize(layer.fontSize);
      setTxtBold(layer.bold); setTxtItalic(layer.italic ?? false); setTxtBg(layer.bg);
      setTxtBgColor(layer.bgColor ?? 'rgba(0,0,0,0.70)');
      setTxtAlign(layer.align); setTxtFont(layer.font ?? 'default');
      setTxtAnim(layer.anim ?? 'none'); setTxtOutline(layer.outline ?? false);
      setEditLayerId(layer.id);
    } else {
      setDraft(''); setEditLayerId(null);
    }
    setTextOverlay(true);
  }, []);

  const commitText = useCallback(() => {
    Keyboard.dismiss();
    const t = draft.trim();
    if (!t) { setTextOverlay(false); setTool(null); return; }
    const base = {
      text: t, color: txtColor, fontSize: txtSize, bold: txtBold,
      italic: txtItalic, bg: txtBg, bgColor: txtBgColor,
      align: txtAlign, font: txtFont, anim: txtAnim, outline: txtOutline,
    };
    if (editLayerId) {
      setLayers(prev => prev.map(l => l.id === editLayerId ? { ...l, ...base } : l));
      setEditLayerId(null);
    } else {
      setLayers(prev => [...prev, {
        id: `txt_${Date.now()}`, x: W / 2 - 90, y: H * 0.38, ...base,
      }]);
    }
    setDraft(''); setTextOverlay(false); setTool(null);
  }, [draft, editLayerId, txtColor, txtSize, txtBold, txtItalic, txtBg, txtBgColor, txtAlign, txtFont, txtAnim, txtOutline]);

  const cancelText = useCallback(() => {
    Keyboard.dismiss(); setDraft(''); setEditLayerId(null); setTextOverlay(false); setTool(null);
  }, []);

  const deleteLayer = useCallback((id: string) => {
    showConfirm('Supprimer ce texte ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => setLayers(p => p.filter(l => l.id !== id)) },
    ]);
  }, []);

  const deleteSticker = useCallback((id: string) => {
    showConfirm('Supprimer ce sticker ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => setStickers(p => p.filter(st => st.id !== id)) },
    ]);
  }, []);

  const clearDrawings = useCallback(() => {
    showConfirm('Effacer tous les dessins ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: () => setDrawings([]) },
    ]);
  }, []);

  // ── Confirmer ─────────────────────────────────────────────────────────────
  const startSec  = startRef.current * durationSec;
  const endSec    = endRef.current   * durationSec;
  const trimSec   = endSec - startSec;
  const trimValid = trimSec >= 1 && trimSec <= MAX_TRIM;

  const handleConfirm = useCallback(() => {
    if (!isPhoto && !trimValid) {
      toastService.error(
        'Segment invalide',
        trimSec < 1 ? 'Minimum 1 seconde.' : `Maximum ${Math.round(MAX_TRIM / 60)} minute${MAX_TRIM > 60 ? 's' : ''}.`,
      );
      return;
    }
    if (!isPhoto) player.pause();
    stopSound();
    onConfirm({
      uri, startSec: startRef.current * durationSec, endSec: endRef.current * durationSec,
      speed, filter, adjust, layers, stickers, drawings,
      musicUri, musicName,
      musicStartSec: musicUri ? musicStartSec : undefined,
      musicEndSec:   musicUri ? musicEndSec   : undefined,
    });
  }, [isPhoto, trimValid, trimSec, player, onConfirm, uri, durationSec, speed, filter, adjust, layers, stickers, drawings, musicUri, musicName, musicStartSec, musicEndSec, stopSound]);

  // ── Dérivés ────────────────────────────────────────────────────────────────
  const activeFilt      = useMemo(() => FILTERS.find(f => f.key === filter) ?? FILTERS[0], [filter]);
  const videoFiltOp     = FILTER_VIDEO_OPACITY[filter];
  const videoFiltOp2    = FILTER_VIDEO_OPACITY2[filter];
  const selLeft         = startRatio * TRIM_W;
  const selWidth        = (endRatio - startRatio) * TRIM_W;
  const cursorX         = Math.min(playRatio * TRIM_W, TRIM_W - 2);
  const filteredFilters = useMemo(() => FILTERS.filter(f => f.category === filterCat), [filterCat]);
  const cycleAlign      = useCallback(() => setTxtAlign(a => a === 'left' ? 'center' : a === 'center' ? 'right' : 'left'), []);
  const alignIcon       = txtAlign === 'left' ? 'align-left' : txtAlign === 'right' ? 'align-right' : 'align-center';
  const hasEdits        = filter !== 'original' || speed !== 1 || layers.length > 0 || stickers.length > 0
                          || drawings.length > 0 || !!musicUri
                          || Object.values(adjust).some(v => v !== 0);

  const toggleTool = useCallback((k: ToolKey) => {
    if (k === 'text') {
      if (textOverlay) { cancelText(); return; }
      setTool('text'); openTextOverlay(); return;
    }
    if (k === 'draw') {
      setTool(prev => prev === 'draw' ? null : 'draw');
      setDrawActive(prev => !prev);
      return;
    }
    if (k === 'sticker') {
      setTool(prev => prev === 'sticker' ? null : 'sticker'); return;
    }
    Keyboard.dismiss();
    setTool(prev => prev === k ? null : k);
  }, [openTextOverlay, textOverlay, cancelText]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* ══ MEDIA PLEIN ÉCRAN ══ */}
      <View style={[StyleSheet.absoluteFill, s.videoContainer]}>
        {isPhoto ? (
          <>
            {/* Fond flouté agrandi — comble l'espace autour d'une photo dont le
                ratio ne correspond pas à l'écran 9:16, sans jamais recadrer
                l'image d'origine (voir <Image> ci-dessous, en "contain"). */}
            <Image source={{ uri }} style={s.videoView} resizeMode="cover" blurRadius={Platform.OS === 'android' ? 14 : 28} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
            <Image source={{ uri }} style={s.videoView} resizeMode="contain" />
          </>
        ) : (
          <VideoView player={player} style={s.videoView} resizeMode="cover" controls={false} />
        )}

        {/* Overlay filtre principal */}
        {videoFiltOp > 0 && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: activeFilt.overlay, opacity: videoFiltOp, zIndex: 1 }]} />
        )}
        {/* Double overlay pour effets neon/vintage */}
        {videoFiltOp2 > 0 && activeFilt.overlay2 && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: activeFilt.overlay2, opacity: videoFiltOp2, zIndex: 2 }]} />
        )}

        {/* Overlays réglages vidéo — feedback temps réel dans l'éditeur */}
        {adjust.brightness > 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${adjust.brightness * 0.35})`, zIndex: 3 }]} />}
        {adjust.brightness < 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${Math.abs(adjust.brightness) * 0.45})`, zIndex: 3 }]} />}
        {adjust.temperature > 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,120,0,${adjust.temperature * 0.18})`, zIndex: 3 }]} />}
        {adjust.temperature < 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,120,255,${Math.abs(adjust.temperature) * 0.18})`, zIndex: 3 }]} />}
        {adjust.saturation  < 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(128,128,128,${Math.abs(adjust.saturation) * 0.45})`, zIndex: 3 }]} />}
        {adjust.contrast    > 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${adjust.contrast * 0.12})`, zIndex: 3 }]} />}

        {/* Gradients */}
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.80)', 'transparent']} style={s.gradTop} />
        <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.85)']} style={s.gradBottom} />

        {/* Zone de dessin */}
        {drawActive && (
          <View
            ref={drawAreaRef}
            style={[StyleSheet.absoluteFill, { zIndex: 20 }]}
            {...drawPan.panHandlers}
          >
            {/* SVG-like path rendering via absolute Views */}
            {[...drawings, currentPath.length > 1 ? { id: '__cur', color: drawColor, width: drawWidth, points: currentPath } : null]
              .filter(Boolean)
              .map((path: any) =>
                path.points.slice(0, -1).map((pt: any, i: number) => {
                  const next = path.points[i + 1];
                  const dx = next.x - pt.x; const dy = next.y - pt.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                  // Centrer sur le point de départ : translateX(-len/2) puis rotate, puis translateX(len/2)
                  // Equivalent à transformOrigin: 'left center' sans utiliser transformOrigin
                  return (
                    <View key={`${path.id}_${i}`} pointerEvents="none" style={{
                      position: 'absolute',
                      left: pt.x,
                      top: pt.y - path.width / 2,
                      width: len,
                      height: path.width,
                      borderRadius: path.width / 2,
                      backgroundColor: path.color,
                      transform: [
                        { translateX: len / 2 },
                        { rotate: `${angle}deg` },
                        { translateX: -len / 2 },
                      ],
                    }} />
                  );
                })
              )
            }
          </View>
        )}

        {/* Tap play/pause (seulement si pas en mode dessin ou overlay texte, et pas une photo) */}
        {!isPhoto && !textOverlay && !drawActive && (
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={togglePlay} activeOpacity={1} />
        )}

        {/* Text layers draggables + pinch-to-scale */}
        {!textOverlay && layers.map(l => {
          const drag = getLayerDrag(l.id, l.x, l.y);
          return (
            <AnimatedTextLayer
              key={l.id}
              layer={l}
              pan={drag.pan}
              scale={drag.scale}
              onPress={() => openTextOverlay(l)}
              onLongPress={() => deleteLayer(l.id)}
              panHandlers={drag.responder.panHandlers}
            />
          );
        })}

        {/* Stickers draggables + pinch-to-scale */}
        {stickers.map(st => {
          const drag = getStickerDrag(st.id, st.x, st.y, st.scale);
          return (
            <StickerLayerView
              key={st.id}
              sticker={st}
              pan={drag.pan}
              scale={drag.scale}
              onLongPress={() => deleteSticker(st.id)}
              panHandlers={drag.responder.panHandlers}
            />
          );
        })}
      </View>

      {/* Bouton play/pause centré — masqué pour les photos */}
      {!isPhoto && !isPlaying && !textOverlay && !drawActive && (
        <View pointerEvents="none" style={[s.playHint, { top: insets.top + 110, bottom: (tool && !['text','draw','sticker'].includes(tool) ? PANEL_H_BASE : 0) + insets.bottom + 60 }]}>
          <View style={s.playCircle}>
            <Icon name="play" size={32} color="#fff" />
          </View>
        </View>
      )}

      {/* ══ HEADER ══ */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => { if (!isPhoto) player.pause(); onCancel(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={s.headerBadges}>
          {filter !== 'original' && (
            <View style={s.badge}><Icon name="sliders" size={10} color="#fff" /><Text style={s.badgeTxt}>{FILTERS.find(f => f.key === filter)?.label}</Text></View>
          )}
          {!isPhoto && speed !== 1 && (
            <View style={[s.badge, { backgroundColor: 'rgba(234,179,8,0.85)' }]}><Icon name="zap" size={10} color="#fff" /><Text style={s.badgeTxt}>{speed}×</Text></View>
          )}
          {layers.length > 0 && (
            <View style={[s.badge, { backgroundColor: 'rgba(96,165,250,0.85)' }]}><Icon name="type" size={10} color="#fff" /><Text style={s.badgeTxt}>{layers.length}</Text></View>
          )}
          {stickers.length > 0 && (
            <View style={[s.badge, { backgroundColor: 'rgba(255,200,50,0.85)' }]}><Icon name="smile" size={10} color="#fff" /><Text style={s.badgeTxt}>{stickers.length}</Text></View>
          )}
          {drawings.length > 0 && (
            <View style={[s.badge, { backgroundColor: 'rgba(255,100,100,0.85)' }]}><Icon name="edit-2" size={10} color="#fff" /><Text style={s.badgeTxt}>{drawings.length}</Text></View>
          )}
          {musicUri && (
            <View style={[s.badge, { backgroundColor: 'rgba(167,139,250,0.85)' }]}><Icon name="music" size={10} color="#fff" /><Text style={s.badgeTxt} numberOfLines={1}>{musicName?.replace(/\.(mp3|m4a|aac|wav|ogg|flac)$/i, '')}</Text></View>
          )}
          {Object.values(adjust).some(v => v !== 0) && (
            <View style={[s.badge, { backgroundColor: 'rgba(255,140,0,0.85)' }]}><Icon name="sun" size={10} color="#fff" /><Text style={s.badgeTxt}>Ajusté</Text></View>
          )}
        </View>

        <TouchableOpacity style={[s.nextBtn, (!isPhoto && !trimValid) && { opacity: 0.45 }]} onPress={handleConfirm} activeOpacity={0.85}>
          <LinearGradient colors={['#7B3FF2', '#C026D3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.nextBtnGrad}>
            <Text style={s.nextBtnTxt}>Suivant</Text>
            <Icon name="arrow-right" size={14} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ══ BARRE D'OUTILS ══ */}
      <View style={[s.toolbarWrap, { top: insets.top + 64 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolbarRow}>
          {TOOLS.filter(t => !isPhoto || (t.key !== 'trim' && t.key !== 'speed')).map(t => {
            const active = tool === t.key || (t.key === 'draw' && drawActive);
            const hasMark = (
              (t.key === 'filter'  && filter !== 'original') ||
              (t.key === 'speed'   && speed !== 1) ||
              (t.key === 'text'    && layers.length > 0) ||
              (t.key === 'sticker' && stickers.length > 0) ||
              (t.key === 'draw'    && drawings.length > 0) ||
              (t.key === 'music'   && !!musicUri) ||
              (t.key === 'adjust'  && Object.values(adjust).some(v => v !== 0))
            );
            return (
              <TouchableOpacity key={t.key} style={s.toolBtn} onPress={() => toggleTool(t.key)} activeOpacity={0.75}>
                <View style={[s.toolIconWrap, active && s.toolIconWrapActive]}>
                  <Icon name={t.icon} size={18} color={active ? '#A78BFA' : '#fff'} />
                  {hasMark && !active && <View style={s.toolDot} />}
                </View>
                <Text style={[s.toolLabel, active && { color: '#A78BFA' }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ══ INFO DURÉE — masqué pour les photos ══ */}
      {!isPhoto && (
        <View style={[s.trimInfo, { bottom: (tool && !['text','draw','sticker'].includes(tool) ? PANEL_H_BASE + 12 : 16) + insets.bottom }]} pointerEvents="none">
          <View style={[s.trimInfoBadge, !trimValid && { borderColor: '#EF4444' }]}>
            <Icon name="scissors" size={11} color={trimValid ? 'rgba(255,255,255,0.8)' : '#EF4444'} />
            <Text style={[s.trimInfoTxt, !trimValid && { color: '#EF4444' }]}>
              {fmt(trimSec)}{!trimValid && (trimSec < 1 ? ' · min 1s' : ` · max ${Math.round(MAX_TRIM / 60)}min`)}
            </Text>
          </View>
        </View>
      )}

      {/* ══ PANNEAU STICKER (flottant) ══ */}
      {tool === 'sticker' && (
        <View style={[s.floatingPanel, { bottom: insets.bottom + 16 }]}>
          <View style={s.floatingPanelHeader}>
            <Text style={s.panelTitle}>Stickers</Text>
            <View style={s.stickerSetTabs}>
              {STICKER_SETS.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => setStickerSet(i)} style={[s.stickerSetTab, stickerSet === i && s.stickerSetTabActive]}>
                  <Text style={{ fontSize: 16 }}>{STICKER_SETS[i][0]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stickerGrid}>
            {STICKER_SETS[stickerSet].map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={s.stickerBtn}
                onPress={() => {
                  setStickers(prev => [...prev, {
                    id: `stk_${Date.now()}`, emoji, x: W / 2 - 28, y: H * 0.40, scale: 1,
                  }]);
                  setTool(null);
                }}
                activeOpacity={0.75}
              >
                <Text style={s.stickerEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ══ PANNEAU DESSIN (flottant) ══ */}
      {tool === 'draw' && (
        <View style={[s.floatingPanel, { bottom: insets.bottom + 16 }]}>
          <View style={s.floatingPanelHeader}>
            <Text style={s.panelTitle}>Dessin libre</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {drawings.length > 0 && (
                <TouchableOpacity onPress={clearDrawings} style={s.drawClearBtn}>
                  <Icon name="trash-2" size={14} color="#EF4444" />
                  <Text style={s.drawClearTxt}>Effacer</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (drawings.length > 0) setDrawings(p => p.slice(0, -1));
                }}
                style={[s.drawClearBtn, { borderColor: 'rgba(255,255,255,0.2)' }]}
              >
                <Icon name="corner-up-left" size={14} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
            {DRAW_COLORS.map(c => (
              <TouchableOpacity
                key={c} onPress={() => setDrawColor(c)}
                style={[s.colorDot, { backgroundColor: c }, drawColor === c && s.colorDotActive]}
              />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'center' }}>
            <Text style={s.panelHint}>Épaisseur :</Text>
            {DRAW_WIDTHS.map(w => (
              <TouchableOpacity key={w} onPress={() => setDrawWidth(w)} style={{ alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}>
                <View style={{ width: w * 1.8, height: w * 1.8, borderRadius: w, backgroundColor: drawWidth === w ? drawColor : 'rgba(255,255,255,0.3)' }} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ══ PANNEAU BAS ANIMÉ ══ */}
      <Animated.View style={[s.panel, { paddingBottom: insets.bottom + 4 }, panelStyle]}>

        {/* ── ROGNER ── */}
        {tool === 'trim' && (
          <View style={s.trimPanel}>
            <View style={s.trimHeader}>
              <Text style={s.panelTitle}>Rogner</Text>
              <Text style={[s.trimDurTxt, !trimValid && { color: '#EF4444' }]}>
                {fmt(startRatio * durationSec)} – {fmt(endRatio * durationSec)}
                {'  '}<Text style={{ fontWeight: '800' }}>{fmt(trimSec)}</Text>
              </Text>
            </View>

            <View style={s.frameBarOuter}>
              <View style={s.frameBar} pointerEvents="none">
                {Array.from({ length: 28 }).map((_, i) => (
                  <View key={i} style={[s.frameCell, { opacity: 0.35 + (i % 3) * 0.15 }]} />
                ))}
                <View style={[s.dimL, { width: selLeft }]} />
                <View style={[s.dimR, { left: selLeft + selWidth }]} />
                <View style={[s.selBox, { left: selLeft, width: selWidth }, !trimValid && { borderColor: '#FFD60A' }]} />
                <View style={[s.cursor, { left: Math.max(selLeft, Math.min(cursorX, selLeft + selWidth - 2)) }]} />
              </View>
              <View style={[s.handle, s.handleL, { left: selLeft }]} {...leftPan.panHandlers}>
                <View style={s.handlePip} />
              </View>
              <View style={[s.handle, s.handleR, { left: selLeft + selWidth - (HANDLE_W + 8) }]} {...rightPan.panHandlers}>
                <View style={s.handlePip} />
              </View>
            </View>

            {/* Bouton play segment + hint */}
            <View style={s.trimFooter}>
              <TouchableOpacity onPress={togglePlay} style={s.trimPlayBtn} activeOpacity={0.8}>
                <Icon name={isPlaying ? 'pause' : 'play'} size={16} color="#000" />
              </TouchableOpacity>
              <Text style={s.panelHint} numberOfLines={1}>
                {isPlaying ? 'Lecture du segment…' : 'Appuie pour prévisualiser le segment'}
              </Text>
            </View>
          </View>
        )}

        {/* ── FILTRES ── */}
        {tool === 'filter' && (
          <View style={s.filterPanel}>
            <View style={s.filterPanelHeader}>
              <Text style={s.panelTitle}>Filtre</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterCatRow}>
                {FILTER_CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat} onPress={() => setFilterCat(cat)} style={[s.filterCatChip, filterCat === cat && s.filterCatChipActive]}>
                    <Text style={[s.filterCatTxt, filterCat === cat && { color: '#A78BFA' }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterList}>
              {filteredFilters.map(f => (
                <FilterThumb key={f.key} f={f} active={filter === f.key} thumbnailUri={thumbnailUri} onPress={() => setFilter(f.key)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── RÉGLAGES VIDÉO ── */}
        {tool === 'adjust' && (
          <View style={s.adjustPanel}>
            <View style={s.adjustHeader}>
              <Text style={s.panelTitle}>Réglages</Text>
              <TouchableOpacity onPress={() => setAdjust({ ...DEFAULT_ADJUST })} style={s.adjustResetBtn}>
                <Icon name="refresh-cw" size={13} color="rgba(255,255,255,0.5)" />
                <Text style={s.adjustResetTxt}>Reset</Text>
              </TouchableOpacity>
            </View>
            {([
              { key: 'brightness', label: 'Luminosité', icon: 'sun'         },
              { key: 'contrast',   label: 'Contraste',  icon: 'circle'      },
              { key: 'saturation', label: 'Saturation', icon: 'droplet'     },
              { key: 'temperature',label: 'Temp.',       icon: 'thermometer' },
            ] as const).map(({ key, label, icon }) => (
              <View key={key} style={s.adjustRow}>
                <Icon name={icon} size={14} color="rgba(255,255,255,0.55)" />
                <Text style={s.adjustLabel}>{label}</Text>
                <AdjustSlider
                  value={adjust[key]}
                  onChange={v => setAdjust(a => ({ ...a, [key]: v }))}
                />
                <Text style={s.adjustVal}>
                  {adjust[key] > 0 ? `+${(adjust[key] * 100).toFixed(0)}` : (adjust[key] * 100).toFixed(0)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── VITESSE ── */}
        {tool === 'speed' && (
          <View style={s.speedPanel}>
            <Text style={s.panelTitle}>Vitesse de lecture</Text>
            <View style={s.speedGrid}>
              {SPEEDS.map(sp => {
                const active = speed === sp.v;
                return (
                  <TouchableOpacity key={sp.v} style={[s.speedChip, active && s.speedChipActive]} onPress={() => setSpeed(sp.v)} activeOpacity={0.75}>
                    <Text style={[s.speedTxt, active && s.speedTxtActive]}>{sp.label}</Text>
                    {sp.v < 1 && <Text style={s.speedSub}>Ralenti</Text>}
                    {sp.v > 1 && <Text style={s.speedSub}>Rapide</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── MUSIQUE ── */}
        {tool === 'music' && (
          <View style={s.musicPanel}>
            <Text style={s.panelTitle}>Musique</Text>
            {musicUri ? (
              <>
                {/* Carte son selectionne */}
                <View style={s.musicSelected}>
                  <LinearGradient colors={['#7B3FF2', '#C026D3']} style={s.musicIconWrap}>
                    <Icon name="music" size={18} color="#fff" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={s.musicTitle} numberOfLines={1}>{musicName}</Text>
                    <Text style={s.musicSub}>
                      {musicDuration > 0
                        ? `${Math.floor(musicStartSec)}s – ${Math.floor(musicEndSec)}s · ${Math.ceil(musicEndSec - musicStartSec)}s sélectionnés`
                        : 'Chargement...'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      if (musicPlaying) { stopSound(); }
                      else { playMusicSegment(musicUri!, musicStartSec); }
                    }}
                    style={s.musicPlayBtn}
                  >
                    <Icon name={musicPlaying ? 'pause' : 'play'} size={16} color="#A78BFA" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleRemoveMusic} style={s.musicRemoveBtn}>
                    <Icon name="x" size={16} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                </View>

                {/* Trimmer audio */}
                {musicDuration > 0 && (() => {
                  const startRatiM = musicStartSec / musicDuration;
                  const endRatioM  = musicEndSec   / musicDuration;
                  const selLeftM   = startRatiM * MUSIC_TRIM_W;
                  const selWidthM  = (endRatioM - startRatiM) * MUSIC_TRIM_W;

                  const startPanM = PanResponder.create({
                    onStartShouldSetPanResponder: () => true,
                    onPanResponderMove: (_, g) => {
                      const r = Math.max(0, Math.min(1, (selLeftM + g.dx) / MUSIC_TRIM_W));
                      const newStart = r * musicDuration;
                      if (newStart < musicEndSec - 1) setMusicStartSec(newStart);
                    },
                  });

                  const endPanM = PanResponder.create({
                    onStartShouldSetPanResponder: () => true,
                    onPanResponderMove: (_, g) => {
                      const r = Math.max(0, Math.min(1, (selLeftM + selWidthM + g.dx) / MUSIC_TRIM_W));
                      const newEnd = r * musicDuration;
                      if (newEnd > musicStartSec + 1) setMusicEndSec(newEnd);
                    },
                  });

                  return (
                    <View style={s.musicTrimWrap}>
                      <Text style={s.musicTrimLabel}>Choisir la partie</Text>
                      <View style={s.musicTrimTrack}>
                        {/* Zone non selectionnee gauche */}
                        <View style={[s.musicTrimDim, { width: selLeftM }]} />
                        {/* Zone selectionnee */}
                        <View style={[s.musicTrimSel, { left: selLeftM, width: selWidthM }]} />
                        {/* Zone non selectionnee droite */}
                        <View style={[s.musicTrimDim, { position: 'absolute', left: selLeftM + selWidthM, right: 0 }]} />
                        {/* Poignee debut */}
                        <View {...startPanM.panHandlers} style={[s.musicHandle, s.musicHandleL, { left: selLeftM - HANDLE_W / 2 }]}>
                          <View style={s.musicHandleBar} />
                        </View>
                        {/* Poignee fin */}
                        <View {...endPanM.panHandlers} style={[s.musicHandle, s.musicHandleR, { left: selLeftM + selWidthM - HANDLE_W / 2 }]}>
                          <View style={s.musicHandleBar} />
                        </View>
                      </View>
                      {/* Labels temps */}
                      <View style={s.musicTrimTimes}>
                        <Text style={s.musicTrimTime}>0:00</Text>
                        <Text style={s.musicTrimTime}>
                          {Math.floor(musicDuration / 60)}:{String(Math.floor(musicDuration % 60)).padStart(2, '0')}
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                <TouchableOpacity style={s.musicPickBtn} onPress={() => setShowSoundPicker(true)} activeOpacity={0.8}>
                  <Icon name="globe" size={18} color="#A78BFA" />
                  <Text style={s.musicPickTxt}>Changer (bibliothèque)</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={s.musicPickBtn} onPress={() => setShowSoundPicker(true)} activeOpacity={0.8}>
                  <Icon name="globe" size={18} color="#A78BFA" />
                  <Text style={s.musicPickTxt}>Sons populaires</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.musicPickBtn, musicPicking && { opacity: 0.6 }]} onPress={handlePickMusicLocal} disabled={musicPicking} activeOpacity={0.8}>
                  {musicPicking ? <ActivityIndicator size="small" color="#A78BFA" /> : <Icon name="folder" size={18} color="#A78BFA" />}
                  <Text style={s.musicPickTxt}>Mes fichiers</Text>
                </TouchableOpacity>
              </>
            )}
            {musicUri && (
              <TouchableOpacity style={[s.musicPickBtn, musicPicking && { opacity: 0.6 }]} onPress={handlePickMusicLocal} disabled={musicPicking} activeOpacity={0.8}>
                {musicPicking ? <ActivityIndicator size="small" color="#A78BFA" /> : <Icon name="folder" size={18} color="#A78BFA" />}
                <Text style={s.musicPickTxt}>Mes fichiers</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </Animated.View>

      {/* ══ OVERLAY TEXTE — plein écran ══ */}
      {textOverlay && (
        <View style={[StyleSheet.absoluteFill, s.textOverlay]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={cancelText} />
          <View style={[s.textSheet, { paddingBottom: insets.bottom + 12 }]}>

            {/* Header */}
            <View style={s.textSheetHeader}>
              <TouchableOpacity onPress={cancelText} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.textSheetCancel}>Annuler</Text>
              </TouchableOpacity>
              <Text style={s.textSheetTitle}>{editLayerId ? 'Modifier' : 'Ajouter texte'}</Text>
              <TouchableOpacity onPress={commitText} disabled={!draft.trim()} style={[s.textSheetDone, !draft.trim() && { opacity: 0.4 }]}>
                <Text style={s.textSheetDoneTxt}>OK</Text>
              </TouchableOpacity>
            </View>

            {/* Onglets style / animation / police */}
            <View style={s.textTabRow}>
              {(['style', 'anim', 'font'] as const).map(tab => (
                <TouchableOpacity key={tab} style={[s.textTab, textTab === tab && s.textTabActive]} onPress={() => setTextTab(tab)}>
                  <Text style={[s.textTabTxt, textTab === tab && { color: '#A78BFA' }]}>
                    {tab === 'style' ? 'Style' : tab === 'anim' ? 'Animation' : 'Police'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Preview */}
            <View style={s.textPreviewWrap} pointerEvents="none">
              <Text style={[
                s.textPreview,
                {
                  color:             txtColor,
                  fontSize:          txtSize,
                  fontWeight:        txtBold ? '800' : '400',
                  fontStyle:         txtItalic ? 'italic' : 'normal',
                  textAlign:         txtAlign,
                  backgroundColor:   txtBg && txtBgColor !== 'transparent' ? txtBgColor : 'transparent',
                  paddingHorizontal: txtBg ? 12 : 0,
                  paddingVertical:   txtBg ? 6 : 0,
                  borderRadius:      txtBg ? 8 : 0,
                  ...(TEXT_FONTS.find(f => f.key === txtFont)?.style ?? {}),
                },
              ]}>
                {draft || 'Ton texte ici...'}
              </Text>
            </View>

            {/* Input */}
            <View style={s.textInputWrap}>
              <TextInput
                value={draft} onChangeText={setDraft}
                placeholder="Écris ton texte..." placeholderTextColor="rgba(255,255,255,0.25)"
                style={[s.textInput, { color: txtColor, fontWeight: txtBold ? '800' : '400', textAlign: txtAlign }]}
                maxLength={120} autoFocus returnKeyType="done" onSubmitEditing={commitText} multiline={false}
              />
              {draft.trim().length > 0 && (
                <TouchableOpacity style={s.textClearBtn} onPress={() => setDraft('')}>
                  <Icon name="x-circle" size={16} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Onglet Style */}
            {textTab === 'style' && (
              <>
                <View style={s.textControls}>
                  <TouchableOpacity style={[s.styleBtn, txtBold && s.styleBtnActive]} onPress={() => setTxtBold(v => !v)}>
                    <Text style={[s.styleBtnTxt, { fontWeight: '800', color: txtBold ? '#A78BFA' : '#fff' }]}>B</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.styleBtn, txtItalic && s.styleBtnActive]} onPress={() => setTxtItalic(v => !v)}>
                    <Text style={[s.styleBtnTxt, { fontStyle: 'italic', color: txtItalic ? '#A78BFA' : '#fff' }]}>I</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.styleBtn, txtOutline && s.styleBtnActive]} onPress={() => setTxtOutline(v => !v)}>
                    <Text style={[s.styleBtnTxt, { color: txtOutline ? '#A78BFA' : '#fff' }]}>O</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.styleBtn} onPress={cycleAlign}>
                    <Icon name={alignIcon} size={14} color="rgba(255,255,255,0.75)" />
                  </TouchableOpacity>
                  <View style={s.sizeStepper}>
                    <TouchableOpacity style={s.stepBtn} onPress={() => setTxtSize(v => Math.max(14, v - 2))}>
                      <Icon name="minus" size={12} color="#fff" />
                    </TouchableOpacity>
                    <Text style={s.sizeVal}>{txtSize}</Text>
                    <TouchableOpacity style={s.stepBtn} onPress={() => setTxtSize(v => Math.min(72, v + 2))}>
                      <Icon name="plus" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Couleur texte */}
                <Text style={[s.panelHint, { textAlign: 'left', marginBottom: 4 }]}>Couleur du texte</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.palette}>
                  {PALETTE.map(c => (
                    <TouchableOpacity key={c} onPress={() => setTxtColor(c)}
                      style={[s.colorDot, { backgroundColor: c }, txtColor === c && s.colorDotActive,
                        c === '#000000' && { borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1.5 }]} />
                  ))}
                </ScrollView>

                {/* Fond texte toggle + couleur fond */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <TouchableOpacity style={[s.styleBtn, txtBg && s.styleBtnActive]} onPress={() => setTxtBg(v => !v)}>
                    <Icon name="square" size={14} color={txtBg ? '#A78BFA' : 'rgba(255,255,255,0.6)'} />
                  </TouchableOpacity>
                  {txtBg && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {BG_COLORS.map(c => (
                        <TouchableOpacity key={c} onPress={() => setTxtBgColor(c)}
                          style={[s.bgColorDot, { backgroundColor: c === 'transparent' ? 'rgba(255,255,255,0.12)' : c },
                            txtBgColor === c && s.colorDotActive]} >
                          {c === 'transparent' && <Icon name="x" size={10} color="rgba(255,255,255,0.6)" />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </>
            )}

            {/* Onglet Animation */}
            {textTab === 'anim' && (
              <View style={s.animGrid}>
                {TEXT_ANIMS.map(a => (
                  <TouchableOpacity key={a.key} style={[s.animChip, txtAnim === a.key && s.animChipActive]} onPress={() => setTxtAnim(a.key)} activeOpacity={0.75}>
                    <Icon name={a.icon} size={18} color={txtAnim === a.key ? '#A78BFA' : 'rgba(255,255,255,0.6)'} />
                    <Text style={[s.animChipTxt, txtAnim === a.key && { color: '#A78BFA' }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Onglet Police */}
            {textTab === 'font' && (
              <View style={s.fontGrid}>
                {TEXT_FONTS.map(f => (
                  <TouchableOpacity key={f.key} style={[s.fontChip, txtFont === f.key && s.fontChipActive]} onPress={() => setTxtFont(f.key)} activeOpacity={0.75}>
                    <Text style={[s.fontChipTxt, f.style, txtFont === f.key && { color: '#A78BFA' }]}>{f.label}</Text>
                    <Text style={[s.fontChipSub, txtFont === f.key && { color: 'rgba(167,139,250,0.7)' }]}>
                      {f.key === 'default' ? 'Défaut' : f.key === 'bold' ? 'Épais' : f.key === 'thin' ? 'Fin' : f.key === 'mono' ? 'Mono' : 'Serif'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

          </View>
        </View>
      )}

      {/* ══ SOUND PICKER ══ */}
      {showSoundPicker && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]}>
          <SoundPicker
            colors={DARK_COLORS}
            onGoBack={() => setShowSoundPicker(false)}
            onSelectLocal={() => { setShowSoundPicker(false); handlePickMusicLocal(); }}
            onSelectSaved={(url: string, title?: string) => {
              stopSound();
              setMusicUri(url);
              setMusicName(title ?? 'Son');
              loadMusicMeta(url);
              setShowSoundPicker(false);
            }}
          />
        </View>
      )}

    </View>
  );
};

const DARK_COLORS = {
  background:          '#0F0F0F',
  backgroundSecondary: '#1A1A1A',
  surface:             '#1A1A1A',
  border:              'rgba(255,255,255,0.12)',
  divider:             'rgba(255,255,255,0.08)',
  primary:             '#A78BFA',
  textPrimary:         '#FFFFFF',
  textSecondary:       'rgba(255,255,255,0.65)',
  textTertiary:        'rgba(255,255,255,0.4)',
  textDisabled:        'rgba(255,255,255,0.25)',
  inputBg:             '#2A2A2A',
} as any;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#000' },
  videoContainer: { alignItems: 'center', justifyContent: 'center' },
  // position absolute obligatoire — sans ça, le fond flouté (cover) et le
  // média net (contain) s'empilent dans le flux normal du conteneur au lieu
  // de se superposer, créant une bande noire visible entre les deux.
  videoView:      { position: 'absolute', top: 0, left: 0, width: W, height: H },

  gradTop:    { position: 'absolute', top: 0,    left: 0, right: 0, height: 180, zIndex: 2 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, zIndex: 2 },

  playHint:   { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  playCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },

  textLayer:    { position: 'absolute', zIndex: 8 },
  textLayerTxt: {},
  stickerLayer: { position: 'absolute', zIndex: 9 },

  // Header
  header:        { position: 'absolute', left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  headerBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerBadges:  { flex: 1, flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  badge:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(123,63,242,0.85)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  badgeTxt:      { color: '#fff', fontSize: 11, fontWeight: '700' },
  nextBtn:       { borderRadius: 24, overflow: 'hidden' },
  nextBtnGrad:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10 },
  nextBtnTxt:    { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Toolbar
  toolbarWrap:        { position: 'absolute', left: 0, right: 0, zIndex: 15 },
  toolbarRow:         { flexDirection: 'row', gap: 2, paddingHorizontal: 12, paddingVertical: 6 },
  toolBtn:            { alignItems: 'center', gap: 3, paddingHorizontal: 5 },
  toolIconWrap:       { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' },
  toolIconWrapActive: { backgroundColor: 'rgba(123,63,242,0.35)', borderColor: '#A78BFA' },
  toolLabel:          { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '700' },
  toolDot:            { position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#A78BFA', borderWidth: 1.5, borderColor: '#000' },

  // Info durée
  trimInfo:      { position: 'absolute', left: 16, zIndex: 10 },
  trimInfoBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  trimInfoTxt:   { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Panel bas
  panel:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(8,6,18,0.98)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', zIndex: 30 },
  panelTitle: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  panelHint:  { color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 4 },

  // Floating panel (stickers, draw)
  floatingPanel: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(8,6,18,0.97)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', zIndex: 30, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  floatingPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },

  // Trim
  trimPanel:  { paddingHorizontal: 24, paddingTop: 16, gap: 10 },
  trimHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  trimDurTxt: { color: '#A78BFA', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  trimFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6 },
  trimPlayBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFD60A', alignItems: 'center', justifyContent: 'center' },
  frameBarOuter: { height: 64, position: 'relative', overflow: 'visible' },
  frameBar:      { position: 'absolute', top: 8, left: 0, right: 0, bottom: 8, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#1A1830' },
  frameCell:  { flex: 1, height: '100%', backgroundColor: '#2A2848', borderRightWidth: 0.5, borderRightColor: '#0A0814' },
  dimL:       { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1 },
  dimR:       { position: 'absolute', top: 0, bottom: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1 },
  selBox:     { position: 'absolute', top: 0, bottom: 0, borderWidth: 2.5, borderColor: '#FFD60A', borderRadius: 6, zIndex: 2 },
  cursor:     { position: 'absolute', top: 0, bottom: 0, width: 2.5, backgroundColor: '#fff', zIndex: 5 },
  handle:     { position: 'absolute', top: 0, bottom: 0, width: HANDLE_W + 8, zIndex: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD60A' },
  handleL:    { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  handleR:    { borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  handlePip:  { width: 3, height: 24, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.4)' },

  // Filtres
  filterPanel:       { paddingTop: 12 },
  filterPanelHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  filterCatRow:      { gap: 8, paddingRight: 16, alignItems: 'center' },
  filterCatChip:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  filterCatChipActive:{ backgroundColor: 'rgba(123,63,242,0.25)', borderColor: '#A78BFA' },
  filterCatTxt:      { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700' },
  filterList:        { gap: 10, paddingHorizontal: 16, alignItems: 'center' },
  filterItem:        { alignItems: 'center', gap: 6 },
  filterThumb:       { width: 72, height: 72, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'transparent' },
  filterThumbActive: { borderColor: '#A78BFA' },
  filterCheck:       { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#A78BFA', alignItems: 'center', justifyContent: 'center' },
  filterLbl:         { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '600' },

  // Réglages vidéo
  adjustPanel:    { paddingHorizontal: 20, paddingTop: 12, gap: 6 },
  adjustHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  adjustResetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)' },
  adjustResetTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
  adjustRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adjustLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', width: 68 },
  adjustVal:   { color: '#A78BFA', fontSize: 11, fontWeight: '700', width: 30, textAlign: 'right', fontVariant: ['tabular-nums'] },

  // Vitesse
  speedPanel:     { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  speedGrid:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  speedChip:      { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', minWidth: 70 },
  speedChipActive:{ backgroundColor: 'rgba(167,139,250,0.2)', borderColor: '#A78BFA' },
  speedTxt:       { color: 'rgba(255,255,255,0.5)', fontWeight: '700', fontSize: 14 },
  speedTxtActive: { color: '#A78BFA' },
  speedSub:       { color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 2, fontWeight: '600' },

  // Musique
  musicPanel:    { paddingHorizontal: 20, paddingTop: 14, gap: 10 },
  musicIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  musicTitle:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  musicSub:      { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  musicSelected: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(167,139,250,0.12)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  musicPlayBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  musicRemoveBtn:{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  musicPickBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(167,139,250,0.12)', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(167,139,250,0.28)' },
  musicPickTxt:  { color: '#A78BFA', fontWeight: '700', fontSize: 14 },

  // Trimmer audio
  musicTrimWrap:   { gap: 6 },
  musicTrimLabel:  { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  musicTrimTrack:  { height: 36, borderRadius: 8, backgroundColor: 'rgba(167,139,250,0.15)', overflow: 'visible', position: 'relative' },
  musicTrimDim:    { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  musicTrimSel:    { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(123,63,242,0.45)', borderWidth: 1.5, borderColor: '#A78BFA' },
  musicHandle:     { position: 'absolute', top: 0, bottom: 0, width: HANDLE_W, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  musicHandleL:    { borderTopLeftRadius: 6, borderBottomLeftRadius: 6, backgroundColor: '#7B3FF2' },
  musicHandleR:    { borderTopRightRadius: 6, borderBottomRightRadius: 6, backgroundColor: '#7B3FF2' },
  musicHandleBar:  { width: 2.5, height: 16, borderRadius: 2, backgroundColor: '#fff' },
  musicTrimTimes:  { flexDirection: 'row', justifyContent: 'space-between' },
  musicTrimTime:   { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontVariant: ['tabular-nums'] },

  // Stickers
  stickerSetTabs:  { flexDirection: 'row', gap: 6 },
  stickerSetTab:   { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  stickerSetTabActive: { backgroundColor: 'rgba(123,63,242,0.35)', borderWidth: 1, borderColor: '#A78BFA' },
  stickerGrid:     { gap: 8, paddingVertical: 4 },
  stickerBtn:      { width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  stickerEmoji:    { fontSize: 30 },

  // Dessin
  drawClearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  drawClearTxt: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  // Overlay texte
  textOverlay: { zIndex: 50, justifyContent: 'flex-end' },
  textSheet:   { backgroundColor: 'rgba(10,8,20,0.98)', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  textSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  textSheetCancel: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' },
  textSheetTitle:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  textSheetDone:   { backgroundColor: '#7B3FF2', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 18 },
  textSheetDoneTxt:{ color: '#fff', fontSize: 14, fontWeight: '800' },

  textTabRow:    { flexDirection: 'row', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 3 },
  textTab:       { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10 },
  textTabActive: { backgroundColor: 'rgba(123,63,242,0.45)' },
  textTabTxt:    { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' },

  textPreviewWrap: { alignItems: 'center', paddingVertical: 6, minHeight: 56, justifyContent: 'center' },
  textPreview:     { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  textInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  textInput:     { flex: 1, fontSize: 16, minHeight: 42, color: '#fff' },
  textClearBtn:  { padding: 4 },

  textControls: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  styleBtn:     { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  styleBtnActive:{ borderColor: '#A78BFA', backgroundColor: 'rgba(167,139,250,0.18)' },
  styleBtnTxt:  { fontSize: 16 },
  sizeStepper:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 3, marginLeft: 'auto' },
  stepBtn:      { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  sizeVal:      { color: '#fff', fontWeight: '700', fontSize: 12, minWidth: 24, textAlign: 'center' },

  palette:    { gap: 8, paddingVertical: 2 },
  colorDot:   { width: 30, height: 30, borderRadius: 15 },
  colorDotActive: { transform: [{ scale: 1.35 }], shadowColor: '#fff', shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  bgColorDot: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Animations texte
  animGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingVertical: 8 },
  animChip:     { alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', minWidth: 80 },
  animChipActive:{ backgroundColor: 'rgba(123,63,242,0.3)', borderColor: '#A78BFA' },
  animChipTxt:  { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700' },

  // Polices
  fontGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingVertical: 8 },
  fontChip:     { alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', minWidth: 72 },
  fontChipActive:{ backgroundColor: 'rgba(123,63,242,0.3)', borderColor: '#A78BFA' },
  fontChipTxt:  { color: '#fff', fontSize: 20 },
  fontChipSub:  { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600' },
});
