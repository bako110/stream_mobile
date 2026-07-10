import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export type BattleStatus =
  | 'pending_invite' | 'declined' | 'cancelled' | 'expired' | 'active' | 'ended';

export interface Battle {
  id:               string;
  live_a_id:        string;
  live_b_id:        string;
  host_a_id:        string;
  host_b_id:        string;
  status:           BattleStatus;
  room_name:        string | null;
  duration_seconds: number;
  score_a:          number;
  score_b:          number;
  winner_id:        string | null;
  invited_at:       string | null;
  responded_at:     string | null;
  started_at:       string | null;
  ended_at:         string | null;
}

export interface EligibleCreator {
  live_id:           string;
  host_id:           string;
  host_name:         string | null;
  host_avatar:       string | null;
  title:             string;
  current_viewers:   number;
}

export interface BattleToken {
  token:     string;
  ws_url:    string;
  room_name: string;
  is_host:   boolean;
}

export interface SupporterBrief {
  id:             string;
  display_name:   string | null;
  avatar_url:     string | null;
}

export interface BattleRanking {
  top_donor:   (SupporterBrief & { gogold_spent: number }) | null;
  top_10:      (SupporterBrief & { gogold_spent: number })[];
  most_active: (SupporterBrief & { actions_count: number })[];
  surprise:    SupporterBrief | null;
}

export interface BattleGoal {
  id:               string;
  battle_id:        string;
  mode:             'community_goal' | 'boss';
  title:            string;
  target_amount:    number;
  current_amount:   number;
  progress_pct:     number;
  duration_seconds: number;
  status:           'active' | 'succeeded' | 'failed';
  reward_payload:   Record<string, unknown> | null;
  started_at:       string | null;
  ended_at:         string | null;
}

async function listEligible(liveId: string): Promise<EligibleCreator[]> {
  const r = await apiClient.get<EligibleCreator[]>(Endpoints.battles.eligible(liveId));
  return r.data ?? [];
}

async function invite(liveAId: string, liveBId: string): Promise<Battle> {
  const r = await apiClient.post<Battle>(Endpoints.battles.invite, {
    live_a_id: liveAId, live_b_id: liveBId,
  });
  return r.data;
}

async function respond(battleId: string, accept: boolean): Promise<Battle> {
  const r = await apiClient.patch<Battle>(Endpoints.battles.respond(battleId), { accept });
  return r.data;
}

async function cancel(battleId: string): Promise<Battle> {
  const r = await apiClient.post<Battle>(Endpoints.battles.cancel(battleId));
  return r.data;
}

async function getToken(battleId: string): Promise<BattleToken> {
  const r = await apiClient.get<BattleToken>(Endpoints.battles.token(battleId));
  return r.data;
}

async function react(battleId: string, side: 'a' | 'b'): Promise<void> {
  await apiClient.post(Endpoints.battles.react(battleId), { side });
}

async function end(battleId: string): Promise<Battle> {
  const r = await apiClient.post<Battle>(Endpoints.battles.end(battleId));
  return r.data;
}

async function getRanking(battleId: string): Promise<BattleRanking> {
  const r = await apiClient.get<BattleRanking>(Endpoints.battles.ranking(battleId));
  return r.data;
}

async function createGoal(
  battleId: string,
  payload: { mode: 'community_goal' | 'boss'; title: string; target_amount: number; duration_seconds?: number },
): Promise<BattleGoal> {
  const r = await apiClient.post<BattleGoal>(Endpoints.battles.createGoal(battleId), payload);
  return r.data;
}

async function getActiveGoal(battleId: string): Promise<BattleGoal | null> {
  const r = await apiClient.get<BattleGoal | null>(Endpoints.battles.activeGoal(battleId));
  return r.data ?? null;
}

export const battleService = {
  listEligible,
  invite,
  respond,
  cancel,
  getToken,
  react,
  end,
  getRanking,
  createGoal,
  getActiveGoal,
};
