import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  ScrollView,
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

type Period = 'week' | 'month' | 'alltime';

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  username: string;
  xp: number;
  level: number;
  avatar_url: string | null;
  badge: string;
  weekly_xp: number;
  streak: number;
  is_me: boolean;
}

interface MyStats {
  rank: number;
  xp: number;
  level: number;
  weekly_xp: number;
  xp_to_next: number;
  streak: number;
}

interface RouteParams {
  communityId: string;
  communityName: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, id: '1', name: 'Sophie Martin',   username: 'sophiem',   xp: 4850, level: 12, avatar_url: null, badge: 'Légende',  weekly_xp: 320, streak: 47, is_me: false },
  { rank: 2, id: '2', name: 'Lucas Dupont',    username: 'lucas_d',   xp: 3200, level:  9, avatar_url: null, badge: 'Expert',   weekly_xp: 180, streak: 23, is_me: false },
  { rank: 3, id: '5', name: 'Jade Moreau',     username: 'jade.m',    xp: 2780, level:  8, avatar_url: null, badge: 'Expert',   weekly_xp: 210, streak: 15, is_me: false },
  { rank: 4, id: '8', name: 'Raphaël Simon',   username: 'raph_s',    xp: 1890, level:  6, avatar_url: null, badge: 'Confirmé', weekly_xp:  95, streak:  8, is_me: false },
  { rank: 5, id: '3', name: 'Emma Leroy',      username: 'emma.l',    xp: 1450, level:  5, avatar_url: null, badge: 'Confirmé', weekly_xp:  60, streak:  5, is_me: true  },
  { rank: 6, id: '4', name: 'Noah Bernard',    username: 'noah_b',    xp:  890, level:  3, avatar_url: null, badge: 'Actif',    weekly_xp:  45, streak:  3, is_me: false },
  { rank: 7, id: '6', name: 'Théo Laurent',    username: 'theo_l',    xp:  540, level:  2, avatar_url: null, badge: 'Actif',    weekly_xp:  30, streak:  1, is_me: false },
  { rank: 8, id: '7', name: 'Camille Petit',   username: 'camille.p', xp:  320, level:  1, avatar_url: null, badge: 'Novice',   weekly_xp:  20, streak:  0, is_me: false },
];

const MY_STATS: MyStats = {
  rank:       5,
  xp:         1450,
  level:      5,
  weekly_xp:  60,
  xp_to_next: 550,
  streak:     5,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'week',    label: 'Cette semaine' },
  { key: 'month',   label: 'Ce mois'       },
  { key: 'alltime', label: 'All-time'      },
];

const BADGE_COLOR: Record<string, string> = {
  Légende:  '#FFD700',
  Expert:   '#A855F7',
  Confirmé: '#3B82F6',
  Actif:    '#22C55E',
  Novice:   '#94A3B8',
};

const RANK_META = {
  1: { color: '#FFD700', bg: '#FFD70015', label: '1er', medal: '🥇' },
  2: { color: '#C0C0C0', bg: '#C0C0C015', label: '2e',  medal: '🥈' },
  3: { color: '#CD7F32', bg: '#CD7F3215', label: '3e',  medal: '🥉' },
};

const XP_THRESHOLDS = [0, 500, 1000, 2000, 3500, 6000, 9999];

const XP_HOWTO = [
  { icon: 'edit-3',    label: 'Poster',           xp: '+10 XP' },
  { icon: 'message-square', label: 'Commenter',   xp: '+5 XP'  },
  { icon: 'heart',     label: 'Réaction reçue',   xp: '+2 XP'  },
  { icon: 'calendar',  label: 'Participer event',  xp: '+50 XP' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function getXpProgress(xp: number, level: number): number {
  const idx = Math.min(level - 1, XP_THRESHOLDS.length - 2);
  const low  = XP_THRESHOLDS[idx]     ?? 0;
  const high = XP_THRESHOLDS[idx + 1] ?? 9999;
  return Math.min((xp - low) / (high - low), 1);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AnimXpBarProps { progress: number; color: string; height?: number }

function AnimXpBar({ progress, color, height = 6 }: AnimXpBarProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.xpTrack, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.xpFill,
          { width, height, borderRadius: height / 2, backgroundColor: color },
        ]}
      />
    </View>
  );
}

interface AvatarProps { name: string; size: number; color: string; isMe?: boolean }

function Avatar({ name, size, color, isMe }: AvatarProps) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatarBase,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color + '25',
            borderColor: isMe ? color : color + '55',
            borderWidth: isMe ? 2.5 : 1.5,
          },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize: size * 0.36, color }]}>
          {getInitials(name)}
        </Text>
      </View>
    </View>
  );
}

// ── Podium card ──────────────────────────────────────────────────────────────

interface PodiumCardProps {
  entry: LeaderboardEntry;
  rank: 1 | 2 | 3;
  onPress: () => void;
}

function PodiumCard({ entry, rank, onPress }: PodiumCardProps) {
  const { theme: { colors } } = useTheme();
  const meta      = RANK_META[rank];
  const badgeColor = BADGE_COLOR[entry.badge] ?? '#94A3B8';
  const progress  = getXpProgress(entry.xp, entry.level);

  const gradients: Record<number, string[]> = {
    1: ['#7B3FF2', '#4F1BBD'],
    2: ['#2A2040', '#1A1430'],
    3: ['#221A38', '#160F28'],
  };

  const heightBoost = rank === 1 ? 24 : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.podiumWrapper, { marginTop: rank === 1 ? 0 : heightBoost }]}
    >
      <LinearGradient
        colors={gradients[rank]}
        style={[
          styles.podiumCard,
          rank === 1 && styles.podiumCardFirst,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {rank === 1 && <Text style={styles.crownIcon}>👑</Text>}
        <Text style={[styles.podiumMedal, { color: meta.color }]}>{meta.medal}</Text>
        <Avatar name={entry.name} size={rank === 1 ? 54 : 44} color={badgeColor} />
        <Text style={styles.podiumName} numberOfLines={1}>{entry.name}</Text>
        <Text style={styles.podiumUsername} numberOfLines={1}>@{entry.username}</Text>
        <View style={[styles.podiumXpPill, { backgroundColor: badgeColor + '25' }]}>
          <Text style={[styles.podiumXpText, { color: badgeColor }]}>
            {entry.xp.toLocaleString()} XP
          </Text>
        </View>
        <Text style={[styles.podiumBadgeLabel, { color: 'rgba(255,255,255,0.55)' }]}>
          {entry.badge}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ── Rank list item ────────────────────────────────────────────────────────────

interface RankItemProps {
  entry: LeaderboardEntry;
  onPress: () => void;
}

function RankItem({ entry, onPress }: RankItemProps) {
  const { theme: { colors } } = useTheme();
  const badgeColor = BADGE_COLOR[entry.badge] ?? '#94A3B8';

  return (
    <TouchableOpacity
      style={[
        styles.rankItem,
        entry.is_me && { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' },
        !entry.is_me && { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Rank number */}
      <View style={styles.rankNumWrap}>
        <Text style={[styles.rankNum, { color: entry.is_me ? colors.primary : colors.textTertiary }]}>
          #{entry.rank}
        </Text>
      </View>

      {/* Avatar */}
      <Avatar name={entry.name} size={40} color={badgeColor} isMe={entry.is_me} />

      {/* Info */}
      <View style={styles.rankInfo}>
        <View style={styles.rankNameRow}>
          <Text style={[styles.rankName, { color: colors.textPrimary }]} numberOfLines={1}>
            {entry.name}
            {entry.is_me && (
              <Text style={[styles.rankMeLabel, { color: colors.primary }]}> (moi)</Text>
            )}
          </Text>
          <View style={[styles.rankBadgePill, { backgroundColor: badgeColor + '20', borderColor: badgeColor + '45' }]}>
            <Text style={[styles.rankBadgeText, { color: badgeColor }]}>{entry.badge}</Text>
          </View>
        </View>
        <Text style={[styles.rankUsername, { color: colors.textTertiary }]}>@{entry.username}</Text>
      </View>

      {/* XP stats */}
      <View style={styles.rankXpWrap}>
        <Text style={[styles.rankXpTotal, { color: colors.textPrimary }]}>
          {entry.xp.toLocaleString()} XP
        </Text>
        <Text style={[styles.rankXpWeekly, { color: colors.textTertiary }]}>
          +{entry.weekly_xp} / sem.
        </Text>
        {entry.streak > 0 && (
          <View style={styles.streakPill}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={[styles.streakText, { color: '#F97316' }]}>{entry.streak}j</Text>
          </View>
        )}
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

export function CommunityLeaderboardScreen({ route }: Props) {
  const { communityName } = route.params;
  const { theme: { colors } } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [period, setPeriod] = useState<Period>('week');

  const myXpProgress = getXpProgress(MY_STATS.xp, MY_STATS.level);

  const top3    = MOCK_LEADERBOARD.slice(0, 3) as [LeaderboardEntry, LeaderboardEntry, LeaderboardEntry];
  const restList = MOCK_LEADERBOARD.slice(3);

  const handleMemberPress = (entry: LeaderboardEntry) => {
    navigation.navigate('UserProfile', { userId: entry.id });
  };

  // Rewards unlock logic
  const top3Unlocked    = MY_STATS.rank <= 3;
  const xp100Unlocked   = MY_STATS.weekly_xp >= 100;
  const streak7Unlocked = MY_STATS.streak >= 7;

  const rewards = [
    {
      icon: '🎖️',
      title: 'Top 3 ce mois',
      desc: 'Atteindre le podium mensuel',
      unlocked: top3Unlocked,
      progress: Math.min(1, (8 - MY_STATS.rank) / 5),
      hint: top3Unlocked ? 'Débloqué !' : `Actuel : #${MY_STATS.rank} — objectif : top 3`,
    },
    {
      icon: '🏆',
      title: '100 XP cette semaine',
      desc: 'Gagner 100 XP en une semaine',
      unlocked: xp100Unlocked,
      progress: Math.min(1, MY_STATS.weekly_xp / 100),
      hint: xp100Unlocked ? 'Débloqué !' : `${MY_STATS.weekly_xp} / 100 XP`,
    },
    {
      icon: '🔥',
      title: '7 jours de suite',
      desc: 'Maintenir un streak de 7 jours',
      unlocked: streak7Unlocked,
      progress: Math.min(1, MY_STATS.streak / 7),
      hint: streak7Unlocked ? 'Débloqué !' : `${MY_STATS.streak} / 7 jours`,
    },
  ];

  const renderListItem = ({ item }: { item: LeaderboardEntry }) => (
    <RankItem entry={item} onPress={() => handleMemberPress(item)} />
  );

  const ListHeader = (
    <>
      {/* ── Ma position card ── */}
      <LinearGradient
        colors={['#4F1BBD', '#7B3FF2', '#9B65F5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.myCard}
      >
        <View style={styles.myCardTop}>
          <View style={styles.myCardLeft}>
            <Text style={styles.myCardRankLabel}>Ma position</Text>
            <Text style={styles.myCardRank}>#{MY_STATS.rank}</Text>
          </View>
          <View style={styles.myCardRight}>
            <View style={styles.myCardStatRow}>
              <Icon name="zap" size={13} color="#FFD700" />
              <Text style={styles.myCardStatText}>{MY_STATS.xp.toLocaleString()} XP</Text>
            </View>
            <View style={styles.myCardStatRow}>
              <Text style={styles.myCardStreakEmoji}>🔥</Text>
              <Text style={styles.myCardStatText}>{MY_STATS.streak} jours consécutifs</Text>
            </View>
            <View style={styles.myCardStatRow}>
              <Icon name="trending-up" size={13} color="#A3E635" />
              <Text style={styles.myCardStatText}>+{MY_STATS.weekly_xp} XP cette semaine</Text>
            </View>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.myCardProgressWrap}>
          <View style={styles.myCardProgressHeader}>
            <Text style={styles.myCardProgressLabel}>Niveau {MY_STATS.level}</Text>
            <Text style={styles.myCardProgressLabel}>{MY_STATS.xp_to_next} XP avant niveau {MY_STATS.level + 1}</Text>
          </View>
          <AnimXpBar progress={myXpProgress} color="#FFD700" height={7} />
        </View>
      </LinearGradient>

      {/* ── Podium ── */}
      <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>PODIUM</Text>
      <View style={styles.podiumRow}>
        {/* 2nd */}
        <PodiumCard entry={top3[1]} rank={2} onPress={() => handleMemberPress(top3[1])} />
        {/* 1st — centre surélevé */}
        <PodiumCard entry={top3[0]} rank={1} onPress={() => handleMemberPress(top3[0])} />
        {/* 3rd */}
        <PodiumCard entry={top3[2]} rank={3} onPress={() => handleMemberPress(top3[2])} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textTertiary, marginTop: 20 }]}>
        CLASSEMENT
      </Text>
    </>
  );

  const ListFooter = (
    <>
      {/* ── Récompenses de saison ── */}
      <Text style={[styles.sectionTitle, { color: colors.textTertiary, marginTop: 24 }]}>
        RECOMPENSES DE SAISON
      </Text>
      <View style={[styles.rewardsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {rewards.map((r, i) => (
          <View key={r.title}>
            {i > 0 && <View style={[styles.rewardDivider, { backgroundColor: colors.border }]} />}
            <View style={styles.rewardRow}>
              <View style={[
                styles.rewardIconWrap,
                { backgroundColor: r.unlocked ? colors.primary + '20' : colors.backgroundSecondary },
              ]}>
                <Text style={styles.rewardIcon}>{r.icon}</Text>
              </View>
              <View style={styles.rewardContent}>
                <View style={styles.rewardTitleRow}>
                  <Text style={[styles.rewardTitle, { color: r.unlocked ? colors.textPrimary : colors.textSecondary }]}>
                    {r.title}
                  </Text>
                  {r.unlocked && (
                    <View style={[styles.unlockedBadge, { backgroundColor: '#22C55E20' }]}>
                      <Icon name="check" size={10} color="#22C55E" />
                      <Text style={[styles.unlockedText, { color: '#22C55E' }]}>Débloqué</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.rewardDesc, { color: colors.textTertiary }]}>{r.desc}</Text>
                <AnimXpBar
                  progress={r.progress}
                  color={r.unlocked ? '#22C55E' : colors.primary}
                  height={4}
                />
                <Text style={[styles.rewardHint, { color: colors.textTertiary }]}>{r.hint}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* ── Comment gagner des XP ── */}
      <Text style={[styles.sectionTitle, { color: colors.textTertiary, marginTop: 24 }]}>
        COMMENT GAGNER DES XP ?
      </Text>
      <View style={[styles.howtoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {XP_HOWTO.map((item, i) => (
          <View key={item.label}>
            {i > 0 && <View style={[styles.howtoDivider, { backgroundColor: colors.border }]} />}
            <View style={styles.howtoRow}>
              <View style={[styles.howtoIconWrap, { backgroundColor: colors.primary + '15' }]}>
                <Icon name={item.icon as any} size={15} color={colors.primary} />
              </View>
              <Text style={[styles.howtoLabel, { color: colors.textSecondary }]}>{item.label}</Text>
              <View style={[styles.howtoXpPill, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '45' }]}>
                <Text style={[styles.howtoXpText, { color: colors.primary }]}>{item.xp}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: insets.bottom + 32 }} />
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Classement</Text>
          <Text style={[styles.headerSub, { color: colors.textTertiary }]} numberOfLines={1}>
            {communityName}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Period selector ── */}
      <View style={[styles.periodBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {PERIOD_TABS.map(t => {
          const active = period === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setPeriod(t.key)}
              style={[
                styles.periodTab,
                active && { backgroundColor: colors.primary },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.periodTabText,
                { color: active ? '#fff' : colors.textTertiary },
              ]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Main list ── */}
      <FlatList
        data={restList}
        keyExtractor={item => item.id}
        renderItem={renderListItem}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </View>
  );
}

export default CommunityLeaderboardScreen;

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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Period tabs
  periodBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  periodTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  periodTabText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // List content
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // My card
  myCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
  },
  myCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 14,
  },
  myCardLeft: {
    alignItems: 'center',
  },
  myCardRankLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  myCardRank: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 42,
  },
  myCardRight: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    paddingTop: 4,
  },
  myCardStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  myCardStatText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  myCardStreakEmoji: {
    fontSize: 13,
  },
  myCardProgressWrap: {
    gap: 6,
  },
  myCardProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  myCardProgressLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '600',
  },

  // Section title
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 12,
  },

  // Podium
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  podiumWrapper: {
    flex: 1,
  },
  podiumCard: {
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  podiumCardFirst: {
    paddingVertical: 20,
    borderRadius: 18,
  },
  crownIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  podiumMedal: {
    fontSize: 20,
    marginBottom: 4,
  },
  podiumName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  podiumUsername: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    textAlign: 'center',
  },
  podiumXpPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  podiumXpText: {
    fontSize: 11,
    fontWeight: '800',
  },
  podiumBadgeLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Rank item
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  rankNumWrap: {
    width: 28,
    alignItems: 'center',
  },
  rankNum: {
    fontSize: 13,
    fontWeight: '800',
  },
  rankInfo: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  rankNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  rankName: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  rankMeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  rankBadgePill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rankBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rankUsername: {
    fontSize: 11,
  },
  rankXpWrap: {
    alignItems: 'flex-end',
    gap: 3,
  },
  rankXpTotal: {
    fontSize: 13,
    fontWeight: '800',
  },
  rankXpWeekly: {
    fontSize: 10,
    fontWeight: '500',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  streakEmoji: {
    fontSize: 11,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Avatar
  avatarBase: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // XP bar
  xpTrack: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  xpFill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },

  // Rewards
  rewardsCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  rewardDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  rewardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardIcon: {
    fontSize: 22,
  },
  rewardContent: {
    flex: 1,
    gap: 4,
  },
  rewardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rewardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  unlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  unlockedText: {
    fontSize: 10,
    fontWeight: '700',
  },
  rewardDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  rewardHint: {
    fontSize: 10,
    marginTop: 2,
  },

  // How to XP
  howtoCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  howtoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  howtoDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  howtoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howtoLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  howtoXpPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  howtoXpText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
