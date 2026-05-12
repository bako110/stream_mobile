/**
 * CommunityChannelChatScreen
 * Chat d'un canal (sous-groupe) d'une communauté.
 * Reprend exactement la même logique que CommunityChatScreen
 * mais en ciblant les endpoints /channels/:channelId/messages.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, Image, Alert, Modal, Pressable,
  ScrollView, Dimensions, Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  channelId: string;
  channelName: string;
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

export const CommunityChannelChatScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute();
  const { communityId, communityName, channelId, channelName, myRole, isAnnouncement } = route.params as RouteParams;

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

  // Media preview
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

  // WebSocket — on s'abonne au canal via le WS de la communauté
  const { sendWsMessage, isConnected } = useCommunityWebSocket(
    communityId,
    useCallback((payload: CommunityWsPayload) => {
      // Filtrer les messages de ce canal
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

  // Chargement
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

  // Envoyer
  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');

    if (editingMsg) {
      const msgId = editingMsg.id;
      setEditingMsg(null);
      try {
        const updated = await communityService.deleteChannelMessage(communityId, channelId, msgId) as any;
        if (updated) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content, edited_at: new Date().toISOString() } : m));
      } catch {}
      setSending(false);
      return;
    }

    const reply_to_id = replyingTo?.id ?? null;
    setReplyingTo(null);
    const msgType = isAnnouncement ? 'announcement' : 'text';

    try {
      const msg = await communityService.sendChannelMessage(communityId, channelId, content, msgType, [], reply_to_id ?? undefined);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg as CommunityMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {}
    setSending(false);
  };

  // Sélection image
  const handlePickMedia = () => {
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 4, quality: 0.8 }, (resp) => {
      if (resp.didCancel || !resp.assets?.length) return;
      const assets = resp.assets.filter(a => !!a.uri).map((a, i) => ({ uri: a.uri!, name: a.fileName ?? `photo_${Date.now()}_${i}.jpg` }));
      if (!assets.length) return;
      setMediaPreview(assets);
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
        const msg = await communityService.sendChannelMessage(communityId, channelId, mediaCaption.trim(), 'image', urls);
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

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const renderMessage = ({ item: msg, index }: { item: CommunityMessage; index: number }) => {
    const isMe = msg.sender_id === myId;
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const showDate = !prev || !sameDay(prev.created_at, msg.created_at);
    const isFirst = !prev || prev.sender_id !== msg.sender_id || !sameDay(prev.created_at, msg.created_at);
    const isLast  = !next || next.sender_id !== msg.sender_id || !sameDay(next.created_at, msg.created_at);
    const isImg   = msg.message_type === 'image' || msg.message_type === 'media';
    const isAnn   = msg.message_type === 'announcement';

    const maxW = W * 0.72;
    const bubbleBg   = isMe ? colors.primary : (colors.surfaceElevated ?? colors.backgroundSecondary);
    const textColor  = isMe ? '#fff' : colors.textPrimary;
    const timeColor  = isMe ? 'rgba(255,255,255,0.55)' : colors.textTertiary;
    const myRadius   = { borderBottomRightRadius: isLast ? 4 : 16 };
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
    if (isAnn) {
      return (
        <View style={{ marginHorizontal: 12 }}>
          {DateSep}
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => canManage ? setMenuMsg(msg) : undefined}
            delayLongPress={350}
            style={[C.announceBubble, { backgroundColor: '#F59E0B0D', borderColor: '#F59E0B40' }]}
          >
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
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={() => setMenuMsg(msg)}
              delayLongPress={350}
            >
              {msg.reply_to && (
                <View style={[C.replyBox, { backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : colors.backgroundSecondary, borderLeftColor: colors.primary }]}>
                  <Text style={[C.replyName, { color: colors.primary }]}>{msg.reply_to.sender_display_name || msg.reply_to.sender_username}</Text>
                  <Text style={[C.replyText, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]} numberOfLines={1}>
                    {msg.reply_to.content || '📷 Image'}
                  </Text>
                </View>
              )}

              {isImg ? (
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
              ) : (
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
              )}
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
      <LinearGradient
        colors={[colors.surface, colors.surface]}
        style={[C.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}
      >
        <TouchableOpacity onPress={() => nav.goBack()} style={C.headerBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={[C.channelIconBox, { backgroundColor: colors.primary + '20' }]}>
          <Icon name={isAnnouncement ? 'bell' : 'hash'} size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[C.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{channelName}</Text>
          <Text style={[C.headerSub, { color: colors.textTertiary }]}>{communityName}</Text>
        </View>
        {isConnected
          ? <View style={[C.onlineDot, { backgroundColor: '#22C55E' }]} />
          : <View style={[C.onlineDot, { backgroundColor: '#94A3B8' }]} />
        }
      </LinearGradient>

      {/* Messages */}
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
                    {replyingTo.content || '📷 Image'}
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
            ) : (
              <View style={[C.inputBar, { backgroundColor: colors.surface, borderTopColor: (editingMsg || replyingTo) ? 'transparent' : colors.divider }]}>
                <View style={[C.inputRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                  {!isAnnouncement && (
                    <TouchableOpacity onPress={handlePickMedia} disabled={sending} style={C.inputIconBtn}>
                      <Icon name="image" size={19} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
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
                <Animated.View style={{ transform: [{ scale: sendBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: sendBtnAnim }}>
                  <TouchableOpacity style={C.sendBtn} onPress={handleSend} disabled={!text.trim() || sending}>
                    <LinearGradient
                      colors={text.trim() ? ['#7B3FF2', '#E0389A'] : [colors.backgroundSecondary, colors.backgroundSecondary]}
                      style={{ flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                      {sending
                        ? <ActivityIndicator size="small" color={text.trim() ? '#fff' : colors.textTertiary} />
                        : <Icon name={editingMsg ? 'check' : 'send'} size={17} color={text.trim() ? '#fff' : colors.textTertiary} />
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>

      {/* Context menu */}
      <Modal visible={!!menuMsg} transparent animationType="fade" onRequestClose={() => setMenuMsg(null)}>
        <Pressable style={C.overlay} onPress={() => setMenuMsg(null)}>
          <View style={[C.menuSheet, { backgroundColor: colors.surface }]}>
            {menuMsg?.message_type !== 'announcement' && (
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
                {menuMsg?.content || '📷 Image'}
              </Text>
            </View>
            {[
              { show: menuMsg?.message_type !== 'announcement', icon: 'corner-up-left', label: 'Répondre', color: colors.textPrimary,
                onPress: () => { setReplyingTo(menuMsg!); setMenuMsg(null); setTimeout(() => inputRef.current?.focus(), 100); } },
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

      {/* Preview média */}
      <Modal visible={mediaPreviewOpen} transparent={false} statusBarTranslucent animationType="slide"
        onRequestClose={() => { if (!mediaUploading) { setMediaPreviewOpen(false); setMediaPreview([]); } }}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <StatusBar hidden />
          <View style={MP.header}>
            <TouchableOpacity onPress={() => { if (!mediaUploading) { setMediaPreviewOpen(false); setMediaPreview([]); } }} style={MP.closeBtn}>
              <Icon name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={MP.title}>Aperçu</Text>
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

      {/* Image viewer */}
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
  channelIconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
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
  inputRow:    { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 4 },
  inputIconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  input:       { flex: 1, paddingHorizontal: 8, paddingVertical: 8, fontSize: 15, maxHeight: 120 },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },

  overlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, position: 'absolute', bottom: 0, left: 0, right: 0 },
  emojiRow:  { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  emojiBtn:  { padding: 4 },
  menuPreview:    { paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  menuItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  menuItemIcon:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menuItemText:   { fontSize: 15, fontWeight: '500' },
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
