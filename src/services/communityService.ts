import { apiClient, Endpoints } from '../api';

export type JoinStatus = 'none' | 'pending' | 'member';

export interface CommunityData {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_private: boolean;
  requires_approval: boolean;
  members_only_chat: boolean;
  entry_price_coins: number;
  is_verified: boolean;
  verified_at: string | null;
  members_count: number;
  creator_id: string;
  join_status: JoinStatus;
  creator: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  created_at: string | null;
}

export interface JoinRequest {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  coins_paid: number;
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
  requires_approval?: boolean;
  entry_price_coins?: number;
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

export interface VerificationRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  review_note: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  community: {
    id: string;
    name: string;
    avatar_url: string | null;
    members_count: number;
    is_verified: boolean;
  } | null;
  requester: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  reviewer: {
    id: string;
    username: string | null;
    display_name: string | null;
  } | null;
}

export interface CommunityMemberProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: 'admin' | 'moderator' | 'member';
  joined_at: string | null;
  bio: string | null;
  xp: number;
  level: number;
  badges: string[];
  posts_count: number;
  reactions_given: number;
  events_attended: number;
  is_online: boolean;
  last_seen: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  coins: number;
  weekly_coins: number;
  streak: number;
  is_me: boolean;
}

export interface LeaderboardMyStats {
  rank: number;
  coins: number;
  weekly_coins: number;
  coins_to_next: number;
  streak: number;
}

export interface CommunityStats {
  members: {
    total: number;
    new_week: number;
    new_month: number;
    growth: number;
  };
  engagement: {
    messages_today: number;
    messages_week: number;
    active_members: number;
    reactions: number;
  };
  content: {
    posts: number;
    pinned: number;
    polls: number;
    media: number;
  };
  top_contributors: {
    id: string;
    user_id: string;
    name: string;
    username: string;
    avatar_url: string | null;
    coins: number;
    posts: number;
  }[];
  activity: { day: string; msgs: number }[];
  roles: { admin: number; moderator: number; member: number };
  retention: { d1: number; d7: number; d30: number };
}

export interface CommunityEvent {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  location: string | null;
  cover_url: string | null;
  color: string | null;
  is_online: boolean;
  starts_at: string;
  ends_at: string | null;
  status: 'upcoming' | 'ongoing' | 'past' | 'cancelled';
  going_count: number;
  maybe_count: number;
  rsvp_status: 'going' | 'maybe' | 'not_going' | null;
  organizer: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  created_at: string | null;
}

export interface MemberCreatorStats {
  reels_count: number;
  reels_views: number;
  reels_likes: number;
  reels_comments: number;
  reels_shares: number;
  posts_count: number;
  posts_likes: number;
  posts_comments: number;
  posts_shares: number;
  stories_count: number;
  stories_views: number;
  stories_likes: number;
  followers: number;
  following: number;
  total_coins_earned: number;
  gifts_coins_earned: number;
  community_coins_earned: number;
}

// ── Canaux (sous-groupes) ─────────────────────────────────────────────────────

export type ChannelType = 'text' | 'announcement' | 'voice';

export interface CommunityChannel {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  type: ChannelType;
  emoji: string | null;
  avatar_url: string | null;
  is_private: boolean;
  has_password: boolean;
  members_count: number;
  position: number;
  created_by: string;
  created_at: string;
  unread_count?: number;
  last_message?: {
    content: string | null;
    sender_display_name: string | null;
    created_at: string;
  } | null;
}

export interface CommunityChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: 'member' | 'moderator' | 'banned';
  joined_at: string;
}

export interface CreateChannelPayload {
  name: string;
  description?: string;
  type?: ChannelType;
  emoji?: string;
  avatar_url?: string;
  is_private?: boolean;
  password?: string;
}

export interface UpdateChannelPayload extends Partial<CreateChannelPayload> {
  remove_password?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

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

  async join(id: string): Promise<{ joined: boolean; pending?: boolean; approval_required?: boolean }> {
    const res = await apiClient.post<{ joined: boolean; pending?: boolean; approval_required?: boolean }>(Endpoints.communities.join(id));
    return res.data;
  },

  async cancelJoinRequest(id: string): Promise<{ cancelled: boolean }> {
    const res = await apiClient.delete<{ cancelled: boolean }>(Endpoints.communities.join(id));
    return res.data;
  },

  async getJoinRequests(id: string): Promise<JoinRequest[]> {
    const res = await apiClient.get<JoinRequest[]>(Endpoints.communities.joinRequests(id));
    return res.data;
  },

  async approveJoinRequest(communityId: string, requestId: string): Promise<{ approved: boolean }> {
    const res = await apiClient.post<{ approved: boolean }>(
      Endpoints.communities.approveJoinRequest(communityId, requestId),
    );
    return res.data;
  },

  async rejectJoinRequest(communityId: string, requestId: string, reason?: string): Promise<{ rejected: boolean }> {
    const res = await apiClient.post<{ rejected: boolean }>(
      Endpoints.communities.rejectJoinRequest(communityId, requestId),
      { reason: reason ?? null },
    );
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

  async verify(id: string): Promise<CommunityData> {
    const res = await apiClient.post<CommunityData>(`/api/v1/communities/${id}/verify`);
    return res.data;
  },

  async unverify(id: string): Promise<CommunityData> {
    const res = await apiClient.delete<CommunityData>(`/api/v1/communities/${id}/verify`);
    return res.data;
  },

  async requestVerification(id: string, reason?: string): Promise<VerificationRequest> {
    const res = await apiClient.post<VerificationRequest>(
      `/api/v1/communities/${id}/verification-request`,
      { reason: reason ?? null },
    );
    return res.data;
  },

  async getVerificationRequest(id: string): Promise<VerificationRequest | null> {
    try {
      const res = await apiClient.get<VerificationRequest | null>(
        `/api/v1/communities/${id}/verification-request`,
      );
      return res.data;
    } catch { return null; }
  },

  async getMemberProfile(communityId: string, userId: string): Promise<CommunityMemberProfile> {
    const res = await apiClient.get<CommunityMemberProfile>(
      Endpoints.communities.memberProfile(communityId, userId),
    );
    return res.data;
  },

  async getLeaderboard(
    id: string,
    period: 'week' | 'month' | 'alltime' = 'week',
    limit = 50,
  ): Promise<LeaderboardEntry[]> {
    const res = await apiClient.get<LeaderboardEntry[]>(
      `${Endpoints.communities.leaderboard(id)}?period=${period}&limit=${limit}`,
    );
    return res.data;
  },

  async getMyLeaderboardStats(id: string, period: 'week' | 'month' | 'alltime' = 'week'): Promise<LeaderboardMyStats> {
    const res = await apiClient.get<LeaderboardMyStats>(
      `${Endpoints.communities.myLeaderboard(id)}?period=${period}`,
    );
    return res.data;
  },

  async getStats(id: string, period: '7j' | '30j' | '90j' = '7j'): Promise<CommunityStats> {
    const res = await apiClient.get<CommunityStats>(
      `${Endpoints.communities.stats(id)}?period=${period}`,
    );
    return res.data;
  },

  async getEvents(id: string, filter?: string): Promise<CommunityEvent[]> {
    let url = Endpoints.communities.events(id);
    if (filter) url += `?filter=${filter}`;
    const res = await apiClient.get<CommunityEvent[]>(url);
    return res.data;
  },

  async rsvpEvent(
    communityId: string,
    eventId: string,
    status: 'going' | 'maybe' | 'not_going',
  ): Promise<CommunityEvent> {
    const res = await apiClient.post<CommunityEvent>(
      `${Endpoints.communities.eventRsvp(communityId, eventId)}?status=${status}`,
    );
    return res.data;
  },

  async createEvent(communityId: string, data: {
    title: string;
    description?: string;
    location?: string;
    cover_url?: string;
    color?: string;
    is_online?: boolean;
    starts_at: string;
    ends_at?: string;
  }): Promise<CommunityEvent> {
    const res = await apiClient.post<CommunityEvent>(
      Endpoints.communities.events(communityId),
      data,
    );
    return res.data;
  },

  async updateEvent(communityId: string, eventId: string, data: {
    title: string;
    description?: string;
    location?: string;
    cover_url?: string;
    color?: string;
    is_online?: boolean;
    starts_at: string;
    ends_at?: string;
  }): Promise<CommunityEvent> {
    const res = await apiClient.patch<CommunityEvent>(
      `${Endpoints.communities.events(communityId)}/${eventId}`,
      data,
    );
    return res.data;
  },

  async cancelEvent(communityId: string, eventId: string): Promise<CommunityEvent> {
    const res = await apiClient.post<CommunityEvent>(
      `${Endpoints.communities.events(communityId)}/${eventId}/cancel`,
    );
    return res.data;
  },

  async deleteEvent(communityId: string, eventId: string): Promise<void> {
    await apiClient.delete(`${Endpoints.communities.events(communityId)}/${eventId}`);
  },

  async listVerificationRequests(status?: string, page = 1): Promise<VerificationRequest[]> {
    let url = `/api/v1/communities/admin/verification-requests?page=${page}&limit=20`;
    if (status) url += `&status=${status}`;
    const res = await apiClient.get<VerificationRequest[]>(url);
    return res.data;
  },

  async approveVerification(requestId: string, note?: string): Promise<VerificationRequest> {
    const res = await apiClient.post<VerificationRequest>(
      `/api/v1/communities/admin/verification-requests/${requestId}/approve`,
      { note: note ?? null },
    );
    return res.data;
  },

  async getMemberCreatorStats(communityId: string, userId: string): Promise<MemberCreatorStats> {
    const res = await apiClient.get<MemberCreatorStats>(
      `/api/v1/communities/${communityId}/members/${userId}/creator-stats`,
    );
    return res.data;
  },

  async rejectVerification(requestId: string, note?: string): Promise<VerificationRequest> {
    const res = await apiClient.post<VerificationRequest>(
      `/api/v1/communities/admin/verification-requests/${requestId}/reject`,
      { note: note ?? null },
    );
    return res.data;
  },

  // ── Canaux ──────────────────────────────────────────────────────────────────

  async getChannels(communityId: string): Promise<CommunityChannel[]> {
    const res = await apiClient.get<CommunityChannel[]>(Endpoints.communities.channels(communityId));
    return res.data;
  },

  async createChannel(communityId: string, data: CreateChannelPayload): Promise<CommunityChannel> {
    const res = await apiClient.post<CommunityChannel>(Endpoints.communities.channels(communityId), data);
    return res.data;
  },

  async updateChannel(communityId: string, channelId: string, data: UpdateChannelPayload): Promise<CommunityChannel> {
    const res = await apiClient.patch<CommunityChannel>(Endpoints.communities.channel(communityId, channelId), data);
    return res.data;
  },

  async deleteChannel(communityId: string, channelId: string): Promise<void> {
    await apiClient.delete(Endpoints.communities.channel(communityId, channelId));
  },

  async joinChannel(communityId: string, channelId: string, password?: string): Promise<CommunityChannelMember> {
    const res = await apiClient.post<CommunityChannelMember>(
      `${Endpoints.communities.channelMembers(communityId, channelId)}/join`,
      { password: password ?? null },
    );
    return res.data;
  },

  async getChannelMembers(communityId: string, channelId: string): Promise<CommunityChannelMember[]> {
    const res = await apiClient.get<CommunityChannelMember[]>(Endpoints.communities.channelMembers(communityId, channelId));
    return res.data;
  },

  async addChannelMember(communityId: string, channelId: string, userId: string): Promise<CommunityChannelMember> {
    const res = await apiClient.post<CommunityChannelMember>(
      Endpoints.communities.channelMembers(communityId, channelId),
      { user_id: userId },
    );
    return res.data;
  },

  async removeChannelMember(communityId: string, channelId: string, userId: string): Promise<void> {
    await apiClient.delete(`${Endpoints.communities.channelMembers(communityId, channelId)}/${userId}`);
  },

  async updateChannelMemberRole(communityId: string, channelId: string, userId: string, role: 'member' | 'moderator' | 'banned'): Promise<CommunityChannelMember> {
    const res = await apiClient.patch<CommunityChannelMember>(
      `${Endpoints.communities.channelMembers(communityId, channelId)}/${userId}`,
      { role },
    );
    return res.data;
  },

  async getChannelMessages(communityId: string, channelId: string, page = 1, limit = 30): Promise<CommunityMessageData[]> {
    const res = await apiClient.get<CommunityMessageData[]>(
      `${Endpoints.communities.channelMessages(communityId, channelId)}?page=${page}&limit=${limit}`,
    );
    return res.data;
  },

  async sendChannelMessage(communityId: string, channelId: string, content: string, message_type = 'text', media_urls?: string[], reply_to_id?: string): Promise<CommunityMessageData> {
    const res = await apiClient.post<CommunityMessageData>(
      Endpoints.communities.channelMessages(communityId, channelId),
      { content: content || null, message_type, media_urls: media_urls ?? [], reply_to_id: reply_to_id ?? null },
    );
    return res.data;
  },

  async editChannelMessage(communityId: string, channelId: string, messageId: string, content: string): Promise<CommunityMessageData> {
    const res = await apiClient.patch<CommunityMessageData>(
      Endpoints.communities.channelMessage(communityId, channelId, messageId),
      { content },
    );
    return res.data;
  },

  async deleteChannelMessage(communityId: string, channelId: string, messageId: string): Promise<void> {
    await apiClient.delete(Endpoints.communities.channelMessage(communityId, channelId, messageId));
  },
};
