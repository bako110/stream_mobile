import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Animated, StatusBar, Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppColors } from '../../theme';
import { apiClient } from '../../api/client';

// ── Types ──────────────────────────────────────────────────────────────────

interface TopReel {
  id: string; caption: string | null; thumbnail_url: string | null;
  views: number; likes: number; comments: number; shares: number;
  created_at: string | null;
}
interface TopPost {
  id: string; body: string | null; image_url: string | null;
  likes: number; comments: number; shares: number; created_at: string | null;
}
interface TopStory {
  id: string; media_url: string | null;
  views: number; likes: number; created_at: string | null;
}
interface TopLive {
  id: string; title: string; thumbnail_url: string | null;
  peak_viewers: number; status: string;
  started_at: string | null; ended_at: string | null;
}

interface CreatorStats {
  reels_count: number; reels_views: number; reels_likes: number;
  reels_comments: number; reels_shares: number;
  posts_count: number; posts_likes: number; posts_comments: number; posts_shares: number;
  stories_count: number; stories_views: number; stories_likes: number;
  lives_count: number; lives_total_viewers: number; lives_best_viewers: number;
  followers: number; following: number;
  total_coins_earned: number; gifts_coins_earned: number; community_coins_earned: number;
  top_reels: TopReel[];
  top_posts: TopPost[];
  top_stories: TopStory[];
  top_lives: TopLive[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function rate(num: number, denom: number): string {
  if (!denom) return '—';
  return ((num / denom) * 100).toFixed(1) + '%';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, accent }: { title: string; accent: string }) {
  return (
    <View style={[styles.sectionHeader, { borderLeftColor: accent }]}>
      <Text style={[styles.sectionTitle, { color: accent }]}>{title.toUpperCase()}</Text>
    </View>
  );
}

function StatCard({ icon, iconColor, value, label, colors }: {
  icon: string; iconColor: string; value: string; label: string; colors: AppColors;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.statIcon, { backgroundColor: iconColor + '22' }]}>
        <Icon name={icon} size={15} color={iconColor} />
      </View>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textTertiary }]}>{label}</Text>
    </View>
  );
}

function EngBar({ label, value, denom, color, colors }: {
  label: string; value: number; denom: number; color: string; colors: AppColors;
}) {
  const w = useRef(new Animated.Value(0)).current;
  const pct = denom > 0 ? Math.min(value / denom, 1) : 0;
  useEffect(() => {
    Animated.timing(w, { toValue: pct, duration: 600, delay: 150, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={styles.engRow}>
      <Text style={[styles.engLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.engTrack, { backgroundColor: colors.divider }]}>
        <Animated.View style={[styles.engFill, {
          backgroundColor: color,
          width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>
      <Text style={[styles.engPct, { color: colors.textTertiary }]}>{rate(value, denom)}</Text>
    </View>
  );
}

// ── Content row cards ─────────────────────────────────────────────────────────

function ReelRow({ item, colors }: { item: TopReel; colors: AppColors }) {
  return (
    <View style={[styles.contentRow, { backgroundColor: colors.backgroundSecondary }]}>
      {item.thumbnail_url
        ? <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: '#7B3FF222', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="film" size={18} color="#7B3FF2" />
          </View>
      }
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={[styles.contentTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.caption || 'Reel sans titre'}
        </Text>
        <View style={styles.contentStats}>
          <Icon name="eye" size={11} color={colors.textTertiary} />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.views)}</Text>
          <Icon name="heart" size={11} color="#EF4444" />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.likes)}</Text>
          <Icon name="message-circle" size={11} color="#3B82F6" />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.comments)}</Text>
          <Icon name="share-2" size={11} color="#F59E0B" />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.shares)}</Text>
        </View>
      </View>
      <View style={[styles.engBadge, { backgroundColor: '#7B3FF222' }]}>
        <Text style={[styles.engBadgeTxt, { color: '#7B3FF2' }]}>{rate(item.likes, item.views)}</Text>
      </View>
    </View>
  );
}

function PostRow({ item, colors }: { item: TopPost; colors: AppColors }) {
  return (
    <View style={[styles.contentRow, { backgroundColor: colors.backgroundSecondary }]}>
      {item.image_url
        ? <Image source={{ uri: item.image_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: '#10B98122', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="file-text" size={18} color="#10B981" />
          </View>
      }
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={[styles.contentTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.body || 'Post sans texte'}
        </Text>
        <View style={styles.contentStats}>
          <Icon name="heart" size={11} color="#EF4444" />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.likes)}</Text>
          <Icon name="message-circle" size={11} color="#3B82F6" />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.comments)}</Text>
          <Icon name="share-2" size={11} color="#F59E0B" />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.shares)}</Text>
        </View>
      </View>
      <View style={[styles.engBadge, { backgroundColor: '#10B98122' }]}>
        <Text style={[styles.engBadgeTxt, { color: '#10B981' }]}>{fmt(item.likes)} likes</Text>
      </View>
    </View>
  );
}

function StoryRow({ item, colors }: { item: TopStory; colors: AppColors }) {
  return (
    <View style={[styles.contentRow, { backgroundColor: colors.backgroundSecondary }]}>
      {item.media_url
        ? <Image source={{ uri: item.media_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: '#F59E0B22', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="camera" size={18} color="#F59E0B" />
          </View>
      }
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={[styles.contentTitle, { color: colors.textPrimary }]}>Story</Text>
        <View style={styles.contentStats}>
          <Icon name="eye" size={11} color={colors.textTertiary} />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.views)}</Text>
          <Icon name="heart" size={11} color="#EF4444" />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.likes)}</Text>
        </View>
      </View>
      <View style={[styles.engBadge, { backgroundColor: '#F59E0B22' }]}>
        <Text style={[styles.engBadgeTxt, { color: '#F59E0B' }]}>{rate(item.likes, item.views)}</Text>
      </View>
    </View>
  );
}

function LiveRow({ item, colors }: { item: TopLive; colors: AppColors }) {
  const isLive = item.status === 'active';
  return (
    <View style={[styles.contentRow, { backgroundColor: colors.backgroundSecondary }]}>
      {item.thumbnail_url
        ? <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: '#EF444422', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="radio" size={18} color="#EF4444" />
          </View>
      }
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={[styles.contentTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
        <View style={styles.contentStats}>
          <Icon name="users" size={11} color={colors.textTertiary} />
          <Text style={[styles.contentStat, { color: colors.textTertiary }]}>{fmt(item.peak_viewers)} pic</Text>
        </View>
      </View>
      <View style={[styles.engBadge, { backgroundColor: isLive ? '#EF444422' : colors.divider }]}>
        <Text style={[styles.engBadgeTxt, { color: isLive ? '#EF4444' : colors.textTertiary }]}>
          {isLive ? 'EN DIRECT' : 'Terminé'}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function CreatorStatsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const colors = theme.colors;

  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'reels' | 'posts' | 'stories' | 'lives'>('reels');

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
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error ?? 'Erreur'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryTxt}>Reessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const TABS: { key: typeof tab; label: string; accent: string; count: number }[] = [
    { key: 'reels',   label: 'Reels',   accent: '#7B3FF2', count: stats.reels_count },
    { key: 'posts',   label: 'Posts',   accent: '#10B981', count: stats.posts_count },
    { key: 'stories', label: 'Stories', accent: '#F59E0B', count: stats.stories_count },
    { key: 'lives',   label: 'Lives',   accent: '#EF4444', count: stats.lives_count },
  ];

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#7B3FF2" />}
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
              <Text style={[styles.heroValue, { color: colors.textPrimary }]}>{fmt(stats.reels_views + stats.stories_views + stats.lives_total_viewers)}</Text>
              <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>Vues totales</Text>
            </View>
            <View style={[styles.heroDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.heroItem}>
              <Text style={[styles.heroValue, { color: '#FFD700' }]}>{fmt(stats.total_coins_earned)}</Text>
              <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>Coins gagnes</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Aggregats par type */}
        <SectionHeader title="Vue d'ensemble" accent="#7B3FF2" />
        <View style={styles.grid4}>
          <StatCard icon="film"    iconColor="#7B3FF2" value={fmt(stats.reels_count)}   label="Reels"   colors={colors} />
          <StatCard icon="file-text" iconColor="#10B981" value={fmt(stats.posts_count)} label="Posts"   colors={colors} />
          <StatCard icon="camera"  iconColor="#F59E0B" value={fmt(stats.stories_count)} label="Stories" colors={colors} />
          <StatCard icon="radio"   iconColor="#EF4444" value={fmt(stats.lives_count)}   label="Lives"   colors={colors} />
        </View>

        {/* Stats Reels */}
        <SectionHeader title="Reels — stats globales" accent="#7B3FF2" />
        <View style={styles.grid}>
          <StatCard icon="eye"            iconColor="#3B82F6" value={fmt(stats.reels_views)}    label="Vues"      colors={colors} />
          <StatCard icon="heart"          iconColor="#EF4444" value={fmt(stats.reels_likes)}    label="Likes"     colors={colors} />
          <StatCard icon="message-circle" iconColor="#10B981" value={fmt(stats.reels_comments)} label="Comm."     colors={colors} />
          <StatCard icon="share-2"        iconColor="#F59E0B" value={fmt(stats.reels_shares)}   label="Partages"  colors={colors} />
        </View>

        {/* Stats Posts */}
        <SectionHeader title="Posts — stats globales" accent="#10B981" />
        <View style={styles.grid}>
          <StatCard icon="heart"          iconColor="#EF4444" value={fmt(stats.posts_likes)}    label="Likes"     colors={colors} />
          <StatCard icon="message-circle" iconColor="#3B82F6" value={fmt(stats.posts_comments)} label="Comm."     colors={colors} />
          <StatCard icon="share-2"        iconColor="#F59E0B" value={fmt(stats.posts_shares)}   label="Partages"  colors={colors} />
        </View>

        {/* Stats Stories */}
        <SectionHeader title="Stories — stats globales" accent="#F59E0B" />
        <View style={styles.grid}>
          <StatCard icon="eye"   iconColor="#3B82F6" value={fmt(stats.stories_views)} label="Vues"  colors={colors} />
          <StatCard icon="heart" iconColor="#EF4444" value={fmt(stats.stories_likes)} label="Likes" colors={colors} />
        </View>

        {/* Stats Lives */}
        <SectionHeader title="Lives — stats globales" accent="#EF4444" />
        <View style={styles.grid}>
          <StatCard icon="radio"  iconColor="#EF4444" value={fmt(stats.lives_count)}          label="Lives"       colors={colors} />
          <StatCard icon="users"  iconColor="#3B82F6" value={fmt(stats.lives_total_viewers)}  label="Viewers tot." colors={colors} />
          <StatCard icon="zap"    iconColor="#F59E0B" value={fmt(stats.lives_best_viewers)}   label="Pic viewers"  colors={colors} />
        </View>

        {/* Taux d'engagement */}
        <SectionHeader title="Taux d'engagement" accent="#8B5CF6" />
        <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
          <EngBar label="Likes / Vues reels"   value={stats.reels_likes}    denom={stats.reels_views}    color="#EF4444" colors={colors} />
          <EngBar label="Comm. / Vues reels"   value={stats.reels_comments} denom={stats.reels_views}    color="#3B82F6" colors={colors} />
          <EngBar label="Likes / Vues stories" value={stats.stories_likes}  denom={stats.stories_views}  color="#F59E0B" colors={colors} />
          <EngBar label="Likes / Posts"        value={stats.posts_likes}    denom={stats.posts_count}    color="#10B981" colors={colors} />
        </View>

        {/* Coins */}
        <SectionHeader title="Coins & Remuneration" accent="#FFD700" />
        <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={styles.coinsRow}>
            <View style={styles.coinsItem}>
              <Text style={[styles.coinsVal, { color: '#FFD700' }]}>{fmt(stats.total_coins_earned)}</Text>
              <Text style={[styles.coinsLbl, { color: colors.textTertiary }]}>Total</Text>
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
            <View style={[styles.barTrack, { backgroundColor: colors.divider, marginTop: 14 }]}>
              <View style={[styles.barFill, { flex: stats.gifts_coins_earned, backgroundColor: '#E0389A' }]} />
              <View style={[styles.barFill, { flex: stats.community_coins_earned, backgroundColor: '#7B3FF2' }]} />
              <View style={[styles.barFill, { flex: Math.max(0, stats.total_coins_earned - stats.gifts_coins_earned - stats.community_coins_earned), backgroundColor: '#FFD700' }]} />
            </View>
          )}
        </View>

        {/* Contenu individuel — tabs */}
        <SectionHeader title="Contenu individuel" accent="#3B82F6" />
        <View style={[styles.tabBar, { backgroundColor: colors.backgroundSecondary }]}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabItem, tab === t.key && { borderBottomColor: t.accent, borderBottomWidth: 2 }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, { color: tab === t.key ? t.accent : colors.textTertiary }]}>
                {t.label}
              </Text>
              <View style={[styles.tabBadge, { backgroundColor: tab === t.key ? t.accent + '22' : colors.divider }]}>
                <Text style={[styles.tabBadgeTxt, { color: tab === t.key ? t.accent : colors.textTertiary }]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'reels' && (
          stats.top_reels.length === 0
            ? <Text style={[styles.empty, { color: colors.textTertiary }]}>Aucun reel</Text>
            : stats.top_reels.map(item => <ReelRow key={item.id} item={item} colors={colors} />)
        )}
        {tab === 'posts' && (
          stats.top_posts.length === 0
            ? <Text style={[styles.empty, { color: colors.textTertiary }]}>Aucun post</Text>
            : stats.top_posts.map(item => <PostRow key={item.id} item={item} colors={colors} />)
        )}
        {tab === 'stories' && (
          stats.top_stories.length === 0
            ? <Text style={[styles.empty, { color: colors.textTertiary }]}>Aucune story</Text>
            : stats.top_stories.map(item => <StoryRow key={item.id} item={item} colors={colors} />)
        )}
        {tab === 'lives' && (
          stats.top_lives.length === 0
            ? <Text style={[styles.empty, { color: colors.textTertiary }]}>Aucun live</Text>
            : stats.top_lives.map(item => <LiveRow key={item.id} item={item} colors={colors} />)
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText:   { fontSize: 14, textAlign: 'center', marginTop: 8 },
  retryBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#7B3FF2', borderRadius: 20 },
  retryTxt:    { color: '#fff', fontWeight: '600' },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  scroll:      { paddingHorizontal: 16, paddingTop: 16 },

  hero:        { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 20 },
  heroRow:     { flexDirection: 'row', alignItems: 'center' },
  heroItem:    { flex: 1, alignItems: 'center' },
  heroValue:   { fontSize: 22, fontWeight: '800' },
  heroLabel:   { fontSize: 11, marginTop: 2 },
  heroDivider: { width: 1, height: 40 },

  sectionHeader: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10, marginTop: 8 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },

  grid4:   { flexDirection: 'row', gap: 8, marginBottom: 18 },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  statCard: { flex: 1, minWidth: '22%', borderRadius: 12, padding: 10, alignItems: 'center', gap: 5 },
  statIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 10, textAlign: 'center' },

  card:       { borderRadius: 14, padding: 14, marginBottom: 18 },

  engRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  engLabel: { width: 155, fontSize: 12 },
  engTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', marginHorizontal: 8 },
  engFill:  { height: '100%', borderRadius: 3 },
  engPct:   { width: 38, fontSize: 11, textAlign: 'right' },

  coinsRow:  { flexDirection: 'row' },
  coinsItem: { flex: 1, alignItems: 'center' },
  coinsVal:  { fontSize: 20, fontWeight: '800' },
  coinsLbl:  { fontSize: 10, marginTop: 2 },
  barTrack:  { flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden' },
  barFill:   { height: '100%' },

  tabBar:      { flexDirection: 'row', borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  tabItem:     { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 4 },
  tabLabel:    { fontSize: 11, fontWeight: '700' },
  tabBadge:    { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeTxt: { fontSize: 10, fontWeight: '700' },

  contentRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, marginBottom: 8 },
  thumb:        { width: 52, height: 52, borderRadius: 8 },
  contentTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  contentStats: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contentStat:  { fontSize: 11, marginRight: 4 },
  engBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  engBadgeTxt:  { fontSize: 10, fontWeight: '700' },

  empty: { textAlign: 'center', fontSize: 13, paddingVertical: 20 },
});
