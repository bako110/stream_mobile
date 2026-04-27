import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanningInvite {
  id: string;
  invitee_id: string;
  invitee?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified?: boolean;
  } | null;
  status: 'pending' | 'accepted' | 'declined';
  message?: string | null;
  created_at?: string;
  responded_at?: string | null;
}

export interface PlanningItem {
  type: 'concert' | 'event' | 'my_concert' | 'my_event' | 'personal' | 'invited';
  id: string;
  ref_id: string;
  title: string;
  description?: string | null;
  date: string | null;
  end_date?: string | null;
  venue: string;
  thumbnail_url: string | null;
  color?: string | null;
  genre?: string;
  event_type?: string;
  status: string;
  invite_status?: 'pending' | 'accepted' | 'declined';
  invite_message?: string | null;
  ticket_status: string | null;
  access_code: string | null;
  artist?: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified?: boolean } | null;
  organizer?: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified?: boolean } | null;
  invites?: PlanningInvite[];
}

export interface CreatePlanningEntry {
  title: string;
  description?: string;
  date: string;
  end_date?: string;
  location?: string;
  color?: string;
  invitee_ids?: string[];
  invite_message?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const planningService = {
  async getFeed(page = 1, limit = 50): Promise<PlanningItem[]> {
    const res = await apiClient.get<PlanningItem[]>(
      `${Endpoints.planning.feed}?page=${page}&limit=${limit}`,
    );
    return res.data;
  },

  async createEntry(data: CreatePlanningEntry): Promise<PlanningItem> {
    const res = await apiClient.post<PlanningItem>(Endpoints.planning.entries, data);
    return res.data;
  },

  async updateEntry(id: string, data: Partial<CreatePlanningEntry>): Promise<PlanningItem> {
    const res = await apiClient.put<PlanningItem>(Endpoints.planning.entry(id), data);
    return res.data;
  },

  async deleteEntry(id: string): Promise<void> {
    await apiClient.delete(Endpoints.planning.entry(id));
  },

  async getPendingInvites(): Promise<PlanningItem[]> {
    const res = await apiClient.get<PlanningItem[]>(Endpoints.planning.invites);
    return res.data;
  },

  async respondToInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<PlanningItem> {
    const res = await apiClient.patch<PlanningItem>(
      Endpoints.planning.respondInvite(inviteId),
      { status },
    );
    return res.data;
  },
};
