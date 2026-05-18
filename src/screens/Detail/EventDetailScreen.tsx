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

// ── SocialBar ─────────────────────────────────────────────────────────────────

interface SocialBarProps {
  liked: boolean; likeCount: number; saved: boolean;
  onLike: () => void; onComment: () => void; onShare: () => void; onSave: () => void;
  heartStyle: any; saveStyle: any; colors: AppColors;
}

const SocialBar: React.FC<SocialBarProps> = ({
  liked, likeCount, saved, onLike, onComment, onShare, onSave,
  heartStyle, saveStyle, colors,
}) => (
  <View style={{ flexDirection: 'row', marginHorizontal: 16,
    backgroundColor: colors.backgroundSecondary, borderRadius: 18, overflow: 'hidden' }}>
    <TouchableOpacity style={ss.socialBtn} onPress={onLike} activeOpacity={0.75}>
      <Animated.View style={heartStyle}>
        <Icon name="heart" size={18} color={liked ? '#F0365A' : colors.textTertiary} />
      </Animated.View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: liked ? '#F0365A' : colors.textTertiary }}>
        {likeCount > 0 ? likeCount.toLocaleString('fr') : 'J\'aime'}
      </Text>
    </TouchableOpacity>

    <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />

    <TouchableOpacity style={ss.socialBtn} onPress={onComment} activeOpacity={0.75}>
      <Icon name="message-circle" size={18} color={colors.textTertiary} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary }}>Commenter</Text>
    </TouchableOpacity>

    <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />

    <TouchableOpacity style={ss.socialBtn} onPress={onShare} activeOpacity={0.75}>
      <Icon name="share-2" size={18} color={colors.textTertiary} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary }}>Partager</Text>
    </TouchableOpacity>

    <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />

    <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 12 }} onPress={onSave} activeOpacity={0.75}>
      <Animated.View style={saveStyle}>
        <Icon name="bookmark" size={18} color={saved ? '#7B3FF2' : colors.textTertiary} />
      </Animated.View>
    </TouchableOpacity>
  </View>
);

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

const TicketTiersGrid: React.FC<TicketTiersGridProps> = ({ tiers, selected, onSelect, colors }) => {
  const visible = tiers.filter(t => typeof t.price === 'number' && t.price > 0);
  if (visible.length === 0) return null;

  const effectiveSelected = visible.find(t => t.key === selected) ? selected : visible[0].key;

  if (visible.length === 1) {
    const tier = visible[0];
    return (
      <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginHorizontal: 16, marginBottom: 4 }}>
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
    <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginHorizontal: 16, marginBottom: 4 }}>
      <SectionHeader label="Catégorie de billet" colors={colors} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {visible.map(tier => {
          const active = effectiveSelected === tier.key;
          return (
            <TouchableOpacity
              key={tier.key}
              onPress={() => onSelect(tier.key)}
              activeOpacity={0.8}
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

  const heartScale = useSharedValue(1);
  const saveScale  = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const saveStyle  = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));

  const loadEvent = useCallback(async () => {
    try {
      const data = await eventService.getById(eventId);
      setEvent(data);
      favoriteService.check('event', eventId).then(setSaved).catch(() => {});
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

  const allTiers = [
    { key: 'simple' as const, label: 'Simple', icon: 'tag',   color: accent,     price: event.ticket_price,         sub: 'Accès standard' },
    { key: 'vip'    as const, label: 'VIP',    icon: 'star',  color: '#F59E0B',  price: event.ticket_price_vip,     sub: 'Accès prioritaire' },
    { key: 'vvip'   as const, label: 'VVIP',   icon: 'award', color: '#8B5CF6',  price: event.ticket_price_vvip,    sub: 'Expérience premium' },
    { key: 'vvvip'  as const, label: 'VVVIP',  icon: 'zap',   color: '#EF4444',  price: event.ticket_price_vvvip,   sub: 'All-inclusive' },
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
          <HeroCarousel
            images={galleryImages} fallbackIcon={cfg.icon} accent={accent}
            title={event.title} eventType={cfg.label}
            isFree={isFree} isOnline={!!event.is_online}
            organizerName={organizerName ?? undefined} hasVideo={hasVideo}
            onVideoPress={() => setShowVideo(true)}
            colors={colors}
          />
        </Animated.View>

        {showVideo && hasVideo && <VideoModal uri={event.video_url!} onClose={() => setShowVideo(false)} />}

        {/* ── Date + Actions rapides ───────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(60).springify()}
          style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: accent }}>
              {formatDate(event.starts_at)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary }}>
              {formatTime(event.starts_at)}{event.ends_at ? ` – ${formatTime(event.ends_at)}` : ''}
            </Text>
          </View>
          {/* Bouton rappel */}
          <TouchableOpacity onPress={handleRemind} disabled={remindLoading}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: reminded ? accent + '18' : colors.backgroundSecondary,
              borderWidth: 1, borderColor: reminded ? accent : colors.border,
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}>
            {remindLoading
              ? <ActivityIndicator size="small" color={accent} />
              : <Icon name="bell" size={14} color={reminded ? accent : colors.textTertiary} />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: reminded ? accent : colors.textTertiary }}>
              {reminded ? 'Rappel actif' : 'Me rappeler'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Barre sociale ────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(90).springify()}>
          <SocialBar
            liked={liked} likeCount={likeCount} saved={saved}
            onLike={handleLike} onComment={() => setShowComments(true)}
            onShare={handleNativeShare} onSave={handleSave}
            heartStyle={heartStyle} saveStyle={saveStyle} colors={colors}
          />
        </Animated.View>

        {/* ── Description ──────────────────────────────────────────── */}
        {event.description ? (
          <Animated.View entering={FadeInDown.delay(120).springify()}
            style={{ paddingHorizontal: 16, paddingTop: 22, gap: 8 }}>
            <SectionHeader label="À propos" colors={colors} />
            <ExpandableText
              text={event.description} maxLines={4}
              textStyle={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}
              primaryColor={accent}
            />
          </Animated.View>
        ) : null}

        {/* ── Infos pratiques ──────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(150).springify()}
          style={{ marginHorizontal: 16, marginTop: 22 }}>
          <SectionHeader label="Infos pratiques" colors={colors} />
          <View style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 16, overflow: 'hidden' }}>
            <InfoRow icon="calendar" label="Date de début" value={formatDate(event.starts_at)}
              color={accent} colors={colors} />
            {event.ends_at && (
              <InfoRow icon="clock" label="Date de fin" value={formatDate(event.ends_at)}
                color={colors.textTertiary} colors={colors} divider />
            )}
            <InfoRow
              icon={event.is_online ? 'wifi' : 'map-pin'} label="Lieu"
              value={event.is_online
                ? (event.online_url ?? 'En ligne')
                : [event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', ')}
              color={colors.accentOrange} colors={colors} divider
              onPress={!event.is_online && event.venue_city ? () => {
                const q = encodeURIComponent([event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', '));
                const url = Platform.OS === 'ios' ? `maps:?q=${q}` : `geo:0,0?q=${q}`;
                Linking.canOpenURL(url).then(ok =>
                  Linking.openURL(ok ? url : `https://www.google.com/maps/search/?api=1&query=${q}`));
              } : undefined}
            />
            {isInviteOnly && (
              <InfoRow icon="lock" label="Accès" value="Sur invitation uniquement"
                color={colors.warning} colors={colors} divider />
            )}
          </View>
        </Animated.View>

        {/* ── Billets ───────────────────────────────────────────────── */}
        {!isFree && !isInviteOnly && (
          <Animated.View entering={FadeInDown.delay(180).springify()}
            style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <TicketTiersGrid
              tiers={[
                { key: 'simple', label: 'Simple', icon: 'tag',   color: accent,    price: event.ticket_price,       sub: 'Accès standard' },
                { key: 'vip',    label: 'VIP',    icon: 'star',  color: '#F59E0B', price: event.ticket_price_vip,   sub: 'Accès prioritaire' },
                { key: 'vvip',   label: 'VVIP',   icon: 'award', color: '#8B5CF6', price: event.ticket_price_vvip,  sub: 'Expérience premium' },
                { key: 'vvvip',  label: 'VVVIP',  icon: 'zap',   color: '#EF4444', price: event.ticket_price_vvvip, sub: 'All-inclusive' },
              ]}
              selected={selectedTier} onSelect={setSelectedTier} colors={colors}
            />
          </Animated.View>
        )}

        {/* ── Capacité ─────────────────────────────────────────────── */}
        {event.max_attendees != null && event.max_attendees > 0 && (
          <Animated.View entering={FadeInDown.delay(210).springify()}
            style={{ marginHorizontal: 16, marginTop: 22 }}>
            <SectionHeader label="Places disponibles" colors={colors} />
            <View style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 16, padding: 16, gap: 12 }}>
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
            <TouchableOpacity
              onPress={() => nav.navigate('Attendees' as any, { eventId, eventTitle: event.title })}
              style={[ss.ctaSecondary, { flex: 1, backgroundColor: '#10B98114' }]}>
              <Icon name="users" size={16} color="#10B981" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>
                Inscrits{event.current_attendees > 0 ? ` (${event.current_attendees})` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleEdit}
              style={[ss.ctaSecondary, { paddingHorizontal: 18, backgroundColor: colors.primary + '14' }]}>
              <Icon name="edit-2" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete}
              style={[ss.ctaSecondary, { paddingHorizontal: 18, backgroundColor: colors.error + '14' }]}>
              <Icon name="trash-2" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        ) : isRegistered ? (
          <TouchableOpacity onPress={handleViewTicket} disabled={ticketLoading} activeOpacity={0.85}>
            <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={ss.ctaGradient}>
              {ticketLoading ? <ActivityIndicator color="#fff" /> : <Icon name="credit-card" size={20} color="#fff" />}
              <Text style={ss.ctaText}>Voir mon billet</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleBuyTicket} activeOpacity={0.85}>
            <LinearGradient colors={[accent, accent + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={ss.ctaGradient}>
              <Icon name={isFree ? 'check-circle' : isInviteOnly ? 'lock' : 'tag'} size={20} color="#fff" />
              <Text style={ss.ctaText}>
                {isFree ? 'S\'inscrire gratuitement' : isInviteOnly ? 'Accès sur invitation'
                  : allTiers.length > 1 ? `Billet ${activeTier?.label ?? ''}` : 'Acheter un billet'}
              </Text>
              {!isFree && !isInviteOnly && activeTier?.price != null && (
                <View style={{ marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>{activeTier.price} €</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </Animated.View>

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
          kind="event" onBuy={() => eventService.buyTicket(eventId)}
        />
      )}
      <CommentsBottomSheet visible={showComments} onClose={() => setShowComments(false)} eventId={eventId} />
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
