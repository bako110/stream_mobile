/**
 * AdSocialBar — like / commentaire / favori sur une pub, même système social
 * que posts/events/concerts (Comment.ad_id / Reaction.ad_id côté backend,
 * cf. social_service.py). Intégrée DANS la carte de pub elle-même (comme
 * AdCTA juste au-dessus) — pas une pilule flottante séparée en dessous.
 * Réduite à 3 actions : pas de partage externe ni de repost sur une pub,
 * non demandés.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../hooks/useTheme';
import { FeedActionIcon } from '../../theme/feed';
import { socialService } from '../../services/socialService';
import { favoriteService } from '../../services/favoriteService';
import { saveService } from '../../services/saveService';
import { CommentsBottomSheet } from '../common/CommentsBottomSheet';
import type { AdData } from './types';

const fmtCount = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? String(n) : '';
};

interface Props {
  ad: AdData;
  // false quand AdCTA est déjà rendu juste au-dessus (il porte déjà sa propre
  // bordure haute + marge basse, cf. AdCTA.tsx feedWrap) — évite une double
  // ligne de séparation collée l'une à l'autre.
  showDivider?: boolean;
}

export const AdSocialBar: React.FC<Props> = ({ ad, showDivider = true }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(ad.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(ad.comment_count ?? 0);
  const [saved, setSaved] = useState(() => saveService.isAdSaved(ad.id));
  const [commentsOpen, setCommentsOpen] = useState(false);
  const likeInFlight = useRef(false);

  useEffect(() => {
    socialService.getMyReaction({ ad_id: ad.id })
      .then(r => setLiked(r.reaction_type === 'like'))
      .catch(() => {});
  }, [ad.id]);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const handleLike = useCallback((e?: any) => {
    e?.stopPropagation?.();
    if (likeInFlight.current) return;
    likeInFlight.current = true;
    const next = !liked;
    setLiked(next);
    setLikeCount(c => Math.max(0, c + (next ? 1 : -1)));
    heartScale.value = withSequence(withTiming(1.25, { duration: 120 }), withTiming(1, { duration: 120 }));
    socialService.toggleReaction({ reaction_type: 'like', ad_id: ad.id })
      .catch(() => {
        setLiked(!next);
        setLikeCount(c => Math.max(0, c + (next ? -1 : 1)));
      })
      .finally(() => { likeInFlight.current = false; });
  }, [liked, ad.id, heartScale]);

  const handleSave = useCallback((e?: any) => {
    e?.stopPropagation?.();
    setSaved(s => !s);
    favoriteService.toggleAd({
      id: ad.id, title: ad.title, thumbnail_url: ad.thumbnail_url,
      creative_url: ad.creative_url, advertiser_name: ad.advertiser_name,
    }).catch(() => setSaved(s => !s));
  }, [ad]);

  const openComments = useCallback((e?: any) => {
    e?.stopPropagation?.();
    setCommentsOpen(true);
  }, []);

  return (
    <>
      {/* Intégrée dans la carte pub (comme AdCTA au-dessus) — simple rangée
          séparée par une bordure haute, pas de fond/ombre/marges propres qui
          la détacheraient visuellement en pilule flottante. stopPropagation
          sur chaque bouton : le parent (carte pub entière) est lui-même
          pressable (handleCardPress), ces boutons ne doivent jamais déclencher
          cette action en même temps que la leur. */}
      <View style={[
        s.actionBar,
        showDivider ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 11 } : { paddingTop: 2 },
      ]}>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={handleLike}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Animated.View style={[s.row, heartStyle]}>
            <MCIcon
              name={liked ? 'heart' : 'heart-outline'}
              size={FeedActionIcon.size}
              color={liked ? colors.likeActive : colors.textSecondary}
            />
            {likeCount > 0 && (
              <Text style={[s.count, { color: liked ? colors.likeActive : colors.textSecondary }]}>
                {fmtCount(likeCount)}
              </Text>
            )}
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.actionBtn}
          onPress={openComments}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <View style={s.row}>
            <MCIcon name="comment-outline" size={FeedActionIcon.size} color={colors.textSecondary} />
            {commentCount > 0 && (
              <Text style={[s.count, { color: colors.textSecondary }]}>{fmtCount(commentCount)}</Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actionBtn, s.actionBtnSave]}
          onPress={handleSave}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MCIcon
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={FeedActionIcon.size}
            color={saved ? colors.textPrimary : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <CommentsBottomSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        adId={ad.id}
        onCommentCountChange={(delta) => setCommentCount(c => Math.max(0, c + delta))}
        onCountLoaded={(count) => setCommentCount(count)}
      />
    </>
  );
};

const s = StyleSheet.create({
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginBottom: 13,
  },
  actionBtn: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' },
  actionBtnSave: { flex: 0, width: 38 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  count: { fontSize: 12.5, fontWeight: '700' },
});
