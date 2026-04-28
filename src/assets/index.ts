// Centralisation des assets — utiliser uniquement via cet index

export const Images = {
  // Logos FoliX — light/dark selon le thème
  logoLight: require('./images/stream_logo_light.png'),
  logoDark:  require('./images/stream_logo_dark.png'),

  // Placeholders
  // thumbPlaceholder: require('./images/thumb_placeholder.png'),
  // avatarPlaceholder: require('./images/avatar_placeholder.png'),
} as const;

export type ImageKey = keyof typeof Images;

// Helper : retourne le bon logo selon le thème
export const getLogo = (isDark: boolean) =>
  isDark ? Images.logoDark : Images.logoLight;
