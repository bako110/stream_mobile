/**
 * Prefetch de la LISTE de reels suivants AVANT que l'utilisateur n'arrive
 * réellement sur ReelsScreen (clic sur une suggestion de reel depuis
 * FeedScreen) — pour que le voisin immédiat ait déjà une fenêtre de
 * préchargement vidéo active dès le montage de l'écran, au lieu d'attendre
 * que GET /reels/feed (page 1, seedReelIds) revienne du réseau APRÈS coup.
 * Avant ce prefetch, `reels` ne contenait que le reel cliqué seul le temps de
 * cet appel — aucun voisin à précharger, donc écran noir visible au scroll
 * suivant pendant que la liste arrivait enfin.
 *
 * Même idée que livePrefetch.ts, cache module-level partagé, fire-and-forget.
 */
import { reelService, type ReelFeedResponse } from '../services/reelService';

const TTL_MS = 15_000; // le pool backend (seedReelIds) est volatil, pas la peine de garder plus longtemps

interface Entry {
  data: ReelFeedResponse;
  fetchedAt: number;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Entry | null>>();

function isFresh(e: Entry): boolean {
  return Date.now() - e.fetchedAt < TTL_MS;
}

/** Démarre (ou réutilise) la résolution GET /reels/feed autour de ce reel —
 * fire-and-forget, appelé dès le clic (ou onPressIn) sur une suggestion de
 * reel dans FeedScreen. */
export function prefetchReelsFeed(seedReelId: string): void {
  const existing = cache.get(seedReelId);
  if (existing && isFresh(existing)) return;
  if (inFlight.has(seedReelId)) return;

  const p = (async (): Promise<Entry | null> => {
    try {
      const data = await reelService.getFeed({ page: 1, seedReelIds: [seedReelId] });
      const entry: Entry = { data, fetchedAt: Date.now() };
      cache.set(seedReelId, entry);
      return entry;
    } catch {
      return null;
    } finally {
      inFlight.delete(seedReelId);
    }
  })();

  inFlight.set(seedReelId, p);
}

/** Consomme le prefetch s'il existe et est encore frais ; sinon null (l'écran
 * retombe alors sur son flux réseau normal, GET /reels/feed classique). */
export function consumeReelsFeedPrefetch(seedReelId: string): ReelFeedResponse | null {
  const e = cache.get(seedReelId);
  if (!e || !isFresh(e)) {
    cache.delete(seedReelId);
    return null;
  }
  cache.delete(seedReelId); // usage unique — un prefetch consommé ne doit jamais resservir à une 2e navigation
  return e.data;
}

export function clearReelsFeedPrefetch(seedReelId: string): void {
  cache.delete(seedReelId);
  inFlight.delete(seedReelId);
}
