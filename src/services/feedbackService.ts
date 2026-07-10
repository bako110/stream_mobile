import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export type FeedbackCategory = 'bug' | 'suggestion' | 'avis';
export type FeedbackStatus = 'nouveau' | 'lu' | 'traite';

export interface Feedback {
  id: string;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface CreateFeedbackPayload {
  category: FeedbackCategory;
  message: string;
}

export const feedbackService = {
  async create(payload: CreateFeedbackPayload): Promise<Feedback> {
    const res = await apiClient.post<Feedback>(Endpoints.feedback.create, payload);
    return res.data;
  },

  async listMine(): Promise<Feedback[]> {
    const res = await apiClient.get<Feedback[]>(Endpoints.feedback.mine);
    return res.data;
  },
};
