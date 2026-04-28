import { apiClient, Endpoints } from '../api';
import type { Subscription, Payment, Ticket, PlanType } from '../types';

export const subscriptionService = {
  async getMyCurrent(): Promise<Subscription | null> {
    try {
      const res = await apiClient.get<Subscription>(Endpoints.subscriptions.myCurrent);
      return res.data;
    } catch {
      return null;
    }
  },

  async subscribe(plan: PlanType): Promise<Subscription> {
    const res = await apiClient.post<Subscription>(Endpoints.subscriptions.subscribe, { plan });
    return res.data;
  },

  async cancel(): Promise<void> {
    await apiClient.post(Endpoints.subscriptions.cancel);
  },

  async getHistory(): Promise<Subscription[]> {
    const res = await apiClient.get<Subscription[]>(Endpoints.subscriptions.history);
    return res.data;
  },
};

export const paymentService = {
  async createIntent(params: {
    amount: number;
    payment_type: 'subscription' | 'ticket' | 'ppv';
    ref_id?: string;
  }): Promise<{ client_secret: string; payment_intent_id: string }> {
    const res = await apiClient.post<{ client_secret: string; payment_intent_id: string }>(
      Endpoints.payments.intent,
      params,
    );
    return res.data;
  },

  async getHistory(): Promise<Payment[]> {
    const res = await apiClient.get<Payment[]>(Endpoints.payments.history);
    return res.data;
  },
};

export const ticketService = {
  async getMyTickets(): Promise<Ticket[]> {
    const res = await apiClient.get<Ticket[]>(Endpoints.tickets.myTickets);
    return res.data;
  },

  async buy(params: { concert_id?: string; event_id?: string }): Promise<Ticket> {
    const res = await apiClient.post<Ticket>(Endpoints.tickets.buy, params);
    return res.data;
  },
};
