/**
 * saveService — sauvegarde locale (MMKV) des événements, concerts et reels.
 * Les données sauvegardées sont disponibles hors-ligne.
 */
import { storage } from '../utils/storage';
import { SAVED_KEYS } from '../utils/constants';
import type { Event } from '../types/event';
import type { Concert } from '../types/concert';
import type { Reel } from '../types/reel';
import type { Story } from '../types/story';
import type { Post } from '../types/post';

// ── Helpers génériques ────────────────────────────────────────────────────────

function loadList<T extends { id: string }>(key: string): T[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  try { return JSON.parse(raw) as T[]; }
  catch { return []; }
}

function saveList<T>(key: string, items: T[]): void {
  storage.setItem(key, JSON.stringify(items));
}

function addItem<T extends { id: string }>(key: string, item: T): void {
  const list = loadList<T>(key);
  if (!list.find(i => i.id === item.id)) {
    saveList(key, [item, ...list]);
  }
}

function removeItem(key: string, id: string): void {
  const list = loadList<{ id: string }>(key);
  saveList(key, list.filter(i => i.id !== id));
}

function isItemSaved(key: string, id: string): boolean {
  return loadList<{ id: string }>(key).some(i => i.id === id);
}

// ── API publique ──────────────────────────────────────────────────────────────

export const saveService = {
  // Events
  saveEvent:        (event: Event)     => addItem(SAVED_KEYS.EVENTS,   event),
  unsaveEvent:      (id: string)       => removeItem(SAVED_KEYS.EVENTS, id),
  isEventSaved:     (id: string)       => isItemSaved(SAVED_KEYS.EVENTS, id),
  getSavedEvents:   ()                 => loadList<Event>(SAVED_KEYS.EVENTS),

  // Concerts
  saveConcert:      (concert: Concert) => addItem(SAVED_KEYS.CONCERTS,   concert),
  unsaveConcert:    (id: string)       => removeItem(SAVED_KEYS.CONCERTS, id),
  isConcertSaved:   (id: string)       => isItemSaved(SAVED_KEYS.CONCERTS, id),
  getSavedConcerts: ()                 => loadList<Concert>(SAVED_KEYS.CONCERTS),

  // Reels
  saveReel:         (reel: Reel)       => addItem(SAVED_KEYS.REELS,   reel),
  unsaveReel:       (id: string)       => removeItem(SAVED_KEYS.REELS, id),
  isReelSaved:      (id: string)       => isItemSaved(SAVED_KEYS.REELS, id),
  getSavedReels:    ()                 => loadList<Reel>(SAVED_KEYS.REELS),

  // Stories
  saveStory:        (story: Story)   => addItem(SAVED_KEYS.STORIES,   story),
  unsaveStory:      (id: string)     => removeItem(SAVED_KEYS.STORIES, id),
  isStorySaved:     (id: string)     => isItemSaved(SAVED_KEYS.STORIES, id),
  getSavedStories:  ()               => loadList<Story>(SAVED_KEYS.STORIES),

  // Posts
  savePost:         (post: Post)     => addItem(SAVED_KEYS.POSTS,   post),
  unsavePost:       (id: string)     => removeItem(SAVED_KEYS.POSTS, id),
  isPostSaved:      (id: string)     => isItemSaved(SAVED_KEYS.POSTS, id),
  getSavedPosts:    ()               => loadList<Post>(SAVED_KEYS.POSTS),

  // Communities
  saveCommunity:    (c: { id: string; name: string; avatar_url?: string | null; members_count?: number; description?: string | null }) =>
                      addItem(SAVED_KEYS.COMMUNITIES, c),
  unsaveCommunity:  (id: string)     => removeItem(SAVED_KEYS.COMMUNITIES, id),
  isCommunitysaved: (id: string)     => isItemSaved(SAVED_KEYS.COMMUNITIES, id),
  getSavedCommunities: ()            => loadList<{ id: string; name: string; avatar_url?: string | null; members_count?: number; description?: string | null }>(SAVED_KEYS.COMMUNITIES),

  // Tout effacer
  clearAll: () => {
    storage.removeItem(SAVED_KEYS.EVENTS);
    storage.removeItem(SAVED_KEYS.CONCERTS);
    storage.removeItem(SAVED_KEYS.REELS);
    storage.removeItem(SAVED_KEYS.STORIES);
    storage.removeItem(SAVED_KEYS.POSTS);
    storage.removeItem(SAVED_KEYS.COMMUNITIES);
  },
};
