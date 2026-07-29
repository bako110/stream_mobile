/**
 * ContentAnalyticsListScreen — liste complète et paginée de tous les contenus
 * du créateur (pas seulement le top 10 affiché sur CreatorAnalyticsScreen),
 * triés par vues totales. Accessible via "Voir tout" depuis le dashboard.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, GoFolyXLoader } from '../../components/common';
import { analyticsService } from '../../services/analyticsService';
import type { AnalyticsPeriod, AnalyticsContentType, ContentStatItem } from '../../services/analyticsService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { ContentStatsRow } from '../../components/analytics/ContentStatsList';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rte = { params?: { period?: AnalyticsPeriod; contentType?: AnalyticsContentType } };

const PAGE_LIMIT = 30;

export const ContentAnalyticsListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute() as Rte;
  const insets = useSafeAreaInsets();

  const period = route.params?.period ?? 'month';
  const contentType = route.params?.contentType;

  const [items, setItems] = useState<ContentStatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);

  const loadPage = useCallback(async (page: number) => {
    const res = await analyticsService.listContent({
      contentType, period, sort: 'views', page, limit: PAGE_LIMIT,
    });
    return res;
  }, [contentType, period]);

  useEffect(() => {
    setLoading(true);
    pageRef.current = 1;
    loadPage(1)
      .then(res => {
        setItems(res.items);
        setHasMore(res.items.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    loadPage(nextPage)
      .then(res => {
        pageRef.current = nextPage;
        setItems(prev => [...prev, ...res.items]);
        setHasMore(res.items.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading, loadPage]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Tous mes contenus</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <GoFolyXLoader fullScreen color={colors.primary} />
      ) : items.length === 0 ? (
        <View style={s.emptyWrap}>
          <Icon name="bar-chart-2" size={32} color={colors.textTertiary} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>Aucun contenu publié pour l'instant</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => `${item.content_type}:${item.content_id}`}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
          ) : null}
          renderItem={({ item, index }) => (
            <ContentStatsRow
              item={item}
              bordered={index < items.length - 1}
              onPress={() => (nav as any).navigate('ContentAnalyticsDetail', {
                contentType: item.content_type, contentId: item.content_id,
              })}
            />
          )}
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  emptyWrap:   { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText:   { fontSize: 13, fontWeight: '600' },
});
