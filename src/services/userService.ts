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

  async getUserReels(userId: string, page?: number, limit?: number) {
    const params: Record<string, string> = {};
    if (page)  params.page  = String(page);
    if (limit) params.limit = String(limit);
    const query = Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : '';
    const res = await apiClient.get(`${Endpoints.users.userReels(userId)}${query}`);
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

  async getFollowers(userId: string, page = 1, limit = 30): Promise<UserPublic[]> {
    const res = await apiClient.get<UserPublic[]>(`${Endpoints.users.followers(userId)}?page=${page}&limit=${limit}`);
    return res.data;
  },

  async getFollowing(userId: string, page = 1, limit = 30): Promise<UserPublic[]> {
    const res = await apiClient.get<UserPublic[]>(`${Endpoints.users.following(userId)}?page=${page}&limit=${limit}`);
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

  async deleteMyAccount(reason?: string): Promise<void> {
    const query = reason ? `?${new URLSearchParams({ reason }).toString()}` : '';
    await apiClient.delete(`${Endpoints.users.me}${query}`);
  },

  async deactivateMyAccount(): Promise<void> {
    const me = await userService.getMe();
    await apiClient.post(Endpoints.users.deactivate(String(me.id)));
  },

  async getSuggestions(limit = 10, offset = 0): Promise<UserPublic[]> {
    const res = await apiClient.get<UserPublic[]>(`${Endpoints.users.suggestions}?limit=${limit}&offset=${offset}`);
    return res.data;
  },

  /** Envoie les hashs SHA-256 du carnet d'adresses — jamais les contacts en clair.
   *  Remplace l'ensemble précédent (sync complet, pas incrémental). */
  async syncContacts(hashes: string[]): Promise<void> {
    await apiClient.post(Endpoints.users.contactsSync, { hashes });
  },

  /** Met à jour ma position GPS — utilisée uniquement pour pondérer les
   *  suggestions "près de vous", jamais exposée telle quelle aux autres users. */
  async updateLocation(latitude: number, longitude: number): Promise<void> {
    await apiClient.put(Endpoints.users.updateLocation, { latitude, longitude });
  },

  async getCallEligibility(userId: string): Promise<{ can_call: boolean; silent: boolean }> {
    const res = await apiClient.get<{ can_call: boolean; silent: boolean }>(Endpoints.users.callEligibility(userId));
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
  async blockUser(userId: string): Promise<void> {
    await apiClient.post(Endpoints.users.block(userId));
  },

  async unblockUser(userId: string): Promise<void> {
    await apiClient.delete(Endpoints.users.block(userId));
  },

  async getBlockedUsers(): Promise<UserPublic[]> {
    const res = await apiClient.get<UserPublic[]>(Endpoints.users.blocked);
    return res.data;
  },
};

export type CallPrivacy = 'everyone' | 'followers' | 'none';

export interface PrivacySettings {
  privacy_profile_public:  boolean;
  privacy_show_activity:   boolean;
  privacy_show_location:   boolean;
  privacy_allow_messages:  boolean;
  privacy_show_online:     boolean;
  privacy_show_phone:      boolean;
  privacy_show_birthday:   boolean;
  privacy_allow_comments:  boolean;
  privacy_read_receipts:   boolean;
  privacy_show_typing:     boolean;
  call_privacy:            CallPrivacy;
  call_e2e_encryption:     boolean;
  call_silence_unknown:    boolean;
}
