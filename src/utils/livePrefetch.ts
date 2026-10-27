/**
 * Prefetch du flux live (métadonnées + token LiveKit) AVANT que l'utilisateur
 * n'ouvre réellement l'écran de visionnage — pour qu'au moment de l'ouverture
 * seul le handshake WebRTC (rapide) reste à faire, pas les deux appels réseau
 * séquentiels (getById puis getToken) qui précèdent normalement la connexion.
 * Même idée que le cache local de SimpleLiveViewerScreen (feed swipe), mais
 * accessible depuis n'importe quel point d'entrée (carte liste, écran détail)
 * via un cache module-level partagé.
 *
 * Jamais utilisé pour un live à accès payant (ticket/subscription/ppv) : l'accès
 * doit être vérifié au moment réel de l'ouverture, pas en avance.
 */
import { concertService, liveService } from '../services';
import type { Concert } from '../types';
import type { LiveStream } from '../services/liveService';

const TTL_MS = 50_000; // tokens LiveKit de courte durée côté backend — on ne garde jamais un token périmé

interface Entry {
  token: string;
  wsUrl: string;
  concert: Concert;
  fetchedAt: number;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Entry | null>>();

function isFresh(e: Entry): boolean {
  return Date.now() - e.fetchedAt < TTL_MS;
}

/** Démarre (ou réutilise) la résolution getById + token pour un concert/événement
 * live. Fire-and-forget — appelé sur press-in d'une carte ou dès qu'un écran
 * détail détecte que son concert est passé en direct. */
export function prefetchConcertLive(concertId: string): void {
  const existing = cache.get(concertId);
  if (existing && isFresh(existing)) return;
  if (inFlight.has(concertId)) return;

  const p = (async (): Promise<Entry | null> => {
    try {
      const concert = await concertService.getById(concertId);
      if (concert.status !== 'live') return null;
      if (concert.access_type !== 'free') return null; // accès gated — vérifié en temps réel seulement

      const result = concert.live_id
        ? await liveService.getToken(concert.live_id)
        : await concertService.getStreamToken(concertId);

      const entry: Entry = {
        token: result.token,
        wsUrl: result.livekit_url,
        concert,
        fetchedAt: Date.now(),
      };
      cache.set(concertId, entry);
      return entry;
    } catch {
      return null;
    } finally {
      inFlight.delete(concertId);
    }
  })();

  inFlight.set(concertId, p);
}

/** Consomme le prefetch s'il existe et est encore frais ; sinon null (l'écran
 * retombe alors sur son flux réseau normal). Ne supprime pas l'entrée tant
 * qu'elle est fraîche : un remount rapide (ex. StrictMode, navigation back/forward)
 * peut la réutiliser sans relancer d'appel réseau. */
export function consumeConcertLivePrefetch(concertId: string): { token: string; wsUrl: string; concert: Concert } | null {
  const e = cache.get(concertId);
  if (!e || !isFresh(e)) {
    cache.delete(concertId);
    return null;
  }
  return { token: e.token, wsUrl: e.wsUrl, concert: e.concert };
}

export function clearConcertLivePrefetch(concertId: string): void {
  cache.delete(concertId);
  inFlight.delete(concertId);
}

// ── Lives simples (SimpleLiveViewerScreen) — même idée, cache séparé car la
// forme des données (LiveStream) et les règles d'accès diffèrent (is_monetized
// plutôt qu'access_type). ──────────────────────────────────────────────────

interface SimpleEntry {
  token: string;
  wsUrl: string;
  live: LiveStream;
  fetchedAt: number;
}

const simpleCache = new Map<string, SimpleEntry>();
const simpleInFlight = new Map<string, Promise<void>>();

function isSimpleFresh(e: SimpleEntry): boolean {
  return Date.now() - e.fetchedAt < TTL_MS;
}

/** Démarre la résolution getById + getToken pour un live simple (créateur ou
 * événement is_online). Jamais pour un live monétisé — l'accès doit être
 * vérifié au moment réel de l'ouverture. */
export function prefetchSimpleLive(liveId: string): void {
  const existing = simpleCache.get(liveId);
  if (existing && isSimpleFresh(existing)) return;
  if (simpleInFlight.has(liveId)) return;

  const p = (async () => {
    try {
      const live = await liveService.getById(liveId);
      if (live.status !== 'active' || live.is_monetized) return;
      const t = await liveService.getToken(liveId);
      simpleCache.set(liveId, { token: t.token, wsUrl: t.livekit_url, live, fetchedAt: Date.now() });
    } catch {
      /* best-effort — l'écran retombe sur son flux réseau normal */
    } finally {
      simpleInFlight.delete(liveId);
    }
  })();

  simpleInFlight.set(liveId, p);
}

export function consumeSimpleLivePrefetch(liveId: string): { token: string; wsUrl: string; live: LiveStream } | null {
  const e = simpleCache.get(liveId);
  if (!e || !isSimpleFresh(e)) {
    simpleCache.delete(liveId);
    return null;
  }
  return { token: e.token, wsUrl: e.wsUrl, live: e.live };
}

export function clearSimpleLivePrefetch(liveId: string): void {
  simpleCache.delete(liveId);
  simpleInFlight.delete(liveId);
}
