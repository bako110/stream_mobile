import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Image, TextInput, Platform, StatusBar,
  Alert, Linking,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { eventService } from '../../services';
import { apiClient, Endpoints } from '../../api';
import type { EventAttendee } from '../../types/event';

interface Props {
  eventId:    string;
  eventTitle: string;
  onBack:     () => void;
  onScan?:    () => void;
}

const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

export const AttendeesScreen: React.FC<Props> = ({ eventId, eventTitle, onBack, onScan }) => {
  const { theme: { colors } } = useTheme();

  const [attendees,  setAttendees]  = useState<EventAttendee[]>([]);
  const [filtered,   setFiltered]   = useState<EventAttendee[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [query,      setQuery]      = useState('');
  const [exporting,  setExporting]  = useState(false);
  const [tab,        setTab]        = useState<'all' | 'used' | 'unused'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await eventService.getAttendees(eventId);
      setAttendees(data);
      setFiltered(data);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger la liste des inscrits.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // Filtrage combiné : tab + recherche
  useEffect(() => {
    let list = attendees;
    if (tab === 'used')   list = list.filter(a => a.status === 'used');
    if (tab === 'unused') list = list.filter(a => a.status !== 'used');
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(a =>
        (a.display_name ?? '').toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q),
      );
    }
    setFiltered(list);
  }, [attendees, tab, query]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      // On récupère un token d'export depuis l'API puis on ouvre dans le navigateur
      const res = await apiClient.get<{ url: string }>(Endpoints.events.attendeesCsv(eventId));
      const url = res.data?.url ?? Endpoints.events.attendeesCsv(eventId);
      await Linking.openURL(url);
    } catch {
      // Fallback : ouvrir l'endpoint directement
      try {
        await Linking.openURL(Endpoints.events.attendeesCsv(eventId));
      } catch {
        Alert.alert('Export', 'Impossible d\'exporter la liste pour le moment.');
      }
    } finally {
      setExporting(false);
    }
  };

  const usedCount   = attendees.filter(a => a.status === 'used').length;
  const unusedCount = attendees.filter(a => a.status !== 'used').length;

  const renderItem = ({ item }: { item: EventAttendee }) => (
    <View style={[at.row, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
      {/* Avatar */}
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={at.avatar} />
      ) : (
        <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={at.avatar}>
          <Text style={at.avatarTxt}>{getInitials(item.display_name ?? item.username)}</Text>
        </LinearGradient>
      )}

      {/* Infos */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[at.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.display_name ?? item.username}
        </Text>
        <Text style={[at.sub, { color: colors.textTertiary }]} numberOfLines={1}>
          @{item.username}{item.email ? ` · ${item.email}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Text style={[at.price, { color: colors.textTertiary }]}>
            {item.price_paid === 0 ? 'Gratuit' : `${item.price_paid.toFixed(2)} €`}
          </Text>
          <Text style={[at.date, { color: colors.textTertiary }]}>
            · {new Date(item.registered_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      </View>

      {/* Badge scanné */}
      <View style={[at.badge, {
        backgroundColor: item.status === 'used' ? '#10B98118' : colors.backgroundSecondary,
        borderColor:     item.status === 'used' ? '#10B981'   : colors.border,
      }]}>
        <Icon name={item.status === 'used' ? 'check' : 'clock'} size={12}
          color={item.status === 'used' ? '#10B981' : colors.textTertiary} />
        <Text style={[at.badgeTxt, { color: item.status === 'used' ? '#10B981' : colors.textTertiary }]}>
          {item.status === 'used' ? 'Entré' : 'En attente'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[at.header, { paddingTop: Platform.OS === 'ios' ? 56 : 42 }]}
      >
        <TouchableOpacity onPress={onBack} style={at.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={at.headerTitle} numberOfLines={1}>Inscrits</Text>
          <Text style={at.headerSub} numberOfLines={1}>{eventTitle}</Text>
        </View>
        {onScan && (
          <TouchableOpacity
            onPress={onScan}
            style={[at.exportBtn, { marginRight: 8 }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="camera" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleExportCsv}
          disabled={exporting}
          style={[at.exportBtn, { opacity: exporting ? 0.6 : 1 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {exporting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Icon name="download" size={20} color="#fff" />}
        </TouchableOpacity>
      </LinearGradient>

      {/* Stats */}
      <View style={[at.statsRow, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <View style={at.statItem}>
          <Text style={[at.statNum, { color: colors.textPrimary }]}>{attendees.length}</Text>
          <Text style={[at.statLbl, { color: colors.textTertiary }]}>Total</Text>
        </View>
        <View style={[at.statDiv, { backgroundColor: colors.divider }]} />
        <View style={at.statItem}>
          <Text style={[at.statNum, { color: '#10B981' }]}>{usedCount}</Text>
          <Text style={[at.statLbl, { color: colors.textTertiary }]}>Entrés</Text>
        </View>
        <View style={[at.statDiv, { backgroundColor: colors.divider }]} />
        <View style={at.statItem}>
          <Text style={[at.statNum, { color: colors.primary }]}>{unusedCount}</Text>
          <Text style={[at.statLbl, { color: colors.textTertiary }]}>En attente</Text>
        </View>
        <View style={[at.statDiv, { backgroundColor: colors.divider }]} />
        <View style={at.statItem}>
          <Text style={[at.statNum, { color: colors.textPrimary }]}>
            {attendees.reduce((s, a) => s + a.price_paid, 0).toFixed(0)} €
          </Text>
          <Text style={[at.statLbl, { color: colors.textTertiary }]}>Revenus</Text>
        </View>
      </View>

      {/* Barre recherche + tabs */}
      <View style={[at.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <View style={[at.searchBar, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Icon name="search" size={15} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher un inscrit..."
            placeholderTextColor={colors.textDisabled}
            style={{ flex: 1, fontSize: 14, color: colors.textPrimary, padding: 0 }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={at.tabs}>
          {(['all', 'unused', 'used'] as const).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[at.tabBtn, {
                backgroundColor: tab === t ? colors.primary + '22' : 'transparent',
                borderColor: tab === t ? colors.primary : colors.border,
              }]}
            >
              <Text style={[at.tabTxt, { color: tab === t ? colors.primary : colors.textTertiary }]}>
                {t === 'all' ? 'Tous' : t === 'used' ? 'Entrés' : 'En attente'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textTertiary }}>Chargement des inscrits...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={a => a.ticket_id}
          renderItem={renderItem}
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 }}>
              <Icon name="users" size={48} color={colors.textTertiary} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textSecondary }}>
                {query ? 'Aucun résultat' : 'Aucun inscrit pour le moment'}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 32 }}>
                {query ? `Aucun inscrit ne correspond à "${query}"` : 'Les participants apparaîtront ici après inscription.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const at = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  exportBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  statsRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  statItem:    { flex: 1, alignItems: 'center', gap: 3 },
  statNum:     { fontSize: 18, fontWeight: '800' },
  statLbl:     { fontSize: 11, fontWeight: '600' },
  statDiv:     { width: 1, height: 28 },

  searchWrap:  { paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  tabs:        { flexDirection: 'row', gap: 8 },
  tabBtn:      { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  tabTxt:      { fontSize: 12, fontWeight: '700' },

  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarTxt:   { color: '#fff', fontSize: 15, fontWeight: '800' },
  name:        { fontSize: 14, fontWeight: '700' },
  sub:         { fontSize: 12 },
  price:       { fontSize: 12 },
  date:        { fontSize: 12 },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  badgeTxt:    { fontSize: 11, fontWeight: '700' },
});
