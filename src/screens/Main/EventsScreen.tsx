import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ScrollView, RefreshControl, Image, Alert, TextInput, Keyboard,
} from 'react-native';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, SkeletonFeed } from '../../components/common';
import { eventService } from '../../services';
import type { Event, EventType } from '../../types';
import type { AppColors } from '../../theme/colors';
import { eventsStyles as s } from '../../styles/EventsScreen.styles';
import type { MainStackParamList } from '../../navigation/MainNavigator';

// ── Config ────────────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<EventType, { icon: string; label: string; color: string }> = {
  concert:    { icon: 'music',       label: 'Concert',      color: '#7B3FF2' },
  birthday:   { icon: 'gift',        label: 'Anniversaire', color: '#E0389A' },
  festival:   { icon: 'star',        label: 'Festival',     color: '#FF7A2F' },
  conference: { icon: 'mic',         label: 'Conférence',   color: '#36D9A0' },
  sport:      { icon: 'activity',    label: 'Sport',        color: '#3B82F6' },
  theater:    { icon: 'film',        label: 'Théâtre',      color: '#9B65F5' },
  exhibition: { icon: 'image',       label: 'Exposition',   color: '#36D9A0' },
  other:      { icon: 'calendar',    label: 'Autre',        color: '#9390AB' },
};

export const EventsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation();

  const [myEvents,      setMyEvents]      = useState<Event[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const searchRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    try {
      const mine = await eventService.getMyEvents().catch(() => []);
      setMyEvents(Array.isArray(mine) ? mine : []);
    } catch (err) {
      if (__DEV__) { console.warn('[EventsScreen]', err); }
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { setLoading(true); load(); }, []);

  const filteredEvents = searchQuery.trim()
    ? myEvents.filter(e =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.venue_city    ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.venue_country ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : myEvents;

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

  const handleDelete = (id: string) => {
    Alert.alert('Supprimer', 'Supprimer cet événement ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await eventService.delete(id);
          setMyEvents(prev => prev.filter(e => e.id !== id));
        } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Mes Événements"
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
            placeholder="Rechercher un événement…"
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

      <View style={[s.mySection, { borderBottomColor: colors.divider }]}>
        <Text style={[s.mySectionTitle, { color: colors.textTertiary }]}>MES ÉVÉNEMENTS</Text>
        <TouchableOpacity
          onPress={() => (nav as any).navigate('CreateEvent')}
          style={[s.myAddBtn, { backgroundColor: colors.primary + '18' }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Icon name="plus" size={13} color={colors.primary} />
          <Text style={[s.myAddBtnText, { color: colors.primary }]}>Créer</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <SkeletonFeed count={4} />
      ) : filteredEvents.length === 0 ? (
        <View style={s.empty}>
          <Icon name="calendar" size={48} color={colors.textTertiary} />
          <Text style={[s.emptyText, { color: colors.textTertiary }]}>
            {myEvents.length === 0
              ? 'Aucun événement — créez le premier !'
              : 'Aucun résultat pour « ' + searchQuery + ' »'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={e => e.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 55).springify()}>
              <EventCard
                event={item}
                colors={colors}
                onPress={() => (nav as any).navigate('CreateEvent', { eventId: item.id })}
                onDelete={() => handleDelete(item.id)}
              />
            </Animated.View>
          )}
        />
      )}
    </View>
  );
};

// ── EventCard ─────────────────────────────────────────────────────────────────

interface EventCardProps { event: Event; colors: AppColors; onPress: () => void; onDelete: () => void; }

const EventCard: React.FC<EventCardProps> = ({ event, colors, onPress, onDelete }) => {
  const cfg    = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.other;
  const accent = cfg.color;
  const pct    = event.max_attendees
    ? Math.min(event.current_attendees / event.max_attendees, 1)
    : 0;

  const hasImage = !!(event.thumbnail_url || event.banner_url);

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surfaceElevated }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {/* Image ou gradient */}
      <View style={s.cardImageWrap}>
        {hasImage ? (
          <Image
            source={{ uri: event.thumbnail_url || event.banner_url! }}
            style={s.cardImage}
          />
        ) : (
          <LinearGradient
            colors={[accent + 'CC', accent + '44']}
            style={s.cardImage}
          >
            <View style={s.cardImageOverlay}>
              <Icon name={cfg.icon} size={32} color="rgba(255,255,255,0.6)" />
            </View>
          </LinearGradient>
        )}
        {/* Date badge overlay */}
        <View style={[s.dateBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <Text style={s.dateDay}>
            {new Date(event.starts_at).getDate()}
          </Text>
          <Text style={s.dateMon}>
            {new Date(event.starts_at)
              .toLocaleDateString('fr-FR', { month: 'short' })
              .toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Corps */}
      <View style={s.cardContent}>
        {/* Organisateur */}
        {event.organizer && (
          <View style={s.organizerRow}>
            {event.organizer.avatar_url ? (
              <Image source={{ uri: event.organizer.avatar_url }} style={s.organizerAvatar} />
            ) : (
              <View style={[s.organizerAvatarFallback, { backgroundColor: accent + '33' }]}>
                <Text style={[s.organizerInitials, { color: accent }]}>
                  {(event.organizer.display_name || event.organizer.username || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[s.organizerName, { color: colors.textSecondary }]} numberOfLines={1}>
              {event.organizer.display_name || event.organizer.username || 'Organisateur'}
            </Text>
          </View>
        )}

        <View style={s.cardTopRow}>
          <View style={[s.typePill, { backgroundColor: accent + '22' }]}>
            <Text style={[s.typePillText, { color: accent }]}>
              {cfg.label.toUpperCase()}
            </Text>
          </View>
          {event.access_type === 'free' && (
            <View style={[s.typePill, { backgroundColor: colors.accentGreen + '22' }]}>
              <Text style={[s.typePillText, { color: colors.accentGreen }]}>GRATUIT</Text>
            </View>
          )}
          {event.is_online && (
            <View style={[s.typePill, { backgroundColor: colors.info + '22' }]}>
              <Text style={[s.typePillText, { color: colors.info }]}>EN LIGNE</Text>
            </View>
          )}
        </View>

        <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={s.metaRow}>
          <Icon name="map-pin" size={11} color={colors.textTertiary} />
          <Text style={[s.metaText, { color: colors.textTertiary }]} numberOfLines={1}>
            {event.is_online
              ? 'En ligne'
              : [event.venue_city, event.venue_country].filter(Boolean).join(', ')}
          </Text>
        </View>

        <View style={{ marginTop: 6 }}>
          <View style={s.attendeeRow}>
            <Icon name="users" size={12} color={accent} />
            <Text style={[s.attendeeText, { color: accent, fontWeight: '700' }]}>
              {event.current_attendees} participant{event.current_attendees !== 1 ? 's' : ''}
            </Text>
            {event.max_attendees != null && event.max_attendees > 0 && (
              <Text style={[s.attendeeText, { color: colors.textTertiary, marginLeft: 'auto' }]}>
                {event.max_attendees - event.current_attendees} places restantes
              </Text>
            )}
          </View>
          {event.max_attendees != null && event.max_attendees > 0 && (
            <View style={[s.attendeeBar, { backgroundColor: colors.backgroundTertiary, marginTop: 4 }]}>
              <View style={[s.attendeeBarFill, { width: `${pct * 100}%`, backgroundColor: accent }]} />
            </View>
          )}
        </View>

        {event.ticket_price != null && event.access_type !== 'free' && (
          <Text style={[s.price, { color: colors.primary }]}>
            À partir de {event.ticket_price} €
          </Text>
        )}

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
