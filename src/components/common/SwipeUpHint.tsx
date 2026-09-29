import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence,
  withTiming, withDelay, Easing, runOnJS,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { storage } from '../../utils/storage';

const STORAGE_KEY = 'reels_swipe_hint_seen';
const AUTO_HIDE_MS = 5500;

// Un cycle = un chevron qui "part" du bas (opaque, position de repart) et
// monte jusqu'en haut en s'effaçant — le vrai mouvement de swipe, pas un
// pulse sur place. RISE_DISTANCE est l'amplitude du déplacement en pixels.
const RISE_DISTANCE = 26;
const RISE_DURATION = 620;
const CYCLE_MS = 900;

interface Props {
  /** Le parent doit passer true dès que l'utilisateur a fait le vrai geste
   * (premier swipe) — force la disparition immédiate, avant même le timeout. */
  dismiss: boolean;
  /** Appelé une fois — dès que ce hint a fini de s'afficher (auto-hide, dismiss,
   * ou jamais affiché car déjà vu) — pour que le parent puisse n'autoriser un
   * autre tuto (ex: GiftHoldHint) qu'une fois celui-ci hors du chemin. */
  onDone?: () => void;
}

// Un chevron qui monte puis s'efface, en boucle, avec un `delay` propre à
// chaque instance — l'empilement de 3 chevrons légèrement décalés dans le
// temps crée l'illusion d'un flux continu montant vers le haut (même
// principe que le hint TikTok), pas un simple clignotement sur place.
const RisingChevron: React.FC<{ delay: number; size: number }> = ({ delay, size }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: RISE_DURATION, easing: Easing.out(Easing.cubic) }),
          withDelay(CYCLE_MS - RISE_DURATION, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -progress.value * RISE_DISTANCE }],
  }));

  return (
    <Animated.View style={[styles.chevronAbs, style]}>
      <Icon name="chevron-up" size={size} color="#fff" />
    </Animated.View>
  );
};

// Overlay pédagogique "glissez vers le haut" (chevrons lumineux qui montent en
// continu, façon TikTok) affiché une seule fois par installation (flag MMKV,
// lu de façon synchrone — pas de flash au montage), jamais bloquant
// (pointerEvents="none"), et qui s'efface dès que l'utilisateur fait le geste
// réel ou après un délai de sécurité si personne ne le fait.
export const SwipeUpHint: React.FC<Props> = ({ dismiss, onDone }) => {
  const [visible, setVisible] = useState(() => !storage.getBoolean(STORAGE_KEY));
  const opacity = useSharedValue(0);
  const lift = useSharedValue(8);

  useEffect(() => {
    if (!visible) {
      onDone?.();
      return;
    }
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
    lift.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
    const timer = setTimeout(() => hide(), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (dismiss && visible) hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismiss]);

  const hide = () => {
    storage.setBoolean(STORAGE_KEY, true);
    opacity.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
  };

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }],
  }));

  if (!visible) return null;

  return (
    // pointerEvents="box-none" : laisse passer les taps en dehors de ses
    // enfants (le swipe/tap réel sous-jacent reste intact) ; seul le
    // Pressable ci-dessous capte le tap pour permettre à l'utilisateur de
    // fermer le hint manuellement.
    <Animated.View pointerEvents="box-none" style={[styles.container, containerStyle]}>
      <Pressable onPress={hide} hitSlop={16} style={styles.touchArea}>
        <View style={styles.stage}>
          <RisingChevron delay={0}   size={26} />
          <RisingChevron delay={300} size={26} />
          <RisingChevron delay={600} size={26} />
        </View>
        <Text style={styles.label}>Glissez vers le haut</Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 150,
    alignSelf: 'center',
    alignItems: 'center',
  },
  touchArea: {
    alignItems: 'center',
  },
  stage: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 6,
    overflow: 'hidden',
  },
  chevronAbs: {
    position: 'absolute',
    bottom: 0,
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
});
