import { storage } from '../utils/storage';

const KEY = 'search:history';
const MAX = 15;

export interface SearchHistoryItem {
  query: string;
  ts: number;
}

export const searchHistoryService = {
  getAll(): SearchHistoryItem[] {
    try {
      const raw = storage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  add(query: string): void {
    const q = query.trim();
    if (!q) return;
    try {
      const history = searchHistoryService.getAll().filter(h => h.query.toLowerCase() !== q.toLowerCase());
      history.unshift({ query: q, ts: Date.now() });
      storage.setItem(KEY, JSON.stringify(history.slice(0, MAX)));
    } catch {}
  },

  remove(query: string): void {
    try {
      const history = searchHistoryService.getAll().filter(h => h.query !== query);
      storage.setItem(KEY, JSON.stringify(history));
    } catch {}
  },

  clear(): void {
    storage.removeItem(KEY);
  },
};
