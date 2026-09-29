/**
 * WalletTransactionsScreen — Historique complet des transactions du wallet.
 *
 * Extrait de WalletScreen (2026-09) : la liste complète (filtres + pagination)
 * n'est plus affichée directement sur l'écran principal du Wallet — l'utilisateur
 * n'est plus obligé de la voir en arrivant sur son portefeuille, elle est
 * désormais accessible via un bouton dédié ("Voir les transactions") qui ouvre
 * cet écran séparé.
 *
 * Groupement par date (2026-09) : au lieu d'une liste plate mélangeant tous les
 * types de transaction à la suite ("en vrac"), les transactions sont regroupées
 * sous des sections "Aujourd'hui" / "Cette semaine" / "Plus ancien" — le filtre
 * par type reste disponible en haut pour affiner à l'intérieur de ces groupes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  StatusBar, ActivityIndicator, Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { BackButton } from '../../components/common';
import { showConfirm } from '../../services';

// ── Types (identiques à WalletScreen) ────────────────────────────────────────
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

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const txIcon = (type: Transaction['transaction_type']) => {
  switch (type) {
    case 'credit_purchase':       return { name: 'shopping-cart',   lib: 'feather' };
    case 'gift_sent':             return { name: 'gift',             lib: 'feather' };
    case 'gift_received':         return { name: 'gift',             lib: 'mci'     };
    case 'withdrawal':            return { name: 'arrow-up-right',   lib: 'feather' };
    case 'bonus':                 return { name: 'star',             lib: 'feather' };
    case 'refund':                return { name: 'rotate-ccw',       lib: 'feather' };
    case 'community_entry':       return { name: 'users',            lib: 'feather' };
    case 'community_reward':      return { name: 'award',            lib: 'feather' };
    case 'transfer_sent':         return { name: 'arrow-up-right',   lib: 'feather' };
    case 'transfer_received':     return { name: 'arrow-down-left',  lib: 'feather' };
    case 'boost_purchase':        return { name: 'zap',              lib: 'feather' };
    case 'view_revenue':          return { name: 'eye',              lib: 'feather' };
    case 'subscription_revenue':  return { name: 'repeat',           lib: 'feather' };
    default:                      return { name: 'circle',           lib: 'feather' };
  }
};

const txLabel = (type: Transaction['transaction_type']): string => {
  switch (type) {
    case 'credit_purchase':      return 'Achat de GoGold';
    case 'gift_sent':            return 'Cadeau envoyé';
    case 'gift_received':        return 'Cadeau reçu';
    case 'withdrawal':           return 'Retrait';
    case 'bonus':                return 'Bonus';
    case 'refund':                return 'Remboursement';
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

const TX_LIMIT = 20;

// ── Groupement par date ───────────────────────────────────────────────────────
// "Aujourd'hui" / "Cette semaine" (7 derniers jours, hors aujourd'hui) /
// "Plus ancien" — répond à la demande "pas en vrac" : plutôt qu'une liste
// chronologique plate, l'utilisateur voit tout de suite le rythme de son
// activité (rien aujourd'hui / plusieurs cette semaine / historique ancien).
function groupByDate(transactions: Transaction[]): { title: string; items: Transaction[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = startOfToday - 7 * 24 * 3600 * 1000;

  const today: Transaction[] = [];
  const thisWeek: Transaction[] = [];
  const older: Transaction[] = [];

  for (const tx of transactions) {
    const t = new Date(tx.created_at).getTime();
    if (t >= startOfToday) today.push(tx);
    else if (t >= sevenDaysAgo) thisWeek.push(tx);
    else older.push(tx);
  }

  const groups: { title: string; items: Transaction[] }[] = [];
  if (today.length)    groups.push({ title: "Aujourd'hui",   items: today });
  if (thisWeek.length) groups.push({ title: 'Cette semaine', items: thisWeek });
  if (older.length)    groups.push({ title: 'Plus ancien',   items: older });
  return groups;
}

// ── Skeleton ───────────────────────────────────────────────────────────────
const SkeletonBox: React.FC<{ w?: number | string; h?: number; br?: number }> = ({ w = '100%', h = 16, br = 8 }) => {
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
  return <Animated.View style={{ width: w as any, height: h, borderRadius: br, backgroundColor: '#2A2840', opacity: anim }} />;
};

const WalletTransactionsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const ACCENT = colors.primary;
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const s = styles(colors);

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [txOffset, setTxOffset]     = useState(0);
  const [txHasMore, setTxHasMore]   = useState(false);
  const [txLoadingMore, setTxLoadingMore] = useState(false);
  const [txFilter, setTxFilter]     = useState<Transaction['transaction_type'] | 'all'>('all');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await apiClient.get<Transaction[]>(`${Endpoints.wallet.transactions}?limit=${TX_LIMIT}&offset=0`);
      const txList = res.data ?? [];
      setTransactions(txList);
      setTxOffset(TX_LIMIT);
      setTxHasMore(txList.length === TX_LIMIT);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement');
    }
  }, []);

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

  const renderTx = (tx: Transaction) => {
    const icon     = txIcon(tx.transaction_type);
    const isCredit = tx.gogold_amount > 0;
    const absAmt   = Math.abs(tx.gogold_amount);
    const sign     = isCredit ? '+' : '-';
    const amtColor = isCredit ? colors.success : colors.error;

    return (
      <TouchableOpacity key={tx.id} style={s.txRow} activeOpacity={0.7} onPress={() => openReceipt(tx)}>
        <View style={[s.txIconBox, { backgroundColor: `${ACCENT}22` }]}>
          {icon.lib === 'mci' ? (
            <MaterialCommunityIcons name={icon.name} size={20} color={ACCENT} />
          ) : (
            <Icon name={icon.name} size={20} color={ACCENT} />
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
          {tx.status === 'pending' && <Text style={[s.txStatus, { color: colors.warning }]}>En attente</Text>}
          {tx.status === 'failed'  && <Text style={[s.txStatus, { color: colors.error }]}>Echoué</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const filtered = transactions.filter(tx => txFilter === 'all' || tx.transaction_type === txFilter);
  const groups = groupByDate(filtered);

  const statusBar = (
    <StatusBar translucent backgroundColor="transparent" barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
  );

  return (
    <View style={s.container}>
      {statusBar}

      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[s.headerTitle, { flex: 1, textAlign: 'center' }]}>Transactions</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filtre par type */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
        style={{ flexGrow: 0 }}
      >
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
              <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: active ? '#fff' : colors.textSecondary }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={{ padding: 20, gap: 16 }}>
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
      ) : error && transactions.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Icon name="wifi-off" size={48} color={colors.textSecondary} />
          <Text style={[s.emptyTitle, { marginTop: 16 }]}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}>
            <Text style={s.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 20 }}
        >
          {groups.length === 0 ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center', gap: 8, marginTop: 12 }}>
              <MaterialCommunityIcons name="wallet-outline" size={48} color={colors.primary} />
              <Text style={{ fontSize: FontSize.basePlus, fontWeight: FontWeight.bold, color: colors.textPrimary, textAlign: 'center' }}>
                {txFilter === 'all' ? "Aucune transaction pour l'instant" : 'Aucune transaction dans cette catégorie'}
              </Text>
              <Text style={{ fontSize: FontSize.smPlus, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>
                {txFilter === 'all' ? 'Achete des GoGold, envoie un cadeau ou rejoins une communaute — tout apparaitra ici.' : 'Essayez un autre filtre.'}
              </Text>
            </View>
          ) : (
            groups.map(group => (
              <View key={group.title} style={{ gap: 8 }}>
                <Text style={s.groupTitle}>{group.title}</Text>
                <View style={{ gap: 2 }}>
                  {group.items.map(tx => renderTx(tx))}
                </View>
              </View>
            ))
          )}

          {txHasMore && txFilter === 'all' && (
            <TouchableOpacity
              onPress={loadMoreTx}
              disabled={txLoadingMore}
              style={{ alignItems: 'center', paddingVertical: 14 }}
              activeOpacity={0.7}
            >
              {txLoadingMore
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.primary }}>Voir plus</Text>
              }
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: FontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  groupTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.extraBold,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  txInfo: { flex: 1, gap: 2 },
  txDesc: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: colors.textPrimary,
  },
  txDate: {
    fontSize: FontSize.sm,
    color: colors.textSecondary,
  },
  txAmount: {
    fontSize: FontSize.basePlus,
    fontWeight: FontWeight.bold,
  },
  txAmountSub: {
    fontSize: FontSize.xsPlus,
    fontWeight: FontWeight.regular,
  },
  txStatus: {
    fontSize: FontSize.xsPlus,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: colors.textPrimary,
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
    fontWeight: FontWeight.semiBold,
    fontSize: FontSize.basePlus,
  },
});

export default WalletTransactionsScreen;
