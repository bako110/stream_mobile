/**
 * SimpleLiveViewerScreen — Viewer du live spontané.
 * - Spotlight cliquable (plein écran) + PiP viewer quand quelqu'un d'autre est en spotlight
 * - Contrôles caméra/micro pour le viewer
 * - Bouton quitter propre
 * - Chat WS + REST
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, FlatList, TextInput, KeyboardAvoidingView,
  ActivityIndicator, Image, ScrollView,
} from 'react-native';
import {
  LiveKitRoom,
  useParticipants,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { liveService } from '../../services/liveService';
import type { LiveStream } from '../../services/liveService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import { useWs } from '../../context/WebSocketContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { LiveGiftOverlay } from '../../components/wallet/LiveGiftOverlay';
import type { GiftNotif } from '../../components/wallet/LiveGiftOverlay';
import type { LiveGiftOverlayRef } from '../../components/wallet/LiveGiftOverlay';
import { LiveLikeButton } from '../../components/live/LiveLikeButton';
import type { LiveLikeButtonRef } from '../../components/live/LiveLikeButton';

type Nav    = NativeStackNavigationProp<MainStackParamList>;
type RouteT = RouteProp<MainStackParamList, 'SimpleLiveViewer'>;

interface ChatMsg { id: string; user: string; avatar?: string | null; text: string; }

// ── Avatar placeholder quand la caméra est off ────────────────────────────────

const ParticipantAvatar: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <View style={[mv.avatarBox, { width: size, height: size, borderRadius: size / 2 }]}>
    <Text style={[mv.avatarText, { fontSize: size * 0.38 }]}>
      {(name || '?')[0].toUpperCase()}
    </Text>
  </View>
);

// ── Zone vidéo multi-participants avec spotlight ───────────────────────────────

const MultiVideoView: React.FC<{ onGift: (id: string, name: string) => void; onTap: () => void }> = ({ onGift, onTap }) => {
  const allTracks  = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const participants = useParticipants();
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  // Tous les tracks (caméra on OU off)
  const allCamTracks = allTracks;
  const activeTracks = allCamTracks.filter(t => !t.publication?.isMuted);

  // Spotlight par défaut : 1er remote
  const defaultSpotlight = allCamTracks.find(t => !t.participant.isLocal) ?? allCamTracks[0] ?? null;
  const spotlightTrack   = allCamTracks.find(t => t.participant.identity === spotlightId) ?? defaultSpotlight;
  const thumbnailTracks  = allCamTracks.filter(t => t !== spotlightTrack);
  const localTrack       = activeTracks.find(t => t.participant.isLocal) ?? null;
  const showLocalPip     = localTrack && spotlightTrack && !spotlightTrack.participant.isLocal;

  const spotlightName = spotlightTrack
    ? (spotlightTrack.participant.isLocal ? 'Toi' : (spotlightTrack.participant.name || spotlightTrack.participant.identity))
    : '';
  const spotlightCamOn = spotlightTrack ? !spotlightTrack.publication?.isMuted : false;

  if (allCamTracks.length === 0) {
    return (
      <View style={[StyleSheet.absoluteFill, mv.noVideo]}>
        <ActivityIndicator size="large" color="#F0365A" />
        <Text style={mv.noVideoText}>
          {participants.length === 0 ? 'Connexion au live...' : 'En attente de la vidéo...'}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={() => true}
      onResponderGrant={onTap}
    >
      {/* Spotlight plein écran — vidéo ou avatar */}
      {spotlightTrack && (
        spotlightCamOn
          ? <VideoTrack trackRef={spotlightTrack} style={StyleSheet.absoluteFill} objectFit="cover" />
          : <View style={[StyleSheet.absoluteFill, mv.noVideoBg]}>
              <ParticipantAvatar name={spotlightName} size={100} />
              <Text style={mv.spotlightNameBig}>{spotlightName}</Text>
            </View>
      )}

      {/* Bouton cadeau sur le spotlight (non-local uniquement) */}
      {spotlightTrack && !spotlightTrack.participant.isLocal && (
        <TouchableOpacity
          style={mv.spotlightGiftBtn}
          onPress={() => onGift(spotlightTrack.participant.identity, spotlightName)}
          activeOpacity={0.8}
        >
          <Text style={mv.spotlightGiftEmoji}>🎁</Text>
          <Text style={mv.spotlightGiftLabel}>Cadeau</Text>
        </TouchableOpacity>
      )}

      {/* Label nom spotlight */}
      {spotlightTrack && (
        <View style={mv.spotlightLabel}>
          <Text style={mv.spotlightLabelText}>{spotlightName}</Text>
        </View>
      )}

      {/* PiP local */}
      {showLocalPip && localTrack && (
        <TouchableOpacity style={mv.pip} onPress={() => setSpotlightId(localTrack.participant.identity)} activeOpacity={0.85}>
          <VideoTrack trackRef={localTrack} style={StyleSheet.absoluteFill} objectFit="cover" />
          <View style={mv.pipLabel}><Text style={mv.pipLabelText}>Toi</Text></View>
        </TouchableOpacity>
      )}

      {/* Vignettes */}
      {thumbnailTracks.length > 0 && (
        <View style={mv.thumbnailsContainer}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {thumbnailTracks.map(t => {
              const camOn = !t.publication?.isMuted;
              const tName = t.participant.isLocal ? 'Toi' : (t.participant.name || t.participant.identity);
              const isLocal = t.participant.isLocal;
              return (
                <TouchableOpacity
                  key={t.participant.identity}
                  style={mv.thumbnail}
                  onPress={() => setSpotlightId(t.participant.identity)}
                  activeOpacity={0.8}
                >
                  {camOn
                    ? <VideoTrack trackRef={t} style={StyleSheet.absoluteFill} objectFit="cover" />
                    : <View style={[StyleSheet.absoluteFill, mv.thumbnailNoCam]}>
                        <ParticipantAvatar name={tName} size={44} />
                      </View>
                  }
                  <View style={mv.thumbnailLabel}>
                    <Text style={mv.thumbnailLabelText} numberOfLines={1}>{tName}</Text>
                  </View>
                  {/* Bouton cadeau sur la vignette (non-local) */}
                  {!isLocal && (
                    <TouchableOpacity
                      style={mv.thumbGiftBtn}
                      onPress={() => onGift(t.participant.identity, tName)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={mv.thumbGiftEmoji}>🎁</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

// ── Contenu dans LiveKitRoom ──────────────────────────────────────────────────

const RoomContent: React.FC<{
  live: LiveStream | null;
  liveId: string;
  viewerCount: number;
  messages: ChatMsg[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sending: boolean;
  showChat: boolean;
  setShowChat: (v: boolean) => void;
  chatRef: React.RefObject<FlatList | null>;
  onSend: () => void;
  onLeave: () => void;
  giftNotifs: GiftNotif[];
  onGiftNotifShown: (id: string) => void;
  likeCount: number;
  onLike: () => void;
}> = ({ live, liveId, viewerCount, messages, chatInput, setChatInput, sending, showChat, setShowChat, chatRef, onSend, onLeave, giftNotifs, onGiftNotifShown, likeCount, onLike }) => {
  const { localParticipant } = useLocalParticipant();
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const likeRef = useRef<LiveLikeButtonRef>(null);
  const giftRef = useRef<LiveGiftOverlayRef>(null);

  const hostId   = live?.user_id ?? '';
  const hostName2 = live?.user?.display_name ?? live?.user?.username ?? 'Host';

  const hostName = live?.user?.display_name ?? live?.user?.username ?? 'Live';

  const toggleCam = useCallback(async () => {
    try {
      await localParticipant.setCameraEnabled(!camOn);
      setCamOn(v => !v);
    } catch {}
  }, [camOn, localParticipant]);

  const toggleMic = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(v => !v);
    } catch {}
  }, [micOn, localParticipant]);

  return (
    <KeyboardAvoidingView
      style={st.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Vidéo — tap n'importe où = like */}
      <MultiVideoView
        onGift={(id, name) => giftRef.current?.openGift(id, name)}
        onTap={() => likeRef.current?.trigger()}
      />

      {/* Top overlay */}
      <LinearGradient colors={['rgba(0,0,0,0.75)', 'transparent']} style={st.topOverlay}>
        <TouchableOpacity onPress={onLeave} style={st.iconBtn}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={st.topCenter}>
          <TouchableOpacity onPress={() => giftRef.current?.openGift(hostId, hostName2)} activeOpacity={0.8}>
            {live?.user?.avatar_url ? (
              <Image source={{ uri: live.user.avatar_url }} style={st.hostAvatar} />
            ) : (
              <View style={[st.hostAvatar, st.hostAvatarFallback]}>
                <Text style={st.hostAvatarText}>{hostName[0]?.toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={st.liveBadgeRow}>
              <View style={st.liveBadge}>
                <View style={st.liveDot} />
                <Text style={st.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={st.liveTitle} numberOfLines={1}>{live?.title}</Text>
            <Text style={st.hostName} numberOfLines={1}>{hostName}</Text>
          </View>
        </View>
        <View style={st.viewerBadge}>
          <Icon name="eye" size={13} color="#fff" />
          <Text style={st.viewerText}>{viewerCount}</Text>
        </View>
      </LinearGradient>

      {/* Contrôles media du viewer (bas droite) */}
      <View style={st.mediaControls}>
        <TouchableOpacity
          style={[st.mediaBtn, camOn && st.mediaBtnActive]}
          onPress={toggleCam}
        >
          <Icon name={camOn ? 'video' : 'video-off'} size={18} color={camOn ? '#4ade80' : '#fff'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.mediaBtn, micOn && st.mediaBtnActive]}
          onPress={toggleMic}
        >
          <Icon name={micOn ? 'mic' : 'mic-off'} size={18} color={micOn ? '#4ade80' : '#fff'} />
        </TouchableOpacity>
        <TouchableOpacity style={[st.mediaBtn, st.leaveBtn]} onPress={onLeave}>
          <Icon name="log-out" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Chat */}
      {showChat && (
        <View style={st.chatContainer}>
          <FlatList
            ref={chatRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <View style={st.chatBubble}>
                <Text style={st.chatUser}>{item.user} </Text>
                <Text style={st.chatText}>{item.text}</Text>
              </View>
            )}
            style={st.chatList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={st.chatEmpty}>Aucun message</Text>}
          />
          <View style={st.chatInputRow}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Message..."
              placeholderTextColor="#999"
              style={st.chatField}
              onSubmitEditing={onSend}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={onSend} style={st.sendBtn} disabled={sending}>
              <Icon name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Toggle chat */}
      <TouchableOpacity style={st.toggleChatBtn} onPress={() => setShowChat(!showChat)}>
        <Icon name="message-circle" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Cadeaux live */}
      <LiveGiftOverlay
        ref={giftRef}
        liveId={liveId}
        incomingNotifs={giftNotifs}
        onNotifShown={onGiftNotifShown}
      />

      {/* Bouton like — haut droite */}
      <View style={st.likeContainer}>
        <LiveLikeButton ref={likeRef} total={likeCount} onLike={onLike} />
      </View>
    </KeyboardAvoidingView>
  );
};

// ── Page principale ────────────────────────────────────────────────────────────

export const SimpleLiveViewerScreen: React.FC = () => {
  const nav   = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { liveId } = route.params;

  const [live,        setLive]        = useState<LiveStream | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [token,       setToken]       = useState<string | null>(null);
  const [wsUrl,       setWsUrl]       = useState<string | null>(null);
  const [ended,       setEnded]       = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [messages,    setMessages]    = useState<ChatMsg[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [sending,     setSending]     = useState(false);
  const [showChat,    setShowChat]    = useState(true);
  const [giftNotifs,  setGiftNotifs]  = useState<GiftNotif[]>([]);
  const [likeCount,   setLikeCount]   = useState(0);
  const likeThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLikes = useRef(0);

  const chatRef = useRef<FlatList>(null);
  const wsRef   = useRef<WebSocket | null>(null);
  const { lastLiveEnded, lastLiveViewersUpdated } = useWs();

  useEffect(() => {
    (async () => {
      try {
        const l = await liveService.getById(liveId);
        setLive(l);
        if (l.status !== 'active') { setEnded(true); setLoading(false); return; }
        setViewerCount(l.current_viewers + 1);
        const t = await liveService.getToken(liveId);
        setToken(t.token);
        setWsUrl(t.livekit_url);
      } catch {}
      setLoading(false);
    })();
  }, [liveId]);

  // Live terminé via WS
  useEffect(() => {
    if (!lastLiveEnded) return;
    if (lastLiveEnded === liveId) { setEnded(true); setToken(null); }
  }, [lastLiveEnded, liveId]);

  // Viewers mis à jour via WS
  useEffect(() => {
    if (!lastLiveViewersUpdated) return;
    if (lastLiveViewersUpdated.live_id === liveId) {
      setViewerCount(lastLiveViewersUpdated.current_viewers);
    }
  }, [lastLiveViewersUpdated, liveId]);

  useEffect(() => {
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken || !token) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_BASE_URL}/api/v1/social/comments/ws/live/${liveId}?token=${accessToken}`);
    } catch { return; }
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
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
        if (d.type === 'gift_received' && d.gift) {
          const gf = d.gift;
          setGiftNotifs(prev => [...prev, {
            id:         gf.id ?? String(Date.now()),
            senderName: gf.sender?.display_name ?? gf.sender?.username ?? 'Quelqu\'un',
            emoji:      gf.gift_type?.emoji ?? '🎁',
            giftName:   gf.gift_type?.name ?? 'Cadeau',
            coins:      gf.coins_spent ?? 0,
          }]);
        }
      } catch {}
    };
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
    }, 25_000);
    return () => { clearInterval(ping); try { ws.close(); } catch {} };
  }, [liveId, token]);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput('');
    setSending(true);
    try {
      await apiClient.post(Endpoints.social.comments, { body: text, live_id: liveId });
    } catch {}
    finally { setSending(false); }
  }, [chatInput, sending, liveId]);

  const handleLeave = useCallback(() => {
    try { wsRef.current?.close(); } catch {}
    nav.goBack();
  }, [nav]);

  const handleLike = useCallback(() => {
    pendingLikes.current += 1;
    setLikeCount(c => c + 1);
    if (likeThrottle.current) return;
    likeThrottle.current = setTimeout(async () => {
      const batch = pendingLikes.current;
      pendingLikes.current = 0;
      likeThrottle.current = null;
      try {
        await apiClient.post(`/api/v1/lives/${liveId}/like`, { count: batch });
      } catch {}
    }, 500);
  }, [liveId]);

  if (loading) {
    return (
      <View style={[st.root, st.center]}>
        <ActivityIndicator size="large" color="#F0365A" />
      </View>
    );
  }

  if (ended) {
    return (
      <View style={[st.root, st.center]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Icon name="radio" size={48} color="#555" />
        <Text style={st.endedTitle}>Le live est terminé</Text>
        <Text style={st.endedSub}>{live?.title ?? ''}</Text>
        <TouchableOpacity style={st.endedBtn} onPress={handleLeave}>
          <Text style={st.endedBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!token || !wsUrl) {
    return (
      <View style={[st.root, st.center]}>
        <ActivityIndicator size="large" color="#F0365A" />
        <Text style={st.connectText}>Connexion au live...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect>
      <RoomContent
        live={live}
        liveId={liveId}
        viewerCount={viewerCount}
        messages={messages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        sending={sending}
        showChat={showChat}
        setShowChat={setShowChat}
        chatRef={chatRef}
        onSend={sendChat}
        onLeave={handleLeave}
        giftNotifs={giftNotifs}
        onGiftNotifShown={(id) => setGiftNotifs(prev => prev.filter(n => n.id !== id))}
        likeCount={likeCount}
        onLike={handleLike}
      />
    </LiveKitRoom>
  );
};

// ── Styles MultiVideoView ─────────────────────────────────────────────────────

const mv = StyleSheet.create({
  noVideo:     { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  noVideoText: { color: '#999', marginTop: 12, fontSize: 14 },

  spotlightLabel: {
    position: 'absolute', top: Platform.OS === 'ios' ? 110 : 90,
    left: 12, backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, zIndex: 5,
  },
  spotlightLabelText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  pip: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 180 : 160,
    right: 12,
    width: 80, height: 120,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    zIndex: 15,
  },
  pipLabel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 3,
  },
  pipLabelText: { color: '#fff', fontSize: 9, textAlign: 'center' },

  thumbnailsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 180 : 160,
    left: 12, maxHeight: 300, zIndex: 15,
  },
  thumbnail: {
    width: 80, height: 120,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 8,
  },
  thumbnailLabel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 3, paddingHorizontal: 4,
  },
  thumbnailLabelText: { color: '#fff', fontSize: 9 },

  noVideoBg: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  avatarBox: { backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  spotlightNameBig: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 10 },
  thumbnailNoCam: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' },

  spotlightGiftBtn: {
    position: 'absolute', bottom: 60, right: 14, zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 24,
    paddingHorizontal: 14, paddingVertical: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#FFD700',
  },
  spotlightGiftEmoji: { fontSize: 22 },
  spotlightGiftLabel: { color: '#FFD700', fontSize: 10, fontWeight: '700', marginTop: 2 },

  thumbGiftBtn: {
    position: 'absolute', top: 4, right: 4, zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    padding: 3,
  },
  thumbGiftEmoji: { fontSize: 14 },
});

// ── Styles page ───────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  center:  { justifyContent: 'center', alignItems: 'center' },
  connectText: { color: '#999', marginTop: 12, fontSize: 14 },

  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 14, paddingBottom: 24,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, zIndex: 10,
  },
  iconBtn:            { padding: 8, marginTop: 2 },
  topCenter:          { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  hostAvatar:         { width: 54, height: 54, borderRadius: 27, borderWidth: 2.5, borderColor: '#F0365A' },
  hostAvatarFallback: { backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center' },
  hostAvatarText:     { color: '#fff', fontWeight: '800', fontSize: 18 },
  liveBadgeRow:       { flexDirection: 'row', marginBottom: 2 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0365A', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 4 },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  liveTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hostName:  { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, gap: 4, marginTop: 2,
  },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Contrôles media viewer (bas droite)
  mediaControls: {
    position: 'absolute', right: 12,
    bottom: Platform.OS === 'ios' ? 110 : 90,
    gap: 10, zIndex: 20, alignItems: 'center',
  },
  mediaBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  mediaBtnActive: { borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.15)' },
  leaveBtn:       { backgroundColor: 'rgba(240,54,90,0.4)', borderColor: '#F0365A' },

  chatContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 70,
    paddingBottom: Platform.OS === 'ios' ? 36 : 18,
    paddingLeft: 12, zIndex: 10,
  },
  chatList: { flexGrow: 0, maxHeight: 200, marginBottom: 8 },
  chatBubble: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  chatUser:  { color: '#F0365A', fontSize: 11, fontWeight: '700' },
  chatText:  { color: '#fff', fontSize: 13, flexShrink: 1 },
  chatEmpty: { color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24, paddingLeft: 14, paddingRight: 4,
  },
  chatField: {
    flex: 1, color: '#fff', fontSize: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  sendBtn: { backgroundColor: '#F0365A', borderRadius: 20, padding: 8 },
  toggleChatBtn: {
    position: 'absolute', right: 12,
    bottom: Platform.OS === 'ios' ? 68 : 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, padding: 10, zIndex: 20,
  },

  endedTitle:   { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 16 },
  endedSub:     { color: '#999', fontSize: 14, marginTop: 4 },
  endedBtn: {
    marginTop: 24, backgroundColor: '#F0365A',
    borderRadius: 24, paddingHorizontal: 32, paddingVertical: 12,
  },
  endedBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  likeContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 40,
    right: 14,
    zIndex: 40,
    alignItems: 'center',
  },
});
