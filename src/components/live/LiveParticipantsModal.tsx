/**
 * LiveParticipantsModal — Liste des participants connectés au live (LiveKit room),
 * ouverte en tapant sur le badge "N spectateurs" du header.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Image, TextInput } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';

export interface LiveParticipantInfo {
  identity:   string;
  name:       string;
  avatarUrl?: string | null;
  isHost?:    boolean;
}

const Av: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{(name || '?')[0].toUpperCase()}</Text>
  </View>
);

export const LiveParticipantsModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  participants: LiveParticipantInfo[];
}> = ({ visible, onClose, participants }) => {
  const [search, setSearch] = useState('');

  // Hote en premier, puis le reste — recherche par nom appliquee par-dessus.
  const sorted = useMemo(
    () => [...participants].sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0)),
    [participants],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(p => (p.name ?? '').toLowerCase().includes(q));
  }, [sorted, search]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={s.sheet}>
              <View style={s.handle} />

              <View style={s.header}>
                <Text style={s.title}>Participants ({participants.length})</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="x" size={20} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>

              {participants.length > 5 && (
                <View style={s.searchWrap}>
                  <Icon name="search" size={15} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Rechercher un participant…"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    style={s.searchInput}
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                      <Icon name="x" size={15} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <FlatList
                data={filtered}
                keyExtractor={p => p.identity}
                style={s.list}
                showsVerticalScrollIndicator={false}
                initialNumToRender={20}
                windowSize={7}
                renderItem={({ item }) => (
                  <View style={s.row}>
                    {item.avatarUrl
                      ? <Image source={{ uri: item.avatarUrl }} style={s.avatar} />
                      : <Av name={item.name} size={36} />
                    }
                    <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                    {item.isHost && (
                      <View style={s.hostPill}>
                        <Text style={s.hostPillText}>Hôte</Text>
                      </View>
                    )}
                  </View>
                )}
                ListEmptyComponent={
                  <Text style={s.empty}>
                    {search ? `Aucun participant ne correspond à « ${search} ».` : "Aucun participant pour l'instant"}
                  </Text>
                }
              />
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
    width: '100%',
    backgroundColor: '#14101f',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingBottom: 20, paddingHorizontal: 18,
    height: '65%',
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 14,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 13, padding: 0 },
  list: { flex: 1, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  hostPill: {
    backgroundColor: 'rgba(240,54,90,0.9)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  hostPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  empty: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
