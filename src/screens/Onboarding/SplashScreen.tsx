import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar, Dimensions } from 'react-native';
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

const { width: W, height: H } = Dimensions.get('window');

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
      exitOpacity.value = withTiming(0, { duration: 450 }, () => { 'worklet'; });
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
    opacity: interpolate(orb1.value, [0, 1], [0, isDark ? 0.35 : 0.18]),
    transform: [{ scale: orb1.value }],
  }));
  const orb2Anim = useAnimatedStyle(() => ({
    opacity: interpolate(orb2.value, [0, 1], [0, isDark ? 0.28 : 0.14]),
    transform: [{ scale: orb2.value }],
  }));
  const barAnim = useAnimatedStyle(() => ({ opacity: barOpacity.value }));

  // Fond : dark = #050816, light = blanc pur
  const bg = isDark ? '#050816' : colors.background;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, containerAnim, { backgroundColor: bg }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Gradient subtil qui suit le fond */}
      <LinearGradient
        colors={isDark
          ? [bg, '#0D0B2A', bg]
          : [colors.background, colors.backgroundSecondary, colors.background]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Orbe 1 — couleur primary du thème */}
      <Animated.View style={[{
        position: 'absolute', top: -H * 0.12, left: -W * 0.25,
        width: W * 0.85, height: W * 0.85, borderRadius: W * 0.425, overflow: 'hidden',
      }, orb1Anim]}>
        <LinearGradient colors={[colors.primary, 'transparent']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Orbe 2 — couleur gradientEnd du thème */}
      <Animated.View style={[{
        position: 'absolute', bottom: H * 0.04, right: -W * 0.2,
        width: W * 0.75, height: W * 0.75, borderRadius: W * 0.375, overflow: 'hidden',
      }, orb2Anim]}>
        <LinearGradient colors={[colors.gradientEnd, 'transparent']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View style={styles.center}>
        <Animated.View style={logoAnim}>
          <AppLogo size="xl" />
        </Animated.View>
      </View>

      <Animated.View style={[styles.progressBar, barAnim]}>
        <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }]}>
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
  progressBar:   { paddingBottom: H * 0.07, paddingHorizontal: W * 0.16, alignItems: 'center' },
  progressTrack: { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { width: '65%', height: '100%', borderRadius: 2 },
});
