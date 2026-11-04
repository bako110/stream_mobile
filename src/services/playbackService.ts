import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

/** Droits effectifs (GET /subscriptions/entitlements) — le serveur est la source de vérité. */
export interface Entitlements {
  plan: string;
  screens: number;
  quality: string;
  max_height: number;
  downloads: number;
  downloads_used: number;
  downloads_left: number;
}

export interface VideoVariants {
  hls_url?: string | null;
  hls_480p_url?: string | null;
  hls_720p_url?: string | null;
  hls_1080p_url?: string | null;
}

const HEARTBEAT_MS = 30_000;
const CACHE_MS = 60_000;
let entCache: { at: number; value: Promise<Entitlements | null> } | null = null;

function detailOf(err: unknown): { code?: string; message?: string } | undefined {
  return (err as any)?.data?.detail;
}

export const playbackService = {
  /** Droits en cache 1 min. null si le serveur est injoignable → aucun plafond appliqué (fail-open). */
  getEntitlements(force = false): Promise<Entitlements | null> {
    if (!force && entCache && Date.now() - entCache.at < CACHE_MS) return entCache.value;
    const value = apiClient.get<Entitlements>(Endpoints.subscriptions.entitlements)
      .then(r => r.data ?? null)
      .catch(() => null);
    entCache = { at: Date.now(), value };
    return value;
  },

  invalidateEntitlements(): void {
    entCache = null;
  },

  /**
   * URL à lire selon la qualité du plan. Le serveur retire déjà les variantes au-dessus du plan ;
   * ici on choisit la meilleure variante autorisée quand le plan est plafonné en dessous de 1080p
   * (le flux maître adaptatif ne peut pas être plafonné côté lecteur natif).
   */
  pickUrl(video: VideoVariants | null | undefined, maxHeight?: number): string | null {
    if (!video) return null;
    const variants: [number, string | null | undefined][] = [
      [1080, video.hls_1080p_url], [720, video.hls_720p_url], [480, video.hls_480p_url],
    ];
    if (maxHeight != null && maxHeight < 1080) {
      const allowed = variants.find(([h, url]) => h <= maxHeight && !!url);
      if (allowed) return allowed[1] as string;
    }
    return video.hls_url ?? variants.find(([, url]) => !!url)?.[1] ?? null;
  },

  /**
   * Ouvre une session de lecture (écrans simultanés) et la maintient avec un battement toutes les 30 s.
   * Renvoie `stop()` à appeler au démontage. Si le plan est au maximum d'écrans, `onBlocked(message)`
   * est appelé (le lecteur doit alors se fermer). Panne réseau ou serveur → jamais bloquant.
   */
  async track(onBlocked: (message: string) => void): Promise<() => void> {
    let sessionId: string | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const open = async (): Promise<void> => {
      try {
        const r = await apiClient.post<{ session_id: string }>(Endpoints.playback.sessions);
        if (stopped) {
          apiClient.delete(Endpoints.playback.end(r.data.session_id)).catch(() => {});
          return;
        }
        sessionId = r.data.session_id;
      } catch (err) {
        const d = detailOf(err);
        if ((err as any)?.status === 429 && d?.code === 'too_many_screens') {
          onBlocked(d.message ?? "Votre plan n'autorise pas d'écran simultané supplémentaire.");
        }
      }
    };

    await open();
    if (!stopped) {
      timer = setInterval(async () => {
        if (!sessionId) { await open(); return; }
        try {
          const r = await apiClient.post<{ alive: boolean }>(Endpoints.playback.heartbeat(sessionId));
          if (!r.data?.alive) { sessionId = null; await open(); }
        } catch { /* réseau : réessai au battement suivant */ }
      }, HEARTBEAT_MS);
    }

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (sessionId) apiClient.delete(Endpoints.playback.end(sessionId)).catch(() => {});
      sessionId = null;
    };
  },

  /** Réserve 1 téléchargement du mois AVANT de le lancer (403 si plan sans téléchargement ou quota atteint). */
  async consumeDownload(): Promise<{ ok: true; left: number } | { ok: false; message: string }> {
    try {
      const r = await apiClient.post<{ left: number }>(Endpoints.subscriptions.consumeDownload);
      entCache = null;
      return { ok: true, left: r.data?.left ?? 0 };
    } catch (err) {
      const d = detailOf(err);
      if ((err as any)?.status === 403 && d?.code) {
        return { ok: false, message: d.message ?? 'Téléchargement non autorisé par votre plan.' };
      }
      // Erreur réseau / serveur : on ne bloque pas l'utilisateur sur une panne de comptage.
      return { ok: true, left: 0 };
    }
  },
};
