import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { CommunityEvent } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type RsvpStatus = 'going' | 'maybe' | 'not_going';

const TABS = [
  { key: 'all',      label: 'Tous'         },
  { key: 'upcoming', label: 'À venir'      },
  { key: 'online',   label: 'En ligne'     },
  { key: 'going',    label: 'Je participe' },
];

const MONTH_NAMES = ['jan.', 'fév.', 'mar.', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sep.', 'oct.', 'nov.', 'déc.'];
const DAY_NAMES   = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

function formatDate(dateStr: string, endStr?: string | null): string {
  const d = new Date(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const day     = d.getDate();
  const month   = MONTH_NAMES[d.getMonth()];
  const sh = `${d.getHours()}h${d.getMinutes().toString().padStart(2, '0')}`;
  if (endStr) {
    const e = new Date(endStr);
    const eh = `${e.getHours()}h${e.getMinutes().toString().padStart(2, '0')}`;
    return `${dayName} ${day} ${month} · ${sh} → ${eh}`;
  }
  return `${dayName} ${day} ${month} · ${sh}`;
}

function getRsvpNext(s: RsvpStatus | null): RsvpStatus {
  if (s === 'going') return 'maybe';
  if (s === 'maybe') return 'not_going';
  return 'going';
}

function getRsvpLabel(s: RsvpStatus | null): string {
  if (s === 'going')     return '✓ Je participe';
  if (s === 'maybe')     return '★ Peut-être';
  if (s === 'not_going') return '✗ Je ne viens pas';
  return '+ Participer';
}

function getRsvpColor(s: RsvpStatus | null): string {
  if (s === 'going')     return '#10B981';
  if (s === 'maybe')     return '#F59E0B';
  if (s === 'not_going') return '#EF4444';
  return '#7B3FF2';
}

// ─── EventCard ────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: CommunityEvent;
  rsvpStatus: RsvpStatus | null;
  onRsvpChange: (id: string, next: RsvpStatus) => void;
  colors: any;
  index: number;
}

function EventCard({ event, rsvpStatus, onRsvpChange, colors, index }: EventCardProps) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay: index * 90, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, delay: index * 90, useNativeDriver: true }),
    ]).start();
  }, []);

  const cardColor = event.color ?? '#7B3FF2';
  const isPast    = event.status === 'past' || event.status === 'cancelled';

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Cover */}
      <LinearGradient
        colors={isPast ? ['#555', '#333'] : [cardColor, cardColor + 'BB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cover}
      >
        <Text style={styles.coverEmoji}>📅</Text>
        <View style={styles.coverBadges}>
          {event.is_online && (
            <View style={[styles.badge, { backgroundColor: '#3B82F6' }]}>
              <Text style={styles.badgeText}>EN LIGNE</Text>
            </View>
          )}
          {event.status === 'cancelled' && (
            <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.badgeText}>ANNULÉ</Text>
            </View>
          )}
          {event.status === 'ongoing' && (
            <View style={[styles.badge, { backgroundColor: '#10B981' }]}>
              <Text style={styles.badgeText}>EN COURS</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Body */}
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaIcon}>📅</Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {formatDate(event.starts_at, event.ends_at)}
          </Text>
        </View>

        {event.location && (
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>📍</Text>
            <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}

        {event.organizer && (
          <Text style={[styles.organizerText, { color: colors.textTertiary }]}>
            Par {event.organizer.display_name ?? event.organizer.username ?? 'Organisateur'}
          </Text>
        )}

        {/* RSVP counts */}
        <View style={styles.countsRow}>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            ✓ {event.going_count} participant{event.going_count > 1 ? 's' : ''}
          </Text>
          {event.maybe_count > 0 && (
            <Text style={[styles.countText, { color: colors.textTertiary }]}>
              · ★ {event.maybe_count} peut-être
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      {/* Footer RSVP */}
      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={[styles.rsvpBtn, { backgroundColor: isPast ? colors.border : getRsvpColor(rsvpStatus) }]}
          onPress={() => !isPast && onRsvpChange(event.id, getRsvpNext(rsvpStatus))}
          activeOpacity={0.8}
          disabled={isPast}
        >
          <Text style={[styles.rsvpBtnText, isPast && { color: colors.textTertiary }]}>
            {isPast ? (event.status === 'past' ? 'Terminé' : 'Annulé') : getRsvpLabel(rsvpStatus)}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

interface Props {
  route: { params: { communityId: string } };
}

export function CommunityEventsScreen({ route }: Props) {
  const { communityId } = route.params;
  const navigation = useNavigation<NavigationProp>();
  const insets     = useSafeAreaInsets();
  const { theme: { colors } } = useTheme();

  const [activeTab,  setActiveTab]  = useState<string>('all');
  const [events,     setEvents]     = useState<CommunityEvent[]>([]);
  const [rsvpMap,    setRsvpMap]    = useState<Record<string, RsvpStatus | null>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const data = await communityService.getEvents(communityId);
      const list = Array.isArray(data) ? data : [];
      setEvents(list);
      setRsvpMap(prev => {
        const next = { ...prev };
        list.forEach(e => {
          if (!(e.id in next)) next[e.id] = e.rsvp_status ?? null;
        });
        return next;
      });
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId]);

  useEffect(() => {
    load();
    Animated.timing(headerFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleRsvp = async (id: string, next: RsvpStatus) => {
    const prev = rsvpMap[id];
    setRsvpMap(m => ({ ...m, [id]: next }));
    try {
      const updated = await communityService.rsvpEvent(communityId, id, next);
      setEvents(evs => evs.map(e => e.id === id ? { ...e, going_count: updated.going_count, maybe_count: updated.maybe_count } : e));
    } catch {
      setRsvpMap(m => ({ ...m, [id]: prev }));
      Alert.alert('Erreur', 'Impossible de mettre à jour votre participation.');
    }
  };

  const now = new Date();
  const filtered = events.filter(e => {
    switch (activeTab) {
      case 'upcoming': return e.status === 'upcoming' || new Date(e.starts_at) > now;
      case 'online':   return e.is_online;
      case 'going':    return rsvpMap[e.id] === 'going';
      default:         return true;
    }
  });

  const goingCount = Object.values(rsvpMap).filter(s => s === 'going').length;

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <Animated.View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: colors.background, borderBottomColor: colors.border, opacity: headerFade }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerMiddle}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Événements</Text>
          <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.countBadgeText}>{events.length}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => Alert.alert('Bientôt disponible', "La création d'événements arrive prochainement.")}
        >
          <Icon name="plus" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabsBar, { backgroundColor: colors.background }]} contentContainerStyle={styles.tabsBarContent}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>
                {tab.label}{tab.key === 'going' && goingCount > 0 ? ` (${goingCount})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <ScrollView
        style={styles.listArea}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Aucun événement</Text>
            <Text style={[styles.emptySub, { color: colors.textTertiary }]}>
              Aucun événement dans cette catégorie pour l'instant.
            </Text>
          </View>
        ) : (
          filtered.map((event, idx) => (
            <EventCard
              key={event.id}
              event={event}
              rsvpStatus={rsvpMap[event.id] ?? null}
              onRsvpChange={handleRsvp}
              colors={colors}
              index={idx}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerMiddle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', letterSpacing: 0.2 },
  countBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  tabsBar: { flexGrow: 0 },
  tabsBarContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  tabText: { fontSize: 14 },

  listArea: { flex: 1 },

  card: { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cover: { height: 120, alignItems: 'center', justifyContent: 'center' },
  coverEmoji: { fontSize: 44 },
  coverBadges: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  cardBody: { padding: 16, gap: 6 },
  cardTitle: { fontSize: 17, fontWeight: '700', lineHeight: 24, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaIcon: { fontSize: 14 },
  metaText: { fontSize: 13, flex: 1 },
  organizerText: { fontSize: 12, marginTop: 2 },

  countsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  countText: { fontSize: 13 },

  divider: { height: 1, marginHorizontal: 16 },
  cardFooter: { padding: 12, paddingHorizontal: 16 },
  rsvpBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  rsvpBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 72, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
