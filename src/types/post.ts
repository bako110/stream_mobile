export interface PostAuthor {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean;
  is_online?: boolean | null;
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
  hls_url?: string | null;
  thumbnail_url?: string | null;
  video_width?: number | null;
  video_height?: number | null;
  feeling?: string | null;
  link_url?: string | null;
  link_preview_title?: string | null;
  link_preview_description?: string | null;
  link_preview_image?: string | null;
  like_count: number;
  comment_count: number;
  share_count: number;
  comments_disabled: boolean;
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
  video_width?: number | null;
  video_height?: number | null;
  feeling?: string;
  mention_ids?: string[];
}
