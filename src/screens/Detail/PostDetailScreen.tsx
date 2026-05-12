import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, Alert, StatusBar, Modal, Dimensions, Platform,
} from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence, withTiming, FadeInDown,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { postService } from '../../services/postService';
import { CommentsBottomSheet, ShareBottomSheet, ExpandableText } from '../../components/common';
import { InlineVideoPlayer } from '../../components/common/InlineVideoPlayer';
import type { Post } from '../../types/post';

const { width: W, height: H } = Dimensions.get('window');

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
      style={{ width: '100%', aspectRatio: 4 / 3 }}
      radius={{ tl: RADIUS_G, tr: RADIUS_G, bl: RADIUS_G, br: RADIUS_G }}
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
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -1 }}>+{extra}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginTop: 2 }}>photos</Text>
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
  const display = count && count > 0 ? (count > 999 ? `${(count / 1000).toFixed(1)}k` : String(count)) : label;

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
  label:       { fontSize: 13, fontWeight: '700' },
  labelActive: { fontSize: 13, fontWeight: '700', color: '#fff' },
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
  const { theme: { colors } } = useTheme();
  const { currentUser }       = useUser();
  const insets                = useSafeAreaInsets();

  const [post,          setPost]          = useState<Post | null>(initialPost ?? null);
  const [loading,       setLoading]       = useState(!initialPost);
  const [liked,         setLiked]         = useState(initialPost?.user_reaction === 'like');
  const [likeCount,     setLikeCount]     = useState(initialPost?.like_count ?? 0);
  const [commentCount,  setCommentCount]  = useState(initialPost?.comment_count ?? 0);
  const [commentsOpen,  setCommentsOpen]  = useState(false);
  const [shareOpen,     setShareOpen]     = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [imageFs,       setImageFs]       = useState(false);
  const [imageFsIdx,    setImageFsIdx]    = useState(0);
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
      Alert.alert('Erreur', 'Impossible de charger le post.');
      onBack();
    } finally {
      setLoading(false);
    }
  }, [postId, loadAuthorPosts, onBack]);

  useEffect(() => {
    setAuthorPosts([]); setAuthorPage(1);
    setAuthorHasMore(true); authorIdRef.current = null;

    if (initialPost) {
      // Données déjà disponibles — pas de fetch, on charge juste les posts de l'auteur
      if (initialPost.author?.id) {
        authorIdRef.current = String(initialPost.author.id);
        loadAuthorPosts(String(initialPost.author.id), 1, true);
      }
    } else {
      setPost(null); setLoading(true);
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
    Alert.alert('Supprimer', 'Supprimer ce post définitivement ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await postService.delete(postId);
            onBack();
          } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
        },
      },
    ]);
  }, [postId, onBack]);

  const handleReport = useCallback(() => {
    setMenuOpen(false);
    Alert.alert('Signaler', 'Ce post a été signalé. Merci pour ton retour.');
  }, []);

  const handleDownloadAll = useCallback(async () => {
    setMenuOpen(false);
    const urls = post?.image_urls?.length
      ? post.image_urls
      : post?.image_url
        ? [post.image_url]
        : [];
    if (urls.length === 0) {
      Alert.alert('Rien à télécharger', 'Ce post ne contient pas de média.');
      return;
    }
    setDownloading(true);
    try {
      const dirs = RNBlobUtil.fs.dirs;
      await Promise.all(urls.map(async (url, i) => {
        const ext  = url.match(/\.(mp4|mov|webm)/i) ? 'mp4' : 'jpg';
        const dest = Platform.OS === 'android'
          ? `${dirs.DownloadDir}/FoliX_${Date.now()}_${i}.${ext}`
          : `${dirs.DocumentDir}/FoliX_${Date.now()}_${i}.${ext}`;
        await RNBlobUtil.config({
          fileCache: true,
          path: dest,
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            title: `FoliX — fichier ${i + 1}/${urls.length}`,
            description: 'Téléchargement FoliX',
            mime: ext === 'mp4' ? 'video/mp4' : 'image/jpeg',
            mediaScannable: true,
          },
        }).fetch('GET', url);
        if (Platform.OS === 'ios') {
          RNBlobUtil.ios.previewDocument(dest);
        }
      }));
      Alert.alert(
        'Téléchargé',
        urls.length === 1
          ? 'Le fichier a été enregistré dans tes téléchargements.'
          : `${urls.length} fichiers enregistrés dans tes téléchargements.`,
      );
    } catch {
      Alert.alert('Erreur', 'Impossible de télécharger les fichiers.');
    } finally {
      setDownloading(false);
    }
  }, [post]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
        <View style={[s.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.topTitle, { color: colors.textPrimary }]}>Publication</Text>
          <View style={{ width: 36 }} />
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
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const allUrls  = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];
  const isOwn    = !!(currentUser && author?.id && String(currentUser.id) === String(author.id));

  // ── Carte portrait (grille 2 colonnes) ────────────────────────────────────
  const CARD_W    = (W - 12 * 2 - 8) / 2;  // 12px padding de chaque côté, 8px gap
  const CARD_H    = Math.round(CARD_W * 14 / 9);

  const renderPortraitCard = ({ item, index }: { item: Post; index: number }) => {
    const thumb    = item.image_urls?.[0] ?? item.image_url ?? item.thumbnail_url ?? null;
    const hasVideo = !!item.video_url && !item.image_urls?.length && !item.image_url;
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
          {/* Thumbnail portrait */}
          <View style={[s.pThumbWrap, { height: CARD_H }]}>
            {thumb ? (
              <>
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
                      <Icon name="heart" size={11} color="#fff" />
                      <Text style={s.pStatTxt}>{item.like_count ?? 0}</Text>
                    </View>
                    <View style={s.pStat}>
                      <Icon name="message-circle" size={11} color="#fff" />
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
              </>
            ) : (
              /* Pas de thumbnail — fond + texte */
              <View style={[StyleSheet.absoluteFill, s.pNoThumb, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="file-text" size={24} color={colors.primary + '60'} />
              </View>
            )}
          </View>

          {/* Caption sous la vignette */}
          {item.body ? (
            <View style={s.pBody}>
              <ExpandableText
                text={item.body}
                maxLines={2}
                primaryColor={colors.primary}
                textStyle={[s.pBodyTxt, { color: colors.textPrimary }]}
              />
            </View>
          ) : !thumb ? (
            /* Pas d'image ET pas de caption → stats en bas */
            <View style={s.pBody}>
              <View style={s.pStatsLight}>
                <View style={s.pStat}>
                  <Icon name="heart" size={11} color={colors.textTertiary} />
                  <Text style={[s.pStatTxt, { color: colors.textTertiary }]}>{item.like_count ?? 0}</Text>
                </View>
                <View style={s.pStat}>
                  <Icon name="message-circle" size={11} color={colors.textTertiary} />
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
  const MainPost = (
    <Animated.View entering={FadeInDown.duration(350).springify()}>
      <View style={[s.postBody, { backgroundColor: colors.surface }]}>

        {/* Auteur */}
        <View style={s.authorRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => author?.id && onAuthorPress?.(String(author.id))}
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}
          >
            {author?.avatar_url ? (
              <Image source={{ uri: author.avatar_url }} style={s.avatar} />
            ) : (
              <View style={[s.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[s.avatarInitials, { color: colors.primary }]}>{initials}</Text>
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
                <Text style={{ color: colors.textTertiary, fontSize: 11 }}>·</Text>
                <Icon name="globe" size={11} color={colors.textTertiary} />
              </View>
            </View>
          </TouchableOpacity>
          {/* Bouton menu ··· */}
          <TouchableOpacity
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[s.moreBtn, { backgroundColor: colors.backgroundSecondary }]}
            onPress={() => setMenuOpen(v => !v)}
          >
            <Icon name="more-horizontal" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Menu contextuel */}
        {menuOpen && (
          <View style={[s.ctxMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity style={s.ctxItem} onPress={() => { setMenuOpen(false); handleShare(); }}>
              <Icon name="share-2" size={15} color={colors.textSecondary} />
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
              <TouchableOpacity style={s.ctxItem} onPress={() => { setMenuOpen(false); handleDelete(); }}>
                <Icon name="trash-2" size={15} color="#EF4444" />
                <Text style={[s.ctxTxt, { color: '#EF4444' }]}>Supprimer</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.ctxItem} onPress={handleReport}>
                <Icon name="flag" size={15} color={colors.textSecondary} />
                <Text style={[s.ctxTxt, { color: colors.textSecondary }]}>Signaler</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Feeling pill */}
        {post.feeling ? (
          <View style={s.feelingRow}>
            <View style={[s.feelingPill, { backgroundColor: colors.accentOrange + '18', borderColor: colors.accentOrange + '30' }]}>
              <Text style={s.feelingEmoji}>😊</Text>
              <Text style={[s.feelingTxt, { color: colors.accentOrange }]}>
                se sent <Text style={{ fontWeight: '800' }}>{post.feeling}</Text>
              </Text>
            </View>
          </View>
        ) : null}

        {/* Texte du post */}
        {post.body ? (
          <ExpandableText
            text={post.body}
            maxLines={4}
            primaryColor={colors.primary}
            textStyle={[s.bodyTxt, { color: colors.textPrimary }]}
          />
        ) : null}

        {/* Vidéo inline */}
        {post.video_url && allUrls.length === 0 && (
          <View style={[s.imagesWrap, !post.body && { marginTop: 0 }]}>
            <InlineVideoPlayer
              uri={post.video_url}
              thumbnailUri={post.thumbnail_url}
              aspectRatio={16 / 9}
              borderRadius={12}
              showControls
            />
          </View>
        )}

        {/* Images */}
        {allUrls.length > 0 && (
          <View style={[s.imagesWrap, !post.body && { marginTop: 0 }]}>
            <ImageGrid urls={allUrls} onPress={i => { setImageFsIdx(i); setImageFs(true); }} />
          </View>
        )}

        {/* ── Barre engagement ── */}
        <View style={[s.engageWrap, { borderTopColor: colors.divider }]}>

          {/* Ligne compteurs */}
          {(likeCount > 0 || commentCount > 0) && (
            <View style={s.engageCountRow}>
              {likeCount > 0 && (
                <View style={s.engageCountItem}>
                  <View style={[s.engageCountDot, { backgroundColor: '#E0389A' }]}>
                    <Icon name="heart" size={9} color="#fff" />
                  </View>
                  <Text style={[s.engageCountTxt, { color: colors.textTertiary }]}>
                    {likeCount > 999 ? `${(likeCount / 1000).toFixed(1)}k` : likeCount}
                  </Text>
                </View>
              )}
              {commentCount > 0 && (
                <TouchableOpacity style={s.engageCountItem} onPress={() => setCommentsOpen(true)}>
                  <View style={[s.engageCountDot, { backgroundColor: colors.primary }]}>
                    <Icon name="message-circle" size={9} color="#fff" />
                  </View>
                  <Text style={[s.engageCountTxt, { color: colors.textTertiary }]}>
                    {commentCount} commentaire{commentCount > 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Boutons capsules */}
          <View style={[s.engageBtnRow, { borderTopColor: colors.divider }]}>

            {/* Adorer */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleLike}
              style={[
                s.engageBtn,
                liked
                  ? { backgroundColor: '#E0389A' + '18', borderColor: '#E0389A' + '50' }
                  : { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
              ]}
            >
              <Animated.View style={heartStyle}>
                <Icon name="heart" size={17} color={liked ? '#E0389A' : colors.textSecondary} />
              </Animated.View>
              <Text style={[s.engageBtnTxt, { color: liked ? '#E0389A' : colors.textSecondary }]}>
                {liked ? 'Tu adores' : 'Adorer'}
              </Text>
            </TouchableOpacity>

            {/* Commenter */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setCommentsOpen(true)}
              style={[s.engageBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            >
              <Icon name="message-circle" size={17} color={colors.textSecondary} />
              <Text style={[s.engageBtnTxt, { color: colors.textSecondary }]}>Reagir</Text>
            </TouchableOpacity>

            {/* Partager */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleShare}
              style={[s.engageBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            >
              <Icon name="share-2" size={17} color={colors.textSecondary} />
              <Text style={[s.engageBtnTxt, { color: colors.textSecondary }]}>Diffuser</Text>
            </TouchableOpacity>

          </View>
        </View>
      </View>
    </Animated.View>
  );

  // ── Header section "Publications" ──────────────────────────────────────────
  const SectionHeader = (
    <View>
      {MainPost}
      {(authorPosts.length > 0 || authorLoading) && (
        <View style={[s.secHeader, { borderBottomColor: colors.divider }]}>
          <Text style={[s.secTitle, { color: colors.textPrimary }]}>Publications</Text>
          {authorPosts.length > 0 && (
            <View style={[s.secCountPill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              <Text style={[s.secCountTxt, { color: colors.textTertiary }]}>{authorPosts.length}</Text>
            </View>
          )}
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
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Top bar */}
      <View style={[s.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[s.topBtn, { backgroundColor: colors.backgroundSecondary }]}
        >
          <Icon name="arrow-left" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.topTitle, { color: colors.textPrimary }]}>Publication</Text>
        <TouchableOpacity
          onPress={handleShare}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[s.topBtn, { backgroundColor: colors.backgroundSecondary }]}
        >
          <Icon name="share-2" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={pairs}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
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

      {/* CommentsBottomSheet */}
      <CommentsBottomSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={postId}
        onCommentCountChange={delta => setCommentCount(c => Math.max(0, c + delta))}
      />

      {/* ShareBottomSheet */}
      {post && (
        <ShareBottomSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          post={post}
          onShareCountChange={() => {/* compteur géré côté backend */}}
        />
      )}

      {/* Image fullscreen */}
      {allUrls.length > 0 && (
        <Modal
          visible={imageFs}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setImageFs(false)}
        >
          <View style={s.fsRoot}>
            <FlatList
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={imageFsIdx}
              getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
              data={allUrls}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item: uri }) => (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => setImageFs(false)}
                  style={{ width: W, height: '100%', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Image source={{ uri }} style={{ width: W, height: H * 0.85 }} resizeMode="contain" />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={[s.fsClose, { top: insets.top + 12 }]}
              onPress={() => setImageFs(false)}
            >
              <View style={s.fsCloseGlass}>
                <Icon name="x" size={19} color="#fff" />
              </View>
            </TouchableOpacity>
            {allUrls.length > 1 && (
              <View style={[s.fsDots, { bottom: insets.bottom + 24 }]}>
                {allUrls.map((_, i) => (
                  <View key={i} style={[s.fsDot, {
                    width: i === imageFsIdx ? 22 : 6,
                    backgroundColor: i === imageFsIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                  }]} />
                ))}
              </View>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontWeight: '700' },

  // Post principal
  postBody: { marginBottom: 8 },

  authorRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  avatar:         { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 17, fontWeight: '800' },
  verifiedDot:    { width: 15, height: 15, borderRadius: 8, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' },
  authorName:     { fontSize: 15, fontWeight: '700' },
  date:           { fontSize: 12 },
  moreBtn:        { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  feelingRow:  { paddingHorizontal: 16, paddingBottom: 12 },
  feelingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
  },
  feelingEmoji: { fontSize: 15 },
  feelingTxt:   { fontSize: 13, fontStyle: 'italic' },

  bodyTxt: {
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14,
    fontSize: 16, lineHeight: 26, letterSpacing: 0.1,
  },

  imagesWrap: { marginTop: 4, overflow: 'hidden' },

  counters: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  counterItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  counterIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  counterTxt:  { fontSize: 12, fontWeight: '500' },

  reactBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderTopWidth: StyleSheet.hairlineWidth },
  reactDivider: { width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: 2 },

  // Section publications
  secHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  secTitle:    { fontSize: 15, fontWeight: '800' },
  secCountPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  secCountTxt: { fontSize: 12, fontWeight: '600' },

  // Grille portrait
  pRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
  },
  pCard: {
    borderRadius: 14,
    overflow: 'hidden',
    // Ombre légère iOS
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  pThumbWrap: { width: '100%', overflow: 'hidden', position: 'relative' },
  pNoThumb:   { alignItems: 'center', justifyContent: 'center' },
  pStats:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pStatsLight:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  pStat:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pStatTxt:   { color: '#fff', fontSize: 11, fontWeight: '600' },
  pImgBadge:  { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  pVideoBadge:{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  pBody:      { paddingHorizontal: 10, paddingVertical: 8 },
  pBodyTxt:   { fontSize: 12, fontWeight: '400', lineHeight: 17 },

  // Menu contextuel ···
  ctxMenu: {
    position: 'absolute', top: 58, right: 14, zIndex: 20,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    minWidth: 160, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  ctxItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  ctxTxt:  { fontSize: 14, fontWeight: '500' },
  ctxSep:  { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },

  // Barre engagement
  engageWrap:       { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth },
  engageCountRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  engageCountItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  engageCountDot:   { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  engageCountTxt:   { fontSize: 13, fontWeight: '500' },
  engageBtnRow:     { flexDirection: 'row', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  engageBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  engageBtnTxt:     { fontSize: 13, fontWeight: '700' },

  // Footer
  footerLoader: { paddingVertical: 28, alignItems: 'center' },
  footerEnd:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 20 },
  footerLine:   { flex: 1, height: StyleSheet.hairlineWidth },
  footerTxt:    { fontSize: 12, fontWeight: '500' },

  // Fullscreen image
  fsRoot: { flex: 1, backgroundColor: '#000' },
  fsClose: { position: 'absolute', right: 18 },
  fsCloseGlass: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  fsDots: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 5 },
  fsDot:  { height: 6, borderRadius: 3 },
});