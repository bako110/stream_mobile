import { apiClient, Endpoints } from '../api';
import type { Reel } from '../types';
import { REELS_PAGE_LIMIT } from '../utils/constants';

export interface ReelFeedResponse {
  items:    Reel[];
  has_more: boolean;
  page:     number;
  total:    number;
  limit:    number;
}

export const reelService = {
  /**
   * Récupère le feed paginé.
   * NOTE: `search` n'est PAS supporté par l'endpoint /feed —
   * utilise un endpoint dédié si tu veux chercher des reels.
   */
  async getFeed(params?: {
    page?:  number;
    limit?: number;
  }): Promise<ReelFeedResponse> {
    const page  = params?.page  ?? 1;
    const limit = params?.limit ?? REELS_PAGE_LIMIT;

    const query = new URLSearchParams({
      page:  String(page),
      limit: String(limit),
    }).toString();

    const res  = await apiClient.get<any>(`${Endpoints.reels.feed}?${query}`);
    const data = res.data ?? res;

    // Normalise selon ce que le backend renvoie
    if (Array.isArray(data)) {
      return {
        items:    data,
        has_more: data.length >= limit,
        page,
        total:    data.length,
        limit,
      };
    }

    const items = Array.isArray(data.items) ? data.items : [];
    return {
      items,
      has_more: data.has_more ?? items.length >= limit,
      page:     data.page  ?? page,
      total:    data.total ?? items.length,
      limit:    data.limit ?? limit,
    };
  },

  /**
   * Recherche de reels par mot-clé (endpoint séparé à implémenter côté backend).
   * Fallback : filtre client-side sur le feed si l'endpoint n'existe pas.
   */
  async search(query: string, page = 1, limit = 20): Promise<ReelFeedResponse> {
    try {
      const q   = new URLSearchParams({ q: query, page: String(page), limit: String(limit) }).toString();
      const res = await apiClient.get<any>(`${Endpoints.reels.feed}/search?${q}`);
      const data = res.data ?? res;
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      return { items, has_more: data.has_more ?? false, page, total: data.total ?? items.length, limit };
    } catch {
      // Fallback : feed standard filtré côté client
      const feed = await reelService.getFeed({ page, limit: 50 });
      const lower = query.toLowerCase();
      const filtered = feed.items.filter(r =>
        r.caption?.toLowerCase().includes(lower) ||
        r.author?.display_name?.toLowerCase().includes(lower) ||
        r.author?.username?.toLowerCase().includes(lower)
      );
      return { items: filtered, has_more: false, page, total: filtered.length, limit };
    }
  },

  async getById(id: string): Promise<Reel> {
    const res = await apiClient.get<Reel>(Endpoints.reels.byId(id));
    return res.data;
  },

  async create(payload: {
    video_url:      string;
    caption?:       string;
    thumbnail_url?: string;
    duration_sec?:  number;
    ref_concert_id?: string;
    ref_event_id?:   string;
    ref_content_id?: string;
  }): Promise<Reel> {
    const res = await apiClient.post<Reel>(Endpoints.reels.feed, payload);
    return res.data;
  },

  /**
   * Enregistre une vue. Appelé uniquement si watch_ratio >= 0.1 (10% visionné).
   * Fire-and-forget côté UI — ne jamais await si ce n'est pas critique.
   */
  async recordView(id: string, watchRatio = 1.0): Promise<void> {
    await apiClient.post(Endpoints.reels.view(id), {
      watch_ratio: Math.max(0, Math.min(1, watchRatio)),
    });
  },

  async update(id: string, payload: { caption?: string }): Promise<Reel> {
    const res = await apiClient.patch<Reel>(Endpoints.reels.update(id), payload);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(Endpoints.reels.delete(id));
  },
};