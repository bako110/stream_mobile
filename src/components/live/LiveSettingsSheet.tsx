/**
 * LiveSettingsSheet — Paramètres du live, visible uniquement par le host.
 * Bottom sheet avec :
 *  - Caméra on/off
 *  - Micro on/off
 *  - Demandes de scène (mains levées)
 *  - Monétiser / modifier la monétisation
 *  - Terminer le live
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, TextInput, FlatList, ActivityIndicator,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import type { LiveStream } from '../../services/liveService';

interface HandRequest {
  identity: string;
  name: string;
  avatar?: string | null;
}

interface GiftType {
  id: string;
  name: string;
  emoji: string;
  coins_cost: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  live: LiveStream | null;
  liveId: string;
  camOn: boolean;
  micOn: boolean;
  onToggleCam: () => void;
  onToggleMic: () => void;
  handRequests: HandRequest[];
  onInvite: (identity: string) => void;
  onDismissHand: (identity: string) => void;
  onStopLive: () => void;
  onMonetizationUpdated: (updated: Partial<LiveStream>) => void;
}

export const LiveSettingsSheet: React.FC<Props> = ({
  visible, onClose, live, liveId,
  camOn, micOn, onToggleCam, onToggleMic,
  handRequests, onInvite, onDismissHand,
  onStopLive, onMonetizationUpdated,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  // ── Monétisation ──────────────────────────────────────────────────────────
  const [showMonet,     setShowMonet]     = useState(false);
  const [monetType,     setMonetType]     = useState<'coins' | 'gift' | null>(
    (live?.monetization_type as 'coins' | 'gift' | null) ?? null,
  );
  const [monetCoins,    setMonetCoins]    = useState(
    live?.monetization_coins ? String(live.monetization_coins) : '',
  );
  const [monetGift,     setMonetGift]     = useState<GiftType | null>(null);
  const [gifts,         setGifts]         = useState<GiftType[]>([]);
  const [giftsLoading,  setGiftsLoading]  = useState(false);
  const [savingMonet,   setSavingMonet]   = useState(false);

  const isMonetized = live?.is_monetized ?? false;

  const openMonet = async () => {
    setShowMonet(true);
    if (gifts.length === 0) {
      setGiftsLoading(true);
      try {
        const r = await apiClient.get<any>(Endpoints.wallet.giftTypes);
        const list: GiftType[] = (r.data?.gifts ?? r.data ?? []);
        setGifts(list);
        if (live?.monetization_gift_id) {
          const found = list.find(g => g.id === live.monetization_gift_id);
          if (found) setMonetGift(found);
        }
      } catch {}
      setGiftsLoading(false);
    }
  };

  const saveMonetization = async () => {
    if (!monetType) return;
    if (monetType === 'coins') {
      const v = parseInt(monetCoins, 10);
      if (!v || v < 1) { Alert.alert('Erreur', 'Entre un montant valide.'); return; }
    }
    if (monetType === 'gift' && !monetGift) {
      Alert.alert('Erreur', 'Choisis un cadeau requis.'); return;
    }
    setSavingMonet(true);
    try {
      const payload: any = {
        is_monetized: true,
        monetization_type: monetType,
        monetization_coins: monetType === 'coins' ? parseInt(monetCoins, 10) : null,
        monetization_gift_id: monetType === 'gift' ? monetGift!.id : null,
      };
      await apiClient.patch(`/api/v1/lives/${liveId}/monetization`, payload);
      onMonetizationUpdated({
        is_monetized: true,
        monetization_type: monetType,
        monetization_coins: monetType === 'coins' ? parseInt(monetCoins, 10) : undefined,
        monetization_gift_id: monetType === 'gift' ? monetGift!.id : undefined,
        monetization_gift_name: monetType === 'gift' ? monetGift!.name : undefined,
        monetization_gift_emoji: monetType === 'gift' ? monetGift!.emoji : undefined,
      });
      setShowMonet(false);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de mettre à jour la monétisation.');
    }
    setSavingMonet(false);
  };

  const removeMonetization = async () => {
    Alert.alert('Retirer la monétisation', 'Les prochains viewers pourront accéder gratuitement.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.patch(`/api/v1/lives/${liveId}/monetization`, { is_monetized: false });
            onMonetizationUpdated({ is_monetized: false, monetization_type: null });
            setMonetType(null); setMonetCoins(''); setMonetGift(null);
          } catch {}
        },
      },
    ]);
  };

  // ── Terminer le live ──────────────────────────────────────────────────────
  const confirmStop = () => {
    Alert.alert('Terminer le live', 'Es-tu sûr de vouloir terminer ce live ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Terminer', style: 'destructive', onPress: onStopLive },
    ]);
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View
        entering={SlideInDown.duration(280).springify()}
        exiting={SlideOutDown.duration(220)}
        style={[s.sheet, { backgroundColor: colors.surface }]}
      >
        {/* Handle + titre */}
        <View style={s.handle} />
        <View style={s.sheetHeader}>
          <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Paramètres du live</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="x" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

          {/* ── Caméra & Micro ──────────────────────────────────────── */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Diffusion</Text>
          <View style={s.row}>
            <TouchableOpacity
              style={[s.toggleCard, { backgroundColor: colors.backgroundSecondary, borderColor: camOn ? '#4ade80' : colors.border }]}
              onPress={onToggleCam}
              activeOpacity={0.8}
            >
              <View style={[s.toggleIcon, { backgroundColor: camOn ? 'rgba(74,222,128,0.15)' : 'rgba(240,54,90,0.12)' }]}>
                <Icon name={camOn ? 'video' : 'video-off'} size={22} color={camOn ? '#4ade80' : '#F0365A'} />
              </View>
              <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>{camOn ? 'Caméra ON' : 'Caméra OFF'}</Text>
              <View style={[s.dot, { backgroundColor: camOn ? '#4ade80' : '#F0365A' }]} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.toggleCard, { backgroundColor: colors.backgroundSecondary, borderColor: micOn ? '#4ade80' : colors.border }]}
              onPress={onToggleMic}
              activeOpacity={0.8}
            >
              <View style={[s.toggleIcon, { backgroundColor: micOn ? 'rgba(74,222,128,0.15)' : 'rgba(240,54,90,0.12)' }]}>
                <Icon name={micOn ? 'mic' : 'mic-off'} size={22} color={micOn ? '#4ade80' : '#F0365A'} />
              </View>
              <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>{micOn ? 'Micro ON' : 'Micro OFF'}</Text>
              <View style={[s.dot, { backgroundColor: micOn ? '#4ade80' : '#F0365A' }]} />
            </TouchableOpacity>
          </View>

          {/* ── Demandes de scène ───────────────────────────────────── */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
            Demandes de scène
            {handRequests.length > 0 && (
              <Text style={{ color: '#F0365A' }}> ({handRequests.length})</Text>
            )}
          </Text>

          {handRequests.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[s.emptyText, { color: colors.textTertiary }]}>Aucune demande en attente</Text>
            </View>
          ) : (
            handRequests.map(req => (
              <View key={req.identity} style={[s.handCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <View style={s.handLeft}>
                  <Text style={{ fontSize: 24 }}>✋</Text>
                  <Text style={[s.handName, { color: colors.textPrimary }]} numberOfLines={1}>{req.name}</Text>
                </View>
                <View style={s.handActions}>
                  <TouchableOpacity
                    style={s.acceptBtn}
                    onPress={() => onInvite(req.identity)}
                    activeOpacity={0.8}
                  >
                    <LinearGradient colors={['#4ade80', '#22c55e']} style={s.acceptBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      <Icon name="user-check" size={14} color="#fff" />
                      <Text style={s.acceptBtnText}>Inviter</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dismissBtn, { borderColor: colors.border }]}
                    onPress={() => onDismissHand(req.identity)}
                    activeOpacity={0.8}
                  >
                    <Icon name="x" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* ── Monétisation ────────────────────────────────────────── */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Monétisation</Text>

          {!showMonet ? (
            <View style={[s.monetCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              {isMonetized ? (
                <>
                  <View style={s.monetActive}>
                    <MCIcon name="lock" size={18} color="#F59E0B" />
                    <Text style={[s.monetActiveText, { color: colors.textPrimary }]}>
                      {live?.monetization_type === 'coins'
                        ? `${live.monetization_coins} coins requis`
                        : `Cadeau requis : ${live?.monetization_gift_emoji ?? ''} ${live?.monetization_gift_name ?? ''}`}
                    </Text>
                  </View>
                  <View style={s.monetBtns}>
                    <TouchableOpacity style={s.monetEditBtn} onPress={openMonet} activeOpacity={0.8}>
                      <Icon name="edit-2" size={14} color="#F59E0B" />
                      <Text style={[s.monetEditBtnText, { color: '#F59E0B' }]}>Modifier</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.monetEditBtn, { borderColor: '#F0365A' }]} onPress={removeMonetization} activeOpacity={0.8}>
                      <Icon name="unlock" size={14} color="#F0365A" />
                      <Text style={[s.monetEditBtnText, { color: '#F0365A' }]}>Retirer</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <TouchableOpacity style={s.monetStartBtn} onPress={openMonet} activeOpacity={0.8}>
                  <LinearGradient colors={['#F59E0B', '#F97316']} style={s.monetStartGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <MCIcon name="lock-outline" size={18} color="#fff" />
                    <Text style={s.monetStartText}>Monétiser ce live</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* ── Formulaire monétisation ─────────────────────────── */
            <View style={[s.monetForm, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowMonet(false)} style={s.monetFormBack}>
                <Icon name="arrow-left" size={16} color={colors.textSecondary} />
                <Text style={[s.monetFormBackText, { color: colors.textSecondary }]}>Retour</Text>
              </TouchableOpacity>

              {/* Choix type */}
              <View style={s.typeRow}>
                <TouchableOpacity
                  style={[s.typeCard, monetType === 'coins' && s.typeCardActive, { borderColor: monetType === 'coins' ? '#F59E0B' : colors.border }]}
                  onPress={() => setMonetType('coins')}
                  activeOpacity={0.8}
                >
                  <Text style={s.typeEmoji}>🪙</Text>
                  <Text style={[s.typeLabel, { color: colors.textPrimary }]}>Prix coins</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.typeCard, monetType === 'gift' && s.typeCardActive, { borderColor: monetType === 'gift' ? '#E85DAD' : colors.border }]}
                  onPress={() => setMonetType('gift')}
                  activeOpacity={0.8}
                >
                  <Text style={s.typeEmoji}>🎁</Text>
                  <Text style={[s.typeLabel, { color: colors.textPrimary }]}>Cadeau requis</Text>
                </TouchableOpacity>
              </View>

              {/* Coins input */}
              {monetType === 'coins' && (
                <View style={s.coinsInputWrap}>
                  <Text style={s.coinsInputEmoji}>🪙</Text>
                  <TextInput
                    value={monetCoins}
                    onChangeText={v => setMonetCoins(v.replace(/[^0-9]/g, ''))}
                    placeholder="Montant en coins"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="numeric"
                    style={[s.coinsInput, { color: colors.textPrimary, borderColor: colors.border }]}
                  />
                </View>
              )}

              {/* Gift grid */}
              {monetType === 'gift' && (
                giftsLoading ? (
                  <ActivityIndicator color="#F0365A" style={{ marginVertical: 16 }} />
                ) : (
                  <FlatList
                    data={gifts}
                    keyExtractor={g => g.id}
                    numColumns={4}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[s.giftItem, monetGift?.id === item.id && s.giftItemActive]}
                        onPress={() => setMonetGift(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={s.giftEmoji}>{item.emoji}</Text>
                        <Text style={[s.giftName, { color: colors.textSecondary }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={s.giftCost}>{item.coins_cost}</Text>
                      </TouchableOpacity>
                    )}
                    contentContainerStyle={{ gap: 6 }}
                    columnWrapperStyle={{ gap: 6 }}
                    style={{ marginTop: 12 }}
                  />
                )
              )}

              {/* Confirmer */}
              <TouchableOpacity
                style={[s.saveBtn, (!monetType || savingMonet) && { opacity: 0.5 }]}
                onPress={saveMonetization}
                disabled={!monetType || savingMonet}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#F59E0B', '#F97316']} style={s.saveBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {savingMonet
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnText}>Confirmer</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Terminer le live ─────────────────────────────────────── */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Actions</Text>
          <TouchableOpacity
            style={[s.stopBtn, { borderColor: '#F0365A' }]}
            onPress={confirmStop}
            activeOpacity={0.8}
          >
            <Icon name="radio" size={18} color="#F0365A" />
            <Text style={s.stopBtnText}>Terminer le live</Text>
          </TouchableOpacity>

        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '88%',
  },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle:   { fontSize: 18, fontWeight: '800' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 20 },

  // Caméra / Micro
  row:          { flexDirection: 'row', gap: 12 },
  toggleCard: {
    flex: 1, borderRadius: 16, borderWidth: 1.5, padding: 14,
    alignItems: 'center', gap: 8,
  },
  toggleIcon:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  toggleLabel:  { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  dot:          { width: 8, height: 8, borderRadius: 4 },

  // Demandes
  emptyCard:    { borderRadius: 14, padding: 16, alignItems: 'center' },
  emptyText:    { fontSize: 13 },
  handCard: {
    borderRadius: 14, borderWidth: 1, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  handLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  handName:     { fontSize: 14, fontWeight: '600', flex: 1 },
  handActions:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  acceptBtn:    { borderRadius: 20, overflow: 'hidden' },
  acceptBtnGrad:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  acceptBtnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },
  dismissBtn:   { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Monétisation card
  monetCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 12,
  },
  monetActive:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monetActiveText:  { fontSize: 14, fontWeight: '600', flex: 1 },
  monetBtns:        { flexDirection: 'row', gap: 10 },
  monetEditBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  monetEditBtnText: { fontSize: 13, fontWeight: '600' },
  monetStartBtn:    { borderRadius: 20, overflow: 'hidden' },
  monetStartGrad:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 48 },
  monetStartText:   { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Formulaire monétisation
  monetForm: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 4,
  },
  monetFormBack:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  monetFormBackText:  { fontSize: 13 },
  typeRow:            { flexDirection: 'row', gap: 10 },
  typeCard: {
    flex: 1, borderRadius: 14, borderWidth: 1.5,
    padding: 14, alignItems: 'center', gap: 6,
  },
  typeCardActive:     { backgroundColor: 'rgba(245,158,11,0.08)' },
  typeEmoji:          { fontSize: 28 },
  typeLabel:          { fontSize: 13, fontWeight: '600' },
  coinsInputWrap:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  coinsInputEmoji:    { fontSize: 24 },
  coinsInput: {
    flex: 1, height: 48, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 16, fontSize: 16, fontWeight: '700',
  },
  giftItem: {
    flex: 1, alignItems: 'center', padding: 8, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  giftItemActive:     { borderColor: '#E85DAD', backgroundColor: 'rgba(232,93,173,0.1)' },
  giftEmoji:          { fontSize: 26 },
  giftName:           { fontSize: 9, marginTop: 3, textAlign: 'center' },
  giftCost:           { fontSize: 10, color: '#F59E0B', fontWeight: '700' },
  saveBtn:            { borderRadius: 20, overflow: 'hidden', marginTop: 16 },
  saveBtnGrad:        { height: 50, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:        { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Stop
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderWidth: 1.5, borderRadius: 16,
    paddingVertical: 14, marginTop: 4,
  },
  stopBtnText: { color: '#F0365A', fontSize: 15, fontWeight: '700' },
});
