/**
 * StoryCameraScreen — caméra intégrée pour les stories (photo + vidéo).
 * Un seul viewfinder, un seul obturateur : tap = photo, appui long = vidéo
 * (façon Instagram/Snapchat), jusqu'à STORY_MAX_VIDEO_SEC. react-native-camera-kit
 * (utilisée par CreateCameraScreen pour les reels) ne sait capturer que des
 * photos — react-native-vision-camera est utilisée ici car les stories ont
 * besoin d'enregistrer aussi la vidéo dans ce même viewfinder.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import {
  Camera, useCameraDevice, useCameraPermission, useMicrophonePermission,
} from 'react-native-vision-camera';
import { launchImageLibrary } from 'react-native-image-picker';
import { openSettings } from 'react-native-permissions';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence,
} from 'react-native-reanimated';
import { toastService } from '../../services';

export const STORY_MAX_VIDEO_SEC = 90;
const LONG_PRESS_THRESHOLD_MS = 250; // tap vs appui long

export interface StoryCameraResult {
  uri: string;
  isPhoto: boolean;
  durationSec?: number;
}

interface Props {
  onBack: () => void;
  onCaptured: (result: StoryCameraResult) => void;
  onSelectText: () => void;
  onSelectVoice: () => void;
}

export const StoryCameraScreen: React.FC<Props> = ({ onBack, onCaptured, onSelectText, onSelectVoice }) => {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);

  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();

  const [checkedPermissions, setCheckedPermissions] = useState(false);
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const [flashOn, setFlashOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);

  const device = useCameraDevice(position);

  useEffect(() => {
    (async () => {
      if (!hasCameraPermission) await requestCameraPermission();
      if (!hasMicPermission) await requestMicPermission();
      setCheckedPermissions(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer d'enregistrement + arrêt automatique à STORY_MAX_VIDEO_SEC ────────
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});

  const clearRecordTimer = useCallback(() => {
    if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; }
  }, []);

  // ── Animations obturateur ────────────────────────────────────────────────
  const shutterScale = useSharedValue(1);
  const ringProgress = useSharedValue(0);
  const flashPulse = useSharedValue(0);
  const shutterStyle = useAnimatedStyle(() => ({ transform: [{ scale: shutterScale.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashPulse.value }));

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    shutterScale.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 12, stiffness: 220 }));
    flashPulse.value = withSequence(withTiming(0.85, { duration: 60 }), withTiming(0, { duration: 220 }));
    try {
      const photo = await cameraRef.current.takePhoto({ flash: flashOn ? 'on' : 'off' });
      const uri = Platform.OS === 'android' ? `file://${photo.path}` : photo.path;
      onCaptured({ uri, isPhoto: true });
    } catch (e: any) {
      toastService.error('Erreur caméra', e?.message ?? 'Impossible de prendre la photo.');
    }
  }, [flashOn, onCaptured, shutterScale, flashPulse]);

  const handleStopRecording = useCallback(async () => {
    if (!cameraRef.current || !isRecording) return;
    clearRecordTimer();
    try {
      await cameraRef.current.stopRecording();
    } catch (e: any) {
      toastService.error('Erreur caméra', e?.message ?? "Impossible d'arrêter l'enregistrement.");
      setIsRecording(false);
    }
  }, [isRecording, clearRecordTimer]);
  stopRecordingRef.current = handleStopRecording;

  const handleStartRecording = useCallback(() => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    setRecordSec(0);
    ringProgress.value = 0;
    ringProgress.value = withTiming(1, { duration: STORY_MAX_VIDEO_SEC * 1000 });

    recordTimer.current = setInterval(() => {
      setRecordSec(prev => {
        const next = prev + 1;
        if (next >= STORY_MAX_VIDEO_SEC) stopRecordingRef.current();
        return next;
      });
    }, 1000);

    cameraRef.current.startRecording({
      flash: flashOn ? 'on' : 'off',
      onRecordingFinished: video => {
        setIsRecording(false);
        clearRecordTimer();
        const uri = Platform.OS === 'android' ? `file://${video.path}` : video.path;
        onCaptured({ uri, isPhoto: false, durationSec: video.duration });
      },
      onRecordingError: error => {
        setIsRecording(false);
        clearRecordTimer();
        toastService.error('Erreur caméra', error.message ?? "Impossible d'enregistrer la vidéo.");
      },
    });
  }, [isRecording, flashOn, onCaptured, ringProgress, clearRecordTimer]);

  // ── Tap (photo) vs appui long (vidéo) sur un seul obturateur ────────────────
  const pressStartAt = useRef(0);
  const longPressTriggered = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = useCallback(() => {
    pressStartAt.current = Date.now();
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      handleStartRecording();
    }, LONG_PRESS_THRESHOLD_MS);
  }, [handleStartRecording]);

  const handlePressOut = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (longPressTriggered.current) {
      handleStopRecording();
    } else if (Date.now() - pressStartAt.current < LONG_PRESS_THRESHOLD_MS + 400) {
      handleTakePhoto();
    }
  }, [handleStopRecording, handleTakePhoto]);

  const handleSwitchCamera = useCallback(() => {
    setPosition(prev => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const handleToggleFlash = useCallback(() => setFlashOn(v => !v), []);

  const handleOpenGallery = useCallback(() => {
    launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1 }, res => {
      if (res.didCancel) return;
      if (res.errorCode) {
        toastService.error('Erreur', res.errorMessage ?? 'Impossible de sélectionner le média.');
        return;
      }
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      const isImage = asset.type?.startsWith('image/') || (!asset.duration && !asset.uri.match(/\.(mp4|mov|avi|mkv|webm)$/i));
      onCaptured({ uri: asset.uri, isPhoto: isImage, durationSec: asset.duration });
    });
  }, [onCaptured]);

  useEffect(() => () => clearRecordTimer(), [clearRecordTimer]);

  const hasPermission = hasCameraPermission && hasMicPermission;
  const fmtTime = (s: number) => `0:${s.toString().padStart(2, '0')}`;

  return (
    <View style={s.root}>
      {checkedPermissions && !hasPermission ? (
        <View style={s.permissionState}>
          <View style={s.permissionIconWrap}>
            <Icon name="camera-off" size={34} color="rgba(255,255,255,0.6)" />
          </View>
          <Text style={s.permissionTitle}>Accès caméra requis</Text>
          <Text style={s.permissionSub}>
            Autorise Gofolyx à utiliser ta caméra et ton micro dans les réglages du téléphone pour créer une story.
          </Text>
          <TouchableOpacity onPress={() => openSettings().catch(() => {})} activeOpacity={0.88} style={s.permissionSettingsBtnWrap}>
            <LinearGradient colors={['#7B3FF2', '#C026D3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.permissionSettingsBtn}>
              <Icon name="settings" size={15} color="#fff" />
              <Text style={s.permissionGalleryTxt}>Ouvrir les réglages</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={s.permissionGalleryBtn} onPress={handleOpenGallery} activeOpacity={0.85}>
            <Icon name="image" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={s.permissionGalleryTxtSecondary}>Choisir depuis la galerie</Text>
          </TouchableOpacity>
        </View>
      ) : device ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
          video={true}
          audio={hasMicPermission}
          torch={flashOn && position === 'back' ? 'on' : 'off'}
        />
      ) : null}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashStyle]} />

      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }}
        pointerEvents="none"
      />

      {/* ══ HEADER ══ */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.headerBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={22} color="#fff" />
        </TouchableOpacity>

        {isRecording ? (
          <View style={s.recordBadge}>
            <View style={s.recordDot} />
            <Text style={s.recordBadgeText}>{fmtTime(recordSec)}</Text>
          </View>
        ) : (
          <Text style={s.hint}>Tapez pour une photo, maintenez pour filmer</Text>
        )}

        <TouchableOpacity
          style={[s.headerBtn, flashOn && s.headerBtnActive]}
          onPress={handleToggleFlash}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name={flashOn ? 'zap' : 'zap-off'} size={19} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ══ CONTROLES ══ */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 }}
        pointerEvents="none"
      />

      <View style={[s.controls, { paddingBottom: Math.max(insets.bottom, 18) + 14 }]}>
        <View style={s.controlsRow}>
          <View style={s.controlsSide}>
            {!isRecording && (
              <TouchableOpacity onPress={handleOpenGallery} activeOpacity={0.85}>
                <View style={[s.galleryThumb, s.galleryThumbEmpty]}>
                  <Icon name="image" size={18} color="rgba(255,255,255,0.7)" />
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Obturateur unique — tap = photo, appui long = vidéo */}
          <TouchableOpacity
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={1}
            disabled={!device || !hasPermission}
          >
            <Animated.View style={[s.shutterOuter, isRecording && s.shutterOuterRecording, shutterStyle]}>
              <View style={[s.shutterInner, isRecording && s.shutterInnerRecording]} />
            </Animated.View>
          </TouchableOpacity>

          <View style={s.controlsSide}>
            {!isRecording && (
              <TouchableOpacity style={s.switchBtn} onPress={handleSwitchCamera} activeOpacity={0.85} disabled={!device}>
                <Icon name="refresh-cw" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Onglets de mode — Photo/Vidéo restent sur ce viewfinder (tap/appui
            long sur l'obturateur ci-dessus) ; Texte/Vocal ouvrent leur propre
            écran dédié (pas de "caméra" possible pour ces modes-là). */}
        {!isRecording && (
          <View style={s.modeTabs}>
            <TouchableOpacity onPress={onSelectText} activeOpacity={0.8}>
              <Text style={s.modeTab}>TEXTE</Text>
            </TouchableOpacity>
            <Text style={[s.modeTab, s.modeTabActive]}>PHOTO</Text>
            <Text style={[s.modeTab, s.modeTabActive]}>VIDÉO</Text>
            <TouchableOpacity onPress={onSelectVoice} activeOpacity={0.8}>
              <Text style={s.modeTab}>VOCAL</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const SHUTTER = 76;
const SHUTTER_INNER = 62;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, zIndex: 10, gap: 10,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerBtnActive: { backgroundColor: 'rgba(255,214,10,0.28)', borderColor: 'rgba(255,214,10,0.6)' },
  hint: { flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },

  recordBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  recordBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  permissionState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  permissionIconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  permissionTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permissionSub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  permissionSettingsBtnWrap: {
    marginTop: 20, borderRadius: 26, overflow: 'hidden',
    shadowColor: '#7B3FF2', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  permissionSettingsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13 },
  permissionGalleryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingHorizontal: 18, paddingVertical: 10 },
  permissionGalleryTxt: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  permissionGalleryTxtSecondary: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', fontSize: 13 },

  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 20 },
  modeTabs: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  modeTab: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  modeTabActive: { color: '#fff' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 40 },
  controlsSide: { width: 46, alignItems: 'center' },

  galleryThumb: { width: 46, height: 46, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  galleryThumbEmpty: { backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  shutterOuter: {
    width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterOuterRecording: { borderColor: '#EF4444' },
  shutterInner: { width: SHUTTER_INNER, height: SHUTTER_INNER, borderRadius: SHUTTER_INNER / 2, backgroundColor: '#fff' },
  shutterInnerRecording: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#EF4444' },

  switchBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
});
