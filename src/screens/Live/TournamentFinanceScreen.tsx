/**
 * TournamentFinanceScreen — reserve a l'organisateur du tournoi. Montre le detail
 * de tout l'argent que le tournoi a genere (frais d'inscription + cadeaux recus
 * pendant les matchs, tout deja verse dans son wallet), par participant/match/
 * phase, et permet de recompenser qui il veut du montant qu'il veut.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
  ActivityIndicator, Image, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { BackButton } from '../../components/common';
import { tournamentService } from '../../services/tournamentService';
import type { TournamentFinanceReport, TournamentFinanceParticipant, TournamentRound } from '../../services/tournamentService';

interface RouteParams { tournamentId: string; }

const ROUND_LABELS: Record<TournamentRound, string> = {
  qualifications: 'Qualifications',
  round_of_32:    'Seizièmes',
  round_of_16:    'Huitièmes',
  quarterfinal:   'Quarts',
  semifinal:      'Demies',
  final:          'Finale',
  group_stage:    'Phase de groupes',
  losers_round:   'Bracket des perdants',
  grand_final:    'Grande finale',
};

export const TournamentFinanceScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { tournamentId } = route.params as RouteParams;

  const [report, setReport] = useState<TournamentFinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [rewardTarget, setRewardTarget] = useState<TournamentFinanceParticipant | null>(null);
  const [rewardAmount, setRewardAmount] = useState('');
  const [rewarding, setRewarding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await tournamentService.getFinanceReport(tournamentId);
      setReport(data);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de charger le rapport financier.');
      nav.goBack();
    } finally {
      setLoading(false);
    }
  }, [tournamentId, nav]);

  useEffect(() => { load(); }, [load]);

  const handleReward = async () => {
    const amount = parseInt(rewardAmount, 10);
    if (!rewardTarget || !amount || amount <= 0) return;
    setRewarding(true);
    try {
      await tournamentService.rewardParticipant(tournamentId, rewardTarget.user_id, amount);
      setRewardTarget(null);
      setRewardAmount('');
      Alert.alert('Récompense envoyée', `${amount.toLocaleString('fr-FR')} GoGold envoyés à ${rewardTarget.display_name ?? 'ce participant'}.`);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible d'envoyer la récompense.");
    } finally {
      setRewarding(false);
    }
  };

  if (loading || !report) {
    return (
      <View style={st.root}>
        <ActivityIndicator color="#FFD700" style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#2A1F0A', '#0B0812', '#0B0812']} style={StyleSheet.absoluteFill} />

      <View style={st.header}>
        <BackButton onPress={() => nav.goBack()} color="#fff" transparent />
        <Text style={st.headerTitle}>Finances du tournoi</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <LinearGradient colors={['#FFD70025', '#FFA00010']} style={st.totalCard}>
          <Text style={st.totalLabel}>Total dans ton wallet</Text>
          <Text style={st.totalValue}>{report.wallet_total.toLocaleString('fr-FR')} GoGold</Text>
          <View style={st.totalBreakdownRow}>
            <View style={st.totalBreakdownItem}>
              <Text style={st.totalBreakdownLabel}>Inscriptions</Text>
              <Text style={st.totalBreakdownValue}>{report.entry_fees_total.toLocaleString('fr-FR')}</Text>
            </View>
            <View style={st.totalBreakdownDivider} />
            <View style={st.totalBreakdownItem}>
              <Text style={st.totalBreakdownLabel}>Cadeaux des matchs</Text>
              <Text style={st.totalBreakdownValue}>{report.gifts_total.toLocaleString('fr-FR')}</Text>
            </View>
          </View>
        </LinearGradient>

        {report.by_round.length > 0 && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>Par phase</Text>
            {report.by_round.map(r => (
              <View key={r.round} style={st.roundRow}>
                <Text style={st.roundLabel}>{ROUND_LABELS[r.round] ?? r.round}</Text>
                <Text style={st.roundValue}>{r.gogold_generated.toLocaleString('fr-FR')} GoGold</Text>
              </View>
            ))}
          </View>
        )}

        <View style={st.section}>
          <Text style={st.sectionTitle}>Par participant — touche pour récompenser</Text>
          {report.by_participant.map(p => (
            <TouchableOpacity
              key={p.user_id}
              activeOpacity={0.8}
              onPress={() => setRewardTarget(p)}
              style={st.participantRow}
            >
              {p.avatar_url
                ? <Image source={{ uri: p.avatar_url }} style={st.participantAvatar} />
                : <View style={[st.participantAvatar, st.participantAvatarFallback]}><Icon name="user" size={14} color="rgba(255,255,255,0.4)" /></View>}
              <View style={{ flex: 1 }}>
                <Text style={st.participantName} numberOfLines={1}>{p.display_name ?? 'Participant'}</Text>
                <Text style={st.participantSub}>{p.gifts_count} cadeau{p.gifts_count > 1 ? 'x' : ''} reçu{p.gifts_count > 1 ? 's' : ''}</Text>
              </View>
              <Text style={st.participantAmount}>{p.gogold_generated.toLocaleString('fr-FR')}</Text>
              <Icon name="gift" size={16} color="#FFD700" />
            </TouchableOpacity>
          ))}
          {report.by_participant.length === 0 && (
            <Text style={st.emptyText}>Aucun cadeau reçu pour l'instant dans ce tournoi.</Text>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!rewardTarget} transparent animationType="fade" onRequestClose={() => setRewardTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.modalOverlay}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>Récompenser {rewardTarget?.display_name ?? 'ce participant'}</Text>
            <Text style={st.modalSub}>Montant en GoGold, débité de ton wallet</Text>
            <TextInput
              style={st.modalInput}
              placeholder="Montant"
              placeholderTextColor="#9390AB"
              keyboardType="number-pad"
              value={rewardAmount}
              onChangeText={setRewardAmount}
              autoFocus
            />
            <View style={st.modalActions}>
              <TouchableOpacity style={st.modalCancelBtn} onPress={() => { setRewardTarget(null); setRewardAmount(''); }}>
                <Text style={st.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={handleReward} disabled={rewarding}>
                <LinearGradient colors={['#FFD700', '#D97706']} style={st.modalSendBtn}>
                  {rewarding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.modalSendText}>Envoyer</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0812' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.25)',
    backgroundColor: 'rgba(42,31,10,0.55)',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#F0EFF8' },

  totalCard: { borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)', padding: 20, alignItems: 'center', gap: 6 },
  totalLabel: { color: '#F0EFF8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { color: '#FFD700', fontSize: 30, fontWeight: '900' },
  totalBreakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  totalBreakdownItem: { alignItems: 'center' },
  totalBreakdownLabel: { color: '#9390AB', fontSize: 11, fontWeight: '600' },
  totalBreakdownValue: { color: '#F0EFF8', fontSize: 15, fontWeight: '800', marginTop: 2 },
  totalBreakdownDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' },

  section: { marginTop: 20 },
  sectionTitle: { color: '#F0EFF8', fontSize: 14, fontWeight: '800', marginBottom: 10 },

  roundRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  roundLabel: { color: '#F0EFF8', fontSize: 13, fontWeight: '700' },
  roundValue: { color: '#FFD700', fontSize: 13, fontWeight: '800' },

  participantRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  participantAvatar: { width: 36, height: 36, borderRadius: 18 },
  participantAvatarFallback: { backgroundColor: 'rgba(120,120,120,0.2)', alignItems: 'center', justifyContent: 'center' },
  participantName: { color: '#F0EFF8', fontSize: 13, fontWeight: '700' },
  participantSub: { color: '#9390AB', fontSize: 11, fontWeight: '600', marginTop: 2 },
  participantAmount: { color: '#FFD700', fontSize: 14, fontWeight: '800' },

  emptyText: { color: '#9390AB', fontSize: 13, textAlign: 'center', paddingVertical: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: '#1C1033', borderRadius: 20, padding: 20, gap: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' },
  modalTitle: { color: '#F0EFF8', fontSize: 16, fontWeight: '800' },
  modalSub: { color: '#9390AB', fontSize: 12, fontWeight: '600' },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: '#F0EFF8', fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  modalCancelBtn: { paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center' },
  modalCancelText: { color: '#9390AB', fontSize: 14, fontWeight: '700' },
  modalSendBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  modalSendText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
