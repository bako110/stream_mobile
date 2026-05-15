import { apiClient, Endpoints } from '../api';
import { storage } from '../utils/storage';

// Cache local (fallback si pas de reseau)
const CACHE_KEY = 'call_history_cache_v2';

export type CallDirection = 'outgoing' | 'incoming' | 'missed';

export interface CallRecord {
  id:             string;
  partnerId:      string;
  partnerName:    string;
  avatarUrl?:     string;
  callType:       'voice' | 'video';
  direction:      CallDirection;
  startedAt:      string;   // ISO
  durationSec:    number;
}

function fromApi(r: any): CallRecord {
  return {
    id:          r.id,
    partnerId:   r.partner_id,
    partnerName: r.partner_name,
    avatarUrl:   r.partner_avatar ?? undefined,
    callType:    r.call_type,
    direction:   r.direction,
    startedAt:   r.started_at,
    durationSec: r.duration_sec,
  };
}

function loadCache(): CallRecord[] {
  const raw = storage.getItem(CACHE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as CallRecord[]; }
  catch { return []; }
}

function saveCache(list: CallRecord[]) {
  storage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, 100)));
}

export const callHistoryService = {
  async getAll(): Promise<CallRecord[]> {
    try {
      const res = await apiClient.get<any[]>(Endpoints.calls.history);
      const list = (res.data ?? []).map(fromApi);
      saveCache(list);
      return list;
    } catch {
      return loadCache();
    }
  },

  async add(record: Omit<CallRecord, 'id'>): Promise<CallRecord> {
    const body = {
      partner_id:   record.partnerId,
      call_type:    record.callType,
      direction:    record.direction,
      duration_sec: record.durationSec,
      started_at:   record.startedAt,
    };
    try {
      const res = await apiClient.post<{ id: string }>(Endpoints.calls.log, body);
      const entry: CallRecord = { id: res.data.id, ...record };
      // Update cache optimistically
      const cached = loadCache();
      saveCache([entry, ...cached]);
      return entry;
    } catch {
      // Fallback: save only locally
      const entry: CallRecord = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...record,
      };
      saveCache([entry, ...loadCache()]);
      return entry;
    }
  },

  async remove(id: string): Promise<void> {
    if (!id.startsWith('local-')) {
      try { await apiClient.delete(Endpoints.calls.byId(id)); } catch {}
    }
    saveCache(loadCache().filter(r => r.id !== id));
  },

  async clear(): Promise<void> {
    try { await apiClient.delete(Endpoints.calls.clear); } catch {}
    storage.removeItem(CACHE_KEY);
  },
};
