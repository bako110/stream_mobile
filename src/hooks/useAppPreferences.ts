import { storage } from '../utils/storage';

const STORAGE_KEY = 'app_preferences';

export type StartScreen = 'feed' | 'reels' | 'communities';

export interface AppPreferences {
  preferred_start_screen: StartScreen;
}

const DEFAULTS: AppPreferences = { preferred_start_screen: 'feed' };

export function getAppPreferences(): AppPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}
