import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView,
  Platform, TouchableOpacity, StatusBar, TextInput,
  Dimensions, ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
  interpolate, Extrapolation, FadeInDown, FadeInUp, FadeOutUp,
  SlideInRight, SlideOutLeft, SlideInLeft, SlideOutRight,
  runOnJS,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo, Button, Input, PhoneInput, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { authService } from '../../services';

const { width } = Dimensions.get('window');

interface Props {
  onRegisterSuccess: () => void;
  onGoLogin:         () => void;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type AuthMethod = 'email' | 'phone';

interface StepData {
  firstName:  string;
  lastName:   string;
  authMethod: AuthMethod;
  email:      string;
  phone:      string;
  country:    Country;
  username:   string;
  password:   string;
  confirm:    string;
}

const STEPS = 3;

// ── Composant barre de progression ───────────────────────────────────────────
const StepBar: React.FC<{ current: number; total: number; colors: any }> = ({ current, total, colors }) => (
  <View style={sb.wrap}>
    {Array.from({ length: total }).map((_, i) => (
      <View key={i} style={[sb.track, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            sb.fill,
            {
              width: i < current ? '100%' : i === current - 1 ? '100%' : '0%',
              backgroundColor: i < current ? colors.primary : colors.border,
            },
          ]}
        />
        {i < current && (
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
    ))}
  </View>
);

const sb = StyleSheet.create({
  wrap:  { flexDirection: 'row', gap: 6, marginBottom: 28 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 2 },
});

// ── Step 1 : Identité ─────────────────────────────────────────────────────────
const Step1: React.FC<{
  data: StepData;
  onChange: (k: keyof StepData, v: string) => void;
  errors: Partial<StepData>;
  onNext: () => void;
  colors: any;
}> = ({ data, onChange, errors, onNext, colors }) => {
  const lastRef = useRef<TextInput>(null);

  return (
    <Animated.View entering={SlideInRight.springify().damping(18)} exiting={SlideOutLeft.springify().damping(18)} style={s.stepWrap}>
      <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={[s.stepTitle, { color: colors.textPrimary }]}>
        Comment vous appelez-vous ? 👋
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(140).duration(400)} style={[s.stepSubtitle, { color: colors.textSecondary }]}>
        Votre identité sur FoliX
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <Input
          label="Prénom"
          leftIcon="user"
          value={data.firstName}
          onChangeText={v => onChange('firstName', v)}
          error={errors.firstName}
          returnKeyType="next"
          onSubmitEditing={() => lastRef.current?.focus()}
          autoCapitalize="words"
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(260).springify()} style={{ marginTop: 14 }}>
        <Input
          ref={lastRef}
          label="Nom"
          leftIcon="user"
          value={data.lastName}
          onChangeText={v => onChange('lastName', v)}
          error={errors.lastName}
          returnKeyType="done"
          onSubmitEditing={onNext}
          autoCapitalize="words"
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(320).springify()} style={{ marginTop: 24 }}>
        <Button label="Continuer →" onPress={onNext} size="lg" />
      </Animated.View>
    </Animated.View>
  );
};

// ── Step 2 : Compte ───────────────────────────────────────────────────────────
const Step2: React.FC<{
  data:            StepData;
  onChange:        (k: keyof StepData, v: string) => void;
  onCountryChange: (c: Country) => void;
  errors:          Partial<StepData>;
  onNext:          () => void;
  colors:          any;
}> = ({ data, onChange, onCountryChange, errors, onNext, colors }) => {
  const userRef = useRef<TextInput>(null);
  const isEmail = data.authMethod === 'email';

  const toggle = (
    <TouchableOpacity
      onPress={() => {
        onChange('authMethod', isEmail ? 'phone' : 'email');
        onChange('email', '');
        onChange('phone', '');
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[s.togglePill, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
    >
      <Icon name={isEmail ? 'smartphone' : 'mail'} size={13} color={colors.primary} />
      <Text style={[s.toggleText, { color: colors.primary }]}>
        {isEmail ? 'Tel' : 'Email'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Animated.View entering={SlideInRight.springify().damping(18)} exiting={SlideOutLeft.springify().damping(18)} style={s.stepWrap}>
      <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={[s.stepTitle, { color: colors.textPrimary }]}>
        Vos informations de compte
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(140).duration(400)} style={[s.stepSubtitle, { color: colors.textSecondary }]}>
        Email ou numero de telephone
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(200).springify()}>
        {isEmail ? (
          <Input
            label="Adresse email"
            leftIcon="mail"
            value={data.email}
            onChangeText={v => onChange('email', v)}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={() => userRef.current?.focus()}
            rightElement={toggle}
          />
        ) : (
          <PhoneInput
            value={data.phone}
            country={data.country}
            onCountryChange={onCountryChange}
            onChangeText={(digits) => onChange('phone', digits)}
            error={errors.phone}
            returnKeyType="next"
            onSubmitEditing={() => userRef.current?.focus()}
          />
        )}
        {isEmail && null}
        {/* Pill toggle visible aussi en mode phone via le composant PhoneInput — on laisse le toggle email ici uniquement */}
        {!isEmail && (
          <TouchableOpacity
            onPress={() => { onChange('authMethod', 'email'); onChange('phone', ''); }}
            style={[s.switchLink]}
          >
            <Icon name="mail" size={13} color={colors.primary} />
            <Text style={[s.switchLinkText, { color: colors.primary }]}>Utiliser un email à la place</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(260).springify()} style={{ marginTop: 14 }}>
        <Input
          ref={userRef}
          label="Nom d'utilisateur (optionnel)"
          leftIcon="at-sign"
          value={data.username}
          onChangeText={v => onChange('username', v)}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={onNext}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(320).springify()} style={{ marginTop: 24 }}>
        <Button label="Continuer" onPress={onNext} size="lg" />
      </Animated.View>
    </Animated.View>
  );
};

// ── Step 3 : Mot de passe ─────────────────────────────────────────────────────
const Step3: React.FC<{
  data: StepData;
  onChange: (k: keyof StepData, v: string) => void;
  errors: Partial<StepData>;
  onSubmit: () => void;
  loading: boolean;
  colors: any;
}> = ({ data, onChange, errors, onSubmit, loading, colors }) => {
  const confirmRef = useRef<TextInput>(null);

  const strength = [
    data.password.length >= 8,
    /[A-Z]/.test(data.password),
    /[0-9]/.test(data.password),
    /[^A-Za-z0-9]/.test(data.password),
  ].filter(Boolean).length;

  const levels = [
    { label: 'Faible',    color: colors.error },
    { label: 'Moyen',     color: colors.warning },
    { label: 'Fort',      color: colors.accentGreen },
    { label: 'Très fort', color: colors.success },
  ];
  const lvl = levels[Math.max(0, strength - 1)];

  return (
    <Animated.View entering={SlideInRight.springify().damping(18)} exiting={SlideOutLeft.springify().damping(18)} style={s.stepWrap}>
      <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={[s.stepTitle, { color: colors.textPrimary }]}>
        Sécurisez votre compte 🔐
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(140).duration(400)} style={[s.stepSubtitle, { color: colors.textSecondary }]}>
        Choisissez un mot de passe fort
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <Input
          label="Mot de passe"
          leftIcon="lock"
          isPassword
          value={data.password}
          onChangeText={v => onChange('password', v)}
          error={errors.password}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
      </Animated.View>

      {/* Indicateur de force */}
      {data.password.length > 0 && (
        <Animated.View entering={FadeInDown.duration(250)} style={pw.wrap}>
          <View style={pw.bars}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={[pw.bar, {
                backgroundColor: i <= strength ? lvl.color : colors.border,
              }]} />
            ))}
          </View>
          <Text style={[pw.label, { color: lvl.color }]}>{lvl.label}</Text>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(260).springify()} style={{ marginTop: 14 }}>
        <Input
          ref={confirmRef}
          label="Confirmer le mot de passe"
          leftIcon="lock"
          isPassword
          value={data.confirm}
          onChangeText={v => onChange('confirm', v)}
          error={errors.confirm}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
      </Animated.View>

      {/* CGU */}
      <Animated.Text entering={FadeInDown.delay(320).duration(350)} style={[s.cgu, { color: colors.textTertiary }]}>
        En vous inscrivant, vous acceptez nos{' '}
        <Text style={{ color: colors.primary, fontWeight: '600' }}>CGU</Text>
        {' '}et notre{' '}
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Politique de confidentialité</Text>.
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(380).springify()} style={{ marginTop: 20 }}>
        <Button label="Créer mon compte 🎉" onPress={onSubmit} loading={loading} size="lg" />
      </Animated.View>
    </Animated.View>
  );
};

const pw = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  bars:  { flex: 1, flexDirection: 'row', gap: 4 },
  bar:   { flex: 1, height: 4, borderRadius: 2 },
  label: { fontSize: 12, fontWeight: '600', minWidth: 58, textAlign: 'right' },
});

// ── Écran principal ───────────────────────────────────────────────────────────
export const RegisterScreen: React.FC<Props> = ({ onRegisterSuccess, onGoLogin }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Partial<StepData>>({});
  const [globalError, setGlobalError] = useState('');

  const [data, setData] = useState<StepData>({
    firstName: '', lastName: '', authMethod: 'email',
    email: '', phone: '', country: DEFAULT_COUNTRY,
    username: '', password: '', confirm: '',
  });

  const onChange = useCallback((key: keyof StepData, value: string) => {
    setData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
    setGlobalError('');
  }, []);

  const onCountryChange = useCallback((c: Country) => {
    setData(prev => ({ ...prev, country: c }));
  }, []);

  const goBack = () => {
    if (step > 1) setStep(s => s - 1);
    else onGoLogin();
  };

  // Validation par étape
  const validateStep1 = (): boolean => {
    const e: Partial<StepData> = {};
    if (!data.firstName.trim()) e.firstName = 'Prénom requis';
    if (!data.lastName.trim())  e.lastName  = 'Nom requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: Partial<StepData> = {};
    if (data.authMethod === 'email') {
      if (!data.email.trim() || !data.email.includes('@')) e.email = 'Email invalide';
    } else {
      const digits = data.phone.replace(/\D/g, '');
      if (digits.length < 8) e.phone = 'Numero de telephone invalide';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = (): boolean => {
    const e: Partial<StepData> = {};
    if (data.password.length < 8) e.password = '8 caractères minimum';
    if (data.password !== data.confirm) e.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    if (step === 2 && validateStep2()) setStep(3);
  };

  const handleSubmit = useCallback(async () => {
    if (!validateStep3()) return;
    setLoading(true);
    setGlobalError('');
    try {
      await authService.register({
        first_name: data.firstName.trim(),
        last_name:  data.lastName.trim(),
        email:      data.authMethod === 'email' ? data.email.trim().toLowerCase() : undefined,
        phone:      data.authMethod === 'phone' ? `${data.country.dial}${data.phone.trim()}` : undefined,
        password:   data.password,
        username:   data.username.trim() || undefined,
      });
      onRegisterSuccess();
    } catch (e: any) {
      setGlobalError(e?.message ?? "Erreur lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  }, [data, onRegisterSuccess]);

  const stepTitles = ['Identité', 'Compte', 'Sécurité'];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Orbe décoratif */}
      <View style={s.orb} pointerEvents="none">
        <LinearGradient colors={[colors.accentGreen + '40', colors.primary + '28', 'transparent']} style={StyleSheet.absoluteFill} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <Animated.View entering={FadeInDown.delay(40).springify()} style={s.header}>
            <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={s.backBtn}>
              <Text style={[s.backIcon, { color: colors.primary }]}>←</Text>
            </TouchableOpacity>
            <AppLogo size="sm" style={{ flex: 0 }} />
            <View style={{ width: 40 }} />
          </Animated.View>

          {/* Label étape */}
          <Animated.Text entering={FadeInDown.delay(80).duration(350)} style={[s.stepLabel, { color: colors.textTertiary }]}>
            Étape {step} sur {STEPS} — {stepTitles[step - 1]}
          </Animated.Text>

          {/* Barre progression */}
          <StepBar current={step} total={STEPS} colors={colors} />

          {/* Contenu de l'étape */}
          {step === 1 && (
            <Step1 data={data} onChange={onChange} errors={errors} onNext={handleNext} colors={colors} />
          )}
          {step === 2 && (
            <Step2 data={data} onChange={onChange} onCountryChange={onCountryChange} errors={errors} onNext={handleNext} colors={colors} />
          )}
          {step === 3 && (
            <Step3 data={data} onChange={onChange} errors={errors} onSubmit={handleSubmit} loading={loading} colors={colors} />
          )}

          {/* Erreur globale */}
          {globalError ? (
            <Animated.Text entering={FadeInDown.duration(250)} style={[s.globalError, { color: colors.error, backgroundColor: colors.errorBg }]}>
              {globalError}
            </Animated.Text>
          ) : null}

          {/* Lien connexion */}
          <Animated.View entering={FadeInUp.delay(440).duration(350)} style={s.loginRow}>
            <Text style={[s.loginLabel, { color: colors.textSecondary }]}>Déjà un compte ?  </Text>
            <TouchableOpacity onPress={onGoLogin} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[s.loginLink, { color: colors.primary }]}>Se connecter</Text>
            </TouchableOpacity>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  root:        { flex: 1 },
  scroll:      { flexGrow: 1, paddingHorizontal: 24, paddingTop: 52, paddingBottom: 40 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon:    { fontSize: 24, fontWeight: '600' },
  stepLabel:   { fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  stepWrap:    {},
  togglePill:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  toggleText:    { fontSize: 11, fontWeight: '700' },
  switchLink:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  switchLinkText:{ fontSize: 13, fontWeight: '600' },
  stepTitle:   { fontSize: 26, fontWeight: '800', marginBottom: 6, lineHeight: 34 },
  stepSubtitle:{ fontSize: 15, marginBottom: 24, lineHeight: 22 },
  cgu:         { fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },
  globalError: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, fontSize: 13, fontWeight: '500' },
  loginRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  loginLabel:  { fontSize: 14 },
  loginLink:   { fontSize: 14, fontWeight: '700' },
  orb:         { position: 'absolute', top: -90, left: -80, width: 280, height: 280, borderRadius: 140, overflow: 'hidden' },
});
