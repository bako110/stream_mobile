/**
 * ContentAnalyticsDetailScreen — détail analytics complet d'un contenu précis
 * (reel/post/event/concert/live) : série temporelle, géo, reach vu/pas-vu.
 * Ouvert depuis ContentStatsList (tap sur un item de CreatorAnalyticsScreen).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, ActivityIndicator, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { analyticsService } from '../../services/analyticsService';
import type { ContentDetailStats, AnalyticsContentType } from '../../services/analyticsService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { TimeSeriesChart } from '../../components/analytics/TimeSeriesChart';
import { GeoRankingList } from '../../components/analytics/GeoRankingList';
import { ReachCard } from '../../components/analytics/ReachCard';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const TYPE_LABEL: Record<AnalyticsContentType, string> = {
  reel: 'Reel', post: 'Post', event: 'Événement', concert: 'Concert', live: 'Live',
};

export const ContentAnalyticsDetailScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const { contentType, contentId } = route.params as { contentType: AnalyticsContentType; contentId: string };

  const [detail, setDetail] = useState<ContentDetailStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await analyticsService.getContentDetail(contentType, contentId, 'month');
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [contentType, contentId]);

  useEffect(() => { load(); }, [load]);

  const evolutionColor = detail?.evolution_pct == null
    ? colors.textTertiary
    : detail.evolution_pct >= 0 ? '#22C55E' : '#EF4444';

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {detail?.title ?? TYPE_LABEL[contentType]}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !detail ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 }}>
          <Icon name="alert-triangle" size={28} color={colors.textTertiary} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            Impossible de charger les statistiques de ce contenu.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {detail.thumbnail_url && (
            <Image source={{ uri: detail.thumbnail_url }} style={s.banner} />
          )}

          <View style={[s.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.kpiValue, { color: colors.textPrimary }]}>{detail.current_views.toLocaleString('fr-FR')}</Text>
            <Text style={[s.kpiLabel, { color: colors.textSecondary }]}>Vues (30 derniers jours)</Text>
            {detail.evolution_pct != null && (
              <View style={[s.evolutionBadge, { backgroundColor: evolutionColor + '18' }]}>
                <Icon name={detail.evolution_pct >= 0 ? 'trending-up' : 'trending-down'} size={12} color={evolutionColor} />
                <Text style={[s.evolutionText, { color: evolutionColor }]}>
                  {detail.evolution_pct >= 0 ? '+' : ''}{detail.evolution_pct}% vs mois précédent
                </Text>
              </View>
            )}
          </View>

          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Évolution des vues</Text>
            <TimeSeriesChart data={detail.timeseries} granularity="day" color={colors.primary} />
          </View>

          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Portée parmi vos abonnés</Text>
            <ReachCard reach={detail.reach} accent={colors.primary} />
          </View>

          {detail.top_countries.length > 0 && (
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Répartition géographique</Text>
              <GeoRankingList countries={detail.top_countries} accent={colors.primary} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  banner:      { width: '100%', height: 180 },

  kpiCard:      { marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 18, alignItems: 'center', gap: 4 },
  kpiValue:     { fontSize: 30, fontWeight: '900' },
  kpiLabel:     { fontSize: 13, fontWeight: '600' },
  evolutionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  evolutionText:  { fontSize: 12, fontWeight: '800' },

  card:        { marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 16, gap: 10 },
  cardTitle:   { fontSize: 15, fontWeight: '800' },
});
