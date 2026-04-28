import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  Image, StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonUserList } from '../../components/common';
import { apiClient, Endpoints } from '../../api';

interface BlockedUser {
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export const BlockedUsersScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, fontSize } = theme;
  const navigation = useNavigation();

  const [users,      setUsers]      = useState<BlockedUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<BlockedUser[]>(Endpoints.users.blocked);
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger la liste des utilisateurs bloqués.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      'Débloquer',
      `Débloquer @${user.username} ? Il pourra à nouveau vous suivre et vous envoyer des messages.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          style: 'destructive',
          onPress: async () => {
            setUnblocking(user.id);
            try {
              await apiClient.delete(Endpoints.users.block(user.id));
              setUsers(prev => prev.filter(u => u.id !== user.id));
            } catch {
              Alert.alert('Erreur', 'Impossible de débloquer cet utilisateur.');
            } finally {
              setUnblocking(null);
            }
          },
        },
      ],
    );
  };

  const displayName = (u: BlockedUser) => {
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ');
    return (u.display_name ?? full) || u.username;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header — même pattern que PrivacyScreen */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Utilisateurs bloqués</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <SkeletonUserList />
      ) : (
        <FlatList
          data={users}
          keyExtractor={u => u.id}
          contentContainerStyle={users.length === 0 ? styles.emptyContainer : { padding: 16, gap: 10 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="user-check" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Aucun utilisateur bloqué
              </Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Les utilisateurs que vous bloquez apparaîtront ici.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
              <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                    <Icon name="user" size={22} color={colors.textTertiary} />
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary }}>
                    {displayName(item)}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                    @{item.username}
                  </Text>
                  {item.bio ? (
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                      {item.bio}
                    </Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.unblockBtn, { borderColor: colors.primary }]}
                  onPress={() => handleUnblock(item)}
                  disabled={unblocking === item.id}
                  activeOpacity={0.7}
                >
                  {unblocking === item.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.primary }}>
                      Débloquer
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root:              { flex: 1 },
  header:            {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 56, paddingBottom: 14, paddingHorizontal: 16,
  },
  backBtn:           { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle:       { fontSize: 18, fontWeight: '800' },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyContainer:    { flex: 1 },
  emptyTitle:        { fontSize: 17, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptyText:         { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  row:               { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  avatar:            { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  unblockBtn:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
});
