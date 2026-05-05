import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, Image, Alert, Modal, Pressable,
  ScrollView, Dimensions,
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

const { width: W } = Dimensions.get('window');

interface RouteParams {
  communityId: string;
  communityName: string;
}

interface TypingUser { user_id: string; username: string | null; display_name: string | null; }

interface ReactionSummary { emoji: string; count: number; user_ids: string[]; }

interface PollOption { id: string; text: string; votes: number; }
interface PollData {
  poll_id: string; question: string; options: PollOption[];
  total_votes: number; my_votes: string[];
  ends_at: string | null; allow_multiple: boolean; ended: boolean;
}

type CommunityMessage = Omit<CommunityMessageData, 'poll'> & {
  poll: PollData | null;
};

type ChatTab = 'discussion' | 'announcements' | 'media' | 'polls';

const TABS: { key: ChatTab; label: string; icon: string }[] = [
  { key: 'discussion',    label: 'Discussion',  icon: 'message-circle' },
  { key: 'announcements', label: 'Annonces',    icon: 'bell' },
  { key: 'media',         label: 'Médias',      icon: 'image' },
  { key: 'polls',         label: 'Sondages',    icon: 'bar-chart-2' },
];

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export const CommunityChatScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute();
  const { communityId, communityName } = route.params as RouteParams;

  const [activeTab,   setActiveTab]   = useState<ChatTab>('discussion');
  const [messages,    setMessages]    = useState<CommunityMessage[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [sending,     setSending]     = useState(false);
  const [text,        setText]        = useState('');
  const [myId,        setMyId]        = useState<string | null>(null);
  const [myRole,      setMyRole]      = useState<string | null>(null);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(true);
  const [editingMsg,  setEditingMsg]  = useState<CommunityMessage | null>(null);
  const [replyingTo,  setReplyingTo]  = useState<CommunityMessage | null>(null);
  const [menuMsg,     setMenuMsg]     = useState<CommunityMessage | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<CommunityMessage | null>(null);
  const [pinnedMsgs,  setPinnedMsgs]  = useState<CommunityMessage[]>([]);
  const [showPinned,  setShowPinned]  = useState(false);
  const [communityTitle, setCommunityTitle] = useState(communityName);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [imgViewerUrl, setImgViewerUrl] = useState<string | null>(null);
  const [imgViewerList, setImgViewerList] = useState<string[]>([]);
  const [imgViewerIdx, setImgViewerIdx] = useState(0);

  // Création de sondage
  const [pollModal,   setPollModal]   = useState(false);
  const [pollQ,       setPollQ]       = useState('');
  const [pollOpts,    setPollOpts]    = useState(['', '']);
  const [pollMulti,   setPollMulti]   = useState(false);

  const listRef       = useRef<FlatList>(null);
  const inputRef      = useRef<TextInput>(null);
  const typingTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

  const isAdmin = myRole === 'admin';
  const isMod   = myRole === 'moderator';
  const canAnnounce = isAdmin || isMod;

  // ── WebSocket ───────────────────────────────────────────────────────────────
  const { sendWsMessage, sendTyping, isConnected, onlineCount } = useCommunityWebSocket(
    communityId,
    useCallback((payload: CommunityWsPayload) => {
      const addOrUpdateMsg = (msg: CommunityMessage) => {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [msg, ...prev];
        });
      };

      if (payload.type === 'community_message' || payload.type === 'community_message_sent' || payload.type === 'community_announcement') {
        const msg = payload as unknown as CommunityMessage;
        addOrUpdateMsg(msg);
        setTypingUsers(prev => prev.filter(u => u.user_id !== msg.sender_id));
      } else if (payload.type === 'community_poll_created') {
        addOrUpdateMsg(payload as unknown as CommunityMessage);
      } else if (payload.type === 'community_message_edited') {
        const edited = payload as unknown as CommunityMessage;
        setMessages(prev => prev.map(m => m.id === edited.id ? { ...m, content: edited.content, edited_at: edited.edited_at } : m));
      } else if (payload.type === 'community_message_deleted') {
        setMessages(prev => prev.filter(m => m.id !== payload.id));
      } else if (payload.type === 'community_message_pinned' || payload.type === 'community_message_unpinned') {
        const pinned = payload.type === 'community_message_pinned';
        const msg = payload as unknown as CommunityMessage;
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: pinned } : m));
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
          typingTimers.current[user_id] = setTimeout(() => setTypingUsers(prev => prev.filter(u => u.user_id !== user_id)), 4000);
        } else {
          if (typingTimers.current[user_id]) clearTimeout(typingTimers.current[user_id]);
          setTypingUsers(prev => prev.filter(u => u.user_id !== user_id));
        }
      } else if (payload.type === 'community_member_kicked') {
        setMyId(id => {
          if (id && payload.user_id === id) {
            Alert.alert('Exclu', 'Vous avez été exclu de cette communauté.', [{ text: 'OK', onPress: () => nav.goBack() }]);
          }
          return id;
        });
      } else if (payload.type === 'community_member_left') {
        setTypingUsers(prev => prev.filter(u => u.user_id !== payload.user_id));
      } else if (payload.type === 'community_updated') {
        setCommunityTitle(payload.name);
      } else if (payload.type === 'community_deleted') {
        Alert.alert('Communauté supprimée', 'Cette communauté a été supprimée.', [{ text: 'OK', onPress: () => nav.goBack() }]);
      }
    }, [nav]),
  );

  // ── Chargement ──────────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (p = 1, append = false, tab: ChatTab = 'discussion') => {
    try {
      const typeMap: Record<ChatTab, string | undefined> = {
        discussion: undefined,
        announcements: 'announcement',
        media: 'image',
        polls: 'poll',
      };
      const mtype = typeMap[tab];
      const msgs = await communityService.getMessages(communityId, p, 30, mtype);
      if (append) {
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...prev, ...(msgs as CommunityMessage[]).filter(m => !ids.has(m.id))];
        });
      } else {
        setMessages(msgs as CommunityMessage[]);
      }
      setHasMore(msgs.length === 30);
    } catch {}
    finally { setLoading(false); }
  }, [communityId]);

  const loadPinned = useCallback(async () => {
    try {
      const pinned = await communityService.getPinnedMessages(communityId);
      setPinnedMsgs(pinned as CommunityMessage[]);
    } catch {}
  }, [communityId]);

  useEffect(() => {
    authService.getMe().then(u => {
      setMyId(String(u.id));
      communityService.getMyRole(communityId).then(setMyRole).catch(() => {});
    }).catch(() => {});
    loadMessages(1, false, 'discussion');
    loadPinned();
  }, [communityId, loadMessages, loadPinned]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setPage(1);
    loadMessages(1, false, activeTab);
  }, [activeTab]);

  useEffect(() => {
    return () => {
      Object.values(typingTimers.current).forEach(clearTimeout);
      if (typingDebounce.current) clearTimeout(typingDebounce.current);
    };
  }, []);

  // ── Typing debounce ─────────────────────────────────────────────────────────
  const handleTextChange = useCallback((val: string) => {
    setText(val);
    if (!isConnected) return;
    if (typingDebounce.current) clearTimeout(typingDebounce.current);
    sendTyping(true);
    typingDebounce.current = setTimeout(() => sendTyping(false), 2000);
  }, [isConnected, sendTyping]);

  // ── Envoyer message ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    const content = text.trim();
    if ((!content && activeTab !== 'media') || sending) return;
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

    if (isConnected) {
      sendWsMessage({ type: 'message', content, message_type: activeTab === 'announcements' ? 'announcement' : 'text', reply_to_id });
    } else {
      try {
        const msg = await communityService.sendMessage(communityId, content);
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [msg as CommunityMessage, ...prev]);
      } catch { setText(content); }
    }
    setSending(false);
  };

  // ── Envoyer image ───────────────────────────────────────────────────────────
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
          const res = await apiClient.upload<{ uploaded: { url: string }[] }>(
            Endpoints.upload.images('communities'), fd,
          );
          const url = res.data?.uploaded?.[0]?.url;
          if (url) urls.push(url);
        }
        if (urls.length > 0) {
          const msg = await communityService.sendMessage(communityId, '', 'image', urls);
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [msg as CommunityMessage, ...prev]);
          await community_broadcast_msg(msg as CommunityMessage);
        }
      } catch {}
      finally { setSending(false); }
    });
  };

  const community_broadcast_msg = async (msg: CommunityMessage) => {
    if (isConnected) {
      sendWsMessage({ type: 'message', message_type: msg.message_type, media_urls: msg.media_urls, content: msg.content });
    }
  };

  // ── Réaction ────────────────────────────────────────────────────────────────
  const handleReact = async (msg: CommunityMessage, emoji: string) => {
    setEmojiTarget(null);
    try {
      const res = await apiClient.post<{ reactions: ReactionSummary[] }>(
        `/api/v1/communities/${communityId}/messages/${msg.id}/react`, { emoji }
      );
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: res.data.reactions } : m));
    } catch {}
  };

  // ── Pin ─────────────────────────────────────────────────────────────────────
  const handlePin = async (msg: CommunityMessage, pin: boolean) => {
    setMenuMsg(null);
    try {
      await apiClient.post(`/api/v1/communities/${communityId}/messages/${msg.id}/pin?pin=${pin}`);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: pin } : m));
      await loadPinned();
    } catch {}
  };

  // ── Vote sondage ────────────────────────────────────────────────────────────
  const handleVote = async (msg: CommunityMessage, optionId: string) => {
    if (!msg.poll || msg.poll.ended) return;
    const current = msg.poll.my_votes;
    const already = current.includes(optionId);
    const newVotes = already
      ? current.filter(v => v !== optionId)
      : msg.poll.allow_multiple ? [...current, optionId] : [optionId];
    if (newVotes.length === 0 && !already) return;
    try {
      const res = await apiClient.post<PollData>(
        `/api/v1/communities/${communityId}/polls/${msg.poll.poll_id}/vote`,
        { option_ids: newVotes },
      );
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, poll: res.data } : m));
    } catch {}
  };

  // ── Créer sondage ───────────────────────────────────────────────────────────
  const handleCreatePoll = async () => {
    if (!pollQ.trim() || pollOpts.filter(o => o.trim()).length < 2) {
      Alert.alert('Sondage invalide', 'Une question et au moins 2 options sont requises.');
      return;
    }
    setSending(true);
    setPollModal(false);
    try {
      const res = await apiClient.post(`/api/v1/communities/${communityId}/polls`, {
        question: pollQ.trim(),
        options: pollOpts.filter(o => o.trim()),
        allow_multiple: pollMulti,
      });
      setMessages(prev => [res.data as CommunityMessage, ...prev]);
      setPollQ(''); setPollOpts(['', '']); setPollMulti(false);
    } catch { Alert.alert('Erreur', 'Impossible de créer le sondage'); }
    finally { setSending(false); }
  };

  // ── Supprimer ───────────────────────────────────────────────────────────────
  const handleDelete = (msg: CommunityMessage) => {
    setMenuMsg(null);
    Alert.alert('Supprimer', 'Supprimer ce message ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: () => {
          if (isConnected) sendWsMessage({ type: 'delete', message_id: msg.id });
          else communityService.deleteMessage(communityId, msg.id).then(() =>
            setMessages(prev => prev.filter(m => m.id !== msg.id))
          ).catch(() => {});
        },
      },
    ]);
  };

  const handleEdit = (msg: CommunityMessage) => {
    setMenuMsg(null);
    setEditingMsg(msg);
    setText(msg.content ?? '');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    loadMessages(next, true, activeTab);
  };

  // ── Typing text ─────────────────────────────────────────────────────────────
  const typingText = (() => {
    if (!typingUsers.length) return null;
    const names = typingUsers.map(u => u.display_name || u.username || '…');
    if (names.length === 1) return `${names[0]} écrit…`;
    if (names.length === 2) return `${names[0]} et ${names[1]} écrivent…`;
    return `${names[0]} et ${names.length - 1} autres écrivent…`;
  })();

  // ── Rendus ──────────────────────────────────────────────────────────────────

  const renderReactions = (msg: CommunityMessage) => {
    if (!msg.reactions?.length) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reactionsRow}>
        {msg.reactions.map(r => {
          const mine = myId ? r.user_ids.includes(myId) : false;
          return (
            <TouchableOpacity
              key={r.emoji}
              onPress={() => handleReact(msg, r.emoji)}
              style={[styles.reactionChip, mine && { borderColor: colors.primary, borderWidth: 1 }, { backgroundColor: colors.backgroundSecondary }]}
            >
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              <Text style={[styles.reactionCount, { color: mine ? colors.primary : colors.textSecondary }]}>{r.count}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.reactionChip, { backgroundColor: colors.backgroundSecondary }]}
          onPress={() => setEmojiTarget(msg)}
        >
          <Icon name="plus" size={12} color={colors.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderPoll = (msg: CommunityMessage) => {
    const poll = msg.poll;
    if (!poll) return null;
    const total = poll.total_votes || 1;
    return (
      <View style={[styles.pollCard, { backgroundColor: colors.backgroundSecondary }]}>
        <Text style={[styles.pollQuestion, { color: colors.textPrimary }]}>{poll.question}</Text>
        {poll.options.map(opt => {
          const voted = poll.my_votes.includes(opt.id);
          const pct = Math.round((opt.votes / total) * 100);
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.pollOption, { borderColor: voted ? colors.primary : colors.divider }]}
              onPress={() => !poll.ended && handleVote(msg, opt.id)}
              disabled={poll.ended}
            >
              <View style={[styles.pollBar, { width: `${pct}%` as any, backgroundColor: voted ? colors.primary + '33' : colors.divider }]} />
              <View style={styles.pollOptionRow}>
                {voted && <Icon name="check-circle" size={13} color={colors.primary} style={{ marginRight: 4 }} />}
                <Text style={[styles.pollOptionText, { color: colors.textPrimary, fontWeight: voted ? '700' : '400' }]}>{opt.text}</Text>
                <Text style={[styles.pollPct, { color: colors.textTertiary }]}>{pct}%</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={[styles.pollFooter, { color: colors.textTertiary }]}>
          {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}
          {poll.ended ? ' · Terminé' : poll.ends_at ? ` · Fin ${new Date(poll.ends_at).toLocaleDateString('fr-FR')}` : ''}
        </Text>
      </View>
    );
  };

  const renderMediaGrid = (urls: string[]) => {
    if (!urls.length) return null;
    const single = urls.length === 1;
    return (
      <View style={[styles.mediaGrid, single && { width: '100%' }]}>
        {urls.slice(0, 4).map((url, i) => (
          <TouchableOpacity key={i} onPress={() => { setImgViewerList(urls); setImgViewerIdx(i); setImgViewerUrl(url); }}>
            <Image source={{ uri: url }} style={[styles.mediaImg, single ? { width: '100%', height: 200 } : { width: (W * 0.55 - 4) / 2, height: 100 }]} resizeMode="cover" />
            {i === 3 && urls.length > 4 && (
              <View style={styles.mediaOverlay}>
                <Text style={styles.mediaOverlayText}>+{urls.length - 4}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderAvatarOrSpacer = (msg: CommunityMessage, showSender: boolean) => {
    const isMe = msg.sender_id === myId;
    if (isMe) return null;
    if (showSender) {
      return (
        <TouchableOpacity onPress={() => nav.navigate('UserProfile', { userId: msg.sender_id })} style={styles.senderAvatarWrap}>
          {msg.sender_avatar_url ? (
            <Image source={{ uri: msg.sender_avatar_url }} style={styles.senderAvatar} />
          ) : (
            <View style={[styles.senderAvatar, { backgroundColor: colors.primary + '33', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 10 }}>
                {(msg.sender_display_name || msg.sender_username || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }
    return <View style={{ width: 34 }} />;
  };

  // ── Rendu Annonce ────────────────────────────────────────────────────────────
  const renderAnnouncement = (msg: CommunityMessage, showDate: boolean) => (
    <View style={{ transform: [{ scaleY: -1 }] }}>
      {showDate && <View style={styles.dateSep}><Text style={[styles.dateText, { color: colors.textTertiary }]}>{formatDate(msg.created_at)}</Text></View>}
      <TouchableOpacity activeOpacity={0.85} onLongPress={() => setMenuMsg(msg)} delayLongPress={400}>
        <View style={[styles.announcementBubble, { backgroundColor: '#F59E0B0F', borderColor: '#F59E0B50' }]}>
          <View style={styles.announcementHeader}>
            <View style={[styles.announcementIconBg, { backgroundColor: '#F59E0B22' }]}>
              <Icon name="bell" size={13} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.announcementLabel, { color: '#F59E0B' }]}>Annonce</Text>
              <Text style={[{ fontSize: 11, color: colors.textTertiary }]}>
                {msg.sender_display_name || msg.sender_username} · {formatTime(msg.created_at)}
              </Text>
            </View>
            {msg.is_pinned && <Icon name="bookmark" size={13} color="#F59E0B" />}
          </View>
          <Text style={[styles.announcementText, { color: colors.textPrimary }]}>{msg.content}</Text>
          {renderReactions(msg)}
        </View>
      </TouchableOpacity>
    </View>
  );

  // ── Rendu Sondage ─────────────────────────────────────────────────────────────
  const renderPollMessage = (msg: CommunityMessage, showDate: boolean) => (
    <View style={{ transform: [{ scaleY: -1 }] }}>
      {showDate && <View style={styles.dateSep}><Text style={[styles.dateText, { color: colors.textTertiary }]}>{formatDate(msg.created_at)}</Text></View>}
      <TouchableOpacity activeOpacity={0.9} onLongPress={() => setMenuMsg(msg)} delayLongPress={400}>
        <View style={[styles.pollMessageCard, { backgroundColor: colors.surfaceElevated ?? colors.backgroundSecondary, borderColor: colors.divider }]}>
          {/* En-tête */}
          <View style={styles.pollMsgHeader}>
            <View style={[styles.pollMsgIconBg, { backgroundColor: colors.primary + '22' }]}>
              <Icon name="bar-chart-2" size={14} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pollMsgLabel, { color: colors.primary }]}>Sondage</Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                {msg.sender_display_name || msg.sender_username} · {formatTime(msg.created_at)}
              </Text>
            </View>
            {msg.is_pinned && <Icon name="bookmark" size={13} color="#F59E0B" />}
          </View>
          {/* Contenu du sondage */}
          {renderPoll(msg)}
          {renderReactions(msg)}
        </View>
      </TouchableOpacity>
    </View>
  );

  // ── Rendu Média ───────────────────────────────────────────────────────────────
  const renderMediaMessage = (msg: CommunityMessage, showDate: boolean, showSender: boolean) => {
    const isMe = msg.sender_id === myId;
    return (
      <>
        {showDate && <View style={[styles.dateSep, { transform: [{ scaleY: -1 }] }]}><Text style={[styles.dateText, { color: colors.textTertiary }]}>{formatDate(msg.created_at)}</Text></View>}
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => setMenuMsg(msg)}
          delayLongPress={400}
          style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}
        >
          {!isMe && renderAvatarOrSpacer(msg, showSender)}
          <View style={{ maxWidth: '72%' }}>
            {!isMe && showSender && (
              <Text style={[styles.senderName, { color: colors.primary, marginLeft: 2, marginBottom: 2 }]}>
                {msg.sender_display_name || msg.sender_username}
              </Text>
            )}
            {/* Grille d'images sans bulle colorée */}
            <View style={[styles.mediaMsgWrap, isMe ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
              {renderMediaGrid(msg.media_urls)}
              {msg.content ? (
                <View style={[styles.bubble, isMe
                  ? { backgroundColor: colors.primary, borderBottomRightRadius: 4, marginTop: 3 }
                  : { backgroundColor: colors.surfaceElevated ?? colors.backgroundSecondary, borderBottomLeftRadius: 4, marginTop: 3 }]}>
                  <Text style={[styles.msgText, { color: isMe ? '#fff' : colors.textPrimary }]}>{msg.content}</Text>
                </View>
              ) : null}
              <Text style={[styles.mediaTime, { color: colors.textTertiary, alignSelf: isMe ? 'flex-end' : 'flex-start' }]}>
                {msg.is_pinned ? '📌 ' : ''}{formatTime(msg.created_at)}
              </Text>
            </View>
            {renderReactions(msg)}
          </View>
        </TouchableOpacity>
      </>
    );
  };

  // ── Rendu Message texte ────────────────────────────────────────────────────────
  const renderTextMessage = (msg: CommunityMessage, showDate: boolean, showSender: boolean) => {
    const isMe = msg.sender_id === myId;
    return (
      <>
        {showDate && <View style={[styles.dateSep, { transform: [{ scaleY: -1 }] }]}><Text style={[styles.dateText, { color: colors.textTertiary }]}>{formatDate(msg.created_at)}</Text></View>}
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => setMenuMsg(msg)}
          delayLongPress={400}
          style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}
        >
          {!isMe && renderAvatarOrSpacer(msg, showSender)}
          <View style={{ maxWidth: '78%' }}>
            {msg.reply_to && (
              <View style={[styles.replyPreview, { backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : colors.backgroundSecondary, borderLeftColor: colors.primary }]}>
                <Text style={[styles.replyName, { color: colors.primary }]}>{msg.reply_to.sender_display_name || msg.reply_to.sender_username}</Text>
                <Text style={[styles.replyText, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]} numberOfLines={1}>
                  {msg.reply_to.content || (msg.reply_to.message_type === 'image' ? '📷 Image' : '…')}
                </Text>
              </View>
            )}
            <View style={[
              styles.bubble,
              isMe
                ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
                : { backgroundColor: colors.surfaceElevated ?? colors.backgroundSecondary, borderBottomLeftRadius: 4 },
            ]}>
              {!isMe && showSender && (
                <Text style={[styles.senderName, { color: colors.primary }]}>
                  {msg.sender_display_name || msg.sender_username}
                </Text>
              )}
              {msg.is_pinned && (
                <View style={styles.pinnedTag}><Icon name="bookmark" size={10} color="#F59E0B" /><Text style={{ color: '#F59E0B', fontSize: 9, fontWeight: '700' }}> Épinglé</Text></View>
              )}
              <Text style={[styles.msgText, { color: isMe ? '#fff' : colors.textPrimary }]}>{msg.content}</Text>
              <View style={styles.msgMeta}>
                {msg.edited_at && <Text style={[styles.editedLabel, { color: isMe ? 'rgba(255,255,255,0.5)' : colors.textTertiary }]}>modifié</Text>}
                <Text style={[styles.msgTime, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.textTertiary }]}>{formatTime(msg.created_at)}</Text>
              </View>
            </View>
            {renderReactions(msg)}
          </View>
        </TouchableOpacity>
      </>
    );
  };

  const renderMessage = ({ item: msg, index }: { item: CommunityMessage; index: number }) => {
    const prev = messages[index + 1];
    const isMe = msg.sender_id === myId;
    const showSender = !isMe && (!prev || prev.sender_id !== msg.sender_id);
    const showDate = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();

    if (msg.message_type === 'announcement') return renderAnnouncement(msg, showDate);
    if (msg.message_type === 'poll') return renderPollMessage(msg, showDate);
    if (msg.message_type === 'image' || msg.message_type === 'media') return renderMediaMessage(msg, showDate, showSender);
    return renderTextMessage(msg, showDate, showSender);
  };

  const renderMediaTab = () => {
    const allMedia = messages.filter(m => m.media_urls?.length > 0).flatMap(m => m.media_urls);
    if (!allMedia.length) return (
      <View style={styles.emptyTab}><Icon name="image" size={40} color={colors.textTertiary} /><Text style={{ color: colors.textTertiary, marginTop: 10 }}>Aucun média partagé</Text></View>
    );
    return (
      <ScrollView contentContainerStyle={styles.mediaTabGrid}>
        {allMedia.map((url, i) => (
          <TouchableOpacity key={i} onPress={() => { setImgViewerList(allMedia); setImgViewerIdx(i); setImgViewerUrl(url); }}>
            <Image source={{ uri: url }} style={styles.mediaTabThumb} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: STATUS_H + 8, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{communityTitle}</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
            {isConnected ? (onlineCount > 0 ? `${onlineCount} en ligne` : 'En ligne') : 'Connexion…'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {pinnedMsgs.length > 0 && (
            <TouchableOpacity onPress={() => setShowPinned(true)} style={styles.headerIconBtn}>
              <Icon name="bookmark" size={18} color="#F59E0B" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => nav.navigate('CommunityDetail', { communityId })} style={styles.headerIconBtn}>
            <Icon name="info" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Onglets ── */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={[styles.tabBtn, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setActiveTab(tab.key)}>
              <Icon name={tab.icon} size={14} color={active ? colors.primary : colors.textTertiary} />
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.textTertiary }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Contenu ── */}
      {activeTab === 'media' ? (
        loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : renderMediaTab()
      ) : (
        <>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={m => m.id}
              renderItem={renderMessage}
              inverted
              contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8 }}
              showsVerticalScrollIndicator={false}
              onEndReached={loadMore}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={
                <View style={[styles.emptyTab, { transform: [{ scaleY: -1 }] }]}>
                  <Icon name="message-circle" size={48} color={colors.textTertiary} />
                  <Text style={{ color: colors.textTertiary, marginTop: 12 }}>
                    {activeTab === 'announcements' ? 'Aucune annonce' : activeTab === 'polls' ? 'Aucun sondage' : 'Aucun message — soyez le premier !'}
                  </Text>
                </View>
              }
            />
          )}

          {/* Typing indicator */}
          {typingText && (
            <View style={[styles.typingBar, { backgroundColor: colors.surface }]}>
              <View style={styles.typingDots}>{[0,1,2].map(i => <View key={i} style={[styles.typingDot, { backgroundColor: colors.textTertiary }]} />)}</View>
              <Text style={[styles.typingText, { color: colors.textTertiary }]} numberOfLines={1}>{typingText}</Text>
            </View>
          )}

          {/* Reply banner */}
          {replyingTo && (
            <View style={[styles.replyBanner, { backgroundColor: colors.surface, borderTopColor: colors.divider, borderLeftColor: colors.primary }]}>
              <Icon name="corner-up-left" size={14} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.replyBannerName, { color: colors.primary }]}>{replyingTo.sender_display_name || replyingTo.sender_username}</Text>
                <Text style={[styles.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {replyingTo.content || (replyingTo.media_urls?.length ? '📷 Image' : '…')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)}><Icon name="x" size={18} color={colors.textTertiary} /></TouchableOpacity>
            </View>
          )}

          {/* Edit banner */}
          {editingMsg && (
            <View style={[styles.editBanner, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
              <Icon name="edit-2" size={14} color={colors.primary} />
              <Text style={[styles.editBannerText, { color: colors.textSecondary }]} numberOfLines={1}>{editingMsg.content}</Text>
              <TouchableOpacity onPress={() => { setEditingMsg(null); setText(''); }}><Icon name="x" size={18} color={colors.textTertiary} /></TouchableOpacity>
            </View>
          )}

          {/* Input bar */}
          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: (editingMsg || replyingTo) ? 'transparent' : colors.divider }]}>
            {/* Boutons gauche */}
            <TouchableOpacity style={styles.inputIconBtn} onPress={handlePickMedia} disabled={sending}>
              <Icon name="image" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
            {canAnnounce && activeTab === 'discussion' && (
              <TouchableOpacity style={styles.inputIconBtn} onPress={() => setPollModal(true)} disabled={sending}>
                <Icon name="bar-chart-2" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              value={text}
              onChangeText={handleTextChange}
              placeholder={activeTab === 'announcements' ? 'Écrire une annonce…' : 'Écrire un message…'}
              placeholderTextColor={colors.textDisabled}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.backgroundSecondary }]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name={editingMsg ? 'check' : 'send'} size={18} color={text.trim() ? '#fff' : colors.textTertiary} />}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Context menu ── */}
      <Modal visible={!!menuMsg} transparent animationType="fade" onRequestClose={() => setMenuMsg(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuMsg(null)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface }]}>
            {/* Quick emoji bar */}
            <View style={[styles.emojiBar, { borderBottomColor: colors.divider }]}>
              {QUICK_EMOJIS.map(e => (
                <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => { handleReact(menuMsg!, e); setMenuMsg(null); }}>
                  <Text style={styles.emojiBtnText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.menuPreview, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.menuPreviewName, { color: colors.primary }]}>{menuMsg?.sender_display_name || menuMsg?.sender_username}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={2}>{menuMsg?.content || (menuMsg?.media_urls?.length ? '📷 Image' : '…')}</Text>
            </View>
            {/* Répondre */}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setReplyingTo(menuMsg!); setMenuMsg(null); setTimeout(() => inputRef.current?.focus(), 100); }}>
              <Icon name="corner-up-left" size={18} color={colors.textPrimary} />
              <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Répondre</Text>
            </TouchableOpacity>
            {/* Voir profil */}
            {menuMsg?.sender_id !== myId && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuMsg(null); nav.navigate('UserProfile', { userId: menuMsg!.sender_id }); }}>
                <Icon name="user" size={18} color={colors.textPrimary} />
                <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Voir le profil</Text>
              </TouchableOpacity>
            )}
            {/* Éditer */}
            {menuMsg?.sender_id === myId && menuMsg.message_type === 'text' && (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleEdit(menuMsg!)}>
                <Icon name="edit-2" size={18} color={colors.textPrimary} />
                <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Modifier</Text>
              </TouchableOpacity>
            )}
            {/* Épingler/Désépingler */}
            {(isAdmin || isMod) && (
              <TouchableOpacity style={styles.menuItem} onPress={() => handlePin(menuMsg!, !menuMsg!.is_pinned)}>
                <Icon name="bookmark" size={18} color="#F59E0B" />
                <Text style={[styles.menuItemText, { color: '#F59E0B' }]}>{menuMsg?.is_pinned ? 'Désépingler' : 'Épingler'}</Text>
              </TouchableOpacity>
            )}
            {/* Supprimer */}
            {(menuMsg?.sender_id === myId || isAdmin || isMod) && (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleDelete(menuMsg!)}>
                <Icon name="trash-2" size={18} color="#E53935" />
                <Text style={[styles.menuItemText, { color: '#E53935' }]}>Supprimer</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: colors.divider }]} onPress={() => setMenuMsg(null)}>
              <Text style={[styles.menuItemText, { color: colors.textTertiary, textAlign: 'center' }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Emoji picker ── */}
      <Modal visible={!!emojiTarget} transparent animationType="fade" onRequestClose={() => setEmojiTarget(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setEmojiTarget(null)}>
          <View style={[styles.emojiPicker, { backgroundColor: colors.surface }]}>
            <Text style={[styles.emojiPickerTitle, { color: colors.textTertiary }]}>Réagir</Text>
            <View style={styles.emojiGrid}>
              {QUICK_EMOJIS.map(e => (
                <TouchableOpacity key={e} style={styles.emojiGridBtn} onPress={() => handleReact(emojiTarget!, e)}>
                  <Text style={styles.emojiGridText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Messages épinglés ── */}
      <Modal visible={showPinned} transparent animationType="slide" onRequestClose={() => setShowPinned(false)}>
        <View style={styles.pinnedModal}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowPinned(false)} />
          <View style={[styles.pinnedSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pinnedHeader, { borderBottomColor: colors.divider }]}>
              <Icon name="bookmark" size={16} color="#F59E0B" />
              <Text style={[styles.pinnedTitle, { color: colors.textPrimary }]}>Messages épinglés</Text>
              <TouchableOpacity onPress={() => setShowPinned(false)}><Icon name="x" size={20} color={colors.textTertiary} /></TouchableOpacity>
            </View>
            <FlatList
              data={pinnedMsgs}
              keyExtractor={m => m.id}
              renderItem={({ item }) => (
                <View style={[styles.pinnedItem, { borderBottomColor: colors.divider }]}>
                  <Text style={[styles.pinnedSender, { color: colors.primary }]}>{item.sender_display_name || item.sender_username}</Text>
                  <Text style={[styles.pinnedContent, { color: colors.textPrimary }]} numberOfLines={3}>{item.content || '📷 Image'}</Text>
                  <Text style={[styles.msgTime, { color: colors.textTertiary }]}>{formatDate(item.created_at)}</Text>
                </View>
              )}
              ListEmptyComponent={<View style={styles.emptyTab}><Text style={{ color: colors.textTertiary }}>Aucun message épinglé</Text></View>}
            />
          </View>
        </View>
      </Modal>

      {/* ── Créer sondage ── */}
      <Modal visible={pollModal} transparent animationType="slide" onRequestClose={() => setPollModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={styles.menuOverlay} onPress={() => setPollModal(false)} />
          <View style={[styles.pollSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pinnedHeader, { borderBottomColor: colors.divider }]}>
              <Icon name="bar-chart-2" size={16} color={colors.primary} />
              <Text style={[styles.pinnedTitle, { color: colors.textPrimary }]}>Créer un sondage</Text>
              <TouchableOpacity onPress={() => setPollModal(false)}><Icon name="x" size={20} color={colors.textTertiary} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <TextInput
                style={[styles.pollInput, { color: colors.textPrimary, borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}
                placeholder="Question du sondage…"
                placeholderTextColor={colors.textDisabled}
                value={pollQ}
                onChangeText={setPollQ}
                maxLength={200}
              />
              {pollOpts.map((opt, i) => (
                <View key={i} style={styles.pollOptRow}>
                  <TextInput
                    style={[styles.pollInput, { flex: 1, color: colors.textPrimary, borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor={colors.textDisabled}
                    value={opt}
                    onChangeText={v => { const o = [...pollOpts]; o[i] = v; setPollOpts(o); }}
                    maxLength={100}
                  />
                  {pollOpts.length > 2 && (
                    <TouchableOpacity onPress={() => setPollOpts(pollOpts.filter((_, j) => j !== i))} style={{ padding: 8 }}>
                      <Icon name="x" size={16} color="#E53935" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOpts.length < 6 && (
                <TouchableOpacity style={[styles.pollAddBtn, { borderColor: colors.divider }]} onPress={() => setPollOpts([...pollOpts, ''])}>
                  <Icon name="plus" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>Ajouter une option</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.pollMultiRow, { borderColor: colors.divider }]} onPress={() => setPollMulti(!pollMulti)}>
                <View style={[styles.pollCheckbox, { borderColor: pollMulti ? colors.primary : colors.divider, backgroundColor: pollMulti ? colors.primary : 'transparent' }]}>
                  {pollMulti && <Icon name="check" size={12} color="#fff" />}
                </View>
                <Text style={{ color: colors.textPrimary }}>Choix multiple</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary, width: '100%', height: 48, marginTop: 8, borderRadius: 12 }]}
                onPress={handleCreatePoll}
                disabled={sending}
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Publier le sondage</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Image viewer ── */}
      <Modal visible={!!imgViewerUrl} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setImgViewerUrl(null)}>
        <View style={styles.imgViewer}>
          <StatusBar hidden />
          <TouchableOpacity style={styles.imgViewerClose} onPress={() => setImgViewerUrl(null)}>
            <View style={styles.imgViewerCloseInner}><Icon name="x" size={22} color="#fff" /></View>
          </TouchableOpacity>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            contentOffset={{ x: imgViewerIdx * W, y: 0 }}
          >
            {imgViewerList.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={{ width: W, height: '100%' }} resizeMode="contain" />
            ))}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerIconBtn: { padding: 4 },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  tabLabel: { fontSize: 11, fontWeight: '700' },

  emptyTab: { alignItems: 'center', paddingTop: 80 },

  dateSep: { alignItems: 'center', marginVertical: 10, transform: [{ scaleY: -1 }] },
  dateText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

  // Annonce
  announcementBubble: { marginHorizontal: 12, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: 1 },
  announcementHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  announcementIconBg: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  announcementLabel: { fontWeight: '700', fontSize: 13 },
  announcementText: { fontSize: 14, lineHeight: 21 },

  // Sondage (message pleine largeur)
  pollMessageCard: { marginHorizontal: 12, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: 1 },
  pollMsgHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pollMsgIconBg: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pollMsgLabel: { fontWeight: '700', fontSize: 13 },

  // Média (images sans bulle colorée)
  mediaMsgWrap: { },
  mediaTime: { fontSize: 10, marginTop: 3 },

  msgRow: { flexDirection: 'row', marginBottom: 4, maxWidth: '85%' },
  msgRowMe: { alignSelf: 'flex-end', transform: [{ scaleY: -1 }] },
  msgRowOther: { alignSelf: 'flex-start', transform: [{ scaleY: -1 }] },
  senderAvatarWrap: { marginRight: 6, justifyContent: 'flex-end' },
  senderAvatar: { width: 28, height: 28, borderRadius: 14 },

  replyPreview: { borderLeftWidth: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 4 },
  replyName: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  replyText: { fontSize: 11 },

  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, maxWidth: '100%' },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 4 },
  editedLabel: { fontSize: 9, fontStyle: 'italic' },
  msgTime: { fontSize: 9 },
  pinnedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },

  reactionsRow: { marginTop: 4, marginBottom: 2 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, marginRight: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: '600' },

  // Poll
  pollCard: { borderRadius: 10, padding: 10, marginBottom: 4, minWidth: 200 },
  pollQuestion: { fontWeight: '700', fontSize: 13, marginBottom: 8 },
  pollOption: { position: 'relative', borderWidth: 1, borderRadius: 8, marginBottom: 6, overflow: 'hidden', minHeight: 36 },
  pollBar: { position: 'absolute', top: 0, left: 0, height: '100%' },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  pollOptionText: { flex: 1, fontSize: 13 },
  pollPct: { fontSize: 11, fontWeight: '600' },
  pollFooter: { fontSize: 10, marginTop: 4 },

  // Media grid
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 10, overflow: 'hidden', marginBottom: 4 },
  mediaImg: { borderRadius: 6 },
  mediaOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  mediaOverlayText: { color: '#fff', fontWeight: '800', fontSize: 18 },

  // Media tab
  mediaTabGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 2, gap: 2 },
  mediaTabThumb: { width: (W - 8) / 3, height: (W - 8) / 3 },

  // Typing
  typingBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 5 },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot: { width: 5, height: 5, borderRadius: 3, opacity: 0.6 },
  typingText: { fontSize: 12, fontStyle: 'italic', flex: 1 },

  // Reply / edit banner
  replyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderLeftWidth: 3 },
  replyBannerName: { fontSize: 11, fontWeight: '700' },
  replyBannerText: { fontSize: 12 },
  editBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1 },
  editBannerText: { flex: 1, fontSize: 13 },

  // Input
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8, gap: 6, borderTopWidth: 1 },
  inputIconBtn: { padding: 8 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100, borderWidth: 1 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Context menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  emojiBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderBottomWidth: 1 },
  emojiBtn: { padding: 4 },
  emojiBtnText: { fontSize: 24 },
  menuPreview: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  menuPreviewName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 15, fontWeight: '500' },

  // Emoji picker
  emojiPicker: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  emojiPickerTitle: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  emojiGridBtn: { padding: 8 },
  emojiGridText: { fontSize: 28 },

  // Pinned
  pinnedModal: { flex: 1, justifyContent: 'flex-end' },
  pinnedSheet: { height: '50%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1 },
  pinnedTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  pinnedItem: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  pinnedSender: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  pinnedContent: { fontSize: 13, lineHeight: 18 },

  // Poll creation
  pollSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  pollInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10 },
  pollOptRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  pollAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12, justifyContent: 'center' },
  pollMultiRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderRadius: 10, marginBottom: 12 },
  pollCheckbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  // Image viewer
  imgViewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  imgViewerClose: { position: 'absolute', top: 52, right: 20, zIndex: 10 },
  imgViewerCloseInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});
