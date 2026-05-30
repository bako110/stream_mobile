import React, { useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';

const { width: W, height: H } = Dimensions.get('window');

const LETTERS = ['F', 'o', 'l', 'i', 'X'];
const DELAY_PER_LETTER = 120; // ms entre chaque lettre

interface Props { onFinish: () => void; }

// ── Lettre animée ─────────────────────────────────────────────────────────────
const AnimatedLetter: React.FC<{
  char: string;
  index: number;
  isX: boolean;
  textColor: string;
}> = ({ char, index, isX, textColor }) => {
  const opacity   = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    const delay = 400 + index * DELAY_PER_LETTER;
    opacity.value    = withDelay(delay, withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 14, stiffness: 180 }));
  }, []); // eslint-disable-line

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (isX) {
    return (
      <Animated.View style={anim}>
        <LinearGradient
          colors={['#7B3FF2', '#E0389A']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.xGrad}
        >
          <Text style={s.xChar}>X</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.Text style={[s.letter, { color: textColor }, anim]}>
      {char}
    </Animated.Text>
  );
};

// ── SplashScreen ──────────────────────────────────────────────────────────────
export const SplashScreen: React.FC<Props> = ({ onFinish }) => {
  const { isDark } = useTheme();

  const exitOpacity  = useSharedValue(1);
  const underlineW   = useSharedValue(0);
  const underlineOp  = useSharedValue(0);

  const bg        = isDark ? '#08071A' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#0D0B2A';

  useEffect(() => {
    // Soulignement qui apparaît après toutes les lettres
    const underlineDelay = 400 + LETTERS.length * DELAY_PER_LETTER + 150;
    underlineOp.value = withDelay(underlineDelay, withTiming(1, { duration: 200 }));
    underlineW.value  = withDelay(underlineDelay, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));

    // Exit fade
    const exitDelay = underlineDelay + 900;
    const t = setTimeout(() => {
      exitOpacity.value = withTiming(0, { duration: 400 });
      setTimeout(onFinish, 400);
    }, exitDelay);

    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const containerAnim  = useAnimatedStyle(() => ({ opacity: exitOpacity.value }));
  const underlineAnim  = useAnimatedStyle(() => ({
    opacity: underlineOp.value,
    width: `${underlineW.value * 100}%` as any,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bg }, containerAnim]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      {/* Centre */}
      <View style={s.center}>

        {/* Lettres */}
        <View style={s.wordRow}>
          {LETTERS.map((char, i) => (
            <AnimatedLetter
              key={i}
              char={char}
              index={i}
              isX={char === 'X'}
              textColor={textColor}
            />
          ))}
        </View>

        {/* Soulignement gradient */}
        <View style={s.underlineTrack}>
          <Animated.View style={[s.underlineFill, underlineAnim]}>
            <LinearGradient
              colors={['#7B3FF2', '#E0389A']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

      </View>
    </Animated.View>
  );
};

const FONT_SIZE = W * 0.18;

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  letter: {
    fontSize: FONT_SIZE,
    fontWeight: '800',
    letterSpacing: -2,
    includeFontPadding: false,
  },
  xGrad: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  xChar: {
    fontSize: FONT_SIZE * 0.88,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  underlineTrack: {
    width: W * 0.48,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  underlineFill: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
});
