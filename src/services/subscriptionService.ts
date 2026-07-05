import { apiClient, Endpoints } from '../api';
import type { Subscription, Payment, Ticket, PlanType } from '../types';

export interface WalletCheck {
  plan: PlanType;
  gogold_required: number;
  balance: number;
  sufficient: boolean;
  missing: number;
}

export const subscriptionService = {
  async getMyCurrent(): Promise<Subscription | null> {
    try {
      const res = await apiClient.get<Subscription>(Endpoints.subscriptions.me);
      return res.data;
    } catch {
      return null;
    }
  },

  async walletCheck(plan: PlanType): Promise<WalletCheck> {
    const res = await apiClient.get<WalletCheck>(
      `${Endpoints.subscriptions.walletCheck}?plan=${plan}`,
    );
    return res.data;
  },

  async subscribeViaWallet(plan: PlanType): Promise<Subscription> {
    const res = await apiClient.post<Subscription>(
      `${Endpoints.subscriptions.subscribeWallet}?plan=${plan}`,
    );
    return res.data;
  },

  async subscribe(plan: PlanType): Promise<Subscription> {
    const res = await apiClient.post<Subscription>(Endpoints.subscriptions.subscribe, { plan });
    return res.data;
  },

  async cancel(): Promise<Subscription> {
    const res = await apiClient.delete<Subscription>(Endpoints.subscriptions.cancel);
    return res.data;
  },

  async getHistory(): Promise<Subscription[]> {
    try {
      const res = await apiClient.get<Subscription[]>(Endpoints.subscriptions.history);
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },
};

export const paymentService = {
  async getHistory(): Promise<Payment[]> {
    const res = await apiClient.get<Payment[]>(Endpoints.payments.history);
    return res.data;
  },

  async getById(id: string): Promise<Payment> {
    const res = await apiClient.get<Payment>(Endpoints.payments.byId(id));
    return res.data;
  },
};

export const ticketService = {
  async getMyTickets(): Promise<Ticket[]> {
    const res = await apiClient.get<Ticket[]>(Endpoints.tickets.me);
    return res.data;
  },

  async getById(id: string): Promise<Ticket> {
    const res = await apiClient.get<Ticket>(Endpoints.tickets.byId(id));
    return res.data;
  },

  async validate(id: string): Promise<{ validated: boolean }> {
    const res = await apiClient.post<{ validated: boolean }>(Endpoints.tickets.validate(id));
    return res.data;
  },
};
