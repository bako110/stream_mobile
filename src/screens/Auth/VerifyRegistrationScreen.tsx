/**
 * VerifyRegistrationScreen — vérification obligatoire du compte après
 * inscription (email ou téléphone), affiché quand le backend renvoie
 * account_unverified. Saisie du code à 6 chiffres envoyé par email
 * (Brevo) ou SMS (Twilio), puis connexion automatique.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo, BackButton, Button } from '../../components/common';
import { authService } from '../../services';

interface Props {
  userId:      string;
  identifier:  string;
  password:    string;
  onSuccess:   () => void;
  onGoBack:    () => void;
}

const OTP_LENGTH = 6;
const RESEND_DELAY = 60;

export const VerifyRegistrationScreen: React.FC<Props> = ({
  userId, identifier, password, onSuccess, onGoBack,
}) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [otp,         setOtp]         = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const otpRef   = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startResendTimer = () => {
    setResendTimer(RESEND_DELAY);
    timerRef.current = setInterval(() => {
      setResendTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const handleVerify = useCallback(async () => {
    if (otp.length !== OTP_LENGTH) { setError(`Le code fait ${OTP_LENGTH} chiffres.`); return; }
    setError(''); setLoading(true);
    try {
      await authService.verifyRegistration(userId, otp);
      // Compte vérifié — connexion avec l'identifiant/mot de passe fournis à l'inscription
      await authService.login({ identifier, password });
      onSuccess();
    } catch (e: any) {
      const detail = e?.data?.detail ?? e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : e?.message ?? 'Code incorrect ou expiré.');
    } finally { setLoading(false); }
  }, [otp, userId, identifier, password, onSuccess]);

  const handleResend = useCallback(async () => {
    if (resendTimer > 0) return;
    setError(''); setLoading(true);
    try {
      await authService.resendVerificationCode(userId);
      setOtp('');
      startResendTimer();
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (e: any) {
      const detail = e?.data?.detail ?? e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : e?.message ?? 'Erreur lors du renvoi du code.');
    } finally { setLoading(false); }
  }, [resendTimer, userId]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={isDark ? ['#0a0a0a', '#111827'] : ['#f8fafc', '#e2e8f0']}
        style={{ flex: 1 }}
      >
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

        <Animated.View entering={FadeInDown.duration(400)} style={[st.header, { paddingTop: insets.top + 8 }]}>
          <BackButton onPress={onGoBack} />
          <AppLogo size="sm" />
        </Animated.View>

        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[st.card, { backgroundColor: colors.surface }]}>
            <Text style={[st.title, { color: colors.textPrimary }]}>Vérifiez votre compte</Text>
            <Text style={[st.subtitle, { color: colors.textSecondary }]}>
              Un code à 6 chiffres a été envoyé à {identifier}. Il expire après 15 minutes.
            </Text>

            <View style={st.otpRow}>
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => otpRef.current?.focus()}
                  style={[
                    st.otpBox,
                    {
                      backgroundColor: colors.backgroundSecondary,
                      borderColor: otp.length === i
                        ? colors.primary
                        : otp.length > i ? colors.primary + '60' : colors.border,
                    },
                  ]}
                >
                  <Text style={[st.otpChar, { color: colors.textPrimary }]}>{otp[i] ?? ''}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              ref={otpRef}
              value={otp}
              onChangeText={v => { setOtp(v.replace(/\D/g, '').slice(0, OTP_LENGTH)); setError(''); }}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              style={st.hiddenInput}
              autoFocus
            />

            {!!error && (
              <View style={[st.errorBox, { backgroundColor: colors.error + '18' }]}>
                <Icon name="alert-circle" size={14} color={colors.error} />
                <Text style={[st.errorTxt, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            <Button
              label="Vérifier le code"
              onPress={handleVerify}
              loading={loading}
              disabled={otp.length !== OTP_LENGTH}
              style={{ marginTop: 8 }}
            />

            <TouchableOpacity onPress={handleResend} disabled={resendTimer > 0 || loading} style={st.resendBtn}>
              <Text style={[st.resendTxt, { color: resendTimer > 0 ? colors.textSecondary : colors.primary }]}>
                {resendTimer > 0 ? `Renvoyer dans ${resendTimer}s` : 'Renvoyer le code'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const st = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  card:       { margin: 20, borderRadius: 20, padding: 24, gap: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  title:      { fontSize: 22, fontWeight: '700' },
  subtitle:   { fontSize: 14, lineHeight: 20 },
  otpRow:     { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 8 },
  otpBox:     { width: 44, height: 52, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  otpChar:    { fontSize: 22, fontWeight: '700' },
  hiddenInput:{ position: 'absolute', opacity: 0, width: 1, height: 1 },
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 8 },
  errorTxt:   { fontSize: 13, flex: 1 },
  resendBtn:  { alignItems: 'center', paddingVertical: 4 },
  resendTxt:  { fontSize: 14, fontWeight: '500' },
});
