import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { JoinRequest } from '../../services/communityService';

interface Props {
  route: { params: { communityId: string; communityName: string } };
}

export const CommunityJoinRequestsScreen: React.FC<Props> = ({ route }) => {
  const { communityId, communityName } = route.params;
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [requests, setRequests]   = useState<JoinRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [actionId, setActionId]   = useState<string | null>(null);

  // Reject modal
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<JoinRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefresh(true);
    try {
      const data = await communityService.getJoinRequests(communityId);
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger les demandes.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (req: JoinRequest) => {
    Alert.alert(
      'Accepter la demande',
      `Accepter ${req.display_name || req.username} dans "${communityName}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Accepter',
          onPress: async () => {
            setActionId(req.id);
            try {
              await communityService.approveJoinRequest(communityId, req.id);
              setRequests(prev => prev.filter(r => r.id !== req.id));
            } catch {
              Alert.alert('Erreur', 'Impossible d\'accepter cette demande.');
            } finally {
              setActionId(null);
            }
          },
        },
      ],
    );
  };

  const openRejectModal = (req: JoinRequest) => {
    setRejectTarget(req);
    setRejectReason('');
    setRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await communityService.rejectJoinRequest(communityId, rejectTarget.id, rejectReason.trim() || undefined);
      setRequests(prev => prev.filter(r => r.id !== rejectTarget.id));
      setRejectModal(false);
    } catch {
      Alert.alert('Erreur', 'Impossible de refuser cette demande.');
    } finally {
      setRejecting(false);
    }
  };

  function fmtDate(iso: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const s = styles(colors);

  const renderItem = ({ item }: { item: JoinRequest }) => {
    const isProcessing = actionId === item.id;
    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cardTop}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
              <Text style={[s.avatarLetter, { color: colors.primary }]}>
                {(item.display_name || item.username || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: colors.textPrimary }]}>
              {item.display_name || item.username || 'Utilisateur'}
            </Text>
            <Text style={[s.username, { color: colors.textTertiary }]}>
              @{item.username ?? '—'}
            </Text>
            {item.created_at && (
              <Text style={[s.date, { color: colors.textTertiary }]}>
                Demande le {fmtDate(item.created_at)}
              </Text>
            )}
          </View>
          {item.coins_paid > 0 && (
            <View style={[s.coinPill, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
              <Icon name="zap" size={11} color="#F59E0B" />
              <Text style={[s.coinText, { color: '#F59E0B' }]}>{item.coins_paid}</Text>
            </View>
          )}
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btnReject, { borderColor: colors.border }]}
            onPress={() => openRejectModal(item)}
            disabled={isProcessing}
            activeOpacity={0.75}
          >
            <Icon name="x" size={15} color={colors.textSecondary} />
            <Text style={[s.btnRejectTxt, { color: colors.textSecondary }]}>Refuser</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnApprove, { flex: 1, overflow: 'hidden' }]}
            onPress={() => handleApprove(item)}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <LinearGradient
                colors={['#36D9A0', '#0EA5E9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.btnApproveInner}
              >
                <Icon name="check" size={15} color="#fff" />
                <Text style={s.btnApproveTxt}>Accepter</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[s.header, {
        paddingTop: insets.top + 8,
        backgroundColor: colors.surface,
        borderBottomColor: colors.divider,
      }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.headerIcon}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            Demandes d'adhésion
          </Text>
          <Text style={[s.headerSub, { color: colors.textTertiary }]} numberOfLines={1}>
            {communityName}
          </Text>
        </View>
        {!loading && (
          <View style={[s.badge, { backgroundColor: colors.primary + '22' }]}>
            <Text style={[s.badgeTxt, { color: colors.primary }]}>{requests.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : requests.length === 0 ? (
        <View style={s.center}>
          <Icon name="inbox" size={44} color={colors.textTertiary} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucune demande en attente</Text>
          <Text style={[s.emptySub, { color: colors.textTertiary }]}>
            Les nouvelles demandes d'adhésion apparaîtront ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={r => r.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      {/* Reject modal */}
      <Modal
        visible={rejectModal}
        transparent
        animationType="fade"
        onRequestClose={() => !rejecting && setRejectModal(false)}
      >
        <View style={s.modalRoot}>
          <TouchableOpacity
            style={s.modalBg}
            activeOpacity={1}
            onPress={() => !rejecting && setRejectModal(false)}
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
              <View style={s.modalHeader}>
                <View style={[s.modalIcon, { backgroundColor: '#EF444418' }]}>
                  <Icon name="x-circle" size={20} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Refuser la demande</Text>
                  {rejectTarget && (
                    <Text style={[s.modalSub, { color: colors.textTertiary }]}>
                      {rejectTarget.display_name || rejectTarget.username}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setRejectModal(false)} disabled={rejecting}>
                  <Icon name="x" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>
                RAISON DU REFUS (optionnel)
              </Text>
              <TextInput
                style={[s.input, {
                  color: colors.textPrimary,
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: colors.divider,
                }]}
                placeholder="Ex : profil incomplet, communauté complète…"
                placeholderTextColor={colors.textTertiary}
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
                maxLength={200}
                autoFocus
              />
              <Text style={[s.charCount, { color: colors.textTertiary }]}>
                {rejectReason.length}/200
              </Text>

              <Text style={[s.modalNote, { color: colors.textTertiary }]}>
                L'utilisateur sera notifié du refus
                {rejectReason.trim() ? ' avec votre raison.' : ' sans raison spécifiée.'}
                {(rejectTarget?.coins_paid ?? 0) > 0 && (
                  ' Les coins seront remboursés automatiquement.'
                )}
              </Text>

              <TouchableOpacity
                style={[s.rejectBtn, { backgroundColor: '#EF4444' }]}
                onPress={handleReject}
                disabled={rejecting}
                activeOpacity={0.8}
              >
                {rejecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Icon name="x-circle" size={16} color="#fff" />
                    <Text style={s.rejectBtnTxt}>Confirmer le refus</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },
  badge: {
    minWidth: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  badgeTxt: { fontSize: 13, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, paddingBottom: 40 },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700' },
  username: { fontSize: 12, marginTop: 1 },
  date: { fontSize: 11, marginTop: 3 },
  coinPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1,
  },
  coinText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  btnReject: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  btnRejectTxt: { fontSize: 13, fontWeight: '600' },
  btnApprove: { borderRadius: 12, overflow: 'hidden' },
  btnApproveInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, paddingHorizontal: 16,
  },
  btnApproveTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Modal
  modalRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalBox: {
    width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 12,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  modalSub: { fontSize: 12, marginTop: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderRadius: 12,
    padding: 12, minHeight: 72,
    textAlignVertical: 'top', fontSize: 14,
  },
  charCount: { fontSize: 10, textAlign: 'right', marginTop: -4 },
  modalNote: { fontSize: 12, lineHeight: 18 },
  rejectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 4,
  },
  rejectBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
