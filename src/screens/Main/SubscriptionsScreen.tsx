import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, SkeletonSubscriptions } from '../../components/common';
import { subscriptionService, WalletCheck } from '../../services/subscriptionService';
import type { Subscription, PlanType } from '../../types';

// ── Config plans alignée sur backend (basic / premium / family) ────────────────
const PLAN_COLORS: Record<string, string[]> = {
  free:    ['#9390AB', '#6B6880'],
  basic:   ['#3B82F6', '#6366F1'],
  premium: ['#7B3FF2', '#A855F7'],
  family:  ['#E0389A', '#F43F5E'],
};

const PLAN_LABELS: Record<string, string> = {
  free:    'Gratuit',
  basic:   'Basic',
  premium: 'Premium',
  family:  'Family',
};

const PLAN_PRICES: Record<string, string> = {
  free:    '0 €/mois',
  basic:   '5,99 €/mois',
  premium: '9,99 €/mois',
  family:  '14,99 €/mois',
};

const PLAN_FEATURES: Record<string, string[]> = {
  free:    ['480p', '1 écran', '1 profil', 'Sans téléchargement'],
  basic:   ['HD 720p', '1 écran', '1 profil', 'Sans téléchargement'],
  premium: ['Full HD 1080p', '2 écrans simultanés', '3 profils', '10 téléchargements'],
  family:  ['4K Ultra HD', '5 écrans simultanés', '6 profils', '30 téléchargements'],
};

const PAID_PLANS: PlanType[] = ['basic', 'premium', 'family'];

// 1 EUR = 200 coins (aligné sur le backend)
const PLAN_COINS: Record<string, number> = {
  basic:   Math.round(5.99  * 200),  // 1198
  premium: Math.round(9.99  * 200),  // 1998
  family:  Math.round(14.99 * 200),  // 2998
};

// ── Utilitaire date ────────────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const statusLabel = (s: string) => {
  switch (s) {
    case 'active':    return 'Actif';
    case 'trialing':  return 'Essai';
    case 'cancelled': return 'Résilié';
    case 'expired':   return 'Expiré';
    case 'past_due':  return 'Impayé';
    default:          return s;
  }
};

const statusColor = (s: string) => {
  switch (s) {
    case 'active':
    case 'trialing':  return '#10B981';
    case 'cancelled': return '#EF4444';
    case 'expired':   return '#9390AB';
    default:          return '#F59E0B';
  }
};

// ── Composant carte plan actif ─────────────────────────────────────────────────
const ActiveCard: React.FC<{
  sub: Subscription;
  cancelling: boolean;
  onCancel: () => void;
}> = ({ sub, cancelling, onCancel }) => {
  const plan = sub.plan as string;
  const gradColors = PLAN_COLORS[plan] ?? PLAN_COLORS.basic;
  const isCancelled = sub.status === 'cancelled';

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
        {/* En-tête plan */}
        <View style={s.cardTop}>
          <View>
            <Text style={s.cardLabel}>Plan actuel</Text>
            <Text style={s.cardPlan}>{PLAN_LABELS[plan] ?? plan}</Text>
            <Text style={s.cardPrice}>{PLAN_PRICES[plan] ?? ''}</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: isCancelled ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.22)' }]}>
            <Text style={s.statusBadgeText}>{statusLabel(sub.status)}</Text>
          </View>
        </View>

        {/* Features */}
        <View style={s.featuresWrap}>
          {(PLAN_FEATURES[plan] ?? []).map(f => (
            <View key={f} style={s.featureRow}>
              <Icon name="check-circle" size={13} color="rgba(255,255,255,0.9)" style={{ marginTop: 1 }} />
              <Text style={s.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Dates */}
        <View style={s.datesRow}>
          <View style={s.dateItem}>
            <Text style={s.dateLabel}>Début</Text>
            <Text style={s.dateValue}>{fmtDate(sub.current_period_start)}</Text>
          </View>
          <View style={s.dateSep} />
          <View style={s.dateItem}>
            <Text style={s.dateLabel}>{isCancelled ? 'Accès jusqu\'au' : 'Renouvellement'}</Text>
            <Text style={s.dateValue}>{fmtDate(sub.current_period_end)}</Text>
          </View>
        </View>

        {/* Téléchargements si plan le permet */}
        {(PLAN_FEATURES[plan]?.some(f => f.includes('téléchargement') && !f.includes('Sans'))) && (
          <View style={s.dlRow}>
            <Icon name="download" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={s.dlText}>
              {sub.downloads_used} téléchargements utilisés
            </Text>
          </View>
        )}

        {/* Bouton résiliation (uniquement si actif) */}
        {!isCancelled && (
          <TouchableOpacity onPress={onCancel} disabled={cancelling} style={s.cancelBtn}>
            {cancelling
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Icon name="x-circle" size={14} color="#fff" />
                  <Text style={s.cancelBtnText}>Résilier l'abonnement</Text>
                </>
            }
          </TouchableOpacity>
        )}

        {isCancelled && (
          <View style={s.cancelledNotice}>
            <Icon name="info" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={s.cancelledNoticeText}>
              Résilié — accès maintenu jusqu'au {fmtDate(sub.current_period_end)}
            </Text>
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
};

// ── Modal confirmation souscription ──────────────────────────────────────────
const ConfirmModal: React.FC<{
  visible: boolean;
  plan: PlanType | null;
  check: WalletCheck | null;
  confirming: boolean;
  onConfirm: () => void;
  onRecharge: () => void;
  onClose: () => void;
}> = ({ visible, plan, check, confirming, onConfirm, onRecharge, onClose }) => {
  const { theme } = useTheme();
  const { colors, fontSize } = theme;
  if (!plan || !check) return null;
  const grad = PLAN_COLORS[plan];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={confirming ? undefined : onClose}>
      <View style={s.modalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={[s.modalCard, { backgroundColor: colors.surface }]}>
          {/* Header plan */}
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.modalHeader}>
            <Text style={s.modalPlanName}>{PLAN_LABELS[plan]}</Text>
            <Text style={s.modalPlanPrice}>{PLAN_PRICES[plan]}</Text>
          </LinearGradient>

          {/* Solde wallet */}
          <View style={[s.walletRow, { borderColor: colors.divider }]}>
            <View style={s.walletRowLeft}>
              <Icon name="cpu" size={16} color={colors.textSecondary} />
              <Text style={[s.walletLabel, { color: colors.textSecondary }]}>Votre solde</Text>
            </View>
            <Text style={[s.walletBalance, { color: check.sufficient ? colors.textPrimary : '#EF4444' }]}>
              {check.balance.toLocaleString()} coins
            </Text>
          </View>

          <View style={[s.walletRow, { borderColor: colors.divider }]}>
            <View style={s.walletRowLeft}>
              <Icon name="minus-circle" size={16} color={colors.textSecondary} />
              <Text style={[s.walletLabel, { color: colors.textSecondary }]}>Coût abonnement</Text>
            </View>
            <Text style={[s.walletCost, { color: grad[0] }]}>
              -{check.coins_required.toLocaleString()} coins
            </Text>
          </View>

          {check.sufficient ? (
            <>
              <View style={[s.walletRow, { borderColor: colors.divider }]}>
                <View style={s.walletRowLeft}>
                  <Icon name="check-circle" size={16} color="#10B981" />
                  <Text style={[s.walletLabel, { color: colors.textSecondary }]}>Solde après</Text>
                </View>
                <Text style={[s.walletBalance, { color: '#10B981' }]}>
                  {(check.balance - check.coins_required).toLocaleString()} coins
                </Text>
              </View>

              <TouchableOpacity
                style={[s.confirmBtn, { backgroundColor: grad[0] }]}
                onPress={onConfirm}
                disabled={confirming}
              >
                {confirming
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.confirmBtnText}>Confirmer et s'abonner</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[s.insufficientBox, { backgroundColor: '#EF444415', borderColor: '#EF444430' }]}>
                <Icon name="alert-circle" size={15} color="#EF4444" />
                <Text style={s.insufficientText}>
                  Il vous manque {check.missing.toLocaleString()} coins pour souscrire à ce plan.
                </Text>
              </View>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: colors.primary }]} onPress={onRecharge} disabled={confirming}>
                <Icon name="plus-circle" size={16} color="#fff" />
                <Text style={s.confirmBtnText}>Recharger mon wallet</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={onClose} style={s.cancelLink} disabled={confirming}>
            <Text style={[s.cancelLinkText, { color: confirming ? colors.divider : colors.textTertiary }]}>Annuler</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ── Composant sélection de plan ───────────────────────────────────────────────
const PlanPicker: React.FC<{
  onSelect: (plan: PlanType) => void;
  loadingPlan: PlanType | null;
}> = ({ onSelect, loadingPlan }) => {
  const { theme } = useTheme();
  const { colors, fontSize } = theme;

  return (
    <Animated.View entering={FadeInDown.springify()} style={[s.noSubCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
      <Icon name="zap" size={32} color={colors.primary} />
      <Text style={[s.noSubTitle, { color: colors.textPrimary }]}>Choisissez votre plan</Text>
      <Text style={[s.noSubSub, { color: colors.textSecondary }]}>
        Accédez à tout le contenu FoliX sans limite. Paiement en coins.
      </Text>

      {PAID_PLANS.map((p, idx) => {
        const grad = PLAN_COLORS[p];
        return (
          <Animated.View key={p} entering={FadeInDown.delay(idx * 80).springify()} style={{ width: '100%' }}>
            <TouchableOpacity
              style={[s.planCard, { borderColor: grad[0] + '60', backgroundColor: grad[0] + '10' }]}
              activeOpacity={0.8}
              disabled={loadingPlan === p}
              onPress={() => onSelect(p)}
            >
              <View style={{ flex: 1 }}>
                <View style={s.planCardTop}>
                  <Text style={[s.planCardName, { color: grad[0] }]}>{PLAN_LABELS[p]}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[s.planCardPrice, { color: grad[0] }]}>{PLAN_PRICES[p]}</Text>
                    <Text style={[s.planCardCoins, { color: grad[0] + 'AA' }]}>
                      ({PLAN_COINS[p]} coins)
                    </Text>
                  </View>
                </View>
                <Text style={[s.planCardFeatures, { color: colors.textSecondary }]}>
                  {PLAN_FEATURES[p].join(' · ')}
                </Text>
              </View>
              {loadingPlan === p
                ? <ActivityIndicator size="small" color={grad[0]} />
                : <Icon name="chevron-right" size={18} color={grad[0]} />
              }
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
};

// ── Ecran principal ────────────────────────────────────────────────────────────
export const SubscriptionsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, fontSize } = theme;
  const navigation = useNavigation<any>();

  const [current,    setCurrent]    = useState<Subscription | null>(null);
  const [history,    setHistory]    = useState<Subscription[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Modal confirmation
  const [modalPlan,   setModalPlan]   = useState<PlanType | null>(null);
  const [walletCheck, setWalletCheck] = useState<WalletCheck | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PlanType | null>(null);
  const [confirming,  setConfirming]  = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [cur, hist] = await Promise.all([
        subscriptionService.getMyCurrent(),
        subscriptionService.getHistory(),
      ]);
      setCurrent(cur);
      setHistory(hist);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCancel = () => {
    Alert.alert(
      'Résilier l\'abonnement',
      'Vous garderez l\'accès jusqu\'à la fin de la période payée. Confirmer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Résilier', style: 'destructive', onPress: async () => {
          setCancelling(true);
          try {
            await subscriptionService.cancel();
            await load(true);
          } catch {
            Alert.alert('Erreur', 'Impossible de résilier. Réessayez plus tard.');
          } finally {
            setCancelling(false);
          }
        }},
      ],
    );
  };

  // Étape 1 : tap sur un plan → charger le wallet-check et ouvrir le modal
  const handleSelectPlan = useCallback(async (plan: PlanType) => {
    setLoadingPlan(plan);
    setModalPlan(plan);
    try {
      const check = await subscriptionService.walletCheck(plan);
      setWalletCheck(check);
    } catch {
      setModalPlan(null);
      Alert.alert('Erreur', 'Impossible de vérifier votre solde. Réessayez.');
    } finally {
      setLoadingPlan(null);
    }
  }, []);

  // Étape 2a : solde suffisant → débiter + activer
  const handleConfirmSubscribe = useCallback(async () => {
    if (!modalPlan) return;
    setConfirming(true);
    try {
      await subscriptionService.subscribeViaWallet(modalPlan);
      setModalPlan(null);
      setWalletCheck(null);
      await load(true);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail?.code === 'insufficient_coins') {
        // Ne devrait pas arriver (on a vérifié avant), mais on gère
        setWalletCheck(prev => prev ? { ...prev, sufficient: false, missing: detail.missing } : prev);
      } else {
        setModalPlan(null);
        Alert.alert('Erreur', 'Abonnement impossible. Réessayez plus tard.');
      }
    } finally {
      setConfirming(false);
    }
  }, [modalPlan, load]);

  // Étape 2b : solde insuffisant → aller recharger
  const handleRecharge = useCallback(() => {
    const missing = walletCheck?.missing ?? 0;
    setModalPlan(null);
    setWalletCheck(null);
    navigation.navigate('BuyCoins', {
      reason: `Il vous manque ${missing.toLocaleString()} coins pour souscrire`,
      missingCoins: missing,
      returnTo: 'Subscriptions',
    });
  }, [walletCheck, navigation]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppHeader title="Abonnement" variant="default" />
        <SkeletonSubscriptions />
      </View>
    );
  }

  // Historique = tout sauf l'abonnement actif courant
  const historyFiltered = current
    ? history.filter(h => h.id !== current.id)
    : history;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Abonnement" variant="default" />

      <ConfirmModal
        visible={modalPlan !== null && walletCheck !== null}
        plan={modalPlan}
        check={walletCheck}
        confirming={confirming}
        onConfirm={handleConfirmSubscribe}
        onRecharge={handleRecharge}
        onClose={() => { setModalPlan(null); setWalletCheck(null); }}
      />

      <FlatList
        data={historyFiltered}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Plan actif ou sélecteur */}
            {current ? (
              <ActiveCard sub={current} cancelling={cancelling} onCancel={handleCancel} />
            ) : (
              <PlanPicker onSelect={handleSelectPlan} loadingPlan={loadingPlan} />
            )}

            {/* Titre section historique */}
            {historyFiltered.length > 0 && (
              <Text style={[s.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
                Historique
              </Text>
            )}
          </>
        }
        renderItem={({ item, index }) => {
          const p = item.plan as string;
          const col = PLAN_COLORS[p]?.[0] ?? colors.primary;
          return (
            <Animated.View entering={FadeInDown.delay(index * 30).springify()}>
              <View style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <View style={[s.histDot, { backgroundColor: col }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: fontSize.sm }}>
                    {PLAN_LABELS[p] ?? p}
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: fontSize.xs, marginTop: 2 }}>
                    {fmtDate(item.current_period_start)} → {fmtDate(item.current_period_end)}
                  </Text>
                </View>
                <View style={[s.histBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <Text style={[s.histBadgeText, { color: statusColor(item.status) }]}>
                    {statusLabel(item.status)}
                  </Text>
                </View>
              </View>
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          current ? null : (
            <View style={[s.emptyHist, { borderColor: colors.divider }]}>
              <Icon name="clock" size={20} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: fontSize.sm, marginTop: 8 }}>
                Aucun historique
              </Text>
            </View>
          )
        }
      />
    </View>
  );
};

const s = StyleSheet.create({
  // Carte plan actif
  card:             { borderRadius: 18, padding: 20, gap: 0 },
  cardTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel:        { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2 },
  cardPlan:         { color: '#fff', fontSize: 24, fontWeight: '800' },
  cardPrice:        { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  statusBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText:  { color: '#fff', fontSize: 11, fontWeight: '700' },
  featuresWrap:     { marginTop: 16, gap: 7 },
  featureRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  featureText:      { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  datesRow:         { flexDirection: 'row', alignItems: 'center', marginTop: 18, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 10, padding: 12 },
  dateItem:         { flex: 1, alignItems: 'center' },
  dateLabel:        { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 3 },
  dateValue:        { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  dateSep:          { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  dlRow:            { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  dlText:           { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  cancelBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingVertical: 11 },
  cancelBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelledNotice:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 8, padding: 10 },
  cancelledNoticeText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, flex: 1 },

  // Sélecteur plan
  noSubCard:        { borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, gap: 12 },
  noSubTitle:       { fontSize: 20, fontWeight: '800', marginTop: 4 },
  noSubSub:         { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  planCard:         { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, padding: 14, gap: 12 },
  planCardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  planCardName:     { fontSize: 15, fontWeight: '800' },
  planCardPrice:    { fontSize: 13, fontWeight: '700' },
  planCardFeatures: { fontSize: 11, lineHeight: 16 },

  // Modal confirmation
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard:          { width: '100%', borderRadius: 20, overflow: 'hidden' },
  modalHeader:        { padding: 20, alignItems: 'center', gap: 4 },
  modalPlanName:      { color: '#fff', fontSize: 22, fontWeight: '800' },
  modalPlanPrice:     { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  walletRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  walletRowLeft:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletLabel:        { fontSize: 14 },
  walletBalance:      { fontSize: 15, fontWeight: '700' },
  walletCost:         { fontSize: 15, fontWeight: '700' },
  insufficientBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 16, padding: 12, borderRadius: 10, borderWidth: 1 },
  insufficientText:   { flex: 1, fontSize: 13, color: '#EF4444', lineHeight: 18 },
  confirmBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, borderRadius: 12, paddingVertical: 14 },
  confirmBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelLink:         { alignItems: 'center', paddingVertical: 14 },
  cancelLinkText:     { fontSize: 14 },
  planCardCoins:      { fontSize: 11 },

  // Historique
  sectionTitle:     { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  histRow:          { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  histDot:          { width: 8, height: 8, borderRadius: 4 },
  histBadge:        { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  histBadgeText:    { fontSize: 11, fontWeight: '700' },
  emptyHist:        { alignItems: 'center', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', padding: 24, marginTop: 8 },
});
