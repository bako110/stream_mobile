import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, PanResponder, Dimensions, Platform,
  StatusBar, Alert, Keyboard, ActivityIndicator, Image,
} from 'react-native';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import Sound from 'react-native-sound';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W, height: H } = Dimensions.get('window');
const TRIM_W   = W - 48;
const HANDLE_W = 20;
const MAX_TRIM = 90;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FilterKey =
  | 'original' | 'vivid' | 'fade' | 'warm'
  | 'cold'     | 'noir'  | 'drama' | 'golden';

export interface TextLayer {
  id:       string;
  text:     string;
  x:        number;
  y:        number;
  color:    string;
  fontSize: number;
  bold:     boolean;
  bg:       boolean;
  align:    'left' | 'center' | 'right';
}

export interface ReelEditResult {
  uri:          string;
  thumbnailUri?: string;
  startSec:     number;
  endSec:       number;
  speed:        number;
  filter:       FilterKey;
  layers:       TextLayer[];
  musicUri?:    string;
  musicName?:   string;
}

interface Props {
  uri:            string;
  durationSec:    number;
  thumbnailUri?:  string;
  initialResult?: ReelEditResult;
  onConfirm:      (r: ReelEditResult) => void;
  onCancel:       () => void;
}

type ToolKey = 'trim' | 'filter' | 'text' | 'speed' | 'music';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

interface FilterDef {
  key:      FilterKey;
  label:    string;
  overlay:  string;
  opacity:  number;
  blendBg?: string;
}

const FILTERS: FilterDef[] = [
  { key: 'original', label: 'Normal',  overlay: 'transparent', opacity: 0 },
  { key: 'vivid',    label: 'Vivid',   overlay: '#FF3CAC',     opacity: 0.25, blendBg: '#1A0030' },
  { key: 'warm',     label: 'Warm',    overlay: '#FF7E00',     opacity: 0.28, blendBg: '#1A0800' },
  { key: 'cold',     label: 'Cold',    overlay: '#00BFFF',     opacity: 0.25, blendBg: '#000D1A' },
  { key: 'fade',     label: 'Fade',    overlay: '#FFFFFF',     opacity: 0.30, blendBg: '#1A1830' },
  { key: 'noir',     label: 'Noir',    overlay: '#000000',     opacity: 0.60, blendBg: '#000' },
  { key: 'drama',    label: 'Drama',   overlay: '#1A003A',     opacity: 0.45, blendBg: '#0D001F' },
  { key: 'golden',   label: 'Golden',  overlay: '#FFD700',     opacity: 0.24, blendBg: '#1A1200' },
];

// Opacités réelles (moins intenses sur la vidéo que dans la vignette)
const FILTER_VIDEO_OPACITY: Record<FilterKey, number> = {
  original: 0,
  vivid:    0.15,
  warm:     0.18,
  cold:     0.18,
  fade:     0.20,
  noir:     0.55,
  drama:    0.35,
  golden:   0.14,
};

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
];

const TOOLS: { key: ToolKey; icon: string; label: string }[] = [
  { key: 'trim',   icon: 'scissors', label: 'Rogner'  },
  { key: 'filter', icon: 'sliders',  label: 'Filtre'  },
  { key: 'text',   icon: 'type',     label: 'Texte'   },
  { key: 'speed',  icon: 'zap',      label: 'Vitesse' },
  { key: 'music',  icon: 'music',    label: 'Musique' },
];

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ─────────────────────────────────────────────────────────────────────────────
// FilterThumb — vignette filtre avec thumbnail réelle
// ─────────────────────────────────────────────────────────────────────────────

const FilterThumb: React.FC<{
  f: FilterDef;
  active: boolean;
  thumbnailUri?: string;
  onPress: () => void;
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
      {f.key === 'noir' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 0.3 }]} />
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
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export const ReelEditorScreen: React.FC<Props> = ({
  uri, durationSec, thumbnailUri, initialResult, onConfirm, onCancel,
}) => {
  const insets = useSafeAreaInsets();

  // ── Player ────────────────────────────────────────────────────────────────
  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = false;
  });

  const [isPlaying,  setIsPlaying]  = useState(false);
  const [playRatio,  setPlayRatio]  = useState(0);

  // ── État édition ──────────────────────────────────────────────────────────
  const init = initialResult;
  const initStartR = init ? (durationSec > 0 ? init.startSec / durationSec : 0) : 0;
  const initEndR   = init
    ? (durationSec > 0 ? init.endSec / durationSec : 1)
    : durationSec > MAX_TRIM ? MAX_TRIM / durationSec : 1;

  const [startRatio, setStartRatio] = useState(initStartR);
  const [endRatio,   setEndRatio]   = useState(initEndR);
  const startRef = useRef(initStartR);
  const endRef   = useRef(initEndR);

  const [filter,  setFilter]  = useState<FilterKey>(init?.filter  ?? 'original');
  const [speed,   setSpeed]   = useState(init?.speed   ?? 1.0);
  const [layers,  setLayers]  = useState<TextLayer[]>(init?.layers ?? []);
  const [tool,    setTool]    = useState<ToolKey | null>(null);

  // ── Musique ───────────────────────────────────────────────────────────────
  const [musicUri,     setMusicUri]     = useState<string | undefined>(init?.musicUri);
  const [musicName,    setMusicName]    = useState<string | undefined>(init?.musicName);
  const [musicPicking, setMusicPicking] = useState(false);
  const soundRef = useRef<Sound | null>(null);

  const stopSound = useCallback(() => {
    if (soundRef.current) {
      soundRef.current.stop(() => { soundRef.current?.release(); soundRef.current = null; });
    }
  }, []);

  const playMusicPreview = useCallback((mUri: string) => {
    stopSound();
    Sound.setCategory('Playback');
    const s = new Sound(mUri, '', err => {
      if (!err) { soundRef.current = s; s.play(); }
    });
  }, [stopSound]);

  const handlePickMusic = useCallback(async () => {
    setMusicPicking(true);
    try {
      const [file] = await pick({ type: [types.audio], allowMultiSelection: false });
      const name = file.name ?? file.uri.split('/').pop() ?? 'Son';
      setMusicUri(file.uri);
      setMusicName(name);
      playMusicPreview(file.uri);
    } catch (e) {
      if (isErrorWithCode(e, errorCodes.OPERATION_CANCELED)) return;
      Alert.alert('Erreur', "Impossible d'accéder à la bibliothèque audio.");
    } finally {
      setMusicPicking(false);
    }
  }, [playMusicPreview]);

  const handleRemoveMusic = useCallback(() => {
    stopSound();
    setMusicUri(undefined);
    setMusicName(undefined);
  }, [stopSound]);

  useEffect(() => () => { stopSound(); }, [stopSound]);

  // ── Texte ─────────────────────────────────────────────────────────────────
  const [draft,       setDraft]       = useState('');
  const [txtColor,    setTxtColor]    = useState('#FFFFFF');
  const [txtSize,     setTxtSize]     = useState(26);
  const [txtBold,     setTxtBold]     = useState(true);
  const [txtBg,       setTxtBg]       = useState(false);
  const [txtAlign,    setTxtAlign]    = useState<'left' | 'center' | 'right'>('center');
  const [editLayerId, setEditLayerId] = useState<string | null>(null);
  // Overlay texte plein écran (masque la vidéo pour le clavier)
  const [textOverlay, setTextOverlay] = useState(false);

  // ── Animation panneau bas ─────────────────────────────────────────────────
  const panelH   = useSharedValue(0);
  const PANEL_H  = 240;

  useEffect(() => {
    panelH.value = withSpring(tool && tool !== 'text' ? PANEL_H : 0, { damping: 18, stiffness: 200 });
  }, [tool]);

  const panelStyle = useAnimatedStyle(() => ({
    height: panelH.value,
    overflow: 'hidden',
  }));

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

  useEffect(() => {
    try { player.rate = speed; } catch {}
  }, [speed, player]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      try { player.currentTime = startRef.current * durationSec; } catch {}
      player.play();
      setIsPlaying(true);
    }
  }, [isPlaying, player, durationSec]);

  const pauseAndSeekStart = useCallback(() => {
    player.pause();
    setIsPlaying(false);
    setTimeout(() => {
      try { player.currentTime = startRef.current * durationSec; } catch {}
    }, 80);
  }, [player, durationSec]);

  // ── Trim PanResponders ────────────────────────────────────────────────────
  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { player.pause(); setIsPlaying(false); },
      onPanResponderMove: (_, g) => {
        const r = Math.max(0, Math.min(
          startRef.current + g.dx / TRIM_W,
          endRef.current - 1 / Math.max(durationSec, 1),
        ));
        const minEnd = Math.min(r + MAX_TRIM / durationSec, 1);
        if (endRef.current > minEnd) { endRef.current = minEnd; setEndRatio(minEnd); }
        startRef.current = r;
        setStartRatio(r);
      },
      onPanResponderRelease: () => pauseAndSeekStart(),
    }),
  ).current;

  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { player.pause(); setIsPlaying(false); },
      onPanResponderMove: (_, g) => {
        const maxR = Math.min(startRef.current + MAX_TRIM / durationSec, 1);
        const r = Math.min(maxR, Math.max(
          endRef.current + g.dx / TRIM_W,
          startRef.current + 1 / Math.max(durationSec, 1),
        ));
        endRef.current = r;
        setEndRatio(r);
      },
      onPanResponderRelease: () => { player.pause(); setIsPlaying(false); },
    }),
  ).current;

  // ── Texte — layers draggables ─────────────────────────────────────────────
  const layerPans = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});

  const getLayerPan = useCallback((id: string, initialX: number, initialY: number) => {
    if (!layerPans.current[id]) {
      const startPos = { x: initialX, y: initialY };
      layerPans.current[id] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          setLayers(prev => {
            const l = prev.find(x => x.id === id);
            if (l) { startPos.x = l.x; startPos.y = l.y; }
            return prev;
          });
        },
        onPanResponderMove: (_, g) => {
          setLayers(prev => prev.map(l =>
            l.id === id ? { ...l, x: startPos.x + g.dx, y: startPos.y + g.dy } : l,
          ));
        },
      });
    }
    return layerPans.current[id];
  }, []);

  const openTextOverlay = useCallback((layer?: TextLayer) => {
    if (layer) {
      setDraft(layer.text);
      setTxtColor(layer.color);
      setTxtSize(layer.fontSize);
      setTxtBold(layer.bold);
      setTxtBg(layer.bg);
      setTxtAlign(layer.align ?? 'center');
      setEditLayerId(layer.id);
    } else {
      setDraft('');
      setEditLayerId(null);
    }
    setTextOverlay(true);
  }, []);

  const commitText = useCallback(() => {
    Keyboard.dismiss();
    const t = draft.trim();
    if (!t) { setTextOverlay(false); setTool(null); return; }

    if (editLayerId) {
      setLayers(prev => prev.map(l =>
        l.id === editLayerId
          ? { ...l, text: t, color: txtColor, fontSize: txtSize, bold: txtBold, bg: txtBg, align: txtAlign }
          : l,
      ));
      setEditLayerId(null);
    } else {
      setLayers(prev => [...prev, {
        id:       `txt_${Date.now()}`,
        text:     t,
        x:        W / 2 - 80,
        y:        H * 0.38,
        color:    txtColor,
        fontSize: txtSize,
        bold:     txtBold,
        bg:       txtBg,
        align:    txtAlign,
      }]);
    }
    setDraft('');
    setTextOverlay(false);
    setTool(null);
  }, [draft, editLayerId, txtColor, txtSize, txtBold, txtBg, txtAlign]);

  const cancelText = useCallback(() => {
    Keyboard.dismiss();
    setDraft('');
    setEditLayerId(null);
    setTextOverlay(false);
    setTool(null);
  }, []);

  const deleteLayer = useCallback((id: string) => {
    Alert.alert('Supprimer ce texte ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => setLayers(p => p.filter(l => l.id !== id)) },
    ]);
  }, []);

  // ── Confirmer ─────────────────────────────────────────────────────────────
  const startSec  = startRef.current * durationSec;
  const endSec    = endRef.current   * durationSec;
  const trimSec   = endSec - startSec;
  const trimValid = trimSec >= 1 && trimSec <= MAX_TRIM;

  const handleConfirm = useCallback(() => {
    if (!trimValid) {
      Alert.alert(
        'Segment invalide',
        trimSec < 1 ? 'Le segment doit durer au moins 1 seconde.' : 'Maximum 90 secondes.',
      );
      return;
    }
    player.pause();
    stopSound();
    onConfirm({
      uri,
      startSec: startRef.current * durationSec,
      endSec:   endRef.current   * durationSec,
      speed, filter, layers, musicUri, musicName,
    });
  }, [trimValid, trimSec, player, onConfirm, uri, durationSec, speed, filter, layers, musicUri, musicName, stopSound]);

  // ── Dérivés ────────────────────────────────────────────────────────────────
  const activeFilt = useMemo(() => FILTERS.find(f => f.key === filter) ?? FILTERS[0], [filter]);
  const videoFiltOpacity = FILTER_VIDEO_OPACITY[filter];
  const selLeft    = startRatio * TRIM_W;
  const selWidth   = (endRatio - startRatio) * TRIM_W;
  const cursorX    = Math.min(playRatio * TRIM_W, TRIM_W - 2);

  const toggleTool = useCallback((k: ToolKey) => {
    if (k === 'text') {
      if (textOverlay) { cancelText(); return; }
      setTool('text');
      openTextOverlay();
      return;
    }
    Keyboard.dismiss();
    setTool(prev => prev === k ? null : k);
  }, [openTextOverlay, textOverlay, cancelText]);

  const cycleAlign = useCallback(() => {
    setTxtAlign(a => a === 'left' ? 'center' : a === 'center' ? 'right' : 'left');
  }, []);

  const alignIcon = txtAlign === 'left' ? 'align-left' : txtAlign === 'right' ? 'align-right' : 'align-center';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* ══ VIDÉO PLEIN ÉCRAN ══ */}
      <View style={[StyleSheet.absoluteFill, s.videoContainer]}>
        <VideoView
          player={player}
          style={s.videoView}
          resizeMode="cover"
          controls={false}
        />

        {/* Overlay filtre sur la vidéo */}
        {videoFiltOpacity > 0 && (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: activeFilt.overlay, opacity: videoFiltOpacity }]}
          />
        )}

        {/* Gradients */}
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.75)', 'transparent']} style={s.gradTop} />
        <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.85)']} style={s.gradBottom} />

        {/* Tap play/pause — ne capte pas si textOverlay est ouvert */}
        {!textOverlay && (
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={togglePlay} activeOpacity={1} />
        )}

        {/* Text layers draggables */}
        {layers.map(l => {
          const pan = getLayerPan(l.id, l.x, l.y);
          return (
            <View
              key={l.id}
              style={[s.textLayer, { left: l.x, top: l.y }]}
              {...pan.panHandlers}
            >
              <TouchableOpacity
                onPress={() => openTextOverlay(l)}
                onLongPress={() => deleteLayer(l.id)}
                activeOpacity={0.85}
              >
                <Text style={[
                  s.textLayerTxt,
                  {
                    color:             l.color,
                    fontSize:          l.fontSize,
                    fontWeight:        l.bold ? '800' : '400',
                    textAlign:         l.align ?? 'center',
                    backgroundColor:   l.bg ? 'rgba(0,0,0,0.6)' : 'transparent',
                    paddingHorizontal: l.bg ? 10 : 0,
                    paddingVertical:   l.bg ? 4 : 0,
                    borderRadius:      l.bg ? 6 : 0,
                  },
                ]}>
                  {l.text}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Bouton play/pause centré */}
      {!isPlaying && !textOverlay && (
        <View
          pointerEvents="none"
          style={[s.playHint, {
            top:    insets.top + 110,
            bottom: (tool && tool !== 'text' ? PANEL_H : 0) + insets.bottom + 60,
          }]}
        >
          <View style={s.playCircle}>
            <Icon name="play" size={32} color="#fff" />
          </View>
        </View>
      )}

      {/* ══ HEADER ══ */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => { player.pause(); onCancel(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Badges état actif */}
        <View style={s.headerBadges}>
          {filter !== 'original' && (
            <View style={s.badge}>
              <Icon name="sliders" size={10} color="#fff" />
              <Text style={s.badgeTxt}>{FILTERS.find(f => f.key === filter)?.label}</Text>
            </View>
          )}
          {speed !== 1 && (
            <View style={[s.badge, { backgroundColor: 'rgba(234,179,8,0.85)' }]}>
              <Icon name="zap" size={10} color="#fff" />
              <Text style={s.badgeTxt}>{speed}×</Text>
            </View>
          )}
          {layers.length > 0 && (
            <View style={[s.badge, { backgroundColor: 'rgba(96,165,250,0.85)' }]}>
              <Icon name="type" size={10} color="#fff" />
              <Text style={s.badgeTxt}>{layers.length} texte{layers.length > 1 ? 's' : ''}</Text>
            </View>
          )}
          {musicUri && (
            <View style={[s.badge, { backgroundColor: 'rgba(167,139,250,0.85)' }]}>
              <Icon name="music" size={10} color="#fff" />
              <Text style={s.badgeTxt} numberOfLines={1}>{musicName?.split('.')[0]}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[s.nextBtn, !trimValid && { opacity: 0.45 }]}
          onPress={handleConfirm}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#7B3FF2', '#C026D3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.nextBtnGrad}>
            <Text style={s.nextBtnTxt}>Suivant</Text>
            <Icon name="arrow-right" size={14} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ══ BARRE D'OUTILS ══ */}
      <View style={[s.toolbarWrap, { top: insets.top + 64 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolbarRow}>
          {TOOLS.map(t => {
            const active = tool === t.key;
            const hasMark = (
              (t.key === 'filter' && filter !== 'original') ||
              (t.key === 'speed'  && speed !== 1) ||
              (t.key === 'text'   && layers.length > 0) ||
              (t.key === 'music'  && !!musicUri)
            );
            return (
              <TouchableOpacity
                key={t.key}
                style={s.toolBtn}
                onPress={() => toggleTool(t.key)}
                activeOpacity={0.75}
              >
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

      {/* ══ INFO DURÉE ══ */}
      <View
        style={[s.trimInfo, { bottom: (tool && tool !== 'text' ? PANEL_H + 12 : 16) + insets.bottom }]}
        pointerEvents="none"
      >
        <View style={[s.trimInfoBadge, !trimValid && { borderColor: '#EF4444' }]}>
          <Icon name="scissors" size={11} color={trimValid ? 'rgba(255,255,255,0.8)' : '#EF4444'} />
          <Text style={[s.trimInfoTxt, !trimValid && { color: '#EF4444' }]}>
            {fmt(trimSec)}{!trimValid && (trimSec < 1 ? ' · min 1s' : ' · max 90s')}
          </Text>
        </View>
      </View>

      {/* ══ PANNEAU BAS ANIMÉ (trim / filtre / vitesse / musique) ══ */}
      <Animated.View style={[s.panel, { paddingBottom: insets.bottom + 4 }, panelStyle]}>

        {/* ── ROGNER ── */}
        {tool === 'trim' && (
          <View style={s.trimPanel}>
            <View style={s.trimHeader}>
              <Text style={s.panelTitle}>Rogner</Text>
              <Text style={[s.trimDurTxt, !trimValid && { color: '#EF4444' }]}>
                {fmt(startRatio * durationSec)} → {fmt(endRatio * durationSec)}
                {'  '}<Text style={{ fontWeight: '800' }}>{fmt(trimSec)}</Text>
              </Text>
            </View>
            <View style={s.frameBar}>
              {Array.from({ length: 28 }).map((_, i) => (
                <View key={i} style={[s.frameCell, { opacity: 0.35 + (i % 3) * 0.15 }]} />
              ))}
              <View style={[s.dimL, { width: selLeft }]} />
              <View style={[s.dimR, { left: selLeft + selWidth }]} />
              <View style={[s.selBox, { left: selLeft, width: selWidth }, !trimValid && { borderColor: '#EF4444' }]} />
              {isPlaying && <View style={[s.cursor, { left: Math.max(0, cursorX) }]} />}
              <View style={[s.handle, s.handleL, { left: selLeft }]} {...leftPan.panHandlers}>
                <View style={s.handlePip} />
              </View>
              <View style={[s.handle, s.handleR, { left: selLeft + selWidth - HANDLE_W }]} {...rightPan.panHandlers}>
                <View style={s.handlePip} />
              </View>
            </View>
            <Text style={s.panelHint}>Glisse les poignées pour choisir ton segment (max 90s)</Text>
          </View>
        )}

        {/* ── FILTRES ── */}
        {tool === 'filter' && (
          <View style={s.filterPanel}>
            <Text style={s.panelTitle}>Filtre</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterList}>
              {FILTERS.map(f => (
                <FilterThumb
                  key={f.key}
                  f={f}
                  active={filter === f.key}
                  thumbnailUri={thumbnailUri}
                  onPress={() => setFilter(f.key)}
                />
              ))}
            </ScrollView>
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
                  <TouchableOpacity
                    key={sp.v}
                    style={[s.speedChip, active && s.speedChipActive]}
                    onPress={() => setSpeed(sp.v)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.speedTxt, active && s.speedTxtActive]}>{sp.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={s.panelHint}>
              {speed < 1 ? `Ralenti — ${speed}× la vitesse normale` : speed > 1 ? `Accéléré — ${speed}× la vitesse normale` : 'Vitesse normale (1×)'}
            </Text>
          </View>
        )}

        {/* ── MUSIQUE ── */}
        {tool === 'music' && (
          <View style={s.musicPanel}>
            <Text style={s.panelTitle}>Musique</Text>

            {musicUri ? (
              <View style={s.musicSelected}>
                <View style={s.musicIconWrap}>
                  <Icon name="music" size={20} color="#A78BFA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.musicTitle} numberOfLines={1}>{musicName}</Text>
                  <Text style={s.musicSub}>Son sélectionné</Text>
                </View>
                <TouchableOpacity onPress={() => playMusicPreview(musicUri!)} style={s.musicPlayBtn}>
                  <Icon name="play" size={16} color="#A78BFA" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRemoveMusic} style={s.musicRemoveBtn}>
                  <Icon name="x" size={16} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.musicPickBtn, musicPicking && { opacity: 0.6 }]}
              onPress={handlePickMusic}
              disabled={musicPicking}
              activeOpacity={0.8}
            >
              {musicPicking
                ? <ActivityIndicator size="small" color="#A78BFA" />
                : <Icon name="folder" size={18} color="#A78BFA" />
              }
              <Text style={s.musicPickTxt}>
                {musicUri ? 'Changer le son' : 'Choisir depuis ma bibliothèque'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </Animated.View>

      {/* ══ OVERLAY TEXTE — plein écran, au-dessus de tout ══ */}
      {textOverlay && (
        <View style={[StyleSheet.absoluteFill, s.textOverlay]}>
          {/* Fond semi-transparent pour le clavier */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={cancelText} />

          <View style={[s.textSheet, { paddingBottom: insets.bottom + 12 }]}>
            {/* Barre titre */}
            <View style={s.textSheetHeader}>
              <TouchableOpacity onPress={cancelText} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.textSheetCancel}>Annuler</Text>
              </TouchableOpacity>
              <Text style={s.textSheetTitle}>{editLayerId ? 'Modifier' : 'Ajouter du texte'}</Text>
              <TouchableOpacity
                onPress={commitText}
                disabled={!draft.trim()}
                style={[s.textSheetDone, !draft.trim() && { opacity: 0.4 }]}
              >
                <Text style={s.textSheetDoneTxt}>OK</Text>
              </TouchableOpacity>
            </View>

            {/* Preview du texte dans la vidéo */}
            <View style={s.textPreviewWrap} pointerEvents="none">
              <Text style={[
                s.textPreview,
                {
                  color:           txtColor,
                  fontSize:        txtSize,
                  fontWeight:      txtBold ? '800' : '400',
                  textAlign:       txtAlign,
                  backgroundColor: txtBg ? 'rgba(0,0,0,0.65)' : 'transparent',
                  paddingHorizontal: txtBg ? 12 : 0,
                  paddingVertical:   txtBg ? 6 : 0,
                  borderRadius:      txtBg ? 8 : 0,
                },
              ]}>
                {draft || 'Ton texte ici…'}
              </Text>
            </View>

            {/* Input */}
            <View style={s.textInputWrap}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Écris ton texte…"
                placeholderTextColor="rgba(255,255,255,0.25)"
                style={[
                  s.textInput,
                  { color: txtColor, fontWeight: txtBold ? '800' : '400', textAlign: txtAlign },
                ]}
                maxLength={80}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitText}
                multiline={false}
              />
              {draft.trim().length > 0 && (
                <TouchableOpacity style={s.textClearBtn} onPress={() => setDraft('')}>
                  <Icon name="x-circle" size={16} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Contrôles style */}
            <View style={s.textControls}>
              <TouchableOpacity style={[s.styleBtn, txtBold && s.styleBtnActive]} onPress={() => setTxtBold(v => !v)}>
                <Text style={[s.styleBtnTxt, { fontWeight: '800', color: txtBold ? '#A78BFA' : '#fff' }]}>B</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.styleBtn, txtBg && s.styleBtnActive]} onPress={() => setTxtBg(v => !v)}>
                <Icon name="square" size={14} color={txtBg ? '#A78BFA' : 'rgba(255,255,255,0.6)'} />
              </TouchableOpacity>
              <TouchableOpacity style={s.styleBtn} onPress={cycleAlign}>
                <Icon name={alignIcon} size={14} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
              <View style={s.sizeStepper}>
                <TouchableOpacity style={s.stepBtn} onPress={() => setTxtSize(v => Math.max(14, v - 2))}>
                  <Icon name="minus" size={12} color="#fff" />
                </TouchableOpacity>
                <Text style={s.sizeVal}>{txtSize}</Text>
                <TouchableOpacity style={s.stepBtn} onPress={() => setTxtSize(v => Math.min(56, v + 2))}>
                  <Icon name="plus" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Palette couleurs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.palette}>
              {PALETTE.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setTxtColor(c)}
                  style={[
                    s.colorDot,
                    { backgroundColor: c },
                    txtColor === c && s.colorDotActive,
                    c === '#000000' && { borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1.5 },
                  ]}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      )}

    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  videoContainer: { alignItems: 'center', justifyContent: 'center' },
  videoView: { width: W, height: H },

  gradTop:    { position: 'absolute', top: 0,    left: 0, right: 0, height: 160, zIndex: 2 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, zIndex: 2 },

  playHint:   { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  playCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },

  textLayer:    { position: 'absolute', zIndex: 8 },
  textLayerTxt: { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  // Header
  header:       { position: 'absolute', left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  headerBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  headerBadges: { flex: 1, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(123,63,242,0.8)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  badgeTxt:     { color: '#fff', fontSize: 11, fontWeight: '700' },
  nextBtn:      { borderRadius: 24, overflow: 'hidden' },
  nextBtnGrad:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10 },
  nextBtnTxt:   { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Toolbar
  toolbarWrap:       { position: 'absolute', left: 0, right: 0, zIndex: 15 },
  toolbarRow:        { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingVertical: 6 },
  toolBtn:           { alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  toolIconWrap:      { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' },
  toolIconWrapActive:{ backgroundColor: 'rgba(123,63,242,0.35)', borderColor: '#A78BFA' },
  toolLabel:         { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' },
  toolDot:           { position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#A78BFA', borderWidth: 1.5, borderColor: '#000' },

  // Info durée
  trimInfo:      { position: 'absolute', left: 16, zIndex: 10 },
  trimInfoBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  trimInfoTxt:   { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Panel bas
  panel:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10,8,20,0.97)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', zIndex: 30 },
  panelTitle: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  panelHint:  { color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 6 },

  // Trim
  trimPanel:  { paddingHorizontal: 24, paddingTop: 16, gap: 10 },
  trimHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  trimDurTxt: { color: '#A78BFA', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  frameBar:   { height: 56, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', position: 'relative', backgroundColor: '#1A1830' },
  frameCell:  { flex: 1, height: 56, backgroundColor: '#2A2848', borderRightWidth: 0.5, borderRightColor: '#0A0814' },
  dimL:       { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1 },
  dimR:       { position: 'absolute', top: 0, bottom: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1 },
  selBox:     { position: 'absolute', top: 0, bottom: 0, borderWidth: 2.5, borderColor: '#FFD60A', borderRadius: 6, zIndex: 2 },
  cursor:     { position: 'absolute', top: 0, bottom: 0, width: 2.5, backgroundColor: '#fff', zIndex: 5 },
  handle:     { position: 'absolute', top: 0, bottom: 0, width: HANDLE_W, zIndex: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD60A' },
  handleL:    { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  handleR:    { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  handlePip:  { width: 3, height: 20, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.4)' },

  // Filtres
  filterPanel:       { paddingLeft: 20, paddingTop: 16 },
  filterList:        { gap: 10, paddingRight: 20, alignItems: 'center' },
  filterItem:        { alignItems: 'center', gap: 6 },
  filterThumb:       { width: 68, height: 68, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'transparent' },
  filterThumbActive: { borderColor: '#A78BFA' },
  filterCheck:       { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#A78BFA', alignItems: 'center', justifyContent: 'center' },
  filterLbl:         { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '600' },

  // Vitesse
  speedPanel:     { paddingHorizontal: 24, paddingTop: 16, gap: 14 },
  speedGrid:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  speedChip:      { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  speedChipActive:{ backgroundColor: 'rgba(167,139,250,0.2)', borderColor: '#A78BFA' },
  speedTxt:       { color: 'rgba(255,255,255,0.5)', fontWeight: '700', fontSize: 14 },
  speedTxtActive: { color: '#A78BFA' },

  // Musique
  musicPanel:     { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  musicIconWrap:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  musicTitle:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  musicSub:       { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  musicSelected:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(167,139,250,0.12)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  musicPlayBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  musicRemoveBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  musicPickBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(167,139,250,0.15)', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  musicPickTxt:   { color: '#A78BFA', fontWeight: '700', fontSize: 14 },

  // Overlay texte plein écran
  textOverlay: { zIndex: 50, justifyContent: 'flex-end' },
  textSheet:   {
    backgroundColor: 'rgba(12,10,22,0.97)',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 8, gap: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  textSheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  textSheetCancel:  { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' },
  textSheetTitle:   { color: '#fff', fontSize: 15, fontWeight: '800' },
  textSheetDone:    { backgroundColor: '#7B3FF2', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 18 },
  textSheetDoneTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  textPreviewWrap:  { alignItems: 'center', paddingVertical: 8, minHeight: 60, justifyContent: 'center' },
  textPreview:      { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  textInputWrap:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  textInput:        { flex: 1, fontSize: 16, minHeight: 44, color: '#fff' },
  textClearBtn:     { padding: 4 },
  textControls:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  styleBtn:         { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  styleBtnActive:   { borderColor: '#A78BFA', backgroundColor: 'rgba(167,139,250,0.18)' },
  styleBtnTxt:      { fontSize: 16 },
  sizeStepper:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4, marginLeft: 'auto' },
  stepBtn:          { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  sizeVal:          { color: '#fff', fontWeight: '700', fontSize: 13, minWidth: 26, textAlign: 'center' },
  palette:          { gap: 8, paddingVertical: 2 },
  colorDot:         { width: 30, height: 30, borderRadius: 15 },
  colorDotActive:   { transform: [{ scale: 1.35 }], shadowColor: '#fff', shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
});
