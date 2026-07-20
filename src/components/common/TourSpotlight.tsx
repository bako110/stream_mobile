import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay,
  Easing,
} from 'react-native-reanimated';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuidedTour, TourTargetLayout } from '../../context/GuidedTourContext';

// Distance parcourue par le doigt de démo — assez longue pour lire clairement
// "ça glisse", pas juste une icône qui vibre sur place.
const SWIPE_TRAVEL = 190;
// Durées de chaque phase du cycle (ms) — pose du doigt → glissement → pause haute
// → reset invisible en bas → recommence. Le total (≈2.6s) laisse le temps de lire
// le geste sans que ça paraisse haché ni trop lent.
const SWIPE_HOLD_MS  = 350;
const SWIPE_MOVE_MS  = 550;
const SWIPE_FADE_MS  = 200;
const SWIPE_PAUSE_MS = 450;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface StepConfig {
  message: string;
  icon: string;
  // 'point' = main statique qui tapote vers la cible (bouton à presser)
  // 'swipe' = main qui glisse verticalement (geste à reproduire, pas une cible fixe)
  kind: 'point' | 'swipe';
  // Où poser le message texte par rapport au trou — évite qu'il sorte de l'écran
  // selon la position de la cible (en haut de la tab bar → message au-dessus).
  messagePosition: 'above' | 'below';
}

const STEP_CONFIG: Record<string, StepConfig> = {
  feed_create_button: {
    message: 'Appuie ici pour publier ton premier contenu',
    icon: 'hand-pointing-up',
    kind: 'point',
    messagePosition: 'above',
  },
  reels_swipe: {
    message: 'Glisse vers le haut pour découvrir le reel suivant',
    icon: 'gesture-swipe-vertical',
    kind: 'swipe',
    messagePosition: 'below',
  },
};

/**
 * Overlay plein écran : assombrit tout sauf un "trou" lumineux autour de la cible
 * courante (mesurée via useTourTarget dans l'écran qui la possède), affiche une
 * main animée (tapote ou glisse selon l'étape) et un message court. Rendu UNE FOIS
 * au niveau racine (RootNavigator) — jamais par écran, pour survivre à la
 * navigation entre Accueil et Reels sans se remonter.
 */
export const TourSpotlight: React.FC = () => {
  const { currentStep, isTourActive, getTargetLayout, advance, skipTour, isScreenPresent } = useGuidedTour();
  const insets = useSafeAreaInsets();

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!isTourActive) return;
    const config = currentStep ? STEP_CONFIG[currentStep] : null;
    if (config?.kind === 'swipe') return; // animée séparément par SwipeHandDemo
    pulse.value = 0;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }),
        withDelay(150, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
  }, [isTourActive, currentStep, pulse]);

  const handAnim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pulse.value * 0.12 }], opacity: 1,
  }));

  if (!isTourActive || !currentStep) return null;

  const config = STEP_CONFIG[currentStep];

  // Mode "swipe" (Reels) : pas de cible fixe à découper, juste une démonstration de
  // geste centrée à l'écran, pointerEvents="none" pour laisser le vrai swipe de la
  // FlatList passer à travers — se referme automatiquement dès que ReelsScreen
  // détecte un vrai scroll (voir advance() appelé depuis ReelsScreen), pas de
  // bouton "Compris" ici : le geste réel EST la validation.
  if (config.kind === 'swipe') {
    // N'affiche l'indication swipe que si ReelsScreen a explicitement signalé sa
    // présence/focus (voir setScreenPresence dans ReelsScreen) — sans ça, cette
    // étape plein écran sans cible mesurable pourrait s'afficher par erreur
    // pendant que l'utilisateur navigue encore sur un autre écran.
    if (!isScreenPresent(currentStep)) return null;
    return <SwipeHandDemo message={config.message} bottomOffset={insets.bottom + 140} />;
  }

  const layout = getTargetLayout(currentStep);
  // Cible pas encore mesurée (écran pas monté / élément pas encore layouté) —
  // n'affiche rien plutôt qu'un spotlight mal placé ou plein écran par erreur.
  if (!layout) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 4 bandes opaques autour du trou — pas un seul calque avec un "trou" réel
          (nécessiterait un masque SVG/natif), plus simple et fiable en RN pur. */}
      <SpotlightMask layout={layout} />

      {/* Main animée — positionnée au centre du trou */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.handWrap,
          { left: layout.x + layout.width / 2 - 22, top: layout.y + layout.height / 2 - 22 },
          handAnim,
        ]}
      >
        <MCIcon name={config.icon} size={44} color="#fff" style={styles.handIcon} />
      </Animated.View>

      {/* Message + actions */}
      <View
        style={[
          styles.messageWrap,
          config.messagePosition === 'above'
            ? { bottom: SCREEN_H - layout.y + 16 }
            : { top: layout.y + layout.height + 16 },
        ]}
        pointerEvents="box-none"
      >
        <Text style={styles.messageText}>{config.message}</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={skipTour} activeOpacity={0.7} style={styles.skipBtn}>
            <Text style={styles.skipText}>Passer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={advance} activeOpacity={0.85} style={styles.nextBtn}>
            <Text style={styles.nextText}>Compris</Text>
            <Icon name="check" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ── Démo de swipe — vraie main qui descend, se pose, glisse, s'efface ──────────
// Contrairement à l'ancienne version (icône figée qui vibrait sur place), ceci
// reproduit le geste réel : la main apparaît en bas, un halo de contact marque le
// point où le doigt "touche" l'écran, puis l'ensemble glisse vers le haut sur une
// vraie distance (SWIPE_TRAVEL) en s'estompant, avant de recommencer le cycle.
const SwipeHandDemo: React.FC<{ message: string; bottomOffset: number }> = ({ message, bottomOffset }) => {
  const progress = useSharedValue(0); // 0 = posée en bas, 1 = arrivée en haut
  const contactOpacity = useSharedValue(0);

  useEffect(() => {
    const cycle = () => {
      progress.value = 0;
      contactOpacity.value = 0;
      // 1. Le halo de contact apparaît (le doigt "se pose")
      contactOpacity.value = withTiming(1, { duration: 180 });
      // 2. Après la pose, la main+halo glissent ensemble vers le haut, puis
      //    s'effacent une fois arrivés — et on relance un nouveau cycle.
      progress.value = withDelay(
        SWIPE_HOLD_MS,
        withTiming(1, { duration: SWIPE_MOVE_MS, easing: Easing.out(Easing.cubic) }),
      );
      contactOpacity.value = withDelay(
        SWIPE_HOLD_MS + SWIPE_MOVE_MS - SWIPE_FADE_MS,
        withTiming(0, { duration: SWIPE_FADE_MS }),
      );
    };
    cycle();
    const totalCycle = SWIPE_HOLD_MS + SWIPE_MOVE_MS + SWIPE_PAUSE_MS;
    const interval = setInterval(cycle, totalCycle);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -progress.value * SWIPE_TRAVEL }],
    opacity: contactOpacity.value,
  }));
  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -progress.value * SWIPE_TRAVEL }, { scale: 0.7 + contactOpacity.value * 0.3 }],
    opacity: contactOpacity.value * 0.5,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.swipeHalo, haloStyle]} />
      <Animated.View style={[styles.swipeHandWrap, handStyle]}>
        <MCIcon name="hand-back-right" size={40} color="#fff" style={styles.handIcon} />
      </Animated.View>
      <View style={[styles.swipeArrowRow, { bottom: bottomOffset + 64 }]}>
        <Icon name="chevron-up" size={16} color="rgba(255,255,255,0.6)" />
        <Icon name="chevron-up" size={20} color="rgba(255,255,255,0.85)" />
      </View>
      <Text style={[styles.messageText, styles.swipeMessage, { bottom: bottomOffset }]}>
        {message}
      </Text>
    </View>
  );
};

// ── Masque 4-bandes ─────────────────────────────────────────────────────────────
const HOLE_PADDING = 8;

const SpotlightMask: React.FC<{ layout: TourTargetLayout }> = ({ layout }) => {
  const holeX = layout.x - HOLE_PADDING;
  const holeY = layout.y - HOLE_PADDING;
  const holeW = layout.width + HOLE_PADDING * 2;
  const holeH = layout.height + HOLE_PADDING * 2;

  return (
    <>
      {/* Haut */}
      <View pointerEvents="auto" style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, holeY) }]} />
      {/* Bas */}
      <View pointerEvents="auto" style={[styles.dim, { top: holeY + holeH, left: 0, right: 0, bottom: 0 }]} />
      {/* Gauche */}
      <View pointerEvents="auto" style={[styles.dim, { top: holeY, left: 0, width: Math.max(0, holeX), height: holeH }]} />
      {/* Droite */}
      <View pointerEvents="auto" style={[styles.dim, { top: holeY, left: holeX + holeW, right: 0, height: holeH }]} />
      {/* Contour lumineux du trou */}
      <View pointerEvents="none" style={[styles.holeBorder, { top: holeY, left: holeX, width: holeW, height: holeH }]} />
    </>
  );
};

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  holeBorder: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  handWrap: {
    position: 'absolute',
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  swipeHandWrap: {
    position: 'absolute',
    left: SCREEN_W / 2 - 24,
    top: SCREEN_H * 0.62 - 24,
    width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  swipeHalo: {
    position: 'absolute',
    left: SCREEN_W / 2 - 30,
    top: SCREEN_H * 0.62 - 30,
    width: 60, height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    zIndex: 1,
  },
  swipeArrowRow: {
    position: 'absolute',
    left: 0, right: 0,
    alignItems: 'center',
    gap: 2,
  },
  swipeMessage: {
    position: 'absolute',
    left: 20, right: 20,
  },
  handIcon: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  messageWrap: {
    position: 'absolute',
    left: 20, right: 20,
    alignItems: 'center',
    gap: 12,
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  skipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: '#7B3FF2',
  },
  nextText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
