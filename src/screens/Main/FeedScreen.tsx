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
  withSpring, withSequence, withTiming, withRepeat,
  interpolate, runOnJS,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonBox, SkeletonFeed, SkeletonFeedScreen, PeopleSuggestions, AvatarWithBadge, ReportModal, CommentsBottomSheet, PostCard, ExpandableText } from '../../components/common';
import type { UserPublic } from '../../types/user';
import { StoryBar } from '../../components/story';
import { eventService, concertService, socialService, authService, searchService, userService, reelService, feedPreferenceService, postService } from '../../services';
import { favoriteService } from '../../services/favoriteService';
import { liveService } from '../../services/liveService';
import type { LiveStream } from '../../services/liveService';
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
import { feedStyles as s, fS } from '../../styles/FeedScreen.styles';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ── Types locaux ──────────────────────────────────────────────────────────────

type FeedFilter = 'all' | 'events' | 'concerts' | 'posts';

interface FeedItem {
  kind:    'event' | 'concert' | 'reel' | 'reel_row' | 'post' | 'suggestions' | 'communities';
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

const FeedHeaderBadges: React.FC<{
  onMessages: () => void;
  onNotifs: () => void;
  onMenu: () => void;
  onFavorites: () => void;
  onLive: () => void;
  colors: AppColors;
}> = React.memo(({ onMessages, onNotifs, onFavorites, onLive, colors }) => {
  const { unreadMessages, unreadActivity, unreadNotifications } = useWs();
  const totalNotifs = unreadNotifications + unreadActivity;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {/* Messages */}
      <TouchableOpacity style={[fS.actionIcon, { flex: 1, backgroundColor: colors.backgroundSecondary }]} onPress={onMessages} activeOpacity={0.8}>
        <Icon name="send" size={18} color={colors.textPrimary} />
        {unreadMessages > 0 && (
          <View style={badgeS.badge}>
            <Text style={badgeS.badgeText}>{unreadMessages > 99 ? '99+' : unreadMessages}</Text>
          </View>
        )}
      </TouchableOpacity>
      {/* Notifications */}
      <TouchableOpacity style={[fS.actionIcon, { flex: 1, backgroundColor: colors.backgroundSecondary }]} onPress={onNotifs} activeOpacity={0.8}>
        <Icon name="bell" size={18} color={colors.textPrimary} />
        {totalNotifs > 0 && (
          <View style={badgeS.badge}>
            <Text style={badgeS.badgeText}>{totalNotifs > 99 ? '99+' : totalNotifs}</Text>
          </View>
        )}
      </TouchableOpacity>
      {/* Favoris */}
      <TouchableOpacity style={[fS.actionIcon, { flex: 1, backgroundColor: colors.backgroundSecondary }]} onPress={onFavorites} activeOpacity={0.8}>
        <Icon name="bookmark" size={18} color={colors.textPrimary} />
      </TouchableOpacity>
      {/* Live */}
      <TouchableOpacity style={[fS.actionIcon, { flex: 1, backgroundColor: '#F0365A18' }]} onPress={onLive} activeOpacity={0.8}>
        <Icon name="radio" size={18} color="#F0365A" />
      </TouchableOpacity>
    </View>
  );
});

// ── FeedScreen ────────────────────────────────────────────────────────────────

export const FeedScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { addListener, removeListener, lastLiveStarted, lastLiveEnded, lastLiveViewersUpdated } = useWs();
  const { currentUser } = useUser();

  const [filter,     setFilter]     = useState<FeedFilter>('all');
  const [items,      setItems]      = useState<FeedItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [filterDropOpen, setFilterDropOpen] = useState(false);
  const [fabOpen,        setFabOpen]        = useState(false);
  const [liveConcerts,    setLiveConcerts]    = useState<Concert[]>([]);
  const [spontLives,      setSpontLives]      = useState<LiveStream[]>([]);
  const [trendingComm,    setTrendingComm]    = useState<CommunityData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBarWidth = useSharedValue(0);
  const searchBarOpacity = useSharedValue(0);
  const liveDotOpacity = useSharedValue(1);
  const searchInputRef = useRef<any>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reel actif dans le feed (autoplay)
  const [activeReelId,      setActiveReelId]      = useState<string | null>(null);
  const [activeCardId,      setActiveCardId]       = useState<string | null>(null);
  const [feedFocused,       setFeedFocused]        = useState(true);
  const [feedScrollEnabled, setFeedScrollEnabled]  = useState(true);

  const feedViewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onFeedViewableChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setActiveReelId(null); // reels gérés en rangée horizontale, pas d'autoplay individuel
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

  const liveDotStyle = useAnimatedStyle(() => ({ opacity: liveDotOpacity.value }));

  useEffect(() => {
    const blink = () => {
      liveDotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.1, { duration: 500 }),
          withTiming(1,   { duration: 500 }),
        ),
        -1,
        true,
      );
    };
    const t = setTimeout(blink, 100);
    return () => clearTimeout(t);
  }, [liveDotOpacity]);

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
        const [feedResult, reelsResult, postsResult, commResult] = await Promise.all([
          searchService.getFeed(1, 50).catch(() => ({ items: [] })),
          reelService.getFeed().catch(() => ({ items: [], has_more: false, page: 1 })),
          postService.getFeed(1, 30).catch(() => [] as Post[]),
          communityService.list(1, 8).catch(() => []),
        ]);
        const commData: CommunityData[] = Array.isArray(commResult)
          ? commResult.slice(0, 5)
          : Array.isArray((commResult as any)?.items)
            ? (commResult as any).items.slice(0, 5)
            : [];
        setTrendingComm(commData);
        if (__DEV__) console.log('[Feed] commData:', commData.length, JSON.stringify(commData).slice(0, 200));
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

        // Extraire tous les reels et ne garder que les non-reels dans le flux principal
        const allReels   = filtered.filter(i => i.kind === 'reel');
        const nonReels   = filtered.filter(i => i.kind !== 'reel');

        // Découper les reels en blocs de 5 max pour les rangées horizontales
        const REELS_PER_ROW = 5;
        const reelRows: FeedItem[] = [];
        for (let r = 0; r < allReels.length; r += REELS_PER_ROW) {
          const chunk = allReels.slice(r, r + REELS_PER_ROW);
          reelRows.push({
            kind: 'reel_row',
            id: `__reel_row__${r}`,
            data: chunk.map(ri => ri.data),
          });
        }

        // Injecter suggestions, communities et rangées de reels à intervalles réguliers
        const SUGGEST_EVERY  = 8;
        const COMM_EVERY     = 12;
        const REEL_ROW_EVERY = 5; // une rangée de reels toutes les 5 cartes
        const result: FeedItem[] = [];
        let suggestCount = 0;
        let commCount    = 0;
        let reelRowIdx   = 0;

        nonReels.forEach((item, i) => {
          result.push(item);

          // Rangée de reels : première à pos 3, puis toutes les REEL_ROW_EVERY
          if (reelRowIdx < reelRows.length && (i === 2 || (i > 2 && (i - 2) % REEL_ROW_EVERY === 0))) {
            result.push(reelRows[reelRowIdx]);
            reelRowIdx += 1;
          }

          // Suggestions : première à pos 5, puis toutes les SUGGEST_EVERY
          if (i === 4 || (i > 4 && (i - 4) % SUGGEST_EVERY === 0)) {
            suggestCount += 1;
            result.push({ kind: 'suggestions', id: `__suggestions__${suggestCount}`, data: null });
          }

          // Communities : première à pos 10, puis toutes les COMM_EVERY
          if (commData.length > 0 && (i === 9 || (i > 9 && (i - 9) % COMM_EVERY === 0))) {
            commCount += 1;
            result.push({ kind: 'communities', id: `__communities__${commCount}`, data: commData });
          }
        });

        // Ajouter les rangées de reels restantes à la fin
        while (reelRowIdx < reelRows.length) {
          result.push(reelRows[reelRowIdx]);
          reelRowIdx += 1;
        }

        setItems(result);
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
        if (f === 'posts') {
          const posts = await postService.getFeed(1, 50).catch(() => [] as Post[]);
          (Array.isArray(posts) ? posts : []).forEach((p: Post) => results.push({ kind: 'post', id: p.id, data: p }));
        }
        if (f !== 'posts') {
          results.sort((a, b) => {
            const dateA = a.kind === 'event'
              ? (a.data as Event).starts_at
              : (a.data as Concert).scheduled_at;
            const dateB = b.kind === 'event'
              ? (b.data as Event).starts_at
              : (b.data as Concert).scheduled_at;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
          });
        }
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

  // Charger les lives en direct
  const loadLive = useCallback(async () => {
    try {
      const [concerts, spont] = await Promise.all([
        concertService.getLive(),
        liveService.getLives(),
      ]);
      setLiveConcerts(Array.isArray(concerts) ? concerts : []);
      setSpontLives(Array.isArray(spont) ? spont : []);
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => {
    loadLive();
  }, []);

  // WS : nouveau live spontané démarré
  useEffect(() => {
    if (!lastLiveStarted) return;
    setSpontLives(prev => {
      if (prev.some(l => l.id === lastLiveStarted.live.id)) return prev;
      return [lastLiveStarted.live as LiveStream, ...prev];
    });
  }, [lastLiveStarted]);

  // WS : live spontané terminé
  useEffect(() => {
    if (!lastLiveEnded) return;
    setSpontLives(prev => prev.filter(l => l.id !== lastLiveEnded));
  }, [lastLiveEnded]);

  // WS : viewers mis à jour
  useEffect(() => {
    if (!lastLiveViewersUpdated) return;
    setSpontLives(prev => prev.map(l =>
      l.id === lastLiveViewersUpdated.live_id
        ? { ...l, current_viewers: lastLiveViewersUpdated.current_viewers }
        : l
    ));
  }, [lastLiveViewersUpdated]);

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
    if (item.kind === 'communities') {
      const comms: CommunityData[] = Array.isArray(item.data) ? item.data : [];
      if (!comms.length) return null;
      const COMM_GRADS: [string, string][] = [
        ['#7B3FF2','#E0389A'],['#0EA5E9','#6366F1'],
        ['#10B981','#0EA5E9'],['#F59E0B','#EF4444'],
        ['#EC4899','#8B5CF6'],['#14B8A6','#3B82F6'],
      ];
      const gradFor = (name: string): [string, string] =>
        COMM_GRADS[name.charCodeAt(0) % COMM_GRADS.length];
      const fmtM = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
      // Mêmes dimensions que PeopleSuggestions
      const SW       = Dimensions.get('window').width;
      const CARD_W   = SW * 0.45;
      const COVER_H  = CARD_W * 0.5;
      const AVT_SZ   = CARD_W * 0.4;
      return (
        <View style={[cs.wrap, { borderTopColor: colors.divider, borderBottomColor: colors.divider, backgroundColor: colors.background }]}>
          {/* Header identique aux suggestions */}
          <View style={cs.header}>
            <View>
              <Text style={[cs.title, { color: colors.textPrimary }]}>Ta tribu t'attend 🤝</Text>
              <Text style={[cs.subtitle, { color: colors.textTertiary }]}>Des espaces faits pour toi, rejoins-les</Text>
            </View>
            <TouchableOpacity onPress={() => nav.navigate('Communities' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[cs.seeAll, { color: colors.primary }]}>Explorer</Text>
            </TouchableOpacity>
          </View>
          {/* Scroll horizontal identique */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.list}>
            {comms.map(comm => {
              const grad    = gradFor(comm.name);
              const initial = (comm.name || '?')[0].toUpperCase();
              return (
                <TouchableOpacity
                  key={comm.id}
                  style={[cs.card, { width: CARD_W, backgroundColor: colors.surface, borderColor: colors.divider }]}
                  activeOpacity={0.88}
                  onPress={() => nav.navigate('CommunityDetail' as any, { communityId: comm.id })}
                >
                  {/* Cover — bannière ou gradient */}
                  {comm.banner_url
                    ? <Image source={{ uri: comm.banner_url }} style={[cs.cover, { height: COVER_H }]} resizeMode="cover" />
                    : <LinearGradient colors={grad} style={[cs.cover, { height: COVER_H }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                  }
                  {/* Badges privé / vérifié */}
                  <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 4 }}>
                    {comm.is_private  && <View style={cs.badge}><Icon name="lock"  size={9}  color="#fff" /></View>}
                    {comm.is_verified && <View style={[cs.badge, { backgroundColor: '#1D9BF0' }]}><Icon name="check" size={10} color="#fff" /></View>}
                  </View>
                  {/* Avatar chevauchant — même style que PeopleSuggestions */}
                  <View style={[cs.avatarWrap, { width: AVT_SZ + 4, height: AVT_SZ + 4, borderRadius: (AVT_SZ + 4) / 2, borderColor: colors.background, marginTop: -(AVT_SZ / 2) }]}>
                    {comm.avatar_url
                      ? <Image source={{ uri: comm.avatar_url }} style={{ width: AVT_SZ, height: AVT_SZ, borderRadius: AVT_SZ / 2 }} />
                      : <LinearGradient colors={grad} style={{ width: AVT_SZ, height: AVT_SZ, borderRadius: AVT_SZ / 2, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: AVT_SZ * 0.38 }}>{initial}</Text>
                        </LinearGradient>
                    }
                  </View>
                  {/* Body */}
                  <View style={[cs.cardBody, { paddingTop: AVT_SZ / 2 + 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <Text style={[cs.name, { color: colors.textPrimary }]} numberOfLines={1}>{comm.name}</Text>
                    </View>
                    <Text style={[cs.handle, { color: colors.textTertiary }]} numberOfLines={1}>
                      <Icon name="users" size={10} color={colors.textTertiary} /> {fmtM(comm.members_count ?? 0)} membres
                    </Text>
                    {/* Bouton rejoindre — même style que Suivre */}
                    <TouchableOpacity
                      style={[cs.joinBtn, { backgroundColor: colors.primary }]}
                      activeOpacity={0.8}
                      onPress={() => nav.navigate('CommunityDetail' as any, { communityId: comm.id })}
                    >
                      <Icon name="users" size={14} color="#fff" />
                      <Text style={cs.joinText}>Nous rejoindre</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    }
    if (item.kind === 'reel_row') {
      return (
        <ReelRowCard
          reels={item.data}
          colors={colors}
          onPressReel={(reelId) => (nav as any).navigate('Reels', { initialReelId: reelId })}
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
  }, [colors, activeCardId, feedFocused, currentUser?.id, followingSet, handleToggleFollow, handlePostDeleted, openComments, nav, pickSuggestions, suggestLoading, loadSuggestions]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const displayName = currentUser?.display_name ?? currentUser?.first_name ?? currentUser?.username ?? '';
  const initials = displayName ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?';

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: colors.surface }]}>
        <View style={s.headerRow}>
          {/* Gauche : avatar — masqué si recherche ouverte */}
          {!searchOpen && (
            !currentUser ? (
              <View style={[s.headerLeft, { pointerEvents: 'none', flex: 0 }]}>
                <SkeletonBox width={34} height={34} borderRadius={17} />
              </View>
            ) : (
              <TouchableOpacity
                style={[s.headerLeft, { flex: 0, marginRight: 0 }]}
                activeOpacity={0.7}
                onPress={() => currentUser.id && (nav as any).navigate('UserProfile', { userId: currentUser.id })}
              >
                {currentUser.avatar_url ? (
                  <Image source={{ uri: currentUser.avatar_url }} style={s.avatar} />
                ) : (
                  <View style={[s.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
                    <Text style={[s.avatarText, { color: colors.primary }]}>{initials}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          )}

          {/* Centre : FoliX — position absolue pour rester centré quoi qu'il arrive */}
          {!searchOpen && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: 1.5, color: colors.primary }}>
                Foli<Text style={{ color: colors.textPrimary }}>X</Text>
              </Text>
            </View>
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

          {/* Droite : search + menu */}
          <View style={s.headerRight}>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: searchOpen ? colors.primary + '22' : colors.backgroundSecondary }]}
              onPress={searchOpen ? closeSearch : openSearch}
            >
              <Icon name={searchOpen ? 'x' : 'search'} size={20} color={searchOpen ? colors.primary : colors.textPrimary} />
            </TouchableOpacity>
            {!searchOpen && (
              <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={openMenu}>
                <Icon name="menu" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
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

        {/* ── Barre filtres + actions ────────────────────────────────────── */}
        {!searchOpen && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6 }}>

            {/* Bouton filtre — occupe son espace, ouvre dropdown */}
            <TouchableOpacity
              onPress={() => setFilterDropOpen(o => !o)}
              style={[fS.filterIcon, {
                backgroundColor: filterDropOpen || filter !== 'all' ? colors.primary + '22' : colors.backgroundSecondary,
                borderColor: filterDropOpen || filter !== 'all' ? colors.primary : 'transparent',
              }]}
              activeOpacity={0.75}
            >
              <Icon name="sliders" size={17} color={filter !== 'all' || filterDropOpen ? colors.primary : colors.textSecondary} />
              {filter !== 'all' && <View style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />}
            </TouchableOpacity>

            {/* Séparateur */}
            <View style={{ width: 1, height: 22, backgroundColor: colors.divider }} />

            {/* Messages, Notifs, Favoris, Live — occupent toute la largeur restante */}
            <FeedHeaderBadges
              onMessages={goToMessages}
              onNotifs={goToNotifs}
              onMenu={openMenu}
              onFavorites={() => nav.navigate('Favorites')}
              onLive={() => nav.navigate('GoLive')}
              colors={colors}
            />
          </View>
        )}

        {/* ── Dropdown vertical filtres ──────────────────────────────────── */}
        {!searchOpen && filterDropOpen && (
          <View style={[fS.dropdownWrap, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.textPrimary }]}>
            {([
              { key: 'all',      icon: 'grid',      label: 'Tout'        },
              { key: 'events',   icon: 'calendar',  label: 'Événements'  },
              { key: 'concerts', icon: 'music',     label: 'Concerts'    },
              { key: 'posts',    icon: 'file-text', label: 'Posts'       },
            ] as { key: FeedFilter; icon: string; label: string }[]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => { setFilter(opt.key); setFilterDropOpen(false); load(opt.key); }}
                style={[fS.dropdownItem, filter === opt.key && { backgroundColor: colors.primary + '12' }]}
                activeOpacity={0.75}
              >
                <View style={[fS.dropdownIconWrap, { backgroundColor: filter === opt.key ? colors.primary + '22' : colors.backgroundSecondary }]}>
                  <Icon name={opt.icon} size={15} color={filter === opt.key ? colors.primary : colors.textSecondary} />
                </View>
                <Text style={[fS.dropdownLabel, { color: filter === opt.key ? colors.primary : colors.textPrimary }]}>{opt.label}</Text>
                {filter === opt.key && <Icon name="check" size={14} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

      </View>

      {searchResults ? (
        /* ── Résultats de recherche ─────────────────────────────────────── */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>

          {(() => {
            const hasAny =
              (searchResults.users?.length ?? 0) > 0 ||
              (searchResults.films?.length ?? 0) > 0 ||
              (searchResults.series?.length ?? 0) > 0 ||
              (searchResults.concerts?.length ?? 0) > 0 ||
              (searchResults.events?.length ?? 0) > 0 ||
              (searchResults.reels?.length ?? 0) > 0;

            if (!hasAny) return (
              <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="search" size={24} color={colors.textTertiary} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>Aucun résultat</Text>
                <Text style={{ fontSize: 13, color: colors.textTertiary }}>pour "{searchQuery}"</Text>
              </View>
            );

            const SectionHeader = ({ icon, label, count, accent }: { icon: string; label: string; count: number; accent: string }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 }}>
                <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: accent }} />
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={14} color={accent} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.2 }}>{label}</Text>
                <View style={{ backgroundColor: accent + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>{count}</Text>
                </View>
              </View>
            );

            const Thumb = ({ uri, icon, accent }: { uri?: string | null; icon: string; accent: string }) =>
              uri ? (
                <Image source={{ uri }} style={{ width: 46, height: 46, borderRadius: 10 }} />
              ) : (
                <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={18} color={accent} />
                </View>
              );

            const Row = ({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) => (
              <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
              >
                {children}
              </TouchableOpacity>
            );

            return (
              <>
                {/* Utilisateurs */}
                {(searchResults.users?.length ?? 0) > 0 && (
                  <View>
                    <SectionHeader icon="user" label="Utilisateurs" count={searchResults.users!.length} accent="#7B3FF2" />
                    {searchResults.users!.map((u: any) => (
                      <Row key={u.id} onPress={() => (nav as any).navigate('UserProfile', { userId: u.id })}>
                        {u.avatar_url ? (
                          <Image source={{ uri: u.avatar_url }} style={{ width: 46, height: 46, borderRadius: 23 }} />
                        ) : (
                          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#7B3FF2' + '20', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 17, fontWeight: '700', color: '#7B3FF2' }}>{((u.display_name ?? u.username) as string)[0].toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{u.display_name ?? u.username}</Text>
                          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>@{u.username}</Text>
                        </View>
                        <Icon name="chevron-right" size={16} color={colors.textDisabled} />
                      </Row>
                    ))}
                  </View>
                )}

                {/* Concerts */}
                {(searchResults.concerts?.length ?? 0) > 0 && (
                  <View>
                    <SectionHeader icon="music" label="Concerts" count={searchResults.concerts.length} accent="#E0389A" />
                    {searchResults.concerts.map((c: any) => (
                      <Row key={c.id} onPress={() => (nav as any).navigate('ConcertDetail', { concertId: c.id })}>
                        <Thumb uri={c.thumbnail_url} icon="music" accent="#E0389A" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{c.title}</Text>
                          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }} numberOfLines={1}>{[c.genre, c.venue_city].filter(Boolean).join(' · ') || 'Concert'}</Text>
                        </View>
                        <Icon name="chevron-right" size={16} color={colors.textDisabled} />
                      </Row>
                    ))}
                  </View>
                )}

                {/* Événements */}
                {(searchResults.events?.length ?? 0) > 0 && (
                  <View>
                    <SectionHeader icon="calendar" label="Événements" count={searchResults.events.length} accent="#0EA5E9" />
                    {searchResults.events.map((e: any) => (
                      <Row key={e.id} onPress={() => (nav as any).navigate('EventDetail', { eventId: e.id })}>
                        <Thumb uri={e.thumbnail_url} icon="calendar" accent="#0EA5E9" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{e.title}</Text>
                          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }} numberOfLines={1}>{[e.type ?? e.event_type, e.venue_city].filter(Boolean).join(' · ')}</Text>
                        </View>
                        <Icon name="chevron-right" size={16} color={colors.textDisabled} />
                      </Row>
                    ))}
                  </View>
                )}

                {/* Reels */}
                {(searchResults.reels?.length ?? 0) > 0 && (
                  <View>
                    <SectionHeader icon="video" label="Reels" count={searchResults.reels.length} accent="#10B981" />
                    {searchResults.reels.map((r: any) => (
                      <Row key={r.id}>
                        <Thumb uri={r.thumbnail_url} icon="video" accent="#10B981" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={2}>{r.caption ?? 'Reel'}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Icon name="eye" size={11} color={colors.textTertiary} />
                            <Text style={{ fontSize: 12, color: colors.textTertiary }}>{r.view_count ?? 0} vues</Text>
                          </View>
                        </View>
                      </Row>
                    ))}
                  </View>
                )}

                {/* Films */}
                {(searchResults.films?.length ?? 0) > 0 && (
                  <View>
                    <SectionHeader icon="film" label="Films" count={searchResults.films.length} accent="#F59E0B" />
                    {searchResults.films.map((c: any) => (
                      <Row key={c.id}>
                        <Thumb uri={c.thumbnail_url} icon="film" accent="#F59E0B" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{c.title}</Text>
                          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>{c.year ?? 'Film'}</Text>
                        </View>
                      </Row>
                    ))}
                  </View>
                )}

                {/* Séries */}
                {(searchResults.series?.length ?? 0) > 0 && (
                  <View>
                    <SectionHeader icon="tv" label="Séries" count={searchResults.series.length} accent="#6366F1" />
                    {searchResults.series.map((c: any) => (
                      <Row key={c.id}>
                        <Thumb uri={c.thumbnail_url} icon="tv" accent="#6366F1" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{c.title}</Text>
                          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>Série{c.year ? ` · ${c.year}` : ''}</Text>
                        </View>
                      </Row>
                    ))}
                  </View>
                )}
              </>
            );
          })()}
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
          ItemSeparatorComponent={() => (
            <View style={{ height: 12, backgroundColor: theme.isDark ? '#0a0a0f' : '#e8e8ee' }} />
          )}
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

              {/* ── Lives spontanés ─────────────────────────────────── */}
              {spontLives.length > 0 && (
                <View style={{ marginTop: 8, marginBottom: 4 }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}
                    activeOpacity={0.7}
                    onPress={() => nav.navigate('SimpleLiveList' as any)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>En direct</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{spontLives.length}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>Voir tout</Text>
                      <Icon name="chevron-right" size={14} color={colors.primary} />
                    </View>
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                    {spontLives.map(live => {
                      const name = live.user?.display_name ?? live.user?.username ?? 'Utilisateur';
                      const initial = name[0]?.toUpperCase() ?? '?';
                      return (
                        <TouchableOpacity
                          key={live.id}
                          style={{ width: 110, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}
                          activeOpacity={0.85}
                          onPress={() => nav.navigate('SimpleLiveViewer' as any, { liveId: live.id })}
                        >
                          <View style={{ width: 110, height: 150, position: 'relative' }}>
                            <LinearGradient colors={['#1a1a2e', '#2d1b3d']} style={{ width: 110, height: 150, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: 'rgba(255,255,255,0.15)', fontSize: 40, fontWeight: '900' }}>{initial}</Text>
                            </LinearGradient>
                            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }} />
                            <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' }} />
                              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>LIVE</Text>
                            </View>
                            <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                              <Icon name="eye" size={9} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{live.current_viewers}</Text>
                            </View>
                            {live.user?.avatar_url && (
                              <Image source={{ uri: live.user.avatar_url }} style={{ position: 'absolute', bottom: 20, alignSelf: 'center', width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#fff' }} />
                            )}
                            <View style={{ position: 'absolute', bottom: 6, left: 4, right: 4, alignItems: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{name}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}



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

      {/* ── FAB Créer ──────────────────────────────────────────────────── */}
      {!searchOpen && !searchResults && (
        <>
          {/* Overlay pour fermer le menu */}
          {fabOpen && (
            <TouchableOpacity
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              activeOpacity={1}
              onPress={() => setFabOpen(false)}
            />
          )}

          {/* Options du menu FAB */}
          {fabOpen && (
            <View style={{ position: 'absolute', bottom: 85, right: 18, alignItems: 'flex-end', gap: 10 }}>
              {([
                { icon: 'film',     label: 'Reel',       color: '#E0389A', screen: 'CreateReel'    },
                { icon: 'edit-2',   label: 'Post',       color: colors.primary, screen: 'CreatePost' },
                { icon: 'music',    label: 'Concert',    color: '#7B3FF2', screen: 'CreateConcert' },
                { icon: 'calendar', label: 'Événement',  color: '#0EA5E9', screen: 'CreateEvent'   },
              ] as const).map(item => (
                <TouchableOpacity
                  key={item.label}
                  onPress={() => { setFabOpen(false); (nav as any).navigate(item.screen); }}
                  activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <View style={{ backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{item.label}</Text>
                  </View>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: item.color, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                    <Icon name={item.icon} size={18} color="#fff" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Bouton FAB principal */}
          <TouchableOpacity
            style={{ position: 'absolute', bottom: 25, right: 18, width: 52, height: 52, borderRadius: 26, backgroundColor: fabOpen ? colors.textSecondary : colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
            onPress={() => setFabOpen(o => !o)}
            activeOpacity={0.85}
          >
            <Icon name={fabOpen ? 'x' : 'edit-2'} size={22} color="#fff" />
          </TouchableOpacity>
        </>
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
                { icon: 'radio',       label: 'Lives',         color: '#F0365A', screen: 'SimpleLiveList' },
                { icon: 'music',       label: 'Concerts live', color: '#7B3FF2', screen: 'LiveList'    },
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

// ── ReelRowCard — rangée horizontale de reels (style Facebook) ───────────────

const ReelRowCard: React.FC<{
  reels: any[];
  colors: AppColors;
  onPressReel: (reelId: string) => void;
}> = React.memo(({ reels, colors, onPressReel }) => {
  const { width: SW, height: SH } = Dimensions.get('window');
  const HERO_W  = SW - 24;
  const HERO_H  = Math.round(SH * 0.78);
  const MINI_W  = Math.round(SW * 0.48);
  const MINI_H  = Math.round(MINI_W * 1.7);

  const hero  = reels[0];
  const rest  = reels.slice(1);

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const ReelThumb = ({ reel, w, h, large = false }: { reel: any; w: number; h: number; large?: boolean }) => {
    const author   = reel.author;
    const name     = author?.display_name ?? author?.username ?? '';
    const initials = name[0]?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => onPressReel(reel.id)}
        style={[rrS.thumb, { width: w, height: h }]}
      >
        {reel.thumbnail_url ? (
          <Image source={{ uri: reel.thumbnail_url }} style={[StyleSheet.absoluteFill, { borderRadius: large ? 18 : 14 }]} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, rrS.thumbPlaceholder, { borderRadius: large ? 18 : 14 }]}>
            <Icon name="film" size={large ? 48 : 28} color="rgba(255,255,255,0.18)" />
          </View>
        )}

        {/* Dégradé bas */}
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(0,0,0,0.85)']}
          style={[StyleSheet.absoluteFill, { borderRadius: large ? 18 : 14 }]}
        />

        {/* Badge REEL coin haut gauche */}
        <View style={rrS.reelBadge}>
          <Icon name="play" size={large ? 9 : 8} color="#fff" />
          <Text style={[rrS.reelBadgeTxt, { fontSize: large ? 10 : 9 }]}>REEL</Text>
        </View>

        {/* Durée coin haut droit */}
        {reel.duration_sec ? (
          <View style={rrS.durationBadge}>
            <Text style={rrS.durationTxt}>{reel.duration_sec}s</Text>
          </View>
        ) : null}

        {/* Bouton play centre */}
        <View style={rrS.playBtn} pointerEvents="none">
          <View style={[rrS.playCircle, large && rrS.playCircleLarge]}>
            <Icon name="play" size={large ? 28 : 16} color="#fff" />
          </View>
        </View>

        {/* Infos bas */}
        <View style={rrS.thumbBottom}>
          <View style={rrS.thumbAuthor}>
            {author?.avatar_url ? (
              <Image source={{ uri: author.avatar_url }} style={[rrS.thumbAvatar, large && rrS.thumbAvatarLarge]} />
            ) : (
              <View style={[rrS.thumbAvatar, large && rrS.thumbAvatarLarge, { backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: large ? 12 : 9, fontWeight: '800' }}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[rrS.thumbName, large && { fontSize: 14 }]} numberOfLines={1}>{name}</Text>
              {reel.created_at ? <Text style={rrS.thumbTime}>{timeAgo(reel.created_at)}</Text> : null}
            </View>
          </View>
          {large && reel.caption ? (
            <Text style={rrS.heroCaption} numberOfLines={2}>{reel.caption}</Text>
          ) : null}
          <View style={rrS.thumbStats}>
            <View style={rrS.statChip}>
              <Icon name="eye" size={large ? 12 : 10} color="rgba(255,255,255,0.85)" />
              <Text style={[rrS.thumbStatTxt, large && { fontSize: 12 }]}>{(reel.view_count ?? 0).toLocaleString()}</Text>
            </View>
            {(reel.like_count ?? 0) > 0 && (
              <View style={rrS.statChip}>
                <Icon name="heart" size={large ? 12 : 10} color="rgba(255,255,255,0.85)" />
                <Text style={[rrS.thumbStatTxt, large && { fontSize: 12 }]}>{reel.like_count}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[rrS.wrap, { backgroundColor: colors.surface }]}>
      {/* En-tête */}
      <View style={rrS.header}>
        <View style={rrS.headerIcon}>
          <Icon name="play-circle" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[rrS.title, { color: colors.textPrimary }]}>Reels pour toi</Text>
          <Text style={[rrS.subtitle, { color: colors.textSecondary }]}>{reels.length} nouvelle{reels.length > 1 ? 's' : ''} vidéo{reels.length > 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={[rrS.seeAllBtn, { borderColor: colors.primary + '55' }]} onPress={() => onPressReel(reels[0]?.id)}>
          <Text style={[rrS.seeAllTxt, { color: colors.primary }]}>Voir tout</Text>
          <Icon name="chevron-right" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Grande carte hero */}
      {hero ? (
        <View style={{ paddingHorizontal: 12, marginBottom: rest.length > 0 ? 12 : 0 }}>
          <ReelThumb reel={hero} w={HERO_W} h={HERO_H} large />
        </View>
      ) : null}

      {/* Rangée secondaire scrollable */}
      {rest.length > 0 ? (
        <FlatList
          data={rest}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(r) => r.id}
          contentContainerStyle={rrS.miniList}
          ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
          renderItem={({ item: reel }) => <ReelThumb reel={reel} w={MINI_W} h={MINI_H} />}
        />
      ) : null}
    </View>
  );
});

const rrS = StyleSheet.create({
  wrap:             { marginBottom: 10, paddingTop: 16, paddingBottom: 16, overflow: 'hidden' },
  header:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 14 },
  headerIcon:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  title:            { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  subtitle:         { fontSize: 12, marginTop: 1 },
  seeAllBtn:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  seeAllTxt:        { fontSize: 13, fontWeight: '700' },
  miniList:         { paddingHorizontal: 16 },

  thumb:            { borderRadius: 14, overflow: 'hidden', backgroundColor: '#111' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },

  reelBadge:        { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(123,63,242,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  reelBadgeTxt:     { color: '#fff', fontWeight: '800', letterSpacing: 0.5 },

  durationBadge:    { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  durationTxt:      { color: '#fff', fontSize: 10, fontWeight: '700' },

  playBtn:          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playBtnLarge:     {},
  playCircle:       { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
  playCircleLarge:  { width: 64, height: 64, borderRadius: 32 },

  thumbBottom:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, gap: 6 },
  thumbAuthor:      { flexDirection: 'row', alignItems: 'center', gap: 7 },
  thumbAvatar:      { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  thumbAvatarLarge: { width: 34, height: 34, borderRadius: 17 },
  thumbName:        { color: '#fff', fontSize: 12, fontWeight: '700' },
  thumbTime:        { color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 1 },
  heroCaption:      { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
  thumbStats:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  thumbStatTxt:     { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
});

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

  // null = pas encore détecté, true = portrait 9:16, false = paysage 16:9
  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Détection du ratio depuis le thumbnail uniquement
  useEffect(() => {
    if (!reel.thumbnail_url) return;
    Image.getSize(
      reel.thumbnail_url,
      (w, h) => { if (mountedRef.current) setIsPortrait(h >= w); },
      () => { if (mountedRef.current) setIsPortrait(true); },
    );
  }, [reel.thumbnail_url]);

  const thumbAspectRatio = isPortrait === false ? 16 / 9 : 1 / 0.88;

  // Animation pulse sur le bouton play (Reanimated)
  const pulseAnim = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseAnim.value }] }));
  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 700 }),
        withTiming(1.0,  { duration: 700 }),
      ),
      -1,
      false,
    );
  }, []);

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)    return 'À l\'instant';
    if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  // Phrases d'accroche tournantes
  const HOOKS = [
    'La suite va te surprendre 👀',
    'T\'as regardé jusqu\'au bout ? 🔥',
    'Ce moment est trop fort 😱',
    'Tout le monde en parle en ce moment',
    'Tu ne vas pas le regretter ✨',
    'Ce reel fait le buzz 🚀',
  ];
  const hookIdx = Math.abs(reel.id?.charCodeAt(0) ?? 0) % HOOKS.length;
  const hookText = HOOKS[hookIdx];

  return (
    <TouchableOpacity
      activeOpacity={0.96}
      onPress={onPress}
      style={[rs.card, { backgroundColor: '#000' }]}
    >
      <View style={[rs.thumbWrap, { aspectRatio: thumbAspectRatio }]}>

        {/* Thumbnail */}
        {reel.thumbnail_url ? (
          <Image
            source={{ uri: reel.thumbnail_url }}
            style={StyleSheet.absoluteFill}
            resizeMode={isPortrait === false ? 'contain' : 'cover'}
          />
        ) : (
          <View style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="film" size={40} color="rgba(255,255,255,0.18)" />
          </View>
        )}

        {/* Gradient haut → bas */}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.78)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Badge REEL */}
        <View style={rs.reelBadge}>
          <Icon name="film" size={11} color="#fff" />
          <Text style={rs.reelBadgeText}>REEL</Text>
        </View>

        {/* Auteur en haut */}
        <View style={rs.authorOverlay}>
          {author?.avatar_url ? (
            <Image source={{ uri: author.avatar_url }} style={rs.avatarSm} />
          ) : (
            <View style={[rs.avatarSm, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={rs.authorOverlayName} numberOfLines={1}>{name}</Text>
              {author?.is_verified && (
                <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={8} color="#fff" />
                </View>
              )}
            </View>
            <Text style={rs.authorOverlayTime}>{timeAgo(reel.created_at)}</Text>
          </View>
        </View>

        {/* Bouton play animé au centre */}
        <View style={rs.playCenter} pointerEvents="none">
          <Animated.View style={[rs.playRipple, pulseStyle]} />
          <View style={rs.playCircle}>
            <Icon name="play" size={28} color="#fff" />
          </View>
        </View>

        {/* Bas : accroche + caption + stats */}
        <View style={rs.bottomOverlay}>
          <View style={rs.hookWrap}>
            <Text style={rs.hookText}>{hookText}</Text>
          </View>
          {reel.caption ? (
            <Text style={rs.captionOverlay} numberOfLines={2}>{reel.caption}</Text>
          ) : null}
          <View style={rs.statsRow}>
            <View style={rs.statItem}>
              <Icon name="eye" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={rs.statTxt}>{(reel.view_count ?? 0).toLocaleString()}</Text>
            </View>
            <View style={rs.statItem}>
              <Icon name="heart" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={rs.statTxt}>{reel.like_count ?? 0}</Text>
            </View>
            {reel.duration_sec ? (
              <View style={rs.statItem}>
                <Icon name="clock" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={rs.statTxt}>{reel.duration_sec}s</Text>
              </View>
            ) : null}
            <View style={rs.ctaBtn}>
              <Text style={rs.ctaTxt}>Voir le reel</Text>
              <Icon name="arrow-right" size={13} color="#fff" />
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── Styles Communities — miroir exact de PeopleSuggestions ───────────────────
const cs = StyleSheet.create({
  wrap:      { paddingVertical: 14, marginBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title:     { fontSize: 16, fontWeight: '800' },
  subtitle:  { fontSize: 11, marginTop: 2 },
  seeAll:    { fontSize: 13, fontWeight: '700' },
  list:      { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  card:      { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover:     { width: '100%' },
  badge:     { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarWrap:{ borderWidth: 3, overflow: 'hidden', alignSelf: 'center' },
  cardBody:  { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, gap: 4 },
  name:      { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  handle:    { fontSize: 11, textAlign: 'center' },
  joinBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, borderRadius: 8, paddingVertical: 10, width: '100%' },
  joinText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
});

const rs = StyleSheet.create({
  card:     { marginBottom: 10, overflow: 'hidden', borderRadius: 14 },
  thumbWrap:{ width: '100%', overflow: 'hidden' },

  // Badge REEL
  reelBadge:     { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  reelBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Auteur en overlay haut
  authorOverlay:     { position: 'absolute', top: 40, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarSm:          { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  authorOverlayName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  authorOverlayTime: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 },
  muteBtnOverlay:    { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },

  // Bas overlay
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, gap: 6 },
  hookWrap:  { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  hookText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  captionOverlay: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },

  // Stats + CTA
  statsRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTxt:   { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  ctaBtn:    { marginLeft: 'auto' as any, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  ctaTxt:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Bouton play animé
  playCenter:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playRipple:  { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' },
  playCircle:  { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', paddingLeft: 4 },
});

const hk = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderLeftWidth: 3 },
  icon: { fontSize: 16 },
  text: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
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

  // ── Phrase d'accroche psychologique ──────────────────────────────────────
  const hookPhrase = (() => {
    const likes     = item.data?.like_count ?? 0;
    const comments  = item.data?.comment_count ?? 0;
    const daysUntil = date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null;
    const eventType = isEvent ? event.event_type : 'concert';
    const seed      = (item.id?.charCodeAt(0) ?? 0) + (item.id?.charCodeAt(2) ?? 0);
    const pick      = (arr: { icon: string; text: string; color: string }[]) => arr[seed % arr.length];

    // Urgence temporelle — priorité absolue
    if (daysUntil !== null && daysUntil === 0)
      return pick([
        { icon: '⏳', text: 'C\'est aujourd\'hui — il est encore temps de rejoindre !',      color: '#FF3B30' },
        { icon: '🚨', text: 'Dernier appel — ça commence aujourd\'hui, fonce !',              color: '#FF3B30' },
      ]);
    if (daysUntil !== null && daysUntil <= 2)
      return pick([
        { icon: '🔥', text: `Demain c\'est trop tard — il reste ${daysUntil} jour${daysUntil > 1 ? 's' : ''}`, color: '#FF7A2F' },
        { icon: '⌛', text: 'Les places fondent — ne te retrouve pas à regarder les stories des autres', color: '#FF7A2F' },
      ]);
    if (daysUntil !== null && daysUntil <= 7)
      return pick([
        { icon: '📅', text: 'Cette semaine seulement — une occasion rare à ne pas laisser filer', color: '#F59E0B' },
        { icon: '👀', text: 'Dans quelques jours c\'est déjà fini — tu y seras ?',             color: '#F59E0B' },
      ]);

    // Validation sociale forte
    if (likes >= 500)
      return { icon: '🤩', text: `${likes.toLocaleString('fr')} personnes adorent déjà — tu attends quoi ?`, color: '#E0389A' };
    if (likes >= 100)
      return { icon: '❤️', text: 'Des centaines de personnes ont validé cet event — c\'est bon signe', color: '#E0389A' };
    if (comments >= 50)
      return { icon: '💬', text: 'Tout le monde en parle — rejoins la conversation avant que ça soit fini', color: '#7B3FF2' };

    // Gratuité
    if (isFree)
      return pick([
        { icon: '🎁', text: 'C\'est entièrement gratuit — aucune raison de ne pas y aller',  color: '#10B981' },
        { icon: '🆓', text: 'Zéro euro, 100% de bonne ambiance — c\'est cadeau',              color: '#10B981' },
      ]);

    // ── Par catégorie ────────────────────────────────────────────────────────

    if (isConcert || eventType === 'concert')
      return pick([
        { icon: '🎶', text: 'La musique live crée des frissons qu\'aucun stream ne peut reproduire',    color: '#7B3FF2' },
        { icon: '🎸', text: 'L\'ambiance d\'un concert en vrai, ça ne s\'explique pas — ça se ressent', color: '#FF7A2F' },
        { icon: '🎤', text: 'Les artistes donnent tout sur scène — sois là pour le vivre',             color: '#E0389A' },
        { icon: '🎵', text: 'Une nuit musicale dont tu vas parler pendant longtemps',                  color: '#7B3FF2' },
        { icon: '🔊', text: 'Sentir les basses dans ta poitrine — ça vaut tous les Spotify du monde',  color: '#6366F1' },
      ]);

    if (eventType === 'festival')
      return pick([
        { icon: '🎪', text: 'Un festival, c\'est une autre vie pendant quelques heures — vis-la',      color: '#FF7A2F' },
        { icon: '🌟', text: 'Les meilleurs souvenirs se créent dans des moments exactement comme ça',  color: '#F59E0B' },
        { icon: '🎠', text: 'Tu raconteras encore cette soirée dans dix ans — sois-y',                 color: '#E0389A' },
        { icon: '🌈', text: 'Un festival, c\'est la vie dans tout son éclat — ne rate pas ça',         color: '#FF7A2F' },
      ]);

    if (eventType === 'birthday')
      return pick([
        { icon: '🎂', text: 'Un anniversaire ça ne se fête qu\'une fois par an — rends ça inoubliable', color: '#E0389A' },
        { icon: '🥂', text: 'Les meilleures soirées commencent exactement comme ça',                    color: '#7B3FF2' },
        { icon: '🎉', text: 'La bonne humeur est contagieuse — et cette soirée en est pleine',          color: '#FF7A2F' },
        { icon: '✨', text: 'Parce que certaines nuits méritent vraiment d\'être célébrées ensemble',   color: '#E0389A' },
        { icon: '🎈', text: 'Il n\'y a pas d\'âge pour passer la meilleure soirée de l\'année',        color: '#F59E0B' },
      ]);

    if (eventType === 'sport')
      return pick([
        { icon: '⚡', text: 'L\'énergie d\'un stade en feu — ça te traverse de la tête aux pieds',      color: '#3B82F6' },
        { icon: '🏆', text: 'Sois là quand ça se passe — pas en train de regarder les highlights',      color: '#F59E0B' },
        { icon: '🔥', text: 'Le sport en vrai, c\'est 10× plus intense que sur un écran',               color: '#FF7A2F' },
        { icon: '🏟️', text: 'Les cris, l\'adrénaline, l\'ambiance — aucune retransmission ne peut ça', color: '#3B82F6' },
      ]);

    if (eventType === 'conference')
      return pick([
        { icon: '💡', text: 'Une idée entendue ce soir peut changer toute ta trajectoire',              color: '#36D9A0' },
        { icon: '🧠', text: 'Les personnes qui avancent dans la vie vont exactement à ce genre d\'event', color: '#6366F1' },
        { icon: '🤝', text: 'Une rencontre ce soir peut valoir mieux que des mois d\'efforts solo',     color: '#36D9A0' },
      ]);

    if (eventType === 'theater')
      return pick([
        { icon: '🎭', text: 'Le théâtre en live, c\'est une émotion que personne ne peut te voler',     color: '#9B65F5' },
        { icon: '🌙', text: 'Une histoire racontée en vrai touche là où les films ne vont pas',         color: '#6366F1' },
        { icon: '✨', text: 'Certains spectacles restent gravés en toi pour toujours — celui-ci peut l\'être', color: '#9B65F5' },
      ]);

    if (eventType === 'exhibition')
      return pick([
        { icon: '🖼️', text: 'L\'art vu en vrai change ta façon de voir le monde — pour de bon',        color: '#36D9A0' },
        { icon: '👁️', text: 'Certaines œuvres te parlent directement — tu en feras partie ?',          color: '#10B981' },
      ]);

    // Fallback
    return pick([
      { icon: '👀', text: 'Les gens qui y vont ne le regrettent jamais — et toi ?',                     color: '#7B3FF2' },
      { icon: '✨', text: 'Certains moments ne se répètent pas — celui-ci en fait partie',              color: colors.primary },
      { icon: '🚀', text: 'Tu mérites une vraie expérience, pas juste des photos sur ton écran',        color: '#FF7A2F' },
      { icon: '💫', text: 'Rejoins les gens qui savent que la vraie vie se passe hors du canapé',       color: '#7B3FF2' },
      { icon: '🎯', text: 'C\'est exactement le genre de soirée dont tu as besoin ce soir',             color: colors.primary },
      { icon: '🌙', text: 'Les meilleures histoires commencent toujours par "allez, on y va !"',        color: '#6366F1' },
    ]);
  })();

  // ── State social branché sur l'API ────────────────────────────────────────
  const [imgFs, setImgFs] = useState(false);
  const bannerLastTap = useRef<number>(0);
  const [liked,        setLiked]        = useState(item.data?.user_reaction === 'like');
  const [likeCount,    setLikeCount]    = useState(item.data?.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(item.data?.comment_count ?? 0);
  const [shareCount,   setShareCount]   = useState(item.data?.share_count ?? 0);
  const [saved,        setSaved]        = useState(false);
  React.useEffect(() => {
    favoriteService.check(isEvent ? 'event' : 'concert', item.id).then(setSaved).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
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

  // ── "Voir plus" titre + description ──────────────────────────────────────

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
      const ev = item.data as Event;
      newSaved
        ? favoriteService.save({ target_type: 'event', target_id: item.id, target_title: ev.title, target_subtitle: ev.venue_city ?? ev.location, target_thumbnail: ev.thumbnail_url ?? ev.cover_url }).catch(() => {})
        : favoriteService.unsave('event', item.id).catch(() => {});
    } else {
      const ct = item.data as Concert;
      newSaved
        ? favoriteService.save({ target_type: 'concert', target_id: item.id, target_title: ct.title, target_subtitle: ct.venue_city ?? ct.artist?.username, target_thumbnail: ct.thumbnail_url }).catch(() => {})
        : favoriteService.unsave('concert', item.id).catch(() => {});
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
        <ExpandableText
          text={title}
          maxLines={2}
          textStyle={[s.cardTitle, { color: colors.textPrimary }]}
          primaryColor={colors.primary}
        />
        {desc ? (
          <View style={{ marginTop: 4 }}>
            <ExpandableText
              text={desc}
              maxLines={3}
              textStyle={[s.cardDesc, { color: colors.textSecondary }]}
              primaryColor={colors.primary}
            />
          </View>
        ) : null}
      </View>

      {/* ── Accroche psychologique ───────────────────────────────────── */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[hk.wrap, { backgroundColor: hookPhrase.color + '15', borderLeftColor: hookPhrase.color }]}>
        <Text style={hk.icon}>{hookPhrase.icon}</Text>
        <Text style={[hk.text, { color: hookPhrase.color }]}>{hookPhrase.text}</Text>
      </TouchableOpacity>

      {/* ── Banner : vidéo pub autoplay ou image ────────────────────── */}
      {/* Image plein écran */}
      {imgFs && thumbUrl && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setImgFs(false)} statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
            <Image source={{ uri: thumbUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
            <TouchableOpacity
              onPress={() => setImgFs(false)}
              style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36, right: 16,
                width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setImgFs(false); onPress(); }}
              style={{ position: 'absolute', bottom: 48, paddingHorizontal: 32, paddingVertical: 14,
                backgroundColor: colors.primary, borderRadius: 28,
                flexDirection: 'row', alignItems: 'center', gap: 8 }}
              activeOpacity={0.85}
            >
              <Icon name="arrow-right" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Voir les détails</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      <TouchableOpacity
        onPress={() => thumbUrl && !videoUrl ? setImgFs(true) : onPress()}
        activeOpacity={0.92}
      >
        <View style={s.cardBanner}>
          {videoUrl ? (
            <CardVideo uri={videoUrl} playing={iscAtive} />
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
              <Text style={[s.likeCountText, { color: colors.textTertiary }]}>
                {likeCount.toLocaleString('fr')}
              </Text>
            </View>
          )}
          {commentCount > 0 && (
            <Text style={[s.likeCountText, { color: colors.textTertiary }]}>
              {commentCount.toLocaleString('fr')} réaction{commentCount > 1 ? 's' : ''}
            </Text>
          )}
          {shareCount > 0 && (
            <Text style={[s.likeCountText, { color: colors.textTertiary, marginLeft: 'auto' as any }]}>
              {shareCount} diffusion{shareCount > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      )}

      {/* ── Barre sociale ────────────────────────────────────────────── */}
      <View style={[s.socialBar, { borderTopColor: colors.divider, backgroundColor: colors.surface }]}>
        <TouchableOpacity style={s.socialBtn} onPress={handleLike} activeOpacity={0.8}>
          <Animated.View style={heartStyle}>
            <Icon name="heart" size={18} color={liked ? '#E0389A' : colors.textTertiary}
              fill={liked ? '#E0389A' : 'none'} />
          </Animated.View>
          <Text style={[s.socialBtnText, { color: liked ? '#E0389A' : colors.textTertiary, fontWeight: liked ? '700' : '500' }]}>
            {liked ? 'Tu adores' : 'Adorer'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.socialBtn} onPress={() => onComment(delta => setCommentCount(v => v + delta))} activeOpacity={0.8}>
          <Icon name="message-circle" size={18} color={colors.textTertiary} />
          <Text style={[s.socialBtnText, { color: colors.textTertiary }]}>Reagir</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.socialBtn} onPress={handleShare} activeOpacity={0.8}>
          <Icon name="share-2" size={18} color={colors.textTertiary} />
          <Text style={[s.socialBtnText, { color: colors.textTertiary }]}>Diffuser</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.8}>
          <Animated.View style={saveStyle}>
            <Icon name="bookmark" size={18} color={saved ? colors.primary : colors.textTertiary} />
          </Animated.View>
        </TouchableOpacity>
      </View>

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
