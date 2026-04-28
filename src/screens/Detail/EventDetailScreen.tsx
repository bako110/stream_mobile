import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  FlatList, TextInput, ActivityIndicator,
  Share, Alert, KeyboardAvoidingView, Platform, Linking,
  Modal, Dimensions, NativeScrollEvent, NativeSyntheticEvent, StatusBar, InteractionManager,
} from 'react-native';

const { width: SW } = Dimensions.get('window');
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence, runOnJS,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonDetail } from '../../components/common';
import { eventService, socialService, saveService, authService } from '../../services';
import type { Event } from '../../types/event';
import type { Comment } from '../../types/reel';
import type { AppColors } from '../../theme/colors';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainNavigator';

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

const SOCIAL_NETWORKS = [
  { key: 'facebook',  label: 'Facebook',   icon: 'facebook',       color: '#1877F2', buildUrl: (_t: string, u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: 'twitter',   label: 'X',          icon: 'twitter',        color: '#000',    buildUrl: (t: string, u: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: 'whatsapp',  label: 'WhatsApp',   icon: 'message-circle', color: '#25D366', buildUrl: (t: string, u: string) => `whatsapp://send?text=${encodeURIComponent(`${t}\n${u}`)}` },
  { key: 'tiktok',    label: 'TikTok',     icon: 'music',          color: '#010101', buildUrl: (_t: string, u: string) => `https://www.tiktok.com/share?url=${encodeURIComponent(u)}` },
  { key: 'instagram', label: 'Instagram',  icon: 'instagram',      color: '#E1306C', buildUrl: () => 'instagram://app' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const getInitials = (name?: string | null) =>
  name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ── VideoModal — player plein écran ouvert depuis le bouton vidéo ─────────────

const VideoModal: React.FC<{ uri: string; onClose: () => void }> = ({ uri, onClose }) => {
  const player = useVideoPlayer({ uri }, p => {
    p.muted = false;
    p.play();
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <VideoView
          player={player}
          style={{ width: SW, height: SW * 0.62 }}
          resizeMode="contain"
          controls
        />
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

// ── BannerCarousel ────────────────────────────────────────────────────────────

const BannerCarousel: React.FC<{ images: string[]; fallbackIcon: string; accent: string; colors: AppColors }> =
  ({ images, fallbackIcon, accent, colors }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const H = SW * 0.62;

  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => {
      setActiveIdx(prev => {
        const next = (prev + 1) % images.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(t);
  }, [images.length]);

  return (
    <View style={{ width: SW, height: H }}>
      <Modal visible={lightboxOpen} transparent animationType="fade" onRequestClose={() => setLightboxOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
          <FlatList
            horizontal pagingEnabled data={images}
            initialScrollIndex={lightboxIdx}
            getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
            keyExtractor={(u, i) => u + i}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item: url }) => (
              <Image source={{ uri: url }} style={{ width: SW, height: '100%' }} resizeMode="contain" />
            )}
          />
          <TouchableOpacity onPress={() => setLightboxOpen(false)}
            style={{ position: 'absolute', top: 52, right: 20, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
            <Icon name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {images.length > 0 ? (
        <FlatList
          ref={flatRef} horizontal pagingEnabled data={images}
          keyExtractor={(u, i) => u + i}
          showsHorizontalScrollIndicator={false}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
            setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}
          scrollEventThrottle={16}
          renderItem={({ item: url, index }) => (
            <TouchableOpacity activeOpacity={0.95} onPress={() => { setLightboxIdx(index); setLightboxOpen(true); }}>
              <Image source={{ uri: url }} style={{ width: SW, height: H }} resizeMode="cover" />
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary }}>
          <Icon name={fallbackIcon} size={56} color={colors.textTertiary} />
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.7)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.5 }}
        pointerEvents="none"
      />

      {images.length > 1 && (
        <View style={{ position: 'absolute', bottom: 52, alignSelf: 'center', flexDirection: 'row', gap: 5 }}>
          {images.map((_, i) => (
            <View key={i} style={{
              width: i === activeIdx ? 18 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === activeIdx ? accent : 'rgba(255,255,255,0.4)',
            }} />
          ))}
        </View>
      )}
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
  const [buyLoading,   setBuyLoading]   = useState(false);
  const [isOwner,      setIsOwner]      = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(0);
  const [saved,        setSaved]        = useState(false);
  const [showVideo,      setShowVideo]      = useState(false);
  const [showComments,   setShowComments]   = useState(false);
  const [comments,       setComments]       = useState<Comment[]>([]);
  const [commentText,    setCommentText]    = useState('');
  const [sendingCmt,     setSendingCmt]     = useState(false);
  const [loadingCmts,    setLoadingCmts]    = useState(false);
  const [reminded,       setReminded]       = useState(false);
  const [remindLoading,  setRemindLoading]  = useState(false);
  const [hidden,         setHidden]         = useState(false);

  const heartScale = useSharedValue(1);
  const saveScale  = useSharedValue(1);
  const sheetY     = useSharedValue(800);

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const saveStyle  = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));

  const loadEvent = useCallback(async () => {
    try {
      const data = await eventService.getById(eventId);
      setEvent(data);
      setSaved(saveService.isEventSaved(eventId));
      try {
        const user = await authService.getMe();
        setIsOwner(user?.id === data.organizer?.id);
        const tickets = await eventService.getMyTickets();
        setIsRegistered(tickets.some((t: any) => t.event_id === eventId));
      } catch { /**/ }
      try {
        const counts = await socialService.getReactionCounts({ event_id: eventId });
        setLikeCount(counts.likes ?? 0);
        const myR = await socialService.getMyReaction({ event_id: eventId });
        setLiked(myR.reaction_type === 'like');
      } catch { /**/ }
    } catch { /**/ }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { loadEvent(); });
    return () => task.cancel();
  }, [loadEvent]);

  const openComments = async () => {
    setShowComments(true);
    sheetY.value = withSpring(0, { damping: 20, stiffness: 200 });
    setLoadingCmts(true);
    try { setComments(await socialService.getComments({ event_id: eventId })); } catch { /**/ }
    finally { setLoadingCmts(false); }
  };

  const closeComments = () => {
    sheetY.value = withSpring(800, { damping: 20 }, () => runOnJS(setShowComments)(false));
    setCommentText('');
  };

  const sendComment = async () => {
    if (!commentText.trim()) return;
    setSendingCmt(true);
    try {
      const created = await socialService.createComment({ body: commentText.trim(), event_id: eventId });
      setComments(prev => [created, ...prev]);
      setCommentText('');
    } catch { /**/ }
    finally { setSendingCmt(false); }
  };

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 5, stiffness: 300 }), withSpring(1, { damping: 10 }));
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
    socialService.toggleReaction({ reaction_type: 'like', event_id: eventId }).catch(() => {
      setLiked(!newLiked);
      setLikeCount(prev => newLiked ? Math.max(0, prev - 1) : prev + 1);
    });
  };

  const handleSave = () => {
    saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    if (!event) return;
    const newSaved = !saved;
    setSaved(newSaved);
    newSaved ? saveService.saveEvent(event) : saveService.unsaveEvent(eventId);
  };

  const shareText = event
    ? `🎪 ${event.title} — ${formatDateShort(event.starts_at)} à ${event.venue_city ?? 'FoliX'}\nVia FoliX`
    : 'Découvre cet événement sur FoliX';
  const shareUrl = `https://folix.app/events/${eventId}`;

  const handleNativeShare = async () => {
    try {
      await Share.share({ title: event?.title ?? 'Événement FoliX', message: shareText });
      socialService.share({ platform: 'native', event_id: eventId }).catch(() => {});
    } catch { /**/ }
  };

  const handleSocialShare = async (net: typeof SOCIAL_NETWORKS[0]) => {
    const url = net.buildUrl(shareText, shareUrl);
    try {
      const canOpen = await Linking.canOpenURL(url);
      canOpen ? await Linking.openURL(url) : await handleNativeShare();
      socialService.share({ platform: net.key, event_id: eventId }).catch(() => {});
    } catch { Alert.alert('Partage', 'Impossible d\'ouvrir cette application.'); }
  };

  const handleBuyTicket = async () => {
    if (!event) return;
    if (event.access_type === 'invite_only') {
      Alert.alert('Accès sur invitation', 'Contactez l\'organisateur pour obtenir une invitation.');
      return;
    }
    const isFreeEv = event.access_type === 'free';
    Alert.alert(
      isFreeEv ? 'S\'inscrire' : 'Acheter un billet',
      isFreeEv ? `Confirmer votre inscription à\n${event.title} ?` : `${event.title}\nPrix : ${event.ticket_price ?? '—'} €`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: async () => {
          setBuyLoading(true);
          try {
            await eventService.buyTicket(eventId);
            setIsRegistered(true);
            Alert.alert(isFreeEv ? 'Inscription confirmée !' : 'Billet confirmé !', 'Retrouvez-le dans votre profil.');
          } catch (e: any) {
            const msg = e?.message ?? '';
            if (msg.includes('déjà inscrit')) { setIsRegistered(true); Alert.alert('Déjà inscrit', 'Vous participez déjà.'); }
            else Alert.alert('Erreur', msg || 'Impossible de finaliser l\'inscription.');
          } finally { setBuyLoading(false); }
        }},
      ],
    );
  };

  const handleEdit   = () => nav.navigate('CreateEvent' as any, { eventId });
  const handleDelete = () => {
    Alert.alert('Supprimer l\'événement', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await eventService.delete(eventId); Alert.alert('Supprimé'); onBack?.(); }
        catch (e: any) { Alert.alert('Erreur', e?.message ?? 'Impossible de supprimer.'); }
      }},
    ]);
  };

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SkeletonDetail />
    </View>
  );

  if (!event) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Icon name="alert-circle" size={48} color={colors.textTertiary} />
        <Text style={{ color: colors.textTertiary }}>Événement introuvable</Text>
      </View>
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Bouton retour flottant */}
      <TouchableOpacity
        onPress={onBack}
        style={{
          position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36,
          left: 16, zIndex: 100,
          width: 38, height: 38, borderRadius: 19,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name="arrow-left" size={20} color="#fff" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── Hero : toujours les photos ───────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(250)}>
          <BannerCarousel images={galleryImages} fallbackIcon={cfg.icon} accent={accent} colors={colors} />

          {/* Badges */}
          <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36, left: 64, flexDirection: 'row', gap: 6 }}>
            <View style={{ backgroundColor: accent + 'EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 }}>{cfg.label.toUpperCase()}</Text>
            </View>
            {isFree && (
              <View style={{ backgroundColor: '#36D9A0EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 }}>GRATUIT</Text>
              </View>
            )}
            {event.is_online && (
              <View style={{ backgroundColor: '#3B82F6EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 }}>EN LIGNE</Text>
              </View>
            )}
          </View>

          {/* Bouton vidéo pub */}
          {hasVideo && (
            <TouchableOpacity
              onPress={() => setShowVideo(true)}
              style={{ position: 'absolute', bottom: 56, right: 16,
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: 'rgba(0,0,0,0.65)',
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}>
              <Icon name="play-circle" size={16} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Vidéo pub</Text>
            </TouchableOpacity>
          )}

          {/* Organisateur */}
          {organizerName && (
            <View style={{ position: 'absolute', bottom: 14, left: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]}
                style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{getInitials(organizerName)}</Text>
              </LinearGradient>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{organizerName}</Text>
            </View>
          )}
        </Animated.View>

        {/* Modal vidéo pub */}
        {showVideo && hasVideo && (
          <VideoModal uri={event.video_url!} onClose={() => setShowVideo(false)} />
        )}

        {/* ── Titre + date + prix ──────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).springify()}
          style={{ paddingHorizontal: 16, paddingTop: 18, gap: 10 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, lineHeight: 30 }}>
            {event.title}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: accent + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
              <Icon name="calendar" size={11} color={accent} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{formatDateShort(event.starts_at)}</Text>
            </View>
            {!isFree && event.ticket_price != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: colors.primary + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Icon name="tag" size={11} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{event.ticket_price} €</Text>
              </View>
            )}
            {isInviteOnly && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: colors.warning + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Icon name="lock" size={11} color={colors.warning} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.warning }}>Sur invitation</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* ── Barre sociale ────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(110).springify()}
          style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 16,
            backgroundColor: colors.backgroundSecondary, borderRadius: 16, overflow: 'hidden' }}>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 5, paddingVertical: 12 }} onPress={handleLike} activeOpacity={0.8}>
            <Animated.View style={heartStyle}>
              <Icon name="heart" size={17} color={liked ? colors.error : colors.textTertiary} />
            </Animated.View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: liked ? colors.error : colors.textTertiary }}>
              {likeCount > 0 ? likeCount.toLocaleString('fr') : 'J\'aime'}
            </Text>
          </TouchableOpacity>

          <View style={{ width: 1, backgroundColor: colors.divider }} />

          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 5, paddingVertical: 12 }} onPress={openComments} activeOpacity={0.8}>
            <Icon name="message-circle" size={17} color={colors.textTertiary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary }}>Commenter</Text>
          </TouchableOpacity>

          <View style={{ width: 1, backgroundColor: colors.divider }} />

          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 5, paddingVertical: 12 }} onPress={handleNativeShare} activeOpacity={0.8}>
            <Icon name="share-2" size={17} color={colors.textTertiary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary }}>Partager</Text>
          </TouchableOpacity>

          <View style={{ width: 1, backgroundColor: colors.divider }} />

          <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 12 }} onPress={handleSave} activeOpacity={0.8}>
            <Animated.View style={saveStyle}>
              <Icon name="bookmark" size={17} color={saved ? colors.primary : colors.textTertiary} />
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Description ──────────────────────────────────────────────── */}
        {event.description ? (
          <Animated.View entering={FadeInDown.delay(140).springify()}
            style={{ paddingHorizontal: 16, paddingTop: 20, gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.textTertiary }}>À PROPOS</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}>{event.description}</Text>
          </Animated.View>
        ) : null}

        {/* ── Infos clés (card) ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(170).springify()}
          style={{ marginHorizontal: 16, marginTop: 20,
            backgroundColor: colors.backgroundSecondary, borderRadius: 16, overflow: 'hidden' }}>
          <InfoRow icon="calendar" label="Début" value={formatDate(event.starts_at)} color={accent} colors={colors} />
          {event.ends_at && <InfoRow icon="clock" label="Fin" value={formatDate(event.ends_at)} color={colors.textTertiary} colors={colors} divider />}
          <InfoRow
            icon={event.is_online ? 'wifi' : 'map-pin'}
            label="Lieu"
            value={event.is_online
              ? (event.online_url ?? 'En ligne')
              : [event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', ')}
            color={colors.accentOrange}
            colors={colors}
            divider
            onPress={!event.is_online && event.venue_city ? () => {
              const q = encodeURIComponent([event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', '));
              const url = Platform.OS === 'ios' ? `maps:?q=${q}` : `geo:0,0?q=${q}`;
              Linking.canOpenURL(url).then(ok =>
                Linking.openURL(ok ? url : `https://www.google.com/maps/search/?api=1&query=${q}`));
            } : undefined}
          />
        </Animated.View>

        {/* ── Capacité ─────────────────────────────────────────────────── */}
        {event.max_attendees != null && event.max_attendees > 0 && (
          <Animated.View entering={FadeInDown.delay(200).springify()}
            style={{ marginHorizontal: 16, marginTop: 12,
              backgroundColor: colors.backgroundSecondary, borderRadius: 16, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.textTertiary }}>PARTICIPANTS</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>
                {event.current_attendees} / {event.max_attendees}
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.backgroundTertiary, overflow: 'hidden' }}>
              <View style={{ height: '100%', borderRadius: 4, width: `${capacityPct * 100}%`, backgroundColor: accent }} />
            </View>
            <Text style={{ fontSize: 12, color: colors.textTertiary }}>
              {Math.round(capacityPct * 100)}% des places occupées
            </Text>
          </Animated.View>
        )}

        {/* ── Partage réseaux ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(230).springify()}
          style={{ paddingHorizontal: 16, paddingTop: 20, gap: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.textTertiary }}>PARTAGER SUR</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SOCIAL_NETWORKS.map(net => (
              <TouchableOpacity key={net.key} onPress={() => handleSocialShare(net)} activeOpacity={0.75}
                style={{ alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10,
                  borderRadius: 12, borderWidth: 1.5, borderColor: net.color + '55', backgroundColor: net.color + '12' }}>
                <Icon name={net.icon} size={20} color={net.color} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: net.color }}>{net.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

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
            <TouchableOpacity onPress={handleEdit}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary + '18' }}>
              <Icon name="edit-2" size={16} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete}
              style={{ paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.error + '18',
                flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="trash-2" size={16} color={colors.error} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.error }}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={isRegistered ? undefined : handleBuyTicket}
            disabled={buyLoading || isRegistered} activeOpacity={isRegistered ? 1 : 0.85}>
            <LinearGradient
              colors={isRegistered ? ['#555', '#444'] : [accent, accent + 'BB']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 16, borderRadius: 14 }}>
              {buyLoading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Icon name={isRegistered ? 'check' : isFree ? 'check-circle' : isInviteOnly ? 'lock' : 'tag'} size={20} color="#fff" />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                    {isRegistered ? 'Déjà inscrit' : isFree ? 'S\'inscrire gratuitement' : isInviteOnly ? 'Accès sur invitation' : 'Acheter un billet'}
                  </Text>
                  {!isRegistered && !isFree && !isInviteOnly && event.ticket_price != null && (
                    <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>{event.ticket_price} €</Text>
                  )}
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* ── Sheet commentaires ────────────────────────────────────────── */}
      {showComments && (
        <>
          <TouchableOpacity style={{ ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' }}
            activeOpacity={1} onPress={closeComments} />
          <Animated.View style={[{
            position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '75%',
            borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden',
            backgroundColor: colors.surface,
          }, sheetStyle]}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
              alignSelf: 'center', marginTop: 10, marginBottom: 8 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary,
              paddingHorizontal: 16, paddingBottom: 12 }}>Commentaires</Text>
            {loadingCmts ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
            ) : (
              <FlatList
                data={comments} keyExtractor={c => c.id} style={{ maxHeight: 320 }}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
                    <Icon name="message-circle" size={36} color={colors.textTertiary} />
                    <Text style={{ color: colors.textTertiary }}>Soyez le premier à commenter</Text>
                  </View>
                }
                renderItem={({ item: cmt }) => (
                  <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
                    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
                    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]}
                      style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
                        {getInitials(cmt.author?.display_name ?? cmt.author?.username)}
                      </Text>
                    </LinearGradient>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                        {cmt.author?.display_name ?? cmt.author?.username ?? 'Utilisateur'}
                      </Text>
                      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.textSecondary }}>{cmt.body}</Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                        {new Date(cmt.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 16, paddingVertical: 12,
                paddingBottom: Platform.OS === 'ios' ? 28 : 12,
                borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }}>
                <TextInput
                  value={commentText} onChangeText={setCommentText}
                  placeholder="Ajouter un commentaire..." placeholderTextColor={colors.textDisabled}
                  style={{ flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
                    fontSize: 14, backgroundColor: colors.inputBg, color: colors.textPrimary }}
                  returnKeyType="send" onSubmitEditing={sendComment}
                />
                <TouchableOpacity onPress={sendComment} disabled={sendingCmt || !commentText.trim()}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
                    alignItems: 'center', justifyContent: 'center' }}>
                  {sendingCmt ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="send" size={15} color="#fff" />}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </>
      )}
    </View>
  );
};

// ── InfoRow ───────────────────────────────────────────────────────────────────

import { StyleSheet } from 'react-native';

interface InfoRowProps {
  icon: string; label: string; value: string;
  color: string; colors: AppColors;
  divider?: boolean; onPress?: () => void;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, color, colors, divider, onPress }) => {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 }}>
      {divider && <View style={{ position: 'absolute', top: 0, left: 14, right: 14, height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />}
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '18' }}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 11, color: colors.textTertiary }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: onPress ? color : colors.textPrimary }}>{value}</Text>
      </View>
      {onPress && <Icon name="external-link" size={14} color={color} />}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
};
