import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Dimensions,
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
import type { CommunityStats } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
interface Props {
  route: { params: { communityId: string; communityName: string } };
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_MAX_HEIGHT = 120;
const COIN_COLOR = '#F59E0B';
const GREEN = '#22D3A0';
const BLUE = '#3B82F6';
const PINK = '#EC4899';

const PERIODS = ['7j', '30j', '90j'] as const;
type Period = typeof PERIODS[number];

const AVATAR_COLORS = ['#7B3FF2', GREEN, COIN_COLOR, BLUE, PINK];
const MEDALS = ['🥇', '🥈', '🥉', '4e', '5e'];

function getInitials(name: string): string {
  return (name || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fmtNum(n: number): string {
  return n.toLocaleString('fr-FR');
}

// ─── Composant principal ──────────────────────────────────────────────────────

export const CommunityStatsScreen: React.FC<Props> = ({ route }) => {
  const { theme: { colors } } = useTheme();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { communityId, communityName } = route.params;

  const [period, setPeriod]   = useState<Period>('7j');
  const [stats, setStats]     = useState<CommunityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Animated values — barres activité (max 7 jours)
  const barAnims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;

  // Animated values — rôles
  const roleAdminAnim  = useRef(new Animated.Value(0)).current;
  const roleModAnim    = useRef(new Animated.Value(0)).current;
  const roleMemberAnim = useRef(new Animated.Value(0)).current;

  // Animated values — rétention
  const retAnim1  = useRef(new Animated.Value(0)).current;
  const retAnim7  = useRef(new Animated.Value(0)).current;
  const retAnim30 = useRef(new Animated.Value(0)).current;

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async (p: Period = period) => {
    try {
      const data = await communityService.getStats(communityId, p);
      setStats(data);

      // Reset animations
      barAnims.forEach(a => a.setValue(0));
      roleAdminAnim.setValue(0);
      roleModAnim.setValue(0);
      roleMemberAnim.setValue(0);
      retAnim1.setValue(0);
      retAnim7.setValue(0);
      retAnim30.setValue(0);
      fadeAnim.setValue(0);

      const total = data.members.total || 1;
      const activity = data.activity ?? [];
      const maxMsgs = Math.max(...activity.map(d => d.msgs), 1);

      const barSeq = barAnims.slice(0, activity.length).map((anim, i) =>
        Animated.timing(anim, { toValue: activity[i].msgs / maxMsgs, duration: 550, delay: i * 65, useNativeDriver: false }),
      );

      Animated.parallel([
        ...barSeq,
        Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: false }),
        Animated.timing(roleAdminAnim,  { toValue: data.roles.admin     / total, duration: 900, delay: 200, useNativeDriver: false }),
        Animated.timing(roleModAnim,    { toValue: data.roles.moderator / total, duration: 900, delay: 300, useNativeDriver: false }),
        Animated.timing(roleMemberAnim, { toValue: data.roles.member    / total, duration: 900, delay: 400, useNativeDriver: false }),
        Animated.timing(retAnim1,  { toValue: (data.retention?.d1  ?? 0) / 100, duration: 950, delay: 250, useNativeDriver: false }),
        Animated.timing(retAnim7,  { toValue: (data.retention?.d7  ?? 0) / 100, duration: 950, delay: 400, useNativeDriver: false }),
        Animated.timing(retAnim30, { toValue: (data.retention?.d30 ?? 0) / 100, duration: 950, delay: 550, useNativeDriver: false }),
      ]).start();
    } catch {
      setStats(null);
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

  // ─── Header ────────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <LinearGradient colors={[colors.surface, colors.background]} style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity onPress={() => nav.goBack()} style={[styles.headerBtn, { backgroundColor: colors.backgroundSecondary }]} activeOpacity={0.7}>
        <Icon name="arrow-left" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Statistiques</Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>{communityName}</Text>
      </View>
      <View style={styles.headerBtn} />
    </LinearGradient>
  );

  // ─── Sélecteur période ──────────────────────────────────────────────────────

  const renderPeriodSelector = () => (
    <View style={[styles.periodWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {PERIODS.map(p => {
        const active = p === period;
        return (
          <TouchableOpacity key={p} onPress={() => handlePeriodChange(p)} activeOpacity={0.7}
            style={[styles.periodPill, active && { backgroundColor: colors.primary }]}>
            <Text style={[styles.periodText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{p}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ─── KPI 2×2 ───────────────────────────────────────────────────────────────

  const renderKPIs = () => {
    if (!stats) return null;
    const kpis = [
      { icon: 'users',          iconColor: colors.primary, iconBg: colors.primary + '22', value: fmtNum(stats.members.total),              label: 'Membres',        badge: `+${stats.members.new_week} cette semaine`, badgeColor: GREEN,       gradColors: [colors.primary + '18', colors.primary + '06'] },
      { icon: 'message-circle', iconColor: BLUE,           iconBg: BLUE + '22',           value: fmtNum(stats.engagement.messages_week),   label: 'Messages',       badge: 'cette semaine',                             badgeColor: BLUE,        gradColors: [BLUE + '18', BLUE + '06'] },
      { icon: 'zap',            iconColor: COIN_COLOR,     iconBg: COIN_COLOR + '22',     value: String(stats.engagement.active_members),  label: 'Membres actifs', badge: 'membres actifs',                            badgeColor: COIN_COLOR,  gradColors: [COIN_COLOR + '18', COIN_COLOR + '06'] },
      { icon: 'heart',          iconColor: PINK,           iconBg: PINK + '22',           value: fmtNum(stats.engagement.reactions),       label: 'Réactions',      badge: 'au total',                                  badgeColor: PINK,        gradColors: [PINK + '18', PINK + '06'] },
    ];

    return (
      <Animated.View style={[styles.kpiGrid, { opacity: fadeAnim }]}>
        {kpis.map((k, i) => (
          <View key={i} style={[styles.kpiCard, { backgroundColor: colors.surface }]}>
            <LinearGradient colors={k.gradColors} style={styles.kpiInner}>
              <View style={[styles.kpiIconCircle, { backgroundColor: k.iconBg }]}>
                <Icon name={k.icon as any} size={17} color={k.iconColor} />
              </View>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{k.value}</Text>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>{k.label}</Text>
              <View style={[styles.kpiBadge, { backgroundColor: k.badgeColor + '18' }]}>
                <Text style={[styles.kpiBadgeText, { color: k.badgeColor }]}>{k.badge}</Text>
              </View>
            </LinearGradient>
          </View>
        ))}
      </Animated.View>
    );
  };

  // ─── Histogramme activité ───────────────────────────────────────────────────

  const renderBarChart = () => {
    const activity = stats?.activity ?? [];
    if (activity.length === 0) return null;
    const maxMsgs = Math.max(...activity.map(d => d.msgs), 1);

    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconDot, { backgroundColor: colors.primary + '28' }]}>
            <Icon name="bar-chart-2" size={14} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            Activité des {activity.length} derniers jours
          </Text>
        </View>

        <View style={styles.barContainer}>
          {activity.map((item, i) => {
            const isMax = item.msgs === maxMsgs;
            const targetH = (item.msgs / maxMsgs) * BAR_MAX_HEIGHT;
            const heightAnim = barAnims[i]?.interpolate({ inputRange: [0, 1], outputRange: [0, targetH] }) ?? new Animated.Value(0);
            return (
              <View key={item.day + i} style={styles.barCol}>
                <Animated.Text style={[styles.barValLabel, { color: isMax ? colors.primary : colors.textTertiary }]}>
                  {item.msgs}
                </Animated.Text>
                <View style={[styles.barTrack, { height: BAR_MAX_HEIGHT }]}>
                  <Animated.View style={[styles.barFill, { height: heightAnim, backgroundColor: isMax ? colors.primary : colors.primary + '44' }]} />
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
  };

  // ─── Rétention ─────────────────────────────────────────────────────────────

  const renderRetArc = (label: string, pct: number, anim: Animated.Value, accentColor: string, sublabel: string) => {
    const SIZE = 80;
    const THICK = 7;
    const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

    return (
      <View style={styles.retCard} key={label}>
        <View style={[styles.retCircleWrap, { width: SIZE, height: SIZE }]}>
          <View style={[styles.retRingBg, { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: THICK, borderColor: colors.backgroundSecondary }]} />
          <View style={[styles.retArcClip, { width: SIZE / 2, height: SIZE, left: 0 }]}>
            <Animated.View style={[styles.retArcHalf, { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: THICK, borderColor: accentColor, borderRightColor: 'transparent', borderBottomColor: 'transparent', transform: [{ rotate }] }]} />
          </View>
          <View style={styles.retCenterLabel}>
            <Text style={[styles.retPct, { color: accentColor }]}>{pct}%</Text>
          </View>
        </View>
        <Text style={[styles.retLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.retSub, { color: colors.textTertiary }]}>{sublabel}</Text>
      </View>
    );
  };

  const renderRetention = () => {
    if (!stats?.retention) return null;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconDot, { backgroundColor: GREEN + '28' }]}>
            <Icon name="refresh-cw" size={14} color={GREEN} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Rétention des membres</Text>
        </View>
        <View style={styles.retRow}>
          {renderRetArc('J+1',  stats.retention.d1,  retAnim1,  GREEN,          'après 1 jour')}
          {renderRetArc('J+7',  stats.retention.d7,  retAnim7,  colors.primary, 'après 7 jours')}
          {renderRetArc('J+30', stats.retention.d30, retAnim30, COIN_COLOR,     'après 30 jours')}
        </View>
        <Text style={[styles.retNote, { color: colors.textTertiary }]}>
          % de nouveaux membres toujours actifs après N jours
        </Text>
      </View>
    );
  };

  // ─── Répartition rôles ──────────────────────────────────────────────────────

  const renderRoleBar = (label: string, count: number, total: number, anim: Animated.Value, barColor: string) => {
    const pct = ((count / total) * 100).toFixed(count < 10 ? 2 : 1);
    const widthAnim = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <View key={label} style={styles.roleRow}>
        <Text style={[styles.roleLabel, { color: colors.textSecondary }]}>{label}</Text>
        <View style={styles.roleBarFlex}>
          <View style={[styles.roleBarBg, { backgroundColor: colors.backgroundSecondary }]}>
            <Animated.View style={[styles.roleBarFill, { backgroundColor: barColor, width: widthAnim }]} />
          </View>
        </View>
        <View style={styles.roleRight}>
          <Text style={[styles.roleCount, { color: colors.textPrimary }]}>{fmtNum(count)}</Text>
          <Text style={[styles.rolePct, { color: colors.textTertiary }]}>{pct}%</Text>
        </View>
      </View>
    );
  };

  const renderRoles = () => {
    if (!stats) return null;
    const total = stats.members.total || 1;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconDot, { backgroundColor: BLUE + '28' }]}>
            <Icon name="shield" size={14} color={BLUE} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Répartition</Text>
        </View>
        {renderRoleBar('Admin',      stats.roles.admin,     total, roleAdminAnim,  GREEN)}
        {renderRoleBar('Modérateur', stats.roles.moderator, total, roleModAnim,    BLUE)}
        {renderRoleBar('Membre',     stats.roles.member,    total, roleMemberAnim, colors.primary)}
      </View>
    );
  };

  // ─── Top contributeurs ──────────────────────────────────────────────────────

  const renderContributors = () => {
    const contributors = stats?.top_contributors ?? [];
    if (contributors.length === 0) return null;

    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconDot, { backgroundColor: COIN_COLOR + '28' }]}>
            <Icon name="award" size={14} color={COIN_COLOR} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Top contributeurs</Text>
        </View>

        {contributors.map((user, i) => {
          const avatarColor = AVATAR_COLORS[i] ?? '#7B3FF2';
          const isTop3 = i < 3;
          const isLast = i === contributors.length - 1;

          return (
            <React.Fragment key={user.user_id ?? user.id}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => nav.navigate('CommunityMemberProfile', {
                  communityId,
                  communityName,
                  memberId: user.user_id ?? user.id,
                  memberName: user.name,
                })}
                style={styles.contribRow}
              >
                <View style={styles.rankCell}>
                  {isTop3 ? (
                    <Text style={styles.medal}>{MEDALS[i]}</Text>
                  ) : (
                    <Text style={[styles.rankText, { color: colors.textTertiary }]}>{MEDALS[i]}</Text>
                  )}
                </View>

                <View style={[styles.avatar, { backgroundColor: avatarColor + '28', borderColor: avatarColor + '55' }]}>
                  <Text style={[styles.avatarText, { color: avatarColor }]}>{getInitials(user.name)}</Text>
                </View>

                <View style={styles.contribInfo}>
                  <Text style={[styles.contribName, { color: colors.textPrimary }]}>{user.name}</Text>
                  <Text style={[styles.contribUsername, { color: colors.textTertiary }]}>@{user.username}</Text>
                </View>

                <View style={styles.contribRight}>
                  <View style={styles.coinsRow}>
                    <Text style={styles.lightningIcon}>⚡</Text>
                    <Text style={[styles.coinsValue, { color: COIN_COLOR }]}>{fmtNum(user.coins)}</Text>
                  </View>
                  <View style={styles.postsRow}>
                    <Icon name="edit-3" size={10} color={colors.textTertiary} />
                    <Text style={[styles.postsValue, { color: colors.textTertiary }]}> {user.posts} posts</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {!isLast && <View style={[styles.divider, { backgroundColor: colors.divider }]} />}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  // ─── Contenu 2×2 ────────────────────────────────────────────────────────────

  const renderContent = () => {
    if (!stats) return null;
    const items = [
      { icon: 'file-text', label: 'Posts',    value: stats.content.posts,  accentColor: colors.primary },
      { icon: 'bookmark',  label: 'Épinglés', value: stats.content.pinned, accentColor: GREEN },
      { icon: 'bar-chart', label: 'Sondages', value: stats.content.polls,  accentColor: COIN_COLOR },
      { icon: 'image',     label: 'Médias',   value: stats.content.media,  accentColor: BLUE },
    ];

    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconDot, { backgroundColor: colors.primary + '28' }]}>
            <Icon name="layers" size={14} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Contenu</Text>
        </View>
        <View style={styles.contentGrid}>
          {items.map(item => (
            <View key={item.label} style={[styles.contentCell, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <View style={[styles.contentIconWrap, { backgroundColor: item.accentColor + '22' }]}>
                <Icon name={item.icon as any} size={16} color={item.accentColor} />
              </View>
              <Text style={[styles.contentValue, { color: colors.textPrimary }]}>{fmtNum(item.value)}</Text>
              <Text style={[styles.contentLabel, { color: colors.textTertiary }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ─── Render principal ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textTertiary, fontSize: 13 }}>Chargement des statistiques…</Text>
        </View>
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 }}>
          <Icon name="bar-chart-2" size={44} color={colors.textTertiary} />
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            Statistiques indisponibles
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
            Impossible de charger les données. Vérifiez votre connexion et réessayez.
          </Text>
          <TouchableOpacity
            onPress={() => { setLoading(true); load(); }}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 14 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {renderHeader()}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {renderPeriodSelector()}
        {renderKPIs()}
        {renderBarChart()}
        {renderRetention()}
        {renderRoles()}
        {renderContributors()}
        {renderContent()}

        {/* Croissance */}
        {(stats.members.new_week > 0 || stats.members.new_month > 0) && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconDot, { backgroundColor: GREEN + '28' }]}>
                <Icon name="trending-up" size={14} color={GREEN} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Croissance</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {[
                { label: 'Nouveaux cette semaine', value: stats.members.new_week,  color: GREEN },
                { label: 'Nouveaux ce mois',       value: stats.members.new_month, color: colors.primary },
                { label: 'Taux de croissance',     value: `${stats.members.growth}%`, color: COIN_COLOR, isStr: true },
              ].map(item => (
                <View key={item.label} style={[styles.growthCell, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
                  <Text style={[styles.growthValue, { color: item.color }]}>
                    {item.isStr ? item.value : `+${item.value}`}
                  </Text>
                  <Text style={[styles.growthLabel, { color: colors.textTertiary }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8 },
  headerBtn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  headerSub: { fontSize: 12, marginTop: 2, maxWidth: 200 },

  periodWrap: { flexDirection: 'row', marginTop: 16, borderRadius: 14, padding: 4, borderWidth: 1 },
  periodPill: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  periodText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  kpiCard: { width: (SCREEN_WIDTH - 42) / 2, borderRadius: 18, overflow: 'hidden', elevation: 4, shadowColor: '#7B3FF2', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 10 },
  kpiInner: { padding: 16, borderRadius: 18 },
  kpiIconCircle: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 12, alignSelf: 'flex-end' },
  kpiValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  kpiLabel: { fontSize: 12, marginTop: 3, marginBottom: 10, fontWeight: '500' },
  kpiBadge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  kpiBadgeText: { fontSize: 10, fontWeight: '700' },

  card: { borderRadius: 18, padding: 16, marginTop: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  cardIconDot: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },

  barContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: BAR_MAX_HEIGHT + 46 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: { width: '62%', justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 5, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barValLabel: { fontSize: 9, fontWeight: '700', marginBottom: 3 },
  barDayLabel: { fontSize: 11, fontWeight: '600', marginTop: 7 },

  retRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  retCard: { alignItems: 'center', gap: 8 },
  retCircleWrap: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  retRingBg: { position: 'absolute' },
  retArcClip: { position: 'absolute', overflow: 'hidden', top: 0 },
  retArcHalf: { position: 'absolute', top: 0, left: 0 },
  retCenterLabel: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  retPct: { fontSize: 14, fontWeight: '800' },
  retLabel: { fontSize: 13, fontWeight: '700' },
  retSub: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
  retNote: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', marginTop: 2 },

  roleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  roleLabel: { width: 90, fontSize: 13, fontWeight: '500' },
  roleBarFlex: { flex: 1 },
  roleBarBg: { height: 9, borderRadius: 5, overflow: 'hidden' },
  roleBarFill: { height: '100%', borderRadius: 5 },
  roleRight: { width: 68, alignItems: 'flex-end' },
  roleCount: { fontSize: 13, fontWeight: '700' },
  rolePct: { fontSize: 11, marginTop: 1 },

  contribRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  rankCell: { width: 26, alignItems: 'center' },
  medal: { fontSize: 17 },
  rankText: { fontSize: 11, fontWeight: '700' },
  avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  contribInfo: { flex: 1 },
  contribName: { fontSize: 14, fontWeight: '600' },
  contribUsername: { fontSize: 12, marginTop: 1 },
  contribRight: { alignItems: 'flex-end', gap: 3 },
  coinsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  lightningIcon: { fontSize: 12 },
  coinsValue: { fontSize: 13, fontWeight: '800', letterSpacing: -0.3 },
  postsRow: { flexDirection: 'row', alignItems: 'center' },
  postsValue: { fontSize: 11 },
  divider: { height: 1, marginHorizontal: 2, opacity: 0.6 },

  contentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  contentCell: { width: (SCREEN_WIDTH - 68) / 2, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'flex-start' },
  contentIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  contentValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  contentLabel: { fontSize: 11, marginTop: 4, fontWeight: '500' },

  growthCell: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4 },
  growthValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  growthLabel: { fontSize: 10, fontWeight: '500', textAlign: 'center', lineHeight: 14 },
});
