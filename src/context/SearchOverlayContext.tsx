import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react';
import { useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { searchService } from '../services/searchService';
import { searchHistoryService, type SearchHistoryItem } from '../services/searchHistoryService';
import { apiClient } from '../api/client';
import type { AdData } from '../components/ads';
import type { SearchResults } from '../types/search';

// Overlay de recherche riche, auparavant enfermé dans FeedScreen (onglet
// Accueil uniquement) — remonté ici pour être ouvrable depuis n'importe quel
// écran, notamment au tap sur un #hashtag dans un texte (RichText), qui
// menait jusque-là vers un SearchScreen séparé au design minimal.

export type SearchFilter = 'all' | 'users' | 'events' | 'concerts' | 'reels' | 'films';

const SEARCH_PAGE_LIMIT = 20;
const SEARCH_CATEGORIES = ['users', 'films', 'series', 'concerts', 'events', 'reels'] as const;

interface SearchOverlayActions {
  openSearchOverlay:  (initialQuery?: string) => void;
  closeSearchOverlay: () => void;
}

export interface SearchOverlayState {
  isOpen:             boolean;
  searchQuery:        string;
  setSearchQuery:     React.Dispatch<React.SetStateAction<string>>;
  searchResults:      SearchResults | null;
  setSearchResults:   React.Dispatch<React.SetStateAction<SearchResults | null>>;
  searching:          boolean;
  searchFilter:       SearchFilter;
  setSearchFilter:    React.Dispatch<React.SetStateAction<SearchFilter>>;
  searchHistory:      SearchHistoryItem[];
  setSearchHistory:   React.Dispatch<React.SetStateAction<SearchHistoryItem[]>>;
  historySuggestions: SearchHistoryItem[];
  searchHasMore:      boolean;
  loadingMoreSearch:  boolean;
  searchAd:           AdData | null;
  popularContent:     any[];
  popularLoading:     boolean;
  searchBarWidth:     SharedValue<number>;
  searchBarOpacity:   SharedValue<number>;
  searchInputRef:     React.MutableRefObject<any>;
  liveSearch:         (query: string, filter?: SearchFilter) => void;
  loadMoreSearch:     () => void;
  commitSearch:       (q: string) => void;
  refreshHistory:     () => void;
  closeSearch:        () => void;
}

// Trois contextes distincts plutôt qu'un seul : le Provider est monté à la
// racine et RichText (rendu des dizaines de fois dans le feed, les chats, les
// commentaires) n'a besoin que de openSearchOverlay. Avec un contexte unique,
// chaque frappe dans le champ de recherche re-rendrait tous ces RichText.
const SearchOverlayActionsContext = createContext<SearchOverlayActions>({
  openSearchOverlay:  () => {},
  closeSearchOverlay: () => {},
});
const SearchOverlayOpenContext  = createContext<boolean>(false);
const SearchOverlayStateContext = createContext<SearchOverlayState | null>(null);

// Actions stables (référence fixe) — à privilégier dans les composants rendus
// en masse qui n'ont pas besoin de savoir si l'overlay est ouvert.
export const useSearchOverlayActions = () => useContext(SearchOverlayActionsContext);

export const useSearchOverlay = () => {
  const actions = useContext(SearchOverlayActionsContext);
  const isOpen  = useContext(SearchOverlayOpenContext);
  return { ...actions, isOpen };
};

// Réservé au composant SearchOverlay — re-rend à chaque changement d'état.
export const useSearchOverlayState = () => useContext(SearchOverlayStateContext);

export const SearchOverlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  // Scroll infini — actif à la fois sur un filtre spécifique et en mode "Tout" (voir
  // liveSearch/loadMoreSearch) : le backend applique la même page/limit à chaque
  // catégorie en parallèle, donc avancer la page fonctionne aussi en mode "Tout",
  // simplement sans total/has_more par catégorie (approximé côté client).
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
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
  // Fermeture différée (fin de l'anim) — annulée si l'overlay est rouvert
  // entre-temps, sinon il se refermerait tout seul juste après s'être ouvert.
  const closeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshHistory = useCallback(() => {
    setSearchHistory(searchHistoryService.getAll());
  }, []);

  // Suggestions historique filtrées en live selon le texte tapé
  const historySuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchHistory.filter(h => h.query.toLowerCase().includes(q) && h.query.toLowerCase() !== q).slice(0, 5);
  }, [searchQuery, searchHistory]);

  // Recherche auto avec debounce 300ms
  const liveSearch = useCallback((query: string, filter: SearchFilter = 'all') => {
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

  const commitSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    searchHistoryService.add(trimmed);
    refreshHistory();
  }, [refreshHistory]);

  const openSearchOverlay = useCallback((initialQuery?: string) => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setIsOpen(true);
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

    // Query initiale (ex: #hashtag tapé dans un texte) : recherche lancée tout
    // de suite et enregistrée dans l'historique comme une recherche validée.
    // Pas de focus clavier dans ce cas — il masquerait les résultats attendus.
    const initial = initialQuery?.trim() ?? '';
    if (initial) {
      setSearchQuery(initial);
      setSearchFilter('all');
      liveSearch(initial, 'all');
      commitSearch(initial);
    } else {
      setTimeout(() => searchInputRef.current?.focus(), 250);
    }
  }, [refreshHistory, liveSearch, commitSearch, searchBarWidth, searchBarOpacity]);

  const closeSearch = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    // Invalide une éventuelle réponse searchAll encore en vol, qui sinon
    // repeuplerait les résultats d'une recherche déjà fermée.
    searchReqRef.current = '';
    searchBarWidth.value   = withSpring(0, { damping: 18, stiffness: 200 });
    searchBarOpacity.value = withTiming(0, { duration: 150 });
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; setIsOpen(false); }, 180);
    setSearchQuery('');
    setSearchResults(null);
    setSearching(false);
    setSearchAd(null);
    searchAdReqRef.current = '';
    setSearchFilter('all');
    setSearchPage(1);
    setSearchHasMore(false);
  }, [searchBarWidth, searchBarOpacity]);

  const actions = useMemo<SearchOverlayActions>(() => ({
    openSearchOverlay,
    closeSearchOverlay: closeSearch,
  }), [openSearchOverlay, closeSearch]);

  const state: SearchOverlayState = {
    isOpen,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    searching,
    searchFilter, setSearchFilter,
    searchHistory, setSearchHistory,
    historySuggestions,
    searchHasMore,
    loadingMoreSearch,
    searchAd,
    popularContent,
    popularLoading,
    searchBarWidth,
    searchBarOpacity,
    searchInputRef,
    liveSearch,
    loadMoreSearch,
    commitSearch,
    refreshHistory,
    closeSearch,
  };

  return (
    <SearchOverlayActionsContext.Provider value={actions}>
      <SearchOverlayOpenContext.Provider value={isOpen}>
        <SearchOverlayStateContext.Provider value={state}>
          {children}
        </SearchOverlayStateContext.Provider>
      </SearchOverlayOpenContext.Provider>
    </SearchOverlayActionsContext.Provider>
  );
};
