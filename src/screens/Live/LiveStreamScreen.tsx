/**
 * LiveStreamScreen — Diffusion live artiste via LiveKit SDK.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, PermissionsAndroid, Alert, ActivityIndicator,
} from 'react-native';
import {
  useLiveKit,
  LiveKitRoom,
  useLocalParticipant,
  VideoTrack,
  AudioTrack,
  TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { concertService } from '../../services';
import type { Concert } from '../../types';

interface Props {
  concertId: string;
  onBack?: () => void;
}

// ── Inner component (inside LiveKitRoom) ─────────────────────────────────────
const StreamControls: React.FC<{
  concert: Concert | null;
  concertId: string;
  onEnd: () => void;
}> = ({ concert, concertId, onEnd }) => {
  const { localParticipant } = useLocalParticipant();
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [cameraFront, setCameraFront] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Enable camera + mic on mount
    localParticipant.setCameraEnabled(true);
    localParticipant.setMicrophoneEnabled(true);

    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    pollRef.current = setInterval(async () => {
      try {
        const s = await concertService.getStreamStatus(concertId);
        setViewerCount(s.current_viewers ?? 0);
      } catch {}
    }, 10000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      localParticipant.setCameraEnabled(false);
      localParticipant.setMicrophoneEnabled(false);
    };
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted, localParticipant]);

  const toggleVideo = useCallback(() => {
    const next = !videoOff;
    localParticipant.setCameraEnabled(!next);
    setVideoOff(next);
  }, [videoOff, localParticipant]);

  const flipCamera = useCallback(() => {
    const next = !cameraFront;
    setCameraFront(next);
    // Switch facingMode via switchActiveDevice
    localParticipant.switchActiveDevice('videoinput', next ? 'user' : 'environment').catch(() => {});
  }, [cameraFront, localParticipant]);

  const handleEndLive = useCallback(() => {
    Alert.alert('Terminer le live ?', 'Tous les viewers seront déconnectés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Terminer', style: 'destructive', onPress: onEnd },
    ]);
  }, [onEnd]);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  // Get local camera track for preview
  const cameraTrack = localParticipant.getTrackPublication(Track.Source.Camera);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Local camera preview */}
      {cameraTrack && !videoOff ? (
        <VideoTrack
          trackRef={{ participant: localParticipant, publication: cameraTrack, source: Track.Source.Camera } as TrackReferenceOrPlaceholder}
          style={styles.fullVideo}
          mirror={cameraFront}
        />
      ) : (
        <View style={[styles.fullVideo, styles.noVideo]}>
          <Icon name="video-off" size={48} color="#666" />
        </View>
      )}

      {/* Top overlay */}
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={styles.topOverlay}>
        <TouchableOpacity onPress={handleEndLive} style={styles.backBtn}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
        </View>

        <View style={styles.viewerBadge}>
          <Icon name="eye" size={14} color="#fff" />
          <Text style={styles.viewerText}>{viewerCount}</Text>
        </View>
      </LinearGradient>

      {/* Concert title */}
      {concert && (
        <View style={styles.titleBar}>
          <Text style={styles.concertTitle} numberOfLines={1}>{concert.title}</Text>
        </View>
      )}

      {/* Bottom controls */}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bottomOverlay}>
        <View style={styles.controls}>
          <TouchableOpacity onPress={toggleMute} style={styles.controlBtn}>
            <Icon name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
            <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleVideo} style={styles.controlBtn}>
            <Icon name={videoOff ? 'video-off' : 'video'} size={22} color="#fff" />
            <Text style={styles.controlLabel}>{videoOff ? 'Cam On' : 'Cam Off'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={flipCamera} style={styles.controlBtn}>
            <Icon name="refresh-cw" size={22} color="#fff" />
            <Text style={styles.controlLabel}>Flip</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleEndLive} style={[styles.controlBtn, styles.endBtn]}>
            <Icon name="square" size={22} color="#fff" />
            <Text style={styles.controlLabel}>End</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const LiveStreamScreen: React.FC<Props> = ({ concertId, onBack }) => {
  const nav = useNavigation();
  const [concert, setConcert] = useState<Concert | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await concertService.getById(concertId);
        setConcert(data);
        // Si le concert est déjà en live, récupérer un token publisher pour rejoindre
        if (data.status === 'live') {
          try {
            const result = await concertService.getStreamToken(concertId);
            setToken(result.token);
            setWsUrl(result.livekit_url);
            setIsLive(true);
          } catch {}
        }
      } catch {}
    })();
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]).catch(() => {});
    }
  }, [concertId]);

  const handleStartLive = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      const result = await concertService.startLive(concertId);
      setToken(result.token);
      setWsUrl(result.livekit_url);
      setIsLive(true);
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail || 'Impossible de démarrer le live');
    } finally {
      setStarting(false);
    }
  }, [concertId, starting]);

  const handleEnd = useCallback(async () => {
    try { await concertService.endLive(concertId); } catch {}
    setIsLive(false);
    setToken(null);
    if (onBack) onBack();
    else nav.goBack();
  }, [concertId, nav, onBack]);

  if (isLive && token && wsUrl) {
    return (
      <LiveKitRoom serverUrl={wsUrl} token={token} connect>
        <StreamControls concert={concert} concertId={concertId} onEnd={handleEnd} />
      </LiveKitRoom>
    );
  }

  // Pre-live screen
  return (
    <View style={[styles.container, styles.preLive]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Icon name="radio" size={56} color="#E53E3E" />
      <Text style={styles.preTitle}>{concert?.title ?? 'Concert'}</Text>
      <Text style={styles.preSub}>Prêt à démarrer le live ?</Text>
      <TouchableOpacity
        style={[styles.goLiveBtn, starting && styles.disabledBtn]}
        onPress={handleStartLive}
        disabled={starting}
      >
        {starting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Icon name="radio" size={20} color="#fff" />
            <Text style={styles.goLiveBtnText}>Go Live</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={() => onBack ? onBack() : nav.goBack()}>
        <Text style={styles.cancelText}>Annuler</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  preLive: { justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32 },
  preTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  preSub: { color: '#999', fontSize: 15 },
  goLiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E53E3E', borderRadius: 30,
    paddingVertical: 14, paddingHorizontal: 40, gap: 8, marginTop: 8,
  },
  goLiveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledBtn: { opacity: 0.6 },
  cancelBtn: { marginTop: 4 },
  cancelText: { color: '#999', fontSize: 15 },
  fullVideo: { ...StyleSheet.absoluteFillObject },
  noVideo: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 16, paddingBottom: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 10,
  },
  backBtn: { padding: 8 },
  topCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E53E3E', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 5 },
  liveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  timerText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, gap: 4,
  },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  titleBar: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80,
    left: 16, right: 16, zIndex: 10,
  },
  concertTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  bottomOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 40, paddingHorizontal: 16, zIndex: 10,
  },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  controlBtn: { alignItems: 'center', gap: 4 },
  controlLabel: { color: '#fff', fontSize: 11 },
  endBtn: { backgroundColor: '#E53E3E', borderRadius: 24, padding: 12 },
});
