import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, StatusBar, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useUserLocation } from '../../hooks/useUserLocation';
import { eventService } from '../../services';
import type { Event } from '../../types/event';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const RADII = [5, 10, 20, 50, 100] as const;
type Radius = typeof RADII[number];

const EVENT_COLORS: Record<string, string> = {
  concert: '#7B3FF2', birthday: '#E0389A', festival: '#FF7A2F',
  conference: '#36D9A0', sport: '#3B82F6', theater: '#9B65F5',
  exhibition: '#F59E0B', other: '#9390AB',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDist(km: number | null | undefined): string {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export const NearbyEventsScreen: React.FC = () => {
  const { theme: { colors }, isDark } = useTheme();
  const nav = useNavigation<Nav>();
  const location = useUserLocation();

  const [radius, setRadius]   = useState<Radius>(10);
  const [events, setEvents]   = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [noGeo,   setNoGeo]   = useState(false);

  const load = useCallback(async (r: Radius) => {
    if (!location) { setNoGeo(true); setLoading(false); return; }
    setNoGeo(false);
    setLoading(true);
    try {
      const data = await eventService.list({
        limit: 50,
        lat: location.lat,
        lon: location.lon,
        radius_km: r,
        status: 'published',
        noCache: true,
      });
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { load(radius); }, [radius, location]);

  const renderItem = ({ item }: { item: Event }) => {
    const color = EVENT_COLORS[item.event_type ?? 'other'] ?? EVENT_COLORS.other;
    const dist  = (item as any).distance_km as number | null | undefined;
    return (
      <TouchableOpacity
        style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        activeOpacity={0.85}
        onPress={() => nav.navigate('EventDetail', { eventId: item.id })}
      >
        {/* Thumbnail */}
        <View style={st.thumb}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={[color + 'CC', color + '44']} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', padding: 8 }]}
          >
            {dist != null && (
              <View style={st.distBadge}>
                <Icon name="map-pin" size={10} color="#fff" />
                <Text style={st.distTxt}>{formatDist(dist)}</Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* Infos */}
        <View style={st.info}>
          <Text style={[st.title, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {item.starts_at && (
              <View style={st.metaRow}>
                <Icon name="calendar" size={11} color={color} />
                <Text style={[st.metaTxt, { color: colors.textTertiary }]}>{formatDate(item.starts_at)}</Text>
              </View>
            )}
            {(item.venue_city || item.venue_name) && (
              <View style={st.metaRow}>
                <Icon name="map-pin" size={11} color={color} />
                <Text style={[st.metaTxt, { color: colors.textTertiary }]} numberOfLines={1}>
                  {[item.venue_name, item.venue_city].filter(Boolean).join(', ')}
                </Text>
              </View>
            )}
          </View>
          {/* Prix */}
          <View style={{ marginTop: 6 }}>
            {(item.ticket_price ?? 0) === 0 ? (
              <View style={[st.freeBadge, { borderColor: '#10B981' }]}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981' }}>GRATUIT</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 12, fontWeight: '700', color: color }}>
                {item.ticket_price?.toLocaleString('fr')} €
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={['#4F46E5', '#7B3FF2']}
        style={[st.header, { paddingTop: Platform.OS === 'ios' ? 54 : 40 }]}
      >
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.headerTitle}>Près de toi</Text>
          {location ? (
            <Text style={st.headerSub}>
              {events.length} événement{events.length > 1 ? 's' : ''} dans un rayon de {radius} km
            </Text>
          ) : (
            <Text style={st.headerSub}>Localisation non disponible</Text>
          )}
        </View>
        <Icon name="map-pin" size={20} color="rgba(255,255,255,0.7)" />
      </LinearGradient>

      {/* Sélecteur rayon */}
      <View style={[st.radiusBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, marginRight: 8 }}>Rayon :</Text>
        {RADII.map(r => (
          <TouchableOpacity
            key={r}
            onPress={() => setRadius(r)}
            style={[st.radiusChip, {
              backgroundColor: radius === r ? '#7B3FF2' : 'transparent',
              borderColor:     radius === r ? '#7B3FF2' : colors.border,
            }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: radius === r ? '#fff' : colors.textSecondary }}>
              {r} km
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Contenu */}
      {noGeo ? (
        <View style={st.empty}>
          <Icon name="map-pin" size={48} color={colors.textTertiary} />
          <Text style={[st.emptyTitle, { color: colors.textSecondary }]}>Localisation désactivée</Text>
          <Text style={[st.emptySub, { color: colors.textTertiary }]}>
            Active ta localisation dans les réglages pour voir les événements près de toi.
          </Text>
        </View>
      ) : loading ? (
        <View style={st.empty}>
          <ActivityIndicator size="large" color="#7B3FF2" />
          <Text style={{ color: colors.textTertiary, marginTop: 12 }}>Recherche d'événements...</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={st.empty}>
          <Icon name="calendar" size={48} color={colors.textTertiary} />
          <Text style={[st.emptyTitle, { color: colors.textSecondary }]}>Aucun événement</Text>
          <Text style={[st.emptySub, { color: colors.textTertiary }]}>
            Aucun événement dans un rayon de {radius} km. Essaie d'augmenter le rayon.
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const st = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  radiusBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  radiusChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginRight: 6 },

  card:    { borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  thumb:   { width: 100, height: 100 },
  distBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  distTxt: { fontSize: 10, fontWeight: '700', color: '#fff' },

  info:    { flex: 1, padding: 12, justifyContent: 'center' },
  title:   { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 11 },
  freeBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
