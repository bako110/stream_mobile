import { apiClient, Endpoints } from '../api';
import type {
  Comment, CommentCreate, ReactionType,
  ReactionCounts, ShareCreate, ShareCounts,
} from '../types';

// Cache TTL 30s pour éviter le N+1 reactions/me au remount de chaque FeedCard
const _reactionCache = new Map<string, { value: ReactionType | null; expiresAt: number }>();
const REACTION_TTL = 30_000;

function _reactionCacheKey(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

export function invalidateReactionCache(params: Record<string, string | undefined>): void {
  _reactionCache.delete(_reactionCacheKey(params));
}

export const socialService = {
  // ── Commentaires ──────────────────────────────────────────────────────────
  async getComments(params: {
    reel_id?: string;
    content_id?: string;
    concert_id?: string;
    event_id?: string;
    post_id?: string;
    page?: number;
    limit?: number;
  }): Promise<Comment[]> {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    const res = await apiClient.get<Comment[]>(`${Endpoints.social.comments}?${q}`);
    return res.data;
  },

  async getReplies(commentId: string): Promise<Comment[]> {
    const res = await apiClient.get<Comment[]>(Endpoints.social.commentReplies(commentId));
    return res.data;
  },

  async createComment(data: CommentCreate): Promise<Comment> {
    const res = await apiClient.post<Comment>(Endpoints.social.comments, data);
    return res.data;
  },

  async updateComment(commentId: string, body: string): Promise<Comment> {
    const res = await apiClient.put<Comment>(Endpoints.social.commentById(commentId), { body });
    return res.data;
  },

  async deleteComment(commentId: string): Promise<void> {
    await apiClient.delete(Endpoints.social.commentById(commentId));
  },

  // ── Réactions ─────────────────────────────────────────────────────────────
  async toggleReaction(data: {
    reaction_type: ReactionType;
    reel_id?: string;
    content_id?: string;
    concert_id?: string;
    event_id?: string;
    comment_id?: string;
  }): Promise<{ action: string }> {
    const res = await apiClient.post<{ action: string }>(Endpoints.social.toggleReaction, data);
    // Invalider le cache pour cet item après un toggle
    const { reaction_type: _rt, comment_id: _cid, ...cacheParams } = data;
    invalidateReactionCache(cacheParams);
    return res.data;
  },

  async getMyReaction(params: {
    reel_id?: string;
    content_id?: string;
    concert_id?: string;
    event_id?: string;
  }): Promise<{ reaction_type: ReactionType | null }> {
    const cacheKey = _reactionCacheKey(params);
    const cached = _reactionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { reaction_type: cached.value };
    }
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    const res = await apiClient.get<{ reaction_type: ReactionType | null }>(
      `${Endpoints.social.myReaction}?${q}`
    );
    _reactionCache.set(cacheKey, { value: res.data.reaction_type, expiresAt: Date.now() + REACTION_TTL });
    return res.data;
  },

  async getReactionCounts(params: {
    reel_id?: string;
    content_id?: string;
    concert_id?: string;
    event_id?: string;
  }): Promise<ReactionCounts> {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    const res = await apiClient.get<ReactionCounts>(`${Endpoints.social.reactionCounts}?${q}`);
    return res.data;
  },

  // ── Partages ──────────────────────────────────────────────────────────────
  async share(data: ShareCreate): Promise<void> {
    await apiClient.post(Endpoints.social.share, data);
  },

  async getShareCounts(params: {
    reel_id?: string;
    content_id?: string;
    concert_id?: string;
    event_id?: string;
  }): Promise<ShareCounts> {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    const res = await apiClient.get<ShareCounts>(`${Endpoints.social.shareCounts}?${q}`);
    return res.data;
  },
};
