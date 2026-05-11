import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import type { MainStackParamList } from '../../navigation/MainNavigator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoleFilter = 'all' | 'admin' | 'moderator' | 'member';

interface Member {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  role: 'admin' | 'moderator' | 'member';
  joined_at: string;
  xp: number;
  level: number;
  badges: string[];
  posts_count: number;
  is_online: boolean;
}

interface RouteParams {
  communityId: string;
  communityName: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MEMBERS: Member[] = [
  { id: '1', display_name: 'Sophie Martin',  username: 'sophiem',    avatar_url: null, role: 'admin',     joined_at: '2024-01-15', xp: 4850, level: 12, badges: ['founder', 'top_contributor', 'verified'], posts_count: 234, is_online: true  },
  { id: '2', display_name: 'Lucas Dupont',   username: 'lucas_d',    avatar_url: null, role: 'moderator', joined_at: '2024-02-10', xp: 3200, level:  9, badges: ['moderator', 'helpful'],                  posts_count: 156, is_online: true  },
  { id: '3', display_name: 'Emma Leroy',     username: 'emma.l',     avatar_url: null, role: 'member',    joined_at: '2024-03-05', xp: 1450, level:  5, badges: ['early_bird'],                            posts_count:  67, is_online: false },
  { id: '4', display_name: 'Noah Bernard',   username: 'noah_b',     avatar_url: null, role: 'member',    joined_at: '2024-03-20', xp:  890, level:  3, badges: [],                                        posts_count:  34, is_online: true  },
  { id: '5', display_name: 'Jade Moreau',    username: 'jade.m',     avatar_url: null, role: 'moderator', joined_at: '2024-02-28', xp: 2780, level:  8, badges: ['moderator', 'event_master'],             posts_count: 112, is_online: false },
  { id: '6', display_name: 'Théo Laurent',   username: 'theo_l',     avatar_url: null, role: 'member',    joined_at: '2024-04-01', xp:  540, level:  2, badges: ['newcomer'],                              posts_count:  18, is_online: false },
  { id: '7', display_name: 'Camille Petit',  username: 'camille.p',  avatar_url: null, role: 'member',    joined_at: '2024-04-15', xp:  320, level:  1, badges: [],                                        posts_count:   9, is_online: true  },
  { id: '8', display_name: 'Raphaël Simon',  username: 'raph_s',     avatar_url: null, role: 'member',    joined_at: '2024-05-02', xp: 1890, level:  6, badges: ['top_contributor'],                       posts_count:  89, is_online: false },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BADGE_META: Record<string, { emoji: string; label: string }> = {
  founder:         { emoji: '👑', label: 'Fondateur'      },
  top_contributor: { emoji: '🔥', label: 'Top Contributeur' },
  verified:        { emoji: '✅', label: 'Vérifié'        },
  moderator:       { emoji: '🛡️', label: 'Modérateur'     },
  helpful:         { emoji: '💡', label: 'Utile'          },
  early_bird:      { emoji: '🐦', label: 'Early Bird'     },
  event_master:    { emoji: '🎪', label: 'Event Master'   },
  newcomer:        { emoji: '🌱', label: 'Nouveau'        },
};

interface LevelInfo { title: string; color: string; nextXp: number }

function getLevelInfo(level: number, xp: number): LevelInfo {
  if (level >= 10) return { title: 'Légende',  color: '#FFD700', nextXp: 9999 };
  if (level >= 7)  return { title: 'Expert',   color: '#A855F7', nextXp: 3500 };
  if (level >= 4)  return { title: 'Confirmé', color: '#3B82F6', nextXp: 2000 };
  if (level >= 2)  return { title: 'Actif',    color: '#22C55E', nextXp: 1000 };
  return              { title: 'Novice',    color: '#94A3B8', nextXp: 500  };
}

function getXpProgress(xp: number, level: number): number {
  const thresholds = [0, 500, 1000, 2000, 3500, 9999];
  const idx = Math.min(level - 1, thresholds.length - 2);
  const low  = thresholds[idx]  ?? 0;
  const high = thresholds[idx + 1] ?? 9999;
  return Math.min((xp - low) / (high - low), 1);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

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
  admin:     '#FFD700',
  moderator: '#A855F7',
  member:    '#3B82F6',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface XpBarProps { progress: number; color: string }

function XpBar({ progress, color }: XpBarProps) {
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
    <View style={styles.xpBarTrack}>
      <Animated.View style={[styles.xpBarFill, { width, backgroundColor: color }]} />
    </View>
  );
}

interface AvatarProps { name: string; size: number; color: string; isOnline?: boolean }

function Avatar({ name, size, color, isOnline }: AvatarProps) {
  const fontSize = size * 0.38;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatarBase,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '33', borderColor: color + '66' },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize, color }]}>{getInitials(name)}</Text>
      </View>
      {isOnline && (
        <View style={[styles.onlineDot, { bottom: 1, right: 1 }]} />
      )}
    </View>
  );
}

interface MemberCardProps { member: Member; onPress: () => void }

function MemberCard({ member, onPress }: MemberCardProps) {
  const { theme: { colors } } = useTheme();
  const levelInfo  = getLevelInfo(member.level, member.xp);
  const progress   = getXpProgress(member.xp, member.level);
  const visibleBadges = member.badges.slice(0, 3);

  return (
    <TouchableOpacity
      style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Left: avatar */}
      <View style={styles.memberLeft}>
        <Avatar name={member.display_name} size={48} color={levelInfo.color} isOnline={member.is_online} />
      </View>

      {/* Center: info */}
      <View style={styles.memberCenter}>
        <View style={styles.memberNameRow}>
          <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
            {member.display_name}
          </Text>
          {/* Role badge */}
          <View style={[styles.roleBadge, { backgroundColor: ROLE_COLOR[member.role] + '22', borderColor: ROLE_COLOR[member.role] + '55' }]}>
            <Text style={[styles.roleBadgeText, { color: ROLE_COLOR[member.role] }]}>
              {ROLE_LABEL[member.role]}
            </Text>
          </View>
        </View>

        <Text style={[styles.memberUsername, { color: colors.textTertiary }]}>@{member.username}</Text>

        {/* XP bar */}
        <View style={styles.xpRow}>
          <Text style={[styles.levelLabel, { color: levelInfo.color }]}>Niv.{member.level}</Text>
          <XpBar progress={progress} color={levelInfo.color} />
          <Text style={[styles.xpText, { color: colors.textTertiary }]}>{member.xp} XP</Text>
        </View>

        {/* Badges + stats */}
        <View style={styles.memberMeta}>
          {visibleBadges.length > 0 && (
            <View style={styles.badgesRow}>
              {visibleBadges.map(b => (
                <Text key={b} style={styles.badgeEmoji}>
                  {BADGE_META[b]?.emoji ?? ''}
                </Text>
              ))}
              {member.badges.length > 3 && (
                <Text style={[styles.badgeMore, { color: colors.textTertiary }]}>
                  +{member.badges.length - 3}
                </Text>
              )}
            </View>
          )}
          <View style={styles.statsPill}>
            <Icon name="file-text" size={11} color={colors.textTertiary} />
            <Text style={[styles.statsText, { color: colors.textTertiary }]}>{member.posts_count}</Text>
            <Text style={[styles.statsDot, { color: colors.divider }]}>·</Text>
            <Icon name="calendar" size={11} color={colors.textTertiary} />
            <Text style={[styles.statsText, { color: colors.textTertiary }]}>{formatDate(member.joined_at)}</Text>
          </View>
        </View>
      </View>

      {/* Right: chevron */}
      <Icon name="chevron-right" size={16} color={colors.textTertiary} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

interface PodiumCardProps { member: Member; rank: 1 | 2 | 3; onPress: () => void }

function PodiumCard({ member, rank, onPress }: PodiumCardProps) {
  const { theme: { colors } } = useTheme();
  const levelInfo = getLevelInfo(member.level, member.xp);

  const gradients: Record<number, string[]> = {
    1: ['#7B3FF2', '#4F1BBD'],
    2: ['#3B2D6E', '#22154A'],
    3: ['#2E2456', '#1A1238'],
  };

  const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.podiumCardWrapper}>
      <LinearGradient
        colors={gradients[rank]}
        style={[styles.podiumCard, rank === 1 && styles.podiumCardFirst]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.podiumRankIcon}>{rankIcon}</Text>
        <Avatar name={member.display_name} size={rank === 1 ? 52 : 42} color={levelInfo.color} />
        <Text style={styles.podiumName} numberOfLines={1}>{member.display_name}</Text>
        <Text style={styles.podiumUsername} numberOfLines={1}>@{member.username}</Text>
        <View style={[styles.podiumXpPill, { backgroundColor: levelInfo.color + '33' }]}>
          <Text style={[styles.podiumXpText, { color: levelInfo.color }]}>{member.xp} XP</Text>
        </View>
        <Text style={styles.podiumLevelTitle}>{levelInfo.title}</Text>
        {member.badges.slice(0, 2).map(b => (
          <Text key={b} style={styles.podiumBadgeEmoji}>{BADGE_META[b]?.emoji ?? ''}</Text>
        ))}
      </LinearGradient>
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
  const { communityName } = route.params;
  const { theme: { colors } } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [search, setSearch]       = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Filtered members
  const filtered = MOCK_MEMBERS.filter(m => {
    const matchRole   = roleFilter === 'all' || m.role === roleFilter;
    const matchSearch = search.trim() === '' ||
      m.display_name.toLowerCase().includes(search.toLowerCase()) ||
      m.username.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  // Top 3 by XP (always from full list, independent of filters)
  const top3 = [...MOCK_MEMBERS].sort((a, b) => b.xp - a.xp).slice(0, 3) as [Member, Member, Member];

  const handleMemberPress = (member: Member) => {
    navigation.navigate('UserProfile', { userId: member.id });
  };

  const renderMember = ({ item }: { item: Member }) => (
    <MemberCard member={item} onPress={() => handleMemberPress(item)} />
  );

  const showPodium = roleFilter === 'all' && search.trim() === '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Membres</Text>
          <View style={[styles.headerCountPill, { backgroundColor: colors.primary + '22' }]}>
            <Text style={[styles.headerCount, { color: colors.primary }]}>{MOCK_MEMBERS.length}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Search bar ── */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="search" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Rechercher un membre..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Icon name="x" size={15} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Role filter tabs ── */}
      <FlatList
        horizontal
        data={ROLE_FILTERS}
        keyExtractor={f => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item: f }) => {
          const active = roleFilter === f.key;
          return (
            <TouchableOpacity
              onPress={() => setRoleFilter(f.key)}
              style={[
                styles.filterTab,
                active
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.filterTabText, { color: active ? '#fff' : colors.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Main list ── */}
      <FlatList
        data={filtered}
        keyExtractor={m => m.id}
        renderItem={renderMember}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          showPodium ? (
            <View>
              {/* Podium section */}
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Top membres</Text>
              <View style={styles.podiumRow}>
                {/* 2nd */}
                <PodiumCard member={top3[1]} rank={2} onPress={() => handleMemberPress(top3[1])} />
                {/* 1st */}
                <PodiumCard member={top3[0]} rank={1} onPress={() => handleMemberPress(top3[0])} />
                {/* 3rd */}
                <PodiumCard member={top3[2]} rank={3} onPress={() => handleMemberPress(top3[2])} />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 20 }]}>
                Tous les membres
              </Text>
            </View>
          ) : (
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
            </Text>
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="users" size={40} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Aucun membre trouvé</Text>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerCountPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  headerCount: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Search
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

  // Filter tabs
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Section title
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 16,
  },

  // Podium
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  podiumCardWrapper: {
    flex: 1,
  },
  podiumCard: {
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  podiumCardFirst: {
    paddingVertical: 18,
    borderRadius: 18,
  },
  podiumRankIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  podiumName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  podiumUsername: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    textAlign: 'center',
  },
  podiumXpPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  podiumXpText: {
    fontSize: 12,
    fontWeight: '700',
  },
  podiumLevelTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  podiumBadgeEmoji: {
    fontSize: 14,
  },

  // List
  listContent: {
    paddingTop: 4,
  },

  // Member card
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  memberLeft: {
    marginRight: 12,
  },
  memberCenter: {
    flex: 1,
    gap: 4,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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

  // XP bar
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: '700',
    width: 40,
  },
  xpBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  xpText: {
    fontSize: 10,
    width: 52,
    textAlign: 'right',
  },

  // Member meta
  memberMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  badgeEmoji: {
    fontSize: 14,
  },
  badgeMore: {
    fontSize: 11,
    marginLeft: 2,
  },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statsText: {
    fontSize: 11,
  },
  statsDot: {
    fontSize: 11,
    marginHorizontal: 1,
  },

  // Avatar
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
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#0F0A1E',
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
