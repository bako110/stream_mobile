import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export interface NotifActor {
  id:           string;
  username:     string;
  display_name: string;
  avatar_url:   string | null;
}

export interface NotifItem {
  id:                string;
  notification_type: string;
  title:             string;
  body:              string;
  ref_id:            string | null;
  ref_type:          string | null;
  is_read:           boolean;
  created_at:        string;
  actor:             NotifActor | null;
}

export const notificationService = {
  async getList(page = 1, limit = 30, unreadOnly = false): Promise<NotifItem[]> {
    const res = await apiClient.get<NotifItem[]>(
      `${Endpoints.notifications.list}?page=${page}&limit=${limit}&unread_only=${unreadOnly}`,
    );
    return res.data;
  },

  async getUnreadCount(): Promise<number> {
    const res = await apiClient.get<{ unread_count: number }>(Endpoints.notifications.unreadCount);
    return res.data.unread_count;
  },

  async markRead(id: string): Promise<void> {
    await apiClient.patch(Endpoints.notifications.read(id));
  },

  async markAllRead(): Promise<void> {
    await apiClient.patch(Endpoints.notifications.readAll);
  },

  async deleteOne(id: string): Promise<void> {
    await apiClient.delete(Endpoints.notifications.delete(id));
  },

  async deleteAll(): Promise<void> {
    await apiClient.delete(Endpoints.notifications.deleteAll);
  },
};
