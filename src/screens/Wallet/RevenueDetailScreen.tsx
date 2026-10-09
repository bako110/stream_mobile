/**
 * RevenueDetailScreen — dashboard des revenus créateur, toutes sources
 * confondues (cadeaux, abonnements, vues, publicité, parrainage, billetterie,
 * communautés, tournois, battles, bonus, transferts). Équivalent mobile de
 * WalletRevenuePage.tsx côté web : résumé, évolution mois/année, répartition
 * par source, revenus par reel, lien vers l'historique détaillé.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, GofolyxLoader } from '../../components/common';
import { revenueService } from '../../services/revenueService';
import type {
  RevenueSummary, RevenueTimeseriesPoint, RevenueSourceBreakdown, RevenueContentItem,
} from '../../services/revenueService';
import { RevenueBarChart } from '../../components/analytics/RevenueBarChart';
import { RevenueSourceList } from '../../components/analytics/RevenueSourceList';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Granularity = 'month' | 'year';
type ContentPeriod = 'all' | 'month' | 'year';

const PERIODS: { key: ContentPeriod; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'year', label: 'Cette année' },
  { key: 'month', label: 'Ce mois' },
];

const CONTENT_PAGE_SIZE = 6;

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 100 ? 0 : 2 });
}

export const RevenueDetailScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  // Largeur réelle disponible pour le graphique à l'intérieur de sa carte —
  // s.card a marginHorizontal:16 + padding:16 de chaque côté (64px au total).
  // Un width fixe (320) débordait de la carte sur les écrans plus étroits.
  const chartWidth = Math.max(200, screenW - 64);

  const [granularity, setGranularity] = useState<Granularity>('month');
  const [period, setPeriod] = useState<ContentPeriod>('all');

  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [timeseries, setTimeseries] = useState<RevenueTimeseriesPoint[]>([]);
  const [sources, setSources] = useState<RevenueSourceBreakdown[]>([]);
  const [contentItems, setContentItems] = useState<RevenueContentItem[]>([]);
  const [contentTotal, setContentTotal] = useState(0);
  const [contentLoading, setContentLoading] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadSeq = useRef(0);
  const contentSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);
    try {
      const [sum, ts] = await Promise.all([
        revenueService.getSummary(),
        revenueService.getTimeseries(granularity, granularity === 'year' ? 5 : 12),
      ]);
      if (seq !== loadSeq.current) return;
      setSummary(sum);
      setTimeseries(ts);
    } catch {
      if (seq === loadSeq.current) setLoadError(true);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [granularity]);

  useEffect(() => { load(); }, [load]);

  // Répartition par source ET revenus par contenu suivent le même filtre période.
  useEffect(() => {
    revenueService.getBreakdown(period).then(setSources).catch(() => setSources([]));

    const seq = ++contentSeq.current;
    setContentLoading(true);
    revenueService.getByContent(1, CONTENT_PAGE_SIZE, period)
      .then(res => {
        if (seq !== contentSeq.current) return;
        setContentItems(res.items);
        setContentTotal(res.total);
      })
      .catch(() => {
        if (seq !== contentSeq.current) return;
        setContentItems([]);
        setContentTotal(0);
      })
      .finally(() => { if (seq === contentSeq.current) setContentLoading(false); });
  }, [period]);

  const evolutionColor = summary?.evolution_pct == null
    ? colors.textTertiary
    : summary.evolution_pct >= 0 ? '#22C55E' : '#EF4444';
  const evolutionIcon = summary?.evolution_pct == null ? 'minus' : summary.evolution_pct >= 0 ? 'trending-up' : 'trending-down';

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={{ paddingTop: insets.top + 12 }}>
        <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Revenus</Text>
          <View style={{ width: 38 }} />
        </View>
      </View>

      {loading ? (
        <View style={s.center}><GofolyxLoader variant="bar" color={colors.primary} /></View>
      ) : loadError || !summary ? (
        <View style={s.center}>
          <Icon name="dollar-sign" size={32} color={colors.textTertiary} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>
            Impossible de charger tes revenus pour le moment
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Filtre période global */}
          <View style={s.periodRow}>
            {PERIODS.map(p => {
              const active = period === p.key;
              return (
                <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)}
                  style={[s.periodPill, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
                  <Text style={[s.periodText, { color: active ? '#fff' : colors.textSecondary }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* KPI principal */}
          <View style={[s.kpiCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
            <Text style={[s.kpiValue, { color: colors.textPrimary }]}>{fmtEur(summary.total_eur)}</Text>
            <Text style={[s.kpiLabel, { color: colors.textSecondary }]}>
              Revenus totaux · {summary.total_gogold.toLocaleString('fr-FR')} GoGold
            </Text>
            <Text style={[s.kpiSub, { color: colors.textTertiary }]}>
              {summary.transaction_count} opération{summary.transaction_count > 1 ? 's' : ''} au total
            </Text>
          </View>

          {/* KPI secondaires */}
          <View style={s.kpiRow}>
            <View style={[s.kpiMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.kpiMiniLabel, { color: colors.textTertiary }]}>Ce mois-ci</Text>
              <Text style={[s.kpiMiniValue, { color: colors.textPrimary }]}>{fmtEur(summary.current_month_eur)}</Text>
            </View>
            <View style={[s.kpiMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.kpiMiniLabel, { color: colors.textTertiary }]}>Vs mois précédent</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name={evolutionIcon} size={14} color={evolutionColor} />
                <Text style={[s.kpiMiniValue, { color: evolutionColor }]}>
                  {summary.evolution_pct == null ? '—' : `${summary.evolution_pct >= 0 ? '+' : ''}${summary.evolution_pct}%`}
                </Text>
              </View>
            </View>
          </View>

          {/* Évolution des revenus */}
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.cardHeaderRow}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Évolution des revenus</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['month', 'year'] as Granularity[]).map(g => {
                  const active = granularity === g;
                  return (
                    <TouchableOpacity key={g} onPress={() => setGranularity(g)}
                      style={[s.granPill, { backgroundColor: active ? colors.primary : colors.backgroundSecondary }]}>
                      <Text style={[s.granText, { color: active ? '#fff' : colors.textSecondary }]}>
                        {g === 'month' ? 'Mois' : 'Année'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <RevenueBarChart data={timeseries} color={colors.primary} width={chartWidth} />
          </View>

          {/* Répartition par source */}
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.textPrimary, marginBottom: 4 }]}>Répartition par source</Text>
            <RevenueSourceList
              sources={sources}
              accent={colors.primary}
              textPrimary={colors.textPrimary}
              textTertiary={colors.textTertiary}
              trackColor={colors.backgroundSecondary}
            />
          </View>

          {/* Revenus par reel */}
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.cardHeaderRow}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Revenus par reel</Text>
              {contentTotal > contentItems.length && (
                <TouchableOpacity onPress={() => (nav as any).navigate('RevenueContentList', { period })}>
                  <Text style={[s.linkText, { color: colors.primary }]}>Voir tout ({contentTotal})</Text>
                </TouchableOpacity>
              )}
            </View>

            {contentLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
            ) : contentItems.length === 0 ? (
              <Text style={[s.emptyInline, { color: colors.textTertiary }]}>
                Aucun revenu rattaché à un reel {period === 'all' ? "pour l'instant" : 'sur cette période'}
              </Text>
            ) : (
              contentItems.map((item, i) => (
                <View key={item.content_id} style={[s.contentRow, i < contentItems.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.contentTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title ?? 'Reel'}</Text>
                    <Text style={[s.contentSub, { color: colors.textTertiary }]}>
                      {item.transaction_count} opération{item.transaction_count > 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={[s.contentAmount, { color: colors.textPrimary }]}>{fmtEur(item.eur)}</Text>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity
            onPress={() => (nav as any).navigate('RevenueTransactions')}
            style={[s.historyBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="list" size={15} color={colors.primary} />
            <Text style={[s.historyBtnText, { color: colors.primary }]}>Historique détaillé des transactions</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyText: { fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold, textAlign: 'center' },

  header:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
    marginHorizontal: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.extraBold },

  periodRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  periodPill: { flex: 1, paddingVertical: 9, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  periodText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  kpiCard:  { marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 18, alignItems: 'center', gap: 4 },
  kpiValue: { fontSize: 30, fontWeight: FontWeight.black },
  kpiLabel: { fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold },
  kpiSub:   { fontSize: FontSize.xsPlus, marginTop: 2 },

  kpiRow:       { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  kpiMini:      { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4, alignItems: 'center' },
  kpiMiniValue: { fontSize: FontSize.mdPlus, fontWeight: FontWeight.extraBold },
  kpiMiniLabel: { fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold, textAlign: 'center' },

  card:          { marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle:     { fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold },
  linkText:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  granPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  granText: { fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold },

  emptyInline: { fontSize: FontSize.sm, textAlign: 'center', paddingVertical: 12 },

  contentRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  contentTitle:  { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
  contentSub:    { fontSize: FontSize.xsPlus, marginTop: 2 },
  contentAmount: { fontSize: FontSize.smPlus, fontWeight: FontWeight.extraBold },

  historyBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 16, paddingVertical: 14, borderRadius: 18, borderWidth: 1 },
  historyBtnText: { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
});
