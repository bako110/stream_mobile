import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView,
  Platform, TouchableOpacity, StatusBar, ScrollView, TextInput,
  ActivityIndicator, Dimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { Input, PhoneInput, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { authService } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

const { width: W, height: H } = Dimensions.get('window');
const HERO_H = H * 0.26;

type Method = 'email' | 'phone' | 'username';
type Step   = 'input' | 'code' | 'newpass' | 'done';

interface Props { onGoBack: () => void; }

const METHODS: { key: Method; label: string; icon: string }[] = [
  { key: 'email',    label: 'Email',       icon: 'mail' },
  { key: 'phone',    label: 'Téléphone',   icon: 'smartphone' },
  { key: 'username', label: 'Identifiant', icon: 'at-sign' },
];

// ── Vague SVG identique à Login/Register ─────────────────────────────────────
const WaveBottom: React.FC<{ color: string }> = ({ color }) => (
  <Svg
    width={W} height={60}
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

// ── Hero réutilisable ─────────────────────────────────────────────────────────
const Hero: React.FC<{
  title: string; subtitle: string; icon: string;
  colors: any; bgColor: string;
  onBack: () => void;
}> = ({ title, subtitle, icon, colors, bgColor, onBack }) => (
  <View style={[hero.wrap, { height: HERO_H }]}>
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd, colors.primary + 'CC']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <View style={[hero.circle1, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
    <View style={[hero.circle2, { backgroundColor: 'rgba(255,255,255,0.07)' }]} />

    <TouchableOpacity onPress={onBack} style={hero.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Icon name="arrow-left" size={22} color="#fff" />
    </TouchableOpacity>

    <Animated.View entering={FadeInDown.delay(80).springify()} style={hero.content}>
      <View style={hero.iconCircle}>
        <Icon name={icon} size={28} color="#fff" />
      </View>
      <Text style={hero.title}>{title}</Text>
      <Text style={hero.subtitle}>{subtitle}</Text>
    </Animated.View>

    <WaveBottom color={bgColor} />
  </View>
);

const hero = StyleSheet.create({
  wrap:      { width: '100%', overflow: 'visible' },
  circle1:   { position: 'absolute', width: 160, height: 160, borderRadius: 80, top: -30, right: -30 },
  circle2:   { position: 'absolute', width: 100, height: 100, borderRadius: 50, bottom: 20, left: -20 },
  backBtn:   { position: 'absolute', top: 52, left: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  content:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 28, paddingTop: 52, gap: 6 },
  iconCircle:{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title:     { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  subtitle:  { fontSize: 13, color: 'rgba(255,255,255,0.80)', fontWeight: '400', textAlign: 'center', paddingHorizontal: 24 },
});

// ── Bouton submit style hero ──────────────────────────────────────────────────
const SubmitBtn: React.FC<{ label: string; onPress: () => void; loading?: boolean; colors: any }> = ({ label, onPress, loading, colors }) => (
  <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.85}>
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={[s.submitBtn, { opacity: loading ? 0.7 : 1 }]}
    >
      {loading
        ? <ActivityIndicator color="#fff" />
        : <Text style={s.submitBtnText}>{label}</Text>
      }
    </LinearGradient>
  </TouchableOpacity>
);

// ── Écran principal ───────────────────────────────────────────────────────────
export const ForgotPasswordScreen: React.FC<Props> = ({ onGoBack }) => {
  const { theme } = useTheme();
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
  const newPassRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const switchMethod = (m: Method) => { setMethod(m); setValue(''); setError(''); };

  const goBackStep = () => {
    if (step === 'code')    { setStep('input'); setCode(''); setError(''); }
    else if (step === 'newpass') { setStep('code'); setError(''); }
    else onGoBack();
  };

  /* ── Étape 1 ─────────────────────────────────────────────────────────────── */
  const handleRequestReset = useCallback(async () => {
    if (!value.trim()) { setError('Ce champ est obligatoire.'); return; }
    if (method === 'email' && !value.includes('@')) { setError('Adresse email invalide.'); return; }
    setError(''); setLoading(true);
    try {
      if (method === 'phone') {
        const e164 = `${country.dial}${value.trim().replace(/\D/g, '')}`;
        await authService.forgotPassword({ phone: e164 });
        setStep('code');
      } else {
        const payload =
          method === 'email' ? { email: value.trim().toLowerCase() } :
                               { username: value.trim() };
        await authService.forgotPassword(payload);
        setStep('code');
      }
    } catch (e: any) {
      if (method === 'phone') {
        const msg: string = e?.message ?? e?.code ?? '';
        if (msg.includes('TOO_MANY_REQUESTS') || msg.includes('quota') || msg.includes('too-many-requests')) {
          setError('Trop de tentatives. Réessayez dans quelques minutes.');
        } else if (msg.includes('invalid-phone-number') || msg.includes('INVALID_PHONE_NUMBER')) {
          setError('Numéro de téléphone invalide.');
        } else if (msg.includes('operation-not-allowed')) {
          setError('Connexion par SMS non activée. Contactez le support.');
        } else {
          setError(`Erreur : ${msg || 'Impossible d\'envoyer le SMS.'}`);
        }
      } else {
        setStep('code'); // anti-enumeration
      }
    } finally { setLoading(false); }
  }, [value, method, country]);

  /* ── Étape 2 ─────────────────────────────────────────────────────────────── */
  const handleVerifyCode = useCallback(async () => {
    if (code.trim().length < 6) { setError('Le code doit faire au moins 6 caractères.'); return; }
    setError(''); setLoading(true);
    try {
      await apiClient.post(Endpoints.auth.verifyResetCode, { token: code.trim() });
      setStep('newpass');
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Code incorrect ou expiré.');
    } finally { setLoading(false); }
  }, [code]);

  /* ── Étape 3 ─────────────────────────────────────────────────────────────── */
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

  /* ── Rendu : Étape 1 ─────────────────────────────────────────────────────── */
  if (step === 'input') return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Hero
        title="Mot de passe oublié ?"
        subtitle="Choisissez comment récupérer votre compte"
        icon="lock"
        colors={colors}
        bgColor={colors.background}
        onBack={goBackStep}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Sélecteur méthode */}
          <Animated.View entering={FadeInDown.delay(100).springify()}
            style={[s.methodBar, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
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
                returnKeyType="done" onSubmitEditing={handleRequestReset}
                placeholder="exemple@mail.com" />
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
                autoCapitalize="none" returnKeyType="done" onSubmitEditing={handleRequestReset}
                placeholder="@identifiant" />
            )}
          </Animated.View>

          {/* Info box */}
          <Animated.View entering={FadeInDown.delay(200).duration(350)}
            style={[s.infoBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Icon name="info" size={13} color={colors.textTertiary} />
            <Text style={[s.infoText, { color: colors.textTertiary }]}>
              {method === 'email'    ? 'Un code de réinitialisation sera envoyé à votre adresse email.'
               : method === 'phone' ? 'Un SMS avec un code sera envoyé à ce numéro.'
               :                     "Nous rechercherons le compte lié à cet identifiant et enverrons un code à l'email associé."}
            </Text>
          </Animated.View>

          {/* Erreur non-phone */}
          {!!error && method !== 'phone' && (
            <Text style={[s.errorBubble, { color: colors.error, backgroundColor: colors.errorBg, marginTop: 8 }]}>{error}</Text>
          )}

          <Animated.View entering={FadeInDown.delay(260).springify()} style={{ marginTop: 20 }}>
            <SubmitBtn
              label={method === 'phone' ? 'Envoyer le SMS' : 'Envoyer le code'}
              onPress={handleRequestReset} loading={loading} colors={colors}
            />
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(320).duration(350)} style={s.backRow}>
            <TouchableOpacity onPress={onGoBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[s.backText, { color: colors.primary }]}>Retour à la connexion</Text>
            </TouchableOpacity>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  /* ── Rendu : Étape 2 (code) ─────────────────────────────────────────────── */
  if (step === 'code') return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Hero
        title="Entrez le code"
        subtitle={method === 'phone' ? `Code envoyé au ${country.dial} ${value}` : `Code envoyé à ${value || 'votre adresse'}`}
        icon={method === 'phone' ? 'message-circle' : 'mail'}
        colors={colors}
        bgColor={colors.background}
        onBack={goBackStep}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Input label="Code de vérification" leftIcon="key" value={code}
              onChangeText={v => { setCode(v); setError(''); }} error={error}
              keyboardType="default" autoCapitalize="characters"
              returnKeyType="done" onSubmitEditing={handleVerifyCode}
              placeholder="Entrez le code reçu" />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(350)}
            style={[s.infoBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, marginTop: 14 }]}>
            <Icon name="clock" size={13} color={colors.textTertiary} />
            <Text style={[s.infoText, { color: colors.textTertiary }]}>
              Le code est valide 15 minutes. Pensez à vérifier vos spams.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).springify()} style={{ marginTop: 20 }}>
            <SubmitBtn label="Continuer" onPress={handleVerifyCode} loading={loading} colors={colors} />
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(280).duration(350)} style={s.backRow}>
            <TouchableOpacity onPress={() => { setStep('input'); setCode(''); setError(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[s.backText, { color: colors.primary }]}>Renvoyer le code</Text>
            </TouchableOpacity>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  /* ── Rendu : Étape 3 (nouveau mdp) ──────────────────────────────────────── */
  if (step === 'newpass') return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Hero
        title="Nouveau mot de passe"
        subtitle="Choisissez un mot de passe fort (8 caractères minimum)"
        icon="shield"
        colors={colors}
        bgColor={colors.background}
        onBack={goBackStep}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Animated.View entering={FadeInDown.delay(100).springify()} style={{ gap: 14 }}>
            <Input ref={newPassRef} label="Nouveau mot de passe" leftIcon="lock" isPassword
              value={newPass} onChangeText={v => { setNewPass(v); setError(''); }}
              returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} />
            <Input ref={confirmRef} label="Confirmer le mot de passe" leftIcon="lock" isPassword
              value={confirmPass} onChangeText={v => { setConfirmPass(v); setError(''); }}
              error={error} returnKeyType="done" onSubmitEditing={handleResetPassword} />
          </Animated.View>

          {/* Indicateur force */}
          {newPass.length > 0 && (
            <Animated.View entering={FadeIn.duration(200)} style={[s.strengthBar, { marginTop: 10 }]}>
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

          <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginTop: 24 }}>
            <SubmitBtn label="Réinitialiser le mot de passe" onPress={handleResetPassword} loading={loading} colors={colors} />
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  /* ── Rendu : Succès ─────────────────────────────────────────────────────── */
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Hero
        title="Mot de passe modifié !"
        subtitle="Votre compte est sécurisé. Vous pouvez maintenant vous connecter."
        icon="check-circle"
        colors={colors}
        bgColor={colors.background}
        onBack={onGoBack}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Animated.View entering={FadeInDown.delay(100).springify()} style={{ width: '100%' }}>
          <SubmitBtn label="Se connecter" onPress={onGoBack} colors={colors} />
        </Animated.View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },

  methodBar:  { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, marginBottom: 20, gap: 4 },
  methodTab:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  methodLabel:{ fontSize: 12, fontWeight: '700' },

  errorBubble: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: '500' },

  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },

  backRow:  { alignItems: 'center', marginTop: 22 },
  backText: { fontSize: 14, fontWeight: '600' },

  submitBtn:     { height: 52, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  strengthBar:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel:   { fontSize: 12, fontWeight: '600', width: 70, textAlign: 'right' },
});
