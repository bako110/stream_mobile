/**
 * PhoneOtpScreen — ecran universel Firebase Phone Auth OTP.
 *
 * Modes :
 *   'login'    — connexion / inscription par telephone
 *   'forgot'   — reinitialisation mot de passe par SMS
 *   'verify'   — lier un numero au compte existant (verification de profil)
 *
 * Flux :
 *   Step 1 : saisie du numero → Firebase envoie le SMS
 *   Step 2 : saisie du code 6 chiffres → Firebase valide → backend connecte
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo, Button, PhoneInput, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { phoneAuthService } from '../../services/phoneAuthService';

export type PhoneOtpMode = 'login' | 'forgot' | 'verify';

interface Props {
  mode:          PhoneOtpMode;
  onSuccess:     (result: { isNewUser?: boolean }) => void;
  onGoBack:      () => void;
  // Pour mode 'login', nom/prenom si nouveau compte
  firstName?:    string;
  lastName?:     string;
  referralCode?: string;
}

type Step = 'phone' | 'otp';

const OTP_LENGTH = 6;
const RESEND_DELAY = 60;

const MODE_LABELS: Record<PhoneOtpMode, { title: string; subtitle: string }> = {
  login:  { title: 'Connexion par SMS',       subtitle: 'Entrez votre numero pour recevoir un code de verification' },
  forgot: { title: 'Reinitialiser via SMS',   subtitle: 'Entrez votre numero pour recevoir un code de reinitialisation' },
  verify: { title: 'Verifier votre numero',   subtitle: 'Entrez votre numero de telephone pour le lier a votre compte' },
};

export const PhoneOtpScreen: React.FC<Props> = ({
  mode, onSuccess, onGoBack, firstName, lastName, referralCode,
}) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const [step,       setStep]       = useState<Step>('phone');
  const [country,    setCountry]    = useState<Country>(DEFAULT_COUNTRY);
  const [phone,      setPhone]      = useState('');
  const [otp,        setOtp]        = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [resendTimer,setResendTimer]= useState(0);

  const otpRef = useRef<TextInput>(null);
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

  /* ── Etape 1 : envoyer le SMS ─────────────────────────────────────────────── */
  const handleSendOtp = useCallback(async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) { setError('Numero de telephone invalide.'); return; }
    setError(''); setLoading(true);
    try {
      const e164 = `${country.dial}${digits}`;
      await phoneAuthService.sendOtp(e164);
      setStep('otp');
      startResendTimer();
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('TOO_SHORT') || msg.includes('INVALID_PHONE')) {
        setError('Numero de telephone invalide.');
      } else if (msg.includes('TOO_MANY_REQUESTS') || msg.includes('quota')) {
        setError('Trop de tentatives. Reessayez dans quelques minutes.');
      } else {
        setError('Impossible d\'envoyer le code SMS. Verifiez votre numero.');
      }
    } finally { setLoading(false); }
  }, [phone, country]);

  /* ── Etape 2 : confirmer le code OTP ────────────────────────────────────────── */
  const handleConfirmOtp = useCallback(async () => {
    if (otp.length !== OTP_LENGTH) { setError(`Le code fait ${OTP_LENGTH} chiffres.`); return; }
    setError(''); setLoading(true);
    try {
      await phoneAuthService.confirmOtp(otp);

      if (mode === 'verify') {
        await phoneAuthService.linkPhoneToAccount();
        await phoneAuthService.signOutFirebase();
        onSuccess({});
        return;
      }

      if (mode === 'forgot') {
        // Pour forgot : on se connecte avec Firebase, backend cree/retrouve le compte
        // Le mot de passe sera reinitialise dans l'ecran suivant
        const result = await phoneAuthService.verifyWithBackend({ firstName, lastName, referralCode });
        await phoneAuthService.signOutFirebase();
        onSuccess({ isNewUser: result.is_new_user });
        return;
      }

      // mode === 'login'
      const result = await phoneAuthService.verifyWithBackend({ firstName, lastName, referralCode });
      await phoneAuthService.signOutFirebase();
      onSuccess({ isNewUser: result.is_new_user });
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('invalid-verification-code') || msg.includes('INVALID_CODE')) {
        setError('Code incorrect. Verifiez le SMS et reessayez.');
      } else if (msg.includes('session-expired') || msg.includes('SESSION_EXPIRED')) {
        setError('Code expire. Demandez un nouveau code.');
        setStep('phone');
        setOtp('');
      } else {
        setError(e?.response?.data?.detail ?? msg ?? 'Une erreur est survenue.');
      }
    } finally { setLoading(false); }
  }, [otp, mode, firstName, lastName, referralCode, onSuccess]);

  const handleResend = useCallback(() => {
    if (resendTimer > 0) return;
    setOtp('');
    setError('');
    handleSendOtp();
  }, [resendTimer, handleSendOtp]);

  const { title, subtitle } = MODE_LABELS[mode];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={isDark ? ['#0a0a0a', '#111827'] : ['#f8fafc', '#e2e8f0']}
        style={{ flex: 1 }}
      >
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />

        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)} style={st.header}>
          <TouchableOpacity onPress={step === 'otp' ? () => { setStep('phone'); setOtp(''); setError(''); } : onGoBack} style={st.back}>
            <Icon name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <AppLogo size={40} />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[st.card, { backgroundColor: colors.card }]}>
          <Text style={[st.title, { color: colors.text }]}>{title}</Text>
          <Text style={[st.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>

          {step === 'phone' ? (
            <>
              <PhoneInput
                country={country}
                onCountryChange={setCountry}
                value={phone}
                onChangeText={setPhone}
                label="Numero de telephone"
                placeholder="XX XX XX XX"
              />

              {!!error && (
                <View style={[st.errorBox, { backgroundColor: colors.danger + '18' }]}>
                  <Icon name="alert-circle" size={14} color={colors.danger} />
                  <Text style={[st.errorTxt, { color: colors.danger }]}>{error}</Text>
                </View>
              )}

              <Button
                label="Recevoir le code SMS"
                onPress={handleSendOtp}
                loading={loading}
                style={{ marginTop: 8 }}
              />
            </>
          ) : (
            <>
              <Text style={[st.phoneLabel, { color: colors.textSecondary }]}>
                Code envoye au {country.dial} {phone}
              </Text>

              {/* Input OTP */}
              <View style={st.otpRow}>
                {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => otpRef.current?.focus()}
                    style={[
                      st.otpBox,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: otp.length === i
                          ? colors.primary
                          : otp.length > i
                            ? colors.primary + '60'
                            : colors.border,
                      },
                    ]}
                  >
                    <Text style={[st.otpChar, { color: colors.text }]}>
                      {otp[i] ?? ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Input cache pour le clavier */}
              <TextInput
                ref={otpRef}
                value={otp}
                onChangeText={v => {
                  const digits = v.replace(/\D/g, '').slice(0, OTP_LENGTH);
                  setOtp(digits);
                  setError('');
                }}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                style={st.hiddenInput}
                autoFocus
              />

              {!!error && (
                <View style={[st.errorBox, { backgroundColor: colors.danger + '18' }]}>
                  <Icon name="alert-circle" size={14} color={colors.danger} />
                  <Text style={[st.errorTxt, { color: colors.danger }]}>{error}</Text>
                </View>
              )}

              <Button
                label={loading ? 'Verification...' : 'Valider le code'}
                onPress={handleConfirmOtp}
                loading={loading}
                disabled={otp.length !== OTP_LENGTH}
                style={{ marginTop: 8 }}
              />

              {/* Renvoyer */}
              <TouchableOpacity
                onPress={handleResend}
                disabled={resendTimer > 0 || loading}
                style={st.resendBtn}
              >
                {loading ? null : (
                  <Text style={[st.resendTxt, { color: resendTimer > 0 ? colors.textSecondary : colors.primary }]}>
                    {resendTimer > 0
                      ? `Renvoyer dans ${resendTimer}s`
                      : 'Renvoyer le code'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const st = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8 },
  back:        { padding: 8 },
  card:        { margin: 20, borderRadius: 20, padding: 24, gap: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  title:       { fontSize: 22, fontWeight: '700' },
  subtitle:    { fontSize: 14, lineHeight: 20 },
  phoneLabel:  { fontSize: 13, textAlign: 'center' },
  otpRow:      { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 8 },
  otpBox:      { width: 44, height: 52, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  otpChar:     { fontSize: 22, fontWeight: '700' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  errorBox:    { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 8 },
  errorTxt:    { fontSize: 13, flex: 1 },
  resendBtn:   { alignItems: 'center', paddingVertical: 4 },
  resendTxt:   { fontSize: 14, fontWeight: '500' },
});
