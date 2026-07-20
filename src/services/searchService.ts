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
    const query = new URLSearchParams({
      q:     params.q,
      page:  String(params.page  ?? 1),
      limit: String(params.limit ?? 15),
    }).toString();
    const res = await apiClient.get<SearchResults>(`${Endpoints.search.query}?${query}`);
    return res.data;
  },

  async getFeed(page = 1, limit = 20, followingOnly = false): Promise<FeedResult> {
    const params: Record<string, string> = {
      page:  String(page),
      limit: String(limit),
    };
    if (followingOnly) params.following_only = 'true';
    const query = new URLSearchParams(params).toString();
    const res = await apiClient.get<FeedResult>(`${Endpoints.search.feed}?${query}`);
    return res.data;
  },

  async getTrending(): Promise<any[]> {
    const res = await apiClient.get<any>(`${Endpoints.search.trending}`);
    return Array.isArray(res.data) ? res.data : res.data?.items ?? [];
  },

  async getTrendingReels(): Promise<any[]> {
    const res = await apiClient.get<any>(`${Endpoints.search.trendingReels}`);
    return Array.isArray(res.data) ? res.data : res.data?.items ?? [];
  },

  async getUpcomingEvents(): Promise<any[]> {
    const res = await apiClient.get<any>(`${Endpoints.search.upcomingEvents}`);
    return Array.isArray(res.data) ? res.data : res.data?.items ?? [];
  },
};
