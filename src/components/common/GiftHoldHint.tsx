import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence,
  withTiming, Easing, runOnJS,
} from 'react-native-reanimated';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';

const AUTO_HIDE_MS = 5500;
const ACCENT = '#4F8CFF';

// Variable de module (pas MMKV) — remise à false à chaque redémarrage de
// l'app : contrairement au hint swipe (vu une seule fois, pour toujours), le
// hint cadeau doit réapparaître une fois par SESSION.
let shownThisSession = false;

interface Props {
  /** Le parent doit passer true dès que l'utilisateur a fait le vrai geste
   * (long-press réel démarré) — force la disparition immédiate. */
  dismiss: boolean;
  /** Tant que true, le hint ne s'affiche pas — sert à ne jamais le superposer
   * à un autre tuto (ex: SwipeUpHint) affiché en même temps sur le même écran. */
  suppressed?: boolean;
}

// Overlay pédagogique "appuyez et maintenez pour envoyer un cadeau" (halo
// circulaire pulsant + icône de main, façon TikTok) affiché une fois par
// session app (contrairement au hint swipe, vu une seule fois à vie), jamais
// bloquant (pointerEvents="none"), et qui s'efface dès que l'utilisateur fait
// le vrai geste ou après un délai de sécurité si personne ne le fait.
export const GiftHoldHint: React.FC<Props> = ({ dismiss, suppressed }) => {
  const [everShown, setEverShown] = useState(() => !shownThisSession);
  const opacity = useSharedValue(0);
  const pulse = useSharedValue(0);

  const visible = everShown && !suppressed;

  useEffect(() => {
    if (!visible) return;
    opacity.value = withTiming(1, { duration: 250 });
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 1 }),
      ),
      -1,
      false,
    );
    const timer = setTimeout(() => hide(), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (dismiss && visible) hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismiss]);

  const hide = () => {
    shownThisSession = true;
    opacity.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) runOnJS(setEverShown)(false);
    });
  };

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.8 }],
  }));
  const handStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pulse.value * 0.08 }],
  }));

  if (!everShown || suppressed) return null;

  return (
    // pointerEvents="box-none" : le conteneur laisse passer les taps en dehors
    // de ses enfants (le geste réel sous-jacent reste intact) ; seul le
    // Pressable ci-dessous capte le tap, pour permettre à l'utilisateur de
    // fermer le hint manuellement sans jamais voler le tap au reste de l'écran.
    <Animated.View pointerEvents="box-none" style={[styles.container, containerStyle]}>
      <Pressable onPress={hide} hitSlop={16} style={styles.touchArea}>
        <View style={styles.circleWrap}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <View style={styles.circle}>
            <Animated.View style={handStyle}>
              <MCIcon name="gesture-tap-hold" size={30} color="#fff" />
            </Animated.View>
          </View>
        </View>
        <View style={styles.bubble}>
          <Text style={styles.label}>Appuyez et maintenez l'écran{'\n'}pour envoyer un cadeau</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Même emplacement que SwipeUpHint (top: 38%) — voir son commentaire pour le
  // raisonnement. Jamais affichés ensemble (suppressed tant que SwipeUpHint
  // n'est pas done), donc partager la position est sans risque.
  container: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    alignItems: 'center',
  },
  touchArea: {
    alignItems: 'center',
  },
  circleWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: ACCENT,
  },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  bubble: {
    marginTop: 10,
    maxWidth: 170,
    backgroundColor: 'rgba(20,20,30,0.85)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
  },
});
