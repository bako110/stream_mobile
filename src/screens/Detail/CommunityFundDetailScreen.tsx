/**
 * CommunityFundDetailScreen — Détail d'une cotisation :
 * - Progression, stats
 * - Liste des contributions (payé / en attente / exempté)
 * - Admin : clôturer, annuler, exempter un membre, exporter CSV
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Share, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

interface Contribution {
  id: string;
  user_id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  coins_paid: number;
  status: 'pending' | 'paid' | 'exempt';
  note?: string;
  paid_at?: string;
  created_at: string;
}

interface Cotisation {
  id: string;
  title: string;
  description?: string;
  amount_per_member: number;
  target_amount_coins: number;
  collected_coins: number;
  member_count_paid: number;
  member_count_total: number;
  progress_pct: number;
  status: 'active' | 'closed' | 'cancelled';
  deadline?: string;
  created_at: string;
}

const STATUS_CFG = {
  paid:    { color: '#10B981', bg: '#10B98115', icon: 'check-circle', label: 'Payé' },
  pending: { color: '#F59E0B', bg: '#F59E0B15', icon: 'clock',        label: 'En attente' },
  exempt:  { color: '#3B82F6', bg: '#3B82F615', icon: 'shield',       label: 'Exempté' },
};

export const CommunityFundDetailScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { communityId, cotisationId, myRole, myId } = route.params;
  const isAdmin = myRole === 'admin' || myRole === 'moderator';

  const [cotisation,    setCotisation]    = useState<Cotisation | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [filter,        setFilter]        = useState<'all' | 'paid' | 'pending' | 'exempt'>('all');
  const [exempting,     setExempting]     = useState<string | null>(null);

  const BASE = `/api/v1/communities/${communityId}/cotisations/${cotisationId}`;

  const load = useCallback(async () => {
    try {
      const [cotRes, contribRes] = await Promise.all([
        apiClient.get<Cotisation>(BASE),
        apiClient.get<Contribution[]>(`${BASE}/contributions`),
      ]);
      setCotisation(cotRes.data);
      setContributions(contribRes.data ?? []);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, [BASE]);

  useEffect(() => { load(); }, [load]);

  const handleClose = () => {
    Alert.alert('Clôturer', 'Clôturer cette cotisation ? Les membres ne pourront plus payer.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Clôturer', onPress: async () => {
        try {
          await apiClient.post(`${BASE}/close`);
          load();
        } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
      }},
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Annuler la cotisation',
      'Tous les membres qui ont payé seront remboursés automatiquement.',
      [
        { text: 'Retour', style: 'cancel' },
        { text: 'Annuler et rembourser', style: 'destructive', onPress: async () => {
          try {
            const res = await apiClient.post<{ refunded_count: number }>(`${BASE}/cancel`);
            Alert.alert('Annulée', `${res.data?.refunded_count ?? 0} membre(s) remboursé(s).`);
            load();
          } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
        }},
      ],
    );
  };

  const handleExempt = (contrib: Contribution) => {
    const name = contrib.display_name || contrib.username || 'Ce membre';
    Alert.alert('Exempter', `Exempter ${name} de cette cotisation ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Exempter', onPress: async () => {
        setExempting(contrib.user_id);
        try {
          await apiClient.patch(`${BASE}/contributions/${contrib.user_id}/exempt`);
          load();
        } catch (e: any) { Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible.'); }
        finally { setExempting(null); }
      }},
    ]);
  };

  const handleExport = async () => {
    try {
      // Partage via URL — le navigateur ou une app de fichiers télécharge le CSV
      const exportUrl = `/api/v1/communities/${communityId}/cotisations/${cotisationId}/export`;
      await Share.share({
        title: `Cotisation — ${cotisation?.title ?? ''}`,
        message: `Télécharger le rapport CSV :\n${exportUrl}`,
      });
    } catch { }
  };

  const filtered = filter === 'all' ? contributions : contributions.filter(c => c.status === filter);

  const paidCount    = contributions.filter(c => c.status === 'paid').length;
  const pendingCount = contributions.filter(c => c.status === 'pending').length;
  const exemptCount  = contributions.filter(c => c.status === 'exempt').length;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#7B3FF2" size="large" />
      </View>
    );
  }

  if (!cotisation) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="alert-circle" size={40} color={colors.textTertiary} />
        <Text style={{ color: colors.textTertiary, marginTop: 12 }}>Cotisation introuvable</Text>
      </View>
    );
  }

  const statusColor = cotisation.status === 'active' ? '#10B981' : cotisation.status === 'closed' ? '#3B82F6' : '#EF4444';
  const statusLabel = cotisation.status === 'active' ? 'En cours' : cotisation.status === 'closed' ? 'Clôturée' : 'Annulée';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>
            {cotisation.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>{statusLabel}</Text>
          </View>
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={handleExport} style={{ padding: 8 }}>
            <Icon name="download" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={c => c.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
            colors={['#7B3FF2']} tintColor="#7B3FF2" />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View>
            {/* Card progression */}
            <View style={{ padding: 16 }}>
              <View style={[st.progressCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                {/* Barre top */}
                <LinearGradient
                  colors={cotisation.status === 'active' ? ['#7B3FF2', '#E0389A'] : [colors.divider, colors.divider]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ height: 4, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
                />
                <View style={{ padding: 16, gap: 12 }}>
                  {cotisation.description ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                      {cotisation.description}
                    </Text>
                  ) : null}

                  {/* Progression */}
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 22 }}>
                        {cotisation.collected_coins.toLocaleString('fr-FR')}
                        <Text style={{ fontSize: 13, fontWeight: '400', color: colors.textTertiary }}> coins</Text>
                      </Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 13, alignSelf: 'flex-end' }}>
                        sur {cotisation.target_amount_coins.toLocaleString('fr-FR')}
                      </Text>
                    </View>
                    <View style={[st.progressTrack, { backgroundColor: colors.backgroundSecondary }]}>
                      <LinearGradient
                        colors={cotisation.progress_pct >= 100 ? ['#10B981', '#059669'] : ['#7B3FF2', '#E0389A']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={[st.progressFill, { width: `${Math.min(cotisation.progress_pct, 100)}%` as any }]}
                      />
                    </View>
                    <Text style={{ color: '#7B3FF2', fontWeight: '800', fontSize: 13, marginTop: 6 }}>
                      {cotisation.progress_pct}% collecté
                    </Text>
                  </View>

                  {/* Stats 4 blocs */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { val: cotisation.amount_per_member,       lbl: 'Par membre',  color: '#7B3FF2', suffix: ' coins' },
                      { val: cotisation.member_count_paid,       lbl: 'Payé',        color: '#10B981', suffix: `/${cotisation.member_count_total}` },
                      { val: pendingCount,                       lbl: 'En attente',  color: '#F59E0B', suffix: '' },
                      { val: exemptCount,                        lbl: 'Exemptés',    color: '#3B82F6', suffix: '' },
                    ].map(s => (
                      <View key={s.lbl} style={{ flex: 1, backgroundColor: s.color + '12',
                        borderRadius: 12, padding: 9, alignItems: 'center' }}>
                        <Text style={{ color: s.color, fontSize: 15, fontWeight: '900' }}>
                          {s.val}{s.suffix}
                        </Text>
                        <Text style={{ color: colors.textTertiary, fontSize: 9, marginTop: 2 }}>{s.lbl}</Text>
                      </View>
                    ))}
                  </View>

                  {cotisation.deadline && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="clock" size={13} color={colors.textTertiary} />
                      <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                        Deadline : {new Date(cotisation.deadline).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Boutons admin */}
            {isAdmin && cotisation.status === 'active' && (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
                <TouchableOpacity onPress={handleClose} style={[st.adminBtn, { backgroundColor: '#3B82F615', borderColor: '#3B82F640', flex: 1 }]}>
                  <Icon name="check-square" size={14} color="#3B82F6" />
                  <Text style={{ color: '#3B82F6', fontWeight: '700', fontSize: 13 }}>Clôturer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCancel} style={[st.adminBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440', flex: 1 }]}>
                  <Icon name="x-circle" size={14} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 13 }}>Annuler + rembourser</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Bouton retrait — demande formelle via trésorier */}
            {isAdmin && cotisation.status === 'closed' && cotisation.collected_coins > 0 && (
              <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => nav.navigate('CommunityTreasurer', {
                    communityId,
                    communityName: cotisation?.title ?? communityId,
                    myRole,
                    myId: myId ?? '',
                  })}
                  activeOpacity={0.85}
                  style={{ borderRadius: 14, overflow: 'hidden' }}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 10, paddingVertical: 14, borderRadius: 14 }}
                  >
                    <Icon name="shield" size={18} color="#fff" />
                    <View>
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>
                        Demander le retrait
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>
                        Requiert approbation admin + trésorier
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* Filtres */}
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
              {([
                { key: 'all',     label: 'Tous',        count: contributions.length },
                { key: 'paid',    label: 'Payés',       count: paidCount },
                { key: 'pending', label: 'En attente',  count: pendingCount },
                { key: 'exempt',  label: 'Exemptés',    count: exemptCount },
              ] as const).map(f => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[st.filterChip, {
                    backgroundColor: filter === f.key ? '#7B3FF2' : colors.backgroundSecondary,
                    borderColor: filter === f.key ? '#7B3FF2' : colors.divider,
                  }]}
                >
                  <Text style={{ color: filter === f.key ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    {f.label} ({f.count})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700',
              paddingHorizontal: 16, marginBottom: 8 }}>
              {filtered.length} MEMBRE{filtered.length !== 1 ? 'S' : ''}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const cfg = STATUS_CFG[item.status];
          return (
            <View style={[st.row, { borderBottomColor: colors.divider }]}>
              {/* Avatar */}
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={st.avatar} />
              ) : (
                <View style={[st.avatar, { backgroundColor: '#7B3FF222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#7B3FF2', fontWeight: '800', fontSize: 14 }}>
                    {(item.display_name || item.username || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Infos */}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                  {item.display_name || item.username || 'Inconnu'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <View style={[st.statusPill, { backgroundColor: cfg.bg }]}>
                    <Icon name={cfg.icon} size={10} color={cfg.color} />
                    <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{cfg.label}</Text>
                  </View>
                  {item.paid_at && (
                    <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
                      {new Date(item.paid_at).toLocaleDateString('fr-FR')}
                    </Text>
                  )}
                </View>
              </View>

              {/* Montant */}
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {item.status === 'paid' ? (
                  <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 14 }}>
                    +{item.coins_paid} coins
                  </Text>
                ) : item.status === 'pending' ? (
                  <Text style={{ color: '#F59E0B', fontWeight: '600', fontSize: 12 }}>
                    En attente
                  </Text>
                ) : (
                  <Text style={{ color: '#3B82F6', fontWeight: '600', fontSize: 12 }}>
                    Exempté
                  </Text>
                )}

                {/* Bouton exempter (admin, pending uniquement) */}
                {isAdmin && item.status === 'pending' && cotisation.status === 'active' && (
                  <TouchableOpacity
                    onPress={() => handleExempt(item)}
                    disabled={exempting === item.user_id}
                    style={{ backgroundColor: '#3B82F615', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
                  >
                    {exempting === item.user_id
                      ? <ActivityIndicator size="small" color="#3B82F6" />
                      : <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '700' }}>Exempter</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 32, gap: 8 }}>
            <Icon name="users" size={32} color={colors.textTertiary} />
            <Text style={{ color: colors.textTertiary, fontSize: 14 }}>
              Aucun membre dans ce filtre
            </Text>
          </View>
        }
      />
    </View>
  );
};

const st = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  progressCard:  { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill:  { height: 8, borderRadius: 4 },
  adminBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                   borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  filterChip:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16,
                   paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar:        { width: 44, height: 44, borderRadius: 22 },
  statusPill:    { flexDirection: 'row', alignItems: 'center', gap: 4,
                   paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
});
