import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, Dimensions,
  StatusBar, TouchableOpacity, Image,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withDelay, withSpring,
  Easing,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { getLogo } from '../../assets';

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  onFinish:    () => void;
  onLogin?:    () => void;
  onGoCGU?:    () => void;
  onGoPrivacy?: () => void;
}

// ── Feature pill ──────────────────────────────────────────────────────────────
const Pill: React.FC<{
  icon: string; label: string; delay: number;
  bg: string; border: string; txt: string;
}> = ({ icon, label, delay, bg, border, txt }) => {
  const opacity = useSharedValue(0);
  const ty      = useSharedValue(14);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    ty.value      = withDelay(delay, withSpring(0, { damping: 16, stiffness: 160 }));
  }, []); // eslint-disable-line

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View style={[s.pill, { backgroundColor: bg, borderColor: border }, anim]}>
      <Icon name={icon} size={13} color={txt} />
      <Text style={[s.pillTxt, { color: txt }]}>{label}</Text>
    </Animated.View>
  );
};

// ── OnboardingScreen ──────────────────────────────────────────────────────────
export const OnboardingScreen: React.FC<Props> = ({ onFinish, onLogin, onGoCGU, onGoPrivacy }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  // ── Couleurs selon le mode ────────────────────────────────────────────────
  const bg         = isDark ? '#09071C' : '#F5F3FF';
  const headline   = isDark ? '#FFFFFF' : '#0D0B2A';
  const sub        = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(13,11,42,0.55)';
  const accent     = '#C872FF';
  const pillBg     = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(123,63,242,0.08)';
  const pillBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(123,63,242,0.2)';
  const pillTxt    = isDark ? 'rgba(255,255,255,0.75)' : '#7B3FF2';
  const loginColor = isDark ? 'rgba(255,255,255,0.4)'  : 'rgba(13,11,42,0.45)';
  const legalColor = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(13,11,42,0.35)';
  const glowOp     = isDark ? 0.18 : 0.10;

  // ── Animations ────────────────────────────────────────────────────────────
  const logoOp = useSharedValue(0);
  const logoY  = useSharedValue(-20);
  const textOp = useSharedValue(0);
  const textY  = useSharedValue(30);
  const ctaOp  = useSharedValue(0);
  const ctaY   = useSharedValue(30);

  useEffect(() => {
    logoOp.value = withDelay(200, withTiming(1,  { duration: 600 }));
    logoY.value  = withDelay(200, withSpring(0,  { damping: 14, stiffness: 120 }));
    textOp.value = withDelay(600, withTiming(1,  { duration: 600 }));
    textY.value  = withDelay(600, withTiming(0,  { duration: 600, easing: Easing.out(Easing.cubic) }));
    ctaOp.value  = withDelay(1000, withTiming(1, { duration: 500 }));
    ctaY.value   = withDelay(1000, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []); // eslint-disable-line

  const logoAnim = useAnimatedStyle(() => ({ opacity: logoOp.value, transform: [{ translateY: logoY.value }] }));
  const textAnim = useAnimatedStyle(() => ({ opacity: textOp.value, transform: [{ translateY: textY.value }] }));
  const ctaAnim  = useAnimatedStyle(() => ({ opacity: ctaOp.value,  transform: [{ translateY: ctaY.value }] }));

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Fond dégradé */}
      <LinearGradient
        colors={isDark
          ? ['#09071C', '#130B2E', '#1A0A20']
          : ['#F5F3FF', '#EDE8FF', '#F9F5FF']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Lueurs de fond */}
      <View style={[s.glow, {
        top: -H * 0.1, left: -W * 0.2,
        width: W * 0.9, height: W * 0.9,
        backgroundColor: '#7B3FF2', opacity: glowOp,
      }]} />
      <View style={[s.glow, {
        bottom: H * 0.08, right: -W * 0.3,
        width: W * 0.8, height: W * 0.8,
        backgroundColor: '#E0389A', opacity: glowOp,
      }]} />

      {/* Corps */}
      <View style={s.body}>

        {/* Logo */}
        <Animated.View style={[s.logoWrap, logoAnim]}>
          <View style={s.logoCircle}>
            <Image
              source={getLogo(isDark)}
              style={{ width: 88, height: 88 }}
              resizeMode="cover"
            />
          </View>
        </Animated.View>

        {/* Titre + sous-titre */}
        <Animated.View style={[{ alignItems: 'center' }, textAnim]}>
          <Text style={[s.headline, { color: headline }]}>
            Tout ce que{'\n'}vous aimez,{' '}
            <Text style={{ color: accent }}>ici.</Text>
          </Text>
          <Text style={[s.sub, { color: sub }]}>
            Lives · Films · Événements · Reels{'\n'}Une seule app. Zéro compromis.
          </Text>
        </Animated.View>

        {/* Pills */}
        <View style={s.pills}>
          <Pill icon="radio"       label="Concerts live"  delay={900}  bg={pillBg} border={pillBorder} txt={pillTxt} />
          <Pill icon="film"        label="Films & séries" delay={1000} bg={pillBg} border={pillBorder} txt={pillTxt} />
          <Pill icon="calendar"    label="Événements"     delay={1100} bg={pillBg} border={pillBorder} txt={pillTxt} />
          <Pill icon="play-circle" label="Reels"          delay={1200} bg={pillBg} border={pillBorder} txt={pillTxt} />
          <Pill icon="users"       label="Communautés"    delay={1300} bg={pillBg} border={pillBorder} txt={pillTxt} />
        </View>

      </View>

      {/* CTA bas */}
      <Animated.View style={[s.cta, ctaAnim]}>

        {/* Bouton principal */}
        <TouchableOpacity onPress={onFinish} activeOpacity={0.88} style={{ width: '100%' }}>
          <LinearGradient
            colors={['#7B3FF2', '#C044E8', '#E0389A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.ctaBtn}
          >
            <Text style={s.ctaBtnTxt}>Rejoindre GoFolix</Text>
            <Icon name="arrow-right" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Connexion */}
        <TouchableOpacity onPress={onLogin ?? onFinish} activeOpacity={0.7} style={s.loginBtn}>
          <Text style={[s.loginTxt, { color: loginColor }]}>
            Déjà membre ?{'  '}
            <Text style={{ color: accent, fontWeight: '700' }}>Connexion</Text>
          </Text>
        </TouchableOpacity>

        {/* Légal */}
        <Text style={[s.legal, { color: legalColor }]}>
          En continuant, vous acceptez nos{' '}
          <Text style={[s.legalLink, { color: isDark ? '#C872FF' : '#7B3FF2' }]} onPress={onGoCGU}>
            Conditions d'utilisation
          </Text>
          {' '}et notre{' '}
          <Text style={[s.legalLink, { color: isDark ? '#C872FF' : '#7B3FF2' }]} onPress={onGoPrivacy}>
            Politique de confidentialité
          </Text>
          .
        </Text>

      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: 'absolute', borderRadius: 999 },

  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 28,
    paddingTop: 60,
  },

  logoWrap:   { alignItems: 'center' },
  logoCircle: {
    width: 88, height: 88,
    borderRadius: 44,         // parfaitement rond
    overflow: 'hidden',       // coupe les coins du fond foncé de l'image
    shadowColor: '#7B3FF2',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  headline: {
    fontSize: 38, fontWeight: '900',
    textAlign: 'center', lineHeight: 46,
    letterSpacing: -1, marginBottom: 12,
  },
  sub: {
    fontSize: 15, textAlign: 'center',
    lineHeight: 24, fontWeight: '400',
  },

  pills: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 8,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  pillTxt: { fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },

  cta: {
    paddingHorizontal: 24, paddingBottom: 44,
    gap: 4, alignItems: 'center',
  },
  ctaBtn: {
    width: '100%',
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    paddingVertical: 17, borderRadius: 18,
    shadowColor: '#7B3FF2', shadowOpacity: 0.5,
    shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  ctaBtnTxt: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.1 },
  loginBtn:  { alignSelf: 'center', paddingVertical: 14 },
  loginTxt:  { fontSize: 14, textAlign: 'center' },
  legal:     { fontSize: 11, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  legalLink: { fontWeight: '600' },
});
