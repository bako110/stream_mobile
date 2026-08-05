import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, StatusBar, TextInput, ActivityIndicator, Linking,
  Dimensions,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInUp,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Svg, { Path } from 'react-native-svg';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useTheme } from '../../hooks/useTheme';
import { Input, PhoneInput, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { authService, showConfirm } from '../../services';
import { PhoneOtpScreen } from './PhoneOtpScreen';

GoogleSignin.configure({
  webClientId: '633145914883-2ka459achh16hhlak6h3pk58bpcsm4t2.apps.googleusercontent.com',
  offlineAccess: false,
});

const { width: W, height: H } = Dimensions.get('window');
const HERO_H = H * 0.30;

const anim80  = FadeInDown.delay(80).springify();
const anim160 = FadeInDown.delay(160).duration(500);
const anim220 = FadeInDown.delay(220).duration(500);
const anim280 = FadeInDown.delay(280).springify();
const anim340 = FadeInDown.delay(340).duration(350);
const anim400 = FadeInDown.delay(400).springify();
const anim460 = FadeInDown.delay(460).duration(350);
const anim500 = FadeInDown.delay(500).springify();
const anim560 = FadeInUp.delay(560).duration(400);
const anim580 = FadeInUp.delay(580).duration(400);
const anim600 = FadeInUp.delay(600).duration(400);
const animErr = FadeInDown.duration(250);

type LoginMethod = 'email' | 'phone';

interface Props {
  onLoginSuccess:      (profileIncomplete?: boolean) => void;
  onNeedsVerification: (params: { userId: string; identifier: string; password: string }) => void;
  onGoRegister:        () => void;
  onGoForgotPassword?: () => void;
  onGoSocialLogin?:    () => void;
  onGoQRLogin?:        () => void;
  onGoCGU?:            () => void;
  onGoPrivacy?:        () => void;
  initialBlockedInfo?: { reason?: string; contact?: string; blockedAt?: string } | null;
}

// Vague SVG style screenshot — adaptée aux couleurs violet
const WaveBottom: React.FC<{ color: string }> = ({ color }) => (
  <Svg
    width={W}
    height={60}
    viewBox={`0 0 ${W} 60`}
    style={{ position: 'absolute', bottom: -1, left: 0 }}
    preserveAspectRatio="none"
  >
    <Path
      d={`M0,0 C${W * 0.25},55 ${W * 0.75},5 ${W},50 L${W},60 L0,60 Z`}
      fill={color}
    />
  </Svg>
);

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess, onNeedsVerification, onGoRegister, onGoForgotPassword, onGoSocialLogin, onGoQRLogin, onGoCGU, onGoPrivacy, initialBlockedInfo }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const passRef = useRef<TextInput>(null);
  const [method,      setMethod]      = useState<LoginMethod>('email');
  const [identifier,  setIdentifier]  = useState('');
  const [country,     setCountry]     = useState<Country>(DEFAULT_COUNTRY);
  const [password,    setPassword]    = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [blockedInfo,   setBlockedInfo]   = useState<{ reason?: string; contact?: string; blockedAt?: string } | null>(
    initialBlockedInfo ? { ...initialBlockedInfo, blockedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) } : null
  );

  const isEmail = method === 'email';

  const switchMethod = () => {
    setMethod(m => m === 'email' ? 'phone' : 'email');
    setIdentifier('');
    setError('');
  };

  const [socialLoading, setSocialLoading] = useState<'google' | null>(null);
  const [showPhoneOtp, setShowPhoneOtp] = useState(false);

  const handleGoogleLogin = useCallback(async () => {
    setSocialLoading('google');
    setError('');
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut();
      const userInfo = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const result = await authService.oauthGoogle(tokens.accessToken);
      onLoginSuccess(result.profile_incomplete);
    } catch (e: any) {
      if (e.code !== statusCodes.SIGN_IN_CANCELLED) {
        const detail = e?.data?.detail ?? e?.response?.data?.detail;
        if (e?.status === 403 && detail?.code === 'account_blocked') {
          setBlockedInfo({
            reason: detail?.reason ?? undefined,
            contact: detail?.contact ?? 'support@gofolyx.com',
            blockedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
          });
        } else if (e?.status === 403 && detail?.code === 'account_deactivated') {
          showConfirm(
            'Compte désactivé',
            'Votre compte est désactivé. Voulez-vous le réactiver et vous connecter ?',
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Réactiver',
                onPress: async () => {
                  setSocialLoading('google');
                  try {
                    const tokens = await GoogleSignin.getTokens();
                    const result = await authService.reactivateGoogle(tokens.accessToken);
                    onLoginSuccess(result.profile_incomplete);
                  } catch (err: any) {
                    setError(err?.message ?? 'Impossible de réactiver le compte.');
                  } finally {
                    setSocialLoading(null);
                  }
                },
              },
            ],
          );
        } else {
          setError(e?.message ?? 'Erreur Google Sign-In');
        }
      }
    } finally {
      setSocialLoading(null);
    }
  }, [onLoginSuccess]);

  const handleLogin = useCallback(async () => {
    if (!identifier.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const id = isEmail ? identifier.trim() : `${country.dial}${identifier.trim()}`;
      const result = await authService.login({ identifier: id, password });
      onLoginSuccess(result.profile_incomplete);
    } catch (e: any) {
      const detail = e?.data?.detail ?? e?.response?.data?.detail;
      if (e?.status === 403 && detail?.code === 'account_blocked') {
        setBlockedInfo({
          reason: detail?.reason ?? undefined,
          contact: detail?.contact ?? 'support@gofolyx.com',
          blockedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
      } else if (e?.status === 403 && detail?.code === 'account_deactivated') {
        showConfirm(
          'Compte désactivé',
          'Votre compte est désactivé. Voulez-vous le réactiver et vous connecter ?',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Réactiver',
              onPress: async () => {
                setLoading(true);
                try {
                  const id = isEmail ? identifier.trim() : `${country.dial}${identifier.trim()}`;
                  await authService.reactivate(id, password);
                  onLoginSuccess();
                } catch (err: any) {
                  setError(err?.message ?? 'Impossible de réactiver le compte.');
                } finally {
                  setLoading(false);
                }
              },
            },
          ],
        );
      } else if (e?.status === 403 && detail?.code === 'account_unverified') {
        const verifiedId = isEmail ? identifier.trim() : `${country.dial}${identifier.trim()}`;
        onNeedsVerification({ userId: detail.user_id, identifier: verifiedId, password });
      } else {
        setError(e?.message ?? 'Identifiants incorrects.');
      }
    } finally {
      setLoading(false);
    }
  }, [identifier, password, isEmail, country, onLoginSuccess]);

  if (showPhoneOtp) {
    return (
      <PhoneOtpScreen
        mode="login"
        onSuccess={() => { setShowPhoneOtp(false); onLoginSuccess(); }}
        onGoBack={() => setShowPhoneOtp(false)}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── HERO (vague violette) ── */}
      <View style={[styles.hero, { height: HERO_H }]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd, colors.primary + 'CC']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Cercles décoratifs flottants */}
        <View style={[styles.heroCircle1, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
        <View style={[styles.heroCircle2, { backgroundColor: 'rgba(255,255,255,0.07)' }]} />

        <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.heroContent}>
          <Text style={styles.heroTitle}>Se connecter</Text>
          <Text style={styles.heroSub}>Bon retour sur GoFolyX</Text>
        </Animated.View>

        {/* Vague de transition vers le bas */}
        <WaveBottom color={colors.background} />
      </View>

      {/* ── FORMULAIRE ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* QR Code */}
          <Animated.View entering={anim280}>
            <TouchableOpacity
              onPress={() => onGoQRLogin?.()}
              style={[styles.qrBtn, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '0C' }]}
              activeOpacity={0.75}
            >
              <View style={[styles.qrIconWrap, { backgroundColor: colors.primary + '18' }]}>
                <Icon name="maximize" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.qrBtnTitle, { color: colors.textPrimary }]}>Scanner un QR code</Text>
                <Text style={[styles.qrBtnSub, { color: colors.textSecondary }]}>Connexion depuis un autre appareil</Text>
              </View>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </TouchableOpacity>
          </Animated.View>

          {/* Séparateur */}
          <Animated.View entering={anim340} style={styles.sep}>
            <View style={[styles.line, { backgroundColor: colors.divider }]} />
            <Text style={[styles.orLabel, { color: colors.textTertiary }]}>ou</Text>
            <View style={[styles.line, { backgroundColor: colors.divider }]} />
          </Animated.View>

          {/* Champs */}
          <Animated.View entering={anim400}>
            {isEmail ? (
              <Input
                label="Email ou nom d'utilisateur"
                leftIcon="mail"
                value={identifier}
                onChangeText={t => { setIdentifier(t); setError(''); }}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => passRef.current?.focus()}
                rightElement={
                  <TouchableOpacity
                    onPress={switchMethod}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[styles.togglePill, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                  >
                    <Icon name="smartphone" size={12} color={colors.primary} />
                    <Text style={[styles.toggleText, { color: colors.primary }]}>Tel</Text>
                  </TouchableOpacity>
                }
              />
            ) : (
              <>
                <PhoneInput
                  value={identifier}
                  country={country}
                  onCountryChange={setCountry}
                  onChangeText={(digits) => { setIdentifier(digits); setError(''); }}
                  returnKeyType="next"
                  onSubmitEditing={() => passRef.current?.focus()}
                />
                <TouchableOpacity onPress={switchMethod} style={styles.switchLink}>
                  <Icon name="mail" size={13} color={colors.primary} />
                  <Text style={[styles.switchLinkText, { color: colors.primary }]}>Utiliser un email</Text>
                </TouchableOpacity>
              </>
            )}

            <Input
              ref={passRef}
              label="Mot de passe"
              leftIcon="lock"
              isPassword
              value={password}
              onChangeText={t => { setPassword(t); setError(''); }}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              containerStyle={{ marginTop: 14 }}
            />
          </Animated.View>

          {/* Compte bloqué */}
          {blockedInfo ? (
            <Animated.View entering={animErr}
              style={[styles.blockedBox, { backgroundColor: '#EF44441A', borderColor: '#EF444440' }]}>
              <Icon name="slash" size={20} color="#EF4444" style={{ marginBottom: 6 }} />
              <Text style={[styles.blockedTitle, { color: '#EF4444' }]}>Compte bloqué</Text>
              {blockedInfo.reason ? (
                <Text style={[styles.blockedReason, { color: colors.textSecondary }]}>
                  Raison : {blockedInfo.reason}
                </Text>
              ) : null}
              <Text style={[styles.blockedSub, { color: colors.textSecondary }]}>
                Votre compte a été bloqué par un administrateur.{'\n'}
                Contactez le support pour en savoir plus.
              </Text>
              {blockedInfo.blockedAt ? (
                <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 8 }}>
                  Bloqué le {blockedInfo.blockedAt}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => Linking.openURL(`mailto:${blockedInfo.contact ?? 'support@gofolyx.com'}`)}
                style={[styles.blockedContactBtn, { backgroundColor: '#EF444420', borderColor: '#EF444460' }]}
              >
                <Icon name="mail" size={13} color="#EF4444" />
                <Text style={[styles.blockedContactText, { color: '#EF4444' }]}>Contacter le support</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setBlockedInfo(null)} style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: colors.textTertiary }}>Retour</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Erreur */}
          {error ? (
            <Animated.Text entering={animErr}
              style={[styles.errorMsg, { color: colors.error, backgroundColor: colors.errorBg }]}>
              {error}
            </Animated.Text>
          ) : null}

          {/* Mot de passe oublié */}
          <Animated.View entering={anim460} style={styles.forgotRow}>
            <TouchableOpacity onPress={onGoForgotPassword} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.forgotText, { color: colors.primary }]}>Mot de passe oublié ?</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Bouton connexion — style screenshot : fond plein arrondi */}
          <Animated.View entering={anim500}>
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              style={{ marginTop: 8 }}
            >
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.submitBtn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>Se connecter</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Lien inscription */}
          <Animated.View entering={anim560} style={styles.registerRow}>
            <Text style={[styles.registerLabel, { color: colors.textSecondary }]}>
              Pas encore de compte ?{'  '}
            </Text>
            <TouchableOpacity onPress={onGoRegister} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.registerLink, { color: colors.primary }]}>S'inscrire</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* CGU */}
          {(onGoCGU || onGoPrivacy) && (
            <Animated.View entering={anim580} style={styles.cguRow}>
              <Text style={[styles.cguText, { color: colors.textTertiary }]}>En continuant, vous acceptez nos{' '}</Text>
              {onGoCGU && (
                <TouchableOpacity onPress={onGoCGU} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.cguLink, { color: colors.primary }]}>CGU</Text>
                </TouchableOpacity>
              )}
              {onGoCGU && onGoPrivacy && (
                <Text style={[styles.cguText, { color: colors.textTertiary }]}>{' '}et notre{' '}</Text>
              )}
              {onGoPrivacy && (
                <TouchableOpacity onPress={onGoPrivacy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.cguLink, { color: colors.primary }]}>Politique de confidentialité</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Google */}
          <Animated.View entering={anim600} style={styles.socialRow}>
            <View style={styles.socialDividerRow}>
              <View style={[styles.socialDivider, { backgroundColor: colors.divider }]} />
              <Text style={[styles.socialOrText, { color: colors.textTertiary }]}>ou continuer avec</Text>
              <View style={[styles.socialDivider, { backgroundColor: colors.divider }]} />
            </View>

            <View style={styles.socialBtns}>
              <TouchableOpacity
                style={[styles.socialBtn, { backgroundColor: colors.surface, borderColor: colors.divider }]}
                onPress={handleGoogleLogin}
                disabled={!!socialLoading}
                activeOpacity={0.75}
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator size={18} color="#DB4437" />
                ) : (
                  <Svg width={18} height={18} viewBox="0 0 48 48">
                    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    <Path fill="none" d="M0 0h48v48H0z"/>
                  </Svg>
                )}
                <Text style={[styles.socialBtnText, { color: colors.textPrimary }]}>Google</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },

  // Hero
  hero:         { width: '100%', overflow: 'visible' },
  heroCircle1:  { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -40, right: -40 },
  heroCircle2:  { position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: 20, left: -30 },
  heroContent:  { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 30 },
  heroTitle:    { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  heroSub:      { fontSize: 14, color: 'rgba(255,255,255,0.80)', marginTop: 6, fontWeight: '400' },

  // Form
  qrBtn:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1.2 },
  qrIconWrap:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  qrBtnTitle:   { fontSize: 13, fontWeight: '700' },
  qrBtnSub:     { fontSize: 11, marginTop: 1 },
  sep:          { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  line:         { flex: 1, height: 1 },
  orLabel:      { marginHorizontal: 14, fontSize: 13, fontWeight: '500' },
  togglePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  toggleText:   { fontSize: 11, fontWeight: '700' },
  switchLink:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  switchLinkText:{ fontSize: 13, fontWeight: '600' },

  errorMsg:     { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, fontSize: 13, fontWeight: '500' },
  forgotRow:    { alignItems: 'flex-end', marginTop: 12, marginBottom: 8 },
  forgotText:   { fontSize: 13, fontWeight: '600' },

  // Bouton submit style screenshot
  submitBtn:    { height: 52, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  submitBtnText:{ color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  registerRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  registerLabel:{ fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '700' },

  cguRow:       { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 14 },
  cguText:      { fontSize: 12 },
  cguLink:      { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },

  socialRow:        { marginTop: 20, gap: 14 },
  socialDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  socialDivider:    { flex: 1, height: 1 },
  socialOrText:     { fontSize: 12, fontWeight: '500' },
  socialBtns:       { flexDirection: 'row', gap: 12 },
  socialBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1 },
  socialBtnText:    { fontSize: 14, fontWeight: '700' },

  blockedBox:        { borderRadius: 16, borderWidth: 1, padding: 18, marginTop: 16, alignItems: 'center' },
  blockedTitle:      { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  blockedReason:     { fontSize: 13, marginBottom: 6, textAlign: 'center' },
  blockedSub:        { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  blockedContactBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  blockedContactText:{ fontSize: 13, fontWeight: '700' },
});
