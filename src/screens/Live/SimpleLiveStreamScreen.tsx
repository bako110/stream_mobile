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
  Image, ScrollView,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import {
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track, RoomEvent, RemoteParticipant } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
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
import { useUser } from '../../context/UserContext';

type Nav    = NativeStackNavigationProp<MainStackParamList>;
type RouteT = RouteProp<MainStackParamList, 'SimpleLiveStream'>;

interface ChatMsg {
  id:     string;
  user:   string;
  avatar?: string | null;
  text:   string;
  isJoin?: boolean;
  isGift?: boolean;
  isSys?:  boolean;
}

interface HandRequest {
  identity:    string;
  displayName: string;
  avatarUrl?:  string | null;
}

// ── Avatar fallback ───────────────────────────────────────────────────────────

const Av: React.FC<{ name: string; size: number; color?: string }> = ({ name, size, color = '#F0365A' }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{(name || '?')[0].toUpperCase()}</Text>
  </View>
);

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
}> = ({ mirror, liveId, hostName, hostAvatarUrl, onStage, onGift, onDemote, onBan }) => {
  const allTracks       = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const { localParticipant } = useLocalParticipant();
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  const localTrack      = allTracks.find(t => t.participant.isLocal) ?? null;
  const localCamOn      = localTrack ? !localTrack.publication?.isMuted : false;
  const spotlightTrack  = allTracks.find(t => t.participant.identity === spotlightId) ?? localTrack ?? allTracks[0] ?? null;
  const thumbnailTracks = allTracks.filter(t => t !== spotlightTrack);
  const showLocalPip    = spotlightTrack && !spotlightTrack.participant.isLocal && localTrack;
  const spotlightName   = spotlightTrack ? (spotlightTrack.participant.isLocal ? 'Toi' : (spotlightTrack.participant.name || spotlightTrack.participant.identity)) : '';
  const spotlightCamOn  = spotlightTrack ? !spotlightTrack.publication?.isMuted : false;

  // Pas encore connecté à la room
  if (!localParticipant.sid && allTracks.length === 0) {
    return (
      <View style={[StyleSheet.absoluteFill, mv.noVideo]}>
        <ActivityIndicator size="large" color="#F0365A" />
      </View>
    );
  }

  // Connecté mais caméra off — afficher avatar style TikTok
  if (!localCamOn && allTracks.filter(t => !t.participant.isLocal).length === 0) {
    return (
      <View style={[StyleSheet.absoluteFill, mv.noCamBg]}>
        {hostAvatarUrl
          ? <Image source={{ uri: hostAvatarUrl }} style={mv.noCamAvatar} />
          : <Av name={hostName} size={100} />
        }
        <Text style={mv.noCamName}>{hostName}</Text>
        <View style={mv.noCamMicRow}>
          <Icon name="mic" size={14} color="rgba(255,255,255,0.7)" />
          <Text style={mv.noCamMicText}>Micro actif · Caméra désactivée</Text>
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
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={mv.pipGrad}>
            <Text style={mv.pipLabel}>Toi</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Vignettes viewers */}
      {thumbnailTracks.length > 0 && (
        <View style={mv.thumbsCol}>
          {thumbnailTracks.map(t => {
            const camOn   = !t.publication?.isMuted;
            const tName   = t.participant.isLocal ? 'Toi' : (t.participant.name || t.participant.identity);
            const isLocal = t.participant.isLocal;
            const isOnStage = !isLocal && onStage.has(t.participant.identity);
            return (
              <TouchableOpacity
                key={t.participant.identity}
                style={[mv.thumb, isOnStage && mv.thumbOnStage]}
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
                    { text: 'Exclure du live', style: 'destructive' as const, onPress: () => onBan(id, tName) },
                  ]);
                }}
                activeOpacity={0.8}
                delayLongPress={400}
              >
                {camOn
                  ? <VideoTrack trackRef={t} style={StyleSheet.absoluteFill} objectFit="cover" />
                  : <View style={[StyleSheet.absoluteFill, mv.thumbNoCam]}><Av name={tName} size={40} /></View>
                }
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={mv.thumbGrad}>
                  <Text style={mv.thumbLabel} numberOfLines={1}>{tName}</Text>
                </LinearGradient>
                {/* Icône micro si sur scène */}
                {isOnStage && (
                  <View style={mv.thumbStageDot}>
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

const StreamContent: React.FC<{ liveId: string; onEnd: () => void }> = ({ liveId, onEnd }) => {
  const { localParticipant } = useLocalParticipant();
  const room                 = useRoomContext();
  const allParticipants      = useParticipants();
  const { currentUser }      = useUser();
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
  const [likeCount,    setLikeCount]    = useState(0);
  // Modération
  const [handRequests, setHandRequests] = useState<HandRequest[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [onStage,      setOnStage]      = useState<Set<string>>(new Set());

  const chatRef  = useRef<FlatList>(null);
  const wsRef    = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const giftRef  = useRef<LiveGiftOverlayRef>(null);

  const addSysMsg = useCallback((text: string) => {
    setMessages(prev => [...prev.slice(-149), { id: `sys-${Date.now()}`, user: '', text, isSys: true }]);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // Démarrer cam + mic
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
          setMessages(prev => [...prev.slice(-149), {
            id:     c.id ?? String(Date.now()),
            user:   c.author?.display_name ?? c.author?.username ?? 'Anonyme',
            avatar: c.author?.avatar_url ?? null,
            text:   c.body,
          }]);
          setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
        }

        // ── Cadeaux reçus
        if (d.type === 'gift_received' && d.gift) {
          const gf = d.gift;
          const sn = gf.sender?.display_name ?? gf.sender?.username ?? 'Quelqu\'un';
          setGiftNotifs(prev => [...prev, {
            id: gf.id ?? String(Date.now()), senderName: sn,
            emoji: gf.gift_type?.emoji ?? '🎁', giftName: gf.gift_type?.name ?? 'Cadeau',
            coins: gf.coins_spent ?? 0,
          }]);
          setMessages(prev => [...prev.slice(-149), {
            id: `gift-${Date.now()}`, user: sn,
            text: `${sn} a envoyé ${gf.gift_type?.emoji ?? '🎁'} ${gf.gift_type?.name ?? 'Cadeau'}`,
            isGift: true,
          }]);
          setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
        }

        // ── Likes
        if (d.type === 'like_added') {
          setLikeCount(c => c + (d.count ?? 1));
        }

        // ── Demande de scène (live_hand_raise)
        if (d.type === 'live_hand_raise' && d.live_id === liveId) {
          const newReq: HandRequest = {
            identity:    d.identity,
            displayName: d.display_name ?? d.identity,
            avatarUrl:   d.avatar_url ?? null,
          };
          setHandRequests(prev => {
            // Éviter les doublons
            if (prev.some(r => r.identity === d.identity)) return prev;
            return [...prev, newReq];
          });
          setShowRequests(true);
          addSysMsg(`${d.display_name ?? d.identity} veut monter sur scène ✋`);
        }

        // ── Confirmation invitation broadcast (au cas où)
        if (d.type === 'live_guest_invited' && d.live_id === liveId) {
          setOnStage(prev => new Set([...prev, d.identity]));
          addSysMsg(`${d.identity} est maintenant sur scène 🎤`);
        }

        // ── Confirmation redescente broadcast
        if (d.type === 'live_guest_demoted' && d.live_id === liveId) {
          setOnStage(prev => { const next = new Set(prev); next.delete(d.identity); return next; });
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
      await apiClient.post(Endpoints.lives.invite(liveId, req.identity));
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
      await apiClient.post(Endpoints.lives.demote(liveId, identity));
      setOnStage(prev => { const next = new Set(prev); next.delete(identity); return next; });
      addSysMsg(`${name} a été redescendu de scène`);
    } catch {
      Alert.alert('Erreur', 'Impossible de faire descendre ce participant.');
    }
  }, [liveId, addSysMsg]);

  const handleBan = useCallback((identity: string, name: string) => {
    Alert.alert('Exclure du live', `Exclure ${name} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Exclure', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.post(Endpoints.lives.ban(liveId, identity));
            setHandRequests(prev => prev.filter(r => r.identity !== identity));
            setOnStage(prev => { const next = new Set(prev); next.delete(identity); return next; });
            addSysMsg(`${name} a été exclu du live`);
          } catch {
            Alert.alert('Erreur', 'Impossible d\'exclure ce participant.');
          }
        },
      },
    ]);
  }, [liveId, addSysMsg]);

  // ── Contrôles caméra/micro
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput(''); setShowInput(false); setSending(true);
    try { await apiClient.post(Endpoints.social.comments, { body: text, live_id: liveId }); }
    catch {}
    finally { setSending(false); }
  }, [chatInput, sending, liveId]);

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

  const flipCam = useCallback(async () => {
    const next = !camFront; setCamFront(next);
    try {
      await localParticipant.setCameraEnabled(false);
      await localParticipant.setCameraEnabled(true, { facingMode: next ? 'user' : 'environment' });
    } catch {}
  }, [camFront, localParticipant]);

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

      {/* Vidéo */}
      <HostVideoView
        mirror={camFront}
        liveId={liveId}
        hostName={currentUser?.display_name ?? currentUser?.username ?? 'Toi'}
        hostAvatarUrl={currentUser?.avatar_url}
        onStage={onStage}
        onGift={(id, name) => giftRef.current?.openGift(id, name)}
        onDemote={handleDemote}
        onBan={handleBan}
      />

      {/* Gradients */}
      <LinearGradient colors={['rgba(0,0,0,0.72)', 'transparent']} style={st.gradTop} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={st.gradBottom} pointerEvents="none" />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={st.header}>
        <TouchableOpacity onPress={askEnd} style={st.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={st.livePill}>
          <View style={st.liveDot} />
          <Text style={st.liveText}>LIVE</Text>
          <Text style={st.timerText}>{fmt(elapsed)}</Text>
        </View>

        <View style={st.viewerPill}>
          <Icon name="eye" size={12} color="#fff" />
          <Text style={st.viewerCount}>{viewerCount}</Text>
        </View>

        {/* Avatars viewers */}
        <View style={st.viewerAvatars}>
          {remoteParticipants.slice(0, 5).map((p, i) => (
            <TouchableOpacity
              key={p.identity}
              style={[st.viewerAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }]}
              onPress={() => giftRef.current?.openGift(p.identity, p.name || p.identity || '?')}
              activeOpacity={0.75}
            >
              <Text style={st.viewerAvatarText}>{(p.name || p.identity || '?')[0].toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
          {viewerCount > 5 && (
            <View style={[st.viewerAvatar, { marginLeft: -8, backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={[st.viewerAvatarText, { fontSize: 9 }]}>+{viewerCount - 5}</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }} />
        <LiveLikeButton total={likeCount} onLike={() => {}} />
      </View>

      {/* ── TOASTS join ──────────────────────────────────────────────── */}
      <View style={st.toastsContainer} pointerEvents="none">
        {joinToasts.map(t => <JoinToast key={t.id} name={t.name} />)}
      </View>

      {/* ── CHAT bas gauche ──────────────────────────────────────────── */}
      <View style={st.chatZone} pointerEvents="box-none">
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
            return (
              <Animated.View entering={FadeIn.duration(200)} style={st.chatBubble}>
                {item.avatar
                  ? <Image source={{ uri: item.avatar }} style={st.chatAvatar} />
                  : <Av name={item.user} size={24} />
                }
                <View style={st.chatBubbleInner}>
                  <Text style={st.chatUser}>{item.user}</Text>
                  <Text style={st.chatText}>{item.text}</Text>
                </View>
              </Animated.View>
            );
          }}
          style={st.chatList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ justifyContent: 'flex-end' }}
          pointerEvents="none"
        />

        {showInput ? (
          <View style={st.inputRow}>
            <TextInput
              value={chatInput} onChangeText={setChatInput}
              placeholder="Répondre..." placeholderTextColor="rgba(255,255,255,0.4)"
              style={st.chatInput} onSubmitEditing={sendChat} returnKeyType="send"
              autoFocus onBlur={() => { if (!chatInput.trim()) setShowInput(false); }}
            />
            {chatInput.trim().length > 0 && (
              <TouchableOpacity onPress={sendChat} style={st.sendBtn} disabled={sending}>
                <Icon name="send" size={15} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity style={st.chatPlaceholder} onPress={() => setShowInput(true)} activeOpacity={0.8}>
            <Icon name="message-circle" size={14} color="rgba(255,255,255,0.55)" />
            <Text style={st.chatPlaceholderText}>Répondre...</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── CONTRÔLES DROITE ────────────────────────────────────────── */}
      <View style={st.sideControls}>

        {/* Demandes — badge rouge si en attente */}
        <TouchableOpacity style={st.sideBtn} onPress={() => setShowRequests(v => !v)} activeOpacity={0.8}>
          <View style={[st.sideBtnCircle, pendingCount > 0 && st.sideBtnPending]}>
            <Text style={{ fontSize: 20 }}>✋</Text>
            {pendingCount > 0 && (
              <View style={st.badge}><Text style={st.badgeText}>{pendingCount}</Text></View>
            )}
          </View>
          <Text style={[st.sideBtnLabel, pendingCount > 0 && { color: '#FFD700' }]}>
            {pendingCount > 0 ? `${pendingCount} demande${pendingCount > 1 ? 's' : ''}` : 'Scène'}
          </Text>
        </TouchableOpacity>

        {/* Flip */}
        <TouchableOpacity style={st.sideBtn} onPress={flipCam} activeOpacity={0.8}>
          <View style={st.sideBtnCircle}>
            <Icon name="refresh-cw" size={20} color="#fff" />
          </View>
          <Text style={st.sideBtnLabel}>Flip</Text>
        </TouchableOpacity>

        {/* Micro */}
        <TouchableOpacity style={st.sideBtn} onPress={toggleMute} activeOpacity={0.8}>
          <View style={[st.sideBtnCircle, muted && st.sideBtnOff]}>
            <Icon name={muted ? 'mic-off' : 'mic'} size={20} color={muted ? '#F0365A' : '#fff'} />
          </View>
          <Text style={st.sideBtnLabel}>{muted ? 'Muet' : 'Micro'}</Text>
        </TouchableOpacity>

        {/* Caméra */}
        <TouchableOpacity style={st.sideBtn} onPress={toggleVideo} activeOpacity={0.8}>
          <View style={[st.sideBtnCircle, videoOff && st.sideBtnOff]}>
            <Icon name={videoOff ? 'video-off' : 'video'} size={20} color={videoOff ? '#F0365A' : '#fff'} />
          </View>
          <Text style={st.sideBtnLabel}>{videoOff ? 'Cam off' : 'Cam'}</Text>
        </TouchableOpacity>

        {/* Fin */}
        <TouchableOpacity style={st.sideBtn} onPress={askEnd} activeOpacity={0.8}>
          <View style={[st.sideBtnCircle, st.endCircle]}>
            <Icon name="x" size={22} color="#fff" />
          </View>
          <Text style={[st.sideBtnLabel, { color: '#F0365A' }]}>Fin</Text>
        </TouchableOpacity>
      </View>

      {/* ── PANEL DEMANDES DE SCÈNE ──────────────────────────────────── */}
      {showRequests && (
        <HandRequestsPanel
          requests={handRequests}
          onAccept={handleAccept}
          onRefuse={handleRefuse}
          onClose={() => setShowRequests(false)}
        />
      )}

      {/* Cadeaux */}
      <LiveGiftOverlay
        ref={giftRef}
        liveId={liveId}
        incomingNotifs={giftNotifs}
        onNotifShown={(id) => setGiftNotifs(prev => prev.filter(n => n.id !== id))}
      />
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

  useEffect(() => {
    return () => { liveService.stopLive(liveId).catch(() => {}); };
  }, [liveId]);

  if (!publisherToken || !livekitUrl) {
    return (
      <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#F0365A" />
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={livekitUrl} token={publisherToken} connect>
      <StreamContent liveId={liveId} onEnd={handleEnd} />
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
  thumbGiftBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 },
});

// ── Styles page ───────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  gradTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 180, zIndex: 5 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 240, zIndex: 5 },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 52 : 34,
    paddingHorizontal: 14, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 10,
  },
  backBtn: { padding: 6 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F0365A', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText:  { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  timerText: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  viewerCount:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  viewerAvatars:  { flexDirection: 'row', alignItems: 'center' },
  viewerAvatar:   { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#000' },
  viewerAvatarText:{ color: '#fff', fontSize: 10, fontWeight: '800' },

  toastsContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 115 : 95, left: 14, zIndex: 30, gap: 4 },
  joinToast: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  joinToastText: { color: '#fff', fontSize: 12 },

  chatZone: {
    position: 'absolute', bottom: 0, left: 0, right: 100,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingLeft: 12, zIndex: 20,
  },
  chatList: { maxHeight: 220, marginBottom: 6 },
  chatBubble: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 5 },
  chatAvatar: { width: 24, height: 24, borderRadius: 12 },
  chatBubbleInner: {
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4, maxWidth: 200,
  },
  chatUser: { color: '#F0365A', fontSize: 11, fontWeight: '700' },
  chatText: { color: '#fff', fontSize: 13 },
  sysRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  sysText:  { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  giftMsg:  { backgroundColor: 'rgba(255,215,0,0.18)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4, alignSelf: 'flex-start' },
  giftMsgText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },
  chatPlaceholder: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
  },
  chatPlaceholderText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24, paddingLeft: 14, paddingRight: 4, paddingVertical: 2, marginRight: 4,
  },
  chatInput: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 7 },
  sendBtn:   { backgroundColor: '#F0365A', borderRadius: 20, padding: 7, margin: 3 },

  sideControls: {
    position: 'absolute', right: 12,
    bottom: Platform.OS === 'ios' ? 80 : 60,
    alignItems: 'center', gap: 14, zIndex: 20,
  },
  sideBtn:       { alignItems: 'center', gap: 4 },
  sideBtnCircle: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
  },
  sideBtnPending: { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.2)' },
  sideBtnOff:     { borderColor: '#F0365A', backgroundColor: 'rgba(240,54,90,0.18)' },
  endCircle:      { backgroundColor: '#F0365A', borderColor: '#F0365A' },
  sideBtnLabel:   { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600' },

  // Badge nombre de demandes
  badge: {
    position: 'absolute', top: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#F0365A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#000',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
