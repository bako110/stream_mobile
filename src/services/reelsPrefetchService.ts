/**
 * Précharge la 1ère page du feed Reels + le fichier vidéo du tout premier reel,
 * dès le démarrage de l'app (voir RootNavigator, appelé juste après l'entrée
 * en session) — AVANT que l'utilisateur ne clique sur l'onglet Reels. Sans ça,
 * le fetch de la liste ET le téléchargement de la 1ère vidéo ne démarraient
 * qu'au moment du clic (ReelsScreen.load(), au premier focus), d'où le temps
 * d'attente perçu avant la toute première lecture.
 *
 * ReelsScreen relit ce résultat au montage (consume()) pour éviter un second
 * fetch redondant — le cache n'est utilisable qu'une fois (consume() le vide),
 * il ne sert qu'à ce tout premier affichage, jamais aux retours suivants sur
 * l'onglet (qui ont leur propre logique de refresh silencieux).
 */
import { reelService, type ReelFeedResponse } from './reelService';
import { cacheInBackground } from './reelVideoCacheService';
import type { Reel } from '../types';

let pending: Promise<ReelFeedResponse | null> | null = null;
let result: ReelFeedResponse | null = null;
let consumed = false;

export function startReelsPrefetch(): void {
  if (pending || result) return; // déjà lancé ou déjà disponible
  pending = reelService.getFeed({ page: 1 })
    .then(data => {
      result = data;
      const first = (data.items ?? []).find((r: Reel) => r.mp4_url);
      if (first?.mp4_url) cacheInBackground(first.mp4_url).catch(() => {});
      return data;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
}

/** Consomme le résultat préchargé (une seule fois) — null si rien de prêt/déjà consommé. */
export function consumeReelsPrefetch(): ReelFeedResponse | null {
  if (consumed || !result) return null;
  consumed = true;
  const r = result;
  result = null;
  return r;
}
