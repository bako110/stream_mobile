/**
 * BoostPromptBottomSheet — incite l'utilisateur à booster son contenu le
 * plus engageant (post/reel/event/concert publié récemment), avec un aperçu
 * du média et ses statistiques réelles. Au tap sur le CTA, ouvre l'écran
 * Créer une publicité pré-rempli avec ce contenu.
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
import type { BoostSuggestion } from '../../services/adService';

const { height: H } = Dimensions.get('window');
const SHEET_H = H * 0.58;

const TYPE_LABEL: Record<string, string> = {
  post: 'publication', reel: 'reel', event: 'événement', concert: 'concert',
};

const HOOKS: Record<string, string> = {
  post: 'Cette publication cartonne 🔥',
  reel: 'Ce reel cartonne 🔥',
  event: 'Cet événement attire du monde 👀',
  concert: 'Ce concert attire du monde 👀',
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000)      return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

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

  const media = suggestion.thumbnail_url ?? suggestion.creative_url ?? null;
  const isVideo = suggestion.format === 'video';
  const typeLabel = TYPE_LABEL[suggestion.source_content_type] ?? 'contenu';
  const hook = HOOKS[suggestion.source_content_type] ?? 'Ce contenu cartonne 🔥';

  const stats: { icon: string; value: number; label: string }[] = [];
  if (suggestion.view_count > 0) stats.push({ icon: 'eye', value: suggestion.view_count, label: 'vues' });
  stats.push({ icon: 'heart', value: suggestion.like_count, label: "j'aime" });
  stats.push({ icon: 'message-circle', value: suggestion.comment_count, label: 'commentaires' });
  if (suggestion.share_count > 0) stats.push({ icon: 'share-2', value: suggestion.share_count, label: 'partages' });

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
          {/* Média + overlay titre */}
          <View style={st.mediaWrap}>
            {media ? (
              <ImageBackground source={{ uri: media }} style={st.media} resizeMode="cover">
                {isVideo && (
                  <View style={st.playOverlay}>
                    <Icon name="play" size={20} color="#fff" />
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.75)']}
                  style={st.mediaGradient}
                >
                  <Text style={st.mediaCaption} numberOfLines={2}>{suggestion.title}</Text>
                </LinearGradient>
              </ImageBackground>
            ) : (
              <View style={[st.media, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="image" size={28} color={colors.textTertiary} />
              </View>
            )}
          </View>

          <Text style={[st.hook, { color: colors.textPrimary }]}>{hook}</Text>
          <Text style={[st.sub, { color: colors.textSecondary }]}>
            Mets ton {typeLabel} en avant auprès de milliers de personnes et multiplie ta portée.
          </Text>

          {/* Stats réelles */}
          <View style={st.statsRow}>
            {stats.map(s => (
              <View key={s.label} style={[st.statPill, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name={s.icon} size={13} color={colors.primary} />
                <Text style={[st.statValue, { color: colors.textPrimary }]}>{formatCount(s.value)}</Text>
                <Text style={[st.statLabel, { color: colors.textTertiary }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity activeOpacity={0.85} onPress={() => onBoost(suggestion)}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={st.ctaBtn}
            >
              <Icon name="zap" size={16} color="#fff" />
              <Text style={st.ctaTxt}>Booster ce {typeLabel}</Text>
            </LinearGradient>
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
  content: { paddingHorizontal: 20, paddingTop: 10, gap: 12 },
  mediaWrap: { alignItems: 'center' },
  media: { width: '100%', height: 150, borderRadius: 16, overflow: 'hidden' },
  mediaGradient: { flex: 1, justifyContent: 'flex-end', padding: 12 },
  mediaCaption: { color: '#fff', fontSize: 13, fontWeight: '700' },
  playOverlay: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -20, marginLeft: -20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  hook: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  sub:  { fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20,
  },
  statValue: { fontSize: 12, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '500' },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 16, marginTop: 6,
    shadowColor: '#7B3FF2', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  ctaTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dismissBtn: { alignItems: 'center', paddingVertical: 10 },
  dismissTxt: { fontSize: 13, fontWeight: '600' },
});
