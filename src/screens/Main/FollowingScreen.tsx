import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonUserList } from '../../components/common';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import type { UserPublic } from '../../types/user';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const FollowingScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute<any>();

  const routeUserId: string | undefined = route.params?.userId;
  const initialTab: 'followers' | 'following' = route.params?.tab ?? 'following';

  const [myId,       setMyId]       = useState<string | null>(null);
  const [tab,        setTab]        = useState<'followers' | 'following'>(initialTab);
  const [followers,  setFollowers]  = useState<UserPublic[]>([]);
  const [following,  setFollowing]  = useState<UserPublic[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
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

      // Si on regarde le profil de quelqu'un d'autre, savoir qui on suit déjà
      if (routeUserId && routeUserId !== String(me.id)) {
        const myFollowing = await userService.getFollowing(String(me.id)).catch(() => [] as UserPublic[]);
        const followedIds = new Set(myFollowing.map(u => u.id));
        const allUsers = [...frs, ...fing];
        const state: Record<string, boolean> = {};
        allUsers.forEach(u => { state[u.id] = followedIds.has(u.id); });
        setFollowState(state);
      } else {
        // Mon propre profil — je suis déjà tous les "following"
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
    const isFollowing = followState[userId];
    setFollowLoading(s => ({ ...s, [userId]: true }));
    try {
      if (isFollowing) {
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

  const renderUser = ({ item }: { item: UserPublic }) => {
    const isMe = item.id === myId;
    const isFollowed = followState[item.id] ?? false;
    const isLoadingFollow = followLoading[item.id] ?? false;
    const name = item.display_name || item.username || '?';

    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.divider }]}
        onPress={() => nav.navigate('UserProfile', { userId: item.id })}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary + '25', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>
              {name[0].toUpperCase()}
            </Text>
          </View>
        )}

        {/* Infos */}
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          {item.username && (
            <Text style={[styles.username, { color: colors.textTertiary }]} numberOfLines={1}>
              @{item.username}
            </Text>
          )}
        </View>

        {/* Bouton Suivre / Ne plus suivre (sauf pour soi-même) */}
        {!isMe && (
          <TouchableOpacity
            style={[
              styles.followBtn,
              isFollowed
                ? { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 }
                : { backgroundColor: colors.primary },
            ]}
            onPress={() => handleFollow(item.id)}
            disabled={isLoadingFollow}
            activeOpacity={0.8}
          >
            {isLoadingFollow ? (
              <ActivityIndicator size="small" color={isFollowed ? colors.textSecondary : '#fff'} />
            ) : (
              <Text style={[styles.followBtnText, { color: isFollowed ? colors.textSecondary : '#fff' }]}>
                {isFollowed ? 'Suivi' : 'Suivre'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Amis</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Onglets */}
      <View style={[styles.tabs, { borderBottomColor: colors.divider }]}>
        {(['followers', 'following'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.textTertiary }]}>
              {t === 'followers'
                ? `Abonnés${followers.length > 0 ? ` (${followers.length})` : ''}`
                : `Abonnements${following.length > 0 ? ` (${following.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <SkeletonUserList />
      ) : (
        <FlatList
          data={list}
          keyExtractor={u => u.id}
          renderItem={renderUser}
          contentContainerStyle={list.length === 0 ? styles.emptyContainer : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="users" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {tab === 'followers' ? 'Aucun abonné' : 'Aucun abonnement'}
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  title: { fontSize: 18, fontWeight: '700' },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 14, fontWeight: '600' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, flexShrink: 0 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600' },
  username: { fontSize: 12, marginTop: 2 },

  followBtn: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, minWidth: 80, alignItems: 'center', justifyContent: 'center', minHeight: 32,
  },
  followBtnText: { fontSize: 13, fontWeight: '700' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptyDesc: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
});
