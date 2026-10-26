import { apiClient, Endpoints } from '../api';
import type { Concert, StreamToken, StreamStatus, TicketsSold, UpcomingLiveMixedPage, ConcertCreate, ConcertUpdate } from '../types';
import { DEFAULT_PAGE_LIMIT } from '../utils/constants';

export const concertService = {
  async list(params?: { page?: number; limit?: number; genre?: string; lat?: number; lon?: number; radius_km?: number }): Promise<Concert[]> {
    const query = new URLSearchParams({
      page:  String(params?.page  ?? 1),
      limit: String(params?.limit ?? DEFAULT_PAGE_LIMIT),
      ...(params?.genre   ? { genre: params.genre }       : {}),
      ...(params?.lat != null ? { lat: String(params.lat) } : {}),
      ...(params?.lon != null ? { lon: String(params.lon) } : {}),
      ...(params?.radius_km != null ? { radius_km: String(params.radius_km) } : {}),
    }).toString();
    const res = await apiClient.get<Concert[]>(
      `${Endpoints.concerts.list}?${query}`,
    );
    return Array.isArray(res.data) ? res.data : [];
  },

  async getLive(): Promise<Concert[]> {
    const res = await apiClient.get<Concert[]>(Endpoints.concerts.live);
    return res.data;
  },

  async getUpcoming(): Promise<Concert[]> {
    const res = await apiClient.get<Concert[]>(Endpoints.concerts.upcoming);
    return res.data;
  },

  /** Concerts + événements à venir, fusionnés et triés par date, paginés
   * côté serveur — alimente le scroll infini de "Prochainement". */
  async getUpcomingLiveMixed(page: number, limit = 20): Promise<UpcomingLiveMixedPage> {
    const res = await apiClient.get<UpcomingLiveMixedPage>(Endpoints.concerts.upcomingLiveMixed(page, limit));
    return res.data ?? { items: [], page, has_more: false };
  },

  async getById(id: string): Promise<Concert> {
    const res = await apiClient.get<Concert>(Endpoints.concerts.byId(id));
    return res.data;
  },

  /** Capture analytics — best-effort, ne bloque jamais l'affichage si ça échoue. */
  async recordView(id: string): Promise<void> {
    try { await apiClient.post(Endpoints.concerts.view(id)); } catch { /* silencieux */ }
  },

  /** Repost — republication du concert avec attribution de source (cf. reelService.repost). */
  async repost(concertId: string): Promise<Concert> {
    const res = await apiClient.post<Concert>(Endpoints.concerts.repost(concertId));
    return res.data;
  },

  async getStreamToken(concertId: string): Promise<StreamToken> {
    const res = await apiClient.get<StreamToken>(Endpoints.streaming.token(concertId));
    return res.data;
  },

  async getStreamStatus(concertId: string): Promise<StreamStatus> {
    const res = await apiClient.get<StreamStatus>(Endpoints.streaming.status(concertId));
    return res.data;
  },

  async getTicketsSold(concertId: string): Promise<TicketsSold> {
    const res = await apiClient.get<TicketsSold>(Endpoints.streaming.ticketsSold(concertId));
    return res.data;
  },

  // ── Création & édition (artiste) ──────────────────────────────────────────

  async create(data: ConcertCreate): Promise<Concert> {
    const res = await apiClient.post<Concert>(Endpoints.concerts.list, data);
    return res.data;
  },

  async update(id: string, data: ConcertUpdate): Promise<Concert> {
    const res = await apiClient.put<Concert>(Endpoints.concerts.byId(id), data);
    return res.data;
  },

  async publish(id: string): Promise<Concert> {
    const res = await apiClient.patch<Concert>(Endpoints.concerts.publish(id));
    return res.data;
  },

  /** Bascule un concert GRATUIT en payant — y compris en plein live (l'artiste
   * décide de commercialiser l'accès une fois le direct démarré). */
  async monetize(id: string, ticketPrice: number, tier: string = 'simple'): Promise<Concert> {
    const res = await apiClient.patch<Concert>(Endpoints.concerts.monetize(id), { ticket_price: ticketPrice, tier });
    return res.data;
  },

  async getMyConcerts(): Promise<Concert[]> {
    const res = await apiClient.get<Concert[]>(Endpoints.concerts.me);
    return Array.isArray(res.data) ? res.data : [];
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(Endpoints.concerts.byId(id));
  },

  async startLive(id: string): Promise<StreamToken> {
    const res = await apiClient.post<StreamToken>(Endpoints.streaming.start(id));
    return res.data;
  },

  async endLive(id: string): Promise<void> {
    await apiClient.post(Endpoints.streaming.stop(id));
  },

  async toggleRecording(id: string, enabled: boolean): Promise<{ recording: boolean }> {
    const res = await apiClient.patch<{ recording: boolean }>(Endpoints.streaming.recording(id), { enabled });
    return res.data;
  },

  async buyTicket(concertId: string, tierKey?: string): Promise<unknown> {
    const res = await apiClient.post(Endpoints.concerts.buyTicket(concertId), tierKey ? { tier: tierKey } : undefined);
    return res.data;
  },

  async getMyTickets(): Promise<unknown[]> {
    const res = await apiClient.get<unknown[]>(Endpoints.concerts.myTickets);
    return Array.isArray(res.data) ? res.data : [];
  },
};
