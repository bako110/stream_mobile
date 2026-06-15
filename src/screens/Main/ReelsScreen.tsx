import React, {
  useEffect, useState, useCallback, useRef, memo, useMemo,
} from 'react';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, Dimensions,
  TouchableOpacity, ActivityIndicator, StatusBar, Image,
  Platform, Alert, Modal, TextInput,
  KeyboardAvoidingView, Keyboard, AppState, Linking,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSequence, withTiming, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { RichText } from '../../components/common/RichText';
import { apiClient } from '../../api';
import { reelService, socialService, authService } from '../../services';
import { cableService } from '../../services/cableService';
import { userService } from '../../services/userService';
import {
  CommentsBottomSheet, VerifiedBadge, ReportModal, GoFolyXLoader, ShareBottomSheet, FriendsWhoLiked,
} from '../../components/common';
import { GiftPickerModal } from '../../components/wallet/GiftPickerModal';
import type { Reel, ReactionType } from '../../types';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ─── Helpers ────────────────────────────────────────────────────────────────

const getAuthorLabel = (author?: Reel['author']): string => {
  if (!author) return 'Utilisateur';
  return (
    author.display_name ||
    (author.first_name && author.last_name
      ? `${author.first_name} ${author.last_name}`
      : author.first_name || author.username || 'Utilisateur')
  );
};

const getAuthorInitial = (author?: Reel['author']): string =>
  getAuthorLabel(author)[0].toUpperCase();

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(n ?? 0);
};


// ─── ReelsScreen ─────────────────────────────────────────────────────────────

export const ReelsScreen: React.FC = () => {
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }) => setScreenDims(screen));
    return () => sub.remove();
  }, []);

  const SCREEN_W = screenDims.width;
  const SCREEN_H = screenDims.height;
  const insets   = useSafeAreaInsets();
  const HEADER_H = insets.top + 54;
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const nav    = useNavigation<Nav>();
  const route  = useRoute();
  const params = (route.params ?? {}) as { initialReelId?: string; initialReel?: Reel; reelPublished?: boolean };

  // ── Refs ─────────────────────────────────────────────────────────────────
  const listRef           = useRef<FlatList>(null);
  const isLoadingMoreRef  = useRef(false);
  const pageRef           = useRef(1);
  const currentIdxRef     = useRef(0);
  const currentReelRef    = useRef<{ id: string; startTime: number } | null>(null);
  const viewedReelsRef    = useRef<Set<string>>(new Set());
  const activePlayerRef   = useRef<{ pause: () => void } | null>(null);
  const mountedRef        = useRef(true);
  const searchTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef    = useRef<TextInput>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 75 });
  const lastLoadedAtRef   = useRef<number>(0);
  const didFocusOnceRef   = useRef(false);
  const lastInitialReelRef = useRef<string | undefined>(undefined);
  // ── State ─────────────────────────────────────────────────────────────────
  const seedReel = useRef(
    params.initialReel?.hls_url ? [params.initialReel as Reel] : []
  ).current;

  const [reels,         setReels]         = useState<Reel[]>(seedReel);
  const [myReels,       setMyReels]       = useState<Reel[]>([]);
  const [reelAd,        setReelAd]        = useState<{ id: string; title: string; description?: string; cta_text?: string; cta_url?: string; creative_url?: string; thumbnail_url?: string } | null>(null);
  const [menuReel,      setMenuReel]      = useState<Reel | null>(null);
  const [editReel,      setEditReel]      = useState<Reel | null>(null);
  const [editCaption,   setEditCaption]   = useState('');
  const [editSaving,    setEditSaving]    = useState(false);
  const [loading,       setLoading]       = useState(seedReel.length === 0 && !params.initialReelId);
  const [hasMore,       setHasMore]       = useState(true);
  const [tab,           setTab]           = useState<'feed' | 'mine'>('feed');
  const [myId,          setMyId]          = useState<string | null>(null);
  const [currentIndex,  setCurrentIndex]  = useState(0);
  const [screenFocused, setScreenFocused] = useState(true);
  const [muted,         setMuted]         = useState(false);
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<Reel[]>([]);
  const [searching,     setSearching]     = useState(false);

  // Refs stables pour éviter les closures stales
  const reelsRef        = useRef<Reel[]>([]);
  const hasMoreRef      = useRef(true);
  const pendingScrollIdx  = useRef<number | null>(null);
  const isScrollingRef    = useRef(false);
  const scrollLockTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { reelsRef.current = reels; },    [reels]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const toggleMute = useCallback(() => setMuted(v => !v), []);

  // Scroll direct par offset — verrou isScrollingRef pour bloquer onViewableItemsChanged
  const scrollToIdx = useCallback((index: number, animated = false) => {
    const itemH = SCREEN_H - HEADER_H;
    isScrollingRef.current = true;
    if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
    scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 400);
    listRef.current?.scrollToOffset({ offset: itemH * index, animated });
  }, [SCREEN_H, HEADER_H]);

  // ── View tracking ─────────────────────────────────────────────────────────
  const sendViewForCurrent = useCallback(() => {
    const cur = currentReelRef.current;
    if (!cur || viewedReelsRef.current.has(cur.id)) return;
    const elapsed    = (Date.now() - cur.startTime) / 1000;
    const watchRatio = Math.min(elapsed / 30, 1.0);
    if (watchRatio >= 0.1) {
      viewedReelsRef.current.add(cur.id);
      reelService.recordView(cur.id, parseFloat(watchRatio.toFixed(2))).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const list = reelsRef.current;
    const cur  = list[currentIndex];
    if (!cur) return;
    sendViewForCurrent();
    currentReelRef.current = { id: cur.id, startTime: Date.now() };
    // Prefetch uniquement le suivant — évite la cascade réseau au scroll rapide
    const next = list[currentIndex + 1];
    if (next?.thumbnail_url) Image.prefetch(next.thumbnail_url).catch(() => {});
  }, [currentIndex, sendViewForCurrent]);

  // ── Load ──────────────────────────────────────────────────────────────────
  // targetId : reel à afficher en priorité (peut changer à chaque navigation)
  // silent   : garder le contenu actuel visible pendant le chargement background
  const load = useCallback(async (silent = false, targetId?: string, targetReel?: Reel) => {
    if (!mountedRef.current) return;
    if (!silent) setLoading(true);
    pageRef.current = 1;
    isLoadingMoreRef.current = false;

    try {
      const data = await reelService.getFeed({ page: 1 });
      if (!mountedRef.current) return;

      const filtered = (data.items ?? []).filter((r: Reel) => !!r.hls_url);

      // Chercher le reel cible dans le feed chargé
      let finalReels = filtered;
      let targetIdx  = 0;
      if (targetId) {
        const idx = filtered.findIndex((r: Reel) => r.id === targetId);
        if (idx >= 0) {
          targetIdx = idx;
        } else if (targetReel?.hls_url) {
          // Pas dans le feed → l'injecter en tête
          finalReels = [targetReel, ...filtered.filter(r => r.id !== targetId)];
          targetIdx  = 0;
        }
      }

      setHasMore(data.has_more);
      lastLoadedAtRef.current = Date.now();

      if (!silent) {
        setReels(finalReels);
        viewedReelsRef.current = new Set();
        currentIdxRef.current = targetIdx;
        setCurrentIndex(targetIdx);
        if (targetIdx > 0) {
          pendingScrollIdx.current = targetIdx;
        }
      } else if (targetId) {
        // Mode arrière-plan avec reel cible — on NE remplace PAS la liste
        // on ajoute juste les reels du feed qui ne sont pas encore présents
        // L'utilisateur reste sur le reel injecté sans aucun déplacement
        const existingIds = new Set(reelsRef.current.map(r => r.id));
        const toAppend = finalReels.filter(r => r.id !== targetId && !existingIds.has(r.id));
        if (toAppend.length > 0) {
          const merged = [...reelsRef.current, ...toAppend];
          reelsRef.current = merged;
          setReels(merged);
        }
      } else {
        // Silent sans cible — mise à jour silencieuse sans bouger l'index
        setReels(finalReels);
      }

      // Charger la pub reels en arriere-plan
      apiClient.get<{ id: string; title: string } | null>('/api/v1/ads/feed/next?placement=reels')
        .then(r => { if (r.data && mountedRef.current) setReelAd(r.data as any); })
        .catch(() => {});

      // Charger myId + mes reels en parallèle sans bloquer l'affichage
      authService.getMe().then(me => {
        if (!mountedRef.current) return;
        setMyId(String(me.id));
        userService.getUserReels(String(me.id))
          .then(mine => { if (mountedRef.current) setMyReels(Array.isArray(mine) ? mine : []); })
          .catch(() => {});
      }).catch(() => {});

    } catch {
      if (mountedRef.current && !silent) setReels([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []); // pas de dépendances sur params — targetId passé en argument

  // ── Load more ─────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || !mountedRef.current) return;
    isLoadingMoreRef.current = true;
    try {
      const nextPage = pageRef.current + 1;
      const data     = await reelService.getFeed({ page: nextPage });
      if (!mountedRef.current) return;
      const newReels = (data.items ?? []).filter((r: Reel) => !!r.hls_url);
      setReels(prev => {
        const ids = new Set(prev.map(r => r.id));
        return [...prev, ...newReels.filter((r: Reel) => !ids.has(r.id))];
      });
      pageRef.current = nextPage;
      setHasMore(data.has_more);
    } catch { /* silencieux */ }
    finally { isLoadingMoreRef.current = false; }
  }, []);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    if (!mountedRef.current) return;
    setSearching(true);
    try {
      const data = await reelService.search(q.trim(), 1, 20);
      if (mountedRef.current) setSearchResults(data.items.filter((r: Reel) => !!r.hls_url));
    } catch {
      if (mountedRef.current) setSearchResults([]);
    } finally {
      if (mountedRef.current) setSearching(false);
    }
  }, []);

  const onSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => runSearch(text), 350);
  }, [runSearch]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchQuery('');
    setSearchResults([]);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const closeSearch = useCallback(() => {
    if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    Keyboard.dismiss();
  }, []);

  const pickSearchResult = useCallback((r: Reel) => {
    closeSearch();
    const idx = reelsRef.current.findIndex(x => x.id === r.id);
    if (idx >= 0) {
      currentIdxRef.current = idx;
      setCurrentIndex(idx);
      setTimeout(() => listRef.current?.scrollToIndex({ index: idx, animated: false }), 50);
    } else {
      setReels(prev => [r, ...prev.filter(x => x.id !== r.id)]);
      currentIdxRef.current = 0;
      setCurrentIndex(0);
    }
  }, [closeSearch]);

  // ── Mount / Unmount — cleanup uniquement ─────────────────────────────────
  // Le chargement est géré par useFocusEffect ci-dessous (évite le double load)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      sendViewForCurrent();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Focus — gère uniquement screen focus/blur, sans params ─────────────
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    if (!didFocusOnceRef.current) {
      if (!params.initialReelId) load(false);
    } else {
      const age = Date.now() - lastLoadedAtRef.current;
      if (age > 90_000) load(true);
    }
    didFocusOnceRef.current = true;
    return () => {
      setScreenFocused(false);
      try { activePlayerRef.current?.pause(); } catch {}
      requestAnimationFrame(() => sendViewForCurrent());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  // ── Params — réagit à initialReelId/reelPublished séparément ────────────
  useEffect(() => {
    const freshParams  = (route.params ?? {}) as typeof params;
    const newInitialId = freshParams.initialReelId;
    const newReel      = freshParams.initialReel as Reel | undefined;

    if (freshParams.reelPublished) {
      nav.setParams({ reelPublished: undefined } as any);
      load(false);
      return;
    }
    if (!newInitialId) return;

    // Consommer immédiatement pour éviter double traitement au prochain focus
    nav.setParams({ initialReelId: undefined, initialReel: undefined } as any);

    const idx = reelsRef.current.findIndex(r => r.id === newInitialId);
    if (idx >= 0) {
      currentIdxRef.current = idx;
      setCurrentIndex(idx);
      scrollToIdx(idx);
    } else if (newReel?.hls_url) {
      isScrollingRef.current = true;
      if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
      scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 500);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });

      const injected = [newReel, ...reelsRef.current.filter(r => r.id !== newInitialId)];
      reelsRef.current = injected;
      currentIdxRef.current = 0;
      setCurrentIndex(0);
      setReels(injected);

      lastInitialReelRef.current = newInitialId;
      load(true, newInitialId, newReel);
    } else {
      lastInitialReelRef.current = newInitialId;
      load(false, newInitialId, undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.initialReelId, params.reelPublished]);

  // ── Edit / Delete ─────────────────────────────────────────────────────────
  const handleDeleteReel = useCallback((reel: Reel) => {
    setMenuReel(null);
    Alert.alert('Supprimer ce reel ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await reelService.delete(reel.id);
            setMyReels(prev => prev.filter(r => r.id !== reel.id));
            setReels(prev => prev.filter(r => r.id !== reel.id));
          } catch (e: any) {
            Alert.alert('Erreur', e?.message ?? 'Impossible de supprimer.');
          }
        },
      },
    ]);
  }, []);

  const handleToggleReelComments = useCallback(async (reel: Reel) => {
    setMenuReel(null);
    try {
      const res = await socialService.toggleEntityComments('reel', reel.id);
      setMyReels(prev => prev.map(r => r.id === reel.id ? { ...r, comments_disabled: res.comments_disabled } : r));
      setReels(prev => prev.map(r => r.id === reel.id ? { ...r, comments_disabled: res.comments_disabled } : r));
    } catch { /**/ }
  }, []);

  const handleOpenEdit = useCallback((reel: Reel) => {
    setMenuReel(null);
    setEditCaption(reel.caption ?? '');
    setEditReel(reel);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editReel) return;
    setEditSaving(true);
    try {
      const updated = await reelService.update(editReel.id, { caption: editCaption.trim() });
      setMyReels(prev => prev.map(r => r.id === updated.id ? updated : r));
      setReels(prev => prev.map(r => r.id === updated.id ? updated : r));
      setEditReel(null);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de modifier.');
    } finally {
      setEditSaving(false);
    }
  }, [editReel, editCaption]);

  // ── Navigation reel suivant ───────────────────────────────────────────────
  const goNextReel = useCallback(() => {
    const next = currentIdxRef.current + 1;
    if (next < reelsRef.current.length) {
      currentIdxRef.current = next;
      setCurrentIndex(next);
      setTimeout(() => listRef.current?.scrollToIndex({ index: next, animated: true }), 0);
    }
  }, []);

  // ── Viewability ───────────────────────────────────────────────────────────
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null; item: Reel }> }) => {
      if (!viewableItems.length) return;
      // Ignorer les callbacks déclenchés pendant un scroll programmé
      if (isScrollingRef.current) return;
      const idx = viewableItems[0].index ?? 0;
      if (idx === currentIdxRef.current) return;

      try { activePlayerRef.current?.pause(); } catch {}

      currentIdxRef.current = idx;
      setCurrentIndex(idx);

      sendViewForCurrent();
      const cur = reelsRef.current[idx];
      if (cur) currentReelRef.current = { id: cur.id, startTime: Date.now() };

      if (idx >= reelsRef.current.length - 3) loadMoreRef.current();
    },
    [sendViewForCurrent],
  );

  // ── Callbacks stables ─────────────────────────────────────────────────────
  const onAddReel     = useCallback(() => nav.navigate('CreateReel'), [nav]);
  const onAuthorPress = useCallback((userId: string) => nav.navigate('UserProfile', { userId }), [nav]);

  // Feed reels avec pub injectee toutes les 5 reels
  const AD_INTERVAL = 5;
  const feedWithAds = useMemo(() => {
    if (!reelAd) return reels;
    const result: (Reel | { _isAd: true; id: string; ad: typeof reelAd })[] = [];
    reels.forEach((r, i) => {
      result.push(r);
      if ((i + 1) % AD_INTERVAL === 0) {
        result.push({ _isAd: true, id: `ad-${reelAd.id}-${i}`, ad: reelAd });
      }
    });
    return result;
  }, [reels, reelAd]);

  const renderVideoSlide = useCallback(({ item, index }: { item: any; index: number }) => {
    if (item._isAd) {
      return (
        <AdSlide
          ad={item.ad}
          isActive={index === currentIndex && screenFocused}
          muted={muted}
          screenW={SCREEN_W}
          screenH={SCREEN_H - HEADER_H}
        />
      );
    }
    return (
      <VideoSlide
        reel={item}
        isActive={index === currentIndex && screenFocused}
        muted={muted}
        screenW={SCREEN_W}
        screenH={SCREEN_H - HEADER_H}
        insetBottom={insets.bottom}
        colors={colors}
        currentUserId={myId ?? undefined}
        onToggleMute={toggleMute}
        onAdd={onAddReel}
        onAuthorPress={onAuthorPress}
        onEnd={goNextReel}
        activePlayerRef={activePlayerRef}
      />
    );
  }, [currentIndex, screenFocused, muted, HEADER_H, insets.bottom, colors, myId, toggleMute, onAddReel, onAuthorPress, goNextReel, reelAd, SCREEN_W, SCREEN_H]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading && reels.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <GoFolyXLoader variant="reel" color="#ffffff" />
      </View>
    );
  }

  // ── Render: empty ─────────────────────────────────────────────────────────
  if (reels.length === 0 && tab === 'feed') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        {/* Bouton retour */}
        <TouchableOpacity
          onPress={() => nav.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            position: 'absolute', top: 52, left: 16, zIndex: 10,
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.35)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        {/* Contenu vide centré */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Icon name="film" size={48} color={colors.textDisabled} />
          <Text style={{ color: colors.textTertiary, fontSize: 14 }}>Aucun reel disponible</Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8, borderRadius: 10 }}
            onPress={() => nav.navigate('CreateReel')}
          >
            <Icon name="plus" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Ajouter un reel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: Mes reels ─────────────────────────────────────────────────────
  if (tab === 'mine') {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.mineHeader}>
          <TouchableOpacity onPress={() => setTab('feed')} style={s.mineIconBtn}>
            <Icon name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.mineHeaderTitle}>Mes Reels</Text>
          <TouchableOpacity onPress={() => nav.navigate('CreateReel')} style={s.mineIconBtn}>
            <Icon name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>

        {myReels.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Icon name="film" size={36} color={colors.primary} />
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Aucun reel</Text>
            <TouchableOpacity style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }} onPress={() => nav.navigate('CreateReel')}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Créer mon premier reel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            key="mine-grid"
            data={myReels}
            keyExtractor={r => r.id}
            numColumns={2}
            contentContainerStyle={s.mineGrid}
            columnWrapperStyle={s.mineRow}
            renderItem={({ item }) => (
              <View style={s.mineCard}>
                {item.thumbnail_url
                  ? <Image source={{ uri: item.thumbnail_url }} style={s.mineThumb} resizeMode="cover" />
                  : <View style={[s.mineThumbFallback, { backgroundColor: colors.backgroundSecondary }]}>
                      <Icon name="film" size={28} color={colors.textDisabled} />
                    </View>
                }
                <View style={s.mineOverlay}>
                  <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                    <View style={s.mineStat}>
                      <Icon name="play" size={10} color="#fff" />
                      <Text style={s.mineStatText}>{formatCount(item.view_count)}</Text>
                    </View>
                    <View style={s.mineStat}>
                      <MCIcon name="heart" size={10} color="#fff" />
                      <Text style={s.mineStatText}>{formatCount(item.like_count)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setMenuReel(item)} style={s.mineMenuBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon name="more-vertical" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}

        <Modal visible={!!menuReel} transparent animationType="fade" onRequestClose={() => setMenuReel(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setMenuReel(null)}>
            <View style={[s.menuSheet, { backgroundColor: colors.backgroundSecondary }]}>
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleOpenEdit(menuReel)}>
                <Icon name="edit-2" size={18} color={colors.textPrimary} />
                <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Modifier la description</Text>
              </TouchableOpacity>
              <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleToggleReelComments(menuReel)}>
                <MCIcon name={menuReel?.comments_disabled ? 'comment-check-outline' : 'comment-off-outline'} size={18} color={colors.textPrimary} />
                <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                  {menuReel?.comments_disabled ? 'Activer les commentaires' : 'Desactiver les commentaires'}
                </Text>
              </TouchableOpacity>
              <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleDeleteReel(menuReel)}>
                <Icon name="trash-2" size={18} color="#E0389A" />
                <Text style={[s.menuItemText, { color: '#E0389A' }]}>Supprimer le reel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal visible={!!editReel} transparent animationType="slide" onRequestClose={() => setEditReel(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setEditReel(null)}>
            <View style={[s.editSheet, { backgroundColor: colors.backgroundSecondary }]} onStartShouldSetResponder={() => true}>
              <Text style={[s.editTitle, { color: colors.textPrimary }]}>Modifier la description</Text>
              <TextInput
                value={editCaption}
                onChangeText={setEditCaption}
                placeholder="Description…"
                placeholderTextColor={colors.textDisabled}
                multiline
                maxLength={300}
                style={[s.editInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              />
              <Text style={[s.charCount, { color: colors.textTertiary }]}>{editCaption.length}/300</Text>
              <View style={s.editActions}>
                <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.border }]} onPress={() => setEditReel(null)}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.primary }]} onPress={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  // ── Render: Feed principal ────────────────────────────────────────────────
  return (
    <View style={{ width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000', overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <FlatList
        ref={listRef}
        data={feedWithAds as any[]}
        keyExtractor={r => (r as any).id}
        style={{ flex: 1, marginTop: HEADER_H }}
        pagingEnabled={false}
        snapToInterval={SCREEN_H - HEADER_H}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        disableIntervalMomentum
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        extraData={`${currentIndex}-${screenFocused}-${muted}`}
        getItemLayout={(_, index) => ({ length: SCREEN_H - HEADER_H, offset: (SCREEN_H - HEADER_H) * index, index })}
        onScrollToIndexFailed={({ index }) => {
          // Fallback via offset direct — ne nécessite pas que l'item soit rendu
          scrollToIdx(index);
        }}
        onLayout={() => {
          // FlatList prête — exécuter le scroll en attente s'il y en a un
          if (pendingScrollIdx.current !== null) {
            const idx = pendingScrollIdx.current;
            pendingScrollIdx.current = null;
            scrollToIdx(idx);
          }
        }}
        renderItem={renderVideoSlide}
        removeClippedSubviews={false}
        maxToRenderPerBatch={2}
        windowSize={3}
        initialNumToRender={2}
      />

      {/* Header flottant */}
      <View style={[s.floatingHeader, { top: insets.top + 6 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => nav.canGoBack() ? nav.goBack() : nav.navigate('Feed' as any)} style={s.iconBtn}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.reelHeaderTitle}>Reels</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} pointerEvents="box-none">
          <TouchableOpacity onPress={openSearch} style={s.iconBtn}>
            <Icon name="search" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('mine')}
            style={[s.myReelsBtn, { backgroundColor: colors.primary + '30', borderColor: colors.primary + '60' }]}
          >
            <Icon name="user" size={14} color="#fff" />
            <Text style={s.myReelsBtnText}>Mes reels</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Overlay recherche */}
      {searchOpen && (
        <View style={[s.searchOverlay, { paddingTop: insets.top }]}>
          <View style={s.searchTopBar}>
            <TouchableOpacity onPress={closeSearch} style={s.searchBackBtn}>
              <Icon name="arrow-left" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={s.searchInputWrap}>
              <Icon name="search" size={15} color="rgba(255,255,255,0.4)" style={{ marginLeft: 12 }} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder="Rechercher des reels, auteurs..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={s.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => runSearch(searchQuery)}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => onSearchChange('')} style={s.searchClearBtn}>
                  <Icon name="x" size={14} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {searching ? (
            <View style={s.searchCenterState}>
              <ActivityIndicator color="#fff" size="large" />
              <Text style={s.searchStateText}>Recherche en cours…</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <FlatList
              key="search-grid"
              data={searchResults}
              keyExtractor={r => r.id}
              numColumns={2}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.searchGrid}
              columnWrapperStyle={s.searchGridRow}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.searchCard} onPress={() => pickSearchResult(item)} activeOpacity={0.9}>
                  {item.thumbnail_url
                    ? <Image source={{ uri: item.thumbnail_url }} style={s.searchThumb} resizeMode="cover" />
                    : <View style={s.searchThumbFallback}><Icon name="film" size={32} color="rgba(255,255,255,0.15)" /></View>
                  }
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.92)']} locations={[0.3, 0.6, 1]} style={s.searchCardGrad} />
                  <View style={s.searchPlayBadge}><Icon name="play" size={10} color="#fff" /></View>
                  <View style={s.searchViewBadge}>
                    <Icon name="eye" size={10} color="#fff" />
                    <Text style={s.searchBadgeText}>{formatCount(item.view_count)}</Text>
                  </View>
                  <View style={s.searchCardInfo}>
                    <View style={s.searchCardAuthorRow}>
                      {item.author?.avatar_url
                        ? <Image source={{ uri: item.author.avatar_url }} style={s.searchAvatar} />
                        : <View style={[s.searchAvatar, s.searchAvatarFallback]}>
                            <Text style={s.searchAvatarText}>{(item.author?.display_name || item.author?.username || '?')[0].toUpperCase()}</Text>
                          </View>
                      }
                      <Text style={s.searchCardAuthor} numberOfLines={1}>{item.author?.display_name || item.author?.username || ''}</Text>
                    </View>
                    {item.caption ? <Text style={s.searchCardCaption} numberOfLines={2}>{item.caption}</Text> : null}
                    <View style={s.searchCardStats}>
                      <MCIcon name="heart" size={10} color="#E0389A" />
                      <Text style={s.searchCardStat}>{formatCount(item.like_count)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          ) : searchQuery.length > 0 ? (
            <View style={s.searchCenterState}>
              <View style={s.searchEmptyIcon}><Icon name="search" size={28} color="rgba(255,255,255,0.4)" /></View>
              <Text style={s.searchStateTitle}>Aucun résultat</Text>
              <Text style={s.searchStateText}>Essaie un autre mot-clé ou nom d'auteur</Text>
            </View>
          ) : (
            <View style={s.searchCenterState}>
              <View style={s.searchEmptyIcon}><Icon name="trending-up" size={28} color="rgba(255,255,255,0.4)" /></View>
              <Text style={s.searchStateTitle}>Découvre des reels</Text>
              <Text style={s.searchStateText}>Tape le nom d'un auteur ou un mot-clé</Text>
            </View>
          )}
        </View>
      )}

      {/* loadingMore silencieux — pas d'indicateur visible comme TikTok */}
    </View>
  );
};

// ─── AdSlide — slide pub plein ecran dans le feed reels ──────────────────────

interface AdData {
  id: string;
  title: string;
  description?: string;
  cta_text?: string;
  cta_url?: string;
  creative_url?: string;
  thumbnail_url?: string;
}

const AdSlide: React.FC<{ ad: AdData; isActive: boolean; muted: boolean; screenW: number; screenH: number }> = memo(({
  ad, isActive, muted, screenW, screenH,
}) => {
  const isVideo = !!(ad.creative_url && (ad.creative_url.includes('.m3u8') || ad.creative_url.includes('/hls/') || ad.creative_url.includes('video')));
  const player = useVideoPlayer(
    isVideo && ad.creative_url ? { uri: ad.creative_url } : 'about:blank',
    p => { p.loop = true; p.muted = muted; p.volume = muted ? 0 : 1; },
  );

  useEffect(() => {
    if (!isVideo) return;
    try { if (isActive) player.play(); else player.pause(); } catch {}
  }, [isActive, isVideo, player]);

  useEffect(() => {
    try { player.muted = muted; player.volume = muted ? 0 : 1; } catch {}
  }, [muted, player]);

  // Track impression une seule fois
  const impressionSent = useRef(false);
  useEffect(() => {
    if (isActive && !impressionSent.current) {
      impressionSent.current = true;
      apiClient.post(`/api/v1/ads/${ad.id}/impression`, {}).catch(() => {});
    }
  }, [isActive, ad.id]);

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#0a0a1a' }}>
      {/* Media background */}
      {isVideo && ad.creative_url ? (
        <VideoView
          player={player}
          style={{ position: 'absolute', width: screenW, height: screenH }}
          resizeMode="cover"
          controls={false}
        />
      ) : (ad.creative_url || ad.thumbnail_url) ? (
        <Image
          source={{ uri: ad.creative_url || ad.thumbnail_url }}
          style={{ position: 'absolute', width: screenW, height: screenH }}
          resizeMode="cover"
        />
      ) : (
        <View style={{ position: 'absolute', width: screenW, height: screenH, backgroundColor: '#111' }} />
      )}

      {/* Gradient bas */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
        locations={[0.3, 0.65, 1]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: screenH * 0.55 }}
      />

      {/* Label Sponsorisé — sobre, top left */}
      <View style={{ position: 'absolute', top: 52, left: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600' }}>Sponsorisé</Text>
        <Icon name="globe" size={10} color="rgba(255,255,255,0.45)" />
      </View>

      {/* Contenu bas */}
      <View style={{ position: 'absolute', bottom: 50, left: 16, right: 72 }}>
        {/* Annonceur */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
            <Icon name="zap" size={14} color="#fff" />
          </View>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
            {ad.title}
          </Text>
        </View>
        {ad.description ? (
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 18, marginBottom: 14 }} numberOfLines={2}>
            {ad.description}
          </Text>
        ) : null}
        {ad.cta_url ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              apiClient.post(`/api/v1/ads/${ad.id}/click`, {}).catch(() => {});
              if (ad.cta_url) Linking.openURL(ad.cta_url).catch(() => {});
            }}
            style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              {ad.cta_text || 'En savoir plus'}
            </Text>
            <Icon name="chevron-right" size={13} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});

// ─── VideoSlide ───────────────────────────────────────────────────────────────

interface VideoSlideProps {
  reel:           Reel;
  isActive:       boolean;
  muted:          boolean;
  screenW:        number;
  screenH:        number;
  insetBottom:    number;
  colors:         any;
  currentUserId?: string;
  onToggleMute:   () => void;
  onAdd?:         () => void;
  onAuthorPress:  (userId: string) => void;
  onEnd:          () => void;
  activePlayerRef?: React.RefObject<{ pause: () => void } | null>;
}

const VideoSlide: React.FC<VideoSlideProps> = memo(({
  reel, isActive, muted, screenW, screenH, insetBottom,
  colors, currentUserId, onToggleMute, onAdd, onAuthorPress, onEnd, activePlayerRef,
}) => {
  const nav = useNavigation<Nav>();

  const [paused,       setPaused]       = useState(false);
  const [videoLoaded,  setVideoLoaded]  = useState(false);
  const [videoError,   setVideoError]   = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [liked,        setLiked]        = useState(reel.user_reaction === 'like');
  const [likes,        setLikes]        = useState(reel.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(reel.comment_count ?? 0);
  const [shareCount,   setShareCount]   = useState(reel.share_count ?? 0);
  const [showShare,    setShowShare]    = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText,  setCommentText]  = useState('');
  const [sending,      setSending]      = useState(false);
  const [barFocused,   setBarFocused]   = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [isPortrait,   setIsPortrait]   = useState<boolean | null>(null);
  const [ended,        setEnded]        = useState(false);
  const [isFollowing,  setIsFollowing]  = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [refInfo, setRefInfo] = useState<{ label: string; kind: string; thumbnail: string | null; color: string } | null>(null);
  const [skipLeftLabel,  setSkipLeftLabel]  = useState('');
  const [skipRightLabel, setSkipRightLabel] = useState('');
  const [showOwnerMenu,      setShowOwnerMenu]      = useState(false);
  const [commentsDisabledSt, setCommentsDisabledSt] = useState(reel.comments_disabled ?? false);
  const [togglingComments,   setTogglingComments]   = useState(false);
  const [showRemix,          setShowRemix]          = useState(false);
  const [remixLoading,       setRemixLoading]       = useState(false);
  const [cableLoading,       setCableLoading]       = useState(false);
  const [showEditCaption,    setShowEditCaption]     = useState(false);
  const [editCaptionText,    setEditCaptionText]     = useState(reel.caption ?? '');
  const [savingCaption,      setSavingCaption]       = useState(false);
  const [captionSt,          setCaptionSt]           = useState(reel.caption ?? '');

  const likeInFlight  = useRef(false);
  const pausedRef     = useRef(false);
  const endedRef      = useRef(false);
  const likedRef      = useRef(reel.user_reaction === 'like');
  const mountedRef    = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasEndedOnActivate = useRef(false);

  const MAX_RETRIES   = 3;
  const STALL_TIMEOUT = 8_000;

  const isOwnReel = !!(currentUserId && reel.author?.id && currentUserId === String(reel.author.id));

  const handleToggleFeedComments = useCallback(async () => {
    setShowOwnerMenu(false);
    if (togglingComments) return;
    setTogglingComments(true);
    try {
      const res = await socialService.toggleEntityComments('reel', reel.id);
      setCommentsDisabledSt(res.comments_disabled);
    } catch { /**/ }
    finally { setTogglingComments(false); }
  }, [reel.id, togglingComments]);

  const handleRepost = useCallback(async () => {
    if (remixLoading) return;
    setRemixLoading(true);
    try {
      await reelService.repost(reel.id);
      setShowRemix(false);
      Alert.alert('Republié', 'Le reel a été republié sur votre profil.');
    } catch {
      Alert.alert('Erreur', 'Impossible de republier ce reel.');
    } finally {
      setRemixLoading(false);
    }
  }, [reel.id, remixLoading]);

  const handleRemixer = useCallback(() => {
    setShowRemix(false);
    nav.navigate('CreateReel', { sourceReelId: reel.id, sourceReelUrl: reel.hls_url ?? undefined });
  }, [reel.id, reel.hls_url, nav]);

  const handleDeleteReel = useCallback(() => {
    setShowOwnerMenu(false);
    Alert.alert(
      'Supprimer le reel',
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              await reelService.delete(reel.id);
            } catch {
              Alert.alert('Erreur', 'Impossible de supprimer ce reel.');
            }
          },
        },
      ],
    );
  }, [reel.id]);

  const handleSaveCaption = useCallback(async () => {
    if (savingCaption) return;
    setSavingCaption(true);
    try {
      await reelService.update(reel.id, { caption: editCaptionText.trim() });
      setCaptionSt(editCaptionText.trim());
      setShowEditCaption(false);
    } catch {
      Alert.alert('Erreur', 'Impossible de modifier la description.');
    } finally {
      setSavingCaption(false);
    }
  }, [reel.id, editCaptionText, savingCaption]);

  const videoUri = reel.hls_url;
  // Mémoïsé : même URI → même objet → useVideoPlayer ne recharge pas
  const videoSource = useMemo(() => videoUri
    ? {
        uri: videoUri,
        bufferConfig: {
          minBufferMs: 1_500, maxBufferMs: 30_000,
          bufferForPlaybackMs: 800, bufferForPlaybackAfterRebufferMs: 1_500,
          backBufferDurationMs: 3_000, preferredForwardBufferDurationMs: 10_000,
        },
      }
    : 'about:blank',
  [videoUri]); // eslint-disable-line

  const player = useVideoPlayer(videoSource, p => {
    p.loop = false; p.muted = muted; p.volume = muted ? 0 : 1.0;
  });

  const clearAllTimers = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
    if (playTimerRef.current)  { clearTimeout(playTimerRef.current);  playTimerRef.current  = null; }
  }, []);

  // Cleanup complet au démontage
  useEffect(() => {
    mountedRef.current = true;
    const appSub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        clearAllTimers();
        try { player.pause(); } catch {}
      } else if (state === 'active') {
        // Retour au premier plan — reprendre si ce reel est actif et pas en pause manuelle
        if (isActiveRef.current && !pausedRef.current && mountedRef.current) {
          setTimeout(() => {
            if (isActiveRef.current && !pausedRef.current && mountedRef.current) {
              try { player.play(); } catch {}
            }
          }, 200);
        }
      }
    });
    return () => {
      mountedRef.current = false;
      appSub.remove();
      clearAllTimers();
      try { player.pause(); player.replaceSourceAsync({ uri: 'about:blank' }).catch(() => {}); } catch {}
    };
  }, []); // eslint-disable-line

  // Ratio portrait depuis thumbnail
  useEffect(() => {
    if (!reel.thumbnail_url || isPortrait !== null) return;
    Image.getSize(
      reel.thumbnail_url,
      (w, h) => { if (mountedRef.current) setIsPortrait(h >= w); },
      () => { if (mountedRef.current) setIsPortrait(true); },
    );
  }, [reel.thumbnail_url]); // eslint-disable-line

  const clearStall = useCallback(() => {
    if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
  }, []);

  const doRetry = useCallback(() => {
    if (!mountedRef.current || !reel.hls_url) return;
    clearStall();
    const attempt = retryCountRef.current;
    if (attempt >= MAX_RETRIES) {
      if (mountedRef.current) { setVideoError(true); setVideoPlaying(false); }
      return;
    }
    retryCountRef.current += 1;
    if (mountedRef.current) { setVideoError(false); setVideoLoaded(false); setVideoPlaying(false); }
    retryTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || !reel.hls_url) return;
      try {
        player.replaceSourceAsync(videoSource as any)
          .then(() => { if (mountedRef.current && !pausedRef.current) { player.play(); } })
          .catch(() => { if (mountedRef.current) doRetry(); });
      } catch { if (mountedRef.current) doRetry(); }
    }, Math.pow(2, attempt) * 1000);
  }, [player, reel.hls_url, clearStall, videoSource]); // eslint-disable-line

  const armStall = useCallback(() => {
    clearStall();
    stallTimerRef.current = setTimeout(() => {
      if (mountedRef.current && !pausedRef.current) doRetry();
    }, STALL_TIMEOUT);
  }, [clearStall, doRetry]);

  // Refs stables pour lire les valeurs courantes dans les listeners sans les recréer
  const isActiveRef = useRef(isActive);
  const onEndRef    = useRef(onEnd);
  const doRetryRef  = useRef(doRetry);
  const armStallRef = useRef(armStall);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { onEndRef.current    = onEnd;    }, [onEnd]);
  useEffect(() => { doRetryRef.current  = doRetry;  }, [doRetry]);
  useEffect(() => { armStallRef.current = armStall;  }, [armStall]);

  // Listeners souscrits une seule fois par player — pas de re-souscription au scroll
  useEffect(() => {
    const subEnd   = player.addEventListener('onEnd', () => {
      clearStall();
      if (isActiveRef.current && mountedRef.current) { endedRef.current = true; setEnded(true); onEndRef.current(); }
    });
    const subBuf   = player.addEventListener('onBuffer', (val: boolean) => {
      if (!mountedRef.current) return;
      if (val && isActiveRef.current && !pausedRef.current) armStallRef.current(); else clearStall();
    });
    const subLoad  = player.addEventListener('onLoad', (data: any) => {
      if (!mountedRef.current) return;
      setVideoLoaded(true); setVideoError(false); retryCountRef.current = 0; clearStall();
      if (data?.width && data?.height) setIsPortrait(data.height >= data.width);
      if (isActiveRef.current && !pausedRef.current) player.play();
    });
    const subState = player.addEventListener('onPlaybackStateChange', ({ isPlaying, isBuffering }: any) => {
      if (!mountedRef.current) return;
      if (isPlaying) { setVideoPlaying(true); clearStall(); }
      else if (isBuffering && isActiveRef.current && !pausedRef.current) { setVideoPlaying(false); armStallRef.current(); }
    });
    const subErr   = player.addEventListener('onError', () => {
      if (!mountedRef.current) return;
      clearStall();
      if (isActiveRef.current) doRetryRef.current();
    });
    return () => { subEnd.remove(); subBuf.remove(); subLoad.remove(); subState.remove(); subErr.remove(); };
  }, [player, clearStall]); // uniquement player — listeners stables

  // Play/Pause selon isActive
  useEffect(() => {
    if (!reel.hls_url) return;
    if (playTimerRef.current) clearTimeout(playTimerRef.current);

    if (isActive && !pausedRef.current) {
      wasEndedOnActivate.current = endedRef.current;
      if (activePlayerRef) {
        (activePlayerRef as any).current = { pause: () => { try { player.pause(); } catch {} } };
      }
      playTimerRef.current = setTimeout(() => {
        if (!mountedRef.current || pausedRef.current) return;
        if (endedRef.current) {
          // Reel termine → afficher overlay "Revoir", ne pas relancer auto
          if (mountedRef.current) setEnded(true);
        } else {
          // Reel en cours ou pas encore joue → reprend/demarre
          try { player.play(); } catch {}
        }
      }, 80);
    } else {
      try { player.pause(); } catch {}
    }
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [isActive, player]); // eslint-disable-line

  // Reset états quand inactif — garde videoLoaded + ended pour retour sans rechargement
  useEffect(() => {
    if (!isActive) {
      pausedRef.current = false; retryCountRef.current = 0;
      // endedRef + ended intentionnellement PAS remis a false :
      // si la video etait terminee, au retour scroll on affiche "Revoir" directement
      if (mountedRef.current) { setPaused(false); setVideoError(false); setVideoPlaying(false); }
      clearAllTimers(); clearStall();
    }
  }, [isActive, clearAllTimers, clearStall]);

  // Mute
  useEffect(() => {
    try { player.muted = muted; player.volume = muted ? 0 : 1.0; } catch {}
  }, [muted, player]);

  // Ref info (concert / event / film)
  useEffect(() => {
    if (!isActive || (!reel.ref_concert_id && !reel.ref_event_id && !reel.ref_content_id)) return;
    let cancelled = false;
    (async () => {
      try {
        if (reel.ref_concert_id) {
          const res = await apiClient.get<any>(`/api/v1/concerts/${reel.ref_concert_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? 'Concert', kind: 'Concert', thumbnail: d.thumbnail_url ?? null, color: '#7B3FF2' });
          }
        } else if (reel.ref_event_id) {
          const res = await apiClient.get<any>(`/api/v1/events/${reel.ref_event_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? 'Événement', kind: 'Événement', thumbnail: d.thumbnail_url ?? null, color: '#E0389A' });
          }
        } else if (reel.ref_content_id) {
          const res = await apiClient.get<any>(`/api/v1/content/films/${reel.ref_content_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? 'Film', kind: d.type === 'serie' ? 'Série' : 'Film', thumbnail: d.thumbnail_url ?? null, color: '#3B82F6' });
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isActive, reel.ref_concert_id, reel.ref_event_id, reel.ref_content_id]);

  // Animations
  const playIconOpacity  = useSharedValue(0);
  const playIconScale    = useSharedValue(0.6);
  const heartOpacity     = useSharedValue(0);
  const heartScale       = useSharedValue(0);
  const heartX           = useSharedValue(0);
  const heartY           = useSharedValue(0);
  const skipLeftOpacity  = useSharedValue(0);
  const skipLeftScale    = useSharedValue(0.5);
  const skipRightOpacity = useSharedValue(0);
  const skipRightScale   = useSharedValue(0.5);

  const playIconAnim = useAnimatedStyle(() => ({
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
    opacity: playIconOpacity.value, transform: [{ scale: playIconScale.value }],
  }));
  const heartAnim = useAnimatedStyle(() => ({
    position: 'absolute', opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }], left: heartX.value - 44, top: heartY.value - 44, zIndex: 10,
  }));
  const skipLeftAnim  = useAnimatedStyle(() => ({ opacity: skipLeftOpacity.value,  transform: [{ scale: skipLeftScale.value }] }));
  const skipRightAnim = useAnimatedStyle(() => ({ opacity: skipRightOpacity.value, transform: [{ scale: skipRightScale.value }] }));

  const showPlayIconAnim = useCallback(() => {
    playIconScale.value = 0.6; playIconOpacity.value = 0;
    playIconScale.value = withSpring(1, { damping: 10, stiffness: 200 });
    playIconOpacity.value = withSequence(withTiming(1, { duration: 0 }), withTiming(1, { duration: 300 }), withTiming(0, { duration: 150 }));
  }, [playIconOpacity, playIconScale]);

  const doPause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    try { if (next) player.pause(); else player.play(); } catch {}
    if (mountedRef.current) setPaused(next);
    showPlayIconAnim();
  }, [player, showPlayIconAnim]);

  const doLike = useCallback((x: number, y: number) => {
    if (!likedRef.current && !likeInFlight.current) {
      likedRef.current = true; likeInFlight.current = true;
      if (mountedRef.current) { setLiked(true); setLikes(v => v + 1); }
      socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id })
        .catch(() => {}).finally(() => { likeInFlight.current = false; });
    }
    heartX.value = x; heartY.value = y;
    heartScale.value = 0;
    heartOpacity.value = withTiming(1, { duration: 30 });
    heartScale.value   = withSpring(1.2, { damping: 8, stiffness: 250 });
    heartOpacity.value = withSequence(withTiming(1, { duration: 30 }), withTiming(1, { duration: 350 }), withTiming(0, { duration: 200 }));
  }, [reel.id, heartOpacity, heartScale, heartX, heartY]);

  const handleLike = useCallback(async () => {
    if (likeInFlight.current) return;
    likeInFlight.current = true;
    const wasLiked = likedRef.current;
    likedRef.current = !wasLiked;
    if (mountedRef.current) { setLiked(!wasLiked); setLikes(v => wasLiked ? v - 1 : v + 1); }
    try { await socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id }); }
    catch { likedRef.current = wasLiked; if (mountedRef.current) { setLiked(wasLiked); setLikes(reel.like_count ?? 0); } }
    finally { likeInFlight.current = false; }
  }, [reel.id, reel.like_count]);

  const handleShare = useCallback(() => {
    setShowShare(true);
  }, []);

  const doReplay = useCallback(() => {
    try { player.seekTo(0); pausedRef.current = false; player.play(); if (mountedRef.current) { setEnded(false); setPaused(false); } } catch {}
  }, [player]);

  const doSkipAnim = useCallback((seconds: number) => {
    const isLeft = seconds < 0;
    const label  = isLeft ? `◄◄ ${Math.abs(seconds)}s` : `${seconds}s ►►`;
    if (isLeft) {
      setSkipLeftLabel(label);
      skipLeftOpacity.value = 0; skipLeftScale.value = 0.6;
      skipLeftOpacity.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0.8, { duration: 250 }), withTiming(0, { duration: 150 }));
      skipLeftScale.value   = withSequence(withTiming(1.15, { duration: 80 }), withTiming(1.0, { duration: 250 }), withTiming(0.6, { duration: 150 }));
    } else {
      setSkipRightLabel(label);
      skipRightOpacity.value = 0; skipRightScale.value = 0.6;
      skipRightOpacity.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0.8, { duration: 250 }), withTiming(0, { duration: 150 }));
      skipRightScale.value   = withSequence(withTiming(1.15, { duration: 80 }), withTiming(1.0, { duration: 250 }), withTiming(0.6, { duration: 150 }));
    }
    try { player.seekBy(seconds); } catch {}
  }, [player, skipLeftOpacity, skipLeftScale, skipRightOpacity, skipRightScale]);

  const handleFocusBar = useCallback((focused: boolean) => {
    if (mountedRef.current) setBarFocused(focused);
    if (focused) { pausedRef.current = true; try { player.pause(); } catch {} if (mountedRef.current) setPaused(true); }
  }, [player]);

  const handleSendComment = useCallback(async () => {
    const body = commentText.trim();
    if (!body || sending) return;
    if (mountedRef.current) setSending(true);
    try {
      await socialService.createComment({ body, reel_id: reel.id });
      if (mountedRef.current) { setCommentText(''); setCommentCount(v => v + 1); Keyboard.dismiss(); }
    } catch {}
    finally { if (mountedRef.current) setSending(false); }
  }, [commentText, reel.id, sending]);

  const handleFollow = useCallback(async () => {
    if (!reel.author?.id || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) { await userService.unfollow(String(reel.author.id)); setIsFollowing(false); }
      else             { await userService.follow(String(reel.author.id));   setIsFollowing(true);  }
    } catch {}
    finally { setFollowLoading(false); }
  }, [reel.author?.id, isFollowing, followLoading]);

  const retryLoad = useCallback(() => { retryCountRef.current = 0; doRetry(); }, [doRetry]);

  // Gestes — 3 zones style TikTok
  const leftDoubleTap   = Gesture.Tap().numberOfTaps(2).maxDuration(250).runOnJS(true).onEnd(() => doSkipAnim(-10));
  const leftSingleTap   = Gesture.Tap().maxDuration(250).runOnJS(true).onEnd(doPause);
  const leftGesture     = Gesture.Exclusive(leftDoubleTap, leftSingleTap);
  const centerDoubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(250).runOnJS(true).onEnd(e => doLike(e.x, e.y));
  const centerSingleTap = Gesture.Tap().maxDuration(250).runOnJS(true).onEnd(doPause);
  const centerGesture   = Gesture.Exclusive(centerDoubleTap, centerSingleTap);
  const rightDoubleTap  = Gesture.Tap().numberOfTaps(2).maxDuration(250).runOnJS(true).onEnd(() => doSkipAnim(10));
  const rightSingleTap  = Gesture.Tap().maxDuration(250).runOnJS(true).onEnd(doPause);
  const rightGesture    = Gesture.Exclusive(rightDoubleTap, rightSingleTap);
  const hPanFail        = Gesture.Pan().activeOffsetX([-10, 10]).failOffsetY([-10, 10]).minDistance(10);

  const safeBottom    = Math.max(insetBottom, Platform.OS === 'android' ? 56 : 0);
  const COMMENT_BAR_H = 76;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000', overflow: 'hidden' }}>

      {reel.thumbnail_url && isPortrait !== false && (
        <Image source={{ uri: reel.thumbnail_url }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH, zIndex: -1 }} resizeMode="cover" />
      )}

      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH }}
        resizeMode={isPortrait === false ? 'contain' : 'cover'}
        controls={false}
        surfaceType="texture"
      />

      {!videoPlaying && !videoError && !ended && isActive && (
        <GoFolyXLoader variant="reel" color="#ffffff" />
      )}

      {videoError && (
        <View style={s.errorOverlay}>
          <Icon name="wifi-off" size={40} color="rgba(255,255,255,0.7)" />
          <Text style={s.errorTitle}>Vidéo indisponible</Text>
          <Text style={s.errorSub}>Vérifiez votre connexion</Text>
          <TouchableOpacity style={s.retryBtn} onPress={retryLoad} activeOpacity={0.8}>
            <Icon name="refresh-cw" size={16} color="#fff" />
            <Text style={s.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      <GestureDetector gesture={Gesture.Simultaneous(hPanFail, leftGesture)}>
        <View style={{ position: 'absolute', top: 0, left: 0, width: (screenW - 80) * 0.3, bottom: safeBottom + COMMENT_BAR_H }} />
      </GestureDetector>
      <GestureDetector gesture={Gesture.Simultaneous(hPanFail, centerGesture)}>
        <View style={{ position: 'absolute', top: 0, left: (screenW - 80) * 0.3, width: (screenW - 80) * 0.4, bottom: safeBottom + COMMENT_BAR_H }} />
      </GestureDetector>
      <GestureDetector gesture={Gesture.Simultaneous(hPanFail, rightGesture)}>
        <View style={{ position: 'absolute', top: 0, left: (screenW - 80) * 0.7, right: 80, bottom: safeBottom + COMMENT_BAR_H }} />
      </GestureDetector>

      <Animated.View pointerEvents="none" style={[s.skipRipple, s.skipRippleLeft,  skipLeftAnim]}><Text style={s.skipRippleTxt}>{skipLeftLabel}</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[s.skipRipple, s.skipRippleRight, skipRightAnim]}><Text style={s.skipRippleTxt}>{skipRightLabel}</Text></Animated.View>

      <Animated.View style={playIconAnim} pointerEvents="none">
        <View style={s.playPauseCircle}><Icon name={paused ? 'play' : 'pause'} size={36} color="#fff" /></View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={heartAnim}>
        <MCIcon name="heart" size={88} color="#E0389A" />
      </Animated.View>

      {ended && (
        <View style={s.replayOverlay} pointerEvents="box-none">
          <TouchableOpacity style={s.replayBtn} onPress={doReplay} activeOpacity={0.85}>
            <Icon name="rotate-ccw" size={32} color="#fff" />
            <Text style={s.replayTxt}>Revoir</Text>
          </TouchableOpacity>
        </View>
      )}

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']} locations={[0, 0.5, 1]} style={s.bottomGradient} pointerEvents="none" />

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">

        <View style={[s.reelInfo, { bottom: safeBottom + COMMENT_BAR_H }]} pointerEvents="box-none">
          {refInfo && (
            <View style={s.refBand}>
              <View style={[s.refKindDot, { backgroundColor: refInfo.color }]} />
              {refInfo.thumbnail
                ? <Image source={{ uri: refInfo.thumbnail }} style={s.refThumb} />
                : <View style={[s.refThumb, { backgroundColor: refInfo.color + '40', alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name={refInfo.kind === 'Concert' ? 'music' : refInfo.kind === 'Événement' ? 'calendar' : 'film'} size={12} color="#fff" />
                  </View>
              }
              <View style={{ flex: 1, overflow: 'hidden' }}>
                <Text style={s.refKind}>{refInfo.kind}</Text>
                <Text style={s.refLabel} numberOfLines={1}>{refInfo.label}</Text>
              </View>
              <Icon name="chevron-right" size={14} color="rgba(255,255,255,0.5)" />
            </View>
          )}

          <View style={s.authorRow}>
            <View style={{ position: 'relative' }}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => reel.author?.id && onAuthorPress(reel.author.id)}>
                {reel.author?.avatar_url
                  ? <Image source={{ uri: reel.author.avatar_url }} style={s.avatar} />
                  : <View style={[s.avatar, { backgroundColor: colors.primary }]}><Text style={s.avatarText}>{getAuthorInitial(reel.author)}</Text></View>
                }
              </TouchableOpacity>
              {!isOwnReel && (
                <TouchableOpacity
                  style={s.avatarPlusBtn}
                  activeOpacity={0.85}
                  onPress={() => nav.navigate('CreateReel', { sourceReelId: reel.id, sourceReelUrl: reel.hls_url ?? undefined })}
                >
                  <Icon name="plus" size={10} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity activeOpacity={0.8} onPress={() => reel.author?.id && onAuthorPress(reel.author.id)} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={s.authorName} numberOfLines={1}>{getAuthorLabel(reel.author)}</Text>
                {reel.author?.is_verified && <VerifiedBadge size={14} />}
              </View>
            </TouchableOpacity>
            {!isOwnReel && reel.author?.id && (
              <TouchableOpacity
                onPress={handleFollow}
                activeOpacity={0.8}
                disabled={followLoading}
                style={{ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: isFollowing ? 'rgba(255,255,255,0.4)' : '#fff', backgroundColor: isFollowing ? 'rgba(255,255,255,0.1)' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                {followLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{isFollowing ? 'Suivi' : 'Suivre'}</Text>
                }
              </TouchableOpacity>
            )}
          </View>

          {captionSt ? <RichText text={captionSt} textStyle={s.caption} primaryColor="#93C5FD" maxLines={3} /> : null}
          {reel.source_reel && (
            <View style={s.sourceBand}>
              <Icon name={reel.remix_type === 'remix' ? 'git-merge' : 'repeat'} size={11} color="rgba(255,255,255,0.7)" />
              {reel.source_reel.thumbnail_url
                ? <Image source={{ uri: reel.source_reel.thumbnail_url }} style={s.sourceThumb} />
                : null
              }
              <Text style={s.sourceText} numberOfLines={1}>
                {reel.remix_type === 'remix' ? 'Remix de' : 'Repost de'}{' '}
                <Text style={{ fontWeight: '800' }}>
                  {reel.source_reel.author?.display_name || reel.source_reel.author?.username || 'un créateur'}
                </Text>
              </Text>
            </View>
          )}
          {likes > 0 && (
            <FriendsWhoLiked entityType="reel" entityId={reel.id} totalLikes={likes} lightText />
          )}
        </View>

        <View style={[s.actions, { bottom: safeBottom + COMMENT_BAR_H }]}>
          <TouchableOpacity style={s.muteBtn} onPress={onToggleMute} activeOpacity={0.8}>
            <Icon name={muted ? 'volume-x' : 'volume-2'} size={22} color="#fff" />
          </TouchableOpacity>
          <ActionBtn icon="heart-outline" iconActive="heart" useMCIcon label={formatCount(likes)} color={liked ? '#E0389A' : '#fff'} onPress={handleLike} active={liked} activeBackground="rgba(224,56,154,0.25)" activeBorder="#E0389A" activeGlow="#E0389A" />
          {!commentsDisabledSt && <ActionBtn icon="message-circle" label={formatCount(commentCount)} color="#fff" onPress={() => setShowComments(true)} />}
          <ActionBtn icon="share-2" label={formatCount(shareCount)} color="#fff" onPress={handleShare} />
          <ActionBtn icon="eye" label={formatCount(reel.view_count ?? 0)} color="#fff" />
          {!isOwnReel && <ActionBtn icon="gift" label="Cadeau" color="#FFD700" onPress={() => setShowGiftPicker(true)} activeBackground="rgba(255,215,0,0.18)" activeBorder="rgba(255,215,0,0.5)" active />}
          {/* Bouton ... — regroupe Remix, Cable, Signalement pour non-proprio */}
          {!isOwnReel && (
            <TouchableOpacity style={s.actionBtn} onPress={() => setShowRemix(true)} activeOpacity={0.8}>
              <View style={s.actionCircle}>
                <Icon name="more-horizontal" size={22} color="#fff" />
              </View>
              <Text style={s.actionLabel}>Plus</Text>
            </TouchableOpacity>
          )}
          {isOwnReel && (
            <TouchableOpacity style={s.actionBtn} onPress={() => setShowOwnerMenu(true)} activeOpacity={0.8}>
              <View style={s.actionCircle}>
                <Icon name="more-vertical" size={22} color="#fff" />
              </View>
            </TouchableOpacity>
          )}
          {onAdd && (
            <TouchableOpacity style={[s.addActionBtn, { backgroundColor: colors.primary }]} onPress={onAdd}>
              <Icon name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <ReportModal visible={reportVisible} contentType="reel" contentId={reel.id} onClose={() => setReportVisible(false)} />

        {/* Owner menu — menu bas de page */}
        <Modal visible={showOwnerMenu} transparent animationType="slide" onRequestClose={() => setShowOwnerMenu(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowOwnerMenu(false)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={[s.menuSheet, { backgroundColor: colors.surface }]}>
                <View style={[s.menuDivider, { backgroundColor: colors.divider, alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 }]} />
                <TouchableOpacity style={s.menuItem} onPress={() => { setShowOwnerMenu(false); setEditCaptionText(captionSt); setShowEditCaption(true); }}>
                  <Icon name="edit-2" size={20} color={colors.textPrimary} />
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Modifier la description</Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={handleToggleFeedComments} disabled={togglingComments}>
                  <MCIcon name={commentsDisabledSt ? 'comment-check-outline' : 'comment-off-outline'} size={20} color={colors.textPrimary} />
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                    {commentsDisabledSt ? 'Activer les commentaires' : 'Desactiver les commentaires'}
                  </Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={() => { setShowOwnerMenu(false); nav.navigate('ReelStats' as any, { reelId: reel.id }); }}>
                  <Icon name="bar-chart-2" size={20} color={colors.textPrimary} />
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Stats du reel</Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={handleDeleteReel}>
                  <Icon name="trash-2" size={20} color="#ef4444" />
                  <Text style={[s.menuItemText, { color: '#ef4444' }]}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ── Bottom sheet "..." unifié pour non-proprio ── */}
        <Modal visible={showRemix} transparent animationType="slide" onRequestClose={() => setShowRemix(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowRemix(false)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={[s.menuSheet, { backgroundColor: colors.surface }]}>
                {/* Handle */}
                <View style={[s.sheetHandle, { backgroundColor: colors.divider }]} />

                {/* En-tête auteur */}
                {reel.author && (
                  <View style={s.sheetAuthorRow}>
                    {reel.author.avatar_url
                      ? <View style={s.sheetAvatar}><View style={[StyleSheet.absoluteFill, { borderRadius: 20, overflow: 'hidden' }]}><View style={{ flex: 1, backgroundColor: colors.primary }} /></View></View>
                      : <View style={[s.sheetAvatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{getAuthorInitial(reel.author)}</Text></View>
                    }
                    <View style={{ flex: 1 }}>
                      <Text style={[s.sheetAuthorName, { color: colors.textPrimary }]} numberOfLines={1}>{getAuthorLabel(reel.author)}</Text>
                      <Text style={[s.sheetAuthorSub, { color: colors.textSecondary }]} numberOfLines={1}>{reel.caption ? reel.caption.slice(0, 60) : 'Reel'}</Text>
                    </View>
                  </View>
                )}

                <View style={[s.menuDivider, { backgroundColor: colors.divider, marginHorizontal: 0 }]} />

                {/* Republier */}
                <TouchableOpacity style={s.menuItem} onPress={handleRepost} disabled={remixLoading}>
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
                    {remixLoading
                      ? <ActivityIndicator size="small" color="#A78BFA" />
                      : <Icon name="repeat" size={20} color="#A78BFA" />
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Republier</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>Partage ce reel sur ton profil avec attribution</Text>
                  </View>
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* Remixer */}
                <TouchableOpacity style={s.menuItem} onPress={handleRemixer}>
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
                    <Icon name="git-merge" size={20} color="#A78BFA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Remixer</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>Cree ta propre version de ce reel</Text>
                  </View>
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* Cable */}
                <TouchableOpacity
                  style={s.menuItem}
                  disabled={cableLoading}
                  onPress={() => {
                    if (!reel.author?.id) return;
                    const authorLabel = getAuthorLabel(reel.author);
                    Alert.alert(
                      'Invitation Cable',
                      `Envoyer une invitation de collaboration a ${authorLabel} ?`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Envoyer',
                          onPress: async () => {
                            setShowRemix(false);
                            setCableLoading(true);
                            try {
                              await cableService.sendInvite(reel.id, String(reel.author!.id));
                              Alert.alert('Invitation envoyee', `${authorLabel} a recu ton invitation Cable.`);
                            } catch (err: any) {
                              const msg = err?.response?.data?.detail ?? 'Erreur lors de l\'envoi';
                              Alert.alert('Erreur', msg);
                            } finally {
                              setCableLoading(false);
                            }
                          },
                        },
                      ],
                    );
                  }}
                >
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(96,165,250,0.15)' }]}>
                    {cableLoading
                      ? <ActivityIndicator size="small" color="#60A5FA" />
                      : <Icon name="link-2" size={20} color="#60A5FA" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Cable</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>Invite ce createur a collaborer avec toi</Text>
                  </View>
                </TouchableOpacity>

                {/* Voir mes invitations Cable */}
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => { setShowRemix(false); nav.navigate('CableInvites'); }}
                >
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(96,165,250,0.1)' }]}>
                    <Icon name="inbox" size={20} color="#60A5FA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Mes invitations Cable</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>Voir les invitations reçues et envoyées</Text>
                  </View>
                  <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* Voir le profil */}
                {reel.author?.id && (
                  <>
                    <TouchableOpacity
                      style={s.menuItem}
                      onPress={() => { setShowRemix(false); onAuthorPress(String(reel.author!.id)); }}
                    >
                      <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                        <Icon name="user" size={20} color={colors.textPrimary} />
                      </View>
                      <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Voir le profil</Text>
                    </TouchableOpacity>
                    <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                  </>
                )}

                {/* Signaler */}
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => { setShowRemix(false); setTimeout(() => setReportVisible(true), 300); }}
                >
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Icon name="flag" size={20} color="#ef4444" />
                  </View>
                  <Text style={[s.menuItemText, { color: '#ef4444' }]}>Signaler</Text>
                </TouchableOpacity>

              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Edit caption sheet */}
        <Modal visible={showEditCaption} transparent animationType="slide" onRequestClose={() => setShowEditCaption(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowEditCaption(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
                <View style={[s.editSheet, { backgroundColor: colors.surface }]}>
                  <Text style={[s.editTitle, { color: colors.textPrimary }]}>Modifier la description</Text>
                  <TextInput
                    value={editCaptionText}
                    onChangeText={setEditCaptionText}
                    multiline
                    maxLength={500}
                    style={[s.editInput, { color: colors.textPrimary, borderColor: colors.divider, backgroundColor: colors.background }]}
                    placeholder="Décrivez votre reel..."
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={[s.charCount, { color: colors.textSecondary }]}>{editCaptionText.length}/500</Text>
                  <View style={s.editActions}>
                    <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.divider }]} onPress={() => setShowEditCaption(false)}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.primary }]} onPress={handleSaveCaption} disabled={savingCaption}>
                      {savingCaption ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
        <ShareBottomSheet
          type="reel"
          reel={reel}
          visible={showShare}
          onClose={() => setShowShare(false)}
          onShareCountChange={() => { if (mountedRef.current) setShareCount(v => v + 1); }}
        />
        {showGiftPicker && reel.author?.id && (
          <GiftPickerModal reelId={reel.id} receiverId={String(reel.author.id)} receiverName={reel.author.display_name ?? reel.author.username ?? 'Créateur'} onClose={() => setShowGiftPicker(false)} />
        )}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined} style={[s.commentBarWrap, { bottom: safeBottom }]} keyboardVerticalOffset={0}>
          <View style={[s.commentBar, { backgroundColor: barFocused ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.52)', borderColor: barFocused ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)' }]}>
            <TextInput value={commentText} onChangeText={setCommentText} placeholder="Ajouter un commentaire..." placeholderTextColor="rgba(255,255,255,0.45)" onFocus={() => handleFocusBar(true)} onBlur={() => handleFocusBar(false)} style={s.commentBarInput} returnKeyType="send" onSubmitEditing={handleSendComment} maxLength={300} />
            <TouchableOpacity onPress={handleSendComment} disabled={!commentText.trim() || sending} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[s.commentBarSend, { backgroundColor: commentText.trim() ? colors.primary : 'rgba(255,255,255,0.15)' }]}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <MCIcon name="send" size={20} color={commentText.trim() ? '#fff' : 'rgba(255,255,255,0.5)'} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        <CommentsBottomSheet visible={showComments} onClose={() => setShowComments(false)} reelId={reel.id} commentsDisabled={commentsDisabledSt} onCommentAdded={() => setCommentCount(v => v + 1)} onCommentCountChange={delta => setCommentCount(v => v + delta)} />
      </View>
    </View>
  );
});

// ─── ActionBtn ────────────────────────────────────────────────────────────────

const ActionBtn: React.FC<{
  icon: string; iconActive?: string; label: string; color: string; onPress?: () => void;
  active?: boolean; activeBackground?: string; activeBorder?: string; activeGlow?: string;
  useMCIcon?: boolean;
}> = ({ icon, iconActive, label, color, onPress, active, activeBackground, activeBorder, activeGlow, useMCIcon }) => {
  const iconName = (active && iconActive) ? iconActive : icon;
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        s.actionCircle,
        active && activeBackground ? { backgroundColor: activeBackground } : {},
        active && activeBorder     ? { borderColor: activeBorder, borderWidth: 1.5 } : {},
        active && activeGlow       ? { shadowColor: activeGlow, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 } : {},
      ]}>
        {useMCIcon ? <MCIcon name={iconName} size={22} color={color} /> : <Icon name={iconName} size={20} color={color} />}
      </View>
      {!!label && <Text style={[s.actionLabel, { color }]}>{label}</Text>}
    </TouchableOpacity>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%' },

  floatingHeader: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, zIndex: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  reelHeaderTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  myReelsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  myReelsBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  playPauseCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  bufferOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', zIndex: 6, gap: 10 },
  bufferText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  errorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 7, gap: 10 },
  errorTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorSub:   { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 22, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  reelInfo:   { position: 'absolute', left: 16, right: 82, gap: 8, zIndex: 3 },
  authorRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:       { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', overflow: 'hidden' },
  avatarText:   { color: '#fff', fontWeight: '800', fontSize: 14 },
  avatarPlusBtn: { position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#000' },

  sourceBand:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignSelf: 'flex-start', maxWidth: '100%' },
  sourceThumb: { width: 20, height: 20, borderRadius: 4, overflow: 'hidden' },
  sourceText:  { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  authorName: { color: '#fff', fontWeight: '800', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  caption:    { color: '#fff', fontSize: 13, lineHeight: 19, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },

  refBand:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignSelf: 'flex-start', maxWidth: '100%' },
  refKindDot: { width: 7, height: 7, borderRadius: 4 },
  refThumb:   { width: 32, height: 32, borderRadius: 8, overflow: 'hidden' },
  refKind:    { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  refLabel:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  actions:      { position: 'absolute', right: 12, alignItems: 'center', gap: 16, zIndex: 3 },
  actionBtn:    { alignItems: 'center', gap: 4 },
  actionCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  actionLabel:  { fontSize: 11, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  addActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  muteBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  loadMoreIndicator: { position: 'absolute', bottom: 80, alignSelf: 'center', zIndex: 10 },

  commentBarWrap:  { position: 'absolute', left: 0, right: 0, zIndex: 5, paddingHorizontal: 12, paddingVertical: 8 },
  commentBar:      { flexDirection: 'row', alignItems: 'center', borderRadius: 26, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9, gap: 10 },
  commentBarInput: { flex: 1, fontSize: 13, color: '#fff', padding: 0, maxHeight: 60 },
  commentBarSend:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  mineHeader:        { flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16, gap: 12 },
  mineIconBtn:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  mineHeaderTitle:   { flex: 1, color: '#fff', fontSize: 20, fontWeight: '800' },
  mineGrid:          { padding: 8, paddingTop: 12 },
  mineRow:           { gap: 8, marginBottom: 8 },
  mineCard:          { flex: 1, overflow: 'hidden', borderRadius: 12 },
  mineThumb:         { width: '100%', aspectRatio: 9 / 14 },
  mineThumbFallback: { width: '100%', aspectRatio: 9 / 14, alignItems: 'center', justifyContent: 'center' },
  mineOverlay:       { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  mineMenuBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)' },
  mineStat:          { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mineStatText:      { color: '#fff', fontSize: 11, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  menuSheet:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36, paddingTop: 8 },
  menuItem:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 15 },
  menuItemText:  { fontSize: 15, fontWeight: '600' },
  menuDivider:   { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },

  sheetHandle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetAuthorRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  sheetAvatar:     { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  sheetAuthorName: { fontSize: 15, fontWeight: '700' },
  sheetAuthorSub:  { fontSize: 12, marginTop: 1 },
  sheetItemIcon:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sheetItemSub:    { fontSize: 12, marginTop: 2 },
  editSheet:     { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36 },
  editTitle:     { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  editInput:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  charCount:     { fontSize: 11, textAlign: 'right', marginTop: 4, marginBottom: 16 },
  editActions:   { flexDirection: 'row', gap: 12 },
  editBtn:       { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  searchOverlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0a0a0a', zIndex: 50 },
  searchTopBar:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  searchBackBtn:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 22, height: 42, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput:     { flex: 1, fontSize: 14, color: '#fff', paddingHorizontal: 10, paddingVertical: 0 },
  searchClearBtn:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', marginRight: 7 },

  searchGrid:           { padding: 10, paddingBottom: 50 },
  searchGridRow:        { gap: 8, marginBottom: 8 },
  searchCard:           { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#161616' },
  searchThumb:          { width: '100%', aspectRatio: 9 / 16 },
  searchThumbFallback:  { width: '100%', aspectRatio: 9 / 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1c' },
  searchCardGrad:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: '75%' },
  searchPlayBadge:      { position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  searchViewBadge:      { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  searchBadgeText:      { color: '#fff', fontSize: 10, fontWeight: '600' },
  searchCardInfo:       { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 9, gap: 4 },
  searchCardAuthorRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchAvatar:         { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  searchAvatarFallback: { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  searchAvatarText:     { color: '#fff', fontSize: 9, fontWeight: '700' },
  searchCardAuthor:     { color: '#fff', fontSize: 12, fontWeight: '700', flex: 1 },
  searchCardCaption:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 15 },
  searchCardStats:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  searchCardStat:       { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },
  searchCenterState:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  searchEmptyIcon:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  searchStateTitle:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchStateText:      { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

  replayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 6 },
  replayBtn:     { alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 28, paddingVertical: 18, borderRadius: 20 },
  replayTxt:     { color: '#fff', fontSize: 15, fontWeight: '700' },

  skipRipple:      { position: 'absolute', top: 0, bottom: 0, width: '30%', alignItems: 'center', justifyContent: 'center', zIndex: 8 },
  skipRippleLeft:  { left: 0 },
  skipRippleRight: { right: 80 },
  skipRippleTxt:   { color: '#fff', fontSize: 15, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  ownerMenuCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, minWidth: 220, overflow: 'hidden' },
});
