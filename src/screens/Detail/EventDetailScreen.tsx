import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  FlatList, ActivityIndicator,
  Share, Alert, Platform, Linking,
  Modal, Dimensions, NativeScrollEvent, NativeSyntheticEvent, StatusBar, InteractionManager,
} from 'react-native';

const { width: SW } = Dimensions.get('window');
const HERO_H = SW * 0.72;

import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonDetail, CommentsBottomSheet, ExpandableText } from '../../components/common';
import { TicketPaymentSheet } from '../../components/wallet/TicketPaymentSheet';
import { eventService, socialService, authService } from '../../services';
import { favoriteService } from '../../services/favoriteService';
import type { Event } from '../../types/event';
import type { AppColors } from '../../theme/colors';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { StyleSheet } from 'react-native';

// ── Config ────────────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  concert:    { icon: 'music',    label: 'Concert',      color: '#7B3FF2' },
  birthday:   { icon: 'gift',     label: 'Anniversaire', color: '#E0389A' },
  festival:   { icon: 'star',     label: 'Festival',     color: '#FF7A2F' },
  conference: { icon: 'mic',      label: 'Conférence',   color: '#36D9A0' },
  sport:      { icon: 'activity', label: 'Sport',        color: '#3B82F6' },
  theater:    { icon: 'film',     label: 'Théâtre',      color: '#9B65F5' },
  exhibition: { icon: 'image',    label: 'Exposition',   color: '#36D9A0' },
  other:      { icon: 'calendar', label: 'Autre',        color: '#9390AB' },
};

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

// ── HeroCarousel ──────────────────────────────────────────────────────────────

const HeroCarousel: React.FC<{
  images: string[]; fallbackIcon: string; accent: string;
  title: string; eventType: string; isFree: boolean; isOnline: boolean;
  organizerName?: string; hasVideo: boolean; onVideoPress: () => void;
  colors: AppColors;
}> = ({ images, fallbackIcon, accent, title, eventType, isFree, isOnline,
        organizerName, hasVideo, onVideoPress, colors }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => {
      setActiveIdx(prev => {
        const next = (prev + 1) % images.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(t);
  }, [images.length]);

  return (
    <View style={{ width: SW, height: HERO_H }}>
      {images.length > 0 ? (
        <FlatList
          ref={flatRef} horizontal pagingEnabled data={images}
          keyExtractor={(u, i) => u + i}
          showsHorizontalScrollIndicator={false}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
            setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}
          scrollEventThrottle={16}
          renderItem={({ item: url }) => (
            <Image source={{ uri: url }} style={{ width: SW, height: HERO_H }} resizeMode="cover" />
          )}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundTertiary }}>
          <Icon name={fallbackIcon} size={72} color={colors.textTertiary} />
        </View>
      )}

      {/* Dégradé profond bas → titre */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.88)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: HERO_H * 0.7 }}
        pointerEvents="none"
      />

      {/* Badges haut */}
      <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36, left: 64, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <View style={{ backgroundColor: accent + 'EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 }}>{eventType.toUpperCase()}</Text>
        </View>
        {isFree && (
          <View style={{ backgroundColor: '#36D9A0EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 }}>GRATUIT</Text>
          </View>
        )}
        {isOnline && (
          <View style={{ backgroundColor: '#3B82F6EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 }}>EN LIGNE</Text>
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

      {/* Titre + organisateur en bas du hero */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 20, gap: 8 }}>
        <Text style={{ fontSize: 26, fontWeight: '900', color: '#fff', lineHeight: 32, letterSpacing: -0.3 }} numberOfLines={2}>
          {title}
        </Text>
        {organizerName && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LinearGradient colors={[accent, accent + '88']}
              style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>{getInitials(organizerName)}</Text>
            </LinearGradient>
            <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>{organizerName}</Text>
          </View>
        )}
        {images.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {images.map((_, i) => (
              <View key={i} style={{
                width: i === activeIdx ? 16 : 5, height: 4, borderRadius: 2,
                backgroundColor: i === activeIdx ? '#fff' : 'rgba(255,255,255,0.35)',
              }} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

// ── SectionHeader ─────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ label: string; colors: AppColors }> = ({ label, colors }) => (
  <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textTertiary, marginBottom: 10, textTransform: 'uppercase' }}>
    {label}
  </Text>
);

// ── InfoCard ──────────────────────────────────────────────────────────────────

interface InfoRowProps {
  icon: string; label: string; value: string;
  color: string; colors: AppColors;
  divider?: boolean; onPress?: () => void;
  rightBadge?: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, color, colors, divider, onPress, rightBadge }) => {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      {divider && <View style={{ position: 'absolute', top: 0, left: 16, right: 16, height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />}
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '15' }}>
        <Icon name={icon} size={17} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '500' }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: onPress ? color : colors.textPrimary, lineHeight: 18 }}>{value}</Text>
      </View>
      {rightBadge && (
        <View style={{ backgroundColor: color + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color }}>{rightBadge}</Text>
        </View>
      )}
      {onPress && <Icon name="chevron-right" size={15} color={color} />}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
};

// ── Ticket / fees ─────────────────────────────────────────────────────────────

const FEES_RATE = 0.10; // 10% frais de service

// ── TicketTiersGrid ───────────────────────────────────────────────────────────

interface TierItem {
  key: 'simple' | 'vip' | 'vvip' | 'vvvip';
  label: string; icon: string; color: string;
  price: number | null | undefined;
  sub?: string;
}

interface TicketTiersGridProps {
  tiers: TierItem[];
  selected: TierItem['key'];
  onSelect: (k: TierItem['key']) => void;
  colors: AppColors;
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

      {/* Icône */}
      <View style={{
        width: 44, height: 44, borderRadius: 13,
        backgroundColor: tier.color + (active ? '22' : '14'),
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
      }}>
        <Icon name={tier.icon} size={19} color={tier.color} />
      </View>

      {/* Label + description */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: active ? tier.color : colors.textPrimary, letterSpacing: 0.2 }}>
          {tier.label.toUpperCase()}
        </Text>
        {tier.sub && (
          <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '500' }}>{tier.sub}</Text>
        )}
      </View>

      {/* Prix + frais */}
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={{ fontSize: 17, fontWeight: '900', color: active ? tier.color : colors.textPrimary }}>
          {tier.price.toLocaleString('fr')} €
        </Text>
        <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '500' }}>
          + {fees.toLocaleString('fr')} frais
        </Text>
      </View>

      {/* Check actif */}
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

const TicketTiersGrid: React.FC<TicketTiersGridProps> = ({ tiers, selected, onSelect, colors }) => {
  const _p2 = (v: any) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
  const visible = tiers.map(t => ({ ...t, price: _p2(t.price) })).filter(t => t.price !== null) as (TierItem & { price: number })[];
  if (visible.length === 0) return null;

  const effectiveSelected = visible.find(t => t.key === selected) ? selected : visible[0].key;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
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

interface Props { eventId: string; onBack?: () => void; }

// ── EventDetailScreen ─────────────────────────────────────────────────────────

export const EventDetailScreen: React.FC<Props> = ({ eventId, onBack }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [event,        setEvent]        = useState<Event | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [isOwner,      setIsOwner]      = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const [saved,        setSaved]        = useState(false);
  const [reminded,     setReminded]     = useState(false);
  const [remindLoading,setRemindLoading]= useState(false);
  const [showVideo,    setShowVideo]    = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [ticketLoading,setTicketLoading]= useState(false);
  const [selectedTier, setSelectedTier] = useState<'simple' | 'vip' | 'vvip' | 'vvvip'>('simple');
  const [replayUrl,    setReplayUrl]    = useState<string | null>(null);

  const heartScale = useSharedValue(1);
  const saveScale  = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const saveStyle  = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));

  const loadEvent = useCallback(async () => {
    try {
      const data = await eventService.getById(eventId);
      setEvent(data);
      favoriteService.check('event', eventId).then(setSaved).catch(() => {});
      if (data.status === 'completed' && data.live_id) {
        try {
          const { apiClient } = require('../../api/client');
          const replay = await apiClient.get(`/api/v1/lives/${data.live_id}/replay`);
          setReplayUrl(replay?.replay_url ?? null);
        } catch { /**/ }
      }
      try {
        const user = await authService.getMe();
        setIsOwner(user?.id === data.organizer?.id);
        const tickets = await eventService.getMyTickets();
        setIsRegistered(!!(tickets as any[]).find((t: any) => t.event_id === eventId));
      } catch { /**/ }
      try {
        const counts = await socialService.getReactionCounts({ event_id: eventId });
        setLikeCount(counts.likes ?? 0);
        const myR = await socialService.getMyReaction({ event_id: eventId });
        setLiked(myR.reaction_type === 'like');
      } catch { /**/ }
      try {
        const r = await eventService.getRemindStatus(eventId);
        setReminded(r.active);
      } catch { /**/ }
    } catch { /**/ }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { loadEvent(); });
    return () => task.cancel();
  }, [loadEvent]);

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 5, stiffness: 300 }), withSpring(1, { damping: 10 }));
    const n = !liked;
    setLiked(n);
    setLikeCount(prev => n ? prev + 1 : Math.max(0, prev - 1));
    socialService.toggleReaction({ reaction_type: 'like', event_id: eventId }).catch(() => {
      setLiked(!n);
      setLikeCount(prev => n ? Math.max(0, prev - 1) : prev + 1);
    });
  };

  const handleSave = () => {
    saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    if (!event) return;
    const n = !saved;
    setSaved(n);
    if (n) {
      favoriteService.save({ target_type: 'event', target_id: eventId, target_title: event.title,
        target_subtitle: event.venue_city ?? undefined, target_thumbnail: event.thumbnail_url ?? undefined })
        .catch(() => setSaved(false));
    } else {
      favoriteService.unsave('event', eventId).catch(() => setSaved(true));
    }
  };

  const handleRemind = async () => {
    setRemindLoading(true);
    try {
      const r = await eventService.toggleRemind(eventId);
      setReminded(r.active);
    } catch { /**/ }
    finally { setRemindLoading(false); }
  };

  const handleNativeShare = async () => {
    if (!event) return;
    try {
      await Share.share({ title: event.title,
        message: `${event.title} — ${formatDateShort(event.starts_at)} à ${event.venue_city ?? 'FoliX'}\nVia FoliX` });
      socialService.share({ platform: 'native', event_id: eventId }).catch(() => {});
    } catch { /**/ }
  };

  const handleViewTicket = async () => {
    setTicketLoading(true);
    try {
      const tickets = await eventService.getMyTickets();
      const fresh = (tickets as any[]).find((t: any) => t.event_id === eventId);
      if (fresh) nav.navigate('MyTicket' as any, { ticket: fresh.event ? fresh : { ...fresh, event } });
    } catch { /**/ } finally { setTicketLoading(false); }
  };

  const handleBuyTicket = () => {
    if (!event) return;
    if (event.access_type === 'invite_only') {
      Alert.alert('Accès sur invitation', 'Contactez l\'organisateur pour obtenir une invitation.');
      return;
    }
    setPaySheetOpen(true);
  };

  const handleEdit   = () => nav.navigate('CreateEvent' as any, { eventId });
  const handleDelete = () => {
    Alert.alert('Supprimer', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await eventService.delete(eventId); onBack?.(); }
        catch (e: any) { Alert.alert('Erreur', e?.message ?? 'Impossible de supprimer.'); }
      }},
    ]);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><SkeletonDetail /></View>;

  if (!event) return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Icon name="alert-circle" size={48} color={colors.textTertiary} />
      <Text style={{ color: colors.textTertiary, fontSize: 15 }}>Événement introuvable</Text>
    </View>
  );

  const cfg          = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.other;
  const accent       = cfg.color;
  const isFree       = event.access_type === 'free';
  const isInviteOnly = event.access_type === 'invite_only';
  const organizerName = event.organizer?.display_name ?? event.organizer?.username;
  const hasVideo     = !!event.video_url;
  const galleryImages = (event.gallery_urls ?? []).length > 0
    ? event.gallery_urls!
    : [event.banner_url, event.thumbnail_url].filter(Boolean) as string[];
  const capacityPct = event.max_attendees && event.max_attendees > 0
    ? Math.min(event.current_attendees / event.max_attendees, 1) : 0;

  const _p = (v: any) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
  const allTiers = [
    { key: 'simple' as const, label: 'Simple', icon: 'tag',   color: accent,    price: _p(event.ticket_price),       sub: 'Accès standard' },
    { key: 'vip'    as const, label: 'VIP',    icon: 'star',  color: '#F59E0B', price: _p(event.ticket_price_vip),   sub: 'Accès prioritaire' },
    { key: 'vvip'   as const, label: 'VVIP',   icon: 'award', color: '#8B5CF6', price: _p(event.ticket_price_vvip),  sub: 'Expérience premium' },
    { key: 'vvvip'  as const, label: 'VVVIP',  icon: 'zap',   color: '#EF4444', price: _p(event.ticket_price_vvvip), sub: 'All-inclusive' },
  ].filter(t => t.price !== null) as { key: 'simple'|'vip'|'vvip'|'vvvip'; label: string; icon: string; color: string; price: number; sub: string }[];

  const activeTier = allTiers.find(t => t.key === selectedTier) ?? allTiers[0];

  const isCompleted  = event.status === 'completed';
  const isLiveNow    = event.is_online && !!event.live_id && !isCompleted;
  const hasReplay    = isCompleted && !!replayUrl;
  const isScheduled  = event.is_online && !!event.live_id && !isLiveNow && !isCompleted;

  const scheduledIn = (() => {
    if (!isScheduled) return null;
    const diff = new Date(event.starts_at).getTime() - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 24) return `dans ${Math.floor(h / 24)}j`;
    if (h > 0)  return `dans ${h}h${m > 0 ? `${m}m` : ''}`;
    return `dans ${m}min`;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Bouton retour flottant */}
      <TouchableOpacity onPress={onBack}
        style={ds.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="arrow-left" size={20} color="#fff" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <HeroCarousel
          images={galleryImages} fallbackIcon={cfg.icon} accent={accent}
          title={event.title} eventType={cfg.label}
          isFree={isFree} isOnline={!!event.is_online}
          organizerName={organizerName ?? undefined} hasVideo={hasVideo}
          onVideoPress={() => setShowVideo(true)}
          colors={colors}
        />

        {showVideo && hasVideo && <VideoModal uri={event.video_url!} onClose={() => setShowVideo(false)} />}

        {/* ── Live / Replay ────────────────────────────────────────── */}
        {(isLiveNow || isScheduled || hasReplay || (isCompleted && event.live_id && !hasReplay)) && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 10 }}>
            {isLiveNow && (
              <TouchableOpacity activeOpacity={0.88}
                onPress={() => nav.navigate('LiveViewer' as any, { liveId: event.live_id })}>
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
              <View style={[ds.infoBanner, { borderColor: accent + '55', backgroundColor: accent + '10' }]}>
                <Icon name="clock" size={20} color={accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: accent }}>Live programmé</Text>
                  {scheduledIn && <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Démarre {scheduledIn}</Text>}
                </View>
              </View>
            )}
            {hasReplay && (
              <TouchableOpacity activeOpacity={0.88}
                onPress={() => nav.navigate('VideoPlayer' as any, { url: replayUrl, title: event.title, thumbnailUrl: event.thumbnail_url ?? undefined })}>
                <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={ds.ctaGradient}>
                  <Icon name="play" size={20} color="#fff" />
                  <Text style={ds.ctaText}>Regarder le replay</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            {isCompleted && event.live_id && !hasReplay && (
              <View style={[ds.infoBanner, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="film" size={18} color={colors.textTertiary} />
                <Text style={{ fontSize: 14, color: colors.textTertiary }}>Replay non disponible</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Date pill + Rappel ───────────────────────────────────── */}
        <View style={ds.datePillRow}>
          <View style={[ds.datePill, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
            <Icon name="calendar" size={13} color={accent} />
            <View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: accent }}>
                {formatDate(event.starts_at)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                {formatTime(event.starts_at)}{event.ends_at ? ` – ${formatTime(event.ends_at)}` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleRemind} disabled={remindLoading}
            style={[ds.remindBtn, { backgroundColor: reminded ? accent + '15' : colors.backgroundSecondary, borderColor: reminded ? accent : colors.border }]}>
            {remindLoading ? <ActivityIndicator size="small" color={accent} /> : <Icon name="bell" size={14} color={reminded ? accent : colors.textTertiary} />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: reminded ? accent : colors.textTertiary }}>
              {reminded ? 'Rappel actif' : 'Me rappeler'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Barre sociale ────────────────────────────────────────── */}
        <View style={[ds.socialBar, { borderTopColor: colors.divider, borderBottomColor: colors.divider }]}>
          <TouchableOpacity style={ds.socialBtn} onPress={handleLike} activeOpacity={0.7}>
            <Animated.View style={heartStyle}>
              <Icon name="heart" size={20} color={liked ? '#F0365A' : colors.textTertiary} />
            </Animated.View>
            <Text style={[ds.socialBtnText, { color: liked ? '#F0365A' : colors.textTertiary, fontWeight: liked ? '700' : '500' }]}>
              {likeCount > 0 ? likeCount.toLocaleString('fr') : 'J\'aime'}
            </Text>
          </TouchableOpacity>
          <View style={[ds.socialSep, { backgroundColor: colors.divider }]} />
          <TouchableOpacity style={ds.socialBtn} onPress={() => setShowComments(true)} activeOpacity={0.7}>
            <Icon name="message-circle" size={20} color={colors.textTertiary} />
            <Text style={[ds.socialBtnText, { color: colors.textTertiary }]}>Commenter</Text>
          </TouchableOpacity>
          <View style={[ds.socialSep, { backgroundColor: colors.divider }]} />
          <TouchableOpacity style={ds.socialBtn} onPress={handleNativeShare} activeOpacity={0.7}>
            <Icon name="share-2" size={20} color={colors.textTertiary} />
            <Text style={[ds.socialBtnText, { color: colors.textTertiary }]}>Partager</Text>
          </TouchableOpacity>
          <View style={[ds.socialSep, { backgroundColor: colors.divider }]} />
          <TouchableOpacity style={[ds.socialBtn, { flex: 0, paddingHorizontal: 18 }]} onPress={handleSave} activeOpacity={0.7}>
            <Animated.View style={saveStyle}>
              <Icon name="bookmark" size={20} color={saved ? accent : colors.textTertiary} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* ── À propos ─────────────────────────────────────────────── */}
        {event.description ? (
          <View style={ds.section}>
            <SectionHeader label="À propos" colors={colors} />
            <ExpandableText text={event.description} maxLines={4}
              textStyle={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}
              primaryColor={accent} />
          </View>
        ) : null}

        {/* ── Infos pratiques ──────────────────────────────────────── */}
        <View style={ds.section}>
          <SectionHeader label="Infos pratiques" colors={colors} />
          <View style={[ds.infoCard, { backgroundColor: colors.backgroundSecondary }]}>
            <InfoRow icon="calendar" label="Date de début" value={formatDate(event.starts_at)} color={accent} colors={colors} />
            {event.ends_at && (
              <InfoRow icon="clock" label="Date de fin" value={formatDate(event.ends_at)} color={colors.textTertiary} colors={colors} divider />
            )}
            <InfoRow
              icon={event.is_online ? 'wifi' : 'map-pin'} label="Lieu"
              value={event.is_online ? (event.online_url ?? 'En ligne') : [event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', ')}
              color={colors.accentOrange} colors={colors} divider
              onPress={!event.is_online && event.venue_city ? () => {
                const q = encodeURIComponent([event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', '));
                const url = Platform.OS === 'ios' ? `maps:?q=${q}` : `geo:0,0?q=${q}`;
                Linking.canOpenURL(url).then(ok => Linking.openURL(ok ? url : `https://www.google.com/maps/search/?api=1&query=${q}`));
              } : undefined}
            />
            {isInviteOnly && (
              <InfoRow icon="lock" label="Accès" value="Sur invitation uniquement" color={colors.warning} colors={colors} divider />
            )}
          </View>
        </View>

        {/* ── Billets ───────────────────────────────────────────────── */}
        {!isFree && !isInviteOnly && (
          <View style={ds.section}>
            <TicketTiersGrid
              tiers={[
                { key: 'simple', label: 'Simple', icon: 'tag',   color: accent,    price: _p(event.ticket_price),       sub: 'Accès standard' },
                { key: 'vip',    label: 'VIP',    icon: 'star',  color: '#F59E0B', price: _p(event.ticket_price_vip),   sub: 'Accès prioritaire' },
                { key: 'vvip',   label: 'VVIP',   icon: 'award', color: '#8B5CF6', price: _p(event.ticket_price_vvip),  sub: 'Expérience premium' },
                { key: 'vvvip',  label: 'VVVIP',  icon: 'zap',   color: '#EF4444', price: _p(event.ticket_price_vvvip), sub: 'All-inclusive' },
              ]}
              selected={selectedTier} onSelect={setSelectedTier} colors={colors}
            />
          </View>
        )}

        {/* ── Capacité ─────────────────────────────────────────────── */}
        {event.max_attendees != null && event.max_attendees > 0 && (
          <View style={ds.section}>
            <SectionHeader label="Places disponibles" colors={colors} />
            <View style={[ds.infoCard, { backgroundColor: colors.backgroundSecondary, padding: 16, gap: 12 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="users" size={14} color={accent} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                    {event.current_attendees.toLocaleString('fr')} inscrits
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTertiary }}>
                  sur {event.max_attendees.toLocaleString('fr')} places
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.backgroundTertiary, overflow: 'hidden' }}>
                <View style={{ height: '100%', borderRadius: 3, width: `${capacityPct * 100}%`, backgroundColor: accent }} />
              </View>
              <Text style={{ fontSize: 12, color: capacityPct > 0.9 ? colors.error : colors.textTertiary, fontWeight: '600' }}>
                {capacityPct >= 1 ? 'Complet' : `${Math.round((1 - capacityPct) * event.max_attendees)} place${(1 - capacityPct) * event.max_attendees > 1 ? 's' : ''} restante${(1 - capacityPct) * event.max_attendees > 1 ? 's' : ''}`}
              </Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── CTA flottant ─────────────────────────────────────────────── */}
      <View style={[ds.ctaBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
        {isOwner ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => nav.navigate('Attendees' as any, { eventId, eventTitle: event.title })}
              style={[ds.ctaSecondary, { flex: 1, backgroundColor: '#10B98114' }]}>
              <Icon name="users" size={16} color="#10B981" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>
                Inscrits{event.current_attendees > 0 ? ` (${event.current_attendees})` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleEdit}
              style={[ds.ctaSecondary, { paddingHorizontal: 18, backgroundColor: colors.primary + '14' }]}>
              <Icon name="edit-2" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete}
              style={[ds.ctaSecondary, { paddingHorizontal: 18, backgroundColor: colors.error + '14' }]}>
              <Icon name="trash-2" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        ) : isRegistered ? (
          <TouchableOpacity onPress={handleViewTicket} disabled={ticketLoading} activeOpacity={0.85}>
            <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ds.ctaGradient}>
              {ticketLoading ? <ActivityIndicator color="#fff" /> : <Icon name="credit-card" size={20} color="#fff" />}
              <Text style={ds.ctaText}>Voir mon billet</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleBuyTicket} activeOpacity={0.85}>
            <LinearGradient colors={[accent, accent + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ds.ctaGradient}>
              <Icon name={isFree ? 'check-circle' : isInviteOnly ? 'lock' : 'tag'} size={20} color="#fff" />
              <Text style={ds.ctaText}>
                {isFree ? 'S\'inscrire gratuitement' : isInviteOnly ? 'Accès sur invitation'
                  : allTiers.length > 1 ? `Billet ${activeTier?.label ?? ''}` : 'Acheter un billet'}
              </Text>
              {!isFree && !isInviteOnly && activeTier?.price != null && (
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
      {event && (
        <TicketPaymentSheet
          visible={paySheetOpen} onClose={() => setPaySheetOpen(false)}
          onSuccess={(ticket) => {
            setIsRegistered(true);
            if (ticket) nav.navigate('MyTicket' as any, { ticket: ticket.event ? ticket : { ...ticket, event } });
          }}
          itemId={eventId} title={event.title}
          accessType={event.access_type as any}
          ticketPrice={event.ticket_price ?? null}
          thumbnail={event.thumbnail_url ?? null}
          kind="event"
          tiers={allTiers}
          selectedTierKey={selectedTier}
          onBuy={(tierKey) => eventService.buyTicket(eventId, tierKey)}
        />
      )}
      <CommentsBottomSheet visible={showComments} onClose={() => setShowComments(false)} eventId={eventId} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const ds = StyleSheet.create({
  // Back button
  backBtn: {
    position: 'absolute', zIndex: 10,
    top: Platform.OS === 'ios' ? 52 : 36, left: 16,
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  // CTA bar (floating bottom)
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

  // Social bar (like / comment / share / save)
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

  // Section wrapper
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },

  // Info card (rounded container)
  infoCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },

  // Date pill row
  datePillRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
    gap: 10,
  },
  datePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  remindBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
  },

  // Info banner (scheduled / completed without replay)
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
  },
});
