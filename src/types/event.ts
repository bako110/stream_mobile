// Aligné sur models/event.py

export type EventType =
  | 'concert' | 'birthday' | 'festival' | 'conference'
  | 'sport' | 'theater' | 'exhibition' | 'other';

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type EventAccessType = 'free' | 'ticket' | 'invite_only';

export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  status: EventStatus;
  access_type: EventAccessType;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string;
  venue_country: string;
  is_online: boolean;
  online_url: string | null;
  starts_at: string;
  ends_at: string | null;
  ticket_price: number | null;
  max_attendees: number | null;
  current_attendees: number;
  thumbnail_url: string | null;
  banner_url: string | null;
  gallery_urls: string[] | null;
  video_url: string | null;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  organizer?: import('./user').User;
}

export interface EventTicket {
  id: string;
  user_id: string;
  event_id: string;
  price_paid: number;
  is_used: boolean;
  created_at: string;
  event?: Event;
}

export interface EventCreate {
  title: string;
  description?: string;
  event_type: EventType;
  access_type: EventAccessType;
  venue_name?: string;
  venue_address?: string;
  venue_city: string;
  venue_country: string;
  is_online: boolean;
  online_url?: string;
  starts_at: string;
  ends_at?: string;
  ticket_price?: number;
  max_attendees?: number;
  thumbnail_url?: string;
  banner_url?: string;
  gallery_urls?: string[];
  video_url?: string;
}

export interface EventUpdate extends Partial<EventCreate> {
  status?: EventStatus;
}

// Réactions et commentaires sur un event
export interface EventReaction {
  event_id: string;
  reaction_type: 'like' | 'dislike';
}

export interface EventSave {
  event_id: string;
  saved: boolean;
}
