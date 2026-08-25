import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { cableService } from '../../services/cableService';
import { toastService, showConfirm } from '../../services';
import type { CableInvite } from '../../types';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { BackButton, GofolyxLoader } from '../../components/common';

type Nav = NativeStackNavigationProp<MainStackParamList>;

type Tab = 'received' | 'sent';

const STATUS_COLOR: Record<string, string> = {
  pending:   '#F59E0B',
  accepted:  '#10B981',
  declined:  '#EF4444',
  cancelled: '#6B7280',
};

const STATUS_LABEL: Record<string, string> = {
  pending:   'En attente',
  accepted:  'Acceptée',
  declined:  'Refusée',
  cancelled: 'Annulée',
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const Avatar: React.FC<{ uri?: string | null; name: string; size?: number }> = ({ uri, name, size = 44 }) => {
  const bg = '#7B3FF2';
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{name[0]?.toUpperCase()}</Text>
    </View>
  );
};

export const CableInvitesScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [tab, setTab]           = useState<Tab>('received');
  const [items, setItems]       = useState<CableInvite[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await cableService.listInvites(tab);
      setItems(res.items);
    } catch {
      toastService.error('Erreur', 'Impossible de charger les invitations Cable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleRespond = useCallback(async (invite: CableInvite, accept: boolean) => {
    setResponding(invite.id);
    try {
      const updated = await cableService.respondInvite(invite.id, accept);
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (e: any) {
      toastService.error('Erreur', e?.response?.data?.detail ?? 'Une erreur est survenue.');
    } finally {
      setResponding(null);
    }
  }, []);

  const handleCancel = useCallback(async (invite: CableInvite) => {
    showConfirm('Annuler l\'invitation ?', undefined, [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Oui', style: 'destructive', onPress: async () => {
          setResponding(invite.id);
          try {
            const updated = await cableService.cancelInvite(invite.id);
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
          } catch (e: any) {
            toastService.error('Erreur', e?.response?.data?.detail ?? 'Une erreur est survenue.');
          } finally {
            setResponding(null);
          }
        },
      },
    ]);
  }, []);

  const renderItem = useCallback(({ item }: { item: CableInvite }) => {
    const isReceived = tab === 'received';
    const person = isReceived ? item.sender : item.receiver;
    const personName = person?.display_name || person?.username || 'Utilisateur';
    const isPending = item.status === 'pending';
    const isLoading = responding === item.id;

    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Ligne principale */}
        <View style={s.cardRow}>
          <Avatar uri={person?.avatar_url} name={personName} />
          <View style={s.cardInfo}>
            <Text style={[s.personName, { color: colors.textPrimary }]} numberOfLines={1}>
              {personName}
            </Text>
            {item.message ? (
              <Text style={[s.message, { color: colors.textSecondary }]} numberOfLines={2}>
                "{item.message}"
              </Text>
            ) : (
              <Text style={[s.message, { color: colors.textTertiary }]}>
                {isReceived ? 'Veut collaborer avec toi sur un reel' : 'Tu as invité à collaborer'}
              </Text>
            )}
            <Text style={[s.date, { color: colors.textTertiary }]}>{fmt(item.created_at)}</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[item.status] + '22', borderColor: STATUS_COLOR[item.status] + '55' }]}>
            <Text style={[s.statusTxt, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
          </View>
        </View>

        {/* Vignette reel si disponible */}
        {item.reel?.thumbnail_url && (
          <View style={s.reelRow}>
            <Icon name="film" size={12} color={colors.textTertiary} />
            <Image source={{ uri: item.reel.thumbnail_url }} style={s.reelThumb} />
            <Text style={[s.reelCaption, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.reel.author?.display_name || item.reel.author?.username || 'Reel'}
            </Text>
          </View>
        )}

        {/* Actions */}
        {isPending && (
          <View style={s.actions}>
            {isReceived ? (
              <>
                <TouchableOpacity
                  style={[s.actionBtn, s.acceptBtn]}
                  onPress={() => handleRespond(item, true)}
                  disabled={!!isLoading}
                >
                  {isLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Icon name="check" size={14} color="#fff" />
                      <Text style={s.acceptTxt}>Accepter</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, s.declineBtn, { borderColor: colors.border }]}
                  onPress={() => handleRespond(item, false)}
                  disabled={!!isLoading}
                >
                  <Icon name="x" size={14} color={colors.textSecondary} />
                  <Text style={[s.declineTxt, { color: colors.textSecondary }]}>Décliner</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[s.actionBtn, s.cancelBtn, { borderColor: colors.border }]}
                onPress={() => handleCancel(item)}
                disabled={!!isLoading}
              >
                {isLoading ? <ActivityIndicator size="small" color={colors.textSecondary} /> : (
                  <>
                    <Icon name="x-circle" size={14} color={colors.textSecondary} />
                    <Text style={[s.declineTxt, { color: colors.textSecondary }]}>Annuler</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }, [tab, colors, responding, handleRespond, handleCancel]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => nav.goBack()} />
        <View style={s.headerTitle}>
          <Icon name="link-2" size={18} color="#60A5FA" />
          <Text style={[s.headerTitleTxt, { color: colors.textPrimary }]}>Invitations Cable</Text>
        </View>
        <View style={{ width: 30 }} />
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { borderBottomColor: colors.border }]}>
        {(['received', 'sent'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={s.tab} onPress={() => setTab(t)} activeOpacity={0.75}>
            <Text style={[s.tabTxt, { color: tab === t ? '#60A5FA' : colors.textSecondary }]}>
              {t === 'received' ? 'Reçues' : 'Envoyées'}
            </Text>
            {tab === t && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Liste */}
      {loading ? (
        <View style={s.center}>
          <GofolyxLoader color="#60A5FA" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 20 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#60A5FA" />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="link-2" size={40} color={colors.textTertiary} />
              <Text style={[s.emptyTxt, { color: colors.textSecondary }]}>
                {tab === 'received' ? 'Aucune invitation reçue' : 'Aucune invitation envoyée'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  headerTitleTxt: { fontSize: 17, fontWeight: '800' },

  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:  { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabTxt: { fontSize: 14, fontWeight: '700' },
  tabUnderline: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, backgroundColor: '#60A5FA', borderRadius: 2 },

  list: { padding: 16, gap: 12 },

  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardInfo: { flex: 1, gap: 3 },
  personName: { fontSize: 15, fontWeight: '700' },
  message: { fontSize: 13, lineHeight: 18 },
  date: { fontSize: 11, marginTop: 2 },

  statusBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  statusTxt: { fontSize: 11, fontWeight: '700' },

  reelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reelThumb: { width: 36, height: 36, borderRadius: 6 },
  reelCaption: { fontSize: 12, flex: 1 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  acceptBtn: { backgroundColor: '#10B981' },
  acceptTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  declineBtn: { borderWidth: 1, backgroundColor: 'transparent' },
  cancelBtn:  { borderWidth: 1, backgroundColor: 'transparent' },
  declineTxt: { fontWeight: '700', fontSize: 13 },

  empty: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyTxt: { fontSize: 15, fontWeight: '600' },
});
