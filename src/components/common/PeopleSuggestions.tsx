import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { userService } from '../../services/userService';
import { liveService } from '../../services/liveService';
import { useWs } from '../../context/WebSocketContext';
import { toastService } from '../../services/toastService';
import { VerifiedBadge } from './VerifiedBadge';
import { AvatarWithBadge } from './AvatarWithBadge';
import type { UserPublic } from '../../types';
import { FeedCardLayout, FeedRadius } from '../../theme/feed';

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
  const { liveUserIds } = useWs();
  const nav = useNavigation<any>();
  const [itemState, setItemState] = useState<ItemState>({});
  const [joiningLiveId, setJoiningLiveId] = useState<string | null>(null);

  const joinUserLive = useCallback(async (userId: string) => {
    if (joiningLiveId) return;
    setJoiningLiveId(userId);
    try {
      const lives = await liveService.getLives();
      const live = lives.find(l => String(l.user_id) === String(userId));
      if (live) {
        nav.navigate('SimpleLiveViewer', { liveId: live.id });
      } else {
        toastService.warning('Live introuvable', 'Ce live n\'est plus disponible.');
      }
    } catch {
      toastService.error('Erreur', 'Impossible de rejoindre le live pour le moment.');
    } finally {
      setJoiningLiveId(null);
    }
  }, [joiningLiveId, nav]);

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
    <View style={[st.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>

      {/* Header */}
      <View style={st.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[st.title, { color: colors.textPrimary }]} numberOfLines={1}>Des gens qui te ressemblent ✨</Text>
          <Text style={[st.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>Élargis ton cercle, un abonnement à la fois</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[st.seeAll, { color: colors.primary }]}>Rafraîchir</Text>
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
                  <View style={{ alignSelf: 'center', marginTop: -(AVATAR_SZ / 2) }}>
                    <TouchableOpacity
                      onPress={() => {
                        const isLive = item.is_live || liveUserIds.has(item.id);
                        if (isLive) joinUserLive(item.id);
                        else onUserPress(item.id);
                      }}
                      activeOpacity={0.9}
                      disabled={joiningLiveId === item.id}
                    >
                      <AvatarWithBadge
                        avatarUrl={item.avatar_url}
                        initials={initials}
                        size={AVATAR_SZ}
                        accentColor={colors.primary}
                        isOnline={item.is_online}
                        isLive={item.is_live || liveUserIds.has(item.id)}
                      />
                      {joiningLiveId === item.id && (
                        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                          <ActivityIndicator color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

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
                      {item.is_contact ? (
                        <View style={[st.signalPill, { backgroundColor: colors.primary + '18' }]}>
                          <Icon name="user-check" size={10} color={colors.primary} />
                          <Text style={[st.signalText, { color: colors.primary }]}>Dans vos contacts</Text>
                        </View>
                      ) : item.distance_km != null ? (
                        <View style={[st.signalPill, { backgroundColor: colors.textTertiary + '18' }]}>
                          <Icon name="map-pin" size={10} color={colors.textTertiary} />
                          <Text style={[st.signalText, { color: colors.textTertiary }]}>
                            À {item.distance_km < 1 ? '< 1' : Math.round(item.distance_km)} km
                          </Text>
                        </View>
                      ) : null}
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
                            {followed ? 'Abonné ✓' : 'Suivre'}
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
  // Carte flottante "douce" — même modèle que PostCard / FeedCard.
  wrap:       {
    paddingTop:       14,
    paddingBottom:    14,
    marginHorizontal: FeedCardLayout.marginHorizontal,
    marginBottom:     FeedCardLayout.gutter,
    borderRadius:     FeedCardLayout.radius,
    borderWidth:      FeedCardLayout.borderWidth,
    overflow:         'hidden',
  },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: FeedCardLayout.padH, marginBottom: 12 },
  title:      { fontSize: 16, fontWeight: '800' },
  subtitle:   { fontSize: 11, marginTop: 2 },
  seeAll:     { fontSize: 13, fontWeight: '700' },
  list:       { paddingHorizontal: FeedCardLayout.padH, gap: 10, paddingBottom: 4 },

  card:       { width: CARD_W, borderRadius: FeedRadius.media, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover:      { width: '100%', height: COVER_H },
  closeBtn:   { position: 'absolute', top: 8, right: 8, zIndex: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  avatarWrap: { width: AVATAR_SZ + 4, height: AVATAR_SZ + 4, borderRadius: (AVATAR_SZ + 4) / 2, borderWidth: 3, overflow: 'visible', alignSelf: 'center' },

  cardBody:   { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, paddingTop: AVATAR_SZ / 2 + 8, gap: 4 },
  name:       { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  handle:     { fontSize: 11, textAlign: 'center' },
  signalPill: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  signalText: { fontSize: 10, fontWeight: '700' },

  followBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, borderRadius: 8, paddingVertical: 10, width: '100%' },
  btnSkeleton:{ height: 38, borderRadius: 8, width: '100%', marginTop: 8 },
  followText: { fontSize: 14, fontWeight: '700' },
});
