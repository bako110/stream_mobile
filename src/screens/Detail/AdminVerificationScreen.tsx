import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { VerificationRequest } from '../../services/communityService';
import LinearGradient from 'react-native-linear-gradient';

type FilterStatus = 'pending' | 'approved' | 'rejected';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const AdminVerificationScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [filter,      setFilter]      = useState<FilterStatus>('pending');
  const [requests,    setRequests]    = useState<VerificationRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [actionItem,  setActionItem]  = useState<VerificationRequest | null>(null);
  const [note,        setNote]        = useState('');
  const [acting,      setActing]      = useState(false);
  const [actionType,  setActionType]  = useState<'approve' | 'reject' | null>(null);

  const load = useCallback(async (status: FilterStatus = filter, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await communityService.listVerificationRequests(status);
      setRequests(data);
    } catch { Alert.alert('Erreur', 'Impossible de charger les demandes'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { load(filter); }, [filter]);

  function openAction(item: VerificationRequest, type: 'approve' | 'reject') {
    setActionItem(item);
    setActionType(type);
    setNote('');
  }

  async function handleConfirmAction() {
    if (!actionItem || !actionType) return;
    setActing(true);
    try {
      if (actionType === 'approve') {
        await communityService.approveVerification(actionItem.id, note || undefined);
      } else {
        await communityService.rejectVerification(actionItem.id, note || undefined);
      }
      setActionItem(null);
      setActionType(null);
      load(filter);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Action impossible');
    } finally { setActing(false); }
  }

  const FILTERS: { key: FilterStatus; label: string; color: string }[] = [
    { key: 'pending',  label: 'En attente', color: '#F59E0B' },
    { key: 'approved', label: 'Approuvées', color: '#10B981' },
    { key: 'rejected', label: 'Refusées',   color: '#EF4444' },
  ];

  const renderItem = ({ item }: { item: VerificationRequest }) => {
    const community = item.community;
    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        {/* Communauté */}
        <View style={s.cardHeader}>
          {community?.avatar_url ? (
            <Image source={{ uri: community.avatar_url }} style={s.avatar} />
          ) : (
            <LinearGradient colors={['#7B3FF2', '#E0389A']} style={[s.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name="users" size={18} color="#fff" />
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[s.communityName, { color: colors.textPrimary }]} numberOfLines={1}>
                {community?.name ?? '—'}
              </Text>
              {community?.is_verified && (
                <View style={s.verifiedDot}>
                  <Icon name="check" size={9} color="#fff" />
                </View>
              )}
            </View>
            <Text style={[s.membersCount, { color: colors.textTertiary }]}>
              {community?.members_count ?? 0} membres
            </Text>
          </View>
          <View style={[s.statusBadge, {
            backgroundColor:
              item.status === 'pending'  ? '#F59E0B20' :
              item.status === 'approved' ? '#10B98120' : '#EF444420',
          }]}>
            <Text style={[s.statusText, {
              color:
                item.status === 'pending'  ? '#F59E0B' :
                item.status === 'approved' ? '#10B981' : '#EF4444',
            }]}>
              {item.status === 'pending' ? 'En attente' : item.status === 'approved' ? 'Approuvée' : 'Refusée'}
            </Text>
          </View>
        </View>

        {/* Demandeur */}
        <View style={[s.requesterRow, { borderTopColor: colors.divider }]}>
          {item.requester?.avatar_url ? (
            <Image source={{ uri: item.requester.avatar_url }} style={s.requesterAvatar} />
          ) : (
            <View style={[s.requesterAvatar, { backgroundColor: colors.primary + '33', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>
                {(item.requester?.display_name || item.requester?.username || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.requesterName, { color: colors.textPrimary }]}>
              {item.requester?.display_name || item.requester?.username || '—'}
            </Text>
            <Text style={[s.date, { color: colors.textTertiary }]}>
              {item.created_at ? fmtDate(item.created_at) : ''}
            </Text>
          </View>
        </View>

        {/* Raison */}
        {item.reason ? (
          <Text style={[s.reason, { color: colors.textSecondary, borderTopColor: colors.divider }]}>
            "{item.reason}"
          </Text>
        ) : null}

        {/* Note de refus/approbation */}
        {item.review_note ? (
          <Text style={[s.reviewNote, { color: colors.textTertiary, borderTopColor: colors.divider }]}>
            Note : {item.review_note}
          </Text>
        ) : null}

        {/* Actions */}
        {item.status === 'pending' && (
          <View style={[s.actions, { borderTopColor: colors.divider }]}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
              onPress={() => openAction(item, 'reject')}
            >
              <Icon name="x" size={14} color="#EF4444" />
              <Text style={[s.actionBtnText, { color: '#EF4444' }]}>Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#10B98115', borderColor: '#10B98140' }]}
              onPress={() => openAction(item, 'approve')}
            >
              <Icon name="check" size={14} color="#10B981" />
              <Text style={[s.actionBtnText, { color: '#10B981' }]}>Approuver</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Vérification des communautés</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filtres */}
      <View style={[s.filterBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterBtn, filter === f.key && { borderBottomColor: f.color, borderBottomWidth: 2 }]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.filterLabel, { color: filter === f.key ? f.color : colors.textTertiary }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(filter, true)} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Icon name="inbox" size={40} color={colors.textDisabled} />
              <Text style={[s.emptyText, { color: colors.textTertiary }]}>Aucune demande</Text>
            </View>
          }
          renderItem={renderItem}
        />
      )}

      {/* Modal action */}
      <Modal
        visible={!!actionItem}
        transparent
        animationType="fade"
        onRequestClose={() => !acting && setActionItem(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
              {actionType === 'approve' ? 'Approuver la demande' : 'Refuser la demande'}
            </Text>
            <Text style={[s.modalSub, { color: colors.textTertiary }]}>
              {actionItem?.community?.name}
            </Text>
            <TextInput
              style={[s.noteInput, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
              placeholder="Note (optionnelle, visible par le demandeur)"
              placeholderTextColor={colors.textDisabled}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={300}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
                onPress={() => setActionItem(null)}
                disabled={acting}
              >
                <Text style={[s.modalBtnText, { color: colors.textPrimary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, {
                  backgroundColor: actionType === 'approve' ? '#10B981' : '#EF4444',
                  borderColor: 'transparent',
                }]}
                onPress={handleConfirmAction}
                disabled={acting}
              >
                {acting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[s.modalBtnText, { color: '#fff' }]}>
                      {actionType === 'approve' ? 'Approuver' : 'Refuser'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },

  filterBar: { flexDirection: 'row', borderBottomWidth: 1 },
  filterBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  filterLabel: { fontSize: 13, fontWeight: '700' },

  card: {
    borderRadius: 16, borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: { width: 48, height: 48, borderRadius: 12 },
  communityName: { fontSize: 15, fontWeight: '700' },
  membersCount: { fontSize: 12, marginTop: 2 },
  verifiedDot: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: '#1D9BF0',
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },

  requesterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  requesterAvatar: { width: 30, height: 30, borderRadius: 15 },
  requesterName: { fontSize: 13, fontWeight: '600' },
  date: { fontSize: 11, marginTop: 1 },

  reason: {
    fontSize: 13, fontStyle: 'italic', lineHeight: 18,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewNote: {
    fontSize: 12, paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  actions: {
    flexDirection: 'row', gap: 10, padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  emptyText: { marginTop: 12, fontSize: 14 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalBox: { width: '100%', borderRadius: 20, padding: 24, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  modalSub: { fontSize: 13, textAlign: 'center', marginTop: -4 },
  noteInput: {
    borderRadius: 12, borderWidth: 1,
    padding: 12, fontSize: 14, minHeight: 80,
    textAlignVertical: 'top', marginTop: 4,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 12, borderWidth: 1,
  },
  modalBtnText: { fontSize: 14, fontWeight: '700' },
});
