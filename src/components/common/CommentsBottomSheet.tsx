import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Image,
  Animated, Pressable, Dimensions, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { storage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../utils/constants';
import { useCommentsWebSocket } from '../../hooks/useCommentsWebSocket';
import type { CommentWsEvent } from '../../hooks/useCommentsWebSocket';
import { socialService } from '../../services';
import { VerifiedBadge } from './VerifiedBadge';
import { FolixLoader } from './FolixLoader';
import type { Comment } from '../../types';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.78;

interface Props {
  visible: boolean;
  onClose: () => void;
  reelId?: string;
  contentId?: string;
  concertId?: string;
  eventId?: string;
  postId?: string;
  onCommentAdded?: () => void;
  onCommentCountChange?: (delta: number) => void;
  onCountLoaded?: (count: number) => void;
}

interface CommentEx extends Comment {
  userReaction?: 'like' | 'dislike' | null;
  replies?: CommentEx[];
  repliesLoaded?: boolean;
  repliesLoading?: boolean;
  showReplies?: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getDisplayName(author: Comment['author']): string {
  return author?.display_name
    ?? (author?.first_name && author?.last_name
        ? `${author.first_name} ${author.last_name}`
        : author?.username ?? 'Utilisateur');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'maintenant';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}j`;
  // date complete apres 7 jours
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar: React.FC<{ author: Comment['author']; size?: number; color: string }> = ({
  author, size = 36, color,
}) => {
  const name = getDisplayName(author);
  const r = size / 2;
  if (author?.avatar_url) {
    return (
      <Image
        source={{ uri: author.avatar_url }}
        style={{ width: size, height: size, borderRadius: r, flexShrink: 0 }}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: r,
      backgroundColor: color, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>
        {name[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
};

// ─── LikeButton avec animation ────────────────────────────────────────────────

const LikeButton: React.FC<{
  liked: boolean;
  count: number;
  onPress: () => void;
  color: string;
}> = ({ liked, count, onPress, color }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.4, useNativeDriver: true, speed: 40 }),
      Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 40 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={st.likeBtn}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <MCIcon
          name={liked ? 'heart' : 'heart-outline'}
          size={24}
          color={liked ? '#E0389A' : color}
        />
      </Animated.View>
      {count > 0 && (
        <Text style={[st.likeCount, { color: liked ? '#E0389A' : color }]}>
          {formatCount(count)}
        </Text>
      )}
    </TouchableOpacity>
  );
};

// ─── CommentRow ───────────────────────────────────────────────────────────────

interface RowProps {
  item: CommentEx;
  colors: any;
  currentUserId?: string;
  isReply?: boolean;
  depth?: number;
  onReply: (comment: CommentEx) => void;
  onToggleReplies: (id: string) => void;
  onLike: (item: CommentEx) => void;
  onEdit: (item: CommentEx) => void;
  onDelete: (id: string) => void;
}

const CommentRow: React.FC<RowProps> = ({
  item, colors, currentUserId, isReply = false, depth = 0,
  onReply, onToggleReplies, onLike, onEdit, onDelete,
}) => {
  const [showFullDate, setShowFullDate] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 200, delay: depth * 30, useNativeDriver: true,
    }).start();
  }, []);

  const name = getDisplayName(item.author);
  const liked = item.userReaction === 'like';
  const isOwn = String(item.author?.id ?? item.user_id) === String(currentUserId);
  const replies = item.replies ?? [];
  const replyCount = item.reply_count ?? replies.length;

  const showMenu = () => {
    if (!isOwn) return;
    Alert.alert('Votre commentaire', undefined, [
      { text: 'Modifier', onPress: () => onEdit(item) },
      {
        text: 'Supprimer', style: 'destructive', onPress: () =>
          Alert.alert('Supprimer', 'Supprimer ce commentaire ?', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(item.id) },
          ]),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  return (
    <Animated.View style={[
      isReply ? { paddingLeft: 48 } : undefined,
      { opacity: fadeAnim },
    ]}>
      <View style={[
        st.commentRow,
        isReply && { paddingTop: 8 },
      ]}>
        {/* Thread line pour les replies */}
        {isReply && (
          <View style={[st.threadLine, { backgroundColor: colors.border }]} />
        )}

        <Avatar author={item.author} size={isReply ? 28 : 38} color={colors.primary} />

        <View style={{ flex: 1 }}>
          {/* En-tete */}
          <View style={st.rowHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, flexWrap: 'wrap' }}>
              <Text style={[st.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
                {name}
              </Text>
              {item.author?.is_verified && <VerifiedBadge size={13} />}
              {isOwn && (
                <View style={[st.ownerBadge, { backgroundColor: colors.primary + '22' }]}>
                  <Text style={[st.ownerBadgeText, { color: colors.primary }]}>Vous</Text>
                </View>
              )}
            </View>

            {/* Date cliquable pour afficher date complete */}
            <TouchableOpacity
              onPress={() => setShowFullDate(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[st.timeText, { color: colors.textTertiary }]}>
                {showFullDate ? formatFullDate(item.created_at) : formatDate(item.created_at)}
              </Text>
            </TouchableOpacity>

            {isOwn && (
              <TouchableOpacity onPress={showMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="more-horizontal" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Mention reply */}
          {isReply && item.parent_id && (
            <Text style={[st.replyMention, { color: colors.primary }]} numberOfLines={1}>
              @{item.author?.username ?? name}
            </Text>
          )}

          {/* Corps */}
          <Text style={[st.commentText, { color: colors.textPrimary }]}>
            {item.body}
          </Text>

          {item.is_edited && (
            <Text style={[st.editedTag, { color: colors.textTertiary }]}>modifie</Text>
          )}

          {/* Actions */}
          <View style={st.actions}>
            <LikeButton
              liked={liked}
              count={item.like_count ?? 0}
              onPress={() => onLike(item)}
              color={colors.textTertiary}
            />

            {!isReply && (
              <TouchableOpacity
                style={st.replyBtn}
                onPress={() => onReply(item)}
                activeOpacity={0.7}
              >
                <MCIcon name="comment-outline" size={22} color={colors.textTertiary} />
                <Text style={[st.replyBtnText, { color: colors.textTertiary }]}>
                  Repondre
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Toggle replies */}
          {!isReply && replyCount > 0 && (
            <TouchableOpacity
              style={st.toggleReplies}
              onPress={() => onToggleReplies(item.id)}
              activeOpacity={0.7}
            >
              <View style={[st.toggleLine, { backgroundColor: colors.border }]} />
              {item.repliesLoading ? (
                <FolixLoader variant="bar" color={colors.primary} />
              ) : (
                <>
                  <Icon
                    name={item.showReplies ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={[st.toggleText, { color: colors.primary }]}>
                    {item.showReplies
                      ? 'Masquer'
                      : `${replyCount} reponse${replyCount > 1 ? 's' : ''}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Replies inline */}
      {item.showReplies && replies.map(r => (
        <CommentRow
          key={r.id}
          item={r}
          colors={colors}
          currentUserId={currentUserId}
          isReply
          depth={depth + 1}
          onReply={onReply}
          onToggleReplies={onToggleReplies}
          onLike={onLike}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </Animated.View>
  );
};

// ─── CommentsBottomSheet ──────────────────────────────────────────────────────

export const CommentsBottomSheet: React.FC<Props> = ({
  visible, onClose, reelId, contentId, concertId, eventId, postId,
  onCommentAdded, onCommentCountChange, onCountLoaded,
}) => {
  const { theme }                    = useTheme();
  const { colors }                   = theme;
  const { currentUser, refreshUser } = useUser();

  const [myId, setMyId] = useState<string | null>(() =>
    currentUser?.id
      ? String(currentUser.id)
      : storage.getItem(STORAGE_KEYS.LAST_USER_ID) ?? null
  );

  useEffect(() => {
    if (currentUser?.id) setMyId(String(currentUser.id));
    else if (!myId) refreshUser().then(u => { if (u?.id) setMyId(String(u.id)); }).catch(() => {});
  }, [currentUser?.id]);

  const [comments,    setComments]    = useState<CommentEx[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,        setPage]        = useState(1);
  const [totalCount,  setTotalCount]  = useState(0);
  const [hasMore,     setHasMore]     = useState(false);
  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [replyTo,     setReplyTo]     = useState<CommentEx | null>(null);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editText,    setEditText]    = useState('');
  const [editSaving,  setEditSaving]  = useState(false);

  const inputRef  = useRef<TextInput>(null);
  const listRef   = useRef<FlatList>(null);
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const PAGE_LIMIT = 20;

  // Animation d'ouverture/fermeture
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true,
        damping: 20, stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT, duration: 250, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const targetParams = reelId    ? { reel_id:    reelId    }
                     : contentId ? { content_id: contentId }
                     : concertId ? { concert_id: concertId }
                     : eventId   ? { event_id:   eventId   }
                     : postId    ? { post_id:    postId    }
                     : null;

  const wsTargetType = reelId ? 'reel' : contentId ? 'content'
    : concertId ? 'concert' : eventId ? 'event' : postId ? 'post' : null;
  const wsTargetId = reelId ?? contentId ?? concertId ?? eventId ?? postId ?? null;

  // WebSocket
  const handleWsEvent = useCallback((event: CommentWsEvent) => {
    switch (event.type) {
      case 'comment_added':
        setComments(prev => {
          if (prev.some(c => c.id === event.comment.id)) return prev;
          onCommentCountChange?.(+1);
          setTotalCount(t => t + 1);
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
          if (wasRoot) { onCommentCountChange?.(-1); setTotalCount(t => Math.max(0, t - 1)); }
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

  useCommentsWebSocket({ targetType: wsTargetType as any, targetId: wsTargetId, enabled: visible, onEvent: handleWsEvent });

  // Chargement
  const fetchComments = useCallback(async () => {
    if (!targetParams) return;
    setLoading(true);
    setPage(1);
    try {
      const data = await socialService.getComments({ ...targetParams, page: 1, limit: PAGE_LIMIT });
      const mapped = data.map(c => ({ ...c, userReaction: null, replies: [], repliesLoaded: false, showReplies: false }));
      setComments(mapped);
      setHasMore(data.length === PAGE_LIMIT);
      const count = data.length;
      setTotalCount(count);
      if (count > 0) onCountLoaded?.(count);
    } catch { setComments([]); setHasMore(false); }
    finally { setLoading(false); }
  }, [reelId, contentId, concertId, eventId, postId]);

  const loadMore = useCallback(async () => {
    if (!targetParams || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const data = await socialService.getComments({ ...targetParams, page: nextPage, limit: PAGE_LIMIT });
      setComments(prev => {
        const ids = new Set(prev.map(c => c.id));
        const fresh = data.filter(c => !ids.has(c.id)).map(c => ({
          ...c, userReaction: null, replies: [], repliesLoaded: false, showReplies: false,
        }));
        return [...prev, ...fresh];
      });
      setPage(nextPage);
      setHasMore(data.length === PAGE_LIMIT);
    } catch { /* silent */ }
    finally { setLoadingMore(false); }
  }, [reelId, contentId, concertId, eventId, postId, loadingMore, hasMore, page]);

  useEffect(() => {
    if (visible) fetchComments();
    else { setReplyTo(null); setText(''); setEditingId(null); setEditText(''); }
  }, [visible]);

  // Toggle replies
  const toggleReplies = useCallback(async (commentId: string) => {
    setComments(prev => prev.map(c =>
      c.id !== commentId ? c :
      c.repliesLoaded ? { ...c, showReplies: !c.showReplies } :
      { ...c, repliesLoading: true, showReplies: true }
    ));
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

  // Envoyer
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
        setComments(prev => prev.map(c =>
          c.id !== replyTo.id ? c : {
            ...c,
            reply_count: (c.reply_count ?? 0) + 1,
            replies: [...(c.replies ?? []), { ...newComment, userReaction: null }],
            repliesLoaded: true,
            showReplies: true,
          }
        ));
        setReplyTo(null);
      } else {
        setComments(prev => {
          if (prev.some(c => c.id === newComment.id)) return prev;
          setTotalCount(t => t + 1);
          return [{ ...newComment, userReaction: null, replies: [], repliesLoaded: false }, ...prev];
        });
        onCommentAdded?.();
        setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
      }
      setText('');
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  // Reaction
  const handleReaction = useCallback((comment: CommentEx) => {
    const type = 'like';
    const update = (c: CommentEx): CommentEx => {
      if (c.id !== comment.id) return c;
      const isSame = c.userReaction === type;
      return {
        ...c,
        userReaction: isSame ? null : type,
        like_count: c.like_count + (isSame ? -1 : 1),
      };
    };
    setComments(prev => prev.map(p => ({
      ...update(p),
      replies: (p.replies ?? []).map(update),
    })));
    socialService.toggleReaction({ reaction_type: type, comment_id: comment.id }).catch(() => {});
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
        c.id === editingId
          ? { ...c, body: updated.body, is_edited: true }
          : { ...c, replies: (c.replies ?? []).map(apply) };
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
          ...c,
          replies: (c.replies ?? []).filter(r => r.id !== id),
          reply_count: (c.replies ?? []).some(r => r.id === id)
            ? (c.reply_count ?? 1) - 1 : c.reply_count,
        }))
      );
      setTotalCount(t => Math.max(0, t - 1));
    } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
  };

  const isEditMode = !!editingId;
  const placeholder = replyTo
    ? `Repondre a ${getDisplayName(replyTo.author)}…`
    : 'Ajouter un commentaire…';
  const inputValue    = isEditMode ? editText : text;
  const onChangeInput = (v: string) => isEditMode ? setEditText(v) : setText(v);
  const canSend       = isEditMode ? !!editText.trim() : !!text.trim();

  const handleSubmit = () => { if (isEditMode) saveEdit(); else handleSend(); };
  const cancelAction = () => {
    if (isEditMode) { setEditingId(null); setEditText(''); }
    else { setReplyTo(null); setText(''); }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={st.backdrop} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={st.kvWrap}
      >
        <Animated.View style={[
          st.sheet,
          { backgroundColor: colors.background, transform: [{ translateY: slideAnim }] },
        ]}>
          {/* Handle */}
          <View style={st.handleRow}>
            <View style={[st.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={[st.header, { borderBottomColor: colors.border }]}>
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>
              {totalCount > 0
                ? `${totalCount.toLocaleString('fr')} commentaire${totalCount > 1 ? 's' : ''}`
                : 'Commentaires'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="x" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Liste */}
          {loading ? (
            <View style={st.center}>
              <FolixLoader variant="bar" color={colors.primary} />
            </View>
          ) : comments.length === 0 ? (
            <View style={st.center}>
              <MCIcon name="comment-text-outline" size={56} color={colors.textTertiary} />
              <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Pas encore de commentaires</Text>
              <Text style={[st.emptySubtitle, { color: colors.textTertiary }]}>
                Soyez le premier a reagir
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={c => c.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={st.listContent}
              renderItem={({ item }) => (
                <CommentRow
                  item={item}
                  colors={colors}
                  currentUserId={myId ?? ''}
                  onReply={c => {
                    setReplyTo(c);
                    setEditingId(null);
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                  onToggleReplies={toggleReplies}
                  onLike={handleReaction}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                />
              )}
              ItemSeparatorComponent={() => (
                <View style={[st.separator, { backgroundColor: colors.border }]} />
              )}
              ListFooterComponent={hasMore ? (
                <TouchableOpacity
                  style={[st.loadMoreBtn, { borderColor: colors.border }]}
                  onPress={loadMore}
                  activeOpacity={0.7}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? <FolixLoader variant="bar" color={colors.primary} />
                    : <Text style={[st.loadMoreText, { color: colors.primary }]}>Voir plus de commentaires</Text>
                  }
                </TouchableOpacity>
              ) : null}
            />
          )}

          {/* Banniere contexte */}
          {(replyTo || isEditMode) && (
            <View style={[st.contextBanner, {
              backgroundColor: colors.primary + '12',
              borderTopColor: colors.primary + '25',
            }]}>
              <View style={[st.contextAccent, { backgroundColor: colors.primary }]} />
              <MCIcon
                name={isEditMode ? 'pencil-outline' : 'reply-outline'}
                size={20}
                color={colors.primary}
              />
              <Text style={[st.contextText, { color: colors.primary }]} numberOfLines={1}>
                {isEditMode
                  ? 'Modification en cours…'
                  : `Reponse a ${getDisplayName(replyTo!.author)}`}
              </Text>
              <TouchableOpacity onPress={cancelAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="x-circle" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Input */}
          <View style={[st.inputRow, {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }]}>
            <Avatar author={currentUser as any} size={32} color={colors.primary} />
            <View style={[st.inputWrap, {
              backgroundColor: colors.surfaceElevated ?? colors.surface,
              borderColor: (replyTo || isEditMode) ? colors.primary : colors.border,
            }]}>
              <TextInput
                ref={inputRef}
                style={[st.input, { color: colors.textPrimary }]}
                placeholder={placeholder}
                placeholderTextColor={colors.textTertiary}
                value={inputValue}
                onChangeText={onChangeInput}
                multiline
                maxLength={500}
              />
              {canSend && (
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={sending || editSaving}
                  style={[st.sendBtn, { backgroundColor: colors.primary }]}
                  activeOpacity={0.8}
                >
                  {(sending || editSaving)
                    ? <FolixLoader variant="bar" color="#fff" />
                    : isEditMode
                      ? <Icon name="check" size={20} color="#fff" />
                      : <MCIcon name="send" size={20} color="#fff" />
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kvWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_HEIGHT,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle:    { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle:    { fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptySubtitle: { fontSize: 13 },

  listContent: { paddingHorizontal: 14, paddingBottom: 8, paddingTop: 4 },

  // Commentaire
  commentRow: {
    flexDirection: 'row', gap: 10,
    paddingVertical: 12,
  },
  threadLine: {
    position: 'absolute', left: -24, top: 0, bottom: 0, width: 1.5,
  },
  rowHeader:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  authorName:     { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  timeText:       { fontSize: 11, flexShrink: 0 },
  commentText:    { fontSize: 14, lineHeight: 20 },
  editedTag:      { fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  replyMention:   { fontSize: 12, fontWeight: '600', marginBottom: 3 },
  ownerBadge:     { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  ownerBadgeText: { fontSize: 10, fontWeight: '700' },

  separator: { height: StyleSheet.hairlineWidth, marginLeft: 48 },

  // Actions
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 10 },
  likeBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeCount:  { fontSize: 14, fontWeight: '700' },
  replyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyBtnText: { fontSize: 13, fontWeight: '600' },

  toggleReplies: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  toggleLine:    { width: 28, height: 1.5 },
  toggleText:    { fontSize: 13, fontWeight: '700' },

  // Banniere contexte
  contextBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9,
    borderTopWidth: 1,
  },
  contextAccent: { width: 3, height: 20, borderRadius: 2 },
  contextText:   { flex: 1, fontSize: 12, fontWeight: '600' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    borderRadius: 22, borderWidth: 1,
    paddingLeft: 14, paddingRight: 6, paddingVertical: 6,
  },
  input: {
    flex: 1, fontSize: 14, lineHeight: 20,
    maxHeight: 90, paddingVertical: 2,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6,
  },
  loadMoreBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginVertical: 8,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700' },
});
