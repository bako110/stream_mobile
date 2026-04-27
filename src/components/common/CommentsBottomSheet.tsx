import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Image,
  ActivityIndicator, Dimensions, Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { socialService } from '../../services';
import { VerifiedBadge } from './VerifiedBadge';
import type { Comment } from '../../types';

const { height: SCREEN_H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  reelId?: string;
  contentId?: string;
  concertId?: string;
  eventId?: string;
  onCommentAdded?: () => void;
}

interface CommentWithReaction extends Comment {
  userReaction?: 'like' | 'dislike' | null;
}

export const CommentsBottomSheet: React.FC<Props> = ({
  visible, onClose, reelId, contentId, concertId, eventId, onCommentAdded,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [comments, setComments] = useState<CommentWithReaction[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);

  // Animation slide-up
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const targetParams = reelId     ? { reel_id:    reelId    }
                     : contentId  ? { content_id:  contentId  }
                     : concertId  ? { concert_id:  concertId  }
                     : eventId    ? { event_id:    eventId    }
                     : null;

  const fetchComments = useCallback(async () => {
    if (!targetParams) return;
    setLoading(true);
    try {
      const data = await socialService.getComments(targetParams);
      setComments(data.map(c => ({ ...c, userReaction: null })));
    } catch { setComments([]); }
    finally { setLoading(false); }
  }, [reelId, contentId, concertId, eventId]);

  useEffect(() => {
    if (visible) fetchComments();
  }, [visible, fetchComments]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending || !targetParams) return;
    setSending(true);
    try {
      const newComment = await socialService.createComment({ body, ...targetParams });
      setComments(prev => [{ ...newComment, userReaction: null }, ...prev]);
      setText('');
      onCommentAdded?.();
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  const handleReaction = async (comment: CommentWithReaction, type: 'like' | 'dislike') => {
    // Optimistic update
    setComments(prev => prev.map(c => {
      if (c.id !== comment.id) return c;
      const isSame = c.userReaction === type;
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
    }));
    try {
      await socialService.toggleReaction({ reaction_type: type, comment_id: comment.id });
    } catch {
      // Rollback
      setComments(prev => prev.map(c => c.id === comment.id ? comment : c));
    }
  };

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'maintenant';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}j`;
  };

  const renderComment = ({ item }: { item: CommentWithReaction }) => {
    const author = item.author;
    const name = author?.display_name
      ?? (author?.first_name && author?.last_name
          ? `${author.first_name} ${author.last_name}`
          : author?.username ?? 'Utilisateur');
    const initials = name[0]?.toUpperCase() ?? '?';
    const liked    = item.userReaction === 'like';
    const disliked = item.userReaction === 'dislike';

    return (
      <View style={[styles.commentRow, { borderBottomColor: colors.border }]}>
        {/* Avatar */}
        {author?.avatar_url ? (
          <Image source={{ uri: author.avatar_url }} style={[styles.avatar, { backgroundColor: colors.primary + '30' }]} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}

        {/* Corps */}
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>{name}</Text>
              {author?.is_verified && <VerifiedBadge size={13} />}
            </View>
            {author?.username ? (
              <Text style={[styles.authorHandle, { color: colors.textTertiary }]}>@{author.username}</Text>
            ) : null}
            <Text style={[styles.time, { color: colors.textTertiary }]}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={[styles.commentText, { color: colors.textSecondary }]}>{item.body}</Text>

          {/* Like / Dislike */}
          <View style={styles.reactions}>
            <TouchableOpacity
              style={[
                styles.reactionBtn,
                liked
                  ? { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                  : { backgroundColor: 'transparent', borderColor: colors.border },
              ]}
              onPress={() => handleReaction(item, 'like')}
              activeOpacity={0.7}
            >
              <Icon name="thumbs-up" size={14} color={liked ? colors.primary : colors.textTertiary} />
              {item.like_count > 0 && (
                <Text style={[styles.reactionCount, { color: liked ? colors.primary : colors.textTertiary }]}>
                  {item.like_count}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.reactionBtn,
                disliked
                  ? { backgroundColor: '#FF3B3020', borderColor: '#FF3B30' }
                  : { backgroundColor: 'transparent', borderColor: colors.border },
              ]}
              onPress={() => handleReaction(item, 'dislike')}
              activeOpacity={0.7}
            >
              <Icon name="thumbs-down" size={14} color={disliked ? '#FF3B30' : colors.textTertiary} />
              {(item.dislike_count ?? 0) > 0 && (
                <Text style={[styles.reactionCount, { color: disliked ? '#FF3B30' : colors.textTertiary }]}>
                  {item.dislike_count}
                </Text>
              )}
            </TouchableOpacity>
            {item.is_edited && (
              <Text style={[styles.editedTag, { color: colors.textTertiary }]}>modifié</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View
        style={[styles.sheetWrap, { transform: [{ translateY: slideAnim }] }]}
        pointerEvents="box-none"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, { backgroundColor: colors.background }]}
        >
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Commentaires{comments.length > 0 ? ` (${comments.length})` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="x" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Liste */}
          {loading ? (
            <View style={styles.centerWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.centerWrap}>
              <Icon name="message-circle" size={36} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Soyez le premier à commenter</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={c => c.id}
              renderItem={renderComment}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Input */}
          <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              style={[styles.input, {
                color: colors.textPrimary,
                backgroundColor: colors.surfaceElevated ?? colors.surface,
                borderColor: colors.border,
              }]}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor={colors.textTertiary}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!text.trim() || sending}
              style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.surfaceElevated ?? colors.surface }]}
              activeOpacity={0.7}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name="send" size={18} color={text.trim() ? '#fff' : colors.textTertiary} />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
  },
  sheet: {
    maxHeight: SCREEN_H * 0.72,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  centerWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 44, gap: 10 },
  emptyText: { fontSize: 14 },
  listContent: { paddingHorizontal: 14, paddingBottom: 8 },

  commentRow: {
    flexDirection: 'row', gap: 10, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    flexShrink: 0,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  commentBody: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 },
  authorName: { fontSize: 13, fontWeight: '700' },
  authorHandle: { fontSize: 12 },
  time: { fontSize: 11, marginLeft: 'auto' },
  commentText: { fontSize: 13, lineHeight: 18 },

  reactions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  reactionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: 'transparent', minWidth: 40,
  },
  reactionCount: { fontSize: 12, fontWeight: '600' },
  editedTag: { fontSize: 11, fontStyle: 'italic', marginLeft: 'auto' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
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
