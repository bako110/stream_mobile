/**
 * SimpleLiveStreamScreen — Host du live spontané, style TikTok Live.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Alert, ActivityIndicator, FlatList, TextInput,
  KeyboardAvoidingView, Image, Animated,
} from 'react-native';
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
import type { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';
import { liveService } from '../../services/liveService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav    = NativeStackNavigationProp<MainStackParamList>;
type RouteT = RouteProp<MainStackParamList, 'SimpleLiveStream'>;

interface ChatMsg {
  id: string;
  user: string;
  avatar?: string | null;
  text: string;
  isJoin?: boolean;
}

// ── Caméra locale (full-screen) ───────────────────────────────────────────────

const LocalCameraView: React.FC<{ mirror: boolean }> = ({ mirror }) => {
  const allTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const camTrack = allTracks.find(t => t.participant.isLocal) ?? null;

  if (!camTrack) {
    return (
      <View style={[StyleSheet.absoluteFill, st.noVideo]}>
        <ActivityIndicator size="large" color="#F0365A" />
        <Text style={st.noVideoText}>Activation de la caméra...</Text>
      </View>
    );
  }
  return <VideoTrack trackRef={camTrack} style={StyleSheet.absoluteFill} mirror={mirror} />;
};

// ── Toast d'arrivée d'un viewer ───────────────────────────────────────────────

const JoinToast: React.FC<{ name: string }> = ({ name }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[st.joinToast, { opacity }]}>
      <Icon name="user-plus" size={12} color="#fff" />
      <Text style={st.joinToastText}>{name} a rejoint</Text>
    </Animated.View>
  );
};

// ── Contenu principal (dans LiveKitRoom) ──────────────────────────────────────

const StreamContent: React.FC<{ liveId: string; onEnd: () => void }> = ({ liveId, onEnd }) => {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  // useParticipants retourne local + remotes — on filtre les remotes
  const allParticipants = useParticipants();
  const remoteParticipants = allParticipants.filter(p => !p.isLocal);

  const [muted,      setMuted]      = useState(false);
  const [videoOff,   setVideoOff]   = useState(false);
  const [camFront,   setCamFront]   = useState(true);
  const [elapsed,    setElapsed]    = useState(0);
  const [messages,   setMessages]   = useState<ChatMsg[]>([]);
  const [chatInput,  setChatInput]  = useState('');
  const [sending,    setSending]    = useState(false);
  const [joinToasts, setJoinToasts] = useState<{ id: string; name: string }[]>([]);

  const chatRef  = useRef<FlatList>(null);
  const wsRef    = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Activer cam + mic au démarrage
  useEffect(() => {
    localParticipant.setCameraEnabled(true).catch(() => {});
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
    const start = Date.now();
    timerRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      localParticipant.setCameraEnabled(false).catch(() => {});
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    };
  }, [localParticipant]);

  // Écouter RoomEvent.ParticipantConnected — fiable car événement natif LiveKit
  useEffect(() => {
    if (!room) return;
    const onJoin = (participant: RemoteParticipant) => {
      const name = participant.name || participant.identity || 'Quelqu\'un';
      const toastId = `${participant.identity}-${Date.now()}`;
      setJoinToasts(prev => [...prev, { id: toastId, name }]);
      setMessages(prev => [...prev.slice(-149), {
        id: toastId,
        user: '',
        text: `${name} a rejoint le live`,
        isJoin: true,
      }]);
      setTimeout(() => {
        setJoinToasts(prev => prev.filter(t => t.id !== toastId));
      }, 3000);
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => { room.off(RoomEvent.ParticipantConnected, onJoin); };
  }, [room]);

  // WS — réception des commentaires (comment_added)
  useEffect(() => {
    if (!liveId) return;
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken) return;
    const url = `${WS_BASE_URL}/api/v1/social/comments/ws/live/${liveId}?token=${accessToken}`;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }
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
      } catch {}
    };
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
    }, 25_000);
    return () => { clearInterval(ping); try { ws.close(); } catch {} };
  }, [liveId]);

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
    const next = !camFront;
    setCamFront(next);
    try {
      await localParticipant.setCameraEnabled(false);
      await localParticipant.setCameraEnabled(true, {
        facingMode: next ? 'user' : 'environment',
      });
    } catch {}
  }, [camFront, localParticipant]);

  const askEnd = useCallback(() => {
    Alert.alert('Terminer le live ?', 'Tous les viewers seront déconnectés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Terminer', style: 'destructive', onPress: onEnd },
    ]);
  }, [onEnd]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const viewerCount = remoteParticipants.length;

  return (
    <KeyboardAvoidingView
      style={st.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Caméra full-screen */}
      {!videoOff ? <LocalCameraView mirror={camFront} /> : (
        <View style={[StyleSheet.absoluteFill, st.noVideo]}>
          <Icon name="video-off" size={48} color="#555" />
        </View>
      )}

      {/* ── TOP BAR ─────────────────────────────────────────────────── */}
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={st.topBar}>
        <TouchableOpacity onPress={askEnd} style={st.iconBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={st.livePill}>
          <View style={st.liveDot} />
          <Text style={st.liveText}>LIVE</Text>
          <Text style={st.timerText}>{fmt(elapsed)}</Text>
        </View>

        <View style={st.viewerPill}>
          <Icon name="eye" size={13} color="#fff" />
          <Text style={st.viewerText}>{viewerCount}</Text>
        </View>

        {/* Avatars des 5 premiers viewers */}
        <View style={st.viewerAvatars}>
          {remoteParticipants.slice(0, 5).map((p, i) => (
            <View
              key={p.identity}
              style={[st.viewerAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }]}
            >
              <Text style={st.viewerAvatarText}>
                {(p.name || p.identity || '?')[0].toUpperCase()}
              </Text>
            </View>
          ))}
          {viewerCount > 5 && (
            <View style={[st.viewerAvatar, { marginLeft: -8, backgroundColor: 'rgba(255,255,255,0.3)' }]}>
              <Text style={[st.viewerAvatarText, { fontSize: 9 }]}>+{viewerCount - 5}</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* ── TOASTS d'arrivée ────────────────────────────────────────── */}
      <View style={st.toastsContainer}>
        {joinToasts.map(t => <JoinToast key={t.id} name={t.name} />)}
      </View>

      {/* ── CHAT (bas gauche) ───────────────────────────────────────── */}
      <View style={st.chatArea}>
        <FlatList
          ref={chatRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => {
            if (item.isJoin) {
              return (
                <View style={st.joinMsg}>
                  <Icon name="user-plus" size={10} color="rgba(255,255,255,0.5)" />
                  <Text style={st.joinMsgText}>{item.text}</Text>
                </View>
              );
            }
            return (
              <View style={st.chatBubble}>
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={st.chatAvatar} />
                ) : (
                  <View style={[st.chatAvatar, st.chatAvatarFallback]}>
                    <Text style={st.chatAvatarText}>{item.user[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={st.chatBubbleInner}>
                  <Text style={st.chatUser}>{item.user}</Text>
                  <Text style={st.chatText}>{item.text}</Text>
                </View>
              </View>
            );
          }}
          style={st.chatList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ justifyContent: 'flex-end' }}
        />

        <View style={st.chatInputRow}>
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Réponds à tes viewers..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={st.chatInput}
            onSubmitEditing={sendChat}
            returnKeyType="send"
          />
          {chatInput.length > 0 && (
            <TouchableOpacity onPress={sendChat} style={st.sendBtn} disabled={sending}>
              <Icon name="send" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── CONTRÔLES droite (style TikTok) ────────────────────────── */}
      <View style={st.sideControls}>
        <TouchableOpacity onPress={toggleMute} style={st.sideBtn}>
          <Icon name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
          <Text style={st.sideBtnLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleVideo} style={st.sideBtn}>
          <Icon name={videoOff ? 'video-off' : 'video'} size={22} color="#fff" />
          <Text style={st.sideBtnLabel}>{videoOff ? 'Cam on' : 'Cam off'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={flipCam} style={st.sideBtn}>
          <Icon name="refresh-cw" size={22} color="#fff" />
          <Text style={st.sideBtnLabel}>Flip</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={askEnd} style={[st.sideBtn, st.endBtn]}>
          <Icon name="x" size={22} color="#fff" />
          <Text style={st.sideBtnLabel}>Fin</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
      <StreamContent liveId={liveId} onEnd={handleEnd} />
    </LiveKitRoom>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#000' },
  noVideo:     { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  noVideoText: { color: '#888', marginTop: 12, fontSize: 13 },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 14, paddingBottom: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 20,
  },
  iconBtn: { padding: 6 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0365A', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  liveDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  liveText:  { color: '#fff', fontWeight: '800', fontSize: 12 },
  timerText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  viewerText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  viewerAvatars: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  viewerAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#F0365A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#000',
  },
  viewerAvatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  toastsContainer: {
    position: 'absolute', top: Platform.OS === 'ios' ? 110 : 90,
    left: 14, zIndex: 30, gap: 4,
  },
  joinToast: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  joinToastText: { color: '#fff', fontSize: 12 },

  chatArea: {
    position: 'absolute', bottom: 0, left: 0,
    right: 100,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingLeft: 12, zIndex: 20,
  },
  chatList: { maxHeight: 220, marginBottom: 6 },
  chatBubble: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 5,
  },
  chatAvatar:         { width: 24, height: 24, borderRadius: 12, marginTop: 1 },
  chatAvatarFallback: { backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center' },
  chatAvatarText:     { color: '#fff', fontSize: 10, fontWeight: '800' },
  chatBubbleInner: {
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4, maxWidth: 200,
  },
  chatUser:    { color: '#F0365A', fontSize: 11, fontWeight: '700' },
  chatText:    { color: '#fff', fontSize: 13 },
  joinMsg:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  joinMsgText: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 24,
    paddingLeft: 12, paddingRight: 4, paddingVertical: 2, marginRight: 4,
  },
  chatInput: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 7 },
  sendBtn:   { backgroundColor: '#F0365A', borderRadius: 20, padding: 7 },

  sideControls: {
    position: 'absolute', right: 12,
    bottom: Platform.OS === 'ios' ? 80 : 60,
    alignItems: 'center', gap: 16, zIndex: 20,
  },
  sideBtn:      { alignItems: 'center', gap: 3 },
  sideBtnLabel: { color: '#fff', fontSize: 10 },
  endBtn:       { backgroundColor: '#F0365A', borderRadius: 24, padding: 11 },
});
