import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, ActivityIndicator, Image, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useTheme } from '../../hooks/useTheme';
import { apiClient, getAuthToken } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { API_BASE_URL } from '../../utils/constants';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TicketTier {
  key:   'simple' | 'vip' | 'vvip' | 'vvvip';
  label: string;
  icon:  string;
  color: string;
  price: number;
  sub?:  string;
}

interface Props {
  visible:      boolean;
  onClose:      () => void;
  onSuccess:    (ticket: any | null) => void;

  itemId:       string;
  title:        string;
  accessType:   'free' | 'ticket' | 'invite_only' | 'subscription' | 'ppv';
  ticketPrice:  number | null;   // gardé pour compat (tier simple)
  thumbnail?:   string | null;
  kind:         'event' | 'concert';
  onBuy:        (tierKey?: TicketTier['key']) => Promise<any>;

  // Nouveaux: liste des tiers + tier sélectionné depuis l'écran de détail
  tiers?:          TicketTier[];
  selectedTierKey?: TicketTier['key'];
}

// ── Constantes ──────────────────────────────────────────────────────────────

const FEES_RATE    = 0.10;
const EUR_TO_COINS = 200;

const coinsToEur = (c: number) => (c / 100) * 0.5;
const eurToCoins = (e: number) => Math.ceil(e * EUR_TO_COINS);
const fmtCoins   = (c: number) => c.toLocaleString('fr-FR');
const fmtEur     = (e: number) => e.toFixed(2).replace('.', ',') + ' €';

const TIER_ICONS: Record<string, string> = {
  simple: 'tag', vip: 'star', vvip: 'award', vvvip: 'zap',
};
const TIER_COLORS: Record<string, string> = {
  simple: '#7B3FF2', vip: '#F59E0B', vvip: '#8B5CF6', vvvip: '#EF4444',
};

// ── Composant ──────────────────────────────────────────────────────────────

export const TicketPaymentSheet: React.FC<Props> = ({
  visible, onClose, onSuccess,
  itemId, title, accessType, ticketPrice, thumbnail, kind, onBuy,
  tiers, selectedTierKey,
}) => {
  const { theme: { colors } } = useTheme();
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const slideY     = useRef(new Animated.Value(600)).current;

  const [balance,    setBalance]    = useState<number | null>(null);
  const [loadingBal, setLoadingBal] = useState(false);
  const [buying,     setBuying]     = useState(false);
  const [step,       setStep]       = useState<'confirm' | 'processing' | 'success' | 'insufficient'>('confirm');
  const [activeTierKey, setActiveTierKey] = useState<TicketTier['key']>('simple');

  // Tier actif résolu
  const availableTiers: TicketTier[] = tiers && tiers.length > 0 ? tiers : (
    ticketPrice != null ? [{ key: 'simple', label: 'Simple', icon: 'tag', color: '#7B3FF2', price: ticketPrice, sub: 'Accès standard' }] : []
  );
  const activeTier = availableTiers.find(t => t.key === activeTierKey) ?? availableTiers[0] ?? null;

  // ── Slide animation + reset à chaque ouverture ────────────────────────
  useEffect(() => {
    if (visible) {
      setStep('confirm');
      setBalance(null);
      setBuying(false);
      setActiveTierKey(selectedTierKey ?? availableTiers[0]?.key ?? 'simple');
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
  const isPaid     = accessType === 'ticket' || accessType === 'ppv';
  const priceEur   = activeTier?.price ?? 0;
  const feesEur    = Math.round(priceEur * FEES_RATE * 100) / 100;
  const totalEur   = priceEur + feesEur;
  const priceCoins = eurToCoins(totalEur);
  const hasEnough  = balance !== null && balance >= priceCoins;
  const coinsAfter = balance !== null ? balance - priceCoins : null;
  const missing    = balance !== null ? Math.max(0, priceCoins - balance) : 0;
  const missingEur = coinsToEur(missing);

  // ── Téléchargement PDF billet ───────────────────────────────────────────
  const downloadTicketPdf = async () => {
    try {
      const token = getAuthToken();
      const url   = kind === 'event'
        ? `${API_BASE_URL}${Endpoints.events.myTicketPdf(itemId)}`
        : `${API_BASE_URL}${Endpoints.concerts.myTicketPdf(itemId)}`;
      const dest  = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/billet_${itemId.slice(0, 8)}.pdf`;
      const res   = await ReactNativeBlobUtil.config({ path: dest })
        .fetch('GET', url, token ? { Authorization: `Bearer ${token}` } : {});
      if (Platform.OS === 'ios') {
        ReactNativeBlobUtil.ios.presentOptionsMenu(res.path());
      } else {
        await ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/pdf');
      }
    } catch { /**/ }
  };

  // ── Paiement ────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (isPaid && balance === null) return;
    if (isPaid && !hasEnough) { setStep('insufficient'); return; }
    setBuying(true);
    setStep('processing');
    try {
      const ticket = await onBuy(activeTier?.key);
      setStep('success');
      downloadTicketPdf();
      setTimeout(() => { onSuccess(ticket ?? null); onClose(); }, 1800);
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
      <TouchableOpacity style={sh.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[sh.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16, transform: [{ translateY: slideY }] }]}>
        <View style={[sh.handle, { backgroundColor: colors.divider }]} />

        {/* ── Header événement ── */}
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
              <View style={[sh.badge, { backgroundColor: colors.primary + '20' }]}>
                <Icon name={kind === 'concert' ? 'music' : 'calendar'} size={10} color={colors.primary} />
                <Text style={[sh.badgeTxt, { color: colors.primary }]}>{kind === 'concert' ? 'Concert' : 'Événement'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[sh.sep, { backgroundColor: colors.divider }]} />

        {(step === 'confirm' || step === 'insufficient') && (
          <>
            {/* ── Sélecteur de tier (si plusieurs) ── */}
            {isPaid && availableTiers.length > 1 && (
              <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
                <Text style={[sh.sectionLabel, { color: colors.textTertiary }]}>Catégorie</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {availableTiers.map(tier => {
                    const active = activeTierKey === tier.key;
                    return (
                      <TouchableOpacity
                        key={tier.key}
                        onPress={() => { setActiveTierKey(tier.key); setStep('confirm'); }}
                        activeOpacity={0.75}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                          borderWidth: 1.5,
                          backgroundColor: active ? tier.color + '15' : colors.backgroundSecondary,
                          borderColor: active ? tier.color : colors.border,
                        }}
                      >
                        <Icon name={tier.icon} size={13} color={active ? tier.color : colors.textTertiary} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: active ? tier.color : colors.textSecondary }}>
                          {tier.label}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? tier.color : colors.textTertiary }}>
                          {fmtEur(tier.price)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Gratuit ── */}
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

            {/* ── Payant ── */}
            {isPaid && activeTier && (
              <View style={sh.walletBlock}>
                {/* Solde wallet */}
                <View style={[sh.balanceRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[sh.balLabel, { color: colors.textTertiary }]}>Ton wallet</Text>
                    {loadingBal ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4 }} />
                    ) : (
                      <Text style={[sh.balValue, { color: colors.textPrimary }]}>
                        {fmtCoins(balance ?? 0)}{' '}
                        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textTertiary }}>coins</Text>
                        {'  '}
                        <Text style={{ fontSize: 13, color: colors.textTertiary }}>≈ {fmtEur(coinsToEur(balance ?? 0))}</Text>
                      </Text>
                    )}
                  </View>
                  <Icon name="credit-card" size={20} color={colors.primary} />
                </View>

                {/* Récap prix */}
                <View style={[sh.recapBox, { backgroundColor: colors.backgroundSecondary, borderColor: activeTier.color + '30' }]}>
                  {/* Tier sélectionné */}
                  <View style={[sh.recapTierRow, { borderBottomColor: colors.divider }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: activeTier.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={activeTier.icon} size={14} color={activeTier.color} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: activeTier.color }}>{activeTier.label.toUpperCase()}</Text>
                        {activeTier.sub && <Text style={{ fontSize: 10, color: colors.textTertiary }}>{activeTier.sub}</Text>}
                      </View>
                    </View>
                  </View>

                  {/* Lignes de décomposition */}
                  <View style={sh.priceRow}>
                    <Text style={[sh.priceLabel, { color: colors.textSecondary }]}>Prix du billet</Text>
                    <Text style={[sh.priceVal, { color: colors.textPrimary }]}>{fmtEur(priceEur)}</Text>
                  </View>
                  <View style={sh.priceRow}>
                    <Text style={[sh.priceLabel, { color: colors.textSecondary }]}>Frais de service (10%)</Text>
                    <Text style={[sh.priceVal, { color: colors.textSecondary }]}>{fmtEur(feesEur)}</Text>
                  </View>
                  <View style={[sh.priceRow, sh.totalRow, { borderTopColor: colors.divider }]}>
                    <Text style={[sh.totalLabel, { color: colors.textPrimary }]}>Total</Text>
                    <Text style={[sh.totalVal, { color: activeTier.color }]}>{fmtEur(totalEur)}</Text>
                  </View>
                  <View style={[sh.priceRow, { marginTop: 2 }]}>
                    <Text style={[sh.priceLabel, { color: colors.textTertiary }]}>Équivalent coins</Text>
                    <Text style={[sh.priceVal, { color: colors.primary, fontWeight: '700' }]}>{fmtCoins(priceCoins)} coins</Text>
                  </View>
                  {!loadingBal && coinsAfter !== null && (
                    <View style={[sh.priceRow, { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, marginTop: 4 }]}>
                      <Text style={[sh.priceLabel, { color: colors.textSecondary }]}>Solde après</Text>
                      <Text style={[sh.priceVal, { color: hasEnough ? '#10B981' : '#EF4444', fontWeight: '700' }]}>
                        {hasEnough ? `${fmtCoins(coinsAfter)} coins` : 'Insuffisant'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Alerte insuffisant */}
                {step === 'insufficient' && (
                  <View style={[sh.insuffBanner, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}>
                    <Icon name="alert-circle" size={18} color="#EF4444" />
                    <View style={{ flex: 1 }}>
                      <Text style={sh.insuffTitle}>Pas assez de coins</Text>
                      <Text style={sh.insuffSub}>
                        Il te manque {fmtCoins(missing)} coins (≈ {fmtEur(missingEur)}). Recharge en 30 secondes !
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── Boutons ── */}
            <View style={sh.btnRow}>
              <TouchableOpacity style={[sh.btnCancel, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={[sh.btnCancelTxt, { color: colors.textSecondary }]}>Pas maintenant</Text>
              </TouchableOpacity>

              {step === 'insufficient' ? (
                <TouchableOpacity style={sh.btnMain} onPress={goRecharge} activeOpacity={0.85}>
                  <LinearGradient colors={['#F59E0B', '#EF4444']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sh.btnGradient}>
                    <Icon name="zap" size={16} color="#fff" />
                    <Text style={sh.btnTxt}>Recharger mon wallet</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={sh.btnMain}
                  onPress={handleConfirm}
                  disabled={loadingBal || buying || (isPaid && balance === null)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={activeTier ? [activeTier.color, activeTier.color + 'BB'] : [colors.gradientStart ?? colors.primary, colors.gradientEnd ?? colors.primary + 'BB']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={sh.btnGradient}
                  >
                    {buying ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Icon name={!isPaid ? 'check-circle' : 'lock'} size={16} color="#fff" />
                        <Text style={sh.btnTxt}>
                          {!isPaid
                            ? 'Je réserve ma place !'
                            : `Payer — ${fmtCoins(priceCoins)} coins`}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* ── Processing ── */}
        {step === 'processing' && (
          <View style={sh.centerStep}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[sh.stepTitle, { color: colors.textPrimary }]}>On s'occupe de tout...</Text>
            <Text style={[sh.stepSub, { color: colors.textTertiary }]}>Ta place est presque sécurisée</Text>
          </View>
        )}

        {/* ── Succès ── */}
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
                ? "C'est officiel, on se voit là-bas !"
                : "Ton billet est dans ton profil. Prêt pour vivre quelque chose d'exceptionnel ?"}
            </Text>
          </View>
        )}

      </Animated.View>
    </Modal>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────

const sh = StyleSheet.create({
  backdrop:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:       { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 14 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sep:         { height: StyleSheet.hairlineWidth, marginVertical: 12, marginHorizontal: 16 },
  sectionLabel:{ fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },

  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16 },
  thumb:       { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  eventTitle:  { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeTxt:    { fontSize: 11, fontWeight: '700' },

  freeBlock:   { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 24, gap: 8 },
  freeIcon:    { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  freeTitle:   { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  freeSub:     { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  walletBlock: { paddingHorizontal: 16, gap: 10 },
  balanceRow:  { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, gap: 10 },
  balLabel:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  balValue:    { fontSize: 20, fontWeight: '800' },

  recapBox:        { borderRadius: 14, borderWidth: 1.5, overflow: 'hidden' },
  recapTierRow:    { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  priceRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 5 },
  priceLabel:      { fontSize: 13 },
  priceVal:        { fontSize: 13, fontWeight: '600' },
  totalRow:        { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 2 },
  totalLabel:      { fontSize: 14, fontWeight: '800' },
  totalVal:        { fontSize: 16, fontWeight: '900' },

  insuffBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  insuffTitle:     { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  insuffSub:       { color: '#EF4444', fontSize: 12, marginTop: 2, lineHeight: 16, opacity: 0.85 },

  btnRow:          { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  btnCancel:       { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnCancelTxt:    { fontSize: 14, fontWeight: '600' },
  btnMain:         { flex: 2, borderRadius: 12, overflow: 'hidden' },
  btnGradient:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  btnTxt:          { color: '#fff', fontSize: 14, fontWeight: '800' },

  centerStep:      { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 10 },
  successIcon:     { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepTitle:       { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  stepSub:         { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
