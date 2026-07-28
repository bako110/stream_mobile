import { apiClient, Endpoints } from '../api';

export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year';
export type AnalyticsGranularity = 'hour' | 'day' | 'week' | 'month';
export type AnalyticsContentType = 'reel' | 'post' | 'event' | 'concert' | 'live';

export interface TimeseriesPoint {
  bucket: string;
  views: number;
  unique_viewers: number;
}

export interface CountryStat {
  country_code: string;
  country_name: string | null;
  views: number;
  share_pct: number;
}

export interface AnalyticsOverview {
  period: AnalyticsPeriod;
  granularity: AnalyticsGranularity;
  current_views: number;
  previous_views: number;
  evolution_pct: number | null;
  unique_viewers: number;
  timeseries: TimeseriesPoint[];
  top_countries: CountryStat[];
}

export interface ReachStats {
  total_followers: number;
  seen: number;
  not_seen: number;
  seen_pct: number | null;
}

export interface ContentStatItem {
  content_type: AnalyticsContentType;
  content_id: string;
  views: number;
  views_period: number;
  title: string | null;
  thumbnail_url: string | null;
}

export interface ContentDetailStats {
  content_type: AnalyticsContentType;
  content_id: string;
  title: string | null;
  thumbnail_url: string | null;
  current_views: number;
  previous_views: number;
  evolution_pct: number | null;
  timeseries: TimeseriesPoint[];
  top_countries: CountryStat[];
  reach: ReachStats;
}

interface CommonParams {
  period?: AnalyticsPeriod;
  granularity?: AnalyticsGranularity;
  contentType?: AnalyticsContentType;
  contentId?: string;
}

function buildQuery(params: CommonParams): string {
  const q: Record<string, string> = {};
  if (params.period) q.period = params.period;
  if (params.granularity) q.granularity = params.granularity;
  if (params.contentType) q.content_type = params.contentType;
  if (params.contentId) q.content_id = params.contentId;
  const query = new URLSearchParams(q).toString();
  return query ? `?${query}` : '';
}

export const analyticsService = {
  async getOverview(params: CommonParams = {}): Promise<AnalyticsOverview> {
    const res = await apiClient.get<AnalyticsOverview>(`${Endpoints.analytics.overview}${buildQuery(params)}`);
    return res.data;
  },

  async getTimeseries(params: CommonParams = {}): Promise<TimeseriesPoint[]> {
    const res = await apiClient.get<TimeseriesPoint[]>(`${Endpoints.analytics.timeseries}${buildQuery(params)}`);
    return res.data;
  },

  async getGeo(params: CommonParams = {}): Promise<CountryStat[]> {
    const res = await apiClient.get<CountryStat[]>(`${Endpoints.analytics.geo}${buildQuery(params)}`);
    return res.data;
  },

  async getReach(contentType: AnalyticsContentType, contentId: string): Promise<ReachStats> {
    const query = new URLSearchParams({ content_type: contentType, content_id: contentId }).toString();
    const res = await apiClient.get<ReachStats>(`${Endpoints.analytics.reach}?${query}`);
    return res.data;
  },

  async listContent(params: {
    contentType?: AnalyticsContentType; sort?: 'views' | 'recent';
    period?: AnalyticsPeriod; page?: number; limit?: number;
  } = {}): Promise<{ items: ContentStatItem[]; page: number; limit: number; total: number }> {
    const q: Record<string, string> = {};
    if (params.contentType) q.content_type = params.contentType;
    if (params.sort) q.sort = params.sort;
    if (params.period) q.period = params.period;
    if (params.page) q.page = String(params.page);
    if (params.limit) q.limit = String(params.limit);
    const query = new URLSearchParams(q).toString();
    const res = await apiClient.get<{ items: ContentStatItem[]; page: number; limit: number; total: number }>(
      `${Endpoints.analytics.content}${query ? `?${query}` : ''}`,
    );
    return res.data;
  },

  async getContentDetail(contentType: AnalyticsContentType, contentId: string, period: AnalyticsPeriod = 'month'): Promise<ContentDetailStats> {
    const query = new URLSearchParams({ period }).toString();
    const res = await apiClient.get<ContentDetailStats>(`${Endpoints.analytics.contentDetail(contentType, contentId)}?${query}`);
    return res.data;
  },
};
