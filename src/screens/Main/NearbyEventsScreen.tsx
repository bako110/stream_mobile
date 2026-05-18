import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, StatusBar, Platform, Dimensions, ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Animated, {
  FadeInDown,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useUserLocation } from '../../hooks/useUserLocation';
import { eventService } from '../../services';
import type { Event } from '../../types/event';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const { width: SW } = Dimensions.get('window');
const CARD_W  = SW - 32;
const COVER_H = CARD_W * 0.48;

const RADII = [5, 10, 20, 50, 100] as const;
type Radius = typeof RADII[number];

const EVENT_COLORS: Record<string, [string, string]> = {
  concert:    ['#7B3FF2', '#E0389A'],
  birthday:   ['#E0389A', '#FF7A2F'],
  festival:   ['#FF7A2F', '#F59E0B'],
  conference: ['#0EA5E9', '#36D9A0'],
  sport:      ['#3B82F6', '#06B6D4'],
  theater:    ['#9B65F5', '#7B3FF2'],
  exhibition: ['#F59E0B', '#EF4444'],
  other:      ['#6366F1', '#9390AB'],
};
const EVENT_ICONS: Record<string, string> = {
  concert: 'music', birthday: 'gift', festival: 'star',
  conference: 'mic', sport: 'activity', theater: 'film',
  exhibition: 'image', other: 'calendar',
};
const EVENT_LABELS: Record<string, string> = {
  concert: 'Concert', birthday: 'Anniversaire', festival: 'Festival',
  conference: 'Conférence', sport: 'Sport', theater: 'Théâtre',
  exhibition: 'Exposition', other: 'Événement',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'long',
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function formatDist(km: number | null | undefined): string {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// ── Card composant ────────────────────────────────────────────────────────────

const EventCard: React.FC<{ item: Event; index: number; colors: any; onPress: () => void }> = ({
  item, index, colors, onPress,
}) => {
  const grad   = EVENT_COLORS[item.event_type ?? 'other'] ?? EVENT_COLORS.other;
  const icon   = EVENT_ICONS[item.event_type ?? 'other'] ?? 'calendar';
  const label  = EVENT_LABELS[item.event_type ?? 'other'] ?? 'Événement';
  const dist   = (item as any).distance_km as number | null | undefined;
  const distLabel = formatDist(dist);
  const isFree = item.access_type === 'free' || (item.ticket_price == null && item.access_type !== 'ticket');

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const allPrices = [
    item.ticket_price,
    (item as any).ticket_price_vip,
    (item as any).ticket_price_vvip,
    (item as any).ticket_price_vvvip,
  ].filter((p): p is number => p != null && p > 0);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index * 60, 400)).springify().damping(18)}
      style={animStyle}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => { scale.value = withSpring(0.97); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={onPress}
      >
        <View style={[st.card, { backgroundColor: colors.surface }]}>
          {/* ── Cover ─────────────────────────────────────────────────── */}
          <View style={{ height: COVER_H, width: '100%', overflow: 'hidden', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            {item.thumbnail_url ? (
              <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={52} color="rgba(255,255,255,0.25)" />
                </View>
              </LinearGradient>
            )}

            {/* Gradient bas */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.72)']}
              style={[StyleSheet.absoluteFill, { top: '30%' }]}
            />

            {/* Badge type haut gauche */}
            <View style={{ position: 'absolute', top: 12, left: 12 }}>
              <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.typePill}>
                <Icon name={icon} size={10} color="#fff" />
                <Text style={st.typePillText}>{label.toUpperCase()}</Text>
              </LinearGradient>
            </View>

            {/* Badge distance haut droite */}
            {distLabel ? (
              <View style={[st.distPill, { position: 'absolute', top: 12, right: 12 }]}>
                <Icon name="navigation" size={10} color="#fff" />
                <Text style={st.distTxt}>{distLabel}</Text>
              </View>
            ) : null}

            {/* Titre + date en bas cover */}
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14 }}>
              <Text style={st.coverTitle} numberOfLines={2}>{item.title}</Text>
              {item.starts_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <Icon name="clock" size={11} color="rgba(255,255,255,0.7)" />
                  <Text style={st.coverDate}>
                    {formatDate(item.starts_at)} · {formatTime(item.starts_at)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Body ──────────────────────────────────────────────────── */}
          <View style={st.body}>
            {/* Lieu */}
            {(item.venue_name || item.venue_city) && (
              <View style={st.bodyRow}>
                <View style={[st.bodyIconWrap, { backgroundColor: grad[0] + '22' }]}>
                  <Icon name="map-pin" size={13} color={grad[0]} />
                </View>
                <View style={{ flex: 1 }}>
                  {item.venue_name && (
                    <Text style={[st.bodyMain, { color: colors.textPrimary }]} numberOfLines={1}>{item.venue_name}</Text>
                  )}
                  {item.venue_city && (
                    <Text style={[st.bodySub, { color: colors.textTertiary }]}>{item.venue_city}{item.venue_country ? `, ${item.venue_country}` : ''}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Participants */}
            {item.max_attendees != null && (
              <View style={st.bodyRow}>
                <View style={[st.bodyIconWrap, { backgroundColor: grad[1] + '22' }]}>
                  <Icon name="users" size={13} color={grad[1]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.bodyMain, { color: colors.textPrimary }]}>
                    {item.current_attendees ?? 0} / {item.max_attendees} participants
                  </Text>
                  {/* Barre capacité */}
                  <View style={[st.capTrack, { backgroundColor: colors.backgroundSecondary }]}>
                    <LinearGradient
                      colors={grad}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[st.capFill, { width: `${Math.min(((item.current_attendees ?? 0) / item.max_attendees) * 100, 100)}%` as any }]}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Prix */}
            <View style={[st.footer, { borderTopColor: colors.divider }]}>
              <View>
                {isFree ? (
                  <View style={[st.freeBadge, { borderColor: '#10B981' }]}>
                    <Icon name="gift" size={11} color="#10B981" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981' }}>Entrée gratuite</Text>
                  </View>
                ) : minPrice != null ? (
                  <View>
                    <Text style={[st.priceLabel, { color: colors.textTertiary }]}>À partir de</Text>
                    <Text style={[st.priceValue, { color: grad[0] }]}>{minPrice.toLocaleString('fr')} €</Text>
                  </View>
                ) : null}
              </View>

              <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.goBtn}>
                <Text style={st.goBtnText}>Voir</Text>
                <Icon name="arrow-right" size={13} color="#fff" />
              </LinearGradient>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────

export const NearbyEventsScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav = useNavigation<Nav>();
  const location = useUserLocation();

  const [radius, setRadius] = useState<Radius>(10);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [noGeo, setNoGeo] = useState(false);

  const load = useCallback(async (r: Radius) => {
    if (!location) { setNoGeo(true); setLoading(false); return; }
    setNoGeo(false);
    setLoading(true);
    try {
      const data = await eventService.list({
        limit: 50, lat: location.lat, lon: location.lon,
        radius_km: r, status: 'published', noCache: true,
      });
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { load(radius); }, [radius, location]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle={colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'} />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: Platform.OS === 'ios' ? 56 : 44 }]}>
        <View style={st.headerContent}>
          <TouchableOpacity
            onPress={() => nav.goBack()}
            style={[st.backBtn, { backgroundColor: colors.backgroundSecondary }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="arrow-left" size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Près de toi</Text>
            <Text style={[st.headerSub, { color: colors.textTertiary }]}>
              {location
                ? loading
                  ? 'Recherche en cours...'
                  : `${events.length} événement${events.length > 1 ? 's' : ''} · ${radius} km`
                : 'Localisation non disponible'}
            </Text>
          </View>

          {!loading && events.length > 0 && (
            <View style={[st.statPill, { backgroundColor: colors.primary + '18' }]}>
              <Icon name="map-pin" size={11} color={colors.primary} />
              <Text style={[st.statPillText, { color: colors.primary }]}>{events.length}</Text>
            </View>
          )}
        </View>

        {/* Sélecteur rayon */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.radiusRow}>
          <Text style={[st.radiusLabelTxt, { color: colors.textTertiary }]}>Rayon</Text>
          {RADII.map(r => (
            <TouchableOpacity
              key={r}
              onPress={() => setRadius(r)}
              style={[
                st.radiusChip,
                radius === r
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
              ]}
            >
              <Text style={[st.radiusChipText, { color: radius === r ? '#fff' : colors.textSecondary }]}>
                {r} km
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Contenu ──────────────────────────────────────────────────── */}
      {noGeo ? (
        <View style={st.empty}>
          <LinearGradient colors={['#7B3FF222', '#7B3FF208']} style={st.emptyIconWrap}>
            <Icon name="map-pin" size={38} color="#7B3FF2" />
          </LinearGradient>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Localisation désactivée</Text>
          <Text style={[st.emptySub, { color: colors.textTertiary }]}>
            Active ta localisation dans les réglages pour découvrir les événements autour de toi.
          </Text>
        </View>
      ) : loading ? (
        <View style={st.empty}>
          <ActivityIndicator size="large" color="#7B3FF2" />
          <Text style={{ color: colors.textTertiary, marginTop: 16, fontSize: 14 }}>
            Recherche d'événements à {radius} km...
          </Text>
        </View>
      ) : events.length === 0 ? (
        <View style={st.empty}>
          <LinearGradient colors={['#7B3FF222', '#7B3FF208']} style={st.emptyIconWrap}>
            <Icon name="calendar" size={38} color="#7B3FF2" />
          </LinearGradient>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Aucun événement</Text>
          <Text style={[st.emptySub, { color: colors.textTertiary }]}>
            Rien dans un rayon de {radius} km.{'\n'}Essaie d'augmenter le rayon.
          </Text>
          <TouchableOpacity
            onPress={() => setRadius(RADII[Math.min(RADII.indexOf(radius) + 1, RADII.length - 1)])}
            style={st.enlargeBtn}
          >
            <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.enlargeBtnInner}>
              <Icon name="maximize-2" size={14} color="#fff" />
              <Text style={st.enlargeBtnText}>Élargir le rayon</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          renderItem={({ item, index }) => (
            <EventCard
              item={item}
              index={index}
              colors={colors}
              onPress={() => nav.navigate('EventDetail', { eventId: item.id })}
            />
          )}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // Header
  header:        { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerContent: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backBtn:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  headerSub:     { fontSize: 12, marginTop: 2 },
  statPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statPillText:  { fontSize: 13, fontWeight: '800' },

  // Radius
  radiusRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2 },
  radiusLabelTxt: { fontSize: 12, fontWeight: '600', marginRight: 2 },
  radiusChip:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  radiusChipText: { fontSize: 12, fontWeight: '700' },

  // Card
  card:     { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 5 },
  coverTitle: { fontSize: 17, fontWeight: '900', color: '#fff', lineHeight: 22 },
  coverDate:  { fontSize: 11, color: 'rgba(255,255,255,0.72)' },
  typePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typePillText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  distPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  distTxt:    { fontSize: 10, fontWeight: '700', color: '#fff' },

  // Body
  body:         { padding: 14, gap: 10 },
  bodyRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bodyIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  bodyMain:     { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  bodySub:      { fontSize: 11, marginTop: 1 },
  capTrack:     { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  capFill:      { height: '100%', borderRadius: 2 },

  // Footer
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 2 },
  freeBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  priceLabel: { fontSize: 10, fontWeight: '600' },
  priceValue: { fontSize: 16, fontWeight: '900' },
  goBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  goBtnText:  { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Empty
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:    { fontSize: 18, fontWeight: '800' },
  emptySub:      { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  enlargeBtn:    { marginTop: 6, borderRadius: 14, overflow: 'hidden' },
  enlargeBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 13 },
  enlargeBtnText:  { fontSize: 14, fontWeight: '800', color: '#fff' },
});
