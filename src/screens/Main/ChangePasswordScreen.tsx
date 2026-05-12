import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services/authService';

interface Props { navigation: any; }

export const ChangePasswordScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  // Étape 1 : vérification mot de passe actuel
  // Étape 2 : saisie nouveau mot de passe
  const [step,         setStep]         = useState<1 | 2>(1);
  const [current,      setCurrent]      = useState('');
  const [newPwd,       setNewPwd]       = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [verifying]                      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [showCurrent,  setShowCurrent]  = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const goToStep2 = () => {
    Animated.timing(slideAnim, {
      toValue: -400, duration: 220, useNativeDriver: true,
    }).start(() => {
      setStep(2);
      slideAnim.setValue(400);
      Animated.timing(slideAnim, {
        toValue: 0, duration: 220, useNativeDriver: true,
      }).start();
    });
  };

  // Étape 1 — validation locale uniquement, pas d'appel API
  const handleVerify = () => {
    if (!current.trim()) return;
    goToStep2();
  };

  // Étape 2 — enregistrer le nouveau mot de passe
  const handleSave = async () => {
    if (newPwd.length < 8) {
      Alert.alert('Erreur', 'Le nouveau mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (newPwd !== confirm) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }
    setSaving(true);
    try {
      await authService.changePassword({ current_password: current, new_password: newPwd });
      Alert.alert('Succès', 'Votre mot de passe a été changé.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? 'Erreur lors du changement.';
      Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  const canSave = newPwd.length >= 8 && newPwd === confirm;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => {
          if (step === 2) { setStep(1); } else { navigation.goBack(); }
        }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Changer le mot de passe</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Indicateur d'étapes */}
      <View style={styles.stepsRow}>
        <View style={styles.stepItem}>
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            style={[styles.stepDot, styles.stepDotActive]}
          >
            <Icon name="check" size={12} color="#fff" />
          </LinearGradient>
          <Text style={[styles.stepLabel, { color: step === 1 ? colors.primary : colors.textTertiary }]}>
            Vérification
          </Text>
        </View>
        <View style={[styles.stepLine, { backgroundColor: step === 2 ? colors.primary : colors.divider }]} />
        <View style={styles.stepItem}>
          <View style={[
            styles.stepDot,
            step === 2
              ? { backgroundColor: colors.primary }
              : { backgroundColor: colors.divider },
          ]}>
            {step === 2
              ? <Icon name="lock" size={12} color="#fff" />
              : <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700' }}>2</Text>
            }
          </View>
          <Text style={[styles.stepLabel, { color: step === 2 ? colors.primary : colors.textTertiary }]}>
            Nouveau
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Animated.View style={[styles.form, { transform: [{ translateX: slideAnim }] }]}>

          {step === 1 ? (
            <>
              <View style={[styles.iconBanner, { backgroundColor: colors.primary + '15' }]}>
                <Icon name="shield" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
                Confirmez votre identité
              </Text>
              <Text style={[styles.stepDesc, { color: colors.textTertiary }]}>
                Entrez votre mot de passe actuel pour continuer.
              </Text>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Mot de passe actuel</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Icon name="lock" size={16} color={colors.textTertiary} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={current}
                  onChangeText={setCurrent}
                  secureTextEntry={!showCurrent}
                  placeholder="Votre mot de passe actuel"
                  placeholderTextColor={colors.textDisabled}
                  autoCapitalize="none"
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={handleVerify}
                />
                <TouchableOpacity onPress={() => setShowCurrent(v => !v)}>
                  <Icon name={showCurrent ? 'eye-off' : 'eye'} size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.btn, { opacity: current.length > 0 ? 1 : 0.4, overflow: 'hidden' }]}
                onPress={handleVerify}
                disabled={current.length === 0 || verifying}
                activeOpacity={0.8}
              >
                <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                {verifying
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.btnText}>Continuer</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.iconBanner, { backgroundColor: '#10B981' + '15' }]}>
                <Icon name="lock" size={32} color="#10B981" />
              </View>
              <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
                Nouveau mot de passe
              </Text>
              <Text style={[styles.stepDesc, { color: colors.textTertiary }]}>
                Choisissez un mot de passe fort d'au moins 8 caractères.
              </Text>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Nouveau mot de passe</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Icon name="lock" size={16} color={colors.textTertiary} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={newPwd}
                  onChangeText={setNewPwd}
                  secureTextEntry={!showNew}
                  placeholder="Min. 8 caractères"
                  placeholderTextColor={colors.textDisabled}
                  autoCapitalize="none"
                  autoFocus
                />
                <TouchableOpacity onPress={() => setShowNew(v => !v)}>
                  <Icon name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              {newPwd.length > 0 && newPwd.length < 8 && (
                <Text style={styles.hint}>Minimum 8 caractères requis</Text>
              )}

              {/* Jauge de force */}
              {newPwd.length > 0 && (
                <View style={styles.strengthRow}>
                  {[1, 2, 3, 4].map(i => {
                    const strength = newPwd.length >= 12 && /[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) && /[^a-zA-Z0-9]/.test(newPwd) ? 4
                      : newPwd.length >= 10 && /[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) ? 3
                      : newPwd.length >= 8 ? 2 : 1;
                    const color = strength >= 3 ? '#10B981' : strength === 2 ? '#F59E0B' : '#EF4444';
                    return (
                      <View key={i} style={[styles.strengthBar, { backgroundColor: i <= strength ? color : colors.divider }]} />
                    );
                  })}
                  <Text style={[styles.strengthLabel, { color: newPwd.length >= 12 && /[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) ? '#10B981' : newPwd.length >= 8 ? '#F59E0B' : '#EF4444' }]}>
                    {newPwd.length >= 12 && /[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) ? 'Fort' : newPwd.length >= 8 ? 'Moyen' : 'Faible'}
                  </Text>
                </View>
              )}

              <Text style={[styles.label, { color: colors.textSecondary }]}>Confirmer le mot de passe</Text>
              <View style={[styles.inputWrap, {
                backgroundColor: colors.surfaceElevated,
                borderColor: confirm.length > 0 && newPwd !== confirm ? '#EF4444' : colors.border,
              }]}>
                <Icon name="lock" size={16} color={colors.textTertiary} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={!showConfirm}
                  placeholder="Confirmez le nouveau mot de passe"
                  placeholderTextColor={colors.textDisabled}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={canSave ? handleSave : undefined}
                />
                <TouchableOpacity onPress={() => setShowConfirm(v => !v)}>
                  <Icon name={showConfirm ? 'eye-off' : 'eye'} size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              {confirm.length > 0 && newPwd !== confirm && (
                <Text style={styles.hint}>Les mots de passe ne correspondent pas</Text>
              )}

              <TouchableOpacity
                style={[styles.btn, { opacity: canSave ? 1 : 0.4, overflow: 'hidden' }]}
                onPress={handleSave}
                disabled={!canSave || saving}
                activeOpacity={0.8}
              >
                <LinearGradient colors={['#10B981', '#36D9A0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.btnText}>Enregistrer</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 56, paddingBottom: 14,
    paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 17, fontWeight: '800' },

  stepsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 20, paddingHorizontal: 40, gap: 8,
  },
  stepItem:      { alignItems: 'center', gap: 6 },
  stepDot:       { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: {},
  stepLine:      { flex: 1, height: 2, borderRadius: 1, marginBottom: 18 },
  stepLabel:     { fontSize: 11, fontWeight: '700' },

  form: { flex: 1, paddingHorizontal: 24, paddingTop: 8, gap: 6 },

  iconBanner: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12,
  },
  stepTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  stepDesc:  { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8 },

  label: { fontSize: 13, fontWeight: '600', marginTop: 16 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50, marginTop: 6,
  },
  input: { flex: 1, fontSize: 14, padding: 0 },
  hint:  { fontSize: 12, color: '#EF4444', marginTop: 4 },

  strengthRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  strengthBar:  { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel:{ fontSize: 11, fontWeight: '700', marginLeft: 4 },

  btn: {
    height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 28,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
