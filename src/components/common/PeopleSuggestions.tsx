import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { userService } from '../../services/userService';
import { VerifiedBadge } from './VerifiedBadge';
import type { UserPublic } from '../../types';

const PAGE_SIZE = 10;

interface Props {
  users:        UserPublic[];
  loading:      boolean;
  onUserPress:  (userId: string) => void;
  onRefresh:    () => void;
}

interface ItemState {
  [id: string]: 'idle' | 'loading' | 'dismissed';
}

export const PeopleSuggestions: React.FC<Props> = ({ users, loading, onUserPress, onRefresh }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [itemState, setItemState]       = useState<ItemState>({});
  const [extraUsers, setExtraUsers]     = useState<UserPublic[]>([]);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(true);
  const [page, setPage]                 = useState(1);

  const handleFollow = async (userId: string) => {
    setItemState(s => ({ ...s, [userId]: 'loading' }));
    try {
      await userService.follow(userId);
      setItemState(s => ({ ...s, [userId]: 'dismissed' }));
    } catch {
      setItemState(s => ({ ...s, [userId]: 'idle' }));
    }
  };

  const handleDismiss = (userId: string) => {
    setItemState(s => ({ ...s, [userId]: 'dismissed' }));
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const offset = page * PAGE_SIZE;
      const next = await userService.getSuggestions(PAGE_SIZE, offset);
      if (next.length < PAGE_SIZE) setHasMore(false);
      if (next.length > 0) {
        setExtraUsers(prev => {
          const existingIds = new Set([...users, ...prev].map(u => u.id));
          return [...prev, ...next.filter(u => !existingIds.has(u.id))];
        });
        setPage(p => p + 1);
      } else {
        setHasMore(false);
      }
    } catch {
      // silencieux
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, users]);

  const allUsers = [...users, ...extraUsers];
  const visible  = allUsers.filter(u => itemState[u.id] !== 'dismissed');

  if (!loading && visible.length === 0 && !hasMore) return null;

  return (
    <View style={[styles.wrap, { borderTopColor: colors.divider, borderBottomColor: colors.divider }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Vous connaissez peut-être...</Text>
        <TouchableOpacity onPress={onRefresh} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="refresh-cw" size={15} color={loading ? colors.textDisabled : colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {loading ? (
          [0, 1, 2].map(i => (
            <View key={i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.divider }, i > 0 && { marginLeft: 10 }]}>
              <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]} />
              <View style={{ width: 80, height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated, marginTop: 10 }} />
              <View style={{ width: 56, height: 8, borderRadius: 4, backgroundColor: colors.surfaceElevated, marginTop: 5 }} />
              <View style={[styles.followBtnSkeleton, { backgroundColor: colors.surfaceElevated }]} />
            </View>
          ))
        ) : (
          <>
            {visible.map((item, idx) => {
              const name     = item.display_name ?? item.username ?? 'Utilisateur';
              const initials = name[0]?.toUpperCase() ?? '?';
              const state    = itemState[item.id] ?? 'idle';

              return (
                <View
                  key={item.id}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.divider }, idx > 0 && { marginLeft: 10 }]}
                >
                  <TouchableOpacity style={styles.dismissBtn} onPress={() => handleDismiss(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="x" size={13} color={colors.textTertiary} />
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => onUserPress(item.id)} activeOpacity={0.8} style={styles.avatarWrap}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary }]}>
                        <Text style={styles.avatarInitial}>{initials}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => onUserPress(item.id)} activeOpacity={0.8} style={{ alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
                      {item.is_verified && <VerifiedBadge size={13} />}
                    </View>
                    {item.username && (
                      <Text style={[styles.handle, { color: colors.textTertiary }]} numberOfLines={1}>@{item.username}</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.followBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleFollow(item.id)}
                    disabled={state === 'loading'}
                    activeOpacity={0.8}
                  >
                    {state === 'loading' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Icon name="user-plus" size={13} color="#fff" />
                        <Text style={styles.followText}>Suivre</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Bouton "Voir plus" */}
            {hasMore && (
              <View style={[styles.card, styles.loadMoreCard, { backgroundColor: colors.surface, borderColor: colors.divider, marginLeft: visible.length > 0 ? 10 : 0 }]}>
                <TouchableOpacity
                  style={[styles.loadMoreBtn, { borderColor: colors.primary }]}
                  onPress={loadMore}
                  disabled={loadingMore}
                  activeOpacity={0.8}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Icon name="chevrons-right" size={18} color={colors.primary} />
                      <Text style={[styles.loadMoreText, { color: colors.primary }]}>Voir plus</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 2 },

  card: {
    width: 150, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, alignItems: 'center', gap: 5, position: 'relative',
  },
  loadMoreCard: {
    justifyContent: 'center',
  },
  dismissBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarWrap: { marginTop: 6 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 24, fontWeight: '800' },
  name: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4, maxWidth: 120 },
  handle: { fontSize: 11, textAlign: 'center', marginTop: 1, maxWidth: 120 },
  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    marginTop: 4, minWidth: 88, justifyContent: 'center', minHeight: 32,
  },
  followBtnSkeleton: { width: 88, height: 32, borderRadius: 20, marginTop: 4 },
  followText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  loadMoreBtn: {
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 12, paddingVertical: 16,
    borderRadius: 12, borderWidth: 1.5, width: 110,
  },
  loadMoreText: { fontWeight: '700', fontSize: 12 },
});
