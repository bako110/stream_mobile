import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  Modal, Share, Alert, Platform, Linking,
  Dimensions, StyleSheet, StatusBar, InteractionManager, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonDetail, CommentsBottomSheet, ExpandableText } from '../../components/common';
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
  const player = useVideoPlayer({ uri }, p => { p.muted = false; p.play(); });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <VideoView player={player} style={{ width: SW, height: SW * 0.62 }} resizeMode="contain" controls />
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
      colors={['rgba(123,63,242,0.35)', 'transparent']}
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

// ── TicketTiersGrid ───────────────────────────────────────────────────────────

interface TierItem {
  key: 'simple' | 'vip' | 'vvip' | 'vvvip';
  label: string; icon: string; color: string;
  price: number | null | undefined;
  sub?: string;
}

const TicketTiersGrid: React.FC<{
  tiers: TierItem[];
  selected: TierItem['key'];
  onSelect: (k: TierItem['key']) => void;
  colors: AppColors;
}> = ({ tiers, selected, onSelect, colors }) => {
  const visible = tiers.filter(t => typeof t.price === 'number' && t.price > 0);
  if (visible.length === 0) return null;

  const effectiveSelected = visible.find(t => t.key === selected) ? selected : visible[0].key;

  if (visible.length === 1) {
    const tier = visible[0];
    return (
      <Animated.View entering={FadeInDown.delay(220).springify()} style={{ marginBottom: 4 }}>
        <SectionHeader label="Billet" colors={colors} />
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: colors.backgroundSecondary,
          borderRadius: 14, borderWidth: 1.5, borderColor: tier.color + '40',
          paddingVertical: 14, paddingHorizontal: 16,
        }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: tier.color + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={tier.icon} size={18} color={tier.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{tier.label}</Text>
            {tier.sub && <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{tier.sub}</Text>}
          </View>
          <View style={{ backgroundColor: tier.color + '18', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: tier.color }}>{tier.price} €</Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(220).springify()} style={{ marginBottom: 4 }}>
      <SectionHeader label="Catégorie de billet" colors={colors} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {visible.map(tier => {
          const active = effectiveSelected === tier.key;
          return (
            <TouchableOpacity
              key={tier.key} onPress={() => onSelect(tier.key)} activeOpacity={0.8}
              style={{
                flex: visible.length <= 2 ? 1 : undefined,
                minWidth: (SW - 48) / 2 - 4,
                borderRadius: 14, borderWidth: 1.5,
                backgroundColor: active ? tier.color + '15' : colors.backgroundSecondary,
                borderColor: active ? tier.color : colors.border,
                padding: 14, gap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ width: 36, height: 36, borderRadius: 10,
                  backgroundColor: tier.color + (active ? '28' : '14'),
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={tier.icon} size={15} color={tier.color} />
                </View>
                {active && (
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: tier.color, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={11} color="#fff" />
                  </View>
                )}
              </View>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '800', color: active ? tier.color : colors.textSecondary, letterSpacing: 0.3 }}>
                  {tier.label}
                </Text>
                <Text style={{ fontSize: 17, fontWeight: '900', color: active ? tier.color : colors.textPrimary, marginTop: 2 }}>
                  {tier.price} €
                </Text>
                {tier.sub && <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>{tier.sub}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
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
  const [saved,        setSaved]        = useState(false);
  const [showVideo,    setShowVideo]    = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'simple' | 'vip' | 'vvip' | 'vvvip'>('simple');

  const heartScale = useSharedValue(1);
  const saveScale  = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const saveStyle  = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));

  const loadConcert = useCallback(async () => {
    try {
      const data = await concertService.getById(concertId);
      setConcert(data);
      favoriteService.check('concert', concertId).then(setSaved).catch(() => {});
      try {
        const user = await authService.getMe();
        setIsOwner(user?.id === data.artist?.id);
        const tickets = await concertService.getMyTickets();
        setIsRegistered((tickets as any[]).some((t: any) => t.concert_id === concertId));
      } catch { /**/ }
      try {
        const counts = await socialService.getReactionCounts({ concert_id: concertId });
        setLikeCount(counts.likes ?? 0);
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
        message: `${concert.title} — ${formatDateShort(concert.scheduled_at)} à ${concert.venue_city ?? 'FoliX'}\nVia FoliX` });
      socialService.share({ platform: 'native', concert_id: concertId }).catch(() => {});
    } catch { /**/ }
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

  const isLive     = concert.status === 'live';
  const isFree     = concert.access_type === 'free';
  const artistName = concert.artist?.display_name ?? concert.artist?.username;
  const hasVideo   = !!concert.video_url;

  const CONCERT_TYPE_LABEL: Record<string, string> = {
    live: 'Live uniquement', replay: 'Replay uniquement', live_replay: 'Live + Replay',
  };

  const allTiers = [
    { key: 'simple' as const, label: 'Simple', icon: 'tag',   color: colors.primary,  price: concert.ticket_price,       sub: 'Accès standard' },
    { key: 'vip'    as const, label: 'VIP',    icon: 'star',  color: '#F59E0B',        price: concert.ticket_price_vip,   sub: 'Accès prioritaire' },
    { key: 'vvip'   as const, label: 'VVIP',   icon: 'award', color: '#8B5CF6',        price: concert.ticket_price_vvip,  sub: 'Expérience premium' },
    { key: 'vvvip'  as const, label: 'VVVIP',  icon: 'zap',   color: '#EF4444',        price: concert.ticket_price_vvvip, sub: 'All-inclusive' },
  ].filter(t => typeof t.price === 'number' && t.price > 0);

  const activeTier = allTiers.find(t => t.key === selectedTier) ?? allTiers[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Bouton retour */}
      <TouchableOpacity onPress={onBack}
        style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36, left: 16, zIndex: 100,
          width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="arrow-left" size={20} color="#fff" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(300)}>
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
        </Animated.View>

        {showVideo && hasVideo && <VideoModal uri={concert.video_url!} onClose={() => setShowVideo(false)} />}

        {/* ── Bouton Regarder / Rejoindre ──────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(60).springify()}
          style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 }}>
          <TouchableOpacity onPress={() => {
            if (isLive) {
              nav.navigate(isOwner ? 'LiveStream' as any : 'LiveViewer' as any, { concertId });
            } else {
              Alert.alert('Replay', 'Le replay n\'est pas encore disponible.');
            }
          }} activeOpacity={0.88}>
            <LinearGradient
              colors={isLive ? ['#EF4444', '#DC2626'] : [colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 10, paddingVertical: 15, borderRadius: 16 }}>
              <Icon name={isLive ? 'radio' : 'play'} size={20} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }}>
                {isLive ? 'Regarder en direct' : 'Regarder le replay'}
              </Text>
              {isLive && (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>LIVE</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Date + Lieu résumé ────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).springify()}
          style={{ paddingHorizontal: 16, paddingTop: 18, flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary, borderRadius: 14,
            padding: 14, alignItems: 'center', gap: 4 }}>
            <Icon name="calendar" size={18} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}>
              {formatDateShort(concert.scheduled_at)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>{formatTime(concert.scheduled_at)}</Text>
          </View>
          {concert.venue_city && (
            <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary, borderRadius: 14,
              padding: 14, alignItems: 'center', gap: 4 }}>
              <Icon name="map-pin" size={18} color={colors.accentOrange} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }} numberOfLines={1}>
                {concert.venue_city}
              </Text>
              {concert.venue_country && (
                <Text style={{ fontSize: 11, color: colors.textTertiary }} numberOfLines={1}>{concert.venue_country}</Text>
              )}
            </View>
          )}
          {concert.duration_min && (
            <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary, borderRadius: 14,
              padding: 14, alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={18} color={colors.accentGreen} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>{concert.duration_min} min</Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>Durée</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Barre sociale ────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100).springify()}
          style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 16,
            backgroundColor: colors.backgroundSecondary, borderRadius: 18, overflow: 'hidden' }}>
          <TouchableOpacity style={ss.socialBtn} onPress={handleLike} activeOpacity={0.75}>
            <Animated.View style={heartStyle}>
              <Icon name="heart" size={18} color={liked ? '#F0365A' : colors.textTertiary} />
            </Animated.View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: liked ? '#F0365A' : colors.textTertiary }}>
              {likeCount > 0 ? likeCount.toLocaleString('fr') : 'J\'aime'}
            </Text>
          </TouchableOpacity>
          <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />
          <TouchableOpacity style={ss.socialBtn} onPress={() => setShowComments(true)} activeOpacity={0.75}>
            <Icon name="message-circle" size={18} color={colors.textTertiary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary }}>Commenter</Text>
          </TouchableOpacity>
          <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />
          <TouchableOpacity style={ss.socialBtn} onPress={handleNativeShare} activeOpacity={0.75}>
            <Icon name="share-2" size={18} color={colors.textTertiary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary }}>Partager</Text>
          </TouchableOpacity>
          <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />
          <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 12 }} onPress={handleSave} activeOpacity={0.75}>
            <Animated.View style={saveStyle}>
              <Icon name="bookmark" size={18} color={saved ? colors.primary : colors.textTertiary} />
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Description ──────────────────────────────────────────── */}
        {concert.description ? (
          <Animated.View entering={FadeInDown.delay(130).springify()}
            style={{ paddingHorizontal: 16, paddingTop: 22, gap: 8 }}>
            <SectionHeader label="À propos" colors={colors} />
            <ExpandableText
              text={concert.description} maxLines={4}
              textStyle={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}
              primaryColor={colors.primary}
            />
          </Animated.View>
        ) : null}

        {/* ── Infos détaillées ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(160).springify()}
          style={{ marginHorizontal: 16, marginTop: 22 }}>
          <SectionHeader label="Infos pratiques" colors={colors} />
          <View style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 16, overflow: 'hidden' }}>
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
          </View>
        </Animated.View>

        {/* ── Billets ───────────────────────────────────────────────── */}
        {!isFree && (
          <Animated.View entering={FadeInDown.delay(190).springify()}
            style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <TicketTiersGrid
              tiers={[
                { key: 'simple', label: 'Simple', icon: 'tag',   color: colors.primary, price: concert.ticket_price,       sub: 'Accès standard' },
                { key: 'vip',    label: 'VIP',    icon: 'star',  color: '#F59E0B',      price: concert.ticket_price_vip,   sub: 'Accès prioritaire' },
                { key: 'vvip',   label: 'VVIP',   icon: 'award', color: '#8B5CF6',      price: concert.ticket_price_vvip,  sub: 'Expérience premium' },
                { key: 'vvvip',  label: 'VVVIP',  icon: 'zap',   color: '#EF4444',      price: concert.ticket_price_vvvip, sub: 'All-inclusive' },
              ]}
              selected={selectedTier} onSelect={setSelectedTier} colors={colors}
            />
          </Animated.View>
        )}

      </ScrollView>

      {/* ── CTA flottant ─────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(50).springify()}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingHorizontal: 16, paddingTop: 12,
          paddingBottom: Platform.OS === 'ios' ? 34 : 16,
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }}>
        {isOwner ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(concert.status === 'published' || concert.status === 'live') && (
              <TouchableOpacity onPress={() => nav.navigate('LiveStream' as any, { concertId })}
                style={[ss.ctaSecondary, { flex: 1, backgroundColor: '#EF444414' }]}>
                <Icon name="radio" size={16} color="#EF4444" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                  {concert.status === 'live' ? 'Rejoindre' : 'Go Live'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleEdit}
              style={[ss.ctaSecondary, { flex: 1, backgroundColor: colors.primary + '14' }]}>
              <Icon name="edit-2" size={16} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete}
              style={[ss.ctaSecondary, { paddingHorizontal: 20, backgroundColor: colors.error + '14' }]}>
              <Icon name="trash-2" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={isRegistered ? undefined : () => setPaySheetOpen(true)}
            disabled={isRegistered} activeOpacity={isRegistered ? 1 : 0.85}>
            <LinearGradient
              colors={isRegistered ? ['#555', '#444'] : [colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={ss.ctaGradient}>
              <Icon name={isRegistered ? 'check' : isFree ? 'check-circle' : 'tag'} size={20} color="#fff" />
              <Text style={ss.ctaText}>
                {isRegistered ? 'Déjà inscrit'
                  : isFree ? 'S\'inscrire gratuitement'
                  : allTiers.length > 1 ? `Billet ${activeTier?.label ?? ''}`
                  : 'Acheter un billet'}
              </Text>
              {!isRegistered && !isFree && activeTier?.price != null && (
                <View style={{ marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>{activeTier.price} €</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Sheets */}
      <TicketPaymentSheet
        visible={paySheetOpen} onClose={() => setPaySheetOpen(false)}
        onSuccess={() => setIsRegistered(true)}
        itemId={concertId} title={concert.title}
        accessType={concert.access_type as any}
        ticketPrice={concert.ticket_price ?? null}
        thumbnail={concert.thumbnail_url ?? null}
        kind="concert" onBuy={() => concertService.buyTicket(concertId)}
      />
      <CommentsBottomSheet visible={showComments} onClose={() => setShowComments(false)} concertId={concertId} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  socialBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13 },
  ctaGradient: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20, borderRadius: 16 },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  ctaSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14 },
});
