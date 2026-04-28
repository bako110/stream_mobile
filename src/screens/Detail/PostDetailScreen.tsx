import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Platform, Alert, Share, StatusBar, Modal, Dimensions,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService } from '../../services/postService';
import { CommentsBottomSheet } from '../../components/common/CommentsBottomSheet';
import type { Post } from '../../types/post';

interface Props {
  postId: string;
  onBack: () => void;
  onAuthorPress?: (userId: string) => void;
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
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent + '28', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: accent, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
};

export const PostDetailScreen: React.FC<Props> = ({ postId, onBack, onAuthorPress }) => {
  const { theme }       = useTheme();
  const { colors }      = theme;
  const { currentUser } = useUser();

  const [post,             setPost]             = useState<Post | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [liked,            setLiked]            = useState(false);
  const [likeCount,        setLikeCount]        = useState(0);
  const [commentCount,     setCommentCount]     = useState(0);
  const [commentsVisible,  setCommentsVisible]  = useState(false);
  const [imageFullscreen,  setImageFullscreen]  = useState(false);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

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

  useEffect(() => { loadPost(); }, []);

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
      await Share.share({ message: post?.body ? `${post.body}\n\nVia FoliX` : 'Via FoliX' });
    } catch { /* annulé */ }
  };

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

  const author = post.author;
  const name   = author?.display_name ?? author?.username ?? 'Utilisateur';

  return (
    <View style={[pd.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* ── Header fixe ── */}
      <View style={[pd.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[pd.headerTitle, { color: colors.textPrimary }]}>Post</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="share-2" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ backgroundColor: colors.surface }}>

          {/* ── Auteur ── */}
          <TouchableOpacity
            style={pd.authorRow}
            activeOpacity={0.8}
            onPress={() => author?.id && onAuthorPress?.(author.id)}
          >
            <Avatar uri={author?.avatar_url} initials={ini(name)} size={46} accent={colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
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
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={handleShare}>
              <Icon name="more-horizontal" size={22} color={colors.textTertiary} />
            </TouchableOpacity>
          </TouchableOpacity>

          {/* ── Feeling ── */}
          {post.feeling ? (
            <Text style={[pd.feeling, { color: colors.textSecondary }]}>
              😊 se sent <Text style={{ fontWeight: '700' }}>{post.feeling}</Text>
            </Text>
          ) : null}

          {/* ── Corps ── */}
          {post.body ? (
            <Text style={[pd.body, { color: colors.textPrimary }]}>{post.body}</Text>
          ) : null}

          {/* ── Image — tap → fullscreen ── */}
          {post.image_url ? (
            <TouchableOpacity activeOpacity={0.95} onPress={() => setImageFullscreen(true)}>
              <Image source={{ uri: post.image_url }} style={pd.postImage} resizeMode="cover" />
            </TouchableOpacity>
          ) : null}

          {/* ── Compteurs ── */}
          {(likeCount > 0 || commentCount > 0) && (
            <View style={[pd.countsRow, { borderColor: colors.divider }]}>
              {likeCount > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={[pd.likeIcon, { backgroundColor: '#E0389A' }]}>
                    <Icon name="heart" size={10} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>{likeCount}</Text>
                </View>
              )}
              {commentCount > 0 && (
                <Text style={{ fontSize: 14, color: colors.textSecondary, marginLeft: 'auto' }}>
                  {commentCount} commentaire{commentCount > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          )}

          {/* ── Barre sociale ── */}
          <View style={[pd.socialBar, { borderColor: colors.divider }]}>
            <TouchableOpacity style={pd.socialBtn} onPress={handleLike} activeOpacity={0.7}>
              <Animated.View style={heartStyle}>
                <Icon name="heart" size={21} color={liked ? '#E0389A' : colors.textSecondary} />
              </Animated.View>
              <Text style={[pd.socialBtnTxt, { color: liked ? '#E0389A' : colors.textSecondary }]}>J'aime</Text>
            </TouchableOpacity>

            <TouchableOpacity style={pd.socialBtn} onPress={() => setCommentsVisible(true)} activeOpacity={0.7}>
              <Icon name="message-circle" size={21} color={colors.textSecondary} />
              <Text style={[pd.socialBtnTxt, { color: colors.textSecondary }]}>Commenter</Text>
            </TouchableOpacity>

            <TouchableOpacity style={pd.socialBtn} onPress={handleShare} activeOpacity={0.7}>
              <Icon name="share-2" size={21} color={colors.textSecondary} />
              <Text style={[pd.socialBtnTxt, { color: colors.textSecondary }]}>Partager</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ── CommentsBottomSheet — même composant que ReelsScreen / FeedScreen ── */}
      <CommentsBottomSheet
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        postId={postId}
        onCommentAdded={() => setCommentCount(v => v + 1)}
        onCommentCountChange={delta => setCommentCount(v => Math.max(0, v + delta))}
      />

      {/* ── Image fullscreen ── */}
      {post.image_url && (
        <Modal
          visible={imageFullscreen}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setImageFullscreen(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={1}
            onPress={() => setImageFullscreen(false)}
          >
            <Image
              source={{ uri: post.image_url }}
              style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.85 }}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={{ position: 'absolute', top: 50, right: 16, padding: 8 }}
              onPress={() => setImageFullscreen(false)}
            >
              <Icon name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
};

const pd = StyleSheet.create({
  root:         { flex: 1, paddingTop: Platform.OS === 'ios' ? 44 : 0 },
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
});
