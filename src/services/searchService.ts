import { apiClient, Endpoints } from '../api';
import type { SearchResults, SearchParams } from '../types';

export interface FeedResult {
  items: any[];
  total: number;
  page: number;
  limit: number;
}

export const searchService = {
  async searchAll(params: SearchParams): Promise<SearchResults> {
    const queryParams: Record<string, string> = {
      q:     params.q,
      page:  String(params.page  ?? 1),
      limit: String(params.limit ?? 15),
    };
    if (params.type) queryParams.type = params.type;
    const query = new URLSearchParams(queryParams).toString();
    const res = await apiClient.get<SearchResults>(`${Endpoints.search.query}?${query}`);
    return res.data;
  },

  async getFeed(page = 1, limit = 20, followingOnly = false, refresh = false): Promise<FeedResult> {
    const params: Record<string, string> = {
      page:  String(page),
      limit: String(limit),
    };
    if (followingOnly) params.following_only = 'true';
    // refresh=true bypass le cache serveur (pull-to-refresh explicite) — sans
    // ça, tirer pour rafraîchir dans la même minute renvoyait le même
    // contenu déjà en cache côté backend.
    if (refresh) params.refresh = 'true';
    const query = new URLSearchParams(params).toString();
    const res = await apiClient.get<FeedResult>(`${Endpoints.search.feed}?${query}`);
    return res.data;
  },

  async getTrending(): Promise<any[]> {
    const res = await apiClient.get<any>(`${Endpoints.search.trending}`);
    return Array.isArray(res.data) ? res.data : res.data?.items ?? [];
  },

  async getTrendingReels(page = 1, limit = 20): Promise<{ items: any[]; hasMore: boolean }> {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
    const res = await apiClient.get<any>(`${Endpoints.search.trendingReels}?${query}`);
    const data = res.data;
    const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    const hasMore = Array.isArray(data) ? items.length >= limit : data?.has_more ?? items.length >= limit;
    return { items, hasMore };
  },

  async getUpcomingEvents(): Promise<any[]> {
    const res = await apiClient.get<any>(`${Endpoints.search.upcomingEvents}`);
    return Array.isArray(res.data) ? res.data : res.data?.items ?? [];
  },
};
