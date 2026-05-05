export type StoryMediaType = 'image' | 'video' | 'text' | 'audio' | 'voice';

export interface StoryAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string | null;
  media_type: StoryMediaType;
  thumbnail_url: string | null;
  caption: string | null;
  duration_sec: number;
  view_count: number;
  like_count: number;
  liked_by_me: boolean;
  is_active: boolean;
  expires_at: string;
  created_at: string;
  background_color: string | null;
  audio_url: string | null;
  font_style: string | null;
  author: StoryAuthor | null;
  viewed_by_me: boolean;
}

export interface StoryGroup {
  user: StoryAuthor;
  stories: Story[];
  has_unseen: boolean;
}

export interface StoryCreate {
  media_url?: string;
  media_type: StoryMediaType;
  thumbnail_url?: string;
  caption?: string;
  duration_sec?: number;
  background_color?: string;
  audio_url?: string;
  font_style?: string;
}

export interface StoryUpdate {
  caption?: string;
  background_color?: string;
  duration_sec?: number;
  font_style?: string;
}

export interface StoryViewerUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  viewed_at: string;
}
