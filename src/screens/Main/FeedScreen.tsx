/**
 * FeedScreen — fil social : événements + concerts
 * Features: like animé, commentaires, partage natif, sauvegarde locale
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  RefreshControl, TextInput, ActivityIndicator, StyleSheet,
  Share, KeyboardAvoidingView, Platform, Image, StatusBar,
  Modal, Dimensions, Linking, InteractionManager, useWindowDimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence, withTiming, withRepeat,
  interpolate, FadeInDown,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNContacts from 'react-native-contacts';
import { sha256 } from 'js-sha256';
import Geolocation from '@react-native-community/geolocation';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { useTheme } from '../../hooks/useTheme';
import { useUserLocation } from '../../hooks/useUserLocation';
import { storage } from '../../utils/storage';
import { showConfirm } from '../../services';
import { SkeletonBox, SkeletonFeed, SkeletonFeedScreen, PeopleSuggestions, AvatarWithBadge, ReportModal, CommentsBottomSheet, PostCard, ExpandableText, LikersBottomSheet, FriendsWhoLiked, CachedImage, LiveThumbnailBackground, PriceWithLocal, GoFolyXLoader } from '../../components/common';
import { cacheImage } from '../../services/imageCacheService';
import { InlineVideoPlayer } from '../../components/common/InlineVideoPlayer';
import { ShareBottomSheet } from '../../components/common/ShareBottomSheet';
import type { UserPublic } from '../../types/user';
import { StoryBar } from '../../components/story';
import { eventService, concertService, socialService, authService, searchService, userService, reelService, feedPreferenceService, accountsService, toastService } from '../../services';
import type { StoredAccount } from '../../services';
import { apiClient } from '../../api/client';
import { searchHistoryService, type SearchHistoryItem } from '../../services/searchHistoryService';
import { favoriteService } from '../../services/favoriteService';
import { saveService } from '../../services/saveService';
import { liveService } from '../../services/liveService';
import type { LiveStream } from '../../services/liveService';
import { communityService } from '../../services/communityService';
import type { CommunityData } from '../../services/communityService';
import { useWs } from '../../context/WebSocketContext';
import { useUser } from '../../context/UserContext';
import { networkService } from '../../services/networkService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import type { User } from '../../types/user';
import type { SearchResults } from '../../types/search';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Post } from '../../types/post';
import type { AppColors } from '../../theme/colors';
import { feedStyles as s, fS } from '../../styles/FeedScreen.styles';
import { FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2 } from '../Create/ReelEditorScreen';
import type { FilterKey } from '../Create/ReelEditorScreen';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ── Types locaux ──────────────────────────────────────────────────────────────

type FeedFilter = 'all' | 'following' | 'live';

interface FeedItem {
  kind:    'event' | 'concert' | 'reel' | 'reel_row' | 'post' | 'suggestions' | 'communities' | 'ad';
  id:      string;
  data:    any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  concert: 'music', birthday: 'gift', festival: 'star',
  conference: 'mic', sport: 'activity', theater: 'film',
  exhibition: 'image', other: 'calendar',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(n => n?.[0] ?? '').filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
}

// ── Styles badges (déclarés ici pour être disponibles avant FeedHeaderBadges) ─
const badgeS = StyleSheet.create({
  badge: {
    position: 'absolute', top: -6, right: -8,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#7B3FF2',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#000',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});


// ── AdCard — publicité native dans le feed ────────────────────────────────────

interface AdData {
  id: string;
  title: string;
  description?: string;
  cta_text?: string;
  cta_url?: string;
  creative_url?: string;
  thumbnail_url?: string;
  format: string;
}

const AdVideoCreative: React.FC<{ uri: string; thumbnailUri?: string; isVisible: boolean }> = ({ uri, thumbnailUri, isVisible }) => {
  const [muted, setMuted] = useState(true);
  const everVisibleRef = useRef(false);
  if (isVisible) everVisibleRef.current = true;

  // Ne charge le flux vidéo qu'une fois la pub devenue visible au moins une fois —
  // évite de streamer une vidéo qui n'a jamais été vue.
  const videoSource = useMemo(
    () => (everVisibleRef.current ? { uri } : 'about:blank'),
    [uri, everVisibleRef.current],
  );

  const player = useVideoPlayer(videoSource, p => {
    p.loop = true;
    p.muted = true;
  });

  // Joue/pause selon la visibilité réelle à l'écran — coupe le stream hors champ
  useEffect(() => {
    if (isVisible) player.play();
    else player.pause();
  }, [isVisible, player]);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      player.muted = !m;
      return !m;
    });
  }, [player]);

  if (!everVisibleRef.current) {
    // Avant la première apparition à l'écran : thumbnail statique seulement
    return thumbnailUri ? (
      <CachedImage uri={thumbnailUri} style={adSt.image} resizeMode="cover" />
    ) : null;
  }

  return (
    <View style={{ position: 'relative' }}>
      <VideoView
        player={player}
        style={adSt.image}
        resizeMode="cover"
        controls={false}
      />
      <TouchableOpacity
        onPress={toggleMute}
        style={adSt.muteBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name={muted ? 'volume-x' : 'volume-2'} size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const AdCard: React.FC<{ ad: AdData; colors: AppColors; isVisible: boolean; onImpression: (id: string) => void; onPress: (id: string, url: string) => void; onOpenFullscreen: (ad: AdData) => void }> = React.memo(
  ({ ad, colors, isVisible, onImpression, onPress, onOpenFullscreen }) => {
    const firedRef = useRef<string | null>(null);
    useEffect(() => {
      if (ad?.id && firedRef.current !== ad.id) {
        firedRef.current = ad.id;
        onImpression(ad.id);
      }
    }, [ad?.id, onImpression]);

    const creativeUri = ad.creative_url || ad.thumbnail_url;
    const isVideo = !!(creativeUri && (creativeUri.includes('.m3u8') || creativeUri.includes('.mp4')));
    // CachedImage ne montre rien de visible en cas d'échec de chargement (URL cassée,
    // réseau...) — sans ce state, une pub dont l'image échoue apparaît comme une carte
    // sans visuel, indiscernable d'une pub qui n'en a simplement pas.
    const [imgFailed, setImgFailed] = useState(false);
    const hasCreative = !!creativeUri && !(imgFailed && !isVideo);

    // Une pub vidéo s'ouvre d'abord en plein écran avec son (comme un reel) —
    // le CTA reste accessible depuis cet écran, jamais ouvert automatiquement
    // au premier tap. Une pub image garde le comportement direct (CTA immédiat).
    const handleCardPress = () => {
      if (isVideo) { onOpenFullscreen(ad); return; }
      if (ad.cta_url) onPress(ad.id, ad.cta_url);
    };

    // Toute la carte est cliquable (pas seulement le petit bouton CTA) — via
    // TouchableOpacity de react-native-gesture-handler plutôt que celui de
    // react-native core : dans une ScrollView/FlatList profondément imbriquée
    // sous GestureHandlerRootView (App.tsx), le TouchableOpacity RN core entre
    // en compétition avec le responder de gesture-handler et son tap peut être
    // perdu — c'était la cause du clic mort sur les pubs de l'overlay recherche.
    return (
      <GHTouchableOpacity
        style={[adSt.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}
        activeOpacity={0.9}
        onPress={handleCardPress}
      >

        {/* ── En-tête : logo annonceur + label Sponsorisé ── */}
        <View style={adSt.header}>
          <View style={[adSt.logoWrap, { backgroundColor: colors.primary + '18' }]}>
            <Icon name="zap" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[adSt.advertiserName, { color: colors.textPrimary }]} numberOfLines={1}>
              {ad.title}
            </Text>
            <View style={adSt.sponsoredRow}>
              <Text style={[adSt.sponsoredLabel, { color: colors.textTertiary }]}>Sponsorisé</Text>
              <Icon name="globe" size={10} color={colors.textTertiary} />
            </View>
          </View>
        </View>

        {/* ── Description courte ── */}
        {ad.description ? (
          <Text style={[adSt.description, { color: colors.textSecondary }]} numberOfLines={3}>
            {ad.description}
          </Text>
        ) : null}

        {/* ── Créatif : vidéo ou image ── */}
        {hasCreative ? (
          isVideo ? (
            <AdVideoCreative uri={creativeUri!} thumbnailUri={ad.thumbnail_url} isVisible={isVisible} />
          ) : (
            <CachedImage uri={creativeUri!} style={adSt.image} resizeMode="cover" onError={() => setImgFailed(true)} />
          )
        ) : (
          <View style={[adSt.imagePlaceholder, { backgroundColor: colors.primary + '14' }]}>
            <Icon name="image" size={32} color={colors.primary + '60'} />
          </View>
        )}

        {/* ── Pied : CTA + "En savoir plus" (indicatif — le tap fonctionne sur toute la carte) ── */}
        <View style={[adSt.footer, { borderTopColor: colors.divider }]}>
          <View style={{ flex: 1 }}>
            {ad.cta_url ? (
              <Text style={[adSt.ctaDomain, { color: colors.textTertiary }]} numberOfLines={1}>
                {ad.cta_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
              </Text>
            ) : null}
            <Text style={[adSt.ctaTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {ad.cta_text ?? 'En savoir plus'}
            </Text>
          </View>
          <View style={[adSt.ctaBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
            <Text style={[adSt.ctaBtnText, { color: colors.textPrimary }]}>
              En savoir plus
            </Text>
          </View>
        </View>

      </GHTouchableOpacity>
    );
  },
);

// ── AdFullscreenPlayer — pub vidéo ouverte en plein écran avec son (via Modal),
// équivalent du AdSlide de ReelsScreen mais pour ce fichier (AdData local, sans
// advertiser_id). Fermeture par le bouton X, jamais d'ouverture auto du CTA. ──

const AdFullscreenPlayer: React.FC<{ ad: AdData; onClose: () => void }> = ({ ad, onClose }) => {
  const insets = useSafeAreaInsets();
  const creativeUri = ad.creative_url || ad.thumbnail_url!;
  const player = useVideoPlayer({ uri: creativeUri }, p => { p.loop = true; p.muted = false; p.volume = 1; });
  useEffect(() => { try { player.play(); } catch {} }, [player]);

  const rawCta = (ad.cta_url ?? '').trim();
  const handleCta = () => { if (rawCta) Linking.openURL(rawCta).catch(() => {}); };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="contain" controls={false} />

      <TouchableOpacity
        style={{ position: 'absolute', top: insets.top + 10, left: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
        onPress={onClose}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="x" size={22} color="#fff" />
      </TouchableOpacity>

      <View style={{ position: 'absolute', bottom: Math.max(insets.bottom, 16) + 10, left: 16, right: 16, gap: 8 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }} numberOfLines={1}>
          {ad.title}
        </Text>
        {ad.description ? (
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 }} numberOfLines={3}>{ad.description}</Text>
        ) : null}
        {rawCta ? (
          <TouchableOpacity activeOpacity={0.88} onPress={handleCta} style={{ marginTop: 4 }}>
            <LinearGradient colors={['#7B3FF2', '#C044E8', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
              <Icon name="globe" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '800' }}>{ad.cta_text || 'En savoir plus'}</Text>
              <Icon name="arrow-right" size={16} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const adSt = StyleSheet.create({
  card:           { marginVertical: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 0 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  logoWrap:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  advertiserName: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  sponsoredRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  sponsoredLabel: { fontSize: 11 },
  moreBtn:        { padding: 4 },
  description:    { fontSize: 14, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 10 },
  image:          { width: '100%', height: 220 },
  muteBtn:        { position: 'absolute', bottom: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  imagePlaceholder:{ width: '100%', height: 180, alignItems: 'center', justifyContent: 'center' },
  footer:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  ctaDomain:      { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 1 },
  ctaTitle:       { fontSize: 13, fontWeight: '600' },
  ctaBtn:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1 },
  ctaBtnText:     { fontSize: 13, fontWeight: '700' },
});

// ── LiveConcertCard — mémoïsé : re-rend uniquement si ses props changent ──────

interface LiveConcertCardProps {
  concert: Concert;
  isOwn: boolean;
  surfaceColor: string;
  onNavLiveStream: (id: string) => void;
  onNavLiveViewer: (id: string) => void;
}

const LiveConcertCard: React.FC<LiveConcertCardProps> = React.memo(({
  concert: c, isOwn, surfaceColor, onNavLiveStream, onNavLiveViewer,
}) => {
  const artist = c.artist;
  const artistName = artist?.display_name ?? artist?.username ?? 'Artiste';
  const initial = (artistName || 'A')[0].toUpperCase();
  const onPress = useCallback(() => {
    if (isOwn) onNavLiveStream(c.id);
    else onNavLiveViewer(c.id);
  }, [isOwn, c.id, onNavLiveStream, onNavLiveViewer]);
  return (
    <TouchableOpacity style={{ width: 130, borderRadius: 14, overflow: 'hidden', backgroundColor: surfaceColor }} activeOpacity={0.85} onPress={onPress}>
      <View style={{ width: 130, height: 170, position: 'relative' }}>
        {c.thumbnail_url
          ? <CachedImage uri={c.thumbnail_url} style={{ width: 130, height: 170 }} />
          : <LinearGradient colors={['#7B3FF2', '#E0389A']} style={{ width: 130, height: 170, alignItems: 'center', justifyContent: 'center' }}><Icon name="radio" size={28} color="#fff" /></LinearGradient>
        }
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }} />
        <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' }} />
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>LIVE</Text>
        </View>
        <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
          <Icon name="eye" size={10} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{c.current_viewers ?? 0}</Text>
        </View>
        <View style={{ position: 'absolute', bottom: 6, left: 6, right: 6 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{c.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {artist?.avatar_url
              ? <CachedImage uri={artist.avatar_url} style={{ width: 14, height: 14, borderRadius: 7 }} />
              : <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 7, fontWeight: '800' }}>{initial}</Text></View>
            }
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{artistName}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── FeedListHeader — mémoïsé, ne re-rend que quand liveConcerts/spontLives/nearbyEvents changent ─

interface FeedListHeaderProps {
  liveConcerts:  Concert[];
  spontLives:    LiveStream[];
  nearbyEvents:  Event[];
  colors:        AppColors;
  isDark:        boolean;
  currentUserId?: string;
  filter:        FeedFilter;
  onNavLiveList:        () => void;
  onNavSpontList:       () => void;
  onNavNearby:          () => void;
  onNavLiveStream:      (concertId: string) => void;
  onNavLiveViewer:      (concertId: string) => void;
  onNavSpontStream:     (liveId: string) => void;
  onNavSpontViewer:     (liveId: string) => void;
  onNavEvent:           (eventId: string) => void;
}

const FeedListHeader: React.FC<FeedListHeaderProps> = React.memo(({
  liveConcerts, spontLives, nearbyEvents, colors, isDark,
  currentUserId, filter,
  onNavLiveList, onNavSpontList, onNavNearby,
  onNavLiveStream, onNavLiveViewer,
  onNavSpontStream, onNavSpontViewer,
  onNavEvent,
}) => {
  const showNearby = filter === 'all' && nearbyEvents.length > 0;
  if (!liveConcerts.length && !spontLives.length && !showNearby) return null;
  return (
    <>
      {/* ── En direct ───────────────────────────────────────── */}
      {liveConcerts.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 4 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}
            activeOpacity={0.7}
            onPress={onNavLiveList}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>En direct</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{liveConcerts.length}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>Voir tout</Text>
              <Icon name="chevron-right" size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {liveConcerts.map(c => (
              <LiveConcertCard
                key={c.id}
                concert={c}
                isOwn={currentUserId === c.artist_id}
                onNavLiveStream={onNavLiveStream}
                onNavLiveViewer={onNavLiveViewer}
                surfaceColor={colors.surface}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Lives spontanés ─────────────────────────────────── */}
      {spontLives.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 4 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}
            activeOpacity={0.7}
            onPress={onNavSpontList}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>En direct</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{spontLives.length}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>Voir tout</Text>
              <Icon name="chevron-right" size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {spontLives.map(live => {
              const liveName = live.user?.display_name ?? live.user?.username ?? 'Utilisateur';
              const liveInitial = (liveName || 'U')[0].toUpperCase();
              return (
                <TouchableOpacity
                  key={live.id}
                  style={{ width: 110, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (currentUserId === live.user_id) onNavSpontStream(live.id);
                    else onNavSpontViewer(live.id);
                  }}
                >
                  <View style={{ width: 110, height: 150, position: 'relative' }}>
                    <LiveThumbnailBackground
                      thumbnailUrl={live.thumbnail_url}
                      avatarUrl={live.user?.avatar_url}
                      initials={liveInitial}
                      avatarSize={40}
                    />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }} />

                    {/* Badge LIVE */}
                    <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0365A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' }} />
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>LIVE</Text>
                    </View>

                    {/* Badge privé */}
                    {live.is_private && (
                      <View style={{ position: 'absolute', top: 22, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#7B3FF2D9', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                        <MCIcon name="lock" size={8} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 8, fontWeight: '700' }}>Abonnés</Text>
                      </View>
                    )}

                    {/* Viewers */}
                    <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Icon name="eye" size={9} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{live.current_viewers ?? 0}</Text>
                    </View>

                    {/* Avatar centré */}
                    {live.user?.avatar_url
                      ? <CachedImage uri={live.user.avatar_url} style={{ position: 'absolute', bottom: 20, alignSelf: 'center', width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#fff' }} />
                      : <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{liveInitial}</Text>
                        </View>
                    }
                    <View style={{ position: 'absolute', bottom: 5, left: 4, right: 4, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{liveName}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Près de toi — masqué dans l'onglet Suivis ────────── */}
      {showNearby && (
        <View style={[nbS.wrap, { borderTopColor: colors.divider, borderBottomColor: colors.divider, backgroundColor: colors.background }]}>
          <View style={nbS.header}>
            <View>
              <Text style={[nbS.title, { color: colors.textPrimary }]}>Dans ton quartier</Text>
              <Text style={[nbS.subtitle, { color: colors.textTertiary }]}>Des événements proches de toi</Text>
            </View>
            <TouchableOpacity onPress={onNavNearby} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[nbS.seeAll, { color: colors.primary }]}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={nbS.list}>
            {nearbyEvents.map(ev => {
              const dist = (ev as any).distance_km as number | null | undefined;
              const distLabel = dist != null ? (dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`) : null;
              const typeColor = colors.primary;
              const typeIcon  = EVENT_ICONS[ev.event_type ?? 'other'] ?? 'calendar';
              const NCARD_W   = Dimensions.get('window').width * 0.45;
              const NCOVER_H  = NCARD_W * 0.5;
              return (
                <View key={ev.id} style={[nbS.card, { width: NCARD_W, backgroundColor: colors.surface, borderColor: colors.divider }]}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => onNavEvent(ev.id)}>
                    {ev.thumbnail_url ? (
                      <CachedImage uri={ev.thumbnail_url} style={{ width: NCARD_W, height: NCOVER_H }} resizeMode="cover" />
                    ) : (
                      <LinearGradient colors={[typeColor + 'DD', typeColor + '55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: NCARD_W, height: NCOVER_H, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={typeIcon} size={28} color="rgba(255,255,255,0.7)" />
                      </LinearGradient>
                    )}
                    {distLabel && (
                      <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Icon name="map-pin" size={9} color="#fff" />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{distLabel}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={[nbS.iconWrap, { borderColor: colors.background, backgroundColor: typeColor, marginTop: -18 }]}>
                    <Icon name={typeIcon} size={14} color="#fff" />
                  </View>
                  <View style={[nbS.cardBody, { paddingTop: 14 }]}>
                    <TouchableOpacity onPress={() => onNavEvent(ev.id)} activeOpacity={0.8} style={{ alignItems: 'center', width: '100%' }}>
                      <Text style={[nbS.name, { color: colors.textPrimary }]} numberOfLines={1}>{ev.title}</Text>
                      {ev.starts_at && !isNaN(new Date(ev.starts_at).getTime()) && (
                        <Text style={[nbS.handle, { color: colors.textTertiary }]}>
                          {new Date(ev.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          {ev.venue_city ? ` · ${ev.venue_city}` : ''}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[nbS.goBtn, { backgroundColor: typeColor }]}
                      activeOpacity={0.8}
                      onPress={() => onNavEvent(ev.id)}
                    >
                      <Icon name="arrow-right" size={14} color="#fff" />
                      <Text style={nbS.goBtnText}>Découvrir</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </>
  );
});

// ── Badges isolés — ne re-rendent que le FeedScreen quand les unread changent ─

const FeedHeaderBadges: React.FC<{
  onMessages: () => void;
  onNotifs: () => void;
  onMenu: () => void;
  onFavorites: () => void;
  onLive: () => void;
  onFriends: () => void;
  friendsActive: boolean;
  colors: AppColors;
}> = React.memo(({ onMessages, onNotifs, onFavorites, onLive, onFriends, friendsActive, colors }) => {
  const { unreadMessages, unreadActivity, unreadNotifications } = useWs();
  const totalNotifs = unreadNotifications + unreadActivity;
  // Zoom d'accessibilité système (taille de texte agrandie dans les réglages du
  // téléphone) — fontScale se met à jour en direct via useWindowDimensions, pas
  // besoin de relancer l'app. Au-delà d'un certain agrandissement, 5 libellés sur
  // une seule rangée de largeur fixe se chevauchent/débordent : on masque le texte
  // et ne garde que les icônes, mieux centrées, plutôt que casser la mise en page.
  const { fontScale } = useWindowDimensions();
  const showLabels = fontScale < 1.15;
  const sep = <View style={{ width: StyleSheet.hairlineWidth, height: 22, backgroundColor: 'rgba(255,255,255,0.08)' }} />;
  const iconWrapStyle = showLabels ? undefined : { paddingVertical: 4 };
  return (
    <View style={{ paddingBottom: 6, marginHorizontal: -16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', borderRadius: 12, overflow: 'hidden' }}>
        {/* Mes amis / Général — bascule entre le fil normal et le filtre "amis"
            (posts/events/concerts/reels des comptes suivis uniquement). Icône ET
            libellé changent selon l'état : "Mes amis" pour y entrer, "Général"
            pour en sortir — pas juste une couleur qui change sur le même texte. */}
        <TouchableOpacity style={[fS.actionIcon, { flex: 1 }, iconWrapStyle]} onPress={onFriends} activeOpacity={0.8}>
          <MCIcon name={friendsActive ? 'account-group' : 'account-heart-outline'} size={20} color={friendsActive ? colors.primary : colors.textPrimary} />
          {showLabels && (
            <Text style={{ fontSize: 10.5, color: friendsActive ? colors.primary : colors.textSecondary, marginTop: 2, fontWeight: friendsActive ? '700' : '500' }}>
              {friendsActive ? 'Général' : 'Mes amis'}
            </Text>
          )}
        </TouchableOpacity>
        {sep}
        {/* Messages & Appels */}
        <TouchableOpacity style={[fS.actionIcon, { flex: 1 }, iconWrapStyle]} onPress={onMessages} activeOpacity={0.8}>
          <View style={{ position: 'relative' }}>
            <MCIcon name="forum" size={19} color={colors.textPrimary} />
            {unreadMessages > 0 && (
              <View style={[badgeS.badge, { borderColor: colors.backgroundSecondary }]}>
                <Text style={badgeS.badgeText}>{unreadMessages > 99 ? '99+' : unreadMessages}</Text>
              </View>
            )}
          </View>
          {showLabels && <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: 2, fontWeight: '500' }}>Messages</Text>}
        </TouchableOpacity>
        {sep}
        {/* Notifications */}
        <TouchableOpacity style={[fS.actionIcon, { flex: 1 }, iconWrapStyle]} onPress={onNotifs} activeOpacity={0.8}>
          <View style={{ position: 'relative' }}>
            <Icon name="bell" size={19} color={colors.textPrimary} />
            {totalNotifs > 0 && (
              <View style={[badgeS.badge, { borderColor: colors.backgroundSecondary, backgroundColor: colors.primary }]}>
                <Text style={badgeS.badgeText}>{totalNotifs > 99 ? '99+' : totalNotifs}</Text>
              </View>
            )}
          </View>
          {showLabels && <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: 2, fontWeight: '500' }}>Notifications</Text>}
        </TouchableOpacity>
        {sep}
        {/* Enregistrés */}
        <TouchableOpacity style={[fS.actionIcon, { flex: 1 }, iconWrapStyle]} onPress={onFavorites} activeOpacity={0.8}>
          <MCIcon name="bookmark-outline" size={20} color={colors.textPrimary} />
          {showLabels && <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: 2, fontWeight: '500' }}>Enregistrés</Text>}
        </TouchableOpacity>
        {sep}
        {/* En direct */}
        <TouchableOpacity style={[fS.actionIcon, { flex: 1 }, iconWrapStyle]} onPress={onLive} activeOpacity={0.8}>
          <View style={{ position: 'relative' }}>
            <MCIcon name="video-outline" size={21} color="#F0365A" />
            <View style={{ position: 'absolute', top: -2, right: -4, width: 7, height: 7, borderRadius: 4, backgroundColor: '#F0365A', borderWidth: 1.5, borderColor: colors.backgroundSecondary }} />
          </View>
          {showLabels && <Text style={{ fontSize: 10.5, color: '#F0365A', marginTop: 2, fontWeight: '600' }}>En direct</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ── FeedScreen ────────────────────────────────────────────────────────────────

interface FeedScreenProps {
  onLogout?: () => void;
  onSwitchAccount?: (userId: string) => Promise<void>;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({ onLogout, onSwitchAccount }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { addListener, removeListener, lastLiveStarted, lastLiveEnded, lastLiveViewersUpdated, lastPresenceUpdate } = useWs();
  const { currentUser } = useUser();
  // false — ne demande pas la permission localisation des l'arrivee sur le feed,
  // uniquement la section secondaire "Pres de toi" en beneficie ici.
  const userLocation = useUserLocation(false);
  // Zoom d'accessibilité système — réduit le logo "GoFolyX" centré au-delà d'un
  // certain agrandissement, sinon il chevauche le nom d'utilisateur (gauche) et
  // les boutons de recherche (droite) qui grandissent aussi.
  const { fontScale: headerFontScale } = useWindowDimensions();
  const logoFontSize = headerFontScale >= 1.15 ? 26 / Math.min(headerFontScale, 1.6) : 26;

  const [filter,      setFilter]      = useState<FeedFilter>('all');
  const [items,       setItems]       = useState<FeedItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  // Plusieurs campagnes peuvent être injectées dans le même feed (une par emplacement
  // publicitaire) — map id → data, alimentée au fur et à mesure des tirages successifs.
  const [adsById,     setAdsById]     = useState<Record<string, AdData>>({});
  const seenAdIdsRef  = useRef<string[]>([]); // exclude_ids envoyés au backend, dans l'ordre
  // File d'attente sérialisant tous les appels à assignAdsToSlots (load('all') et
  // loadMoreFeed peuvent tous deux en déclencher un, potentiellement en même temps si un
  // refresh silencieux chevauche le prefetch anticipé) — évite que deux tirages concurrents
  // lisent/écrivent seenAdIdsRef de façon incohérente.
  const adAssignQueueRef = useRef<Promise<void>>(Promise.resolve());
  // slotId (__ad__slot_N) → id de la campagne tirée pour cet emplacement précis
  const [adSlotMap,   setAdSlotMap]   = useState<Record<string, string>>({});
  const adInsertedRef = useRef<Set<string>>(new Set()); // évite double-injection
  const [refreshing,  setRefreshing]  = useState(false);
  const lastLoadedAtRef = useRef<number>(0);
  // ── Scroll infini ────────────────────────────────────────────────────────
  const feedPageRef      = useRef(1);
  const feedHasMoreRef   = useRef(true);
  const [hasMoreFeed,    setHasMoreFeed]    = useState(true);
  const [loadingMoreFeed, setLoadingMoreFeed] = useState(false);
  const loadingMoreRef   = useRef(false);
  const seenItemIdsRef   = useRef<Set<string>>(new Set());
  // Continuité de l'espacement suggestions/communautés entre page 1 (load) et pages
  // suivantes (loadMoreFeed) — reprend exactement où load('all') s'est arrêté.
  const nonReelCountRef  = useRef(0);
  const suggestCountRef  = useRef(0);
  const commCountRef     = useRef(0);
  // Pool cumulatif de communautés, complété au fil du scroll (au lieu de répéter les 5
  // mêmes communautés à chaque bloc "communities" injecté dans le flux).
  const COMM_SLICE = 5;
  const trendingCommRef      = useRef<CommunityData[]>([]);
  const commPageRef          = useRef(1);
  const commExhaustedRef     = useRef(false);
  const commFetchingRef      = useRef(false);
  const feedListRef     = useRef<FlatList>(null);
  const [liveConcerts,    setLiveConcerts]    = useState<Concert[]>([]);
  const [spontLives,      setSpontLives]      = useState<LiveStream[]>([]);
  const [nearbyEvents,    setNearbyEvents]    = useState<Event[]>([]);
  const [trendingComm,    setTrendingComm]    = useState<CommunityData[]>([]);
  // IDs des communautés dont l'utilisateur est déjà membre — comme Facebook, jamais
  // resuggérer une communauté déjà rejointe. join_status venant de /communities (liste
  // générique en cache Redis, non personnalisée par utilisateur) vaut toujours "none",
  // donc ce filtre-ci est la seule source fiable.
  const myCommIdsRef = useRef<Set<string>>(new Set());
  // Panneau infos primaires — ouvert via le chevron du header, fermé au tap
  // extérieur. Restait ouvert indéfiniment si on quittait l'écran (changement
  // d'onglet, navigation vers un écran empilé) sans re-taper explicitement à
  // côté pour le refermer — se referme désormais aussi à la perte de focus.
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  useFocusEffect(useCallback(() => () => setShowProfilePanel(false), []));
  // Multi-compte — liste chargée à l'ouverture du panneau (pas au montage de l'écran,
  // pour toujours refléter les changements faits depuis les Paramètres).
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState<'all'|'users'|'events'|'concerts'|'reels'|'films'>('all');
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  // Scroll infini — actif à la fois sur un filtre spécifique et en mode "Tout" (voir
  // liveSearch/loadMoreSearch) : le backend applique la même page/limit à chaque
  // catégorie en parallèle, donc avancer la page fonctionne aussi en mode "Tout",
  // simplement sans total/has_more par catégorie (approximé côté client).
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
  const SEARCH_PAGE_LIMIT = 20;
  const SEARCH_CATEGORIES = ['users', 'films', 'series', 'concerts', 'events', 'reels'] as const;
  // Pub dédiée au placement "search" — une seule par recherche effectuée (pas de scroll
  // infini dans les résultats, contrairement au feed principal, donc pas besoin de
  // rotation par emplacement). Rechargée à chaque nouveau terme recherché.
  const [searchAd, setSearchAd] = useState<AdData | null>(null);
  const searchAdReqRef = useRef('');
  const [popularContent, setPopularContent] = useState<any[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const popularLoadedRef = useRef(false);
  const searchBarWidth = useSharedValue(0);
  const searchBarOpacity = useSharedValue(0);

  const searchInputRef = useRef<any>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchReqRef   = useRef('');

  const refreshHistory = useCallback(() => {
    setSearchHistory(searchHistoryService.getAll());
  }, []);

  // Suggestions historique filtrées en live selon le texte tapé
  const historySuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchHistory.filter(h => h.query.toLowerCase().includes(q) && h.query.toLowerCase() !== q).slice(0, 5);
  }, [searchQuery, searchHistory]);

  // Reel actif dans le feed (autoplay)
  const [activeReelId,      setActiveReelId]      = useState<string | null>(null);
  const [feedFocused,       setFeedFocused]        = useState(true);
  const [feedScrollEnabled, setFeedScrollEnabled]  = useState(true);

  const feedViewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,   // 50% de l'item visible suffit
    minimumViewTime: 200,              // évite les faux positifs au scroll rapide
  }).current;
  const [activeReelRowId, setActiveReelRowId] = useState<string | null>(null);
  const [adVisible, setAdVisible] = useState(false);
  // Ref stable vers loadMoreFeed — onFeedViewableChanged est figé au montage (useRef().current,
  // imposé par onViewableItemsChanged qui n'accepte pas de callback changeant de référence),
  // donc on ne peut pas appeler loadMoreFeed directement dedans (sa référence change à chaque
  // render selon ses dépendances). Synchronisée juste après la définition de loadMoreFeed.
  const loadMoreFeedRef = useRef<() => void>(() => {});

  // Distance en nombre d'items restants à laquelle on déclenche le chargement de la page
  // suivante — l'utilisateur ne doit jamais voir de spinner/attente en scrollant normalement,
  // le contenu doit déjà être là bien avant qu'il n'atteigne la fin de ce qui est chargé.
  const PREFETCH_ITEMS_REMAINING = 6;
  // Nombre d'items à l'avance dont on précharge l'image sur disque — évite l'écran noir/flash
  // au scroll rapide (CachedImage ne télécharge sinon qu'une fois le composant réellement monté).
  // Réduit hors wifi (data mobile facturée), même prudence que StoryBar/ConversationStoryBar.
  const getImagePrefetchAhead = () => (networkService.isWifi() ? 4 : 2);
  const prefetchedImagesRef = useRef<Set<string>>(new Set());

  // Retourne les images visuelles "de base" d'un item — limité aux médias propres à l'item
  // (pas les pools suggestions/communautés, qui ont leur propre fetch et dont le recalcul
  // via map/flatMap à chaque tick de scroll était coûteux pour un bénéfice marginal).
  const extractItemImageUrls = (item: FeedItem): string[] => {
    switch (item.kind) {
      case 'event':
      case 'concert':
      case 'reel':
        return item.data?.thumbnail_url ? [item.data.thumbnail_url] : [];
      case 'post': {
        const urls: string[] = [];
        if (Array.isArray(item.data?.image_urls) && item.data.image_urls.length > 0) {
          urls.push(item.data.image_urls[0]); // seule la 1ère image du carrousel est visible sans interaction
        } else if (item.data?.image_url) {
          urls.push(item.data.image_url);
        } else if (item.data?.thumbnail_url) {
          urls.push(item.data.thumbnail_url);
        }
        return urls;
      }
      case 'reel_row':
        // Rangée entière, mais plafonnée : pas besoin de précharger les 10 reels d'une
        // rangée avant qu'elle ne soit visible, seules les premières vignettes comptent.
        return Array.isArray(item.data)
          ? item.data.slice(0, 4).map((r: any) => r?.thumbnail_url).filter(Boolean)
          : [];
      default:
        return []; // suggestions/communities/ad : pas de prefetch via ce chemin générique
    }
  };

  const prefetchUpcomingImages = (fromIndex: number) => {
    const list = itemsRef.current;
    const ahead = getImagePrefetchAhead();
    for (let i = fromIndex; i < Math.min(fromIndex + ahead, list.length); i++) {
      for (const url of extractItemImageUrls(list[i])) {
        if (url && !prefetchedImagesRef.current.has(url)) {
          prefetchedImagesRef.current.add(url);
          cacheImage(url).catch(() => {});
        }
      }
    }
  };

  // onViewableItemsChanged attend minimumViewTime (200ms) qu'un item se stabilise à l'écran
  // avant de se déclencher — en scroll rapide (fling), l'utilisateur traverse des items en
  // moins de 200ms chacun, donc ce callback ne se déclenche JAMAIS pendant le mouvement,
  // uniquement une fois le scroll arrêté. Le prefetch d'images doit au contraire réagir
  // pendant le scroll lui-même : on calcule l'item approximatif visible directement depuis
  // la position brute de défilement (onScroll), MAIS le calcul réel est différé hors de la
  // frame de scroll (InteractionManager) pour ne jamais bloquer le geste en cours — un
  // scroll rapide + chargement réseau simultané ne doit jamais figer le JS thread.
  const AVG_ITEM_HEIGHT = 420; // estimation grossière, mélange posts/reels/pubs/suggestions
  const lastScrollPrefetchIndexRef = useRef(-1);
  const handleFeedScroll = (e: any) => {
    const offsetY = e.nativeEvent?.contentOffset?.y ?? 0;
    const approxIndex = Math.floor(offsetY / AVG_ITEM_HEIGHT);
    if (approxIndex > lastScrollPrefetchIndexRef.current) {
      lastScrollPrefetchIndexRef.current = approxIndex;
      InteractionManager.runAfterInteractions(() => prefetchUpcomingImages(approxIndex + 1));
    }
  };

  const onFeedViewableChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setActiveReelId(null);

    // Activer la rangée de reels visible (1 seule à la fois)
    const reelRowItem = viewableItems.find(v => v.item?.kind === 'reel_row');
    setActiveReelRowId(reelRowItem ? reelRowItem.item.id : null);

    // Pub vidéo : ne joue que quand réellement visible à l'écran (coupe le stream sinon)
    setAdVisible(viewableItems.some(v => v.item?.kind === 'ad'));

    // Prefetch anticipé : dès que l'item le plus bas visible est à moins de N items de la
    // fin du contenu déjà chargé, on lance loadMoreFeed en arrière-plan — l'utilisateur ne
    // doit jamais "sentir" le chargement en scrollant (voir aussi onEndReached en secours).
    const lastVisibleIndex = viewableItems.length > 0
      ? Math.max(...viewableItems.map(v => v.index ?? -1))
      : -1;
    if (lastVisibleIndex >= 0 && itemsRef.current.length - 1 - lastVisibleIndex <= PREFETCH_ITEMS_REMAINING) {
      loadMoreFeedRef.current();
    }

    // Précharge sur disque les images des prochains items, avant qu'ils ne soient montés —
    // évite le flash/écran noir le temps que CachedImage télécharge à la volée au scroll rapide.
    if (lastVisibleIndex >= 0) {
      prefetchUpcomingImages(lastVisibleIndex + 1);
    }
  }).current;

  // Pub vidéo ouverte en plein écran avec son (AdCard cliqué) — jamais d'ouverture
  // directe du CTA pour une vidéo, contrairement à une pub image.
  const [fullscreenAd, setFullscreenAd] = useState<AdData | null>(null);

  // Sheet commentaires
  const [commentItem,    setCommentItem]    = useState<FeedItem | null>(null);
  const [commentVisible, setCommentVisible] = useState(false);
  const commentCountChangeRef = useRef<((delta: number) => void) | null>(null);
  const commentCountLoadedRef = useRef<((count: number) => void) | null>(null);

  // Recherche auto avec debounce 300ms
  const liveSearch = useCallback((query: string, filter: typeof searchFilter = 'all') => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const term = query.trim();
    searchReqRef.current = term;
    if (!term) { setSearchResults(null); setSearchAd(null); setSearching(false); setSearchHasMore(false); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchService.searchAll({
          q: term, limit: SEARCH_PAGE_LIMIT,
          type: filter === 'all' ? undefined : filter,
        });
        // Ignore une réponse en retard (frappe rapide) qui ne correspond plus au terme actuel
        if (searchReqRef.current === term) {
          setSearchResults(results);
          setSearchPage(1);
          // En mode "Tout", chaque catégorie est paginée indépendamment côté backend (même
          // page/limit appliqués à chacune) — tant qu'AU MOINS une catégorie est encore
          // pleine, il reste potentiellement des résultats à charger sur celle-ci.
          const hasMore = filter === 'all'
            ? SEARCH_CATEGORIES.some(k => (results[k]?.length ?? 0) >= SEARCH_PAGE_LIMIT)
            : (results[filter]?.length ?? 0) >= SEARCH_PAGE_LIMIT;
          setSearchHasMore(hasMore);
        }
      } catch { /* silencieux */ }
      finally { if (searchReqRef.current === term) setSearching(false); }

      // Pub search — indépendante de searchAll, ne bloque jamais l'affichage des résultats
      // si elle échoue ou tarde.
      if (searchAdReqRef.current === term) return;
      searchAdReqRef.current = term;
      apiClient.get<AdData | null>('/api/v1/ads/feed/next?placement=search')
        .then(r => { if (searchAdReqRef.current === term) setSearchAd(r.data ?? null); })
        .catch(() => {});
    }, 300);
  }, []);

  // Charge la page suivante — scroll infini sur l'overlay recherche, pour le filtre
  // actif OU pour toutes les catégories en mode "Tout" (chacune avance de sa propre
  // page en parallèle, fusionnée dans le state existant plutôt que remplacée).
  const loadMoreSearch = useCallback(() => {
    const term = searchQuery.trim();
    if (!term || loadingMoreSearch || !searchHasMore) return;
    setLoadingMoreSearch(true);
    const nextPage = searchPage + 1;
    searchService.searchAll({
      q: term, page: nextPage, limit: SEARCH_PAGE_LIMIT,
      type: searchFilter === 'all' ? undefined : searchFilter,
    })
      .then(results => {
        const keys = searchFilter === 'all' ? SEARCH_CATEGORIES : [searchFilter];
        setSearchResults(prev => {
          if (!prev) return prev;
          const next = { ...prev };
          for (const k of keys) next[k] = [...(prev[k] ?? []), ...(results[k] ?? [])];
          return next;
        });
        setSearchPage(nextPage);
        const hasMore = keys.some(k => (results[k]?.length ?? 0) >= SEARCH_PAGE_LIMIT);
        setSearchHasMore(hasMore);
      })
      .catch(() => setSearchHasMore(false))
      .finally(() => setLoadingMoreSearch(false));
  }, [searchQuery, searchFilter, searchPage, searchHasMore, loadingMoreSearch]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    refreshHistory();
    // Précharge la pub "search" dès l'ouverture — avant, elle n'était demandée
    // qu'à la première frappe (liveSearch), donc invisible tant que l'utilisateur
    // n'avait rien tapé.
    if (!searchAdReqRef.current) {
      searchAdReqRef.current = '__initial__';
      apiClient.get<AdData | null>('/api/v1/ads/feed/next?placement=search')
        .then(r => setSearchAd(r.data ?? null))
        .catch(() => {});
    }
    if (!popularLoadedRef.current) {
      popularLoadedRef.current = true;
      setPopularLoading(true);
      Promise.allSettled([
        searchService.getTrending(),
        searchService.getUpcomingEvents(),
      ]).then(([contentRes, eventsRes]) => {
        const content = contentRes.status === 'fulfilled' ? contentRes.value.slice(0, 5).map(i => ({ ...i, __kind: 'content' })) : [];
        const events  = eventsRes.status  === 'fulfilled' ? eventsRes.value.slice(0, 4).map(i  => ({ ...i, __kind: 'event'   })) : [];
        // Mélange films/séries et événements plutôt que de tout concaténer d'un bloc
        const merged: any[] = [];
        const maxLen = Math.max(content.length, events.length);
        for (let i = 0; i < maxLen; i++) {
          if (content[i]) merged.push(content[i]);
          if (events[i])  merged.push(events[i]);
        }
        setPopularContent(merged);
      }).finally(() => setPopularLoading(false));
    }
    searchBarWidth.value  = withSpring(1, { damping: 18, stiffness: 200 });
    searchBarOpacity.value = withTiming(1, { duration: 200 });
    setTimeout(() => searchInputRef.current?.focus(), 250);
  }, [refreshHistory]);

  const closeSearch = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchBarWidth.value   = withSpring(0, { damping: 18, stiffness: 200 });
    searchBarOpacity.value = withTiming(0, { duration: 150 });
    setTimeout(() => setSearchOpen(false), 180);
    setSearchQuery('');
    setSearchResults(null);
    setSearchAd(null);
    searchAdReqRef.current = '';
    setSearchFilter('all');
    setSearchPage(1);
    setSearchHasMore(false);
  }, []);

  const commitSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    searchHistoryService.add(trimmed);
    refreshHistory();
  }, [refreshHistory]);

  const animatedSearchBar = useAnimatedStyle(() => ({
    flex: interpolate(searchBarWidth.value, [0, 1], [0, 1]),
    opacity: searchBarOpacity.value,
    overflow: 'hidden',
  }));



  // ── Suggestions — pool cumulatif par tranches de 10, complété au fil du scroll
  // (au lieu de boucler en modulo sur les 30 premières suggestions à l'infini) ──
  const SUGGEST_SLICE = 10;
  const [suggestPool,    setSuggestPool]    = useState<UserPublic[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(true);
  const suggestExhaustedRef = useRef(false); // plus aucune suggestion à charger côté backend
  const suggestFetchingRef  = useRef(false);  // évite les fetchs concurrents

  const suggestPoolRef = useRef<UserPublic[]>([]);
  useEffect(() => { suggestPoolRef.current = suggestPool; }, [suggestPool]);

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await userService.getSuggestions(30);
      const list = Array.isArray(data) ? data : [];
      setSuggestPool(list);
      suggestExhaustedRef.current = list.length < 30;
    } catch { /* silencieux */ }
    finally { setSuggestLoading(false); }
  }, []);

  // Complète le pool en arrière-plan quand on approche de la fin (pas de boucle bloquante,
  // le bloc affiche la tranche déjà disponible pendant que le fetch se termine).
  const fetchMoreSuggestions = useCallback(async () => {
    if (suggestFetchingRef.current || suggestExhaustedRef.current) return;
    suggestFetchingRef.current = true;
    try {
      const offset = suggestPoolRef.current.length;
      const data = await userService.getSuggestions(SUGGEST_SLICE, offset);
      const list = Array.isArray(data) ? data : [];
      if (list.length < SUGGEST_SLICE) suggestExhaustedRef.current = true;
      if (list.length > 0) {
        setSuggestPool(prev => {
          const seen = new Set(prev.map(u => u.id));
          return [...prev, ...list.filter(u => !seen.has(u.id))];
        });
      }
    } catch { /* silencieux */ }
    finally { suggestFetchingRef.current = false; }
  }, []);

  // Retourne la tranche du pool correspondant au numero de bloc (1-based). Bloc 1 → [0..9],
  // bloc 2 → [10..19], etc. Si le pool ne couvre pas encore ce bloc, déclenche un fetch en
  // arrière-plan (non bloquant) et retourne ce qui est disponible en attendant.
  const sliceForBlock = useCallback((blockIndex: number): UserPublic[] => {
    if (suggestPool.length === 0) return [];
    const start = (blockIndex - 1) * SUGGEST_SLICE;
    if (start >= suggestPool.length && !suggestExhaustedRef.current) {
      fetchMoreSuggestions();
    }
    if (start >= suggestPool.length) {
      // Pool réellement épuisé côté backend — reboucler plutôt qu'un bloc vide
      const wrapped = start % suggestPool.length;
      return suggestPool.slice(wrapped, wrapped + SUGGEST_SLICE);
    }
    return suggestPool.slice(start, start + SUGGEST_SLICE);
  }, [suggestPool, fetchMoreSuggestions]);

  useEffect(() => { loadSuggestions(); }, []);

  // ── Suggestions intelligentes : contacts + localisation ──────────────────────
  // Hash SHA-256 des contacts avant l'envoi (jamais de numéro/email en clair côté
  // serveur), et position GPS ponctuelle — les deux ne servent qu'à mieux classer
  // les suggestions de personnes (PeopleSuggestions), rien d'autre.
  const CONTACTS_PROMPT_SEEN_KEY = 'suggestions_contacts_prompt_seen';

  const syncContactsForSuggestions = useCallback(async () => {
    try {
      const contacts = await RNContacts.getAll();
      const hashes = new Set<string>();
      for (const c of contacts) {
        for (const p of c.phoneNumbers ?? []) {
          if (p.number) hashes.add(sha256(p.number.replace(/[^\d+]/g, '')));
        }
        for (const e of c.emailAddresses ?? []) {
          if (e.email) hashes.add(sha256(e.email.trim().toLowerCase()));
        }
      }
      if (hashes.size) {
        await userService.syncContacts(Array.from(hashes));
        loadSuggestions();
      }
    } catch { /* silencieux — les suggestions restent utilisables sans contacts */ }
  }, [loadSuggestions]);

  const syncLocationForSuggestions = useCallback(() => {
    Geolocation.getCurrentPosition(
      pos => {
        userService.updateLocation(pos.coords.latitude, pos.coords.longitude)
          .then(loadSuggestions)
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }, [loadSuggestions]);

  const requestLocationForSuggestions = useCallback(async () => {
    const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
    let status = await check(perm);
    if (status === RESULTS.DENIED) status = await request(perm);
    if (status === RESULTS.GRANTED) syncLocationForSuggestions();
  }, [syncLocationForSuggestions]);

  // Au premier chargement du feed : si la permission Contacts a déjà été
  // accordée, synchronise en silence. Sinon, montre UNE FOIS une explication
  // claire avant le popup système (jamais de popup système sans contexte).
  useEffect(() => {
    (async () => {
      const contactsPerm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CONTACTS : PERMISSIONS.ANDROID.READ_CONTACTS;
      const contactsStatus = await check(contactsPerm);

      if (contactsStatus === RESULTS.GRANTED) {
        syncContactsForSuggestions();
      } else if (contactsStatus === RESULTS.DENIED && !storage.getBoolean(CONTACTS_PROMPT_SEEN_KEY)) {
        storage.setBoolean(CONTACTS_PROMPT_SEEN_KEY, true);
        showConfirm(
          'Trouve tes amis sur GoFolyX',
          'Autorise l\'accès à tes contacts pour qu\'on te suggère en priorité les personnes que tu connais déjà — jamais tes contacts ne sont partagés ni affichés, seule une empreinte chiffrée sert à faire le lien.',
          [
            { text: 'Plus tard', style: 'cancel' },
            {
              text: 'Autoriser', style: 'default', onPress: async () => {
                const granted = await request(contactsPerm);
                if (granted === RESULTS.GRANTED) syncContactsForSuggestions();
              },
            },
          ],
        );
      }

      // Localisation : même logique, permission déjà tranchée par ailleurs
      // dans l'app (écran "Près de toi") réutilisée sans redemander ici.
      const locationPerm = Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
      const locationStatus = await check(locationPerm);
      if (locationStatus === RESULTS.GRANTED) syncLocationForSuggestions();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Complète le pool de communautés en arrière-plan (même pattern que fetchMoreSuggestions)
  // — évite de répéter indéfiniment les mêmes 5 communautés à chaque bloc du flux.
  const fetchMoreCommunities = useCallback(async () => {
    if (commFetchingRef.current || commExhaustedRef.current) return;
    commFetchingRef.current = true;
    try {
      const nextCommPage = commPageRef.current + 1;
      const data = await communityService.list(nextCommPage, 8).catch(() => []);
      const list = Array.isArray(data) ? data : [];
      if (list.length === 0) {
        commExhaustedRef.current = true;
      } else {
        commPageRef.current = nextCommPage;
        if (list.length < 8) commExhaustedRef.current = true;
        setTrendingComm(prev => {
          const seen = new Set(prev.map(c => String(c.id)));
          const merged = [...prev, ...list.filter(c => !seen.has(String(c.id)))];
          trendingCommRef.current = merged;
          return merged;
        });
      }
    } catch { /* silencieux */ }
    finally { commFetchingRef.current = false; }
  }, []);

  // Retourne la tranche de communautés pour le bloc N (1-based), déclenche un fetch de
  // la page suivante si le pool ne couvre pas encore ce bloc.
  const sliceForCommBlock = useCallback((blockIndex: number): CommunityData[] => {
    const pool = trendingCommRef.current;
    if (pool.length === 0) return [];
    const start = (blockIndex - 1) * COMM_SLICE;
    if (start >= pool.length && !commExhaustedRef.current) {
      fetchMoreCommunities();
    }
    if (start >= pool.length) {
      const wrapped = start % pool.length;
      return pool.slice(wrapped, wrapped + COMM_SLICE);
    }
    return pool.slice(start, start + COMM_SLICE);
  }, [fetchMoreCommunities]);

  // ── Chargement de la pub feed — une campagne par emplacement, jamais deux fois la
  // même dans le même feed (exclude_ids envoyé au backend à chaque tirage). Retourne
  // l'id de la pub obtenue (ou null si aucune campagne disponible/restante).
  const fetchNextAd = useCallback(async (): Promise<string | null> => {
    try {
      // Dédupliqué avant envoi : load('all') et loadMoreFeed peuvent toutes deux appeler
      // assignAdsToSlots sur ce même seenAdIdsRef partagé (ex: refresh silencieux qui se
      // chevauche avec le prefetch anticipé) — sans garde explicite entre les deux, deux
      // appels concurrents peuvent pousser le même id ou lire un historique pas encore à
      // jour, produisant un exclude_ids avec des doublons observés côté logs serveur.
      const exclude = Array.from(new Set(seenAdIdsRef.current)).join(',');
      const url = `/api/v1/ads/feed/next?placement=feed${exclude ? `&exclude_ids=${exclude}` : ''}`;
      const res = await apiClient.get<AdData | null>(url);
      if (!res.data) return null;
      if (!seenAdIdsRef.current.includes(res.data.id)) {
        seenAdIdsRef.current.push(res.data.id);
      }
      setAdsById(prev => ({ ...prev, [res.data!.id]: res.data! }));
      return res.data.id;
    } catch {
      return null;
    }
  }, []);

  // Attribue une campagne distincte à chaque emplacement pub du feed — séquentiel pour
  // que chaque tirage voie bien l'exclusion mise à jour par les précédents (pas de doublon).
  // Chaînée sur adAssignQueueRef pour sérialiser aussi les appels concurrents entre eux
  // (load('all') vs loadMoreFeed) — un seul tirage de pub à la fois dans toute la session.
  const assignAdsToSlots = useCallback((slotIds: string[]): Promise<void> => {
    const run = async () => {
      for (const slotId of slotIds) {
        const adId = await fetchNextAd();
        if (!adId) break; // plus aucune campagne disponible — les slots restants resteront vides
        setAdSlotMap(prev => ({ ...prev, [slotId]: adId }));
      }
    };
    const next = adAssignQueueRef.current.then(run, run);
    adAssignQueueRef.current = next;
    return next;
  }, [fetchNextAd]);

  // ── Suivi (follow) state ──────────────────────────────────────────────────
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;
    userService.getFollowing(currentUser.id)
      .then((following: UserPublic[]) => setFollowingSet(new Set(following.map((u: any) => u.id))))
      .catch(() => {});
  }, [currentUser]);

  const handleToggleFollow = useCallback(async (authorId: string) => {
    const wasFollowing = followingSet.has(authorId);
    setFollowingSet(prev => {
      const next = new Set(prev);
      wasFollowing ? next.delete(authorId) : next.add(authorId);
      return next;
    });
    try {
      if (wasFollowing) {
        await userService.unfollow(authorId);
      } else {
        await userService.follow(authorId);
      }
    } catch {
      // Rollback optimiste
      setFollowingSet(prev => {
        const next = new Set(prev);
        wasFollowing ? next.add(authorId) : next.delete(authorId);
        return next;
      });
    }
  }, [followingSet, currentUser]);

  // Espacement d'injection des suggestions/communautés/pub — partagé entre load('all')
  // (page 1) et loadMoreFeed (pages suivantes) pour garder un rythme cohérent sur tout le flux.
  const SUGGEST_EVERY = 8;
  const COMM_EVERY    = 12;
  const AD_EVERY       = 8;
  const adSlotIdxRef  = useRef(0); // continue la numérotation des slots pub entre pages

  const load = useCallback(async (f: FeedFilter, silent = false) => {

    try {
      if (f === 'all') {
        // Reset pagination — uniquement pour un vrai rechargement (1er montage, pull-to-
        // refresh, changement de filtre). Un refresh silencieux (retour de focus) alors que
        // l'utilisateur a déjà scrollé plus loin ne doit PAS réinitialiser la pagination —
        // voir le early-return plus bas qui bloque ce cas avant de toucher aux items/refs.
        // Refresh silencieux alors que l'utilisateur a déjà scrollé plus loin (pages > 1) :
        // sortir tout de suite, AVANT tout fetch réseau et toute écriture de ref — sinon un
        // fetch page 1 (communities page=1, etc.) écraserait silencieusement les refs de
        // pagination déjà avancées (feedPageRef, trendingCommRef, commPageRef...) avec des
        // valeurs de page 1, cassant loadMoreFeed au prochain scroll sans que rien
        // ne se voie tout de suite (les items affichés, eux, ne changent pas).
        if (silent && feedPageRef.current > 1) {
          lastLoadedAtRef.current = Date.now();
          return;
        }

        if (!silent) {
          feedPageRef.current = 1;
          setHasMoreFeed(true);
          adSlotIdxRef.current = 0;
          seenAdIdsRef.current = [];
          feedHasMoreRef.current = true;
          commPageRef.current = 1;
          commExhaustedRef.current = false;
          trendingCommRef.current = [];
        }
        // Charge moins en 4G/5G (hors wifi) pour limiter la conso data au premier écran
        const onWifi = networkService.isWifi();
        const feedLimit  = onWifi ? 30 : 15;
        const reelsLimit = onWifi ? 20 : 10;

        // Tout est chargé ensemble avant le premier rendu — un affichage partiel
        // (posts seuls, puis remplacés par la liste complète avec events/concerts/
        // reels/pubs injectés) faisait "clignoter" le feed : les items déjà visibles
        // changeaient de position dès que le reste arrivait, et les events/concerts
        // semblaient absents du feed puisqu'ils n'apparaissaient jamais dans ce
        // premier rendu partiel. Un seul skeleton jusqu'à ce que tout soit prêt.
        const [feedResult, reelsResult, commResult, liveConcerts, spontLivesResult, myComms] = await Promise.all([
          searchService.getFeed(1, feedLimit).catch(() => ({ items: [] })),
          reelService.getFeed({ limit: reelsLimit }).catch(() => ({ items: [], has_more: false, page: 1 })),
          communityService.list(1, 8).catch(() => []),
          concertService.getLive().catch(() => [] as Concert[]),
          liveService.getLives().catch(() => [] as LiveStream[]),
          communityService.mine().catch(() => [] as CommunityData[]),
        ]);
        feedHasMoreRef.current = (feedResult.items ?? []).length >= feedLimit;
        setLiveConcerts(Array.isArray(liveConcerts) ? liveConcerts : []);
        setSpontLives(Array.isArray(spontLivesResult) ? spontLivesResult : []);
        myCommIdsRef.current = new Set((Array.isArray(myComms) ? myComms : []).map(c => String(c.id)));
        const commData: CommunityData[] = Array.isArray(commResult)
          ? commResult.slice(0, 5)
          : Array.isArray((commResult as any)?.items) && (commResult as any).items !== null
            ? (commResult as any).items.slice(0, 5)
            : [];
        setTrendingComm(commData);
        if (__DEV__) console.log('[Feed] commData:', commData.length, JSON.stringify(commData).slice(0, 200));
        if (__DEV__) {
          console.log('[Feed] feedResult:', JSON.stringify(feedResult).slice(0, 300));
          console.log('[Feed] reelsResult:', JSON.stringify(reelsResult).slice(0, 300));
        }
        // /search/feed retourne déjà events + concerts + posts avec un score unifié
        // (2026-08-12, remplace l'ancien double-appel /search/feed + /posts/feed).
        const feedItems: FeedItem[] = (feedResult.items ?? [])
          .filter((item: any) => (item.kind === 'event' || item.kind === 'concert' || item.kind === 'post') && item.id)
          .map((item: any) => ({
            kind: item.kind as 'event' | 'concert' | 'post',
            id: item.id,
            data: item,
          }));
        const reelItems: FeedItem[] = (Array.isArray(reelsResult?.items) ? reelsResult.items : Array.isArray(reelsResult) ? reelsResult : [])
          .filter((r: any) => r?.id)
          .map((r: any) => ({ kind: 'reel' as const, id: r.id, data: r }));
        // Dédupliquer par clé composite avant shuffle
        const seen = new Set<string>();
        const deduped = [...feedItems, ...reelItems].filter(item => {
          const key = `${item.kind}-${item.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Mélange déterministe : seed = jour courant → même ordre toute la journée
        // Evite le scroll aléatoire au retour sur l'écran (reload silent)
        const seed = Math.floor(Date.now() / 86_400_000); // change 1x/jour
        let s = seed;
        const seededRand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
        for (let i = deduped.length - 1; i > 0; i--) {
          const j = Math.floor(seededRand() * (i + 1));
          [deduped[i], deduped[j]] = [deduped[j], deduped[i]];
        }
        // Filtrer les contenus masqués ("Pas intéressé")
        const filtered = feedPreferenceService.filterFeed(deduped);

        // Extraire tous les reels et ne garder que les non-reels dans le flux principal
        const allReels   = filtered.filter(i => i.kind === 'reel');
        const nonReels   = filtered.filter(i => i.kind !== 'reel');

        // Découper les reels en blocs de 5 max pour les rangées horizontales
        const REELS_PER_ROW = 10;
        const reelRows: FeedItem[] = [];
        for (let r = 0; r < allReels.length; r += REELS_PER_ROW) {
          const chunk = allReels.slice(r, r + REELS_PER_ROW);
          reelRows.push({
            kind: 'reel_row',
            id: `__reel_row__${r}`,
            data: chunk.map(ri => ri.data).filter(Boolean),
          });
        }

        // Injecter suggestions, communities, pub et rangées de reels à intervalles réguliers
        const REEL_ROW_EVERY = 5; // une rangée de reels toutes les 5 cartes
        const result: FeedItem[] = [];
        let suggestCount = 0;
        let commCount    = 0;
        let reelRowIdx   = 0;
        const adSlotIds: string[] = [];

        nonReels.forEach((item, i) => {
          result.push(item);

          // Rangée de reels : première à pos 3, puis toutes les REEL_ROW_EVERY
          if (reelRowIdx < reelRows.length && (i === 2 || (i > 2 && (i - 2) % REEL_ROW_EVERY === 0))) {
            result.push(reelRows[reelRowIdx]);
            reelRowIdx += 1;
          }

          // Suggestions : première à pos 5, puis toutes les SUGGEST_EVERY
          if (i === 4 || (i > 4 && (i - 4) % SUGGEST_EVERY === 0)) {
            suggestCount += 1;
            result.push({ kind: 'suggestions', id: `__suggestions__${suggestCount}`, data: null });
          }

          // Publicité : un emplacement toutes les AD_EVERY cartes — chaque slot recevra
          // sa propre campagne (tirée séparément après coup, cf. fetchNextAd ci-dessous).
          if (i === AD_EVERY - 1 || (i > AD_EVERY - 1 && (i - (AD_EVERY - 1)) % AD_EVERY === 0)) {
            const slotId = `__ad__slot_${adSlotIdxRef.current}`;
            adSlotIdxRef.current += 1;
            adSlotIds.push(slotId);
            result.push({ kind: 'ad', id: slotId, data: null });
          }

          // Communities : première à pos 10, puis toutes les COMM_EVERY — data résolu au
          // rendu (sliceForCommBlock dans renderItem), pas figé ici : reflète le pool
          // renouvelé par fetchMoreCommunities même après l'insertion de ce bloc.
          if (commData.length > 0 && (i === 9 || (i > 9 && (i - 9) % COMM_EVERY === 0))) {
            commCount += 1;
            result.push({ kind: 'communities', id: `__communities__${commCount}`, data: null });
          }
        });

        // Ajouter les rangées de reels restantes à la fin
        while (reelRowIdx < reelRows.length) {
          result.push(reelRows[reelRowIdx]);
          reelRowIdx += 1;
        }

        // Mémorise les clés composites (kind-id) chargées en page 1 pour dédupliquer
        // les pages suivantes du scroll infini (loadMoreFeed)
        seenItemIdsRef.current = new Set(result.map(i => `${i.kind}-${i.id}`));
        // Continuité de l'espacement suggestions/communautés pour loadMoreFeed
        nonReelCountRef.current = nonReels.length;
        suggestCountRef.current = suggestCount;
        commCountRef.current    = commCount;
        // NE PAS écraser trendingCommRef par commData ici : fetchMoreCommunities (déclenché
        // en fire-and-forget par sliceForCommBlock pendant la construction de `result` juste
        // au-dessus) peut résoudre de façon asynchrone et avoir déjà fusionné un pool plus
        // riche dans trendingCommRef via setTrendingComm — écraser ici l'annulerait en race
        // condition selon le timing réseau. On ne (re)initialise le pool que s'il est encore
        // vide (vrai premier chargement) ; sinon on garde le pool déjà accumulé tel quel.
        if (trendingCommRef.current.length === 0) {
          trendingCommRef.current = commData;
        }

        // En mode silent : ne remplacer les items que si le contenu a réellement changé
        // Evite le re-render + reset de scroll au retour sur l'écran
        if (silent) {
          setItems(prev => {
            const prevIds = prev.map(i => i.id).join(',');
            const nextIds = result.map(i => i.id).join(',');
            return prevIds === nextIds ? prev : result;
          });
        } else {
          setItems(result);
        }
        // Tire une campagne distincte pour chaque nouvel emplacement pub de cette page
        if (adSlotIds.length > 0) assignAdsToSlots(adSlotIds);
      } else if (f === 'following') {
        // "Mes amis" — posts + events/concerts + reels des comptes suivis UNIQUEMENT
        // (exclusion stricte côté backend via following_only, pas juste un boost de
        // score comme le fil principal). Pas d'injection pub/suggestions/communautés :
        // contenu pur des amis, sans bruit de découverte. Tri chronologique — un fil
        // "amis" doit rester lisible dans l'ordre des publications, pas mélangé.
        const [feedResult, reelsResult] = await Promise.all([
          searchService.getFeed(1, 30, true).catch(() => ({ items: [] })),
          reelService.getFeed({ limit: 20, followingOnly: true }).catch(() => ({ items: [], has_more: false, page: 1 })),
        ]);
        const feedItems: FeedItem[] = (feedResult.items ?? [])
          .filter((item: any) => (item.kind === 'event' || item.kind === 'concert' || item.kind === 'post') && item.id)
          .map((item: any) => ({ kind: item.kind as 'event' | 'concert' | 'post', id: item.id, data: item }));
        const reelItems: FeedItem[] = (Array.isArray(reelsResult?.items) ? reelsResult.items : [])
          .filter((r: any) => r?.id)
          .map((r: any) => ({ kind: 'reel' as const, id: r.id, data: r }));

        const seen = new Set<string>();
        const merged = [...feedItems, ...reelItems].filter(item => {
          const key = `${item.kind}-${item.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        merged.sort((a, b) => {
          const da = a.data?.created_at ?? a.data?.starts_at ?? a.data?.scheduled_at ?? '';
          const db2 = b.data?.created_at ?? b.data?.starts_at ?? b.data?.scheduled_at ?? '';
          return new Date(db2).getTime() - new Date(da).getTime();
        });
        setItems(merged);
      } else if (f === 'live') {
        // Onglet En direct — concerts live + lives spontanés comme feed items
        const [concerts, spont] = await Promise.all([
          concertService.getLive().catch(() => [] as Concert[]),
          liveService.getLives().catch(() => [] as LiveStream[]),
        ]);
        const liveConc = Array.isArray(concerts) ? concerts : [];
        const liveSp   = Array.isArray(spont)    ? spont    : [];
        setLiveConcerts(liveConc);
        setSpontLives(liveSp);
        // On affiche les concerts live comme feed items
        const results: FeedItem[] = liveConc.map(c => ({ kind: 'concert' as const, id: c.id, data: c }));
        setItems(results);
      }
      lastLoadedAtRef.current = Date.now();
    } catch (err) {
      if (__DEV__) { console.warn('[FeedScreen] load error:', err); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assignAdsToSlots]);

  // Recharge quand le filtre change
  // setLoading(true) uniquement si aucun item visible — évite le flash skeleton
  const itemsRef = useRef<FeedItem[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // handleToggleFriends (bascule Général ↔ Mes amis) gère lui-même load() dans un
  // flux linéaire pour pouvoir attendre sa fin avant de repivoter l'animation —
  // pose ce flag à true juste avant son propre setFilter pour empêcher CET effect
  // de relancer un 2e appel à load() en double sur le même changement de filtre.
  const skipNextFilterLoadRef = useRef(false);
  // Le tout premier chargement est déjà déclenché par le useFocusEffect
  // ci-dessous (!didMountRef.current) — sans ce garde, cet effect se
  // déclenche AUSSI au montage initial (valeur initiale de `filter`),
  // doublant chaque appel réseau de load('all') au démarrage de l'app.
  const isFirstFilterEffectRef = useRef(true);

  useEffect(() => {
    if (isFirstFilterEffectRef.current) {
      isFirstFilterEffectRef.current = false;
      return;
    }
    if (skipNextFilterLoadRef.current) {
      skipNextFilterLoadRef.current = false;
      return;
    }
    if (itemsRef.current.length === 0) setLoading(true);
    load(filter);
  }, [filter]);

  // Scroll infini — page suivante de posts + reels + événements/concerts (recherche),
  // fusionnés et dédupliqués contre tout ce qui a déjà été chargé, ajoutés à la suite.
  const loadMoreFeed = useCallback(async () => {
    if (filter !== 'all') return; // pagination gérée uniquement pour le flux principal
    if (loadingMoreRef.current || !hasMoreFeed) return;
    loadingMoreRef.current = true;
    setLoadingMoreFeed(true);

    try {
      const nextPage = feedPageRef.current + 1;
      const onWifi = networkService.isWifi();
      const feedLimit  = onWifi ? 30 : 15;
      const reelsLimit = onWifi ? 20 : 10;

      const [feedResult, reelsResult] = await Promise.all([
        searchService.getFeed(nextPage, feedLimit).catch(() => ({ items: [] })),
        reelService.getFeed({ page: nextPage, limit: reelsLimit }).catch(() => ({ items: [], has_more: false, page: nextPage })),
      ]);
      const feedRawItems = feedResult.items ?? [];
      const reelRawItems = Array.isArray((reelsResult as any)?.items) ? (reelsResult as any).items : Array.isArray(reelsResult) ? reelsResult : [];
      feedHasMoreRef.current = feedRawItems.length >= feedLimit;
      // Le pool se retrie a chaque page (score = f(temps)) -- une page BRUTE non vide
      // peut ne contenir QUE des items deja vus sur une page precedente (recoupement),
      // sans que le catalogue soit pour autant epuise. Ne conclure a la fin du flux que
      // si le backend lui-meme ne renvoie plus rien, jamais seulement sur la dedup —
      // sinon le scroll s'arretait prematurement des la 1ere page entierement recoupee.
      const rawIsEmpty = feedRawItems.length === 0 && reelRawItems.length === 0;

      const feedItems: FeedItem[] = feedRawItems
        .filter((item: any) => (item.kind === 'event' || item.kind === 'concert' || item.kind === 'post') && item.id)
        .map((item: any) => ({ kind: item.kind as 'event' | 'concert' | 'post', id: item.id, data: item }));
      const reelItems: FeedItem[] = reelRawItems
        .filter((r: any) => r?.id)
        .map((r: any) => ({ kind: 'reel' as const, id: r.id, data: r }));

      // Dédupliquer contre tout ce qui a déjà été affiché (page courante + précédentes)
      const fresh = [...feedItems, ...reelItems].filter(item => {
        const key = `${item.kind}-${item.id}`;
        if (seenItemIdsRef.current.has(key)) return false;
        seenItemIdsRef.current.add(key);
        return true;
      });

      feedPageRef.current = nextPage;

      if (fresh.length === 0) {
        // Page entierement recoupee (deja vue) : le flux n'est fini que si le
        // backend n'a lui-meme plus rien a offrir, sinon on avance juste la page
        // (l'utilisateur re-declenchera le scroll naturellement pour la suivante).
        if (rawIsEmpty) setHasMoreFeed(false);
      } else {
        // Regrouper les reels de cette page en une rangée, injectée après le 1er post/event
        // de la page (même logique de position que load('all') : première rangée à i===2)
        const freshReels   = fresh.filter(i => i.kind === 'reel');
        const freshNonReel = fresh.filter(i => i.kind !== 'reel');
        const reelRow: FeedItem | null = freshReels.length > 0
          ? { kind: 'reel_row', id: `__reel_row__page_${nextPage}`, data: freshReels.map(r => r.data).filter(Boolean) }
          : null;

        // Continue l'espacement suggestions/communautés exactement là où la page
        // précédente (load('all') ou loadMoreFeed) s'est arrêtée.
        const appended: FeedItem[] = [];
        let reelRowInserted = false;
        const commData = trendingCommRef.current;
        const adSlotIds: string[] = [];
        freshNonReel.forEach((item, localI) => {
          const i = nonReelCountRef.current + localI; // index continu depuis le tout début du flux
          appended.push(item);

          if (!reelRowInserted && reelRow) {
            appended.push(reelRow);
            reelRowInserted = true;
          }

          if (i === 4 || (i > 4 && (i - 4) % SUGGEST_EVERY === 0)) {
            suggestCountRef.current += 1;
            appended.push({ kind: 'suggestions', id: `__suggestions__${suggestCountRef.current}`, data: null });
          }

          if (i === AD_EVERY - 1 || (i > AD_EVERY - 1 && (i - (AD_EVERY - 1)) % AD_EVERY === 0)) {
            const slotId = `__ad__slot_${adSlotIdxRef.current}`;
            adSlotIdxRef.current += 1;
            adSlotIds.push(slotId);
            appended.push({ kind: 'ad', id: slotId, data: null });
          }

          if (commData.length > 0 && (i === 9 || (i > 9 && (i - 9) % COMM_EVERY === 0))) {
            commCountRef.current += 1;
            appended.push({ kind: 'communities', id: `__communities__${commCountRef.current}`, data: null });
          }
        });
        // Si aucun post/event neuf mais des reels quand même, ajouter la rangée en fin
        if (reelRow && !reelRowInserted) appended.push(reelRow);

        nonReelCountRef.current += freshNonReel.length;
        setItems(prev => [...prev, ...appended]);
        if (adSlotIds.length > 0) assignAdsToSlots(adSlotIds);
      }
    } catch (err) {
      if (__DEV__) console.warn('[FeedScreen] loadMoreFeed error:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMoreFeed(false);
    }
  }, [filter, hasMoreFeed, assignAdsToSlots]);
  useEffect(() => { loadMoreFeedRef.current = loadMoreFeed; }, [loadMoreFeed]);

  // Près de toi — chargé dès que la position est disponible
  useEffect(() => {
    if (!userLocation) return;
    eventService.list({
      limit: 8, lat: userLocation.lat, lon: userLocation.lon,
      radius_km: 20, status: 'published', noCache: true,
    }).then(data => {
      setNearbyEvents(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, [userLocation]);

  // Charger les lives en direct (appelé aussi depuis load('all') via Promise.all)
  const loadLive = useCallback(async () => {
    try {
      const [concerts, spont] = await Promise.all([
        concertService.getLive(),
        liveService.getLives(),
      ]);
      setLiveConcerts(Array.isArray(concerts) ? concerts : []);
      setSpontLives(Array.isArray(spont) ? spont : []);
    } catch { /* silencieux */ }
  }, []);

  // WS : nouveau live spontané démarré → refetch pour respecter is_private + follow
  useEffect(() => {
    if (!lastLiveStarted) return;
    liveService.getLives()
      .then(lives => { setSpontLives(Array.isArray(lives) ? lives : []); })
      .catch(() => {});
  }, [lastLiveStarted]);

  // WS : live spontané terminé
  useEffect(() => {
    if (!lastLiveEnded) return;
    setSpontLives(prev => prev.filter(l => l.id !== lastLiveEnded));
  }, [lastLiveEnded]);

  // WS : viewers mis à jour
  useEffect(() => {
    if (!lastLiveViewersUpdated) return;
    setSpontLives(prev => prev.map(l =>
      l.id === lastLiveViewersUpdated.live_id
        ? { ...l, current_viewers: lastLiveViewersUpdated.current_viewers }
        : l
    ));
  }, [lastLiveViewersUpdated]);

  // WS : mise à jour is_online en temps réel sur les cartes du feed
  useEffect(() => {
    if (!lastPresenceUpdate) return;
    const { user_id, is_online } = lastPresenceUpdate;
    setItems(prev => prev.map(item => {
      const d = item.data as any;
      if (!d) return item;
      const authorKey = d.organizer ? 'organizer' : d.artist ? 'artist' : d.author ? 'author' : null;
      if (!authorKey) return item;
      if (String(d[authorKey]?.id) !== String(user_id)) return item;
      return { ...item, data: { ...d, [authorKey]: { ...d[authorKey], is_online } } };
    }));
  }, [lastPresenceUpdate]);

  // Rafraîchissement temps réel : reload quand un autre utilisateur publie
  useEffect(() => {
    const handler = (payload: { type: string }) => {
      if (payload.type === 'feed_updated') load(filter);
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [filter, load, addListener, removeListener]);

  // Focus : reprise vidéo + rechargement silencieux au retour (stale-while-revalidate)
  const didMountRef = useRef(false);
  useFocusEffect(useCallback(() => {
    setFeedFocused(true);
    if (!didMountRef.current) {
      // Premier chargement : différer après l'animation de navigation (16ms = 1 frame)
      const timer = setTimeout(() => load(filter), 16);
      didMountRef.current = true;
      return () => {
        clearTimeout(timer);
        setFeedFocused(false);
        setActiveReelId(null);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setSearchQuery('');
        setSearchResults(null);
        setSearchOpen(false);
        setSearchFilter('all');
        searchBarWidth.value = 0;
        searchBarOpacity.value = 0;
      };
    }
    // Retour : refresh silencieux si données > 60s
    const age = Date.now() - lastLoadedAtRef.current;
    if (age > 60_000) {
      load(filter, true);
    }
    return () => {
      setFeedFocused(false);
      setActiveReelId(null);
      // Vider la recherche quand on quitte le tab
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      setSearchQuery('');
      setSearchResults(null);
      setSearchOpen(false);
      setSearchFilter('all');
      searchBarWidth.value = 0;
      searchBarOpacity.value = 0;
    };
  }, [filter]));

  // ── Posts ──────────────────────────────────────────────────────────────────

  const handlePostDeleted = useCallback((postId: string) => {
    setItems(prev => prev.filter(item => !(item.kind === 'post' && item.id === postId)));
  }, []);

  // ── Comments sheet ─────────────────────────────────────────────────────────

  const openComments = useCallback((item: FeedItem) => {
    setCommentItem(item);
    setCommentVisible(true);
  }, []);

  const goToMessages = useCallback(() => nav.navigate('Messages' as any), [nav]);
  const goToNotifs   = useCallback(() => nav.navigate('Notifications' as any), [nav]);

  // Bascule Général ↔ Mes amis — flux linéaire unique, aucune animation de
  // transform (les essais précédents avec flip 3D ou fondu laissaient l'ancien/
  // nouveau contenu se chevaucher ou disparaître pendant le chargement réseau).
  const flipInProgressRef = useRef(false);

  // switchingFilter affiche le skeleton (déjà utilisé pour le 1er chargement) PENDANT
  // toute la durée du rechargement — le nouveau contenu (posts+events+concerts+reels,
  // 6 requêtes en parallèle pour "Général") n'est jamais révélé avant d'être
  // complètement prêt. Un simple fondu laissait l'utilisateur face à un écran vide
  // sans aucun retour visuel pendant les quelques secondes du chargement réseau —
  // ça donnait l'impression d'un bug ("page blanche qui ne reprend jamais") alors
  // que les données arrivaient simplement après coup, sans indicateur pour patienter.
  const [switchingFilter, setSwitchingFilter] = useState(false);

  const handleToggleFriends = useCallback(async () => {
    if (flipInProgressRef.current) return; // évite un double-tap pendant le chargement
    flipInProgressRef.current = true;
    const next = filter === 'following' ? 'all' : 'following';

    setSwitchingFilter(true);
    try {
      skipNextFilterLoadRef.current = true;
      setFilter(next);
      await load(next);
    } finally {
      setSwitchingFilter(false);
      flipInProgressRef.current = false;
    }
  }, [filter, load]);
  const openMenu     = useCallback(() => (nav as any).navigate('ExplorerMenu'), [nav]);

  // ── Callbacks stables pour FeedListHeader ──────────────────────────────────
  const onNavLiveList    = useCallback(() => nav.navigate('LiveList' as any), [nav]);
  const onNavSpontList   = useCallback(() => nav.navigate('SimpleLiveList' as any), [nav]);
  const onNavNearby      = useCallback(() => nav.navigate('NearbyEvents' as any), [nav]);
  const onNavLiveStream  = useCallback((id: string) => nav.navigate('LiveStream', { concertId: id }), [nav]);
  const onNavLiveViewer  = useCallback((id: string) => nav.navigate('LiveViewer', { concertId: id }), [nav]);
  const onNavSpontStream = useCallback((id: string) => (nav as any).navigate('SimpleLiveStream', { liveId: id, isPrivate: false }), [nav]);
  const onNavSpontViewer = useCallback((id: string) => (nav as any).navigate('SimpleLiveViewer', { liveId: id }), [nav]);
  const onNavEvent       = useCallback((id: string) => nav.navigate('EventDetail', { eventId: id }), [nav]);

  const onNavMyStories   = useCallback(() => nav.navigate('MyStories'), [nav]);
  const onNavChat        = useCallback((partnerId: string, partnerName: string, avatarUrl?: string) =>
    nav.navigate('Chat', { partnerId, partnerName, avatarUrl }), [nav]);
  const onNavCall        = useCallback((partnerId: string, partnerName: string, callType: 'voice' | 'video', avatarUrl?: string) =>
    nav.navigate('Call', { partnerId, partnerName, partnerAvatar: avatarUrl, callType, isIncoming: false }), [nav]);

  const feedListHeader = useMemo(() => (
    <>
      {/* Stories scrollent avec le feed — style Instagram/WhatsApp */}
      <StoryBar
        currentUser={currentUser}
        colors={colors}
        onNavigateToMyStories={onNavMyStories}
        onNavigateToChat={onNavChat}
        onNavigateToCall={onNavCall}
      />
      <FeedListHeader
        liveConcerts={liveConcerts}
        spontLives={spontLives}
        nearbyEvents={nearbyEvents}
        colors={colors}
        isDark={theme.isDark}
        currentUserId={currentUser?.id}
        filter={filter}
        onNavLiveList={onNavLiveList}
        onNavSpontList={onNavSpontList}
        onNavNearby={onNavNearby}
        onNavLiveStream={onNavLiveStream}
        onNavLiveViewer={onNavLiveViewer}
        onNavSpontStream={onNavSpontStream}
        onNavSpontViewer={onNavSpontViewer}
        onNavEvent={onNavEvent}
      />
    </>
  ), [liveConcerts, spontLives, nearbyEvents, colors, theme.isDark,
      currentUser, currentUser?.id, filter,
      onNavMyStories, onNavChat, onNavCall,
      onNavLiveList, onNavSpontList, onNavNearby, onNavLiveStream, onNavLiveViewer,
      onNavSpontStream, onNavSpontViewer, onNavEvent]);


  const closeComments = useCallback(() => {
    setCommentVisible(false);
    setCommentItem(null);
  }, []);

  // ── Publicité — handlers stables ──────────────────────────────────────────

  const handleAdImpression = useCallback((adId: string) => {
    apiClient.post(`/api/v1/ads/${adId}/impression`).catch(() => {});
  }, []);

  const handleAdPress = useCallback((adId: string, url: string) => {
    apiClient.post(`/api/v1/ads/${adId}/click`).catch(() => {});
    Linking.openURL(url).catch(() => {});
  }, []);

  // ── renderItem stable ──────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    if (!item) return null;
    if (item.kind === 'suggestions') {
      const blockNum = parseInt(item.id.split('__suggestions__')[1] ?? '1', 10) || 1;
      // Exclure les utilisateurs déjà suivis ou soi-même
      const myId = currentUser?.id ? String(currentUser.id) : null;
      const filteredUsers = sliceForBlock(blockNum).filter(u =>
        !followingSet.has(String(u.id)) && String(u.id) !== myId
      );
      if (!suggestLoading && filteredUsers.length === 0) return null;
      return (
        <PeopleSuggestions
          users={filteredUsers}
          loading={suggestLoading}
          onUserPress={id => nav.navigate('UserProfile', { userId: id })}
          onRefresh={loadSuggestions}
        />
      );
    }
    if (item.kind === 'communities') {
      // Calculé au rendu (pas figé à l'insertion) — se met à jour automatiquement quand
      // fetchMoreCommunities enrichit le pool en arrière-plan (voir sliceForCommBlock).
      const commBlockNum = parseInt(item.id.split('__communities__')[1] ?? '1', 10) || 1;
      const allComms: CommunityData[] = sliceForCommBlock(commBlockNum);
      const JOINED = new Set(['member', 'admin', 'moderator']);
      const comms = allComms.filter(c =>
        !myCommIdsRef.current.has(String(c.id)) && !JOINED.has(c.join_status as string)
      );
      if (!comms.length) return null;
      const gradFor = (_name: string): [string, string] =>
        [colors.primary, colors.primaryLight];
      const fmtM = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
      // Mêmes dimensions que PeopleSuggestions
      const SW       = Dimensions.get('window').width;
      const CARD_W   = SW * 0.45;
      const COVER_H  = CARD_W * 0.5;
      const AVT_SZ   = CARD_W * 0.4;
      return (
        <View style={[cs.wrap, { borderTopColor: colors.divider, borderBottomColor: colors.divider, backgroundColor: colors.background }]}>
          {/* Header identique aux suggestions */}
          <View style={cs.header}>
            <View>
              <Text style={[cs.title, { color: colors.textPrimary }]}>Ta tribu t'attend 🤝</Text>
              <Text style={[cs.subtitle, { color: colors.textTertiary }]}>Des espaces faits pour toi, rejoins-les</Text>
            </View>
            <TouchableOpacity onPress={() => nav.navigate('Communities' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[cs.seeAll, { color: colors.primary }]}>Explorer</Text>
            </TouchableOpacity>
          </View>
          {/* Scroll horizontal identique */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.list}>
            {comms.map(comm => {
              const grad    = gradFor(comm.name);
              const initial = (comm.name || '?')[0].toUpperCase();
              return (
                <TouchableOpacity
                  key={comm.id}
                  style={[cs.card, { width: CARD_W, backgroundColor: colors.surface, borderColor: colors.divider }]}
                  activeOpacity={0.88}
                  onPress={() => nav.navigate('CommunityDetail' as any, { communityId: comm.id })}
                >
                  {/* Cover — bannière ou gradient */}
                  {comm.banner_url
                    ? <CachedImage uri={comm.banner_url} style={[cs.cover, { height: COVER_H }]} resizeMode="cover" />
                    : <LinearGradient colors={grad} style={[cs.cover, { height: COVER_H }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                  }
                  {/* Badges privé / vérifié */}
                  <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 4 }}>
                    {comm.is_private  && <View style={cs.badge}><Icon name="lock"  size={9}  color="#fff" /></View>}
                    {comm.is_verified && <View style={[cs.badge, { backgroundColor: '#1D9BF0' }]}><Icon name="check" size={10} color="#fff" /></View>}
                  </View>
                  {/* Avatar chevauchant — même style que PeopleSuggestions */}
                  <View style={[cs.avatarWrap, { width: AVT_SZ + 4, height: AVT_SZ + 4, borderRadius: (AVT_SZ + 4) / 2, borderColor: colors.background, marginTop: -(AVT_SZ / 2) }]}>
                    {comm.avatar_url
                      ? <CachedImage uri={comm.avatar_url} style={{ width: AVT_SZ, height: AVT_SZ, borderRadius: AVT_SZ / 2 }} />
                      : <LinearGradient colors={grad} style={{ width: AVT_SZ, height: AVT_SZ, borderRadius: AVT_SZ / 2, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: AVT_SZ * 0.38 }}>{initial}</Text>
                        </LinearGradient>
                    }
                  </View>
                  {/* Body */}
                  <View style={[cs.cardBody, { paddingTop: AVT_SZ / 2 + 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <Text style={[cs.name, { color: colors.textPrimary }]} numberOfLines={1}>{comm.name}</Text>
                    </View>
                    <Text style={[cs.handle, { color: colors.textTertiary }]} numberOfLines={1}>
                      <Icon name="users" size={10} color={colors.textTertiary} /> {fmtM(comm.members_count ?? 0)} membres
                    </Text>
                    {/* Bouton rejoindre — même style que Suivre */}
                    <TouchableOpacity
                      style={[cs.joinBtn, { backgroundColor: colors.primary }]}
                      activeOpacity={0.8}
                      onPress={() => nav.navigate('CommunityDetail' as any, { communityId: comm.id })}
                    >
                      <Icon name="users" size={14} color="#fff" />
                      <Text style={cs.joinText}>Nous rejoindre</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    }
    if (item.kind === 'ad') {
      // item.id est le slotId (__ad__slot_N) — résolu vers la campagne qui lui a été
      // attribuée par assignAdsToSlots. Reste null tant que le tirage n'a pas répondu.
      const adId = adSlotMap[item.id];
      const ad = adId ? adsById[adId] : null;
      if (!ad) return null;
      return (
        <AdCard
          ad={ad}
          colors={colors}
          isVisible={adVisible}
          onImpression={handleAdImpression}
          onPress={handleAdPress}
          onOpenFullscreen={setFullscreenAd}
        />
      );
    }
    if (item.kind === 'reel_row') {
      return (
        <ReelRowCard
          reels={item.data}
          colors={colors}
          feedFocused={feedFocused}
          isVisible={activeReelRowId === item.id && feedFocused}
          onPressReel={(reelId, reelData) => (nav as any).navigate('Tabs', { screen: 'Reels', params: { initialReelId: reelId, initialReel: reelData } })}
        />
      );
    }
    if (item.kind === 'post') {
      if (!item.data) return null;
      const postAuthorId = (item.data as Post).author?.id;
      return (
        <PostCard
          post={item.data as Post}
          colors={colors}
          currentUserId={currentUser?.id}
          onPress={() => (nav as any).navigate('PostDetail', { postId: item.id, initialPost: item.data })}
          onAuthorPress={() => {
            if (postAuthorId) (nav as any).navigate('UserProfile', { userId: postAuthorId });
          }}
          onProfilePress={(userId) => (nav as any).navigate('UserProfile', { userId })}
          onDelete={handlePostDeleted}
          isFollowing={!!postAuthorId && followingSet.has(postAuthorId)}
          onToggleFollow={() => { if (postAuthorId) handleToggleFollow(postAuthorId); }}
          onHide={() => {
            feedPreferenceService.toggleHide(item.id, 'post');
            setItems(prev => prev.filter(i => !(i.kind === 'post' && i.id === item.id)));
          }}
        />
      );
    }
    if (!item.data) return null;
    const aid = item.kind === 'event'
      ? (item.data as Event)?.organizer?.id
      : (item.data as Concert)?.artist?.id;
    return (
      <FeedCard
        item={item}
        colors={colors}
        currentUserId={currentUser?.id}
        isFollowing={!!aid && followingSet.has(aid)}
        onToggleFollow={() => { if (aid) handleToggleFollow(aid); }}
        onComment={(onCountChange, onCountLoaded) => { commentCountChangeRef.current = onCountChange; commentCountLoadedRef.current = onCountLoaded; openComments(item); }}
        onPress={() => {
          if (item.kind === 'concert') nav.navigate('ConcertDetail', { concertId: item.id });
          else nav.navigate('EventDetail', { eventId: item.id });
        }}
        onAuthorPress={() => { if (aid) (nav as any).navigate('UserProfile', { userId: aid }); }}
        onHide={() => setItems(prev => prev.filter(i => !(i.kind === item.kind && i.id === item.id)))}
      />
    );
  }, [colors, currentUser?.id, followingSet, handleToggleFollow, handlePostDeleted, openComments, nav, sliceForBlock, sliceForCommBlock, suggestLoading, loadSuggestions]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const displayName = currentUser?.display_name ?? currentUser?.first_name ?? currentUser?.username ?? '';
  const initials = displayName ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?';

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor={theme.isDark ? 'transparent' : colors.surface}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
        <View style={s.headerRow}>
          {/* Gauche : avatar + nom tronqué — masqué si recherche ouverte */}
          {!searchOpen && (
            !currentUser ? (
              <View style={[s.headerLeft, { pointerEvents: 'none' }]}>
                <SkeletonBox width={34} height={34} borderRadius={17} />
                <SkeletonBox width={60} height={12} borderRadius={6} />
              </View>
            ) : (
              <View style={s.headerLeft}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}
                  activeOpacity={0.7}
                  onPress={() => currentUser.id && (nav as any).navigate('UserProfile', { userId: currentUser.id })}
                >
                  {currentUser.avatar_url ? (
                    <CachedImage uri={currentUser.avatar_url} style={s.avatar} />
                  ) : (
                    <View style={[s.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
                      <Text style={[s.avatarText, { color: colors.primary }]}>{initials}</Text>
                    </View>
                  )}
                  {displayName ? (
                    <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: -0.1, color: colors.textPrimary, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">
                      {displayName.split(' ')[0]}
                    </Text>
                  ) : null}
                </TouchableOpacity>
                {displayName ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (!showProfilePanel) setAccounts(accountsService.listAccounts());
                      setShowProfilePanel(v => !v);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
                    style={{ paddingLeft: 2 }}
                  >
                    <Icon name={showProfilePanel ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textPrimary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )
          )}

          {/* ── Panneau infos primaires — s'ouvre sous le header, se ferme au tap extérieur ── */}
          {showProfilePanel && currentUser && (
            <>
              <TouchableWithoutFeedback onPress={() => setShowProfilePanel(false)}>
                <View style={StyleSheet.absoluteFill} />
              </TouchableWithoutFeedback>
              <View
                style={{
                  position: 'absolute', top: '100%', left: 12, marginTop: 6, zIndex: 50,
                  width: 260, borderRadius: 16, padding: 16,
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider,
                  shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {currentUser.avatar_url ? (
                    <CachedImage uri={currentUser.avatar_url} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>{initials}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 }} numberOfLines={1}>
                        {currentUser.display_name ?? currentUser.first_name ?? currentUser.username}
                      </Text>
                      {currentUser.is_verified && <Icon name="check-circle" size={14} color={colors.primary} />}
                    </View>
                    {currentUser.username && (
                      <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }} numberOfLines={1}>@{currentUser.username}</Text>
                    )}
                  </View>
                </View>
                {currentUser.bio && (
                  <Text style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 10, lineHeight: 17 }} numberOfLines={3}>
                    {currentUser.bio}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => { setShowProfilePanel(false); currentUser.id && (nav as any).navigate('UserProfile', { userId: currentUser.id }); }}
                  activeOpacity={0.85}
                  style={{ marginTop: 12, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.primary + '18' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>Voir le profil</Text>
                </TouchableOpacity>

                {/* Multi-compte — bascule rapide, sans repasser par les Paramètres */}
                {accounts.length > 1 && (
                  <>
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: 12 }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: colors.textTertiary, marginBottom: 8 }}>
                      MES COMPTES
                    </Text>
                    {accounts.map(account => {
                      const isSwitching = switchingAccountId === account.user_id;
                      const initial = (account.display_name || account.username || '?')[0]?.toUpperCase() ?? '?';
                      return (
                        <TouchableOpacity
                          key={account.user_id}
                          activeOpacity={account.is_active ? 1 : 0.7}
                          disabled={account.is_active || !!switchingAccountId}
                          onPress={async () => {
                            if (account.is_active || !onSwitchAccount) return;
                            setSwitchingAccountId(account.user_id);
                            try {
                              await onSwitchAccount(account.user_id);
                              setShowProfilePanel(false);
                            } catch (e: any) {
                              toastService.error('Connexion impossible', e?.message ?? 'Ce compte ne semble plus valide.');
                            } finally {
                              setSwitchingAccountId(null);
                            }
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
                        >
                          {account.avatar_url ? (
                            <CachedImage uri={account.avatar_url} style={{ width: 32, height: 32, borderRadius: 16 }} />
                          ) : (
                            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{initial}</Text>
                            </View>
                          )}
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                            {account.display_name || account.username}
                          </Text>
                          {isSwitching ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : account.is_active ? (
                            <Icon name="check-circle" size={16} color={colors.primary} />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
                <TouchableOpacity
                  onPress={() => { setShowProfilePanel(false); (nav as any).navigate('SettingsCompte'); }}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: accounts.length > 1 ? 10 : 12, paddingTop: accounts.length > 1 ? 4 : 0 }}
                >
                  <Icon name="plus-circle" size={15} color={colors.textSecondary} />
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.textSecondary }}>Gérer les comptes</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Centre : GoFolyX — même style que "Reels" dans ReelsScreen */}
          {!searchOpen && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
              <Text style={{ fontSize: logoFontSize, fontWeight: '900', letterSpacing: 0.2, color: colors.textPrimary }} numberOfLines={1}>
                <Text style={{ color: colors.primary }}>G</Text>oFoly<Text style={{ color: colors.primary }}>X</Text>
              </Text>
            </View>
          )}

          {/* Barre de recherche animée — apparaît quand searchOpen */}
          {searchOpen && (
            <Animated.View style={[animatedSearchBar, {
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 12, height: 38,
              borderRadius: 20, borderWidth: 1,
              borderColor: colors.primary + '55',
              backgroundColor: colors.backgroundSecondary,
              gap: 8, flex: 1, marginRight: 8,
            }]}>
              <Icon name="search" size={16} color={colors.primary} />
              <TextInput
                ref={searchInputRef}
                placeholder="Rechercher..."
                placeholderTextColor={colors.textDisabled}
                style={{ flex: 1, fontSize: 14, color: colors.textPrimary, padding: 0 }}
                returnKeyType="search"
                value={searchQuery}
                onChangeText={(text) => { setSearchQuery(text); liveSearch(text, searchFilter); }}
                onSubmitEditing={() => {
                  if (!searchQuery.trim()) return;
                  commitSearch(searchQuery);
                  liveSearch(searchQuery, searchFilter);
                }}
              />
              {searching && <ActivityIndicator size="small" color={colors.primary} />}
              {searchQuery.length > 0 && !searching && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults(null); }}>
                  <Icon name="x-circle" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Droite : search + menu avec cercle bordure */}
          <View style={s.headerRight}>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: searchOpen ? colors.primary + '22' : colors.backgroundSecondary, borderWidth: 1.5, borderColor: colors.border }]}
              onPress={searchOpen ? closeSearch : openSearch}
            >
              <Icon name={searchOpen ? 'x' : 'search'} size={19} color={searchOpen ? colors.primary : colors.textPrimary} />
            </TouchableOpacity>
            {!searchOpen && (
              <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.backgroundSecondary, borderWidth: 1.5, borderColor: colors.border }]} onPress={openMenu}>
                <Icon name="menu" size={19} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
          </View>
        </View>


        {/* ── Actions ────────────────────────────────────────────────────── */}
        {!searchOpen && (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, marginTop: 8, paddingTop: 10, paddingBottom: 8 }}>
            <FeedHeaderBadges
              onMessages={goToMessages}
              onNotifs={goToNotifs}
              onMenu={openMenu}
              onFavorites={() => nav.navigate('Favorites')}
              onLive={() => nav.navigate('GoLive')}
              onFriends={handleToggleFriends}
              friendsActive={filter === 'following'}
              colors={colors}
            />
          </View>
        )}

      </View>


      {searchOpen ? (
        /* ── Overlay recherche plein écran ──────────────────────────────── */
        <Animated.View entering={FadeInDown.duration(180)} style={{ flex: 1, backgroundColor: colors.background }}>
          {(() => {
            const CATS: { key: 'all'|'users'|'events'|'concerts'|'reels'|'films'; label: string; icon: string; accent: string }[] = [
              { key: 'all',      label: 'Tout',        icon: 'grid',     accent: colors.primary },
              { key: 'users',    label: 'Personnes',   icon: 'users',    accent: '#7B3FF2' },
              { key: 'events',   label: 'Événements',  icon: 'calendar', accent: '#0EA5E9' },
              { key: 'concerts', label: 'Concerts',    icon: 'music',    accent: '#E0389A' },
              { key: 'reels',    label: 'Reels',       icon: 'video',    accent: '#10B981' },
              { key: 'films',    label: 'Films',       icon: 'film',     accent: '#F59E0B' },
            ];

            const SrThumb = ({ uri, icon, accent, round }: { uri?: string | null; icon: string; accent: string; round?: boolean }) =>
              uri ? (
                <CachedImage uri={uri} style={{ width: 52, height: 52, borderRadius: round ? 26 : 12 }} />
              ) : (
                <View style={{ width: 52, height: 52, borderRadius: round ? 26 : 12, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={20} color={accent} />
                </View>
              );

            const SrRow = ({ onPress, children, last }: { onPress?: () => void; children: React.ReactNode; last?: boolean }) => (
              <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.divider,
                }}
              >
                {children}
              </TouchableOpacity>
            );

            const SrSection = ({ icon, label, count, accent }: { icon: string; label: string; count: number; accent: string }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>
                <LinearGradient colors={[accent, accent + 'AA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={13} color="#fff" />
                </LinearGradient>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.2, textTransform: 'uppercase' }}>{label}</Text>
                <View style={{ backgroundColor: accent + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: accent }}>{count}</Text>
                </View>
              </View>
            );

            // Card grille 9:16 — pour les résultats média (concerts, événements, reels, films, séries)
            const SrGridCard = ({ uri, icon, accent, title, sub, onPress }: {
              uri?: string | null; icon: string; accent: string; title: string; sub?: string; onPress: () => void;
            }) => (
              <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ width: '33%', padding: 4 }}>
                <View style={{ aspectRatio: 9 / 16, borderRadius: 14, overflow: 'hidden', backgroundColor: accent + '15' }}>
                  {uri ? (
                    <CachedImage uri={uri} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={icon} size={26} color={accent} />
                    </View>
                  )}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.85)']}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', justifyContent: 'flex-end', padding: 8 }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }} numberOfLines={2}>{title}</Text>
                    {sub && <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2 }} numberOfLines={1}>{sub}</Text>}
                  </LinearGradient>
                  <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={icon} size={11} color="#fff" />
                  </View>
                </View>
              </TouchableOpacity>
            );

            const SrGrid = ({ children }: { children: React.ReactNode }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 }}>{children}</View>
            );

            // État idle — pas encore de query
            if (!searchQuery.trim() && !searchResults) return (
              <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Pub — préchargée dès openSearch(), visible immédiatement à l'ouverture
                    sans attendre la moindre frappe. */}
                {searchAd && (
                  <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                    <AdCard
                      ad={searchAd}
                      colors={colors}
                      isVisible={searchOpen}
                      onImpression={handleAdImpression}
                      onPress={handleAdPress}
                      onOpenFullscreen={setFullscreenAd}
                    />
                  </View>
                )}

                {/* ── Historique ── */}
                {searchHistory.length > 0 && (
                  <View style={{ paddingTop: 20, paddingBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>Recherches récentes</Text>
                      <TouchableOpacity
                        onPress={() => { searchHistoryService.clear(); setSearchHistory([]); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>Tout effacer</Text>
                      </TouchableOpacity>
                    </View>
                    {searchHistory.map((h, i) => (
                      <View
                        key={h.query}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          paddingHorizontal: 16, paddingVertical: 11,
                          borderBottomWidth: i < searchHistory.length - 1 ? StyleSheet.hairlineWidth : 0,
                          borderBottomColor: colors.divider,
                        }}
                      >
                        <TouchableOpacity
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                          activeOpacity={0.7}
                          onPress={() => {
                            setSearchQuery(h.query);
                            setSearchFilter('all');
                            liveSearch(h.query, 'all');
                            commitSearch(h.query);
                          }}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="clock" size={14} color={colors.textTertiary} />
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 }} numberOfLines={1}>{h.query}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { searchHistoryService.remove(h.query); setSearchHistory(searchHistoryService.getAll()); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Icon name="x" size={14} color={colors.textTertiary} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Catégories rapides */}
                <View style={{ paddingHorizontal: 16, paddingTop: searchHistory.length > 0 ? 20 : 24, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Explorer</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {[
                      { icon: 'calendar', label: 'Événements', accent: '#0EA5E9', nav: 'Events' },
                      { icon: 'music',    label: 'Concerts',   accent: '#E0389A', nav: 'Concerts' },
                      { icon: 'video',    label: 'Reels',      accent: '#10B981', nav: 'Tabs/Reels' },
                      { icon: 'film',     label: 'Films',      accent: '#3B82F6', nav: 'Movies' },
                      { icon: 'tv',       label: 'Séries',     accent: '#7B3FF2', nav: 'Series' },
                      { icon: 'trending-up', label: 'Tendances', accent: '#6366F1', nav: 'Trending' },
                      { icon: 'users',    label: 'Communautés', accent: '#7B3FF2', nav: 'Communities' },
                    ].map(({ icon, label, accent, nav: navTarget }) => (
                      <TouchableOpacity
                        key={label}
                        activeOpacity={0.75}
                        onPress={() => {
                          closeSearch();
                          if (navTarget === 'Tabs/Reels') {
                            (nav as any).navigate('Tabs', { screen: 'Reels' });
                          } else {
                            (nav as any).navigate(navTarget);
                          }
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                          paddingHorizontal: 14, paddingVertical: 10,
                          borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
                          borderColor: colors.divider,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={icon} size={14} color={accent} />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* ── Suggestions (contenu populaire + événements à venir) ── */}
                {(popularLoading || popularContent.length > 0) && (
                  <View style={{ paddingTop: 24, paddingBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 12 }}>
                      <Icon name="trending-up" size={12} color={colors.textTertiary} />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Meilleures suggestions
                      </Text>
                    </View>
                    {popularLoading ? (
                      <View style={{ paddingHorizontal: 16 }}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                        {popularContent.map(item => {
                          const isEvent = item.__kind === 'event';
                          const fmtV = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n ?? 0);
                          const fmtDate = (iso?: string) => {
                            if (!iso) return null;
                            const d = new Date(iso);
                            return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                          };
                          return (
                            <TouchableOpacity
                              key={`${item.__kind}-${item.id}`}
                              activeOpacity={0.85}
                              style={{ width: 120 }}
                              onPress={() => {
                                closeSearch();
                                if (isEvent) {
                                  (nav as any).navigate('EventDetail', { eventId: item.id });
                                } else if (item.type === 'serie' || item.content_type === 'serie') {
                                  (nav as any).navigate('SerieEpisodes', { item });
                                } else {
                                  (nav as any).navigate('FilmDetail', { item });
                                }
                              }}
                            >
                              <View style={{ width: 120, height: 170, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.backgroundSecondary }}>
                                {item.thumbnail_url ? (
                                  <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                                ) : (
                                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon name={isEvent ? 'calendar' : 'film'} size={26} color={colors.textTertiary} />
                                  </View>
                                )}
                                <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{isEvent ? 'Événement' : 'Populaire'}</Text>
                                </View>
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary, marginTop: 6 }} numberOfLines={1}>
                                {item.title ?? 'Sans titre'}
                              </Text>
                              {isEvent ? (
                                !!item.starts_at && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                    <Icon name="calendar" size={10} color={colors.textTertiary} />
                                    <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtDate(item.starts_at)}</Text>
                                  </View>
                                )
                              ) : (
                                !!item.view_count && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                    <Icon name="eye" size={10} color={colors.textTertiary} />
                                    <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtV(item.view_count)}</Text>
                                  </View>
                                )
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                )}

                {/* Astuce */}
                <View style={{ marginHorizontal: 16, marginTop: 28, borderRadius: 16, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="zap" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Recherche instantanée</Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>Tape un nom, un lieu ou un titre</Text>
                  </View>
                </View>
              </ScrollView>
            );

            // Chargement — avec suggestions historique pendant l'attente API. La pub déjà
            // chargée (searchAd n'est vidée que quand le champ redevient vide, jamais entre
            // deux frappes) reste affichée ici pour ne pas clignoter/disparaître à chaque
            // debounce de 300ms pendant que l'utilisateur tape.
            if (searching) return (
              <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {searchAd && searchFilter === 'all' && (
                  <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                    <AdCard
                      ad={searchAd}
                      colors={colors}
                      isVisible={searchOpen}
                      onImpression={handleAdImpression}
                      onPress={handleAdPress}
                      onOpenFullscreen={setFullscreenAd}
                    />
                  </View>
                )}
                {historySuggestions.length > 0 && (
                  <View style={{ paddingTop: 8, paddingBottom: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 16, marginBottom: 6 }}>Suggestions</Text>
                    {historySuggestions.map((h) => (
                      <TouchableOpacity
                        key={h.query}
                        activeOpacity={0.7}
                        onPress={() => { setSearchQuery(h.query); setSearchFilter('all'); liveSearch(h.query, 'all'); commitSearch(h.query); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                      >
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="clock" size={14} color={colors.primary} />
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.textPrimary }} numberOfLines={1}>{h.query}</Text>
                        <Icon name="arrow-up-left" size={14} color={colors.textTertiary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={{ alignItems: 'center', paddingTop: historySuggestions.length > 0 ? 24 : 80, gap: 12 }}>
                  <GoFolyXLoader color={colors.primary} />
                  <Text style={{ fontSize: 14, color: colors.textTertiary }}>Recherche en cours...</Text>
                </View>
              </ScrollView>
            );

            // Aucun résultat
            const hasAny = searchResults && (
              (searchResults.users?.length ?? 0) > 0 ||
              (searchResults.films?.length ?? 0) > 0 ||
              (searchResults.series?.length ?? 0) > 0 ||
              (searchResults.concerts?.length ?? 0) > 0 ||
              (searchResults.events?.length ?? 0) > 0 ||
              (searchResults.reels?.length ?? 0) > 0
            );

            if (!hasAny) return (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                  <Icon name="search" size={30} color={colors.textTertiary} />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}>Aucun résultat</Text>
                <Text style={{ fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 }}>Rien trouvé pour "{searchQuery}". Essaie un autre mot-clé.</Text>
              </View>
            );

            // Filtres chips
            const totalCounts: Record<string, number> = {
              all:      (searchResults!.users?.length ?? 0) + (searchResults!.events?.length ?? 0) + (searchResults!.concerts?.length ?? 0) + (searchResults!.reels?.length ?? 0) + (searchResults!.films?.length ?? 0) + (searchResults!.series?.length ?? 0),
              users:    searchResults!.users?.length ?? 0,
              events:   searchResults!.events?.length ?? 0,
              concerts: searchResults!.concerts?.length ?? 0,
              reels:    searchResults!.reels?.length ?? 0,
              films:    (searchResults!.films?.length ?? 0) + (searchResults!.series?.length ?? 0),
            };

            return (
              <View style={{ flex: 1 }}>
                {/* Suggestions historique au-dessus des résultats */}
                {historySuggestions.length > 0 && (
                  <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
                    {historySuggestions.map((h) => (
                      <TouchableOpacity
                        key={h.query}
                        activeOpacity={0.7}
                        onPress={() => { setSearchQuery(h.query); setSearchFilter('all'); liveSearch(h.query, 'all'); commitSearch(h.query); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                      >
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="clock" size={13} color={colors.primary} />
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.textPrimary }} numberOfLines={1}>{h.query}</Text>
                        <Icon name="arrow-up-left" size={13} color={colors.textTertiary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Chips filtre — sticky */}
                <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
                <ScrollView
                  horizontal showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
                >
                  {CATS.filter(c => c.key === 'all' || totalCounts[c.key] > 0).map(cat => {
                    const active = searchFilter === cat.key;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        onPress={() => { setSearchFilter(cat.key); liveSearch(searchQuery, cat.key); }}
                        activeOpacity={0.75}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                          backgroundColor: active ? cat.accent : colors.backgroundSecondary,
                          borderWidth: active ? 0 : StyleSheet.hairlineWidth,
                          borderColor: colors.divider,
                        }}
                      >
                        <Icon name={cat.icon} size={13} color={active ? '#fff' : colors.textSecondary} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : colors.textSecondary }}>{cat.label}</Text>
                        {totalCounts[cat.key] > 0 && (
                          <View style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : cat.accent + '22', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: active ? '#fff' : cat.accent }}>{totalCounts[cat.key]}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                </View>

                <ScrollView
                  contentContainerStyle={{ paddingBottom: 120 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  onScroll={({ nativeEvent }) => {
                    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
                    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 300) loadMoreSearch();
                  }}
                  scrollEventThrottle={200}
                >
                  {/* Pub — placement "search", une seule en tête des résultats, seulement
                      quand tous les types sont affichés (pas sur une recherche déjà filtrée). */}
                  {searchAd && searchFilter === 'all' && (
                    <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                      <AdCard
                        ad={searchAd}
                        colors={colors}
                        isVisible={searchOpen}
                        onImpression={handleAdImpression}
                        onPress={handleAdPress}
                        onOpenFullscreen={setFullscreenAd}
                      />
                    </View>
                  )}

                  {/* Utilisateurs */}
                  {(searchFilter === 'all' || searchFilter === 'users') && (searchResults!.users?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="users" label="Personnes" count={searchResults!.users!.length} accent="#7B3FF2" />
                      {searchResults!.users!.map((u: any, i: number) => (
                        <SrRow key={u.id} onPress={() => { closeSearch(); (nav as any).navigate('UserProfile', { userId: u.id }); }} last={i === searchResults!.users!.length - 1}>
                          <AvatarWithBadge
                            avatarUrl={u.avatar_url}
                            initials={((u.display_name ?? u.username ?? '?')[0] ?? '?').toUpperCase()}
                            size={52}
                            accentColor="#7B3FF2"
                            isLive={u.is_live}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{u.display_name ?? u.username}</Text>
                            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>@{u.username}</Text>
                          </View>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="chevron-right" size={14} color={colors.textDisabled} />
                          </View>
                        </SrRow>
                      ))}
                    </View>
                  )}

                  {/* Événements — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'events') && (searchResults!.events?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="calendar" label="Événements" count={searchResults!.events!.length} accent="#0EA5E9" />
                      <SrGrid>
                        {searchResults!.events!.map((e: any) => (
                          <SrGridCard key={e.id} uri={e.thumbnail_url} icon="calendar" accent="#0EA5E9"
                            title={e.title}
                            sub={[e.type ?? e.event_type, e.venue_city].filter(Boolean).join(' · ') || 'Événement'}
                            onPress={() => { closeSearch(); (nav as any).navigate('EventDetail', { eventId: e.id }); }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Concerts — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'concerts') && (searchResults!.concerts?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="music" label="Concerts" count={searchResults!.concerts!.length} accent="#E0389A" />
                      <SrGrid>
                        {searchResults!.concerts!.map((c: any) => (
                          <SrGridCard key={c.id} uri={c.thumbnail_url} icon="music" accent="#E0389A"
                            title={c.title}
                            sub={[c.genre, c.venue_city].filter(Boolean).join(' · ') || 'Concert'}
                            onPress={() => { closeSearch(); (nav as any).navigate('ConcertDetail', { concertId: c.id }); }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Reels — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'reels') && (searchResults!.reels?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="video" label="Reels" count={searchResults!.reels!.length} accent="#10B981" />
                      <SrGrid>
                        {searchResults!.reels!.map((r: any) => (
                          <SrGridCard key={r.id} uri={r.thumbnail_url} icon="play" accent="#10B981"
                            title={r.caption ?? 'Reel'}
                            sub={`${(r.view_count ?? 0).toLocaleString('fr')} vues`}
                            onPress={() => {
                              closeSearch();
                              const authorId = r.user_id ?? r.author_id ?? r.author?.id;
                              (nav as any).navigate('SearchReelViewer', { reel: r, reelId: r.id, authorId });
                            }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Films — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'films') && (searchResults!.films?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="film" label="Films" count={searchResults!.films!.length} accent="#F59E0B" />
                      <SrGrid>
                        {searchResults!.films!.map((c: any) => (
                          <SrGridCard key={c.id} uri={c.thumbnail_url} icon="film" accent="#F59E0B"
                            title={c.title} sub={c.year ? String(c.year) : 'Film'}
                            onPress={() => { closeSearch(); (nav as any).navigate('FilmDetail', { item: c }); }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Séries — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'films') && (searchResults!.series?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="tv" label="Séries" count={searchResults!.series!.length} accent="#6366F1" />
                      <SrGrid>
                        {searchResults!.series!.map((c: any) => (
                          <SrGridCard key={c.id} uri={c.thumbnail_url} icon="tv" accent="#6366F1"
                            title={c.title} sub={`Série${c.year ? ` · ${c.year}` : ''}`}
                            onPress={() => { closeSearch(); (nav as any).navigate('FilmDetail', { item: c }); }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Indicateur de chargement — scroll infini sur le filtre actif */}
                  {loadingMoreSearch && (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
                  )}
                </ScrollView>
              </View>
            );
          })()}
        </Animated.View>
      ) : (loading || switchingFilter) ? (
        <SkeletonFeedScreen />
      ) : (
        <FlatList
          ref={feedListRef}
          data={items}
          keyExtractor={item => `${item.kind}-${item.id}`}
          extraData={adSlotMap}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          scrollEnabled={feedScrollEnabled}
          onViewableItemsChanged={onFeedViewableChanged}
          viewabilityConfig={feedViewabilityConfig}
          onScroll={handleFeedScroll}
          scrollEventThrottle={100}
          onEndReached={loadMoreFeed}
          onEndReachedThreshold={0.6}
          updateCellsBatchingPeriod={50}
          ItemSeparatorComponent={() => (
            <View style={{ height: 12, backgroundColor: theme.isDark ? '#0a0a0f' : '#e8e8ee' }} />
          )}
          ListHeaderComponent={feedListHeader}
          ListFooterComponent={loadingMoreFeed ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(filter);
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            filter === 'following' ? (
              <View style={[s.empty, { paddingTop: 40 }]}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Icon name="users" size={32} color={colors.primary} />
                </View>
                <Text style={[s.emptyText, { color: colors.textPrimary, fontWeight: '800', fontSize: 17 }]}>
                  Aucun post de tes suivis
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32, marginTop: 6 }}>
                  Les personnes que tu suis n'ont pas encore publié de post. Suis plus de gens ou reviens plus tard.
                </Text>
                <TouchableOpacity
                  onPress={handleToggleFriends}
                  style={{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 24 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Découvrir du contenu</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.empty}>
                <Icon name="inbox" size={48} color={colors.textTertiary} />
                <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                  Aucun contenu pour le moment
                </Text>
              </View>
            )
          }
          renderItem={renderItem}
          // removeClippedSubviews=false : sinon les rangées de reels (CachedImage) sont
          // démontées puis remontées de zéro à chaque scroll rapide qui les fait sortir/
          // rentrer de la fenêtre de rendu — flash de rechargement visible ("disparaît et
          // réapparaît"). windowSize plus large pour absorber les scrolls rapides sans
          // recréer les composants.
          removeClippedSubviews={false}
          maxToRenderPerBatch={4}
          windowSize={12}
          initialNumToRender={5}
        />
      )}

      {/* ── Sheet commentaires ──────────────────────────────────────────── */}
      <CommentsBottomSheet
        visible={commentVisible}
        onClose={closeComments}
        eventId={commentItem?.kind === 'event'   ? commentItem.id : undefined}
        concertId={commentItem?.kind === 'concert' ? commentItem.id : undefined}
        postId={commentItem?.kind === 'post'     ? commentItem.id : undefined}
        commentsDisabled={commentItem?.data?.comments_disabled ?? false}
        onCommentCountChange={delta => commentCountChangeRef.current?.(delta)}
        onCountLoaded={count => commentCountLoadedRef.current?.(count)}
      />

      {/* Pub vidéo ouverte en plein écran avec son — clic sur une AdCard vidéo,
          où qu'elle soit (feed principal ou overlay recherche). */}
      <Modal visible={!!fullscreenAd} animationType="slide" onRequestClose={() => setFullscreenAd(null)} statusBarTranslucent>
        {fullscreenAd && <AdFullscreenPlayer ad={fullscreenAd} onClose={() => setFullscreenAd(null)} />}
      </Modal>

    </View>
  );
};

// ── MiniReelPlayer — mini carte reel, image statique uniquement ──────────────
// Pas de chargement/lecture vidéo tant que l'utilisateur n'a pas cliqué : seule
// la miniature (thumbnail) s'affiche. La vidéo ne charge qu'à l'ouverture du
// reel en plein écran (onPress → navigation), jamais en arrière-plan dans le feed.

const MiniReelPlayer: React.FC<{
  reel: any; w: number; h: number;
  isActive: boolean; feedFocused: boolean; onPress: () => void;
}> = React.memo(({ reel, w, h, onPress }) => {
  const videoUri = reel.hls_url ?? null;
  const author   = reel.author;
  const name     = author?.display_name ?? author?.username ?? '';
  const initials = name[0]?.toUpperCase() ?? '?';

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[rrS.thumb, { width: w, height: h }]}>
      {reel.thumbnail_url ? (
        <CachedImage uri={reel.thumbnail_url} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, rrS.thumbPlaceholder, { borderRadius: 14 }]}>
          <Icon name="film" size={28} color="rgba(255,255,255,0.18)" />
        </View>
      )}
      {videoUri && (
        <View pointerEvents="none" style={rrS.playBadgeMini}>
          <Icon name="play" size={16} color="#fff" />
        </View>
      )}

      {/* Overlay filtre */}
      {(() => {
        const fKey = reel.filter_name as FilterKey | undefined;
        const fDef = fKey ? FILTERS.find(f => f.key === fKey) : null;
        const fOp  = fKey ? (FILTER_VIDEO_OPACITY[fKey] ?? 0) : 0;
        const fOp2 = fKey ? (FILTER_VIDEO_OPACITY2[fKey] ?? 0) : 0;
        if (!fDef || fOp === 0) return null;
        return (
          <>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 14, backgroundColor: fDef.overlay, opacity: fOp }]} />
            {(fDef as any).overlay2 && fOp2 > 0 && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 14, backgroundColor: (fDef as any).overlay2, opacity: fOp2 }]} />
            )}
          </>
        );
      })()}

      {/* Text layers miniature */}
      {reel.text_layers && (() => {
        try {
          const ls = JSON.parse(reel.text_layers);
          return ls.slice(0, 2).map((l: any) => (
            <View key={l.id} pointerEvents="none" style={{ position: 'absolute', left: (l.x / 390) * w, top: (l.y / 844) * h, zIndex: 2 }}>
              <Text style={{ color: l.color, fontSize: Math.max(6, Math.round(l.fontSize * (w / 390))), fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} numberOfLines={1}>{l.text}</Text>
            </View>
          ));
        } catch { return null; }
      })()}

      <LinearGradient colors={['transparent', 'transparent', 'rgba(0,0,0,0.8)']} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />

      {/* Infos bas */}
      <View style={rrS.thumbBottom}>
        <View style={rrS.thumbAuthor}>
          {author?.avatar_url ? (
            <CachedImage uri={author.avatar_url} style={rrS.thumbAvatar} />
          ) : (
            <View style={[rrS.thumbAvatar, { backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{initials}</Text>
            </View>
          )}
          <Text style={rrS.thumbName} numberOfLines={1}>{name}</Text>
        </View>
        <View style={rrS.thumbStats}>
          <View style={rrS.statChip}>
            <Icon name="eye" size={10} color="rgba(255,255,255,0.85)" />
            <Text style={rrS.thumbStatTxt}>{(reel.view_count ?? 0).toLocaleString()}</Text>
          </View>
          {(reel.like_count ?? 0) > 0 && (
            <View style={rrS.statChip}>
              <MCIcon name="heart" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={rrS.thumbStatTxt}>{reel.like_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── MiniReelRow — FlatList horizontale avec viewability tracking ──────────────

const MiniReelRow: React.FC<{
  reels: any[]; itemW: number; itemH: number;
  feedFocused: boolean; isVisible: boolean;
  onPressReel: (id: string, data: any) => void;
}> = React.memo(({ reels, itemW, itemH, feedFocused, isVisible, onPressReel }) => {
  // Initialise directement sur le premier reel — pas besoin d'attendre
  const [activeId, setActiveId] = useState<string | null>(() => reels[0]?.id ?? null);

  // Stoppe quand la rangée quitte l'écran, reprend sur le premier quand elle revient
  const isVisibleRef  = useRef(isVisible);
  const feedFocusedRef= useRef(feedFocused);
  useEffect(() => { isVisibleRef.current   = isVisible;   }, [isVisible]);
  useEffect(() => { feedFocusedRef.current = feedFocused; }, [feedFocused]);

  useEffect(() => {
    if (!isVisible || !feedFocused) {
      setActiveId(null);
    } else {
      // Réactiver le premier si rien n'est actif
      setActiveId(prev => prev ?? reels[0]?.id ?? null);
    }
  }, [isVisible, feedFocused]);

  // viewabilityConfig stable (useRef) — RN exige que cette valeur ne change pas
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    waitForInteraction: false,
    minimumViewTime: 100,
  }).current;

  // onViewableItemsChanged stable (useRef) — obligatoire pour RN FlatList
  // Si on passe une nouvelle référence, RN ignore les changements silencieusement
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: any }> }) => {
      if (!isVisibleRef.current || !feedFocusedRef.current) return;
      if (viewableItems.length === 0) return;
      // Le premier item visible est le plus centré (scroll horizontal)
      setActiveId(viewableItems[0].item.id);
    }
  ).current;

  return (
    <FlatList
      data={reels}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={r => r.id}
      contentContainerStyle={rrS.miniList}
      ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      renderItem={({ item }) => (
        <MiniReelPlayer
          reel={item}
          w={itemW}
          h={itemH}
          isActive={activeId === item.id && isVisible && feedFocused}
          feedFocused={feedFocused}
          onPress={() => onPressReel(item.id, item)}
        />
      )}
    />
  );
});

// ── HeroReelPlayer — hero reel avec autoplay muet style Instagram ────────────

const HeroReelPlayer: React.FC<{
  reel: any;
  w: number;
  h: number;
  isVisible: boolean;
  onPress: () => void;
}> = React.memo(({ reel, w, h, onPress }) => {
  // Pas de lecteur vidéo ici — image statique uniquement, la vidéo ne charge
  // qu'à l'ouverture du reel en plein écran (onPress).
  const videoUri = reel.hls_url ?? null;
  const author   = reel.author;
  const name     = author?.display_name ?? author?.username ?? '';
  const initials = name[0]?.toUpperCase() ?? '?';

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[rrS.thumb, { width: w, height: h }]}
    >
      {reel.thumbnail_url ? (
        <CachedImage uri={reel.thumbnail_url} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, rrS.thumbPlaceholder, { borderRadius: 18 }]}>
          <Icon name="film" size={48} color="rgba(255,255,255,0.18)" />
        </View>
      )}

      {/* Dégradé bas */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.85)']}
        style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
      />

      {/* Badge lecture centré */}
      {videoUri && (
        <View pointerEvents="none" style={rrS.playBtn}>
          <View style={[rrS.playCircle, rrS.playCircleLarge]}>
            <Icon name="play" size={22} color="#fff" />
          </View>
        </View>
      )}

      {/* Durée */}
      {reel.duration_sec ? (
        <View style={rrS.durationBadge}>
          <Text style={rrS.durationTxt}>{reel.duration_sec}s</Text>
        </View>
      ) : null}

      {/* Infos bas */}
      <View style={rrS.thumbBottom}>
        <View style={rrS.thumbAuthor}>
          {author?.avatar_url ? (
            <CachedImage uri={author.avatar_url} style={[rrS.thumbAvatar, rrS.thumbAvatarLarge]} />
          ) : (
            <View style={[rrS.thumbAvatar, rrS.thumbAvatarLarge, { backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[rrS.thumbName, { fontSize: 14 }]} numberOfLines={1}>{name}</Text>
          </View>
        </View>
        {reel.caption ? (
          <Text style={rrS.heroCaption} numberOfLines={2}>{reel.caption}</Text>
        ) : null}
        <View style={rrS.thumbStats}>
          <View style={rrS.statChip}>
            <Icon name="eye" size={12} color="rgba(255,255,255,0.85)" />
            <Text style={[rrS.thumbStatTxt, { fontSize: 12 }]}>{(reel.view_count ?? 0).toLocaleString()}</Text>
          </View>
          {(reel.like_count ?? 0) > 0 && (
            <View style={rrS.statChip}>
              <MCIcon name="heart" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={[rrS.thumbStatTxt, { fontSize: 12 }]}>{reel.like_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── ReelRowCard — rangée horizontale de reels (style Facebook) ───────────────

const ReelRowCard: React.FC<{
  reels: any[];
  colors: AppColors;
  feedFocused: boolean;
  isVisible: boolean;
  onPressReel: (reelId: string, reelData: any) => void;
}> = React.memo(({ reels, colors, feedFocused, isVisible, onPressReel }) => {
  const { width: SW, height: SH } = Dimensions.get('window');
  const HERO_W  = SW - 24;
  const HERO_H  = Math.round(SH * 0.50);
  const MINI_W  = Math.round(SW * 0.48);
  const MINI_H  = Math.round(MINI_W * 1.7);

  const hero  = reels[0];
  const rest  = reels.slice(1);

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const ReelThumb = ({ reel, w, h, large = false }: { reel: any; w: number; h: number; large?: boolean }) => {
    const author   = reel.author;
    const name     = author?.display_name ?? author?.username ?? '';
    const initials = (name || '?')[0].toUpperCase();
    const br = large ? 18 : 14;
    const fKey  = reel.filter_name as FilterKey | undefined;
    const fDef  = fKey ? FILTERS.find(f => f.key === fKey) : null;
    const fOp   = fKey ? (FILTER_VIDEO_OPACITY[fKey] ?? 0) : 0;
    const fOp2  = fKey ? (FILTER_VIDEO_OPACITY2[fKey] ?? 0) : 0;
    let txtLayers: any[] = [];
    try { if (reel.text_layers) txtLayers = JSON.parse(reel.text_layers); } catch {}
    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => reel?.id && onPressReel(reel.id, reel)}
        style={[rrS.thumb, { width: w, height: h }]}
      >
        {reel.thumbnail_url ? (
          <CachedImage uri={reel.thumbnail_url} style={[StyleSheet.absoluteFill, { borderRadius: br }]} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, rrS.thumbPlaceholder, { borderRadius: br }]}>
            <Icon name="film" size={large ? 48 : 28} color="rgba(255,255,255,0.18)" />
          </View>
        )}

        {/* Overlay filtre */}
        {fDef && fOp > 0 && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: br, backgroundColor: fDef.overlay, opacity: fOp }]} />
        )}
        {fDef && (fDef as any).overlay2 && fOp2 > 0 && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: br, backgroundColor: (fDef as any).overlay2, opacity: fOp2 }]} />
        )}

        {/* Text layers miniature */}
        {txtLayers.slice(0, 2).map((l: any) => (
          <View key={l.id} pointerEvents="none" style={{ position: 'absolute', left: (l.x / 390) * w, top: (l.y / 844) * h, zIndex: 2 }}>
            <Text style={{ color: l.color, fontSize: Math.max(6, Math.round(l.fontSize * (w / 390))), fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} numberOfLines={1}>{l.text}</Text>
          </View>
        ))}

        {/* Dégradé bas */}
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(0,0,0,0.85)']}
          style={[StyleSheet.absoluteFill, { borderRadius: large ? 18 : 14 }]}
        />


        {/* Durée coin haut droit */}
        {reel.duration_sec ? (
          <View style={rrS.durationBadge}>
            <Text style={rrS.durationTxt}>{reel.duration_sec}s</Text>
          </View>
        ) : null}

        {/* Bouton play centre */}
        <View style={rrS.playBtn} pointerEvents="none">
          <View style={[rrS.playCircle, large && rrS.playCircleLarge]}>
            <Icon name="play" size={large ? 28 : 16} color="#fff" />
          </View>
        </View>

        {/* Infos bas */}
        <View style={rrS.thumbBottom}>
          <View style={rrS.thumbAuthor}>
            {author?.avatar_url ? (
              <CachedImage uri={author.avatar_url} style={[rrS.thumbAvatar, large && rrS.thumbAvatarLarge]} />
            ) : (
              <View style={[rrS.thumbAvatar, large && rrS.thumbAvatarLarge, { backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: large ? 12 : 9, fontWeight: '800' }}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[rrS.thumbName, large && { fontSize: 14 }]} numberOfLines={1}>{name}</Text>
              {reel.created_at ? <Text style={rrS.thumbTime}>{timeAgo(reel.created_at)}</Text> : null}
            </View>
          </View>
          {large && reel.caption ? (
            <Text style={rrS.heroCaption} numberOfLines={2}>{reel.caption}</Text>
          ) : null}
          <View style={rrS.thumbStats}>
            <View style={rrS.statChip}>
              <Icon name="eye" size={large ? 12 : 10} color="rgba(255,255,255,0.85)" />
              <Text style={[rrS.thumbStatTxt, large && { fontSize: 12 }]}>{(reel.view_count ?? 0).toLocaleString()}</Text>
            </View>
            {(reel.like_count ?? 0) > 0 && (
              <View style={rrS.statChip}>
                <MCIcon name="heart" size={large ? 13 : 11} color="rgba(255,255,255,0.85)" />
                <Text style={[rrS.thumbStatTxt, large && { fontSize: 12 }]}>{reel.like_count}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[rrS.wrap, { backgroundColor: colors.surface }]}>
      {/* En-tête */}
      <View style={rrS.header}>
        <View style={rrS.headerIcon}>
          <Icon name="play-circle" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[rrS.title, { color: colors.textPrimary }]}>Reels pour toi</Text>
          <Text style={[rrS.subtitle, { color: colors.textSecondary }]}>{reels.length} nouvelle{reels.length > 1 ? 's' : ''} vidéo{reels.length > 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={[rrS.seeAllBtn, { borderColor: colors.primary + '55' }]} onPress={() => { if (reels[0]) onPressReel(reels[0].id, reels[0]); }}>
          <Text style={[rrS.seeAllTxt, { color: colors.primary }]}>Voir tout</Text>
          <Icon name="chevron-right" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Grande carte hero — autoplay muet style Instagram */}
      {hero ? (
        <View style={{ paddingHorizontal: 12, marginBottom: rest.length > 0 ? 12 : 0 }}>
          <HeroReelPlayer
            reel={hero}
            w={HERO_W}
            h={HERO_H}
            isVisible={isVisible}
            onPress={() => onPressReel(hero.id, hero)}
          />
        </View>
      ) : null}

      {/* Rangée secondaire scrollable — autoplay au scroll */}
      {rest.length > 0 ? (
        <MiniReelRow
          reels={rest}
          itemW={MINI_W}
          itemH={MINI_H}
          feedFocused={feedFocused}
          isVisible={isVisible}
          onPressReel={onPressReel}
        />
      ) : null}
    </View>
  );
});

const rrS = StyleSheet.create({
  wrap:             { marginBottom: 10, paddingTop: 16, paddingBottom: 16, overflow: 'hidden' },
  header:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 14 },
  headerIcon:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  title:            { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  subtitle:         { fontSize: 12, marginTop: 1 },
  seeAllBtn:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  seeAllTxt:        { fontSize: 13, fontWeight: '700' },
  miniList:         { paddingHorizontal: 16 },

  thumb:            { borderRadius: 14, overflow: 'hidden', backgroundColor: '#111' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },

  reelBadge:        { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7B3FF2D9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  reelBadgeTxt:     { color: '#fff', fontWeight: '800', letterSpacing: 0.5 },

  muteBtn:          { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  muteBtnMini:      { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  playBadgeMini:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  durationBadge:    { position: 'absolute', top: 52, right: 10, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  durationTxt:      { color: '#fff', fontSize: 10, fontWeight: '700' },

  playBtn:          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playBtnLarge:     {},
  playCircle:       { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
  playCircleLarge:  { width: 64, height: 64, borderRadius: 32 },

  thumbBottom:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, gap: 6 },
  thumbAuthor:      { flexDirection: 'row', alignItems: 'center', gap: 7 },
  thumbAvatar:      { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  thumbAvatarLarge: { width: 34, height: 34, borderRadius: 17 },
  thumbName:        { color: '#fff', fontSize: 12, fontWeight: '700' },
  thumbTime:        { color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 1 },
  heroCaption:      { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
  thumbStats:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  thumbStatTxt:     { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
});

// ── ReelFeedCard — carte reel style Facebook dans le feed ────────────────────

const ReelFeedCard: React.FC<{
  reel: any;
  colors: AppColors;
  isActive: boolean;
  onPress: () => void;
  onScrollLock?: (enabled: boolean) => void;
}> = React.memo(({ reel, colors, isActive, onPress, onScrollLock }) => {
  const author   = reel.author;
  const name     = author?.display_name ?? author?.username ?? 'Utilisateur';
  const initials = name[0]?.toUpperCase() ?? '?';

  // null = pas encore détecté, true = portrait 9:16, false = paysage 16:9
  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Détection du ratio depuis le thumbnail uniquement
  useEffect(() => {
    if (!reel.thumbnail_url) return;
    Image.getSize(
      reel.thumbnail_url,
      (w, h) => { if (mountedRef.current) setIsPortrait(h >= w); },
      () => { if (mountedRef.current) setIsPortrait(true); },
    );
  }, [reel.thumbnail_url]);

  const thumbAspectRatio = isPortrait === false ? 16 / 9 : 1 / 0.88;

  // Animation pulse sur le bouton play (Reanimated)

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)    return 'À l\'instant';
    if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  // Phrases d'accroche tournantes
  const HOOKS = [
    'La suite va te surprendre 👀',
    'T\'as regardé jusqu\'au bout ? 🔥',
    'Ce moment est trop fort 😱',
    'Tout le monde en parle en ce moment',
    'Tu ne vas pas le regretter ✨',
    'Ce reel fait le buzz 🚀',
  ];
  const hookIdx = Math.abs(reel.id?.charCodeAt(0) ?? 0) % HOOKS.length;
  const hookText = HOOKS[hookIdx];

  return (
    <TouchableOpacity
      activeOpacity={0.96}
      onPress={onPress}
      style={[rs.card, { backgroundColor: '#000' }]}
    >
      <View style={[rs.thumbWrap, { aspectRatio: thumbAspectRatio }]}>

        {/* Thumbnail */}
        {reel.thumbnail_url ? (
          <Image
            source={{ uri: reel.thumbnail_url }}
            style={StyleSheet.absoluteFill}
            resizeMode={isPortrait === false ? 'contain' : 'cover'}
          />
        ) : (
          <View style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="film" size={40} color="rgba(255,255,255,0.18)" />
          </View>
        )}

        {/* Overlay filtre */}
        {(() => {
          const fKey = reel.filter_name as FilterKey | undefined;
          const fDef = fKey ? FILTERS.find(f => f.key === fKey) : null;
          const fOp  = fKey ? (FILTER_VIDEO_OPACITY[fKey] ?? 0) : 0;
          const fOp2 = fKey ? (FILTER_VIDEO_OPACITY2[fKey] ?? 0) : 0;
          if (!fDef || fOp === 0) return null;
          return (
            <>
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fDef.overlay, opacity: fOp }]} />
              {(fDef as any).overlay2 && fOp2 > 0 && (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: (fDef as any).overlay2, opacity: fOp2 }]} />
              )}
            </>
          );
        })()}

        {/* Text layers miniature */}
        {reel.text_layers && (() => {
          try {
            const ls = JSON.parse(reel.text_layers);
            return ls.slice(0, 3).map((l: any) => (
              <View key={l.id} pointerEvents="none" style={{ position: 'absolute', left: `${(l.x / 390) * 100}%` as any, top: `${(l.y / 844) * 100}%` as any, zIndex: 2 }}>
                <Text style={{ color: l.color, fontSize: Math.max(8, Math.round(l.fontSize * 0.35)), fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} numberOfLines={1}>{l.text}</Text>
              </View>
            ));
          } catch { return null; }
        })()}

        {/* Gradient haut → bas */}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.78)']}
          style={StyleSheet.absoluteFill}
        />


        {/* Auteur en haut */}
        <View style={rs.authorOverlay}>
          {author?.avatar_url ? (
            <CachedImage uri={author.avatar_url} style={rs.avatarSm} />
          ) : (
            <View style={[rs.avatarSm, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={rs.authorOverlayName} numberOfLines={1}>{name}</Text>
              {author?.is_verified && (
                <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={8} color="#fff" />
                </View>
              )}
            </View>
            <Text style={rs.authorOverlayTime}>{timeAgo(reel.created_at)}</Text>
          </View>
        </View>

        {/* Bouton play animé au centre */}
        <View style={rs.playCenter} pointerEvents="none">
          <View style={rs.playRipple} />
          <View style={rs.playCircle}>
            <Icon name="play" size={28} color="#fff" />
          </View>
        </View>

        {/* Bas : accroche + caption + stats */}
        <View style={rs.bottomOverlay}>
          <View style={rs.hookWrap}>
            <Text style={rs.hookText}>{hookText}</Text>
          </View>
          {reel.caption ? (
            <Text style={rs.captionOverlay} numberOfLines={2}>{reel.caption}</Text>
          ) : null}
          <View style={rs.statsRow}>
            <View style={rs.statItem}>
              <Icon name="eye" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={rs.statTxt}>{(reel.view_count ?? 0).toLocaleString()}</Text>
            </View>
            <View style={rs.statItem}>
              <MCIcon name="heart" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={rs.statTxt}>{reel.like_count ?? 0}</Text>
            </View>
            {reel.duration_sec ? (
              <View style={rs.statItem}>
                <Icon name="clock" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={rs.statTxt}>{reel.duration_sec}s</Text>
              </View>
            ) : null}
            <View style={rs.ctaBtn}>
              <Text style={rs.ctaTxt}>Voir le reel</Text>
              <Icon name="arrow-right" size={13} color="#fff" />
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── Styles Communities — miroir exact de PeopleSuggestions ───────────────────
const cs = StyleSheet.create({
  wrap:      { paddingVertical: 14, marginBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title:     { fontSize: 16, fontWeight: '800' },
  subtitle:  { fontSize: 11, marginTop: 2 },
  seeAll:    { fontSize: 13, fontWeight: '700' },
  list:      { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  card:      { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover:     { width: '100%' },
  badge:     { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarWrap:{ borderWidth: 3, overflow: 'hidden', alignSelf: 'center' },
  cardBody:  { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, gap: 4 },
  name:      { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  handle:    { fontSize: 11, textAlign: 'center' },
  joinBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, borderRadius: 8, paddingVertical: 10, width: '100%' },
  joinText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
});

const rs = StyleSheet.create({
  card:     { marginBottom: 10, overflow: 'hidden', borderRadius: 14 },
  thumbWrap:{ width: '100%', overflow: 'hidden' },

  // Badge REEL
  reelBadge:     { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  reelBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Auteur en overlay haut
  authorOverlay:     { position: 'absolute', top: 40, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarSm:          { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  authorOverlayName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  authorOverlayTime: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 },
  muteBtnOverlay:    { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },

  // Bas overlay
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, gap: 6 },
  hookWrap:  { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  hookText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  captionOverlay: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },

  // Stats + CTA
  statsRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTxt:   { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  ctaBtn:    { marginLeft: 'auto' as any, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  ctaTxt:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Bouton play animé
  playCenter:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playRipple:  { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' },
  playCircle:  { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', paddingLeft: 4 },
});

const hk = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderLeftWidth: 3 },
  icon: { fontSize: 16 },
  text: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
});

// ── FeedCard ──────────────────────────────────────────────────────────────────

interface FeedCardProps {
  item:      FeedItem;
  colors:    AppColors;
  currentUserId?: string;
  isFollowing: boolean;
  onToggleFollow: () => void;
  onComment: (onCountChange: (delta: number) => void, onCountLoaded: (count: number) => void) => void;
  onPress:   () => void;
  onAuthorPress: () => void;
  onHide:    () => void;
}

// ── Card Context Menu ─────────────────────────────────────────────────────────

interface CardMenuProps {
  item:         FeedItem;
  colors:       AppColors;
  isSaved:      boolean;
  isFollowing:  boolean;
  isOwnContent: boolean;
  authorName:   string;
  onClose:      () => void;
  onSave:       () => void;
  onShare:      () => void;
  onFollow:     () => void;
  onReport:     () => void;
  onHide:       () => void;
  onRemind:     () => void;
  hasReminder:  boolean;
}

const CardContextMenu: React.FC<CardMenuProps> = ({
  item, colors, isSaved, isFollowing, isOwnContent, authorName,
  onClose, onSave, onShare, onFollow, onReport, onHide, onRemind, hasReminder,
}) => {
  const insets    = useSafeAreaInsets();
  const isEvent   = item.kind === 'event';
  const isConcert = item.kind === 'concert';
  const isPost    = item.kind === 'post';
  const isReel    = item.kind === 'reel';
  const title     = (item.data?.title ?? item.data?.body ?? item.data?.caption) as string | undefined;
  const typeLabel = isEvent ? 'événement' : isConcert ? 'concert' : isPost ? 'post' : 'reel';
  const typeIcon  = isEvent ? 'calendar' : isConcert ? 'music' : isPost ? 'file-text' : 'play-circle';
  // Rappel uniquement pertinent pour events/concerts
  const showRemind = isEvent || isConcert;

  // Groupe 1 — actions principales
  const mainActions = [
    ...(showRemind ? [{
      icon: hasReminder ? 'bell-off' : 'bell',
      label: hasReminder ? 'Annuler le rappel' : 'Me rappeler',
      sublabel: hasReminder ? 'Rappel actif — 1h avant' : '1h avant le début',
      color: hasReminder ? colors.primary : colors.textPrimary,
      accent: hasReminder,
      onPress: () => { onClose(); onRemind(); },
    }] : []),
    {
      icon: 'bookmark',
      label: isSaved ? 'Retirer des favoris' : 'Sauvegarder',
      sublabel: isSaved ? 'Dans vos favoris' : 'Retrouver plus tard',
      color: isSaved ? '#F59E0B' : colors.textPrimary,
      accent: isSaved,
      onPress: () => { onClose(); onSave(); },
    },
    {
      icon: 'share-2',
      label: 'Partager',
      sublabel: 'Via les apps installées',
      color: colors.textPrimary,
      accent: false,
      onPress: () => { onClose(); onShare(); },
    },
  ];

  // Groupe 2 — actions sur l'auteur (masquées si contenu propre)
  const authorActions = !isOwnContent ? [
    {
      icon: isFollowing ? 'user-x' : 'user-plus',
      label: isFollowing ? `Ne plus suivre ${authorName}` : `Suivre ${authorName}`,
      sublabel: isFollowing ? 'Retirer du fil' : 'Voir ses prochains contenus',
      color: isFollowing ? '#EF4444' : colors.textPrimary,
      accent: !isFollowing,
      onPress: () => { onClose(); onFollow(); },
    },
  ] : [];

  // Groupe 3 — actions négatives
  const negativeActions = !isOwnContent ? [
    {
      icon: 'eye-off',
      label: 'Pas intéressé',
      sublabel: `Masquer ce ${typeLabel} du fil`,
      color: colors.textSecondary,
      accent: false,
      onPress: () => { onClose(); onHide(); },
    },
    {
      icon: 'flag',
      label: 'Signaler',
      sublabel: 'Contenu inapproprié',
      color: '#EF4444',
      accent: false,
      onPress: () => { onClose(); onReport(); },
    },
  ] : [];

  const renderGroup = (actions: typeof mainActions) =>
    actions.map((a, i) => (
      <React.Fragment key={i}>
        {i > 0 && <View style={[cm.divider, { backgroundColor: colors.divider }]} />}
        <TouchableOpacity style={cm.action} onPress={a.onPress} activeOpacity={0.7}>
          <View style={[cm.iconWrap, {
            backgroundColor: a.accent ? a.color + '22' : colors.backgroundSecondary,
          }]}>
            <Icon name={a.icon as any} size={18} color={a.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[cm.actionText, { color: a.color }]}>{a.label}</Text>
            <Text style={[cm.actionSub, { color: colors.textTertiary }]}>{a.sublabel}</Text>
          </View>
          <Icon name="chevron-right" size={15} color={colors.textDisabled} />
        </TouchableOpacity>
      </React.Fragment>
    ));

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={cm.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[cm.sheet, { backgroundColor: colors.surface, paddingBottom: (Platform.OS === 'ios' ? 36 : 20) + insets.bottom }]}>
          <View style={[cm.handle, { backgroundColor: colors.divider }]} />

          {/* Titre de la carte */}
          {title ? (
            <View style={[cm.titleRow, { borderBottomColor: colors.divider }]}>
              <Icon name={typeIcon} size={13} color={colors.textTertiary} />
              <Text style={[cm.sheetTitle, { color: colors.textTertiary }]} numberOfLines={1}>{title}</Text>
            </View>
          ) : null}

          {/* Groupe principal */}
          <View style={[cm.group, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
            {renderGroup(mainActions)}
          </View>

          {/* Groupe auteur */}
          {authorActions.length > 0 && (
            <View style={[cm.group, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              {renderGroup(authorActions)}
            </View>
          )}

          {/* Groupe négatif */}
          {negativeActions.length > 0 && (
            <View style={[cm.group, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              {renderGroup(negativeActions)}
            </View>
          )}

          <TouchableOpacity
            style={[cm.cancelBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
            onPress={onClose}
          >
            <Text style={[cm.cancelText, { color: colors.textSecondary }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const cm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 12, gap: 8 },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  sheetTitle: { fontSize: 12, fontWeight: '600' },
  group:      { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  action:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
  iconWrap:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 15, fontWeight: '500' },
  divider:    { height: StyleSheet.hairlineWidth },
  cancelBtn:  { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  cancelText: { fontSize: 16, fontWeight: '600' },
  actionSub:  { fontSize: 12, marginTop: 1 },
});

const FeedCard: React.FC<FeedCardProps> = React.memo(({ item, colors, currentUserId, isFollowing, onToggleFollow, onComment, onPress, onAuthorPress, onHide }) => {
  const nav = useNavigation<Nav>();
  const isEvent  = item.kind === 'event';
  const isConcert = item.kind === 'concert';
  const event    = isEvent  ? (item.data as any) : null;
  const concert  = isConcert ? (item.data as any) : null;

  // Guard — si data null/undefined on ne peut pas render
  if (!event && !concert) return null;

  const title     = isEvent ? (event?.title ?? '') : (concert?.title ?? '');
  const date      = isEvent ? event?.starts_at : concert?.scheduled_at;
  const city      = isEvent ? event?.venue_city : concert?.venue_city;
  const desc      = isEvent ? event?.description : concert?.description;
  const thumbUrl  = isEvent
    ? (event?.thumbnail_url ?? event?.banner_url)
    : (concert?.thumbnail_url ?? concert?.banner_url);
  const videoUrl  = isEvent ? (event?.hls_url ?? event?.video_url) : (concert?.hls_url ?? concert?.video_url);

  const isFree = isEvent ? event?.access_type === 'free' : concert?.access_type === 'free';
  const isLive = isConcert && concert?.status === 'live';
  const price  = isEvent ? event?.ticket_price : concert?.ticket_price;
  const commentsDisabled = isEvent ? (event?.comments_disabled ?? false) : (concert?.comments_disabled ?? false);

  const accent   = colors.primary;
  const cardIcon = isEvent ? (EVENT_ICONS[event.event_type]  ?? 'calendar') : 'music';
  const typeLabel = isEvent ? event.event_type?.toUpperCase() : 'CONCERT';

  // ── State social branché sur l'API ────────────────────────────────────────
  const [imgFs, setImgFs] = useState(false);
  const bannerLastTap = useRef<number>(0);
  const [liked,        setLiked]        = useState(item.data?.user_reaction === 'like');
  const [likeCount,    setLikeCount]    = useState(item.data?.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(item.data?.comment_count ?? 0);
  const [shareCount,   setShareCount]   = useState(item.data?.share_count ?? 0);
  const [saved, setSaved] = useState(() =>
    isEvent ? saveService.isEventSaved(item.id) : saveService.isConcertSaved(item.id)
  );
  const [cardMenuOpen,   setCardMenuOpen]   = useState(false);
  const [reportVisible,  setReportVisible]  = useState(false);
  const [shareOpen,      setShareOpen]      = useState(false);
  const [likersOpen,     setLikersOpen]     = useState(false);
  const refType = isEvent ? 'event' : 'concert';
  const [hasReminder, setHasReminder] = useState(
    () => feedPreferenceService.hasReminder(item.id, refType)
  );

  const handleHide = async () => {
    await feedPreferenceService.toggleHide(item.id, refType);
    onHide();
  };

  const handleRemind = async () => {
    const eventDate: string = isEvent
      ? (item.data as Event).starts_at
      : (item.data as Concert).scheduled_at;
    const title: string = item.data?.title ?? '';
    const active = await feedPreferenceService.toggleReminder(item.id, refType, title, eventDate);
    setHasReminder(active);
    toastService.success(
      active ? 'Rappel activé' : 'Rappel annulé',
      active
        ? `On vous rappellera 1h avant : "${title}"`
        : 'Le rappel a été supprimé.',
    );
  };

  // commentCount mis à jour via onCommentCountChange passé au CommentsBottomSheet

  // ── "Voir plus" titre + description ──────────────────────────────────────

  const heartScale = useSharedValue(1);
  const saveScale  = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const saveStyle  = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value  }] }));

  const handleLike = () => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 6 }), withSpring(1));
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c: number) => newLiked ? c + 1 : Math.max(0, c - 1));
    const payload = isEvent
      ? { reaction_type: 'like' as const, event_id: item.id }
      : { reaction_type: 'like' as const, concert_id: item.id };
    socialService.toggleReaction(payload).catch(() => {
      setLiked(!newLiked);
      setLikeCount((c: number) => newLiked ? Math.max(0, c - 1) : c + 1);
    });
  };

  const handleSave = () => {
    saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    const newSaved = !saved;
    setSaved(newSaved);
    if (isEvent) {
      const ev = item.data as Event;
      if (newSaved) {
        favoriteService.save({ target_type: 'event', target_id: item.id, target_title: ev.title, target_subtitle: (ev as any).venue_city ?? (ev as any).location, target_thumbnail: (ev as any).thumbnail_url ?? (ev as any).cover_url })
          .catch(() => setSaved(false));
      } else {
        favoriteService.unsave('event', item.id).catch(() => setSaved(true));
      }
    } else {
      const ct = item.data as Concert;
      if (newSaved) {
        favoriteService.save({ target_type: 'concert', target_id: item.id, target_title: ct.title, target_subtitle: (ct as any).venue_city ?? ct.artist?.username, target_thumbnail: (ct as any).thumbnail_url })
          .catch(() => setSaved(false));
      } else {
        favoriteService.unsave('concert', item.id).catch(() => setSaved(true));
      }
    }
  };

  const handleShare = () => setShareOpen(true);

  const handleShareDone = () => {
    setShareCount((c: number) => c + 1);
  };

  const author       = isEvent ? event?.organizer : concert?.artist ?? null;
  const authorId     = author?.id ?? null;
  const authorName   = author?.display_name ?? author?.username ?? 'GoFolyX';
  const authorAvatar = author?.avatar_url ?? null;
  const authorInit   = (authorName || 'F')[0].toUpperCase();
  const isOwnContent = !!(currentUserId && authorId && currentUserId === authorId);
  const showFollowBtn = !isOwnContent && !!authorId;
  const publishedAt  = isEvent ? (event?.published_at ?? event?.created_at) : (concert?.published_at ?? concert?.created_at);
  // Relatif tant que < 24h (instant/min/h), puis date complète au-delà.
  const timeAgo = (() => {
    if (!publishedAt) return '';
    const parsed = new Date(publishedAt);
    if (isNaN(parsed.getTime())) return '';
    const diff = (Date.now() - parsed.getTime()) / 1000;
    if (diff < 60)    return 'À l\'instant';
    if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return parsed.toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  // 0.58 → 0.8 (ratio 4/5) : hero plus haut/impactant, cohérent avec PostCard.
  const BANNER_H = Math.round(SW * 0.8);

  return (
    <View style={[fc.card, { backgroundColor: colors.surface }]}>

      {/* ── Header auteur — en haut, façon Facebook ──────────────────────── */}
      <View style={fc.header}>
        <TouchableOpacity style={fc.headerLeft} activeOpacity={0.7} onPress={onAuthorPress}>
          <AvatarWithBadge
            avatarUrl={authorAvatar}
            initials={authorInit}
            size={38}
            accentColor={accent}
            isVerified={!!author?.is_verified}
            isOnline={(author as any)?.is_online ?? undefined}
            isLive={(author as any)?.is_live ?? undefined}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[fc.authorName, { color: colors.textPrimary }]} numberOfLines={1}>{authorName}</Text>
            <Text style={[fc.timeAgo, { color: colors.textTertiary }]}>{timeAgo}</Text>
            {/* Badge visible uniquement par l'organisateur/artiste, cf.
                ReelsScreen.tsx pour le meme pattern. */}
            {isOwnContent && (isEvent ? event?.ai_analysis_status : concert?.ai_analysis_status) === 'pending' && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => nav.navigate('AiAnalysisStatus', {
                  contentType: isEvent ? 'event' : 'concert',
                  contentId: isEvent ? event.id : concert.id,
                  initialStatus: isEvent ? event?.ai_analysis_status : concert?.ai_analysis_status,
                })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <ActivityIndicator size="small" color={colors.textTertiary} />
                <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '600' }}>Vérification en cours…</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {showFollowBtn && !isFollowing && (
            <TouchableOpacity style={[fc.followChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]} onPress={onToggleFollow} activeOpacity={0.7}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Suivre</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setCardMenuOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="more-horizontal" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Titre + date/lieu — sorti de l'image, façon Facebook ─────────── */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={fc.titleWrap}>
        <Text style={[fc.heroTitle, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
        <View style={fc.heroMeta}>
          <Icon name="calendar" size={11} color={colors.textTertiary} />
          <Text style={[fc.heroMetaText, { color: colors.textSecondary }]}>{formatDate(date)}</Text>
          {city ? (
            <>
              <Text style={[fc.heroMetaDot, { color: colors.textTertiary }]}>·</Text>
              <Icon name="map-pin" size={11} color={colors.textTertiary} />
              <Text style={[fc.heroMetaText, { color: colors.textSecondary }]} numberOfLines={1}>{city}</Text>
            </>
          ) : null}
        </View>
        {/* Badges — type, gratuit/prix — petits, sous le titre plutôt que sur l'image */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <View style={[fc.chipBadge, { backgroundColor: accent + '15' }]}>
            <Icon name={cardIcon} size={9} color={accent} />
            <Text style={[fc.typeBadgeText, { color: accent }]}>{typeLabel}</Text>
          </View>
          {isLive && (
            <View style={[fc.chipBadge, { backgroundColor: '#EF444422' }]}>
              <View style={fc.liveDot} />
              <Text style={[fc.chipBadgeText, { color: '#EF4444' }]}>LIVE</Text>
            </View>
          )}
          {isFree && (
            <View style={[fc.chipBadge, { backgroundColor: '#10B98122' }]}>
              <Text style={[fc.chipBadgeText, { color: '#0F9D6E' }]}>GRATUIT</Text>
            </View>
          )}
          {!isFree && price != null && price > 0 && (
            <View style={[fc.chipBadge, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="tag" size={9} color={colors.textSecondary} />
              <Text style={[fc.chipBadgeText, { color: colors.textSecondary }]}>dès <PriceWithLocal amountEur={price!} style={[fc.chipBadgeText, { color: colors.textSecondary }]} localStyle={{ color: colors.textTertiary }} /></Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* ── Description ─────────────────────────────────────────────────── */}
      {desc ? (
        <View style={fc.descWrap}>
          <ExpandableText text={desc} maxLines={3} textStyle={[fc.desc, { color: colors.textSecondary }]} primaryColor={colors.primary} />
        </View>
      ) : null}

      {/* ── Media — image/vidéo, sous le texte, façon Facebook ───────────── */}
      <View style={{ height: BANNER_H, backgroundColor: '#0d0d1a', overflow: 'hidden' }}>
        {videoUrl ? (
          <InlineVideoPlayer
            uri={videoUrl}
            thumbnailUri={thumbUrl}
            aspectRatio={SW / BANNER_H}
            borderRadius={0}
            muted
            autoPlay={false}
            isActive={false}
          />
        ) : thumbUrl ? (
          <TouchableOpacity onPress={onPress} activeOpacity={0.95} style={StyleSheet.absoluteFill}>
            <CachedImage uri={thumbUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onPress} activeOpacity={0.95} style={StyleSheet.absoluteFill}>
            <LinearGradient colors={[accent + 'EE', accent + '55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={cardIcon} size={60} color="rgba(255,255,255,0.18)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Compteurs — noms d'amis qui ont aimé (si likes) + nb de commentaires */}
      {(likeCount > 0 || (!commentsDisabled && commentCount > 0)) && (
        <View style={[fc.countsRow, { borderBottomColor: colors.divider }]}>
          {likeCount > 0 && (
            <View style={{ flex: 1, minWidth: 0 }}>
              <FriendsWhoLiked
                entityType={isEvent ? 'event' : 'concert'}
                entityId={item.id}
                totalLikes={likeCount}
                onPressLikers={() => setLikersOpen(true)}
              />
            </View>
          )}
          {!commentsDisabled && commentCount > 0 && (
            <TouchableOpacity onPress={() => onComment((d: number) => setCommentCount((v: number) => v + d), (n: number) => setCommentCount((v: number) => Math.max(v, n)))} style={[fc.countChip, { marginLeft: 'auto' as any }]}>
              <View style={fc.commentIcon}><MCIcon name="comment-outline" size={11} color="#fff" /></View>
              <Text style={[fc.countText, { color: colors.textTertiary }]}>{commentCount.toLocaleString('fr')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Barre d'actions — icônes seules, pas de texte (compteurs déjà visibles
          dans countsRow au-dessus) ─────────────────────────────────────────── */}
      <View style={[fc.actionBar, { borderTopColor: colors.divider }]}>
        <TouchableOpacity style={fc.actionBtn} onPress={handleLike} activeOpacity={0.8}>
          <View style={fc.actionPillRow}>
            <Animated.View style={heartStyle}>
              <MCIcon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#7B3FF2' : colors.textTertiary} />
            </Animated.View>
            {likeCount > 0 && (
              <Text style={[fc.actionCount, { color: liked ? '#7B3FF2' : colors.textTertiary }]}>{fmtN(likeCount)}</Text>
            )}
          </View>
        </TouchableOpacity>

        {!commentsDisabled && <TouchableOpacity style={fc.actionBtn} onPress={() => onComment((d: number) => setCommentCount((v: number) => v + d), (n: number) => setCommentCount((v: number) => Math.max(v, n)))} activeOpacity={0.8}>
          <View style={fc.actionPillRow}>
            <MCIcon name="comment-outline" size={18} color={commentCount > 0 ? colors.primary : colors.textTertiary} />
            {commentCount > 0 && (
              <Text style={[fc.actionCount, { color: colors.primary }]}>{fmtN(commentCount)}</Text>
            )}
          </View>
        </TouchableOpacity>}

        <TouchableOpacity style={fc.actionBtn} onPress={handleShare} activeOpacity={0.8}>
          <View style={fc.actionPillRow}>
            <MCIcon name="share-outline" size={18} color={shareCount > 0 ? colors.primary : colors.textTertiary} />
            {shareCount > 0 && (
              <Text style={[fc.actionCount, { color: colors.primary }]}>{fmtN(shareCount)}</Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[fc.actionBtn, { flex: 0, paddingHorizontal: 10 }]} onPress={handleSave} activeOpacity={0.8}>
          <View style={fc.actionPill}>
            <Animated.View style={saveStyle}>
              <MCIcon name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? colors.primary : colors.textTertiary} />
            </Animated.View>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Modals / sheets ─────────────────────────────────────────────── */}
      {cardMenuOpen && (
        <CardContextMenu item={item} colors={colors} isSaved={saved} isFollowing={isFollowing}
          isOwnContent={isOwnContent} authorName={authorName}
          onClose={() => setCardMenuOpen(false)} onSave={handleSave} onShare={handleShare}
          onFollow={onToggleFollow} onReport={() => { setCardMenuOpen(false); setReportVisible(true); }}
          onHide={handleHide} onRemind={handleRemind} hasReminder={hasReminder} />
      )}
      <ReportModal visible={reportVisible} contentType={isEvent ? 'event' : 'concert'} contentId={item.id} onClose={() => setReportVisible(false)} />
      {shareOpen && (
        isEvent
          ? <ShareBottomSheet type="event" event={item.data as Event} visible={shareOpen} onClose={() => setShareOpen(false)} onShareCountChange={handleShareDone} />
          : <ShareBottomSheet type="concert" concert={item.data as Concert} visible={shareOpen} onClose={() => setShareOpen(false)} onShareCountChange={handleShareDone} />
      )}
      <LikersBottomSheet visible={likersOpen} onClose={() => setLikersOpen(false)} postId={item.id} likeCount={likeCount}
        fetchLikers={(page, limit) => isEvent ? socialService.getReactionLikers({ event_id: item.id, page, limit }) : socialService.getReactionLikers({ concert_id: item.id, page, limit })}
        onNavigateToProfile={uid => { setLikersOpen(false); setTimeout(() => (nav as any).navigate('UserProfile', { userId: uid }), 300); }} />
    </View>
  );
});

const { width: SW, height: SH } = Dimensions.get('window');

const fmtN = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
};

// ── FeedCard styles ───────────────────────────────────────────────────────────
const fc = StyleSheet.create({
  card:           { backgroundColor: '#fff', marginHorizontal: 6, marginBottom: 6, borderRadius: 12, overflow: 'hidden' },
  // Hero
  liveBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  liveDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  liveBadgeText:  { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  chipBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  chipBadgeText:  { fontSize: 9, fontWeight: '800' },
  typeBadgeText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  titleWrap:      { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 8 },
  heroTitle:      { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, lineHeight: 21, marginBottom: 4 },
  heroMeta:       { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  heroMetaText:   { fontSize: 12, fontWeight: '500' },
  heroMetaDot:    { fontSize: 11 },
  // Header auteur
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  headerLeft:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  authorName:     { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
  timeAgo:        { fontSize: 11, fontWeight: '500', marginTop: 1 },
  followChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  // Description
  descWrap:       { paddingHorizontal: 12, paddingBottom: 8 },
  desc:           { fontSize: 14, lineHeight: 21 },
  // Compteurs
  countsRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  countChip:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countText:    { fontSize: 12, fontWeight: '500' },
  likeIcon:     { width: 18, height: 18, borderRadius: 9, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  commentIcon:  { width: 18, height: 18, borderRadius: 9, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  shareIcon:    { width: 18, height: 18, borderRadius: 9, backgroundColor: '#6B7280', alignItems: 'center', justifyContent: 'center' },
  // Actions
  actionBar:      { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, paddingVertical: 3, gap: 4 },
  actionBtn:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionPill:     {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  actionPillRow:  {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 36, paddingHorizontal: 4,
  },
  actionCount:    { fontSize: 12, fontWeight: '600' },
  actionText:     { fontSize: 12, fontWeight: '600' },
});

const nbS = StyleSheet.create({
  wrap:     { paddingVertical: 14, marginBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title:    { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  seeAll:   { fontSize: 13, fontWeight: '700' },
  list:     { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  card:     { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  iconWrap: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  cardBody: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, gap: 3 },
  name:     { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  handle:   { fontSize: 10, textAlign: 'center' },
  goBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, borderRadius: 8, paddingVertical: 9, width: '100%' },
  goBtnText:{ fontSize: 13, fontWeight: '700', color: '#fff' },
});

