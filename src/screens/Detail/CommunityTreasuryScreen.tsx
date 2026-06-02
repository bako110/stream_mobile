/**
 * CommunityTreasuryScreen — Trésorerie communautaire (admin/mod).
 * Affiche le solde du wallet communautaire + historique des transactions.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

interface WalletInfo {
  coins_balance:   number;
  total_received:  number;
  total_withdrawn: number;
  eur_balance:     number;
  eur_received:    number;
}

interface TxItem {
  id:           string;
  tx_type:      string;
  label:        string;
  coins_amount: number;
  balance_after:number;
  description:  string;
  actor_name?:  string;
  actor_avatar?:string;
  reference_id?:string;
  created_at:   string;
}

const TX_ICONS: Record<string, { icon: string; color: string }> = {
  cotisation_received: { icon: 'arrow-down-left', color: '#10B981' },
  cotisation_refund:   { icon: 'corner-up-left',  color: '#F59E0B' },
  withdrawal:          { icon: 'arrow-up-right',  color: '#E0389A' },
  manual_credit:       { icon: 'plus-circle',     color: '#3B82F6' },
  manual_debit:        { icon: 'minus-circle',    color: '#EF4444' },
};

export const CommunityTreasuryScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { communityId, communityName } = route.params;

  const [wallet,     setWallet]     = useState<WalletInfo | null>(null);
  const [txs,        setTxs]        = useState<TxItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wRes, tRes] = await Promise.all([
        apiClient.get<WalletInfo>(`/api/v1/communities/${communityId}/wallet`),
        apiClient.get<TxItem[]>(`/api/v1/communities/${communityId}/wallet/transactions`),
      ]);
      setWallet(wRes.data);
      setTxs(tRes.data ?? []);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>Trésorerie</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>{communityName}</Text>
        </View>
        <TouchableOpacity
          onPress={() => nav.navigate('CommunityFund', { communityId, communityName, myRole: 'admin' })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: '#7B3FF215', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 }}
        >
          <Icon name="dollar-sign" size={13} color="#7B3FF2" />
          <Text style={{ color: '#7B3FF2', fontWeight: '700', fontSize: 12 }}>Cotisations</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#7B3FF2" size="large" />
        </View>
      ) : (
        <FlatList
          data={txs}
          keyExtractor={t => t.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
              colors={['#7B3FF2']} tintColor="#7B3FF2" />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View>
              {/* Card solde principal */}
              <LinearGradient
                colors={['#7B3FF2', '#E0389A']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ margin: 16, borderRadius: 22, padding: 22 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21,
                    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="briefcase" size={20} color="#fff" />
                  </View>
                  <View>
                    <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' }}>
                      COMPTE COMMUNAUTAIRE
                    </Text>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{communityName}</Text>
                  </View>
                </View>

                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 }}>Solde disponible</Text>
                <Text style={{ color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -1 }}>
                  {(wallet?.coins_balance ?? 0).toLocaleString('fr-FR')}
                  <Text style={{ fontSize: 16, fontWeight: '400' }}> coins</Text>
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 }}>
                  ≈ {wallet?.eur_balance?.toFixed(2) ?? '0.00'} €
                </Text>

                {/* Stats bas */}
                <View style={{ flexDirection: 'row', marginTop: 18, gap: 8 }}>
                  {[
                    { lbl: 'Total collecté', val: `${(wallet?.total_received ?? 0).toLocaleString('fr-FR')} coins`, sub: `${wallet?.eur_received?.toFixed(2) ?? '0.00'} €` },
                    { lbl: 'Total retiré',   val: `${(wallet?.total_withdrawn ?? 0).toLocaleString('fr-FR')} coins`, sub: `${((wallet?.total_withdrawn ?? 0) / 100).toFixed(2)} €` },
                  ].map(s => (
                    <View key={s.lbl} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)',
                      borderRadius: 14, padding: 12 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginBottom: 4 }}>{s.lbl}</Text>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{s.val}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{s.sub}</Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>

              {/* Titre historique */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, marginBottom: 10 }}>
                <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700' }}>
                  HISTORIQUE DES MOUVEMENTS
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: 11 }}>{txs.length} opération{txs.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const cfg = TX_ICONS[item.tx_type] ?? { icon: 'activity', color: '#7B3FF2' };
            const isCredit = item.coins_amount > 0;
            return (
              <View style={[st.txRow, { borderBottomColor: colors.divider }]}>
                {/* Icône */}
                <View style={[st.txIcon, { backgroundColor: cfg.color + '15' }]}>
                  <Icon name={cfg.icon} size={16} color={cfg.color} />
                </View>

                {/* Infos */}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                    {item.description}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    {item.actor_name && (
                      <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
                        {item.actor_name} ·
                      </Text>
                    )}
                    <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
                      {fmtDate(item.created_at)}
                    </Text>
                  </View>
                </View>

                {/* Montant */}
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ color: isCredit ? '#10B981' : '#EF4444', fontWeight: '800', fontSize: 15 }}>
                    {isCredit ? '+' : ''}{item.coins_amount.toLocaleString('fr-FR')}
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 10 }}>
                    Solde : {item.balance_after.toLocaleString('fr-FR')}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
              <Icon name="inbox" size={36} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: 14 }}>Aucune transaction</Text>
              <Text style={{ color: colors.textTertiary, fontSize: 12, textAlign: 'center' }}>
                Les mouvements apparaîtront ici quand des cotisations seront lancées.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const st = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  txRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  txIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
