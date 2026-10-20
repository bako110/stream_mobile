/**
 * boostPromptService
 * Mémorise localement (MMKV) les suggestions de Boost pour lesquelles le
 * bottom sheet du feed a déjà été rabattu par l'utilisateur — ne le
 * reproposera plus jamais pour CETTE suggestion précise (un contenu/cible
 * différent peut toujours déclencher un nouveau bottom sheet plus tard).
 * Purement local, pas de sync backend.
 */
import { storage } from '../utils/storage';

const DISMISSED_KEY = 'gofolyx_boost_prompt_dismissed';
// Une seule apparition par session app — évite de relancer le bottom sheet
// plusieurs fois pendant le même scroll si l'utilisateur l'a déjà vu une fois,
// même pour une suggestion différente de celle refusée.
let shownThisSession = false;

function loadDismissed(): string[] {
  try { return JSON.parse(storage.getItem(DISMISSED_KEY) ?? '[]'); }
  catch { return []; }
}

// Clé = cible du boost + contenu visé (s'il y en a un) — "followers"/
// "profile_views" n'ont pas de contenu, la cible seule sert alors de clé.
function key(target: string, contentId?: string | null): string {
  return contentId ? `${target}:${contentId}` : target;
}

export const boostPromptService = {
  wasDismissed(target: string, contentId?: string | null): boolean {
    return loadDismissed().includes(key(target, contentId));
  },

  markDismissed(target: string, contentId?: string | null): void {
    const list = loadDismissed();
    const k = key(target, contentId);
    if (!list.includes(k)) {
      list.push(k);
      // Garde les 200 plus récents — pas de croissance illimitée pour un
      // compte très actif sur plusieurs années.
      storage.setItem(DISMISSED_KEY, JSON.stringify(list.slice(-200)));
    }
  },

  hasShownThisSession(): boolean {
    return shownThisSession;
  },

  markShownThisSession(): void {
    shownThisSession = true;
  },
};
