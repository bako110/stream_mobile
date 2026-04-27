import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, ScrollView,
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

const POLL_INTERVAL = 3000;

export const QRCodeScreen: React.FC<Props> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [phase, setPhase] = useState<Phase>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [ttl,   setTtl]   = useState(120);

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
      setPhase('ready');

      timerRef.current = setInterval(() => {
        setTtl(prev => {
          if (prev <= 1) { clearTimers(); setPhase('expired'); return 0; }
          return prev - 1;
        });
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          const s = await authService.qrStatus(res.token);
          if (s.status === 'scanned') { clearTimers(); setPhase('scanned'); }
          else if (s.status === 'expired') { clearTimers(); setPhase('expired'); }
        } catch {}
      }, POLL_INTERVAL);

    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (visible) { generate(); }
    else { clearTimers(); setPhase('loading'); setToken(null); }
    return clearTimers;
  }, [visible, generate]);

  const qrValue  = token ? JSON.stringify({ type: 'folix_qr_login', token }) : 'folix';
  const ttlColor = ttl > 60 ? '#22C55E' : ttl > 20 ? '#F5A623' : '#EF4444';
  const ttlMin   = Math.floor(ttl / 60);
  const ttlSec   = ttl % 60;
  const ttlLabel = ttlMin > 0 ? `${ttlMin}:${ttlSec.toString().padStart(2, '0')}` : `${ttl}s`;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <Animated.View entering={FadeIn.duration(250)} style={[s.sheet, { backgroundColor: colors.background }]}>

          {/* Handle + close */}
          <View style={s.header}>
            <View style={[s.handle, { backgroundColor: colors.divider }]} />
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Icon name="x" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {/* Titre */}
            <Text style={[s.title, { color: colors.textPrimary }]}>Connexion par QR code</Text>

            {/* Zone QR */}
            <View style={s.qrZone}>

              {phase === 'loading' && (
                <Animated.View entering={FadeIn} style={s.center}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[s.statusSub, { color: colors.textSecondary, marginTop: 14 }]}>
                    Génération du code…
                  </Text>
                </Animated.View>
              )}

              {phase === 'ready' && token && (
                <Animated.View entering={ZoomIn.duration(280)} style={s.center}>
                  {/* QR sur fond blanc pour que les modules noirs soient visibles */}
                  <View style={s.qrCard}>
                    <View style={s.qrWhiteBg}>
                      <QRCode
                        value={qrValue}
                        size={196}
                        color="#000000"
                        backgroundColor="#FFFFFF"
                        quietZone={10}
                      />
                    </View>
                    {/* Badge TTL */}
                    <View style={[s.ttlBadge, { borderColor: ttlColor + '60', backgroundColor: ttlColor + '15' }]}>
                      <Icon name="clock" size={12} color={ttlColor} />
                      <Text style={[s.ttlText, { color: ttlColor }]}>Expire dans {ttlLabel}</Text>
                    </View>
                    {/* Token visible pour saisie manuelle (Android) */}
                    <View style={[s.tokenBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                      <Icon name="hash" size={11} color={colors.textTertiary} />
                      <Text style={[s.tokenText, { color: colors.textTertiary }]} selectable>
                        {token}
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              )}

              {phase === 'scanned' && (
                <Animated.View entering={ZoomIn.duration(300)} style={s.center}>
                  <View style={[s.bigCircle, { backgroundColor: '#22C55E18' }]}>
                    <Icon name="check-circle" size={56} color="#22C55E" />
                  </View>
                  <Text style={[s.statusTitle, { color: '#22C55E' }]}>Code scanné !</Text>
                  <Text style={[s.statusSub, { color: colors.textSecondary }]}>
                    L'autre appareil est maintenant connecté.
                  </Text>
                </Animated.View>
              )}

              {(phase === 'expired' || phase === 'error') && (
                <Animated.View entering={FadeInDown.duration(280)} style={s.center}>
                  <View style={[s.bigCircle, { backgroundColor: '#EF444418' }]}>
                    <Icon name={phase === 'expired' ? 'clock' : 'alert-circle'} size={52} color="#EF4444" />
                  </View>
                  <Text style={[s.statusTitle, { color: '#EF4444' }]}>
                    {phase === 'expired' ? 'Code expiré' : 'Erreur de génération'}
                  </Text>
                  <TouchableOpacity style={[s.retryBtn, { backgroundColor: colors.primary }]} onPress={generate}>
                    <Icon name="refresh-cw" size={14} color="#fff" />
                    <Text style={s.retryText}>Générer un nouveau code</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>

            {/* Instructions — toujours visibles */}
            {(phase === 'ready' || phase === 'loading') && (
              <Animated.View entering={FadeInDown.delay(300)} style={s.stepsWrap}>
                <Text style={[s.stepsTitle, { color: colors.textTertiary }]}>COMMENT ÇA MARCHE</Text>
                {[
                  { n: '1', icon: 'smartphone',  text: 'Ouvrez FoliX sur un autre téléphone' },
                  { n: '2', icon: 'log-in',       text: "Sur l'écran de connexion, appuyez sur « Scanner un QR code »" },
                  { n: '3', icon: 'camera',        text: 'Pointez la caméra vers ce code' },
                  { n: '4', icon: 'zap',           text: 'Connexion automatique en 1 seconde' },
                ].map(step => (
                  <View key={step.n} style={[s.stepRow, { borderBottomColor: colors.divider }]}>
                    <View style={[s.stepNum, { backgroundColor: colors.primary + '18' }]}>
                      <Text style={[s.stepNumText, { color: colors.primary }]}>{step.n}</Text>
                    </View>
                    <Icon name={step.icon as any} size={15} color={colors.primary} style={{ marginRight: 10 }} />
                    <Text style={[s.stepText, { color: colors.textSecondary }]}>{step.text}</Text>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* Sécurité */}
            {phase === 'ready' && (
              <Animated.View entering={FadeInDown.delay(400)} style={[s.secBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Icon name="shield" size={14} color={colors.textTertiary} />
                <Text style={[s.secText, { color: colors.textTertiary }]}>
                  Ce code est à usage unique et expire automatiquement. Ne le partagez pas.
                </Text>
              </Animated.View>
            )}

          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%' },
  scroll:       { paddingHorizontal: 24, paddingBottom: 40 },
  header:       { alignItems: 'center', paddingTop: 12, paddingBottom: 8, position: 'relative' },
  handle:       { width: 40, height: 4, borderRadius: 2 },
  closeBtn:     { position: 'absolute', right: 4, top: 8, padding: 8 },

  title:        { fontSize: 21, fontWeight: '800', textAlign: 'center', marginBottom: 24, marginTop: 4 },

  qrZone:       { alignItems: 'center', minHeight: 280, justifyContent: 'center' },
  center:       { alignItems: 'center', gap: 16 },

  qrCard:       { alignItems: 'center', gap: 14 },
  qrWhiteBg:    {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },

  ttlBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  ttlText:      { fontSize: 13, fontWeight: '700' },
  tokenBox:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  tokenText:    { fontSize: 10, fontFamily: 'monospace', letterSpacing: 0.5 },

  bigCircle:    { borderRadius: 60, padding: 20, marginBottom: 4 },
  statusTitle:  { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  statusSub:    { fontSize: 13, textAlign: 'center', lineHeight: 19 },

  retryBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  retryText:    { color: '#fff', fontSize: 14, fontWeight: '700' },

  stepsWrap:    { marginTop: 28, gap: 0 },
  stepsTitle:   { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 14 },
  stepRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  stepNum:      { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  stepNumText:  { fontSize: 12, fontWeight: '800' },
  stepText:     { flex: 1, fontSize: 13, lineHeight: 18 },

  secBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 20, padding: 12, borderRadius: 12, borderWidth: 1 },
  secText:      { flex: 1, fontSize: 12, lineHeight: 18 },
});
