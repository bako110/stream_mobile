import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
interface Props { route: { params: { communityId: string; communityName: string } }; }

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MOCK_STATS = {
  members: { total: 1284, new_this_week: 47, new_this_month: 183, growth_percent: 14.2 },
  engagement: { messages_today: 234, messages_this_week: 1847, active_members: 312, reaction_count: 4521 },
  content: { total_posts: 892, pinned: 5, polls: 23, media_files: 167 },
  top_contributors: [
    { id: '1', name: 'Sophie Martin',  username: 'sophiem',  avatar_url: null, xp: 4850, posts: 234 },
    { id: '2', name: 'Raphaël Simon',  username: 'raph_s',   avatar_url: null, xp: 1890, posts: 89  },
    { id: '3', name: 'Lucas Dupont',   username: 'lucas_d',  avatar_url: null, xp: 3200, posts: 156 },
    { id: '4', name: 'Jade Moreau',    username: 'jade.m',   avatar_url: null, xp: 2780, posts: 112 },
    { id: '5', name: 'Emma Leroy',     username: 'emma.l',   avatar_url: null, xp: 1450, posts: 67  },
  ],
  activity_by_day: [
    { day: 'Lun', messages: 180 },
    { day: 'Mar', messages: 240 },
    { day: 'Mer', messages: 195 },
    { day: 'Jeu', messages: 310 },
    { day: 'Ven', messages: 420 },
    { day: 'Sam', messages: 380 },
    { day: 'Dim', messages: 234 },
  ],
  member_roles: { admin: 2, moderator: 5, member: 1277 },
  retention: { day_1: 78, day_7: 52, day_30: 31 },
};

const PERIODS = ['7j', '30j', '90j'] as const;
type Period = typeof PERIODS[number];

const MEDAL_LABELS = ['', '', '', '4e', '5e'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const BAR_CHART_HEIGHT = 120;
const maxMessages = Math.max(...MOCK_STATS.activity_by_day.map(d => d.messages));

export const CommunityStatsScreen: React.FC<Props> = ({ route }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { communityName } = route.params;

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('7j');

  // Animated values
  const barAnims = useRef(
    MOCK_STATS.activity_by_day.map(() => new Animated.Value(0))
  ).current;
  const roleBarAdminAnim   = useRef(new Animated.Value(0)).current;
  const roleBarModAnim     = useRef(new Animated.Value(0)).current;
  const roleBarMemberAnim  = useRef(new Animated.Value(0)).current;
  const retentionAnim1     = useRef(new Animated.Value(0)).current;
  const retentionAnim7     = useRef(new Animated.Value(0)).current;
  const retentionAnim30    = useRef(new Animated.Value(0)).current;
  const kpiAnim            = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const barAnimations = barAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 600,
        delay: i * 60,
        useNativeDriver: false,
      })
    );

    const total = MOCK_STATS.members.total;
    const adminPct  = MOCK_STATS.member_roles.admin / total;
    const modPct    = MOCK_STATS.member_roles.moderator / total;
    const memberPct = MOCK_STATS.member_roles.member / total;

    Animated.parallel([
      ...barAnimations,
      Animated.timing(roleBarAdminAnim,  { toValue: adminPct,  duration: 800, delay: 200, useNativeDriver: false }),
      Animated.timing(roleBarModAnim,    { toValue: modPct,    duration: 800, delay: 300, useNativeDriver: false }),
      Animated.timing(roleBarMemberAnim, { toValue: memberPct, duration: 800, delay: 400, useNativeDriver: false }),
      Animated.timing(retentionAnim1,    { toValue: MOCK_STATS.retention.day_1  / 100, duration: 900, delay: 200, useNativeDriver: false }),
      Animated.timing(retentionAnim7,    { toValue: MOCK_STATS.retention.day_7  / 100, duration: 900, delay: 350, useNativeDriver: false }),
      Animated.timing(retentionAnim30,   { toValue: MOCK_STATS.retention.day_30 / 100, duration: 900, delay: 500, useNativeDriver: false }),
      Animated.timing(kpiAnim,           { toValue: 1, duration: 500, useNativeDriver: false }),
    ]).start();
  }, []);

  const roleBarWidth = (anim: Animated.Value) =>
    anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  // ---- render helpers ----

  const renderHeader = () => (
    <LinearGradient
      colors={[colors.surface, colors.background]}
      style={[styles.header, { paddingTop: insets.top + 8 }]}
    >
      <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} activeOpacity={0.7}>
        <Icon name="arrow-left" size={22} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.headerTitles}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Statistiques</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {communityName}
        </Text>
      </View>
      <View style={styles.headerRight} />
    </LinearGradient>
  );

  const renderPeriodSelector = () => (
    <View style={[styles.periodRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {PERIODS.map(p => {
        const active = p === selectedPeriod;
        return (
          <TouchableOpacity
            key={p}
            onPress={() => setSelectedPeriod(p)}
            activeOpacity={0.75}
            style={[
              styles.periodTab,
              active && { backgroundColor: colors.primary },
            ]}
          >
            <Text style={[styles.periodLabel, { color: active ? '#fff' : colors.textSecondary }]}>
              {p}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderKPIs = () => (
    <View style={styles.kpiGrid}>
      {/* Membres total */}
      <Animated.View style={[styles.kpiCard, { backgroundColor: colors.surface, opacity: kpiAnim }]}>
        <LinearGradient colors={['#7B3FF215', '#7B3FF205']} style={styles.kpiGradient}>
          <View style={styles.kpiIconWrap}>
            <Icon name="users" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
            {MOCK_STATS.members.total.toLocaleString('fr-FR')}
          </Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Membres</Text>
          <View style={styles.kpiBadge}>
            <Icon name="trending-up" size={11} color="#36D9A0" />
            <Text style={styles.kpiBadgeText}>+{MOCK_STATS.members.new_this_week} cette sem.</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Messages semaine */}
      <Animated.View style={[styles.kpiCard, { backgroundColor: colors.surface, opacity: kpiAnim }]}>
        <LinearGradient colors={['#3B82F615', '#3B82F605']} style={styles.kpiGradient}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#3B82F620' }]}>
            <Icon name="message-circle" size={18} color="#3B82F6" />
          </View>
          <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
            {MOCK_STATS.engagement.messages_this_week.toLocaleString('fr-FR')}
          </Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Messages / sem.</Text>
          <View style={[styles.kpiBadge, { backgroundColor: '#3B82F615' }]}>
            <Icon name="activity" size={11} color="#3B82F6" />
            <Text style={[styles.kpiBadgeText, { color: '#3B82F6' }]}>{MOCK_STATS.engagement.messages_today} auj.</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Membres actifs */}
      <Animated.View style={[styles.kpiCard, { backgroundColor: colors.surface, opacity: kpiAnim }]}>
        <LinearGradient colors={['#F59E0B15', '#F59E0B05']} style={styles.kpiGradient}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#F59E0B20' }]}>
            <Icon name="zap" size={18} color="#F59E0B" />
          </View>
          <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
            {MOCK_STATS.engagement.active_members}
          </Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Membres actifs</Text>
          <View style={[styles.kpiBadge, { backgroundColor: '#F59E0B15' }]}>
            <Icon name="percent" size={11} color="#F59E0B" />
            <Text style={[styles.kpiBadgeText, { color: '#F59E0B' }]}>
              {((MOCK_STATS.engagement.active_members / MOCK_STATS.members.total) * 100).toFixed(1)}%
            </Text>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Reactions */}
      <Animated.View style={[styles.kpiCard, { backgroundColor: colors.surface, opacity: kpiAnim }]}>
        <LinearGradient colors={['#EC489915', '#EC489905']} style={styles.kpiGradient}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#EC489920' }]}>
            <Icon name="heart" size={18} color="#EC4899" />
          </View>
          <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
            {MOCK_STATS.engagement.reaction_count.toLocaleString('fr-FR')}
          </Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Reactions</Text>
          <View style={[styles.kpiBadge, { backgroundColor: '#EC489915' }]}>
            <Icon name="star" size={11} color="#EC4899" />
            <Text style={[styles.kpiBadgeText, { color: '#EC4899' }]}>Total</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderBarChart = () => (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
      <View style={styles.sectionHeader}>
        <Icon name="bar-chart-2" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Activite par jour</Text>
      </View>
      <View style={styles.barChartContainer}>
        {MOCK_STATS.activity_by_day.map((item, i) => {
          const isMax = item.messages === maxMessages;
          const ratio = item.messages / maxMessages;
          const barHeight = barAnims[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0, BAR_CHART_HEIGHT * ratio],
          });
          return (
            <View key={item.day} style={styles.barColumn}>
              <Animated.Text style={[styles.barValueLabel, { color: isMax ? colors.primary : colors.textTertiary }]}>
                {item.messages}
              </Animated.Text>
              <View style={styles.barTrack}>
                <Animated.View
                  style={[
                    styles.barFill,
                    {
                      height: barHeight,
                      backgroundColor: isMax ? colors.primary : colors.primary + '55',
                      borderRadius: 4,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barDayLabel, { color: isMax ? colors.textPrimary : colors.textTertiary }]}>
                {item.day}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  const renderRetentionCircle = (
    label: string,
    pct: number,
    anim: Animated.Value,
    accentColor: string
  ) => {
    const CIRCLE = 64;
    const THICKNESS = 6;
    const rotation = anim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg'],
    });
    return (
      <View style={styles.retentionItem} key={label}>
        <View style={[styles.retentionCircleOuter, { width: CIRCLE, height: CIRCLE }]}>
          {/* Background ring */}
          <View
            style={[
              styles.retentionRingBg,
              {
                width: CIRCLE,
                height: CIRCLE,
                borderRadius: CIRCLE / 2,
                borderWidth: THICKNESS,
                borderColor: colors.backgroundSecondary,
              },
            ]}
          />
          {/* Colored arc — left half */}
          <View style={[styles.retentionArcWrap, { width: CIRCLE / 2, height: CIRCLE, left: 0 }]}>
            <Animated.View
              style={[
                styles.retentionArcHalf,
                {
                  width: CIRCLE,
                  height: CIRCLE,
                  borderRadius: CIRCLE / 2,
                  borderWidth: THICKNESS,
                  borderColor: accentColor,
                  transform: [{ rotate: rotation }],
                },
              ]}
            />
          </View>
          {/* Inner label */}
          <View style={styles.retentionInner}>
            <Text style={[styles.retentionPct, { color: accentColor }]}>{pct}%</Text>
          </View>
        </View>
        <Text style={[styles.retentionLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    );
  };

  const renderRetention = () => (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
      <View style={styles.sectionHeader}>
        <Icon name="refresh-cw" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Retention</Text>
      </View>
      <View style={styles.retentionRow}>
        {renderRetentionCircle('J+1',  MOCK_STATS.retention.day_1,  retentionAnim1,  '#36D9A0')}
        {renderRetentionCircle('J+7',  MOCK_STATS.retention.day_7,  retentionAnim7,  colors.primary)}
        {renderRetentionCircle('J+30', MOCK_STATS.retention.day_30, retentionAnim30, '#F59E0B')}
      </View>
      <Text style={[styles.retentionNote, { color: colors.textTertiary }]}>
        % de nouveaux membres toujours actifs apres N jours
      </Text>
    </View>
  );

  const renderRoleBar = (
    label: string,
    count: number,
    total: number,
    anim: Animated.Value,
    color: string
  ) => {
    const pct = ((count / total) * 100).toFixed(1);
    const barW = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <View style={styles.roleRow} key={label}>
        <Text style={[styles.roleLabel, { color: colors.textSecondary }]}>{label}</Text>
        <View style={styles.roleBarWrap}>
          <View style={[styles.roleBarTrack, { backgroundColor: colors.backgroundSecondary }]}>
            <Animated.View
              style={[
                styles.roleBarFill,
                { backgroundColor: color, width: barW },
              ]}
            />
          </View>
        </View>
        <View style={styles.roleRight}>
          <Text style={[styles.roleCount, { color: colors.textPrimary }]}>{count.toLocaleString('fr-FR')}</Text>
          <Text style={[styles.rolePct, { color: colors.textTertiary }]}>{pct}%</Text>
        </View>
      </View>
    );
  };

  const renderRoles = () => {
    const total = MOCK_STATS.members.total;
    return (
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
        <View style={styles.sectionHeader}>
          <Icon name="shield" size={16} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Repartition des roles</Text>
        </View>
        {renderRoleBar('Admin',      MOCK_STATS.member_roles.admin,     total, roleBarAdminAnim,  '#36D9A0')}
        {renderRoleBar('Moderateur', MOCK_STATS.member_roles.moderator, total, roleBarModAnim,    '#3B82F6')}
        {renderRoleBar('Membre',     MOCK_STATS.member_roles.member,    total, roleBarMemberAnim, colors.primary)}
      </View>
    );
  };

  const renderContributors = () => (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
      <View style={styles.sectionHeader}>
        <Icon name="award" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top contributeurs</Text>
      </View>
      {MOCK_STATS.top_contributors.map((user, i) => {
        const medal = MEDAL_LABELS[i];
        const avatarColor = ['#7B3FF2', '#36D9A0', '#F59E0B', '#3B82F6', '#EC4899'][i];
        return (
          <View
            key={user.id}
            style={[
              styles.contributorRow,
              i < MOCK_STATS.top_contributors.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border + '60' },
            ]}
          >
            <View style={styles.contributorRank}>
              {i < 3 ? (
                <Text style={styles.medal}>{medal}</Text>
              ) : (
                <Text style={[styles.rankNum, { color: colors.textTertiary }]}>{medal}</Text>
              )}
            </View>
            <View style={[styles.avatar, { backgroundColor: avatarColor + '30', borderColor: avatarColor + '60' }]}>
              <Text style={[styles.avatarInitials, { color: avatarColor }]}>
                {getInitials(user.name)}
              </Text>
            </View>
            <View style={styles.contributorInfo}>
              <Text style={[styles.contributorName, { color: colors.textPrimary }]}>{user.name}</Text>
              <Text style={[styles.contributorUsername, { color: colors.textTertiary }]}>@{user.username}</Text>
            </View>
            <View style={styles.contributorStats}>
              <View style={styles.contributorStat}>
                <Icon name="star" size={11} color={colors.primary} />
                <Text style={[styles.contributorStatVal, { color: colors.textPrimary }]}>
                  {user.xp.toLocaleString('fr-FR')}
                </Text>
                <Text style={[styles.contributorStatLbl, { color: colors.textTertiary }]}> XP</Text>
              </View>
              <View style={styles.contributorStat}>
                <Icon name="edit-3" size={11} color={colors.textTertiary} />
                <Text style={[styles.contributorStatVal, { color: colors.textSecondary }]}> {user.posts}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );

  const renderContent = () => {
    const items = [
      { icon: 'file-text',  label: 'Posts total', value: MOCK_STATS.content.total_posts, color: colors.primary },
      { icon: 'bookmark',   label: 'Epingles',    value: MOCK_STATS.content.pinned,      color: '#36D9A0'      },
      { icon: 'bar-chart',  label: 'Sondages',    value: MOCK_STATS.content.polls,       color: '#F59E0B'      },
      { icon: 'image',      label: 'Medias',      value: MOCK_STATS.content.media_files, color: '#3B82F6'      },
    ];
    return (
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
        <View style={styles.sectionHeader}>
          <Icon name="layers" size={16} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Contenu</Text>
        </View>
        <View style={styles.contentGrid}>
          {items.map(item => (
            <View
              key={item.label}
              style={[styles.contentItem, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            >
              <View style={[styles.contentIconWrap, { backgroundColor: item.color + '20' }]}>
                <Icon name={item.icon as any} size={16} color={item.color} />
              </View>
              <Text style={[styles.contentValue, { color: colors.textPrimary }]}>
                {item.value.toLocaleString('fr-FR')}
              </Text>
              <Text style={[styles.contentLabel, { color: colors.textTertiary }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      {renderHeader()}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {renderPeriodSelector()}
        {renderKPIs()}
        {renderBarChart()}
        {renderRetention()}
        {renderRoles()}
        {renderContributors()}
        {renderContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // ---- Header ----
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    maxWidth: 180,
  },
  headerRight: {
    width: 38,
  },

  // ---- Period selector ----
  periodRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  periodLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ---- Scroll ----
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // ---- KPI grid ----
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 10,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#7B3FF2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  kpiGradient: {
    padding: 16,
    borderRadius: 16,
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#7B3FF220',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  kpiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#36D9A015',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  kpiBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#36D9A0',
  },

  // ---- Bar chart ----
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  barChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_CHART_HEIGHT + 44,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTrack: {
    width: '70%',
    height: BAR_CHART_HEIGHT,
    justifyContent: 'flex-end',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  barValueLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 2,
  },
  barDayLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 6,
  },

  // ---- Retention ----
  retentionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  retentionItem: {
    alignItems: 'center',
    gap: 10,
  },
  retentionCircleOuter: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retentionRingBg: {
    position: 'absolute',
  },
  retentionArcWrap: {
    position: 'absolute',
    overflow: 'hidden',
    top: 0,
  },
  retentionArcHalf: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  retentionInner: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retentionPct: {
    fontSize: 13,
    fontWeight: '800',
  },
  retentionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  retentionNote: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },

  // ---- Roles ----
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  roleLabel: {
    width: 84,
    fontSize: 13,
    fontWeight: '500',
  },
  roleBarWrap: {
    flex: 1,
  },
  roleBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  roleBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  roleRight: {
    width: 72,
    alignItems: 'flex-end',
  },
  roleCount: {
    fontSize: 13,
    fontWeight: '700',
  },
  rolePct: {
    fontSize: 11,
    marginTop: 1,
  },

  // ---- Contributors ----
  contributorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  contributorRank: {
    width: 28,
    alignItems: 'center',
  },
  medal: {
    fontSize: 18,
  },
  rankNum: {
    fontSize: 12,
    fontWeight: '700',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: '700',
  },
  contributorInfo: {
    flex: 1,
  },
  contributorName: {
    fontSize: 14,
    fontWeight: '600',
  },
  contributorUsername: {
    fontSize: 12,
    marginTop: 1,
  },
  contributorStats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  contributorStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contributorStatVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  contributorStatLbl: {
    fontSize: 11,
  },

  // ---- Content grid ----
  contentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  contentItem: {
    width: (SCREEN_WIDTH - 68) / 2,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: 'flex-start',
  },
  contentIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  contentValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  contentLabel: {
    fontSize: 11,
    marginTop: 3,
  },
});
