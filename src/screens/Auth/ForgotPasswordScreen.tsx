import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView,
  Platform, TouchableOpacity, StatusBar, ScrollView, TextInput,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo, Button, Input, PhoneInput, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { authService } from '../../services';

type Method = 'email' | 'phone' | 'username';
type Step   = 'input' | 'code' | 'newpass' | 'done';

interface Props { onGoBack: () => void; }

const METHODS: { key: Method; label: string; icon: string }[] = [
  { key: 'email',    label: 'Email',       icon: 'mail' },
  { key: 'phone',    label: 'Téléphone',   icon: 'smartphone' },
  { key: 'username', label: 'Identifiant', icon: 'at-sign' },
];

export const ForgotPasswordScreen: React.FC<Props> = ({ onGoBack }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const [step,        setStep]        = useState<Step>('input');
  const [method,      setMethod]      = useState<Method>('email');
  const [value,       setValue]       = useState('');
  const [country,     setCountry]     = useState<Country>(DEFAULT_COUNTRY);
  const [code,        setCode]        = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const newPassRef    = useRef<TextInput>(null);
  const confirmRef    = useRef<TextInput>(null);

  const switchMethod = (m: Method) => { setMethod(m); setValue(''); setError(''); };

  /* ── Étape 1 : demande de reset ──────────────────────────────────────────── */
  const handleRequestReset = useCallback(async () => {
    if (!value.trim()) { setError('Ce champ est obligatoire.'); return; }
    if (method === 'email' && !value.includes('@')) { setError('Adresse email invalide.'); return; }
    setError(''); setLoading(true);
    try {
      const payload =
        method === 'email'    ? { email: value.trim().toLowerCase() } :
        method === 'phone'    ? { phone: `${country.dial}${value.trim()}` } :
                                { username: value.trim() };
      await authService.forgotPassword(payload);
      setStep('code');
    } catch {
      setStep('code'); // toujours avancer même si erreur (sécurité)
    } finally { setLoading(false); }
  }, [value, method, country]);

  /* ── Étape 2 : saisie du code ────────────────────────────────────────────── */
  const handleVerifyCode = useCallback(() => {
    if (code.trim().length < 6) { setError('Le code doit faire au moins 6 caractères.'); return; }
    setError('');
    setStep('newpass');
  }, [code]);

  /* ── Étape 3 : nouveau mot de passe ─────────────────────────────────────── */
  const handleResetPassword = useCallback(async () => {
    if (newPass.length < 8) { setError('Minimum 8 caractères.'); return; }
    if (newPass !== confirmPass) { setError('Les mots de passe ne correspondent pas.'); return; }
    setError(''); setLoading(true);
    try {
      await authService.resetPassword(code.trim(), newPass);
      setStep('done');
    } catch (e: any) {
      setError(e?.message ?? 'Code invalide ou expiré.');
    } finally { setLoading(false); }
  }, [code, newPass, confirmPass]);

  /* ── UI ──────────────────────────────────────────────────────────────────── */

  const renderHeader = () => (
    <Animated.View entering={FadeInDown.delay(40).springify()} style={s.header}>
      <TouchableOpacity onPress={step === 'input' ? onGoBack : () => { setStep(step === 'code' ? 'input' : step === 'newpass' ? 'code' : 'input'); setError(''); }}
        style={[s.backBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <Icon name="arrow-left" size={18} color={colors.textPrimary} />
      </TouchableOpacity>
      <AppLogo size="sm" style={{ flex: 0 }} />
      <View style={{ width: 40 }} />
    </Animated.View>
  );

  /* Étape saisie identifiant */
  if (step === 'input') return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <Orb top colors={[colors.primary + '40', colors.gradientEnd + '25', 'transparent']} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {renderHeader()}

          <Animated.View entering={FadeInDown.delay(80).springify()} style={[s.iconCircle, { overflow: 'hidden' }]}>
            <LinearGradient colors={[colors.gradientStart + '30', colors.gradientEnd + '18']} style={StyleSheet.absoluteFill} />
            <Icon name="lock" size={34} color={colors.primary} />
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(130).duration(400)} style={[s.title, { color: colors.textPrimary }]}>
            Mot de passe oublié ?
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(175).duration(400)} style={[s.subtitle, { color: colors.textSecondary }]}>
            Choisissez comment récupérer votre compte
          </Animated.Text>

          {/* Sélecteur méthode */}
          <Animated.View entering={FadeInDown.delay(220).springify()} style={[s.methodBar, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            {METHODS.map(m => {
              const active = method === m.key;
              return (
                <TouchableOpacity key={m.key} onPress={() => switchMethod(m.key)}
                  style={[s.methodTab, active && { backgroundColor: colors.primary }]} activeOpacity={0.75}>
                  <Icon name={m.icon as any} size={13} color={active ? '#fff' : colors.textTertiary} />
                  <Text style={[s.methodLabel, { color: active ? '#fff' : colors.textTertiary }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          <Animated.View entering={FadeIn.duration(220)} key={method}>
            {method === 'email' && (
              <Input label="Adresse email" leftIcon="mail" value={value}
                onChangeText={v => { setValue(v); setError(''); }} error={error}
                keyboardType="email-address" autoCapitalize="none"
                returnKeyType="done" onSubmitEditing={handleRequestReset} placeholder="exemple@mail.com" />
            )}
            {method === 'phone' && (
              <>
                <PhoneInput value={value} country={country} onCountryChange={setCountry}
                  onChangeText={v => { setValue(v); setError(''); }}
                  returnKeyType="done" onSubmitEditing={handleRequestReset} />
                {!!error && <Text style={[s.errorBubble, { color: colors.error, backgroundColor: colors.errorBg }]}>{error}</Text>}
              </>
            )}
            {method === 'username' && (
              <Input label="Nom d'utilisateur" leftIcon="at-sign" value={value}
                onChangeText={v => { setValue(v); setError(''); }} error={error}
                autoCapitalize="none" returnKeyType="done" onSubmitEditing={handleRequestReset} placeholder="@identifiant" />
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).duration(350)} style={[s.infoBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Icon name="info" size={13} color={colors.textTertiary} />
            <Text style={[s.infoText, { color: colors.textTertiary }]}>
              {method === 'email'    ? 'Un code de réinitialisation sera envoyé à votre adresse email.'
               : method === 'phone' ? 'Un SMS avec un code sera envoyé à ce numéro.'
               :                     'Nous rechercherons le compte lié à cet identifiant et enverrons le code à l\'email associé.'}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(360).springify()} style={{ marginTop: 20 }}>
            <Button label={method === 'phone' ? 'Envoyer le SMS' : 'Envoyer le code'}
              onPress={handleRequestReset} loading={loading} size="lg" />
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(400).duration(350)} style={s.backRow}>
            <TouchableOpacity onPress={onGoBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[s.backText, { color: colors.primary }]}>← Retour à la connexion</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Orb bottom colors={['transparent', colors.accentOrange + '22', colors.gradientEnd + '25']} />
    </View>
  );

  /* Étape saisie du code */
  if (step === 'code') return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <Orb top colors={[colors.primary + '35', colors.gradientEnd + '20', 'transparent']} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {renderHeader()}

          <Animated.View entering={FadeInDown.delay(60).springify()} style={[s.iconCircle, { overflow: 'hidden' }]}>
            <LinearGradient colors={[colors.primary + '28', colors.gradientEnd + '18']} style={StyleSheet.absoluteFill} />
            <Icon name={method === 'phone' ? 'message-circle' : 'mail'} size={34} color={colors.primary} />
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(100).duration(400)} style={[s.title, { color: colors.textPrimary }]}>
            Entrez le code
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(150).duration(400)} style={[s.subtitle, { color: colors.textSecondary }]}>
            {method === 'phone'
              ? `Code envoyé au ${country.dial} ${value}`
              : `Code envoyé à ${value || 'votre adresse'}`}
          </Animated.Text>

          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Input label="Code de vérification" leftIcon="key" value={code}
              onChangeText={v => { setCode(v); setError(''); }} error={error}
              keyboardType="default" autoCapitalize="characters"
              returnKeyType="done" onSubmitEditing={handleVerifyCode}
              placeholder="Entrez le code reçu" />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(260).springify()} style={{ marginTop: 24 }}>
            <Button label="Continuer" onPress={handleVerifyCode} size="lg" />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(310).duration(350)} style={[s.infoBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, marginTop: 16 }]}>
            <Icon name="clock" size={13} color={colors.textTertiary} />
            <Text style={[s.infoText, { color: colors.textTertiary }]}>
              Le code est valide 15 minutes. Pensez à vérifier vos spams.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(360).duration(350)} style={s.backRow}>
            <TouchableOpacity onPress={() => { setStep('input'); setCode(''); setError(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[s.backText, { color: colors.primary }]}>Renvoyer le code</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Orb bottom colors={['transparent', colors.accentOrange + '22', colors.gradientEnd + '25']} />
    </View>
  );

  /* Étape nouveau mot de passe */
  if (step === 'newpass') return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <Orb top colors={[colors.primary + '35', colors.gradientEnd + '20', 'transparent']} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {renderHeader()}

          <Animated.View entering={FadeInDown.delay(60).springify()} style={[s.iconCircle, { overflow: 'hidden' }]}>
            <LinearGradient colors={[colors.gradientStart + '30', colors.gradientEnd + '18']} style={StyleSheet.absoluteFill} />
            <Icon name="shield" size={34} color={colors.primary} />
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(100).duration(400)} style={[s.title, { color: colors.textPrimary }]}>
            Nouveau mot de passe
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(150).duration(400)} style={[s.subtitle, { color: colors.textSecondary }]}>
            Choisissez un mot de passe fort (8 caractères minimum)
          </Animated.Text>

          <Animated.View entering={FadeInDown.delay(200).springify()} style={{ gap: 14 }}>
            <Input ref={newPassRef} label="Nouveau mot de passe" leftIcon="lock" isPassword
              value={newPass} onChangeText={v => { setNewPass(v); setError(''); }}
              returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} />
            <Input ref={confirmRef} label="Confirmer le mot de passe" leftIcon="lock" isPassword
              value={confirmPass} onChangeText={v => { setConfirmPass(v); setError(''); }}
              error={error} returnKeyType="done" onSubmitEditing={handleResetPassword} />
          </Animated.View>

          {/* Indicateur force */}
          {newPass.length > 0 && (
            <Animated.View entering={FadeIn.duration(200)} style={[s.strengthBar, { marginTop: 8 }]}>
              {[...Array(4)].map((_, i) => {
                const strength = newPass.length >= 12 ? 4 : newPass.length >= 10 ? 3 : newPass.length >= 8 ? 2 : 1;
                const active = i < strength;
                const barColor = strength === 1 ? colors.error : strength === 2 ? '#F5A623' : strength === 3 ? '#9B65F5' : colors.accentGreen;
                return <View key={i} style={[s.strengthSegment, { backgroundColor: active ? barColor : colors.border }]} />;
              })}
              <Text style={[s.strengthLabel, { color: colors.textTertiary }]}>
                {newPass.length >= 12 ? 'Fort' : newPass.length >= 10 ? 'Bon' : newPass.length >= 8 ? 'Acceptable' : 'Faible'}
              </Text>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(280).springify()} style={{ marginTop: 24 }}>
            <Button label="Réinitialiser le mot de passe" onPress={handleResetPassword} loading={loading} size="lg" />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Orb bottom colors={['transparent', colors.accentOrange + '22', colors.gradientEnd + '25']} />
    </View>
  );

  /* Étape succès */
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <Orb top colors={[colors.accentGreen + '30', colors.primary + '20', 'transparent']} />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Animated.View entering={FadeInDown.delay(60).springify()} style={[s.iconCircle, { overflow: 'hidden', width: 110, height: 110, borderRadius: 55 }]}>
          <LinearGradient colors={[colors.accentGreen + '30', colors.primary + '18']} style={StyleSheet.absoluteFill} />
          <Icon name="check-circle" size={48} color={colors.accentGreen} />
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(120).duration(400)} style={[s.title, { color: colors.textPrimary }]}>
          Mot de passe modifié !
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(170).duration(400)} style={[s.subtitle, { color: colors.textSecondary, marginBottom: 40 }]}>
          Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(240).springify()} style={{ width: '100%' }}>
          <Button label="Se connecter" onPress={onGoBack} size="lg" />
        </Animated.View>
      </View>
      <Orb bottom colors={['transparent', colors.accentOrange + '22', colors.gradientEnd + '25']} />
    </View>
  );
};

/* ── Composant orbe décoratif ──────────────────────────────────────────────── */
const Orb: React.FC<{ top?: boolean; bottom?: boolean; colors: string[] }> = ({ top, bottom, colors: gradColors }) => (
  <View style={[
    top    ? orb.top    : orb.bottom,
  ]} pointerEvents="none">
    <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
  </View>
);

const orb = StyleSheet.create({
  top:    { position: 'absolute', top: -90, right: -70, width: 260, height: 260, borderRadius: 130, overflow: 'hidden' },
  bottom: { position: 'absolute', bottom: -80, left: -60, width: 240, height: 240, borderRadius: 120, overflow: 'hidden' },
});

const s = StyleSheet.create({
  root:       { flex: 1 },
  scroll:     { flexGrow: 1, paddingHorizontal: 24, paddingTop: 52, paddingBottom: 40 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  backBtn:    { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  iconCircle: { alignSelf: 'center', width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title:      { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle:   { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 24, color: '#888' },

  methodBar:  { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, marginBottom: 20, gap: 4 },
  methodTab:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  methodLabel:{ fontSize: 12, fontWeight: '700' },

  errorBubble:{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8, fontSize: 13 },

  infoBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoText:   { flex: 1, fontSize: 12, lineHeight: 18 },

  backRow:    { alignItems: 'center', marginTop: 24 },
  backText:   { fontSize: 14, fontWeight: '600' },

  strengthBar:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel:   { fontSize: 12, fontWeight: '600', width: 70, textAlign: 'right' },
});
