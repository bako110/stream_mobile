// Aligné sur models/content.py, season.py, episode.py

export type ContentType = 'film' | 'serie';
export type ContentStatus = 'draft' | 'published' | 'archived';

export interface Content {
  id: string;
  type: ContentType;
  title: string;
  original_title: string | null;
  year: number;
  synopsis: string | null;
  short_synopsis: string | null;
  director: string | null;
  cast: Record<string, string> | null;
  language: string;
  country: string | null;
  rating: string | null;
  thumbnail_url: string | null;
  banner_url: string | null;
  trailer_url: string | null;
  is_premium: boolean;
  price: number | null;
  status: ContentStatus;
  total_seasons: number;
  view_count: number;
  average_rating: number | null;
  added_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Season {
  id: string;
  content_id: string;
  number: number;
  title: string | null;
  synopsis: string | null;
  year: number | null;
  total_episodes: number;
  created_at: string;
}

export interface Episode {
  id: string;
  season_id: string;
  number: number;
  title: string;
  synopsis: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  video_url: string | null;
  is_free: boolean;
  is_published: boolean;
  view_count: number;
  created_at: string;
}

export interface ContentListResponse {
  items: Content[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface VideoMeta {
  id: string;
  content_id: string | null;
  episode_id: string | null;
  label: string;
  is_default: boolean;
  is_free: boolean;
  hls_url: string | null;
  duration_sec: number | null;
  transcode_status: string;
  transcode_progress: number;
  created_at: string;
}
