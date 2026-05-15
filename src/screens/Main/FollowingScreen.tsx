import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, RefreshControl, Platform, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { VerifiedBadge } from '../../components/common/VerifiedBadge';
import type { UserPublic } from '../../types/user';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const { width: SW } = Dimensions.get('window');
const GAP      = 12;
const H_PAD    = 16;
const CARD_W   = (SW - H_PAD * 2 - GAP) / 2;
const COVER_H  = CARD_W * 0.45;
const AVATAR_SZ = CARD_W * 0.38;

export const FollowingScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute<any>();

  const routeUserId: string | undefined = route.params?.userId;
  const initialTab: 'followers' | 'following' = route.params?.tab ?? 'following';

  const [myId,         setMyId]         = useState<string | null>(null);
  const [tab,          setTab]          = useState<'followers' | 'following'>(initialTab);
  const [followers,    setFollowers]    = useState<UserPublic[]>([]);
  const [following,    setFollowing]    = useState<UserPublic[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [followState,  setFollowState]  = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const me = await authService.getMe();
      setMyId(String(me.id));
      const targetId = routeUserId ?? String(me.id);

      const [frs, fing] = await Promise.all([
        userService.getFollowers(targetId).catch(() => [] as UserPublic[]),
        userService.getFollowing(targetId).catch(() => [] as UserPublic[]),
      ]);
      setFollowers(frs);
      setFollowing(fing);

      if (routeUserId && routeUserId !== String(me.id)) {
        const myFollowing = await userService.getFollowing(String(me.id)).catch(() => [] as UserPublic[]);
        const followedIds = new Set(myFollowing.map(u => u.id));
        const state: Record<string, boolean> = {};
        [...frs, ...fing].forEach(u => { state[u.id] = followedIds.has(u.id); });
        setFollowState(state);
      } else {
        const state: Record<string, boolean> = {};
        fing.forEach(u => { state[u.id] = true; });
        setFollowState(state);
      }
    } catch (e) {
      console.warn('[Following] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [routeUserId]);

  useEffect(() => { load(); }, [load]);

  const handleFollow = async (userId: string) => {
    const isFollowed = followState[userId];
    setFollowLoading(s => ({ ...s, [userId]: true }));
    try {
      if (isFollowed) {
        await userService.unfollow(userId);
        setFollowState(s => ({ ...s, [userId]: false }));
      } else {
        await userService.follow(userId);
        setFollowState(s => ({ ...s, [userId]: true }));
      }
    } catch {}
    finally { setFollowLoading(s => ({ ...s, [userId]: false })); }
  };

  const list = tab === 'followers' ? followers : following;

  const renderSkeleton = () => (
    <View style={st.grid}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <View key={i} style={[st.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <View style={[st.cover, { backgroundColor: colors.surfaceElevated }]} />
          <View style={[st.avatarWrap, { borderColor: colors.background, backgroundColor: colors.surfaceElevated, marginTop: -(AVATAR_SZ / 2) }]} />
          <View style={st.cardBody}>
            <View style={{ height: 13, width: '65%', borderRadius: 6, backgroundColor: colors.surfaceElevated, marginTop: AVATAR_SZ / 2 + 8 }} />
            <View style={{ height: 10, width: '45%', borderRadius: 5, backgroundColor: colors.surfaceElevated, marginTop: 6 }} />
            <View style={[st.btnSkeleton, { backgroundColor: colors.surfaceElevated }]} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderCard = ({ item }: { item: UserPublic }) => {
    const isMe       = item.id === myId;
    const isFollowed = followState[item.id] ?? false;
    const isLoading  = followLoading[item.id] ?? false;
    const name       = item.display_name || item.username || 'Utilisateur';
    const initials   = name[0]?.toUpperCase() ?? '?';

    return (
      <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>

        {/* Cover gradient */}
        <TouchableOpacity activeOpacity={0.9} onPress={() => nav.navigate('UserProfile', { userId: item.id })}>
          <LinearGradient
            colors={[colors.primary + 'DD', colors.primary + '44']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={st.cover}
          >
            {item.is_online && (
              <View style={[st.onlineBadge, { backgroundColor: '#22c55e', borderColor: colors.surface }]} />
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Avatar chevauchant */}
        <TouchableOpacity
          style={[st.avatarWrap, { borderColor: colors.background, marginTop: -(AVATAR_SZ / 2) }]}
          onPress={() => nav.navigate('UserProfile', { userId: item.id })}
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
          <TouchableOpacity
            onPress={() => nav.navigate('UserProfile', { userId: item.id })}
            activeOpacity={0.8}
            style={{ alignItems: 'center', width: '100%' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <Text style={[st.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
              {item.is_verified && <VerifiedBadge size={13} />}
            </View>
            {item.username && (
              <Text style={[st.handle, { color: colors.textTertiary }]} numberOfLines={1}>@{item.username}</Text>
            )}
          </TouchableOpacity>

          {/* Bouton Suivre / Ne plus suivre */}
          {isMe ? (
            <TouchableOpacity
              style={[st.followBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border }]}
              onPress={() => nav.navigate('UserProfile', { userId: item.id })}
              activeOpacity={0.8}
            >
              <Icon name="user" size={13} color={colors.textSecondary} />
              <Text style={[st.followText, { color: colors.textSecondary }]}>Mon profil</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                st.followBtn,
                isFollowed
                  ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border }
                  : { backgroundColor: colors.primary },
              ]}
              onPress={() => handleFollow(item.id)}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={isFollowed ? colors.primary : '#fff'} />
              ) : (
                <>
                  <Icon
                    name={isFollowed ? 'user-check' : 'user-plus'}
                    size={13}
                    color={isFollowed ? colors.textSecondary : '#fff'}
                  />
                  <Text style={[st.followText, { color: isFollowed ? colors.textSecondary : '#fff' }]}>
                    {isFollowed ? 'Suivi' : 'Suivre'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: colors.textPrimary }]}>Communaute</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Onglets */}
      <View style={[st.tabs, { borderBottomColor: colors.divider, backgroundColor: colors.surface }]}>
        {(['followers', 'following'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[st.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[st.tabText, { color: tab === t ? colors.primary : colors.textTertiary }]}>
              {t === 'followers'
                ? `Abonnes${followers.length > 0 ? ` (${followers.length})` : ''}`
                : `Abonnements${following.length > 0 ? ` (${following.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? renderSkeleton() : (
        <FlatList
          data={list}
          keyExtractor={u => u.id}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={st.row}
          contentContainerStyle={list.length === 0 ? st.emptyContainer : st.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={st.empty}>
              <Icon name="users" size={52} color={colors.textTertiary} />
              <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>
                {tab === 'followers' ? 'Aucun abonne' : 'Aucun abonnement'}
              </Text>
              <Text style={[st.emptyDesc, { color: colors.textTertiary }]}>
                {tab === 'followers'
                  ? 'Personne ne vous suit encore'
                  : 'Vous ne suivez personne encore'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const st = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  title:   { fontSize: 18, fontWeight: '700' },

  tabs:    { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:     { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '600' },

  listContent: { padding: H_PAD, paddingBottom: 32 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', padding: H_PAD, gap: GAP },
  row:         { gap: GAP, marginBottom: GAP },

  card:    { width: CARD_W, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover:   { width: '100%', height: COVER_H, position: 'relative' },

  onlineBadge: {
    position: 'absolute', bottom: 8, right: 8,
    width: 10, height: 10, borderRadius: 5, borderWidth: 2,
  },

  avatarWrap: {
    width: AVATAR_SZ + 4, height: AVATAR_SZ + 4,
    borderRadius: (AVATAR_SZ + 4) / 2,
    borderWidth: 3, overflow: 'hidden', alignSelf: 'center',
  },
  avatarImg:  {
    width: AVATAR_SZ, height: AVATAR_SZ,
    borderRadius: AVATAR_SZ / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  initial:    { color: '#fff', fontWeight: '800', fontSize: AVATAR_SZ * 0.38 },

  cardBody:   {
    alignItems: 'center', paddingHorizontal: 10,
    paddingBottom: 14, paddingTop: AVATAR_SZ / 2 + 6, gap: 3,
  },
  name:       { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  handle:     { fontSize: 11, textAlign: 'center' },

  followBtn:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, marginTop: 8, borderRadius: 9, paddingVertical: 9, width: '100%',
  },
  followText: { fontSize: 13, fontWeight: '700' },
  btnSkeleton:{ height: 36, borderRadius: 9, width: '100%', marginTop: 8 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty:      { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyDesc:  { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
});
