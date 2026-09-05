// Palette alignée sur stream_web (index.css tokens)
// Pas de rgba — valeurs hex opaques partout sauf overlay/shadow (inévitables)

export const LightColors = {
  // ── Backgrounds ───────────────────────────────────────────────────────────
  background:          '#F2F2F8',   // --bg
  backgroundSecondary: '#E8E7F4',   // --bg-secondary
  backgroundTertiary:  '#DDDCEA',   // --bg-tertiary
  surface:             '#FFFFFF',   // --surface
  surfaceElevated:     '#FFFFFF',   // --surface-elevated

  // ── Brand Gofolyx ─────────────────────────────────────────────────────────
  primary:             '#7B3FF2',   // --primary
  primaryLight:        '#A67CF7',   // --primary-light
  primaryDark:         '#5A1ED9',
  gradientStart:       '#7B3FF2',
  gradientEnd:         '#E0389A',

  // ── Accents ───────────────────────────────────────────────────────────────
  accentOrange:        '#FF7A2F',
  accentOrangeLight:   '#FFB07A',
  accentGreen:         '#36D9A0',
  accentGreenLight:    '#7EEEC8',

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary:         '#0E0D1F',   // --text-primary
  textSecondary:       '#4E4C6A',   // --text-secondary
  textTertiary:        '#9290AE',   // --text-tertiary
  textDisabled:        '#C5C3D8',
  textInverse:         '#FFFFFF',
  textOnBrand:         '#FFFFFF',

  // ── Status ────────────────────────────────────────────────────────────────
  success:             '#36D9A0',
  successBg:           '#E6FBF4',
  warning:             '#FF7A2F',
  warningBg:           '#FFF2EA',
  error:               '#F0365A',
  errorBg:             '#FDEAEE',
  info:                '#3B82F6',
  infoBg:              '#EFF6FF',

  // ── UI ────────────────────────────────────────────────────────────────────
  border:              '#E0DFF0',   // --border
  borderLight:         '#EEEEF8',
  divider:             '#E8E7F4',
  overlay:             '#00000066', // 40% opaque — évite rgba()
  shadow:              '#7B3FF219', // ~10%
  shadowNeutral:       '#0000000F', // ~6%
  ripple:              '#7B3FF21E', // ~12%

  // ── Gofolyx spécifique ────────────────────────────────────────────────────
  liveTag:             '#F0365A',
  livePulse:           '#F0365A4D', // 30%
  premiumTag:          '#FF7A2F',
  premiumGradientStart:'#FF7A2F',
  premiumGradientEnd:  '#E0389A',
  subscriptionFree:    '#9290AE',
  subscriptionBasic:   '#3B82F6',
  subscriptionPremium: '#7B3FF2',
  subscriptionFamily:  '#36D9A0',
  viewerCount:         '#FF7A2F',
  concertCard:         '#FFFFFF',
  reelCard:            '#F2F2F8',
  tabBar:              '#FFFFFF',
  tabBarBorder:        '#E0DFF0',
  tabActive:           '#7B3FF2',
  tabInactive:         '#9290AE',
  inputBg:             '#F4F4FB',   // --input-bg
  inputBorder:         '#E0DFF0',
  inputBorderFocus:    '#7B3FF2',
  skeleton:            '#E8E7F4',
  skeletonHighlight:   '#F2F2F8',
  cardBg:              '#FFFFFF',
  badgeBg:             '#7B3FF2',
  badgeText:           '#FFFFFF',

  // ── Feed ──────────────────────────────────────────────────────────────────
  mediaPlaceholder:    '#E8E7F4',   // fond derrière une image/vidéo en cours de chargement
  likeActive:          '#F0365A',   // cœur "aimé" — rouge, jamais le violet de marque
  feedGutter:          '#E8E7F4',   // gouttière entre deux cartes du feed
};

export const DarkColors = {
  // ── Backgrounds ───────────────────────────────────────────────────────────
  background:          '#07070F',   // --bg  (web dark exact)
  backgroundSecondary: '#0F0F1E',   // --bg-secondary
  backgroundTertiary:  '#161628',   // --bg-tertiary
  surface:             '#0F0F1E',   // --surface
  surfaceElevated:     '#161628',   // --surface-elevated

  // ── Brand Gofolyx ─────────────────────────────────────────────────────────
  primary:             '#9B65F5',   // --primary dark
  primaryLight:        '#BFA0F8',   // --primary-light dark
  primaryDark:         '#7B3FF2',
  gradientStart:       '#9B65F5',
  gradientEnd:         '#E85DAD',

  // ── Accents ───────────────────────────────────────────────────────────────
  accentOrange:        '#FF8C4A',
  accentOrangeLight:   '#FFB07A',
  accentGreen:         '#3FEDB6',
  accentGreenLight:    '#7EEEC8',

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary:         '#F0EFF8',   // --text-primary dark
  textSecondary:       '#A09DC0',   // --text-secondary dark
  textTertiary:        '#5C5A78',   // --text-tertiary dark (aligné web)
  textDisabled:        '#2E2C48',
  textInverse:         '#0E0D1F',
  textOnBrand:         '#FFFFFF',

  // ── Status ────────────────────────────────────────────────────────────────
  success:             '#3FEDB6',
  successBg:           '#0D2A22',
  warning:             '#FF8C4A',
  warningBg:           '#2A1A0D',
  error:               '#F25270',
  errorBg:             '#2A0D13',
  info:                '#60A5FA',
  infoBg:              '#0D1A2A',

  // ── UI ────────────────────────────────────────────────────────────────────
  border:              '#1E1D35',   // --border dark (aligné web)
  borderLight:         '#161628',
  divider:             '#161628',
  overlay:             '#000000BF', // 75%
  shadow:              '#7B3FF233', // ~20%
  shadowNeutral:       '#00000066', // ~40%
  ripple:              '#9B65F526', // ~15%

  // ── Gofolyx spécifique ────────────────────────────────────────────────────
  liveTag:             '#F25270',
  livePulse:           '#F2527059', // 35%
  premiumTag:          '#FF8C4A',
  premiumGradientStart:'#FF8C4A',
  premiumGradientEnd:  '#E85DAD',
  subscriptionFree:    '#5C5A78',
  subscriptionBasic:   '#60A5FA',
  subscriptionPremium: '#9B65F5',
  subscriptionFamily:  '#3FEDB6',
  viewerCount:         '#FF8C4A',
  concertCard:         '#0F0F1E',
  reelCard:            '#161628',
  tabBar:              '#07070F',
  tabBarBorder:        '#1E1D35',
  tabActive:           '#9B65F5',
  tabInactive:         '#5C5A78',
  inputBg:             '#0F0F1E',   // --input-bg dark
  inputBorder:         '#1E1D35',
  inputBorderFocus:    '#9B65F5',
  skeleton:            '#161628',
  skeletonHighlight:   '#1E1D35',
  cardBg:              '#0F0F1E',
  badgeBg:             '#9B65F5',
  badgeText:           '#FFFFFF',

  // ── Feed ──────────────────────────────────────────────────────────────────
  mediaPlaceholder:    '#0D0D1A',   // fond derrière une image/vidéo en cours de chargement
  likeActive:          '#F25270',   // cœur "aimé" — rouge, jamais le violet de marque
  feedGutter:          '#07070F',   // gouttière entre deux cartes du feed
};

export type AppColors = typeof LightColors;
