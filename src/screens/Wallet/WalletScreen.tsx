/**
 * WalletScreen — Portefeuille principal
 * - Balance coins animée
 * - Actions rapides: Acheter, Envoyer cadeau, Retirer
 * - Stats: gagné / dépensé / en attente
 * - Liste des 10 dernières transactions
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useWsEvents } from '../../hooks/useWsEvents';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

// ── Types ──────────────────────────────────────────────────────────────────
interface WalletBalance {
  coins_balance: number;
  coins_earned: number;
  coins_spent: number;
  total_earned: number;
  total_spent: number;
  pending_withdrawal: number;
}

interface Transaction {
  id: string;
  transaction_type: 'credit_purchase' | 'gift_sent' | 'gift_received' | 'withdrawal' | 'bonus' | 'refund' | 'community_entry' | 'transfer_sent' | 'transfer_received' | 'boost_purchase' | 'community_reward' | 'view_revenue' | 'subscription_revenue';
  coins_amount: number;
  description: string;
  created_at: string;
  status: 'completed' | 'pending' | 'failed';
  balance_after?: number;
  reference_type?: string;
  reference_id?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const coinsToEur = (coins: number) => ((coins / 100) * 0.5).toFixed(2);

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const txIcon = (type: Transaction['transaction_type']) => {
  switch (type) {
    case 'credit_purchase':       return { name: 'shopping-cart',   lib: 'feather', color: '#3B82F6' };
    case 'gift_sent':             return { name: 'gift',             lib: 'feather', color: '#E85DAD' };
    case 'gift_received':         return { name: 'gift',             lib: 'mci',     color: '#3FEDB6' };
    case 'withdrawal':            return { name: 'arrow-up-right',   lib: 'feather', color: '#FF8C4A' };
    case 'bonus':                 return { name: 'star',             lib: 'feather', color: '#FFD700' };
    case 'refund':                return { name: 'rotate-ccw',       lib: 'feather', color: '#9B65F5' };
    case 'community_entry':       return { name: 'users',            lib: 'feather', color: '#7B3FF2' };
    case 'community_reward':      return { name: 'award',            lib: 'feather', color: '#36D9A0' };
    case 'transfer_sent':         return { name: 'arrow-up-right',   lib: 'feather', color: '#EF4444' };
    case 'transfer_received':     return { name: 'arrow-down-left',  lib: 'feather', color: '#10B981' };
    case 'boost_purchase':        return { name: 'zap',              lib: 'feather', color: '#FF7A2F' };
    case 'view_revenue':          return { name: 'eye',              lib: 'feather', color: '#06B6D4' };
    case 'subscription_revenue':  return { name: 'repeat',           lib: 'feather', color: '#8B5CF6' };
    default:                      return { name: 'circle',           lib: 'feather', color: '#6B698A' };
  }
};

const txLabel = (type: Transaction['transaction_type']): string => {
  switch (type) {
    case 'credit_purchase':      return 'Achat de coins';
    case 'gift_sent':            return 'Cadeau envoyé';
    case 'gift_received':        return 'Cadeau reçu';
    case 'withdrawal':           return 'Retrait';
    case 'bonus':                return 'Bonus';
    case 'refund':               return 'Remboursement';
    case 'community_entry':      return 'Adhésion communauté';
    case 'community_reward':     return 'Récompense communauté';
    case 'transfer_sent':        return 'Transfert envoyé';
    case 'transfer_received':    return 'Transfert reçu';
    case 'boost_purchase':       return 'Boost acheté';
    case 'view_revenue':         return 'Revenus vues';
    case 'subscription_revenue': return 'Revenus abonnement';
    default:                     return 'Transaction';
  }
};

// ── Skeleton ───────────────────────────────────────────────────────────────
const SkeletonBox: React.FC<{ w?: number | string; h?: number; br?: number; style?: any }> = ({
  w = '100%', h = 16, br = 8, style,
}) => {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View
      style={[{ width: w as any, height: h, borderRadius: br, backgroundColor: '#2A2840', opacity: anim }, style]}
    />
  );
};

const WalletSkeleton: React.FC = () => (
  <View style={{ padding: 20, gap: 16 }}>
    <SkeletonBox h={140} br={20} />
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {[1, 2, 3].map(i => <SkeletonBox key={i} w="30%" h={80} br={16} />)}
    </View>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {[1, 2, 3].map(i => <SkeletonBox key={i} w="30%" h={70} br={12} />)}
    </View>
    {[1, 2, 3, 4, 5].map(i => (
      <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <SkeletonBox w={44} h={44} br={22} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox h={14} w="60%" />
          <SkeletonBox h={11} w="40%" />
        </View>
        <SkeletonBox w={60} h={14} />
      </View>
    ))}
  </View>
);

// ── Main ───────────────────────────────────────────────────────────────────
const WalletScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance]       = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [txOffset, setTxOffset]     = useState(0);
  const [txHasMore, setTxHasMore]   = useState(false);
  const [txLoadingMore, setTxLoadingMore] = useState(false);
  const TX_LIMIT = 10;

  // Animated coin count-up
  const animatedCoins = useRef(new Animated.Value(0)).current;
  const [displayCoins, setDisplayCoins] = useState(0);

  const runCountUp = useCallback((target: number) => {
    animatedCoins.setValue(0);
    Animated.timing(animatedCoins, {
      toValue: target,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    const id = animatedCoins.addListener(({ value }) => setDisplayCoins(Math.floor(value)));
    return () => animatedCoins.removeListener(id);
  }, [animatedCoins]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [balRes, txRes] = await Promise.all([
        apiClient.get<WalletBalance>(Endpoints.wallet.balance),
        apiClient.get<Transaction[]>(`${Endpoints.wallet.transactions}?limit=${TX_LIMIT}&offset=0`),
      ]);
      setBalance(balRes.data);
      const txList = txRes.data ?? [];
      setTransactions(txList);
      setTxOffset(TX_LIMIT);
      setTxHasMore(txList.length === TX_LIMIT);
      runCountUp(balRes.data?.coins_balance ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement');
    }
  }, [runCountUp]);

  const loadMoreTx = useCallback(async () => {
    if (txLoadingMore || !txHasMore) return;
    setTxLoadingMore(true);
    try {
      const res = await apiClient.get<Transaction[]>(
        `${Endpoints.wallet.transactions}?limit=${TX_LIMIT}&offset=${txOffset}`,
      );
      const more = res.data ?? [];
      setTransactions(prev => [...prev, ...more]);
      setTxOffset(prev => prev + TX_LIMIT);
      setTxHasMore(more.length === TX_LIMIT);
    } catch { /* silencieux */ }
    finally { setTxLoadingMore(false); }
  }, [txLoadingMore, txHasMore, txOffset]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Rafraîchissement automatique quand on reçoit un transfert ou cadeau
  useWsEvents({
    onCoinTransferReceived: () => fetchData(),
    onGiftReceived:         () => fetchData(),
  });

  const s = styles(colors);

  // ── Ouvre la facture détaillée d'une transaction ────────────────────────
  const openReceipt = (tx: Transaction) => {
    const label      = txLabel(tx.transaction_type);
    const isCredit   = tx.coins_amount > 0;
    const absAmt     = Math.abs(tx.coins_amount);
    const eurAmt     = ((absAmt / 100) * 0.5).toFixed(2);
    const statusStr  = tx.status === 'completed' ? 'Confirmée' : tx.status === 'pending' ? 'En attente' : 'Échouée';
    const balInfo    = tx.balance_after != null ? `\nSolde après : ${tx.balance_after.toLocaleString('fr-FR')} coins` : '';

    Alert.alert(
      label,
      `${tx.description}\n\n` +
      `Montant : ${isCredit ? '+' : '-'}${absAmt.toLocaleString('fr-FR')} coins (${isCredit ? '+' : '-'}${eurAmt} EUR)\n` +
      `Statut : ${statusStr}\n` +
      `Date : ${formatDate(tx.created_at)}` +
      balInfo,
      [{ text: 'Fermer' }],
    );
  };

  // ── Render transaction item ──────────────────────────────────────────────
  const renderTx = (tx: Transaction) => {
    const icon     = txIcon(tx.transaction_type);
    const isCredit = tx.coins_amount > 0;
    const absAmt   = Math.abs(tx.coins_amount);
    const sign     = isCredit ? '+' : '-';
    const amtColor = isCredit ? colors.success : colors.error;

    return (
      <TouchableOpacity key={tx.id} style={s.txRow} activeOpacity={0.7} onPress={() => openReceipt(tx)}>
        <View style={[s.txIconBox, { backgroundColor: `${icon.color}22` }]}>
          {icon.lib === 'mci' ? (
            <MaterialCommunityIcons name={icon.name} size={20} color={icon.color} />
          ) : (
            <Icon name={icon.name} size={20} color={icon.color} />
          )}
        </View>
        <View style={s.txInfo}>
          <Text style={s.txDesc} numberOfLines={1}>{tx.description || txLabel(tx.transaction_type)}</Text>
          <Text style={s.txDate}>{formatDate(tx.created_at)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.txAmount, { color: amtColor }]}>
            {sign}{absAmt.toLocaleString('fr-FR')} <Text style={s.txAmountSub}>coins</Text>
          </Text>
          {tx.status === 'pending' && (
            <Text style={[s.txStatus, { color: colors.warning }]}>En attente</Text>
          )}
          {tx.status === 'failed' && (
            <Text style={[s.txStatus, { color: colors.error }]}>Echoué</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={s.header}>
          <Text style={s.headerTitle}>Mon Portefeuille</Text>
        </View>
        <WalletSkeleton />
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error && !balance) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Icon name="wifi-off" size={48} color={colors.textSecondary} />
        <Text style={[s.emptyTitle, { marginTop: 16 }]}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}>
          <Text style={s.retryText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Mon Portefeuille</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Withdraw')}>
          <Icon name="clock" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={s.scroll}
      >
        {/* Balance card */}
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.balanceCard}
        >
          <Text style={s.balanceLabel}>Solde total</Text>
          <Text style={s.balanceAmount}>{displayCoins.toLocaleString('fr-FR')}</Text>
          <Text style={s.balanceSub}>coins</Text>
          <View style={s.eurRow}>
            <MaterialCommunityIcons name="currency-eur" size={14} color="rgba(255,255,255,0.75)" />
            <Text style={s.eurText}>{coinsToEur(balance?.coins_balance ?? 0)} EUR</Text>
          </View>
        </LinearGradient>

        {/* Quick actions */}
        <View style={s.actionsRow}>
          {[
            { icon: 'shopping-cart', label: 'Acheter',   color: '#3B82F6', screen: 'BuyCoins' },
            { icon: 'send',          label: 'Transférer', color: '#7B3FF2', screen: 'Transfer' },
            { icon: 'bar-chart-2',   label: 'Créateur',  color: '#E85DAD', screen: 'CreatorDashboard' },
            { icon: 'arrow-up-right',label: 'Retirer',   color: '#3FEDB6', screen: 'Withdraw' },
          ].map(a => (
            <TouchableOpacity
              key={a.screen}
              style={s.actionBtn}
              onPress={() => navigation.navigate(a.screen)}
            >
              <View style={[s.actionIcon, { backgroundColor: `${a.color}22` }]}>
                <Icon name={a.icon} size={22} color={a.color} />
              </View>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: 'Gagné',   value: balance?.coins_earned ?? 0,   color: colors.success },
            { label: 'Dépensé', value: balance?.coins_spent ?? 0,    color: colors.error },
            { label: 'Attente', value: balance?.pending_withdrawal ?? 0, color: colors.warning },
          ].map(stat => (
            <View key={stat.label} style={s.statCard}>
              <Text style={[s.statValue, { color: stat.color }]}>{stat.value.toLocaleString('fr-FR')}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Transactions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Transactions récentes</Text>

          {transactions.length === 0 ? (
            <View style={[s.emptyState, { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 24 }]}>
              <MaterialCommunityIcons name="wallet-outline" size={48} color="#7B3FF2" />
              <Text style={s.emptyTitle}>Aucune transaction pour l'instant</Text>
              <Text style={s.emptySubtitle}>Achete des coins, envoie un cadeau ou rejoins une communaute — tout apparaitra ici.</Text>

              {/* Recap solde */}
              <View style={{ width: '100%', marginTop: 16, gap: 8 }}>
                <View style={[s.receiptRow, { borderColor: colors.border }]}>
                  <Text style={[s.receiptLabel, { color: colors.textSecondary }]}>Solde actuel</Text>
                  <Text style={[s.receiptValue, { color: '#7B3FF2' }]}>{(balance?.coins_balance ?? 0).toLocaleString('fr-FR')} coins</Text>
                </View>
                <View style={[s.receiptRow, { borderColor: colors.border }]}>
                  <Text style={[s.receiptLabel, { color: colors.textSecondary }]}>Equivalent EUR</Text>
                  <Text style={[s.receiptValue, { color: colors.textPrimary }]}>{coinsToEur(balance?.coins_balance ?? 0)} EUR</Text>
                </View>
                <View style={[s.receiptRow, { borderColor: colors.border }]}>
                  <Text style={[s.receiptLabel, { color: colors.textSecondary }]}>Taux de conversion</Text>
                  <Text style={[s.receiptValue, { color: colors.textPrimary }]}>100 coins = 0,50 EUR</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => navigation.navigate('BuyCoins')}
                style={{ marginTop: 16, backgroundColor: '#7B3FF2', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20 }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Acheter des coins</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={s.txList}>
                {transactions.map(renderTx)}
              </View>
              {txHasMore && (
                <TouchableOpacity
                  onPress={loadMoreTx}
                  disabled={txLoadingMore}
                  style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}
                  activeOpacity={0.7}
                >
                  {txLoadingMore
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>Voir plus</Text>
                  }
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  balanceCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#7B3FF2',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  balanceLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
    letterSpacing: -1,
  },
  balanceSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    marginTop: -4,
  },
  eurRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  eurText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  txList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  txIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  txDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  txAmountSub: {
    fontSize: 11,
    fontWeight: '400',
  },
  txStatus: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  receiptRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  receiptLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export default WalletScreen;
