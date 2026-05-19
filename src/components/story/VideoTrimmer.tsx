/**
 * VideoTrimmer — style WhatsApp
 * Poignées glissables sur barre de frames → coupe locale via FFmpeg.
 * onConfirm reçoit l'URI du fichier déjà coupé.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  PanResponder, Dimensions, Platform,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

const { width: W }  = Dimensions.get('window');
const MAX_DURATION  = 90;
const BAR_H         = 56;
const HANDLE_W      = 20;
const BAR_PADDING   = 20;
const BAR_W         = W - BAR_PADDING * 2;

interface Props {
  uri:       string;
  duration:  number;
  onConfirm: (trimmedUri: string, startSec: number, endSec: number) => void;
  onCancel:  () => void;
}

export const VideoTrimmer: React.FC<Props> = ({ uri, duration, onConfirm, onCancel }) => {
  const clampedEnd = Math.min(duration, MAX_DURATION);

  const [startRatio, setStartRatio] = useState(0);
  const [endRatio,   setEndRatio]   = useState(clampedEnd / duration);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [playRatio,  setPlayRatio]  = useState(0);
  const [cutting,    setCutting]    = useState(false);
  const [cutError,   setCutError]   = useState('');

  const startRef  = useRef(0);
  const endRef    = useRef(clampedEnd / duration);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = false;
  });

  // Empêche l'auto-play au chargement
  useEffect(() => {
    const sub = player.addEventListener('onStatusChange', (status: string) => {
      if (status === 'readyToPlay') { player.pause(); player.currentTime = 0; }
    });
    return () => sub.remove();
  }, [player]);

  // Progression de lecture — reboucle sur le segment
  useEffect(() => {
    const sub = player.addEventListener('onProgress', ({ currentTime: t }: { currentTime: number }) => {
      setPlayRatio(duration > 0 ? t / duration : 0);
      if (isPlaying && t >= endRef.current * duration) {
        player.currentTime = startRef.current * duration;
      }
    });
    return () => sub.remove();
  }, [player, isPlaying, duration]);

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

  const seekToStart = useCallback(() => {
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      try { player.currentTime = startRef.current * duration; } catch {}
    }, 80);
  }, [player, duration]);

  // ── PanResponder poignée gauche ───────────────────────────────────────────
  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderMove: (_, g) => {
        const newRatio = Math.max(0, Math.min(
          startRef.current + g.dx / BAR_W,
          endRef.current - 1 / duration,
        ));
        const maxEnd = Math.min(newRatio + MAX_DURATION / duration, 1);
        if (endRef.current > maxEnd) { endRef.current = maxEnd; setEndRatio(maxEnd); }
        startRef.current = newRatio;
        setStartRatio(newRatio);
      },
      onPanResponderRelease: () => { seekToStart(); pause(); },
    })
  ).current;

  // ── PanResponder poignée droite ───────────────────────────────────────────
  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderMove: (_, g) => {
        const maxEnd  = Math.min(startRef.current + MAX_DURATION / duration, 1);
        const newRatio = Math.min(maxEnd, Math.max(
          endRef.current + g.dx / BAR_W,
          startRef.current + 1 / duration,
        ));
        endRef.current = newRatio;
        setEndRatio(newRatio);
      },
      onPanResponderRelease: () => { pause(); },
    })
  ).current;

  // ── Coupe locale FFmpeg ───────────────────────────────────────────────────
  const handleConfirm = async () => {
    const startSec = startRef.current * duration;
    const endSec   = endRef.current   * duration;
    const trimSec  = endSec - startSec;

    setCutting(true);
    setCutError('');
    pause();

    try {
      // Normaliser l'URI source (content:// → file:// sur Android)
      let srcUri = uri;
      if (Platform.OS === 'android' && uri.startsWith('content://')) {
        const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/trim_src_${Date.now()}.mp4`;
        try { await ReactNativeBlobUtil.fs.cp(uri, dest); }
        catch {
          const data = await ReactNativeBlobUtil.fs.readFile(uri, 'base64');
          await ReactNativeBlobUtil.fs.writeFile(dest, data, 'base64');
        }
        srcUri = `file://${dest}`;
      }

      const outPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/trimmed_${Date.now()}.mp4`;
      // -ss avant -i = seek rapide (keyframe), -t = durée du segment, -c copy = sans ré-encodage
      const cmd = `-ss ${startSec.toFixed(3)} -i "${srcUri.replace('file://', '')}" -t ${trimSec.toFixed(3)} -c copy -avoid_negative_ts make_zero "${outPath}"`;

      const session = await FFmpegKit.execute(cmd);
      const rc      = await session.getReturnCode();

      if (ReturnCode.isSuccess(rc)) {
        onConfirm(`file://${outPath}`, startSec, endSec);
      } else {
        const logs = await session.getAllLogsAsString();
        setCutError('Erreur lors de la coupe. Réessaie.');
        console.warn('FFmpeg error:', logs);
      }
    } catch (e: any) {
      setCutError('Erreur inattendue.');
      console.warn('Trim error:', e);
    } finally {
      setCutting(false);
    }
  };

  // ── Dérivés ───────────────────────────────────────────────────────────────
  const startSec    = startRatio * duration;
  const endSec      = endRatio   * duration;
  const trimDuration = endSec - startSec;
  const tooLong     = trimDuration > MAX_DURATION;
  const tooShort    = trimDuration < 1;
  const invalid     = tooLong || tooShort;

  const selLeft  = startRatio * BAR_W;
  const selWidth = (endRatio - startRatio) * BAR_W;
  const cursorX  = playRatio * BAR_W;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <View style={s.root}>

      {/* ── Vidéo ── */}
      <View style={s.videoWrap}>
        <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="contain" controls={false} />

        <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={s.gradTop} pointerEvents="none" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={s.gradBottom} pointerEvents="none" />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onCancel} style={s.headerBtn} disabled={cutting}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={s.badge}>
            <Icon name="scissors" size={12} color="#fff" />
            <Text style={s.badgeText}>Choisir un segment</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Bouton play */}
        <TouchableOpacity style={s.playBtn} onPress={togglePlay} activeOpacity={0.8} disabled={cutting}>
          <View style={s.playBtnInner}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={26} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Timestamps */}
        <View style={s.timesRow}>
          <View style={s.timeBadge}><Text style={s.timeText}>{fmt(startSec)}</Text></View>
          <View style={[s.durationBadge, tooLong && s.durationBadgeErr]}>
            <Text style={[s.durationText, tooLong && { color: '#EF4444' }]}>{fmt(trimDuration)}</Text>
            <Text style={s.durationSub}> / 1m30s</Text>
          </View>
          <View style={s.timeBadge}><Text style={s.timeText}>{fmt(endSec)}</Text></View>
        </View>
      </View>

      {/* ── Barre de trim ── */}
      <View style={s.trimArea}>
        <View style={s.frameBar}>
          {Array.from({ length: 16 }).map((_, i) => (
            <View key={i} style={[s.frameBlock, { opacity: 0.55 + (i % 3) * 0.15 }]} />
          ))}
          <View style={[s.dimOverlay, { left: 0, width: selLeft }]} />
          <View style={[s.dimOverlay, { left: selLeft + selWidth, right: 0 }]} />
          <View style={[s.selBorder, { left: selLeft, width: selWidth }, tooLong && { borderColor: '#EF4444' }]} />
          {isPlaying && <View style={[s.cursor, { left: cursorX - 1 }]} />}

          {/* Poignée gauche */}
          <View style={[s.handle, s.handleLeft, { left: selLeft }]} {...leftPan.panHandlers}>
            <View style={s.handleBar} />
          </View>
          {/* Poignée droite */}
          <View style={[s.handle, s.handleRight, { left: selLeft + selWidth - HANDLE_W }]} {...rightPan.panHandlers}>
            <View style={s.handleBar} />
          </View>
        </View>

        {/* Erreur FFmpeg */}
        {cutError ? (
          <View style={s.errorRow}>
            <Icon name="alert-triangle" size={13} color="#EF4444" />
            <Text style={s.errorText}>{cutError}</Text>
          </View>
        ) : null}

        {/* Bouton confirmer */}
        <TouchableOpacity
          style={[s.confirmBtn, (invalid || cutting) && { opacity: 0.5 }]}
          onPress={handleConfirm}
          disabled={invalid || cutting}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.confirmInner}
          >
            {cutting ? (
              <>
                <ActivityIndicator size={16} color="#fff" />
                <Text style={s.confirmText}>Découpe en cours…</Text>
              </>
            ) : (
              <>
                <Icon name="check" size={16} color="#fff" />
                <Text style={s.confirmText}>
                  {invalid
                    ? (tooShort ? 'Segment trop court' : 'Trop long — max 1m30s')
                    : 'Utiliser ce segment'}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  videoWrap:  { flex: 1, position: 'relative' },
  gradTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },

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
    position: 'absolute', top: '50%', left: '50%',
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
  timeText:     { color: '#fff', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  durationBadge:{
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: 'rgba(123,63,242,0.7)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
  },
  durationBadgeErr: { backgroundColor: 'rgba(239,68,68,0.7)' },
  durationText: { color: '#fff', fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  durationSub:  { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  trimArea: {
    backgroundColor: '#0A0A0A',
    paddingHorizontal: BAR_PADDING,
    paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    gap: 16,
  },

  frameBar: {
    height: BAR_H, borderRadius: 6, overflow: 'hidden',
    flexDirection: 'row', position: 'relative',
    backgroundColor: '#1C1C1C',
  },
  frameBlock: {
    flex: 1, height: BAR_H,
    backgroundColor: '#3A3A4A',
    borderRightWidth: 1, borderRightColor: '#0A0A0A',
  },
  dimOverlay: {
    position: 'absolute', top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1,
  },
  selBorder: {
    position: 'absolute', top: 0, bottom: 0,
    borderWidth: 2.5, borderColor: '#FFD60A',
    borderRadius: 4, zIndex: 2,
  },
  cursor: {
    position: 'absolute', top: 0, bottom: 0,
    width: 2, backgroundColor: '#fff', zIndex: 5,
  },
  handle: {
    position: 'absolute', top: 0, bottom: 0,
    width: HANDLE_W, zIndex: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFD60A',
  },
  handleLeft:  { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  handleRight: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  handleBar:   { width: 3, height: 20, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.5)' },

  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
  },
  errorText: { color: '#EF4444', fontSize: 12, flex: 1 },

  confirmBtn:   { borderRadius: 28, overflow: 'hidden' },
  confirmInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
