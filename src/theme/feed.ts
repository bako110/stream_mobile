/**
 * Tokens de layout du Feed — une seule source pour toutes les cartes et sections
 * du fil d'accueil.
 *
 * Modèle de carte : "carte douce" — flottante, marge latérale 12, radius 16,
 * ombre légère, bordure hairline. Le média a son propre radius (12) avec un
 * padding autour, jamais collé aux bords.
 *
 * Ne JAMAIS remettre de valeurs numériques de radius/spacing en dur dans le feed :
 * importer d'ici.
 */
import { Spacing, BorderRadius } from './spacing';
import { FontSize, FontWeight, LineHeight } from './typography';

// ── Carte de feed (PostCard, FeedCard, encarts communities/reels, pub) ────────
export const FeedCardLayout = {
  // Carte flottante : marge latérale + radius + ombre.
  marginHorizontal: Spacing[3],   // 12
  radius:           BorderRadius.lg,  // 16
  // Espace vertical entre deux cartes.
  gutter:           Spacing[3],   // 12
  // Padding intérieur : le contenu (texte, header auteur, barre d'actions) est
  // en retrait des bords arrondis de la carte.
  padH:             Spacing[3],   // 12
  padV:             Spacing[3],   // 12
  // Bordure hairline + ombre — appliquées via getFeedCardStyle(colors).
  borderWidth:      1,
};

// ── Échelle de border-radius du feed — 3 valeurs, rien d'autre ────────────────
export const FeedRadius = {
  chip:  BorderRadius.sm,   // 8  — filtres, petits badges
  media: BorderRadius.md,   // 12 — thumbnails, vignettes, média des posts
  card:  BorderRadius.lg,   // 16 — carte de feed elle-même
  full:  BorderRadius.full, // avatars, pastilles de compteur
};

// ── Style de carte prêt à l'emploi — fond + bordure + ombre douce ─────────────
// À épandre : <View style={[getFeedCardStyle(colors), extra]} />
export const getFeedCardStyle = (colors: {
  surface: string; border: string; shadowNeutral: string;
}) => ({
  backgroundColor:  colors.surface,
  marginHorizontal: FeedCardLayout.marginHorizontal,
  marginBottom:     FeedCardLayout.gutter,
  borderRadius:     FeedCardLayout.radius,
  borderWidth:      FeedCardLayout.borderWidth,
  borderColor:      colors.border,
  overflow:         'hidden' as const,
  // Ombre douce — RN : iOS via shadow*, Android via elevation.
  shadowColor:      '#000',
  shadowOffset:     { width: 0, height: 2 },
  shadowOpacity:    0.06,
  shadowRadius:     8,
  elevation:        2,
});

// ── Carrousels horizontaux (lives, near-by, reels row) ───────────────────────
export const FeedCarousel = {
  cardW:     132,            // largeur unique de toutes les vignettes de carrousel
  cardH:     176,
  gap:       Spacing[2],     // 8
  padH:      Spacing[4],     // 16
};

// ── Story ────────────────────────────────────────────────────────────────────
export const StoryCard = {
  w:      72,
  h:      100,
  radius: FeedRadius.media,
  gap:    Spacing[2],
};

// ── Typo de titre de section — UN seul style partout (Typography.h5 aligné) ───
export const SectionTitleStyle = {
  fontSize:   FontSize.md,          // 16
  fontWeight: FontWeight.bold,      // 700
  lineHeight: FontSize.md * LineHeight.snug,
};

// ── Barre d'actions d'une carte (like / comment / share / save) ──────────────
export const FeedActionIcon = {
  size:       22,                   // cible visible, conventionnelle (FB/IG)
};
