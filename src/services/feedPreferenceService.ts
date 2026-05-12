/**
 * feedPreferenceService
 * "Pas intéressé" : stocké en MMKV (instantané) + synchro backend en arrière-plan.
 * "Me rappeler"   : stocké en MMKV + synchro backend.
 */
import { storage } from '../utils/storage';
import { apiClient } from '../api';

const HIDDEN_KEY   = 'folix_feed_hidden';
const REMINDER_KEY = 'folix_feed_reminders';

type RefType = 'event' | 'concert' | 'post' | 'reel';

interface HiddenEntry   { id: string; type: RefType }
interface ReminderEntry { id: string; type: RefType; eventDate: string; title: string }

// ── Helpers MMKV ─────────────────────────────────────────────────────────────

function loadHidden(): HiddenEntry[] {
  try { return JSON.parse(storage.getItem(HIDDEN_KEY) ?? '[]'); }
  catch { return []; }
}

function loadReminders(): ReminderEntry[] {
  try { return JSON.parse(storage.getItem(REMINDER_KEY) ?? '[]'); }
  catch { return []; }
}

function saveHidden(list: HiddenEntry[])     { storage.setItem(HIDDEN_KEY,   JSON.stringify(list)); }
function saveReminders(list: ReminderEntry[]) { storage.setItem(REMINDER_KEY, JSON.stringify(list)); }

// ── API publique ──────────────────────────────────────────────────────────────

export const feedPreferenceService = {

  // ── "Pas intéressé" ────────────────────────────────────────────────────────

  isHidden(id: string, type: RefType): boolean {
    return loadHidden().some(h => h.id === id && h.type === type);
  },

  /** Masque localement (instantané) puis sync backend. Retourne le nouvel état. */
  async toggleHide(id: string, type: RefType): Promise<boolean> {
    const list    = loadHidden();
    const idx     = list.findIndex(h => h.id === id && h.type === type);
    const isNowHidden = idx === -1;

    if (isNowHidden) {
      list.push({ id, type });
    } else {
      list.splice(idx, 1);
    }
    saveHidden(list);

    // Sync backend (silencieux — pas bloquant)
    const path = type === 'event' ? `/api/v1/events/${id}/hide` : `/api/v1/concerts/${id}/hide`;
    apiClient.post(path, {}).catch(() => {});

    return isNowHidden;
  },

  /** Filtre une liste de feedItems en retirant les éléments cachés. */
  filterFeed<T extends { id: string; kind: string }>(items: T[]): T[] {
    const hidden = loadHidden();
    return items.filter(item => {
      const type = item.kind as RefType;
      return !hidden.some(h => h.id === item.id && h.type === type);
    });
  },

  // ── "Me rappeler" ──────────────────────────────────────────────────────────

  hasReminder(id: string, type: RefType): boolean {
    return loadReminders().some(r => r.id === id && r.type === type);
  },

  /** Active/désactive le rappel localement + sync backend. Retourne le nouvel état. */
  async toggleReminder(
    id: string,
    type: RefType,
    title: string,
    eventDate: string,
  ): Promise<boolean> {
    const list = loadReminders();
    const idx  = list.findIndex(r => r.id === id && r.type === type);
    const isNowActive = idx === -1;

    if (isNowActive) {
      list.push({ id, type, eventDate, title });
    } else {
      list.splice(idx, 1);
    }
    saveReminders(list);

    // Sync backend
    const path = type === 'event'
      ? `/api/v1/events/${id}/remind`
      : `/api/v1/concerts/${id}/remind`;
    apiClient.post(path, {}).catch(() => {});

    return isNowActive;
  },

  getReminders(): ReminderEntry[] {
    return loadReminders();
  },
};
