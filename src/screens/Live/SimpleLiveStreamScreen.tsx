/**
 * SimpleLiveStreamScreen — Host du live spontané via LiveKit.
 * Reçoit le token publisher depuis GoLiveScreen (déjà démarré).
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import {
  LiveKitRoom,
  useLocalParticipant,
  VideoTrack,
  useParticipants,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import type { TrackReferenceOrPlaceholder } from '@livekit/react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';
import { liveService } from '../../services/liveService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { WS_BASE_URL } from '../../utils/constants';
import { storage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../utils/constants';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type RouteT = RouteProp<MainStackParamList, 'SimpleLiveStream'>;

// ── Contrôles internes (contexte LK requis) ──────────────────────────────────

const StreamControls: React.FC<{ liveId: string; onEnd: () => void }> = ({ liveId, onEnd }) => {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [muted,      setMuted]      = useState(false);
  const [videoOff,   setVideoOff]   = useState(false);
  const [camFront,   setCamFront]   = useState(true);
  const [elapsed,    setElapsed]    = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localParticipant.setCameraEnabled(true).catch(() => {});
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      localParticipant.setCameraEnabled(false).catch(() => {});
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    };
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localParticipant.setMicrophoneEnabled(!next).catch(() => {});
    setMuted(next);
  }, [muted, localParticipant]);

  const toggleVideo = useCallback(() => {
    const next = !videoOff;
    localParticipant.setCameraEnabled(!next).catch(() => {});
    setVideoOff(next);
  }, [videoOff, localParticipant]);

  const flipCam = useCallback(() => {
    const next = !camFront;
    setCamFront(next);
    localParticipant.switchActiveDevice('videoinput', next ? 'user' : 'environment').catch(() => {});
  }, [camFront, localParticipant]);

  const askEnd = useCallback(() => {
    Alert.alert('Terminer le live ?', 'Tous les viewers seront déconnectés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Terminer', style: 'destructive', onPress: onEnd },
    ]);
  }, [onEnd]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const camPub = localParticipant.getTrackPublication(Track.Source.Camera);

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {camPub && !videoOff ? (
        <VideoTrack
          trackRef={{ participant: localParticipant, publication: camPub, source: Track.Source.Camera } as TrackReferenceOrPlaceholder}
          style={st.fullVideo}
          mirror={camFront}
        />
      ) : (
        <View style={[st.fullVideo, st.noVideo]}>
          <Icon name="video-off" size={48} color="#555" />
        </View>
      )}

      {/* Top overlay */}
      <LinearGradient colors={['rgba(0,0,0,0.75)', 'transparent']} style={st.topOverlay}>
        <TouchableOpacity onPress={askEnd} style={st.iconBtn}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={st.topCenter}>
          <View style={st.liveBadge}>
            <View style={st.liveDot} />
            <Text style={st.liveText}>LIVE</Text>
          </View>
          <Text style={st.timerText}>{fmt(elapsed)}</Text>
        </View>
        <View style={st.viewerBadge}>
          <Icon name="eye" size={13} color="#fff" />
          <Text style={st.viewerText}>{participants.length}</Text>
        </View>
      </LinearGradient>

      {/* Bottom controls */}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={st.bottomOverlay}>
        <View style={st.controls}>
          <TouchableOpacity onPress={toggleMute} style={st.ctrlBtn}>
            <Icon name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
            <Text style={st.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleVideo} style={st.ctrlBtn}>
            <Icon name={videoOff ? 'video-off' : 'video'} size={22} color="#fff" />
            <Text style={st.ctrlLabel}>{videoOff ? 'Cam On' : 'Cam Off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={flipCam} style={st.ctrlBtn}>
            <Icon name="refresh-cw" size={22} color="#fff" />
            <Text style={st.ctrlLabel}>Flip</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={askEnd} style={[st.ctrlBtn, st.endBtn]}>
            <Icon name="square" size={22} color="#fff" />
            <Text style={st.ctrlLabel}>End</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};

// ── Page principale ────────────────────────────────────────────────────────────

export const SimpleLiveStreamScreen: React.FC = () => {
  const nav   = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { liveId, publisherToken, livekitUrl } = route.params;

  const handleEnd = useCallback(async () => {
    try { await liveService.stopLive(liveId); } catch {}
    nav.goBack();
  }, [liveId, nav]);

  if (!publisherToken || !livekitUrl) {
    return (
      <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#F0365A" />
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={livekitUrl} token={publisherToken} connect>
      <StreamControls liveId={liveId} onEnd={handleEnd} />
    </LiveKitRoom>
  );
};

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  fullVideo: { ...StyleSheet.absoluteFillObject },
  noVideo: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 16, paddingBottom: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 10,
  },
  iconBtn: { padding: 8 },
  topCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0365A', borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 5 },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  timerText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, gap: 4,
  },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  bottomOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 40, paddingHorizontal: 16, zIndex: 10,
  },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  ctrlBtn: { alignItems: 'center', gap: 4 },
  ctrlLabel: { color: '#fff', fontSize: 11 },
  endBtn: { backgroundColor: '#F0365A', borderRadius: 24, padding: 12 },
});
