import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import type { Post, PostCreate } from '../types/post';

export const postService = {
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
