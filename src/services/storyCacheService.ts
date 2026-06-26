/**
 * Cache local des stories — stale-while-revalidate.
 * Le feed est servi instantanement depuis MMKV, puis rafraichi en fond.
 * Les IDs vus sont persistes pour eviter un rechargement de la BD.
 * Les stories vues sont stockees en entier pour relecture hors-ligne.
 */
import { localCache, storage } from '../utils/storage';
import type { Story, StoryGroup } from '../types/story';

const FEED_CACHE_KEY    = 'story_feed';
const VIEWED_KEY        = 'story_viewed_ids';
const VIEWED_STORIES_KEY = 'story_viewed_data'; // stories completes vues
const FEED_TTL_MS       = 5 * 60 * 1000; // 5 min
const MAX_VIEWED_STORED = 200;            // max stories completes en local

// ── Feed cache ────────────────────────────────────────────────────────────────
// getCachedFeed  → fraîcheur seulement (TTL 5 min). Retourne null si expiré → re-fetch en ligne.
// getStaleFeed   → toujours disponible même si TTL expiré → fallback offline.

export function getCachedFeed(): StoryGroup[] | null {
  return localCache.get<StoryGroup[]>(FEED_CACHE_KEY);
}

export function getStaleFeed(): StoryGroup[] | null {
  return localCache.getPersistent<StoryGroup[]>(FEED_CACHE_KEY);
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

/** Retourne true si la story était déjà marquée vue, false si c'est la première fois. */
export function markStoryViewedLocally(storyId: string): boolean {
  const ids = getViewedIds();
  if (ids.has(storyId)) return true;
  ids.add(storyId);
  saveViewedIds(ids);
  return false;
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

// ── Stories vues en entier (relecture hors-ligne) ─────────────────────────────

function loadViewedStories(): Story[] {
  try {
    const raw = storage.getItem(VIEWED_STORIES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Story[];
  } catch { return []; }
}

function saveViewedStoriesRaw(stories: Story[]): void {
  try {
    storage.setItem(VIEWED_STORIES_KEY, JSON.stringify(stories));
  } catch {}
}

/**
 * Sauvegarde la story complete lors du visionnage.
 * Déduplique par ID, limite à MAX_VIEWED_STORED, trie du plus récent.
 */
export function saveViewedStory(story: Story): void {
  const existing = loadViewedStories().filter(s => s.id !== story.id);
  const updated  = [story, ...existing].slice(0, MAX_VIEWED_STORED);
  saveViewedStoriesRaw(updated);
}

/**
 * Retourne les stories vues localement, en excluant celles expirées.
 * Si une story supprimée (plus dans le feed) a expires_at depassé, elle est purgée.
 */
export function getViewedStories(): Story[] {
  const now    = Date.now();
  const stored = loadViewedStories();
  const valid  = stored.filter(s => {
    // Exclure les stories expirées
    if (s.expires_at && new Date(s.expires_at).getTime() <= now) return false;
    // Exclure les stories dont le média local (file://) n'est plus dans l'index
    // (le fichier a pu être purgé par cleanup) — on retombe sur le réseau
    if (s.media_url?.startsWith('file://')) {
      const { getLocalUri } = require('./videoCacheService');
      if (!getLocalUri(s.media_url)) return false;
    }
    return true;
  });
  if (valid.length !== stored.length) saveViewedStoriesRaw(valid);
  return valid;
}

/**
 * Supprime une story du cache local (appelé quand l'utilisateur la supprime côté serveur).
 */
export function removeViewedStoryLocally(storyId: string): void {
  const stories = loadViewedStories().filter(s => s.id !== storyId);
  saveViewedStoriesRaw(stories);
}

/**
 * Purge toutes les stories expirées du cache local.
 * A appeler au démarrage ou au chargement du feed.
 */
export function purgeExpiredViewedStories(): void {
  const now   = Date.now();
  const valid = loadViewedStories().filter(
    s => !s.expires_at || new Date(s.expires_at).getTime() > now,
  );
  saveViewedStoriesRaw(valid);
}
