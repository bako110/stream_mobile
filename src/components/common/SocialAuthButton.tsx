import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, Image, View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  provider: 'google' | 'facebook';
  onPress: () => void;
  style?: ViewStyle;
}

const AnimTouch = Animated.createAnimatedComponent(TouchableOpacity);

const GOOGLE_COLORS = ['#EA4335', '#FBBC05', '#34A853', '#4285F4'];
const FB_COLOR = '#1877F2';

export const SocialAuthButton: React.FC<Props> = ({ provider, onPress, style }) => {
  const { theme } = useTheme();
  const { colors, borderRadius, fontWeight, fontSize } = theme;
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isGoogle = provider === 'google';
  const label = isGoogle ? 'Continuer avec Google' : 'Continuer avec Facebook';

  return (
    <AnimTouch
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
      activeOpacity={1}
      style={[
        styles.btn,
        {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        animStyle,
        style,
      ]}
    >
      <View style={styles.iconWrap}>
        {isGoogle ? (
          <Text style={styles.googleG}>G</Text>
        ) : (
          <Text style={[styles.googleG, { color: FB_COLOR }]}>f</Text>
        )}
      </View>
      <Text style={[styles.label, { color: colors.textPrimary, fontSize: fontSize.base, fontWeight: fontWeight.medium }]}>
        {label}
      </Text>
    </AnimTouch>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 12,
  },
  iconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EA4335',
  },
  label: {
    flex: 1,
    textAlign: 'center',
    marginRight: 24,
  },
});
