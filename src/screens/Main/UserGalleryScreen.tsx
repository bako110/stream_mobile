/**
 * UserGalleryScreen — grille paginée des IMAGES uniquement d'un utilisateur
 * (posts + events + concerts), portage mobile de GalleryTab (ProfilePage.tsx /
 * UserProfilePage.tsx côté stream_web). Les 3 sources sont paginées
 * indépendamment (page/hasMore séparés) et avancées ensemble via un seul
 * scroll infini (onEndReached de la FlatList) — chaque source continue tant
 * qu'elle a encore une page, sans attendre que les autres soient épuisées.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, StyleSheet,
  StatusBar, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, GofolyxLoader } from '../../components/common';
import { postService } from '../../services/postService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { useMediaDownload } from '../../hooks/useMediaDownload';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface GalleryImage { id: string; kind: 'post' | 'event' | 'concert'; url: string }

const GAP = 4;
const PAGE_LIMIT = 30;

type SourceKind = 'post' | 'event' | 'concert';

interface SourceState {
  images: GalleryImage[];
  page: number;
  hasMore: boolean;
  loading: boolean;
}

const EMPTY_SOURCE: SourceState = { images: [], page: 0, hasMore: true, loading: false };

export const UserGalleryScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute() as { params?: { userId: string } };
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const CARD_W = (W - GAP * 2) / 3;

  const userId = route.params?.userId ?? '';
  const { get: getDl, download: startDl } = useMediaDownload();

  const [sources, setSources] = useState<Record<SourceKind, SourceState>>({
    post: EMPTY_SOURCE, event: EMPTY_SOURCE, concert: EMPTY_SOURCE,
  });

  const extractPostImages = (posts: any[]): GalleryImage[] =>
    posts
      .filter(post => !post.video_url && !post.hls_url)
      .flatMap(post => {
        const urls: string[] = post.image_urls?.length ? post.image_urls : (post.image_url ? [post.image_url] : []);
        return urls.map((url, i) => ({ id: `${post.id}-${i}`, kind: 'post' as const, url }));
      });
  const extractEventImages = (events: any[]): GalleryImage[] =>
    events.filter(e => e.banner_url || e.thumbnail_url)
      .map(e => ({ id: e.id, kind: 'event' as const, url: e.banner_url ?? e.thumbnail_url }));
  const extractConcertImages = (concerts: any[]): GalleryImage[] =>
    concerts.filter(c => c.banner_url || c.thumbnail_url)
      .map(c => ({ id: c.id, kind: 'concert' as const, url: c.banner_url ?? c.thumbnail_url }));

  const fetchers: Record<SourceKind, (page: number) => Promise<any[]>> = {
    post: (page) => postService.getByUser(userId, page, PAGE_LIMIT),
    event: (page) => apiClient
      .get<any[]>(`${Endpoints.users.userEvents(userId)}?page=${page}&limit=${PAGE_LIMIT}`)
      .then(r => Array.isArray(r.data) ? r.data : []),
    concert: (page) => apiClient
      .get<any[]>(`${Endpoints.users.userConcerts(userId)}?page=${page}&limit=${PAGE_LIMIT}`)
      .then(r => Array.isArray(r.data) ? r.data : []),
  };
  const extractors: Record<SourceKind, (items: any[]) => GalleryImage[]> = {
    post: extractPostImages, event: extractEventImages, concert: extractConcertImages,
  };

  const loadSource = useCallback((kind: SourceKind) => {
    setSources(prev => {
      const cur = prev[kind];
      if (cur.loading || !cur.hasMore || !userId) return prev;
      const nextPage = cur.page + 1;
      fetchers[kind](nextPage)
        .then(items => {
          setSources(p => ({
            ...p,
            [kind]: {
              images: [...p[kind].images, ...extractors[kind](items)],
              page: nextPage,
              hasMore: items.length >= PAGE_LIMIT,
              loading: false,
            },
          }));
        })
        .catch(() => setSources(p => ({ ...p, [kind]: { ...p[kind], loading: false, hasMore: false } })));
      return { ...prev, [kind]: { ...cur, loading: true } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setSources({ post: EMPTY_SOURCE, event: EMPTY_SOURCE, concert: EMPTY_SOURCE });
    (['event', 'concert', 'post'] as SourceKind[]).forEach(loadSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loading  = sources.post.loading || sources.event.loading || sources.concert.loading;
  const hasMore  = sources.post.hasMore || sources.event.hasMore || sources.concert.hasMore;
  const initial  = sources.post.page === 0 && sources.event.page === 0 && sources.concert.page === 0;

  const images = useMemo(
    () => [...sources.event.images, ...sources.concert.images, ...sources.post.images],
    [sources],
  );

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    (['event', 'concert', 'post'] as SourceKind[]).forEach(kind => {
      if (sources[kind].hasMore && !sources[kind].loading) loadSource(kind);
    });
  }, [loading, hasMore, sources, loadSource]);

  const openImage = useCallback((img: GalleryImage) => {
    nav.navigate('ImageViewer', { url: img.url });
  }, [nav]);

  const renderItem = useCallback(({ item }: { item: GalleryImage }) => {
    const dl = getDl(item.url);
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => openImage(item)}
        style={[s.card, { width: CARD_W, height: CARD_W, backgroundColor: colors.surface }]}
      >
        <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(e) => { e.stopPropagation(); startDl(item.url, item.url, false); }}
          disabled={dl.downloading}
          style={s.dlBtn}
        >
          {dl.downloading ? (
            <Text style={s.dlPct}>{dl.progress}%</Text>
          ) : (
            <Icon name="download" size={12} color="#fff" />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [CARD_W, colors, openImage, getDl, startDl]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Galerie</Text>
        <View style={{ width: 38 }} />
      </View>

      {initial && loading ? (
        <GofolyxLoader fullScreen color={colors.primary} />
      ) : images.length === 0 ? (
        <View style={s.emptyWrap}>
          <Icon name="image" size={32} color={colors.textTertiary} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>Aucune image publiée</Text>
        </View>
      ) : (
        <FlatList
          data={images}
          keyExtractor={img => `${img.kind}-${img.id}`}
          numColumns={3}
          contentContainerStyle={{ gap: GAP, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: GAP }}
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
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  emptyWrap:   { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText:   { fontSize: 13, fontWeight: '600' },
  card:        { overflow: 'hidden' },
  dlBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  dlPct: { color: '#fff', fontSize: 8, fontWeight: '700' },
});
