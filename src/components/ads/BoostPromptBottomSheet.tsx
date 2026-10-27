/**
 * BoostPromptBottomSheet — incite l'utilisateur à utiliser le système de
 * Boost GoGold (abonnés, vues, portée...) sur sa meilleure opportunité du
 * moment. Consomme directement la même suggestion que l'onglet "Pour toi"
 * de BoostScreen (GET /wallet/boosts/suggestions) — ce n'est pas une pub
 * payante tierce (Ad), juste un raccourci vers Booster.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, Dimensions, ImageBackground,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import type { BoostSuggestion } from '../../screens/Wallet/BoostScreen';

const { height: H } = Dimensions.get('window');
const SHEET_H = H * 0.56;

export type { BoostSuggestion };

interface Props {
  visible:    boolean;
  suggestion: BoostSuggestion | null;
  onClose:    () => void;
  onBoost:    (suggestion: BoostSuggestion) => void;
}

export const BoostPromptBottomSheet: React.FC<Props> = ({ visible, suggestion, onClose, onBoost }) => {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(SHEET_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: SHEET_H, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideY, backdropOpacity]);

  if (!suggestion) return null;

  const media = suggestion.content_thumbnail ?? null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[st.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[st.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16, transform: [{ translateY: slideY }] }]}>
        <TouchableOpacity style={st.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <Icon name="x" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <View style={[st.handle, { backgroundColor: colors.divider }]} />

        <View style={st.content}>
          {media && (
            <View style={st.mediaWrap}>
              <ImageBackground source={{ uri: media }} style={st.media} resizeMode="cover">
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={st.mediaGradient}>
                  {suggestion.content_title ? (
                    <Text style={st.mediaCaption} numberOfLines={2}>{suggestion.content_title}</Text>
                  ) : null}
                </LinearGradient>
              </ImageBackground>
            </View>
          )}

          <View style={st.hookRow}>
            <View style={[st.hookIcon, { backgroundColor: '#7B3FF2' }]}>
              <Icon name="zap" size={16} color="#fff" />
            </View>
            <Text style={[st.hook, { color: colors.textPrimary }]}>{suggestion.impact_label}</Text>
          </View>

          <Text style={[st.sub, { color: colors.textSecondary }]}>{suggestion.reason}</Text>

          {suggestion.engagement_rate != null && suggestion.engagement_rate > 0 && (
            <View style={[st.engBadge, { backgroundColor: '#22C55E15', borderColor: '#22C55E30' }]}>
              <Icon name="activity" size={11} color="#22C55E" />
              <Text style={st.engText}>{(suggestion.engagement_rate * 100).toFixed(1)}% d'engagement</Text>
            </View>
          )}

          <View style={st.quantityRow}>
            <Text style={[st.quantity, { color: colors.textPrimary }]}>{suggestion.quantity_label}</Text>
            <Text style={[st.duration, { color: colors.textTertiary }]}>
              {suggestion.duration_days} jour{suggestion.duration_days > 1 ? 's' : ''}
            </Text>
          </View>

          <TouchableOpacity activeOpacity={0.85} onPress={() => onBoost(suggestion)}>
            <View
              style={[st.ctaBtn, { backgroundColor: suggestion.affordable ? colors.gradientStart : '#888' }]}
            >
              <Icon name="zap" size={16} color="#fff" />
              <Text style={st.ctaTxt}>
                {suggestion.affordable
                  ? `Booster — ${suggestion.gogold.toLocaleString('fr-FR')} GoGold`
                  : 'Solde insuffisant'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={st.dismissBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={[st.dismissTxt, { color: colors.textTertiary }]}>Pas maintenant</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
};

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: SHEET_H,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingTop: 10,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, elevation: 14,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  closeBtn: {
    position: 'absolute', top: 12, right: 14, zIndex: 2,
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(120,120,140,0.14)',
  },
  content: { paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  mediaWrap: { alignItems: 'center' },
  media: { width: '100%', height: 130, borderRadius: 16, overflow: 'hidden' },
  mediaGradient: { flex: 1, justifyContent: 'flex-end', padding: 12 },
  mediaCaption: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hookRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  hookIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  hook: { flex: 1, fontSize: 16, fontWeight: '800' },
  sub:  { fontSize: 13, lineHeight: 18 },
  engBadge: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  engText: { fontSize: 11, fontWeight: '700', color: '#22C55E' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  quantity: { fontSize: 14, fontWeight: '700' },
  duration: { fontSize: 12, fontWeight: '500' },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 16, marginTop: 4,
    shadowColor: '#7B3FF2', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  ctaTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dismissBtn: { alignItems: 'center', paddingVertical: 10 },
  dismissTxt: { fontSize: 13, fontWeight: '600' },
});
