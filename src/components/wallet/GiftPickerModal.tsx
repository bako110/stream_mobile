import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Animated, Dimensions, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

const { width: W } = Dimensions.get('window');

interface GiftType {
  id: string;
  name: string;
  emoji: string;
  coins_cost: number;
}

interface Props {
  reelId:       string;
  receiverId:   string;
  receiverName: string;
  onClose:      () => void;
}

export const GiftPickerModal: React.FC<Props> = ({ reelId, receiverId, receiverName, onClose }) => {
  const { theme: { colors } } = useTheme();
  const [gifts,    setGifts]    = useState<GiftType[]>([]);
  const [selected, setSelected] = useState<GiftType | null>(null);
  const [balance,  setBalance]  = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const flyAnim  = new Animated.Value(0);
  const flyOpacity = new Animated.Value(0);

  useEffect(() => {
    Promise.all([
      apiClient.get<GiftType[]>('/api/v1/wallet/gifts'),
      apiClient.get<{ coins_balance: number }>('/api/v1/wallet/me'),
    ]).then(([g, w]) => {
      setGifts(g.data ?? []);
      setBalance(w.data?.coins_balance ?? 0);
    }).finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!selected) return;
    if (balance < selected.coins_cost) {
      Alert.alert('Coins insuffisants', 'Rechargez votre wallet pour envoyer ce cadeau.');
      return;
    }
    setSending(true);
    try {
      await apiClient.post('/api/v1/wallet/gifts/send', {
        gift_type_id: selected.id,
        receiver_id:  receiverId,
        reel_id:      reelId,
      });
      setBalance(b => b - selected.coins_cost);
      // Animation emoji
      flyOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(flyAnim,    { toValue: -180, duration: 900, useNativeDriver: true }),
        Animated.timing(flyOpacity, { toValue: 0,    duration: 900, useNativeDriver: true }),
      ]).start(() => setTimeout(onClose, 300));
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible d\'envoyer le cadeau');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[s.sheet, { backgroundColor: colors.surface ?? '#1A1A2E' }]}>
          {/* Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <Text style={[s.title, { color: colors.textPrimary }]}>
              Envoyer un cadeau à <Text style={{ color: '#FFD700' }}>{receiverName}</Text>
            </Text>
            <View style={[s.balancePill, { backgroundColor: colors.background }]}>
              <Text style={s.balanceText}>{balance} 🪙</Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.giftRow}>
              {gifts.map(g => {
                const isSelected = selected?.id === g.id;
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setSelected(g)}
                    style={[s.giftCard, { backgroundColor: colors.background }, isSelected && s.giftCardSelected]}
                  >
                    {isSelected && (
                      <LinearGradient colors={['#7B3FF2', '#E0389A']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <View style={{ flex: 1, borderRadius: 16, margin: 2, backgroundColor: colors.background }} />
                      </LinearGradient>
                    )}
                    <Text style={s.giftEmoji}>{g.emoji}</Text>
                    <Text style={[s.giftName,  { color: colors.textPrimary }]}>{g.name}</Text>
                    <Text style={[s.giftCost,  { color: '#FFD700' }]}>{g.coins_cost} 🪙</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Bouton envoyer */}
          <TouchableOpacity
            style={[s.sendBtn, (!selected || sending) && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!selected || sending}
          >
            <LinearGradient colors={['#FFD700', '#FF8C00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sendBtnInner}>
              {sending
                ? <ActivityIndicator size={18} color="#fff" />
                : <>
                    <Icon name="gift" size={16} color="#fff" />
                    <Text style={s.sendBtnText}>
                      Envoyer {selected ? `${selected.emoji} (${selected.coins_cost} 🪙)` : ''}
                    </Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Emoji volant */}
        {sending && selected && (
          <Animated.Text style={[s.flyEmoji, { transform: [{ translateY: flyAnim }], opacity: flyOpacity }]}>
            {selected.emoji}
          </Animated.Text>
        )}
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  handle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title:     { fontSize: 15, fontWeight: '700', flex: 1 },
  balancePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  balanceText: { color: '#FFD700', fontWeight: '700', fontSize: 13 },
  giftRow:   { paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  giftCard:  { width: 88, alignItems: 'center', borderRadius: 16, padding: 12, gap: 4 },
  giftCardSelected: { borderWidth: 2, borderColor: '#7B3FF2' },
  giftEmoji: { fontSize: 34 },
  giftName:  { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  giftCost:  { fontSize: 11, fontWeight: '700' },
  sendBtn:   { marginHorizontal: 20, marginTop: 16, borderRadius: 28, overflow: 'hidden' },
  sendBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  sendBtnText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  flyEmoji:  { position: 'absolute', bottom: 200, alignSelf: 'center', fontSize: 48 },
});
