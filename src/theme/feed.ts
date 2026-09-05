/**
 * Tokens de layout du Feed — une seule source pour toutes les cartes et sections
 * du fil d'accueil. Objectif : un modèle de carte unique (pleine largeur, radius 0,
 * séparées par une gouttière de fond) et une échelle de border-radius à 3 valeurs.
 *
 * Ne JAMAIS remettre de valeurs numériques de radius/spacing en dur dans le feed :
 * importer d'ici.
 */
import { Spacing, BorderRadius } from './spacing';
import { FontSize, FontWeight, LineHeight } from './typography';

// ── Carte de feed (PostCard, FeedCard, encarts communities/reels, pub) ────────
export const FeedCardLayout = {
  // Pleine largeur, pas de marge latérale, pas de radius : le feed est une pile
  // de bandes séparées par `gutter` px de couleur `colors.feedGutter`.
  marginHorizontal: 0,
  radius:           0,
  // Espace vertical entre deux cartes — rendu via marginBottom + fond de la liste,
  // PAS via un ItemSeparatorComponent coloré (qui créait une bande parasite).
  gutter:           Spacing[2],   // 8
  padH:             Spacing[3],   // 12  — padding horizontal du contenu texte
  padV:             Spacing[2],   // 8
};

// ── Échelle de border-radius du feed — 3 valeurs, rien d'autre ────────────────
export const FeedRadius = {
  chip:  BorderRadius.sm,   // 8  — filtres, petits badges
  media: BorderRadius.md,   // 12 — thumbnails, vignettes, boutons
  full:  BorderRadius.full, // avatars, pastilles de compteur
};

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
