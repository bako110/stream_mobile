import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  PermissionsAndroid, ActivityIndicator, Vibration,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services';

interface Props {
  onLoginSuccess: () => void;
  onClose:        () => void;
}

type Phase = 'permission' | 'scanning' | 'verifying' | 'success' | 'error';

export const QRScannerScreen: React.FC<Props> = ({ onLoginSuccess, onClose }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [phase,     setPhase]     = useState<Phase>('permission');
  const [errorMsg,  setErrorMsg]  = useState('');
  const device = useCameraDevice('back');
  const scannedRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          setPhase('scanning');
        } else {
          setErrorMsg('Permission caméra refusée.');
          setPhase('error');
        }
      } else {
        const status = await Camera.requestCameraPermission();
        if (status === 'granted') {
          setPhase('scanning');
        } else {
          setErrorMsg('Permission caméra refusée.');
          setPhase('error');
        }
      }
    })();
  }, []);

  const handleCode = async (token: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    Vibration.vibrate(60);
    setPhase('verifying');
    try {
      await authService.qrVerify(token);
      setPhase('success');
      setTimeout(onLoginSuccess, 1000);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'QR code invalide ou expiré.');
      setPhase('error');
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (phase !== 'scanning') return;
      const raw = codes[0]?.value;
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.type === 'folix_qr_login' && parsed?.token) {
          handleCode(parsed.token);
        }
      } catch {}
    },
  });

  const retry = () => {
    scannedRef.current = false;
    setErrorMsg('');
    setPhase('scanning');
  };

  return (
    <View style={[styles.root, { backgroundColor: '#000' }]}>

      {/* Caméra */}
      {device && phase === 'scanning' && (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          codeScanner={codeScanner}
        />
      )}

      {/* Overlay gradient haut */}
      <LinearGradient
        colors={['rgba(0,0,0,0.72)', 'transparent']}
        style={styles.gradTop}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scanner le QR</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Cadre QR */}
      {phase === 'scanning' && (
        <Animated.View entering={FadeIn.delay(200)} style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame}>
            {/* Coins */}
            <View style={[styles.corner, styles.cornerTL, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: colors.primary }]} />
          </View>
        </Animated.View>
      )}

      {/* Overlay gradient bas */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.gradBottom}
        pointerEvents="none"
      />

      {/* États */}
      <View style={styles.bottomArea}>

        {phase === 'scanning' && (
          <Animated.View entering={FadeInDown.delay(300)} style={{ alignItems: 'center' }}>
            <Text style={styles.hint}>
              Pointez vers le QR code affiché sur l'autre appareil
            </Text>
          </Animated.View>
        )}

        {phase === 'permission' && (
          <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.hint}>Demande de permission…</Text>
          </Animated.View>
        )}

        {phase === 'verifying' && (
          <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 14 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.hint}>Vérification en cours…</Text>
          </Animated.View>
        )}

        {phase === 'success' && (
          <Animated.View entering={ZoomIn.duration(300)} style={{ alignItems: 'center', gap: 12 }}>
            <View style={[styles.resultCircle, { backgroundColor: colors.accentGreen + '22' }]}>
              <Icon name="check-circle" size={52} color={colors.accentGreen} />
            </View>
            <Text style={[styles.resultText, { color: colors.accentGreen }]}>Connecté !</Text>
          </Animated.View>
        )}

        {phase === 'error' && (
          <Animated.View entering={FadeInDown} style={{ alignItems: 'center', gap: 14 }}>
            <View style={[styles.resultCircle, { backgroundColor: '#ff4d4d22' }]}>
              <Icon name="alert-circle" size={48} color="#ff4d4d" />
            </View>
            <Text style={[styles.resultText, { color: '#ff4d4d' }]}>{errorMsg || 'Erreur'}</Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              onPress={retry}
            >
              <Icon name="refresh-cw" size={14} color="#fff" />
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const CORNER = 28;
const FRAME  = 240;

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#000' },
  gradTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 140, zIndex: 10 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 260, zIndex: 10 },
  header:     {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 12,
  },
  backBtn:     { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  frameWrap:  {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
  frame:      { width: FRAME, height: FRAME, position: 'relative' },
  corner:     { position: 'absolute', width: CORNER, height: CORNER, borderWidth: 3 },
  cornerTL:   { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 10 },
  cornerTR:   { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 10 },
  cornerBL:   { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 10 },
  cornerBR:   { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 10 },
  bottomArea: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    zIndex: 20, paddingBottom: 50, paddingHorizontal: 32,
    alignItems: 'center', justifyContent: 'center', minHeight: 180,
  },
  hint:       { color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  resultCircle: { borderRadius: 50, padding: 14 },
  resultText:   { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  retryBtn:     {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14,
  },
  retryText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
});
