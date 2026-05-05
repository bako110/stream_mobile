import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, Platform, Alert, Share, StatusBar,
  Modal, Dimensions, TextInput, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService } from '../../services/postService';
import { socialService } from '../../services/socialService';
import type { Post } from '../../types/post';
import type { Comment } from '../../types';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_H = SCREEN_W * 0.55;
const HALF_H = GRID_H / 2 - 1;

interface ImageGridProps {
  urls: string[];
  onPressImage: (index: number) => void;
}

const ImageGrid: React.FC<ImageGridProps> = ({ urls, onPressImage }) => {
  const n = urls.length;
  if (n === 0) return null;

  if (n === 1) {
    return (
      <TouchableOpacity activeOpacity={0.95} onPress={() => onPressImage(0)}>
        <Image source={{ uri: urls[0] }} style={{ width: '100%', aspectRatio: 4 / 3 }} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  if (n === 2) {
    return (
      <View style={{ flexDirection: 'row', height: GRID_H }}>
        {urls.map((uri, i) => (
          <TouchableOpacity key={i} activeOpacity={0.95} style={{ flex: 1, marginLeft: i === 1 ? 2 : 0 }} onPress={() => onPressImage(i)}>
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (n === 3) {
    return (
      <View style={{ flexDirection: 'row', height: GRID_H }}>
        <TouchableOpacity activeOpacity={0.95} style={{ flex: 1 }} onPress={() => onPressImage(0)}>
          <Image source={{ uri: urls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 2 }}>
          {[1, 2].map(i => (
            <TouchableOpacity key={i} activeOpacity={0.95} style={{ flex: 1, marginTop: i === 2 ? 2 : 0 }} onPress={() => onPressImage(i)}>
              <Image source={{ uri: urls[i] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  const shown = urls.slice(0, 4);
  const extra = n - 4;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', height: GRID_H }}>
      {shown.map((uri, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.95}
          style={{ width: SCREEN_W / 2 - 1, height: HALF_H, marginLeft: i % 2 === 1 ? 2 : 0, marginTop: i >= 2 ? 2 : 0 }}
          onPress={() => onPressImage(i)}
        >
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          {i === 3 && extra > 0 && (
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>+{extra}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
};

interface Props {
  postId: string;
  onBack: () => void;
  onAuthorPress?: (userId: string) => void;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ini = (name: string) =>
  name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';

const Avatar: React.FC<{ uri?: string | null; initials: string; size: number; accent: string }> = ({ uri, initials, size, accent }) => {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent + '28', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ color: accent, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
};

// ── CommentItem ────────────────────────────────────────────────────────────────

interface CommentItemProps {
  comment: Comment;
  currentUserId?: string;
  colors: any;
  onReply: (comment: Comment) => void;
  onLike: (commentId: string, liked: boolean) => void;
  onEdit: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, currentUserId, colors, onReply, onLike, onEdit, onDelete }) => {
  const ca     = comment.author as any;
  const cName  = ca?.display_name ?? ca?.username ?? 'Utilisateur';
  const isOwn  = currentUserId && String((comment as any).user_id) === currentUserId;
  const [liked,      setLiked]      = useState(false);
  const [likeCount,  setLikeCount]  = useState((comment as any).like_count ?? 0);
  const [menuOpen,   setMenuOpen]   = useState(false);

  const handleLike = () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c: number) => newLiked ? c + 1 : Math.max(0, c - 1));
    onLike(comment.id, newLiked);
  };

  return (
    <View style={[s.commentRow, { backgroundColor: colors.surface }]}>
      <Avatar uri={ca?.avatar_url} initials={ini(cName)} size={36} accent={colors.primary} />
      <View style={{ flex: 1 }}>
        <View style={[s.bubble, { backgroundColor: colors.backgroundSecondary }]}>
          {/* Header bulle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[s.bubbleAuthor, { color: colors.textPrimary }]}>{cName}</Text>
            {isOwn && (
              <TouchableOpacity onPress={() => setMenuOpen(v => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Icon name="more-horizontal" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={[s.bubbleBody, { color: colors.textPrimary }]}>{comment.body}</Text>
          {(comment as any).is_edited && (
            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>modifié</Text>
          )}
        </View>

        {/* Menu modifier/supprimer */}
        {menuOpen && (
          <View style={[s.miniMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity style={s.miniMenuItem} onPress={() => { setMenuOpen(false); onEdit(comment); }}>
              <Icon name="edit-2" size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Modifier</Text>
            </TouchableOpacity>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            <TouchableOpacity style={s.miniMenuItem} onPress={() => { setMenuOpen(false); onDelete(comment.id); }}>
              <Icon name="trash-2" size={13} color="#EF4444" />
              <Text style={{ fontSize: 13, color: '#EF4444' }}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Actions sous bulle */}
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 4, paddingLeft: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.textTertiary }}>{timeAgo(comment.created_at)}</Text>
          <TouchableOpacity onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Icon name="heart" size={13} color={liked ? '#E0389A' : colors.textTertiary} />
            {likeCount > 0 && (
              <Text style={{ fontSize: 11, color: liked ? '#E0389A' : colors.textTertiary, fontWeight: '600' }}>{likeCount}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onReply(comment)}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary }}>Répondre</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ── PostDetailScreen ───────────────────────────────────────────────────────────

export const PostDetailScreen: React.FC<Props> = ({ postId, onBack, onAuthorPress }) => {
  const { theme }       = useTheme();
  const { colors }      = theme;
  const { currentUser } = useUser();
  const insets          = useSafeAreaInsets();

  const [post,         setPost]         = useState<Post | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const [comments,     setComments]     = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [commLoading,  setCommLoading]  = useState(false);
  const [body,         setBody]         = useState('');
  const [sending,      setSending]      = useState(false);
  const [imageFs,      setImageFs]      = useState(false);
  const [imageFsIdx,   setImageFsIdx]   = useState(0);

  // Édition commentaire
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editBody,       setEditBody]       = useState('');
  const [editSaving,     setEditSaving]     = useState(false);

  // Réponse à un commentaire
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const inputRef = useRef<TextInput>(null);
  const listRef  = useRef<FlatList>(null);

  const loadPost = useCallback(async () => {
    try {
      const res = await postService.getById(postId);
      setPost(res);
      setLiked(res.user_reaction === 'like');
      setLikeCount(res.like_count);
      setCommentCount(res.comment_count);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger le post.');
      onBack();
    } finally {
      setLoading(false);
    }
  }, [postId]);

  const loadComments = useCallback(async () => {
    setCommLoading(true);
    try {
      const data = await socialService.getComments({ post_id: postId, limit: 50 } as any);
      setComments(Array.isArray(data) ? data : []);
    } catch { setComments([]); }
    finally { setCommLoading(false); }
  }, [postId]);

  useEffect(() => { loadPost(); loadComments(); }, []);

  const handleLikePost = () => {
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
      await Share.share({ message: post?.body ? `${post.body}\n\nVia FoliX` : 'Via FoliX' });
    } catch { /* annulé */ }
  };

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    const text = body.trim();
    setBody('');
    setReplyTo(null);
    try {
      const payload: any = { post_id: postId, body: text };
      if (replyTo) payload.parent_id = replyTo.id;
      const newComment = await socialService.createComment(payload);
      setComments(prev => [...prev, newComment]);
      setCommentCount(v => v + 1);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setBody(text);
      Alert.alert('Erreur', 'Impossible d\'envoyer.');
    } finally {
      setSending(false);
    }
  };

  const handleLikeComment = (commentId: string, liked: boolean) => {
    socialService.toggleReaction({
      reaction_type: 'like' as any,
      comment_id: commentId,
    }).catch(() => { /* silencieux — UI déjà mise à jour */ });
  };

  const handleEditComment = (comment: Comment) => {
    setEditingComment(comment);
    setEditBody(comment.body);
  };

  const handleSaveEdit = async () => {
    if (!editingComment || !editBody.trim()) return;
    setEditSaving(true);
    try {
      const updated = await socialService.updateComment(editingComment.id, editBody.trim());
      setComments(prev => prev.map(c => c.id === editingComment.id ? { ...c, body: editBody.trim(), is_edited: true } as any : c));
      setEditingComment(null);
    } catch { Alert.alert('Erreur', 'Impossible de modifier.'); }
    finally { setEditSaving(false); }
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
            setCommentCount(v => Math.max(0, v - 1));
          } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
        },
      },
    ]);
  };

  const handleReply = (comment: Comment) => {
    const ca = comment.author as any;
    const name = ca?.display_name ?? ca?.username ?? 'Utilisateur';
    setReplyTo(comment);
    setBody(`@${name} `);
    inputRef.current?.focus();
  };

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Post</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!post) return null;

  const author     = post.author;
  const name       = author?.display_name ?? author?.username ?? 'Utilisateur';
  const meInitials = ini(currentUser?.display_name ?? currentUser?.username ?? '');

  const ListHeader = (
    <View>
      <View style={{ backgroundColor: colors.surface }}>
        {/* Auteur */}
        <TouchableOpacity style={s.authorRow} activeOpacity={0.8} onPress={() => author?.id && onAuthorPress?.(author.id)}>
          <Avatar uri={author?.avatar_url} initials={ini(name)} size={46} accent={colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[s.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
              {author?.is_verified && (
                <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={9} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Text style={[s.date, { color: colors.textTertiary }]}>{fullDate(post.created_at)}</Text>
              <Text style={{ color: colors.textTertiary }}>·</Text>
              <Icon name="globe" size={11} color={colors.textTertiary} />
            </View>
          </View>
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={handleShare}>
            <Icon name="more-horizontal" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
        </TouchableOpacity>

        {post.feeling ? (
          <Text style={[s.feeling, { color: colors.textSecondary }]}>
            😊 se sent <Text style={{ fontWeight: '700' }}>{post.feeling}</Text>
          </Text>
        ) : null}

        {post.body ? (
          <Text style={[s.body, { color: colors.textPrimary }]}>{post.body}</Text>
        ) : null}

        {(post.image_urls && post.image_urls.length > 0) ? (
          <ImageGrid urls={post.image_urls} onPressImage={i => { setImageFsIdx(i); setImageFs(true); }} />
        ) : post.image_url ? (
          <TouchableOpacity activeOpacity={0.95} onPress={() => { setImageFsIdx(0); setImageFs(true); }}>
            <Image source={{ uri: post.image_url }} style={s.postImage} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}

        {(likeCount > 0 || commentCount > 0) && (
          <View style={[s.countsRow, { borderColor: colors.divider }]}>
            {likeCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={[s.likeIcon, { backgroundColor: '#E0389A' }]}>
                  <Icon name="heart" size={10} color="#fff" />
                </View>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>{likeCount}</Text>
              </View>
            )}
            {commentCount > 0 && (
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 'auto' }}>
                {commentCount} commentaire{commentCount > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        )}

        <View style={[s.socialBar, { borderColor: colors.divider }]}>
          <TouchableOpacity style={s.socialBtn} onPress={handleLikePost} activeOpacity={0.7}>
            <Icon name="heart" size={20} color={liked ? '#E0389A' : colors.textSecondary} />
            <Text style={[s.socialBtnTxt, { color: liked ? '#E0389A' : colors.textSecondary }]}>J'aime</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.socialBtn} onPress={() => inputRef.current?.focus()} activeOpacity={0.7}>
            <Icon name="message-circle" size={20} color={colors.textSecondary} />
            <Text style={[s.socialBtnTxt, { color: colors.textSecondary }]}>Commenter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.socialBtn} onPress={handleShare} activeOpacity={0.7}>
            <Icon name="share-2" size={20} color={colors.textSecondary} />
            <Text style={[s.socialBtnTxt, { color: colors.textSecondary }]}>Partager</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 8, backgroundColor: colors.backgroundSecondary }} />

      {commLoading ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : comments.length === 0 ? (
        <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
          <Icon name="message-circle" size={36} color={colors.textTertiary} />
          <Text style={{ color: colors.textTertiary, fontSize: 14 }}>Soyez le premier à commenter</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Post</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="share-2" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Liste */}
      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <CommentItem
            comment={item}
            currentUserId={currentUser?.id}
            colors={colors}
            onReply={handleReply}
            onLike={handleLikeComment}
            onEdit={handleEditComment}
            onDelete={handleDeleteComment}
          />
        )}
      />

      {/* Bandeau réponse */}
      {replyTo && (
        <View style={[s.replyBanner, { backgroundColor: colors.primary + '18', borderTopColor: colors.primary + '44' }]}>
          <Icon name="corner-down-right" size={14} color={colors.primary} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.primary }} numberOfLines={1}>
            Réponse à <Text style={{ fontWeight: '700' }}>{(replyTo.author as any)?.display_name ?? (replyTo.author as any)?.username}</Text>
          </Text>
          <TouchableOpacity onPress={() => { setReplyTo(null); setBody(''); }}>
            <Icon name="x" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Saisie */}
      <View style={[s.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.divider, paddingBottom: insets.bottom || 12 }]}>
        <Avatar uri={currentUser?.avatar_url} initials={meInitials} size={34} accent={colors.primary} />
        <View style={[s.inputWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            style={[s.input, { color: colors.textPrimary }]}
            placeholder="Écrire un commentaire..."
            placeholderTextColor={colors.textTertiary}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={500}
          />
          <TouchableOpacity onPress={handleSend} disabled={!body.trim() || sending} style={{ opacity: body.trim() ? 1 : 0.4 }}>
            {sending
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Icon name="send" size={20} color={colors.primary} />
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal édition commentaire */}
      <Modal visible={!!editingComment} transparent animationType="slide" onRequestClose={() => setEditingComment(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>Modifier le commentaire</Text>
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              multiline
              autoFocus
              style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 10, padding: 12, fontSize: 15, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top' }}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                onPress={() => setEditingComment(null)}
              >
                <Text style={{ fontWeight: '600', color: colors.textSecondary }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 13, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', opacity: editSaving ? 0.6 : 1 }}
                onPress={handleSaveEdit}
                disabled={editSaving}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>{editSaving ? 'Envoi...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Image fullscreen */}
      {(() => {
        const allUrls = (post.image_urls && post.image_urls.length > 0) ? post.image_urls : post.image_url ? [post.image_url] : [];
        if (allUrls.length === 0) return null;
        return (
          <Modal visible={imageFs} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setImageFs(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: imageFsIdx * SCREEN_W, y: 0 }}
                style={{ flex: 1 }}
              >
                {allUrls.map((uri, i) => (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={1}
                    onPress={() => setImageFs(false)}
                    style={{ width: SCREEN_W, height: '100%', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Image
                      source={{ uri }}
                      style={{ width: SCREEN_W, height: Dimensions.get('window').height * 0.85 }}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={{ position: 'absolute', top: 50, right: 16, padding: 8 }} onPress={() => setImageFs(false)}>
                <Icon name="x" size={28} color="#fff" />
              </TouchableOpacity>
              {allUrls.length > 1 && (
                <View style={{ position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', gap: 6 }}>
                  {allUrls.map((_, i) => (
                    <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === imageFsIdx ? '#fff' : 'rgba(255,255,255,0.4)' }} />
                  ))}
                </View>
              )}
            </View>
          </Modal>
        );
      })()}
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  root:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  authorRow:    { flexDirection: 'row', alignItems: 'center', padding: 14 },
  authorName:   { fontSize: 15, fontWeight: '700' },
  date:         { fontSize: 12 },
  feeling:      { paddingHorizontal: 14, paddingBottom: 6, fontSize: 14 },
  body:         { paddingHorizontal: 14, paddingBottom: 12, fontSize: 16, lineHeight: 24 },
  postImage:    { width: '100%', aspectRatio: 4 / 3 },
  countsRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  likeIcon:     { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  socialBar:    { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  socialBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  socialBtnTxt: { fontSize: 14, fontWeight: '600' },
  commentRow:   { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'transparent' },
  bubble:       { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 1 },
  bubbleAuthor: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  bubbleBody:   { fontSize: 14, lineHeight: 20 },
  miniMenu:     { position: 'absolute', top: 28, right: 0, zIndex: 20, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', minWidth: 130, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },
  miniMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  replyBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
  inputBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  inputWrap:    { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  input:        { flex: 1, fontSize: 14, maxHeight: 100 },
});
