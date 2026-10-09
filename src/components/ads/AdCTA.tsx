/**
 * AdCTA — bouton(s) d'appel à l'action, partagé par Feed / overlay recherche.
 * (Reels a son propre bouton CTA compact, sur la même ligne que le nom de
 * l'annonceur — voir AdSlide dans ReelsScreen.tsx.)
 *
 * Le(s) bouton(s) sont affichés directement dès le montage, sans état "repos"
 * intermédiaire (ex-lien discret "Découvrir {annonceur}") — l'action doit être
 * visible et actionnable immédiatement, pas après un délai. Une accroche
 * (shine + pulsation discrète) revient toutes les ~4.8s sur le premier bouton,
 * assez rare pour rester confiant, jamais agressif.
 *
 * Bouton — ombre portée par un wrapper dédié (jamais le conteneur qui clippe
 * le shine, une ombre RN est coupée par overflow:hidden sur iOS).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring,
  withRepeat, withSequence, Easing, interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { adAdvertiserLabel, adContactButtons, runAdButton, type AdData } from './types';

type Context = 'feed' | 'search-overlay';

interface Props {
  ad: AdData;
  context: Context;
  activated: boolean;
  onPress: () => void;
}

// Pause allongée (4.8s) : un rappel plus rare paraît plus confiant/premium
// qu'un rappel fréquent qui donne une impression de sollicitation.
const SHINE_PAUSE_MS = 4800;

export const AdCTA: React.FC<Props> = ({ ad, context, onPress }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const buttons = adContactButtons(ad);
  const label = adAdvertiserLabel(ad);

  // ── search-overlay : jamais de bouton, juste un lien texte, pas d'anim propre ──
  if (context === 'search-overlay') {
    return (
      <Pressable style={[s.linkRow, { borderTopColor: colors.divider }]} onPress={onPress}>
        <Text style={[s.link, { color: colors.primary }]} numberOfLines={1}>
          Découvrir {label}
        </Text>
      </Pressable>
    );
  }

  // Balayage du shine (0 → 1, une passe).
  const shine = useSharedValue(0);
  // Pulsation douce du bouton, synchronisée avec le shine (même cycle) — renforce
  // l'appel à l'action sans ajouter de mouvement continu qui distrairait.
  const pulse = useSharedValue(1);
  // Press feedback.
  const press = useSharedValue(0);

  // Un balayage, puis un reset instantané (durée 0, invisible car shineStyle
  // masque déjà l'opacité aux bornes 0/1), puis une pause — répété indéfiniment
  // tant que le CTA reste affiché, pour attirer l'œil sans rester agressif.
  const repeatingShine = (duration: number, easing: any) =>
    withRepeat(
      withSequence(
        withTiming(1, { duration, easing }),
        withTiming(0, { duration: 0 }),
        withDelay(SHINE_PAUSE_MS, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );

  // Même cycle total que repeatingShine (durée du balayage + pause), pour que
  // la pulsation retombe pile quand le shine s'efface. Amplitude discrète
  // (1.02) — un mouvement plus discret lit "confiant", un mouvement plus
  // ample lit "gadget".
  const repeatingPulse = (duration: number) =>
    withRepeat(
      withSequence(
        withTiming(1.02, { duration: duration / 2, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: duration / 2, easing: Easing.in(Easing.quad) }),
        withDelay(SHINE_PAUSE_MS, withTiming(1, { duration: 0 })),
      ),
      -1,
      false,
    );

  // Démarre dès le montage — le bouton est visible et actionnable immédiatement,
  // l'accroche shine/pulse n'est qu'une animation d'appel, pas une condition
  // d'apparition.
  useEffect(() => {
    shine.value = withDelay(120, repeatingShine(520, Easing.out(Easing.quad)));
    pulse.value = withDelay(120, repeatingPulse(520));
  }, [shine, pulse]);

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shine.value, [0, 1], [88, -60]) }],
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
  }));
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.97]) * pulse.value }],
  }));

  const onIn = () => { press.value = withSpring(1, { damping: 15, stiffness: 300 }); };
  const onOut = () => { press.value = withSpring(0, { damping: 15, stiffness: 300 }); };

  return (
    <View style={[s.feedWrap, { borderTopColor: colors.divider }]}>
      <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
        {buttons.map((btn, i) => {
          const IconComp = btn.iconSet === 'mci' ? MCIcon : Icon;
          const bg = btn.action === 'whatsapp' ? '#25D366' : colors.textPrimary;
          const fg = btn.action === 'whatsapp' ? '#fff' : colors.background;
          const handlePress = () => { onPress(); runAdButton(btn, ad); };
          // Shine/pulse (accroche animée) réservés au premier bouton — deux
          // boutons qui scintillent en même temps serait trop chargé visuellement.
          return i === 0 ? (
            <Animated.View key={btn.action} style={[btnStyle, s.btnShadowWrap, { flex: 1, shadowColor: bg }]}>
              <Pressable
                style={[s.btnDarkSolid, s.btnFull, { backgroundColor: bg }]}
                onPress={handlePress} onPressIn={onIn} onPressOut={onOut}
              >
                <Animated.View style={[s.shine, shineStyle]} pointerEvents="none" />
                <Text style={[s.btnDarkTxt, { color: fg }]}>{btn.text}</Text>
                <IconComp name={btn.icon} size={13} color={fg} />
              </Pressable>
            </Animated.View>
          ) : (
            <View key={btn.action} style={[s.btnShadowWrap, { flex: 1, shadowColor: bg }]}>
              <Pressable style={[s.btnDarkSolid, s.btnFull, { backgroundColor: bg }]} onPress={handlePress}>
                <Text style={[s.btnDarkTxt, { color: fg }]}>{btn.text}</Text>
                <IconComp name={btn.icon} size={13} color={fg} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  link:   { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, flexShrink: 1 },
  linkRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginBottom: 13, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  linkRowNoBorder:{ flexDirection: 'row', alignItems: 'center', gap: 6 },

  feedWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  // L'ombre est portée par ce wrapper (pas de overflow:hidden ici — une ombre
  // RN est coupée par overflow:hidden sur son propre conteneur sur iOS).
  btnShadowWrap: {
    borderRadius: 13,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 3,
  },
  // Coins doux + overflow:hidden ici uniquement, pour clipper le shine au borderRadius.
  btnDarkSolid: {
    position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingHorizontal: 17, paddingVertical: 11, borderRadius: 13,
  },
  // Bouton qui remplit toute la largeur de son wrapper flex:1 (1 ou 2 boutons
  // se partagent la ligne à parts égales, plus de sous-titre à côté).
  btnFull: { width: '100%' },
  btnDarkTxt: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.1 },
  shine: { position: 'absolute', top: 0, bottom: 0, left: '88%', width: '36%', backgroundColor: 'rgba(255,255,255,0.4)', transform: [{ skewX: '-18deg' }] },
});
