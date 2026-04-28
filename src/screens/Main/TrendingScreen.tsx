import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, SkeletonTrending } from '../../components/common';
import { searchService } from '../../services';

export const TrendingScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, fontSize } = theme;

  const [trending, setTrending] = useState<any[]>([]);
  const [reels,    setReels]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<'content' | 'reels'>('content');
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

  const data = tab === 'content' ? trending : reels;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Tendances" variant="default" />

      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {(['content', 'reels'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: tab === t ? '700' : '400', color: tab === t ? colors.primary : colors.textSecondary }}>
              {t === 'content' ? '🔥 Contenus' : '🎥 Reels'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <SkeletonTrending />
      ) : (
        <FlatList
          data={data}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="trending-up" size={44} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, marginTop: 12 }}>Aucune tendance pour l'instant</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
              <TouchableOpacity style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.8}>
                <Text style={[styles.rank, { color: colors.primary }]}>#{index + 1}</Text>
                {item.thumbnail_url ? (
                  <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name={tab === 'reels' ? 'video' : 'film'} size={20} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>
                    {item.title ?? item.caption ?? 'Sans titre'}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 3 }}>
                    {item.view_count ? `${item.view_count} vues` : ''}
                    {item.like_count ? `  ·  ${item.like_count} ❤️` : ''}
                  </Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tabs:  { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:   { flex: 1, alignItems: 'center', paddingVertical: 12 },
  center:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, borderWidth: 1 },
  rank:  { fontSize: 18, fontWeight: '900', width: 32, textAlign: 'center' },
  thumb: { width: 54, height: 54, borderRadius: 10 },
});
