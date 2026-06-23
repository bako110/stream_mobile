import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions, StatusBar, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';

const { width: W } = Dimensions.get('window');

const MAX_SEC    = 90;
const BAR_H      = 64;
const HANDLE_W   = 22;
const PAD        = 16;
const BAR_W      = W - PAD * 2;
const HIT_SLOP   = { top: 20, bottom: 20, left: 12, right: 12 };

interface Props {
  uri:       string;
  duration:  number;
  onConfirm: (uri: string, startSec: number, endSec: number) => void;
  onCancel:  () => void;
}

const fmt = (s: number) => {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export const VideoTrimmer: React.FC<Props> = ({ uri, duration, onConfirm, onCancel }) => {
  const safeDur    = Math.max(duration, 0.001);
  const initEnd    = Math.min(safeDur, MAX_SEC) / safeDur;

  // Shared values sur UI thread — pas de setState pour les positions
  const startRatio = useSharedValue(0);
  const endRatio   = useSharedValue(initEnd);
  const playRatio  = useSharedValue(0);

  // Bases au moment du grant (pour calcul correct g.translationX)
  const leftBase   = useSharedValue(0);
  const rightBase  = useSharedValue(initEnd);

  // Etat React seulement pour ce qui s'affiche dans du texte
  const [startSec,  setStartSec]  = useState(0);
  const [endSec,    setEndSec]    = useState(Math.min(safeDur, MAX_SEC));
  const [isPlaying, setIsPlaying] = useState(false);

  const isPlayingRef = useRef(false);
  const seekTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = false;
  });

  // Passe la lecture si on depasse la borne droite
  useEffect(() => {
    const sub = player.addEventListener('onProgress', ({ currentTime: t }: { currentTime: number }) => {
      playRatio.value = safeDur > 0 ? t / safeDur : 0;
      if (isPlayingRef.current && t >= endRatio.value * safeDur) {
        player.currentTime = startRatio.value * safeDur;
      }
    });
    return () => sub.remove();
  }, [player, safeDur]);

  // Stoppe l'auto-play initial
  useEffect(() => {
    const sub = player.addEventListener('onStatusChange', (status: string) => {
      if (status === 'readyToPlay') { player.pause(); player.currentTime = 0; }
    });
    return () => sub.remove();
  }, [player]);

  const doPlay = useCallback(() => {
    player.currentTime = startRatio.value * safeDur;
    player.play();
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, [player, safeDur]);

  const doPause = useCallback(() => {
    player.pause();
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, [player]);

  const seekAfterDrag = useCallback((ratio: number) => {
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      try { player.currentTime = ratio * safeDur; } catch {}
    }, 60);
  }, [player, safeDur]);

  // Sync les valeurs JS (pour le texte) depuis le UI thread
  const syncStart = useCallback((r: number) => {
    setStartSec(r * safeDur);
  }, [safeDur]);
  const syncEnd = useCallback((r: number) => {
    setEndSec(r * safeDur);
  }, [safeDur]);

  // ── Gesture poignée gauche ────────────────────────────────────────────────
  const leftGesture = Gesture.Pan()
    .hitSlop(HIT_SLOP)
    .onBegin(() => {
      leftBase.value = startRatio.value;
    })
    .onUpdate(e => {
      const next = Math.max(0, Math.min(
        leftBase.value + e.translationX / BAR_W,
        endRatio.value - 1 / safeDur,
      ));
      const maxEnd = Math.min(next + MAX_SEC / safeDur, 1);
      if (endRatio.value > maxEnd) { endRatio.value = maxEnd; runOnJS(syncEnd)(maxEnd); }
      startRatio.value = next;
      runOnJS(syncStart)(next);
    })
    .onEnd(() => {
      runOnJS(doPause)();
      runOnJS(seekAfterDrag)(startRatio.value);
    });

  // ── Gesture poignée droite ────────────────────────────────────────────────
  const rightGesture = Gesture.Pan()
    .hitSlop(HIT_SLOP)
    .onBegin(() => {
      rightBase.value = endRatio.value;
    })
    .onUpdate(e => {
      const maxEnd = Math.min(startRatio.value + MAX_SEC / safeDur, 1);
      const next   = Math.min(maxEnd, Math.max(
        rightBase.value + e.translationX / BAR_W,
        startRatio.value + 1 / safeDur,
      ));
      endRatio.value = next;
      runOnJS(syncEnd)(next);
    })
    .onEnd(() => {
      runOnJS(doPause)();
    });

  // ── Styles animés ─────────────────────────────────────────────────────────
  const leftHandleStyle = useAnimatedStyle(() => ({
    left: startRatio.value * BAR_W,
  }));
  const rightHandleStyle = useAnimatedStyle(() => ({
    left: startRatio.value * BAR_W + (endRatio.value - startRatio.value) * BAR_W - HANDLE_W,
  }));
  const dimLeftStyle = useAnimatedStyle(() => ({
    width: startRatio.value * BAR_W,
  }));
  const dimRightStyle = useAnimatedStyle(() => ({
    left: startRatio.value * BAR_W + (endRatio.value - startRatio.value) * BAR_W,
  }));
  const selBorderStyle = useAnimatedStyle(() => ({
    left:  startRatio.value * BAR_W,
    width: (endRatio.value - startRatio.value) * BAR_W,
    borderColor: (endRatio.value - startRatio.value) * safeDur > MAX_SEC ? '#EF4444' : '#FFD60A',
  }));
  const cursorStyle = useAnimatedStyle(() => ({
    left: playRatio.value * BAR_W - 1,
  }));

  const trimSec  = endSec - startSec;
  const tooLong  = trimSec > MAX_SEC;
  const tooShort = trimSec < 1;
  const invalid  = tooLong || tooShort;

  const handleConfirm = () => {
    doPause();
    onConfirm(uri, startSec, endSec);
  };

  return (
    <GestureHandlerRootView style={s.root}>
      <StatusBar hidden />

      {/* ── Video ── */}
      <View style={s.videoWrap}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          controls={false}
        />

        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent']}
          style={s.gradTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={s.gradBottom}
          pointerEvents="none"
        />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onCancel} style={s.backBtn} hitSlop={HIT_SLOP}>
            <Icon name="x" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={s.titleRow}>
            <Icon name="scissors" size={13} color="#FFD60A" />
            <Text style={s.title}>Choisir un segment</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Bouton play central */}
        <TouchableOpacity
          style={s.playBtn}
          onPress={() => isPlaying ? doPause() : doPlay()}
          activeOpacity={0.75}
        >
          <Animated.View style={s.playBtnInner}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={28} color="#fff" />
          </Animated.View>
        </TouchableOpacity>

        {/* Timestamps du segment */}
        <View style={s.timesRow}>
          <View style={s.timePill}>
            <Text style={s.timeLabel}>DEBUT</Text>
            <Text style={s.timeVal}>{fmt(startSec)}</Text>
          </View>

          <View style={[s.durationPill, tooLong && s.durationPillErr]}>
            <Text style={[s.durationVal, tooLong && { color: '#EF4444' }]}>
              {fmt(trimSec)}
            </Text>
            <Text style={s.durationMax}> max 1:30</Text>
          </View>

          <View style={s.timePill}>
            <Text style={s.timeLabel}>FIN</Text>
            <Text style={s.timeVal}>{fmt(endSec)}</Text>
          </View>
        </View>
      </View>

      {/* ── Barre de trim ── */}
      <View style={s.trimArea}>
        <View style={s.frameBar}>
          {/* Blocs de fond (frames simulees) */}
          {Array.from({ length: 20 }).map((_, i) => (
            <View
              key={i}
              style={[
                s.frameBlock,
                { opacity: 0.45 + (i % 4) * 0.12 },
              ]}
            />
          ))}

          {/* Zones assombries hors selection */}
          <Animated.View style={[s.dimOverlay, { left: 0 }, dimLeftStyle]} />
          <Animated.View style={[s.dimOverlay, { right: 0 }, dimRightStyle]} />

          {/* Bordure de selection */}
          <Animated.View style={[s.selBorder, selBorderStyle]} />

          {/* Curseur de lecture */}
          {isPlaying && <Animated.View style={[s.cursor, cursorStyle]} />}

          {/* Poignee gauche */}
          <GestureDetector gesture={leftGesture}>
            <Animated.View style={[s.handle, s.handleLeft, leftHandleStyle]}>
              <View style={s.handleLines}>
                <View style={s.handleLine} />
                <View style={s.handleLine} />
                <View style={s.handleLine} />
              </View>
            </Animated.View>
          </GestureDetector>

          {/* Poignee droite */}
          <GestureDetector gesture={rightGesture}>
            <Animated.View style={[s.handle, s.handleRight, rightHandleStyle]}>
              <View style={s.handleLines}>
                <View style={s.handleLine} />
                <View style={s.handleLine} />
                <View style={s.handleLine} />
              </View>
            </Animated.View>
          </GestureDetector>
        </View>

        {/* Hint */}
        <Text style={s.hint}>
          {invalid
            ? (tooShort ? 'Segment trop court (min 1s)' : 'Trop long — maximum 1m 30s')
            : 'Glisse les poignees pour choisir ton segment'}
        </Text>

        {/* Bouton confirmer */}
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={invalid}
          activeOpacity={0.85}
          style={[s.confirmBtn, invalid && s.confirmBtnDisabled]}
        >
          <LinearGradient
            colors={invalid ? ['#333', '#333'] : ['#7B3FF2', '#C026D3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.confirmInner}
          >
            <Icon name="check" size={18} color="#fff" />
            <Text style={s.confirmText}>Utiliser ce segment</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </GestureHandlerRootView>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  videoWrap:  { flex: 1 },
  gradTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 140 },

  header: {
    position: 'absolute', top: 48,
    left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: PAD,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22,
  },
  title: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  playBtn: {
    position: 'absolute',
    top: '50%', left: '50%',
    marginTop: -30, marginLeft: -30,
  },
  playBtnInner: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },

  timesRow: {
    position: 'absolute', bottom: 16,
    left: PAD, right: PAD,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  timePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12,
    gap: 2,
  },
  timeLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  timeVal:   { color: '#fff', fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  durationPill: {
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: 'rgba(123,63,242,0.75)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
  },
  durationPillErr: { backgroundColor: 'rgba(239,68,68,0.75)' },
  durationVal: { color: '#fff', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  durationMax: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },

  trimArea: {
    backgroundColor: '#0C0C0C',
    paddingHorizontal: PAD,
    paddingTop: 20, paddingBottom: 32,
    gap: 14,
  },

  frameBar: {
    height: BAR_H, borderRadius: 8, overflow: 'hidden',
    flexDirection: 'row', position: 'relative',
    backgroundColor: '#181818',
  },
  frameBlock: {
    flex: 1, height: BAR_H,
    backgroundColor: '#2C2C3E',
    borderRightWidth: 1, borderRightColor: '#0C0C0C',
  },
  dimOverlay: {
    position: 'absolute', top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1,
  },
  selBorder: {
    position: 'absolute', top: 0, bottom: 0,
    borderWidth: 3, borderRadius: 5, zIndex: 2,
  },
  cursor: {
    position: 'absolute', top: 4, bottom: 4,
    width: 2.5, backgroundColor: '#fff',
    borderRadius: 2, zIndex: 5,
    shadowColor: '#fff', shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },

  handle: {
    position: 'absolute', top: 0, bottom: 0,
    width: HANDLE_W, zIndex: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFD60A',
  },
  handleLeft:  { borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  handleRight: { borderTopRightRadius: 5, borderBottomRightRadius: 5 },
  handleLines: { gap: 3 },
  handleLine:  { width: 2.5, height: 12, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.45)' },

  hint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12, textAlign: 'center', letterSpacing: 0.2,
  },

  confirmBtn:         { borderRadius: 32, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 17,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
