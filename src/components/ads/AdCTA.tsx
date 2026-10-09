/**
 * AdCTA — l'appel à l'action éditorial + son système d'apparition, partagé par
 * Feed / overlay recherche. (Reels a son propre bouton CTA compact, sur la
 * même ligne que le nom de l'annonceur — voir AdSlide dans ReelsScreen.tsx.)
 *
 * Principe (direction « premium éditorial ») :
 *  1. au repos : discret — lien texte.
 *  2. `activated` passe à true → entrée chorégraphiée : le repos se replie, le
 *     CTA « riche » se déplie (crossfade), une accroche (shine + pulsation
 *     discrète) revient toutes les ~4.8s — assez rare pour rester confiant,
 *     jamais agressif.
 *  3. stable : ne réagit qu'au tap (scale 0.97).
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

export const AdCTA: React.FC<Props> = ({ ad, context, activated, onPress }) => {
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

  // Progression du morphing repos → riche (0 = repos, 1 = riche).
  const morph = useSharedValue(0);
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

  useEffect(() => {
    if (!activated) return;
    morph.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    shine.value = withDelay(120, repeatingShine(520, Easing.out(Easing.quad)));
    pulse.value = withDelay(120, repeatingPulse(520));
  }, [activated, morph, shine, pulse]);

  const restStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0, 0.6], [1, 0]),
    height: interpolate(morph.value, [0, 1], [1, 0]) === 0 ? 0 : undefined,
    transform: [{ translateY: interpolate(morph.value, [0, 1], [0, -4]) }],
  }));
  const richStyle = useAnimatedStyle(() => ({
    opacity: morph.value,
    transform: [{ translateY: interpolate(morph.value, [0, 1], [6, 0]) }],
  }));
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
      {/* repos : lien texte */}
      <Animated.View style={[s.linkInner, restStyle]} pointerEvents={activated ? 'none' : 'auto'}>
        <Pressable style={s.linkRowNoBorder} onPress={onPress}>
          <Text style={[s.link, { color: colors.primary }]} numberOfLines={1}>Découvrir {label}</Text>
        </Pressable>
      </Animated.View>

      {/* riche : sous-titre + bouton sombre */}
      <Animated.View style={[s.feedRich, richStyle]} pointerEvents={activated ? 'auto' : 'none'}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.feedSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {ad.description || 'En savoir plus'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {buttons.map((btn, i) => {
            const IconComp = btn.iconSet === 'mci' ? MCIcon : Icon;
            const bg = btn.action === 'whatsapp' ? '#25D366' : colors.textPrimary;
            const fg = btn.action === 'whatsapp' ? '#fff' : colors.background;
            const handlePress = () => { onPress(); runAdButton(btn, ad); };
            // Shine/pulse (accroche animée) réservés au premier bouton — deux
            // boutons qui scintillent en même temps serait trop chargé visuellement.
            return i === 0 ? (
              <Animated.View key={btn.action} style={[btnStyle, s.btnShadowWrap, { shadowColor: bg }]}>
                <Pressable
                  style={[s.btnDarkSolid, { backgroundColor: bg }]}
                  onPress={handlePress} onPressIn={onIn} onPressOut={onOut}
                >
                  <Animated.View style={[s.shine, shineStyle]} pointerEvents="none" />
                  <Text style={[s.btnDarkTxt, { color: fg }]}>{btn.text}</Text>
                  <IconComp name={btn.icon} size={13} color={fg} />
                </Pressable>
              </Animated.View>
            ) : (
              <View key={btn.action} style={[s.btnShadowWrap, { shadowColor: bg }]}>
                <Pressable style={[s.btnDarkSolid, { backgroundColor: bg }]} onPress={handlePress}>
                  <Text style={[s.btnDarkTxt, { color: fg }]}>{btn.text}</Text>
                  <IconComp name={btn.icon} size={13} color={fg} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  link:   { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, flexShrink: 1 },
  linkRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginBottom: 13, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  linkRowNoBorder:{ flexDirection: 'row', alignItems: 'center', gap: 6 },

  feedWrap: { marginHorizontal: 14, marginBottom: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 56, justifyContent: 'center' },
  linkInner: { overflow: 'hidden' },
  feedRich: { flexDirection: 'row', alignItems: 'center', gap: 12, position: 'absolute', left: 0, right: 0, top: 12, bottom: 0 },
  feedSub:  { fontSize: 11.5, marginTop: 2 },
  // L'ombre est portée par ce wrapper (pas de overflow:hidden ici — une ombre
  // RN est coupée par overflow:hidden sur son propre conteneur sur iOS).
  btnShadowWrap: {
    borderRadius: 13,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 3,
  },
  // Coins doux + overflow:hidden ici uniquement, pour clipper le shine au borderRadius.
  btnDarkSolid: {
    position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 17, paddingVertical: 11, borderRadius: 13,
  },
  btnDarkTxt: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.1 },
  shine: { position: 'absolute', top: 0, bottom: 0, left: '88%', width: '36%', backgroundColor: 'rgba(255,255,255,0.4)', transform: [{ skewX: '-18deg' }] },
});
