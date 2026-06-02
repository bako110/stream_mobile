import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { MemberCreatorStats } from '../../services/communityService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface Props {
  route: {
    params: {
      communityId: string;
      communityName: string;
      memberId: string;
      memberName: string;
    };
  };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── StatCell ─────────────────────────────────────────────────────────────────

interface StatCellProps {
  icon: string;
  label: string;
  value: number;
  color: string;
  colors: any;
  index: number;
}

function StatCell({ icon, label, value, color, colors, index }: StatCellProps) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 380, delay: index * 60, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.statCell,
        { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, opacity: anim },
      ]}
    >
      <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{fmt(value)}</Text>
      <Text style={[styles.statLabel, { color: colors.textTertiary }]}>{label}</Text>
    </Animated.View>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  icon: string;
  gradient: [string, string];
  children: React.ReactNode;
  colors: any;
}

function SectionCard({ title, icon, gradient, children, colors }: SectionCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.cardIconWrap}>
            <Icon name={icon} size={16} color="#fff" />
          </View>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
      </LinearGradient>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function CommunityMemberCreatorStatsScreen({ route }: Props) {
  const { communityId, communityName, memberId, memberName } = route.params;
  const nav    = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { theme: { colors } } = useTheme();

  const [stats,      setStats]      = useState<MemberCreatorStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await communityService.getMemberCreatorStats(communityId, memberId);
      setStats(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, memberId]);

  useEffect(() => {
    load();
    Animated.timing(headerAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Statistiques</Text>
            <Text style={[styles.headerSub, { color: colors.textTertiary }]} numberOfLines={1}>{memberName}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <Animated.View style={[
        styles.header,
        { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.surface, opacity: headerAnim },
      ]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Statistiques créateur</Text>
          <Text style={[styles.headerSub, { color: colors.textTertiary }]} numberOfLines={1}>
            {memberName}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </Animated.View>

      {error || !stats ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Icon name="alert-circle" size={44} color={colors.textTertiary} />
          <Text style={[styles.errorText, { color: colors.textTertiary }]}>Impossible de charger les statistiques</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Bannière recap */}
          <LinearGradient colors={['#3A1480', '#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBanner}>
            <Text style={styles.heroName}>{memberName}</Text>
            <Text style={styles.heroCommunity}>{communityName}</Text>
            <View style={styles.heroRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{fmt(stats.followers)}</Text>
                <Text style={styles.heroStatLabel}>Abonnés</Text>
              </View>
              <View style={styles.heroSep} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{fmt(stats.reels_views + stats.stories_views)}</Text>
                <Text style={styles.heroStatLabel}>Vues totales</Text>
              </View>
              <View style={styles.heroSep} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{fmt(stats.total_coins_earned)}</Text>
                <Text style={styles.heroStatLabel}>Coins gagnés</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Reels */}
          <SectionCard title="Reels" icon="film" gradient={['#7B3FF2', '#5B1FD2']} colors={colors}>
            <View style={styles.statsGrid}>
              <StatCell icon="eye"          label="Vues"        value={stats.reels_views}    color="#7B3FF2" colors={colors} index={0} />
              <StatCell icon="heart"        label="Likes"       value={stats.reels_likes}    color="#E0389A" colors={colors} index={1} />
              <StatCell icon="message-circle" label="Commentaires" value={stats.reels_comments} color="#3B82F6" colors={colors} index={2} />
              <StatCell icon="share-2"      label="Partages"    value={stats.reels_shares}   color="#10B981" colors={colors} index={3} />
              <StatCell icon="film"         label="Reels"       value={stats.reels_count}    color="#F59E0B" colors={colors} index={4} />
            </View>
          </SectionCard>

          {/* Posts */}
          <SectionCard title="Posts" icon="file-text" gradient={['#3B82F6', '#1D4ED8']} colors={colors}>
            <View style={styles.statsGrid}>
              <StatCell icon="heart"          label="Likes"          value={stats.posts_likes}    color="#E0389A" colors={colors} index={0} />
              <StatCell icon="message-circle" label="Commentaires"   value={stats.posts_comments} color="#3B82F6" colors={colors} index={1} />
              <StatCell icon="share-2"        label="Partages"       value={stats.posts_shares}   color="#10B981" colors={colors} index={2} />
              <StatCell icon="file-text"      label="Posts"          value={stats.posts_count}    color="#F59E0B" colors={colors} index={3} />
            </View>
          </SectionCard>

          {/* Stories */}
          <SectionCard title="Stories" icon="circle" gradient={['#EC4899', '#BE185D']} colors={colors}>
            <View style={styles.statsGrid}>
              <StatCell icon="eye"    label="Vues"    value={stats.stories_views}  color="#EC4899" colors={colors} index={0} />
              <StatCell icon="heart"  label="Likes"   value={stats.stories_likes}  color="#E0389A" colors={colors} index={1} />
              <StatCell icon="circle" label="Stories" value={stats.stories_count}  color="#F59E0B" colors={colors} index={2} />
            </View>
          </SectionCard>

          {/* Audience */}
          <SectionCard title="Audience" icon="users" gradient={['#10B981', '#059669']} colors={colors}>
            <View style={styles.statsGrid}>
              <StatCell icon="users"     label="Abonnés"     value={stats.followers} color="#10B981" colors={colors} index={0} />
              <StatCell icon="user-plus" label="Abonnements" value={stats.following} color="#3B82F6" colors={colors} index={1} />
            </View>
          </SectionCard>

          {/* Coins & Rémunération */}
          <SectionCard title="Coins & Rémunération" icon="zap" gradient={['#F59E0B', '#D97706']} colors={colors}>
            <View style={styles.statsGrid}>
              <StatCell icon="zap"      label="Total gagné"     value={stats.total_coins_earned}     color="#F59E0B" colors={colors} index={0} />
              <StatCell icon="gift"     label="Cadeaux reçus"   value={stats.gifts_coins_earned}     color="#EC4899" colors={colors} index={1} />
              <StatCell icon="users"    label="Communauté"      value={stats.community_coins_earned} color="#7B3FF2" colors={colors} index={2} />
            </View>

            {/* Barre de contribution */}
            {stats.total_coins_earned > 0 && (
              <View style={[styles.remuRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.remuTitle, { color: colors.textSecondary }]}>Répartition des gains</Text>
                <View style={styles.remuBar}>
                  {stats.gifts_coins_earned > 0 && (
                    <View style={[styles.remuSegment, {
                      backgroundColor: '#EC4899',
                      flex: stats.gifts_coins_earned / stats.total_coins_earned,
                    }]} />
                  )}
                  {stats.community_coins_earned > 0 && (
                    <View style={[styles.remuSegment, {
                      backgroundColor: '#7B3FF2',
                      flex: stats.community_coins_earned / stats.total_coins_earned,
                    }]} />
                  )}
                  {(stats.total_coins_earned - stats.gifts_coins_earned - stats.community_coins_earned) > 0 && (
                    <View style={[styles.remuSegment, {
                      backgroundColor: '#F59E0B',
                      flex: (stats.total_coins_earned - stats.gifts_coins_earned - stats.community_coins_earned) / stats.total_coins_earned,
                    }]} />
                  )}
                </View>
                <View style={styles.remuLegend}>
                  <View style={styles.remuLegendItem}>
                    <View style={[styles.remuDot, { backgroundColor: '#EC4899' }]} />
                    <Text style={[styles.remuLegendText, { color: colors.textTertiary }]}>Cadeaux</Text>
                  </View>
                  <View style={styles.remuLegendItem}>
                    <View style={[styles.remuDot, { backgroundColor: '#7B3FF2' }]} />
                    <Text style={[styles.remuLegendText, { color: colors.textTertiary }]}>Communauté</Text>
                  </View>
                  <View style={styles.remuLegendItem}>
                    <View style={[styles.remuDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={[styles.remuLegendText, { color: colors.textTertiary }]}>Autres</Text>
                  </View>
                </View>
              </View>
            )}
          </SectionCard>

          {/* Taux d'engagement */}
          {(stats.reels_views + stats.stories_views) > 0 && (
            <View style={[styles.engagementCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.engagementTitle, { color: colors.textTertiary }]}>TAUX D'ENGAGEMENT</Text>
              {[
                {
                  label: 'Reels (likes/vues)',
                  rate: stats.reels_views > 0 ? (stats.reels_likes / stats.reels_views) * 100 : 0,
                  color: '#7B3FF2',
                },
                {
                  label: 'Reels (commentaires/vues)',
                  rate: stats.reels_views > 0 ? (stats.reels_comments / stats.reels_views) * 100 : 0,
                  color: '#3B82F6',
                },
                {
                  label: 'Stories (likes/vues)',
                  rate: stats.stories_views > 0 ? (stats.stories_likes / stats.stories_views) * 100 : 0,
                  color: '#EC4899',
                },
              ].map((item, i) => (
                <View key={item.label} style={i > 0 ? [styles.engRow, { borderTopColor: colors.border }] : styles.engRow}>
                  <Text style={[styles.engLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                  <View style={styles.engRight}>
                    <View style={[styles.engBar, { backgroundColor: colors.backgroundSecondary }]}>
                      <View style={[styles.engFill, { backgroundColor: item.color, width: `${Math.min(item.rate, 100)}%` }]} />
                    </View>
                    <Text style={[styles.engPct, { color: item.color }]}>{item.rate.toFixed(1)}%</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  headerSub: { fontSize: 11, fontWeight: '500' },

  scrollContent: { paddingTop: 0 },

  heroBanner: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 18,
    padding: 20, marginBottom: 8,
  },
  heroName: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  heroCommunity: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '500', marginBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { color: '#fff', fontSize: 22, fontWeight: '900' },
  heroStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  heroSep: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: 'rgba(255,255,255,0.25)' },

  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cardBody: { padding: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: {
    flex: 1, minWidth: '28%', borderRadius: 12, borderWidth: 1,
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, gap: 5,
  },
  statIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4, textAlign: 'center' },

  remuRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 14, gap: 10 },
  remuTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  remuBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.1)' },
  remuSegment: { height: '100%' },
  remuLegend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  remuLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  remuDot: { width: 8, height: 8, borderRadius: 4 },
  remuLegendText: { fontSize: 11, fontWeight: '500' },

  engagementCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 16, borderWidth: 1, padding: 14, gap: 0,
  },
  engagementTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  engRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  engLabel: { fontSize: 12, fontWeight: '500' },
  engRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  engBar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  engFill: { height: '100%', borderRadius: 3 },
  engPct: { fontSize: 12, fontWeight: '800', minWidth: 40, textAlign: 'right' },

  errorText: { fontSize: 15, fontWeight: '500' },
  retryBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
