import { Concert } from './concert';
import { Event } from './event';
import { Reel } from './reel';

export interface SearchUser {
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_live?: boolean;
}

export interface SearchResults {
  users: SearchUser[];
  films: any[];
  series: any[];
  concerts: any[];
  events: any[];
  reels: any[];
  page?: number;
  limit?: number;
}

export interface SearchParams {
  q: string;
  page?: number;
  limit?: number;
  /** Filtre par catégorie — active la pagination cohérente sur un seul type (l'endpoint
   * mélange les catégories en mode "tous types", pas de pagination cohérente possible). */
  type?: 'users' | 'events' | 'concerts' | 'reels' | 'films';
}
