import { apiClient, Endpoints } from '../api';
import type { User, UserUpdate, WatchHistoryItem, UserPublicProfile, UserPublic } from '../types';
import { invalidateUserCache } from './authService';

export const userService = {
  async getMe(): Promise<User> {
    const res = await apiClient.get<User>(Endpoints.users.me);
    return res.data;
  },

  async updateMe(data: UserUpdate): Promise<User> {
    const res = await apiClient.put<User>(Endpoints.users.updateMe, data);
    invalidateUserCache();
    return res.data;
  },

  async getWatchHistory(): Promise<WatchHistoryItem[]> {
    const res = await apiClient.get<WatchHistoryItem[]>(Endpoints.users.watchHistory);
    return res.data;
  },

  async getPublicProfile(userId: string): Promise<UserPublicProfile> {
    const res = await apiClient.get<UserPublicProfile>(Endpoints.users.publicProfile(userId));
    return res.data;
  },

  async getUserReels(userId: string) {
    const res = await apiClient.get(Endpoints.users.userReels(userId));
    return res.data;
  },

  async getUserEvents(userId: string) {
    const res = await apiClient.get(Endpoints.users.userEvents(userId));
    return Array.isArray(res.data) ? res.data : [];
  },

  async getUserConcerts(userId: string) {
    const res = await apiClient.get(Endpoints.users.userConcerts(userId));
    return Array.isArray(res.data) ? res.data : [];
  },

  async follow(userId: string): Promise<{ is_following: boolean }> {
    const res = await apiClient.post<{ is_following: boolean }>(Endpoints.users.follow(userId));
    return res.data;
  },

  async unfollow(userId: string): Promise<{ is_following: boolean }> {
    const res = await apiClient.delete<{ is_following: boolean }>(Endpoints.users.follow(userId));
    return res.data;
  },

  async getFollowers(userId: string): Promise<UserPublic[]> {
    const res = await apiClient.get<UserPublic[]>(Endpoints.users.followers(userId));
    return res.data;
  },

  async getFollowing(userId: string): Promise<UserPublic[]> {
    const res = await apiClient.get<UserPublic[]>(Endpoints.users.following(userId));
    return res.data;
  },

  async block(userId: string): Promise<{ blocked: boolean }> {
    const res = await apiClient.post<{ blocked: boolean }>(Endpoints.users.block(userId));
    return res.data;
  },

  async unblock(userId: string): Promise<{ blocked: boolean }> {
    const res = await apiClient.delete<{ blocked: boolean }>(Endpoints.users.block(userId));
    return res.data;
  },

  async getBlocked(): Promise<UserPublic[]> {
    const res = await apiClient.get<UserPublic[]>(Endpoints.users.blocked);
    return res.data;
  },

  async deleteMyAccount(): Promise<void> {
    await apiClient.delete(Endpoints.users.me);
  },

  async deactivateMyAccount(): Promise<void> {
    const me = await userService.getMe();
    await apiClient.post(Endpoints.users.deactivate(String(me.id)));
  },

  async getSuggestions(limit = 10, offset = 0): Promise<UserPublic[]> {
    const res = await apiClient.get<UserPublic[]>(`${Endpoints.users.suggestions}?limit=${limit}&offset=${offset}`);
    return res.data;
  },

  async getPrivacy(): Promise<PrivacySettings> {
    const res = await apiClient.get<PrivacySettings>(Endpoints.users.privacy);
    return res.data;
  },

  async updatePrivacy(data: PrivacySettings): Promise<PrivacySettings> {
    const res = await apiClient.put<PrivacySettings>(Endpoints.users.privacy, data);
    return res.data;
  },
};

export interface PrivacySettings {
  privacy_profile_public:  boolean;
  privacy_show_activity:   boolean;
  privacy_show_location:   boolean;
  privacy_allow_messages:  boolean;
  privacy_show_online:     boolean;
  privacy_show_phone:      boolean;
  privacy_show_birthday:   boolean;
}
