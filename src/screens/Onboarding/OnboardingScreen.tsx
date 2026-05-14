import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, Dimensions,
  StatusBar, TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withDelay, withRepeat, withSequence,
  Easing, interpolate, Extrapolation,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { AppLogo } from '../../components/common';
import { useTheme } from '../../hooks/useTheme';

const { width: W, height: H } = Dimensions.get('window');

// Echelle responsive
const hs = (size: number) => Math.round(size * (H / 812));
const ws = (size: number) => Math.round(size * (W / 375));

interface Props {
  onFinish: () => void;
  onLogin?: () => void;
}

// ── Orbe lumineux animé ───────────────────────────────────────────────────────
const Orb: React.FC<{
  x: number; y: number; r: number;
  color: string; opacity: number; delay: number; duration: number;
}> = ({ x, y, r, color, opacity, delay, duration }) => {
  const scale   = useSharedValue(1);
  const anim_op = useSharedValue(0);

  useEffect(() => {
    anim_op.value = withDelay(delay, withTiming(1, { duration: 800 }));
    scale.value   = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1.18, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(1,    { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    ));
  }, []);

  const anim = useAnimatedStyle(() => ({
    opacity:   interpolate(anim_op.value, [0, 1], [0, opacity], Extrapolation.CLAMP),
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[anim, {
        position: 'absolute',
        left: x - r, top: y - r,
        width: r * 2, height: r * 2,
        borderRadius: r,
        backgroundColor: color,
      }]}
    />
  );
};

// ── Feature pill ──────────────────────────────────────────────────────────────
const FeaturePill: React.FC<{
  icon: string; label: string; delay: number;
  isDark: boolean; pillBg: string; pillBorder: string; textColor: string;
}> = ({ icon, label, delay, pillBg, pillBorder, textColor }) => {
  const opacity = useSharedValue(0);
  const tx      = useSharedValue(-16);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
    tx.value      = withDelay(delay, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const anim = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateX: tx.value }],
  }));

  return (
    <Animated.View style={[{
      flexDirection: 'row', alignItems: 'center',
      gap: ws(6), paddingHorizontal: ws(14), paddingVertical: hs(7),
      borderRadius: 20, backgroundColor: pillBg,
      borderWidth: 1, borderColor: pillBorder,
    }, anim]}>
      <Icon name={icon} size={ws(13)} color={textColor} />
      <Text style={{ fontSize: ws(12), fontWeight: '600', color: textColor, letterSpacing: 0.2 }}>
        {label}
      </Text>
    </Animated.View>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────
export const OnboardingScreen: React.FC<Props> = ({ onFinish, onLogin }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const logoScale    = useSharedValue(0.72);
  const logoOpacity  = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY       = useSharedValue(28);
  const ctaOpacity   = useSharedValue(0);
  const ctaY         = useSharedValue(24);

  useEffect(() => {
    logoOpacity.value  = withDelay(200, withTiming(1, { duration: 700 }));
    logoScale.value    = withDelay(200, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.6)) }));
    titleOpacity.value = withDelay(650, withTiming(1, { duration: 600 }));
    titleY.value       = withDelay(650, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    ctaOpacity.value   = withDelay(1100, withTiming(1, { duration: 500 }));
    ctaY.value         = withDelay(1100, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const logoAnim  = useAnimatedStyle(() => ({
    opacity:   logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const titleAnim = useAnimatedStyle(() => ({
    opacity:   titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const ctaAnim   = useAnimatedStyle(() => ({
    opacity:   ctaOpacity.value,
    transform: [{ translateY: ctaY.value }],
  }));

  // Couleurs adaptées au thème
  const bg          = isDark ? '#050816' : colors.background;
  const headline    = colors.textPrimary;
  const sub         = colors.textSecondary;
  const pillBg      = isDark ? 'rgba(255,255,255,0.06)' : colors.backgroundSecondary;
  const pillBorder  = isDark ? 'rgba(255,255,255,0.10)' : colors.border;
  const pillText    = colors.textSecondary;
  const loginText   = colors.textTertiary;
  // Orbes : opacité réduite en mode clair pour rester discret
  const orbOpacity  = isDark ? 0.50 : 0.22;

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Gradient de fond */}
      <LinearGradient
        colors={isDark
          ? [bg, '#0A0820', bg]
          : [colors.background, colors.backgroundSecondary, colors.background]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Orbes — couleurs brand du thème */}
      <Orb x={W * 0.18} y={H * 0.28} r={W * 0.58} color={colors.primary}      opacity={orbOpacity}        delay={0}   duration={4200} />
      <Orb x={W * 0.82} y={H * 0.38} r={W * 0.48} color={colors.gradientEnd}   opacity={orbOpacity}        delay={600} duration={3800} />
      <Orb x={W * 0.50} y={H * 0.72} r={W * 0.53} color={colors.accentOrange}  opacity={orbOpacity * 0.7}  delay={300} duration={5000} />

      {/* Ligne de séparation lumineuse */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: H * 0.48, left: 0, right: 0, height: 1,
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.divider,
        }}
      />

      {/* ── Contenu principal ── */}
      <View style={[s.content, { paddingHorizontal: ws(28), paddingTop: hs(48) }]}>

        <Animated.View style={[{ marginBottom: hs(28) }, logoAnim]}>
          <AppLogo size="xl" />
        </Animated.View>

        <Animated.View style={[{ alignItems: 'center', marginBottom: hs(28) }, titleAnim]}>
          <Text style={{
            fontSize: ws(42), fontWeight: '900', color: headline,
            textAlign: 'center', lineHeight: ws(42) * 1.18,
            letterSpacing: -1, marginBottom: hs(16),
          }}>
            Tout ce que{'\n'}vous aimez,{'\n'}
            <Text style={{ color: colors.primary }}>ici.</Text>
          </Text>
          <Text style={{
            fontSize: ws(14), color: sub,
            textAlign: 'center', lineHeight: ws(14) * 1.7, fontWeight: '400',
          }}>
            Live, films, events, communautes —{'\n'}une seule app, zero compromis.
          </Text>
        </Animated.View>

        {/* Pills features */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: ws(8) }}>
          <FeaturePill icon="radio"       label="Concerts live"  delay={900}  isDark={isDark} pillBg={pillBg} pillBorder={pillBorder} textColor={pillText} />
          <FeaturePill icon="film"        label="Films & series" delay={1010} isDark={isDark} pillBg={pillBg} pillBorder={pillBorder} textColor={pillText} />
          <FeaturePill icon="calendar"    label="Evenements"     delay={1120} isDark={isDark} pillBg={pillBg} pillBorder={pillBorder} textColor={pillText} />
          <FeaturePill icon="play-circle" label="Reels & feed"   delay={1230} isDark={isDark} pillBg={pillBg} pillBorder={pillBorder} textColor={pillText} />
        </View>

      </View>

      {/* ── CTA fixe en bas ── */}
      <Animated.View style={[{ paddingHorizontal: ws(24), paddingBottom: hs(48), gap: hs(4) }, ctaAnim]}>

        <TouchableOpacity onPress={onFinish} activeOpacity={0.86}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: ws(10), paddingVertical: hs(17), borderRadius: ws(18),
            }}
          >
            <Text style={{ fontSize: ws(16), fontWeight: '800', color: '#fff', letterSpacing: 0.1 }}>
              Rejoindre FoliX
            </Text>
            <Icon name="arrow-right" size={ws(18)} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onLogin ?? onFinish}
          activeOpacity={0.7}
          style={{ alignSelf: 'center', paddingVertical: hs(14) }}
        >
          <Text style={{ fontSize: ws(14), color: loginText, textAlign: 'center' }}>
            Deja membre ?{'  '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Connexion</Text>
          </Text>
        </TouchableOpacity>

      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  root:    { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
