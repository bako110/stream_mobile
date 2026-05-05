import { apiClient, Endpoints } from '../api';
import { DEFAULT_PAGE_LIMIT } from '../utils/constants';
import type { Content, ContentListResponse, Season, Episode, VideoMeta } from '../types';

export const contentService = {
  // ── Films ────────────────────────────────────────────────────────────────
  async listFilms(params?: {
    page?: number;
    limit?: number;
    year?: number;
    language?: string;
  }): Promise<ContentListResponse> {
    const query = new URLSearchParams({
      page:  String(params?.page  ?? 1),
      limit: String(params?.limit ?? DEFAULT_PAGE_LIMIT),
      ...(params?.year     ? { year:     String(params.year)     } : {}),
      ...(params?.language ? { language: params.language          } : {}),
    }).toString();
    const res = await apiClient.get<ContentListResponse>(
      `${Endpoints.content.films}?${query}`,
    );
    return res.data;
  },

  async getFilm(id: string): Promise<Content> {
    const res = await apiClient.get<Content>(Endpoints.content.filmById(id));
    return res.data;
  },

  // ── Séries ───────────────────────────────────────────────────────────────
  async listSeries(params?: { page?: number; limit?: number }): Promise<ContentListResponse> {
    const query = new URLSearchParams({
      page:  String(params?.page  ?? 1),
      limit: String(params?.limit ?? DEFAULT_PAGE_LIMIT),
    }).toString();
    const res = await apiClient.get<ContentListResponse>(
      `${Endpoints.content.series}?${query}`,
    );
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
