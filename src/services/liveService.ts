import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export type MonetizationType = 'gogold' | 'gift';

export interface LiveStream {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  status: 'active' | 'ended';
  room_name?: string | null;
  current_viewers: number;
  peak_viewers: number;
  is_featured: boolean;
  is_private: boolean;
  started_at: string;
  ended_at?: string | null;
  // Monétisation accès au live (rejoindre)
  is_monetized?: boolean;
  monetization_type?: MonetizationType | null;
  monetization_gogold?: number | null;
  monetization_gift_id?: string | null;
  monetization_gift_name?: string | null;
  monetization_gift_emoji?: string | null;
  // Monétisation montée sur scène (hand-raise)
  stage_monetized?: boolean;
  stage_type?: MonetizationType | null;
  stage_gogold?: number | null;
  stage_gift_id?: string | null;
  stage_gift_name?: string | null;
  stage_gift_emoji?: string | null;
  user?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

export interface LiveToken {
  token: string;
  livekit_url: string;
  room_name: string;
}

export interface LiveStatus {
  id: string;
  status: 'active' | 'ended';
  current_viewers: number;
}

async function getLives(): Promise<LiveStream[]> {
  const r = await apiClient.get<LiveStream[]>(Endpoints.lives.list);
  return Array.isArray(r.data) ? r.data : [];
}

async function getById(id: string): Promise<LiveStream> {
  const r = await apiClient.get<LiveStream>(Endpoints.lives.byId(id));
  return r.data;
}

async function startLive(payload: {
  title: string;
  description?: string;
  is_private?: boolean;
  is_monetized?: boolean;
  monetization_type?: MonetizationType;
  monetization_gogold?: number;
  monetization_gift_id?: string;
}): Promise<{ live: LiveStream; token: string; livekit_url: string }> {
  const r = await apiClient.post<{ live: LiveStream; token: string; livekit_url: string }>(Endpoints.lives.start, payload);
  return r.data;
}

async function sendGiftForAccess(liveId: string, giftId: string): Promise<{ access_granted: boolean }> {
  const r = await apiClient.post<{ access_granted: boolean }>(`/api/v1/lives/${liveId}/access/gift`, { gift_id: giftId });
  return r.data;
}

async function payGoGoldForAccess(liveId: string): Promise<{ access_granted: boolean }> {
  const r = await apiClient.post<{ access_granted: boolean }>(`/api/v1/lives/${liveId}/access/gogold`);
  return r.data;
}

async function checkAccess(liveId: string): Promise<{ has_access: boolean }> {
  const r = await apiClient.get<{ has_access: boolean }>(`/api/v1/lives/${liveId}/access`);
  return r.data;
}

async function blockUserFromLives(userId: string): Promise<void> {
  await apiClient.post(Endpoints.lives.blockUser(userId));
}

async function unblockUserFromLives(userId: string): Promise<void> {
  await apiClient.delete(Endpoints.lives.unblockUser(userId));
}

async function stopLive(id: string): Promise<void> {
  await apiClient.post(Endpoints.lives.stop(id));
}

async function getToken(id: string): Promise<LiveToken> {
  const r = await apiClient.get<LiveToken>(Endpoints.lives.token(id));
  return r.data;
}

async function getStatus(id: string): Promise<LiveStatus> {
  const r = await apiClient.get<LiveStatus>(Endpoints.lives.status(id));
  return r.data;
}

async function stopAllMine(): Promise<void> {
  await apiClient.post(`/api/v1/lives/stop_all_mine`);
}

async function invite(liveId: string, identity: string): Promise<void> {
  await apiClient.post(Endpoints.lives.invite(liveId, identity));
}

async function demote(liveId: string, identity: string): Promise<void> {
  await apiClient.post(Endpoints.lives.demote(liveId, identity));
}

async function ban(liveId: string, identity: string): Promise<void> {
  await apiClient.post(Endpoints.lives.ban(liveId, identity));
}

async function globalBan(liveId: string, identity: string): Promise<void> {
  await apiClient.post(Endpoints.lives.globalBan(liveId, identity));
}

async function getLiveCost(): Promise<{ cost_gogold: number; balance: number; sufficient: boolean }> {
  const r = await apiClient.get<{ cost_gogold: number; balance: number; sufficient: boolean }>(Endpoints.lives.cost);
  return r.data;
}

export const liveService = {
  getLives, getById, startLive, stopLive, getToken, getStatus, stopAllMine,
  blockUserFromLives, unblockUserFromLives,
  invite, demote, ban, globalBan, getLiveCost,
  sendGiftForAccess, payGoGoldForAccess, checkAccess,
};
