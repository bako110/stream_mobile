import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ScrollView, StyleSheet,
  Image, RefreshControl, Alert, TextInput, Keyboard,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useUserLocation } from '../../hooks/useUserLocation';
import { AppHeader, SkeletonFeed } from '../../components/common';
import { concertService } from '../../services';
import type { Concert } from '../../types';
import type { AppColors } from '../../theme/colors';
import { concertsStyles as s } from '../../styles/ConcertsScreen.styles';
import type { MainStackParamList } from '../../navigation/MainNavigator';

export const ConcertsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation();
  const location = useUserLocation();

  const [myConcerts,     setMyConcerts]     = useState<Concert[]>([]);
  const [nearbyConcerts, setNearbyConcerts] = useState<Concert[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [searchVisible,  setSearchVisible]  = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const searchRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    try {
      const mine = await concertService.getMyConcerts().catch(() => []);
      setMyConcerts(Array.isArray(mine) ? mine : []);
    } catch (err) {
      if (__DEV__) { console.warn('[ConcertsScreen]', err); }
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadNearby = useCallback(async () => {
    if (!location) return;
    try {
      const nearby = await concertService.list({ lat: location.lat, lon: location.lon, limit: 10 });
      setNearbyConcerts(Array.isArray(nearby) ? nearby : []);
    } catch {
      setNearbyConcerts([]);
    }
  }, [location]);

  useEffect(() => { setLoading(true); load(); }, []);
  useEffect(() => { loadNearby(); }, [loadNearby]);

  const filteredConcerts = searchQuery.trim()
    ? myConcerts.filter(c =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.venue_city ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.genre    ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : myConcerts;

  const handleToggleSearch = () => {
    if (searchVisible) {
      Keyboard.dismiss();
      setSearchQuery('');
      setSearchVisible(false);
    } else {
      setSearchVisible(true);
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  };

  const handleDeleteConcert = (id: string) => {
    Alert.alert('Supprimer', 'Supprimer ce concert ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await concertService.delete(id);
          setMyConcerts(prev => prev.filter(c => c.id !== id));
        } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Mes Concerts"
        rightIcon={searchVisible ? 'x' : 'search'}
        onRightPress={handleToggleSearch}
      />

      {searchVisible && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)}
          style={[s.searchWrap, { backgroundColor: colors.backgroundSecondary, borderBottomColor: colors.divider }]}
        >
          <Icon name="search" size={16} color={colors.textTertiary} />
          <TextInput
            ref={searchRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher un concert…"
            placeholderTextColor={colors.textDisabled}
            style={[s.searchInput, { color: colors.textPrimary }]}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="x-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* ── Concerts à proximité ─────────────────────────────────────── */}
      {nearbyConcerts.length > 0 && (
        <View>
          <View style={[s.mySection, { borderBottomColor: colors.divider }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="map-pin" size={13} color={colors.primary} />
              <Text style={[s.mySectionTitle, { color: colors.textTertiary }]}>PRÈS DE TOI</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
          >
            {nearbyConcerts.map(concert => (
              <NearbyCard
                key={concert.id}
                concert={concert}
                colors={colors}
                onPress={() => (nav as any).navigate('ConcertDetail', { concertId: concert.id })}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[s.mySection, { borderBottomColor: colors.divider }]}>
        <Text style={[s.mySectionTitle, { color: colors.textTertiary }]}>MES CONCERTS</Text>
        <TouchableOpacity
          onPress={() => (nav as any).navigate('CreateConcert')}
          style={[s.myAddBtn, { backgroundColor: colors.primary + '18' }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Icon name="plus" size={13} color={colors.primary} />
          <Text style={[s.myAddBtnText, { color: colors.primary }]}>Créer</Text>
        </TouchableOpacity>
      </View>

      {loading && myConcerts.length === 0 ? (
        <SkeletonFeed count={4} />
      ) : filteredConcerts.length === 0 ? (
        <View style={s.empty}>
          <Icon name="music" size={48} color={colors.textTertiary} />
          <Text style={[s.emptyText, { color: colors.textTertiary }]}>
            {myConcerts.length === 0
              ? 'Aucun concert — créez le premier !'
              : 'Aucun résultat pour « ' + searchQuery + ' »'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredConcerts}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <ConcertCard
              concert={item}
              colors={colors}
              onPress={() => (nav as any).navigate('ConcertDetail', { concertId: item.id })}
              onDelete={() => handleDeleteConcert(item.id)}
            />
          )}
        />
      )}
    </View>
  );
};

// ── ConcertCard ───────────────────────────────────────────────────────────────

interface ConcertCardProps { concert: Concert; colors: AppColors; onPress: () => void; onDelete: () => void; }

const ConcertCard: React.FC<ConcertCardProps> = ({ concert, colors, onPress, onDelete }) => {
  const isLive     = concert.status === 'live';
  const isFree     = concert.access_type === 'free';

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surfaceElevated }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {/* Thumbnail */}
      <View style={s.thumbWrap}>
        {concert.thumbnail_url ? (
          <Image source={{ uri: concert.thumbnail_url }} style={s.thumb} />
        ) : (
          <LinearGradient
            colors={[colors.gradientStart + '60', colors.gradientEnd + '30']}
            style={s.thumb}
          >
            <Icon name="music" size={40} color={colors.textOnBrand + 'AA'} />
          </LinearGradient>
        )}

        {/* Overlay gradient bottom */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.35)']}
          style={s.thumbOverlay}
        />

        {/* Badge LIVE */}
        {isLive && (
          <View style={[s.liveBadge, { backgroundColor: colors.accentOrange }]}>
            <View style={[s.liveDot, { backgroundColor: colors.textOnBrand }]} />
            <Text style={[s.liveBadgeText, { color: colors.textOnBrand }]}>LIVE</Text>
          </View>
        )}
      </View>

      {/* Corps */}
      <View style={s.cardBody}>
        <View style={s.cardTopRow}>
          <Text style={[s.cardTitle, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
            {concert.title}
          </Text>
        </View>

        <Text style={[s.cardSub, { color: colors.textSecondary }]} numberOfLines={1}>
          {[concert.genre, concert.venue_city].filter(Boolean).join(' · ')}
        </Text>

        <View style={s.cardMeta}>
          <View style={s.metaItem}>
            <Icon name="calendar" size={11} color={colors.textTertiary} />
            <Text style={[s.metaText, { color: colors.textTertiary }]}>
              {new Date(concert.scheduled_at).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short',
              })}
            </Text>
          </View>

          {concert.ticket_price != null && (
            <View style={[s.pricePill, { backgroundColor: isFree ? colors.accentGreen + '22' : colors.primary + '18' }]}>
              <Text style={[s.priceText, { color: isFree ? colors.accentGreen : colors.primary }]}>
                {isFree || concert.ticket_price === 0 ? 'Gratuit' : `${concert.ticket_price} €`}
              </Text>
            </View>
          )}
        </View>

        <View style={s.cardActions}>
          <TouchableOpacity
            onPress={onDelete}
            style={[s.cardActionBtn, { backgroundColor: colors.error + '18' }]}
          >
            <Icon name="trash-2" size={14} color={colors.error} />
            <Text style={[s.cardActionText, { color: colors.error }]}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── NearbyCard ────────────────────────────────────────────────────────────────

function formatDist(km: number | null | undefined): string {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

interface NearbyCardProps { concert: Concert; colors: AppColors; onPress: () => void; }

const NearbyCard: React.FC<NearbyCardProps> = ({ concert, colors, onPress }) => {
  const isLive = concert.status === 'live';
  const distLabel = formatDist(concert.distance_km);

  return (
    <TouchableOpacity
      style={[nearbyCardSt.card, { backgroundColor: colors.surfaceElevated }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {/* Thumbnail */}
      <View style={nearbyCardSt.thumbWrap}>
        {concert.thumbnail_url ? (
          <Image source={{ uri: concert.thumbnail_url }} style={nearbyCardSt.thumb} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[colors.gradientStart + '60', colors.gradientEnd + '30']}
            style={nearbyCardSt.thumb}
          >
            <Icon name="music" size={28} color={colors.textOnBrand + 'AA'} />
          </LinearGradient>
        )}

        {/* Badge LIVE */}
        {isLive && (
          <View style={[s.liveBadge, { backgroundColor: colors.accentOrange }]}>
            <View style={[s.liveDot, { backgroundColor: colors.textOnBrand }]} />
            <Text style={[s.liveBadgeText, { color: colors.textOnBrand }]}>LIVE</Text>
          </View>
        )}

        {/* Badge distance */}
        {distLabel ? (
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={nearbyCardSt.distBadge}
          >
            <Icon name="map-pin" size={9} color="#fff" />
            <Text style={nearbyCardSt.distText}>{distLabel}</Text>
          </LinearGradient>
        ) : null}
      </View>

      {/* Info */}
      <View style={nearbyCardSt.info}>
        <Text style={[nearbyCardSt.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {concert.title}
        </Text>
        {concert.venue_city ? (
          <View style={nearbyCardSt.venueRow}>
            <Icon name="map-pin" size={10} color={colors.textTertiary} />
            <Text style={[nearbyCardSt.venue, { color: colors.textTertiary }]} numberOfLines={1}>
              {concert.venue_city}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const nearbyCardSt = StyleSheet.create({
  card:      { width: 148, borderRadius: 14, overflow: 'hidden' },
  thumbWrap: { position: 'relative' },
  thumb:     { width: '100%', height: 100, alignItems: 'center', justifyContent: 'center' },
  distBadge: {
    position: 'absolute', bottom: 7, right: 7,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 10, overflow: 'hidden',
  },
  distText:  { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  info:      { padding: 9, gap: 3 },
  title:     { fontSize: 13, fontWeight: '700' },
  venueRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  venue:     { fontSize: 11, flex: 1 },
});
