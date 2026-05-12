import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  Animated,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { CommunityMemberData } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoleFilter = 'all' | 'admin' | 'moderator' | 'member';

interface RouteParams {
  communityId: string;
  communityName: string;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all',       label: 'Tous'        },
  { key: 'admin',     label: 'Admins'      },
  { key: 'moderator', label: 'Modérateurs' },
  { key: 'member',    label: 'Membres'     },
];

const ROLE_LABEL: Record<string, string> = {
  admin:     'Admin',
  moderator: 'Modérateur',
  member:    'Membre',
};

const ROLE_COLOR: Record<string, string> = {
  admin:     '#F59E0B',
  moderator: '#7B3FF2',
  member:    '#3B82F6',
};

const PODIUM_MEDAL_COLOR: Record<number, string> = { 1: '#F59E0B', 2: '#C0C0C0', 3: '#CD7F32' };

function getInitials(name: string): string {
  return (name || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function formatCoins(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CoinsBarProps { progress: number; color: string }

function CoinsBar({ progress, color }: CoinsBarProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.coinsBarTrack}>
      <Animated.View style={[styles.coinsBarFill, { width, backgroundColor: color }]} />
    </View>
  );
}

interface AvatarProps {
  name: string;
  size: number;
  role: string;
  isOnline?: boolean;
}

function Avatar({ name, size, role, isOnline }: AvatarProps) {
  const color = ROLE_COLOR[role] ?? '#3B82F6';
  const fontSize = size * 0.38;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatarBase,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color + '28',
            borderColor: color + '60',
          },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize, color }]}>{getInitials(name)}</Text>
      </View>
      {isOnline && <View style={styles.onlineDot} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Podium card
// ---------------------------------------------------------------------------

interface PodiumCardProps {
  member: CommunityMemberData;
  rank: 1 | 2 | 3;
  onPress: () => void;
  maxCoins: number;
}

function PodiumCard({ member, rank, onPress, maxCoins }: PodiumCardProps) {
  const medalColor = PODIUM_MEDAL_COLOR[rank];
  const gradientColors: Record<number, string[]> = {
    1: ['#4A2080', '#7B3FF2'],
    2: ['#1C1830', '#2A2248'],
    3: ['#1A1530', '#251D42'],
  };
  const avatarSize = rank === 1 ? 54 : 42;
  const coins = (member as any).coins ?? 0;
  const progress = maxCoins > 0 ? coins / maxCoins : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.podiumCardWrapper, rank === 1 && styles.podiumCardWrapperFirst]}
    >
      <LinearGradient
        colors={gradientColors[rank]}
        style={[styles.podiumCard, rank === 1 && styles.podiumCardFirst]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={[styles.podiumMedalBadge, { backgroundColor: medalColor + '22', borderColor: medalColor + '55' }]}>
          <Text style={[styles.podiumMedalText, { color: medalColor }]}>
            {rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}
          </Text>
        </View>

        <View style={styles.podiumAvatarWrap}>
          <View
            style={[
              styles.avatarBase,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                backgroundColor: medalColor + '28',
                borderColor: medalColor,
                borderWidth: rank === 1 ? 2.5 : 2,
              },
            ]}
          >
            <Text style={[styles.avatarText, { fontSize: avatarSize * 0.36, color: medalColor }]}>
              {getInitials(member.display_name || member.username || '?')}
            </Text>
          </View>
        </View>

        <Text style={[styles.podiumName, rank === 1 && styles.podiumNameFirst]} numberOfLines={1}>
          {member.display_name || member.username}
        </Text>

        <View style={[styles.podiumCoinsPill, { backgroundColor: '#F59E0B22' }]}>
          <Text style={styles.podiumCoinsIcon}>⚡</Text>
          <Text style={[styles.podiumCoinsText, { color: '#F59E0B' }]}>
            {formatCoins(coins)}
          </Text>
        </View>

        <CoinsBar progress={progress} color={medalColor} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Member list card
// ---------------------------------------------------------------------------

interface MemberCardProps {
  member: CommunityMemberData;
  onPress: () => void;
}

function MemberCard({ member, onPress }: MemberCardProps) {
  const { theme: { colors } } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.memberLeft}>
        <Avatar
          name={member.display_name || member.username || '?'}
          size={46}
          role={member.role}
        />
      </View>

      <View style={styles.memberCenter}>
        <View style={styles.memberNameRow}>
          <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
            {member.display_name || member.username}
          </Text>
          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor: (ROLE_COLOR[member.role] ?? '#3B82F6') + '20',
                borderColor: (ROLE_COLOR[member.role] ?? '#3B82F6') + '50',
              },
            ]}
          >
            <Text style={[styles.roleBadgeText, { color: ROLE_COLOR[member.role] ?? '#3B82F6' }]}>
              {ROLE_LABEL[member.role] ?? member.role}
            </Text>
          </View>
        </View>

        <Text style={[styles.memberUsername, { color: colors.textTertiary }]}>
          @{member.username}
        </Text>

        {member.joined_at && (
          <Text style={[styles.memberJoined, { color: colors.textTertiary }]}>
            Depuis {new Date(member.joined_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </Text>
        )}
      </View>

      <View style={styles.memberRight}>
        <Icon name="chevron-right" size={16} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface Props {
  route: { params: RouteParams };
}

export default function CommunityMembersScreen({ route }: Props) {
  const { communityId, communityName } = route.params;
  const { theme: { colors } } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [members, setMembers] = useState<CommunityMemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await communityService.getMembers(communityId);
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Filtrage local
  const filtered = members.filter(m => {
    const matchRole = roleFilter === 'all' || m.role === roleFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      q === '' ||
      (m.display_name || '').toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  // Top 3 par coins (si le backend renvoie la prop)
  const sorted = [...members].sort((a, b) => ((b as any).coins ?? 0) - ((a as any).coins ?? 0));
  const top3 = sorted.slice(0, 3);
  const maxCoins = (top3[0] as any)?.coins ?? 0;
  const showPodium = roleFilter === 'all' && search.trim() === '' && maxCoins > 0;

  const handleMemberPress = (member: CommunityMemberData) => {
    navigation.navigate('CommunityMemberProfile', {
      communityId,
      communityName,
      memberId: member.user_id,
      memberName: member.display_name || member.username || '',
    });
  };

  const renderMember = ({ item }: { item: CommunityMemberData }) => (
    <MemberCard member={item} onPress={() => handleMemberPress(item)} />
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const ListHeader = (
    <>
      {showPodium && top3.length === 3 && (
        <View style={styles.podiumSection}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>TOP MEMBRES</Text>
          <View style={styles.podiumRow}>
            <PodiumCard member={top3[1]} rank={2} onPress={() => handleMemberPress(top3[1])} maxCoins={maxCoins} />
            <PodiumCard member={top3[0]} rank={1} onPress={() => handleMemberPress(top3[0])} maxCoins={maxCoins} />
            <PodiumCard member={top3[2]} rank={3} onPress={() => handleMemberPress(top3[2])} maxCoins={maxCoins} />
          </View>
        </View>
      )}
      <Text style={[styles.sectionLabel, { color: colors.textTertiary, paddingHorizontal: 16, marginBottom: 10 }]}>
        {showPodium ? 'TOUS LES MEMBRES' : `${filtered.length} RÉSULTAT${filtered.length !== 1 ? 'S' : ''}`}
      </Text>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.divider,
            paddingTop: insets.top + 6,
          },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Membres · {members.length}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textTertiary }]} numberOfLines={1}>
            {communityName}
          </Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
        ]}
      >
        <Icon name="search" size={15} color={colors.primary} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Rechercher un membre..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="x" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Role filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ flexGrow: 0 }}
      >
        {ROLE_FILTERS.map(f => {
          const active = roleFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setRoleFilter(f.key)}
              style={[
                styles.filterPill,
                active
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.filterPillText, { color: active ? '#fff' : colors.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Main list */}
      <FlatList
        data={filtered}
        keyExtractor={m => m.id}
        renderItem={renderMember}
        ListHeaderComponent={ListHeader}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 28 }]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="users" size={44} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              Aucun membre trouvé
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
              Essayez une autre recherche ou un autre filtre.
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },

  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
  },

  podiumSection: {
    marginBottom: 24,
    paddingTop: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  podiumCardWrapper: {
    flex: 1,
    marginTop: 20,
  },
  podiumCardWrapperFirst: {
    marginTop: 0,
  },
  podiumCard: {
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 5,
  },
  podiumCardFirst: {
    paddingVertical: 18,
    borderRadius: 18,
  },
  podiumMedalBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  podiumMedalText: {
    fontSize: 15,
  },
  podiumAvatarWrap: {
    marginBottom: 2,
  },
  podiumName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  podiumNameFirst: {
    fontSize: 13,
  },
  podiumCoinsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 2,
  },
  podiumCoinsIcon: {
    fontSize: 11,
  },
  podiumCoinsText: {
    fontSize: 12,
    fontWeight: '800',
  },

  coinsBarTrack: {
    width: '80%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  coinsBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  listContent: {
    paddingTop: 0,
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  memberLeft: {
    marginRight: 12,
  },
  memberCenter: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  roleBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  memberUsername: {
    fontSize: 12,
  },
  memberJoined: {
    fontSize: 11,
    marginTop: 1,
  },

  memberRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },

  avatarBase: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  avatarText: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#0F0A1E',
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 64,
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
