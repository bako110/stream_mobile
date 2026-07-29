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
    followingOnly?: boolean;
  }): Promise<ReelFeedResponse> {
    const page  = params?.page  ?? 1;
    const limit = params?.limit ?? REELS_PAGE_LIMIT;

    const queryParams: Record<string, string> = {
      page:  String(page),
      limit: String(limit),
    };
    if (params?.followingOnly) queryParams.following_only = 'true';
    const query = new URLSearchParams(queryParams).toString();

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
   * Recherche de reels par mot-clé — utilise le paramètre `search` de GET /reels
   * (voir reels.py:25-62 côté backend), qui filtre sur caption/username/display_name
   * et supporte la vraie pagination (has_more).
   */
  async search(query: string, page = 1, limit = 20): Promise<ReelFeedResponse> {
    try {
      const q   = new URLSearchParams({ search: query, page: String(page), limit: String(limit) }).toString();
      const res = await apiClient.get<any>(`${Endpoints.reels.feed}?${q}`);
      const data = res.data ?? res;
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      return { items, has_more: data.has_more ?? items.length >= limit, page: data.page ?? page, total: data.total ?? items.length, limit: data.limit ?? limit };
    } catch {
      // Fallback : feed standard filtré côté client (endpoint indisponible)
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
    hls_url:         string;
    mp4_url?:        string;
    caption?:        string;
    category?:       string;
    thumbnail_url?:  string;
    duration_sec?:   number;
    ref_concert_id?: string;
    ref_event_id?:   string;
    ref_content_id?: string;
    mention_ids?:    string[];
    trim_start?:     number;
    trim_end?:       number;
    playback_speed?: number;
    filter?:         string;
    text_layers?:    string;
    sticker_layers?: string;
    draw_layers?:    string;
    video_adjust?:   string;
    music_url?:       string;
    music_name?:      string;
    music_start_sec?: number;
    music_end_sec?:   number;
    source_reel_id?: string;
    remix_type?:     'repost' | 'remix';
  }): Promise<Reel> {
    const res = await apiClient.post<Reel>(Endpoints.reels.feed, payload);
    return res.data;
  },

  async repost(sourceReelId: string, caption?: string): Promise<Reel> {
    const res = await apiClient.post<Reel>(`${Endpoints.reels.feed}/${sourceReelId}/repost`, { caption });
    return res.data;
  },

  /**
   * Enregistre une vue. Appelé uniquement si watch_ratio >= 0.1 (10% visionné).
   * Fire-and-forget côté UI — ne jamais await si ce n'est pas critique.
   */
  async recordView(id: string, watchRatio = 1.0, watchSeconds?: number): Promise<void> {
    await apiClient.post(Endpoints.reels.view(id), {
      watch_ratio: Math.max(0, Math.min(1, watchRatio)),
      ...(watchSeconds != null ? { watch_seconds: Math.round(watchSeconds) } : {}),
    });
  },

  async update(id: string, payload: {
    caption?:       string;
    filter?:        string;
    text_layers?:   string;
    sticker_layers?: string;
    draw_layers?:   string;
    video_adjust?:  string;
  }): Promise<Reel> {
    const res = await apiClient.patch<Reel>(Endpoints.reels.update(id), payload);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(Endpoints.reels.delete(id));
  },
};