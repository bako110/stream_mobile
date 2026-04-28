/**
 * LiveListScreen — Liste des concerts en direct
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, RefreshControl,
  StyleSheet, StatusBar, Platform, Dimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonLiveList } from '../../components/common';
import { concertService } from '../../services';
import { useUser } from '../../context/UserContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import type { Concert } from '../../types/concert';

type Nav = NativeStackNavigationProp<MainStackParamList>;
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 48) / 2;

export const LiveListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { currentUser } = useUser();

  const [liveConcerts, setLiveConcerts] = useState<Concert[]>([]);
  const [upcomingConcerts, setUpcomingConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [live, upcoming] = await Promise.all([
        concertService.getLive().catch(() => []),
        concertService.getUpcoming().catch(() => []),
      ]);
      setLiveConcerts(Array.isArray(live) ? live : []);
      setUpcomingConcerts(Array.isArray(upcoming) ? upcoming : []);
    } catch { /* silencieux */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Polling toutes les 15s pour MAJ des lives
  useEffect(() => {
    const interval = setInterval(() => {
      concertService.getLive()
        .then(live => setLiveConcerts(Array.isArray(live) ? live : []))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

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

  const renderLiveCard = ({ item, index }: { item: Concert; index: number }) => {
    const artist = item.artist;
    const artistName = artist?.display_name ?? artist?.username ?? 'Artiste';
    const initial = artistName[0]?.toUpperCase() ?? '?';

    return (
      <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
        <TouchableOpacity
          style={[st.liveCard, { backgroundColor: colors.surface }]}
          activeOpacity={0.85}
          onPress={() => handlePress(item)}
        >
          {/* Thumbnail */}
          <View style={st.liveThumbWrap}>
            {item.thumbnail_url ? (
              <Image source={{ uri: item.thumbnail_url }} style={st.liveThumb} />
            ) : (
              <LinearGradient
                colors={['#7B3FF2', '#E0389A']}
                style={st.liveThumb}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Icon name="radio" size={36} color="#fff" />
              </LinearGradient>
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
            {/* Viewers */}
            <View style={st.viewersBadge}>
              <Icon name="eye" size={12} color="#fff" />
              <Text style={st.viewersText}>{item.current_viewers ?? 0}</Text>
            </View>
          </View>

          {/* Info */}
          <View style={st.liveInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {artist?.avatar_url ? (
                <Image source={{ uri: artist.avatar_url }} style={st.liveAvatar} />
              ) : (
                <View style={[st.liveAvatar, { backgroundColor: '#7B3FF2' + '22', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#7B3FF2', fontWeight: '800', fontSize: 12 }}>{initial}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[st.liveTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[st.liveArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                  {artistName}
                </Text>
              </View>
            </View>
            {item.genre && (
              <View style={[st.genrePill, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[st.genreText, { color: colors.primary }]}>{item.genre}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderUpcomingCard = ({ item, index }: { item: Concert; index: number }) => {
    const artist = item.artist;
    const artistName = artist?.display_name ?? artist?.username ?? 'Artiste';
    const initial = artistName[0]?.toUpperCase() ?? '?';
    const scheduledDate = new Date(item.scheduled_at).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    return (
      <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
        <TouchableOpacity
          style={[st.upcomingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.85}
          onPress={() => handlePress(item)}
        >
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={st.upcomingThumb} />
          ) : (
            <View style={[st.upcomingThumb, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name="music" size={24} color={colors.textTertiary} />
            </View>
          )}
          <View style={st.upcomingInfo}>
            <Text style={[st.upcomingTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {artist?.avatar_url ? (
                <Image source={{ uri: artist.avatar_url }} style={{ width: 18, height: 18, borderRadius: 9 }} />
              ) : (
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 9 }}>{initial}</Text>
                </View>
              )}
              <Text style={[st.upcomingArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                {artistName}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Icon name="clock" size={12} color={colors.textTertiary} />
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>{scheduledDate}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={[st.header, { backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: colors.textPrimary }]}>En direct</Text>
          <View style={{ width: 38 }} />
        </View>
        <SkeletonLiveList />
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="radio" size={20} color="#EF4444" />
          <Text style={[st.headerTitle, { color: colors.textPrimary }]}>En direct</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* ── Section LIVE NOW ─────────────────────────────────────── */}
            {liveConcerts.length > 0 ? (
              <View style={st.section}>
                <View style={st.sectionHeader}>
                  <View style={st.sectionLiveDot} />
                  <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>
                    En direct maintenant
                  </Text>
                  <Text style={[st.sectionCount, { color: colors.primary }]}>
                    {liveConcerts.length}
                  </Text>
                </View>
                <FlatList
                  data={liveConcerts}
                  keyExtractor={c => c.id}
                  renderItem={renderLiveCard}
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
                  Personne n'est en direct pour le moment.{'\n'}Reviens plus tard !
                </Text>
              </Animated.View>
            )}

            {/* ── Section UPCOMING ────────────────────────────────────── */}
            {upcomingConcerts.length > 0 && (
              <View style={st.section}>
                <View style={st.sectionHeader}>
                  <Icon name="clock" size={16} color={colors.textSecondary} />
                  <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>
                    Prochainement
                  </Text>
                </View>
                {upcomingConcerts.map((item, index) => (
                  <View key={item.id}>
                    {renderUpcomingCard({ item, index })}
                  </View>
                ))}
              </View>
            )}
          </>
        }
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
    paddingTop: Platform.OS === 'android' ? 44 : 56,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  // Sections
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
