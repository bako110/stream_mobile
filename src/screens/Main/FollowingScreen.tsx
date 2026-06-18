import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, RefreshControl, Platform,
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

const AVATAR_SZ = 48;

export const FollowingScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute<any>();

  const routeUserId: string | undefined = route.params?.userId;
  const initialTab: 'followers' | 'following' = route.params?.tab ?? 'following';

  const [myId,          setMyId]          = useState<string | null>(null);
  const [tab,           setTab]           = useState<'followers' | 'following'>(initialTab);
  const [followers,     setFollowers]     = useState<UserPublic[]>([]);
  const [following,     setFollowing]     = useState<UserPublic[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [followState,   setFollowState]   = useState<Record<string, boolean>>({});
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
    <View>
      {[0, 1, 2, 3, 4, 5, 6].map(i => (
        <View key={i} style={[st.row, { borderBottomColor: colors.divider }]}>
          <View style={[st.avatarSkeleton, { backgroundColor: colors.surfaceElevated }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ height: 13, width: '50%', borderRadius: 6, backgroundColor: colors.surfaceElevated }} />
            <View style={{ height: 10, width: '35%', borderRadius: 5, backgroundColor: colors.surfaceElevated }} />
          </View>
          <View style={[st.btnSkeleton, { backgroundColor: colors.surfaceElevated }]} />
        </View>
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: UserPublic }) => {
    const isMe       = item.id === myId;
    const isFollowed = followState[item.id] ?? false;
    const isLoad     = followLoading[item.id] ?? false;
    const name       = item.display_name || item.username || 'Utilisateur';
    const initials   = name[0]?.toUpperCase() ?? '?';

    return (
      <TouchableOpacity
        style={[st.row, { borderBottomColor: colors.divider }]}
        onPress={() => nav.navigate('UserProfile', { userId: item.id })}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={st.avatarWrap}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={st.avatarImg} />
          ) : (
            <LinearGradient colors={[colors.primary, colors.primary + 'AA']} style={st.avatarImg}>
              <Text style={st.initial}>{initials}</Text>
            </LinearGradient>
          )}
          {item.is_online && <View style={[st.onlineDot, { borderColor: colors.background }]} />}
        </View>

        {/* Infos */}
        <View style={st.info}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[st.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
            {item.is_verified && <VerifiedBadge size={13} />}
          </View>
          {item.username ? (
            <Text style={[st.handle, { color: colors.textTertiary }]} numberOfLines={1}>@{item.username}</Text>
          ) : null}
        </View>

        {/* Bouton */}
        {isMe ? (
          <View style={[st.btn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border }]}>
            <Text style={[st.btnText, { color: colors.textSecondary }]}>Moi</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[st.btn, isFollowed
              ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border }
              : { backgroundColor: colors.primary },
            ]}
            onPress={() => handleFollow(item.id)}
            disabled={isLoad}
            activeOpacity={0.8}
          >
            {isLoad ? (
              <ActivityIndicator size="small" color={isFollowed ? colors.primary : '#fff'} />
            ) : (
              <Text style={[st.btnText, { color: isFollowed ? colors.textSecondary : '#fff' }]}>
                {isFollowed ? 'Suivi' : 'Suivre'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: colors.textPrimary }]}>Réseau</Text>
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
                ? `Abonnés${followers.length > 0 ? ` (${followers.length})` : ''}`
                : `Abonnements${following.length > 0 ? ` (${following.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && list.length === 0 ? renderSkeleton() : (
        <FlatList
          data={list}
          keyExtractor={u => u.id}
          renderItem={renderItem}
          contentContainerStyle={list.length === 0 ? st.emptyContainer : { paddingBottom: 32 }}
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
                {tab === 'followers' ? 'Aucun abonné' : 'Aucun abonnement'}
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

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },

  avatarWrap: { position: 'relative' },
  avatarImg: {
    width: AVATAR_SZ, height: AVATAR_SZ, borderRadius: AVATAR_SZ / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  initial: { color: '#fff', fontWeight: '800', fontSize: AVATAR_SZ * 0.38 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22c55e', borderWidth: 2,
  },

  info: { flex: 1, gap: 2 },
  name:   { fontSize: 14, fontWeight: '700' },
  handle: { fontSize: 12 },

  btn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, minWidth: 80, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '700' },

  avatarSkeleton: { width: AVATAR_SZ, height: AVATAR_SZ, borderRadius: AVATAR_SZ / 2 },
  btnSkeleton:    { width: 76, height: 34, borderRadius: 20 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty:          { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle:     { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyDesc:      { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
});
