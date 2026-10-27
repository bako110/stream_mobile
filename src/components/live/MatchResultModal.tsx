/**
 * MatchResultModal — annonce du résultat d'un match 1 vs 1 (battle classique ou
 * match de tournoi), même design partout dans l'app : écran champion doré à
 * pétales tombantes pour le vainqueur, réconfort/encouragement pour le perdant,
 * carte neutre pour un match nul. Utilisé par BattleScreen (le joueur/spectateur
 * qui regarde le live jusqu'au bout), TournamentBracketScreen (participant resté
 * sur le bracket) et LiveOneVsOneScreen (spectateur resté sur la liste) — pour que
 * le résultat soit annoncé de façon identique quel que soit l'écran d'où on le voit.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions, Modal } from 'react-native';
import Animated, {
  FadeIn, BounceIn, ZoomIn, useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight } from '../../theme';

const { height: SCREEN_H } = Dimensions.get('window');
const PETALS = ['🌸', '🌼', '✨', '🌟', '🎉'];

function FallingPetal({ left, delay, duration, emoji }: { left: number; delay: number; duration: number; emoji: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: Easing.linear }));
  }, []); // eslint-disable-line

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * (SCREEN_H * 0.55) },
      { translateX: Math.sin(progress.value * Math.PI * 2) * 18 },
      { rotate: `${progress.value * 360}deg` },
    ],
    opacity: progress.value < 0.05 ? progress.value / 0.05 : progress.value > 0.85 ? (1 - progress.value) / 0.15 : 1,
  }));

  return (
    <Animated.Text pointerEvents="none" style={[s.fallingPetal, { left }, style]}>{emoji}</Animated.Text>
  );
}

export interface MatchResultData {
  isDraw: boolean;
  /** 'won'/'lost' si le spectateur est l'un des deux participants, 'spectator' sinon */
  viewerRole: 'won' | 'lost' | 'spectator';
  winnerName: string;
  loserName: string;
  winnerAvatar?: string | null;
  scoreA: number;
  scoreB: number;
  /** Optionnel — gain GoGold du vainqueur (battles classiques uniquement, pas les matchs de tournoi) */
  winnerGoGold?: number | null;
  /** Optionnel — pénalité de forfait à afficher côté perdant/vainqueur */
  forfeitPenalty?: number | null;
  forfeitByMe?: boolean;
}

// Délai avant fermeture automatique — assez long pour lire le résultat
// (score, gain GoGold, message) sans que l'utilisateur ait à taper "Fermer"
// lui-même ; le bouton reste utilisable pour fermer plus tôt s'il le souhaite.
const AUTO_CLOSE_DELAY = 6000;

// Passe par une ref (toujours à jour) plutôt que de capturer onClose
// directement dans le setTimeout — onClose est recréé à chaque changement de
// ses propres dépendances côté parent (ex: handleClose dépend de battle/isHost
// dans BattleScreen.tsx), une closure figée sur la version du tout premier
// montage risquait d'appeler une version périmée (ex: qui rouvrait encore une
// confirmation "Quitter le battle ?" au lieu de fermer directement une fois le
// match terminé), ce qui donnait l'impression que l'auto-close ne faisait rien.
function useAutoClose(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_DELAY);
    return () => clearTimeout(t);
  }, [active]);
}

export const MatchResultModal: React.FC<{ result: MatchResultData | null; onClose: () => void }> = ({ result, onClose }) => {
  useAutoClose(!!result, onClose);
  const insets = useSafeAreaInsets();

  if (!result) return null;

  if (result.isDraw) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <View style={s.endedOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
          <Animated.View entering={BounceIn.duration(700).delay(150)}>
            <View style={[s.endedCard, { paddingBottom: 28 + insets.bottom, backgroundColor: '#7B3FF2' }]}>
              <View style={s.handle} />
              <Animated.View entering={ZoomIn.duration(500).delay(400)}>
                <Icon name="award" size={48} color="#FFD700" />
              </Animated.View>
              <Text style={s.endedTitle}>Match nul !</Text>
              <Text style={s.endedScore}>{result.scoreA} — {result.scoreB}</Text>
              <Text style={s.comfortSubtitle}>{result.winnerName} et {result.loserName} terminent à égalité.</Text>
              <TouchableOpacity style={s.endedBtn} onPress={onClose}>
                <Text style={s.endedBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  if (result.viewerRole === 'lost') {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <View style={s.endedOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
          <Animated.View entering={FadeIn.duration(700).delay(150)}>
            <View style={[s.comfortCard, { paddingBottom: 26 + insets.bottom, backgroundColor: '#3A3F52' }]}>
              <View style={s.handle} />
              <Animated.View entering={ZoomIn.duration(500).delay(300)}>
                <Text style={s.comfortEmoji}>💙</Text>
              </Animated.View>
              <Text style={s.comfortTitle}>Ce n'est que partie remise</Text>
              <Text style={s.comfortSubtitle}>
                {result.winnerName} remporte ce match, mais chaque champion a connu la défaite avant de gagner.
              </Text>
              <Text style={s.comfortScore}>{result.scoreA} — {result.scoreB}</Text>
              {!!result.forfeitPenalty && result.forfeitByMe && (
                <View style={s.comfortPenaltyBox}>
                  <Icon name="arrow-up-right" size={14} color="#F0365A" />
                  <Text style={s.comfortPenaltyText}>
                    {result.forfeitPenalty.toLocaleString('fr-FR')} GoGold reversés à ton adversaire pour avoir quitté en menant
                  </Text>
                </View>
              )}
              <View style={s.comfortEncourageBox}>
                <Icon name="trending-up" size={16} color="#9B65F5" />
                <Text style={s.comfortEncourageText}>La prochaine victoire est pour toi. Reviens plus fort !</Text>
              </View>
              <TouchableOpacity style={s.comfortBtn} onPress={onClose}>
                <Text style={s.comfortBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // Champion — vainqueur ET spectateurs voient ce même écran doré à pétales
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.endedOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        {Array.from({ length: 18 }).map((_, i) => (
          <FallingPetal
            key={i}
            left={Math.random() * (Dimensions.get('window').width - 24)}
            delay={i * 140}
            duration={2600 + Math.random() * 1400}
            emoji={PETALS[i % PETALS.length]}
          />
        ))}
        <Animated.View entering={BounceIn.duration(800).delay(150)}>
          <View style={[s.championCard, { backgroundColor: '#FFD700' }]}>
            <View style={[s.championInnerBorder, { paddingBottom: 30 + insets.bottom }]}>
              <View style={s.handle} />
              <Animated.View entering={ZoomIn.duration(600).delay(400)}>
                <Text style={s.championCrown}>👑</Text>
              </Animated.View>

              <Text style={s.championTitle}>
                {result.viewerRole === 'won' ? 'CHAMPION DU MATCH' : `${result.winnerName.toUpperCase()} GAGNE LE MATCH`}
              </Text>

              <Animated.View entering={ZoomIn.duration(500).delay(550)} style={s.championAvatarWrap}>
                {result.winnerAvatar
                  ? <Image source={{ uri: result.winnerAvatar }} style={s.championAvatar} />
                  : <View style={[s.championAvatar, s.championAvatarFallback]}><Icon name="user" size={30} color="#fff" /></View>}
                <Text style={s.championCrownOnAvatar}>👑</Text>
              </Animated.View>

              <Text style={s.championName} numberOfLines={1}>{result.winnerName}</Text>

              {!!result.winnerGoGold && (
                <View style={s.championGogoldRow}>
                  <Text style={s.championGogoldEmoji}>🪙</Text>
                  <Text style={s.championGogoldText}>{result.winnerGoGold.toLocaleString('fr-FR')} GoGold</Text>
                </View>
              )}

              {!!result.forfeitPenalty && !result.forfeitByMe && (
                <View style={s.championBonusBox}>
                  <Icon name="gift" size={13} color="#fff" />
                  <Text style={s.championBonusText}>
                    +{result.forfeitPenalty.toLocaleString('fr-FR')} GoGold bonus — l'adversaire a abandonné en menant
                  </Text>
                </View>
              )}

              <Text style={s.championScore}>{result.scoreA} — {result.scoreB}</Text>

              <TouchableOpacity style={s.championBtn} onPress={onClose}>
                <Text style={s.championBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  endedOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 70 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.4)' },
  endedCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 28, alignItems: 'center', gap: 12 },
  endedTitle: { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.extraBold },
  endedScore: { color: 'rgba(255,255,255,0.9)', fontSize: FontSize['3xl'], fontWeight: FontWeight.black },
  endedBtn: { marginTop: 8, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 28 },
  endedBtnText: { color: '#4C1D95', fontSize: FontSize.base, fontWeight: FontWeight.extraBold },

  comfortCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 26, alignItems: 'center', gap: 10 },
  comfortEmoji: { fontSize: FontSize['5xl'], marginBottom: 2 },
  comfortTitle: { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.extraBold, textAlign: 'center' },
  comfortSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.smPlus, fontWeight: FontWeight.medium, textAlign: 'center', lineHeight: 19 },
  comfortScore: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize['2xl'], fontWeight: FontWeight.black, marginTop: 4 },
  comfortEncourageBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(155,101,245,0.15)',
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, marginTop: 6,
    borderWidth: 1, borderColor: 'rgba(155,101,245,0.3)',
  },
  comfortEncourageText: { color: '#C4A8FA', fontSize: FontSize.sm, fontWeight: FontWeight.bold, flexShrink: 1 },
  comfortPenaltyBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(240,54,90,0.12)',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginTop: 2,
    borderWidth: 1, borderColor: 'rgba(240,54,90,0.3)',
  },
  comfortPenaltyText: { color: '#F0365A', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, flexShrink: 1 },
  comfortBtn: { marginTop: 10, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 28 },
  comfortBtnText: { color: '#3A3F52', fontSize: FontSize.base, fontWeight: FontWeight.extraBold },

  fallingPetal: { position: 'absolute', top: -20, fontSize: FontSize['2xl'], zIndex: 71 },
  championCard: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 4 },
  championInnerBorder: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 22, paddingHorizontal: 24, alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(20,14,4,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', borderBottomWidth: 0,
  },
  championCrown: { fontSize: FontSize['5xl'], marginBottom: 2 },
  championTitle: {
    color: '#fff', fontSize: FontSize.basePlus, fontWeight: FontWeight.black, letterSpacing: 1.5, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  championAvatarWrap: { marginTop: 8, position: 'relative' },
  championAvatar: {
    width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#FFD700',
    shadowColor: '#FFD700', shadowOpacity: 0.9, shadowRadius: 16, elevation: 12,
  },
  championAvatarFallback: { backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  championCrownOnAvatar: { position: 'absolute', top: -22, alignSelf: 'center', fontSize: 30 },
  championName: { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.black, marginTop: 4 },
  championGogoldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4,
  },
  championGogoldEmoji: { fontSize: FontSize.md },
  championGogoldText: { color: '#FFD700', fontSize: FontSize.md, fontWeight: FontWeight.black },
  championBonusBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12, marginTop: 2, maxWidth: '90%',
  },
  championBonusText: { color: '#fff', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, flexShrink: 1, textAlign: 'center' },
  championScore: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.md, fontWeight: FontWeight.bold, marginTop: 4 },
  championBtn: { marginTop: 10, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 32 },
  championBtnText: { color: '#B8860B', fontSize: FontSize.base, fontWeight: FontWeight.black },
});
