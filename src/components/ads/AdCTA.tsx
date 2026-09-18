/**
 * AdCTA — l'appel à l'action éditorial + son système d'apparition, partagé par
 * Feed / Reels / overlay recherche.
 *
 * Principe (direction « premium éditorial ») :
 *  1. au repos : discret — lien texte (feed / search) ou hairline (reels).
 *  2. `activated` passe à true → entrée chorégraphiée : le repos se replie, le
 *     CTA « riche » se déplie (crossfade), UNE accroche (shine qui balaie 1×),
 *     puis plus rien.
 *  3. stable : ne réagit qu'au tap (scale 0.97).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring,
  Easing, interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { adAdvertiserLabel, adDomain, adIsPhone, type AdData } from './types';

type Context = 'feed' | 'reels' | 'search-overlay';

interface Props {
  ad: AdData;
  context: Context;
  activated: boolean;
  onPress: () => void;
}

const REEL_UNFOLD_DELAY = 900;   // ms après activation avant que la hairline se déplie
const REEL_CARD_DELAY   = 1200;  // ms avant crossfade hairline → carte

export const AdCTA: React.FC<Props> = ({ ad, context, activated, onPress }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const dom = adDomain(ad);
  const phone = adIsPhone(ad.cta_url);
  const ctaText = ad.cta_text || (phone ? 'Contactez-nous' : 'En savoir plus');
  const label = adAdvertiserLabel(ad);

  // ── search-overlay : jamais de bouton, juste un lien texte, pas d'anim propre ──
  if (context === 'search-overlay') {
    return (
      <Pressable style={[s.linkRow, { borderTopColor: colors.divider }]} onPress={onPress}>
        <Text style={[s.link, { color: colors.primary }]} numberOfLines={1}>
          Découvrir {label}
        </Text>
        {dom ? <Text style={[s.dom, { color: colors.textTertiary }]} numberOfLines={1}>{dom.toUpperCase()}</Text> : null}
      </Pressable>
    );
  }

  const dark = context === 'reels';

  // Progression du morphing repos → riche (0 = repos, 1 = riche).
  const morph = useSharedValue(0);
  // Balayage du shine (0 → 1, une passe).
  const shine = useSharedValue(0);
  // Déplié de la hairline reels (largeur 0 → 1).
  const rule = useSharedValue(0);
  // Press feedback.
  const press = useSharedValue(0);

  useEffect(() => {
    if (!activated) return;
    if (dark) {
      rule.value = withDelay(REEL_UNFOLD_DELAY, withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }));
      morph.value = withDelay(REEL_CARD_DELAY, withTiming(1, { duration: 220 }));
      shine.value = withDelay(REEL_CARD_DELAY + 120, withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) }));
    } else {
      // feed : le lien se replie et le bloc bouton se déplie
      morph.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      shine.value = withDelay(120, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
    }
  }, [activated, dark, morph, shine, rule]);

  const restStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0, 0.6], [1, 0]),
    height: interpolate(morph.value, [0, 1], [1, 0]) === 0 ? 0 : undefined,
    transform: [{ translateY: interpolate(morph.value, [0, 1], [0, -4]) }],
  }));
  const richStyle = useAnimatedStyle(() => ({
    opacity: morph.value,
    transform: [{ translateY: interpolate(morph.value, [0, 1], [6, 0]) }],
  }));
  const ruleStyle = useAnimatedStyle(() => ({ flexGrow: rule.value }));
  const goStyle = useAnimatedStyle(() => ({ opacity: rule.value }));
  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shine.value, [0, 1], [dark ? 92 : 88, -60]) }],
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
  }));
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.97]) }],
  }));

  const onIn = () => { press.value = withSpring(1, { damping: 15, stiffness: 300 }); };
  const onOut = () => { press.value = withSpring(0, { damping: 15, stiffness: 300 }); };

  // ── FEED ──────────────────────────────────────────────────────────────────
  if (!dark) {
    return (
      <View style={[s.feedWrap, { borderTopColor: colors.divider }]}>
        {/* repos : lien texte */}
        <Animated.View style={[s.linkInner, restStyle]} pointerEvents={activated ? 'none' : 'auto'}>
          <Pressable style={s.linkRowNoBorder} onPress={onPress}>
            <Text style={[s.link, { color: colors.primary }]} numberOfLines={1}>Découvrir {label}</Text>
            {dom ? <Text style={[s.dom, { color: colors.textTertiary }]}>{dom}</Text> : null}
          </Pressable>
        </Animated.View>

        {/* riche : sous-titre + bouton sombre */}
        <Animated.View style={[s.feedRich, richStyle]} pointerEvents={activated ? 'auto' : 'none'}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {dom ? <Text style={[s.dom, { color: colors.textTertiary }]} numberOfLines={1}>{dom.toUpperCase()}</Text> : null}
            <Text style={[s.feedSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {ad.description || 'En savoir plus'}
            </Text>
          </View>
          <Animated.View style={btnStyle}>
            <Pressable style={[s.btnDarkSolid, { backgroundColor: colors.textPrimary }]} onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
              <Animated.View style={[s.shine, shineStyle]} pointerEvents="none" />
              <Text style={s.btnDarkTxt}>{ctaText}</Text>
              <Icon name="arrow-right" size={13} color={colors.background} />
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  // ── REELS ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.reelWrap} pointerEvents="box-none">
      {/* hairline qui se déplie */}
      <Animated.View style={[s.reelHairline, { opacity: morph.value < 1 ? 1 : 0 }]} pointerEvents="none">
        <Animated.View style={[s.rule, ruleStyle]} />
        <Animated.Text style={[s.go, goStyle]}>{ctaText} →</Animated.Text>
      </Animated.View>

      {/* carte CTA */}
      <Animated.View style={[s.reelCard, richStyle]} pointerEvents={morph.value > 0.5 ? 'auto' : 'none'}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.reelHd} numberOfLines={1}>{label}</Text>
          <Text style={s.reelSd} numberOfLines={1}>{ad.description || (phone ? ad.cta_url : dom)}</Text>
        </View>
        <Animated.View style={btnStyle}>
          <Pressable style={s.pillWhite} onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
            <Animated.View style={[s.shinePurple, shineStyle]} pointerEvents="none" />
            <Text style={s.pillWhiteTxt}>{ctaText}</Text>
            <Icon name={phone ? 'phone' : 'arrow-right'} size={12} color="#0E0D1F" />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  // shared
  link:   { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, flexShrink: 1 },
  dom:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  linkRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginBottom: 13, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  linkRowNoBorder:{ flexDirection: 'row', alignItems: 'center', gap: 6 },

  // feed
  feedWrap: { marginHorizontal: 14, marginBottom: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 56, justifyContent: 'center' },
  linkInner: { overflow: 'hidden' },
  feedRich: { flexDirection: 'row', alignItems: 'center', gap: 12, position: 'absolute', left: 0, right: 0, top: 12, bottom: 0 },
  feedSub:  { fontSize: 11.5, marginTop: 2 },
  btnDarkSolid: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10 },
  btnDarkTxt: { color: '#fff', fontSize: 12.5, fontWeight: '700', letterSpacing: -0.1 },
  shine: { position: 'absolute', top: 0, bottom: 0, left: '88%', width: '36%', backgroundColor: 'rgba(255,255,255,0.4)', transform: [{ skewX: '-18deg' }] },

  // reels
  reelWrap:   { position: 'absolute', left: 18, right: 18, bottom: 20, minHeight: 44, justifyContent: 'flex-end' },
  reelHairline:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule:       { height: 1, backgroundColor: 'rgba(255,255,255,0.28)' },
  go:         { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  reelCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, position: 'absolute', left: 0, right: 0, bottom: 0 },
  reelHd:     { fontSize: 12.5, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  reelSd:     { fontSize: 10.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  pillWhite:  { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  pillWhiteTxt:{ color: '#0E0D1F', fontSize: 12.5, fontWeight: '700' },
  shinePurple: { position: 'absolute', top: 0, bottom: 0, left: '92%', width: '40%', backgroundColor: 'rgba(123,63,242,0.35)', transform: [{ skewX: '-18deg' }] },
});
