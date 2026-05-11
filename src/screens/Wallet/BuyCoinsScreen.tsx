/**
 * BuyCoinsScreen — Acheter des packs de coins
 * - Grille 2 colonnes de packages
 * - Modal de confirmation
 * - Mock Stripe → POST /wallet/purchase
 * - Animation succès
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  Animated,
  ActivityIndicator,
  StatusBar,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 20 * 2 - 12) / 2;

// ── Types ──────────────────────────────────────────────────────────────────
interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  bonus: number;
  bonus_coins: number;
  price_eur: number | string;
  is_popular: boolean;
}

interface WalletBalance {
  coins_balance: number;
}


// ── Success overlay ────────────────────────────────────────────────────────
const SuccessOverlay: React.FC<{ visible: boolean; coins: number; onDone: () => void }> = ({
  visible, coins, onDone,
}) => {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    } else {
      scale.setValue(0);
      opacity.setValue(0);
    }
  }, [visible, onDone, scale, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }]}>
      <Animated.View style={[{ transform: [{ scale }] }, { alignItems: 'center', gap: 12 }]}>
        <LinearGradient colors={['#9B65F5', '#E85DAD']} style={{ width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={44} color="#FFF" />
        </LinearGradient>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFF' }}>Achat réussi !</Text>
        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>+{coins.toLocaleString('fr-FR')} coins crédités</Text>
      </Animated.View>
    </Animated.View>
  );
};

// ── Package card ───────────────────────────────────────────────────────────
const PackageCard: React.FC<{
  pkg: CoinPackage;
  selected: boolean;
  onSelect: () => void;
  colors: any;
}> = ({ pkg, selected, onSelect, colors }) => {
  const bonusCoins = pkg.bonus_coins ?? pkg.bonus ?? 0;
  const totalCoins = (pkg.coins ?? 0) + bonusCoins;
  const priceEur   = parseFloat(String(pkg.price_eur ?? 0)).toFixed(2);
  const s = cardStyles(colors);

  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.85} style={{ width: CARD_W }}>
      {selected ? (
        <LinearGradient colors={['#9B65F5', '#E85DAD']} style={[s.card, s.cardSelected]}>
          {pkg.is_popular && <View style={s.popularBadge}><Text style={s.popularText}>POPULAIRE</Text></View>}
          {bonusCoins > 0 && (
            <View style={s.bonusBadge}>
              <Text style={s.bonusText}>+{bonusCoins} bonus</Text>
            </View>
          )}
          <MaterialCommunityIcons name="bitcoin" size={32} color="#FFD700" />
          <Text style={[s.pkgName, { color: '#FFF' }]}>{pkg.name}</Text>
          <Text style={[s.pkgCoins, { color: '#FFF' }]}>{totalCoins.toLocaleString('fr-FR')}</Text>
          <Text style={[s.pkgCoinsLabel, { color: 'rgba(255,255,255,0.75)' }]}>coins</Text>
          <Text style={[s.pkgPrice, { color: '#FFF' }]}>{priceEur} €</Text>
        </LinearGradient>
      ) : (
        <View style={[s.card, pkg.is_popular && s.cardPopular]}>
          {pkg.is_popular && <View style={s.popularBadge}><Text style={s.popularText}>POPULAIRE</Text></View>}
          {bonusCoins > 0 && (
            <View style={s.bonusBadge}>
              <Text style={s.bonusText}>+{bonusCoins} bonus</Text>
            </View>
          )}
          <MaterialCommunityIcons name="bitcoin" size={32} color="#FFD700" />
          <Text style={s.pkgName}>{pkg.name}</Text>
          <Text style={s.pkgCoins}>{totalCoins.toLocaleString('fr-FR')}</Text>
          <Text style={s.pkgCoinsLabel}>coins</Text>
          <Text style={s.pkgPrice}>{priceEur} €</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const cardStyles = (colors: any) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 160,
    justifyContent: 'center',
    position: 'relative',
  },
  cardSelected: {
    borderColor: 'transparent',
    elevation: 6,
    shadowColor: '#9B65F5',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  cardPopular: {
    borderColor: '#9B65F5',
    borderWidth: 1.5,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#9B65F5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  popularText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.8,
  },
  bonusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#3FEDB622',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  bonusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#3FEDB6',
  },
  pkgName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 6,
  },
  pkgCoins: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  pkgCoinsLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: -4,
  },
  pkgPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 6,
  },
});

// ── Main ───────────────────────────────────────────────────────────────────
const BuyCoinsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>();

  const [packages, setPackages]     = useState<CoinPackage[]>([]);
  const [loading, setLoading]       = useState(true);
  const [balance, setBalance]       = useState<number>(0);
  const [selected, setSelected]     = useState<CoinPackage | null>(null);
  const [modalVisible, setModal]    = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [successCoins, setSuccessCoins] = useState(0);
  const [customEur, setCustomEur]   = useState('');
  const [customMode, setCustomMode] = useState(false);

  const EUR_TO_COINS = 200; // 1 EUR = 200 coins
  const customCoins  = Math.floor(parseFloat(customEur || '0') * EUR_TO_COINS);
  const customValid  = customCoins >= 100 && parseFloat(customEur || '0') >= 0.5;

  useEffect(() => {
    Promise.allSettled([
      apiClient.get<CoinPackage[]>(Endpoints.wallet.packages),
      apiClient.get<WalletBalance>(Endpoints.wallet.balance),
    ]).then(([pkgRes, balRes]) => {
      if (pkgRes.status === 'fulfilled') setPackages(pkgRes.value.data ?? []);
      if (balRes.status === 'fulfilled') setBalance(balRes.value.data?.coins_balance ?? 0);
    }).finally(() => setLoading(false));
  }, []);

  const handleSelect = (pkg: CoinPackage) => {
    setSelected(pkg);
    setModal(true);
  };

  const handlePurchase = async () => {
    if (!selected) return;
    setPurchasing(true);
    try {
      // Simulate Stripe payment intent creation
      Alert.alert(
        'Paiement simulé',
        `Stripe (sandbox) — ${parseFloat(String(selected.price_eur)).toFixed(2)} €\nLe paiement sera traité en production.`,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => setPurchasing(false) },
          {
            text: 'Confirmer', onPress: async () => {
              try {
                if (selected.id === 'custom') {
                  await apiClient.post(Endpoints.wallet.purchaseCustom, {
                    amount_eur: parseFloat(String(selected.price_eur)),
                    stripe_payment_intent_id: `pi_mock_${Date.now()}`,
                  });
                } else {
                  await apiClient.post(Endpoints.wallet.purchase, {
                    package_id: selected.id,
                    stripe_payment_intent_id: `pi_mock_${Date.now()}`,
                  });
                }
                setModal(false);
                setSuccessCoins(selected.coins + (selected.bonus_coins ?? selected.bonus ?? 0));
                setSuccess(true);
                setBalance(prev => prev + selected.coins + selected.bonus);
              } catch (e: any) {
                Alert.alert('Erreur', e?.message ?? 'Achat échoué');
              } finally {
                setPurchasing(false);
              }
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Achat échoué');
      setPurchasing(false);
    }
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
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Recharger</Text>
        <View style={s.balancePill}>
          <MaterialCommunityIcons name="bitcoin" size={14} color="#FFD700" />
          <Text style={s.balancePillText}>{balance.toLocaleString('fr-FR')}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Saisie libre */}
        <TouchableOpacity
          style={[s.customToggle, { backgroundColor: colors.surface }]}
          onPress={() => setCustomMode(m => !m)}
          activeOpacity={0.8}
        >
          <Icon name="edit-2" size={15} color={colors.primary} />
          <Text style={[s.customToggleText, { color: colors.textPrimary }]}>
            {customMode ? 'Fermer le montant libre' : 'Saisir un montant libre'}
          </Text>
          <Icon name={customMode ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textSecondary} />
        </TouchableOpacity>

        {customMode && (
          <View style={[s.customBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.customLabel, { color: colors.textSecondary }]}>Montant en EUR</Text>
            <View style={s.customInputRow}>
              <Text style={s.customCurrency}>€</Text>
              <TextInput
                style={[s.customInput, { color: colors.textPrimary }]}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                value={customEur}
                onChangeText={setCustomEur}
              />
            </View>
            {customCoins > 0 && (
              <Text style={s.customCoinsPreview}>
                = {customCoins.toLocaleString('fr-FR')} 🪙
              </Text>
            )}
            <TouchableOpacity
              style={[s.customBtn, !customValid && { opacity: 0.4 }]}
              disabled={!customValid}
              onPress={() => {
                const fakePkg: CoinPackage = {
                  id: 'custom',
                  name: `${customCoins} coins`,
                  coins: customCoins,
                  bonus: 0,
                  bonus_coins: 0,
                  price_eur: parseFloat(customEur),
                  is_popular: false,
                };
                setSelected(fakePkg);
                setModal(true);
              }}
            >
              <LinearGradient
                colors={['#7B3FF2', '#E0389A']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.customBtnInner}
              >
                <Icon name="shopping-cart" size={15} color="#fff" />
                <Text style={s.customBtnText}>
                  Acheter {customCoins > 0 ? `${customCoins.toLocaleString('fr-FR')} 🪙` : ''}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={[s.customHint, { color: colors.textTertiary }]}>
              Minimum 0.50 € · 1 EUR = {EUR_TO_COINS} coins
            </Text>
          </View>
        )}

        <Text style={s.subtitle}>Ou choisissez un pack</Text>

        {/* Grid 2 columns */}
        <View style={s.grid}>
          {packages.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              selected={selected?.id === pkg.id}
              onSelect={() => handleSelect(pkg)}
              colors={colors}
            />
          ))}
        </View>

        {/* Info footer */}
        <View style={s.infoBox}>
          <Icon name="info" size={14} color={colors.textSecondary} />
          <Text style={s.infoText}>
            1 EUR = 200 coins • Les coins ne sont pas remboursables • Les bonus sont immédiatement crédités
          </Text>
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Confirmer l'achat</Text>

            {selected && (
              <View style={s.modalPkgRow}>
                <LinearGradient colors={['#9B65F5', '#E85DAD']} style={s.modalPkgIcon}>
                  <MaterialCommunityIcons name="bitcoin" size={28} color="#FFD700" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalPkgName}>{selected.name}</Text>
                  <Text style={s.modalPkgCoins}>
                    {(selected.coins + (selected.bonus_coins ?? selected.bonus ?? 0)).toLocaleString('fr-FR')} coins
                    {(selected.bonus_coins ?? selected.bonus ?? 0) > 0 && (
                      <Text style={{ color: colors.success }}> (+{selected.bonus_coins ?? selected.bonus} bonus)</Text>
                    )}
                  </Text>
                </View>
                <Text style={s.modalPrice}>{parseFloat(String(selected.price_eur)).toFixed(2)} €</Text>
              </View>
            )}

            <View style={s.modalPayRow}>
              <Icon name="credit-card" size={18} color={colors.textSecondary} />
              <Text style={s.modalPayText}>Stripe (Sandbox)</Text>
              <View style={s.stripeBadge}><Text style={s.stripeText}>TEST</Text></View>
            </View>

            <TouchableOpacity
              onPress={handlePurchase}
              disabled={purchasing}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#9B65F5', '#E85DAD']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.confirmBtn}
              >
                {purchasing
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={s.confirmText}>Payer {parseFloat(String(selected?.price_eur ?? 0)).toFixed(2)} €</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModal(false)} style={s.cancelBtn}>
              <Text style={s.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success overlay */}
      <SuccessOverlay
        visible={success}
        coins={successCoins}
        onDone={() => { setSuccess(false); navigation.goBack(); }}
      />
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
    gap: 12,
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
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balancePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  modalPkgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
  },
  modalPkgIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPkgName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalPkgCoins: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  modalPayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  modalPayText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  stripeBadge: {
    backgroundColor: '#635BFF22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stripeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#635BFF',
  },
  confirmBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  // Custom amount
  customToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customToggleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  customBox: {
    borderRadius: 16,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  customCurrency: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFD700',
  },
  customInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
  },
  customCoinsPreview: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFD700',
    textAlign: 'center',
  },
  customBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  customBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  customBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  customHint: {
    fontSize: 12,
    textAlign: 'center',
  },
});

export default BuyCoinsScreen;
