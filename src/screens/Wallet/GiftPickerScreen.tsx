/**
 * GiftPickerScreen — Modal d'envoi de cadeaux sur un reel
 * - Grille de types de cadeaux (scroll horizontal sur 2 lignes)
 * - Solde de l'utilisateur
 * - Bouton "Envoyer" avec gradient
 * - Animation emoji volant après envoi
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';


// ── Types ──────────────────────────────────────────────────────────────────
interface GiftType {
  id: string;
  name: string;
  emoji: string;
  cost_coins: number;
  animation?: string;
}

interface Props {
  route?: {
    params?: {
      reelId?: string;
      receiverId?: string;
      receiverName?: string;
    };
  };
}


// ── Flying emoji animation ─────────────────────────────────────────────────
const FlyingEmoji: React.FC<{ emoji: string; onDone: () => void }> = ({ emoji, onDone }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(1)).current;
  const scale      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -300, duration: 1400, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 0,    duration: 1400, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.6, duration: 300, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.2, duration: 1100, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, [translateY, opacity, scale, onDone]);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        bottom: 200,
        alignSelf: 'center',
        fontSize: 60,
        transform: [{ translateY }, { scale }],
        opacity,
        zIndex: 999,
      }}
    >
      {emoji}
    </Animated.Text>
  );
};

// ── Gift card ──────────────────────────────────────────────────────────────
const GiftCard: React.FC<{
  gift: GiftType;
  selected: boolean;
  canAfford: boolean;
  onSelect: () => void;
  colors: any;
}> = ({ gift, selected, canAfford, onSelect, colors }) => {
  const s = giftCardStyles(colors);

  const content = (
    <View style={[
      s.card,
      selected && s.cardSelected,
      !canAfford && s.cardDisabled,
    ]}>
      <Text style={s.emoji}>{gift.emoji}</Text>
      <Text style={[s.name, !canAfford && { color: colors.textTertiary }]} numberOfLines={1}>
        {gift.name}
      </Text>
      <View style={s.costRow}>
        <MaterialCommunityIcons name="bitcoin" size={10} color={canAfford ? '#FFD700' : colors.textTertiary} />
        <Text style={[s.cost, !canAfford && { color: colors.textTertiary }]}>{gift.cost_coins}</Text>
      </View>
    </View>
  );

  if (selected) {
    return (
      <TouchableOpacity onPress={onSelect} activeOpacity={0.85}>
        <LinearGradient
          colors={['#9B65F5', '#E85DAD']}
          style={s.selectedWrapper}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={s.selectedInner}>
            {content}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={canAfford ? onSelect : undefined} activeOpacity={0.85}>
      {content}
    </TouchableOpacity>
  );
};

const giftCardStyles = (colors: any) => StyleSheet.create({
  card: {
    width: 80,
    height: 90,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: 10,
    marginBottom: 10,
  },
  cardSelected: {
    borderColor: 'transparent',
  },
  cardDisabled: {
    opacity: 0.45,
  },
  selectedWrapper: {
    borderRadius: 16,
    padding: 2,
    marginRight: 10,
    marginBottom: 10,
  },
  selectedInner: {
    borderRadius: 13,
    overflow: 'hidden',
  },
  emoji: {
    fontSize: 30,
  },
  name: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cost: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
});

// ── Main ───────────────────────────────────────────────────────────────────
const GiftPickerScreen: React.FC<Props> = ({ route }) => {
  const { reelId, receiverId, receiverName } = route?.params ?? {};
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>();

  const [gifts, setGifts]         = useState<GiftType[]>([]);
  const [loading, setLoading]     = useState(true);
  const [balance, setBalance]     = useState(0);
  const [selected, setSelected]   = useState<GiftType | null>(null);
  const [sending, setSending]     = useState(false);
  const [flyingEmoji, setFlying]  = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      apiClient.get<GiftType[]>(Endpoints.wallet.giftTypes),
      apiClient.get<{ coins: number }>(Endpoints.wallet.balance),
    ]).then(([giftsRes, balRes]) => {
      if (giftsRes.status === 'fulfilled') setGifts(giftsRes.value.data ?? []);
      if (balRes.status === 'fulfilled') setBalance(balRes.value.data.coins);
    }).finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!selected || !reelId || !receiverId) return;
    setSending(true);
    try {
      await apiClient.post(Endpoints.wallet.sendGift, {
        reel_id: reelId,
        receiver_id: receiverId,
        gift_type_id: selected.id,
      });
      setBalance(prev => prev - selected.cost_coins);
      setFlying(selected.emoji);
    } catch (e: any) {
      const { Alert } = require('react-native');
      Alert.alert('Erreur', e?.message ?? 'Envoi échoué');
      setSending(false);
    }
  };

  const canAfford = (gift: GiftType) => balance >= gift.cost_coins;
  const s = styles(colors);

  // Rows: split gifts into 2 rows
  const row1 = gifts.slice(0, Math.ceil(gifts.length / 2));
  const row2 = gifts.slice(Math.ceil(gifts.length / 2));

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Flying emoji */}
      {flyingEmoji && (
        <FlyingEmoji
          emoji={flyingEmoji}
          onDone={() => {
            setFlying(null);
            setSending(false);
            navigation.goBack();
          }}
        />
      )}

      {/* Drag handle */}
      <View style={s.handle} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Envoyer un cadeau</Text>
          {receiverName && (
            <Text style={s.headerSubtitle}>à {receiverName}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="x" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Balance */}
      <View style={s.balanceRow}>
        <View style={s.balancePill}>
          <MaterialCommunityIcons name="bitcoin" size={16} color="#FFD700" />
          <Text style={s.balanceText}>{balance.toLocaleString('fr-FR')} coins</Text>
        </View>
        <TouchableOpacity
          style={s.rechargeBtn}
          onPress={() => navigation.navigate('BuyCoins')}
        >
          <Icon name="plus-circle" size={14} color={colors.primary} />
          <Text style={s.rechargeText}>Recharger</Text>
        </TouchableOpacity>
      </View>

      {/* Gift grid — 2 rows, horizontal scroll */}
      {loading ? (
        <View style={{ height: 210, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.giftScroll}
        >
          <View>
            <View style={s.giftRow}>
              {row1.map(gift => (
                <GiftCard
                  key={gift.id}
                  gift={gift}
                  selected={selected?.id === gift.id}
                  canAfford={canAfford(gift)}
                  onSelect={() => setSelected(gift)}
                  colors={colors}
                />
              ))}
            </View>
            <View style={s.giftRow}>
              {row2.map(gift => (
                <GiftCard
                  key={gift.id}
                  gift={gift}
                  selected={selected?.id === gift.id}
                  canAfford={canAfford(gift)}
                  onSelect={() => setSelected(gift)}
                  colors={colors}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Insufficient coins warning */}
      {selected && !canAfford(selected) && (
        <View style={s.warningRow}>
          <Icon name="alert-circle" size={14} color={colors.warning} />
          <Text style={s.warningText}>
            Coins insuffisants. Il vous faut {selected.cost_coins - balance} coins de plus.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('BuyCoins')}>
            <Text style={s.warningLink}>Recharger →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Selected gift info */}
      {selected && (
        <View style={s.selectedInfo}>
          <Text style={s.selectedInfoText}>
            {selected.emoji} {selected.name} — {selected.cost_coins} coins
          </Text>
        </View>
      )}

      {/* Send button */}
      <View style={s.footer}>
        <TouchableOpacity
          onPress={handleSend}
          disabled={!selected || !canAfford(selected) || sending}
          activeOpacity={0.85}
          style={s.sendBtnWrapper}
        >
          <LinearGradient
            colors={
              selected && canAfford(selected)
                ? ['#9B65F5', '#E85DAD']
                : [colors.border, colors.border]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.sendBtn}
          >
            {sending
              ? <ActivityIndicator color="#FFF" />
              : (
                <>
                  <Icon name="send" size={18} color={selected && canAfford(selected) ? '#FFF' : colors.textTertiary} />
                  <Text style={[s.sendText, { color: selected && canAfford(selected) ? '#FFF' : colors.textTertiary }]}>
                    Envoyer{selected ? ` • ${selected.cost_coins} coins` : ''}
                  </Text>
                </>
              )
            }
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rechargeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rechargeText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  giftScroll: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  giftRow: {
    flexDirection: 'row',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    backgroundColor: `${colors.warning}22`,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
  },
  warningLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  selectedInfo: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  selectedInfoText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 8,
  },
  sendBtnWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  sendText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default GiftPickerScreen;
