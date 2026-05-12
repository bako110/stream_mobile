/**
 * LiveGiftOverlay — Panneau de cadeaux en direct style TikTok.
 * - Bottom sheet avec grille de cadeaux
 * - Animation "fusée" montante à l'envoi
 * - Notifications en overlay quand quelqu'un envoie un cadeau (WS gift_received)
 * - Solde coins affiché + lien recharge
 */
import React, { useEffect, useRef, useState, useCallback, useImperativeHandle } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, ActivityIndicator, Animated, Dimensions,
  Alert, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const { width: W, height: H } = Dimensions.get('window');

// ── Types ─────────────────────────────────────────────────────────────────────

interface GiftType {
  id: string;
  name: string;
  emoji: string;
  coins_cost: number;
  animation_url?: string | null;
}

export interface GiftNotif {
  id: string;
  senderName: string;
  emoji: string;
  giftName: string;
  coins: number;
}

// ── Animation montante pour chaque cadeau envoyé ──────────────────────────────

const FloatingGift: React.FC<{ emoji: string; onDone: () => void }> = ({ emoji, onDone }) => {
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale   = useRef(new Animated.Value(0.4)).current;
  // Position X aléatoire dans la moitié gauche de l'écran
  const x = useRef(Math.random() * (W * 0.5 - 60) + 20).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y,       { toValue: -(H * 0.65), duration: 2200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,            duration: 2000, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start(onDone);
  }, []);

  return (
    <Animated.Text
      style={[
        g.floatEmoji,
        { left: x, transform: [{ translateY: y }, { scale }], opacity },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
};

// ── Notif cadeau reçu (visible pour tous) ─────────────────────────────────────

const GiftToast: React.FC<{ notif: GiftNotif; onDone: () => void }> = ({ notif, onDone }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const x       = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1,   duration: 300, useNativeDriver: true }),
        Animated.timing(x,       { toValue: 0,   duration: 300, useNativeDriver: true }),
      ]),
      Animated.delay(2500),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0,   duration: 400, useNativeDriver: true }),
        Animated.timing(x,       { toValue: -120, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);

  return (
    <Animated.View style={[g.giftToast, { opacity, transform: [{ translateX: x }] }]}>
      <LinearGradient
        colors={['rgba(255,215,0,0.25)', 'rgba(255,140,0,0.25)']}
        style={g.giftToastBg}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        <Text style={g.giftToastEmoji}>{notif.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={g.giftToastSender} numberOfLines={1}>{notif.senderName}</Text>
          <Text style={g.giftToastName} numberOfLines={1}>
            a envoyé {notif.giftName} · {notif.coins} 🪙
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

// ── Bottom sheet cadeaux ──────────────────────────────────────────────────────

interface SheetProps {
  liveId: string;
  receiverId: string;
  receiverName: string;
  onClose: () => void;
  onGiftSent: (emoji: string) => void;
}

const GiftSheet: React.FC<SheetProps> = ({ liveId, receiverId, receiverName, onClose, onGiftSent }) => {
  const nav = useNavigation<Nav>();
  const [gifts,    setGifts]    = useState<GiftType[]>([]);
  const [selected, setSelected] = useState<GiftType | null>(null);
  const [balance,  setBalance]  = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const slideY = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Promise.all([
      apiClient.get<GiftType[]>(Endpoints.wallet.giftTypes),
      apiClient.get<{ coins_balance: number }>(Endpoints.wallet.balance),
    ]).then(([gRes, wRes]) => {
      setGifts(gRes.data ?? []);
      setBalance(wRes.data?.coins_balance ?? 0);
    }).catch(() => {}).finally(() => setLoading(false));

    Animated.spring(slideY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
  }, []);

  const handleClose = useCallback(() => {
    Animated.timing(slideY, { toValue: 400, duration: 220, useNativeDriver: true }).start(onClose);
  }, [onClose, slideY]);

  const handleSend = useCallback(async () => {
    if (!selected) return;
    if (balance < selected.coins_cost) {
      Alert.alert(
        'Coins insuffisants',
        `Il te faut ${selected.coins_cost} 🪙 mais tu en as ${balance}.\nRecharge ton wallet ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Recharger', onPress: () => { handleClose(); nav.navigate('BuyCoins'); } },
        ],
      );
      return;
    }
    setSending(true);
    try {
      await apiClient.post(Endpoints.wallet.sendGift, {
        gift_type_id: selected.id,
        receiver_id:  receiverId,
        live_id:      liveId,
      });
      setBalance(b => b - selected.coins_cost);
      onGiftSent(selected.emoji);
      handleClose();
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible d\'envoyer le cadeau');
    } finally {
      setSending(false);
    }
  }, [selected, balance, receiverId, liveId, onGiftSent, handleClose, nav]);

  const canAfford = selected ? balance >= selected.coins_cost : false;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <View style={g.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} />

        <Animated.View style={[g.sheet, { transform: [{ translateY: slideY }] }]}>
          {/* Handle */}
          <View style={g.handle} />

          {/* Header */}
          <View style={g.sheetHeader}>
            <View>
              <Text style={g.sheetTitle}>Envoyer un cadeau</Text>
              <Text style={g.sheetSub}>à <Text style={{ color: '#FFD700' }}>{receiverName}</Text></Text>
            </View>
            <TouchableOpacity
              style={g.balancePill}
              onPress={() => { handleClose(); nav.navigate('BuyCoins'); }}
            >
              <Icon name="zap" size={12} color="#FFD700" />
              <Text style={g.balanceText}>{balance} 🪙</Text>
              <Text style={g.rechargeText}>+</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#FFD700" style={{ marginVertical: 36 }} />
          ) : (
            <>
              {/* Grille cadeaux */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={g.giftRow}
              >
                {gifts.map(gift => {
                  const isSelected = selected?.id === gift.id;
                  const affordable = balance >= gift.coins_cost;
                  return (
                    <TouchableOpacity
                      key={gift.id}
                      onPress={() => setSelected(gift)}
                      style={[g.giftCard, !affordable && g.giftCardLocked]}
                      activeOpacity={0.75}
                    >
                      {isSelected && (
                        <LinearGradient
                          colors={['#FFD700', '#FF8C00']}
                          style={StyleSheet.absoluteFill}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        />
                      )}
                      <Text style={g.giftEmoji}>{gift.emoji}</Text>
                      <Text style={[g.giftName, isSelected && { color: '#000' }]}>{gift.name}</Text>
                      <View style={[g.giftCostRow, isSelected && g.giftCostRowSelected]}>
                        <Text style={[g.giftCost, isSelected && { color: '#000' }]}>
                          {gift.coins_cost} 🪙
                        </Text>
                      </View>
                      {!affordable && <View style={g.giftLockOverlay}><Icon name="lock" size={14} color="#fff" /></View>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Bouton envoyer */}
              <View style={g.sendRow}>
                {selected && !canAfford && (
                  <TouchableOpacity
                    style={g.rechargeBtn}
                    onPress={() => { handleClose(); nav.navigate('BuyCoins'); }}
                  >
                    <Icon name="zap" size={14} color="#FFD700" />
                    <Text style={g.rechargeBtnText}>Recharger</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[g.sendBtn, (!selected || sending || !canAfford) && g.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={!selected || sending || !canAfford}
                >
                  <LinearGradient
                    colors={canAfford && selected ? ['#FFD700', '#FF6B00'] : ['#444', '#333']}
                    style={g.sendBtnGrad}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    {sending ? (
                      <ActivityIndicator size={18} color="#fff" />
                    ) : (
                      <>
                        <Text style={g.sendBtnEmoji}>{selected?.emoji ?? '🎁'}</Text>
                        <Text style={g.sendBtnText}>
                          {selected
                            ? `Envoyer · ${selected.coins_cost} 🪙`
                            : 'Choisir un cadeau'}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

// ── Composant principal exporté ───────────────────────────────────────────────

export interface LiveGiftOverlayRef {
  openGift: (receiverId: string, receiverName: string) => void;
}

interface Props {
  liveId: string;
  incomingNotifs: GiftNotif[];
  onNotifShown: (id: string) => void;
}

export const LiveGiftOverlay = React.forwardRef<LiveGiftOverlayRef, Props>((
  { liveId, incomingNotifs, onNotifShown }, ref,
) => {
  const [sheet, setSheet] = useState<{ receiverId: string; receiverName: string } | null>(null);
  const [floats,      setFloats]      = useState<{ id: string; emoji: string }[]>([]);
  const [activeNotif, setActiveNotif] = useState<GiftNotif | null>(null);

  useImperativeHandle(ref, () => ({
    openGift: (receiverId, receiverName) => setSheet({ receiverId, receiverName }),
  }), []);

  useEffect(() => {
    if (incomingNotifs.length > 0 && !activeNotif) {
      const next = incomingNotifs[0];
      setActiveNotif(next);
      setFloats(prev => [...prev, { id: `notif-${next.id}`, emoji: next.emoji }]);
    }
  }, [incomingNotifs, activeNotif]);

  const handleGiftSent = useCallback((emoji: string) => {
    setFloats(prev => [...prev, { id: `sent-${Date.now()}`, emoji }]);
  }, []);

  return (
    <>
      {floats.map(f => (
        <FloatingGift key={f.id} emoji={f.emoji} onDone={() => setFloats(prev => prev.filter(x => x.id !== f.id))} />
      ))}

      {activeNotif && (
        <GiftToast
          key={activeNotif.id}
          notif={activeNotif}
          onDone={() => { onNotifShown(activeNotif.id); setActiveNotif(null); }}
        />
      )}

      {sheet && (
        <GiftSheet
          liveId={liveId}
          receiverId={sheet.receiverId}
          receiverName={sheet.receiverName}
          onClose={() => setSheet(null)}
          onGiftSent={handleGiftSent}
        />
      )}
    </>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  // Emojis flottants
  floatEmoji: {
    position: 'absolute',
    bottom: 120,
    fontSize: 36,
    zIndex: 50,
  },

  // Toast cadeau reçu
  giftToast: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 160 : 140,
    left: 12,
    zIndex: 50,
    maxWidth: W * 0.65,
  },
  giftToastBg: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.4)',
  },
  giftToastEmoji:  { fontSize: 22 },
  giftToastSender: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  giftToastName:   { color: 'rgba(255,255,255,0.8)', fontSize: 11 },

  // Bouton déclencheur
  giftTrigger: {
    position: 'absolute',
    right: 12,
    bottom: Platform.OS === 'ios' ? 160 : 140,
    zIndex: 40,
  },
  giftTriggerGrad: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FFD700', shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 8,
    elevation: 8,
  },
  giftTriggerEmoji: { fontSize: 22 },

  // Bottom sheet
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#0E0E1A',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  sheetSub:   { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  balancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  balanceText:  { color: '#FFD700', fontWeight: '700', fontSize: 13 },
  rechargeText: { color: '#FFD700', fontWeight: '800', fontSize: 16, marginLeft: 2 },

  // Grille cadeaux
  giftRow:    { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  giftCard: {
    width: 82, alignItems: 'center',
    borderRadius: 18, padding: 12, gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  giftCardLocked: { opacity: 0.45 },
  giftEmoji:   { fontSize: 32 },
  giftName:    { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  giftCostRow: {
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  giftCostRowSelected: { backgroundColor: 'rgba(0,0,0,0.15)' },
  giftCost:    { color: '#FFD700', fontSize: 10, fontWeight: '700' },
  giftLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // Bouton envoyer
  sendRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, gap: 10,
  },
  rechargeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 24, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  rechargeBtnText: { color: '#FFD700', fontWeight: '700', fontSize: 13 },
  sendBtn: { flex: 1, borderRadius: 28, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15,
  },
  sendBtnEmoji: { fontSize: 20 },
  sendBtnText:  { color: '#fff', fontSize: 15, fontWeight: '800' },
});
