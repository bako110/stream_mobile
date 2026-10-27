/**
 * SimpleLiveListScreen — Liste des lives spontanés actifs.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, RefreshControl,
  StyleSheet, StatusBar, Dimensions, ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { liveService, type LiveStream } from '../../services/liveService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { BackButton, LiveThumbnailBackground, LiveCardVideoPreview } from '../../components/common';

type Nav = NativeStackNavigationProp<MainStackParamList>;
const { width: W } = Dimensions.get('window');
// Grille immersive 2 colonnes, cartes au format portrait proche de l'écran
// (ratio 0.68 ≈ story/reel) — plus grandes que l'ancien format 3:4, pour que
// l'aperçu vidéo en direct (LiveCardVideoPreview) ait assez de place pour se
// voir clairement au lieu d'une vignette trop petite.
const GRID_GAP = 10;
const CARD_W = (W - 16 * 2 - GRID_GAP) / 2;
const CARD_H = CARD_W / 0.68;

const PulsingDot: React.FC<{ size?: number; color?: string }> = ({ size = 8, color = '#F0365A' }) => {
  const opacity = useSharedValue(1);
  useEffect(() => { opacity.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true); }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
};

export const SimpleLiveListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { currentUser } = useUser();
  const insets = useSafeAreaInsets();

  const [lives, setLives] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Aperçu vidéo en direct (LiveCardVideoPreview) : une vraie connexion
  // LiveKit par carte, coûteuse en batterie/réseau si multipliée sans
  // limite — on ne connecte donc que les cartes réellement visibles à
  // l'écran, jamais toute la liste chargée en mémoire.
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setVisibleIds(new Set(viewableItems.map(v => v.item.id)));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const load = useCallback(async () => {
    try {
      const p = await liveService.getLivesPage(1);
      setLives(p.items);
      setHasMore(p.has_more);
      setPage(1);
    } catch { /* silencieux */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const iv = setInterval(() => {
      liveService.getLivesPage(1).then(p => { setLives(p.items); setHasMore(p.has_more); setPage(1); }).catch(() => {});
    }, 15_000);
    return () => clearInterval(iv);
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const p = await liveService.getLivesPage(nextPage);
      setLives(prev => [...prev, ...p.items]);
      setHasMore(p.has_more);
      setPage(nextPage);
    } catch { /* silencieux */ }
    finally { setLoadingMore(false); }
  }, [loading, loadingMore, hasMore, page]);

  const handlePress = (live: LiveStream) => {
    const isHost = currentUser?.id === live.user_id;
    if (isHost) {
      nav.navigate('SimpleLiveStream', { liveId: live.id, isPrivate: live.is_private ?? false });
    } else {
      nav.navigate('SimpleLiveViewer', { liveId: live.id });
    }
  };

  const renderCard = ({ item, index }: { item: LiveStream; index: number }) => {
    const user = item.user;
    const name = user?.display_name ?? user?.username ?? 'Utilisateur';
    const initial = name[0]?.toUpperCase() ?? '?';
    const elapsed = Math.floor((Date.now() - new Date(item.started_at).getTime()) / 1000);
    const elapsedStr = elapsed < 3600
      ? `${Math.floor(elapsed / 60)}m`
      : `${Math.floor(elapsed / 3600)}h`;

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(380).springify().damping(16)}>
        <TouchableOpacity style={st.card} activeOpacity={0.88} onPress={() => handlePress(item)}>
          <View style={st.thumbWrap}>
            {visibleIds.has(item.id) ? (
              <LiveCardVideoPreview
                liveId={item.id}
                thumbnailUrl={item.thumbnail_url}
                avatarUrl={user?.avatar_url}
                initials={initial}
                avatarSize={52}
              />
            ) : (
              <LiveThumbnailBackground
                thumbnailUrl={item.thumbnail_url}
                avatarUrl={user?.avatar_url}
                initials={initial}
                avatarSize={52}
              />
            )}

            {/* Voile haut léger — garde le badge LIVE/viewers lisibles même sur
                une vidéo claire, sans assombrir toute la tuile. */}
            <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={st.topShade} pointerEvents="none" />
            {/* Dégradé bas marqué — porte tout le bloc d'infos superposé façon
                Instagram/TikTok Lives, lisible quel que soit le contenu vidéo. */}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.92)']} locations={[0.35, 1]} style={st.bottomShade} pointerEvents="none" />

            {/* LIVE badge */}
            <View style={st.liveBadge}>
              <PulsingDot size={5} color="#fff" />
              <Text style={st.liveBadgeText}>DIRECT</Text>
            </View>

            {/* Viewers */}
            <View style={st.viewerBadge}>
              <Icon name="eye" size={10} color="#fff" />
              <Text style={st.viewerText}>{item.current_viewers}</Text>
            </View>

            {/* Badge privé (sous LIVE) */}
            {item.is_private && (
              <View style={st.privateBadge}>
                <MCIcon name="lock" size={9} color="#fff" />
                <Text style={st.privateBadgeText}>Abonnés</Text>
              </View>
            )}

            {/* Bloc d'infos superposé en bas */}
            <View style={st.cardInfo}>
              <View style={st.cardInfoTop}>
                {user?.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={st.avatar} />
                ) : (
                  <View style={[st.avatar, st.avatarFallback]}>
                    <Text style={st.avatarFallbackText}>{initial}</Text>
                  </View>
                )}
                <Text style={st.username} numberOfLines={1}>{name}</Text>
                <View style={st.durationChip}>
                  <Icon name="clock" size={9} color="rgba(255,255,255,0.85)" />
                  <Text style={st.durationText}>{elapsedStr}</Text>
                </View>
              </View>
              <Text style={st.title} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* Header — carte flottante (même design que le reste de l'app).
          paddingTop (status bar) isolé sur un wrapper externe transparent —
          le mélanger au style de la carte ferait apparaître un coin visible
          sous la status bar. */}
      <View style={{ paddingTop: insets.top + 8 }}>
        <View style={[st.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <View style={st.headerSide}>
            <BackButton onPress={() => nav.goBack()} />
          </View>
          <View style={st.headerCenter}>
            <PulsingDot size={7} />
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Lives</Text>
            {!loading && lives.length > 0 && (
              <View style={[st.headerCountPill, { backgroundColor: colors.backgroundSecondary }]}>
                <Text style={[st.headerCountText, { color: colors.textSecondary }]}>{lives.length}</Text>
              </View>
            )}
          </View>
          <View style={[st.headerSide, st.headerSideRight]}>
            <TouchableOpacity style={st.goLiveBtn} onPress={() => nav.navigate('GoLive')} activeOpacity={0.85}>
              <View style={[st.goLiveBtnGrad, { backgroundColor: '#F0365A' }]}>
                <Icon name="radio" size={14} color="#fff" />
                <Text style={st.goLiveBtnText}>Go Live</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={st.loadingCenter}>
          <Icon name="radio" size={40} color={colors.textTertiary} />
          <Text style={[{ color: colors.textTertiary, marginTop: 12, fontSize: 14 }]}>Chargement...</Text>
        </View>
      ) : (
        <FlatList
          data={lives}
          keyExtractor={l => l.id}
          renderItem={renderCard}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          numColumns={2}
          columnWrapperStyle={st.row}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : null}
          ListEmptyComponent={
            <Animated.View entering={FadeIn} style={st.empty}>
              <View style={[st.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="radio" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Aucun live en cours</Text>
              <Text style={[st.emptyDesc, { color: colors.textTertiary }]}>
                Sois le premier à démarrer un live !
              </Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => nav.navigate('GoLive')}>
                <View style={[st.startBtn, { backgroundColor: '#F0365A' }]}>
                  <Icon name="radio" size={16} color="#fff" />
                  <Text style={st.startBtnText}>Démarrer un live</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          }
        />
      )}
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    marginHorizontal: 10,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#5B45B5',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  // Deux côtés de largeur égale (BackButton ~40px vs Go Live ~90px sinon) pour
  // que le bloc central soit vraiment centré sur la barre, pas juste entre
  // deux éléments de tailles différentes.
  headerSide: { minWidth: 90 },
  headerSideRight: { alignItems: 'flex-end' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerCountPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  headerCountText: { fontSize: 11, fontWeight: '700' },
  goLiveBtn: { borderRadius: 20, overflow: 'hidden' },
  goLiveBtnGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20,
  },
  goLiveBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { gap: GRID_GAP, marginBottom: GRID_GAP },

  // ── Carte immersive : tout superposé sur la vidéo, façon Instagram/TikTok Lives ──
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#15121e',
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10,
  },
  thumbWrap: { flex: 1, position: 'relative' },
  topShade:    { position: 'absolute', top: 0, left: 0, right: 0, height: 60 },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },

  liveBadge: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0365A', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  liveBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  privateBadge: {
    position: 'absolute', top: 33, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(123,63,242,0.88)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
  },
  privateBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  viewerBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
  },
  viewerText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  cardInfo: { position: 'absolute', left: 10, right: 10, bottom: 10, gap: 4 },
  cardInfoTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  avatarFallback: { backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#fff', fontWeight: '800', fontSize: 10 },
  username: { flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 11.5, fontWeight: '600' },
  durationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  durationText: { color: 'rgba(255,255,255,0.9)', fontSize: 9.5, fontWeight: '700' },
  title: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 17 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0365A', borderRadius: 24,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
