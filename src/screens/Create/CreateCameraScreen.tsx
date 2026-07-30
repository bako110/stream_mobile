/**
 * CreateCameraScreen — étape 1 du flow de publication d'un reel.
 * Caméra plein écran (photo live, react-native-camera-kit) + accès galerie
 * pour choisir une vidéo ou une photo existante. Design façon TikTok/Instagram :
 * obturateur central, switch caméra, flash, bouton galerie.
 *
 * Note : react-native-camera-kit ne sait capturer que des PHOTOS (pas d'API
 * d'enregistrement vidéo) — filmer une vidéo passe par la galerie.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform,
} from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { launchImageLibrary } from 'react-native-image-picker';
import { check, request, openSettings, PERMISSIONS, RESULTS } from 'react-native-permissions';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence,
} from 'react-native-reanimated';
import { toastService } from '../../services';

export interface CameraPickResult {
  uri:      string;
  isPhoto:  boolean;
}

interface Props {
  onBack:   () => void;
  onPicked: (result: CameraPickResult) => void;
}

const CAMERA_PERMISSION = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;

// react-native-camera-kit n'a pas d'API de permission propre exploitable avant
// le montage du composant (celles exposées sur CameraApi sont des méthodes
// d'instance, disponibles seulement via un ref déjà monté) — react-native-permissions
// (déjà en dépendance) gère la demande cross-plateforme de façon fiable.
async function ensureCameraPermission(): Promise<boolean> {
  try {
    const status = await check(CAMERA_PERMISSION);
    if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) return true;
    if (status === RESULTS.BLOCKED || status === RESULTS.UNAVAILABLE) return false;
    const requested = await request(CAMERA_PERMISSION);
    return requested === RESULTS.GRANTED || requested === RESULTS.LIMITED;
  } catch {
    return false;
  }
}

export const CreateCameraScreen: React.FC<Props> = ({ onBack, onPicked }) => {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<any>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraType,    setCameraType]    = useState<CameraType>(CameraType.Back);
  const [flashOn,       setFlashOn]       = useState(false);
  const [capturing,     setCapturing]     = useState(false);

  // Permission caméra — vérifiée avant de monter <Camera>, sur Android ET iOS
  // (voir ensureCameraPermission : un refus explicite ne doit jamais monter le
  // composant natif, qui échouerait silencieusement ou afficherait un écran noir).
  useEffect(() => {
    ensureCameraPermission().then(setHasPermission);
  }, []);

  // ── Animations obturateur ────────────────────────────────────────────────
  const shutterScale = useSharedValue(1);
  const flashPulse    = useSharedValue(0);
  const shutterStyle  = useAnimatedStyle(() => ({ transform: [{ scale: shutterScale.value }] }));
  const flashStyle    = useAnimatedStyle(() => ({ opacity: flashPulse.value }));

  const handleCapture = useCallback(async () => {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    shutterScale.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 12, stiffness: 220 }));
    flashPulse.value = withSequence(withTiming(0.85, { duration: 60 }), withTiming(0, { duration: 220 }));
    try {
      const result = await cameraRef.current.capture();
      const uri = Platform.OS === 'android' && result.path ? `file://${result.path}` : result.uri;
      onPicked({ uri, isPhoto: true });
    } catch (e: any) {
      toastService.error('Erreur caméra', e?.message ?? 'Impossible de prendre la photo.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, onPicked, shutterScale, flashPulse]);

  const handleSwitchCamera = useCallback(() => {
    setCameraType(prev => (prev === CameraType.Back ? CameraType.Front : CameraType.Back));
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
      onPicked({ uri: asset.uri, isPhoto: isImage });
    });
  }, [onPicked]);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {hasPermission === false ? (
        <View style={s.permissionState}>
          <View style={s.permissionIconWrap}>
            <Icon name="camera-off" size={34} color="rgba(255,255,255,0.6)" />
          </View>
          <Text style={s.permissionTitle}>Accès caméra requis</Text>
          <Text style={s.permissionSub}>
            Autorise Gofolyx à utiliser ta caméra dans les réglages du téléphone pour créer des reels.
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
      ) : hasPermission === true ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          cameraType={cameraType}
          flashMode={flashOn ? 'on' : 'off'}
          resizeMode="cover"
        />
      ) : null}

      {/* Flash de capture — simule le déclic photo, indépendant du flashMode caméra */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashStyle]} />

      {/* Voile haut pour lisibilité header, quel que soit le fond caméra */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }}
        pointerEvents="none"
      />

      {/* ══ HEADER ══ */}
      {/* Steps dots plutôt qu'un titre texte — cohérent avec CreateCaptionScreen/
          CreateRecapScreen, qui font de même. Étape 1/4, rien de fait encore. */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.headerBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="x" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.stepsRow}>
          <View style={[s.stepDot, s.stepDotActive]} />
          <View style={s.stepDot} />
          <View style={s.stepDot} />
          <View style={s.stepDot} />
        </View>
        <TouchableOpacity
          style={[s.headerBtn, flashOn && s.headerBtnActive]}
          onPress={handleToggleFlash}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name={flashOn ? 'zap' : 'zap-off'} size={19} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ══ VOILE BAS + CONTROLES ══ */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 }}
        pointerEvents="none"
      />

      <View style={[s.controls, { paddingBottom: Math.max(insets.bottom, 18) + 14 }]}>
        <TouchableOpacity style={s.videoLink} onPress={handleOpenGallery} activeOpacity={0.8}>
          <Icon name="video" size={13} color="rgba(255,255,255,0.85)" />
          <Text style={s.videoLinkTxt}>Filmer une vidéo depuis la galerie</Text>
        </TouchableOpacity>

        <View style={s.controlsRow}>
          {/* Raccourci galerie — dans le flux normal (pas absolute), pour rester
              garanti aligné verticalement avec l'obturateur quel que soit l'écran. */}
          <View style={s.controlsSide}>
            <TouchableOpacity onPress={handleOpenGallery} activeOpacity={0.85}>
              <View style={[s.galleryThumb, s.galleryThumbEmpty]}>
                <Icon name="image" size={18} color="rgba(255,255,255,0.7)" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Obturateur */}
          <TouchableOpacity onPress={handleCapture} activeOpacity={0.9} disabled={capturing || hasPermission !== true}>
            <Animated.View style={[s.shutterOuter, shutterStyle]}>
              <View style={s.shutterInner} />
            </Animated.View>
          </TouchableOpacity>

          {/* Switch caméra avant/arrière */}
          <View style={s.controlsSide}>
            <TouchableOpacity style={s.switchBtn} onPress={handleSwitchCamera} activeOpacity={0.85} disabled={hasPermission !== true}>
              <Icon name="refresh-cw" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
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
    paddingHorizontal: 16, paddingBottom: 12, zIndex: 10,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerBtnActive: { backgroundColor: 'rgba(255,214,10,0.28)', borderColor: 'rgba(255,214,10,0.6)' },
  stepsRow: { flexDirection: 'row', gap: 6 },
  stepDot: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  stepDotActive: { backgroundColor: '#C026D3', width: 22 },

  permissionState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  permissionIconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  permissionTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permissionSub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  permissionSettingsBtnWrap: {
    marginTop: 20, borderRadius: 26, overflow: 'hidden',
    shadowColor: '#7B3FF2', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  permissionSettingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 13,
  },
  permissionGalleryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  permissionGalleryTxt: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  permissionGalleryTxtSecondary: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', fontSize: 13 },

  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 20 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 40 },
  // Zones latérales de largeur fixe et égale — garantit que l'obturateur reste
  // visuellement centré quel que soit le contenu (galerie à gauche, switch à droite).
  controlsSide: { width: 46, alignItems: 'center' },

  galleryThumb: { width: 46, height: 46, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  galleryThumbEmpty: { backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  shutterOuter: {
    width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: {
    width: SHUTTER_INNER, height: SHUTTER_INNER, borderRadius: SHUTTER_INNER / 2,
    backgroundColor: '#fff',
  },

  switchBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },

  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  videoLinkTxt: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '700' },
});
