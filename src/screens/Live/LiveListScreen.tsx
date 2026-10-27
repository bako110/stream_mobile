/**
 * LiveListScreen — Liste des concerts en direct
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, RefreshControl,
  StyleSheet, StatusBar, Platform, Dimensions, TextInput,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonLiveList, BackButton, GofolyxLoader } from '../../components/common';
import { concertService, eventService } from '../../services';
import { prefetchConcertLive } from '../../utils/livePrefetch';
import { useUser } from '../../context/UserContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import type { Concert, UpcomingLiveMixedItem } from '../../types/concert';
import type { Event } from '../../types/event';

type Nav = NativeStackNavigationProp<MainStackParamList>;
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 48) / 2;

type LiveItem =
  | { kind: 'concert'; data: Concert }
  | { kind: 'event'; data: Event };

type DateFilter = 'all' | 'today' | 'week';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isWithinNext7Days(d: Date): boolean {
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return d >= now && d <= in7days;
}

export const LiveListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { currentUser } = useUser();
  const insets = useSafeAreaInsets();

  const [liveConcerts, setLiveConcerts] = useState<Concert[]>([]);
  const [liveEvents, setLiveEvents] = useState<Event[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingLiveMixedItem[]>([]);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [upcomingHasMore, setUpcomingHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const loadUpcomingPage = useCallback(async (page: number, replace: boolean) => {
    const res = await concertService.getUpcomingLiveMixed(page, 20);
    setUpcoming(prev => replace ? res.items : [...prev, ...res.items]);
    setUpcomingPage(res.page);
    setUpcomingHasMore(res.has_more);
  }, []);

  const load = useCallback(async () => {
    try {
      const [live, liveEv] = await Promise.all([
        concertService.getLive().catch(() => []),
        eventService.getLive().catch(() => []),
      ]);
      setLiveConcerts(Array.isArray(live) ? live : []);
      setLiveEvents(Array.isArray(liveEv) ? liveEv : []);
      await loadUpcomingPage(1, true).catch(() => {});
    } catch { /* silencieux */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [loadUpcomingPage]);

  useEffect(() => { load(); }, [load]);

  // Polling toutes les 15s pour MAJ des lives
  useEffect(() => {
    const interval = setInterval(() => {
      concertService.getLive().then(live => setLiveConcerts(Array.isArray(live) ? live : [])).catch(() => {});
      eventService.getLive().then(ev => setLiveEvents(Array.isArray(ev) ? ev : [])).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadMoreUpcoming = useCallback(() => {
    if (loadingMore || !upcomingHasMore) return;
    setLoadingMore(true);
    loadUpcomingPage(upcomingPage + 1, false).finally(() => setLoadingMore(false));
  }, [loadingMore, upcomingHasMore, upcomingPage, loadUpcomingPage]);

  // Recherche par titre (concerts + événements en direct, côté client — pas
  // besoin d'un nouvel endpoint pour filtrer une poignée de lives actifs).
  const filteredLiveConcerts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? liveConcerts.filter(c => c.title.toLowerCase().includes(q)) : liveConcerts;
  }, [liveConcerts, search]);
  const filteredLiveEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? liveEvents.filter(e => e.title.toLowerCase().includes(q)) : liveEvents;
  }, [liveEvents, search]);

  // Filtre de date pour "Prochainement" — Aujourd'hui / Cette semaine / Tout
  // — appliqué côté client sur la page déjà chargée (le scroll infini reste
  // géré par le serveur, ce filtre affine juste l'affichage courant).
  const filteredUpcoming = useMemo(() => {
    const q = search.trim().toLowerCase();
    return upcoming.filter(({ kind, data }) => {
      if (q && !data.title.toLowerCase().includes(q)) return false;
      if (dateFilter === 'all') return true;
      const d = new Date(kind === 'concert' ? data.scheduled_at : data.starts_at);
      if (dateFilter === 'today') return isSameDay(d, new Date());
      return isWithinNext7Days(d);
    });
  }, [upcoming, search, dateFilter]);

  const liveTotal = filteredLiveConcerts.length + filteredLiveEvents.length;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handlePress = (concert: Concert) => {
    const isOwner = currentUser?.id === concert.artist_id;
    if (concert.status === 'live') {
      if (isOwner) {
        nav.navigate('LiveStream', { concertId: concert.id });
      } else {
        nav.navigate('LiveViewer', { concertId: concert.id });
      }
    } else {
      nav.navigate('ConcertDetail', { concertId: concert.id });
    }
  };

  const handleEventPress = (event: Event) => {
    nav.navigate('EventDetail', { eventId: event.id });
  };

  const renderLiveEventCard = ({ item }: { item: Event }) => (
    <TouchableOpacity
      style={[st.liveCard, { backgroundColor: colors.surface }]}
      activeOpacity={0.85}
      onPress={() => handleEventPress(item)}
    >
      <View style={st.liveThumbWrap}>
        {item.thumbnail_url ? (
          <Image source={{ uri: item.thumbnail_url }} style={st.liveThumb} />
        ) : (
          <View style={[st.liveThumb, { backgroundColor: '#7B3FF2' }]}>
            <Icon name="calendar" size={36} color="#fff" />
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={st.liveOverlay} />
        <View style={st.liveBadge}>
          <View style={st.liveDot} />
          <Text style={st.liveBadgeText}>LIVE</Text>
        </View>
        {/* Distingue un événement en live d'un concert — même carrousel. */}
        <View style={[st.eventBadge, { backgroundColor: '#F59E0B' }]}>
          <Text style={st.eventBadgeText}>ÉVÉNEMENT</Text>
        </View>
      </View>
      <View style={st.liveInfo}>
        <Text style={[st.liveTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
        {!!item.venue_city && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="map-pin" size={11} color={colors.textTertiary} />
            <Text style={[st.liveArtist, { color: colors.textSecondary }]} numberOfLines={1}>{item.venue_city}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderLiveCard = ({ item }: { item: Concert }) => {
    return (
      <TouchableOpacity
          style={[st.liveCard, { backgroundColor: colors.surface }]}
          activeOpacity={0.85}
          onPressIn={() => { if (item.status === 'live' && currentUser?.id !== item.artist_id) prefetchConcertLive(item.id); }}
          onPress={() => handlePress(item)}
        >
          {/* Thumbnail */}
          <View style={st.liveThumbWrap}>
            {item.thumbnail_url ? (
              <Image source={{ uri: item.thumbnail_url }} style={st.liveThumb} />
            ) : (
              <View style={[st.liveThumb, { backgroundColor: '#7B3FF2' }]}>
                <Icon name="radio" size={36} color="#fff" />
              </View>
            )}
            {/* Overlay gradient */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={st.liveOverlay}
            />
            {/* LIVE badge */}
            <View style={st.liveBadge}>
              <View style={st.liveDot} />
              <Text style={st.liveBadgeText}>LIVE</Text>
            </View>
            {/* Distingue un concert d'un live simple créateur — c'est le
                CONCERT qui est en direct, pas une personne. */}
            <View style={st.eventBadge}>
              <Text style={st.eventBadgeText}>CONCERT</Text>
            </View>
            {/* Viewers */}
            <View style={st.viewersBadge}>
              <Icon name="eye" size={12} color="#fff" />
              <Text style={st.viewersText}>{item.current_viewers ?? 0}</Text>
            </View>
          </View>

          {/* Info */}
          <View style={st.liveInfo}>
            <Text style={[st.liveTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.genre && (
              <View style={[st.genrePill, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[st.genreText, { color: colors.primary }]}>{item.genre}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
    );
  };

  const renderUpcomingCard = ({ item }: { item: UpcomingLiveMixedItem }) => {
    const { kind, data } = item;
    const scheduledAt = kind === 'concert' ? data.scheduled_at : data.starts_at;
    const scheduledDate = new Date(scheduledAt).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    const onPress = () => kind === 'concert' ? handlePress(data) : handleEventPress(data);

    return (
      <TouchableOpacity
          style={[st.upcomingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.85}
          onPress={onPress}
        >
          {data.thumbnail_url ? (
            <Image source={{ uri: data.thumbnail_url }} style={st.upcomingThumb} />
          ) : (
            <View style={[st.upcomingThumb, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name={kind === 'concert' ? 'music' : 'calendar'} size={24} color={colors.textTertiary} />
            </View>
          )}
          <View style={st.upcomingInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[st.upcomingKindPill, { backgroundColor: kind === 'concert' ? '#8B5CF622' : '#F59E0B22' }]}>
                <Text style={[st.upcomingKindText, { color: kind === 'concert' ? '#8B5CF6' : '#F59E0B' }]}>
                  {kind === 'concert' ? 'CONCERT' : 'ÉVÉNEMENT'}
                </Text>
              </View>
            </View>
            <Text style={[st.upcomingTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {data.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Icon name="clock" size={12} color={colors.textTertiary} />
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>{scheduledDate}</Text>
            </View>
          </View>
        </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
        <View style={{ paddingTop: insets.top + 12 }}>
          <View style={[st.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            <BackButton onPress={() => nav.goBack()} />
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>En direct</Text>
            <View style={{ width: 38 }} />
          </View>
        </View>
        <SkeletonLiveList />
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      {/* Header — carte flottante (même design que le reste de l'app).
          paddingTop (status bar) isolé sur un wrapper externe transparent —
          le mélanger au style de la carte ferait apparaître un coin visible
          sous la status bar. */}
      <View style={{ paddingTop: insets.top + 12 }}>
        <View style={[st.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => nav.goBack()} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="radio" size={20} color="#EF4444" />
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>En direct</Text>
          </View>
          <View style={{ width: 38 }} />
        </View>
      </View>

      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* ── Recherche + filtres de date ──────────────────────────── */}
            <View style={[st.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="search" size={16} color={colors.textTertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher un concert ou un événement…"
                placeholderTextColor={colors.textTertiary}
                style={[st.searchInput, { color: colors.textPrimary }]}
              />
              {!!search && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="x" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            <View style={st.dateFilterRow}>
              {([['all', 'Tout'], ['today', "Aujourd'hui"], ['week', 'Cette semaine']] as const).map(([key, label]) => {
                const active = dateFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setDateFilter(key)}
                    style={[
                      st.dateFilterPill,
                      { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border },
                    ]}
                  >
                    <Text style={[st.dateFilterText, { color: active ? '#fff' : colors.textSecondary }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Section LIVE NOW — concerts + événements fusionnés ───── */}
            {liveTotal > 0 ? (
              <View style={st.section}>
                <View style={st.sectionHeader}>
                  <View style={st.sectionLiveDot} />
                  <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>
                    En direct maintenant
                  </Text>
                  <Text style={[st.sectionCount, { color: colors.primary }]}>
                    {liveTotal}
                  </Text>
                </View>
                <FlatList
                  data={[
                    ...filteredLiveConcerts.map(c => ({ kind: 'concert' as const, data: c })),
                    ...filteredLiveEvents.map(e => ({ kind: 'event' as const, data: e })),
                  ]}
                  keyExtractor={item => `${item.kind}-${item.data.id}`}
                  renderItem={({ item }) => item.kind === 'concert'
                    ? renderLiveCard({ item: item.data })
                    : renderLiveEventCard({ item: item.data })}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                  snapToInterval={CARD_W + 12}
                  decelerationRate="fast"
                />
              </View>
            ) : (
              <Animated.View entering={FadeIn} style={st.emptyLive}>
                <View style={[st.emptyLiveIcon, { backgroundColor: colors.backgroundSecondary }]}>
                  <Icon name="radio" size={32} color={colors.textTertiary} />
                </View>
                <Text style={[st.emptyLiveTitle, { color: colors.textPrimary }]}>
                  Aucun live en cours
                </Text>
                <Text style={[st.emptyLiveDesc, { color: colors.textTertiary }]}>
                  {search ? 'Aucun résultat pour cette recherche.' : "Personne n'est en direct pour le moment.\nReviens plus tard !"}
                </Text>
              </Animated.View>
            )}

            {/* ── Section UPCOMING ────────────────────────────────────── */}
            {filteredUpcoming.length > 0 && (
              <View style={st.section}>
                <View style={st.sectionHeader}>
                  <Icon name="clock" size={16} color={colors.textSecondary} />
                  <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>
                    Prochainement
                  </Text>
                </View>
                {filteredUpcoming.map(item => (
                  <View key={`${item.kind}-${item.data.id}`}>
                    {renderUpcomingCard({ item })}
                  </View>
                ))}
                {loadingMore && (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <GofolyxLoader variant="reel" color={colors.primary} />
                  </View>
                )}
              </View>
            )}
          </>
        }
        onEndReached={search ? undefined : loadMoreUpcoming}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerTitle: { fontSize: 18, fontWeight: '800' },

  // Sections
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 16,
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 14 },
  dateFilterRow: {
    flexDirection: 'row', gap: 8,
    marginHorizontal: 16, marginTop: 12,
  },
  dateFilterPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  dateFilterText: { fontSize: 12.5, fontWeight: '700' },
  section: { marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionLiveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  sectionCount: { fontSize: 14, fontWeight: '700' },

  // Live cards
  liveCard: {
    width: CARD_W,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  liveThumbWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    position: 'relative',
  },
  liveThumb: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveOverlay: {
    ...StyleSheet.absoluteFill,
  },
  liveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  eventBadge: {
    position: 'absolute',
    top: 10,
    left: 62,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  eventBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  viewersBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  viewersText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  liveInfo: {
    padding: 10,
    gap: 6,
  },
  liveAvatar: {
    width: 28, height: 28, borderRadius: 14,
    overflow: 'hidden',
  },
  liveTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  liveArtist: {
    fontSize: 12,
  },
  genrePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  genreText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Upcoming cards
  upcomingCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  upcomingThumb: {
    width: 80, height: 80,
  },
  upcomingInfo: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
    gap: 2,
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  upcomingArtist: {
    fontSize: 12,
  },
  upcomingKindPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6,
  },
  upcomingKindText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Empty state
  emptyLive: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyLiveIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyLiveTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptyLiveDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
