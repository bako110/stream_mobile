import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Platform, StatusBar,
  Dimensions, KeyboardAvoidingView,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { reelService } from '../../services';
import { launchImageLibrary } from 'react-native-image-picker';
import { backgroundUploadService } from '../../services/backgroundUploadService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

const { width: SCREEN_W } = Dimensions.get('window');
const VIDEO_H = Math.round(SCREEN_W * 9 / 16);

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface Props { onBack: () => void }

export const CreateReelScreen: React.FC<Props> = ({ onBack }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();

  const [caption,       setCaption]       = useState('');
  const [videoLocalUri, setVideoLocalUri] = useState<string | null>(null);
  const [videoPaused,   setVideoPaused]   = useState(false);

  const videoPlayer = useVideoPlayer(
    videoLocalUri ? { uri: videoLocalUri } : { uri: 'about:blank' },
    p => { p.loop = true; p.muted = false; },
  );

  useEffect(() => {
    if (!videoLocalUri) return;
    if (videoPaused) videoPlayer.pause();
    else             videoPlayer.play();
  }, [videoPaused, videoLocalUri]);

  const handlePickVideo = () => {
    launchImageLibrary({ mediaType: 'video', selectionLimit: 1 }, res => {
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

  const handlePublish = () => {
    if (!videoLocalUri) return;

    const capturedCaption = caption.trim();
    const capturedUri     = videoLocalUri;

    // Fermer l'écran immédiatement
    videoPlayer.pause();
    onBack();
    nav.navigate('Tabs', { screen: 'Reels', params: { reelPublished: true } } as any);

    // Upload en arrière-plan
    backgroundUploadService.enqueueVideo({
      localUri: capturedUri,
      folder:   'reels',
      type:     'reel',
      label:    capturedCaption || 'Nouveau Reel',
      onDone: async (result) => {
        await reelService.create({
          video_url:     result.videoUrl!,
          caption:       capturedCaption || undefined,
          thumbnail_url: result.thumbnailUrl,
          duration_sec:  result.durationSec ? Math.round(result.durationSec) : undefined,
        });
      },
    });
  };

  const canPublish = !!videoLocalUri;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.header}
      >
        <TouchableOpacity onPress={() => { videoPlayer.pause(); onBack(); }} style={s.backBtn} activeOpacity={0.7}>
          <Icon name="x" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={s.headerTitle}>Nouveau Reel</Text>

        <TouchableOpacity
          onPress={handlePublish}
          disabled={!canPublish}
          style={[s.publishBtn, { opacity: canPublish ? 1 : 0.45 }]}
          activeOpacity={0.8}
        >
          <Text style={s.publishBtnText}>Envoyer</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Hint arrière-plan */}
      {videoLocalUri && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[s.bgHint, { backgroundColor: colors.primary + '18', borderBottomColor: colors.primary + '33' }]}
        >
          <Icon name="upload-cloud" size={13} color={colors.primary} />
          <Text style={[s.bgHintText, { color: colors.primary }]}>
            Compression et envoi en arrière-plan après "Envoyer"
          </Text>
        </Animated.View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Zone vidéo */}
          <Animated.View entering={FadeInDown.delay(60).springify()} style={s.videoZone}>
            <LinearGradient
              colors={[colors.gradientStart + '33', colors.gradientEnd + '22']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            {videoLocalUri ? (
              <TouchableOpacity
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                onPress={() => setVideoPaused(p => !p)}
                activeOpacity={1}
              >
                <VideoView player={videoPlayer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />

                {/* Overlay pause */}
                {videoPaused && (
                  <View style={s.videoOverlay} pointerEvents="none">
                    <View style={s.playCircle}>
                      <Icon name="play" size={32} color="#fff" />
                    </View>
                  </View>
                )}

                {/* Bouton supprimer */}
                <TouchableOpacity onPress={handleRemoveVideo} style={s.removeVideoBtn} activeOpacity={0.8}>
                  <Icon name="x-circle" size={28} color="#fff" />
                </TouchableOpacity>
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

          {/* Caption */}
          <Animated.View entering={FadeInDown.delay(140).springify()} style={[s.section, { marginBottom: 40 }]}>
            <Text style={[s.label, { color: colors.textPrimary }]}>Description</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Décris ton reel… #hashtag @mention"
              placeholderTextColor={colors.textDisabled}
              multiline
              maxLength={300}
              style={[s.captionInput, {
                backgroundColor: colors.backgroundSecondary,
                color:           colors.textPrimary,
                borderColor:     colors.border,
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

  bgHint:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  bgHintText: { fontSize: 12, fontWeight: '500', flex: 1 },

  videoZone: {
    width:           SCREEN_W,
    height:          VIDEO_H,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    overflow:        'hidden',
    backgroundColor: '#000',
  },
  videoZoneTitle:   { fontSize: 17, fontWeight: '700', marginTop: 4, color: '#fff' },
  videoZoneSub:     { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  pickVideoBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  pickVideoBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  removeVideoBtn:   { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, padding: 4 },

  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  playCircle:   { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },

  section:      { marginTop: 16, paddingHorizontal: 16 },
  label:        { fontSize: 13, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  captionInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, lineHeight: 20, minHeight: 90, textAlignVertical: 'top' },
  charCount:    { fontSize: 11, textAlign: 'right', marginTop: 4 },
});
