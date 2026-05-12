import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo } from '../../components/common';

interface Props {
  onFinish: () => void;
}

export const SplashScreen: React.FC<Props> = ({ onFinish }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const logoScale   = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const logoY       = useSharedValue(40);
  const shimmer     = useSharedValue(0);
  const exitOpacity = useSharedValue(1);
  const orb1        = useSharedValue(0);
  const orb2        = useSharedValue(0);
  const barOpacity  = useSharedValue(0);

  useEffect(() => {
    orb1.value = withDelay(0,   withTiming(1, { duration: 800 }));
    orb2.value = withDelay(200, withTiming(1, { duration: 800 }));

    logoScale.value   = withDelay(300, withSpring(1, { damping: 12, stiffness: 100 }));
    logoOpacity.value = withDelay(300, withTiming(1, { duration: 350 }));
    logoY.value       = withDelay(300, withSpring(0, { damping: 14, stiffness: 110 }));

    shimmer.value = withDelay(900, withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ), -1,
    ));

    barOpacity.value = withDelay(800, withTiming(1, { duration: 400 }));

    const t = setTimeout(() => {
      exitOpacity.value = withTiming(0, { duration: 450 }, () => {
        'worklet';
        // callback vide — onFinish appelé via timeout JS
      });
      setTimeout(onFinish, 450);
    }, 2600);

    return () => clearTimeout(t);
  }, []);

  const containerAnim = useAnimatedStyle(() => ({ opacity: exitOpacity.value }));

  const logoAnim = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [
      { scale: logoScale.value + interpolate(shimmer.value, [0, 1], [0, 0.04]) },
      { translateY: logoY.value },
    ],
  }));

  const orb1Anim = useAnimatedStyle(() => ({
    opacity: interpolate(orb1.value, [0, 1], [0, 0.4]),
    transform: [{ scale: orb1.value }],
  }));
  const orb2Anim = useAnimatedStyle(() => ({
    opacity: interpolate(orb2.value, [0, 1], [0, 0.3]),
    transform: [{ scale: orb2.value }],
  }));
  const barAnim = useAnimatedStyle(() => ({ opacity: barOpacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, containerAnim]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <LinearGradient
        colors={isDark
          ? [colors.background, '#12103A', colors.background]
          : ['#EEE8FF', '#F5F0FF', '#FFFFFF']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.orb1, orb1Anim]}>
        <LinearGradient colors={[colors.primary, 'transparent']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.orb2, orb2Anim]}>
        <LinearGradient colors={[colors.gradientEnd, 'transparent']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View style={styles.center}>
        <Animated.View style={logoAnim}>
          <AppLogo size="xl" />
        </Animated.View>
      </View>

      <Animated.View style={[styles.progressBar, barAnim]}>
        <View style={[styles.progressTrack, { backgroundColor: isDark ? colors.border : colors.backgroundTertiary }]}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.progressFill}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progressBar:   { paddingBottom: 56, paddingHorizontal: 64, alignItems: 'center' },
  progressTrack: { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { width: '65%', height: '100%', borderRadius: 2 },
  orb1: {
    position: 'absolute', top: -100, left: -100,
    width: 340, height: 340, borderRadius: 170, overflow: 'hidden',
  },
  orb2: {
    position: 'absolute', bottom: 40, right: -80,
    width: 300, height: 300, borderRadius: 150, overflow: 'hidden',
  },
});
