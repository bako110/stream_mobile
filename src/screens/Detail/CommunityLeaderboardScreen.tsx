import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
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
import type { LeaderboardEntry, LeaderboardMyStats } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = 'week' | 'month' | 'alltime';

interface RouteParams {
  communityId: string;
  communityName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'week',    label: 'Cette semaine' },
  { key: 'month',   label: 'Ce mois'       },
  { key: 'alltime', label: 'Tout'          },
];

const PODIUM_META: Record<number, { medalColor: string; medal: string; gradients: string[] }> = {
  1: { medalColor: '#F59E0B', medal: '👑', gradients: ['#4A2080', '#7B3FF2'] },
  2: { medalColor: '#C0C0C0', medal: '🥈', gradients: ['#1E1A30', '#2C2548'] },
  3: { medalColor: '#CD7F32', medal: '🥉', gradients: ['#1C1630', '#261E44'] },
};

const COINS_HOWTO = [
  { icon: 'edit-3',         label: 'Poster',           reward: '+10 ⚡' },
  { icon: 'message-square', label: 'Commenter',         reward: '+5 ⚡'  },
  { icon: 'heart',          label: 'Réaction reçue',    reward: '+2 ⚡'  },
  { icon: 'calendar',       label: 'Participer event',  reward: '+50 ⚡' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return (name || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function formatCoins(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n);
}

// ---------------------------------------------------------------------------
// Animated progress bar
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  progress: number;
  color: string;
  height?: number;
  trackColor?: string;
}

function ProgressBar({ progress, color, height = 6, trackColor }: ProgressBarProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(Math.max(progress, 0), 1),
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.progressTrack, { height, borderRadius: height / 2, backgroundColor: trackColor ?? 'rgba(255,255,255,0.10)' }]}>
      <Animated.View style={[styles.progressFill, { width, height, borderRadius: height / 2, backgroundColor: color }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

interface AvatarProps { name: string; size: number; color: string; isMe?: boolean; isFirst?: boolean }

function Avatar({ name, size, color, isMe, isFirst }: AvatarProps) {
  return (
    <View
      style={[
        styles.avatarBase,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '28', borderColor: color, borderWidth: isMe || isFirst ? 2.5 : 1.5 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36, color }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Podium card
// ---------------------------------------------------------------------------

interface PodiumCardProps { entry: LeaderboardEntry; rank: 1 | 2 | 3; onPress: () => void }

function PodiumCard({ entry, rank, onPress }: PodiumCardProps) {
  const meta = PODIUM_META[rank] ?? PODIUM_META[3];
  const avatarSize = rank === 1 ? 56 : 44;
  const name = entry.display_name || entry.username || '?';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.podiumWrapper, rank !== 1 && styles.podiumWrapperSide]}>
      <LinearGradient colors={meta.gradients} style={[styles.podiumCard, rank === 1 && styles.podiumCardFirst]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={[styles.podiumMedalWrap, { backgroundColor: meta.medalColor + '22', borderColor: meta.medalColor + '55' }]}>
          <Text style={styles.podiumMedalEmoji}>{meta.medal}</Text>
        </View>

        <Avatar name={name} size={avatarSize} color={meta.medalColor} isFirst={rank === 1} />

        <Text style={[styles.podiumName, rank === 1 && styles.podiumNameFirst]} numberOfLines={1}>
          {name}
        </Text>

        <View style={[styles.podiumCoinsPill, { backgroundColor: '#F59E0B18' }]}>
          <Text style={styles.podiumCoinsIcon}>⚡</Text>
          <Text style={[styles.podiumCoinsText, { color: '#F59E0B' }]}>{formatCoins(entry.coins)}</Text>
        </View>

        {entry.streak > 0 && (
          <View style={styles.podiumStreakRow}>
            <Text style={styles.podiumStreakEmoji}>🔥</Text>
            <Text style={[styles.podiumStreakText, { color: 'rgba(255,255,255,0.6)' }]}>{entry.streak}j</Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Rank list item (ranks 4+)
// ---------------------------------------------------------------------------

interface RankItemProps { entry: LeaderboardEntry; onPress: () => void }

function RankItem({ entry, onPress }: RankItemProps) {
  const { theme: { colors } } = useTheme();
  const avatarColor = entry.is_me ? colors.primary : '#3B82F6';
  const name = entry.display_name || entry.username || '?';

  return (
    <TouchableOpacity
      style={[
        styles.rankItem,
        entry.is_me
          ? { backgroundColor: colors.primary + '12', borderColor: colors.primary + '55', borderLeftWidth: 3, borderLeftColor: colors.primary }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.rankNumWrap}>
        <Text style={[styles.rankNum, { color: colors.textTertiary }]}>#{entry.rank}</Text>
      </View>

      <Avatar name={name} size={38} color={avatarColor} isMe={entry.is_me} />

      <View style={styles.rankInfo}>
        <Text style={[styles.rankName, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
          {entry.is_me && <Text style={[styles.rankMeLabel, { color: colors.primary }]}> (moi)</Text>}
        </Text>
        <View style={styles.rankSubRow}>
          {entry.username && (
            <Text style={[styles.rankUsername, { color: colors.textTertiary }]}>@{entry.username}</Text>
          )}
          {entry.streak > 0 && (
            <View style={styles.rankStreakRow}>
              <Text style={styles.rankStreakEmoji}>🔥</Text>
              <Text style={[styles.rankStreakText, { color: '#F97316' }]}>{entry.streak}j</Text>
            </View>
          )}
        </View>
        <Text style={[styles.rankWeeklyCoins, { color: colors.textTertiary }]}>
          +{entry.weekly_coins} ⚡ cette sem.
        </Text>
      </View>

      <View style={styles.rankCoinsWrap}>
        <Text style={styles.rankCoinsIcon}>⚡</Text>
        <Text style={[styles.rankCoinsValue, { color: '#F59E0B' }]}>{formatCoins(entry.coins)}</Text>
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
  const { communityId, communityName } = route.params;
  const { theme: { colors } } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [period, setPeriod] = useState<Period>('week');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<LeaderboardMyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: Period = period) => {
    try {
      const [lb, me] = await Promise.all([
        communityService.getLeaderboard(communityId, p),
        communityService.getMyLeaderboardStats(communityId, p).catch(() => null),
      ]);
      setEntries(Array.isArray(lb) ? lb : []);
      setMyStats(me);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, period]);

  useEffect(() => { load(); }, [load]);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setLoading(true);
    load(p);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleMemberPress = (entry: LeaderboardEntry) => {
    navigation.navigate('CommunityMemberProfile', {
      communityId,
      communityName,
      memberId: entry.user_id,
      memberName: entry.display_name || entry.username || '',
    });
  };

  const top3 = entries.slice(0, 3);
  const restList = entries.slice(3);

  // Rewards based on real myStats
  const rewards = myStats ? [
    {
      icon: '🥇',
      title: 'Top 3 ce mois',
      desc: 'Atteindre le podium mensuel',
      unlocked: myStats.rank <= 3,
      progress: Math.min(1, Math.max(0, (entries.length - myStats.rank) / Math.max(entries.length - 3, 1))),
      hint: myStats.rank <= 3 ? 'Débloqué !' : `Actuel : #${myStats.rank} — objectif : top 3`,
    },
    {
      icon: '⚡',
      title: '500 coins cette semaine',
      desc: 'Gagner 500 coins en une semaine',
      unlocked: myStats.weekly_coins >= 500,
      progress: Math.min(1, myStats.weekly_coins / 500),
      hint: myStats.weekly_coins >= 500 ? 'Débloqué !' : `${myStats.weekly_coins} / 500 coins`,
    },
    {
      icon: '🔥',
      title: '7 jours de suite',
      desc: 'Maintenir un streak de 7 jours',
      unlocked: myStats.streak >= 7,
      progress: Math.min(1, myStats.streak / 7),
      hint: myStats.streak >= 7 ? 'Débloqué !' : `${myStats.streak} / 7 jours`,
    },
  ] : [];

  const progressToNext = myStats
    ? myStats.coins_to_next > 0
      ? Math.min(1, 1 - myStats.coins_to_next / (myStats.coins_to_next + myStats.weekly_coins))
      : 1
    : 0;

  const renderItem = ({ item }: { item: LeaderboardEntry }) => (
    <RankItem entry={item} onPress={() => handleMemberPress(item)} />
  );

  const ListHeader = (
    <>
      {/* Ma position */}
      {myStats && (
        <LinearGradient
          colors={['#3A1480', '#5B28CC', '#7B3FF2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.myCard}
        >
          <View style={styles.myCardTop}>
            <View style={styles.myCardRankBlock}>
              <Text style={styles.myCardRankLabel}>Ton classement</Text>
              <Text style={styles.myCardRank}>#{myStats.rank}</Text>
            </View>

            <View style={styles.myCardStats}>
              <View style={styles.myCardStatRow}>
                <Text style={styles.myCardCoinsIcon}>⚡</Text>
                <Text style={styles.myCardStatValue}>{myStats.coins.toLocaleString('fr-FR')}</Text>
                <Text style={styles.myCardStatUnit}> coins</Text>
              </View>
              <View style={styles.myCardStatRow}>
                <Text style={styles.myCardStreakEmoji}>🔥</Text>
                <Text style={styles.myCardStatValue}>{myStats.streak}</Text>
                <Text style={styles.myCardStatUnit}> jours consécutifs</Text>
              </View>
              <View style={styles.myCardStatRow}>
                <Icon name="trending-up" size={12} color="#A3E635" />
                <Text style={[styles.myCardStatValue, { marginLeft: 4 }]}>+{myStats.weekly_coins}</Text>
                <Text style={styles.myCardStatUnit}> ⚡ cette sem.</Text>
              </View>
            </View>
          </View>

          <View style={styles.myCardProgress}>
            <View style={styles.myCardProgressHeader}>
              <Text style={styles.myCardProgressLabel}>
                {myStats.coins_to_next} ⚡ pour rejoindre le rang {myStats.rank - 1}
              </Text>
              <Text style={styles.myCardProgressPct}>{Math.round(progressToNext * 100)}%</Text>
            </View>
            <ProgressBar progress={progressToNext} color="#F59E0B" height={7} />
          </View>
        </LinearGradient>
      )}

      {/* Podium top 3 */}
      {top3.length === 3 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>PODIUM</Text>
          <View style={[styles.podiumContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.podiumRow}>
              <PodiumCard entry={top3[1]} rank={2} onPress={() => handleMemberPress(top3[1])} />
              <PodiumCard entry={top3[0]} rank={1} onPress={() => handleMemberPress(top3[0])} />
              <PodiumCard entry={top3[2]} rank={3} onPress={() => handleMemberPress(top3[2])} />
            </View>
          </View>
        </>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textTertiary, marginTop: 22 }]}>CLASSEMENT</Text>
    </>
  );

  const ListFooter = (
    <>
      {rewards.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary, marginTop: 24 }]}>RECOMPENSES</Text>
          <View style={[styles.rewardsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {rewards.map((r, i) => (
              <View key={r.title}>
                {i > 0 && <View style={[styles.cardDivider, { backgroundColor: colors.divider }]} />}
                <View style={styles.rewardRow}>
                  <View style={[styles.rewardIconWrap, { backgroundColor: r.unlocked ? colors.primary + '22' : colors.backgroundSecondary }]}>
                    <Text style={styles.rewardIcon}>{r.icon}</Text>
                  </View>
                  <View style={styles.rewardContent}>
                    <View style={styles.rewardTitleRow}>
                      <Text style={[styles.rewardTitle, { color: r.unlocked ? colors.textPrimary : colors.textSecondary }]}>{r.title}</Text>
                      {r.unlocked && (
                        <View style={[styles.unlockedBadge, { backgroundColor: '#22C55E1E' }]}>
                          <Icon name="check" size={10} color="#22C55E" />
                          <Text style={[styles.unlockedText, { color: '#22C55E' }]}>Débloqué</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.rewardDesc, { color: colors.textTertiary }]}>{r.desc}</Text>
                    <ProgressBar progress={r.progress} color={r.unlocked ? '#22C55E' : colors.primary} height={4} trackColor={colors.backgroundSecondary} />
                    <Text style={[styles.rewardHint, { color: colors.textTertiary }]}>{r.hint}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textTertiary, marginTop: 24 }]}>COMMENT GAGNER DES COINS ?</Text>
      <View style={[styles.howtoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {COINS_HOWTO.map((item, i) => (
          <View key={item.label}>
            {i > 0 && <View style={[styles.cardDivider, { backgroundColor: colors.divider }]} />}
            <View style={styles.howtoRow}>
              <View style={[styles.howtoIconWrap, { backgroundColor: colors.primary + '18' }]}>
                <Icon name={item.icon as any} size={15} color={colors.primary} />
              </View>
              <Text style={[styles.howtoLabel, { color: colors.textSecondary }]}>{item.label}</Text>
              <View style={[styles.howtoRewardPill, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
                <Text style={[styles.howtoRewardText, { color: '#F59E0B' }]}>{item.reward}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: insets.bottom + 32 }} />
    </>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
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

      {/* Period selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow} style={{ flexGrow: 0 }}>
        {PERIOD_TABS.map(t => {
          const active = period === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => handlePeriodChange(t.key)}
              style={[
                styles.periodPill,
                active
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.periodPillText, { color: active ? '#fff' : colors.textSecondary }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Main list */}
      <FlatList
        data={restList}
        keyExtractor={item => item.user_id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="award" size={44} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Aucun classement disponible</Text>
          </View>
        }
      />
    </View>
  );
}

export default CommunityLeaderboardScreen;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  headerSub: { fontSize: 11, fontWeight: '500' },

  periodRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  periodPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  periodPillText: { fontSize: 13, fontWeight: '600' },

  listContent: { paddingHorizontal: 16, paddingTop: 12 },

  myCard: { borderRadius: 18, padding: 16, marginBottom: 22 },
  myCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  myCardRankBlock: { alignItems: 'center', minWidth: 64 },
  myCardRankLabel: { color: 'rgba(255,255,255,0.60)', fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  myCardRank: { color: '#fff', fontSize: 38, fontWeight: '900', lineHeight: 44 },
  myCardStats: { flex: 1, gap: 7, justifyContent: 'center', paddingTop: 4 },
  myCardStatRow: { flexDirection: 'row', alignItems: 'center' },
  myCardCoinsIcon: { fontSize: 14, marginRight: 4 },
  myCardStatValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  myCardStatUnit: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },
  myCardStreakEmoji: { fontSize: 13, marginRight: 4 },
  myCardProgress: { gap: 6 },
  myCardProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  myCardProgressLabel: { color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: '600', flex: 1 },
  myCardProgressPct: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },

  progressTrack: { overflow: 'hidden' },
  progressFill: { position: 'absolute', left: 0, top: 0 },

  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 12 },

  podiumContainer: { borderRadius: 18, borderWidth: 1, padding: 14 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  podiumWrapper: { flex: 1 },
  podiumWrapperSide: { marginTop: 24 },
  podiumCard: { borderRadius: 16, padding: 12, alignItems: 'center', gap: 5 },
  podiumCardFirst: { paddingVertical: 18, borderRadius: 18 },
  podiumMedalWrap: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  podiumMedalEmoji: { fontSize: 16 },
  podiumName: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 5 },
  podiumNameFirst: { fontSize: 13 },
  podiumCoinsPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 },
  podiumCoinsIcon: { fontSize: 11 },
  podiumCoinsText: { fontSize: 12, fontWeight: '800' },
  podiumStreakRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
  podiumStreakEmoji: { fontSize: 11 },
  podiumStreakText: { fontSize: 10, fontWeight: '600' },

  rankItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 12 },
  rankNumWrap: { width: 30, alignItems: 'center' },
  rankNum: { fontSize: 13, fontWeight: '800' },
  rankInfo: { flex: 1, gap: 2, minWidth: 0 },
  rankName: { fontSize: 14, fontWeight: '700' },
  rankMeLabel: { fontSize: 13, fontWeight: '600' },
  rankSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankUsername: { fontSize: 11 },
  rankStreakRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rankStreakEmoji: { fontSize: 11 },
  rankStreakText: { fontSize: 11, fontWeight: '700' },
  rankWeeklyCoins: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  rankCoinsWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rankCoinsIcon: { fontSize: 15 },
  rankCoinsValue: { fontSize: 17, fontWeight: '800' },

  avatarBase: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontWeight: '800', letterSpacing: 0.5 },

  rewardsCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  rewardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  cardDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  rewardIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rewardIcon: { fontSize: 22 },
  rewardContent: { flex: 1, gap: 4 },
  rewardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rewardTitle: { fontSize: 14, fontWeight: '700' },
  unlockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  unlockedText: { fontSize: 10, fontWeight: '700' },
  rewardDesc: { fontSize: 11, lineHeight: 16 },
  rewardHint: { fontSize: 10, marginTop: 2 },

  howtoCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  howtoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  howtoIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  howtoLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
  howtoRewardPill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  howtoRewardText: { fontSize: 12, fontWeight: '800' },

  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
});
