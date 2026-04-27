// Aligné sur models/concert.py

export type ConcertType = 'live' | 'replay' | 'live_and_replay';
export type AccessType = 'free' | 'subscription' | 'ticket' | 'ppv';
export type ConcertStatus = 'draft' | 'published' | 'live' | 'ended' | 'archived';

export interface Concert {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  genre: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  scheduled_at: string;
  duration_min: number | null;
  concert_type: ConcertType;
  access_type: AccessType;
  status: ConcertStatus;
  ticket_price: number | null;
  max_viewers: number | null;
  current_viewers: number;
  view_count: number;
  thumbnail_url: string | null;
  banner_url: string | null;
  video_url: string | null;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // relation
  artist?: import('./user').User;
}

export interface ConcertCreate {
  title: string;
  description?: string;
  genre?: string;
  venue_name?: string;
  venue_city: string;
  venue_country: string;
  scheduled_at: string;
  duration_min?: number;
  concert_type: ConcertType;
  access_type: AccessType;
  ticket_price?: number;
  max_viewers?: number;
  thumbnail_url?: string;
  banner_url?: string;
  video_url?: string;
}

export interface ConcertUpdate extends Partial<ConcertCreate> {
  status?: ConcertStatus;
}

export interface StreamToken {
  token: string;
  room_name: string;
  livekit_url: string;
}

export interface StreamStatus {
  is_live: boolean;
  current_viewers: number;
  started_at: string | null;
  livekit_url: string | null;
}
