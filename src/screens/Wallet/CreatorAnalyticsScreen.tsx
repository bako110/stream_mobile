/**
 * CreatorAnalyticsScreen — dashboard analytics créateur unifié, transverse à
 * tous les types de contenu (reels/posts/events/concerts/lives). Remplace
 * CreatorDashboardScreen + CreatorStatsScreen dans la navigation (fichiers
 * laissés en place, juste déréférencés — voir MainNavigator.tsx).
 *
 * Sélecteur de période (jour/semaine/mois/année) + granularité adaptative,
 * filtre par type de contenu, KPI avec % d'évolution vs période précédente,
 * série temporelle, classement géographique, reach (vu/pas-vu), liste des
 * contenus les plus vus — chargée en scroll infini (jamais tout d'un coup,
 * même pour un créateur avec des milliers de publications).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { analyticsService } from '../../services/analyticsService';
import type { AnalyticsOverview, AnalyticsPeriod, AnalyticsContentType, ContentStatItem } from '../../services/analyticsService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { TimeSeriesChart } from '../../components/analytics/TimeSeriesChart';
import { GeoRankingList } from '../../components/analytics/GeoRankingList';
import { ContentStatsRow } from '../../components/analytics/ContentStatsList';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: 'day',   label: 'Jour' },
  { key: 'week',  label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'year',  label: 'Année' },
];

const CONTENT_FILTERS: { key: AnalyticsContentType | 'all'; label: string; icon: string }[] = [
  { key: 'all',     label: 'Tout',      icon: 'grid' },
  { key: 'reel',    label: 'Reels',     icon: 'video' },
  { key: 'post',    label: 'Posts',     icon: 'file-text' },
  { key: 'event',   label: 'Events',    icon: 'calendar' },
  { key: 'concert', label: 'Concerts',  icon: 'music' },
  { key: 'live',    label: 'Lives',     icon: 'radio' },
];

const PAGE_LIMIT = 20;

function fmtNum(n: number): string {
  return n.toLocaleString('fr-FR');
}

export const CreatorAnalyticsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [period, setPeriod] = useState<AnalyticsPeriod>('week');
  const [contentType, setContentType] = useState<AnalyticsContentType | 'all'>('all');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [contentItems, setContentItems] = useState<ContentStatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pageRef = useRef(1);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    pageRef.current = 1;
    try {
      const ct = contentType === 'all' ? undefined : contentType;
      const [ov, content] = await Promise.all([
        analyticsService.getOverview({ period, contentType: ct }),
        analyticsService.listContent({ contentType: ct, period, sort: 'views', page: 1, limit: PAGE_LIMIT }),
      ]);
      setOverview(ov);
      setContentItems(content.items);
      setHasMore(content.items.length >= PAGE_LIMIT);
    } catch {
      // état vide géré par le rendu (overview reste null)
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, contentType]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const ct = contentType === 'all' ? undefined : contentType;
    const nextPage = pageRef.current + 1;
    analyticsService.listContent({ contentType: ct, period, sort: 'views', page: nextPage, limit: PAGE_LIMIT })
      .then(content => {
        pageRef.current = nextPage;
        setContentItems(prev => [...prev, ...content.items]);
        setHasMore(content.items.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading, contentType, period]);

  const evolutionColor = overview?.evolution_pct == null
    ? colors.textTertiary
    : overview.evolution_pct >= 0 ? '#22C55E' : '#EF4444';
  const evolutionIcon = overview?.evolution_pct == null ? 'minus' : overview.evolution_pct >= 0 ? 'trending-up' : 'trending-down';
  const evolutionLabel = overview?.evolution_pct == null ? 'Pas de données précédentes' : `${overview.evolution_pct >= 0 ? '+' : ''}${overview.evolution_pct}% vs période précédente`;

  const listHeader = (
    <>
      {/* Sélecteur de période */}
      <View style={s.periodRow}>
        {PERIODS.map(p => {
          const active = p.key === period;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPeriod(p.key)}
              activeOpacity={0.75}
              style={[s.periodPill, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}
            >
              <Text style={[s.periodText, { color: active ? '#fff' : colors.textSecondary }]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filtre type de contenu */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        data={CONTENT_FILTERS}
        keyExtractor={f => f.key}
        renderItem={({ item: f }) => {
          const active = f.key === contentType;
          return (
            <TouchableOpacity
              onPress={() => setContentType(f.key)}
              activeOpacity={0.75}
              style={[s.filterPill, { backgroundColor: active ? colors.primary + '18' : colors.surface, borderColor: active ? colors.primary : colors.border }]}
            >
              <Icon name={f.icon as any} size={13} color={active ? colors.primary : colors.textTertiary} />
              <Text style={[s.filterText, { color: active ? colors.primary : colors.textSecondary }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !overview ? (
        <View style={s.emptyWrap}>
          <Icon name="bar-chart-2" size={32} color={colors.textTertiary} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>
            Impossible de charger les statistiques pour le moment
          </Text>
        </View>
      ) : (
        <>
          {/* KPI vues + évolution */}
          <LinearGradient
            colors={[colors.primary + '18', colors.primary + '06']}
            style={[s.kpiCard, { borderColor: colors.primary + '30' }]}
          >
            <Text style={[s.kpiValue, { color: colors.textPrimary }]}>{fmtNum(overview.current_views)}</Text>
            <Text style={[s.kpiLabel, { color: colors.textSecondary }]}>Vues sur la période</Text>
            <View style={[s.evolutionBadge, { backgroundColor: evolutionColor + '18' }]}>
              <Icon name={evolutionIcon as any} size={12} color={evolutionColor} />
              <Text style={[s.evolutionText, { color: evolutionColor }]}>{evolutionLabel}</Text>
            </View>
          </LinearGradient>

          <View style={s.kpiRow}>
            <View style={[s.kpiMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="users" size={16} color="#3B82F6" />
              <Text style={[s.kpiMiniValue, { color: colors.textPrimary }]}>{fmtNum(overview.unique_viewers)}</Text>
              <Text style={[s.kpiMiniLabel, { color: colors.textTertiary }]}>Spectateurs uniques</Text>
            </View>
            <View style={[s.kpiMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="globe" size={16} color="#10B981" />
              <Text style={[s.kpiMiniValue, { color: colors.textPrimary }]}>{overview.top_countries.length}</Text>
              <Text style={[s.kpiMiniLabel, { color: colors.textTertiary }]}>Pays touchés</Text>
            </View>
          </View>

          {/* Série temporelle — affichée même à 0 vue : la grille horaire/quotidienne
              reste visible (buckets à 0 remplis côté backend), pas juste masquée. */}
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Évolution des vues</Text>
            <TimeSeriesChart data={overview.timeseries} granularity={overview.granularity} color={colors.primary} />
          </View>

          {/* Répartition géographique */}
          {overview.top_countries.length > 0 && (
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Répartition géographique</Text>
              <GeoRankingList countries={overview.top_countries} accent={colors.primary} />
            </View>
          )}

          <Text style={[s.cardTitle, { color: colors.textPrimary, marginHorizontal: 16, marginTop: 16 }]}>
            Tous les contenus
          </Text>
        </>
      )}
    </>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Statistiques</Text>
        <View style={{ width: 38 }} />
      </View>

      <FlatList
        data={!loading && overview ? contentItems : []}
        keyExtractor={item => `${item.content_type}:${item.content_id}`}
        renderItem={({ item, index }) => (
          <View
            style={[
              s.rowWrap,
              { backgroundColor: colors.surface, borderColor: colors.border },
              index === 0 && s.rowWrapFirst,
              index === contentItems.length - 1 && s.rowWrapLast,
            ]}
          >
            <ContentStatsRow
              item={item}
              bordered={index < contentItems.length - 1}
              onPress={() => (nav as any).navigate('ContentAnalyticsDetail', {
                contentType: item.content_type, contentId: item.content_id,
              })}
            />
          </View>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={!loading && overview ? (
          <Text style={[s.emptyInlineText, { color: colors.textTertiary, marginHorizontal: 16 }]}>
            Aucun contenu publié pour l'instant.
          </Text>
        ) : null}
        ListFooterComponent={loadingMore ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  root:        { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { fontSize: 18, fontWeight: '800' },

  periodRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  periodPill:   { flex: 1, paddingVertical: 9, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  periodText:   { fontSize: 13, fontWeight: '700' },

  filterRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filterPill:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText:   { fontSize: 12.5, fontWeight: '700' },

  emptyWrap:    { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText:    { fontSize: 13, fontWeight: '600' },

  kpiCard:      { marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 18, alignItems: 'center', gap: 4 },
  kpiValue:     { fontSize: 32, fontWeight: '900' },
  kpiLabel:     { fontSize: 13, fontWeight: '600' },
  evolutionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  evolutionText:  { fontSize: 12, fontWeight: '800' },

  kpiRow:       { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  kpiMini:      { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4, alignItems: 'center' },
  kpiMiniValue: { fontSize: 17, fontWeight: '800' },
  kpiMiniLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  card:         { marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 16, gap: 10 },
  cardTitle:    { fontSize: 15, fontWeight: '800' },
  emptyInlineText: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  // Chaque item de contenu est une vraie rangée de FlatList (pagination réelle) —
  // arrondi seulement en haut du premier et en bas du dernier pour paraître
  // comme une seule liste continue, pas des cartes séparées.
  rowWrap:      { marginHorizontal: 16, borderLeftWidth: 1, borderRightWidth: 1, paddingHorizontal: 16 },
  rowWrapFirst: { marginTop: 8, borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 4 },
  rowWrapLast:  { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, paddingBottom: 4 },
});
