/**
 * SimpleLiveStreamScreen — Host du live spontané.
 *
 * Système modération TikTok :
 * - WS /api/v1/social/comments/ws/live/{id} reçoit :
 *     comment_added   → chat temps réel
 *     gift_received   → notif cadeau
 *     like_added      → compteur likes
 *     live_hand_raise → quelqu'un veut monter (badge + liste demandes)
 *
 * - Panel "demandes" : accept → POST /lives/{id}/invite/{identity}  (LiveKit can_publish=true + WS live_guest_invited)
 *                      refuse → juste fermer
 * - Bouton descendre sur vignette → POST /lives/{id}/demote/{identity} (LiveKit can_publish=false + WS live_guest_demoted)
 * - Bannir : long press vignette → POST /lives/{id}/ban/{identity}
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Alert, ActivityIndicator, FlatList, TextInput,
  Image, ScrollView, AppState, AppStateStatus,
} from 'react-native';
import Animated, {
  FadeIn, FadeOut, SlideInRight, SlideOutRight,
  useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, Easing,
} from 'react-native-reanimated';
import {
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track, RoomEvent, RemoteParticipant, Room, VideoPresets } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { liveService } from '../../services/liveService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { LiveGiftOverlay } from '../../components/wallet/LiveGiftOverlay';
import type { GiftNotif, LiveGiftOverlayRef } from '../../components/wallet/LiveGiftOverlay';
import { LiveLikeButton } from '../../components/live/LiveLikeButton';
import type { LiveLikeButtonRef } from '../../components/live/LiveLikeButton';
import { LiveReactionPicker, ReactionFloaters, useReactionFloaters } from '../../components/live/LiveReactionPicker';
import { useUser } from '../../context/UserContext';
import { useWs } from '../../context/WebSocketContext';
import { BoostPrompt } from '../../components/common';
import { LiveSettingsSheet } from '../../components/live/LiveSettingsSheet';
import type { LiveStream } from '../../services/liveService';

// ── LiveKit quality config ─────────────────────────────────────────────────────

const CREATOR_ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: {
    videoCodec: 'h264' as const,
    simulcast: true,
    videoSimulcastLayers: [VideoPresets.h720],
    videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 },
  },
};

type Nav    = NativeStackNavigationProp<MainStackParamList>;
type RouteT = RouteProp<MainStackParamList, 'SimpleLiveStream'>;

interface ChatMsg {
  id:      string;
  user:    string;
  userId?: string;
  avatar?: string | null;
  text:    string;
  isJoin?: boolean;
  isGift?: boolean;
  isSys?:  boolean;
}

interface HandRequest {
  identity:    string;
  displayName: string;
  avatarUrl?:  string | null;
}

interface GiftTick {
  id:         string;
  emoji:      string;
  senderName: string;
  giftName:   string;
  coins:      number;
}

// ── Avatar fallback ───────────────────────────────────────────────────────────

const Av: React.FC<{ name: string; size: number; color?: string }> = ({ name, size, color = '#F0365A' }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{(name || '?')[0].toUpperCase()}</Text>
  </View>
);

// ── Anneau pulsant "parle en ce moment" ──────────────────────────────────────

const SpeakingRing: React.FC<{ color?: string; size: number; borderWidth?: number }> = ({
  color = '#3FEDB6', size, borderWidth = 3,
}) => {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0.9);

  useEffect(() => {
    scale.value   = withRepeat(withSequence(
      withTiming(1.12, { duration: 380, easing: Easing.out(Easing.quad) }),
      withTiming(1,    { duration: 380, easing: Easing.in(Easing.quad) }),
    ), -1, false);
    opacity.value = withRepeat(withSequence(
      withTiming(0.35, { duration: 380 }),
      withTiming(0.9,  { duration: 380 }),
    ), -1, false);
  }, []);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <Animated.View
      style={[ring, {
        position: 'absolute', top: 0, left: 0,
        width: size, height: size, borderRadius: size / 2,
        borderWidth, borderColor: color,
        pointerEvents: 'none',
      }]}
    />
  );
};

// ── Toast "X parle" affiché en overlay bas-gauche ────────────────────────────

const ActiveSpeakerToast: React.FC<{
  name: string;
  avatarUrl?: string | null;
  isLocal: boolean;
}> = ({ name, avatarUrl, isLocal }) => {
  const barW = useSharedValue(0.4);

  useEffect(() => {
    barW.value = withRepeat(withSequence(
      withTiming(1,   { duration: 220, easing: Easing.out(Easing.ease) }),
      withTiming(0.3, { duration: 220, easing: Easing.in(Easing.ease) }),
      withTiming(0.8, { duration: 180 }),
      withTiming(0.2, { duration: 180 }),
    ), -1, false);
  }, []);

  const bar1 = useAnimatedStyle(() => ({ height: 4 + barW.value * 12 }));
  const bar2 = useAnimatedStyle(() => ({ height: 4 + ((1 - barW.value) * 0.8) * 12 }));
  const bar3 = useAnimatedStyle(() => ({ height: 4 + barW.value * 0.6 * 12 }));

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(280)} style={spk.toast}>
      {avatarUrl
        ? <Image source={{ uri: avatarUrl }} style={spk.avatar} />
        : <View style={[spk.avatar, { backgroundColor: isLocal ? '#F0365A' : '#9B65F5', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{(name || '?')[0].toUpperCase()}</Text>
          </View>
      }
      <Text style={spk.name} numberOfLines={1}>{isLocal ? 'Toi' : name}</Text>
      {/* Barres audio animées */}
      <View style={spk.bars}>
        <Animated.View style={[spk.bar, bar1, { backgroundColor: '#3FEDB6' }]} />
        <Animated.View style={[spk.bar, bar2, { backgroundColor: '#9B65F5' }]} />
        <Animated.View style={[spk.bar, bar3, { backgroundColor: '#3FEDB6' }]} />
      </View>
    </Animated.View>
  );
};

const spk = StyleSheet.create({
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(5,0,16,0.82)',
    borderRadius: 22, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: '#3FEDB6',
    alignSelf: 'flex-start', maxWidth: 200,
    shadowColor: '#3FEDB6', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  name:   { color: '#fff', fontSize: 12, fontWeight: '700', flex: 1 },
  bars:   { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, overflow: 'hidden' },
  bar:    { width: 3, borderRadius: 2, minHeight: 4 },
});

// ── Zone vidéo host ───────────────────────────────────────────────────────────

const HostVideoView: React.FC<{
  mirror:        boolean;
  liveId:        string;
  hostName:      string;
  hostAvatarUrl: string | null | undefined;
  onStage:       Set<string>;
  onGift:        (id: string, name: string) => void;
  onDemote:      (id: string, name: string) => void;
  onBan:         (id: string, name: string) => void;
  isMuted:       boolean;
  isVideoOff:    boolean;
}> = ({ mirror, hostName, hostAvatarUrl, onStage, onGift, onDemote, onBan, isMuted, isVideoOff }) => {
  const allTracks            = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const { localParticipant } = useLocalParticipant();
  const allParticipants      = useParticipants();
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  const localTrack      = allTracks.find(t => t.participant.isLocal) ?? null;
  const localCamOn      = localTrack ? !localTrack.publication?.isMuted : false;
  const spotlightTrack  = allTracks.find(t => t.participant.identity === spotlightId) ?? localTrack ?? allTracks[0] ?? null;
  const thumbnailTracks = allTracks.filter(t => t !== spotlightTrack);
  const showLocalPip    = spotlightTrack && !spotlightTrack.participant.isLocal && localTrack;
  const spotlightName   = spotlightTrack ? (spotlightTrack.participant.isLocal ? 'Toi' : (spotlightTrack.participant.name || spotlightTrack.participant.identity)) : '';
  const spotlightCamOn  = spotlightTrack ? !spotlightTrack.publication?.isMuted : false;

  const isSpeaking = (identity: string) =>
    allParticipants.find(p => p.identity === identity)?.isSpeaking ?? false;
  const localSpeaking = localParticipant.isSpeaking;

  // Pas encore connecté à la room
  if (!localParticipant.sid && allTracks.length === 0) {
    return (
      <View style={[StyleSheet.absoluteFill, mv.noVideo]}>
        <ActivityIndicator size="large" color="#F0365A" />
      </View>
    );
  }

  // Connecté mais caméra off — afficher avatar style TikTok
  if ((!localCamOn || isVideoOff) && allTracks.filter(t => !t.participant.isLocal).length === 0) {
    return (
      <View style={[StyleSheet.absoluteFill, mv.noCamBg]}>
        {hostAvatarUrl
          ? <Image source={{ uri: hostAvatarUrl }} style={mv.noCamAvatar} />
          : <Av name={hostName} size={100} />
        }
        <Text style={mv.noCamName}>{hostName}</Text>

        {/* Badges état micro + caméra */}
        <View style={mv.noCamBadgeRow}>
          <View style={[mv.noCamBadge, isMuted && mv.noCamBadgeOff]}>
            <Icon name={isMuted ? 'mic-off' : 'mic'} size={13} color={isMuted ? '#F0365A' : 'rgba(255,255,255,0.9)'} />
            <Text style={[mv.noCamBadgeText, isMuted && { color: '#F0365A' }]}>
              {isMuted ? 'Micro coupé' : 'Micro actif'}
            </Text>
          </View>
          <View style={[mv.noCamBadge, mv.noCamBadgeOff]}>
            <Icon name="video-off" size={13} color="#F0365A" />
            <Text style={[mv.noCamBadgeText, { color: '#F0365A' }]}>Caméra désactivée</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Spotlight */}
      {spotlightTrack && (
        spotlightCamOn
          ? <VideoTrack trackRef={spotlightTrack} style={StyleSheet.absoluteFill}
              mirror={spotlightTrack.participant.isLocal ? mirror : false} objectFit="cover" />
          : <View style={[StyleSheet.absoluteFill, mv.noVideoBg]}>
              <Av name={spotlightName} size={96} />
              <Text style={mv.spotName}>{spotlightName}</Text>
            </View>
      )}

      {/* PiP local quand viewer spotlighté */}
      {showLocalPip && localTrack && (
        <TouchableOpacity style={mv.pip} onPress={() => setSpotlightId(null)} activeOpacity={0.85}>
          {localCamOn
            ? <VideoTrack trackRef={localTrack} style={StyleSheet.absoluteFill} mirror={mirror} objectFit="cover" />
            : <View style={[StyleSheet.absoluteFill, mv.thumbNoCam]}><Av name="Toi" size={40} /></View>
          }
          {/* Anneau pulsant si le host parle */}
          {localSpeaking && <SpeakingRing color="#F0365A" size={mv.pip.width as number} borderWidth={3} />}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={mv.pipGrad}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              {localSpeaking && <View style={mv.pipSpeakDot} />}
              <Text style={mv.pipLabel}>Toi</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Vignettes viewers (sur scène) */}
      {thumbnailTracks.length > 0 && (
        <View style={mv.thumbsCol}>
          {thumbnailTracks.map(t => {
            const camOn     = !t.publication?.isMuted;
            const tName     = t.participant.isLocal ? 'Toi' : (t.participant.name || t.participant.identity);
            const isLocal   = t.participant.isLocal;
            const isOnStage = !isLocal && onStage.has(t.participant.identity);
            const talking   = isLocal ? localSpeaking : isSpeaking(t.participant.identity);
            return (
              <TouchableOpacity
                key={t.participant.identity}
                style={[mv.thumb, isOnStage && mv.thumbOnStage, talking && mv.thumbSpeaking]}
                onPress={() => setSpotlightId(t.participant.identity)}
                onLongPress={() => {
                  if (isLocal) return;
                  const id = t.participant.identity;
                  Alert.alert(tName, 'Que veux-tu faire ?', [
                    { text: 'Annuler', style: 'cancel' },
                    ...(isOnStage ? [{
                      text: 'Faire descendre',
                      onPress: () => onDemote(id, tName),
                    }] : []),
                    { text: 'Bannir...', style: 'destructive' as const, onPress: () => onBan(id, tName) },
                  ]);
                }}
                activeOpacity={0.8}
                delayLongPress={400}
              >
                {camOn
                  ? <VideoTrack trackRef={t} style={StyleSheet.absoluteFill} objectFit="cover" />
                  : <View style={[StyleSheet.absoluteFill, mv.thumbNoCam]}><Av name={tName} size={40} /></View>
                }
                {/* Anneau pulsant vert si parle */}
                {talking && <SpeakingRing color="#3FEDB6" size={mv.thumb.width as number} borderWidth={2.5} />}
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={mv.thumbGrad}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    {talking && <View style={mv.thumbSpeakDot} />}
                    <Text style={mv.thumbLabel} numberOfLines={1}>{tName}</Text>
                  </View>
                </LinearGradient>
                {isOnStage && (
                  <View style={[mv.thumbStageDot, talking && { backgroundColor: '#3FEDB6' }]}>
                    <Icon name="mic" size={9} color="#fff" />
                  </View>
                )}
                {!isLocal && (
                  <TouchableOpacity style={mv.thumbGiftBtn} onPress={() => onGift(t.participant.identity, tName)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                    <Text style={{ fontSize: 13 }}>🎁</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

// ── Panel demandes de scène ───────────────────────────────────────────────────

const HandRequestsPanel: React.FC<{
  requests: HandRequest[];
  onAccept: (req: HandRequest) => void;
  onRefuse: (identity: string) => void;
  onClose:  () => void;
}> = ({ requests, onAccept, onRefuse, onClose }) => (
  <Animated.View entering={SlideInRight.duration(280)} exiting={SlideOutRight.duration(220)} style={hr.panel}>
    <View style={hr.header}>
      <View style={hr.headerLeft}>
        <Text style={hr.title}>Demandes ({requests.length})</Text>
      </View>
      <TouchableOpacity onPress={onClose} style={hr.closeBtn}>
        <Icon name="x" size={16} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </View>
    <ScrollView showsVerticalScrollIndicator={false}>
      {requests.map(req => (
        <View key={req.identity} style={hr.row}>
          {req.avatarUrl
            ? <Image source={{ uri: req.avatarUrl }} style={hr.avatar} />
            : <Av name={req.displayName} size={38} />
          }
          <Text style={hr.name} numberOfLines={1}>{req.displayName}</Text>
          <TouchableOpacity style={hr.acceptBtn} onPress={() => onAccept(req)} activeOpacity={0.8}>
            <Icon name="check" size={14} color="#fff" />
            <Text style={hr.acceptText}>Inviter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={hr.refuseBtn} onPress={() => onRefuse(req.identity)} activeOpacity={0.8}>
            <Icon name="x" size={14} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
      ))}
      {requests.length === 0 && (
        <View style={hr.empty}>
          <Text style={hr.emptyText}>Aucune demande en attente</Text>
        </View>
      )}
    </ScrollView>
  </Animated.View>
);

// ── Toast arrivée viewer ──────────────────────────────────────────────────────

const JoinToast: React.FC<{ name: string }> = ({ name }) => (
  <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(350)} style={st.joinToast}>
    <Icon name="user-plus" size={11} color="rgba(255,255,255,0.7)" />
    <Text style={st.joinToastText}>{name} a rejoint</Text>
  </Animated.View>
);

// ── Contenu principal ─────────────────────────────────────────────────────────

const StreamContent: React.FC<{ liveId: string; onEnd: () => void; isPrivate?: boolean }> = ({ liveId, onEnd, isPrivate = false }) => {
  const { localParticipant } = useLocalParticipant();
  const room                 = useRoomContext();
  const allParticipants      = useParticipants();
  const { currentUser }      = useUser();
  const { addListener, removeListener } = useWs();
  const nav                  = useNavigation<Nav>();
  const remoteParticipants   = allParticipants.filter(p => !p.isLocal);

  const [muted,        setMuted]        = useState(false);
  const [videoOff,     setVideoOff]     = useState(false);
  const [camFront,     setCamFront]     = useState(true);
  const [elapsed,      setElapsed]      = useState(0);
  const [messages,     setMessages]     = useState<ChatMsg[]>([]);
  const [chatInput,    setChatInput]    = useState('');
  const [sending,      setSending]      = useState(false);
  const [showInput,    setShowInput]    = useState(false);
  const [joinToasts,   setJoinToasts]   = useState<{ id: string; name: string }[]>([]);
  const [giftNotifs,   setGiftNotifs]   = useState<GiftNotif[]>([]);
  const [giftTicker,   setGiftTicker]   = useState<GiftTick[]>([]);
  const [giftHistory,  setGiftHistory]  = useState<GiftTick[]>([]);
  const [showGifts,    setShowGifts]    = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const likeRef             = useRef<LiveLikeButtonRef>(null);
  const { floaters, spawn } = useReactionFloaters();
  const reactionThrottle    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Modération
  const [handRequests, setHandRequests] = useState<HandRequest[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [showOnStage,  setShowOnStage]  = useState(false);
  const [onStage,      setOnStage]      = useState<Set<string>>(new Set());

  const [showSettings,   setShowSettings]   = useState(false);
  const [activeSpeaker,  setActiveSpeaker]  = useState<{ identity: string; name: string; avatarUrl?: string | null; isLocal: boolean } | null>(null);
  const activeSpeakerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveData,     setLiveData]     = useState<LiveStream | null>(null);

  const chatRef     = useRef<FlatList>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showLaunchBanner, setShowLaunchBanner] = useState(true);
  const [showBoost,        setShowBoost]        = useState(false);
  const giftRef  = useRef<LiveGiftOverlayRef>(null);

  useEffect(() => {
    liveService.getById(liveId)
      .then((l: LiveStream) => setLiveData(l))
      .catch(() => {});
  }, [liveId]);

  const addSysMsg = useCallback((text: string) => {
    const id = `sys-${Date.now()}`;
    setMessages(prev => [...prev.slice(-149), { id, user: '', text, isSys: true }]);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
    setTimeout(() => setMessages(prev => prev.filter(m => m.id !== id)), 4000);
  }, []);

  // Parleur actif — écoute RoomEvent.ActiveSpeakersChanged
  useEffect(() => {
    if (!room) return;
    const onSpeakers = (speakers: any[]) => {
      if (!speakers || speakers.length === 0) {
        if (activeSpeakerTimer.current) clearTimeout(activeSpeakerTimer.current);
        activeSpeakerTimer.current = setTimeout(() => setActiveSpeaker(null), 1200);
        return;
      }
      if (activeSpeakerTimer.current) clearTimeout(activeSpeakerTimer.current);
      const top = speakers[0];
      const isLocal = top.identity === localParticipant.identity;
      setActiveSpeaker({
        identity:  top.identity,
        name:      top.name || top.identity || '',
        avatarUrl: top.metadata ? undefined : null,
        isLocal,
      });
      activeSpeakerTimer.current = setTimeout(() => setActiveSpeaker(null), 2500);
    };
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers);
      if (activeSpeakerTimer.current) clearTimeout(activeSpeakerTimer.current);
    };
  }, [room, localParticipant]);

  // Démarrer cam + mic
  useEffect(() => {
    localParticipant.setCameraEnabled(true).catch(() => {});
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    const bannerTimer = setTimeout(() => setShowLaunchBanner(false), 4000);
    // Propose le boost 5s après le lancement (après que le banner ait disparu)
    const boostTimer  = setTimeout(() => setShowBoost(true), 5500);
    return () => { clearTimeout(bannerTimer); clearTimeout(boostTimer); };

    // Couper la caméra en background pour éviter le crash Android
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        localParticipant.setCameraEnabled(false).catch(() => {});
      } else if (next === 'active') {
        localParticipant.setCameraEnabled(true).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      sub.remove();
      if (timerRef.current) clearInterval(timerRef.current);
      localParticipant.setCameraEnabled(false).catch(() => {});
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    };
  }, [localParticipant]);

  // LiveKit : participant connecté/déconnecté
  useEffect(() => {
    if (!room) return;
    const onJoin = (p: RemoteParticipant) => {
      const name = p.name || p.identity || 'Quelqu\'un';
      const tid  = `${p.identity}-${Date.now()}`;
      setJoinToasts(prev => [...prev, { id: tid, name }]);
      setMessages(prev => [...prev.slice(-149), { id: tid, user: '', text: `${name} a rejoint`, isJoin: true }]);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
      setTimeout(() => setJoinToasts(prev => prev.filter(t => t.id !== tid)), 3000);
      setTimeout(() => setMessages(prev => prev.filter(m => m.id !== tid)), 4000);
    };
    const onLeave = (p: RemoteParticipant) => {
      const name = p.name || p.identity || 'Quelqu\'un';
      // Retirer de la liste des demandes + de la scène si besoin
      setHandRequests(prev => prev.filter(r => r.identity !== p.identity));
      setOnStage(prev => { const next = new Set(prev); next.delete(p.identity); return next; });
      addSysMsg(`${name} a quitté le live`);
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin);
      room.off(RoomEvent.ParticipantDisconnected, onLeave);
    };
  }, [room, addSysMsg]);

  // WS live — chat + cadeaux + likes + demandes de scène
  useEffect(() => {
    if (!liveId) return;
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_BASE_URL}/api/v1/social/comments/ws/live/${liveId}?token=${accessToken}`);
    } catch { return; }
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);

        // ── Messages chat en temps réel
        if (d.type === 'comment_added' && d.comment) {
          const c = d.comment;
          const incoming = {
            id:     c.id ?? String(Date.now()),
            user:   c.author?.display_name ?? c.author?.username ?? 'Anonyme',
            userId: c.author?.id ? String(c.author.id) : undefined,
            avatar: c.author?.avatar_url ?? null,
            text:   c.body,
          };
          setMessages(prev => {
            // Remplacer le message optimiste local (même texte + même user) au lieu d'ajouter
            const localIdx = prev.findIndex(
              m => m.id.startsWith('local-') && m.text === incoming.text && m.user === incoming.user,
            );
            if (localIdx !== -1) {
              const next = [...prev];
              next[localIdx] = incoming;
              return next;
            }
            // Pas de doublon — ajouter normalement
            if (prev.some(m => m.id === incoming.id)) return prev;
            return [...prev.slice(-149), incoming];
          });
          setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
        }

        // ── Cadeaux reçus
        if (d.type === 'gift_received' && d.gift) {
          const gf   = d.gift;
          const sn   = gf.sender?.display_name ?? gf.sender?.username ?? 'Quelqu\'un';
          const tick: GiftTick = {
            id:         gf.id ?? String(Date.now()),
            senderName: sn,
            emoji:      gf.gift_type?.emoji ?? '🎁',
            giftName:   gf.gift_type?.name  ?? 'Cadeau',
            coins:      gf.coins_spent ?? 0,
          };
          setGiftNotifs(prev => [...prev, {
            id: tick.id, senderName: sn,
            emoji: tick.emoji, giftName: tick.giftName, coins: tick.coins,
          }]);
          setGiftTicker(prev => [...prev.slice(-2), tick]);
          setGiftHistory(prev => [tick, ...prev.slice(0, 49)]);
          setTimeout(() => setGiftTicker(prev => prev.filter(t => t.id !== tick.id)), 5000);
        }

        // ── Likes
        if (d.type === 'like_added') {
          const count = d.count ?? 1;
          setLikeCount(c => c + count);
          for (let i = 0; i < Math.min(count, 3); i++) {
            setTimeout(() => likeRef.current?.triggerRemote(), i * 120);
          }
        }

        // ── Réactions emoji des viewers
        if (d.type === 'reaction_added' && d.emoji) {
          for (let i = 0; i < Math.min(d.count ?? 1, 3); i++) {
            setTimeout(() => spawn(d.emoji), i * 150);
          }
        }
      } catch {}
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
    }, 25_000);
    return () => { clearInterval(ping); try { ws.close(); } catch {} };
  }, [liveId, addSysMsg]);

  // Événements modération via le WS global (broadcast_all du backend)
  useEffect(() => {
    const handler = (d: { type: string; live_id?: string; identity?: string; display_name?: string; avatar_url?: string; [key: string]: any }) => {
      if (!['live_hand_raise', 'live_guest_invited', 'live_guest_demoted'].includes(d.type)) return;
      if (d.live_id !== liveId) return;

      if (d.type === 'live_hand_raise') {
        const newReq: HandRequest = {
          identity:    d.identity ?? '',
          displayName: d.display_name ?? d.identity ?? '',
          avatarUrl:   d.avatar_url ?? null,
        };
        setHandRequests(prev => {
          if (prev.some(r => r.identity === d.identity)) return prev;
          return [...prev, newReq];
        });
        setShowRequests(true);
        addSysMsg(`${d.display_name ?? d.identity} veut monter sur scène`);
      }

      if (d.type === 'live_guest_invited') {
        setOnStage(prev => new Set([...prev, d.identity ?? '']));
        setHandRequests(prev => prev.filter(r => r.identity !== d.identity));
        addSysMsg(`${d.identity} est maintenant sur scène`);
      }

      if (d.type === 'live_guest_demoted') {
        setOnStage(prev => { const next = new Set(prev); next.delete(d.identity ?? ''); return next; });
        addSysMsg(`${d.identity} a été redescendu de scène`);
      }
    };

    addListener(handler);
    return () => removeListener(handler);
  }, [liveId, addSysMsg, addListener, removeListener]);

  // ── Actions modération
  const handleAccept = useCallback(async (req: HandRequest) => {
    try {
      await liveService.invite(liveId, req.identity);
      setOnStage(prev => new Set([...prev, req.identity]));
      setHandRequests(prev => prev.filter(r => r.identity !== req.identity));
      if (handRequests.length <= 1) setShowRequests(false);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'inviter ce participant.');
    }
  }, [liveId, handRequests.length]);

  const handleRefuse = useCallback((identity: string) => {
    setHandRequests(prev => prev.filter(r => r.identity !== identity));
    if (handRequests.length <= 1) setShowRequests(false);
  }, [handRequests.length]);

  const handleDemote = useCallback(async (identity: string, name: string) => {
    try {
      await liveService.demote(liveId, identity);
      setOnStage(prev => { const next = new Set(prev); next.delete(identity); return next; });
      addSysMsg(`${name} a été redescendu de scène`);
    } catch {
      Alert.alert('Erreur', 'Impossible de faire descendre ce participant.');
    }
  }, [liveId, addSysMsg]);

  const handleBan = useCallback((identity: string, name: string) => {
    Alert.alert(name, 'Que veux-tu faire ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Exclure du live',
        onPress: async () => {
          try {
            await liveService.ban(liveId, identity);
            setHandRequests(prev => prev.filter(r => r.identity !== identity));
            setOnStage(prev => { const next = new Set(prev); next.delete(identity); return next; });
            addSysMsg(`${name} a été exclu du live`);
          } catch {
            Alert.alert('Erreur', 'Impossible d\'exclure ce participant.');
          }
        },
      },
      {
        text: 'Bloquer de tous mes lives',
        onPress: () => {
          Alert.alert(
            'Bloquer des lives',
            `${name} ne pourra plus voir aucun de tes lives (actuel et futurs).`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Bloquer', style: 'destructive',
                onPress: async () => {
                  try {
                    await liveService.blockUserFromLives(identity);
                    setHandRequests(prev => prev.filter(r => r.identity !== identity));
                    setOnStage(prev => { const next = new Set(prev); next.delete(identity); return next; });
                    addSysMsg(`${name} a été bloqué de tous tes lives`);
                  } catch {
                    Alert.alert('Erreur', 'Impossible de bloquer cet utilisateur.');
                  }
                },
              },
            ]
          );
        },
      },
      {
        text: 'Bannir (ce live uniquement)', style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Bannir de ce live',
            `${name} ne pourra plus rejoindre ce live.`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Confirmer', style: 'destructive',
                onPress: async () => {
                  try {
                    await liveService.globalBan(liveId, identity);
                    setHandRequests(prev => prev.filter(r => r.identity !== identity));
                    setOnStage(prev => { const next = new Set(prev); next.delete(identity); return next; });
                    addSysMsg(`${name} a été banni de tous tes lives`);
                  } catch {
                    Alert.alert('Erreur', 'Impossible de bannir cet utilisateur.');
                  }
                },
              },
            ]
          );
        },
      },
    ]);
  }, [liveId, addSysMsg]);

  // ── Contrôles caméra/micro
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput(''); setShowInput(false); setSending(true);
    // Affichage local immédiat
    const localMsg = {
      id: `local-${Date.now()}`,
      user: currentUser?.display_name ?? currentUser?.username ?? 'Moi',
      avatar: currentUser?.avatar_url ?? null,
      text,
    };
    setMessages(prev => [...prev.slice(-149), localMsg]);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
    try { await apiClient.post(Endpoints.social.comments, { body: text, live_id: liveId }); }
    catch {}
    finally { setSending(false); }
  }, [chatInput, sending, liveId, currentUser]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    setMuted(next);
    try {
      const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
      const track  = micPub?.track;
      if (track) {
        // mute/unmute sur la track existante — ne ferme pas la peer connection
        next ? await track.mute() : await track.unmute();
      } else {
        // Pas encore de track — activer le micro
        await localParticipant.setMicrophoneEnabled(true);
      }
    } catch (e) {
      if (__DEV__) console.warn('[toggleMute]', e);
      setMuted(!next);
    }
  }, [muted, localParticipant]);

  const toggleVideo = useCallback(async () => {
    const next = !videoOff;
    setVideoOff(next);
    try {
      const camPub = localParticipant.getTrackPublication(Track.Source.Camera);
      const track  = camPub?.track;
      if (track) {
        // mute/unmute sur la track existante — ne ferme pas la peer connection
        next ? await track.mute() : await track.unmute();
      } else {
        // Pas encore de track — activer la caméra
        await localParticipant.setCameraEnabled(true);
      }
    } catch (e) {
      if (__DEV__) console.warn('[toggleVideo]', e);
      setVideoOff(!next);
    }
  }, [videoOff, localParticipant]);

  const flipCam = useCallback(async () => {
    const next = !camFront;
    setCamFront(next);
    try {
      // Sur React Native, facingMode ne fonctionne pas — on passe par deviceId
      const devices: { deviceId: string; label: string }[] = await (room as any).getLocalDevices?.('videoinput')
        ?? await Room.getLocalDevices('videoinput').catch(() => []);

      // Trouver la caméra correspondant au côté voulu
      const keyword = next ? 'front' : 'back';
      const match   = devices.find(d =>
        d.label.toLowerCase().includes(keyword) ||
        d.label.toLowerCase().includes(next ? 'facing front' : 'facing back'),
      ) ?? devices.find(d => d.deviceId !== room.getActiveDevice('videoinput'));

      if (match) {
        await room.switchActiveDevice('videoinput', match.deviceId);
      } else {
        // Fallback : restart track avec facingMode (marche sur iOS)
        const camPub = localParticipant.getTrackPublication(Track.Source.Camera);
        const track  = camPub?.track as any;
        if (track?.restartTrack) {
          await track.restartTrack({ facingMode: next ? 'user' : 'environment' });
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[flipCam]', e);
      setCamFront(!next);
    }
  }, [camFront, localParticipant, room]);

  const handleReact = useCallback((emoji: string) => {
    if (reactionThrottle.current) return;
    reactionThrottle.current = setTimeout(() => { reactionThrottle.current = null; }, 500);
    try { apiClient.post(Endpoints.lives.react(liveId), { emoji }); } catch {}
  }, [liveId]);

  const askEnd = useCallback(() => {
    Alert.alert('Terminer le live ?', 'Tous les viewers seront déconnectés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Terminer', style: 'destructive', onPress: onEnd },
    ]);
  }, [onEnd]);

  const fmt         = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const viewerCount = remoteParticipants.length;
  const pendingCount = handRequests.length;

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── VIDEO PLEIN ÉCRAN ────────────────────────────────────────── */}
      <HostVideoView
        mirror={camFront}
        liveId={liveId}
        hostName={currentUser?.display_name ?? currentUser?.username ?? 'Toi'}
        hostAvatarUrl={currentUser?.avatar_url}
        onStage={onStage}
        onGift={(id, name) => giftRef.current?.openGift(id, name)}
        onDemote={handleDemote}
        onBan={handleBan}
        isMuted={muted}
        isVideoOff={videoOff}
      />

      {/* ── GRADIENTS ─────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['rgba(5,0,16,0.82)', 'rgba(5,0,16,0.18)', 'transparent']}
        style={st.gradTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(5,0,16,0.55)', 'rgba(5,0,16,0.88)']}
        style={st.gradBottom}
        pointerEvents="none"
      />

      {/* ── EMOJIS FLOTTANTS ─────────────────────────────────────────── */}
      <ReactionFloaters floaters={floaters} />

      {/* ── BANNER LANCEMENT ─────────────────────────────────────────── */}
      {showLaunchBanner && (
        <Animated.View
          entering={FadeIn.springify().damping(16).stiffness(180)}
          exiting={FadeOut.duration(400)}
          style={st.launchBanner}
          pointerEvents="none"
        >
          <View style={st.launchDot} />
          <Text style={st.launchTxt}>Tu es en direct !</Text>
        </Animated.View>
      )}

      {/* ── TOASTS arrivées ──────────────────────────────────────────── */}
      <View style={st.toastsContainer} pointerEvents="none">
        {joinToasts.map(t => <JoinToast key={t.id} name={t.name} />)}
      </View>

      {/* ── PARLEUR ACTIF ────────────────────────────────────────────── */}
      {activeSpeaker && (
        <View style={st.activeSpeakerWrap} pointerEvents="none">
          <ActiveSpeakerToast
            key={activeSpeaker.identity}
            name={activeSpeaker.name}
            avatarUrl={activeSpeaker.avatarUrl}
            isLocal={activeSpeaker.isLocal}
          />
        </View>
      )}

      {/* ── GIFT TICKER (gauche, au dessus du chat) ───────────────────── */}
      {giftTicker.length > 0 && (
        <View style={st.giftTickerZone} pointerEvents="none">
          {giftTicker.map(t => (
            <Animated.View key={t.id} entering={FadeIn.duration(300)} exiting={FadeOut.duration(400)} style={st.giftTickerRow}>
              <LinearGradient colors={['#F0365A', '#9B65F5']} style={st.giftTickerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={st.giftTickerEmoji}>{t.emoji}</Text>
                <Text style={st.giftTickerText} numberOfLines={1}>
                  <Text style={st.giftTickerSender}>{t.senderName}</Text>
                  {' · '}{t.giftName}
                </Text>
                <Text style={st.giftTickerCoins}>{t.coins} 🪙</Text>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── HEADER ────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <View style={st.header}>
        {/* Gauche : bouton fermer */}
        <TouchableOpacity onPress={askEnd} style={st.closeBtn} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Centre : LIVE pill + timer + badge abonnés */}
        <View style={st.headerCenter}>
          <View style={st.livePill}>
            <View style={st.liveDot} />
            <Text style={st.liveText}>LIVE</Text>
            <Text style={st.timerText}>{fmt(elapsed)}</Text>
          </View>
          {isPrivate && (
            <View style={st.privatePill}>
              <MCIcon name="lock-outline" size={9} color="#fff" />
              <Text style={st.privateText}>Abonnés</Text>
            </View>
          )}
        </View>

        {/* Droite : viewers + avatars */}
        <View style={st.headerRight}>
          <View style={st.viewerPill}>
            <Icon name="eye" size={11} color="rgba(255,255,255,0.8)" />
            <Text style={st.viewerCount}>{viewerCount}</Text>
          </View>
          {remoteParticipants.slice(0, 4).map((p, i) => (
            <TouchableOpacity
              key={p.identity}
              style={[st.viewerAvatar, { marginLeft: i === 0 ? 4 : -7, zIndex: 10 - i }]}
              onPress={() => giftRef.current?.openGift(p.identity, p.name || p.identity || '?')}
              activeOpacity={0.75}
            >
              <Text style={st.viewerAvatarText}>{(p.name || p.identity || '?')[0].toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
          {viewerCount > 4 && (
            <View style={[st.viewerAvatar, { marginLeft: -7, backgroundColor: 'rgba(255,255,255,0.22)' }]}>
              <Text style={[st.viewerAvatarText, { fontSize: 8 }]}>+{viewerCount - 4}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── COLONNE DROITE — 5 actions host ─────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <View style={st.sideCol}>

        {/* Flip caméra */}
        <TouchableOpacity
          style={[st.sideItem, videoOff && { opacity: 0.38 }]}
          onPress={videoOff ? undefined : flipCam}
          activeOpacity={0.8}
        >
          <View style={st.sideCircle}>
            <Icon name="refresh-cw" size={22} color="#fff" />
          </View>
          <Text style={st.sideLabel}>Retourner</Text>
        </TouchableOpacity>

        {/* Micro */}
        <TouchableOpacity style={st.sideItem} onPress={toggleMute} activeOpacity={0.8}>
          <View style={[st.sideCircle, muted && st.sideCircleOff]}>
            <Icon name={muted ? 'mic-off' : 'mic'} size={22} color={muted ? '#F0365A' : '#fff'} />
          </View>
          <Text style={[st.sideLabel, muted && { color: '#F0365A' }]}>{muted ? 'Micro off' : 'Micro'}</Text>
        </TouchableOpacity>

        {/* Caméra */}
        <TouchableOpacity style={st.sideItem} onPress={toggleVideo} activeOpacity={0.8}>
          <View style={[st.sideCircle, videoOff && st.sideCircleOff]}>
            <Icon name={videoOff ? 'video-off' : 'video'} size={22} color={videoOff ? '#F0365A' : '#fff'} />
          </View>
          <Text style={[st.sideLabel, videoOff && { color: '#F0365A' }]}>{videoOff ? 'Cam off' : 'Cam'}</Text>
        </TouchableOpacity>

        {/* Réactions */}
        <View style={[st.sideItem, { zIndex: 30, overflow: 'visible' }]}>
          <View style={st.sideCircle}>
            <LiveReactionPicker onReact={(emoji) => { spawn(emoji); handleReact(emoji); }} />
          </View>
          <Text style={st.sideLabel}>Réagir</Text>
        </View>

        {/* Paramètres — badge si demandes en attente */}
        <TouchableOpacity style={st.sideItem} onPress={() => setShowSettings(true)} activeOpacity={0.8}>
          <View style={[st.sideCircle, st.sideCircleSettings]}>
            <Icon name="settings" size={22} color="#9B65F5" />
            {pendingCount > 0 && (
              <View style={st.sideBadge}>
                <Text style={st.sideBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </View>
          <Text style={[st.sideLabel, { color: '#9B65F5' }]}>
            {pendingCount > 0 ? `${pendingCount} main${pendingCount > 1 ? 's' : ''}` : 'Paramètres'}
          </Text>
        </TouchableOpacity>

        {/* Cadeaux reçus (affiché uniquement si > 0) */}
        {giftHistory.length > 0 && (
          <TouchableOpacity style={st.sideItem} onPress={() => setShowGifts(v => !v)} activeOpacity={0.8}>
            <View style={[st.sideCircle, { backgroundColor: 'rgba(255,215,0,0.14)', borderColor: 'rgba(255,215,0,0.4)' }]}>
              <Icon name="gift" size={22} color="#FFD700" />
              <View style={[st.sideBadge, { backgroundColor: '#FFD700' }]}>
                <Text style={[st.sideBadgeText, { color: '#000' }]}>{giftHistory.length}</Text>
              </View>
            </View>
            <Text style={[st.sideLabel, { color: '#FFD700' }]}>Cadeaux</Text>
          </TouchableOpacity>
        )}

        {/* Scène (affiché uniquement si invités présents) */}
        {onStage.size > 0 && (
          <TouchableOpacity style={st.sideItem} onPress={() => { setShowOnStage(v => !v); setShowRequests(false); }} activeOpacity={0.8}>
            <View style={[st.sideCircle, { backgroundColor: 'rgba(63,237,182,0.12)', borderColor: 'rgba(63,237,182,0.4)' }]}>
              <Icon name="users" size={22} color="#3FEDB6" />
              <View style={[st.sideBadge, { backgroundColor: '#3FEDB6' }]}>
                <Text style={[st.sideBadgeText, { color: '#000' }]}>{onStage.size}</Text>
              </View>
            </View>
            <Text style={[st.sideLabel, { color: '#3FEDB6' }]}>Scène</Text>
          </TouchableOpacity>
        )}

        {/* Like count */}
        <LiveLikeButton ref={likeRef} total={likeCount} onLike={() => {}} />
      </View>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── ZONE BAS — chat + barre saisie ────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <View style={st.bottomZone}>
        {/* Messages */}
        <FlatList
          ref={chatRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => {
            if (item.isJoin || item.isSys) {
              return (
                <Animated.View entering={FadeIn.duration(200)} style={st.sysRow}>
                  <Text style={st.sysText}>{item.text}</Text>
                </Animated.View>
              );
            }
            if (item.isGift) {
              return (
                <Animated.View entering={FadeIn.duration(200)} style={st.giftMsg}>
                  <Text style={st.giftMsgText}>{item.text}</Text>
                </Animated.View>
              );
            }
            const myId   = currentUser?.id ? String(currentUser.id) : null;
            const canMod = !!item.userId && item.userId !== myId;
            return (
              <Animated.View entering={FadeIn.duration(200)} style={st.chatRow}>
                {item.avatar
                  ? <Image source={{ uri: item.avatar }} style={st.chatAvatar} />
                  : <Av name={item.user} size={26} />
                }
                <View style={{ flex: 1 }}>
                  <View style={st.chatBubble}>
                    <Text style={st.chatUser}>{item.user} </Text>
                    <Text style={st.chatText}>{item.text}</Text>
                  </View>
                  {canMod && (
                    <View style={st.modRow}>
                      <TouchableOpacity
                        style={st.modBtn}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        onPress={async () => {
                          setMessages(prev => prev.filter(m => m.id !== item.id));
                          try { await apiClient.delete(Endpoints.social.commentById(item.id)); } catch {}
                        }}
                      >
                        <Icon name="trash-2" size={11} color="#F0365A" />
                        <Text style={st.modBtnText}>Supprimer</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={st.modBtn}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        onPress={() => {
                          Alert.alert(item.user, 'Choisir une action', [
                            { text: 'Annuler', style: 'cancel' },
                            {
                              text: 'Exclure du live',
                              onPress: async () => {
                                try { await apiClient.post(Endpoints.lives.ban(liveId, item.userId!)); }
                                catch { Alert.alert('Erreur', 'Impossible d\'exclure.'); }
                              },
                            },
                            {
                              text: 'Bannir définitivement', style: 'destructive',
                              onPress: async () => {
                                try { await apiClient.post(Endpoints.lives.globalBan(liveId, item.userId!)); }
                                catch { Alert.alert('Erreur', 'Impossible de bannir.'); }
                              },
                            },
                          ]);
                        }}
                      >
                        <Icon name="slash" size={11} color="#F0365A" />
                        <Text style={st.modBtnText}>Bannir</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          }}
          style={st.chatList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingTop: 6 }}
        />

        {/* Barre saisie */}
        <View style={st.inputBar}>
          {showInput ? (
            <View style={st.inputRow}>
              <TextInput
                value={chatInput} onChangeText={setChatInput}
                placeholder="Écris un message..." placeholderTextColor="rgba(255,255,255,0.38)"
                style={st.chatInput} onSubmitEditing={sendChat} returnKeyType="send"
                autoFocus onBlur={() => { if (!chatInput.trim()) setShowInput(false); }}
              />
              {chatInput.trim().length > 0 && (
                <TouchableOpacity onPress={sendChat} style={st.sendBtn} disabled={sending}>
                  <Icon name="send" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={st.chatPill} onPress={() => setShowInput(true)} activeOpacity={0.8}>
              <Icon name="message-circle" size={15} color="rgba(255,255,255,0.5)" />
              <Text style={st.chatPillText}>Commenter...</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── PANELS latéraux ──────────────────────────────────────────── */}

      {showRequests && (
        <HandRequestsPanel
          requests={handRequests}
          onAccept={handleAccept}
          onRefuse={handleRefuse}
          onClose={() => setShowRequests(false)}
        />
      )}

      {showGifts && giftHistory.length > 0 && (
        <Animated.View entering={SlideInRight.duration(260)} exiting={SlideOutRight.duration(200)} style={os.panel}>
          <View style={os.header}>
            <Text style={os.title}>Cadeaux ({giftHistory.length})</Text>
            <Text style={[os.title, { color: '#FFD700', fontSize: 12 }]}>
              {giftHistory.reduce((s, t) => s + t.coins, 0)} 🪙 total
            </Text>
            <TouchableOpacity onPress={() => setShowGifts(false)} style={os.closeBtn}>
              <Icon name="x" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12, gap: 10 }}>
            {giftHistory.slice(0, 20).map((t, i) => (
              <View key={`${t.id}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 24 }}>{t.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{t.senderName}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{t.giftName}</Text>
                </View>
                <Text style={{ color: '#FFD700', fontSize: 13, fontWeight: '800' }}>{t.coins} 🪙</Text>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {showOnStage && onStage.size > 0 && (
        <Animated.View entering={SlideInRight.duration(260)} exiting={SlideOutRight.duration(200)} style={os.panel}>
          <View style={os.header}>
            <Text style={os.title}>Sur scène ({onStage.size})</Text>
            <TouchableOpacity onPress={() => setShowOnStage(false)} style={os.closeBtn}>
              <Icon name="x" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {Array.from(onStage).map(identity => {
              const p    = remoteParticipants.find(rp => rp.identity === identity);
              const name = p?.name || identity;
              return (
                <View key={identity} style={os.row}>
                  <Av name={name} size={36} color="#3FEDB6" />
                  <Text style={os.name} numberOfLines={1}>{name}</Text>
                  <TouchableOpacity style={os.demoteBtn} onPress={() => handleDemote(identity, name)} activeOpacity={0.8}>
                    <Icon name="arrow-down" size={12} color="#fff" />
                    <Text style={os.demoteText}>Descendre</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={os.banBtn} onPress={() => handleBan(identity, name)} activeOpacity={0.8}>
                    <Icon name="slash" size={13} color="#F0365A" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}

      {/* ── OVERLAYS ─────────────────────────────────────────────────── */}
      <LiveGiftOverlay
        ref={giftRef}
        liveId={liveId}
        incomingNotifs={giftNotifs}
        onNotifShown={(id) => setGiftNotifs(prev => prev.filter(n => n.id !== id))}
      />

      <BoostPrompt
        visible={showBoost}
        contentType="live"
        onBoost={() => { setShowBoost(false); nav.navigate('CreateAd', { ad: null }); }}
        onDismiss={() => setShowBoost(false)}
      />

      <LiveSettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        live={liveData}
        liveId={liveId}
        camOn={!videoOff}
        micOn={!muted}
        onToggleCam={toggleVideo}
        onToggleMic={toggleMute}
        handRequests={handRequests.map(r => ({ identity: r.identity, name: r.displayName, avatar: r.avatarUrl }))}
        onInvite={(identity) => {
          const req = handRequests.find(r => r.identity === identity);
          if (req) handleAccept(req);
        }}
        onDismissHand={handleRefuse}
        onStopLive={onEnd}
        onMonetizationUpdated={(updated) => setLiveData(prev => prev ? { ...prev, ...updated } : prev)}
      />
    </View>
  );
};

// ── Page principale ────────────────────────────────────────────────────────────

export const SimpleLiveStreamScreen: React.FC = () => {
  const nav   = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { liveId, publisherToken: initialToken, livekitUrl: initialUrl, isPrivate = false } = route.params;

  const [token,  setToken]  = useState<string | null>(initialToken ?? null);
  const [wsUrl,  setWsUrl]  = useState<string | null>(initialUrl  ?? null);
  const [loadingToken, setLoadingToken] = useState(!initialToken || !initialUrl);

  // Si on revient sur ce screen sans token (ex: retour depuis la liste), on le récupère
  useEffect(() => {
    if (token && wsUrl) { setLoadingToken(false); return; }
    liveService.getToken(liveId)
      .then(t => { setToken(t.token); setWsUrl(t.livekit_url); })
      .catch(() => nav.goBack())
      .finally(() => setLoadingToken(false));
  }, [liveId]);

  const endedRef = useRef(false);

  const handleEnd = useCallback(async () => {
    endedRef.current = true;
    try { await liveService.stopLive(liveId); } catch {}
    nav.goBack();
  }, [liveId, nav]);

  useEffect(() => {
    return () => {
      if (!endedRef.current) {
        liveService.stopLive(liveId).catch(() => {});
      }
    };
  }, [liveId]);

  if (loadingToken || !token || !wsUrl) {
    return (
      <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#F0365A" />
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect roomOptions={CREATOR_ROOM_OPTIONS}>
      <StreamContent liveId={liveId} onEnd={handleEnd} isPrivate={isPrivate} />
    </LiveKitRoom>
  );
};

// ── Styles HandRequestsPanel ──────────────────────────────────────────────────

const hr = StyleSheet.create({
  panel: {
    position: 'absolute', top: Platform.OS === 'ios' ? 110 : 90,
    right: 0, width: 230, maxHeight: 320,
    backgroundColor: 'rgba(18,18,30,0.96)',
    borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
    borderWidth: 1, borderRightWidth: 0,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 50,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title:      { color: '#fff', fontSize: 13, fontWeight: '800' },
  closeBtn:   { padding: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatar:    { width: 38, height: 38, borderRadius: 19 },
  name:      { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4ade80', borderRadius: 12,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  acceptText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  refuseBtn:  {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  empty:     { padding: 20, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
});

// ── Styles HostVideoView ──────────────────────────────────────────────────────

const mv = StyleSheet.create({
  noVideo:      { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111', gap: 12 },
  noVideoText:  { color: '#888', fontSize: 13 },
  noVideoBg:    { justifyContent: 'center', alignItems: 'center', backgroundColor: '#0e0e0e', gap: 12 },
  // Fond quand caméra désactivée — style TikTok
  noCamBg:      { justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a12', gap: 14 },
  noCamAvatar:  { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#F0365A' },
  noCamName:    { color: '#fff', fontSize: 18, fontWeight: '800' },
  noCamMicRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  noCamMicText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  noCamBadgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 16 },
  noCamBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  noCamBadgeOff: { backgroundColor: 'rgba(240,54,90,0.15)' },
  noCamBadgeText:{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  spotName:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  pip: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 190 : 170, right: 12,
    width: 78, height: 116, borderRadius: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', zIndex: 15,
  },
  pipGrad:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, justifyContent: 'flex-end', paddingBottom: 4 },
  pipLabel: { color: '#fff', fontSize: 9, textAlign: 'center' },
  thumbsCol:{ position: 'absolute', bottom: Platform.OS === 'ios' ? 190 : 170, left: 12, zIndex: 15, gap: 8 },
  thumb: {
    width: 78, height: 116, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  thumbOnStage: { borderColor: '#4ade80', borderWidth: 2 },
  thumbNoCam:   { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', flex: 1 },
  thumbGrad:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, justifyContent: 'flex-end', paddingBottom: 4 },
  thumbLabel:   { color: '#fff', fontSize: 9, textAlign: 'center', paddingHorizontal: 2 },
  thumbStageDot:{
    position: 'absolute', top: 4, left: 4,
    backgroundColor: '#4ade80', borderRadius: 8, padding: 2,
  },
  thumbGiftBtn:  { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 },
  thumbSpeaking: { borderColor: '#3FEDB6', borderWidth: 2.5 },
  thumbSpeakDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3FEDB6' },
  pipSpeakDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F0365A' },
});

// ── Styles page ───────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#050010' },
  gradTop:    { position: 'absolute', top: 0,    left: 0, right: 0, height: 200, zIndex: 5 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 280, zIndex: 5 },

  // ── Header ────────────────────────────────────────────────────────────────────
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 14, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    zIndex: 10,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerRight:  { flexDirection: 'row', alignItems: 'center' },

  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F0365A', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 5,
    shadowColor: '#F0365A', shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText:  { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  timerText: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '600' },

  privatePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(155,101,245,0.75)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 4,
  },
  privateText: { color: '#fff', fontWeight: '700', fontSize: 10 },

  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12,
    paddingHorizontal: 7, paddingVertical: 4, marginRight: 4,
  },
  viewerCount:     { color: '#fff', fontSize: 11, fontWeight: '700' },
  viewerAvatar:    { width: 26, height: 26, borderRadius: 13, backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#050010' },
  viewerAvatarText:{ color: '#fff', fontSize: 9, fontWeight: '800' },

  // ── Launch banner ─────────────────────────────────────────────────────────────
  launchBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 112 : 88,
    left: 20, right: 20, zIndex: 99,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F0365A',
    borderRadius: 14, paddingVertical: 11, paddingHorizontal: 16,
    shadowColor: '#F0365A', shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  launchDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#fff' },
  launchTxt: { color: '#fff', fontSize: 14, fontWeight: '800', flex: 1 },

  // ── Toasts ────────────────────────────────────────────────────────────────────
  toastsContainer:   { position: 'absolute', top: Platform.OS === 'ios' ? 116 : 92, left: 14, zIndex: 30, gap: 4 },
  activeSpeakerWrap: { position: 'absolute', bottom: Platform.OS === 'ios' ? 210 : 190, left: 14, zIndex: 25 },
  joinToast: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(5,0,16,0.7)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  joinToastText: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },

  // ── Gift ticker ───────────────────────────────────────────────────────────────
  giftTickerZone: {
    position: 'absolute', left: 12, right: 90,
    bottom: Platform.OS === 'ios' ? 170 : 150,
    zIndex: 22, gap: 6,
  },
  giftTickerRow:  { borderRadius: 20, overflow: 'hidden', alignSelf: 'flex-start', maxWidth: 240 },
  giftTickerGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  giftTickerEmoji:  { fontSize: 16 },
  giftTickerText:   { flex: 1, color: '#fff', fontSize: 12 },
  giftTickerSender: { fontWeight: '800' },
  giftTickerCoins:  { color: '#fff', fontSize: 11, fontWeight: '700' },

  // ── Colonne droite ────────────────────────────────────────────────────────────
  sideCol: {
    position: 'absolute', right: 10,
    bottom: Platform.OS === 'ios' ? 100 : 78,
    alignItems: 'center', gap: 16, zIndex: 20, overflow: 'visible',
  },
  sideItem:   { alignItems: 'center', gap: 4 },
  sideCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  sideCircleOff:      { borderColor: '#F0365A', backgroundColor: 'rgba(240,54,90,0.15)' },
  sideCircleSettings: { borderColor: 'rgba(155,101,245,0.5)', backgroundColor: 'rgba(155,101,245,0.12)' },
  sideLabel:   { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  sideBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#F0365A',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#050010',
  },
  sideBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  // kept for hand-requests panel (hr.panel uses st.badge/badgeText indirectly — safe to keep)
  badge:     { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#050010' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // kept for compatibility
  sideBtnCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  sideBtnLabel:  { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '600' },

  // ── Zone bas (chat + input) ───────────────────────────────────────────────────
  bottomZone: {
    position: 'absolute', bottom: 0, left: 0, right: 76,
    paddingBottom: Platform.OS === 'ios' ? 38 : 22,
    paddingHorizontal: 12, zIndex: 20,
  },
  chatList: { maxHeight: 230, marginBottom: 8 },
  chatRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 6 },
  chatAvatar: { width: 26, height: 26, borderRadius: 13, marginTop: 2 },
  chatBubble: {
    backgroundColor: 'rgba(5,0,16,0.55)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
    flexDirection: 'row', flexWrap: 'wrap', maxWidth: 210,
  },
  chatUser:    { color: '#F0365A', fontSize: 12, fontWeight: '800' },
  chatText:    { color: '#fff', fontSize: 13, flexShrink: 1 },
  sysRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  sysText:     { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  giftMsg:     { backgroundColor: 'rgba(255,215,0,0.16)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4, alignSelf: 'flex-start' },
  giftMsgText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },

  inputBar: { paddingTop: 4 },
  chatPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 26, paddingHorizontal: 16, paddingVertical: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'stretch',
  },
  chatPillText: { color: 'rgba(255,255,255,0.45)', fontSize: 14, flex: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 26, paddingLeft: 16, paddingRight: 4, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  chatInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 8 },
  sendBtn:   {
    backgroundColor: '#F0365A', borderRadius: 22, padding: 9, margin: 3,
    shadowColor: '#F0365A', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },

  modRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, paddingLeft: 2 },
  modBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(240,54,90,0.12)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  modBtnText: { color: '#F0365A', fontSize: 10, fontWeight: '700' as const },

  // unused but kept to avoid breaking anything
  settingsBtn:       { marginRight: 6 },
  settingsBtnCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(155,101,245,0.35)', borderWidth: 1, borderColor: 'rgba(155,101,245,0.6)', alignItems: 'center', justifyContent: 'center' },
});

// ── Styles panel "Sur scène" ──────────────────────────────────────────────────

const os = StyleSheet.create({
  panel: {
    position: 'absolute', top: Platform.OS === 'ios' ? 110 : 90,
    right: 0, width: 230, maxHeight: 320,
    backgroundColor: 'rgba(18,18,30,0.96)',
    borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
    borderWidth: 1, borderRightWidth: 0,
    borderColor: 'rgba(74,222,128,0.3)',
    zIndex: 50, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  title:    { color: '#4ade80', fontSize: 13, fontWeight: '700' },
  closeBtn: { padding: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  name:      { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  demoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(240,54,90,0.2)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#F0365A',
  },
  demoteText: { color: '#F0365A', fontSize: 11, fontWeight: '700' },
  banBtn: {
    padding: 6, backgroundColor: 'rgba(240,54,90,0.12)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(240,54,90,0.3)',
  },
});

