/**
 * LiveViewerScreen — Viewer du concert live via LiveKit SDK.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, FlatList, TextInput, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import {
  LiveKitRoom,
  useRemoteParticipants,
  VideoTrack,
  useParticipantTracks,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { concertService } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import type { Concert } from '../../types';

interface Props {
  concertId: string;
  onBack?: () => void;
}

interface LiveChat {
  id: string;
  username: string;
  text: string;
}

// ── Video view inside the room ────────────────────────────────────────────────
const ArtistVideoView: React.FC = () => {
  const remoteParticipants = useRemoteParticipants();
  const artist = remoteParticipants[0] ?? null;
  const tracks = useParticipantTracks([Track.Source.Camera], artist?.identity ?? '');
  const videoTrack = tracks[0] ?? null;

  if (!artist || !videoTrack) {
    return (
      <View style={styles.noVideoCenter}>
        <ActivityIndicator size="large" color="#E53E3E" />
        <Text style={styles.connectingText}>En attente du stream...</Text>
      </View>
    );
  }

  return (
    <VideoTrack trackRef={videoTrack} style={StyleSheet.absoluteFill} objectFit="cover" />
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const LiveViewerScreen: React.FC<Props> = ({ concertId, onBack }) => {
  const nav = useNavigation();

  const [concert, setConcert] = useState<Concert | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [streamEnded, setStreamEnded] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<LiveChat[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [sending, setSending] = useState(false);

  const chatListRef = useRef<FlatList>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);

  // Load concert + get viewer token
  useEffect(() => {
    (async () => {
      try {
        const c = await concertService.getById(concertId);
        setConcert(c);
        if (c.status !== 'live') {
          setStreamEnded(true);
          setLoading(false);
          return;
        }
        const result = await concertService.getStreamToken(concertId);
        setToken(result.token);
        setWsUrl(result.livekit_url);
        setViewerCount(c.current_viewers + 1);
      } catch {}
      setLoading(false);
    })();
  }, [concertId]);

  // Poll viewer count + check if stream ended
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await concertService.getStreamStatus(concertId);
        setViewerCount(s.current_viewers ?? 0);
        if (!s.is_live) {
          setStreamEnded(true);
          setToken(null);
        }
      } catch {}
    }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, concertId]);

  // WS chat dédié — réception uniquement via /social/comments/ws/concert/{id}
  useEffect(() => {
    if (!token) return;
    const accessToken = storage.getString(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken) return;
    const ws = new WebSocket(`${WS_BASE_URL}/api/v1/social/comments/ws/concert/${concertId}?token=${accessToken}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'comment_added' && d.comment) {
          const c = d.comment;
          setChatMessages(prev => [...prev, {
            id: c.id ?? `${Date.now()}-${Math.random()}`,
            username: c.author?.display_name ?? c.author?.username ?? 'Anonyme',
            text: c.body,
          }]);
          setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
        }
      } catch {}
    };
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
    }, 25_000);
    return () => { clearInterval(ping); ws.close(); };
  }, [concertId, token]);

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput('');
    setSending(true);
    try {
      await apiClient.post(Endpoints.social.comments, { body: text, concert_id: concertId });
    } catch {}
    finally { setSending(false); }
  }, [chatInput, concertId, sending]);

  const handleLeave = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    wsRef.current?.close();
    if (onBack) onBack();
    else nav.goBack();
  }, [nav, onBack]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#E53E3E" />
      </View>
    );
  }

  if (streamEnded) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Icon name="radio" size={48} color="#666" />
        <Text style={styles.endedTitle}>Le live est terminé</Text>
        <Text style={styles.endedSub}>{concert?.title ?? ''}</Text>
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!token || !wsUrl) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#E53E3E" />
        <Text style={styles.connectingText}>Connexion au live...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        {/* Artist video — full screen */}
        <ArtistVideoView />

        {/* Top overlay */}
        <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={styles.topOverlay}>
          <TouchableOpacity onPress={handleLeave} style={styles.backBtn}>
            <Icon name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.titleText} numberOfLines={1}>{concert?.title}</Text>
          </View>
          <View style={styles.viewerBadge}>
            <Icon name="eye" size={14} color="#fff" />
            <Text style={styles.viewerText}>{viewerCount}</Text>
          </View>
        </LinearGradient>

        {/* Chat */}
        {showChat && (
          <View style={styles.chatContainer}>
            <FlatList
              ref={chatListRef}
              data={chatMessages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.chatBubble}>
                  <Text style={styles.chatUser}>{item.username}</Text>
                  <Text style={styles.chatText}>{item.text}</Text>
                </View>
              )}
              style={styles.chatList}
              showsVerticalScrollIndicator={false}
            />
            <View style={styles.chatInputRow}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Message..."
                placeholderTextColor="#999"
                style={styles.chatInputField}
                onSubmitEditing={handleSendChat}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={handleSendChat} style={styles.sendBtn}>
                <Icon name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.toggleChatBtn}
          onPress={() => setShowChat(p => !p)}
        >
          <Icon name="message-circle" size={20} color="#fff" />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </LiveKitRoom>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center' },
  noVideoCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  connectingText: { color: '#999', marginTop: 12, fontSize: 14 },
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 16, paddingBottom: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 10,
  },
  backBtn: { padding: 8 },
  topCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginHorizontal: 8 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E53E3E', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 5 },
  liveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  titleText: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, gap: 4,
  },
  viewerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  chatContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '45%', paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  chatList: { flexGrow: 0, maxHeight: 250, marginBottom: 8 },
  chatBubble: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4,
  },
  chatUser: { color: '#E53E3E', fontSize: 11, fontWeight: '700' },
  chatText: { color: '#fff', fontSize: 13 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24, paddingLeft: 14, paddingRight: 4,
  },
  chatInputField: {
    flex: 1, color: '#fff', fontSize: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  sendBtn: { backgroundColor: '#E53E3E', borderRadius: 20, padding: 8 },
  toggleChatBtn: {
    position: 'absolute', right: 12,
    bottom: Platform.OS === 'ios' ? 90 : 70,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, padding: 10, zIndex: 20,
  },
  endedTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 16 },
  endedSub: { color: '#999', fontSize: 14, marginTop: 4 },
  leaveBtn: {
    marginTop: 24, backgroundColor: '#E53E3E',
    borderRadius: 24, paddingHorizontal: 32, paddingVertical: 12,
  },
  leaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
