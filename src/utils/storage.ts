import { createMMKV } from 'react-native-mmkv';

// MMKV est ~30x plus rapide qu'AsyncStorage — utilisé pour tokens/préférences
const mmkv = createMMKV({ id: 'folix-storage' });

export const storage = {
  getItem: (key: string): string | null => {
    return mmkv.getString(key) ?? null;
  },

  setItem: (key: string, value: string): void => {
    mmkv.set(key, value);
  },

  removeItem: (key: string): void => {
    mmkv.remove(key);
  },

  getBoolean: (key: string): boolean | null => {
    if (!mmkv.contains(key)) return null;
    return mmkv.getBoolean(key) ?? null;
  },

  setBoolean: (key: string, value: boolean): void => {
    mmkv.set(key, value);
  },

  clear: (): void => {
    mmkv.clearAll();
  },

  contains: (key: string): boolean => {
    return mmkv.contains(key);
  },
};

// ── Cache JSON avec TTL — utilisé pour les listes publiques ──────────────────

interface CacheEntry<T> { data: T; expiresAt: number; }

export const localCache = {
  get<T>(key: string): T | null {
    try {
      const raw = mmkv.getString(`cache:${key}`);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() > entry.expiresAt) { mmkv.remove(`cache:${key}`); return null; }
      return entry.data;
    } catch { return null; }
  },

  set<T>(key: string, data: T, ttlMs: number): void {
    try {
      const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs };
      mmkv.set(`cache:${key}`, JSON.stringify(entry));
    } catch {}
  },

  del(key: string): void {
    mmkv.remove(`cache:${key}`);
  },
};
