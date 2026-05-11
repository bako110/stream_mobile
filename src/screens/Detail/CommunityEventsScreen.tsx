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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
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

const EVENT_COLORS = [
  '#7B3FF2', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6',
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
  if (s === 'going')     return 'Je participe';
  if (s === 'maybe')     return 'Peut-être';
  if (s === 'not_going') return 'Je ne viens pas';
  return 'Participer';
}

function getRsvpColor(s: RsvpStatus | null): string {
  if (s === 'going')     return '#10B981';
  if (s === 'maybe')     return '#F59E0B';
  if (s === 'not_going') return '#EF4444';
  return '#7B3FF2';
}

// ─── toLocalISOInput ─────────────────────────────────────────────────────────
// Converts a Date to "YYYY-MM-DDTHH:MM" for display in TextInput
function toLocalISOInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Parses "YYYY-MM-DDTHH:MM" → ISO string
function parseInputToISO(s: string): string | null {
  if (!s.trim()) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ─── EventCard ────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: CommunityEvent;
  rsvpStatus: RsvpStatus | null;
  onRsvpChange: (id: string, next: RsvpStatus) => void;
  onEdit: (event: CommunityEvent) => void;
  onCancel: (event: CommunityEvent) => void;
  onDelete: (event: CommunityEvent) => void;
  isAdmin: boolean;
  colors: any;
  index: number;
}

function EventCard({ event, rsvpStatus, onRsvpChange, onEdit, onCancel, onDelete, isAdmin, colors, index }: EventCardProps) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay: index * 70, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 70, useNativeDriver: true }),
    ]).start();
  }, []);

  const cardColor = event.color ?? '#7B3FF2';
  const isPast    = event.status === 'past' || event.status === 'cancelled';
  const isCancelled = event.status === 'cancelled';

  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {/* Cover */}
      <LinearGradient
        colors={isPast ? ['#444', '#2A2A2A'] : [cardColor, cardColor + 'BB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cover}
      >
        <View style={styles.coverBadges}>
          {event.is_online && (
            <View style={[styles.badge, { backgroundColor: '#3B82F6' }]}>
              <Text style={styles.badgeText}>EN LIGNE</Text>
            </View>
          )}
          {isCancelled && (
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

        <View style={styles.coverCenter}>
          <View style={[styles.dateCircle, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
            <Text style={styles.dateCircleDay}>{new Date(event.starts_at).getDate()}</Text>
            <Text style={styles.dateCircleMon}>{MONTH_NAMES[new Date(event.starts_at).getMonth()].toUpperCase()}</Text>
          </View>
        </View>

        {/* Admin actions */}
        {isAdmin && !isCancelled && event.status !== 'past' && (
          <View style={styles.adminActions}>
            <TouchableOpacity
              style={styles.adminBtn}
              onPress={() => onEdit(event)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="edit-2" size={13} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.adminBtn, { backgroundColor: 'rgba(239,68,68,0.75)' }]}
              onPress={() => onCancel(event)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="x" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        {isAdmin && (
          <TouchableOpacity
            style={[styles.deleteBtn]}
            onPress={() => onDelete(event)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="trash-2" size={12} color="#EF4444" />
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* Body */}
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={styles.metaRow}>
          <Icon name="calendar" size={13} color={colors.textTertiary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {formatDate(event.starts_at, event.ends_at)}
          </Text>
        </View>

        {event.location && (
          <View style={styles.metaRow}>
            <Icon name="map-pin" size={13} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}

        {event.description ? (
          <Text style={[styles.eventDesc, { color: colors.textTertiary }]} numberOfLines={2}>
            {event.description}
          </Text>
        ) : null}

        {event.organizer && (
          <Text style={[styles.organizerText, { color: colors.textTertiary }]}>
            Organisé par {event.organizer.display_name ?? event.organizer.username ?? 'Organisateur'}
          </Text>
        )}

        <View style={styles.countsRow}>
          <View style={[styles.countPill, { backgroundColor: '#10B98115' }]}>
            <Icon name="check" size={11} color="#10B981" />
            <Text style={[styles.countText, { color: '#10B981' }]}>
              {event.going_count} participant{event.going_count > 1 ? 's' : ''}
            </Text>
          </View>
          {event.maybe_count > 0 && (
            <View style={[styles.countPill, { backgroundColor: '#F59E0B15' }]}>
              <Icon name="star" size={11} color="#F59E0B" />
              <Text style={[styles.countText, { color: '#F59E0B' }]}>
                {event.maybe_count} peut-être
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      {/* Footer RSVP */}
      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={[
            styles.rsvpBtn,
            isPast
              ? { backgroundColor: colors.backgroundSecondary }
              : rsvpStatus
              ? { backgroundColor: getRsvpColor(rsvpStatus) + '18', borderColor: getRsvpColor(rsvpStatus) + '50', borderWidth: 1 }
              : { backgroundColor: colors.primary },
          ]}
          onPress={() => !isPast && onRsvpChange(event.id, getRsvpNext(rsvpStatus))}
          activeOpacity={0.8}
          disabled={isPast}
        >
          {!isPast && rsvpStatus && (
            <Icon name={rsvpStatus === 'going' ? 'check' : rsvpStatus === 'maybe' ? 'star' : 'x'} size={14} color={getRsvpColor(rsvpStatus)} style={{ marginRight: 6 }} />
          )}
          <Text style={[
            styles.rsvpBtnText,
            isPast
              ? { color: colors.textTertiary }
              : rsvpStatus
              ? { color: getRsvpColor(rsvpStatus) }
              : { color: '#fff' },
          ]}>
            {isPast ? (isCancelled ? 'Annulé' : 'Terminé') : getRsvpLabel(rsvpStatus)}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── EventFormModal ───────────────────────────────────────────────────────────

interface EventFormModalProps {
  visible: boolean;
  initial?: CommunityEvent | null;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description?: string;
    location?: string;
    color?: string;
    is_online: boolean;
    starts_at: string;
    ends_at?: string;
  }) => Promise<void>;
  colors: any;
  insets: { bottom: number; top: number };
}

function EventFormModal({ visible, initial, onClose, onSave, colors, insets }: EventFormModalProps) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const defaultStart = toLocalISOInput(now);
  const defaultEnd   = toLocalISOInput(new Date(now.getTime() + 2 * 60 * 60 * 1000));

  const [title,    setTitle]    = useState('');
  const [desc,     setDesc]     = useState('');
  const [location, setLocation] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [color,    setColor]    = useState(EVENT_COLORS[0]);
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt,   setEndsAt]   = useState(defaultEnd);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (visible) {
      if (initial) {
        setTitle(initial.title);
        setDesc(initial.description ?? '');
        setLocation(initial.location ?? '');
        setIsOnline(initial.is_online);
        setColor(initial.color ?? EVENT_COLORS[0]);
        setStartsAt(toLocalISOInput(new Date(initial.starts_at)));
        setEndsAt(initial.ends_at ? toLocalISOInput(new Date(initial.ends_at)) : '');
      } else {
        const n = new Date();
        n.setMinutes(n.getMinutes() + 30);
        setTitle('');
        setDesc('');
        setLocation('');
        setIsOnline(false);
        setColor(EVENT_COLORS[0]);
        setStartsAt(toLocalISOInput(n));
        setEndsAt(toLocalISOInput(new Date(n.getTime() + 2 * 60 * 60 * 1000)));
      }
    }
  }, [visible, initial]);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Erreur', 'Le titre est requis.'); return; }
    const starts = parseInputToISO(startsAt);
    if (!starts) { Alert.alert('Erreur', 'Date de début invalide. Format : AAAA-MM-JJTHH:MM'); return; }
    const ends = endsAt.trim() ? parseInputToISO(endsAt) : undefined;
    if (endsAt.trim() && !ends) { Alert.alert('Erreur', 'Date de fin invalide. Format : AAAA-MM-JJTHH:MM'); return; }

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: desc.trim() || undefined,
        location: location.trim() || undefined,
        color,
        is_online: isOnline,
        starts_at: starts,
        ends_at: ends ?? undefined,
      });
      onClose();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalKav, { paddingBottom: insets.bottom }]}
        pointerEvents="box-none"
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          {/* Handle */}
          <View style={[styles.sheetHandle, { backgroundColor: colors.divider }]} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="x" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {initial ? 'Modifier l\'événement' : 'Nouvel événement'}
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Enregistrer</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">

            {/* Titre */}
            <Text style={[styles.formLabel, { color: colors.textTertiary }]}>TITRE *</Text>
            <View style={[styles.formField, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <TextInput
                style={[styles.formInput, { color: colors.textPrimary }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Titre de l'événement"
                placeholderTextColor={colors.textTertiary}
                maxLength={120}
              />
            </View>

            {/* Description */}
            <Text style={[styles.formLabel, { color: colors.textTertiary, marginTop: 14 }]}>DESCRIPTION</Text>
            <View style={[styles.formField, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, minHeight: 80 }]}>
              <TextInput
                style={[styles.formInput, { color: colors.textPrimary, textAlignVertical: 'top' }]}
                value={desc}
                onChangeText={setDesc}
                placeholder="Décrivez l'événement (optionnel)"
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={500}
              />
            </View>

            {/* Lieu */}
            <Text style={[styles.formLabel, { color: colors.textTertiary, marginTop: 14 }]}>LIEU</Text>
            <View style={[styles.formField, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Icon name="map-pin" size={15} color={colors.textTertiary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.formInput, { color: colors.textPrimary }]}
                value={location}
                onChangeText={setLocation}
                placeholder="Adresse, lien Zoom, Discord…"
                placeholderTextColor={colors.textTertiary}
                maxLength={200}
              />
            </View>

            {/* Dates */}
            <Text style={[styles.formLabel, { color: colors.textTertiary, marginTop: 14 }]}>DATE DE DÉBUT *</Text>
            <View style={[styles.formField, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Icon name="calendar" size={15} color={colors.textTertiary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.formInput, { color: colors.textPrimary }]}
                value={startsAt}
                onChangeText={setStartsAt}
                placeholder="AAAA-MM-JJTHH:MM"
                placeholderTextColor={colors.textTertiary}
                autoCorrect={false}
              />
            </View>

            <Text style={[styles.formLabel, { color: colors.textTertiary, marginTop: 14 }]}>DATE DE FIN</Text>
            <View style={[styles.formField, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Icon name="calendar" size={15} color={colors.textTertiary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.formInput, { color: colors.textPrimary }]}
                value={endsAt}
                onChangeText={setEndsAt}
                placeholder="AAAA-MM-JJTHH:MM (optionnel)"
                placeholderTextColor={colors.textTertiary}
                autoCorrect={false}
              />
            </View>

            {/* En ligne */}
            <View style={[styles.toggleRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <View style={[styles.toggleIcon, { backgroundColor: '#3B82F620' }]}>
                <Icon name="wifi" size={16} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Événement en ligne</Text>
                <Text style={[styles.toggleDesc, { color: colors.textTertiary }]}>Lien Zoom, Discord, Meet…</Text>
              </View>
              <Switch
                value={isOnline}
                onValueChange={setIsOnline}
                trackColor={{ false: colors.divider, true: '#3B82F655' }}
                thumbColor={isOnline ? '#3B82F6' : colors.textTertiary}
              />
            </View>

            {/* Couleur */}
            <Text style={[styles.formLabel, { color: colors.textTertiary, marginTop: 14 }]}>COULEUR</Text>
            <View style={styles.colorRow}>
              {EVENT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: '#fff' }]}
                  onPress={() => setColor(c)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            {/* Preview */}
            <LinearGradient
              colors={[color, color + 'AA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.colorPreview}
            >
              <Text style={styles.colorPreviewText}>{title || 'Aperçu de la couleur'}</Text>
            </LinearGradient>

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

interface Props {
  route: { params: { communityId: string; communityName: string; myRole?: string | null } };
}

export function CommunityEventsScreen({ route }: Props) {
  const { communityId, myRole } = route.params;
  const navigation = useNavigation<NavigationProp>();
  const insets     = useSafeAreaInsets();
  const { theme: { colors } } = useTheme();

  const isAdmin = myRole === 'admin' || myRole === 'moderator';

  const [activeTab,     setActiveTab]     = useState<string>('all');
  const [events,        setEvents]        = useState<CommunityEvent[]>([]);
  const [rsvpMap,       setRsvpMap]       = useState<Record<string, RsvpStatus | null>>({});
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [formVisible,   setFormVisible]   = useState(false);
  const [editingEvent,  setEditingEvent]  = useState<CommunityEvent | null>(null);

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

  const handleCreateOrUpdate = async (data: Parameters<typeof communityService.createEvent>[1]) => {
    if (editingEvent) {
      const updated = await communityService.updateEvent(communityId, editingEvent.id, data);
      setEvents(evs => evs.map(e => e.id === updated.id ? updated : e));
    } else {
      const created = await communityService.createEvent(communityId, data);
      setEvents(evs => [created, ...evs]);
    }
    setEditingEvent(null);
  };

  const handleOpenCreate = () => {
    setEditingEvent(null);
    setFormVisible(true);
  };

  const handleEdit = (event: CommunityEvent) => {
    setEditingEvent(event);
    setFormVisible(true);
  };

  const handleCancel = (event: CommunityEvent) => {
    Alert.alert(
      'Annuler l\'événement',
      `Annuler "${event.title}" ? Les participants seront informés.`,
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Annuler l\'événement',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await communityService.cancelEvent(communityId, event.id);
              setEvents(evs => evs.map(e => e.id === updated.id ? updated : e));
            } catch {
              Alert.alert('Erreur', 'Impossible d\'annuler l\'événement.');
            }
          },
        },
      ],
    );
  };

  const handleDelete = (event: CommunityEvent) => {
    Alert.alert(
      'Supprimer l\'événement',
      `Supprimer "${event.title}" définitivement ?`,
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await communityService.deleteEvent(communityId, event.id);
              setEvents(evs => evs.filter(e => e.id !== event.id));
            } catch {
              Alert.alert('Erreur', 'Impossible de supprimer l\'événement.');
            }
          },
        },
      ],
    );
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
  const upcomingCount = events.filter(e => e.status === 'upcoming' || new Date(e.starts_at) > now).length;

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
          {upcomingCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.countBadgeText}>{upcomingCount}</Text>
            </View>
          )}
        </View>

        {isAdmin ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={handleOpenCreate}
            activeOpacity={0.85}
          >
            <Icon name="plus" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </Animated.View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsBar, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.tabsBarContent}
      >
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

      {/* Résumé stats rapide */}
      {events.length > 0 && (
        <View style={[styles.summaryBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: colors.primary }]}>{events.length}</Text>
            <Text style={[styles.summaryLbl, { color: colors.textTertiary }]}>Total</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: '#10B981' }]}>{upcomingCount}</Text>
            <Text style={[styles.summaryLbl, { color: colors.textTertiary }]}>À venir</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: '#F59E0B' }]}>{goingCount}</Text>
            <Text style={[styles.summaryLbl, { color: colors.textTertiary }]}>Je participe</Text>
          </View>
        </View>
      )}

      {/* List */}
      <ScrollView
        style={styles.listArea}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="calendar" size={52} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {activeTab === 'all' ? 'Aucun événement' : 'Aucun événement dans cette catégorie'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textTertiary }]}>
              {isAdmin && activeTab === 'all'
                ? 'Créez le premier événement de la communauté !'
                : 'Revenez plus tard ou explorez une autre catégorie.'}
            </Text>
            {isAdmin && activeTab === 'all' && (
              <TouchableOpacity
                style={[styles.emptyCreateBtn, { backgroundColor: colors.primary }]}
                onPress={handleOpenCreate}
                activeOpacity={0.85}
              >
                <Icon name="plus" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.emptyCreateText}>Créer un événement</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filtered.map((event, idx) => (
            <EventCard
              key={event.id}
              event={event}
              rsvpStatus={rsvpMap[event.id] ?? null}
              onRsvpChange={handleRsvp}
              onEdit={handleEdit}
              onCancel={handleCancel}
              onDelete={handleDelete}
              isAdmin={isAdmin}
              colors={colors}
              index={idx}
            />
          ))
        )}
      </ScrollView>

      {/* Modal création/édition */}
      <EventFormModal
        visible={formVisible}
        initial={editingEvent}
        onClose={() => { setFormVisible(false); setEditingEvent(null); }}
        onSave={handleCreateOrUpdate}
        colors={colors}
        insets={insets}
      />
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
  tabsBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  tabText: { fontSize: 14 },

  summaryBar: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryVal: { fontSize: 18, fontWeight: '800' },
  summaryLbl: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  summaryDivider: { width: StyleSheet.hairlineWidth },

  listArea: { flex: 1 },

  card: { marginHorizontal: 16, marginBottom: 16, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  cover: { height: 130, justifyContent: 'space-between', padding: 12 },
  coverCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dateCircle: { borderRadius: 50, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  dateCircleDay: { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 32 },
  dateCircleMon: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  coverBadges: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  adminActions: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6 },
  adminBtn: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 6 },
  deleteBtn: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 8, padding: 6 },

  cardBody: { padding: 14, gap: 6 },
  cardTitle: { fontSize: 17, fontWeight: '700', lineHeight: 24, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metaText: { fontSize: 13, flex: 1 },
  eventDesc: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  organizerText: { fontSize: 11, marginTop: 2 },
  countsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  countPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  countText: { fontSize: 12, fontWeight: '700' },

  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  cardFooter: { padding: 12, paddingHorizontal: 14 },
  rsvpBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  rsvpBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 72, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyCreateBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  emptyCreateText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Modal form
  modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.62)' },
  modalKav: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '93%' },
  modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  saveBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  formContent: { paddingHorizontal: 16, paddingBottom: 24 },
  formLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  formField: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  formInput: { flex: 1, fontSize: 15, paddingVertical: 0 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 14 },
  toggleIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleDesc: { fontSize: 11, marginTop: 2 },

  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorPreview: { borderRadius: 12, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  colorPreviewText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
