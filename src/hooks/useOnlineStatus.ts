/**
 * useOnlineStatus — présence en ligne en temps réel, isolée du state React
 * principal des listes (FeedScreen.items, etc.).
 *
 * Avant : un WS de présence déclenchait setItems(prev => prev.map(...)) à
 * chaque connexion/déconnexion de n'importe quel utilisateur — recréant tout
 * le tableau affiché (nouvelle référence) et forçant un re-render de TOUTES
 * les cartes visibles, pas seulement celle concernée. Sur une plateforme
 * multi-utilisateurs, ces événements sont trop fréquents pour se permettre un
 * re-render global à chaque fois (contribuait au feed qui "bouge tout seul").
 *
 * Ici, la présence vit dans une Map externe au cycle de rendu React. Chaque
 * composant qui affiche un badge "en ligne" s'abonne via useSyncExternalStore
 * UNIQUEMENT pour l'userId qui l'intéresse — un changement de présence ne
 * re-render donc que les cartes de CET utilisateur précis, jamais les autres.
 */
import { useSyncExternalStore, useCallback } from 'react';

const presence = new Map<string, boolean>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

/** Appelé par le handler WS (lastPresenceUpdate) — ne touche à aucun state React. */
export function setOnlineStatus(userId: string, isOnline: boolean): void {
  if (presence.get(userId) === isOnline) return; // no-op si rien ne change
  presence.set(userId, isOnline);
  notify();
}

export function getOnlineStatus(userId: string | null | undefined): boolean | undefined {
  if (!userId) return undefined;
  return presence.get(userId);
}

/** Hook — ne re-render le composant appelant que lorsque LA présence de cet
 * userId précis change, jamais pour les autres utilisateurs. `fallback` est la
 * valeur initiale connue (ex: is_online déjà présent dans item.data au
 * chargement), utilisée tant qu'aucun événement WS n'est encore arrivé pour
 * cet utilisateur. */
export function useOnlineStatus(userId: string | null | undefined, fallback?: boolean): boolean | undefined {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, []);
  const getSnapshot = useCallback(() => {
    if (!userId) return fallback;
    return presence.has(userId) ? presence.get(userId) : fallback;
  }, [userId, fallback]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
