import React, {
  useEffect, useState, useCallback, useRef, memo, useMemo,
} from 'react';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, Dimensions,
  TouchableOpacity, ActivityIndicator, StatusBar, Image,
  Platform, Modal, TextInput, RefreshControl,
  KeyboardAvoidingView, Keyboard, AppState, Linking, BackHandler,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSequence, withTiming, withSpring, withRepeat, withDelay,
  Easing, interpolate, FadeIn,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontSize, FontWeight } from '../../theme';
import { TAB_BAR_HEIGHT } from '../../styles';
import { useTheme } from '../../hooks/useTheme';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { useIsWifi } from '../../hooks/useIsWifi';
import { useNetworkQuality } from '../../hooks/useNetworkQuality';
import type { NetworkQuality } from '../../services/networkService';
import { useMediaDownload } from '../../hooks/useMediaDownload';
import { RichText } from '../../components/common/RichText';
import { openPhoneMenu } from '../../utils/phoneMenu';
import { storage } from '../../utils/storage';
import { getPlaybackPrefs } from '../../hooks/usePlaybackPrefs';
import { STORAGE_KEYS } from '../../utils/constants';
import { apiClient, Endpoints } from '../../api';
import { reelService, socialService, authService, searchService, toastService, showConfirm } from '../../services';
import { cableService } from '../../services/cableService';
import { userService } from '../../services/userService';
import {
  CommentsBottomSheet, VerifiedBadge, ReportModal, GofolyxLoader, ShareBottomSheet,
  HeartRain, AvatarWithBadge, SwipeUpHint, GiftHoldHint,
} from '../../components/common';
import { AdvertiserRow, adIsVideo, adIsPhone, adCtaLabel, adHasContact, adContactButtons, runAdButton } from '../../components/ads';
import { GiftPickerModal } from '../../components/wallet/GiftPickerModal';
import type { Reel, ReactionType } from '../../types';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { type FilterKey, type ReelEditResult, FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2, ReelEditorScreen } from '../Create/ReelEditorScreen';
import Sound from 'react-native-sound';
import { BackButton } from '../../components/common';
import { getLogo } from '../../assets';
import * as reelVideoCache from '../../services/reelVideoCacheService';
import { consumeReelsPrefetch } from '../../services/reelsPrefetchService';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// ─── Design tokens locaux ───────────────────────────────────────────────────
// Le lecteur Reels est TOUJOURS sur fond vidéo sombre : ses accents ne suivent
// PAS le thème clair/sombre. On les centralise ici plutôt que de répéter les
// littéraux (#E0389A apparaissait 8×, #7B3FF2 3×).
const REEL_LIKE  = '#E0389A'; // rose — cœur "aimé", HeartRain, badges d'amis
const REEL_MUSIC = '#7B3FF2'; // violet — bandeau musique, bouton + sur avatar

// Surface "verre" unique pour TOUS les éléments d'overlay posés sur la vidéo
// (boutons d'action, bandes info, cercle play/pause…). Avant, 5 opacités de noir
// différentes (0.45 / 0.5 / 0.55) et 3 opacités de bordure cohabitaient pour des
// éléments de même niveau — incohérent à l'œil. Une seule valeur partout.
const OVERLAY_SURFACE = 'rgba(0,0,0,0.5)';
const OVERLAY_BORDER  = 'rgba(255,255,255,0.18)';

// Échelle de border-radius pour les zones NON-vidéo (grilles, sheets, menus).
const RR = { chip: 8, media: 12, card: 16, pill: 999 } as const;

// Tailles overlay dérivées du facteur d'échelle responsive (voir `ui` dans
// ReelsScreen). Passé en prop à VideoSlide / AdSlide.
type ReelUI = {
  scale: number;
  actionCircle: number; actionIcon: number; actionIconMC: number; actionLabel: number;
  railGap: number;
  headerTitle: number; headerIcon: number;
  playPause: number; playPauseIcon: number;
  reelInfoRight: number;
  authorName: number; caption: number;
};

// Logo (variant "light", fond clair) qui tourne en boucle, recadré en cercle
// — le fond clair du logo devient un disque au lieu d'un carré brut sur
// l'écran noir des Reels. Le clip (View ronde, overflow hidden) reste fixe ;
// seule l'image tourne à l'intérieur, en "cover" pour remplir tout le disque.
const REEL_LOADER_SIZE = 40;
const ReelLogoLoader: React.FC = () => {
  const rotate = useSharedValue(0);
  useEffect(() => {
    rotate.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1, false);
  }, []);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: REEL_LOADER_SIZE, height: REEL_LOADER_SIZE, borderRadius: REEL_LOADER_SIZE / 2, overflow: 'hidden' }}>
        <Animated.Image
          source={getLogo(false)}
          style={[{ width: '100%', height: '100%' }, spinStyle]}
          resizeMode="cover"
        />
      </View>
    </View>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const getAuthorLabel = (author?: Reel['author']): string => {
  if (!author) return 'Utilisateur';
  return (
    author.display_name ||
    (author.first_name && author.last_name
      ? `${author.first_name} ${author.last_name}`
      : author.first_name || author.username || 'Utilisateur')
  );
};

const getAuthorInitial = (author?: Reel['author']): string =>
  getAuthorLabel(author)[0].toUpperCase();

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(n ?? 0);
};

// Fenêtre de préchargement identique wifi/4G : avec le variant "lo" (400kbps) et le
// buffer déjà réduit hors wifi (preferredForwardBufferDurationMs=6s, voir videoSource
// dans VideoSlide), précharger seulement 1 voisin en 4G laissait le second swipe rapide
// tomber sur une vidéo jamais préchargée (démarrage à froid, latence visible). Le coût
// data supplémentaire (~2 voisins × 6s × 400kbps ≈ 600 Ko) est faible face au gain de
// fluidité perçu.
//
// Élargi 2 → 4 (2026-10, demande explicite) : couvre un scroll rapide sur
// plusieurs reels d'affilée sans jamais de chargement visible, pas seulement
// un swipe isolé — reste loin du préchargement de TOUTE la liste chargée en
// mémoire (coûteux, non retenu), juste une fenêtre plus large autour de
// l'index courant.
const PRELOAD_WINDOW = 4;
// Fenêtre du CACHE DISQUE — volontairement plus étroite que PRELOAD_WINDOW.
// Le buffer vidéo (PRELOAD_WINDOW) est léger et coexiste bien avec le player
// actif, mais un téléchargement cache est un flux réseau complet à lui seul :
// avec PRELOAD_WINDOW large, trop de reels lançant chacun leur propre
// téléchargement en même temps que le reel actif charge son flux — surtout
// sensible à l'ouverture de l'écran, où currentIndex=0 fait démarrer
// plusieurs downloads cache d'un coup pile quand l'utilisateur attend que la
// première vidéo démarre. 2 voisins (échelonnés, cf. CACHE_STAGGER_DELAY_MS)
// gardent le bénéfice du cache pour un scroll rapide, sans saturer la bande
// passante au moment critique du premier chargement.
const CACHE_PRELOAD_WINDOW = 2;
// En wifi (2026-09) : le risque ci-dessus est un risque de TIMING (plusieurs
// downloads démarrant au même instant précis, surtout à l'ouverture), pas un
// risque de bande passante insuffisante — en wifi, la bande passante n'est
// justement plus la contrainte. Élargi à 3 voisins, chacun ÉCHELONNÉ dans le
// temps (cf. CACHE_STAGGER_DELAY_MS dans VideoSlide) pour ne jamais redémarrer
// plusieurs téléchargements cache au même instant, même en wifi. Reste plus
// restreint en cellulaire (coût data réel à limiter).
const CACHE_PRELOAD_WINDOW_WIFI = 3;
// Délai avant de démarrer le cache disque du 2e voisin (distance 2), pour
// laisser le temps au 1er voisin (distance 1, sans délai) de bien démarrer
// avant de lancer un 2e flux réseau complet en parallèle.
const CACHE_STAGGER_DELAY_MS = 1_500;

// Hash déterministe simple (djb2) — jamais Math.random() : sert à dériver une
// position "aléatoire" mais reproductible (même seed → même résultat), pour
// le mélange des pubs dans le flux Reels (voir feedWithAds).
function hashCode(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

// ─── ReelsScreen ─────────────────────────────────────────────────────────────

// Durée de vie max d'une pub Reels déjà chargée dans un slot avant revalidation
// silencieuse — contrairement au Feed principal (refresh_ad_slots côté backend,
// réappliqué à chaque page servie), une pub Reels chargée une fois dans adSlots
// n'était jusqu'ici JAMAIS revérifiée : une campagne dont le budget s'épuise ou
// qui est mise en pause pendant la session restait affichée indéfiniment tant que
// l'utilisateur ne quittait pas l'écran. Voir l'effet de revalidation périodique
// plus bas — ne touche jamais un slot proche de currentIndex (jamais la pub
// actuellement regardée ni ses voisins immédiats).
const AD_SLOT_REVALIDATE_MS = 3 * 60 * 1000;

// Feed reels avec pub injectee toutes les AD_INTERVAL reels — voir feedWithAds
// et toRenderedIndex (conversion d'index reels → index liste rendue).
const AD_INTERVAL = 5;
// Taille de page pour le mode "reels d'un utilisateur" (profil, recherche) — scroll infini.
const USER_REELS_PAGE_LIMIT = 20;
// Grille recherche (tendances + résultats) — une pub occupe une cellule toutes les
// SEARCH_AD_INTERVAL cartes (placement="search" côté backend, distinct de "reels").
const SEARCH_AD_INTERVAL = 6;
const SEARCH_PAGE_LIMIT = 20;

export const ReelsScreen: React.FC = () => {
  useKeepAwake();
  const isWifi = useIsWifi();
  const networkQuality = useNetworkQuality();
  // Interface superposée aux reels (colonne actions, auteur/légende/musique) —
  // Réglages > Lecture > "Interface sur les reels". Relue à chaque prise de
  // focus de l'écran (pas seulement au montage) : sans ça, désactiver le
  // réglage puis revenir sur un reel déjà actif ne changeait rien tant que ce
  // slide précis ne redevenait pas actif depuis un état inactif — ce qui
  // n'arrive jamais si on était déjà dessus en quittant vers Réglages.
  const [reelsShowInterface, setReelsShowInterface] = useState(() => getPlaybackPrefs().reels_show_interface);
  useFocusEffect(useCallback(() => {
    setReelsShowInterface(getPlaybackPrefs().reels_show_interface);
  }, []));
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }) => setScreenDims(screen));
    return () => sub.remove();
  }, []);

  const SCREEN_W = screenDims.width;
  const insets   = useSafeAreaInsets();
  // La tab bar (Accueil/Découvrir/Reels/Profil) reste visible sur cet écran,
  // mais en OVERLAY transparent flottant par-dessus la vidéo (voir AppTabBar
  // hideBackground côté Reels) — elle ne réserve donc plus sa propre hauteur :
  // chaque page Reels occupe de nouveau tout l'écran, plein écran réel.
  const SCREEN_H = screenDims.height;
  const HEADER_H = insets.top + 54;

  // ── Échelle responsive de l'UI overlay ──────────────────────────────────────
  // Toutes les tailles de la surface overlay (colonne d'actions, header, bandes)
  // dérivent d'UN facteur, au lieu d'être figées en px — sinon les icônes
  // paraissent minuscules sur grand écran (iPad, ou Android téléphone en paysage,
  // tous deux non verrouillés en portrait). Base = iPhone 14 (390×844). On prend
  // le MIN des deux ratios pour ne pas gonfler l'UI en paysage (hauteur réduite),
  // et on borne [1, 1.35] : jamais plus petit que la baseline téléphone déjà
  // calibrée, jamais surdimensionné sur tablette.
  const uiScale = useMemo(() => {
    const raw = Math.min(SCREEN_W / 390, SCREEN_H / 844);
    return Math.max(1, Math.min(raw, 1.35));
  }, [SCREEN_W, SCREEN_H]);
  const ui = useMemo(() => {
    const r = (n: number) => Math.round(n * uiScale);
    return {
      scale:          uiScale,
      actionCircle:   r(44),
      actionIcon:     r(22),
      actionIconMC:   r(24),
      actionLabel:    r(11),
      railGap:        r(14),
      headerTitle:    r(22),
      headerIcon:     r(20),
      playPause:      r(64),
      playPauseIcon:  r(36),
      reelInfoRight:  r(84),   // dégagement de la colonne d'actions
      authorName:     r(13),
      caption:        r(12),
    };
  }, [uiScale]);
  const { theme, isDark } = useTheme();
  const { colors }        = theme;

  const nav    = useNavigation<Nav>();
  const route  = useRoute();
  const params = (route.params ?? {}) as { initialReelId?: string; initialReel?: Reel; reelPublished?: boolean; userId?: string; initialReels?: Reel[] };
  // paramsRef toujours à jour — lisible depuis useFocusEffect (closure figée sur [])
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Mode "reels d'un utilisateur" — figé au montage (une navigation vers un autre
  // profil démonte cet écran, donc pas besoin de réagir à un changement en cours de vie).
  const userModeRef = useRef<string | undefined>(params.userId);
  const userMode = userModeRef.current;

  // ── Refs ─────────────────────────────────────────────────────────────────
  const listRef           = useRef<FlatList>(null);
  const isLoadingMoreRef  = useRef(false);
  const pageRef           = useRef(1);
  const currentIdxRef     = useRef(0);
  const currentReelRef    = useRef<{ id: string; startTime: number } | null>(null);
  const viewedReelsRef    = useRef<Set<string>>(new Set());
  const activePlayerRef   = useRef<{ pause: () => void } | null>(null);
  // Verrou global : un seul reel à la fois a le droit d'avoir du son (actif OU voisin
  // immédiat en préchargement silencieux). Empêche deux players de sonner en même temps.
  const audioOwnerRef     = useRef<string | null>(null);
  const mountedRef        = useRef(true);
  const searchTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchReqRef      = useRef('');
  const searchInputRef    = useRef<TextInput>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const lastLoadedAtRef   = useRef<number>(0);
  const didFocusOnceRef   = useRef(false);
  const lastInitialReelRef  = useRef<string | undefined>(undefined);
  // Reel demandé depuis FeedScreen — consommé dans onLayout (FlatList montée = garantie)
  const pendingTargetRef    = useRef<{ id: string; reel?: Reel } | null>(null);
  // id du reel actuellement attendu par awaitingTarget (cf. useEffect de libération
  // plus bas) — distinct de pendingTargetRef : celui-ci reste valorisé même une fois
  // le reel déjà trouvé/injecté et le scroll lancé, tant que currentIndex n'a pas
  // confirmé l'arrivée dessus.
  const awaitingTargetIdRef = useRef<string | null>(null);
  // ── State ─────────────────────────────────────────────────────────────────
  const seedReel = useRef(
    userMode && params.initialReels && params.initialReels.length > 0
      ? (() => {
          const list = params.initialReels!.filter(r => (!!r.hls_url || !!r.mp4_url));
          const targetId = params.initialReelId;
          if (targetId) {
            const idx = list.findIndex(r => r.id === targetId);
            if (idx > 0) { const [cur] = list.splice(idx, 1); list.unshift(cur); }
          }
          return list;
        })()
      : (params.initialReel?.hls_url || params.initialReel?.mp4_url) ? [params.initialReel as Reel] : []
  ).current;

  const [reels,         setReels]         = useState<Reel[]>(seedReel.length > 0 ? seedReel : []);
  const [myReels,       setMyReels]       = useState<Reel[]>([]);
  type AdData0 = { id: string; title: string; description?: string; cta_text?: string; cta_url?: string; creative_url?: string; thumbnail_url?: string; advertiser_id?: string };
  // Une ad par EMPLACEMENT (clé = index du slot, ex: 0, 1, 2... pour le 1er/2e/3e
  // emplacement pub inséré tous les AD_INTERVAL reels) — avant, une seule ad était
  // chargée pour tout le feed et réutilisée partout, donc toujours la même pub quel
  // que soit le nombre de reels scrollés.
  const [adSlots, setAdSlots] = useState<Map<number, AdData0>>(new Map());
  const adSlotsRef = useRef(adSlots);
  adSlotsRef.current = adSlots;
  // Position FIGÉE (index dans feedWithAds) de chaque slotIdx, calculée UNE
  // SEULE FOIS — la toute première fois que ce slot apparaît dans adSlots —
  // puis jamais recalculée, même quand `reels` grandit (pagination infinie).
  // Comme Facebook : la pub est mélangée dans le flux (pas en fin de liste),
  // mais sa position ne bouge plus jamais une fois affichée à l'utilisateur.
  // Si on recalculait à chaque changement de `reels`/`adSlots`, une pub déjà
  // vue à la position 5 pourrait se retrouver à la position 8 après un
  // nouveau chargement de page — exactement le bug de décalage déjà corrigé
  // une fois dans cette session (toRenderedIndex, feedWithAds en fin de
  // liste). Bornée à reels.length AU MOMENT DE LA CRÉATION du slot (jamais
  // au-delà), donc toujours dans une zone de reels déjà chargés.
  const adSlotPositionsRef = useRef<Map<number, number>>(new Map());
  const servedAdIdsRef = useRef<Set<string>>(new Set());
  const loadingAdSlotsRef = useRef<Set<number>>(new Set());
  // reelAdRef — reflète juste "au moins une ad a déjà été chargée" (utilisé par
  // toRenderedIndex pour savoir si des slots pub existent dans le flux rendu).
  const reelAdRef = useRef(false);
  reelAdRef.current = adSlots.size > 0;

  // File d'attente — sérialise les chargements de slots pub. Sans ça, plusieurs
  // slots demandés dans le même passage (voir useEffect[reels.length] plus bas)
  // partaient en parallèle AVANT que servedAdIdsRef soit mis à jour par la réponse
  // du premier : chaque requête envoyait donc la même exclusion (souvent vide), et
  // le backend — qui trie par cpm_eur.desc() — renvoyait la même pub gagnante à
  // tous les slots. En chaînant les appels, chaque requête part avec la liste
  // d'exclusion à jour de tout ce qui a déjà été servi.
  const adQueueRef = useRef<Promise<void>>(Promise.resolve());

  const loadAdForSlot = useCallback((slotIdx: number, allowRepeat = false) => {
    if (loadingAdSlotsRef.current.has(slotIdx) || adSlotsRef.current.has(slotIdx)) return;
    loadingAdSlotsRef.current.add(slotIdx);

    const fetchOne = (repeat: boolean): Promise<void> => {
      // Bornage défensif — au-delà d'une vingtaine d'ads distinctes déjà servies dans la
      // même session, on recommence à autoriser les répétitions plutôt que d'envoyer une
      // liste d'exclusion qui grossirait indéfiniment sur un scroll très long.
      const recentExcluded = repeat ? [] : Array.from(servedAdIdsRef.current).slice(-20);
      const excludeIds = recentExcluded.join(',');
      const qs = excludeIds ? `&exclude_ids=${encodeURIComponent(excludeIds)}` : '';
      return apiClient.get<AdData0 | null>(`/api/v1/ads/feed/next?placement=reels${qs}`)
        .then(r => {
          if (!mountedRef.current) return;
          // Aucune campagne restante hors exclusion (stock de pubs actives épuisé pour
          // cette session) — on retente UNE SEULE FOIS sans exclusion (repeat=true,
          // mieux vaut revoir une pub déjà vue que ne jamais en afficher), jamais plus :
          // sans ce garde-fou, un serveur qui n'a VRAIMENT aucune pub à offrir (campagnes
          // épuisées, même sans exclusion) faisait boucler cet appel indéfiniment et
          // immédiatement — des dizaines de requêtes par seconde vues dans les logs.
          if (!r.data) {
            if (excludeIds && !repeat) return fetchOne(true);
            return;
          }
          servedAdIdsRef.current.add(r.data.id);
          setAdSlots(prev => {
            const next = new Map(prev);
            next.set(slotIdx, r.data as AdData0);
            return next;
          });
        })
        .catch(() => {});
    };

    adQueueRef.current = adQueueRef.current
      .then(() => fetchOne(allowRepeat))
      .finally(() => { loadingAdSlotsRef.current.delete(slotIdx); });
  }, []);
  const [menuReel,      setMenuReel]      = useState<Reel | null>(null);
  const [editReel,      setEditReel]      = useState<Reel | null>(null);
  const [editCaption,   setEditCaption]   = useState('');
  const [editSaving,    setEditSaving]    = useState(false);
  const [fullEditReel,  setFullEditReel]  = useState<Reel | null>(null); // édition effets visuels
  const [loading,       setLoading]       = useState(seedReel.length === 0 && !params.initialReelId);
  const [refreshing,    setRefreshing]    = useState(false);
  const [hasMore,       setHasMore]       = useState(true);
  const [tab,           setTab]           = useState<'feed' | 'mine'>('feed');
  const [myId,          setMyId]          = useState<string | null>(null);
  const [myAvatar,      setMyAvatar]      = useState<string | null>(null);
  const [myInitial,     setMyInitial]     = useState<string>('M');
  const [currentIndex,  setCurrentIndex]  = useState(0);
  // Tant que true, AUCUN reel n'est actif (isActive forcé à false partout) et un
  // spinner plein écran masque le lecteur — évite qu'un autre reel que celui sur
  // lequel l'utilisateur a tapé depuis le feed ne démarre sa lecture pendant la
  // course entre l'injection/scroll vers la cible et la mise à jour effective de
  // currentIndex (setReels puis setCurrentIndex ne sont pas synchrones : un rendu
  // intermédiaire peut encore pointer sur l'ancien index). Initialisé à true dès
  // qu'on arrive avec une cible précise (cf. useFocusEffect ci-dessous), remis à
  // false seulement une fois que currentIndex pointe reellement sur targetId.
  const [awaitingTarget, setAwaitingTarget] = useState(!!params.initialReelId);
  // Tant que false, le tuto cadeau (VideoSlide → GiftHoldHint) reste masqué —
  // évite que les deux tutos d'onboarding se superposent à l'écran.
  const [swipeHintDone, setSwipeHintDone] = useState(false);
  const [listKey,       setListKey]       = useState('reels-0');
  const [screenFocused, setScreenFocused] = useState(true);
  const [muted,         setMuted]         = useState(false);
  // Avance automatique — état partagé entre le raccourci header (chevron) et le
  // toggle du menu Plus de chaque VideoSlide, tous les deux lus/écrits sur la
  // même clé storage : basculer l'un ou l'autre reste toujours synchronisé, et
  // un petit toast confirme le nouvel état à chaque bascule (peu importe lequel
  // des deux déclencheurs a été utilisé).
  const [autoAdvance,   setAutoAdvance]   = useState(() => storage.getBoolean(STORAGE_KEYS.REELS_AUTO_ADVANCE) ?? true);
  const toggleAutoAdvanceHeader = useCallback(() => {
    setAutoAdvance(v => {
      const next = !v;
      storage.setBoolean(STORAGE_KEYS.REELS_AUTO_ADVANCE, next);
      toastService.success(
        next ? 'Avance automatique activée' : 'Avance automatique désactivée',
        next ? 'Le reel suivant démarre seul à la fin de la vidéo.' : 'La vidéo reprend en boucle à la fin.',
      );
      return next;
    });
  }, []);
  const [searchOpen,    setSearchOpen]    = useState(false);
  // Pub vidéo de la grille recherche ouverte en plein écran avec son (via AdSlide,
  // le même composant que le feed principal) — clic simple qui ouvre le lien CTA
  // directement pour les pubs image.
  const [fullscreenAd,  setFullscreenAd]  = useState<AdData | null>(null);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<Reel[]>([]);
  const [searching,     setSearching]     = useState(false);
  // Reels tendance affichés par défaut à l'ouverture de la recherche (avant toute
  // frappe) — distincts de searchResults pour ne jamais les mélanger avec de vrais
  // résultats de recherche. Chargés une fois par ouverture, restent affichés
  // pendant la frappe jusqu'à ce que runSearch() renvoie de vrais résultats (jamais
  // d'écran vide entre "tendances" et "résultats" pendant la saisie).
  const [trendingReels,   setTrendingReels]   = useState<Reel[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  // Pagination scroll infini de la grille recherche — séparée pour tendances vs
  // résultats de recherche texte (deux sources de données, jamais mélangées).
  const [trendingHasMore, setTrendingHasMore] = useState(true);
  const [searchHasMore,   setSearchHasMore]   = useState(true);
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
  const trendingPageRef = useRef(1);
  const searchPageRef   = useRef(1);
  // Pubs de la grille recherche (placement="search") — état séparé de `adSlots`
  // (feed principal, placement="reels") pour ne jamais les mélanger.
  type SearchAdData = { id: string; title: string; description?: string; cta_text?: string; cta_url?: string; creative_url?: string; thumbnail_url?: string };
  const [searchAdSlots, setSearchAdSlots] = useState<Map<number, SearchAdData>>(new Map());
  const searchAdSlotsRef = useRef(searchAdSlots);
  searchAdSlotsRef.current = searchAdSlots;
  const loadingSearchAdSlotsRef = useRef<Set<number>>(new Set());
  const servedSearchAdIdsRef = useRef<Set<string>>(new Set());
  // Même sérialisation que loadAdForSlot (feed reels) — sans elle, les appels
  // multi-slots (voir les boucles `for` qui appellent loadSearchAdForSlot pour
  // plusieurs slots d'un coup) partent en parallèle avec la même exclusion et le
  // backend renvoie la même pub gagnante à tous les emplacements de la grille.
  const searchAdQueueRef = useRef<Promise<void>>(Promise.resolve());

  const loadSearchAdForSlot = useCallback((slotIdx: number, allowRepeat = false) => {
    if (loadingSearchAdSlotsRef.current.has(slotIdx) || searchAdSlotsRef.current.has(slotIdx)) return;
    loadingSearchAdSlotsRef.current.add(slotIdx);

    const fetchOne = (repeat: boolean): Promise<void> => {
      const recentExcluded = repeat ? [] : Array.from(servedSearchAdIdsRef.current).slice(-20);
      const excludeIds = recentExcluded.join(',');
      const qs = excludeIds ? `&exclude_ids=${encodeURIComponent(excludeIds)}` : '';
      return apiClient.get<SearchAdData | null>(`/api/v1/ads/feed/next?placement=search${qs}`)
        .then(r => {
          if (!mountedRef.current) return;
          if (!r.data) {
            if (excludeIds) return fetchOne(true);
            return;
          }
          servedSearchAdIdsRef.current.add(r.data.id);
          setSearchAdSlots(prev => {
            const next = new Map(prev);
            next.set(slotIdx, r.data as SearchAdData);
            return next;
          });
        })
        .catch(() => {});
    };

    searchAdQueueRef.current = searchAdQueueRef.current
      .then(() => fetchOne(allowRepeat))
      .finally(() => { loadingSearchAdSlotsRef.current.delete(slotIdx); });
  }, []);

  // Refs stables pour éviter les closures stales
  const reelsRef        = useRef<Reel[]>(seedReel.length > 0 ? seedReel : []);
  const hasMoreRef      = useRef(true);
  const pendingScrollIdx  = useRef<number | null>(null);
  const isScrollingRef    = useRef(false);
  const scrollLockTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { reelsRef.current = reels; }, [reels]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  // toRenderedIndex — convertit un index dans `reels` (liste pure) vers son
  // index réel dans feedWithAds (liste mélangée avec pubs, cf. feedWithAds
  // plus bas) : compte combien de pubs ont une position FIGÉE
  // (adSlotPositionsRef, peuplé par feedWithAds) strictement avant/à cet
  // index, et décale d'autant. Nécessaire pour toute navigation ciblée vers
  // un reel précis (deep link, retour sur l'écran, tap depuis le feed) — sans
  // cette conversion, on scrollerait vers le mauvais écran dès qu'une pub
  // précède le reel visé.
  const toRenderedIndex = useCallback((idx: number) => {
    let shift = 0;
    adSlots.forEach((_ad, slotIdx) => {
      const pos = adSlotPositionsRef.current.get(slotIdx);
      if (pos !== undefined && pos <= idx + shift) shift++;
    });
    return idx + shift;
  }, [adSlots]);

  // Quand la liste change, tenter de résoudre pendingTarget si onLayout l'a manqué
  useEffect(() => {
    const target = pendingTargetRef.current;
    if (!target) return;
    const idx = reels.findIndex(r => r.id === target.id);
    if (idx < 0) return; // pas encore là — attendre le prochain update
    pendingTargetRef.current = null;
    // scrollIdx (index dans feedWithAds, PAS idx qui est un index dans reels
    // seul) partout ici — currentIndex doit toujours représenter la position
    // réelle dans la liste RENDUE (avec pubs mélangées), c'est ce que compare
    // renderVideoSlide (index === currentIndex) pour savoir quel slide est
    // actif. Utiliser `idx` ferait pointer currentIndex sur le mauvais écran
    // dès qu'une pub précède le reel cible.
    const scrollIdx = toRenderedIndex(idx);
    currentIdxRef.current = scrollIdx;
    setCurrentIndex(scrollIdx);
    isScrollingRef.current = true;
    if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
    scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 600);
    listRef.current?.scrollToOffset({ offset: SCREEN_H * scrollIdx, animated: false });
  }, [reels, SCREEN_H, toRenderedIndex]);

  const toggleMute = useCallback(() => setMuted(v => !v), []);

  // Scroll direct par offset — verrou isScrollingRef pour bloquer onViewableItemsChanged
  const scrollToIdx = useCallback((index: number, animated = false) => {
    isScrollingRef.current = true;
    if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
    scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 400);
    listRef.current?.scrollToOffset({ offset: SCREEN_H * index, animated });
  }, [SCREEN_H]);

  // ── View tracking ─────────────────────────────────────────────────────────
  const sendViewForCurrent = useCallback(() => {
    const cur = currentReelRef.current;
    if (!cur || viewedReelsRef.current.has(cur.id)) return;
    const elapsed    = (Date.now() - cur.startTime) / 1000;
    const watchRatio = Math.min(elapsed / 30, 1.0);
    if (watchRatio >= 0.1) {
      viewedReelsRef.current.add(cur.id);
      reelService.recordView(cur.id, parseFloat(watchRatio.toFixed(2)), elapsed).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const list = reelsRef.current;
    const cur  = list[currentIndex];
    if (!cur) return;
    sendViewForCurrent();
    currentReelRef.current = { id: cur.id, startTime: Date.now() };
    // Prefetch uniquement le suivant — évite la cascade réseau au scroll rapide
    const next = list[currentIndex + 1];
    if (next?.thumbnail_url) Image.prefetch(next.thumbnail_url).catch(() => {});
  }, [currentIndex, sendViewForCurrent]);

  // ── Load ──────────────────────────────────────────────────────────────────
  // targetId : reel à afficher en priorité (peut changer à chaque navigation)
  // silent   : garder le contenu actuel visible pendant le chargement background
  const load = useCallback(async (silent = false, forceRefresh = false) => {
    if (!mountedRef.current) return;
    // Ne montrer le loading que si pas de contenu actuellement affiché
    if (!silent && reelsRef.current.length === 0) setLoading(true);
    pageRef.current = 1;
    isLoadingMoreRef.current = false;

    // Mode profil : GET /users/{id}/reels paginé — pas de pub, pas de "mes reels"
    // (tout ça n'a pas de sens hors du feed global).
    if (userMode) {
      try {
        const data = await userService.getUserReels(userMode, 1, USER_REELS_PAGE_LIMIT) as Reel[];
        if (!mountedRef.current) return;
        const filtered = (Array.isArray(data) ? data : []).filter((r: Reel) => (!!r.hls_url || !!r.mp4_url));
        setHasMore(filtered.length >= USER_REELS_PAGE_LIMIT);
        lastLoadedAtRef.current = Date.now();
        if (!silent) {
          currentIdxRef.current = 0;
          setCurrentIndex(0);
          setReels(filtered);
          viewedReelsRef.current = new Set();
        } else {
          const existingIds = new Set(reelsRef.current.map(r => r.id));
          const toAdd = filtered.filter(r => !existingIds.has(r.id));
          if (toAdd.length > 0) {
            const merged = [...reelsRef.current, ...toAdd];
            reelsRef.current = merged;
            setReels(merged);
          }
        }
      } catch {
        // garder les reels actuellement affichés
      } finally {
        if (mountedRef.current) setLoading(false);
      }
      return;
    }

    try {
      // refresh=true bypass le cache serveur du pool — soit un vrai rechargement
      // (non silencieux), soit un retour de focus qui demande explicitement du
      // contenu frais tout en restant silencieux (forceRefresh, cf. appelant).
      const data = await reelService.getFeed({ page: 1, refresh: !silent || forceRefresh });
      if (!mountedRef.current) return;

      const filtered = (data.items ?? []).filter((r: Reel) => (!!r.hls_url || !!r.mp4_url));

      setHasMore(data.has_more);
      lastLoadedAtRef.current = Date.now();

      if (!silent) {
        // CAS FOOTER — reset complet, index 0. adSlots/adSlotPositionsRef
        // réinitialisés avec `reels` : une position figée pour l'ANCIEN reels
        // (avant ce reset) n'a plus de sens une fois `reels` entièrement
        // remplacé — sans ce reset, une pub pourrait réapparaître à une
        // position qui ne correspond plus à rien de cohérent dans la nouvelle
        // liste.
        currentIdxRef.current = 0;
        setCurrentIndex(0);
        setReels(filtered);
        setAdSlots(new Map());
        adSlotPositionsRef.current = new Map();
        servedAdIdsRef.current = new Set();
        viewedReelsRef.current = new Set();
      } else {
        // CAS FEED — enrichir la liste sans toucher à l'index ni au scroll
        // pendingTargetRef + useEffect[reels] gèrent la navigation vers le bon reel
        const existingIds = new Set(reelsRef.current.map(r => r.id));
        const toAdd = filtered.filter(r => !existingIds.has(r.id));
        if (toAdd.length > 0) {
          const merged = [...reelsRef.current, ...toAdd];
          reelsRef.current = merged;
          setReels(merged);
        }
      }
      // Charger la pub du premier emplacement en arrière-plan — les emplacements suivants
      // sont chargés à la demande (voir loadAdForSlot / useEffect[reels]) pour ne jamais
      // répéter la même ad partout dans le feed.
      loadAdForSlot(0);

      // Charger myId + mes reels en parallèle sans bloquer l'affichage
      authService.getMe().then(me => {
        if (!mountedRef.current) return;
        setMyId(String(me.id));
        setMyAvatar(me.avatar_url ?? null);
        const label = me.display_name || me.first_name || me.username || 'M';
        setMyInitial(label[0].toUpperCase());
        userService.getUserReels(String(me.id))
          .then(mine => { if (mountedRef.current) setMyReels(Array.isArray(mine) ? mine : []); })
          .catch(() => {});
      }).catch(() => {});

    } catch {
      // Erreur réseau — garder les reels actuellement affichés (ne pas mettre [])
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []); // pas de dépendances sur params — targetId passé en argument

  // Pull-to-refresh — uniquement possible tout en haut du 1er reel (RefreshControl
  // de RN ne se déclenche que si l'utilisateur continue de tirer après l'offset 0,
  // donc aucun conflit avec le swipe vertical normal entre reels). silent=false +
  // forceRefresh=true : même reset complet (index 0, nouvelle liste) qu'un premier
  // chargement, mais en bypassant le cache serveur du pool comme un vrai refresh
  // explicite (cf. load(), refresh=!silent || forceRefresh).
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(false, true).finally(() => { if (mountedRef.current) setRefreshing(false); });
  }, [load]);

  // ── Load more ─────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || !mountedRef.current) return;
    isLoadingMoreRef.current = true;
    try {
      const nextPage = pageRef.current + 1;

      if (userMode) {
        const data = await userService.getUserReels(userMode, nextPage, USER_REELS_PAGE_LIMIT) as Reel[];
        if (!mountedRef.current) return;
        const newReels = (Array.isArray(data) ? data : []).filter((r: Reel) => (!!r.hls_url || !!r.mp4_url));
        setReels(prev => {
          const ids = new Set(prev.map(r => r.id));
          return [...prev, ...newReels.filter((r: Reel) => !ids.has(r.id))];
        });
        pageRef.current = nextPage;
        setHasMore(newReels.length >= USER_REELS_PAGE_LIMIT);
        return;
      }

      const data = await reelService.getFeed({ page: nextPage });
      if (!mountedRef.current) return;
      const newReels = (data.items ?? []).filter((r: Reel) => (!!r.hls_url || !!r.mp4_url));
      setReels(prev => {
        const ids = new Set(prev.map(r => r.id));
        return [...prev, ...newReels.filter((r: Reel) => !ids.has(r.id))];
      });
      pageRef.current = nextPage;
      setHasMore(data.has_more);
    } catch { /* silencieux */ }
    finally { isLoadingMoreRef.current = false; }
  }, [userMode]);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    searchReqRef.current = term;
    searchPageRef.current = 1;
    if (!term) { setSearchResults([]); setSearchHasMore(true); return; }
    if (!mountedRef.current) return;
    setSearching(true);
    try {
      const data = await reelService.search(term, 1, SEARCH_PAGE_LIMIT);
      // Ignore une réponse en retard (frappe rapide) qui ne correspond plus au terme actuel
      if (mountedRef.current && searchReqRef.current === term) {
        setSearchResults(data.items.filter((r: Reel) => (!!r.hls_url || !!r.mp4_url)));
        setSearchHasMore(data.has_more);
      }
    } catch {
      if (mountedRef.current && searchReqRef.current === term) { setSearchResults([]); setSearchHasMore(false); }
    } finally {
      if (mountedRef.current && searchReqRef.current === term) setSearching(false);
    }
  }, []);

  const onSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => runSearch(text), 350);
  }, [runSearch]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchQuery('');
    setSearchResults([]);
    setSearchAdSlots(new Map());
    loadingSearchAdSlotsRef.current.clear();
    trendingPageRef.current = 1;
    searchPageRef.current = 1;
    setTrendingHasMore(true);
    setSearchHasMore(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);

    // Charge le 1er lot de reels tendance à l'ouverture — affichés par défaut
    // avant toute frappe, et gardés visibles PENDANT la frappe (voir le rendu plus
    // bas) jusqu'à ce que de vrais résultats de recherche arrivent. L'API tendance
    // ne renvoie pas hls_url/author complets (contrat différent de la recherche) —
    // filtré aux champs sûrs pour l'affichage en grille ; le clic (pickSearchResult)
    // refetch l'objet complet via getById avant de lancer la lecture.
    // Pagination scroll infini gérée par loadMoreSearchGrid (onEndReached).
    setLoadingTrending(true);
    searchService.getTrendingReels(1, SEARCH_PAGE_LIMIT)
      .then(({ items, hasMore }) => { setTrendingReels(Array.isArray(items) ? items : []); setTrendingHasMore(hasMore); })
      .catch(() => { setTrendingReels([]); setTrendingHasMore(false); })
      .finally(() => setLoadingTrending(false));

    // Première pub visible dès l'ouverture, sans attendre un scroll — l'utilisateur
    // signalait justement que les pubs n'apparaissaient qu'après avoir paginé.
    loadSearchAdForSlot(0);
  }, [loadSearchAdForSlot]);

  const closeSearch = useCallback(() => {
    if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    Keyboard.dismiss();
  }, []);

  // Scroll infini de la grille recherche — pagine la source actuellement affichée
  // (résultats texte si une recherche est en cours, sinon tendances), et charge la
  // pub du prochain emplacement dès qu'assez de cartes existent pour le remplir.
  const loadMoreSearchGrid = useCallback(() => {
    if (loadingMoreSearch) return;
    const term = searchQuery.trim();
    const isSearchMode = term.length > 0;
    if (isSearchMode) {
      if (!searchHasMore || searching) return;
      setLoadingMoreSearch(true);
      const nextPage = searchPageRef.current + 1;
      reelService.search(term, nextPage, SEARCH_PAGE_LIMIT)
        .then(data => {
          if (searchReqRef.current !== term) return;
          searchPageRef.current = nextPage;
          setSearchResults(prev => {
            const ids = new Set(prev.map(r => r.id));
            const merged = [...prev, ...data.items.filter((r: Reel) => (!!r.hls_url || !!r.mp4_url) && !ids.has(r.id))];
            const totalSlots = Math.floor(merged.length / SEARCH_AD_INTERVAL);
            for (let s = 0; s < totalSlots; s++) loadSearchAdForSlot(s);
            return merged;
          });
          setSearchHasMore(data.has_more);
        })
        .catch(() => setSearchHasMore(false))
        .finally(() => setLoadingMoreSearch(false));
    } else {
      if (!trendingHasMore || loadingTrending) return;
      setLoadingMoreSearch(true);
      const nextPage = trendingPageRef.current + 1;
      searchService.getTrendingReels(nextPage, SEARCH_PAGE_LIMIT)
        .then(({ items, hasMore }) => {
          trendingPageRef.current = nextPage;
          setTrendingReels(prev => {
            const ids = new Set(prev.map(r => r.id));
            const merged = [...prev, ...items.filter((r: any) => !ids.has(r.id))];
            const totalSlots = Math.floor(merged.length / SEARCH_AD_INTERVAL);
            for (let s = 0; s < totalSlots; s++) loadSearchAdForSlot(s);
            return merged;
          });
          setTrendingHasMore(hasMore);
        })
        .catch(() => setTrendingHasMore(false))
        .finally(() => setLoadingMoreSearch(false));
    }
  }, [loadingMoreSearch, searchQuery, searchHasMore, searching, trendingHasMore, loadingTrending, loadSearchAdForSlot]);

  // Clic sur une carte "Mes Reels" → page dédiée plein écran
  const handlePlayFromMine = useCallback((r: Reel) => {
    nav.navigate('ReelPlayer', { reel: r });
  }, [nav]);

  const pickSearchResult = useCallback(async (r: Reel) => {
    closeSearch();
    const idx = reelsRef.current.findIndex(x => x.id === r.id);
    if (idx >= 0) {
      // scrollIdx (index dans feedWithAds) — jamais idx (index dans reels
      // seul), voir toRenderedIndex.
      const scrollIdx = toRenderedIndex(idx);
      currentIdxRef.current = scrollIdx;
      setCurrentIndex(scrollIdx);
      setTimeout(() => listRef.current?.scrollToIndex({ index: scrollIdx, animated: false }), 50);
      return;
    }
    // Les reels tendance (getTrendingReels) n'ont pas hls_url/mp4_url/author
    // complets — refetch l'objet complet avant de le jouer pour ne jamais
    // lancer une lecture avec un flux vidéo manquant.
    let full = r;
    if (!r.hls_url && !r.mp4_url) {
      try { full = await reelService.getById(r.id); } catch { /* joue r tel quel, best-effort */ }
    }
    setReels(prev => [full, ...prev.filter(x => x.id !== full.id)]);
    // toRenderedIndex(0) : le reel injecté en tête de `reels` peut se
    // retrouver à un index > 0 dans feedWithAds si une pub a sa position
    // figée à 0 — jamais supposer que index 0 dans reels == index 0 rendu.
    const scrollIdx = toRenderedIndex(0);
    currentIdxRef.current = scrollIdx;
    setCurrentIndex(scrollIdx);
    // Sans ce scroll, le reel est bien injecté en tête de `reels` mais la FlatList
    // reste visuellement à la position de scroll où l'utilisateur était avant
    // d'ouvrir la recherche — currentIndex changeait déjà côté état React, mais
    // rien ne faisait bouger l'écran affiché (c'était le bug : le reel choisi
    // n'apparaissait jamais). setTimeout laisse le nouvel item être rendu par la
    // FlatList (après le setReels ci-dessus) avant de tenter le scroll vers lui.
    setTimeout(() => listRef.current?.scrollToOffset({ offset: SCREEN_H * scrollIdx, animated: false }), 50);
  }, [closeSearch, toRenderedIndex, SCREEN_H]);

  // ── BackHandler : retour depuis "mes reels" → feed au lieu de quitter ─────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'mine') { setTab('feed'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [tab]);

  // ── Mount / Unmount — cleanup uniquement ─────────────────────────────────
  // Le chargement est géré par useFocusEffect ci-dessous (évite le double load)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      sendViewForCurrent();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Focus ─────────────────────────────────────────────────────────────────
  // paramsRef.current est toujours frais (mis à jour à chaque render, avant useFocusEffect)
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);

    const p          = paramsRef.current;
    const targetId   = p.initialReelId;
    const targetReel = p.initialReel as Reel | undefined;

    if (p.reelPublished) {
      nav.setParams({ reelPublished: undefined } as any);
      load(false);
      didFocusOnceRef.current = true;
      return () => {
        setScreenFocused(false);
        try { activePlayerRef.current?.pause(); } catch {}
        requestAnimationFrame(() => sendViewForCurrent());
      };
    }

    if (targetId) {
      // CAS FEED — effacer les params tout de suite
      nav.setParams({ initialReelId: undefined, initialReel: undefined } as any);
      // Bloque toute lecture tant que currentIndex ne pointe pas confirmé sur
      // targetId (cf. useEffect dédié plus bas, qui le repasse à false).
      awaitingTargetIdRef.current = targetId;
      setAwaitingTarget(true);

      if (targetReel?.hls_url || targetReel?.mp4_url) {
        // Même logique que Facebook/Instagram : le reel cliqué DEPUIS LE FEED
        // devient toujours le point de départ en position 0, qu'une version de
        // lui existe déjà ailleurs dans reelsRef ou non — jamais de recherche
        // par id (findIndex) dont le résultat servirait à choisir QUOI jouer.
        // Une ancienne entrée (ex: préchargée en arrière-plan, potentiellement
        // avec un autre hls_url/mp4_url ou une autre miniature) ne doit jamais
        // pouvoir se substituer à l'objet réellement cliqué ("mauvaise vidéo
        // qui joue") — on la retire simplement pour éviter un doublon, la
        // valeur AFFICHÉE est toujours targetReel. toRenderedIndex(0) : peut
        // se retrouver à un index > 0 dans feedWithAds si une pub a sa
        // position figée à 0 — jamais supposer index 0 rendu == index 0 reels.
        //
        // Liste repartie à [targetReel] SEUL (pas fusionnée avec reelsRef.current) :
        // le Tab.Navigator garde ReelsScreen monté en arrière-plan entre deux
        // visites (pas de vrai démontage) — fusionner avec l'ancienne liste
        // accumulait les reels d'un aller-retour au suivant (Feed→Reel A→Feed→
        // Reel B gardait A derrière B, puis un 3e passage gardait A et B, etc.).
        // Un clic depuis le feed est TOUJOURS un nouveau départ, comme sur
        // Facebook/Instagram — la file suivante se reconstruit derrière via
        // load(true) juste en dessous, jamais à partir de l'ancienne session.
        //
        // adSlots/adSlotPositionsRef réinitialisés pour la même raison : une
        // position de pub figée pour l'ancienne liste ne correspond plus à
        // rien de cohérent dans la nouvelle, et toRenderedIndex(0) calculé
        // avec ces positions périmées renvoyait un index faux ("perte de
        // l'index").
        setAdSlots(new Map());
        adSlotPositionsRef.current = new Map();
        servedAdIdsRef.current = new Set();
        const injected = [targetReel];
        reelsRef.current = injected;
        setReels(injected);
        const scrollIdx = toRenderedIndex(0);
        currentIdxRef.current = scrollIdx;
        setCurrentIndex(scrollIdx);
        isScrollingRef.current = true;
        if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
        scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 1200);
        listRef.current?.scrollToOffset({ offset: SCREEN_H * scrollIdx, animated: false });
        // File suivante chargée en arrière-plan derrière ce premier reel — pas
        // besoin d'attendre pour afficher/jouer celui-ci. silent=true (comme
        // le CAS FEED existant) : enrichit la liste sans toucher à l'index ni
        // au scroll déjà positionnés ci-dessus.
        load(true);
      } else {
        // Pas d'objet reel — charger en background
        pendingTargetRef.current = { id: targetId };
        load(true);
      }
    } else {
      // CAS FOOTER — navigation normale
      if (!didFocusOnceRef.current) {
        // Premier montage : si RootNavigator a déjà préchargé la 1ère page (et
        // commencé à télécharger la 1ère vidéo) dès l'entrée en session — voir
        // reelsPrefetchService, démarré pendant que l'utilisateur était encore
        // sur Feed — on réutilise ce résultat au lieu de refetcher depuis zéro :
        // la liste est déjà là, la vidéo déjà en cours/fin de téléchargement.
        const prefetched = userMode ? null : consumeReelsPrefetch();
        if (prefetched) {
          const filtered = (prefetched.items ?? []).filter((r: Reel) => (!!r.hls_url || !!r.mp4_url));
          setHasMore(prefetched.has_more);
          lastLoadedAtRef.current = Date.now();
          currentIdxRef.current = 0;
          setCurrentIndex(0);
          setReels(filtered);
          viewedReelsRef.current = new Set();
          setLoading(false);
          loadAdForSlot(0);
          // Même suite que load() : myId/avatar/mes-reels en parallèle, sans
          // bloquer l'affichage (voir load() plus haut pour la version complète).
          authService.getMe().then(me => {
            if (!mountedRef.current) return;
            setMyId(String(me.id));
            setMyAvatar(me.avatar_url ?? null);
            const label = me.display_name || me.first_name || me.username || 'M';
            setMyInitial(label[0].toUpperCase());
            userService.getUserReels(String(me.id))
              .then(mine => { if (mountedRef.current) setMyReels(Array.isArray(mine) ? mine : []); })
              .catch(() => {});
          }).catch(() => {});
        } else {
          // Rien de préchargé (prefetch pas encore terminé, ou raté) — fetch
          // normal, prioritaire et immédiat.
          load(false);
        }
      } else {
        // Tout retour sur l'onglet (changement d'onglet, ou reprise après
        // arrière-plan) : le reel affiché à l'écran ne doit JAMAIS être
        // interrompu ni remplacé — il continue sa lecture sans coupure,
        // exactement comme s'il n'y avait jamais eu de blur. Le contenu frais
        // (refresh=true, bypass le cache serveur du pool) s'ajoute en
        // silence en fin de liste (silent=true : pas de reset d'index, pas
        // de remplacement de reelsRef) — jamais visible tant qu'on n'a pas
        // scrollé jusque-là, comme les apps de ce type. Avant ce fix, le
        // reset complet (currentIndex→0, setReels(nouvelle liste)) forçait
        // l'ancien reel affiché à rejouer brièvement (isActive redevient
        // true, relance la lecture) puis à disparaître dès que le nouveau
        // contenu écrasait la liste — flash visuel avant que le bon reel
        // (souvent différent) ne prenne sa place.
        load(true, true);
      }
    }

    didFocusOnceRef.current = true;
    return () => {
      setScreenFocused(false);
      try { activePlayerRef.current?.pause(); } catch {}
      requestAnimationFrame(() => sendViewForCurrent());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  // ── reelPublished via useEffect (cas où l'écran est déjà focus) ───────────
  useEffect(() => {
    if (params.reelPublished) {
      nav.setParams({ reelPublished: undefined } as any);
      load(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.reelPublished]);

  // ── Edit / Delete ─────────────────────────────────────────────────────────
  const handleDeleteReel = useCallback((reel: Reel) => {
    setMenuReel(null);
    showConfirm('Supprimer ce reel ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await reelService.delete(reel.id);
            setMyReels(prev => prev.filter(r => r.id !== reel.id));
            setReels(prev => prev.filter(r => r.id !== reel.id));
          } catch (e: any) {
            toastService.error('Erreur', e?.message ?? 'Impossible de supprimer.');
          }
        },
      },
    ]);
  }, []);

  const handleToggleReelComments = useCallback(async (reel: Reel) => {
    setMenuReel(null);
    try {
      const res = await socialService.toggleEntityComments('reel', reel.id);
      setMyReels(prev => prev.map(r => r.id === reel.id ? { ...r, comments_disabled: res.comments_disabled } : r));
      setReels(prev => prev.map(r => r.id === reel.id ? { ...r, comments_disabled: res.comments_disabled } : r));
    } catch { /**/ }
  }, []);

  const handleOpenEdit = useCallback((reel: Reel) => {
    setMenuReel(null);
    setEditCaption(reel.caption ?? '');
    setEditReel(reel);
  }, []);

  const handleOpenFullEdit = useCallback((reel: Reel) => {
    setMenuReel(null);
    setFullEditReel(reel);
  }, []);

  const handleFullEditConfirm = useCallback(async (result: ReelEditResult, reel: Reel) => {
    try {
      await reelService.update(reel.id, {
        caption:       reel.caption ?? undefined,
        filter:        result.filter !== 'original' ? result.filter : undefined,
        text_layers:   result.layers.length   > 0 ? JSON.stringify(result.layers)    : undefined,
        sticker_layers: result.stickers.length > 0 ? JSON.stringify(result.stickers) : undefined,
        draw_layers:   result.drawings.length > 0 ? JSON.stringify(result.drawings)  : undefined,
        video_adjust:  Object.values(result.adjust).some(v => v !== 0) ? JSON.stringify(result.adjust) : undefined,
      });
      // Mettre à jour localement
      const patch = {
        filter_name:    result.filter !== 'original' ? result.filter : null,
        text_layers:    result.layers.length   > 0 ? JSON.stringify(result.layers)    : null,
        sticker_layers: result.stickers.length > 0 ? JSON.stringify(result.stickers) : null,
        draw_layers:    result.drawings.length > 0 ? JSON.stringify(result.drawings)  : null,
        video_adjust:   Object.values(result.adjust).some(v => v !== 0) ? JSON.stringify(result.adjust) : null,
      };
      setReels(prev  => prev.map(r  => r.id === reel.id ? { ...r, ...patch } : r));
      setMyReels(prev => prev.map(r => r.id === reel.id ? { ...r, ...patch } : r));
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? 'Impossible de sauvegarder les modifications.');
    } finally {
      setFullEditReel(null);
    }
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editReel) return;
    setEditSaving(true);
    try {
      const updated = await reelService.update(editReel.id, { caption: editCaption.trim() });
      setMyReels(prev => prev.map(r => r.id === updated.id ? updated : r));
      setReels(prev => prev.map(r => r.id === updated.id ? updated : r));
      setEditReel(null);
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? 'Impossible de modifier.');
    } finally {
      setEditSaving(false);
    }
  }, [editReel, editCaption]);

  // ── Navigation reel suivant ───────────────────────────────────────────────
  const goNextReel = useCallback(() => {
    const next = currentIdxRef.current + 1;
    // feedWithAdsRef (pas reelsRef) : sinon impossible d'avancer vers un index
    // au-delà des reels purs, donc vers une pub mélangée dans le flux.
    if (next < feedWithAdsRef.current.length) {
      currentIdxRef.current = next;
      setCurrentIndex(next);
      setTimeout(() => listRef.current?.scrollToIndex({ index: next, animated: true }), 0);
    }
  }, []);

  // ── Viewability — détection en temps réel via onScroll ───────────────────
  const onViewableItemsChanged = useCallback(() => {}, []); // gardé pour éviter l'erreur FlatList

  const onScrollUpdate = useCallback((offsetY: number) => {
    if (isScrollingRef.current) {
      // Relâcher le verrou dès que l'offset correspond exactement à l'index cible
      const expected = SCREEN_H * currentIdxRef.current;
      if (Math.abs(offsetY - expected) < 2) isScrollingRef.current = false;
      return;
    }
    const idx = Math.round(offsetY / SCREEN_H);
    // feedWithAdsRef (pas reelsRef) : bounded est un index dans la liste
    // RENDUE (avec pubs mélangées), jamais dans reels seul — sinon on ne
    // pourrait jamais atteindre/détecter l'arrêt sur une pub positionnée
    // au-delà de reels.length.
    const bounded = Math.max(0, Math.min(idx, feedWithAdsRef.current.length - 1));
    if (bounded === currentIdxRef.current) return;

    try { activePlayerRef.current?.pause(); } catch {}

    currentIdxRef.current = bounded;
    setCurrentIndex(bounded);

    sendViewForCurrent();
    // item à cet index peut être une pub (_isAd) — currentReelRef ne doit
    // suivre que de vrais reels, jamais une entrée pub.
    const item = feedWithAdsRef.current[bounded] as any;
    if (item && !item._isAd) currentReelRef.current = { id: item.id, startTime: Date.now() };

    // Déclenche le chargement de la page suivante en approchant de la fin des
    // reels RÉELLEMENT chargés (pubs mélangées exclues du calcul — sur une
    // pub, on ne sait pas "combien de reels restent" par position, donc on
    // déclenche par prudence : un appel loadMore en trop est sans risque,
    // loadMore est déjà protégé contre les doublons via isLoadingMoreRef).
    const reelIdx = item && !item._isAd ? reelsRef.current.findIndex(r => r.id === item.id) : -1;
    const nearEnd = item?._isAd || (reelIdx >= 0 && reelIdx >= reelsRef.current.length - 3);
    if (nearEnd) loadMoreRef.current();
  }, [SCREEN_H, sendViewForCurrent]);

  // ── Callbacks stables ─────────────────────────────────────────────────────
  const onAuthorPress = useCallback((userId: string) => nav.navigate('UserProfile', { userId }), [nav]);

  // Position MÉLANGÉE dans le flux (comme Facebook), mais FIGÉE une seule
  // fois par slot (voir adSlotPositionsRef) — jamais recalculée après coup.
  // Avant ce fix : entrelacée tous les AD_INTERVAL reels via (i+1) %
  // AD_INTERVAL, recalculé à CHAQUE changement de reels/adSlots — la position
  // d'une pub déjà affichée pouvait donc changer d'un render à l'autre,
  // source des bugs de navigation ciblée ("clique sur un reel, un autre
  // s'ouvre") et de décalage d'index (d'où le passage temporaire à "toujours
  // en fin de liste"). Ici, chaque slot calcule sa position une seule fois
  // (hash déterministe de ad.id+slotIdx, jamais Math.random — un même slot
  // retombe toujours sur la même position), bornée à la taille de `reels` au
  // moment de sa création, puis cette position est figée pour toujours dans
  // adSlotPositionsRef : un nouveau chargement de reels ne peut plus jamais
  // déplacer une pub déjà positionnée, seulement en ajouter de nouvelles dans
  // la zone fraîchement chargée.
  const feedWithAds = useMemo(() => {
    if (userMode || adSlots.size === 0) return reels;

    adSlots.forEach((ad, slotIdx) => {
      if (adSlotPositionsRef.current.has(slotIdx)) return;
      const h = hashCode(`${ad.id}:${slotIdx}`);
      // +1 : autorise la toute dernière position (après le dernier reel actuel),
      // jamais au-delà — reels.length reflète ici la taille au moment précis où
      // ce slot est vu pour la première fois, jamais une valeur future.
      const pos = reels.length > 0 ? h % (reels.length + 1) : 0;
      adSlotPositionsRef.current.set(slotIdx, pos);
    });

    const withAds = [...reels];
    const toInsert = Array.from(adSlots.entries())
      .map(([slotIdx, ad]) => ({ ad, slotIdx, pos: adSlotPositionsRef.current.get(slotIdx)! }))
      // Décroissant : chaque insert() ne doit jamais décaler l'index d'une
      // insertion déjà faite dans cette même passe (même technique que
      // InjectionPlanner.maybe_inject_ads côté backend).
      .sort((a, b) => b.pos - a.pos);
    for (const { ad, slotIdx, pos } of toInsert) {
      withAds.splice(pos, 0, { _isAd: true, id: `ad-${ad.id}-${slotIdx}`, ad } as any);
    }
    return withAds;
  }, [reels, adSlots, userMode]);

  // Lu par les callbacks figés en useCallback([]) (goNextReel, onScrollUpdate)
  // qui ne peuvent pas dépendre de feedWithAds sans changer de référence à
  // chaque nouvelle pub chargée — toujours à jour via ce ref. Remplace les
  // anciennes bornes sur reelsRef.current.length, qui empêchaient d'avancer
  // vers un index au-delà des reels purs (donc vers une pub mélangée dans le
  // flux, ou même simplement groupée en fin de liste avant ce fix).
  const feedWithAdsRef = useRef(feedWithAds);
  feedWithAdsRef.current = feedWithAds;

  // Libère awaitingTarget dès que currentIndex pointe confirmé sur le reel
  // demandé — re-tenté à chaque changement de currentIndex/feedWithAds (le
  // scroll vers la cible peut prendre plusieurs rendus : injection, puis
  // scrollToOffset, puis le rendu qui en résulte). Sécurité : relâche aussi
  // après un court délai même sans correspondance exacte (ex. reel introuvable
  // après chargement complet) pour ne jamais bloquer l'écran indéfiniment.
  useEffect(() => {
    if (!awaitingTarget) return;
    const targetId = awaitingTargetIdRef.current;
    if (!targetId || feedWithAds[currentIndex]?.id === targetId) {
      setAwaitingTarget(false);
      return;
    }
    const timer = setTimeout(() => setAwaitingTarget(false), 2500);
    return () => clearTimeout(timer);
  }, [awaitingTarget, currentIndex, feedWithAds]);

  // Le slide courant est-il une pub ? AdSlide affiche déjà son propre bandeau
  // "ANNONCE" / "Passer" à cette hauteur — le header global (retour + icônes)
  // doit s'effacer pour ne pas se superposer avec lui.
  const currentIsAd = !!(feedWithAds[currentIndex] as any)?._isAd;

  // Précharge l'ad de CHAQUE emplacement pas encore rempli — pour qu'elles soient
  // prêtes avant que l'utilisateur y arrive en scrollant, sans jamais réutiliser la
  // même ad que les emplacements précédents.
  // Le `break` précédent ne lançait qu'UN SEUL chargement par passage de cet effet ;
  // or l'effet ne se redéclenche qu'à chaque changement de reels.length (une page de
  // pagination). Si une page ajoute plusieurs nouveaux slots d'un coup (page >
  // AD_INTERVAL reels), seul le premier était jamais chargé — les slots suivants
  // restaient vides en permanence et n'affichaient donc aucune pub (bug corrigé ici :
  // "plusieurs pubs ne s'affichent pas"). loadAdForSlot est déjà protégé par
  // loadingAdSlotsRef/adSlotsRef, donc lancer tous les slots manquants ici ne
  // duplique jamais une requête ni ne recharge un slot déjà rempli.
  useEffect(() => {
    if (userMode) return;
    const totalSlots = Math.floor(reels.length / AD_INTERVAL);
    for (let s = 0; s < totalSlots; s++) {
      if (!adSlotsRef.current.has(s) && !loadingAdSlotsRef.current.has(s)) {
        loadAdForSlot(s);
      }
    }
  }, [reels.length, userMode, loadAdForSlot]);

  // Revalidation périodique des slots pub déjà chargés — jamais le slot
  // actuellement regardé ni ses voisins immédiats (PRELOAD_WINDOW), pour ne
  // jamais changer une pub sous les yeux de l'utilisateur (même règle que le
  // cache vidéo : aucune bascule de contenu en pleine vue, uniquement avant
  // qu'un slot ne devienne pertinent). La position RENDUE d'un slot pub est
  // lue depuis adSlotPositionsRef (figée par feedWithAds), jamais recalculée
  // ici — les pubs sont mélangées dans le flux, pas forcément en fin de liste.
  useEffect(() => {
    if (userMode) return;
    const timer = setInterval(() => {
      adSlotsRef.current.forEach((_, slotIdx) => {
        const renderedIndex = adSlotPositionsRef.current.get(slotIdx);
        if (renderedIndex === undefined) return;
        if (Math.abs(renderedIndex - currentIndex) <= PRELOAD_WINDOW) return;
        if (loadingAdSlotsRef.current.has(slotIdx)) return;
        setAdSlots(prev => {
          if (!prev.has(slotIdx)) return prev;
          const next = new Map(prev);
          next.delete(slotIdx);
          return next;
        });
        // adSlotsRef (lu par loadAdForSlot) n'est resynchronisé qu'au rendu
        // suivant de ce composant, pas de façon synchrone ici — un appel
        // immédiat verrait donc encore l'ancien ref et refuserait de recharger
        // (adSlotsRef.current.has(slotIdx) === true). setTimeout(0) laisse le
        // rendu déclenché par setAdSlots ci-dessus se produire d'abord.
        setTimeout(() => loadAdForSlot(slotIdx), 0);
      });
    }, AD_SLOT_REVALIDATE_MS);
    return () => clearInterval(timer);
  }, [userMode, reels.length, currentIndex, loadAdForSlot]);

  const renderVideoSlide = useCallback(({ item, index }: { item: any; index: number }) => {
    if (item._isAd) {
      return (
        <AdSlide
          ad={item.ad}
          isActive={index === currentIndex && screenFocused && !fullscreenAd && !searchOpen && !awaitingTarget}
          muted={muted}
          screenW={SCREEN_W}
          screenH={SCREEN_H}
          insetTop={insets.top}
          insetBottom={insets.bottom}
          hasTabBar
          ui={ui}
          onAuthorPress={onAuthorPress}
          onEnd={goNextReel}
        />
      );
    }
    return (
      <VideoSlide
        reel={item}
        isActive={index === currentIndex && screenFocused && !fullscreenAd && !searchOpen && !awaitingTarget}
        isPreload={Math.abs(index - currentIndex) <= PRELOAD_WINDOW && index !== currentIndex}
        preloadDistance={Math.abs(index - currentIndex)}
        isCachePriority={Math.abs(index - currentIndex) <= (isWifi ? CACHE_PRELOAD_WINDOW_WIFI : CACHE_PRELOAD_WINDOW) && index !== currentIndex}
        isWifi={isWifi}
        networkQuality={networkQuality}
        muted={muted}
        screenW={SCREEN_W}
        screenH={SCREEN_H}
        insetBottom={insets.bottom}
        colors={colors}
        currentUserId={myId ?? undefined}
        currentUserAvatar={myAvatar ?? undefined}
        currentUserInitial={myInitial}
        onAuthorPress={onAuthorPress}
        onEnd={goNextReel}
        activePlayerRef={activePlayerRef}
        audioOwnerRef={audioOwnerRef}
        ui={ui}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={toggleAutoAdvanceHeader}
        giftHintEnabled={swipeHintDone}
        reelsShowInterface={reelsShowInterface}
      />
    );
  }, [currentIndex, screenFocused, fullscreenAd, searchOpen, awaitingTarget, muted, insets.bottom, colors, myId, myAvatar, myInitial, toggleMute, onAuthorPress, goNextReel, SCREEN_W, SCREEN_H, isWifi, ui, autoAdvance, toggleAutoAdvanceHeader, swipeHintDone, reelsShowInterface]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading && reels.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ReelLogoLoader />
      </View>
    );
  }

  // ── Render: empty ─────────────────────────────────────────────────────────
  if (reels.length === 0 && tab === 'feed') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        {/* Bouton retour */}
        <BackButton onPress={() => nav.goBack()} />
        {/* Contenu vide centré */}
        <View style={s.emptyState}>
          <View style={[s.emptyIconWrap, { backgroundColor: colors.primary + '14' }]}>
            <Icon name="film" size={30} color={colors.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucun reel pour le moment</Text>
          <Text style={[s.emptyBody, { color: colors.textTertiary }]}>
            Sois le premier à en publier un.
          </Text>
          <TouchableOpacity
            style={[s.emptyCta, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => nav.navigate('CreateReel')}
          >
            <Icon name="plus" size={18} color="#fff" />
            <Text style={s.emptyCtaText}>Créer un reel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: Mes reels ─────────────────────────────────────────────────────
  if (tab === 'mine') {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        <View style={[s.mineHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 14 }]}>
          <BackButton onPress={() => setTab('feed')} />
          <View style={{ flex: 1 }}>
            <Text style={[s.mineHeaderTitle, { color: colors.textPrimary }]}>Mes Reels</Text>
            {myReels.length > 0 && (
              <Text style={[s.mineHeaderSub, { color: colors.textTertiary }]}>{myReels.length} vidéo{myReels.length > 1 ? 's' : ''}</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => nav.navigate('CreateReel')} style={[s.mineCreateBtn, { backgroundColor: colors.primary }]} activeOpacity={0.85}>
            <Icon name="plus" size={18} color="#fff" />
            <Text style={s.mineCreateBtnText}>Nouveau</Text>
          </TouchableOpacity>
        </View>

        {myReels.length === 0 ? (
          <View style={s.emptyState}>
            <View style={[s.emptyIconWrap, { backgroundColor: colors.primary + '14' }]}>
              <Icon name="film" size={30} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucun reel</Text>
            <Text style={[s.emptyBody, { color: colors.textTertiary }]}>
              Publie ton premier reel pour le voir apparaître ici.
            </Text>
            <TouchableOpacity style={[s.emptyCta, { backgroundColor: colors.primary }]} activeOpacity={0.85} onPress={() => nav.navigate('CreateReel')}>
              <Icon name="plus" size={18} color="#fff" />
              <Text style={s.emptyCtaText}>Créer mon premier reel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            key="mine-grid"
            data={myReels}
            keyExtractor={r => r.id}
            numColumns={2}
            contentContainerStyle={s.mineGrid}
            columnWrapperStyle={s.mineRow}
            renderItem={({ item }) => {
              const filterKey = item.filter_name as FilterKey | undefined;
              const filtDef   = filterKey ? FILTERS.find(f => f.key === filterKey) : null;
              const filtOp    = filterKey ? (FILTER_VIDEO_OPACITY[filterKey] ?? 0) : 0;
              const filtOp2V  = filterKey ? (FILTER_VIDEO_OPACITY2[filterKey] ?? 0) : 0;
              const hasEffects = !!(item.filter_name || item.text_layers || item.sticker_layers);
              return (
                <TouchableOpacity
                  style={s.mineCard}
                  activeOpacity={0.88}
                  onPress={() => handlePlayFromMine(item)}
                >
                  {/* Thumbnail de base */}
                  {item.thumbnail_url
                    ? <Image source={{ uri: item.thumbnail_url }} style={s.mineThumb} resizeMode="cover" />
                    : <View style={[s.mineThumbFallback, { backgroundColor: colors.backgroundSecondary }]}>
                        <Icon name="film" size={28} color={colors.textDisabled} />
                      </View>
                  }

                  {/* Overlay filtre */}
                  {filtDef && filtOp > 0 && (
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 12, backgroundColor: filtDef.overlay, opacity: filtOp }]} />
                  )}
                  {filtDef && filtDef.overlay2 && filtOp2V > 0 && (
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 12, backgroundColor: filtDef.overlay2, opacity: filtOp2V }]} />
                  )}

                  {/* Indicateur effets actifs */}
                  {hasEffects && (
                    <View pointerEvents="none" style={s.mineEffectBadge}>
                      <Icon name="sliders" size={9} color="#fff" />
                    </View>
                  )}

                  {/* Texte layers en miniature */}
                  {item.text_layers && (() => {
                    try {
                      const ls = JSON.parse(item.text_layers);
                      return ls.slice(0, 3).map((l: any) => (
                        <View key={l.id} pointerEvents="none" style={{ position: 'absolute', left: `${(l.x / 390) * 100}%` as any, top: `${(l.y / 844) * 100}%` as any }}>
                          <Text style={{ color: l.color, fontSize: Math.max(7, Math.round(l.fontSize * 0.28)), fontWeight: l.bold ? '800' : '600', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} numberOfLines={1}>
                            {l.text}
                          </Text>
                        </View>
                      ));
                    } catch { return null; }
                  })()}

                  {/* Stats + menu */}
                  <View style={s.mineOverlay}>
                    <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                      <View style={s.mineStat}>
                        <Icon name="play" size={10} color="#fff" />
                        <Text style={s.mineStatText}>{formatCount(item.view_count)}</Text>
                      </View>
                      <View style={s.mineStat}>
                        <MCIcon name="heart" size={10} color="#fff" />
                        <Text style={s.mineStatText}>{formatCount(item.like_count)}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setMenuReel(item)} style={s.mineMenuBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Icon name="more-vertical" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        <Modal visible={!!menuReel} transparent animationType="slide" onRequestClose={() => setMenuReel(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setMenuReel(null)}>
            <View style={[s.menuSheet, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
              <View style={[s.sheetHandle, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleOpenEdit(menuReel)}>
                <Icon name="edit-2" size={18} color={colors.textPrimary} />
                <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Modifier la description</Text>
              </TouchableOpacity>
              <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleOpenFullEdit(menuReel)}>
                <Icon name="sliders" size={18} color={colors.textPrimary} />
                <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Modifier les effets</Text>
              </TouchableOpacity>
              <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleToggleReelComments(menuReel)}>
                <MCIcon name={menuReel?.comments_disabled ? 'comment-check-outline' : 'comment-off-outline'} size={18} color={colors.textPrimary} />
                <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                  {menuReel?.comments_disabled ? 'Activer les commentaires' : 'Désactiver les commentaires'}
                </Text>
              </TouchableOpacity>
              <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleDeleteReel(menuReel)}>
                <Icon name="trash-2" size={18} color={colors.error} />
                <Text style={[s.menuItemText, { color: colors.error }]}>Supprimer le reel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal visible={!!editReel} transparent animationType="slide" onRequestClose={() => setEditReel(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setEditReel(null)}>
            <View style={[s.editSheet, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
              <View style={[s.editHandle, { backgroundColor: colors.divider }]} />
              <Text style={[s.editTitle, { color: colors.textPrimary }]}>Modifier la description</Text>
              <Text style={[s.editSubtitle, { color: colors.textTertiary }]}>Elle apparaît sous ton reel dans le fil.</Text>
              <TextInput
                value={editCaption}
                onChangeText={setEditCaption}
                placeholder="Décris ton reel…"
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={500}
                style={[s.editInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              />
              <Text style={[s.charCount, { color: colors.textTertiary }]}>{editCaption.length}/500</Text>
              <View style={s.editActions}>
                <TouchableOpacity style={[s.editBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setEditReel(null)}>
                  <Text style={[s.editBtnText, { color: colors.textSecondary }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.primary, opacity: editSaving ? 0.6 : 1 }]} onPress={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.editBtnText, { color: '#fff' }]}>Enregistrer</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Editeur effets visuels — dans le bloc mine pour etre visible */}
        {fullEditReel && fullEditReel.hls_url && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <ReelEditorScreen
              uri={fullEditReel.hls_url}
              durationSec={fullEditReel.duration_sec ?? 60}
              thumbnailUri={fullEditReel.thumbnail_url ?? undefined}
              initialResult={(() => {
                const r = fullEditReel;
                try {
                  return {
                    startSec:  0,
                    endSec:    r.duration_sec ?? 60,
                    speed:     1,
                    filter:    (r.filter_name as FilterKey) ?? 'original',
                    layers:    r.text_layers     ? JSON.parse(r.text_layers)     : [],
                    stickers:  r.sticker_layers  ? JSON.parse(r.sticker_layers)  : [],
                    drawings:  r.draw_layers     ? JSON.parse(r.draw_layers)     : [],
                    adjust:    r.video_adjust    ? JSON.parse(r.video_adjust)    : { brightness: 0, contrast: 0, saturation: 0, temperature: 0 },
                    musicUri:  undefined,
                    musicName: undefined,
                  } as ReelEditResult;
                } catch { return undefined; }
              })()}
              onConfirm={(result) => handleFullEditConfirm(result, fullEditReel)}
              onCancel={() => setFullEditReel(null)}
            />
          </View>
        )}
      </View>
    );
  }

  // ── Render: Feed principal ────────────────────────────────────────────────
  return (
    <View style={{ width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000', overflow: 'hidden' }}>
      {/* translucent — la status bar reste barStyle="light-content" (icônes
          blanches) en permanence, peu importe le contenu vidéo du reel —
          détecter la luminosité réelle frame par frame serait trop coûteux.
          Le dégradé de protection est monté APRÈS la FlatList plus bas (pas
          ici) : la surface vidéo native (VideoView) ignore le zIndex React
          Native habituel et passe toujours au-dessus, peu importe sa valeur —
          seul l'ORDRE DE MONTAGE dans l'arbre JSX fait foi pour un élément
          natif comme celui-ci. */}
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <FlatList
        ref={listRef}
        data={feedWithAds as any[]}
        keyExtractor={r => (r as any).id}
        style={{ flex: 1, overflow: 'hidden' }}
        // Désactivé pendant l'overlay recherche — sans ça, les GestureDetector de
        // chaque VideoSlide/AdSlide (double-tap like, scrub) restent actifs sous
        // l'overlay et peuvent intercepter le tap avant qu'il n'atteigne une carte
        // de la grille recherche (pubs notamment, qui tombent à des positions
        // variables selon le scroll — jamais garanties hors des zones de gestes).
        pointerEvents={searchOpen ? 'none' : 'auto'}
        pagingEnabled={false}
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        disableIntervalMomentum
        // Glisser vers le bas tout en haut du 1er reel → rafraîchit le feed. Ne
        // se déclenche jamais pendant un swipe normal entre reels (RN exige
        // d'être déjà à l'offset 0 et de continuer à tirer) — aucun conflit
        // avec le pager vertical. Masqué en mode profil (userMode) et pendant
        // la recherche, comme le reste des interactions de cette liste.
        refreshControl={!userMode && !searchOpen ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
            colors={['#7B3FF2']}
            progressBackgroundColor="#1a1a2e"
          />
        ) : undefined}
        // Ancre le reel visible quand `feedWithAds` change AU-DESSUS de la position
        // courante — c'était la cause du "l'écran glisse au hasard" au retour sur
        // Reels : une pub qui finit de charger (loadAdForSlot) est insérée dans
        // feedWithAds tous les AD_INTERVAL reels ; sans cette prop, tout ce qui est
        // en dessous du point d'insertion se décale d'un plein écran et onScrollUpdate
        // se retrouve sur un autre index (mauvaise vidéo qui se lance). minIndexForVisible:0
        // parce qu'ici l'item 0 EST du contenu (pas de header), et pas d'autoscroll.
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={e => onScrollUpdate(e.nativeEvent.contentOffset.y)}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        extraData={`${currentIndex}-${screenFocused}-${muted}-${searchOpen}`}
        getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
        onScrollToIndexFailed={({ index }) => {
          scrollToIdx(index);
        }}
        onLayout={() => {
          const target = pendingTargetRef.current;
          if (!target) return;
          pendingTargetRef.current = null;

          // Chercher le reel dans la liste courante
          const list = reelsRef.current;
          const idx  = list.findIndex(r => r.id === target.id);

          if (idx >= 0) {
            // Reel trouvé — scroll direct avec verrou. currentIndex doit
            // refléter la position dans la liste RENDUE (avec pubs), jamais
            // l'index dans reels seul — voir toRenderedIndex.
            const scrollIdx = toRenderedIndex(idx);
            currentIdxRef.current = scrollIdx;
            setCurrentIndex(scrollIdx);
            isScrollingRef.current = true;
            if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
            scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 600);
            listRef.current?.scrollToOffset({ offset: SCREEN_H * scrollIdx, animated: false });
          } else if (target.reel?.hls_url || target.reel?.mp4_url) {
            // Reel pas encore chargé — injecter en tête et afficher.
            // toRenderedIndex(0) : peut se retrouver à un index > 0 dans
            // feedWithAds si une pub a sa position figée à 0.
            const injected = [target.reel, ...list.filter(r => r.id !== target.id)];
            reelsRef.current = injected;
            setReels(injected);
            const scrollIdx = toRenderedIndex(0);
            currentIdxRef.current = scrollIdx;
            setCurrentIndex(scrollIdx);
            isScrollingRef.current = true;
            if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
            scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 600);
            listRef.current?.scrollToOffset({ offset: SCREEN_H * scrollIdx, animated: false });
          }
        }}
        renderItem={renderVideoSlide}
        removeClippedSubviews={false}
        maxToRenderPerBatch={3}
        windowSize={7}
        initialNumToRender={3}
      />

      {/* Dégradé de protection pour les icônes système (zone status bar) —
          garantit un fond assez sombre pour qu'elles restent lisibles même
          sur une vidéo claire (visage, fond blanc...), où elles étaient
          invisibles/recouvertes par la vidéo auparavant. Monté ICI, après la
          FlatList, pas avant : la surface vidéo native passe toujours
          au-dessus d'un élément monté avant elle, zIndex ou non.
          Conditionné à screenFocused : le Tab.Navigator GARDE cet écran monté
          en arrière-plan au changement d'onglet (pas de démontage réel), donc
          sans cette garde ce calque restait dans l'arbre après avoir quitté
          Reels et pouvait repasser visuellement au-dessus de l'écran suivant
          (même défaut de layering natif que la vidéo elle-même) — effet
          "tout grisé" sur Accueil au retour. */}
      {screenFocused && (
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 24 }}
          pointerEvents="none"
        />
      )}

      {/* Masque plein écran pendant la navigation depuis un reel suggéré du
          feed — tant qu'awaitingTarget est vrai, isActive est forcé à false
          sur TOUS les slides (cf. renderVideoSlide), donc rien ne joue en
          dessous ; cet overlay évite juste que l'utilisateur voie la frame
          figée d'un autre reel pendant la course scroll/injection. */}
      {awaitingTarget && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: 50, alignItems: 'center', justifyContent: 'center' }]}>
          <GofolyxLoader variant="reel" color="#ffffff" />
        </View>
      )}

      {/* Tuto "glissez vers le haut" — une seule fois par installation (flag
          MMKV interne au composant), disparaît dès le premier vrai swipe.
          swipeHintDone déclenche l'autorisation du tuto cadeau (VideoSlide) :
          les deux tutos ne doivent jamais se superposer à l'écran. */}
      <SwipeUpHint dismiss={currentIndex > 0} onDone={() => setSwipeHintDone(true)} />

      {/* Gradient haut — assure lisibilité du header sur toute vidéo.
          4 stops (pas 2) : opacité basse CONSTANTE de 0 à insets.top (deux
          stops identiques à 0.12, pas une simple interpolation vers le stop
          suivant) — un dégradé à 2 points entre 0 et le pic à insets.top
          grimpait déjà progressivement vers 0.55 PENDANT toute la zone status
          bar (le point de départ et le point d'arrivée d'un même segment
          s'interpolent continûment, ce qui rendait la zone status bar presque
          aussi sombre que le header juste en dessous). Ici, l'opacité reste
          plate à 0.12 jusqu'à insets.top, PUIS grimpe à 0.55 juste après —
          montée nette, pas progressive sur la zone système. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.0)']}
        locations={[0, insets.top / (insets.top + 80), (insets.top + 20) / (insets.top + 80), 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 80, zIndex: 9 }}
        pointerEvents="none"
      />

      {/* Header flottant — minimal : pas de titre "Reels" statique (la vidéo
          parle d'elle-même), pas de bouton retour (le swipe/geste natif reste
          disponible pour revenir en arrière) — recherche prend cette position
          extrême gauche à la place. En userMode (profil d'un autre reeler) le
          nom d'auteur reste affiché, c'est une info utile, pas du remplissage.
          Décalé un peu plus bas que la zone sûre système (insets.top),
          toujours adaptatif à l'appareil. Sur une pub (currentIsAd), AdSlide
          affiche déjà son propre bandeau "ANNONCE"/"Passer" à cette même
          hauteur — recherche/mes reels s'effacent pour ne pas se chevaucher
          avec lui. */}
      <View style={[s.floatingHeader, { top: insets.top + 22 }]} pointerEvents="box-none">
        {!userMode && !currentIsAd ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} pointerEvents="box-none">
            <TouchableOpacity onPress={openSearch} style={[s.iconBtn, { width: Math.round(36 * ui.scale), height: Math.round(36 * ui.scale), borderRadius: Math.round(18 * ui.scale) }]}>
              <Icon name="search" size={ui.headerIcon} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleMute} style={[s.iconBtn, { width: Math.round(36 * ui.scale), height: Math.round(36 * ui.scale), borderRadius: Math.round(18 * ui.scale) }]}>
              <Icon name={muted ? 'volume-x' : 'volume-2'} size={ui.headerIcon} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: Math.round(36 * ui.scale) }} pointerEvents="none" />
        )}
        {userMode && !currentIsAd ? (
          <Text style={[s.reelHeaderTitle, { fontSize: ui.headerTitle }]} numberOfLines={1}>
            {getAuthorLabel(reels[0]?.author)}
          </Text>
        ) : (
          <View style={{ flex: 1 }} pointerEvents="none" />
        )}
        {!userMode && !currentIsAd && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }} pointerEvents="box-none">
            <TouchableOpacity
              onPress={() => setTab('mine')}
              style={[s.iconBtn, { width: Math.round(36 * ui.scale), height: Math.round(36 * ui.scale), borderRadius: Math.round(18 * ui.scale) }]}
            >
              <Icon name="film" size={ui.headerIcon} color="#fff" />
            </TouchableOpacity>
            {/* Raccourci avance automatique — bascule le même réglage que le
                toggle du menu Plus (état partagé, storage commun). Rempli/actif
                quand l'avance auto est activée, pour un repère visuel rapide
                sans avoir à ouvrir le menu complet. */}
            <TouchableOpacity
              onPress={toggleAutoAdvanceHeader}
              style={[
                s.iconBtn,
                {
                  width: Math.round(36 * ui.scale), height: Math.round(36 * ui.scale), borderRadius: Math.round(18 * ui.scale),
                  backgroundColor: autoAdvance ? colors.primary : 'rgba(255,255,255,0.15)',
                },
              ]}
            >
              <Icon name="chevron-down" size={ui.headerIcon} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>


      {/* Overlay recherche */}
      {searchOpen && (
        <View style={[s.searchOverlay, { paddingTop: insets.top }]}>
          <View style={s.searchTopBar}>
            <BackButton onPress={closeSearch} transparent color="#fff" />
            <View style={s.searchInputWrap}>
              <Icon name="search" size={15} color="rgba(255,255,255,0.4)" style={{ marginLeft: 12 }} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder="Rechercher des reels, auteurs..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={s.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => runSearch(searchQuery)}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => onSearchChange('')} style={s.searchClearBtn}>
                  <Icon name="x" size={14} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {(() => {
            // Grille affichée pour de vrais résultats de recherche OU, par défaut,
            // pour les tendances — même rendu, source différente. Les tendances
            // restent visibles PENDANT la frappe (tant qu'aucun vrai résultat n'est
            // encore arrivé) : jamais d'écran vide entre "tendances" et "résultats".
            const hasRealResults = searchResults.length > 0;
            const showTrending = !hasRealResults && searchQuery.trim().length === 0 && trendingReels.length > 0;
            const gridData = hasRealResults ? searchResults : showTrending ? trendingReels : null;

            if (searching && !showTrending) {
              return (
                <View style={s.searchCenterState}>
                  <GofolyxLoader variant="reel" color="#ffffff" />
                  <Text style={s.searchStateText}>Recherche en cours…</Text>
                </View>
              );
            }
            if (gridData) {
              // Le NOMBRE de pubs chargées reste dérivé de SEARCH_AD_INTERVAL (une pub
              // toutes les SEARCH_AD_INTERVAL résultats, cf. loadSearchAdForSlot ci-dessus),
              // mais plus aucun calcul de leur POSITION dans la grille — même principe que
              // feedWithAds (feed principal) : glisser une pub entre deux cartes déjà
              // affichées recalculait leur emplacement à chaque nouveau lot chargé, source
              // de bugs de décalage. Les pubs disponibles sont maintenant simplement
              // ajoutées À LA SUITE des résultats.
              const mixed: Array<{ _kind: 'reel'; reel: any } | { _kind: 'ad'; ad: SearchAdData; slot: number }> =
                gridData.map(item => ({ _kind: 'reel', reel: item }));
              searchAdSlots.forEach((ad, slot) => {
                mixed.push({ _kind: 'ad', ad, slot });
              });
              return (
                <FlatList
                  key="search-grid"
                  data={mixed}
                  keyExtractor={(m, i) => m._kind === 'ad' ? `ad-${m.slot}` : m.reel.id ?? String(i)}
                  numColumns={2}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={s.searchGrid}
                  columnWrapperStyle={s.searchGridRow}
                  showsVerticalScrollIndicator={false}
                  onEndReached={loadMoreSearchGrid}
                  onEndReachedThreshold={0.6}
                  ListFooterComponent={loadingMoreSearch ? (
                    <View style={{ paddingVertical: 16 }}><GofolyxLoader variant="reel" color="#ffffff" /></View>
                  ) : null}
                  renderItem={({ item: m, index }) => {
                    if (m._kind === 'ad') return (
                      <Animated.View entering={FadeIn.delay(index * 45).duration(200)} style={{ flex: 1 }}>
                        <SearchAdCard ad={m.ad} onOpenFullscreen={setFullscreenAd} />
                      </Animated.View>
                    );
                    const item = m.reel;
                    return (
                      <TouchableOpacity style={s.searchCard} onPress={() => pickSearchResult(item)} activeOpacity={0.9}>
                        {item.thumbnail_url
                          ? <Image source={{ uri: item.thumbnail_url }} style={s.searchThumb} resizeMode="cover" />
                          : <View style={s.searchThumbFallback}><Icon name="film" size={32} color="rgba(255,255,255,0.15)" /></View>
                        }
                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.92)']} locations={[0.3, 0.6, 1]} style={s.searchCardGrad} />
                        <View style={s.searchPlayBadge}><Icon name="play" size={10} color="#fff" /></View>
                        <View style={s.searchViewBadge}>
                          <Icon name="eye" size={10} color="#fff" />
                          <Text style={s.searchBadgeText}>{formatCount(item.view_count)}</Text>
                        </View>
                        <View style={s.searchCardInfo}>
                          <View style={s.searchCardAuthorRow}>
                            {item.author?.avatar_url
                              ? <Image source={{ uri: item.author.avatar_url }} style={s.searchAvatar} />
                              : <View style={[s.searchAvatar, s.searchAvatarFallback]}>
                                  <Text style={s.searchAvatarText}>{(item.author?.display_name || item.author?.username || '?')[0]?.toUpperCase() ?? '?'}</Text>
                                </View>
                            }
                            <Text style={s.searchCardAuthor} numberOfLines={1}>{item.author?.display_name || item.author?.username || ''}</Text>
                          </View>
                          {item.caption ? <Text style={s.searchCardCaption} numberOfLines={2}>{item.caption}</Text> : null}
                          <View style={s.searchCardStats}>
                            <MCIcon name="heart" size={11} color={REEL_LIKE} />
                            <Text style={s.searchCardStat}>{formatCount(item.like_count)}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              );
            }
            if (searchQuery.trim().length > 0) {
              return (
                <View style={s.searchCenterState}>
                  <View style={s.searchEmptyIcon}><Icon name="search" size={28} color="rgba(255,255,255,0.4)" /></View>
                  <Text style={s.searchStateTitle}>Aucun résultat</Text>
                  <Text style={s.searchStateText}>Essaie un autre mot-clé ou nom d'auteur</Text>
                </View>
              );
            }
            if (loadingTrending) {
              return (
                <View style={s.searchCenterState}>
                  <GofolyxLoader variant="reel" color="#ffffff" />
                </View>
              );
            }
            return (
              <View style={s.searchCenterState}>
                <View style={s.searchEmptyIcon}><Icon name="trending-up" size={28} color="rgba(255,255,255,0.4)" /></View>
                <Text style={s.searchStateTitle}>Découvre des reels</Text>
                <Text style={s.searchStateText}>Tape le nom d'un auteur ou un mot-clé</Text>
              </View>
            );
          })()}
        </View>
      )}

      {/* Pub vidéo de la grille recherche ouverte en plein écran avec son —
          réutilise AdSlide (même composant que le feed principal), muted=false
          car ici une seule pub est visible à la fois (jamais de conflit de son). */}
      <Modal visible={!!fullscreenAd} animationType="slide" onRequestClose={() => setFullscreenAd(null)} statusBarTranslucent>
        {fullscreenAd && (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <AdSlide
              ad={fullscreenAd}
              isActive
              muted={false}
              screenW={SCREEN_W}
              screenH={SCREEN_H}
              insetTop={insets.top}
              ui={ui}
              onAuthorPress={onAuthorPress}
            />
            <TouchableOpacity
              style={{ position: 'absolute', top: insets.top + 10, left: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => setFullscreenAd(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="x" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </Modal>

      {/* loadingMore silencieux — pas d'indicateur visible comme TikTok */}
    </View>
  );
};

// ─── AdSlide — slide pub plein ecran dans le feed reels ──────────────────────

interface AdData {
  id: string;
  title: string;
  description?: string;
  cta_text?: string;
  cta_url?: string;
  creative_url?: string;
  thumbnail_url?: string;
  contact_phone?: string | null;
  contact_call?: boolean;
  contact_whatsapp?: boolean;
  advertiser_id?: string;
  advertiser_name?: string;
  advertiser_logo?: string;
}

const AD_SKIP_MS = 3000;

const AdSlide: React.FC<{ ad: AdData; isActive: boolean; muted: boolean; screenW: number; screenH: number; insetTop: number; insetBottom?: number; hasTabBar?: boolean; ui: ReelUI; onAuthorPress: (userId: string) => void; onEnd?: () => void }> = memo(({
  ad, isActive, muted, screenW, screenH, insetTop, insetBottom = 0, hasTabBar = false, ui, onAuthorPress, onEnd,
}) => {
  const isVideo = adIsVideo(ad);
  const player = useVideoPlayer(
    isVideo && ad.creative_url ? { uri: ad.creative_url } : 'about:blank',
    p => { p.loop = false; p.muted = muted; p.volume = muted ? 0 : 1; },
  );
  const staticImageUri = !isVideo ? (ad.creative_url || ad.thumbnail_url) : undefined;

  useEffect(() => {
    if (!isVideo) return;
    try { if (isActive) player.play(); else player.pause(); } catch {}
  }, [isActive, isVideo, player]);
  useEffect(() => {
    try { player.muted = muted; player.volume = muted ? 0 : 1; } catch {}
  }, [muted, player]);

  // Avance automatiquement au reel suivant à la fin de la pub — pas de loop,
  // sinon la pub video se répète indéfiniment tant que l'utilisateur ne swipe pas.
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  useEffect(() => {
    if (!isVideo) return;
    const sub = player.addEventListener('onEnd', () => { onEndRef.current?.(); });
    return () => sub.remove();
  }, [isVideo, player]);

  // Impression une seule fois
  const impressionSent = useRef(false);
  useEffect(() => {
    if (isActive && !impressionSent.current) {
      impressionSent.current = true;
      apiClient.post(`/api/v1/ads/${ad.id}/impression`, {}).catch(() => {});
    }
  }, [isActive, ad.id]);

  const rawCta = (ad.cta_url ?? '').trim();
  const ctaButtons = adContactButtons(ad);
  const handleCtaButton = (btn: ReturnType<typeof adContactButtons>[number]) => {
    apiClient.post(`/api/v1/ads/${ad.id}/click`, {}).catch(() => {});
    runAdButton(btn, ad);
  };

  // Shine périodique sur le bouton CTA — même effet que AdCTA (Feed/Recherche),
  // simple bouton fixe ici (pas de morph/hairline : il est sur la même ligne
  // que le nom de l'annonceur, visible dès le départ).
  const ctaShine = useSharedValue(0);
  useEffect(() => {
    if (!isActive || !rawCta) return;
    ctaShine.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 0 }),
        withDelay(4800, withTiming(0, { duration: 0 })),
      ),
      -1, false,
    ));
  }, [isActive, rawCta, ctaShine]);
  const ctaShineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(ctaShine.value, [0, 1], [92, -60]) }],
    opacity: ctaShine.value > 0 && ctaShine.value < 1 ? 1 : 0,
  }));

  // ── Skip façon YouTube — anneau qui se remplit sur AD_SKIP_MS puis bouton actif ──
  const skipFill = useSharedValue(0);
  const [skipReady, setSkipReady] = useState(false);
  useEffect(() => {
    if (!isActive) { skipFill.value = 0; setSkipReady(false); return; }
    skipFill.value = withTiming(1, { duration: AD_SKIP_MS, easing: Easing.linear });
    const t = setTimeout(() => setSkipReady(true), AD_SKIP_MS);
    return () => clearTimeout(t);
  }, [isActive, skipFill]);
  const skipRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(skipFill.value, [0, 1], [0.4, 1]),
    transform: [{ rotate: `${interpolate(skipFill.value, [0, 1], [0, 300])}deg` }],
  }));

  // Aligné pile sur le header flottant global (insets.top + 22, voir
  // floatingHeader) — l'ancien calcul basé sur insetBottom était une
  // approximation qui désynchronisait "ANNONCE"/"Passer" du bouton retour.
  const safeTop = insetTop + 22;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000' }}>
      {/* Fond noir uni derrière le média — plus de thumbnail flouté agrandi. */}

      {/* Média — contain, jamais rogné */}
      {isVideo && ad.creative_url ? (
        <VideoView player={player} style={{ position: 'absolute', width: screenW, height: screenH }} resizeMode="contain" controls={false} />
      ) : staticImageUri ? (
        <Image source={{ uri: staticImageUri }} style={{ position: 'absolute', width: screenW, height: screenH }} resizeMode="contain" />
      ) : (
        <View style={{ position: 'absolute', width: screenW, height: screenH, backgroundColor: '#111' }} />
      )}

      <LinearGradient colors={['#00000070', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 130 }} pointerEvents="none" />
      <LinearGradient colors={['transparent', '#00000090', '#000000F8']} locations={[0, 0.42, 1]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: screenH * 0.62 }} pointerEvents="none" />

      {/* ── Top line : « Annonce » + skip — décalée à gauche pour laisser la
          place au vrai bouton retour du header global (celui-ci reste affiché
          pendant une pub, voir floatingHeader dans le composant parent). ── */}
      <View style={[adSlideS.topline, { top: safeTop, left: 56 }]} pointerEvents="box-none">
        <Text style={[adSlideS.annonce, { fontSize: Math.round(10.5 * ui.scale) }]}>Annonce</Text>
        {onEnd ? (
          <TouchableOpacity
            style={adSlideS.skip}
            disabled={!skipReady}
            activeOpacity={0.7}
            onPress={() => { if (skipReady) onEnd?.(); }}
          >
            {skipReady ? (
              <>
                <Text style={adSlideS.skipTxt}>Passer</Text>
                <Icon name="skip-forward" size={13} color="#fff" />
              </>
            ) : (
              <Animated.View style={[adSlideS.skipRing, skipRingStyle]} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── En-tête annonceur + CTA sur la même ligne (nom à gauche, bouton à
          droite) — plus de bloc CTA séparé en bas de l'écran, tout est groupé
          ici pour lire l'annonceur et l'action en un coup d'œil. bottom tient
          compte de la tab bar overlay (Accueil/Découvrir/Reels/Profil) qui
          flotte par-dessus sur l'écran Reels — sans ça ce bloc se retrouvait
          caché dessous. hasTabBar est un booléen explicite (pas déduit de
          insetBottom>0, qui peut valoir 0 sur des appareils Android sans
          geste de navigation alors que la tab bar overlay est bien affichée).
          hasTabBar=false (Modal plein écran, grille recherche) retombe sur
          les 40px d'origine, pas de régression là. ── */}
      <View style={[adSlideS.adv, { bottom: 40 + (hasTabBar ? TAB_BAR_HEIGHT + Math.max(insetBottom, 12) : 0) }]} pointerEvents="box-none">
        <View style={adSlideS.advRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AdvertiserRow ad={ad} variant="dark" onPressAdvertiser={onAuthorPress} />
          </View>
          {ctaButtons.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {ctaButtons.map((btn, i) => {
                const PillIcon = btn.iconSet === 'mci' ? MCIcon : Icon;
                const pillBg = btn.action === 'whatsapp' ? '#25D366' : '#fff';
                const pillFg = btn.action === 'whatsapp' ? '#fff' : '#0E0D1F';
                return (
                  <Animated.View key={btn.action} style={i === 0 ? adSlideS.ctaShadowWrap : undefined}>
                    <TouchableOpacity
                      style={[adSlideS.ctaPill, { backgroundColor: pillBg }]}
                      onPress={() => handleCtaButton(btn)}
                      activeOpacity={0.85}
                    >
                      {i === 0 && <Animated.View style={[adSlideS.ctaShine, ctaShineStyle]} pointerEvents="none" />}
                      <Text style={[adSlideS.ctaPillTxt, { color: pillFg }]} numberOfLines={1}>{btn.text}</Text>
                      <PillIcon name={btn.icon} size={12} color={pillFg} />
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          ) : null}
        </View>
        {ad.description ? (
          <Text style={adSlideS.advDesc} numberOfLines={2}>{ad.description}</Text>
        ) : ad.title ? (
          <Text style={adSlideS.advDesc} numberOfLines={2}>{ad.title}</Text>
        ) : null}
      </View>
    </View>
  );
});

const adSlideS = StyleSheet.create({
  topline:  { position: 'absolute', left: 14, right: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  annonce:  { color: 'rgba(255,255,255,0.6)', fontWeight: FontWeight.semiBold, letterSpacing: 1, textTransform: 'uppercase' },
  skip:     { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 22, minWidth: 22, justifyContent: 'center' },
  skipTxt:  { color: '#fff', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold },
  skipRing: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#fff' },
  adv:      { position: 'absolute', left: 18, right: 18 },
  advRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  advDesc:  { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.82)', marginTop: 7, lineHeight: 17, textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  // Bouton CTA — sur la même ligne que le nom de l'annonceur, à droite. Ombre
  // portée par ce wrapper (jamais sur un conteneur overflow:hidden, coupée
  // sinon sur iOS), fond blanc fixe donc ombre noire classique.
  ctaShadowWrap: {
    flexShrink: 0, borderRadius: 999,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4,
  },
  ctaPill:    { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, maxWidth: 150 },
  ctaPillTxt: { color: '#0E0D1F', fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  ctaShine:   { position: 'absolute', top: 0, bottom: 0, left: '92%', width: '40%', backgroundColor: 'rgba(123,63,242,0.35)', transform: [{ skewX: '-18deg' }] },
});

// ─── SearchAdCard — carte pub format grille (overlay recherche, placement="search") ──

interface SearchAdCardData {
  id: string;
  title: string;
  description?: string;
  cta_text?: string;
  cta_url?: string;
  creative_url?: string;
  thumbnail_url?: string;
  contact_phone?: string | null;
  contact_call?: boolean;
  contact_whatsapp?: boolean;
}

const SearchAdCard: React.FC<{ ad: SearchAdCardData; onOpenFullscreen: (ad: SearchAdCardData) => void }> = memo(({ ad, onOpenFullscreen }) => {
  const impressionSent = useRef(false);
  useEffect(() => {
    if (!impressionSent.current) {
      impressionSent.current = true;
      apiClient.post(`/api/v1/ads/${ad.id}/impression`, {}).catch(() => {});
    }
  }, [ad.id]);

  const rawCta  = (ad.cta_url ?? '').trim();
  const isPhone = adIsPhone(rawCta);
  const hasContact = adHasContact(ad);
  // Carte entière cliquable (pas de bouton par canal ici, place trop réduite dans
  // la grille) : priorité WhatsApp si les deux canaux sont cochés — le label reflète
  // exactement l'action qui sera déclenchée au tap.
  const searchAdButtons = adContactButtons(ad);
  const searchAdButton = searchAdButtons.find(b => b.action === 'whatsapp') ?? searchAdButtons[0];
  const searchAdCta = searchAdButton ?? adCtaLabel(ad);

  // Le créatif peut être une vidéo ou une image — même détection que AdSlide
  // (feed plein écran). Avant ce fix, une pub vidéo tentait de s'afficher via
  // <Image source={{uri: .mp4}}>, qui échoue silencieusement (pas de rendu
  // vidéo possible dans un <Image>) : la carte restait noire, indiscernable
  // d'une erreur de chargement.
  const isVideo = !!(ad.creative_url && (ad.creative_url.includes('.m3u8') || ad.creative_url.includes('.mp4') || ad.creative_url.includes('/hls/') || ad.creative_url.includes('video')));

  // Une pub vidéo s'ouvre d'abord en plein écran avec son (comme un reel normal) —
  // le lien CTA reste accessible depuis cet écran, pas ouvert automatiquement au
  // premier tap. Une pub image (pas de vidéo) garde le comportement direct.
  const handlePress = () => {
    apiClient.post(`/api/v1/ads/${ad.id}/click`, {}).catch(() => {});
    if (isVideo) { onOpenFullscreen(ad); return; }
    if (hasContact && searchAdButton) { runAdButton(searchAdButton, ad); return; }
    if (!rawCta) return;
    if (isPhone) { openPhoneMenu(rawCta.replace(/^tel:/i, '')); return; }
    Linking.openURL(rawCta).catch(() => {});
  };

  // Muet dans la grille — plusieurs cartes pub peuvent être montées en même
  // temps (rendu virtualisé de la FlatList pendant le scroll), donc plusieurs
  // vidéos avec du son joueraient simultanément. Même règle que TikTok/Instagram :
  // le son n'arrive qu'en plein écran, jamais dans une grille de vignettes.
  const player = useVideoPlayer(
    isVideo && ad.creative_url ? { uri: ad.creative_url } : 'about:blank',
    p => { p.loop = true; p.muted = true; p.volume = 0; },
  );
  useEffect(() => { if (isVideo) { try { player.play(); } catch {} } }, [isVideo, player]);

  // <Image> ne montre rien de visible en cas d'échec de chargement (URL cassée,
  // réseau, format non supporté) — sans ce state, une pub dont l'image échoue
  // à charger apparaît comme une carte quasi noire (le fallback dégradé sombre
  // + le voile inférieur suffisent à donner cette impression), sans jamais
  // signaler que c'est une erreur plutôt qu'une pub "sans visuel".
  const [imgFailed, setImgFailed] = useState(false);
  const imgUri = ad.creative_url || ad.thumbnail_url;
  const showFallback = isVideo ? false : (!imgUri || imgFailed);

  // TouchableOpacity de react-native-gesture-handler plutôt que celui de
  // react-native core : dans une FlatList imbriquée sous GestureHandlerRootView
  // (App.tsx), le TouchableOpacity RN core entre en compétition avec le
  // responder de gesture-handler et son tap peut être perdu — c'était la
  // cause du clic mort sur les pubs de la grille recherche.
  return (
    <GHTouchableOpacity style={[s.searchCard, s.searchAdCell]} onPress={handlePress} activeOpacity={0.9}>
      {isVideo ? (
        <VideoView player={player} style={StyleSheet.flatten([s.searchThumb, s.searchAdThumbCompact])} resizeMode="cover" controls={false} />
      ) : showFallback ? (
        <View style={[s.searchThumb, s.searchAdThumbCompact, s.searchAdFallback]}>
          <Icon name="zap" size={26} color="rgba(255,255,255,0.35)" />
        </View>
      ) : (
        <Image
          source={{ uri: imgUri }}
          style={[s.searchThumb, s.searchAdThumbCompact]}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.94)']} locations={[0.25, 0.6, 1]} style={s.searchCardGrad} />
      {/* Repère éditorial : filet gradient 2px en haut + mot « Annonce » (fini la pastille rose) */}
      <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.searchAdRule} />
      <Text style={s.searchAdMark}>Annonce</Text>
      <View style={s.searchCardInfo}>
        <Text style={s.searchCardAuthor} numberOfLines={1}>{ad.title}</Text>
        {ad.description ? <Text style={s.searchCardCaption} numberOfLines={2}>{ad.description}</Text> : null}
        {(rawCta || hasContact) ? (
          <View style={s.searchAdCtaRow}>
            {'iconSet' in searchAdCta && searchAdCta.iconSet === 'mci' ? (
              <MCIcon name={searchAdCta.icon} size={10} color="#fff" />
            ) : (
              <Icon name={isPhone || ('action' in searchAdCta && searchAdCta.action === 'call') ? 'phone' : searchAdCta.icon === 'download' ? 'download' : 'globe'} size={10} color="#fff" />
            )}
            <Text style={s.searchAdCtaText} numberOfLines={1}>{searchAdCta.text}</Text>
          </View>
        ) : null}
      </View>
    </GHTouchableOpacity>
  );
});

// ─── VideoSlide ───────────────────────────────────────────────────────────────

interface VideoSlideProps {
  reel:                 Reel;
  isActive:             boolean;
  isPreload:            boolean;
  preloadDistance:      number;
  isCachePriority:      boolean;
  isWifi:               boolean;
  networkQuality:       NetworkQuality;
  muted:                boolean;
  screenW:              number;
  screenH:              number;
  insetBottom:          number;
  colors:               any;
  currentUserId?:       string;
  currentUserAvatar?:   string;
  currentUserInitial?:  string;
  onAuthorPress:        (userId: string) => void;
  onEnd:                () => void;
  activePlayerRef?:     React.RefObject<{ pause: () => void } | null>;
  audioOwnerRef?:       React.RefObject<string | null>;
  ui:                   ReelUI;
  // Avance automatique au reel suivant à la fin de la vidéo — état possédé par
  // le parent ReelsScreen (source de vérité unique), partagé avec le raccourci
  // du header. Descendu en prop plutôt que dupliqué en state local ici, sinon
  // le raccourci header et le toggle du menu Plus se désynchronisent tant que
  // ce composant n'est pas remonté.
  autoAdvance:          boolean;
  onToggleAutoAdvance:  () => void;
  // Le tuto cadeau (GiftHoldHint) n'a le droit de s'afficher qu'une fois le
  // tuto "glissez vers le haut" terminé — jamais les deux en même temps.
  giftHintEnabled:      boolean;
  // Interface superposée (colonne actions, auteur/légende/musique) — réglage
  // Réglages > Lecture > "Interface sur les reels". Remonté en prop (source de
  // vérité au niveau du parent ReelsScreen, relu via useFocusEffect) plutôt que
  // lu indépendamment ici : un slide déjà actif au moment où l'utilisateur
  // change le réglage dans Réglages puis revient ne redéclenchait jamais sa
  // propre relecture (isActive restait true tout du long, rien ne changeait
  // pour retrigger un useEffect local ici).
  reelsShowInterface:   boolean;
}

const VideoSlide: React.FC<VideoSlideProps> = memo(({
  reel, isActive, isPreload, preloadDistance, isCachePriority, isWifi, networkQuality, muted, screenW, screenH, insetBottom,
  colors, currentUserId, currentUserAvatar, currentUserInitial = 'M',
  onAuthorPress, onEnd, activePlayerRef, audioOwnerRef, ui,
  autoAdvance, onToggleAutoAdvance, giftHintEnabled, reelsShowInterface,
}) => {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [paused,       setPaused]       = useState(false);
  const [videoLoaded,  setVideoLoaded]  = useState(false);
  const [videoError,   setVideoError]   = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [isStalling,   setIsStalling]   = useState(false);
  const [showControls, setShowControls] = useState(false);
  // Interface superposée (colonne actions, auteur/légende/musique) — reçue en
  // prop depuis ReelsScreen (source de vérité unique, relue via useFocusEffect
  // à chaque retour sur l'écran), pas un state local ici.
  const showInterface = reelsShowInterface;
  const stallingTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressValue     = useSharedValue(0);
  const durationRef       = useRef(0);
  const [liked,        setLiked]        = useState(reel.user_reaction === 'like');
  const [likes,        setLikes]        = useState(reel.like_count ?? 0);
  const [heartLikeAction, setHeartLikeAction] = useState(true);
  const [commentCount, setCommentCount] = useState(reel.comment_count ?? 0);
  const [shareCount,   setShareCount]   = useState(reel.share_count ?? 0);
  const [showShare,    setShowShare]    = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [giftHoldStarted, setGiftHoldStarted] = useState(false);
  const [ended,        setEnded]        = useState(false);
  const [isFollowing,  setIsFollowing]  = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [refInfo, setRefInfo] = useState<{ label: string; kind: string; thumbnail: string | null; color: string } | null>(null);
  const [skipLeftLabel,  setSkipLeftLabel]  = useState('');
  const [skipRightLabel, setSkipRightLabel] = useState('');
  const [showOwnerMenu,      setShowOwnerMenu]      = useState(false);
  const { get: getDl, download: startDl } = useMediaDownload();
  const reelDl = getDl(reel.id);
  const handleDownloadReel = useCallback(() => {
    const url = reel.hls_url ?? reel.mp4_url;
    if (!url) { toastService.warning('Indisponible', 'Vidéo introuvable pour ce reel.'); return; }
    startDl(reel.id, url, true);
  }, [reel.id, reel.hls_url, reel.mp4_url, startDl]);
  const [commentsDisabledSt, setCommentsDisabledSt] = useState(reel.comments_disabled ?? false);
  const [togglingComments,   setTogglingComments]   = useState(false);
  const [showRemix,          setShowRemix]          = useState(false);
  const [remixLoading,       setRemixLoading]       = useState(false);
  const [cableLoading,       setCableLoading]       = useState(false);
  const [remixCountSt,       setRemixCountSt]       = useState(reel.remix_count ?? 0);
  const [repostCountSt,      setRepostCountSt]      = useState(reel.repost_count ?? 0);
  const [cableCountSt,       setCableCountSt]       = useState(reel.cable_count ?? 0);
  const [showEditCaption,    setShowEditCaption]     = useState(false);
  const [editCaptionText,    setEditCaptionText]     = useState(reel.caption ?? '');
  const [savingCaption,      setSavingCaption]       = useState(false);
  const [captionSt,          setCaptionSt]           = useState(reel.caption ?? '');

  const likeInFlight  = useRef(false);
  const pausedRef     = useRef(false);
  const endedRef      = useRef(false);
  const likedRef      = useRef(reel.user_reaction === 'like');
  const mountedRef    = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasEndedOnActivate = useRef(false);

  const MAX_RETRIES   = 4;
  const STALL_TIMEOUT = 5_000;

  const isOwnReel = !!(currentUserId && reel.author?.id && currentUserId === String(reel.author.id));

  const handleToggleFeedComments = useCallback(async () => {
    setShowOwnerMenu(false);
    if (togglingComments) return;
    setTogglingComments(true);
    try {
      const res = await socialService.toggleEntityComments('reel', reel.id);
      setCommentsDisabledSt(res.comments_disabled);
    } catch { /**/ }
    finally { setTogglingComments(false); }
  }, [reel.id, togglingComments]);

  const handleRepost = useCallback(async () => {
    if (remixLoading) return;
    setRemixLoading(true);
    try {
      await reelService.repost(reel.id);
      setRepostCountSt(prev => prev + 1);
      setShowRemix(false);
      toastService.success('Republié', 'Le reel a été republié sur votre profil.');
    } catch {
      toastService.error('Erreur', 'Impossible de republier ce reel.');
    } finally {
      setRemixLoading(false);
    }
  }, [reel.id, remixLoading]);

  const handleRemixer = useCallback(() => {
    setShowRemix(false);
    nav.navigate('CreateReel', { sourceReelId: reel.id, sourceReelUrl: (reel.hls_url ?? reel.mp4_url) ?? undefined });
  }, [reel.id, reel.hls_url, reel.mp4_url, nav]);

  const handleDeleteReel = useCallback(() => {
    setShowOwnerMenu(false);
    showConfirm(
      'Supprimer le reel',
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              await reelService.delete(reel.id);
            } catch {
              toastService.error('Erreur', 'Impossible de supprimer ce reel.');
            }
          },
        },
      ],
    );
  }, [reel.id]);

  const handleSaveCaption = useCallback(async () => {
    if (savingCaption) return;
    setSavingCaption(true);
    try {
      await reelService.update(reel.id, { caption: editCaptionText.trim() });
      setCaptionSt(editCaptionText.trim());
      setShowEditCaption(false);
    } catch {
      toastService.error('Erreur', 'Impossible de modifier la description.');
    } finally {
      setSavingCaption(false);
    }
  }, [reel.id, editCaptionText, savingCaption]);

  // Cache disque du mp4_url (voir reelVideoCacheService) : si ce reel a déjà été
  // entièrement téléchargé en fond lors d'un précédent passage, on lit directement
  // le fichier local — zéro donnée réseau, démarrage instantané.
  //
  // cachedLocalUriRef reste la source de vérité lue en continu (jamais de bascule
  // en pleine lecture — voir doRetry plus bas, seul endroit qui l'écrit après le
  // montage). Mais le téléchargement en fond (cacheInBackground ci-dessous) peut
  // très bien se terminer PENDANT que ce reel est encore un simple voisin préchargé
  // (pas encore actif) : avant, ce résultat n'était jamais relu et le reel démarrait
  // quand même depuis le réseau une fois activé, alors que le fichier complet était
  // déjà sur le disque. hasCachedFile force une re-vérification juste avant le tout
  // premier play() (cf. l'effet [isActive, isPreload, player] plus bas) — jamais une
  // fois la lecture réellement démarrée, donc aucun risque de coupure perceptible.
  const cachedLocalUriRef = useRef<string | null>(
    reel.mp4_url ? reelVideoCache.getLocalUri(reel.mp4_url) : null
  );
  const [hasCachedFile, setHasCachedFile] = useState(!!cachedLocalUriRef.current);
  const everPlayedRef = useRef(false);
  // Priorité : fichier caché local > flux réseau (hls_url si présent, sinon
  // mp4_url directement — les reels n'ont plus de hls_url depuis le passage
  // au MP4 unique côté backend, seuls les anciens reels HLS en ont encore).
  const videoUri = (hasCachedFile ? cachedLocalUriRef.current : null) ?? reel.hls_url ?? reel.mp4_url ?? null;

  // Préchargement ÉCHELONNÉ dans le temps (2026-09) : jusqu'ici tous les
  // voisins dans PRELOAD_WINDOW démarraient leur chargement au MÊME instant
  // (dès que isPreload devient true) — sur un appareil faible, plusieurs
  // players video se mettent à décoder/bufferiser en parallèle pile au
  // moment le plus critique (ouverture de l'écran, l'utilisateur attend la
  // 1ère vidéo), sollicitant le CPU/réseau simultanément au lieu de laisser
  // la vidéo active démarrer en priorité absolue. Le voisin IMMÉDIAT
  // (preloadDistance === 1) démarre toujours sans délai (nécessaire pour un
  // swipe réactif), mais un voisin plus loin (distance 2+) attend un court
  // délai proportionnel à sa distance avant de démarrer SON préchargement —
  // étale la charge au lieu de la concentrer sur un seul instant. Annulé
  // proprement si le slide sort de la fenêtre de préchargement avant la fin
  // du délai (swipe rapide) : pas de chargement fantôme pour un voisin déjà
  // abandonné.
  const [preloadReady, setPreloadReady] = useState(preloadDistance <= 1);
  useEffect(() => {
    if (!isPreload || preloadDistance <= 1) {
      setPreloadReady(isPreload); // distance 0/1 (ou plus preload du tout) : immediat
      return;
    }
    setPreloadReady(false);
    // 250ms par cran de distance au-delà du voisin immédiat — reste léger
    // (l'utilisateur peut swiper vite), mais suffit à ne pas démarrer 2+
    // players au même instant précis.
    const delayMs = (preloadDistance - 1) * 250;
    const timer = setTimeout(() => setPreloadReady(true), delayMs);
    return () => clearTimeout(timer);
  }, [isPreload, preloadDistance]);

  // Re-vérification du cache disque PENDANT le préchargement (jamais au moment
  // de l'activation, cf. commentaire ci-dessus sur shouldLoad — changer
  // videoSource pile quand isActive devient vrai force useVideoPlayer à
  // recréer le player et rejouer depuis le début : double démarrage visible,
  // "ça coupe et ça recommence"). Le voisin immédiat (preloadDistance === 1)
  // a le temps de voir son téléchargement en fond se terminer PENDANT qu'il
  // est encore préchargé — cette vérification, faite ici plutôt que dans
  // l'effet de lecture, laisse le re-render se stabiliser bien avant que le
  // reel ne devienne actif.
  useEffect(() => {
    if (hasCachedFile || everPlayedRef.current || !reel.mp4_url) return;
    if (!isPreload || preloadDistance > 1) return;
    const local = reelVideoCache.getLocalUri(reel.mp4_url);
    if (local) { cachedLocalUriRef.current = local; setHasCachedFile(true); }
  }, [isPreload, preloadDistance, hasCachedFile, reel.mp4_url]);

  // Un reel déjà en cache disque (cachedLocalUriRef) n'a aucun coût réseau à
  // démarrer — le délai ci-dessus ne sert qu'à étaler les téléchargements/
  // décodages réseau, pas la lecture d'un fichier local déjà présent.
  const effectivePreload = isPreload && (!!cachedLocalUriRef.current || preloadReady);
  const shouldLoad = !!videoUri && (isActive || effectivePreload);
  // Charge la source dès que ce slide est actif OU en préchargement (slide suivant/précédent).
  // La référence de l'objet source (et bufferConfig) ne doit JAMAIS changer entre preload et actif :
  // sinon useVideoPlayer recrée le player en perdant tout le buffer déjà accumulé pendant le
  // preload (= rechargement complet, latence visible à l'arrivée). Seul shouldLoad (bool) doit
  // faire basculer entre l'URI réelle et 'about:blank', jamais l'objet lui-même.
  // Hors wifi, on réduit fortement le buffer avant de jouer — un voisin préchargé n'a besoin
  // que de quelques secondes pour démarrer instantanément, pas de 30s de vidéo téléchargée
  // pour rien s'il n'est jamais atteint (swipe dans l'autre sens, appel qui interrompt, etc.).
  //
  // 3e palier 'slow' (2026-09, cf. networkService.NetworkQuality) : le palier
  // "hors wifi" ci-dessous restait le MEME pour une 5G rapide et une 2G/3G
  // lente (ou reseau de type indetermine) -- sur une vraie connexion faible,
  // viser 6s de buffer avant lecture (preferredForwardBufferDurationMs) cause
  // des rebuffers frequents en cours de lecture, pas juste un demarrage
  // lent. Palier 'slow' : buffer cible encore plus reduit (3s), et le
  // seuil de redemarrage post-rebuffer (bufferForPlaybackAfterRebufferMs)
  // legerement releve pour eviter un cycle de rebuffers a repetition (repart
  // trop tot avec trop peu de marge, rebuffer a nouveau presque aussitot).
  //
  // Un seul bufferConfig, partage entre preload et actif (2026-09ter, retour
  // arriere sur la tentative de profil "actif" separe via replaceSourceAsync
  // -- constate en test reel : appeler replaceSourceAsync juste apres le
  // debut de lecture causait un GEL visible du lecteur natif, cout trop
  // eleve pour un gain de buffer marginal). L'objet source doit rester
  // stable entre preload et actif (cf. commentaire plus haut sur
  // useVideoPlayer qui recree le player si la reference change).
  const videoSource = useMemo(() => {
    if (!shouldLoad) return 'about:blank';
    const bufferConfig = isWifi
      ? {
          minBufferMs: 2_000,
          maxBufferMs: 50_000,
          bufferForPlaybackMs: 1_500,
          bufferForPlaybackAfterRebufferMs: 2_000,
          backBufferDurationMs: 2_000,
          preferredForwardBufferDurationMs: 30_000,
        }
      : networkQuality === 'slow' || networkQuality === 'unknown'
      ? {
          // minBufferMs DOIT être >= bufferForPlaybackAfterRebufferMs — ExoPlayer
          // lève IllegalArgumentException sinon ("minBufferMs cannot be less
          // than bufferForPlaybackAfterRebufferMs"), crash natif immédiat dès
          // l'initialisation du player. Avant ce fix : 1_500 < 2_500, crash
          // systématique hors wifi sur réseau 'slow'/'unknown' (confirmé par
          // logcat : IllegalArgumentException dans HybridVideoPlayer.initializePlayer).
          minBufferMs: 2_500,
          maxBufferMs: 10_000,
          bufferForPlaybackMs: 1_000,
          bufferForPlaybackAfterRebufferMs: 2_500,
          backBufferDurationMs: 500,
          preferredForwardBufferDurationMs: 3_000,
        }
      : {
          minBufferMs: 2_000,
          maxBufferMs: 15_000,
          bufferForPlaybackMs: 1_500,
          bufferForPlaybackAfterRebufferMs: 2_000,
          backBufferDurationMs: 1_000,
          preferredForwardBufferDurationMs: 6_000,
        };
    return { uri: videoUri!, bufferConfig };
  }, [videoUri, shouldLoad, isWifi, networkQuality]); // eslint-disable-line

  // Téléchargement en fond vers le cache disque — UNIQUEMENT sur isCachePriority
  // (le voisin immédiat, fenêtre plus étroite que isPreload), JAMAIS sur le reel
  // actif. Deux raisons à cette restriction :
  // 1. Le déclencher sur isActive faisait tourner un 2e flux réseau (le download
  //    du cache) en même temps que le streaming de lecture du même fichier sur
  //    le même appareil — rebuffers en pleine lecture même en wifi.
  // 2. Le déclencher sur TOUS les isPreload (jusqu'à 4 reels : 2 avant + 2 après)
  //    faisait démarrer jusqu'à 4 téléchargements cache d'un coup, notamment à
  //    l'OUVERTURE de l'écran (currentIndex=0) — pile quand l'utilisateur attend
  //    que la première vidéo démarre, ces téléchargements saturaient la bande
  //    passante et ralentissaient le premier chargement perçu.
  // isCachePriority (1 voisin en cellulaire, 2 en wifi — cf.
  // CACHE_PRELOAD_WINDOW_WIFI) garde le bénéfice du cache pour un swipe
  // normal sans jamais concurrencer le chargement initial ou actif.
  //
  // Échelonnement (2026-09) : en wifi, le 2e voisin (preloadDistance === 2)
  // attend (distance - 1) × CACHE_STAGGER_DELAY_MS avant de démarrer SON
  // téléchargement cache complet — le 1er voisin (distance 1) démarre
  // toujours immédiatement, le 2e après 1 délai, le 3e après 2 délais, etc.
  // Reprend le même principe que le préchargement vidéo léger (cf.
  // preloadReady plus haut) : étale la charge réseau au lieu de lancer
  // plusieurs téléchargements complets au même instant — nécessaire
  // maintenant que CACHE_PRELOAD_WINDOW_WIFI couvre jusqu'à 3 voisins (un
  // délai fixe pour "tout ce qui n'est pas distance 1" aurait fait démarrer
  // les distances 2 ET 3 au même instant). Annulé proprement si le slide
  // sort de la fenêtre de cache avant la fin du délai.
  useEffect(() => {
    if (cachedLocalUriRef.current || !reel.mp4_url) return; // déjà en cache, rien à faire
    if (!isCachePriority) return;
    if (preloadDistance <= 1) {
      reelVideoCache.cacheInBackground(reel.mp4_url).catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      reelVideoCache.cacheInBackground(reel.mp4_url!).catch(() => {});
    }, (preloadDistance - 1) * CACHE_STAGGER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [reel.mp4_url, isCachePriority, preloadDistance]);

  const hasMusic = !!(reel.music_url);
  const player = useVideoPlayer(videoSource, p => {
    // Si le reel a de la musique : vidéo en boucle silencieuse, le son vient de react-native-sound
    p.loop   = hasMusic;
    p.muted  = hasMusic ? true : muted;
    p.volume = hasMusic ? 0    : (muted ? 0 : 1.0);
  });

  // Sync loop/mute si hasMusic change (normalement stable après mount)
  useEffect(() => {
    try {
      player.loop   = hasMusic;
      player.muted  = hasMusic ? true : muted;
      player.volume = hasMusic ? 0    : (muted ? 0 : 1.0);
    } catch {}
  }, [hasMusic, muted]); // eslint-disable-line

  // ── Musique associée au reel ────────────────────────────────────────────────
  // Coordination stricte avec la vidéo : quand hasMusic, c'est CE bloc qui pilote play()/pause()
  // sur le player vidéo (silencieux, en boucle) — jamais l'effet play/pause générique plus bas,
  // qui se contente d'ignorer le player si hasMusic est vrai. Un seul chef d'orchestre à la fois.
  const musicSoundRef     = useRef<Sound | null>(null);
  const musicTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musicProgressRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musicRetryCountRef = useRef(0);
  const MUSIC_MAX_RETRIES = 2;
  // Refs stables pour startMusic (isActiveRef/onEndRef déclarés plus bas mais les refs existent dès le mount)
  const musicIsActiveRef = useRef(isActive);
  const musicOnEndRef    = useRef(onEnd);
  useEffect(() => { musicIsActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { musicOnEndRef.current    = onEnd;    }, [onEnd]);

  // Jeton d'invalidation : incrémenté à chaque stopMusic() pour ignorer le résultat d'un
  // chargement Sound async devenu obsolète (ex: on a scrollé loin avant que le fichier charge,
  // ou le reel est redevenu inactif pendant le chargement réseau du fichier audio).
  const musicLoadTokenRef = useRef(0);

  const stopMusic = useCallback((keepRetryCount = false) => {
    musicLoadTokenRef.current++;
    if (musicTimerRef.current)      { clearTimeout(musicTimerRef.current);       musicTimerRef.current      = null; }
    if (musicProgressRef.current)   { clearInterval(musicProgressRef.current);   musicProgressRef.current   = null; }
    if (musicRetryTimerRef.current) { clearTimeout(musicRetryTimerRef.current);  musicRetryTimerRef.current = null; }
    if (!keepRetryCount) musicRetryCountRef.current = 0;
    if (musicSoundRef.current) {
      musicSoundRef.current.stop();
      musicSoundRef.current.release();
      musicSoundRef.current = null;
    }
    try { player.pause(); } catch {}
  }, [player]);

  // Arme la progression + le timer de fin sur la position RÉELLE du son (interrogée via
  // getCurrentTime), jamais un chrono JS déconnecté — résiste aux pauses/reprises d'arrière-plan
  // et aux petits retards de scheduling du setInterval.
  const armMusicClip = useCallback((snd: Sound, startSec: number, clipDur: number) => {
    progressValue.value = 0;
    musicProgressRef.current = setInterval(() => {
      snd.getCurrentTime(pos => {
        const elapsed = Math.max(0, pos - startSec);
        progressValue.value = clipDur > 0 ? Math.min(elapsed / clipDur, 1) : 0;
        if (clipDur > 0 && elapsed >= clipDur) {
          stopMusic();
          if (mountedRef.current && musicIsActiveRef.current) {
            endedRef.current = true;
            setEnded(true);
            musicOnEndRef.current();
          }
        }
      });
    }, 150);
  }, [progressValue, stopMusic]);

  const startMusic = useCallback(() => {
    const url      = reel.music_url;
    if (!url) return;
    const startSec = reel.music_start_sec ?? 0;
    const endSec   = reel.music_end_sec   ?? 0;
    let   clipDur  = endSec > startSec ? endSec - startSec : 0;

    stopMusic(true);
    const myToken = ++musicLoadTokenRef.current;
    Sound.setCategory('Playback');
    const isRemote = url.startsWith('http://') || url.startsWith('https://');
    const snd = new Sound(url, isRemote ? (null as any) : '', err => {
      // Ce chargement a été invalidé entre-temps (stopMusic()/nouveau startMusic() appelé
      // pendant le chargement réseau) : ne jamais jouer un son devenu obsolète.
      if (myToken !== musicLoadTokenRef.current) { snd.release(); return; }
      if (err) {
        console.warn('[ReelMusic] load error:', err);
        snd.release();
        if (musicRetryCountRef.current < MUSIC_MAX_RETRIES && mountedRef.current) {
          musicRetryCountRef.current += 1;
          musicRetryTimerRef.current = setTimeout(() => {
            if (mountedRef.current && musicIsActiveRef.current && !pausedRef.current) startMusicRef.current();
          }, Math.pow(2, musicRetryCountRef.current) * 1000);
        }
        return;
      }
      if (!mountedRef.current) { snd.release(); return; }
      musicRetryCountRef.current = 0;
      if (startSec > 0) snd.setCurrentTime(startSec);
      musicSoundRef.current = snd;

      // clip mal renseigné (music_end_sec <= music_start_sec) : se rabattre sur la durée réelle
      // du fichier plutôt que de jouer sans jamais s'arrêter ni progresser.
      if (clipDur <= 0) {
        const d = snd.getDuration();
        clipDur = d > startSec ? d - startSec : d;
      }
      armMusicClip(snd, startSec, clipDur);

      // Démarrage synchronisé : le son ET la vidéo (boucle silencieuse) partent ensemble,
      // seulement une fois le fichier audio réellement prêt — jamais la vidéo seule en avance.
      // Si le slide est déjà en pause manuelle au moment où le chargement se termine
      // (ex: on arrive dessus alors qu'il était resté en pause), ne pas démarrer.
      if (musicIsActiveRef.current && !pausedRef.current) {
        snd.play(success => {
          if (!success) console.warn('[ReelMusic] playback failed for', url);
          musicSoundRef.current = null;
          snd.release();
        });
        try { player.play(); } catch {}
      }
    });
  }, [reel.music_url, reel.music_start_sec, reel.music_end_sec, stopMusic, armMusicClip, player]);

  const startMusicRef = useRef(startMusic);
  useEffect(() => { startMusicRef.current = startMusic; }, [startMusic]);

  // Démarrer/arrêter la musique selon isActive uniquement (pas `paused`) — un
  // simple pause/reprise (bouton play/pause manuel) ne doit jamais détruire et
  // recharger le fichier audio depuis le réseau : `doPause` gère lui-même le
  // pause()/play() sur le Sound déjà en mémoire, instantané et sans requête.
  // Ce chargement complet ne se justifie qu'au vrai montage/démontage du slide.
  useEffect(() => {
    if (isActive && reel.music_url) {
      startMusic();
    } else {
      stopMusic();
    }
    return () => { stopMusic(); };
  }, [isActive, reel.music_url, startMusic, stopMusic]);

  // Resynchronisation au retour d'arrière-plan : repositionner le son (et la vidéo en boucle)
  // sur base de la position réelle plutôt que de simplement relancer play() à l'aveugle.
  const resyncMusicOnForeground = useCallback(() => {
    const snd = musicSoundRef.current;
    if (!snd || !hasMusic) return;
    snd.play(success => {
      if (!success) console.warn('[ReelMusic] resync playback failed');
    });
    try { player.play(); } catch {}
  }, [hasMusic, player]);

  const resyncMusicOnForegroundRef = useRef(resyncMusicOnForeground);
  useEffect(() => { resyncMusicOnForegroundRef.current = resyncMusicOnForeground; }, [resyncMusicOnForeground]);

  const clearAllTimers = useCallback(() => {
    if (retryTimerRef.current)   { clearTimeout(retryTimerRef.current);   retryTimerRef.current   = null; }
    if (stallTimerRef.current)   { clearTimeout(stallTimerRef.current);   stallTimerRef.current   = null; }
    if (playTimerRef.current)    { clearTimeout(playTimerRef.current);    playTimerRef.current    = null; }
    if (stallingTimerRef.current){ clearTimeout(stallingTimerRef.current); stallingTimerRef.current = null; }
    if (controlsTimerRef.current){ clearTimeout(controlsTimerRef.current); controlsTimerRef.current = null; }
  }, []);

  // Cleanup complet au démontage
  useEffect(() => {
    mountedRef.current = true;
    const appSub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        clearAllTimers();
        try { player.pause(); } catch {}
      } else if (state === 'active') {
        // Retour au premier plan — reprendre si ce reel est actif et pas en pause manuelle
        if (isActiveRef.current && !pausedRef.current && mountedRef.current) {
          setTimeout(() => {
            if (isActiveRef.current && !pausedRef.current && mountedRef.current) {
              if (hasMusic) resyncMusicOnForegroundRef.current();
              else { try { player.play(); } catch {} }
            }
          }, 200);
        }
      }
    });
    return () => {
      mountedRef.current = false;
      appSub.remove();
      clearAllTimers();
      stopMusic();
      try { player.pause(); player.replaceSourceAsync({ uri: 'about:blank' }).catch(() => {}); } catch {}
    };
  }, []); // eslint-disable-line


  const clearStall = useCallback(() => {
    if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
  }, []);

  // URL réseau de secours — hls_url si présent (reels HLS existants), sinon
  // mp4_url (nouveaux reels, MP4 unique). Jamais le fichier caché local ici :
  // c'est la source fiable vers laquelle retomber en cas d'échec.
  const networkUri = reel.hls_url ?? reel.mp4_url ?? null;
  const doRetry = useCallback(() => {
    if (!mountedRef.current || !networkUri) return;
    clearStall();
    const attempt = retryCountRef.current;
    if (attempt >= MAX_RETRIES) {
      if (mountedRef.current) { setVideoError(true); setVideoPlaying(false); }
      return;
    }
    retryCountRef.current += 1;
    if (mountedRef.current) { setVideoError(false); setVideoLoaded(false); setVideoPlaying(false); }
    // Si l'échec vient d'un fichier caché disque (corrompu/zombie), on n'insiste jamais
    // sur ce même fichier local : on invalide l'entrée et on retombe sur le flux réseau,
    // toujours fiable. cachedLocalUriRef n'est relu qu'ici pour éviter qu'un fichier cassé
    // ne redéclenche indéfiniment la même erreur à chaque tentative.
    let retrySource = videoSource;
    if (cachedLocalUriRef.current && reel.mp4_url) {
      reelVideoCache.invalidateCacheEntry(reel.mp4_url);
      cachedLocalUriRef.current = null;
      retrySource = { ...(videoSource as any), uri: networkUri };
    }
    retryTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || !networkUri) return;
      try {
        player.replaceSourceAsync(retrySource as any)
          .then(() => { if (mountedRef.current && !pausedRef.current) { player.play(); } })
          .catch(() => { if (mountedRef.current) doRetry(); });
      } catch { if (mountedRef.current) doRetry(); }
    }, Math.pow(2, attempt) * 1000);
  }, [player, networkUri, reel.mp4_url, clearStall, videoSource]); // eslint-disable-line

  const armStall = useCallback(() => {
    clearStall();
    stallTimerRef.current = setTimeout(() => {
      if (mountedRef.current && !pausedRef.current) doRetry();
    }, STALL_TIMEOUT);
  }, [clearStall, doRetry]);

  // Refs stables pour lire les valeurs courantes dans les listeners sans les recréer
  const isActiveRef   = useRef(isActive);
  const onEndRef      = useRef(onEnd);
  const doRetryRef    = useRef(doRetry);
  const armStallRef   = useRef(armStall);
  const autoAdvanceRef = useRef(autoAdvance);
  useEffect(() => { isActiveRef.current   = isActive;   }, [isActive]);
  useEffect(() => { onEndRef.current      = onEnd;      }, [onEnd]);
  useEffect(() => { doRetryRef.current    = doRetry;    }, [doRetry]);
  useEffect(() => { armStallRef.current   = armStall;   }, [armStall]);
  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);

  // Listeners souscrits une seule fois par player — pas de re-souscription au scroll
  useEffect(() => {
    const subEnd   = player.addEventListener('onEnd', () => {
      clearStall();
      if (!isActiveRef.current || !mountedRef.current) return;
      if (autoAdvanceRef.current) {
        // Comportement historique : avance directement au reel suivant.
        endedRef.current = true; setEnded(true); onEndRef.current();
      } else {
        // Choix utilisateur : pas d'avance auto, la vidéo reprend simplement
        // du début — jamais d'écran "Revoir" à cliquer, elle boucle direct.
        try { player.seekTo(0); player.play(); } catch {}
      }
    });
    const subBuf   = player.addEventListener('onBuffer', (val: boolean) => {
      if (!mountedRef.current) return;
      if (val && isActiveRef.current && !pausedRef.current) armStallRef.current(); else clearStall();
    });
    const subLoad  = player.addEventListener('onLoad', (data: any) => {
      if (!mountedRef.current) return;
      setVideoLoaded(true); setVideoError(false); retryCountRef.current = 0; clearStall();
      if (data?.duration && data.duration > 0) { durationRef.current = data.duration; if (!hasMusic) progressValue.value = 0; }
      // hasMusic : la vidéo (boucle silencieuse) ne doit jamais démarrer seule ici — c'est
      // startMusic() qui déclenche player.play() une fois le fichier audio réellement chargé,
      // pour que le son et l'image partent synchronisés.
      if (!hasMusic && isActiveRef.current && !pausedRef.current) player.play();
    });
    const subProgress = player.addEventListener('onProgress', (data: any) => {
      // hasMusic : la progression affichée vient exclusivement de la position du son
      // (armMusicClip), jamais de cet event vidéo natif — sinon les deux se disputent
      // l'écriture de progressValue et la barre saccade.
      if (hasMusic || !mountedRef.current || !isActiveRef.current) return;
      const dur = durationRef.current;
      if (dur > 0) progressValue.value = Math.min(data.currentTime / dur, 1);
    });
    const subState = player.addEventListener('onPlaybackStateChange', ({ isPlaying, isBuffering }: any) => {
      if (!mountedRef.current) return;
      if (isPlaying) { setVideoPlaying(true); clearStall(); }
      else if (isBuffering && isActiveRef.current && !pausedRef.current) { setVideoPlaying(false); armStallRef.current(); }
    });
    const subErr   = player.addEventListener('onError', () => {
      if (!mountedRef.current) return;
      clearStall();
      if (isActiveRef.current) doRetryRef.current();
    });
    return () => { subEnd.remove(); subBuf.remove(); subLoad.remove(); subProgress.remove(); subState.remove(); subErr.remove(); };
  }, [player, clearStall]); // uniquement player — listeners stables

  // Play/Pause selon isActive/isPreload — approche TikTok stricte : UN SEUL player peut
  // jouer (et avoir du son) à la fois, celui du slide actif. Tous les voisins préchargés
  // restent en vraie pause en permanence : jamais de lecture, jamais de son, jamais
  // d'avancement de position avant l'activation. Le préchargement se limite au chargement
  // de la source (bufferConfig, cf. videoSource plus haut) — la vitesse de démarrage se
  // travaille via ce buffer, pas en faisant jouer les voisins en avance.
  useEffect(() => {
    if (!networkUri) return;
    if (playTimerRef.current) clearTimeout(playTimerRef.current);

    // Préférence "Lecture automatique" (Réglages > Lecture) : si désactivée,
    // un reel qui devient actif pour la 1ère fois (arrivée par scroll) démarre
    // en pause au lieu de se lancer seul — l'utilisateur doit taper pour lire,
    // exactement comme s'il avait tapé pause lui-même. Ne s'applique qu'à la
    // toute première activation (everPlayedRef encore faux) : un replay après
    // fin de lecture ou un retour sur un reel déjà lancé manuellement ne doit
    // pas se re-figer.
    if (isActive && !everPlayedRef.current && !pausedRef.current && !getPlaybackPrefs().autoplay) {
      pausedRef.current = true;
      if (mountedRef.current) setPaused(true);
    }

    if (isActive && !pausedRef.current) {
      // La vérification du cache disque (hasCachedFile) se fait PENDANT le
      // préchargement, jamais ici — changer videoSource au moment même où
      // isActive devient vrai forcerait useVideoPlayer à recréer le player et
      // rejouer depuis le début (double démarrage visible). Voir l'effet
      // [isPreload, preloadDistance, hasCachedFile, reel.mp4_url] plus haut.
      everPlayedRef.current = true;
      wasEndedOnActivate.current = endedRef.current;
      if (activePlayerRef) {
        (activePlayerRef as any).current = { pause: () => { try { player.pause(); } catch {} } };
      }
      if (audioOwnerRef) (audioOwnerRef as any).current = reel.id;
      const targetMuted  = hasMusic ? true : muted;
      const targetVolume = hasMusic ? 0    : (muted ? 0 : 1.0);
      try { player.muted = targetMuted; player.volume = targetVolume; } catch {}
      if (endedRef.current) {
        endedRef.current = false;
        if (mountedRef.current) setEnded(false);
        progressValue.value = 0;
        // hasMusic : ne pas relancer la vidéo ici — startMusic() (effet dédié plus haut, qui
        // se redéclenche aussi sur `isActive`) s'occupe de recharger/relancer le son ET la
        // vidéo ensemble. Seek à 0 seul évite une image figée en attendant.
        try { player.seekTo(0); } catch {}
        if (!hasMusic) setTimeout(() => { try { player.play(); } catch {} }, 30);
      } else if (!hasMusic) {
        try { player.play(); } catch {}
      }
      // hasMusic && !endedRef.current : rien à faire ici, startMusic() gère play() lui-même
      // dès que le son est chargé (cf. effet [isActive, paused, reel.music_url]).
    } else {
      // Préchargement (isPreload) ou hors fenêtre : toujours pause + son coupé, jamais l'inverse.
      if (audioOwnerRef && (audioOwnerRef as any).current === reel.id) (audioOwnerRef as any).current = null;
      try {
        player.pause();
        player.muted  = true;
        player.volume = 0;
      } catch {}
    }
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [isActive, isPreload, player]); // eslint-disable-line

  // Reset états quand inactif — garde videoLoaded + ended pour retour sans rechargement
  useEffect(() => {
    if (!isActive) {
      pausedRef.current = false; retryCountRef.current = 0;
      if (mountedRef.current) { setPaused(false); setVideoError(false); setVideoPlaying(false); setShowControls(false); }
      clearAllTimers(); clearStall();
    }
  }, [isActive, clearAllTimers, clearStall]);

  // Stalling : afficher le spinner seulement si la vidéo est bloquée depuis >1.5s
  useEffect(() => {
    if (stallingTimerRef.current) { clearTimeout(stallingTimerRef.current); stallingTimerRef.current = null; }
    if (videoPlaying || !isActive || paused || ended || videoError) {
      setIsStalling(false);
      return;
    }
    // Vidéo active mais pas en lecture — attendre 1.5s avant d'afficher le spinner
    stallingTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setIsStalling(true);
    }, 1500);
    return () => { if (stallingTimerRef.current) { clearTimeout(stallingTimerRef.current); stallingTimerRef.current = null; } };
  }, [videoPlaying, isActive, paused, ended, videoError]);

  // Mute — uniquement quand le reel est réellement actif : sinon ça écraserait le volume 0
  // forcé pendant le préchargement du voisin immédiat ou la pause des autres slides.
  useEffect(() => {
    if (!isActive) return;
    try { player.muted = hasMusic ? true : muted; player.volume = hasMusic ? 0 : (muted ? 0 : 1.0); } catch {}
  }, [muted, player, isActive, hasMusic]);

  // Ref info (concert / event / film)
  useEffect(() => {
    if (!isActive || (!reel.ref_concert_id && !reel.ref_event_id && !reel.ref_content_id)) return;
    let cancelled = false;
    (async () => {
      try {
        if (reel.ref_concert_id) {
          const res = await apiClient.get<any>(`/api/v1/concerts/${reel.ref_concert_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? 'Concert', kind: 'Concert', thumbnail: d.thumbnail_url ?? null, color: REEL_MUSIC });
          }
        } else if (reel.ref_event_id) {
          const res = await apiClient.get<any>(`/api/v1/events/${reel.ref_event_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? 'Événement', kind: 'Événement', thumbnail: d.thumbnail_url ?? null, color: REEL_LIKE });
          }
        } else if (reel.ref_content_id) {
          const res = await apiClient.get<any>(`/api/v1/content/films/${reel.ref_content_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? 'Film', kind: d.type === 'serie' ? 'Série' : 'Film', thumbnail: d.thumbnail_url ?? null, color: '#3B82F6' });
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isActive, reel.ref_concert_id, reel.ref_event_id, reel.ref_content_id]);

  // Animations
  const playIconOpacity  = useSharedValue(0);
  const playIconScale    = useSharedValue(0.6);
  const heartOpacity     = useSharedValue(0);
  const heartScale       = useSharedValue(0);
  const heartX           = useSharedValue(0);
  const heartY           = useSharedValue(0);
  const skipLeftOpacity  = useSharedValue(0);
  const skipLeftScale    = useSharedValue(0.5);
  const skipRightOpacity = useSharedValue(0);
  const skipRightScale   = useSharedValue(0.5);

  const playIconAnim = useAnimatedStyle(() => ({
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
    opacity: playIconOpacity.value, transform: [{ scale: playIconScale.value }],
  }));
  const heartAnim = useAnimatedStyle(() => ({
    position: 'absolute', opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }], left: heartX.value - 44, top: heartY.value - 44, zIndex: 10,
  }));
  const skipLeftAnim  = useAnimatedStyle(() => ({ opacity: skipLeftOpacity.value,  transform: [{ scale: skipLeftScale.value }] }));
  const skipRightAnim = useAnimatedStyle(() => ({ opacity: skipRightOpacity.value, transform: [{ scale: skipRightScale.value }] }));

  const showPlayIconAnim = useCallback(() => {
    playIconScale.value = 0.6; playIconOpacity.value = 0;
    playIconScale.value = withSpring(1, { damping: 10, stiffness: 200 });
    playIconOpacity.value = withSequence(withTiming(1, { duration: 0 }), withTiming(1, { duration: 300 }), withTiming(0, { duration: 150 }));
  }, [playIconOpacity, playIconScale]);

  const doPause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    try {
      if (next) {
        player.pause();
        // hasMusic : suspend le son déjà chargé en mémoire au lieu de le détruire
        // (stopMusic release()rait le Sound, forçant un rechargement réseau complet
        // à la reprise — lent et source de replays qui ne repartaient jamais).
        if (hasMusic) musicSoundRef.current?.pause();
      } else {
        // Si la vidéo était arrivée à sa fin naturelle avant la pause manuelle, le
        // player reste positionné en fin de flux — un simple play() ne redémarre rien
        // visuellement. Revenir au début avant de relancer, comme le fait déjà l'effet
        // play/pause générique au moment de l'activation d'un slide.
        if (endedRef.current) {
          endedRef.current = false;
          if (mountedRef.current) setEnded(false);
          progressValue.value = 0;
          player.seekTo(0);
        }
        // player.play() seul peut ne pas redémarrer visuellement le rendu après un
        // pause() prolongé (observé sur certains décodeurs HLS Android) — un léger
        // re-seek sur la position courante force le player à réafficher une frame
        // fraîche avant de relancer, comme le fait déjà doRetry() pour un vrai restart.
        try { player.seekTo(player.currentTime); } catch {}
        player.play();
        if (hasMusic) {
          if (musicSoundRef.current) musicSoundRef.current.play();
          else startMusic(); // Sound déjà libéré entre-temps (fin de clip, erreur) — recharge.
        }
      }
    } catch {}
    if (mountedRef.current) setPaused(next);
    showPlayIconAnim();
  }, [player, hasMusic, showPlayIconAnim, progressValue, startMusic]);

  const triggerShowControls = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (mountedRef.current) setShowControls(true);
    controlsTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setShowControls(false);
    }, 3000);
  }, []);

  const doLike = useCallback((x: number, y: number) => {
    if (!likeInFlight.current) {
      const wasLiked = likedRef.current;
      likedRef.current = !wasLiked; likeInFlight.current = true;
      setHeartLikeAction(!wasLiked);
      if (mountedRef.current) { setLiked(!wasLiked); setLikes(v => wasLiked ? v - 1 : v + 1); }
      socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id })
        .catch(() => {
          likedRef.current = wasLiked;
          if (mountedRef.current) { setLiked(wasLiked); setLikes(reel.like_count ?? 0); }
        })
        .finally(() => { likeInFlight.current = false; });
    }
    heartX.value = x; heartY.value = y;
    heartScale.value = 0;
    heartOpacity.value = withSequence(withTiming(1, { duration: 30 }), withTiming(1, { duration: 350 }), withTiming(0, { duration: 200 }));
    heartScale.value   = withSpring(1.2, { damping: 8, stiffness: 250 });
  }, [reel.id, reel.like_count, heartOpacity, heartScale, heartX, heartY]);

  const handleLike = useCallback(async () => {
    if (likeInFlight.current) return;
    likeInFlight.current = true;
    const wasLiked = likedRef.current;
    likedRef.current = !wasLiked;
    if (mountedRef.current) { setLiked(!wasLiked); setLikes(v => wasLiked ? v - 1 : v + 1); }
    try { await socialService.toggleReaction({ reaction_type: 'like' as ReactionType, reel_id: reel.id }); }
    catch { likedRef.current = wasLiked; if (mountedRef.current) { setLiked(wasLiked); setLikes(reel.like_count ?? 0); } }
    finally { likeInFlight.current = false; }
  }, [reel.id, reel.like_count]);

  const handleShare = useCallback(() => {
    setShowShare(true);
  }, []);

  const doReplay = useCallback(() => {
    try { player.seekTo(0); pausedRef.current = false; player.play(); if (mountedRef.current) { setEnded(false); setPaused(false); } } catch {}
  }, [player]);

  const doSkipAnim = useCallback((seconds: number) => {
    const isLeft = seconds < 0;
    const label  = isLeft ? `◄◄ ${Math.abs(seconds)}s` : `${seconds}s ►►`;
    if (isLeft) {
      setSkipLeftLabel(label);
      skipLeftOpacity.value = 0; skipLeftScale.value = 0.6;
      skipLeftOpacity.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0.8, { duration: 250 }), withTiming(0, { duration: 150 }));
      skipLeftScale.value   = withSequence(withTiming(1.15, { duration: 80 }), withTiming(1.0, { duration: 250 }), withTiming(0.6, { duration: 150 }));
    } else {
      setSkipRightLabel(label);
      skipRightOpacity.value = 0; skipRightScale.value = 0.6;
      skipRightOpacity.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0.8, { duration: 250 }), withTiming(0, { duration: 150 }));
      skipRightScale.value   = withSequence(withTiming(1.15, { duration: 80 }), withTiming(1.0, { duration: 250 }), withTiming(0.6, { duration: 150 }));
    }
    try { player.seekBy(seconds); } catch {}
  }, [player, skipLeftOpacity, skipLeftScale, skipRightOpacity, skipRightScale]);

  const handleFollow = useCallback(async () => {
    if (!reel.author?.id || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) { await userService.unfollow(String(reel.author.id)); setIsFollowing(false); }
      else             { await userService.follow(String(reel.author.id));   setIsFollowing(true);  }
    } catch {}
    finally { setFollowLoading(false); }
  }, [reel.author?.id, isFollowing, followLoading]);

  const retryLoad = useCallback(() => { retryCountRef.current = 0; doRetry(); }, [doRetry]);

  // Gestes — 1 tap = pause/controls, 2 taps = like/unlike. Exclusive seul ne suffit pas
  // toujours à garantir que le simple tap attende l'échec du double tap (le simple tap
  // et le "like" pouvaient se déclencher ensemble) — requireExternalGestureToFail force
  // explicitement cette dépendance : le singleTap ne se résout qu'après que le
  // reconnaisseur ait confirmé qu'aucun deuxième tap n'arrive.
  const doubleTap  = Gesture.Tap().numberOfTaps(2).maxDuration(300).runOnJS(true).onEnd(e => doLike(e.x, e.y));
  const singleTap  = Gesture.Tap().maxDuration(300).runOnJS(true)
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => { triggerShowControls(); doPause(); });
  // Appui long = ouvre le modal cadeau (remplace l'ancien bouton dédié dans la
  // colonne d'actions, jugée trop chargée). Indisponible sur son propre reel.
  const longPress  = Gesture.LongPress().minDuration(400).runOnJS(true)
    .onStart(() => { setGiftHoldStarted(true); if (!isOwnReel) setShowGiftPicker(true); });
  const tapGesture = Gesture.Exclusive(doubleTap, longPress, singleTap);

  // Scrub horizontal — "tirer" la vidéo avec le doigt, en direct, comme
  // l'ancienne barre de progression mais sur tout l'écran. Traverser toute la
  // largeur de l'écran parcourt toute la durée de la vidéo (s'adapte à sa
  // longueur). Met en pause pendant le drag pour un contrôle net, reprend au
  // relâchement seulement si la lecture n'était pas déjà en pause avant.
  const wasPlayingBeforeScrubRef = useRef(false);
  const scrubStartRatioRef = useRef(0);
  const hScrubGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .minDistance(10)
    .onStart(() => {
      const dur = durationRef.current;
      if (dur <= 0) return;
      wasPlayingBeforeScrubRef.current = !pausedRef.current;
      scrubStartRatioRef.current = progressValue.value;
      try { player.pause(); } catch {}
    })
    .onUpdate((e) => {
      const dur = durationRef.current;
      if (dur <= 0 || screenW <= 0) return;
      const deltaRatio = e.translationX / screenW;
      const ratio = Math.min(1, Math.max(0, scrubStartRatioRef.current + deltaRatio));
      progressValue.value = ratio;
      try { player.seekTo(ratio * dur); } catch {}
    })
    .onFinalize(() => {
      // Couvre la fin normale ET une annulation système du geste — la lecture
      // ne doit jamais rester bloquée en pause si le geste est interrompu.
      if (wasPlayingBeforeScrubRef.current && isActiveRef.current) { try { player.play(); } catch {} }
    });

  // safeBottom s'adapte toujours à l'appareil (zone sûre système — barre de
  // gestes Android, encoche bas iPhone) : jamais chevauchée. La tab bar
  // (Accueil/Découvrir/Reels/Profil) flotte en overlay par-dessus la vidéo
  // sur cet écran (voir AppTabBar.tsx, isReelsScreen) — sans ajouter sa
  // hauteur ici, le titre/description du reel se retrouvait caché dessous.
  // Même formule exacte que AppTabBar.tsx pour rester toujours synchronisé.
  const tabBarBottomPad = Platform.OS === 'android' ? Math.max(insetBottom, 12) : insetBottom;
  const tabBarOverlayH  = TAB_BAR_HEIGHT + tabBarBottomPad;
  const safeBottom    = Math.max(insetBottom, Platform.OS === 'android' ? 56 : 0) + tabBarOverlayH;
  // Barre de commentaire + barre de progression retirées (le tap sur "commenter"
  // dans la colonne d'actions ouvre CommentsBottomSheet) — la colonne d'actions
  // et les infos du reel se calent directement sur safeBottom, footer fixe.
  const COMMENT_BAR_H = 14;

  // Le fond sombre en bas (bottomGradient) doit s'adapter à ce qu'il y a
  // réellement à lire dans le footer (légende, musique, référence, source) —
  // avant, il gardait toujours la même hauteur (80% de l'écran), laissant une
  // bande noire vide bien visible quand le reel n'a aucune description.
  const hasFooterContent = !!captionSt || !!reel.music_name || !!reel.source_reel || !!refInfo;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000', overflow: 'hidden' }}>

      {/* Fond noir uni derrière le média en "contain" (voir plus bas) — plus de
          thumbnail flouté agrandi, juste le fond noir de la racine qui comble
          l'espace vide autour du média quel que soit son ratio. */}

      {/* Média réel — toujours "contain" : jamais rogné, quel que soit son ratio par
          rapport à l'écran (portrait strict 9:16, legerement different, ou paysage). */}
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH }}
        resizeMode="contain"
        controls={false}
        surfaceType="texture"
      />

      {/* Thumbnail retiree (2026-09) — demande explicite : jouer la video
          directement des l'arrivee sur le reel, sans jamais afficher de
          miniature en attendant (meme brievement). Le buffer/preload deja
          en place (bufferForPlaybackMs bas + prechargement du voisin
          immediat sans delai) doit suffire a limiter l'ecran noir de
          demarrage ; accepte que cet ecran noir bref reste visible plutot
          que de le masquer par une image chargee separement. */}

      {/* Overlay filtre principal — zIndex 1 */}
      {(() => {
        if (!reel.filter_name || reel.filter_name === 'original') return null;
        const fDef = FILTERS.find(f => f.key === reel.filter_name);
        const op   = FILTER_VIDEO_OPACITY[reel.filter_name as FilterKey] ?? 0;
        const op2  = FILTER_VIDEO_OPACITY2[reel.filter_name as FilterKey] ?? 0;
        if (!fDef || op === 0) return null;
        return (
          <>
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: fDef.overlay, opacity: op, zIndex: 1 }} />
            {fDef.overlay2 && op2 > 0 && (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: fDef.overlay2, opacity: op2, zIndex: 2 }} />
            )}
          </>
        );
      })()}

      {/* Text layers — positionnés exactement comme dans l'éditeur, zIndex 3 */}
      {reel.text_layers ? (() => {
        try {
          const layers: Array<{
            id: string; text: string; x: number; y: number;
            color: string; fontSize: number; bold: boolean; italic: boolean;
            bg: boolean; bgColor: string; align: string; outline: boolean;
          }> = JSON.parse(reel.text_layers);
          return layers.map(l => (
            <View key={l.id} pointerEvents="none" style={{ position: 'absolute', left: l.x, top: l.y, zIndex: 3, maxWidth: screenW - l.x - 8 }}>
              <Text style={{
                color:             l.color,
                fontSize:          l.fontSize,
                fontWeight:        l.bold ? '800' : '400',
                fontStyle:         l.italic ? 'italic' : 'normal',
                textAlign:         (l.align as any) ?? 'center',
                backgroundColor:   l.bg && l.bgColor !== 'transparent' ? l.bgColor : 'transparent',
                paddingHorizontal: l.bg ? 10 : 0,
                paddingVertical:   l.bg ? 5 : 0,
                borderRadius:      l.bg ? 8 : 0,
                textShadowColor:   l.outline ? (l.color === '#FFFFFF' ? '#000' : '#fff') : 'rgba(0,0,0,0.85)',
                textShadowOffset:  { width: l.outline ? 1 : 0, height: 1 },
                textShadowRadius:  l.outline ? 2 : 4,
              }}>
                {l.text}
              </Text>
            </View>
          ));
        } catch { return null; }
      })() : null}

      {/* Sticker layers — zIndex 4 */}
      {reel.sticker_layers ? (() => {
        try {
          const stickers: Array<{ id: string; emoji: string; x: number; y: number; scale: number }> = JSON.parse(reel.sticker_layers);
          return stickers.map(st => (
            <View key={st.id} pointerEvents="none" style={{ position: 'absolute', left: st.x, top: st.y, zIndex: 4 }}>
              <Text style={{ fontSize: 44 * (st.scale ?? 1) }}>{st.emoji}</Text>
            </View>
          ));
        } catch { return null; }
      })() : null}

      {/* Dessin libre — zIndex 5 */}
      {reel.draw_layers ? (() => {
        try {
          const paths: Array<{ id: string; color: string; width: number; points: { x: number; y: number }[] }> = JSON.parse(reel.draw_layers);
          return paths.map(path =>
            path.points.slice(0, -1).map((pt, i) => {
              const next = path.points[i + 1];
              const dx = next.x - pt.x; const dy = next.y - pt.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * 180 / Math.PI;
              return (
                <View key={`${path.id}_${i}`} pointerEvents="none" style={{
                  position: 'absolute', left: pt.x, top: pt.y - path.width / 2,
                  width: len, height: path.width, borderRadius: path.width / 2,
                  backgroundColor: path.color, zIndex: 5,
                  transform: [{ rotate: `${angle}deg` }],
                  transformOrigin: 'left center',
                }} />
              );
            })
          );
        } catch { return null; }
      })() : null}

      {/* Video adjust — simulé via couches de couleur, zIndex 6 */}
      {reel.video_adjust ? (() => {
        try {
          const { brightness, contrast, saturation, temperature }
            : { brightness: number; contrast: number; saturation: number; temperature: number }
            = JSON.parse(reel.video_adjust);
          return (
            <>
              {brightness > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(255,255,255,${brightness * 0.35})`, zIndex: 6 }} />}
              {brightness < 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${Math.abs(brightness) * 0.45})`, zIndex: 6 }} />}
              {temperature > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(255,120,0,${temperature * 0.18})`, zIndex: 6 }} />}
              {temperature < 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,120,255,${Math.abs(temperature) * 0.18})`, zIndex: 6 }} />}
              {saturation < 0  && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(128,128,128,${Math.abs(saturation) * 0.45})`, zIndex: 6 }} />}
              {contrast   > 0  && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${contrast * 0.12})`, zIndex: 6 }} />}
            </>
          );
        } catch { return null; }
      })() : null}

      {/* Spinner uniquement si vrai stall réseau (>1.5s sans lecture) */}
      {isStalling && (
        <ActivityIndicator
          size="large"
          color="rgba(255,255,255,0.85)"
          style={{ position: 'absolute', top: screenH / 2 - 20, left: 0, right: 0, alignItems: 'center' }}
        />
      )}

      {videoError && (
        <View style={s.errorOverlay}>
          <Icon name="wifi-off" size={40} color="rgba(255,255,255,0.7)" />
          <Text style={s.errorTitle}>Vidéo indisponible</Text>
          <Text style={s.errorSub}>Vérifiez votre connexion</Text>
          <TouchableOpacity style={s.retryBtn} onPress={retryLoad} activeOpacity={0.8}>
            <Icon name="refresh-cw" size={16} color="#fff" />
            <Text style={s.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      <GestureDetector gesture={Gesture.Simultaneous(hScrubGesture, tapGesture)}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: ui.reelInfoRight, bottom: safeBottom + COMMENT_BAR_H }} />
      </GestureDetector>

      {/* Tuto "appuyez et maintenez pour envoyer un cadeau" — seulement sur le
          reel actif, jamais sur son propre reel, et jamais avant que le tuto
          swipe (écran parent) ait fini pour ne pas superposer les 2 tutos. */}
      {isActive && !isOwnReel && giftHintEnabled && (
        <GiftHoldHint dismiss={giftHoldStarted} />
      )}

      <Animated.View pointerEvents="none" style={[s.skipRipple, s.skipRippleLeft,  skipLeftAnim]}><Text style={s.skipRippleTxt}>{skipLeftLabel}</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[s.skipRipple, s.skipRippleRight, skipRightAnim]}><Text style={s.skipRippleTxt}>{skipRightLabel}</Text></Animated.View>

      <Animated.View style={playIconAnim} pointerEvents="none">
        <View style={[s.playPauseCircle, { width: ui.playPause, height: ui.playPause, borderRadius: ui.playPause / 2 }]}><Icon name={paused ? 'play' : 'pause'} size={ui.playPauseIcon} color="#fff" /></View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={heartAnim}>
        {heartLikeAction
          ? <MCIcon name="heart" size={88} color={REEL_LIKE} />
          : <MCIcon name="heart-broken" size={88} color="rgba(255,255,255,0.7)" />
        }
      </Animated.View>

      {ended && (
        <View style={s.replayOverlay} pointerEvents="box-none">
          <TouchableOpacity style={s.replayBtn} onPress={doReplay} activeOpacity={0.85}>
            <Icon name="rotate-ccw" size={32} color="#fff" />
            <Text style={s.replayTxt}>Revoir</Text>
          </TouchableOpacity>
        </View>
      )}

      {showInterface && hasFooterContent && (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']}
          locations={[0, 0.5, 1]}
          style={s.bottomGradient}
          pointerEvents="none"
        />
      )}

      {!showInterface && (
        <TouchableOpacity
          style={[s.hiddenUiBanner, { top: insets.top + 68 }]}
          activeOpacity={0.85}
          onPress={() => nav.navigate('SettingsLecture' as never)}
        >
          <Icon name="eye-off" size={13} color="#fff" />
          <Text style={s.hiddenUiBannerText}>Interface masquée</Text>
          <Text style={s.hiddenUiBannerLink}>Réactiver</Text>
        </TouchableOpacity>
      )}

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">

        {showInterface && (
        <View style={[s.reelInfo, { bottom: safeBottom + COMMENT_BAR_H, right: ui.reelInfoRight }]} pointerEvents="box-none">
          {refInfo && (
            <View style={s.refBand}>
              <View style={[s.refKindDot, { backgroundColor: refInfo.color }]} />
              {refInfo.thumbnail
                ? <Image source={{ uri: refInfo.thumbnail }} style={s.refThumb} />
                : <View style={[s.refThumb, { backgroundColor: refInfo.color + '40', alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name={refInfo.kind === 'Concert' ? 'music' : refInfo.kind === 'Événement' ? 'calendar' : 'film'} size={10} color="#fff" />
                  </View>
              }
              <View style={{ flex: 1, overflow: 'hidden' }}>
                <Text style={s.refKind}>{refInfo.kind}</Text>
                <Text style={s.refLabel} numberOfLines={1}>{refInfo.label}</Text>
              </View>
              <Icon name="chevron-right" size={12} color="rgba(255,255,255,0.5)" />
            </View>
          )}

          <View style={s.authorRow}>
            <View style={{ position: 'relative' }}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => reel.author?.id && onAuthorPress(reel.author.id)}>
                <AvatarWithBadge
                  avatarUrl={reel.author?.avatar_url}
                  initials={getAuthorInitial(reel.author)}
                  size={30}
                  accentColor={colors.primary}
                  isLive={(reel.author as any)?.is_live}
                />
              </TouchableOpacity>
              {!isOwnReel && reel.author?.id && !isFollowing && (
                <TouchableOpacity
                  style={s.avatarFollowBtn}
                  activeOpacity={0.85}
                  disabled={followLoading}
                  onPress={handleFollow}
                >
                  {followLoading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Icon name="plus" size={11} color="#fff" />
                  }
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity activeOpacity={0.8} onPress={() => reel.author?.id && onAuthorPress(reel.author.id)} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[s.authorName, { fontSize: ui.authorName }]} numberOfLines={1}>{getAuthorLabel(reel.author)}</Text>
                {reel.author?.is_verified && <VerifiedBadge size={Math.round(12 * ui.scale)} />}
              </View>
              {/* Badge visible uniquement par le createur, jamais par les autres
                  spectateurs (cf. ai_analysis_status : "pending" tant que
                  ai.analyze_reel n'a pas termine, cote ai_service) — le reel
                  reste normalement visible/publie pendant ce temps, ce n'est
                  qu'un indicateur discret, pas un etat bloquant. */}
              {isOwnReel && reel.ai_analysis_status === 'pending' && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => nav.navigate('AiAnalysisStatus', { contentType: 'reel', contentId: reel.id, initialStatus: reel.ai_analysis_status })}
                  style={s.analysisPendingBadge}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.85)" />
                  <Text style={s.analysisPendingText}>Vérification en cours…</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            {/* Indice decouvrabilite du geste "appui long = cadeau" (2026-09) —
                le geste (cf. longPress plus bas, Gesture.LongPress sur toute la
                video) a remplace un ancien bouton dedie dans la colonne
                d'actions, le rendant invisible pour un nouvel utilisateur.
                Icone discrete, cliquable, affiche un toast explicatif a la
                demande plutot qu'un element permanent plus intrusif (bulle
                auto-affichee, tutoriel bloquant). Meme condition que le geste
                lui-meme (jamais sur son propre reel, qui ne peut pas recevoir
                de cadeau). */}
            {!isOwnReel && (
              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => toastService.info(
                  'Astuce',
                  'Appuyez longuement sur la vidéo pour envoyer un cadeau au créateur 🎁',
                )}
                style={{ padding: 2 }}
              >
                <Icon name="info" size={15} color="rgba(255,255,255,0.65)" />
              </TouchableOpacity>
            )}
            {!isOwnReel && reel.author?.id && (
              <TouchableOpacity
                onPress={handleFollow}
                activeOpacity={0.8}
                disabled={followLoading}
                style={{ paddingHorizontal: 11, paddingVertical: 4, borderRadius: 16, borderWidth: 1.5, borderColor: isFollowing ? 'rgba(255,255,255,0.4)' : '#fff', backgroundColor: isFollowing ? 'rgba(255,255,255,0.1)' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                {followLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>{isFollowing ? 'Suivi' : 'Suivre'}</Text>
                }
              </TouchableOpacity>
            )}
          </View>

          {captionSt ? <RichText text={captionSt} textStyle={[s.caption, { fontSize: ui.caption, lineHeight: Math.round(ui.caption * 1.42) }]} primaryColor="#93C5FD" maxLines={3} showLinkPreview={false} /> : null}

          {reel.music_name ? (
            <View style={s.musicBand} pointerEvents="none">
              <MCIcon name="music-note" size={11} color="#fff" />
              <Text style={s.musicBandTxt} numberOfLines={1}>
                {reel.music_name.replace(/\.(mp3|m4a|aac|wav|ogg|flac)$/i, '')}
              </Text>
            </View>
          ) : null}

          {reel.source_reel && (
            <View style={s.sourceBand}>
              <Icon name={reel.remix_type === 'remix' ? 'git-merge' : 'repeat'} size={9} color="rgba(255,255,255,0.7)" />
              {reel.source_reel.thumbnail_url
                ? <Image source={{ uri: reel.source_reel.thumbnail_url }} style={s.sourceThumb} />
                : null
              }
              <Text style={s.sourceText} numberOfLines={1}>
                {reel.remix_type === 'remix' ? 'Remix de' : 'Repost de'}{' '}
                <Text style={{ fontWeight: FontWeight.extraBold }}>
                  {reel.source_reel.author?.display_name || reel.source_reel.author?.username || 'un créateur'}
                </Text>
              </Text>
            </View>
          )}
        </View>
        )}

        {/* Pluie de cœurs — reel très aimé, indépendant de showInterface (effet
            visuel, pas un contrôle) */}
        <HeartRain active={isActive} likeCount={likes} contentId={reel.id} />

        {showInterface && (
        <View style={[s.actions, { bottom: safeBottom + COMMENT_BAR_H, gap: ui.railGap }]}>
          <ActionBtn ui={ui} icon="heart" useMCIcon label={formatCount(likes)} color={liked ? REEL_LIKE : '#fff'} onPress={handleLike} active={liked} activeBackground="rgba(224,56,154,0.25)" activeBorder={REEL_LIKE} activeGlow={REEL_LIKE} />
          {!commentsDisabledSt && <ActionBtn ui={ui} icon="comment" useMCIcon label={formatCount(commentCount)} color="#fff" onPress={() => setShowComments(true)} />}
          <ActionBtn ui={ui} icon="share-variant" useMCIcon label={formatCount(shareCount)} color="#fff" onPress={handleShare} />
          {/* Vues : simple indicateur, pas un bouton (rien à ouvrir) — allège la
              colonne d'un cran. Masqué sous 1 vue (reel neuf). */}
          {(reel.view_count ?? 0) > 0 && (
            <View style={[s.actionBtn, { gap: Math.round(3 * ui.scale) }]} pointerEvents="none">
              <View style={[s.actionCircle, { width: ui.actionCircle, height: ui.actionCircle, borderRadius: ui.actionCircle / 2 }]}><MCIcon name="eye" size={ui.actionIconMC} color="#fff" /></View>
              <Text style={[s.actionLabel, { fontSize: ui.actionLabel }]}>{formatCount(reel.view_count ?? 0)}</Text>
            </View>
          )}
          {/* Bouton ... — regroupe Remix, Cable, Signalement pour non-proprio */}
          {!isOwnReel && (
            <TouchableOpacity style={[s.actionBtn, { gap: Math.round(3 * ui.scale) }]} onPress={() => setShowRemix(true)} activeOpacity={0.8}>
              <View style={[s.actionCircle, { width: ui.actionCircle, height: ui.actionCircle, borderRadius: ui.actionCircle / 2 }]}>
                <Icon name="more-horizontal" size={ui.actionIcon} color="#fff" />
              </View>
              <Text style={[s.actionLabel, { fontSize: ui.actionLabel }]}>Plus</Text>
            </TouchableOpacity>
          )}
          {isOwnReel && (
            <TouchableOpacity style={[s.actionBtn, { gap: Math.round(3 * ui.scale) }]} onPress={() => setShowOwnerMenu(true)} activeOpacity={0.8}>
              <View style={[s.actionCircle, { width: ui.actionCircle, height: ui.actionCircle, borderRadius: ui.actionCircle / 2 }]}>
                <Icon name="more-vertical" size={ui.actionIcon} color="#fff" />
              </View>
            </TouchableOpacity>
          )}
        </View>
        )}

        <ReportModal visible={reportVisible} contentType="reel" contentId={reel.id} onClose={() => setReportVisible(false)} />

        {/* Owner menu — menu bas de page */}
        <Modal visible={showOwnerMenu} transparent animationType="slide" onRequestClose={() => setShowOwnerMenu(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowOwnerMenu(false)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={[s.menuSheet, { backgroundColor: colors.surface }]}>
                <View style={[s.sheetHandle, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={() => { setShowOwnerMenu(false); setEditCaptionText(captionSt); setShowEditCaption(true); }}>
                  <Icon name="edit-2" size={18} color={colors.textPrimary} />
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Modifier la description</Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={handleToggleFeedComments} disabled={togglingComments}>
                  <MCIcon name={commentsDisabledSt ? 'comment-check-outline' : 'comment-off-outline'} size={18} color={colors.textPrimary} />
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                    {commentsDisabledSt ? 'Activer les commentaires' : 'Desactiver les commentaires'}
                  </Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={() => { setShowOwnerMenu(false); nav.navigate('ReelStats' as any, { reelId: reel.id }); }}>
                  <Icon name="bar-chart-2" size={18} color={colors.textPrimary} />
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Stats du reel</Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity
                  style={s.menuItem}
                  disabled={reelDl.downloading}
                  onPress={() => { setShowOwnerMenu(false); handleDownloadReel(); }}
                >
                  {reelDl.downloading
                    ? <ActivityIndicator size="small" color={colors.textPrimary} />
                    : <Icon name={reelDl.localUri ? 'check' : 'download'} size={18} color={colors.textPrimary} />
                  }
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                    {reelDl.downloading ? `Téléchargement… ${reelDl.progress}%` : reelDl.localUri ? 'Enregistré dans Téléchargements' : 'Télécharger'}
                  </Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={handleDeleteReel}>
                  <Icon name="trash-2" size={18} color={colors.error} />
                  <Text style={[s.menuItemText, { color: colors.error }]}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ── Bottom sheet "..." unifié pour non-proprio ── */}
        <Modal visible={showRemix} transparent animationType="slide" onRequestClose={() => setShowRemix(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowRemix(false)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={[s.menuSheet, { backgroundColor: colors.surface }]}>
                <View style={[s.sheetHandle, { backgroundColor: colors.divider }]} />

                {/* ── En-tête : avatar + auteur ── */}
                {reel.author && (
                  <View style={s.sheetAuthorRow}>
                    {reel.author.avatar_url
                      ? <Image source={{ uri: reel.author.avatar_url }} style={s.sheetAvatar} />
                      : <View style={[s.sheetAvatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#fff', fontWeight: FontWeight.extraBold, fontSize: FontSize.smPlus }}>{getAuthorInitial(reel.author)}</Text></View>
                    }
                    <View style={{ flex: 1 }}>
                      <Text style={[s.sheetAuthorName, { color: colors.textPrimary }]} numberOfLines={1}>{getAuthorLabel(reel.author)}</Text>
                      <Text style={[s.sheetAuthorSub, { color: colors.textSecondary }]} numberOfLines={1}>{reel.caption ? reel.caption.slice(0, 55) : 'Reel'}</Text>
                    </View>
                  </View>
                )}

                {/* ── Stats remix / repost / cable ── */}
                <View style={s.sheetStats}>
                  <View style={s.sheetStat}>
                    <Icon name="git-merge" size={14} color="#A78BFA" />
                    <Text style={[s.sheetStatVal, { color: colors.textPrimary }]}>{formatCount(remixCountSt)}</Text>
                    <Text style={[s.sheetStatLbl, { color: colors.textTertiary }]}>Remix</Text>
                  </View>
                  <View style={[s.sheetStatSep, { backgroundColor: colors.divider }]} />
                  <View style={s.sheetStat}>
                    <Icon name="repeat" size={14} color="#A78BFA" />
                    <Text style={[s.sheetStatVal, { color: colors.textPrimary }]}>{formatCount(repostCountSt)}</Text>
                    <Text style={[s.sheetStatLbl, { color: colors.textTertiary }]}>Reposts</Text>
                  </View>
                  <View style={[s.sheetStatSep, { backgroundColor: colors.divider }]} />
                  <View style={s.sheetStat}>
                    <Icon name="link-2" size={14} color="#60A5FA" />
                    <Text style={[s.sheetStatVal, { color: colors.textPrimary }]}>{formatCount(cableCountSt)}</Text>
                    <Text style={[s.sheetStatLbl, { color: colors.textTertiary }]}>Cable</Text>
                  </View>
                  <View style={[s.sheetStatSep, { backgroundColor: colors.divider }]} />
                  <View style={s.sheetStat}>
                    <Icon name="share-2" size={14} color={colors.textSecondary} />
                    <Text style={[s.sheetStatVal, { color: colors.textPrimary }]}>{formatCount(shareCount)}</Text>
                    <Text style={[s.sheetStatLbl, { color: colors.textTertiary }]}>Partages</Text>
                  </View>
                </View>

                <View style={[s.menuDivider, { backgroundColor: colors.divider, marginHorizontal: 0 }]} />

                {/* ── Republier ── */}
                <TouchableOpacity style={s.menuItem} onPress={handleRepost} disabled={remixLoading}>
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
                    {remixLoading
                      ? <ActivityIndicator size="small" color="#A78BFA" />
                      : <Icon name="repeat" size={18} color="#A78BFA" />
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Republier</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>Partage ce reel sur ton profil avec attribution</Text>
                  </View>
                  {repostCountSt > 0 && (
                    <Text style={[s.sheetStatPill, { backgroundColor: 'rgba(167,139,250,0.15)', color: '#A78BFA' }]}>{formatCount(repostCountSt)}</Text>
                  )}
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* ── Remixer ── */}
                <TouchableOpacity style={s.menuItem} onPress={handleRemixer}>
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
                    <Icon name="git-merge" size={18} color="#A78BFA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Remixer</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>Crée ta propre version de ce reel</Text>
                  </View>
                  {remixCountSt > 0 && (
                    <Text style={[s.sheetStatPill, { backgroundColor: 'rgba(167,139,250,0.15)', color: '#A78BFA' }]}>{formatCount(remixCountSt)}</Text>
                  )}
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* ── Cable ── */}
                <TouchableOpacity
                  style={s.menuItem}
                  disabled={cableLoading}
                  onPress={() => {
                    if (!reel.author?.id) return;
                    const authorLabel = getAuthorLabel(reel.author);
                    showConfirm(
                      'Invitation Cable',
                      `Envoyer une invitation de collaboration à ${authorLabel} ?`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Envoyer',
                          onPress: async () => {
                            setShowRemix(false);
                            setCableLoading(true);
                            try {
                              await cableService.sendInvite(reel.id, String(reel.author!.id));
                              setCableCountSt(prev => prev + 1);
                              toastService.success('Invitation envoyée', `${authorLabel} a reçu ton invitation Cable.`);
                            } catch (err: any) {
                              const msg = err?.response?.data?.detail ?? "Erreur lors de l'envoi";
                              toastService.error('Erreur', msg);
                            } finally {
                              setCableLoading(false);
                            }
                          },
                        },
                      ],
                    );
                  }}
                >
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(96,165,250,0.15)' }]}>
                    {cableLoading
                      ? <ActivityIndicator size="small" color="#60A5FA" />
                      : <Icon name="link-2" size={18} color="#60A5FA" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Cable</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>Invite ce créateur à collaborer avec toi</Text>
                  </View>
                  {cableCountSt > 0 && (
                    <Text style={[s.sheetStatPill, { backgroundColor: 'rgba(96,165,250,0.15)', color: '#60A5FA' }]}>{formatCount(cableCountSt)}</Text>
                  )}
                </TouchableOpacity>

                {/* ── Mes invitations Cable ── */}
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => { setShowRemix(false); nav.navigate('CableInvites'); }}
                >
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(96,165,250,0.1)' }]}>
                    <Icon name="inbox" size={18} color="#60A5FA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Mes invitations Cable</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>Voir les invitations reçues et envoyées</Text>
                  </View>
                  <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* ── Voir le profil ── */}
                {reel.author?.id && (
                  <>
                    <TouchableOpacity
                      style={s.menuItem}
                      onPress={() => { setShowRemix(false); onAuthorPress(String(reel.author!.id)); }}
                    >
                      <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                        <Icon name="user" size={18} color={colors.textPrimary} />
                      </View>
                      <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Voir le profil</Text>
                    </TouchableOpacity>
                    <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                  </>
                )}

                {/* ── Télécharger ── */}
                <TouchableOpacity
                  style={s.menuItem}
                  disabled={reelDl.downloading}
                  onPress={() => { setShowRemix(false); handleDownloadReel(); }}
                >
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                    {reelDl.downloading
                      ? <ActivityIndicator size="small" color={colors.textPrimary} />
                      : <Icon name={reelDl.localUri ? 'check' : 'download'} size={18} color={colors.textPrimary} />
                    }
                  </View>
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                    {reelDl.downloading ? `Téléchargement… ${reelDl.progress}%` : reelDl.localUri ? 'Enregistré dans Téléchargements' : 'Télécharger'}
                  </Text>
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* ── Avance automatique — choix persistant de l'utilisateur : à la fin
                    de la vidéo, avancer au reel suivant (activé) ou la reprendre en
                    boucle (désactivé). ── */}
                <TouchableOpacity style={s.menuItem} onPress={onToggleAutoAdvance}>
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                    <Icon name="skip-forward" size={18} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Avance automatique</Text>
                    <Text style={[s.sheetItemSub, { color: colors.textSecondary }]}>
                      {autoAdvance ? 'Passe au reel suivant à la fin' : 'Rejoue ce reel en boucle'}
                    </Text>
                  </View>
                  <View style={[s.autoAdvanceToggle, { backgroundColor: autoAdvance ? colors.primary : colors.backgroundSecondary }]}>
                    <View style={[s.autoAdvanceKnob, { alignSelf: autoAdvance ? 'flex-end' : 'flex-start' }]} />
                  </View>
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* ── Signaler ── */}
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => { setShowRemix(false); setTimeout(() => setReportVisible(true), 300); }}
                >
                  <View style={[s.sheetItemIcon, { backgroundColor: colors.error + '1A' }]}>
                    <Icon name="flag" size={18} color={colors.error} />
                  </View>
                  <Text style={[s.menuItemText, { color: colors.error }]}>Signaler</Text>
                </TouchableOpacity>

              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Edit caption sheet */}
        <Modal visible={showEditCaption} transparent animationType="slide" onRequestClose={() => setShowEditCaption(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowEditCaption(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
                <View style={[s.editSheet, { backgroundColor: colors.surface }]}>
                  <View style={[s.editHandle, { backgroundColor: colors.divider }]} />
                  <Text style={[s.editTitle, { color: colors.textPrimary }]}>Modifier la description</Text>
                  <Text style={[s.editSubtitle, { color: colors.textTertiary }]}>Elle apparaît sous ton reel dans le fil.</Text>
                  <TextInput
                    value={editCaptionText}
                    onChangeText={setEditCaptionText}
                    multiline
                    maxLength={500}
                    style={[s.editInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Décris ton reel…"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={[s.charCount, { color: colors.textTertiary }]}>{editCaptionText.length}/500</Text>
                  <View style={s.editActions}>
                    <TouchableOpacity style={[s.editBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setShowEditCaption(false)}>
                      <Text style={[s.editBtnText, { color: colors.textSecondary }]}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.primary, opacity: savingCaption ? 0.6 : 1 }]} onPress={handleSaveCaption} disabled={savingCaption}>
                      {savingCaption ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.editBtnText, { color: '#fff' }]}>Enregistrer</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
        <ShareBottomSheet
          type="reel"
          reel={reel}
          visible={showShare}
          onClose={() => setShowShare(false)}
          onShareCountChange={() => { if (mountedRef.current) setShareCount(v => v + 1); }}
        />
        {showGiftPicker && reel.author?.id && (
          <GiftPickerModal
            reelId={reel.id}
            receiverId={String(reel.author.id)}
            receiverName={reel.author.display_name ?? reel.author.username ?? 'Créateur'}
            receiverAvatar={reel.author.avatar_url ?? null}
            onClose={() => setShowGiftPicker(false)}
          />
        )}

        {/* Progression du téléchargement affichée par le toast global (DownloadToast,
            rendu une fois au niveau racine dans RootNavigator) — visible sur n'importe
            quel écran, pas seulement Reels, et disparaît seul une fois terminé. */}

        <CommentsBottomSheet visible={showComments} onClose={() => setShowComments(false)} reelId={reel.id} commentsDisabled={commentsDisabledSt} onCommentAdded={() => setCommentCount(v => v + 1)} onCommentCountChange={delta => setCommentCount(v => v + delta)} />
      </View>
    </View>
  );
});

// ─── ActionBtn ────────────────────────────────────────────────────────────────

const ActionBtn: React.FC<{
  icon: string; iconActive?: string; label: string; color: string; onPress?: () => void;
  active?: boolean; activeBackground?: string; activeBorder?: string; activeGlow?: string;
  useMCIcon?: boolean; ui: ReelUI;
}> = ({ icon, iconActive, label, color, onPress, active, activeBackground, activeBorder, activeGlow, useMCIcon, ui }) => {
  const iconName = (active && iconActive) ? iconActive : icon;
  return (
    <TouchableOpacity style={[s.actionBtn, { gap: Math.round(3 * ui.scale) }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        s.actionCircle,
        { width: ui.actionCircle, height: ui.actionCircle, borderRadius: ui.actionCircle / 2 },
        active && activeBackground ? { backgroundColor: activeBackground } : {},
        active && activeBorder     ? { borderColor: activeBorder, borderWidth: 1.5 } : {},
        active && activeGlow       ? { shadowColor: activeGlow, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 } : {},
      ]}>
        {useMCIcon ? <MCIcon name={iconName} size={ui.actionIconMC} color={color} /> : <Icon name={iconName} size={ui.actionIcon} color={color} />}
      </View>
      {!!label && <Text style={[s.actionLabel, { color, fontSize: ui.actionLabel }]}>{label}</Text>}
    </TouchableOpacity>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '80%' },

  hiddenUiBanner: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7, zIndex: 9,
  },
  hiddenUiBannerText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  hiddenUiBannerLink: { color: '#fff', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },

  floatingHeader: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, gap: 10, zIndex: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  // flexShrink + minWidth:0 : le titre (nom d'auteur potentiellement long en
  // userMode) se tronque au lieu de pousser search/"Mes reels" hors écran.
  reelHeaderTitle: { color: '#fff', fontSize: FontSize['2xl'], fontWeight: FontWeight.extraBold, letterSpacing: 0.3, flexShrink: 1, minWidth: 0, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  searchFab:      { position: 'absolute', right: 16, width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },

  playPauseCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: OVERLAY_SURFACE, alignItems: 'center', justifyContent: 'center' },
  bufferOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', zIndex: 6, gap: 10 },
  bufferText: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.smPlus, fontWeight: FontWeight.medium },
  errorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 7, gap: 10 },
  errorTitle: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  errorSub:   { color: 'rgba(255,255,255,0.55)', fontSize: FontSize.smPlus },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: RR.pill, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // right: 84 — dégage la colonne d'actions (désormais 44px + marge). maxHeight
  // borne la pile de bandes (caption 3 lignes + musique + source + refBand +
  // FriendsWhoLiked) : au-delà, elle se contente de tronquer au lieu de remonter
  // derrière la colonne d'actions et le header.
  reelInfo:   { position: 'absolute', left: 14, right: 84, gap: 6, zIndex: 3, maxHeight: '46%' },
  authorRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Bouton "suivre" compact sur l'avatar (ancien "+" de remix retiré : doublon
  // avec "Plus → Remixer", et sans label il était illisible). N'apparaît que pour
  // les reels d'autrui non déjà suivis.
  avatarFollowBtn: { position: 'absolute', bottom: -6, alignSelf: 'center', width: 18, height: 18, borderRadius: 9, backgroundColor: REEL_LIKE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#000' },

  musicBand:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: REEL_MUSIC, borderRadius: RR.card, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', maxWidth: '80%', marginTop: 3 },
  musicBandTxt: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, flexShrink: 1 },
  musicBandDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)' },

  sourceBand:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: OVERLAY_SURFACE, borderRadius: RR.chip, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: OVERLAY_BORDER, alignSelf: 'flex-start', maxWidth: '100%' },
  sourceThumb: { width: 16, height: 16, borderRadius: 4, overflow: 'hidden' },
  sourceText:  { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs },
  authorName: { color: '#fff', fontWeight: FontWeight.extraBold, fontSize: FontSize.smPlus, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  caption:    { color: '#fff', fontSize: FontSize.sm, lineHeight: 17, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  analysisPendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  analysisPendingText:  { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },

  refBand:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: OVERLAY_SURFACE, borderRadius: RR.chip, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: OVERLAY_BORDER, alignSelf: 'flex-start', maxWidth: '100%' },
  refKindDot: { width: 6, height: 6, borderRadius: 3 },
  refThumb:   { width: 26, height: 26, borderRadius: RR.chip, overflow: 'hidden' },
  refKind:    { color: 'rgba(255,255,255,0.55)', fontSize: 8, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  refLabel:   { color: '#fff', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold },

  // Colonne d'actions — cercles 44px (zone tactile mini recommandée) au lieu de
  // 32, icônes 22 au lieu de 14-16, label 11 au lieu de 9. gap 14 pour aérer.
  actions:      { position: 'absolute', right: 8, alignItems: 'center', gap: 14, zIndex: 3 },
  actionBtn:    { alignItems: 'center', gap: 3 },
  actionCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: OVERLAY_SURFACE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: OVERLAY_BORDER },
  actionLabel:  { fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, color: '#fff', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },

  loadMoreIndicator: { position: 'absolute', bottom: 80, alignSelf: 'center', zIndex: 10 },


  // ── État vide — un seul style, réutilisé (feed vide + "Mes reels" vide) ────
  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 6 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: RR.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle:    { fontSize: FontSize.mdPlus, fontWeight: FontWeight.extraBold, letterSpacing: -0.2, textAlign: 'center' },
  emptyBody:     { fontSize: FontSize.smPlus, fontWeight: FontWeight.regular, lineHeight: 19, textAlign: 'center', marginBottom: 14 },
  emptyCta:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: RR.pill },
  emptyCtaText:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // ── "Mes reels" — zone à fond thème (grille + header) ──────────────────────
  mineHeader:        { flexDirection: 'row', alignItems: 'center', paddingBottom: 14, paddingHorizontal: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  mineHeaderTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.extraBold, letterSpacing: -0.3 },
  mineHeaderSub:     { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginTop: 1 },
  mineCreateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RR.pill },
  mineCreateBtnText: { color: '#fff', fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
  mineGrid:          { padding: 8, paddingTop: 12 },
  mineRow:           { gap: 8, marginBottom: 8 },
  mineCard:          { flex: 1, overflow: 'hidden', borderRadius: RR.media },
  mineThumb:         { width: '100%', aspectRatio: 9 / 14 },
  mineThumbFallback: { width: '100%', aspectRatio: 9 / 14, alignItems: 'center', justifyContent: 'center' },
  mineEffectBadge:   { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RR.chip, padding: 3 },
  mineOverlay:       { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  mineMenuBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: RR.pill, backgroundColor: 'rgba(255,255,255,0.15)' },
  mineStat:          { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mineStatText:      { color: '#fff', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold },

  // ── Sheets & menus contextuels — fond thème ───────────────────────────────
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  menuSheet:     { borderTopLeftRadius: RR.card, borderTopRightRadius: RR.card, paddingBottom: 36, paddingTop: 10 },
  menuItem:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 15 },
  menuItemText:  { flexShrink: 1, fontSize: FontSize.basePlus, fontWeight: FontWeight.semiBold, letterSpacing: -0.1 },
  menuDivider:   { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },

  sheetHandle:     { width: 40, height: 4, borderRadius: RR.pill, alignSelf: 'center', marginTop: 2, marginBottom: 10 },
  sheetAuthorRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 },
  sheetThumb:      { width: 44, height: 56, borderRadius: RR.media, overflow: 'hidden', flexShrink: 0 },
  sheetAvatar:     { width: 40, height: 40, borderRadius: RR.pill, overflow: 'hidden' },
  sheetAuthorName: { fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold, letterSpacing: -0.2 },
  sheetAuthorSub:  { fontSize: FontSize.sm, fontWeight: FontWeight.regular, marginTop: 2 },
  sheetStats:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 4, marginTop: 4, borderRadius: RR.media, backgroundColor: 'rgba(255,255,255,0.04)', paddingVertical: 12 },
  sheetStat:       { flex: 1, alignItems: 'center', gap: 3 },
  sheetStatVal:    { fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold },
  sheetStatLbl:    { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, letterSpacing: 0.4, textTransform: 'uppercase' },
  sheetStatSep:    { width: 1, height: 32, opacity: 0.25 },
  sheetStatPill:   { fontSize: FontSize.xsPlus, fontWeight: FontWeight.extraBold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RR.chip, overflow: 'hidden', marginLeft: 6 },
  sheetItemIcon:   { width: 40, height: 40, borderRadius: RR.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Sous-texte d'une ligne de menu : discret (textTertiary), léger, jamais en gras.
  sheetItemSub:    { fontSize: FontSize.sm, lineHeight: 16, marginTop: 2, fontWeight: FontWeight.regular },
  // Petit switch on/off — option "Avance automatique" du menu Plus.
  autoAdvanceToggle: { width: 40, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center', flexShrink: 0 },
  autoAdvanceKnob:   { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  // ── Bottom-sheet d'édition (description du reel) — un seul style ───────────
  editSheet:     { borderTopLeftRadius: RR.card, borderTopRightRadius: RR.card, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  editHandle:    { width: 40, height: 4, borderRadius: RR.pill, alignSelf: 'center', marginBottom: 16 },
  editTitle:     { fontSize: FontSize.mdPlus, fontWeight: FontWeight.extraBold, letterSpacing: -0.2, marginBottom: 4 },
  editSubtitle:  { fontSize: FontSize.smPlus, fontWeight: FontWeight.regular, marginBottom: 16 },
  editInput:     { borderWidth: 1, borderRadius: RR.media, paddingHorizontal: 14, paddingVertical: 12, fontSize: FontSize.basePlus, lineHeight: 21, minHeight: 96, textAlignVertical: 'top' },
  charCount:     { fontSize: FontSize.xsPlus, fontWeight: FontWeight.medium, textAlign: 'right', marginTop: 6, marginBottom: 18 },
  editActions:   { flexDirection: 'row', gap: 12 },
  editBtn:       { flex: 1, paddingVertical: 14, borderRadius: RR.media, alignItems: 'center', justifyContent: 'center' },
  editBtnText:   { fontSize: FontSize.basePlus, fontWeight: FontWeight.bold },

  // ── Overlay recherche — volontairement sombre (ambiance "reels") ───────────
  searchOverlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0a0a0a', zIndex: 50 },
  searchTopBar:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: RR.pill, height: 42, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput:     { flex: 1, fontSize: FontSize.base, color: '#fff', paddingHorizontal: 10, paddingVertical: 0 },
  searchClearBtn:  { width: 28, height: 28, borderRadius: RR.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', marginRight: 7 },

  searchGrid:           { padding: 10, paddingBottom: 50 },
  searchGridRow:        { gap: 8, marginBottom: 8 },
  searchCard:           { flex: 1, borderRadius: RR.media, overflow: 'hidden', backgroundColor: '#161616' },
  searchThumb:          { width: '100%', aspectRatio: 9 / 16 },
  searchThumbFallback:  { width: '100%', aspectRatio: 9 / 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1c' },
  searchCardGrad:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: '75%' },
  searchPlayBadge:      { position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: RR.pill, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  searchViewBadge:      { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: RR.chip },
  searchBadgeText:      { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  searchCardInfo:       { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 9, gap: 4 },
  searchCardAuthorRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchAvatar:         { width: 22, height: 22, borderRadius: RR.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  searchAvatarFallback: { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  searchAvatarText:     { color: '#fff', fontSize: FontSize['2xs'], fontWeight: FontWeight.bold },
  searchCardAuthor:     { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold, flex: 1 },
  searchCardCaption:    { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xsPlus, lineHeight: 15 },
  searchCardStats:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  searchCardStat:       { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  // Ratio moins extrême que les vraies cartes reel (9/16, format plein) — une
  // pub en grille reste plus lisible avec une hauteur réduite, proche 4/5.
  searchAdThumbCompact: { aspectRatio: 4 / 5 },
  searchAdFallback:     { backgroundColor: '#2A2340', alignItems: 'center', justifyContent: 'center' },
  searchAdCell:         { borderWidth: 1, borderColor: 'rgba(123,63,242,0.28)' },
  searchAdRule:         { position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 2 },
  searchAdMark:         { position: 'absolute', top: 9, left: 9, color: 'rgba(255,255,255,0.72)', fontSize: FontSize['2xs'], fontWeight: FontWeight.bold, letterSpacing: 1, textTransform: 'uppercase' },
  searchAdCtaRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  searchAdCtaText:      { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, flex: 1 },
  searchCenterState:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 60 },
  searchEmptyIcon:      { width: 72, height: 72, borderRadius: RR.pill, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  searchStateTitle:     { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.extraBold, letterSpacing: -0.2, marginTop: 4 },
  searchStateText:      { color: 'rgba(255,255,255,0.4)', fontSize: FontSize.smPlus, lineHeight: 18, textAlign: 'center', paddingHorizontal: 32 },

  replayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 6 },
  replayBtn:     { alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 28, paddingVertical: 18, borderRadius: RR.card },
  replayTxt:     { color: '#fff', fontSize: FontSize.basePlus, fontWeight: FontWeight.bold },

  skipRipple:      { position: 'absolute', top: 0, bottom: 0, width: '30%', alignItems: 'center', justifyContent: 'center', zIndex: 8 },
  skipRippleLeft:  { left: 0 },
  skipRippleRight: { right: 80 },
  skipRippleTxt:   { color: '#fff', fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: RR.card, overflow: 'hidden' },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  ownerMenuCard: { borderRadius: RR.media, borderWidth: StyleSheet.hairlineWidth, minWidth: 220, overflow: 'hidden' },
});
