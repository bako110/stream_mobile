import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet, Share, Alert,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';
import type { Post } from '../../types/post';
import { postService } from '../../services/postService';

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

  const [liked,         setLiked]         = useState(post.user_reaction === 'like');
  const [likeCount,     setLikeCount]     = useState(post.like_count);
  const [bodyExpanded,  setBodyExpanded]  = useState(false);
  const [bodyTruncated, setBodyTruncated] = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const isOwn = !!(currentUserId && author?.id && currentUserId === author.id);

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

  const handleShare = async () => {
    try {
      await Share.share({ message: post.body ? `${post.body}\n\nVia FoliX` : 'Via FoliX' });
    } catch { /* annulé */ }
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

  return (
    // Toute la carte est cliquable → PostDetail
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => { if (menuOpen) { setMenuOpen(false); return; } onPress(); }}
      style={[pc.card, { backgroundColor: colors.surface }]}
    >
      {/* ── Header ── */}
      <View style={pc.header}>
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
            <TouchableOpacity style={pc.miniMenuItem} onPress={() => { setMenuOpen(false); handleDelete(); }}>
              <Icon name="trash-2" size={15} color="#EF4444" />
              <Text style={{ fontSize: 14, color: '#EF4444' }}>Supprimer</Text>
            </TouchableOpacity>
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

      {/* Body */}
      {post.body ? (
        <View style={pc.bodyWrap}>
          <Text
            style={[pc.body, { color: colors.textPrimary }]}
            numberOfLines={bodyExpanded ? undefined : 4}
            onTextLayout={e => {
              if (!bodyExpanded && e.nativeEvent.lines.length > 4) setBodyTruncated(true);
            }}
          >
            {post.body}
          </Text>
          {bodyTruncated && !bodyExpanded && (
            <TouchableOpacity onPress={() => setBodyExpanded(true)}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', marginTop: 2 }}>
                Lire la suite
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Image */}
      {post.image_url ? (
        <Image source={{ uri: post.image_url }} style={pc.image} resizeMode="cover" />
      ) : null}

      {/* Compteurs */}
      {(likeCount > 0 || post.comment_count > 0) && (
        <View style={[pc.countsRow, { borderBottomColor: colors.divider }]}>
          {likeCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#E0389A', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="heart" size={10} color="#fff" />
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

      {/* Barre sociale — stopPropagation pour ne pas déclencher onPress de la carte */}
      <View style={[pc.socialBar, { borderTopColor: colors.divider }]}>
        <TouchableOpacity style={pc.socialBtn} onPress={handleLike} activeOpacity={0.8}>
          <Animated.View style={heartStyle}>
            <Icon name="heart" size={18} color={liked ? '#E0389A' : colors.textTertiary} />
          </Animated.View>
          <Text style={[pc.socialBtnText, { color: liked ? '#E0389A' : colors.textTertiary }]}>
            {likeCount > 0 ? String(likeCount) : 'J\'aime'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={pc.socialBtn} onPress={onPress} activeOpacity={0.8}>
          <Icon name="message-circle" size={18} color={colors.textTertiary} />
          <Text style={[pc.socialBtnText, { color: colors.textTertiary }]}>
            {post.comment_count > 0 ? String(post.comment_count) : 'Commenter'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={pc.socialBtn} onPress={handleShare} activeOpacity={0.8}>
          <Icon name="share-2" size={18} color={colors.textTertiary} />
          <Text style={[pc.socialBtnText, { color: colors.textTertiary }]}>Partager</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 8, backgroundColor: colors.backgroundSecondary }} />
    </TouchableOpacity>
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
  image:         { width: '100%', aspectRatio: 16 / 9 },
  countsRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  socialBar:     { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  socialBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  socialBtnText: { fontSize: 13, fontWeight: '600' },
  miniMenu:      { position: 'absolute', top: 44, right: 12, zIndex: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', minWidth: 140, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 5 },
  miniMenuItem:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
});
