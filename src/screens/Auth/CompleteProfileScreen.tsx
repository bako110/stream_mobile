import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ActivityIndicator, Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo } from '../../components/common';
import { userService, toastService } from '../../services';
import type { Gender } from '../../types';

interface Props {
  onDone: () => void;
}

const GENDER_OPTIONS: { key: Gender; label: string }[] = [
  { key: 'female',            label: 'Femme' },
  { key: 'male',              label: 'Homme' },
  { key: 'other',             label: 'Autre' },
  { key: 'prefer_not_to_say', label: 'Non précisé' },
];

/**
 * Affiché juste après une connexion Google/Facebook — ces providers ne fournissent
 * ni date de naissance ni sexe, contrairement à l'inscription classique où ces
 * champs sont obligatoires. On les complète ici avant d'accéder au reste de l'app.
 */
export const CompleteProfileScreen: React.FC<Props> = ({ onDone }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!dateOfBirth) return 'La date de naissance est requise';
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (age < 13) return 'Tu dois avoir au moins 13 ans pour utiliser Gofolyx';
    if (!gender) return 'Le sexe est requis';
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      await userService.updateMe({ date_of_birth: dateOfBirth, gender: gender as Gender });
      onDone();
    } catch (e: any) {
      const msg = e?.data?.detail ?? e?.message ?? 'Mise à jour impossible';
      setError(typeof msg === 'string' ? msg : 'Mise à jour impossible');
      toastService.error('Erreur', typeof msg === 'string' ? msg : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />

      <View style={{ paddingTop: insets.top + 24, paddingHorizontal: 28, flex: 1 }}>
        <Animated.View entering={FadeInDown.delay(60).springify()} style={{ alignItems: 'center', marginBottom: 24 }}>
          <AppLogo size="md" />
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(120).duration(400)} style={[s.title, { color: colors.textPrimary }]}>
          Encore une étape
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(170).duration(400)} style={[s.subtitle, { color: colors.textSecondary }]}>
          Complète ton profil pour finaliser ton inscription.
        </Animated.Text>

        {error ? (
          <Animated.Text entering={FadeInDown.duration(250)} style={[s.globalError, { color: colors.error, backgroundColor: colors.errorBg }]}>
            {error}
          </Animated.Text>
        ) : null}

        <Animated.View entering={FadeInDown.delay(220).springify()} style={{ marginTop: 8 }}>
          <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Date de naissance</Text>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}
            style={[s.dateField, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <Icon name="calendar" size={16} color={colors.textTertiary} />
            <Text style={{ flex: 1, fontSize: 14, color: dateOfBirth ? colors.textPrimary : colors.textTertiary }}>
              {dateOfBirth
                ? new Date(dateOfBirth).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                : 'Sélectionner une date'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
        {showDatePicker && (
          <DateTimePicker
            value={dateOfBirth ? new Date(dateOfBirth) : new Date(2000, 0, 1)}
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
                setDateOfBirth(`${yyyy}-${mm}-${dd}`);
                setError('');
              }
            }}
          />
        )}

        <Animated.View entering={FadeInDown.delay(260).springify()} style={{ marginTop: 18 }}>
          <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Sexe</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {GENDER_OPTIONS.map(opt => {
              const selected = gender === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => { setGender(opt.key); setError(''); }}
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
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(320).springify()} style={{ marginTop: 28 }}>
          <TouchableOpacity onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[s.submitBtn, { opacity: loading ? 0.7 : 1 }]}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Text style={s.submitBtnText}>Continuer</Text>
                    <Icon name="arrow-right" size={18} color="#fff" />
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:     { flex: 1 },
  title:    { fontSize: 24, fontWeight: '800', marginBottom: 6, lineHeight: 32, textAlign: 'center' },
  subtitle: { fontSize: 14, marginBottom: 20, lineHeight: 21, textAlign: 'center' },

  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  dateField:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 48 },
  genderChip: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },

  submitBtn:     { height: 52, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  globalError: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8, marginBottom: 4, fontSize: 13, fontWeight: '500' },
});
