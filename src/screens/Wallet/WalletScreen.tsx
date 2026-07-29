/**
 * WalletScreen — Portefeuille principal
 * - Balance GoGold animée
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
  StatusBar,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const IS_SMALL = SCREEN_W < 380;
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useWsEvents } from '../../hooks/useWsEvents';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { BackButton, PriceWithLocal } from '../../components/common';
import { showConfirm } from '../../services';

// ── Types ──────────────────────────────────────────────────────────────────
interface WalletBalance {
  gogold_balance: number;
  gogold_earned: number;
  gogold_spent: number;
  total_earned: number;
  total_spent: number;
  pending_withdrawal: number;
}

interface Transaction {
  id:               string;
  public_id?:       string;
  transaction_type: string;
  gogold_amount:     number;
  eur_amount?:      number;
  description:      string;
  created_at:       string;
  status:           'completed' | 'pending' | 'failed';
  balance_after?:   number;
  reference_type?:  string;
  extra_data?:      Record<string, any>;
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Taux retrait : 100 GoGold = 0.35 € (aligné avec COINS_TO_EUR_RATE backend)
const goGoldToEur = (GoGold: number) => ((GoGold / 100) * 0.35).toFixed(2);

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
    case 'credit_purchase':      return 'Achat de GoGold';
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
      {[1, 2, 3].map(i => <SkeletonBox key={`act-${i}`} w="30%" h={80} br={16} />)}
    </View>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {[1, 2, 3].map(i => <SkeletonBox key={`stat-${i}`} w="30%" h={70} br={12} />)}
    </View>
    {[1, 2, 3, 4, 5].map(i => (
      <View key={`tx-${i}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
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

// ── TxList sub-component ──────────────────────────────────────────────────
const TxList: React.FC<{
  transactions: Transaction[];
  txFilter: Transaction['transaction_type'] | 'all';
  txHasMore: boolean;
  txLoadingMore: boolean;
  onLoadMore: () => void;
  onBuyGoGold: () => void;
  balance: WalletBalance | null;
  colors: any;
  renderTx: (tx: Transaction) => React.ReactNode;
}> = ({ transactions, txFilter, txHasMore, txLoadingMore, onLoadMore, onBuyGoGold, balance, colors, renderTx }) => {
  const filtered = transactions.filter(tx => txFilter === 'all' || tx.transaction_type === txFilter);

  if (filtered.length === 0) {
    return (
      <View style={[{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center', gap: 8 }]}>
        <MaterialCommunityIcons name="wallet-outline" size={48} color="#7B3FF2" />
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
          {txFilter === 'all' ? 'Aucune transaction pour l\'instant' : 'Aucune transaction dans cette catégorie'}
        </Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>
          {txFilter === 'all' ? 'Achete des GoGold, envoie un cadeau ou rejoins une communaute — tout apparaitra ici.' : 'Essayez un autre filtre.'}
        </Text>
        {txFilter === 'all' && (
          <>
            <View style={{ width: '100%', marginTop: 8, gap: 8 }}>
              {[
                { label: 'Solde actuel',        value: `${(balance?.gogold_balance ?? 0).toLocaleString('fr-FR')} GoGold` as React.ReactNode, color: '#7B3FF2' },
                { label: 'Equivalent EUR',       value: <PriceWithLocal amountEur={((balance?.gogold_balance ?? 0) / 100) * 0.35} style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }} />, color: colors.textPrimary },
                { label: 'Taux de conversion',   value: '100 GoGold = 0,35 EUR' as React.ReactNode, color: colors.textPrimary },
              ].map(row => (
                <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>{row.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: row.color }}>{row.value}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={onBuyGoGold}
              style={{ marginTop: 8, backgroundColor: '#7B3FF2', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20 }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Acheter des GoGold</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <>
      <View style={{ gap: 2 }}>
        {filtered.map(tx => renderTx(tx))}
      </View>
      {txHasMore && txFilter === 'all' && (
        <TouchableOpacity
          onPress={onLoadMore}
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
  );
};

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
  const [isMonetized, setIsMonetized] = useState(false);
  const [txFilter, setTxFilter]     = useState<Transaction['transaction_type'] | 'all'>('all');
  const TX_LIMIT = 10;

  const TX_FILTERS: { key: Transaction['transaction_type'] | 'all'; label: string }[] = [
    { key: 'all',                 label: 'Tout' },
    { key: 'credit_purchase',     label: 'Achats' },
    { key: 'gift_received',       label: 'Cadeaux' },
    { key: 'gift_sent',           label: 'Envois' },
    { key: 'transfer_received',   label: 'Reçus' },
    { key: 'transfer_sent',       label: 'Envoyés' },
    { key: 'withdrawal',          label: 'Retraits' },
    { key: 'boost_purchase',      label: 'Boosts' },
    { key: 'view_revenue',        label: 'Revenus' },
  ];

  // Animated coin count-up
  const animatedGoGold = useRef(new Animated.Value(0)).current;
  const [displayGoGold, setDisplayGoGold] = useState(0);

  const runCountUp = useCallback((target: number) => {
    animatedGoGold.setValue(0);
    Animated.timing(animatedGoGold, {
      toValue: target,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    const id = animatedGoGold.addListener(({ value }) => setDisplayGoGold(Math.floor(value)));
    return () => animatedGoGold.removeListener(id);
  }, [animatedGoGold]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [balRes, txRes, monetRes] = await Promise.all([
        apiClient.get<WalletBalance>(Endpoints.wallet.balance),
        apiClient.get<Transaction[]>(`${Endpoints.wallet.transactions}?limit=${TX_LIMIT}&offset=0`),
        apiClient.get<{ status: string }>(Endpoints.monetization.status).catch(() => ({ data: { status: 'none' } })),
      ]);
      setBalance(balRes.data);
      const txList = txRes.data ?? [];
      setTransactions(txList);
      setTxOffset(TX_LIMIT);
      setTxHasMore(txList.length === TX_LIMIT);
      runCountUp(balRes.data?.gogold_balance ?? 0);
      setIsMonetized(monetRes.data?.status === 'approved');
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

  // Rafraîchissement automatique sur tout événement wallet
  useWsEvents({
    onGoGoldTransferReceived: () => fetchData(),
    onGiftReceived:         () => fetchData(),
    onWalletUpdated:        () => fetchData(),
  });

  const s = styles(colors);

  // ── Ouvre la facture détaillée d'une transaction ────────────────────────
  const openReceipt = (tx: Transaction) => {
    const label     = txLabel(tx.transaction_type as any);
    const isCredit  = tx.gogold_amount > 0;
    const absAmt    = Math.abs(tx.gogold_amount);
    const eurVal    = tx.eur_amount != null
      ? Math.abs(tx.eur_amount).toFixed(2)
      : ((absAmt / 100) * 0.5).toFixed(2);
    const statusStr = tx.status === 'completed' ? 'Confirmée' : tx.status === 'pending' ? 'En attente' : 'Échouée';

    let details = `${tx.description || label}\n\n`;
    details += `Montant : ${isCredit ? '+' : '-'}${absAmt.toLocaleString('fr-FR')} GoGold`;
    if (parseFloat(eurVal) > 0) details += ` (${isCredit ? '+' : '-'}${eurVal} €)`;
    details += `\nStatut : ${statusStr}`;
    details += `\nDate : ${formatDate(tx.created_at)}`;
    if (tx.balance_after != null) details += `\nSolde après : ${tx.balance_after.toLocaleString('fr-FR')} GoGold`;
    if (tx.public_id) details += `\n\nRéf. : ${tx.public_id}`;
    if (tx.reference_type) details += `\nType réf. : ${tx.reference_type}`;

    showConfirm(label, details, [{ text: 'Fermer' }]);
  };

  // ── Render transaction item ──────────────────────────────────────────────
  const renderTx = (tx: Transaction) => {
    const icon     = txIcon(tx.transaction_type);
    const isCredit = tx.gogold_amount > 0;
    const absAmt   = Math.abs(tx.gogold_amount);
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
            {sign}{absAmt.toLocaleString('fr-FR')} <Text style={s.txAmountSub}>GoGold</Text>
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
        <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
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
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[s.headerTitle, { flex: 1, textAlign: 'center' }]}>Mon Portefeuille</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Withdraw')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
          <Text style={s.balanceAmount}>{displayGoGold.toLocaleString('fr-FR')}</Text>
          <Text style={s.balanceSub}>GoGold</Text>
          <View style={s.eurRow}>
            <MaterialCommunityIcons name="currency-eur" size={14} color="rgba(255,255,255,0.75)" />
            <PriceWithLocal
              amountEur={parseFloat(goGoldToEur(balance?.gogold_balance ?? 0))}
              style={s.eurText}
              localStyle={{ color: 'rgba(255,255,255,0.7)' }}
            />
          </View>
        </LinearGradient>

        {/* Quick actions */}
        <View style={s.actionsRow}>
          {[
            { icon: 'shopping-cart', label: 'Acheter',    color: '#3B82F6', screen: 'BuyGoGold',          show: true },
            { icon: 'send',          label: 'Transférer', color: '#7B3FF2', screen: 'Transfer',           show: true },
            { icon: 'bar-chart-2',   label: 'Créateur',   color: '#E85DAD', screen: 'CreatorAnalytics',   show: isMonetized },
            { icon: 'arrow-up-right',label: 'Retirer',    color: '#3FEDB6', screen: 'Withdraw',           show: true },
            { icon: 'gift',          label: 'Parrainage', color: '#F59E0B', screen: 'Referral',           show: true },
            { icon: 'bullhorn',      label: 'Pub',        color: '#EC4899', screen: 'Ads',                show: true, mci: true },
          ].filter(a => a.show).map(a => (
            <TouchableOpacity
              key={a.screen}
              style={s.actionBtn}
              onPress={() => navigation.navigate(a.screen)}
            >
              <View style={[s.actionIcon, { backgroundColor: `${a.color}22` }]}>
                {(a as any).mci
                  ? <MaterialCommunityIcons name={a.icon} size={IS_SMALL ? 18 : 20} color={a.color} />
                  : <Icon name={a.icon} size={IS_SMALL ? 18 : 20} color={a.color} />
                }
              </View>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: 'Gagné',   value: balance?.gogold_earned ?? 0,   color: colors.success },
            { label: 'Dépensé', value: balance?.gogold_spent ?? 0,    color: colors.error },
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

          {/* Filtre par type */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {TX_FILTERS.map(f => {
              const active = txFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setTxFilter(f.key)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.textSecondary }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TxList
            transactions={transactions}
            txFilter={txFilter}
            txHasMore={txHasMore}
            txLoadingMore={txLoadingMore}
            onLoadMore={loadMoreTx}
            onBuyGoGold={() => navigation.navigate('BuyGoGold')}
            balance={balance}
            colors={colors}
            renderTx={renderTx}
          />
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
    paddingHorizontal: IS_SMALL ? 14 : 20,
    paddingTop: IS_SMALL ? 44 : 56,
    paddingBottom: IS_SMALL ? 8 : 12,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: IS_SMALL ? 18 : 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  scroll: {
    paddingHorizontal: IS_SMALL ? 12 : 20,
    paddingBottom: 40,
    gap: IS_SMALL ? 12 : 16,
  },
  balanceCard: {
    borderRadius: 24,
    padding: IS_SMALL ? 20 : 28,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#7B3FF2',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  balanceLabel: {
    fontSize: IS_SMALL ? 11 : 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: IS_SMALL ? 40 : 52,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
    letterSpacing: -1,
  },
  balanceSub: {
    fontSize: IS_SMALL ? 14 : 16,
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
    fontSize: IS_SMALL ? 12 : 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: IS_SMALL ? 8 : 10,
  },
  actionBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: IS_SMALL ? 12 : 16,
    paddingHorizontal: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    width: IS_SMALL
      ? Math.floor((SCREEN_W - 24 - 8 * 2) / 3)
      : Math.floor((SCREEN_W - 40 - 10 * 2) / 3),
  },
  actionIcon: {
    width: IS_SMALL ? 36 : 40,
    height: IS_SMALL ? 36 : 40,
    borderRadius: IS_SMALL ? 18 : 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: IS_SMALL ? 10 : 11,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: IS_SMALL ? 6 : 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: IS_SMALL ? 10 : 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: IS_SMALL ? 15 : 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: IS_SMALL ? 10 : 11,
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
