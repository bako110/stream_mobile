import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  provider: 'google';
  onPress: () => void;
  style?: ViewStyle;
}

const AnimTouch = Animated.createAnimatedComponent(TouchableOpacity);


export const SocialAuthButton: React.FC<Props> = ({ onPress, style }) => {
  const { theme } = useTheme();
  const { colors, borderRadius, fontWeight, fontSize } = theme;
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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
        <Text style={styles.googleG}>G</Text>
      </View>
      <Text style={[styles.label, { color: colors.textPrimary, fontSize: fontSize.base, fontWeight: fontWeight.medium }]}>
        Continuer avec Google
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
