/**
 * Type unique pour tous les encarts publicitaires (Feed / Reels / Stories /
 * Recherche). Remplace les 4 types AdData locaux quasi identiques.
 *
 * Shape = réponse de GET /api/v1/ads/feed/next (voir _serialize côté backend).
 */
export interface AdData {
  id: string;
  title: string;
  description?: string;
  cta_text?: string;
  cta_url?: string;
  creative_url?: string;
  thumbnail_url?: string;
  format?: string;
  advertiser_id?: string;
  advertiser_name?: string;
  advertiser_logo?: string;
}

/** Détecte une vidéo à l'extension d'URL (le champ `format` du backend n'est pas fiable). */
export function adIsVideo(a: Pick<AdData, 'creative_url'>): boolean {
  const u = a.creative_url ?? '';
  return u.includes('.m3u8') || u.includes('.mp4') || u.includes('/hls/') || u.includes('video');
}

/** Domaine lisible depuis cta_url (sans www.), sinon chaîne vide. */
export function adDomain(a: Pick<AdData, 'cta_url'>): string {
  const raw = (a.cta_url ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

/** cta_url est un numéro de téléphone brut plutôt qu'une URL web. */
export function adIsPhone(cta?: string): boolean {
  const raw = (cta ?? '').trim();
  if (!raw) return false;
  return !/^https?:\/\//i.test(raw) && /^[+()\d\s.-]{6,}$/.test(raw.replace(/^tel:/i, ''));
}

/** Nom affiché de l'annonceur : le nom réel si le backend l'a fourni, sinon le domaine. */
export function adAdvertiserLabel(a: AdData): string {
  return (a.advertiser_name ?? '').trim() || adDomain(a) || a.title;
}

/** Initiales pour le fallback logo (2 lettres max). */
export function adInitials(a: AdData): string {
  const label = adAdvertiserLabel(a);
  return label
    .split(/[\s.-]+/)
    .map(w => w[0] ?? '')
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}
