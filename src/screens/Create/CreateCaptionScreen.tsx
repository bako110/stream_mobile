/**
 * CreateCaptionScreen — étape 2 du flow de publication : description du reel.
 * Preview média en fond (assombrie), champ de description au premier plan.
 * Étape volontairement légère — un seul geste (écrire) avant de passer au récap.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { MentionInput } from '../../components/common/MentionInput';
import { DarkColors } from '../../theme/colors';

interface Props {
  thumbnailUri: string | null;
  isPhoto: boolean;
  caption: string;
  onCaptionChange: (text: string, mentionIds: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export const CreateCaptionScreen: React.FC<Props> = ({
  thumbnailUri, isPhoto, caption, onCaptionChange, onBack, onNext,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Fond — vignette du média, assombrie pour faire ressortir le champ */}
      {thumbnailUri && <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={Platform.OS === 'android' ? 8 : 18} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,4,14,0.72)' }]} />
      <LinearGradient colors={['rgba(0,0,0,0.65)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160 }} pointerEvents="none" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ══ HEADER ══ */}
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.headerBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={s.stepsRow}>
            <View style={[s.stepDot, s.stepDotDone]} />
            <View style={[s.stepDot, s.stepDotDone]} />
            <View style={[s.stepDot, s.stepDotActive]} />
            <View style={s.stepDot} />
          </View>
          <View style={{ width: 38 }} />
        </View>

        {/* ══ CENTRE — vignette + prompt ══ */}
        <View style={s.center}>
          <Animated.View entering={FadeIn.duration(280)} style={s.thumbWrap}>
            {thumbnailUri ? (
              <Image source={{ uri: thumbnailUri }} style={s.thumb} resizeMode="cover" />
            ) : (
              <View style={[s.thumb, s.thumbFallback]}>
                <Icon name={isPhoto ? 'image' : 'video'} size={26} color="rgba(255,255,255,0.4)" />
              </View>
            )}
            <View style={s.thumbBadge}>
              <Icon name={isPhoto ? 'image' : 'video'} size={9} color="#fff" />
            </View>
          </Animated.View>

          <Animated.Text entering={FadeInDown.duration(320).delay(80)} style={s.title}>
            Décris ton reel
          </Animated.Text>
          <Animated.Text entering={FadeInDown.duration(320).delay(140)} style={s.subtitle}>
            Une bonne description aide plus de monde à découvrir ton contenu
          </Animated.Text>
        </View>

        {/* ══ CHAMP DESCRIPTION ══ */}
        <Animated.View entering={FadeInDown.duration(320).delay(180)} style={s.captionCard}>
          <View style={s.captionInputWrap}>
            <MentionInput
              value={caption}
              onChangeText={onCaptionChange}
              colors={DarkColors}
              placeholder="Décris ton reel… #hashtag @mention"
              maxLength={300}
              inputStyle={{ fontSize: 15, lineHeight: 22, minHeight: 88, maxHeight: 88 }}
            />
          </View>
          <Text style={s.charCount}>{caption.length}/300</Text>
        </Animated.View>

        {/* ══ CTA ══ */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <TouchableOpacity onPress={onNext} activeOpacity={0.88} style={s.nextBtnWrap}>
            <LinearGradient colors={['#7B3FF2', '#C026D3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.nextBtn}>
              <Text style={s.nextBtnTxt}>Continuer</Text>
              <Icon name="arrow-right" size={17} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNext} activeOpacity={0.7} style={s.skipBtn}>
            <Text style={s.skipTxt}>Passer cette étape</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  stepsRow: { flexDirection: 'row', gap: 6 },
  stepDot: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  stepDotDone: { backgroundColor: 'rgba(224,56,154,0.55)' },
  stepDotActive: { backgroundColor: '#C026D3', width: 22 },

  center: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 8, gap: 6 },
  thumbWrap: { marginBottom: 14 },
  thumb: { width: 96, height: 96, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  thumbFallback: { backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  thumbBadge: {
    position: 'absolute', bottom: -6, right: -6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#000',
  },
  title: { color: '#fff', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18, maxWidth: 280 },

  captionCard: { marginHorizontal: 20, marginTop: 24 },
  captionInputWrap: {
    borderRadius: 18, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14, paddingVertical: 4,
  },
  charCount: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'right', marginTop: 6 },

  footer: { paddingHorizontal: 20, paddingTop: 12, alignItems: 'center', gap: 10 },
  nextBtnWrap: { width: '100%', borderRadius: 28, overflow: 'hidden', shadowColor: '#7B3FF2', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  nextBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  skipBtn: { paddingVertical: 6 },
  skipTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
});
