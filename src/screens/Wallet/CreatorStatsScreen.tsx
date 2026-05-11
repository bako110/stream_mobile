import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Animated, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';

// ── Types ──────────────────────────────────────────────────────────────────

interface CreatorStats {
  reels_count: number;
  reels_views: number;
  reels_likes: number;
  reels_comments: number;
  reels_shares: number;
  posts_count: number;
  posts_likes: number;
  posts_comments: number;
  posts_shares: number;
  stories_count: number;
  stories_views: number;
  stories_likes: number;
  followers: number;
  following: number;
  total_coins_earned: number;
  gifts_coins_earned: number;
  community_coins_earned: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function rate(num: number, denom: number): string {
  if (!denom) return '0%';
  return ((num / denom) * 100).toFixed(1) + '%';
}

// ── StatCell ─────────────────────────────────────────────────────────────────

interface StatCellProps {
  icon: string;
  iconColor: string;
  value: string;
  label: string;
  delay?: number;
  colors: ReturnType<typeof useTheme>['colors'];
}

function StatCell({ icon, iconColor, value, label, delay = 0, colors }: StatCellProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.statCell, { backgroundColor: colors.backgroundSecondary, opacity, transform: [{ translateY }] }]}>
      <View style={[styles.statIcon, { backgroundColor: iconColor + '22' }]}>
        <Icon name={icon} size={16} color={iconColor} />
      </View>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textTertiary }]}>{label}</Text>
    </Animated.View>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ title, accent }: { title: string; accent: string }) {
  return (
    <View style={[styles.sectionHeader, { borderLeftColor: accent }]}>
      <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
    </View>
  );
}

// ── EngagementBar ─────────────────────────────────────────────────────────────

function EngagementBar({ label, value, max, color, colors }: {
  label: string; value: number; max: number; color: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const width = useRef(new Animated.Value(0)).current;
  const pct = max > 0 ? value / max : 0;

  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 600, delay: 200, useNativeDriver: false }).start();
  }, [pct]);

  return (
    <View style={styles.engRow}>
      <Text style={[styles.engLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.engTrack, { backgroundColor: colors.divider }]}>
        <Animated.View style={[styles.engFill, { backgroundColor: color, width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      <Text style={[styles.engPct, { color: colors.textTertiary }]}>{rate(value, max)}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function CreatorStatsScreen() {
  const nav = useNavigation<any>();
  const { colors } = useTheme();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<CreatorStats>('/api/v1/users/me/stats');
      setStats(res.data);
    } catch {
      setError('Impossible de charger les statistiques.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#7B3FF2" />
      </View>
    );
  }

  if (error || !stats) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <Icon name="alert-circle" size={40} color="#EF4444" />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error ?? 'Erreur inconnue'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryTxt}>Reessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalEngagement = stats.reels_views + stats.posts_likes + stats.stories_views;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#1a0533', '#7B3FF2']} style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes statistiques</Text>
        <View style={{ width: 38 }} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B3FF2" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient colors={['#7B3FF222', '#7B3FF205']} style={[styles.hero, { borderColor: '#7B3FF230' }]}>
          <View style={styles.heroRow}>
            <View style={styles.heroItem}>
              <Text style={[styles.heroValue, { color: colors.textPrimary }]}>{fmt(stats.followers)}</Text>
              <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>Abonnes</Text>
            </View>
            <View style={[styles.heroDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.heroItem}>
              <Text style={[styles.heroValue, { color: colors.textPrimary }]}>{fmt(stats.reels_views + stats.stories_views)}</Text>
              <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>Vues totales</Text>
            </View>
            <View style={[styles.heroDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.heroItem}>
              <Text style={[styles.heroValue, { color: '#FFD700' }]}>{fmt(stats.total_coins_earned)}</Text>
              <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>Coins gagnes</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Reels */}
        <SectionHeader title="Reels" accent="#7B3FF2" />
        <View style={styles.grid}>
          <StatCell icon="film"        iconColor="#7B3FF2" value={fmt(stats.reels_count)}    label="Publies"     delay={0}   colors={colors} />
          <StatCell icon="eye"         iconColor="#3B82F6" value={fmt(stats.reels_views)}    label="Vues"        delay={50}  colors={colors} />
          <StatCell icon="heart"       iconColor="#EF4444" value={fmt(stats.reels_likes)}    label="Likes"       delay={100} colors={colors} />
          <StatCell icon="message-circle" iconColor="#10B981" value={fmt(stats.reels_comments)} label="Commentaires" delay={150} colors={colors} />
          <StatCell icon="share-2"     iconColor="#F59E0B" value={fmt(stats.reels_shares)}   label="Partages"    delay={200} colors={colors} />
        </View>

        {/* Posts */}
        <SectionHeader title="Posts" accent="#10B981" />
        <View style={styles.grid}>
          <StatCell icon="file-text"   iconColor="#10B981" value={fmt(stats.posts_count)}    label="Publies"     delay={0}   colors={colors} />
          <StatCell icon="heart"       iconColor="#EF4444" value={fmt(stats.posts_likes)}    label="Likes"       delay={50}  colors={colors} />
          <StatCell icon="message-circle" iconColor="#3B82F6" value={fmt(stats.posts_comments)} label="Commentaires" delay={100} colors={colors} />
          <StatCell icon="share-2"     iconColor="#F59E0B" value={fmt(stats.posts_shares)}   label="Partages"    delay={150} colors={colors} />
        </View>

        {/* Stories */}
        <SectionHeader title="Stories" accent="#F59E0B" />
        <View style={styles.grid}>
          <StatCell icon="camera"      iconColor="#F59E0B" value={fmt(stats.stories_count)}  label="Publiees"    delay={0}   colors={colors} />
          <StatCell icon="eye"         iconColor="#3B82F6" value={fmt(stats.stories_views)}  label="Vues"        delay={50}  colors={colors} />
          <StatCell icon="heart"       iconColor="#EF4444" value={fmt(stats.stories_likes)}  label="Likes"       delay={100} colors={colors} />
        </View>

        {/* Engagement */}
        <SectionHeader title="Taux d'engagement" accent="#EF4444" />
        <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
          <EngagementBar label="Likes / Vues reels"     value={stats.reels_likes}    max={stats.reels_views}   color="#EF4444" colors={colors} />
          <EngagementBar label="Comm. / Vues reels"     value={stats.reels_comments} max={stats.reels_views}   color="#3B82F6" colors={colors} />
          <EngagementBar label="Likes / Vues stories"   value={stats.stories_likes}  max={stats.stories_views} color="#F59E0B" colors={colors} />
          <EngagementBar label="Likes / Posts"          value={stats.posts_likes}    max={stats.posts_count}   color="#10B981" colors={colors} />
        </View>

        {/* Coins */}
        <SectionHeader title="Coins & Remuneration" accent="#FFD700" />
        <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={styles.coinsRow}>
            <View style={styles.coinsItem}>
              <Text style={[styles.coinsVal, { color: '#FFD700' }]}>{fmt(stats.total_coins_earned)}</Text>
              <Text style={[styles.coinsLbl, { color: colors.textTertiary }]}>Total coins</Text>
            </View>
            <View style={styles.coinsItem}>
              <Text style={[styles.coinsVal, { color: '#E0389A' }]}>{fmt(stats.gifts_coins_earned)}</Text>
              <Text style={[styles.coinsLbl, { color: colors.textTertiary }]}>Cadeaux</Text>
            </View>
            <View style={styles.coinsItem}>
              <Text style={[styles.coinsVal, { color: '#7B3FF2' }]}>{fmt(stats.community_coins_earned)}</Text>
              <Text style={[styles.coinsLbl, { color: colors.textTertiary }]}>Communautes</Text>
            </View>
          </View>

          {stats.total_coins_earned > 0 && (
            <View style={[styles.barTrack, { backgroundColor: colors.divider, marginTop: 16 }]}>
              <View style={[styles.barFill, { flex: stats.gifts_coins_earned, backgroundColor: '#E0389A' }]} />
              <View style={[styles.barFill, { flex: stats.community_coins_earned, backgroundColor: '#7B3FF2' }]} />
              <View style={[styles.barFill, {
                flex: Math.max(0, stats.total_coins_earned - stats.gifts_coins_earned - stats.community_coins_earned),
                backgroundColor: '#FFD700',
              }]} />
            </View>
          )}

          <View style={styles.legendRow}>
            {[['#E0389A', 'Cadeaux'], ['#7B3FF2', 'Communautes'], ['#FFD700', 'Autres']].map(([c, l]) => (
              <View key={l} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={[styles.legendTxt, { color: colors.textTertiary }]}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Audience */}
        <SectionHeader title="Audience" accent="#3B82F6" />
        <View style={styles.grid}>
          <StatCell icon="users"    iconColor="#3B82F6" value={fmt(stats.followers)} label="Abonnes"   delay={0}  colors={colors} />
          <StatCell icon="user-plus" iconColor="#10B981" value={fmt(stats.following)} label="Abonnements" delay={50} colors={colors} />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText:      { fontSize: 14, textAlign: 'center', marginTop: 8 },
  retryBtn:       { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#7B3FF2', borderRadius: 20 },
  retryTxt:       { color: '#fff', fontWeight: '600' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 17, fontWeight: '700', color: '#fff' },
  scroll:         { paddingHorizontal: 16, paddingTop: 16 },

  hero:           { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 24 },
  heroRow:        { flexDirection: 'row', alignItems: 'center' },
  heroItem:       { flex: 1, alignItems: 'center' },
  heroValue:      { fontSize: 22, fontWeight: '800' },
  heroLabel:      { fontSize: 11, marginTop: 2 },
  heroDivider:    { width: 1, height: 40 },

  sectionHeader:  { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 12, marginTop: 4 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  grid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCell:       { width: '30%', flexGrow: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 6 },
  statIcon:       { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  statValue:      { fontSize: 18, fontWeight: '800' },
  statLabel:      { fontSize: 10, textAlign: 'center' },

  card:           { borderRadius: 14, padding: 16, marginBottom: 20 },

  engRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  engLabel:       { width: 160, fontSize: 12 },
  engTrack:       { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', marginHorizontal: 8 },
  engFill:        { height: '100%', borderRadius: 3 },
  engPct:         { width: 40, fontSize: 11, textAlign: 'right' },

  coinsRow:       { flexDirection: 'row' },
  coinsItem:      { flex: 1, alignItems: 'center' },
  coinsVal:       { fontSize: 20, fontWeight: '800' },
  coinsLbl:       { fontSize: 10, marginTop: 2 },

  barTrack:       { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill:        { height: '100%' },

  legendRow:      { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10 },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:      { width: 8, height: 8, borderRadius: 4 },
  legendTxt:      { fontSize: 11 },
});
