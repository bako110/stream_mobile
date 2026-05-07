import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

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
  started_at: string;
  ended_at?: string | null;
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

async function startLive(payload: { title: string; description?: string }): Promise<{ live: LiveStream; token: string; livekit_url: string }> {
  const r = await apiClient.post<{ live: LiveStream; token: string; livekit_url: string }>(Endpoints.lives.start, payload);
  return r.data;
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

export const liveService = { getLives, getById, startLive, stopLive, getToken, getStatus };
