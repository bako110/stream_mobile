/**
 * RevenueContentListScreen — liste paginée complète des revenus par reel,
 * équivalent mobile de WalletRevenueContentPage.tsx côté web.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { revenueService } from '../../services/revenueService';
import type { RevenueContentItem } from '../../services/revenueService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Period = 'all' | 'month' | 'year';

const PAGE_LIMIT = 20;

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'year', label: 'Cette année' },
  { key: 'month', label: 'Ce mois' },
];

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 100 ? 0 : 2 });
}

export const RevenueContentListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute<any>();

  const [period, setPeriod] = useState<Period>(route.params?.period ?? 'all');
  const [items, setItems] = useState<RevenueContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);

  const load = useCallback(() => {
    setLoading(true);
    pageRef.current = 1;
    revenueService.getByContent(1, PAGE_LIMIT, period)
      .then(res => { setItems(res.items); setHasMore(res.items.length >= PAGE_LIMIT); })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    revenueService.getByContent(nextPage, PAGE_LIMIT, period)
      .then(res => {
        pageRef.current = nextPage;
        setItems(prev => [...prev, ...res.items]);
        setHasMore(res.items.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading, period]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Revenus par reel</Text>
        <View style={{ width: 38 }} />
      </View>

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

      <FlatList
        data={loading ? [] : items}
        keyExtractor={item => item.content_id}
        renderItem={({ item, index }) => (
          <View style={[
            s.row, { backgroundColor: colors.surface, borderColor: colors.border },
            index === 0 && s.rowFirst, index === items.length - 1 && s.rowLast,
          ]}>
            <View style={[s.thumb, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="video" size={16} color={colors.textTertiary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title ?? 'Reel'}</Text>
              <Text style={[s.rowSub, { color: colors.textTertiary }]}>
                {item.transaction_count} opération{item.transaction_count > 1 ? 's' : ''} · {item.gogold.toLocaleString('fr-FR')} GoGold
              </Text>
            </View>
            <Text style={[s.rowAmount, { color: colors.textPrimary }]}>{fmtEur(item.eur)}</Text>
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={s.empty}>
            <Icon name="video" size={28} color={colors.textTertiary} />
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>
              Aucun revenu rattaché à un reel {period === 'all' ? "pour l'instant" : 'sur cette période'}
            </Text>
          </View>
        ) : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, paddingTop: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  periodRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  periodPill: { flex: 1, paddingVertical: 8, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  periodText: { fontSize: 12, fontWeight: '700' },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderTopWidth: 0, borderBottomWidth: 0 },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, marginTop: 8 },
  rowLast:  { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  thumb:    { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowSub:   { fontSize: 11, marginTop: 2 },
  rowAmount:{ fontSize: 13, fontWeight: '800' },

  empty:     { alignItems: 'center', gap: 10, paddingVertical: 50 },
  emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },
});
