/**
 * RevenueTransactionsScreen — historique paginé des transactions de revenus,
 * filtrable par source, équivalent mobile de WalletRevenueTransactionsPage.tsx (web).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { revenueService, SOURCE_FILTERS } from '../../services/revenueService';
import type { RevenueTransaction } from '../../services/revenueService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const PAGE_LIMIT = 30;

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 100 ? 0 : 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const RevenueTransactionsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();

  const [source, setSource] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<RevenueTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);

  useEffect(() => {
    setLoading(true);
    pageRef.current = 1;
    revenueService.getTransactions(source, 1, PAGE_LIMIT)
      .then(res => { setItems(res.items); setHasMore(res.items.length >= PAGE_LIMIT); })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  }, [source]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    revenueService.getTransactions(source, nextPage, PAGE_LIMIT)
      .then(res => {
        pageRef.current = nextPage;
        setItems(prev => [...prev, ...res.items]);
        setHasMore(res.items.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading, source]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Historique des revenus</Text>
        <View style={{ width: 38 }} />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterRow}
        contentContainerStyle={s.filterRowContent}
        data={[{ key: undefined, label: 'Toutes' }, ...SOURCE_FILTERS]}
        keyExtractor={item => item.key ?? 'all'}
        renderItem={({ item }) => {
          const active = source === item.key;
          return (
            <TouchableOpacity onPress={() => setSource(item.key)}
              style={[s.filterPill, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
              <Text style={[s.filterText, { color: active ? '#fff' : colors.textSecondary }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={loading ? [] : items}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <View style={[
            s.row, { backgroundColor: colors.surface, borderColor: colors.border },
            index === 0 && s.rowFirst, index === items.length - 1 && s.rowLast,
          ]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.label}</Text>
              <Text style={[s.rowSub, { color: colors.textTertiary }]} numberOfLines={1}>
                {item.description || item.public_id} · {fmtDate(item.created_at)}
              </Text>
            </View>
            <Text style={s.rowAmount}>+{fmtEur(item.eur_amount)}</Text>
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={s.empty}>
            <Icon name="file-text" size={28} color={colors.textTertiary} />
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>Aucune transaction pour l'instant</Text>
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

  filterRow:        { flexGrow: 0, marginTop: 12 },
  filterRowContent: { gap: 8, paddingHorizontal: 16 },
  filterPill:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText:       { fontSize: 12, fontWeight: '700' },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderTopWidth: 0, borderBottomWidth: 0 },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, marginTop: 8 },
  rowLast:  { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowSub:   { fontSize: 11, marginTop: 2 },
  rowAmount:{ fontSize: 13, fontWeight: '800', color: '#22C55E' },

  empty:     { alignItems: 'center', gap: 10, paddingVertical: 50 },
  emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },
});
