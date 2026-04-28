import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, StatusBar,
  Dimensions, KeyboardAvoidingView,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Video from 'react-native-video';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { reelService } from '../../services';
import { uploadVideoFromUri } from '../../services/uploadService';
import { launchImageLibrary } from 'react-native-image-picker';
import type { MainStackParamList } from '../../navigation/MainNavigator';

const { width: SCREEN_W } = Dimensions.get('window');
const VIDEO_H = Math.round(SCREEN_W * 9 / 16);

type Nav = NativeStackNavigationProp<MainStackParamList>;

type PublishStep = 'idle' | 'uploading' | 'creating' | 'done';

const STEP_LABELS: Record<PublishStep, string> = {
  idle:      '',
  uploading: 'Envoi de la vidéo…',
  creating:  'Finalisation…',
  done:      'Reel publié ! 🎉',
};

interface Props {
  onBack: () => void;
}

export const CreateReelScreen: React.FC<Props> = ({ onBack }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();

  const [caption,       setCaption]       = useState('');
  const [videoLocalUri, setVideoLocalUri] = useState<string | null>(null);
  const [step,          setStep]          = useState<PublishStep>('idle');
  const [uploadPct,     setUploadPct]     = useState(0);
  const [videoPaused,   setVideoPaused]   = useState(false);

  const isPublishing = step !== 'idle' && step !== 'done';

  const isVideoPaused = !videoLocalUri || videoPaused || isPublishing;

  // Barre de progression animée
  const progressWidth = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%` as any,
  }));

  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    if (isPublishing) {
      dotOpacity.value = withRepeat(
        withSequence(withTiming(0.3, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1, true,
      );
    } else {
      dotOpacity.value = 1;
    }
  }, [isPublishing]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  // Simuler la progression upload (en attendant un vrai callback)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startFakeProgress = (from: number, to: number) => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressWidth.value = from;
    progressTimerRef.current = setInterval(() => {
      progressWidth.value = withTiming(
        Math.min(progressWidth.value + (to - from) / 30, to),
        { duration: 200 },
      );
    }, 200);
  };
  const stopFakeProgress = () => {
    if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
  };

  const handlePickVideo = () => {
    launchImageLibrary({ mediaType: 'video', selectionLimit: 1, videoQuality: 'medium' as any }, res => {
      if (res.didCancel) return;
      if (res.errorCode) {
        Alert.alert('Erreur', res.errorMessage ?? 'Impossible de sélectionner la vidéo.');
        return;
      }
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      setVideoLocalUri(asset.uri);
      setVideoPaused(false);
    });
  };

  const handleRemoveVideo = () => {
    videoPlayer.pause();
    setVideoLocalUri(null);
    setVideoPaused(false);
  };

  const handlePublish = async () => {
    if (!videoLocalUri) return;
    try {
      // ── Étape 1 : upload ──────────────────────────────────────────────────
      setStep('uploading');
      setUploadPct(0);
      startFakeProgress(0, 80);

      const uploaded = await uploadVideoFromUri(videoLocalUri, 'reels');

      stopFakeProgress();
      progressWidth.value = withTiming(88, { duration: 200 });

      // ── Étape 2 : création ────────────────────────────────────────────────
      setStep('creating');
      startFakeProgress(88, 96);

      await reelService.create({
        video_url:     uploaded.url,
        caption:       caption.trim() || undefined,
        thumbnail_url: uploaded.thumbnail_url,
        duration_sec:  uploaded.duration ? Math.round(uploaded.duration) : undefined,
      });

      stopFakeProgress();
      progressWidth.value = withTiming(100, { duration: 300 });

      // ── Étape 3 : done — redirection auto 1.2s ────────────────────────────
      setStep('done');
      videoPlayer.pause();
      videoPlayer.replaceSourceAsync({ uri: 'about:blank' }).catch(() => {});

      setTimeout(() => {
        onBack();
        nav.navigate('Tabs', { screen: 'Reels', params: { reelPublished: true } } as any);
      }, 1200);

    } catch (err: any) {
      stopFakeProgress();
      progressWidth.value = withTiming(0, { duration: 200 });
      setStep('idle');
      Alert.alert('Erreur', err?.message ?? 'Impossible de publier le reel.');
    }
  };

  const canPublish = !!videoLocalUri && !isPublishing && step !== 'done';

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.header}
      >
        <TouchableOpacity
          onPress={() => { videoPlayer.pause(); onBack(); }}
          style={s.backBtn}
          activeOpacity={0.7}
          disabled={isPublishing}
        >
          <Icon name="x" size={22} color={isPublishing ? 'rgba(255,255,255,0.35)' : '#fff'} />
        </TouchableOpacity>

        <Text style={s.headerTitle}>Nouveau Reel</Text>

        <TouchableOpacity
          onPress={handlePublish}
          disabled={!canPublish}
          style={[s.publishBtn, { opacity: canPublish ? 1 : 0.45 }]}
          activeOpacity={0.8}
        >
          <Text style={s.publishBtnText}>Publier</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Barre de progression publication ────────────────────────────── */}
      {step !== 'idle' && (
        <Animated.View entering={FadeIn.duration(200)} style={[s.progressBar, { backgroundColor: colors.backgroundSecondary }]}>
          <Animated.View style={[s.progressFill, progressStyle, { backgroundColor: step === 'done' ? colors.accentGreen : colors.primary }]} />
        </Animated.View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} scrollEnabled={!isPublishing}>

          {/* ── Zone vidéo ──────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(60).springify()} style={s.videoZone}>
            <LinearGradient
              colors={[colors.gradientStart + '33', colors.gradientEnd + '22']}
              style={StyleSheet.absoluteFill}
            />

            {videoLocalUri ? (
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                onPress={() => !isPublishing && setVideoPaused(p => !p)}
                activeOpacity={1}
              >
                {videoLocalUri ? (
                  <Video
                    source={{ uri: videoLocalUri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    paused={isVideoPaused}
                    repeat
                    muted={false}
                    ignoreSilentSwitch="ignore"
                    useTextureView={false}
                  />
                ) : null}

                {/* Overlay publication */}
                {isPublishing && (
                  <Animated.View entering={FadeIn.duration(180)} style={s.publishingOverlay}>
                    <Animated.View style={dotStyle}>
                      <ActivityIndicator size="large" color="#fff" />
                    </Animated.View>
                    <Text style={s.publishingLabel}>{STEP_LABELS[step]}</Text>
                  </Animated.View>
                )}

                {/* Overlay done */}
                {step === 'done' && (
                  <Animated.View entering={FadeIn.duration(300)} style={s.doneOverlay}>
                    <View style={s.doneCircle}>
                      <Icon name="check" size={36} color="#fff" />
                    </View>
                    <Text style={s.doneLabel}>Reel publié !</Text>
                  </Animated.View>
                )}

                {/* Overlay pause preview */}
                {videoPaused && !isPublishing && step !== 'done' && (
                  <View style={s.videoOverlay} pointerEvents="none">
                    <View style={s.playCircle}>
                      <Icon name="play" size={32} color="#fff" />
                    </View>
                  </View>
                )}

                {/* Bouton supprimer */}
                {!isPublishing && step !== 'done' && (
                  <TouchableOpacity onPress={handleRemoveVideo} style={s.removeVideoBtn} activeOpacity={0.8}>
                    <Icon name="x-circle" size={28} color="#fff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <Icon name="video" size={48} color={colors.primary} />
                <Text style={[s.videoZoneTitle, { color: colors.textPrimary }]}>Ajouter une vidéo</Text>
                <Text style={[s.videoZoneSub, { color: colors.textTertiary }]}>MP4 · Max 60 s · 1080p recommandé</Text>
                <TouchableOpacity
                  onPress={handlePickVideo}
                  style={[s.pickVideoBtn, { backgroundColor: colors.primary }]}
                  activeOpacity={0.85}
                >
                  <Icon name="upload" size={16} color="#fff" />
                  <Text style={s.pickVideoBtnText}>Choisir depuis la galerie</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>

          {/* ── Caption ─────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(140).springify()} style={[s.section, { marginBottom: 40 }]}>
            <Text style={[s.label, { color: colors.textPrimary }]}>Description</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Décris ton reel… #hashtag @mention"
              placeholderTextColor={colors.textDisabled}
              multiline
              maxLength={300}
              editable={!isPublishing}
              style={[s.captionInput, {
                backgroundColor: colors.backgroundSecondary,
                color:           colors.textPrimary,
                borderColor:     colors.border,
                opacity:         isPublishing ? 0.5 : 1,
              }]}
            />
            <Text style={[s.charCount, { color: colors.textTertiary }]}>{caption.length}/300</Text>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingBottom: 32 },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingTop:        Platform.OS === 'android' ? 44 : 56,
    paddingBottom:     16,
    paddingHorizontal: 16,
    gap:               12,
  },
  backBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  publishBtn:     { paddingHorizontal: 18, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8 },
  publishBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Barre de progression
  progressBar:  { height: 3, backgroundColor: 'transparent', overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },

  // Zone vidéo
  videoZone: {
    width:           SCREEN_W,
    height:          VIDEO_H,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    overflow:        'hidden',
    backgroundColor: '#000',
  },
  videoZoneTitle: { fontSize: 17, fontWeight: '700', marginTop: 4, color: '#fff' },
  videoZoneSub:   { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  pickVideoBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  pickVideoBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  removeVideoBtn: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, padding: 4 },

  videoOverlay:    { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  playCircle:      { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },

  publishingOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', gap: 14 },
  publishingLabel:   { color: '#fff', fontSize: 16, fontWeight: '700' },

  doneOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', gap: 14 },
  doneCircle:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#36D9A0', alignItems: 'center', justifyContent: 'center' },
  doneLabel:   { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Caption
  section:      { marginTop: 16, paddingHorizontal: 16 },
  label:        { fontSize: 13, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  captionInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, lineHeight: 20, minHeight: 90, textAlignVertical: 'top' },
  charCount:    { fontSize: 11, textAlign: 'right', marginTop: 4 },
});
