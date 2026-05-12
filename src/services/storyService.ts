import { apiClient, Endpoints } from '../api';
import type { Story, StoryGroup, StoryCreate, StoryUpdate, StoryViewerUser } from '../types/story';
import { uploadService } from './uploadService';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';

export const storyService = {

  // ── Feed groupé (style WhatsApp) ──────────────────────────────────────────

  async getFeed(): Promise<StoryGroup[]> {
    const res = await apiClient.get<StoryGroup[]>(Endpoints.stories.feed);
    return Array.isArray(res.data) ? res.data : [];
  },

  // ── Mes stories ───────────────────────────────────────────────────────────

  async getMyStories(): Promise<Story[]> {
    const res = await apiClient.get<Story[]>(Endpoints.stories.me);
    return Array.isArray(res.data) ? res.data : [];
  },

  // ── Créer une story ───────────────────────────────────────────────────────

  async create(data: StoryCreate): Promise<Story> {
    const res = await apiClient.post<Story>(Endpoints.stories.create, data);
    return res.data;
  },

  // ── Upload + création en une étape ────────────────────────────────────────

  async pickAndCreate(source: 'gallery' | 'camera', caption?: string): Promise<Story | null> {
    const options = { mediaType: 'photo' as const, quality: 0.9 as const, selectionLimit: 1 };

    return new Promise((resolve, reject) => {
      const launch = source === 'camera' ? launchCamera : launchImageLibrary;
      launch(options, async (response) => {
        if (response.didCancel) { resolve(null); return; }
        if (response.errorCode) { reject(new Error(response.errorMessage)); return; }

        const asset = response.assets?.[0];
        if (!asset?.uri) { resolve(null); return; }

        try {
          // Upload vers Cloudinary
          const { assets } = await uploadService.pickAndUpload('stories', 1);
          if (!assets[0]) { resolve(null); return; }

          const story = await storyService.create({
            media_url: assets[0].url,
            media_type: 'image',
            thumbnail_url: assets[0].url,
            caption,
            duration_sec: 5,
          });
          resolve(story);
        } catch (err) {
          reject(err);
        }
      });
    });
  },

  // ── Marquer comme vue ─────────────────────────────────────────────────────

  async markViewed(storyId: string): Promise<void> {
    await apiClient.post(Endpoints.stories.view(storyId)).catch(() => {});
  },

  // ── Viewers d'une story ───────────────────────────────────────────────────

  async getViewers(storyId: string): Promise<StoryViewerUser[]> {
    const res = await apiClient.get<StoryViewerUser[]>(Endpoints.stories.viewers(storyId));
    return Array.isArray(res.data) ? res.data : [];
  },

  // ── Modifier ──────────────────────────────────────────────────────────────

  async edit(storyId: string, data: StoryUpdate): Promise<Story> {
    const res = await apiClient.patch<Story>(Endpoints.stories.edit(storyId), data);
    return res.data;
  },

  // ── Like / unlike ─────────────────────────────────────────────────────────

  async like(storyId: string): Promise<{ action: 'added' | 'removed'; like_count: number }> {
    const res = await apiClient.post<{ action: 'added' | 'removed'; like_count: number }>(
      Endpoints.stories.like(storyId),
    );
    return res.data;
  },

  // ── Répondre à une story (DM vers l'auteur) ──────────────────────────────

  async reply(storyId: string, text: string): Promise<void> {
    await apiClient.post(Endpoints.stories.reply(storyId), { text });
  },

  // ── Supprimer ─────────────────────────────────────────────────────────────

  async delete(storyId: string): Promise<void> {
    await apiClient.delete(Endpoints.stories.delete(storyId));
  },
};
