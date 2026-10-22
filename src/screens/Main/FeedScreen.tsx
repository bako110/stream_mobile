/**
 * FeedScreen — fil social : événements + concerts
 * Features: like animé, commentaires, partage natif, sauvegarde locale
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, StyleSheet,
  Share, KeyboardAvoidingView, Platform, Image, StatusBar,
  Modal, Dimensions, Linking, InteractionManager,
  TouchableWithoutFeedback, AppState,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withSequence, withTiming, withRepeat,
  interpolate, FadeInRight,
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
import { useUserCountry, normalizeCountryName } from '../../hooks/useUserCountry';
import { storage } from '../../utils/storage';
import { showConfirm } from '../../services';
import { confirmService } from '../../services/confirmService';
import { SkeletonBox, SkeletonFeed, SkeletonFeedScreen, AvatarWithBadge, ReportModal, CommentsBottomSheet, PostCard, ExpandableText, LikersBottomSheet, FriendsWhoLiked, CachedImage, LiveThumbnailBackground, PriceWithLocal, PeopleSuggestions } from '../../components/common';
import { cacheImage } from '../../services/imageCacheService';
import { AdCard, AdFullscreenPlayer, adIsPhone, type AdData } from '../../components/ads';
import { BoostPromptBottomSheet, type BoostSuggestion } from '../../components/ads/BoostPromptBottomSheet';
import { StartScreenSurveySheet } from '../../components/common/StartScreenSurveySheet';
import { startScreenSurveyService } from '../../services/startScreenSurveyService';
import { getAppPreferences, setCachedAppPreferences, type StartScreen } from '../../hooks/useAppPreferences';
import { boostPromptService } from '../../services/boostPromptService';
import { openPhoneMenu } from '../../utils/phoneMenu';
import { InlineVideoPlayer } from '../../components/common/InlineVideoPlayer';
import { ShareBottomSheet } from '../../components/common/ShareBottomSheet';
import { RepostBottomSheet } from '../../components/common/RepostBottomSheet';
import type { UserPublic } from '../../types/user';
import { StoryBar } from '../../components/story';
import { eventService, concertService, socialService, authService, searchService, userService, reelService, feedPreferenceService, accountsService, toastService } from '../../services';
import type { StoredAccount } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { favoriteService } from '../../services/favoriteService';
import { saveService } from '../../services/saveService';
import { liveService } from '../../services/liveService';
import type { LiveStream } from '../../services/liveService';
import { communityService, type CommunityData } from '../../services/communityService';
import { useWs } from '../../context/WebSocketContext';
import { useUser } from '../../context/UserContext';
import { useSearchOverlayActions } from '../../context/SearchOverlayContext';
import { networkService } from '../../services/networkService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import type { User } from '../../types/user';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Post } from '../../types/post';
import type { AppColors } from '../../theme/colors';
import { FontSize, FontWeight } from '../../theme';
import { Spacing } from '../../theme/spacing';
import { SectionHeader } from '../../components/common/SectionHeader';
import { FeedCarousel, FeedCardLayout, FeedRadius, FeedActionIcon, getFeedCardStyle } from '../../theme/feed';
import { feedStyles as s } from '../../styles/FeedScreen.styles';
import { TAB_BAR_HEIGHT } from '../../styles';
import { FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2 } from '../Create/ReelEditorScreen';
import type { FilterKey } from '../Create/ReelEditorScreen';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ── Types locaux ──────────────────────────────────────────────────────────────

type FeedFilter = 'all' | 'following' | 'live';

interface FeedItem {
  kind:    'event' | 'concert' | 'reel' | 'reels' | 'post' | 'suggestions' | 'communities' | 'ad';
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

// Carrousel "Près de chez toi" — events ET concerts mélangés (2026-10, demande
// explicite), triés ensemble par date de DÉBUT ("starts_at" pour un event,
// "scheduled_at" pour un concert — champs différents, source unifiée ici).
export type NearbyItem =
  | { kind: 'event';   data: Event }
  | { kind: 'concert'; data: Concert };

function nearbyItemStartDate(item: NearbyItem): string | null {
  return item.kind === 'event' ? item.data.starts_at : item.data.scheduled_at;
}

// Trie par date de début croissante — un item sans date valide est relégué
// en fin de liste plutôt que de perturber le tri (Date invalide → NaN,
// toujours trié après un nombre fini via Infinity).
function sortByStartDate(items: NearbyItem[]): NearbyItem[] {
  const time = (item: NearbyItem) => {
    const raw = nearbyItemStartDate(item);
    const t = raw ? new Date(raw).getTime() : NaN;
    return isNaN(t) ? Infinity : t;
  };
  return [...items].sort((a, b) => time(a) - time(b));
}

// ── Styles badges (déclarés ici pour être disponibles avant FeedHeaderBadges) ─
// Agrandi (14→18px, bordure/texte suivent) : à la taille précédente, le badge
// se distinguait à peine de l'icône à côté (19px) — trop petit pour un compteur
// que l'utilisateur doit repérer au premier coup d'œil dans le header.
const badgeS = StyleSheet.create({
  badge: {
    position: 'absolute', top: -6, right: -8,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#7B3FF2',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  badgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.extraBold },
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
          : <View style={{ width: FeedCarousel.cardW, height: FeedCarousel.cardH, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2A38' }}><Icon name="radio" size={28} color="#fff" /></View>
        }
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 64 }} />
        <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0365A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' }} />
          <Text style={{ color: '#fff', fontSize: FontSize['2xs'], fontWeight: FontWeight.extraBold }}>LIVE</Text>
        </View>
        <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
          <Icon name="eye" size={10} color="#fff" />
          <Text style={{ color: '#fff', fontSize: FontSize['2xs'], fontWeight: FontWeight.bold }}>{c.current_viewers ?? 0}</Text>
        </View>
        <View style={{ position: 'absolute', bottom: 6, left: 6, right: 6 }}>
          <Text style={{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold }} numberOfLines={1}>{c.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {artist?.avatar_url
              ? <CachedImage uri={artist.avatar_url} style={{ width: 14, height: 14, borderRadius: 7 }} />
              : <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 7, fontWeight: FontWeight.extraBold }}>{initial}</Text></View>
            }
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold }} numberOfLines={1}>{artistName}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── FeedListHeader — mémoïsé, ne re-rend que quand liveConcerts/spontLives changent.
// nearbyEvents n'est plus géré ici (voir NearbyEventsCarousel, extrait et
// positionné séparément plus haut dans feedListHeader, 2026-10).

interface FeedListHeaderProps {
  liveConcerts:  Concert[];
  spontLives:    LiveStream[];
  colors:        AppColors;
  isDark:        boolean;
  currentUserId?: string;
  onNavLiveList:        () => void;
  onNavSpontList:       () => void;
  onNavLiveStream:      (concertId: string) => void;
  onNavLiveViewer:      (concertId: string) => void;
  onNavSpontStream:     (liveId: string) => void;
  onNavSpontViewer:     (liveId: string) => void;
}

const FeedListHeader: React.FC<FeedListHeaderProps> = React.memo(({
  liveConcerts, spontLives, colors, isDark,
  currentUserId,
  onNavLiveList, onNavSpontList,
  onNavLiveStream, onNavLiveViewer,
  onNavSpontStream, onNavSpontViewer,
}) => {
  const liveTotal = liveConcerts.length + spontLives.length;
  if (!liveTotal) return null;
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
                      <Text style={{ color: '#fff', fontSize: FontSize['2xs'], fontWeight: FontWeight.extraBold }}>LIVE</Text>
                    </View>

                    {/* Badge privé */}
                    {live.is_private && (
                      <View style={{ position: 'absolute', top: 22, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                        <MCIcon name="lock" size={8} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 8, fontWeight: FontWeight.bold }}>Abonnés</Text>
                      </View>
                    )}

                    {/* Viewers */}
                    <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Icon name="eye" size={9} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: FontSize['2xs'], fontWeight: FontWeight.bold }}>{live.current_viewers ?? 0}</Text>
                    </View>

                    {/* Avatar centré */}
                    {live.user?.avatar_url
                      ? <CachedImage uri={live.user.avatar_url} style={{ position: 'absolute', bottom: 22, alignSelf: 'center', width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff' }} />
                      : <View style={{ position: 'absolute', bottom: 22, alignSelf: 'center', width: 34, height: 34, borderRadius: 17, backgroundColor: colors.liveTag, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                          <Text style={{ color: '#fff', fontSize: FontSize.smPlus, fontWeight: FontWeight.extraBold }}>{liveInitial}</Text>
                        </View>
                    }
                    <View style={{ position: 'absolute', bottom: 6, left: 4, right: 4, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, textAlign: 'center' }} numberOfLines={1}>{liveName}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

    </View>
  );
});

// ── NearbyEventsCarousel — événements ET concerts proches / dans ton pays,
// tout en haut du feed (avant la bannière communautés/stories, 2026-10 :
// extrait de FeedListHeader pour pouvoir être positionné séparément plus
// haut, demande explicite — puis étendu aux concerts, même demande).
// Distingue visuellement "vraiment proche" (distance_km fourni par le
// backend pour le rayon serré) de "ailleurs dans ton pays" (repli élargi,
// voir le useEffect qui charge nearbyItems dans FeedScreen) via un badge
// dédié, comparaison tolérante par normalizeCountryName (venue_country est
// un texte libre saisi par l'organisateur, jamais un code ISO). Design
// carte pleine image (dégradé bas pour la lisibilité du texte directement
// sur la photo, façon story/découverte) + entrée en cascade (FadeInRight,
// délai croissant par position) au montage.
interface NearbyEventsCarouselProps {
  items: NearbyItem[];
  userCountry: string | null;
  colors: AppColors;
  onSeeAll: () => void;
  onPress: (item: NearbyItem) => void;
}

// Champs communs Event/Concert normalisés en un seul accès — title/
// thumbnail_url/venue_city/venue_country sont nommés identiquement dans les
// deux types, seule la date de début diffère (starts_at vs scheduled_at,
// cf. nearbyItemStartDate) et l'icône de type n'existe que côté Event.
function nearbyItemIcon(item: NearbyItem): string {
  return item.kind === 'concert' ? 'music' : (EVENT_ICONS[item.data.event_type ?? 'other'] ?? 'calendar');
}

const NearbyEventsCarousel: React.FC<NearbyEventsCarouselProps> = React.memo(({
  items, userCountry, colors, onSeeAll, onPress,
}) => {
  if (items.length === 0) return null;
  const normalizedUserCountry = normalizeCountryName(userCountry);
  // Format paysage — large plutôt que haut (2026-10, ajustement demandé).
  const NCARD_W  = Dimensions.get('window').width * 0.72;
  const NCARD_H  = NCARD_W * 0.58;

  return (
    <View style={nb2.wrap}>
      <View style={nb2.headerRow}>
        <View style={[nb2.headerIconWrap, { backgroundColor: colors.primary + '18' }]}>
          <Icon name="map-pin" size={14} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[nb2.headerTitle, { color: colors.textPrimary }]}>Près de chez toi</Text>
          <Text style={[nb2.headerSubtitle, { color: colors.textTertiary }]}>
            En ce moment, près de toi et dans ton pays
          </Text>
        </View>
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={nb2.seeAllBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[nb2.seeAllTxt, { color: colors.primary }]}>Tout voir</Text>
          <Icon name="chevron-right" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={nb2.list} decelerationRate="fast" snapToInterval={NCARD_W + 12} snapToAlignment="start">
        {items.map((item, idx) => {
          const d = item.data;
          const dist = (d as any).distance_km as number | null | undefined;
          const distLabel = dist != null ? (dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`) : null;
          // "Dans ton pays" affiché seulement quand ce n'est PAS déjà une
          // distance proche (le badge distance prime, il est plus précis) —
          // sinon pour tout item au-delà du rayon serré dont le pays
          // correspond au pays détecté par GPS.
          const inUserCountry = !distLabel && !!normalizedUserCountry
            && normalizeCountryName(d.venue_country) === normalizedUserCountry;
          const typeIcon = nearbyItemIcon(item);
          const startRaw = nearbyItemStartDate(item);
          const dateLabel = startRaw && !isNaN(new Date(startRaw).getTime())
            ? new Date(startRaw).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
            : null;

          return (
            <Animated.View
              key={`${item.kind}-${d.id}`}
              // "Ultra bounce" (2026-10, demande explicite) : distance de départ
              // plus grande (FadeInRight démarre par défaut à ~25% de la largeur
              // de l'écran, insuffisant pour un vrai effet de rebond visible sur
              // une carte déjà large) + ressort très sous-amorti (damping bas,
              // stiffness haute) pour un rebond net et dynamique à l'arrivée,
              // au lieu d'un ralenti sans à-coup.
              entering={FadeInRight.delay(Math.min(idx, 6) * 90).duration(500).springify().damping(9).stiffness(160).mass(0.7)}
            >
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => onPress(item)}
                style={[nb2.card, { width: NCARD_W, height: NCARD_H, shadowColor: colors.primary }]}
              >
                {d.thumbnail_url ? (
                  <CachedImage uri={d.thumbnail_url} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <LinearGradient
                    colors={[colors.primary, colors.primary + 'AA']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
                  >
                    <Icon name={typeIcon} size={34} color="rgba(255,255,255,0.55)" />
                  </LinearGradient>
                )}

                {/* Dégradé bas — garantit la lisibilité du texte quel que soit le fond */}
                <LinearGradient
                  colors={['transparent', 'transparent', 'rgba(0,0,0,0.88)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                {/* Badge type — haut gauche, pastille translucide */}
                <View style={[nb2.typeBadge, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Icon name={typeIcon} size={12} color="#fff" />
                </View>

                {/* Badge distance / pays — haut droite */}
                {distLabel ? (
                  <View style={[nb2.pillBadge, { backgroundColor: colors.primary }]}>
                    <Icon name="navigation" size={9} color="#fff" />
                    <Text style={nb2.pillBadgeTxt}>{distLabel}</Text>
                  </View>
                ) : inUserCountry ? (
                  <View style={[nb2.pillBadge, nb2.pillBadgeCountry]}>
                    <Icon name="flag" size={9} color="#fff" />
                    <Text style={nb2.pillBadgeTxt}>Dans ton pays</Text>
                  </View>
                ) : null}

                {/* Texte — directement sur l'image, au-dessus du dégradé */}
                <View style={nb2.cardFooter}>
                  {dateLabel && (
                    <View style={nb2.dateChip}>
                      <Text style={nb2.dateChipTxt}>{dateLabel.toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={nb2.cardTitle} numberOfLines={1}>{d.title}</Text>
                  {d.venue_city ? (
                    <View style={nb2.cardLocRow}>
                      <Icon name="map-pin" size={10} color="rgba(255,255,255,0.75)" />
                      <Text style={nb2.cardLoc} numberOfLines={1}>{d.venue_city}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
});

// ── Reels suggérés : chaque reel de l'encart backend (kind='reels') est
// éclaté en item individuel kind='reel', inséré dans le flux — un seul reel
// plein cadre rencontré au fil du scroll vertical normal, pas un bloc groupé
// avec son propre scroll horizontal (2026-10, demande explicite : "je
// scrolle je vois un reel, je continue je vois ainsi de suite", pas de
// carrousel forcé). Rendu par renderItem (kind === 'reel').
const MIN_REEL_GAP = 4;

// Le backend renvoie les 3 reels d'un même encart groupés à une seule
// position dans la page — les éclater en 3 items 'reel' sans rien d'autre
// les laisserait adjacents les uns aux autres dans le flux final (3 reels
// à la suite), ce qui reproduit visuellement le même problème que le bloc
// groupé qu'on vient de retirer. Cette fonction les redistribue après coup :
// chaque reel garde sa position d'origine SAUF s'il se trouve à moins de
// MIN_REEL_GAP positions d'un reel déjà placé, auquel cas il est repoussé
// juste après le prochain item non-reel disponible.
function spreadOutReels(arr: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  let pendingReels: FeedItem[] = [];
  let sinceLastReel = Infinity;

  const flushOnePendingIfPossible = () => {
    if (pendingReels.length && sinceLastReel >= MIN_REEL_GAP) {
      out.push(pendingReels.shift()!);
      sinceLastReel = 0;
    }
  };

  for (const item of arr) {
    if (item.kind === 'reel') {
      pendingReels.push(item);
      continue;
    }
    flushOnePendingIfPossible();
    out.push(item);
    sinceLastReel += 1;
  }
  // Fin de page : écoule les reels restants même sans contenu normal après
  // eux pour les espacer (mieux que de les perdre), au pire adjacents entre
  // eux seulement s'il ne reste vraiment plus rien d'autre à intercaler.
  while (pendingReels.length) {
    flushOnePendingIfPossible();
    if (pendingReels.length) { out.push(pendingReels.shift()!); sinceLastReel = 0; }
  }
  return out;
}

const formatTileCount = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
};

const ReelSuggestionTile: React.FC<{
  reel: any;
  width: number;
  height: number;
  large?: boolean;
  onPress: () => void;
  // Lecture auto (2026-10, paramètre "Lecture automatique" dans Réglages >
  // Contenu) : isActive = ce reel est visible à l'écran EN CE MOMENT (porté
  // par onFeedViewableChanged, même mécanisme déjà en place pour les pubs
  // vidéo du feed) ET autoplayEnabled = l'utilisateur n'a pas désactivé la
  // fonctionnalité. Les deux conditions sont nécessaires : jamais plus d'une
  // vidéo ne joue à la fois dans le feed (une seule tuile peut être isActive),
  // et jamais de lecture du tout si l'utilisateur a coupé le réglage.
  isActive?: boolean;
  autoplayEnabled?: boolean;
}> = ({ reel, width, height, large, onPress, isActive = false, autoplayEnabled = false }) => {
  const author = reel.author;
  const name   = author?.display_name ?? author?.username ?? 'Utilisateur';
  const durationLabel = reel.duration_sec
    ? `${Math.floor(reel.duration_sec / 60)}:${String(Math.round(reel.duration_sec % 60)).padStart(2, '0')}`
    : null;

  // mp4_url préféré (décodage direct, pas de manifeste à résoudre) — hls_url
  // gardé en repli pour les reels plus anciens qui n'ont que ce format (voir
  // la migration progressive HLS→MP4, encore en cours côté anciens APK).
  const videoUri = reel.mp4_url || reel.hls_url || '';
  const hasVideo = !!videoUri;
  const shouldPlay = autoplayEnabled && isActive && hasVideo;

  // 'about:blank' quand aucune URL exploitable — même convention que
  // ReelsScreen (videoSource) : useVideoPlayer n'accepte pas une source null,
  // et on ne veut de toute façon jamais initialiser un vrai lecteur tant que
  // le reel n'a ni mp4_url ni hls_url.
  const player = useVideoPlayer(
    { uri: hasVideo ? videoUri : 'about:blank' },
    p => { p.loop = true; p.muted = true; p.volume = 0; },
  );
  useEffect(() => {
    if (!player || !hasVideo) return;
    try { if (shouldPlay) player.play(); else player.pause(); } catch {}
  }, [shouldPlay, player, hasVideo]);

  // Pulsation continue du bouton play — anneau extérieur qui respire
  // (scale + fade) pour signaler "appuie ici" sans être une icône statique.
  // Inutile/masquée une fois la vidéo effectivement en lecture (voir plus
  // bas, le bouton play ne s'affiche plus dans ce cas).
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
  }, [pulse]);
  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.35]) }],
    opacity: interpolate(pulse.value, [0, 0.6, 1], [0.5, 0.18, 0]),
  }));
  const pulseCoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 0.5, 1], [1, 1.06, 1]) }],
  }));

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={{ width, height, borderRadius: large ? 20 : 16, overflow: 'hidden', backgroundColor: '#0B0B0F' }}>
      {shouldPlay && player ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : reel.thumbnail_url ? (
        <Image source={{ uri: reel.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17171D' }}>
          <Icon name="film" size={large ? 36 : 24} color="rgba(255,255,255,0.18)" />
        </View>
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'transparent', 'transparent', 'rgba(0,0,0,0.82)']}
        locations={[0, 0.25, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Bouton play centré — anneau qui pulse en boucle pour signaler "appuie ici".
          Masqué une fois la vidéo réellement en lecture (shouldPlay) : il n'y a
          plus rien à signaler, la tuile joue déjà d'elle-même. */}
      {!shouldPlay && (
        <View style={rst.playCenter} pointerEvents="none">
          <Animated.View style={[rst.playCenterPulseRing, pulseRingStyle]} />
          <Animated.View style={[rst.playCenterRing, pulseCoreStyle]}>
            <View style={rst.playCenterCircle}>
              <Icon name="play" size={large ? 26 : 18} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </Animated.View>
        </View>
      )}

      {/* Badge Reel + durée */}
      <View style={rst.topRow} pointerEvents="none">
        <View style={rst.reelBadge}>
          <Icon name="play" size={large ? 10 : 8} color="#fff" />
          <Text style={[rst.reelBadgeText, !large && { fontSize: FontSize['2xs'] }]}>Reel</Text>
        </View>
        {durationLabel && (
          <View style={rst.durationBadge}>
            <Text style={[rst.durationBadgeText, !large && { fontSize: FontSize['2xs'] }]}>{durationLabel}</Text>
          </View>
        )}
      </View>

      {/* Colonne actions — droite (grande carte uniquement, comme la référence) */}
      {large && (
        <View style={rst.actionsCol} pointerEvents="none">
          <View style={rst.actionItem}>
            <View style={rst.actionCircle}><MCIcon name="heart" size={19} color="#fff" /></View>
            <Text style={rst.actionTxt}>{formatTileCount(reel.like_count ?? 0)}</Text>
          </View>
          <View style={rst.actionItem}>
            <View style={rst.actionCircle}><Icon name="message-circle" size={17} color="#fff" /></View>
            <Text style={rst.actionTxt}>{formatTileCount(reel.comment_count ?? 0)}</Text>
          </View>
          <View style={rst.actionItem}>
            <View style={rst.actionCircle}><Icon name="share" size={16} color="#fff" /></View>
          </View>
        </View>
      )}

      {/* Bas : auteur + légende/musique (grande) ou pseudo + likes compacts (petite) */}
      <View style={[rst.bottomOverlay, large && { right: 60 }]} pointerEvents="none">
        <View style={rst.authorRow}>
          {author?.avatar_url ? (
            <CachedImage uri={author.avatar_url} style={[rst.avatar, { width: large ? 26 : 20, height: large ? 26 : 20, borderRadius: large ? 13 : 10 }]} />
          ) : (
            <View style={[rst.avatar, { width: large ? 26 : 20, height: large ? 26 : 20, borderRadius: large ? 13 : 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontWeight: FontWeight.extraBold, fontSize: FontSize['2xs'] }}>{name[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
          <Text numberOfLines={1} style={[rst.authorName, !large && { fontSize: FontSize.xs }]}>
            {large ? name : `@${author?.username ?? name}`}
          </Text>
          {large && author?.is_verified && (
            <View style={rst.verifiedBadge}><Icon name="check" size={7} color="#fff" /></View>
          )}
        </View>
        {large && reel.caption ? (
          <Text numberOfLines={1} style={rst.caption}>{reel.caption}</Text>
        ) : null}
        {large ? (
          <View style={rst.musicRow}>
            <Icon name="music" size={10} color="rgba(255,255,255,0.8)" />
            <Text numberOfLines={1} style={rst.musicTxt}>{reel.music_name || 'Son original'}</Text>
          </View>
        ) : (
          <View style={rst.compactStatsRow}>
            <MCIcon name="heart" size={11} color="#fff" />
            <Text style={rst.compactStatsTxt}>{formatTileCount(reel.like_count ?? 0)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const rst = StyleSheet.create({
  playCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playCenterPulseRing: {
    position: 'absolute',
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  playCenterRing: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  playCenterCircle: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  topRow: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reelBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20 },
  reelBadgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.extraBold, letterSpacing: 0.3 },
  durationBadge:     { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20 },
  durationBadgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  actionsCol: { position: 'absolute', right: 10, bottom: 14, alignItems: 'center', gap: 14 },
  actionItem: { alignItems: 'center', gap: 3 },
  actionCircle: { alignItems: 'center', justifyContent: 'center' },
  actionTxt:  { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, gap: 3 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar:    { overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' },
  authorName: { color: '#fff', fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, flexShrink: 1 },
  verifiedBadge: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center' },
  caption: { color: 'rgba(255,255,255,0.92)', fontSize: FontSize.xs, marginTop: 1 },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  musicTxt: { color: 'rgba(255,255,255,0.78)', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, flexShrink: 1 },
  compactStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  compactStatsTxt: { color: '#fff', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold },
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
                    : <Text style={{ color: '#fff', fontWeight: FontWeight.extraBold, fontSize: COMM_AVATAR_SZ * 0.4 }}>{initial}</Text>
                  }
                </View>
              </View>

              {/* Infos */}
              <View style={{ alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, paddingTop: 8, gap: 4 }}>
                <Text numberOfLines={1} style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.textPrimary, textAlign: 'center' }}>
                  {c.name}
                </Text>
                <Text style={{ fontSize: FontSize.xsPlus, color: colors.textTertiary }}>
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
                  <Text style={{ fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, color: isJoined ? colors.textSecondary : '#fff' }}>
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
  const { openSearchOverlay } = useSearchOverlayActions();
  // true (2026-10) — le carrousel "Près de toi / dans ton pays" tout en haut
  // du feed (voir feedListHeader) a besoin de la position dès l'arrivée sur
  // l'écran, pas seulement via une section secondaire visitée plus tard.
  // Avant ce fix, enabled=false signifiait que userLocation restait
  // TOUJOURS null sur cet écran (rien ne basculait jamais ce flag ici), donc
  // le carrousel ne se remplissait jamais en pratique.
  const userLocation = useUserLocation(true);
  const userCountry = useUserCountry(userLocation);
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
  // Pagination dédiée au filtre "Mes amis" — jusqu'ici figée à la seule page 1
  // (30 posts/events/concerts + 20 reels) sans jamais charger la suite au
  // scroll, contrairement au filtre "Général". Compteurs séparés : la page
  // suivante dépend de deux endpoints distincts (feed mixte + reels), chacun
  // avec son propre statut "encore du contenu ou pas".
  const followingFeedPageRef  = useRef(1);
  const followingReelPageRef  = useRef(1);
  const followingFeedHasMoreRef = useRef(true);
  const followingReelHasMoreRef = useRef(true);
  const followingSeenIdsRef   = useRef<Set<string>>(new Set());
  // Continuité de comptage entre page 1 (load) et pages suivantes (loadMoreFeed)
  // — sert à espacer la pub côté client.
  const nonReelCountRef  = useRef(0);
  const feedListRef     = useRef<FlatList>(null);
  const [liveConcerts,    setLiveConcerts]    = useState<Concert[]>([]);
  const [spontLives,      setSpontLives]      = useState<LiveStream[]>([]);
  const [nearbyItems,    setNearbyItems]    = useState<NearbyItem[]>([]);
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

  // ── File d'attente des sollicitations au démarrage ──────────────────────
  // Contacts, suggestion de boost et sondage écran de démarrage se
  // déclenchaient chacun indépendamment (useEffect/useFocusEffect séparés,
  // délais non coordonnés) — résultat : plusieurs popups pouvaient apparaître
  // en même temps ou se chevaucher au lancement de l'app. Cette file garantit
  // qu'une seule sollicitation est affichée à la fois, dans un ordre fixe.
  // Chaque appelant "réserve son tour" avec requestOverlaySlot(name) et ne
  // montre son UI que quand overlayQueueRef.current[0] === name ; il doit
  // ensuite appeler releaseOverlaySlot(name) à sa fermeture pour laisser
  // passer le suivant.
  const OVERLAY_ORDER = ['contacts', 'boost', 'startScreenSurvey'] as const;
  type OverlayName = typeof OVERLAY_ORDER[number];
  const overlayQueueRef = useRef<Set<OverlayName>>(new Set());
  const [activeOverlay, setActiveOverlay] = useState<OverlayName | null>(null);

  const recomputeActiveOverlay = useCallback(() => {
    const next = OVERLAY_ORDER.find(name => overlayQueueRef.current.has(name)) ?? null;
    setActiveOverlay(next);
  }, []);

  const requestOverlaySlot = useCallback((name: OverlayName) => {
    overlayQueueRef.current.add(name);
    recomputeActiveOverlay();
  }, [recomputeActiveOverlay]);

  const releaseOverlaySlot = useCallback((name: OverlayName) => {
    overlayQueueRef.current.delete(name);
    recomputeActiveOverlay();
  }, [recomputeActiveOverlay]);

  // ── Bottom sheet "Booster" ──────────────────────────────────────────────
  // Incite à utiliser le système de Boost GoGold existant (pas une pub payante
  // tierce) sur la meilleure opportunité du compte — même moteur de suggestion
  // que l'onglet "Pour toi" de BoostScreen (GET /wallet/boosts/suggestions).
  // Déclenché après une publication (au focus) et périodiquement pendant le
  // scroll. Jamais plus d'une fois par session, et jamais pour un contenu déjà
  // rabattu (boostPromptService) ou déjà couvert par un boost actif (filtré
  // côté service par cible).
  const [boostSuggestion, setBoostSuggestion] = useState<BoostSuggestion | null>(null);
  const boostCheckInFlightRef = useRef(false);
  const boostScrollAccumRef   = useRef(0);

  const maybeShowBoostPrompt = useCallback(async () => {
    if (boostPromptService.hasShownThisSession() || boostCheckInFlightRef.current) return;
    boostCheckInFlightRef.current = true;
    try {
      const res = await apiClient.get<{ suggestions: BoostSuggestion[] }>(Endpoints.wallet.boostSuggestions);
      // Marqué "vérifié pour cette session" dès que l'appel a répondu, QUELLE QUE
      // SOIT sa réponse — sans ça, "aucune suggestion dispo" ou "déjà rabattue"
      // ne posait jamais ce marqueur, et l'appel se répétait à chaque focus/scroll
      // pour le reste de la session (vu dans les logs serveur : des dizaines
      // d'appels GET /wallet/boosts/suggestions au lieu d'un seul).
      boostPromptService.markShownThisSession();
      const suggestion = res.data?.suggestions?.[0];
      if (!suggestion) return;
      if (boostPromptService.wasDismissed(suggestion.target, suggestion.content_id)) return;
      setBoostSuggestion(suggestion);
      requestOverlaySlot('boost');
    } catch {
      // silencieux — pas de bottom sheet si l'appel échoue (on retentera à la
      // prochaine session, l'échec n'est pas marqué comme "déjà vérifié")
    } finally {
      boostCheckInFlightRef.current = false;
    }
  }, [requestOverlaySlot]);

  // Après publication : au retour sur le feed avec un focus, on vérifie une
  // fois s'il existe une suggestion pertinente (couvre le cas où l'upload en
  // arrière-plan d'un nouveau post/reel/event/concert vient de se terminer).
  useFocusEffect(useCallback(() => {
    maybeShowBoostPrompt();
  }, [maybeShowBoostPrompt]));

  // ── Sondage "Qu'est-ce qui t'amène sur Gofolyx ?" ──────────────────────────
  // Affiché au démarrage, pas plus d'une fois toutes les 48h (répondu ou
  // fermé sans répondre). Passe son tour dans la file si contacts/boost sont
  // déjà en attente ou affichés.
  useFocusEffect(useCallback(() => {
    if (!startScreenSurveyService.shouldShow()) return;
    startScreenSurveyService.markShown();
    requestOverlaySlot('startScreenSurvey');
  }, [requestOverlaySlot]));

  const handleStartScreenAnswer = useCallback(async (choice: StartScreen) => {
    const labels: Record<StartScreen, string> = { feed: 'Accueil', reels: 'Reels', communities: 'Communautés' };
    // Objet complet, jamais juste { preferred_start_screen } : le PUT
    // /app-preferences écrase TOUTES les colonnes avec ce qui est envoyé (cf.
    // update_app_preferences côté backend) — un envoi partiel réinitialiserait
    // silencieusement feed_autoplay_reels à sa valeur par défaut.
    const updated = { ...getAppPreferences(), preferred_start_screen: choice };
    setCachedAppPreferences(updated);
    // Laisse la coche de sélection visible un instant dans le sheet avant de
    // le refermer — une fermeture instantanée ne confirmait jamais le choix.
    setTimeout(() => releaseOverlaySlot('startScreenSurvey'), 450);
    toastService.success('Préférence enregistrée', `${labels[choice]} s'ouvrira au démarrage de l'app.`);
    try {
      await apiClient.put(Endpoints.users.appPreferences, updated);
    } catch {
      // le cache local garde la préférence même si la sync échoue
    }
  }, [releaseOverlaySlot]);

  const handleBoostPromptClose = useCallback(() => {
    releaseOverlaySlot('boost');
    if (boostSuggestion) {
      boostPromptService.markDismissed(boostSuggestion.target, boostSuggestion.content_id);
    }
  }, [boostSuggestion, releaseOverlaySlot]);

  const handleBoostPromptBoost = useCallback((suggestion: BoostSuggestion) => {
    releaseOverlaySlot('boost');
    nav.navigate('Boost', { autoSuggestion: suggestion });
  }, [nav, releaseOverlaySlot]);
  // Multi-compte — liste chargée à l'ouverture du panneau (pas au montage de l'écran,
  // pour toujours refléter les changements faits depuis les Paramètres).
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  // Reel actif dans le feed (autoplay) — le reel kind='reel' actuellement visible
  // à l'écran (porté par onFeedViewableChanged), ou null si aucun. Combiné à
  // autoplayEnabled (réglage utilisateur, Réglages > Contenu > "Lecture
  // automatique") dans ReelSuggestionTile : jamais plus d'une vidéo ne joue à la
  // fois, jamais de lecture du tout si le réglage est désactivé.
  const [activeReelId,      setActiveReelId]      = useState<string | null>(null);
  const [autoplayEnabled,   setAutoplayEnabled]    = useState(() => getAppPreferences().feed_autoplay_reels);
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
  // Lu par renderItem via ref (jamais settledAdSlots directement dans ses deps
  // useCallback) — sinon renderItem change de RÉFÉRENCE à chaque settle (toutes
  // les ~450ms tant qu'une pub est visible), et FlatList re-render TOUTES ses
  // cellules montées à chaque changement de référence de renderItem (pas que la
  // carte pub concernée) → clignotement/tremblement visible pendant le scroll.
  // extraData reste nécessaire pour déclencher la réconciliation (React.memo sur
  // AdCard filtre ensuite pour ne vraiment re-render que la cellule concernée).
  const settledAdSlotsRef = useRef(settledAdSlots);
  settledAdSlotsRef.current = settledAdSlots;
  const settleTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const clearSettleTimers = useCallback(() => {
    Object.values(settleTimersRef.current).forEach(clearTimeout);
    settleTimersRef.current = {};
  }, []);
  // Impression envoyée UNE SEULE FOIS par pub, dès qu'elle devient réellement
  // visible à l'écran (cf. onFeedViewableChanged) — jamais au montage du
  // composant AdCard, qui peut précéder la visibilité réelle dans une FlatList
  // virtualisée (même principe que ReelsScreen/AdSlide avec `isActive`).
  const firedAdImpressionsRef = useRef<Set<string>>(new Set());
  // Ref stable vers handleAdImpression (même raison que loadMoreFeedRef juste en
  // dessous) — synchronisée juste après sa définition.
  const handleAdImpressionRef = useRef<(adId: string) => void>(() => {});
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
  // Filtre "Mes amis" — deux sources paginées séparément (feed mixte + reels),
  // mêmes tailles de page que leur premier chargement (load('following')) pour
  // ne jamais désynchroniser le calcul de hasMore entre page 1 et les suivantes.
  const FOLLOWING_FEED_PAGE_SIZE = 30;
  const FOLLOWING_REEL_PAGE_SIZE = 20;

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
        return item.data?.thumbnail_url ? [item.data.thumbnail_url] : [];
      case 'reels':
        return (Array.isArray(item.data) ? item.data : [])
          .map((r: any) => r?.thumbnail_url)
          .filter((u: any): u is string => !!u);
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
  // Distance de scroll cumulée (px) avant de vérifier s'il faut proposer le
  // bottom sheet "Booste ta publication" — évite de le déclencher trop tôt.
  const BOOST_PROMPT_SCROLL_THRESHOLD = 3000;
  const feedAtTopRef = useRef(true);
  const [feedAtTop, setFeedAtTop] = useState(true);
  // Dernier instantané "En direct" reçu pendant qu'on lisait plus bas — appliqué
  // en différé quand on remonte au sommet (voir l'effect de resync du header).
  const pendingLiveHeaderRef = useRef<{ liveConcerts: Concert[]; spontLives: LiveStream[] } | null>(null);
  const lastScrollYRef = useRef(0);
  // Vrai tant que le doigt de l'utilisateur tient la liste (entre begin/end drag)
  // ou que la liste décélère après un fling — la restauration d'offset s'abstient.
  const userDraggingRef = useRef(false);
  // Bouton flottant "remonter + rafraîchir" — apparaît dès le tout début du
  // scroll (seuil bas, juste assez pour ignorer le léger rebond élastique en
  // haut de liste sur iOS) et reste affiché fixe tant qu'on n'est pas
  // remonté tout en haut, juste au-dessus de la tab bar (jamais dessus/
  // dessous). Au clic : remonte en haut de la liste ET relance un chargement
  // silencieux (load(filter, true, true), même pattern que le refresh au
  // retour de focus) pour repartir sur du contenu frais.
  const SCROLL_TOP_THRESHOLD = 40;
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopAnim = useSharedValue(0);
  // Déclaré ici, au niveau racine du composant (jamais dans le JSX conditionnel
  // {showScrollTop && (...)}) — useAnimatedStyle est un hook, l'appeler dans une
  // branche qui ne s'exécute que parfois casse la règle des hooks ("Rendered
  // more hooks than during the previous render") dès que showScrollTop change.
  const scrollTopStyle = useAnimatedStyle(() => ({
    opacity: scrollTopAnim.value,
    transform: [{ scale: interpolate(scrollTopAnim.value, [0, 1], [0.6, 1]) }],
  }));
  // Icône qui "s'envole" vers le haut en boucle — part d'en bas (translateY
  // positif, légèrement transparente), remonte franchement jusqu'en haut en
  // s'estompant, puis revient instantanément à sa position de départ pour
  // relancer le cycle. Contrairement à un simple va-et-vient symétrique, ce
  // sens unique (bas → haut, jamais l'inverse visible) rend la direction du
  // geste "remonter" immédiatement lisible.
  const scrollTopIconBounce = useSharedValue(0);
  useEffect(() => {
    scrollTopIconBounce.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: 650 }),
      ),
      -1,
      false,
    );
  }, [scrollTopIconBounce]);
  const scrollTopIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollTopIconBounce.value, [0, 0.7, 1], [1, 1, 0]),
    // Amplitude réduite et centrée sur 0 (±4px) — l'icône reste visuellement
    // au milieu du cercle du bouton tout au long de l'animation, au lieu de
    // sortir de son centre (l'ancien -10 à +4 n'était pas symétrique).
    transform: [{ translateY: interpolate(scrollTopIconBounce.value, [0, 1], [4, -4]) }],
  }));

  const setScrollTopVisible = useCallback((visible: boolean) => {
    setShowScrollTop(prev => {
      if (prev === visible) return prev;
      scrollTopAnim.value = withTiming(visible ? 1 : 0, { duration: 200 });
      return visible;
    });
  }, [scrollTopAnim]);

  const handleFeedScroll = (e: any) => {
    const offsetY = e.nativeEvent?.contentOffset?.y ?? 0;
    const delta = offsetY - lastScrollYRef.current;
    lastScrollYRef.current = offsetY;
    const atTop = offsetY < AT_TOP_THRESHOLD;
    if (atTop !== feedAtTopRef.current) {
      feedAtTopRef.current = atTop;
      setFeedAtTop(atTop);
    }
    setScrollTopVisible(offsetY > SCROLL_TOP_THRESHOLD);
    const approxIndex = Math.floor(offsetY / AVG_ITEM_HEIGHT);
    if (approxIndex > lastScrollPrefetchIndexRef.current) {
      lastScrollPrefetchIndexRef.current = approxIndex;
      InteractionManager.runAfterInteractions(() => prefetchUpcomingImages(approxIndex + 1));
    }
    // Déclenchement périodique du bottom sheet "Booste ta publication" —
    // après un certain volume de scroll vers le bas, une seule fois par session.
    if (delta > 0 && !boostPromptService.hasShownThisSession()) {
      boostScrollAccumRef.current += delta;
      if (boostScrollAccumRef.current > BOOST_PROMPT_SCROLL_THRESHOLD) {
        boostScrollAccumRef.current = 0;
        maybeShowBoostPrompt();
      }
    }
  };

  const onFeedViewableChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    // Reel actif (autoplay) : au plus UN reel du feed joue à la fois — celui
    // dont l'item kind='reel' est actuellement visible. S'il y en a
    // plusieurs visibles simultanément (rare, tuile très compacte sur un
    // grand écran), on ne garde que le premier rencontré ; aucun reel visible
    // → null, ce qui coupe la lecture (cf. ReelSuggestionTile, shouldPlay).
    const visibleReel = viewableItems.find(v => v.item?.kind === 'reel');
    setActiveReelId(visibleReel?.item?.id ?? null);

    // Pub vidéo : ne joue que quand réellement visible à l'écran (coupe le stream sinon)
    setAdVisible(viewableItems.some(v => v.item?.kind === 'ad'));

    // « settled » : un slot pub visible → on arme un timer ; s'il tient SETTLE_MS
    // sans que le slot ne quitte la zone visible (viewability se re-déclenche au
    // scroll), on marque le slot settled. Slots sortis de vue → timer annulé.
    const visibleAdSlots = new Set<string>(
      viewableItems.filter(v => v.item?.kind === 'ad').map(v => v.item.id as string),
    );

    // Impression — déclenchée ici (vraie visibilité), jamais au montage de
    // AdCard. item.id (slot) == ad.id (cf. InjectionPlanner côté serveur, l'id
    // de l'entrée est l'uuid brut de la campagne), donc utilisable directement.
    viewableItems.forEach(v => {
      if (v.item?.kind !== 'ad') return;
      const adId = v.item.id as string;
      if (firedAdImpressionsRef.current.has(adId)) return;
      firedAdImpressionsRef.current.add(adId);
      handleAdImpressionRef.current(adId);
    });

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
        // showConfirm est une alerte native immédiate (pas un composant React
        // contrôlable par `visible`) — on réserve donc son tour dans la file
        // et on attend que ce soit son créneau pour l'afficher réellement,
        // cf. l'effet sur activeOverlay ci-dessous.
        requestOverlaySlot('contacts');
      }

      // Localisation : même logique, permission déjà tranchée par ailleurs
      // dans l'app (écran "Près de toi") réutilisée sans redemander ici.
      const locationPerm = Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
      const locationStatus = await check(locationPerm);
      if (locationStatus === RESULTS.GRANTED) syncLocationForSuggestions();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Affiche réellement la demande de contacts quand c'est son tour dans la
  // file. Le slot est libéré via confirmService.subscribe (pas via les
  // onPress des boutons) car un tap sur l'overlay du modal ferme celui-ci
  // directement (confirmService.dismiss()) sans jamais appeler onPress —
  // s'appuyer seulement sur les callbacks de boutons aurait laissé le slot
  // bloqué indéfiniment dans ce cas, gelant toute la file derrière lui.
  useEffect(() => {
    if (activeOverlay !== 'contacts') return;
    storage.setBoolean(CONTACTS_PROMPT_SEEN_KEY, true);
    const contactsPerm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CONTACTS : PERMISSIONS.ANDROID.READ_CONTACTS;

    const unsubscribe = confirmService.subscribe(state => {
      if (state === null) {
        releaseOverlaySlot('contacts');
        unsubscribe();
      }
    });

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
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOverlay]);

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

  // Verrou réseau UNIQUE pour tout le feed (load + loadMoreFeed + loadMoreFollowing).
  // Avant ce verrou, chaque fonction avait sa propre garde locale (loadingInitialRef,
  // loadingMoreRef) et elles ne se protégeaient pas forcément l'une l'autre dans tous
  // les cas (ex: load('following') ne posait jamais loadingInitialRef à true, donc un
  // scroll rapide à l'arrivée sur l'onglet pouvait lancer loadMoreFollowing EN MÊME
  // TEMPS que le chargement initial — logs serveur confirmés : page=1 appelée deux
  // fois d'affilée, puis page=2/page=3 quasi simultanées). Règle maintenant appliquée
  // partout, sans exception : UN SEUL appel réseau de pagination du feed à la fois,
  // page N+1 ne part jamais avant que la page N ait fini d'écrire son résultat.
  const feedBusyRef = useRef(false);

  // Anti race-condition (2026-09) : plusieurs pull-to-refresh rapprochés lancent
  // chacun leur propre appel réseau (aucun AbortController/annulation ici), et
  // rien ne garantissait que les réponses reviennent dans l'ordre d'envoi — un
  // appel PLUS ANCIEN pouvait répondre APRÈS un appel plus récent et écraser son
  // résultat avec des données obsolètes. Symptôme remonté : "je dois tirer 3 fois
  // pour voir un changement" (le contenu affiché correspondait en fait à un
  // rafraîchissement précédent, pas au dernier déclenché). Chaque appel de
  // load('all', ...) prend un numéro de séquence ; seul le résultat du DERNIER
  // appel lancé est autorisé à écrire dans le state, les réponses en retard
  // d'un appel dépassé sont silencieusement ignorées.
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async (f: FeedFilter, silent = false, forceRefresh = false) => {
    // Verrou anti-collision ENTRE DEUX load() : si un load() tourne déjà (ex: focus
    // qui redéclenche pendant qu'un premier montage est encore en vol), on renonce
    // tout de suite plutôt que d'attendre (jamais de boucle d'attente ici — un appel
    // qui ne libère jamais le verrou figerait sinon tout futur load(), comme observé
    // une première fois avec une version à attente active de ce verrou). Les
    // rafraîchissements explicites sont rares et espacés : perdre l'un d'eux dans ce
    // cas de collision est sans conséquence, le prochain déclenchement reprendra.
    // NB : ce verrou ne concerne QUE load() vs load() — loadMoreFeed/loadMoreFollowing
    // ont leurs propres gardes (loadingInitialRef/loadingMoreRef) et ne le touchent
    // plus (les y faire participer bloquait la pagination : un scroll pendant un
    // refresh silencieux de focus perdait sa chance et plus rien ne la relançait).
    if (feedBusyRef.current) return;
    feedBusyRef.current = true;
    // Garde active pour 'all' ET 'following' : les deux ont un vrai scroll infini
    // (loadMoreFeed / loadMoreFollowing) qui doit attendre la fin de CE chargement
    // avant de pouvoir démarrer — sans ça, un scroll rapide dès l'arrivée sur
    // l'onglet pouvait lancer la pagination EN PARALLÈLE du chargement initial,
    // les deux écrivant dans `items`/les refs de pagination en même temps
    // (symptôme observé : le feed "charge au hasard" pendant qu'on scrolle).
    // 'live' n'a pas de pagination, inutile de le gérer ici.
    if (f === 'all' || f === 'following') loadingInitialRef.current = true;
    const requestId = f === 'all' ? ++loadRequestIdRef.current : loadRequestIdRef.current;
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
        // Un appel load('all', ...) plus RÉCENT a été lancé pendant cette requête
        // réseau (ex: 2e/3e pull-to-refresh avant que le 1er n'ait répondu) — cette
        // réponse est désormais obsolète, on l'ignore sans toucher au state (cf.
        // commentaire de loadRequestIdRef plus haut). Le `finally` plus bas gère
        // encore loading/refreshing pour CET appel, mais n'écrase plus le contenu.
        if (requestId !== loadRequestIdRef.current) return;
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
          } else if (d.kind === 'suggestions') {
            result.push({ kind: 'suggestions', id: d.id, data: d.users ?? [] });
          } else if (d.kind === 'communities') {
            result.push({ kind: 'communities', id: d.id, data: d.communities ?? [] });
          } else if (d.kind === 'reels') {
            // Éclaté en items 'reel' individuels — cf. spreadOutReels plus
            // bas, qui les redistribue pour qu'ils ne restent jamais groupés.
            for (const r of (d.reels ?? []) as any[]) {
              if (!r?.id) continue;
              result.push({ kind: 'reel', id: r.id, data: r });
            }
          }
        }
        // Filtrer les contenus masqués ("Pas intéressé") — après mapping, pour
        // ne s'appliquer qu'au contenu normal (pas aux encarts spéciaux).
        const filtered = feedPreferenceService.filterFeed(spreadOutReels(result));

        // Mémorise les clés composites (kind-id) chargées en page 1 pour dédupliquer
        // les pages suivantes du scroll infini (loadMoreFeed)
        seenItemIdsRef.current = new Set(filtered.map(i => `${i.kind}-${i.id}`));
        nonReelCountRef.current = nonSpecialCount;

        // En mode silent : ne remplacer les items QUE si le contenu a réellement
        // changé. Comparer uniquement les `id` ne suffit pas : les rangées
        // suggestions / communities gardent leur id mais leur `data`
        // (nb de reels, liste de suggestions…) change à chaque refetch — la carte
        // se re-render alors avec une hauteur différente et pousse tout ce qui est
        // en dessous. On compare donc une signature du contenu (id + longueur/ids
        // du data pour les rangées, updated_at pour posts/events) ; si identique,
        // on garde `prev` À L'IDENTIQUE (même référence → zéro re-render de cellule).
        if (silent) {
          // "ad" exclu de la signature par CONTENU : InjectionPlanner.refresh_ad_slots
          // (backend) retire une pub fraîche à chaque page servie, y compris sur un
          // simple refresh silencieux de focus — son `id` (= id de la campagne tirée)
          // change donc souvent d'un retour à l'autre même quand rien d'autre n'a
          // changé. Comme la signature globale est un seul `.join(',')`, ce changement
          // à lui seul invalidait TOUTE la comparaison et remplaçait `items` en entier
          // (nouvelle référence → re-render de toute la liste, pas juste la carte pub),
          // d'où le feed qui "recalcule"/bouge au retour. Le GABARIT d'une AdCard est
          // identique quel que soit le contenu de la pub (même hauteur), donc seule sa
          // PRÉSENCE à cette position compte pour la signature — jamais son id interne.
          const sig = (arr: FeedItem[]) => arr.map(i => {
            if (i.kind === 'ad') return 'ad';
            if (i.kind === 'suggestions' || i.kind === 'communities' || i.kind === 'reels') {
              const d = (i.data ?? []) as any[];
              return `${i.kind}:${i.id}:${d.map(x => x?.id ?? '').join('|')}`;
            }
            const u = (i.data as any)?.updated_at ?? (i.data as any)?.created_at ?? '';
            return `${i.kind}:${i.id}:${u}`;
          }).join(',');
          setItems(prev => {
            if (sig(prev) !== sig(filtered)) return filtered;
            // Structure identique (mêmes positions/types) — ne remplacer QUE les
            // entrées "ad" par leur version fraîche (nouveau contenu à afficher au
            // prochain scroll dessus), en gardant la RÉFÉRENCE de toutes les autres
            // entrées à l'identique (zéro re-render des cellules non-pub).
            return prev.map((p, idx) => (p.kind === 'ad' ? filtered[idx] : p));
          });
        } else {
          setItems(filtered);
        }
      } else if (f === 'following') {
        // "Mes amis" — posts + events/concerts + reels des comptes suivis UNIQUEMENT
        // (exclusion stricte côté backend via following_only, pas juste un boost de
        // score comme le fil principal). Pas d'injection pub/suggestions/communautés :
        // contenu pur des amis, sans bruit de découverte. Tri chronologique — un fil
        // "amis" doit rester lisible dans l'ordre des publications, pas mélangé.
        //
        // Pagination réinitialisée à chaque vrai chargement (pas en mode silent,
        // même garde que le filtre "all" juste au-dessus) — loadMoreFeed reprend
        // ensuite à partir de ces refs au scroll.
        if (!silent) {
          followingFeedPageRef.current = 1;
          followingReelPageRef.current = 1;
          followingFeedHasMoreRef.current = true;
          followingReelHasMoreRef.current = true;
        } else if (followingFeedPageRef.current > 1 || followingReelPageRef.current > 1) {
          // Refresh silencieux alors qu'on a déjà paginé plus loin : ne pas
          // écraser la progression (même garde que le filtre "all", mais sur
          // les refs qui appartiennent réellement à CE filtre — feedPageRef
          // est celle du filtre "all", la tester ici n'avait aucun sens).
          lastLoadedAtRef.current = Date.now();
          loadingInitialRef.current = false;
          return;
        }

        const [feedResult, reelsResult] = await Promise.all([
          searchService.getFeed(1, FOLLOWING_FEED_PAGE_SIZE, true).catch(() => ({ items: [] })),
          reelService.getFeed({ page: 1, limit: FOLLOWING_REEL_PAGE_SIZE, followingOnly: true }).catch(() => ({ items: [], has_more: false, page: 1, total: 0, limit: FOLLOWING_REEL_PAGE_SIZE })),
        ]);
        followingFeedHasMoreRef.current = (feedResult.items ?? []).length >= FOLLOWING_FEED_PAGE_SIZE;
        followingReelHasMoreRef.current = !!reelsResult?.has_more;

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
        followingSeenIdsRef.current = new Set(merged.map(i => `${i.kind}-${i.id}`));
        setItems(merged);
        setHasMoreFeed(followingFeedHasMoreRef.current || followingReelHasMoreRef.current);
      } else if (f === 'live') {
        // Onglet En direct — concerts live + lives spontanés comme feed items.
        // Pas de pagination par choix : le catalogue est borné par définition
        // (seuls les contenus EN COURS de diffusion à l'instant T, jamais plus
        // qu'une poignée en pratique) — loadMoreFeed/handleEndReached n'a donc
        // rien à faire pour ce filtre, hasMoreFeed reste figé à false pour lui.
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
        // hasMoreFeed peut encore valoir true depuis le filtre précédent ('all'/
        // 'following') — sans ce reset explicite, le footer "chargement..." et
        // onEndReached resteraient actifs pour un filtre qui n'a rien à paginer.
        setHasMoreFeed(false);
      }
      lastLoadedAtRef.current = Date.now();
    } catch (err) {
      if (__DEV__) { console.warn('[FeedScreen] load error:', err); }
    } finally {
      // Ne couper loading/refreshing que pour le DERNIER appel lancé (f==='all') —
      // sinon un appel obsolète qui répond après un appel plus récent (toujours en
      // vol) éteindrait prématurément le spinner de pull-to-refresh alors que le
      // vrai résultat attendu n'est pas encore arrivé. Les filtres autres que
      // 'all' ne partagent pas ce compteur de séquence (requestId figé à sa
      // valeur courante pour eux, cf. plus haut), donc ce garde ne les affecte pas.
      if (f !== 'all' || requestId === loadRequestIdRef.current) {
        loadingInitialRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
      // Libéré inconditionnellement : CET appel a posé le verrou à son entrée,
      // c'est à lui de le rendre, que son résultat ait été gardé ou jeté
      // (appel obsolète dépassé par requestId) — sinon le verrou resterait
      // pris pour de bon et plus aucun chargement ne pourrait jamais repartir.
      feedBusyRef.current = false;
    }
  }, []);

  // Recharge quand le filtre change
  // setLoading(true) uniquement si aucun item visible — évite le flash skeleton
  const itemsRef = useRef<FeedItem[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Préchargement initial — avant cet effect, prefetchUpcomingImages n'était
  // déclenché QUE par le scroll (onScroll/onViewableItemsChanged) : au tout
  // premier chargement de l'écran, les images au-delà de ce qui est
  // immédiatement visible n'étaient précargées qu'une fois l'utilisateur
  // commence à scroller, pas avant. Se déclenche une seule fois, dès que la
  // liste passe de vide à peuplée (reset à chaque changement de filtre pour
  // re-précharger le nouveau fil).
  const didInitialPrefetchRef = useRef(false);
  useEffect(() => {
    if (items.length === 0) { didInitialPrefetchRef.current = false; return; }
    if (didInitialPrefetchRef.current) return;
    didInitialPrefetchRef.current = true;
    InteractionManager.runAfterInteractions(() => prefetchUpcomingImages(0));
  }, [items]);

  // Vide le tracking mémoire du préchargement (pas le cache disque — celui-ci
  // reste précieusement gardé pour un retour rapide) au passage en
  // arrière-plan — même principe que ReelsScreen, qui libère ses ressources
  // actives sans toucher au cache. Sans ça, prefetchedImagesRef grossit sans
  // limite tant que l'app tourne. Au retour au premier plan, le prochain
  // scroll relance normalement le préchargement (le cache disque sert
  // immédiatement les images déjà téléchargées, donc aucune perte de rapidité).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') {
        prefetchedImagesRef.current.clear();
        didInitialPrefetchRef.current = false;
      }
    });
    return () => sub.remove();
  }, []);

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

  const handleScrollTopPress = useCallback(() => {
    try { feedListRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch {}
    load(filter, true, true);
  }, [load, filter]);

  // Scroll infini — page suivante de posts + reels + événements/concerts (recherche),
  // fusionnés et dédupliqués contre tout ce qui a déjà été chargé, ajoutés à la suite.
  // Nombre max de pages consécutives entièrement recoupées (déjà vues) qu'on retente
  // automatiquement avant d'abandonner — filet de sécurité contre une boucle infinie
  // si le backend recoupe indéfiniment (ne devrait jamais arriver en pratique, le tri
  // par score(temps) finit toujours par exposer du contenu neuf ou par se vider).
  const MAX_CONSECUTIVE_RECOUPEMENT = 5;

  // Scroll infini du filtre "Mes amis" — jusqu'ici inexistant (load('following')
  // ne chargeait que la page 1, une fois pour toutes, sans jamais rien ajouter
  // au scroll). Même squelette que loadMoreFeed (garde loadingMoreRef/hasMoreFeed
  // partagée avec le filtre "all", un seul filtre actif à la fois), mais deux
  // sources à paginer séparément (feed mixte + reels), chacune avec son propre
  // epuisement — on arrête de proposer la suite seulement quand LES DEUX sont
  // épuisées.
  const loadMoreFollowing = useCallback(async () => {
    if (loadingInitialRef.current) return;
    if (loadingMoreRef.current || !hasMoreFeed) return;
    loadingMoreRef.current = true;
    setLoadingMoreFeed(true);
    try {
      const appended: FeedItem[] = [];

      if (followingFeedHasMoreRef.current) {
        const nextPage = followingFeedPageRef.current + 1;
        const feedResult = await searchService.getFeed(nextPage, FOLLOWING_FEED_PAGE_SIZE, true).catch(() => ({ items: [] }));
        const raw = feedResult.items ?? [];
        followingFeedHasMoreRef.current = raw.length >= FOLLOWING_FEED_PAGE_SIZE;
        followingFeedPageRef.current = nextPage;
        for (const d of raw) {
          if (!d || !d.id) continue;
          if (d.kind !== 'event' && d.kind !== 'concert' && d.kind !== 'post') continue;
          const key = `${d.kind}-${d.id}`;
          if (followingSeenIdsRef.current.has(key)) continue;
          followingSeenIdsRef.current.add(key);
          appended.push({ kind: d.kind, id: d.id, data: d });
        }
      }

      if (followingReelHasMoreRef.current) {
        const nextReelPage = followingReelPageRef.current + 1;
        const reelsResult = await reelService.getFeed({ page: nextReelPage, limit: FOLLOWING_REEL_PAGE_SIZE, followingOnly: true })
          .catch(() => ({ items: [], has_more: false, page: nextReelPage, total: 0, limit: FOLLOWING_REEL_PAGE_SIZE }));
        followingReelHasMoreRef.current = !!reelsResult?.has_more;
        followingReelPageRef.current = nextReelPage;
        for (const r of (reelsResult?.items ?? [])) {
          if (!r?.id) continue;
          const key = `reel-${r.id}`;
          if (followingSeenIdsRef.current.has(key)) continue;
          followingSeenIdsRef.current.add(key);
          appended.push({ kind: 'reel', id: r.id, data: r });
        }
      }

      if (appended.length > 0) setItems(prev => [...prev, ...appended]);
      setHasMoreFeed(followingFeedHasMoreRef.current || followingReelHasMoreRef.current);
    } catch (err) {
      if (__DEV__) console.warn('[FeedScreen] loadMoreFollowing error:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMoreFeed(false);
    }
  }, [hasMoreFeed]);

  const loadMoreFeed = useCallback(async () => {
    if (filter === 'following') return loadMoreFollowing();
    if (filter !== 'all') return; // pagination gérée uniquement pour "Général"/"Mes amis"
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
          } else if (d.kind === 'suggestions') {
            appended.push({ kind: 'suggestions', id: d.id, data: d.users ?? [] });
          } else if (d.kind === 'communities') {
            appended.push({ kind: 'communities', id: d.id, data: d.communities ?? [] });
          } else if (d.kind === 'reels') {
            // Même éclatement que page 1 — cf. commentaire plus haut.
            for (const r of (d.reels ?? []) as any[]) {
              if (!r?.id) continue;
              appended.push({ kind: 'reel', id: r.id, data: r });
            }
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
  }, [filter, hasMoreFeed, loadMoreFollowing]);
  useEffect(() => { loadMoreFeedRef.current = loadMoreFeed; }, [loadMoreFeed]);

  // Près de toi / dans ton pays — events ET concerts mélangés (2026-10,
  // demande explicite), chargés dès que la position est disponible. D'abord
  // un rayon serré (proximité réelle, 20km) ; si ça ne remonte pas assez
  // d'items pour un carrousel qui vaille la peine d'être affiché (< 4), on
  // complète avec un rayon large (500km, borne max acceptée par le backend —
  // capte de facto tout le pays dans l'immense majorité des cas, le backend
  // n'ayant pas de filtre pays natif) plutôt que de laisser le carrousel
  // vide ou quasi vide. Classé par date de DÉBUT croissante (starts_at pour
  // un event, scheduled_at pour un concert) — l'ordre brut renvoyé par le
  // backend (distance/pertinence) ne garantit aucun classement
  // chronologique. Les événements/concerts déjà passés sont exclus : seule
  // la date de début compte ici (pas de notion de "fin" fiable pour un
  // concert), donc "passé" = starts_at/scheduled_at strictement antérieur à
  // maintenant.
  useEffect(() => {
    if (!userLocation) return;
    let cancelled = false;

    const isUpcoming = (item: NearbyItem) => {
      const raw = nearbyItemStartDate(item);
      if (!raw) return true; // pas de date connue : ne pas exclure à tort
      const t = new Date(raw).getTime();
      return isNaN(t) || t >= Date.now();
    };

    (async () => {
      const [nearbyEv, nearbyConc] = await Promise.all([
        eventService.list({
          limit: 8, lat: userLocation.lat, lon: userLocation.lon,
          radius_km: 20, status: 'published', noCache: true,
        }).catch(() => [] as Event[]),
        concertService.list({
          limit: 8, lat: userLocation.lat, lon: userLocation.lon, radius_km: 20,
        }).catch(() => [] as Concert[]),
      ]);
      if (cancelled) return;

      let items: NearbyItem[] = [
        ...nearbyEv.map(data => ({ kind: 'event' as const, data })),
        ...nearbyConc.map(data => ({ kind: 'concert' as const, data })),
      ].filter(isUpcoming);

      if (items.length < 4) {
        const [wideEv, wideConc] = await Promise.all([
          eventService.list({
            limit: 8, lat: userLocation.lat, lon: userLocation.lon,
            radius_km: 500, status: 'published', noCache: true,
          }).catch(() => [] as Event[]),
          concertService.list({
            limit: 8, lat: userLocation.lat, lon: userLocation.lon, radius_km: 500,
          }).catch(() => [] as Concert[]),
        ]);
        if (cancelled) return;
        const seen = new Set(items.map(i => `${i.kind}-${i.data.id}`));
        const wide: NearbyItem[] = [
          ...wideEv.map(data => ({ kind: 'event' as const, data })),
          ...wideConc.map(data => ({ kind: 'concert' as const, data })),
        ].filter(i => !seen.has(`${i.kind}-${i.data.id}`)).filter(isUpcoming);
        items = [...items, ...wide];
      }

      setNearbyItems(sortByStartDate(items).slice(0, 8));
    })();
    return () => { cancelled = true; };
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

  // Rafraîchissement temps réel : reload quand un autre utilisateur publie.
  // Debounce obligatoire (2026-10) : avec beaucoup d'utilisateurs actifs, une
  // rafale de "feed_updated" rapprochés (plusieurs publications proches dans le
  // temps) appelait load(filter) à CHAQUE événement, sans délai — confirmé par
  // les logs serveur : 4-5 appels page=1 consécutifs en quelques secondes. Or
  // chaque page=1 réinvalide et recalcule le pool mis en cache côté backend
  // (force_recompute = page<=1, voir FeedService.get_feed) : le pool affiché à
  // l'écran changeait sous les pieds de l'utilisateur avant même qu'il n'ait
  // scrollé jusqu'à la page 2, qui tranchait alors un pool DIFFÉRENT de celui
  // déjà vu → doublons massifs côté mobile → la boucle de retry anti-recoupement
  // enchaînait automatiquement page 2 puis page 3 sans rien afficher de neuf.
  // Un seul load() groupé par fenêtre de 10s, jamais un par événement reçu.
  const feedUpdatedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = (payload: { type: string }) => {
      if (payload.type !== 'feed_updated') return;
      if (feedUpdatedDebounceRef.current) clearTimeout(feedUpdatedDebounceRef.current);
      feedUpdatedDebounceRef.current = setTimeout(() => {
        feedUpdatedDebounceRef.current = null;
        // Évite aussi un load() si un chargement (focus, pull-to-refresh...)
        // vient déjà de se produire il y a moins de 10s, pour la même raison.
        if (Date.now() - lastLoadedAtRef.current < 10_000) return;
        // silent=true impératif : un load(filter) "normal" REMPLACE tout de suite
        // items par la page 1 fraîche (voir la branche 'all', setItems(filtered)
        // sans comparaison) — si l'utilisateur lit déjà plus bas dans le feed
        // (pages > 1 chargées), ça aurait fait disparaître sous ses yeux tout ce
        // qu'il regardait au profit d'une nouvelle page 1, juste parce que
        // quelqu'un d'autre a publié quelque part sur la plateforme. silent=true
        // déclenche le même garde-fou que le retour de focus : early-return sans
        // toucher à l'écran si on a déjà scrollé (feedPageRef > 1), et sinon ne
        // remplace le haut du feed QUE si son contenu a réellement changé
        // (comparaison de signature, cf. plus haut dans load()).
        load(filter, true, true);
      }, 10_000);
    };
    addListener(handler);
    return () => {
      removeListener(handler);
      if (feedUpdatedDebounceRef.current) clearTimeout(feedUpdatedDebounceRef.current);
    };
  }, [filter, load, addListener, removeListener]);

  // Restauration explicite de la status bar à chaque prise de focus — le
  // composant <StatusBar> déclaratif plus bas ne suffit pas seul : un écran
  // visité entre-temps (masquant la status bar via son propre <StatusBar
  // hidden />) peut, selon le timing de démontage de React Navigation, laisser
  // la barre système masquée/opaque au retour sur le Feed. On la reforce donc
  // explicitement ici, à chaque fois que cet écran redevient actif. translucent
  // obligatoire — le header gère lui-même l'espace de la status bar via
  // paddingTop: insets.top ; sans ça la barre devient une bande opaque qui
  // recouvre les icônes système au lieu de laisser le fond du header dessous.
  useFocusEffect(useCallback(() => {
    StatusBar.setHidden(false, 'none');
    StatusBar.setBarStyle(theme.isDark ? 'light-content' : 'dark-content', true);
    if (Platform.OS === 'android') {
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent', true);
    }
  }, [theme.isDark]));

  // Relit le réglage "Lecture automatique" à chaque retour sur l'écran — reflète
  // immédiatement un changement fait dans Réglages > Contenu sans attendre un
  // reload complet du feed (SettingsContenuScreen met déjà le cache local à jour
  // via setCachedAppPreferences à chaque toggle, cf. getAppPreferences()).
  useFocusEffect(useCallback(() => {
    setAutoplayEnabled(getAppPreferences().feed_autoplay_reels);
  }, []));

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
      };
    }
    // Retour : refresh silencieux si données > 60s — forceRefresh=true pour
    // bypasser le cache serveur (même correctif que le web, commit db8aa88) :
    // revenir sur l'app après un moment doit vraiment recalculer, pas
    // seulement relire un résultat encore en cache côté backend (TTL 5 min).
    const age = Date.now() - lastLoadedAtRef.current;
    if (age > 60_000) {
      load(filter, true, true);
    }
    return () => {
      setFeedFocused(false);
      setActiveReelId(null);
      clearSettleTimers();
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
  const onNavConcert     = useCallback((id: string) => (nav as any).navigate('ConcertDetail', { concertId: id }), [nav]);
  const onNavNearbyItem  = useCallback((item: NearbyItem) => {
    if (item.kind === 'concert') onNavConcert(item.data.id);
    else onNavEvent(item.data.id);
  }, [onNavEvent, onNavConcert]);

  const onNavMyStories   = useCallback(() => nav.navigate('MyStories'), [nav]);
  const onNavChat        = useCallback((partnerId: string, partnerName: string, avatarUrl?: string) =>
    nav.navigate('Chat', { partnerId, partnerName, avatarUrl }), [nav]);

  // Données du ListHeader "gelées" tant qu'on n'est pas en haut du feed : on ne
  // laisse le header changer de hauteur que quand l'utilisateur est proche du
  // sommet (donc regarde le header). Scrollé plus bas, on garde le dernier
  // instantané — le contenu sous le header ne bouge plus tout seul quand un live
  // WS démarre/s'arrête ou que la géoloc arrive. La resync se fait dès qu'on
  // remonte (feedAtTop repasse à true).
  const [frozenHeaderData, setFrozenHeaderData] = useState({ liveConcerts, spontLives, nearbyItems });
  useEffect(() => {
    if (!feedAtTop) return;
    // On est (re)monté au sommet : appliquer d'abord l'instantané "En direct"
    // mis en attente par un refresh silencieux, puis resynchroniser le header.
    if (pendingLiveHeaderRef.current) {
      const p = pendingLiveHeaderRef.current;
      pendingLiveHeaderRef.current = null;
      setLiveConcerts(p.liveConcerts);
      setSpontLives(p.spontLives);
      setFrozenHeaderData({ liveConcerts: p.liveConcerts, spontLives: p.spontLives, nearbyItems });
      return;
    }
    setFrozenHeaderData({ liveConcerts, spontLives, nearbyItems });
  }, [feedAtTop, liveConcerts, spontLives, nearbyItems]);

  const feedListHeader = useMemo(() => (
    <>
      {/* Stories tout en haut du feed (2026-10, demande explicite : au-dessus
          des événements), scrollent avec le feed — style Instagram/WhatsApp */}
      <StoryBar
        currentUser={currentUser}
        colors={colors}
        onNavigateToMyStories={onNavMyStories}
        onNavigateToChat={onNavChat}
      />

      {/* Événements/concerts proches / dans ton pays — juste sous les stories.
          Masqué hors du filtre "Général" — comme avant son extraction de
          FeedListHeader. */}
      {filter === 'all' && (
        <NearbyEventsCarousel
          items={frozenHeaderData.nearbyItems}
          userCountry={userCountry}
          colors={colors}
          onSeeAll={onNavNearby}
          onPress={onNavNearbyItem}
        />
      )}

      <FeedListHeader
        liveConcerts={frozenHeaderData.liveConcerts}
        spontLives={frozenHeaderData.spontLives}
        colors={colors}
        isDark={theme.isDark}
        currentUserId={currentUser?.id}
        onNavLiveList={onNavLiveList}
        onNavSpontList={onNavSpontList}
        onNavLiveStream={onNavLiveStream}
        onNavLiveViewer={onNavLiveViewer}
        onNavSpontStream={onNavSpontStream}
        onNavSpontViewer={onNavSpontViewer}
      />
    </>
  ), [frozenHeaderData, colors, theme.isDark, userCountry,
      currentUser, currentUser?.id, filter,
      onNavMyStories, onNavChat,
      onNavLiveList, onNavSpontList, onNavNearby, onNavLiveStream, onNavLiveViewer,
      onNavSpontStream, onNavSpontViewer, onNavNearbyItem]);


  const closeComments = useCallback(() => {
    setCommentVisible(false);
    setCommentItem(null);
  }, []);

  // ── Publicité — handlers stables ──────────────────────────────────────────

  const handleAdImpression = useCallback((adId: string) => {
    apiClient.post(`/api/v1/ads/${adId}/impression`).catch(() => {});
  }, []);
  useEffect(() => { handleAdImpressionRef.current = handleAdImpression; }, [handleAdImpression]);

  const handleAdPress = useCallback((adId: string, url: string) => {
    apiClient.post(`/api/v1/ads/${adId}/click`).catch(() => {});
    // url vide : AdCard/AdCTA ont déjà géré l'ouverture eux-mêmes (contact direct
    // via callPhone/openWhatsapp ou runAdButton) — rien d'autre à faire ici.
    if (!url) return;
    // cta_url peut être un numéro de téléphone brut (ancien format, sans les champs
    // contact_phone/contact_call/contact_whatsapp dédiés) — Linking.openURL échoue
    // silencieusement sur un numéro brut, il faut passer par tel:/whatsapp://.
    if (adIsPhone(url)) { openPhoneMenu(url.replace(/^tel:/i, '')); return; }
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
          settled={settledAdSlotsRef.current.has(item.id)}
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
    if (item.kind === 'reel') {
      if (!item.data) return null;
      const r = item.data;
      const tileW = Dimensions.get('window').width - Spacing[4] * 2;
      return (
        <View style={{ marginHorizontal: Spacing[4], marginBottom: 10 }}>
          <ReelSuggestionTile
            reel={r}
            width={tileW}
            height={Math.round(tileW * 1.4)}
            large
            isActive={activeReelId === r.id}
            autoplayEnabled={autoplayEnabled}
            onPress={() => (nav as any).navigate('Tabs', { screen: 'Reels', params: { initialReelId: r.id, initialReel: r } })}
          />
        </View>
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
  }, [colors, currentUser?.id, followingSet, handleToggleFollow, handlePostDeleted, openComments, nav, load, filter, handleAdImpression, handleAdPress, activeReelId, autoplayEnabled]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const displayName = currentUser?.display_name ?? currentUser?.first_name ?? currentUser?.username ?? '';
  const initials = displayName ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?';

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* translucent: obligatoire ici — le header gère lui-même l'espace de la
          status bar via paddingTop: insets.top (juste en-dessous). Sans
          translucent, la barre système devient une bande opaque séparée qui
          recouvre les icônes système (heure/batterie/réseau) au lieu de les
          laisser fusionnées avec le fond du header. */}
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      {/* paddingTop (status bar) isolé sur un wrapper transparent — s.header
          porte uniquement le style visuel de la carte (fond blanc, bordure,
          ombre). Les mélanger ferait apparaître la zone status bar (lavande,
          cf. s.root) comme faisant partie de la carte arrondie, avec un coin
          visible sous la status bar — rendu incohérent. Carte flottante
          blanche (colors.surface) distincte du fond lavande de l'écran
          (colors.background), comme le reste du nouveau design (StoryBar,
          AppTabBar). */}
      <View style={{ paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 6) }}>
        <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        <View style={s.headerRow}>
          {/* Gauche : avatar + pastille "en ligne" */}
          {!currentUser ? (
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
                  width: 9, height: 9, borderRadius: 5,
                  backgroundColor: '#22C55E',
                  borderWidth: 1.5, borderColor: colors.surface,
                }} />
              </View>
              {/* Chevron — indique que l'avatar est cliquable (ouvre le panneau
                  profil / multi-comptes). */}
              <Icon
                name={showProfilePanel ? 'chevron-up' : 'chevron-down'}
                size={12}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Centre : barre de recherche permanente (remplace le logo). Au tap,
              ouvre l'overlay de recherche plein écran existant. */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => openSearchOverlay()}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
              height: 32, borderRadius: 17, paddingHorizontal: 12,
              marginHorizontal: 7,
              backgroundColor: colors.backgroundSecondary,
            }}
          >
            <Icon name="search" size={14} color={colors.textTertiary} />
            <Text style={{ flex: 1, fontSize: FontSize.sm, color: colors.textTertiary }} numberOfLines={1}>
              Rechercher une publication, un ami…
            </Text>
          </TouchableOpacity>

          {/* Droite : notifications (cloche + badge) · messages (bulle + badge) ·
              menu (grille "apps", ouvre Explorer — plus qualitatif que le
              hamburger plat). Icônes nues, mêmes tailles que le reste de l'app. */}
          <View style={s.headerRight}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={goToNotifs}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={{ position: 'relative' }}>
                <Icon name="bell" size={19} color={colors.textPrimary} />
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
                <Icon name="message-circle" size={19} color={colors.textPrimary} />
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
              <MCIcon name="view-grid-outline" size={19} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </View>

      {/* En dehors de la carte header (cf. référence) — sur le fond lavande
          de l'écran, pas dans la carte blanche. */}
      <View style={[s.headerPills, { paddingHorizontal: 16 }]}>
          {/* Mes amis — bascule le filtre du fil (Général ↔ Suivis). Pas de
              chevron : c'est un filtre, pas une navigation. */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleToggleFriends}
            style={[
              s.headerPill,
              { backgroundColor: colors.backgroundSecondary },
              filter === 'following' && { backgroundColor: colors.primary + '18' },
            ]}
          >
            <Icon
              name="users"
              size={14}
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
            style={[s.headerPillNav, { backgroundColor: colors.backgroundSecondary }]}
          >
            <View style={s.headerPillNavInner}>
              <Icon name="heart" size={14} color={colors.textSecondary} />
              <Text style={[s.headerPillText, { color: colors.textSecondary }]}>Favoris</Text>
            </View>
            <Icon name="chevron-right" size={13} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* Direct — même fonction que l'ancien bouton "En direct" : ouvre
              l'écran de diffusion en direct (GoLive). Seul le design change. */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => nav.navigate('GoLive')}
            style={[s.headerPillNav, { backgroundColor: colors.backgroundSecondary }]}
          >
            <View style={s.headerPillNavInner}>
              <View style={{ position: 'relative' }}>
                <Icon name="send" size={14} color={colors.textSecondary} />
                <View style={{
                  position: 'absolute', top: -1, right: -3,
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: colors.liveTag,
                  borderWidth: 1, borderColor: colors.backgroundSecondary,
                }} />
              </View>
              <Text style={[s.headerPillText, { color: colors.textSecondary }]}>Direct</Text>
            </View>
            <Icon name="chevron-right" size={13} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

      {(loading || switchingFilter) ? (
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
                <Text style={[s.emptyText, { color: colors.textPrimary, fontWeight: FontWeight.extraBold, fontSize: FontSize.mdPlus }]}>
                  Aucun post de tes suivis
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: FontSize.base, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32, marginTop: 6 }}>
                  Les personnes que tu suis n'ont pas encore publié de post. Suis plus de gens ou reviens plus tard.
                </Text>
                <TouchableOpacity
                  onPress={handleToggleFriends}
                  style={{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 24 }}
                >
                  <Text style={{ color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.base }}>Découvrir du contenu</Text>
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

      {/* Bouton flottant "remonter + rafraîchir" — juste au-dessus de la tab
          bar (jamais dessus ni caché dessous), apparaît après un scroll
          significatif. Au clic : remonte en haut de la liste ET relance un
          chargement silencieux pour du contenu frais.
          Toujours monté (jamais démonté/remonté conditionnellement dans le
          JSX) — un montage/démontage en plein milieu d'un geste de scroll actif
          sur la FlatList perturbait la réconciliation native de l'arbre de
          vues, provoquant des saccades et des taps qui atterrissaient sur le
          mauvais élément. Seuls opacity/pointerEvents changent, jamais la
          présence du composant. */}
      <Animated.View
        pointerEvents={showScrollTop ? 'box-none' : 'none'}
        style={[
          fst.scrollTopWrap,
          { bottom: TAB_BAR_HEIGHT + insets.bottom - 46 },
          scrollTopStyle,
        ]}
      >
        <TouchableOpacity
          onPress={handleScrollTopPress}
          activeOpacity={0.6}
          style={fst.scrollTopBtn}
        >
          <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, scrollTopIconStyle]}>
            <Icon name="chevrons-up" size={18} color="#fff" style={{ textAlign: 'center' }} />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

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

      {/* Pub vidéo ouverte en plein écran avec son — clic sur une AdCard vidéo
          du feed (l'overlay recherche, global, gère la sienne). */}
      <Modal visible={!!fullscreenAd} animationType="slide" onRequestClose={() => setFullscreenAd(null)} statusBarTranslucent>
        {fullscreenAd && <AdFullscreenPlayer ad={fullscreenAd} onClose={() => setFullscreenAd(null)} />}
      </Modal>

      {/* Incitation à booster le contenu le plus engageant de l'utilisateur —
          jamais affiché en même temps que les contacts ou le sondage de
          démarrage, cf. file d'attente des sollicitations ci-dessus. */}
      <BoostPromptBottomSheet
        visible={activeOverlay === 'boost'}
        suggestion={boostSuggestion}
        onClose={handleBoostPromptClose}
        onBoost={handleBoostPromptBoost}
      />

      {/* "Qu'est-ce qui t'amène sur Gofolyx ?" — configure l'écran de démarrage */}
      <StartScreenSurveySheet
        visible={activeOverlay === 'startScreenSurvey'}
        onClose={() => releaseOverlaySlot('startScreenSurvey')}
        onAnswer={handleStartScreenAnswer}
      />

      {/* ── Panneau infos primaires — rendu au niveau racine de l'écran (pas
          dans le header) pour pouvoir passer par-dessus headerPills et la
          FlatList, qui sont rendus après le header dans l'arbre JSX et donc
          l'auraient recouvert si le panneau était resté un enfant du header. */}
      {showProfilePanel && currentUser && (
        <>
          <TouchableWithoutFeedback onPress={() => setShowProfilePanel(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View
            style={{
              position: 'absolute',
              top: insets.top + (Platform.OS === 'android' ? 8 : 6) + 37 + 6,
              left: 22, zIndex: 50,
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
                  <Text style={{ color: colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.basePlus }}>{initials}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold, color: colors.textPrimary, flexShrink: 1 }} numberOfLines={1}>
                    {currentUser.display_name ?? currentUser.first_name ?? currentUser.username}
                  </Text>
                  {currentUser.is_verified && <Icon name="check-circle" size={14} color={colors.primary} />}
                </View>
                {currentUser.username && (
                  <Text style={{ fontSize: FontSize.sm, color: colors.textTertiary, marginTop: 1 }} numberOfLines={1}>@{currentUser.username}</Text>
                )}
              </View>
            </View>
            {currentUser.bio && (
              <Text style={{ fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 10, lineHeight: 17 }} numberOfLines={3}>
                {currentUser.bio}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => { setShowProfilePanel(false); currentUser.id && (nav as any).navigate('UserProfile', { userId: currentUser.id }); }}
              activeOpacity={0.85}
              style={{ marginTop: 12, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.primary + '18' }}
            >
              <Text style={{ fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, color: colors.primary }}>Voir le profil</Text>
            </TouchableOpacity>

            {/* Multi-compte — bascule rapide, sans repasser par les Paramètres */}
            {accounts.length > 1 && (
              <>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: 12 }} />
                <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, letterSpacing: 0.6, color: colors.textTertiary, marginBottom: 8 }}>
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
                          <Text style={{ color: colors.primary, fontWeight: FontWeight.extraBold, fontSize: FontSize.smPlus }}>{initial}</Text>
                        </View>
                      )}
                      <Text style={{ flex: 1, fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold, color: colors.textPrimary }} numberOfLines={1}>
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
              <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: colors.textSecondary }}>Gérer les comptes</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

    </View>
  );
};


const hk = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderLeftWidth: 3 },
  icon: { fontSize: FontSize.md },
  text: { flex: 1, fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, lineHeight: 18 },
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
  sheetTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  group:      { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  action:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
  iconWrap:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: FontSize.basePlus, fontWeight: FontWeight.medium },
  divider:    { height: StyleSheet.hairlineWidth },
  cancelBtn:  { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  cancelText: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  actionSub:  { fontSize: FontSize.sm, marginTop: 1 },
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

  // Neutre plutôt que le violet de marque — la couleur reste réservée aux
  // vrais signaux de statut (LIVE, GRATUIT), pas à la décoration générique.
  const accent   = colors.textSecondary;
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

  // Repost — republication avec attribution de source (événements et concerts,
  // même pattern que ReelsScreen.tsx/PostCard.tsx). Distinct du partage externe
  // (handleShare). Passe par un bottom sheet de confirmation (aperçu + bouton
  // explicite) au lieu de republier instantanément au premier tap.
  const [reposting, setReposting] = useState(false);
  const [repostSheetOpen, setRepostSheetOpen] = useState(false);

  const handleRepostPress = () => {
    if ((!isEvent && !isConcert) || reposting) return;
    setRepostSheetOpen(true);
  };

  const handleRepostConfirm = async () => {
    if ((!isEvent && !isConcert) || reposting) return;
    setReposting(true);
    try {
      if (isEvent) {
        await eventService.repost(item.id);
        toastService.success('Repartagé', `« ${event?.title ?? ''} » a été republié sur votre profil.`);
      } else {
        await concertService.repost(item.id);
        toastService.success('Repartagé', `« ${concert?.title ?? ''} » a été republié sur votre profil.`);
      }
      setRepostSheetOpen(false);
    } catch {
      toastService.error('Échec', isEvent ? 'Impossible de repartager cet événement pour le moment.' : 'Impossible de repartager ce concert pour le moment.');
    } finally {
      setReposting(false);
    }
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
                <Text style={{ color: colors.textTertiary, fontSize: FontSize.xs, fontWeight: FontWeight.semiBold }}>Vérification en cours…</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {showFollowBtn && !isFollowing && (
            <TouchableOpacity style={[fc.followChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]} onPress={onToggleFollow} activeOpacity={0.7}>
              <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, color: colors.textPrimary }}>Suivre</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setCardMenuOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="more-horizontal" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Titre + ligne info compacte — design allégé : type/date/lieu tenus
          sur une seule ligne (plus de badge de type séparé), le statut
          (LIVE/GRATUIT/prix) aligné à droite au lieu d'empiler un 3e bloc
          de badges en dessous. Minimum affiché, mieux réparti. ─────────── */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={fc.titleWrap}>
        <Text style={[fc.heroTitle, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
        <View style={fc.heroInfoRow}>
          <View style={fc.heroMeta}>
            <Icon name={cardIcon} size={10} color={colors.textTertiary} />
            <Text style={[fc.heroMetaText, { color: colors.textSecondary }]} numberOfLines={1}>{typeLabel}</Text>
            <Text style={[fc.heroMetaDot, { color: colors.textTertiary }]}>·</Text>
            <Text style={[fc.heroMetaText, { color: colors.textSecondary }]}>{formatDate(date)}</Text>
            {city ? (
              <>
                <Text style={[fc.heroMetaDot, { color: colors.textTertiary }]}>·</Text>
                <Text style={[fc.heroMetaText, { color: colors.textSecondary }]} numberOfLines={1}>{city}</Text>
              </>
            ) : null}
          </View>
          {isLive ? (
            <View style={fc.heroStatus}>
              <View style={[fc.liveDot, { backgroundColor: colors.liveTag }]} />
              <Text style={[fc.heroStatusText, { color: colors.liveTag }]}>LIVE</Text>
            </View>
          ) : isFree ? (
            <Text style={[fc.heroStatusText, { color: colors.success }]}>Gratuit</Text>
          ) : price != null && price > 0 ? (
            <Text style={[fc.heroStatusText, { color: colors.textSecondary }]}>
              dès <PriceWithLocal amountEur={price!} style={[fc.heroStatusText, { color: colors.textSecondary }]} localStyle={{ color: colors.textTertiary }} />
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {/* ── Repost — bande d'attribution de source (événement uniquement),
          même pattern que ReelsScreen.tsx (source_reel/remix_type). ──────── */}
      {isEvent && event?.source_event && (
        <View style={[fc.sourceBand, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Icon name="repeat" size={9} color={colors.textTertiary} />
          {event.source_event.thumbnail_url
            ? <CachedImage uri={event.source_event.thumbnail_url} style={fc.sourceThumb} resizeMode="cover" />
            : null
          }
          <Text style={[fc.sourceText, { color: colors.textSecondary }]} numberOfLines={1}>
            Repost de{' '}
            <Text style={{ fontWeight: FontWeight.extraBold }}>
              {event.source_event.organizer?.display_name || event.source_event.organizer?.username || 'un organisateur'}
            </Text>
          </Text>
        </View>
      )}

      {/* ── Repost — bande d'attribution de source (concert uniquement),
          même pattern que ReelsScreen.tsx (source_reel/remix_type). ──────── */}
      {isConcert && concert?.source_concert && (
        <View style={[fc.sourceBand, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Icon name="repeat" size={9} color={colors.textTertiary} />
          {concert.source_concert.thumbnail_url
            ? <CachedImage uri={concert.source_concert.thumbnail_url} style={fc.sourceThumb} resizeMode="cover" />
            : null
          }
          <Text style={[fc.sourceText, { color: colors.textSecondary }]} numberOfLines={1}>
            Repost de{' '}
            <Text style={{ fontWeight: FontWeight.extraBold }}>
              {concert.source_concert.artist?.display_name || concert.source_concert.artist?.username || 'un créateur'}
            </Text>
          </Text>
        </View>
      )}

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
              <View style={[fc.commentIcon, { backgroundColor: colors.textTertiary }]}><MCIcon name="comment-outline" size={9} color="#fff" /></View>
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
      <View style={[fc.actionBar, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
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

        {(isEvent || isConcert) && (
          <TouchableOpacity style={fc.actionBtn} onPress={handleRepostPress} disabled={reposting} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Icon name="repeat" size={FeedActionIcon.size} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[fc.actionBtn, fc.actionBtnSave]} onPress={handleSave} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Animated.View style={saveStyle}>
            <MCIcon name={saved ? 'bookmark' : 'bookmark-outline'} size={FeedActionIcon.size} color={saved ? colors.textPrimary : colors.textSecondary} />
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
      {repostSheetOpen && (
        <RepostBottomSheet
          visible
          kind={isEvent ? 'event' : 'concert'}
          author={author}
          title={isEvent ? event?.title : concert?.title}
          thumb={isEvent ? event?.thumbnail_url : concert?.thumbnail_url}
          reposting={reposting}
          onConfirm={handleRepostConfirm}
          onClose={() => { if (!reposting) setRepostSheetOpen(false); }}
        />
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
  liveDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  titleWrap:      { paddingHorizontal: FCPAD, paddingTop: 2, paddingBottom: 8 },
  heroTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.extraBold, letterSpacing: -0.2, lineHeight: 21, marginBottom: 4 },
  // Ligne unique : infos (type · date · lieu) à gauche, statut à droite —
  // remplace l'ancien empilement titre / date-lieu / badges (3 blocs).
  heroInfoRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMeta:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  heroMetaText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium, flexShrink: 1 },
  heroMetaDot:    { fontSize: FontSize.xsPlus },
  heroStatus:     { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  heroStatusText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, flexShrink: 0 },
  // Header auteur
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: FCPAD, paddingTop: FCPAD, paddingBottom: 8, gap: 8 },
  headerLeft:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  authorName:     { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, letterSpacing: -0.1 },
  timeAgo:        { fontSize: FontSize.xsPlus, fontWeight: FontWeight.medium, marginTop: 1 },
  followChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: FeedRadius.chip, borderWidth: 1 },
  // Description
  descWrap:       { paddingHorizontal: FCPAD, paddingBottom: 8 },
  desc:           { fontSize: FontSize.base, lineHeight: 21 },
  // Repost — attribution de source (même pattern que ReelsScreen.tsx::sourceBand)
  sourceBand:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: FeedRadius.chip, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start', maxWidth: '100%', marginHorizontal: FCPAD, marginBottom: 8 },
  sourceThumb:    { width: 16, height: 16, borderRadius: 4, overflow: 'hidden' },
  sourceText:     { fontSize: FontSize.xs },
  // Media — encadré, coins arrondis
  mediaWrap:      { paddingHorizontal: FCPAD, paddingBottom: 10 },
  mediaClip:      { borderRadius: FeedRadius.media, overflow: 'hidden', backgroundColor: '#0d0d1a' },
  // Compteurs
  countsRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: FCPAD, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  countChip:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countText:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  commentIcon:  { width: 18, height: 18, borderRadius: FeedRadius.full, alignItems: 'center', justifyContent: 'center' },
  // Actions — icônes seules, cible 44px
  // Pilule flottante — même design que AppHeader/AppTabBar (borderRadius 24,
  // bordure hairline, ombre douce #5B45B5), cohérent avec PostCard.tsx.
  actionBar:      {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: FCPAD - 4, marginBottom: 10, marginTop: 6,
    borderRadius: 24, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4, paddingVertical: 2,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  actionBtn:      { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionBtnSave:  { flex: 0, width: 44 },
});

const nb2 = StyleSheet.create({
  wrap: { marginBottom: FeedCardLayout.gutter + 4 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: FeedCardLayout.marginHorizontal + 4, marginBottom: 12,
  },
  headerIconWrap: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.extraBold },
  headerSubtitle: { fontSize: FontSize.xsPlus, marginTop: 1 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllTxt: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  list: { paddingHorizontal: FeedCardLayout.marginHorizontal + 4, gap: 12, paddingBottom: 4 },
  card: {
    borderRadius: 20, overflow: 'hidden', backgroundColor: '#1a1a1a',
    shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  typeBadge: {
    position: 'absolute', top: 8, left: 8,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  pillBadge: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3,
  },
  pillBadgeCountry: { backgroundColor: '#16A34A' },
  pillBadgeTxt: { fontSize: FontSize.xs, fontWeight: FontWeight.extraBold, color: '#fff' },

  cardFooter: { position: 'absolute', left: 12, right: 12, bottom: 10, gap: 2 },
  dateChip: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 1,
  },
  dateChipTxt: { fontSize: 10, fontWeight: FontWeight.extraBold, color: '#fff', letterSpacing: 0.4 },
  cardTitle: { fontSize: FontSize.smPlus, fontWeight: FontWeight.extraBold, color: '#fff', lineHeight: 18 },
  cardLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardLoc: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', fontWeight: FontWeight.semiBold },
});

// ── Bouton flottant "remonter + rafraîchir" ───────────────────────────────────
const fst = StyleSheet.create({
  scrollTopWrap: {
    position: 'absolute',
    right: 18,
    // Taille bornée exactement à celle du bouton — jamais de zone de hit-test
    // floue qui pourrait intercepter des touches ailleurs sur la liste en dessous.
    width: 34,
    height: 34,
  },
  scrollTopBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    // Fond overlay — sans lui, l'icône seule se perdait visuellement selon le
    // contenu qui défile derrière (photo claire, fond blanc...). Semi-transparent
    // sombre pour rester lisible quel que soit le fond, cohérent avec les autres
    // boutons flottants par-dessus du contenu variable dans l'app (Reels...).
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});

