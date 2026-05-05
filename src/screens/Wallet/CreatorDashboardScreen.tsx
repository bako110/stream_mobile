/**
 * CreatorDashboardScreen — Tableau de bord monétisation créateur
 * - Toggle monétisation (PATCH /wallet/creator/profile)
 * - Stats: vues, cadeaux, coins, revenus ce mois
 * - Top Reels avec coins gagnés
 * - Prix abonnement
 * - Section retrait
 * - Cadeaux reçus récents
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

// ── Types ──────────────────────────────────────────────────────────────────
interface CreatorProfile {
  monetization_enabled: boolean;
  subscription_price_eur: number;
  payout_method: 'stripe' | 'mobile_money' | null;
}

interface CreatorStats {
  total_views: number;
  total_gifts_received: number;
  total_coins_earned: number;
  coins_earned: number;
  monthly_earnings_coins: number;
  monthly_earnings_eur: number;
  current_balance: number;
  available_balance: number;
}

interface TopReel {
  id: string;
  thumbnail_url?: string;
  caption?: string;
  views_count: number;
  gifts_count: number;
  coins_earned: number;
}

interface GiftReceived {
  id: string;
  sender_name: string;
  sender_avatar?: string;
  gift_emoji: string;
  gift_name: string;
  coins: number;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const coinsToEur = (coins: number | string) => ((parseFloat(String(coins ?? 0)) / 100) * 0.5).toFixed(2);
const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

// ── Stat card ──────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  icon: string;
  iconLib?: 'feather' | 'mci';
  label: string;
  value: string;
  sub?: string;
  color: string;
  colors: any;
}> = ({ icon, iconLib = 'feather', label, value, sub, color, colors }) => {
  const s = statStyles(colors);
  return (
    <View style={[s.card, { borderTopColor: color, borderTopWidth: 3 }]}>
      <View style={[s.iconBox, { backgroundColor: `${color}22` }]}>
        {iconLib === 'mci'
          ? <MaterialCommunityIcons name={icon} size={20} color={color} />
          : <Icon name={icon} size={20} color={color} />
        }
      </View>
      <Text style={s.value}>{value}</Text>
      {sub && <Text style={s.sub}>{sub}</Text>}
      <Text style={s.label}>{label}</Text>
    </View>
  );
};

const statStyles = (colors: any) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
    minWidth: (170),
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F0EFF8',
  },
  sub: {
    fontSize: 11,
    color: '#A09DC0',
  },
  label: {
    fontSize: 11,
    color: '#6B698A',
    fontWeight: '500',
    marginTop: 2,
  },
});

// ── Main ───────────────────────────────────────────────────────────────────
const CreatorDashboardScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>();

  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [profile, setProfile]         = useState<CreatorProfile | null>(null);
  const [stats, setStats]             = useState<CreatorStats | null>(null);
  const [topReels, setTopReels]       = useState<TopReel[]>([]);
  const [recentGifts, setRecentGifts] = useState<GiftReceived[]>([]);
  const [toggling, setToggling]       = useState(false);
  const [subPrice, setSubPrice]       = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [profRes, statsRes, reelsRes, giftsRes] = await Promise.allSettled([
        apiClient.get<CreatorProfile>(Endpoints.wallet.creatorProfile),
        apiClient.get<CreatorStats>(Endpoints.wallet.creatorStats),
        apiClient.get<TopReel[]>(Endpoints.wallet.creatorReels),
        apiClient.get<GiftReceived[]>(Endpoints.wallet.creatorGifts),
      ]);

      if (profRes.status === 'fulfilled') {
        setProfile(profRes.value.data);
        setSubPrice(String(profRes.value.data.subscription_price_eur ?? ''));
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (reelsRes.status === 'fulfilled') setTopReels(reelsRes.value.data ?? []);
      if (giftsRes.status === 'fulfilled') setRecentGifts(giftsRes.value.data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const toggleMonetization = async (value: boolean) => {
    setToggling(true);
    try {
      await apiClient.patch(Endpoints.wallet.creatorProfile, { monetization_enabled: value });
      setProfile(prev => prev ? { ...prev, monetization_enabled: value } : null);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Mise à jour échouée');
    } finally {
      setToggling(false);
    }
  };

  const saveSubPrice = async () => {
    const price = parseFloat(subPrice);
    if (isNaN(price) || price < 0) {
      Alert.alert('Erreur', 'Prix invalide');
      return;
    }
    setSavingPrice(true);
    try {
      await apiClient.patch(Endpoints.wallet.creatorProfile, { subscription_price_eur: price });
      Alert.alert('Succès', 'Prix d\'abonnement mis à jour');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Mise à jour échouée');
    } finally {
      setSavingPrice(false);
    }
  };

  const s = styles(colors);

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Monétisation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={s.scroll}
      >
        {/* Enable monetization */}
        <View style={s.card}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LinearGradient colors={['#9B65F5', '#E85DAD']} style={s.monoIcon}>
                <MaterialCommunityIcons name="currency-eur" size={18} color="#FFF" />
              </LinearGradient>
              <Text style={s.cardTitle}>Monétisation</Text>
            </View>
            <Text style={s.cardSubtitle}>
              {profile?.monetization_enabled
                ? 'Active — vous recevez des revenus'
                : 'Activez pour recevoir des cadeaux et abonnements'}
            </Text>
          </View>
          {toggling
            ? <ActivityIndicator size="small" color={colors.primary} />
            : (
              <Switch
                value={profile?.monetization_enabled ?? false}
                onValueChange={toggleMonetization}
                trackColor={{ false: colors.border, true: `${colors.primary}88` }}
                thumbColor={profile?.monetization_enabled ? colors.primary : colors.textTertiary}
              />
            )
          }
        </View>

        {/* Stats 2x2 grid */}
        {stats && (
          <>
            <Text style={s.sectionTitle}>Statistiques</Text>
            <View style={s.statsGrid}>
              <StatCard
                icon="eye" label="Vues totales"
                value={fmtNum(stats.total_views ?? 0)}
                color="#3B82F6" colors={colors}
              />
              <StatCard
                icon="gift" label="Cadeaux reçus"
                value={fmtNum(stats.total_gifts_received ?? 0)}
                color="#E85DAD" colors={colors}
              />
              <StatCard
                icon="bitcoin" iconLib="mci" label="Coins gagnés"
                value={fmtNum(stats.coins_earned)}
                sub={`≈ ${coinsToEur(stats.coins_earned)} €`}
                color="#FFD700" colors={colors}
              />
              <StatCard
                icon="trending-up" label="Ce mois"
                value={`${parseFloat(String(stats.monthly_earnings_eur ?? 0)).toFixed(2)} €`}
                color="#3FEDB6" colors={colors}
              />
            </View>
          </>
        )}

        {/* Top reels */}
        <Text style={s.sectionTitle}>Top Reels</Text>
        {topReels.length === 0 ? (
          <View style={s.emptyBox}>
            <Icon name="video" size={36} color={colors.textSecondary} />
            <Text style={s.emptyText}>Aucun reel monétisé pour l'instant</Text>
          </View>
        ) : (
          <View style={s.cardList}>
            {topReels.map((reel, i) => (
              <View key={reel.id} style={[s.reelRow, i === topReels.length - 1 && { borderBottomWidth: 0 }]}>
                {reel.thumbnail_url ? (
                  <Image source={{ uri: reel.thumbnail_url }} style={s.reelThumb} />
                ) : (
                  <View style={[s.reelThumb, { backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name="video" size={20} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.reelCaption} numberOfLines={1}>
                    {reel.caption ?? `Reel #${i + 1}`}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={s.reelStat}>
                      <Icon name="eye" size={12} color={colors.textSecondary} />
                      <Text style={s.reelStatText}>{fmtNum(reel.views_count)}</Text>
                    </View>
                    <View style={s.reelStat}>
                      <Icon name="gift" size={12} color={colors.textSecondary} />
                      <Text style={s.reelStatText}>{reel.gifts_count}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={s.reelCoins}>{reel.coins_earned}</Text>
                  <Text style={s.reelCoinsLabel}>coins</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Subscription price */}
        <Text style={s.sectionTitle}>Prix d'abonnement</Text>
        <View style={s.card}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardSubtitle}>Abonnement mensuel (EUR)</Text>
            <View style={s.priceInputRow}>
              <View style={s.priceInput}>
                <Text style={s.eurSymbol}>€</Text>
                <TextInput
                  value={subPrice}
                  onChangeText={setSubPrice}
                  keyboardType="decimal-pad"
                  placeholder="4.99"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.priceInputText, { color: colors.textPrimary }]}
                />
              </View>
              <TouchableOpacity
                onPress={saveSubPrice}
                disabled={savingPrice}
                style={s.savePriceBtn}
              >
                {savingPrice
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={s.savePriceBtnText}>Enregistrer</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Withdrawal section */}
        <Text style={s.sectionTitle}>Revenus disponibles</Text>
        <View style={s.withdrawCard}>
          <View style={s.withdrawBalance}>
            <Text style={s.withdrawCoins}>
              {(stats?.available_balance ?? 0).toLocaleString('fr-FR')}
            </Text>
            <Text style={s.withdrawCoinsLabel}>coins disponibles</Text>
            <Text style={s.withdrawEur}>
              ≈ {coinsToEur(stats?.available_balance ?? 0)} EUR
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Withdraw')}
            disabled={(stats?.available_balance ?? 0) < 1000}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={(stats?.available_balance ?? 0) >= 1000 ? ['#9B65F5', '#E85DAD'] : [colors.border, colors.border]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.withdrawBtn}
            >
              <Icon name="arrow-up-right" size={18} color={
                (stats?.available_balance ?? 0) >= 1000 ? '#FFF' : colors.textTertiary
              } />
              <Text style={[s.withdrawBtnText, {
                color: (stats?.available_balance ?? 0) >= 1000 ? '#FFF' : colors.textTertiary,
              }]}>
                Retirer
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          {(stats?.available_balance ?? 0) < 1000 && (
            <Text style={s.withdrawMin}>
              Minimum 1 000 coins ({coinsToEur(1000)} €) requis
            </Text>
          )}
        </View>

        {/* Payout method */}
        <Text style={s.sectionTitle}>Méthode de paiement</Text>
        <View style={s.payoutRow}>
          {[
            { key: 'stripe', label: 'Stripe', icon: 'credit-card', color: '#635BFF' },
            { key: 'mobile_money', label: 'Mobile Money', icon: 'smartphone', color: '#FF7A2F' },
          ].map(m => (
            <TouchableOpacity
              key={m.key}
              style={[
                s.payoutOption,
                profile?.payout_method === m.key && { borderColor: m.color, backgroundColor: `${m.color}11` },
              ]}
              onPress={async () => {
                try {
                  await apiClient.patch(Endpoints.wallet.creatorProfile, { payout_method: m.key });
                  setProfile(prev => prev ? { ...prev, payout_method: m.key as any } : null);
                } catch {}
              }}
            >
              <Icon name={m.icon} size={20} color={profile?.payout_method === m.key ? m.color : colors.textSecondary} />
              <Text style={[s.payoutLabel, profile?.payout_method === m.key && { color: m.color }]}>
                {m.label}
              </Text>
              {profile?.payout_method === m.key && (
                <View style={[s.payoutCheck, { backgroundColor: m.color }]}>
                  <Icon name="check" size={10} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent gifts received */}
        <Text style={s.sectionTitle}>Cadeaux reçus récemment</Text>
        {recentGifts.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 32 }}>🎁</Text>
            <Text style={s.emptyText}>Aucun cadeau reçu pour l'instant</Text>
          </View>
        ) : (
          <View style={s.cardList}>
            {recentGifts.map((g, i) => (
              <View key={g.id} style={[s.giftRow, i === recentGifts.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={s.giftEmoji}>{g.gift_emoji}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.giftSender}>{g.sender_name}</Text>
                  <Text style={s.giftName}>{g.gift_name} • {formatDate(g.created_at)}</Text>
                </View>
                <Text style={s.giftCoins}>+{g.coins}</Text>
              </View>
            ))}
          </View>
        )}
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
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  monoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cardList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  reelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  reelThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  reelCaption: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  reelStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  reelStatText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  reelCoins: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  reelCoinsLabel: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  priceInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
    gap: 4,
  },
  eurSymbol: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  priceInputText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  savePriceBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePriceBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  withdrawCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
    alignItems: 'center',
  },
  withdrawBalance: {
    alignItems: 'center',
    gap: 2,
  },
  withdrawCoins: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  withdrawCoinsLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  withdrawEur: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  withdrawBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  withdrawMin: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  payoutRow: {
    flexDirection: 'row',
    gap: 12,
  },
  payoutOption: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    position: 'relative',
  },
  payoutLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  payoutCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  giftEmoji: {
    fontSize: 28,
    width: 36,
    textAlign: 'center',
  },
  giftSender: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  giftName: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  giftCoins: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.success,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});

export default CreatorDashboardScreen;
