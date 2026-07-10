import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export type TournamentStatus = 'registration' | 'ongoing' | 'completed' | 'cancelled';
export type TournamentRound =
  | 'qualifications' | 'round_of_32' | 'round_of_16' | 'quarterfinal' | 'semifinal' | 'final';
export type TournamentMatchStatus = 'pending' | 'ready' | 'live' | 'completed' | 'bye';

export interface Tournament {
  id:                      string;
  name:                    string;
  format:                  8 | 16 | 32 | 64;
  status:                  TournamentStatus;
  created_by:              string;
  registration_closes_at:  string | null;
  battle_duration_seconds: number;
  winner_id:               string | null;
  created_at:              string | null;
  started_at:              string | null;
  ended_at:                string | null;
}

export interface OpenTournament extends Tournament {
  participants_count: number;
  max_participants:   number;
}

export interface TournamentParticipant {
  id:               string;
  user_id:          string;
  display_name:     string | null;
  avatar_url:       string | null;
  seed:             number | null;
  eliminated_round: TournamentRound | null;
}

export interface TournamentMatch {
  id:                    string;
  tournament_id:         string;
  round:                 TournamentRound;
  position:              number;
  participant_a_id:      string | null;
  participant_b_id:      string | null;
  a_ready:               boolean;
  b_ready:               boolean;
  battle_id:             string | null;
  winner_participant_id: string | null;
  status:                TournamentMatchStatus;
}

export interface TournamentBracket {
  tournament:   Tournament;
  participants: TournamentParticipant[];
  matches:      TournamentMatch[];
}

async function listOpen(): Promise<OpenTournament[]> {
  const r = await apiClient.get<OpenTournament[]>(Endpoints.tournaments.open);
  return r.data ?? [];
}

async function create(
  name: string, format: 8 | 16 | 32 | 64, battleDurationSeconds = 180,
): Promise<Tournament> {
  const r = await apiClient.post<Tournament>(Endpoints.tournaments.create, {
    name, format, battle_duration_seconds: battleDurationSeconds,
  });
  return r.data;
}

async function join(tournamentId: string): Promise<{ joined: boolean }> {
  const r = await apiClient.post<{ joined: boolean }>(Endpoints.tournaments.join(tournamentId));
  return r.data;
}

async function leave(tournamentId: string): Promise<void> {
  await apiClient.delete(Endpoints.tournaments.leave(tournamentId));
}

async function generateBracket(tournamentId: string): Promise<Tournament> {
  const r = await apiClient.post<Tournament>(Endpoints.tournaments.generateBracket(tournamentId));
  return r.data;
}

async function getBracket(tournamentId: string): Promise<TournamentBracket> {
  const r = await apiClient.get<TournamentBracket>(Endpoints.tournaments.bracket(tournamentId));
  return r.data;
}

async function cancel(tournamentId: string): Promise<Tournament> {
  const r = await apiClient.post<Tournament>(Endpoints.tournaments.cancel(tournamentId));
  return r.data;
}

async function markMatchReady(matchId: string, liveId: string): Promise<TournamentMatch> {
  const r = await apiClient.post<TournamentMatch>(Endpoints.tournaments.matchReady(matchId), {
    live_id: liveId,
  });
  return r.data;
}

export const tournamentService = {
  listOpen,
  create,
  join,
  leave,
  generateBracket,
  getBracket,
  cancel,
  markMatchReady,
};
