import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

export type ReportContentType = 'reel' | 'event' | 'concert' | 'comment' | 'post';
export type ReportReason = 'spam' | 'inappropriate' | 'violence' | 'harassment' | 'misinformation' | 'other';

export interface CreateReportPayload {
  content_type: ReportContentType;
  content_id: string;
  reason: ReportReason;
  details?: string;
}

export const reportService = {
  async create(payload: CreateReportPayload): Promise<{ id: string; status: string }> {
    const res = await apiClient.post<{ id: string; status: string }>(
      Endpoints.reports.create,
      payload,
    );
    return res.data;
  },
};
