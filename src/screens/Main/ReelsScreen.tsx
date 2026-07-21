import React, {
  useEffect, useState, useCallback, useRef, memo, useMemo,
} from 'react';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, Dimensions,
  TouchableOpacity, ActivityIndicator, StatusBar, Image,
  Platform, Alert, Modal, TextInput,
  KeyboardAvoidingView, Keyboard, AppState, Linking, BackHandler,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSequence, withTiming, withSpring, withRepeat,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { useIsWifi } from '../../hooks/useIsWifi';
import { useMediaDownload } from '../../hooks/useMediaDownload';
import { RichText } from '../../components/common/RichText';
import { apiClient, Endpoints } from '../../api';
import { reelService, socialService, authService, searchService } from '../../services';
import { cableService } from '../../services/cableService';
import { userService } from '../../services/userService';
import {
  CommentsBottomSheet, VerifiedBadge, ReportModal, GoFolyXLoader, ShareBottomSheet, FriendsWhoLiked,
  HeartRain, LikeNamesFeed, AvatarWithBadge,
} from '../../components/common';
import { GiftPickerModal } from '../../components/wallet/GiftPickerModal';
import type { Reel, ReactionType } from '../../types';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { type FilterKey, type ReelEditResult, FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2, ReelEditorScreen } from '../Create/ReelEditorScreen';
import Sound from 'react-native-sound';
import { BackButton } from '../../components/common';

type Nav = NativeStackNavigationProp<MainStackParamList>;

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


// ─── ReelsScreen ─────────────────────────────────────────────────────────────

// Feed reels avec pub injectee toutes les AD_INTERVAL reels — voir feedWithAds
// et toRenderedIndex (conversion d'index reels → index liste rendue).
const AD_INTERVAL = 5;

export const ReelsScreen: React.FC = () => {
  useKeepAwake();
  const isWifi = useIsWifi();
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }) => setScreenDims(screen));
    return () => sub.remove();
  }, []);

  const SCREEN_W = screenDims.width;
  const SCREEN_H = screenDims.height;
  const insets   = useSafeAreaInsets();
  const HEADER_H = insets.top + 54;
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
  // ── State ─────────────────────────────────────────────────────────────────
  const seedReel = useRef(
    userMode && params.initialReels && params.initialReels.length > 0
      ? (() => {
          const list = params.initialReels!.filter(r => !!r.hls_url);
          const targetId = params.initialReelId;
          if (targetId) {
            const idx = list.findIndex(r => r.id === targetId);
            if (idx > 0) { const [cur] = list.splice(idx, 1); list.unshift(cur); }
          }
          return list;
        })()
      : params.initialReel?.hls_url ? [params.initialReel as Reel] : []
  ).current;

  const [reels,         setReels]         = useState<Reel[]>(seedReel.length > 0 ? seedReel : []);
  const [myReels,       setMyReels]       = useState<Reel[]>([]);
  const [reelAd,        setReelAd]        = useState<{ id: string; title: string; description?: string; cta_text?: string; cta_url?: string; creative_url?: string; thumbnail_url?: string; advertiser_id?: string } | null>(null);
  // reelAdRef — toujours à jour, lisible depuis useFocusEffect (closure figée sur [])
  const reelAdRef = useRef(reelAd);
  reelAdRef.current = reelAd;
  const [menuReel,      setMenuReel]      = useState<Reel | null>(null);
  const [editReel,      setEditReel]      = useState<Reel | null>(null);
  const [editCaption,   setEditCaption]   = useState('');
  const [editSaving,    setEditSaving]    = useState(false);
  const [fullEditReel,  setFullEditReel]  = useState<Reel | null>(null); // édition effets visuels
  const [loading,       setLoading]       = useState(seedReel.length === 0 && !params.initialReelId);
  const [hasMore,       setHasMore]       = useState(true);
  const [tab,           setTab]           = useState<'feed' | 'mine'>('feed');
  const [myId,          setMyId]          = useState<string | null>(null);
  const [myAvatar,      setMyAvatar]      = useState<string | null>(null);
  const [myInitial,     setMyInitial]     = useState<string>('M');
  const [currentIndex,  setCurrentIndex]  = useState(0);
  const [listKey,       setListKey]       = useState('reels-0');
  const [screenFocused, setScreenFocused] = useState(true);
  const [muted,         setMuted]         = useState(false);
  const [searchOpen,    setSearchOpen]    = useState(false);
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

  // Refs stables pour éviter les closures stales
  const reelsRef        = useRef<Reel[]>(seedReel.length > 0 ? seedReel : []);
  const hasMoreRef      = useRef(true);
  const pendingScrollIdx  = useRef<number | null>(null);
  const isScrollingRef    = useRef(false);
  const scrollLockTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { reelsRef.current = reels; }, [reels]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  // toRenderedIndex — convertit un index dans `reels` en index dans la liste
  // RENDUE par la FlatList (feedWithAds, qui insère une pub toutes les AD_INTERVAL
  // reels). Sans cette conversion, scrollToOffset visait le mauvais item dès qu'une
  // pub précédait le reel cible. Lit reelAdRef (pas reelAd) pour rester correct même
  // appelé depuis useFocusEffect, dont la closure est figée au montage.
  const toRenderedIndex = useCallback((idx: number) => {
    if (userMode || !reelAdRef.current) return idx;
    return idx + Math.floor(idx / AD_INTERVAL);
  }, [userMode]);

  // Quand la liste change, tenter de résoudre pendingTarget si onLayout l'a manqué
  useEffect(() => {
    const target = pendingTargetRef.current;
    if (!target) return;
    const idx = reels.findIndex(r => r.id === target.id);
    if (idx < 0) return; // pas encore là — attendre le prochain update
    pendingTargetRef.current = null;
    // Offset basé sur l'index dans la liste RENDUE (avec pubs) — sinon on scrolle
    // vers le mauvais item dès qu'une pub précède le reel cible.
    const scrollIdx = toRenderedIndex(idx);
    currentIdxRef.current = idx;
    setCurrentIndex(idx);
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
  const load = useCallback(async (silent = false) => {
    if (!mountedRef.current) return;
    // Ne montrer le loading que si pas de contenu actuellement affiché
    if (!silent && reelsRef.current.length === 0) setLoading(true);
    pageRef.current = 1;
    isLoadingMoreRef.current = false;

    // Mode profil : GET /users/{id}/reels — liste complète d'un coup, pas de pagination,
    // pas de pub, pas de "mes reels" (tout ça n'a pas de sens hors du feed global).
    if (userMode) {
      try {
        const data = await userService.getUserReels(userMode) as Reel[];
        if (!mountedRef.current) return;
        const filtered = (Array.isArray(data) ? data : []).filter((r: Reel) => !!r.hls_url);
        setHasMore(false);
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
      const data = await reelService.getFeed({ page: 1 });
      if (!mountedRef.current) return;

      const filtered = (data.items ?? []).filter((r: Reel) => !!r.hls_url);

      setHasMore(data.has_more);
      lastLoadedAtRef.current = Date.now();

      if (!silent) {
        // CAS FOOTER — reset complet, index 0
        currentIdxRef.current = 0;
        setCurrentIndex(0);
        setReels(filtered);
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
      // Charger la pub reels en arriere-plan
      apiClient.get<{ id: string; title: string; advertiser_id?: string } | null>('/api/v1/ads/feed/next?placement=reels')
        .then(r => { if (r.data && mountedRef.current) setReelAd(r.data as any); })
        .catch(() => {});

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

  // ── Load more ─────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || !mountedRef.current) return;
    isLoadingMoreRef.current = true;
    try {
      const nextPage = pageRef.current + 1;
      const data     = await reelService.getFeed({ page: nextPage });
      if (!mountedRef.current) return;
      const newReels = (data.items ?? []).filter((r: Reel) => !!r.hls_url);
      setReels(prev => {
        const ids = new Set(prev.map(r => r.id));
        return [...prev, ...newReels.filter((r: Reel) => !ids.has(r.id))];
      });
      pageRef.current = nextPage;
      setHasMore(data.has_more);
    } catch { /* silencieux */ }
    finally { isLoadingMoreRef.current = false; }
  }, []);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    searchReqRef.current = term;
    if (!term) { setSearchResults([]); return; }
    if (!mountedRef.current) return;
    setSearching(true);
    try {
      const data = await reelService.search(term, 1, 20);
      // Ignore une réponse en retard (frappe rapide) qui ne correspond plus au terme actuel
      if (mountedRef.current && searchReqRef.current === term) {
        setSearchResults(data.items.filter((r: Reel) => !!r.hls_url));
      }
    } catch {
      if (mountedRef.current && searchReqRef.current === term) setSearchResults([]);
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
    setTimeout(() => searchInputRef.current?.focus(), 100);

    // Charge les reels tendance une seule fois par ouverture — affichés par défaut
    // avant toute frappe, et gardés visibles PENDANT la frappe (voir le rendu plus
    // bas) jusqu'à ce que de vrais résultats de recherche arrivent. L'API tendance
    // ne renvoie pas hls_url/author complets (contrat différent de la recherche) —
    // filtré aux champs sûrs pour l'affichage en grille ; le clic (pickSearchResult)
    // refetch l'objet complet via getById avant de lancer la lecture.
    setLoadingTrending(true);
    searchService.getTrendingReels()
      .then(items => setTrendingReels(Array.isArray(items) ? items : []))
      .catch(() => setTrendingReels([]))
      .finally(() => setLoadingTrending(false));
  }, []);

  const closeSearch = useCallback(() => {
    if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    Keyboard.dismiss();
  }, []);

  // Clic sur une carte "Mes Reels" → page dédiée plein écran
  const handlePlayFromMine = useCallback((r: Reel) => {
    nav.navigate('ReelPlayer', { reel: r });
  }, [nav]);

  const pickSearchResult = useCallback(async (r: Reel) => {
    closeSearch();
    const idx = reelsRef.current.findIndex(x => x.id === r.id);
    if (idx >= 0) {
      currentIdxRef.current = idx;
      setCurrentIndex(idx);
      setTimeout(() => listRef.current?.scrollToIndex({ index: idx, animated: false }), 50);
      return;
    }
    // Les reels tendance (getTrendingReels) n'ont pas hls_url/author complets —
    // refetch l'objet complet avant de le jouer pour ne jamais lancer une lecture
    // avec un flux vidéo manquant.
    let full = r;
    if (!r.hls_url) {
      try { full = await reelService.getById(r.id); } catch { /* joue r tel quel, best-effort */ }
    }
    setReels(prev => [full, ...prev.filter(x => x.id !== full.id)]);
    currentIdxRef.current = 0;
    setCurrentIndex(0);
    // Sans ce scroll, le reel est bien injecté en tête de `reels` mais la FlatList
    // reste visuellement à la position de scroll où l'utilisateur était avant
    // d'ouvrir la recherche — currentIndex changeait déjà côté état React, mais
    // rien ne faisait bouger l'écran affiché (c'était le bug : le reel choisi
    // n'apparaissait jamais). setTimeout laisse le nouvel item être rendu par la
    // FlatList (après le setReels ci-dessus) avant de tenter le scroll vers lui.
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), 50);
  }, [closeSearch]);

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

      const existingIdx = reelsRef.current.findIndex(r => r.id === targetId);
      if (existingIdx >= 0) {
        // Reel déjà dans la liste → scroll direct, mais l'offset doit se baser sur
        // l'index dans la liste RENDUE (avec pubs), pas sur l'index dans reels seul.
        const scrollIdx = toRenderedIndex(existingIdx);
        currentIdxRef.current = existingIdx;
        setCurrentIndex(existingIdx);
        isScrollingRef.current = true;
        if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
        scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 1200);
        listRef.current?.scrollToOffset({ offset: SCREEN_H * scrollIdx, animated: false });
      } else if (targetReel?.hls_url) {
        // Reel absent mais on a l'objet → injecter en tête
        const injected = [targetReel, ...reelsRef.current.filter(r => r.id !== targetId)];
        reelsRef.current = injected;
        setReels(injected);
        currentIdxRef.current = 0;
        setCurrentIndex(0);
        isScrollingRef.current = true;
        if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
        scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 1200);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else {
        // Pas d'objet reel — charger en background
        pendingTargetRef.current = { id: targetId };
        load(true);
      }
    } else {
      // CAS FOOTER — navigation normale
      if (!didFocusOnceRef.current) {
        load(false);
      } else {
        const age = Date.now() - lastLoadedAtRef.current;
        if (age > 90_000) load(true);
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
    Alert.alert('Supprimer ce reel ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await reelService.delete(reel.id);
            setMyReels(prev => prev.filter(r => r.id !== reel.id));
            setReels(prev => prev.filter(r => r.id !== reel.id));
          } catch (e: any) {
            Alert.alert('Erreur', e?.message ?? 'Impossible de supprimer.');
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
      Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder les modifications.');
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
      Alert.alert('Erreur', e?.message ?? 'Impossible de modifier.');
    } finally {
      setEditSaving(false);
    }
  }, [editReel, editCaption]);

  // ── Navigation reel suivant ───────────────────────────────────────────────
  const goNextReel = useCallback(() => {
    const next = currentIdxRef.current + 1;
    if (next < reelsRef.current.length) {
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
    const bounded = Math.max(0, Math.min(idx, reelsRef.current.length - 1));
    if (bounded === currentIdxRef.current) return;

    try { activePlayerRef.current?.pause(); } catch {}

    currentIdxRef.current = bounded;
    setCurrentIndex(bounded);

    sendViewForCurrent();
    const cur = reelsRef.current[bounded];
    if (cur) currentReelRef.current = { id: cur.id, startTime: Date.now() };

    if (bounded >= reelsRef.current.length - 3) loadMoreRef.current();
  }, [SCREEN_H, sendViewForCurrent]);

  // ── Callbacks stables ─────────────────────────────────────────────────────
  const onAuthorPress = useCallback((userId: string) => nav.navigate('UserProfile', { userId }), [nav]);

  const feedWithAds = useMemo(() => {
    if (userMode || !reelAd) return reels;
    const result: (Reel | { _isAd: true; id: string; ad: typeof reelAd })[] = [];
    reels.forEach((r, i) => {
      result.push(r);
      if ((i + 1) % AD_INTERVAL === 0) {
        result.push({ _isAd: true, id: `ad-${reelAd.id}-${i}`, ad: reelAd });
      }
    });
    return result;
  }, [reels, reelAd]);

  const renderVideoSlide = useCallback(({ item, index }: { item: any; index: number }) => {
    if (item._isAd) {
      return (
        <AdSlide
          ad={item.ad}
          isActive={index === currentIndex && screenFocused}
          muted={muted}
          screenW={SCREEN_W}
          screenH={SCREEN_H}
          insetBottom={insets.bottom}
          onAuthorPress={onAuthorPress}
        />
      );
    }
    // Hors wifi, on ne précharge que le voisin immédiat (1) au lieu de 2 devant/derrière —
    // chaque voisin préchargé télécharge jusqu'à preferredForwardBufferDurationMs de HLS
    // même sans être affiché, ce qui consommait des données mobiles pour rien.
    const preloadWindow = isWifi ? 2 : 1;
    return (
      <VideoSlide
        reel={item}
        isActive={index === currentIndex && screenFocused}
        isPreload={Math.abs(index - currentIndex) <= preloadWindow && index !== currentIndex}
        isWifi={isWifi}
        muted={muted}
        screenW={SCREEN_W}
        screenH={SCREEN_H}
        insetBottom={insets.bottom}
        colors={colors}
        currentUserId={myId ?? undefined}
        currentUserAvatar={myAvatar ?? undefined}
        currentUserInitial={myInitial}
        onToggleMute={toggleMute}
        onAuthorPress={onAuthorPress}
        onEnd={goNextReel}
        activePlayerRef={activePlayerRef}
        audioOwnerRef={audioOwnerRef}
      />
    );
  }, [currentIndex, screenFocused, muted, insets.bottom, colors, myId, myAvatar, myInitial, toggleMute, onAuthorPress, goNextReel, reelAd, SCREEN_W, SCREEN_H, isWifi]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading && reels.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <GoFolyXLoader variant="reel" color="#ffffff" />
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Icon name="film" size={48} color={colors.textDisabled} />
          <Text style={{ color: colors.textTertiary, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
            Aucun reel disponible
          </Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8, borderRadius: 10 }}
            onPress={() => nav.navigate('CreateReel')}
          >
            <Icon name="plus" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Ajouter un reel</Text>
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
            <Text style={[s.mineHeaderTitle, { color: colors.primary }]}>Mes Reels</Text>
            {myReels.length > 0 && (
              <Text style={[s.mineHeaderSub, { color: colors.textSecondary }]}>{myReels.length} video{myReels.length > 1 ? 's' : ''}</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => nav.navigate('CreateReel')} style={[s.mineCreateBtn, { backgroundColor: colors.primary }]}>
            <Icon name="plus" size={18} color="#fff" />
            <Text style={s.mineCreateBtnText}>Nouveau</Text>
          </TouchableOpacity>
        </View>

        {myReels.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Icon name="film" size={36} color={colors.primary} />
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Aucun reel</Text>
            <TouchableOpacity style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }} onPress={() => nav.navigate('CreateReel')}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Créer mon premier reel</Text>
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

        <Modal visible={!!menuReel} transparent animationType="fade" onRequestClose={() => setMenuReel(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setMenuReel(null)}>
            <View style={[s.menuSheet, { backgroundColor: colors.backgroundSecondary }]}>
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
                  {menuReel?.comments_disabled ? 'Activer les commentaires' : 'Desactiver les commentaires'}
                </Text>
              </TouchableOpacity>
              <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity style={s.menuItem} onPress={() => menuReel && handleDeleteReel(menuReel)}>
                <Icon name="trash-2" size={18} color="#E0389A" />
                <Text style={[s.menuItemText, { color: '#E0389A' }]}>Supprimer le reel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal visible={!!editReel} transparent animationType="slide" onRequestClose={() => setEditReel(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setEditReel(null)}>
            <View style={[s.editSheet, { backgroundColor: colors.backgroundSecondary }]} onStartShouldSetResponder={() => true}>
              <Text style={[s.editTitle, { color: colors.textPrimary }]}>Modifier la description</Text>
              <TextInput
                value={editCaption}
                onChangeText={setEditCaption}
                placeholder="Description…"
                placeholderTextColor={colors.textDisabled}
                multiline
                maxLength={300}
                style={[s.editInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              />
              <Text style={[s.charCount, { color: colors.textTertiary }]}>{editCaption.length}/300</Text>
              <View style={s.editActions}>
                <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.border }]} onPress={() => setEditReel(null)}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.primary }]} onPress={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>}
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
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <FlatList
        ref={listRef}
        data={feedWithAds as any[]}
        keyExtractor={r => (r as any).id}
        style={{ flex: 1, overflow: 'hidden' }}
        pagingEnabled={false}
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        disableIntervalMomentum
        onScroll={e => onScrollUpdate(e.nativeEvent.contentOffset.y)}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        extraData={`${currentIndex}-${screenFocused}-${muted}`}
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
            // Reel trouvé — scroll direct avec verrou. Offset basé sur l'index dans
            // la liste RENDUE (avec pubs), sinon on scrolle vers le mauvais item dès
            // qu'une pub précède le reel cible.
            const scrollIdx = toRenderedIndex(idx);
            currentIdxRef.current = idx;
            setCurrentIndex(idx);
            isScrollingRef.current = true;
            if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
            scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 600);
            listRef.current?.scrollToOffset({ offset: SCREEN_H * scrollIdx, animated: false });
          } else if (target.reel?.hls_url) {
            // Reel pas encore chargé — injecter en tête et afficher
            const injected = [target.reel, ...list.filter(r => r.id !== target.id)];
            reelsRef.current = injected;
            setReels(injected);
            currentIdxRef.current = 0;
            setCurrentIndex(0);
            isScrollingRef.current = true;
            if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
            scrollLockTimer.current = setTimeout(() => { isScrollingRef.current = false; }, 600);
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
          }
        }}
        renderItem={renderVideoSlide}
        removeClippedSubviews={false}
        maxToRenderPerBatch={3}
        windowSize={7}
        initialNumToRender={3}
      />

      {/* Gradient haut — assure lisibilité du header sur toute vidéo */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.0)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 80, zIndex: 9 }}
        pointerEvents="none"
      />

      {/* Header flottant */}
      <View style={[s.floatingHeader, { top: insets.top + 6 }]} pointerEvents="box-none">
        <BackButton onPress={() => nav.canGoBack() ? nav.goBack() : nav.navigate('Feed' as any)} transparent color="#fff" />
        <Text style={s.reelHeaderTitle}>
          {userMode ? getAuthorLabel(reels[0]?.author) : 'Reels'}
        </Text>
        {!userMode && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} pointerEvents="box-none">
            <TouchableOpacity onPress={openSearch} style={s.iconBtn}>
              <Icon name="search" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTab('mine')}
              style={[s.myReelsBtn, { backgroundColor: colors.primary + '30', borderColor: colors.primary + '60' }]}
            >
              <Icon name="user" size={14} color="#fff" />
              <Text style={s.myReelsBtnText}>Mes reels</Text>
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
                  <ActivityIndicator color="#fff" size="large" />
                  <Text style={s.searchStateText}>Recherche en cours…</Text>
                </View>
              );
            }
            if (gridData) {
              return (
                <FlatList
                  key="search-grid"
                  data={gridData}
                  keyExtractor={r => r.id}
                  numColumns={2}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={s.searchGrid}
                  columnWrapperStyle={s.searchGridRow}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
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
                          <MCIcon name="heart" size={10} color="#E0389A" />
                          <Text style={s.searchCardStat}>{formatCount(item.like_count)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
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
                  <ActivityIndicator color="#fff" size="large" />
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
  advertiser_id?: string;
}

const AdSlide: React.FC<{ ad: AdData; isActive: boolean; muted: boolean; screenW: number; screenH: number; insetBottom: number; onAuthorPress: (userId: string) => void }> = memo(({
  ad, isActive, muted, screenW, screenH, insetBottom, onAuthorPress,
}) => {
  const safeBottom = Math.max(insetBottom, Platform.OS === 'android' ? 56 : 0);
  const isVideo = !!(ad.creative_url && (ad.creative_url.includes('.m3u8') || ad.creative_url.includes('/hls/') || ad.creative_url.includes('video')));
  const player = useVideoPlayer(
    isVideo && ad.creative_url ? { uri: ad.creative_url } : 'about:blank',
    p => { p.loop = true; p.muted = muted; p.volume = muted ? 0 : 1; },
  );

  useEffect(() => {
    if (!isVideo) return;
    try { if (isActive) player.play(); else player.pause(); } catch {}
  }, [isActive, isVideo, player]);

  useEffect(() => {
    try { player.muted = muted; player.volume = muted ? 0 : 1; } catch {}
  }, [muted, player]);

  // Track impression une seule fois
  const impressionSent = useRef(false);
  useEffect(() => {
    if (isActive && !impressionSent.current) {
      impressionSent.current = true;
      apiClient.post(`/api/v1/ads/${ad.id}/impression`, {}).catch(() => {});
    }
  }, [isActive, ad.id]);

  // cta_url peut contenir soit un lien web, soit un numéro de téléphone brut (l'admin
  // saisit l'un ou l'autre sans distinction de champ côté backend) — on détecte le
  // type pour adapter le CTA affiché ("En savoir plus" vs "Contactez-nous") et le
  // schéma d'ouverture (tel: pour composer, http(s) sinon).
  const rawCta   = (ad.cta_url ?? '').trim();
  const isPhone  = !!rawCta && !/^https?:\/\//i.test(rawCta) && /^[+()\d\s.-]{6,}$/.test(rawCta.replace(/^tel:/i, ''));
  const ctaPhone = isPhone ? rawCta.replace(/^tel:/i, '') : null;

  const handleCta = () => {
    apiClient.post(`/api/v1/ads/${ad.id}/click`, {}).catch(() => {});
    if (!rawCta) return;
    const target = isPhone ? `tel:${ctaPhone}` : rawCta;
    Linking.openURL(target).catch(() => {});
  };

  const badgePulse = useSharedValue(1);
  useEffect(() => {
    badgePulse.value = withRepeat(withSequence(withTiming(0.4, { duration: 700 }), withTiming(1, { duration: 700 })), -1, true);
  }, [badgePulse]);
  const badgeDotStyle = useAnimatedStyle(() => ({ opacity: badgePulse.value }));

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000' }}>

      {/* ── Media plein écran ── */}
      {isVideo && ad.creative_url ? (
        <VideoView player={player} style={{ position: 'absolute', width: screenW, height: screenH }} resizeMode="cover" controls={false} />
      ) : (ad.creative_url || ad.thumbnail_url) ? (
        <Image source={{ uri: ad.creative_url || ad.thumbnail_url }} style={{ position: 'absolute', width: screenW, height: screenH }} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#1a0533', '#0d1b4b', '#0a2a1a']} style={{ position: 'absolute', width: screenW, height: screenH }} />
      )}

      {/* ── Voile léger en haut pour lisibilité du header, quel que soit le média ── */}
      <LinearGradient
        colors={['#00000070', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }}
        pointerEvents="none"
      />

      {/* ── Badge "Sponsorisé" — sous le header flottant (bouton retour + titre "Reels"),
          jamais à la même hauteur pour éviter tout chevauchement. Aligné à droite pour
          rester lisible même quand le header est en mode recherche/mes reels. ── */}
      <View style={{ position: 'absolute', top: insetBottom > 0 ? 96 : 86, right: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(20,18,30,0.68)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}>
        <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E0389A' }, badgeDotStyle]} />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>Sponsorisé</Text>
      </View>

      {/* ── Gradient bas — plus profond pour porter le bloc CTA sans écraser le média ── */}
      <LinearGradient
        colors={['transparent', '#00000090', '#000000F2']}
        locations={[0, 0.45, 1]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: screenH * 0.62 }}
        pointerEvents="none"
      />

      {/* ── Contenu bas — même position que les reels normaux (au-dessus de la barre de
          commentaire), ordre annonceur → description → CTA, de haut en bas. AdSlide n'a pas
          de colonne d'actions à droite (pas de mute/like superposé) — tout reste plein largeur. ── */}
      <View style={{ position: 'absolute', bottom: safeBottom + 88, left: 0, right: 0, paddingHorizontal: 16, gap: 12 }}>

        {/* Annonceur row — cliquable vers le profil de l'annonceur (advertiser_id = User.id) */}
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={!ad.advertiser_id}
          onPress={() => ad.advertiser_id && onAuthorPress(ad.advertiser_id)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 38, height: 38, borderRadius: 19, padding: 2 }}>
            <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1a1a2e' }}>
              {ad.thumbnail_url ? (
                <Image source={{ uri: ad.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="zap" size={15} color="#fff" />
                </View>
              )}
            </View>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }} numberOfLines={1}>{ad.title}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11.5, fontWeight: '600', marginTop: 1 }}>Sponsorisé · Annonce</Text>
          </View>
        </TouchableOpacity>

        {/* Description */}
        {ad.description ? (
          <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 18, fontWeight: '400', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 }} numberOfLines={3}>
            {ad.description}
          </Text>
        ) : null}

        {/* CTA — vrai bouton plein largeur en dégradé de marque, adapté au type de
            contact : numéro de téléphone → "Contactez-nous" + icône téléphone (compose
            l'appel), lien web → "En savoir plus" + flèche (ouvre le navigateur). */}
        {rawCta ? (
          <TouchableOpacity activeOpacity={0.88} onPress={handleCta} style={{ marginTop: 2, shadowColor: '#7B3FF2', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
            <LinearGradient
              colors={['#7B3FF2', '#C044E8', '#E0389A']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}
            >
              <Icon name={isPhone ? 'phone' : 'globe'} size={15} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '800', letterSpacing: 0.2 }}>
                {ad.cta_text || (isPhone ? 'Contactez-nous' : 'En savoir plus')}
              </Text>
              {isPhone ? (
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' }}>· {ctaPhone}</Text>
              ) : (
                <Icon name="arrow-right" size={16} color="#fff" />
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});

// ─── VideoSlide ───────────────────────────────────────────────────────────────

interface VideoSlideProps {
  reel:                 Reel;
  isActive:             boolean;
  isPreload:            boolean;
  isWifi:               boolean;
  muted:                boolean;
  screenW:              number;
  screenH:              number;
  insetBottom:          number;
  colors:               any;
  currentUserId?:       string;
  currentUserAvatar?:   string;
  currentUserInitial?:  string;
  onToggleMute:         () => void;
  onAuthorPress:        (userId: string) => void;
  onEnd:                () => void;
  activePlayerRef?:     React.RefObject<{ pause: () => void } | null>;
  audioOwnerRef?:       React.RefObject<string | null>;
}

const VideoSlide: React.FC<VideoSlideProps> = memo(({
  reel, isActive, isPreload, isWifi, muted, screenW, screenH, insetBottom,
  colors, currentUserId, currentUserAvatar, currentUserInitial = 'M',
  onToggleMute, onAuthorPress, onEnd, activePlayerRef, audioOwnerRef,
}) => {
  const nav = useNavigation<Nav>();

  const [paused,       setPaused]       = useState(false);
  const [videoLoaded,  setVideoLoaded]  = useState(false);
  const [videoError,   setVideoError]   = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [isStalling,   setIsStalling]   = useState(false);
  const [showControls, setShowControls] = useState(false);
  const stallingTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressValue     = useSharedValue(0);
  const durationRef       = useRef(0);
  const progressBarWidthRef = useRef(0);
  const [liked,        setLiked]        = useState(reel.user_reaction === 'like');
  const [likes,        setLikes]        = useState(reel.like_count ?? 0);
  const [heartLikeAction, setHeartLikeAction] = useState(true);
  const [commentCount, setCommentCount] = useState(reel.comment_count ?? 0);
  const [shareCount,   setShareCount]   = useState(reel.share_count ?? 0);
  const [showShare,    setShowShare]    = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText,  setCommentText]  = useState('');
  const [sending,      setSending]      = useState(false);
  const [barFocused,   setBarFocused]   = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [isPortrait,   setIsPortrait]   = useState<boolean | null>(null);
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
    if (!url) { Alert.alert('Indisponible', 'Vidéo introuvable pour ce reel.'); return; }
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
      Alert.alert('Republié', 'Le reel a été republié sur votre profil.');
    } catch {
      Alert.alert('Erreur', 'Impossible de republier ce reel.');
    } finally {
      setRemixLoading(false);
    }
  }, [reel.id, remixLoading]);

  const handleRemixer = useCallback(() => {
    setShowRemix(false);
    nav.navigate('CreateReel', { sourceReelId: reel.id, sourceReelUrl: reel.hls_url ?? undefined });
  }, [reel.id, reel.hls_url, nav]);

  const handleDeleteReel = useCallback(() => {
    setShowOwnerMenu(false);
    Alert.alert(
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
              Alert.alert('Erreur', 'Impossible de supprimer ce reel.');
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
      Alert.alert('Erreur', 'Impossible de modifier la description.');
    } finally {
      setSavingCaption(false);
    }
  }, [reel.id, editCaptionText, savingCaption]);

  const videoUri = reel.hls_url;
  const shouldLoad = !!videoUri && (isActive || isPreload);
  // Charge la source dès que ce slide est actif OU en préchargement (slide suivant/précédent).
  // La référence de l'objet source (et bufferConfig) ne doit JAMAIS changer entre preload et actif :
  // sinon useVideoPlayer recrée le player en perdant tout le buffer déjà accumulé pendant le
  // preload (= rechargement complet, latence visible à l'arrivée). Seul shouldLoad (bool) doit
  // faire basculer entre l'URI réelle et 'about:blank', jamais l'objet lui-même.
  // Hors wifi, on réduit fortement le buffer avant de jouer — un voisin préchargé n'a besoin
  // que de quelques secondes pour démarrer instantanément, pas de 30s de vidéo téléchargée
  // pour rien s'il n'est jamais atteint (swipe dans l'autre sens, appel qui interrompt, etc.).
  const videoSource = useMemo(() => shouldLoad
    ? {
        uri: videoUri!,
        bufferConfig: isWifi
          ? {
              minBufferMs: 2_000,
              maxBufferMs: 50_000,
              bufferForPlaybackMs: 1_500,
              bufferForPlaybackAfterRebufferMs: 2_000,
              backBufferDurationMs: 2_000,
              preferredForwardBufferDurationMs: 30_000,
            }
          : {
              minBufferMs: 2_000,
              maxBufferMs: 15_000,
              bufferForPlaybackMs: 1_500,
              bufferForPlaybackAfterRebufferMs: 2_000,
              backBufferDurationMs: 1_000,
              preferredForwardBufferDurationMs: 6_000,
            },
      }
    : 'about:blank',
  [videoUri, shouldLoad, isWifi]); // eslint-disable-line

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
      snd.play(success => {
        if (!success) console.warn('[ReelMusic] playback failed for', url);
        musicSoundRef.current = null;
        snd.release();
      });
      if (musicIsActiveRef.current && !pausedRef.current) { try { player.play(); } catch {} }
    });
  }, [reel.music_url, reel.music_start_sec, reel.music_end_sec, stopMusic, armMusicClip, player]);

  const startMusicRef = useRef(startMusic);
  useEffect(() => { startMusicRef.current = startMusic; }, [startMusic]);

  // Démarrer/stopper la musique selon isActive et paused
  useEffect(() => {
    if (isActive && !paused && reel.music_url) {
      startMusic();
    } else {
      stopMusic();
    }
    return () => { stopMusic(); };
  }, [isActive, paused, reel.music_url, startMusic, stopMusic]);

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

  // Ratio portrait depuis thumbnail
  useEffect(() => {
    if (!reel.thumbnail_url || isPortrait !== null) return;
    Image.getSize(
      reel.thumbnail_url,
      (w, h) => { if (mountedRef.current) setIsPortrait(h >= w); },
      () => { if (mountedRef.current) setIsPortrait(true); },
    );
  }, [reel.thumbnail_url]); // eslint-disable-line

  const clearStall = useCallback(() => {
    if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
  }, []);

  const doRetry = useCallback(() => {
    if (!mountedRef.current || !reel.hls_url) return;
    clearStall();
    const attempt = retryCountRef.current;
    if (attempt >= MAX_RETRIES) {
      if (mountedRef.current) { setVideoError(true); setVideoPlaying(false); }
      return;
    }
    retryCountRef.current += 1;
    if (mountedRef.current) { setVideoError(false); setVideoLoaded(false); setVideoPlaying(false); }
    retryTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || !reel.hls_url) return;
      try {
        player.replaceSourceAsync(videoSource as any)
          .then(() => { if (mountedRef.current && !pausedRef.current) { player.play(); } })
          .catch(() => { if (mountedRef.current) doRetry(); });
      } catch { if (mountedRef.current) doRetry(); }
    }, Math.pow(2, attempt) * 1000);
  }, [player, reel.hls_url, clearStall, videoSource]); // eslint-disable-line

  const armStall = useCallback(() => {
    clearStall();
    stallTimerRef.current = setTimeout(() => {
      if (mountedRef.current && !pausedRef.current) doRetry();
    }, STALL_TIMEOUT);
  }, [clearStall, doRetry]);

  // Refs stables pour lire les valeurs courantes dans les listeners sans les recréer
  const isActiveRef = useRef(isActive);
  const onEndRef    = useRef(onEnd);
  const doRetryRef  = useRef(doRetry);
  const armStallRef = useRef(armStall);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { onEndRef.current    = onEnd;    }, [onEnd]);
  useEffect(() => { doRetryRef.current  = doRetry;  }, [doRetry]);
  useEffect(() => { armStallRef.current = armStall;  }, [armStall]);

  // Listeners souscrits une seule fois par player — pas de re-souscription au scroll
  useEffect(() => {
    const subEnd   = player.addEventListener('onEnd', () => {
      clearStall();
      if (isActiveRef.current && mountedRef.current) { endedRef.current = true; setEnded(true); onEndRef.current(); }
    });
    const subBuf   = player.addEventListener('onBuffer', (val: boolean) => {
      if (!mountedRef.current) return;
      if (val && isActiveRef.current && !pausedRef.current) armStallRef.current(); else clearStall();
    });
    const subLoad  = player.addEventListener('onLoad', (data: any) => {
      if (!mountedRef.current) return;
      setVideoLoaded(true); setVideoError(false); retryCountRef.current = 0; clearStall();
      if (data?.duration && data.duration > 0) { durationRef.current = data.duration; if (!hasMusic) progressValue.value = 0; }
      if (data?.width && data?.height) setIsPortrait(data.height >= data.width);
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
    if (!reel.hls_url) return;
    if (playTimerRef.current) clearTimeout(playTimerRef.current);

    if (isActive && !pausedRef.current) {
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
            setRefInfo({ label: d.title ?? 'Concert', kind: 'Concert', thumbnail: d.thumbnail_url ?? null, color: '#7B3FF2' });
          }
        } else if (reel.ref_event_id) {
          const res = await apiClient.get<any>(`/api/v1/events/${reel.ref_event_id}`);
          if (!cancelled && mountedRef.current) {
            const d = res.data;
            setRefInfo({ label: d.title ?? 'Événement', kind: 'Événement', thumbnail: d.thumbnail_url ?? null, color: '#E0389A' });
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

  const progressBarAnim = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%` as any,
  }));

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
    // Quand hasMusic, l'effet [isActive, paused, ...] (plus haut) est le seul chef
    // d'orchestre du play()/pause() du player vidéo — il redémarre proprement startMusic()
    // (chargement du Sound + resync vidéo/son) ou l'arrête via stopMusic(). Appeler
    // player.play()/pause() ici en plus créait une course avec ce chargement async :
    // le replay pouvait ne jamais reprendre si le Sound précédent était déjà arrêté.
    if (!hasMusic) {
      try {
        if (next) {
          player.pause();
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
          player.play();
        }
      } catch {}
    }
    if (mountedRef.current) setPaused(next);
    showPlayIconAnim();
  }, [player, hasMusic, showPlayIconAnim, progressValue]);

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

  const handleFocusBar = useCallback((focused: boolean) => {
    if (mountedRef.current) setBarFocused(focused);
    if (focused) { pausedRef.current = true; try { player.pause(); } catch {} if (mountedRef.current) setPaused(true); }
  }, [player]);

  const handleSendComment = useCallback(async () => {
    const body = commentText.trim();
    if (!body || sending) return;
    if (mountedRef.current) setSending(true);
    try {
      await socialService.createComment({ body, reel_id: reel.id });
      if (mountedRef.current) { setCommentText(''); setCommentCount(v => v + 1); Keyboard.dismiss(); }
    } catch {}
    finally { if (mountedRef.current) setSending(false); }
  }, [commentText, reel.id, sending]);

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
  const tapGesture = Gesture.Exclusive(doubleTap, singleTap);
  const hPanFail   = Gesture.Pan().activeOffsetX([-10, 10]).failOffsetY([-10, 10]).minDistance(10);

  // Scrubbing de la barre de progression — poser le doigt seek déjà à cette position, puis
  // glisser met à jour le ratio en continu. wasPlayingBeforeScrubRef retient l'état de lecture
  // d'avant le drag pour ne reprendre la lecture au relâchement que si elle jouait déjà.
  const wasPlayingBeforeScrubRef = useRef(false);
  const seekToRatio = useCallback((x: number) => {
    const dur = durationRef.current;
    const width = progressBarWidthRef.current;
    if (!dur || dur <= 0 || !width) return;
    const ratio = Math.min(1, Math.max(0, x / width));
    progressValue.value = ratio;
    try { player.seekTo(ratio * dur); } catch {}
  }, [player, progressValue]);
  const scrubGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)          // se déclenche dès le 1er toucher, pas seulement après un mouvement
    .maxPointers(1)
    .onTouchesDown((e) => {
      wasPlayingBeforeScrubRef.current = !pausedRef.current;
      try { player.pause(); } catch {}
      seekToRatio(e.allTouches[0].x);
    })
    .onUpdate((e) => {
      seekToRatio(e.x);
    })
    .onEnd((e) => {
      seekToRatio(e.x);
    })
    .onFinalize(() => {
      // Couvre la fin normale (onEnd) ET une annulation système du geste — la lecture
      // ne doit jamais rester bloquée en pause si le geste est interrompu.
      if (wasPlayingBeforeScrubRef.current) { try { player.play(); } catch {} }
    });

  const safeBottom    = Math.max(insetBottom, Platform.OS === 'android' ? 56 : 0);
  // 6 paddingV wrap top + 6 bottom + 26 avatar height + 6 paddingV inner × 2 = 56 → 66 pour marge
  const COMMENT_BAR_H = 66;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000', overflow: 'hidden' }}>

      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH }}
        resizeMode={isPortrait === false ? 'contain' : 'cover'}
        controls={false}
        surfaceType="texture"
      />

      {/* Thumbnail par-dessus la vidéo tant qu'elle n'a pas encore de frame à afficher —
          masque l'écran noir de démarrage (surtout visible en arrivant directement depuis
          le Feed, sans preload préalable). Disparaît dès que videoPlaying passe à true. */}
      {reel.thumbnail_url && isActive && !videoPlaying && (
        <Image source={{ uri: reel.thumbnail_url }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: screenW, height: screenH }} resizeMode="cover" />
      )}

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

      <GestureDetector gesture={Gesture.Simultaneous(hPanFail, tapGesture)}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 80, bottom: safeBottom + COMMENT_BAR_H }} />
      </GestureDetector>

      <Animated.View pointerEvents="none" style={[s.skipRipple, s.skipRippleLeft,  skipLeftAnim]}><Text style={s.skipRippleTxt}>{skipLeftLabel}</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[s.skipRipple, s.skipRippleRight, skipRightAnim]}><Text style={s.skipRippleTxt}>{skipRightLabel}</Text></Animated.View>

      <Animated.View style={playIconAnim} pointerEvents="none">
        <View style={s.playPauseCircle}><Icon name={paused ? 'play' : 'pause'} size={36} color="#fff" /></View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={heartAnim}>
        {heartLikeAction
          ? <MCIcon name="heart" size={88} color="#E0389A" />
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

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']} locations={[0, 0.5, 1]} style={s.bottomGradient} pointerEvents="none" />

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">

        <View style={[s.reelInfo, { bottom: safeBottom + COMMENT_BAR_H }]} pointerEvents="box-none">
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
              {!isOwnReel && (
                <TouchableOpacity
                  style={s.avatarPlusBtn}
                  activeOpacity={0.85}
                  onPress={() => nav.navigate('CreateReel', { sourceReelId: reel.id, sourceReelUrl: reel.hls_url ?? undefined })}
                >
                  <Icon name="plus" size={9} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity activeOpacity={0.8} onPress={() => reel.author?.id && onAuthorPress(reel.author.id)} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={s.authorName} numberOfLines={1}>{getAuthorLabel(reel.author)}</Text>
                {reel.author?.is_verified && <VerifiedBadge size={12} />}
              </View>
            </TouchableOpacity>
            {!isOwnReel && reel.author?.id && (
              <TouchableOpacity
                onPress={handleFollow}
                activeOpacity={0.8}
                disabled={followLoading}
                style={{ paddingHorizontal: 11, paddingVertical: 4, borderRadius: 16, borderWidth: 1.5, borderColor: isFollowing ? 'rgba(255,255,255,0.4)' : '#fff', backgroundColor: isFollowing ? 'rgba(255,255,255,0.1)' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                {followLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{isFollowing ? 'Suivi' : 'Suivre'}</Text>
                }
              </TouchableOpacity>
            )}
          </View>

          {captionSt ? <RichText text={captionSt} textStyle={s.caption} primaryColor="#93C5FD" maxLines={3} /> : null}

          {reel.music_name ? (
            <View style={s.musicBand} pointerEvents="none">
              <MCIcon name="music-note" size={11} color="#fff" />
              <Text style={s.musicBandTxt} numberOfLines={1}>{reel.music_name}</Text>
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
                <Text style={{ fontWeight: '800' }}>
                  {reel.source_reel.author?.display_name || reel.source_reel.author?.username || 'un créateur'}
                </Text>
              </Text>
            </View>
          )}
          {likes > 0 && (
            <FriendsWhoLiked entityType="reel" entityId={reel.id} totalLikes={likes} lightText />
          )}
        </View>

        {/* Pluie de cœurs + défilement des noms qui aiment — reel très aimé */}
        <HeartRain active={isActive} likeCount={likes} contentId={reel.id} />
        <LikeNamesFeed active={isActive} likeCount={likes} contentId={reel.id} kind="reel" />

        <View style={[s.actions, { bottom: safeBottom + COMMENT_BAR_H }]}>
          <TouchableOpacity style={s.muteBtn} onPress={onToggleMute} activeOpacity={0.8}>
            <Icon name={muted ? 'volume-x' : 'volume-2'} size={14} color="#fff" />
          </TouchableOpacity>
          <ActionBtn icon="heart-outline" iconActive="heart" useMCIcon label={formatCount(likes)} color={liked ? '#E0389A' : '#fff'} onPress={handleLike} active={liked} activeBackground="rgba(224,56,154,0.25)" activeBorder="#E0389A" activeGlow="#E0389A" />
          {!commentsDisabledSt && <ActionBtn icon="message-circle" label={formatCount(commentCount)} color="#fff" onPress={() => setShowComments(true)} />}
          <ActionBtn icon="share-2" label={formatCount(shareCount)} color="#fff" onPress={handleShare} />
          <ActionBtn icon="eye" label={formatCount(reel.view_count ?? 0)} color="#fff" />
          {!isOwnReel && <ActionBtn icon="gift" label="Cadeau" color="#FFD700" onPress={() => setShowGiftPicker(true)} activeBackground="rgba(255,215,0,0.18)" activeBorder="rgba(255,215,0,0.5)" active />}
          {/* Bouton ... — regroupe Remix, Cable, Signalement pour non-proprio */}
          {!isOwnReel && (
            <TouchableOpacity style={s.actionBtn} onPress={() => setShowRemix(true)} activeOpacity={0.8}>
              <View style={s.actionCircle}>
                <Icon name="more-horizontal" size={14} color="#fff" />
              </View>
              <Text style={s.actionLabel}>Plus</Text>
            </TouchableOpacity>
          )}
          {isOwnReel && (
            <TouchableOpacity style={s.actionBtn} onPress={() => setShowOwnerMenu(true)} activeOpacity={0.8}>
              <View style={s.actionCircle}>
                <Icon name="more-vertical" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          )}
          {/* Bouton disque musique — en bas de la colonne, comme TikTok */}
          {reel.music_name ? (
            <View style={s.musicDisc} pointerEvents="none">
              <MCIcon name="music-note" size={16} color="#000" />
            </View>
          ) : null}
        </View>

        <ReportModal visible={reportVisible} contentType="reel" contentId={reel.id} onClose={() => setReportVisible(false)} />

        {/* Owner menu — menu bas de page */}
        <Modal visible={showOwnerMenu} transparent animationType="slide" onRequestClose={() => setShowOwnerMenu(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowOwnerMenu(false)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={[s.menuSheet, { backgroundColor: colors.surface }]}>
                <View style={[s.menuDivider, { backgroundColor: colors.divider, alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 }]} />
                <TouchableOpacity style={s.menuItem} onPress={() => { setShowOwnerMenu(false); setEditCaptionText(captionSt); setShowEditCaption(true); }}>
                  <Icon name="edit-2" size={20} color={colors.textPrimary} />
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>Modifier la description</Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={handleToggleFeedComments} disabled={togglingComments}>
                  <MCIcon name={commentsDisabledSt ? 'comment-check-outline' : 'comment-off-outline'} size={20} color={colors.textPrimary} />
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                    {commentsDisabledSt ? 'Activer les commentaires' : 'Desactiver les commentaires'}
                  </Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={() => { setShowOwnerMenu(false); nav.navigate('ReelStats' as any, { reelId: reel.id }); }}>
                  <Icon name="bar-chart-2" size={20} color={colors.textPrimary} />
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
                    : <Icon name={reelDl.localUri ? 'check' : 'download'} size={20} color={colors.textPrimary} />
                  }
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                    {reelDl.downloading ? `Téléchargement… ${reelDl.progress}%` : reelDl.localUri ? 'Enregistré dans Téléchargements' : 'Télécharger'}
                  </Text>
                </TouchableOpacity>
                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity style={s.menuItem} onPress={handleDeleteReel}>
                  <Icon name="trash-2" size={20} color="#ef4444" />
                  <Text style={[s.menuItemText, { color: '#ef4444' }]}>Supprimer</Text>
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
                      : <View style={[s.sheetAvatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{getAuthorInitial(reel.author)}</Text></View>
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
                      : <Icon name="repeat" size={20} color="#A78BFA" />
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
                    <Icon name="git-merge" size={20} color="#A78BFA" />
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
                    Alert.alert(
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
                              Alert.alert('Invitation envoyée', `${authorLabel} a reçu ton invitation Cable.`);
                            } catch (err: any) {
                              const msg = err?.response?.data?.detail ?? "Erreur lors de l'envoi";
                              Alert.alert('Erreur', msg);
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
                      : <Icon name="link-2" size={20} color="#60A5FA" />}
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
                    <Icon name="inbox" size={20} color="#60A5FA" />
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
                        <Icon name="user" size={20} color={colors.textPrimary} />
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
                      : <Icon name={reelDl.localUri ? 'check' : 'download'} size={20} color={colors.textPrimary} />
                    }
                  </View>
                  <Text style={[s.menuItemText, { color: colors.textPrimary }]}>
                    {reelDl.downloading ? `Téléchargement… ${reelDl.progress}%` : reelDl.localUri ? 'Enregistré dans Téléchargements' : 'Télécharger'}
                  </Text>
                </TouchableOpacity>

                <View style={[s.menuDivider, { backgroundColor: colors.divider }]} />

                {/* ── Signaler ── */}
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={() => { setShowRemix(false); setTimeout(() => setReportVisible(true), 300); }}
                >
                  <View style={[s.sheetItemIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Icon name="flag" size={20} color="#ef4444" />
                  </View>
                  <Text style={[s.menuItemText, { color: '#ef4444' }]}>Signaler</Text>
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
                  <Text style={[s.editTitle, { color: colors.textPrimary }]}>Modifier la description</Text>
                  <TextInput
                    value={editCaptionText}
                    onChangeText={setEditCaptionText}
                    multiline
                    maxLength={500}
                    style={[s.editInput, { color: colors.textPrimary, borderColor: colors.divider, backgroundColor: colors.background }]}
                    placeholder="Décrivez votre reel..."
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={[s.charCount, { color: colors.textSecondary }]}>{editCaptionText.length}/500</Text>
                  <View style={s.editActions}>
                    <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.divider }]} onPress={() => setShowEditCaption(false)}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.editBtn, { backgroundColor: colors.primary }]} onPress={handleSaveCaption} disabled={savingCaption}>
                      {savingCaption ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Enregistrer</Text>}
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
          <GiftPickerModal reelId={reel.id} receiverId={String(reel.author.id)} receiverName={reel.author.display_name ?? reel.author.username ?? 'Créateur'} onClose={() => setShowGiftPicker(false)} />
        )}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined} style={[s.commentBarWrap, { bottom: safeBottom }]} keyboardVerticalOffset={0}>
          {/* Barre de progression — juste au-dessus de la barre de commentaire, dans le même
              KeyboardAvoidingView pour rester synchronisée avec elle quand le clavier s'ouvre.
              Scrubbing complet façon TikTok : poser le doigt seek déjà à cette position, puis
              glisser met à jour le ratio en continu (pas juste un tap ponctuel) ; la vidéo est
              mise en pause pendant le drag pour un contrôle net, et reprend au relâchement si
              elle n'était pas déjà en pause avant. */}
          {isActive && (
            <View
              onLayout={(e) => { progressBarWidthRef.current = e.nativeEvent.layout.width; }}
              style={{ height: 20, justifyContent: 'center', paddingHorizontal: 10 }}
            >
              <GestureDetector gesture={scrubGesture}>
                <View style={{ height: 20, justifyContent: 'center' }}>
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' }}>
                    <Animated.View style={[{ height: 3, backgroundColor: '#fff', borderRadius: 2 }, progressBarAnim]} />
                  </View>
                </View>
              </GestureDetector>
            </View>
          )}

          {/* Tout dans une seule barre : avatar + input + send */}
          <View style={[s.commentBar, { backgroundColor: barFocused ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.12)', borderColor: barFocused ? 'rgba(255,255,255,0.3)' : 'transparent' }]}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => currentUserId && onAuthorPress(currentUserId)}>
              {currentUserAvatar
                ? <Image source={{ uri: currentUserAvatar }} style={s.commentBarAvatar} />
                : <View style={[s.commentBarAvatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={s.commentBarAvatarTxt}>{currentUserInitial}</Text>
                  </View>
              }
            </TouchableOpacity>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              onFocus={() => handleFocusBar(true)}
              onBlur={() => handleFocusBar(false)}
              style={s.commentBarInput}
              returnKeyType="send"
              onSubmitEditing={handleSendComment}
              maxLength={300}
            />
            <TouchableOpacity onPress={handleSendComment} disabled={!commentText.trim() || sending} activeOpacity={0.8} style={s.commentBarSend}>
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name="arrow-up" size={14} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

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
  useMCIcon?: boolean;
}> = ({ icon, iconActive, label, color, onPress, active, activeBackground, activeBorder, activeGlow, useMCIcon }) => {
  const iconName = (active && iconActive) ? iconActive : icon;
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        s.actionCircle,
        active && activeBackground ? { backgroundColor: activeBackground } : {},
        active && activeBorder     ? { borderColor: activeBorder, borderWidth: 1.5 } : {},
        active && activeGlow       ? { shadowColor: activeGlow, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 } : {},
      ]}>
        {useMCIcon ? <MCIcon name={iconName} size={16} color={color} /> : <Icon name={iconName} size={14} color={color} />}
      </View>
      {!!label && <Text style={[s.actionLabel, { color }]}>{label}</Text>}
    </TouchableOpacity>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '80%' },

  floatingHeader: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, zIndex: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  reelHeaderTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  myReelsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  myReelsBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  searchFab:      { position: 'absolute', right: 16, width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },

  playPauseCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  bufferOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', zIndex: 6, gap: 10 },
  bufferText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  errorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 7, gap: 10 },
  errorTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorSub:   { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 22, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  reelInfo:   { position: 'absolute', left: 14, right: 72, gap: 6, zIndex: 3 },
  authorRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarPlusBtn: { position: 'absolute', bottom: -3, right: -3, width: 15, height: 15, borderRadius: 8, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#000' },

  musicBand:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#7B3FF2', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', maxWidth: '80%', marginTop: 3 },
  musicBandTxt: { color: '#fff', fontSize: 10, fontWeight: '700', flexShrink: 1 },
  musicBandDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)' },
  musicDisc:    { width: 38, height: 38, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  sourceBand:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignSelf: 'flex-start', maxWidth: '100%' },
  sourceThumb: { width: 16, height: 16, borderRadius: 3, overflow: 'hidden' },
  sourceText:  { color: 'rgba(255,255,255,0.75)', fontSize: 10 },
  authorName: { color: '#fff', fontWeight: '800', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  caption:    { color: '#fff', fontSize: 12, lineHeight: 17, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },

  refBand:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignSelf: 'flex-start', maxWidth: '100%' },
  refKindDot: { width: 6, height: 6, borderRadius: 3 },
  refThumb:   { width: 26, height: 26, borderRadius: 6, overflow: 'hidden' },
  refKind:    { color: 'rgba(255,255,255,0.55)', fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  refLabel:   { color: '#fff', fontSize: 11, fontWeight: '700' },

  actions:      { position: 'absolute', right: 8, alignItems: 'center', gap: 8, zIndex: 3 },
  actionBtn:    { alignItems: 'center', gap: 2 },
  actionCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  actionLabel:  { fontSize: 9, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  muteBtn:      { width: 27, height: 27, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },

  loadMoreIndicator: { position: 'absolute', bottom: 80, alignSelf: 'center', zIndex: 10 },

  commentBarWrap:      { position: 'absolute', left: 0, right: 0, zIndex: 5, paddingHorizontal: 10, paddingVertical: 6 },
  commentBarRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentBarAvatar:    { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', overflow: 'hidden', flexShrink: 0 },
  commentBarAvatarTxt: { color: '#fff', fontWeight: '800', fontSize: 11 },
  commentBar:          { flexDirection: 'row', alignItems: 'center', borderRadius: 24, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, gap: 7 },
  commentBarInput:     { flex: 1, fontSize: 12, color: '#fff', padding: 0, maxHeight: 60 },
  commentBarSend:      { width: 27, height: 27, borderRadius: 14, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  mineHeader:        { flexDirection: 'row', alignItems: 'center', paddingBottom: 14, paddingHorizontal: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  mineHeaderTitle:   { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  mineHeaderSub:     { fontSize: 12, fontWeight: '400', marginTop: 1 },
  mineCreateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  mineCreateBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  mineGrid:          { padding: 8, paddingTop: 12 },
  mineRow:           { gap: 8, marginBottom: 8 },
  mineCard:          { flex: 1, overflow: 'hidden', borderRadius: 12 },
  mineThumb:         { width: '100%', aspectRatio: 9 / 14 },
  mineThumbFallback: { width: '100%', aspectRatio: 9 / 14, alignItems: 'center', justifyContent: 'center' },
  mineEffectBadge:   { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 3 },
  mineOverlay:       { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  mineMenuBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)' },
  mineStat:          { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mineStatText:      { color: '#fff', fontSize: 11, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  menuSheet:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36, paddingTop: 8 },
  menuItem:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 15 },
  menuItemText:  { fontSize: 15, fontWeight: '600' },
  menuDivider:   { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },

  sheetHandle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetAuthorRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  sheetThumb:      { width: 44, height: 56, borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  sheetAvatar:     { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  sheetAuthorName: { fontSize: 15, fontWeight: '700' },
  sheetAuthorSub:  { fontSize: 12, marginTop: 1 },
  sheetStats:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 4, marginTop: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', paddingVertical: 12 },
  sheetStat:       { flex: 1, alignItems: 'center', gap: 3 },
  sheetStatVal:    { fontSize: 15, fontWeight: '800' },
  sheetStatLbl:    { fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  sheetStatSep:    { width: 1, height: 32, opacity: 0.25 },
  sheetStatPill:   { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, overflow: 'hidden', marginLeft: 6 },
  sheetItemIcon:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sheetItemSub:    { fontSize: 12, marginTop: 2 },
  editSheet:     { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36 },
  editTitle:     { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  editInput:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  charCount:     { fontSize: 11, textAlign: 'right', marginTop: 4, marginBottom: 16 },
  editActions:   { flexDirection: 'row', gap: 12 },
  editBtn:       { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  searchOverlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0a0a0a', zIndex: 50 },
  searchTopBar:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 22, height: 42, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput:     { flex: 1, fontSize: 14, color: '#fff', paddingHorizontal: 10, paddingVertical: 0 },
  searchClearBtn:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', marginRight: 7 },

  searchGrid:           { padding: 10, paddingBottom: 50 },
  searchGridRow:        { gap: 8, marginBottom: 8 },
  searchCard:           { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#161616' },
  searchThumb:          { width: '100%', aspectRatio: 9 / 16 },
  searchThumbFallback:  { width: '100%', aspectRatio: 9 / 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1c' },
  searchCardGrad:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: '75%' },
  searchPlayBadge:      { position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  searchViewBadge:      { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  searchBadgeText:      { color: '#fff', fontSize: 10, fontWeight: '600' },
  searchCardInfo:       { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 9, gap: 4 },
  searchCardAuthorRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchAvatar:         { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  searchAvatarFallback: { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  searchAvatarText:     { color: '#fff', fontSize: 9, fontWeight: '700' },
  searchCardAuthor:     { color: '#fff', fontSize: 12, fontWeight: '700', flex: 1 },
  searchCardCaption:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 15 },
  searchCardStats:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  searchCardStat:       { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },
  searchCenterState:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  searchEmptyIcon:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  searchStateTitle:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchStateText:      { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

  replayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 6 },
  replayBtn:     { alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 28, paddingVertical: 18, borderRadius: 20 },
  replayTxt:     { color: '#fff', fontSize: 15, fontWeight: '700' },

  skipRipple:      { position: 'absolute', top: 0, bottom: 0, width: '30%', alignItems: 'center', justifyContent: 'center', zIndex: 8 },
  skipRippleLeft:  { left: 0 },
  skipRippleRight: { right: 80 },
  skipRippleTxt:   { color: '#fff', fontSize: 15, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  ownerMenuCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, minWidth: 220, overflow: 'hidden' },
});
