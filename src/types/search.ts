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
}
