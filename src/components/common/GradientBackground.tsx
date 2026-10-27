import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  colors?: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

// Couleur unie — anciennement un LinearGradient (gradientStart → gradientEnd).
// `colors`/`start`/`end` restent acceptés pour compat des appelants existants :
// seule la première couleur de `colors` (ou colors.primary par défaut) sert
// de fond, le reste est ignoré.
export const GradientBackground: React.FC<Props> = ({ children, style, colors }) => {
  const { theme } = useTheme();
  const bgColor = colors?.[0] ?? theme.colors.primary;

  return (
    <View style={[styles.fill, { backgroundColor: bgColor }, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
