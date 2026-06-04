/**
 * CommunityFundScreen — Liste des cotisations + création (admin).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Modal,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BackButton, GoFolixLoader } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Cotisation {
  id: string;
  title: string;
  description?: string;
  amount_per_member: number;
  target_amount_coins: number;
  collected_coins: number;
  member_count_paid: number;
  member_count_total: number;
  progress_pct: number;
  status: 'active' | 'closed' | 'cancelled';
  deadline?: string;
  created_at: string;
  my_contribution?: { status: string; coins_paid: number; paid_at?: string } | null;
}

// ── Card cotisation ───────────────────────────────────────────────────────────

const CotisationCard: React.FC<{
  item: Cotisation;
  colors: any;
  myRole: string | null;
  onPress: () => void;
  onPay: () => void;
}> = ({ item, colors, myRole, onPress, onPay }) => {
  const isAdmin   = myRole === 'admin' || myRole === 'moderator';
  const myStatus  = item.my_contribution?.status;
  const hasPaid   = myStatus === 'paid';
  const isExempt  = myStatus === 'exempt';
  const isActive  = item.status === 'active';

  const statusColor = item.status === 'active' ? '#10B981' : item.status === 'closed' ? '#3B82F6' : '#EF4444';
  const statusLabel = item.status === 'active' ? 'En cours' : item.status === 'closed' ? 'Clôturée' : 'Annulée';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88}
      style={[st.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>

      {/* Barre accent top */}
      <LinearGradient
        colors={isActive ? ['#7B3FF2', '#E0389A'] : [colors.divider, colors.divider]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: 3, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      />

      <View style={{ padding: 14, gap: 10 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <LinearGradient
            colors={isActive ? ['#7B3FF2', '#E0389A'] : [colors.backgroundSecondary, colors.backgroundSecondary]}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="dollar-sign" size={18} color={isActive ? '#fff' : colors.textTertiary} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
              <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>{statusLabel}</Text>
              {item.deadline && isActive && (
                <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
                  · Deadline {new Date(item.deadline).toLocaleDateString('fr-FR')}
                </Text>
              )}
            </View>
          </View>
          {/* Badge ma contribution */}
          {hasPaid && (
            <View style={{ backgroundColor: '#10B98120', borderRadius: 10, padding: 6 }}>
              <Icon name="check-circle" size={16} color="#10B981" />
            </View>
          )}
          {isExempt && (
            <View style={{ backgroundColor: '#F59E0B20', borderRadius: 10, padding: 6 }}>
              <Icon name="shield" size={16} color="#F59E0B" />
            </View>
          )}
        </View>

        {/* Barre de progression */}
        <View>
          <View style={[st.progressTrack, { backgroundColor: colors.backgroundSecondary }]}>
            <LinearGradient
              colors={item.progress_pct >= 100 ? ['#10B981', '#059669'] : ['#7B3FF2', '#E0389A']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[st.progressFill, { width: `${Math.min(item.progress_pct, 100)}%` as any }]}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              <Text style={{ fontWeight: '800', color: '#7B3FF2' }}>
                {item.collected_coins.toLocaleString('fr-FR')}
              </Text> coins collectés
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
              {item.progress_pct}% · {item.member_count_paid}/{item.member_count_total} membres
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={[st.statsRow, { borderTopColor: colors.divider }]}>
          {[
            { icon: 'zap',   val: `${item.amount_per_member} coins`, lbl: 'Par membre' },
            { icon: 'target',val: `${item.target_amount_coins.toLocaleString('fr-FR')}`, lbl: 'Objectif' },
            { icon: 'users', val: `${item.member_count_paid}/${item.member_count_total}`, lbl: 'Cotisé' },
          ].map(s => (
            <View key={s.lbl} style={{ flex: 1, alignItems: 'center' }}>
              <Icon name={s.icon} size={13} color="#7B3FF2" style={{ marginBottom: 2 }} />
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '800' }}>{s.val}</Text>
              <Text style={{ color: colors.textTertiary, fontSize: 10 }}>{s.lbl}</Text>
            </View>
          ))}
        </View>

        {/* Bouton payer */}
        {isActive && !hasPaid && !isExempt && (
          <TouchableOpacity onPress={onPay} activeOpacity={0.85} style={{ borderRadius: 12, overflow: 'hidden' }}>
            <LinearGradient
              colors={['#7B3FF2', '#E0389A']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 12, borderRadius: 12 }}
            >
              <Icon name="zap" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                Payer {item.amount_per_member} coins
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
        {hasPaid && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 6, backgroundColor: '#10B98115', borderRadius: 12, paddingVertical: 10 }}>
            <Icon name="check-circle" size={15} color="#10B981" />
            <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '700' }}>
              Payé le {item.my_contribution?.paid_at
                ? new Date(item.my_contribution.paid_at).toLocaleDateString('fr-FR')
                : '—'}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────

export const CommunityFundScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { communityId, communityName, myRole, myId } = route.params;

  const isAdmin = myRole === 'admin' || myRole === 'moderator';

  const [cotisations, setCotisations] = useState<Cotisation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [createOpen,  setCreateOpen]  = useState(false);
  const [paying,      setPaying]      = useState<string | null>(null);

  // Form
  const [formTitle,       setFormTitle]       = useState('');
  const [formDesc,        setFormDesc]        = useState('');
  const [formAmount,      setFormAmount]      = useState('');
  const [formDeadline,    setFormDeadline]    = useState<Date | null>(null);
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [saving,          setSaving]          = useState(false);

  const BASE = `/api/v1/communities/${communityId}/cotisations`;

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<Cotisation[]>(BASE);
      setCotisations(res.data ?? []);
    } catch { setCotisations([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [BASE]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!formTitle.trim()) { Alert.alert('Erreur', 'Le titre est requis.'); return; }
    const amount = parseInt(formAmount, 10);
    if (!amount || amount < 1) { Alert.alert('Erreur', 'Le montant doit être supérieur à 0.'); return; }
    setSaving(true);
    try {
      await apiClient.post(BASE, {
        title:             formTitle.trim(),
        description:       formDesc.trim() || undefined,
        amount_per_member: amount,
        deadline:          formDeadline ? formDeadline.toISOString() : undefined,
      });
      setCreateOpen(false);
      setFormTitle(''); setFormDesc(''); setFormAmount(''); setFormDeadline(null);
      load();
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible de créer la cotisation.');
    } finally { setSaving(false); }
  };

  const handlePay = async (c: Cotisation) => {
    Alert.alert(
      `Payer ${c.amount_per_member} coins`,
      `Confirmer votre participation à "${c.title}" ?\n${c.amount_per_member} coins seront débités de votre wallet.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: `Payer ${c.amount_per_member} coins`,
          onPress: async () => {
            setPaying(c.id);
            try {
              await apiClient.post(`${BASE}/${c.id}/pay`);
              load();
            } catch (e: any) {
              const status = e?.response?.status;
              const detail = e?.response?.data?.detail ?? '';
              if (status === 402) {
                Alert.alert(
                  'Solde insuffisant',
                  `Il vous faut ${c.amount_per_member} coins pour participer à cette cotisation.\n\nRechargez votre wallet pour continuer.`,
                  [
                    { text: 'Plus tard', style: 'cancel' },
                    { text: 'Recharger mes coins', onPress: () => nav.navigate('BuyCoins') },
                  ],
                );
              } else {
                Alert.alert('Erreur', detail || 'Impossible de payer. Réessayez.');
              }
            } finally { setPaying(null); }
          },
        },
      ],
    );
  };

  const totalCollected = cotisations.reduce((s, c) => s + c.collected_coins, 0);
  const activeCount    = cotisations.filter(c => c.status === 'active').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>Cotisations</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>{communityName}</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity
            onPress={() => setCreateOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: '#7B3FF2', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 }}
          >
            <Icon name="plus" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Lancer</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.background ?? '#0a0a0f' }}>
          <GoFolixLoader />
        </View>
      ) : (
        <FlatList
          data={cotisations}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
              colors={['#7B3FF2']} tintColor="#7B3FF2" />
          }
          ListHeaderComponent={cotisations.length > 0 ? (
            <LinearGradient colors={['#7B3FF215', '#E0389A10']}
              style={[st.summaryCard, { borderColor: '#7B3FF230' }]}>
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 14, marginBottom: 10 }}>
                Résumé · <Text style={{ color: '#7B3FF2' }}>{activeCount} active{activeCount !== 1 ? 's' : ''}</Text>
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { val: `${totalCollected.toLocaleString('fr-FR')}`, lbl: 'Coins collectés', color: '#7B3FF2' },
                  { val: `${cotisations.length}`, lbl: 'Cotisations', color: '#E0389A' },
                  { val: `${activeCount}`, lbl: 'En cours', color: '#10B981' },
                ].map(s => (
                  <View key={s.lbl} style={{ flex: 1, backgroundColor: s.color + '12',
                    borderRadius: 12, padding: 10, alignItems: 'center' }}>
                    <Text style={{ color: s.color, fontSize: 18, fontWeight: '900' }}>{s.val}</Text>
                    <Text style={{ color: colors.textTertiary, fontSize: 10, marginTop: 2 }}>{s.lbl}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          ) : null}
          renderItem={({ item }) => (
            <View>
              {paying === item.id && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)',
                  borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 10 }]}>
                  <ActivityIndicator color="#fff" size="large" />
                </View>
              )}
              <CotisationCard
                item={item}
                colors={colors}
                myRole={myRole}
                onPress={() => nav.navigate('CommunityFundDetail', { communityId, cotisationId: item.id, cotisationTitle: item.title, myRole, myId })}
                onPay={() => handlePay(item)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={st.empty}>
              <LinearGradient colors={['#7B3FF222', '#E0389A11']}
                style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name="dollar-sign" size={32} color="#7B3FF2" />
              </LinearGradient>
              <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>
                Aucune cotisation
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
                {isAdmin
                  ? 'Lance une cotisation pour collecter des fonds auprès des membres.'
                  : 'L\'admin n\'a pas encore lancé de cotisation.'}
              </Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => setCreateOpen(true)}
                  style={{ borderRadius: 20, overflow: 'hidden', marginTop: 8 }}>
                  <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="plus" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Lancer une cotisation</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Modal création */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => !saving && setCreateOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.kav} pointerEvents="box-none">
          <View style={[st.sheet, { backgroundColor: colors.background }]}>
            <View style={[st.handleWrap]}>
              <View style={[st.handle, { backgroundColor: colors.divider }]} />
            </View>
            <View style={[st.sheetHeader, { borderBottomColor: colors.divider }]}>
              <TouchableOpacity onPress={() => setCreateOpen(false)}>
                <Icon name="x" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' }}>
                Lancer une cotisation
              </Text>
              <TouchableOpacity onPress={handleCreate} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#7B3FF2" />
                  : <Text style={{ color: '#7B3FF2', fontWeight: '700', fontSize: 14 }}>Créer</Text>
                }
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled">

              {[
                { label: 'TITRE *', value: formTitle, set: setFormTitle, placeholder: 'Ex: Cotisation fête de fin d\'année', multi: false },
                { label: 'DESCRIPTION', value: formDesc, set: setFormDesc, placeholder: 'Expliquez l\'objectif…', multi: true },
              ].map(f => (
                <View key={f.label}>
                  <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>{f.label}</Text>
                  <TextInput
                    style={[st.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider,
                      ...(f.multi ? { minHeight: 80, textAlignVertical: 'top' } : {}) }]}
                    value={f.value}
                    onChangeText={f.set}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textTertiary}
                    multiline={f.multi}
                  />
                </View>
              ))}

              <View>
                <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>MONTANT PAR MEMBRE (coins) *</Text>
                <View style={[st.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider,
                  flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }]}>
                  <Icon name="zap" size={15} color="#F59E0B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}
                    value={formAmount}
                    onChangeText={v => setFormAmount(v.replace(/[^0-9]/g, ''))}
                    placeholder="100"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                  />
                  <Text style={{ color: colors.textTertiary, fontSize: 12 }}>coins</Text>
                </View>
                {formAmount ? (
                  <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4 }}>
                    = {(parseInt(formAmount || '0') / 100).toFixed(2)} € par membre
                  </Text>
                ) : null}
              </View>

              <View>
                <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>DATE LIMITE (optionnel)</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={[st.input, { backgroundColor: colors.backgroundSecondary, borderColor: formDeadline ? '#7B3FF2' : colors.divider,
                    flexDirection: 'row', alignItems: 'center', gap: 10 }]}
                  activeOpacity={0.75}
                >
                  <Icon name="calendar" size={16} color={formDeadline ? '#7B3FF2' : colors.textTertiary} />
                  <Text style={{ flex: 1, color: formDeadline ? colors.textPrimary : colors.textTertiary, fontSize: 14 }}>
                    {formDeadline
                      ? formDeadline.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                      : 'Sélectionner une date limite'}
                  </Text>
                  {formDeadline && (
                    <TouchableOpacity onPress={() => setFormDeadline(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="x" size={14} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={formDeadline ?? new Date()}
                    mode="date"
                    display="calendar"
                    minimumDate={new Date()}
                    onChange={(_, date) => {
                      setShowDatePicker(false);
                      if (date) setFormDeadline(date);
                    }}
                  />
                )}
                {formDeadline && (
                  <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4 }}>
                    Les paiements seront automatiquement bloqués après cette date.
                  </Text>
                )}
              </View>

              {/* Résumé */}
              {formAmount && parseInt(formAmount) > 0 && (
                <LinearGradient colors={['#7B3FF215', '#E0389A10']}
                  style={{ borderRadius: 14, borderWidth: 1, borderColor: '#7B3FF230', padding: 14, gap: 6 }}>
                  <Text style={{ color: '#7B3FF2', fontWeight: '800', fontSize: 13 }}>Aperçu</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    Chaque membre paiera <Text style={{ fontWeight: '800', color: colors.textPrimary }}>{formAmount} coins</Text>
                    {' '}({(parseInt(formAmount || '0') / 100).toFixed(2)} €)
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                    Le total collecté dépend du nombre de membres présents au lancement.
                  </Text>
                </LinearGradient>
              )}

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const st = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  card:         { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  summaryCard:  { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  progressTrack:{ height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  statsRow:     { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  empty:        { alignItems: 'center', paddingTop: 40, gap: 10, paddingHorizontal: 32 },
  overlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  kav:          { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  handleWrap:   { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:       { width: 40, height: 4, borderRadius: 2 },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  input:        { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
});
