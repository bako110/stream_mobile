import { apiClient, Endpoints } from '../api';
import type { Event, EventTicket, EventAttendee, EventCreate, EventUpdate, TicketScanResult } from '../types';
import { DEFAULT_PAGE_LIMIT } from '../utils/constants';

export const eventService = {
  async list(params?: {
    page?: number; limit?: number;
    event_type?: string; city?: string; status?: string;
    noCache?: boolean;
    lat?: number; lon?: number;
    radius_km?: number;
    contact_ids?: string[];
  }): Promise<Event[]> {
    const q = new URLSearchParams({
      page:  String(params?.page  ?? 1),
      limit: String(params?.limit ?? DEFAULT_PAGE_LIMIT),
      ...(params?.event_type       ? { event_type:  params.event_type }              : {}),
      ...(params?.city             ? { city:        params.city }                    : {}),
      ...(params?.status           ? { status:      params.status }                  : {}),
      ...(params?.lat != null      ? { lat:         String(params.lat) }             : {}),
      ...(params?.lon != null      ? { lon:         String(params.lon) }             : {}),
      ...(params?.radius_km != null ? { radius_km:  String(params.radius_km) }      : {}),
      ...(params?.contact_ids?.length ? { contact_ids: params.contact_ids.join(',') } : {}),
    }).toString();
    const res = await apiClient.get<Event[]>(
      `${Endpoints.events.list}?${q}`,
      params?.noCache ? { headers: { 'Cache-Control': 'no-cache' } } : undefined,
    );
    return Array.isArray(res.data) ? res.data : [];
  },

  async getById(id: string): Promise<Event> {
    const res = await apiClient.get<Event>(Endpoints.events.byId(id));
    return res.data;
  },

  // ── Création & édition ────────────────────────────────────────────────────

  async create(data: EventCreate): Promise<Event> {
    const res = await apiClient.post<Event>(Endpoints.events.list, data);
    return res.data;
  },

  async update(id: string, data: EventUpdate): Promise<Event> {
    const res = await apiClient.put<Event>(Endpoints.events.byId(id), data);
    return res.data;
  },

  async publish(id: string): Promise<Event> {
    const res = await apiClient.patch<Event>(Endpoints.events.publish(id));
    return res.data;
  },

  async saveDraft(id: string): Promise<Event> {
    const res = await apiClient.put<Event>(Endpoints.events.byId(id), { status: 'draft' });
    return res.data;
  },

  async getMyEvents(): Promise<Event[]> {
    const res = await apiClient.get<Event[]>(Endpoints.events.me);
    return Array.isArray(res.data) ? res.data : [];
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(Endpoints.events.byId(id));
  },

  // ── Billets ───────────────────────────────────────────────────────────────

  async buyTicket(eventId: string, tierKey?: string): Promise<EventTicket> {
    const res = await apiClient.post<EventTicket>(Endpoints.events.buyTicket(eventId), tierKey ? { tier: tierKey } : undefined);
    return res.data;
  },

  async getMyTickets(): Promise<EventTicket[]> {
    const res = await apiClient.get<EventTicket[]>(Endpoints.events.myTickets);
    return res.data;
  },

  async getAttendees(eventId: string): Promise<EventAttendee[]> {
    const res = await apiClient.get<EventAttendee[]>(Endpoints.events.attendees(eventId));
    return Array.isArray(res.data) ? res.data : [];
  },

  async getAttendeesCsvUrl(eventId: string): Promise<string> {
    return Endpoints.events.attendeesCsv(eventId);
  },

  // ── Scan QR billet ────────────────────────────────────────────────────────

  async scanTicket(eventId: string, accessCode: string): Promise<TicketScanResult> {
    const res = await apiClient.get<TicketScanResult>(Endpoints.events.scanTicket(eventId, accessCode));
    return res.data;
  },

  async validateTicketByQr(eventId: string, accessCode: string): Promise<TicketScanResult> {
    const res = await apiClient.post<TicketScanResult>(Endpoints.events.validateByQr(eventId, accessCode));
    return res.data;
  },

  // ── Rappel ────────────────────────────────────────────────────────────────

  async toggleRemind(eventId: string): Promise<{ active: boolean }> {
    const res = await apiClient.post<{ active: boolean }>(Endpoints.events.remind(eventId));
    return res.data;
  },

  async getRemindStatus(eventId: string): Promise<{ active: boolean }> {
    const res = await apiClient.get<{ active: boolean }>(Endpoints.events.remind(eventId));
    return res.data;
  },

  // ── Masquer du feed ───────────────────────────────────────────────────────

  async toggleHide(eventId: string): Promise<{ hidden: boolean }> {
    const res = await apiClient.post<{ hidden: boolean }>(Endpoints.events.hide(eventId));
    return res.data;
  },
};
