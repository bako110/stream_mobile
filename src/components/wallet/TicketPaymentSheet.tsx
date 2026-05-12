import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, ActivityIndicator, Image, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  visible:     boolean;
  onClose:     () => void;
  onSuccess:   (ticket: any | null) => void;

  // Infos de l'événement / concert
  title:       string;
  accessType:  'free' | 'ticket' | 'invite_only' | 'subscription' | 'ppv';
  ticketPrice: number | null;   // en euros (ex: 5.00)
  thumbnail?:  string | null;
  kind:        'event' | 'concert';

  // Fonction qui appelle le vrai endpoint d'achat — retourne le ticket si dispo
  onBuy:       () => Promise<any>;
}

// 1 coin = 0.005 € → 1 € = 200 coins
const EUR_TO_COINS = 200;
const coinsToEur   = (c: number | null | undefined) => (((Number(c) || 0) / 100) * 0.5);
const eurToCoins   = (e: number | null | undefined) => Math.ceil((Number(e) || 0) * EUR_TO_COINS);
const fmtCoins     = (c: number | null | undefined) => (Number(c) || 0).toLocaleString('fr-FR');
const fmtEur       = (e: number | null | undefined) => (Number(e) || 0).toFixed(2).replace('.', ',') + ' €';

// ── Composant ──────────────────────────────────────────────────────────────

export const TicketPaymentSheet: React.FC<Props> = ({
  visible, onClose, onSuccess,
  title, accessType, ticketPrice, thumbnail, kind, onBuy,
}) => {
  const { theme: { colors } } = useTheme();
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const slideY     = useRef(new Animated.Value(600)).current;

  const [balance,    setBalance]    = useState<number | null>(null);  // coins
  const [loadingBal, setLoadingBal] = useState(false);
  const [buying,     setBuying]     = useState(false);
  const [step,       setStep]       = useState<'confirm' | 'processing' | 'success' | 'insufficient'>('confirm');

  // ── Slide animation + reset à chaque ouverture ────────────────────────
  useEffect(() => {
    if (visible) {
      setStep('confirm');
      setBalance(null);  // reset pour forcer un re-fetch propre
      setBuying(false);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }).start();
      if (accessType === 'ticket' || accessType === 'ppv') fetchBalance();
    } else {
      Animated.timing(slideY, { toValue: 600, useNativeDriver: true, duration: 220 }).start();
    }
  }, [visible]);

  const fetchBalance = async () => {
    setLoadingBal(true);
    try {
      const res = await apiClient.get<{ coins_balance: number }>(Endpoints.wallet.balance);
      setBalance(res.data?.coins_balance ?? 0);
    } catch {
      setBalance(0);
    } finally {
      setLoadingBal(false);
    }
  };

  // ── Calculs ────────────────────────────────────────────────────────────
  const isPaid       = accessType === 'ticket' || accessType === 'ppv';
  const priceEur     = ticketPrice ?? 0;
  const priceCoins   = eurToCoins(priceEur);
  const hasEnough    = balance !== null && balance >= priceCoins;
  const coinsAfter   = balance !== null ? balance - priceCoins : null;
  const missing      = balance !== null ? Math.max(0, priceCoins - balance) : 0;
  const missingEur   = coinsToEur(missing);

  // ── Paiement ────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    // Solde pas encore chargé — attendre
    if (isPaid && balance === null) return;
    if (isPaid && !hasEnough) {
      setStep('insufficient');
      return;
    }
    setBuying(true);
    setStep('processing');
    try {
      const ticket = await onBuy();
      setStep('success');
      setTimeout(() => {
        onSuccess(ticket ?? null);
        onClose();
      }, 1800);
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('déjà inscrit') || msg.includes('already')) {
        setStep('success');
        setTimeout(() => { onSuccess(null); onClose(); }, 1200);
      } else {
        setStep('confirm');
      }
    } finally {
      setBuying(false);
    }
  };

  const goRecharge = () => {
    onClose();
    navigation.navigate('BuyCoins', { neededCoins: missing, neededEur: missingEur });
  };

  // ── Rendu ────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>

      {/* Fond */}
      <TouchableOpacity style={sh.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[sh.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16, transform: [{ translateY: slideY }] }]}>

        {/* Poignée */}
        <View style={[sh.handle, { backgroundColor: colors.divider }]} />

        {/* ── En-tête événement ── */}
        <View style={sh.header}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={sh.thumb} />
          ) : (
            <View style={[sh.thumb, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name={kind === 'concert' ? 'music' : 'calendar'} size={22} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[sh.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <View style={[sh.kindBadge, { backgroundColor: colors.primary + '20' }]}>
                <Icon name={kind === 'concert' ? 'music' : 'calendar'} size={10} color={colors.primary} />
                <Text style={[sh.kindTxt, { color: colors.primary }]}>{kind === 'concert' ? 'Concert' : 'Événement'}</Text>
              </View>
              {isPaid && (
                <View style={[sh.kindBadge, { backgroundColor: '#F59E0B20' }]}>
                  <Icon name="tag" size={10} color="#F59E0B" />
                  <Text style={[sh.kindTxt, { color: '#F59E0B' }]}>{fmtEur(priceEur)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={[sh.sep, { backgroundColor: colors.divider }]} />

        {/* ── Step : Confirmation ── */}
        {(step === 'confirm' || step === 'insufficient') && (
          <>
            {/* Gratuit */}
            {!isPaid && (
              <View style={sh.freeBlock}>
                <View style={[sh.freeIcon, { backgroundColor: '#10B98120' }]}>
                  <Icon name="check-circle" size={28} color="#10B981" />
                </View>
                <Text style={[sh.freeTitle, { color: colors.textPrimary }]}>C'est gratuit, fonce !</Text>
                <Text style={[sh.freeSub, { color: colors.textTertiary }]}>
                  Une place t'attend — confirme maintenant avant qu'elles partent.
                </Text>
              </View>
            )}

            {/* Payant */}
            {isPaid && (
              <View style={sh.walletBlock}>
                {/* Solde actuel */}
                <View style={[sh.balanceRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[sh.balLabel, { color: colors.textTertiary }]}>Ton wallet</Text>
                    {loadingBal ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4 }} />
                    ) : (
                      <Text style={[sh.balValue, { color: colors.textPrimary }]}>
                        {fmtCoins(balance ?? 0)} <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textTertiary }}>coins</Text>
                        {'  '}
                        <Text style={{ fontSize: 13, color: colors.textTertiary }}>≈ {fmtEur(coinsToEur(balance ?? 0))}</Text>
                      </Text>
                    )}
                  </View>
                  <Icon name="credit-card" size={20} color={colors.primary} />
                </View>

                {/* Décomposition prix */}
                <View style={sh.priceBreak}>
                  <View style={sh.priceRow}>
                    <Text style={[sh.priceLabel, { color: colors.textSecondary }]}>Prix du billet</Text>
                    <Text style={[sh.priceVal, { color: colors.textPrimary }]}>{fmtEur(priceEur)}</Text>
                  </View>
                  <View style={sh.priceRow}>
                    <Text style={[sh.priceLabel, { color: colors.textSecondary }]}>Équivalent coins</Text>
                    <Text style={[sh.priceVal, { color: colors.primary, fontWeight: '700' }]}>{fmtCoins(priceCoins)} coins</Text>
                  </View>
                  {!loadingBal && coinsAfter !== null && (
                    <View style={[sh.priceRow, { marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }]}>
                      <Text style={[sh.priceLabel, { color: colors.textSecondary }]}>Solde après</Text>
                      <Text style={[sh.priceVal, { color: hasEnough ? '#10B981' : '#EF4444', fontWeight: '700' }]}>
                        {hasEnough ? `${fmtCoins(coinsAfter)} coins` : 'Insuffisant'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Solde insuffisant */}
                {step === 'insufficient' && (
                  <View style={[sh.insufficientBanner, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}>
                    <Icon name="alert-circle" size={18} color="#EF4444" />
                    <View style={{ flex: 1 }}>
                      <Text style={sh.insuffTitle}>Pas assez de coins</Text>
                      <Text style={sh.insuffSub}>
                        Il te manque {fmtCoins(missing)} coins (≈ {fmtEur(missingEur)}). Recharge en 30 secondes et ne rate pas cet événement !
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Boutons */}
            <View style={sh.btnRow}>
              <TouchableOpacity
                style={[sh.btnCancel, { borderColor: colors.border }]}
                onPress={onClose}
              >
                <Text style={[sh.btnCancelTxt, { color: colors.textSecondary }]}>Pas maintenant</Text>
              </TouchableOpacity>

              {step === 'insufficient' ? (
                <TouchableOpacity style={sh.btnRecharge} onPress={goRecharge} activeOpacity={0.85}>
                  <LinearGradient colors={['#F59E0B', '#EF4444']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sh.btnGradient}>
                    <Icon name="zap" size={16} color="#fff" />
                    <Text style={sh.btnTxt}>Recharger mon wallet</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={sh.btnConfirm}
                  onPress={handleConfirm}
                  disabled={loadingBal || buying || (isPaid && balance === null)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[colors.gradientStart ?? colors.primary, colors.gradientEnd ?? colors.primary + 'BB']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={sh.btnGradient}
                  >
                    {buying ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Icon name={!isPaid ? 'check-circle' : 'lock'} size={16} color="#fff" />
                        <Text style={sh.btnTxt}>
                          {!isPaid ? 'Je réserve ma place !' : `Obtenir mon billet — ${fmtCoins(priceCoins)} coins`}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* ── Step : Processing ── */}
        {step === 'processing' && (
          <View style={sh.centerStep}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[sh.stepTitle, { color: colors.textPrimary }]}>On s'occupe de tout...</Text>
            <Text style={[sh.stepSub, { color: colors.textTertiary }]}>Ta place est presque sécurisée, reste avec nous</Text>
          </View>
        )}

        {/* ── Step : Succès ── */}
        {step === 'success' && (
          <View style={sh.centerStep}>
            <View style={[sh.successIcon, { backgroundColor: '#10B98120' }]}>
              <Icon name="check" size={36} color="#10B981" />
            </View>
            <Text style={[sh.stepTitle, { color: colors.textPrimary }]}>
              {!isPaid ? 'Place réservée !' : 'Billet dans ta poche !'}
            </Text>
            <Text style={[sh.stepSub, { color: colors.textTertiary }]}>
              {!isPaid
                ? 'C\'est officiel, on se voit là-bas ! Prépare-toi.'
                : 'Ton billet est dans ton profil. Prêt pour vivre quelque chose d\'exceptionnel ?'}
            </Text>
          </View>
        )}

      </Animated.View>
    </Modal>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────

const sh = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 14,
  },
  handle:  { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sep:     { height: StyleSheet.hairlineWidth, marginVertical: 12, marginHorizontal: 16 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16 },
  thumb:       { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  eventTitle:  { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  kindBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  kindTxt:     { fontSize: 11, fontWeight: '700' },

  // Gratuit
  freeBlock:  { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 24, gap: 8 },
  freeIcon:   { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  freeTitle:  { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  freeSub:    { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Wallet payant
  walletBlock: { paddingHorizontal: 16, gap: 12 },
  balanceRow:  { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, gap: 10 },
  balLabel:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  balValue:    { fontSize: 20, fontWeight: '800' },

  priceBreak:  { backgroundColor: 'transparent', gap: 6 },
  priceRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel:  { fontSize: 13 },
  priceVal:    { fontSize: 13, fontWeight: '600' },

  // Insuffisant
  insufficientBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  insuffTitle: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  insuffSub:   { color: '#EF4444', fontSize: 12, marginTop: 2, lineHeight: 16, opacity: 0.85 },

  // Boutons
  btnRow:      { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  btnCancel:   { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnCancelTxt:{ fontSize: 14, fontWeight: '600' },
  btnConfirm:  { flex: 2, borderRadius: 12, overflow: 'hidden' },
  btnRecharge: { flex: 2, borderRadius: 12, overflow: 'hidden' },
  btnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  btnTxt:      { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Steps centrés
  centerStep:  { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 10 },
  successIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepTitle:   { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  stepSub:     { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
