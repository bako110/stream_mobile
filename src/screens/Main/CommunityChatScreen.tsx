import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, Image, Alert, Modal, Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import { authService } from '../../services/authService';
import { useCommunityWebSocket } from '../../hooks/useCommunityWebSocket';
import type { CommunityWsPayload } from '../../hooks/useCommunityWebSocket';
import type { CommunityMessageData } from '../../services/communityService';

interface RouteParams {
  communityId: string;
  communityName: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const CommunityChatScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute();
  const { communityId, communityName } = route.params as RouteParams;

  const [messages, setMessages] = useState<CommunityMessageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [editingMsg, setEditingMsg] = useState<CommunityMessageData | null>(null);
  const [menuMsg, setMenuMsg] = useState<CommunityMessageData | null>(null);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

  // ── WebSocket temps-réel ────────────────────────────────────────────────
  const { sendWsMessage, isConnected } = useCommunityWebSocket(
    communityId,
    useCallback((payload: CommunityWsPayload) => {
      if (payload.type === 'community_message') {
        const msg: CommunityMessageData = {
          id: payload.id,
          community_id: payload.community_id,
          sender_id: payload.sender_id,
          sender_username: payload.sender_username,
          sender_display_name: payload.sender_display_name,
          sender_avatar_url: payload.sender_avatar_url,
          content: payload.content,
          created_at: payload.created_at,
          edited_at: payload.edited_at,
        };
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [msg, ...prev];
        });
      } else if (payload.type === 'community_message_edited') {
        setMessages(prev =>
          prev.map(m =>
            m.id === payload.id
              ? { ...m, content: payload.content, edited_at: payload.edited_at }
              : m,
          ),
        );
      } else if (payload.type === 'community_message_deleted') {
        setMessages(prev => prev.filter(m => m.id !== payload.id));
      }
    }, []),
  );

  // ── Chargement initial (historique paginé via REST) ─────────────────────
  const loadMessages = useCallback(async (p = 1, append = false) => {
    try {
      const msgs = await communityService.getMessages(communityId, p, 30);
      if (append) {
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...prev, ...msgs.filter(m => !ids.has(m.id))];
        });
      } else {
        setMessages(msgs);
      }
      setHasMore(msgs.length === 30);
    } catch (e) {
      console.warn('[CommunityChat] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    authService.getMe().then(u => setMyId(String(u.id))).catch(() => {});
    loadMessages();
  }, [communityId, loadMessages]);

  // ── Envoyer / Modifier un message ───────────────────────────────────────
  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');

    // Mode édition
    if (editingMsg) {
      const msgId = editingMsg.id;
      setEditingMsg(null);
      if (isConnected) {
        sendWsMessage({ type: 'edit', message_id: msgId, content });
        setSending(false);
      } else {
        try {
          const updated = await communityService.editMessage(communityId, msgId, content);
          setMessages(prev => prev.map(m => m.id === msgId ? updated : m));
        } catch { setText(content); }
        finally { setSending(false); }
      }
      return;
    }

    // Nouveau message
    if (isConnected) {
      sendWsMessage({ type: 'message', content });
      setSending(false);
    } else {
      try {
        const msg = await communityService.sendMessage(communityId, content);
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [msg, ...prev];
        });
      } catch { setText(content); }
      finally { setSending(false); }
    }
  };

  // ── Supprimer un message ────────────────────────────────────────────────
  const handleDelete = (msg: CommunityMessageData) => {
    setMenuMsg(null);
    Alert.alert('Supprimer', 'Supprimer ce message ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          if (isConnected) {
            sendWsMessage({ type: 'delete', message_id: msg.id });
          } else {
            try {
              await communityService.deleteMessage(communityId, msg.id);
              setMessages(prev => prev.filter(m => m.id !== msg.id));
            } catch {}
          }
        },
      },
    ]);
  };

  // ── Éditer un message ───────────────────────────────────────────────────
  const handleEdit = (msg: CommunityMessageData) => {
    setMenuMsg(null);
    setEditingMsg(msg);
    setText(msg.content);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const cancelEdit = () => {
    setEditingMsg(null);
    setText('');
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadMessages(nextPage, true);
  };

  // ── Naviguer vers le profil du sender ───────────────────────────────────
  const goToProfile = (userId: string) => {
    nav.navigate('UserProfile', { userId });
  };

  const renderMessage = ({ item, index }: { item: CommunityMessageData; index: number }) => {
    const isMe = item.sender_id === myId;
    const prev = messages[index + 1];
    const showSender = !isMe && (!prev || prev.sender_id !== item.sender_id);
    const showDate = !prev || new Date(item.created_at).toDateString() !== new Date(prev.created_at).toDateString();

    return (
      <>
        {showDate && (
          <View style={styles.dateSep}>
            <Text style={[styles.dateText, { color: colors.textTertiary }]}>
              {formatDateSeparator(item.created_at)}
            </Text>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={() => setMenuMsg(item)}
          delayLongPress={400}
          style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}
        >
          {!isMe && showSender && (
            <TouchableOpacity onPress={() => goToProfile(item.sender_id)} style={styles.senderAvatarWrap}>
              {item.sender_avatar_url ? (
                <Image source={{ uri: item.sender_avatar_url }} style={styles.senderAvatar} />
              ) : (
                <View style={[styles.senderAvatar, { backgroundColor: colors.primary + '33', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 10 }}>
                    {(item.sender_display_name || item.sender_username || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          {!isMe && !showSender && <View style={{ width: 30 }} />}
          <View style={[
            styles.bubble,
            isMe
              ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
              : { backgroundColor: colors.surfaceElevated ?? colors.backgroundSecondary, borderBottomLeftRadius: 4 },
          ]}>
            {!isMe && showSender && (
              <TouchableOpacity onPress={() => goToProfile(item.sender_id)}>
                <Text style={[styles.senderName, { color: colors.primary }]}>
                  {item.sender_display_name || item.sender_username}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.msgText, { color: isMe ? '#fff' : colors.textPrimary }]}>
              {item.content}
            </Text>
            <View style={styles.msgMeta}>
              {item.edited_at && (
                <Text style={[styles.editedLabel, { color: isMe ? 'rgba(255,255,255,0.5)' : colors.textTertiary }]}>
                  modifié
                </Text>
              )}
              <Text style={[styles.msgTime, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.textTertiary }]}>
                {formatTime(item.created_at)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: STATUS_H + 8, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {communityName}
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
            {isConnected ? 'En ligne' : 'Connexion…'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => nav.navigate('CommunityDetail', { communityId })}>
          <Icon name="info" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
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
            <View style={styles.empty}>
              <Icon name="message-circle" size={48} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, marginTop: 12 }}>
                Aucun message — soyez le premier !
              </Text>
            </View>
          }
        />
      )}

      {/* Edit banner */}
      {editingMsg && (
        <View style={[styles.editBanner, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          <Icon name="edit-2" size={14} color={colors.primary} />
          <Text style={[styles.editBannerText, { color: colors.textSecondary }]} numberOfLines={1}>
            {editingMsg.content}
          </Text>
          <TouchableOpacity onPress={cancelEdit}>
            <Icon name="x" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: editingMsg ? 'transparent' : colors.divider }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, {
            backgroundColor: colors.inputBg ?? colors.backgroundSecondary,
            color: colors.textPrimary,
            borderColor: colors.border,
          }]}
          value={text}
          onChangeText={setText}
          placeholder="Écrire un message..."
          placeholderTextColor={colors.textDisabled}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.backgroundSecondary }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Icon name={editingMsg ? 'check' : 'send'} size={18} color={text.trim() ? '#fff' : colors.textTertiary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Context menu modal */}
      <Modal visible={!!menuMsg} transparent animationType="fade" onRequestClose={() => setMenuMsg(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuMsg(null)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface }]}>
            {/* Preview du message */}
            <View style={[styles.menuPreview, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.menuPreviewName, { color: colors.primary }]}>
                {menuMsg?.sender_display_name || menuMsg?.sender_username}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={3}>
                {menuMsg?.content}
              </Text>
            </View>

            {/* Voir le profil */}
            {menuMsg && menuMsg.sender_id !== myId && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setMenuMsg(null); goToProfile(menuMsg.sender_id); }}
              >
                <Icon name="user" size={18} color={colors.textPrimary} />
                <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Voir le profil</Text>
              </TouchableOpacity>
            )}

            {/* Éditer (seulement ses propres messages) */}
            {menuMsg && menuMsg.sender_id === myId && (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleEdit(menuMsg)}>
                <Icon name="edit-2" size={18} color={colors.textPrimary} />
                <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>Modifier</Text>
              </TouchableOpacity>
            )}

            {/* Supprimer (ses propres messages — les admins aussi via le backend) */}
            {menuMsg && (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleDelete(menuMsg)}>
                <Icon name="trash-2" size={18} color="#E53935" />
                <Text style={[styles.menuItemText, { color: '#E53935' }]}>Supprimer</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: colors.divider }]}
              onPress={() => setMenuMsg(null)}
            >
              <Text style={[styles.menuItemText, { color: colors.textTertiary, textAlign: 'center' }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, transform: [{ scaleY: -1 }] },
  dateSep: { alignItems: 'center', marginVertical: 12, transform: [{ scaleY: -1 }] },
  dateText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  msgRow: { flexDirection: 'row', marginBottom: 4, maxWidth: '85%' },
  msgRowMe: { alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  senderAvatarWrap: { marginRight: 6, justifyContent: 'flex-end' },
  senderAvatar: { width: 28, height: 28, borderRadius: 14 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, maxWidth: '100%' },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 4 },
  editedLabel: { fontSize: 9, fontStyle: 'italic' },
  msgTime: { fontSize: 9 },
  editBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1,
  },
  editBannerText: { flex: 1, fontSize: 13 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderTopWidth: 1,
  },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, maxHeight: 100, borderWidth: 1,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  menuPreview: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  menuPreviewName: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  menuItemText: { fontSize: 15, fontWeight: '500' },
});
