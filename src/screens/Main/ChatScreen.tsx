/**
 * ChatScreen — fenêtre de conversation entre deux utilisateurs
 * Supporte : texte, vocal, image, vidéo, fichiers, appels
 */
import React, {
  useState, useCallback, useEffect, useRef,
} from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, Keyboard, Image, Modal, Alert,
  Dimensions, Linking, PermissionsAndroid, ImageBackground,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import Geolocation from '@react-native-community/geolocation';
import Slider from '@react-native-community/slider';
import { useTheme } from '../../hooks/useTheme';
import { Spacing } from '../../theme';
import { messageService } from '../../services/messageService';
import { authService } from '../../services/authService';
import { uploadAudioFile, uploadMessageImage, uploadMessageVideo, uploadFileFromUri } from '../../services/uploadService';
import { useWs } from '../../context/WebSocketContext';
import type { Message, MessageType } from '../../services/messageService';
import type { WsPayload } from '../../context/WebSocketContext';
import type { ConversationSummary } from '../../services/messageService';

interface RouteParams {
  partnerId:   string;
  partnerName: string;
  avatarUrl?:  string;
  lastSeen?:   string;
  isOnline?:   boolean;
}

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLastSeen(iso?: string | null): string {
  if (!iso) return 'Hors ligne';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'Il y a un instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1)  return 'Hier';
  return `Le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AudioRecorderPlayerModule = require('react-native-audio-recorder-player');
const AudioRecorderPlayerClass = AudioRecorderPlayerModule.default || AudioRecorderPlayerModule;
const audioRecorder = new AudioRecorderPlayerClass();
const { width: SCREEN_W } = Dimensions.get('window');

export const ChatScreen: React.FC = () => {
  const insets            = useSafeAreaInsets();
  const STATUS_H          = insets.top;
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const nav               = useNavigation<any>();
  const route             = useRoute();
  const { partnerId, partnerName, lastSeen: initialLastSeen, isOnline: initialIsOnline } = route.params as RouteParams;

  const [messages,  setMessages]  = useState<Message[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [sending,   setSending]   = useState(false);
  const [text,      setText]      = useState('');
  const [myId,      setMyId]      = useState<string | null>(null);
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(true);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime,  setRecordTime]  = useState('0:00');

  // Indicateurs temps réel du partenaire
  const [partnerTyping,    setPartnerTyping]    = useState(false);
  const [partnerRecording, setPartnerRecording] = useState(false);
  const partnerTypingTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerRecordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio playback
  const [playingId,    setPlayingId]    = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [playDuration, setPlayDuration] = useState(0);

  // Attachment modal
  const [showAttach,  setShowAttach]  = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [locating,    setLocating]    = useState(false);

  // Preview avant envoi image (style WhatsApp)
  const [imgPreviewUri,    setImgPreviewUri]    = useState<string | null>(null);
  const [imgPreviewMeta,   setImgPreviewMeta]   = useState<{ fileName?: string; type?: string } | null>(null);
  const [imgCaption,       setImgCaption]       = useState('');
  const [imgPreviewOpen,   setImgPreviewOpen]   = useState(false);
  const [imgUploading,     setImgUploading]     = useState(false);
  const captionRef = useRef<TextInput>(null);

  // Preview avant envoi fichier
  type FilePending = { uri: string; name: string; size?: number; mimeType?: string };
  const [filePreview,      setFilePreview]      = useState<FilePending | null>(null);
  const [fileCaption,      setFileCaption]      = useState('');
  const [filePreviewOpen,  setFilePreviewOpen]  = useState(false);
  const [fileUploading,    setFileUploading]    = useState(false);
  const fileCaptionRef = useRef<TextInput>(null);

  // Edit / Delete / React
  const [editingMsg,    setEditingMsg]    = useState<Message | null>(null);
  const [selectedMsg,   setSelectedMsg]   = useState<Message | null>(null);
  const [showActions,   setShowActions]   = useState(false);
  const [reactions,     setReactions]     = useState<Record<string, string>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  // Partner presence
  const [partnerOnline,   setPartnerOnline]   = useState(initialIsOnline ?? false);
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(initialLastSeen ?? null);
  const [isBlocked,       setIsBlocked]       = useState(false);

  const [replyingTo,        setReplyingTo]        = useState<Message | null>(null);
  const [pinnedMessages,    setPinnedMessages]    = useState<Message[]>([]);
  const [showPinned,        setShowPinned]        = useState(false);
  const [showSearch,        setShowSearch]        = useState(false);
  const [searchQuery,       setSearchQuery]       = useState('');
  const [searchResults,     setSearchResults]     = useState<Message[]>([]);
  const [searchLoading,     setSearchLoading]     = useState(false);
  const [forwardingMsg,     setForwardingMsg]     = useState<Message | null>(null);
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  const [convList,          setConvList]          = useState<ConversationSummary[]>([]);

  const listRef = useRef<FlatList>(null);
  const myIdRef = useRef<string | null>(null);

  // WebSocket (global context)
  const { sendMessage: sendWsMessage, isConnected, addListener, removeListener, setActiveChat } = useWs();

  // Mark this chat as active so unread counter skips messages from this partner
  useEffect(() => {
    setActiveChat(partnerId);
    return () => { setActiveChat(null); };
  }, [partnerId, setActiveChat]);

  useEffect(() => {
    const handler = (payload: WsPayload) => {
      if (payload.type === 'message') {
        if (
          (payload.sender_id === partnerId && payload.receiver_id === myIdRef.current) ||
          (payload.sender_id === myIdRef.current && payload.receiver_id === partnerId)
        ) {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.id)) return prev;
            return [payload as unknown as Message, ...prev];
          });
          // Auto-mark as read if the message is from the partner
          if (payload.sender_id === partnerId) {
            messageService.markRead(partnerId).catch(() => {});
          }
        }
      } else if (payload.type === 'read' && payload.partner_id === partnerId) {
        setMessages(prev => prev.map(m => m.sender_id === myIdRef.current ? { ...m, read: true } : m));
      } else if (payload.type === 'message_edited') {
        setMessages(prev => prev.map(m =>
          m.id === payload.message_id
            ? { ...m, content: payload.content, edited_at: payload.edited_at }
            : m,
        ));
      } else if (payload.type === 'message_deleted') {
        setMessages(prev => prev.map(m =>
          m.id === payload.message_id
            ? { ...m, deleted: true, content: '', attachment_url: undefined, attachment_meta: undefined }
            : m,
        ));
      } else if (payload.type === 'typing' && payload.sender_id === partnerId) {
        if (payload.is_typing) {
          setPartnerTyping(true);
          if (partnerTypingTimer.current) clearTimeout(partnerTypingTimer.current);
          partnerTypingTimer.current = setTimeout(() => setPartnerTyping(false), 5000);
        } else {
          if (partnerTypingTimer.current) clearTimeout(partnerTypingTimer.current);
          setPartnerTyping(false);
        }
      } else if (payload.type === 'recording' && payload.sender_id === partnerId) {
        if (payload.is_recording) {
          setPartnerRecording(true);
          if (partnerRecordingTimer.current) clearTimeout(partnerRecordingTimer.current);
          partnerRecordingTimer.current = setTimeout(() => setPartnerRecording(false), 30000);
        } else {
          if (partnerRecordingTimer.current) clearTimeout(partnerRecordingTimer.current);
          setPartnerRecording(false);
        }
      } else if (payload.type === 'presence' && payload.user_id === partnerId) {
        setPartnerOnline(payload.is_online === true);
        setPartnerLastSeen(payload.last_seen_at);
      } else if (payload.type === 'error' && payload.detail === 'blocked') {
        setIsBlocked(true);
      } else if (payload.type === 'message_reaction') {
        const { message_id, emoji } = payload as any;
        setReactions(prev => {
          if (!emoji) {
            const next = { ...prev };
            delete next[message_id];
            return next;
          }
          return { ...prev, [message_id]: emoji };
        });
      } else if (payload.type === 'message_pinned') {
        setMessages(prev => {
          const pinned = prev.find(m => m.id === payload.message_id);
          if (pinned) setPinnedMessages(p => [{ ...pinned, pinned: true }, ...p.filter(x => x.id !== pinned.id)]);
          return prev.map(m => m.id === payload.message_id ? { ...m, pinned: true } : m);
        });
      } else if (payload.type === 'message_unpinned') {
        setMessages(prev => prev.map(m => m.id === payload.message_id ? { ...m, pinned: false } : m));
        setPinnedMessages(prev => prev.filter(m => m.id !== payload.message_id));
      }
    };
    addListener(handler);
    return () => { removeListener(handler); };
  }, [partnerId, partnerName, nav, addListener, removeListener]);

  // Subscribe to partner presence when connected
  useEffect(() => {
    if (isConnected && partnerId) {
      sendWsMessage({ type: 'subscribe_presence', user_id: partnerId });
    }
    return () => {
      if (isConnected && partnerId) {
        sendWsMessage({ type: 'unsubscribe_presence', user_id: partnerId });
      }
    };
  }, [isConnected, partnerId, sendWsMessage]);

  useEffect(() => {
    authService.getMe().then(u => {
      const id = String(u.id);
      setMyId(id);
      myIdRef.current = id;
    }).catch(() => {});
  }, []);

  const loadMessages = useCallback(async (p = 1) => {
    try {
      const data = await messageService.getMessages(partnerId, p, 30);
      // Initialiser/mettre à jour les réactions depuis les messages chargés
      const newReactions: Record<string, string> = {};
      data.forEach((m: any) => {
        if (m.reaction) newReactions[m.id] = m.reaction;
      });
      if (p === 1) {
        setMessages(data);
        setReactions(newReactions);
        setHasMore(data.length === 30);
        messageService.getPinnedMessages(partnerId).then(pins => setPinnedMessages(pins)).catch(() => {});
      } else {
        setMessages(prev => [...prev, ...data]);
        setReactions(prev => ({ ...prev, ...newReactions }));
        setHasMore(data.length === 30);
      }
    } catch (e: any) {
      // 403 = bloqué par cet utilisateur (ou on l'a bloqué)
      if (e?.response?.status === 403 || e?.status === 403) {
        setIsBlocked(true);
      }
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    loadMessages(1);
    messageService.markRead(partnerId).catch(() => {});
  }, []);

  const loadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    loadMessages(next);
  };

  // ── Send text message ─────────────────────────────────────────────────────
  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setText('');
    Keyboard.dismiss();
    setSending(true);

    const tempId = `pending-${Date.now()}`;
    const optimistic = {
      id: tempId,
      sender_id: myId ?? '',
      receiver_id: partnerId,
      content,
      message_type: 'text' as const,
      created_at: new Date().toISOString(),
      read: false,
      pending: true,
    };
    setMessages(prev => [optimistic, ...prev]);

    try {
      const msg = await messageService.sendMessage(partnerId, content, 'text', undefined, undefined, replyingTo?.id);
      setReplyingTo(null);
      setMessages(prev => prev.map(m => m.id === tempId ? msg : m));
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      if (e?.response?.status === 403 || e?.status === 403) {
        setIsBlocked(true);
      } else {
        setText(content);
      }
    } finally {
      setSending(false);
    }
  };

  const sendSticker = async (emoji: string) => {
    setShowStickerPicker(false);
    const tempId = `pending-${Date.now()}`;
    const optimistic = {
      id: tempId,
      sender_id: myId ?? '',
      receiver_id: partnerId,
      content: emoji,
      message_type: 'sticker' as const,
      created_at: new Date().toISOString(),
      read: false,
      pending: true,
    };
    setMessages(prev => [optimistic, ...prev]);
    try {
      const msg = await messageService.sendMessage(partnerId, emoji, 'sticker');
      setMessages(prev => prev.map(m => m.id === tempId ? msg : m));
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  };

  // ── Typing indicator ────────────────────────────────────────────────────────
  const handleTextChange = (val: string) => {
    setText(val);
    if (val.trim()) {
      sendWsMessage({ type: 'typing_start', to: partnerId });
      if (typingDebounce.current) clearTimeout(typingDebounce.current);
      typingDebounce.current = setTimeout(() => sendWsMessage({ type: 'typing_stop', to: partnerId }), 3000);
    } else {
      if (typingDebounce.current) clearTimeout(typingDebounce.current);
      sendWsMessage({ type: 'typing_stop', to: partnerId });
    }
  };

  // ── Voice recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        { title: 'Microphone', message: 'L\'app a besoin du micro pour enregistrer un vocal.', buttonPositive: 'OK' },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission', 'Microphone requis pour enregistrer un vocal');
        return;
      }
    }
    try {
      setIsRecording(true);
      setRecordTime('0:00');
      sendWsMessage({ type: 'recording_start', to: partnerId });
      await audioRecorder.startRecorder(undefined, undefined, true);
      audioRecorder.addRecordBackListener((e: any) => {
        setRecordTime(formatDuration(e.currentPosition));
      });
    } catch {
      setIsRecording(false);
    }
  };

  const stopAndSendRecording = async () => {
    try {
      const result = await audioRecorder.stopRecorder();
      audioRecorder.removeRecordBackListener();
      setIsRecording(false);
      sendWsMessage({ type: 'recording_stop', to: partnerId });
      if (!result) return;

      setUploading(true);
      const uploaded = await uploadAudioFile(result, `vocal_${Date.now()}.m4a`, 'audio/mp4');
      const msg = await messageService.sendMessage(
        partnerId, '', 'voice', uploaded.url, { duration: uploaded.duration },
      );
      setMessages(prev => [msg, ...prev]);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer le vocal');
    } finally {
      setUploading(false);
    }
  };

  const cancelRecording = async () => {
    try {
      await audioRecorder.stopRecorder();
      audioRecorder.removeRecordBackListener();
    } catch {}
    setIsRecording(false);
    sendWsMessage({ type: 'recording_stop', to: partnerId });
  };

  // ── Audio playback ────────────────────────────────────────────────────────
  const playAudio = async (msgId: string, url: string) => {
    if (playingId) {
      await audioRecorder.stopPlayer();
      audioRecorder.removePlayBackListener();
      if (playingId === msgId) {
        setPlayingId(null);
        return;
      }
    }
    setPlayingId(msgId);
    setPlayProgress(0);
    try {
      await audioRecorder.startPlayer(url);
      audioRecorder.addPlayBackListener((e: any) => {
        setPlayProgress(e.currentPosition);
        setPlayDuration(e.duration);
        if (e.currentPosition >= e.duration - 100) {
          audioRecorder.stopPlayer();
          audioRecorder.removePlayBackListener();
          setPlayingId(null);
          setPlayProgress(0);
        }
      });
    } catch {
      setPlayingId(null);
    }
  };

  // ── Attachment handlers ───────────────────────────────────────────────────
  const openImagePreview = (uri: string, fileName?: string, type?: string) => {
    setImgPreviewUri(uri);
    setImgPreviewMeta({ fileName, type });
    setImgCaption('');
    setImgPreviewOpen(true);
  };

  const pickImage = async () => {
    setShowAttach(false);
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 as any });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    openImagePreview(asset.uri, asset.fileName, asset.type);
  };

  const takePhoto = async () => {
    setShowAttach(false);
    const result = await launchCamera({ mediaType: 'photo', quality: 0.8 as any });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    openImagePreview(asset.uri, asset.fileName, asset.type);
  };

  const handleSendImagePreview = async () => {
    if (!imgPreviewUri || imgUploading) return;
    setImgUploading(true);
    try {
      const uploaded = await uploadMessageImage(imgPreviewUri, imgPreviewMeta?.fileName);
      const caption = imgCaption.trim();
      const msg = await messageService.sendMessage(
        partnerId, caption, 'image', uploaded.url,
        { width: uploaded.width, height: uploaded.height },
      );
      setMessages(prev => [msg, ...prev]);
    } catch {
      Alert.alert('Erreur', "Impossible d'envoyer l'image");
    } finally {
      setImgUploading(false);
      setImgPreviewOpen(false);
      setImgPreviewUri(null);
      setImgPreviewMeta(null);
      setImgCaption('');
    }
  };

  const pickVideo = async () => {
    setShowAttach(false);
    try {
      const result = await launchImageLibrary({ mediaType: 'video', selectionLimit: 1 });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setUploading(true);
      const uploaded = await uploadMessageVideo(asset.uri, asset.fileName, asset.type);
      const msg = await messageService.sendMessage(
        partnerId, '', 'video', uploaded.url,
        { duration: uploaded.duration, thumbnail_url: uploaded.thumbnail_url, width: uploaded.width, height: uploaded.height },
      );
      setMessages(prev => [msg, ...prev]);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer la vidéo');
    } finally {
      setUploading(false);
    }
  };

  const pickFile = async () => {
    setShowAttach(false);
    try {
      const res = await pick({ type: [types.allFiles] });
      const file = res[0];
      if (!file?.uri) return;
      // Affiche la prévisualisation — l'upload se fait à la confirmation
      setFilePreview({ uri: file.uri, name: file.name ?? `fichier_${Date.now()}`, size: file.size ?? undefined, mimeType: file.type ?? undefined });
      setFileCaption('');
      setFilePreviewOpen(true);
    } catch (e: any) {
      const isCanceled = isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED;
      if (!isCanceled) Alert.alert('Erreur', "Impossible d'ouvrir le fichier");
    }
  };

  const handleSendFilePreview = async () => {
    if (!filePreview || fileUploading) return;
    setFileUploading(true);
    try {
      const uploaded = await uploadFileFromUri(
        filePreview.uri,
        filePreview.name,
        filePreview.mimeType ?? 'application/octet-stream',
      );
      const caption = fileCaption.trim();
      const msg = await messageService.sendMessage(
        partnerId, caption || filePreview.name, 'file', uploaded.url,
        { filename: filePreview.name, size: filePreview.size, mime_type: filePreview.mimeType },
      );
      setMessages(prev => [msg, ...prev]);
      setFilePreviewOpen(false);
      setFilePreview(null);
      setFileCaption('');
    } catch {
      Alert.alert('Erreur', "Impossible d'envoyer le fichier");
    } finally {
      setFileUploading(false);
    }
  };

  const sendLocation = () => {
    setShowAttach(false);
    setLocating(true);
    const doSend = async (pos: any) => {
      setLocating(false);
      const { latitude, longitude } = pos.coords;
      try {
        const msg = await messageService.sendMessage(
          partnerId, '', 'location', undefined,
          { latitude, longitude, address: null },
        );
        setMessages(prev => [msg, ...prev]);
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

  // ── More menu ────────────────────────────────────────────────────────────
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleViewProfile = () => {
    setShowMoreMenu(false);
    nav.navigate('UserProfile', { userId: partnerId });
  };

  const handleBlockUser = () => {
    setShowMoreMenu(false);
    Alert.alert(
      'Bloquer cet utilisateur',
      `Bloquer ${partnerName} ? Vous ne pourrez plus échanger de messages.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer', style: 'destructive', onPress: async () => {
            try {
              const { apiClient } = require('../../api');
              await apiClient.post(`/api/v1/users/${partnerId}/block`);
              setIsBlocked(true);
            } catch {
              Alert.alert('Erreur', 'Impossible de bloquer cet utilisateur.');
            }
          },
        },
      ],
    );
  };

  const handleClearChat = () => {
    setShowMoreMenu(false);
    Alert.alert(
      'Vider la conversation',
      'Supprimer tous les messages affichés ? Cette action est locale uniquement.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Vider', style: 'destructive', onPress: () => setMessages([]) },
      ],
    );
  };

  const loadConvsForForward = async () => {
    try { setConvList(await messageService.getConversations()); } catch {}
  };

  const handleForwardMessage = (msg: Message) => {
    setShowActions(false);
    setSelectedMsg(null);
    setForwardingMsg(msg);
    loadConvsForForward();
    setShowForwardPicker(true);
  };

  const doForward = async (receiverId: string, receiverName: string) => {
    if (!forwardingMsg) return;
    setShowForwardPicker(false);
    try {
      await messageService.forwardMessage(forwardingMsg.id, receiverId);
      Alert.alert('Transféré', `Message transféré à ${receiverName}`);
    } catch {
      Alert.alert('Erreur', 'Impossible de transférer ce message');
    }
    setForwardingMsg(null);
  };

  const handlePinToggle = async (msg: Message) => {
    setShowActions(false);
    setSelectedMsg(null);
    try {
      if (msg.pinned) {
        await messageService.unpinMessage(msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: false } : m));
        setPinnedMessages(prev => prev.filter(m => m.id !== msg.id));
      } else {
        await messageService.pinMessage(msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: true } : m));
        setPinnedMessages(prev => [{ ...msg, pinned: true }, ...prev.filter(m => m.id !== msg.id)]);
      }
    } catch {
      Alert.alert('Erreur', "Impossible de modifier l'épingle");
    }
  };

  const handleDeleteForMe = async () => {
    if (!selectedMsg) return;
    setShowActions(false);
    const msgId = selectedMsg.id;
    setSelectedMsg(null);
    try {
      await messageService.deleteMessageForMe(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch {
      Alert.alert('Erreur', 'Impossible de supprimer ce message');
    }
  };

  const handleSearchInConv = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      setSearchResults(await messageService.searchMessages(partnerId, q));
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // ── Call handlers ─────────────────────────────────────────────────────────
  const startCall = (callType: 'voice' | 'video') => {
    nav.navigate('Call', {
      partnerId,
      partnerName,
      callType,
      isIncoming: false,
    });
  };

  const isMine = (msg: Message) => myId && msg.sender_id === myId;

  // ── Long-press actions ────────────────────────────────────────────────────
  const onLongPressMessage = (msg: Message) => {
    if (msg.deleted) return;
    setSelectedMsg(msg);
    setShowActions(true);
  };

  const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

  const reactToMessage = async (emoji: string) => {
    if (!selectedMsg) return;
    setShowActions(false);
    const msgId = selectedMsg.id;
    setSelectedMsg(null);
    try {
      const res = await messageService.reactToMessage(msgId, emoji);
      setReactions(prev => {
        if (!res.emoji) {
          const next = { ...prev };
          delete next[msgId];
          return next;
        }
        return { ...prev, [msgId]: res.emoji };
      });
    } catch {}
  };

  const copyMessage = () => {
    if (!selectedMsg) return;
    const { Clipboard } = require('react-native');
    Clipboard?.setString?.(selectedMsg.content);
    setShowActions(false);
    setSelectedMsg(null);
  };

  const startEdit = () => {
    if (!selectedMsg) return;
    setShowActions(false);
    setEditingMsg(selectedMsg);
    setText(selectedMsg.content);
    setSelectedMsg(null);
  };

  const cancelEdit = () => {
    setEditingMsg(null);
    setText('');
  };

  const confirmEdit = async () => {
    if (!editingMsg) return;
    const newContent = text.trim();
    if (!newContent || newContent === editingMsg.content) {
      cancelEdit();
      return;
    }
    try {
      await messageService.editMessage(editingMsg.id, newContent);
      setMessages(prev => prev.map(m =>
        m.id === editingMsg.id
          ? { ...m, content: newContent, edited_at: new Date().toISOString() }
          : m,
      ));
    } catch {
      Alert.alert('Erreur', 'Impossible de modifier le message');
    } finally {
      cancelEdit();
    }
  };

  const confirmDelete = () => {
    if (!selectedMsg) return;
    setShowActions(false);
    Alert.alert(
      'Supprimer le message',
      'Ce message sera supprimé pour tous les participants.',
      [
        { text: 'Annuler', style: 'cancel', onPress: () => setSelectedMsg(null) },
        {
          text: 'Supprimer', style: 'destructive', onPress: async () => {
            try {
              await messageService.deleteMessage(selectedMsg.id);
              setMessages(prev => prev.map(m =>
                m.id === selectedMsg.id
                  ? { ...m, deleted: true, content: '', attachment_url: undefined, attachment_meta: undefined }
                  : m,
              ));
            } catch {
              Alert.alert('Erreur', 'Impossible de supprimer le message');
            } finally {
              setSelectedMsg(null);
            }
          },
        },
      ],
    );
  };

  // ── Render message bubble content based on type ───────────────────────────
  const renderBubbleContent = (item: Message, mine: boolean) => {
    const textColor = mine ? '#fff' : colors.textPrimary;
    const subtextColor = mine ? 'rgba(255,255,255,0.65)' : colors.textTertiary;
    const msgType = item.message_type || 'text';

    switch (msgType) {
      case 'sticker':
        return (
          <Text style={styles.stickerText}>{item.content}</Text>
        );
      case 'voice': {
        const duration = item.attachment_meta?.duration ?? 0;
        const isPlaying = playingId === item.id;
        return (
          <View style={styles.voiceBubble}>
            <TouchableOpacity
              onPress={() => item.attachment_url && playAudio(item.id, item.attachment_url)}
              style={[styles.playBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.2)' : colors.primary + '20' }]}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={mine ? '#fff' : colors.primary} />
            </TouchableOpacity>
            <View style={styles.voiceInfo}>
              {isPlaying ? (
                <Slider
                  style={{ flex: 1, height: 20 }}
                  minimumValue={0}
                  maximumValue={playDuration || 1}
                  value={playProgress}
                  minimumTrackTintColor={mine ? '#fff' : colors.primary}
                  maximumTrackTintColor={mine ? 'rgba(255,255,255,0.3)' : colors.divider}
                  thumbTintColor={mine ? '#fff' : colors.primary}
                  disabled
                />
              ) : (
                <View style={[styles.waveform, { backgroundColor: mine ? 'rgba(255,255,255,0.3)' : colors.divider }]}>
                  {Array.from({ length: 20 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveBar,
                        {
                          height: 4 + Math.random() * 14,
                          backgroundColor: mine ? 'rgba(255,255,255,0.7)' : colors.primary + '80',
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
              <Text style={[styles.voiceDuration, { color: subtextColor }]}>
                {isPlaying ? formatDuration(playProgress) : `${Math.ceil(duration)}s`}
              </Text>
            </View>
          </View>
        );
      }

      case 'image':
        return (
          <View>
            {item.attachment_url && (
              <Image
                source={{ uri: item.attachment_url }}
                style={styles.imageBubble}
                resizeMode="cover"
              />
            )}
            {item.content ? <Text style={[styles.msgText, { color: textColor }]}>{item.content}</Text> : null}
          </View>
        );

      case 'video':
        return (
          <TouchableOpacity onPress={() => item.attachment_url && Linking.openURL(item.attachment_url)}>
            {item.attachment_meta?.thumbnail_url ? (
              <View>
                <Image
                  source={{ uri: item.attachment_meta.thumbnail_url }}
                  style={styles.videoBubble}
                  resizeMode="cover"
                />
                <View style={styles.videoPlayOverlay}>
                  <Icon name="play-circle" size={44} color="rgba(255,255,255,0.9)" />
                </View>
              </View>
            ) : (
              <View style={[styles.videoBubble, { backgroundColor: mine ? 'rgba(255,255,255,0.1)' : colors.backgroundSecondary, justifyContent: 'center', alignItems: 'center' }]}>
                <Icon name="video" size={36} color={mine ? '#fff' : colors.primary} />
              </View>
            )}
            {item.attachment_meta?.duration != null && (
              <Text style={[styles.videoDurationLabel, { color: subtextColor }]}>
                {formatDuration((item.attachment_meta.duration ?? 0) * 1000)}
              </Text>
            )}
          </TouchableOpacity>
        );

      case 'file':
        return (
          <TouchableOpacity
            style={styles.fileBubble}
            onPress={() => item.attachment_url && Linking.openURL(item.attachment_url)}
          >
            <View style={[styles.fileIcon, { backgroundColor: mine ? 'rgba(255,255,255,0.2)' : colors.primary + '20' }]}>
              <Icon name="file" size={22} color={mine ? '#fff' : colors.primary} />
            </View>
            <View style={styles.fileInfo}>
              <Text style={[styles.fileName, { color: textColor }]} numberOfLines={1}>
                {item.attachment_meta?.filename || item.content || 'Fichier'}
              </Text>
              {item.attachment_meta?.size ? (
                <Text style={[styles.fileSize, { color: subtextColor }]}>
                  {formatFileSize(item.attachment_meta.size)}
                </Text>
              ) : null}
            </View>
            <Icon name="download" size={18} color={subtextColor} />
          </TouchableOpacity>
        );

      case 'location': {
        const lat = item.attachment_meta?.latitude;
        const lng = item.attachment_meta?.longitude;
        const addr = item.attachment_meta?.address;
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        const mapImg = lat != null
          ? `https://static-maps.yandex.ru/1.x/?lang=fr_FR&ll=${lng},${lat}&z=15&l=map&size=400,200&pt=${lng},${lat},pm2rdm`
          : null;
        return (
          <TouchableOpacity
            style={[styles.locationCard, mine ? styles.locationCardMe : styles.locationCardOther]}
            onPress={() => Linking.openURL(mapsUrl)}
            activeOpacity={0.85}
          >
            <View style={styles.locationMapBox}>
              {mapImg ? (
                <Image source={{ uri: mapImg }} style={styles.locationMapImg} resizeMode="cover" />
              ) : (
                <View style={[styles.locationMapImg, { backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="map" size={40} color="#4CAF50" />
                </View>
              )}
              <View style={styles.locationPinWrap}>
                <View style={styles.locationPinCircle}>
                  <Icon name="map-pin" size={16} color="#fff" />
                </View>
                <View style={styles.locationPinTail} />
              </View>
            </View>
            <View style={[styles.locationFooter, mine ? styles.locationFooterMe : styles.locationFooterOther]}>
              <Icon name="map-pin" size={13} color={mine ? 'rgba(255,255,255,0.8)' : '#EF4444'} />
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={[styles.locationLabel, { color: mine ? '#fff' : colors.textPrimary }]}>Ma position</Text>
                <Text style={[styles.locationCoords, { color: mine ? 'rgba(255,255,255,0.65)' : colors.textTertiary }]} numberOfLines={1}>
                  {addr ?? (lat != null ? `${lat.toFixed(4)}, ${lng?.toFixed(4)}` : '…')}
                </Text>
              </View>
              <Icon name="chevron-right" size={14} color={mine ? 'rgba(255,255,255,0.5)' : colors.textTertiary} />
            </View>
          </TouchableOpacity>
        );
      }

      default: // text
        return <Text style={[styles.msgText, { color: textColor }]}>{item.content}</Text>;
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Fond décoratif de la zone messages */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={isDark
            ? [colors.background, colors.primary + '10', colors.background]
            : [colors.background, colors.primary + '08', colors.gradientEnd + '06']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Cercle décoratif haut-droite */}
        <View style={{
          position: 'absolute', top: -60, right: -60,
          width: 220, height: 220, borderRadius: 110,
          backgroundColor: colors.primary + (isDark ? '0D' : '08'),
        }} />
        {/* Cercle décoratif bas-gauche */}
        <View style={{
          position: 'absolute', bottom: 60, left: -80,
          width: 260, height: 260, borderRadius: 130,
          backgroundColor: colors.gradientEnd + (isDark ? '0A' : '07'),
        }} />
      </View>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: STATUS_H + 8, borderBottomColor: colors.divider }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
            {partnerName}
          </Text>
          <Text style={[styles.headerSub, { color: partnerOnline ? '#36D9A0' : colors.textTertiary }]}>
            {partnerOnline ? 'En ligne' : formatLastSeen(partnerLastSeen)}
          </Text>
        </View>

        <TouchableOpacity style={styles.callBtn} onPress={() => startCall('voice')}>
          <Icon name="phone" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.callBtn} onPress={() => startCall('video')}>
          <Icon name="video" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.moreBtn} onPress={() => setShowMoreMenu(true)}>
          <Icon name="more-vertical" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Bandeau messages épinglés */}
      {pinnedMessages.length > 0 && !showSearch && (
        <TouchableOpacity
          style={[styles.pinnedBanner, { backgroundColor: colors.primary + '12', borderBottomColor: colors.divider }]}
          onPress={() => setShowPinned(true)}
          activeOpacity={0.8}
        >
          <Icon name="bookmark" size={13} color={colors.primary} />
          <Text style={[styles.pinnedBannerText, { color: colors.primary }]} numberOfLines={1}>
            {pinnedMessages.length} message{pinnedMessages.length > 1 ? 's' : ''} épinglé{pinnedMessages.length > 1 ? 's' : ''}
          </Text>
          <Text style={[styles.pinnedBannerSub, { color: colors.textTertiary }]} numberOfLines={1}>
            {(pinnedMessages[0]?.content || '📎 Pièce jointe').slice(0, 40)}
          </Text>
          <Icon name="chevron-right" size={13} color={colors.textTertiary} />
        </TouchableOpacity>
      )}

      {/* Barre de recherche dans la conversation */}
      {showSearch && (
        <View style={[styles.chatSearchBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
          <Icon name="search" size={15} color={colors.textTertiary} />
          <TextInput
            style={[styles.chatSearchInput, { color: colors.textPrimary }]}
            placeholder="Rechercher dans la conversation…"
            placeholderTextColor={colors.textDisabled}
            value={searchQuery}
            onChangeText={handleSearchInConv}
            autoFocus
          />
          {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
            <Icon name="x" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Upload indicator */}
      {uploading && (
        <View style={[styles.uploadBar, { backgroundColor: colors.primary + '15' }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: 8, fontSize: 13 }}>Envoi en cours…</Text>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={showSearch && searchQuery ? searchResults : messages}
          keyExtractor={m => m.id}
          inverted
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="message-circle" size={44} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, marginTop: 10 }}>Démarrez la conversation</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const mine = !!isMine(item);

            if (item.deleted) {
              return (
                <Animated.View
                  entering={FadeInUp.delay(index < 10 ? index * 20 : 0).springify()}
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                >
                  <View style={[styles.bubbleInner, { backgroundColor: colors.surface, opacity: 0.6 }]}>
                    <Text style={[styles.msgText, { color: colors.textTertiary, fontStyle: 'italic' }]}>
                      Message supprimé
                    </Text>
                    <Text style={[styles.msgTime, { color: colors.textTertiary }]}>{formatMsgTime(item.created_at)}</Text>
                  </View>
                </Animated.View>
              );
            }

            return (
              <Animated.View
                entering={FadeInUp.delay(index < 10 ? index * 20 : 0).springify()}
                style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onLongPress={() => onLongPressMessage(item)}
                  delayLongPress={400}
                >
                  {mine ? (
                    <LinearGradient
                      colors={[colors.gradientStart, colors.gradientEnd]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={styles.bubbleInner}
                    >
                      {item.forwarded_from_id && (
                        <View style={styles.forwardedLabel}>
                          <Icon name="corner-up-right" size={11} color="rgba(255,255,255,0.6)" />
                          <Text style={[styles.forwardedText, { color: 'rgba(255,255,255,0.6)' }]}>Transféré</Text>
                        </View>
                      )}
                      {item.reply_to && (
                        <View style={[styles.replyPreview, { backgroundColor: 'rgba(255,255,255,0.15)', borderLeftColor: 'rgba(255,255,255,0.6)' }]}>
                          <Text style={[styles.replyName, { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>
                            {item.reply_to.sender_id === myId ? 'Vous' : partnerName}
                          </Text>
                          <Text style={[styles.replyText, { color: 'rgba(255,255,255,0.65)' }]} numberOfLines={1}>
                            {item.reply_to.message_type !== 'text' ? `📎 ${item.reply_to.message_type}` : item.reply_to.content}
                          </Text>
                        </View>
                      )}
                      {renderBubbleContent(item, true)}
                      <View style={styles.bubbleFooter}>
                        {item.edited_at && <Text style={[styles.editedLabel, { color: 'rgba(255,255,255,0.55)' }]}>modifié</Text>}
                        <Text style={[styles.msgTime, { color: 'rgba(255,255,255,0.65)' }]}>{formatMsgTime(item.created_at)}</Text>
                        <View style={{ marginLeft: 4 }}>
                          {item.pending
                            ? <Icon name="clock" size={11} color="rgba(255,255,255,0.5)" />
                            : item.read
                              ? <Icon name="check-circle" size={11} color="rgba(255,255,255,0.9)" />
                              : <Icon name="check" size={11} color="rgba(255,255,255,0.65)" />
                          }
                        </View>
                      </View>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.bubbleInner, { backgroundColor: colors.surface }]}>
                      {item.forwarded_from_id && (
                        <View style={styles.forwardedLabel}>
                          <Icon name="corner-up-right" size={11} color={colors.textTertiary} />
                          <Text style={[styles.forwardedText, { color: colors.textTertiary }]}>Transféré</Text>
                        </View>
                      )}
                      {item.reply_to && (
                        <View style={[styles.replyPreview, { backgroundColor: colors.backgroundSecondary, borderLeftColor: colors.primary }]}>
                          <Text style={[styles.replyName, { color: colors.primary }]} numberOfLines={1}>
                            {item.reply_to.sender_id === myId ? 'Vous' : partnerName}
                          </Text>
                          <Text style={[styles.replyText, { color: colors.textTertiary }]} numberOfLines={1}>
                            {item.reply_to.message_type !== 'text' ? `📎 ${item.reply_to.message_type}` : item.reply_to.content}
                          </Text>
                        </View>
                      )}
                      {renderBubbleContent(item, false)}
                      <View style={styles.bubbleFooter}>
                        {item.edited_at && <Text style={[styles.editedLabel, { color: colors.textTertiary }]}>modifié</Text>}
                        <Text style={[styles.msgTime, { color: colors.textTertiary }]}>{formatMsgTime(item.created_at)}</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
                {reactions[item.id] && (
                  <View style={[styles.reactionBadge, mine ? styles.reactionMine : styles.reactionTheirs]}>
                    <Text style={styles.reactionEmoji}>{reactions[item.id]}</Text>
                  </View>
                )}
              </Animated.View>
            );
          }}
        />
      )}

      {/* Indicateur temps réel du partenaire */}
      {(partnerTyping || partnerRecording) && !isRecording && (
        <View style={[styles.partnerStatusBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          <View style={styles.typingDotsRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.typingDot, { backgroundColor: colors.textTertiary }]} />
            ))}
          </View>
          <Text style={[styles.partnerStatusText, { color: colors.textTertiary }]}>
            {partnerRecording ? `${partnerName} enregistre un vocal…` : `${partnerName} est en train d'écrire…`}
          </Text>
        </View>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <View style={[styles.recordingBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          <View style={styles.recordingDot} />
          <Text style={[styles.recordingTime, { color: colors.textPrimary }]}>{recordTime}</Text>
          <Text style={{ color: colors.textTertiary, flex: 1 }}>Enregistrement…</Text>
          <TouchableOpacity onPress={cancelRecording} style={styles.recordCancelBtn}>
            <Icon name="x" size={20} color={colors.error ?? '#FF4444'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={stopAndSendRecording} style={[styles.recordSendBtn, { backgroundColor: colors.primary }]}>
            <Icon name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Edit mode banner */}
      {editingMsg && (
        <View style={[styles.editBanner, { backgroundColor: colors.primary + '15', borderTopColor: colors.divider }]}>
          <Icon name="edit-2" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, flex: 1, marginLeft: 8, fontSize: 13 }} numberOfLines={1}>
            Modification : {editingMsg.content}
          </Text>
          <TouchableOpacity onPress={cancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="x" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Bannière blocage */}
      {isBlocked && (
        <View style={[styles.blockedBanner, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          <Icon name="slash" size={16} color={colors.textTertiary} />
          <Text style={[styles.blockedText, { color: colors.textTertiary }]}>
            Vous ne pouvez plus envoyer de messages dans cette conversation.
          </Text>
        </View>
      )}

      {/* Input bar */}
      {!isRecording && !isBlocked && (
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          {/* Row principale */}
          <View style={styles.inputRow}>
            {!editingMsg && (
              <TouchableOpacity style={styles.attachBtn} onPress={() => setShowAttach(true)}>
                <LinearGradient
                  colors={[colors.gradientStart + '33', colors.gradientEnd + '33']}
                  style={styles.attachBtnInner}
                >
                  <Icon name="plus" size={20} color={colors.primary} />
                </LinearGradient>
              </TouchableOpacity>
            )}

            <View style={[styles.inputWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <TextInput
                value={text}
                onChangeText={handleTextChange}
                placeholder="Écrire un message…"
                placeholderTextColor={colors.textDisabled}
                style={[styles.input, { color: colors.textPrimary }]}
                multiline
                maxLength={2000}
                returnKeyType="default"
                onFocus={() => { setShowEmojiPicker(false); setShowStickerPicker(false); }}
              />
              <TouchableOpacity onPress={() => { setShowEmojiPicker(false); setShowStickerPicker(p => !p); }} style={styles.emojiBtn}>
                <Text style={styles.emojiBtnText}>🎭</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowStickerPicker(false); setShowEmojiPicker(p => !p); }} style={styles.emojiBtn}>
                <Text style={styles.emojiBtnText}>😊</Text>
              </TouchableOpacity>
            </View>

            {text.trim().length > 0 ? (
              <TouchableOpacity
                style={[styles.sendBtn, { opacity: sending ? 0.6 : 1 }]}
                onPress={editingMsg ? confirmEdit : send}
                disabled={sending}
              >
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.sendBtnInner}
                >
                  {sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Icon name={editingMsg ? 'check' : 'send'} size={17} color="#fff" />
                  }
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.sendBtn} onPress={startRecording}>
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.sendBtnInner}
                >
                  <Icon name="mic" size={19} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Message action sheet */}
      <Modal visible={showActions} transparent animationType="fade" onRequestClose={() => { setShowActions(false); setSelectedMsg(null); }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowActions(false); setSelectedMsg(null); }}>
          <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.attachHandle, { backgroundColor: colors.divider }]} />

            {/* Reactions rapides */}
            <View style={styles.reactionsRow}>
              {QUICK_REACTIONS.map(emoji => (
                <TouchableOpacity key={emoji} style={styles.reactionQuickBtn} onPress={() => reactToMessage(emoji)}>
                  <Text style={styles.reactionQuickText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.attachHandle, { backgroundColor: colors.divider, marginBottom: 8 }]} />

            {/* Copier */}
            {selectedMsg && selectedMsg.message_type === 'text' && (
              <TouchableOpacity style={styles.actionItem} onPress={copyMessage}>
                <Icon name="copy" size={20} color={colors.textPrimary} />
                <Text style={[styles.actionText, { color: colors.textPrimary }]}>Copier</Text>
              </TouchableOpacity>
            )}

            {/* Répondre */}
            {selectedMsg && !selectedMsg.deleted && (
              <TouchableOpacity style={styles.actionItem} onPress={() => { setReplyingTo(selectedMsg); setShowActions(false); setSelectedMsg(null); }}>
                <Icon name="corner-up-left" size={20} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.textPrimary }]}>Répondre</Text>
              </TouchableOpacity>
            )}

            {/* Transférer */}
            {selectedMsg && !selectedMsg.deleted && (
              <TouchableOpacity style={styles.actionItem} onPress={() => handleForwardMessage(selectedMsg)}>
                <Icon name="corner-up-right" size={20} color={colors.textPrimary} />
                <Text style={[styles.actionText, { color: colors.textPrimary }]}>Transférer</Text>
              </TouchableOpacity>
            )}

            {/* Épingler */}
            {selectedMsg && !selectedMsg.deleted && (
              <TouchableOpacity style={styles.actionItem} onPress={() => handlePinToggle(selectedMsg)}>
                <Icon name="bookmark" size={20} color={selectedMsg?.pinned ? '#F59E0B' : colors.textPrimary} />
                <Text style={[styles.actionText, { color: colors.textPrimary }]}>{selectedMsg?.pinned ? 'Désépingler' : 'Épingler'}</Text>
              </TouchableOpacity>
            )}

            {/* Supprimer pour moi */}
            {selectedMsg && (
              <TouchableOpacity style={styles.actionItem} onPress={handleDeleteForMe}>
                <Icon name="eye-off" size={20} color={colors.textTertiary} />
                <Text style={[styles.actionText, { color: colors.textTertiary }]}>Supprimer pour moi</Text>
              </TouchableOpacity>
            )}

            {/* Modifier — seulement ses propres messages texte */}
            {selectedMsg && isMine(selectedMsg) && selectedMsg.message_type === 'text' && (
              <TouchableOpacity style={styles.actionItem} onPress={startEdit}>
                <Icon name="edit-2" size={20} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.textPrimary }]}>Modifier</Text>
              </TouchableOpacity>
            )}

            {/* Supprimer — seulement ses propres messages */}
            {selectedMsg && isMine(selectedMsg) && (
              <TouchableOpacity style={styles.actionItem} onPress={confirmDelete}>
                <Icon name="trash-2" size={20} color={colors.error ?? '#FF4444'} />
                <Text style={[styles.actionText, { color: colors.error ?? '#FF4444' }]}>Supprimer</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sticker picker panel */}
      {showStickerPicker && (
        <View style={[styles.emojiPanel, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          {[
            '❤️','🔥','😂','😍','🥰','😎','🤔','😢','😡','👍',
            '🎉','💯','🙌','💪','🫶','🥳','😇','🤩','😏','😜',
            '👏','🫠','🤯','🥹','😴','🤣','😅','🫡','💀','✨',
            '🐶','🐱','🦊','🐻','🐼','🐨','🦁','🐯','🐸','🐙',
            '🍕','🍔','🍦','🎂','🍩','🍭','🍿','☕','🧃','🥤',
          ].map(emoji => (
            <TouchableOpacity key={emoji} style={styles.emojiItem} onPress={() => sendSticker(emoji)}>
              <Text style={{ fontSize: 36 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Emoji picker panel */}
      {showEmojiPicker && (
        <View style={[styles.emojiPanel, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          {[
            '😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👎',
            '❤️','🔥','🎉','💯','✅','😮','🙏','😴','🤣','😅',
            '💪','🫶','🥹','😏','🤩','😇','🤗','😬','🥳','😜',
          ].map(emoji => (
            <TouchableOpacity key={emoji} style={styles.emojiItem} onPress={() => { setText(p => p + emoji); }}>
              <Text style={styles.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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
          <View style={CP.header}>
            <TouchableOpacity
              onPress={() => { if (!fileUploading) { setFilePreviewOpen(false); setFilePreview(null); setFileCaption(''); } }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={CP.headerClose}
            >
              <Icon name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={CP.headerTitle} numberOfLines={1}>{filePreview?.name ?? 'Fichier'}</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Aperçu fichier centré */}
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

          {/* Barre commentaire + envoyer */}
          <View style={CP.bottomBar}>
            <View style={CP.captionRow}>
              <Icon name="edit-3" size={16} color="rgba(255,255,255,0.5)" />
              <TextInput
                ref={fileCaptionRef}
                style={CP.captionInput}
                placeholder="Ajouter un commentaire…"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={fileCaption}
                onChangeText={setFileCaption}
                multiline
                maxLength={500}
              />
            </View>
            <TouchableOpacity
              style={[CP.sendBtn, fileUploading && { opacity: 0.6 }]}
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

      {/* ── Preview avant envoi image (style WhatsApp) ── */}
      <Modal
        visible={imgPreviewOpen}
        transparent={false}
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => { if (!imgUploading) { setImgPreviewOpen(false); setImgPreviewUri(null); setImgCaption(''); } }}
      >
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <StatusBar hidden />

          {/* Header */}
          <View style={CP.header}>
            <TouchableOpacity
              onPress={() => { if (!imgUploading) { setImgPreviewOpen(false); setImgPreviewUri(null); setImgCaption(''); } }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={CP.headerClose}
            >
              <Icon name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={CP.headerTitle}>Aperçu</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Image */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {imgPreviewUri ? (
              <Image source={{ uri: imgPreviewUri }} style={{ width: SCREEN_W, height: SCREEN_W * 1.1 }} resizeMode="contain" />
            ) : null}
          </View>

          {/* Barre légende + envoyer */}
          <View style={CP.bottomBar}>
            <View style={CP.captionRow}>
              <Icon name="edit-3" size={16} color="rgba(255,255,255,0.5)" />
              <TextInput
                ref={captionRef}
                style={CP.captionInput}
                placeholder="Ajouter une légende…"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={imgCaption}
                onChangeText={setImgCaption}
                multiline
                maxLength={500}
              />
            </View>
            <TouchableOpacity
              style={[CP.sendBtn, imgUploading && { opacity: 0.6 }]}
              onPress={handleSendImagePreview}
              disabled={imgUploading}
              activeOpacity={0.85}
            >
              {imgUploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Icon name="send" size={20} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reply banner */}
      {replyingTo && !isBlocked && (
        <View style={[styles.replyBanner, { backgroundColor: colors.primary + '12', borderTopColor: colors.divider }]}>
          <View style={[styles.replyBannerBar, { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyBannerName, { color: colors.primary }]}>
              {replyingTo.sender_id === myId ? 'Vous' : partnerName}
            </Text>
            <Text style={[styles.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>
              {replyingTo.message_type !== 'text' ? `📎 ${replyingTo.message_type}` : replyingTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="x" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* More menu */}
      <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMoreMenu(false)}>
          <View style={[styles.attachSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.attachHandle, { backgroundColor: colors.divider }]} />
            <TouchableOpacity style={styles.actionItem} onPress={() => { setShowMoreMenu(false); setShowSearch(true); }}>
              <Icon name="search" size={20} color={colors.textPrimary} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Rechercher</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => { setShowMoreMenu(false); setShowPinned(true); }}>
              <Icon name="bookmark" size={20} color={colors.textPrimary} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Messages épinglés</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleViewProfile}>
              <Icon name="user" size={20} color={colors.textPrimary} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Voir le profil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleClearChat}>
              <Icon name="trash" size={20} color={colors.textTertiary} />
              <Text style={[styles.actionText, { color: colors.textTertiary }]}>Vider la conversation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleBlockUser}>
              <Icon name="slash" size={20} color={colors.error ?? '#FF4444'} />
              <Text style={[styles.actionText, { color: colors.error ?? '#FF4444' }]}>Bloquer {partnerName}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Messages épinglés modal */}
      <Modal visible={showPinned} transparent animationType="slide" onRequestClose={() => setShowPinned(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPinned(false)}>
          <View style={[styles.attachSheet, { backgroundColor: colors.surface, maxHeight: '60%' }]}>
            <View style={[styles.attachHandle, { backgroundColor: colors.divider }]} />
            <Text style={[styles.attachTitle, { color: colors.textPrimary, marginBottom: 12 }]}>Messages épinglés</Text>
            {pinnedMessages.length === 0 ? (
              <Text style={{ color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 }}>Aucun message épinglé</Text>
            ) : (
              <FlatList
                data={pinnedMessages}
                keyExtractor={m => m.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.actionItem, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
                    onPress={() => {
                      setShowPinned(false);
                      const idx = messages.findIndex(m => m.id === item.id);
                      if (idx !== -1) listRef.current?.scrollToIndex({ index: idx, animated: true });
                    }}
                  >
                    <Icon name="bookmark" size={16} color="#F59E0B" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.actionText, { color: colors.textPrimary, fontSize: 13 }]} numberOfLines={2}>
                        {item.message_type !== 'text' ? `📎 ${item.message_type}` : item.content}
                      </Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 2 }}>
                        {item.sender_id === myId ? 'Vous' : partnerName}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward picker modal */}
      <Modal visible={showForwardPicker} transparent animationType="slide" onRequestClose={() => { setShowForwardPicker(false); setForwardingMsg(null); }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowForwardPicker(false); setForwardingMsg(null); }}>
          <View style={[styles.attachSheet, { backgroundColor: colors.surface, maxHeight: '65%' }]}>
            <View style={[styles.attachHandle, { backgroundColor: colors.divider }]} />
            <Text style={[styles.attachTitle, { color: colors.textPrimary, marginBottom: 12 }]}>Transférer à…</Text>
            {convList.length === 0 ? (
              <Text style={{ color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 }}>Aucune conversation</Text>
            ) : (
              <FlatList
                data={convList}
                keyExtractor={c => c.partner_id}
                renderItem={({ item }) => {
                  const name = item.partner?.full_name ?? item.partner?.username ?? item.partner_id;
                  return (
                    <TouchableOpacity
                      style={[styles.actionItem, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
                      onPress={() => doForward(item.partner_id, name)}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 14 }}>{name[0]?.toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.actionText, { color: colors.textPrimary }]}>{name}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Attachment picker modal */}
      <Modal visible={showAttach} transparent animationType="slide" onRequestClose={() => setShowAttach(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAttach(false)}>
          <View style={[styles.attachSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.attachHandle, { backgroundColor: colors.divider }]} />
            <Text style={[styles.attachTitle, { color: colors.textPrimary }]}>Envoyer un média</Text>
            <View style={styles.attachGrid}>
              {[
                { icon: 'image',    label: 'Photo',        color: '#4CAF50', onPress: pickImage },
                { icon: 'camera',   label: 'Caméra',       color: '#E91E63', onPress: takePhoto },
                { icon: 'video',    label: 'Vidéo',        color: '#9C27B0', onPress: pickVideo },
                { icon: 'file',     label: 'Fichier',      color: '#FF9800', onPress: pickFile },
                { icon: 'map-pin',  label: 'Localisation', color: '#EF4444', onPress: sendLocation },
              ].map((item, i) => (
                <TouchableOpacity key={i} style={styles.attachItem} onPress={item.onPress}>
                  <View style={[styles.attachIcon, { backgroundColor: item.color + '18' }]}>
                    <Icon name={item.icon} size={26} color={item.color} />
                  </View>
                  <Text style={[styles.attachLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: Spacing[4],
    paddingBottom:  Spacing[3],
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  callBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  moreBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 17, fontWeight: '800' },
  headerSub:  { fontSize: 12, marginTop: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },

  uploadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },

  bubble:       { maxWidth: '78%', marginBottom: 2 },
  bubbleMine:   { alignSelf: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start' },
  bubbleInner:  { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4, overflow: 'hidden' },
  msgText:      { fontSize: 15, lineHeight: 22 },
  msgTime:      { fontSize: 10, alignSelf: 'flex-end' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  editedLabel:  { fontSize: 10, fontStyle: 'italic' },

  // Voice
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 },
  playBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  voiceInfo:   { flex: 1, gap: 2 },
  voiceDuration: { fontSize: 11 },
  waveform:    { flexDirection: 'row', alignItems: 'center', height: 20, borderRadius: 4, gap: 1.5, paddingHorizontal: 4 },
  waveBar:     { width: 2.5, borderRadius: 2 },

  // Image
  imageBubble: { width: SCREEN_W * 0.55, height: SCREEN_W * 0.55, borderRadius: 14, marginBottom: 4 },

  // Video
  videoBubble:       { width: SCREEN_W * 0.55, height: SCREEN_W * 0.4, borderRadius: 14, marginBottom: 4 },
  videoPlayOverlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14 },
  videoDurationLabel: { fontSize: 11, marginTop: -2 },

  // File
  fileBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 },
  fileIcon:   { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileInfo:   { flex: 1 },
  fileName:   { fontSize: 14, fontWeight: '600' },
  fileSize:   { fontSize: 11, marginTop: 1 },

  // Partner status (typing / recording)
  partnerStatusBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  partnerStatusText: { fontSize: 13, fontStyle: 'italic' },
  typingDotsRow:     { flexDirection: 'row', gap: 3, alignItems: 'center' },
  typingDot:         { width: 5, height: 5, borderRadius: 3, opacity: 0.6 },

  // Recording
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recordingDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF4444' },
  recordingTime: { fontSize: 16, fontWeight: '600', minWidth: 44 },
  recordCancelBtn: { padding: 8 },
  recordSendBtn:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Input bar
  inputBar: {
    paddingHorizontal: 10,
    paddingVertical:   8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    gap: 8,
  },
  attachBtn:      { justifyContent: 'flex-end', paddingBottom: 2 },
  attachBtnInner: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  input: {
    fontSize: 15,
    maxHeight: 120,
    paddingTop: 2,
    paddingBottom: 2,
  },
  sendBtn:      { justifyContent: 'flex-end', paddingBottom: 2 },
  sendBtnInner: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  // Attachment modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  attachSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  attachHandle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  attachTitle:   { fontSize: 18, fontWeight: '700', marginBottom: 20 },
  attachGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  attachItem:    { alignItems: 'center', width: 70, gap: 8 },
  attachIcon:    { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  attachLabel:   { fontSize: 12 },

  // Edit banner
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Blocked banner
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  blockedText: { fontSize: 13, textAlign: 'center', flex: 1 },

  // Action sheet
  actionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
  },

  // Emoji picker button inside input
  emojiBtn:     { paddingHorizontal: 6, justifyContent: 'center' },
  emojiBtnText: { fontSize: 20 },

  // Emoji picker panel
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emojiItem: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 26 },

  // Quick reactions in action sheet
  reactionsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 },
  reactionQuickBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  reactionQuickText: { fontSize: 28 },

  // Reaction badge under bubble
  reactionBadge: {
    position: 'absolute',
    bottom: -10,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionMine:   { right: 8 },
  reactionTheirs: { left: 8 },
  reactionEmoji:  { fontSize: 14 },
  stickerText:    { fontSize: 64, lineHeight: 72 },

  // Location card — style WhatsApp
  locationCard:        { borderRadius: 12, overflow: 'hidden', width: 240 },
  locationCardMe:      { backgroundColor: '#075E54' },
  locationCardOther:   { backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#e0e0e0' },
  locationMapBox:      { width: '100%', height: 140, position: 'relative' },
  locationMapImg:      { width: '100%', height: 140 },
  locationPinWrap:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  locationPinCircle:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  locationPinTail:     { width: 3, height: 10, backgroundColor: '#EF4444', borderRadius: 2, marginTop: -2 },
  locationFooter:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  locationFooterMe:    { backgroundColor: '#054d43' },
  locationFooterOther: { backgroundColor: '#f5f5f5' },
  locationLabel:       { fontSize: 13, fontWeight: '700' },
  locationCoords:      { fontSize: 11, marginTop: 1 },

  // Pinned banner
  pinnedBanner:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  pinnedBannerText: { fontSize: 12, fontWeight: '700' },
  pinnedBannerSub:  { fontSize: 12, flex: 1 },

  // Search bar in conversation
  chatSearchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  chatSearchInput: { flex: 1, fontSize: 14, padding: 0 },

  // Reply preview inside bubble
  replyPreview: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 6, gap: 2 },
  replyName:    { fontSize: 12, fontWeight: '700' },
  replyText:    { fontSize: 12 },

  // Forwarded label
  forwardedLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  forwardedText:  { fontSize: 11, fontStyle: 'italic' },

  // Reply banner above input
  replyBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  replyBannerBar:  { width: 3, height: 36, borderRadius: 2 },
  replyBannerName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  replyBannerText: { fontSize: 13 },
});

const CP = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12,
  },
  headerClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
