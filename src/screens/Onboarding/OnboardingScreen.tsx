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

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  onFinish: () => void;
  onLogin?: () => void;
}

// ── Orbe lumineux animé ───────────────────────────────────────────────────────
const Orb: React.FC<{
  x: number; y: number; r: number;
  color: string; delay: number; duration: number;
}> = ({ x, y, r, color, delay, duration }) => {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 800 }));
    scale.value   = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1.18, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(1,    { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    ));
  }, []);

  const anim = useAnimatedStyle(() => ({
    opacity:   interpolate(opacity.value, [0, 1], [0, 0.55], Extrapolation.CLAMP),
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        anim,
        {
          position: 'absolute',
          left: x - r, top: y - r,
          width: r * 2, height: r * 2,
          borderRadius: r,
          backgroundColor: color,
        },
      ]}
    />
  );
};

// ── Ligne de badge feature ────────────────────────────────────────────────────
const FeaturePill: React.FC<{ icon: string; label: string; delay: number }> = ({ icon, label, delay }) => {
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
    <Animated.View style={[s.pill, anim]}>
      <Icon name={icon} size={13} color="rgba(255,255,255,0.7)" />
      <Text style={s.pillText}>{label}</Text>
    </Animated.View>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────
export const OnboardingScreen: React.FC<Props> = ({ onFinish, onLogin }) => {
  const logoScale   = useSharedValue(0.72);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY      = useSharedValue(28);
  const ctaOpacity  = useSharedValue(0);
  const ctaY        = useSharedValue(24);

  useEffect(() => {
    // Logo
    logoOpacity.value = withDelay(200, withTiming(1, { duration: 700 }));
    logoScale.value   = withDelay(200, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.6)) }));
    // Titre
    titleOpacity.value = withDelay(650, withTiming(1, { duration: 600 }));
    titleY.value       = withDelay(650, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    // CTA
    ctaOpacity.value  = withDelay(1100, withTiming(1, { duration: 500 }));
    ctaY.value        = withDelay(1100, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
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

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Fond */}
      <LinearGradient
        colors={['#07070F', '#0D0818', '#07070F']}
        style={StyleSheet.absoluteFill}
      />

      {/* Orbes atmospheriques */}
      <Orb x={W * 0.18} y={H * 0.28} r={220} color="#6D28D9"  delay={0}    duration={4200} />
      <Orb x={W * 0.82} y={H * 0.38} r={180} color="#BE185D"  delay={600}  duration={3800} />
      <Orb x={W * 0.50} y={H * 0.72} r={200} color="#1D4ED8"  delay={300}  duration={5000} />

      {/* Ligne de separation lumineuse */}
      <View style={s.glowLine} pointerEvents="none" />

      {/* ── Contenu principal ── */}
      <View style={s.content}>

        {/* Logo */}
        <Animated.View style={[s.logoWrap, logoAnim]}>
          <AppLogo size="xl" />
        </Animated.View>

        {/* Texte hero */}
        <Animated.View style={[s.textBlock, titleAnim]}>
          <Text style={s.headline}>
            Tout ce que{'\n'}vous aimez,{'\n'}
            <Text style={s.headlineAccent}>ici.</Text>
          </Text>
          <Text style={s.sub}>
            Live, films, events, communautes —{'\n'}une seule app, zero compromis.
          </Text>
        </Animated.View>

        {/* Pills features */}
        <View style={s.pills}>
          <FeaturePill icon="radio"       label="Concerts live"     delay={900}  />
          <FeaturePill icon="film"        label="Films & series"    delay={1010} />
          <FeaturePill icon="calendar"    label="Evenements"        delay={1120} />
          <FeaturePill icon="play-circle" label="Reels & feed"      delay={1230} />
        </View>

      </View>

      {/* ── CTA fixe en bas ── */}
      <Animated.View style={[s.cta, ctaAnim]}>

        {/* Principal */}
        <TouchableOpacity onPress={onFinish} activeOpacity={0.86}>
          <LinearGradient
            colors={['#7C3AED', '#DB2777']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.btnPrimary}
          >
            <Text style={s.btnPrimaryText}>Rejoindre FoliX</Text>
            <Icon name="arrow-right" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Secondaire */}
        <TouchableOpacity
          onPress={onLogin ?? onFinish}
          activeOpacity={0.7}
          style={s.btnSecondary}
        >
          <Text style={s.btnSecondaryText}>
            Deja membre ?{'  '}
            <Text style={s.btnSecondaryAccent}>Connexion</Text>
          </Text>
        </TouchableOpacity>

      </Animated.View>

    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070F' },

  glowLine: {
    position: 'absolute',
    top: H * 0.48,
    left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
  },

  logoWrap: {
    marginBottom: 32,
  },

  textBlock: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headline: {
    fontSize: 46,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 54,
    letterSpacing: -1,
    marginBottom: 18,
  },
  headlineAccent: {
    color: '#A855F7',
  },
  sub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },

  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.70)',
    letterSpacing: 0.2,
  },

  cta: {
    paddingHorizontal: 24,
    paddingBottom: 52,
    gap: 4,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
  },
  btnPrimaryText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.1,
  },
  btnSecondary: {
    alignSelf: 'center',
    paddingVertical: 16,
  },
  btnSecondaryText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.38)',
    textAlign: 'center',
  },
  btnSecondaryAccent: {
    color: '#A855F7',
    fontWeight: '700',
  },
});
