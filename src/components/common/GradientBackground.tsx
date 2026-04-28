import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  colors?: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export const GradientBackground: React.FC<Props> = ({
  children,
  style,
  colors,
  start = { x: 0.1, y: 0 },
  end = { x: 0.9, y: 1 },
}) => {
  const { theme } = useTheme();
  const gradColors = colors ?? [
    theme.colors.gradientStart,
    theme.colors.gradientEnd,
  ];

  return (
    <LinearGradient colors={gradColors} start={start} end={end} style={[styles.fill, style]}>
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
