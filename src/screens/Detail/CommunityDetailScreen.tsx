import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert, SectionList,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import { authService } from '../../services/authService';
import type { CommunityData, CommunityMemberData, BlockedMemberData } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface Props {
  route: { params: { communityId: string } };
}

export const CommunityDetailScreen: React.FC<Props> = ({ route }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { communityId } = route.params;

  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [members, setMembers] = useState<CommunityMemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [blockedMembers, setBlockedMembers] = useState<BlockedMemberData[]>([]);

  const isAdmin = myRole === 'admin';
  const isMod = myRole === 'moderator';
  const canBlock = isAdmin || isMod;

  const load = useCallback(async () => {
    try {
      const [c, membersList, me, role] = await Promise.all([
        communityService.getById(communityId),
        communityService.getMembers(communityId),
        authService.getMe(),
        communityService.getMyRole(communityId).catch(() => null),
      ]);
      setCommunity(c);
      setMembers(Array.isArray(membersList) ? membersList : []);
      const uid = String(me.id);
      setMyId(uid);
      setMyRole(role);
      setIsMember(membersList.some((m: CommunityMemberData) => m.user_id === uid));

      // Charger les bloqués si admin/mod
      if (role === 'admin' || role === 'moderator') {
        const blocked = await communityService.getBlockedMembers(communityId).catch(() => []);
        setBlockedMembers(blocked);
      }
    } catch (e) {
      console.warn('[CommunityDetail] error:', e);
    } finally { setLoading(false); }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const handleJoin = async () => {
    setActionLoading(true);
    try { await communityService.join(communityId); load(); }
    catch { Alert.alert('Erreur', 'Impossible de rejoindre'); }
    finally { setActionLoading(false); }
  };

  const handleLeave = async () => {
    if (isAdmin) {
      Alert.alert('Impossible', 'Le créateur ne peut pas quitter sa communauté');
      return;
    }
    Alert.alert('Quitter', 'Quitter cette communauté ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter', style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try { await communityService.leave(communityId); load(); }
          catch { Alert.alert('Erreur', 'Impossible de quitter'); }
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleBlock = (member: CommunityMemberData) => {
    if (member.user_id === myId) return;
    if (member.role === 'admin') {
      Alert.alert('Impossible', 'Vous ne pouvez pas bloquer un administrateur');
      return;
    }
    Alert.alert(
      'Bloquer',
      `Bloquer ${member.display_name || member.username} de cette communauté ?\nIl sera retiré et ne pourra plus rejoindre.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer', style: 'destructive',
          onPress: async () => {
            try {
              await communityService.blockMember(communityId, member.user_id);
              Alert.alert('Bloqué', `${member.display_name || member.username} a été bloqué`);
              load();
            } catch {
              Alert.alert('Erreur', 'Impossible de bloquer ce membre');
            }
          },
        },
      ],
    );
  };

  const handleUnblock = (blocked: BlockedMemberData) => {
    Alert.alert(
      'Débloquer',
      `Débloquer ${blocked.display_name || blocked.username} ? Il pourra de nouveau rejoindre la communauté.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          onPress: async () => {
            try {
              await communityService.unblockMember(communityId, blocked.user_id);
              Alert.alert('Débloqué', `${blocked.display_name || blocked.username} a été débloqué et réajouté`);
              load();
            } catch {
              Alert.alert('Erreur', 'Impossible de débloquer');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textTertiary }}>Communauté introuvable</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{community.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={members}
        keyExtractor={m => m.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16 }}>
            {/* Banner / Avatar */}
            <View style={styles.bannerArea}>
              {community.avatar_url ? (
                <Image source={{ uri: community.avatar_url }} style={styles.bigAvatar} />
              ) : (
                <View style={[styles.bigAvatar, { backgroundColor: '#36D9A0' + '33', alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="users" size={36} color="#36D9A0" />
                </View>
              )}
            </View>

            {/* Info */}
            <Text style={[styles.name, { color: colors.textPrimary }]}>{community.name}</Text>
            {community.description && (
              <Text style={[styles.desc, { color: colors.textSecondary }]}>{community.description}</Text>
            )}

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: colors.textPrimary }]}>{community.members_count}</Text>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Membres</Text>
              </View>
              {community.is_private && (
                <View style={[styles.badge, { backgroundColor: colors.backgroundSecondary }]}>
                  <Icon name="lock" size={12} color={colors.textTertiary} />
                  <Text style={[styles.badgeText, { color: colors.textTertiary }]}>Privée</Text>
                </View>
              )}
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1, backgroundColor: isMember ? colors.backgroundSecondary : colors.primary }]}
                onPress={isMember ? handleLeave : handleJoin}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={isMember ? colors.textPrimary : '#fff'} />
                ) : (
                  <>
                    <Icon name={isMember ? 'check' : 'user-plus'} size={16} color={isMember ? colors.textPrimary : '#fff'} />
                    <Text style={[styles.actionText, { color: isMember ? colors.textPrimary : '#fff' }]}>
                      {isMember ? 'Membre' : 'Rejoindre'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {isMember && (
                <TouchableOpacity
                  style={[styles.actionBtn, { flex: 1, backgroundColor: colors.primary }]}
                  onPress={() => nav.navigate('CommunityChat' as any, { communityId, communityName: community.name })}
                >
                  <Icon name="message-circle" size={16} color="#fff" />
                  <Text style={[styles.actionText, { color: '#fff' }]}>Discussion</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Members title */}
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              MEMBRES ({members.length})
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.memberRow, { borderBottomColor: colors.divider }]}
            onPress={() => nav.navigate('UserProfile', { userId: item.user_id })}
            onLongPress={() => canBlock ? handleBlock(item) : undefined}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.memberAvatar} />
            ) : (
              <View style={[styles.memberAvatar, { backgroundColor: colors.primary + '33', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {(item.display_name || item.username || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.memberName, { color: colors.textPrimary }]}>{item.display_name || item.username}</Text>
              <Text style={[styles.memberUsername, { color: colors.textTertiary }]}>@{item.username}</Text>
            </View>
            {item.role === 'admin' && (
              <View style={[styles.roleBadge, { backgroundColor: '#36D9A0' + '22' }]}>
                <Text style={{ color: '#36D9A0', fontSize: 10, fontWeight: '700' }}>ADMIN</Text>
              </View>
            )}
            {item.role === 'moderator' && (
              <View style={[styles.roleBadge, { backgroundColor: '#3B82F6' + '22' }]}>
                <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '700' }}>MOD</Text>
              </View>
            )}
            {canBlock && item.user_id !== myId && item.role !== 'admin' && (
              <TouchableOpacity
                style={[styles.blockBtn, { backgroundColor: '#EF4444' + '15' }]}
                onPress={() => handleBlock(item)}
              >
                <Icon name="slash" size={14} color="#EF4444" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          isAdmin && blockedMembers.length > 0 ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>
                BLOQUÉS ({blockedMembers.length})
              </Text>
              {blockedMembers.map(b => (
                <View key={b.id} style={[styles.memberRow, { borderBottomColor: colors.divider }]}>
                  {b.avatar_url ? (
                    <Image source={{ uri: b.avatar_url }} style={styles.memberAvatar} />
                  ) : (
                    <View style={[styles.memberAvatar, { backgroundColor: '#EF4444' + '22', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: '#EF4444', fontWeight: '700' }}>
                        {(b.display_name || b.username || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: colors.textPrimary }]}>{b.display_name || b.username}</Text>
                    <Text style={[styles.memberUsername, { color: colors.textTertiary }]}>@{b.username}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.unblockBtn, { backgroundColor: '#10B981' + '20' }]}
                    onPress={() => handleUnblock(b)}
                  >
                    <Icon name="user-check" size={14} color="#10B981" />
                    <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700', marginLeft: 4 }}>Débloquer</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  bannerArea: { alignItems: 'center', marginTop: 20, marginBottom: 16 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40 },
  name: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  desc: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 20, paddingVertical: 12, borderRadius: 10,
  },
  actionText: { fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 28, marginBottom: 8 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  memberName: { fontSize: 14, fontWeight: '600' },
  memberUsername: { fontSize: 12, marginTop: 1 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  blockBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  unblockBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
});
