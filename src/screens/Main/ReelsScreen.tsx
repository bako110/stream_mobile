import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, Dimensions, ScrollView,
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
import { CommentsBottomSheet, SkeletonReels, VerifiedBadge, ReportModal } from '../../components/common';
import { GiftPickerModal } from '../../components/wallet/GiftPickerModal';
import type { Reel, ReactionType } from '../../types';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const getAuthorLabel = (author?: Reel['author']): string => {
  if (!author) return 'Utilisateur';
  if (author.display_name) return author.display_name;
  if (author.first_name && author.last_name) return `${author.first_name} ${author.last_name}`;
  if (author.first_name) return author.first_name;
  if (author.username) return author.username;
  return 'Utilisateur';
};

const getAuthorInitial = (author?: Reel['author']): string =>
  getAuthorLabel(author)[0].toUpperCase();

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(n);
};

// ── ReelsScreen ───────────────────────────────────────────────────────────────

export const ReelsScreen: React.FC = () => {
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }) => setScreenDims(screen));
    return () => sub.remove();
  }, []);
  const SCREEN_W = screenDims.width;
  const SCREEN_H = screenDims.height;
  const insets   = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const nav    = useNavigation<Nav>();
  const route  = useRoute();
  const params = (route.params ?? {}) as { initialReelId?: string; reelPublished?: boolean };

  const listRef          = useRef<FlatList>(null);
  const isLoadingMoreRef = useRef(false);
  const translateY       = useSharedValue(0);
  const currentIdxRef    = useRef(0);
  const currentReelRef   = useRef<{ id: string; startTime: number } | null>(null);
  const viewedReelsRef   = useRef<Set<string>>(new Set());

  const [reels,        setReels]        = useState<Reel[]>([]);
  const [myReels,      setMyReels]      = useState<Reel[]>([]);
  const [menuReel,     setMenuReel]     = useState<Reel | null>(null);
  const [editReel,     setEditReel]     = useState<Reel | null>(null);
  const [editCaption,  setEditCaption]  = useState('');
  const [editSaving,   setEditSaving]   = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [hasMore,      setHasMore]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [tab,          setTab]          = useState<'feed' | 'mine'>('feed');
  const [myId, setMyId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [screenFocused,setScreenFocused]= useState(true);
  const [muted,        setMuted]        = useState(false);
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchResults,setSearchResults]= useState<Reel[]>([]);
  const [searching,    setSearching]    = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef     = useRef(true);

  const toggleMute = useCallback(() => setMuted(v => !v), []);

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

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await reelService.getFeed({ page: 1, limit: 20, search: q.trim() });
      if (mountedRef.current) setSearchResults(data.items.filter((r: Reel) => !!r.video_url));
    } catch { if (mountedRef.current) setSearchResults([]); }
    finally { if (mountedRef.current) setSearching(false); }
  }, []);

  const onSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(text), 350);
  }, [runSearch]);

  const pickSearchResult = useCallback((r: Reel) => {
    closeSearch();
    const idx = reels.findIndex(x => x.id === r.id);
    if (idx >= 0) {
      setCurrentIndex(idx);
      listRef.current?.scrollToIndex({ index: idx, animated: false });
    } else {
      setReels(prev => [r, ...prev.filter(x => x.id !== r.id)]);
      setCurrentIndex(0);
      listRef.current?.scrollToIndex({ index: 0, animated: false });
    }
  }, [reels, closeSearch]);

  const handleReelEnd = useCallback((_index: number) => {
    // scroll auto désactivé — l'utilisateur scrolle manuellement
  }, []);

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

  // Ref stable pour accéder aux reels depuis les worklets gesture (pas de closure)
  const reelsRef = useRef<Reel[]>([]);
  useEffect(() => { reelsRef.current = reels; }, [reels]);

  // Tracking vue + prefetch quand currentIndex change
  useEffect(() => {
    const list = reelsRef.current;
    const cur  = list[currentIndex];
    if (!cur) return;
    sendViewForCurrent();
    currentReelRef.current = { id: cur.id, startTime: Date.now() };
    // Prefetch thumbnails des 2 reels suivants
    list.slice(currentIndex + 1, currentIndex + 3).forEach(r => {
      if (r.thumbnail_url) Image.prefetch(r.thumbnail_url).catch(() => {});
    });
  }, [currentIndex]);

  // ── Chargement initial ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setPage(1);
    setHasMore(true);
    isLoadingMoreRef.current = false;
    try {
      const [data, me] = await Promise.all([
        reelService.getFeed({ page: 1 }),
        authService.getMe(),
      ]);
      const filtered = data.items.filter((r: Reel) => !!r.video_url);
      setReels(filtered);
      setHasMore(data.has_more);
      setMyId(String(me.id));

      if (params.initialReelId) {
        const idx = filtered.findIndex((r: Reel) => r.id === params.initialReelId);
        if (idx > 0) {
          setCurrentIndex(idx);
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: idx, animated: false });
          }, 150);
        }
      }

      userService.getUserReels(String(me.id))
        .then(mine => setMyReels(Array.isArray(mine) ? mine : []))
        .catch(() => {});
    } catch {
      setReels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Pagination infinie ────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMore || loadingMore) return;
    isLoadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data     = await reelService.getFeed({ page: nextPage });
      const newReels = data.items.filter((r: Reel) => !!r.video_url);
      if (newReels.length > 0) {
        setReels(prev => {
          const ids = new Set(prev.map(r => r.id));
          return [...prev, ...newReels.filter((r: Reel) => !ids.has(r.id))];
        });
        setPage(nextPage);
        setHasMore(data.has_more);
      } else {
        setHasMore(false);
      }
    } catch { /* silently ignore */ }
    finally {
      setLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  }, [page, hasMore, loadingMore]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    // Rechargement complet si on revient depuis une publication
    if (params.reelPublished) {
      nav.setParams({ reelPublished: undefined } as any);
      load();
    }
    return () => { setScreenFocused(false); };
  }, [params.reelPublished]));

  // ── Modals edit/delete ────────────────────────────────────────────────────
  const handleDeleteReel = (reel: Reel) => {
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
  };

  const handleOpenEdit = (reel: Reel) => {
    setMenuReel(null);
    setEditCaption(reel.caption ?? '');
    setEditReel(reel);
  };

  const handleSaveEdit = async () => {
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
  };

  // ── Gesture scroll TikTok — doit être avant tout return conditionnel ────────
  const feedPan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-15, 15])
    .runOnJS(true)
    .onUpdate(e => {
      const base    = -currentIdxRef.current * SCREEN_H;
      const raw     = base + e.translationY;
      const min     = -(reelsRef.current.length - 1) * SCREEN_H;
      const clamped = Math.max(min - 80, Math.min(80, raw));
      translateY.value = clamped;
    })
    .onEnd(e => {
      const SNAP_DIST = 50;
      const SNAP_VEL  = 400;
      const cur = currentIdxRef.current;
      let next  = cur;
      if (e.translationY < -SNAP_DIST || e.velocityY < -SNAP_VEL) {
        next = Math.min(cur + 1, reelsRef.current.length - 1);
      } else if (e.translationY > SNAP_DIST || e.velocityY > SNAP_VEL) {
        next = Math.max(cur - 1, 0);
      }
      translateY.value = withSpring(-next * SCREEN_H, {
        damping: 38, stiffness: 280, mass: 0.6, overshootClamping: true,
      });
      currentIdxRef.current = next;
      setCurrentIndex(next);
      if (next >= reelsRef.current.length - 3) loadMore();
    });

  const feedAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // ── Loaders / états vides ─────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <SkeletonReels />
      </>
    );
  }

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

  // ── Vue "Mes reels" ───────────────────────────────────────────────────────
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
                  : <View style={[s.mineThumbFallback, { backgroundColor: colors.backgroundSecondary }]}><Icon name="film" size={28} color={colors.textDisabled} /></View>
                }
                <View style={s.mineOverlay}>
                  <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                    <View style={s.mineStat}><Icon name="play" size={10} color="#fff" /><Text style={s.mineStatText}>{formatCount(item.view_count)}</Text></View>
                    <View style={s.mineStat}><Icon name="heart" size={10} color="#fff" /><Text style={s.mineStatText}>{formatCount(item.like_count)}</Text></View>
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

  // ── Feed TikTok — chaque item a sa propre vidéo ───────────────────────────
  return (
    <View style={{ width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000', overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <GestureDetector gesture={feedPan}>
        <Animated.View style={[{ width: SCREEN_W, height: SCREEN_H * reels.length }, feedAnimStyle]}>
          {reels.map((item, index) => (
            <ReelItem
              key={item.id}
              reel={item}
              isActive={index === currentIndex && screenFocused}
              index={index}
              muted={muted}
              onToggleMute={toggleMute}
              screenW={SCREEN_W}
              screenH={SCREEN_H}
              insetTop={insets.top}
              insetBottom={insets.bottom}
              colors={colors}
              currentUserId={myId ?? undefined}
              onAdd={() => nav.navigate('CreateReel')}
              onAuthorPress={userId => nav.navigate('UserProfile', { userId })}
              onAuthorReels={(_userId, _reelId) => {}}
              onEnd={handleReelEnd}
            />
          ))}
        </Animated.View>
      </GestureDetector>

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

          {/* Barre de recherche */}
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

          {/* Contenu */}
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
                  {/* Thumbnail */}
                  {item.thumbnail_url
                    ? <Image source={{ uri: item.thumbnail_url }} style={s.searchThumb} resizeMode="cover" />
                    : <View style={s.searchThumbFallback}>
                        <Icon name="film" size={32} color="rgba(255,255,255,0.15)" />
                      </View>
                  }

                  {/* Gradient */}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.92)']}
                    locations={[0.3, 0.6, 1]}
                    style={s.searchCardGrad}
                  />

                  {/* Icône play */}
                  <View style={s.searchPlayBadge}>
                    <Icon name="play" size={10} color="#fff" />
                  </View>

                  {/* Vues en haut à droite */}
                  <View style={s.searchViewBadge}>
                    <Icon name="eye" size={10} color="#fff" />
                    <Text style={s.searchBadgeText}>{formatCount(item.view_count)}</Text>
                  </View>

                  {/* Infos bas */}
                  <View style={s.searchCardInfo}>
                    {/* Avatar + nom */}
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
                    {/* Likes */}
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
              <View style={s.searchEmptyIcon}>
                <Icon name="search" size={28} color="rgba(255,255,255,0.4)" />
              </View>
              <Text style={s.searchStateTitle}>Aucun résultat</Text>
              <Text style={s.searchStateText}>Essaie un autre mot-clé ou nom d'auteur</Text>
            </View>
          ) : (
            <View style={s.searchCenterState}>
              <View style={s.searchEmptyIcon}>
                <Icon name="trending-up" size={28} color="rgba(255,255,255,0.4)" />
              </View>
              <Text style={s.searchStateTitle}>Découvre des reels</Text>
              <Text style={s.searchStateText}>Tape le nom d'un auteur ou un mot-clé</Text>
            </View>
          )}
        </View>
      )}

      {/* Préchargeur — next 2 reels uniquement */}
      {reels[currentIndex + 1]?.video_url && (
        <VideoPreloader uri={reels[currentIndex + 1].video_url!} />
      )}

      {loadingMore && (
        <View style={s.loadMoreIndicator}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
    </View>
  );
};

// ── VideoSlide — une slide dans le carousel horizontal de l'auteur ────────────

interface VideoSlideProps {
  reel:        Reel;
  isActive:    boolean;
  muted:       boolean;
  screenW:     number;
  screenH:     number;
  insetBottom: number;
  colors:      any;
  currentUserId?: string;
  onToggleMute:   () => void;
  onAdd?:         () => void;
  onAuthorPress:  (userId: string) => void;
  onEnd:          () => void;
}

const VideoSlide: React.FC<VideoSlideProps> = memo(({
  reel, isActive, muted, screenW, screenH, insetBottom,
  colors, currentUserId, onToggleMute, onAdd, onAuthorPress, onEnd,
}) => {
  const [paused,        setPaused]        = useState(false);
  const [buffering,     setBuffering]     = useState(false);
  const [liked,         setLiked]         = useState(reel.user_reaction === 'like');
  const [likes,         setLikes]         = useState(reel.like_count);
  const likeInFlight = useRef(false);
  const [commentCount,  setCommentCount]  = useState(reel.comment_count);
  const [shareCount,    setShareCount]    = useState(reel.share_count);
  const [showComments,  setShowComments]  = useState(false);
  const [commentText,   setCommentText]   = useState('');
  const [sending,       setSending]       = useState(false);
  const [barFocused,    setBarFocused]    = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [refInfo,       setRefInfo]       = useState<{ label: string; kind: string; thumbnail: string | null; color: string } | null>(null);
  // portrait = 9:16 (cover), landscape = 16:9 (contain avec letterbox)
  const [isPortrait,    setIsPortrait]    = useState(true);

  // Charger les infos du contenu référencé (film/concert/event) si présent
  useEffect(() => {
    if (!isActive) return;
    const fetchRef = async () => {
      try {
        if (reel.ref_concert_id) {
          const res = await apiClient.get<any>(`/api/v1/concerts/${reel.ref_concert_id}`);
          const d = res.data;
          setRefInfo({ label: d.title ?? d.name ?? 'Concert', kind: 'Concert', thumbnail: d.thumbnail_url ?? d.poster_url ?? null, color: '#7B3FF2' });
        } else if (reel.ref_event_id) {
          const res = await apiClient.get<any>(`/api/v1/events/${reel.ref_event_id}`);
          const d = res.data;
          setRefInfo({ label: d.title ?? d.name ?? 'Événement', kind: 'Événement', thumbnail: d.thumbnail_url ?? d.cover_url ?? null, color: '#E0389A' });
        } else if (reel.ref_content_id) {
          const res = await apiClient.get<any>(`/api/v1/content/films/${reel.ref_content_id}`);
          const d = res.data;
          setRefInfo({ label: d.title ?? 'Film', kind: d.type === 'serie' ? 'Série' : 'Film', thumbnail: d.thumbnail_url ?? null, color: '#3B82F6' });
        }
      } catch { /* silencieux */ }
    };
    if (reel.ref_concert_id || reel.ref_event_id || reel.ref_content_id) fetchRef();
  }, [isActive, reel.ref_concert_id, reel.ref_event_id, reel.ref_content_id]);

  const isOwnReel = currentUserId && reel.author?.id && currentUserId === String(reel.author.id);

  const player = useVideoPlayer(
    reel.video_url ? reel.video_url : 'about:blank',
    p => {
      p.loop         = true;
      p.muted        = muted;
      p.volume       = muted ? 0 : 1.0;
      if (isActive && reel.video_url) p.play();
    },
  );

  // Reanimated shared values — animations 100% sur le thread UI, zéro setState
  const playIconOpacity = useSharedValue(0);
  const playIconScale   = useSharedValue(0.6);
  const heartOpacity    = useSharedValue(0);
  const heartScale      = useSharedValue(0);
  const heartX          = useSharedValue(0);
  const heartY          = useSharedValue(0);

  const playIconAnim = useAnimatedStyle(() => ({
    position:       'absolute',
    top:            0, left: 0, right: 0, bottom: 0,
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         5,
    opacity:        playIconOpacity.value,
    transform:      [{ scale: playIconScale.value }],
  }));
  const heartAnim = useAnimatedStyle(() => ({
    position:  'absolute',
    opacity:   heartOpacity.value,
    transform: [{ scale: heartScale.value }],
    left:      heartX.value - 44,
    top:       heartY.value - 44,
    zIndex:    10,
  }));

  // Refs pour l'état pausé et liked accessibles dans les worklets RNGH
  const pausedRef = useRef(false);
  const likedRef  = useRef(reel.user_reaction === 'like');

  useEffect(() => {
    const subEnd    = player.addEventListener('onEnd',    () => { if (isActive) onEnd(); });
    const subBuffer = player.addEventListener('onBuffer', (buffering: boolean) => setBuffering(buffering));
    const subLoad   = player.addEventListener('onLoad',   (data: any) => {
      if (data?.width && data?.height) setIsPortrait(data.height >= data.width);
    });
    return () => { subEnd.remove(); subBuffer.remove(); subLoad.remove(); };
  }, [isActive, onEnd]);

  useEffect(() => {
    if (isActive && !pausedRef.current && reel.video_url) player.play();
    else player.pause();
  }, [isActive, paused]);

  useEffect(() => {
    player.muted  = muted;
    player.volume = muted ? 0 : 1.0;
  }, [muted]);

  useEffect(() => {
    if (!isActive) {
      pausedRef.current = false;
      setPaused(false);
    }
  }, [isActive]);

  useEffect(() => () => {
    try { player.pause(); player.replaceSourceAsync({ uri: 'about:blank' }).catch(() => {}); }
    catch {}
  }, []);

  // Sync likedRef avec l'état React
  useEffect(() => { likedRef.current = liked; }, [liked]);

  // Prefetch thumbnail de la story suivante dès que ce reel devient actif
  useEffect(() => {
    if (isActive && reel.thumbnail_url) {
      Image.prefetch(reel.thumbnail_url).catch(() => {});
    }
  }, [isActive]);

  const showPlayIconAnim = useCallback(() => {
    playIconOpacity.value = 1;
    playIconScale.value   = withSpring(1, { damping: 10, stiffness: 200 });
    playIconOpacity.value = withSequence(
      withTiming(1, { duration: 0 }),
      withTiming(1, { duration: 300 }),
      withTiming(0, { duration: 150 }),
    );
  }, []);

  const doLike = useCallback((x: number, y: number) => {
    // Déclenche le like seulement si pas déjà liké et pas de requête en cours
    if (!likedRef.current && !likeInFlight.current) {
      likedRef.current = true;
      likeInFlight.current = true;
      setLiked(true);
      setLikes(v => v + 1);
      socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id })
        .catch(() => {})
        .finally(() => { likeInFlight.current = false; });
    }
    // Animation coeur sur le thread UI
    heartX.value     = x;
    heartY.value     = y;
    heartScale.value = 0;
    heartOpacity.value = withTiming(1, { duration: 30 });
    heartScale.value   = withSpring(1.2, { damping: 8, stiffness: 250 });
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 30 }),
      withTiming(1, { duration: 350 }),
      withTiming(0, { duration: 200 }),
    );
  }, [reel.id]);

  const doPause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    showPlayIconAnim();
  }, [showPlayIconAnim]);

  // Gestes natifs RNGH — single tap = pause, double tap = like
  // requireExternalGestureToFail non utilisé → le FlatList vertical reste prioritaire
  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .runOnJS(true)
    .onEnd(doPause);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .runOnJS(true)
    .onEnd(e => doLike(e.x, e.y));

  // Pan qui échoue dès que le mouvement vertical dépasse 10px
  // → cède le contrôle à la FlatList verticale pour scroller entre reels
  // → si horizontal → FlatList horizontale pour les slides du même auteur
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .minDistance(10);

  const tapGesture = Gesture.Simultaneous(
    pan,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const handleLike = async () => {
    if (likeInFlight.current) return;
    likeInFlight.current = true;
    const wasLiked = liked;
    likedRef.current = !wasLiked;
    setLiked(!wasLiked);
    setLikes(v => wasLiked ? v - 1 : v + 1);
    try {
      await socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id });
    } catch {
      likedRef.current = wasLiked;
      setLiked(wasLiked);
      setLikes(reel.like_count);
    } finally {
      likeInFlight.current = false;
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: reel.caption ? `${reel.caption}\n${reel.video_url ?? ''}` : (reel.video_url ?? '') });
      await socialService.share({ platform: Platform.OS, reel_id: reel.id });
      setShareCount(v => v + 1);
    } catch {}
  };

  const handleFocusBar = (focused: boolean) => {
    setBarFocused(focused);
    if (focused) setPaused(true);
  };

  const handleSendComment = async () => {
    const body = commentText.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await socialService.createComment({ body, reel_id: reel.id });
      setCommentText('');
      setCommentCount(v => v + 1);
      Keyboard.dismiss();
    } catch {}
    finally { setSending(false); }
  };

  const safeBottom   = Math.max(insetBottom, Platform.OS === 'android' ? 56 : 0);
  const COMMENT_BAR_H = 76;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000', overflow: 'hidden' }}>

      {/* Zone gesture — couvre toute la vidéo SAUF les boutons à droite */}
      <GestureDetector gesture={tapGesture}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 80, bottom: safeBottom + COMMENT_BAR_H }}>
          {reel.thumbnail_url && (
            <Image
              source={{ uri: reel.thumbnail_url }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH }}
              resizeMode={isPortrait ? 'cover' : 'contain'}
            />
          )}
        </View>
      </GestureDetector>

      {/* Vidéo en dessous, plein écran */}
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH }}
        resizeMode={isPortrait ? 'cover' : 'contain'}
        controls={false}
        surfaceType="texture"
      />

      {reel.thumbnail_url && (
        <Image
          source={{ uri: reel.thumbnail_url }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH, zIndex: -1 }}
          resizeMode={isPortrait ? 'cover' : 'contain'}
        />
      )}

      {buffering && (
        <View style={[s.bufferOverlay, { backgroundColor: 'transparent' }]} pointerEvents="none">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {/* Play/pause — thread UI, aucun setState */}
      <Animated.View style={playIconAnim} pointerEvents="none">
        <View style={s.playPauseCircle}>
          <Icon name={paused ? 'play' : 'pause'} size={36} color="#fff" />
        </View>
      </Animated.View>

      {/* Coeur double-tap — Reanimated pur */}
      <Animated.View pointerEvents="none" style={heartAnim}>
        <Icon name="heart" size={88} color="#E0389A" />
      </Animated.View>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.5, 1]}
        style={s.bottomGradient}
        pointerEvents="none"
      />

      {/* Wrapper externe pour fermer les tags — le reste du contenu est hors GestureDetector */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
        <View style={[s.reelInfo, { bottom: safeBottom + COMMENT_BAR_H }]} pointerEvents="box-none">

          {/* Bandeau contenu référencé — style TikTok son */}
          {refInfo && (
            <View style={s.refBand}>
              <View style={[s.refKindDot, { backgroundColor: refInfo.color }]} />
              {refInfo.thumbnail ? (
                <Image source={{ uri: refInfo.thumbnail }} style={s.refThumb} />
              ) : (
                <View style={[s.refThumb, { backgroundColor: refInfo.color + '40', alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name={refInfo.kind === 'Concert' ? 'music' : refInfo.kind === 'Événement' ? 'calendar' : 'film'} size={12} color="#fff" />
                </View>
              )}
              <View style={{ flex: 1, overflow: 'hidden' }}>
                <Text style={s.refKind}>{refInfo.kind}</Text>
                <Text style={s.refLabel} numberOfLines={1}>{refInfo.label}</Text>
              </View>
              <Icon name="chevron-right" size={14} color="rgba(255,255,255,0.5)" />
            </View>
          )}

          {/* Auteur */}
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

          {/* Caption */}
          {reel.caption ? <Text style={s.caption} numberOfLines={3}>{reel.caption}</Text> : null}
        </View>

        <View style={[s.actions, { bottom: safeBottom + COMMENT_BAR_H }]}>
          <TouchableOpacity style={s.muteBtn} onPress={onToggleMute} activeOpacity={0.8}>
            <Icon name={muted ? 'volume-x' : 'volume-2'} size={22} color="#fff" />
          </TouchableOpacity>
          <ActionBtn icon="heart"          label={formatCount(likes)}           color={liked ? '#E0389A' : '#fff'} onPress={handleLike} />
          <ActionBtn icon="message-circle" label={formatCount(commentCount)}    color="#fff" onPress={() => setShowComments(true)} />
          <ActionBtn icon="share-2"        label={formatCount(shareCount)}      color="#fff" onPress={handleShare} />
          <ActionBtn icon="eye"            label={formatCount(reel.view_count)} color="#fff" />
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

// ── Préchargeur vidéo silencieux ──────────────────────────────────────────────

const REEL_BUFFER = {
  minBufferMs:                      500,
  maxBufferMs:                      10000,
  bufferForPlaybackMs:              200,
  bufferForPlaybackAfterRebufferMs: 400,
};

const VideoPreloader: React.FC<{ uri: string }> = ({ uri }) => {
  const player = useVideoPlayer(
    { uri, bufferConfig: REEL_BUFFER },
    p => { p.muted = true; p.volume = 0; },
  );
  useEffect(() => {
    player.preload().catch(() => {});
    return () => { try { player.pause(); } catch {} };
  }, [uri]);
  return null;
};

// ── ReelItem — row verticale = carousel horizontal des reels d'un auteur ──────

interface ReelItemProps {
  reel:           Reel;
  isActive:       boolean;
  index:          number;
  muted:          boolean;
  screenW:        number;
  screenH:        number;
  insetTop:       number;
  insetBottom:    number;
  colors:         any;
  currentUserId?: string;
  onToggleMute:   () => void;
  onAdd?:         () => void;
  onAuthorPress:  (userId: string) => void;
  onAuthorReels?: (userId: string, reelId: string) => void;
  onEnd:          (index: number) => void;
}

const ReelItem: React.FC<ReelItemProps> = memo(({
  reel, isActive, index, muted, screenW, screenH, insetBottom,
  colors, currentUserId, onToggleMute, onAdd, onAuthorPress, onEnd,
}) => {
  const [authorReels, setAuthorReels] = useState<Reel[]>([reel]);
  const [hIdx,     setHIdx]  = useState(0);
  const loadedRef  = useRef(false);

  // Charger les reels de l'auteur avec délai pour ne pas bloquer le scroll
  useEffect(() => {
    if (!isActive || loadedRef.current || !reel.author?.id) return;
    const timer = setTimeout(() => {
      loadedRef.current = true;
      userService.getUserReels(reel.author!.id)
        .then(data => {
          const list     = (Array.isArray(data) ? data : []) as Reel[];
          const filtered = list.filter(r => !!r.video_url);
          if (filtered.length <= 1) return;
          const idx = filtered.findIndex(r => r.id === reel.id);
          if (idx > 0) { const [cur] = filtered.splice(idx, 1); filtered.unshift(cur); }
          setAuthorReels(filtered);
        })
        .catch(() => {});
    }, 600); // délai 600ms — laisse le scroll se stabiliser d'abord
    return () => clearTimeout(timer);
  }, [isActive]);

  const translateX    = useSharedValue(0);
  const startX        = useSharedValue(0);
  const authorReelsRef = useRef<Reel[]>([reel]);
  useEffect(() => { authorReelsRef.current = authorReels; }, [authorReels]);

  // Reset translateX quand authorReels change (nouveaux reels chargés)
  useEffect(() => {
    translateX.value = 0;
    setHIdx(0);
  }, [authorReels.length]);

  // Reset au premier slide quand item devient inactif
  useEffect(() => {
    if (!isActive) {
      translateX.value = withSpring(0, { damping: 38, stiffness: 280, mass: 0.6, overshootClamping: true });
      setHIdx(0);
    }
  }, [isActive]);

  const hPan = Gesture.Pan()
    .activeOffsetX([-8, 8])   // s'active dès 8px — même réactivité que le vertical
    .failOffsetY([-12, 12])
    .runOnJS(true)
    .onStart(() => { startX.value = translateX.value; })
    .onUpdate(e => {
      const next = startX.value + e.translationX;
      const min  = -(authorReelsRef.current.length - 1) * screenW;
      // résistance légère en bout de liste
      const clamped = Math.max(min - 60, Math.min(60, next));
      translateX.value = clamped;
    })
    .onEnd(e => {
      const SNAP_DIST = 50;
      const SNAP_VEL  = 400;
      const cur    = Math.round(-startX.value / screenW);
      const total  = authorReelsRef.current.length;
      let target   = cur;
      if (e.translationX < -SNAP_DIST || e.velocityX < -SNAP_VEL) {
        target = Math.min(cur + 1, total - 1);
      } else if (e.translationX > SNAP_DIST || e.velocityX > SNAP_VEL) {
        target = Math.max(cur - 1, 0);
      }
      translateX.value = withSpring(-target * screenW, {
        damping: 38, stiffness: 280, mass: 0.6, overshootClamping: true,
      });
      setHIdx(target);
    });

  return (
    <View style={{ width: screenW, height: screenH, overflow: 'hidden' }}>
      <GestureDetector gesture={hPan}>
        <Animated.View
          style={{
            width: screenW * authorReels.length,
            height: screenH,
            flexDirection: 'row',
            transform: [{ translateX }],
          }}
        >
          {authorReels.map((r, i) => (
            <VideoSlide
              key={r.id}
              reel={r}
              isActive={isActive && i === hIdx}
              muted={muted}
              screenW={screenW}
              screenH={screenH}
              insetBottom={insetBottom}
              colors={colors}
              currentUserId={currentUserId}
              onToggleMute={onToggleMute}
              onAdd={i === 0 ? onAdd : undefined}
              onAuthorPress={onAuthorPress}
              onEnd={() => onEnd(index)}
            />
          ))}
        </Animated.View>
      </GestureDetector>

      {/* Indicateur de position horizontal */}
      {authorReels.length > 1 && (
        <View style={s.hDots} pointerEvents="none">
          {authorReels.map((_, i) => (
            <View key={i} style={[s.hDot, i === hIdx && s.hDotActive]} />
          ))}
        </View>
      )}
    </View>
  );
});

// ── ActionBtn ─────────────────────────────────────────────────────────────────

const ActionBtn: React.FC<{ icon: string; label: string; color: string; onPress?: () => void }> = ({ icon, label, color, onPress }) => (
  <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.7}>
    <Icon name={icon} size={26} color={color} />
    <Text style={[s.actionLabel, { color }]}>{label}</Text>
  </TouchableOpacity>
);

// ── Styles ────────────────────────────────────────────────────────────────────

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
  reelHeaderTitle:  { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
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
  tag:         { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText:     { fontSize: 11, fontWeight: '600' },

  // Stats row
  statsRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statChipText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // Bandeau contenu référencé
  refBand: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'flex-start', maxWidth: '100%',
  },
  refKindDot:   { width: 7, height: 7, borderRadius: 4 },
  refThumb:     { width: 32, height: 32, borderRadius: 8, overflow: 'hidden' },
  refKind:      { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  refLabel:     { color: '#fff', fontSize: 12, fontWeight: '700' },

  actions:      { position: 'absolute', right: 12, alignItems: 'center', gap: 20, zIndex: 3 },
  actionBtn:    { alignItems: 'center', gap: 4 },
  actionLabel:  { fontSize: 12, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  addActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  muteBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  loadMoreIndicator: { position: 'absolute', bottom: 80, alignSelf: 'center', zIndex: 10 },
  bufferOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 6,
  },

  // ── Barre commentaire TikTok ──────────────────────────────────────────────
  commentBarWrap: {
    position:        'absolute',
    left:            0,
    right:           0,
    zIndex:          5,
    paddingHorizontal: 12,
    paddingVertical:   8,
  },
  commentBar: {
    flexDirection:    'row',
    alignItems:       'center',
    borderRadius:     26,
    borderWidth:      1,
    paddingHorizontal: 14,
    paddingVertical:   9,
    gap:              10,
  },
  commentBarInput: {
    flex:      1,
    fontSize:  13,
    color:     '#fff',
    padding:   0,
    maxHeight: 60,
  },
  commentBarSend: {
    width:          34,
    height:         34,
    borderRadius:   17,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },


  // ── Indicateur horizontal ─────────────────────────────────────────────────
  hDots: {
    position: 'absolute', top: 12, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
    zIndex: 20,
  },
  hDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  hDotActive: {
    width: 16, backgroundColor: '#fff',
  },

  // ── Mes reels ─────────────────────────────────────────────────────────────
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

  // ── Modals ────────────────────────────────────────────────────────────────
  modalBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  menuSheet:      { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32, paddingTop: 8 },
  menuItem:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  menuItemText:   { fontSize: 15, fontWeight: '600' },
  menuDivider:    { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },
  editSheet:      { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36 },
  editTitle:      { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  editInput:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  charCount:      { fontSize: 11, textAlign: 'right', marginTop: 4, marginBottom: 16 },
  editActions:    { flexDirection: 'row', gap: 12 },
  editBtn:        { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // ── Recherche ─────────────────────────────────────────────────────────────
  searchOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0a0a0a', zIndex: 50,
  },
  searchTopBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchBackBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22, height: 42,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: {
    flex: 1, fontSize: 14, color: '#fff',
    paddingHorizontal: 10, paddingVertical: 0,
  },
  searchClearBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginRight: 7,
  },

  searchGrid: { padding: 10, paddingBottom: 50 },
  searchGridRow: { gap: 8, marginBottom: 8 },

  searchCard: {
    flex: 1, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#161616',
  },
  searchThumb: {
    width: '100%', aspectRatio: 9 / 16,
  },
  searchThumbFallback: {
    width: '100%', aspectRatio: 9 / 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1c1c1c',
  },
  searchCardGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '75%',
  },
  searchPlayBadge: {
    position: 'absolute', top: 8, left: 8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  searchViewBadge: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8,
  },
  searchBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },

  searchCardInfo: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 9, gap: 4,
  },
  searchCardAuthorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  searchAvatar: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
  },
  searchAvatarFallback: {
    backgroundColor: '#333', alignItems: 'center', justifyContent: 'center',
  },
  searchAvatarText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  searchCardAuthor:  { color: '#fff', fontSize: 12, fontWeight: '700', flex: 1 },
  searchCardCaption: {
    color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 15,
  },
  searchCardStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  searchCardStat:  { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },

  searchCenterState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60,
  },
  searchEmptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  searchStateTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchStateText:  { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});
