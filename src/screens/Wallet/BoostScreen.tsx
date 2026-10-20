import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BackButton, HelpGuideSheet, HelpGuideButton } from '../../components/common';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, StatusBar, ActivityIndicator,
  Animated, Modal, TextInput,
  FlatList, Image, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { toastService, showConfirm } from '../../services';

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'suggest' | 'new' | 'active' | 'history';

export interface BoostSuggestion {
  target: string;
  tier_id: string;
  tier_label: string;
  gogold: number;
  duration_days: number;
  target_quantity: number;
  quantity_label: string;
  reason: string;
  impact_label: string;
  priority: number;
  content_id?: string | null;
  content_type?: string | null;
  content_title?: string | null;
  content_thumbnail?: string | null;
  engagement_rate?: number | null;
  affordable: boolean;
}
type ContentType = 'reel' | 'community' | 'post' | 'event' | 'concert' | 'live';

interface BoostTier {
  id: string;
  label: string;
  quantity: string;
  quantity_num: number;
  duration: string;
  duration_days: number;
  GoGold: number;
  popular?: boolean;
}

interface BoostCategory {
  id: string;
  label: string;
  sublabel: string;
  description: string;
  icon: string;
  gradient: [string, string];
  contentType?: ContentType;
  targetLabel?: string;
  tiers: BoostTier[];
}

interface TargetContent {
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string | null;
  isVideo?: boolean;
}

interface BoostRecord {
  id: string;
  target: string;
  tier_label: string;
  quantity_label: string;
  duration_days: number;
  gogold_spent: number;
  status: 'active' | 'completed' | 'cancelled' | 'paused';
  progress: number;
  delivered_quantity: number;
  target_quantity: number;
  impression_count: number;
  feed_multiplier: number;
  target_content_id?: string | null;
  target_content_type?: string | null;
  target_content_title?: string | null;
  activated_at: string;
  expires_at: string;
  completed_at?: string | null;
}

// ── Catalogue ──────────────────────────────────────────────────────────────
// Ordre identique au web (BoostCatalog.ts)

const BOOST_CATEGORIES: BoostCategory[] = [
  {
    id: 'followers',
    label: 'Abonnes',
    sublabel: 'Compte',
    description: 'Gagnez de nouveaux abonnes et developpez votre audience',
    icon: 'users',
    gradient: ['#7B3FF2', '#E0389A'],
    tiers: [
      { id: 'f1', label: 'Starter', quantity: '+50 abonnes',    quantity_num: 50,   duration: '3 jours',  duration_days: 3,  GoGold: 200 },
      { id: 'f2', label: 'Growth',  quantity: '+150 abonnes',   quantity_num: 150,  duration: '7 jours',  duration_days: 7,  GoGold: 500, popular: true },
      { id: 'f3', label: 'Viral',   quantity: '+500 abonnes',   quantity_num: 500,  duration: '14 jours', duration_days: 14, GoGold: 1500 },
      { id: 'f4', label: 'Mega',    quantity: '+2 000 abonnes', quantity_num: 2000, duration: '30 jours', duration_days: 30, GoGold: 5000 },
    ],
  },
  {
    id: 'profile_views',
    label: 'Vues profil',
    sublabel: 'Compte',
    description: 'Augmentez le nombre de visites sur votre profil',
    icon: 'eye',
    gradient: ['#FF8C00', '#FF4500'],
    tiers: [
      { id: 'p1', label: 'Starter', quantity: '500 vues',    quantity_num: 500,   duration: '2 jours',  duration_days: 2,  GoGold: 150 },
      { id: 'p2', label: 'Growth',  quantity: '2 000 vues',  quantity_num: 2000,  duration: '5 jours',  duration_days: 5,  GoGold: 400, popular: true },
      { id: 'p3', label: 'Viral',   quantity: '10 000 vues', quantity_num: 10000, duration: '10 jours', duration_days: 10, GoGold: 2000 },
      { id: 'p4', label: 'Mega',    quantity: '50 000 vues', quantity_num: 50000, duration: '21 jours', duration_days: 21, GoGold: 10000 },
    ],
  },
  {
    id: 'content_reach',
    label: 'Portee',
    sublabel: 'Contenus',
    description: 'Augmentez la portee de tous vos contenus publies',
    icon: 'trending-up',
    gradient: ['#10B981', '#06B6D4'],
    tiers: [
      { id: 'c1', label: 'Starter', quantity: '1 000 impressions',   quantity_num: 1000,   duration: '3 jours',  duration_days: 3,  GoGold: 250 },
      { id: 'c2', label: 'Growth',  quantity: '5 000 impressions',   quantity_num: 5000,   duration: '7 jours',  duration_days: 7,  GoGold: 1000, popular: true },
      { id: 'c3', label: 'Viral',   quantity: '20 000 impressions',  quantity_num: 20000,  duration: '14 jours', duration_days: 14, GoGold: 4000 },
      { id: 'c4', label: 'Mega',    quantity: '100 000 impressions', quantity_num: 100000, duration: '30 jours', duration_days: 30, GoGold: 20000 },
    ],
  },
  {
    id: 'reel_views',
    label: 'Reels',
    sublabel: 'Vues',
    description: 'Propulsez un Reel specifique avec plus de vues',
    icon: 'play-circle',
    gradient: ['#E0389A', '#FF8C00'],
    contentType: 'reel',
    targetLabel: 'Choisir un Reel',
    tiers: [
      { id: 'r1', label: 'Starter', quantity: '1 000 vues',    quantity_num: 1000,   duration: '2 jours',  duration_days: 2,  GoGold: 200 },
      { id: 'r2', label: 'Growth',  quantity: '5 000 vues',    quantity_num: 5000,   duration: '5 jours',  duration_days: 5,  GoGold: 1000, popular: true },
      { id: 'r3', label: 'Viral',   quantity: '25 000 vues',   quantity_num: 25000,  duration: '10 jours', duration_days: 10, GoGold: 5000 },
      { id: 'r4', label: 'Mega',    quantity: '100 000 vues',  quantity_num: 100000, duration: '20 jours', duration_days: 20, GoGold: 20000 },
    ],
  },
  {
    id: 'post_reach',
    label: 'Posts',
    sublabel: 'Publications',
    description: "Boostez la portee d'une publication specifique",
    icon: 'file-text',
    gradient: ['#06B6D4', '#0EA5E9'],
    contentType: 'post',
    targetLabel: 'Choisir un post',
    tiers: [
      { id: 'po1', label: 'Starter', quantity: '2 000 impressions',   quantity_num: 2000,   duration: '2 jours',  duration_days: 2,  GoGold: 400 },
      { id: 'po2', label: 'Growth',  quantity: '8 000 impressions',   quantity_num: 8000,   duration: '5 jours',  duration_days: 5,  GoGold: 1600, popular: true },
      { id: 'po3', label: 'Viral',   quantity: '30 000 impressions',  quantity_num: 30000,  duration: '10 jours', duration_days: 10, GoGold: 6000 },
      { id: 'po4', label: 'Mega',    quantity: '120 000 impressions', quantity_num: 120000, duration: '21 jours', duration_days: 21, GoGold: 24000 },
    ],
  },
  {
    id: 'event_reach',
    label: 'Evenements',
    sublabel: 'Events',
    description: 'Faites connaitre un evenement a plus de personnes',
    icon: 'calendar',
    gradient: ['#F59E0B', '#EF4444'],
    contentType: 'event',
    targetLabel: 'Choisir un evenement',
    tiers: [
      { id: 'ev1', label: 'Starter', quantity: '500 personnes',    quantity_num: 500,   duration: '2 jours',  duration_days: 2,  GoGold: 300 },
      { id: 'ev2', label: 'Growth',  quantity: '2 000 personnes',  quantity_num: 2000,  duration: '5 jours',  duration_days: 5,  GoGold: 800, popular: true },
      { id: 'ev3', label: 'Viral',   quantity: '8 000 personnes',  quantity_num: 8000,  duration: '10 jours', duration_days: 10, GoGold: 2200 },
      { id: 'ev4', label: 'Mega',    quantity: '30 000 personnes', quantity_num: 30000, duration: '20 jours', duration_days: 20, GoGold: 7000 },
    ],
  },
  {
    id: 'concert_reach',
    label: 'Concerts',
    sublabel: 'Concerts',
    description: 'Remplissez votre concert en touchant plus de fans',
    icon: 'music',
    gradient: ['#EC4899', '#8B5CF6'],
    contentType: 'concert',
    targetLabel: 'Choisir un concert',
    tiers: [
      { id: 'co1', label: 'Starter', quantity: '300 personnes',    quantity_num: 300,   duration: '1 jour',   duration_days: 1,  GoGold: 400 },
      { id: 'co2', label: 'Growth',  quantity: '1 500 personnes',  quantity_num: 1500,  duration: '3 jours',  duration_days: 3,  GoGold: 1000, popular: true },
      { id: 'co3', label: 'Viral',   quantity: '5 000 personnes',  quantity_num: 5000,  duration: '7 jours',  duration_days: 7,  GoGold: 2800 },
      { id: 'co4', label: 'Mega',    quantity: '20 000 personnes', quantity_num: 20000, duration: '14 jours', duration_days: 14, GoGold: 8000 },
    ],
  },
  {
    id: 'live_viewers',
    label: 'Live',
    sublabel: 'Viewers',
    description: 'Boostez votre audience en direct pendant un live',
    icon: 'radio',
    gradient: ['#EF4444', '#F97316'],
    contentType: 'live',
    targetLabel: 'Choisir un concert live',
    tiers: [
      { id: 'lv1', label: 'Starter', quantity: '100 viewers',   quantity_num: 100,  duration: '1 jour',  duration_days: 1, GoGold: 300 },
      { id: 'lv2', label: 'Growth',  quantity: '500 viewers',   quantity_num: 500,  duration: '2 jours', duration_days: 2, GoGold: 800, popular: true },
      { id: 'lv3', label: 'Viral',   quantity: '2 000 viewers', quantity_num: 2000, duration: '3 jours', duration_days: 3, GoGold: 2000 },
      { id: 'lv4', label: 'Mega',    quantity: '8 000 viewers', quantity_num: 8000, duration: '7 jours', duration_days: 7, GoGold: 6000 },
    ],
  },
];

// ── Custom boost config — identique au web ─────────────────────────────────

const CUSTOM_RATES: Record<string, number> = {
  followers: 0.48, profile_views: 0.0095, content_reach: 0.0067,
  reel_views: 0.01, post_reach: 0.0095, event_reach: 0.18,
  concert_reach: 0.25, live_viewers: 0.35,
};

const CUSTOM_UNITS: Record<string, string> = {
  followers: 'abonnes', profile_views: 'vues', content_reach: 'impressions',
  reel_views: 'vues', post_reach: 'impressions',
  event_reach: 'personnes', concert_reach: 'personnes', live_viewers: 'viewers',
};

const CUSTOM_REACH_CONFIG: Record<string, { min: number; max: number; step: number; presets: number[] }> = {
  followers:     { min: 10,  max: 10000,  step: 10,  presets: [50, 200, 500, 2000, 5000] },
  profile_views: { min: 100, max: 200000, step: 100, presets: [500, 2000, 10000, 50000] },
  content_reach: { min: 500, max: 500000, step: 500, presets: [1000, 5000, 20000, 100000] },
  reel_views:    { min: 100, max: 200000, step: 100, presets: [1000, 5000, 25000, 100000] },
  post_reach:    { min: 500, max: 200000, step: 500, presets: [2000, 8000, 30000, 120000] },
  event_reach:   { min: 100, max: 50000,  step: 100, presets: [500, 2000, 8000, 30000] },
  concert_reach: { min: 50,  max: 30000,  step: 50,  presets: [300, 1500, 5000, 20000] },
  live_viewers:  { min: 10,  max: 10000,  step: 10,  presets: [100, 500, 2000, 8000] },
};

function computeCustomGoGold(catId: string, reach: number, days: number): number {
  const rate = CUSTOM_RATES[catId] ?? 0.02;
  return Math.max(50, Math.round(rate * reach * days));
}

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString('fr-FR');
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

// ── ContentPicker helpers — identiques au web ──────────────────────────────

function buildUrl(contentType: ContentType, userId: string, q?: string): string {
  const qs = q ? `&q=${encodeURIComponent(q)}` : '';
  const limit = q ? 20 : 30;
  switch (contentType) {
    case 'reel':      return `/api/v1/reels/user/${userId}?limit=${limit}${qs}`;
    case 'community': return `/api/v1/communities/me?limit=${limit}${qs}`;
    case 'post':      return `/api/v1/posts/user/${userId}?limit=${limit}${qs}`;
    case 'event':     return `/api/v1/events/me?limit=${limit}${qs}`;
    case 'concert':   return `/api/v1/concerts/me?limit=${limit}${qs}`;
    case 'live':      return `/api/v1/concerts/me?status=live&limit=${limit}${qs}`;
  }
}

function normalizeItem(item: any, contentType: ContentType): TargetContent {
  switch (contentType) {
    case 'reel':
      return {
        id: item.id,
        title: item.caption ?? item.title ?? 'Reel sans titre',
        subtitle: item.view_count != null ? `${Number(item.view_count).toLocaleString('fr-FR')} vues` : undefined,
        thumbnail: item.thumbnail_url ?? null,
        isVideo: true,
      };
    case 'community':
      return {
        id: item.id,
        title: item.name ?? 'Communaute',
        subtitle: item.members_count != null ? `${Number(item.members_count).toLocaleString('fr-FR')} membres` : undefined,
        thumbnail: item.avatar_url ?? item.cover_url ?? null,
      };
    case 'post':
      return {
        id: item.id,
        title: (item.body ?? item.content ?? '').slice(0, 70) || 'Post',
        subtitle: item.like_count != null ? `${item.like_count} likes` : undefined,
        thumbnail: item.image_url ?? item.image_urls?.[0] ?? null,
      };
    case 'event':
      return {
        id: item.id,
        title: item.title ?? item.name ?? 'Evenement',
        subtitle: item.starts_at
          ? new Date(item.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
          : item.venue_city,
        thumbnail: item.thumbnail_url ?? item.banner_url ?? null,
      };
    case 'concert':
    case 'live':
      return {
        id: item.id,
        title: item.title ?? 'Concert',
        subtitle: item.scheduled_at
          ? new Date(item.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
          : item.venue_city,
        thumbnail: item.thumbnail_url ?? item.banner_url ?? null,
      };
  }
}

function extractList(data: any): any[] {
  if (Array.isArray(data)) return data;
  for (const key of ['items', 'results', 'reels', 'posts', 'events', 'concerts', 'communities']) {
    if (Array.isArray((data as any)?.[key])) return (data as any)[key];
  }
  return [];
}

// ── STATUS BADGE ───────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: BoostRecord['status']; colors: any }> = ({ status, colors }) => {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    active:    { label: 'Actif',    bg: '#22C55E20', text: '#22C55E' },
    completed: { label: 'Termine',  bg: '#6B728020', text: '#6B7280' },
    cancelled: { label: 'Annule',   bg: '#EF444420', text: '#EF4444' },
    paused:    { label: 'En pause', bg: '#F59E0B20', text: '#F59E0B' },
  };
  const c = config[status] ?? { label: status, bg: colors.surface, text: colors.textSecondary };
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
      <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: c.text }}>{c.label}</Text>
    </View>
  );
};

// ── ACTIVE BOOST CARD ──────────────────────────────────────────────────────

const ActiveBoostCard: React.FC<{
  boost: BoostRecord;
  colors: any;
  onCancelled: (id: string, refund: number, newBalance: number) => void;
}> = ({ boost, colors, onCancelled }) => {
  const insets = useSafeAreaInsets();
  const [showStop, setShowStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const cat = BOOST_CATEGORIES.find(c => c.id === boost.target) ?? BOOST_CATEGORIES[0];
  const [g1, g2] = cat.gradient;

  const isGlobal = !boost.target_content_id;

  // Guard NaN : si les dates sont invalides on tombe sur des valeurs sûres
  const activatedMs = boost.activated_at ? new Date(boost.activated_at).getTime() : Date.now();
  const expiresMs   = boost.expires_at   ? new Date(boost.expires_at).getTime()   : Date.now();
  const isValidDates = !isNaN(activatedMs) && !isNaN(expiresMs);

  const totalSec   = isValidDates ? Math.max(1, (expiresMs - activatedMs) / 1000) : 1;
  const elapsedSec = isValidDates ? Math.max(0, (Date.now() - activatedMs) / 1000) : 0;
  const timePct    = Math.min(1, elapsedSec / totalSec);
  const serverPct  = Math.min(1, Math.max(0, isNaN(Number(boost.progress)) ? 0 : Number(boost.progress)));
  const pct        = isNaN(isGlobal ? Math.max(serverPct, timePct) : serverPct)
    ? 0
    : (isGlobal ? Math.max(serverPct, timePct) : serverPct);
  const pctRounded = Math.round(pct * 100);

  const dl        = daysLeft(boost.expires_at);
  const total     = boost.target_quantity ?? 0;
  const delivered = isGlobal && total > 0
    ? Math.round(pct * total)
    : ((boost.impression_count ?? 0) > 0 ? boost.impression_count : boost.delivered_quantity);
  const mult      = isNaN(Number(boost.feed_multiplier)) ? 1 : Number(boost.feed_multiplier ?? 1);
  const canCancel = isValidDates && elapsedSec / 60 < 30;
  const hoursLeft = isValidDates ? Math.max(0, Math.ceil((expiresMs - Date.now()) / 3600000)) : 0;

  useEffect(() => {
    Animated.timing(progressAnim, { toValue: pct, duration: 800, useNativeDriver: false }).start();
  }, [pct, progressAnim]);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  async function handleStop() {
    setStopping(true);
    try {
      const res = await apiClient.delete<{ message: string; refund_gogold: number; new_balance: number }>(
        Endpoints.wallet.boostCancel(boost.id)
      );
      setShowStop(false);
      onCancelled(boost.id, res.data.refund_gogold, res.data.new_balance);
    } catch (e: any) {
      toastService.error('Erreur', e?.response?.data?.detail ?? "Echec de l'annulation.");
    } finally { setStopping(false); }
  }

  return (
    <>
      <View style={[abc.card, { backgroundColor: colors.surface, borderColor: g1 + '35' }]}>
        {/* Barre accent top */}
        <LinearGradient colors={[g1, g2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={abc.topBar} />

        <View style={{ padding: 14, gap: 12 }}>
          {/* Header : icône + titre + badge statut */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <LinearGradient colors={[g1, g2]} style={abc.iconBox}>
              <Icon name={cat.icon as any} size={20} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold }} numberOfLines={1}>
                {boost.tier_label}
              </Text>
              {boost.target_content_title ? (
                <Text style={{ color: g1, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, marginTop: 1 }} numberOfLines={1}>
                  {boost.target_content_title}
                </Text>
              ) : (
                <Text style={{ color: colors.textTertiary, fontSize: FontSize.sm }}>{cat.label}</Text>
              )}
            </View>
            <StatusBadge status={boost.status} colors={colors} />
          </View>

          {/* Progression — grande barre + % central */}
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold }}>
                PROGRESSION
              </Text>
              <Text style={{ color: g1, fontSize: FontSize.md, fontWeight: FontWeight.black }}>{pctRounded}%</Text>
            </View>
            {/* Barre haute + gradient */}
            <View style={{ height: 10, backgroundColor: colors.backgroundSecondary, borderRadius: 5, overflow: 'hidden' }}>
              <Animated.View style={[{ height: 10, borderRadius: 5 }, { width: progressWidth }]}>
                <LinearGradient colors={[g1, g2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }} />
              </Animated.View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus }}>
                {total > 0 ? `${fmtNum(delivered)} / ${fmtNum(total)} livrés` : 'En cours…'}
              </Text>
              {boost.status === 'active' && (
                <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus }}>
                  {hoursLeft > 24 ? `${dl}j restants` : `${hoursLeft}h restantes`}
                </Text>
              )}
            </View>
          </View>

          {/* Stats 4 cases */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { icon: 'trending-up', label: 'Multiplicateur', val: mult > 1 ? `×${mult.toFixed(1)}` : '×1.0', color: g1 },
              { icon: 'eye',         label: 'Impressions',    val: fmtNum(boost.impression_count ?? 0), color: '#3B82F6' },
              { icon: 'zap',         label: 'GoGold',          val: fmtNum(boost.gogold_spent), color: '#F59E0B' },
              { icon: 'clock',       label: boost.status === 'active' ? 'Expire' : 'Durée',
                val: boost.status === 'active'
                  ? new Date(boost.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                  : `${boost.duration_days}j`,
                color: '#10B981' },
            ].map(st => (
              <View key={st.label} style={{ flex: 1, backgroundColor: st.color + '10',
                borderRadius: 10, padding: 8, alignItems: 'center', gap: 3 }}>
                <Icon name={st.icon} size={13} color={st.color} />
                <Text style={{ color: st.color, fontSize: FontSize.smPlus, fontWeight: FontWeight.black }}>{st.val}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: FontSize['2xs'] }}>{st.label}</Text>
              </View>
            ))}
          </View>

          {/* Bouton arrêter */}
          {boost.status === 'active' && (
            canCancel ? (
              <TouchableOpacity onPress={() => setShowStop(true)} activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: '#EF444412', borderWidth: 1, borderColor: '#EF444430' }}>
                <Icon name="square" size={13} color="#EF4444" />
                <Text style={{ color: '#EF4444', fontWeight: FontWeight.bold, fontSize: FontSize.smPlus }}>Arrêter le boost</Text>
                <Text style={{ color: '#EF444480', fontSize: FontSize.xsPlus }}>
                  (+{Math.round(boost.gogold_spent * 0.9).toLocaleString('fr-FR')} GoGold remboursés)
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, paddingVertical: 10, borderRadius: 12,
                backgroundColor: colors.backgroundSecondary, opacity: 0.5 }}>
                <Icon name="lock" size={13} color={colors.textTertiary} />
                <Text style={{ color: colors.textTertiary, fontSize: FontSize.sm }}>Annulation impossible après 30 min</Text>
              </View>
            )
          )}
        </View>
      </View>

      <Modal visible={showStop} transparent animationType="slide" onRequestClose={() => setShowStop(false)}>
        <View style={ms.overlay}>
          <View style={[ms.sheet, { backgroundColor: colors.surface, paddingBottom: 44 + insets.bottom }]}>
            <View style={[ms.handle, { backgroundColor: colors.border }]} />
            <Text style={[ms.title, { color: colors.textPrimary }]}>Arrêter le boost ?</Text>
            <Text style={[ms.sub, { color: colors.textSecondary }]}>
              Annulation dans les 30 premières minutes. 90% des GoGold vous sont remboursés.
            </Text>
            <View style={[ms.refundBox, { backgroundColor: '#22C55E15', borderColor: '#22C55E30' }]}>
              <Icon name="gift" size={18} color="#22C55E" />
              <Text style={[ms.refundText, { color: '#22C55E' }]}>
                +{Math.round(boost.gogold_spent * 0.9).toLocaleString('fr-FR')} GoGold remboursés
              </Text>
            </View>
            <TouchableOpacity onPress={handleStop} disabled={stopping} activeOpacity={0.85}
              style={[ms.stopConfirm, { opacity: stopping ? 0.6 : 1 }]}>
              {stopping
                ? <ActivityIndicator color="#fff" />
                : <Text style={ms.stopConfirmText}>Confirmer l'arrêt</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowStop(false)} style={ms.cancelBtn}>
              <Text style={[ms.cancelText, { color: colors.textSecondary }]}>Garder le boost</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

// ── CONTENT PICKER ─────────────────────────────────────────────────────────

const ContentPicker: React.FC<{
  contentType: ContentType;
  targetLabel: string;
  g1: string;
  selected: TargetContent | null;
  onSelect: (c: TargetContent | null) => void;
  colors: any;
  userId: string;
}> = ({ contentType, targetLabel, g1, selected, onSelect, colors, userId }) => {
  const insets = useSafeAreaInsets();
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<TargetContent[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchItems(q?: string) {
    if (!userId) return;
    setLoading(true);
    apiClient.get<any>(buildUrl(contentType, userId, q || undefined))
      .then(r => setResults(extractList(r.data).map(i => normalizeItem(i, contentType))))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open) return;
    fetchItems();
  }, [open, contentType, userId]);

  function onQueryChange(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { fetchItems(); return; }
    debounceRef.current = setTimeout(() => fetchItems(q), 300);
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        style={[cp.trigger, { backgroundColor: colors.surface, borderColor: selected ? g1 + '80' : colors.border }]}
      >
        {selected ? (
          <>
            <Icon name="check-circle" size={15} color={g1} />
            <View style={{ flex: 1 }}>
              <Text style={[cp.triggerText, { color: g1 }]} numberOfLines={1}>{selected.title}</Text>
              {selected.subtitle ? (
                <Text style={{ fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 1 }}>{selected.subtitle}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => onSelect(null)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Icon name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Icon name="search" size={15} color={colors.textTertiary} />
            <Text style={[cp.triggerText, { color: colors.textTertiary, flex: 1 }]}>{targetLabel}</Text>
            <Icon name="chevron-right" size={14} color={colors.textTertiary} />
          </>
        )}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[cp.modal, { backgroundColor: colors.background }]}>
          <View style={[cp.header, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
            <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 4 }}>
              <Icon name="arrow-left" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TextInput
              style={[cp.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Rechercher un contenu..."
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={onQueryChange}
              autoFocus
            />
            {loading && <ActivityIndicator size="small" color={g1} />}
          </View>
          {loading && results.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={g1} />
          ) : (
            <FlatList
              data={results}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item); setOpen(false); setQuery(''); }}
                  activeOpacity={0.8}
                  style={[cp.resultRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  {/* Thumbnail with Play overlay for videos */}
                  <View style={cp.thumbWrap}>
                    {item.thumbnail ? (
                      <Image source={{ uri: item.thumbnail }} style={cp.thumb} />
                    ) : (
                      <View style={[cp.thumb, { backgroundColor: g1 + '20', alignItems: 'center', justifyContent: 'center' }]}>
                        <Icon name="image" size={16} color={g1} />
                      </View>
                    )}
                    {item.isVideo && (
                      <View style={cp.playOverlay}>
                        <Icon name="play" size={10} color="#fff" />
                      </View>
                    )}
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[cp.resultText, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
                    {item.subtitle ? (
                      <Text style={{ fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2 }}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  <Icon name="chevron-right" size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !loading ? (
                  <Text style={{ textAlign: 'center', color: colors.textTertiary, marginTop: 40, fontSize: FontSize.base }}>
                    Aucun contenu trouve
                  </Text>
                ) : null
              }
            />
          )}
        </View>
      </Modal>
    </>
  );
};

// ── IMPACT ICON MAP ────────────────────────────────────────────────────────

const IMPACT_ICONS: Record<string, string> = {
  'Fort potentiel viral':  'trending-up',
  'Lancement de contenu':  'play-circle',
  'Augmenter la portée':   'bar-chart-2',
  "Croissance d'audience": 'users',
  'Remplir l\'event':      'calendar',
  'Remplir la salle':      'music',
  'Amplifier un post':     'file-text',
  'Visibilité du profil':  'eye',
};

// ── SUGGESTION CARD ────────────────────────────────────────────────────────

const SuggestionCard: React.FC<{
  suggestion: BoostSuggestion;
  balance: number;
  colors: any;
  onBoost: (s: BoostSuggestion) => void;
}> = ({ suggestion, balance, colors, onBoost }) => {
  const cat = BOOST_CATEGORIES.find(c => c.id === suggestion.target);
  const [g1, g2] = cat?.gradient ?? ['#7B3FF2', '#E0389A'];
  const icon = IMPACT_ICONS[suggestion.impact_label] ?? cat?.icon ?? 'zap';
  const canAfford = suggestion.affordable && balance >= suggestion.gogold;

  return (
    <View style={[sc.card, { backgroundColor: colors.surface, borderColor: g1 + '30' }]}>
      <LinearGradient colors={[g1, g2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.topBar} />

      <View style={sc.body}>
        {/* Icon + impact label */}
        <LinearGradient colors={[g1, g2]} style={sc.iconBox}>
          <Icon name={icon as any} size={18} color="#fff" />
        </LinearGradient>

        <View style={{ flex: 1 }}>
          <View style={sc.topRow}>
            <Text style={[sc.impactLabel, { color: g1 }]}>{suggestion.impact_label}</Text>
            <View style={[sc.priorityBadge, { backgroundColor: suggestion.priority === 1 ? '#EF444415' : g1 + '15' }]}>
              <Text style={[sc.priorityText, { color: suggestion.priority === 1 ? '#EF4444' : g1 }]}>
                {suggestion.priority === 1 ? 'Urgent' : suggestion.tier_label}
              </Text>
            </View>
          </View>

          {/* Contenu cible */}
          {suggestion.content_title ? (
            <Text style={[sc.contentTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {suggestion.content_title}
            </Text>
          ) : null}

          {/* Raison personnalisée */}
          <Text style={[sc.reason, { color: colors.textSecondary }]}>{suggestion.reason}</Text>

          {/* Stats engagement si dispo */}
          {suggestion.engagement_rate != null && suggestion.engagement_rate > 0 ? (
            <View style={[sc.engBadge, { backgroundColor: '#22C55E15', borderColor: '#22C55E30' }]}>
              <Icon name="activity" size={10} color="#22C55E" />
              <Text style={sc.engText}>{(suggestion.engagement_rate * 100).toFixed(1)}% d'engagement</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Footer: quantité + bouton */}
      <View style={[sc.footer, { borderTopColor: colors.divider ?? colors.border }]}>
        <View>
          <Text style={[sc.qty, { color: colors.textPrimary }]}>{suggestion.quantity_label}</Text>
          <Text style={[sc.dur, { color: colors.textTertiary }]}>{suggestion.duration_days} jour{suggestion.duration_days > 1 ? 's' : ''}</Text>
        </View>

        <TouchableOpacity
          onPress={() => onBoost(suggestion)}
          activeOpacity={0.85}
          style={[sc.boostBtnWrap, { opacity: canAfford ? 1 : 0.55 }]}
        >
          <LinearGradient colors={canAfford ? [g1, g2] : ['#888', '#666']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.boostBtn}>
            <Icon name="zap" size={12} color="#fff" />
            <Text style={sc.boostBtnText}>
              {canAfford ? `${suggestion.gogold.toLocaleString('fr-FR')} GoGold` : 'Solde insuffisant'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── BOOST SCREEN ───────────────────────────────────────────────────────────

export default function BoostScreen() {
  const { theme: { colors }, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  // Ouverture directe sur une suggestion précise — depuis le bottom sheet
  // "Booster" du feed d'accueil, qui pointe vers le même systeme que l'onglet
  // "Pour toi" plutôt que de dupliquer sa logique de sélection/tiers.
  const autoSuggestion: BoostSuggestion | null = route.params?.autoSuggestion ?? null;
  const consumedAutoSuggestionRef = useRef(false);
  const [showHelp, setShowHelp] = useState(false);
  const { currentUser } = useUser();
  const userId = currentUser?.id ?? '';

  const [tab,           setTab]           = useState<Tab>('suggest');
  const [balance,       setBalance]       = useState(0);
  const [suggestions,      setSuggestions]      = useState<BoostSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [catIdx,        setCatIdx]        = useState(0);
  const [selectedTier,  setSelectedTier]  = useState<BoostTier | null>(null);
  const [targetContent, setTargetContent] = useState<TargetContent | null>(null);
  const [customMode,    setCustomMode]    = useState(false);
  const [customReach,   setCustomReach]   = useState(1000);
  const [customDays,    setCustomDays]    = useState(7);
  const [showModal,     setShowModal]     = useState(false);
  const [purchasing,    setPurchasing]    = useState(false);
  const [activeBoosts,  setActiveBoosts]  = useState<BoostRecord[]>([]);
  const [historyBoosts, setHistoryBoosts] = useState<BoostRecord[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [loadingHistory,setLoadingHistory]= useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [refreshingActive, setRefreshingActive] = useState(false);
  const successAnim = useRef(new Animated.Value(0)).current;
  const activeRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cat = BOOST_CATEGORIES[catIdx];
  const [g1, g2] = cat.gradient;
  const reachCfg = CUSTOM_REACH_CONFIG[cat.id] ?? { min: 100, max: 100000, step: 100, presets: [500, 1000, 5000, 10000] };
  const customUnit = CUSTOM_UNITS[cat.id] ?? 'impressions';
  const customGoGold = computeCustomGoGold(cat.id, customReach, customDays);

  useEffect(() => {
    apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance)
      .then(r => setBalance(r.data?.gogold_balance ?? 0))
      .catch(() => {});
    apiClient.get<BoostRecord[]>(Endpoints.wallet.boostsActive)
      .then(r => setActiveBoosts(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoadingActive(false));
    apiClient.get<{ suggestions: BoostSuggestion[]; wallet_balance: number }>(Endpoints.wallet.boostSuggestions)
      .then(r => {
        setSuggestions(r.data?.suggestions ?? []);
        if (r.data?.wallet_balance != null) setBalance(r.data.wallet_balance);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, []);

  useEffect(() => {
    if (tab !== 'history' || historyLoaded) return;
    setLoadingHistory(true);
    apiClient.get<BoostRecord[]>(`${Endpoints.wallet.boostsHistory}?limit=50`)
      .then(r => setHistoryBoosts(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => { setLoadingHistory(false); setHistoryLoaded(true); });
  }, [tab, historyLoaded]);

  const refreshActiveBoosts = useCallback(async (silent = false) => {
    if (!silent) setRefreshingActive(true);
    try {
      const [boostsRes, balanceRes] = await Promise.allSettled([
        apiClient.get<BoostRecord[]>(Endpoints.wallet.boostsActive),
        apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance),
      ]);
      if (boostsRes.status === 'fulfilled')
        setActiveBoosts(Array.isArray(boostsRes.value.data) ? boostsRes.value.data : []);
      if (balanceRes.status === 'fulfilled')
        setBalance(balanceRes.value.data?.gogold_balance ?? 0);
    } catch {}
    finally { if (!silent) setRefreshingActive(false); }
  }, []);

  // Refresh immédiat + auto-refresh toutes les 10s quand l'onglet actifs est ouvert
  useEffect(() => {
    if (tab !== 'active') {
      if (activeRefreshTimer.current) clearInterval(activeRefreshTimer.current);
      return;
    }
    refreshActiveBoosts(true);
    activeRefreshTimer.current = setInterval(() => refreshActiveBoosts(true), 10000);
    return () => {
      if (activeRefreshTimer.current) clearInterval(activeRefreshTimer.current);
    };
  }, [tab, refreshActiveBoosts]);

  function handleBoostFromSuggestion(s: BoostSuggestion) {
    if (!s.affordable || balance < s.gogold) {
      showConfirm('Solde insuffisant', `Il te manque ${(s.gogold - balance).toLocaleString('fr-FR')} GoGold.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Acheter des GoGold', onPress: () => navigation.navigate('BuyGoGold') },
      ]);
      return;
    }
    // Pré-remplir le formulaire
    const catI = BOOST_CATEGORIES.findIndex(c => c.id === s.target);
    if (catI >= 0) {
      setCatIdx(catI);
      const tier = BOOST_CATEGORIES[catI].tiers.find(t => t.id === s.tier_id) ?? null;
      if (tier) {
        if (s.content_id && s.content_type && s.content_title) {
          setTargetContent({ id: s.content_id, title: s.content_title });
        }
        setSelectedTier(tier);
        setShowModal(true);
        setTab('new');
      }
    }
  }

  // Arrivée depuis le bottom sheet du feed — saute direct au modal d'achat sur
  // la suggestion déjà choisie là-bas, sans repasser par l'onglet "Pour toi".
  useEffect(() => {
    if (!autoSuggestion || consumedAutoSuggestionRef.current || loadingSuggestions) return;
    consumedAutoSuggestionRef.current = true;
    handleBoostFromSuggestion(autoSuggestion);
  }, [autoSuggestion, loadingSuggestions, balance]);

  function selectCat(i: number) {
    setCatIdx(i);
    setSelectedTier(null);
    setTargetContent(null);
    setCustomMode(false);
    const cfg = CUSTOM_REACH_CONFIG[BOOST_CATEGORIES[i].id];
    if (cfg) setCustomReach(cfg.presets[1] ?? cfg.presets[0]);
  }

  function handleSelectTier(tier: BoostTier) {
    if (cat.contentType && !targetContent?.id) {
      toastService.warning('Contenu requis', `Selectionnez d'abord un ${cat.contentType} a booster.`);
      return;
    }
    if (balance < tier.GoGold) {
      showConfirm('Solde insuffisant', `Il te manque ${(tier.GoGold - balance).toLocaleString('fr-FR')} GoGold.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Acheter des GoGold', onPress: () => navigation.navigate('BuyGoGold') },
      ]);
      return;
    }
    setSelectedTier(tier);
    setShowModal(true);
  }

  function handleSelectCustom() {
    if (cat.contentType && !targetContent?.id) {
      toastService.warning('Contenu requis', `Selectionnez d'abord un ${cat.contentType}.`);
      return;
    }
    if (balance < customGoGold) {
      toastService.warning('Solde insuffisant', `Il te manque ${(customGoGold - balance).toLocaleString('fr-FR')} GoGold.`);
      return;
    }
    setSelectedTier({
      id: 'custom', label: 'Custom',
      quantity: `${fmtNum(customReach)} ${customUnit}`, quantity_num: customReach,
      duration: `${customDays} jour${customDays > 1 ? 's' : ''}`, duration_days: customDays,
      GoGold: customGoGold,
    });
    setShowModal(true);
  }

  async function confirmBoost() {
    if (!selectedTier) return;
    setPurchasing(true);
    try {
      const payload: Record<string, any> = {
        boost_option_id: cat.id,
        tier_id: selectedTier.id,
        gogold_amount: selectedTier.GoGold,
      };
      if (selectedTier.id === 'custom') {
        payload.custom_reach    = customReach;
        payload.custom_duration = customDays;
      }
      if (targetContent?.id) {
        payload.target_content_id    = targetContent.id;
        payload.target_content_title = targetContent.title;
        if (cat.contentType) payload.target_content_type = cat.contentType;
      }
      const res = await apiClient.post<{ boost: BoostRecord; new_balance: number }>(
        Endpoints.wallet.boostsPurchase, payload
      );
      setBalance(res.data?.new_balance ?? (balance - selectedTier.GoGold));
      if (res.data?.boost) setActiveBoosts(prev => [res.data.boost, ...prev]);
      setShowModal(false);
      setSelectedTier(null);
      setTargetContent(null);

      Animated.sequence([
        Animated.timing(successAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setTab('active'));
    } catch (e: any) {
      toastService.error('Erreur', e?.response?.data?.detail ?? 'Boost non disponible pour le moment.');
    } finally {
      setPurchasing(false);
    }
  }

  const successScale = successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header — carte flottante (paddingTop isolé sur un wrapper externe transparent) */}
      <View style={{ paddingTop: insets.top + 16 }}>
        <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Booster</Text>
            <Text style={[s.headerSub, { color: colors.textTertiary }]}>Abonnes · Reels · Posts · Events · Live</Text>
          </View>
          <HelpGuideButton onPress={() => setShowHelp(true)} />
          <TouchableOpacity onPress={() => navigation.navigate('BuyGoGold')} style={[s.balancePill, { backgroundColor: colors.backgroundSecondary }]}>
            <Icon name="zap" size={12} color="#FFD700" />
            <Text style={s.balanceText}>{balance.toLocaleString('fr-FR')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={[s.tabsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {([
          { key: 'suggest', label: 'Pour toi',   badge: suggestions.length },
          { key: 'new',     label: 'Nouveau',    badge: 0 },
          { key: 'active',  label: 'Actifs',     badge: activeBoosts.length },
          { key: 'history', label: 'Historique', badge: 0 },
        ] as const).map(({ key, label, badge }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            style={[s.tab, tab === key && { borderBottomWidth: 2, borderBottomColor: '#7B3FF2' }]}
          >
            <Text style={[s.tabText, { color: tab === key ? '#7B3FF2' : colors.textTertiary }]}>{label}</Text>
            {badge > 0 && (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeText}>{badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── TAB: Suggestions ────────────────────────────────────────────── */}
      {tab === 'suggest' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {/* Intro */}
          <View style={[sc.introBox, { backgroundColor: '#7B3FF215', borderColor: '#7B3FF230' }]}>
            <Icon name="cpu" size={18} color="#7B3FF2" />
            <Text style={[sc.introText, { color: colors.textSecondary }]}>
              On a analyse ton compte et on a trouve des opportunites pour toi. Booste ce qui marche deja et passe au niveau superieur !
            </Text>
          </View>

          {loadingSuggestions ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#7B3FF2" />
          ) : suggestions.length === 0 ? (
            <View style={s.emptyState}>
              <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.emptyIcon}>
                <Icon name="star" size={28} color="#fff" />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucune suggestion pour l'instant</Text>
              <Text style={[s.emptySub, { color: colors.textTertiary }]}>
                Publie des reels ou des events pour obtenir des recommandations personnalisees.
              </Text>
              <TouchableOpacity onPress={() => setTab('new')} style={[s.emptyBtn, { backgroundColor: '#7B3FF2' }]}>
                <Text style={{ color: '#fff', fontWeight: FontWeight.extraBold, fontSize: FontSize.base }}>Explorer les boosts</Text>
              </TouchableOpacity>
            </View>
          ) : (
            suggestions.map((sug, i) => (
              <SuggestionCard
                key={`${sug.target}-${i}`}
                suggestion={sug}
                balance={balance}
                colors={colors}
                onBoost={handleBoostFromSuggestion}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* ── TAB: Nouveau boost ───────────────────────────────────────────── */}
      {tab === 'new' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

          {/* Selecteur categorie */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Type de boost</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {BOOST_CATEGORIES.map((c, i) => {
              const isActive = i === catIdx;
              const [og1, og2] = c.gradient;
              return isActive ? (
                <TouchableOpacity key={c.id} onPress={() => selectCat(i)} activeOpacity={0.85}>
                  <LinearGradient colors={[og1, og2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.catActive}>
                    <Icon name={c.icon as any} size={13} color="#fff" />
                    <Text style={s.catActiveText}>{c.label}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => selectCat(i)}
                  activeOpacity={0.85}
                  style={[s.catInactive, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Icon name={c.icon as any} size={13} color={colors.textSecondary} />
                  <Text style={[s.catInactiveText, { color: colors.textSecondary }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Description categorie */}
          <View style={[s.descBox, { backgroundColor: g1 + '12', borderColor: g1 + '30' }]}>
            <LinearGradient colors={[g1, g2]} style={s.descIcon}>
              <Icon name={cat.icon as any} size={18} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[s.descTitle, { color: colors.textPrimary }]}>{cat.label}</Text>
              <Text style={[s.descSublabel, { color: g1 }]}>{cat.sublabel}</Text>
              <Text style={[s.descText, { color: colors.textSecondary }]}>{cat.description}</Text>
            </View>
          </View>

          {/* Content Picker si necessaire */}
          {cat.contentType ? (
            <View>
              <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Contenu a booster</Text>
              <ContentPicker
                contentType={cat.contentType}
                targetLabel={cat.targetLabel ?? 'Choisir un contenu'}
                g1={g1}
                selected={targetContent}
                onSelect={c => setTargetContent(c)}
                colors={colors}
                userId={userId}
              />
              {!targetContent && (
                <Text style={[s.warning, { color: '#F59E0B' }]}>
                  Selectionnez un contenu avant de choisir un pack
                </Text>
              )}
            </View>
          ) : null}

          {/* Toggle packs / custom */}
          <View style={[s.modeSwitch, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              onPress={() => { setCustomMode(false); setSelectedTier(null); }}
              style={[s.modeSwitchBtn, !customMode && { backgroundColor: colors.background }]}
            >
              <Text style={[s.modeSwitchText, { color: !customMode ? g1 : colors.textTertiary }]}>Packs</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setCustomMode(true); setSelectedTier(null); }}
              style={[s.modeSwitchBtn, customMode && { backgroundColor: colors.background }]}
            >
              <Icon name="sliders" size={12} color={customMode ? g1 : colors.textTertiary} />
              <Text style={[s.modeSwitchText, { color: customMode ? g1 : colors.textTertiary }]}>Personnaliser</Text>
            </TouchableOpacity>
          </View>

          {/* Grille des tiers */}
          {!customMode ? (
            <View style={s.tiersGrid}>
              {cat.tiers.map(tier => {
                const afford = balance >= tier.GoGold;
                const locked = !!cat.contentType && !targetContent?.id;
                const isSel  = selectedTier?.id === tier.id;
                return (
                  <TouchableOpacity
                    key={tier.id}
                    onPress={() => handleSelectTier(tier)}
                    disabled={!afford || locked}
                    activeOpacity={0.85}
                    style={{ width: '48%', opacity: !afford || locked ? 0.45 : 1 }}
                  >
                    {isSel ? (
                      <LinearGradient colors={[g1, g2]} style={[s.tierCard, s.tierSelected]}>
                        {tier.popular && <View style={s.popularBadge}><Text style={s.popularText}>POPULAIRE</Text></View>}
                        <Text style={[s.tierLabel, { color: 'rgba(255,255,255,0.8)' }]}>{tier.label}</Text>
                        <Text style={[s.tierQty, { color: '#fff' }]}>{tier.quantity}</Text>
                        <Text style={[s.tierDur, { color: 'rgba(255,255,255,0.7)' }]}>{tier.duration}</Text>
                        <Text style={[s.tierGoGold, { color: '#fff' }]}>{tier.GoGold.toLocaleString('fr-FR')} GoGold</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[s.tierCard, { backgroundColor: colors.surface, borderColor: tier.popular ? g1 : colors.border }]}>
                        {tier.popular && <View style={[s.popularBadge, { backgroundColor: g1 }]}><Text style={s.popularText}>POPULAIRE</Text></View>}
                        <Text style={[s.tierLabel, { color: colors.textSecondary }]}>{tier.label}</Text>
                        <Text style={[s.tierQty, { color: colors.textPrimary }]}>{tier.quantity}</Text>
                        <Text style={[s.tierDur, { color: colors.textTertiary }]}>{tier.duration}</Text>
                        <Text style={[s.tierGoGold, { color: g1 }]}>{tier.GoGold.toLocaleString('fr-FR')} GoGold</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            /* Panel personnalise — config par categorie */
            <View style={[s.customPanel, { backgroundColor: colors.surface, borderColor: g1 + '25' }]}>
              <View>
                <View style={s.customLabelRow}>
                  <Text style={[s.customLabel, { color: colors.textSecondary }]}>Portee souhaitee</Text>
                  <Text style={[s.customValue, { color: g1 }]}>{fmtNum(customReach)} {customUnit}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
                  {reachCfg.presets.map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setCustomReach(p)}
                      style={[s.preset, { backgroundColor: customReach === p ? g1 : g1 + '15' }]}
                    >
                      <Text style={[s.presetText, { color: customReach === p ? '#fff' : g1 }]}>{fmtNum(p)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View>
                <View style={s.customLabelRow}>
                  <Text style={[s.customLabel, { color: colors.textSecondary }]}>Duree</Text>
                  <Text style={[s.customValue, { color: g1 }]}>{customDays} jour{customDays > 1 ? 's' : ''}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
                  {[1, 3, 7, 14, 30, 60].map(d => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => setCustomDays(d)}
                      style={[s.preset, { backgroundColor: customDays === d ? g1 : g1 + '15' }]}
                    >
                      <Text style={[s.presetText, { color: customDays === d ? '#fff' : g1 }]}>{d}j</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={[s.customSummary, { backgroundColor: g1 + '10', borderColor: g1 + '20' }]}>
                <View>
                  <Text style={{ fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, color: colors.textPrimary }}>
                    {fmtNum(customReach)} {customUnit} · {customDays}j
                  </Text>
                  <Text style={{ fontSize: FontSize.xsPlus, color: colors.textTertiary, marginTop: 2 }}>
                    Solde apres : {Math.max(0, balance - customGoGold).toLocaleString('fr-FR')} GoGold
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: FontSize['2xl'], fontWeight: FontWeight.black, color: g1 }}>{customGoGold.toLocaleString('fr-FR')}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: colors.textTertiary }}>GoGold</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSelectCustom}
                disabled={balance < customGoGold}
                activeOpacity={0.85}
                style={{ borderRadius: 16, overflow: 'hidden', opacity: balance < customGoGold ? 0.4 : 1 }}
              >
                <LinearGradient colors={[g1, g2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.buyInner}>
                  <Icon name="zap" size={15} color="#fff" />
                  <Text style={s.buyText}>
                    {balance >= customGoGold
                      ? `Booster pour ${customGoGold.toLocaleString('fr-FR')} GoGold`
                      : 'Solde insuffisant'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Disclaimer honnete */}
          <View style={[s.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="info" size={13} color={colors.textTertiary} />
            <Text style={[s.infoText, { color: colors.textTertiary }]}>
              GoGold debites immediatement. Remboursement 90% si annule dans les 30 premieres minutes (10% de frais retenus). Annulation impossible ensuite.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* ── TAB: Actifs ─────────────────────────────────────────────────── */}
      {tab === 'active' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshingActive}
              onRefresh={() => refreshActiveBoosts(false)}
              tintColor="#7B3FF2"
              colors={['#7B3FF2']}
            />
          }
        >
          {loadingActive ? (
            <ActivityIndicator style={{ marginTop: 60 }} color="#7B3FF2" />
          ) : activeBoosts.length === 0 ? (
            <View style={s.emptyState}>
              <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.emptyIcon}>
                <Icon name="zap" size={28} color="#fff" />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucun boost actif</Text>
              <Text style={[s.emptySub, { color: colors.textTertiary }]}>
                Lance ton premier boost depuis l'onglet Nouveau
              </Text>
              <TouchableOpacity
                onPress={() => setTab('new')}
                style={[s.emptyBtn, { backgroundColor: '#7B3FF2' }]}
              >
                <Text style={{ color: '#fff', fontWeight: FontWeight.extraBold, fontSize: FontSize.base }}>Creer un boost</Text>
              </TouchableOpacity>
            </View>
          ) : (
            activeBoosts.map(b => (
              <ActiveBoostCard
                key={b.id}
                boost={b}
                colors={colors}
                onCancelled={(id, _refund, newBalance) => {
                  setActiveBoosts(prev => prev.filter(x => x.id !== id));
                  setBalance(newBalance);
                  setHistoryLoaded(false);
                }}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* ── TAB: Historique ─────────────────────────────────────────────── */}
      {tab === 'history' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {loadingHistory ? (
            <ActivityIndicator style={{ marginTop: 60 }} color="#7B3FF2" />
          ) : historyBoosts.length === 0 ? (
            <View style={s.emptyState}>
              <Icon name="clock" size={32} color={colors.textTertiary} />
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucun historique</Text>
            </View>
          ) : (
            historyBoosts.map(b => (
              <ActiveBoostCard
                key={b.id}
                boost={b}
                colors={colors}
                onCancelled={() => {}}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Modal confirmation achat */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => !purchasing && setShowModal(false)}>
        <View style={ms.overlay}>
          <View style={[ms.sheet, { backgroundColor: colors.surface, paddingBottom: 44 + insets.bottom }]}>
            <View style={[ms.handle, { backgroundColor: colors.border }]} />
            <Text style={[ms.title, { color: colors.textPrimary }]}>Confirmer le boost</Text>

            {selectedTier && (
              <>
                {/* Changer de pack — tiers de la même catégorie, cote a cote */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.tierPickerRow}>
                  {cat.tiers.map(t => {
                    const isSel = t.id === selectedTier.id;
                    const canAfford = balance >= t.GoGold;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => setSelectedTier(t)}
                        activeOpacity={0.85}
                        style={[
                          ms.tierPick,
                          { borderColor: isSel ? g1 : colors.border, backgroundColor: isSel ? g1 + '14' : colors.background },
                          !canAfford && { opacity: 0.5 },
                        ]}
                      >
                        {t.popular && (
                          <View style={[ms.tierPickBadge, { backgroundColor: g1 }]}>
                            <Text style={ms.tierPickBadgeText}>Populaire</Text>
                          </View>
                        )}
                        <Text style={[ms.tierPickLabel, { color: isSel ? g1 : colors.textPrimary }]}>{t.label}</Text>
                        <Text style={[ms.tierPickQty, { color: colors.textSecondary }]} numberOfLines={1}>{t.quantity}</Text>
                        <Text style={[ms.tierPickGoGold, { color: isSel ? g1 : colors.textTertiary }]}>
                          {t.GoGold.toLocaleString('fr-FR')} GoGold
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <LinearGradient colors={[g1, g2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.modalPreview}>
                  <Icon name={cat.icon as any} size={28} color="#fff" />
                  <Text style={s.modalPreviewQty}>{selectedTier.quantity}</Text>
                  <Text style={s.modalPreviewCat}>{cat.label} · {selectedTier.label}</Text>
                  <Text style={s.modalPreviewDur}>{selectedTier.duration}</Text>
                  {targetContent?.title && (
                    <Text style={s.modalPreviewContent} numberOfLines={1}>{targetContent.title}</Text>
                  )}
                </LinearGradient>

                <View style={[s.modalSummary, { backgroundColor: colors.background }]}>
                  {[
                    { label: 'Cout',          value: `${selectedTier.GoGold.toLocaleString('fr-FR')} GoGold`, color: g1 },
                    { label: 'Solde actuel',  value: `${balance.toLocaleString('fr-FR')} GoGold` },
                    { label: 'Solde restant', value: `${(balance - selectedTier.GoGold).toLocaleString('fr-FR')} GoGold` },
                    { label: 'Remboursement', value: '90% si annule dans les 30 min', color: '#22C55E' },
                  ].map(row => (
                    <View key={row.label} style={s.modalRow}>
                      <Text style={[s.modalLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                      <Text style={[s.modalValue, { color: (row as any).color ?? colors.textPrimary }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={confirmBoost}
                  disabled={purchasing || balance < selectedTier.GoGold}
                  activeOpacity={0.85}
                  style={{ borderRadius: 16, overflow: 'hidden', opacity: purchasing || balance < selectedTier.GoGold ? 0.5 : 1 }}
                >
                  <LinearGradient colors={[g1, g2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.confirmInner}>
                    {purchasing
                      ? <ActivityIndicator color="#fff" />
                      : balance < selectedTier.GoGold
                        ? <Text style={s.confirmText}>Solde insuffisant</Text>
                        : <><Icon name="zap" size={16} color="#fff" /><Text style={s.confirmText}>Activer le boost</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => !purchasing && setShowModal(false)} style={ms.cancelBtn}>
              <Text style={[ms.cancelText, { color: colors.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: successAnim, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(0,0,0,0.8)' },
        ]}
      >
        <Animated.View style={[s.successBox, { transform: [{ scale: successScale }] }]}>
          <LinearGradient colors={[g1, g2]} style={s.successRing}>
            <Icon name="zap" size={40} color="#fff" />
          </LinearGradient>
          <Text style={s.successTitle}>Boost active !</Text>
          <Text style={s.successSub}>
            Votre contenu apparait plus souvent dans les feeds.{'\n'}Suivez les impressions dans l'onglet Actifs.
          </Text>
        </Animated.View>
      </Animated.View>

      <HelpGuideSheet
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Comment fonctionne le Boost ?"
        intro="Le Boost augmente artificiellement la visibilité de ton compte ou d'un contenu précis, payé en GoGold — différent d'une Pub (campagne publicitaire avec budget en euros, visible par tous, gérée dans Mes publicités)."
        points={[
          { icon: 'target',      title: 'Choisis une cible',       text: 'Abonnés, vues profil, portée de tes contenus, ou un Reel/post/event/concert précis.' },
          { icon: 'layers',      title: 'Choisis un pack',          text: 'Starter, Growth, Viral ou Mega — plus le pack est grand, plus la portée et la durée augmentent, pour plus de GoGold.' },
          { icon: 'cpu',         title: '"Pour toi"',              text: "L'onglet Pour toi analyse ton compte et te propose automatiquement la meilleure opportunité du moment, avec une raison personnalisée." },
          { icon: 'rotate-ccw',  title: 'Remboursement',           text: "Tu peux annuler un boost actif dans les 30 premières minutes — 90% du GoGold dépensé t'est remboursé." },
          { icon: 'activity',    title: 'Suivi en temps réel',     text: "L'onglet Actifs affiche la progression, le multiplicateur de visibilité et les impressions livrées." },
        ]}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const abc = StyleSheet.create({
  card:         { borderRadius: 18, overflow: 'hidden', borderWidth: 1, marginBottom: 10 },
  topBar:       { height: 3 },
  mainRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  iconBox:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
  tierLabel:    { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, flex: 1 },
  contentTitle: { fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold, marginBottom: 4 },
  statsBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', marginBottom: 6 },
  statsText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  progressBg:   { height: 4, borderRadius: 2, marginTop: 4 },
  progressFill: { height: 4, borderRadius: 2 },
  ring:         { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringFill:     { position: 'absolute', width: 48, height: 48, borderRadius: 24, borderWidth: 3 },
  ringText:     { fontSize: FontSize.xsPlus, fontWeight: FontWeight.extraBold },
  daysLeft:     { fontSize: FontSize['2xs'], fontWeight: FontWeight.semiBold },
  details:      { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  detailRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel:  { fontSize: FontSize.sm },
  detailValue:  { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  stopBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 4, justifyContent: 'center' },
  stopText:     { color: '#EF4444', fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
});

const ms = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:           { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  handle:          { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  title:           { fontSize: FontSize.lg, fontWeight: FontWeight.extraBold, textAlign: 'center' },
  sub:             { fontSize: FontSize.smPlus, lineHeight: 20, textAlign: 'center' },
  refundBox:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  refundText:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, flex: 1 },
  stopConfirm:     { borderRadius: 16, padding: 16, alignItems: 'center', backgroundColor: '#EF4444' },
  stopConfirmText: { color: '#fff', fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold },
  cancelBtn:       { alignItems: 'center', paddingVertical: 8 },
  cancelText:      { fontSize: FontSize.base, fontWeight: FontWeight.medium },

  tierPickerRow:   { gap: 10, paddingBottom: 4 },
  tierPick:        { width: 112, borderRadius: 14, borderWidth: 1.5, padding: 10, gap: 2 },
  tierPickBadge:   { position: 'absolute', top: -8, right: 8, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tierPickBadgeText: { color: '#fff', fontSize: FontSize['2xs'], fontWeight: FontWeight.extraBold },
  tierPickLabel:   { fontSize: FontSize.smPlus, fontWeight: FontWeight.extraBold },
  tierPickQty:     { fontSize: FontSize.xs },
  tierPickGoGold:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, marginTop: 2 },
});

const cp = StyleSheet.create({
  trigger:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  triggerText: { fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold },
  modal:       { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  input:       { flex: 1, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, fontSize: FontSize.base },
  resultRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  thumbWrap:   { position: 'relative', width: 44, height: 44 },
  thumb:       { width: 44, height: 44, borderRadius: 8 },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  resultText:  { fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold },
});

const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, gap: 12,
    marginHorizontal: 10, marginBottom: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extraBold },
  headerSub:   { fontSize: FontSize.xsPlus, marginTop: 2 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  balanceText: { color: '#FFD700', fontWeight: FontWeight.bold, fontSize: FontSize.smPlus },

  tabsBar:     { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, flexDirection: 'row', gap: 4 },
  tabText:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  tabBadge:    { backgroundColor: '#22C55E', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText:{ color: '#fff', fontSize: FontSize['2xs'], fontWeight: FontWeight.extraBold },

  scroll:       { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 60, gap: 14 },
  sectionLabel: { fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  warning:      { fontSize: FontSize.xsPlus, marginTop: 4 },

  catActive:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  catActiveText:  { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  catInactive:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catInactiveText:{ fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },

  descBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  descIcon:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  descTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.extraBold, marginBottom: 1 },
  descSublabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  descText:     { fontSize: FontSize.sm, lineHeight: 18 },

  modeSwitch:    { flexDirection: 'row', borderRadius: 16, padding: 4, gap: 4 },
  modeSwitchBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 12 },
  modeSwitchText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  tiersGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  tierCard:    { borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1.5, minHeight: 130, justifyContent: 'center', position: 'relative' },
  tierSelected:{ borderColor: 'transparent', elevation: 8, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  popularBadge:{ position: 'absolute', top: -10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'center' },
  popularText: { fontSize: FontSize['2xs'], fontWeight: FontWeight.extraBold, color: '#fff', letterSpacing: 0.6 },
  tierLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  tierQty:     { fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold, textAlign: 'center' },
  tierDur:     { fontSize: FontSize.xsPlus, marginTop: 2 },
  tierGoGold:   { fontSize: FontSize.base, fontWeight: FontWeight.extraBold, marginTop: 6 },

  customPanel:   { borderRadius: 18, borderWidth: 1, padding: 16, gap: 14 },
  customLabelRow:{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  customLabel:   { fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  customValue:   { fontSize: FontSize.base, fontWeight: FontWeight.extraBold },
  preset:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  presetText:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  customSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14 },

  buyInner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  buyText:     { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.extraBold },

  infoBox:     { flexDirection: 'row', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  infoText:    { flex: 1, fontSize: FontSize.xsPlus, lineHeight: 17 },

  emptyState:  { alignItems: 'center', gap: 12, paddingVertical: 60 },
  emptyIcon:   { width: 70, height: 70, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.extraBold },
  emptySub:    { fontSize: FontSize.smPlus, textAlign: 'center', paddingHorizontal: 20 },
  emptyBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },

  modalPreview:       { borderRadius: 20, padding: 24, alignItems: 'center', gap: 4 },
  modalPreviewQty:    { color: '#fff', fontSize: FontSize['2xl'], fontWeight: FontWeight.black, marginTop: 6 },
  modalPreviewCat:    { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.smPlus },
  modalPreviewDur:    { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.sm },
  modalPreviewContent:{ color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, marginTop: 4 },
  modalSummary:       { borderRadius: 14, padding: 14, gap: 10 },
  modalRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalLabel:         { fontSize: FontSize.smPlus },
  modalValue:         { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
  confirmInner:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  confirmText:        { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.extraBold },

  successBox:   { alignItems: 'center', gap: 16, padding: 32 },
  successRing:  { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: '#fff', fontSize: FontSize['2xl'], fontWeight: FontWeight.black },
  successSub:   { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.smPlus, textAlign: 'center', lineHeight: 20 },
});

const sc = StyleSheet.create({
  card:          { borderRadius: 18, overflow: 'hidden', borderWidth: 1, marginBottom: 10 },
  topBar:        { height: 3 },
  body:          { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  iconBox:       { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  impactLabel:   { fontSize: FontSize.sm, fontWeight: FontWeight.extraBold, textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  priorityText:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  contentTitle:  { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, marginBottom: 4 },
  reason:        { fontSize: FontSize.sm, lineHeight: 18 },
  engBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  engText:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#22C55E' },
  footer:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  qty:           { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
  dur:           { fontSize: FontSize.xsPlus, marginTop: 1 },
  boostBtnWrap:  { borderRadius: 20, overflow: 'hidden' },
  boostBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8 },
  boostBtnText:  { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.extraBold },
  introBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, padding: 12 },
  introText:     { flex: 1, fontSize: FontSize.sm, lineHeight: 18 },
});
