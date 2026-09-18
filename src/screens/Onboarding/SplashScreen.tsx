import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, Dimensions, Image, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  withRepeat,
  interpolate,
  Extrapolation,
  Easing,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { getLogo } from '../../assets';

const { width: W, height: H } = Dimensions.get('window');

const LOGO_SIZE = Math.min(W * 0.42, 190);
const WORD_SIZE = W * 0.115;

interface Props { onFinish: () => void; }

// ── Chronologie (ms) ─────────────────────────────────────────────────────────
// Pensée comme une "signature de marque" : le logo se pose avec du poids
// (ressort), un reflet le traverse, le mot se dévoile derrière un masque, une
// ligne d'accent s'ouvre, puis sortie en léger zoom. ~2.6s au total, calée
// pile sur onFinish (aucun setTimeout suspendu au-delà).
const T = {
  logoIn:     260,   // le logo commence à apparaître
  haloPulse:  620,   // le halo pulse une fois derrière le logo
  shine:      900,   // le reflet diagonal traverse le logo
  wordReveal: 1120,  // le wordmark se dévoile
  accentLine: 1360,  // la ligne d'accent s'ouvre
  exit:       2320,  // début du fondu de sortie (après ~0.9s de lecture)
  exitDur:    380,   // durée du fondu → onFinish à ~2.7s
};

const WORD = 'Gofolyx';

export const SplashScreen: React.FC<Props> = ({ onFinish }) => {
  const { isDark } = useTheme();

  // Palette de marque (violet → magenta), reprise du logo.
  const BRAND_A = '#7B3FF2';
  const BRAND_B = '#E0389A';
  const bg        = isDark ? '#08071A' : '#FFFFFF';
  const bgDeep    = isDark ? '#0E0A2C' : '#F4F1FF';
  const textColor = isDark ? '#FFFFFF' : '#0D0B2A';

  // ── Valeurs animées ────────────────────────────────────────────────────────
  const rootOpacity = useSharedValue(1);
  const rootScale   = useSharedValue(1);

  const logoScale   = useSharedValue(0.62);
  const logoOpacity = useSharedValue(0);
  const logoRotate  = useSharedValue(-10);
  const logoLift    = useSharedValue(14);

  const haloScale   = useSharedValue(0.5);
  const haloOpacity = useSharedValue(0);

  const shineX      = useSharedValue(-1);   // -1 → 1 : position du reflet

  // Largeur du wordmark : estimée d'abord (pour que le masque ne soit jamais
  // bloqué à 0 si onLayout tarde sur un appareil lent), puis remplacée par la
  // mesure réelle dès qu'elle arrive.
  const WORD_W_EST = WORD.length * WORD_SIZE * 0.62;
  const [wordW, setWordW] = useState(WORD_W_EST);
  const wordReveal  = useSharedValue(0);    // 0 → 1 : fraction révélée du masque
  const wordLift    = useSharedValue(10);
  const wordOpacity = useSharedValue(0);

  const accentW     = useSharedValue(0);    // 0 → 1 : largeur de la ligne
  const accentOp    = useSharedValue(0);

  // Dérive lente et continue des halos de fond (ambiance, non bloquant).
  const drift       = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );

    // 1. Le logo se pose avec du poids.
    logoOpacity.value = withDelay(T.logoIn, withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }));
    logoScale.value   = withDelay(T.logoIn, withSpring(1, { damping: 12, stiffness: 140, mass: 0.9 }));
    logoRotate.value  = withDelay(T.logoIn, withSpring(0, { damping: 14, stiffness: 120 }));
    logoLift.value    = withDelay(T.logoIn, withSpring(0, { damping: 15, stiffness: 130 }));

    // 2. Halo qui pulse une seule fois derrière le logo.
    haloOpacity.value = withDelay(T.haloPulse, withSequence(
      withTiming(0.55, { duration: 260, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 620, easing: Easing.in(Easing.quad) }),
    ));
    haloScale.value = withDelay(T.haloPulse, withTiming(1.9, { duration: 880, easing: Easing.out(Easing.cubic) }));

    // 3. Reflet diagonal qui traverse le logo.
    shineX.value = withDelay(T.shine, withTiming(1, { duration: 640, easing: Easing.inOut(Easing.cubic) }));

    // 4. Le wordmark se dévoile derrière un masque gauche → droite.
    wordOpacity.value = withDelay(T.wordReveal, withTiming(1, { duration: 120 }));
    wordReveal.value  = withDelay(T.wordReveal, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    wordLift.value    = withDelay(T.wordReveal, withSpring(0, { damping: 16, stiffness: 150 }));

    // 5. Ligne d'accent qui s'ouvre du centre.
    accentOp.value = withDelay(T.accentLine, withTiming(1, { duration: 160 }));
    accentW.value  = withDelay(T.accentLine, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));

    // 6. Sortie : léger zoom + fondu, puis onFinish (une seule fois).
    rootScale.value   = withDelay(T.exit, withTiming(1.045, { duration: T.exitDur, easing: Easing.in(Easing.quad) }));
    rootOpacity.value = withDelay(T.exit, withTiming(0, { duration: T.exitDur, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onFinish)();
    }));

    return () => {
      cancelAnimation(drift);
      cancelAnimation(rootOpacity);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Styles animés ─────────────────────────────────────────────────────────
  const rootStyle = useAnimatedStyle(() => ({
    opacity: rootOpacity.value,
    transform: [{ scale: rootScale.value }],
  }));

  const haloBlobA = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-26, 22]) },
      { translateY: interpolate(drift.value, [0, 1], [18, -20]) },
    ],
  }));
  const haloBlobB = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [24, -18]) },
      { translateY: interpolate(drift.value, [0, 1], [-16, 24]) },
    ],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [
      { translateY: logoLift.value },
      { scale: logoScale.value },
      { rotate: `${logoRotate.value}deg` },
    ],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ scale: haloScale.value }],
  }));

  const shineStyle = useAnimatedStyle(() => {
    // La bande part complètement à gauche du logo et le traverse jusqu'à en
    // sortir à droite. Opacité en cloche : nulle aux extrémités, max au centre.
    const x = interpolate(shineX.value, [-1, 1], [-LOGO_SIZE * 1.1, LOGO_SIZE * 1.1], Extrapolation.CLAMP);
    const op = interpolate(shineX.value, [-1, -0.5, 0, 0.5, 1], [0, 0.85, 1, 0.85, 0], Extrapolation.CLAMP);
    return { opacity: op, transform: [{ translateX: x }, { rotate: '18deg' }] };
  });

  // Masque en pixels (pas en %) : anime la largeur d'un calque overflow-hidden
  // au-dessus du wordmark → révélation gauche → droite sans layout par frame.
  // +6px : marge pour que le "x" incliné (letterSpacing négatif) ne soit pas
  // rogné d'un ou deux pixels par le bord du masque une fois pleinement révélé.
  const wordMaskStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    width: wordReveal.value * (wordW + 6),
  }));
  const wordShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: wordLift.value }],
  }));

  const accentStyle = useAnimatedStyle(() => ({
    opacity: accentOp.value,
    transform: [{ scaleX: accentW.value }],
  }));

  const logoSource = getLogo(isDark);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bg }, rootStyle]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      {/* Fond : dégradé de base + deux halos de marque qui dérivent */}
      <LinearGradient
        colors={[bg, bgDeep, bg]}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[s.blob, s.blobA, haloBlobA]}>
        <LinearGradient
          colors={[BRAND_A + (isDark ? '55' : '22'), 'transparent']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[s.blob, s.blobB, haloBlobB]}>
        <LinearGradient
          colors={[BRAND_B + (isDark ? '4D' : '1F'), 'transparent']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Centre */}
      <View style={s.center}>

        {/* Bloc logo (halo + logo + reflet) */}
        <View style={s.logoBox}>
          {/* Halo pulsé */}
          <Animated.View style={[s.halo, haloStyle]} pointerEvents="none">
            <LinearGradient
              colors={[BRAND_A + '00', BRAND_A + '66', BRAND_B + '66', BRAND_B + '00']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.haloGrad}
            />
          </Animated.View>

          {/* Logo */}
          <Animated.View style={logoStyle}>
            <View style={s.logoClip}>
              <Image source={logoSource} style={s.logo} resizeMode="contain" />

              {/* Reflet diagonal qui traverse une fois */}
              <Animated.View style={[s.shine, shineStyle]} pointerEvents="none">
                <LinearGradient
                  colors={['transparent', isDark ? '#FFFFFF3D' : '#FFFFFFB3', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        {/* Wordmark révélé par masque gauche → droite */}
        <Animated.View style={[s.wordShift, wordShiftStyle]}>
          <View style={s.wordTrack}>
            {/* Calque "fantôme" : réserve la place + mesure la largeur réelle */}
            <Text
              style={[s.word, { color: textColor, opacity: 0 }]}
              onLayout={e => setWordW(e.nativeEvent.layout.width)}
            >
              {WORD}
            </Text>
            {/* Calque révélé — largeur pilotée par le masque animé. Le Text
                garde sa largeur pleine (wordW) pour ne pas se re-wrapper quand
                le conteneur rétrécit ; c'est le parent overflow-hidden qui coupe. */}
            <Animated.View style={[s.wordMask, wordMaskStyle]}>
              <Text
                style={[s.word, { color: textColor, width: wordW || undefined }]}
                numberOfLines={1}
              >
                {WORD.slice(0, -1)}
                <Text style={[s.word, s.wordAccent, { color: BRAND_B }]}>{WORD.slice(-1)}</Text>
              </Text>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Ligne d'accent qui s'ouvre du centre */}
        <View style={s.accentTrack}>
          <Animated.View style={[s.accentFill, accentStyle]}>
            <LinearGradient
              colors={[BRAND_A, BRAND_B]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

      </View>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },

  // ── Fond ────────────────────────────────────────────────────────────────
  blob: { position: 'absolute', borderRadius: 999, overflow: 'hidden' },
  blobA: {
    width: W * 1.1, height: W * 1.1,
    top: H * 0.5 - W * 0.9, left: W * 0.5 - W * 0.85,
  },
  blobB: {
    width: W * 1.0, height: W * 1.0,
    top: H * 0.5 - W * 0.1, left: W * 0.5 - W * 0.15,
  },

  // ── Logo ────────────────────────────────────────────────────────────────
  logoBox: {
    width: LOGO_SIZE * 1.6,
    height: LOGO_SIZE * 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: LOGO_SIZE * 1.35,
    height: LOGO_SIZE * 1.35,
  },
  haloGrad: {
    flex: 1,
    borderRadius: 999,
  },
  logoClip: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    overflow: 'hidden',
    borderRadius: 28,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  // Bande fine, plus haute que le logo (déborde en haut/bas pour rester pleine
  // largeur même inclinée), balayée horizontalement — cf. shineStyle.
  shine: {
    position: 'absolute',
    top: -LOGO_SIZE * 0.3,
    left: LOGO_SIZE * 0.5 - LOGO_SIZE * 0.16,
    width: LOGO_SIZE * 0.32,
    height: LOGO_SIZE * 1.6,
  },

  // ── Wordmark ────────────────────────────────────────────────────────────
  wordShift: { alignItems: 'center' },
  wordTrack: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  wordMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  word: {
    fontSize: WORD_SIZE,
    fontWeight: '800',
    letterSpacing: -1.5,
    includeFontPadding: false,
    ...Platform.select({ android: { fontFamily: 'sans-serif-medium' } }),
  },
  wordAccent: {
    fontWeight: '900',
  },

  // ── Ligne d'accent ──────────────────────────────────────────────────────
  accentTrack: {
    width: W * 0.46,
    height: 3,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentFill: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
});
