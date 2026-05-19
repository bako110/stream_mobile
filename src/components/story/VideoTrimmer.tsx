/**
 * VideoTrimmer — style WhatsApp
 * Barre de "frames" avec deux poignées gauche/droite glissables.
 * La vidéo joue en boucle le segment sélectionné.
 * onConfirm passe (uri, startSec, endSec) au parent — découpe côté backend.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  PanResponder, Dimensions, Platform,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';

const { width: W } = Dimensions.get('window');
const MAX_DURATION  = 90;           // 1m30s
const BAR_H         = 56;           // hauteur de la barre frames
const HANDLE_W      = 20;           // largeur de chaque poignée
const BAR_PADDING   = 20;           // padding horizontal écran
const BAR_W         = W - BAR_PADDING * 2; // largeur utile de la barre

interface Props {
  uri:       string;
  duration:  number;
  onConfirm: (uri: string, startSec: number, endSec: number) => void;
  onCancel:  () => void;
}

export const VideoTrimmer: React.FC<Props> = ({ uri, duration, onConfirm, onCancel }) => {
  const clampedEnd = Math.min(duration, MAX_DURATION);

  // startRatio / endRatio : position 0→1 dans toute la vidéo
  const [startRatio, setStartRatio] = useState(0);
  const [endRatio,   setEndRatio]   = useState(clampedEnd / duration);
  const [isReady,    setIsReady]    = useState(false);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [playRatio,  setPlayRatio]  = useState(0); // position du curseur 0→1

  // refs pour les pan responders (valeurs instantanées sans re-render)
  const startRef   = useRef(0);
  const endRef     = useRef(clampedEnd / duration);
  const dragging   = useRef<'start' | 'end' | null>(null);
  const seekTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = false;
  });

  // ── Prêt ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = player.addEventListener('onStatusChange', (status: string) => {
      if (status === 'readyToPlay') {
        setIsReady(true);
        player.pause();
        player.currentTime = 0;
      }
    });
    return () => sub.remove();
  }, [player]);

  // ── Progression de lecture ────────────────────────────────────────────────
  useEffect(() => {
    const sub = player.addEventListener('onProgress', ({ currentTime: t }: { currentTime: number }) => {
      const ratio = duration > 0 ? t / duration : 0;
      setPlayRatio(ratio);
      // Fin du segment → reboucle
      if (isPlaying && t >= endRef.current * duration) {
        player.currentTime = startRef.current * duration;
      }
    });
    return () => sub.remove();
  }, [player, isPlaying, duration]);

  // ── Démarrer lecture en boucle sur le segment ─────────────────────────────
  const play = useCallback(() => {
    player.currentTime = startRef.current * duration;
    player.play();
    setIsPlaying(true);
    setPlayRatio(startRef.current);
  }, [player, duration]);

  const pause = useCallback(() => {
    player.pause();
    setIsPlaying(false);
  }, [player]);

  const togglePlay = () => { isPlaying ? pause() : play(); };

  // ── Seek après déplacement d'une poignée ─────────────────────────────────
  const seekToStart = useCallback(() => {
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      player.currentTime = startRef.current * duration;
    }, 80);
  }, [player, duration]);

  // ── PanResponder : poignée gauche ─────────────────────────────────────────
  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { dragging.current = 'start'; },
      onPanResponderMove: (_, g) => {
        const newRatio = Math.max(0, Math.min(
          startRef.current + g.dx / BAR_W,
          endRef.current - 1 / duration,          // au moins 1s avant la fin
        ));
        // Contrainte MAX_DURATION
        const minEnd = Math.min(newRatio + MAX_DURATION / duration, 1);
        if (endRef.current > minEnd) {
          endRef.current = minEnd;
          setEndRatio(minEnd);
        }
        startRef.current = newRatio;
        setStartRatio(newRatio);
      },
      onPanResponderRelease: () => {
        dragging.current = null;
        seekToStart();
        if (isPlaying) { pause(); }
      },
    })
  ).current;

  // ── PanResponder : poignée droite ─────────────────────────────────────────
  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { dragging.current = 'end'; },
      onPanResponderMove: (_, g) => {
        const newRatio = Math.min(1, Math.max(
          endRef.current + g.dx / BAR_W,
          startRef.current + 1 / duration,
        ));
        // Contrainte MAX_DURATION
        const maxEnd = Math.min(startRef.current + MAX_DURATION / duration, 1);
        const clamped = Math.min(newRatio, maxEnd);
        endRef.current = clamped;
        setEndRatio(clamped);
      },
      onPanResponderRelease: () => { dragging.current = null; },
    })
  ).current;

  // ── Dérivés ───────────────────────────────────────────────────────────────
  const startSec    = startRatio * duration;
  const endSec      = endRatio   * duration;
  const trimDuration = endSec - startSec;
  const tooLong     = trimDuration > MAX_DURATION;
  const tooShort    = trimDuration < 1;
  const invalid     = tooLong || tooShort;

  const fmt = (s: number) => {
    const m   = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ── Layout de la barre ────────────────────────────────────────────────────
  // Zone sélectionnée en pixels sur la barre
  const selLeft  = startRatio * BAR_W;
  const selWidth = (endRatio - startRatio) * BAR_W;

  // Curseur de lecture
  const cursorX = playRatio * BAR_W;

  return (
    <View style={s.root}>

      {/* ── Vidéo ── */}
      <View style={s.videoWrap}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          controls={false}
        />

        {/* Overlay chargement */}
        {!isReady && (
          <View style={s.loadingOverlay}>
            <ActivityIndicator size="large" color="#7B3FF2" />
            <Text style={s.loadingText}>Chargement…</Text>
          </View>
        )}

        <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={s.gradTop} pointerEvents="none" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={s.gradBottom} pointerEvents="none" />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onCancel} style={s.headerBtn}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={s.badge}>
            <Icon name="scissors" size={12} color="#fff" />
            <Text style={s.badgeText}>Choisir un segment</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Bouton play centré + durée */}
        {isReady && (
          <TouchableOpacity style={s.playBtn} onPress={togglePlay} activeOpacity={0.8}>
            <View style={s.playBtnInner}>
              <Icon name={isPlaying ? 'pause' : 'play'} size={26} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        {/* Timestamps au-dessus de la barre */}
        {isReady && (
          <View style={s.timesRow}>
            <View style={s.timeBadge}>
              <Text style={s.timeText}>{fmt(startSec)}</Text>
            </View>
            <View style={[s.durationBadge, tooLong && s.durationBadgeErr]}>
              <Text style={[s.durationText, tooLong && { color: '#EF4444' }]}>{fmt(trimDuration)}</Text>
              <Text style={s.durationSub}> / 1m30s</Text>
            </View>
            <View style={s.timeBadge}>
              <Text style={s.timeText}>{fmt(endSec)}</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Barre de trim style WhatsApp ── */}
      <View style={s.trimArea}>

        {/* Zone sombre = non sélectionnée */}
        <View style={s.frameBar}>
          {/* Frames simulées (blocs colorés dégradés) */}
          {Array.from({ length: 16 }).map((_, i) => (
            <View key={i} style={[s.frameBlock, { opacity: 0.55 + (i % 3) * 0.15 }]} />
          ))}

          {/* Overlay sombre hors sélection */}
          <View style={[s.dimOverlay, { left: 0, width: selLeft }]} />
          <View style={[s.dimOverlay, { left: selLeft + selWidth, right: 0 }]} />

          {/* Bordure de sélection */}
          <View style={[
            s.selBorder,
            { left: selLeft, width: selWidth },
            tooLong && { borderColor: '#EF4444' },
          ]} />

          {/* Curseur de lecture */}
          {isPlaying && (
            <View style={[s.cursor, { left: cursorX - 1 }]} />
          )}

          {/* Poignée gauche */}
          <View
            style={[s.handle, s.handleLeft, { left: selLeft }]}
            {...leftPan.panHandlers}
          >
            <View style={s.handleBar} />
          </View>

          {/* Poignée droite */}
          <View
            style={[s.handle, s.handleRight, { left: selLeft + selWidth - HANDLE_W }]}
            {...rightPan.panHandlers}
          >
            <View style={s.handleBar} />
          </View>
        </View>

        {/* Bouton confirmer */}
        <TouchableOpacity
          style={[s.confirmBtn, (invalid || !isReady) && { opacity: 0.4 }]}
          onPress={() => onConfirm(uri, startSec, endSec)}
          disabled={invalid || !isReady}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.confirmInner}
          >
            <Icon name="check" size={16} color="#fff" />
            <Text style={s.confirmText}>
              {invalid
                ? (tooShort ? 'Segment trop court' : 'Trop long — max 1m30s')
                : 'Utiliser ce segment'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // ── Video ────────────────────────────────────────────────────────────────
  videoWrap:  { flex: 1, position: 'relative' },
  gradTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },

  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 10,
  },
  loadingText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },

  header: {
    position: 'absolute', top: Platform.OS === 'android' ? 44 : 56,
    left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 12,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  playBtn: {
    position: 'absolute',
    top: '50%', left: '50%',
    marginTop: -28, marginLeft: -28,
  },
  playBtnInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },

  timesRow: {
    position: 'absolute', bottom: 12, left: BAR_PADDING, right: BAR_PADDING,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  timeBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  timeText: { color: '#fff', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  durationBadge: {
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: 'rgba(123,63,242,0.7)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
  },
  durationBadgeErr: { backgroundColor: 'rgba(239,68,68,0.7)' },
  durationText: { color: '#fff', fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  durationSub:  { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  // ── Zone de trim ─────────────────────────────────────────────────────────
  trimArea: {
    backgroundColor: '#0A0A0A',
    paddingHorizontal: BAR_PADDING,
    paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    gap: 20,
  },

  frameBar: {
    height: BAR_H,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: '#1C1C1C',
  },
  frameBlock: {
    flex: 1,
    height: BAR_H,
    backgroundColor: '#3A3A4A',
    borderRightWidth: 1,
    borderRightColor: '#0A0A0A',
  },

  dimOverlay: {
    position: 'absolute', top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 1,
  },

  selBorder: {
    position: 'absolute', top: 0, bottom: 0,
    borderWidth: 2.5, borderColor: '#FFD60A',
    borderRadius: 4, zIndex: 2,
  },

  cursor: {
    position: 'absolute', top: 0, bottom: 0,
    width: 2, backgroundColor: '#fff',
    zIndex: 5,
  },

  handle: {
    position: 'absolute', top: 0, bottom: 0,
    width: HANDLE_W, zIndex: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFD60A',
  },
  handleLeft:  { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  handleRight: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  handleBar: {
    width: 3, height: 20, borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  // ── Bouton confirmer ──────────────────────────────────────────────────────
  confirmBtn:   { borderRadius: 28, overflow: 'hidden' },
  confirmInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
