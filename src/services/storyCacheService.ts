/**
 * Cache local des stories — stale-while-revalidate.
 * Le feed est servi instantanement depuis MMKV, puis rafraichi en fond.
 * Les IDs vus sont persistes pour eviter un rechargement de la BD.
 */
import { localCache, storage } from '../utils/storage';
import type { StoryGroup } from '../types/story';

const FEED_CACHE_KEY  = 'story_feed';
const VIEWED_KEY      = 'story_viewed_ids';
const FEED_TTL_MS     = 5 * 60 * 1000; // 5 min — au-dela, on rafraichit obligatoirement

// ── Feed cache ────────────────────────────────────────────────────────────────

export function getCachedFeed(): StoryGroup[] | null {
  return localCache.get<StoryGroup[]>(FEED_CACHE_KEY);
}

export function setCachedFeed(groups: StoryGroup[]): void {
  localCache.set(FEED_CACHE_KEY, groups, FEED_TTL_MS);
}

export function invalidateFeedCache(): void {
  localCache.del(FEED_CACHE_KEY);
}

// ── IDs des stories vues (persistes entre sessions) ───────────────────────────

function loadViewedIds(): Set<string> {
  try {
    const raw = storage.getItem(VIEWED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

function saveViewedIds(ids: Set<string>): void {
  // Limiter a 5000 entrees max (stories expirent de toute facon)
  const arr = [...ids].slice(-5000);
  storage.setItem(VIEWED_KEY, JSON.stringify(arr));
}

let _viewedIds: Set<string> | null = null;

function getViewedIds(): Set<string> {
  if (!_viewedIds) _viewedIds = loadViewedIds();
  return _viewedIds;
}

export function markStoryViewedLocally(storyId: string): void {
  const ids = getViewedIds();
  if (!ids.has(storyId)) {
    ids.add(storyId);
    saveViewedIds(ids);
  }
}

export function isStoryViewedLocally(storyId: string): boolean {
  return getViewedIds().has(storyId);
}

/**
 * Applique les vues locales sur un feed frais venant de l'API.
 * `viewed_by_me` et `has_unseen` sont mis a jour sans appel reseau.
 */
export function applyLocalViewsToFeed(groups: StoryGroup[]): StoryGroup[] {
  const viewed = getViewedIds();
  return groups.map(group => {
    const stories = group.stories.map(st => ({
      ...st,
      viewed_by_me: st.viewed_by_me || viewed.has(st.id),
    }));
    const has_unseen = stories.some(st => !st.viewed_by_me);
    return { ...group, stories, has_unseen };
  });
}
