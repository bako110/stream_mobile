import { apiClient, Endpoints } from '../api';
import { DEFAULT_PAGE_LIMIT } from '../utils/constants';
import type { Content, ContentListResponse, Season, Episode, VideoMeta } from '../types';

export interface FilmFilterParams {
  page?: number;
  limit?: number;
  year?: number;
  language?: string;
  genre?: string;
  country?: string;
  is_premium?: boolean;
  sort?: 'recent' | 'rating' | 'year' | 'views';
  search?: string;
  min_rating?: number;
}

export interface SerieFilterParams {
  page?: number;
  limit?: number;
  year?: number;
  language?: string;
  genre?: string;
  country?: string;
  is_premium?: boolean;
  sort?: 'recent' | 'rating' | 'year' | 'views' | 'seasons';
  search?: string;
  min_rating?: number;
  ongoing?: boolean;
}

function buildParams(params: Record<string, string | number | boolean | undefined | null>): string {
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') p[k] = String(v);
  }
  return new URLSearchParams(p).toString();
}

export const contentService = {
  // ── Films ────────────────────────────────────────────────────────────────
  async listFilms(params?: FilmFilterParams): Promise<ContentListResponse> {
    const qs = buildParams({
      page:       params?.page  ?? 1,
      limit:      params?.limit ?? DEFAULT_PAGE_LIMIT,
      year:       params?.year,
      language:   params?.language,
      genre:      params?.genre,
      country:    params?.country,
      is_premium: params?.is_premium,
      sort:       params?.sort,
      search:     params?.search,
      min_rating: params?.min_rating,
    });
    const res = await apiClient.get<ContentListResponse>(`${Endpoints.content.films}?${qs}`);
    return res.data;
  },

  async getFilm(id: string): Promise<Content> {
    const res = await apiClient.get<Content>(Endpoints.content.filmById(id));
    return res.data;
  },

  // ── Séries ───────────────────────────────────────────────────────────────
  async listSeries(params?: SerieFilterParams): Promise<ContentListResponse> {
    const qs = buildParams({
      page:       params?.page  ?? 1,
      limit:      params?.limit ?? DEFAULT_PAGE_LIMIT,
      year:       params?.year,
      language:   params?.language,
      genre:      params?.genre,
      country:    params?.country,
      is_premium: params?.is_premium,
      sort:       params?.sort,
      search:     params?.search,
      min_rating: params?.min_rating,
      ongoing:    params?.ongoing,
    });
    const res = await apiClient.get<ContentListResponse>(`${Endpoints.content.series}?${qs}`);
    return res.data;
  },

  async getSerie(id: string): Promise<Content> {
    const res = await apiClient.get<Content>(Endpoints.content.serieById(id));
    return res.data;
  },

  // ── Saisons ──────────────────────────────────────────────────────────────
  async getSeasons(serieId: string): Promise<Season[]> {
    const res = await apiClient.get<Season[]>(Endpoints.seasons.bySerie(serieId));
    return res.data;
  },

  // ── Episodes ─────────────────────────────────────────────────────────────
  async getEpisodes(contentId: string, seasonNumber: number): Promise<Episode[]> {
    const res = await apiClient.get<Episode[]>(Endpoints.episodes.bySeason(contentId, seasonNumber));
    return res.data;
  },

  async getEpisode(episodeId: string): Promise<Episode> {
    const res = await apiClient.get<Episode>(Endpoints.episodes.byId(episodeId));
    return res.data;
  },

  // ── Vidéos film ──────────────────────────────────────────────────────────
  async getFilmVideos(contentId: string): Promise<VideoMeta[]> {
    const res = await apiClient.get<VideoMeta[]>(Endpoints.videos.byContent(contentId));
    return res.data;
  },

  // ── Vidéo épisode ─────────────────────────────────────────────────────────
  async getEpisodeVideo(episodeId: string): Promise<VideoMeta | null> {
    try {
      const res = await apiClient.get<VideoMeta[]>(Endpoints.videos.byEpisode(episodeId));
      const list = Array.isArray(res.data) ? res.data : [];
      return list.find(v => v.is_default) ?? list[0] ?? null;
    } catch {
      return null;
    }
  },
};
