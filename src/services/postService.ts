import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import type { Post, PostCreate } from '../types/post';

export const postService = {
  async getFeed(page = 1, limit = 20, following = false): Promise<Post[]> {
    const q = `page=${page}&limit=${limit}${following ? '&following=true' : ''}`;
    const res = await apiClient.get<Post[]>(`${Endpoints.posts.feed}?${q}`);
    if (__DEV__) console.log('[postService] getFeed result:', JSON.stringify(res.data).slice(0, 200));
    return Array.isArray(res.data) ? res.data : [];
  },

  async getById(id: string): Promise<Post> {
    const res = await apiClient.get<Post>(Endpoints.posts.byId(id));
    return res.data;
  },

  async create(data: PostCreate): Promise<Post> {
    const res = await apiClient.post<Post>(Endpoints.posts.create, data);
    return res.data;
  },

  async update(id: string, data: { body?: string; feeling?: string }): Promise<Post> {
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
};
