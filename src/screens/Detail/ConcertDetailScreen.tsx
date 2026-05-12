import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  Modal, Share, Alert, Platform, Linking,
  Dimensions, StyleSheet, StatusBar, InteractionManager,
  NativeScrollEvent, NativeSyntheticEvent,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOCIAL_NETWORKS = [
  { key: 'facebook',  label: 'Facebook',   icon: 'facebook',       color: '#1877F2', buildUrl: (_t: string, u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: 'twitter',   label: 'X',          icon: 'twitter',        color: '#000',    buildUrl: (t: string, u: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: 'whatsapp',  label: 'WhatsApp',   icon: 'message-circle', color: '#25D366', buildUrl: (t: string, u: string) => `whatsapp://send?text=${encodeURIComponent(`${t}\n${u}`)}` },
  { key: 'tiktok',    label: 'TikTok',     icon: 'music',          color: '#010101', buildUrl: (_t: string, u: string) => `https://www.tiktok.com/share?url=${encodeURIComponent(u)}` },
  { key: 'instagram', label: 'Instagram',  icon: 'instagram',      color: '#E1306C', buildUrl: () => 'instagram://app' },
];

const getInitials = (name?: string | null) =>
  name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ── VideoModal — player plein écran ──────────────────────────────────────────

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

// ── HeroGradient (pas de vidéo) ───────────────────────────────────────────────

const HeroGradient: React.FC<{
  isLive: boolean; viewers: number;
  thumbnail?: string; colors: AppColors;
}> = ({ isLive, viewers, thumbnail, colors }) => {
  const H = SW * 0.62;
  return (
    <View style={{ width: SW, height: H, backgroundColor: '#000' }}>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={{ ...StyleSheet.absoluteFill }} resizeMode="cover" />
      ) : null}
      <LinearGradient
        colors={['#7B3FF2CC', '#E0389ACC', '#00000099']}
        style={{ ...StyleSheet.absoluteFill }}
        pointerEvents="none"
      />
      {!thumbnail && (
        <View style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="music" size={64} color="rgba(255,255,255,0.6)" />
        </View>
      )}
      {isLive && (
        <View style={{ position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' }} />
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.8 }}>EN DIRECT</Text>
        </View>
      )}
      {isLive && viewers > 0 && (
        <View style={{ position: 'absolute', top: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4,
          backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 }}>
          <Icon name="eye" size={11} color="#fff" />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{viewers.toLocaleString('fr')}</Text>
        </View>
      )}
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
  const [saved,        setSaved]        = useState(false);
  const [showVideo,    setShowVideo]    = useState(false);
  const [showComments, setShowComments] = useState(false);

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

  const openComments  = () => setShowComments(true);
  const closeComments = () => setShowComments(false);

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 5, stiffness: 300 }), withSpring(1, { damping: 10 }));
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
    socialService.toggleReaction({ reaction_type: 'like', concert_id: concertId }).catch(() => {
      setLiked(!newLiked);
      setLikeCount(prev => newLiked ? Math.max(0, prev - 1) : prev + 1);
    });
  };

  const handleSave = () => {
    saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    if (!concert) return;
    const newSaved = !saved;
    setSaved(newSaved);
    if (newSaved) {
      favoriteService.save({ target_type: 'concert', target_id: concertId, target_title: concert.title, target_subtitle: concert.venue_city ?? concert.artist?.username, target_thumbnail: concert.thumbnail_url }).catch(() => {});
    } else {
      favoriteService.unsave('concert', concertId).catch(() => {});
    }
  };

  const shareText = concert
    ? `🎵 ${concert.title} — ${formatDateShort(concert.scheduled_at)} à ${concert.venue_city ?? 'FoliX'}\nVia FoliX`
    : 'Découvre ce concert sur FoliX';
  const shareUrl = `https://folix.app/concerts/${concertId}`;

  const handleNativeShare = async () => {
    try {
      await Share.share({ title: concert?.title ?? 'Concert FoliX', message: shareText });
      socialService.share({ platform: 'native', concert_id: concertId }).catch(() => {});
    } catch { /**/ }
  };

  const handleSocialShare = async (net: typeof SOCIAL_NETWORKS[0]) => {
    const url = net.buildUrl(shareText, shareUrl);
    try {
      const canOpen = await Linking.canOpenURL(url);
      canOpen ? await Linking.openURL(url) : await handleNativeShare();
      socialService.share({ platform: net.key, concert_id: concertId }).catch(() => {});
    } catch { Alert.alert('Partage', 'Impossible d\'ouvrir cette application.'); }
  };

  const handleBuyTicket = () => {
    if (!concert) return;
    setPaySheetOpen(true);
  };

  const handleEdit   = () => nav.navigate('CreateConcert' as any, { concertId });
  const handleDelete = () => {
    Alert.alert('Supprimer le concert', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await concertService.delete(concertId); Alert.alert('Supprimé'); onBack?.(); }
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

  if (!concert) return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Icon name="alert-circle" size={48} color={colors.textTertiary} />
      <Text style={{ color: colors.textTertiary }}>Concert introuvable</Text>
    </View>
  );

  const isLive     = concert.status === 'live';
  const isFree     = concert.access_type === 'free';
  const artistName = concert.artist?.display_name ?? concert.artist?.username;
  const hasVideo   = !!concert.video_url;
  const galleryImages = [concert.thumbnail_url, concert.banner_url].filter(Boolean) as string[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Bouton retour flottant */}
      <TouchableOpacity
        onPress={onBack}
        style={{
          position: 'absolute', top: Platform.OS === 'ios' ? 52 : 36, left: 16, zIndex: 100,
          width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name="arrow-left" size={20} color="#fff" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── Hero : toujours les images ───────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(250)}>
          <HeroGradient isLive={isLive} viewers={concert.current_viewers ?? 0}
            thumbnail={concert.thumbnail_url ?? concert.banner_url ?? undefined} colors={colors} />

          {/* Bouton vidéo pub */}
          {hasVideo && (
            <TouchableOpacity
              onPress={() => setShowVideo(true)}
              style={{ position: 'absolute', bottom: 14, right: 16,
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: 'rgba(0,0,0,0.65)',
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}>
              <Icon name="play-circle" size={16} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Vidéo pub</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Modal vidéo pub */}
        {showVideo && hasVideo && (
          <VideoModal uri={concert.video_url!} onClose={() => setShowVideo(false)} />
        )}

        {/* ── Bouton regarder ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(70).springify()}
          style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <TouchableOpacity onPress={() => {
            if (isLive) {
              nav.navigate(isOwner ? 'LiveStream' as any : 'LiveViewer' as any, { concertId });
            } else {
              Alert.alert('Replay', 'Le replay n\'est pas encore disponible.');
            }
          }}>
            <LinearGradient
              colors={isLive ? ['#EF4444', '#DC2626'] : [colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, borderRadius: 14 }}>
              <Icon name={isLive ? 'radio' : 'play'} size={18} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                {isLive ? 'Regarder en direct' : 'Regarder le replay'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Titre + artiste ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100).springify()}
          style={{ paddingHorizontal: 16, paddingTop: 18, gap: 10 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, lineHeight: 30 }}>
            {concert.title}
          </Text>

          {/* Artiste row */}
          {artistName && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]}
                style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{getInitials(artistName)}</Text>
              </LinearGradient>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{artistName}</Text>
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>Artiste</Text>
              </View>
            </View>
          )}

          {/* Pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {concert.genre && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: colors.primary + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Icon name="music" size={11} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{concert.genre}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: colors.backgroundSecondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
              <Icon name="calendar" size={11} color={colors.textTertiary} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary }}>{formatDateShort(concert.scheduled_at)}</Text>
            </View>
            {isFree ? (
              <View style={{ backgroundColor: '#36D9A022', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#36D9A0' }}>GRATUIT</Text>
              </View>
            ) : concert.ticket_price != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: colors.primary + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Icon name="tag" size={11} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{concert.ticket_price} €</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* ── Barre sociale ────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(130).springify()}
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
        {concert.description ? (
          <Animated.View entering={FadeInDown.delay(160).springify()}
            style={{ paddingHorizontal: 16, paddingTop: 20, gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.textTertiary }}>À PROPOS</Text>
            <ExpandableText
              text={concert.description}
              maxLines={4}
              textStyle={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}
              primaryColor={colors.primary}
            />
          </Animated.View>
        ) : null}

        {/* ── Infos clés (card) ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(190).springify()}
          style={{ marginHorizontal: 16, marginTop: 20,
            backgroundColor: colors.backgroundSecondary, borderRadius: 16, overflow: 'hidden' }}>
          <InfoRow icon="calendar" label="Date" value={formatDate(concert.scheduled_at)} color={colors.primary} colors={colors} />
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
          {concert.duration_min ? (
            <InfoRow icon="clock" label="Durée" value={`${concert.duration_min} min`} color={colors.accentGreen} colors={colors} divider />
          ) : null}
          <InfoRow
            icon="layers" label="Type"
            value={concert.concert_type === 'live' ? 'En direct' : concert.concert_type === 'replay' ? 'Replay' : 'Live + Replay'}
            color={colors.gradientEnd} colors={colors} divider
          />
        </Animated.View>

        {/* ── Partage réseaux ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(220).springify()}
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

      {/* ── CTA / Owner bar ──────────────────────────────────────────── */}
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
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: '#EF444418' }}>
                <Icon name="radio" size={16} color="#EF4444" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                  {concert.status === 'live' ? 'Rejoindre' : 'Go Live'}
                </Text>
              </TouchableOpacity>
            )}
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
            disabled={isRegistered} activeOpacity={isRegistered ? 1 : 0.85} style={{ flex: 1 }}>
            <LinearGradient
              colors={isRegistered ? ['#555', '#444'] : [colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 16, borderRadius: 14 }}>
              <Icon name={isRegistered ? 'check' : isFree ? 'check-circle' : 'tag'} size={20} color="#fff" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                {isRegistered ? 'Déjà inscrit' : isFree ? 'S\'inscrire gratuitement' : 'Acheter un billet'}
              </Text>
              {!isRegistered && !isFree && concert.ticket_price != null && (
                <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>{concert.ticket_price} €</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* ── Sheet paiement billet ────────────────────────────────────── */}
      <TicketPaymentSheet
        visible={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        onSuccess={(_ticket) => setIsRegistered(true)}
        title={concert.title}
        accessType={concert.access_type as any}
        ticketPrice={concert.ticket_price ?? null}
        thumbnail={concert.thumbnail_url ?? null}
        kind="concert"
        onBuy={() => concertService.buyTicket(concertId)}
      />

      {/* ── Sheet commentaires ────────────────────────────────────────── */}
      <CommentsBottomSheet
        visible={showComments}
        onClose={closeComments}
        concertId={concertId}
      />
    </View>
  );
};

// ── InfoRow ───────────────────────────────────────────────────────────────────

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
