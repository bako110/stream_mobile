/**
 * startScreenSurveyService
 * Pilote le bottom sheet "Qu'est-ce qui t'amène sur Gofolyx ?" (Reels/Feed/
 * Communautés) — affiché au démarrage de l'app, pas plus d'une fois toutes
 * les 48h, qu'on y ait répondu ou qu'on l'ait fermé sans répondre.
 */
import { storage } from '../utils/storage';

const LAST_SHOWN_KEY = 'gofolyx_start_screen_survey_last_shown';
const COOLDOWN_MS = 48 * 60 * 60 * 1000;

// Une seule apparition par session app — évite de le redéclencher plusieurs
// fois si l'écran qui l'affiche remonte pendant la même session.
let shownThisSession = false;

export const startScreenSurveyService = {
  shouldShow(): boolean {
    if (shownThisSession) return false;
    try {
      const raw = storage.getItem(LAST_SHOWN_KEY);
      const last = raw ? parseInt(raw, 10) : 0;
      return Date.now() - last >= COOLDOWN_MS;
    } catch {
      return true;
    }
  },

  markShown(): void {
    shownThisSession = true;
    try { storage.setItem(LAST_SHOWN_KEY, String(Date.now())); } catch {}
  },
};
