/**
 * TournamentListScreen — liste des tournois avec inscriptions ouvertes, creation
 * d'un nouveau tournoi, et inscription/desinscription.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar,
  RefreshControl, ActivityIndicator, Modal, TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { tournamentService } from '../../services/tournamentService';
import type { OpenTournament } from '../../services/tournamentService';
import { toastService } from '../../services';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { BackButton } from '../../components/common';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const FORMATS: Array<8 | 16 | 32 | 64> = [8, 16, 32, 64];

export const TournamentListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { currentUser } = useUser();

  const [tournaments, setTournaments] = useState<OpenTournament[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [joining, setJoining]         = useState<string | null>(null);

  const [showCreate, setShowCreate]   = useState(false);
  const [name, setName]               = useState('');
  const [format, setFormat]           = useState<8 | 16 | 32 | 64>(8);
  const [creating, setCreating]       = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await tournamentService.listOpen();
      setTournaments(data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleJoin = async (t: OpenTournament) => {
    if (joining) return;
    setJoining(t.id);
    try {
      await tournamentService.join(t.id);
      await load();
    } catch (e: any) {
      toastService.error('Impossible de rejoindre', e?.message || 'Une erreur est survenue.');
    } finally {
      setJoining(null);
    }
  };

  const handleOpenBracket = (t: OpenTournament) => {
    nav.navigate('TournamentBracket', { tournamentId: t.id });
  };

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const t = await tournamentService.create({ name: name.trim(), format });
      setShowCreate(false);
      setName('');
      await load();
      nav.navigate('TournamentBracket', { tournamentId: t.id });
    } catch (e: any) {
      toastService.error('Impossible de créer le tournoi', e?.message || 'Une erreur est survenue.');
    } finally {
      setCreating(false);
    }
  };

  const renderItem = ({ item }: { item: OpenTournament }) => {
    const full = item.participants_count >= item.max_participants;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => handleOpenBracket(item)}
        activeOpacity={0.85}
      >
        <View style={[styles.formatBadge, { backgroundColor: '#7B3FF222' }]}>
          <Text style={styles.formatBadgeText}>{item.format}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.cardSub, { color: colors.textTertiary }]}>
            {item.participants_count} / {item.max_participants} inscrits
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.joinBtn, full && styles.joinBtnFull]}
          onPress={() => handleJoin(item)}
          disabled={!!joining || full}
          activeOpacity={0.85}
        >
          {joining === item.id
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.joinBtnText}>{full ? 'Complet' : 'Rejoindre'}</Text>
          }
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Tournois</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={styles.createBtn}>
          <Icon name="plus" size={22} color="#7B3FF2" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7B3FF2" /></View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B3FF2" />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="award" size={32} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Aucun tournoi ouvert pour le moment.</Text>
            </View>
          }
        />
      )}

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Créer un tournoi</Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nom du tournoi"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
              maxLength={200}
            />

            <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>NOMBRE DE PARTICIPANTS</Text>
            <View style={styles.formatRow}>
              {FORMATS.map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFormat(f)}
                  style={[
                    styles.formatChip,
                    { borderColor: format === f ? '#7B3FF2' : colors.border, backgroundColor: format === f ? '#7B3FF222' : colors.backgroundSecondary },
                  ]}
                >
                  <Text style={{ color: format === f ? '#7B3FF2' : colors.textSecondary, fontWeight: '700' }}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => setShowCreate(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, !name.trim() && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!name.trim() || creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Créer</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  createBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  formatBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  formatBadgeText: { color: '#7B3FF2', fontSize: 14, fontWeight: '800' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  joinBtn: { backgroundColor: '#7B3FF2', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, minWidth: 84, alignItems: 'center' },
  joinBtnFull: { backgroundColor: '#9CA3AF' },
  joinBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 4 },
  formatRow: { flexDirection: 'row', gap: 8 },
  formatChip: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: '#7B3FF2', borderWidth: 0 },
});
