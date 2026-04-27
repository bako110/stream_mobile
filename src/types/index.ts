export * from './user';
export * from './content';
export * from './concert';
export * from './event';
export * from './reel';
export * from './subscription';
export * from './search';
export * from './social';
export * from './story';

// ── Commun ─────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApiErrorResponse {
  detail: string;
  status_code?: number;
}
