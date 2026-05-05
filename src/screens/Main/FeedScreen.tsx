/**
 * FeedScreen — fil social : événements + concerts
 * Features: like animé, commentaires, partage natif, sauvegarde locale
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  RefreshControl, TextInput, ActivityIndicator, StyleSheet,
  Share, Alert, KeyboardAvoidingView, Platform, Image, StatusBar,
  Modal, Dimensions,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Animated, {
  FadeInDown, FadeInUp,
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence, withTiming,
  interpolate, runOnJS,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonBox, SkeletonFeed, SkeletonFeedScreen, PeopleSuggestions, AvatarWithBadge, ReportModal, CommentsBottomSheet, CreatePostBox, PostCard } from '../../components/common';
import type { UserPublic } from '../../types/user';
import { StoryBar } from '../../components/story';
import { eventService, concertService, socialService, saveService, authService, searchService, userService, reelService, feedPreferenceService, postService } from '../../services';
import { communityService } from '../../services/communityService';
import type { CommunityData } from '../../services/communityService';
import { useWs } from '../../context/WebSocketContext';
import { useUser } from '../../context/UserContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import type { User } from '../../types/user';
import type { SearchResults } from '../../types/search';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Post } from '../../types/post';
import type { AppColors } from '../../theme/colors';
import { feedStyles as s } from '../../styles/FeedScreen.styles';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ── Types locaux ──────────────────────────────────────────────────────────────

type FeedFilter = 'all' | 'events' | 'concerts';

interface FeedItem {
  kind:    'event' | 'concert' | 'reel' | 'post' | 'suggestions';
  id:      string;
  data:    any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  concert: '#7B3FF2', birthday: '#E0389A', festival: '#FF7A2F',
  conference: '#36D9A0', sport: '#3B82F6', theater: '#9B65F5',
  exhibition: '#36D9A0', other: '#9390AB',
};
const EVENT_ICONS: Record<string, string> = {
  concert: 'music', birthday: 'gift', festival: 'star',
  conference: 'mic', sport: 'activity', theater: 'film',
  exhibition: 'image', other: 'calendar',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// ── Styles badges (déclarés ici pour être disponibles avant FeedHeaderBadges) ─
const badgeS = StyleSheet.create({
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FF3B30',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});

// ── Badges isolés — ne re-rendent que le FeedScreen quand les unread changent ─

const FeedHeaderBadges: React.FC<{ onMessages: () => void; onNotifs: () => void; onMenu: () => void; colors: AppColors }> = React.memo(
  ({ onMessages, onNotifs, onMenu, colors }) => {
    const { unreadMessages, unreadActivity, unreadNotifications } = useWs();
    const totalNotifs = unreadNotifications + unreadActivity;
    return (
      <>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={onMessages}>
          <Icon name="send" size={20} color={colors.textPrimary} />
          {unreadMessages > 0 && (
            <View style={badgeS.badge}>
              <Text style={badgeS.badgeText}>{unreadMessages > 99 ? '99+' : unreadMessages}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={onNotifs}>
          <Icon name="bell" size={20} color={colors.textPrimary} />
          {totalNotifs > 0 && (
            <View style={badgeS.badge}>
              <Text style={badgeS.badgeText}>{totalNotifs > 99 ? '99+' : totalNotifs}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={onMenu}>
          <Icon name="menu" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </>
    );
  },
);

// ── FeedScreen ────────────────────────────────────────────────────────────────

export const FeedScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { addListener, removeListener } = useWs();
  const { currentUser } = useUser();

  const [filter,     setFilter]     = useState<FeedFilter>('all');
  const [items,      setItems]      = useState<FeedItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [liveConcerts,    setLiveConcerts]    = useState<Concert[]>([]);
  const [trendingComm,    setTrendingComm]    = useState<CommunityData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBarWidth = useSharedValue(0);
  const searchBarOpacity = useSharedValue(0);
  const searchInputRef = useRef<any>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reel actif dans le feed (autoplay)
  const [activeReelId,      setActiveReelId]      = useState<string | null>(null);
  const [activeCardId,      setActiveCardId]       = useState<string | null>(null);
  const [feedFocused,       setFeedFocused]        = useState(true);
  const [feedScrollEnabled, setFeedScrollEnabled]  = useState(true);

  const feedViewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onFeedViewableChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    const reelItem = viewableItems.find(v => v.item?.kind === 'reel');
    setActiveReelId(reelItem ? reelItem.item.id : null);
    // Activer la vidéo pub de la première carte event/concert visible avec video_url
    const cardItem = viewableItems.find(v =>
      (v.item?.kind === 'event' || v.item?.kind === 'concert') && v.item?.data?.video_url,
    );
    setActiveCardId(cardItem ? cardItem.item.id : null);
  }).current;

  // Sheet commentaires
  const [commentItem,    setCommentItem]    = useState<FeedItem | null>(null);
  const [commentVisible, setCommentVisible] = useState(false);
  const commentCountChangeRef = useRef<((delta: number) => void) | null>(null);

  // Recherche auto avec debounce 300ms
  const liveSearch = useCallback((query: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) { setSearchResults(null); setSearching(false); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchService.searchAll({ q: query.trim() });
        setSearchResults(results);
      } catch { /* silencieux */ }
      finally { setSearching(false); }
    }, 300);
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    searchBarWidth.value  = withSpring(1, { damping: 18, stiffness: 200 });
    searchBarOpacity.value = withTiming(1, { duration: 200 });
    setTimeout(() => searchInputRef.current?.focus(), 250);
  }, []);

  const closeSearch = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchBarWidth.value   = withSpring(0, { damping: 18, stiffness: 200 });
    searchBarOpacity.value = withTiming(0, { duration: 150 });
    setTimeout(() => setSearchOpen(false), 180);
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  const animatedSearchBar = useAnimatedStyle(() => ({
    flex: interpolate(searchBarWidth.value, [0, 1], [0, 1]),
    opacity: searchBarOpacity.value,
    overflow: 'hidden',
  }));

  // ── Suggestions — pool de 30, on pioche 10 au hasard à chaque inject ────────
  const [suggestPool,    setSuggestPool]    = useState<UserPublic[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(true);

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await userService.getSuggestions(30);
      setSuggestPool(Array.isArray(data) ? data : []);
    } catch { setSuggestPool([]); }
    finally { setSuggestLoading(false); }
  }, []);

  // Pioche 10 au hasard dans le pool
  const pickSuggestions = useCallback((): UserPublic[] => {
    if (suggestPool.length <= 10) return suggestPool;
    const shuffled = [...suggestPool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 10);
  }, [suggestPool]);

  useEffect(() => { loadSuggestions(); }, []);

  // ── Suivi (follow) state ──────────────────────────────────────────────────
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;
    userService.getFollowing(currentUser.id).then(list => {
      setFollowingSet(new Set(list.map((u: any) => u.id)));
    }).catch(() => {});
  }, [currentUser]);

  const handleToggleFollow = useCallback(async (authorId: string) => {
    const wasFollowing = followingSet.has(authorId);
    setFollowingSet(prev => {
      const next = new Set(prev);
      wasFollowing ? next.delete(authorId) : next.add(authorId);
      return next;
    });
    try {
      if (wasFollowing) {
        await userService.unfollow(authorId);
      } else {
        await userService.follow(authorId);
      }
    } catch {
      // rollback
      setFollowingSet(prev => {
        const next = new Set(prev);
        wasFollowing ? next.add(authorId) : next.delete(authorId);
        return next;
      });
    }
  }, [followingSet]);

  const load = useCallback(async (f: FeedFilter) => {
    try {
      if (f === 'all') {
        const [feedResult, reelsResult, postsResult] = await Promise.all([
          searchService.getFeed(1, 50).catch(() => ({ items: [] })),
          reelService.getFeed().catch(() => ({ items: [], has_more: false, page: 1 })),
          postService.getFeed(1, 30).catch(() => [] as Post[]),
        ]);
        if (__DEV__) {
          console.log('[Feed] feedResult:', JSON.stringify(feedResult).slice(0, 300));
          console.log('[Feed] reelsResult:', JSON.stringify(reelsResult).slice(0, 300));
          console.log('[Feed] postsResult:', JSON.stringify(postsResult).slice(0, 300));
        }
        const feedItems: FeedItem[] = (feedResult.items ?? [])
          .filter((item: any) => item.kind !== 'reel' && item.id)
          .map((item: any) => ({
            kind: item.kind as 'event' | 'concert',
            id: item.id,
            data: item,
          }));
        const reelItems: FeedItem[] = (reelsResult.items ?? [])
          .filter((r: any) => r.id)
          .map((r: any) => ({ kind: 'reel' as const, id: r.id, data: r }));
        const postItems: FeedItem[] = (Array.isArray(postsResult) ? postsResult : [])
          .filter((p: Post) => p.id)
          .map((p: Post) => ({ kind: 'post' as const, id: p.id, data: p }));
        // Dédupliquer par clé composite avant shuffle
        const seen = new Set<string>();
        const deduped = [...feedItems, ...reelItems, ...postItems].filter(item => {
          const key = `${item.kind}-${item.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Mélanger aléatoirement tous les types de contenu
        for (let i = deduped.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deduped[i], deduped[j]] = [deduped[j], deduped[i]];
        }
        // Filtrer les contenus masqués ("Pas intéressé")
        const filtered = feedPreferenceService.filterFeed(deduped);
        // Injecter les suggestions à une position aléatoire entre 5 et 15
        const pos = Math.floor(Math.random() * 11) + 5;
        filtered.splice(Math.min(pos, filtered.length), 0, { kind: 'suggestions', id: '__suggestions__', data: null });
        setItems(filtered);
      } else {
        // Filtre spécifique — fallback sur les services classiques
        const results: FeedItem[] = [];
        if (f === 'events') {
          const evts = await eventService.list({ status: 'published' });
          evts.forEach(e => results.push({ kind: 'event', id: e.id, data: e }));
        }
        if (f === 'concerts') {
          const ccs = await concertService.list();
          ccs.forEach((c: Concert) => results.push({ kind: 'concert', id: c.id, data: c }));
        }
        results.sort((a, b) => {
          const dateA = a.kind === 'event'
            ? (a.data as Event).starts_at
            : (a.data as Concert).scheduled_at;
          const dateB = b.kind === 'event'
            ? (b.data as Event).starts_at
            : (b.data as Concert).scheduled_at;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
        setItems(results);
      }
    } catch (err) {
      if (__DEV__) { console.warn('[FeedScreen] load error:', err); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recharge quand le filtre change
  useEffect(() => { setLoading(true); load(filter); }, [filter]);

  // Charger les concerts en direct (une seule fois au montage)
  const loadLive = useCallback(async () => {
    try {
      const live = await concertService.getLive();
      setLiveConcerts(Array.isArray(live) ? live : []);
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => {
    loadLive();
    communityService.list(1, 8).then(data => setTrendingComm(Array.isArray(data) ? data.slice(0, 5) : [])).catch(() => {});
  }, []);

  // Rafraîchissement temps réel : reload quand un autre utilisateur publie
  useEffect(() => {
    const handler = (payload: { type: string }) => {
      if (payload.type === 'feed_updated') load(filter);
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [filter, load, addListener, removeListener]);

  // Focus : reprise vidéo + rechargement au retour depuis CreatePost
  const didMountRef = useRef(false);
  useFocusEffect(useCallback(() => {
    setFeedFocused(true);
    if (didMountRef.current) {
      load(filter);
    }
    didMountRef.current = true;
    return () => {
      setFeedFocused(false);
      setActiveReelId(null);
    };
  }, [filter]));

  // ── Posts ──────────────────────────────────────────────────────────────────

  const handlePostDeleted = useCallback((postId: string) => {
    setItems(prev => prev.filter(item => !(item.kind === 'post' && item.id === postId)));
  }, []);

  // ── Comments sheet ─────────────────────────────────────────────────────────

  const openComments = useCallback((item: FeedItem) => {
    setCommentItem(item);
    setCommentVisible(true);
  }, []);

  const goToMessages = useCallback(() => nav.navigate('Messages' as any), [nav]);
  const goToNotifs   = useCallback(() => nav.navigate('Notifications' as any), [nav]);
  const openMenu     = useCallback(() => setMenuOpen(true), []);

  const closeComments = useCallback(() => {
    setCommentVisible(false);
    setCommentItem(null);
  }, []);

  // ── renderItem stable ──────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    if (item.kind === 'suggestions') {
      return (
        <PeopleSuggestions
          users={pickSuggestions()}
          loading={suggestLoading}
          onUserPress={id => nav.navigate('UserProfile', { userId: id })}
          onRefresh={loadSuggestions}
        />
      );
    }
    if (item.kind === 'reel') {
      return (
        <ReelFeedCard
          reel={item.data}
          colors={colors}
          isActive={activeReelId === item.id && feedFocused}
          onPress={() => (nav as any).navigate('Reels', { initialReelId: item.data.id })}
          onScrollLock={setFeedScrollEnabled}
        />
      );
    }
    if (item.kind === 'post') {
      return (
        <PostCard
          post={item.data as Post}
          colors={colors}
          currentUserId={currentUser?.id}
          onPress={() => (nav as any).navigate('PostDetail', { postId: item.id })}
          onAuthorPress={() => {
            const authorId = (item.data as Post).author?.id;
            if (authorId) (nav as any).navigate('UserProfile', { userId: authorId });
          }}
          onDelete={handlePostDeleted}
        />
      );
    }
    const aid = item.kind === 'event'
      ? (item.data as Event).organizer?.id
      : (item.data as Concert).artist?.id;
    return (
      <FeedCard
        item={item}
        colors={colors}
        currentUserId={currentUser?.id}
        isActive={activeCardId === item.id && feedFocused}
        isFollowing={!!aid && followingSet.has(aid)}
        onToggleFollow={() => { if (aid) handleToggleFollow(aid); }}
        onComment={(onCountChange) => { commentCountChangeRef.current = onCountChange; openComments(item); }}
        onPress={() => {
          if (item.kind === 'concert') nav.navigate('ConcertDetail', { concertId: item.id });
          else nav.navigate('EventDetail', { eventId: item.id });
        }}
        onAuthorPress={() => { if (aid) (nav as any).navigate('UserProfile', { userId: aid }); }}
      />
    );
  }, [colors, activeReelId, activeCardId, feedFocused, currentUser?.id, followingSet, handleToggleFollow, handlePostDeleted, openComments, nav, pickSuggestions, suggestLoading, loadSuggestions]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const displayName = currentUser?.display_name ?? currentUser?.first_name ?? currentUser?.username ?? '';
  const initials = displayName ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?';

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: colors.surface }]}>
        <View style={s.headerRow}>
          {/* Gauche : avatar + nom  — masqué si recherche ouverte */}
          {!searchOpen && (
            !currentUser ? (
              /* Skeleton header */
              <View style={[s.headerLeft, { pointerEvents: 'none' }]}>
                <SkeletonBox width={34} height={34} borderRadius={17} />
                <SkeletonBox width={90} height={13} borderRadius={6} />
              </View>
            ) : (
              <TouchableOpacity style={s.headerLeft} activeOpacity={0.7}
                onPress={() => currentUser.id && (nav as any).navigate('UserProfile', { userId: currentUser.id })}>
                {currentUser.avatar_url ? (
                  <Image source={{ uri: currentUser.avatar_url }} style={s.avatar} />
                ) : (
                  <View style={[s.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
                    <Text style={[s.avatarText, { color: colors.primary }]}>{initials}</Text>
                  </View>
                )}
                {displayName ? (
                  <Text style={[s.userName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {displayName}
                  </Text>
                ) : null}
              </TouchableOpacity>
            )
          )}

          {/* Barre de recherche animée — apparaît quand searchOpen */}
          {searchOpen && (
            <Animated.View style={[animatedSearchBar, {
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 12, height: 38,
              borderRadius: 20, borderWidth: 1,
              borderColor: colors.primary + '55',
              backgroundColor: colors.backgroundSecondary,
              gap: 8, flex: 1, marginRight: 8,
            }]}>
              <Icon name="search" size={16} color={colors.primary} />
              <TextInput
                ref={searchInputRef}
                placeholder="Rechercher..."
                placeholderTextColor={colors.textDisabled}
                style={{ flex: 1, fontSize: 14, color: colors.textPrimary, padding: 0 }}
                returnKeyType="search"
                value={searchQuery}
                onChangeText={(text) => { setSearchQuery(text); liveSearch(text); }}
                onSubmitEditing={async () => {
                  if (!searchQuery.trim()) return;
                  setSearching(true);
                  try {
                    const results = await searchService.searchAll({ q: searchQuery.trim() });
                    setSearchResults(results);
                  } catch { /* silencieux */ }
                  finally { setSearching(false); }
                }}
              />
              {searching && <ActivityIndicator size="small" color={colors.primary} />}
              {searchQuery.length > 0 && !searching && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults(null); }}>
                  <Icon name="x-circle" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Droite : icônes */}
          <View style={s.headerRight}>
            {/* Icône recherche — style Facebook */}
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: searchOpen ? colors.primary + '22' : colors.backgroundSecondary }]}
              onPress={searchOpen ? closeSearch : openSearch}
            >
              <Icon name={searchOpen ? 'x' : 'search'} size={20} color={searchOpen ? colors.primary : colors.textPrimary} />
            </TouchableOpacity>
            {!searchOpen && (
              <>
                <FeedHeaderBadges
                  onMessages={goToMessages}
                  onNotifs={goToNotifs}
                  onMenu={openMenu}
                  colors={colors}
                />
              </>
            )}
          </View>
        </View>

        {/* ── Stories ───────────────────────────────────────────────────── */}
        {!searchOpen && (
          <View style={{ marginTop: 5 }}>
            <StoryBar
              currentUser={currentUser}
              colors={colors}
              onNavigateToMyStories={() => nav.navigate('MyStories')}
              onNavigateToChat={(partnerId, partnerName, avatarUrl) =>
                nav.navigate('Chat', { partnerId, partnerName, avatarUrl })
              }
              onNavigateToCall={(partnerId, partnerName, callType) =>
                nav.navigate('Call', { partnerId, partnerName, callType, isIncoming: false })
              }
            />
          </View>
        )}
      </View>

      {searchResults ? (
        /* ── Résultats de recherche ─────────────────────────────────────── */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}>

          {/* Films */}
          {(searchResults.films?.length ?? 0) > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
                🎬 Films ({searchResults.films.length})
              </Text>
              {searchResults.films.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                >
                  {c.thumbnail_url ? (
                    <Image source={{ uri: c.thumbnail_url }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="film" size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{c.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>{c.year ?? 'Film'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Séries */}
          {(searchResults.series?.length ?? 0) > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
                📺 Séries ({searchResults.series.length})
              </Text>
              {searchResults.series.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                >
                  {c.thumbnail_url ? (
                    <Image source={{ uri: c.thumbnail_url }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="tv" size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{c.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>Série · {c.year ?? ''}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Concerts */}
          {(searchResults.concerts?.length ?? 0) > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
                🎵 Concerts ({searchResults.concerts.length})
              </Text>
              {searchResults.concerts.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                  onPress={() => (nav as any).navigate('ConcertDetail', { concertId: c.id })}
                >
                  {c.thumbnail_url ? (
                    <Image source={{ uri: c.thumbnail_url }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="music" size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{c.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }} numberOfLines={1}>{c.genre ?? 'Concert'} · {c.venue_city ?? ''}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Événements */}
          {(searchResults.events?.length ?? 0) > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
                📅 Événements ({searchResults.events.length})
              </Text>
              {searchResults.events.map((e: any) => (
                <TouchableOpacity
                  key={e.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                  onPress={() => (nav as any).navigate('EventDetail', { eventId: e.id })}
                >
                  {e.thumbnail_url ? (
                    <Image source={{ uri: e.thumbnail_url }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="calendar" size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{e.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }} numberOfLines={1}>{e.type ?? e.event_type} · {e.venue_city ?? ''}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Reels */}
          {(searchResults.reels?.length ?? 0) > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
                🎥 Reels ({searchResults.reels.length})
              </Text>
              {searchResults.reels.map((r: any) => (
                <TouchableOpacity
                  key={r.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                >
                  {r.thumbnail_url ? (
                    <Image source={{ uri: r.thumbnail_url }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="video" size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={2}>{r.caption ?? 'Reel'}</Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>{r.view_count ?? 0} vues</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Utilisateurs */}
          {(searchResults.users?.length ?? 0) > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
                👤 Utilisateurs ({searchResults.users!.length})
              </Text>
              {searchResults.users!.map((u: any) => (
                <TouchableOpacity
                  key={u.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                  onPress={() => (nav as any).navigate('UserProfile', { userId: u.id })}
                >
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>{((u.display_name ?? u.username) as string)[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{u.display_name ?? u.username}</Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>@{u.username}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Aucun résultat */}
          {(searchResults.users?.length ?? 0) === 0 &&
           (searchResults.films?.length ?? 0) === 0 &&
           (searchResults.series?.length ?? 0) === 0 &&
           (searchResults.concerts?.length ?? 0) === 0 &&
           (searchResults.events?.length ?? 0) === 0 &&
           (searchResults.reels?.length ?? 0) === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
              <Icon name="search" size={40} color={colors.textTertiary} />
              <Text style={{ fontSize: 15, color: colors.textSecondary }}>Aucun résultat pour "{searchQuery}"</Text>
            </View>
          )}
        </ScrollView>
      ) : loading ? (
        <SkeletonFeedScreen />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => `${item.kind}-${item.id}`}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          scrollEnabled={feedScrollEnabled}
          onViewableItemsChanged={onFeedViewableChanged}
          viewabilityConfig={feedViewabilityConfig}
          ListHeaderComponent={
            <>
              {/* ── En direct ───────────────────────────────────────── */}
              {liveConcerts.length > 0 && (
                <View style={{ marginTop: 8, marginBottom: 4 }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}
                    activeOpacity={0.7}
                    onPress={() => nav.navigate('LiveList' as any)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>En direct</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{liveConcerts.length}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>Voir tout</Text>
                      <Icon name="chevron-right" size={14} color={colors.primary} />
                    </View>
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                    {liveConcerts.map(c => {
                      const artist = c.artist;
                      const name = artist?.display_name ?? artist?.username ?? 'Artiste';
                      const initial = name[0]?.toUpperCase() ?? '?';
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={{ width: 130, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}
                          activeOpacity={0.85}
                          onPress={() => {
                            const isOwner = currentUser?.id === c.artist_id;
                            if (isOwner) nav.navigate('LiveStream', { concertId: c.id });
                            else nav.navigate('LiveViewer', { concertId: c.id });
                          }}
                        >
                          <View style={{ width: 130, height: 170, position: 'relative' }}>
                            {c.thumbnail_url ? (
                              <Image source={{ uri: c.thumbnail_url }} style={{ width: 130, height: 170 }} />
                            ) : (
                              <LinearGradient
                                colors={['#7B3FF2', '#E0389A']}
                                style={{ width: 130, height: 170, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Icon name="radio" size={28} color="#fff" />
                              </LinearGradient>
                            )}
                            <LinearGradient
                              colors={['transparent', 'rgba(0,0,0,0.7)']}
                              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }}
                            />
                            <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' }} />
                              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>LIVE</Text>
                            </View>
                            <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                              <Icon name="eye" size={10} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{c.current_viewers ?? 0}</Text>
                            </View>
                            <View style={{ position: 'absolute', bottom: 6, left: 6, right: 6 }}>
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{c.title}</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                {artist?.avatar_url ? (
                                  <Image source={{ uri: artist.avatar_url }} style={{ width: 14, height: 14, borderRadius: 7 }} />
                                ) : (
                                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: '#fff', fontSize: 7, fontWeight: '800' }}>{initial}</Text>
                                  </View>
                                )}
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* ── Communautés tendance ─────────────────────────────── */}
              {trendingComm.length > 0 && (() => {
                const COMM_GRADS: [string,string][] = [
                  ['#7B3FF2','#E0389A'],['#0EA5E9','#6366F1'],
                  ['#10B981','#0EA5E9'],['#F59E0B','#EF4444'],
                  ['#EC4899','#8B5CF6'],['#14B8A6','#3B82F6'],
                ];
                const gradFor = (name: string): [string,string] =>
                  COMM_GRADS[name.charCodeAt(0) % COMM_GRADS.length];
                const fmtM = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);
                return (
                  <Animated.View entering={FadeInDown.delay(40).springify()} style={{ marginTop: 6, marginBottom: 2 }}>
                    {/* En-tête */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <LinearGradient colors={['#7B3FF2','#E0389A']} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }} start={{x:0,y:0}} end={{x:1,y:1}}>
                          <Icon name="users" size={14} color="#fff" />
                        </LinearGradient>
                        <View>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }}>Communautés</Text>
                          <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 0 }}>Rejoins des groupes actifs</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => nav.navigate('Communities' as any)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '15', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>Voir tout</Text>
                        <Icon name="chevron-right" size={12} color={colors.primary} />
                      </TouchableOpacity>
                    </View>

                    {/* Cards horizontales */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
                      {trendingComm.map((comm, idx) => {
                        const grad = gradFor(comm.name);
                        const initial = (comm.name || '?')[0].toUpperCase();
                        return (
                          <TouchableOpacity
                            key={comm.id}
                            style={{
                              width: 148,
                              borderRadius: 18,
                              backgroundColor: colors.surface,
                              overflow: 'hidden',
                              shadowColor: '#000',
                              shadowOpacity: 0.10,
                              shadowRadius: 10,
                              shadowOffset: { width: 0, height: 4 },
                              elevation: 4,
                            }}
                            activeOpacity={0.88}
                            onPress={() => nav.navigate('CommunityDetail' as any, { communityId: comm.id })}
                          >
                            {/* Bannière */}
                            <View style={{ height: 72, position: 'relative' }}>
                              {comm.banner_url
                                ? <Image source={{ uri: comm.banner_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                : <LinearGradient colors={grad} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                              }
                              {/* Gradient overlay bas pour lisibilité */}
                              <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.45)']}
                                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 36 }}
                                pointerEvents="none"
                              />
                              {/* Badge membres en bas gauche */}
                              <View style={{ position: 'absolute', bottom: 6, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Icon name="users" size={9} color="rgba(255,255,255,0.9)" />
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{fmtM(comm.members_count ?? 0)}</Text>
                              </View>
                              {/* Badge vérifié + privé */}
                              <View style={{ position: 'absolute', top: 7, right: 7, flexDirection: 'row', gap: 4 }}>
                                {comm.is_private && (
                                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon name="lock" size={9} color="#fff" />
                                  </View>
                                )}
                                {comm.is_verified && (
                                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon name="check" size={10} color="#fff" />
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Corps */}
                            <View style={{ paddingHorizontal: 10, paddingBottom: 12 }}>
                              {/* Avatar flottant */}
                              <View style={{ marginTop: -14, marginBottom: 6 }}>
                                <View style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 2.5, borderColor: colors.surface, overflow: 'hidden' }}>
                                  {comm.avatar_url
                                    ? <Image source={{ uri: comm.avatar_url }} style={{ width: '100%', height: '100%' }} />
                                    : <LinearGradient colors={grad} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{initial}</Text>
                                      </LinearGradient>
                                  }
                                </View>
                              </View>

                              {/* Nom */}
                              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13, letterSpacing: -0.2 }} numberOfLines={1}>
                                {comm.name}
                              </Text>

                              {/* Description */}
                              {comm.description ? (
                                <Text style={{ color: colors.textTertiary, fontSize: 10, lineHeight: 13, marginTop: 2 }} numberOfLines={2}>
                                  {comm.description}
                                </Text>
                              ) : (
                                <Text style={{ color: colors.textDisabled, fontSize: 10, marginTop: 2, fontStyle: 'italic' }}>
                                  Communauté active
                                </Text>
                              )}

                              {/* Bouton rejoindre */}
                              <TouchableOpacity
                                style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden' }}
                                activeOpacity={0.85}
                                onPress={() => nav.navigate('CommunityDetail' as any, { communityId: comm.id })}
                              >
                                <LinearGradient colors={grad} style={{ paddingVertical: 6, alignItems: 'center', justifyContent: 'center' }} start={{x:0,y:0}} end={{x:1,y:0}}>
                                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Rejoindre</Text>
                                </LinearGradient>
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                      {/* Card "Explorer" */}
                      <TouchableOpacity
                        style={{
                          width: 90, borderRadius: 18,
                          backgroundColor: colors.backgroundSecondary,
                          borderWidth: 1.5, borderColor: colors.divider,
                          borderStyle: 'dashed',
                          alignItems: 'center', justifyContent: 'center',
                          paddingVertical: 20, gap: 8,
                        }}
                        activeOpacity={0.85}
                        onPress={() => nav.navigate('Communities' as any)}
                      >
                        <LinearGradient colors={['#7B3FF2','#E0389A']} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }} start={{x:0,y:0}} end={{x:1,y:1}}>
                          <Icon name="compass" size={18} color="#fff" />
                        </LinearGradient>
                        <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 14 }}>
                          Explorer{'\n'}tout
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </Animated.View>
                );
              })()}

              {/* ── Filtres ──────────────────────────────────────────── */}
              <Animated.View entering={FadeInDown.delay(60).springify()} style={s.filtersWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
                  {([
                    { key: 'all',      icon: 'grid',     label: 'Tout'       },
                    { key: 'events',   icon: 'calendar', label: 'Événements' },
                    { key: 'concerts', icon: 'music',    label: 'Concerts'   },
                  ] as const).map(f => {
                    const active = filter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        onPress={() => setFilter(f.key)}
                        style={[
                          s.filterPill,
                          {
                            backgroundColor: active ? colors.primary + '22' : colors.backgroundSecondary,
                            borderColor:     active ? colors.primary         : colors.border,
                          },
                        ]}
                      >
                        <Icon name={f.icon} size={13} color={active ? colors.primary : colors.textSecondary} />
                        <Text style={[s.filterText, { color: active ? colors.primary : colors.textSecondary }]}>
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </Animated.View>

              {/* ── Créer un post ────────────────────────────────────── */}
              <CreatePostBox
                currentUser={currentUser}
                colors={colors}
                onPress={() => (nav as any).navigate('CreatePost')}
              />

            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(filter); }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="inbox" size={48} color={colors.textTertiary} />
              <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                Aucun contenu pour le moment
              </Text>
            </View>
          }
          renderItem={renderItem}
          removeClippedSubviews
          maxToRenderPerBatch={6}
          windowSize={7}
          initialNumToRender={5}
        />
      )}

      {/* ── FAB Créer un post ──────────────────────────────────────────── */}
      {!searchOpen && !searchResults && (
        <TouchableOpacity
          style={{ position: 'absolute', bottom: 60, right: 18, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
          onPress={() => (nav as any).navigate('CreatePost')}
          activeOpacity={0.85}
        >
          <Icon name="edit-2" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Sheet commentaires ──────────────────────────────────────────── */}
      <CommentsBottomSheet
        visible={commentVisible}
        onClose={closeComments}
        eventId={commentItem?.kind === 'event'   ? commentItem.id : undefined}
        concertId={commentItem?.kind === 'concert' ? commentItem.id : undefined}
        postId={commentItem?.kind === 'post'     ? commentItem.id : undefined}
        onCommentCountChange={delta => commentCountChangeRef.current?.(delta)}
      />

      {/* ── Menu Explorer (style TikTok/Facebook) ───────────────────────── */}
      <Modal visible={menuOpen} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>

          {/* Header */}
          <View style={[mnu.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: 52 }]}>
            <Text style={[mnu.headerTitle, { color: colors.textPrimary }]}>Explorer</Text>
            <TouchableOpacity onPress={() => setMenuOpen(false)} style={mnu.closeBtn}>
              <Icon name="x" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

            {/* Profil rapide */}
            {currentUser && (
              <TouchableOpacity
                style={[mnu.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => { setMenuOpen(false); nav.navigate('EditProfile' as any); }}
              >
                {currentUser.avatar_url ? (
                  <Image source={{ uri: currentUser.avatar_url }} style={mnu.profileAvatar} />
                ) : (
                  <View style={[mnu.profileAvatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>
                      {(currentUser.display_name ?? currentUser.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[mnu.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {currentUser.display_name ?? currentUser.username}
                  </Text>
                  <Text style={[mnu.profileSub, { color: colors.textTertiary }]}>
                    Voir mon profil
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}

            {/* Grille — Découvrir */}
            <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>DÉCOUVRIR</Text>
            <View style={mnu.grid}>
              {([
                { icon: 'film',        label: 'Films & Séries', color: '#3B82F6', screen: 'Films'       },
                { icon: 'play-circle', label: 'Reels',         color: '#FF7A2F', screen: 'Reels'       },
                { icon: 'radio',       label: 'Live',          color: '#EF4444', screen: 'LiveList'    },
                { icon: 'music',       label: 'Concerts',      color: '#7B3FF2', screen: 'Concerts'    },
                { icon: 'calendar',    label: 'Planning',      color: '#10B981', screen: 'Planning'    },
                { icon: 'calendar',    label: 'Événements',    color: '#E0389A', screen: 'Events'      },
                { icon: 'trending-up', label: 'Tendances',     color: '#F59E0B', screen: 'Trending'    },
              ] as const).map((item) => (
                <TouchableOpacity
                  key={item.screen}
                  style={[mnu.gridItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  activeOpacity={0.75}
                  onPress={() => { setMenuOpen(false); (nav as any).navigate(item.screen); }}
                >
                  <View style={[mnu.gridIcon, { backgroundColor: item.color + '20' }]}>
                    <Icon name={item.icon} size={24} color={item.color} />
                  </View>
                  <Text style={[mnu.gridLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Liste — Social */}
            <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>SOCIAL</Text>
            {([
              { icon: 'users',          label: 'Communautés',   sub: 'Rejoins des groupes',        color: '#36D9A0', screen: 'Communities'   },
              { icon: 'user-plus',      label: 'Amis',          sub: 'Abonnements & abonnés',      color: '#10B981', screen: 'Following'      },
              { icon: 'activity',       label: 'Activité',      sub: 'Tes interactions récentes',  color: '#E0389A', screen: 'Activity'       },
              { icon: 'clock',          label: 'Historique',    sub: 'Vidéos regardées',           color: '#6366F1', screen: 'WatchHistory'   },
              { icon: 'star',           label: 'Favoris',       sub: 'Contenus sauvegardés',       color: '#EAB308', screen: 'Favorites'      },
            ] as const).map((item) => (
              <TouchableOpacity
                key={item.screen}
                style={[mnu.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.75}
                onPress={() => { setMenuOpen(false); (nav as any).navigate(item.screen); }}
              >
                <View style={[mnu.listIcon, { backgroundColor: item.color + '18' }]}>
                  <Icon name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[mnu.listLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Text style={[mnu.listSub, { color: colors.textTertiary }]}>{item.sub}</Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}

            {/* Liste — Compte */}
            <Text style={[mnu.sectionTitle, { color: colors.textTertiary }]}>COMPTE</Text>
            {([
              { icon: 'award',    label: 'Abonnements', sub: 'Gérer ton abonnement', color: '#14B8A6', screen: 'Subscriptions' },
              { icon: 'settings', label: 'Paramètres',  sub: 'Confidentialité, sécurité', color: '#6B7280', screen: 'Settings'      },
            ] as const).map((item) => (
              <TouchableOpacity
                key={item.screen}
                style={[mnu.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.75}
                onPress={() => { setMenuOpen(false); (nav as any).navigate(item.screen); }}
              >
                <View style={[mnu.listIcon, { backgroundColor: item.color + '18' }]}>
                  <Icon name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[mnu.listLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Text style={[mnu.listSub, { color: colors.textTertiary }]}>{item.sub}</Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}

          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

// ── ReelFeedCard — carte reel style Facebook dans le feed ────────────────────

const ReelFeedCard: React.FC<{
  reel: any;
  colors: AppColors;
  isActive: boolean;
  onPress: () => void;
  onScrollLock?: (enabled: boolean) => void;
}> = React.memo(({ reel, colors, isActive, onPress, onScrollLock }) => {
  const author   = reel.author;
  const name     = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials = name[0]?.toUpperCase() ?? '?';

  const [muted,    setMuted]    = useState(true);
  const [paused,   setPaused]   = useState(false);
  const [progress, setProgress] = useState(0);

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)    return 'À l\'instant';
    if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const playing = isActive && !paused && !!reel.video_url;

  const player = useVideoPlayer(
    reel.video_url ? { uri: reel.video_url } : { uri: 'about:blank' },
    p => { p.loop = true; p.muted = muted; p.volume = muted ? 0 : 1.0; },
  );

  useEffect(() => {
    if (playing) player.play(); else player.pause();
  }, [playing]);

  useEffect(() => { player.muted = muted; player.volume = muted ? 0 : 1.0; }, [muted]);

  // Reset progression à l'inactivité
  useEffect(() => {
    if (!isActive) setProgress(0);
  }, [isActive]);

  return (
    <View style={[rs.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
      {/* ── Header auteur ── */}
      <View style={rs.header}>
        {author?.avatar_url ? (
          <Image source={{ uri: author.avatar_url }} style={rs.avatar} />
        ) : (
          <View style={[rs.avatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[rs.authorName, { color: colors.textPrimary }]}>{name}</Text>
            {author?.is_verified && (
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={9} color="#fff" />
              </View>
            )}
          </View>
          <Text style={[rs.time, { color: colors.textTertiary }]}>
            {timeAgo(reel.created_at)} · <Text style={{ color: colors.primary, fontWeight: '700' }}>Reels</Text>
          </Text>
        </View>
        <Icon name="more-horizontal" size={20} color={colors.textTertiary} />
      </View>

      {/* ── Caption ── */}
      {reel.caption ? (
        <Text style={[rs.caption, { color: colors.textPrimary }]} numberOfLines={2}>{reel.caption}</Text>
      ) : null}

      {/* ── Zone vidéo ── */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => onScrollLock?.(false)}
        onPressOut={() => onScrollLock?.(true)}
      >
        <View style={rs.thumbWrap}>
          {/* Fond par défaut quand pas de thumbnail */}
          {!reel.thumbnail_url && !playing ? (
            <LinearGradient
              colors={['#1a1a2e', '#16213e', '#0f3460']}
              style={StyleSheet.absoluteFill}
            >
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="film" size={36} color="rgba(255,255,255,0.3)" />
              </View>
            </LinearGradient>
          ) : null}

          {/* Thumbnail affiché tant que non actif ou en chargement */}
          {reel.thumbnail_url && !playing ? (
            <Image source={{ uri: reel.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}

          {/* Lecteur vidéo — actif uniquement si isActive */}
          {isActive && reel.video_url ? (
            <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" controls={false} surfaceType="texture" />
          ) : null}

          {/* Gradient bas */}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={rs.thumbGradient} />

          {/* Icône pause/play sur tap */}
          {!playing && (
            <View style={rs.playOverlay} pointerEvents="none">
              <View style={rs.playCircle}>
                <Icon name={isActive && paused ? 'pause' : 'play'} size={26} color="#fff" />
              </View>
            </View>
          )}

          {/* Bouton mute — visible uniquement quand actif */}
          {isActive && (
            <TouchableOpacity
              style={rs.muteBtn}
              onPress={() => setMuted(v => !v)}
              activeOpacity={0.8}
            >
              <Icon name={muted ? 'volume-x' : 'volume-2'} size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Durée */}
          {reel.duration_sec && !isActive ? (
            <View style={rs.duration}>
              <Text style={rs.durationText}>{reel.duration_sec}s</Text>
            </View>
          ) : null}

          {/* Vues */}
          <View style={rs.views}>
            <Icon name="eye" size={12} color="#fff" />
            <Text style={rs.viewsText}>{(reel.view_count ?? 0).toLocaleString()}</Text>
          </View>

          {/* Barre de progression */}
          {isActive && (
            <View style={rs.progressTrack} pointerEvents="none">
              <View style={[rs.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
});

const rs = StyleSheet.create({
  card:        { marginHorizontal: 0, marginBottom: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar:      { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  authorName:  { fontSize: 14, fontWeight: '700' },
  time:        { fontSize: 12, marginTop: 1 },
  reelBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  reelBadgeText: { fontSize: 10, fontWeight: '700' },
  caption:     { paddingHorizontal: 12, paddingBottom: 8, fontSize: 14, lineHeight: 20 },
  thumbWrap:    { width: '100%', aspectRatio: 1 / 0.88, position: 'relative', overflow: 'hidden' },
  thumb:        { width: '100%', height: '100%' },
  thumbGradient:{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  playOverlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playCircle:   { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  duration:     { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  views:        { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewsText:    { color: '#fff', fontSize: 11, fontWeight: '600' },
  footer:       { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  action:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  actionText:   { fontSize: 13, fontWeight: '600' },
  stat:         { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText:     { fontSize: 13, fontWeight: '500' },
  muteBtn:      { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  progressTrack:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  progressFill:    { height: 3, backgroundColor: '#fff' },
});

// ── FeedCard ──────────────────────────────────────────────────────────────────

interface FeedCardProps {
  item:      FeedItem;
  colors:    AppColors;
  currentUserId?: string;
  isFollowing: boolean;
  isActive:  boolean;
  onToggleFollow: () => void;
  onComment: (onCountChange: (delta: number) => void) => void;
  onPress:   () => void;
  onAuthorPress: () => void;
}

// ── Card Context Menu ─────────────────────────────────────────────────────────

interface CardMenuProps {
  item:         FeedItem;
  colors:       AppColors;
  isSaved:      boolean;
  isFollowing:  boolean;
  isOwnContent: boolean;
  authorName:   string;
  onClose:      () => void;
  onSave:       () => void;
  onShare:      () => void;
  onFollow:     () => void;
  onReport:     () => void;
  onHide:       () => void;
  onRemind:     () => void;
  hasReminder:  boolean;
}

const CardContextMenu: React.FC<CardMenuProps> = ({
  item, colors, isSaved, isFollowing, isOwnContent, authorName,
  onClose, onSave, onShare, onFollow, onReport, onHide, onRemind, hasReminder,
}) => {
  const title = item.data?.title as string | undefined;

  const actions = [
    {
      icon: 'bell' as const,
      label: hasReminder ? 'Annuler le rappel' : 'Me rappeler',
      sublabel: hasReminder ? 'Rappel actif' : '1h avant l\'événement',
      color: hasReminder ? colors.primary : colors.textPrimary,
      onPress: () => { onClose(); onRemind(); },
    },
    {
      icon: 'bookmark' as const,
      label: isSaved ? 'Retirer des favoris' : 'Sauvegarder',
      sublabel: isSaved ? 'Dans vos favoris' : 'Accès hors-ligne',
      color: isSaved ? colors.primary : colors.textPrimary,
      onPress: () => { onClose(); onSave(); },
    },
    {
      icon: 'share-2' as const,
      label: 'Partager',
      sublabel: null,
      color: colors.textPrimary,
      onPress: () => { onClose(); onShare(); },
    },
    ...(!isOwnContent ? [{
      icon: (isFollowing ? 'user-x' : 'user-plus') as any,
      label: isFollowing ? `Ne plus suivre` : `Suivre ${authorName}`,
      sublabel: null as null,
      color: isFollowing ? '#EF4444' : colors.textPrimary,
      onPress: () => { onClose(); onFollow(); },
    }] : []),
    ...(!isOwnContent ? [{
      icon: 'eye-off' as any,
      label: 'Pas intéressé',
      sublabel: 'Masquer du fil' as null,
      color: colors.textSecondary,
      onPress: () => { onClose(); onHide(); },
    }] : []),
    ...(!isOwnContent ? [{
      icon: 'flag' as any,
      label: 'Signaler',
      sublabel: null as null,
      color: '#EF4444',
      onPress: () => { onClose(); onReport(); },
    }] : []),
  ];

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={cm.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[cm.sheet, { backgroundColor: colors.surface }]}>
          <View style={[cm.handle, { backgroundColor: colors.divider }]} />
          {title ? (
            <Text style={[cm.sheetTitle, { color: colors.textTertiary }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {actions.map((a, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={[cm.divider, { backgroundColor: colors.divider }]} />}
              <TouchableOpacity style={cm.action} onPress={a.onPress} activeOpacity={0.7}>
                <View style={[cm.iconWrap, { backgroundColor: a.color + '18' }]}>
                  <Icon name={a.icon} size={18} color={a.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[cm.actionText, { color: a.color }]}>{a.label}</Text>
                  {a.sublabel ? (
                    <Text style={[cm.actionSub, { color: colors.textTertiary }]}>{a.sublabel}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            </React.Fragment>
          ))}
          <TouchableOpacity
            style={[cm.cancelBtn, { backgroundColor: colors.backgroundSecondary }]}
            onPress={onClose}
          >
            <Text style={[cm.cancelText, { color: colors.textSecondary }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const cm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, paddingTop: 10 },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20, marginBottom: 6, paddingBottom: 10 },
  action:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  iconWrap:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 15, fontWeight: '500' },
  divider:    { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },
  cancelBtn:  { marginHorizontal: 16, marginTop: 10, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  actionSub:  { fontSize: 12, marginTop: 1 },
});

// Monté uniquement quand la carte est visible — joue dès le mount, pause quand invisible
const CardVideo: React.FC<{ uri: string; playing: boolean }> = ({ uri, playing }) => {
  const player = useVideoPlayer({ uri }, p => { p.loop = true; p.muted = true; });
  useEffect(() => { if (playing) player.play(); else player.pause(); }, [playing]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" controls={false} surfaceType="texture" />;
};

const FeedCard: React.FC<FeedCardProps> = React.memo(({ item, colors, currentUserId, isFollowing, isActive, onToggleFollow, onComment, onPress, onAuthorPress }) => {
  const isEvent  = item.kind === 'event';
  const isConcert = item.kind === 'concert';
  const event    = isEvent  ? (item.data as any) : null;
  const concert  = isConcert ? (item.data as any) : null;

  const title     = isEvent ? event.title : concert.title;
  const date      = isEvent ? event.starts_at : concert.scheduled_at;
  const city      = isEvent ? event.venue_city : concert.venue_city;
  const desc      = isEvent ? event.description : concert.description;
  const thumbUrl  = isEvent
    ? (event.thumbnail_url ?? event.banner_url)
    : (concert.thumbnail_url ?? concert.banner_url);
  const videoUrl  = isEvent ? event.video_url : concert.video_url;

  const isFree = isEvent ? event.access_type === 'free' : concert.access_type === 'free';
  const isLive = isConcert && concert.status === 'live';
  const price  = isEvent ? event.ticket_price : concert.ticket_price;

  const accent   = isEvent ? (EVENT_COLORS[event.event_type] ?? colors.primary) : colors.primary;
  const cardIcon = isEvent ? (EVENT_ICONS[event.event_type]  ?? 'calendar') : 'music';
  const typeLabel = isEvent ? event.event_type?.toUpperCase() : 'CONCERT';

  // ── State social branché sur l'API ────────────────────────────────────────
  const [liked,        setLiked]        = useState(item.data?.user_reaction === 'like');
  const [likeCount,    setLikeCount]    = useState(item.data?.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(item.data?.comment_count ?? 0);
  const [shareCount,   setShareCount]   = useState(item.data?.share_count ?? 0);
  const [saved,        setSaved]        = useState(
    isEvent ? saveService.isEventSaved(item.id) : saveService.isConcertSaved(item.id),
  );
  const [cardMenuOpen,   setCardMenuOpen]   = useState(false);
  const [reportVisible,  setReportVisible]  = useState(false);
  const refType = isEvent ? 'event' : 'concert';
  const [hasReminder, setHasReminder] = useState(
    () => feedPreferenceService.hasReminder(item.id, refType)
  );

  const handleHide = async () => {
    await feedPreferenceService.toggleHide(item.id, refType);
    // La carte disparaît car le feed est rechargé au focus suivant.
    // Pour un retrait immédiat on passe par un callback externe si besoin.
    Alert.alert(
      'Masqué',
      'Ce contenu n\'apparaîtra plus dans votre fil.',
      [{ text: 'OK' }],
    );
  };

  const handleRemind = async () => {
    const eventDate: string = isEvent
      ? (item.data as Event).starts_at
      : (item.data as Concert).scheduled_at;
    const title: string = item.data?.title ?? '';
    const active = await feedPreferenceService.toggleReminder(item.id, refType, title, eventDate);
    setHasReminder(active);
    Alert.alert(
      active ? 'Rappel activé' : 'Rappel annulé',
      active
        ? `On vous rappellera 1h avant : "${title}"`
        : 'Le rappel a été supprimé.',
      [{ text: 'OK' }],
    );
  };

  // commentCount mis à jour via onCommentCountChange passé au CommentsBottomSheet

  // ── "Voir plus" description ───────────────────────────────────────────────
  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncated, setDescTruncated] = useState(false);

  const heartScale = useSharedValue(1);
  const saveScale  = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const saveStyle  = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value  }] }));

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 6 }), withSpring(1));
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c: number) => newLiked ? c + 1 : Math.max(0, c - 1));
    const payload = isEvent
      ? { reaction_type: 'like' as const, event_id: item.id }
      : { reaction_type: 'like' as const, concert_id: item.id };
    socialService.toggleReaction(payload).catch(() => {
      setLiked(!newLiked);
      setLikeCount((c: number) => newLiked ? Math.max(0, c - 1) : c + 1);
    });
  };

  const handleSave = () => {
    saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    const newSaved = !saved;
    setSaved(newSaved);
    if (isEvent) {
      newSaved ? saveService.saveEvent(item.data as Event) : saveService.unsaveEvent(item.id);
    } else {
      newSaved ? saveService.saveConcert(item.data as Concert) : saveService.unsaveConcert(item.id);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ title, message: `${title} — ${formatDate(date)} à ${city ?? 'FoliX'}\n\nVia FoliX` });
      setShareCount((c: number) => c + 1);
      const payload = isEvent
        ? { platform: 'native', event_id: item.id }
        : { platform: 'native', concert_id: item.id };
      socialService.share(payload).catch(() => { setShareCount((c: number) => Math.max(0, c - 1)); });
    } catch { /* annulé */ }
  };

  const author       = isEvent ? event?.organizer : concert?.artist ?? null;
  const authorId     = author?.id ?? null;
  const authorName   = author?.display_name ?? author?.username ?? 'FoliX';
  const authorAvatar = author?.avatar_url ?? null;
  const authorInit   = authorName[0]?.toUpperCase() ?? 'F';
  const isOwnContent = !!(currentUserId && authorId && currentUserId === authorId);
  const showFollowBtn = !isOwnContent && !!authorId;
  const publishedAt  = isEvent ? (event?.published_at ?? event?.created_at) : (concert?.published_at ?? concert?.created_at);
  const timeAgo = (() => {
    const diff = (Date.now() - new Date(publishedAt).getTime()) / 1000;
    if (diff < 60)   return 'À l\'instant';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return `${Math.floor(diff / 86400)} j`;
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.card, { backgroundColor: colors.surface }]}>

      {/* ── Header auteur ─────────────────────────────────────────────── */}
      <View style={s.cardHeader}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }} activeOpacity={0.7} onPress={onAuthorPress}>
          <AvatarWithBadge
            avatarUrl={authorAvatar}
            initials={authorInit}
            size={40}
            accentColor={colors.primary}
            isVerified={!!author?.is_verified}
            isOnline={(author as any)?.is_online ?? undefined}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.cardAuthorName, { color: colors.textPrimary }]} numberOfLines={1}>
              {authorName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[s.cardTimeAgo, { color: colors.textTertiary }]}>{timeAgo}</Text>
              <Text style={[s.cardTimeAgo, { color: colors.textTertiary }]}>·</Text>
              <Icon name="globe" size={11} color={colors.textTertiary} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Bouton Suivre — masqué si déjà suivi */}
        {showFollowBtn && !isFollowing && (
          <TouchableOpacity
            style={[s.followBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={onToggleFollow}
            activeOpacity={0.7}
          >
            <Icon name="user-plus" size={13} color="#fff" />
            <Text style={[s.followBtnText, { color: '#fff' }]}>Suivre</Text>
          </TouchableOpacity>
        )}

        {/* Badge type */}
        <View style={[s.badge, { backgroundColor: accent + 'DD' }]}>
          <Icon name={cardIcon} size={9} color="#fff" />
          <Text style={[s.badgeText, { color: '#fff' }]}>{typeLabel}</Text>
        </View>

        {/* 3 points */}
        <TouchableOpacity
          style={{ padding: 6, marginLeft: 4 }}
          onPress={() => setCardMenuOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="more-vertical" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* ── Menu contextuel ─────────────────────────────────────────────── */}
      {cardMenuOpen && (
        <CardContextMenu
          item={item}
          colors={colors}
          isSaved={saved}
          isFollowing={isFollowing}
          isOwnContent={isOwnContent}
          authorName={authorName}
          onClose={() => setCardMenuOpen(false)}
          onSave={handleSave}
          onShare={handleShare}
          onFollow={onToggleFollow}
          onReport={() => { setCardMenuOpen(false); setReportVisible(true); }}
          onHide={handleHide}
          onRemind={handleRemind}
          hasReminder={hasReminder}
        />
      )}

      {/* ── Modal signalement ───────────────────────────────────────── */}
      <ReportModal
        visible={reportVisible}
        contentType={isEvent ? 'event' : 'concert'}
        contentId={item.id}
        onClose={() => setReportVisible(false)}
      />

      {/* ── Titre + description ──────────────────────────────────────── */}
      <View style={s.cardBody}>
        <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
        </TouchableOpacity>
        {desc ? (
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <Text
              style={[s.cardDesc, { color: colors.textSecondary }]}
              numberOfLines={descExpanded ? undefined : 3}
              onTextLayout={(e) => {
                if (!descExpanded && e.nativeEvent.lines.length > 3) setDescTruncated(true);
              }}
            >
              {desc}
            </Text>
            {descTruncated && !descExpanded && (
              <TouchableOpacity onPress={() => setDescExpanded(true)} activeOpacity={0.7}>
                <Text style={[s.seeMoreText, { color: colors.primary }]}>Lire la suite</Text>
              </TouchableOpacity>
            )}
            {descExpanded && (
              <TouchableOpacity onPress={() => setDescExpanded(false)} activeOpacity={0.7}>
                <Text style={[s.seeMoreText, { color: colors.primary }]}>Voir moins</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Banner : vidéo pub autoplay ou image ────────────────────── */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.92}>
        <View style={s.cardBanner}>
          {videoUrl ? (
            <CardVideo uri={videoUrl} playing={isActive} />
          ) : thumbUrl ? (
            <Image source={{ uri: thumbUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[accent + 'CC', accent + '55']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          {!thumbUrl && !videoUrl && (
            <Icon name={cardIcon} size={64} color="rgba(255,255,255,0.25)" />
          )}

          {/* Indicateur vidéo muette */}
          {videoUrl && (
            <View style={{ position: 'absolute', top: 10, right: 10,
              backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14,
              paddingHorizontal: 8, paddingVertical: 4,
              flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="volume-x" size={11} color="#fff" />
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>Muet</Text>
            </View>
          )}

          {/* Badges live / gratuit */}
          <View style={s.badgesRow}>
            {isLive && (
              <View style={[s.badge, { backgroundColor: colors.liveTag }]}>
                <View style={[s.badgeDot, { backgroundColor: '#fff' }]} />
                <Text style={[s.badgeText, { color: '#fff' }]}>LIVE</Text>
              </View>
            )}
            {isFree && (
              <View style={[s.badge, { backgroundColor: colors.accentGreen }]}>
                <Text style={[s.badgeText, { color: '#fff' }]}>GRATUIT</Text>
              </View>
            )}
          </View>

          {/* Gradient + meta date/lieu en bas du banner */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.72)']}
            style={[StyleSheet.absoluteFill, { top: '40%' }]}
            pointerEvents="none"
          />
          <View style={s.bannerOverlay}>
            <View style={s.bannerMeta}>
              <Icon name="calendar" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={s.bannerMetaText}>{formatDate(date)}</Text>
              {city ? (
                <>
                  <Text style={s.bannerMetaDot}>·</Text>
                  <Icon name="map-pin" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={s.bannerMetaText}>{city}</Text>
                </>
              ) : null}
              {!isFree && price != null && price > 0 ? (
                <>
                  <Text style={s.bannerMetaDot}>·</Text>
                  <Text style={[s.bannerMetaText, { fontWeight: '800', color: colors.accentOrange }]}>
                    {price} €
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* ── Compteurs engagement ──────────────────────────────────── */}
      {(likeCount > 0 || commentCount > 0 || shareCount > 0) && (
        <View style={[s.likeCountRow, { borderBottomColor: colors.divider }]}>
          {likeCount > 0 && (
            <View style={s.countChip}>
              <View style={[s.likeCountIcon, { backgroundColor: '#E0389A' }]}>
                <Icon name="heart" size={10} color="#fff" />
              </View>
              <Text style={[s.likeCountText, { color: colors.textTertiary }]}>{likeCount}</Text>
            </View>
          )}
          {commentCount > 0 && (
            <Text style={[s.likeCountText, { color: colors.textTertiary }]}>
              {commentCount} commentaire{commentCount > 1 ? 's' : ''}
            </Text>
          )}
          {shareCount > 0 && (
            <Text style={[s.likeCountText, { color: colors.textTertiary }]}>
              {shareCount} partage{shareCount > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      )}

      {/* ── Barre sociale ────────────────────────────────────────────── */}
      <View style={[s.socialBar, { borderTopColor: colors.divider, backgroundColor: colors.surface }]}>
          <TouchableOpacity style={s.socialBtn} onPress={handleLike} activeOpacity={0.8}>
            <Animated.View style={heartStyle}>
              <Icon name="heart" size={18} color={liked ? '#E0389A' : colors.textTertiary} />
            </Animated.View>
            <Text style={[s.socialBtnText, { color: liked ? '#E0389A' : colors.textTertiary }]}>
              {likeCount > 0 ? `${likeCount}` : 'J\'aime'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.socialBtn} onPress={() => onComment(delta => setCommentCount(v => v + delta))} activeOpacity={0.8}>
            <Icon name="message-circle" size={18} color={colors.textTertiary} />
            <Text style={[s.socialBtnText, { color: colors.textTertiary }]}>
              {commentCount > 0 ? `${commentCount}` : 'Commenter'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.socialBtn} onPress={handleShare} activeOpacity={0.8}>
            <Icon name="share-2" size={18} color={colors.textTertiary} />
            <Text style={[s.socialBtnText, { color: colors.textTertiary }]}>
              {shareCount > 0 ? `${shareCount}` : 'Partager'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.8}>
            <Animated.View style={saveStyle}>
              <Icon name="bookmark" size={18} color={saved ? colors.primary : colors.textTertiary} />
            </Animated.View>
          </TouchableOpacity>
        </View>

      {/* ── Séparateur bas ────────────────────────────────────────────── */}
      <View style={{ height: 8, backgroundColor: colors.backgroundSecondary }} />
    </View>
  );
});

const { width: SW, height: SH } = Dimensions.get('window');

const mnu = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:   { fontSize: 22, fontWeight: '800' },
  closeBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  profileCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  profileAvatar: { width: 52, height: 52, borderRadius: 26 },
  profileName:   { fontSize: 16, fontWeight: '700' },
  profileSub:    { fontSize: 13, marginTop: 2 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10 },
  gridItem:      { width: (SW - 44) / 3, borderRadius: 14, padding: 14, alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth },
  gridIcon:      { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gridLabel:     { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  listItem:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  listIcon:      { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  listLabel:     { fontSize: 15, fontWeight: '700' },
  listSub:       { fontSize: 12, marginTop: 2 },
});
