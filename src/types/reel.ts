// Aligné sur models/reel.py, reaction.py, comment.py

export type ReelStatus = 'processing' | 'published' | 'archived';

export interface Reel {
  id: string;
  user_id: string;
  caption: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  status: ReelStatus;
  ref_content_id: string | null;
  ref_concert_id: string | null;
  ref_event_id: string | null;
  view_count: number;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  share_count: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  author?: import('./user').User;
  user_reaction?: 'like' | 'dislike' | null;
}

export interface CommentAuthor {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface Comment {
  id: string;
  user_id: string;
  content_id: string | null;
  concert_id: string | null;
  reel_id: string | null;
  event_id: string | null;
  body: string;
  is_edited: boolean;
  like_count: number;
  dislike_count?: number;
  reply_count?: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  author?: CommentAuthor | null;
}

export type ReactionType = 'like' | 'dislike';

export interface Reaction {
  id: string;
  user_id: string;
  reaction_type: ReactionType;
  content_id: string | null;
  concert_id: string | null;
  reel_id: string | null;
  created_at: string;
}

export interface CommentCreate {
  body: string;
  reel_id?: string;
  content_id?: string;
  
  concert_id?: string;
  event_id?: string;
  parent_id?: string;
}

export interface ReactionCounts {
  likes: number;
  dislikes: number;
}

export interface ShareCreate {
  platform: string;
  reel_id?: string;
  content_id?: string;
  concert_id?: string;
  event_id?: string;
}

export interface ShareCounts {
  [platform: string]: number;
  total: number;
}
