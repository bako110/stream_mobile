import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, StatusBar, ActivityIndicator,
  Animated, Alert, Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

// ── Types ──────────────────────────────────────────────────────────────────

type BoostTarget = 'followers' | 'profile_views' | 'content_reach' | 'reel_views';

interface BoostOption {
  id: string;
  target: BoostTarget;
  label: string;
  description: string;
  icon: string;
  iconLib: 'feather' | 'mci';
  gradient: [string, string];
  tiers: BoostTier[];
}

interface BoostTier {
  id: string;
  label: string;
  quantity: string;
  duration: string;
  coins: number;
  popular?: boolean;
}

interface ActiveBoost {
  id: string;
  target: BoostTarget;
  label: string;
  quantity: string;
  expires_at: string;
  progress: number;
}

// ── Config des offres de boost ──────────────────────────────────────────────

const BOOST_OPTIONS: BoostOption[] = [
  {
    id: 'followers',
    target: 'followers',
    label: 'Abonnés',
    description: 'Gagne de nouveaux abonnés réels sur ton profil',
    icon: 'users',
    iconLib: 'feather',
    gradient: ['#7B3FF2', '#E0389A'],
    tiers: [
      { id: 'f1', label: 'Starter',  quantity: '+50 abonnés',   duration: '3 jours',   coins: 200 },
      { id: 'f2', label: 'Growth',   quantity: '+150 abonnés',  duration: '7 jours',   coins: 500, popular: true },
      { id: 'f3', label: 'Viral',    quantity: '+500 abonnés',  duration: '14 jours',  coins: 1500 },
      { id: 'f4', label: 'Mega',     quantity: '+2000 abonnés', duration: '30 jours',  coins: 5000 },
    ],
  },
  {
    id: 'profile_views',
    target: 'profile_views',
    label: 'Vues de profil',
    description: 'Booste la visibilité de ton profil dans les suggestions',
    icon: 'eye',
    iconLib: 'feather',
    gradient: ['#FF8C00', '#FF4500'],
    tiers: [
      { id: 'p1', label: 'Starter',  quantity: '500 vues',    duration: '2 jours',  coins: 150 },
      { id: 'p2', label: 'Growth',   quantity: '2000 vues',   duration: '5 jours',  coins: 400, popular: true },
      { id: 'p3', label: 'Viral',    quantity: '10K vues',    duration: '10 jours', coins: 1200 },
      { id: 'p4', label: 'Mega',     quantity: '50K vues',    duration: '21 jours', coins: 4000 },
    ],
  },
  {
    id: 'content_reach',
    target: 'content_reach',
    label: 'Portée du contenu',
    description: 'Augmente la portée de tes posts, stories et reels',
    icon: 'trending-up',
    iconLib: 'feather',
    gradient: ['#10B981', '#06B6D4'],
    tiers: [
      { id: 'c1', label: 'Starter',  quantity: '1K impressions',  duration: '3 jours',   coins: 250 },
      { id: 'c2', label: 'Growth',   quantity: '5K impressions',  duration: '7 jours',   coins: 700, popular: true },
      { id: 'c3', label: 'Viral',    quantity: '20K impressions', duration: '14 jours',  coins: 2000 },
      { id: 'c4', label: 'Mega',     quantity: '100K impressions',duration: '30 jours',  coins: 7000 },
    ],
  },
  {
    id: 'reel_views',
    target: 'reel_views',
    label: 'Vues de Reels',
    description: 'Propulse tes reels dans le feed des autres utilisateurs',
    icon: 'play-circle',
    iconLib: 'feather',
    gradient: ['#E0389A', '#FF8C00'],
    tiers: [
      { id: 'r1', label: 'Starter',  quantity: '1K vues',    duration: '2 jours',  coins: 200 },
      { id: 'r2', label: 'Growth',   quantity: '5K vues',    duration: '5 jours',  coins: 600, popular: true },
      { id: 'r3', label: 'Viral',    quantity: '25K vues',   duration: '10 jours', coins: 2000 },
      { id: 'r4', label: 'Mega',     quantity: '100K vues',  duration: '20 jours', coins: 6000 },
    ],
  },
];

// ── Composant TierCard ──────────────────────────────────────────────────────

const TierCard: React.FC<{
  tier: BoostTier;
  selected: boolean;
  gradient: [string, string];
  colors: any;
  onSelect: () => void;
}> = ({ tier, selected, gradient, colors, onSelect }) => (
  <TouchableOpacity onPress={onSelect} activeOpacity={0.8} style={{ flex: 1, minWidth: '45%' }}>
    {selected ? (
      <LinearGradient colors={gradient} style={[tc.card, tc.selected]}>
        {tier.popular && <View style={tc.badge}><Text style={tc.badgeText}>POPULAIRE</Text></View>}
        <Text style={[tc.tierLabel, { color: 'rgba(255,255,255,0.8)' }]}>{tier.label}</Text>
        <Text style={[tc.qty, { color: '#fff' }]}>{tier.quantity}</Text>
        <Text style={[tc.dur, { color: 'rgba(255,255,255,0.75)' }]}>{tier.duration}</Text>
        <View style={tc.priceRow}>
          <Text style={tc.coinIcon}>🪙</Text>
          <Text style={[tc.price, { color: '#fff' }]}>{tier.coins.toLocaleString('fr-FR')}</Text>
        </View>
      </LinearGradient>
    ) : (
      <View style={[tc.card, { backgroundColor: colors.surface, borderColor: tier.popular ? gradient[0] : colors.border }]}>
        {tier.popular && (
          <View style={[tc.badge, { backgroundColor: gradient[0] }]}>
            <Text style={tc.badgeText}>POPULAIRE</Text>
          </View>
        )}
        <Text style={[tc.tierLabel, { color: colors.textSecondary }]}>{tier.label}</Text>
        <Text style={[tc.qty, { color: colors.textPrimary }]}>{tier.quantity}</Text>
        <Text style={[tc.dur, { color: colors.textTertiary }]}>{tier.duration}</Text>
        <View style={tc.priceRow}>
          <Text style={tc.coinIcon}>🪙</Text>
          <Text style={[tc.price, { color: gradient[0] }]}>{tier.coins.toLocaleString('fr-FR')}</Text>
        </View>
      </View>
    )}
  </TouchableOpacity>
);

const tc = StyleSheet.create({
  card:      { borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1.5, minHeight: 130, justifyContent: 'center', position: 'relative' },
  selected:  { borderColor: 'transparent', elevation: 8, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  badge:     { position: 'absolute', top: -10, backgroundColor: '#7B3FF2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },
  tierLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  qty:       { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  dur:       { fontSize: 11, marginTop: 2 },
  priceRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  coinIcon:  { fontSize: 14 },
  price:     { fontSize: 16, fontWeight: '800' },
});

// ── BoostScreen ─────────────────────────────────────────────────────────────

export default function BoostScreen() {
  const { theme: { colors } } = useTheme();
  const navigation = useNavigation<any>();

  const [balance,      setBalance]      = useState<number>(0);
  const [activeOption, setActiveOption] = useState<BoostOption>(BOOST_OPTIONS[0]);
  const [selectedTier, setSelectedTier] = useState<BoostTier | null>(null);
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoost[]>([]);
  const [loadingBoosts, setLoadingBoosts] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [purchasing,   setPurchasing]   = useState(false);
  const [successAnim]                   = useState(new Animated.Value(0));

  useEffect(() => {
    // Charger le solde
    apiClient.get<{ coins_balance: number }>(Endpoints.wallet.balance)
      .then(r => setBalance(r.data?.coins_balance ?? 0))
      .catch(() => {});

    // Charger les boosts actifs
    apiClient.get<ActiveBoost[]>(Endpoints.wallet.boostsActive)
      .then(r => setActiveBoosts(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoadingBoosts(false));
  }, []);

  const handleBuy = () => {
    if (!selectedTier) return;
    if (balance < selectedTier.coins) {
      Alert.alert(
        'Solde insuffisant',
        `Il te manque ${(selectedTier.coins - balance).toLocaleString('fr-FR')} coins.\nAchète des coins pour continuer.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Acheter des coins', onPress: () => { setModalVisible(false); navigation.navigate('BuyCoins'); } },
        ],
      );
      return;
    }
    setModalVisible(true);
  };

  const confirmBoost = async () => {
    if (!selectedTier) return;
    setPurchasing(true);
    try {
      await apiClient.post(Endpoints.wallet.boostsPurchase, {
        boost_option_id: activeOption.id,
        tier_id: selectedTier.id,
        coins_amount: selectedTier.coins,
      });
      setBalance(prev => prev - selectedTier.coins);
      setModalVisible(false);

      // Animation succès
      Animated.sequence([
        Animated.timing(successAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();

      setSelectedTier(null);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? e?.message ?? 'Boost non disponible pour le moment.';
      Alert.alert('Erreur', detail);
    } finally {
      setPurchasing(false);
    }
  };

  const successOpacity = successAnim;
  const successScale   = successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });

  return (
    <View style={[bs.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <LinearGradient
        colors={['#7B3FF2', '#E0389A']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={bs.headerGrad}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={bs.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={bs.headerTitle}>Booster mon compte</Text>
          <Text style={bs.headerSub}>Abonnés · Vues · Portée · Reels</Text>
        </View>
        <View style={bs.balancePill}>
          <Text style={bs.balanceText}>{balance.toLocaleString('fr-FR')} 🪙</Text>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={bs.scroll}>

        {/* Boosts actifs */}
        {activeBoosts.length > 0 && (
          <View style={[bs.activeSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={bs.activeTitleRow}>
              <Icon name="zap" size={15} color="#F59E0B" />
              <Text style={[bs.activeSectionTitle, { color: colors.textPrimary }]}>Boosts actifs</Text>
            </View>
            {activeBoosts.map(boost => (
              <View key={boost.id} style={[bs.activeBoostRow, { borderColor: colors.divider }]}>
                <Icon name="trending-up" size={16} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[bs.activeBoostLabel, { color: colors.textPrimary }]}>{boost.label} — {boost.quantity}</Text>
                  <Text style={[bs.activeBoostExpiry, { color: colors.textTertiary }]}>
                    Expire le {new Date(boost.expires_at).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
                <View style={bs.progressWrap}>
                  <View style={[bs.progressBg, { backgroundColor: colors.border }]}>
                    <View style={[bs.progressFill, { width: `${boost.progress * 100}%` as any, backgroundColor: '#10B981' }]} />
                  </View>
                  <Text style={[bs.progressPct, { color: colors.textTertiary }]}>{Math.round(boost.progress * 100)}%</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Sélecteur de catégorie */}
        <Text style={[bs.sectionLabel, { color: colors.textSecondary }]}>Que veux-tu booster ?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bs.tabsRow}>
          {BOOST_OPTIONS.map(opt => {
            const isActive = activeOption.id === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => { setActiveOption(opt); setSelectedTier(null); }}
                activeOpacity={0.8}
              >
                {isActive ? (
                  <LinearGradient
                    colors={opt.gradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={bs.tabActive}
                  >
                    <Icon name={opt.icon as any} size={15} color="#fff" />
                    <Text style={bs.tabActiveText}>{opt.label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[bs.tabInactive, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Icon name={opt.icon as any} size={15} color={colors.textSecondary} />
                    <Text style={[bs.tabInactiveText, { color: colors.textSecondary }]}>{opt.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Description de la catégorie */}
        <View style={[bs.descBox, { backgroundColor: activeOption.gradient[0] + '15', borderColor: activeOption.gradient[0] + '40' }]}>
          <Icon name={activeOption.icon as any} size={18} color={activeOption.gradient[0]} />
          <Text style={[bs.descText, { color: colors.textPrimary }]}>{activeOption.description}</Text>
        </View>

        {/* Grille des tiers */}
        <Text style={[bs.sectionLabel, { color: colors.textSecondary }]}>Choisis ton offre</Text>
        <View style={bs.tiersGrid}>
          {activeOption.tiers.map(tier => (
            <TierCard
              key={tier.id}
              tier={tier}
              selected={selectedTier?.id === tier.id}
              gradient={activeOption.gradient}
              colors={colors}
              onSelect={() => setSelectedTier(tier)}
            />
          ))}
        </View>

        {/* Bouton acheter */}
        <TouchableOpacity
          style={[bs.buyBtn, (!selectedTier || purchasing) && { opacity: 0.4 }]}
          onPress={handleBuy}
          disabled={!selectedTier || purchasing}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={activeOption.gradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={bs.buyInner}
          >
            {purchasing
              ? <ActivityIndicator size={18} color="#fff" />
              : <>
                  <Icon name="zap" size={17} color="#fff" />
                  <Text style={bs.buyText}>
                    {selectedTier
                      ? `Activer pour ${selectedTier.coins.toLocaleString('fr-FR')} 🪙`
                      : 'Sélectionne une offre'
                    }
                  </Text>
                </>
            }
          </LinearGradient>
        </TouchableOpacity>

        {/* Info paiement */}
        <View style={[bs.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="info" size={13} color={colors.textTertiary} />
          <Text style={[bs.infoText, { color: colors.textTertiary }]}>
            Les coins sont débités immédiatement. Les résultats sont progressifs sur la durée du boost.
            Aucun remboursement après activation.
          </Text>
        </View>

        {/* Comment ça marche */}
        <Text style={[bs.sectionLabel, { color: colors.textSecondary, marginTop: 8 }]}>Comment ça marche ?</Text>
        <View style={[bs.howCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { step: '1', icon: 'target',     text: 'Choisis ce que tu veux booster et l\'offre adaptée à ton budget' },
            { step: '2', icon: 'zap',        text: 'Les coins sont déduits et le boost est activé immédiatement' },
            { step: '3', icon: 'trending-up',text: 'Ton profil et tes contenus gagnent en visibilité progressivement' },
            { step: '4', icon: 'check-circle',text: 'Consulte tes statistiques dans le Dashboard Créateur' },
          ].map((item, i, arr) => (
            <View
              key={i}
              style={[bs.howRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
            >
              <LinearGradient
                colors={activeOption.gradient}
                style={bs.stepCircle}
              >
                <Text style={bs.stepNum}>{item.step}</Text>
              </LinearGradient>
              <Text style={[bs.howText, { color: colors.textPrimary }]}>{item.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA coins */}
        <TouchableOpacity
          style={[bs.coinsBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate('BuyCoins')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 18 }}>🪙</Text>
          <View style={{ flex: 1 }}>
            <Text style={[bs.coinsBtnTitle, { color: colors.textPrimary }]}>Pas assez de coins ?</Text>
            <Text style={[bs.coinsBtnSub, { color: colors.textSecondary }]}>Recharge ton solde en quelques secondes</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

      </ScrollView>

      {/* Modal confirmation */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={bs.modalOverlay}>
          <View style={[bs.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[bs.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[bs.modalTitle, { color: colors.textPrimary }]}>Confirmer le boost</Text>

            {selectedTier && (
              <>
                <LinearGradient
                  colors={activeOption.gradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={bs.modalPreview}
                >
                  <Icon name={activeOption.icon as any} size={28} color="#fff" style={{ marginBottom: 8 }} />
                  <Text style={bs.modalPreviewQty}>{selectedTier.quantity}</Text>
                  <Text style={bs.modalPreviewType}>{activeOption.label}</Text>
                  <Text style={bs.modalPreviewDur}>{selectedTier.duration}</Text>
                </LinearGradient>

                <View style={[bs.modalSummary, { backgroundColor: colors.background }]}>
                  <View style={bs.modalSummaryRow}>
                    <Text style={[bs.modalSummaryLabel, { color: colors.textSecondary }]}>Offre</Text>
                    <Text style={[bs.modalSummaryValue, { color: colors.textPrimary }]}>{selectedTier.label}</Text>
                  </View>
                  <View style={bs.modalSummaryRow}>
                    <Text style={[bs.modalSummaryLabel, { color: colors.textSecondary }]}>Durée</Text>
                    <Text style={[bs.modalSummaryValue, { color: colors.textPrimary }]}>{selectedTier.duration}</Text>
                  </View>
                  <View style={bs.modalSummaryRow}>
                    <Text style={[bs.modalSummaryLabel, { color: colors.textSecondary }]}>Coût</Text>
                    <Text style={[bs.modalSummaryValue, { color: activeOption.gradient[0], fontWeight: '800' }]}>
                      {selectedTier.coins.toLocaleString('fr-FR')} 🪙
                    </Text>
                  </View>
                  <View style={bs.modalSummaryRow}>
                    <Text style={[bs.modalSummaryLabel, { color: colors.textSecondary }]}>Solde après</Text>
                    <Text style={[bs.modalSummaryValue, { color: balance - selectedTier.coins >= 0 ? '#10B981' : '#EF4444' }]}>
                      {(balance - selectedTier.coins).toLocaleString('fr-FR')} 🪙
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={confirmBoost}
                  disabled={purchasing}
                  activeOpacity={0.85}
                  style={[bs.confirmBtn, { overflow: 'hidden', borderRadius: 16 }]}
                >
                  <LinearGradient
                    colors={activeOption.gradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={bs.confirmInner}
                  >
                    {purchasing
                      ? <ActivityIndicator color="#fff" />
                      : <>
                          <Icon name="zap" size={16} color="#fff" />
                          <Text style={bs.confirmText}>Activer le boost</Text>
                        </>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => setModalVisible(false)} style={bs.cancelBtn}>
              <Text style={[bs.cancelText, { color: colors.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: successOpacity, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
        ]}
      >
        <Animated.View style={[bs.successBox, { transform: [{ scale: successScale }] }]}>
          <LinearGradient colors={activeOption.gradient} style={bs.successIcon}>
            <Icon name="zap" size={36} color="#fff" />
          </LinearGradient>
          <Text style={bs.successTitle}>Boost activé !</Text>
          <Text style={bs.successSub}>Tes résultats arrivent progressivement 🚀</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const bs = StyleSheet.create({
  root:          { flex: 1 },
  headerGrad:    { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, gap: 12 },
  backBtn:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  headerTitle:   { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:     { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  balancePill:   { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  balanceText:   { color: '#FFD700', fontWeight: '700', fontSize: 13 },
  scroll:        { paddingHorizontal: 16, paddingBottom: 60, paddingTop: 20, gap: 14 },
  sectionLabel:  { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Boosts actifs
  activeSection:     { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  activeTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeSectionTitle:{ fontSize: 14, fontWeight: '700' },
  activeBoostRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  activeBoostLabel:  { fontSize: 13, fontWeight: '600' },
  activeBoostExpiry: { fontSize: 11, marginTop: 2 },
  progressWrap:      { alignItems: 'flex-end', gap: 4 },
  progressBg:        { width: 70, height: 5, borderRadius: 3 },
  progressFill:      { height: 5, borderRadius: 3 },
  progressPct:       { fontSize: 10 },

  // Tabs catégorie
  tabsRow:       { gap: 8, paddingVertical: 4 },
  tabActive:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  tabActiveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tabInactive:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  tabInactiveText:{ fontWeight: '600', fontSize: 13 },

  // Description
  descBox:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  descText:      { flex: 1, fontSize: 13, lineHeight: 19 },

  // Tiers
  tiersGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  // Bouton acheter
  buyBtn:        { borderRadius: 28, overflow: 'hidden', marginTop: 6 },
  buyInner:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  buyText:       { color: '#fff', fontSize: 17, fontWeight: '800' },

  // Info
  infoBox:       { flexDirection: 'row', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  infoText:      { flex: 1, fontSize: 11, lineHeight: 17 },

  // Comment ça marche
  howCard:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  howRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  stepCircle:    { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepNum:       { color: '#fff', fontSize: 13, fontWeight: '800' },
  howText:       { flex: 1, fontSize: 13, lineHeight: 19 },

  // CTA coins
  coinsBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  coinsBtnTitle: { fontSize: 14, fontWeight: '700' },
  coinsBtnSub:   { fontSize: 12, marginTop: 2 },

  // Modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16 },
  modalHandle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle:    { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  modalPreview:  { borderRadius: 20, padding: 24, alignItems: 'center' },
  modalPreviewQty:{ color: '#fff', fontSize: 26, fontWeight: '900' },
  modalPreviewType:{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
  modalPreviewDur:{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  modalSummary:  { borderRadius: 14, padding: 14, gap: 10 },
  modalSummaryRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalSummaryLabel:{ fontSize: 13 },
  modalSummaryValue:{ fontSize: 14, fontWeight: '700' },
  confirmBtn:    { marginTop: 4 },
  confirmInner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  confirmText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:     { alignItems: 'center', paddingVertical: 8 },
  cancelText:    { fontSize: 14, fontWeight: '500' },

  // Success
  successBox:    { alignItems: 'center', gap: 14, padding: 32 },
  successIcon:   { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  successTitle:  { color: '#fff', fontSize: 24, fontWeight: '900' },
  successSub:    { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center' },
});
