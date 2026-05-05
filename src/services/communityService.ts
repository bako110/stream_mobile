import { apiClient, Endpoints } from '../api';

export interface CommunityData {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_private: boolean;
  members_count: number;
  creator_id: string;
  creator: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  created_at: string | null;
}

export interface CommunityMemberData {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string | null;
}

export interface CreateCommunityPayload {
  name: string;
  description?: string;
  is_private?: boolean;
  avatar_url?: string;
  banner_url?: string;
}

export interface BlockedMemberData {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  blocked_at: string | null;
  reason: string | null;
}

export type CommunityMessageType = 'text' | 'image' | 'media' | 'announcement' | 'poll' | 'event';

export interface CommunityMessageData {
  id: string;
  community_id: string;
  sender_id: string;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  message_type: CommunityMessageType;
  content: string | null;
  media_urls: string[];
  reply_to_id: string | null;
  reply_to: {
    id: string; sender_id: string;
    sender_display_name: string | null;
    sender_username: string | null;
    content: string | null;
    message_type: CommunityMessageType;
  } | null;
  is_pinned: boolean;
  reactions: { emoji: string; count: number; user_ids: string[] }[];
  poll: unknown | null;
  created_at: string;
  edited_at: string | null;
}

export const communityService = {
  async list(page = 1, limit = 20): Promise<CommunityData[]> {
    const res = await apiClient.get<CommunityData[]>(
      `${Endpoints.communities.list}?page=${page}&limit=${limit}`,
    );
    return res.data;
  },

  async discover(page = 1, limit = 20): Promise<CommunityData[]> {
    const res = await apiClient.get<CommunityData[]>(
      `${Endpoints.communities.discover}?page=${page}&limit=${limit}`,
    );
    return res.data;
  },

  async mine(): Promise<CommunityData[]> {
    const res = await apiClient.get<CommunityData[]>(Endpoints.communities.mine);
    return res.data;
  },

  async getById(id: string): Promise<CommunityData> {
    const res = await apiClient.get<CommunityData>(Endpoints.communities.byId(id));
    return res.data;
  },

  async create(data: CreateCommunityPayload): Promise<CommunityData> {
    const res = await apiClient.post<CommunityData>(Endpoints.communities.create, data);
    return res.data;
  },

  async join(id: string): Promise<{ joined: boolean }> {
    const res = await apiClient.post<{ joined: boolean }>(Endpoints.communities.join(id));
    return res.data;
  },

  async leave(id: string): Promise<{ left: boolean }> {
    const res = await apiClient.post<{ left: boolean }>(Endpoints.communities.leave(id));
    return res.data;
  },

  async getMembers(id: string): Promise<CommunityMemberData[]> {
    const res = await apiClient.get<CommunityMemberData[]>(Endpoints.communities.members(id));
    return res.data;
  },

  async blockMember(communityId: string, userId: string): Promise<{ blocked: boolean }> {
    const res = await apiClient.post<{ blocked: boolean }>(Endpoints.communities.block(communityId, userId));
    return res.data;
  },

  async unblockMember(communityId: string, userId: string): Promise<{ unblocked: boolean }> {
    const res = await apiClient.delete<{ unblocked: boolean }>(Endpoints.communities.block(communityId, userId));
    return res.data;
  },

  async getMyRole(id: string): Promise<string | null> {
    const res = await apiClient.get<{ role: string | null }>(Endpoints.communities.role(id));
    return res.data.role;
  },

  async getBlockedMembers(id: string): Promise<BlockedMemberData[]> {
    const res = await apiClient.get<BlockedMemberData[]>(Endpoints.communities.blocked(id));
    return res.data;
  },

  async sendMessage(id: string, content: string, message_type = 'text', media_urls?: string[], reply_to_id?: string): Promise<CommunityMessageData> {
    const res = await apiClient.post<CommunityMessageData>(
      Endpoints.communities.messages(id),
      { content: content || null, message_type, media_urls: media_urls ?? [], reply_to_id: reply_to_id ?? null },
    );
    return res.data;
  },

  async getMessages(id: string, page = 1, limit = 30, message_type?: string): Promise<CommunityMessageData[]> {
    let url = `${Endpoints.communities.messages(id)}?page=${page}&limit=${limit}`;
    if (message_type) url += `&message_type=${message_type}`;
    const res = await apiClient.get<CommunityMessageData[]>(url);
    return res.data;
  },

  async getPinnedMessages(id: string): Promise<CommunityMessageData[]> {
    const res = await apiClient.get<CommunityMessageData[]>(`${Endpoints.communities.messages(id)}/pinned`);
    return res.data;
  },

  async editMessage(communityId: string, messageId: string, content: string): Promise<CommunityMessageData> {
    const res = await apiClient.put<CommunityMessageData>(
      Endpoints.communities.message(communityId, messageId), { content },
    );
    return res.data;
  },

  async deleteMessage(communityId: string, messageId: string): Promise<void> {
    await apiClient.delete(Endpoints.communities.message(communityId, messageId));
  },
};
