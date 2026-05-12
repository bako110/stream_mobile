import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, Image, Alert, Modal, Pressable,
  ScrollView, Dimensions, Animated, Linking, PermissionsAndroid,
} from 'react-native';
import Slider from '@react-native-community/slider';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import { authService } from '../../services/authService';
import { apiClient, Endpoints } from '../../api';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useCommunityWebSocket } from '../../hooks/useCommunityWebSocket';
import type { CommunityWsPayload } from '../../hooks/useCommunityWebSocket';
import type { CommunityMessageData } from '../../services/communityService';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import Geolocation from '@react-native-community/geolocation';
import { uploadMessageVideo, uploadAudioFile } from '../../services/uploadService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AudioRecorderPlayerModule = require('react-native-audio-recorder-player');
const AudioRecorderPlayerClass = AudioRecorderPlayerModule.default || AudioRecorderPlayerModule;
const audioRecorderCommunity = new AudioRecorderPlayerClass();

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
type SystemEventKind = 'joined' | 'blocked' | 'unblocked';
type CommunityMessage = Omit<CommunityMessageData, 'poll'> & {
  poll: PollData | null;
  // messages système locaux (jamais envoyés au serveur)
  _system?: { kind: SystemEventKind; name: string };
};
type ChatTab = 'discussion' | 'announcements' | 'media' | 'polls';

const TABS: { key: ChatTab; label: string; icon: string }[] = [
  { key: 'discussion',    label: 'Discussion',  icon: 'message-circle' },
  { key: 'announcements', label: 'Annonces',    icon: 'bell' },
  { key: 'media',         label: 'Médias',      icon: 'image' },
  { key: 'polls',         label: 'Sondages',    icon: 'bar-chart-2' },
];
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];

let _sysMsgCounter = 0;
function makeSystemMsg(kind: SystemEventKind, name: string): CommunityMessage {
  return {
    id: `sys_${kind}_${Date.now()}_${++_sysMsgCounter}`,
    community_id: '',
    sender_id: '',
    sender_username: null,
    sender_display_name: null,
    sender_avatar_url: null,
    message_type: 'text',
    content: null,
    media_urls: [],
    metadata: null,
    reply_to_id: null,
    reply_to: null,
    is_pinned: false,
    reactions: [],
    poll: null,
    created_at: new Date().toISOString(),
    edited_at: null,
    _system: { kind, name },
  };
}

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
function fmtFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export const CommunityChatScreen: React.FC = () => {
  const insets   = useSafeAreaInsets();
  const STATUS_H = insets.top;
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute();
  const { communityId, communityName } = route.params as RouteParams;

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
  const [communityTitle,    setCommunityTitle]    = useState(communityName);
  const [communityVerified, setCommunityVerified] = useState(false);
  const [typingUsers,    setTypingUsers]    = useState<TypingUser[]>([]);
  const [imgViewerList,  setImgViewerList]  = useState<string[]>([]);
  const [imgViewerIdx,   setImgViewerIdx]   = useState(0);
  const [imgViewerOpen,  setImgViewerOpen]  = useState(false);
  const [pollModal,      setPollModal]      = useState(false);
  const [pollQ,          setPollQ]          = useState('');
  const [pollOpts,       setPollOpts]       = useState(['', '']);
  const [pollMulti,      setPollMulti]      = useState(false);
  const [attachOpen,     setAttachOpen]     = useState(false);
  const [locating,       setLocating]       = useState(false);

  // Enregistrement vocal
  const [isRecording,  setIsRecording]  = useState(false);
  const [recordTime,   setRecordTime]   = useState('0:00');
  const [playingId,    setPlayingId]    = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [playDuration, setPlayDuration] = useState(0);

  // preview avant envoi (style WhatsApp)
  const [mediaPreview,      setMediaPreview]      = useState<{ uri: string; name: string }[]>([]);
  const [mediaPreviewIdx,   setMediaPreviewIdx]   = useState(0);
  const [mediaCaption,      setMediaCaption]      = useState('');
  const [mediaPreviewOpen,  setMediaPreviewOpen]  = useState(false);
  const [mediaUploading,    setMediaUploading]    = useState(false);
  const captionRef = useRef<TextInput>(null);

  // Édition d'annonce (modal dédié)
  const [editAnnounceMsg,   setEditAnnounceMsg]   = useState<CommunityMessage | null>(null);
  const [editAnnounceText,  setEditAnnounceText]  = useState('');
  const [editAnnounceSaving, setEditAnnounceSaving] = useState(false);

  // Clôture sondage
  const [closePollLoading, setClosePollLoading] = useState<string | null>(null);

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
      } else if (payload.type === 'community_member_joined') {
        const name = payload.display_name || payload.username || 'Un membre';
        const sys = makeSystemMsg('joined', name);
        setMessages(prev => [...prev, sys]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } else if (payload.type === 'community_member_kicked') {
        setMyId(id => {
          if (id && payload.user_id === id) {
            Alert.alert(
              'Exclu',
              'Vous avez été exclu de cette communauté.',
              [{ text: 'OK', onPress: () => nav.reset({ index: 0, routes: [{ name: 'Tabs' }] }) }],
              { cancelable: false },
            );
          }
          return id;
        });
      } else if (payload.type === 'community_member_left') {
        setTypingUsers(p => p.filter(u => u.user_id !== payload.user_id));
      } else if (payload.type === 'community_updated') {
        setCommunityTitle(payload.name);
      } else if (payload.type === 'community_verified') {
        setCommunityVerified(payload.is_verified);
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
    authService.getMe().then(async u => {
      const uid = String(u.id);
      setMyId(uid);
      try {
        const role = await communityService.getMyRole(communityId);
        if (!role) {
          // not a member — redirect immediately without showing messages
          nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
          return;
        }
        setMyRole(role);
      } catch {
        // if the API returns 403/404, treat as non-member
        nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
        return;
      }
    }).catch(() => {});
    communityService.getById(communityId).then(c => setCommunityVerified(c.is_verified)).catch(() => {});
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

  // ── Sélection image → preview (style WhatsApp) ────────────────────────────
  const handlePickMedia = () => {
    setAttachOpen(false);
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 4, quality: 0.8 }, (resp) => {
      if (resp.didCancel || !resp.assets?.length) return;
      const assets = resp.assets
        .filter(a => !!a.uri)
        .map((a, i) => ({ uri: a.uri!, name: a.fileName ?? `photo_${Date.now()}_${i}.jpg` }));
      if (!assets.length) return;
      setMediaPreview(assets);
      setMediaPreviewIdx(0);
      setMediaCaption('');
      setMediaPreviewOpen(true);
    });
  };

  const handlePickCamera = () => {
    setAttachOpen(false);
    launchCamera({ mediaType: 'photo', quality: 0.8 }, (resp) => {
      if (resp.didCancel || !resp.assets?.length) return;
      const a = resp.assets[0];
      if (!a.uri) return;
      setMediaPreview([{ uri: a.uri, name: a.fileName ?? `photo_${Date.now()}.jpg` }]);
      setMediaPreviewIdx(0);
      setMediaCaption('');
      setMediaPreviewOpen(true);
    });
  };

  const handlePickVideo = async () => {
    setAttachOpen(false);
    try {
      const result = await launchImageLibrary({ mediaType: 'video', selectionLimit: 1, videoQuality: 'medium' as any });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setSending(true);
      const uploaded = await uploadMessageVideo(asset.uri, asset.fileName, asset.type);
      const reply_to_id = replyingTo?.id;
      setReplyingTo(null);
      const msg = await communityService.sendMessage(
        communityId, '', 'video', [uploaded.url], reply_to_id,
        { duration: uploaded.duration, thumbnail_url: uploaded.thumbnail_url },
      );
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch { Alert.alert('Erreur', 'Impossible d\'envoyer la vidéo.'); }
    finally { setSending(false); }
  };

  // ── Enregistrement vocal en temps réel ───────────────────────────────────
  const startRecording = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        { title: 'Microphone', message: "L'app a besoin du micro pour enregistrer un vocal.", buttonPositive: 'OK' },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission', 'Microphone requis pour enregistrer un vocal');
        return;
      }
    }
    try {
      setIsRecording(true);
      setRecordTime('0:00');
      await audioRecorderCommunity.startRecorder(undefined, undefined, true);
      audioRecorderCommunity.addRecordBackListener((e: any) => {
        const totalSec = Math.floor(e.currentPosition / 1000);
        const m = Math.floor(totalSec / 60), s = totalSec % 60;
        setRecordTime(`${m}:${s.toString().padStart(2, '0')}`);
      });
    } catch { setIsRecording(false); }
  };

  const stopAndSendRecording = async () => {
    try {
      const result = await audioRecorderCommunity.stopRecorder();
      audioRecorderCommunity.removeRecordBackListener();
      setIsRecording(false);
      if (!result) return;
      setSending(true);
      const uploaded = await uploadAudioFile(result, `vocal_${Date.now()}.m4a`, 'audio/mp4');
      const reply_to_id = replyingTo?.id;
      setReplyingTo(null);
      const metadata = { duration: uploaded.duration ?? null, filename: `vocal_${Date.now()}.m4a` };
      const msg = await communityService.sendMessage(communityId, '', 'audio', [uploaded.url], reply_to_id, metadata);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch { Alert.alert('Erreur', "Impossible d'envoyer le vocal"); }
    finally { setSending(false); }
  };

  const cancelRecording = async () => {
    try {
      await audioRecorderCommunity.stopRecorder();
      audioRecorderCommunity.removeRecordBackListener();
    } catch {}
    setIsRecording(false);
  };

  const playAudio = async (msgId: string, url: string) => {
    if (playingId) {
      await audioRecorderCommunity.stopPlayer();
      audioRecorderCommunity.removePlayBackListener();
      if (playingId === msgId) { setPlayingId(null); return; }
    }
    setPlayingId(msgId);
    setPlayProgress(0);
    try {
      await audioRecorderCommunity.startPlayer(url);
      audioRecorderCommunity.addPlayBackListener((e: any) => {
        setPlayProgress(e.currentPosition);
        setPlayDuration(e.duration);
        if (e.currentPosition >= e.duration - 100) {
          audioRecorderCommunity.stopPlayer();
          audioRecorderCommunity.removePlayBackListener();
          setPlayingId(null);
          setPlayProgress(0);
        }
      });
    } catch { setPlayingId(null); }
  };

  const handlePickAudio = async () => {
    setAttachOpen(false);
    try {
      const [result] = await pick({ type: [types.audio] });
      setSending(true);
      const fd = new FormData();
      fd.append('file', { uri: result.uri, name: result.name ?? 'audio.mp3', type: result.type ?? 'audio/mpeg' } as any);
      const res = await apiClient.upload<{ url: string; duration?: number }>(Endpoints.upload.audio('messages'), fd);
      const url = res.data?.url;
      if (!url) throw new Error('no url');
      const metadata = { filename: result.name ?? 'audio.mp3', duration: res.data?.duration ?? null, size: result.size ?? null };
      const reply_to_id = replyingTo?.id;
      setReplyingTo(null);
      const msg = await communityService.sendMessage(communityId, '', 'audio', [url], reply_to_id, metadata);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      if (!isErrorWithCode(e) || e.code !== errorCodes.OPERATION_CANCELED) Alert.alert('Erreur', 'Impossible d\'envoyer l\'audio.');
    } finally { setSending(false); }
  };

  const handlePickFile = async () => {
    setAttachOpen(false);
    try {
      const [result] = await pick({ type: [types.pdf, types.doc, types.docx, types.xls, types.xlsx, types.plainText] });
      setSending(true);
      const fd = new FormData();
      fd.append('file', { uri: result.uri, name: result.name ?? 'fichier', type: result.type ?? 'application/octet-stream' } as any);
      const res = await apiClient.upload<{ url: string; filename: string; size: number; mime_type: string }>(
        Endpoints.upload.file('messages'), fd,
      );
      const { url, filename, size, mime_type } = res.data;
      const metadata = { filename: filename ?? result.name ?? 'fichier', size: size ?? result.size ?? 0, mime_type: mime_type ?? result.type ?? '' };
      const reply_to_id = replyingTo?.id;
      setReplyingTo(null);
      const msg = await communityService.sendMessage(communityId, '', 'file', [url], reply_to_id, metadata);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      if (!isErrorWithCode(e) || e.code !== errorCodes.OPERATION_CANCELED) Alert.alert('Erreur', 'Impossible d\'envoyer le fichier.');
    } finally { setSending(false); }
  };

  const handleSendLocation = () => {
    setAttachOpen(false);
    setLocating(true);
    const doSend = async (pos: any) => {
      setLocating(false);
      const { latitude, longitude } = pos.coords;
      const metadata = { latitude, longitude, address: null };
      try {
        const reply_to_id = replyingTo?.id;
        setReplyingTo(null);
        const msg = await communityService.sendMessage(communityId, '', 'location', [], reply_to_id, metadata);
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } catch { Alert.alert('Erreur', 'Impossible d\'envoyer la localisation.'); }
    };
    Geolocation.getCurrentPosition(
      doSend,
      () => {
        // Fallback : basse précision (réseau), pas de GPS matériel requis
        Geolocation.getCurrentPosition(
          doSend,
          (err) => { setLocating(false); Alert.alert('Erreur GPS', err.message); },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  // ── Envoi depuis le modal preview ─────────────────────────────────────────
  const handleSendMedia = async () => {
    if (!mediaPreview.length || mediaUploading) return;
    setMediaUploading(true);
    try {
      const urls: string[] = [];
      for (const asset of mediaPreview) {
        const fd = new FormData();
        fd.append('file', { uri: asset.uri, name: asset.name, type: 'image/jpeg' } as any);
        const res = await apiClient.upload<{ uploaded: { url: string }[] }>(Endpoints.upload.images('communities'), fd);
        const url = res.data?.uploaded?.[0]?.url;
        if (url) urls.push(url);
      }
      if (urls.length > 0) {
        const caption = mediaCaption.trim();
        const msg = await communityService.sendMessage(communityId, caption, 'image', urls);
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      }
    } catch {}
    finally {
      setMediaUploading(false);
      setMediaPreviewOpen(false);
      setMediaPreview([]);
      setMediaCaption('');
    }
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

  // Édition message texte normal (via champ de saisie du bas)
  const handleEdit = (msg: CommunityMessage) => {
    setMenuMsg(null); setEditingMsg(msg); setText(msg.content ?? '');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Édition annonce (modal dédié)
  const handleEditAnnounce = (msg: CommunityMessage) => {
    setMenuMsg(null);
    setEditAnnounceMsg(msg);
    setEditAnnounceText(msg.content ?? '');
  };

  const handleSaveAnnounce = async () => {
    if (!editAnnounceMsg) return;
    const content = editAnnounceText.trim();
    if (!content || content === editAnnounceMsg.content) { setEditAnnounceMsg(null); return; }
    setEditAnnounceSaving(true);
    try {
      const updated = await communityService.editMessage(communityId, editAnnounceMsg.id, content);
      setMessages(prev => prev.map(m => m.id === editAnnounceMsg.id
        ? { ...m, content: updated.content, edited_at: updated.edited_at } : m));
      setEditAnnounceMsg(null);
    } catch { Alert.alert('Erreur', 'Impossible de modifier l\'annonce'); }
    finally { setEditAnnounceSaving(false); }
  };

  // Clôture sondage
  const handleClosePoll = async (msg: CommunityMessage) => {
    if (!msg.poll) return;
    setMenuMsg(null);
    Alert.alert('Clore le sondage', 'Les votes seront définitivement fermés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Clore', style: 'destructive', onPress: async () => {
        setClosePollLoading(msg.poll!.poll_id);
        try {
          const res = await apiClient.post<PollData>(
            `/api/v1/communities/${communityId}/polls/${msg.poll!.poll_id}/close`
          );
          setMessages(prev => prev.map(m =>
            m.poll?.poll_id === msg.poll!.poll_id ? { ...m, poll: res.data } : m
          ));
        } catch { Alert.alert('Erreur', 'Impossible de clore le sondage'); }
        finally { setClosePollLoading(null); }
      }},
    ]);
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

    // ── MESSAGE SYSTÈME (bienvenue / bloc / débloc) ──────────────────────────
    if (msg._system) {
      const { kind, name } = msg._system;
      const cfg = {
        joined:    { icon: 'user-check', color: '#10B981', bg: '#10B98112', text: `${name} a rejoint la communauté` },
        blocked:   { icon: 'slash',      color: '#EF4444', bg: '#EF444412', text: `${name} a été bloqué` },
        unblocked: { icon: 'check-circle', color: '#3B82F6', bg: '#3B82F612', text: `${name} a été débloqué et a rejoint à nouveau` },
      }[kind];
      return (
        <View style={S.sysMsgRow}>
          <View style={[S.sysMsgPill, { backgroundColor: cfg.bg, borderColor: cfg.color + '30' }]}>
            <View style={[S.sysMsgIconWrap, { backgroundColor: cfg.color + '20' }]}>
              <Icon name={cfg.icon} size={11} color={cfg.color} />
            </View>
            <Text style={[S.sysMsgText, { color: cfg.color }]}>{cfg.text}</Text>
            <Text style={[S.sysMsgTime, { color: cfg.color + '80' }]}>{fmtTime(msg.created_at)}</Text>
          </View>
        </View>
      );
    }

    // ── ANNONCE ──────────────────────────────────────────────────────────────
    if (isAnnouncement) {
      return (
        <View style={{ marginHorizontal: 12 }}>
          {DateSep}
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => canAnnounce ? setMenuMsg(msg) : null}
            delayLongPress={350}
            style={[S.announceBubble, { backgroundColor: '#F59E0B0D', borderColor: '#F59E0B40' }]}
          >
            <View style={S.announceTop}>
              <View style={[S.announceIconBox, { backgroundColor: '#F59E0B20' }]}>
                <Icon name="bell" size={14} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.announceLabel, { color: '#D97706' }]}>Annonce</Text>
                <Text style={[S.announceMeta, { color: colors.textTertiary }]}>
                  {msg.sender_display_name || msg.sender_username} · {fmtTime(msg.created_at)}
                  {msg.edited_at ? '  · modifié' : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {msg.is_pinned && <View style={[S.pinnedBadge, { backgroundColor: '#F59E0B20' }]}><Icon name="bookmark" size={11} color="#F59E0B" /></View>}
                {canAnnounce && (
                  <TouchableOpacity onPress={() => setMenuMsg(msg)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="more-horizontal" size={16} color="#D97706" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text style={[S.announceText, { color: colors.textPrimary }]}>{msg.content}</Text>
            <Reactions msg={msg} />
          </TouchableOpacity>
        </View>
      );
    }

    // ── SONDAGE ──────────────────────────────────────────────────────────────
    if (isPoll) {
      const pollEnded = msg.poll?.ended ?? false;
      return (
        <View style={{ marginHorizontal: 12 }}>
          {DateSep}
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => canAnnounce ? setMenuMsg(msg) : null}
            delayLongPress={350}
            style={[S.pollMessageWrap, { backgroundColor: colors.surface, borderColor: colors.divider }]}
          >
            <View style={S.pollMsgTop}>
              <View style={[S.pollIconBox, { backgroundColor: colors.primary + '20' }]}>
                <Icon name="bar-chart-2" size={14} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.pollMsgLabel, { color: colors.primary }]}>
                  Sondage{pollEnded ? ' · Terminé' : ''}
                </Text>
                <Text style={[S.announceMeta, { color: colors.textTertiary }]}>
                  {msg.sender_display_name || msg.sender_username} · {fmtTime(msg.created_at)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {msg.is_pinned && <View style={[S.pinnedBadge, { backgroundColor: colors.primary + '20' }]}><Icon name="bookmark" size={11} color={colors.primary} /></View>}
                {canAnnounce && (
                  <TouchableOpacity onPress={() => setMenuMsg(msg)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="more-horizontal" size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
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

    const renderBubbleContent = () => {
      // Vidéo
      if (msg.message_type === 'video') {
        const thumb = msg.metadata?.thumbnail_url;
        const dur = msg.metadata?.duration;
        return (
          <TouchableOpacity
            style={[S.bubble, { backgroundColor: bubbleBg, padding: 0, overflow: 'hidden' }, isMe ? myRadius : otherRadius]}
            onPress={() => msg.media_urls[0] && Linking.openURL(msg.media_urls[0])}
            activeOpacity={0.8}
          >
            {thumb
              ? <Image source={{ uri: thumb }} style={{ width: maxW, height: maxW * 0.6 }} resizeMode="cover" />
              : <View style={{ width: maxW, height: maxW * 0.6, backgroundColor: isMe ? 'rgba(255,255,255,0.1)' : colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="video" size={36} color={isMe ? '#fff' : colors.primary} />
                </View>
            }
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.22)' }}>
              <Icon name="play-circle" size={44} color="rgba(255,255,255,0.9)" />
            </View>
            {dur != null && (
              <View style={{ position: 'absolute', bottom: 8, right: 10 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 }}>
                  {fmtDuration(dur)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      }
      // Audio
      if (msg.message_type === 'audio') {
        const meta = msg.metadata ?? {};
        const url = msg.media_urls[0];
        const isPlaying = playingId === msg.id;
        const durSec = meta.duration ?? 0;
        const progress = isPlaying && playDuration > 0 ? playProgress / playDuration : 0;
        const durLabel = isPlaying && playDuration > 0
          ? fmtDuration(Math.floor((playDuration - playProgress) / 1000))
          : durSec ? fmtDuration(durSec) : '0:00';
        return (
          <View style={[S.bubble, S.audioBubble, { backgroundColor: bubbleBg }, isMe ? myRadius : otherRadius]}>
            <TouchableOpacity
              style={[S.audioIconBox, { backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : colors.primary + '20' }]}
              onPress={() => url && playAudio(msg.id, url)}
              activeOpacity={0.8}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={isMe ? '#fff' : colors.primary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Slider
                style={{ height: 24, marginHorizontal: -4 }}
                minimumValue={0} maximumValue={1}
                value={progress}
                minimumTrackTintColor={isMe ? 'rgba(255,255,255,0.8)' : colors.primary}
                maximumTrackTintColor={isMe ? 'rgba(255,255,255,0.3)' : colors.divider}
                thumbTintColor={isMe ? '#fff' : colors.primary}
                disabled
              />
              <Text style={[S.audioMeta, { color: timeColor }]}>{durLabel}</Text>
            </View>
          </View>
        );
      }
      // Fichier
      if (msg.message_type === 'file') {
        const meta = msg.metadata ?? {};
        const ext = (meta.filename ?? '').split('.').pop()?.toUpperCase() ?? 'FILE';
        const isPdf = ext === 'PDF';
        return (
          <TouchableOpacity
            style={[S.bubble, S.fileBubble, { backgroundColor: bubbleBg }, isMe ? myRadius : otherRadius]}
            onPress={() => msg.media_urls[0] && Linking.openURL(msg.media_urls[0])}
            activeOpacity={0.8}
          >
            <View style={[S.fileIconBox, { backgroundColor: isPdf ? '#EF444420' : '#3B82F620' }]}>
              <Text style={[S.fileExt, { color: isPdf ? '#EF4444' : '#3B82F6' }]}>{ext}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[S.fileName, { color: textColor }]} numberOfLines={2}>{meta.filename ?? 'Fichier'}</Text>
              <Text style={[S.fileMeta, { color: timeColor }]}>
                {meta.size ? fmtFileSize(meta.size) : ''} · {fmtTime(msg.created_at)}
              </Text>
            </View>
            <Icon name="download" size={18} color={isMe ? 'rgba(255,255,255,0.7)' : colors.textTertiary} />
          </TouchableOpacity>
        );
      }
      // Localisation
      if (msg.message_type === 'location') {
        const meta = msg.metadata ?? {};
        const lat = meta.latitude, lng = meta.longitude;
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        const mapImg = lat != null
          ? `https://static-maps.yandex.ru/1.x/?lang=fr_FR&ll=${lng},${lat}&z=15&l=map&size=400,200&pt=${lng},${lat},pm2rdm`
          : null;
        return (
          <TouchableOpacity
            style={[S.locationCard, isMe ? S.locationCardMe : S.locationCardOther]}
            onPress={() => Linking.openURL(mapsUrl)}
            activeOpacity={0.85}
          >
            <View style={S.locationMapBox}>
              {mapImg ? (
                <Image source={{ uri: mapImg }} style={S.locationMapImg} resizeMode="cover" />
              ) : (
                <View style={[S.locationMapImg, { backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="map" size={40} color="#4CAF50" />
                </View>
              )}
              <View style={S.locationPinWrap}>
                <View style={S.locationPinCircle}>
                  <Icon name="map-pin" size={16} color="#fff" />
                </View>
                <View style={S.locationPinTail} />
              </View>
            </View>
            <View style={[S.locationFooter, isMe ? S.locationFooterMe : S.locationFooterOther]}>
              <Icon name="map-pin" size={13} color={isMe ? 'rgba(255,255,255,0.8)' : '#EF4444'} />
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={[S.locationLabel, { color: isMe ? '#fff' : colors.textPrimary }]}>Ma position</Text>
                <Text style={[S.locationCoords, { color: isMe ? 'rgba(255,255,255,0.65)' : colors.textTertiary }]} numberOfLines={1}>
                  {meta.address ?? (lat != null ? `${lat.toFixed(4)}, ${lng?.toFixed(4)}` : '…')}
                </Text>
              </View>
              <Icon name="chevron-right" size={14} color={isMe ? 'rgba(255,255,255,0.5)' : colors.textTertiary} />
            </View>
          </TouchableOpacity>
        );
      }
      // Image
      if (isMedia) {
        return (
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
        );
      }
      // Texte
      return (
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
      );
    };

    return (
      <View style={{ marginHorizontal: 12 }}>
        {DateSep}
        <View style={[S.msgRow, isMe ? S.msgRowMe : S.msgRowOther, { marginBottom: isLast ? 10 : 2 }]}>
          {!isMe && (isLast ? <Avatar msg={msg} /> : <View style={{ width: 40 }} />)}
          <View style={{ maxWidth: maxW }}>
            {!isMe && isFirst && (
              <Text style={[S.senderName, { color: colors.primary, marginLeft: 2, marginBottom: 3 }]}>
                {msg.sender_display_name || msg.sender_username}
              </Text>
            )}
            <TouchableOpacity activeOpacity={0.85} onLongPress={() => setMenuMsg(msg)} delayLongPress={350}>
              {msg.reply_to && (
                <View style={[S.replyBox, { backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : colors.backgroundSecondary, borderLeftColor: colors.primary }]}>
                  <Text style={[S.replyName, { color: colors.primary }]}>{msg.reply_to.sender_display_name || msg.reply_to.sender_username}</Text>
                  <Text style={[S.replyText, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]} numberOfLines={1}>
                    {msg.reply_to.content || '📎 Pièce jointe'}
                  </Text>
                </View>
              )}
              {renderBubbleContent()}
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
        key="media-grid"
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
      <LinearGradient
        colors={[colors.surface, colors.surface]}
        style={[S.header, { paddingTop: STATUS_H + 8, borderBottomColor: colors.divider }]}
      >
        <TouchableOpacity onPress={() => nav.goBack()} style={S.headerBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, marginLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          onPress={() => nav.navigate('CommunityDetail', { communityId })}
          activeOpacity={0.7}
        >
          {/* Avatar communauté */}
          <View style={S.headerAvatar}>
            <LinearGradient colors={['#7B3FF2', '#E0389A']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {(communityTitle || '?')[0].toUpperCase()}
              </Text>
            </LinearGradient>
            {/* Dot connecté */}
            <View style={[S.headerAvatarDot, { backgroundColor: isConnected ? '#22C55E' : '#94A3B8' }]} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[S.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{communityTitle}</Text>
              {communityVerified && (
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={9} color="#fff" />
                </View>
              )}
            </View>
            <Text style={[S.headerSub, { color: colors.textTertiary }]}>
              {isConnected ? (onlineCount > 0 ? `${onlineCount} membres en ligne` : 'En ligne') : 'Connexion…'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 2 }}>
          {pinnedMsgs.length > 0 && (
            <TouchableOpacity onPress={() => setShowPinned(true)} style={S.headerBtn}>
              <View style={[S.headerBtnInner, { backgroundColor: '#F59E0B18' }]}>
                <Icon name="bookmark" size={16} color="#F59E0B" />
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => nav.navigate('CommunityDetail', { communityId })} style={S.headerBtn}>
            <View style={[S.headerBtnInner, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="more-horizontal" size={18} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── Onglets ── */}
      <View style={[S.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[S.tabItem, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <View style={[S.tabIconWrap, active && { backgroundColor: colors.primary + '18' }]}>
                <Icon name={tab.icon} size={13} color={active ? colors.primary : colors.textTertiary} />
              </View>
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
              key={`chat-${activeTab}`}
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
              removeClippedSubviews
              maxToRenderPerBatch={15}
              windowSize={10}
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

            {/* Barre de saisie — masquée pour non-admin dans Annonces et Sondages */}
            {(activeTab === 'announcements' || activeTab === 'polls') && !canAnnounce
              ? (
                <View style={[S.readonlyBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
                  <Icon name={activeTab === 'announcements' ? 'bell' : 'bar-chart-2'} size={15} color={colors.textTertiary} />
                  <Text style={[S.readonlyText, { color: colors.textTertiary }]}>
                    {activeTab === 'announcements'
                      ? 'Seuls les admins et modérateurs peuvent publier des annonces'
                      : 'Seuls les admins et modérateurs peuvent créer des sondages'}
                  </Text>
                </View>
              )
              : isRecording ? (
                <View style={[S.recordingBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
                  <View style={S.recordingDot} />
                  <Text style={[S.recordingTime, { color: colors.textPrimary }]}>{recordTime}</Text>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={cancelRecording} style={S.recordCancelBtn}>
                    <Icon name="x" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={stopAndSendRecording} style={[S.recordSendBtn, { backgroundColor: colors.primary }]}>
                    <Icon name="send" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[S.inputBar, { backgroundColor: colors.surface, borderTopColor: (editingMsg || replyingTo) ? 'transparent' : colors.divider }]}>
                  <View style={[S.inputRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                    {activeTab === 'discussion' && (
                      <TouchableOpacity onPress={() => setAttachOpen(true)} disabled={sending || locating} style={S.inputIconBtn}>
                        {locating
                          ? <ActivityIndicator size="small" color={colors.primary} />
                          : <Icon name="plus-circle" size={19} color={colors.primary} />
                        }
                      </TouchableOpacity>
                    )}
                    {canAnnounce && activeTab === 'discussion' && (
                      <TouchableOpacity onPress={() => setPollModal(true)} disabled={sending} style={S.inputIconBtn}>
                        <Icon name="bar-chart-2" size={19} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                    {canAnnounce && activeTab === 'polls' && (
                      <TouchableOpacity onPress={() => setPollModal(true)} disabled={sending} style={S.inputIconBtn}>
                        <Icon name="plus" size={19} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                    <TextInput
                      ref={inputRef}
                      style={[S.input, { color: colors.textPrimary }]}
                      value={text}
                      onChangeText={handleTextChange}
                      placeholder={activeTab === 'announcements' ? 'Écrire une annonce…' : 'Message…'}
                      placeholderTextColor={colors.textDisabled ?? colors.textTertiary}
                      multiline maxLength={2000}
                    />
                  </View>
                  {text.trim() ? (
                    <Animated.View style={{ transform: [{ scale: sendBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: sendBtnAnim }}>
                      <TouchableOpacity
                        style={S.sendBtn}
                        onPress={handleSend}
                        disabled={sending}
                      >
                        <LinearGradient
                          colors={['#7B3FF2', '#E0389A']}
                          style={{ flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                          {sending
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Icon name={editingMsg ? 'check' : 'send'} size={17} color="#fff" />
                          }
                        </LinearGradient>
                      </TouchableOpacity>
                    </Animated.View>
                  ) : (
                    <TouchableOpacity style={S.sendBtn} onPress={startRecording} disabled={sending}>
                      <LinearGradient
                        colors={['#7B3FF2', '#E0389A']}
                        style={{ flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        <Icon name="mic" size={17} color="#fff" />
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              )
            }
          </>
        )}
      </KeyboardAvoidingView>

      {/* ── Context menu ── */}
      <Modal visible={!!menuMsg} transparent animationType="fade" onRequestClose={() => setMenuMsg(null)}>
        <Pressable style={S.overlay} onPress={() => setMenuMsg(null)}>
          <View style={[S.menuSheet, { backgroundColor: colors.surface }]}>

            {/* Aperçu du message */}
            <View style={[S.menuPreview, { borderBottomColor: colors.divider }]}>
              {/* Badge type */}
              {menuMsg?.message_type === 'announcement' && (
                <View style={[S.menuTypeBadge, { backgroundColor: '#F59E0B18' }]}>
                  <Icon name="bell" size={11} color="#F59E0B" />
                  <Text style={[S.menuTypeBadgeText, { color: '#D97706' }]}>Annonce</Text>
                </View>
              )}
              {menuMsg?.message_type === 'poll' && (
                <View style={[S.menuTypeBadge, { backgroundColor: colors.primary + '18' }]}>
                  <Icon name="bar-chart-2" size={11} color={colors.primary} />
                  <Text style={[S.menuTypeBadgeText, { color: colors.primary }]}>Sondage</Text>
                </View>
              )}
              <Text style={[S.menuPreviewName, { color: colors.primary }]}>
                {menuMsg?.sender_display_name || menuMsg?.sender_username}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={2}>
                {menuMsg?.message_type === 'poll'
                  ? menuMsg?.poll?.question ?? '…'
                  : menuMsg?.content || (menuMsg?.media_urls?.length ? '📷 Image' : '…')}
              </Text>
            </View>

            {/* Réactions rapides — uniquement messages normaux */}
            {menuMsg?.message_type !== 'announcement' && menuMsg?.message_type !== 'poll' && (
              <View style={[S.emojiRow, { borderBottomColor: colors.divider }]}>
                {QUICK_EMOJIS.map(e => (
                  <TouchableOpacity key={e} onPress={() => { handleReact(menuMsg!, e); setMenuMsg(null); }} style={S.emojiBtn}>
                    <Text style={S.emojiBig}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Actions selon type ── */}
            {(() => {
              const m = menuMsg!;
              if (!m) return null;
              const isAnn  = m.message_type === 'announcement';
              const isPoll = m.message_type === 'poll';
              const isText = m.message_type === 'text';
              const mine   = m.sender_id === myId;

              const actions: { icon: string; label: string; color: string; onPress: () => void }[] = [];

              // Répondre — tout sauf sondage
              if (!isPoll) {
                actions.push({ icon: 'corner-up-left', label: 'Répondre', color: colors.textPrimary,
                  onPress: () => { setReplyingTo(m); setMenuMsg(null); setTimeout(() => inputRef.current?.focus(), 100); } });
              }

              // Voir profil
              if (m.sender_id && m.sender_id !== myId) {
                actions.push({ icon: 'user', label: 'Voir le profil', color: colors.textPrimary,
                  onPress: () => { setMenuMsg(null); nav.navigate('UserProfile', { userId: m.sender_id }); } });
              }

              // Modifier — annonce : admin/mod ; texte normal : auteur seulement
              if (isAnn && canAnnounce) {
                actions.push({ icon: 'edit-2', label: 'Modifier l\'annonce', color: '#D97706',
                  onPress: () => handleEditAnnounce(m) });
              } else if (isText && mine) {
                actions.push({ icon: 'edit-2', label: 'Modifier', color: colors.textPrimary,
                  onPress: () => handleEdit(m) });
              }

              // Clore le sondage — admin/mod si pas encore terminé
              if (isPoll && canAnnounce && !m.poll?.ended) {
                actions.push({ icon: 'x-circle', label: 'Clore le sondage', color: '#F59E0B',
                  onPress: () => handleClosePoll(m) });
              }

              // Épingler/désépingler — admin/mod sur tout sauf sondage
              if ((isAdmin || isMod) && !isPoll) {
                actions.push({ icon: 'bookmark', label: m.is_pinned ? 'Désépingler' : 'Épingler', color: '#F59E0B',
                  onPress: () => handlePin(m, !m.is_pinned) });
              }

              // Supprimer — auteur ou admin/mod (annonces et sondages : admin/mod seulement)
              const canDel = isAdmin || isMod || (!isAnn && !isPoll && mine);
              if (canDel) {
                actions.push({ icon: 'trash-2', label: 'Supprimer', color: '#EF4444',
                  onPress: () => handleDelete(m) });
              }

              return actions.map((a, i) => (
                <TouchableOpacity key={i} style={S.menuItem} onPress={a.onPress}>
                  <View style={[S.menuItemIcon, { backgroundColor: a.color + '15' }]}>
                    <Icon name={a.icon} size={16} color={a.color} />
                  </View>
                  <Text style={[S.menuItemText, { color: a.color }]}>{a.label}</Text>
                </TouchableOpacity>
              ));
            })()}

            <TouchableOpacity
              style={[S.menuItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, justifyContent: 'center' }]}
              onPress={() => setMenuMsg(null)}
            >
              <Text style={[S.menuItemText, { color: colors.textTertiary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Menu pièces jointes ── */}
      <Modal visible={attachOpen} transparent animationType="slide" onRequestClose={() => setAttachOpen(false)}>
        <Pressable style={S.overlay} onPress={() => setAttachOpen(false)}>
          <Pressable style={[S.attachMenuSheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[S.sheetHandle, { backgroundColor: colors.divider }]} />
            <Text style={[S.attachMenuTitle, { color: colors.textPrimary }]}>Envoyer</Text>
            <View style={S.attachMenuGrid}>
              {[
                { icon: 'image',      label: 'Galerie',       color: '#7B3FF2', onPress: handlePickMedia },
                { icon: 'camera',     label: 'Appareil photo',color: '#10B981', onPress: handlePickCamera },
                { icon: 'video',      label: 'Vidéo',         color: '#9C27B0', onPress: handlePickVideo },
                { icon: 'headphones', label: 'Audio',         color: '#F59E0B', onPress: handlePickAudio },
                { icon: 'file-text',  label: 'Fichier',       color: '#3B82F6', onPress: handlePickFile },
                { icon: 'map-pin',    label: 'Localisation',  color: '#EF4444', onPress: handleSendLocation },
              ].map(item => (
                <TouchableOpacity key={item.label} style={S.attachMenuItem} onPress={item.onPress} activeOpacity={0.8}>
                  <View style={[S.attachMenuIcon, { backgroundColor: item.color + '18' }]}>
                    <Icon name={item.icon} size={24} color={item.color} />
                  </View>
                  <Text style={[S.attachMenuLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: Platform.OS === 'ios' ? 20 : 8 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal édition annonce ── */}
      <Modal
        visible={!!editAnnounceMsg}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!editAnnounceSaving) setEditAnnounceMsg(null); }}
      >
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={S.overlay} onPress={() => { if (!editAnnounceSaving) setEditAnnounceMsg(null); }} />
          <View style={[S.bottomSheet, { backgroundColor: colors.surface, maxHeight: '75%' }]}>
            <View style={[S.sheetHandle, { backgroundColor: colors.divider }]} />
            <View style={[S.sheetHeader, { borderBottomColor: colors.divider }]}>
              <View style={[S.announceIconBox, { backgroundColor: '#F59E0B20' }]}>
                <Icon name="edit-2" size={14} color="#F59E0B" />
              </View>
              <Text style={[S.sheetTitle, { color: colors.textPrimary }]}>Modifier l'annonce</Text>
              <TouchableOpacity onPress={() => setEditAnnounceMsg(null)} disabled={editAnnounceSaving}>
                <Icon name="x" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 16, paddingTop: 12 }} keyboardShouldPersistTaps="handled">
              <TextInput
                style={[S.editAnnounceInput, { color: colors.textPrimary, borderColor: colors.divider, backgroundColor: colors.backgroundSecondary }]}
                value={editAnnounceText}
                onChangeText={setEditAnnounceText}
                multiline
                autoFocus
                maxLength={2000}
                placeholder="Contenu de l'annonce…"
                placeholderTextColor={colors.textTertiary}
              />
              <TouchableOpacity
                style={[S.editAnnounceBtn, { backgroundColor: '#F59E0B', opacity: editAnnounceSaving ? 0.6 : 1, marginBottom: 32 }]}
                onPress={handleSaveAnnounce}
                disabled={editAnnounceSaving || !editAnnounceText.trim()}
              >
                {editAnnounceSaving
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Icon name="check" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Enregistrer</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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

      {/* ── Preview avant envoi (style WhatsApp) ── */}
      <Modal
        visible={mediaPreviewOpen}
        transparent={false}
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => { if (!mediaUploading) { setMediaPreviewOpen(false); setMediaPreview([]); setMediaCaption(''); } }}
      >
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <StatusBar hidden />

          {/* Header */}
          <View style={MP.header}>
            <TouchableOpacity
              onPress={() => { if (!mediaUploading) { setMediaPreviewOpen(false); setMediaPreview([]); setMediaCaption(''); } }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={MP.headerClose}
            >
              <Icon name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={MP.headerTitle}>
              {mediaPreview.length > 1 ? `${mediaPreviewIdx + 1} / ${mediaPreview.length}` : 'Aperçu'}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Image principale */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentOffset={{ x: mediaPreviewIdx * W, y: 0 }}
            onMomentumScrollEnd={e => setMediaPreviewIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
            scrollEnabled={mediaPreview.length > 1}
          >
            {mediaPreview.map((asset, i) => (
              <View key={i} style={{ width: W, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: asset.uri }} style={{ width: W, height: H * 0.62 }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>

          {/* Miniatures (si plusieurs images) */}
          {mediaPreview.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={MP.thumbRow} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
              {mediaPreview.map((asset, i) => (
                <TouchableOpacity key={i} onPress={() => setMediaPreviewIdx(i)} activeOpacity={0.8}>
                  <Image
                    source={{ uri: asset.uri }}
                    style={[MP.thumb, { borderColor: i === mediaPreviewIdx ? '#fff' : 'transparent' }]}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Barre légende + envoyer */}
          <View style={MP.bottomBar}>
            <View style={MP.captionRow}>
              <Icon name="edit-3" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
              <TextInput
                ref={captionRef}
                style={MP.captionInput}
                placeholder="Ajouter une légende…"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={mediaCaption}
                onChangeText={setMediaCaption}
                multiline
                maxLength={500}
              />
            </View>
            <TouchableOpacity
              style={[MP.sendBtn, mediaUploading && { opacity: 0.6 }]}
              onPress={handleSendMedia}
              disabled={mediaUploading}
              activeOpacity={0.85}
            >
              {mediaUploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Icon name="send" size={20} color="#fff" />
              }
            </TouchableOpacity>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBack: { padding: 6, marginRight: 2 },
  headerAvatar: { width: 38, height: 38, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  headerAvatarDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#fff' },
  headerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { fontSize: 11, marginTop: 1 },
  headerBtn: { padding: 4 },
  headerBtnInner: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  tabIconWrap: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  // Date separator
  dateSepRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 16 },
  dateSepLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateSepPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginHorizontal: 10 },
  dateSepText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Message rows
  msgRow: { flexDirection: 'row', alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },

  // Bubble
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, maxWidth: '100%' },
  msgText: { fontSize: 15, lineHeight: 22 },
  msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 5, gap: 3 },
  edited: { fontSize: 10, fontStyle: 'italic' },
  msgTime: { fontSize: 10 },
  floatTime: { fontSize: 10, marginTop: 3 },
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
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 4 },
  inputIconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  input: { flex: 1, paddingHorizontal: 8, paddingVertical: 8, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },

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

  // Messages système
  sysMsgRow:      { alignItems: 'center', marginVertical: 8, paddingHorizontal: 16 },
  sysMsgPill:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  sysMsgIconWrap: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sysMsgText:     { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  sysMsgTime:     { fontSize: 10, fontWeight: '500', marginLeft: 2 },

  // Menu contextuel — badge type
  menuTypeBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginBottom: 6 },
  menuTypeBadgeText: { fontSize: 11, fontWeight: '700' },

  // Barre lecture seule (non-admin dans Annonces/Sondages)
  readonlyBar:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  readonlyText: { flex: 1, fontSize: 12, lineHeight: 17 },

  // Édition annonce
  editAnnounceInput: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 15, lineHeight: 22, minHeight: 120, textAlignVertical: 'top', marginBottom: 14 },
  editAnnounceBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14 },

  // Attach menu sheet
  attachMenuSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 16 },
  attachMenuTitle: { fontSize: 16, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  attachMenuGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 8 },
  attachMenuItem:  { alignItems: 'center', gap: 8, width: 72 },
  attachMenuIcon:  { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  attachMenuLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },

  // Audio bubble
  audioBubble:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minWidth: 200 },
  audioIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  audioName:    { fontSize: 13, fontWeight: '600' },
  audioMeta:    { fontSize: 11, marginTop: 2 },

  // Recording bar
  recordingBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  recordingDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF4444' },
  recordingTime:   { fontSize: 16, fontWeight: '600', minWidth: 44 },
  recordCancelBtn: { padding: 8 },
  recordSendBtn:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // File bubble
  fileBubble:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  fileIconBox: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileExt:     { fontSize: 11, fontWeight: '900' },
  fileName:    { fontSize: 13, fontWeight: '600' },
  fileMeta:    { fontSize: 11, marginTop: 2 },

  // Location bubble
  locationCard:        { borderRadius: 12, overflow: 'hidden', width: 240 },
  locationCardMe:      { backgroundColor: '#054d43' },
  locationCardOther:   { backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#e0e0e0' },
  locationMapBox:      { width: '100%', height: 140, position: 'relative' },
  locationMapImg:      { width: '100%', height: 140 },
  locationPinWrap:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  locationPinCircle:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  locationPinTail:     { width: 3, height: 10, backgroundColor: '#EF4444', borderRadius: 2, marginTop: -2 },
  locationFooter:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  locationFooterMe:    { backgroundColor: '#054d43' },
  locationFooterOther: { backgroundColor: '#f5f5f5' },
  locationLabel:       { fontSize: 13, fontWeight: '700' },
  locationCoords:      { fontSize: 11, marginTop: 1 },
});

// Styles du modal preview média
const MP = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12,
  },
  headerClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },

  thumbRow: { maxHeight: 72, paddingVertical: 8 },
  thumb: {
    width: 54, height: 54, borderRadius: 8, borderWidth: 2,
  },

  bottomBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingBottom: 28, paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', gap: 10,
  },
  captionRow: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 24,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  captionInput: {
    flex: 1, color: '#fff', fontSize: 15, maxHeight: 100, paddingVertical: 0,
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#25D366',
    alignItems: 'center', justifyContent: 'center',
  },
});
