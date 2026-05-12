export interface PostAuthor {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean;
}

export interface Post {
  id: string;
  user_id: string;
  body?: string | null;
  caption?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  media_urls?: string[] | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  feeling?: string | null;
  like_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  updated_at: string;
  author?: PostAuthor | null;
  user_reaction?: 'like' | 'dislike' | null;
}

export interface PostCreate {
  body?: string;
  image_url?: string;
  image_urls?: string[];
  video_url?: string;
  thumbnail_url?: string;
  feeling?: string;
}
