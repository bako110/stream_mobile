import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform, Dimensions,
  FlatList, StatusBar, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';
import type { Post } from '../../types/post';
import { postService } from '../../services/postService';
import { saveService } from '../../services/saveService';
import { favoriteService } from '../../services/favoriteService';
import { CommentsBottomSheet } from './CommentsBottomSheet';
import { ExpandableText } from './ExpandableText';
import { ShareBottomSheet } from './ShareBottomSheet';
import { InlineVideoPlayer } from './InlineVideoPlayer';
import { ReportModal } from './ReportModal';

const { width: SCREEN_W } = Dimensions.get('window');
const GAP    = 3;
const RADIUS = 12;
const GRID_H = SCREEN_W * 0.75;
const HALF_H = (GRID_H - GAP) / 2;

interface ImageGridProps {
  urls: string[];
  onPressImage?: (index: number) => void;
}

const ImgTile: React.FC<{
  uri: string; style: any; radius?: { tl?: number; tr?: number; bl?: number; br?: number };
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

const ImageGrid: React.FC<ImageGridProps> = ({ urls, onPressImage }) => {
  const n = urls.length;
  if (n === 0) return null;

  if (n === 1) {
    return (
      <ImgTile
        uri={urls[0]}
        style={{ width: '100%', aspectRatio: 1 }}
        radius={{ tl: RADIUS, tr: RADIUS, bl: RADIUS, br: RADIUS }}
        onPress={() => onPressImage?.(0)}
      />
    );
  }

  if (n === 2) {
    const W = (SCREEN_W - GAP) / 2;
    return (
      <View style={{ flexDirection: 'row', height: GRID_H, gap: GAP }}>
        <ImgTile uri={urls[0]} style={{ width: W, height: GRID_H }} radius={{ tl: RADIUS, bl: RADIUS }} onPress={() => onPressImage?.(0)} />
        <ImgTile uri={urls[1]} style={{ width: W, height: GRID_H }} radius={{ tr: RADIUS, br: RADIUS }} onPress={() => onPressImage?.(1)} />
      </View>
    );
  }

  if (n === 3) {
    const W = (SCREEN_W - GAP) / 2;
    return (
      <View style={{ flexDirection: 'row', height: GRID_H, gap: GAP }}>
        <ImgTile uri={urls[0]} style={{ width: W, height: GRID_H }} radius={{ tl: RADIUS, bl: RADIUS }} onPress={() => onPressImage?.(0)} />
        <View style={{ width: W, gap: GAP }}>
          <ImgTile uri={urls[1]} style={{ height: HALF_H }} radius={{ tr: RADIUS }} onPress={() => onPressImage?.(1)} />
          <ImgTile uri={urls[2]} style={{ height: HALF_H }} radius={{ br: RADIUS }} onPress={() => onPressImage?.(2)} />
        </View>
      </View>
    );
  }

  const shown = urls.slice(0, 4);
  const extra = n - 4;
  const W = (SCREEN_W - GAP) / 2;
  return (
    <View style={{ height: GRID_H, gap: GAP }}>
      <View style={{ flexDirection: 'row', height: HALF_H, gap: GAP }}>
        <ImgTile uri={shown[0]} style={{ width: W, height: HALF_H }} radius={{ tl: RADIUS }} onPress={() => onPressImage?.(0)} />
        <ImgTile uri={shown[1]} style={{ width: W, height: HALF_H }} radius={{ tr: RADIUS }} onPress={() => onPressImage?.(1)} />
      </View>
      <View style={{ flexDirection: 'row', height: HALF_H, gap: GAP }}>
        <ImgTile uri={shown[2]} style={{ width: W, height: HALF_H }} radius={{ bl: RADIUS }} onPress={() => onPressImage?.(2)} />
        <ImgTile
          uri={shown[3]}
          style={{ width: W, height: HALF_H }}
          radius={{ br: RADIUS }}
          onPress={() => onPressImage?.(3)}
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

interface PostCardProps {
  post: Post;
  colors: AppColors;
  currentUserId?: string;
  isActive?: boolean;
  onPress: () => void;
  onAuthorPress?: () => void;
  onDelete?: (postId: string) => void;
  onToggleFollow?: () => void;
  isFollowing?: boolean;
  onHide?: () => void;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

// ── Modal vidéo fullscreen avec player autonome ───────────────────────────────
const VideoFsModal: React.FC<{
  visible: boolean;
  uri: string;
  thumbnailUri?: string | null;
  onClose: () => void;
  onViewPost: () => void;
}> = ({ visible, uri, thumbnailUri, onClose, onViewPost }) => {
  const [navigating, setNavigating] = useState(false);

  const player = useVideoPlayer({ uri }, p => {
    p.loop = false;
    p.muted = false;
  });

  React.useEffect(() => {
    if (visible) {
      setNavigating(false);
      player.play();
    } else {
      player.pause();
    }
  }, [visible]);

  const handleViewPost = () => {
    setNavigating(true);
    try { player.pause(); player.release(); } catch {}
    onClose();
    onViewPost();
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => { try { player.pause(); player.release(); } catch {} onClose(); }}
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <VideoView
            player={player}
            style={{ width: '100%', aspectRatio: 16 / 9 }}
            resizeMode="contain"
            controls
          />
        </View>

        {/* Bouton fermer */}
        <TouchableOpacity
          style={pc.vfClose}
          onPress={() => { try { player.pause(); player.release(); } catch {} onClose(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Bouton voir détails */}
        <TouchableOpacity
          style={pc.vfDetails}
          onPress={handleViewPost}
          activeOpacity={0.85}
          disabled={navigating}
        >
          {navigating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="arrow-right" size={14} color="#fff" />
              <Text style={pc.vfDetailsTxt}>Voir les détails</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

export const PostCard: React.FC<PostCardProps> = ({
  post, colors, currentUserId, isActive = false, onPress, onAuthorPress, onDelete,
  onToggleFollow, isFollowing = false, onHide,
}) => {
  const author   = post.author;
  const name     = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials = name[0]?.toUpperCase() ?? '?';

  const insets = useSafeAreaInsets();

  const [liked,        setLiked]        = useState(post.user_reaction === 'like');
  const [likeCount,    setLikeCount]    = useState(post.like_count);
  const [commentCount, setCommentCount] = useState(post.comment_count ?? 0);
  const [saved,        setSaved]        = useState(() => saveService.isPostSaved(post.id));
  const [editOpen,     setEditOpen]     = useState(false);
  const [editBody,     setEditBody]     = useState(post.body ?? '');
  const [editSaving,   setEditSaving]   = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [commentsOpen,  setCommentsOpen]  = useState(false);
  const [shareOpen,     setShareOpen]     = useState(false);
  const [imageFs,       setImageFs]       = useState(false);
  const [imageFsIdx,    setImageFsIdx]    = useState(0);
  const [videoFs,       setVideoFs]       = useState(false);
  const [videoFsKey,    setVideoFsKey]    = useState(0);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const isOwn = !!(currentUserId && author?.id && currentUserId === author.id);

  const images = post.image_urls && post.image_urls.length > 0
    ? post.image_urls
    : post.image_url
      ? [post.image_url]
      : [];

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 6 }), withSpring(1));
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    postService.react(post.id, 'like').catch(() => {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    });
  };

  const handleDelete = () => {
    Alert.alert('Supprimer', 'Supprimer ce post ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await postService.delete(post.id);
            onDelete?.(post.id);
          } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
        },
      },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!editBody.trim()) return;
    setEditSaving(true);
    try {
      await postService.update(post.id, { body: editBody.trim() });
      post.body = editBody.trim();
      setEditOpen(false);
    } catch { Alert.alert('Erreur', 'Impossible de modifier.'); }
    finally { setEditSaving(false); }
  };

  return (
    <View style={[pc.card, { backgroundColor: colors.surface }]}>

      {/* Header */}
      <View style={pc.header} onStartShouldSetResponder={() => true}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
          activeOpacity={0.7}
          onPress={onAuthorPress}
        >
          {author?.avatar_url ? (
            <Image source={{ uri: author.avatar_url }} style={pc.avatar} />
          ) : (
            <View style={[pc.avatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[pc.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
              {author?.is_verified && (
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={9} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <Text style={[pc.time, { color: colors.textTertiary }]}>{timeAgo(post.created_at)}</Text>
              <Text style={[pc.time, { color: colors.textTertiary }]}>·</Text>
              <Icon name="globe" size={11} color={colors.textTertiary} />
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ padding: 6 }}
          onPress={() => setMenuOpen(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="more-vertical" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Menu contextuel unifié */}
      <Modal transparent animationType="slide" visible={menuOpen} onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={pc.menuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={[pc.menuSheet, { backgroundColor: colors.surface }]}>
            <View style={[pc.menuHandle, { backgroundColor: colors.divider }]} />

            {/* Titre */}
            <View style={[pc.menuTitleRow, { borderBottomColor: colors.divider }]}>
              <Icon name="file-text" size={13} color={colors.textTertiary} />
              <Text style={[pc.menuTitleText, { color: colors.textTertiary }]} numberOfLines={1}>
                {post.body ? post.body.slice(0, 50) + (post.body.length > 50 ? '…' : '') : 'Post'}
              </Text>
            </View>

            {/* Groupe 1 — actions principales */}
            <View style={[pc.menuGroup, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              <TouchableOpacity style={pc.menuAction} onPress={() => {
                setMenuOpen(false);
                const next = !saved;
                setSaved(next);
                if (next) {
                  favoriteService.save({ target_type: 'post', target_id: post.id, target_title: post.body ?? post.caption, target_thumbnail: post.media_urls?.[0] ?? post.image_url ?? null }).catch(() => setSaved(false));
                } else {
                  favoriteService.unsave('post', post.id).catch(() => setSaved(true));
                }
              }} activeOpacity={0.7}>
                <View style={[pc.menuIconWrap, { backgroundColor: saved ? '#F59E0B22' : colors.backgroundSecondary }]}>
                  <Icon name="bookmark" size={18} color={saved ? '#F59E0B' : colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[pc.menuActionText, { color: saved ? '#F59E0B' : colors.textPrimary }]}>{saved ? 'Retirer des favoris' : 'Sauvegarder'}</Text>
                  <Text style={[pc.menuActionSub, { color: colors.textTertiary }]}>{saved ? 'Dans vos favoris' : 'Retrouver plus tard'}</Text>
                </View>
                <Icon name="chevron-right" size={15} color={colors.textDisabled} />
              </TouchableOpacity>
              <View style={[pc.menuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={pc.menuAction} onPress={() => { setMenuOpen(false); setShareOpen(true); }} activeOpacity={0.7}>
                <View style={[pc.menuIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
                  <Icon name="share-2" size={18} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[pc.menuActionText, { color: colors.textPrimary }]}>Partager</Text>
                  <Text style={[pc.menuActionSub, { color: colors.textTertiary }]}>Via les apps installées</Text>
                </View>
                <Icon name="chevron-right" size={15} color={colors.textDisabled} />
              </TouchableOpacity>
            </View>

            {/* Groupe 2 — actions auteur (non-propriétaire) */}
            {!isOwn && (
              <View style={[pc.menuGroup, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                <TouchableOpacity style={pc.menuAction} onPress={() => { setMenuOpen(false); onToggleFollow?.(); }} activeOpacity={0.7}>
                  <View style={[pc.menuIconWrap, { backgroundColor: isFollowing ? '#EF444418' : colors.primary + '18' }]}>
                    <Icon name={isFollowing ? 'user-x' : 'user-plus'} size={18} color={isFollowing ? '#EF4444' : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[pc.menuActionText, { color: isFollowing ? '#EF4444' : colors.textPrimary }]}>
                      {isFollowing ? `Ne plus suivre ${name}` : `Suivre ${name}`}
                    </Text>
                    <Text style={[pc.menuActionSub, { color: colors.textTertiary }]}>
                      {isFollowing ? 'Retirer du fil' : 'Voir ses prochains contenus'}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={15} color={colors.textDisabled} />
                </TouchableOpacity>
              </View>
            )}

            {/* Groupe 3 — actions propriétaire */}
            {isOwn && (
              <View style={[pc.menuGroup, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                <TouchableOpacity style={pc.menuAction} onPress={() => { setMenuOpen(false); setEditOpen(true); }} activeOpacity={0.7}>
                  <View style={[pc.menuIconWrap, { backgroundColor: colors.primary + '18' }]}>
                    <Icon name="edit-2" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[pc.menuActionText, { color: colors.textPrimary }]}>Modifier</Text>
                    <Text style={[pc.menuActionSub, { color: colors.textTertiary }]}>Éditer le contenu du post</Text>
                  </View>
                  <Icon name="chevron-right" size={15} color={colors.textDisabled} />
                </TouchableOpacity>
                <View style={[pc.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={pc.menuAction} onPress={() => { setMenuOpen(false); handleDelete(); }} activeOpacity={0.7}>
                  <View style={[pc.menuIconWrap, { backgroundColor: '#EF444418' }]}>
                    <Icon name="trash-2" size={18} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[pc.menuActionText, { color: '#EF4444' }]}>Supprimer</Text>
                    <Text style={[pc.menuActionSub, { color: colors.textTertiary }]}>Action irréversible</Text>
                  </View>
                  <Icon name="chevron-right" size={15} color={colors.textDisabled} />
                </TouchableOpacity>
              </View>
            )}

            {/* Groupe 4 — actions négatives (non-propriétaire) */}
            {!isOwn && (
              <View style={[pc.menuGroup, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                {onHide && (
                  <>
                    <TouchableOpacity style={pc.menuAction} onPress={() => { setMenuOpen(false); onHide(); }} activeOpacity={0.7}>
                      <View style={[pc.menuIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
                        <Icon name="eye-off" size={18} color={colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[pc.menuActionText, { color: colors.textSecondary }]}>Pas intéressé</Text>
                        <Text style={[pc.menuActionSub, { color: colors.textTertiary }]}>Masquer ce post du fil</Text>
                      </View>
                      <Icon name="chevron-right" size={15} color={colors.textDisabled} />
                    </TouchableOpacity>
                    <View style={[pc.menuDivider, { backgroundColor: colors.divider }]} />
                  </>
                )}
                <TouchableOpacity style={pc.menuAction} onPress={() => { setMenuOpen(false); setReportVisible(true); }} activeOpacity={0.7}>
                  <View style={[pc.menuIconWrap, { backgroundColor: '#EF444418' }]}>
                    <Icon name="flag" size={18} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[pc.menuActionText, { color: '#EF4444' }]}>Signaler</Text>
                    <Text style={[pc.menuActionSub, { color: colors.textTertiary }]}>Contenu inapproprié</Text>
                  </View>
                  <Icon name="chevron-right" size={15} color={colors.textDisabled} />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[pc.menuCancel, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={[pc.menuCancelText, { color: colors.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Feeling */}
      {post.feeling ? (
        <Text style={[pc.feeling, { color: colors.textSecondary }]}>
          se sent <Text style={{ fontWeight: '600' }}>{post.feeling}</Text>
        </Text>
      ) : null}

      {post.body ? (
        <View style={pc.bodyWrap}>
          <ExpandableText
            text={post.body ?? ''}
            maxLines={4}
            textStyle={[pc.body, { color: colors.textPrimary }]}
            primaryColor={colors.primary}
            moreLabel="Lire la suite"
            lessLabel="Voir moins"
          />
        </View>
      ) : null}

      {/* Vidéo — autoplay muet, tap sur la zone externe = détails, tap sur le player = play/pause */}
      {post.video_url && images.length === 0 && (
        <View style={{ marginHorizontal: 12, marginBottom: 4 }}>
          <InlineVideoPlayer
            uri={post.video_url}
            thumbnailUri={post.thumbnail_url}
            aspectRatio={4 / 3}
            borderRadius={12}
            autoPlay
            muted
            isActive={isActive}
            onPress={onPress}
          />
        </View>
      )}

      {/* Images avec overlay "Voir les détails" */}
      {images.length > 0 && (
        <View>
          <ImageGrid urls={images} onPressImage={() => onPress()} />
        </View>
      )}

      {/* Compteurs */}
      {(likeCount > 0 || commentCount > 0) && (
        <View style={[pc.countsRow, { borderBottomColor: colors.divider }]}>
          {likeCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#E0389A', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="heart" size={10} color="#fff" />
              </View>
              <Text style={{ fontSize: 13, color: colors.textTertiary }}>{likeCount}</Text>
            </View>
          )}
          {commentCount > 0 && (
            <TouchableOpacity onPress={() => setCommentsOpen(true)} style={{ marginLeft: 'auto' as any }}>
              <Text style={{ fontSize: 13, color: colors.textTertiary }}>
                {commentCount} commentaire{commentCount > 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Barre sociale */}
      <View style={[pc.socialBar, { borderTopColor: colors.divider, backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
        <TouchableOpacity style={pc.socialBtn} onPress={handleLike} activeOpacity={0.8}>
          <Animated.View style={heartStyle}>
            <Icon name="heart" size={18} color={liked ? '#E0389A' : colors.textTertiary} />
          </Animated.View>
          <Text style={[pc.socialBtnText, { color: liked ? '#E0389A' : colors.textTertiary, fontWeight: liked ? '700' : '500' }]}>
            {liked ? 'Tu adores' : 'Adorer'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={pc.socialBtn} onPress={() => setCommentsOpen(true)} activeOpacity={0.8}>
          <Icon name="message-circle" size={18} color={colors.textTertiary} />
          <Text style={[pc.socialBtnText, { color: colors.textTertiary }]}>Reagir</Text>
        </TouchableOpacity>

        <TouchableOpacity style={pc.socialBtn} onPress={() => setShareOpen(true)} activeOpacity={0.8}>
          <Icon name="share-2" size={18} color={colors.textTertiary} />
          <Text style={[pc.socialBtnText, { color: colors.textTertiary }]}>Diffuser</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={pc.saveBtn}
          onPress={() => {
            if (saved) {
              setSaved(false);
              favoriteService.unsave('post', post.id).catch(() => {});
            } else {
              setSaved(true);
              favoriteService.save({
                target_type: 'post',
                target_id: post.id,
                target_title: post.body ?? post.caption,
                target_thumbnail: post.media_urls?.[0] ?? null,
              }).catch(() => {});
            }
          }}
          activeOpacity={0.8}
        >
          <Icon name="bookmark" size={18} color={saved ? colors.primary : colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <ReportModal
        visible={reportVisible}
        contentType="post"
        contentId={post.id}
        onClose={() => setReportVisible(false)}
      />

      <ShareBottomSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        post={post}
      />

      <CommentsBottomSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        onCommentCountChange={delta => setCommentCount(c => Math.max(0, c + delta))}
      />

      {/* Visionneuse plein écran */}
      <Modal
        visible={imageFs}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setImageFs(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar hidden />
          <FlatList
            data={images}
            keyExtractor={(_, i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={imageFsIdx}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            style={{ flex: 1 }}
            onMomentumScrollEnd={e => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              setImageFsIdx(idx);
            }}
            renderItem={({ item: uri }) => (
              <View style={{ width: SCREEN_W, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Image
                  source={{ uri }}
                  style={{ width: SCREEN_W, height: SCREEN_W * 1.25 }}
                  resizeMode="contain"
                />
              </View>
            )}
          />

          <TouchableOpacity
            style={{ position: 'absolute', top: insets.top + 12, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setImageFs(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="x" size={18} color="#fff" />
          </TouchableOpacity>

          {images.length > 1 && (
            <View style={{ position: 'absolute', top: insets.top + 12, left: 16, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{imageFsIdx + 1} / {images.length}</Text>
            </View>
          )}

          {images.length > 1 && (
            <View style={{ position: 'absolute', bottom: insets.bottom + 52, left: 0, right: 0, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500' }}>Glisse pour voir la suite</Text>
            </View>
          )}

          {images.length > 1 && (
            <View style={{ position: 'absolute', bottom: insets.bottom + 28, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === imageFsIdx ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === imageFsIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>

      {/* Modal vidéo fullscreen — key force le remount à chaque ouverture = player neuf */}
      {post.video_url && videoFs && (
        <VideoFsModal
          key={videoFsKey}
          visible={videoFs}
          uri={post.video_url}
          thumbnailUri={post.thumbnail_url}
          onClose={() => setVideoFs(false)}
          onViewPost={onPress}
        />
      )}

      {/* Modal édition */}
      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>Modifier le post</Text>
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              multiline
              autoFocus
              style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 10, padding: 12, fontSize: 15, color: colors.textPrimary, minHeight: 100, textAlignVertical: 'top' }}
              placeholderTextColor={colors.textTertiary}
              placeholder="Écris quelque chose..."
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                onPress={() => setEditOpen(false)}
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
    </View>
  );
};

const pc = StyleSheet.create({
  card:          { backgroundColor: '#fff' },
  header:        { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  avatar:        { width: 42, height: 42, borderRadius: 21, overflow: 'hidden' },
  authorName:    { fontSize: 14, fontWeight: '700' },
  time:          { fontSize: 12 },
  feeling:       { paddingHorizontal: 14, paddingBottom: 6, fontSize: 13, fontStyle: 'italic' },
  bodyWrap:      { paddingHorizontal: 14, paddingBottom: 10 },
  body:          { fontSize: 15, lineHeight: 22 },
  countsRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  socialBar:     { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  socialBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  socialBtnText: { fontSize: 13, fontWeight: '600' },
  miniMenu:      { position: 'absolute', top: 44, right: 12, zIndex: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', minWidth: 140, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 5 },
  miniMenuItem:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  // ── Modal menu contextuel ─────────────────────────────────────────────────
  menuOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 20, paddingTop: 10, paddingHorizontal: 12, gap: 8 },
  menuHandle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  menuTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  menuTitleText:   { fontSize: 12, fontWeight: '600' },
  menuGroup:       { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  menuAction:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
  menuIconWrap:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuActionText:  { fontSize: 15, fontWeight: '500' },
  menuActionSub:   { fontSize: 12, marginTop: 1 },
  menuDivider:     { height: StyleSheet.hairlineWidth },
  menuCancel:      { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  menuCancelText:  { fontSize: 16, fontWeight: '600' },
  saveBtn:       { paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  detailsBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  detailsBtnText:     { fontSize: 13, fontWeight: '700' },
  detailsOverlay:     { position: 'absolute', bottom: 10, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  detailsOverlayText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  vfClose: {
    position: 'absolute', top: 48, right: 16,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  vfDetails: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 30,
  },
  vfDetailsTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
