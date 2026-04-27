import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  StatusBar, Modal,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Phase = 'loading' | 'ready' | 'scanned' | 'expired' | 'error';

const POLL_INTERVAL = 3000; // 3s

export const QRCodeScreen: React.FC<Props> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [phase, setPhase]       = useState<Phase>('loading');
  const [token, setToken]       = useState<string | null>(null);
  const [ttl, setTtl]           = useState(120);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const generate = useCallback(async () => {
    clearTimers();
    setPhase('loading');
    setToken(null);
    try {
      const res = await authService.qrGenerate();
      setToken(res.token);
      setTtl(res.ttl_seconds);
      setExpiresAt(new Date(res.expires_at));
      setPhase('ready');

      // Compte à rebours TTL
      timerRef.current = setInterval(() => {
        setTtl(prev => {
          if (prev <= 1) {
            clearTimers();
            setPhase('expired');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Polling statut
      pollRef.current = setInterval(async () => {
        try {
          const status = await authService.qrStatus(res.token);
          if (status.status === 'scanned') {
            clearTimers();
            setPhase('scanned');
          } else if (status.status === 'expired') {
            clearTimers();
            setPhase('expired');
          }
        } catch {}
      }, POLL_INTERVAL);

    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (visible) {
      generate();
    } else {
      clearTimers();
      setPhase('loading');
      setToken(null);
    }
    return clearTimers;
  }, [visible, generate]);

  const qrValue = token ? JSON.stringify({ type: 'folix_qr_login', token }) : '';

  const ttlColor = ttl > 60 ? colors.accentGreen : ttl > 20 ? '#F5A623' : colors.error;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View entering={FadeIn.duration(200)} style={[styles.sheet, { backgroundColor: colors.backgroundSecondary }]}>

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.handle, { backgroundColor: colors.divider }]} />
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Icon name="x" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>Connexion par QR</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Scannez ce code depuis un autre appareil pour vous connecter instantanément.
          </Text>

          {/* QR zone */}
          <View style={styles.qrZone}>
            {phase === 'loading' && (
              <Animated.View entering={FadeIn} style={styles.placeholder}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.statusText, { color: colors.textSecondary, marginTop: 12 }]}>
                  Génération du code…
                </Text>
              </Animated.View>
            )}

            {phase === 'ready' && token && (
              <Animated.View entering={ZoomIn.duration(300)} style={[styles.qrWrapper, { borderColor: colors.primary + '40' }]}>
                <LinearGradient
                  colors={[colors.gradientStart + '12', colors.gradientEnd + '08']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.qrInner}>
                  <QRCode
                    value={qrValue}
                    size={200}
                    color={colors.textPrimary}
                    backgroundColor="transparent"
                    logo={require('../../assets/logo.png')}
                    logoSize={36}
                    logoBackgroundColor="transparent"
                    logoBorderRadius={8}
                    quietZone={8}
                  />
                </View>
                {/* TTL badge */}
                <View style={[styles.ttlBadge, { backgroundColor: ttlColor + '20', borderColor: ttlColor + '50' }]}>
                  <Icon name="clock" size={11} color={ttlColor} />
                  <Text style={[styles.ttlText, { color: ttlColor }]}>
                    {ttl}s
                  </Text>
                </View>
              </Animated.View>
            )}

            {phase === 'scanned' && (
              <Animated.View entering={ZoomIn.duration(300)} style={styles.placeholder}>
                <View style={[styles.successCircle, { backgroundColor: colors.accentGreen + '20' }]}>
                  <Icon name="check-circle" size={52} color={colors.accentGreen} />
                </View>
                <Text style={[styles.statusText, { color: colors.accentGreen, fontWeight: '700', marginTop: 16 }]}>
                  Code scanné !
                </Text>
                <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
                  L'appareil est maintenant connecté.
                </Text>
              </Animated.View>
            )}

            {(phase === 'expired' || phase === 'error') && (
              <Animated.View entering={FadeInDown.duration(300)} style={styles.placeholder}>
                <View style={[styles.successCircle, { backgroundColor: colors.error + '18' }]}>
                  <Icon name={phase === 'expired' ? 'clock' : 'alert-circle'} size={48} color={colors.error} />
                </View>
                <Text style={[styles.statusText, { color: colors.error, fontWeight: '700', marginTop: 16 }]}>
                  {phase === 'expired' ? 'Code expiré' : 'Erreur de génération'}
                </Text>
                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                  onPress={generate}
                >
                  <Icon name="refresh-cw" size={14} color="#fff" />
                  <Text style={styles.retryText}>Générer un nouveau code</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>

          {/* Instructions */}
          {phase === 'ready' && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.steps}>
              {[
                { icon: 'smartphone', text: 'Ouvrez FoliX sur un autre appareil' },
                { icon: 'log-in',     text: "Sur l'écran de connexion, touchez « Scanner QR »" },
                { icon: 'zap',        text: 'Pointez la caméra vers ce code' },
              ].map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepIcon, { backgroundColor: colors.primary + '18' }]}>
                    <Icon name={step.icon as any} size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.stepText, { color: colors.textSecondary }]}>{step.text}</Text>
                </View>
              ))}
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:         { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40, paddingHorizontal: 24 },
  header:        { alignItems: 'center', paddingTop: 12, paddingBottom: 4, position: 'relative' },
  handle:        { width: 40, height: 4, borderRadius: 2 },
  closeBtn:      { position: 'absolute', right: 0, top: 8, padding: 6 },
  title:         { fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  subtitle:      { fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 20, lineHeight: 19 },
  qrZone:        { alignItems: 'center', minHeight: 260, justifyContent: 'center' },
  placeholder:   { alignItems: 'center', paddingVertical: 20 },
  qrWrapper:     {
    borderRadius: 20, borderWidth: 1.5, overflow: 'hidden',
    padding: 20, alignItems: 'center', position: 'relative',
  },
  qrInner:       { alignItems: 'center' },
  ttlBadge:      {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, marginTop: 14,
  },
  ttlText:       { fontSize: 13, fontWeight: '700' },
  statusText:    { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  statusSub:     { fontSize: 13, textAlign: 'center', marginTop: 6 },
  successCircle: { borderRadius: 50, padding: 16 },
  retryBtn:      {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 14, marginTop: 20,
  },
  retryText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  steps:         { marginTop: 20, gap: 12 },
  stepRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon:      { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepText:      { fontSize: 13, flex: 1, lineHeight: 18 },
});
