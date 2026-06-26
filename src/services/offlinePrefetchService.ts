/**
 * offlinePrefetchService — pre-charge en arriere-plan toutes les donnees
 * necessaires pour un mode offline complet :
 *   - conversations + leurs messages
 *   - communities rejointes + leurs messages de discussion
 *
 * Appele une seule fois au demarrage de l'app (MainNavigator).
 * Toujours silencieux : aucune erreur ne remonte vers l'UI.
 */
import { messageService }      from './messageService';
import { communityService }    from './communityService';
import { offlineCacheService } from './offlineCacheService';
import { storyService }        from './storyService';
import { cacheInBackground }   from './videoCacheService';

// Delai avant de commencer (laisse le temps a l'UI de s'afficher)
const INITIAL_DELAY_MS = 3000;

// Batch size pour ne pas flood le backend
const BATCH = 3;

let _running = false;

async function _batchFetch<T>(
  ids: string[],
  fetcher: (id: string) => Promise<T | null>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await Promise.all(batch.map(id => fetcher(id).catch(() => null)));
  }
}

async function _prefetchConversations(): Promise<void> {
  try {
    const convs = await messageService.getConversations();
    if (convs.length > 0) {
      offlineCacheService.saveConversations(convs as any);
    }
    // Messages de chaque conversation
    await _batchFetch(
      convs.map(c => c.partner_id).filter(Boolean) as string[],
      async (partnerId) => {
        // Skip si deja en cache frais
        const existing = offlineCacheService.getMessages(partnerId);
        if (existing && existing.length > 0) return null;
        const msgs = await messageService.getMessages(partnerId, 1, 30);
        if (msgs && msgs.length > 0) {
          offlineCacheService.saveMessages(partnerId, msgs);
        }
        return msgs;
      },
    );
  } catch {}
}

async function _prefetchMyStories(): Promise<void> {
  try {
    const stories = await storyService.getMyStories();
    if (stories.length > 0) {
      offlineCacheService.saveMyStories(stories);
      // Pre-cache les vidéos en arriere-plan — utilise mp4_url si dispo (cacheable), sinon ignore HLS
      stories.forEach(st => {
        const videoUrl = st.mp4_url ?? (st.media_url && !st.media_url.includes('.m3u8') ? st.media_url : null);
        if (st.media_type === 'video' && videoUrl) {
          cacheInBackground(videoUrl).catch(() => {});
        }
      });
    }
  } catch {}
}

async function _prefetchCommunities(): Promise<void> {
  try {
    const communities = await communityService.mine();
    if (communities.length > 0) {
      offlineCacheService.saveCommunityList(communities.map(c => ({
        id:             String(c.id),
        name:           c.name,
        description:    c.description ?? null,
        avatar_url:     c.avatar_url ?? null,
        members_count:  c.members_count ?? 0,
        is_private:     c.is_private ?? false,
      })));
    }
    // Messages de discussion de chaque community
    await _batchFetch(
      communities.map(c => String(c.id)),
      async (communityId) => {
        // Skip si deja en cache frais
        const existing = offlineCacheService.getCommunityMessages(communityId);
        if (existing && existing.length > 0) return null;
        const msgs = await communityService.getMessages(communityId, 1, 30, undefined, 'announcement,poll');
        if (msgs && msgs.length > 0) {
          // getMessages retourne plus recent en premier, on inverse pour affichage chronologique
          const sorted = [...msgs].reverse();
          offlineCacheService.saveCommunityMessages(communityId, sorted);
        }
        return msgs;
      },
    );
  } catch {}
}

/**
 * Lance le pre-chargement complet en arriere-plan.
 * Idempotent : un seul run a la fois.
 */
export function startOfflinePrefetch(): void {
  if (_running) return;
  _running = true;

  setTimeout(async () => {
    try {
      // Tout en parallele au démarrage
      await Promise.all([
        _prefetchConversations(),
        _prefetchCommunities(),
        _prefetchMyStories(),
      ]);
    } catch {}
    finally { _running = false; }
  }, INITIAL_DELAY_MS);
}
