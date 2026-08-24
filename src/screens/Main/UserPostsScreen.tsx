/**
 * UserPostsScreen — grille complète et paginée des posts d'un utilisateur
 * (scroll infini), ouverte depuis "Voir tout" sur ProfileScreen. Le profil
 * n'affiche qu'un aperçu (6 posts) chargé en une fois — ici on pagine
 * réellement, pour ne jamais charger tout l'historique d'un coup.
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
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, GoFolyXLoader } from '../../components/common';
import { postService } from '../../services/postService';
import type { Post } from '../../types/post';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// GAP fixe ; CARD_W/CARD_H recalcules dans le composant via
// useWindowDimensions() (reactif) plutot que Dimensions.get('window') fige
// une seule fois au chargement du module JS, qui laissait un espace vide a
// droite de la grille sur certains appareils.
const GAP    = 8;

const PAGE_LIMIT = 20;

export const UserPostsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute() as { params?: { userId: string } };
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const CARD_W = (W - 12 * 2 - GAP) / 2;
  const CARD_H = Math.round(CARD_W * 14 / 9);

  const userId = route.params?.userId ?? '';

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    pageRef.current = 1;
    postService.getByUser(userId, 1, PAGE_LIMIT)
      .then(data => {
        setPosts(data);
        setHasMore(data.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  }, [userId]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading || !userId) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    postService.getByUser(userId, nextPage, PAGE_LIMIT)
      .then(data => {
        pageRef.current = nextPage;
        setPosts(prev => [...prev, ...data]);
        setHasMore(data.length >= PAGE_LIMIT);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading, userId]);

  const renderItem = useCallback(({ item }: { item: Post }) => {
    const thumb = (item as any).image_urls?.[0] ?? item.image_url ?? (item as any).thumbnail_url ?? null;
    const hasVideo = !!((item as any).hls_url ?? (item as any).video_url) && !thumb;

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => (nav as any).push('PostDetail', { postId: item.id })}
        style={[s.card, { width: CARD_W, backgroundColor: colors.surface }]}
      >
        {thumb ? (
          <View style={[s.thumbWrap, { height: CARD_H }]}>
            <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {hasVideo && (
              <View style={s.videoBadge}>
                <Icon name="play" size={10} color="#fff" style={{ marginLeft: 1 }} />
              </View>
            )}
          </View>
        ) : null}

        <View style={[s.body, !thumb && { paddingVertical: 14 }]}>
          {item.body ? (
            <Text style={[s.bodyTxt, { color: colors.textPrimary }]} numberOfLines={thumb ? 2 : 6}>
              {item.body}
            </Text>
          ) : null}
          <View style={[s.statsRow, !item.body && { marginTop: 0 }]}>
            <View style={s.stat}>
              <MCIcon name="heart-outline" size={12} color={colors.textTertiary} />
              <Text style={[s.statTxt, { color: colors.textTertiary }]}>{item.like_count ?? 0}</Text>
            </View>
            <View style={s.stat}>
              <MCIcon name="comment-outline" size={12} color={colors.textTertiary} />
              <Text style={[s.statTxt, { color: colors.textTertiary }]}>{item.comment_count ?? 0}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [nav, colors, CARD_W, CARD_H]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Publications</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <GoFolyXLoader fullScreen color={colors.primary} />
      ) : posts.length === 0 ? (
        <View style={s.emptyWrap}>
          <Icon name="edit-3" size={32} color={colors.textTertiary} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>Aucun post publié</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={p => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: GAP, paddingHorizontal: 12 }}
          contentContainerStyle={{ gap: GAP, paddingVertical: 12, paddingBottom: 40 }}
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

  card: {
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  thumbWrap:   { width: '100%', position: 'relative' },
  videoBadge:  { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  body:        { paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  bodyTxt:     { fontSize: 12, lineHeight: 17 },
  statsRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  stat:        { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statTxt:     { fontSize: 11, fontWeight: '600' },
});
