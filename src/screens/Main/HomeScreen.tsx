import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  TextInput, RefreshControl, StatusBar, ActivityIndicator,
  Share, ScrollView, Alert, Platform,
} from 'react-native';
import Contacts from 'react-native-contacts';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { apiClient, Endpoints } from '../../api';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { useUserLocation } from '../../hooks/useUserLocation';
import { localCache } from '../../utils/storage';
import { useWs } from '../../context/WebSocketContext';
import { SkeletonFeed, CommentsBottomSheet, PeopleSuggestions, AvatarWithBadge } from '../../components/common';
import {
  concertService, eventService, authService, searchService,
  socialService, saveService,
} from '../../services';
import { userService } from '../../services';
import type { UserPublic } from '../../types';
import type { Concert } from '../../types/concert';
import type { Event } from '../../types/event';
import type { User } from '../../types/user';
import type { SearchUser } from '../../types/search';
import type { AppColors } from '../../theme/colors';
import { homeStyles as s } from '../../styles/HomeScreen.styles';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ── Types ──────────────────────────────────────────────────────────────────────

type FeedKind = 'concert' | 'event';

interface FeedItem {
  kind: FeedKind;
  id:   string;
  data: Concert | Event;
}

type FeedFilter = 'all' | 'concerts' | 'events' | 'contacts';

// ── Helpers ────────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  concert: '#7B3FF2', birthday: '#E0389A', festival: '#FF7A2F',
  conference: '#36D9A0', sport: '#3B82F6', theater: '#9B65F5',
  exhibition: '#F59E0B', other: '#9390AB',
};
const EVENT_ICONS: Record<string, string> = {
  concert: 'music', birthday: 'gift', festival: 'star',
  conference: 'mic', sport: 'activity', theater: 'film',
  exhibition: 'image', other: 'calendar',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatDate(iso: string, withTime = false): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
  return new Date(iso).toLocaleDateString('fr-FR', opts);
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

// ── HomeScreen ─────────────────────────────────────────────────────────────────

export const HomeScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const userLocation = useUserLocation();

  const [items,         setItems]         = useState<FeedItem[]>([]);
  const [filter,        setFilter]        = useState<FeedFilter>('all');
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [search,        setSearch]        = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchUsers,   setSearchUsers]   = useState<SearchUser[]>([]);
  const [searchEvents,  setSearchEvents]  = useState<any[]>([]);
  const [searchConcerts,setSearchConcerts]= useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentUser,   setCurrentUser]   = useState<User | null>(null);
  const [liveConcerts,  setLiveConcerts]  = useState<Concert[]>([]);
  const [commentsSheet, setCommentsSheet] = useState<{ kind: FeedKind; id: string } | null>(null);
  const [suggestions,    setSuggestions]    = useState<UserPublic[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(true);
  const [contactIds,     setContactIds]     = useState<string[]>([]);
  const [contactsReady,  setContactsReady]  = useState(false);
  const [page,           setPage]           = useState(1);
  const [hasMore,        setHasMore]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const contactsAskedRef  = useRef(false);
  const loadingMoreRef    = useRef(false);
  const currentLoadRef    = useRef<number>(0); // anti-race: identifiant de la requête courante

  const searchRef         = useRef<TextInput>(null);
  const locationLoadedRef = useRef(false);

  // ── Chargement user ──────────────────────────────────────────────────────────

  useEffect(() => {
    authService.getMe().then(setCurrentUser).catch(() => {});
  }, []);

  // ── Suggestions d'amis ───────────────────────────────────────────────────────

  const loadSuggestions = useCallback(async () => {
    setSuggestLoading(true);
    try {
      const data = await userService.getSuggestions(10);
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (e) {
      if (__DEV__) console.warn('[Suggestions]', e);
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, []);

  useEffect(() => { loadSuggestions(); }, []);

  // ── Contacts — chargement silencieux en fond ──────────────────────────────────

  const loadContactIdsSilent = useCallback(async (): Promise<string[]> => {
    try {
      const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CONTACTS : PERMISSIONS.ANDROID.READ_CONTACTS;
      let status = await check(perm);
      if (status === RESULTS.DENIED) status = await request(perm);
      if (status !== RESULTS.GRANTED) return [];

      const contacts = await Contacts.getAll();
      const phones: string[] = [];
      for (const c of contacts) {
        for (const p of c.phoneNumbers ?? []) {
          if (p.number) phones.push(normalizePhone(p.number));
        }
      }
      if (!phones.length) return [];

      const res = await apiClient.post<{ user_ids: string[] }>(
        Endpoints.users.matchContacts,
        { phones },
      );
      return res.data.user_ids ?? [];
    } catch (e) {
      if (__DEV__) console.warn('[Contacts]', e);
      return [];
    }
  }, []);

  // ── Chargement concerts LIVE ─────────────────────────────────────────────────

  const loadLive = useCallback(async () => {
    try {
      const live = await concertService.getLive();
      setLiveConcerts(Array.isArray(live) ? live : []);
    } catch { setLiveConcerts([]); }
  }, []);

  useEffect(() => { loadLive(); }, [loadLive]);

  // ── Chargement feed ──────────────────────────────────────────────────────────

  const buildItems = (concerts: Concert[], events: Event[]): FeedItem[] => {
    const results: FeedItem[] = [];
    (Array.isArray(concerts) ? concerts : []).forEach(c => {
      if (c.status === 'published' || c.status === 'live')
        results.push({ kind: 'concert', id: c.id, data: c });
    });
    (Array.isArray(events) ? events : []).forEach(e =>
      results.push({ kind: 'event', id: e.id, data: e }),
    );
    results.sort((a, b) =>
      new Date((b.data as any).created_at).getTime() - new Date((a.data as any).created_at).getTime(),
    );
    return results;
  };

  const load = useCallback(async (f: FeedFilter, opts: { noCache?: boolean; ids?: string[]; reset?: boolean } = {}) => {
    const { noCache = false, ids, reset = true } = opts;
    const loadId = ++currentLoadRef.current; // identifiant unique pour cette requête

    if (reset) { setLoading(true); setPage(1); setHasMore(true); }

    // Cache local MMKV — affiché immédiatement pendant le fetch réseau
    const cacheKey = `home:${f}:p1`;
    if (reset && !noCache) {
      const cached = localCache.get<FeedItem[]>(cacheKey);
      if (cached) { setItems(cached); setLoading(false); }
    }

    try {
      const resolvedIds = ids ?? contactIds;
      const [concerts, events] = await Promise.all([
        (f === 'all' || f === 'concerts')
          ? concertService.list({ limit: 20, lat: userLocation?.lat, lon: userLocation?.lon })
          : Promise.resolve([] as Concert[]),
        (f === 'all' || f === 'events' || f === 'contacts')
          ? eventService.list({
              limit: 20, status: 'published', noCache,
              lat: userLocation?.lat, lon: userLocation?.lon,
              ...(f === 'contacts' && resolvedIds.length ? { contact_ids: resolvedIds } : {}),
            })
          : Promise.resolve([] as Event[]),
      ]);

      // Abandon si une requête plus récente a démarré (anti-race)
      if (loadId !== currentLoadRef.current) return;

      const built = buildItems(concerts, events);
      setItems(built);
      setHasMore(built.length >= 20);
      // Sauvegarde en cache local (60s TTL)
      if (!noCache) localCache.set(cacheKey, built, 60_000);
    } catch (err) {
      if (loadId !== currentLoadRef.current) return;
      if (__DEV__) console.warn('[HomeScreen] load:', err);
    } finally {
      if (loadId === currentLoadRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userLocation, contactIds]);

  // ── Pagination infinie ────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || loading) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const [concerts, events] = await Promise.all([
        (filter === 'all' || filter === 'concerts')
          ? concertService.list({ limit: 20, page: nextPage, lat: userLocation?.lat, lon: userLocation?.lon })
          : Promise.resolve([] as Concert[]),
        (filter === 'all' || filter === 'events' || filter === 'contacts')
          ? eventService.list({
              limit: 20, page: nextPage, status: 'published',
              lat: userLocation?.lat, lon: userLocation?.lon,
              ...(filter === 'contacts' && contactIds.length ? { contact_ids: contactIds } : {}),
            })
          : Promise.resolve([] as Event[]),
      ]);
      const newItems = buildItems(concerts, events);
      if (!newItems.length) { setHasMore(false); return; }
      setItems(prev => {
        const ids = new Set(prev.map(i => i.id));
        return [...prev, ...newItems.filter(i => !ids.has(i.id))];
      });
      setPage(nextPage);
      setHasMore(newItems.length >= 20);
    } catch {}
    finally { setLoadingMore(false); loadingMoreRef.current = false; }
  }, [page, hasMore, loading, filter, userLocation, contactIds]);

  // Charge le feed normal immédiatement, puis injecte les contacts en fond
  useEffect(() => {
    load(filter, { reset: true });

    // Contacts — une seule fois, en fond, sans bloquer
    if (!contactsAskedRef.current) {
      contactsAskedRef.current = true;
      loadContactIdsSilent().then(ids => {
        if (!ids.length) return;
        setContactIds(ids);
        setContactsReady(true);
        if (filter === 'contacts') {
          load('contacts', { ids, reset: true });
        } else {
          // Boost silencieux : injecte les events contacts en tête
          eventService.list({ limit: 10, status: 'published', contact_ids: ids })
            .then(contactEvents => {
              if (!contactEvents.length) return;
              setItems(prev => {
                const existingIds = new Set(prev.map(i => i.id));
                const boosted: FeedItem[] = contactEvents
                  .filter(e => !existingIds.has(e.id))
                  .map(e => ({ kind: 'event' as FeedKind, id: e.id, data: e }));
                return [...boosted, ...prev];
              });
            }).catch(() => {});
        }
      });
    }
  }, [filter]);

  useEffect(() => {
    if (userLocation && !locationLoadedRef.current) {
      locationLoadedRef.current = true;
      load(filter, { reset: true });
    }
  }, [userLocation]);

  useFocusEffect(useCallback(() => {
    load(filter, { noCache: true, reset: true });
    loadLive();
  }, [filter, load, loadLive]));

  // ── Recherche ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!search.trim()) {
      setSearchUsers([]); setSearchEvents([]); setSearchConcerts([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await searchService.searchAll({ q: search.trim(), limit: 10 });
        setSearchUsers(Array.isArray(res.users) ? res.users : []);
        setSearchEvents(Array.isArray(res.events) ? res.events : []);
        setSearchConcerts(Array.isArray(res.concerts) ? res.concerts : []);
      } catch {
        setSearchUsers([]); setSearchEvents([]); setSearchConcerts([]);
      } finally { setSearchLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => (item.data as any).title?.toLowerCase().includes(q));
  }, [items, search]);

  // ── Sections feed ────────────────────────────────────────────────────────────

  const ListHeader = useMemo(() => (
    <Animated.View entering={FadeInDown.delay(60).springify()}>
      {/* Live banner */}
      {liveConcerts.length > 0 && (
        <View style={s.liveBanner}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.liveBannerScroll}
          >
            {liveConcerts.map(c => (
              <TouchableOpacity
                key={c.id}
                style={s.liveCard}
                activeOpacity={0.88}
                onPress={() => nav.navigate('ConcertDetail', { concertId: c.id })}
              >
                {c.thumbnail_url ? (
                  <Image source={{ uri: c.thumbnail_url }} style={s.liveCardImg} />
                ) : (
                  <LinearGradient
                    colors={['#7B3FF2CC', '#9B65F544']}
                    style={s.liveCardImg}
                  />
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.75)']}
                  style={s.liveCardGrad}
                />
                <View style={s.liveCardContent}>
                  <View style={s.livePill}>
                    <View style={s.liveDot} />
                    <Text style={s.livePillText}>EN DIRECT</Text>
                  </View>
                  <Text style={s.liveCardTitle} numberOfLines={1}>{c.title}</Text>
                  <Text style={s.liveCardSub} numberOfLines={1}>
                    {c.current_viewers} spectateurs · {c.venue_city ?? ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Filtres */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filtersRow}
        contentContainerStyle={s.filtersScroll}
      >
        {(['all', 'concerts', 'events', 'contacts'] as FeedFilter[]).map(f => {
          const active = filter === f;
          const label  = f === 'all' ? 'Tout' : f === 'concerts' ? 'Concerts' : f === 'events' ? 'Événements' : 'Contacts';
          const icon   = f === 'all' ? 'grid' : f === 'concerts' ? 'music' : f === 'events' ? 'calendar' : 'users';
          return (
            <TouchableOpacity
              key={f}
              onPress={async () => {
                if (f === 'contacts' && !contactsReady) {
                  const ids = await loadContactIdsSilent();
                  if (ids.length) {
                    setContactIds(ids);
                    setContactsReady(true);
                    setFilter('contacts');
                    load('contacts', { ids, reset: true });
                  } else {
                    setFilter('contacts');
                  }
                } else {
                  setFilter(f);
                }
              }}
              style={[s.filterChip, {
                backgroundColor: active ? colors.primary : 'transparent',
                borderColor:     active ? colors.primary : colors.border,
              }]}
            >
              <Icon name={icon} size={13} color={active ? '#fff' : colors.textSecondary} />
              <Text style={[s.filterChipText, { color: active ? '#fff' : colors.textSecondary }]}>
                {label}
              </Text>
              {f === 'contacts' && contactsReady && !active && (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginLeft: 2 }} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Animated.View>
  ), [colors, filter, liveConcerts]);

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        <Header
          colors={colors} search={search} setSearch={setSearch}
          searchFocused={searchFocused} setSearchFocused={setSearchFocused}
          searchRef={searchRef} isDark={isDark} user={currentUser}
          onMessages={() => nav.navigate('Messages')}
          onNotifications={() => nav.navigate('Notifications')}
        />
        <SkeletonFeed count={4} />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <Header
        colors={colors} search={search} setSearch={setSearch}
        searchFocused={searchFocused} setSearchFocused={setSearchFocused}
        searchRef={searchRef} isDark={isDark} user={currentUser}
        onMessages={() => nav.navigate('Messages')}
        onNotifications={() => nav.navigate('Notifications')}
      />

      {search.trim().length > 0 ? (
        <SearchResults
          loading={searchLoading}
          users={searchUsers}
          events={searchEvents}
          concerts={searchConcerts}
          query={search}
          colors={colors}
          onUser={id   => { setSearch(''); nav.navigate('UserProfile',   { userId: id });   }}
          onEvent={id  => { setSearch(''); nav.navigate('EventDetail',   { eventId: id });  }}
          onConcert={id=> { setSearch(''); nav.navigate('ConcertDetail', { concertId: id });}}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.kind + item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.bottomSpacer}
          style={{ flex: 1 }}
          ListHeaderComponent={
            <View style={s.listHeader}>
              {ListHeader}
              <PeopleSuggestions
                users={suggestions}
                loading={suggestLoading}
                onUserPress={id => nav.navigate('UserProfile', { userId: id })}
                onRefresh={loadSuggestions}
              />
            </View>
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(filter, { noCache: true, reset: true }); loadLive(); }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <LinearGradient
                colors={[colors.primary + '22', colors.primary + '08']}
                style={s.emptyIcon}
              >
                <Icon name="inbox" size={34} color={colors.primary} />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                Rien pour le moment
              </Text>
              <Text style={[s.emptyDesc, { color: colors.textTertiary }]}>
                Les concerts et événements publiés apparaîtront ici.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index * 15, 150)).springify()}>
              <PostCard
                item={item}
                colors={colors}
                isDark={isDark}
                onPress={() => {
                  if (item.kind === 'concert') nav.navigate('ConcertDetail', { concertId: item.id });
                  else                         nav.navigate('EventDetail',   { eventId: item.id });
                }}
                onComment={() => setCommentsSheet({ kind: item.kind, id: item.id })}
                onAuthorPress={id => nav.navigate('UserProfile', { userId: id })}
              />
            </Animated.View>
          )}
        />
      )}

      <CommentsBottomSheet
        visible={commentsSheet !== null}
        onClose={() => setCommentsSheet(null)}
        concertId={commentsSheet?.kind === 'concert' ? commentsSheet.id : undefined}
        eventId={commentsSheet?.kind === 'event'   ? commentsSheet.id : undefined}
      />
    </View>
  );
};

// ── Header ─────────────────────────────────────────────────────────────────────

interface HeaderProps {
  colors:           AppColors;
  search:           string;
  setSearch:        (v: string) => void;
  searchFocused:    boolean;
  setSearchFocused: (v: boolean) => void;
  searchRef:        React.RefObject<TextInput | null>;
  isDark:           boolean;
  user:             User | null;
  onMessages:       () => void;
  onNotifications:  () => void;
}

const Header: React.FC<HeaderProps> = ({
  colors, search, setSearch, searchFocused, setSearchFocused,
  searchRef, isDark, user, onMessages, onNotifications,
}) => {
  const { unreadNotifications, unreadMessages } = useWs();
  const totalNotifBadge = unreadNotifications;
  const displayName = user?.display_name ?? user?.first_name ?? user?.username ?? 'FoliX';
  const initials    = getInitials(displayName);
  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <View style={[s.header, { backgroundColor: colors.surface }]}>
      {/* Ligne 1 : avatar gauche + logo centre + icônes droite */}
      <View style={s.headerRow}>
        {/* Avatar + salutation */}
        <TouchableOpacity style={s.headerLeft} activeOpacity={0.8}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={s.headerAvatar} />
          ) : (
            <LinearGradient
              colors={[colors.primary, colors.primary + 'AA']}
              style={s.headerAvatar}
            >
              <Text style={s.headerAvatarText}>{initials}</Text>
            </LinearGradient>
          )}
          <View>
            <Text style={[s.headerGreeting, { color: colors.textTertiary }]}>{greeting} 👋</Text>
            <Text style={[s.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Logo FoliX centré */}
        <View pointerEvents="none" style={s.headerLogoWrap}>
          <Text style={[s.headerLogo, { color: colors.primary }]}>FoliX</Text>
        </View>

        {/* Icônes droite */}
        <View style={s.headerIcons}>
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={onMessages}>
            <Icon name="message-circle" size={20} color={colors.textPrimary} />
            {unreadMessages > 0 && (
              <View style={[s.badge, { backgroundColor: colors.accentOrange }]}>
                <Text style={s.badgeText}>{unreadMessages > 99 ? '99+' : unreadMessages}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={onNotifications}>
            <Icon name="bell" size={20} color={colors.textPrimary} />
            {totalNotifBadge > 0 && (
              <View style={[s.badge, { backgroundColor: '#EF4444' }]}>
                <Text style={s.badgeText}>{totalNotifBadge > 99 ? '99+' : totalNotifBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Barre de recherche */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => searchRef.current?.focus()}
        style={[s.searchBar, {
          backgroundColor: colors.inputBg ?? colors.backgroundSecondary,
          borderColor:     searchFocused ? colors.primary : colors.border,
          borderWidth:     searchFocused ? 1.5 : 1,
        }]}
      >
        <Icon name="search" size={15} color={searchFocused ? colors.primary : colors.textTertiary} />
        <TextInput
          ref={searchRef}
          value={search}
          onChangeText={setSearch}
          placeholder="Concerts, événements, artistes..."
          placeholderTextColor={colors.textDisabled}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          style={[s.searchInput, { color: colors.textPrimary }]}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="x-circle" size={15} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
};

// ── SearchResults ─────────────────────────────────────────────────────────────

interface SearchResultsProps {
  loading:    boolean;
  users:      SearchUser[];
  events:     any[];
  concerts:   any[];
  query:      string;
  colors:     AppColors;
  onUser:     (id: string) => void;
  onEvent:    (id: string) => void;
  onConcert:  (id: string) => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({
  loading, users, events, concerts, query, colors, onUser, onEvent, onConcert,
}) => {
  const hasResults = users.length > 0 || events.length > 0 || concerts.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {loading && (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 28 }} />
      )}
      {!loading && !hasResults && (
        <Animated.View entering={FadeIn} style={{ alignItems: 'center', paddingVertical: 60 }}>
          <Icon name="search" size={44} color={colors.textTertiary + '80'} />
          <Text style={{ color: colors.textTertiary, marginTop: 12, fontSize: 14 }}>
            Aucun résultat pour « {query} »
          </Text>
        </Animated.View>
      )}

      {users.length > 0 && (
        <SearchSection label="PERSONNES">
          {users.map(u => (
            <TouchableOpacity
              key={u.id}
              onPress={() => onUser(u.id)}
              style={[s.searchRow, { borderBottomColor: colors.divider }]}
            >
              {u.avatar_url ? (
                <Image source={{ uri: u.avatar_url }} style={s.searchAvatar} />
              ) : (
                <LinearGradient colors={[colors.primary, colors.primary + 'AA']} style={s.searchAvatar}>
                  <Text style={s.searchAvatarText}>
                    {(u.display_name || u.username || '?')[0].toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.searchRowTitle, { color: colors.textPrimary }]}>
                  {u.display_name || u.username}
                </Text>
                <Text style={[s.searchRowSub, { color: colors.textTertiary }]}>@{u.username}</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </SearchSection>
      )}

      {concerts.length > 0 && (
        <SearchSection label="CONCERTS">
          {concerts.map((c: any) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => onConcert(c.id)}
              style={[s.searchRow, { borderBottomColor: colors.divider }]}
            >
              <View style={[s.searchThumb, { backgroundColor: '#7B3FF222' }]}>
                {c.thumbnail_url
                  ? <Image source={{ uri: c.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Icon name="music" size={18} color="#7B3FF2" />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.searchRowTitle, { color: colors.textPrimary }]}>{c.title}</Text>
                <Text style={[s.searchRowSub, { color: colors.textTertiary }]}>
                  {[c.genre, c.venue_city].filter(Boolean).join(' · ') || 'Concert'}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </SearchSection>
      )}

      {events.length > 0 && (
        <SearchSection label="ÉVÉNEMENTS">
          {events.map((e: any) => (
            <TouchableOpacity
              key={e.id}
              onPress={() => onEvent(e.id)}
              style={[s.searchRow, { borderBottomColor: colors.divider }]}
            >
              <View style={[s.searchThumb, { backgroundColor: colors.primary + '22' }]}>
                {e.thumbnail_url
                  ? <Image source={{ uri: e.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Icon name="calendar" size={18} color={colors.primary} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.searchRowTitle, { color: colors.textPrimary }]}>{e.title}</Text>
                <Text style={[s.searchRowSub, { color: colors.textTertiary }]}>
                  {[e.event_type, e.venue_city].filter(Boolean).join(' · ') || 'Événement'}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </SearchSection>
      )}
    </ScrollView>
  );
};

const SearchSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: '#9390AB', marginBottom: 4 }}>
      {label}
    </Text>
    {children}
  </View>
);

// ── PostCard ───────────────────────────────────────────────────────────────────

interface PostCardProps {
  item:         FeedItem;
  colors:       AppColors;
  isDark:       boolean;
  onPress:      () => void;
  onComment:    () => void;
  onAuthorPress:(id: string) => void;
}

const PostCard: React.FC<PostCardProps> = ({ item, colors, isDark, onPress, onComment, onAuthorPress }) => {
  const isConcert  = item.kind === 'concert';
  const concert    = isConcert ? (item.data as Concert) : null;
  const event      = !isConcert ? (item.data as Event) : null;

  const title      = concert?.title       ?? event?.title       ?? '';
  const desc       = concert?.description ?? event?.description ?? '';
  const thumbUrl   = concert?.thumbnail_url ?? event?.thumbnail_url ?? null;
  const createdAt  = (concert?.created_at ?? event?.created_at ?? '');
  const isLive     = concert?.status === 'live';
  const city       = concert?.venue_city  ?? event?.venue_city  ?? null;
  const genre      = concert?.genre ?? null;
  const accessType = concert?.access_type ?? event?.access_type ?? null;
  const price      = concert?.ticket_price ?? event?.ticket_price ?? null;

  const date = concert
    ? formatDate(concert.scheduled_at, true)
    : event ? formatDate(event.starts_at) : '';

  const eventType   = event?.event_type ?? 'concert';
  const accentColor = isConcert ? colors.primary : (EVENT_COLORS[eventType] ?? colors.primary);
  const typeIcon    = isConcert ? 'music' : (EVENT_ICONS[eventType] ?? 'calendar');
  const typeLabel   = isConcert ? 'Concert' : (eventType.charAt(0).toUpperCase() + eventType.slice(1));

  const authorName = isConcert
    ? (concert?.artist?.display_name ?? concert?.artist?.username ?? 'Artiste FoliX')
    : (event?.organizer?.display_name ?? event?.organizer?.username ?? 'Organisateur FoliX');
  const authorAvatar = isConcert ? concert?.artist?.avatar_url : event?.organizer?.avatar_url;
  const authorId     = isConcert ? concert?.artist_id : event?.organizer_id;
  const initials     = getInitials(authorName);

  // ── Réactions (câblées sur l'API) ─────────────────────────────────────────

  const [liked,      setLiked]      = useState(false);
  const [likeCount,  setLikeCount]  = useState(0);
  const [saved,      setSaved]      = useState(() =>
    isConcert ? saveService.isConcertSaved(item.id) : saveService.isEventSaved(item.id)
  );
  const [reactionLoading, setReactionLoading] = useState(false);
  const likeScale = useSharedValue(1);
  const likeStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));

  // Charger réaction initiale + compteur
  useEffect(() => {
    const params = isConcert ? { concert_id: item.id } : { event_id: item.id };
    Promise.all([
      socialService.getMyReaction(params).catch(() => ({ reaction_type: null })),
      socialService.getReactionCounts(params).catch(() => ({ like: 0, love: 0, fire: 0, total: 0 })),
    ]).then(([myReaction, counts]) => {
      setLiked(myReaction.reaction_type === 'like');
      setLikeCount((counts as any).total ?? (counts as any).like ?? 0);
    });
  }, [item.id, isConcert]);

  const handleLike = async () => {
    if (reactionLoading) return;
    likeScale.value = withSequence(withSpring(1.35), withSpring(1));
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? Math.max(0, c - 1) : c + 1);
    setReactionLoading(true);
    try {
      const params = isConcert
        ? { reaction_type: 'like' as const, concert_id: item.id }
        : { reaction_type: 'like' as const, event_id:   item.id };
      await socialService.toggleReaction(params);
    } catch {
      // rollback optimiste
      setLiked(wasLiked);
      setLikeCount(c => wasLiked ? c + 1 : Math.max(0, c - 1));
    } finally { setReactionLoading(false); }
  };

  const handleSave = () => {
    if (isConcert) {
      if (saved) saveService.unsaveConcert(item.id);
      else       saveService.saveConcert(item.data as Concert);
    } else {
      if (saved) saveService.unsaveEvent(item.id);
      else       saveService.saveEvent(item.data as Event);
    }
    setSaved(!saved);
  };

  const handleShare = async () => {
    try {
      await Share.share({ title, message: `${title} — Découvrez sur FoliX !` });
      const params = isConcert ? { concert_id: item.id } : { event_id: item.id };
      socialService.share(params).catch(() => {});
    } catch { /* annulé */ }
  };

  // Capacité événement
  const capacityPct = (!isConcert && event?.max_attendees && event.max_attendees > 0)
    ? Math.min(((event.current_attendees ?? 0) / event.max_attendees) * 100, 100)
    : null;

  return (
    <TouchableOpacity
      style={[s.post, { backgroundColor: colors.surface }]}
      activeOpacity={0.97}
      onPress={onPress}
    >
      {/* ── En-tête auteur ─────────────────────────────────────────────────── */}
      <View style={s.postHeader}>
        <TouchableOpacity
          onPress={() => authorId && onAuthorPress(authorId)}
          activeOpacity={0.8}
        >
          <AvatarWithBadge
            avatarUrl={authorAvatar}
            initials={initials}
            size={44}
            accentColor={accentColor}
            isVerified={!!(isConcert ? concert?.artist?.is_verified : event?.organizer?.is_verified)}
            isOnline={(isConcert ? (concert?.artist as any)?.is_online : (event?.organizer as any)?.is_online) ?? undefined}
          />
        </TouchableOpacity>

        <View style={s.postMeta}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[s.postAuthor, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
              {authorName}
            </Text>
          </View>
          <Text style={[s.postTime, { color: colors.textTertiary }]}>
            {timeAgo(createdAt)} · <Text style={{ color: accentColor }}>{typeLabel}</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={s.postSaveBtn}
          onPress={handleSave}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon
            name={saved ? 'bookmark' : 'bookmark'}
            size={18}
            color={saved ? colors.primary : colors.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {/* ── Description ────────────────────────────────────────────────────── */}
      {desc.trim().length > 0 && (
        <Text style={[s.postDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {desc}
        </Text>
      )}

      {/* ── Média ──────────────────────────────────────────────────────────── */}
      <View style={s.postMedia}>
        {thumbUrl ? (
          <Image source={{ uri: thumbUrl }} style={s.postMediaImg} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[accentColor + 'DD', accentColor + '55']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.postMediaImg}
          >
            <Icon name={typeIcon} size={52} color="rgba(255,255,255,0.35)" />
          </LinearGradient>
        )}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.62)']}
          style={s.postMediaGrad}
          pointerEvents="none"
        />

        {/* Titre overlay */}
        <View style={s.postMediaOverlay}>
          <Text style={s.postMediaTitle} numberOfLines={2}>{title}</Text>
          {(genre || city) && (
            <Text style={s.postMediaSub} numberOfLines={1}>
              {[genre, city].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>

        {/* Badges */}
        <View style={s.postBadgesRow}>
          {isLive && (
            <View style={[s.postBadge, { backgroundColor: '#FF3B30' }]}>
              <View style={s.postBadgeDot} />
              <Text style={s.postBadgeText}>LIVE</Text>
            </View>
          )}
          <View style={[s.postBadge, { backgroundColor: accentColor + 'EE' }]}>
            <Icon name={typeIcon} size={9} color="#fff" />
            <Text style={s.postBadgeText}>{typeLabel.toUpperCase()}</Text>
          </View>
          {accessType === 'free' && (
            <View style={[s.postBadge, { backgroundColor: '#36D9A0EE' }]}>
              <Text style={s.postBadgeText}>GRATUIT</Text>
            </View>
          )}
          {accessType === 'ticket' && price != null && (
            <View style={[s.postBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              <Text style={s.postBadgeText}>{price} €</Text>
            </View>
          )}
        </View>

        {/* Bouton play pour les concerts */}
        {isConcert && (
          <View style={s.playBtn}>
            <Icon name="play" size={20} color="#fff" />
          </View>
        )}

        {/* Viewers live */}
        {isLive && concert?.current_viewers != null && (
          <View style={[s.viewersChip, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={[s.postBadgeDot, { backgroundColor: '#FF3B30' }]} />
            <Text style={s.postBadgeText}>{concert.current_viewers} en direct</Text>
          </View>
        )}
      </View>

      {/* ── Meta date / lieu / participants ────────────────────────────────── */}
      <View style={s.postMetaRow}>
        <View style={s.postMetaItem}>
          <Icon name="calendar" size={12} color={colors.textTertiary} />
          <Text style={[s.postMetaText, { color: colors.textTertiary }]}>{date}</Text>
        </View>
        {city && (
          <View style={s.postMetaItem}>
            <Icon name="map-pin" size={12} color={colors.textTertiary} />
            <Text style={[s.postMetaText, { color: colors.textTertiary }]}>{city}</Text>
          </View>
        )}
        {!isConcert && event && (
          <View style={[s.postMetaItem, s.attendeesChip, { backgroundColor: accentColor + '1A' }]}>
            <Icon name="users" size={11} color={accentColor} />
            <Text style={[s.postMetaText, { color: accentColor, fontWeight: '700' }]}>
              {event.current_attendees ?? 0}
              {event.max_attendees ? `/${event.max_attendees}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── Barre de capacité ──────────────────────────────────────────────── */}
      {capacityPct !== null && (
        <View style={s.capacityWrap}>
          <View style={[s.capacityTrack, { backgroundColor: colors.backgroundTertiary }]}>
            <Animated.View
              style={[s.capacityFill, { backgroundColor: accentColor, width: `${capacityPct}%` as any }]}
            />
          </View>
          <Text style={[s.capacityLabel, { color: colors.textTertiary }]}>
            {Math.round(capacityPct)}% complet
          </Text>
        </View>
      )}

      {/* ── Compteur likes ─────────────────────────────────────────────────── */}
      {likeCount > 0 && (
        <View style={s.postCounts}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={[s.likeCountDot, { backgroundColor: colors.accentOrange }]}>
              <Icon name="heart" size={9} color="#fff" />
            </View>
            <Text style={[s.postCountText, { color: colors.textTertiary }]}>
              {likeCount} j'aime{likeCount > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      )}

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <View style={[s.postActions, { borderTopColor: colors.divider }]}>
        <Animated.View style={[{ flex: 1 }, likeStyle]}>
          <TouchableOpacity style={s.actionBtn} onPress={handleLike} disabled={reactionLoading}>
            <Icon
              name="heart"
              size={18}
              color={liked ? colors.accentOrange : colors.textSecondary}
            />
            <Text style={[s.actionText, { color: liked ? colors.accentOrange : colors.textSecondary }]}>
              J'aime
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity style={s.actionBtn} onPress={onComment}>
          <Icon name="message-circle" size={18} color={colors.textSecondary} />
          <Text style={[s.actionText, { color: colors.textSecondary }]}>Commenter</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.actionBtn} onPress={handleShare}>
          <Icon name="share-2" size={18} color={colors.textSecondary} />
          <Text style={[s.actionText, { color: colors.textSecondary }]}>Partager</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};
