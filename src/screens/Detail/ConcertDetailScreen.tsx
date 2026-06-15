import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  Modal, Share, Alert, Platform, Linking,
  Dimensions, StyleSheet, StatusBar, InteractionManager, ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonDetail, CommentsBottomSheet, ExpandableText, BackButton, GoFolyXLoader, FriendsWhoLiked } from '../../components/common';
import { TicketPaymentSheet } from '../../components/wallet/TicketPaymentSheet';
import { concertService, socialService, authService } from '../../services';
import { favoriteService } from '../../services/favoriteService';
import type { Concert } from '../../types';
import type { AppColors } from '../../theme/colors';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainNavigator';

const { width: SW } = Dimensions.get('window');
const HERO_H = SW * 0.72;

// ── Helpers ───────────────────────────────────────────────────────────────────

const getInitials = (name?: string | null) =>
  name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// ── VideoModal ────────────────────────────────────────────────────────────────

const VideoModal: React.FC<{ uri: string; onClose: () => void }> = ({ uri, onClose }) => {
  const [isReady, setIsReady] = useState(false);
  const player = useVideoPlayer({ uri }, p => { p.muted = false; p.play(); });

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }: any) => {
      if (status === 'readyToPlay') setIsReady(true);
    });
    return () => sub?.remove?.();
  }, [player]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <VideoView player={player} style={{ width: SW, height: SW * 0.62 }} resizeMode="contain" controls />
        {!isReady && <GoFolyXLoader variant="reel" color="#ffffff" />}
        <TouchableOpacity onPress={onClose}
          style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36, right: 16,
            width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)',
            alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

// ── HeroConcert ───────────────────────────────────────────────────────────────

const HeroConcert: React.FC<{
  isLive: boolean; thumbnail?: string;
  title: string; artistName?: string | null;
  genre?: string | null; isFree: boolean;
  viewers: number; hasVideo: boolean; onVideoPress: () => void;
  colors: AppColors;
}> = ({ isLive, thumbnail, title, artistName, genre, isFree, viewers, hasVideo, onVideoPress, colors }) => (
  <View style={{ width: SW, height: HERO_H, backgroundColor: '#000' }}>
    {thumbnail ? (
      <Image source={{ uri: thumbnail }} style={{ ...StyleSheet.absoluteFill }} resizeMode="cover" />
    ) : (
      <View style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e' }}>
        <Icon name="music" size={80} color="rgba(155,101,245,0.3)" />
      </View>
    )}

    {/* Dégradés */}
    <LinearGradient
      colors={['#7B3FF259', 'transparent']}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HERO_H * 0.45 }}
      pointerEvents="none"
    />
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.92)']}
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: HERO_H * 0.65 }}
      pointerEvents="none"
    />

    {/* Badges haut */}
    <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36, left: 64, flexDirection: 'row', gap: 6 }}>
      {isLive && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.8 }}>EN DIRECT</Text>
        </View>
      )}
      {isFree && (
        <View style={{ backgroundColor: '#36D9A0EE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 }}>GRATUIT</Text>
        </View>
      )}
      {isLive && viewers > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
          backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
          <Icon name="eye" size={11} color="#fff" />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{viewers.toLocaleString('fr')}</Text>
        </View>
      )}
    </View>

    {/* Bouton vidéo */}
    {hasVideo && (
      <TouchableOpacity onPress={onVideoPress}
        style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36, right: 16,
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 }}>
        <Icon name="play-circle" size={14} color="#fff" />
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Vidéo</Text>
      </TouchableOpacity>
    )}

    {/* Titre + artiste en bas */}
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 20, gap: 8 }}>
      <Text style={{ fontSize: 26, fontWeight: '900', color: '#fff', lineHeight: 32, letterSpacing: -0.3 }} numberOfLines={2}>
        {title}
      </Text>
      {artistName && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LinearGradient colors={['#7B3FF2', '#E0389A']}
            style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>{getInitials(artistName)}</Text>
          </LinearGradient>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)' }}>{artistName}</Text>
            {genre && <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '500' }}>{genre}</Text>}
          </View>
        </View>
      )}
    </View>
  </View>
);

// ── SectionHeader ─────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ label: string; colors: AppColors }> = ({ label, colors }) => (
  <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textTertiary, marginBottom: 10, textTransform: 'uppercase' }}>
    {label}
  </Text>
);

// ── InfoRow ───────────────────────────────────────────────────────────────────

interface InfoRowProps {
  icon: string; label: string; value: string;
  color: string; colors: AppColors;
  divider?: boolean; onPress?: () => void;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, color, colors, divider, onPress }) => {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      {divider && <View style={{ position: 'absolute', top: 0, left: 16, right: 16, height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />}
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color + '15', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '500' }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: onPress ? color : colors.textPrimary, lineHeight: 18 }}>{value}</Text>
      </View>
      {onPress && <Icon name="chevron-right" size={15} color={color} />}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
};

// ── Ticket / fees ─────────────────────────────────────────────────────────────

const FEES_RATE = 0.10;

// ── TicketTiersGrid ───────────────────────────────────────────────────────────

interface TierItem {
  key: 'simple' | 'vip' | 'vvip' | 'vvvip';
  label: string; icon: string; color: string;
  price: number | null | undefined;
  sub?: string;
}

const TierCard: React.FC<{
  tier: TierItem & { price: number };
  active: boolean;
  onPress: () => void;
  colors: AppColors;
}> = ({ tier, active, onPress, colors }) => {
  const fees = Math.round(tier.price * FEES_RATE);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78}
      style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: active ? tier.color + '12' : colors.backgroundSecondary,
        borderRadius: 16, borderWidth: 1.5,
        borderColor: active ? tier.color : colors.border,
        paddingVertical: 14, paddingHorizontal: 14,
        marginBottom: 8,
      }}
    >
      <View style={{
        width: 4, minHeight: 48, borderRadius: 4,
        backgroundColor: active ? tier.color : tier.color + '40',
        marginRight: 12, alignSelf: 'stretch',
      }} />
      <View style={{
        width: 44, height: 44, borderRadius: 13,
        backgroundColor: tier.color + (active ? '22' : '14'),
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
      }}>
        <Icon name={tier.icon} size={19} color={tier.color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: active ? tier.color : colors.textPrimary, letterSpacing: 0.2 }}>
          {tier.label.toUpperCase()}
        </Text>
        {tier.sub && (
          <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '500' }}>{tier.sub}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={{ fontSize: 17, fontWeight: '900', color: active ? tier.color : colors.textPrimary }}>
          {tier.price.toLocaleString('fr')} €
        </Text>
        <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '500' }}>
          + {fees.toLocaleString('fr')} frais
        </Text>
      </View>
      {active && (
        <View style={{
          width: 22, height: 22, borderRadius: 11, backgroundColor: tier.color,
          alignItems: 'center', justifyContent: 'center', marginLeft: 10,
        }}>
          <Icon name="check" size={12} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const TicketTiersGrid: React.FC<{
  tiers: TierItem[];
  selected: TierItem['key'];
  onSelect: (k: TierItem['key']) => void;
  colors: AppColors;
}> = ({ tiers, selected, onSelect, colors }) => {
  const _p2 = (v: any) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
  const visible = tiers.map(t => ({ ...t, price: _p2(t.price) })).filter(t => t.price !== null) as (TierItem & { price: number })[];
  if (visible.length === 0) return null;

  const effectiveSelected = visible.find(t => t.key === selected) ? selected : visible[0].key;

  return (
    <View style={{ marginBottom: 4 }}>
      <SectionHeader label={visible.length === 1 ? 'Billet' : 'Catégorie de billet'} colors={colors} />
      {visible.map(tier => (
        <TierCard
          key={tier.key}
          tier={tier}
          active={effectiveSelected === tier.key}
          onPress={() => onSelect(tier.key)}
          colors={colors}
        />
      ))}
    </View>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props { concertId: string; onBack?: () => void; }

// ── ConcertDetailScreen ───────────────────────────────────────────────────────

export const ConcertDetailScreen: React.FC<Props> = ({ concertId, onBack }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [concert,      setConcert]      = useState<Concert | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [isOwner,      setIsOwner]      = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const [shareCount,   setShareCount]   = useState(0);
  const [saved,        setSaved]        = useState(false);
  const [showVideo,        setShowVideo]        = useState(false);
  const [showComments,     setShowComments]     = useState(false);
  const [showOwnerMenu,    setShowOwnerMenu]    = useState(false);
  const [togglingComments, setTogglingComments] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'simple' | 'vip' | 'vvip' | 'vvvip'>('simple');
  const [replayUrl,    setReplayUrl]    = useState<string | null>(null);

  const heartScale = useSharedValue(1);
  const saveScale  = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const saveStyle  = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));

  const loadConcert = useCallback(async () => {
    try {
      const data = await concertService.getById(concertId);
      setConcert(data);
      favoriteService.check('concert', concertId).then(setSaved).catch(() => {});
      // Charger le replay si le concert est termine et a un live associe
      if (data.status === 'ended' && data.live_id) {
        try {
          const { apiClient } = require('../../api/client');
          const replay = await apiClient.get(`/api/v1/lives/${data.live_id}/replay`);
          setReplayUrl(replay?.replay_url ?? null);
        } catch { /**/ }
      }
      try {
        const user = await authService.getMe();
        setIsOwner(String(user?.id) === String(data.artist_id ?? data.artist?.id));
        const tickets = await concertService.getMyTickets();
        setIsRegistered((tickets as any[]).some((t: any) => t.concert_id === concertId));
      } catch { /**/ }
      try {
        const counts = await socialService.getReactionCounts({ concert_id: concertId });
        setLikeCount(counts.likes ?? 0);
        setShareCount(counts.shares ?? 0);
        const myR = await socialService.getMyReaction({ concert_id: concertId });
        setLiked(myR.reaction_type === 'like');
      } catch { /**/ }
    } catch { /**/ }
    finally { setLoading(false); }
  }, [concertId]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { loadConcert(); });
    return () => task.cancel();
  }, [loadConcert]);

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 5, stiffness: 300 }), withSpring(1, { damping: 10 }));
    const n = !liked;
    setLiked(n);
    setLikeCount(prev => n ? prev + 1 : Math.max(0, prev - 1));
    socialService.toggleReaction({ reaction_type: 'like', concert_id: concertId }).catch(() => {
      setLiked(!n);
      setLikeCount(prev => n ? Math.max(0, prev - 1) : prev + 1);
    });
  };

  const handleSave = () => {
    saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    if (!concert) return;
    const n = !saved;
    setSaved(n);
    if (n) {
      favoriteService.save({ target_type: 'concert', target_id: concertId,
        target_title: concert.title, target_subtitle: concert.venue_city ?? concert.artist?.username ?? undefined,
        target_thumbnail: concert.thumbnail_url ?? undefined }).catch(() => setSaved(false));
    } else {
      favoriteService.unsave('concert', concertId).catch(() => setSaved(true));
    }
  };

  const handleNativeShare = async () => {
    if (!concert) return;
    try {
      await Share.share({ title: concert.title,
        message: `${concert.title} — ${formatDateShort(concert.scheduled_at)} à ${concert.venue_city ?? 'GoFolyX'}\nVia GoFolyX` });
      setShareCount(c => c + 1);
      socialService.share({ platform: 'external', concert_id: concertId }).catch(() => setShareCount(c => Math.max(0, c - 1)));
    } catch { /**/ }
  };

  const handleToggleComments = async () => {
    if (!concert) return;
    setTogglingComments(true);
    try {
      const res = await socialService.toggleEntityComments('concert', concertId);
      setConcert(prev => prev ? { ...prev, comments_disabled: res.comments_disabled } : prev);
    } catch { /**/ } finally { setTogglingComments(false); setShowOwnerMenu(false); }
  };

  const handleEdit   = () => nav.navigate('CreateConcert' as any, { concertId });
  const handleDelete = () => {
    Alert.alert('Supprimer', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await concertService.delete(concertId); onBack?.(); }
        catch (e: any) { Alert.alert('Erreur', e?.message ?? 'Impossible de supprimer.'); }
      }},
    ]);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><SkeletonDetail /></View>;

  if (!concert) return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Icon name="alert-circle" size={48} color={colors.textTertiary} />
      <Text style={{ color: colors.textTertiary, fontSize: 15 }}>Concert introuvable</Text>
    </View>
  );

  const isLive      = concert.status === 'live';
  const isEnded     = concert.status === 'ended';
  const isScheduled = concert.status === 'published' && !!concert.live_id && !isLive;
  const isFree      = concert.access_type === 'free';
  const artistName  = concert.artist?.display_name ?? concert.artist?.username;
  const hasVideo    = !!(concert.hls_url ?? concert.video_url);
  const hasReplay   = isEnded && !!replayUrl;

  const scheduledIn = (() => {
    if (!isScheduled || !concert.scheduled_at) return null;
    const diff = new Date(concert.scheduled_at).getTime() - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 24) return `dans ${Math.floor(h / 24)}j`;
    if (h > 0)  return `dans ${h}h${m > 0 ? `${m}m` : ''}`;
    return `dans ${m}min`;
  })();

  const handleWatchLive = () => {
    nav.navigate(isOwner ? 'LiveStream' as any : 'LiveViewer' as any, { concertId });
  };

  const handleWatchReplay = async () => {
    if (!replayUrl) return;
    nav.navigate('VideoPlayer' as any, {
      url: replayUrl,
      title: concert.title,
      thumbnailUrl: concert.thumbnail_url ?? undefined,
    });
  };

  const CONCERT_TYPE_LABEL: Record<string, string> = {
    live: 'Live uniquement', replay: 'Replay uniquement', live_replay: 'Live + Replay',
  };

  const _p = (v: any) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
  const allTiers = [
    { key: 'simple' as const, label: 'Simple', icon: 'tag',   color: colors.primary,  price: _p(concert.ticket_price),       sub: 'Accès standard' },
    { key: 'vip'    as const, label: 'VIP',    icon: 'star',  color: '#F59E0B',        price: _p(concert.ticket_price_vip),   sub: 'Accès prioritaire' },
    { key: 'vvip'   as const, label: 'VVIP',   icon: 'award', color: '#8B5CF6',        price: _p(concert.ticket_price_vvip),  sub: 'Expérience premium' },
    { key: 'vvvip'  as const, label: 'VVVIP',  icon: 'zap',   color: '#EF4444',        price: _p(concert.ticket_price_vvvip), sub: 'All-inclusive' },
  ].filter(t => t.price !== null) as { key: 'simple'|'vip'|'vvip'|'vvvip'; label: string; icon: string; color: string; price: number; sub: string }[];

  const activeTier = allTiers.find(t => t.key === selectedTier) ?? allTiers[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Bouton retour flottant */}
      <BackButton onPress={onBack} transparent color="#fff" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <HeroConcert
          isLive={isLive}
          thumbnail={concert.thumbnail_url ?? concert.banner_url ?? undefined}
          title={concert.title}
          artistName={artistName}
          genre={concert.genre}
          isFree={isFree}
          viewers={concert.current_viewers ?? 0}
          hasVideo={hasVideo}
          onVideoPress={() => setShowVideo(true)}
          colors={colors}
        />

        {showVideo && hasVideo && <VideoModal uri={(concert.hls_url ?? concert.video_url)!} onClose={() => setShowVideo(false)} />}

        {/* ── Live / Replay / Schedulé ─────────────────────────────── */}
        {(isLive || isScheduled || hasReplay || (isEnded && concert.live_id && !hasReplay)) && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 10 }}>
            {isLive && (
              <TouchableOpacity onPress={handleWatchLive} activeOpacity={0.88}>
                <LinearGradient colors={['#EF4444', '#DC2626']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={ds.ctaGradient}>
                  <Icon name="radio" size={20} color="#fff" />
                  <Text style={ds.ctaText}>Regarder en direct</Text>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto' as any }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>LIVE</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}
            {isScheduled && (
              <View style={[ds.infoBanner, { borderColor: colors.primary + '55', backgroundColor: colors.primary + '10' }]}>
                <Icon name="clock" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>Live programmé</Text>
                  {scheduledIn && <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Démarre {scheduledIn} · {formatTime(concert.scheduled_at)}</Text>}
                </View>
              </View>
            )}
            {hasReplay && (
              <TouchableOpacity onPress={handleWatchReplay} activeOpacity={0.88}>
                <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={ds.ctaGradient}>
                  <Icon name="play" size={20} color="#fff" />
                  <Text style={ds.ctaText}>Regarder le replay</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            {isEnded && !hasReplay && concert.live_id && (
              <View style={[ds.infoBanner, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="film" size={18} color={colors.textTertiary} />
                <Text style={{ fontSize: 14, color: colors.textTertiary }}>Replay non disponible</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Date pill + stats ────────────────────────────────────── */}
        <View style={ds.datePillRow}>
          <View style={[ds.datePill, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
            <Icon name="calendar" size={13} color={colors.primary} />
            <View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
                {formatDate(concert.scheduled_at)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                {formatTime(concert.scheduled_at)}
              </Text>
            </View>
          </View>
          {concert.venue_city && (
            <View style={[ds.locationPill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Icon name="map-pin" size={13} color={colors.accentOrange} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                {concert.venue_city}
              </Text>
            </View>
          )}
        </View>

        {/* ── Amis qui aiment ─────────────────────────────────────── */}
        {likeCount > 0 && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <FriendsWhoLiked entityType="concert" entityId={concertId} totalLikes={likeCount} />
          </View>
        )}

        {/* ── Barre sociale ────────────────────────────────────────── */}
        <View style={[ds.socialBar, { borderTopColor: colors.divider, borderBottomColor: colors.divider }]}>
          <TouchableOpacity style={ds.socialBtn} onPress={handleLike} activeOpacity={0.7}>
            <Animated.View style={heartStyle}>
              <MCIcon name={liked ? 'heart' : 'heart-outline'} size={21} color={liked ? '#E0389A' : colors.textTertiary} />
            </Animated.View>
            {likeCount > 0 && (
              <Text style={[ds.socialBtnText, { color: liked ? '#E0389A' : colors.textTertiary, fontWeight: liked ? '700' : '500' }]}>
                {likeCount.toLocaleString('fr')}
              </Text>
            )}
          </TouchableOpacity>
          {!concert?.comments_disabled && <View style={[ds.socialSep, { backgroundColor: colors.divider }]} />}
          {!concert?.comments_disabled && (
            <TouchableOpacity style={ds.socialBtn} onPress={() => setShowComments(true)} activeOpacity={0.7}>
              <MCIcon name="comment-outline" size={21} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
          <View style={[ds.socialSep, { backgroundColor: colors.divider }]} />
          <TouchableOpacity style={ds.socialBtn} onPress={handleNativeShare} activeOpacity={0.7}>
            <MCIcon name="share-outline" size={21} color={shareCount > 0 ? colors.primary : colors.textTertiary} />
            {shareCount > 0 && (
              <Text style={[ds.socialBtnText, { color: colors.textTertiary }]}>
                {shareCount > 999 ? `${(shareCount / 1000).toFixed(1)}k` : shareCount}
              </Text>
            )}
          </TouchableOpacity>
          <View style={[ds.socialSep, { backgroundColor: colors.divider }]} />
          <TouchableOpacity style={[ds.socialBtn, { flex: 0, paddingHorizontal: 18 }]} onPress={handleSave} activeOpacity={0.7}>
            <Animated.View style={saveStyle}>
              <MCIcon name={saved ? 'bookmark' : 'bookmark-outline'} size={21} color={saved ? colors.primary : colors.textTertiary} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* ── À propos ─────────────────────────────────────────────── */}
        {concert.description ? (
          <View style={ds.section}>
            <SectionHeader label="À propos" colors={colors} />
            <ExpandableText text={concert.description} maxLines={4}
              textStyle={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}
              primaryColor={colors.primary} />
          </View>
        ) : null}

        {/* ── Infos pratiques ──────────────────────────────────────── */}
        <View style={ds.section}>
          <SectionHeader label="Infos pratiques" colors={colors} />
          <View style={[ds.infoCard, { backgroundColor: colors.backgroundSecondary }]}>
            <InfoRow icon="calendar" label="Date du concert" value={formatDate(concert.scheduled_at)}
              color={colors.primary} colors={colors} />
            {concert.venue_city && (
              <InfoRow
                icon="map-pin" label="Lieu"
                value={[concert.venue_name, concert.venue_city, concert.venue_country].filter(Boolean).join(', ')}
                color={colors.accentOrange} colors={colors} divider
                onPress={() => {
                  const q = encodeURIComponent([concert.venue_name, concert.venue_city, concert.venue_country].filter(Boolean).join(', '));
                  const url = Platform.OS === 'ios' ? `maps:?q=${q}` : `geo:0,0?q=${q}`;
                  Linking.canOpenURL(url).then(ok =>
                    Linking.openURL(ok ? url : `https://www.google.com/maps/search/?api=1&query=${q}`));
                }}
              />
            )}
            <InfoRow
              icon="layers" label="Format"
              value={CONCERT_TYPE_LABEL[concert.concert_type] ?? concert.concert_type}
              color={colors.gradientEnd} colors={colors} divider
            />
            {concert.genre && (
              <InfoRow icon="music" label="Genre" value={concert.genre}
                color={colors.accentGreen} colors={colors} divider />
            )}
            {concert.duration_min != null && (
              <InfoRow icon="clock" label="Durée" value={`${concert.duration_min} min`}
                color={colors.accentGreen} colors={colors} divider />
            )}
          </View>
        </View>

        {/* ── Billets ───────────────────────────────────────────────── */}
        {!isFree && (
          <View style={ds.section}>
            <TicketTiersGrid
              tiers={[
                { key: 'simple', label: 'Simple', icon: 'tag',   color: colors.primary, price: _p(concert.ticket_price),       sub: 'Accès standard' },
                { key: 'vip',    label: 'VIP',    icon: 'star',  color: '#F59E0B',      price: _p(concert.ticket_price_vip),   sub: 'Accès prioritaire' },
                { key: 'vvip',   label: 'VVIP',   icon: 'award', color: '#8B5CF6',      price: _p(concert.ticket_price_vvip),  sub: 'Expérience premium' },
                { key: 'vvvip',  label: 'VVVIP',  icon: 'zap',   color: '#EF4444',      price: _p(concert.ticket_price_vvvip), sub: 'All-inclusive' },
              ]}
              selected={selectedTier} onSelect={setSelectedTier} colors={colors}
            />
          </View>
        )}

      </ScrollView>

      {/* ── CTA flottant ─────────────────────────────────────────────── */}
      <View style={[ds.ctaBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
        {isOwner ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(concert.status === 'published' || concert.status === 'live') && (
              <TouchableOpacity onPress={() => nav.navigate('LiveStream' as any, { concertId })}
                style={[ds.ctaSecondary, { flex: 1, backgroundColor: '#EF444414' }]}>
                <Icon name="radio" size={16} color="#EF4444" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                  {concert.status === 'live' ? 'Rejoindre' : 'Go Live'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleEdit}
              style={[ds.ctaSecondary, { flex: 1, backgroundColor: colors.primary + '14' }]}>
              <Icon name="edit-2" size={16} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowOwnerMenu(true)}
              style={[ds.ctaSecondary, { paddingHorizontal: 18, backgroundColor: colors.surface }]}>
              <Icon name="more-vertical" size={16} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete}
              style={[ds.ctaSecondary, { paddingHorizontal: 20, backgroundColor: colors.error + '14' }]}>
              <Icon name="trash-2" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        ) : isFree ? null : (
          <TouchableOpacity onPress={isRegistered ? undefined : () => setPaySheetOpen(true)}
            disabled={isRegistered} activeOpacity={isRegistered ? 1 : 0.85}>
            <LinearGradient
              colors={isRegistered ? ['#555', '#444'] : [colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={ds.ctaGradient}>
              <Icon name={isRegistered ? 'check' : 'tag'} size={20} color="#fff" />
              <Text style={ds.ctaText}>
                {isRegistered ? 'Déjà inscrit'
                  : allTiers.length > 1 ? `Billet ${activeTier?.label ?? ''}`
                  : 'Acheter un billet'}
              </Text>
              {!isRegistered && activeTier?.price != null && (
                <View style={{ marginLeft: 'auto' as any, alignItems: 'flex-end', gap: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>
                    {(activeTier.price + Math.round(activeTier.price * FEES_RATE)).toLocaleString('fr')} €
                  </Text>
                  <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', fontWeight: '600' }}>frais inclus</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* Sheets */}
      <TicketPaymentSheet
        visible={paySheetOpen} onClose={() => setPaySheetOpen(false)}
        onSuccess={() => setIsRegistered(true)}
        itemId={concertId} title={concert.title}
        accessType={concert.access_type as any}
        ticketPrice={concert.ticket_price ?? null}
        thumbnail={concert.thumbnail_url ?? null}
        kind="concert"
        tiers={allTiers}
        selectedTierKey={selectedTier}
        onBuy={(tierKey) => concertService.buyTicket(concertId, tierKey)}
      />
      {/* Menu propriétaire */}
      <Modal visible={showOwnerMenu} transparent animationType="fade" onRequestClose={() => setShowOwnerMenu(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} activeOpacity={1} onPress={() => setShowOwnerMenu(false)}>
          <View style={{ position: 'absolute', bottom: 32, left: 16, right: 16, borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 16 }}
              onPress={handleToggleComments}
              disabled={togglingComments}
            >
              {togglingComments
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <MCIcon name={concert?.comments_disabled ? 'comment-check-outline' : 'comment-off-outline'} size={22} color={colors.primary} />
              }
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                {concert?.comments_disabled ? 'Activer les commentaires' : 'Desactiver les commentaires'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      <CommentsBottomSheet visible={showComments} onClose={() => setShowComments(false)} concertId={concertId} commentsDisabled={concert?.comments_disabled ?? false} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const ds = StyleSheet.create({
  backBtn: {
    position: 'absolute', zIndex: 10,
    top: Platform.OS === 'ios' ? 52 : 36, left: 16,
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaGradient: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 16, paddingHorizontal: 20, borderRadius: 16,
  },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  ctaSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 14,
  },
  socialBar: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 4, marginBottom: 4,
  },
  socialBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 13,
  },
  socialBtnText: { fontSize: 13, fontWeight: '600' },
  socialSep: { width: StyleSheet.hairlineWidth, height: 22 },
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  infoCard: { borderRadius: 16, overflow: 'hidden' },
  datePillRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
    gap: 10,
  },
  datePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    flexShrink: 1,
  },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
  },
});
