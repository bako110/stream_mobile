import React from 'react';
import { Image, ImageStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getLogo } from '../../assets';

interface Props {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  style?: ImageStyle;
}

const SIZES = { sm: 80, md: 120, lg: 160, xl: 220 };

export const AppLogo: React.FC<Props> = ({ size = 'md', style }) => {
  const { isDark } = useTheme();
  const dim = SIZES[size];

  return (
    <Image
      source={getLogo(isDark)}
      style={[{ width: dim, height: dim }, styles.img, style]}
      resizeMode="contain"
    />
  );
};

const styles = StyleSheet.create({
  img: { alignSelf: 'center' },
});
