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
import { SoundPicker } from './SoundPicker';
import { storyService } from '../../services/storyService';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { apiClient, Endpoints } from '../../api';
import type { StoryMediaType, StoryAudienceType } from '../../types/story';
import { compressVideo, cleanupTempVideos } from '../../services/videoCompressService';
import { uploadVideoFromUri, uploadImageFromUri, uploadAudioFile } from '../../services/uploadService';
import { VideoTrimmer } from './VideoTrimmer';

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

type StoryMode = 'text' | 'image' | 'video' | 'voice';
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
  { key: 'video',       icon: 'video',                iconLib: 'feather',  label: 'Video',        sub: 'Clip jusqu\'a 60 secondes',     accent: '#E91E63', gradient: ['#AD1457', '#E91E63'] },
  { key: 'voice',       icon: 'microphone',           iconLib: 'material', label: 'Vocal',        sub: 'Message vocal direct',          accent: '#00BCD4', gradient: ['#00838F', '#00BCD4'] },
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
  const [uploadStep,    setUploadStep]    = useState('');
  const [uploadPct,     setUploadPct]     = useState(0);
  const [showTrimmer,   setShowTrimmer]   = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const tempFilesRef = useRef<string[]>([]);
  const [showTextInput, setShowTextInput] = useState(false);
  const [recording,     setRecording]     = useState(false);
  const [recordTime,    setRecordTime]    = useState('00:00');
  const [audioPlaying,  setAudioPlaying]  = useState(false);
  const [showSuccess,   setShowSuccess]   = useState(false);
  const inputRef = useRef<TextInput>(null);

  // ── Audience ──────────────────────────────────────────────────────────────
  const [audienceType,    setAudienceType]    = useState<StoryAudienceType>('everyone');
  const [selectedUsers,   setSelectedUsers]   = useState<string[]>([]);
  const [contacts,        setContacts]        = useState<{ id: string; name: string; avatar_url: string | null }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [myId,            setMyId]            = useState<string | null>(null);
  const [showAudienceSheet, setShowAudienceSheet] = useState(false);
  const [contactSearch,     setContactSearch]     = useState('');

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
    setShowTrimmer(false); setVideoDuration(0);
    setAudienceType('everyone'); setSelectedUsers([]);
    stopAudioPreview();
    onClose();
  };

  const goBack = () => {
    stopAudioPreview();
    if (showAudienceSheet) {
      setShowAudienceSheet(false);
      return;
    }
    if (step === 'preview') {
      if (mode === 'text')       { setStep('pick_mode'); setCaption(''); }
      else if (mode === 'voice') { setStep('record_voice'); setAudioUri(null); }
      else { setLocalUri(null); setAudioUri(null); setStep('pick_media'); }
    } else if (step === 'pick_audio') {
      setStep('preview'); setAudioUri(null);
    } else if (['pick_media', 'record_voice'].includes(step)) {
      setStep('pick_mode'); setLocalUri(null); setAudioUri(null);
    } else {
      resetAndClose();
    }
  };

  const openAudienceSheet = async () => {
    setShowAudienceSheet(true);
    if (contacts.length > 0) return;
    setContactsLoading(true);
    try {
      const me = await authService.getMe();
      setMyId(String(me.id));
      const [followers, following] = await Promise.all([
        userService.getFollowers(String(me.id)),
        userService.getFollowing(String(me.id)),
      ]);
      const seen = new Set<string>();
      const merged: typeof contacts = [];
      for (const u of [...followers, ...following]) {
        const id = String(u.id);
        if (!seen.has(id)) {
          seen.add(id);
          merged.push({ id, name: u.display_name || u.username || id, avatar_url: u.avatar_url ?? null });
        }
      }
      setContacts(merged);
    } catch {}
    finally { setContactsLoading(false); }
  };

  const toggleUser = (id: string) => {
    setSelectedUsers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ── Pickers ───────────────────────────────────────────────────────────────

  const pickImage = async (source: 'gallery' | 'camera') => {
    try {
      const res = await (source === 'camera' ? launchCamera : launchImageLibrary)({
        mediaType: 'photo', selectionLimit: 1,
      });
      if (res.didCancel || !res.assets?.[0]?.uri) return;
      setLocalUri(res.assets[0].uri);
      setStep('preview');
    } catch (e: any) { Alert.alert('Erreur', e?.message); }
  };

  const pickVideo = async (source: 'gallery' | 'camera') => {
    try {
      const res = await (source === 'camera' ? launchCamera : launchImageLibrary)({
        mediaType: 'video', selectionLimit: 1, videoQuality: 'high' as any,
      });
      if (res.didCancel || !res.assets?.[0]?.uri) return;
      const asset    = res.assets[0];
      const uri      = await normalizeUri(asset.uri!);
      const duration = (asset.duration ?? 0) / 1000; // ms → s
      setLocalUri(uri);
      setVideoDuration(duration);
      if (duration > 60) {
        setShowTrimmer(true); // affiche le trimmer
      } else {
        setStep('preview');
      }
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

  const doUploadImage = async (uri: string) => {
    setUploadStep('Upload image…'); setUploadPct(30);
    const normalized = await normalizeUri(uri);
    const result = await uploadImageFromUri(normalized, 'stories', `s_${Date.now()}.jpg`, 'image/jpeg');
    setUploadPct(100);
    return result.url;
  };

  const doUploadVideo = async (uri: string) => {
    // Étape 1 — compression
    setUploadStep('Compression…'); setUploadPct(0);
    const compressed = await compressVideo(uri, {
      maxDurationSec: 60,
      crf: 23,
      onProgress: p => setUploadPct(Math.round(p * 0.6)),
    });
    tempFilesRef.current.push(compressed.uri);

    // Étape 2 — upload vidéo
    setUploadStep('Upload…'); setUploadPct(60);
    const result = await uploadVideoFromUri(compressed.uri, 'stories', `s_${Date.now()}.mp4`, 'video/mp4');

    // Étape 3 — upload thumbnail si disponible
    let thumbnailUrl: string | undefined;
    if (compressed.thumbnailUri) {
      try {
        setUploadStep('Thumbnail…'); setUploadPct(90);
        const thumbResult = await uploadImageFromUri(compressed.thumbnailUri, 'stories', `st_${Date.now()}.jpg`, 'image/jpeg');
        thumbnailUrl = thumbResult.url;
      } catch { /* thumbnail optionnel */ }
    }

    setUploadPct(100);
    return { url: result.url, duration: compressed.durationSec, thumbnailUrl };
  };

  const doUploadAudio = async (uri: string) => {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'mp4';
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg', m4a: 'audio/x-m4a', aac: 'audio/aac',
      wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'audio/mp4',
    };
    const mimeType = mimeMap[ext] ?? 'audio/mp4';
    const result = await uploadAudioFile(uri, `s_${Date.now()}.${ext}`, mimeType, 'stories');
    return result.url;
  };

  // ── Publish ───────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    setUploading(true);
    setUploadPct(0);
    try {
      let media_url: string | undefined;
      let media_type: StoryMediaType = 'image';
      let thumbnail_url: string | undefined;
      let audio_url: string | undefined;
      let duration_sec = 5;
      let background_color: string | undefined;

      switch (mode) {
        case 'text':
          media_type = 'text'; background_color = bgColor;
          break;
        case 'image':
          media_url = await doUploadImage(localUri!);
          media_type = 'image'; thumbnail_url = media_url;
          break;
        case 'video': {
          const v = await doUploadVideo(localUri!);
          media_url = v.url; media_type = 'video';
          duration_sec = Math.min(Math.ceil(v.duration), 60);
          thumbnail_url = v.thumbnailUrl;
          break;
        }
        case 'voice': {
          const au = audioUri!;
          setUploadStep('Upload vocal…'); setUploadPct(20);
          audio_url = (au.startsWith('http') ? au : await doUploadAudio(au));
          media_type = 'voice'; background_color = '#1A237E'; duration_sec = 15;
          break;
        }
      }

      if (audioUri && mode !== 'voice') {
        setUploadStep('Upload son…'); setUploadPct(80);
        audio_url = audioUri.startsWith('http') ? audioUri : await doUploadAudio(audioUri);
        if (mode === 'text') { media_type = 'audio'; background_color = background_color ?? bgColor; }
        duration_sec = 15;
      }

      await storyService.create({
        media_url, media_type, thumbnail_url,
        caption: caption.trim() || undefined,
        duration_sec, background_color, audio_url,
        font_style: mode === 'text' ? fontStyleKey : undefined,
        audience_type: audienceType,
        audience_user_ids: audienceType !== 'everyone' ? selectedUsers : [],
      });

      await cleanupTempVideos(tempFilesRef.current);
      tempFilesRef.current = [];

      setUploading(false);
      setShowSuccess(true);
      setTimeout(() => { onCreated(); resetAndClose(); }, 2400);
    } catch (e: any) {
      await cleanupTempVideos(tempFilesRef.current);
      tempFilesRef.current = [];
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
              <Animated.View key={opt.source} entering={FadeInDown.delay(i * 90).springify()}>
                <TouchableOpacity
                  style={s.sourceCard}
                  onPress={() => mode === 'video' ? pickVideo(opt.source) : pickImage(opt.source)}
                  activeOpacity={0.8}
                >
                  <LinearGradient colors={opt.gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.sourceCardInner}>
                    <View style={s.sourceIconWrap}>
                      <Icon name={opt.icon} size={24} color="#fff" />
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

      {/* ══════════════ STEP 2c — Ajouter un son ════════════════════════════ */}
      {step === 'pick_audio' && (
        <SoundPicker
          colors={colors}
          onGoBack={goBack}
          onSelectLocal={pickAudioFile}
          onSelectOnline={(uri: string) => { setAudioUri(uri); setStep('preview'); }}
        />
      )}

      {/* ══════════════ TRIMMER — si vidéo > 60s ════════════════════════════ */}
      {showTrimmer && localUri && (
        <VideoTrimmer
          uri={localUri}
          duration={videoDuration}
          onConfirm={(trimmedUri) => {
            setLocalUri(trimmedUri);
            tempFilesRef.current.push(trimmedUri);
            setShowTrimmer(false);
            setStep('preview');
          }}
          onCancel={() => {
            setShowTrimmer(false);
            setLocalUri(null);
            setStep('pick_media');
          }}
        />
      )}

      {/* ══════════════ STEP 3 — Preview ════════════════════════════════════ */}
      {!showTrimmer && step === 'preview' && (
        <View style={s.previewRoot}>
          <StatusBar hidden />

          {/* Fond selon le mode */}
          {mode === 'text' && <View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]} />}
          {(mode === 'image') && localUri && (
            <Image source={{ uri: localUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          {mode === 'video' && localUri && (
            <StoryVideoPreview uri={localUri} active={videoActive} />
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

          {/* Audio indicator — visible for any mode with attached sound */}
          {audioUri && mode !== 'voice' && (
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
              <Text style={s.audioBarLabel}>Son</Text>
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
            <View style={s.bottomActions}>
              <TouchableOpacity
                style={s.addTextBtn}
                onPress={() => { setShowTextInput(true); setTimeout(() => inputRef.current?.focus(), 150); }}
              >
                <Icon name="type" size={16} color="#fff" />
                <Text style={s.addTextLabel}>Legende</Text>
              </TouchableOpacity>

              {mode !== 'voice' && (
                <TouchableOpacity
                  style={[s.addTextBtn, audioUri && s.addTextBtnActive]}
                  onPress={() => setStep('pick_audio')}
                >
                  <MaterialIcon name="music-note" size={16} color={audioUri ? '#7B3FF2' : '#fff'} />
                  <Text style={[s.addTextLabel, audioUri && { color: '#7B3FF2' }]}>Son</Text>
                </TouchableOpacity>
              )}

              {/* Chip audience */}
              <TouchableOpacity style={s.audienceChip} onPress={openAudienceSheet} activeOpacity={0.75}>
                <Icon
                  name={audienceType === 'everyone' ? 'globe' : audienceType === 'selected' ? 'users' : 'eye-off'}
                  size={13}
                  color="#fff"
                />
                <Text style={s.audienceChipLabel}>
                  {audienceType === 'everyone' ? 'Tous' : audienceType === 'selected' ? `${selectedUsers.length || '?'} pers.` : `Sauf ${selectedUsers.length || '?'}`}
                </Text>
                <Icon name="chevron-down" size={11} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>

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
                {uploading ? (
                  <View style={{ alignItems: 'center', minWidth: 100 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <ActivityIndicator size={12} color="#fff" />
                      <Text style={[s.publishLabel, { fontSize: 11 }]}>{uploadStep}</Text>
                    </View>
                    <View style={{ width: 100, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 }}>
                      <View style={{ width: `${uploadPct}%` as any, height: 3, backgroundColor: '#fff', borderRadius: 2 }} />
                    </View>
                  </View>
                ) : (
                  <>
                    <Icon name="send" size={14} color="#fff" />
                    <Text style={s.publishLabel}>Publier</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Audience bottom sheet inline */}
          {showAudienceSheet && (
            <Animated.View entering={FadeInDown.duration(220)} style={s.audSheet}>
              {/* Drag handle */}
              <View style={s.audHandle} />

              <Text style={s.audSheetTitle}>Qui peut voir cette story ?</Text>

              {/* 3 options */}
              <View style={s.audOptions}>
                {([
                  { key: 'everyone', icon: 'globe',   label: 'Tout le monde',   sub: 'Tous vos abonnes' },
                  { key: 'except',   icon: 'eye-off',  label: 'Sauf...',          sub: 'Tout le monde sauf certains' },
                  { key: 'selected', icon: 'users',    label: 'Seulement...',     sub: 'Uniquement les personnes choisies' },
                ] as { key: StoryAudienceType; icon: string; label: string; sub: string }[]).map(opt => {
                  const active = audienceType === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.audOptRow, active && s.audOptRowActive]}
                      onPress={() => { setAudienceType(opt.key); if (opt.key === 'everyone') setSelectedUsers([]); }}
                      activeOpacity={0.75}
                    >
                      <View style={[s.audOptIcon, active && s.audOptIconActive]}>
                        <Icon name={opt.icon} size={18} color={active ? '#7B3FF2' : 'rgba(255,255,255,0.7)'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.audOptLabel, active && { color: '#fff' }]}>{opt.label}</Text>
                        <Text style={s.audOptSub}>{opt.sub}</Text>
                      </View>
                      {active && <Icon name="check-circle" size={18} color="#7B3FF2" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Liste contacts si selected/except */}
              {audienceType !== 'everyone' && (
                <View style={s.audContactsWrap}>
                  <Text style={s.audContactsLabel}>
                    {audienceType === 'except' ? 'EXCLURE' : 'INCLURE'}
                    {selectedUsers.length > 0 && `  •  ${selectedUsers.length} selectionne(s)`}
                  </Text>
                  {contactsLoading ? (
                    <ActivityIndicator color="#7B3FF2" style={{ marginVertical: 16 }} />
                  ) : contacts.length === 0 ? (
                    <Text style={s.audEmpty}>Aucun abonne trouve</Text>
                  ) : (
                    <>
                      {/* Champ de recherche */}
                      <View style={s.audSearchRow}>
                        <Icon name="search" size={14} color="rgba(255,255,255,0.4)" />
                        <TextInput
                          style={s.audSearchInput}
                          placeholder="Rechercher..."
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          value={contactSearch}
                          onChangeText={setContactSearch}
                          autoCorrect={false}
                          autoCapitalize="none"
                        />
                        {contactSearch.length > 0 && (
                          <TouchableOpacity onPress={() => setContactSearch('')}>
                            <Icon name="x" size={13} color="rgba(255,255,255,0.4)" />
                          </TouchableOpacity>
                        )}
                      </View>

                      <ScrollView style={s.audContactsList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {contacts
                          .filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
                          .map((c, i, arr) => {
                            const checked = selectedUsers.includes(c.id);
                            return (
                              <TouchableOpacity
                                key={c.id}
                                style={[s.audContactRow, i < arr.length - 1 && s.audContactRowBorder]}
                                onPress={() => toggleUser(c.id)}
                                activeOpacity={0.7}
                              >
                                {c.avatar_url ? (
                                  <Image source={{ uri: c.avatar_url }} style={s.audAvatar} />
                                ) : (
                                  <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.audAvatarFallback}>
                                    <Text style={s.audAvatarInitial}>{(c.name[0] ?? '?').toUpperCase()}</Text>
                                  </LinearGradient>
                                )}
                                <Text style={s.audContactName} numberOfLines={1}>{c.name}</Text>
                                <View style={[s.audCheckbox, checked && s.audCheckboxOn]}>
                                  {checked && <Icon name="check" size={12} color="#fff" />}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        {contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase())).length === 0 && (
                          <Text style={s.audEmpty}>Aucun resultat</Text>
                        )}
                      </ScrollView>
                    </>
                  )}
                </View>
              )}

              {/* Fermer le sheet */}
              <TouchableOpacity style={s.audDoneBtn} onPress={() => { setShowAudienceSheet(false); setContactSearch(''); }} activeOpacity={0.8}>
                <Text style={s.audDoneLabel}>
                  {audienceType === 'everyone'
                    ? 'Confirmer'
                    : selectedUsers.length === 0
                      ? 'Selectionnez au moins une personne'
                      : 'Confirmer'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Overlay tap-to-close audience sheet */}
          {showAudienceSheet && (
            <TouchableOpacity
              style={s.audOverlay}
              activeOpacity={1}
              onPress={() => { setShowAudienceSheet(false); setContactSearch(''); }}
            />
          )}

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
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 28,
  },
  sourceCard: {
    borderRadius: 20, overflow: 'hidden',
    height: 160,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 7,
  },
  sourceCardInner: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 8,
  },
  sourceIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  sourceLabel: { fontSize: 14, fontWeight: '800', color: '#fff' },
  sourceSub:   { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center', paddingHorizontal: 8 },

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
  bottomActions: {
    flexDirection: 'row', gap: 8,
  },
  addTextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  addTextBtnActive: {
    backgroundColor: 'rgba(123,63,242,0.2)',
    borderWidth: 1, borderColor: 'rgba(123,63,242,0.4)',
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

  // ── Audience chip (bottom bar) ────────────────────────────────────────────────
  audienceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  audienceChipLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // ── Audience bottom sheet ─────────────────────────────────────────────────────
  audOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },
  audSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    zIndex: 11,
    maxHeight: H * 0.75,
  },
  audHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 10, marginBottom: 14,
  },
  audSheetTitle: {
    fontSize: 15, fontWeight: '700', color: '#fff',
    paddingHorizontal: 20, marginBottom: 12,
  },
  audOptions: { paddingHorizontal: 14, gap: 8 },
  audOptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, padding: 13,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  audOptRowActive: { backgroundColor: 'rgba(123,63,242,0.18)', borderWidth: 1, borderColor: 'rgba(123,63,242,0.5)' },
  audOptIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  audOptIconActive: { backgroundColor: 'rgba(123,63,242,0.25)' },
  audOptLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  audOptSub:   { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  audContactsWrap: { paddingHorizontal: 14, marginTop: 16 },
  audContactsLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: 'rgba(255,255,255,0.4)', marginBottom: 8 },
  audSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 10,
  },
  audSearchInput: { flex: 1, color: '#fff', fontSize: 13, padding: 0 },
  audContactsList:  { maxHeight: 200 },
  audContactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  audContactRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  audAvatar:        { width: 38, height: 38, borderRadius: 19 },
  audAvatarFallback:{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  audAvatarInitial: { color: '#fff', fontSize: 14, fontWeight: '700' },
  audContactName:   { flex: 1, fontSize: 13, fontWeight: '500', color: '#fff' },
  audCheckbox: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  audCheckboxOn: { backgroundColor: '#7B3FF2', borderColor: '#7B3FF2' },
  audEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 20 },

  audDoneBtn: {
    marginHorizontal: 14, marginTop: 16,
    backgroundColor: '#7B3FF2', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  audDoneLabel: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
