/**
 * Styles de layout réutilisables — structure uniquement, sans couleur ni typo.
 * Importés dans tous les écrans pour éviter la duplication.
 */
import { StyleSheet, Platform, StatusBar, Dimensions } from 'react-native';

export const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ?? 24);

// HEADER_HEIGHT / TAB_BAR_HEIGHT proportionnels à la hauteur d'écran réelle
// (2026-10, bug Samsung bas/moyen de gamme) : ces hauteurs étaient des pixels
// FIXES (70 / 46 sur Android), calibrées visuellement sur un écran de
// référence assez grand. Sur un petit écran Samsung (hauteur `window` plus
// courte, parfois cumulée à un StatusBar.currentHeight plus élevé — caméra
// perforée, encoche large selon le modèle), ce même nombre de pixels fixes
// représente une part bien plus importante de l'écran visible : header et
// tab bar paraissaient démesurément grands, rognant le contenu utile.
// Calcul : % de la hauteur d'écran mesuré sur le design de référence (où
// 70/46 avaient été calibrés visuellement), borné par un min/max pour ne
// jamais devenir ridiculement petit (tablette/écran très grand) ou trop
// serré pour rester tactile (très petit écran, ex: mini téléphones).
const { height: SCREEN_H } = Dimensions.get('window');
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const HEADER_HEIGHT = Platform.OS === 'ios'
  ? 88
  : clamp(SCREEN_H * 0.0875, 56, 78); // 0.0875 = 70/800 (référence Android)

export const TAB_BAR_HEIGHT = Platform.OS === 'ios'
  ? 60
  : clamp(SCREEN_H * 0.0575, 42, 52); // 0.0575 = 46/800 (référence Android)

export const layout = StyleSheet.create({
  // Conteneurs
  fill:           { flex: 1 },
  row:            { flexDirection: 'row' },
  rowCenter:      { flexDirection: 'row', alignItems: 'center' },
  rowBetween:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center:         { alignItems: 'center', justifyContent: 'center' },
  fillCenter:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Absolute fill
  absoluteFill:   { ...StyleSheet.absoluteFill },

  // Scroll padding standard
  scrollContent:  { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 24 },
  scrollContentWide: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
});
