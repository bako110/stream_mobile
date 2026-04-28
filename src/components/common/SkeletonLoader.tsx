/**
 * SkeletonLoader — shimmer Facebook-style
 * Utilise Reanimated pour l'animation shimmer fluide
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, interpolate,
  Easing,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, Spacing } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Shimmer de base ───────────────────────────────────────────────────────────

export const SkeletonBox: React.FC<{
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}> = ({ width = '100%', height = 16, borderRadius: br = BorderRadius.sm, style }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shimmer.value, [0, 1], [-SCREEN_WIDTH, SCREEN_WIDTH]) },
    ],
  }));

  return (
    <View
      style={[
        { width, height, borderRadius: br, backgroundColor: colors.skeleton, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
        <LinearGradient
          colors={['transparent', colors.skeletonHighlight + 'E0', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

// ── Skeleton Hero ─────────────────────────────────────────────────────────────

export const SkeletonHero: React.FC = () => (
  <View style={skStyles.hero}>
    <SkeletonBox height={200} borderRadius={BorderRadius.xl} />
  </View>
);

// ── Skeleton Section header ───────────────────────────────────────────────────

export const SkeletonSectionHeader: React.FC = () => (
  <View style={skStyles.sectionHeader}>
    <SkeletonBox width={120} height={18} />
    <SkeletonBox width={60} height={13} />
  </View>
);

// ── Skeleton Card horizontale (concert/event) ─────────────────────────────────

export const SkeletonCard: React.FC = () => (
  <View style={skStyles.card}>
    <SkeletonBox height={110} borderRadius={0} />
    <View style={skStyles.cardBody}>
      <SkeletonBox width="90%" height={13} />
      <SkeletonBox width="60%" height={11} style={{ marginTop: 5 }} />
      <SkeletonBox width="40%" height={11} style={{ marginTop: 4 }} />
    </View>
  </View>
);

// ── Skeleton Row liste ────────────────────────────────────────────────────────

export const SkeletonRow: React.FC = () => (
  <View style={skStyles.row}>
    <SkeletonBox width={72} height={72} borderRadius={BorderRadius.md} />
    <View style={skStyles.rowBody}>
      <SkeletonBox width="80%" height={14} />
      <SkeletonBox width="55%" height={12} style={{ marginTop: 6 }} />
      <SkeletonBox width="40%" height={11} style={{ marginTop: 5 }} />
    </View>
  </View>
);

// ── Skeleton HomeScreen complet (Facebook-style) ──────────────────────────────

export const SkeletonHome: React.FC = () => (
  <View style={{ flex: 1 }}>
    <SkeletonHero />
    <SkeletonSectionHeader />
    <View style={skStyles.rowScroll}>
      {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
    </View>
    <SkeletonSectionHeader />
    <View style={skStyles.rowScroll}>
      {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
    </View>
    <SkeletonSectionHeader />
    <View style={skStyles.categoriesGrid}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <SkeletonBox key={i} width="30%" height={70} borderRadius={BorderRadius.lg} />
      ))}
    </View>
  </View>
);

// ── Skeleton Feed (events/concerts liste) ─────────────────────────────────────

export const SkeletonFeed: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <View style={{ paddingHorizontal: Spacing[4], paddingTop: Spacing[4], gap: 12 }}>
    {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} />)}
  </View>
);

// ── Skeleton FeedScreen complet (header + stories + posts) ────────────────────

const SkeletonPostCard: React.FC = () => (
  <View style={skStyles.postCard}>
    {/* Header auteur */}
    <View style={skStyles.postHeader}>
      <SkeletonBox width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width="50%" height={13} />
        <SkeletonBox width="30%" height={10} />
      </View>
      <SkeletonBox width={60} height={28} borderRadius={14} />
    </View>
    {/* Image */}
    <SkeletonBox width="100%" height={200} borderRadius={0} />
    {/* Actions */}
    <View style={skStyles.postActions}>
      <SkeletonBox width={70} height={32} borderRadius={16} />
      <SkeletonBox width={90} height={32} borderRadius={16} />
      <SkeletonBox width={70} height={32} borderRadius={16} />
    </View>
  </View>
);

export const SkeletonFeedScreen: React.FC = () => (
  <View style={{ flex: 1 }}>
    {/* Stories */}
    <View style={skStyles.storiesRow}>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i} style={{ alignItems: 'center', gap: 6 }}>
          <SkeletonBox width={60} height={60} borderRadius={30} />
          <SkeletonBox width={44} height={9} borderRadius={4} />
        </View>
      ))}
    </View>
    {/* Posts */}
    <SkeletonPostCard />
    <SkeletonPostCard />
  </View>
);

// ── Skeleton ProfileScreen ────────────────────────────────────────────────────

export const SkeletonProfile: React.FC = () => (
  <View style={{ flex: 1 }}>
    {/* Avatar + nom */}
    <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 20, gap: 10 }}>
      <SkeletonBox width={90} height={90} borderRadius={45} />
      <SkeletonBox width={140} height={16} borderRadius={8} />
      <SkeletonBox width={90} height={12} borderRadius={6} />
      <SkeletonBox width={80} height={28} borderRadius={14} style={{ marginTop: 4 }} />
      {/* Boutons action */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <SkeletonBox width={150} height={36} borderRadius={18} />
        <SkeletonBox width={40} height={36} borderRadius={18} />
      </View>
    </View>
    {/* Stats */}
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 20 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <SkeletonBox width="100%" height={60} borderRadius={12} />
        </View>
      ))}
    </View>
    {/* Section À propos */}
    <View style={{ paddingHorizontal: 16, gap: 10 }}>
      <SkeletonBox width={80} height={11} borderRadius={5} />
      <SkeletonBox width="70%" height={14} borderRadius={7} />
      <SkeletonBox width="50%" height={14} borderRadius={7} />
    </View>
    {/* Section publications */}
    <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 10 }}>
      <SkeletonBox width={100} height={11} borderRadius={5} />
      {[0, 1].map(i => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <SkeletonBox width={56} height={56} borderRadius={8} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox width="80%" height={13} borderRadius={6} />
            <SkeletonBox width="50%" height={10} borderRadius={5} />
          </View>
        </View>
      ))}
    </View>
  </View>
);

// ── Skeleton ReelsScreen ──────────────────────────────────────────────────────

export const SkeletonReels: React.FC = () => (
  <View style={{ flex: 1, backgroundColor: '#000' }}>
    {/* Plein écran dark shimmer */}
    <SkeletonBox width="100%" height="100%" borderRadius={0} style={{ position: 'absolute', top: 0, left: 0 }} />
    {/* Header flottant */}
    <View style={{ position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <SkeletonBox width={36} height={36} borderRadius={18} />
      <SkeletonBox width={60} height={16} borderRadius={8} />
    </View>
    {/* Barre droite actions */}
    <View style={{ position: 'absolute', right: 14, bottom: 140, gap: 22, alignItems: 'center' }}>
      <SkeletonBox width={40} height={40} borderRadius={20} />
      <SkeletonBox width={40} height={40} borderRadius={20} />
      <SkeletonBox width={40} height={40} borderRadius={20} />
      <SkeletonBox width={40} height={40} borderRadius={20} />
    </View>
    {/* Infos auteur bas gauche */}
    <View style={{ position: 'absolute', left: 14, bottom: 100, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <SkeletonBox width={40} height={40} borderRadius={20} />
        <SkeletonBox width={100} height={14} borderRadius={7} />
      </View>
      <SkeletonBox width={200} height={12} borderRadius={6} />
      <SkeletonBox width={150} height={12} borderRadius={6} />
    </View>
    {/* Barre progression */}
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
      <SkeletonBox width="100%" height={3} borderRadius={0} />
    </View>
  </View>
);

// ── Skeleton liste utilisateurs (Following / Blocked) ────────────────────────

export const SkeletonUserList: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <SkeletonBox width={48} height={48} borderRadius={24} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox width="60%" height={14} borderRadius={7} />
          <SkeletonBox width="40%" height={11} borderRadius={5} />
        </View>
        <SkeletonBox width={80} height={32} borderRadius={16} />
      </View>
    ))}
  </View>
);

// ── Skeleton Messages ─────────────────────────────────────────────────────────

export const SkeletonMessages: React.FC = () => (
  <View style={{ flex: 1, paddingTop: 8 }}>
    {Array.from({ length: 7 }).map((_, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <SkeletonBox width={52} height={52} borderRadius={26} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <SkeletonBox width="45%" height={14} borderRadius={7} />
            <SkeletonBox width={40} height={11} borderRadius={5} />
          </View>
          <SkeletonBox width="70%" height={11} borderRadius={5} />
        </View>
      </View>
    ))}
  </View>
);

// ── Skeleton EventDetail / ConcertDetail ──────────────────────────────────────

export const SkeletonDetail: React.FC = () => (
  <View style={{ flex: 1 }}>
    {/* Banner */}
    <SkeletonBox width="100%" height={280} borderRadius={0} />
    {/* Pills date/prix */}
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14 }}>
      <SkeletonBox width={100} height={28} borderRadius={14} />
      <SkeletonBox width={80} height={28} borderRadius={14} />
      <SkeletonBox width={70} height={28} borderRadius={14} />
    </View>
    {/* Titre */}
    <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 8 }}>
      <SkeletonBox width="85%" height={22} borderRadius={10} />
      <SkeletonBox width="60%" height={16} borderRadius={8} />
    </View>
    {/* Social bar */}
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16 }}>
      <SkeletonBox width={80} height={36} borderRadius={18} />
      <SkeletonBox width={100} height={36} borderRadius={18} />
      <SkeletonBox width={80} height={36} borderRadius={18} />
      <SkeletonBox width={44} height={36} borderRadius={18} />
    </View>
    {/* Description */}
    <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 8 }}>
      <SkeletonBox width="100%" height={13} borderRadius={6} />
      <SkeletonBox width="90%" height={13} borderRadius={6} />
      <SkeletonBox width="75%" height={13} borderRadius={6} />
    </View>
    {/* Info rows */}
    <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 12 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SkeletonBox width={36} height={36} borderRadius={18} />
          <View style={{ flex: 1, gap: 5 }}>
            <SkeletonBox width="55%" height={13} borderRadius={6} />
            <SkeletonBox width="35%" height={10} borderRadius={5} />
          </View>
        </View>
      ))}
    </View>
  </View>
);

// ── Skeleton UserProfile ──────────────────────────────────────────────────────

export const SkeletonUserProfile: React.FC = () => (
  <View style={{ flex: 1 }}>
    {/* Banner */}
    <SkeletonBox width="100%" height={160} borderRadius={0} />
    {/* Avatar + bouton */}
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: -40 }}>
      <SkeletonBox width={86} height={86} borderRadius={43} />
      <SkeletonBox width={100} height={36} borderRadius={18} />
    </View>
    {/* Nom + handle + bio */}
    <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 7 }}>
      <SkeletonBox width={160} height={18} borderRadius={9} />
      <SkeletonBox width={100} height={13} borderRadius={6} />
      <SkeletonBox width="85%" height={12} borderRadius={6} />
      <SkeletonBox width="65%" height={12} borderRadius={6} />
    </View>
    {/* Stats */}
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
          <SkeletonBox width={50} height={20} borderRadius={10} />
          <SkeletonBox width={60} height={11} borderRadius={5} />
        </View>
      ))}
    </View>
    {/* Tabs */}
    <View style={{ flexDirection: 'row', gap: 0, marginTop: 20, paddingHorizontal: 16 }}>
      {[0, 1, 2].map(i => (
        <SkeletonBox key={i} width={80} height={36} borderRadius={8} style={{ marginRight: 8 }} />
      ))}
    </View>
    {/* Content grid */}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 16 }}>
      {[0, 1, 2, 3].map(i => (
        <SkeletonBox key={i} width="47%" height={120} borderRadius={12} />
      ))}
    </View>
  </View>
);

// ── Skeleton Communities ──────────────────────────────────────────────────────

export const SkeletonCommunities: React.FC = () => (
  <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
    {Array.from({ length: 5 }).map((_, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14 }}>
        <SkeletonBox width={56} height={56} borderRadius={28} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox width="60%" height={15} borderRadius={7} />
          <SkeletonBox width="40%" height={11} borderRadius={5} />
          <SkeletonBox width="80%" height={10} borderRadius={5} />
        </View>
        <SkeletonBox width={72} height={32} borderRadius={16} />
      </View>
    ))}
  </View>
);

// ── Skeleton Trending ─────────────────────────────────────────────────────────

export const SkeletonTrending: React.FC = () => (
  <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
    {Array.from({ length: 6 }).map((_, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <SkeletonBox width={28} height={20} borderRadius={6} />
        <SkeletonBox width={64} height={64} borderRadius={10} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox width="70%" height={14} borderRadius={7} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SkeletonBox width={50} height={11} borderRadius={5} />
            <SkeletonBox width={50} height={11} borderRadius={5} />
          </View>
        </View>
      </View>
    ))}
  </View>
);

// ── Skeleton Films / Séries ───────────────────────────────────────────────────

export const SkeletonFilms: React.FC = () => (
  <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 12 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={{ width: '47%', gap: 6 }}>
          <SkeletonBox width="100%" height={160} borderRadius={12} />
          <SkeletonBox width="75%" height={13} borderRadius={6} />
          <SkeletonBox width="50%" height={10} borderRadius={5} />
        </View>
      ))}
    </View>
  </View>
);

// ── Skeleton Subscriptions ────────────────────────────────────────────────────

export const SkeletonSubscriptions: React.FC = () => (
  <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20, gap: 16 }}>
    <SkeletonBox width="100%" height={180} borderRadius={18} />
    <View style={{ gap: 10, marginTop: 8 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <SkeletonBox width={20} height={20} borderRadius={10} />
          <SkeletonBox width="70%" height={13} borderRadius={6} />
        </View>
      ))}
    </View>
    <SkeletonBox width="100%" height={50} borderRadius={14} style={{ marginTop: 8 }} />
    <View style={{ marginTop: 16, gap: 10 }}>
      <SkeletonBox width={120} height={14} borderRadius={7} />
      {[0, 1].map(i => (
        <SkeletonBox key={i} width="100%" height={60} borderRadius={12} />
      ))}
    </View>
  </View>
);

// ── Skeleton EditProfile ──────────────────────────────────────────────────────

export const SkeletonEditProfile: React.FC = () => (
  <View style={{ flex: 1 }}>
    {/* Banner */}
    <SkeletonBox width="100%" height={140} borderRadius={0} />
    {/* Avatar */}
    <View style={{ paddingHorizontal: 16, marginTop: -30 }}>
      <SkeletonBox width={80} height={80} borderRadius={40} />
    </View>
    {/* Champs */}
    <View style={{ paddingHorizontal: 16, marginTop: 24, gap: 16 }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <View key={i} style={{ gap: 6 }}>
          <SkeletonBox width={100} height={11} borderRadius={5} />
          <SkeletonBox width="100%" height={44} borderRadius={10} />
        </View>
      ))}
    </View>
  </View>
);

// ── Skeleton LiveList ─────────────────────────────────────────────────────────

export const SkeletonLiveList: React.FC = () => (
  <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
    <SkeletonBox width={100} height={14} borderRadius={7} />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {[0, 1, 2].map(i => (
        <SkeletonBox key={i} width={130} height={180} borderRadius={14} />
      ))}
    </View>
    <SkeletonBox width={120} height={14} borderRadius={7} style={{ marginTop: 8 }} />
    {[0, 1, 2].map(i => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <SkeletonBox width={72} height={72} borderRadius={12} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox width="70%" height={14} borderRadius={7} />
          <SkeletonBox width="50%" height={11} borderRadius={5} />
          <SkeletonBox width="40%" height={10} borderRadius={5} />
        </View>
      </View>
    ))}
  </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const skStyles = StyleSheet.create({
  hero: {
    marginHorizontal: Spacing[4],
    marginTop:        Spacing[4],
  },
  sectionHeader: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    marginHorizontal: Spacing[4],
    marginTop:        Spacing[7],
    marginBottom:     Spacing[3],
  },
  rowScroll: {
    flexDirection:  'row',
    gap:            12,
    paddingLeft:    Spacing[4],
  },
  card: {
    width:        160,
    borderRadius: BorderRadius.lg,
    overflow:     'hidden',
  },
  cardBody: {
    padding: 10,
  },
  row: {
    flexDirection:  'row',
    gap:            12,
    alignItems:     'center',
    marginBottom:   12,
  },
  rowBody: {
    flex: 1,
    gap:  4,
  },
  categoriesGrid: {
    flexDirection:    'row',
    flexWrap:         'wrap',
    marginHorizontal: Spacing[4],
    gap:              10,
  },
  storiesRow: {
    flexDirection: 'row', gap: 14,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  postCard: {
    marginBottom: 8,
    overflow: 'hidden',
  },
  postHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  postActions: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
  },
});
