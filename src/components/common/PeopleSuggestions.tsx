import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Dimensions, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { userService } from '../../services/userService';
import { VerifiedBadge } from './VerifiedBadge';
import type { UserPublic } from '../../types';

const { width: SW } = Dimensions.get('window');
// Carte large et visible — environ 45% de l'écran
const CARD_W    = SW * 0.45;
const COVER_H   = CARD_W * 0.5;
const AVATAR_SZ = CARD_W * 0.4;

interface Props {
  users:       UserPublic[];
  loading:     boolean;
  onUserPress: (userId: string) => void;
  onRefresh:   () => void;
}

type ItemState = Record<string, 'idle' | 'loading' | 'followed' | 'dismissed'>;

export const PeopleSuggestions: React.FC<Props> = ({ users, loading, onUserPress, onRefresh }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [itemState, setItemState] = useState<ItemState>({});

  const handleFollow = async (userId: string) => {
    setItemState(s => ({ ...s, [userId]: 'loading' }));
    try {
      await userService.follow(userId);
      setItemState(s => ({ ...s, [userId]: 'followed' }));
    } catch {
      setItemState(s => ({ ...s, [userId]: 'idle' }));
    }
  };

  const handleDismiss = (userId: string) => {
    setItemState(s => ({ ...s, [userId]: 'dismissed' }));
  };

  const visible = users.filter(u => itemState[u.id] !== 'dismissed');

  if (!loading && visible.length === 0) return null;

  const skeletons = [0, 1, 2, 3];

  return (
    <View style={[st.wrap, { borderTopColor: colors.divider, borderBottomColor: colors.divider, backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={st.header}>
        <Text style={[st.title, { color: colors.textPrimary }]}>Vous connaissez peut-être...</Text>
        <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[st.seeAll, { color: colors.primary }]}>Actualiser</Text>
        </TouchableOpacity>
      </View>

      {/* Scroll horizontal */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.list}
      >
        {loading
          ? skeletons.map(i => (
              <View key={i} style={[st.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                {/* Cover skeleton */}
                <View style={[st.cover, { backgroundColor: colors.surfaceElevated }]} />
                {/* Avatar skeleton */}
                <View style={[st.avatarWrap, { borderColor: colors.background, backgroundColor: colors.surfaceElevated, marginTop: -(AVATAR_SZ / 2) }]} />
                <View style={st.cardBody}>
                  <View style={{ height: 13, width: '65%', borderRadius: 6, backgroundColor: colors.surfaceElevated, marginTop: AVATAR_SZ / 2 + 10 }} />
                  <View style={{ height: 10, width: '45%', borderRadius: 5, backgroundColor: colors.surfaceElevated, marginTop: 7 }} />
                  <View style={[st.btnSkeleton, { backgroundColor: colors.surfaceElevated }]} />
                </View>
              </View>
            ))
          : visible.map(item => {
              const name     = item.display_name ?? item.username ?? 'Utilisateur';
              const initials = name[0]?.toUpperCase() ?? '?';
              const state    = itemState[item.id] ?? 'idle';
              const followed = state === 'followed';

              return (
                <View key={item.id} style={[st.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>

                  {/* Bouton X */}
                  <TouchableOpacity
                    style={[st.closeBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                    onPress={() => handleDismiss(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="x" size={11} color="#fff" />
                  </TouchableOpacity>

                  {/* Cover gradient */}
                  <TouchableOpacity activeOpacity={0.9} onPress={() => onUserPress(item.id)}>
                    <LinearGradient
                      colors={[colors.primary + 'DD', colors.primary + '44']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={st.cover}
                    />
                  </TouchableOpacity>

                  {/* Avatar chevauchant */}
                  <TouchableOpacity
                    style={[st.avatarWrap, { borderColor: colors.background, marginTop: -(AVATAR_SZ / 2) }]}
                    onPress={() => onUserPress(item.id)}
                    activeOpacity={0.9}
                  >
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={st.avatarImg} />
                    ) : (
                      <LinearGradient colors={[colors.primary, colors.primary + 'AA']} style={st.avatarImg}>
                        <Text style={st.initial}>{initials}</Text>
                      </LinearGradient>
                    )}
                  </TouchableOpacity>

                  {/* Infos */}
                  <View style={st.cardBody}>
                    <TouchableOpacity onPress={() => onUserPress(item.id)} activeOpacity={0.8} style={{ alignItems: 'center', width: '100%' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <Text style={[st.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
                        {item.is_verified && <VerifiedBadge size={13} />}
                      </View>
                      {item.username && (
                        <Text style={[st.handle, { color: colors.textTertiary }]} numberOfLines={1}>@{item.username}</Text>
                      )}
                    </TouchableOpacity>

                    {/* Bouton Suivre */}
                    <TouchableOpacity
                      style={[
                        st.followBtn,
                        followed
                          ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border }
                          : { backgroundColor: colors.primary },
                      ]}
                      onPress={() => !followed && handleFollow(item.id)}
                      disabled={state === 'loading'}
                      activeOpacity={0.8}
                    >
                      {state === 'loading' ? (
                        <ActivityIndicator size="small" color={followed ? colors.primary : '#fff'} />
                      ) : (
                        <>
                          <Icon
                            name={followed ? 'user-check' : 'user-plus'}
                            size={14}
                            color={followed ? colors.textSecondary : '#fff'}
                          />
                          <Text style={[st.followText, { color: followed ? colors.textSecondary : '#fff' }]}>
                            {followed ? 'Abonné' : 'Suivre'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
        }
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  wrap:       { paddingVertical: 14, marginBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title:      { fontSize: 16, fontWeight: '800' },
  seeAll:     { fontSize: 13, fontWeight: '700' },
  list:       { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },

  card:       { width: CARD_W, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover:      { width: '100%', height: COVER_H },
  closeBtn:   { position: 'absolute', top: 8, right: 8, zIndex: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  avatarWrap: { width: AVATAR_SZ + 4, height: AVATAR_SZ + 4, borderRadius: (AVATAR_SZ + 4) / 2, borderWidth: 3, overflow: 'hidden', alignSelf: 'center' },
  avatarImg:  { width: AVATAR_SZ, height: AVATAR_SZ, borderRadius: AVATAR_SZ / 2, alignItems: 'center', justifyContent: 'center' },
  initial:    { color: '#fff', fontWeight: '800', fontSize: AVATAR_SZ * 0.38 },

  cardBody:   { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, paddingTop: AVATAR_SZ / 2 + 8, gap: 4 },
  name:       { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  handle:     { fontSize: 11, textAlign: 'center' },

  followBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, borderRadius: 8, paddingVertical: 10, width: '100%' },
  btnSkeleton:{ height: 38, borderRadius: 8, width: '100%', marginTop: 8 },
  followText: { fontSize: 14, fontWeight: '700' },
});
