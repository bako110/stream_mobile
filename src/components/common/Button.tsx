import React from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ActivityIndicator,
  ViewStyle, TextStyle, View,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size    = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const AnimTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const Button: React.FC<Props> = ({
  label, onPress, variant = 'primary', size = 'md',
  loading, disabled, style, textStyle, icon, fullWidth = true,
}) => {
  const { theme } = useTheme();
  const { colors, borderRadius, fontWeight, fontSize } = theme;

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(0.85, { duration: 80 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(1, { duration: 120 });
  };

  const paddingMap: Record<Size, { py: number; px: number }> = {
    sm: { py: 10, px: 18 },
    md: { py: 14, px: 24 },
    lg: { py: 17, px: 32 },
  };
  const fontSizeMap: Record<Size, number> = { sm: 13, md: 15, lg: 16 };
  const { py, px } = paddingMap[size];

  const baseStyle: ViewStyle = {
    borderRadius: borderRadius.lg,
    paddingVertical: py,
    paddingHorizontal: px,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: disabled ? 0.45 : 1,
  };

  const labelStyle: TextStyle = {
    fontSize: fontSizeMap[size],
    fontWeight: fontWeight.semiBold,
    letterSpacing: 0.3,
  };

  if (variant === 'primary') {
    return (
      <AnimTouchable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[animStyle, style]}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={baseStyle}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              {icon}
              <Text style={[labelStyle, { color: '#fff' }]}>{label}</Text>
            </>
          )}
        </LinearGradient>
      </AnimTouchable>
    );
  }

  if (variant === 'secondary') {
    return (
      <AnimTouchable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[animStyle, baseStyle, { backgroundColor: colors.surfaceElevated }, style]}
      >
        {loading ? <ActivityIndicator color={colors.primary} size="small" /> : (
          <>
            {icon}
            <Text style={[labelStyle, { color: colors.textPrimary }, textStyle]}>{label}</Text>
          </>
        )}
      </AnimTouchable>
    );
  }

  if (variant === 'outline') {
    return (
      <AnimTouchable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[animStyle, baseStyle, {
          borderWidth: 1.5,
          borderColor: colors.primary,
          backgroundColor: 'transparent',
        }, style]}
      >
        {loading ? <ActivityIndicator color={colors.primary} size="small" /> : (
          <>
            {icon}
            <Text style={[labelStyle, { color: colors.primary }, textStyle]}>{label}</Text>
          </>
        )}
      </AnimTouchable>
    );
  }

  // ghost
  return (
    <AnimTouchable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={1}
      style={[animStyle, baseStyle, { backgroundColor: 'transparent' }, style]}
    >
      {loading ? <ActivityIndicator color={colors.primary} size="small" /> : (
        <>
          {icon}
          <Text style={[labelStyle, { color: colors.primary }, textStyle]}>{label}</Text>
        </>
      )}
    </AnimTouchable>
  );
};
