/**
 * LiveSettingsSheet — Paramètres du live, visible uniquement par le host.
 * Deux sections de monétisation distinctes :
 *  - Accès au live  (is_monetized / monetization_*)  → PATCH /monetization
 *  - Montée scène   (stage_monetized / stage_*)       → PATCH /stage-monetization
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, TextInput, FlatList, ActivityIndicator, Alert,
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

// ── Formulaire monétisation réutilisable ─────────────────────────────────────

const MonetForm: React.FC<{
  title: string;
  accentColor: string;
  isActive: boolean;
  currentType?: string | null;
  currentCoins?: number | null;
  currentGiftId?: string | null;
  currentGiftName?: string | null;
  currentGiftEmoji?: string | null;
  onSave: (type: 'coins' | 'gift', coins: number | null, gift: GiftType | null) => Promise<void>;
  onRemove: () => void;
}> = ({
  title, accentColor, isActive,
  currentType, currentCoins, currentGiftId, currentGiftName, currentGiftEmoji,
  onSave, onRemove,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [showForm,     setShowForm]     = useState(false);
  const [type,         setType]         = useState<'coins' | 'gift' | null>((currentType as any) ?? null);
  const [coins,        setCoins]        = useState(currentCoins ? String(currentCoins) : '');
  const [gift,         setGift]         = useState<GiftType | null>(null);
  const [gifts,        setGifts]        = useState<GiftType[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [saving,       setSaving]       = useState(false);

  const open = async () => {
    setShowForm(true);
    if (gifts.length === 0) {
      setGiftsLoading(true);
      try {
        const r = await apiClient.get<any>(Endpoints.wallet.giftTypes);
        const list: GiftType[] = r.data?.gifts ?? r.data ?? [];
        setGifts(list);
        if (currentGiftId) {
          const found = list.find(g => g.id === currentGiftId);
          if (found) setGift(found);
        }
      } catch {}
      setGiftsLoading(false);
    }
  };

  const save = async () => {
    if (!type) return;
    if (type === 'coins') {
      const v = parseInt(coins, 10);
      if (!v || v < 1) { Alert.alert('Erreur', 'Entre un montant valide.'); return; }
    }
    if (type === 'gift' && !gift) { Alert.alert('Erreur', 'Choisis un cadeau requis.'); return; }
    setSaving(true);
    try {
      await onSave(type, type === 'coins' ? parseInt(coins, 10) : null, type === 'gift' ? gift : null);
      setShowForm(false);
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail ?? e?.message ?? 'Impossible de sauvegarder.');
    }
    setSaving(false);
  };

  if (showForm) {
    return (
      <View style={[s.monetForm, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => setShowForm(false)} style={s.monetFormBack}>
          <Icon name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={[s.monetFormBackText, { color: colors.textSecondary }]}>Retour</Text>
        </TouchableOpacity>

        <View style={s.typeRow}>
          <TouchableOpacity
            style={[s.typeCard, type === 'coins' && s.typeCardActive, { borderColor: type === 'coins' ? accentColor : colors.border }]}
            onPress={() => setType('coins')} activeOpacity={0.8}
          >
            <Text style={s.typeEmoji}>🪙</Text>
            <Text style={[s.typeLabel, { color: colors.textPrimary }]}>Prix coins</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.typeCard, type === 'gift' && s.typeCardActive, { borderColor: type === 'gift' ? '#E85DAD' : colors.border }]}
            onPress={() => setType('gift')} activeOpacity={0.8}
          >
            <Text style={s.typeEmoji}>🎁</Text>
            <Text style={[s.typeLabel, { color: colors.textPrimary }]}>Cadeau requis</Text>
          </TouchableOpacity>
        </View>

        {type === 'coins' && (
          <View style={s.coinsInputWrap}>
            <Text style={s.coinsInputEmoji}>🪙</Text>
            <TextInput
              value={coins}
              onChangeText={v => setCoins(v.replace(/[^0-9]/g, ''))}
              placeholder="Montant en coins"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              style={[s.coinsInput, { color: colors.textPrimary, borderColor: colors.border }]}
            />
          </View>
        )}

        {type === 'gift' && (
          giftsLoading
            ? <ActivityIndicator color="#F0365A" style={{ marginVertical: 16 }} />
            : (
              <FlatList
                data={gifts} keyExtractor={g => g.id} numColumns={4} scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[s.giftItem, gift?.id === item.id && s.giftItemActive]}
                    onPress={() => setGift(item)} activeOpacity={0.8}
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

        <TouchableOpacity
          style={[s.saveBtn, (!type || saving) && { opacity: 0.5 }]}
          onPress={save} disabled={!type || saving} activeOpacity={0.85}
        >
          <LinearGradient colors={[accentColor, accentColor + 'BB']} style={s.saveBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.saveBtnText}>Confirmer</Text>
            }
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.monetCard, { backgroundColor: colors.backgroundSecondary, borderColor: isActive ? accentColor + '55' : colors.border }]}>
      {isActive ? (
        <>
          <View style={s.monetActive}>
            <MCIcon name="lock" size={18} color={accentColor} />
            <Text style={[s.monetActiveText, { color: colors.textPrimary }]}>
              {currentType === 'coins'
                ? `${currentCoins} coins requis`
                : `Cadeau requis : ${currentGiftEmoji ?? ''} ${currentGiftName ?? ''}`}
            </Text>
          </View>
          <View style={s.monetBtns}>
            <TouchableOpacity style={[s.monetEditBtn, { borderColor: accentColor }]} onPress={open} activeOpacity={0.8}>
              <Icon name="edit-2" size={14} color={accentColor} />
              <Text style={[s.monetEditBtnText, { color: accentColor }]}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.monetEditBtn, { borderColor: '#F0365A' }]} onPress={onRemove} activeOpacity={0.8}>
              <Icon name="unlock" size={14} color="#F0365A" />
              <Text style={[s.monetEditBtnText, { color: '#F0365A' }]}>Retirer</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity style={s.monetStartBtn} onPress={open} activeOpacity={0.8}>
          <LinearGradient colors={[accentColor, accentColor + 'AA']} style={s.monetStartGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <MCIcon name="lock-outline" size={18} color="#fff" />
            <Text style={s.monetStartText}>{title}</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ── Sheet principal ───────────────────────────────────────────────────────────

export const LiveSettingsSheet: React.FC<Props> = ({
  visible, onClose, live, liveId,
  camOn, micOn, onToggleCam, onToggleMic,
  handRequests, onInvite, onDismissHand,
  onStopLive, onMonetizationUpdated,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  // ── Monétisation accès au live ────────────────────────────────────────────
  const saveAccessMonet = async (type: 'coins' | 'gift', coins: number | null, gift: GiftType | null) => {
    const payload: any = {
      is_monetized: true,
      monetization_type: type,
      monetization_coins: type === 'coins' ? coins : null,
      monetization_gift_id: type === 'gift' ? gift!.id : null,
    };
    await apiClient.patch(Endpoints.lives.monetization(liveId), payload);
    onMonetizationUpdated({
      is_monetized: true,
      monetization_type: type,
      monetization_coins: type === 'coins' ? coins ?? undefined : undefined,
      monetization_gift_id: type === 'gift' ? gift!.id : undefined,
      monetization_gift_name: type === 'gift' ? gift!.name : undefined,
      monetization_gift_emoji: type === 'gift' ? gift!.emoji : undefined,
    });
  };

  const removeAccessMonet = () => {
    Alert.alert('Retirer la monétisation', 'Les prochains viewers pourront rejoindre gratuitement.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.patch(Endpoints.lives.monetization(liveId), { is_monetized: false });
            onMonetizationUpdated({ is_monetized: false, monetization_type: null, monetization_coins: undefined });
          } catch {}
        },
      },
    ]);
  };

  // ── Monétisation montée sur scène ─────────────────────────────────────────
  const saveStageMonet = async (type: 'coins' | 'gift', coins: number | null, gift: GiftType | null) => {
    const payload: any = {
      stage_monetized: true,
      stage_type: type,
      stage_coins: type === 'coins' ? coins : null,
      stage_gift_id: type === 'gift' ? gift!.id : null,
    };
    await apiClient.patch(Endpoints.lives.stageMonetization(liveId), payload);
    onMonetizationUpdated({
      stage_monetized: true,
      stage_type: type,
      stage_coins: type === 'coins' ? coins ?? undefined : undefined,
      stage_gift_id: type === 'gift' ? gift!.id : undefined,
      stage_gift_name: type === 'gift' ? gift!.name : undefined,
      stage_gift_emoji: type === 'gift' ? gift!.emoji : undefined,
    });
  };

  const removeStageMonet = () => {
    Alert.alert('Retirer la condition scène', 'Les viewers pourront lever la main gratuitement.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.patch(Endpoints.lives.stageMonetization(liveId), { stage_monetized: false });
            onMonetizationUpdated({ stage_monetized: false, stage_type: null, stage_coins: undefined });
          } catch {}
        },
      },
    ]);
  };

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
              onPress={onToggleCam} activeOpacity={0.8}
            >
              <View style={[s.toggleIcon, { backgroundColor: camOn ? 'rgba(74,222,128,0.15)' : 'rgba(240,54,90,0.12)' }]}>
                <Icon name={camOn ? 'video' : 'video-off'} size={22} color={camOn ? '#4ade80' : '#F0365A'} />
              </View>
              <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>{camOn ? 'Caméra ON' : 'Caméra OFF'}</Text>
              <View style={[s.dot, { backgroundColor: camOn ? '#4ade80' : '#F0365A' }]} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.toggleCard, { backgroundColor: colors.backgroundSecondary, borderColor: micOn ? '#4ade80' : colors.border }]}
              onPress={onToggleMic} activeOpacity={0.8}
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
            {handRequests.length > 0 && <Text style={{ color: '#F0365A' }}> ({handRequests.length})</Text>}
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
                  <TouchableOpacity style={s.acceptBtn} onPress={() => onInvite(req.identity)} activeOpacity={0.8}>
                    <LinearGradient colors={['#4ade80', '#22c55e']} style={s.acceptBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      <Icon name="user-check" size={14} color="#fff" />
                      <Text style={s.acceptBtnText}>Inviter</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.dismissBtn, { borderColor: colors.border }]} onPress={() => onDismissHand(req.identity)} activeOpacity={0.8}>
                    <Icon name="x" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* ── Monétisation accès au live ──────────────────────────── */}
          <View style={s.monetSectionHeader}>
            <View style={[s.monetSectionIcon, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
              <Icon name="log-in" size={16} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionLabelInline, { color: colors.textPrimary }]}>Accès au live</Text>
              <Text style={[s.sectionSub, { color: colors.textSecondary }]}>Condition pour rejoindre le live</Text>
            </View>
          </View>

          <MonetForm
            title="Monétiser l'accès au live"
            accentColor="#F59E0B"
            isActive={live?.is_monetized ?? false}
            currentType={live?.monetization_type}
            currentCoins={live?.monetization_coins}
            currentGiftId={live?.monetization_gift_id}
            currentGiftName={live?.monetization_gift_name}
            currentGiftEmoji={live?.monetization_gift_emoji}
            onSave={saveAccessMonet}
            onRemove={removeAccessMonet}
          />

          {/* ── Monétisation montée sur scène ───────────────────────── */}
          <View style={s.monetSectionHeader}>
            <View style={[s.monetSectionIcon, { backgroundColor: 'rgba(155,101,245,0.12)' }]}>
              <Icon name="mic" size={16} color="#9B65F5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionLabelInline, { color: colors.textPrimary }]}>Montée sur scène</Text>
              <Text style={[s.sectionSub, { color: colors.textSecondary }]}>Condition pour lever la main</Text>
            </View>
          </View>

          <MonetForm
            title="Monétiser la montée sur scène"
            accentColor="#9B65F5"
            isActive={live?.stage_monetized ?? false}
            currentType={live?.stage_type}
            currentCoins={live?.stage_coins}
            currentGiftId={live?.stage_gift_id}
            currentGiftName={live?.stage_gift_name}
            currentGiftEmoji={live?.stage_gift_emoji}
            onSave={saveStageMonet}
            onRemove={removeStageMonet}
          />

          {/* ── Terminer le live ─────────────────────────────────────── */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Actions</Text>
          <TouchableOpacity style={[s.stopBtn, { borderColor: '#F0365A' }]} onPress={confirmStop} activeOpacity={0.8}>
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

  monetSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, marginBottom: 10 },
  monetSectionIcon:   { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionLabelInline: { fontSize: 14, fontWeight: '800' },
  sectionSub:         { fontSize: 11, marginTop: 1 },

  row:          { flexDirection: 'row', gap: 12 },
  toggleCard:   { flex: 1, borderRadius: 16, borderWidth: 1.5, padding: 14, alignItems: 'center', gap: 8 },
  toggleIcon:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  toggleLabel:  { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  dot:          { width: 8, height: 8, borderRadius: 4 },

  emptyCard:    { borderRadius: 14, padding: 16, alignItems: 'center' },
  emptyText:    { fontSize: 13 },
  handCard:     { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  handLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  handName:     { fontSize: 14, fontWeight: '600', flex: 1 },
  handActions:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  acceptBtn:    { borderRadius: 20, overflow: 'hidden' },
  acceptBtnGrad:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  acceptBtnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },
  dismissBtn:   { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  monetCard:        { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  monetActive:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monetActiveText:  { fontSize: 14, fontWeight: '600', flex: 1 },
  monetBtns:        { flexDirection: 'row', gap: 10 },
  monetEditBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  monetEditBtnText: { fontSize: 13, fontWeight: '600' },
  monetStartBtn:    { borderRadius: 20, overflow: 'hidden' },
  monetStartGrad:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 48 },
  monetStartText:   { color: '#fff', fontSize: 15, fontWeight: '700' },

  monetForm:        { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  monetFormBack:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  monetFormBackText:{ fontSize: 13 },
  typeRow:          { flexDirection: 'row', gap: 10 },
  typeCard:         { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: 'center', gap: 6 },
  typeCardActive:   { backgroundColor: 'rgba(245,158,11,0.08)' },
  typeEmoji:        { fontSize: 28 },
  typeLabel:        { fontSize: 13, fontWeight: '600' },
  coinsInputWrap:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  coinsInputEmoji:  { fontSize: 24 },
  coinsInput:       { flex: 1, height: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 16, fontWeight: '700' },
  giftItem:         { flex: 1, alignItems: 'center', padding: 8, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  giftItemActive:   { borderColor: '#E85DAD', backgroundColor: 'rgba(232,93,173,0.1)' },
  giftEmoji:        { fontSize: 26 },
  giftName:         { fontSize: 9, marginTop: 3, textAlign: 'center' },
  giftCost:         { fontSize: 10, color: '#F59E0B', fontWeight: '700' },
  saveBtn:          { borderRadius: 20, overflow: 'hidden', marginTop: 16 },
  saveBtnGrad:      { height: 50, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:      { color: '#fff', fontSize: 16, fontWeight: '800' },

  stopBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, marginTop: 4 },
  stopBtnText: { color: '#F0365A', fontSize: 15, fontWeight: '700' },
});
