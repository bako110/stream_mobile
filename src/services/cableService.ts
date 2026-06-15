import { apiClient, Endpoints } from '../api';
import type { CableInvite, CableInviteListResponse } from '../types';

export const cableService = {
  async sendInvite(reelId: string, receiverId: string, message?: string): Promise<CableInvite> {
    const res = await apiClient.post<CableInvite>(Endpoints.cable.sendInvite(reelId), {
      receiver_id: receiverId,
      message: message ?? null,
    });
    return res.data;
  },

  async respondInvite(inviteId: string, accept: boolean): Promise<CableInvite> {
    const res = await apiClient.patch<CableInvite>(Endpoints.cable.respondInvite(inviteId), { accept });
    return res.data;
  },

  async cancelInvite(inviteId: string): Promise<CableInvite> {
    const res = await apiClient.delete<CableInvite>(Endpoints.cable.cancelInvite(inviteId));
    return res.data;
  },

  async listInvites(direction: 'received' | 'sent' = 'received', page = 1, limit = 20): Promise<CableInviteListResponse> {
    const query = new URLSearchParams({ direction, page: String(page), limit: String(limit) }).toString();
    const res = await apiClient.get<CableInviteListResponse>(`${Endpoints.cable.listInvites}?${query}`);
    return res.data;
  },
};
