import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  RefreshControl, StyleSheet, Dimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, SkeletonTrending } from '../../components/common';
import { searchService } from '../../services';

const { width: W } = Dimensions.get('window');
const CARD_W = (W - 48) / 2;

type Tab = 'content' | 'reels';

export const TrendingScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();

  const [trending,   setTrending]   = useState<any[]>([]);
  const [reels,      setReels]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<Tab>('content');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.allSettled([
        searchService.getTrending(),
        searchService.getTrendingReels(),
      ]);
      if (t.status === 'fulfilled') setTrending(Array.isArray(t.value) ? t.value : []);
      if (r.status === 'fulfilled') setReels(Array.isArray(r.value) ? r.value : []);
    } catch { /* silencieux */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const handleContentPress = (item: any) => {
    try {
      if (item.content_type === 'serie') nav.navigate('SerieEpisodes', { item });
      else nav.navigate('FilmDetail', { item });
    } catch { /* navigation silencieuse */ }
  };

  const handleReelPress = (item: any) => {
    try {
      nav.getParent()?.navigate('Reels', { initialReelId: item.id });
    } catch {
      nav.navigate('UserReels', { userId: item.user_id ?? '', initialReelId: item.id });
    }
  };

  const data = tab === 'content' ? trending : reels;

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'content', icon: 'trending-up', label: 'Contenus' },
    { key: 'reels',   icon: 'video',       label: 'Reels'    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Tendances" variant="default" />

      {/* Tabs */}
      <View style={[s.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={s.tabBtn} onPress={() => setTab(t.key)} activeOpacity={0.7}>
              <View style={[s.tabInner, active && { backgroundColor: colors.primary + '15', borderRadius: 20 }]}>
                <Icon name={t.icon} size={15} color={active ? colors.primary : colors.textSecondary} />
                <Text style={[s.tabText, { color: active ? colors.primary : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>
                  {t.label}
                </Text>
              </View>
              {active && <View style={[s.tabUnderline, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <SkeletonTrending />
      ) : tab === 'content' ? (
        <FlatList
          data={trending}
          keyExtractor={i => i.id}
          numColumns={2}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          columnWrapperStyle={{ gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListHeaderComponent={<HeroBanner count={trending.length} label="contenus" />}
          ListEmptyComponent={<EmptyState colors={colors} />}
          renderItem={({ item, index }) => (
            <ContentCard item={item} index={index} colors={colors} onPress={() => handleContentPress(item)} />
          )}
        />
      ) : (
        <FlatList
          data={reels}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListHeaderComponent={<HeroBanner count={reels.length} label="reels" />}
          ListEmptyComponent={<EmptyState colors={colors} />}
          renderItem={({ item, index }) => (
            <ReelRow item={item} index={index} colors={colors} onPress={() => handleReelPress(item)} />
          )}
        />
      )}
    </View>
  );
};

// ── Hero banner ───────────────────────────────────────────────────────────────

const HeroBanner: React.FC<{ count: number; label: string }> = ({ count, label }) => (
  <Animated.View entering={FadeInDown.springify()} style={[s.heroBanner]}>
    <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.heroBannerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Icon name="trending-up" size={28} color="#fff" />
      <View style={{ marginLeft: 12 }}>
        <Text style={s.heroTitle}>Top tendances</Text>
        <Text style={s.heroSub}>{count} {label} populaires</Text>
      </View>
    </LinearGradient>
  </Animated.View>
);

// ── Empty state ───────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={s.empty}>
    <View style={[s.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
      <Icon name="trending-up" size={28} color={colors.textTertiary} />
    </View>
    <Text style={[s.emptyText, { color: colors.textSecondary }]}>Aucune tendance pour l'instant</Text>
  </View>
);

// ── Content card (grille 2 colonnes) ─────────────────────────────────────────

const ContentCard: React.FC<{ item: any; index: number; colors: any; onPress: () => void }> = ({ item, index, colors, onPress }) => {
  const GRADS: [string, string][] = [
    ['#7B3FF2', '#E0389A'], ['#0EA5E9', '#6366F1'],
    ['#10B981', '#0EA5E9'], ['#F59E0B', '#EF4444'],
    ['#EC4899', '#8B5CF6'], ['#14B8A6', '#3B82F6'],
  ];
  const grad = GRADS[index % GRADS.length];
  const fmtViews = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n ?? 0);

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()} style={{ width: CARD_W }}>
      <TouchableOpacity style={[s.contentCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onPress} activeOpacity={0.85}>
        {/* Rank badge */}
        <View style={[s.rankBadge, { backgroundColor: index < 3 ? '#F59E0B' : colors.primary }]}>
          <Text style={s.rankText}>#{index + 1}</Text>
        </View>

        {/* Thumbnail */}
        <View style={s.contentThumb}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={grad} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="film" size={30} color="rgba(255,255,255,0.7)" />
              </View>
            </LinearGradient>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={s.contentThumbGrad} />
        </View>

        {/* Infos */}
        <View style={s.contentBody}>
          <Text style={[s.contentTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.title ?? 'Sans titre'}
          </Text>
          {!!item.view_count && (
            <View style={s.statRow}>
              <Icon name="eye" size={11} color={colors.textTertiary} />
              <Text style={[s.statText, { color: colors.textTertiary }]}>{fmtViews(item.view_count)}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Reel row (liste) ──────────────────────────────────────────────────────────

const ReelRow: React.FC<{ item: any; index: number; colors: any; onPress: () => void }> = ({ item, index, colors, onPress }) => {
  const fmtViews = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n ?? 0);

  return (
    <Animated.View entering={FadeInRight.delay(index * 40).springify()}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={[s.reelRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Rank */}
        <View style={[s.reelRank, { backgroundColor: index < 3 ? '#F59E0B18' : colors.backgroundSecondary }]}>
          <Text style={[s.reelRankText, { color: index < 3 ? '#F59E0B' : colors.textTertiary }]}>#{index + 1}</Text>
        </View>

        {/* Thumbnail */}
        <View style={s.reelThumb}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <LinearGradient colors={['#7B3FF2', '#E0389A']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="video" size={20} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.reelPlayIcon}>
            <Icon name="play" size={11} color="#fff" />
          </View>
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <Text style={[s.reelCaption, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.caption ?? 'Reel'}
          </Text>
          <View style={s.reelStats}>
            {!!item.view_count && (
              <View style={s.statRow}>
                <Icon name="eye" size={11} color={colors.textTertiary} />
                <Text style={[s.statText, { color: colors.textTertiary }]}>{fmtViews(item.view_count)}</Text>
              </View>
            )}
            {!!item.like_count && (
              <View style={s.statRow}>
                <Icon name="heart" size={11} color={colors.textTertiary} />
                <Text style={[s.statText, { color: colors.textTertiary }]}>{fmtViews(item.like_count)}</Text>
              </View>
            )}
          </View>
        </View>

        <Icon name="chevron-right" size={16} color={colors.textDisabled} />
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  tabBar:       { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:       { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabInner:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6 },
  tabText:      { fontSize: 13 },
  tabUnderline: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, borderRadius: 2 },

  heroBanner:   { borderRadius: 16, overflow: 'hidden', marginBottom: 4 },
  heroBannerGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 },
  heroTitle:    { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  heroSub:      { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },

  empty:        { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon:    { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  emptyText:    { fontSize: 15, fontWeight: '500' },

  contentCard:  { borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  rankBadge:    { position: 'absolute', top: 8, left: 8, zIndex: 2, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  rankText:     { color: '#fff', fontSize: 11, fontWeight: '800' },
  contentThumb: { width: '100%', height: 130, position: 'relative', overflow: 'hidden' },
  contentThumbGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 50 },
  contentBody:  { padding: 10 },
  contentTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17 },

  reelRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  reelRank:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  reelRankText: { fontSize: 12, fontWeight: '800' },
  reelThumb:    { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  reelPlayIcon: { position: 'absolute', bottom: 0, left: 0, right: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  reelCaption:  { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  reelStats:    { flexDirection: 'row', gap: 10, marginTop: 4 },

  statRow:      { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  statText:     { fontSize: 11 },
});
