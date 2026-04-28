import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, TextInput,
  Alert, Share, StatusBar, RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { storage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../utils/constants';
import { postService } from '../../services/postService';
import { socialService } from '../../services/socialService';
import { VerifiedBadge } from '../../components/common/VerifiedBadge';
import { AvatarWithBadge } from '../../components/common/AvatarWithBadge';
import type { Post } from '../../types/post';
import type { Comment } from '../../types';

interface Props {
  postId: string;
  onBack: () => void;
  onAuthorPress?: (userId: string) => void;
}

interface CommentEx extends Comment {
  replies?: CommentEx[];
  showReplies?: boolean;
  repliesLoaded?: boolean;
  repliesLoading?: boolean;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const PostDetailScreen: React.FC<Props> = ({ postId, onBack, onAuthorPress }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser } = useUser();

  const myId = storage.getItem(STORAGE_KEYS.LAST_USER_ID) ?? currentUser?.id ?? '';

  const [post,         setPost]         = useState<Post | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const [comments,     setComments]     = useState<CommentEx[]>([]);
  const [commLoading,  setCommLoading]  = useState(true);
  const [commentText,  setCommentText]  = useState('');
  const [sending,      setSending]      = useState(false);
  const [replyTo,      setReplyTo]      = useState<CommentEx | null>(null);
  const inputRef = useRef<TextInput>(null);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const loadPost = useCallback(async () => {
    try {
      // postService.getFeed ne retourne pas un post unique — on charge le feed et on filtre
      // ou on utilise un endpoint byId si disponible. Pour l'instant on reconstruit depuis le feed.
      // (Le backend a GET /posts/{post_id} dans le router posts)
      const res = await postService.getById(postId);
      setPost(res);
      setLiked(res.user_reaction === 'like');
      setLikeCount(res.like_count);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger le post.');
      onBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [postId]);

  const loadComments = useCallback(async () => {
    setCommLoading(true);
    try {
      const data = await socialService.getComments({ post_id: postId });
      setComments(data.map((c: Comment) => ({
        ...c, replies: [], repliesLoaded: false, showReplies: false,
      })));
    } catch { setComments([]); }
    finally { setCommLoading(false); }
  }, [postId]);

  useEffect(() => { loadPost(); loadComments(); }, []);

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 6 }), withSpring(1));
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    postService.react(postId, 'like').catch(() => {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    });
  };

  const handleShare = async () => {
    try {
      const msg = post?.body ? `${post.body}\n\nVia FoliX` : 'Via FoliX';
      await Share.share({ message: msg });
    } catch { /* annulé */ }
  };

  const handleSend = async () => {
    if (!commentText.trim()) return;
    setSending(true);
    const text = commentText.trim();
    setCommentText('');
    try {
      const payload: any = { body: text, post_id: postId };
      if (replyTo) payload.parent_id = replyTo.id;
      const created = await socialService.createComment(payload);
      if (replyTo) {
        setComments(prev => prev.map(c =>
          c.id === replyTo.id
            ? { ...c, replies: [...(c.replies ?? []), { ...created, replies: [] }] }
            : c,
        ));
        setReplyTo(null);
      } else {
        setComments(prev => [{ ...created, replies: [], repliesLoaded: false, showReplies: false }, ...prev]);
        if (post) setPost({ ...post, comment_count: post.comment_count + 1 });
      }
    } catch {
      setCommentText(text);
      Alert.alert('Erreur', 'Impossible d\'envoyer le commentaire.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert('Supprimer', 'Supprimer ce commentaire ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await socialService.deleteComment(commentId);
            setComments(prev => prev.filter(c => c.id !== commentId));
            if (post) setPost({ ...post, comment_count: Math.max(0, post.comment_count - 1) });
          } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
        },
      },
    ]);
  };

  const handleLikeComment = async (comment: CommentEx) => {
    try {
      await socialService.toggleReaction({ reaction_type: 'like', comment_id: comment.id });
    } catch { /* silencieux */ }
  };

  const loadReplies = async (comment: CommentEx) => {
    if (comment.repliesLoaded) {
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, showReplies: !c.showReplies } : c));
      return;
    }
    setComments(prev => prev.map(c => c.id === comment.id ? { ...c, repliesLoading: true } : c));
    try {
      const replies = await socialService.getReplies(comment.id);
      setComments(prev => prev.map(c =>
        c.id === comment.id
          ? { ...c, replies: replies.map((r: Comment) => ({ ...r, replies: [] })), repliesLoaded: true, repliesLoading: false, showReplies: true }
          : c,
      ));
    } catch {
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, repliesLoading: false } : c));
    }
  };

  if (loading) {
    return (
      <View style={[d.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={[d.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[d.headerTitle, { color: colors.textPrimary }]}>Post</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!post) return null;

  const author = post.author;
  const name   = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials = name[0]?.toUpperCase() ?? '?';
  const isOwn = !!(myId && author?.id && myId === author.id);

  return (
    <KeyboardAvoidingView
      style={[d.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Header ── */}
      <View style={[d.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[d.headerTitle, { color: colors.textPrimary }]}>Post</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="share-2" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadPost(); loadComments(); }}
            tintColor={colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Post card ── */}
        <View style={[d.postCard, { backgroundColor: colors.surface }]}>
          {/* Author */}
          <TouchableOpacity
            style={d.authorRow}
            activeOpacity={0.7}
            onPress={() => author?.id && onAuthorPress?.(author.id)}
          >
            <AvatarWithBadge
              avatarUrl={author?.avatar_url ?? null}
              initials={initials}
              size={44}
              accentColor={colors.primary}
              isVerified={!!author?.is_verified}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[d.authorName, { color: colors.textPrimary }]}>{name}</Text>
                {author?.is_verified && <VerifiedBadge size={14} />}
              </View>
              <Text style={[d.date, { color: colors.textTertiary }]}>{formatDate(post.created_at)}</Text>
            </View>
          </TouchableOpacity>

          {/* Feeling */}
          {post.feeling ? (
            <Text style={[d.feeling, { color: colors.textSecondary }]}>
              se sent <Text style={{ fontWeight: '700' }}>{post.feeling}</Text>
            </Text>
          ) : null}

          {/* Body */}
          {post.body ? (
            <Text style={[d.body, { color: colors.textPrimary }]}>{post.body}</Text>
          ) : null}

          {/* Image */}
          {post.image_url ? (
            <Image source={{ uri: post.image_url }} style={d.image} resizeMode="cover" />
          ) : null}

          {/* Counts */}
          {(likeCount > 0 || post.comment_count > 0) && (
            <View style={[d.countsRow, { borderBottomColor: colors.divider }]}>
              {likeCount > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#E0389A', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="heart" size={11} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 13, color: colors.textTertiary }}>{likeCount}</Text>
                </View>
              )}
              {post.comment_count > 0 && (
                <Text style={{ fontSize: 13, color: colors.textTertiary, marginLeft: 'auto' }}>
                  {post.comment_count} commentaire{post.comment_count > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          )}

          {/* Social bar */}
          <View style={[d.socialBar, { borderTopColor: colors.divider }]}>
            <TouchableOpacity style={d.socialBtn} onPress={handleLike} activeOpacity={0.8}>
              <Animated.View style={heartStyle}>
                <Icon name="heart" size={20} color={liked ? '#E0389A' : colors.textTertiary} />
              </Animated.View>
              <Text style={[d.socialBtnText, { color: liked ? '#E0389A' : colors.textTertiary }]}>
                {liked ? 'J\'aime' : 'J\'aime'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={d.socialBtn}
              onPress={() => { inputRef.current?.focus(); }}
              activeOpacity={0.8}
            >
              <Icon name="message-circle" size={20} color={colors.textTertiary} />
              <Text style={[d.socialBtnText, { color: colors.textTertiary }]}>Commenter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={d.socialBtn} onPress={handleShare} activeOpacity={0.8}>
              <Icon name="share-2" size={20} color={colors.textTertiary} />
              <Text style={[d.socialBtnText, { color: colors.textTertiary }]}>Partager</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Comments section ── */}
        <View style={{ marginTop: 8 }}>
          <Text style={[d.commentsTitle, { color: colors.textPrimary, borderBottomColor: colors.divider }]}>
            Commentaires
          </Text>

          {commLoading ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : comments.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
              <Icon name="message-circle" size={36} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: 14 }}>Soyez le premier à commenter</Text>
            </View>
          ) : (
            comments.map(comment => {
              const cAuthor = comment.author;
              const cName = (cAuthor as any)?.display_name ?? (cAuthor as any)?.username ?? 'Utilisateur';
              const cInitials = cName[0]?.toUpperCase() ?? '?';
              const isOwnComment = myId && (cAuthor as any)?.id && myId === (cAuthor as any)?.id;

              return (
                <View key={comment.id} style={[d.commentItem, { borderBottomColor: colors.divider }]}>
                  <TouchableOpacity onPress={() => (cAuthor as any)?.id && onAuthorPress?.((cAuthor as any).id)}>
                    {(cAuthor as any)?.avatar_url ? (
                      <Image source={{ uri: (cAuthor as any).avatar_url }} style={d.commentAvatar} />
                    ) : (
                      <View style={[d.commentAvatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{cInitials}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <View style={[d.commentBubble, { backgroundColor: colors.backgroundSecondary }]}>
                      <Text style={[d.commentAuthor, { color: colors.textPrimary }]}>{cName}</Text>
                      <Text style={[d.commentBody, { color: colors.textPrimary }]}>{comment.body}</Text>
                    </View>

                    <View style={d.commentActions}>
                      <Text style={[d.commentTime, { color: colors.textTertiary }]}>{timeAgo(comment.created_at)}</Text>
                      <TouchableOpacity onPress={() => handleLikeComment(comment)}>
                        <Text style={[d.commentActionBtn, { color: colors.textTertiary }]}>J'aime</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setReplyTo(comment); inputRef.current?.focus(); }}>
                        <Text style={[d.commentActionBtn, { color: colors.textTertiary }]}>Répondre</Text>
                      </TouchableOpacity>
                      {isOwnComment && (
                        <TouchableOpacity onPress={() => handleDeleteComment(comment.id)}>
                          <Text style={[d.commentActionBtn, { color: '#EF4444' }]}>Supprimer</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Replies toggle */}
                    {(comment.reply_count ?? 0) > 0 && (
                      <TouchableOpacity
                        style={d.repliesBtn}
                        onPress={() => loadReplies(comment)}
                      >
                        {comment.repliesLoading ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                            {comment.showReplies ? 'Masquer les réponses' : `Voir ${comment.reply_count} réponse${(comment.reply_count ?? 0) > 1 ? 's' : ''}`}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {/* Replies */}
                    {comment.showReplies && (comment.replies ?? []).map(reply => {
                      const rAuthor = reply.author;
                      const rName = (rAuthor as any)?.display_name ?? (rAuthor as any)?.username ?? 'Utilisateur';
                      const rInitials = rName[0]?.toUpperCase() ?? '?';
                      return (
                        <View key={reply.id} style={d.replyRow}>
                          {(rAuthor as any)?.avatar_url ? (
                            <Image source={{ uri: (rAuthor as any).avatar_url }} style={d.replyAvatar} />
                          ) : (
                            <View style={[d.replyAvatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
                              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>{rInitials}</Text>
                            </View>
                          )}
                          <View style={[d.commentBubble, { backgroundColor: colors.backgroundSecondary, flex: 1 }]}>
                            <Text style={[d.commentAuthor, { color: colors.textPrimary }]}>{rName}</Text>
                            <Text style={[d.commentBody, { color: colors.textPrimary }]}>{reply.body}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── Composer ── */}
      <View style={[d.composer, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
        {replyTo && (
          <View style={[d.replyBanner, { backgroundColor: colors.primary + '15', borderLeftColor: colors.primary }]}>
            <Text style={{ color: colors.primary, fontSize: 12, flex: 1 }} numberOfLines={1}>
              Réponse à <Text style={{ fontWeight: '700' }}>{(replyTo.author as any)?.display_name ?? (replyTo.author as any)?.username}</Text> : {replyTo.body}
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Icon name="x" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}
        <View style={d.composerRow}>
          {currentUser?.avatar_url ? (
            <Image source={{ uri: currentUser.avatar_url }} style={d.composerAvatar} />
          ) : (
            <View style={[d.composerAvatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                {(currentUser?.display_name ?? currentUser?.username ?? '?')[0]?.toUpperCase()}
              </Text>
            </View>
          )}
          <TextInput
            ref={inputRef}
            style={[d.composerInput, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
            placeholder="Écrire un commentaire..."
            placeholderTextColor={colors.textTertiary}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[d.sendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.primary + '44' }]}
            onPress={handleSend}
            disabled={!commentText.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Icon name="send" size={16} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const d = StyleSheet.create({
  root:          { flex: 1, paddingTop: Platform.OS === 'ios' ? 44 : 0 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:   { fontSize: 17, fontWeight: '700' },
  postCard:      { paddingBottom: 0 },
  authorRow:     { flexDirection: 'row', alignItems: 'center', padding: 14 },
  authorName:    { fontSize: 15, fontWeight: '700' },
  date:          { fontSize: 12, marginTop: 2 },
  feeling:       { paddingHorizontal: 14, paddingBottom: 8, fontSize: 14, fontStyle: 'italic' },
  body:          { paddingHorizontal: 14, paddingBottom: 12, fontSize: 16, lineHeight: 24 },
  image:         { width: '100%', aspectRatio: 16 / 9 },
  countsRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  socialBar:     { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  socialBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  socialBtnText: { fontSize: 13, fontWeight: '600' },
  commentsTitle: { fontSize: 15, fontWeight: '700', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  commentItem:   { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', flexShrink: 0 },
  commentBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  commentAuthor: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  commentBody:   { fontSize: 14, lineHeight: 20 },
  commentActions:{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingLeft: 4 },
  commentTime:   { fontSize: 12 },
  commentActionBtn: { fontSize: 12, fontWeight: '600' },
  repliesBtn:    { paddingLeft: 4, marginTop: 4 },
  replyRow:      { flexDirection: 'row', gap: 8, marginTop: 8, paddingLeft: 16 },
  replyAvatar:   { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', flexShrink: 0 },
  composer:      { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: Platform.OS === 'ios' ? 28 : 8 },
  replyBanner:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3, gap: 8 },
  composerRow:   { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  composerAvatar:{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', flexShrink: 0, marginBottom: 4 },
  composerInput: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 },
});
