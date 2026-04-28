import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import type { Post, PostCreate } from '../types/post';

export const postService = {
  async getFeed(page = 1, limit = 20): Promise<Post[]> {
    const res = await apiClient.get<Post[]>(`${Endpoints.posts.feed}?page=${page}&limit=${limit}`);
    return res.data;
  },

  async getById(id: string): Promise<Post> {
    const res = await apiClient.get<Post>(Endpoints.posts.byId(id));
    return res.data;
  },

  async create(data: PostCreate): Promise<Post> {
    const res = await apiClient.post<Post>(Endpoints.posts.create, data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(Endpoints.posts.byId(id));
  },

  async react(id: string, type: 'like' | 'dislike'): Promise<{ action: string; reaction_type: string }> {
    const res = await apiClient.post<{ action: string; reaction_type: string }>(
      `${Endpoints.posts.react(id)}?reaction_type=${type}`
    );
    return res.data;
  },
};
