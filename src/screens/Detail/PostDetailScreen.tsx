import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, TextInput,
  Alert, Share, StatusBar, Modal, Dimensions,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService } from '../../services/postService';
import { socialService } from '../../services/socialService';
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
  if (diff < 604800) return `${Math.floor(diff / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
const Avatar: React.FC<{ uri?: string | null; initials: string; size: number; accent: string }> = ({ uri, initials, size, accent }) => {
  const r = size / 2;
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: r }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: accent + '28', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: accent, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
};

const ini = (name: string) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';

// ── Comment row ───────────────────────────────────────────────────────────────
const CommentRow: React.FC<{
  comment: CommentEx;
  myId: string;
  colors: any;
  onReply: (c: CommentEx) => void;
  onDelete: (id: string) => void;
  onLike: (c: CommentEx) => void;
  onToggleReplies: (c: CommentEx) => void;
  onAuthorPress?: (userId: string) => void;
  isReply?: boolean;
}> = ({ comment, myId, colors, onReply, onDelete, onLike, onToggleReplies, onAuthorPress, isReply }) => {
  const author = comment.author as any;
  const name   = author?.display_name ?? author?.username ?? 'Utilisateur';
  const isOwn  = myId && author?.id && myId === author.id;
  const avatarSize = isReply ? 28 : 36;

  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, paddingLeft: isReply ? 44 : 0 }}>
      <TouchableOpacity onPress={() => author?.id && onAuthorPress?.(author.id)} activeOpacity={0.8}>
        <Avatar uri={author?.avatar_url} initials={ini(name)} size={avatarSize} accent={colors.primary} />
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        {/* Bulle */}
        <View style={[pd.bubble, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[pd.cAuthor, { color: colors.textPrimary }]}>{name}</Text>
          <Text style={[pd.cBody, { color: colors.textPrimary }]}>{comment.body}</Text>
        </View>

        {/* Actions sous la bulle */}
        <View style={pd.cActions}>
          <Text style={[pd.cTime, { color: colors.textTertiary }]}>{timeAgo(comment.created_at)}</Text>
          <TouchableOpacity onPress={() => onLike(comment)}>
            <Text style={[pd.cActionBtn, { color: colors.textTertiary }]}>J'aime</Text>
          </TouchableOpacity>
          {!isReply && (
            <TouchableOpacity onPress={() => onReply(comment)}>
              <Text style={[pd.cActionBtn, { color: colors.textTertiary }]}>Répondre</Text>
            </TouchableOpacity>
          )}
          {isOwn && (
            <TouchableOpacity onPress={() => onDelete(comment.id)}>
              <Text style={[pd.cActionBtn, { color: '#EF4444' }]}>Supprimer</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Voir les réponses */}
        {!isReply && (comment.reply_count ?? 0) > 0 && (
          <TouchableOpacity style={{ marginTop: 4 }} onPress={() => onToggleReplies(comment)}>
            {comment.repliesLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ height: 1, width: 20, backgroundColor: colors.textTertiary, opacity: 0.4 }} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                  {comment.showReplies
                    ? 'Masquer les réponses'
                    : `Voir les ${comment.reply_count} réponse${(comment.reply_count ?? 0) > 1 ? 's' : ''}`}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Réponses imbriquées */}
        {comment.showReplies && (comment.replies ?? []).map(reply => (
          <CommentRow
            key={reply.id}
            comment={reply}
            myId={myId}
            colors={colors}
            onReply={onReply}
            onDelete={onDelete}
            onLike={onLike}
            onToggleReplies={onToggleReplies}
            onAuthorPress={onAuthorPress}
            isReply
          />
        ))}
      </View>
    </View>
  );
};

// ── Main screen ───────────────────────────────────────────────────────────────
export const PostDetailScreen: React.FC<Props> = ({ postId, onBack, onAuthorPress }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser } = useUser();
  const myId = currentUser?.id ?? '';

  const [post,        setPost]        = useState<Post | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [liked,       setLiked]       = useState(false);
  const [likeCount,   setLikeCount]   = useState(0);
  const [comments,    setComments]    = useState<CommentEx[]>([]);
  const [commLoading, setCommLoading] = useState(true);
  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [replyTo,     setReplyTo]     = useState<CommentEx | null>(null);
  const [imageFullscreen, setImageFullscreen] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  // ── Load ──
  const loadPost = useCallback(async () => {
    try {
      const res = await postService.getById(postId);
      setPost(res);
      setLiked(res.user_reaction === 'like');
      setLikeCount(res.like_count);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger le post.');
      onBack();
    } finally { setLoading(false); }
  }, [postId]);

  const loadComments = useCallback(async () => {
    setCommLoading(true);
    try {
      const data = await socialService.getComments({ post_id: postId });
      setComments(data.map((c: Comment) => ({ ...c, replies: [], repliesLoaded: false, showReplies: false })));
    } catch { setComments([]); }
    finally { setCommLoading(false); }
  }, [postId]);

  useEffect(() => { loadPost(); loadComments(); }, []);

  // ── Actions ──
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
    try { await Share.share({ message: post?.body ? `${post.body}\n\nVia FoliX` : 'Via FoliX' }); }
    catch { /* annulé */ }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setText('');
    try {
      const payload: any = { body: trimmed, post_id: postId };
      if (replyTo) payload.parent_id = replyTo.id;
      const created = await socialService.createComment(payload);
      if (replyTo) {
        setComments(prev => prev.map(c =>
          c.id === replyTo.id
            ? { ...c, replies: [...(c.replies ?? []), { ...created, replies: [] }], reply_count: (c.reply_count ?? 0) + 1, showReplies: true }
            : c,
        ));
        setReplyTo(null);
      } else {
        setComments(prev => [{ ...created, replies: [], repliesLoaded: false, showReplies: false }, ...prev]);
        setPost(p => p ? { ...p, comment_count: p.comment_count + 1 } : p);
      }
    } catch {
      setText(trimmed);
      Alert.alert('Erreur', 'Impossible d\'envoyer.');
    } finally { setSending(false); }
  };

  const handleDeleteComment = (id: string) => {
    Alert.alert('Supprimer', 'Supprimer ce commentaire ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await socialService.deleteComment(id);
            setComments(prev => prev.filter(c => c.id !== id));
            setPost(p => p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p);
          } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
        },
      },
    ]);
  };

  const handleLikeComment = async (c: CommentEx) => {
    try { await socialService.toggleReaction({ reaction_type: 'like', comment_id: c.id }); }
    catch { /* silencieux */ }
  };

  const handleToggleReplies = async (comment: CommentEx) => {
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

  const handleReply = (c: CommentEx) => {
    setReplyTo(c);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={[pd.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
        <View style={[pd.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[pd.headerTitle, { color: colors.textPrimary }]}>Post</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!post) return null;

  const author   = post.author;
  const name     = author?.display_name ?? author?.username ?? 'Utilisateur';
  const isOwn    = !!(myId && author?.id && myId === author.id);

  // ── Header du post (section ListHeaderComponent) ──
  const PostHeader = (
    <View>
      {/* ── Post card ── */}
      <View style={{ backgroundColor: colors.surface }}>

        {/* Auteur */}
        <View style={pd.authorRow}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
            activeOpacity={0.8}
            onPress={() => author?.id && onAuthorPress?.(author.id)}
          >
            <Avatar uri={author?.avatar_url} initials={ini(name)} size={46} accent={colors.primary} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[pd.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
                {author?.is_verified && (
                  <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={9} color="#fff" />
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <Text style={[pd.date, { color: colors.textTertiary }]}>{fullDate(post.created_at)}</Text>
                <Text style={{ color: colors.textTertiary }}>·</Text>
                <Icon name="globe" size={11} color={colors.textTertiary} />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={handleShare}>
            <Icon name="more-horizontal" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Feeling */}
        {post.feeling ? (
          <Text style={[pd.feeling, { color: colors.textSecondary }]}>
            😊 se sent <Text style={{ fontWeight: '700' }}>{post.feeling}</Text>
          </Text>
        ) : null}

        {/* Body */}
        {post.body ? (
          <Text style={[pd.body, { color: colors.textPrimary }]}>{post.body}</Text>
        ) : null}

        {/* Image pleine largeur — tap pour fullscreen */}
        {post.image_url ? (
          <TouchableOpacity activeOpacity={0.95} onPress={() => setImageFullscreen(true)}>
            <Image source={{ uri: post.image_url }} style={pd.postImage} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}

        {/* Compteurs like + commentaires */}
        {(likeCount > 0 || post.comment_count > 0) && (
          <View style={[pd.countsRow, { borderColor: colors.divider }]}>
            {likeCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={[pd.likeIcon, { backgroundColor: '#E0389A' }]}>
                  <Icon name="heart" size={10} color="#fff" />
                </View>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>{likeCount}</Text>
              </View>
            )}
            {post.comment_count > 0 && (
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginLeft: 'auto' }}>
                {post.comment_count} commentaire{post.comment_count > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        )}

        {/* Barre sociale */}
        <View style={[pd.socialBar, { borderColor: colors.divider }]}>
          <TouchableOpacity style={pd.socialBtn} onPress={handleLike} activeOpacity={0.7}>
            <Animated.View style={heartStyle}>
              <Icon name="heart" size={21} color={liked ? '#E0389A' : colors.textSecondary} />
            </Animated.View>
            <Text style={[pd.socialBtnTxt, { color: liked ? '#E0389A' : colors.textSecondary }]}>J'aime</Text>
          </TouchableOpacity>

          <TouchableOpacity style={pd.socialBtn} onPress={() => inputRef.current?.focus()} activeOpacity={0.7}>
            <Icon name="message-circle" size={21} color={colors.textSecondary} />
            <Text style={[pd.socialBtnTxt, { color: colors.textSecondary }]}>Commenter</Text>
          </TouchableOpacity>

          <TouchableOpacity style={pd.socialBtn} onPress={handleShare} activeOpacity={0.7}>
            <Icon name="share-2" size={21} color={colors.textSecondary} />
            <Text style={[pd.socialBtnTxt, { color: colors.textSecondary }]}>Partager</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Séparateur commentaires ── */}
      <View style={{ height: 8, backgroundColor: colors.backgroundSecondary }} />
      <View style={[pd.commentsHeader, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <Text style={[pd.commentsTitle, { color: colors.textPrimary }]}>Commentaires</Text>
        {commLoading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {!commLoading && comments.length === 0 && (
        <View style={[pd.emptyComments, { backgroundColor: colors.surface }]}>
          <Icon name="message-circle" size={40} color={colors.textTertiary} />
          <Text style={{ color: colors.textTertiary, fontSize: 14, marginTop: 8 }}>Soyez le premier à commenter</Text>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[pd.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Header fixe */}
      <View style={[pd.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[pd.headerTitle, { color: colors.textPrimary }]}>Post</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="share-2" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* FlatList = post + commentaires scrollables ensemble */}
      <FlatList
        data={comments}
        keyExtractor={item => item.id}
        ListHeaderComponent={PostHeader}
        contentContainerStyle={{ paddingBottom: 16, backgroundColor: colors.surface }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.surface, paddingHorizontal: 14, paddingTop: 10 }}>
            <CommentRow
              comment={item}
              myId={myId}
              colors={colors}
              onReply={handleReply}
              onDelete={handleDeleteComment}
              onLike={handleLikeComment}
              onToggleReplies={handleToggleReplies}
              onAuthorPress={onAuthorPress}
            />
          </View>
        )}
      />

      {/* ── Image fullscreen ── */}
      {post.image_url && (
        <Modal visible={imageFullscreen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setImageFullscreen(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }} activeOpacity={1} onPress={() => setImageFullscreen(false)}>
            <Image
              source={{ uri: post.image_url }}
              style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.85 }}
              resizeMode="contain"
            />
            <TouchableOpacity style={{ position: 'absolute', top: 50, right: 16 }} onPress={() => setImageFullscreen(false)}>
              <Icon name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── Composer fixe en bas ── */}
      <View style={[pd.composer, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
        {replyTo && (
          <View style={[pd.replyBanner, { backgroundColor: colors.primary + '12', borderLeftColor: colors.primary }]}>
            <Icon name="corner-down-right" size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 12, flex: 1 }} numberOfLines={1}>
              Réponse à <Text style={{ fontWeight: '700' }}>
                {(replyTo.author as any)?.display_name ?? (replyTo.author as any)?.username}
              </Text>
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="x" size={15} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={pd.composerRow}>
          <Avatar
            uri={currentUser?.avatar_url}
            initials={ini(currentUser?.display_name ?? currentUser?.username ?? '?')}
            size={34}
            accent={colors.primary}
          />
          <TextInput
            ref={inputRef}
            style={[pd.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
            placeholder={replyTo ? `Répondre à ${(replyTo.author as any)?.display_name ?? '...'}` : 'Écrire un commentaire...'}
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[pd.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.primary + '40' }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Icon name="send" size={15} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const pd = StyleSheet.create({
  root:          { flex: 1, paddingTop: Platform.OS === 'ios' ? 44 : 0 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:   { fontSize: 17, fontWeight: '700' },

  // Post
  authorRow:     { flexDirection: 'row', alignItems: 'center', padding: 14 },
  authorName:    { fontSize: 15, fontWeight: '700' },
  date:          { fontSize: 12 },
  feeling:       { paddingHorizontal: 14, paddingBottom: 6, fontSize: 14 },
  body:          { paddingHorizontal: 14, paddingBottom: 12, fontSize: 16, lineHeight: 24 },
  postImage:     { width: '100%', aspectRatio: 4 / 3 },
  countsRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  likeIcon:      { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  socialBar:     { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  socialBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  socialBtnTxt:  { fontSize: 14, fontWeight: '600' },

  // Comments
  commentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  commentsTitle:  { fontSize: 15, fontWeight: '700' },
  emptyComments:  { alignItems: 'center', paddingVertical: 40 },

  // Comment row
  bubble:        { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start', maxWidth: '95%' },
  cAuthor:       { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  cBody:         { fontSize: 14, lineHeight: 20 },
  cActions:      { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 5, paddingLeft: 4 },
  cTime:         { fontSize: 12 },
  cActionBtn:    { fontSize: 12, fontWeight: '700' },

  // Composer
  composer:      { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: Platform.OS === 'ios' ? 28 : 8 },
  replyBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3 },
  composerRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  input:         { flex: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, maxHeight: 100 },
  sendBtn:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
});
