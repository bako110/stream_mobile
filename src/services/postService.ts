import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import type { Post, PostCreate } from '../types/post';

export interface PostFeedCursor {
  created_at: string;
  id:         string;
}

export interface PostFeedPage {
  items:       Post[];
  has_more:    boolean;
  next_cursor: PostFeedCursor | null;
}

export const postService = {
  /**
   * Feed paginé par curseur (created_at + id) — pas par numéro de page : le tri du
   * backend dépend du temps (fraîcheur/boost), donc "page=N" ne serait pas stable d'un
   * appel à l'autre. Passer `cursor` = next_cursor de l'appel précédent pour continuer.
   */
  async getFeed(limit = 20, following = false, cursor?: PostFeedCursor | null): Promise<PostFeedPage> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (following) params.set('following', 'true');
    if (cursor) {
      params.set('cursor_created_at', cursor.created_at);
      params.set('cursor_id', cursor.id);
    }
    const res = await apiClient.get<PostFeedPage | Post[]>(`${Endpoints.posts.feed}?${params.toString()}`);
    const data = res.data;
    if (__DEV__) console.log('[postService] getFeed result:', JSON.stringify(data).slice(0, 200));
    // Compat défensive si le backend renvoie encore un tableau brut (ne devrait plus arriver)
    if (Array.isArray(data)) {
      return { items: data, has_more: data.length >= limit, next_cursor: null };
    }
    return {
      items:       Array.isArray(data?.items) ? data.items : [],
      has_more:    data?.has_more ?? false,
      next_cursor: data?.next_cursor ?? null,
    };
  },

  async getById(id: string): Promise<Post> {
    const res = await apiClient.get<Post>(Endpoints.posts.byId(id));
    return res.data;
  },

  /** Capture analytics — best-effort, ne bloque jamais l'affichage si ça échoue. */
  async recordView(id: string): Promise<void> {
    try { await apiClient.post(Endpoints.posts.view(id)); } catch { /* silencieux */ }
  },

  async create(data: PostCreate): Promise<Post> {
    const res = await apiClient.post<Post>(Endpoints.posts.create, data);
    return res.data;
  },

  async update(id: string, data: { body?: string; feeling?: string; music_url?: string | null; music_title?: string | null }): Promise<Post> {
    const res = await apiClient.put<Post>(Endpoints.posts.update(id), data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(Endpoints.posts.byId(id));
  },

  async getByUser(userId: string, page = 1, limit = 20): Promise<Post[]> {
    const res = await apiClient.get<Post[]>(`${Endpoints.posts.byUser(userId)}?page=${page}&limit=${limit}`);
    return Array.isArray(res.data) ? res.data : [];
  },

  async react(id: string, type: 'like' | 'dislike'): Promise<{ action: string; reaction_type: string }> {
    const res = await apiClient.post<{ action: string; reaction_type: string }>(
      `${Endpoints.posts.react(id)}?reaction_type=${type}`
    );
    return res.data;
  },

  async getLikers(id: string, page = 1, limit = 30): Promise<PostLiker[]> {
    try {
      const res = await apiClient.get<PostLiker[] | { data: PostLiker[] }>(
        `${Endpoints.posts.likers(id)}?page=${page}&limit=${limit}`
      );
      const raw = res.data;
      return Array.isArray(raw) ? raw : Array.isArray((raw as any)?.data) ? (raw as any).data : [];
    } catch { return []; }
  },
};

export interface PostLiker {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean;
  is_following?: boolean;
  bio?: string | null;
}
