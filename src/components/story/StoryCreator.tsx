import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Dimensions, StatusBar, ActivityIndicator, Alert, Keyboard,
  Modal, KeyboardAvoidingView, Platform, ScrollView, PermissionsAndroid,
} from 'react-native';
import Animated, {
  FadeIn, FadeOut, FadeInDown, FadeInRight,
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
} from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useTheme } from '../../hooks/useTheme';
import { storyService } from '../../services/storyService';
import { apiClient, Endpoints } from '../../api';
import type { StoryMediaType } from '../../types/story';

const AudioRecorderPlayerModule = require('react-native-audio-recorder-player');
const AudioRecorderPlayerClass = AudioRecorderPlayerModule.default || AudioRecorderPlayerModule;
const audioRecorder = new AudioRecorderPlayerClass();

const { width: W, height: H } = Dimensions.get('window');

const TEXT_BG_COLORS = [
  '#7B3FF2', '#E91E63', '#FF5722', '#009688', '#2196F3',
  '#4CAF50', '#FF9800', '#795548', '#607D8B', '#000000',
  '#1A237E', '#B71C1C', '#1B5E20', '#F57F17', '#4A148C',
];

const FONT_STYLES: {
  key: string; label: string; fontFamily?: string;
  fontWeight?: 'normal' | 'bold' | '900'; fontStyle?: 'normal' | 'italic';
}[] = [
  { key: 'classic',   label: 'Classique',  fontFamily: undefined,              fontWeight: 'bold' },
  { key: 'serif',     label: 'Elegant',    fontFamily: 'serif',                fontWeight: 'normal' },
  { key: 'mono',      label: 'Mono',       fontFamily: 'monospace',            fontWeight: 'bold' },
  { key: 'condensed', label: 'Compact',    fontFamily: 'sans-serif-condensed', fontWeight: '900' },
  { key: 'italic',    label: 'Italique',   fontFamily: 'serif',                fontWeight: 'normal', fontStyle: 'italic' },
];

type StoryMode = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'image_audio';
type Step = 'pick_mode' | 'pick_media' | 'record_voice' | 'pick_audio' | 'preview';

interface ModeOption {
  key:       StoryMode;
  icon:      string;
  iconLib:   'feather' | 'material';
  label:     string;
  sub:       string;
  accent:    string;
  gradient:  [string, string];
}

const MODE_OPTIONS: ModeOption[] = [
  { key: 'text',        icon: 'format-text',          iconLib: 'material', label: 'Texte',        sub: 'Message sur fond coloré',      accent: '#7B3FF2', gradient: ['#7B3FF2', '#9B65F5'] },
  { key: 'image',       icon: 'image',                iconLib: 'feather',  label: 'Photo',        sub: 'Depuis la galerie ou caméra',   accent: '#2196F3', gradient: ['#1565C0', '#2196F3'] },
  { key: 'video',       icon: 'video',                iconLib: 'feather',  label: 'Video',        sub: 'Clip jusqu\'a 30 secondes',     accent: '#E91E63', gradient: ['#AD1457', '#E91E63'] },
  { key: 'audio',       icon: 'music-note',           iconLib: 'material', label: 'Musique',      sub: 'Son + couleur de fond',         accent: '#FF9800', gradient: ['#E65100', '#FF9800'] },
  { key: 'voice',       icon: 'microphone',           iconLib: 'material', label: 'Vocal',        sub: 'Message vocal direct',          accent: '#00BCD4', gradient: ['#00838F', '#00BCD4'] },
  { key: 'image_audio', icon: 'image-multiple',       iconLib: 'material', label: 'Photo + Son',  sub: 'Image avec ambiance sonore',    accent: '#4CAF50', gradient: ['#2E7D32', '#4CAF50'] },
];

interface Props {
  visible:   boolean;
  onClose:   () => void;
  onCreated: () => void;
}

async function normalizeUri(uri: string): Promise<string> {
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) return uri;
  const ext = uri.includes('.') ? uri.split('.').pop() : 'tmp';
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/story_${Date.now()}.${ext}`;
  try { await ReactNativeBlobUtil.fs.cp(uri, dest); }
  catch {
    const data = await ReactNativeBlobUtil.fs.readFile(uri, 'base64');
    await ReactNativeBlobUtil.fs.writeFile(dest, data, 'base64');
  }
  return `file://${dest}`;
}

// ── Success overlay ──────────────────────────────────────────────────────────

const SuccessOverlay: React.FC<{ visible: boolean }> = ({ visible }) => {
  const scale   = useSharedValue(0.7);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 220 });
      scale.value   = withSpring(1, { damping: 14, stiffness: 200 });
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  if (!visible) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)} style={s.successOverlay}>
      <Animated.View style={[s.successCard, cardStyle]}>
        <LinearGradient
          colors={['#1A1A2E', '#16213E']}
          style={s.successInner}
        >
          <View style={s.successIconRing}>
            <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.successIconGrad}>
              <Icon name="check" size={28} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={s.successTitle}>Story publiee !</Text>
          <Text style={s.successSub}>
            Visible par tous vos abonnes pendant 24h
          </Text>
          <View style={s.successDivider} />
          <View style={s.successBadgeRow}>
            <View style={s.successBadge}>
              <Icon name="clock" size={11} color="#7B3FF2" />
              <Text style={s.successBadgeText}>24 heures</Text>
            </View>
            <View style={s.successBadge}>
              <Icon name="eye" size={11} color="#E0389A" />
              <Text style={s.successBadgeText}>Tous vos abonnes</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
};

// ── Lecteur vidéo story (v7) ──────────────────────────────────────────────────

const StoryVideoPreview: React.FC<{ uri: string; active: boolean }> = ({ uri, active }) => {
  const player = useVideoPlayer({ uri }, p => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (active) { player.play(); }
    else        { player.pause(); }
  }, [active]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
  );
};

// ── Composant principal ───────────────────────────────────────────────────────

export const StoryCreator: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [step,          setStep]          = useState<Step>('pick_mode');
  const [mode,          setMode]          = useState<StoryMode>('text');
  const [localUri,      setLocalUri]      = useState<string | null>(null);
  const [audioUri,      setAudioUri]      = useState<string | null>(null);
  const [caption,       setCaption]       = useState('');
  const [bgColor,       setBgColor]       = useState(TEXT_BG_COLORS[0]);
  const [fontStyleKey,  setFontStyleKey]  = useState('classic');
  const [uploading,     setUploading]     = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [recording,     setRecording]     = useState(false);
  const [recordTime,    setRecordTime]    = useState('00:00');
  const [audioPlaying,  setAudioPlaying]  = useState(false);
  const [showSuccess,   setShowSuccess]   = useState(false);
  const inputRef = useRef<TextInput>(null);

  const videoActive = mode === 'video' && !!localUri;

  const stopAudioPreview = async () => {
    try { await audioRecorder.stopPlayer(); audioRecorder.removePlayBackListener(); } catch {}
    setAudioPlaying(false);
  };

  const resetAndClose = () => {
    setStep('pick_mode'); setMode('text'); setLocalUri(null); setAudioUri(null);
    setCaption(''); setBgColor(TEXT_BG_COLORS[0]); setFontStyleKey('classic');
    setShowTextInput(false); setUploading(false); setRecording(false);
    setRecordTime('00:00'); setShowSuccess(false);
    stopAudioPreview();
    onClose();
  };

  const goBack = () => {
    stopAudioPreview();
    if (step === 'preview') {
      if (mode === 'text')       { setStep('pick_mode'); setCaption(''); }
      else if (mode === 'voice') { setStep('record_voice'); setAudioUri(null); }
      else if (mode === 'audio') { setStep('pick_audio'); setAudioUri(null); }
      else { setLocalUri(null); setAudioUri(null); setStep('pick_media'); }
    } else if (['pick_media', 'record_voice', 'pick_audio'].includes(step)) {
      setStep('pick_mode'); setLocalUri(null); setAudioUri(null);
    } else {
      resetAndClose();
    }
  };

  // ── Pickers ───────────────────────────────────────────────────────────────

  const pickImage = async (source: 'gallery' | 'camera') => {
    try {
      const res = await (source === 'camera' ? launchCamera : launchImageLibrary)({
        mediaType: 'photo', selectionLimit: 1,
      });
      if (res.didCancel || !res.assets?.[0]?.uri) return;
      setLocalUri(res.assets[0].uri);
      setStep(mode === 'image_audio' ? 'pick_audio' : 'preview');
    } catch (e: any) { Alert.alert('Erreur', e?.message); }
  };

  const pickVideo = async (source: 'gallery' | 'camera') => {
    try {
      const res = await (source === 'camera' ? launchCamera : launchImageLibrary)({
        mediaType: 'video', selectionLimit: 1, videoQuality: 'medium' as any, durationLimit: 30,
      });
      if (res.didCancel || !res.assets?.[0]?.uri) return;
      setLocalUri(await normalizeUri(res.assets[0].uri));
      setStep('preview');
    } catch (e: any) { Alert.alert('Erreur', e?.message); }
  };

  const pickAudioFile = async () => {
    try {
      const res = await launchImageLibrary({ mediaType: 'mixed' as any, selectionLimit: 1 });
      if (res.didCancel || !res.assets?.[0]?.uri) return;
      setAudioUri(res.assets[0].uri);
      setStep('preview');
    } catch (e: any) { Alert.alert('Erreur', e?.message); }
  };

  // ── Voice recording ───────────────────────────────────────────────────────

  const requestMic = async () => {
    if (Platform.OS !== 'android') return true;
    return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))
      === PermissionsAndroid.RESULTS.GRANTED;
  };

  const startRecording = async () => {
    if (!(await requestMic())) { Alert.alert('Permission', 'Microphone requis'); return; }
    try {
      const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/story_voice_${Date.now()}.mp4`;
      await audioRecorder.startRecorder(path);
      audioRecorder.addRecordBackListener((e: any) => {
        const secs = Math.floor((e.currentPosition ?? 0) / 1000);
        setRecordTime(`${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`);
      });
      setRecording(true);
    } catch (e: any) { Alert.alert('Erreur', e?.message); }
  };

  const stopRecording = async () => {
    try {
      const result = await audioRecorder.stopRecorder();
      audioRecorder.removeRecordBackListener();
      setRecording(false);
      if (result) {
        setAudioUri(result.startsWith('file://') ? result : `file://${result}`);
        setStep('preview');
      }
    } catch { setRecording(false); }
  };

  const playAudioPreview = async () => {
    if (!audioUri) return;
    try {
      await audioRecorder.startPlayer(audioUri);
      setAudioPlaying(true);
      audioRecorder.addPlayBackListener((e: any) => {
        if (e.currentPosition >= e.duration) stopAudioPreview();
      });
    } catch {}
  };

  // ── Upload ────────────────────────────────────────────────────────────────

  const uploadImage = async (uri: string) => {
    const fd = new FormData();
    fd.append('files', { uri: await normalizeUri(uri), name: `s_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    const r = await apiClient.upload<{ uploaded: Array<{ url: string }> }>(Endpoints.upload.images('stories'), fd);
    const url = r.data?.uploaded?.[0]?.url;
    if (!url) throw new Error('URL image manquante');
    return url;
  };

  const uploadVideo = async (uri: string) => {
    const fd = new FormData();
    fd.append('file', { uri: await normalizeUri(uri), name: `s_${Date.now()}.mp4`, type: 'video/mp4' } as any);
    return (await apiClient.upload<{ url: string; thumbnail_url?: string; duration?: number }>(Endpoints.upload.video('stories'), fd)).data;
  };

  const uploadAudio = async (uri: string) => {
    const fd = new FormData();
    fd.append('file', { uri: await normalizeUri(uri), name: `s_${Date.now()}.mp4`, type: 'audio/mp4' } as any);
    return (await apiClient.upload<{ url: string }>(Endpoints.upload.audio('stories'), fd)).data?.url;
  };

  // ── Publish ───────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    setUploading(true);
    try {
      let media_url: string | undefined;
      let media_type: StoryMediaType = 'image';
      let thumbnail_url: string | undefined;
      let audio_url: string | undefined;
      let duration_sec = 5;
      let background_color: string | undefined;

      switch (mode) {
        case 'text':        media_type = 'text'; background_color = bgColor; break;
        case 'image':       media_url = await uploadImage(localUri!); media_type = 'image'; thumbnail_url = media_url; break;
        case 'video':       { const v = await uploadVideo(localUri!); media_url = v.url; media_type = 'video'; thumbnail_url = v.thumbnail_url; duration_sec = v.duration ? Math.min(Math.ceil(v.duration), 30) : 10; break; }
        case 'audio':       audio_url = await uploadAudio(audioUri!); media_type = 'audio'; background_color = bgColor; duration_sec = 15; break;
        case 'voice':       audio_url = await uploadAudio(audioUri!); media_type = 'voice'; background_color = '#1A237E'; duration_sec = 15; break;
        case 'image_audio': media_url = await uploadImage(localUri!); audio_url = await uploadAudio(audioUri!); media_type = 'image'; thumbnail_url = media_url; duration_sec = 10; break;
      }

      await storyService.create({
        media_url, media_type, thumbnail_url,
        caption: caption.trim() || undefined,
        duration_sec, background_color, audio_url,
        font_style: mode === 'text' ? fontStyleKey : undefined,
      });

      setUploading(false);
      setShowSuccess(true);
      setTimeout(() => { onCreated(); resetAndClose(); }, 2400);
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Erreur', e?.message ?? 'Impossible de publier');
    }
  };

  const selectMode = (m: StoryMode) => {
    setMode(m);
    if (m === 'text') {
      setStep('preview');
      setTimeout(() => { setShowTextInput(true); inputRef.current?.focus(); }, 300);
    } else if (m === 'voice') { setStep('record_voice'); }
    else if (m === 'audio')   { setStep('pick_audio'); }
    else                       { setStep('pick_media'); }
  };

  const currentOpt = MODE_OPTIONS.find(o => o.key === mode) ?? MODE_OPTIONS[0];

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack} statusBarTranslucent>

      {/* ══════════════ STEP 1 — Choix du type ══════════════════════════════ */}
      {step === 'pick_mode' && (
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

          {/* Header compact */}
          <LinearGradient
            colors={['#0F0C29', '#302B63', '#24243E']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.pickHeader}
          >
            <TouchableOpacity onPress={resetAndClose} style={s.closeBtn}>
              <Icon name="x" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <View style={s.pickHeaderText}>
              <Text style={s.pickTitle}>Nouvelle story</Text>
              <Text style={s.pickSub}>Que souhaitez-vous partager ?</Text>
            </View>
          </LinearGradient>

          {/* Liste des modes */}
          <ScrollView
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={s.modeList}
            showsVerticalScrollIndicator={false}
          >
            {MODE_OPTIONS.map((opt, i) => (
              <Animated.View key={opt.key} entering={FadeInRight.delay(i * 60).springify()}>
                <TouchableOpacity
                  style={[s.modeRow, { backgroundColor: colors.surface ?? colors.background }]}
                  onPress={() => selectMode(opt.key)}
                  activeOpacity={0.75}
                >
                  {/* Barre accent gauche */}
                  <View style={[s.modeAccentBar, { backgroundColor: opt.accent }]} />

                  {/* Icone */}
                  <LinearGradient
                    colors={opt.gradient}
                    style={s.modeIconBox}
                  >
                    {opt.iconLib === 'material'
                      ? <MaterialIcon name={opt.icon} size={22} color="#fff" />
                      : <Icon name={opt.icon} size={20} color="#fff" />
                    }
                  </LinearGradient>

                  {/* Texte */}
                  <View style={s.modeTexts}>
                    <Text style={[s.modeLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
                    <Text style={[s.modeSub, { color: colors.textSecondary }]}>{opt.sub}</Text>
                  </View>

                  {/* Fleche */}
                  <Icon name="chevron-right" size={18} color={colors.textTertiary ?? colors.textSecondary} />
                </TouchableOpacity>
              </Animated.View>
            ))}

            <Animated.View entering={FadeInRight.delay(420).springify()} style={[s.infoBox, { backgroundColor: colors.surface ?? '#f5f5f5' }]}>
              <Icon name="info" size={13} color={colors.textTertiary ?? colors.textSecondary} />
              <Text style={[s.infoText, { color: colors.textTertiary ?? colors.textSecondary }]}>
                Les stories sont visibles 24h puis disparaissent automatiquement
              </Text>
            </Animated.View>
          </ScrollView>
        </View>
      )}

      {/* ══════════════ STEP 2a — Source media ══════════════════════════════ */}
      {step === 'pick_media' && (
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <StatusBar barStyle="dark-content" />
          <View style={[s.subHeader, { paddingTop: Platform.OS === 'android' ? 48 : 56, borderBottomColor: colors.border ?? '#eee' }]}>
            <TouchableOpacity onPress={goBack} style={s.subHeaderBtn}>
              <Icon name="arrow-left" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.subHeaderTitle, { color: colors.textPrimary }]}>
              {mode === 'video' ? 'Choisir une video' : 'Choisir une photo'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={s.sourceGrid}>
            {[
              {
                source: 'gallery' as const,
                icon: mode === 'video' ? 'film' : 'image',
                label: 'Galerie',
                sub: 'Depuis vos photos',
                gradient: ['#1565C0', '#2196F3'] as [string, string],
              },
              {
                source: 'camera' as const,
                icon: mode === 'video' ? 'video' : 'camera',
                label: mode === 'video' ? 'Filmer' : 'Photographier',
                sub: 'Utiliser la camera',
                gradient: ['#AD1457', '#E91E63'] as [string, string],
              },
            ].map((opt, i) => (
              <Animated.View key={opt.source} entering={FadeInDown.delay(i * 90).springify()} style={{ flex: 1 }}>
                <TouchableOpacity
                  style={s.sourceCard}
                  onPress={() => mode === 'video' ? pickVideo(opt.source) : pickImage(opt.source)}
                  activeOpacity={0.8}
                >
                  <LinearGradient colors={opt.gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.sourceCardInner}>
                    <View style={s.sourceIconWrap}>
                      <Icon name={opt.icon} size={34} color="#fff" />
                    </View>
                    <Text style={s.sourceLabel}>{opt.label}</Text>
                    <Text style={s.sourceSub}>{opt.sub}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>
      )}

      {/* ══════════════ STEP 2b — Vocal ═════════════════════════════════════ */}
      {step === 'record_voice' && (
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <StatusBar barStyle="dark-content" />
          <View style={[s.subHeader, { paddingTop: Platform.OS === 'android' ? 48 : 56, borderBottomColor: colors.border ?? '#eee' }]}>
            <TouchableOpacity onPress={goBack} style={s.subHeaderBtn}>
              <Icon name="arrow-left" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.subHeaderTitle, { color: colors.textPrimary }]}>Message vocal</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={s.recordBody}>
            <Animated.View entering={FadeIn.delay(120)}>
              <LinearGradient
                colors={recording ? ['#AD1457', '#E91E63'] : ['#00838F', '#00BCD4']}
                style={[s.recordOrb, recording && s.recordOrbPulse]}
              >
                <MaterialIcon name="microphone" size={54} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Text style={[s.recordTimer, { color: colors.textPrimary }]}>{recordTime}</Text>
            <Text style={[s.recordStatus, { color: recording ? '#E91E63' : colors.textSecondary }]}>
              {recording ? 'Enregistrement...' : 'Pret a enregistrer'}
            </Text>

            <TouchableOpacity
              style={[s.recordBtn, { backgroundColor: recording ? '#E91E63' : '#00BCD4' }]}
              onPress={recording ? stopRecording : startRecording}
              activeOpacity={0.82}
            >
              <MaterialIcon name={recording ? 'stop' : 'microphone'} size={22} color="#fff" />
              <Text style={s.recordBtnLabel}>{recording ? 'Terminer' : 'Commencer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ══════════════ STEP 2c — Musique ═══════════════════════════════════ */}
      {step === 'pick_audio' && (
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <StatusBar barStyle="dark-content" />
          <View style={[s.subHeader, { paddingTop: Platform.OS === 'android' ? 48 : 56, borderBottomColor: colors.border ?? '#eee' }]}>
            <TouchableOpacity onPress={goBack} style={s.subHeaderBtn}>
              <Icon name="arrow-left" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.subHeaderTitle, { color: colors.textPrimary }]}>
              {mode === 'image_audio' ? 'Ajouter un son' : 'Choisir une musique'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 28 }}>
            <Animated.View entering={FadeInDown.delay(80).springify()}>
              <TouchableOpacity style={s.audioPickCard} onPress={pickAudioFile} activeOpacity={0.8}>
                <LinearGradient colors={['#E65100', '#FF9800']} style={s.audioPickInner}>
                  <View style={s.sourceIconWrap}>
                    <MaterialIcon name="music-note" size={34} color="#fff" />
                  </View>
                  <Text style={s.sourceLabel}>Parcourir les fichiers</Text>
                  <Text style={s.sourceSub}>MP3, M4A, AAC, WAV</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {mode === 'audio' && (
              <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginTop: 28 }}>
                <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Couleur de fond</Text>
                <View style={s.colorGrid}>
                  {TEXT_BG_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[s.colorDot, { backgroundColor: c }, bgColor === c && s.colorDotSelected]}
                      onPress={() => setBgColor(c)}
                    />
                  ))}
                </View>
              </Animated.View>
            )}
          </View>
        </View>
      )}

      {/* ══════════════ STEP 3 — Preview ════════════════════════════════════ */}
      {step === 'preview' && (
        <View style={s.previewRoot}>
          <StatusBar hidden />

          {/* Fond selon le mode */}
          {mode === 'text' && <View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]} />}
          {(mode === 'image' || mode === 'image_audio') && localUri && (
            <Image source={{ uri: localUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          {mode === 'video' && localUri && (
            <StoryVideoPreview uri={localUri} active={videoActive} />
          )}
          {mode === 'audio' && (
            <LinearGradient colors={[bgColor, '#000']} style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcon name="music-note-outline" size={120} color="rgba(255,255,255,0.12)" />
              </View>
            </LinearGradient>
          )}
          {mode === 'voice' && (
            <LinearGradient colors={['#0F0C29', '#302B63']} style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcon name="microphone-outline" size={120} color="rgba(255,255,255,0.1)" />
              </View>
            </LinearGradient>
          )}

          {/* Gradients UI */}
          <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={s.gradTop} pointerEvents="none" />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={s.gradBottom} pointerEvents="none" />

          {/* Header preview */}
          <View style={s.previewHeader}>
            <TouchableOpacity onPress={goBack} style={s.previewBtn}>
              <Icon name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={s.previewModeBadge}>
              <LinearGradient colors={currentOpt.gradient} style={s.previewModeBadgeInner}>
                {currentOpt.iconLib === 'material'
                  ? <MaterialIcon name={currentOpt.icon} size={13} color="#fff" />
                  : <Icon name={currentOpt.icon} size={12} color="#fff" />
                }
                <Text style={s.previewModeLabel}>{currentOpt.label}</Text>
              </LinearGradient>
            </View>
            <TouchableOpacity onPress={resetAndClose} style={s.previewBtn}>
              <Icon name="x" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Caption */}
          {caption ? (
            <View style={mode === 'text' ? s.captionCenter : s.captionBottom} pointerEvents="none">
              <Text style={[
                s.captionText,
                mode === 'text' && {
                  fontSize:   caption.length > 100 ? 18 : caption.length > 50 ? 24 : 30,
                  fontFamily: FONT_STYLES.find(f => f.key === fontStyleKey)?.fontFamily,
                  fontWeight: FONT_STYLES.find(f => f.key === fontStyleKey)?.fontWeight ?? 'bold',
                  fontStyle:  FONT_STYLES.find(f => f.key === fontStyleKey)?.fontStyle ?? 'normal',
                },
              ]}>
                {caption}
              </Text>
            </View>
          ) : null}

          {/* Audio indicator */}
          {(mode === 'audio' || mode === 'voice' || mode === 'image_audio') && audioUri && (
            <View style={s.audioBar}>
              <TouchableOpacity style={s.audioBarBtn} onPress={audioPlaying ? stopAudioPreview : playAudioPreview}>
                <Icon name={audioPlaying ? 'pause' : 'play'} size={18} color="#fff" />
              </TouchableOpacity>
              <View style={s.audioBarWave}>
                {[...Array(18)].map((_, k) => (
                  <View
                    key={k}
                    style={[s.audioBarLine, { height: 6 + Math.sin(k * 0.9) * 10, opacity: audioPlaying ? 1 : 0.4 }]}
                  />
                ))}
              </View>
              <Text style={s.audioBarLabel}>
                {mode === 'voice' ? 'Vocal' : mode === 'image_audio' ? 'Son' : 'Musique'}
              </Text>
            </View>
          )}

          {/* Barre outils texte */}
          {mode === 'text' && (
            <>
              <View style={s.colorBarRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
                  {TEXT_BG_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[s.colorDotSm, { backgroundColor: c }, bgColor === c && s.colorDotSmActive]}
                      onPress={() => setBgColor(c)}
                    />
                  ))}
                </ScrollView>
              </View>
              <View style={s.fontBarRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
                  {FONT_STYLES.map(f => (
                    <TouchableOpacity
                      key={f.key}
                      style={[s.fontChip, fontStyleKey === f.key && s.fontChipOn]}
                      onPress={() => setFontStyleKey(f.key)}
                    >
                      <Text style={[s.fontChipAa, { fontFamily: f.fontFamily, fontWeight: f.fontWeight, fontStyle: f.fontStyle ?? 'normal' }, fontStyleKey === f.key && s.fontChipAaOn]}>Aa</Text>
                      <Text style={[s.fontChipName, fontStyleKey === f.key && s.fontChipNameOn]}>{f.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </>
          )}

          {/* Bottom bar */}
          <View style={s.bottomBar}>
            <TouchableOpacity
              style={s.addTextBtn}
              onPress={() => { setShowTextInput(true); setTimeout(() => inputRef.current?.focus(), 150); }}
            >
              <Icon name="type" size={16} color="#fff" />
              <Text style={s.addTextLabel}>Legende</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.publishBtn, (mode === 'text' && !caption.trim()) && { opacity: 0.4 }]}
              onPress={handlePublish}
              disabled={uploading || (mode === 'text' && !caption.trim())}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#7B3FF2', '#E0389A']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.publishBtnInner}
              >
                {uploading
                  ? <ActivityIndicator size={16} color="#fff" />
                  : <>
                      <Text style={s.publishLabel}>Publier</Text>
                      <Icon name="send" size={13} color="#fff" />
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Saisie texte */}
          {showTextInput && (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={s.textOverlay}
            >
              <View style={s.textRow}>
                <TextInput
                  ref={inputRef}
                  style={s.textInput}
                  placeholder="Ajouter une legende..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={caption}
                  onChangeText={setCaption}
                  maxLength={300}
                  multiline autoFocus
                  onBlur={() => setShowTextInput(false)}
                  onSubmitEditing={() => { Keyboard.dismiss(); setShowTextInput(false); }}
                />
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowTextInput(false); }} style={s.textDoneBtn}>
                  <Text style={s.textDoneLabel}>OK</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}

          <SuccessOverlay visible={showSuccess} />
        </View>
      )}
    </Modal>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Header pick mode ─────────────────────────────────────────────────────────
  pickHeader: {
    paddingTop:        Platform.OS === 'android' ? 48 : 60,
    paddingBottom:     24,
    paddingHorizontal: 20,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               16,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  pickHeaderText: { flex: 1, gap: 3 },
  pickTitle: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  pickSub:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },

  // ── Liste modes ───────────────────────────────────────────────────────────────
  modeList: { paddingTop: 12, paddingBottom: 32, paddingHorizontal: 16, gap: 10 },
  modeRow: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   16,
    paddingVertical: 14,
    paddingRight:   16,
    gap:            14,
    overflow:       'hidden',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.07,
    shadowRadius:   6,
    elevation:      3,
  },
  modeAccentBar: { width: 4, height: '100%', position: 'absolute', left: 0 },
  modeIconBox: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 14,
  },
  modeTexts: { flex: 1, gap: 3 },
  modeLabel: { fontSize: 15, fontWeight: '700' },
  modeSub:   { fontSize: 12, fontWeight: '400' },

  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 4,
  },
  infoText: { fontSize: 12, flex: 1, lineHeight: 18 },

  // ── Sub header (steps 2) ──────────────────────────────────────────────────────
  subHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subHeaderBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  subHeaderTitle: { fontSize: 16, fontWeight: '700' },

  // ── Source picker ─────────────────────────────────────────────────────────────
  sourceGrid: {
    flex: 1, flexDirection: 'row', gap: 12,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 28,
  },
  sourceCard: {
    flex: 1, borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 7,
  },
  sourceCardInner: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 32, gap: 12,
  },
  sourceIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  sourceLabel: { fontSize: 16, fontWeight: '800', color: '#fff' },
  sourceSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center', paddingHorizontal: 10 },

  // ── Audio pick ────────────────────────────────────────────────────────────────
  audioPickCard: {
    borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16, shadowRadius: 10, elevation: 6,
    height: 200,
  },
  audioPickInner: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
  },

  // ── Record ────────────────────────────────────────────────────────────────────
  recordBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  recordOrb: {
    width: 136, height: 136, borderRadius: 68,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#00BCD4', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 18, elevation: 12,
  },
  recordOrbPulse: { shadowColor: '#E91E63' },
  recordTimer:    { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recordStatus:   { fontSize: 14, fontWeight: '600' },
  recordBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 40, paddingVertical: 16, borderRadius: 32, marginTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  recordBtnLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Color palette ─────────────────────────────────────────────────────────────
  sectionLabel: { fontSize: 12, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  colorGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot:     { width: 36, height: 36, borderRadius: 18 },
  colorDotSelected: {
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },

  // ── Preview ───────────────────────────────────────────────────────────────────
  previewRoot:  { flex: 1, backgroundColor: '#000' },
  gradTop:      { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  gradBottom:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: 240 },

  previewHeader: {
    position: 'absolute', top: Platform.OS === 'android' ? 44 : 56,
    left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  previewBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  previewModeBadge: { borderRadius: 20, overflow: 'hidden' },
  previewModeBadgeInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7 },
  previewModeLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },

  captionCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28,
  },
  captionBottom: {
    position: 'absolute', top: '44%', left: 24, right: 24, alignItems: 'center',
  },
  captionText: {
    color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },

  // ── Audio bar ─────────────────────────────────────────────────────────────────
  audioBar: {
    position: 'absolute', bottom: 120, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 28,
  },
  audioBarBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  audioBarWave: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  audioBarLine: { width: 2.5, borderRadius: 2, backgroundColor: '#fff' },
  audioBarLabel: { color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4 },

  // ── Barre couleurs/polices ────────────────────────────────────────────────────
  colorBarRow: { position: 'absolute', top: 118, left: 0, right: 0 },
  colorDotSm:  { width: 26, height: 26, borderRadius: 13 },
  colorDotSmActive: { borderWidth: 2.5, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },

  fontBarRow: { position: 'absolute', top: 156, left: 0, right: 0 },
  fontChip:   { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)' },
  fontChipOn: { backgroundColor: 'rgba(255,255,255,0.35)' },
  fontChipAa: { color: 'rgba(255,255,255,0.7)', fontSize: 17 },
  fontChipAaOn:   { color: '#fff' },
  fontChipName:   { color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 1 },
  fontChipNameOn: { color: '#fff' },

  // ── Bottom bar ────────────────────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute', bottom: 40, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  addTextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  addTextLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  publishBtn:   { borderRadius: 24, overflow: 'hidden' },
  publishBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 13,
  },
  publishLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // ── Text input overlay ────────────────────────────────────────────────────────
  textOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.9)', paddingHorizontal: 16, paddingVertical: 14,
  },
  textRow:      { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  textInput:    { flex: 1, color: '#fff', fontSize: 16, fontWeight: '500', minHeight: 40, maxHeight: 110 },
  textDoneBtn:  { paddingHorizontal: 12, paddingVertical: 8 },
  textDoneLabel:{ color: '#7B3FF2', fontSize: 15, fontWeight: '800' },

  // ── Success overlay ───────────────────────────────────────────────────────────
  successOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  successCard: {
    borderRadius: 24, overflow: 'hidden',
    width: W * 0.82,
    shadowColor: '#7B3FF2', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5, shadowRadius: 28, elevation: 22,
  },
  successInner: {
    alignItems: 'center', paddingVertical: 44, paddingHorizontal: 28, gap: 14,
  },
  successIconRing: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2.5, borderColor: 'rgba(123,63,242,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  successIconGrad: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  successSub:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 20 },
  successDivider: { width: 40, height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 4 },
  successBadgeRow: { flexDirection: 'row', gap: 10 },
  successBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  successBadgeText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
});
