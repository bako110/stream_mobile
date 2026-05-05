import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, RefreshControl, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, SkeletonTrending } from '../../components/common';
import { searchService } from '../../services';

export const TrendingScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, fontSize } = theme;

  const nav = useNavigation<any>();
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
        {([
          { key: 'content', icon: 'trending-up', label: 'Contenus' },
          { key: 'reels',   icon: 'video',        label: 'Reels'    },
        ] as const).map(t => (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={t.icon} size={14} color={tab === t.key ? colors.primary : colors.textSecondary} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: tab === t.key ? '700' : '400', color: tab === t.key ? colors.primary : colors.textSecondary }}>
                {t.label}
              </Text>
            </View>
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
          renderItem={({ item, index }) => {
            const handlePress = () => {
              if (tab === 'reels') return;
              if (item.type === 'concert' || item.genre) nav.navigate('ConcertDetail', { concertId: item.id });
              else if (item.event_type || item.type === 'event') nav.navigate('EventDetail', { eventId: item.id });
              else if (item.series_id) nav.navigate('SerieEpisodes', { item });
              else nav.navigate('FilmDetail', { item });
            };
            const iconName = tab === 'reels' ? 'video' : item.genre ? 'music' : item.event_type ? 'calendar' : 'film';
            return (
              <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
                <TouchableOpacity
                  style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  activeOpacity={0.8}
                  onPress={handlePress}
                >
                  <Text style={[styles.rank, { color: colors.primary }]}>#{index + 1}</Text>
                  {item.thumbnail_url ? (
                    <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name={iconName} size={20} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>
                      {item.title ?? item.caption ?? 'Sans titre'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      {!!item.view_count && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Icon name="eye" size={11} color={colors.textTertiary} />
                          <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>{item.view_count}</Text>
                        </View>
                      )}
                      {!!item.like_count && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Icon name="heart" size={11} color={colors.textTertiary} />
                          <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>{item.like_count}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              </Animated.View>
            );
          }}
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
