import { Platform } from 'react-native';

// ── API ────────────────────────────────────────────────────────────────────
// Basculer entre local et production
export const USE_LOCAL_API = false; // Mettre à true pour le développement local

export const API_BASE_URL = USE_LOCAL_API
  ? 'http://localhost:8000' // local via adb reverse (USB)
  : 'https://gofolyx.com'; // prod — HTTPS/HTTP2, évite la sérialisation des requêtes parallèles

export const WS_BASE_URL = USE_LOCAL_API
  ? 'ws://localhost:8000'
  : 'wss://gofolyx.com';

export const API_TIMEOUT = 30_000; // 30s (Fly.dev cold start)

// ── App ────────────────────────────────────────────────────────────────────
export const APP_NAME    = 'GoFolyX';
export const APP_VERSION = '1.0.0';

// ── Pagination ─────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT  = 20;
export const REELS_PAGE_LIMIT    = 20;
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
  ACCESS_TOKEN:   'gofolyx_access_token',
  REFRESH_TOKEN:  'gofolyx_refresh_token',
  THEME_MODE:     'gofolyx_theme_mode',
  ONBOARDING_DONE:'gofolyx_onboarding_done',
  LAST_USER_ID:   'gofolyx_last_user_id',
  CACHED_USER:    'gofolyx_cached_user',
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
  EVENTS:      'gofolyx_saved_events',
  CONCERTS:    'gofolyx_saved_concerts',
  REELS:       'gofolyx_saved_reels',
  STORIES:     'gofolyx_saved_stories',
  POSTS:       'gofolyx_saved_posts',
  COMMUNITIES: 'gofolyx_saved_communities',
} as const;
