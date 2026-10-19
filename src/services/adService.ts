import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export type AdStatus = 'draft' | 'active' | 'paused' | 'ended' | 'rejected';
export type AdPlacement = 'feed' | 'reels' | 'stories' | 'search';
export type AdFormat = 'image' | 'video' | 'native';
export type AdSourceType = 'post' | 'reel' | 'event' | 'concert';

export interface Ad {
  id:               string;
  advertiser_id:    string;
  title:            string;
  description:      string | null;
  cta_text:         string | null;
  cta_url:          string | null;
  creative_url:     string | null;
  thumbnail_url:    string | null;
  contact_phone?:   string | null;
  contact_call?:    boolean;
  contact_whatsapp?: boolean;
  source_content_type?: AdSourceType | null;
  source_content_id?:   string | null;
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
  target_regions:   string[] | null;
  target_genders:   string[] | null;
  target_interests: string[] | null;
  target_age_min:   number | null;
  target_age_max:   number | null;
  starts_at:        string | null;
  ends_at:          string | null;
  created_at:       string;
  gogold_debited?:   number;
  gogold_spent?:     number;
  gogold_remaining?: number;
}

export interface AdCreate {
  title:             string;
  description?:      string;
  cta_text?:         string;
  cta_url?:          string;
  creative_url?:     string;
  thumbnail_url?:    string;
  contact_phone?:    string;
  contact_call?:     boolean;
  contact_whatsapp?: boolean;
  source_content_type?: AdSourceType;
  source_content_id?:   string;
  format?:           AdFormat;
  placement?:        AdPlacement;
  budget_eur:        number;
  cpm_eur?:          number;
  daily_budget_eur?: number;
  target_countries?: string[];
  target_regions?:   string[];
  target_genders?:   string[];
  target_interests?: string[];
  target_age_min?:   number;
  target_age_max?:   number;
  starts_at?:        string;
  ends_at?:          string;
}

export interface AdsPage {
  items: Ad[];
  page:  number;
  limit: number;
  total: number;
}

// Totaux agrégés sur TOUTES les campagnes de l'annonceur (pas seulement la page
// chargée à l'écran) — alimente les KPIs globaux, indépendants du scroll.
export interface AdsStats {
  total_count:      number;
  active_count:     number;
  budget_eur:       number;
  spent_eur:        number;
  impressions:      number;
  clicks:           number;
  ctr_pct:          number;
  gogold_debited:   number;
  gogold_spent:     number;
  gogold_remaining: number;
}

const EMPTY_STATS: AdsStats = {
  total_count: 0, active_count: 0, budget_eur: 0, spent_eur: 0,
  impressions: 0, clicks: 0, ctr_pct: 0,
  gogold_debited: 0, gogold_spent: 0, gogold_remaining: 0,
};

// Le meilleur contenu récent de l'utilisateur à proposer au boost — alimente
// le bottom sheet "Booste ta publication" du feed d'accueil.
export interface BoostSuggestion {
  source_content_type: AdSourceType;
  source_content_id:   string;
  title:        string;
  creative_url: string | null;
  thumbnail_url: string | null;
  format:       AdFormat;
  view_count:    number;
  like_count:    number;
  comment_count: number;
  share_count:   number;
  score:        number;
  created_at:   string;
}

export const adService = {
  async getMine(page = 1, limit = 20): Promise<AdsPage> {
    const res = await apiClient.get<AdsPage>(`${Endpoints.ads.mine}?page=${page}&limit=${limit}`);
    const data = res.data;
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      page:  data?.page  ?? page,
      limit: data?.limit ?? limit,
      total: data?.total ?? 0,
    };
  },

  async getStats(): Promise<AdsStats> {
    try {
      const res = await apiClient.get<AdsStats>(Endpoints.ads.mineStats);
      return { ...EMPTY_STATS, ...res.data };
    } catch {
      return EMPTY_STATS;
    }
  },

  async getBoostSuggestion(): Promise<BoostSuggestion | null> {
    try {
      const res = await apiClient.get<BoostSuggestion | null>(Endpoints.ads.boostSuggestion);
      return res.data ?? null;
    } catch {
      return null;
    }
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
