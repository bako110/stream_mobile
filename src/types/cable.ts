import type { User } from './user';
import type { Reel } from './reel';

export type CableInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface CableInvite {
  id: string;
  reel_id: string;
  sender_id: string;
  receiver_id: string;
  status: CableInviteStatus;
  message?: string | null;
  responded_at?: string | null;
  created_at: string;
  reel?: Reel;
  sender?: User;
  receiver?: User;
}

export interface CableInviteListResponse {
  items: CableInvite[];
  has_more: boolean;
  page: number;
  total: number;
  limit: number;
}
  