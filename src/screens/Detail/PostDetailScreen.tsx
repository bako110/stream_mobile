import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, StatusBar, Dimensions, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence, withTiming, FadeInDown,
} from 'react-native-reanimated';
import { FontSize, FontWeight } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService } from '../../services/postService';
import { socialService } from '../../services/socialService';
import { toastService, showConfirm } from '../../services';
import { CommentsBottomSheet, ShareBottomSheet, SkeletonPostDetail, LikersBottomSheet, BackButton } from '../../components/common';
import { RichText } from '../../components/common/RichText';
import { InlineVideoPlayer } from '../../components/common/InlineVideoPlayer';
import { LinkPreviewCard } from '../../components/common/LinkPreviewCard';
import { useMediaDownload } from '../../hooks/useMediaDownload';
import type { Post } from '../../types/post';

const { width: W } = Dimensions.get('window');

const GAP_G    = 3;
const RADIUS_G = 12;
const GRID_H_G = W * 0.62;
const HALF_H_G = (GRID_H_G - GAP_G) / 2;

// ── ImgTile ───────────────────────────────────────────────────────────────────
const ImgTile: React.FC<{
  uri: string; style: any;
  radius?: { tl?: number; tr?: number; bl?: number; br?: number };
  onPress?: () => void; overlay?: React.ReactNode;
}> = ({ uri, style, radius = {}, onPress, overlay }) => {
  const br = {
    borderTopLeftRadius:     radius.tl ?? 0,
    borderTopRightRadius:    radius.tr ?? 0,
    borderBottomLeftRadius:  radius.bl ?? 0,
    borderBottomRightRadius: radius.br ?? 0,
  };
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={[style, br, { overflow: 'hidden' }]}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      {overlay}
    </TouchableOpacity>
  );
};

// ── ImageGrid ─────────────────────────────────────────────────────────────────
const ImageGrid: React.FC<{ urls: string[]; onPress: (i: number) => void }> = ({ urls, onPress }) => {
  const n = urls.length;
  if (n === 0) return null;

  if (n === 1) return (
    <ImgTile
      uri={urls[0]}
      style={{ width: '100%', aspectRatio: 4 / 5 }}
      onPress={() => onPress(0)}
    />
  );

  if (n === 2) {
    const TW = (W - GAP_G) / 2;
    return (
      <View style={{ flexDirection: 'row', height: GRID_H_G, gap: GAP_G }}>
        <ImgTile uri={urls[0]} style={{ width: TW, height: GRID_H_G }} radius={{ tl: RADIUS_G, bl: RADIUS_G }} onPress={() => onPress(0)} />
        <ImgTile uri={urls[1]} style={{ width: TW, height: GRID_H_G }} radius={{ tr: RADIUS_G, br: RADIUS_G }} onPress={() => onPress(1)} />
      </View>
    );
  }

  if (n === 3) {
    const TW = (W - GAP_G) / 2;
    return (
      <View style={{ flexDirection: 'row', height: GRID_H_G, gap: GAP_G }}>
        <ImgTile uri={urls[0]} style={{ width: TW, height: GRID_H_G }} radius={{ tl: RADIUS_G, bl: RADIUS_G }} onPress={() => onPress(0)} />
        <View style={{ width: TW, gap: GAP_G }}>
          <ImgTile uri={urls[1]} style={{ height: HALF_H_G }} radius={{ tr: RADIUS_G }} onPress={() => onPress(1)} />
          <ImgTile uri={urls[2]} style={{ height: HALF_H_G }} radius={{ br: RADIUS_G }} onPress={() => onPress(2)} />
        </View>
      </View>
    );
  }

  // 4+
  const shown = urls.slice(0, 4);
  const extra = n - 4;
  const TW = (W - GAP_G) / 2;
  return (
    <View style={{ height: GRID_H_G, gap: GAP_G }}>
      <View style={{ flexDirection: 'row', height: HALF_H_G, gap: GAP_G }}>
        <ImgTile uri={shown[0]} style={{ width: TW, height: HALF_H_G }} radius={{ tl: RADIUS_G }} onPress={() => onPress(0)} />
        <ImgTile uri={shown[1]} style={{ width: TW, height: HALF_H_G }} radius={{ tr: RADIUS_G }} onPress={() => onPress(1)} />
      </View>
      <View style={{ flexDirection: 'row', height: HALF_H_G, gap: GAP_G }}>
        <ImgTile uri={shown[2]} style={{ width: TW, height: HALF_H_G }} radius={{ bl: RADIUS_G }} onPress={() => onPress(2)} />
        <ImgTile
          uri={shown[3]}
          style={{ width: TW, height: HALF_H_G }}
          radius={{ br: RADIUS_G }}
          onPress={() => onPress(3)}
          overlay={extra > 0 ? (
            <View style={{ ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.52)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: FontSize['2xl'], fontWeight: FontWeight.black, letterSpacing: -1 }}>+{extra}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold, marginTop: 2 }}>photos</Text>
            </View>
          ) : null}
        />
      </View>
    </View>
  );
};

// ── helpers ───────────────────────────────────────────────────────────────────
function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── ReactionPill animée ────────────────────────────────────────────────────────
const ReactionPill: React.FC<{
  icon: string; label: string; count?: number;
  active?: boolean; gradient?: string[]; baseColor: string;
  onPress: () => void;
}> = ({ icon, label, count, active, gradient, baseColor, onPress }) => {
  const scale  = useSharedValue(1);
  const rotate = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  const handle = () => {
    scale.value  = withSequence(withSpring(0.82, { damping: 6, stiffness: 300 }), withSpring(1.08, { damping: 8 }), withSpring(1));
    rotate.value = withSequence(withTiming(-8, { duration: 60 }), withTiming(8, { duration: 60 }), withTiming(0, { duration: 60 }));
    onPress();
  };
  const fmtN = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(n>=10_000_000?0:1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(n>=10_000?0:1)}K` : String(n);
  const display = count && count > 0 ? fmtN(count) : label;

  if (active && gradient) {
    return (
      <TouchableOpacity onPress={handle} activeOpacity={1} style={rp.wrap}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={rp.pillActive}>
          <Animated.View style={aStyle}>
            <Icon name={icon} size={16} color="#fff" />
          </Animated.View>
          <Text style={rp.labelActive}>{display}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={handle} activeOpacity={1} style={rp.wrap}>
      <View style={rp.pill}>
        <Animated.View style={aStyle}>
          <Icon name={icon} size={16} color={baseColor} />
        </Animated.View>
        <Text style={[rp.label, { color: baseColor }]}>{display}</Text>
      </View>
    </TouchableOpacity>
  );
};

const rp = StyleSheet.create({
  wrap:        { flex: 1 },
  pill:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14 },
  pillActive:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14 },
  label:       { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
  labelActive: { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, color: '#fff' },
});

// ── PostDetailScreen ──────────────────────────────────────────────────────────
interface Props {
  postId:         string;
  initialPost?:   Post;
  onBack:         () => void;
  onAuthorPress?: (userId: string) => void;
  navigation?:    any;
}

export const PostDetailScreen: React.FC<Props> = ({ postId, initialPost, onBack, onAuthorPress, navigation }) => {
  const { theme: { colors, isDark } } = useTheme();
  const { currentUser }       = useUser();
  const insets                = useSafeAreaInsets();

  const [post,          setPost]          = useState<Post | null>(initialPost ?? null);
  const [loading,       setLoading]       = useState(!initialPost);
  const [liked,         setLiked]         = useState(initialPost?.user_reaction === 'like');
  const [likeCount,     setLikeCount]     = useState(initialPost?.like_count ?? 0);
  const [commentCount,  setCommentCount]  = useState(initialPost?.comment_count ?? 0);
  const [shareCount,    setShareCount]    = useState(initialPost?.share_count ?? 0);
  const [commentsOpen,  setCommentsOpen]  = useState(false);
  const [likersOpen,    setLikersOpen]    = useState(false);
  const [shareOpen,     setShareOpen]     = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [editingPost,   setEditingPost]   = useState(false);
  const [editBody,      setEditBody]      = useState('');
  const [editSaving,    setEditSaving]    = useState(false);
  const { download: startDl } = useMediaDownload();
  const [authorPosts,   setAuthorPosts]   = useState<Post[]>([]);
  const [authorPage,    setAuthorPage]    = useState(1);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [authorHasMore, setAuthorHasMore] = useState(true);

  const loadingRef  = useRef(false);
  const authorIdRef = useRef<string | null>(null);

  // ── Load post ─────────────────────────────────────────────────────────────
  const loadAuthorPosts = useCallback(async (authorId: string, page: number, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setAuthorLoading(true);
    try {
      const res      = await postService.getByUser(authorId, page, 10);
      const filtered = res.filter((p: Post) => p.id !== postId);
      if (res.length < 10) setAuthorHasMore(false);
      setAuthorPosts(prev => reset ? filtered : [...prev, ...filtered]);
      setAuthorPage(page + 1);
    } catch {
      setAuthorHasMore(false);
    } finally {
      setAuthorLoading(false);
      loadingRef.current = false;
    }
  }, [postId]);

  const load = useCallback(async () => {
    try {
      const res = await postService.getById(postId);
      setPost(res);
      setLiked(res.user_reaction === 'like');
      setLikeCount(res.like_count ?? 0);
      setCommentCount(res.comment_count ?? 0);
      if (res.author?.id) {
        authorIdRef.current = String(res.author.id);
        loadAuthorPosts(String(res.author.id), 1, true);
      }
    } catch {
      toastService.error('Erreur', 'Impossible de charger le post.');
      onBack();
    } finally {
      setLoading(false);
    }
  }, [postId, loadAuthorPosts, onBack]);

  useEffect(() => {
    postService.recordView(postId);
  }, [postId]);

  useEffect(() => {
    setAuthorPosts([]); setAuthorPage(1);
    setAuthorHasMore(true); authorIdRef.current = null;

    if (initialPost) {
      setPost(initialPost);
      if (initialPost.author?.id) {
        authorIdRef.current = String(initialPost.author.id);
        loadAuthorPosts(String(initialPost.author.id), 1, true);
      }
    } else {
      setPost(null);
      setLoading(true);
      load();
    }
  }, [postId]);

  const handleEndReached = useCallback(() => {
    if (!authorLoading && authorHasMore && authorIdRef.current && authorPage > 1)
      loadAuthorPosts(authorIdRef.current, authorPage);
  }, [authorLoading, authorHasMore, authorPage, loadAuthorPosts]);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const handleLike = useCallback(() => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 6 }), withSpring(1));
    const next = !liked;
    setLiked(next);
    setLikeCount(c => next ? c + 1 : Math.max(0, c - 1));
    postService.react(postId, 'like').catch(() => {
      setLiked(!next);
      setLikeCount(c => next ? Math.max(0, c - 1) : c + 1);
    });
  }, [liked, postId]);

  const handleShare = useCallback(() => {
    setMenuOpen(false);
    setShareOpen(true);
  }, []);

  const handleDelete = useCallback(() => {
    showConfirm('Supprimer', 'Supprimer ce post définitivement ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await postService.delete(postId);
            onBack();
          } catch { toastService.error('Erreur', 'Impossible de supprimer.'); }
        },
      },
    ]);
  }, [postId, onBack]);

  const handleReport = useCallback(() => {
    setMenuOpen(false);
    toastService.info('Signaler', 'Ce post a été signalé. Merci pour ton retour.');
  }, []);

  // Édition rapide du texte — même pattern que ProfileScreen (modal bas d'écran,
  // postService.update sur le body uniquement, pas de média).
  const handleEdit = useCallback(() => {
    setMenuOpen(false);
    setEditBody(post?.body ?? '');
    setEditingPost(true);
  }, [post]);

  const handleSaveEditPost = useCallback(async () => {
    if (!post || !editBody.trim()) return;
    setEditSaving(true);
    try {
      await postService.update(post.id, { body: editBody.trim() });
      setPost(prev => prev ? { ...prev, body: editBody.trim() } as Post : prev);
      setEditingPost(false);
    } catch { toastService.error('Erreur', 'Impossible de modifier.'); }
    finally { setEditSaving(false); }
  }, [post, editBody]);

  const handleDownloadAll = useCallback(async () => {
    setMenuOpen(false);
    const imageUrls = post?.image_urls?.length
      ? post.image_urls
      : post?.image_url
        ? [post.image_url]
        : [];
    // La vidéo du post n'est jamais stockée en MP4 côté serveur — hls_url est reconstruit
    // à la volée par le hook (même mécanisme que reels/messages), video_url en fallback.
    const videoUrl = post?.hls_url ?? post?.video_url ?? null;
    if (imageUrls.length === 0 && !videoUrl) {
      toastService.warning('Rien à télécharger', 'Ce post ne contient pas de média.');
      return;
    }
    setDownloading(true);
    try {
      await Promise.all([
        ...imageUrls.map((url, i) => startDl(`${postId}_img_${i}`, url, false)),
        ...(videoUrl ? [startDl(`${postId}_video`, videoUrl, true)] : []),
      ]);
      const count = imageUrls.length + (videoUrl ? 1 : 0);
      toastService.success(
        'Téléchargé',
        count === 1
          ? 'Le fichier a été enregistré dans tes téléchargements.'
          : `${count} fichiers enregistrés dans tes téléchargements.`,
      );
    } catch {
      toastService.error('Erreur', 'Impossible de télécharger les fichiers.');
    } finally {
      setDownloading(false);
    }
  }, [post, postId, startDl]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
        {/* Header — carte flottante (même design que le reste de l'app).
            paddingTop (status bar) isolé sur un wrapper externe transparent —
            le mélanger au style de la carte ferait apparaître un coin visible
            sous la status bar. */}
        <View style={{ paddingTop: insets.top + 8 }}>
          <View style={[s.topBar, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            <BackButton onPress={onBack} />
            <Text style={[s.topTitle, { color: colors.textPrimary }]}>Publication</Text>
            <View style={[s.topBtn, { backgroundColor: 'transparent' }]} />
          </View>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.surface }}>
          <SkeletonPostDetail />
        </View>
      </View>
    );
  }

  if (!post) return null;

  const author   = post.author;
  const name     = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const allUrls  = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];
  const isOwn    = !!(currentUser && author?.id && String(currentUser.id) === String(author.id));

  // ── Carte portrait (grille 2 colonnes) ────────────────────────────────────
  const CARD_W    = (W - 12 * 2 - 8) / 2;  // 12px padding de chaque côté, 8px gap
  const CARD_H    = Math.round(CARD_W * 14 / 9);

  const renderPortraitCard = ({ item, index }: { item: Post; index: number }) => {
    const thumb    = item.image_urls?.[0] ?? item.image_url ?? item.thumbnail_url ?? null;
    const hasVideo = !!(item.hls_url ?? item.video_url) && !item.image_urls?.length && !item.image_url;
    const imgCount = (item.image_urls?.length ?? 0) + (item.image_url && !item.image_urls?.length ? 1 : 0);

    return (
      <Animated.View
        entering={FadeInDown.delay(index * 50).duration(280).springify()}
        style={{ width: CARD_W }}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => navigation?.push('PostDetail', { postId: item.id })}
          style={[s.pCard, { backgroundColor: colors.surface }]}
        >
          {/* Thumbnail portrait — uniquement réservée si une image existe : sans
              image, ce bloc disparaît entièrement pour laisser le texte prendre
              toute la place, plutôt qu'un carré vide avec juste une icône. */}
          {thumb ? (
            <View style={[s.pThumbWrap, { height: CARD_H }]}>
              <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              {/* Gradient bas */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.72)']}
                locations={[0.4, 1]}
                style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', padding: 9 }]}
              >
                {/* Stats en overlay */}
                <View style={s.pStats}>
                  <View style={s.pStat}>
                    <MCIcon name="heart" size={12} color="#fff" />
                    <Text style={s.pStatTxt}>{item.like_count ?? 0}</Text>
                  </View>
                  <View style={s.pStat}>
                    <MCIcon name="comment-outline" size={12} color="#fff" />
                    <Text style={s.pStatTxt}>{item.comment_count ?? 0}</Text>
                  </View>
                  {imgCount > 1 && (
                    <View style={[s.pStat, s.pImgBadge]}>
                      <Icon name="image" size={10} color="#fff" />
                      <Text style={s.pStatTxt}>{imgCount}</Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
              {/* Badge play si c'est une vidéo */}
              {hasVideo && (
                <View style={s.pVideoBadge}>
                  <Icon name="play" size={10} color="#fff" style={{ marginLeft: 1 }} />
                </View>
              )}
            </View>
          ) : null}

          {/* Caption — sans image, le texte s'étend et les stats passent en bas */}
          {item.body ? (
            <View style={[s.pBody, !thumb && { paddingVertical: 14 }]}>
              <RichText
                text={item.body}
                maxLines={thumb ? 2 : 6}
                primaryColor={colors.primary}
                textStyle={[s.pBodyTxt, { color: colors.textPrimary }]}
                showLinkPreview={false}
              />
              {!thumb && (
                <View style={[s.pStatsLight, { marginTop: 8 }]}>
                  <View style={s.pStat}>
                    <MCIcon name="heart-outline" size={12} color={colors.textTertiary} />
                    <Text style={[s.pStatTxt, { color: colors.textTertiary }]}>{item.like_count ?? 0}</Text>
                  </View>
                  <View style={s.pStat}>
                    <MCIcon name="comment-outline" size={12} color={colors.textTertiary} />
                    <Text style={[s.pStatTxt, { color: colors.textTertiary }]}>{item.comment_count ?? 0}</Text>
                  </View>
                </View>
              )}
            </View>
          ) : !thumb ? (
            /* Pas d'image ET pas de caption → stats seules */
            <View style={s.pBody}>
              <View style={s.pStatsLight}>
                <View style={s.pStat}>
                  <MCIcon name="heart-outline" size={12} color={colors.textTertiary} />
                  <Text style={[s.pStatTxt, { color: colors.textTertiary }]}>{item.like_count ?? 0}</Text>
                </View>
                <View style={s.pStat}>
                  <MCIcon name="comment-outline" size={12} color={colors.textTertiary} />
                  <Text style={[s.pStatTxt, { color: colors.textTertiary }]}>{item.comment_count ?? 0}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ── MainPost (header du FlatList) ─────────────────────────────────────────
  const fmtN = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}K` : String(n);

  const MainPost = (
    <Animated.View entering={FadeInDown.duration(350).springify()}>
      {/* Carte post */}
      <View style={[s.postCard, { backgroundColor: colors.surface }]}>

        {/* ── En-tête auteur ── */}
        <View style={s.authorRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => author?.id && onAuthorPress?.(String(author.id))}
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}
          >
            {author?.avatar_url ? (
              <Image source={{ uri: author.avatar_url }} style={s.avatar} />
            ) : (
              <View style={[s.avatarFallback, { backgroundColor: colors.primary }]}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[s.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
                {author?.is_verified && (
                  <View style={s.verifiedDot}>
                    <Icon name="check" size={9} color="#fff" />
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Text style={[s.date, { color: colors.textTertiary }]}>{fullDate(post.created_at)}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus }}>·</Text>
                <Icon name={post.is_private ? 'users' : 'globe'} size={11} color={colors.textTertiary} />
              </View>
              {isOwn && post.ai_analysis_status === 'pending' && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => navigation?.navigate('AiAnalysisStatus', { contentType: 'post', contentId: post.id, initialStatus: post.ai_analysis_status })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                  <Text style={{ color: colors.textTertiary, fontSize: FontSize.xs, fontWeight: FontWeight.semiBold }}>Vérification en cours…</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
          {/* Bouton ··· */}
          <TouchableOpacity
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => setMenuOpen(v => !v)}
          >
            <Icon name="more-horizontal" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* Menu contextuel — ancré sous le bouton ···, jamais tronqué par le reste de la carte */}
          {menuOpen && (
            <View style={[s.ctxMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity style={s.ctxItem} onPress={() => { setMenuOpen(false); handleShare(); }}>
                <MCIcon name="share-outline" size={16} color={colors.textSecondary} />
                <Text style={[s.ctxTxt, { color: colors.textSecondary }]}>Partager</Text>
              </TouchableOpacity>
              <View style={[s.ctxSep, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.ctxItem} onPress={handleDownloadAll} disabled={downloading}>
                {downloading
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Icon name="download" size={15} color={colors.textSecondary} />
                }
                <Text style={[s.ctxTxt, { color: colors.textSecondary }]}>
                  {downloading ? 'Téléchargement...' : 'Télécharger'}
                </Text>
              </TouchableOpacity>
              <View style={[s.ctxSep, { backgroundColor: colors.divider }]} />
              {isOwn ? (
                <>
                  <TouchableOpacity style={s.ctxItem} onPress={handleEdit}>
                    <Icon name="edit-2" size={15} color={colors.textSecondary} />
                    <Text style={[s.ctxTxt, { color: colors.textSecondary }]}>Modifier</Text>
                  </TouchableOpacity>
                  <View style={[s.ctxSep, { backgroundColor: colors.divider }]} />
                  <TouchableOpacity style={s.ctxItem} onPress={() => { setMenuOpen(false); handleDelete(); }}>
                    <Icon name="trash-2" size={15} color="#EF4444" />
                    <Text style={[s.ctxTxt, { color: '#EF4444' }]}>Supprimer</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={s.ctxItem} onPress={handleReport}>
                  <Icon name="flag" size={15} color={colors.textSecondary} />
                  <Text style={[s.ctxTxt, { color: colors.textSecondary }]}>Signaler</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Feeling pill */}
        {post.feeling ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <View style={[s.feelingPill, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={{ fontSize: FontSize.basePlus }}>😊</Text>
              <Text style={{ fontSize: FontSize.smPlus, fontStyle: 'italic', color: colors.textSecondary }}>
                se sent{' '}
              </Text>
              <Text style={{ fontSize: FontSize.smPlus }}>💪</Text>
              <Text style={{ fontSize: FontSize.smPlus, fontWeight: FontWeight.extraBold, color: '#F97316' }}>{post.feeling}</Text>
            </View>
          </View>
        ) : null}

        {/* Texte du post — si le SEUL contenu est l'URL affichée en carte
            ci-dessous, on masque le texte (comportement Facebook, pas de
            lien affiché 2×). */}
        {(() => {
          const raw = post.body ?? '';
          const stripped = post.link_url ? raw.replace(post.link_url, '').trim() : raw;
          const bodyToShow = post.link_url && stripped.length < 3 ? '' : (post.link_url ? stripped : raw);
          if (!bodyToShow) return null;
          return (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <RichText
                text={bodyToShow}
                maxLines={6}
                primaryColor={colors.primary}
                textStyle={[s.bodyTxt, { color: colors.textPrimary }]}
                // L'aperçu est géré par <LinkPreviewCard> ci-dessous.
                showLinkPreview={false}
              />
            </View>
          );
        })()}

        {/* Aperçu lien — métadonnées OG (image + titre + domaine). Le lien
            reste TOUJOURS affiché ; seule l'image OG est masquée si le post a
            déjà son propre média (image ou vidéo) — même règle que PostCard
            (feed), pour ne jamais avoir deux images empilées sur un même
            post, sans jamais cacher le lien lui-même. */}
        {post.link_url ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <LinkPreviewCard
              url={post.link_url}
              hideImage={allUrls.length > 0 || !!(post.hls_url ?? post.video_url)}
            />
          </View>
        ) : null}

        {/* Vidéo inline */}
        {(post.hls_url ?? post.video_url) && allUrls.length === 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 14, overflow: 'hidden' }}>
            <InlineVideoPlayer
              uri={(post.hls_url ?? post.video_url)!}
              thumbnailUri={post.thumbnail_url}
              aspectRatio={16 / 9}
              borderRadius={14}
              showControls
              muted={false}
            />
          </View>
        )}

        {/* Images — pleine largeur, pas de marge horizontale ni d'arrondi qui
            grignoterait la largeur réelle occupée par l'image. */}
        {allUrls.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <ImageGrid urls={allUrls} onPress={i => navigation?.navigate('ImageGallery', { urls: allUrls, initialIndex: i })} />
          </View>
        )}

        {/* ── Barre 3 boutons — compteurs déjà affichés à côté des icônes,
            plus besoin d'une ligne séparée au-dessus ── */}
        <View style={[s.actionBar, { backgroundColor: colors.surface, borderColor: colors.divider }]}>

          {/* J'aime — icône seule + compteur, pas de texte */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleLike}
            style={s.actionBtn}
          >
            <Animated.View style={heartStyle}>
              <MCIcon name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.primary : colors.textSecondary} />
            </Animated.View>
            {likeCount > 0 && (
              <Text style={[s.actionBtnTxt, { color: liked ? colors.primary : colors.textSecondary }]}>{fmtN(likeCount)}</Text>
            )}
          </TouchableOpacity>

          <View style={[s.actionSep, { backgroundColor: colors.divider }]} />

          {/* Commenter */}
          {!post?.comments_disabled && (
            <>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setCommentsOpen(true)}
                style={s.actionBtn}
              >
                <MCIcon name="comment-outline" size={20} color={commentCount > 0 ? colors.primary : colors.textSecondary} />
                {commentCount > 0 && (
                  <Text style={[s.actionBtnTxt, { color: colors.primary }]}>{fmtN(commentCount)}</Text>
                )}
              </TouchableOpacity>
              <View style={[s.actionSep, { backgroundColor: colors.divider }]} />
            </>
          )}

          {/* Partager */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleShare}
            style={s.actionBtn}
          >
            <MCIcon name="share-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

        </View>
      </View>
    </Animated.View>
  );

  // ── Header section "Autres publications" ───────────────────────────────────
  const SectionHeader = (
    <View>
      {MainPost}
      {(authorPosts.length > 0 || authorLoading) && (
        <View style={[s.secHeader, { borderBottomColor: colors.divider }]}>
          <Text style={[s.secTitle, { color: colors.textPrimary }]}>Autres publications</Text>
          <TouchableOpacity
            onPress={() => author?.id && onAuthorPress?.(String(author.id))}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={[s.secSeeAll, { color: colors.primary }]}>Voir tout</Text>
            <Icon name="arrow-right" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ── Rendu des items en grille (2 colonnes) ────────────────────────────────
  // FlatList ne supporte pas numColumns avec ListHeaderComponent facilement
  // → on groupe les items par paires
  const pairs: Post[][] = [];
  for (let i = 0; i < authorPosts.length; i += 2) {
    pairs.push(authorPosts.slice(i, i + 2));
  }

  const renderPair = ({ item: pair, index: pairIndex }: { item: Post[]; index: number }) => (
    <View style={s.pRow}>
      {pair.map((post, col) => (
        <React.Fragment key={post.id}>
          {renderPortraitCard({ item: post, index: pairIndex * 2 + col })}
        </React.Fragment>
      ))}
      {pair.length === 1 && <View key="__placeholder" style={{ width: CARD_W }} />}
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Top bar — carte flottante (même design que le reste de l'app).
          paddingTop (status bar) isolé sur un wrapper externe transparent —
          le mélanger au style de la carte ferait apparaître un coin visible
          sous la status bar. */}
      <View style={{ paddingTop: insets.top + 8 }}>
        <View style={[s.topBar, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={onBack} />
          <Text style={[s.topTitle, { color: colors.textPrimary }]}>Publication</Text>
          <TouchableOpacity
            onPress={handleShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.topBtn}
          >
            <MCIcon name="share-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={pairs}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 8 }}
        ListHeaderComponent={SectionHeader}
        renderItem={renderPair}
        ListFooterComponent={
          authorLoading ? (
            <View style={s.footerLoader}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : !authorHasMore && authorPosts.length > 0 ? (
            <View style={s.footerEnd}>
              <View style={[s.footerLine, { backgroundColor: colors.divider }]} />
              <Text style={[s.footerTxt, { color: colors.textTertiary }]}>Fin des publications</Text>
              <View style={[s.footerLine, { backgroundColor: colors.divider }]} />
            </View>
          ) : null
        }
      />

      {/* LikersBottomSheet */}
      <LikersBottomSheet
        visible={likersOpen}
        onClose={() => setLikersOpen(false)}
        postId={postId}
        likeCount={likeCount}
        onNavigateToProfile={userId => {
          setLikersOpen(false);
          onAuthorPress?.(userId);
        }}
      />

      {/* CommentsBottomSheet */}
      <CommentsBottomSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={postId}
        commentsDisabled={post?.comments_disabled ?? false}
        onCommentCountChange={delta => setCommentCount(c => Math.max(0, c + delta))}
      />

      {/* ShareBottomSheet */}
      {post && (
        <ShareBottomSheet
          type="post"
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          post={post}
          onShareCountChange={() => {
            setShareCount(c => c + 1);
            socialService.share({ platform: 'external', post_id: post.id } as any).catch(() => setShareCount(c => Math.max(0, c - 1)));
          }}
        />
      )}

      {/* Édition rapide d'un post (texte) — même pattern que ProfileScreen */}
      <Modal visible={editingPost} transparent animationType="slide" onRequestClose={() => setEditingPost(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditingPost(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: colors.textPrimary, marginBottom: 12 }}>Modifier le post</Text>
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              multiline
              autoFocus
              style={{ minHeight: 100, fontSize: FontSize.base, color: colors.textPrimary, textAlignVertical: 'top', backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 12 }}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surfaceElevated }}
                onPress={() => setEditingPost(false)}
              >
                <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.textPrimary }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, opacity: editSaving || !editBody.trim() ? 0.6 : 1 }}
                onPress={handleSaveEditPost}
                disabled={editSaving || !editBody.trim()}
              >
                {editSaving ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' }}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Top bar — carte flottante, icone partage violet à droite
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    marginHorizontal: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  topBtn: { padding: 4 },
  topTitle: { fontSize: FontSize.mdPlus, fontWeight: FontWeight.bold },

  // Carte post — fond légèrement contrasté, coins arrondis, margin H
  postCard: {
    marginHorizontal: 12,
    borderRadius: 18,
    marginBottom: 10,
  },

  // En-tête auteur
  authorRow: {
    position: 'relative',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12,
  },
  avatar:         { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: FontSize.mdPlus, fontWeight: FontWeight.extraBold, color: '#fff' },
  verifiedDot:    { width: 16, height: 16, borderRadius: 8, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' },
  authorName:     { fontSize: FontSize.basePlus, fontWeight: FontWeight.bold },
  date:           { fontSize: FontSize.sm },

  // Feeling pill
  feelingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 24, borderWidth: StyleSheet.hairlineWidth,
  },

  // Corps texte
  bodyTxt: { fontSize: FontSize.basePlus, lineHeight: 24, letterSpacing: 0.1 },

  // Ligne compteurs
  countersRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  countDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  countTxt: { fontSize: FontSize.smPlus, fontWeight: FontWeight.medium },

  // Pilule flottante — même design que AppHeader/AppTabBar (borderRadius 24,
  // bordure hairline, ombre douce #5B45B5), cohérent avec PostCard.tsx/FeedScreen.tsx.
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 10, marginTop: 6,
    borderRadius: 24, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9,
  },
  actionBtnTxt: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, textAlign: 'center' },
  actionSep:    { width: StyleSheet.hairlineWidth, height: 32 },

  // Menu contextuel ···
  ctxMenu: {
    position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    minWidth: 170, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  ctxItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  ctxTxt:  { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  ctxSep:  { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },

  // Section "Autres publications"
  secHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  secTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.extraBold },
  secSeeAll: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // Grille portrait
  pRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  pCard: {
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  pThumbWrap:  { width: '100%', overflow: 'hidden', position: 'relative' },
  pStats:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pStatsLight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pStat:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pStatTxt:    { color: '#fff', fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold },
  pImgBadge:   { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  pVideoBadge: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  pBody:       { paddingHorizontal: 10, paddingVertical: 8 },
  pBodyTxt:    { fontSize: FontSize.sm, fontWeight: FontWeight.regular, lineHeight: 17 },

  // Footer
  footerLoader: { paddingVertical: 28, alignItems: 'center' },
  footerEnd:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 20 },
  footerLine:   { flex: 1, height: StyleSheet.hairlineWidth },
  footerTxt:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  // Fullscreen image (inchangé)
  fsRoot:       { flex: 1, backgroundColor: '#000' },
  fsClose:      { position: 'absolute', right: 18 },
  fsCloseGlass: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  fsDots:       { position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 5 },
  fsDot:        { height: 6, borderRadius: 3 },
});