import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export type AdStatus = 'draft' | 'active' | 'paused' | 'ended' | 'rejected';
export type AdPlacement = 'feed' | 'reels' | 'stories' | 'search';
export type AdFormat = 'image' | 'video' | 'native';

export interface Ad {
  id:               string;
  advertiser_id:    string;
  title:            string;
  description:      string | null;
  cta_text:         string | null;
  cta_url:          string | null;
  creative_url:     string | null;
  thumbnail_url:    string | null;
  format:           AdFormat;
  placement:        AdPlacement;
  status:           AdStatus;
  budget_eur:       number;
  spent_eur:        number;
  cpm_eur:          number;
  daily_budget_eur: number | null;
  impressions:      number;
  clicks:           number;
  ctr_pct:          number;
  target_countries: string[] | null;
  target_interests: string[] | null;
  starts_at:        string | null;
  ends_at:          string | null;
  created_at:       string;
}

export interface AdCreate {
  title:             string;
  description?:      string;
  cta_text?:         string;
  cta_url?:          string;
  creative_url?:     string;
  thumbnail_url?:    string;
  format?:           AdFormat;
  placement?:        AdPlacement;
  budget_eur:        number;
  cpm_eur?:          number;
  daily_budget_eur?: number;
  starts_at?:        string;
  ends_at?:          string;
}

export const adService = {
  async getMine(): Promise<Ad[]> {
    const res = await apiClient.get<Ad[]>(Endpoints.ads.mine);
    return Array.isArray(res.data) ? res.data : [];
  },

  async getById(id: string): Promise<Ad> {
    const res = await apiClient.get<Ad>(Endpoints.ads.byId(id));
    return res.data;
  },

  async create(data: AdCreate): Promise<Ad> {
    const res = await apiClient.post<Ad>(Endpoints.ads.create, data);
    return res.data;
  },

  async update(id: string, data: Partial<AdCreate> & { status?: AdStatus }): Promise<Ad> {
    const res = await apiClient.patch<Ad>(Endpoints.ads.update(id), data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(Endpoints.ads.delete(id));
  },

  async pause(id: string): Promise<Ad> {
    return adService.update(id, { status: 'paused' });
  },

  async resume(id: string): Promise<Ad> {
    return adService.update(id, { status: 'active' });
  },

  async recordImpression(id: string): Promise<void> {
    await apiClient.post(Endpoints.ads.impression(id)).catch(() => {});
  },

  async recordClick(id: string): Promise<void> {
    await apiClient.post(Endpoints.ads.click(id)).catch(() => {});
  },

  statusLabel(status: AdStatus): string {
    return {
      draft:    'Brouillon',
      active:   'En ligne',
      paused:   'En pause',
      ended:    'Terminée',
      rejected: 'Refusée',
    }[status] ?? status;
  },

  statusColor(status: AdStatus): string {
    return {
      draft:    '#6B7280',
      active:   '#10B981',
      paused:   '#F59E0B',
      ended:    '#6B7280',
      rejected: '#EF4444',
    }[status] ?? '#6B7280';
  },
};
