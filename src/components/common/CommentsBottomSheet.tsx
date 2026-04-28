import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Image,
  ActivityIndicator, Dimensions, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { storage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../utils/constants';
import { useCommentsWebSocket } from '../../hooks/useCommentsWebSocket';
import type { CommentWsEvent } from '../../hooks/useCommentsWebSocket';
import { socialService } from '../../services';
import { VerifiedBadge } from './VerifiedBadge';
import type { Comment } from '../../types';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.75;

interface Props {
  visible: boolean;
  onClose: () => void;
  reelId?: string;
  contentId?: string;
  concertId?: string;
  eventId?: string;
  onCommentAdded?: () => void;
  onCommentCountChange?: (delta: number) => void;
}

interface CommentEx extends Comment {
  userReaction?: 'like' | 'dislike' | null;
  replies?: CommentEx[];
  repliesLoaded?: boolean;
  repliesLoading?: boolean;
  showReplies?: boolean;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getDisplayName(author: Comment['author']): string {
  return author?.display_name
    ?? (author?.first_name && author?.last_name
        ? `${author.first_name} ${author.last_name}`
        : author?.username ?? 'Utilisateur');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'maintenant';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar: React.FC<{ author: Comment['author']; size?: number; color: string }> = ({ author, size = 36, color }) => {
  const name = getDisplayName(author);
  const r    = size / 2;
  if (author?.avatar_url) {
    return <Image source={{ uri: author.avatar_url }} style={{ width: size, height: size, borderRadius: r, flexShrink: 0 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{name[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
};

// ─── CommentRow ───────────────────────────────────────────────────────────────

interface RowProps {
  item: CommentEx;
  colors: any;
  currentUserId?: string;
  isReply?: boolean;
  onReply: (comment: CommentEx) => void;
  onToggleReplies: (id: string) => void;
  onLike: (item: CommentEx, type: 'like' | 'dislike') => void;
  onEdit: (item: CommentEx) => void;
  onDelete: (id: string) => void;
}

const CommentRow: React.FC<RowProps> = ({
  item, colors, currentUserId, isReply = false,
  onReply, onToggleReplies, onLike, onEdit, onDelete,
}) => {
  const name     = getDisplayName(item.author);
  const liked    = item.userReaction === 'like';
  const disliked = item.userReaction === 'dislike';
  const isOwn    = String(item.author?.id ?? item.user_id) === String(currentUserId);
  const replies  = item.replies ?? [];
  const replyCount = item.reply_count ?? replies.length;

  const showMenu = () => {
    if (!isOwn) return;
    Alert.alert('Votre commentaire', undefined, [
      { text: 'Modifier', onPress: () => onEdit(item) },
      { text: 'Supprimer', style: 'destructive', onPress: () => {
          Alert.alert('Supprimer', 'Supprimer ce commentaire ?', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(item.id) },
          ]);
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  return (
    <View style={isReply ? { paddingLeft: 44 } : undefined}>
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={isOwn ? showMenu : undefined}
        style={[st.commentRow, isOwn && { backgroundColor: colors.primary + '06' }]}
      >
        <Avatar author={item.author} size={isReply ? 30 : 36} color={colors.primary} />

        <View style={{ flex: 1 }}>
          {/* En-tête */}
          <View style={st.rowHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
              <Text style={[st.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
              {item.author?.is_verified && <VerifiedBadge size={12} />}
              {isOwn && (
                <View style={[st.badge, { backgroundColor: colors.primary + '22' }]}>
                  <Text style={[st.badgeText, { color: colors.primary }]}>Vous</Text>
                </View>
              )}
            </View>
            <Text style={[st.timeText, { color: colors.textTertiary }]}>{timeAgo(item.created_at)}</Text>
            {isOwn && (
              <TouchableOpacity onPress={showMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="more-horizontal" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Corps */}
          <Text style={[st.commentText, { color: colors.textSecondary }]}>{item.body}</Text>
          {item.is_edited && (
            <Text style={[st.editedTag, { color: colors.textTertiary }]}>modifié</Text>
          )}

          {/* Actions */}
          <View style={st.actions}>
            {/* Like */}
            <TouchableOpacity
              style={[st.reactionBtn, liked && { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]}
              onPress={() => onLike(item, 'like')}
              activeOpacity={0.7}
            >
              <Icon name="thumbs-up" size={13} color={liked ? colors.primary : colors.textTertiary} />
              <Text style={[st.reactionCount, { color: liked ? colors.primary : colors.textTertiary }]}>
                {item.like_count}
              </Text>
            </TouchableOpacity>

            {/* Dislike */}
            <TouchableOpacity
              style={[st.reactionBtn, disliked && { borderColor: '#FF3B30', backgroundColor: '#FF3B3018' }]}
              onPress={() => onLike(item, 'dislike')}
              activeOpacity={0.7}
            >
              <Icon name="thumbs-down" size={13} color={disliked ? '#FF3B30' : colors.textTertiary} />
              <Text style={[st.reactionCount, { color: disliked ? '#FF3B30' : colors.textTertiary }]}>
                {item.dislike_count ?? 0}
              </Text>
            </TouchableOpacity>

            {/* Répondre — seulement sur les commentaires racines */}
            {!isReply && (
              <TouchableOpacity style={st.replyBtn} onPress={() => onReply(item)} activeOpacity={0.7}>
                <Icon name="corner-down-right" size={13} color={colors.primary} />
                <Text style={[st.replyBtnText, { color: colors.primary }]}>Répondre</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Afficher / masquer les réponses */}
          {!isReply && replyCount > 0 && (
            <TouchableOpacity
              style={st.toggleReplies}
              onPress={() => onToggleReplies(item.id)}
              activeOpacity={0.7}
            >
              {item.repliesLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <View style={[st.toggleLine, { backgroundColor: colors.border }]} />
                  <Icon
                    name={item.showReplies ? 'chevron-up' : 'chevron-down'}
                    size={13}
                    color={colors.primary}
                  />
                  <Text style={[st.toggleText, { color: colors.primary }]}>
                    {item.showReplies
                      ? 'Masquer les réponses'
                      : `${replyCount} réponse${replyCount > 1 ? 's' : ''}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {/* Réponses inline */}
      {item.showReplies && replies.map(r => (
        <CommentRow
          key={r.id}
          item={r}
          colors={colors}
          currentUserId={currentUserId}
          isReply
          onReply={onReply}
          onToggleReplies={onToggleReplies}
          onLike={onLike}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
};

// ─── CommentsBottomSheet ──────────────────────────────────────────────────────

export const CommentsBottomSheet: React.FC<Props> = ({
  visible, onClose, reelId, contentId, concertId, eventId, onCommentAdded, onCommentCountChange,
}) => {
  const { theme }                        = useTheme();
  const { colors }                       = theme;
  const { currentUser, refreshUser }     = useUser();

  // Lire l'id depuis MMKV en premier (instantané), puis se syncer avec le context
  const [myId, setMyId] = useState<string | null>(() =>
    currentUser?.id
      ? String(currentUser.id)
      : storage.getItem(STORAGE_KEYS.LAST_USER_ID) ?? null
  );

  useEffect(() => {
    if (currentUser?.id) {
      setMyId(String(currentUser.id));
    } else if (!myId) {
      refreshUser().then(u => { if (u?.id) setMyId(String(u.id)); }).catch(() => {});
    }
  }, [currentUser?.id]);

  const [comments,    setComments]    = useState<CommentEx[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [replyTo,     setReplyTo]     = useState<CommentEx | null>(null);

  // Edition
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editText,   setEditText]   = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const inputRef = useRef<TextInput>(null);

  const targetParams = reelId    ? { reel_id:    reelId    }
                     : contentId ? { content_id: contentId }
                     : concertId ? { concert_id: concertId }
                     : eventId   ? { event_id:   eventId   }
                     : null;

  const wsTargetType = reelId ? 'reel' : contentId ? 'content' : concertId ? 'concert' : eventId ? 'event' : null;
  const wsTargetId   = reelId ?? contentId ?? concertId ?? eventId ?? null;

  // Handler événements WebSocket
  const handleWsEvent = useCallback((event: CommentWsEvent) => {
    switch (event.type) {
      case 'comment_added':
        setComments(prev => {
          if (prev.some(c => c.id === event.comment.id)) return prev;
          onCommentCountChange?.(+1);
          return [{ ...event.comment, userReaction: null, replies: [], repliesLoaded: false, showReplies: false }, ...prev];
        });
        break;

      case 'comment_updated':
        setComments(prev => prev.map(c => {
          if (c.id === event.comment_id) return { ...c, body: event.body, is_edited: event.is_edited };
          return { ...c, replies: (c.replies ?? []).map(r =>
            r.id === event.comment_id ? { ...r, body: event.body, is_edited: event.is_edited } : r
          )};
        }));
        break;

      case 'comment_deleted':
        setComments(prev => {
          const wasRoot = prev.some(c => c.id === event.comment_id);
          if (wasRoot) onCommentCountChange?.(-1);
          return prev.filter(c => c.id !== event.comment_id).map(c => ({
            ...c,
            replies: (c.replies ?? []).filter(r => r.id !== event.comment_id),
            reply_count: (c.replies ?? []).some(r => r.id === event.comment_id)
              ? (c.reply_count ?? 1) - 1 : c.reply_count,
          }));
        });
        break;

      case 'reaction_updated':
        setComments(prev => prev.map(c => {
          if (c.id === event.comment_id) return { ...c, like_count: event.like_count, dislike_count: event.dislike_count };
          return { ...c, replies: (c.replies ?? []).map(r =>
            r.id === event.comment_id ? { ...r, like_count: event.like_count, dislike_count: event.dislike_count } : r
          )};
        }));
        break;
    }
  }, []);

  useCommentsWebSocket({
    targetType: wsTargetType as any,
    targetId: wsTargetId,
    enabled: visible,
    onEvent: handleWsEvent,
  });

  // Chargement commentaires racines
  const fetchComments = useCallback(async () => {
    if (!targetParams) return;
    setLoading(true);
    try {
      const data = await socialService.getComments(targetParams);
      setComments(data.map(c => ({ ...c, userReaction: null, replies: [], repliesLoaded: false, showReplies: false })));
    } catch { setComments([]); }
    finally { setLoading(false); }
  }, [reelId, contentId, concertId, eventId]);

  useEffect(() => {
    if (visible) { fetchComments(); }
    else { setReplyTo(null); setText(''); setEditingId(null); setEditText(''); }
  }, [visible]);

  // Toggle réponses
  const toggleReplies = useCallback(async (commentId: string) => {
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      if (c.repliesLoaded) return { ...c, showReplies: !c.showReplies };
      return { ...c, repliesLoading: true, showReplies: true };
    }));

    const c = comments.find(x => x.id === commentId);
    if (!c?.repliesLoaded) {
      try {
        const data = await socialService.getReplies(commentId);
        setComments(prev => prev.map(x =>
          x.id === commentId
            ? { ...x, replies: data.map(r => ({ ...r, userReaction: null })), repliesLoaded: true, repliesLoading: false }
            : x
        ));
      } catch {
        setComments(prev => prev.map(x => x.id === commentId ? { ...x, repliesLoading: false } : x));
      }
    }
  }, [comments]);

  // Envoyer / répondre
  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending || !targetParams) return;
    setSending(true);
    try {
      const payload = replyTo
        ? { body, parent_id: replyTo.id, ...targetParams }
        : { body, ...targetParams };
      const newComment = await socialService.createComment(payload);

      if (replyTo) {
        // Ajout optimiste dans les réponses du parent (WS ne broadcast pas les réponses dans la room)
        setComments(prev => prev.map(c => {
          if (c.id !== replyTo.id) return c;
          return {
            ...c,
            reply_count: (c.reply_count ?? 0) + 1,
            replies: [...(c.replies ?? []), { ...newComment, userReaction: null }],
            repliesLoaded: true,
            showReplies: true,
          };
        }));
        setReplyTo(null);
      } else {
        // Ajout optimiste — le WS broadcast déduplication via comment.id
        setComments(prev => {
          if (prev.some(c => c.id === newComment.id)) return prev;
          return [{ ...newComment, userReaction: null, replies: [], repliesLoaded: false }, ...prev];
        });
        onCommentAdded?.();
      }
      setText('');
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  // Réactions
  const handleReaction = useCallback((comment: CommentEx, type: 'like' | 'dislike', isReply = false, parentId?: string) => {
    const update = (c: CommentEx): CommentEx => {
      if (c.id !== comment.id) return c;
      const isSame      = c.userReaction === type;
      const wasOpposite = c.userReaction && c.userReaction !== type;
      return {
        ...c,
        userReaction: isSame ? null : type,
        like_count: type === 'like'
          ? c.like_count + (isSame ? -1 : 1)
          : c.like_count - (wasOpposite && c.userReaction === 'like' ? 1 : 0),
        dislike_count: (type === 'dislike'
          ? (c.dislike_count ?? 0) + (isSame ? -1 : 1)
          : (c.dislike_count ?? 0) - (wasOpposite && c.userReaction === 'dislike' ? 1 : 0)) as number,
      };
    };

    if (isReply && parentId) {
      setComments(prev => prev.map(p =>
        p.id === parentId ? { ...p, replies: (p.replies ?? []).map(update) } : p
      ));
    } else {
      setComments(prev => prev.map(update));
    }
    socialService.toggleReaction({ reaction_type: type, comment_id: comment.id }).catch(() => {
      // rollback silencieux
    });
  }, []);

  // Modifier
  const startEdit = (item: CommentEx) => {
    setEditingId(item.id);
    setEditText(item.body);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    setEditSaving(true);
    try {
      const updated = await socialService.updateComment(editingId, editText.trim());
      const apply = (c: CommentEx): CommentEx =>
        c.id === editingId ? { ...c, body: updated.body, is_edited: true } : { ...c, replies: (c.replies ?? []).map(apply) };
      setComments(prev => prev.map(apply));
      setEditingId(null);
      setEditText('');
    } catch { Alert.alert('Erreur', 'Impossible de modifier.'); }
    finally { setEditSaving(false); }
  };

  // Supprimer
  const handleDelete = async (id: string) => {
    try {
      await socialService.deleteComment(id);
      setComments(prev =>
        prev.filter(c => c.id !== id).map(c => ({
          ...c, replies: (c.replies ?? []).filter(r => r.id !== id),
          reply_count: (c.replies ?? []).some(r => r.id === id) ? (c.reply_count ?? 1) - 1 : c.reply_count,
        }))
      );
    } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
  };

  // Edition inline dans le champ principal
  const isEditMode  = !!editingId;
  const placeholder = replyTo
    ? `Répondre à ${getDisplayName(replyTo.author)}…`
    : 'Ajouter un commentaire…';
  const inputValue  = isEditMode ? editText : text;
  const onChangeInput = (v: string) => isEditMode ? setEditText(v) : setText(v);
  const canSend = isEditMode ? !!editText.trim() : !!text.trim();

  const handleSubmit = () => {
    if (isEditMode) saveEdit();
    else handleSend();
  };

  const cancelAction = () => {
    if (isEditMode) { setEditingId(null); setEditText(''); }
    else { setReplyTo(null); setText(''); }
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetWrap}>
        <View style={[st.sheet, { backgroundColor: colors.background }]}>
          {/* Handle */}
          <View style={st.handleRow}>
            <View style={[st.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={[st.header, { borderBottomColor: colors.border }]}>
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>
              Commentaires{comments.length > 0 ? ` (${comments.length})` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="x" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Liste */}
          {loading ? (
            <View style={st.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : comments.length === 0 ? (
            <View style={st.center}>
              <Icon name="message-circle" size={38} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, marginTop: 8, fontSize: 14 }}>Soyez le premier à commenter</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={c => c.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
              renderItem={({ item }) => (
                <CommentRow
                  item={item}
                  colors={colors}
                  currentUserId={myId ?? ''}
                  onReply={c => { setReplyTo(c); setEditingId(null); setTimeout(() => inputRef.current?.focus(), 100); }}
                  onToggleReplies={toggleReplies}
                  onLike={(c, type) => handleReaction(c, type)}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                />
              )}
            />
          )}

          {/* Bannière contexte (répondre / modifier) */}
          {(replyTo || isEditMode) && (
            <View style={[st.contextBanner, { backgroundColor: colors.primary + '14', borderTopColor: colors.primary + '30' }]}>
              <Icon name={isEditMode ? 'edit-2' : 'corner-down-right'} size={14} color={colors.primary} />
              <Text style={[st.contextText, { color: colors.primary }]} numberOfLines={1}>
                {isEditMode
                  ? 'Modification en cours…'
                  : `Réponse à ${getDisplayName(replyTo!.author)}`}
              </Text>
              <TouchableOpacity onPress={cancelAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="x" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Input */}
          <View style={[st.inputRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              ref={inputRef}
              style={[st.input, {
                color: colors.textPrimary,
                backgroundColor: colors.surfaceElevated ?? colors.surface,
                borderColor: (replyTo || isEditMode) ? colors.primary : colors.border,
              }]}
              placeholder={placeholder}
              placeholderTextColor={colors.textTertiary}
              value={inputValue}
              onChangeText={onChangeInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSend || sending || editSaving}
              style={[st.sendBtn, { backgroundColor: canSend ? colors.primary : (colors.surfaceElevated ?? colors.surface) }]}
              activeOpacity={0.8}
            >
              {(sending || editSaving)
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name={isEditMode ? 'check' : 'send'} size={18} color={canSend ? '#fff' : colors.textTertiary} />
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: SCREEN_H * 0.25,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_HEIGHT,
  },
  sheet: {
    flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden',
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:    { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  // Commentaire
  commentRow: {
    flexDirection: 'row', gap: 10,
    paddingVertical: 10, paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent',
  },
  rowHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  authorName:  { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  timeText:    { fontSize: 11 },
  commentText: { fontSize: 13, lineHeight: 19 },
  editedTag:   { fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  badge:       { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  badgeText:   { fontSize: 10, fontWeight: '700' },

  // Actions sous le commentaire
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
  reactionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 16, borderWidth: 1, borderColor: 'transparent',
  },
  reactionCount: { fontSize: 12, fontWeight: '600' },
  replyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  replyBtnText:  { fontSize: 12, fontWeight: '600' },

  // Afficher réponses
  toggleReplies: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 2 },
  toggleLine:    { width: 20, height: 1 },
  toggleText:    { fontSize: 12, fontWeight: '700' },

  // Bannière contexte
  contextBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1,
  },
  contextText: { flex: 1, fontSize: 12, fontWeight: '600' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1, fontSize: 14, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9,
    maxHeight: 80, borderWidth: 1,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
});
