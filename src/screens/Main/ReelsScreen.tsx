import React, {
  useEffect, useState, useCallback, useRef, memo,
} from 'react';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, Dimensions,
  TouchableOpacity, ActivityIndicator, StatusBar, Image,
  Share, Platform, Alert, Modal, TextInput,
  KeyboardAvoidingView, Keyboard,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSequence, withTiming, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api';
import { reelService, socialService, authService } from '../../services';
import { userService } from '../../services/userService';
import {
  CommentsBottomSheet, VerifiedBadge, ReportModal,
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
  const HEADER_H = insets.top + 54; // hauteur du header flottant (statusBar + row)
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const nav    = useNavigation<Nav>();
  const route  = useRoute();
  const params = (route.params ?? {}) as { initialReelId?: string; initialReel?: Reel; reelPublished?: boolean };

  // ── Refs ─────────────────────────────────────────────────────────────────
  const listRef          = useRef<FlatList>(null);
  const isLoadingMoreRef = useRef(false);
  const pageRef          = useRef(1);
  const currentIdxRef    = useRef(0);
  const currentReelRef   = useRef<{ id: string; startTime: number } | null>(null);
  const viewedReelsRef   = useRef<Set<string>>(new Set());
  const activePlayerRef  = useRef<{ pause: () => void } | null>(null);
  const mountedRef       = useRef(true);
  const searchTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef   = useRef<TextInput>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 });

  // ── State ─────────────────────────────────────────────────────────────────
  const lastLoadedAtRef = useRef<number>(0);

  // Si un reel est passé depuis le feed, on l'affiche immédiatement (pas de skeleton)
  const seedReel = params.initialReel && params.initialReel.video_url ? [params.initialReel as Reel] : [];

  const [reels,         setReels]         = useState<Reel[]>(seedReel);
  const [myReels,       setMyReels]       = useState<Reel[]>([]);
  const [menuReel,      setMenuReel]      = useState<Reel | null>(null);
  const [editReel,      setEditReel]      = useState<Reel | null>(null);
  const [editCaption,   setEditCaption]   = useState('');
  const [editSaving,    setEditSaving]    = useState(false);
  const [loading,       setLoading]       = useState(seedReel.length === 0);
  const [loadingMore,   setLoadingMore]   = useState(false);
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

  // Keep refs in sync so closures don't go stale
  const reelsRef   = useRef<Reel[]>([]);
  const hasMoreRef = useRef(true);
  useEffect(() => { reelsRef.current   = reels;   }, [reels]);
  useEffect(() => { hasMoreRef.current = hasMore;  }, [hasMore]);

  // ── Mute ─────────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => setMuted(v => !v), []);

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

  // Called when index changes — send view for previous reel, start tracking new one
  useEffect(() => {
    const list = reelsRef.current;
    const cur  = list[currentIndex];
    if (!cur) return;

    // Send view for the reel we just left
    sendViewForCurrent();

    // Start tracking the new one
    currentReelRef.current = { id: cur.id, startTime: Date.now() };

    // Prefetch thumbnails : 1 en arrière + 4 en avance
    list.slice(Math.max(0, currentIndex - 1), currentIndex + 5).forEach(r => {
      if (r.thumbnail_url) Image.prefetch(r.thumbnail_url).catch(() => {});
    });
  }, [currentIndex, sendViewForCurrent]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!mountedRef.current) return;
    if (!silent) {
      setLoading(true);
    }
    pageRef.current = 1;
    isLoadingMoreRef.current = false;

    try {
      const [data, me] = await Promise.all([
        reelService.getFeed({ page: 1 }),
        authService.getMe(),
      ]);

      if (!mountedRef.current) return;

      const filtered = (data.items ?? []).filter((r: Reel) => !!r.video_url);

      // Si on a démarré avec un seed reel, s'assurer qu'il est dans le feed final
      // et placer l'index dessus — sans sauter visuellement
      let finalReels = filtered;
      let targetIdx  = 0;
      if (params.initialReelId) {
        const idx = filtered.findIndex((r: Reel) => r.id === params.initialReelId);
        if (idx >= 0) {
          targetIdx = idx;
        } else if (params.initialReel) {
          // Le reel cliqué n'est pas dans le feed (trop récent, filtré…) — on l'injecte en tête
          finalReels = [params.initialReel as Reel, ...filtered];
          targetIdx  = 0;
        }
      }

      setReels(finalReels);
      setHasMore(data.has_more);
      setMyId(String(me.id));
      viewedReelsRef.current = new Set();
      lastLoadedAtRef.current = Date.now();

      if (targetIdx > 0) {
        currentIdxRef.current = targetIdx;
        setCurrentIndex(targetIdx);
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index: targetIdx, animated: false });
        }, 150);
      }

      userService.getUserReels(String(me.id))
        .then(mine => {
          if (mountedRef.current) setMyReels(Array.isArray(mine) ? mine : []);
        })
        .catch(() => {});
    } catch {
      // En mode silent on garde l'ancien contenu, sinon on vide
      if (mountedRef.current && !silent) setReels([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [SCREEN_H, params.initialReelId]);

  // ── Load more ─────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || !mountedRef.current) return;
    isLoadingMoreRef.current = true;
    if (mountedRef.current) setLoadingMore(true);

    try {
      const nextPage = pageRef.current + 1;
      const data     = await reelService.getFeed({ page: nextPage });
      if (!mountedRef.current) return;

      const newReels = (data.items ?? []).filter((r: Reel) => !!r.video_url);
      setReels(prev => {
        const ids = new Set(prev.map(r => r.id));
        return [...prev, ...newReels.filter((r: Reel) => !ids.has(r.id))];
      });
      pageRef.current = nextPage;
      setHasMore(data.has_more);
    } catch {
      // Silencieux — l'utilisateur peut toujours scroller
    } finally {
      if (mountedRef.current) setLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  }, []);

  // Stable ref for loadMore so gesture handler never has a stale closure
  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    if (!mountedRef.current) return;
    setSearching(true);
    try {
      const data = await reelService.search(q.trim(), 1, 20);
      if (mountedRef.current) setSearchResults(data.items.filter((r: Reel) => !!r.video_url));
    } catch {
      if (mountedRef.current) setSearchResults([]);
    } finally {
      if (mountedRef.current) setSearching(false);
    }
  }, []);

  const onSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(text), 350);
  }, [runSearch]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchQuery('');
    setSearchResults([]);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const closeSearch = useCallback(() => {
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
      setTimeout(() => listRef.current?.scrollToIndex({ index: 0, animated: false }), 50);
    }
  }, [closeSearch]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    // Si on a un seed reel (navigation depuis le feed), le feed complet charge en silent
    // — le reel joue immédiatement pendant ce temps
    load(seedReel.length > 0);
    return () => {
      mountedRef.current = false;
      if (searchTimer.current) clearTimeout(searchTimer.current);
      // Send view for the reel that was active when unmounting
      sendViewForCurrent();
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const didFocusOnceRef = useRef(false);
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    if (params.reelPublished) {
      nav.setParams({ reelPublished: undefined } as any);
      load(); // nouveau reel publie : rechargement complet avec spinner
    } else if (didFocusOnceRef.current) {
      const age = Date.now() - lastLoadedAtRef.current;
      if (age > 60_000) {
        load(true); // retour sur l'ecran : silent, garde le reel actuel visible
      }
    }
    didFocusOnceRef.current = true;
    return () => {
      setScreenFocused(false);
      sendViewForCurrent();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.reelPublished]));

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

  // ── Avance au reel suivant (onEnd stable, hors renderItem) ───────────────
  const goNextReel = useCallback(() => {
    const next = currentIdxRef.current + 1;
    if (next < reelsRef.current.length) {
      currentIdxRef.current = next;
      setCurrentIndex(next);
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: next, animated: true });
      }, 0);
    }
  }, []);

  // ── viewabilityCallbacks (FlatList natif) ────────────────────────────────
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null; item: Reel }> }) => {
      if (!viewableItems.length) return;
      const first = viewableItems[0];
      const idx   = first.index ?? 0;
      if (idx === currentIdxRef.current) return;

      // Pause le player précédent
      activePlayerRef.current?.pause();

      currentIdxRef.current = idx;
      setCurrentIndex(idx);

      // Tracker la vue
      sendViewForCurrent();
      const cur = reelsRef.current[idx];
      if (cur) currentReelRef.current = { id: cur.id, startTime: Date.now() };

      // Charger plus si proche de la fin
      const total = reelsRef.current.length;
      if (idx >= total - 3) loadMoreRef.current();
    },
    [sendViewForCurrent],
  );

  // ── Render: chargement initial — spinner minimal style TikTok
  if (loading && reels.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  // ── Render: empty feed ────────────────────────────────────────────────────
  if (reels.length === 0 && tab === 'feed') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
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
    );
  }

  // ── Render: "Mes reels" tab ───────────────────────────────────────────────
  if (tab === 'mine') {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.mineHeader}
        >
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
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
              onPress={() => nav.navigate('CreateReel')}
            >
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
                      <Icon name="heart" size={10} color="#fff" />
                      <Text style={s.mineStatText}>{formatCount(item.like_count)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setMenuReel(item)}
                    style={s.mineMenuBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon name="more-vertical" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}

        {/* Menu contextuel */}
        <Modal visible={!!menuReel} transparent animationType="fade" onRequestClose={() => setMenuReel(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setMenuReel(null)}>
            <View style={[s.menuSheet, { backgroundColor: colors.backgroundSecondary }]}>
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleOpenEdit(menuReel)}>
                <Icon name="edit-2" size={18} color={colors.textPrimary} />
                <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Modifier la description</Text>
              </TouchableOpacity>
              <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleDeleteReel(menuReel)}>
                <Icon name="trash-2" size={18} color="#E0389A" />
                <Text style={[s.menuItemText, { color: '#E0389A' }]}>Supprimer le reel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Édition caption */}
        <Modal visible={!!editReel} transparent animationType="slide" onRequestClose={() => setEditReel(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setEditReel(null)}>
            <View
              style={[s.editSheet, { backgroundColor: colors.backgroundSecondary }]}
              onStartShouldSetResponder={() => true}
            >
              <Text style={[s.editTitle, { color: colors.textPrimary }]}>Modifier la description</Text>
              <TextInput
                value={editCaption}
                onChangeText={setEditCaption}
                placeholder="Description…"
                placeholderTextColor={colors.textDisabled}
                multiline
                maxLength={300}
                style={[s.editInput, {
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  borderColor: colors.border,
                }]}
              />
              <Text style={[s.charCount, { color: colors.textTertiary }]}>{editCaption.length}/300</Text>
              <View style={s.editActions}>
                <TouchableOpacity
                  style={[s.editBtn, { backgroundColor: colors.border }]}
                  onPress={() => setEditReel(null)}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.editBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSaveEdit}
                  disabled={editSaving}
                >
                  {editSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>
                  }
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
        data={reels}
        keyExtractor={r => r.id}
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
        getItemLayout={(_, index) => ({ length: SCREEN_H - HEADER_H, offset: (SCREEN_H - HEADER_H) * index, index })}
        renderItem={({ item, index }) => (
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
            onAdd={() => nav.navigate('CreateReel')}
            onAuthorPress={userId => nav.navigate('UserProfile', { userId })}
            onEnd={goNextReel}
            activePlayerRef={activePlayerRef}
          />
        )}
      />

      {/* Header flottant */}
      <View style={[s.floatingHeader, { top: insets.top + 6 }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => nav.canGoBack() ? nav.goBack() : nav.navigate('Feed' as any)}
          style={s.iconBtn}
        >
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.reelHeaderTitle}>Reels</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} pointerEvents="box-none">
          <TouchableOpacity onPress={openSearch} style={s.iconBtn}>
            <Icon name="search" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('mine')}
            style={[s.myReelsBtn, {
              backgroundColor: colors.primary + '30',
              borderColor:     colors.primary + '60',
            }]}
          >
            <Icon name="user" size={14} color="#fff" />
            <Text style={s.myReelsBtnText}>Mes reels</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Overlay de recherche */}
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
                <TouchableOpacity
                  style={s.searchCard}
                  onPress={() => pickSearchResult(item)}
                  activeOpacity={0.9}
                >
                  {item.thumbnail_url
                    ? <Image source={{ uri: item.thumbnail_url }} style={s.searchThumb} resizeMode="cover" />
                    : <View style={s.searchThumbFallback}>
                        <Icon name="film" size={32} color="rgba(255,255,255,0.15)" />
                      </View>
                  }
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.92)']}
                    locations={[0.3, 0.6, 1]}
                    style={s.searchCardGrad}
                  />
                  <View style={s.searchPlayBadge}>
                    <Icon name="play" size={10} color="#fff" />
                  </View>
                  <View style={s.searchViewBadge}>
                    <Icon name="eye" size={10} color="#fff" />
                    <Text style={s.searchBadgeText}>{formatCount(item.view_count)}</Text>
                  </View>
                  <View style={s.searchCardInfo}>
                    <View style={s.searchCardAuthorRow}>
                      {item.author?.avatar_url
                        ? <Image source={{ uri: item.author.avatar_url }} style={s.searchAvatar} />
                        : <View style={[s.searchAvatar, s.searchAvatarFallback]}>
                            <Text style={s.searchAvatarText}>
                              {(item.author?.display_name || item.author?.username || '?')[0].toUpperCase()}
                            </Text>
                          </View>
                      }
                      <Text style={s.searchCardAuthor} numberOfLines={1}>
                        {item.author?.display_name || item.author?.username || ''}
                      </Text>
                    </View>
                    {item.caption ? (
                      <Text style={s.searchCardCaption} numberOfLines={2}>{item.caption}</Text>
                    ) : null}
                    <View style={s.searchCardStats}>
                      <Icon name="heart" size={10} color="#E0389A" />
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

      {/* Préchargement silencieux : 1 en arrière + 3 en avance */}
      {reels[currentIndex - 1]?.video_url && (
        <VideoPreloader key={`pre_${reels[currentIndex - 1].id}`} uri={reels[currentIndex - 1].video_url!} />
      )}
      {reels[currentIndex + 1]?.video_url && (
        <VideoPreloader key={`pre_${reels[currentIndex + 1].id}`} uri={reels[currentIndex + 1].video_url!} />
      )}
      {reels[currentIndex + 2]?.video_url && (
        <VideoPreloader key={`pre_${reels[currentIndex + 2].id}`} uri={reels[currentIndex + 2].video_url!} />
      )}
      {reels[currentIndex + 3]?.video_url && (
        <VideoPreloader key={`pre_${reels[currentIndex + 3].id}`} uri={reels[currentIndex + 3].video_url!} />
      )}

      {loadingMore && (
        <View style={s.loadMoreIndicator}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
    </View>
  );
};

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
  const [paused,         setPaused]         = useState(false);
  const [buffering,      setBuffering]      = useState(false);
  const [videoLoaded,    setVideoLoaded]    = useState(false);
  const [videoError,     setVideoError]     = useState(false);
  const [liked,          setLiked]          = useState(reel.user_reaction === 'like');
  const [likes,          setLikes]          = useState(reel.like_count ?? 0);
  const [commentCount,   setCommentCount]   = useState(reel.comment_count ?? 0);
  const [shareCount,     setShareCount]     = useState(reel.share_count ?? 0);
  const [showComments,   setShowComments]   = useState(false);
  const [commentText,    setCommentText]    = useState('');
  const [sending,        setSending]        = useState(false);
  const [barFocused,     setBarFocused]     = useState(false);
  const [reportVisible,  setReportVisible]  = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [isPortrait,     setIsPortrait]     = useState<boolean | null>(null);
  const [refInfo, setRefInfo] = useState<{
    label: string; kind: string; thumbnail: string | null; color: string;
  } | null>(null);

  const likeInFlight   = useRef(false);
  const pausedRef      = useRef(false);
  const likedRef       = useRef(reel.user_reaction === 'like');
  const mountedRef     = useRef(true);
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef  = useRef(0);
  const stallTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_RETRIES    = 3;
  const STALL_TIMEOUT  = 8_000; // ms sans progression avant retry forcé

  const isOwnReel = !!(currentUserId && reel.author?.id && currentUserId === String(reel.author.id));

  // Source avec buffer agressif : 30s en avance (Android) / 20s (iOS)
  const videoSource = reel.video_url
    ? {
        uri: reel.video_url,
        bufferConfig: {
          // Android — ExoPlayer
          minBufferMs:                    5_000,  // commence à jouer dès 5s buffered
          maxBufferMs:                    30_000, // charge jusqu'à 30s en avance
          bufferForPlaybackMs:            1_500,  // reprend la lecture après rebuffer dès 1.5s
          bufferForPlaybackAfterRebufferMs: 3_000,
          backBufferDurationMs:           5_000,  // garde 5s derrière pour seek rapide
          // iOS — AVPlayer
          preferredForwardBufferDurationMs: 20_000, // charge 20s en avance
        },
      }
    : 'about:blank';

  // ── Player ────────────────────────────────────────────────────────────────
  const player = useVideoPlayer(
    videoSource,
    p => {
      p.loop   = false;
      p.muted  = muted;
      p.volume = muted ? 0 : 1.0;
    },
  );

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      if (playTimerRef.current)  clearTimeout(playTimerRef.current);
      try {
        player.pause();
        player.replaceSourceAsync({ uri: 'about:blank' }).catch(() => {});
      } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ratio depuis le thumbnail (détection rapide avant la vidéo) ─────────
  useEffect(() => {
    if (!reel.thumbnail_url) return;
    Image.getSize(
      reel.thumbnail_url,
      (w, h) => { if (mountedRef.current && isPortrait === null) setIsPortrait(h >= w); },
      () => { if (mountedRef.current && isPortrait === null) setIsPortrait(true); },
    );
  }, [reel.thumbnail_url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stall timer : si buffering bloqué > STALL_TIMEOUT, on force un retry ──
  const clearStall = useCallback(() => {
    if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
  }, []);

  const armStall = useCallback(() => {
    clearStall();
    stallTimerRef.current = setTimeout(() => {
      if (mountedRef.current && !pausedRef.current) doRetry(); // eslint-disable-line @typescript-eslint/no-use-before-define
    }, STALL_TIMEOUT);
  }, [clearStall]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Retry avec backoff exponentiel (silencieux jusqu'au dernier essai) ────
  const doRetry = useCallback(() => {
    if (!mountedRef.current || !reel.video_url) return;
    clearStall();
    const attempt = retryCountRef.current;
    if (attempt >= MAX_RETRIES) {
      // Tous les retries épuisés → on affiche l'erreur
      if (mountedRef.current) { setVideoError(true); setBuffering(false); }
      return;
    }
    retryCountRef.current += 1;
    // Silencieux : on cache l'erreur, on montre juste le buffering
    if (mountedRef.current) { setVideoError(false); setVideoLoaded(false); setBuffering(true); }
    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || !reel.video_url) return;
      try {
        player.replaceSourceAsync(videoSource as any).then(() => {
          if (mountedRef.current && !pausedRef.current) {
            player.play();
            armStall();
          }
        }).catch(() => { if (mountedRef.current) doRetry(); });
      } catch { if (mountedRef.current) doRetry(); }
    }, delay);
  }, [player, reel.video_url, clearStall, armStall]);

  // Retry manuel depuis le bouton "Réessayer" — remet le compteur à zéro
  const retryLoad = useCallback(() => {
    retryCountRef.current = 0;
    doRetry();
  }, [doRetry]);

  // ── Événements player ─────────────────────────────────────────────────────
  useEffect(() => {
    const subEnd = player.addEventListener('onEnd', () => {
      clearStall();
      if (isActive) onEnd();
    });
    const subBuf = player.addEventListener('onBuffer', (val: boolean) => {
      if (!mountedRef.current) return;
      setBuffering(val);
      if (val && isActive && !pausedRef.current) {
        // Video en train de buffer : arme le stall timer
        armStall();
      } else {
        clearStall();
      }
    });
    const subLoad = player.addEventListener('onLoad', (data: any) => {
      if (!mountedRef.current) return;
      setVideoLoaded(true);
      setVideoError(false);
      setBuffering(false);
      retryCountRef.current = 0;
      clearStall();
      if (data?.width && data?.height) setIsPortrait(data.height >= data.width);
      // Garantit la lecture si isActive était true avant que le player soit prêt
      if (isActive && !pausedRef.current) player.play();
    });
    const subErr = player.addEventListener('onError', () => {
      if (!mountedRef.current) return;
      setBuffering(false);
      clearStall();
      // Retry silencieux si on est sur ce reel, sinon on ignore
      if (isActive) doRetry();
    });
    return () => { subEnd.remove(); subBuf.remove(); subLoad.remove(); subErr.remove(); };
  }, [isActive, onEnd, player, doRetry, armStall, clearStall]);

  // ── Play/Pause selon isActive ─────────────────────────────────────────────
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!reel.video_url) return;
    if (playTimerRef.current) clearTimeout(playTimerRef.current);

    if (isActive && !pausedRef.current) {
      if (activePlayerRef) {
        (activePlayerRef as React.MutableRefObject<{ pause: () => void } | null>).current = {
          pause: () => player.pause(),
        };
      }
      // Petit délai pour laisser le player natif s'initialiser avant play()
      // Nécessaire quand le slide devient actif immédiatement au montage (seed reel)
      playTimerRef.current = setTimeout(() => {
        if (mountedRef.current && !pausedRef.current) player.play();
      }, 50);
    } else {
      player.pause();
    }

    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [isActive, player]); // `paused` géré via pausedRef

  // Réinitialiser états quand on quitte le slide
  useEffect(() => {
    if (!isActive) {
      pausedRef.current = false;
      retryCountRef.current = 0;
      if (mountedRef.current) {
        setPaused(false);
        setVideoError(false);
      }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      clearStall();
    }
  }, [isActive, clearStall]);

  // ── Mute ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    player.muted  = muted;
    player.volume = muted ? 0 : 1.0;
  }, [muted, player]);

  // ── Ref info (concert / event / film) ────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    if (!reel.ref_concert_id && !reel.ref_event_id && !reel.ref_content_id) return;

    let cancelled = false;
    const fetchRef = async () => {
      try {
        if (reel.ref_concert_id) {
          const res = await apiClient.get<any>(`/api/v1/concerts/${reel.ref_concert_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? d.name ?? 'Concert', kind: 'Concert', thumbnail: d.thumbnail_url ?? d.poster_url ?? null, color: '#7B3FF2' });
          }
        } else if (reel.ref_event_id) {
          const res = await apiClient.get<any>(`/api/v1/events/${reel.ref_event_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? d.name ?? 'Événement', kind: 'Événement', thumbnail: d.thumbnail_url ?? d.cover_url ?? null, color: '#E0389A' });
          }
        } else if (reel.ref_content_id) {
          const res = await apiClient.get<any>(`/api/v1/content/films/${reel.ref_content_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? 'Film', kind: d.type === 'serie' ? 'Série' : 'Film', thumbnail: d.thumbnail_url ?? null, color: '#3B82F6' });
          }
        }
      } catch {}
    };
    fetchRef();
    return () => { cancelled = true; };
  }, [isActive, reel.ref_concert_id, reel.ref_event_id, reel.ref_content_id]);

  // ── Animations ────────────────────────────────────────────────────────────
  const playIconOpacity = useSharedValue(0);
  const playIconScale   = useSharedValue(0.6);
  const heartOpacity    = useSharedValue(0);
  const heartScale      = useSharedValue(0);
  const heartX          = useSharedValue(0);
  const heartY          = useSharedValue(0);

  const playIconAnim = useAnimatedStyle(() => ({
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
    opacity: playIconOpacity.value,
    transform: [{ scale: playIconScale.value }],
  }));

  const heartAnim = useAnimatedStyle(() => ({
    position: 'absolute',
    opacity:  heartOpacity.value,
    transform: [{ scale: heartScale.value }],
    left: heartX.value - 44,
    top:  heartY.value - 44,
    zIndex: 10,
  }));

  // ── Actions ───────────────────────────────────────────────────────────────
  const showPlayIconAnim = useCallback(() => {
    playIconScale.value   = 0.6;
    playIconOpacity.value = 0;
    playIconScale.value   = withSpring(1, { damping: 10, stiffness: 200 });
    playIconOpacity.value = withSequence(
      withTiming(1, { duration: 0 }),
      withTiming(1, { duration: 300 }),
      withTiming(0, { duration: 150 }),
    );
  }, [playIconOpacity, playIconScale]);

  const doPause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    if (next) { player.pause(); } else { player.play(); }
    if (mountedRef.current) setPaused(next);
    showPlayIconAnim();
  }, [player, showPlayIconAnim]);

  const doLike = useCallback((x: number, y: number) => {
    if (!likedRef.current && !likeInFlight.current) {
      likedRef.current     = true;
      likeInFlight.current = true;
      if (mountedRef.current) { setLiked(true); setLikes(v => v + 1); }
      socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id })
        .catch(() => {})
        .finally(() => { likeInFlight.current = false; });
    }
    heartX.value = x;
    heartY.value = y;
    heartScale.value   = 0;
    heartOpacity.value = withTiming(1, { duration: 30 });
    heartScale.value   = withSpring(1.2, { damping: 8, stiffness: 250 });
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 30 }),
      withTiming(1, { duration: 350 }),
      withTiming(0, { duration: 200 }),
    );
  }, [reel.id, heartOpacity, heartScale, heartX, heartY]);

  const handleLike = useCallback(async () => {
    if (likeInFlight.current) return;
    likeInFlight.current = true;
    const wasLiked = likedRef.current;
    likedRef.current = !wasLiked;
    if (mountedRef.current) { setLiked(!wasLiked); setLikes(v => wasLiked ? v - 1 : v + 1); }
    try {
      await socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id });
    } catch {
      likedRef.current = wasLiked;
      if (mountedRef.current) { setLiked(wasLiked); setLikes(reel.like_count ?? 0); }
    } finally {
      likeInFlight.current = false;
    }
  }, [reel.id, reel.like_count]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: reel.caption
          ? `${reel.caption}\n${reel.video_url ?? ''}`
          : (reel.video_url ?? ''),
      });
      await socialService.share({ platform: Platform.OS, reel_id: reel.id });
      if (mountedRef.current) setShareCount(v => v + 1);
    } catch {}
  }, [reel]);

  const handleFocusBar = useCallback((focused: boolean) => {
    if (mountedRef.current) setBarFocused(focused);
    if (focused) {
      pausedRef.current = true;
      player.pause();
      if (mountedRef.current) setPaused(true);
    }
  }, [player]);

  const handleSendComment = useCallback(async () => {
    const body = commentText.trim();
    if (!body || sending) return;
    if (mountedRef.current) setSending(true);
    try {
      await socialService.createComment({ body, reel_id: reel.id });
      if (mountedRef.current) {
        setCommentText('');
        setCommentCount(v => v + 1);
        Keyboard.dismiss();
      }
    } catch {}
    finally { if (mountedRef.current) setSending(false); }
  }, [commentText, reel.id, sending]);

  // ── Gestes ────────────────────────────────────────────────────────────────
  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .runOnJS(true)
    .onEnd(doPause);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .runOnJS(true)
    .onEnd(e => doLike(e.x, e.y));

  // Pan horizontal (pour éviter que le parent pan vertical n'absorbe les gestes horizontaux)
  const hPanFail = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .minDistance(10);

  const tapGesture = Gesture.Simultaneous(
    hPanFail,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const safeBottom    = Math.max(insetBottom, Platform.OS === 'android' ? 56 : 0);
  const COMMENT_BAR_H = 76;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000', overflow: 'hidden' }}>

      {/* Thumbnail en arrière-plan uniquement pour les vidéos portrait */}
      {reel.thumbnail_url && isPortrait !== false && (
        <Image
          source={{ uri: reel.thumbnail_url }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH, zIndex: -1 }}
          resizeMode="cover"
        />
      )}

      {/* Vidéo */}
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH }}
        resizeMode={isPortrait === false ? 'contain' : 'cover'}
        controls={false}
        surfaceType="texture"
      />

      {/* Chargement / buffering */}
      {(buffering && !videoLoaded && !videoError) && (
        <View style={s.bufferOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.85)" />
          <Text style={s.bufferText}>Chargement…</Text>
        </View>
      )}

      {/* Erreur de chargement */}
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

      {/* Zone de tap (exclut le panel d'actions et la barre de commentaire) */}
      <GestureDetector gesture={tapGesture}>
        <View style={{
          position: 'absolute', top: 0, left: 0,
          right: 80,
          bottom: safeBottom + COMMENT_BAR_H,
        }} />
      </GestureDetector>

      {/* Icône play/pause animée */}
      <Animated.View style={playIconAnim} pointerEvents="none">
        <View style={s.playPauseCircle}>
          <Icon name={paused ? 'play' : 'pause'} size={36} color="#fff" />
        </View>
      </Animated.View>

      {/* Cœur double-tap */}
      <Animated.View pointerEvents="none" style={heartAnim}>
        <Icon name="heart" size={88} color="#E0389A" />
      </Animated.View>



      {/* Gradient bas */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.5, 1]}
        style={s.bottomGradient}
        pointerEvents="none"
      />

      {/* Infos + actions */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">

        {/* Infos auteur / caption */}
        <View style={[s.reelInfo, { bottom: safeBottom + COMMENT_BAR_H }]} pointerEvents="box-none">
          {refInfo && (
            <View style={s.refBand}>
              <View style={[s.refKindDot, { backgroundColor: refInfo.color }]} />
              {refInfo.thumbnail
                ? <Image source={{ uri: refInfo.thumbnail }} style={s.refThumb} />
                : <View style={[s.refThumb, { backgroundColor: refInfo.color + '40', alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon
                      name={refInfo.kind === 'Concert' ? 'music' : refInfo.kind === 'Événement' ? 'calendar' : 'film'}
                      size={12} color="#fff"
                    />
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
            <TouchableOpacity activeOpacity={0.8} onPress={() => reel.author?.id && onAuthorPress(reel.author.id)}>
              {reel.author?.avatar_url
                ? <Image source={{ uri: reel.author.avatar_url }} style={s.avatar} />
                : <View style={[s.avatar, { backgroundColor: colors.primary }]}>
                    <Text style={s.avatarText}>{getAuthorInitial(reel.author)}</Text>
                  </View>
              }
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.8} onPress={() => reel.author?.id && onAuthorPress(reel.author.id)}>
              <Text style={s.authorName}>{getAuthorLabel(reel.author)}</Text>
            </TouchableOpacity>
            {reel.author?.is_verified && <VerifiedBadge size={14} />}
          </View>

          {reel.caption ? (
            <Text style={s.caption} numberOfLines={3}>{reel.caption}</Text>
          ) : null}
        </View>

        {/* Boutons d'action */}
        <View style={[s.actions, { bottom: safeBottom + COMMENT_BAR_H }]}>
          <TouchableOpacity style={s.muteBtn} onPress={onToggleMute} activeOpacity={0.8}>
            <Icon name={muted ? 'volume-x' : 'volume-2'} size={22} color="#fff" />
          </TouchableOpacity>
          <ActionBtn icon="heart"          label={formatCount(likes)}         color={liked ? '#E0389A' : '#fff'} onPress={handleLike} />
          <ActionBtn icon="message-circle" label={formatCount(commentCount)}  color="#fff" onPress={() => setShowComments(true)} />
          <ActionBtn icon="share-2"        label={formatCount(shareCount)}    color="#fff" onPress={handleShare} />
          <ActionBtn icon="eye"            label={formatCount(reel.view_count ?? 0)} color="#fff" />
          {!isOwnReel && (
            <ActionBtn icon="gift" label="Cadeau" color="#FFD700" onPress={() => setShowGiftPicker(true)} />
          )}
          {!isOwnReel && (
            <ActionBtn icon="flag" label="" color="rgba(255,255,255,0.7)" onPress={() => setReportVisible(true)} />
          )}
          {onAdd && (
            <TouchableOpacity style={[s.addActionBtn, { backgroundColor: colors.primary }]} onPress={onAdd}>
              <Icon name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Modals */}
        <ReportModal
          visible={reportVisible}
          contentType="reel"
          contentId={reel.id}
          onClose={() => setReportVisible(false)}
        />
        {showGiftPicker && reel.author?.id && (
          <GiftPickerModal
            reelId={reel.id}
            receiverId={String(reel.author.id)}
            receiverName={reel.author.display_name ?? reel.author.username ?? 'Créateur'}
            onClose={() => setShowGiftPicker(false)}
          />
        )}

        {/* Barre de commentaire */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : undefined}
          style={[s.commentBarWrap, { bottom: safeBottom }]}
          keyboardVerticalOffset={0}
        >
          <View style={[s.commentBar, {
            backgroundColor: barFocused ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.52)',
            borderColor:     barFocused ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)',
          }]}>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              onFocus={() => handleFocusBar(true)}
              onBlur={() => handleFocusBar(false)}
              style={s.commentBarInput}
              returnKeyType="send"
              onSubmitEditing={handleSendComment}
              maxLength={300}
            />
            <TouchableOpacity
              onPress={handleSendComment}
              disabled={!commentText.trim() || sending}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[s.commentBarSend, {
                backgroundColor: commentText.trim() ? colors.primary : 'rgba(255,255,255,0.15)',
              }]}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name="send" size={15} color={commentText.trim() ? '#fff' : 'rgba(255,255,255,0.5)'} />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* Commentaires */}
        <CommentsBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          reelId={reel.id}
          onCommentAdded={() => setCommentCount(v => v + 1)}
          onCommentCountChange={delta => setCommentCount(v => v + delta)}
        />
      </View>
    </View>
  );
});

// ─── VideoPreloader ───────────────────────────────────────────────────────────

// Lance la lecture silencieuse pour remplir le buffer réseau, puis met en pause.
// 15s = assez pour buffer ~50% d'un reel court sur 3G avant que l'user y arrive.
const BUFFER_SECS = 15;

const VideoPreloader: React.FC<{ uri: string }> = memo(({ uri }) => {
  const player = useVideoPlayer(
    {
      uri,
      bufferConfig: {
        minBufferMs:                      5_000,
        maxBufferMs:                      30_000,
        bufferForPlaybackMs:              1_500,
        bufferForPlaybackAfterRebufferMs: 3_000,
        preferredForwardBufferDurationMs: 20_000,
      },
    },
    p => {
      p.muted  = true;
      p.volume = 0;
      p.loop   = false;
    },
  );

  useEffect(() => {
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      player.play();
      // Après BUFFER_SECS secondes de lecture silencieuse le buffer est chargé,
      // on s'arrête pour ne pas consommer batterie/data inutilement.
      pauseTimer = setTimeout(() => {
        try { player.pause(); } catch {}
      }, BUFFER_SECS * 1000);
    } catch {}

    return () => {
      if (pauseTimer) clearTimeout(pauseTimer);
      try { player.pause(); } catch {}
    };
  }, [uri, player]);

  return null;
});


// ─── ActionBtn ────────────────────────────────────────────────────────────────

const ActionBtn: React.FC<{
  icon: string; label: string; color: string; onPress?: () => void;
}> = ({ icon, label, color, onPress }) => (
  <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.7}>
    <Icon name={icon} size={26} color={color} />
    {!!label && <Text style={[s.actionLabel, { color }]}>{label}</Text>}
  </TouchableOpacity>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%' },

  floatingHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, zIndex: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  reelHeaderTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  myReelsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  myReelsBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  playPauseCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  bufferOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)', zIndex: 6, gap: 10,
  },
  bufferText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },

  errorOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 7, gap: 10,
  },
  errorTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorSub:   { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)', borderRadius: 22,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  reelInfo: { position: 'absolute', left: 16, right: 82, gap: 8, zIndex: 3 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff', overflow: 'hidden',
  },
  avatarText:  { color: '#fff', fontWeight: '800', fontSize: 14 },
  authorName:  { color: '#fff', fontWeight: '800', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  caption:     { color: '#fff', fontSize: 13, lineHeight: 19, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },

  refBand: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'flex-start', maxWidth: '100%',
  },
  refKindDot: { width: 7, height: 7, borderRadius: 4 },
  refThumb:   { width: 32, height: 32, borderRadius: 8, overflow: 'hidden' },
  refKind:    { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  refLabel:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  actions: { position: 'absolute', right: 12, alignItems: 'center', gap: 20, zIndex: 3 },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionLabel: { fontSize: 12, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  addActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  muteBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  loadMoreIndicator: { position: 'absolute', bottom: 80, alignSelf: 'center', zIndex: 10 },

commentBarWrap: { position: 'absolute', left: 0, right: 0, zIndex: 5, paddingHorizontal: 12, paddingVertical: 8 },
  commentBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 26, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9, gap: 10 },
  commentBarInput: { flex: 1, fontSize: 13, color: '#fff', padding: 0, maxHeight: 60 },
  commentBarSend: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  mineHeader:      { flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16, gap: 12 },
  mineIconBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  mineHeaderTitle: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '800' },
  mineGrid:        { padding: 8, paddingTop: 12 },
  mineRow:         { gap: 8, marginBottom: 8 },
  mineCard:        { flex: 1, overflow: 'hidden', borderRadius: 12 },
  mineThumb:       { width: '100%', aspectRatio: 9 / 14 },
  mineThumbFallback: { width: '100%', aspectRatio: 9 / 14, alignItems: 'center', justifyContent: 'center' },
  mineOverlay:     { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  mineMenuBtn:     { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)' },
  mineStat:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mineStatText:    { color: '#fff', fontSize: 11, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  menuSheet:     { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32, paddingTop: 8 },
  menuItem:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  menuItemText:  { fontSize: 15, fontWeight: '600' },
  menuDivider:   { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },
  editSheet:     { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36 },
  editTitle:     { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  editInput:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  charCount:     { fontSize: 11, textAlign: 'right', marginTop: 4, marginBottom: 16 },
  editActions:   { flexDirection: 'row', gap: 12 },
  editBtn:       { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  searchOverlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0a0a0a', zIndex: 50 },
  searchTopBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  searchBackBtn:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 22, height: 42, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput:    { flex: 1, fontSize: 14, color: '#fff', paddingHorizontal: 10, paddingVertical: 0 },
  searchClearBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', marginRight: 7 },

  searchGrid:    { padding: 10, paddingBottom: 50 },
  searchGridRow: { gap: 8, marginBottom: 8 },
  searchCard:    { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#161616' },
  searchThumb:   { width: '100%', aspectRatio: 9 / 16 },
  searchThumbFallback: { width: '100%', aspectRatio: 9 / 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1c' },
  searchCardGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '75%' },
  searchPlayBadge: { position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  searchViewBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  searchBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  searchCardInfo:  { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 9, gap: 4 },
  searchCardAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchAvatar:    { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  searchAvatarFallback: { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  searchAvatarText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  searchCardAuthor: { color: '#fff', fontSize: 12, fontWeight: '700', flex: 1 },
  searchCardCaption: { color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 15 },
  searchCardStats:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  searchCardStat:   { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },
  searchCenterState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  searchEmptyIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  searchStateTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchStateText:  { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});