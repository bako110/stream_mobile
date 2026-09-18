import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Dimensions, Image, FlatList,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { toastService } from '../../services';
import { useWalletPinGate } from '../../hooks/useWalletPinGate';

const { width: W } = Dimensions.get('window');
const COLS = 4;
const GRID_H_PAD = 20;
const GRID_GAP = 10;
const CARD_W = Math.floor((W - GRID_H_PAD * 2 - GRID_GAP * (COLS - 1)) / COLS);

interface GiftType {
  id: string;
  name: string;
  emoji: string;
  gogold_cost: number;
}

interface Props {
  reelId:        string;
  receiverId:    string;
  receiverName:  string;
  receiverAvatar?: string | null;
  onClose:       () => void;
}

export const GiftPickerModal: React.FC<Props> = ({
  reelId, receiverId, receiverName, receiverAvatar, onClose,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { runWithPin, pinModal } = useWalletPinGate();

  const [gifts,    setGifts]    = useState<GiftType[]>([]);
  const [selected, setSelected] = useState<GiftType | null>(null);
  const [balance,  setBalance]  = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);

  // Entrée de la feuille (slide + fondu du voile)
  const sheetY   = useRef(new Animated.Value(60)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  // Emoji qui s'envole à l'envoi
  const flyY  = useRef(new Animated.Value(0)).current;
  const flyOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, damping: 18, stiffness: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    Promise.all([
      apiClient.get<GiftType[]>('/api/v1/wallet/gifts'),
      apiClient.get<{ gogold_balance: number }>('/api/v1/wallet/me'),
    ]).then(([g, w]) => {
      setGifts(Array.isArray(g.data) ? g.data : []);
      setBalance(w.data?.gogold_balance ?? 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const close = () => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(sheetY, { toValue: 60, duration: 150, useNativeDriver: true }),
    ]).start(onClose);
  };

  const canAfford = !selected || balance >= selected.gogold_cost;

  const handleSend = async () => {
    if (!selected) return;
    if (balance < selected.gogold_cost) {
      toastService.error('GoGold insuffisants', 'Rechargez votre wallet pour envoyer ce cadeau.');
      return;
    }
    setSending(true);
    try {
      await runWithPin(extra => apiClient.post(Endpoints.wallet.sendGift, {
        gift_type_id: selected.id,
        receiver_id:  receiverId,
        reel_id:      reelId,
        ...extra,
      }));
      setBalance(b => b - selected.gogold_cost);
      flyOp.setValue(1);
      flyY.setValue(0);
      Animated.parallel([
        Animated.timing(flyY,  { toValue: -220, duration: 900, useNativeDriver: true }),
        Animated.timing(flyOp, { toValue: 0,    duration: 900, useNativeDriver: true }),
      ]).start(() => setTimeout(onClose, 250));
    } catch (e: any) {
      if (e?.message !== 'pin_cancelled') {
        toastService.error('Erreur', e?.message ?? "Impossible d'envoyer le cadeau");
      }
      setSending(false);
    }
  };

  const initial = (receiverName?.[0] ?? '?').toUpperCase();

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[s.backdrop, { opacity: backdrop }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <Animated.View
        style={[
          s.sheet,
          {
            backgroundColor: colors.surface,
            paddingBottom: 20 + insets.bottom,
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        <View style={[s.handle, { backgroundColor: colors.divider }]} />

        {/* En-tête : destinataire + solde */}
        <View style={s.header}>
          <View style={s.receiver}>
            {receiverAvatar ? (
              <Image source={{ uri: receiverAvatar }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.headerHint, { color: colors.textTertiary }]}>Envoyer un cadeau à</Text>
              <Text style={[s.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
                {receiverName}
              </Text>
            </View>
          </View>

          <View style={[s.balancePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
            <Text style={s.coin}>🪙</Text>
            <Text style={[s.balanceText, { color: colors.textPrimary }]}>{balance}</Text>
          </View>
        </View>

        {/* Grille de cadeaux */}
        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : gifts.length === 0 ? (
          <View style={s.loadingBox}>
            <Text style={{ color: colors.textTertiary, fontSize: 13 }}>Aucun cadeau disponible.</Text>
          </View>
        ) : (
          <FlatList
            data={gifts}
            keyExtractor={g => g.id}
            numColumns={COLS}
            scrollEnabled={gifts.length > COLS * 3}
            style={{ maxHeight: CARD_W * 3 + GRID_GAP * 2 + 8 }}
            contentContainerStyle={s.grid}
            columnWrapperStyle={{ gap: GRID_GAP }}
            renderItem={({ item: g }) => {
              const isSelected = selected?.id === g.id;
              const tooExpensive = balance < g.gogold_cost;
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelected(g)}
                  style={[
                    s.card,
                    { width: CARD_W, backgroundColor: colors.backgroundSecondary, borderColor: colors.divider },
                    isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '14' },
                    tooExpensive && !isSelected && { opacity: 0.45 },
                  ]}
                >
                  <Text style={s.giftEmoji}>{g.emoji}</Text>
                  <Text style={[s.giftName, { color: colors.textSecondary }]} numberOfLines={1}>{g.name}</Text>
                  <View style={s.giftCostRow}>
                    <Text style={s.giftCostCoin}>🪙</Text>
                    <Text style={[s.giftCost, { color: isSelected ? colors.primary : colors.textTertiary }]}>
                      {g.gogold_cost}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={[s.check, { backgroundColor: colors.primary }]}>
                      <Icon name="check" size={11} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Bouton d'envoi */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleSend}
          disabled={!selected || sending || !canAfford}
          style={[s.sendBtn, (!selected || sending || !canAfford) && { opacity: 0.45 }]}
        >
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.sendBtnInner}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Icon name="gift" size={17} color="#fff" />
                <Text style={s.sendBtnText}>
                  {selected
                    ? (canAfford ? `Envoyer ${selected.emoji} · ${selected.gogold_cost} 🪙` : 'Solde insuffisant')
                    : 'Choisis un cadeau'}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Emoji qui s'envole */}
        {sending && selected && (
          <Animated.Text
            pointerEvents="none"
            style={[s.flyEmoji, { transform: [{ translateY: flyY }], opacity: flyOp }]}
          >
            {selected.emoji}
          </Animated.Text>
        )}
      </Animated.View>

      {pinModal}
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 8,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 12,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  receiver: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  headerHint: { fontSize: 11, fontWeight: '600' },
  headerName: { fontSize: 15, fontWeight: '800', marginTop: 1 },

  balancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  coin: { fontSize: 12 },
  balanceText: { fontSize: 13, fontWeight: '800' },

  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },

  grid: { paddingHorizontal: GRID_H_PAD, paddingBottom: 4, gap: GRID_GAP },
  card: {
    aspectRatio: 0.86,
    borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, gap: 3,
  },
  giftEmoji: { fontSize: 30 },
  giftName:  { fontSize: 10, fontWeight: '600', textAlign: 'center', paddingHorizontal: 2 },
  giftCostRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  giftCostCoin: { fontSize: 9 },
  giftCost:  { fontSize: 10.5, fontWeight: '800' },
  check: {
    position: 'absolute', top: 5, right: 5,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  sendBtn: {
    marginHorizontal: 20, marginTop: 14,
    borderRadius: 16, overflow: 'hidden',
  },
  sendBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },

  flyEmoji: {
    position: 'absolute', bottom: 160, alignSelf: 'center', fontSize: 52,
  },
});
