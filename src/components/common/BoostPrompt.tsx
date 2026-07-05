/**
 * BoostPrompt — bottom sheet qui apparaît juste après une publication.
 * Invite l'utilisateur à booster son contenu.
 */
import React, { useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  visible: boolean;
  contentType: 'event' | 'concert' | 'post' | 'live';
  onBoost: () => void;
  onDismiss: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  event:   'ton événement',
  concert: 'ton concert',
  post:    'ton post',
  live:    'ton live',
};

const BOOST_PERKS: Record<string, { icon: string; text: string }[]> = {
  default: [
    { icon: 'trending-up', text: '10× plus de visibilité dans le feed' },
    { icon: 'users',       text: 'Touche des milliers de nouveaux utilisateurs' },
    { icon: 'zap',         text: 'Résultats visibles en moins de 5 minutes' },
  ],
  live: [
    { icon: 'radio',       text: 'Ton live affiché en tête du feed en direct' },
    { icon: 'users',       text: 'Attire plus de viewers pendant que tu streames' },
    { icon: 'zap',         text: 'Boost actif immédiatement, arrêtable à tout moment' },
  ],
};

export const BoostPrompt: React.FC<Props> = ({ visible, contentType, onBoost, onDismiss }) => {
  const { theme: { colors } } = useTheme();

  const translateY = useSharedValue(400);
  const overlayOp  = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      overlayOp.value  = withTiming(1, { duration: 250 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    } else {
      overlayOp.value  = withTiming(0, { duration: 200 });
      translateY.value = withTiming(400, { duration: 220 });
    }
  }, [visible]);

  const sheetStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  const label = TYPE_LABELS[contentType] ?? 'ton contenu';
  const perks = BOOST_PERKS[contentType] ?? BOOST_PERKS.default;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      {/* Overlay */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }, overlayStyle]} />
      </Pressable>

      {/* Sheet */}
      <Animated.View style={[s.sheet, { backgroundColor: colors.surface }, sheetStyle]}>

        {/* Handle */}
        <View style={[s.handle, { backgroundColor: colors.divider }]} />

        {/* Icône succès */}
        <View style={s.successRow}>
          <LinearGradient colors={['#10B981', '#059669']} style={s.successIcon}>
            <Icon name="check" size={22} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[s.successTitle, { color: colors.textPrimary }]}>
              {contentType === 'live' ? 'Tu es en direct !' : 'Publié avec succès !'}
            </Text>
            <Text style={[s.successSub, { color: colors.textSecondary }]}>
              {contentType === 'live'
                ? 'Ton live est lancé — booste-le pour attirer plus de viewers maintenant.'
                : `${label.charAt(0).toUpperCase() + label.slice(1)} est maintenant en ligne.`}
            </Text>
          </View>
        </View>

        {/* Séparateur */}
        <View style={[s.sep, { backgroundColor: colors.divider }]} />

        {/* Proposition boost */}
        <Text style={[s.boostTitle, { color: colors.textPrimary }]}>
          Booste {label} pour plus de portée
        </Text>
        <Text style={[s.boostSub, { color: colors.textSecondary }]}>
          Dépense quelques GoGold pour être vu par beaucoup plus de monde.
        </Text>

        {/* Avantages */}
        <View style={s.perks}>
          {perks.map(p => (
            <View key={p.icon} style={s.perkRow}>
              <View style={[s.perkIcon, { backgroundColor: '#7B3FF215' }]}>
                <Icon name={p.icon} size={13} color="#7B3FF2" />
              </View>
              <Text style={[s.perkText, { color: colors.textSecondary }]}>{p.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA boost */}
        <TouchableOpacity onPress={onBoost} activeOpacity={0.88} style={{ borderRadius: 14, overflow: 'hidden', marginTop: 4 }}>
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.boostBtn}
          >
            <Icon name="zap" size={15} color="#fff" />
            <Text style={s.boostBtnTxt}>Booster maintenant</Text>
            <Icon name="arrow-right" size={14} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity onPress={onDismiss} style={s.skipBtn} activeOpacity={0.6}>
          <Text style={[s.skipTxt, { color: colors.textTertiary }]}>Plus tard</Text>
        </TouchableOpacity>

      </Animated.View>
    </Modal>
  );
};

const s = StyleSheet.create({
  sheet:        { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  successRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  successIcon:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 15, fontWeight: '800' },
  successSub:   { fontSize: 12, marginTop: 2 },
  sep:          { height: StyleSheet.hairlineWidth, marginBottom: 12 },
  boostTitle:   { fontSize: 15, fontWeight: '900', marginBottom: 4 },
  boostSub:     { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  perks:        { gap: 7, marginBottom: 14 },
  perkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perkIcon:     { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  perkText:     { fontSize: 12, flex: 1, lineHeight: 16 },
  boostBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14 },
  boostBtnTxt:  { color: '#fff', fontSize: 14, fontWeight: '900' },
  skipBtn:      { alignItems: 'center', paddingVertical: 10 },
  skipTxt:      { fontSize: 13 },
});
