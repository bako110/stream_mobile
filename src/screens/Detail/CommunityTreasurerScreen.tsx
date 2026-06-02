/**
 * CommunityTreasurerScreen
 * - Voir / nommer / changer le trésorier (admin)
 * - Lister et gérer les demandes de retrait (admin + trésorier)
 * - Créer une demande de retrait (admin)
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Modal,
  TextInput, ScrollView, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton, SkeletonFeed } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

interface Treasurer {
  id: string; user_id: string; username?: string;
  display_name?: string; avatar_url?: string;
  appointer_name?: string; appointed_at: string;
}

interface WithdrawalRequest {
  id: string; coins_amount: number; eur_amount: number;
  description?: string; status: string;
  admin_approved: boolean; treasurer_approved: boolean;
  admin_approved_at?: string; treasurer_approved_at?: string;
  rejected_at?: string; rejection_note?: string;
  executed_at?: string; created_at: string;
  cotisation_id?: string;
}

interface ElectionResult {
  user_id: string; display_name?: string; username?: string; avatar_url?: string;
  votes: number; pct: number;
}
interface Election {
  id: string; status: string; created_at: string;
  total_votes: number; total_members: number; participation: number;
  my_vote?: string | null;
  results: ElectionResult[];
}

const STATUS_CFG: Record<string, { color: string; label: string; icon: string }> = {
  pending:              { color: '#F59E0B', label: 'En attente',         icon: 'clock' },
  approved_admin:       { color: '#3B82F6', label: 'Attente trésorier',  icon: 'user-check' },
  approved_treasurer:   { color: '#8B5CF6', label: 'Attente admin',      icon: 'shield' },
  approved:             { color: '#10B981', label: 'Exécuté',            icon: 'check-circle' },
  rejected:             { color: '#EF4444', label: 'Refusé',             icon: 'x-circle' },
  cancelled:            { color: '#9CA3AF', label: 'Annulé',             icon: 'slash' },
};

export const CommunityTreasurerScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { communityId, communityName, myRole, myId } = route.params;
  const isAdmin = myRole === 'admin' || myRole === 'moderator';

  const BASE = `/api/v1/communities/${communityId}`;

  const [treasurer,   setTreasurer]   = useState<Treasurer | null | undefined>(undefined);
  const [requests,    setRequests]    = useState<WithdrawalRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [isTreasurer, setIsTreasurer] = useState(false);
  const [election,    setElection]    = useState<Election | null>(null);
  const [voteLoading, setVoteLoading] = useState<string | null>(null);
  const [launching,   setLaunching]   = useState(false);

  // Modals
  const [pickOpen,     setPickOpen]     = useState(false);
  const [members,      setMembers]      = useState<any[]>([]);
  const [pickLoading,  setPickLoading]  = useState(false);
  const [createOpen,   setCreateOpen]   = useState(false);
  const [formAmount,   setFormAmount]   = useState('');
  const [formDesc,     setFormDesc]     = useState('');
  const [formSaving,   setFormSaving]   = useState(false);
  const [actionLoading,   setActionLoading]   = useState<string | null>(null);
  const [communityBalance,setCommunityBalance] = useState<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const [tRes, rRes, eRes] = await Promise.all([
        apiClient.get<{ treasurer: Treasurer | null }>(`${BASE}/treasurer`),
        apiClient.get<WithdrawalRequest[]>(`${BASE}/withdrawal-requests`).catch(() => ({ data: [] })),
        apiClient.get<{ election: Election | null }>(`${BASE}/treasurer-elections/active`).catch(() => ({ data: { election: null } })),
      ]);
      if (!mountedRef.current) return;
      setTreasurer(tRes.data?.treasurer ?? null);
      setIsTreasurer(!!tRes.data?.treasurer && tRes.data.treasurer.user_id === myId);
      setRequests(rRes.data ?? []);
      const elec = eRes.data?.election ?? null;
      setElection(elec);
      // Solde communautaire
      apiClient.get<{ coins_balance: number }>(`${BASE}/wallet`)
        .then(r => { if (mountedRef.current) setCommunityBalance(r.data?.coins_balance ?? null); })
        .catch(() => {});
      // Charger les membres si vote en cours et pas encore de résultats
      if (elec && elec.results.length === 0) {
        apiClient.get<any[]>(`${BASE}/members`)
          .then(r => setMembers((r.data ?? []).filter((m: any) => m.user_id !== myId)))
          .catch(() => {});
      }
    } catch { setTreasurer(null); }
    finally { setLoading(false); setRefreshing(false); }
  }, [BASE, myId]);

  useEffect(() => { load(); }, [load]);

  const handlePickTreasurer = async () => {
    setPickOpen(true);
    setPickLoading(true);
    try {
      const res = await apiClient.get<any[]>(`${BASE}/members`);
      setMembers((res.data ?? []).filter((m: any) => m.user_id !== myId));
    } catch { Alert.alert('Erreur', 'Impossible de charger les membres.'); setPickOpen(false); }
    finally { setPickLoading(false); }
  };

  const handleAppoint = async (userId: string, name: string) => {
    setPickOpen(false);
    Alert.alert('Nommer trésorier', `Nommer ${name} comme trésorier ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: async () => {
        try {
          await apiClient.post(`${BASE}/treasurer`, { user_id: userId });
          load();
        } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
      }},
    ]);
  };

  const handleRemoveTreasurer = () => {
    Alert.alert('Retirer le trésorier', 'Retirer le trésorier actuel ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: async () => {
        try {
          await apiClient.delete(`${BASE}/treasurer`);
          load();
        } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
      }},
    ]);
  };

  const handleLaunchElection = async () => {
    Alert.alert(
      'Lancer un vote',
      'Lancer un vote pour que les membres élisent le trésorier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Lancer le vote', onPress: async () => {
          setLaunching(true);
          try {
            await apiClient.post(`${BASE}/treasurer-elections`);
            load();
          } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
          finally { setLaunching(false); }
        }},
      ],
    );
  };

  const handleVote = (candidate: ElectionResult) => {
    if (!election) return;
    const name = candidate.display_name || candidate.username || 'ce membre';
    const isChanging = !!election.my_vote;
    Alert.alert(
      isChanging ? 'Changer mon vote' : 'Voter',
      `${isChanging ? 'Changer votre vote pour' : 'Voter pour'} ${name} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: isChanging ? 'Changer' : 'Voter', onPress: async () => {
          setVoteLoading(candidate.user_id);
          try {
            await apiClient.post(`${BASE}/treasurer-elections/${election.id}/vote`, { candidate_id: candidate.user_id });
            load();
          } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible de voter.'); }
          finally { setVoteLoading(null); }
        }},
      ],
    );
  };

  const handleCloseElection = () => {
    if (!election) return;
    if (election.total_votes === 0) { Alert.alert('Impossible', 'Aucun vote enregistré.'); return; }
    const leader = election.results[0];
    Alert.alert(
      'Clôturer le vote',
      `Élire ${leader.display_name || leader.username} comme trésorier ?\n${leader.votes} vote${leader.votes > 1 ? 's' : ''} (${leader.pct}%)`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Élire', onPress: async () => {
          try {
            await apiClient.post(`${BASE}/treasurer-elections/${election.id}/close`);
            load();
          } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
        }},
      ],
    );
  };

  const handleCreateRequest = async () => {
    const amount = parseInt(formAmount, 10);
    if (!amount || amount < 1) { Alert.alert('Erreur', 'Montant invalide.'); return; }
    if (communityBalance !== null && amount > communityBalance) {
      Alert.alert(
        'Solde insuffisant',
        `Le solde communautaire est de ${communityBalance.toLocaleString('fr-FR')} coins.\nVous ne pouvez pas retirer plus.`,
      );
      return;
    }
    setFormSaving(true);
    try {
      const res = await apiClient.post<any>(`${BASE}/withdrawal-requests`, {
        coins_amount: amount,
        description:  formDesc.trim() || undefined,
      });
      setCreateOpen(false);
      setFormAmount(''); setFormDesc('');
      load();
      if (res.data?.executed_immediately) {
        Alert.alert('Retrait exécuté', `${amount} coins ont été transférés vers votre wallet.\n(Aucun trésorier — approbation automatique)`);
      } else {
        Alert.alert('Demande créée', 'Le trésorier doit maintenant approuver le retrait.');
      }
    } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
    finally { setFormSaving(false); }
  };

  const handleApprove = (req: WithdrawalRequest) => {
    Alert.alert(
      'Approuver le retrait',
      `Approuver le retrait de ${req.coins_amount.toLocaleString('fr-FR')} coins (${req.eur_amount.toFixed(2)} €) ?\n\n${req.description ?? ''}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Approuver', onPress: async () => {
          setActionLoading(req.id);
          try {
            await apiClient.post(`${BASE}/withdrawal-requests/${req.id}/approve`);
            load();
          } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
          finally { setActionLoading(null); }
        }},
      ],
    );
  };

  const handleReject = (req: WithdrawalRequest) => {
    Alert.alert(
      'Rejeter le retrait',
      `Rejeter la demande de ${req.coins_amount.toLocaleString('fr-FR')} coins ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Rejeter', style: 'destructive', onPress: async () => {
          setActionLoading(req.id + '_reject');
          try {
            await apiClient.post(`${BASE}/withdrawal-requests/${req.id}/reject`);
            load();
          } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
          finally { setActionLoading(null); }
        }},
      ],
    );
  };

  const canApprove = (req: WithdrawalRequest) => {
    if (req.status === 'approved' || req.status === 'rejected' || req.status === 'cancelled') return false;
    if (isAdmin && !req.admin_approved) return true;
    if (isTreasurer && !req.treasurer_approved) return true;
    return false;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SkeletonFeed />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>Trésorier</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>{communityName}</Text>
        </View>
        {(isAdmin || isTreasurer) && (
          <TouchableOpacity
            onPress={() => setCreateOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 }}
          >
            <Icon name="arrow-up-right" size={13} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Retirer</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={requests}
        keyExtractor={r => r.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
            colors={['#7B3FF2']} tintColor="#7B3FF2" />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View>
            {/* Card trésorier */}
            <View style={{ margin: 16 }}>
              <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>
                TRÉSORIER ACTUEL
              </Text>
              {treasurer ? (
                <View style={[st.treasurerCard, { backgroundColor: colors.surface, borderColor: '#7B3FF240' }]}>
                  <LinearGradient colors={['#7B3FF2', '#E0389A']} style={{ width: 4, borderRadius: 2 }} />
                  <View style={{ paddingHorizontal: 12, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {treasurer.avatar_url ? (
                      <Image source={{ uri: treasurer.avatar_url }} style={st.avatar} />
                    ) : (
                      <View style={[st.avatar, { backgroundColor: '#7B3FF220', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: '#7B3FF2', fontWeight: '800', fontSize: 16 }}>
                          {(treasurer.display_name || treasurer.username || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 15 }}>
                          {treasurer.display_name || treasurer.username}
                        </Text>
                        <View style={{ backgroundColor: '#7B3FF220', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ color: '#7B3FF2', fontSize: 10, fontWeight: '800' }}>TRÉSORIER</Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 2 }}>
                        Nommé par {treasurer.appointer_name} · {fmtDate(treasurer.appointed_at)}
                      </Text>
                    </View>
                    {isAdmin && (
                      <View style={{ gap: 6 }}>
                        <TouchableOpacity onPress={handlePickTreasurer}
                          style={{ backgroundColor: '#7B3FF215', borderRadius: 8, padding: 7 }}>
                          <Icon name="user-plus" size={14} color="#7B3FF2" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleRemoveTreasurer}
                          style={{ backgroundColor: '#EF444415', borderRadius: 8, padding: 7 }}>
                          <Icon name="user-x" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View style={[st.noTreasurerBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                  <Icon name="alert-circle" size={20} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>
                      Aucun trésorier
                    </Text>
                    <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                      Sans trésorier, les retraits sont approuvés par l'admin seul.
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity onPress={handlePickTreasurer}
                      style={{ backgroundColor: '#7B3FF2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Nommer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* ── Section Vote ── */}
            {(election || isAdmin) && (
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700' }}>
                    {election
                      ? 'VOTE EN COURS'
                      : treasurer
                      ? 'VOTE DE DESTITUTION'
                      : 'ÉLECTION TRÉSORIER'}
                  </Text>
                  {isAdmin && !election && (
                    <TouchableOpacity onPress={handleLaunchElection} disabled={launching}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: treasurer ? '#EF4444' : '#7B3FF2',
                        borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
                      {launching ? <ActivityIndicator size="small" color="#fff" /> : (
                        <><Icon name="users" size={12} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                          {treasurer ? 'Voter pour destituer' : 'Lancer un vote'}
                        </Text></>
                      )}
                    </TouchableOpacity>
                  )}
                  {isAdmin && election && (
                    <TouchableOpacity onPress={handleCloseElection}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: '#10B981', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Icon name="check" size={12} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Clôturer et élire</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {election && (
                  <View style={[{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' }]}>
                    {/* Barre top */}
                    <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ height: 3 }} />
                    <View style={{ padding: 14, gap: 10 }}>
                      {/* Stats */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[
                          { val: election.total_votes, lbl: 'Votes', color: '#7B3FF2' },
                          { val: `${election.participation}%`, lbl: 'Participation', color: '#3B82F6' },
                          { val: election.total_members, lbl: 'Membres', color: '#10B981' },
                        ].map(s => (
                          <View key={s.lbl} style={{ flex: 1, backgroundColor: s.color + '12',
                            borderRadius: 10, padding: 8, alignItems: 'center' }}>
                            <Text style={{ color: s.color, fontWeight: '900', fontSize: 16 }}>{String(s.val)}</Text>
                            <Text style={{ color: colors.textTertiary, fontSize: 9 }}>{s.lbl}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Candidats avec barres */}
                      {election.results.length > 0 ? (
                        <View style={{ gap: 8 }}>
                          {election.results.map((c, i) => {
                            const isMyVote = election.my_vote === c.user_id;
                            const isLeader = i === 0;
                            return (
                              <TouchableOpacity key={c.user_id}
                                onPress={() => handleVote(c)}
                                disabled={voteLoading === c.user_id}
                                activeOpacity={0.8}
                                style={{ borderRadius: 12, borderWidth: 1.5, overflow: 'hidden',
                                  borderColor: isMyVote ? '#7B3FF2' : isLeader ? '#F59E0B40' : colors.divider }}
                              >
                                {/* Barre progression */}
                                <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0,
                                  width: `${c.pct}%` as any,
                                  backgroundColor: isMyVote ? '#7B3FF215' : '#F59E0B08' }} />
                                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 }}>
                                  {c.avatar_url ? (
                                    <Image source={{ uri: c.avatar_url }} style={st.avatarSm} />
                                  ) : (
                                    <View style={[st.avatarSm, { backgroundColor: '#7B3FF220',
                                      alignItems: 'center', justifyContent: 'center' }]}>
                                      <Text style={{ color: '#7B3FF2', fontWeight: '800' }}>
                                        {(c.display_name || c.username || '?')[0].toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>
                                      {c.display_name || c.username}
                                    </Text>
                                    <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
                                      {c.votes} vote{c.votes !== 1 ? 's' : ''} · {c.pct}%
                                    </Text>
                                  </View>
                                  {isLeader && <Icon name="award" size={16} color="#F59E0B" />}
                                  {isMyVote && (
                                    <View style={{ backgroundColor: '#7B3FF220', borderRadius: 8,
                                      paddingHorizontal: 8, paddingVertical: 3 }}>
                                      <Text style={{ color: '#7B3FF2', fontSize: 10, fontWeight: '800' }}>MON VOTE</Text>
                                    </View>
                                  )}
                                  {voteLoading === c.user_id && <ActivityIndicator size="small" color="#7B3FF2" />}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
                          <Icon name="users" size={28} color={colors.textTertiary} />
                          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                            Aucun vote pour l'instant
                          </Text>
                          <Text style={{ color: colors.textTertiary, fontSize: 12, textAlign: 'center' }}>
                            Tapez sur un membre dans la liste pour voter
                          </Text>
                        </View>
                      )}

                      {/* Tous les membres votables si pas encore de résultats */}
                      {election.results.length === 0 && members.length > 0 && (
                        <View style={{ gap: 6 }}>
                          <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700' }}>CANDIDATS</Text>
                          {members.slice(0, 5).map(m => (
                            <TouchableOpacity key={m.user_id} onPress={() => handleVote({
                              user_id: m.user_id, display_name: m.display_name,
                              username: m.username, avatar_url: m.avatar_url, votes: 0, pct: 0,
                            })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                              padding: 10, backgroundColor: colors.backgroundSecondary, borderRadius: 12 }}>
                              {m.avatar_url
                                ? <Image source={{ uri: m.avatar_url }} style={st.avatarSm} />
                                : <View style={[st.avatarSm, { backgroundColor: '#7B3FF220',
                                    alignItems: 'center', justifyContent: 'center' }]}>
                                    <Text style={{ color: '#7B3FF2', fontWeight: '700' }}>
                                      {(m.display_name || m.username || '?')[0].toUpperCase()}
                                    </Text>
                                  </View>
                              }
                              <Text style={{ color: colors.textPrimary, fontWeight: '600', flex: 1 }}>
                                {m.display_name || m.username}
                              </Text>
                              <Text style={{ color: '#7B3FF2', fontSize: 12, fontWeight: '700' }}>Voter →</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Explication double approbation */}
            <View style={[st.infoBox, { backgroundColor: '#7B3FF210', borderColor: '#7B3FF230', marginHorizontal: 16, marginBottom: 16 }]}>
              <Icon name="shield" size={14} color="#7B3FF2" />
              <Text style={{ color: '#7B3FF2', fontSize: 12, flex: 1, lineHeight: 17 }}>
                Chaque retrait nécessite l'approbation de <Text style={{ fontWeight: '800' }}>l'admin ET du trésorier</Text> avant d'être exécuté.
              </Text>
            </View>

            <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700', marginHorizontal: 16, marginBottom: 8 }}>
              DEMANDES DE RETRAIT ({requests.length})
            </Text>
          </View>
        }
        renderItem={({ item: req }) => {
          const cfg = STATUS_CFG[req.status] ?? STATUS_CFG.pending;
          const needsMyApproval = canApprove(req);
          return (
            <View style={[st.reqCard, { backgroundColor: colors.surface, borderColor: needsMyApproval ? '#F59E0B60' : colors.divider }]}>
              {needsMyApproval && (
                <LinearGradient colors={['#F59E0B', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ height: 3, borderTopLeftRadius: 14, borderTopRightRadius: 14 }} />
              )}
              <View style={{ padding: 14, gap: 10 }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '900' }}>
                      {req.coins_amount.toLocaleString('fr-FR')} <Text style={{ fontSize: 13, fontWeight: '400' }}>coins</Text>
                    </Text>
                    <Text style={{ color: colors.textTertiary, fontSize: 12 }}>≈ {req.eur_amount.toFixed(2)} €</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                    backgroundColor: cfg.color + '15', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
                    <Icon name={cfg.icon} size={12} color={cfg.color} />
                    <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '800' }}>{cfg.label}</Text>
                  </View>
                </View>

                {req.description && (
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{req.description}</Text>
                )}

                {/* Qui a lancé */}
                {req.requested_by === myId && req.status !== 'approved' && req.status !== 'rejected' && req.status !== 'cancelled' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: '#3B82F610', borderRadius: 10, padding: 8 }}>
                    <Icon name="send" size={12} color="#3B82F6" />
                    <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: '700' }}>
                      Vous avez lancé cette demande · en attente de {isAdmin ? 'l\'approbation du trésorier' : 'l\'approbation de l\'admin'}
                    </Text>
                  </View>
                )}

                {/* Approbations */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { label: 'Admin', approved: req.admin_approved, at: req.admin_approved_at, isMe: isAdmin && req.requested_by !== myId },
                    { label: 'Trésorier', approved: req.treasurer_approved, at: req.treasurer_approved_at, isMe: isTreasurer && req.requested_by !== myId },
                  ].map(a => (
                    <View key={a.label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: a.approved ? '#10B98115' : a.isMe ? '#F59E0B10' : colors.backgroundSecondary,
                      borderRadius: 10, padding: 8,
                      borderWidth: a.isMe && !a.approved ? 1 : 0,
                      borderColor: '#F59E0B40' }}>
                      <Icon name={a.approved ? 'check-circle' : a.isMe ? 'alert-circle' : 'clock'} size={14}
                        color={a.approved ? '#10B981' : a.isMe ? '#F59E0B' : colors.textTertiary} />
                      <View>
                        <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>{a.label}</Text>
                        <Text style={{ color: a.approved ? '#10B981' : a.isMe ? '#F59E0B' : colors.textTertiary, fontSize: 10 }}>
                          {a.approved ? (a.at ? fmtDate(a.at) : 'Approuvé') : a.isMe ? 'Votre approbation requise' : 'En attente'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {req.rejection_note && (
                  <View style={{ flexDirection: 'row', gap: 6, backgroundColor: '#EF444410', borderRadius: 8, padding: 8 }}>
                    <Icon name="x-circle" size={13} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontSize: 12, flex: 1 }}>{req.rejection_note}</Text>
                  </View>
                )}

                {/* Actions */}
                {needsMyApproval && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleApprove(req)}
                      disabled={actionLoading === req.id}
                      style={{ flex: 1, borderRadius: 10, overflow: 'hidden' }}
                    >
                      <LinearGradient colors={['#10B981', '#059669']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                          gap: 6, paddingVertical: 11 }}>
                        {actionLoading === req.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <><Icon name="check" size={14} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Approuver</Text></>
                        }
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleReject(req)}
                      disabled={actionLoading === req.id + '_reject'}
                      style={{ flex: 1, backgroundColor: '#EF444415', borderRadius: 10, borderWidth: 1,
                        borderColor: '#EF444440', flexDirection: 'row', alignItems: 'center',
                        justifyContent: 'center', gap: 6, paddingVertical: 11 }}
                    >
                      {actionLoading === req.id + '_reject'
                        ? <ActivityIndicator size="small" color="#EF4444" />
                        : <><Icon name="x" size={14} color="#EF4444" /><Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 13 }}>Rejeter</Text></>
                      }
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={{ color: colors.textTertiary, fontSize: 10, textAlign: 'right' }}>
                  Créée le {fmtDate(req.created_at)}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 32, gap: 8 }}>
            <Icon name="inbox" size={32} color={colors.textTertiary} />
            <Text style={{ color: colors.textTertiary, fontSize: 14 }}>Aucune demande de retrait</Text>
          </View>
        }
      />

      {/* Modal picker membre */}
      <Modal visible={pickOpen} transparent animationType="slide" onRequestClose={() => setPickOpen(false)}>
        <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setPickOpen(false)} />
        <View style={[st.sheet, { backgroundColor: colors.background }]}>
          <View style={[st.sheetHandle]}><View style={[st.handle, { backgroundColor: colors.divider }]} /></View>
          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16, paddingHorizontal: 16, marginBottom: 12 }}>
            Choisir un trésorier
          </Text>
          {pickLoading ? (
            <ActivityIndicator color="#7B3FF2" style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={members}
              keyExtractor={m => m.user_id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              renderItem={({ item: m }) => (
                <TouchableOpacity onPress={() => handleAppoint(m.user_id, m.display_name || m.username)}
                  style={[st.memberRow, { borderBottomColor: colors.divider }]}>
                  {m.avatar_url
                    ? <Image source={{ uri: m.avatar_url }} style={st.avatarSm} />
                    : <View style={[st.avatarSm, { backgroundColor: '#7B3FF220', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: '#7B3FF2', fontWeight: '700' }}>
                          {(m.display_name || m.username || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14 }}>
                      {m.display_name || m.username}
                    </Text>
                    {m.role && <Text style={{ color: colors.textTertiary, fontSize: 11 }}>{m.role}</Text>}
                  </View>
                  <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Modal créer demande retrait */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => !formSaving && setCreateOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.kavBottom} pointerEvents="box-none">
          <View style={[st.sheet, { backgroundColor: colors.background }]}>
            <View style={st.sheetHandle}><View style={[st.handle, { backgroundColor: colors.divider }]} /></View>
            <View style={[st.sheetHeader, { borderBottomColor: colors.divider }]}>
              <TouchableOpacity onPress={() => setCreateOpen(false)}>
                <Icon name="x" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16, flex: 1, textAlign: 'center' }}>
                Demande de retrait
              </Text>
              <TouchableOpacity onPress={handleCreateRequest} disabled={formSaving}>
                {formSaving
                  ? <ActivityIndicator size="small" color="#10B981" />
                  : <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 14 }}>Envoyer</Text>
                }
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">

              {/* Solde communautaire disponible */}
              {communityBalance !== null && (
                <View style={[st.infoBox, { backgroundColor: '#10B98110', borderColor: '#10B98130' }]}>
                  <Icon name="briefcase" size={14} color="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800' }}>
                      Solde communautaire : {communityBalance.toLocaleString('fr-FR')} coins
                    </Text>
                    <Text style={{ color: '#10B981', fontSize: 11, opacity: 0.8 }}>
                      ≈ {(communityBalance / 100).toFixed(2)} € disponibles
                    </Text>
                  </View>
                </View>
              )}

              {/* Info double approbation */}
              {treasurer && (
                <View style={[st.infoBox, { backgroundColor: '#F59E0B10', borderColor: '#F59E0B30' }]}>
                  <Icon name="shield" size={14} color="#F59E0B" />
                  <Text style={{ color: '#F59E0B', fontSize: 12, flex: 1 }}>
                    Cette demande devra être approuvée par <Text style={{ fontWeight: '800' }}>vous ET le trésorier</Text> avant exécution.
                  </Text>
                </View>
              )}

              <View>
                <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>MONTANT (coins) *</Text>
                <View style={[st.inputRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                  <Icon name="zap" size={16} color="#10B981" />
                  <TextInput
                    style={{ flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}
                    value={formAmount}
                    onChangeText={v => setFormAmount(v.replace(/[^0-9]/g, ''))}
                    placeholder="Ex: 500"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                  />
                  {formAmount ? (
                    <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                      ≈ {(parseInt(formAmount || '0') / 100).toFixed(2)} €
                    </Text>
                  ) : null}
                </View>
              </View>

              <View>
                <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>MOTIF (optionnel)</Text>
                <TextInput
                  style={[st.inputText, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider, color: colors.textPrimary }]}
                  value={formDesc}
                  onChangeText={setFormDesc}
                  placeholder="Ex: Achat matériel, remboursement membres..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  maxLength={500}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const st = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  treasurerCard:{ flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', paddingVertical: 12 },
  noTreasurerBox:{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  infoBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  reqCard:      { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  avatar:       { width: 44, height: 44, borderRadius: 22 },
  avatarSm:     { width: 40, height: 40, borderRadius: 20 },
  memberRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  overlay:      { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  kavBottom:    { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  sheetHandle:  { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:       { width: 40, height: 4, borderRadius: 2 },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  inputText:    { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
});
