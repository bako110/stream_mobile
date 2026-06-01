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
  contentType: 'event' | 'concert' | 'post';
  onBoost: () => void;
  onDismiss: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  event:   'ton événement',
  concert: 'ton concert',
  post:    'ton post',
};

const BOOST_PERKS = [
  { icon: 'trending-up', text: '10× plus de visibilité dans le feed' },
  { icon: 'users',       text: 'Touche des milliers de nouveaux utilisateurs' },
  { icon: 'zap',         text: 'Résultats visibles en moins de 5 minutes' },
];

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
              Publié avec succès !
            </Text>
            <Text style={[s.successSub, { color: colors.textSecondary }]}>
              {label.charAt(0).toUpperCase() + label.slice(1)} est maintenant en ligne.
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
          Dépense quelques coins pour être vu par beaucoup plus de monde.
        </Text>

        {/* Avantages */}
        <View style={s.perks}>
          {BOOST_PERKS.map(p => (
            <View key={p.icon} style={s.perkRow}>
              <View style={[s.perkIcon, { backgroundColor: '#7B3FF215' }]}>
                <Icon name={p.icon} size={13} color="#7B3FF2" />
              </View>
              <Text style={[s.perkText, { color: colors.textSecondary }]}>{p.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA boost */}
        <TouchableOpacity onPress={onBoost} activeOpacity={0.88} style={{ borderRadius: 16, overflow: 'hidden', marginTop: 4 }}>
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.boostBtn}
          >
            <Icon name="zap" size={18} color="#fff" />
            <Text style={s.boostBtnTxt}>Booster maintenant</Text>
            <Icon name="arrow-right" size={16} color="#fff" />
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
  sheet:        { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  successRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  successIcon:  { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 17, fontWeight: '800' },
  successSub:   { fontSize: 13, marginTop: 2 },
  sep:          { height: StyleSheet.hairlineWidth, marginBottom: 18 },
  boostTitle:   { fontSize: 18, fontWeight: '900', marginBottom: 6 },
  boostSub:     { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  perks:        { gap: 10, marginBottom: 20 },
  perkRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkIcon:     { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  perkText:     { fontSize: 13, flex: 1, lineHeight: 18 },
  boostBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 16 },
  boostBtnTxt:  { color: '#fff', fontSize: 16, fontWeight: '900' },
  skipBtn:      { alignItems: 'center', paddingVertical: 14 },
  skipTxt:      { fontSize: 14 },
});
