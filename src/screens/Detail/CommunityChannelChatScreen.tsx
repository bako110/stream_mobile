/**
 * CommunityChannelChatScreen
 * Chat complet : texte, images, audio, fichiers, localisation, répondre, modifier, supprimer, épingler.
 */
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
import { uploadMessageVideo, uploadAudioFile, uploadFileFromUri } from '../../services/uploadService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AudioRecorderPlayerModule = require('react-native-audio-recorder-player');
const AudioRecorderPlayerClass = AudioRecorderPlayerModule.default || AudioRecorderPlayerModule;
const audioRecorderChannel = new AudioRecorderPlayerClass();
import { useCommunityWebSocket } from '../../hooks/useCommunityWebSocket';
import type { CommunityWsPayload } from '../../hooks/useCommunityWebSocket';
import type { CommunityMessageData } from '../../services/communityService';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import Geolocation from '@react-native-community/geolocation';

const { width: W } = Dimensions.get('window');

interface RouteParams {
  communityId: string;
  communityName: string;
  channelId: string;
  channelName: string;
  channelAvatar?: string | null;
  myRole: string | null;
  isAnnouncement?: boolean;
}

type CommunityMessage = Omit<CommunityMessageData, 'poll'> & { poll: null };

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
function fmtFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const CommunityChannelChatScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute();
  const { communityId, communityName, channelId, channelName, channelAvatar, myRole, isAnnouncement } = route.params as RouteParams;

  const isAdmin     = myRole === 'admin';
  const isMod       = myRole === 'moderator';
  const canWrite    = !isAnnouncement || isAdmin || isMod;
  const canManage   = isAdmin || isMod;

  const [messages,    setMessages]    = useState<CommunityMessage[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending,     setSending]     = useState(false);
  const [text,        setText]        = useState('');
  const [myId,        setMyId]        = useState<string | null>(null);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(true);
  const [editingMsg,  setEditingMsg]  = useState<CommunityMessage | null>(null);
  const [replyingTo,  setReplyingTo]  = useState<CommunityMessage | null>(null);
  const [menuMsg,     setMenuMsg]     = useState<CommunityMessage | null>(null);
  const [attachOpen,  setAttachOpen]  = useState(false);
  const [locating,    setLocating]    = useState(false);

  // Enregistrement vocal
  const [isRecording,  setIsRecording]  = useState(false);
  const [recordTime,   setRecordTime]   = useState('0:00');
  const [playingId,    setPlayingId]    = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [playDuration, setPlayDuration] = useState(0);

  // Preview avant envoi fichier
  type FilePending = { uri: string; name: string; size?: number; mimeType?: string };
  const [filePreview,     setFilePreview]     = useState<FilePending | null>(null);
  const [fileCaption,     setFileCaption]     = useState('');
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [fileUploading,   setFileUploading]   = useState(false);
  const fileCaptionRef = useRef<TextInput>(null);

  // Media preview (images)
  const [mediaPreview,     setMediaPreview]     = useState<{ uri: string; name: string }[]>([]);
  const [mediaCaption,     setMediaCaption]     = useState('');
  const [mediaPreviewOpen, setMediaPreviewOpen] = useState(false);
  const [mediaUploading,   setMediaUploading]   = useState(false);

  // Image viewer
  const [imgViewerList, setImgViewerList] = useState<string[]>([]);
  const [imgViewerIdx,  setImgViewerIdx]  = useState(0);
  const [imgViewerOpen, setImgViewerOpen] = useState(false);

  const listRef  = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const sendBtnAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(sendBtnAnim, { toValue: text.trim() ? 1 : 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
  }, [text]);

  const { isConnected } = useCommunityWebSocket(
    communityId,
    useCallback((payload: CommunityWsPayload) => {
      if ((payload as any).channel_id && (payload as any).channel_id !== channelId) return;
      if (payload.type === 'community_message' || payload.type === 'community_message_sent') {
        const msg = payload as unknown as CommunityMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } else if (payload.type === 'community_message_edited') {
        const e = payload as unknown as CommunityMessage;
        setMessages(prev => prev.map(m => m.id === e.id ? { ...m, content: e.content, edited_at: e.edited_at } : m));
      } else if (payload.type === 'community_message_deleted') {
        setMessages(prev => prev.filter(m => m.id !== payload.id));
      }
    }, [channelId]),
  );

  const loadMessages = useCallback(async (p = 1, prepend = false) => {
    try {
      const msgs = await communityService.getChannelMessages(communityId, channelId, p, 30);
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
  }, [communityId, channelId]);

  useEffect(() => {
    authService.getMe().then(u => setMyId(String(u.id))).catch(() => {});
    loadMessages(1, false);
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    loadMessages(next, true);
  }, [hasMore, loadingMore, loading, page]);

  // ── Envoi texte / édition ────────────────────────────────────────────────────
  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');

    if (editingMsg) {
      const msgId = editingMsg.id;
      setEditingMsg(null);
      try {
        const updated = await communityService.editChannelMessage(communityId, channelId, msgId, content);
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: updated.content, edited_at: updated.edited_at } : m));
      } catch {}
      setSending(false);
      return;
    }

    const reply_to_id = replyingTo?.id ?? null;
    setReplyingTo(null);
    try {
      const msg = await communityService.sendChannelMessage(communityId, channelId, content, isAnnouncement ? 'announcement' : 'text', [], reply_to_id ?? undefined);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {}
    setSending(false);
  };

  // ── Images ───────────────────────────────────────────────────────────────────
  const handlePickImage = () => {
    setAttachOpen(false);
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 4, quality: 0.8 }, (resp) => {
      if (resp.didCancel || !resp.assets?.length) return;
      const assets = resp.assets.filter(a => !!a.uri).map((a, i) => ({ uri: a.uri!, name: a.fileName ?? `photo_${Date.now()}_${i}.jpg` }));
      if (!assets.length) return;
      setMediaPreview(assets);
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
      setMediaCaption('');
      setMediaPreviewOpen(true);
    });
  };

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
        const reply_to_id = replyingTo?.id;
        setReplyingTo(null);
        const msg = await communityService.sendChannelMessage(communityId, channelId, mediaCaption.trim(), 'image', urls, reply_to_id);
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      }
    } catch { Alert.alert('Erreur', 'Impossible d\'envoyer les images.'); }
    finally {
      setMediaUploading(false);
      setMediaPreviewOpen(false);
      setMediaPreview([]);
      setMediaCaption('');
    }
  };

  // ── Vidéo ────────────────────────────────────────────────────────────────────
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
      const msg = await communityService.sendChannelMessage(
        communityId, channelId, null as any, 'video', [uploaded.url], reply_to_id,
        { duration: uploaded.duration, thumbnail_url: uploaded.thumbnail_url },
      );
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch { Alert.alert('Erreur', 'Impossible d\'envoyer la vidéo.'); }
    finally { setSending(false); }
  };

  // ── Enregistrement vocal en temps réel ───────────────────────────────────────
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
      await audioRecorderChannel.startRecorder(undefined, undefined, true);
      audioRecorderChannel.addRecordBackListener((e: any) => {
        const totalSec = Math.floor(e.currentPosition / 1000);
        const m = Math.floor(totalSec / 60), s = totalSec % 60;
        setRecordTime(`${m}:${s.toString().padStart(2, '0')}`);
      });
    } catch { setIsRecording(false); }
  };

  const stopAndSendRecording = async () => {
    try {
      const result = await audioRecorderChannel.stopRecorder();
      audioRecorderChannel.removeRecordBackListener();
      setIsRecording(false);
      if (!result) return;
      setSending(true);
      const uploaded = await uploadAudioFile(result, `vocal_${Date.now()}.m4a`, 'audio/mp4');
      const reply_to_id = replyingTo?.id;
      setReplyingTo(null);
      const metadata = { duration: uploaded.duration ?? null, filename: `vocal_${Date.now()}.m4a` };
      const msg = await communityService.sendChannelMessage(communityId, channelId, null as any, 'audio', [uploaded.url], reply_to_id, metadata);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch { Alert.alert('Erreur', "Impossible d'envoyer le vocal"); }
    finally { setSending(false); }
  };

  const cancelRecording = async () => {
    try {
      await audioRecorderChannel.stopRecorder();
      audioRecorderChannel.removeRecordBackListener();
    } catch {}
    setIsRecording(false);
  };

  const playAudio = async (msgId: string, url: string) => {
    if (playingId) {
      await audioRecorderChannel.stopPlayer();
      audioRecorderChannel.removePlayBackListener();
      if (playingId === msgId) { setPlayingId(null); return; }
    }
    setPlayingId(msgId);
    setPlayProgress(0);
    try {
      await audioRecorderChannel.startPlayer(url);
      audioRecorderChannel.addPlayBackListener((e: any) => {
        setPlayProgress(e.currentPosition);
        setPlayDuration(e.duration);
        if (e.currentPosition >= e.duration - 100) {
          audioRecorderChannel.stopPlayer();
          audioRecorderChannel.removePlayBackListener();
          setPlayingId(null);
          setPlayProgress(0);
        }
      });
    } catch { setPlayingId(null); }
  };

  // ── Audio ────────────────────────────────────────────────────────────────────
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
      const msg = await communityService.sendChannelMessage(communityId, channelId, null as any, 'audio', [url], reply_to_id, metadata);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      if (!isErrorWithCode(e) || e.code !== errorCodes.OPERATION_CANCELED) Alert.alert('Erreur', 'Impossible d\'envoyer l\'audio.');
    } finally { setSending(false); }
  };

  // ── Fichiers ─────────────────────────────────────────────────────────────────
  const handlePickFile = async () => {
    setAttachOpen(false);
    try {
      const [result] = await pick({ type: [types.pdf, types.doc, types.docx, types.xls, types.xlsx, types.plainText, types.allFiles] });
      setFilePreview({ uri: result.uri, name: result.name ?? 'fichier', size: result.size ?? undefined, mimeType: result.type ?? undefined });
      setFileCaption('');
      setFilePreviewOpen(true);
    } catch (e: any) {
      if (!isErrorWithCode(e) || e.code !== errorCodes.OPERATION_CANCELED) Alert.alert('Erreur', "Impossible d'ouvrir le fichier.");
    }
  };

  const handleSendFilePreview = async () => {
    if (!filePreview || fileUploading) return;
    setFileUploading(true);
    try {
      const uploaded = await uploadFileFromUri(filePreview.uri, filePreview.name, filePreview.mimeType ?? 'application/octet-stream');
      const metadata = { filename: uploaded.filename, size: filePreview.size ?? 0, mime_type: uploaded.mime_type };
      const reply_to_id = replyingTo?.id;
      setReplyingTo(null);
      const caption = fileCaption.trim();
      const msg = await communityService.sendChannelMessage(communityId, channelId, null as any, 'file', [uploaded.url], reply_to_id, metadata);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      setFilePreviewOpen(false);
      setFilePreview(null);
      setFileCaption('');
    } catch { Alert.alert('Erreur', "Impossible d'envoyer le fichier."); }
    finally { setFileUploading(false); }
  };

  // ── Localisation ─────────────────────────────────────────────────────────────
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
        const msg = await communityService.sendChannelMessage(communityId, channelId, null as any, 'location', [], reply_to_id, metadata);
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } catch { Alert.alert('Erreur', 'Impossible d\'envoyer la localisation.'); }
    };
    Geolocation.getCurrentPosition(
      doSend,
      () => {
        Geolocation.getCurrentPosition(
          doSend,
          (err) => { setLocating(false); Alert.alert('Erreur GPS', err.message); },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  // ── Actions message ──────────────────────────────────────────────────────────
  const handleDelete = (msg: CommunityMessage) => {
    setMenuMsg(null);
    Alert.alert('Supprimer', 'Supprimer ce message ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await communityService.deleteChannelMessage(communityId, channelId, msg.id);
          setMessages(prev => prev.filter(m => m.id !== msg.id));
        } catch {}
      }},
    ]);
  };

  const handlePin = async (msg: CommunityMessage, pin: boolean) => {
    setMenuMsg(null);
    try {
      await apiClient.post(`/api/v1/communities/${communityId}/channels/${channelId}/messages/${msg.id}/pin?pin=${pin}`);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: pin } : m));
    } catch {}
  };

  // ── Rendu message ────────────────────────────────────────────────────────────
  const renderMessage = ({ item: msg, index }: { item: CommunityMessage; index: number }) => {
    const isMe = msg.sender_id === myId;
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const showDate = !prev || !sameDay(prev.created_at, msg.created_at);
    const isFirst = !prev || prev.sender_id !== msg.sender_id || !sameDay(prev.created_at, msg.created_at);
    const isLast  = !next || next.sender_id !== msg.sender_id || !sameDay(next.created_at, msg.created_at);

    const maxW = W * 0.72;
    const bubbleBg  = isMe ? colors.primary : (colors.surfaceElevated ?? colors.backgroundSecondary);
    const textColor = isMe ? '#fff' : colors.textPrimary;
    const timeColor = isMe ? 'rgba(255,255,255,0.55)' : colors.textTertiary;
    const myRadius  = { borderBottomRightRadius: isLast ? 4 : 16 };
    const otherRadius = { borderBottomLeftRadius: isLast ? 4 : 16 };

    const DateSep = showDate ? (
      <View style={C.dateSepRow}>
        <View style={[C.dateSepLine, { backgroundColor: colors.divider }]} />
        <View style={[C.dateSepPill, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[C.dateSepText, { color: colors.textTertiary }]}>{fmtDate(msg.created_at)}</Text>
        </View>
        <View style={[C.dateSepLine, { backgroundColor: colors.divider }]} />
      </View>
    ) : null;

    // Annonce
    if (msg.message_type === 'announcement') {
      return (
        <View style={{ marginHorizontal: 12 }}>
          {DateSep}
          <TouchableOpacity activeOpacity={0.85} onLongPress={() => canManage ? setMenuMsg(msg) : undefined} delayLongPress={350}
            style={[C.announceBubble, { backgroundColor: '#F59E0B0D', borderColor: '#F59E0B40' }]}>
            <View style={C.announceTop}>
              <View style={[C.announceIconBox, { backgroundColor: '#F59E0B20' }]}>
                <Icon name="bell" size={13} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[C.announceLabel, { color: '#D97706' }]}>Annonce</Text>
                <Text style={[C.announceMeta, { color: colors.textTertiary }]}>
                  {msg.sender_display_name || msg.sender_username} · {fmtTime(msg.created_at)}
                </Text>
              </View>
              {canManage && (
                <TouchableOpacity onPress={() => setMenuMsg(msg)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="more-horizontal" size={16} color="#D97706" />
                </TouchableOpacity>
              )}
            </View>
            <Text style={[C.announceText, { color: colors.textPrimary }]}>{msg.content}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const renderBubbleContent = () => {
      // Vidéo
      if (msg.message_type === 'video') {
        const thumb = msg.metadata?.thumbnail_url;
        const dur = msg.metadata?.duration;
        return (
          <TouchableOpacity
            style={[C.bubble, { backgroundColor: bubbleBg, padding: 0, overflow: 'hidden' }, isMe ? myRadius : otherRadius]}
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

      // Image
      if (msg.message_type === 'image' || msg.message_type === 'media') {
        return (
          <View style={{ gap: 4 }}>
            {msg.media_urls.length === 1 ? (
              <TouchableOpacity onPress={() => { setImgViewerList(msg.media_urls); setImgViewerIdx(0); setImgViewerOpen(true); }}>
                <Image source={{ uri: msg.media_urls[0] }} style={{ width: maxW, height: maxW * 0.65, borderRadius: 10 }} resizeMode="cover" />
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                {msg.media_urls.slice(0, 4).map((url, i) => (
                  <TouchableOpacity key={i} onPress={() => { setImgViewerList(msg.media_urls); setImgViewerIdx(i); setImgViewerOpen(true); }}>
                    <Image source={{ uri: url }} style={{ width: (maxW - 3) / 2, height: (maxW - 3) / 2 * 0.7, borderRadius: 8 }} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {msg.content ? (
              <View style={[C.bubble, { backgroundColor: bubbleBg }, isMe ? myRadius : otherRadius]}>
                <Text style={[C.msgText, { color: textColor }]}>{msg.content}</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: isMe ? 'right' : 'left', marginTop: 2 }}>
              {fmtTime(msg.created_at)}
            </Text>
          </View>
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
          <View style={[C.bubble, C.audioBubble, { backgroundColor: bubbleBg }, isMe ? myRadius : otherRadius]}>
            <TouchableOpacity
              style={[C.audioIconBox, { backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : colors.primary + '20' }]}
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
              <Text style={[C.audioMeta, { color: timeColor }]}>{durLabel}</Text>
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
            style={[C.bubble, C.fileBubble, { backgroundColor: bubbleBg }, isMe ? myRadius : otherRadius]}
            onPress={() => msg.media_urls[0] && Linking.openURL(msg.media_urls[0])}
            activeOpacity={0.8}
          >
            <View style={[C.fileIconBox, { backgroundColor: isPdf ? '#EF444420' : '#3B82F620' }]}>
              <Text style={[C.fileExt, { color: isPdf ? '#EF4444' : '#3B82F6' }]}>{ext}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[C.fileName, { color: textColor }]} numberOfLines={2}>{meta.filename ?? 'Fichier'}</Text>
              <Text style={[C.fileMeta, { color: timeColor }]}>
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
            style={[C.locationCard, isMe ? C.locationCardMe : C.locationCardOther]}
            onPress={() => Linking.openURL(mapsUrl)}
            activeOpacity={0.85}
          >
            <View style={C.locationMapBox}>
              {mapImg ? (
                <Image source={{ uri: mapImg }} style={C.locationMapImg} resizeMode="cover" />
              ) : (
                <View style={[C.locationMapImg, { backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="map" size={40} color="#4CAF50" />
                </View>
              )}
              <View style={C.locationPinWrap}>
                <View style={C.locationPinCircle}>
                  <Icon name="map-pin" size={16} color="#fff" />
                </View>
                <View style={C.locationPinTail} />
              </View>
            </View>
            <View style={[C.locationFooter, isMe ? C.locationFooterMe : C.locationFooterOther]}>
              <Icon name="map-pin" size={13} color={isMe ? 'rgba(255,255,255,0.8)' : '#EF4444'} />
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={[C.locationLabel, { color: isMe ? '#fff' : colors.textPrimary }]}>Ma position</Text>
                <Text style={[C.locationCoords, { color: isMe ? 'rgba(255,255,255,0.65)' : colors.textTertiary }]} numberOfLines={1}>
                  {meta.address ?? (lat != null ? `${lat.toFixed(4)}, ${lng?.toFixed(4)}` : '…')}
                </Text>
              </View>
              <Icon name="chevron-right" size={14} color={isMe ? 'rgba(255,255,255,0.5)' : colors.textTertiary} />
            </View>
          </TouchableOpacity>
        );
      }

      // Texte
      return (
        <View style={[C.bubble, { backgroundColor: bubbleBg }, isMe ? myRadius : otherRadius]}>
          {msg.is_pinned && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Icon name="bookmark" size={10} color={isMe ? 'rgba(255,255,255,0.7)' : '#F59E0B'} />
              <Text style={{ color: isMe ? 'rgba(255,255,255,0.7)' : '#F59E0B', fontSize: 9, fontWeight: '700', marginLeft: 3 }}>Épinglé</Text>
            </View>
          )}
          <Text style={[C.msgText, { color: textColor }]}>{msg.content}</Text>
          <View style={C.msgMeta}>
            {msg.edited_at && <Text style={[{ fontSize: 10, fontStyle: 'italic', color: timeColor }]}>modifié · </Text>}
            <Text style={[C.msgTime, { color: timeColor }]}>{fmtTime(msg.created_at)}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={{ marginHorizontal: 12 }}>
        {DateSep}
        <View style={[C.msgRow, isMe ? C.msgRowMe : C.msgRowOther, { marginBottom: isLast ? 10 : 2 }]}>
          {!isMe && (isLast
            ? (
              <TouchableOpacity onPress={() => nav.navigate('UserProfile', { userId: msg.sender_id })} style={{ marginRight: 8, alignSelf: 'flex-end' }}>
                {msg.sender_avatar_url
                  ? <Image source={{ uri: msg.sender_avatar_url }} style={C.avatar} />
                  : <View style={[C.avatarPlaceholder, { backgroundColor: colors.primary + '30' }]}>
                      <Text style={[C.avatarLetter, { color: colors.primary }]}>
                        {(msg.sender_display_name || msg.sender_username || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                }
              </TouchableOpacity>
            )
            : <View style={{ width: 40 }} />
          )}

          <View style={{ maxWidth: maxW }}>
            {!isMe && isFirst && (
              <Text style={[C.senderName, { color: colors.primary }]}>
                {msg.sender_display_name || msg.sender_username}
              </Text>
            )}
            <TouchableOpacity activeOpacity={0.85} onLongPress={() => setMenuMsg(msg)} delayLongPress={350}>
              {msg.reply_to && (
                <View style={[C.replyBox, { backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : colors.backgroundSecondary, borderLeftColor: colors.primary }]}>
                  <Text style={[C.replyName, { color: colors.primary }]}>{msg.reply_to.sender_display_name || msg.reply_to.sender_username}</Text>
                  <Text style={[C.replyText, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]} numberOfLines={1}>
                    {msg.reply_to.content || '📎 Pièce jointe'}
                  </Text>
                </View>
              )}
              {renderBubbleContent()}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[C.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />

      {/* Header */}
      <LinearGradient colors={[colors.surface, colors.surface]}
        style={[C.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={C.headerBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        {channelAvatar
          ? <Image source={{ uri: channelAvatar }} style={[C.channelIconBox, { borderRadius: 10 }]} />
          : <View style={[C.channelIconBox, { backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', borderRadius: 10 }]}>
              <Icon name={isAnnouncement ? 'bell' : 'hash'} size={16} color={colors.primary} />
            </View>
        }
        <View style={{ flex: 1 }}>
          <Text style={[C.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{channelName}</Text>
          <Text style={[C.headerSub, { color: colors.textTertiary }]}>{communityName}</Text>
        </View>
        {isConnected
          ? <View style={[C.onlineDot, { backgroundColor: '#22C55E' }]} />
          : <View style={[C.onlineDot, { backgroundColor: '#94A3B8' }]} />
        }
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
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
              ListEmptyComponent={
                <View style={C.empty}>
                  <Icon name={isAnnouncement ? 'bell' : 'hash'} size={40} color={colors.textTertiary} />
                  <Text style={[C.emptyTitle, { color: colors.textPrimary }]}>Début du canal</Text>
                  <Text style={[C.emptySub, { color: colors.textTertiary }]}>
                    {isAnnouncement ? 'Les annonces apparaîtront ici.' : 'Soyez le premier à écrire dans ce canal !'}
                  </Text>
                </View>
              }
              onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
              removeClippedSubviews
              maxToRenderPerBatch={15}
              windowSize={10}
            />

            {/* Reply banner */}
            {replyingTo && (
              <View style={[C.replyBanner, { backgroundColor: colors.surface, borderTopColor: colors.divider, borderLeftColor: colors.primary }]}>
                <Icon name="corner-up-left" size={14} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[C.replyBannerName, { color: colors.primary }]}>{replyingTo.sender_display_name || replyingTo.sender_username}</Text>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary }]} numberOfLines={1}>
                    {replyingTo.content || '📎 Pièce jointe'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="x" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Edit banner */}
            {editingMsg && (
              <View style={[C.editBanner, { backgroundColor: colors.surface, borderTopColor: colors.primary }]}>
                <Icon name="edit-2" size={14} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[C.replyBannerName, { color: colors.primary }]}>Modification</Text>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary }]} numberOfLines={1}>{editingMsg.content}</Text>
                </View>
                <TouchableOpacity onPress={() => { setEditingMsg(null); setText(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="x" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Barre de saisie */}
            {!canWrite ? (
              <View style={[C.readonlyBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
                <Icon name="bell" size={15} color={colors.textTertiary} />
                <Text style={[C.readonlyText, { color: colors.textTertiary }]}>
                  Seuls les admins et modérateurs peuvent publier dans ce canal
                </Text>
              </View>
            ) : isRecording ? (
              <View style={[C.recordingBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
                <View style={C.recordingDot} />
                <Text style={[C.recordingTime, { color: colors.textPrimary }]}>{recordTime}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={cancelRecording} style={C.recordCancelBtn}>
                  <Icon name="x" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={stopAndSendRecording} style={[C.recordSendBtn, { backgroundColor: colors.primary }]}>
                  <Icon name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[C.inputBar, { backgroundColor: colors.surface, borderTopColor: (editingMsg || replyingTo) ? 'transparent' : colors.divider }]}>
                {/* Bouton pièces jointes */}
                {!editingMsg && (
                  <TouchableOpacity onPress={() => setAttachOpen(true)} disabled={sending || locating} style={C.inputIconBtn}>
                    {locating
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Icon name="plus-circle" size={22} color={colors.primary} />
                    }
                  </TouchableOpacity>
                )}
                <View style={[C.inputRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                  <TextInput
                    ref={inputRef}
                    style={[C.input, { color: colors.textPrimary }]}
                    value={text}
                    onChangeText={setText}
                    placeholder={isAnnouncement ? 'Écrire une annonce…' : 'Message…'}
                    placeholderTextColor={colors.textTertiary}
                    multiline maxLength={2000}
                  />
                </View>
                {text.trim() ? (
                  <Animated.View style={{ transform: [{ scale: sendBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: sendBtnAnim }}>
                    <TouchableOpacity style={C.sendBtn} onPress={handleSend} disabled={sending}>
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
                  <TouchableOpacity style={C.sendBtn} onPress={startRecording} disabled={sending}>
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
            )}
          </>
        )}
      </KeyboardAvoidingView>

      {/* ── Preview avant envoi fichier ── */}
      <Modal
        visible={filePreviewOpen}
        transparent={false}
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => { if (!fileUploading) { setFilePreviewOpen(false); setFilePreview(null); setFileCaption(''); } }}
      >
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#1a1a1a' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <StatusBar hidden />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12 }}>
            <TouchableOpacity
              onPress={() => { if (!fileUploading) { setFilePreviewOpen(false); setFilePreview(null); setFileCaption(''); } }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 }} numberOfLines={1}>
              {filePreview?.name ?? 'Fichier'}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <View style={{ width: 96, height: 96, borderRadius: 20, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Icon name="file-text" size={44} color="#7B3FF2" />
            </View>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 6 }} numberOfLines={2}>
              {filePreview?.name}
            </Text>
            {filePreview?.size != null && (
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                {filePreview.size < 1024 ? `${filePreview.size} o`
                  : filePreview.size < 1048576 ? `${(filePreview.size / 1024).toFixed(1)} Ko`
                  : `${(filePreview.size / 1048576).toFixed(1)} Mo`}
              </Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12, gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#2a2a2a', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}>
              <Icon name="edit-3" size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                ref={fileCaptionRef}
                style={{ flex: 1, color: '#fff', fontSize: 15, maxHeight: 100 }}
                placeholder="Ajouter un commentaire…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={fileCaption}
                onChangeText={setFileCaption}
                multiline
                maxLength={500}
              />
            </View>
            <TouchableOpacity
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', opacity: fileUploading ? 0.6 : 1 }}
              onPress={handleSendFilePreview}
              disabled={fileUploading}
              activeOpacity={0.85}
            >
              {fileUploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Icon name="send" size={20} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Menu pièces jointes */}
      <Modal visible={attachOpen} transparent animationType="slide" onRequestClose={() => setAttachOpen(false)}>
        <Pressable style={C.overlay} onPress={() => setAttachOpen(false)}>
          <Pressable style={[C.attachSheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[C.sheetHandle, { backgroundColor: colors.divider }]} />
            <Text style={[C.attachTitle, { color: colors.textPrimary }]}>Envoyer</Text>
            <View style={C.attachGrid}>
              {[
                { icon: 'image',      label: 'Galerie',       color: '#7B3FF2', onPress: handlePickImage },
                { icon: 'camera',     label: 'Appareil photo',color: '#10B981', onPress: handlePickCamera },
                { icon: 'video',      label: 'Vidéo',         color: '#9C27B0', onPress: handlePickVideo },
                { icon: 'headphones', label: 'Audio',         color: '#F59E0B', onPress: handlePickAudio },
                { icon: 'file-text',  label: 'Fichier',       color: '#3B82F6', onPress: handlePickFile },
                { icon: 'map-pin',    label: 'Localisation',  color: '#EF4444', onPress: handleSendLocation },
              ].map(item => (
                <TouchableOpacity key={item.label} style={C.attachItem} onPress={item.onPress} activeOpacity={0.8}>
                  <View style={[C.attachIconBox, { backgroundColor: item.color + '18' }]}>
                    <Icon name={item.icon} size={24} color={item.color} />
                  </View>
                  <Text style={[C.attachLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: Platform.OS === 'ios' ? 20 : 8 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Context menu message */}
      <Modal visible={!!menuMsg} transparent animationType="fade" onRequestClose={() => setMenuMsg(null)}>
        <Pressable style={C.overlay} onPress={() => setMenuMsg(null)}>
          <View style={[C.menuSheet, { backgroundColor: colors.surface }]}>
            {menuMsg?.message_type === 'text' && (
              <View style={[C.emojiRow, { borderBottomColor: colors.divider }]}>
                {QUICK_EMOJIS.map(e => (
                  <TouchableOpacity key={e} onPress={() => setMenuMsg(null)} style={C.emojiBtn}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={[C.menuPreview, { borderBottomColor: colors.divider }]}>
              <Text style={[{ fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 3 }]}>
                {menuMsg?.sender_display_name || menuMsg?.sender_username}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={2}>
                {menuMsg?.content || '📎 Pièce jointe'}
              </Text>
            </View>
            {[
              { show: menuMsg?.message_type !== 'announcement', icon: 'corner-up-left', label: 'Répondre', color: colors.textPrimary,
                onPress: () => { setReplyingTo(menuMsg!); setMenuMsg(null); setTimeout(() => inputRef.current?.focus(), 100); } },
              { show: menuMsg?.sender_id === myId && menuMsg?.message_type === 'text', icon: 'edit-2', label: 'Modifier', color: colors.textPrimary,
                onPress: () => { setEditingMsg(menuMsg!); setText(menuMsg!.content ?? ''); setMenuMsg(null); setTimeout(() => inputRef.current?.focus(), 100); } },
              { show: !!(menuMsg?.sender_id && menuMsg.sender_id !== myId), icon: 'user', label: 'Voir le profil', color: colors.textPrimary,
                onPress: () => { setMenuMsg(null); nav.navigate('UserProfile', { userId: menuMsg!.sender_id }); } },
              { show: canManage && menuMsg?.message_type !== 'announcement', icon: 'bookmark', label: menuMsg?.is_pinned ? 'Désépingler' : 'Épingler', color: '#F59E0B',
                onPress: () => handlePin(menuMsg!, !menuMsg!.is_pinned) },
              { show: !!(menuMsg?.sender_id === myId || canManage), icon: 'trash-2', label: 'Supprimer', color: '#EF4444',
                onPress: () => handleDelete(menuMsg!) },
            ].filter(a => a.show).map((a, i) => (
              <TouchableOpacity key={i} style={C.menuItem} onPress={a.onPress}>
                <View style={[C.menuItemIcon, { backgroundColor: a.color + '15' }]}><Icon name={a.icon} size={16} color={a.color} /></View>
                <Text style={[C.menuItemText, { color: a.color }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[C.menuItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, justifyContent: 'center' }]} onPress={() => setMenuMsg(null)}>
              <Text style={[C.menuItemText, { color: colors.textTertiary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Preview images avant envoi */}
      <Modal visible={mediaPreviewOpen} transparent={false} statusBarTranslucent animationType="slide"
        onRequestClose={() => { if (!mediaUploading) { setMediaPreviewOpen(false); setMediaPreview([]); } }}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <StatusBar hidden />
          <View style={MP.header}>
            <TouchableOpacity onPress={() => { if (!mediaUploading) { setMediaPreviewOpen(false); setMediaPreview([]); } }} style={MP.closeBtn}>
              <Icon name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={MP.title}>Aperçu ({mediaPreview.length})</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {mediaPreview.map((a, i) => (
              <View key={i} style={{ width: W, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: a.uri }} style={{ width: W, height: W * 1.1 }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
          <View style={MP.bottomBar}>
            <View style={MP.captionRow}>
              <Icon name="edit-3" size={16} color="rgba(255,255,255,0.5)" />
              <TextInput style={MP.captionInput} placeholder="Ajouter une légende…" placeholderTextColor="rgba(255,255,255,0.4)"
                value={mediaCaption} onChangeText={setMediaCaption} multiline maxLength={500} />
            </View>
            <TouchableOpacity style={[MP.sendBtn, mediaUploading && { opacity: 0.6 }]} onPress={handleSendMedia} disabled={mediaUploading}>
              {mediaUploading ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="send" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Image viewer plein écran */}
      <Modal visible={imgViewerOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setImgViewerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar hidden />
          <TouchableOpacity style={{ position: 'absolute', top: 52, right: 20, zIndex: 10 }} onPress={() => setImgViewerOpen(false)}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: imgViewerIdx * W, y: 0 }}>
            {imgViewerList.map((url, i) => (
              <View key={i} style={{ width: W, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: url }} style={{ width: W, height: W * 1.3 }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const C = StyleSheet.create({
  root:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  headerBack: { padding: 6 },
  channelIconBox: { width: 32, height: 32 },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  headerSub:   { fontSize: 11, marginTop: 1 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },

  dateSepRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 16 },
  dateSepLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateSepPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginHorizontal: 10 },
  dateSepText: { fontSize: 11, fontWeight: '700' },

  msgRow:      { flexDirection: 'row', alignItems: 'flex-end' },
  msgRowMe:    { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  avatar:            { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarLetter:      { fontWeight: '800', fontSize: 13 },
  senderName: { fontSize: 12, fontWeight: '700', marginLeft: 2, marginBottom: 3 },

  bubble:   { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, maxWidth: '100%' },
  msgText:  { fontSize: 15, lineHeight: 22 },
  msgMeta:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 5, gap: 3 },
  msgTime:  { fontSize: 10 },

  replyBox:  { borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 3 },
  replyName: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  replyText: { fontSize: 11 },

  // Audio bubble
  audioBubble:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minWidth: 200 },
  audioIconBox:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  audioName:       { fontSize: 13, fontWeight: '600' },
  audioMeta:       { fontSize: 11, marginTop: 2 },
  recordingBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  recordingDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF4444' },
  recordingTime:   { fontSize: 16, fontWeight: '600', minWidth: 44 },
  recordCancelBtn: { padding: 8 },
  recordSendBtn:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // File bubble
  fileBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  fileIconBox: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileExt:  { fontSize: 11, fontWeight: '900' },
  fileName: { fontSize: 13, fontWeight: '600' },
  fileMeta: { fontSize: 11, marginTop: 2 },

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

  announceBubble: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8 },
  announceTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  announceIconBox: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  announceLabel:   { fontSize: 13, fontWeight: '800' },
  announceMeta:    { fontSize: 11, marginTop: 1 },
  announceText:    { fontSize: 15, lineHeight: 22 },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 19 },

  readonlyBar:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  readonlyText: { flex: 1, fontSize: 12, lineHeight: 17 },

  replyBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3 },
  replyBannerName: { fontSize: 12, fontWeight: '700', marginBottom: 1 },
  editBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 2 },

  inputBar:    { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputRow:    { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 12 },
  inputIconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  input:       { flex: 1, paddingVertical: 8, fontSize: 15, maxHeight: 120 },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },

  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  emojiRow:  { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  emojiBtn:  { padding: 4 },
  menuPreview:    { paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  menuItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  menuItemIcon:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menuItemText:   { fontSize: 15, fontWeight: '500' },

  attachSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  attachTitle: { fontSize: 16, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  attachGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 8 },
  attachItem:  { alignItems: 'center', gap: 8, width: 72 },
  attachIconBox: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  attachLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});

const MP = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12 },
  closeBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:      { color: '#fff', fontSize: 15, fontWeight: '700' },
  bottomBar:  { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingBottom: 28, paddingTop: 10, backgroundColor: 'rgba(0,0,0,0.6)', gap: 10 },
  captionRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  captionInput: { flex: 1, color: '#fff', fontSize: 15, maxHeight: 100, paddingVertical: 0 },
  sendBtn:    { width: 48, height: 48, borderRadius: 24, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center' },
});
