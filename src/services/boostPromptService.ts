/**
 * boostPromptService
 * Mémorise localement (MMKV) les contenus pour lesquels le bottom sheet
 * "Booste ta publication" a déjà été rabattu par l'utilisateur — ne le
 * reproposera plus jamais pour CE contenu précis (un autre contenu plus tard
 * peut toujours déclencher un nouveau bottom sheet). Purement local, pas de
 * sync backend : l'exclusion fiable et définitive (contenu réellement boosté)
 * est déjà gérée côté serveur via Ad.source_content_id.
 */
import { storage } from '../utils/storage';

const DISMISSED_KEY = 'gofolyx_boost_prompt_dismissed';
// Une seule apparition par session app — évite de relancer le bottom sheet
// plusieurs fois pendant le même scroll si l'utilisateur l'a déjà vu une fois,
// même pour un contenu différent de celui refusé.
let shownThisSession = false;

type SourceType = 'post' | 'reel' | 'event' | 'concert';

function loadDismissed(): string[] {
  try { return JSON.parse(storage.getItem(DISMISSED_KEY) ?? '[]'); }
  catch { return []; }
}

function key(id: string, type: SourceType): string {
  return `${type}:${id}`;
}

export const boostPromptService = {
  wasDismissed(id: string, type: SourceType): boolean {
    return loadDismissed().includes(key(id, type));
  },

  markDismissed(id: string, type: SourceType): void {
    const list = loadDismissed();
    const k = key(id, type);
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
