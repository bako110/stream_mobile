/**
 * Styles de layout réutilisables — structure uniquement, sans couleur ni typo.
 * Importés dans tous les écrans pour éviter la duplication.
 */
import { StyleSheet, Platform, StatusBar } from 'react-native';

export const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ?? 24);
export const HEADER_HEIGHT     = Platform.OS === 'ios' ? 88 : 70;
export const TAB_BAR_HEIGHT    = Platform.OS === 'ios' ? 82 : 64;

export const layout = StyleSheet.create({
  // Conteneurs
  fill:           { flex: 1 },
  row:            { flexDirection: 'row' },
  rowCenter:      { flexDirection: 'row', alignItems: 'center' },
  rowBetween:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center:         { alignItems: 'center', justifyContent: 'center' },
  fillCenter:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Absolute fill
  absoluteFill:   { ...StyleSheet.absoluteFillObject },

  // Scroll padding standard
  scrollContent:  { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 24 },
  scrollContentWide: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
});
