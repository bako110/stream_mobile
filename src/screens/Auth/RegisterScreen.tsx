import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView,
  Platform, TouchableOpacity, StatusBar, TextInput,
  Dimensions, ScrollView, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInUp,
  SlideInRight, SlideOutLeft,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Svg, { Path } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { Input, PhoneInput, DEFAULT_COUNTRY } from '../../components/common';
import type { Country } from '../../components/common';
import { authService } from '../../services';
import { getDeviceFingerprint } from '../../utils/deviceFingerprint';
import type { Gender } from '../../types';

const { width: W, height: H } = Dimensions.get('window');
const HERO_H = H * 0.26;

interface Props {
  onRegisterSuccess: () => void;
  onGoLogin:         () => void;
}

type AuthMethod = 'email' | 'phone';

interface StepData {
  firstName:    string;
  lastName:     string;
  authMethod:   AuthMethod;
  email:        string;
  phone:        string;
  country:      Country;
  username:     string;
  password:     string;
  confirm:      string;
  referralCode: string;
  dateOfBirth:  string;
  gender:       Gender | '';
}

type FormErrors = Partial<Record<keyof StepData, string>>;

const GENDER_OPTIONS: { key: Gender; label: string }[] = [
  { key: 'female',            label: 'Femme' },
  { key: 'male',              label: 'Homme' },
  { key: 'other',             label: 'Autre' },
  { key: 'prefer_not_to_say', label: 'Non précisé' },
];

const STEPS = 3;

// ── Vague SVG ────────────────────────────────────────────────────────────────
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

// ── Barre de progression ──────────────────────────────────────────────────────
const StepBar: React.FC<{ current: number; total: number; colors: any }> = ({ current, total, colors }) => (
  <View style={sb.wrap}>
    {Array.from({ length: total }).map((_, i) => (
      <View key={i} style={[sb.track, { backgroundColor: colors.border }]}>
        {i < current && (
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
    ))}
  </View>
);

const sb = StyleSheet.create({
  wrap:  { flexDirection: 'row', gap: 6, marginBottom: 24 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
});

// ── Indicateur force mdp ──────────────────────────────────────────────────────
const pw = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  bars:  { flex: 1, flexDirection: 'row', gap: 4 },
  bar:   { flex: 1, height: 4, borderRadius: 2 },
  label: { fontSize: 12, fontWeight: '600', minWidth: 58, textAlign: 'right' },
});

// ── Step 1 ────────────────────────────────────────────────────────────────────
const Step1: React.FC<{
  data: StepData; onChange: (k: keyof StepData, v: string) => void;
  errors: FormErrors; onNext: () => void; colors: any;
}> = ({ data, onChange, errors, onNext, colors }) => {
  const lastRef = useRef<TextInput>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  return (
    <Animated.View entering={SlideInRight.springify().damping(18)} exiting={SlideOutLeft.springify().damping(18)} style={s.stepWrap}>
      <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={[s.stepTitle, { color: colors.textPrimary }]}>
        Comment vous appelez-vous ?
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(140).duration(400)} style={[s.stepSubtitle, { color: colors.textSecondary }]}>
        Votre identité sur GoFolyX
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
          autoCapitalize="words"
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).springify()} style={{ marginTop: 14 }}>
        <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Date de naissance</Text>
        <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}
          style={[s.dateField, { backgroundColor: colors.surfaceElevated, borderColor: errors.dateOfBirth ? colors.error : colors.border }]}>
          <Icon name="calendar" size={16} color={colors.textTertiary} />
          <Text style={{ flex: 1, fontSize: 14, color: data.dateOfBirth ? colors.textPrimary : colors.textTertiary }}>
            {data.dateOfBirth
              ? new Date(data.dateOfBirth).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
              : 'Sélectionner une date'}
          </Text>
        </TouchableOpacity>
        {errors.dateOfBirth ? <Text style={[s.fieldError, { color: colors.error }]}>{errors.dateOfBirth}</Text> : null}
      </Animated.View>
      {showDatePicker && (
        <DateTimePicker
          value={data.dateOfBirth ? new Date(data.dateOfBirth) : new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          minimumDate={new Date(1920, 0, 1)}
          onChange={(_event: any, selected?: Date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (selected) {
              const yyyy = selected.getFullYear();
              const mm = String(selected.getMonth() + 1).padStart(2, '0');
              const dd = String(selected.getDate()).padStart(2, '0');
              onChange('dateOfBirth', `${yyyy}-${mm}-${dd}`);
            }
          }}
        />
      )}

      <Animated.View entering={FadeInDown.delay(300).springify()} style={{ marginTop: 14 }}>
        <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Sexe</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {GENDER_OPTIONS.map(opt => {
            const selected = data.gender === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => onChange('gender', opt.key)}
                style={[s.genderChip, {
                  backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                  borderColor: selected ? colors.primary : colors.border,
                }]}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : colors.textPrimary }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.gender ? <Text style={[s.fieldError, { color: colors.error }]}>{errors.gender}</Text> : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(320).springify()} style={{ marginTop: 24 }}>
        <TouchableOpacity onPress={onNext} activeOpacity={0.85}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.submitBtn}
          >
            <Text style={s.submitBtnText}>Continuer</Text>
            <Icon name="arrow-right" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

// ── Step 2 ────────────────────────────────────────────────────────────────────
const Step2: React.FC<{
  data: StepData; onChange: (k: keyof StepData, v: string) => void;
  onCountryChange: (c: Country) => void;
  errors: FormErrors; onNext: () => void; colors: any;
}> = ({ data, onChange, onCountryChange, errors, onNext, colors }) => {
  const userRef = useRef<TextInput>(null);
  const isEmail = data.authMethod === 'email';

  const toggle = (
    <TouchableOpacity
      onPress={() => { onChange('authMethod', isEmail ? 'phone' : 'email'); onChange('email', ''); onChange('phone', ''); }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[s.togglePill, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
    >
      <Icon name={isEmail ? 'smartphone' : 'mail'} size={12} color={colors.primary} />
      <Text style={[s.toggleText, { color: colors.primary }]}>{isEmail ? 'Tel' : 'Email'}</Text>
    </TouchableOpacity>
  );

  return (
    <Animated.View entering={SlideInRight.springify().damping(18)} exiting={SlideOutLeft.springify().damping(18)} style={s.stepWrap}>
      <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={[s.stepTitle, { color: colors.textPrimary }]}>
        Vos informations de compte
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(140).duration(400)} style={[s.stepSubtitle, { color: colors.textSecondary }]}>
        Email ou numéro de téléphone
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
        {!isEmail && (
          <TouchableOpacity onPress={() => { onChange('authMethod', 'email'); onChange('phone', ''); }} style={s.switchLink}>
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
        <TouchableOpacity onPress={onNext} activeOpacity={0.85}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.submitBtn}
          >
            <Text style={s.submitBtnText}>Continuer</Text>
            <Icon name="arrow-right" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

// ── Step 3 ────────────────────────────────────────────────────────────────────
const Step3: React.FC<{
  data: StepData; onChange: (k: keyof StepData, v: string) => void;
  errors: FormErrors; onSubmit: () => void; loading: boolean; colors: any;
}> = ({ data, onChange, errors, onSubmit, loading, colors }) => {
  const confirmRef  = useRef<TextInput>(null);
  const referralRef = useRef<TextInput>(null);

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
        Sécurisez votre compte
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

      {data.password.length > 0 && (
        <Animated.View entering={FadeInDown.duration(250)} style={pw.wrap}>
          <View style={pw.bars}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={[pw.bar, { backgroundColor: i <= strength ? lvl.color : colors.border }]} />
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
          returnKeyType="next"
          onSubmitEditing={() => referralRef.current?.focus()}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(310).springify()} style={{ marginTop: 14 }}>
        <Input
          ref={referralRef}
          label="Code de parrainage (optionnel)"
          leftIcon="gift"
          value={data.referralCode}
          onChangeText={v => onChange('referralCode', v.toUpperCase())}
          autoCapitalize="characters"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          placeholder="Ex: AB3X9KZW"
        />
      </Animated.View>

      <Animated.Text entering={FadeInDown.delay(320).duration(350)} style={[s.cgu, { color: colors.textTertiary }]}>
        En vous inscrivant, vous acceptez nos{' '}
        <Text style={{ color: colors.primary, fontWeight: '600' }}>CGU</Text>
        {' '}et notre{' '}
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Politique de confidentialité</Text>.
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(380).springify()} style={{ marginTop: 20 }}>
        <TouchableOpacity onPress={onSubmit} disabled={loading} activeOpacity={0.85}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[s.submitBtn, { opacity: loading ? 0.7 : 1 }]}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Text style={s.submitBtnText}>Créer mon compte</Text>
                  <Icon name="check" size={18} color="#fff" />
                </>
            }
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

// ── Écran principal ───────────────────────────────────────────────────────────
export const RegisterScreen: React.FC<Props> = ({ onRegisterSuccess, onGoLogin }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<FormErrors>({});
  const [globalError, setGlobalError] = useState('');

  // Anti-bot : capturé au montage de l'écran, vérifié côté serveur pour détecter
  // un remplissage anormalement rapide (voir _check_not_a_bot dans auth.py).
  const formStartedAtRef = useRef(Date.now());

  const [data, setData] = useState<StepData>({
    firstName: '', lastName: '', authMethod: 'email',
    email: '', phone: '', country: DEFAULT_COUNTRY,
    username: '', password: '', confirm: '', referralCode: '',
    dateOfBirth: '', gender: '',
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

  const validateStep1 = (): boolean => {
    const e: FormErrors = {};
    if (!data.firstName.trim()) e.firstName = 'Prénom requis';
    if (!data.lastName.trim())  e.lastName  = 'Nom requis';
    if (!data.dateOfBirth) {
      e.dateOfBirth = 'Date de naissance requise';
    } else {
      const dob = new Date(data.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      if (age < 13) e.dateOfBirth = 'Tu dois avoir au moins 13 ans';
    }
    if (!data.gender) e.gender = 'Sexe requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: FormErrors = {};
    if (data.authMethod === 'email') {
      if (!data.email.trim() || !data.email.includes('@')) e.email = 'Email invalide';
    } else {
      const digits = data.phone.replace(/\D/g, '');
      if (digits.length < 8) e.phone = 'Numéro de téléphone invalide';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = (): boolean => {
    const e: FormErrors = {};
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
        first_name:    data.firstName.trim(),
        last_name:     data.lastName.trim(),
        email:         data.authMethod === 'email' ? data.email.trim().toLowerCase() : undefined,
        phone:         data.authMethod === 'phone' ? `${data.country.dial}${data.phone.trim()}` : undefined,
        password:      data.password,
        username:      data.username.trim() || undefined,
        referral_code: data.referralCode.trim() || undefined,
        date_of_birth: data.dateOfBirth,
        gender:        data.gender as Gender,
        form_started_at: formStartedAtRef.current,
        device_fingerprint: await getDeviceFingerprint(),
      });
      onRegisterSuccess();
    } catch (e: any) {
      setGlobalError(e?.message ?? "Erreur lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  }, [data, onRegisterSuccess]);

  const stepLabels = ['Identité', 'Compte', 'Sécurité'];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── HERO ── */}
      <View style={[s.hero, { height: HERO_H }]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd, colors.primary + 'CC']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[s.heroCircle1, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
        <View style={[s.heroCircle2, { backgroundColor: 'rgba(255,255,255,0.07)' }]} />

        {/* Bouton retour */}
        <TouchableOpacity onPress={goBack} style={[s.backBtn, { top: insets.top + 12 }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>

        <Animated.View entering={FadeInDown.delay(80).springify()} style={[s.heroContent, { paddingTop: insets.top + 12 }]}>
          <Text style={s.heroTitle}>Inscription</Text>
          <Text style={s.heroSub}>Étape {step} sur {STEPS} — {stepLabels[step - 1]}</Text>
        </Animated.View>

        <WaveBottom color={colors.background} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Barre de progression */}
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
            <Text style={[s.loginLabel, { color: colors.textSecondary }]}>Déjà un compte ?{'  '}</Text>
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
  root:   { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },

  // Hero
  hero:        { width: '100%', overflow: 'visible' },
  heroCircle1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, top: -30, right: -30 },
  heroCircle2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, bottom: 20, left: -20 },
  backBtn:     { position: 'absolute', left: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  heroContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 30 },
  heroTitle:   { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  heroSub:     { fontSize: 13, color: 'rgba(255,255,255,0.80)', marginTop: 6, fontWeight: '400' },

  // Form
  stepWrap:     {},
  togglePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  toggleText:   { fontSize: 11, fontWeight: '700' },
  switchLink:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  switchLinkText:{ fontSize: 13, fontWeight: '600' },
  stepTitle:    { fontSize: 24, fontWeight: '800', marginBottom: 6, lineHeight: 32 },
  stepSubtitle: { fontSize: 14, marginBottom: 22, lineHeight: 21 },
  cgu:          { fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },

  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  fieldError: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  dateField:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 48 },
  genderChip: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },

  submitBtn:     { height: 52, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  globalError: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, fontSize: 13, fontWeight: '500' },
  loginRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  loginLabel:  { fontSize: 14 },
  loginLink:   { fontSize: 14, fontWeight: '700' },
});
