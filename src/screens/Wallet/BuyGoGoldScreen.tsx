import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useStripe } from '@stripe/stripe-react-native';
import { BackButton } from '../../components/common';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import { toastService } from '../../services';

const GOGOLD_PER_EUR = 100;

interface GoGoldPackage {
  id: string;
  name: string;
  gogold: number;
  bonus_gogold?: number;
  price_eur: number | string;
  is_popular?: boolean;
}

interface StripeInitResponse {
  client_secret: string;
  payment_intent_id: string;
  gogold_to_add: number;
  amount_eur: number;
}

interface GoGoldPurchaseResponse {
  new_balance: number;
  gogold_added: number;
}

const MOCK_PACKAGES: GoGoldPackage[] = [
  { id: '1', name: 'Starter', gogold: 100,  bonus_gogold: 0,   price_eur: 0.99,  is_popular: false },
  { id: '2', name: 'Popular', gogold: 500,  bonus_gogold: 75,  price_eur: 3.99,  is_popular: true  },
  { id: '3', name: 'Pro',     gogold: 1000, bonus_gogold: 200, price_eur: 7.99,  is_popular: false },
  { id: '4', name: 'Elite',   gogold: 2500, bonus_gogold: 750, price_eur: 17.99, is_popular: false },
];

function bonusOf(pkg: GoGoldPackage): number { return pkg.bonus_gogold ?? 0; }
function priceOf(pkg: GoGoldPackage): number  { return Number(pkg.price_eur); }

type Step = 'select' | 'success';

const BuyGoGoldScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [packages, setPackages] = useState<GoGoldPackage[]>(MOCK_PACKAGES);
  const [selected, setSelected] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customEur, setCustomEur] = useState('');
  const [paying, setPaying] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [goGoldAdded, setGoGoldAdded] = useState(0);
  const [finalBalance, setFinalBalance] = useState<number | null>(null);

  useEffect(() => {
    apiClient.get<GoGoldPackage[]>(Endpoints.wallet.packages)
      .then(res => { if (Array.isArray(res.data) && res.data.length > 0) setPackages(res.data); })
      .catch(() => {});
  }, []);

  const customAmount = parseFloat(customEur.replace(',', '.')) || 0;
  const customGoGold = Math.floor(customAmount * GOGOLD_PER_EUR);
  const customValid = Number.isFinite(customAmount) && customAmount >= 1 && customAmount <= 500;

  async function payWithStripe(packageId: string | null, amountEur: number | null) {
    if (paying) return;
    setPaying(true);
    try {
      const body = packageId ? { package_id: packageId } : { amount_eur: amountEur };
      const initRes = await apiClient.post<StripeInitResponse>(Endpoints.wallet.stripeInit, body);
      const { client_secret, gogold_to_add } = initRes.data;

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'GoFolyX',
        paymentIntentClientSecret: client_secret,
      });
      if (initError) {
        toastService.error('Paiement impossible', initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        // Annulation utilisateur ou échec — pas d'erreur bruyante sur simple annulation
        if (presentError.code !== 'Canceled') {
          toastService.error('Paiement échoué', presentError.message);
        }
        return;
      }

      // Paiement confirmé côté Stripe — crédite le wallet (revérifié serveur)
      const endpoint = packageId ? Endpoints.wallet.purchase : Endpoints.wallet.purchaseCustom;
      const purchaseBody = packageId
        ? { package_id: packageId, stripe_payment_intent_id: initRes.data.payment_intent_id }
        : { amount_eur: amountEur, stripe_payment_intent_id: initRes.data.payment_intent_id };
      const purchaseRes = await apiClient.post<GoGoldPurchaseResponse>(endpoint, purchaseBody);

      setGoGoldAdded(purchaseRes.data.gogold_added ?? gogold_to_add);
      setFinalBalance(purchaseRes.data.new_balance ?? null);
      setStep('success');
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? "Impossible d'effectuer le paiement.");
    } finally {
      setPaying(false);
    }
  }

  function handleBuyPackage(pkg: GoGoldPackage) {
    payWithStripe(pkg.id, null);
  }

  function handleBuyCustom() {
    if (!customValid) return;
    const safeAmount = Math.round(customAmount * 100) / 100;
    payWithStripe(null, safeAmount);
  }

  if (step === 'success') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={[s.iconCircle, { backgroundColor: '#22C55E22' }]}>
          <Icon name="check-circle" size={40} color="#22C55E" />
        </View>
        <Text style={[s.title, { color: colors.textPrimary }]}>Paiement confirmé</Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          +{goGoldAdded.toLocaleString('fr-FR')} GoGold ajoutés à votre portefeuille
        </Text>
        {finalBalance != null && (
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary }}>
            Nouveau solde : {finalBalance.toLocaleString('fr-FR')} GoGold
          </Text>
        )}
        <TouchableOpacity style={s.webBtn} activeOpacity={0.85} onPress={() => navigation.goBack()}>
          <Text style={s.webBtnText}>Retour au portefeuille</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Acheter des GoGold</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={[s.infoBanner, { borderColor: colors.primary + '33' }]}>
          <Icon name="credit-card" size={16} color={colors.primary} />
          <Text style={[s.infoText, { color: colors.textSecondary }]}>
            Paiement par carte bancaire sécurisé par Stripe, directement dans l'app.
          </Text>
        </View>

        <View style={[s.toggleRow, { backgroundColor: colors.backgroundSecondary }]}>
          <TouchableOpacity
            style={[s.toggleBtn, !customMode && { backgroundColor: colors.background }]}
            onPress={() => setCustomMode(false)}
          >
            <Text style={[s.toggleText, { color: !customMode ? colors.primary : colors.textTertiary }]}>Packs prédéfinis</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, customMode && { backgroundColor: colors.background }]}
            onPress={() => { setCustomMode(true); setSelected(null); }}
          >
            <Text style={[s.toggleText, { color: customMode ? colors.primary : colors.textTertiary }]}>Montant libre</Text>
          </TouchableOpacity>
        </View>

        {!customMode ? (
          <>
            <View style={s.grid}>
              {packages.map(pkg => {
                const isSelected = selected === pkg.id;
                const bonus = bonusOf(pkg);
                const price = priceOf(pkg);
                return (
                  <TouchableOpacity
                    key={pkg.id}
                    style={[
                      s.card,
                      { backgroundColor: colors.surface ?? colors.backgroundSecondary, borderColor: isSelected ? colors.primary : colors.border },
                      isSelected && { borderWidth: 2 },
                    ]}
                    onPress={() => setSelected(isSelected ? null : pkg.id)}
                    activeOpacity={0.8}
                  >
                    {pkg.is_popular && (
                      <View style={s.popularBadge}><Text style={s.popularText}>POPULAIRE</Text></View>
                    )}
                    <Text style={[s.cardName, { color: colors.textPrimary }]}>{pkg.name}</Text>
                    <Text style={[s.cardGoGold, { color: colors.textPrimary }]}>{pkg.gogold.toLocaleString('fr-FR')}</Text>
                    <Text style={[s.cardLabel, { color: colors.textTertiary }]}>GoGold</Text>
                    {bonus > 0 && <Text style={s.cardBonus}>+{bonus.toLocaleString('fr-FR')} bonus</Text>}
                    <Text style={[s.cardPrice, { color: colors.primary }]}>{price.toFixed(2)} €</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selected && (() => {
              const pkg = packages.find(p => p.id === selected)!;
              const total = pkg.gogold + bonusOf(pkg);
              const price = priceOf(pkg);
              return (
                <TouchableOpacity
                  style={[s.payBtn, paying && { opacity: 0.6 }]}
                  onPress={() => handleBuyPackage(pkg)}
                  disabled={paying}
                  activeOpacity={0.85}
                >
                  <Icon name="credit-card" size={16} color="#fff" />
                  <Text style={s.payBtnText}>
                    {paying ? 'Paiement en cours…' : `Payer ${total.toLocaleString('fr-FR')} GoGold — ${price.toFixed(2)} €`}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </>
        ) : (
          <View style={[s.customBox, { backgroundColor: colors.surface ?? colors.backgroundSecondary, borderColor: colors.border }]}>
            <Text style={[s.customLabel, { color: colors.textPrimary }]}>Saisissez votre montant</Text>
            <View style={[s.inputRow, { borderColor: colors.border }]}>
              <TextInput
                style={[s.input, { color: colors.textPrimary }]}
                keyboardType="decimal-pad"
                placeholder="Ex : 15"
                placeholderTextColor={colors.textTertiary}
                value={customEur}
                onChangeText={setCustomEur}
              />
              <Text style={[s.inputSuffix, { color: colors.textTertiary }]}>€</Text>
            </View>
            {customAmount > 0 && (
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                Vous recevrez {customGoGold.toLocaleString('fr-FR')} GoGold
              </Text>
            )}
            <TouchableOpacity
              style={[s.payBtn, (!customValid || paying) && { opacity: 0.4 }]}
              onPress={handleBuyCustom}
              disabled={!customValid || paying}
              activeOpacity={0.85}
            >
              <Icon name="credit-card" size={16} color="#fff" />
              <Text style={s.payBtnText}>
                {paying ? 'Paiement en cours…' : customValid ? `Payer ${customGoGold.toLocaleString('fr-FR')} GoGold — ${customAmount.toFixed(2)} €` : 'Saisissez un montant valide'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  webBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    backgroundColor: '#7B3FF2',
  },
  webBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
  toggleRow: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 16 },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' },
  toggleText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  popularBadge: {
    position: 'absolute', top: -8, left: '50%', marginLeft: -38,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
    backgroundColor: '#7B3FF2',
  },
  popularText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  cardName: { fontSize: 13, fontWeight: '800', marginBottom: 6 },
  cardGoGold: { fontSize: 22, fontWeight: '800' },
  cardLabel: { fontSize: 11 },
  cardBonus: { fontSize: 11, fontWeight: '700', color: '#22C55E', marginTop: 2 },
  cardPrice: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: '#7B3FF2',
  },
  payBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  customBox: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 14 },
  customLabel: { fontSize: 14, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 20, fontWeight: '800' },
  inputSuffix: { fontSize: 18, fontWeight: '800' },
});

export default BuyGoGoldScreen;
