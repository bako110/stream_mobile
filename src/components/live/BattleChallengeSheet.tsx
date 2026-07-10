/**
 * BattleChallengeSheet — bottom sheet ouvert depuis LiveMoreMenu (host uniquement) pour
 * choisir un autre créateur actuellement en direct et lui envoyer une invitation de battle.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Image, ActivityIndicator, FlatList, TextInput,
} from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { battleService } from '../../services/battleService';
import type { EligibleCreator } from '../../services/battleService';

interface Props {
  visible: boolean;
  onClose: () => void;
  liveId:  string;
}

export const BattleChallengeSheet: React.FC<Props> = ({ visible, onClose, liveId }) => {
  const [loading, setLoading]     = useState(true);
  const [creators, setCreators]   = useState<EligibleCreator[]>([]);
  const [inviting, setInviting]   = useState<string | null>(null);
  const [sentTo, setSentTo]       = useState<string | null>(null);
  const [search, setSearch]       = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSentTo(null);
    setSearch('');
    battleService.listEligible(liveId)
      .then(setCreators)
      .catch(() => setCreators([]))
      .finally(() => setLoading(false));
  }, [visible, liveId]);

  const filteredCreators = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter(c => (c.host_name ?? '').toLowerCase().includes(q));
  }, [creators, search]);

  const handleInvite = async (creator: EligibleCreator) => {
    if (inviting) return;
    setInviting(creator.live_id);
    try {
      await battleService.invite(liveId, creator.live_id);
      setSentTo(creator.live_id);
    } catch {
    } finally {
      setInviting(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={s.sheet}>
              <View style={s.handle} />
              <View style={s.header}>
                <Icon name="zap" size={18} color="#7B3FF2" />
                <Text style={s.title}>Défier un créateur</Text>
              </View>
              <Text style={s.sub}>Choisis un créateur actuellement en direct pour lui envoyer une invitation de battle.</Text>

              {!loading && creators.length > 0 && (
                <View style={s.searchWrap}>
                  <Icon name="search" size={16} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Rechercher un créateur…"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    style={s.searchInput}
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                      <Icon name="x" size={16} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {loading ? (
                <ActivityIndicator color="#7B3FF2" style={{ marginVertical: 24 }} />
              ) : creators.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Icon name="video-off" size={28} color="rgba(255,255,255,0.3)" />
                  <Text style={s.emptyText}>Aucun autre créateur en direct pour le moment.</Text>
                </View>
              ) : filteredCreators.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Icon name="search" size={28} color="rgba(255,255,255,0.3)" />
                  <Text style={s.emptyText}>Aucun créateur ne correspond à « {search} ».</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredCreators}
                  keyExtractor={c => c.live_id}
                  style={{ maxHeight: 360 }}
                  renderItem={({ item }) => {
                    const isSent = sentTo === item.live_id;
                    return (
                      <View style={s.row}>
                        {item.host_avatar ? (
                          <Image source={{ uri: item.host_avatar }} style={s.avatar} />
                        ) : (
                          <View style={[s.avatar, s.avatarFallback]}>
                            <Icon name="user" size={18} color="rgba(255,255,255,0.5)" />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={s.name}>{item.host_name ?? 'Créateur'}</Text>
                          <Text style={s.viewers}>{item.current_viewers} viewer{item.current_viewers !== 1 ? 's' : ''}</Text>
                        </View>
                        <TouchableOpacity
                          style={[s.inviteBtn, isSent && s.inviteBtnSent]}
                          onPress={() => handleInvite(item)}
                          disabled={!!inviting || isSent}
                          activeOpacity={0.8}
                        >
                          {inviting === item.live_id
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={s.inviteBtnText}>{isSent ? 'Envoyé' : 'Défier'}</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
              )}

              <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={s.cancelText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#14101f',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingBottom: 30, paddingHorizontal: 18,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, padding: 0 },
  emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 14, fontWeight: '700' },
  viewers: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  inviteBtn: { backgroundColor: '#7B3FF2', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 16, minWidth: 76, alignItems: 'center' },
  inviteBtnSent: { backgroundColor: 'rgba(255,255,255,0.1)' },
  inviteBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cancelBtn: { marginTop: 12, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  cancelText: { color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '600' },
});
