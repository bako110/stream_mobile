/**
 * LiveGiftBar — rangée horizontale de cadeaux TOUJOURS visible, juste au-dessus
 * de la barre de commentaire (pas de modal/bottom-sheet). Un tap envoie le
 * cadeau immédiatement au destinataire — pas d'étape de sélection séparée.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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

interface Props {
  liveId: string;
  receiverId: string;
  onGiftSent: (emoji: string) => void;
}

export const LiveGiftBar: React.FC<Props> = ({ liveId, receiverId, onGiftSent }) => {
  const nav = useNavigation<Nav>();
  const [gifts,   setGifts]   = useState<GiftType[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get<GiftType[]>(Endpoints.wallet.giftTypes),
      apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance),
    ]).then(([gRes, wRes]) => {
      setGifts(gRes.data ?? []);
      setBalance(wRes.data?.gogold_balance ?? 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleTap = useCallback(async (gift: GiftType) => {
    if (sendingId) return;
    if (balance < gift.gogold_cost) {
      Alert.alert(
        'GoGold insuffisants',
        `Il te faut ${gift.gogold_cost} 🪙 mais tu en as ${balance}.\nRecharger ton wallet ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Recharger', onPress: () => nav.navigate('BuyGoGold') },
        ],
      );
      return;
    }
    setSendingId(gift.id);
    try {
      await apiClient.post(Endpoints.wallet.sendGift, {
        gift_type_id: gift.id,
        receiver_id:  receiverId,
        live_id:      liveId,
      });
      setBalance(b => b - gift.gogold_cost);
      onGiftSent(gift.emoji);
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible d\'envoyer le cadeau');
    } finally {
      setSendingId(null);
    }
  }, [sendingId, balance, receiverId, liveId, onGiftSent, nav]);

  if (loading) {
    return (
      <View style={st.loadingWrap}>
        <ActivityIndicator size="small" color="#FFD700" />
      </View>
    );
  }

  if (gifts.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={st.row}
      style={st.scroll}
    >
      {gifts.map(gift => {
        const affordable = balance >= gift.gogold_cost;
        const sending = sendingId === gift.id;
        return (
          <TouchableOpacity
            key={gift.id}
            onPress={() => handleTap(gift)}
            style={[st.card, !affordable && st.cardLocked]}
            activeOpacity={0.7}
            disabled={!!sendingId}
          >
            {sending
              ? <ActivityIndicator size="small" color="#FFD700" />
              : <Text style={st.emoji}>{gift.emoji}</Text>}
            <Text style={st.cost}>{gift.gogold_cost}🪙</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const st = StyleSheet.create({
  loadingWrap: { height: 52, alignItems: 'center', justifyContent: 'center' },
  scroll: { maxHeight: 52 },
  row: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  card: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)',
  },
  cardLocked: { opacity: 0.4 },
  emoji: { fontSize: 20 },
  cost:  { color: '#FFD700', fontSize: 8, fontWeight: '700' },
});
