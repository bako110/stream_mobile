import React, { useState } from 'react';
import { BackButton } from '../../components/common';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { subscriptionService, type WalletCheck } from '../../services/subscriptionService';
import type { PlanType } from '../../types';
import { PLAN_CONFIG } from '../../types/subscription';

const PLAN_LABELS: Record<PlanType, string> = {
  free: 'Gratuit', basic: 'Basic', premium: 'Premium', family: 'Famille',
};
const PLAN_GRADIENTS: Record<PlanType, string[]> = {
  free:    ['#4B5563', '#374151'],
  basic:   ['#3B82F6', '#2563EB'],
  premium: ['#7B3FF2', '#E0389A'],
  family:  ['#F59E0B', '#FF8C00'],
};

type PayMethod = 'gogold' | 'stripe';

export default function SubscriptionPaymentScreen() {
  const nav               = useNavigation<any>();
  const route             = useRoute<any>();
  const { theme, isDark } = useTheme();
  const { colors }        = theme;

  const plan: PlanType         = route.params?.plan ?? 'basic';
  const walletCheck: WalletCheck = route.params?.walletCheck;
  const cfg                    = PLAN_CONFIG[plan];
  const gradient               = PLAN_GRADIENTS[plan];

  const [method,     setMethod]     = useState<PayMethod>(walletCheck?.sufficient ? 'gogold' : 'stripe');
  const [processing, setProcessing] = useState(false);
  const [success,    setSuccess]    = useState(false);

  async function handleConfirm() {
    setProcessing(true);
    try {
      if (method === 'gogold') {
        await subscriptionService.subscribeViaWallet(plan);
      } else {
        await subscriptionService.subscribe(plan);
      }
      setSuccess(true);
      setTimeout(() => {
        nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
        nav.navigate('MySubscription');
      }, 2000);
    } catch (e: any) {
      Alert.alert('Paiement échoué', e?.message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setProcessing(false);
    }
  }

  // ── Success overlay ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <LinearGradient colors={gradient} style={s.successCircle}>
          <Icon name="check" size={40} color="#fff" />
        </LinearGradient>
        <Text style={[s.successTitle, { color: colors.textPrimary }]}>Abonnement activé !</Text>
        <Text style={[s.successSub, { color: colors.textSecondary }]}>
          Bienvenue sur le plan {PLAN_LABELS[plan]}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Paiement</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Plan summary card */}
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.planCard}>
          <Text style={s.planCardLabel}>Plan {PLAN_LABELS[plan]}</Text>
          <Text style={s.planCardPrice}>{cfg.price.toFixed(2)} €/mois</Text>
          <View style={s.planCardSpecs}>
            <Text style={s.planCardSpec}>{cfg.screens} écran{cfg.screens > 1 ? 's' : ''}</Text>
            <Text style={s.planCardDot}>·</Text>
            <Text style={s.planCardSpec}>{cfg.quality}</Text>
            {cfg.downloads > 0 && <>
              <Text style={s.planCardDot}>·</Text>
              <Text style={s.planCardSpec}>{cfg.downloads} dl</Text>
            </>}
          </View>
        </LinearGradient>

        {/* Payment method */}
        <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>MODE DE PAIEMENT</Text>

        {/* GoGold method */}
        <TouchableOpacity
          onPress={() => setMethod('gogold')}
          style={[s.methodCard, { backgroundColor: colors.surface, borderColor: method === 'gogold' ? colors.primary : colors.divider }]}
          activeOpacity={0.8}
        >
          <View style={[s.methodIcon, { backgroundColor: '#FFD700' + '22' }]}>
            <Icon name="dollar-sign" size={20} color="#FFD700" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.methodLabel, { color: colors.textPrimary }]}>Payer avec GoGold</Text>
            {walletCheck ? (
              <Text style={[s.methodSub, { color: walletCheck.sufficient ? '#10B981' : '#EF4444' }]}>
                {walletCheck.sufficient
                  ? `${walletCheck.gogold_required} GoGold · Solde suffisant (${walletCheck.balance} GoGold)`
                  : `Il manque ${walletCheck.missing} GoGold`}
              </Text>
            ) : (
              <Text style={[s.methodSub, { color: colors.textTertiary }]}>Déduire de votre portefeuille</Text>
            )}
          </View>
          <View style={[s.radio, method === 'gogold' && { borderColor: colors.primary }]}>
            {method === 'gogold' && <View style={[s.radioDot, { backgroundColor: colors.primary }]} />}
          </View>
        </TouchableOpacity>

        {/* Stripe method */}
        <TouchableOpacity
          onPress={() => setMethod('stripe')}
          style={[s.methodCard, { backgroundColor: colors.surface, borderColor: method === 'stripe' ? colors.primary : colors.divider }]}
          activeOpacity={0.8}
        >
          <View style={[s.methodIcon, { backgroundColor: '#635BFF' + '22' }]}>
            <Icon name="credit-card" size={20} color="#635BFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.methodLabel, { color: colors.textPrimary }]}>Carte bancaire (Stripe)</Text>
            <Text style={[s.methodSub, { color: colors.textTertiary }]}>Paiement sécurisé Stripe</Text>
          </View>
          <View style={[s.radio, method === 'stripe' && { borderColor: colors.primary }]}>
            {method === 'stripe' && <View style={[s.radioDot, { backgroundColor: colors.primary }]} />}
          </View>
        </TouchableOpacity>

        {/* GoGold missing — lien recharge */}
        {method === 'gogold' && walletCheck && !walletCheck.sufficient && (
          <TouchableOpacity
            onPress={() => nav.navigate('BuyGoGold', { missingGoGold: walletCheck.missing, returnTo: 'SubscriptionPayment' })}
            style={[s.rechargeBtn, { backgroundColor: '#FFD700' + '18', borderColor: '#FFD700' + '55' }]}
          >
            <Icon name="plus-circle" size={16} color="#FFD700" />
            <Text style={[s.rechargeBtnText, { color: '#FFD700' }]}>
              Acheter {walletCheck.missing} GoGold manquants
            </Text>
          </TouchableOpacity>
        )}

        {/* Recap */}
        <View style={[s.recap, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={s.recapRow}>
            <Text style={[s.recapLabel, { color: colors.textSecondary }]}>Plan</Text>
            <Text style={[s.recapVal, { color: colors.textPrimary }]}>{PLAN_LABELS[plan]}</Text>
          </View>
          <View style={s.recapRow}>
            <Text style={[s.recapLabel, { color: colors.textSecondary }]}>Facturation</Text>
            <Text style={[s.recapVal, { color: colors.textPrimary }]}>Mensuelle</Text>
          </View>
          <View style={[s.recapRow, s.recapTotal]}>
            <Text style={[s.recapLabel, { color: colors.textPrimary, fontWeight: '700' }]}>Total</Text>
            <Text style={[s.recapVal, { color: colors.primary, fontWeight: '800', fontSize: 18 }]}>
              {cfg.price.toFixed(2)} €
            </Text>
          </View>
        </View>

        {/* Confirm button */}
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={processing || (method === 'gogold' && walletCheck && !walletCheck.sufficient)}
          style={{ marginTop: 8, borderRadius: 16, overflow: 'hidden' }}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={(method === 'gogold' && walletCheck && !walletCheck.sufficient)
              ? ['#4B5563', '#374151']
              : gradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.confirmBtn}
          >
            {processing
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Icon name="lock" size={16} color="#fff" />
                  <Text style={s.confirmText}>Confirmer l'abonnement</Text>
                </>
            }
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[s.disclaimer, { color: colors.textTertiary }]}>
          En confirmant, vous acceptez les CGU GoFolyX. Annulation possible à tout moment depuis votre compte.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  scroll:       { padding: 16 },

  planCard:      { borderRadius: 20, padding: 24, marginBottom: 24, alignItems: 'center', gap: 6 },
  planCardLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  planCardPrice: { color: '#fff', fontSize: 32, fontWeight: '900' },
  planCardSpecs: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  planCardSpec:  { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  planCardDot:   { color: 'rgba(255,255,255,0.4)', fontSize: 13 },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 12 },

  methodCard:  { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
  methodIcon:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { fontSize: 15, fontWeight: '600' },
  methodSub:   { fontSize: 12, marginTop: 2 },
  radio:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#6B7280', alignItems: 'center', justifyContent: 'center' },
  radioDot:    { width: 10, height: 10, borderRadius: 5 },

  rechargeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  rechargeBtnText: { fontSize: 14, fontWeight: '600' },

  recap:      { borderRadius: 14, padding: 16, marginTop: 16, gap: 12 },
  recapRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recapTotal: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 4 },
  recapLabel: { fontSize: 14 },
  recapVal:   { fontSize: 14, fontWeight: '600' },

  confirmBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  successCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  successTitle:  { fontSize: 24, fontWeight: '800' },
  successSub:    { fontSize: 15 },

  disclaimer: { fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 16, paddingHorizontal: 8 },
});
