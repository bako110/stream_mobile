import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, Dimensions,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { AppColors } from '../../theme/colors';
import { FeedCardLayout, FeedRadius, FeedActionIcon } from '../../theme/feed';
import type { Post } from '../../types/post';
import { postService } from '../../services/postService';
import { saveService } from '../../services/saveService';
import { favoriteService } from '../../services/favoriteService';
import { socialService } from '../../services/socialService';
import { toastService } from '../../services/toastService';
import { showConfirm } from '../../services/confirmService';
import { CommentsBottomSheet } from './CommentsBottomSheet';
import { RichText } from './RichText';
import { ShareBottomSheet } from './ShareBottomSheet';
import { InlineVideoPlayer } from './InlineVideoPlayer';
import { ReportModal } from './ReportModal';
import { LikersBottomSheet } from './LikersBottomSheet';
import { FriendsWhoLiked } from './FriendsWhoLiked';
import { LinkPreviewCard } from './LinkPreviewCard';
import { CachedImage } from './CachedImage';
import { AvatarWithBadge } from './AvatarWithBadge';

const { width: SW } = Dimensions.get('window');
const GAP    = 2;
const RADIUS = FeedRadius.media; // 12 — aligné sur l'échelle de radius du feed

const fmtN = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
};
const GRID_H = Math.round(SW * 0.68);

// ── ImgTile ───────────────────────────────────────────────────────────────────
const ImgTile: React.FC<{
  uri: string; style: any;
  radius?: { tl?: number; tr?: number; bl?: number; br?: number };
  onPress?: () => void; overlay?: React.ReactNode;
}> = ({ uri, style, radius = {}, onPress, overlay }) => {
  const [loaded, setLoaded] = useState(false);
  const br = {
    borderTopLeftRadius:     radius.tl ?? 0,
    borderTopRightRadius:    radius.tr ?? 0,
    borderBottomLeftRadius:  radius.bl ?? 0,
    borderBottomRightRadius: radius.br ?? 0,
  };
  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress}
      style={[style, br, { overflow: 'hidden', backgroundColor: '#0d0d1a' }]}>
      {!loaded && (
        <LinearGradient
          colors={['#1a1a2e', '#252540']}
          style={StyleSheet.absoluteFill}
        />
      )}
      <CachedImage
        uri={uri}
        style={[{ width: '100%', height: '100%' }, !loaded && { opacity: 0 }]}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
      />
      {overlay}
    </TouchableOpacity>
  );
};

// ── ImageGrid ─────────────────────────────────────────────────────────────────
const ImageGrid: React.FC<{ urls: string[]; onPressImage: (i: number) => void }> = ({ urls, onPressImage }) => {
  const n = urls.length;
  if (n === 0) return null;

  if (n === 1) {
    const h = Math.round(SW * 0.75);
    return (
      <ImgTile uri={urls[0]} style={{ width: SW, height: h }}
        radius={{ tl: RADIUS, tr: RADIUS, bl: RADIUS, br: RADIUS }}
        onPress={() => onPressImage(0)} />
    );
  }
  if (n === 2) {
    const W = (SW - GAP) / 2;
    const H = Math.round(W * 1.1);
    return (
      <View style={{ flexDirection: 'row', height: H, gap: GAP }}>
        <ImgTile uri={urls[0]} style={{ flex: 1, height: H }} radius={{ tl: RADIUS, bl: RADIUS }} onPress={() => onPressImage(0)} />
        <ImgTile uri={urls[1]} style={{ flex: 1, height: H }} radius={{ tr: RADIUS, br: RADIUS }} onPress={() => onPressImage(1)} />
      </View>
    );
  }
  if (n === 3) {
    const W = (SW - GAP) / 2;
    return (
      <View style={{ flexDirection: 'row', height: GRID_H, gap: GAP }}>
        <ImgTile uri={urls[0]} style={{ width: W, height: GRID_H }} radius={{ tl: RADIUS, bl: RADIUS }} onPress={() => onPressImage(0)} />
        <View style={{ flex: 1, gap: GAP }}>
          <ImgTile uri={urls[1]} style={{ flex: 1 }} radius={{ tr: RADIUS }} onPress={() => onPressImage(1)} />
          <ImgTile uri={urls[2]} style={{ flex: 1 }} radius={{ br: RADIUS }} onPress={() => onPressImage(2)} />
        </View>
      </View>
    );
  }
  const shown = urls.slice(0, 4);
  const extra = n - 4;
  const W = (SW - GAP) / 2;
  return (
    <View style={{ height: GRID_H, gap: GAP }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: GAP }}>
        <ImgTile uri={shown[0]} style={{ flex: 1 }} radius={{ tl: RADIUS }} onPress={() => onPressImage(0)} />
        <ImgTile uri={shown[1]} style={{ flex: 1 }} radius={{ tr: RADIUS }} onPress={() => onPressImage(1)} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', gap: GAP }}>
        <ImgTile uri={shown[2]} style={{ flex: 1 }} radius={{ bl: RADIUS }} onPress={() => onPressImage(2)} />
        <ImgTile uri={shown[3]} style={{ flex: 1, width: W }} radius={{ br: RADIUS }} onPress={() => onPressImage(3)}
          overlay={extra > 0 ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', borderBottomRightRadius: RADIUS }]}>
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -1 }}>+{extra}</Text>
            </View>
          ) : null} />
      </View>
    </View>
  );
};

// ── timeAgo ───────────────────────────────────────────────────────────────────
// Paliers progressifs, comme Facebook/Instagram :
//   < 1 min → "À l'instant"
//   < 1 h   → "5 min"
//   < 24 h  → "3 h"
//   < 7 j   → "hier" / "3 j"
//   même année → "3 nov."
//   sinon   → "3 nov. 2024"
function timeAgo(iso: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days === 1)   return 'hier';
  if (days < 7)     return `${days} j`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('fr-FR', sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── VideoFsModal ──────────────────────────────────────────────────────────────
const VideoFsModal: React.FC<{
  visible: boolean; uri: string; thumbnailUri?: string | null;
  onClose: () => void; onViewPost: () => void;
}> = ({ visible, uri, onClose, onViewPost }) => {
  const [nav, setNav] = useState(false);
  const player = useVideoPlayer({ uri }, p => { p.loop = false; p.muted = false; });
  React.useEffect(() => {
    if (visible) { setNav(false); player.play(); } else { player.pause(); }
  }, [visible]);
  return (
    <Modal visible={visible} transparent={false} animationType="fade" statusBarTranslucent
      onRequestClose={() => { try { player.pause(); player.release(); } catch {} onClose(); }}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9 }} resizeMode="contain" controls />
        </View>
        <TouchableOpacity style={pc.vfClose}
          onPress={() => { try { player.pause(); player.release(); } catch {} onClose(); }}>
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={pc.vfDetails} onPress={() => { setNav(true); try { player.pause(); player.release(); } catch {} onClose(); onViewPost(); }} disabled={nav}>
          {nav ? <ActivityIndicator size="small" color="#fff" /> : (
            <><Icon name="arrow-right" size={14} color="#fff" />
              <Text style={pc.vfDetailsTxt}>Voir les détails</Text></>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface PostCardProps {
  post: Post; colors: AppColors; currentUserId?: string;
  onPress: () => void; onAuthorPress?: () => void; onProfilePress?: (userId: string) => void;
  onDelete?: (postId: string) => void; onToggleFollow?: () => void;
  isFollowing?: boolean; onHide?: () => void;
}

// ── PostCard ──────────────────────────────────────────────────────────────────
const PostCardInner: React.FC<PostCardProps> = ({
  post, colors, currentUserId, onPress, onAuthorPress, onProfilePress,
  onDelete, onToggleFollow, isFollowing = false, onHide,
}) => {
  const nav    = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const author = post.author;
  const name     = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials = name[0]?.toUpperCase() ?? '?';
  const insets   = useSafeAreaInsets();
  const isOwn    = !!(currentUserId && author?.id && currentUserId === author.id);

  const [liked,             setLiked]             = useState(post.user_reaction === 'like');
  const [likeCount,         setLikeCount]         = useState(post.like_count);
  const [commentCount,      setCommentCount]       = useState(post.comment_count ?? 0);
  const [shareCount,        setShareCount]         = useState(post.share_count ?? 0);
  const [commentsDisabledSt,setCommentsDisabledSt] = useState(post.comments_disabled ?? false);
  const [saved,             setSaved]             = useState(() => saveService.isPostSaved(post.id));
  const [editOpen,          setEditOpen]          = useState(false);
  const [editBody,          setEditBody]          = useState(post.body ?? '');
  const [editSaving,        setEditSaving]        = useState(false);
  const [menuOpen,          setMenuOpen]          = useState(false);
  const [reportOpen,   setReportOpen]   = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen,    setShareOpen]    = useState(false);
  const [videoFs,      setVideoFs]      = useState(false);
  const [likersOpen,   setLikersOpen]   = useState(false);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const images = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];

  const handleLike = useCallback(() => {
    heartScale.value = withSequence(withSpring(1.45, { damping: 5 }), withSpring(1));
    const n = !liked;
    setLiked(n);
    setLikeCount(c => n ? c + 1 : Math.max(0, c - 1));
    postService.react(post.id, 'like').catch(() => {
      setLiked(!n);
      setLikeCount(c => n ? Math.max(0, c - 1) : c + 1);
    });
  }, [liked, post.id]);

  const handleShareDone = useCallback(() => {
    setShareCount(c => c + 1);
  }, []);

  const handleDelete = useCallback(() => {
    showConfirm('Supprimer', 'Supprimer ce post ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await postService.delete(post.id); onDelete?.(post.id); }
        catch { toastService.error('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  }, [post.id, onDelete]);

  const handleSaveEdit = useCallback(async () => {
    if (!editBody.trim()) return;
    setEditSaving(true);
    try {
      await postService.update(post.id, { body: editBody.trim() });
      post.body = editBody.trim();
      setEditOpen(false);
    } catch { toastService.error('Erreur', 'Impossible de modifier.'); }
    finally { setEditSaving(false); }
  }, [editBody, post.id]);

  const handleToggleComments = useCallback(async () => {
    setMenuOpen(false);
    try {
      const res = await socialService.toggleEntityComments('post', post.id);
      setCommentsDisabledSt(res.comments_disabled);
    } catch { /**/ }
  }, [post.id]);

  const handleSave = useCallback(() => {
    const n = !saved;
    setSaved(n);
    if (n) {
      favoriteService.save({ target_type: 'post', target_id: post.id, target_title: post.body ?? post.caption, target_thumbnail: post.media_urls?.[0] ?? post.image_url ?? null }).catch(() => setSaved(false));
    } else {
      favoriteService.unsave('post', post.id).catch(() => setSaved(true));
    }
  }, [saved, post]);

  const hasMedia = images.length > 0 || !!(post.hls_url ?? post.video_url);

  // Calcul du ratio depuis les dimensions stockees, clamp portrait/paysage — plancher
  // 3/4 (au lieu de 4/5) pour des hero plus hauts/impactants sur les images portrait.
  const videoAspectRatio = (() => {
    if (post.video_width && post.video_height && post.video_width > 0 && post.video_height > 0) {
      const raw = post.video_width / post.video_height;
      return Math.min(Math.max(raw, 3 / 4), 16 / 9);
    }
    // Pas de dimensions stockées (image sans métadonnées) — 4/5 par défaut,
    // plus haut/impactant que 16/9 pour un rendu feed plus dense et professionnel.
    return 4 / 5;
  })();
  const HERO_H = Math.round(SW / videoAspectRatio);

  return (
    <View style={[pc.card, { backgroundColor: colors.surface }]}>

      {/* ── Header auteur — en haut, façon Facebook ──────────────────────────── */}
      <View style={pc.header}>
        <TouchableOpacity style={pc.headerLeft} activeOpacity={0.75} onPress={onAuthorPress}>
          <AvatarWithBadge
            avatarUrl={author?.avatar_url}
            initials={initials}
            size={40}
            accentColor={colors.primary}
            isOnline={author?.is_online}
            isLive={author?.is_live}
            style={pc.avatarWrap}
          />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[pc.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
              {author?.is_verified && (
                <View style={[pc.verifiedBadge, { backgroundColor: colors.info }]}>
                  <Icon name="check" size={8} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Text style={[pc.time, { color: colors.textTertiary }]}>{timeAgo(post.created_at)}</Text>
              <View style={[pc.dot, { backgroundColor: colors.textDisabled }]} />
              <Icon name={post.is_private ? 'users' : 'globe'} size={10} color={colors.textTertiary} />
            </View>
            {/* Badge visible uniquement par le createur, cf. ReelsScreen.tsx
                pour le meme pattern — indicateur discret, pas bloquant. */}
            {isOwn && post.ai_analysis_status === 'pending' && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => nav.navigate('AiAnalysisStatus', { contentType: 'post', contentId: post.id, initialStatus: post.ai_analysis_status })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <ActivityIndicator size="small" color={colors.textTertiary} />
                <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '600' }}>Vérification en cours…</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {!isOwn && (
            <TouchableOpacity
              style={[pc.followChip, {
                backgroundColor: isFollowing ? 'transparent' : colors.primary + '15',
                borderColor: isFollowing ? colors.border : colors.primary + '40',
              }]}
              onPress={onToggleFollow}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: isFollowing ? colors.textTertiary : colors.primary }}>
                {isFollowing ? 'Suivi' : 'Suivre'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={pc.moreBtn} onPress={() => setMenuOpen(true)}>
            <Icon name="more-horizontal" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Body texte — toujours au même endroit, avec ou sans média ────────── */}
      {post.body ? (
        <TouchableOpacity
          onPress={hasMedia ? undefined : onPress}
          activeOpacity={hasMedia ? 1 : 0.7}
          disabled={hasMedia}
          style={pc.bodyWrap}
        >
          <RichText
            text={post.body}
            maxLines={hasMedia ? 4 : 6}
            textStyle={[pc.body, { color: colors.textPrimary }]}
            primaryColor={colors.primary}
            moreLabel="Lire la suite"
            lessLabel="Voir moins"
          />
          {post.feeling && (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>
              — se sent <Text style={{ fontWeight: '700', color: colors.primary }}>{post.feeling}</Text>
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      {/* ── Media — image/vidéo, sous le texte, façon Facebook ───────────────── */}
      {hasMedia && (
        (post.hls_url ?? post.video_url) && images.length === 0 ? (
          <View style={{ height: HERO_H, backgroundColor: '#0d0d1a', overflow: 'hidden' }}>
            <InlineVideoPlayer
              uri={(post.hls_url ?? post.video_url)!}
              thumbnailUri={post.thumbnail_url}
              aspectRatio={videoAspectRatio}
              borderRadius={0}
              muted
              autoPlay={false}
              isActive={false}
            />
          </View>
        ) : (
          <TouchableOpacity onPress={onPress} activeOpacity={0.95}>
            <View style={{ height: images.length === 1 ? HERO_H : GRID_H, backgroundColor: '#0d0d1a', overflow: 'hidden' }}>
              {images.length === 1 ? (
                <CachedImage uri={images[0]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <ImageGrid
                  urls={images}
                  onPressImage={i => nav.navigate('ImageGallery', { urls: images, initialIndex: i })}
                />
              )}
            </View>
          </TouchableOpacity>
        )
      )}

      {/* ── Apercu lien ────────────────────────────────────────────────────── */}
      {post.link_url ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
          <LinkPreviewCard url={post.link_url} />
        </View>
      ) : null}

      {/* ── Résumé social — noms d'amis qui ont aimé + nb commentaires + partages.
          Seul endroit où les compteurs sont chiffrés : la barre d'actions dessous
          ne répète plus les nombres (évite le double affichage). ───────────── */}
      {(likeCount > 0 || (!commentsDisabledSt && commentCount > 0) || shareCount > 0) && (
        <View style={[pc.countsRow, { borderBottomColor: colors.divider }]}>
          {likeCount > 0 && (
            <View style={pc.countsGrow}>
              <FriendsWhoLiked
                entityType="post"
                entityId={post.id}
                totalLikes={likeCount}
                onPressLikers={() => setLikersOpen(true)}
              />
            </View>
          )}
          {likeCount === 0 && <View style={pc.countsGrow} />}
          {!commentsDisabledSt && commentCount > 0 && (
            <TouchableOpacity onPress={() => setCommentsOpen(true)} style={pc.countChipRight}>
              <View style={[pc.commentCountIcon, { backgroundColor: colors.primary }]}>
                <MCIcon name="comment-outline" size={11} color="#fff" />
              </View>
              <Text style={[pc.countText, { color: colors.textTertiary }]}>{fmtN(commentCount)}</Text>
            </TouchableOpacity>
          )}
          {shareCount > 0 && (
            <View style={[pc.countChipRight, { marginLeft: commentCount > 0 ? 12 : ('auto' as any) }]}>
              <MCIcon name="share-outline" size={13} color={colors.textTertiary} />
              <Text style={[pc.countText, { color: colors.textTertiary }]}>{fmtN(shareCount)}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Barre d'actions — icônes seules, 22px, conventionnelles (FB/IG).
          Like actif = rouge (jamais le violet de marque). ────────────────── */}
      <View style={[pc.actionBar, { borderTopColor: colors.divider }]}>
        <TouchableOpacity
          style={pc.actionBtn}
          onPress={handleLike}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Animated.View style={heartStyle}>
            <MCIcon
              name={liked ? 'heart' : 'heart-outline'}
              size={FeedActionIcon.size}
              color={liked ? colors.likeActive : colors.textSecondary}
            />
          </Animated.View>
        </TouchableOpacity>

        {!commentsDisabledSt && (
          <TouchableOpacity
            style={pc.actionBtn}
            onPress={() => setCommentsOpen(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MCIcon name="comment-outline" size={FeedActionIcon.size} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={pc.actionBtn}
          onPress={() => setShareOpen(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MCIcon name="share-outline" size={FeedActionIcon.size} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[pc.actionBtn, pc.actionBtnSave]}
          onPress={handleSave}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MCIcon
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={FeedActionIcon.size}
            color={saved ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* ── Menu contextuel — monté seulement à l'ouverture (sinon ~5 Modals
          inertes par carte × N cartes visibles restaient dans l'arbre). ──── */}
      {menuOpen && (
      <Modal transparent animationType="slide" visible onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={pc.overlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={[pc.sheet, { backgroundColor: colors.surface, paddingBottom: (Platform.OS === 'ios' ? 38 : 22) + insets.bottom }]}>
            <View style={[pc.sheetHandle, { backgroundColor: colors.divider }]} />

            {/* Apercu */}
            <View style={[pc.sheetTitle, { borderBottomColor: colors.divider }]}>
              <Icon name="file-text" size={12} color={colors.textTertiary} />
              <Text style={[pc.sheetTitleText, { color: colors.textTertiary }]} numberOfLines={1}>
                {post.body ? post.body.slice(0, 50) + (post.body.length > 50 ? '…' : '') : 'Post'}
              </Text>
            </View>

            {/* Groupe 1 */}
            <View style={[pc.menuGroup, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              <MenuRow icon="bookmark" color={saved ? '#F59E0B' : colors.textPrimary}
                iconBg={saved ? '#F59E0B18' : colors.backgroundSecondary}
                label={saved ? 'Retirer des favoris' : 'Sauvegarder'}
                sub={saved ? 'Dans vos favoris' : 'Retrouver plus tard'}
                colors={colors}
                onPress={() => { setMenuOpen(false); handleSave(); }} />
              <View style={[pc.menuDiv, { backgroundColor: colors.divider }]} />
              <MenuRow icon="share-2" color={colors.textPrimary} iconBg={colors.backgroundSecondary}
                label="Partager" sub="Via les apps installées" colors={colors}
                onPress={() => { setMenuOpen(false); setShareOpen(true); }} />
            </View>

            {/* Groupe 2 — non proprio */}
            {!isOwn && (
              <View style={[pc.menuGroup, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                <MenuRow
                  icon={isFollowing ? 'user-x' : 'user-plus'}
                  color={isFollowing ? '#EF4444' : colors.primary}
                  iconBg={isFollowing ? '#EF444418' : colors.primary + '18'}
                  label={isFollowing ? `Ne plus suivre ${name}` : `Suivre ${name}`}
                  sub={isFollowing ? 'Retirer du fil' : 'Voir ses prochains contenus'}
                  colors={colors}
                  onPress={() => { setMenuOpen(false); onToggleFollow?.(); }} />
              </View>
            )}

            {/* Groupe 3 — proprio */}
            {isOwn && (
              <View style={[pc.menuGroup, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                <MenuRow icon="edit-2" color={colors.primary} iconBg={colors.primary + '18'}
                  label="Modifier" sub="Editer le contenu" colors={colors}
                  onPress={() => { setMenuOpen(false); setEditOpen(true); }} />
                <View style={[pc.menuDiv, { backgroundColor: colors.divider }]} />
                <MenuRow
                  icon={commentsDisabledSt ? 'message-circle' : 'message-square'}
                  color={commentsDisabledSt ? '#10B981' : '#F59E0B'}
                  iconBg={commentsDisabledSt ? '#10B98118' : '#F59E0B18'}
                  label={commentsDisabledSt ? 'Activer les commentaires' : 'Desactiver les commentaires'}
                  sub={commentsDisabledSt ? 'Permettre les commentaires' : 'Bloquer les commentaires'}
                  colors={colors}
                  onPress={handleToggleComments}
                />
                <View style={[pc.menuDiv, { backgroundColor: colors.divider }]} />
                <MenuRow icon="trash-2" color="#EF4444" iconBg="#EF444418"
                  label="Supprimer" sub="Action irréversible" colors={colors}
                  onPress={() => { setMenuOpen(false); handleDelete(); }} />
              </View>
            )}

            {/* Groupe 4 — signalement */}
            {!isOwn && (
              <View style={[pc.menuGroup, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                {onHide && (
                  <>
                    <MenuRow icon="eye-off" color={colors.textSecondary} iconBg={colors.backgroundSecondary}
                      label="Pas intéressé" sub="Masquer ce post du fil" colors={colors}
                      onPress={() => { setMenuOpen(false); onHide(); }} />
                    <View style={[pc.menuDiv, { backgroundColor: colors.divider }]} />
                  </>
                )}
                <MenuRow icon="flag" color={colors.error} iconBg={colors.error + '18'}
                  label="Signaler" sub="Contenu inapproprié" colors={colors}
                  onPress={() => { setMenuOpen(false); setReportOpen(true); }} />
              </View>
            )}

            <TouchableOpacity
              style={[pc.cancelBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
              onPress={() => setMenuOpen(false)}>
              <Text style={[pc.cancelText, { color: colors.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      )}

      {/* ── Modals secondaires — tous montés à la demande uniquement ────────── */}
      {reportOpen && (
        <ReportModal visible contentType="post" contentId={post.id} onClose={() => setReportOpen(false)} />
      )}
      {shareOpen && (
        <ShareBottomSheet type="post" visible onClose={() => setShareOpen(false)} post={post} onShareCountChange={handleShareDone} />
      )}
      {commentsOpen && (
        <CommentsBottomSheet visible onClose={() => setCommentsOpen(false)} postId={post.id}
          commentsDisabled={commentsDisabledSt}
          onCommentCountChange={d => setCommentCount(c => Math.max(0, c + d))}
          onCountLoaded={n => setCommentCount(c => Math.max(c, n))} />
      )}
      {likersOpen && (
        <LikersBottomSheet visible onClose={() => setLikersOpen(false)} postId={post.id}
          likeCount={likeCount} onNavigateToProfile={uid => { setLikersOpen(false); onProfilePress?.(uid); }} />
      )}
      {(post.hls_url ?? post.video_url) && videoFs && (
        <VideoFsModal visible={videoFs} uri={(post.hls_url ?? post.video_url)!} thumbnailUri={post.thumbnail_url}
          onClose={() => setVideoFs(false)} onViewPost={onPress} />
      )}


      {/* ── Modal édition ──────────────────────────────────────────────────── */}
      {editOpen && (
      <Modal visible transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[pc.editSheet, { backgroundColor: colors.surface }]}>
            <Text style={[pc.editTitle, { color: colors.textPrimary }]}>Modifier le post</Text>
            <TextInput value={editBody} onChangeText={setEditBody} multiline autoFocus
              style={[pc.editInput, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
              placeholderTextColor={colors.textTertiary} placeholder="Écris quelque chose..." />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[pc.editBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setEditOpen(false)}>
                <Text style={{ fontWeight: '600', color: colors.textSecondary }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[pc.editBtn, { backgroundColor: colors.primary, opacity: editSaving ? 0.6 : 1 }]} onPress={handleSaveEdit} disabled={editSaving}>
                <Text style={{ fontWeight: '700', color: '#fff' }}>{editSaving ? 'Envoi...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      )}
    </View>
  );
};

// ── MenuRow helper ────────────────────────────────────────────────────────────
const MenuRow: React.FC<{
  icon: string; color: string; iconBg: string;
  label: string; sub: string; colors: AppColors; onPress: () => void;
}> = ({ icon, color, iconBg, label, sub, colors, onPress }) => (
  <TouchableOpacity style={pc.menuRow} onPress={onPress} activeOpacity={0.7}>
    <View style={[pc.menuIconWrap, { backgroundColor: iconBg }]}>
      <Icon name={icon} size={18} color={color} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[pc.menuLabel, { color }]}>{label}</Text>
      <Text style={[pc.menuSub, { color: colors.textTertiary }]}>{sub}</Text>
    </View>
    <Icon name="chevron-right" size={14} color={colors.textDisabled} />
  </TouchableOpacity>
);

export const PostCard = React.memo(PostCardInner);

// ── Styles ────────────────────────────────────────────────────────────────────
const pc = StyleSheet.create({
  // Modèle de carte unique du feed : pleine largeur, radius 0, séparation par la
  // gouttière de fond de la liste (marginBottom) — pas de carte flottante.
  card:         {
    backgroundColor: '#fff',
    marginHorizontal: FeedCardLayout.marginHorizontal,
    marginBottom: FeedCardLayout.gutter,
    borderRadius: FeedCardLayout.radius,
    overflow: 'hidden',
  },
  // Header
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  headerLeft:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarWrap:   { overflow: 'visible' },
  authorName:   { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.1 },
  time:         { fontSize: 11, fontWeight: '500' },
  dot:          { width: 3, height: 3, borderRadius: 1.5 },
  verifiedBadge:{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' },
  followChip:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: FeedRadius.chip, borderWidth: 1 },
  moreBtn:      { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  // Content
  feeling:      { paddingHorizontal: 12, paddingBottom: 5, fontSize: 13, fontStyle: 'italic' },
  bodyWrap:     { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 1 },
  body:         { fontSize: 14.5, lineHeight: 21, letterSpacing: 0.1 },
  // Compteurs
  countsRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  countsGrow:       { flex: 1, minWidth: 0 },
  countChipRight:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' },
  countText:        { fontSize: 12, fontWeight: '500' },
  commentCountIcon: { width: 18, height: 18, borderRadius: FeedRadius.full, alignItems: 'center', justifyContent: 'center' },
  // Action bar — icônes seules, 44px de cible, réparties également
  actionBar:    { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 4 },
  actionBtn:    { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionBtnSave:{ flex: 0, width: 44 },
  // Menu sheet
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 14, gap: 9 },
  sheetHandle:  { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  sheetTitle:   { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 2 },
  sheetTitleText:{ fontSize: 12, fontWeight: '600' },
  menuGroup:    { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  menuRow:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  menuIconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  menuLabel:    { fontSize: 15, fontWeight: '600' },
  menuSub:      { fontSize: 12, marginTop: 1 },
  menuDiv:      { height: StyleSheet.hairlineWidth },
  cancelBtn:    { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, marginTop: 2 },
  cancelText:   { fontSize: 16, fontWeight: '600' },
  // Edit modal
  editSheet:    { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 },
  editTitle:    { fontSize: 16, fontWeight: '700' },
  editInput:    { borderRadius: 12, padding: 14, fontSize: 15, minHeight: 110, textAlignVertical: 'top' },
  editBtn:      { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  // Video modal
  vfClose:      { position: 'absolute', top: 48, right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  vfDetails:    { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 30 },
  vfDetailsTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
