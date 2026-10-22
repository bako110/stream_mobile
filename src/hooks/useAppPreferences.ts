import { storage } from '../utils/storage';

const STORAGE_KEY = 'app_preferences';

export type StartScreen = 'feed' | 'reels' | 'communities';

export interface AppPreferences {
  preferred_start_screen: StartScreen;
  feed_autoplay_reels: boolean;
}

const DEFAULTS: AppPreferences = { preferred_start_screen: 'feed', feed_autoplay_reels: false };

export function getAppPreferences(): AppPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

export function setCachedAppPreferences(prefs: AppPreferences): void {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
}
