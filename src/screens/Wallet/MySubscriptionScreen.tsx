import React, { useCallback, useEffect, useState } from 'react';
import { BackButton, PriceWithLocal, GofolyxLoader } from '../../components/common';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { subscriptionService } from '../../services/subscriptionService';
import { toastService, showConfirm } from '../../services';
import type { Subscription, SubscriptionStatus } from '../../types';
import { PLAN_CONFIG } from '../../types/subscription';
import type { PlanType } from '../../types';

const PLAN_LABELS: Record<PlanType, string> = {
  free: 'Gratuit', basic: 'Basic', premium: 'Premium', family: 'Famille',
};
const PLAN_GRADIENTS: Record<PlanType, string[]> = {
  free:    ['#4B5563', '#374151'],
  basic:   ['#3B82F6', '#2563EB'],
  premium: ['#7B3FF2', '#E0389A'],
  family:  ['#F59E0B', '#FF8C00'],
};
const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; color: string; icon: string }> = {
  active:    { label: 'Actif',        color: '#10B981', icon: 'check-circle' },
  trialing:  { label: 'Essai',        color: '#3B82F6', icon: 'clock' },
  past_due:  { label: 'Impayé',       color: '#F59E0B', icon: 'alert-triangle' },
  cancelled: { label: 'Annulé',       color: '#EF4444', icon: 'x-circle' },
  expired:   { label: 'Expiré',       color: '#6B7280', icon: 'x-circle' },
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

export default function MySubscriptionScreen() {
  const nav               = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const insets            = useSafeAreaInsets();

  const [current,    setCurrent]    = useState<Subscription | null>(null);
  const [history,    setHistory]    = useState<Subscription[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sub, hist] = await Promise.all([
        subscriptionService.getMyCurrent(),
        subscriptionService.getHistory(),
      ]);
      setCurrent(sub);
      setHistory(hist);
    } catch {
      setCurrent(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCancel() {
    showConfirm(
      'Annuler l\'abonnement',
      'Votre abonnement restera actif jusqu\'à la fin de la période en cours. Confirmer ?',
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Annuler l\'abo',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const updated = await subscriptionService.cancel();
              setCurrent(updated);
              toastService.success('Abonnement annulé', 'Votre abonnement a bien été annulé.');
            } catch (e: any) {
              toastService.error('Erreur', e?.message ?? 'Impossible d\'annuler.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <GofolyxLoader fullScreen color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Mon abonnement</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      >
        {current ? (
          <>
            {/* Active subscription card */}
            <LinearGradient
              colors={PLAN_GRADIENTS[current.plan]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.currentCard}
            >
              <View style={s.currentTop}>
                <View>
                  <Text style={s.currentPlan}>Plan {PLAN_LABELS[current.plan]}</Text>
                  <PriceWithLocal amountEur={PLAN_CONFIG[current.plan].price} suffix="/mois" style={s.currentPrice} localStyle={{ color: 'rgba(255,255,255,0.75)' }} />
                </View>
                <View style={[s.statusPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Icon name={STATUS_CONFIG[current.status].icon} size={12} color="#fff" />
                  <Text style={s.statusPillText}>{STATUS_CONFIG[current.status].label}</Text>
                </View>
              </View>

              <View style={s.currentDates}>
                <View style={s.dateItem}>
                  <Text style={s.dateLabel}>Début</Text>
                  <Text style={s.dateVal}>{fmt(current.current_period_start)}</Text>
                </View>
                <View style={s.dateDivider} />
                <View style={s.dateItem}>
                  <Text style={s.dateLabel}>Renouvellement</Text>
                  <Text style={s.dateVal}>{fmt(current.current_period_end)}</Text>
                </View>
              </View>

              {current.downloads_used > 0 && (
                <View style={s.downloadsRow}>
                  <Icon name="download" size={13} color="rgba(255,255,255,0.8)" />
                  <Text style={s.downloadsText}>
                    {current.downloads_used} / {PLAN_CONFIG[current.plan].downloads} téléchargements
                  </Text>
                </View>
              )}
            </LinearGradient>

            {/* Specs */}
            <View style={[s.specsCard, { backgroundColor: colors.surface }]}>
              <Text style={[s.specsTitle, { color: colors.textSecondary }]}>INCLUS DANS VOTRE PLAN</Text>
              {[
                { icon: 'monitor',  label: `${PLAN_CONFIG[current.plan].screens} écran${PLAN_CONFIG[current.plan].screens > 1 ? 's' : ''} simultané${PLAN_CONFIG[current.plan].screens > 1 ? 's' : ''}` },
                { icon: 'video',    label: `Qualité ${PLAN_CONFIG[current.plan].quality}` },
                { icon: 'users',    label: `${PLAN_CONFIG[current.plan].profiles} profil${PLAN_CONFIG[current.plan].profiles > 1 ? 's' : ''}` },
                { icon: 'download', label: `${PLAN_CONFIG[current.plan].downloads} téléchargement${PLAN_CONFIG[current.plan].downloads > 1 ? 's' : ''}/mois` },
              ].map(item => (
                <View key={item.icon} style={s.specRow}>
                  <View style={[s.specIcon, { backgroundColor: colors.backgroundSecondary }]}>
                    <Icon name={item.icon} size={15} color={colors.primary} />
                  </View>
                  <Text style={[s.specLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Actions */}
            <TouchableOpacity
              onPress={() => nav.navigate('SubscriptionPlans')}
              style={[s.actionBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Icon name="repeat" size={16} color="#fff" />
              <Text style={s.actionBtnText}>Changer de plan</Text>
            </TouchableOpacity>

            {current.status === 'active' && !current.cancelled_at && (
              <TouchableOpacity
                onPress={handleCancel}
                disabled={cancelling}
                style={[s.cancelBtn, { borderColor: '#EF4444' + '55' }]}
                activeOpacity={0.8}
              >
                {cancelling
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <>
                      <Icon name="x-circle" size={16} color="#EF4444" />
                      <Text style={s.cancelBtnText}>Annuler l'abonnement</Text>
                    </>
                }
              </TouchableOpacity>
            )}

            {current.cancelled_at && (
              <View style={[s.cancelledNote, { backgroundColor: '#EF444418' }]}>
                <Icon name="info" size={14} color="#EF4444" />
                <Text style={[s.cancelledNoteText, { color: '#EF4444' }]}>
                  Annulé le {fmt(current.cancelled_at)} — actif jusqu'au {fmt(current.current_period_end)}
                </Text>
              </View>
            )}
          </>
        ) : (
          /* No subscription */
          <View style={s.emptyWrap}>
            <View style={[s.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="star" size={36} color={colors.textTertiary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucun abonnement actif</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>
              Profitez de films, séries et concerts sans publicité
            </Text>
            <TouchableOpacity
              onPress={() => nav.navigate('SubscriptionPlans')}
              style={[s.actionBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
              activeOpacity={0.8}
            >
              <Icon name="zap" size={16} color="#fff" />
              <Text style={s.actionBtnText}>Voir les plans</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={s.histSection}>
            <Text style={[s.histTitle, { color: colors.textSecondary }]}>HISTORIQUE</Text>
            <View style={[s.histCard, { backgroundColor: colors.surface }]}>
              {history.map((sub, i) => {
                const cfg = STATUS_CONFIG[sub.status];
                return (
                  <View key={sub.id} style={[
                    s.histRow,
                    i < history.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                  ]}>
                    <View style={[s.histDot, { backgroundColor: cfg.color + '33' }]}>
                      <Icon name={cfg.icon} size={14} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.histPlan, { color: colors.textPrimary }]}>Plan {PLAN_LABELS[sub.plan]}</Text>
                      <Text style={[s.histDate, { color: colors.textTertiary }]}>
                        {fmt(sub.current_period_start)} → {fmt(sub.current_period_end)}
                      </Text>
                    </View>
                    <View style={[s.histBadge, { backgroundColor: cfg.color + '18' }]}>
                      <Text style={[s.histBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  scroll:       { padding: 16 },

  currentCard:   { borderRadius: 20, padding: 22, marginBottom: 16, gap: 16 },
  currentTop:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  currentPlan:   { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  currentPrice:  { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 2 },
  statusPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText:{ color: '#fff', fontSize: 12, fontWeight: '700' },
  currentDates:  { flexDirection: 'row', gap: 12 },
  dateItem:      { flex: 1 },
  dateLabel:     { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', marginBottom: 3 },
  dateVal:       { color: '#fff', fontSize: 13, fontWeight: '600' },
  dateDivider:   { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  downloadsRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  downloadsText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  specsCard:   { borderRadius: 16, padding: 16, marginBottom: 14, gap: 12 },
  specsTitle:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  specRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  specIcon:    { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  specLabel:   { fontSize: 14, fontWeight: '500' },

  actionBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14, marginBottom: 10 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
  cancelBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
  cancelledNote: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
  cancelledNoteText: { flex: 1, fontSize: 12, lineHeight: 17 },

  emptyWrap:   { alignItems: 'center', gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon:   { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle:  { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptySub:    { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  histSection: { marginTop: 12 },
  histTitle:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  histCard:    { borderRadius: 14, overflow: 'hidden' },
  histRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  histDot:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  histPlan:    { fontSize: 14, fontWeight: '600' },
  histDate:    { fontSize: 11, marginTop: 2 },
  histBadge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  histBadgeText: { fontSize: 11, fontWeight: '700' },
});
