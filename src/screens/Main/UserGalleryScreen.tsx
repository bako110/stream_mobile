/**
 * UserGalleryScreen — grille paginée des IMAGES uniquement d'un utilisateur
 * (posts + events + concerts), portage mobile de GalleryTab (ProfilePage.tsx /
 * UserProfilePage.tsx côté stream_web). Events/concerts n'ont pas de
 * pagination exploitable côté backend (même limitation que le web) — chargés
 * une seule fois avec une limite large ; seuls les posts (potentiellement
 * nombreux) sont paginés via scroll infini (onEndReached).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, StyleSheet,
  StatusBar, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, GoFolyXLoader } from '../../components/common';
import { postService } from '../../services/postService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { useMediaDownload } from '../../hooks/useMediaDownload';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface GalleryImage { id: string; kind: 'post' | 'event' | 'concert'; url: string }

const GAP = 4;
const PAGE_LIMIT = 30;

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

  const [postImages, setPostImages]   = useState<GalleryImage[]>([]);
  const [otherImages, setOtherImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const pageRef = useRef(1);

  const extractPostImages = (posts: any[]): GalleryImage[] =>
    posts
      .filter(post => !post.video_url && !post.hls_url)
      .flatMap(post => {
        const urls: string[] = post.image_urls?.length ? post.image_urls : (post.image_url ? [post.image_url] : []);
        return urls.map((url, i) => ({ id: `${post.id}-${i}`, kind: 'post' as const, url }));
      });

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    pageRef.current = 1;

    Promise.all([
      postService.getByUser(userId, 1, PAGE_LIMIT),
      apiClient.get<any[]>(`${Endpoints.users.userEvents(userId)}?limit=100`).catch(() => ({ data: [] })),
      apiClient.get<any[]>(`${Endpoints.users.userConcerts(userId)}?limit=100`).catch(() => ({ data: [] })),
    ])
      .then(([posts, eventsRes, concertsRes]) => {
        setPostImages(extractPostImages(posts));
        setHasMore(posts.length >= PAGE_LIMIT);

        const events   = Array.isArray(eventsRes.data)   ? eventsRes.data   : [];
        const concerts = Array.isArray(concertsRes.data) ? concertsRes.data : [];
        setOtherImages([
          ...events.filter((e: any) => e.banner_url || e.thumbnail_url)
            .map((e: any) => ({ id: e.id, kind: 'event' as const, url: e.banner_url ?? e.thumbnail_url })),
          ...concerts.filter((c: any) => c.banner_url || c.thumbnail_url)
            .map((c: any) => ({ id: c.id, kind: 'concert' as const, url: c.banner_url ?? c.thumbnail_url })),
        ]);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  }, [userId]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading || !userId) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    postService.getByUser(userId, nextPage, PAGE_LIMIT)
      .then(posts => {
        pageRef.current = nextPage;
        setPostImages(prev => [...prev, ...extractPostImages(posts)]);
        setHasMore(posts.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading, userId]);

  const images = [...otherImages, ...postImages];

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

      {loading ? (
        <GoFolyXLoader fullScreen color={colors.primary} />
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
          ListFooterComponent={loadingMore ? (
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
