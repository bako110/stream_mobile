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

/**
 * cta_url pointe vers une fiche Play Store (Android) ou App Store (iOS) —
 * le CTA s'adapte alors automatiquement ("Installer" + icône téléchargement),
 * comme Facebook Ads le fait pour les pubs d'installation d'app.
 */
export function adIsAppStore(cta?: string): boolean {
  const raw = (cta ?? '').trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.includes('play.google.com/store/apps') ||
    raw.includes('apps.apple.com') ||
    raw.includes('itunes.apple.com')
  );
}

/**
 * Libellé + icône du bouton CTA — s'adapte au type de lien plutôt que de
 * toujours afficher un texte générique : "Appeler" pour un numéro,
 * "Installer" pour un lien de store, "En savoir plus" par défaut (ou le
 * cta_text explicite fourni par l'annonceur, qui reste toujours prioritaire).
 */
export function adCtaLabel(a: Pick<AdData, 'cta_text' | 'cta_url'>): { text: string; icon: string } {
  if (a.cta_text) return { text: a.cta_text, icon: adIsPhone(a.cta_url) ? 'phone' : adIsAppStore(a.cta_url) ? 'download' : 'arrow-right' };
  if (adIsPhone(a.cta_url)) return { text: 'Contactez-nous', icon: 'phone' };
  if (adIsAppStore(a.cta_url)) return { text: 'Installer', icon: 'download' };
  return { text: 'En savoir plus', icon: 'arrow-right' };
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
