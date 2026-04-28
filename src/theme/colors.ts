// Palette extraite du logo FoliX :
// - Violet/Rose dégradé  → brand primary
// - Orange chaud         → accent secondaire
// - Vert émeraude        → accent tertiaire
// - Fond sombre #0D0D1A  → dark background

export const LightColors = {
  // ── Backgrounds ───────────────────────────────────────────────────────────
  background:          '#FFFFFF',
  backgroundSecondary: '#F7F7FC',
  backgroundTertiary:  '#EEEEF5',
  surface:             '#FFFFFF',
  surfaceElevated:     '#F2F2FA',

  // ── Brand FoliX ───────────────────────────────────────────────────────────
  primary:             '#7B3FF2',   // violet logo
  primaryLight:        '#A67CF7',
  primaryDark:         '#5A1ED9',
  gradientStart:       '#7B3FF2',   // violet
  gradientEnd:         '#E0389A',   // rose/magenta logo

  // ── Accents ───────────────────────────────────────────────────────────────
  accentOrange:        '#FF7A2F',   // orange logo (note musicale)
  accentOrangeLight:   '#FFB07A',
  accentGreen:         '#36D9A0',   // vert logo (queue note)
  accentGreenLight:    '#7EEEC8',

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary:         '#12101F',
  textSecondary:       '#52506B',
  textTertiary:        '#9390AB',
  textDisabled:        '#C5C3D4',
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
  border:              '#E0DFF0',
  borderLight:         '#F0EFF8',
  divider:             '#EEEEF5',
  overlay:             'rgba(18,16,31,0.5)',
  shadow:              'rgba(123,63,242,0.10)',
  shadowNeutral:       'rgba(0,0,0,0.06)',
  ripple:              'rgba(123,63,242,0.12)',

  // ── FoliX spécifique ──────────────────────────────────────────────────────
  liveTag:             '#F0365A',
  livePulse:           'rgba(240,54,90,0.3)',
  premiumTag:          '#FF7A2F',
  premiumGradientStart:'#FF7A2F',
  premiumGradientEnd:  '#E0389A',
  subscriptionFree:    '#9390AB',
  subscriptionBasic:   '#3B82F6',
  subscriptionPremium: '#7B3FF2',
  subscriptionFamily:  '#36D9A0',
  viewerCount:         '#FF7A2F',
  concertCard:         '#F7F7FC',
  reelCard:            '#F2F2FA',
  tabBar:              '#FFFFFF',
  tabBarBorder:        '#E0DFF0',
  tabActive:           '#7B3FF2',
  tabInactive:         '#9390AB',
  inputBg:             '#F7F7FC',
  inputBorder:         '#E0DFF0',
  inputBorderFocus:    '#7B3FF2',
  skeleton:            '#EEEEF5',
  skeletonHighlight:   '#F7F7FC',
  cardBg:              '#FFFFFF',
  badgeBg:             '#7B3FF2',
  badgeText:           '#FFFFFF',
};

export const DarkColors = {
  // ── Backgrounds ───────────────────────────────────────────────────────────
  background:          '#0D0D1A',   // fond logo dark exact
  backgroundSecondary: '#161625',
  backgroundTertiary:  '#1E1E30',
  surface:             '#161625',
  surfaceElevated:     '#1E1E30',

  // ── Brand FoliX ───────────────────────────────────────────────────────────
  primary:             '#9B65F5',   // violet légèrement plus clair sur fond sombre
  primaryLight:        '#BFA0F8',
  primaryDark:         '#7B3FF2',
  gradientStart:       '#9B65F5',
  gradientEnd:         '#E85DAD',

  // ── Accents ───────────────────────────────────────────────────────────────
  accentOrange:        '#FF8C4A',
  accentOrangeLight:   '#FFB07A',
  accentGreen:         '#3FEDB6',
  accentGreenLight:    '#7EEEC8',

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary:         '#F0EFF8',
  textSecondary:       '#A09DC0',
  textTertiary:        '#6B698A',
  textDisabled:        '#3D3B55',
  textInverse:         '#12101F',
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
  border:              '#2A2840',
  borderLight:         '#1E1E30',
  divider:             '#1E1E30',
  overlay:             'rgba(0,0,0,0.75)',
  shadow:              'rgba(155,101,245,0.20)',
  shadowNeutral:       'rgba(0,0,0,0.40)',
  ripple:              'rgba(155,101,245,0.15)',

  // ── FoliX spécifique ──────────────────────────────────────────────────────
  liveTag:             '#F25270',
  livePulse:           'rgba(242,82,112,0.35)',
  premiumTag:          '#FF8C4A',
  premiumGradientStart:'#FF8C4A',
  premiumGradientEnd:  '#E85DAD',
  subscriptionFree:    '#6B698A',
  subscriptionBasic:   '#60A5FA',
  subscriptionPremium: '#9B65F5',
  subscriptionFamily:  '#3FEDB6',
  viewerCount:         '#FF8C4A',
  concertCard:         '#161625',
  reelCard:            '#1E1E30',
  tabBar:              '#0D0D1A',
  tabBarBorder:        '#2A2840',
  tabActive:           '#9B65F5',
  tabInactive:         '#6B698A',
  inputBg:             '#161625',
  inputBorder:         '#2A2840',
  inputBorderFocus:    '#9B65F5',
  skeleton:            '#1E1E30',
  skeletonHighlight:   '#2A2840',
  cardBg:              '#161625',
  badgeBg:             '#9B65F5',
  badgeText:           '#FFFFFF',
};

export type AppColors = typeof LightColors;
