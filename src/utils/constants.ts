import { Platform } from 'react-native';

// ── API ────────────────────────────────────────────────────────────────────
// Basculer entre local et production
export const USE_LOCAL_API = false; // Mettre à true pour le développement local

export const API_BASE_URL = USE_LOCAL_API
  ? 'http://localhost:8000' // local via adb reverse (USB)
  : 'http://178.104.248.78'; // prod (port 80 is default)

export const WS_BASE_URL = USE_LOCAL_API
  ? 'ws://localhost:8000'
  : 'ws://178.104.248.78';

export const API_TIMEOUT = 30_000; // 30s (Fly.dev cold start)

// ── App ────────────────────────────────────────────────────────────────────
export const APP_NAME    = 'FoliX';
export const APP_VERSION = '1.0.0';

// ── Pagination ─────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT  = 20;
export const REELS_PAGE_LIMIT    = 10;
export const SEARCH_PAGE_LIMIT   = 15;

// ── Plans ──────────────────────────────────────────────────────────────────
export const PLAN_LABELS = {
  free:    'Gratuit',
  basic:   'Basic',
  premium: 'Premium',
  family:  'Famille',
} as const;

// ── Storage keys ───────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  ACCESS_TOKEN:   'folix_access_token',
  REFRESH_TOKEN:  'folix_refresh_token',
  THEME_MODE:     'folix_theme_mode',
  ONBOARDING_DONE:'folix_onboarding_done',
  LAST_USER_ID:   'folix_last_user_id',
} as const;

// ── Durées (ms) ────────────────────────────────────────────────────────────
export const DURATIONS = {
  animation:     250,
  toast:       3_000,
  debounce:      400,
  tokenRefresh: 60_000,
} as const;

// ── Saved items (MMKV keys) ────────────────────────────────────────────────
export const SAVED_KEYS = {
  EVENTS:   'folix_saved_events',
  CONCERTS: 'folix_saved_concerts',
  REELS:    'folix_saved_reels',
  STORIES:  'folix_saved_stories',
} as const;
