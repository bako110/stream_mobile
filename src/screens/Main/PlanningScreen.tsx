import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  RefreshControl, Image, StyleSheet,
  Modal, TextInput, ScrollView, Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, SkeletonFeed, VerifiedBadge } from '../../components/common';
import { planningService } from '../../services/planningService';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import type { PlanningItem, PlanningInvite } from '../../services/planningService';
import type { UserPublic } from '../../types/user';
import type { AppColors } from '../../theme/colors';
import { Spacing, BorderRadius } from '../../theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  concert:    { icon: 'music',    label: 'Concert',      color: '#7B3FF2' },
  event:      { icon: 'calendar', label: 'Événement',    color: '#E0389A' },
  my_concert: { icon: 'music',    label: 'Mon Concert',  color: '#FF7A2F' },
  my_event:   { icon: 'calendar', label: 'Mon Événement', color: '#36D9A0' },
  personal:   { icon: 'edit-3',   label: 'Perso',        color: '#3B82F6' },
  invited:    { icon: 'user-plus', label: 'Invitation',  color: '#F59E0B' },
};

const INVITE_STATUS_CONFIG = {
  pending:  { label: 'En attente', color: '#F59E0B', icon: 'clock' },
  accepted: { label: 'Accepté',    color: '#36D9A0', icon: 'check-circle' },
  declined: { label: 'Refusé',     color: '#EF4444', icon: 'x-circle' },
};

const COLOR_PALETTE = ['#3B82F6', '#7B3FF2', '#E0389A', '#FF7A2F', '#36D9A0', '#FF4757', '#F59E0B', '#9B65F5'];

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function groupByDate(items: PlanningItem[]): { date: string; items: PlanningItem[] }[] {
  const map = new Map<string, PlanningItem[]>();
  for (const item of items) {
    const key = item.date
      ? new Date(item.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      : 'Date inconnue';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map, ([date, items]) => ({ date, items }));
}

function getInitial(name?: string | null) {
  return (name ?? '?')[0]?.toUpperCase() ?? '?';
}

// ── ContactPicker ─────────────────────────────────────────────────────────────

interface ContactPickerProps {
  visible: boolean;
  selected: UserPublic[];
  onToggle: (user: UserPublic) => void;
  onClose: () => void;
  colors: AppColors;
}

const ContactPicker: React.FC<ContactPickerProps> = ({ visible, selected, onToggle, onClose, colors }) => {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<UserPublic[]>([]);
  const [suggestions, setSuggestions] = useState<UserPublic[]>([]);
  const [loading, setLoading]     = useState(false);
  const [loadingSugg, setLoadingSugg] = useState(false);

  // Charger les suggestions dès l'ouverture
  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); return; }
    setLoadingSugg(true);
    apiClient.get<UserPublic[]>(Endpoints.users.suggestions)
      .then(r => setSuggestions(r.data ?? []))
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSugg(false));
  }, [visible]);

  // Recherche debounced
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setResults([]); setLoading(false); return; }
    const t = setTimeout(async () => {
      if (trimmed.length < 2) return;
      setLoading(true);
      try {
        const res = await apiClient.get<UserPublic[]>(
          `${Endpoints.messages.usersSearch}?q=${encodeURIComponent(trimmed)}`,
        );
        setResults(res.data ?? []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const isSelected = (u: UserPublic) => selected.some(s => s.id === u.id);
  const displayList = query.trim().length >= 2 ? results : suggestions;
  const isEmpty = displayList.length === 0 && !loading && !loadingSugg;

  const renderUser = ({ item: u }: { item: UserPublic }) => {
    const sel = isSelected(u);
    return (
      <TouchableOpacity
        style={[cp.row, { borderBottomColor: colors.divider, backgroundColor: sel ? colors.primary + '12' : 'transparent' }]}
        onPress={() => onToggle(u)}
        activeOpacity={0.7}
      >
        {u.avatar_url ? (
          <Image source={{ uri: u.avatar_url }} style={cp.avatar} />
        ) : (
          <View style={[cp.avatar, { backgroundColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>{getInitial(u.display_name ?? u.username)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[cp.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {u.display_name ?? u.username}
            </Text>
            {u.is_verified && <VerifiedBadge size={13} />}
          </View>
          {u.username && (
            <Text style={[cp.handle, { color: colors.textTertiary }]}>@{u.username}</Text>
          )}
        </View>
        <View style={[cp.checkbox, {
          backgroundColor: sel ? colors.primary : 'transparent',
          borderColor: sel ? colors.primary : colors.border,
        }]}>
          {sel && <Icon name="check" size={12} color="#fff" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={[cp.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[cp.sheet, { backgroundColor: colors.surface }]}>
          <View style={cp.handle} />
          <View style={cp.header}>
            <Text style={[cp.title, { color: colors.textPrimary }]}>Inviter des contacts</Text>
            <TouchableOpacity onPress={onClose} style={cp.doneBtn}>
              <Text style={[cp.doneTxt, { color: colors.primary }]}>
                {selected.length > 0 ? `Confirmer (${selected.length})` : 'Fermer'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[cp.searchBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
            <Icon name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={[cp.searchInput, { color: colors.textPrimary }]}
              placeholder="Rechercher un utilisateur…"
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={setQuery}
            />
            {(loading || loadingSugg) ? (
              <Icon name="loader" size={14} color={colors.textTertiary} />
            ) : query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Icon name="x" size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Selected chips */}
          {selected.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cp.chips}>
              {selected.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={[cp.chip, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
                  onPress={() => onToggle(u)}
                >
                  <Text style={[cp.chipText, { color: colors.primary }]}>
                    {u.display_name ?? u.username}
                  </Text>
                  <Icon name="x" size={12} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Section label */}
          <Text style={[cp.sectionLabel, { color: colors.textTertiary }]}>
            {query.trim().length >= 2 ? 'Résultats' : 'Suggestions'}
          </Text>

          {/* Results */}
          <FlatList
            data={displayList}
            keyExtractor={u => u.id}
            style={cp.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              isEmpty ? (
                <Text style={[cp.empty, { color: colors.textTertiary }]}>
                  {query.trim().length >= 2 ? 'Aucun résultat' : 'Aucune suggestion disponible'}
                </Text>
              ) : null
            }
            renderItem={renderUser}
          />
        </View>
      </View>
    </Modal>
  );
};

const cp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '55%', paddingBottom: 30, flex: 1 },
  handle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.35)', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  title:   { fontSize: 17, fontWeight: '700' },
  doneBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  doneTxt: { fontSize: 15, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  chips: { paddingHorizontal: 16, marginBottom: 8, flexGrow: 0 },
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 16, marginBottom: 4 },
  list:  { flex: 1, minHeight: 200 },
  empty: { textAlign: 'center', marginTop: 30, fontSize: 14 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  name:  { fontSize: 15, fontWeight: '600' },
  handle: { fontSize: 12, marginTop: 1 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export const PlanningScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation();

  const [items, setItems]         = useState<PlanningItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Create modal
  const [showCreate, setShowCreate]           = useState(false);
  const [formTitle, setFormTitle]             = useState('');
  const [formDesc, setFormDesc]               = useState('');
  const [formDate, setFormDate]               = useState(new Date());
  const [formEndDate, setFormEndDate]         = useState<Date | null>(null);
  const [formLocation, setFormLocation]       = useState('');
  const [formColor, setFormColor]             = useState('#3B82F6');
  const [formInviteMsg, setFormInviteMsg]     = useState('');
  const [selectedContacts, setSelectedContacts] = useState<UserPublic[]>([]);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showDatePicker, setShowDatePicker]   = useState(false);
  const [showTimePicker, setShowTimePicker]   = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [creating, setCreating]               = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await planningService.getFeed();
      const arr = Array.isArray(data) ? data : [];
      setItems(arr);
      setPendingCount(arr.filter(i => i.type === 'invited' && i.invite_status === 'pending').length);
    } catch (err) {
      if (__DEV__) console.warn('[PlanningScreen]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { setLoading(true); load(); }, []);

  const handlePress = (item: PlanningItem) => {
    if (item.type === 'personal') return;
    if (item.type === 'concert' || item.type === 'my_concert') {
      (nav as any).navigate('ConcertDetail', { concertId: item.ref_id });
    } else if (item.type === 'event' || item.type === 'my_event') {
      (nav as any).navigate('EventDetail', { eventId: item.ref_id });
    }
  };

  const handleDelete = (item: PlanningItem) => {
    if (item.type !== 'personal') return;
    Alert.alert('Supprimer', `Supprimer « ${item.title} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await planningService.deleteEntry(item.id);
          setItems(prev => prev.filter(i => i.id !== item.id));
        } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  };

  const handleRespondInvite = async (item: PlanningItem, status: 'accepted' | 'declined') => {
    try {
      await planningService.respondToInvite(item.id, status);
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, invite_status: status } : i,
      ));
      setPendingCount(c => Math.max(0, c - 1));
      Alert.alert(
        status === 'accepted' ? '✅ Invitation acceptée' : '❌ Invitation refusée',
        status === 'accepted'
          ? `« ${item.title} » a été ajouté à votre planning.`
          : `Vous avez refusé l'invitation à « ${item.title} ».`,
      );
    } catch {
      Alert.alert('Erreur', 'Impossible de répondre à l\'invitation.');
    }
  };

  const toggleContact = (user: UserPublic) => {
    setSelectedContacts(prev =>
      prev.some(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user],
    );
  };

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormDate(new Date());
    setFormEndDate(null); setFormLocation(''); setFormColor('#3B82F6');
    setFormInviteMsg(''); setSelectedContacts([]);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    setCreating(true);
    try {
      const entry = await planningService.createEntry({
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        date: formDate.toISOString(),
        end_date: formEndDate?.toISOString(),
        location: formLocation.trim() || undefined,
        color: formColor,
        invitee_ids: selectedContacts.map(u => u.id),
        invite_message: formInviteMsg.trim() || undefined,
      });
      setItems(prev => [...prev, entry].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')));
      setShowCreate(false);
      resetForm();
      if (selectedContacts.length > 0) {
        Alert.alert('Créé !', `Entrée créée et ${selectedContacts.length} invitation(s) envoyée(s).`);
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de créer l\'entrée.');
    } finally { setCreating(false); }
  };

  const sections = groupByDate(items);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Planning"
        right={pendingCount > 0 ? (
          <View style={[s.badge, { backgroundColor: '#F59E0B' }]}>
            <Text style={s.badgeText}>{pendingCount}</Text>
          </View>
        ) : undefined}
      />

      {loading ? (
        <SkeletonFeed count={5} />
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Icon name="calendar" size={52} color={colors.textTertiary} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Rien au planning</Text>
          <Text style={[s.emptyText, { color: colors.textTertiary }]}>
            Vos concerts, événements, invitations et rendez-vous personnels apparaîtront ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={sec => sec.date}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
          renderItem={({ item: section, index: sIdx }) => (
            <View>
              <Text style={[s.dateHeader, { color: colors.textSecondary }]}>{section.date}</Text>
              {section.items.map((item, idx) => (
                <Animated.View key={item.id} entering={FadeInDown.delay((sIdx * 3 + idx) * 50).springify()}>
                  <PlanningCard
                    item={item}
                    colors={colors}
                    onPress={() => handlePress(item)}
                    onDelete={item.type === 'personal' ? () => handleDelete(item) : undefined}
                    onAccept={item.type === 'invited' && item.invite_status === 'pending'
                      ? () => handleRespondInvite(item, 'accepted') : undefined}
                    onDecline={item.type === 'invited' && item.invite_status === 'pending'
                      ? () => handleRespondInvite(item, 'declined') : undefined}
                  />
                </Animated.View>
              ))}
            </View>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => setShowCreate(true)} style={s.fab}>
        <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fabInner}>
          <Icon name="plus" size={20} color="#fff" />
          <Text style={s.fabText}>Créer</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Contact Picker */}
      <ContactPicker
        visible={showContactPicker}
        selected={selectedContacts}
        onToggle={toggleContact}
        onClose={() => setShowContactPicker(false)}
        colors={colors}
      />

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={s.modalHandle} />

            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Nouveau rendez-vous</Text>
              <TouchableOpacity onPress={() => { setShowCreate(false); resetForm(); }}>
                <Icon name="x" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">

              {/* Titre */}
              <Text style={[s.label, { color: colors.textSecondary }]}>Titre *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
                value={formTitle} onChangeText={setFormTitle}
                placeholder="Ex : Réunion projet" placeholderTextColor={colors.textTertiary} maxLength={255}
              />

              {/* Description */}
              <Text style={[s.label, { color: colors.textSecondary }]}>Description</Text>
              <TextInput
                style={[s.input, s.inputMulti, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
                value={formDesc} onChangeText={setFormDesc}
                placeholder="Note optionnelle…" placeholderTextColor={colors.textTertiary}
                multiline maxLength={500}
              />

              {/* Date */}
              <Text style={[s.label, { color: colors.textSecondary }]}>Date et heure *</Text>
              <View style={s.dateRow}>
                <TouchableOpacity style={[s.datePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]} onPress={() => setShowDatePicker(true)}>
                  <Icon name="calendar" size={14} color={colors.primary} />
                  <Text style={[s.datePillText, { color: colors.textPrimary }]}>
                    {formDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.datePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]} onPress={() => setShowTimePicker(true)}>
                  <Icon name="clock" size={14} color={colors.primary} />
                  <Text style={[s.datePillText, { color: colors.textPrimary }]}>
                    {formDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              </View>
              {showDatePicker && <DateTimePicker value={formDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setFormDate(d); }} minimumDate={new Date()} />}
              {showTimePicker && <DateTimePicker value={formDate} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} is24Hour onChange={(_, d) => { setShowTimePicker(Platform.OS === 'ios'); if (d) setFormDate(d); }} />}

              {/* Date de fin */}
              <Text style={[s.label, { color: colors.textSecondary }]}>Date de fin (optionnel)</Text>
              <View style={s.dateRow}>
                <TouchableOpacity style={[s.datePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]} onPress={() => { if (!formEndDate) setFormEndDate(new Date(formDate.getTime() + 3600_000)); setShowEndDatePicker(true); }}>
                  <Icon name="calendar" size={14} color={formEndDate ? colors.primary : colors.textTertiary} />
                  <Text style={[s.datePillText, { color: formEndDate ? colors.textPrimary : colors.textTertiary }]}>
                    {formEndDate ? formEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Ajouter'}
                  </Text>
                </TouchableOpacity>
                {formEndDate && (
                  <>
                    <TouchableOpacity style={[s.datePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]} onPress={() => setShowEndTimePicker(true)}>
                      <Icon name="clock" size={14} color={colors.primary} />
                      <Text style={[s.datePillText, { color: colors.textPrimary }]}>{formEndDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setFormEndDate(null)} style={{ padding: 4 }}>
                      <Icon name="x-circle" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
              {showEndDatePicker && formEndDate && <DateTimePicker value={formEndDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowEndDatePicker(Platform.OS === 'ios'); if (d) setFormEndDate(d); }} minimumDate={formDate} />}
              {showEndTimePicker && formEndDate && <DateTimePicker value={formEndDate} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} is24Hour onChange={(_, d) => { setShowEndTimePicker(Platform.OS === 'ios'); if (d) setFormEndDate(d); }} />}

              {/* Lieu */}
              <Text style={[s.label, { color: colors.textSecondary }]}>Lieu</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
                value={formLocation} onChangeText={setFormLocation}
                placeholder="Ex : Café de Paris" placeholderTextColor={colors.textTertiary} maxLength={255}
              />

              {/* Inviter des contacts */}
              <Text style={[s.label, { color: colors.textSecondary }]}>Inviter des contacts</Text>
              <TouchableOpacity
                style={[s.inviteBtn, { backgroundColor: colors.backgroundSecondary, borderColor: selectedContacts.length > 0 ? colors.primary : colors.divider }]}
                onPress={() => setShowContactPicker(true)}
              >
                <Icon name="user-plus" size={16} color={selectedContacts.length > 0 ? colors.primary : colors.textTertiary} />
                <Text style={[s.inviteBtnText, { color: selectedContacts.length > 0 ? colors.primary : colors.textTertiary }]}>
                  {selectedContacts.length > 0
                    ? `${selectedContacts.length} contact${selectedContacts.length > 1 ? 's' : ''} sélectionné${selectedContacts.length > 1 ? 's' : ''}`
                    : 'Sélectionner des contacts…'}
                </Text>
                <Icon name="chevron-right" size={14} color={colors.textTertiary} />
              </TouchableOpacity>

              {/* Aperçu contacts sélectionnés */}
              {selectedContacts.length > 0 && (
                <View style={s.contactsPreview}>
                  {selectedContacts.map(u => (
                    <View key={u.id} style={[s.contactChip, { backgroundColor: colors.backgroundSecondary }]}>
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url }} style={s.contactChipAvatar} />
                      ) : (
                        <View style={[s.contactChipAvatar, { backgroundColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{getInitial(u.display_name ?? u.username)}</Text>
                        </View>
                      )}
                      <Text style={[s.contactChipName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {u.display_name ?? u.username}
                      </Text>
                      <TouchableOpacity onPress={() => toggleContact(u)}>
                        <Icon name="x" size={12} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Message d'invitation */}
              {selectedContacts.length > 0 && (
                <>
                  <Text style={[s.label, { color: colors.textSecondary }]}>Message (optionnel)</Text>
                  <TextInput
                    style={[s.input, s.inputMulti, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
                    value={formInviteMsg} onChangeText={setFormInviteMsg}
                    placeholder="Ex : N'oublie pas d'apporter ta guitare !"
                    placeholderTextColor={colors.textTertiary} multiline maxLength={500}
                  />
                </>
              )}

              {/* Couleur */}
              <Text style={[s.label, { color: colors.textSecondary }]}>Couleur</Text>
              <View style={s.colorRow}>
                {COLOR_PALETTE.map(c => (
                  <TouchableOpacity key={c} onPress={() => setFormColor(c)} style={[s.colorDot, { backgroundColor: c }, formColor === c && s.colorDotActive]}>
                    {formColor === c && <Icon name="check" size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Submit */}
              <TouchableOpacity onPress={handleCreate} disabled={!formTitle.trim() || creating} activeOpacity={0.85} style={[s.submitBtn, { opacity: (!formTitle.trim() || creating) ? 0.5 : 1 }]}>
                <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.submitBtnInner}>
                  <Icon name="check" size={18} color="#fff" />
                  <Text style={s.submitBtnText}>
                    {creating ? 'Création…' : selectedContacts.length > 0 ? `Créer & inviter (${selectedContacts.length})` : 'Ajouter au planning'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ── PlanningCard ──────────────────────────────────────────────────────────────

interface PlanningCardProps {
  item: PlanningItem;
  colors: AppColors;
  onPress: () => void;
  onDelete?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
}

const PlanningCard: React.FC<PlanningCardProps> = ({ item, colors, onPress, onDelete, onAccept, onDecline }) => {
  const isPersonal = item.type === 'personal';
  const isInvited  = item.type === 'invited';
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.event;
  const accent = isPersonal ? (item.color || cfg.color) : cfg.color;
  const isOwn = item.type === 'my_concert' || item.type === 'my_event';
  const person = item.artist || item.organizer;
  const inviteStatusCfg = item.invite_status ? INVITE_STATUS_CONFIG[item.invite_status] : null;

  return (
    <TouchableOpacity style={[s.card, { backgroundColor: colors.surfaceElevated }]} activeOpacity={0.85} onPress={onPress}>
      {/* Left thumbnail */}
      <View style={s.cardThumbWrap}>
        {item.thumbnail_url ? (
          <Image source={{ uri: item.thumbnail_url }} style={s.cardThumb} />
        ) : (
          <LinearGradient colors={[accent + 'CC', accent + '44']} style={s.cardThumb}>
            <Icon name={cfg.icon} size={24} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        )}
      </View>

      {/* Right info */}
      <View style={s.cardBody}>
        <View style={s.cardTopRow}>
          <View style={[s.typePill, { backgroundColor: accent + '22' }]}>
            <Icon name={cfg.icon} size={10} color={accent} />
            <Text style={[s.typePillText, { color: accent }]}>{cfg.label.toUpperCase()}</Text>
          </View>
          {item.status === 'live' && (
            <View style={[s.livePill, { backgroundColor: colors.error }]}>
              <Text style={s.livePillText}>LIVE</Text>
            </View>
          )}
          {inviteStatusCfg && (
            <View style={[s.typePill, { backgroundColor: inviteStatusCfg.color + '22' }]}>
              <Icon name={inviteStatusCfg.icon} size={10} color={inviteStatusCfg.color} />
              <Text style={[s.typePillText, { color: inviteStatusCfg.color }]}>{inviteStatusCfg.label.toUpperCase()}</Text>
            </View>
          )}
        </View>

        <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>

        <View style={s.metaRow}>
          <Icon name="clock" size={11} color={colors.textTertiary} />
          <Text style={[s.metaText, { color: colors.textTertiary }]}>{formatTime(item.date)}</Text>
        </View>

        {!!item.venue && (
          <View style={s.metaRow}>
            <Icon name="map-pin" size={11} color={colors.textTertiary} />
            <Text style={[s.metaText, { color: colors.textTertiary }]} numberOfLines={1}>{item.venue}</Text>
          </View>
        )}

        {/* Message d'invitation */}
        {isInvited && item.invite_message && (
          <View style={[s.inviteMsgBox, { backgroundColor: colors.backgroundSecondary }]}>
            <Icon name="message-circle" size={10} color={colors.textTertiary} />
            <Text style={[s.inviteMsgText, { color: colors.textSecondary }]} numberOfLines={2}>{item.invite_message}</Text>
          </View>
        )}

        {/* Organisateur / artiste */}
        {isOwn ? (
          <View style={[s.ownBadge, { backgroundColor: accent + '18' }]}>
            <Icon name="user" size={10} color={accent} />
            <Text style={[s.ownBadgeText, { color: accent }]}>Organisé par vous</Text>
          </View>
        ) : isPersonal && item.description ? (
          <Text style={[s.descText, { color: colors.textTertiary }]} numberOfLines={1}>{item.description}</Text>
        ) : person ? (
          <View style={s.personRow}>
            {person.avatar_url ? (
              <Image source={{ uri: person.avatar_url }} style={s.personAvatar} />
            ) : (
              <View style={[s.personAvatarFallback, { backgroundColor: accent + '33' }]}>
                <Text style={[s.personInitial, { color: accent }]}>{getInitial(person.display_name ?? person.username)}</Text>
              </View>
            )}
            <Text style={[s.personName, { color: colors.textSecondary }]} numberOfLines={1}>
              {person.display_name || person.username}
            </Text>
            {person.is_verified && <VerifiedBadge size={12} />}
          </View>
        ) : null}

        {/* Invités sur entrée perso */}
        {isPersonal && item.invites && item.invites.length > 0 && (
          <View style={s.inviteesRow}>
            {item.invites.slice(0, 4).map(inv => (
              <View key={inv.id} style={[s.inviteeAvatar, {
                backgroundColor: accent + '30',
                borderColor: inv.status === 'accepted' ? '#36D9A0' : inv.status === 'declined' ? '#EF4444' : colors.surface,
              }]}>
                {inv.invitee?.avatar_url ? (
                  <Image source={{ uri: inv.invitee.avatar_url }} style={{ width: '100%', height: '100%', borderRadius: 11 }} />
                ) : (
                  <Text style={{ color: accent, fontSize: 9, fontWeight: '700' }}>{getInitial(inv.invitee?.display_name ?? inv.invitee?.username)}</Text>
                )}
              </View>
            ))}
            {item.invites.length > 4 && (
              <Text style={[s.inviteesMore, { color: colors.textTertiary }]}>+{item.invites.length - 4}</Text>
            )}
          </View>
        )}

        {/* Boutons réponse invitation */}
        {isInvited && item.invite_status === 'pending' && onAccept && onDecline && (
          <View style={s.inviteActions}>
            <TouchableOpacity style={[s.acceptBtn, { backgroundColor: '#36D9A0' }]} onPress={onAccept} activeOpacity={0.8}>
              <Icon name="check" size={13} color="#fff" />
              <Text style={s.inviteActionText}>Accepter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.declineBtn, { borderColor: '#EF4444' }]} onPress={onDecline} activeOpacity={0.8}>
              <Icon name="x" size={13} color="#EF4444" />
              <Text style={[s.inviteActionText, { color: '#EF4444' }]}>Refuser</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Supprimer entrée perso */}
        {isPersonal && onDelete && (
          <TouchableOpacity onPress={onDelete} style={[s.deleteBtn, { backgroundColor: colors.error + '15' }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="trash-2" size={12} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], paddingBottom: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  dateHeader: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize', letterSpacing: 0.3, marginTop: 20, marginBottom: 10 },

  card: { flexDirection: 'row', borderRadius: BorderRadius.lg, overflow: 'hidden', marginBottom: 12 },
  cardThumbWrap: { width: 100, height: 'auto' as any },
  cardThumb: { width: '100%', height: '100%', minHeight: 110, resizeMode: 'cover', alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, padding: 10, justifyContent: 'center' },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.full },
  typePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  livePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  livePillText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  cardTitle: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: { fontSize: 11, flex: 1 },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  personAvatar: { width: 18, height: 18, borderRadius: 9 },
  personAvatarFallback: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  personInitial: { fontSize: 9, fontWeight: '800' },
  personName: { fontSize: 11, flex: 1 },

  ownBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full, alignSelf: 'flex-start', marginTop: 6 },
  ownBadgeText: { fontSize: 10, fontWeight: '700' },

  descText: { fontSize: 11, marginTop: 3 },

  inviteMsgBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 5, padding: 7, borderRadius: 8 },
  inviteMsgText: { fontSize: 11, flex: 1, lineHeight: 15 },

  inviteesRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  inviteeAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  inviteesMore: { fontSize: 10, fontWeight: '700' },

  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full },
  declineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1.5 },
  inviteActionText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  deleteBtn: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  fab: { position: 'absolute', bottom: 24, right: 20, borderRadius: BorderRadius.full, overflow: 'hidden', elevation: 8, shadowColor: '#7B3FF2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
  fabInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing[4], paddingVertical: 14 },
  fabText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34, maxHeight: '95%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.35)', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { paddingHorizontal: 20, paddingBottom: 20 },

  label: { fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { fontSize: 15, borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1 },
  datePillText: { fontSize: 14 },

  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: BorderRadius.md, borderWidth: 1 },
  inviteBtnText: { flex: 1, fontSize: 14 },

  contactsPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  contactChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.full },
  contactChipAvatar: { width: 22, height: 22, borderRadius: 11 },
  contactChipName: { fontSize: 13, fontWeight: '500', maxWidth: 100 },

  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4 },

  submitBtn: { marginTop: 24, borderRadius: BorderRadius.full, overflow: 'hidden' },
  submitBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
