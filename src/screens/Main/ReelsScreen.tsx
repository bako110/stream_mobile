import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, Dimensions,
  TouchableOpacity, ActivityIndicator, StatusBar, Image,
  ViewToken, Share, Platform, Pressable, Alert, Modal, TextInput,
  KeyboardAvoidingView, Keyboard,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { reelService, socialService, authService } from '../../services';
import { userService } from '../../services/userService';
import { CommentsBottomSheet, SkeletonReels, VerifiedBadge } from '../../components/common';
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
  const [, setMyId]    = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [screenFocused,setScreenFocused]= useState(true);
  const [muted,        setMuted]        = useState(true);

  const toggleMute = useCallback(() => setMuted(v => !v), []);

  const handleReelEnd = useCallback((index: number) => {
    const nextIndex = index + 1;
    if (nextIndex < reels.length) {
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }
  }, [reels.length]);

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

  const viewabilityConfig      = useRef({ viewAreaCoveragePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      sendViewForCurrent();
      if (viewableItems.length > 0 && viewableItems[0].item) {
        currentReelRef.current = { id: viewableItems[0].item.id, startTime: Date.now() };
        setCurrentIndex(viewableItems[0].index ?? 0);
      } else {
        currentReelRef.current = null;
      }
    },
  ).current;

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
      for (let i = filtered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
      }
      setReels(filtered);
      setHasMore(data.has_more);

      if (params.initialReelId) {
        const idx = filtered.findIndex((r: Reel) => r.id === params.initialReelId);
        if (idx > 0) {
          setCurrentIndex(idx);
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: idx, animated: false });
          }, 150);
        }
      }
      setMyId(String(me.id));
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
      for (let i = newReels.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newReels[i], newReels[j]] = [newReels[j], newReels[i]];
      }
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
    <View style={{ width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <FlatList
        ref={listRef}
        data={reels}
        keyExtractor={r => r.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        disableIntervalMomentum
        getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
        windowSize={3}
        maxToRenderPerBatch={2}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={2}
        onEndReached={loadMore}
        onEndReachedThreshold={3}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <ReelItem
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
            onAdd={() => nav.navigate('CreateReel')}
            onAuthorPress={userId => nav.navigate('UserProfile', { userId })}
            onEnd={handleReelEnd}
          />
        )}
      />

      {/* Header flottant — par-dessus la FlatList */}
      <View style={[s.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => nav.canGoBack() ? nav.goBack() : nav.navigate('Feed' as any)} style={s.iconBtn}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.reelHeaderTitle}>Reels</Text>
        <TouchableOpacity
          onPress={() => setTab('mine')}
          style={[s.myReelsBtn, { backgroundColor: colors.primary + '30', borderColor: colors.primary + '60' }]}
        >
          <Icon name="user" size={14} color="#fff" />
          <Text style={s.myReelsBtnText}>Mes reels</Text>
        </TouchableOpacity>
      </View>

      {loadingMore && (
        <View style={s.loadMoreIndicator}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
    </View>
  );
};

// ── ReelItem — un écran complet avec sa propre vidéo (architecture TikTok) ────

interface ReelItemProps {
  reel:          Reel;
  isActive:      boolean;
  index:         number;
  muted:         boolean;
  screenW:       number;
  screenH:       number;
  insetTop:      number;
  insetBottom:   number;
  colors:        any;
  onToggleMute:  () => void;
  onAdd?:        () => void;
  onAuthorPress: (userId: string) => void;
  onEnd:         (index: number) => void;
}

const ReelItem: React.FC<ReelItemProps> = memo(({
  reel, isActive, index, muted, screenW, screenH, insetTop, insetBottom,
  colors, onToggleMute, onAdd, onAuthorPress, onEnd,
}) => {
  const [paused,       setPaused]       = useState(false);
  const [progress,     setProgress]     = useState(0);
  const [liked,        setLiked]        = useState(reel.user_reaction === 'like');
  const [likes,        setLikes]        = useState(reel.like_count);
  const [commentCount, setCommentCount] = useState(reel.comment_count);
  const [shareCount,   setShareCount]   = useState(reel.share_count);
  const [showComments, setShowComments] = useState(false);
  const [commentText,  setCommentText]  = useState('');
  const [sending,      setSending]      = useState(false);
  const [barFocused,   setBarFocused]   = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);

  const commentInputRef = useRef<TextInput>(null);
  const playIconTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Player propre à cet item
  const player = useVideoPlayer(reel.video_url ? { uri: reel.video_url } : { uri: 'about:blank' }, p => {
    p.loop         = false;
    p.muted        = muted;
    p.volume       = muted ? 0 : 1.0;
    p.mixAudioMode = 'mixWithOthers';
  });

  // Scroll au reel suivant quand la vidéo se termine
  useEffect(() => {
    const sub = player.addEventListener('onEnd', () => {
      if (isActive) onEnd(index);
    });
    return () => sub.remove();
  }, [isActive, index, onEnd]);

  // Play/pause selon visibilité
  useEffect(() => {
    if (isActive && !paused && reel.video_url) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, paused]);

  // Sync muted
  useEffect(() => {
    player.muted  = muted;
    player.volume = muted ? 0 : 1.0;
  }, [muted]);

  // Barre de progression
  useEffect(() => {
    if (!isActive || paused) { return; }
    const interval = setInterval(() => {
      const dur = player.duration;
      const cur = player.currentTime;
      if (dur && dur > 0) setProgress(Math.min(cur / dur, 1));
    }, 250);
    return () => clearInterval(interval);
  }, [isActive, paused]);

  // Reset progression quand on quitte cet item
  useEffect(() => {
    if (!isActive) {
      setProgress(0);
      setPaused(false);
    }
  }, [isActive]);

  // Stopper + vider la source à l'unmount
  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.replaceSourceAsync({ uri: 'about:blank' }).catch(() => {});
      } catch { /* ignore */ }
    };
  }, []);

  const handleTap = () => {
    setPaused(v => !v);
    setShowPlayIcon(true);
    if (playIconTimer.current) clearTimeout(playIconTimer.current);
    playIconTimer.current = setTimeout(() => setShowPlayIcon(false), 700);
  };

  const handleLike = async () => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes(v => wasLiked ? v - 1 : v + 1);
    try {
      await socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id });
    } catch {
      setLiked(wasLiked);
      setLikes(reel.like_count);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: reel.caption ? `${reel.caption}\n${reel.video_url ?? ''}` : (reel.video_url ?? '') });
      await socialService.share({ platform: Platform.OS, reel_id: reel.id });
      setShareCount(v => v + 1);
    } catch { /* cancelled */ }
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
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  const safeBottom = Math.max(insetBottom, Platform.OS === 'android' ? 56 : 0);
  // hauteur barre commentaire ≈ 60px + padding 8 haut + 8 bas
  const COMMENT_BAR_H = 76;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000' }}>

      {/* ── Vidéo plein écran ──────────────────────────────────────────────── */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        controls={false}
      />

      {/* ── Zone de tap ────────────────────────────────────────────────────── */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

      {/* ── Icône play/pause ───────────────────────────────────────────────── */}
      {showPlayIcon && (
        <Animated.View entering={FadeIn.duration(120)} style={s.playPauseOverlay} pointerEvents="none">
          <View style={s.playPauseCircle}>
            <Icon name={paused ? 'play' : 'pause'} size={36} color="#fff" />
          </View>
        </Animated.View>
      )}

      {/* ── Gradient bas ───────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.88)']}
        style={s.bottomGradient}
        pointerEvents="none"
      />

      {/* ── Infos bas-gauche ───────────────────────────────────────────────── */}
      <View
        style={[s.reelInfo, { bottom: safeBottom + COMMENT_BAR_H }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={s.authorRow}
          activeOpacity={0.8}
          onPress={() => reel.author?.id && onAuthorPress(reel.author.id)}
        >
          {reel.author?.avatar_url
            ? <Image source={{ uri: reel.author.avatar_url }} style={s.avatar} />
            : <View style={[s.avatar, { backgroundColor: colors.primary }]}>
                <Text style={s.avatarText}>{getAuthorInitial(reel.author)}</Text>
              </View>
          }
          <Text style={s.authorName}>{getAuthorLabel(reel.author)}</Text>
          {reel.author?.is_verified && <VerifiedBadge size={14} />}
        </TouchableOpacity>
        {reel.caption ? (
          <Text style={s.caption} numberOfLines={3}>{reel.caption}</Text>
        ) : null}
        {reel.ref_concert_id && (
          <View style={[s.tag, { backgroundColor: colors.accentOrange + '30' }]}>
            <Text style={[s.tagText, { color: colors.accentOrange }]}>Concert</Text>
          </View>
        )}
      </View>

      {/* ── Actions droite ─────────────────────────────────────────────────── */}
      <View style={[s.actions, { bottom: safeBottom + COMMENT_BAR_H }]}>
        <TouchableOpacity style={s.muteBtn} onPress={onToggleMute} activeOpacity={0.8}>
          <Icon name={muted ? 'volume-x' : 'volume-2'} size={22} color="#fff" />
        </TouchableOpacity>
        <ActionBtn icon="heart"          label={formatCount(likes)}           color={liked ? '#E0389A' : '#fff'} onPress={handleLike} />
        <ActionBtn icon="message-circle" label={formatCount(commentCount)}    color="#fff" onPress={() => setShowComments(true)} />
        <ActionBtn icon="share-2"        label={formatCount(shareCount)}      color="#fff" onPress={handleShare} />
        <ActionBtn icon="eye"            label={formatCount(reel.view_count)} color="#fff" />
        {onAdd && (
          <TouchableOpacity style={[s.addActionBtn, { backgroundColor: colors.primary }]} onPress={onAdd}>
            <Icon name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Barre de progression ───────────────────────────────────────────── */}
      <View style={[s.progressTrack, { bottom: safeBottom + COMMENT_BAR_H - 3 }]} pointerEvents="none">
        <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
      </View>

      {/* ── Barre de commentaire style TikTok ──────────────────────────────── */}
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
            ref={commentInputRef}
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

      {/* ── Bottom sheet commentaires ───────────────────────────────────────── */}
      <CommentsBottomSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        reelId={reel.id}
        onCommentAdded={() => setCommentCount(v => v + 1)}
      />
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

  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },

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

  playPauseOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
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
  authorName:  { color: '#fff', fontWeight: '700', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  caption:     { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 18 },
  tag:         { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText:     { fontSize: 11, fontWeight: '600' },

  actions:      { position: 'absolute', right: 12, alignItems: 'center', gap: 20, zIndex: 3 },
  actionBtn:    { alignItems: 'center', gap: 4 },
  actionLabel:  { fontSize: 12, fontWeight: '600', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  addActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  muteBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  progressTrack: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)', zIndex: 6 },
  progressFill:  { height: 3, backgroundColor: '#fff' },

  loadMoreIndicator: { position: 'absolute', bottom: 80, alignSelf: 'center', zIndex: 10 },

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
});
