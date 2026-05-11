import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import type { MainStackParamList } from '../../navigation/MainNavigator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

type RsvpStatus = 'going' | 'interested' | 'none';

interface Organizer {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  end_date: string;
  location: string;
  is_online: boolean;
  cover_url: string | null;
  organizer: Organizer;
  rsvp_count: number;
  rsvp_status: RsvpStatus;
  max_attendees: number | null;
  is_free: boolean;
  price?: number;
  category: string;
  color: string;
}

type FilterTab = 'all' | 'upcoming' | 'online' | 'going';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_EVENTS: Event[] = [
  {
    id: '1',
    title: 'Soirée Gaming Night',
    description:
      'Venez nous rejoindre pour une soirée gaming entre membres ! Tournoi Valorant + Mario Kart. Pizzas offertes par les organisateurs.',
    date: '2026-05-18T20:00:00',
    end_date: '2026-05-19T00:00:00',
    location: 'Discord + IRL Paris 11e',
    is_online: false,
    cover_url: null,
    organizer: { id: '1', name: 'Sophie Martin', avatar_url: null },
    rsvp_count: 34,
    rsvp_status: 'going',
    max_attendees: 50,
    is_free: true,
    category: 'gaming',
    color: '#7B3FF2',
  },
  {
    id: '2',
    title: 'Live Q&A avec les modérateurs',
    description:
      'Session de questions/réponses ouverte à tous les membres. Abordez les sujets qui vous tiennent à cœur sur la communauté.',
    date: '2026-05-22T18:00:00',
    end_date: '2026-05-22T19:30:00',
    location: 'Discord',
    is_online: true,
    cover_url: null,
    organizer: { id: '2', name: 'Lucas Dupont', avatar_url: null },
    rsvp_count: 67,
    rsvp_status: 'interested',
    max_attendees: null,
    is_free: true,
    category: 'discussion',
    color: '#3B82F6',
  },
  {
    id: '3',
    title: 'Atelier Création Contenu',
    description:
      'Workshop pratique : apprenez à créer du contenu engageant pour la communauté. Niveau débutant, matériel fourni.',
    date: '2026-05-30T14:00:00',
    end_date: '2026-05-30T17:00:00',
    location: 'Paris 2e - Salle coworking',
    is_online: false,
    cover_url: null,
    organizer: { id: '1', name: 'Sophie Martin', avatar_url: null },
    rsvp_count: 18,
    rsvp_status: 'none',
    max_attendees: 20,
    is_free: false,
    price: 15,
    category: 'workshop',
    color: '#10B981',
  },
  {
    id: '4',
    title: 'Meetup mensuel Juin',
    description:
      'Le rendez-vous mensuel incontournable ! Networking, nouveautés communauté, annonces exclusives.',
    date: '2026-06-07T19:00:00',
    end_date: '2026-06-07T22:00:00',
    location: 'Paris 9e - Le Hub',
    is_online: false,
    cover_url: null,
    organizer: { id: '5', name: 'Jade Moreau', avatar_url: null },
    rsvp_count: 89,
    rsvp_status: 'going',
    max_attendees: 100,
    is_free: true,
    category: 'meetup',
    color: '#FF7A2F',
  },
  {
    id: '5',
    title: 'Podcast live : Futur de la communauté',
    description:
      'Enregistrement public de notre podcast mensuel. Invités surprise annoncés le jour J !',
    date: '2026-06-14T17:00:00',
    end_date: '2026-06-14T19:00:00',
    location: 'YouTube Live',
    is_online: true,
    cover_url: null,
    organizer: { id: '2', name: 'Lucas Dupont', avatar_url: null },
    rsvp_count: 124,
    rsvp_status: 'none',
    max_attendees: null,
    is_free: true,
    category: 'podcast',
    color: '#E0389A',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  gaming: { emoji: '🎮', label: 'Gaming' },
  discussion: { emoji: '💬', label: 'Discussion' },
  workshop: { emoji: '🔧', label: 'Workshop' },
  meetup: { emoji: '🤝', label: 'Meetup' },
  podcast: { emoji: '🎙️', label: 'Podcast' },
};

const AVATAR_COLORS = ['#7B3FF2', '#3B82F6', '#10B981', '#FF7A2F', '#E0389A'];

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
  const months = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];
  const dayName = days[d.getDay()];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${dayName} ${day} ${month} · ${hours}h${minutes}`;
}

function calcDuration(startStr: string, endStr: string): string {
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diffMin = Math.round((end - start) / 60000);
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;
}

function isUpcoming(dateStr: string): boolean {
  return new Date(dateStr).getTime() > Date.now();
}

function isFull(event: Event): boolean {
  return event.max_attendees !== null && event.rsvp_count >= event.max_attendees;
}

function nextRsvpStatus(current: RsvpStatus): RsvpStatus {
  if (current === 'none') return 'going';
  if (current === 'going') return 'interested';
  return 'none';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RsvpButtonProps {
  status: RsvpStatus;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
}

function RsvpButton({ status, onPress, colors }: RsvpButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const config: Record<RsvpStatus, { label: string; iconName: string; bg: string; textColor: string }> = {
    going: { label: 'Je participe', iconName: 'check-circle', bg: '#10B981', textColor: '#fff' },
    interested: { label: 'Intéressé', iconName: 'star', bg: '#FF7A2F', textColor: '#fff' },
    none: { label: 'Participer', iconName: 'plus-circle', bg: colors.primary, textColor: '#fff' },
  };

  const { label, iconName, bg, textColor } = config[status];

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        style={[styles.rsvpButton, { backgroundColor: bg }]}
      >
        <Icon name={iconName} size={15} color={textColor} />
        <Text style={[styles.rsvpButtonText, { color: textColor }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Event Card
// ---------------------------------------------------------------------------

interface EventCardProps {
  event: Event;
  rsvpStatus: RsvpStatus;
  onRsvpPress: (id: string) => void;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
  animValue: Animated.Value;
}

function EventCard({ event, rsvpStatus, onRsvpPress, colors, animValue }: EventCardProps) {
  const full = isFull(event);
  const meta = CATEGORY_META[event.category] ?? { emoji: '📅', label: event.category };
  const fillRatio =
    event.max_attendees !== null
      ? Math.min(event.rsvp_count / event.max_attendees, 1)
      : null;

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        { opacity: animValue, transform: [{ translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
      ]}
    >
      {/* Cover */}
      <LinearGradient
        colors={[event.color, `${event.color}99`, `${event.color}33`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.coverGradient}
      >
        <Text style={styles.coverEmoji}>{meta.emoji}</Text>

        <View style={styles.coverBadges}>
          {event.is_online && (
            <View style={[styles.badge, { backgroundColor: '#3B82F6' }]}>
              <Icon name="wifi" size={10} color="#fff" />
              <Text style={styles.badgeText}>EN LIGNE</Text>
            </View>
          )}
          {full && (
            <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.badgeText}>COMPLET</Text>
            </View>
          )}
        </View>

        <View style={[styles.categoryPill, { backgroundColor: `${event.color}CC` }]}>
          <Text style={styles.categoryPillText}>{meta.label}</Text>
        </View>
      </LinearGradient>

      {/* Body */}
      <View style={styles.cardBody}>
        {/* Title */}
        <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>

        {/* Date row */}
        <View style={styles.metaRow}>
          <Icon name="calendar" size={13} color={colors.primary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {formatEventDate(event.date)}
          </Text>
          <View style={[styles.dot, { backgroundColor: colors.textTertiary }]} />
          <Icon name="clock" size={13} color={colors.textTertiary} />
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>
            {calcDuration(event.date, event.end_date)}
          </Text>
        </View>

        {/* Location row */}
        <View style={styles.metaRow}>
          <Icon
            name={event.is_online ? 'wifi' : 'map-pin'}
            size={13}
            color={event.is_online ? '#3B82F6' : colors.textTertiary}
          />
          <Text
            style={[styles.metaText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {event.location}
          </Text>
        </View>

        {/* Description */}
        <Text style={[styles.description, { color: colors.textTertiary }]} numberOfLines={3}>
          {event.description}
        </Text>

        {/* Price + organizer row */}
        <View style={styles.priceOrgRow}>
          {event.is_free ? (
            <View style={[styles.priceBadge, { backgroundColor: '#10B98122' }]}>
              <Text style={[styles.priceBadgeText, { color: '#10B981' }]}>GRATUIT</Text>
            </View>
          ) : (
            <View style={[styles.priceBadge, { backgroundColor: '#FF7A2F22' }]}>
              <Text style={[styles.priceBadgeText, { color: '#FF7A2F' }]}>
                {event.price} €
              </Text>
            </View>
          )}

          <View style={styles.organizerRow}>
            <View style={[styles.organizerAvatar, { backgroundColor: event.color }]}>
              <Text style={styles.organizerAvatarText}>
                {event.organizer.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.organizerName, { color: colors.textSecondary }]} numberOfLines={1}>
              {event.organizer.name}
            </Text>
          </View>
        </View>

        {/* Attendees row */}
        <View style={styles.attendeesRow}>
          <View style={styles.stackedAvatars}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.stackedAvatar,
                  { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length], marginLeft: i === 0 ? 0 : -8 },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.attendeesText, { color: colors.textSecondary }]}>
            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
              {event.rsvp_count}
            </Text>
            {event.max_attendees !== null
              ? `/${event.max_attendees} participants`
              : ' participants'}
          </Text>
        </View>

        {/* Fill gauge */}
        {fillRatio !== null && (
          <View style={[styles.gaugeTrack, { backgroundColor: colors.backgroundSecondary }]}>
            <View
              style={[
                styles.gaugeFill,
                {
                  width: `${fillRatio * 100}%` as any,
                  backgroundColor: fillRatio >= 1 ? '#EF4444' : colors.primary,
                },
              ]}
            />
          </View>
        )}

        {/* RSVP button */}
        <RsvpButton
          status={rsvpStatus}
          onPress={() => onRsvpPress(event.id)}
          colors={colors}
        />
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

interface RouteParams {
  communityId: string;
  communityName: string;
}

interface Props {
  route: { params: RouteParams };
}

export function CommunityEventsScreen({ route }: Props) {
  const { communityName } = route.params;
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { theme: { colors } } = useTheme();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [rsvpMap, setRsvpMap] = useState<Record<string, RsvpStatus>>(() => {
    const map: Record<string, RsvpStatus> = {};
    MOCK_EVENTS.forEach((e) => { map[e.id] = e.rsvp_status; });
    return map;
  });

  // One animated value per card
  const cardAnims = useRef<Animated.Value[]>(
    MOCK_EVENTS.map(() => new Animated.Value(0)),
  ).current;

  // Filter logic
  const filteredEvents = MOCK_EVENTS.filter((e) => {
    if (activeFilter === 'upcoming') return isUpcoming(e.date);
    if (activeFilter === 'online') return e.is_online;
    if (activeFilter === 'going') return rsvpMap[e.id] === 'going';
    return true;
  });

  // Animate cards when filter changes
  useEffect(() => {
    cardAnims.forEach((anim) => anim.setValue(0));
    const animations = cardAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 350,
        delay: i * 60,
        useNativeDriver: true,
      }),
    );
    Animated.stagger(60, animations).start();
  }, [activeFilter]);

  // Initial mount animation
  useEffect(() => {
    const animations = cardAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: i * 70,
        useNativeDriver: true,
      }),
    );
    Animated.stagger(70, animations).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRsvpToggle = (eventId: string) => {
    setRsvpMap((prev) => ({
      ...prev,
      [eventId]: nextRsvpStatus(prev[eventId] ?? 'none'),
    }));
  };

  const handleCreateEvent = () => {
    Alert.alert(
      'Bientôt disponible',
      "La création d'événements sera disponible dans une prochaine version.",
      [{ text: 'OK', style: 'default' }],
    );
  };

  const FILTERS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'upcoming', label: 'À venir' },
    { key: 'online', label: 'En ligne' },
    { key: 'going', label: 'Je participe' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Événements
          </Text>
          <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.countBadgeText}>{MOCK_EVENTS.length}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: `${colors.primary}22` }]}
          onPress={handleCreateEvent}
          activeOpacity={0.7}
        >
          <Icon name="plus" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Community name subtitle */}
      <View style={[styles.subtitleRow, { backgroundColor: colors.background }]}>
        <Icon name="users" size={13} color={colors.textTertiary} />
        <Text style={[styles.subtitleText, { color: colors.textTertiary }]}>
          {communityName}
        </Text>
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabsWrapper, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {FILTERS.map((f) => {
            const isActive = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.tab,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
                onPress={() => setActiveFilter(f.key)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: isActive ? '#fff' : colors.textSecondary },
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Events list */}
      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {filteredEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Aucun événement
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              {activeFilter === 'going'
                ? "Vous ne participez à aucun événement pour l'instant."
                : activeFilter === 'online'
                ? "Aucun événement en ligne prévu."
                : activeFilter === 'upcoming'
                ? "Aucun événement à venir pour le moment."
                : "Cette communauté n'a pas encore d'événements."}
            </Text>
          </View>
        ) : (
          filteredEvents.map((event, index) => {
            // Map filtered index back to original for animation
            const originalIndex = MOCK_EVENTS.findIndex((e) => e.id === event.id);
            return (
              <EventCard
                key={event.id}
                event={event}
                rsvpStatus={rsvpMap[event.id] ?? 'none'}
                onRsvpPress={handleRsvpToggle}
                colors={colors}
                animValue={cardAnims[originalIndex] ?? cardAnims[index % cardAnims.length]}
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  countBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  createButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 19,
  },

  // Subtitle
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 5,
  },
  subtitleText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Tabs
  tabsWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },

  // Card
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  coverGradient: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  coverEmoji: {
    fontSize: 52,
  },
  coverBadges: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  categoryPill: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  categoryPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    padding: 16,
    gap: 10,
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },

  // Price + organizer
  priceOrgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '60%',
  },
  organizerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  organizerAvatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  organizerName: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },

  // Attendees
  attendeesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stackedAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  attendeesText: {
    fontSize: 13,
  },

  // Gauge
  gaugeTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 2,
  },

  // RSVP button
  rsvpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 2,
  },
  rsvpButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
});

export default CommunityEventsScreen;
