import { apiClient, Endpoints } from '../api';
import type { Reel } from '../types';
import { REELS_PAGE_LIMIT } from '../utils/constants';

export const reelService = {
  async getFeed(params?: { page?: number; limit?: number; search?: string }): Promise<{ items: Reel[]; has_more: boolean; page: number }> {
    const p: Record<string, string> = {
      page:  String(params?.page  ?? 1),
      limit: String(params?.limit ?? REELS_PAGE_LIMIT),
    };
    if (params?.search) p.search = params.search;
    const query = new URLSearchParams(p).toString();
    const res = await apiClient.get<any>(
      `${Endpoints.reels.feed}?${query}`,
    );
    const data = res.data ?? res;
    // Le backend retourne { items, has_more, page } ou un tableau plat
    if (Array.isArray(data)) {
      return { items: data, has_more: data.length >= (params?.limit ?? REELS_PAGE_LIMIT), page: params?.page ?? 1 };
    }
    return {
      items:    Array.isArray(data.items) ? data.items : [],
      has_more: data.has_more ?? false,
      page:     data.page ?? 1,
    };
  },

  async getById(id: string): Promise<Reel> {
    const res = await apiClient.get<Reel>(Endpoints.reels.byId(id));
    return res.data;
  },

  async create(payload: { video_url: string; caption?: string; thumbnail_url?: string; duration_sec?: number; ref_concert_id?: string; ref_event_id?: string }): Promise<Reel> {
    const res = await apiClient.post<Reel>(Endpoints.reels.feed, payload);
    return res.data;
  },

  async recordView(id: string, watchRatio: number = 1.0): Promise<void> {
    await apiClient.post(Endpoints.reels.view(id), { watch_ratio: watchRatio });
  },

  async update(id: string, payload: { caption?: string }): Promise<Reel> {
    const res = await apiClient.patch<Reel>(Endpoints.reels.update(id), payload);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(Endpoints.reels.delete(id));
  },
};
