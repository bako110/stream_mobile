/**
 * WebQRScannerScreen — flux "WhatsApp Web"
 *
 * L'utilisateur est déjà connecté sur le mobile.
 * Il scanne le QR affiché sur le site web FoliX.
 * Le mobile appelle POST /auth/web-qr/scan → le site reçoit ses tokens et se connecte.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Vibration, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { Camera, CameraType } from 'react-native-camera-kit';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

type Phase = 'scanning' | 'verifying' | 'success' | 'error' | 'manual';

// UUID v4 regex — le site web encode juste le token brut dans le QR
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractToken(raw: string): string | null {
  const trimmed = raw.trim();
  // Format direct UUID (encodé par le site web)
  if (UUID_RE.test(trimmed)) return trimmed;
  // Format JSON enveloppé — compatibilité future
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.token && UUID_RE.test(parsed.token)) return parsed.token;
  } catch {}
  return null;
}

export const WebQRScannerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme: { colors } } = useTheme();

  const [phase,       setPhase]       = useState<Phase>('scanning');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [manualToken, setManualToken] = useState('');
  const scannedRef = useRef(false);

  const handleToken = useCallback(async (token: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    Vibration.vibrate(60);
    setPhase('verifying');
    try {
      await apiClient.post(Endpoints.auth.webQrScan, { token });
      setPhase('success');
      // Laisser l'utilisateur voir le succès puis retourner
      setTimeout(() => navigation.goBack(), 2000);
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? 'QR invalide ou expiré.';
      setErrorMsg(msg);
      setPhase('error');
    }
  }, [navigation]);

  const onReadCode = useCallback((event: any) => {
    if (phase !== 'scanning') return;
    const raw: string = event.nativeEvent.codeStringValue ?? '';
    if (!raw) return;
    const token = extractToken(raw);
    if (token) handleToken(token);
  }, [phase, handleToken]);

  const retry = () => {
    scannedRef.current = false;
    setErrorMsg('');
    setManualToken('');
    setPhase('scanning');
  };

  // ── Phase: scanner actif ──────────────────────────────────────────────────

  if (phase === 'scanning') {
    return (
      <View style={st.root}>
        <Camera
          style={StyleSheet.absoluteFill}
          cameraType={CameraType.Back}
          scanBarcode
          onReadCode={onReadCode}
          showFrame={false}
        />

        {/* Overlay sombre avec fenêtre transparente */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={st.overlayTop} />
          <View style={st.overlayRow}>
            <View style={st.overlaySide} />
            <View style={st.frame}>
              <View style={[st.corner, st.cTL]} />
              <View style={[st.corner, st.cTR]} />
              <View style={[st.corner, st.cBL]} />
              <View style={[st.corner, st.cBR]} />
            </View>
            <View style={st.overlaySide} />
          </View>
          <View style={st.overlayBottom} />
        </View>

        {/* Barre haute */}
        <View style={st.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <Icon name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={st.topTitle}>Scanner le QR web</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Barre basse */}
        <View style={st.bottomBar}>
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={st.badge}
          >
            <Icon name="monitor" size={13} color="#fff" />
            <Text style={st.badgeText}>Connexion au site web FoliX</Text>
          </LinearGradient>
          <Text style={st.hint}>
            Ouvrez folix.com sur votre ordinateur, allez sur l'ecran de connexion et scannez le QR code affiché.
          </Text>
          <TouchableOpacity onPress={() => setPhase('manual')} style={st.manualLink}>
            <Icon name="edit-2" size={13} color="rgba(255,255,255,0.55)" />
            <Text style={st.manualLinkText}>Saisir le code manuellement</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Phase: saisie manuelle ────────────────────────────────────────────────

  if (phase === 'manual') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[st.root, { backgroundColor: colors.background }]}
      >
        <View style={[st.root, { backgroundColor: colors.background, justifyContent: 'center', paddingHorizontal: 28 }]}>
          <TouchableOpacity
            onPress={retry}
            style={[st.backBtnDark, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Icon name="arrow-left" size={18} color={colors.textPrimary} />
          </TouchableOpacity>

          <Animated.View entering={FadeInDown} style={{ alignItems: 'center', gap: 16 }}>
            <LinearGradient colors={['#7B3FF2', '#E0389A']} style={st.manualCircle}>
              <Icon name="key" size={34} color="#fff" />
            </LinearGradient>
            <Text style={[st.resultText, { color: colors.textPrimary }]}>Saisie manuelle</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Copiez le token UUID affiché sous le QR code sur le site web.
            </Text>

            <TextInput
              value={manualToken}
              onChangeText={setManualToken}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              placeholderTextColor={colors.textTertiary}
              style={[st.manualInput, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />

            <TouchableOpacity
              style={[
                st.confirmBtn,
                { backgroundColor: '#7B3FF2', opacity: manualToken.trim().length > 10 ? 1 : 0.4 },
              ]}
              onPress={() => {
                const t = extractToken(manualToken.trim());
                if (t) handleToken(t);
              }}
            >
              <Icon name="log-in" size={16} color="#fff" />
              <Text style={st.confirmBtnText}>Connecter le site web</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Phases verifying / success / error ────────────────────────────────────

  return (
    <View style={[st.root, { backgroundColor: '#0D0D1A', justifyContent: 'center', alignItems: 'center' }]}>

      {phase === 'verifying' && (
        <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 20 }}>
          <ActivityIndicator size="large" color="#7B3FF2" />
          <Text style={st.hint}>Connexion en cours…</Text>
        </Animated.View>
      )}

      {phase === 'success' && (
        <Animated.View entering={ZoomIn.duration(320)} style={{ alignItems: 'center', gap: 18 }}>
          <View style={[st.resultCircle, { backgroundColor: '#22C55E18' }]}>
            <Icon name="monitor" size={40} color="#22C55E" />
          </View>
          <Text style={[st.resultText, { color: '#22C55E' }]}>Site web connecté !</Text>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 }}>
            Le site web FoliX est maintenant connecté avec votre compte.
          </Text>
        </Animated.View>
      )}

      {phase === 'error' && (
        <Animated.View entering={FadeInDown} style={{ alignItems: 'center', gap: 18, paddingHorizontal: 32 }}>
          <View style={[st.resultCircle, { backgroundColor: '#EF444420' }]}>
            <Icon name="alert-circle" size={44} color="#EF4444" />
          </View>
          <Text style={[st.resultText, { color: '#EF4444' }]}>{errorMsg || 'Erreur'}</Text>
          <TouchableOpacity style={[st.confirmBtn, { backgroundColor: '#7B3FF2' }]} onPress={retry}>
            <Icon name="refresh-cw" size={14} color="#fff" />
            <Text style={st.confirmBtnText}>Reessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Fermer</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const FRAME       = 240;
const OVERLAY     = 'rgba(0,0,0,0.62)';
const CORNER_S    = 26;
const CORNER_W    = 3.5;

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#000' },

  overlayTop:    { flex: 1, backgroundColor: OVERLAY },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: OVERLAY },
  overlayBottom: { flex: 1, backgroundColor: OVERLAY },
  frame:         { width: FRAME, height: FRAME },

  corner:  { position: 'absolute', width: CORNER_S, height: CORNER_S, borderColor: '#fff' },
  cTL:     { top: 0,    left: 0,   borderTopWidth: CORNER_W,    borderLeftWidth: CORNER_W },
  cTR:     { top: 0,    right: 0,  borderTopWidth: CORNER_W,    borderRightWidth: CORNER_W },
  cBL:     { bottom: 0, left: 0,   borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W },
  cBR:     { bottom: 0, right: 0,  borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W },

  topBar:   {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backBtn:      { padding: 6 },
  topTitle:     { color: '#fff', fontSize: 17, fontWeight: '700' },

  bottomBar:   {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', gap: 14, paddingHorizontal: 28, paddingBottom: 44, paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  badgeText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  hint:         { color: 'rgba(255,255,255,0.65)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  manualLink:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  manualLinkText:{ color: 'rgba(255,255,255,0.45)', fontSize: 12 },

  backBtnDark:   { alignSelf: 'flex-start', width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  manualCircle:  { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  manualInput:   { width: '100%', borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 13, fontFamily: 'monospace', letterSpacing: 0.5 },
  resultCircle:  { borderRadius: 60, padding: 22 },
  resultText:    { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  confirmBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
  confirmBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
});
