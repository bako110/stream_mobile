import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  Easing, runOnJS,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';

interface Props {
  onPress: () => void;
}

// Variable de module (pas MMKV) — remise à false à chaque redémarrage de
// l'app : la bannière réapparaît une fois par SESSION (contrairement au hint
// swipe, vu une seule fois à vie), tant que l'utilisateur n'a rejoint/créé
// aucune communauté.
let shownThisSession = false;

// Bannière promo "Crée ou rejoins une communauté" affichée en tête du feed,
// une fois par session app — pour orienter les utilisateurs vers l'onglet
// Découvrir à chaque nouvelle ouverture. Fermable manuellement (X).
export const CommunityPromoHint: React.FC<Props> = ({ onPress }) => {
  const [visible, setVisible] = useState(() => !shownThisSession);
  const opacity = useSharedValue(0);
  const arrowBob = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    opacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    arrowBob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 550, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismiss = () => {
    shownThisSession = true;
    opacity.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
  };

  const handlePress = () => {
    dismiss();
    onPress();
  };

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: arrowBob.value * 5 },
      { translateX: arrowBob.value * 4 },
    ],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrap, containerStyle]}>
      <LinearGradient
        colors={['#3B1B6B', '#5B2E9E', '#2D3F8F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
          <Icon name="x" size={16} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <View style={styles.row}>
          <LinearGradient
            colors={['#B14FE8', '#5B7CFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Icon name="users" size={22} color="#fff" />
          </LinearGradient>

          <View style={styles.textCol}>
            <Text style={styles.title}>
              Crée ou rejoins une{' '}
              <Text style={styles.titleAccent}>communauté</Text>
              {' '}pour profiter du max !
            </Text>
            <Text style={styles.subtitle}>
              Échange, partage, découvre, fais-toi de nouveaux amis et bien plus encore !
            </Text>
          </View>
        </View>

        <Pressable onPress={handlePress} style={styles.ctaBtn}>
          <LinearGradient
            colors={['#E85DAD', '#5B9CFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>Voir les communautés</Text>
            <Icon name="arrow-right" size={15} color="#fff" />
          </LinearGradient>
        </Pressable>

        {/* Flèche pointant vers l'onglet "Découvrir" de la tab bar, en bas de
            l'écran — bob discret pour attirer l'œil sans distraire. */}
        <Animated.View style={[styles.arrowWrap, arrowStyle]} pointerEvents="none">
          <Icon name="corner-right-down" size={26} color="#E85DAD" />
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 6,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    overflow: 'visible',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 18,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
    lineHeight: 21,
  },
  titleAccent: {
    color: '#8FD9FF',
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 4,
  },
  ctaBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  ctaText: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  arrowWrap: {
    position: 'absolute',
    bottom: -22,
    right: 28,
  },
});
