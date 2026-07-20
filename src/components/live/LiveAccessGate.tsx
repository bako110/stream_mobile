/**
 * LiveAccessGate — Verrou d'acces pour les lives monetises.
 * Affiche quand le live est monetise et que l'utilisateur n'a pas encore paye.
 * - Montre un apercu floute du live (juste un fond sombre avec avatar host)
 * - Affiche les conditions (GoGold ou cadeau requis)
 * - Bouton d'action pour payer/envoyer le cadeau
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { liveService } from '../../services/liveService';
import type { LiveStream } from '../../services/liveService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

interface GiftType {
  id: string;
  name: string;
  emoji: string;
  gogold_cost: number;
}

interface Props {
  live: LiveStream;
  liveId: string;
  checking: boolean;
  setChecking: (v: boolean) => void;
  onAccessGranted: () => void;
  onLeave: () => void;
}

export const LiveAccessGate: React.FC<Props> = ({
  live, liveId, checking, setChecking, onAccessGranted, onLeave,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const isGift  = live.monetization_type === 'gift';
  const isGoGold = live.monetization_type === 'gogold';

  const hostName   = live.user?.display_name ?? live.user?.username ?? 'Createur';
  const hostAvatar = live.user?.avatar_url ?? null;

  const requiredGiftId    = live.monetization_gift_id;
  const requiredGiftName  = live.monetization_gift_name ?? '';
  const requiredGiftEmoji = live.monetization_gift_emoji ?? '🎁';
  const requiredGoGold     = live.monetization_gogold ?? 0;

  const [myBalance, setMyBalance] = useState<number | null>(null);

  useEffect(() => {
    apiClient.get(Endpoints.wallet.balance)
      .then(r => setMyBalance(r.data?.gogold_balance ?? r.data?.balance ?? 0))
      .catch(() => setMyBalance(null));
  }, []);

  const effectiveCost = isGoGold ? requiredGoGold : 0;
  const hasEnough = myBalance !== null && (isGoGold ? myBalance >= effectiveCost : true);

  const showInsufficientFunds = (msg: string) => {
    Alert.alert(
      'Solde insuffisant',
      msg,
      [
        { text: 'Pas maintenant', style: 'cancel' },
        {
          text: 'Recharger',
          onPress: () => {
            onLeave();
            navigation.navigate('Wallet');
          },
        },
      ],
    );
  };

  const handlePayGoGold = async () => {
    setChecking(true);
    try {
      const r = await liveService.payGoGoldForAccess(liveId);
      if (r.access_granted) {
        onAccessGranted();
      } else {
        showInsufficientFunds('Solde insuffisant. Recharge ton portefeuille pour continuer.');
      }
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const msg = e?.message ?? e?.response?.data?.detail ?? 'Erreur lors du paiement.';
      if (status === 402) {
        showInsufficientFunds(msg);
      } else {
        Alert.alert('Erreur', msg);
      }
    }
    setChecking(false);
  };

  const handleSendGift = async () => {
    if (!requiredGiftId) return;
    setChecking(true);
    try {
      const r = await liveService.sendGiftForAccess(liveId, requiredGiftId);
      if (r.access_granted) {
        onAccessGranted();
      } else {
        showInsufficientFunds('Solde insuffisant pour envoyer ce cadeau. Recharge ton portefeuille.');
      }
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const msg = e?.message ?? e?.response?.data?.detail ?? "Erreur lors de l'envoi du cadeau.";
      if (status === 402) {
        showInsufficientFunds(msg);
      } else {
        Alert.alert('Erreur', msg);
      }
    }
    setChecking(false);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Fond floute simule — avatar host centre */}
      <View style={s.bgPreview}>
        {hostAvatar ? (
          <Image source={{ uri: hostAvatar }} style={s.bgAvatar} blurRadius={18} />
        ) : (
          <View style={s.bgFallback} />
        )}
        <View style={s.bgOverlay} />
      </View>

      {/* Bouton retour */}
      <TouchableOpacity style={s.backBtn} onPress={onLeave} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <View style={s.backBtnInner}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </View>
      </TouchableOpacity>

      {/* Info host */}
      <View style={s.hostRow}>
        {hostAvatar
          ? <Image source={{ uri: hostAvatar }} style={s.hostAvatar} />
          : <View style={[s.hostAvatarFallback]}><Text style={s.hostInitial}>{(hostName[0] ?? '?').toUpperCase()}</Text></View>
        }
        <View>
          <Text style={s.hostName}>{hostName}</Text>
          <View style={s.livePill}>
            <View style={s.liveDot} />
            <Text style={s.livePillText}>LIVE</Text>
          </View>
        </View>
      </View>

      {/* Carte d'acces */}
      <View style={[s.gateCard, { backgroundColor: colors.surface, paddingBottom: 40 + insets.bottom }]}>
        {/* Icone verrou */}
        <View style={s.lockIconWrap}>
          <LinearGradient colors={['#F59E0B', '#F97316']} style={s.lockIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <MCIcon name="lock" size={26} color="#fff" />
          </LinearGradient>
        </View>

        <Text style={[s.gateTitle, { color: colors.textPrimary }]}>Live payant</Text>
        <Text style={[s.gateSub, { color: colors.textSecondary }]}>
          {hostName} a rendu ce live accessible sur condition.{'\n'}
          {isGoGold
            ? `Envoie ${requiredGoGold} GoGold pour regarder.`
            : `Envoie le cadeau requis pour regarder.`}
        </Text>

        {/* Condition affichee */}
        <View style={[s.conditionBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          {isGoGold ? (
            <View style={s.conditionRow}>
              <Text style={s.conditionEmoji}>🪙</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.conditionLabel, { color: colors.textPrimary }]}>Prix d'acces</Text>
                <Text style={[s.conditionValue, { color: '#F59E0B' }]}>{requiredGoGold} GoGold</Text>
              </View>
            </View>
          ) : (
            <View style={s.conditionRow}>
              <Text style={s.conditionEmoji}>{requiredGiftEmoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.conditionLabel, { color: colors.textPrimary }]}>Cadeau requis</Text>
                <Text style={[s.conditionValue, { color: '#E85DAD' }]}>{requiredGiftName}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Solde actuel */}
        {myBalance !== null && (
          <View style={[
            s.balanceRow,
            { borderColor: isGoGold && !hasEnough ? '#F0365A' : colors.border,
              backgroundColor: isGoGold && !hasEnough ? 'rgba(240,54,90,0.08)' : colors.backgroundSecondary },
          ]}>
            <Text style={[s.balanceLabel, { color: colors.textSecondary }]}>Ton solde</Text>
            <Text style={[s.balanceValue, { color: isGoGold && !hasEnough ? '#F0365A' : '#3FEDB6' }]}>
              {myBalance} GoGold
            </Text>
            {isGoGold && !hasEnough && (
              <Text style={s.balanceShort}>
                {`  (manque ${effectiveCost - myBalance} GoGold)`}
              </Text>
            )}
          </View>
        )}

        {/* Bouton d'action */}
        <TouchableOpacity
          style={[s.actionBtn, checking && { opacity: 0.5 }]}
          onPress={isGoGold ? handlePayGoGold : handleSendGift}
          disabled={checking}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={isGoGold ? ['#F59E0B', '#F97316'] : ['#E85DAD', '#9B65F5']}
            style={s.actionBtnGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            {checking ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={s.actionBtnEmoji}>{isGoGold ? '🪙' : requiredGiftEmoji}</Text>
                <Text style={s.actionBtnText}>
                  {isGoGold ? `Payer ${requiredGoGold} GoGold` : `Envoyer ${requiredGiftName}`}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={onLeave} style={s.leaveBtn} activeOpacity={0.7}>
          <Text style={[s.leaveBtnText, { color: colors.textTertiary }]}>Pas maintenant</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  bgPreview:  { ...StyleSheet.absoluteFill },
  bgAvatar:   { width: '100%', height: '100%', resizeMode: 'cover' },
  bgFallback: { flex: 1, backgroundColor: '#1a1a2e' },
  bgOverlay:  { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.72)' },

  backBtn: { position: 'absolute', top: 52, left: 16, zIndex: 10 },
  backBtnInner: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  hostRow: {
    position: 'absolute', top: 52, left: 70, right: 16, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  hostAvatar:        { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#F0365A' },
  hostAvatarFallback:{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center' },
  hostInitial:       { color: '#fff', fontWeight: '800', fontSize: 16 },
  hostName:          { color: '#fff', fontWeight: '700', fontSize: 14 },
  livePill:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0365A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 3 },
  liveDot:           { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  livePillText:      { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  gateCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24,
    alignItems: 'center',
  },
  lockIconWrap: { marginBottom: 14 },
  lockIconGrad: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  gateTitle:    { fontSize: 22, fontWeight: '900', marginBottom: 8 },
  gateSub:      { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },

  conditionBox: {
    width: '100%', borderRadius: 16, borderWidth: 1,
    padding: 16, marginBottom: 20,
  },
  conditionRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  conditionEmoji: { fontSize: 32 },
  conditionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 3 },
  conditionValue: { fontSize: 18, fontWeight: '800' },

  balanceRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 16,
  },
  balanceLabel: { fontSize: 13, fontWeight: '500', flex: 1 },
  balanceValue: { fontSize: 15, fontWeight: '800' },
  balanceShort: { fontSize: 12, color: '#F0365A', fontWeight: '600' },

  actionBtn:     { width: '100%', borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  actionBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  actionBtnEmoji:{ fontSize: 20 },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  leaveBtn:     { paddingVertical: 8 },
  leaveBtnText: { fontSize: 13 },
});
