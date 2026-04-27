import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, StatusBar, TextInput,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInUp,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo, Button, Input, PhoneInput, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { authService } from '../../services';
import { QRScannerScreen } from './QRScannerScreen';

type LoginMethod = 'email' | 'phone';

interface Props {
  onLoginSuccess:      () => void;
  onGoRegister:        () => void;
  onGoForgotPassword?: () => void;
  onGoSocialLogin?:    () => void;
}

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess, onGoRegister, onGoForgotPassword, onGoSocialLogin }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const passRef = useRef<TextInput>(null);
  const [method,      setMethod]      = useState<LoginMethod>('email');
  const [identifier,  setIdentifier]  = useState('');
  const [country,     setCountry]     = useState<Country>(DEFAULT_COUNTRY);
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const isEmail = method === 'email';

  const switchMethod = () => {
    setMethod(m => m === 'email' ? 'phone' : 'email');
    setIdentifier('');
    setError('');
  };

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
      setError(e?.message ?? 'Identifiants incorrects.');
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

          {/* Lien réseaux sociaux */}
          <Animated.View entering={FadeInUp.delay(620).duration(400)} style={styles.socialRow}>
            <View style={[styles.socialDivider, { backgroundColor: colors.divider }]} />
            <TouchableOpacity
              onPress={onGoSocialLogin}
              style={styles.socialLink}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="share-2" size={13} color={colors.textTertiary} />
              <Text style={[styles.socialLinkText, { color: colors.textTertiary }]}>
                Continuer avec un réseau social
              </Text>
              <Icon name="chevron-right" size={13} color={colors.textTertiary} />
            </TouchableOpacity>
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
  socialRow:     { alignItems: 'center', marginTop: 16, gap: 10 },
  socialDivider: { height: 1, width: '100%' },
  socialLink:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  socialLinkText:{ fontSize: 13, fontWeight: '500' },
});
