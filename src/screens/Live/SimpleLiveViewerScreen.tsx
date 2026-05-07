/**
 * SimpleLiveViewerScreen — Viewer du live spontané via LiveKit + chat REST+WS.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, FlatList, TextInput, KeyboardAvoidingView, ActivityIndicator, Image,
} from 'react-native';
import {
  LiveKitRoom,
  useRemoteParticipants,
  VideoTrack,
  useTracks,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';
import { liveService } from '../../services/liveService';
import type { LiveStream } from '../../services/liveService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav   = NativeStackNavigationProp<MainStackParamList>;
type RouteT = RouteProp<MainStackParamList, 'SimpleLiveViewer'>;

interface ChatMsg { id: string; user: string; avatar?: string | null; text: string; }

// ── Vidéo remote ─────────────────────────────────────────────────────────────
// Composant séparé avec l'identity du host pour que useParticipantTracks
// soit réactif et re-rende automatiquement quand le track arrive.

// RemoteVideo — utilise useTracks (RoomContext) pour voir TOUS les tracks
// remotes, puis filtre par source Camera. Re-render automatique quand le
// host publie ou que son track devient subscribed.
const RemoteVideo: React.FC = () => {
  const remotes = useRemoteParticipants();
  // useTracks sur Camera — inclut tous les participants remote (onlySubscribed: true par défaut)
  const allCamTracks = useTracks([Track.Source.Camera]);
  // Prend le premier track remote (celui du host)
  const hostTrack = allCamTracks[0] ?? null;

  if (remotes.length === 0) {
    return (
      <View style={[StyleSheet.absoluteFill, st.noVideo]}>
        <ActivityIndicator size="large" color="#F0365A" />
        <Text style={st.noVideoText}>Connexion au live...</Text>
      </View>
    );
  }

  if (!hostTrack) {
    return (
      <View style={[StyleSheet.absoluteFill, st.noVideo]}>
        <ActivityIndicator size="large" color="#F0365A" />
        <Text style={st.noVideoText}>En attente de la vidéo...</Text>
      </View>
    );
  }

  return <VideoTrack trackRef={hostTrack} style={StyleSheet.absoluteFill} objectFit="cover" />;
};

// ── Page principale ────────────────────────────────────────────────────────────

export const SimpleLiveViewerScreen: React.FC = () => {
  const nav   = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { liveId } = route.params;

  const [live,         setLive]         = useState<LiveStream | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [token,        setToken]        = useState<string | null>(null);
  const [wsUrl,        setWsUrl]        = useState<string | null>(null);
  const [ended,        setEnded]        = useState(false);
  const [viewerCount,  setViewerCount]  = useState(0);
  const [messages,     setMessages]     = useState<ChatMsg[]>([]);
  const [chatInput,    setChatInput]    = useState('');
  const [sending,      setSending]      = useState(false);
  const [showChat,     setShowChat]     = useState(true);

  const chatRef  = useRef<FlatList>(null);
  const wsRef    = useRef<WebSocket | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Charger le live + token viewer
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

  // Polling statut toutes les 10s
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await liveService.getStatus(liveId);
        setViewerCount(s.current_viewers ?? 0);
        if (s.status === 'ended') { setEnded(true); setToken(null); }
      } catch {}
    }, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, liveId]);

  // WS chat — réception uniquement
  useEffect(() => {
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken || !token) return;
    const ws = new WebSocket(`${WS_BASE_URL}/api/v1/social/comments/ws/live/${liveId}?token=${accessToken}`);
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
    return () => { clearInterval(ping); ws.close(); };
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
    if (pollRef.current) clearInterval(pollRef.current);
    wsRef.current?.close();
    nav.goBack();
  }, [nav]);

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
        <TouchableOpacity style={st.leaveBtn} onPress={handleLeave}>
          <Text style={st.leaveBtnText}>Retour</Text>
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

  const hostName = live?.user?.display_name ?? live?.user?.username ?? 'Live';

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect>
      <KeyboardAvoidingView
        style={st.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <RemoteVideo />

        {/* Top overlay */}
        <LinearGradient colors={['rgba(0,0,0,0.75)', 'transparent']} style={st.topOverlay}>
          <TouchableOpacity onPress={handleLeave} style={st.iconBtn}>
            <Icon name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={st.topCenter}>
            {live?.user?.avatar_url ? (
              <Image source={{ uri: live.user.avatar_url }} style={st.hostAvatar} />
            ) : (
              <View style={[st.hostAvatar, st.hostAvatarFallback]}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                  {hostName[0]?.toUpperCase()}
                </Text>
              </View>
            )}
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
              ListEmptyComponent={
                <Text style={st.chatEmpty}>Aucun message pour l'instant</Text>
              }
            />
            <View style={st.chatInputRow}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Message..."
                placeholderTextColor="#999"
                style={st.chatField}
                onSubmitEditing={sendChat}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={sendChat} style={st.sendBtn} disabled={sending}>
                <Icon name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Toggle chat */}
        <TouchableOpacity
          style={st.toggleChatBtn}
          onPress={() => setShowChat(p => !p)}
        >
          <Icon name="message-circle" size={20} color="#fff" />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </LiveKitRoom>
  );
};

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center' },
  noVideo: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  noVideoText: { color: '#999', marginTop: 12, fontSize: 14 },
  connectText: { color: '#999', marginTop: 12, fontSize: 14 },
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 14, paddingBottom: 24,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, zIndex: 10,
  },
  iconBtn: { padding: 8, marginTop: 2 },
  topCenter: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  hostAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#F0365A' },
  hostAvatarFallback: { backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center' },
  liveBadgeRow: { flexDirection: 'row', marginBottom: 2 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0365A', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 4 },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  liveTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hostName: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, gap: 4,
    marginTop: 2,
  },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  chatContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '45%', paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 18,
  },
  chatList: { flexGrow: 0, maxHeight: 240, marginBottom: 8 },
  chatBubble: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  chatUser: { color: '#F0365A', fontSize: 11, fontWeight: '700' },
  chatText: { color: '#fff', fontSize: 13, flexShrink: 1 },
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
    bottom: Platform.OS === 'ios' ? 90 : 72,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, padding: 10, zIndex: 20,
  },
  endedTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 16 },
  endedSub: { color: '#999', fontSize: 14, marginTop: 4 },
  leaveBtn: {
    marginTop: 24, backgroundColor: '#F0365A',
    borderRadius: 24, paddingHorizontal: 32, paddingVertical: 12,
  },
  leaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
