import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform, Dimensions,
  FlatList, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';
import type { Post } from '../../types/post';
import { postService } from '../../services/postService';
import { saveService } from '../../services/saveService';
import { CommentsBottomSheet } from './CommentsBottomSheet';
import { ExpandableText } from './ExpandableText';
import { ShareBottomSheet } from './ShareBottomSheet';

const { width: SCREEN_W } = Dimensions.get('window');
const GAP    = 3;
const RADIUS = 12;
const GRID_H = SCREEN_W * 0.62;
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
        style={{ width: '100%', aspectRatio: 4 / 3 }}
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
  onPress: () => void;
  onAuthorPress?: () => void;
  onDelete?: (postId: string) => void;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

export const PostCard: React.FC<PostCardProps> = ({
  post, colors, currentUserId, onPress, onAuthorPress, onDelete,
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
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen,    setShareOpen]    = useState(false);
  const [imageFs,      setImageFs]      = useState(false);
  const [imageFsIdx,   setImageFsIdx]   = useState(0);

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

      {/* Mini menu contextuel */}
      {menuOpen && (
        <View style={[pc.miniMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {isOwn ? (
            <>
              <TouchableOpacity style={pc.miniMenuItem} onPress={() => { setMenuOpen(false); setEditOpen(true); }}>
                <Icon name="edit-2" size={15} color={colors.textSecondary} />
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>Modifier</Text>
              </TouchableOpacity>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
              <TouchableOpacity style={pc.miniMenuItem} onPress={() => { setMenuOpen(false); handleDelete(); }}>
                <Icon name="trash-2" size={15} color="#EF4444" />
                <Text style={{ fontSize: 14, color: '#EF4444' }}>Supprimer</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={pc.miniMenuItem} onPress={() => setMenuOpen(false)}>
              <Icon name="flag" size={15} color={colors.textSecondary} />
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>Signaler</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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

      {/* Images avec overlay "Voir les détails" */}
      {images.length > 0 && (
        <View>
          <ImageGrid urls={images} onPressImage={i => { setImageFsIdx(i); setImageFs(true); }} />
          <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={pc.detailsOverlay}>
            <Icon name="arrow-right" size={13} color="#fff" />
            <Text style={pc.detailsOverlayText}>Voir les détails</Text>
          </TouchableOpacity>
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
            if (saved) { saveService.unsavePost(post.id); setSaved(false); }
            else       { saveService.savePost(post);      setSaved(true);  }
          }}
          activeOpacity={0.8}
        >
          <Icon name="bookmark" size={18} color={saved ? colors.primary : colors.textTertiary} />
        </TouchableOpacity>
      </View>

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
  saveBtn:       { paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  detailsBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  detailsBtnText:     { fontSize: 13, fontWeight: '700' },
  detailsOverlay:     { position: 'absolute', bottom: 10, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  detailsOverlayText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
