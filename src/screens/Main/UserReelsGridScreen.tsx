/**
 * UserReelsGridScreen — grille paginée des REELS d'un utilisateur, portage du
 * même pattern que UserGalleryScreen.tsx (pagination page/hasMore, FlatList
 * grille 3 colonnes, header carte flottante). Au tap sur une vignette, ouvre
 * le viewer plein écran existant (route 'UserReels').
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, StyleSheet,
  StatusBar, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, GofolyxLoader } from '../../components/common';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { formatDurationSec, formatViewerCount } from '../../utils';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const PAGE_LIMIT = 30;
const REEL_COLS = 3;
// justifyContent:'space-between' (sur columnWrapperStyle) plutôt qu'un gap
// fixe + largeur calculée en pixels arrondis — élimine tout résidu d'espace
// à droite causé par l'arrondi flottant (même pattern que reelsGrid/reelCardW
// dans UserProfileScreen.tsx et la mini-grille d'aperçu de ProfileScreen.tsx).
const REEL_GAP_RATIO = 0.015;

export const UserReelsGridScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute() as { params?: { userId: string } };
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const CARD_W = W / REEL_COLS - (REEL_GAP_RATIO * W);

  const userId = route.params?.userId ?? '';

  const [reels, setReels] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(() => {
    if (loading || !hasMore || !userId) return;
    setLoading(true);
    const nextPage = page + 1;
    apiClient.get<any>(`${Endpoints.reels.byUser(userId)}?page=${nextPage}&limit=${PAGE_LIMIT}`)
      .then(res => {
        const d = res.data;
        const items: any[] = Array.isArray(d) ? d : (d?.items ?? []);
        setReels(prev => [...prev, ...items]);
        setPage(nextPage);
        setHasMore(items.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  }, [loading, hasMore, page, userId]);

  useEffect(() => {
    if (!userId) return;
    setReels([]);
    setPage(0);
    setHasMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (page === 0 && hasMore) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const openReel = useCallback((reel: any) => {
    nav.navigate('UserReels', { userId, initialReelId: reel.id, initialReels: reels });
  }, [nav, userId, reels]);

  const initial = page === 0;

  const renderItem = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => openReel(item)}
      style={[s.card, { width: CARD_W, aspectRatio: 9 / 16, backgroundColor: colors.surfaceElevated }]}
    >
      {item.thumbnail_url ? (
        <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.noThumb]}>
          <Icon name="play" size={24} color={colors.textTertiary} />
        </View>
      )}

      {item.duration_sec != null && (
        <View style={s.durationBadge}>
          <Icon name="play" size={8} color="#fff" />
          <Text style={s.durationText}>{formatDurationSec(item.duration_sec)}</Text>
        </View>
      )}

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={s.gridOverlay}>
        {item.caption ? (
          <Text style={s.titleText} numberOfLines={1}>{item.caption}</Text>
        ) : null}
        <View style={s.metaOverlay}>
          <Icon name="eye" size={9} color="#fff" />
          <Text style={s.metaText}>{formatViewerCount(item.view_count ?? 0)}</Text>
          <Icon name="heart" size={9} color="#fff" style={{ marginLeft: 4 }} />
          <Text style={s.metaText}>{formatViewerCount(item.likes_count ?? 0)}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  ), [CARD_W, colors, openReel]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: insets.top + 12 }}>
        <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Reels</Text>
          <View style={{ width: 38 }} />
        </View>
      </View>

      {initial && loading ? (
        <GofolyxLoader fullScreen color={colors.primary} />
      ) : reels.length === 0 ? (
        <View style={s.emptyWrap}>
          <Icon name="play-circle" size={32} color={colors.textTertiary} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>Aucun reel publié</Text>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={reel => String(reel.id)}
          numColumns={REEL_COLS}
          contentContainerStyle={{ paddingBottom: 40 }}
          columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 4 }}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
          ) : null}
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
    marginHorizontal: 10, marginBottom: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  emptyWrap:   { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText:   { fontSize: 13, fontWeight: '600' },
  card:        { overflow: 'hidden', borderRadius: 12 },
  noThumb:     { alignItems: 'center', justifyContent: 'center' },
  durationBadge: {
    position: 'absolute', top: 6, left: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  durationText: { fontSize: 9, color: '#fff', fontWeight: '700' },
  gridOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 6, paddingTop: 16, paddingBottom: 6, gap: 2,
  },
  titleText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  metaOverlay: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  metaText: { fontSize: 9, color: '#fff', fontWeight: '700' },
});
