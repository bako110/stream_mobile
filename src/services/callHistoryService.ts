import { storage } from '../utils/storage';

const KEY = 'call_history_v1';
const MAX  = 100;

export type CallDirection = 'outgoing' | 'incoming' | 'missed';

export interface CallRecord {
  id:          string;
  partnerId:   string;
  partnerName: string;
  avatarUrl?:  string;
  callType:    'voice' | 'video';
  direction:   CallDirection;
  startedAt:   string;   // ISO
  durationSec: number;   // 0 = manqué / raccroché avant connexion
}

function load(): CallRecord[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as CallRecord[]; }
  catch { return []; }
}

function save(list: CallRecord[]) {
  storage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export const callHistoryService = {
  getAll(): CallRecord[] {
    return load();
  },

  add(record: Omit<CallRecord, 'id'>): CallRecord {
    const entry: CallRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...record };
    const list = [entry, ...load()];
    save(list);
    return entry;
  },

  remove(id: string) {
    save(load().filter(r => r.id !== id));
  },

  clear() {
    storage.removeItem(KEY);
  },
};
