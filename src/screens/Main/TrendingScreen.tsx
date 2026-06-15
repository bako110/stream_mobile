import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  RefreshControl, StyleSheet, Dimensions, Linking,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, SkeletonTrending } from '../../components/common';
import { searchService } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

const { width: W } = Dimensions.get('window');
const CARD_W = (W - 48) / 2;

// ── Types pub ─────────────────────────────────────────────────────────────────

interface SearchAdData {
  id: string;
  title: string;
  description?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  creative_url?: string | null;
  thumbnail_url?: string | null;
}

// ── SearchAdCard — pub native inline dans les resultats ───────────────────────

const SearchAdCard: React.FC<{
  ad: SearchAdData;
  colors: any;
  onImpression: (id: string) => void;
}> = ({ ad, colors, onImpression }) => {
  const firedRef = useRef<string | null>(null);
  useEffect(() => {
    if (ad?.id && firedRef.current !== ad.id) {
      firedRef.current = ad.id;
      onImpression(ad.id);
    }
  }, [ad?.id, onImpression]);

  return (
    <View style={[sAd.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>

      {/* En-tête annonceur */}
      <View style={sAd.header}>
        <View style={[sAd.logoWrap, { backgroundColor: colors.primary + '18' }]}>
          <Icon name="zap" size={14} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sAd.advertiserName, { color: colors.textPrimary }]} numberOfLines={1}>
            {ad.title}
          </Text>
          <View style={sAd.sponsoredRow}>
            <Text style={[sAd.sponsoredLabel, { color: colors.textTertiary }]}>Sponsorisé</Text>
            <Icon name="globe" size={9} color={colors.textTertiary} />
          </View>
        </View>
      </View>

      {/* Image ou placeholder */}
      {(ad.creative_url || ad.thumbnail_url) ? (
        <Image
          source={{ uri: (ad.creative_url || ad.thumbnail_url)! }}
          style={sAd.image}
          resizeMode="cover"
        />
      ) : null}

      {/* Description */}
      {!!ad.description && (
        <Text style={[sAd.desc, { color: colors.textSecondary }]} numberOfLines={2}>
          {ad.description}
        </Text>
      )}

      {/* Pied : domaine + CTA */}
      <View style={[sAd.footer, { borderTopColor: colors.divider }]}>
        {ad.cta_url ? (
          <Text style={[sAd.domain, { color: colors.textTertiary }]} numberOfLines={1}>
            {ad.cta_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[sAd.ctaBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
          activeOpacity={0.8}
          onPress={() => {
            if (!ad.cta_url) return;
            apiClient.post(`/api/v1/ads/${ad.id}/click`).catch(() => {});
            Linking.openURL(ad.cta_url).catch(() => {});
          }}
        >
          <Text style={[sAd.ctaTxt, { color: colors.textPrimary }]}>{ad.cta_text ?? 'En savoir plus'}</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
};

const sAd = StyleSheet.create({
  card:           { borderWidth: StyleSheet.hairlineWidth, marginBottom: 8, marginHorizontal: 16 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 8 },
  logoWrap:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  advertiserName: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  sponsoredRow:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  sponsoredLabel: { fontSize: 10 },
  image:          { width: '100%', height: 160 },
  desc:           { fontSize: 13, lineHeight: 18, paddingHorizontal: 12, paddingTop: 8 },
  footer:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  domain:         { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, flex: 1 },
  ctaBtn:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  ctaTxt:         { fontSize: 12, fontWeight: '700' },
});

type Tab = 'content' | 'reels';

// ── Helper : injecte une pub tous les AD_EVERY items ─────────────────────────

const AD_EVERY = 5;

function injectAds<T>(items: T[], ad: SearchAdData | null): (T | { __ad: true; ad: SearchAdData })[] {
  if (!ad) return items;
  const result: (T | { __ad: true; ad: SearchAdData })[] = [];
  items.forEach((item, idx) => {
    result.push(item);
    if ((idx + 1) % AD_EVERY === 0) {
      result.push({ __ad: true, ad });
    }
  });
  return result;
}

export const TrendingScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();

  const [trending,   setTrending]   = useState<any[]>([]);
  const [reels,      setReels]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<Tab>('content');
  const [refreshing, setRefreshing] = useState(false);
  const [searchAd,   setSearchAd]   = useState<SearchAdData | null>(null);

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

  // Chargement de la pub search
  useEffect(() => {
    apiClient.get<SearchAdData | null>(Endpoints.ads.feedNext('search'))
      .then((res: { data: SearchAdData | null }) => { if (res.data?.id) setSearchAd(res.data); })
      .catch(() => {});
  }, []);

  const handleAdImpression = useCallback((id: string) => {
    apiClient.post(Endpoints.ads.impression(id)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, []);

  const handleContentPress = (item: any) => {
    if (item.type === 'serie' || item.content_type === 'serie') {
      nav.navigate('SerieEpisodes', { item });
    } else {
      nav.navigate('FilmDetail', { item });
    }
  };

  const handleReelPress = (item: any) => {
    nav.navigate('UserReels', {
      userId:       item.user_id ?? '',
      initialReelId: item.id,
      initialReels:  reels,
    });
  };

  const rawData = tab === 'content' ? trending : reels;
  const data = injectAds(rawData, searchAd);

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

      {loading && trending.length === 0 && reels.length === 0 ? (
        <SkeletonTrending />
      ) : tab === 'content' ? (
        <FlatList
          key="trending-content"
          data={data}
          keyExtractor={(i: any) => (i.__ad ? `ad-${i.ad.id}` : i.id)}
          numColumns={1}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListHeaderComponent={<HeroBanner count={trending.length} label="contenus" />}
          ListEmptyComponent={<EmptyState colors={colors} />}
          renderItem={({ item, index }: any) => {
            if (item.__ad) {
              return (
                <SearchAdCard
                  ad={item.ad}
                  colors={colors}
                  onImpression={handleAdImpression}
                />
              );
            }
            // Rang reel = position dans le tableau source (sans les slots pub)
            const realIdx = trending.indexOf(item);
            const rank = realIdx >= 0 ? realIdx : index;
            // Dans ce mode 1 colonne on affiche les cartes en ligne complete
            const GRADS: [string, string][] = [
              ['#7B3FF2', '#E0389A'], ['#0EA5E9', '#6366F1'],
              ['#10B981', '#0EA5E9'], ['#F59E0B', '#EF4444'],
              ['#EC4899', '#8B5CF6'], ['#14B8A6', '#3B82F6'],
            ];
            const grad = GRADS[rank % GRADS.length];
            const fmtV = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n ?? 0);
            return (
              <TouchableOpacity
                style={[s.contentCard, { backgroundColor: colors.surface, borderColor: colors.border, width: '100%' }]}
                onPress={() => handleContentPress(item)}
                activeOpacity={0.85}
              >
                <View style={[s.rankBadge, { backgroundColor: rank < 3 ? '#F59E0B' : colors.primary }]}>
                  <Text style={s.rankText}>#{rank + 1}</Text>
                </View>
                <View style={s.contentThumb}>
                  {item.thumbnail_url ? (
                    <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <LinearGradient
                      colors={grad}
                      style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="film" size={30} color="rgba(255,255,255,0.7)" />
                      </View>
                    </LinearGradient>
                  )}
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={s.contentThumbGrad} />
                </View>
                <View style={s.contentBody}>
                  <Text style={[s.contentTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {item.title ?? 'Sans titre'}
                  </Text>
                  {!!item.view_count && (
                    <View style={s.statRow}>
                      <Icon name="eye" size={11} color={colors.textTertiary} />
                      <Text style={[s.statText, { color: colors.textTertiary }]}>{fmtV(item.view_count)}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <FlatList
          key="trending-reels"
          data={data}
          keyExtractor={(i: any) => (i.__ad ? `ad-${i.ad.id}` : i.id)}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListHeaderComponent={<HeroBanner count={reels.length} label="reels" />}
          ListEmptyComponent={<EmptyState colors={colors} />}
          renderItem={({ item, index }: any) => {
            if (item.__ad) {
              return (
                <SearchAdCard
                  ad={item.ad}
                  colors={colors}
                  onImpression={handleAdImpression}
                />
              );
            }
            const realIdx = reels.indexOf(item);
            return (
              <ReelRow item={item} index={realIdx >= 0 ? realIdx : index} colors={colors} onPress={() => handleReelPress(item)} />
            );
          }}
        />
      )}
    </View>
  );
};

// ── Hero banner ───────────────────────────────────────────────────────────────

const HeroBanner: React.FC<{ count: number; label: string }> = ({ count, label }) => (
  <View style={[s.heroBanner]}>
    <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.heroBannerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Icon name="trending-up" size={28} color="#fff" />
      <View style={{ marginLeft: 12 }}>
        <Text style={s.heroTitle}>Top tendances</Text>
        <Text style={s.heroSub}>{count} {label} populaires</Text>
      </View>
    </LinearGradient>
  </View>
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
    <View style={{ width: CARD_W }}>
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
    </View>
  );
};

// ── Reel row (liste) ──────────────────────────────────────────────────────────

const ReelRow: React.FC<{ item: any; index: number; colors: any; onPress: () => void }> = ({ item, index, colors, onPress }) => {
  const fmtViews = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n ?? 0);

  return (
    <View>
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
    </View>
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
