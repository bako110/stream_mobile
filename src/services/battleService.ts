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
  /** Nombre de battles remportés par chaque host, tout historique confondu — présent
   * uniquement sur la réponse de GET /battles/{id} (pas sur ActiveBattle ni les WS). */
  win_count_a?:     number;
  win_count_b?:     number;
}

export interface EligibleCreator {
  live_id:           string;
  host_id:           string;
  host_name:         string | null;
  host_avatar:       string | null;
  title:             string;
  current_viewers:   number;
}

export interface EligibleCreatorsPage {
  items:    EligibleCreator[];
  page:     number;
  has_more: boolean;
}

export interface ActiveBattle extends Battle {
  host_a_name:       string | null;
  host_a_avatar:     string | null;
  host_a_verified:   boolean;
  host_b_name:       string | null;
  host_b_avatar:     string | null;
  host_b_verified:   boolean;
  viewer_count:      number;
  gifts_count:       number;
  supporters_count:  number;
}

export interface ActiveBattlesPage {
  items:    ActiveBattle[];
  page:     number;
  has_more: boolean;
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

export interface SideDonor extends SupporterBrief {
  gogold_spent:    number;
  gifts_count:     number;
  last_gift_name:  string | null;
  last_gift_emoji: string | null;
}

export interface BattleRanking {
  top_donor:    (SupporterBrief & { gogold_spent: number }) | null;
  top_10:       (SupporterBrief & { gogold_spent: number })[];
  most_active:  (SupporterBrief & { actions_count: number })[];
  surprise:     SupporterBrief | null;
  /** Top 3 supporters de CHAQUE camp séparément (pas les deux hosts confondus comme top_10)
   * — alimente les cartes "X a envoyé Y ×N" sous chaque moitié vidéo du battle. */
  top_donors_a: SideDonor[];
  top_donors_b: SideDonor[];
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

async function get(battleId: string): Promise<Battle> {
  const r = await apiClient.get<Battle>(Endpoints.battles.byId(battleId));
  return r.data;
}

async function listEligible(liveId: string, page = 1, limit = 20): Promise<EligibleCreatorsPage> {
  const r = await apiClient.get<EligibleCreatorsPage>(Endpoints.battles.eligible(liveId, page, limit));
  return r.data ?? { items: [], page, has_more: false };
}

async function getActiveForLive(liveId: string): Promise<Battle | null> {
  const r = await apiClient.get<Battle | null>(Endpoints.battles.activeForLive(liveId));
  return r.data ?? null;
}

async function listActive(page = 1, limit = 20): Promise<ActiveBattlesPage> {
  const r = await apiClient.get<ActiveBattlesPage>(Endpoints.battles.active(page, limit));
  return r.data ?? { items: [], page, has_more: false };
}

async function invite(liveAId: string, liveBId: string, durationSeconds = 180): Promise<Battle> {
  const r = await apiClient.post<Battle>(Endpoints.battles.invite, {
    live_a_id: liveAId, live_b_id: liveBId, duration_seconds: durationSeconds,
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

async function end(battleId: string, forfeit = false): Promise<Battle> {
  const r = await apiClient.post<Battle>(Endpoints.battles.end(battleId), { forfeit });
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
  get,
  listEligible,
  getActiveForLive,
  listActive,
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
