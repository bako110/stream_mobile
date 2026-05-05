import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, Image, Alert, Modal, Pressable,
  ScrollView, Dimensions, Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import { authService } from '../../services/authService';
import { apiClient, Endpoints } from '../../api';
import { launchImageLibrary } from 'react-native-image-picker';
import { useCommunityWebSocket } from '../../hooks/useCommunityWebSocket';
import type { CommunityWsPayload } from '../../hooks/useCommunityWebSocket';
import type { CommunityMessageData } from '../../services/communityService';

const { width: W, height: H } = Dimensions.get('window');

interface RouteParams { communityId: string; communityName: string; }
interface TypingUser { user_id: string; username: string | null; display_name: string | null; }
interface ReactionSummary { emoji: string; count: number; user_ids: string[]; }
interface PollOption { id: string; text: string; votes: number; }
interface PollData {
  poll_id: string; question: string; options: PollOption[];
  total_votes: number; my_votes: string[];
  ends_at: string | null; allow_multiple: boolean; ended: boolean;
}
type CommunityMessage = Omit<CommunityMessageData, 'poll'> & { poll: PollData | null; };
type ChatTab = 'discussion' | 'announcements' | 'media' | 'polls';

const TABS: { key: ChatTab; label: string; icon: string }[] = [
  { key: 'discussion',    label: 'Discussion',  icon: 'message-circle' },
  { key: 'announcements', label: 'Annonces',    icon: 'bell' },
  { key: 'media',         label: 'Médias',      icon: 'image' },
  { key: 'polls',         label: 'Sondages',    icon: 'bar-chart-2' },
];
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  const d = new Date(iso), today = new Date();
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}
function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// ─────────────────────────────────────────────────────────────────────────────

export const CommunityChatScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute();
  const { communityId, communityName } = route.params as RouteParams;
  const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

  const [activeTab,      setActiveTab]      = useState<ChatTab>('discussion');
  const [messages,       setMessages]       = useState<CommunityMessage[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [sending,        setSending]        = useState(false);
  const [text,           setText]           = useState('');
  const [myId,           setMyId]           = useState<string | null>(null);
  const [myRole,         setMyRole]         = useState<string | null>(null);
  const [page,           setPage]           = useState(1);
  const [hasMore,        setHasMore]        = useState(true);
  const [editingMsg,     setEditingMsg]     = useState<CommunityMessage | null>(null);
  const [replyingTo,     setReplyingTo]     = useState<CommunityMessage | null>(null);
  const [menuMsg,        setMenuMsg]        = useState<CommunityMessage | null>(null);
  const [pinnedMsgs,     setPinnedMsgs]     = useState<CommunityMessage[]>([]);
  const [showPinned,     setShowPinned]     = useState(false);
  const [communityTitle, setCommunityTitle] = useState(communityName);
  const [typingUsers,    setTypingUsers]    = useState<TypingUser[]>([]);
  const [imgViewerList,  setImgViewerList]  = useState<string[]>([]);
  const [imgViewerIdx,   setImgViewerIdx]   = useState(0);
  const [imgViewerOpen,  setImgViewerOpen]  = useState(false);
  const [pollModal,      setPollModal]      = useState(false);
  const [pollQ,          setPollQ]          = useState('');
  const [pollOpts,       setPollOpts]       = useState(['', '']);
  const [pollMulti,      setPollMulti]      = useState(false);

  const listRef        = useRef<FlatList>(null);
  const inputRef       = useRef<TextInput>(null);
  const typingTimers   = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendBtnAnim    = useRef(new Animated.Value(0)).current;

  const isAdmin    = myRole === 'admin';
  const isMod      = myRole === 'moderator';
  const canAnnounce = isAdmin || isMod;

  // animate send button
  useEffect(() => {
    Animated.spring(sendBtnAnim, { toValue: text.trim() ? 1 : 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
  }, [text]);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const { sendWsMessage, sendTyping, isConnected, onlineCount } = useCommunityWebSocket(
    communityId,
    useCallback((payload: CommunityWsPayload) => {
      if (payload.type === 'community_message' || payload.type === 'community_message_sent' || payload.type === 'community_announcement') {
        const msg = payload as unknown as CommunityMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setTypingUsers(p => p.filter(u => u.user_id !== msg.sender_id));
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } else if (payload.type === 'community_poll_created') {
        const msg = payload as unknown as CommunityMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } else if (payload.type === 'community_message_edited') {
        const e = payload as unknown as CommunityMessage;
        setMessages(prev => prev.map(m => m.id === e.id ? { ...m, content: e.content, edited_at: e.edited_at } : m));
      } else if (payload.type === 'community_message_deleted') {
        setMessages(prev => prev.filter(m => m.id !== payload.id));
      } else if (payload.type === 'community_message_pinned' || payload.type === 'community_message_unpinned') {
        const pin = payload.type === 'community_message_pinned';
        const msg = payload as unknown as CommunityMessage;
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: pin } : m));
        loadPinned();
      } else if (payload.type === 'community_message_reaction') {
        const { message_id, reactions } = payload as any;
        setMessages(prev => prev.map(m => m.id === message_id ? { ...m, reactions } : m));
      } else if (payload.type === 'community_poll_updated') {
        const { poll_id, results } = payload as any;
        setMessages(prev => prev.map(m => m.poll?.poll_id === poll_id ? { ...m, poll: results } : m));
      } else if (payload.type === 'typing') {
        const { user_id, is_typing } = payload;
        if (is_typing) {
          setTypingUsers(prev => prev.some(u => u.user_id === user_id) ? prev : [...prev, { user_id, username: payload.username ?? null, display_name: payload.display_name ?? null }]);
          if (typingTimers.current[user_id]) clearTimeout(typingTimers.current[user_id]);
          typingTimers.current[user_id] = setTimeout(() => setTypingUsers(p => p.filter(u => u.user_id !== user_id)), 4000);
        } else {
          if (typingTimers.current[user_id]) clearTimeout(typingTimers.current[user_id]);
          setTypingUsers(p => p.filter(u => u.user_id !== user_id));
        }
      } else if (payload.type === 'community_member_kicked') {
        setMyId(id => {
          if (id && payload.user_id === id) Alert.alert('Exclu', 'Vous avez été exclu de cette communauté.', [{ text: 'OK', onPress: () => nav.goBack() }]);
          return id;
        });
      } else if (payload.type === 'community_member_left') {
        setTypingUsers(p => p.filter(u => u.user_id !== payload.user_id));
      } else if (payload.type === 'community_updated') {
        setCommunityTitle(payload.name);
      } else if (payload.type === 'community_deleted') {
        Alert.alert('Communauté supprimée', 'Cette communauté a été supprimée.', [{ text: 'OK', onPress: () => nav.goBack() }]);
      }
    }, [nav]),
  );

  // ── Chargement ─────────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (p = 1, prepend = false, tab: ChatTab = 'discussion') => {
    const typeMap: Record<ChatTab, string | undefined> = {
      discussion: undefined, announcements: 'announcement', media: 'image', polls: 'poll',
    };
    try {
      const msgs = await communityService.getMessages(communityId, p, 30, typeMap[tab]);
      // API renvoie du plus récent au plus ancien — on inverse pour afficher chronologiquement
      const sorted = [...msgs].reverse() as CommunityMessage[];
      if (prepend) {
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...sorted.filter(m => !ids.has(m.id)), ...prev];
        });
      } else {
        setMessages(sorted);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
      }
      setHasMore(msgs.length === 30);
    } catch {}
    finally { setLoading(false); setLoadingMore(false); }
  }, [communityId]);

  const loadPinned = useCallback(async () => {
    try { setPinnedMsgs((await communityService.getPinnedMessages(communityId)) as CommunityMessage[]); } catch {}
  }, [communityId]);

  useEffect(() => {
    authService.getMe().then(u => {
      setMyId(String(u.id));
      communityService.getMyRole(communityId).then(setMyRole).catch(() => {});
    }).catch(() => {});
    loadMessages(1, false, 'discussion');
    loadPinned();
  }, [communityId]);

  useEffect(() => {
    setLoading(true); setMessages([]); setPage(1);
    loadMessages(1, false, activeTab);
  }, [activeTab]);

  useEffect(() => () => {
    Object.values(typingTimers.current).forEach(clearTimeout);
    if (typingDebounce.current) clearTimeout(typingDebounce.current);
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    loadMessages(next, true, activeTab);
  }, [hasMore, loadingMore, loading, page, activeTab]);

  // ── Typing ─────────────────────────────────────────────────────────────────
  const handleTextChange = useCallback((val: string) => {
    setText(val);
    if (!isConnected) return;
    if (typingDebounce.current) clearTimeout(typingDebounce.current);
    sendTyping(true);
    typingDebounce.current = setTimeout(() => sendTyping(false), 2000);
  }, [isConnected, sendTyping]);

  // ── Envoyer ────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    if (typingDebounce.current) clearTimeout(typingDebounce.current);
    sendTyping(false);
    setSending(true);
    setText('');

    if (editingMsg) {
      const msgId = editingMsg.id;
      setEditingMsg(null);
      if (isConnected) {
        sendWsMessage({ type: 'edit', message_id: msgId, content });
      } else {
        try {
          const updated = await communityService.editMessage(communityId, msgId, content);
          setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: updated.content, edited_at: updated.edited_at } : m));
        } catch { setText(content); }
      }
      setSending(false);
      return;
    }

    const reply_to_id = replyingTo?.id ?? null;
    setReplyingTo(null);
    const msgType = activeTab === 'announcements' ? 'announcement' : 'text';

    if (isConnected) {
      sendWsMessage({ type: 'message', content, message_type: msgType, reply_to_id });
    } else {
      try {
        const msg = await communityService.sendMessage(communityId, content, msgType, [], reply_to_id ?? undefined);
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } catch { setText(content); }
    }
    setSending(false);
  };

  // ── Envoyer image ──────────────────────────────────────────────────────────
  const handlePickMedia = () => {
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 4, quality: 0.8 }, async (resp) => {
      if (resp.didCancel || !resp.assets?.length) return;
      setSending(true);
      try {
        const urls: string[] = [];
        for (const asset of resp.assets) {
          if (!asset.uri) continue;
          const fd = new FormData();
          fd.append('file', { uri: asset.uri, name: `msg_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
          const res = await apiClient.upload<{ uploaded: { url: string }[] }>(Endpoints.upload.images('communities'), fd);
          const url = res.data?.uploaded?.[0]?.url;
          if (url) urls.push(url);
        }
        if (urls.length > 0) {
          const msg = await communityService.sendMessage(communityId, '', 'image', urls);
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
        }
      } catch {}
      finally { setSending(false); }
    });
  };

  // ── Réaction ───────────────────────────────────────────────────────────────
  const handleReact = async (msg: CommunityMessage, emoji: string) => {
    setMenuMsg(null);
    try {
      const res = await apiClient.post<{ reactions: ReactionSummary[] }>(
        `/api/v1/communities/${communityId}/messages/${msg.id}/react`, { emoji }
      );
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: res.data.reactions } : m));
    } catch {}
  };

  // ── Pin ────────────────────────────────────────────────────────────────────
  const handlePin = async (msg: CommunityMessage, pin: boolean) => {
    setMenuMsg(null);
    try {
      await apiClient.post(`/api/v1/communities/${communityId}/messages/${msg.id}/pin?pin=${pin}`);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: pin } : m));
      loadPinned();
    } catch {}
  };

  // ── Vote sondage ───────────────────────────────────────────────────────────
  const handleVote = async (msg: CommunityMessage, optionId: string) => {
    if (!msg.poll || msg.poll.ended) return;
    const current = msg.poll.my_votes;
    const already = current.includes(optionId);
    const newVotes = already
      ? current.filter(v => v !== optionId)
      : msg.poll.allow_multiple ? [...current, optionId] : [optionId];
    try {
      const res = await apiClient.post<PollData>(
        `/api/v1/communities/${communityId}/polls/${msg.poll.poll_id}/vote`, { option_ids: newVotes }
      );
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, poll: res.data } : m));
    } catch {}
  };

  // ── Créer sondage ──────────────────────────────────────────────────────────
  const handleCreatePoll = async () => {
    if (!pollQ.trim() || pollOpts.filter(o => o.trim()).length < 2) {
      Alert.alert('Sondage invalide', 'Une question et au moins 2 options sont requises.');
      return;
    }
    setSending(true); setPollModal(false);
    try {
      const res = await apiClient.post(`/api/v1/communities/${communityId}/polls`, {
        question: pollQ.trim(), options: pollOpts.filter(o => o.trim()), allow_multiple: pollMulti,
      });
      setMessages(prev => [...prev, res.data as CommunityMessage]);
      setPollQ(''); setPollOpts(['', '']); setPollMulti(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch { Alert.alert('Erreur', 'Impossible de créer le sondage'); }
    finally { setSending(false); }
  };

  const handleDelete = (msg: CommunityMessage) => {
    setMenuMsg(null);
    Alert.alert('Supprimer', 'Supprimer ce message ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => {
        if (isConnected) sendWsMessage({ type: 'delete', message_id: msg.id });
        else communityService.deleteMessage(communityId, msg.id).then(() =>
          setMessages(prev => prev.filter(m => m.id !== msg.id))
        ).catch(() => {});
      }},
    ]);
  };

  const handleEdit = (msg: CommunityMessage) => {
    setMenuMsg(null); setEditingMsg(msg); setText(msg.content ?? '');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const openViewer = (list: string[], idx: number) => {
    setImgViewerList(list); setImgViewerIdx(idx); setImgViewerOpen(true);
  };

  const typingText = (() => {
    if (!typingUsers.length) return null;
    const names = typingUsers.map(u => u.display_name || u.username || '…');
    if (names.length === 1) return `${names[0]} écrit…`;
    if (names.length === 2) return `${names[0]} et ${names[1]} écrivent…`;
    return `${names[0]} et ${names.length - 1} autres écrivent…`;
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // ── Composants de rendu ───────────────────────────────────────────────────

  const Avatar = ({ msg, size = 32 }: { msg: CommunityMessage; size?: number }) => (
    <TouchableOpacity onPress={() => nav.navigate('UserProfile', { userId: msg.sender_id })} style={{ marginRight: 8, alignSelf: 'flex-end' }}>
      {msg.sender_avatar_url ? (
        <Image source={{ uri: msg.sender_avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: size * 0.38 }}>
            {(msg.sender_display_name || msg.sender_username || '?')[0].toUpperCase()}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const Reactions = ({ msg }: { msg: CommunityMessage }) => {
    if (!msg.reactions?.length) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 5 }}>
        {msg.reactions.map(r => {
          const mine = myId ? r.user_ids.includes(myId) : false;
          return (
            <TouchableOpacity key={r.emoji} onPress={() => handleReact(msg, r.emoji)}
              style={[S.reactionChip, { backgroundColor: mine ? colors.primary + '20' : colors.backgroundSecondary, borderColor: mine ? colors.primary : 'transparent', borderWidth: mine ? 1 : 0 }]}>
              <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: mine ? colors.primary : colors.textSecondary, marginLeft: 3 }}>{r.count}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity onPress={() => setMenuMsg(msg)}
          style={[S.reactionChip, { backgroundColor: colors.backgroundSecondary, borderColor: 'transparent' }]}>
          <Icon name="smile" size={13} color={colors.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const MediaGrid = ({ urls, containerW }: { urls: string[]; containerW: number }) => {
    const n = Math.min(urls.length, 4);
    const gap = 3;
    if (n === 1) {
      return (
        <TouchableOpacity onPress={() => openViewer(urls, 0)} activeOpacity={0.9}>
          <Image source={{ uri: urls[0] }} style={{ width: containerW, height: containerW * 0.65, borderRadius: 10 }} resizeMode="cover" />
        </TouchableOpacity>
      );
    }
    const half = (containerW - gap) / 2;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {urls.slice(0, 4).map((url, i) => (
          <TouchableOpacity key={i} onPress={() => openViewer(urls, i)} activeOpacity={0.9} style={{ position: 'relative' }}>
            <Image source={{ uri: url }} style={{ width: half, height: half * 0.75, borderRadius: 8 }} resizeMode="cover" />
            {i === 3 && urls.length > 4 && (
              <View style={[S.mediaMore, { borderRadius: 8 }]}>
                <Text style={S.mediaMoreText}>+{urls.length - 4}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const PollCard = ({ msg }: { msg: CommunityMessage }) => {
    const poll = msg.poll;
    if (!poll) return null;
    const total = poll.total_votes || 0;
    return (
      <View style={[S.pollCard, { backgroundColor: colors.background, borderColor: colors.divider }]}>
        <Text style={[S.pollQuestion, { color: colors.textPrimary }]}>{poll.question}</Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          {poll.options.map(opt => {
            const voted = poll.my_votes.includes(opt.id);
            const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
            return (
              <TouchableOpacity key={opt.id} onPress={() => !poll.ended && handleVote(msg, opt.id)} disabled={poll.ended} activeOpacity={0.7}>
                <View style={[S.pollOptWrap, { borderColor: voted ? colors.primary : colors.divider, backgroundColor: voted ? colors.primary + '08' : 'transparent' }]}>
                  <View style={[S.pollBar, { width: `${pct}%` as any, backgroundColor: voted ? colors.primary + '25' : colors.divider + '80' }]} />
                  <View style={S.pollOptRow}>
                    <View style={[S.pollDot, { backgroundColor: voted ? colors.primary : colors.divider }]}>
                      {voted && <Icon name="check" size={9} color="#fff" />}
                    </View>
                    <Text style={[S.pollOptText, { color: colors.textPrimary, fontWeight: voted ? '700' : '400' }]} numberOfLines={2}>{opt.text}</Text>
                    <Text style={[S.pollPct, { color: voted ? colors.primary : colors.textTertiary }]}>{pct}%</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={[S.pollFooter, { borderTopColor: colors.divider }]}>
          <Icon name="users" size={11} color={colors.textTertiary} />
          <Text style={[S.pollFooterText, { color: colors.textTertiary }]}>
            {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}
            {poll.ended ? ' · Terminé' : poll.ends_at ? ` · Fin ${new Date(poll.ends_at).toLocaleDateString('fr-FR')}` : ''}
            {poll.allow_multiple ? ' · Choix multiple' : ''}
          </Text>
        </View>
      </View>
    );
  };

  // ── Rendu message ──────────────────────────────────────────────────────────

  const renderMessage = ({ item: msg, index }: { item: CommunityMessage; index: number }) => {
    const isMe = msg.sender_id === myId;
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const showDate = !prev || !sameDay(prev.created_at, msg.created_at);
    const isFirst = !prev || prev.sender_id !== msg.sender_id || !sameDay(prev.created_at, msg.created_at);
    const isLast  = !next || next.sender_id !== msg.sender_id || !sameDay(next.created_at, msg.created_at);
    const isAnnouncement = msg.message_type === 'announcement';
    const isPoll = msg.message_type === 'poll';
    const isMedia = msg.message_type === 'image' || msg.message_type === 'media';

    // ── Séparateur de date ──
    const DateSep = showDate ? (
      <View style={S.dateSepRow}>
        <View style={[S.dateSepLine, { backgroundColor: colors.divider }]} />
        <View style={[S.dateSepPill, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[S.dateSepText, { color: colors.textTertiary }]}>{fmtDate(msg.created_at)}</Text>
        </View>
        <View style={[S.dateSepLine, { backgroundColor: colors.divider }]} />
      </View>
    ) : null;

    // ── ANNONCE ──────────────────────────────────────────────────────────────
    if (isAnnouncement) {
      return (
        <View style={{ marginHorizontal: 12 }}>
          {DateSep}
          <TouchableOpacity activeOpacity={0.85} onLongPress={() => setMenuMsg(msg)} delayLongPress={350}
            style={[S.announceBubble, { backgroundColor: '#F59E0B0D', borderColor: '#F59E0B40' }]}>
            <View style={S.announceTop}>
              <View style={[S.announceIconBox, { backgroundColor: '#F59E0B20' }]}>
                <Icon name="bell" size={14} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.announceLabel, { color: '#D97706' }]}>Annonce</Text>
                <Text style={[S.announceMeta, { color: colors.textTertiary }]}>
                  {msg.sender_display_name || msg.sender_username} · {fmtTime(msg.created_at)}
                </Text>
              </View>
              {msg.is_pinned && <View style={[S.pinnedBadge, { backgroundColor: '#F59E0B20' }]}><Icon name="bookmark" size={11} color="#F59E0B" /></View>}
            </View>
            <Text style={[S.announceText, { color: colors.textPrimary }]}>{msg.content}</Text>
            <Reactions msg={msg} />
          </TouchableOpacity>
        </View>
      );
    }

    // ── SONDAGE ──────────────────────────────────────────────────────────────
    if (isPoll) {
      return (
        <View style={{ marginHorizontal: 12 }}>
          {DateSep}
          <TouchableOpacity activeOpacity={0.9} onLongPress={() => setMenuMsg(msg)} delayLongPress={350}
            style={[S.pollMessageWrap, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            <View style={S.pollMsgTop}>
              <View style={[S.pollIconBox, { backgroundColor: colors.primary + '20' }]}>
                <Icon name="bar-chart-2" size={14} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.pollMsgLabel, { color: colors.primary }]}>Sondage</Text>
                <Text style={[S.announceMeta, { color: colors.textTertiary }]}>
                  {msg.sender_display_name || msg.sender_username} · {fmtTime(msg.created_at)}
                </Text>
              </View>
              {msg.is_pinned && <View style={[S.pinnedBadge, { backgroundColor: colors.primary + '20' }]}><Icon name="bookmark" size={11} color={colors.primary} /></View>}
            </View>
            <PollCard msg={msg} />
            <Reactions msg={msg} />
          </TouchableOpacity>
        </View>
      );
    }

    // ── MÉDIA & TEXTE ────────────────────────────────────────────────────────
    const maxW = W * 0.72;
    const bubbleBg = isMe ? colors.primary : (colors.surfaceElevated ?? colors.backgroundSecondary);
    const textColor = isMe ? '#fff' : colors.textPrimary;
    const timeColor = isMe ? 'rgba(255,255,255,0.55)' : colors.textTertiary;

    // bordures de bulle selon position dans le groupe
    const myRadius = { borderBottomRightRadius: isLast ? 4 : 16 };
    const otherRadius = { borderBottomLeftRadius: isLast ? 4 : 16 };

    return (
      <View style={{ marginHorizontal: 12 }}>
        {DateSep}
        <View style={[S.msgRow, isMe ? S.msgRowMe : S.msgRowOther, { marginBottom: isLast ? 10 : 2 }]}>
          {/* Avatar gauche */}
          {!isMe && (isLast ? <Avatar msg={msg} /> : <View style={{ width: 40 }} />)}

          <View style={{ maxWidth: maxW }}>
            {/* Nom expéditeur */}
            {!isMe && isFirst && (
              <Text style={[S.senderName, { color: colors.primary, marginLeft: 2, marginBottom: 3 }]}>
                {msg.sender_display_name || msg.sender_username}
              </Text>
            )}

            <TouchableOpacity activeOpacity={0.85} onLongPress={() => setMenuMsg(msg)} delayLongPress={350}>
              {/* Réponse parente */}
              {msg.reply_to && (
                <View style={[S.replyBox, { backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : colors.backgroundSecondary, borderLeftColor: colors.primary }]}>
                  <Text style={[S.replyName, { color: colors.primary }]}>{msg.reply_to.sender_display_name || msg.reply_to.sender_username}</Text>
                  <Text style={[S.replyText, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]} numberOfLines={1}>
                    {msg.reply_to.content || (msg.reply_to.message_type === 'image' ? '📷 Image' : '…')}
                  </Text>
                </View>
              )}

              {/* Bulle */}
              {isMedia ? (
                <View style={{ gap: 4 }}>
                  <MediaGrid urls={msg.media_urls} containerW={maxW} />
                  {msg.content ? (
                    <View style={[S.bubble, { backgroundColor: bubbleBg }, isMe ? myRadius : otherRadius]}>
                      <Text style={[S.msgText, { color: textColor }]}>{msg.content}</Text>
                    </View>
                  ) : null}
                  <Text style={[S.floatTime, { color: colors.textTertiary, textAlign: isMe ? 'right' : 'left' }]}>
                    {msg.is_pinned ? '📌 ' : ''}{fmtTime(msg.created_at)}
                  </Text>
                </View>
              ) : (
                <View style={[S.bubble, { backgroundColor: bubbleBg }, isMe ? myRadius : otherRadius]}>
                  {msg.is_pinned && (
                    <View style={S.pinnedRow}>
                      <Icon name="bookmark" size={10} color={isMe ? 'rgba(255,255,255,0.7)' : '#F59E0B'} />
                      <Text style={{ color: isMe ? 'rgba(255,255,255,0.7)' : '#F59E0B', fontSize: 9, fontWeight: '700', marginLeft: 3 }}>Épinglé</Text>
                    </View>
                  )}
                  <Text style={[S.msgText, { color: textColor }]}>{msg.content}</Text>
                  <View style={S.msgMeta}>
                    {msg.edited_at && <Text style={[S.edited, { color: timeColor }]}>modifié · </Text>}
                    <Text style={[S.msgTime, { color: timeColor }]}>{fmtTime(msg.created_at)}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>

            <Reactions msg={msg} />
          </View>
        </View>
      </View>
    );
  };

  // ── Onglet Médias ──────────────────────────────────────────────────────────
  const renderMediaTab = () => {
    const all = messages.filter(m => m.media_urls?.length > 0).flatMap(m => m.media_urls);
    if (!all.length) return (
      <View style={S.emptyState}>
        <View style={[S.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}><Icon name="image" size={28} color={colors.textTertiary} /></View>
        <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>Aucun média</Text>
        <Text style={[S.emptySub, { color: colors.textTertiary }]}>Les photos partagées apparaîtront ici</Text>
      </View>
    );
    const size = (W - 4) / 3;
    return (
      <FlatList
        data={all}
        numColumns={3}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <TouchableOpacity onPress={() => openViewer(all, index)} activeOpacity={0.85}>
            <Image source={{ uri: item }} style={{ width: size, height: size, margin: 0.5 }} resizeMode="cover" />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
      />
    );
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  const EmptyState = () => {
    const cfg: Record<ChatTab, { icon: string; title: string; sub: string }> = {
      discussion:    { icon: 'message-circle', title: 'Aucun message', sub: 'Soyez le premier à écrire !' },
      announcements: { icon: 'bell',           title: 'Aucune annonce', sub: 'Les annonces des admins apparaîtront ici' },
      media:         { icon: 'image',           title: 'Aucun média', sub: 'Les photos partagées apparaîtront ici' },
      polls:         { icon: 'bar-chart-2',     title: 'Aucun sondage', sub: 'Créez un sondage pour consulter la communauté' },
    };
    const c = cfg[activeTab];
    return (
      <View style={S.emptyState}>
        <View style={[S.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
          <Icon name={c.icon} size={28} color={colors.textTertiary} />
        </View>
        <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>{c.title}</Text>
        <Text style={[S.emptySub, { color: colors.textTertiary }]}>{c.sub}</Text>
      </View>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: colors.surface, paddingTop: STATUS_H + 6, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={S.headerBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[S.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{communityTitle}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
            <View style={[S.onlineDot, { backgroundColor: isConnected ? '#22C55E' : '#94A3B8' }]} />
            <Text style={[S.headerSub, { color: colors.textTertiary }]}>
              {isConnected ? (onlineCount > 0 ? `${onlineCount} en ligne` : 'En ligne') : 'Connexion…'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {pinnedMsgs.length > 0 && (
            <TouchableOpacity onPress={() => setShowPinned(true)} style={S.headerBtn}>
              <Icon name="bookmark" size={18} color="#F59E0B" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => nav.navigate('CommunityDetail', { communityId })} style={S.headerBtn}>
            <Icon name="info" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Onglets ── */}
      <View style={[S.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={[S.tabItem, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setActiveTab(tab.key)}>
              <Icon name={tab.icon} size={13} color={active ? colors.primary : colors.textTertiary} />
              <Text style={[S.tabLabel, { color: active ? colors.primary : colors.textTertiary }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Contenu principal ── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : activeTab === 'media' ? renderMediaTab() : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={m => m.id}
              renderItem={renderMessage}
              contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.15}
              onEndReached={loadMore}
              ListHeaderComponent={loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} /> : null}
              ListEmptyComponent={<EmptyState />}
              onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            />

            {/* Typing */}
            {typingText && (
              <View style={[S.typingRow, { backgroundColor: colors.surface }]}>
                <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                  {[0,1,2].map(i => <View key={i} style={[S.typingDot, { backgroundColor: colors.textTertiary }]} />)}
                </View>
                <Text style={[S.typingText, { color: colors.textTertiary }]}>{typingText}</Text>
              </View>
            )}

            {/* Reply banner */}
            {replyingTo && (
              <View style={[S.replyBanner, { backgroundColor: colors.surface, borderTopColor: colors.divider, borderLeftColor: colors.primary }]}>
                <Icon name="corner-up-left" size={14} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[S.replyBannerName, { color: colors.primary }]}>{replyingTo.sender_display_name || replyingTo.sender_username}</Text>
                  <Text style={[S.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {replyingTo.content || (replyingTo.media_urls?.length ? '📷 Image' : '…')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="x" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Edit banner */}
            {editingMsg && (
              <View style={[S.editBanner, { backgroundColor: colors.surface, borderTopColor: colors.primary }]}>
                <Icon name="edit-2" size={14} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[S.replyBannerName, { color: colors.primary }]}>Modification</Text>
                  <Text style={[S.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>{editingMsg.content}</Text>
                </View>
                <TouchableOpacity onPress={() => { setEditingMsg(null); setText(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="x" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Barre de saisie */}
            <View style={[S.inputBar, { backgroundColor: colors.surface, borderTopColor: (editingMsg || replyingTo) ? 'transparent' : colors.divider }]}>
              <TouchableOpacity onPress={handlePickMedia} disabled={sending} style={S.inputIconBtn}>
                <Icon name="image" size={21} color={colors.textTertiary} />
              </TouchableOpacity>
              {canAnnounce && (
                <TouchableOpacity onPress={() => setPollModal(true)} disabled={sending} style={S.inputIconBtn}>
                  <Icon name="bar-chart-2" size={21} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
              <TextInput
                ref={inputRef}
                style={[S.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.border ?? colors.divider }]}
                value={text}
                onChangeText={handleTextChange}
                placeholder={activeTab === 'announcements' ? 'Écrire une annonce…' : 'Message…'}
                placeholderTextColor={colors.textDisabled ?? colors.textTertiary}
                multiline maxLength={2000}
              />
              <Animated.View style={{ transform: [{ scale: sendBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }], opacity: sendBtnAnim }}>
                <TouchableOpacity
                  style={[S.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.backgroundSecondary }]}
                  onPress={handleSend}
                  disabled={!text.trim() || sending}
                >
                  {sending ? <ActivityIndicator size="small" color={text.trim() ? '#fff' : colors.textTertiary} /> : <Icon name={editingMsg ? 'check' : 'send'} size={17} color={text.trim() ? '#fff' : colors.textTertiary} />}
                </TouchableOpacity>
              </Animated.View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* ── Context menu ── */}
      <Modal visible={!!menuMsg} transparent animationType="fade" onRequestClose={() => setMenuMsg(null)}>
        <Pressable style={S.overlay} onPress={() => setMenuMsg(null)}>
          <View style={[S.menuSheet, { backgroundColor: colors.surface }]}>
            {/* Quick emoji */}
            <View style={[S.emojiRow, { borderBottomColor: colors.divider }]}>
              {QUICK_EMOJIS.map(e => (
                <TouchableOpacity key={e} onPress={() => { handleReact(menuMsg!, e); setMenuMsg(null); }} style={S.emojiBtn}>
                  <Text style={S.emojiBig}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Aperçu */}
            <View style={[S.menuPreview, { borderBottomColor: colors.divider }]}>
              <Text style={[S.menuPreviewName, { color: colors.primary }]}>{menuMsg?.sender_display_name || menuMsg?.sender_username}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={2}>{menuMsg?.content || (menuMsg?.media_urls?.length ? '📷 Image' : '…')}</Text>
            </View>
            {/* Actions */}
            {[
              { show: true, icon: 'corner-up-left', label: 'Répondre', color: colors.textPrimary, onPress: () => { setReplyingTo(menuMsg!); setMenuMsg(null); setTimeout(() => inputRef.current?.focus(), 100); } },
              { show: menuMsg?.sender_id !== myId, icon: 'user', label: 'Voir le profil', color: colors.textPrimary, onPress: () => { setMenuMsg(null); nav.navigate('UserProfile', { userId: menuMsg!.sender_id }); } },
              { show: menuMsg?.sender_id === myId && menuMsg?.message_type === 'text', icon: 'edit-2', label: 'Modifier', color: colors.textPrimary, onPress: () => handleEdit(menuMsg!) },
              { show: isAdmin || isMod, icon: 'bookmark', label: menuMsg?.is_pinned ? 'Désépingler' : 'Épingler', color: '#F59E0B', onPress: () => handlePin(menuMsg!, !menuMsg!.is_pinned) },
              { show: menuMsg?.sender_id === myId || isAdmin || isMod, icon: 'trash-2', label: 'Supprimer', color: '#EF4444', onPress: () => handleDelete(menuMsg!) },
            ].filter(a => a.show).map((a, i) => (
              <TouchableOpacity key={i} style={S.menuItem} onPress={a.onPress}>
                <View style={[S.menuItemIcon, { backgroundColor: a.color + '15' }]}><Icon name={a.icon} size={16} color={a.color} /></View>
                <Text style={[S.menuItemText, { color: a.color }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[S.menuItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, justifyContent: 'center' }]} onPress={() => setMenuMsg(null)}>
              <Text style={[S.menuItemText, { color: colors.textTertiary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Messages épinglés ── */}
      <Modal visible={showPinned} transparent animationType="slide" onRequestClose={() => setShowPinned(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={S.overlay} onPress={() => setShowPinned(false)} />
          <View style={[S.bottomSheet, { backgroundColor: colors.surface }]}>
            <View style={[S.sheetHandle, { backgroundColor: colors.divider }]} />
            <View style={[S.sheetHeader, { borderBottomColor: colors.divider }]}>
              <Icon name="bookmark" size={16} color="#F59E0B" />
              <Text style={[S.sheetTitle, { color: colors.textPrimary }]}>Messages épinglés</Text>
              <TouchableOpacity onPress={() => setShowPinned(false)}><Icon name="x" size={20} color={colors.textTertiary} /></TouchableOpacity>
            </View>
            <FlatList
              data={pinnedMsgs}
              keyExtractor={m => m.id}
              renderItem={({ item }) => (
                <View style={[S.pinnedItem, { borderBottomColor: colors.divider }]}>
                  <Text style={[S.pinnedSender, { color: colors.primary }]}>{item.sender_display_name || item.sender_username}</Text>
                  <Text style={[S.pinnedContent, { color: colors.textPrimary }]} numberOfLines={3}>{item.content || '📷 Image'}</Text>
                  <Text style={[S.pinnedTime, { color: colors.textTertiary }]}>{fmtDate(item.created_at)}</Text>
                </View>
              )}
              ListEmptyComponent={<View style={{ padding: 24, alignItems: 'center' }}><Text style={{ color: colors.textTertiary }}>Aucun message épinglé</Text></View>}
            />
          </View>
        </View>
      </Modal>

      {/* ── Créer sondage ── */}
      <Modal visible={pollModal} transparent animationType="slide" onRequestClose={() => setPollModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={S.overlay} onPress={() => setPollModal(false)} />
          <View style={[S.bottomSheet, { backgroundColor: colors.surface, maxHeight: H * 0.88 }]}>
            <View style={[S.sheetHandle, { backgroundColor: colors.divider }]} />
            <View style={[S.sheetHeader, { borderBottomColor: colors.divider }]}>
              <Icon name="bar-chart-2" size={16} color={colors.primary} />
              <Text style={[S.sheetTitle, { color: colors.textPrimary }]}>Créer un sondage</Text>
              <TouchableOpacity onPress={() => setPollModal(false)}><Icon name="x" size={20} color={colors.textTertiary} /></TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 20, paddingTop: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[S.pollFormLabel, { color: colors.textSecondary }]}>Question</Text>
              <TextInput
                style={[S.pollFormInput, { color: colors.textPrimary, borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}
                placeholder="Posez votre question…"
                placeholderTextColor={colors.textTertiary}
                value={pollQ} onChangeText={setPollQ} maxLength={200}
              />
              <Text style={[S.pollFormLabel, { color: colors.textSecondary, marginTop: 12 }]}>Options</Text>
              {pollOpts.map((opt, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View style={[S.pollFormOptNum, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{i + 1}</Text>
                  </View>
                  <TextInput
                    style={[S.pollFormInput, { flex: 1, marginBottom: 0, borderColor: colors.divider, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor={colors.textTertiary}
                    value={opt} onChangeText={v => { const o = [...pollOpts]; o[i] = v; setPollOpts(o); }} maxLength={100}
                  />
                  {pollOpts.length > 2 && (
                    <TouchableOpacity onPress={() => setPollOpts(pollOpts.filter((_, j) => j !== i))}>
                      <Icon name="x-circle" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOpts.length < 6 && (
                <TouchableOpacity style={[S.addOptBtn, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' }]} onPress={() => setPollOpts([...pollOpts, ''])}>
                  <Icon name="plus" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Ajouter une option</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[S.multipleRow, { borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]} onPress={() => setPollMulti(!pollMulti)}>
                <View style={[S.checkbox, { borderColor: pollMulti ? colors.primary : colors.divider, backgroundColor: pollMulti ? colors.primary : 'transparent' }]}>
                  {pollMulti && <Icon name="check" size={11} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14 }}>Choix multiple</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12 }}>Les membres peuvent voter pour plusieurs options</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.publishBtn, { backgroundColor: colors.primary, marginBottom: 32 }]}
                onPress={handleCreatePoll} disabled={sending}
              >
                {sending ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Icon name="bar-chart-2" size={16} color="#fff" />
                    <Text style={S.publishBtnText}>Publier le sondage</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Image viewer ── */}
      <Modal visible={imgViewerOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setImgViewerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar hidden />
          <TouchableOpacity style={S.viewerClose} onPress={() => setImgViewerOpen(false)}>
            <View style={S.viewerCloseInner}><Icon name="x" size={20} color="#fff" /></View>
          </TouchableOpacity>
          {imgViewerList.length > 1 && (
            <View style={S.viewerCounter}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{imgViewerIdx + 1} / {imgViewerList.length}</Text>
            </View>
          )}
          <ScrollView
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            contentOffset={{ x: imgViewerIdx * W, y: 0 }}
            onMomentumScrollEnd={e => setImgViewerIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
          >
            {imgViewerList.map((url, i) => (
              <View key={i} style={{ width: W, height: H, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: url }} style={{ width: W, height: H }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBack: { padding: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  headerSub: { fontSize: 11 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 },
  tabLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  // Date separator
  dateSepRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, paddingHorizontal: 4 },
  dateSepLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateSepPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginHorizontal: 8 },
  dateSepText: { fontSize: 11, fontWeight: '600' },

  // Message rows
  msgRow: { flexDirection: 'row', alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  senderName: { fontSize: 12, fontWeight: '700' },

  // Bubble
  bubble: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, maxWidth: '100%' },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 2 },
  edited: { fontSize: 10, fontStyle: 'italic' },
  msgTime: { fontSize: 10 },
  floatTime: { fontSize: 10, marginTop: 2 },
  pinnedRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },

  // Reply
  replyBox: { borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 3 },
  replyName: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  replyText: { fontSize: 11 },

  // Reactions
  reactionChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 5, marginTop: 2 },

  // Media
  mediaMore: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.52)', alignItems: 'center', justifyContent: 'center' },
  mediaMoreText: { color: '#fff', fontWeight: '800', fontSize: 22 },

  // Announcement
  announceBubble: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8 },
  announceTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  announceIconBox: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  announceLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  announceMeta: { fontSize: 11, marginTop: 1 },
  announceText: { fontSize: 15, lineHeight: 22 },
  pinnedBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  // Poll message
  pollMessageWrap: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8 },
  pollMsgTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  pollIconBox: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  pollMsgLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },

  // Poll card
  pollCard: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  pollQuestion: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  pollOptWrap: { position: 'relative', borderWidth: 1.5, borderRadius: 10, overflow: 'hidden', minHeight: 40 },
  pollBar: { position: 'absolute', top: 0, left: 0, height: '100%' },
  pollOptRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8 },
  pollDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pollOptText: { flex: 1, fontSize: 14 },
  pollPct: { fontSize: 12, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  pollFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  pollFooterText: { fontSize: 11 },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },

  // Typing
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  typingDot: { width: 5, height: 5, borderRadius: 3, opacity: 0.6 },
  typingText: { fontSize: 12, fontStyle: 'italic', flex: 1 },

  // Reply/Edit banners
  replyBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3 },
  replyBannerName: { fontSize: 12, fontWeight: '700' },
  replyBannerText: { fontSize: 12 },
  editBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 2 },

  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 8, gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  inputIconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, fontSize: 15, maxHeight: 120, borderWidth: StyleSheet.hairlineWidth },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Context menu
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, position: 'absolute', bottom: 0, left: 0, right: 0 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  emojiBtn: { padding: 4 },
  emojiBig: { fontSize: 26 },
  menuPreview: { paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  menuPreviewName: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  menuItemIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menuItemText: { fontSize: 15, fontWeight: '500' },

  // Bottom sheet (pinned + poll)
  bottomSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '75%', position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  pinnedItem: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pinnedSender: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  pinnedContent: { fontSize: 14, lineHeight: 19 },
  pinnedTime: { fontSize: 11, marginTop: 4 },

  // Poll form
  pollFormLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  pollFormInput: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 14, marginBottom: 10 },
  pollFormOptNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addOptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 14, justifyContent: 'center', borderStyle: 'dashed' },
  multipleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14 },
  publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Image viewer
  viewerClose: { position: 'absolute', top: 52, right: 20, zIndex: 10 },
  viewerCloseInner: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  viewerCounter: { position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
});
