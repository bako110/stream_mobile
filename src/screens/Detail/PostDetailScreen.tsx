import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, Alert, Share, StatusBar,
  Modal, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService } from '../../services/postService';
import { CommentsBottomSheet, PostCard } from '../../components/common';
import type { Post } from '../../types/post';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const GRID_H = SCREEN_W * 0.55;
const HALF_H = GRID_H / 2 - 1;

// ── ImageGrid ──────────────────────────────────────────────────────────────────

const ImageGrid: React.FC<{ urls: string[]; onPress: (i: number) => void }> = ({ urls, onPress }) => {
  const n = urls.length;
  if (n === 0) return null;
  if (n === 1) return (
    <TouchableOpacity activeOpacity={0.92} onPress={() => onPress(0)}>
      <Image source={{ uri: urls[0] }} style={{ width: '100%', aspectRatio: 4 / 3 }} resizeMode="cover" />
    </TouchableOpacity>
  );
  if (n === 2) return (
    <View style={{ flexDirection: 'row', height: GRID_H }}>
      {urls.map((uri, i) => (
        <TouchableOpacity key={i} activeOpacity={0.92} style={{ flex: 1, marginLeft: i === 1 ? 2 : 0 }} onPress={() => onPress(i)}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </TouchableOpacity>
      ))}
    </View>
  );
  if (n === 3) return (
    <View style={{ flexDirection: 'row', height: GRID_H }}>
      <TouchableOpacity activeOpacity={0.92} style={{ flex: 1 }} onPress={() => onPress(0)}>
        <Image source={{ uri: urls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </TouchableOpacity>
      <View style={{ flex: 1, marginLeft: 2 }}>
        {[1, 2].map(i => (
          <TouchableOpacity key={i} activeOpacity={0.92} style={{ flex: 1, marginTop: i === 2 ? 2 : 0 }} onPress={() => onPress(i)}>
            <Image source={{ uri: urls[i] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
  const shown = urls.slice(0, 4);
  const extra = n - 4;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', height: GRID_H }}>
      {shown.map((uri, i) => (
        <TouchableOpacity key={i} activeOpacity={0.92}
          style={{ width: SCREEN_W / 2 - 1, height: HALF_H, marginLeft: i % 2 === 1 ? 2 : 0, marginTop: i >= 2 ? 2 : 0 }}
          onPress={() => onPress(i)}>
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

// ── helpers ────────────────────────────────────────────────────────────────────

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── PostDetailScreen ───────────────────────────────────────────────────────────

interface Props {
  postId: string;
  onBack: () => void;
  onAuthorPress?: (userId: string) => void;
  navigation?: any;
}

export const PostDetailScreen: React.FC<Props> = ({ postId, onBack, onAuthorPress, navigation }) => {
  const { theme: { colors } } = useTheme();
  const { currentUser }       = useUser();
  const insets                = useSafeAreaInsets();

  const [post,         setPost]         = useState<Post | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [imageFs,      setImageFs]      = useState(false);
  const [imageFsIdx,   setImageFsIdx]   = useState(0);

  // Posts de l'auteur en dessous
  const [authorPosts,   setAuthorPosts]   = useState<Post[]>([]);
  const [authorPage,    setAuthorPage]    = useState(1);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [authorHasMore, setAuthorHasMore] = useState(true);
  const loadingRef = useRef(false);
  const authorIdRef = useRef<string | null>(null);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const myId = currentUser ? String(currentUser.id) : undefined;

  // ── Charger le post principal ──────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const res = await postService.getById(postId);
      setPost(res);
      setLiked(res.user_reaction === 'like');
      setLikeCount(res.like_count ?? 0);
      setCommentCount(res.comment_count ?? 0);

      // Lancer le chargement des posts de l'auteur dès qu'on a l'id
      if (res.author?.id) {
        authorIdRef.current = String(res.author.id);
        loadAuthorPosts(String(res.author.id), 1, true);
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de charger le post.');
      onBack();
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // ── Charger les posts de l'auteur (pagination) ─────────────────────────────

  const loadAuthorPosts = useCallback(async (authorId: string, page: number, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setAuthorLoading(true);
    try {
      const res = await postService.getByUser(authorId, page, 10);
      const filtered = res.filter(p => p.id !== postId);
      // Stopper la pagination si moins de 10 résultats (dernière page)
      if (res.length < 10) setAuthorHasMore(false);
      setAuthorPosts(prev => reset ? filtered : [...prev, ...filtered]);
      setAuthorPage(page + 1);
    } catch {
      // Sur toute erreur, stopper pour éviter la boucle infinie
      setAuthorHasMore(false);
    } finally {
      setAuthorLoading(false);
      loadingRef.current = false;
    }
  }, [postId]);

  useEffect(() => {
    // Reset quand on change de post
    setPost(null);
    setLoading(true);
    setAuthorPosts([]);
    setAuthorPage(1);
    setAuthorHasMore(true);
    authorIdRef.current = null;
    load();
  }, [postId]);

  const handleEndReached = useCallback(() => {
    // Ne paginer que si : pas en cours, encore des données, auteur connu, et au moins une page chargée
    if (!authorLoading && authorHasMore && authorIdRef.current && authorPage > 1) {
      loadAuthorPosts(authorIdRef.current, authorPage);
    }
  }, [authorLoading, authorHasMore, authorPage, loadAuthorPosts]);

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 6 }), withSpring(1));
    const next = !liked;
    setLiked(next);
    setLikeCount(c => next ? c + 1 : Math.max(0, c - 1));
    postService.react(postId, 'like').catch(() => {
      setLiked(!next);
      setLikeCount(c => next ? Math.max(0, c - 1) : c + 1);
    });
  };

  const handleShare = async () => {
    try { await Share.share({ message: post?.body ? `${post.body}\n\nVia FoliX` : 'Via FoliX' }); }
    catch { /* annulé */ }
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[s.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.topTitle, { color: colors.textPrimary }]}>Post</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!post) return null;

  const author  = post.author;
  const name    = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
  const allUrls = (post.image_urls && post.image_urls.length > 0)
    ? post.image_urls
    : post.image_url ? [post.image_url] : [];

  // ── Post principal (ListHeaderComponent) ───────────────────────────────────

  const MainPost = (
    <View>
      {/* Carte du post principal */}
      <View style={[s.mainCard, { backgroundColor: colors.surface }]}>

        {/* Auteur */}
        <TouchableOpacity
          style={s.authorRow}
          activeOpacity={0.8}
          onPress={() => author?.id && onAuthorPress?.(String(author.id))}
        >
          {author?.avatar_url ? (
            <Image source={{ uri: author.avatar_url }} style={s.avatar} />
          ) : (
            <View style={[s.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
              <Text style={[s.avatarInitials, { color: colors.primary }]}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[s.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
              {author?.is_verified && (
                <View style={s.verifiedDot}>
                  <Icon name="check" size={9} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Text style={[s.date, { color: colors.textTertiary }]}>{fullDate(post.created_at)}</Text>
              <Text style={{ color: colors.textTertiary, fontSize: 11 }}>·</Text>
              <Icon name="globe" size={11} color={colors.textTertiary} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Feeling */}
        {post.feeling ? (
          <Text style={[s.feeling, { color: colors.textSecondary }]}>
            se sent <Text style={{ fontWeight: '700' }}>{post.feeling}</Text>
          </Text>
        ) : null}

        {/* Body */}
        {post.body ? (
          <Text style={[s.body, { color: colors.textPrimary }]}>{post.body}</Text>
        ) : null}

        {/* Images */}
        {allUrls.length > 0 && (
          <View style={{ marginTop: post.body ? 8 : 0 }}>
            <ImageGrid urls={allUrls} onPress={i => { setImageFsIdx(i); setImageFs(true); }} />
          </View>
        )}

        {/* Compteurs */}
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
              <TouchableOpacity style={{ marginLeft: 'auto' as any }} onPress={() => setCommentsOpen(true)}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {commentCount} commentaire{commentCount > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Barre sociale */}
        <View style={[s.socialBar, { borderColor: colors.divider }]}>
          <TouchableOpacity style={s.socialBtn} onPress={handleLike} activeOpacity={0.7}>
            <Animated.View style={heartStyle}>
              <Icon name="heart" size={20} color={liked ? '#E0389A' : colors.textSecondary} />
            </Animated.View>
            <Text style={[s.socialBtnTxt, { color: liked ? '#E0389A' : colors.textSecondary }]}>J'aime</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.socialBtn} onPress={() => setCommentsOpen(true)} activeOpacity={0.7}>
            <Icon name="message-circle" size={20} color={colors.textSecondary} />
            <Text style={[s.socialBtnTxt, { color: colors.textSecondary }]}>
              {commentCount > 0 ? String(commentCount) : 'Commenter'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.socialBtn} onPress={handleShare} activeOpacity={0.7}>
            <Icon name="share-2" size={20} color={colors.textSecondary} />
            <Text style={[s.socialBtnTxt, { color: colors.textSecondary }]}>Partager</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* En-tête section "Autres publications" */}
      {(authorPosts.length > 0 || authorLoading) && (
        <View style={[s.sectionHeader, { backgroundColor: colors.backgroundSecondary, borderBottomColor: colors.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {author?.avatar_url ? (
              <Image source={{ uri: author.avatar_url }} style={s.sectionAvatar} />
            ) : (
              <View style={[s.sectionAvatarFallback, { backgroundColor: colors.primary + '22' }]}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>{initials}</Text>
              </View>
            )}
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              Autres publications de <Text style={{ color: colors.primary }}>{name}</Text>
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* ── Top bar ── */}
      <View style={[s.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.topTitle, { color: colors.textPrimary }]}>Post</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="share-2" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* ── Post principal + autres posts de l'auteur ── */}
      <FlatList
        data={authorPosts}
        keyExtractor={item => item.id}
        ListHeaderComponent={MainPost}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            colors={colors}
            currentUserId={myId}
            onPress={() => navigation?.push('PostDetail', { postId: item.id })}
            onAuthorPress={() => {
              const aid = item.author?.id;
              if (aid) onAuthorPress?.(String(aid));
            }}
          />
        )}
        ListFooterComponent={
          authorLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : !authorHasMore && authorPosts.length > 0 ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.textTertiary }}>Toutes les publications sont affichées</Text>
            </View>
          ) : null
        }
      />

      {/* ── CommentsBottomSheet ── */}
      <CommentsBottomSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={postId}
        onCommentCountChange={delta => setCommentCount(c => Math.max(0, c + delta))}
      />

      {/* ── Image fullscreen ── */}
      {allUrls.length > 0 && (
        <Modal visible={imageFs} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setImageFs(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
            <FlatList
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={imageFsIdx}
              getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
              data={allUrls}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item: uri }) => (
                <TouchableOpacity activeOpacity={1} onPress={() => setImageFs(false)}
                  style={{ width: SCREEN_W, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={{ uri }} style={{ width: SCREEN_W, height: SCREEN_H * 0.85 }} resizeMode="contain" />
                </TouchableOpacity>
              )}
            />
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
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:    { flex: 1 },
  topBar:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 17, fontWeight: '700' },

  mainCard: { marginBottom: 8 },

  authorRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  avatar:    { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 17, fontWeight: '800' },
  verifiedDot: {
    width: 15, height: 15, borderRadius: 8, backgroundColor: '#1D9BF0',
    alignItems: 'center', justifyContent: 'center',
  },
  authorName: { fontSize: 15, fontWeight: '700' },
  date:       { fontSize: 12 },

  feeling: { paddingHorizontal: 14, paddingBottom: 6, fontSize: 14, fontStyle: 'italic' },
  body:    { paddingHorizontal: 14, paddingBottom: 12, fontSize: 16, lineHeight: 24 },

  countsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  likeIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  socialBar:    { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  socialBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  socialBtnTxt: { fontSize: 14, fontWeight: '600' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionAvatar:        { width: 28, height: 28, borderRadius: 14 },
  sectionAvatarFallback:{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:         { fontSize: 14, fontWeight: '600', flex: 1 },
});
