import React, { useEffect, useState, useCallback } from 'react';
import { BackButton, GofolyxLoader, PriceWithLocal } from '../../components/common';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { subscriptionService } from '../../services/subscriptionService';
import { toastService } from '../../services/toastService';
import type { PlanType, Subscription } from '../../types';
import { PLAN_CONFIG } from '../../types/subscription';

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS: {
  type: PlanType;
  label: string;
  gradient: string[];
  icon: string;
  badge?: string;
  features: string[];
}[] = [
  {
    type: 'free',
    label: 'Gratuit',
    gradient: ['#4B5563', '#374151'],
    icon: 'user',
    features: [
      '1 écran simultané',
      'Qualité 480p',
      'Contenu limité',
      'Publicités',
    ],
  },
  {
    type: 'basic',
    label: 'Basic',
    gradient: ['#3B82F6', '#2563EB'],
    icon: 'star',
    features: [
      '1 écran simultané',
      'Qualité HD 720p',
      'Sans publicité',
      'Catalogue complet',
    ],
  },
  {
    type: 'premium',
    label: 'Premium',
    gradient: ['#7B3FF2', '#E0389A'],
    icon: 'zap',
    badge: 'POPULAIRE',
    features: [
      '2 écrans simultanés',
      'Qualité Full HD 1080p',
      '3 profils',
      '10 téléchargements',
      'Sans publicité',
      'Accès anticipé',
    ],
  },
  {
    type: 'family',
    label: 'Famille',
    gradient: ['#F59E0B', '#FF8C00'],
    icon: 'users',
    features: [
      '5 écrans simultanés',
      'Qualité 4K Ultra HD',
      '6 profils',
      '30 téléchargements',
      'Contrôle parental',
      'Partage famille',
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SubscriptionPlansScreen() {
  const nav               = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const insets            = useSafeAreaInsets();

  const [current,   setCurrent]   = useState<Subscription | null>(null);
  const [checking,  setChecking]  = useState<PlanType | null>(null);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sub = await subscriptionService.getMyCurrent();
      setCurrent(sub);
    } catch {
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSelectPlan(plan: PlanType) {
    if (plan === 'free') {
      toastService.info('Plan gratuit', 'Vous utilisez déjà le plan gratuit.');
      return;
    }
    if (current?.plan === plan && current?.status === 'active') {
      nav.navigate('MySubscription');
      return;
    }
    setChecking(plan);
    try {
      const check = await subscriptionService.walletCheck(plan);
      nav.navigate('SubscriptionPayment', { plan, walletCheck: check });
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? 'Impossible de vérifier le solde');
    } finally {
      setChecking(null);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background ?? '#0a0a0f' }}>
        <GofolyxLoader />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Abonnements</Text>
        {current?.status === 'active' ? (
          <TouchableOpacity onPress={() => nav.navigate('MySubscription')}
            style={[s.mySubBtn, { backgroundColor: colors.primary + '22' }]}>
            <Text style={[s.mySubBtnText, { color: colors.primary }]}>Mon abo</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 70 }} />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={[s.heroTitle, { color: colors.textPrimary }]}>Choisissez votre plan</Text>
          <Text style={[s.heroSub, { color: colors.textSecondary }]}>
            Films, séries, concerts en illimité — annulable à tout moment
          </Text>
        </View>

        {/* Plans */}
        {PLANS.map(plan => {
          const cfg       = PLAN_CONFIG[plan.type];
          const isActive  = current?.plan === plan.type && current?.status === 'active';
          const isBusy    = checking === plan.type;

          return (
            <View key={plan.type} style={[
              s.card,
              { backgroundColor: colors.surface, borderColor: isActive ? colors.primary : colors.divider },
              isActive && s.cardActive,
            ]}>
              {plan.badge && (
                <View style={s.badge}>
                  <LinearGradient colors={plan.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.badgeGrad}>
                    <Text style={s.badgeText}>{plan.badge}</Text>
                  </LinearGradient>
                </View>
              )}

              {/* Card header */}
              <LinearGradient colors={plan.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cardHeader}>
                <View style={s.cardHeaderRow}>
                  <View style={s.iconCircle}>
                    <Icon name={plan.icon} size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planLabel}>{plan.label}</Text>
                    {cfg.price === 0 ? (
                      <Text style={s.planPrice}>Gratuit</Text>
                    ) : (
                      <PriceWithLocal amountEur={cfg.price} suffix="/mois" style={s.planPrice} localStyle={{ color: 'rgba(255,255,255,0.75)' }} />
                    )}
                  </View>
                  {isActive && (
                    <View style={s.activePill}>
                      <Icon name="check-circle" size={13} color="#fff" />
                      <Text style={s.activePillText}>Actif</Text>
                    </View>
                  )}
                </View>
                <View style={s.specRow}>
                  <SpecChip icon="monitor" label={`${cfg.screens} écran${cfg.screens > 1 ? 's' : ''}`} />
                  <SpecChip icon="video" label={cfg.quality} />
                  {cfg.downloads > 0 && <SpecChip icon="download" label={`${cfg.downloads} dl`} />}
                </View>
              </LinearGradient>

              {/* Features */}
              <View style={s.features}>
                {plan.features.map(f => (
                  <View key={f} style={s.featureRow}>
                    <Icon name="check" size={14} color={plan.gradient[0]} />
                    <Text style={[s.featureText, { color: colors.textSecondary }]}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* CTA */}
              {plan.type !== 'free' && (
                <TouchableOpacity
                  style={[s.cta, isActive && s.ctaActive]}
                  onPress={() => handleSelectPlan(plan.type)}
                  disabled={isBusy}
                  activeOpacity={0.8}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <LinearGradient
                      colors={isActive ? ['#6B7280', '#4B5563'] : plan.gradient}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={s.ctaGrad}
                    >
                      <Icon name={isActive ? 'settings' : 'arrow-right'} size={16} color="#fff" />
                      <Text style={s.ctaText}>
                        {isActive ? 'Gérer' : `Choisir ${plan.label}`}
                      </Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Footer note */}
        <View style={[s.footer, { backgroundColor: colors.backgroundSecondary }]}>
          <Icon name="info" size={14} color={colors.textTertiary} />
          <Text style={[s.footerText, { color: colors.textTertiary }]}>
            Paiement sécurisé via GoGold Gofolyx ou carte bancaire. Annulation sans frais à tout moment.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Spec chip ─────────────────────────────────────────────────────────────────
function SpecChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={sc.chip}>
      <Icon name={icon} size={11} color="rgba(255,255,255,0.8)" />
      <Text style={sc.chipText}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  mySubBtn:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  mySubBtnText: { fontSize: 13, fontWeight: '700' },

  scroll: { padding: 16 },

  hero:       { alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  heroTitle:  { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  heroSub:    { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  card:       { borderRadius: 20, overflow: 'hidden', marginBottom: 16, borderWidth: 1.5 },
  cardActive: { shadowColor: '#7B3FF2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },

  badge:     { position: 'absolute', top: 12, right: 12, zIndex: 10 },
  badgeGrad: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  cardHeader:    { padding: 20, gap: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconCircle:    { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  planLabel:     { color: '#fff', fontSize: 20, fontWeight: '800' },
  planPrice:     { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600', marginTop: 2 },
  activePill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  activePillText:{ color: '#fff', fontSize: 11, fontWeight: '700' },

  specRow: { flexDirection: 'row', gap: 8 },

  features:    { padding: 16, gap: 10 },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 13, flex: 1 },

  cta:     { marginHorizontal: 16, marginBottom: 16, borderRadius: 14, overflow: 'hidden' },
  ctaActive: {},
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  footer:     { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, marginBottom: 8 },
  footerText: { flex: 1, fontSize: 12, lineHeight: 18 },
});

const sc = StyleSheet.create({
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  chipText: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
});
