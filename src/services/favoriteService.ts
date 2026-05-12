import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import { saveService } from './saveService';

export type FavoriteType = 'event' | 'concert' | 'reel' | 'post' | 'community' | 'content' | 'story';

export interface FavoriteOut {
  id: string;
  target_type: string;
  target_id: string;
  target_title: string | null;
  target_subtitle: string | null;
  target_thumbnail: string | null;
  saved_at: string;
}

export interface SavePayload {
  target_type: FavoriteType;
  target_id: string;
  target_title?: string | null;
  target_subtitle?: string | null;
  target_thumbnail?: string | null;
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function list(type?: FavoriteType): Promise<FavoriteOut[]> {
  return apiClient.get<FavoriteOut[]>(Endpoints.favorites.list(type));
}

async function save(payload: SavePayload): Promise<FavoriteOut> {
  return apiClient.post<FavoriteOut>(Endpoints.favorites.save, payload);
}

async function unsave(targetType: FavoriteType, targetId: string): Promise<void> {
  await apiClient.delete(Endpoints.favorites.unsave(targetType, targetId));
}

async function check(targetType: FavoriteType, targetId: string): Promise<boolean> {
  const res = await apiClient.get<{ saved: boolean }>(
    Endpoints.favorites.check(targetType, targetId),
  );
  return res.saved;
}

// ── Helpers combinés (server + MMKV local) ────────────────────────────────────
// Chaque toggle synchronise le serveur ET la cache locale MMKV.

async function toggleEvent(item: any): Promise<boolean> {
  const id: string = item.id;
  if (saveService.isEventSaved(id)) {
    saveService.unsaveEvent(id);
    await unsave('event', id).catch(() => {});
    return false;
  }
  saveService.saveEvent(item);
  await save({ target_type: 'event', target_id: id, target_title: item.title, target_subtitle: item.venue_city ?? item.location, target_thumbnail: item.thumbnail_url ?? item.cover_url }).catch(() => {});
  return true;
}

async function toggleConcert(item: any): Promise<boolean> {
  const id: string = item.id;
  if (saveService.isConcertSaved(id)) {
    saveService.unsaveConcert(id);
    await unsave('concert', id).catch(() => {});
    return false;
  }
  saveService.saveConcert(item);
  await save({ target_type: 'concert', target_id: id, target_title: item.title, target_subtitle: item.venue_city ?? item.artist_name, target_thumbnail: item.thumbnail_url ?? item.cover_url }).catch(() => {});
  return true;
}

async function toggleReel(item: any): Promise<boolean> {
  const id: string = item.id;
  if (saveService.isReelSaved(id)) {
    saveService.unsaveReel(id);
    await unsave('reel', id).catch(() => {});
    return false;
  }
  saveService.saveReel(item);
  await save({ target_type: 'reel', target_id: id, target_title: item.caption, target_thumbnail: item.thumbnail_url }).catch(() => {});
  return true;
}

async function togglePost(item: any): Promise<boolean> {
  const id: string = item.id;
  if (saveService.isPostSaved(id)) {
    saveService.unsavePost(id);
    await unsave('post', id).catch(() => {});
    return false;
  }
  saveService.savePost(item);
  await save({ target_type: 'post', target_id: id, target_title: item.body ?? item.caption, target_thumbnail: item.media_urls?.[0] }).catch(() => {});
  return true;
}

async function toggleCommunity(item: { id: string; name: string; avatar_url?: string | null; members_count?: number; description?: string | null }): Promise<boolean> {
  const id: string = item.id;
  if (saveService.isCommunitysaved(id)) {
    saveService.unsaveCommunity(id);
    await unsave('community', id).catch(() => {});
    return false;
  }
  saveService.saveCommunity(item);
  await save({ target_type: 'community', target_id: id, target_title: item.name, target_subtitle: item.description, target_thumbnail: item.avatar_url }).catch(() => {});
  return true;
}

// ── Sync au démarrage : charge les favoris serveur → MMKV ────────────────────
// Appelé une fois à l'init de l'app (optionnel).
async function syncFromServer(): Promise<void> {
  try {
    const all = await list();
    // On ne remplace pas les données locales riches, on s'assure juste
    // que les IDs marqués côté serveur sont aussi marqués localement.
    // Une implémentation plus avancée ferait un merge complet.
    for (const fav of all) {
      switch (fav.target_type as FavoriteType) {
        case 'event':
          if (!saveService.isEventSaved(fav.target_id)) {
            saveService.saveEvent({ id: fav.target_id, title: fav.target_title, thumbnail_url: fav.target_thumbnail } as any);
          }
          break;
        case 'concert':
          if (!saveService.isConcertSaved(fav.target_id)) {
            saveService.saveConcert({ id: fav.target_id, title: fav.target_title, thumbnail_url: fav.target_thumbnail } as any);
          }
          break;
        case 'reel':
          if (!saveService.isReelSaved(fav.target_id)) {
            saveService.saveReel({ id: fav.target_id, caption: fav.target_title, thumbnail_url: fav.target_thumbnail } as any);
          }
          break;
        case 'post':
          if (!saveService.isPostSaved(fav.target_id)) {
            saveService.savePost({ id: fav.target_id, body: fav.target_title } as any);
          }
          break;
        case 'community':
          if (!saveService.isCommunitysaved(fav.target_id)) {
            saveService.saveCommunity({ id: fav.target_id, name: fav.target_title ?? '', avatar_url: fav.target_thumbnail, description: fav.target_subtitle });
          }
          break;
      }
    }
  } catch {
    // Pas de réseau — on reste sur le cache local
  }
}

export const favoriteService = {
  list,
  save,
  unsave,
  check,
  syncFromServer,
  toggleEvent,
  toggleConcert,
  toggleReel,
  togglePost,
  toggleCommunity,
};
