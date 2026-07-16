/**
 * PhoneOtpScreen — ecran universel Firebase Phone Auth OTP.
 *
 * Modes :
 *   'login'    — connexion / inscription par telephone
 *   'forgot'   — reinitialisation mot de passe par SMS (OTP → nouveau mdp)
 *   'verify'   — lier un numero au compte existant
 *
 * Flux forgot :
 *   1. Saisie numero → Firebase SMS
 *   2. Code OTP → Firebase valide → JWT obtenus
 *   3. Nouveau mot de passe → PUT /auth/me/reset-password
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
import { AppLogo, BackButton, Button, PhoneInput, Input, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { phoneAuthService } from '../../services/phoneAuthService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

export type PhoneOtpMode = 'login' | 'forgot' | 'verify';

interface Props {
  mode:          PhoneOtpMode;
  onSuccess:     (result: { isNewUser?: boolean }) => void;
  onGoBack:      () => void;
  firstName?:    string;
  lastName?:     string;
  referralCode?: string;
}

type Step = 'phone' | 'otp' | 'newpass' | 'done';

const OTP_LENGTH = 6;
const RESEND_DELAY = 60;

const MODE_LABELS: Record<PhoneOtpMode, { title: string; subtitle: string }> = {
  login:  { title: 'Connexion par SMS',     subtitle: 'Entrez votre numero pour recevoir un code de verification' },
  forgot: { title: 'Reinitialiser via SMS', subtitle: 'Entrez votre numero pour recevoir un code de reinitialisation' },
  verify: { title: 'Verifier votre numero', subtitle: 'Entrez votre numero de telephone pour le lier a votre compte' },
};

export const PhoneOtpScreen: React.FC<Props> = ({
  mode, onSuccess, onGoBack, firstName, lastName, referralCode,
}) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [step,        setStep]        = useState<Step>('phone');
  const [country,     setCountry]     = useState<Country>(DEFAULT_COUNTRY);
  const [phone,       setPhone]       = useState('');
  const [otp,         setOtp]         = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const otpRef     = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

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

  /* ── Etape 1 : envoyer le SMS ──────────────────────────────────────────────── */
  const handleSendOtp = useCallback(async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) { setError('Numéro de téléphone invalide.'); return; }
    setError(''); setLoading(true);
    try {
      const phoneE164 = `${country.dial}${digits}`;
      if (mode === 'forgot') {
        // Mode forgot : utilise le backend (pas de reCAPTCHA Firebase)
        await apiClient.post(Endpoints.auth.forgotPassword, { phone: phoneE164 });
      } else {
        // Mode login/verify : SDK Firebase natif
        await phoneAuthService.sendOtp(phoneE164);
      }
      setStep('otp');
      startResendTimer();
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Impossible d\'envoyer le SMS.');
    } finally { setLoading(false); }
  }, [phone, country, mode]);

  /* ── Etape 2 : confirmer le code OTP ──────────────────────────────────────── */
  const handleConfirmOtp = useCallback(async () => {
    if (otp.length !== OTP_LENGTH) { setError(`Le code fait ${OTP_LENGTH} chiffres.`); return; }
    setError(''); setLoading(true);
    try {
      if (mode === 'forgot') {
        // Mode forgot : vérifie le code via backend
        await apiClient.post(Endpoints.auth.verifyResetCode, { token: otp });
        setStep('newpass');
        return;
      }

      const result = await phoneAuthService.verifyOtp(otp, { firstName, lastName, referralCode });
      onSuccess({ isNewUser: result.is_new_user });
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Code incorrect ou expiré.');
    } finally { setLoading(false); }
  }, [otp, mode, firstName, lastName, referralCode, onSuccess]);

  /* ── Etape 3 (forgot) : nouveau mot de passe ──────────────────────────────── */
  const handleResetPassword = useCallback(async () => {
    if (newPass.length < 8) { setError('Minimum 8 caracteres.'); return; }
    if (newPass !== confirmPass) { setError('Les mots de passe ne correspondent pas.'); return; }
    setError(''); setLoading(true);
    try {
      await apiClient.post(Endpoints.auth.resetPassword, { token: otp, new_password: newPass });
      setStep('done');
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Une erreur est survenue.');
    } finally { setLoading(false); }
  }, [newPass, confirmPass]);

  const handleResend = useCallback(() => {
    if (resendTimer > 0) return;
    setOtp(''); setError('');
    handleSendOtp();
  }, [resendTimer, handleSendOtp]);

  const goBackStep = () => {
    if (step === 'otp')     { setStep('phone'); setOtp(''); setError(''); return; }
    if (step === 'newpass') { setStep('otp'); setNewPass(''); setConfirmPass(''); setError(''); return; }
    onGoBack();
  };

  const { title, subtitle } = MODE_LABELS[mode];

  /* ── Ecran "done" ─────────────────────────────────────────────────────────── */
  if (step === 'done') {
    return (
      <LinearGradient
        colors={isDark ? ['#0a0a0a', '#111827'] : ['#f8fafc', '#e2e8f0']}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
      >
        <Icon name="check-circle" size={64} color={colors.primary} />
        <Text style={[st.doneTitle, { color: colors.textPrimary }]}>Mot de passe mis a jour !</Text>
        <Text style={[st.doneSub, { color: colors.textSecondary }]}>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</Text>
        <Button label="Continuer" onPress={() => onSuccess({})} style={{ marginTop: 24, width: '100%' }} />
      </LinearGradient>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={isDark ? ['#0a0a0a', '#111827'] : ['#f8fafc', '#e2e8f0']}
        style={{ flex: 1 }}
      >
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)} style={[st.header, { paddingTop: insets.top + 8 }]}>
          <BackButton onPress={goBackStep} />
          <AppLogo size="sm" />
        </Animated.View>

        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[st.card, { backgroundColor: colors.surface }]}>

            {/* ── Etape : phone ─────────────────────────────────────────────── */}
            {step === 'phone' && (
              <>
                <Text style={[st.title, { color: colors.textPrimary }]}>{title}</Text>
                <Text style={[st.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>

                <PhoneInput
                  country={country}
                  onCountryChange={setCountry}
                  value={phone}
                  onChangeText={setPhone}
                  label="Numero de telephone"
                  placeholder="XX XX XX XX"
                />

                {!!error && <ErrorBox msg={error} color={colors.error} />}

                <Button label="Recevoir le code SMS" onPress={handleSendOtp} loading={loading} style={{ marginTop: 8 }} />

                <TouchableOpacity onPress={onGoBack} style={st.goBackBtn}>
                  <Icon name="arrow-left" size={15} color={colors.textSecondary} />
                  <Text style={[st.goBackTxt, { color: colors.textSecondary }]}>Retour a la connexion</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Etape : otp ───────────────────────────────────────────────── */}
            {step === 'otp' && (
              <>
                <Text style={[st.title, { color: colors.textPrimary }]}>
                  {mode === 'forgot' ? 'Code de reinitialisation' : 'Code de verification'}
                </Text>
                <Text style={[st.subtitle, { color: colors.textSecondary }]}>
                  Code envoye au {country.dial} {phone}
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

                {!!error && <ErrorBox msg={error} color={colors.error} />}

                <Button
                  label="Valider le code"
                  onPress={handleConfirmOtp}
                  loading={loading}
                  disabled={otp.length !== OTP_LENGTH}
                  style={{ marginTop: 8 }}
                />

                <TouchableOpacity onPress={handleResend} disabled={resendTimer > 0 || loading} style={st.resendBtn}>
                  <Text style={[st.resendTxt, { color: resendTimer > 0 ? colors.textSecondary : colors.primary }]}>
                    {resendTimer > 0 ? `Renvoyer dans ${resendTimer}s` : 'Renvoyer le code'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Etape : newpass (mode forgot uniquement) ──────────────────── */}
            {step === 'newpass' && (
              <>
                <View style={[st.iconCircle, { backgroundColor: colors.primary + '18' }]}>
                  <Icon name="lock" size={32} color={colors.primary} />
                </View>
                <Text style={[st.title, { color: colors.textPrimary }]}>Nouveau mot de passe</Text>
                <Text style={[st.subtitle, { color: colors.textSecondary }]}>
                  Choisissez un nouveau mot de passe securise (min. 8 caracteres).
                </Text>

                <Input
                  label="Nouveau mot de passe"
                  leftIcon="lock"
                  value={newPass}
                  onChangeText={v => { setNewPass(v); setError(''); }}
                  secureTextEntry={!showPass}
                  rightIcon={showPass ? 'eye-off' : 'eye'}
                  onRightIconPress={() => setShowPass(p => !p)}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  placeholder="••••••••"
                />

                <Input
                  ref={confirmRef}
                  label="Confirmer le mot de passe"
                  leftIcon="lock"
                  value={confirmPass}
                  onChangeText={v => { setConfirmPass(v); setError(''); }}
                  secureTextEntry={!showConfirm}
                  rightIcon={showConfirm ? 'eye-off' : 'eye'}
                  onRightIconPress={() => setShowConfirm(p => !p)}
                  returnKeyType="done"
                  onSubmitEditing={handleResetPassword}
                  placeholder="••••••••"
                />

                {!!error && <ErrorBox msg={error} color={colors.error} />}

                <Button
                  label="Enregistrer le mot de passe"
                  onPress={handleResetPassword}
                  loading={loading}
                  disabled={newPass.length < 8 || newPass !== confirmPass}
                  style={{ marginTop: 8 }}
                />
              </>
            )}

          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const ErrorBox: React.FC<{ msg: string; color: string }> = ({ msg, color }) => (
  <View style={[st.errorBox, { backgroundColor: color + '18' }]}>
    <Icon name="alert-circle" size={14} color={color} />
    <Text style={[st.errorTxt, { color }]}>{msg}</Text>
  </View>
);

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
  goBackBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginTop: 4 },
  goBackTxt:  { fontSize: 14 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  doneTitle:  { fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 24 },
  doneSub:    { fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
