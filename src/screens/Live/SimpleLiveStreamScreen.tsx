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
  useAnimatedStyle, useSharedValue, withRepeat, withTiming,
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
import { useKeepAwake } from '../../hooks/useKeepAwake';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { LiveGiftOverlay } from '../../components/wallet/LiveGiftOverlay';
import type { GiftNotif, LiveGiftOverlayRef } from '../../components/wallet/LiveGiftOverlay';
import { LiveLikeButton } from '../../components/live/LiveLikeButton';
import type { LiveLikeButtonRef } from '../../components/live/LiveLikeButton';
import { LiveReactionPicker, ReactionFloaters, useReactionFloaters } from '../../components/live/LiveReactionPicker';
import { useUser } from '../../context/UserContext';
import { BoostPrompt } from '../../components/common';
import { LiveSettingsSheet } from '../../components/live/LiveSettingsSheet';
import { StageTileRow } from '../../components/live/StageTileRow';
import type { StageTile, StageBadge } from '../../components/live/StageTileRow';
import { LiveMoreMenu } from '../../components/live/LiveMoreMenu';
import { LiveParticipantsModal } from '../../components/live/LiveParticipantsModal';
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
  GoGold:      number;
}

// ── Avatar fallback ───────────────────────────────────────────────────────────

const Av: React.FC<{ name: string; size: number; color?: string }> = ({ name, size, color = '#F0365A' }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{(name || '?')[0].toUpperCase()}</Text>
  </View>
);

const PulsingLiveDot: React.FC = () => {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.3, { duration: 650 }), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[st.liveIndicator, animStyle]} />;
};

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
        {/* Avatar avec badge caméra barré */}
        <View style={mv.noCamAvatarWrap}>
          {hostAvatarUrl
            ? <Image source={{ uri: hostAvatarUrl }} style={mv.noCamAvatar} />
            : <Av name={hostName} size={100} />
          }
          {/* Badge rouge caméra coupée — positionné en bas-droite de l'avatar */}
          <View style={mv.noCamCamBadge}>
            <Icon name="video-off" size={14} color="#fff" />
          </View>
        </View>

        <Text style={mv.noCamName}>{hostName}</Text>

        {/* Pill "Caméra coupée" bien visible */}
        <View style={mv.noCamCamPill}>
          <Icon name="video-off" size={15} color="#F0365A" />
          <Text style={mv.noCamCamPillText}>Caméra désactivée</Text>
        </View>

        {/* Badge micro */}
        <View style={mv.noCamBadgeRow}>
          <View style={[mv.noCamBadge, isMuted && mv.noCamBadgeOff]}>
            <Icon name={isMuted ? 'mic-off' : 'mic'} size={13} color={isMuted ? '#F0365A' : 'rgba(255,255,255,0.9)'} />
            <Text style={[mv.noCamBadgeText, isMuted && { color: '#F0365A' }]}>
              {isMuted ? 'Micro coupé' : 'Micro actif'}
            </Text>
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

      {/* Bandeau "Sur scène" — toi (hôte) en premier, puis invités, tuiles vidéo réelles.
          Plus de PiP flottant séparé : quand un viewer est spotlighté, ta propre tuile
          dans le bandeau reste l'unique endroit où tu apparais (avatar si caméra off,
          flux vidéo sinon), évitant toute superposition avec le spotlight. */}
      <View style={mv.stageRowWrap} pointerEvents="box-none">
        <StageTileRow
          tiles={[
            {
              identity: localParticipant.identity || 'host',
              name:     'Toi',
              track:    localTrack,
              camOn:    localCamOn && !isVideoOff,
              mirror,
              badge:    'host' as StageBadge,
              micOn:    !isMuted,
              isSpeaking: localSpeaking,
            },
            ...thumbnailTracks.filter(t => !t.participant.isLocal).map(t => ({
              identity: t.participant.identity,
              name:     t.participant.name || t.participant.identity,
              track:    t,
              camOn:    !t.publication?.isMuted,
              badge:    (onStage.has(t.participant.identity) ? 'bolt' : 'star') as StageBadge,
              micOn:    !t.publication?.isMuted,
              isSpeaking: isSpeaking(t.participant.identity),
            } satisfies StageTile)),
          ]}
          onTapTile={(identity) => setSpotlightId(identity === localParticipant.identity ? null : identity)}
          onLongPressTile={(identity) => {
            if (identity === localParticipant.identity) return;
            const t = thumbnailTracks.find(rt => rt.participant.identity === identity);
            const tName = t?.participant.name || identity;
            const isOnStage = onStage.has(identity);
            Alert.alert(tName, 'Que veux-tu faire ?', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Envoyer un cadeau', onPress: () => onGift(identity, tName) },
              ...(isOnStage ? [{ text: 'Faire descendre', onPress: () => onDemote(identity, tName) }] : []),
              { text: 'Bannir...', style: 'destructive' as const, onPress: () => onBan(identity, tName) },
            ]);
          }}
        />
      </View>
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
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const room                 = useRoomContext();
  const allParticipants      = useParticipants();
  const { currentUser }      = useUser();
  const nav                  = useNavigation<Nav>();
  const remoteParticipants   = allParticipants.filter(p => !p.isLocal);

  const [videoOff,     setVideoOff]     = useState(false); // used only to optimistically flip icon; real truth = isCameraEnabled
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
  const [showMoreMenu,   setShowMoreMenu]   = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
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

  // Démarrer cam + mic
  useEffect(() => {
    localParticipant.setCameraEnabled(true).catch(() => {});
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    const bannerTimer = setTimeout(() => setShowLaunchBanner(false), 4000);
    const boostTimer  = setTimeout(() => setShowBoost(true), 5500);

    // Couper la caméra en background pour éviter le crash Android
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        localParticipant.setCameraEnabled(false).catch(() => {});
      } else if (next === 'active') {
        if (!videoOff) localParticipant.setCameraEnabled(true).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      clearTimeout(bannerTimer);
      clearTimeout(boostTimer);
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
    if (!liveId) { if (__DEV__) console.warn('[host WS] liveId manquant, WS non ouvert'); return; }
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken) { if (__DEV__) console.warn('[host WS] accessToken manquant, WS non ouvert'); return; }
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_BASE_URL}/api/v1/social/comments/ws/live/${liveId}?token=${accessToken}`);
      if (__DEV__) console.warn('[host WS] connexion ouverte vers', liveId);
    } catch (e) { if (__DEV__) console.warn('[host WS] échec création WebSocket', e); return; }
    wsRef.current = ws;
    ws.onopen  = () => { if (__DEV__) console.warn('[host WS] onopen — connecté'); };
    ws.onerror = (e) => { if (__DEV__) console.warn('[host WS] onerror', e); };
    ws.onclose = (e) => { if (__DEV__) console.warn('[host WS] onclose', e.code, e.reason); };

    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (__DEV__) console.warn('[host WS] message reçu', d.type);

        // ── Messages chat en temps réel
        if (d.type === 'comment_added' && d.comment && String(d.comment.body ?? '').trim()) {
          const c = d.comment;
          const incomingText   = c.body;
          const incomingUser   = c.author?.display_name ?? c.author?.username ?? 'Anonyme';
          setMessages(prev => {
            // Remplacer le message optimiste local (même texte + même user) au lieu d'ajouter
            const localIdx = prev.findIndex(
              m => m.id.startsWith('local-') && m.text === incomingText && m.user === incomingUser,
            );
            if (localIdx !== -1) {
              // Garder l'id local pour ne pas changer la key React (évite un remount + re-fade visuel)
              const next = [...prev];
              next[localIdx] = { ...next[localIdx] };
              return next;
            }
            const incoming = {
              id:     c.id ?? String(Date.now()),
              user:   incomingUser,
              userId: c.author?.id ? String(c.author.id) : undefined,
              avatar: c.author?.avatar_url ?? null,
              text:   incomingText,
            };
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
            GoGold:      gf.gogold_spent ?? 0,
          };
          setGiftNotifs(prev => [...prev, {
            id: tick.id, senderName: sn,
            emoji: tick.emoji, giftName: tick.giftName, GoGold: tick.GoGold,
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

        // ── Demande de montée sur scène (main levée)
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
      } catch {}
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
    }, 25_000);
    return () => { clearInterval(ping); try { ws.close(); } catch {} };
  }, [liveId, addSysMsg]);

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
    // Source de vérité : état LiveKit, pas l'état local
    const next = !isMicrophoneEnabled;
    try {
      await localParticipant.setMicrophoneEnabled(next);
    } catch (e) {
      if (__DEV__) console.warn('[toggleMute]', e);
    }
  }, [isMicrophoneEnabled, localParticipant]);

  const toggleVideo = useCallback(async () => {
    const next = !isCameraEnabled;
    setVideoOff(!next);
    try {
      await localParticipant.setCameraEnabled(next);
    } catch (e) {
      if (__DEV__) console.warn('[toggleVideo]', e);
      setVideoOff(!!isCameraEnabled);
    }
  }, [isCameraEnabled, localParticipant]);

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
        isMuted={!isMicrophoneEnabled}
        isVideoOff={!isCameraEnabled}
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
                <Text style={st.giftTickerGoGold}>{t.GoGold} 🪙</Text>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── HEADER ────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <View style={st.header}>
        {/* Bouton fermer */}
        <TouchableOpacity onPress={askEnd} style={st.closeBtn} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={18} color="#fff" />
        </TouchableOpacity>

        {/* Host info : avatar (point live pulsant) + nom + timer en dessous */}
        <View style={st.hostInfo}>
          <View style={st.hostAvatarWrap}>
            {currentUser?.avatar_url
              ? <Image source={{ uri: currentUser.avatar_url }} style={st.hostAvatar} />
              : <Av name={currentUser?.display_name ?? currentUser?.username ?? 'Toi'} size={28} color="#F0365A" />
            }
            <PulsingLiveDot />
          </View>
          <View style={st.hostMeta}>
            <Text style={st.hostName} numberOfLines={1}>{currentUser?.display_name ?? currentUser?.username ?? 'Toi'}</Text>
            <View style={st.hostTimerRow}>
              <Text style={st.liveTagText}>LIVE</Text>
              <Text style={st.timerText}>{fmt(elapsed)}</Text>
            </View>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* Participants — avatars des 3 derniers + total, tap = liste complète */}
        <TouchableOpacity style={st.participantsPill} onPress={() => setShowParticipants(true)} activeOpacity={0.75}>
          <View style={st.participantsStack}>
            {allParticipants.slice(-3).map((p, i) => (
              <View key={p.identity} style={[st.participantAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }]}>
                <Text style={st.participantAvatarText}>{(p.name || p.identity || '?')[0].toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <Text style={st.viewerCount}>{viewerCount}</Text>
        </TouchableOpacity>

        {/* Coeur — compact : nombre à gauche, icône à droite */}
        <View style={st.likeWrap}>
          <LiveLikeButton ref={likeRef} total={likeCount} onLike={() => {}} compact />
        </View>

        {/* Menu "..." — Paramètres / Copier le lien / Partager / Terminer le live */}
        <TouchableOpacity
          style={st.moreBtn}
          onPress={() => setShowMoreMenu(true)}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="more-vertical" size={17} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Pill secondaire (privé) — sous le header pour ne pas l'encombrer */}
      {isPrivate && (
        <View style={st.subPillsRow} pointerEvents="none">
          <View style={st.privatePill}>
            <MCIcon name="lock-outline" size={9} color="#fff" />
            <Text style={st.privateText}>Abonnés</Text>
          </View>
        </View>
      )}

      <LiveParticipantsModal
        visible={showParticipants}
        onClose={() => setShowParticipants(false)}
        participants={allParticipants.map(p => ({
          identity: p.identity,
          name:     p.name || p.identity,
          isHost:   p.isLocal,
        }))}
      />

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── COLONNE DROITE — 5 actions host ─────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <View style={st.sideCol}>

        {/* Demandes de scène (main levée) — affiché uniquement si des demandes sont en attente */}
        {pendingCount > 0 && (
          <TouchableOpacity style={st.sideItem} onPress={() => { setShowRequests(v => !v); setShowOnStage(false); }} activeOpacity={0.8}>
            <View style={[st.sideCircle, { backgroundColor: 'rgba(255,215,0,0.14)', borderColor: 'rgba(255,215,0,0.4)' }]}>
              <Text style={{ fontSize: 22 }}>✋</Text>
              <View style={[st.sideBadge, { backgroundColor: '#FFD700' }]}>
                <Text style={[st.sideBadgeText, { color: '#000' }]}>{pendingCount}</Text>
              </View>
            </View>
            <Text style={[st.sideLabel, { color: '#FFD700' }]}>Demandes</Text>
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
      </View>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── ZONE BAS — chat + barre saisie ────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <View style={st.bottomZone}>
        {/* Messages */}
        <FlatList
          ref={chatRef}
          onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: false })}
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

        {/* Barre saisie — emoji intégré à l'input, cam/micro séparés à droite */}
        <View style={st.inputBarRow}>
          <View style={st.inputBar}>
            {showInput ? (
              <View style={st.inputRow}>
                <TextInput
                  value={chatInput} onChangeText={setChatInput}
                  placeholder="Écris un message..." placeholderTextColor="rgba(255,255,255,0.38)"
                  style={st.chatInput} onSubmitEditing={sendChat} returnKeyType="send"
                  autoFocus onBlur={() => { if (!chatInput.trim()) setShowInput(false); }}
                />
                <View style={[st.inputEmojiWrap, { zIndex: 30, overflow: 'visible' }]}>
                  <LiveReactionPicker onReact={(emoji) => { spawn(emoji); handleReact(emoji); }} compact />
                </View>
                {chatInput.trim().length > 0 && (
                  <TouchableOpacity onPress={sendChat} style={st.sendBtn} disabled={sending}>
                    <Icon name="send" size={13} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity style={st.chatPill} onPress={() => setShowInput(true)} activeOpacity={0.8}>
                <Icon name="message-circle" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={st.chatPillText}>Commenter...</Text>
                <View style={[st.inputEmojiWrap, { zIndex: 30, overflow: 'visible' }]}>
                  <LiveReactionPicker onReact={(emoji) => { spawn(emoji); handleReact(emoji); }} compact />
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Toggles caméra / micro — séparés, à droite de l'input */}
          <TouchableOpacity style={st.quickToggleBtn} onPress={toggleVideo} activeOpacity={0.8}>
            <Icon name={isCameraEnabled ? 'video' : 'video-off'} size={14} color={isCameraEnabled ? '#fff' : '#F0365A'} />
          </TouchableOpacity>
          <TouchableOpacity style={st.quickToggleBtn} onPress={toggleMute} activeOpacity={0.8}>
            <Icon name={isMicrophoneEnabled ? 'mic' : 'mic-off'} size={14} color={isMicrophoneEnabled ? '#fff' : '#F0365A'} />
          </TouchableOpacity>
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
        camOn={isCameraEnabled}
        micOn={isMicrophoneEnabled}
        onToggleCam={toggleVideo}
        onToggleMic={toggleMute}
        onFlipCam={flipCam}
        handRequests={handRequests.map(r => ({ identity: r.identity, name: r.displayName, avatar: r.avatarUrl }))}
        onInvite={(identity) => {
          const req = handRequests.find(r => r.identity === identity);
          if (req) handleAccept(req);
        }}
        onDismissHand={handleRefuse}
        onStopLive={onEnd}
        onMonetizationUpdated={(updated) => setLiveData(prev => prev ? { ...prev, ...updated } : prev)}
      />

      <LiveMoreMenu
        visible={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        isHost
        liveId={liveId}
        onOpenSettings={() => setShowSettings(true)}
        onStopLive={askEnd}
      />
    </View>
  );
};

// ── Page principale ────────────────────────────────────────────────────────────

export const SimpleLiveStreamScreen: React.FC = () => {
  useKeepAwake();
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
  stageRowWrap: {
    position: 'absolute', left: 0, right: 0,
    top: Platform.OS === 'ios' ? 118 : 96,
    zIndex: 12, paddingHorizontal: 12,
  },
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
  noCamAvatarWrap: { position: 'relative' },
  noCamCamBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F0365A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0a0a12',
  },
  noCamCamPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(240,54,90,0.15)',
    borderRadius: 20, borderWidth: 1.5, borderColor: '#F0365A',
    paddingHorizontal: 14, paddingVertical: 7,
    marginBottom: 6,
  },
  noCamCamPillText: { color: '#F0365A', fontSize: 13, fontWeight: '700' },
  noCamBadgeText:{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  spotName:     { color: '#fff', fontSize: 16, fontWeight: '700' },
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
});

// ── Styles page ───────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#050010' },
  gradTop:    { position: 'absolute', top: 0,    left: 0, right: 0, height: 200, zIndex: 5 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 280, zIndex: 5 },

  // ── Header ────────────────────────────────────────────────────────────────────
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 32,
    paddingHorizontal: 10, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 20,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },

  hostInfo:      { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 96 },
  hostAvatarWrap:{ position: 'relative' },
  hostAvatar:    { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#F0365A' },
  liveIndicator: {
    position: 'absolute', bottom: -1, right: -1,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#F0365A', borderWidth: 1.5, borderColor: '#050010',
  },
  hostMeta:  { flexShrink: 1 },
  hostName:  { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  hostTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  liveTagText: { color: '#F0365A', fontWeight: '900', fontSize: 8, letterSpacing: 0.4 },
  timerText:   { color: 'rgba(255,255,255,0.7)', fontSize: 8, fontWeight: '600' },

  subPillsRow: {
    position: 'absolute', left: 14,
    top: Platform.OS === 'ios' ? 92 : 74,
    flexDirection: 'row', gap: 6, zIndex: 9,
  },
  privatePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(155,101,245,0.75)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 4,
  },
  privateText: { color: '#fff', fontWeight: '700', fontSize: 10 },

  participantsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  participantsStack: { flexDirection: 'row', alignItems: 'center' },
  participantAvatar: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#050010',
  },
  participantAvatarText: { color: '#fff', fontSize: 7, fontWeight: '800' },
  viewerCount: { color: '#fff', fontSize: 10, fontWeight: '800' },
  likeWrap:    { marginLeft: 0, marginRight: 2 },
  moreBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },

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
  giftTickerGoGold:  { color: '#fff', fontSize: 11, fontWeight: '700' },

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
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: Platform.OS === 'ios' ? 38 : 22,
    paddingHorizontal: 12, zIndex: 20,
  },
  chatList: { maxHeight: 230, marginBottom: 8 },
  chatRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 6 },
  chatAvatar: { width: 26, height: 26, borderRadius: 13, marginTop: 2 },
  chatBubble: {
    paddingHorizontal: 10, paddingVertical: 5,
    flexDirection: 'row', flexWrap: 'wrap', maxWidth: 210,
  },
  chatUser:    { color: '#F0365A', fontSize: 12, fontWeight: '800' },
  chatText:    { color: '#fff', fontSize: 13, flexShrink: 1 },
  sysRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  sysText:     { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  giftMsg:     { backgroundColor: 'rgba(255,215,0,0.16)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4, alignSelf: 'flex-start' },
  giftMsgText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },

  inputBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  inputBar: { flex: 1 },
  quickToggleBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  chatPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    minHeight: 38,
  },
  chatPillText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22, paddingLeft: 14, paddingRight: 4, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    minHeight: 38,
  },
  chatInput: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 5 },
  inputEmojiWrap: { alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  sendBtn:   {
    backgroundColor: '#F0365A', borderRadius: 17, padding: 7, margin: 3,
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

