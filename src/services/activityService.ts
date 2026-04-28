import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityActor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface ActivityItem {
  id: string;
  actor_id: string;
  actor: ActivityActor | null;
  target_user_id: string | null;
  activity_type: string;
  ref_id: string | null;
  summary: string | null;
  created_at: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const activityService = {
  async getFeed(page = 1, limit = 30): Promise<ActivityItem[]> {
    const res = await apiClient.get<ActivityItem[]>(
      `${Endpoints.activity.feed}?page=${page}&limit=${limit}`,
    );
    return res.data;
  },
};
