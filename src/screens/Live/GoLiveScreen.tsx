import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  StatusBar, Platform, Alert, ActivityIndicator, Animated,
  ScrollView, Modal, FlatList,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { liveService } from '../../services/liveService';
import type { MonetizationType } from '../../services/liveService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface GiftType {
  id: string;
  name: string;
  emoji: string;
  gogold_cost: number;
}

export const GoLiveScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();

  // Form
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate,   setIsPrivate]   = useState(false);
  const [starting,    setStarting]    = useState(false);

  // Métadonnées collapsible
  const [showMeta, setShowMeta] = useState(false);

  // Monétisation
  const [showMonetModal,  setShowMonetModal]  = useState(false);
  const [monetType,       setMonetType]       = useState<MonetizationType | null>(null);
  const [monetGoGold,      setMonetGoGold]      = useState('');
  const [monetGift,       setMonetGift]       = useState<GiftType | null>(null);
  const [gifts,           setGifts]           = useState<GiftType[]>([]);
  const [giftsLoading,    setGiftsLoading]    = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    liveService.stopAllMine().catch(() => {});
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Charger les cadeaux dès qu'on ouvre le modal monétisation
  const openMonetModal = async () => {
    setShowMonetModal(true);
    if (gifts.length > 0) return;
    setGiftsLoading(true);
    try {
      const r = await apiClient.get<GiftType[]>(Endpoints.wallet.giftTypes);
      setGifts(Array.isArray(r.data) ? r.data : []);
    } catch {}
    setGiftsLoading(false);
  };

  const confirmMonetisation = () => {
    if (monetType === 'gogold') {
      const v = parseInt(monetGoGold, 10);
      if (!v || v < 1) { Alert.alert('Erreur', 'Saisis un montant en GoGold valide.'); return; }
    }
    if (monetType === 'gift' && !monetGift) {
      Alert.alert('Erreur', 'Sélectionne un cadeau.'); return;
    }
    setShowMonetModal(false);
  };

  const cancelMonetisation = () => {
    setMonetType(null);
    setMonetGoGold('');
    setMonetGift(null);
    setShowMonetModal(false);
  };

  const isMonetized = monetType !== null;

  const monetLabel = () => {
    if (!isMonetized) return null;
    if (monetType === 'gogold') return `${monetGoGold} GoGold`;
    if (monetType === 'gift' && monetGift) return `${monetGift.emoji} ${monetGift.name}`;
    return null;
  };

  async function handleStartQuickLive() {
    if (starting) return;
    setStarting(true);
    const t = title.trim() || 'Live en direct';
    try {
      const payload: Parameters<typeof liveService.startLive>[0] = {
        title: t,
        description: description.trim() || undefined,
        is_private: isPrivate,
        is_monetized: isMonetized,
        monetization_type:     isMonetized ? monetType! : undefined,
        monetization_gogold:    monetType === 'gogold' ? parseInt(monetGoGold, 10) : undefined,
        monetization_gift_id:  monetType === 'gift'  ? monetGift?.id : undefined,
      };
      const result = await liveService.startLive(payload);
      nav.replace('SimpleLiveStream', {
        liveId:         result.live.id,
        publisherToken: result.token,
        livekitUrl:     result.livekit_url,
        userId:         result.live.user_id,
        isPrivate:      result.live.is_private,
      });
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail || 'Impossible de démarrer le live');
      setStarting(false);
    }
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
          <Icon name="x" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Démarrer un live</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Carte principale ─────────────────────────────────────────── */}
        <View style={[st.mainCard, { backgroundColor: colors.surface, borderColor: '#F0365A40' }]}>
          <LinearGradient
            colors={['#F0365A18', '#E0389A0C']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />

          {/* Icône + labels */}
          <View style={st.cardTop}>
            <Animated.View style={[st.liveIconWrap, { transform: [{ scale: pulseAnim }] }]}>
              <LinearGradient colors={['#F0365A', '#E0389A']} style={st.liveIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Icon name="radio" size={28} color="#fff" />
              </LinearGradient>
            </Animated.View>
            <View style={st.cardLabels}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Live spontané</Text>
              <Text style={[st.cardSub, { color: colors.textSecondary }]}>
                Lance-toi maintenant — tes abonnés sont notifiés instantanément
              </Text>
            </View>
          </View>

          {/* ── Boutons secondaires (Métadonnées + Monétiser) ─────────── */}
          <View style={st.optionRow}>

            {/* Métadonnées */}
            <TouchableOpacity
              style={[st.optionBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }, showMeta && { borderColor: '#3B82F6' }]}
              onPress={() => setShowMeta(v => !v)}
              activeOpacity={0.8}
            >
              <MCIcon name="text-box-outline" size={16} color={showMeta ? '#3B82F6' : colors.textSecondary} />
              <Text style={[st.optionBtnText, { color: showMeta ? '#3B82F6' : colors.textSecondary }]}>Métadonnées</Text>
              <MCIcon name={showMeta ? 'chevron-up' : 'chevron-down'} size={14} color={showMeta ? '#3B82F6' : colors.textTertiary} />
            </TouchableOpacity>

            {/* Monétiser */}
            <TouchableOpacity
              style={[st.optionBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }, isMonetized && { borderColor: '#F59E0B' }]}
              onPress={openMonetModal}
              activeOpacity={0.8}
            >
              <MCIcon name="currency-usd" size={16} color={isMonetized ? '#F59E0B' : colors.textSecondary} />
              <Text style={[st.optionBtnText, { color: isMonetized ? '#F59E0B' : colors.textSecondary }]} numberOfLines={1}>
                {isMonetized ? monetLabel() : 'Monétiser'}
              </Text>
              {isMonetized && (
                <TouchableOpacity onPress={cancelMonetisation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MCIcon name="close-circle" size={14} color="#F59E0B" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Métadonnées collapsibles ────────────────────────────────── */}
          {showMeta && (
            <View style={[st.metaBox, { borderTopColor: colors.divider }]}>
              <View style={[st.inputWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Icon name="type" size={15} color={colors.textTertiary} style={st.inputIcon} />
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Titre du live (optionnel)"
                  placeholderTextColor={colors.textTertiary}
                  style={[st.input, { color: colors.textPrimary }]}
                  maxLength={100}
                />
              </View>
              <View style={[st.inputWrap, st.inputWrapMulti, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Icon name="align-left" size={15} color={colors.textTertiary} style={[st.inputIcon, { marginTop: 2 }]} />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Description (optionnel)"
                  placeholderTextColor={colors.textTertiary}
                  style={[st.input, st.inputMulti, { color: colors.textPrimary }]}
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                />
              </View>
            </View>
          )}

          {/* ── Visibilité ──────────────────────────────────────────────── */}
          <View style={[st.privacyRow, !showMeta && { marginTop: 12 }]}>
            <TouchableOpacity
              style={[st.privacyBtn, !isPrivate && st.privacyBtnActive, !isPrivate && { borderColor: '#10B981' }]}
              onPress={() => setIsPrivate(false)}
              activeOpacity={0.8}
            >
              <MCIcon name="earth" size={18} color={!isPrivate ? '#10B981' : colors.textTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={[st.privacyLabel, { color: !isPrivate ? '#10B981' : colors.textSecondary }]}>Public</Text>
                <Text style={[st.privacySub,   { color: colors.textTertiary }]}>Tout le monde peut voir</Text>
              </View>
              {!isPrivate && <MCIcon name="check-circle" size={18} color="#10B981" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.privacyBtn, isPrivate && st.privacyBtnActive, isPrivate && { borderColor: '#7B3FF2' }]}
              onPress={() => setIsPrivate(true)}
              activeOpacity={0.8}
            >
              <MCIcon name="lock" size={18} color={isPrivate ? '#7B3FF2' : colors.textTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={[st.privacyLabel, { color: isPrivate ? '#7B3FF2' : colors.textSecondary }]}>Abonnés seulement</Text>
                <Text style={[st.privacySub,   { color: colors.textTertiary }]}>Uniquement tes abonnés</Text>
              </View>
              {isPrivate && <MCIcon name="check-circle" size={18} color="#7B3FF2" />}
            </TouchableOpacity>
          </View>

          {/* ── Badge monétisation actif ────────────────────────────────── */}
          {isMonetized && (
            <View style={st.monetBadge}>
              <MCIcon name="currency-usd" size={13} color="#F59E0B" />
              <Text style={st.monetBadgeText}>
                {monetType === 'gogold'
                  ? `Live payant · ${monetGoGold} GoGold pour rejoindre`
                  : `Live payant · cadeau requis : ${monetGift?.emoji} ${monetGift?.name}`}
              </Text>
            </View>
          )}

          {/* ── Bouton Go Live ──────────────────────────────────────────── */}
          <TouchableOpacity onPress={handleStartQuickLive} disabled={starting} activeOpacity={0.85} style={{ marginTop: 14 }}>
            <LinearGradient
              colors={starting ? ['#aaa', '#888'] : ['#F0365A', '#E0389A']}
              style={st.goBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {starting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <View style={st.liveDot} />
                  <Text style={st.goBtnText}>Go Live maintenant</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Concert Live ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[st.concertCard, { backgroundColor: colors.surface, borderColor: '#7B3FF240' }]}
          onPress={() => nav.navigate('CreateConcert')}
          activeOpacity={0.82}
        >
          <LinearGradient colors={['#7B3FF218', '#9B65F50C']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <View style={st.concertInner}>
            <LinearGradient colors={['#7B3FF2', '#9B65F5']} style={st.concertIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Icon name="music" size={22} color="#fff" />
            </LinearGradient>
            <View style={st.concertLabels}>
              <Text style={[st.concertTitle, { color: colors.textPrimary }]}>Concert live</Text>
              <Text style={[st.concertSub,   { color: colors.textSecondary }]}>Programme, vends des billets et diffuse</Text>
            </View>
            <View style={[st.arrowWrap, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="arrow-right" size={16} color={colors.textSecondary} />
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Modal Monétisation ──────────────────────────────────────────── */}
      <Modal visible={showMonetModal} transparent animationType="slide" onRequestClose={cancelMonetisation}>
        <View style={st.modalOverlay}>
          <View style={[st.monetSheet, { backgroundColor: colors.surface }]}>
            {/* Poignée */}
            <View style={[st.sheetHandle, { backgroundColor: colors.divider }]} />

            <Text style={[st.sheetTitle, { color: colors.textPrimary }]}>Monétiser le live</Text>
            <Text style={[st.sheetSub, { color: colors.textSecondary }]}>
              Les viewers devront satisfaire la condition pour accéder au live.
            </Text>

            {/* Choix du type */}
            <View style={st.typeRow}>
              {/* GoGold */}
              <TouchableOpacity
                style={[st.typeBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }, monetType === 'gogold' && { borderColor: '#F59E0B', backgroundColor: '#F59E0B18' }]}
                onPress={() => setMonetType('gogold')}
                activeOpacity={0.8}
              >
                <Text style={st.typeEmoji}>🪙</Text>
                <Text style={[st.typeLabel, { color: monetType === 'gogold' ? '#F59E0B' : colors.textPrimary }]}>Prix en GoGold</Text>
                <Text style={[st.typeSub, { color: colors.textTertiary }]}>Montant fixe à payer</Text>
                {monetType === 'gogold' && <MCIcon name="check-circle" size={18} color="#F59E0B" style={st.typeCheck} />}
              </TouchableOpacity>

              {/* Cadeau */}
              <TouchableOpacity
                style={[st.typeBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }, monetType === 'gift' && { borderColor: '#E85DAD', backgroundColor: '#E85DAD18' }]}
                onPress={() => setMonetType('gift')}
                activeOpacity={0.8}
              >
                <Text style={st.typeEmoji}>🎁</Text>
                <Text style={[st.typeLabel, { color: monetType === 'gift' ? '#E85DAD' : colors.textPrimary }]}>Cadeau requis</Text>
                <Text style={[st.typeSub, { color: colors.textTertiary }]}>Envoyer un cadeau</Text>
                {monetType === 'gift' && <MCIcon name="check-circle" size={18} color="#E85DAD" style={st.typeCheck} />}
              </TouchableOpacity>
            </View>

            {/* Saisie GoGold */}
            {monetType === 'gogold' && (
              <View style={[st.goGoldInputWrap, { backgroundColor: colors.backgroundSecondary, borderColor: '#F59E0B' }]}>
                <Text style={st.goGoldInputEmoji}>🪙</Text>
                <TextInput
                  value={monetGoGold}
                  onChangeText={v => setMonetGoGold(v.replace(/[^0-9]/g, ''))}
                  placeholder="Ex: 50"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  style={[st.goGoldInput, { color: colors.textPrimary }]}
                  maxLength={6}
                />
                <Text style={[st.goGoldInputSuffix, { color: colors.textTertiary }]}>GoGold</Text>
              </View>
            )}

            {/* Grille cadeaux */}
            {monetType === 'gift' && (
              <View style={st.giftSection}>
                <Text style={[st.giftSectionTitle, { color: colors.textSecondary }]}>Choisis le cadeau requis</Text>
                {giftsLoading ? (
                  <ActivityIndicator color="#E85DAD" style={{ marginTop: 16 }} />
                ) : (
                  <FlatList
                    data={gifts}
                    keyExtractor={g => g.id}
                    numColumns={4}
                    scrollEnabled={false}
                    renderItem={({ item }) => {
                      const selected = monetGift?.id === item.id;
                      return (
                        <TouchableOpacity
                          style={[st.giftCard, { backgroundColor: colors.backgroundSecondary, borderColor: selected ? '#E85DAD' : 'transparent' }]}
                          onPress={() => setMonetGift(item)}
                          activeOpacity={0.8}
                        >
                          <Text style={st.giftEmoji}>{item.emoji}</Text>
                          <Text style={[st.giftName, { color: colors.textSecondary }]} numberOfLines={1}>{item.name}</Text>
                          <Text style={st.giftCost}>{item.gogold_cost}🪙</Text>
                          {selected && <View style={st.giftSelectedDot} />}
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </View>
            )}

            {/* Actions */}
            <View style={st.sheetActions}>
              <TouchableOpacity style={[st.sheetCancelBtn, { borderColor: colors.border }]} onPress={cancelMonetisation} activeOpacity={0.8}>
                <Text style={[st.sheetCancelText, { color: colors.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.sheetConfirmBtn, (!monetType) && { opacity: 0.4 }]}
                onPress={confirmMonetisation}
                disabled={!monetType}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#F59E0B', '#F97316']} style={st.sheetConfirmGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={st.sheetConfirmText}>Confirmer</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 56,
    paddingBottom: 14,
  },
  backBtn:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },

  // ── Main card ──────────────────────────────────────────────────────────────
  mainCard: { borderRadius: 24, borderWidth: 1.5, overflow: 'hidden', padding: 20 },
  cardTop:  { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  liveIconWrap: { flexShrink: 0 },
  liveIconGrad: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardLabels:   { flex: 1 },
  cardTitle:    { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cardSub:      { fontSize: 13, lineHeight: 18 },

  // ── Boutons Métadonnées / Monétiser ────────────────────────────────────────
  optionRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  optionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  optionBtnText: { flex: 1, fontSize: 12, fontWeight: '600' },

  // ── Métadonnées collapsibles ───────────────────────────────────────────────
  metaBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8, marginTop: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, minHeight: 48,
  },
  inputWrapMulti: { alignItems: 'flex-start', paddingVertical: 10 },
  inputIcon:      { marginRight: 10 },
  input:          { flex: 1, fontSize: 14 },
  inputMulti:     { minHeight: 60, textAlignVertical: 'top' },

  // ── Visibilité ─────────────────────────────────────────────────────────────
  privacyRow:      { gap: 8 },
  privacyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  privacyBtnActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  privacyLabel:     { fontSize: 13, fontWeight: '700' },
  privacySub:       { fontSize: 11, marginTop: 1 },

  // ── Badge monétisation ─────────────────────────────────────────────────────
  monetBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F59E0B18', borderRadius: 10, borderWidth: 1, borderColor: '#F59E0B44',
    paddingHorizontal: 12, paddingVertical: 7, marginTop: 10,
  },
  monetBadgeText: { color: '#F59E0B', fontSize: 12, fontWeight: '600', flex: 1 },

  // ── Go Live btn ────────────────────────────────────────────────────────────
  goBtn: {
    borderRadius: 26, height: 54,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  liveDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', opacity: 0.9 },
  goBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // ── Concert card ───────────────────────────────────────────────────────────
  concertCard: { borderRadius: 20, borderWidth: 1.5, overflow: 'hidden', padding: 18 },
  concertInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  concertIconGrad: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  concertLabels: { flex: 1 },
  concertTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  concertSub:    { fontSize: 13, lineHeight: 17 },
  arrowWrap:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  // ── Modal monétisation ─────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  monetSheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36 },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  sheetSub:     { fontSize: 13, lineHeight: 18, marginBottom: 20 },

  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: {
    flex: 1, borderRadius: 16, borderWidth: 1.5,
    padding: 14, alignItems: 'center', gap: 4,
  },
  typeEmoji: { fontSize: 28 },
  typeLabel: { fontSize: 13, fontWeight: '700' },
  typeSub:   { fontSize: 11 },
  typeCheck: { position: 'absolute', top: 8, right: 8 },

  goGoldInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 16, height: 52, marginBottom: 16,
  },
  goGoldInputEmoji:  { fontSize: 22 },
  goGoldInput:       { flex: 1, fontSize: 22, fontWeight: '700' },
  goGoldInputSuffix: { fontSize: 14 },

  giftSection:      { marginBottom: 16 },
  giftSectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 10 },
  giftCard: {
    flex: 1, margin: 4, borderRadius: 12, borderWidth: 2,
    padding: 8, alignItems: 'center', gap: 3,
  },
  giftEmoji:       { fontSize: 28 },
  giftName:        { fontSize: 9, fontWeight: '600', textAlign: 'center' },
  giftCost:        { fontSize: 9, color: '#FFD700', fontWeight: '700' },
  giftSelectedDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E85DAD' },

  sheetActions:     { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetCancelBtn:   { flex: 1, borderRadius: 16, borderWidth: 1.5, height: 52, alignItems: 'center', justifyContent: 'center' },
  sheetCancelText:  { fontSize: 15, fontWeight: '700' },
  sheetConfirmBtn:  { flex: 2, borderRadius: 16, overflow: 'hidden' },
  sheetConfirmGrad: { height: 52, alignItems: 'center', justifyContent: 'center' },
  sheetConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
