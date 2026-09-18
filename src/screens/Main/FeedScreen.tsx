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
import { SkeletonBox, SkeletonFeed, SkeletonFeedScreen, AvatarWithBadge, ReportModal, CommentsBottomSheet, PostCard, ExpandableText, LikersBottomSheet, FriendsWhoLiked, CachedImage, LiveThumbnailBackground, PriceWithLocal, GofolyxLoader, PeopleSuggestions } from '../../components/common';
import { cacheImage } from '../../services/imageCacheService';
import { AdvertiserRow, AdCTA, AdFullscreenPlayer, adIsVideo, type AdData } from '../../components/ads';
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
import { communityService, type CommunityData } from '../../services/communityService';
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
import { SectionHeader } from '../../components/common/SectionHeader';
import { FeedCarousel, FeedCardLayout, FeedRadius, FeedActionIcon, getFeedCardStyle } from '../../theme/feed';
import { feedStyles as s } from '../../styles/FeedScreen.styles';
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
    position: 'absolute', top: -4, right: -6,
    minWidth: 12, height: 12, borderRadius: 6,
    backgroundColor: '#7B3FF2',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: '#000',
  },
  badgeText: { color: '#fff', fontSize: 7, fontWeight: '800' },
});


// ── AdCard — publicité native dans le feed (direction éditoriale) ─────────────
// Type AdData, hooks et sous-composants viennent de src/components/ads/.
// `settled` = la carte est immobile à l'écran depuis ≥ ~450 ms → le CTA passe
// de « lien texte » à « bouton discret » avec une accroche unique.

const AdCard: React.FC<{
  ad: AdData;
  colors: AppColors;
  settled?: boolean;
  searchOverlay?: boolean;   // rendu dans l'overlay recherche : CTA = lien texte, entrée FadeInDown
  onImpression: (id: string) => void;
  onPress: (id: string, url: string) => void;
  onOpenFullscreen: (ad: AdData) => void;
}> = React.memo(({ ad, colors, settled = false, searchOverlay = false, onImpression, onPress, onOpenFullscreen }) => {
  const firedRef = useRef<string | null>(null);
  useEffect(() => {
    if (ad?.id && firedRef.current !== ad.id) {
      firedRef.current = ad.id;
      onImpression(ad.id);
    }
  }, [ad?.id, onImpression]);

  const creativeUri = ad.creative_url || ad.thumbnail_url;
  const isVideo = adIsVideo(ad);
  const [imgFailed, setImgFailed] = useState(false);
  const hasCreative = !!creativeUri && !(imgFailed && !isVideo);

  const handleCardPress = () => {
    if (isVideo) { onOpenFullscreen(ad); return; }
    if (ad.cta_url) onPress(ad.id, ad.cta_url);
  };
  const handleCta = () => {
    if (isVideo) { onOpenFullscreen(ad); return; }
    onPress(ad.id, ad.cta_url ?? '');
  };

  // Carte douce SANS ombre (direction éditoriale : la pub se fond). La pub arrive
  // déjà résolue depuis le backend (voir InjectionPlanner.maybe_inject_ads côté
  // serveur) — plus de placeholder à hauteur estimée qui change de taille au
  // chargement, donc plus besoin de minHeight réservée ici.
  const cardStyle = {
    ...getFeedCardStyle(colors),
    shadowOpacity: 0,
    elevation: 0,
  };
  // Dans l'overlay recherche : entrée FadeInDown + fond sombre (cohérent avec l'overlay).
  const Wrapper: any = searchOverlay ? Animated.View : React.Fragment;
  const wrapperProps = searchOverlay ? { entering: FadeInDown.duration(220) } : {};
  const mediaAlwaysOn = searchOverlay || settled;

  return (
    <Wrapper {...wrapperProps}>
    <GHTouchableOpacity style={cardStyle} activeOpacity={0.94} onPress={handleCardPress}>
      <AdvertiserRow ad={ad} variant="light" />

      {(ad.title || ad.description) ? (
        <View style={adSt.copy}>
          {ad.title ? <Text style={[adSt.hl, { color: colors.textPrimary }]} numberOfLines={2}>{ad.title}</Text> : null}
          {ad.description ? <Text style={[adSt.sub, { color: colors.textSecondary }]} numberOfLines={3}>{ad.description}</Text> : null}
        </View>
      ) : null}

      <View style={adSt.mediaWrap}>
        {hasCreative ? (
          isVideo ? (
            <View style={adSt.mediaClip}>
              <FeedAdVideo uri={creativeUri!} thumbnailUri={ad.thumbnail_url} isVisible={mediaAlwaysOn} />
            </View>
          ) : (
            <CachedImage uri={creativeUri!} style={[adSt.image, adSt.mediaClip]} resizeMode="cover" onError={() => setImgFailed(true)} />
          )
        ) : (
          <View style={[adSt.imagePlaceholder, adSt.mediaClip, { backgroundColor: colors.primary + '12' }]}>
            <Icon name="image" size={30} color={colors.primary + '55'} />
          </View>
        )}
      </View>

      {ad.cta_url ? (
        <AdCTA
          ad={ad}
          context={searchOverlay ? 'search-overlay' : 'feed'}
          activated={searchOverlay ? true : settled}
          onPress={handleCta}
        />
      ) : null}
    </GHTouchableOpacity>
    </Wrapper>
  );
});

// Créatif vidéo du feed — ne charge le flux qu'une fois la carte réellement
// visible/immobile (settled). Bouton mute superposé.
const FeedAdVideo: React.FC<{ uri: string; thumbnailUri?: string; isVisible: boolean }> = ({ uri, thumbnailUri, isVisible }) => {
  const [muted, setMuted] = useState(true);
  const everVisibleRef = useRef(false);
  if (isVisible) everVisibleRef.current = true;

  const videoSource = useMemo(
    () => (everVisibleRef.current ? { uri } : 'about:blank'),
    [uri, everVisibleRef.current],
  );
  const player = useVideoPlayer(videoSource, p => { p.loop = true; p.muted = true; });

  useEffect(() => {
    if (isVisible) player.play();
    else player.pause();
  }, [isVisible, player]);

  const toggleMute = useCallback(() => {
    setMuted(m => { player.muted = !m; return !m; });
  }, [player]);

  if (!everVisibleRef.current) {
    return thumbnailUri ? <CachedImage uri={thumbnailUri} style={adSt.image} resizeMode="cover" /> : null;
  }
  return (
    <View style={{ position: 'relative' }}>
      <VideoView player={player} style={adSt.image} resizeMode="cover" controls={false} />
      <TouchableOpacity onPress={toggleMute} style={adSt.muteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name={muted ? 'volume-x' : 'volume-2'} size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const adSt = StyleSheet.create({
  copy:            { paddingHorizontal: FeedCardLayout.padH, paddingTop: 10, paddingBottom: 12 },
  hl:              { fontSize: 15, fontWeight: '700', lineHeight: 21, letterSpacing: -0.2 },
  sub:             { fontSize: 13, lineHeight: 19, marginTop: 5 },
  mediaWrap:       { paddingHorizontal: FeedCardLayout.padH, paddingBottom: 0 },
  mediaClip:       { borderRadius: FeedRadius.media, overflow: 'hidden' },
  image:           { width: '100%', aspectRatio: 1.6 },
  imagePlaceholder:{ width: '100%', aspectRatio: 1.6, alignItems: 'center', justifyContent: 'center' },
  muteBtn:         { position: 'absolute', bottom: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
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
    <TouchableOpacity style={{ width: FeedCarousel.cardW, borderRadius: 14, overflow: 'hidden', backgroundColor: surfaceColor }} activeOpacity={0.85} onPress={onPress}>
      <View style={{ width: FeedCarousel.cardW, height: FeedCarousel.cardH, position: 'relative' }}>
        {c.thumbnail_url
          ? <CachedImage uri={c.thumbnail_url} style={{ width: FeedCarousel.cardW, height: FeedCarousel.cardH }} />
          : <LinearGradient colors={['#7B3FF2', '#E0389A']} style={{ width: FeedCarousel.cardW, height: FeedCarousel.cardH, alignItems: 'center', justifyContent: 'center' }}><Icon name="radio" size={28} color="#fff" /></LinearGradient>
        }
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 64 }} />
        <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0365A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
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
  const liveTotal = liveConcerts.length + spontLives.length;
  if (!liveTotal && !showNearby) return null;
  return (
    <View style={{ backgroundColor: colors.background }}>
      {/* ── En direct — concerts + lives spontanés fusionnés en UNE section ── */}
      {liveTotal > 0 && (
        <View style={{ marginTop: 8, marginBottom: 4 }}>
          <SectionHeader
            title="En direct"
            colors={colors}
            icon="radio"
            iconColor={colors.liveTag}
            count={liveTotal}
            onSeeAll={liveConcerts.length ? onNavLiveList : onNavSpontList}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: FeedCarousel.padH, gap: FeedCarousel.gap }}>
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
            {spontLives.map(live => {
              const liveName = live.user?.display_name ?? live.user?.username ?? 'Utilisateur';
              const liveInitial = (liveName || 'U')[0].toUpperCase();
              return (
                <TouchableOpacity
                  key={live.id}
                  style={{ width: FeedCarousel.cardW, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (currentUserId === live.user_id) onNavSpontStream(live.id);
                    else onNavSpontViewer(live.id);
                  }}
                >
                  <View style={{ width: FeedCarousel.cardW, height: FeedCarousel.cardH, position: 'relative' }}>
                    <LiveThumbnailBackground
                      thumbnailUrl={live.thumbnail_url}
                      avatarUrl={live.user?.avatar_url}
                      initials={liveInitial}
                      avatarSize={44}
                    />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 64 }} />

                    {/* Badge LIVE */}
                    <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.liveTag, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' }} />
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>LIVE</Text>
                    </View>

                    {/* Badge privé */}
                    {live.is_private && (
                      <View style={{ position: 'absolute', top: 22, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + 'D9', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
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
                      ? <CachedImage uri={live.user.avatar_url} style={{ position: 'absolute', bottom: 22, alignSelf: 'center', width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff' }} />
                      : <View style={{ position: 'absolute', bottom: 22, alignSelf: 'center', width: 34, height: 34, borderRadius: 17, backgroundColor: colors.liveTag, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{liveInitial}</Text>
                        </View>
                    }
                    <View style={{ position: 'absolute', bottom: 6, left: 4, right: 4, alignItems: 'center' }}>
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
        <View style={[nbS.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SectionHeader
            title="Dans ton quartier"
            colors={colors}
            icon="map-pin"
            onSeeAll={onNavNearby}
          />
          <Text style={[nbS.subtitle, { color: colors.textTertiary, paddingHorizontal: 16, marginTop: -4, marginBottom: 10 }]}>
            Des événements proches de toi
          </Text>
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
    </View>
  );
});

// ── Encart : suggestions de communautés ─────────────────────────────────────────
// Même gabarit de carte que PeopleSuggestions (cover + avatar chevauchant +
// nom + bouton) — cohérence visuelle entre tous les encarts de suggestion du
// feed, et beaucoup plus de présence que l'ancienne simple liste 44px.
const COMM_CARD_W    = Math.round(Dimensions.get('window').width * 0.45);
const COMM_COVER_H   = Math.round(COMM_CARD_W * 0.5);
const COMM_AVATAR_SZ = Math.round(COMM_CARD_W * 0.4);

const CommunitiesInlineCard: React.FC<{
  communities: CommunityData[];
  colors: AppColors;
  nav: any;
}> = ({ communities, colors, nav }) => {
  const [joined, setJoined] = useState<Set<string>>(new Set());

  async function join(id: string) {
    setJoined(prev => new Set(prev).add(id));
    try { await communityService.join(id); }
    catch { setJoined(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  }

  return (
    <View style={[getFeedCardStyle(colors), { paddingTop: 12 }]}>
      <SectionHeader
        title="Ta tribu t'attend"
        colors={colors}
        icon="users"
        seeAllLabel="Explorer"
        onSeeAll={() => nav.navigate('Communities' as any)}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 4, paddingBottom: 12, gap: 10 }}>
        {communities.map(c => {
          const isJoined = joined.has(c.id);
          const initial  = c.name?.[0]?.toUpperCase() ?? '?';
          return (
            <View key={c.id} style={{ width: COMM_CARD_W, borderRadius: FeedRadius.media, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, backgroundColor: colors.surface, overflow: 'hidden' }}>
              {/* Cover — bannière si dispo, sinon dégradé de marque */}
              <TouchableOpacity activeOpacity={0.9} onPress={() => nav.navigate('CommunityChat', { communityId: c.id, communityName: c.name })}>
                {c.banner_url ? (
                  <CachedImage uri={c.banner_url} style={{ width: '100%', height: COMM_COVER_H }} resizeMode="cover" />
                ) : (
                  <LinearGradient
                    colors={[colors.gradientStart ?? colors.primary, colors.gradientEnd ?? colors.primary]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ width: '100%', height: COMM_COVER_H }}
                  />
                )}
              </TouchableOpacity>

              {/* Avatar chevauchant, centré */}
              <View style={{ alignSelf: 'center', marginTop: -(COMM_AVATAR_SZ / 2) }}>
                <View style={{
                  width: COMM_AVATAR_SZ + 4, height: COMM_AVATAR_SZ + 4, borderRadius: (COMM_AVATAR_SZ + 4) / 2,
                  borderWidth: 3, borderColor: colors.surface, overflow: 'hidden', backgroundColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {c.avatar_url
                    ? <CachedImage uri={c.avatar_url} style={{ width: '100%', height: '100%' }} />
                    : <Text style={{ color: '#fff', fontWeight: '800', fontSize: COMM_AVATAR_SZ * 0.4 }}>{initial}</Text>
                  }
                </View>
              </View>

              {/* Infos */}
              <View style={{ alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, paddingTop: 8, gap: 4 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
                  {c.name}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                  {(c.members_count ?? 0).toLocaleString()} membres
                </Text>

                <TouchableOpacity
                  disabled={isJoined}
                  onPress={() => join(c.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    marginTop: 8, borderRadius: 8, paddingVertical: 10, width: '100%',
                    backgroundColor: isJoined ? 'transparent' : colors.primary,
                    borderWidth: isJoined ? 1.5 : 0, borderColor: colors.border,
                  }}>
                  <Icon name={isJoined ? 'check' : 'plus'} size={14} color={isJoined ? colors.textSecondary : '#fff'} />
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: isJoined ? colors.textSecondary : '#fff' }}>
                    {isJoined ? 'Membre ✓' : 'Rejoindre'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

// ── Encart : rangée de reels ───────────────────────────────────────────────────
// Carte grande, style Facebook "Reels pour vous" : 60% de la largeur d'écran
// SUR TÉLÉPHONE — bien plus de présence qu'une simple vignette. Sur tablette
// (largeur qui explose), 60% donnerait des cartes démesurées : on plafonne à
// une largeur "confortable" de contenu vertical (280px, ~1.7 reel visible
// même sur grand écran) au lieu de laisser le pourcentage grimper sans limite.
// useWindowDimensions() (pas Dimensions.get figé) pour réagir aux rotations/
// changements de fenêtre (split-screen, pliable).
const REEL_ROW_MAX_W = 280;

const ReelRowInlineCard: React.FC<{
  reels: any[];
  colors: AppColors;
  nav: any;
}> = ({ reels, colors, nav }) => {
  const { width: winW } = useWindowDimensions();
  const cardW = Math.min(Math.round(winW * 0.60), REEL_ROW_MAX_W);
  return (
    <View style={[getFeedCardStyle(colors), { paddingTop: 12 }]}>
      <SectionHeader
        title="Reels pour toi"
        colors={colors}
        icon="film"
        onSeeAll={() => nav.navigate('Tabs', { screen: 'Reels' } as any)}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, paddingBottom: 12, gap: 10 }}>
        {reels.map(r => {
          const authorName = r.author?.display_name ?? r.author?.username ?? null;
          return (
            <TouchableOpacity
              key={r.id}
              activeOpacity={0.9}
              onPress={() => (nav as any).navigate('Tabs', { screen: 'Reels', params: { initialReelId: r.id, initialReel: r } })}
              style={{ width: cardW, aspectRatio: 9 / 16, borderRadius: FeedRadius.media, overflow: 'hidden', backgroundColor: '#000' }}>
              {r.thumbnail_url
                ? <CachedImage uri={r.thumbnail_url} style={{ width: '100%', height: '100%' }} />
                : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="film" size={30} color="rgba(255,255,255,0.3)" />
                  </View>
              }
              {/* Icône lecture centrée — affirme que c'est un contenu vidéo */}
              <View style={{ position: 'absolute', top: '42%', left: '42%' }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="play" size={15} color="#fff" style={{ marginLeft: 2 }} />
                </View>
              </View>
              {/* Overlay bas dégradé — auteur + vues, lisibilité garantie */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.75)']}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', justifyContent: 'flex-end', padding: 10, gap: 3 }}
              >
                {authorName ? (
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#fff' }} numberOfLines={1}>
                    {authorName}
                  </Text>
                ) : null}
                {(r.view_count ?? 0) > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="eye" size={11} color="rgba(255,255,255,0.85)" />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>
                      {(r.view_count ?? 0) >= 1000 ? `${((r.view_count ?? 0) / 1000).toFixed(1)}k` : r.view_count}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

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
  const { addListener, removeListener, lastLiveStarted, lastLiveEnded, lastLiveViewersUpdated, lastPresenceUpdate, unreadMessages, unreadActivity, unreadNotifications } = useWs();
  const headerNotifCount = unreadNotifications + unreadActivity;
  const { currentUser } = useUser();
  // false — ne demande pas la permission localisation des l'arrivee sur le feed,
  // uniquement la section secondaire "Pres de toi" en beneficie ici.
  const userLocation = useUserLocation(false);
  const [filter,      setFilter]      = useState<FeedFilter>('all');
  const [items,       setItems]       = useState<FeedItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const lastLoadedAtRef = useRef<number>(0);
  // ── Scroll infini ────────────────────────────────────────────────────────
  const feedPageRef      = useRef(1);
  const feedHasMoreRef   = useRef(true);
  const [hasMoreFeed,    setHasMoreFeed]    = useState(true);
  const [loadingMoreFeed, setLoadingMoreFeed] = useState(false);
  const loadingMoreRef   = useRef(false);
  const seenItemIdsRef   = useRef<Set<string>>(new Set());
  // Continuité de comptage entre page 1 (load) et pages suivantes (loadMoreFeed)
  // — sert à espacer la pub côté client.
  const nonReelCountRef  = useRef(0);
  const feedListRef     = useRef<FlatList>(null);
  const [liveConcerts,    setLiveConcerts]    = useState<Concert[]>([]);
  const [spontLives,      setSpontLives]      = useState<LiveStream[]>([]);
  const [nearbyEvents,    setNearbyEvents]    = useState<Event[]>([]);
  // Miroirs synchrones — lus par applySpontLivesUpdate quand on n'est pas au
  // sommet (le state peut être en retard d'un tick sur ce qu'on veut accumuler).
  const spontLivesRef   = useRef<LiveStream[]>([]);
  const liveConcertsRef = useRef<Concert[]>([]);
  useEffect(() => { spontLivesRef.current = spontLives; }, [spontLives]);
  useEffect(() => { liveConcertsRef.current = liveConcerts; }, [liveConcerts]);
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
  const [adVisible, setAdVisible] = useState(false);
  // « settled » — un slot pub visible depuis ≥ SETTLE_MS sans que la liste ne
  // bouge → le CTA de la carte passe de « lien texte » à « bouton discret » avec
  // son accroche unique (direction éditoriale). Set des slotId déjà settled +
  // timers en cours, gérés dans onFeedViewableChanged / handleFeedScroll.
  const SETTLE_MS = 450;
  const [settledAdSlots, setSettledAdSlots] = useState<Set<string>>(new Set());
  const settleTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const clearSettleTimers = useCallback(() => {
    Object.values(settleTimersRef.current).forEach(clearTimeout);
    settleTimersRef.current = {};
  }, []);
  // Ref stable vers loadMoreFeed — onFeedViewableChanged est figé au montage (useRef().current,
  // imposé par onViewableItemsChanged qui n'accepte pas de callback changeant de référence),
  // donc on ne peut pas appeler loadMoreFeed directement dedans (sa référence change à chaque
  // render selon ses dépendances). Synchronisée juste après la définition de loadMoreFeed.
  const loadMoreFeedRef = useRef<() => void>(() => {});
  // Callback stable pour onEndReached — avant ce fix, onEndReached recevait directement
  // loadMoreFeed (qui change de référence à chaque changement de hasMoreFeed, donc après
  // CHAQUE page chargée). FlatList réinitialise son suivi interne du seuil de scroll déjà
  // traité à chaque changement de référence de onEndReached, ce qui peut faire rater ou
  // dupliquer un déclenchement selon le timing — incohérent avec onFeedViewableChanged, qui
  // utilise déjà une ref stable pour cette même raison. handleEndReached ne change jamais
  // d'identité (deps vides), donc FlatList peut fiablement suivre son état interne.
  const handleEndReached = useCallback(() => { loadMoreFeedRef.current(); }, []);

  // Taille de page harmonisée avec le web (FeedPage.tsx, FEED_PAGE_SIZE) — même
  // valeur partout, page 1 comprise, pour que la pagination web/mobile se
  // comporte de façon identique et prévisible.
  const FEED_PAGE_SIZE = 30;

  // Distance en nombre d'items restants à laquelle on déclenche le chargement de la page
  // suivante. Un seuil trop serre (teste a 2/30) s'est revele peu fiable en pratique :
  // onViewableItemsChanged exige minimumViewTime (200ms) de stabilisation sur l'item
  // visible, qu'un scroll rapide (fling) ne laisse pas toujours le temps d'atteindre sur
  // les tout derniers items — le declenchement pouvait alors ne jamais avoir lieu, et
  // rien ne re-tente automatiquement. 5/30 (~17%) reste proche de la fin reelle (pas
  // d'anticipation large) tout en laissant assez de marge pour ne jamais rater le
  // declenchement, meme en scroll rapide.
  const PREFETCH_ITEMS_REMAINING = 5;
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
      default:
        return []; // ad : pas de prefetch via ce chemin générique
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
  // Vrai tant que la liste est proche du haut. Sert à figer le ListHeader
  // (carrousels "En direct" / "Dans ton quartier") quand on est scrollé plus bas :
  // un changement de hauteur du header alors qu'on lit plus bas dans le feed
  // repousse tout le contenu et donne l'impression que "le scroll revient en
  // arrière tout seul" au retour de focus (les events WS lives / la géoloc
  // rechargent et redimensionnent le header). Seuil = stories + titre de la
  // section "En direct" (~260px) : dès que le carrousel commence à sortir par le
  // haut, on gèle le header. La resync se fait dès qu'on repasse sous ce seuil.
  const AT_TOP_THRESHOLD = 260;
  const feedAtTopRef = useRef(true);
  const [feedAtTop, setFeedAtTop] = useState(true);
  // Dernier instantané "En direct" reçu pendant qu'on lisait plus bas — appliqué
  // en différé quand on remonte au sommet (voir l'effect de resync du header).
  const pendingLiveHeaderRef = useRef<{ liveConcerts: Concert[]; spontLives: LiveStream[] } | null>(null);
  // Offset de scroll à restaurer juste après un refresh silencieux de focus
  // (filet de sécurité ultime si malgré tout une hauteur au-dessus a bougé).
  const focusRestoreOffsetRef = useRef<number | null>(null);
  const lastScrollYRef = useRef(0);
  // Vrai tant que le doigt de l'utilisateur tient la liste (entre begin/end drag)
  // ou que la liste décélère après un fling — la restauration d'offset s'abstient.
  const userDraggingRef = useRef(false);
  const handleFeedScroll = (e: any) => {
    const offsetY = e.nativeEvent?.contentOffset?.y ?? 0;
    lastScrollYRef.current = offsetY;
    const atTop = offsetY < AT_TOP_THRESHOLD;
    if (atTop !== feedAtTopRef.current) {
      feedAtTopRef.current = atTop;
      setFeedAtTop(atTop);
    }
    const approxIndex = Math.floor(offsetY / AVG_ITEM_HEIGHT);
    if (approxIndex > lastScrollPrefetchIndexRef.current) {
      lastScrollPrefetchIndexRef.current = approxIndex;
      InteractionManager.runAfterInteractions(() => prefetchUpcomingImages(approxIndex + 1));
    }
  };

  const onFeedViewableChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setActiveReelId(null);

    // Pub vidéo : ne joue que quand réellement visible à l'écran (coupe le stream sinon)
    setAdVisible(viewableItems.some(v => v.item?.kind === 'ad'));

    // « settled » : un slot pub visible → on arme un timer ; s'il tient SETTLE_MS
    // sans que le slot ne quitte la zone visible (viewability se re-déclenche au
    // scroll), on marque le slot settled. Slots sortis de vue → timer annulé.
    const visibleAdSlots = new Set<string>(
      viewableItems.filter(v => v.item?.kind === 'ad').map(v => v.item.id as string),
    );
    for (const slotId of Object.keys(settleTimersRef.current)) {
      if (!visibleAdSlots.has(slotId)) {
        clearTimeout(settleTimersRef.current[slotId]);
        delete settleTimersRef.current[slotId];
      }
    }
    visibleAdSlots.forEach(slotId => {
      if (settleTimersRef.current[slotId]) return;
      settleTimersRef.current[slotId] = setTimeout(() => {
        delete settleTimersRef.current[slotId];
        setSettledAdSlots(prev => {
          if (prev.has(slotId)) return prev;
          const next = new Set(prev);
          next.add(slotId);
          return next;
        });
      }, SETTLE_MS);
    });

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



  // ── Suggestions intelligentes : contacts + localisation ──────────────────────
  // Hash SHA-256 des contacts avant l'envoi (jamais de numéro/email en clair côté
  // serveur), et position GPS ponctuelle — influencent le classement calculé par
  // UserService.suggest_users côté backend.
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
      }
    } catch { /* silencieux — les suggestions restent utilisables sans contacts */ }
  }, []);

  const syncLocationForSuggestions = useCallback(() => {
    Geolocation.getCurrentPosition(
      pos => {
        userService.updateLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

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
          'Trouve tes amis sur Gofolyx',
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

  // ── Chargement de la pub feed — une campagne par emplacement, jamais deux fois la
  // même dans le même feed (exclude_ids envoyé au backend à chaque tirage). Retourne
  // l'id de la pub obtenue (ou null si aucune campagne disponible/restante).
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

  // Garde synchrone : tant que load('all') (page 1 / rechargement complet) n'a pas
  // fini d'écrire son résultat dans items, loadMoreFeed ne doit jamais démarrer —
  // sinon la page 2 pourrait se charger avant que la page 1 ne soit stabilisée à
  // l'écran (ex: viewability/onEndReached se déclenchant pendant que load() tourne
  // encore). Contrairement au state `loading` (asynchrone, re-render différé), une
  // ref est lue/écrite de façon synchrone, donc fiable comme garde immédiate.
  const loadingInitialRef = useRef(false);

  const load = useCallback(async (f: FeedFilter, silent = false, forceRefresh = false) => {
    if (f === 'all') loadingInitialRef.current = true;
    try {
      if (f === 'all') {
        // Reset pagination — uniquement pour un vrai rechargement (1er montage, pull-to-
        // refresh, changement de filtre). Un refresh silencieux (retour de focus) alors que
        // l'utilisateur a déjà scrollé plus loin ne doit PAS réinitialiser la pagination —
        // voir le early-return plus bas qui bloque ce cas avant de toucher aux items/refs.
        // Refresh silencieux alors que l'utilisateur a déjà scrollé plus loin (pages > 1) :
        // sortir tout de suite, AVANT tout fetch réseau et toute écriture de ref — sinon un
        // fetch page 1 écraserait silencieusement les refs de pagination déjà avancées
        // (feedPageRef...) avec des valeurs de page 1, cassant loadMoreFeed au prochain
        // scroll sans que rien ne se voie tout de suite (les items affichés, eux, ne
        // changent pas).
        if (silent && feedPageRef.current > 1) {
          lastLoadedAtRef.current = Date.now();
          loadingInitialRef.current = false;
          return;
        }

        if (!silent) {
          feedPageRef.current = 1;
          setHasMoreFeed(true);
          feedHasMoreRef.current = true;
        }
        // /search/feed renvoie events/concerts/posts/pub déjà positionnée et résolue
        // par le backend (voir InjectionPlanner.maybe_inject_ads côté serveur — la
        // pub arrive comme un item complet, plus de slot différé côté client).
        const [feedResult, liveConcerts, spontLivesResult] = await Promise.all([
          searchService.getFeed(1, FEED_PAGE_SIZE, false, forceRefresh).catch(() => ({ items: [] })),
          concertService.getLive().catch(() => [] as Concert[]),
          liveService.getLives().catch(() => [] as LiveStream[]),
        ]);
        feedHasMoreRef.current = (feedResult.items ?? []).length >= FEED_PAGE_SIZE;
        // Header "En direct" : ne le laisser changer de hauteur (donc pousser tout
        // le feed) QUE si l'utilisateur est au sommet, ou lors d'un vrai
        // rechargement (pull-to-refresh / changement de filtre / 1er montage).
        // Un refresh silencieux au retour de focus alors qu'on lit plus bas ne
        // doit jamais bouger le carrousel — sinon "l'écran glisse tout seul".
        if (!silent || feedAtTopRef.current) {
          setLiveConcerts(Array.isArray(liveConcerts) ? liveConcerts : []);
          setSpontLives(Array.isArray(spontLivesResult) ? spontLivesResult : []);
        } else {
          pendingLiveHeaderRef.current = {
            liveConcerts: Array.isArray(liveConcerts) ? liveConcerts : [],
            spontLives: Array.isArray(spontLivesResult) ? spontLivesResult : [],
          };
        }

        const feedRaw: any[] = feedResult.items ?? [];
        const seen = new Set<string>();
        const result: FeedItem[] = [];
        let nonSpecialCount = 0;
        for (const d of feedRaw) {
          if (!d || !d.id) continue;
          if (d.kind === 'event' || d.kind === 'concert' || d.kind === 'post') {
            const key = `${d.kind}-${d.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            result.push({ kind: d.kind, id: d.id, data: d });
            nonSpecialCount += 1;
          } else if (d.kind === 'ad') {
            // Pub déjà résolue par le backend — item complet (créatif inclus),
            // jamais de placeholder à remplir après coup.
            result.push({ kind: 'ad', id: d.id, data: d });
          } else if (d.kind === 'reel_row') {
            result.push({ kind: 'reel_row', id: d.id, data: d.reels ?? [] });
          } else if (d.kind === 'suggestions') {
            result.push({ kind: 'suggestions', id: d.id, data: d.users ?? [] });
          } else if (d.kind === 'communities') {
            result.push({ kind: 'communities', id: d.id, data: d.communities ?? [] });
          }
        }
        // Filtrer les contenus masqués ("Pas intéressé") — après mapping, pour
        // ne s'appliquer qu'au contenu normal (pas aux encarts spéciaux).
        const filtered = feedPreferenceService.filterFeed(result);

        // Mémorise les clés composites (kind-id) chargées en page 1 pour dédupliquer
        // les pages suivantes du scroll infini (loadMoreFeed)
        seenItemIdsRef.current = new Set(filtered.map(i => `${i.kind}-${i.id}`));
        nonReelCountRef.current = nonSpecialCount;

        // En mode silent : ne remplacer les items QUE si le contenu a réellement
        // changé. Comparer uniquement les `id` ne suffit pas : les rangées
        // reel_row / suggestions / communities gardent leur id mais leur `data`
        // (nb de reels, liste de suggestions…) change à chaque refetch — la carte
        // se re-render alors avec une hauteur différente et pousse tout ce qui est
        // en dessous. On compare donc une signature du contenu (id + longueur/ids
        // du data pour les rangées, updated_at pour posts/events) ; si identique,
        // on garde `prev` À L'IDENTIQUE (même référence → zéro re-render de cellule).
        if (silent) {
          const sig = (arr: FeedItem[]) => arr.map(i => {
            if (i.kind === 'reel_row' || i.kind === 'suggestions' || i.kind === 'communities') {
              const d = (i.data ?? []) as any[];
              return `${i.kind}:${i.id}:${d.map(x => x?.id ?? '').join('|')}`;
            }
            const u = (i.data as any)?.updated_at ?? (i.data as any)?.created_at ?? '';
            return `${i.kind}:${i.id}:${u}`;
          }).join(',');
          setItems(prev => (sig(prev) === sig(filtered) ? prev : filtered));
        } else {
          setItems(filtered);
        }
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
      loadingInitialRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
  // Nombre max de pages consécutives entièrement recoupées (déjà vues) qu'on retente
  // automatiquement avant d'abandonner — filet de sécurité contre une boucle infinie
  // si le backend recoupe indéfiniment (ne devrait jamais arriver en pratique, le tri
  // par score(temps) finit toujours par exposer du contenu neuf ou par se vider).
  const MAX_CONSECUTIVE_RECOUPEMENT = 5;

  const loadMoreFeed = useCallback(async () => {
    if (filter !== 'all') return; // pagination gérée uniquement pour le flux principal
    // La page 1 (load('all')) doit avoir fini d'écrire son résultat AVANT que la page 2
    // ne puisse démarrer — sans cette garde, un déclenchement de viewability/onEndReached
    // pendant que load() tourne encore pouvait lancer loadMoreFeed en parallèle.
    if (loadingInitialRef.current) return;
    if (loadingMoreRef.current || !hasMoreFeed) return;
    loadingMoreRef.current = true;
    setLoadingMoreFeed(true);

    try {
      // Boucle de retry : une page BRUTE non vide peut ne contenir QUE des items déjà
      // vus (le pool se retrie à chaque appel, score = f(temps)) sans que le catalogue
      // soit pour autant épuisé. Avant ce fix, ce cas se contentait d'avancer la page
      // sans rien ajouter à l'écran — si l'utilisateur était déjà en bas de la liste
      // (plus rien de nouveau à voir), aucun scroll ne se re-déclenchait jamais pour
      // retenter la page suivante : le chargement semblait "s'arrêter" définitivement
      // sans que l'utilisateur sache qu'il restait du contenu à charger. On retente
      // maintenant automatiquement jusqu'à trouver du contenu neuf, jusqu'à ce que le
      // backend confirme qu'il n'y a vraiment plus rien, ou jusqu'à la limite de
      // sécurité ci-dessus.
      for (let attempt = 0; attempt < MAX_CONSECUTIVE_RECOUPEMENT; attempt++) {
        const nextPage = feedPageRef.current + 1;
        const feedResult = await searchService.getFeed(nextPage, FEED_PAGE_SIZE).catch(() => ({ items: [] }));
        const feedRawItems = feedResult.items ?? [];
        feedHasMoreRef.current = feedRawItems.length >= FEED_PAGE_SIZE;
        const rawIsEmpty = feedRawItems.length === 0;

        const appended: FeedItem[] = [];
        let freshNonSpecialCount = 0;
        for (const d of feedRawItems) {
          if (!d || !d.id) continue;
          if (d.kind === 'event' || d.kind === 'concert' || d.kind === 'post') {
            const key = `${d.kind}-${d.id}`;
            if (seenItemIdsRef.current.has(key)) continue;
            seenItemIdsRef.current.add(key);
            appended.push({ kind: d.kind, id: d.id, data: d });
            freshNonSpecialCount += 1;
          } else if (d.kind === 'ad') {
            // Pub déjà résolue par le backend — item complet, jamais de slot différé.
            appended.push({ kind: 'ad', id: d.id, data: d });
          } else if (d.kind === 'reel_row') {
            appended.push({ kind: 'reel_row', id: d.id, data: d.reels ?? [] });
          } else if (d.kind === 'suggestions') {
            appended.push({ kind: 'suggestions', id: d.id, data: d.users ?? [] });
          } else if (d.kind === 'communities') {
            appended.push({ kind: 'communities', id: d.id, data: d.communities ?? [] });
          }
        }

        feedPageRef.current = nextPage;

        if (appended.length === 0) {
          // Page entièrement recoupée : le flux n'est fini que si le backend lui-même
          // ne renvoie plus rien — sinon on boucle immédiatement sur la page suivante
          // au lieu d'attendre un hypothétique futur scroll qui pourrait ne jamais venir.
          if (rawIsEmpty) { setHasMoreFeed(false); break; }
          continue;
        }
        nonReelCountRef.current += freshNonSpecialCount;
        setItems(prev => [...prev, ...appended]);
        break;
      }
    } catch (err) {
      if (__DEV__) console.warn('[FeedScreen] loadMoreFeed error:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMoreFeed(false);
    }
  }, [filter, hasMoreFeed]);
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

  // Applique une transformation au carrousel "En direct" — MAIS seulement si on
  // est au sommet. Scrollé plus bas, on l'accumule dans pendingLiveHeaderRef :
  // l'effect de resync l'appliquera quand on remontera. Sans ça, un événement WS
  // (live qui démarre/s'arrête, viewers) redimensionne le header sous les yeux de
  // l'utilisateur qui lit un post 10 écrans plus bas → "ça glisse tout seul".
  const applySpontLivesUpdate = useCallback((fn: (prev: LiveStream[]) => LiveStream[]) => {
    if (feedAtTopRef.current) {
      setSpontLives(fn);
      return;
    }
    const base = pendingLiveHeaderRef.current?.spontLives ?? spontLivesRef.current;
    pendingLiveHeaderRef.current = {
      liveConcerts: pendingLiveHeaderRef.current?.liveConcerts ?? liveConcertsRef.current,
      spontLives: fn(base),
    };
  }, []);

  // WS : nouveau live spontané démarré → refetch pour respecter is_private + follow
  useEffect(() => {
    if (!lastLiveStarted) return;
    liveService.getLives()
      .then(lives => { applySpontLivesUpdate(() => (Array.isArray(lives) ? lives : [])); })
      .catch(() => {});
  }, [lastLiveStarted, applySpontLivesUpdate]);

  // WS : live spontané terminé
  useEffect(() => {
    if (!lastLiveEnded) return;
    applySpontLivesUpdate(prev => prev.filter(l => l.id !== lastLiveEnded));
  }, [lastLiveEnded, applySpontLivesUpdate]);

  // WS : viewers mis à jour
  useEffect(() => {
    if (!lastLiveViewersUpdated) return;
    applySpontLivesUpdate(prev => prev.map(l =>
      l.id === lastLiveViewersUpdated.live_id
        ? { ...l, current_viewers: lastLiveViewersUpdated.current_viewers }
        : l
    ));
  }, [lastLiveViewersUpdated, applySpontLivesUpdate]);

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
      // Premier chargement : différer après l'animation de navigation (16ms = 1 frame).
      // forceRefresh=true (même correctif que le web, commit db8aa88) : sans ça, le
      // tout premier chargement de l'app pouvait retomber sur un cache serveur vieux
      // de plusieurs minutes, donnant l'impression que le feed ne change jamais.
      const timer = setTimeout(() => load(filter, false, true), 16);
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
    // Retour : refresh silencieux si données > 60s — forceRefresh=true pour
    // bypasser le cache serveur (même correctif que le web, commit db8aa88) :
    // revenir sur l'app après un moment doit vraiment recalculer, pas
    // seulement relire un résultat encore en cache côté backend (TTL 5 min).
    const age = Date.now() - lastLoadedAtRef.current;
    if (age > 60_000) {
      // Filet de sécurité : si l'utilisateur avait scrollé, on mémorise sa
      // position AVANT le refresh. Un effect post-`items` la restaure (sans
      // animation) si malgré les gardes une hauteur au-dessus a bougé — la page
      // ne "glisse" plus jamais au retour, même dans un cas limite non prévu.
      focusRestoreOffsetRef.current = lastScrollYRef.current > 4 ? lastScrollYRef.current : null;
      load(filter, true, true);
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
      clearSettleTimers();
    };
  }, [filter]));

  // Filet de sécurité anti-"la page glisse au retour" : après un refresh
  // silencieux de focus, si on avait mémorisé un offset et que la liste s'est
  // re-rendue, on repositionne le scroll là où il était — MAIS jamais si
  // l'utilisateur a la main sur l'écran (userDraggingRef) : on ne lui vole pas
  // son geste. Ne s'exécute qu'une fois par retour (la ref est consommée).
  useEffect(() => {
    const target = focusRestoreOffsetRef.current;
    if (target == null) return;
    focusRestoreOffsetRef.current = null;
    const id = requestAnimationFrame(() => {
      if (userDraggingRef.current) return;
      try { feedListRef.current?.scrollToOffset({ offset: target, animated: false }); } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, [items]);

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

  // Données du ListHeader "gelées" tant qu'on n'est pas en haut du feed : on ne
  // laisse le header changer de hauteur que quand l'utilisateur est proche du
  // sommet (donc regarde le header). Scrollé plus bas, on garde le dernier
  // instantané — le contenu sous le header ne bouge plus tout seul quand un live
  // WS démarre/s'arrête ou que la géoloc arrive. La resync se fait dès qu'on
  // remonte (feedAtTop repasse à true).
  const [frozenHeaderData, setFrozenHeaderData] = useState({ liveConcerts, spontLives, nearbyEvents });
  useEffect(() => {
    if (!feedAtTop) return;
    // On est (re)monté au sommet : appliquer d'abord l'instantané "En direct"
    // mis en attente par un refresh silencieux, puis resynchroniser le header.
    if (pendingLiveHeaderRef.current) {
      const p = pendingLiveHeaderRef.current;
      pendingLiveHeaderRef.current = null;
      setLiveConcerts(p.liveConcerts);
      setSpontLives(p.spontLives);
      setFrozenHeaderData({ liveConcerts: p.liveConcerts, spontLives: p.spontLives, nearbyEvents });
      return;
    }
    setFrozenHeaderData({ liveConcerts, spontLives, nearbyEvents });
  }, [feedAtTop, liveConcerts, spontLives, nearbyEvents]);

  const feedListHeader = useMemo(() => (
    <>
      {/* Stories scrollent avec le feed — style Instagram/WhatsApp */}
      <StoryBar
        currentUser={currentUser}
        colors={colors}
        onNavigateToMyStories={onNavMyStories}
        onNavigateToChat={onNavChat}
      />
      <FeedListHeader
        liveConcerts={frozenHeaderData.liveConcerts}
        spontLives={frozenHeaderData.spontLives}
        nearbyEvents={frozenHeaderData.nearbyEvents}
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
  ), [frozenHeaderData, colors, theme.isDark,
      currentUser, currentUser?.id, filter,
      onNavMyStories, onNavChat,
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
    if (item.kind === 'ad') {
      // La pub arrive déjà résolue depuis le backend (item.data = AdData complet,
      // voir InjectionPlanner.maybe_inject_ads côté serveur) — jamais de slot vide
      // à remplir après coup, donc jamais de redimensionnement au scroll.
      const ad = item.data as AdData | null;
      if (!ad) return null;
      return (
        <AdCard
          ad={ad}
          colors={colors}
          settled={settledAdSlots.has(item.id)}
          onImpression={handleAdImpression}
          onPress={handleAdPress}
          onOpenFullscreen={setFullscreenAd}
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
    if (item.kind === 'suggestions') {
      const users = (item.data ?? []) as UserPublic[];
      if (!users.length) return null;
      return (
        <PeopleSuggestions
          users={users}
          loading={false}
          onUserPress={userId => (nav as any).navigate('UserProfile', { userId })}
          onRefresh={() => {}}
          followingSet={followingSet}
          onToggleFollow={handleToggleFollow}
        />
      );
    }
    if (item.kind === 'communities') {
      const comms = (item.data ?? []) as CommunityData[];
      if (!comms.length) return null;
      return <CommunitiesInlineCard communities={comms} colors={colors} nav={nav} />;
    }
    if (item.kind === 'reel_row') {
      const reels = (item.data ?? []) as any[];
      if (!reels.length) return null;
      return <ReelRowInlineCard reels={reels} colors={colors} nav={nav} />;
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
  }, [colors, currentUser?.id, followingSet, handleToggleFollow, handlePostDeleted, openComments, nav, load, filter, settledAdSlots, handleAdImpression, handleAdPress]);

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
      <View style={[s.header, { backgroundColor: colors.surface, paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 6) }]}>
        <View style={s.headerRow}>
          {/* Gauche : avatar + pastille "en ligne" — masqué si recherche ouverte */}
          {!searchOpen && (
            !currentUser ? (
              <View style={{ pointerEvents: 'none' }}>
                <SkeletonBox width={36} height={36} borderRadius={18} />
              </View>
            ) : (
              <TouchableOpacity
                style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 3 }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                onPress={() => {
                  if (!showProfilePanel) setAccounts(accountsService.listAccounts());
                  setShowProfilePanel(v => !v);
                }}
              >
                <View>
                  {currentUser.avatar_url ? (
                    <CachedImage uri={currentUser.avatar_url} style={s.avatar} />
                  ) : (
                    <View style={[s.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
                      <Text style={[s.avatarText, { color: colors.primary }]}>{initials}</Text>
                    </View>
                  )}
                  {/* Pastille présence — verte "en ligne" (l'utilisateur courant
                      l'est par définition quand il consulte son feed). */}
                  <View style={{
                    position: 'absolute', right: -1, bottom: -1,
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: '#22C55E',
                    borderWidth: 1.5, borderColor: colors.surface,
                  }} />
                </View>
                {/* Chevron — indique que l'avatar est cliquable (ouvre le panneau
                    profil / multi-comptes). */}
                <Icon
                  name={showProfilePanel ? 'chevron-up' : 'chevron-down'}
                  size={10}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
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

          {/* Centre : barre de recherche permanente (remplace le logo). Au tap,
              ouvre l'overlay de recherche plein écran existant. */}
          {!searchOpen && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={openSearch}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 27, borderRadius: 14, paddingHorizontal: 10,
                marginHorizontal: 6,
                backgroundColor: colors.backgroundSecondary,
                borderWidth: 1, borderColor: colors.divider,
              }}
            >
              <Icon name="search" size={11} color={colors.textTertiary} />
              <Text style={{ flex: 1, fontSize: 10, color: colors.textTertiary }} numberOfLines={1}>
                Rechercher une publication, un ami…
              </Text>
            </TouchableOpacity>
          )}

          {/* Barre de recherche animée — apparaît quand searchOpen */}
          {searchOpen && (
            <Animated.View style={[animatedSearchBar, {
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 8, height: 27,
              borderRadius: 14, borderWidth: 1,
              borderColor: colors.primary + '55',
              backgroundColor: colors.backgroundSecondary,
              gap: 6, flex: 1, marginRight: 6,
            }]}>
              <Icon name="search" size={11} color={colors.primary} />
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
                  <Icon name="x-circle" size={11} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Droite : quand la recherche est ouverte → juste la croix pour fermer.
              Sinon → notifications (cloche + badge) · messages (bulle + badge) ·
              menu (grille "apps", ouvre Explorer — plus qualitatif que le
              hamburger plat). Icônes nues, mêmes tailles que le reste de l'app. */}
          <View style={s.headerRight}>
            {searchOpen ? (
              <TouchableOpacity
                style={[s.iconBtn, { backgroundColor: colors.primary + '18' }]}
                onPress={closeSearch}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="x" size={15} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={goToNotifs}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={{ position: 'relative' }}>
                    <Icon name="bell" size={15} color={colors.textPrimary} />
                    {headerNotifCount > 0 && (
                      <View style={[badgeS.badge, { borderColor: colors.surface, backgroundColor: colors.primary }]}>
                        <Text style={badgeS.badgeText}>{headerNotifCount > 99 ? '99+' : headerNotifCount}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={goToMessages}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={{ position: 'relative' }}>
                    <Icon name="message-circle" size={15} color={colors.textPrimary} />
                    {unreadMessages > 0 && (
                      <View style={[badgeS.badge, { borderColor: colors.surface }]}>
                        <Text style={badgeS.badgeText}>{unreadMessages > 99 ? '99+' : unreadMessages}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={openMenu}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MCIcon name="view-grid-outline" size={15} color={colors.textPrimary} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>


        {/* ── Onglets (pills) : Mes amis (filtre du fil) · Favoris · Direct ─── */}
        {!searchOpen && (
          <View style={s.headerPills}>
            {/* Mes amis — bascule le filtre du fil (Général ↔ Suivis). Pas de
                chevron : c'est un filtre, pas une navigation. */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleToggleFriends}
              style={[
                s.headerPill,
                { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider },
                filter === 'following' && { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
              ]}
            >
              <Icon
                name="users"
                size={11}
                color={filter === 'following' ? colors.primary : colors.textSecondary}
              />
              <Text style={[
                s.headerPillText,
                { color: filter === 'following' ? colors.primary : colors.textSecondary,
                  fontWeight: filter === 'following' ? '700' : '600' },
              ]}>
                {filter === 'following' ? 'Général' : 'Mes amis'}
              </Text>
            </TouchableOpacity>

            {/* Favoris — navigable : icône + libellé à gauche, chevron à droite */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => nav.navigate('Favorites')}
              style={[s.headerPillNav, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
            >
              <View style={s.headerPillNavInner}>
                <Icon name="heart" size={11} color={colors.textSecondary} />
                <Text style={[s.headerPillText, { color: colors.textSecondary }]}>Favoris</Text>
              </View>
              <Icon name="chevron-right" size={11} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Direct — même fonction que l'ancien bouton "En direct" : ouvre
                l'écran de diffusion en direct (GoLive). Seul le design change. */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => nav.navigate('GoLive')}
              style={[s.headerPillNav, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
            >
              <View style={s.headerPillNavInner}>
                <View style={{ position: 'relative' }}>
                  <Icon name="send" size={11} color={colors.textSecondary} />
                  <View style={{
                    position: 'absolute', top: -1, right: -3,
                    width: 5, height: 5, borderRadius: 3,
                    backgroundColor: colors.liveTag,
                    borderWidth: 1, borderColor: colors.backgroundSecondary,
                  }} />
                </View>
                <Text style={[s.headerPillText, { color: colors.textSecondary }]}>Direct</Text>
              </View>
              <Icon name="chevron-right" size={11} color={colors.textTertiary} />
            </TouchableOpacity>
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
                      searchOverlay
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
                      searchOverlay
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
                  <GofolyxLoader color={colors.primary} />
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
                        searchOverlay
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
          extraData={settledAdSlots}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          scrollEnabled={feedScrollEnabled}
          onViewableItemsChanged={onFeedViewableChanged}
          viewabilityConfig={feedViewabilityConfig}
          onScroll={handleFeedScroll}
          onScrollBeginDrag={() => { userDraggingRef.current = true; }}
          onScrollEndDrag={() => { userDraggingRef.current = false; }}
          onMomentumScrollBegin={() => { userDraggingRef.current = true; }}
          onMomentumScrollEnd={() => { userDraggingRef.current = false; }}
          scrollEventThrottle={100}
          // NB : pas de maintainVisibleContentPosition ici. Testé, mais contre-
          // productif sur CE feed : les cartes ont des hauteurs très variables et
          // non déterministes (posts 0..N images, ExpandableText, rangées reels,
          // carrousels, pubs qui se redimensionnent au chargement) et il n'y a pas
          // de getItemLayout — RN ré-estime les hauteurs en permanence au scroll,
          // et maintainVisibleContentPosition "compense" chaque correction d'estimation
          // par un ajustement d'offset => saccades + retours en arrière au scroll.
          // La stabilité au retour de focus est traitée à la source : header de liste
          // à hauteur figée (voir FeedListHeader) + refresh silencieux qui ne
          // remplace jamais `items` s'il est déjà scrollé (voir load(), branche silent).
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          updateCellsBatchingPeriod={50}
          // Gouttière entre cartes : la couleur du fond de liste transparaît via le
          // marginBottom de chaque carte (PostCard/FeedCard). Plus de bande dédiée.
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
                load(filter, false, true);
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
          maxToRenderPerBatch={3}
          windowSize={7}
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
  const authorName   = author?.display_name ?? author?.username ?? 'Gofolyx';
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
  // Hero calé sur la largeur intérieure de la carte flottante (écran − 2 marges
  // de carte − 2 paddings intérieurs), cohérent avec PostCard.
  const FC_INNER_W = SW - FeedCardLayout.marginHorizontal * 2 - FeedCardLayout.padH * 2;
  const BANNER_H = Math.round(FC_INNER_W * 0.82);

  return (
    <View style={getFeedCardStyle(colors)}>

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
            <Icon name="more-horizontal" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Titre + date/lieu — sorti de l'image, façon Facebook ─────────── */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={fc.titleWrap}>
        <Text style={[fc.heroTitle, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
        <View style={fc.heroMeta}>
          <Icon name="calendar" size={9} color={colors.textTertiary} />
          <Text style={[fc.heroMetaText, { color: colors.textSecondary }]}>{formatDate(date)}</Text>
          {city ? (
            <>
              <Text style={[fc.heroMetaDot, { color: colors.textTertiary }]}>·</Text>
              <Icon name="map-pin" size={9} color={colors.textTertiary} />
              <Text style={[fc.heroMetaText, { color: colors.textSecondary }]} numberOfLines={1}>{city}</Text>
            </>
          ) : null}
        </View>
        {/* Badges — type, gratuit/prix — petits, sous le titre plutôt que sur l'image */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <View style={[fc.chipBadge, { backgroundColor: accent + '15' }]}>
            <Icon name={cardIcon} size={7} color={accent} />
            <Text style={[fc.typeBadgeText, { color: accent }]}>{typeLabel}</Text>
          </View>
          {isLive && (
            <View style={[fc.chipBadge, { backgroundColor: colors.liveTag + '22' }]}>
              <View style={[fc.liveDot, { backgroundColor: colors.liveTag }]} />
              <Text style={[fc.chipBadgeText, { color: colors.liveTag }]}>LIVE</Text>
            </View>
          )}
          {isFree && (
            <View style={[fc.chipBadge, { backgroundColor: colors.success + '22' }]}>
              <Text style={[fc.chipBadgeText, { color: colors.success }]}>GRATUIT</Text>
            </View>
          )}
          {!isFree && price != null && price > 0 && (
            <View style={[fc.chipBadge, { backgroundColor: colors.backgroundSecondary }]}>
              <Icon name="tag" size={7} color={colors.textSecondary} />
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

      {/* ── Media — encadré dans la carte, coins arrondis (radius média = 12) ─ */}
      <View style={fc.mediaWrap}>
        <View style={[fc.mediaClip, videoUrl ? null : { height: BANNER_H }]}>
          {videoUrl ? (
            <InlineVideoPlayer
              uri={videoUrl}
              thumbnailUri={thumbUrl}
              aspectRatio={FC_INNER_W / BANNER_H}
              borderRadius={FeedRadius.media}
              fixedHeight={BANNER_H}
              resizeMode="cover"
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
                  <Icon name={cardIcon} size={48} color="rgba(255,255,255,0.18)" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Compteurs — amis qui ont aimé + nb commentaires + partages. Seul
          endroit chiffré (la barre d'actions dessous n'a que des icônes). ── */}
      {(likeCount > 0 || (!commentsDisabled && commentCount > 0) || shareCount > 0) && (
        <View style={[fc.countsRow, { borderBottomColor: colors.divider }]}>
          {likeCount > 0 ? (
            <View style={{ flex: 1, minWidth: 0 }}>
              <FriendsWhoLiked
                entityType={isEvent ? 'event' : 'concert'}
                entityId={item.id}
                totalLikes={likeCount}
                onPressLikers={() => setLikersOpen(true)}
              />
            </View>
          ) : <View style={{ flex: 1, minWidth: 0 }} />}
          {!commentsDisabled && commentCount > 0 && (
            <TouchableOpacity onPress={() => onComment((d: number) => setCommentCount((v: number) => v + d), (n: number) => setCommentCount((v: number) => Math.max(v, n)))} style={fc.countChip}>
              <View style={[fc.commentIcon, { backgroundColor: colors.primary }]}><MCIcon name="comment-outline" size={9} color="#fff" /></View>
              <Text style={[fc.countText, { color: colors.textTertiary }]}>{fmtN(commentCount)}</Text>
            </TouchableOpacity>
          )}
          {shareCount > 0 && (
            <View style={[fc.countChip, { marginLeft: commentCount > 0 ? 12 : ('auto' as any) }]}>
              <MCIcon name="share-outline" size={10} color={colors.textTertiary} />
              <Text style={[fc.countText, { color: colors.textTertiary }]}>{fmtN(shareCount)}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Barre d'actions — icônes seules 22px, like actif rouge. Les nombres
          restent dans countsRow (pas de double affichage). ──────────────── */}
      <View style={[fc.actionBar, { borderTopColor: colors.divider }]}>
        <TouchableOpacity style={fc.actionBtn} onPress={handleLike} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Animated.View style={heartStyle}>
            <MCIcon name={liked ? 'heart' : 'heart-outline'} size={FeedActionIcon.size} color={liked ? colors.likeActive : colors.textSecondary} />
          </Animated.View>
        </TouchableOpacity>

        {!commentsDisabled && (
          <TouchableOpacity style={fc.actionBtn} onPress={() => onComment((d: number) => setCommentCount((v: number) => v + d), (n: number) => setCommentCount((v: number) => Math.max(v, n)))} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <MCIcon name="comment-outline" size={FeedActionIcon.size} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={fc.actionBtn} onPress={handleShare} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <MCIcon name="share-outline" size={FeedActionIcon.size} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={[fc.actionBtn, fc.actionBtnSave]} onPress={handleSave} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Animated.View style={saveStyle}>
            <MCIcon name={saved ? 'bookmark' : 'bookmark-outline'} size={FeedActionIcon.size} color={saved ? colors.primary : colors.textSecondary} />
          </Animated.View>
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
// La carte elle-même vient de getFeedCardStyle(colors) — ici on ne garde que le
// contenu intérieur, avec le retrait uniforme FCPAD.
const FCPAD = FeedCardLayout.padH; // 12

const fc = StyleSheet.create({
  // Hero
  liveBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  liveDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  liveBadgeText:  { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  chipBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: FeedRadius.chip },
  chipBadgeText:  { fontSize: 9, fontWeight: '800' },
  typeBadgeText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  titleWrap:      { paddingHorizontal: FCPAD, paddingTop: 2, paddingBottom: 8 },
  heroTitle:      { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, lineHeight: 21, marginBottom: 4 },
  heroMeta:       { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  heroMetaText:   { fontSize: 12, fontWeight: '500' },
  heroMetaDot:    { fontSize: 11 },
  // Header auteur
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: FCPAD, paddingTop: FCPAD, paddingBottom: 8, gap: 8 },
  headerLeft:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  authorName:     { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
  timeAgo:        { fontSize: 11, fontWeight: '500', marginTop: 1 },
  followChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: FeedRadius.chip, borderWidth: 1 },
  // Description
  descWrap:       { paddingHorizontal: FCPAD, paddingBottom: 8 },
  desc:           { fontSize: 14, lineHeight: 21 },
  // Media — encadré, coins arrondis
  mediaWrap:      { paddingHorizontal: FCPAD, paddingBottom: 10 },
  mediaClip:      { borderRadius: FeedRadius.media, overflow: 'hidden', backgroundColor: '#0d0d1a' },
  // Compteurs
  countsRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: FCPAD, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  countChip:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countText:    { fontSize: 12, fontWeight: '500' },
  commentIcon:  { width: 18, height: 18, borderRadius: FeedRadius.full, alignItems: 'center', justifyContent: 'center' },
  // Actions — icônes seules, cible 44px
  actionBar:      { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: FCPAD - 4, paddingVertical: 2 },
  actionBtn:      { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionBtnSave:  { flex: 0, width: 44 },
});

const nbS = StyleSheet.create({
  // Carte flottante "douce" — même modèle que le reste du feed.
  wrap:     {
    paddingTop:       14,
    paddingBottom:    14,
    marginHorizontal: FeedCardLayout.marginHorizontal,
    marginBottom:     FeedCardLayout.gutter,
    borderRadius:     FeedCardLayout.radius,
    borderWidth:      FeedCardLayout.borderWidth,
    overflow:         'hidden',
  },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title:    { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  seeAll:   { fontSize: 13, fontWeight: '700' },
  list:     { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  card:     { borderRadius: FeedRadius.media, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  iconWrap: { width: 36, height: 36, borderRadius: FeedRadius.full, borderWidth: 3, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  cardBody: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, gap: 3 },
  name:     { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  handle:   { fontSize: 10, textAlign: 'center' },
  goBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, borderRadius: FeedRadius.chip, paddingVertical: 9, width: '100%' },
  goBtnText:{ fontSize: 13, fontWeight: '700', color: '#fff' },
});

