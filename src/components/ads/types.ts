/**
 * Type unique pour tous les encarts publicitaires (Feed / Reels / Stories /
 * Recherche). Remplace les 4 types AdData locaux quasi identiques.
 *
 * Shape = réponse de GET /api/v1/ads/feed/next (voir _serialize côté backend).
 */
import { Linking } from 'react-native';
import { callPhone, openWhatsapp } from '../../utils/phoneMenu';

export interface AdData {
  id: string;
  title: string;
  description?: string;
  cta_text?: string;
  cta_url?: string;
  creative_url?: string;
  thumbnail_url?: string;
  // Contact direct — numéro unique, utilisable pour l'appel et/ou WhatsApp selon
  // ce que l'annonceur a coché à la création (pas exclusif, les deux possibles).
  contact_phone?: string | null;
  contact_call?: boolean;
  contact_whatsapp?: boolean;
  format?: string;
  advertiser_id?: string;
  advertiser_name?: string;
  advertiser_logo?: string;
}

/** La pub a un contact direct configuré (numéro + au moins un canal coché). */
export function adHasContact(a: Pick<AdData, 'contact_phone' | 'contact_call' | 'contact_whatsapp'>): boolean {
  return !!(a.contact_phone ?? '').trim() && !!(a.contact_call || a.contact_whatsapp);
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
export function adCtaLabel(a: Pick<AdData, 'cta_text' | 'cta_url' | 'contact_phone' | 'contact_call' | 'contact_whatsapp'>): { text: string; icon: string } {
  const hasContact = adHasContact(a);
  if (a.cta_text) return { text: a.cta_text, icon: hasContact || adIsPhone(a.cta_url) ? 'phone' : adIsAppStore(a.cta_url) ? 'download' : 'arrow-right' };
  if (hasContact) return { text: 'Contactez-nous', icon: 'phone' };
  if (adIsPhone(a.cta_url)) return { text: 'Contactez-nous', icon: 'phone' };
  if (adIsAppStore(a.cta_url)) return { text: 'Installer', icon: 'download' };
  return { text: 'En savoir plus', icon: 'arrow-right' };
}

export type AdButtonAction = 'call' | 'whatsapp' | 'link';

export interface AdButton {
  text: string;
  // 'feather' = react-native-vector-icons/Feather, 'mci' = MaterialCommunityIcons
  // (Feather n'a pas d'icône WhatsApp — MaterialCommunityIcons si et seulement
  // si l'action est 'whatsapp').
  icon: string;
  iconSet: 'feather' | 'mci';
  action: AdButtonAction;
}

/**
 * Bouton(s) à afficher pour une pub — reflète EXACTEMENT ce que l'annonceur a
 * configuré, jamais un menu caché derrière un clic unique :
 *   - contact_call ET contact_whatsapp cochés → 2 boutons distincts, un par canal
 *   - un seul des deux coché → 1 bouton qui nomme directement ce canal
 *   - aucun contact direct → 1 bouton générique (cta_text/lien/store/numéro brut
 *     détecté dans cta_url, logique historique via adCtaLabel/adIsPhone)
 */
export function adContactButtons(a: Pick<AdData, 'cta_text' | 'cta_url' | 'contact_phone' | 'contact_call' | 'contact_whatsapp'>): AdButton[] {
  if (adHasContact(a)) {
    const buttons: AdButton[] = [];
    if (a.contact_call)     buttons.push({ text: 'Appeler',                 icon: 'phone',    iconSet: 'feather', action: 'call' });
    if (a.contact_whatsapp) buttons.push({ text: 'Contacter sur WhatsApp',  icon: 'whatsapp', iconSet: 'mci',     action: 'whatsapp' });
    // Un seul bouton effectif (l'autre canal désactivé) : texte générique du
    // cta_text explicite de l'annonceur prime toujours s'il existe.
    if (buttons.length === 1 && a.cta_text) buttons[0].text = a.cta_text;
    return buttons;
  }
  if (adIsPhone(a.cta_url)) {
    return [{ text: a.cta_text || 'Appeler', icon: 'phone', iconSet: 'feather', action: 'call' }];
  }
  const { text, icon } = adCtaLabel(a);
  return [{ text, icon, iconSet: 'feather', action: 'link' }];
}

/** Exécute l'action d'un AdButton — un seul point d'implémentation pour les 4 écrans. */
export function runAdButton(button: AdButton, a: Pick<AdData, 'cta_url' | 'contact_phone'>): void {
  if (button.action === 'call') { callPhone((a.contact_phone ?? a.cta_url ?? '').trim()); return; }
  if (button.action === 'whatsapp') { openWhatsapp((a.contact_phone ?? '').trim()); return; }
  const url = (a.cta_url ?? '').trim();
  if (url) Linking.openURL(url).catch(() => {});
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
