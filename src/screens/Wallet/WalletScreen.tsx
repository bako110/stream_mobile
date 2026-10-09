/**
 * WalletScreen — Portefeuille principal
 * - Balance GoGold animée
 * - Actions rapides: Acheter, Envoyer cadeau, Retirer
 * - Stats: gagné / dépensé / en attente
 * - Bouton "Voir les transactions" → WalletTransactionsScreen (2026-09 :
 *   la liste complète n'est plus affichée directement ici, pour ne plus
 *   obliger l'utilisateur à la voir en arrivant sur son portefeuille).
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
  Dimensions,
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const IS_SMALL = SCREEN_W < 380;
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useWsEvents } from '../../hooks/useWsEvents';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { BackButton, PriceWithLocal } from '../../components/common';
import { showConfirm } from '../../services';
import { showWithdrawUnavailable } from '../../utils/withdrawAlert';

// ── Types ──────────────────────────────────────────────────────────────────
interface WalletBalance {
  gogold_balance: number;
  gogold_earned: number;
  gogold_spent: number;
  total_earned: number;
  total_spent: number;
  pending_withdrawal: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Taux retrait : 100 GoGold = 0.35 € (aligné avec COINS_TO_EUR_RATE backend)
const goGoldToEur = (GoGold: number) => ((GoGold / 100) * 0.35).toFixed(2);

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

// ── Main ───────────────────────────────────────────────────────────────────
const WalletScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const ACCENT = colors.primary;
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance]       = useState<WalletBalance | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [isMonetized, setIsMonetized] = useState(false);

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
      const [balRes, monetRes] = await Promise.all([
        apiClient.get<WalletBalance>(Endpoints.wallet.balance),
        apiClient.get<{ status: string }>(Endpoints.monetization.status).catch(() => ({ data: { status: 'none' } })),
      ]);
      setBalance(balRes.data);
      runCountUp(balRes.data?.gogold_balance ?? 0);
      setIsMonetized(monetRes.data?.status === 'approved');
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement');
    }
  }, [runCountUp]);

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

  // Status bar : translucide sur Android (le contenu passe dessous), icônes
  // adaptées au thème. Le header réserve `insets.top` pour ne jamais passer
  // sous l'encoche / la barre système.
  const statusBar = (
    <StatusBar
      translucent
      backgroundColor="transparent"
      barStyle={theme.isDark ? 'light-content' : 'dark-content'}
    />
  );
  const headerPadTop = insets.top + (IS_SMALL ? 6 : 10);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.container}>
        {statusBar}
        <View style={{ paddingTop: headerPadTop }}>
          <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={s.headerTitle}>Mon Portefeuille</Text>
          </View>
        </View>
        <WalletSkeleton />
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error && !balance) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        {statusBar}
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
      {statusBar}

      {/* Header */}
      <View style={{ paddingTop: headerPadTop }}>
        <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[s.headerTitle, { flex: 1, textAlign: 'center' }]}>Mon Portefeuille</Text>
          <TouchableOpacity onPress={() => navigation.navigate('SettingsWallet')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="settings" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
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
          style={[s.balanceCard, { shadowColor: colors.primary }]}
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
            { icon: 'shopping-cart', label: 'Acheter',    color: ACCENT, screen: 'BuyGoGold',          show: true },
            { icon: 'send',          label: 'Transférer', color: ACCENT, screen: 'Transfer',           show: true },
            { icon: 'bar-chart-2',   label: 'Créateur',   color: ACCENT, screen: 'CreatorAnalytics',   show: isMonetized },
            { icon: 'arrow-up-right',label: 'Retirer',    color: ACCENT, screen: 'Withdraw',           show: true },
            { icon: 'gift',          label: 'Parrainage', color: ACCENT, screen: 'Referral',           show: true },
            { icon: 'bullhorn',      label: 'Pub',        color: ACCENT, screen: 'Ads',                show: true, mci: true },
          ].filter(a => a.show).map(a => (
            <TouchableOpacity
              key={a.screen}
              style={s.actionBtn}
              onPress={() => (a.screen === 'Withdraw' ? showWithdrawUnavailable() : navigation.navigate(a.screen))}
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
        {/* Transactions (2026-09) : la liste complete n'est plus affichee
            directement ici — un simple bouton ouvre WalletTransactionsScreen,
            qui reprend filtres + pagination + groupement par date. L'utilisateur
            n'est donc plus oblige de voir la liste en arrivant sur son
            portefeuille. */}
        <TouchableOpacity
          style={[s.txLinkBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate('WalletTransactions')}
          activeOpacity={0.8}
        >
          <View style={[s.txLinkIcon, { backgroundColor: `${ACCENT}22` }]}>
            <MaterialCommunityIcons name="format-list-bulleted" size={20} color={ACCENT} />
          </View>
          <Text style={[s.txLinkText, { color: colors.textPrimary }]}>Voir les transactions</Text>
          <Icon name="chevron-right" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
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
    paddingVertical: IS_SMALL ? 8 : 12,
    marginHorizontal: 10,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  headerTitle: {
    fontSize: IS_SMALL ? 18 : 22,
    fontWeight: FontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  scroll: {
    paddingHorizontal: IS_SMALL ? 12 : 20,
    paddingTop: 10,
    paddingBottom: 40,
    gap: IS_SMALL ? 12 : 16,
  },
  balanceCard: {
    borderRadius: 24,
    padding: IS_SMALL ? 20 : 28,
    alignItems: 'center',
    elevation: 8,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  balanceLabel: {
    fontSize: IS_SMALL ? 11 : 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FontWeight.medium,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: IS_SMALL ? 40 : 52,
    fontWeight: FontWeight.extraBold,
    color: '#FFFFFF',
    marginTop: 4,
    letterSpacing: -1,
  },
  balanceSub: {
    fontSize: IS_SMALL ? 14 : 16,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: FontWeight.medium,
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
    fontWeight: FontWeight.semiBold,
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
    fontWeight: FontWeight.semiBold,
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
    fontWeight: FontWeight.bold,
  },
  statLabel: {
    fontSize: IS_SMALL ? 10 : 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: FontWeight.medium,
  },
  txLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  txLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txLinkText: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: FontSize.smPlus,
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
    fontWeight: FontWeight.semiBold,
    fontSize: FontSize.basePlus,
  },
  receiptRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  receiptLabel: {
    fontSize: FontSize.smPlus,
    fontWeight: FontWeight.medium,
  },
  receiptValue: {
    fontSize: FontSize.smPlus,
    fontWeight: FontWeight.bold,
  },
});

export default WalletScreen;
