import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export type TournamentStatus = 'registration' | 'ongoing' | 'completed' | 'cancelled';
export type TournamentType = 'single_elimination' | 'double_elimination' | 'group_stage' | 'league';
export type TournamentRegistrationMode = 'open' | 'approval' | 'invite_only';
export type TournamentRound =
  | 'qualifications' | 'round_of_32' | 'round_of_16' | 'quarterfinal' | 'semifinal' | 'final'
  | 'group_stage' | 'losers_round' | 'grand_final';
export type TournamentMatchStatus = 'pending' | 'ready' | 'live' | 'completed' | 'bye';

export interface Tournament {
  id:                      string;
  name:                    string;
  description:             string | null;
  format:                  8 | 16 | 32 | 64;
  tournament_type:         TournamentType;
  status:                  TournamentStatus;
  image_url:               string | null;
  prize:                   string | null;
  spectator_count:         number;
  created_by:              string;
  is_private:              boolean;
  has_password:            boolean;
  registration_mode:       TournamentRegistrationMode;
  invite_code:             string | null;  // uniquement renvoyé à l'organisateur, à la création
  allowed_countries:       string[] | null;
  allowed_languages:       string[] | null;
  timezone:                string | null;
  registration_opens_at:   string | null;
  registration_closes_at:  string | null;
  scheduled_start_at:      string | null;
  rules:                   string | null;
  sponsor_name:            string | null;
  sponsor_logo_url:        string | null;
  entry_fee_gogold:        number;
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

export interface ActiveTournament extends OpenTournament {
  organizer_name:   string | null;
  organizer_avatar: string | null;
}

export interface ActiveTournamentsPage {
  items:    ActiveTournament[];
  page:     number;
  has_more: boolean;
}

export interface TournamentParticipant {
  id:               string;
  user_id:          string;
  display_name:     string | null;
  avatar_url:       string | null;
  seed:             number | null;
  group_number:     number | null;
  points:           number;
  wins:             number;
  draws:            number;
  losses:           number;
  score_for:        number;
  score_against:    number;
  eliminated_round: TournamentRound | null;
}

export interface PendingParticipant {
  user_id:      string;
  display_name: string | null;
  avatar_url:   string | null;
  joined_at:    string | null;
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

export interface CreateTournamentPayload {
  name: string;
  format: 8 | 16 | 32 | 64;
  battleDurationSeconds?: number;
  imageUrl?: string;
  prize?: string;
  tournamentType?: TournamentType;
  description?: string;
  isPrivate?: boolean;
  password?: string;
  registrationMode?: TournamentRegistrationMode;
  allowedCountries?: string[];
  allowedLanguages?: string[];
  timezone?: string;
  registrationOpensAt?: string;   // ISO 8601
  registrationClosesAt?: string;  // ISO 8601
  scheduledStartAt?: string;      // ISO 8601
  rules?: string;
  sponsorName?: string;
  sponsorLogoUrl?: string;
  entryFeeGogold?: number;
}

async function listOpen(): Promise<OpenTournament[]> {
  const r = await apiClient.get<OpenTournament[]>(Endpoints.tournaments.open);
  return r.data ?? [];
}

async function listActive(page = 1, limit = 20): Promise<ActiveTournamentsPage> {
  const r = await apiClient.get<ActiveTournamentsPage>(Endpoints.tournaments.active(page, limit));
  return r.data ?? { items: [], page, has_more: false };
}

async function create(payload: CreateTournamentPayload): Promise<Tournament> {
  const r = await apiClient.post<Tournament>(Endpoints.tournaments.create, {
    name: payload.name,
    format: payload.format,
    battle_duration_seconds: payload.battleDurationSeconds ?? 180,
    image_url: payload.imageUrl,
    prize: payload.prize,
    tournament_type: payload.tournamentType ?? 'single_elimination',
    description: payload.description,
    is_private: payload.isPrivate ?? false,
    password: payload.password,
    registration_mode: payload.registrationMode ?? 'open',
    allowed_countries: payload.allowedCountries,
    allowed_languages: payload.allowedLanguages,
    timezone: payload.timezone,
    registration_opens_at: payload.registrationOpensAt,
    registration_closes_at: payload.registrationClosesAt,
    scheduled_start_at: payload.scheduledStartAt,
    rules: payload.rules,
    sponsor_name: payload.sponsorName,
    sponsor_logo_url: payload.sponsorLogoUrl,
    entry_fee_gogold: payload.entryFeeGogold ?? 0,
  });
  return r.data;
}

async function join(tournamentId: string, password?: string, inviteCode?: string): Promise<{ joined: boolean; status?: string }> {
  const r = await apiClient.post<{ joined: boolean; status?: string }>(Endpoints.tournaments.join(tournamentId), {
    password, invite_code: inviteCode,
  });
  return r.data;
}

async function leave(tournamentId: string): Promise<void> {
  await apiClient.delete(Endpoints.tournaments.leave(tournamentId));
}

async function listPendingParticipants(tournamentId: string): Promise<PendingParticipant[]> {
  const r = await apiClient.get<PendingParticipant[]>(Endpoints.tournaments.pending(tournamentId));
  return r.data ?? [];
}

async function approveParticipant(tournamentId: string, userId: string): Promise<void> {
  await apiClient.post(Endpoints.tournaments.approveParticipant(tournamentId, userId));
}

async function rejectParticipant(tournamentId: string, userId: string): Promise<void> {
  await apiClient.post(Endpoints.tournaments.rejectParticipant(tournamentId, userId));
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
  listActive,
  create,
  join,
  leave,
  listPendingParticipants,
  approveParticipant,
  rejectParticipant,
  generateBracket,
  getBracket,
  cancel,
  markMatchReady,
};
