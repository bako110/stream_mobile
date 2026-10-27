/**
 * MyEventsScreen — liste complète des événements de l'organisateur connecté
 * (brouillons, publiés, en direct, terminés) avec édition/suppression.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, RefreshControl,
  StyleSheet, StatusBar, TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, GofolyxLoader } from '../../components/common';
import { eventService, toastService, showConfirm } from '../../services';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import type { Event, EventStatus } from '../../types/event';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Brouillon', published: 'Publié', cancelled: 'Annulé',
  completed: 'Terminé', limited: 'Limité', archived: 'Archivé',
};
const STATUS_COLOR: Record<EventStatus, string> = {
  draft: '#999', published: '#4FA8FF', cancelled: '#F0365A',
  completed: '#666', limited: '#F59E0B', archived: '#999',
};

export const MyEventsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [events,     setEvents]     = useState<Event[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await eventService.getMyEvents();
      setEvents(Array.isArray(res) ? res : []);
    } catch { /* silencieux */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(e => e.title.toLowerCase().includes(q));
  }, [events, search]);

  const isLiveNow = (e: Event) => e.is_online && !!e.live_id;

  const handlePress = (e: Event) => nav.navigate('EventDetail', { eventId: e.id });
  const handleEdit  = (e: Event) => nav.navigate('CreateEvent', { eventId: e.id });

  const handleDelete = (e: Event) => {
    showConfirm('Supprimer cet événement ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        setDeletingId(e.id);
        try {
          await eventService.delete(e.id);
          setEvents(prev => prev.filter(x => x.id !== e.id));
          toastService.success('Événement supprimé');
        } catch (err: any) {
          toastService.error('Erreur', err?.response?.data?.detail ?? 'Impossible de supprimer cet événement.');
        } finally {
          setDeletingId(null);
        }
      }},
    ]);
  };

  const renderItem = ({ item }: { item: Event }) => {
    const live = isLiveNow(item);
    const startDate = new Date(item.starts_at).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    return (
      <TouchableOpacity
        style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        activeOpacity={0.85}
        onPress={() => handlePress(item)}
      >
        {item.thumbnail_url ? (
          <Image source={{ uri: item.thumbnail_url }} style={st.thumb} />
        ) : (
          <View style={[st.thumb, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="calendar" size={24} color={colors.textTertiary} />
          </View>
        )}
        <View style={st.info}>
          <View style={[st.statusPill, { backgroundColor: (live ? '#F0365A' : STATUS_COLOR[item.status]) + '22' }]}>
            {live && <View style={[st.liveDot, { backgroundColor: '#F0365A' }]} />}
            <Text style={[st.statusText, { color: live ? '#F0365A' : STATUS_COLOR[item.status] }]}>
              {live ? 'En direct' : STATUS_LABEL[item.status]}
            </Text>
          </View>
          <Text style={[st.title, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Icon name="clock" size={11} color={colors.textTertiary} />
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>{startDate}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Icon name="users" size={11} color={colors.textTertiary} />
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>{item.current_attendees} inscrits</Text>
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <TouchableOpacity onPress={() => handleEdit(item)} style={[st.iconBtn, { backgroundColor: colors.primary + '14' }]}>
            <Icon name="edit-2" size={15} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            disabled={deletingId === item.id}
            style={[st.iconBtn, { backgroundColor: colors.error + '14' }]}
          >
            {deletingId === item.id
              ? <GofolyxLoader variant="reel" color={colors.error} />
              : <Icon name="trash-2" size={15} color={colors.error} />}
          </TouchableOpacity>
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
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Mes événements</Text>
            <View style={{ width: 38 }} />
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <GofolyxLoader variant="reel" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={{ paddingTop: insets.top + 12 }}>
        <View style={[st.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Mes événements</Text>
          <TouchableOpacity onPress={() => nav.navigate('CreateEvent', undefined)} style={{ width: 38, alignItems: 'flex-end' }}>
            <Icon name="plus" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[st.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="search" size={16} color={colors.textTertiary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un événement…"
          placeholderTextColor={colors.textTertiary}
          style={[st.searchInput, { color: colors.textPrimary }]}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={e => e.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <View style={[st.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="calendar" size={32} color={colors.textTertiary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
              {search ? 'Aucun résultat' : 'Aucun événement pour le moment'}
            </Text>
            {!search && (
              <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 32 }}>
                Crée ton premier événement pour le retrouver ici.
              </Text>
            )}
          </View>
        }
      />
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    marginHorizontal: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 16,
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1, padding: 10,
  },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  info: { flex: 1, gap: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, marginBottom: 2,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  title: { fontSize: 14, fontWeight: '700' },
  iconBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
});
