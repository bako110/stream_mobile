/**
 * WithdrawScreen — Demande de retrait
 * - Balance coins + EUR
 * - Slider + input coins
 * - EUR auto-calculé
 * - Méthode: Stripe ou Mobile Money
 * - Historique des retraits avec badges de statut
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

const { width: SCREEN_W } = Dimensions.get('window');
const SLIDER_W = SCREEN_W - 40 - 32; // padding + card padding
const MIN_COINS = 1000;

// ── Types ──────────────────────────────────────────────────────────────────
type PayoutMethod = 'stripe' | 'mobile_money';
type WithdrawalStatus = 'pending' | 'completed' | 'rejected';

interface WalletBalance {
  coins: number;
}

interface Withdrawal {
  id: string;
  amount_coins: number;
  amount_eur: number;
  payout_method: PayoutMethod;
  status: WithdrawalStatus;
  created_at: string;
  processed_at?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const coinsToEur = (coins: number) => ((coins / 100) * 0.5).toFixed(2);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const statusConfig: Record<WithdrawalStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'En attente',  color: '#FF8C4A', bg: '#FF8C4A22' },
  completed: { label: 'Complété',    color: '#3FEDB6', bg: '#3FEDB622' },
  rejected:  { label: 'Rejeté',      color: '#F25270', bg: '#F2527022' },
};

// ── Slider component ───────────────────────────────────────────────────────
const CoinSlider: React.FC<{
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  colors: any;
}> = ({ value, min, max, onChange, colors }) => {
  const pct = max > min ? (value - min) / (max - min) : 0;
  const thumbX = useRef(new Animated.Value(pct * SLIDER_W)).current;
  const isDragging = useRef(false);

  const handlePress = useCallback((e: any) => {
    const x = Math.max(0, Math.min(e.nativeEvent.locationX, SLIDER_W));
    const newPct = x / SLIDER_W;
    const newVal = Math.round(min + newPct * (max - min));
    const snapped = Math.max(min, Math.min(max, newVal));
    thumbX.setValue(x);
    onChange(snapped);
  }, [min, max, onChange, thumbX]);

  const fillW = `${pct * 100}%`;

  return (
    <View style={{ paddingVertical: 12 }}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={handlePress}
        style={{ height: 32, justifyContent: 'center' }}
      >
        {/* Track */}
        <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, width: SLIDER_W }}>
          {/* Fill */}
          <LinearGradient
            colors={['#9B65F5', '#E85DAD']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 6, borderRadius: 3, width: fillW as any }}
          />
        </View>
        {/* Thumb */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: pct * SLIDER_W - 12,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: '#9B65F5',
              borderWidth: 3,
              borderColor: '#FFF',
              elevation: 4,
              shadowColor: '#9B65F5',
              shadowOpacity: 0.4,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
            },
          ]}
        />
      </TouchableOpacity>
      {/* Labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>{min.toLocaleString('fr-FR')}</Text>
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>{max.toLocaleString('fr-FR')}</Text>
      </View>
    </View>
  );
};

// ── Main ───────────────────────────────────────────────────────────────────
const WithdrawScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance]       = useState(0);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [amount, setAmount]         = useState(MIN_COINS);
  const [amountText, setAmountText] = useState(String(MIN_COINS));
  const [method, setMethod]         = useState<PayoutMethod>('stripe');
  const [phone, setPhone]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [balRes, wdRes] = await Promise.allSettled([
        apiClient.get<WalletBalance>(Endpoints.wallet.balance),
        apiClient.get<Withdrawal[]>(Endpoints.wallet.withdrawals),
      ]);
      if (balRes.status === 'fulfilled') {
        const bal = balRes.value.data.coins;
        setBalance(bal);
        const initAmount = Math.max(MIN_COINS, Math.min(MIN_COINS, bal));
        setAmount(initAmount);
        setAmountText(String(initAmount));
      }
      if (wdRes.status === 'fulfilled') setWithdrawals(wdRes.value.data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleAmountInput = (text: string) => {
    setAmountText(text);
    const val = parseInt(text, 10);
    if (!isNaN(val)) setAmount(Math.max(0, Math.min(val, balance)));
  };

  const handleSlider = (val: number) => {
    setAmount(val);
    setAmountText(String(val));
  };

  const canWithdraw = amount >= MIN_COINS && amount <= balance;

  const handleSubmit = () => {
    if (!canWithdraw) return;
    if (method === 'mobile_money' && !phone.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir un numéro de téléphone');
      return;
    }

    Alert.alert(
      'Confirmer le retrait',
      `Retirer ${amount.toLocaleString('fr-FR')} coins (${coinsToEur(amount)} €) via ${method === 'stripe' ? 'Stripe' : 'Mobile Money'}?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setSubmitting(true);
            try {
              await apiClient.post(Endpoints.wallet.withdraw, {
                amount_coins: amount,
                payout_method: method,
                ...(method === 'mobile_money' && { phone }),
              });
              setBalance(prev => prev - amount);
              setWithdrawals(prev => [{
                id: `tmp_${Date.now()}`,
                amount_coins: amount,
                amount_eur: parseFloat(coinsToEur(amount)),
                payout_method: method,
                status: 'pending',
                created_at: new Date().toISOString(),
              }, ...prev]);
              setAmount(MIN_COINS);
              setAmountText(String(MIN_COINS));
              Alert.alert('Succès', 'Votre demande de retrait a été soumise. Traitement sous 2-5 jours ouvrés.');
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Retrait échoué');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const s = styles(colors);

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Retirer des fonds</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.scroll}
        >
          {/* Balance */}
          <LinearGradient
            colors={['#9B65F5', '#E85DAD']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.balanceCard}
          >
            <Text style={s.balLabel}>Solde disponible</Text>
            <Text style={s.balAmount}>{balance.toLocaleString('fr-FR')}</Text>
            <Text style={s.balSub}>coins · {coinsToEur(balance)} EUR</Text>
          </LinearGradient>

          {/* Info banner */}
          <View style={s.infoBanner}>
            <Icon name="info" size={14} color={colors.info} />
            <Text style={s.infoBannerText}>
              Minimum <Text style={{ fontWeight: '700', color: colors.textPrimary }}>1 000 coins</Text> = <Text style={{ fontWeight: '700', color: colors.textPrimary }}>5,00 €</Text>. Traitement sous 2-5 jours ouvrés.
            </Text>
          </View>

          {/* Amount section */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Montant à retirer</Text>

            <View style={s.amountCard}>
              {/* Input + EUR */}
              <View style={s.amountRow}>
                <View style={s.amountInput}>
                  <MaterialCommunityIcons name="bitcoin" size={20} color="#FFD700" />
                  <TextInput
                    value={amountText}
                    onChangeText={handleAmountInput}
                    keyboardType="number-pad"
                    style={[s.amountInputText, { color: colors.textPrimary }]}
                    placeholder="1000"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={s.amountUnit}>coins</Text>
                </View>
                <Icon name="arrow-right" size={16} color={colors.textTertiary} />
                <View style={s.eurDisplay}>
                  <Text style={s.eurAmount}>{coinsToEur(amount)}</Text>
                  <Text style={s.eurLabel}>EUR</Text>
                </View>
              </View>

              {/* Slider */}
              <CoinSlider
                value={amount}
                min={MIN_COINS}
                max={Math.max(MIN_COINS, balance)}
                onChange={handleSlider}
                colors={colors}
              />

              {/* Validation feedback */}
              {amount > 0 && amount < MIN_COINS && (
                <Text style={[s.validationMsg, { color: colors.error }]}>
                  Minimum {MIN_COINS.toLocaleString('fr-FR')} coins requis
                </Text>
              )}
              {amount > balance && (
                <Text style={[s.validationMsg, { color: colors.error }]}>
                  Solde insuffisant
                </Text>
              )}
            </View>
          </View>

          {/* Payout method */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Méthode de paiement</Text>

            <View style={s.methodRow}>
              {([
                { key: 'stripe' as PayoutMethod,       label: 'Stripe',       icon: 'credit-card', color: '#635BFF' },
                { key: 'mobile_money' as PayoutMethod,  label: 'Mobile Money', icon: 'smartphone',  color: '#FF7A2F' },
              ]).map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[
                    s.methodOption,
                    method === m.key && { borderColor: m.color, backgroundColor: `${m.color}11` },
                  ]}
                  onPress={() => setMethod(m.key)}
                >
                  <Icon name={m.icon} size={22} color={method === m.key ? m.color : colors.textSecondary} />
                  <Text style={[s.methodLabel, method === m.key && { color: m.color }]}>{m.label}</Text>
                  {method === m.key && (
                    <View style={[s.methodCheck, { backgroundColor: m.color }]}>
                      <Icon name="check" size={10} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Mobile Money phone input */}
            {method === 'mobile_money' && (
              <View style={s.phoneInput}>
                <Icon name="phone" size={18} color={colors.textSecondary} />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="+221 77 000 00 00"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.phoneInputText, { color: colors.textPrimary }]}
                />
              </View>
            )}
          </View>

          {/* Submit button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canWithdraw || submitting}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={canWithdraw ? ['#9B65F5', '#E85DAD'] : [colors.border, colors.border]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.submitBtn}
            >
              {submitting
                ? <ActivityIndicator color="#FFF" />
                : (
                  <>
                    <Icon name="arrow-up-circle" size={20} color={canWithdraw ? '#FFF' : colors.textTertiary} />
                    <Text style={[s.submitText, { color: canWithdraw ? '#FFF' : colors.textTertiary }]}>
                      Retirer {canWithdraw ? `${coinsToEur(amount)} €` : ''}
                    </Text>
                  </>
                )
              }
            </LinearGradient>
          </TouchableOpacity>

          {/* Withdrawal history */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Historique des retraits</Text>

            {withdrawals.length === 0 ? (
              <View style={s.emptyBox}>
                <Icon name="inbox" size={36} color={colors.textSecondary} />
                <Text style={s.emptyText}>Aucun retrait effectué</Text>
              </View>
            ) : (
              <View style={s.historyList}>
                {withdrawals.map((wd, i) => {
                  const st = statusConfig[wd.status];
                  return (
                    <View
                      key={wd.id}
                      style={[s.historyRow, i === withdrawals.length - 1 && { borderBottomWidth: 0 }]}
                    >
                      <View style={[s.historyIcon, { backgroundColor: st.bg }]}>
                        <Icon
                          name={wd.status === 'completed' ? 'check-circle' : wd.status === 'rejected' ? 'x-circle' : 'clock'}
                          size={18}
                          color={st.color}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={s.historyAmount}>
                          {wd.amount_coins.toLocaleString('fr-FR')} coins
                          <Text style={s.historyAmountEur}> · {wd.amount_eur.toFixed(2)} €</Text>
                        </Text>
                        <Text style={s.historyDate}>
                          {formatDate(wd.created_at)} · {wd.payout_method === 'stripe' ? 'Stripe' : 'Mobile Money'}
                        </Text>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                        <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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
    gap: 16,
  },
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 4,
    elevation: 6,
    shadowColor: '#9B65F5',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  balLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  balAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.5,
  },
  balSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${colors.info}15`,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: `${colors.info}30`,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  amountCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  amountInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountInputText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  amountUnit: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  eurDisplay: {
    alignItems: 'center',
  },
  eurAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  eurLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  validationMsg: {
    fontSize: 12,
    fontWeight: '500',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 12,
  },
  methodOption: {
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
  methodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  methodCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phoneInputText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 16,
    elevation: 4,
    shadowColor: '#9B65F5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
  },
  historyList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  historyAmountEur: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  historyDate: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
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

export default WithdrawScreen;
