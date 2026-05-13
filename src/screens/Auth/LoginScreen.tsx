import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, StatusBar, TextInput, ActivityIndicator, Linking,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInUp,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo, Button, Input, PhoneInput, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { authService } from '../../services';
import { QRScannerScreen } from './QRScannerScreen';

GoogleSignin.configure({
  webClientId: '679923149254-fj18oqdipsfinbqaksiikta9eql9d6kn.apps.googleusercontent.com',
  offlineAccess: false,
});

type LoginMethod = 'email' | 'phone';

interface Props {
  onLoginSuccess:      () => void;
  onGoRegister:        () => void;
  onGoForgotPassword?: () => void;
  onGoSocialLogin?:    () => void;
  onGoCGU?:            () => void;
  onGoPrivacy?:        () => void;
  initialBlockedInfo?: { reason?: string; contact?: string; blockedAt?: string } | null;
}

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess, onGoRegister, onGoForgotPassword, onGoSocialLogin, onGoCGU, onGoPrivacy, initialBlockedInfo }) => {
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
  const [showScanner,   setShowScanner]   = useState(false);

  const isEmail = method === 'email';

  const switchMethod = () => {
    setMethod(m => m === 'email' ? 'phone' : 'email');
    setIdentifier('');
    setError('');
  };

  const [socialLoading, setSocialLoading] = useState<'google' | null>(null);

  const handleGoogleLogin = useCallback(async () => {
    setSocialLoading('google');
    setError('');
    try {
      await GoogleSignin.hasPlayServices();
      // Force l'affichage du sélecteur de compte
      await GoogleSignin.signOut();
      const userInfo = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      await authService.oauthGoogle(tokens.accessToken);
      onLoginSuccess();
    } catch (e: any) {
      if (e.code !== statusCodes.SIGN_IN_CANCELLED) {
        const detail = e?.data?.detail ?? e?.response?.data?.detail;
        if (e?.status === 403 && detail?.code === 'account_blocked') {
          setBlockedInfo({
            reason: detail?.reason ?? undefined,
            contact: detail?.contact ?? 'support@folix.app',
            blockedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
          });
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
      await authService.login({ identifier: id, password });
      onLoginSuccess();
    } catch (e: any) {
      const detail = e?.data?.detail ?? e?.response?.data?.detail;
      if (e?.status === 403 && detail?.code === 'account_blocked') {
        setBlockedInfo({
          reason: detail?.reason ?? undefined,
          contact: detail?.contact ?? 'support@folix.app',
          blockedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
      } else if (e?.status === 403 && detail?.code === 'account_deactivated') {
        const { Alert } = require('react-native');
        Alert.alert(
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
      } else {
        setError(e?.message ?? 'Identifiants incorrects.');
      }
    } finally {
      setLoading(false);
    }
  }, [identifier, password, isEmail, country, onLoginSuccess]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Scanner QR plein écran */}
      {showScanner && (
        <QRScannerScreen
          onLoginSuccess={() => { setShowScanner(false); onLoginSuccess(); }}
          onClose={() => setShowScanner(false)}
        />
      )}

      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Orbe haut-droite */}
      <View style={styles.orbTR} pointerEvents="none">
        <LinearGradient
          colors={[colors.primary + '50', colors.gradientEnd + '28', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.logoWrap}>
            <AppLogo size="md" />
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(160).duration(500)}
            style={[styles.title, { color: colors.textPrimary }]}>
            Bon retour ! 👋
          </Animated.Text>

          <Animated.Text entering={FadeInDown.delay(220).duration(500)}
            style={[styles.subtitle, { color: colors.textSecondary }]}>
            Connectez-vous à votre compte FoliX
          </Animated.Text>

          {/* QR Code — connexion rapide */}
          <Animated.View entering={FadeInDown.delay(280).springify()}>
            <TouchableOpacity
              onPress={() => setShowScanner(true)}
              style={[styles.qrBtn, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '0C' }]}
              activeOpacity={0.75}
            >
              <View style={[styles.qrIconWrap, { backgroundColor: colors.primary + '18' }]}>
                <Icon name="maximize" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.qrBtnTitle, { color: colors.textPrimary }]}>Scanner un QR code</Text>
                <Text style={[styles.qrBtnSub, { color: colors.textSecondary }]}>Connectez-vous depuis un autre appareil</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </Animated.View>

          {/* Séparateur */}
          <Animated.View entering={FadeInDown.delay(340).duration(350)} style={styles.sep}>
            <View style={[styles.line, { backgroundColor: colors.divider }]} />
            <Text style={[styles.orLabel, { color: colors.textTertiary }]}>ou</Text>
            <View style={[styles.line, { backgroundColor: colors.divider }]} />
          </Animated.View>

          {/* Champs */}
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            {isEmail ? (
              <Input
                label="Adresse email ou nom d'utilisateur"
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
                    <Icon name="smartphone" size={13} color={colors.primary} />
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
                <TouchableOpacity
                  onPress={switchMethod}
                  style={styles.switchLink}
                >
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

          {/* Compte bloqué par un admin */}
          {blockedInfo ? (
            <Animated.View entering={FadeInDown.duration(250)}
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
                <Text style={[{ fontSize: 11, color: colors.textTertiary, marginBottom: 8 }]}>
                  Bloqué le {blockedInfo.blockedAt}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => Linking.openURL(`mailto:${blockedInfo.contact ?? 'support@folix.app'}`)}
                style={[styles.blockedContactBtn, { backgroundColor: '#EF444420', borderColor: '#EF444460' }]}
              >
                <Icon name="mail" size={13} color="#EF4444" />
                <Text style={[styles.blockedContactText, { color: '#EF4444' }]}>
                  Contacter le support
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setBlockedInfo(null)} style={{ marginTop: 8 }}>
                <Text style={[{ fontSize: 12, color: colors.textTertiary }]}>Retour</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Erreur */}
          {error ? (
            <Animated.Text entering={FadeInDown.duration(250)}
              style={[styles.errorMsg, { color: colors.error, backgroundColor: colors.errorBg }]}>
              {error}
            </Animated.Text>
          ) : null}

          {/* Mot de passe oublié */}
          <Animated.View entering={FadeInDown.delay(460).duration(350)} style={styles.forgotRow}>
            <TouchableOpacity onPress={onGoForgotPassword} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.forgotText, { color: colors.primary }]}>Mot de passe oublié ?</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Bouton connexion */}
          <Animated.View entering={FadeInDown.delay(500).springify()}>
            <Button
              label="Se connecter"
              onPress={handleLogin}
              loading={loading}
              size="lg"
              style={{ marginTop: 8 }}
            />
          </Animated.View>

          {/* Lien inscription */}
          <Animated.View entering={FadeInUp.delay(560).duration(400)} style={styles.registerRow}>
            <Text style={[styles.registerLabel, { color: colors.textSecondary }]}>
              Pas encore de compte ?{'  '}
            </Text>
            <TouchableOpacity onPress={onGoRegister} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.registerLink, { color: colors.primary }]}>S'inscrire</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* CGU & Politique */}
          {(onGoCGU || onGoPrivacy) && (
            <Animated.View entering={FadeInUp.delay(580).duration(400)} style={styles.cguRow}>
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

          {/* Boutons sociaux */}
          <Animated.View entering={FadeInUp.delay(600).duration(400)} style={styles.socialRow}>
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
                  <Text style={styles.googleIcon}>G</Text>
                )}
                <Text style={[styles.socialBtnText, { color: colors.textPrimary }]}>Google</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Orbe bas-gauche */}
      <View style={styles.orbBL} pointerEvents="none">
        <LinearGradient
          colors={['transparent', colors.accentOrange + '28', colors.gradientEnd + '30']}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root:          { flex: 1 },
  scroll:        { flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 40 },
  logoWrap:      { alignItems: 'center', marginBottom: 16 },
  title:         { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  subtitle:      { fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22, fontWeight: '400' },
  sep:           { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  line:          { flex: 1, height: 1 },
  orLabel:       { marginHorizontal: 14, fontSize: 13, fontWeight: '500' },
  errorMsg:      { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, fontSize: 13, fontWeight: '500' },
  forgotRow:     { alignItems: 'flex-end', marginTop: 12, marginBottom: 8 },
  forgotText:    { fontSize: 13, fontWeight: '600' },
  registerRow:   { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  registerLabel: { fontSize: 14 },
  registerLink:  { fontSize: 14, fontWeight: '700' },
  orbTR:       { position: 'absolute', top: -110, right: -90, width: 300, height: 300, borderRadius: 150, overflow: 'hidden' },
  orbBL:       { position: 'absolute', bottom: -90, left: -70, width: 260, height: 260, borderRadius: 130, overflow: 'hidden' },
  togglePill:    {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  toggleText:    { fontSize: 11, fontWeight: '700' },
  switchLink:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  switchLinkText:{ fontSize: 13, fontWeight: '600' },
  qrBtn:         {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 16, borderWidth: 1.2,
  },
  qrIconWrap:    { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qrBtnTitle:    { fontSize: 14, fontWeight: '700' },
  qrBtnSub:      { fontSize: 12, marginTop: 1 },
  socialRow:        { marginTop: 20, gap: 16 },
  socialDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  socialDivider:    { flex: 1, height: 1 },
  socialOrText:     { fontSize: 12, fontWeight: '500' },
  socialBtns:       { flexDirection: 'row', gap: 12 },
  socialBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1 },
  socialBtnText:    { fontSize: 14, fontWeight: '700' },
  googleIcon:       { fontSize: 16, fontWeight: '900', color: '#DB4437', fontFamily: 'serif' },
  cguRow:           { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 16 },
  cguText:          { fontSize: 12 },
  cguLink:          { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  blockedBox:       { borderRadius: 16, borderWidth: 1, padding: 18, marginTop: 16, alignItems: 'center' },
  blockedTitle:     { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  blockedReason:    { fontSize: 13, marginBottom: 6, textAlign: 'center' },
  blockedSub:       { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  blockedContactBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  blockedContactText:{ fontSize: 13, fontWeight: '700' },
});
