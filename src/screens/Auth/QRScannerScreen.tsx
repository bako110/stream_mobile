import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Vibration, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { Camera, CameraType } from 'react-native-camera-kit';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services';

interface Props {
  onLoginSuccess: () => void;
  onClose:        () => void;
}

type Phase = 'scanning' | 'verifying' | 'success' | 'error' | 'manual';

export const QRScannerScreen: React.FC<Props> = ({ onLoginSuccess, onClose }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [phase,       setPhase]       = useState<Phase>('scanning');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [manualToken, setManualToken] = useState('');
  const scannedRef = useRef(false);

  const handleCode = useCallback(async (token: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    Vibration.vibrate(60);
    setPhase('verifying');
    try {
      await authService.qrVerify(token);
      setPhase('success');
      setTimeout(onLoginSuccess, 1200);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'QR code invalide ou expiré.');
      setPhase('error');
    }
  }, [onLoginSuccess]);

  const onReadCode = useCallback((event: any) => {
    if (phase !== 'scanning') return;
    const raw = event.nativeEvent.codeStringValue;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.type === 'folix_qr_login' && parsed?.token) {
        handleCode(parsed.token);
      }
    } catch {}
  }, [phase, handleCode]);

  const retry = () => {
    scannedRef.current = false;
    setErrorMsg('');
    setManualToken('');
    setPhase('scanning');
  };

  /* ── Scanner actif ────────────────────────────────── */
  if (phase === 'scanning') {
    return (
      <View style={styles.root}>
        <Camera
          style={StyleSheet.absoluteFill}
          cameraType={CameraType.Back}
          scanBarcode
          onReadCode={onReadCode}
          showFrame={false}
        />

        {/* Overlay sombre */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.qrFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom} />
        </View>

        {/* Barre haute */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scanner le QR</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Bas */}
        <View style={styles.bottomBar}>
          <Text style={styles.hint}>
            Pointez vers le QR code affiché sur l'autre appareil
          </Text>
          <TouchableOpacity onPress={() => setPhase('manual')} style={styles.manualLink}>
            <Icon name="edit-2" size={13} color="rgba(255,255,255,0.6)" />
            <Text style={styles.manualLinkText}>Saisir le code manuellement</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ── Saisie manuelle ──────────────────────────────── */
  if (phase === 'manual') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.root, { backgroundColor: colors.background }]}
      >
        <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center', paddingHorizontal: 28 }]}>
          <TouchableOpacity
            onPress={retry}
            style={[styles.backBtnDark, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
          >
            <Icon name="arrow-left" size={18} color={colors.textPrimary} />
          </TouchableOpacity>

          <Animated.View entering={FadeInDown} style={{ alignItems: 'center', gap: 16 }}>
            <View style={[styles.resultCircle, { backgroundColor: colors.primary + '18' }]}>
              <Icon name="key" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.resultText, { color: colors.textPrimary }]}>Saisie manuelle</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 }}>
              Copiez le token affiché sous le QR code de l'autre appareil
            </Text>

            <TextInput
              value={manualToken}
              onChangeText={setManualToken}
              placeholder="Collez le token ici"
              placeholderTextColor={colors.textTertiary}
              style={[styles.manualInput, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.primary, opacity: manualToken.trim().length > 10 ? 1 : 0.45 }]}
              onPress={() => manualToken.trim().length > 10 && handleCode(manualToken.trim())}
            >
              <Icon name="log-in" size={16} color="#fff" />
              <Text style={styles.retryText}>Se connecter</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ── verifying / success / error ──────────────────── */
  return (
    <View style={[styles.root, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>

      {phase === 'verifying' && (
        <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 16 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.hint}>Vérification…</Text>
        </Animated.View>
      )}

      {phase === 'success' && (
        <Animated.View entering={ZoomIn.duration(300)} style={{ alignItems: 'center', gap: 14 }}>
          <View style={[styles.resultCircle, { backgroundColor: '#22C55E22' }]}>
            <Icon name="check-circle" size={52} color="#22C55E" />
          </View>
          <Text style={[styles.resultText, { color: '#22C55E' }]}>Connecté !</Text>
        </Animated.View>
      )}

      {phase === 'error' && (
        <Animated.View entering={FadeInDown} style={{ alignItems: 'center', gap: 16, paddingHorizontal: 32 }}>
          <View style={[styles.resultCircle, { backgroundColor: '#EF444422' }]}>
            <Icon name="alert-circle" size={48} color="#EF4444" />
          </View>
          <Text style={[styles.resultText, { color: '#EF4444' }]}>{errorMsg || 'Erreur'}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={retry}>
            <Icon name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Fermer</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const FRAME_SIZE    = 240;
const OVERLAY_COLOR = 'rgba(0,0,0,0.6)';
const CORNER_SIZE   = 24;
const CORNER_THICK  = 3;

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#000' },

  overlayTop:    { flex: 1, backgroundColor: OVERLAY_COLOR },
  overlayMiddle: { flexDirection: 'row', height: FRAME_SIZE },
  overlaySide:   { flex: 1, backgroundColor: OVERLAY_COLOR },
  overlayBottom: { flex: 1, backgroundColor: OVERLAY_COLOR },
  qrFrame:       { width: FRAME_SIZE, height: FRAME_SIZE },

  corner:    { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#fff' },
  cornerTL:  { top: 0,    left: 0,   borderTopWidth: CORNER_THICK,    borderLeftWidth: CORNER_THICK },
  cornerTR:  { top: 0,    right: 0,  borderTopWidth: CORNER_THICK,    borderRightWidth: CORNER_THICK },
  cornerBL:  { bottom: 0, left: 0,   borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK },
  cornerBR:  { bottom: 0, right: 0,  borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK },

  topBar:    {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backBtn:        { padding: 6 },
  headerTitle:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  bottomBar:      {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingVertical: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  hint:           { color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  manualLink:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  manualLinkText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },

  backBtnDark:  { alignSelf: 'flex-start', width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  manualInput:  { width: '100%', borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, marginTop: 4 },
  resultCircle: { borderRadius: 50, padding: 16 },
  resultText:   { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  retryBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
  retryText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
});
