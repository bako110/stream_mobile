// Centralisation des assets — utiliser uniquement via cet index

export const Images = {
  // Logos Gofolyx — light/dark selon le thème
  logoLight: require('./images/stream_logo_light.png'),
  logoDark:  require('./images/stream_logo_dark.png'),

  // Fond décoratif de l'écran de conversation — light/dark selon le thème
  chatBackgroundLight: require('./images/ligth_backround.png'),
  chatBackgroundDark:  require('./images/dark_backround.png'),

  // Illustrations Live Matchs — cartes "1 vs 1" (boxeurs face à face) et
  // "Tournois" (bracket de compétition), affichées dans LiveMatchesHubScreen.
  liveMatches1v1:        require('./images/1vs1.jpeg'),
  liveMatchesTournament: require('./images/competition.jpeg'),

  // Placeholders
  // thumbPlaceholder: require('./images/thumb_placeholder.png'),
  // avatarPlaceholder: require('./images/avatar_placeholder.png'),
} as const;

export type ImageKey = keyof typeof Images;

// Helper : retourne le bon logo selon le thème
export const getLogo = (isDark: boolean) =>
  isDark ? Images.logoDark : Images.logoLight;

// Helper : retourne le bon fond de conversation selon le thème
export const getChatBackground = (isDark: boolean) =>
  isDark ? Images.chatBackgroundDark : Images.chatBackgroundLight;
