import { LightColors, DarkColors, AppColors } from './colors';
import { Typography, FontSize, FontWeight, LineHeight } from './typography';
import { Spacing, BorderRadius, IconSize, AvatarSize } from './spacing';
import { createShadows } from './shadows';

export const createTheme = (isDark: boolean) => {
  const colors: AppColors = isDark ? DarkColors : LightColors;
  const shadows = createShadows(colors);

  return {
    colors,
    typography: Typography,
    fontSize: FontSize,
    fontWeight: FontWeight,
    lineHeight: LineHeight,
    spacing: Spacing,
    borderRadius: BorderRadius,
    iconSize: IconSize,
    avatarSize: AvatarSize,
    shadows,
    isDark,
  };
};

export type AppTheme = ReturnType<typeof createTheme>;

export { LightColors, DarkColors };
export type { AppColors };
export * from './colors';
export * from './typography';
export * from './spacing';
