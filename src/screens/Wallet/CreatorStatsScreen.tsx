import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, StatusBar, Image, Dimensions,
} from 'react-native';
import Svg, { Rect, Text as SvgText, G, Line } from 'react-native-svg';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppColors } from '../../theme';
import { apiClient } from '../../api/client';

const W = Dimensions.get('window').width - 32;

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ── BarChart ─────────────────────────────────────────────────────────────────
// Histogramme groupé horizontal : un groupe de barres par métrique

interface BarChartProps {
  bars: { label: string; value: number; color: string }[];
  colors: AppColors;
  height?: number;
}

function BarChart({ bars, colors, height = 160 }: BarChartProps) {
  const paddingLeft = 48;
  const paddingBottom = 28;
  const chartW = W - 32;
  const chartH = height - paddingBottom;
  const max = Math.max(...bars.map(b => b.value), 1);
  const barWidth = Math.min(38, (chartW - paddingLeft) / bars.length - 8);
  const gap = (chartW - paddingLeft - bars.length * barWidth) / (bars.length + 1);

  return (
    <Svg width={chartW} height={height}>
      {/* Lignes horizontales de référence */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = chartH - pct * chartH;
        return (
          <G key={i}>
            <Line x1={paddingLeft} y1={y} x2={chartW} y2={y} stroke={colors.divider} strokeWidth={0.5} />
            <SvgText x={paddingLeft - 4} y={y + 4} fontSize={8} fill={colors.textTertiary} textAnchor="end">
              {fmt(Math.round(max * pct))}
            </SvgText>
          </G>
        );
      })}

      {/* Barres */}
      {bars.map((b, i) => {
        const barH = Math.max(2, (b.value / max) * chartH);
        const x = paddingLeft + gap + i * (barWidth + gap);
        const y = chartH - barH;
        return (
          <G key={i}>
            <Rect
              x={x} y={y} width={barWidth} height={barH}
              rx={4} fill={b.color}
              opacity={0.9}
            />
            <SvgText
              x={x + barWidth / 2} y={height - 6}
              fontSize={9} fill={colors.textTertiary} textAnchor="middle"
            >
              {b.label}
            </SvgText>
            <SvgText
              x={x + barWidth / 2} y={y - 4}
              fontSize={8} fill={b.color} textAnchor="middle" fontWeight="bold"
            >
              {fmt(b.value)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── DonutChart ───────────────────────────────────────────────────────────────

interface DonutProps {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  colors: AppColors;
}

function DonutChart({ segments, size = 120, colors }: DonutProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const strokeW = 18;

  let cumPct = 0;
  const arcs = segments.map(seg => {
    const pct = seg.value / total;
    const start = cumPct;
    cumPct += pct;
    return { ...seg, pct, start };
  });

  function describeArc(start: number, end: number) {
    const s = start * 2 * Math.PI - Math.PI / 2;
    const e = end * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(s);
    const y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e);
    const y2 = cy + r * Math.sin(e);
    const large = end - start > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  const { Path } = require('react-native-svg');

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* fond */}
        <Path
          d={describeArc(0, 0.9999)}
          fill="none" stroke={colors.divider} strokeWidth={strokeW}
        />
        {arcs.map((a, i) => (
          <Path
            key={i}
            d={describeArc(a.start, a.start + a.pct)}
            fill="none"
            stroke={a.color}
            strokeWidth={strokeW}
          />
        ))}
        <SvgText x={cx} y={cy - 6} fontSize={16} fontWeight="bold" fill={colors.textPrimary} textAnchor="middle">
          {fmt(total)}
        </SvgText>
        <SvgText x={cx} y={cy + 10} fontSize={9} fill={colors.textTertiary} textAnchor="middle">
          total
        </SvgText>
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
        {segments.map((seg, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seg.color }} />
            <Text style={{ fontSize: 10, color: colors.textSecondary }}>{seg.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ title, accent }: { title: string; accent: string }) {
  return (
    <View style={[styles.sectionHeader, { borderLeftColor: accent }]}>
      <Text style={[styles.sectionTitle, { color: accent }]}>{title.toUpperCase()}</Text>
    </View>
  );
}

// ── Content rows (cliquables) ─────────────────────────────────────────────────

function ReelRow({ item, colors, onPress }: { item: TopReel; colors: AppColors; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.contentRow, { backgroundColor: colors.backgroundSecondary }]} onPress={onPress} activeOpacity={0.75}>
      {item.thumbnail_url
        ? <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: '#7B3FF222', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="film" size={18} color="#7B3FF2" />
          </View>}
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={[styles.contentTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.caption || 'Reel sans titre'}
        </Text>
        <View style={styles.contentMeta}>
          <Icon name="eye" size={11} color={colors.textTertiary} />
          <Text style={[styles.metaTxt, { color: colors.textTertiary }]}>{fmt(item.views)}</Text>
          <Icon name="heart" size={11} color="#EF4444" />
          <Text style={[styles.metaTxt, { color: colors.textTertiary }]}>{fmt(item.likes)}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={15} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

function PostRow({ item, colors, onPress }: { item: TopPost; colors: AppColors; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.contentRow, { backgroundColor: colors.backgroundSecondary }]} onPress={onPress} activeOpacity={0.75}>
      {item.image_url
        ? <Image source={{ uri: item.image_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: '#10B98122', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="file-text" size={18} color="#10B981" />
          </View>}
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={[styles.contentTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.body || 'Post sans texte'}
        </Text>
        <View style={styles.contentMeta}>
          <Icon name="heart" size={11} color="#EF4444" />
          <Text style={[styles.metaTxt, { color: colors.textTertiary }]}>{fmt(item.likes)}</Text>
          <Icon name="message-circle" size={11} color="#3B82F6" />
          <Text style={[styles.metaTxt, { color: colors.textTertiary }]}>{fmt(item.comments)}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={15} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

function StoryRow({ item, colors, onPress }: { item: TopStory; colors: AppColors; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.contentRow, { backgroundColor: colors.backgroundSecondary }]} onPress={onPress} activeOpacity={0.75}>
      {item.media_url
        ? <Image source={{ uri: item.media_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: '#F59E0B22', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="camera" size={18} color="#F59E0B" />
          </View>}
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={[styles.contentTitle, { color: colors.textPrimary }]}>Story</Text>
        <View style={styles.contentMeta}>
          <Icon name="eye" size={11} color={colors.textTertiary} />
          <Text style={[styles.metaTxt, { color: colors.textTertiary }]}>{fmt(item.views)}</Text>
          <Icon name="heart" size={11} color="#EF4444" />
          <Text style={[styles.metaTxt, { color: colors.textTertiary }]}>{fmt(item.likes)}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={15} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

function LiveRow({ item, colors, onPress }: { item: TopLive; colors: AppColors; onPress: () => void }) {
  const isLive = item.status === 'active';
  return (
    <TouchableOpacity style={[styles.contentRow, { backgroundColor: colors.backgroundSecondary }]} onPress={onPress} activeOpacity={0.75}>
      {item.thumbnail_url
        ? <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: '#EF444422', alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="radio" size={18} color="#EF4444" />
          </View>}
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={[styles.contentTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
        <View style={styles.contentMeta}>
          <Icon name="users" size={11} color={colors.textTertiary} />
          <Text style={[styles.metaTxt, { color: colors.textTertiary }]}>{fmt(item.peak_viewers)} pic</Text>
          {isLive && <View style={styles.liveDot} />}
        </View>
      </View>
      <Icon name="chevron-right" size={15} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

// ── ContentDetailModal ────────────────────────────────────────────────────────

type ContentDetail =
  | { type: 'reel'; data: TopReel }
  | { type: 'post'; data: TopPost }
  | { type: 'story'; data: TopStory }
  | { type: 'live'; data: TopLive };

function ContentDetailScreen({ detail, colors, onBack }: {
  detail: ContentDetail; colors: AppColors; onBack: () => void;
}) {
  const accent =
    detail.type === 'reel' ? '#7B3FF2' :
    detail.type === 'post' ? '#10B981' :
    detail.type === 'story' ? '#F59E0B' : '#EF4444';

  const thumb =
    detail.type === 'reel' ? (detail.data as TopReel).thumbnail_url :
    detail.type === 'post' ? (detail.data as TopPost).image_url :
    detail.type === 'story' ? (detail.data as TopStory).media_url :
    (detail.data as TopLive).thumbnail_url;

  const title =
    detail.type === 'reel' ? ((detail.data as TopReel).caption || 'Reel sans titre') :
    detail.type === 'post' ? ((detail.data as TopPost).body || 'Post sans texte') :
    detail.type === 'story' ? 'Story' :
    (detail.data as TopLive).title;

  let bars: { label: string; value: number; color: string }[] = [];
  let donutSegments: { value: number; color: string; label: string }[] = [];

  if (detail.type === 'reel') {
    const d = detail.data as TopReel;
    bars = [
      { label: 'Vues',     value: d.views,    color: '#3B82F6' },
      { label: 'Likes',    value: d.likes,    color: '#EF4444' },
      { label: 'Comm.',    value: d.comments, color: '#10B981' },
      { label: 'Partages', value: d.shares,   color: '#F59E0B' },
    ];
    donutSegments = [
      { value: d.likes,    color: '#EF4444', label: 'Likes' },
      { value: d.comments, color: '#10B981', label: 'Commentaires' },
      { value: d.shares,   color: '#F59E0B', label: 'Partages' },
    ];
  } else if (detail.type === 'post') {
    const d = detail.data as TopPost;
    bars = [
      { label: 'Likes',    value: d.likes,    color: '#EF4444' },
      { label: 'Comm.',    value: d.comments, color: '#3B82F6' },
      { label: 'Partages', value: d.shares,   color: '#F59E0B' },
    ];
    donutSegments = [
      { value: d.likes,    color: '#EF4444', label: 'Likes' },
      { value: d.comments, color: '#3B82F6', label: 'Commentaires' },
      { value: d.shares,   color: '#F59E0B', label: 'Partages' },
    ];
  } else if (detail.type === 'story') {
    const d = detail.data as TopStory;
    bars = [
      { label: 'Vues',  value: d.views, color: '#3B82F6' },
      { label: 'Likes', value: d.likes, color: '#EF4444' },
    ];
    donutSegments = [
      { value: d.views, color: '#3B82F6', label: 'Vues' },
      { value: d.likes, color: '#EF4444', label: 'Likes' },
    ];
  } else {
    const d = detail.data as TopLive;
    bars = [
      { label: 'Pic viewers', value: d.peak_viewers, color: '#EF4444' },
    ];
    donutSegments = [
      { value: d.peak_viewers, color: '#EF4444', label: 'Pic viewers' },
    ];
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#1a0533', accent]} style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {detail.type.charAt(0).toUpperCase() + detail.type.slice(1)} — stats
        </Text>
        <View style={{ width: 38 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Thumbnail + titre */}
        <View style={[styles.detailHero, { backgroundColor: colors.backgroundSecondary }]}>
          {thumb
            ? <Image source={{ uri: thumb }} style={styles.detailThumb} />
            : <View style={[styles.detailThumb, { backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name={detail.type === 'reel' ? 'film' : detail.type === 'post' ? 'file-text' : detail.type === 'story' ? 'camera' : 'radio'} size={32} color={accent} />
              </View>
          }
          <Text style={[styles.detailTitle, { color: colors.textPrimary }]}>{title}</Text>
        </View>

        {/* Histogramme */}
        <SectionHeader title="Histogramme" accent={accent} />
        <View style={[styles.chartCard, { backgroundColor: colors.backgroundSecondary }]}>
          <BarChart bars={bars} colors={colors} height={180} />
        </View>

        {/* Diagramme en anneau */}
        <SectionHeader title="Repartition engagement" accent={accent} />
        <View style={[styles.chartCard, { backgroundColor: colors.backgroundSecondary, alignItems: 'center' }]}>
          <DonutChart segments={donutSegments} colors={colors} size={140} />
        </View>

        {/* Chiffres exacts */}
        <SectionHeader title="Chiffres exacts" accent={accent} />
        <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
          {bars.map((b, i) => (
            <View key={i} style={[styles.exactRow, i < bars.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
              <View style={[styles.exactDot, { backgroundColor: b.color }]} />
              <Text style={[styles.exactLabel, { color: colors.textSecondary }]}>{b.label}</Text>
              <Text style={[styles.exactValue, { color: colors.textPrimary }]}>{b.value.toLocaleString()}</Text>
            </View>
          ))}
          {detail.type === 'reel' && (() => {
            const d = detail.data as TopReel;
            return (
              <View style={[styles.exactRow, { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                <View style={[styles.exactDot, { backgroundColor: '#8B5CF6' }]} />
                <Text style={[styles.exactLabel, { color: colors.textSecondary }]}>Taux engagement</Text>
                <Text style={[styles.exactValue, { color: '#8B5CF6' }]}>
                  {d.views > 0 ? ((d.likes / d.views) * 100).toFixed(2) + '%' : '—'}
                </Text>
              </View>
            );
          })()}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  const [detail, setDetail] = useState<ContentDetail | null>(null);

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

  if (detail && stats) {
    return <ContentDetailScreen detail={detail} colors={colors} onBack={() => setDetail(null)} />;
  }

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

  const reelBars = [
    { label: 'Vues',     value: stats.reels_views,    color: '#3B82F6' },
    { label: 'Likes',    value: stats.reels_likes,    color: '#EF4444' },
    { label: 'Comm.',    value: stats.reels_comments, color: '#10B981' },
    { label: 'Partages', value: stats.reels_shares,   color: '#F59E0B' },
  ];
  const postBars = [
    { label: 'Likes',    value: stats.posts_likes,    color: '#EF4444' },
    { label: 'Comm.',    value: stats.posts_comments, color: '#3B82F6' },
    { label: 'Partages', value: stats.posts_shares,   color: '#F59E0B' },
  ];
  const storyBars = [
    { label: 'Vues',  value: stats.stories_views, color: '#3B82F6' },
    { label: 'Likes', value: stats.stories_likes, color: '#EF4444' },
  ];
  const liveBars = [
    { label: 'Nb lives',       value: stats.lives_count,          color: '#EF4444' },
    { label: 'Viewers total',  value: stats.lives_total_viewers,  color: '#3B82F6' },
    { label: 'Pic max',        value: stats.lives_best_viewers,   color: '#F59E0B' },
  ];
  const coinsBars = [
    { label: 'Cadeaux',   value: stats.gifts_coins_earned,     color: '#E0389A' },
    { label: 'Communaute',value: stats.community_coins_earned, color: '#7B3FF2' },
    { label: 'Autres',    value: Math.max(0, stats.total_coins_earned - stats.gifts_coins_earned - stats.community_coins_earned), color: '#FFD700' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" />

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

        {/* Reels chart */}
        <SectionHeader title="Reels" accent="#7B3FF2" />
        <View style={[styles.chartCard, { backgroundColor: colors.backgroundSecondary }]}>
          <BarChart bars={reelBars} colors={colors} />
        </View>

        {/* Posts chart */}
        <SectionHeader title="Posts" accent="#10B981" />
        <View style={[styles.chartCard, { backgroundColor: colors.backgroundSecondary }]}>
          <BarChart bars={postBars} colors={colors} />
        </View>

        {/* Stories chart */}
        <SectionHeader title="Stories" accent="#F59E0B" />
        <View style={[styles.chartCard, { backgroundColor: colors.backgroundSecondary }]}>
          <BarChart bars={storyBars} colors={colors} />
        </View>

        {/* Lives chart */}
        <SectionHeader title="Lives" accent="#EF4444" />
        <View style={[styles.chartCard, { backgroundColor: colors.backgroundSecondary }]}>
          <BarChart bars={liveBars} colors={colors} />
        </View>

        {/* Coins chart */}
        <SectionHeader title="Coins & Remuneration" accent="#FFD700" />
        <View style={[styles.chartCard, { backgroundColor: colors.backgroundSecondary, flexDirection: 'row', alignItems: 'center' }]}>
          <DonutChart segments={coinsBars} colors={colors} size={130} />
          <View style={{ flex: 1, paddingLeft: 16 }}>
            {coinsBars.map((b, i) => (
              <View key={i} style={styles.coinRow}>
                <View style={[styles.exactDot, { backgroundColor: b.color }]} />
                <Text style={[styles.exactLabel, { color: colors.textSecondary, flex: 1 }]}>{b.label}</Text>
                <Text style={[styles.exactValue, { color: b.color }]}>{fmt(b.value)}</Text>
              </View>
            ))}
            <View style={[styles.coinRow, { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 4, paddingTop: 6 }]}>
              <View style={[styles.exactDot, { backgroundColor: '#FFD700' }]} />
              <Text style={[styles.exactLabel, { color: colors.textSecondary, flex: 1 }]}>Total</Text>
              <Text style={[styles.exactValue, { color: '#FFD700' }]}>{fmt(stats.total_coins_earned)}</Text>
            </View>
          </View>
        </View>

        {/* Contenu individuel */}
        <SectionHeader title="Contenu individuel" accent="#3B82F6" />
        <View style={[styles.tabBar, { backgroundColor: colors.backgroundSecondary }]}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabItem, tab === t.key && { borderBottomColor: t.accent, borderBottomWidth: 2 }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, { color: tab === t.key ? t.accent : colors.textTertiary }]}>{t.label}</Text>
              <View style={[styles.tabBadge, { backgroundColor: tab === t.key ? t.accent + '22' : colors.divider }]}>
                <Text style={[styles.tabBadgeTxt, { color: tab === t.key ? t.accent : colors.textTertiary }]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'reels' && (stats.top_reels.length === 0
          ? <Text style={[styles.empty, { color: colors.textTertiary }]}>Aucun reel</Text>
          : stats.top_reels.map(item => (
              <ReelRow key={item.id} item={item} colors={colors}
                onPress={() => setDetail({ type: 'reel', data: item })} />
            ))
        )}
        {tab === 'posts' && (stats.top_posts.length === 0
          ? <Text style={[styles.empty, { color: colors.textTertiary }]}>Aucun post</Text>
          : stats.top_posts.map(item => (
              <PostRow key={item.id} item={item} colors={colors}
                onPress={() => setDetail({ type: 'post', data: item })} />
            ))
        )}
        {tab === 'stories' && (stats.top_stories.length === 0
          ? <Text style={[styles.empty, { color: colors.textTertiary }]}>Aucune story</Text>
          : stats.top_stories.map(item => (
              <StoryRow key={item.id} item={item} colors={colors}
                onPress={() => setDetail({ type: 'story', data: item })} />
            ))
        )}
        {tab === 'lives' && (stats.top_lives.length === 0
          ? <Text style={[styles.empty, { color: colors.textTertiary }]}>Aucun live</Text>
          : stats.top_lives.map(item => (
              <LiveRow key={item.id} item={item} colors={colors}
                onPress={() => setDetail({ type: 'live', data: item })} />
            ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText:    { fontSize: 14, textAlign: 'center', marginTop: 8 },
  retryBtn:     { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#7B3FF2', borderRadius: 20 },
  retryTxt:     { color: '#fff', fontWeight: '600' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: '#fff', flex: 1, textAlign: 'center' },
  scroll:       { paddingHorizontal: 16, paddingTop: 16 },
  hero:         { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 20 },
  heroRow:      { flexDirection: 'row', alignItems: 'center' },
  heroItem:     { flex: 1, alignItems: 'center' },
  heroValue:    { fontSize: 22, fontWeight: '800' },
  heroLabel:    { fontSize: 11, marginTop: 2 },
  heroDivider:  { width: 1, height: 40 },
  sectionHeader:{ borderLeftWidth: 3, paddingLeft: 10, marginBottom: 8, marginTop: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  chartCard:    { borderRadius: 14, padding: 14, marginBottom: 16 },
  card:         { borderRadius: 14, padding: 14, marginBottom: 16 },
  tabBar:       { flexDirection: 'row', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  tabItem:      { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabLabel:     { fontSize: 11, fontWeight: '700' },
  tabBadge:     { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeTxt:  { fontSize: 10, fontWeight: '700' },
  contentRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, marginBottom: 8 },
  thumb:        { width: 52, height: 52, borderRadius: 8 },
  contentTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  contentMeta:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:      { fontSize: 11, marginRight: 6 },
  liveDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginLeft: 4 },
  empty:        { textAlign: 'center', fontSize: 13, paddingVertical: 20 },
  exactRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  exactDot:     { width: 8, height: 8, borderRadius: 4 },
  exactLabel:   { flex: 1, fontSize: 13 },
  exactValue:   { fontSize: 15, fontWeight: '800' },
  coinRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 6 },
  detailHero:   { borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 16, gap: 10 },
  detailThumb:  { width: '100%', height: 180, borderRadius: 10 },
  detailTitle:  { fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
