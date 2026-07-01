import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import { authService } from './authService';

export interface SoundOut {
  id: string;
  title: string;
  artist_name: string | null;
  duration_seconds: number | null;
  file_url: string;
  cover_url: string | null;
  usage_count: number;
  is_original: boolean;
  created_at: string;
}

export const soundService = {
  /**
   * Uploade un fichier audio local (enregistrement vocal ou fichier choisi) vers
   * le catalogue de sons partagé — le rend recherchable/réutilisable ensuite.
   * Déduplication par hash côté serveur : ré-uploader le même fichier renvoie
   * l'entrée existante sans dupliquer.
   */
  async uploadFromUri(uri: string, filename?: string, title?: string): Promise<SoundOut | null> {
    try {
      const name = filename ?? uri.split('/').pop() ?? 'son.m4a';
      const ext  = name.split('.').pop()?.toLowerCase() ?? 'm4a';
      const mime = ext === 'mp3' ? 'audio/mpeg'
        : ext === 'wav' ? 'audio/wav'
        : ext === 'ogg' ? 'audio/ogg'
        : ext === 'aac' ? 'audio/aac'
        : 'audio/mp4';

      // Artiste par défaut = utilisateur courant (sinon reste "Inconnu" côté affichage)
      let artistName: string | undefined;
      try {
        const me = await authService.getMe();
        artistName = me?.display_name ?? me?.username ?? undefined;
      } catch {}

      const form = new FormData();
      form.append('file', { uri, name, type: mime } as any);
      if (title) form.append('title', title);
      if (artistName) form.append('artist_name', artistName);

      const res = await apiClient.upload<SoundOut>(Endpoints.sounds.upload, form);
      return res.data;
    } catch {
      // Non-bloquant : l'échec d'upload au catalogue ne doit jamais empêcher
      // l'utilisateur de publier son reel/story avec le son en local.
      return null;
    }
  },
};
