import React, { useState } from 'react';
import { BackButton } from '../../components/common';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';

const CONTENT_TYPES = [
  { id: 'music',    icon: 'music',      label: 'Musique' },
  { id: 'video',    icon: 'video',      label: 'Vidéo / Reels' },
  { id: 'live',     icon: 'radio',      label: 'Live / Concert' },
  { id: 'podcast',  icon: 'mic',        label: 'Podcast' },
  { id: 'gaming',   icon: 'zap',        label: 'Gaming' },
  { id: 'other',    icon: 'grid',       label: 'Autre' },
];

const REQUIREMENTS = [
  { icon: 'users',      label: 'Au moins 100 abonnés' },
  { icon: 'film',       label: 'Au moins 5 contenus publiés' },
  { icon: 'calendar',   label: 'Compte créé depuis 30 jours' },
  { icon: 'check-circle', label: 'Respect des CGU GoFolyX' },
];

export default function MonetisationRequestScreen() {
  const nav               = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { colors }        = theme;

  const [bio,          setBio]          = useState('');
  const [payoutEmail,  setPayoutEmail]  = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);

  function toggleType(id: string) {
    setSelectedTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id],
    );
  }

  async function handleSubmit() {
    if (!bio.trim() || bio.trim().length < 30) {
      Alert.alert('Bio trop courte', 'Décrivez votre activité en au moins 30 caractères.');
      return;
    }
    if (!payoutEmail.trim() || !payoutEmail.includes('@')) {
      Alert.alert('Email invalide', 'Entrez une adresse email valide pour recevoir vos paiements.');
      return;
    }
    if (selectedTypes.length === 0) {
      Alert.alert('Type de contenu', 'Sélectionnez au moins un type de contenu.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(Endpoints.monetization.request, {
        bio:          bio.trim(),
        payout_email: payoutEmail.trim(),
        content_types: selectedTypes,
      });
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible d\'envoyer la demande. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 32 }}>
        <LinearGradient colors={['#10B981', '#059669']} style={s.successCircle}>
          <Icon name="check" size={40} color="#fff" />
        </LinearGradient>
        <Text style={[s.successTitle, { color: colors.textPrimary }]}>Demande envoyée !</Text>
        <Text style={[s.successSub, { color: colors.textSecondary }]}>
          Notre équipe examine votre dossier sous 2 à 5 jours ouvrés. Vous serez notifié par email et notification.
        </Text>
        <TouchableOpacity
          onPress={() => nav.goBack()}
          style={[s.successBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={s.successBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Demande de monétisation</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Requirements */}
        <View style={[s.requireCard, { backgroundColor: colors.surface }]}>
          <Text style={[s.requireTitle, { color: colors.textPrimary }]}>Conditions requises</Text>
          {REQUIREMENTS.map(r => (
            <View key={r.label} style={s.requireRow}>
              <View style={[s.requireIcon, { backgroundColor: '#10B98122' }]}>
                <Icon name={r.icon} size={14} color="#10B981" />
              </View>
              <Text style={[s.requireLabel, { color: colors.textSecondary }]}>{r.label}</Text>
            </View>
          ))}
        </View>

        {/* Content types */}
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>TYPE DE CONTENU *</Text>
        <View style={s.typesGrid}>
          {CONTENT_TYPES.map(ct => {
            const selected = selectedTypes.includes(ct.id);
            return (
              <TouchableOpacity
                key={ct.id}
                onPress={() => toggleType(ct.id)}
                style={[
                  s.typeChip,
                  { backgroundColor: selected ? colors.primary + '22' : colors.surface, borderColor: selected ? colors.primary : colors.divider },
                ]}
                activeOpacity={0.8}
              >
                <Icon name={ct.icon} size={16} color={selected ? colors.primary : colors.textTertiary} />
                <Text style={[s.typeLabel, { color: selected ? colors.primary : colors.textSecondary }]}>{ct.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bio */}
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>DESCRIPTION DE VOTRE ACTIVITÉ *</Text>
        <View style={[s.inputWrap, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Décrivez votre activité créative, votre audience et vos projets (min. 30 caractères)..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            maxLength={500}
            style={[s.textArea, { color: colors.textPrimary }]}
          />
          <Text style={[s.charCount, { color: colors.textTertiary }]}>{bio.length}/500</Text>
        </View>

        {/* Payout email */}
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>EMAIL DE PAIEMENT *</Text>
        <View style={[s.inputRow, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <Icon name="mail" size={16} color={colors.textTertiary} />
          <TextInput
            value={payoutEmail}
            onChangeText={setPayoutEmail}
            placeholder="adresse@email.com"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[s.input, { color: colors.textPrimary }]}
          />
        </View>
        <Text style={[s.inputHint, { color: colors.textTertiary }]}>
          Utilisée pour recevoir vos virements Stripe ou Mobile Money
        </Text>

        {/* Legal note */}
        <View style={[s.legalNote, { backgroundColor: colors.backgroundSecondary }]}>
          <Icon name="shield" size={14} color={colors.textTertiary} />
          <Text style={[s.legalText, { color: colors.textTertiary }]}>
            En soumettant cette demande, vous confirmez que votre contenu respecte les CGU GoFolyX et la législation en vigueur.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{ marginTop: 8, borderRadius: 16, overflow: 'hidden' }}
          activeOpacity={0.8}
        >
          <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Icon name="send" size={16} color="#fff" />
                  <Text style={s.submitText}>Envoyer ma demande</Text>
                </>
            }
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '700' },
  scroll:       { padding: 16 },

  requireCard:  { borderRadius: 14, padding: 16, marginBottom: 24, gap: 10 },
  requireTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  requireRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  requireIcon:  { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  requireLabel: { fontSize: 13 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },

  typesGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  typeChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, borderWidth: 1.5 },
  typeLabel:  { fontSize: 13, fontWeight: '600' },

  inputWrap:  { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 4 },
  textArea:   { fontSize: 14, lineHeight: 20, minHeight: 100, textAlignVertical: 'top' },
  charCount:  { fontSize: 11, textAlign: 'right', marginTop: 6 },

  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 6 },
  input:      { flex: 1, fontSize: 14 },
  inputHint:  { fontSize: 11, marginBottom: 24 },

  legalNote:  { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, marginBottom: 20 },
  legalText:  { flex: 1, fontSize: 12, lineHeight: 17 },

  submitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  successCircle:  { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  successTitle:   { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  successSub:     { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  successBtn:     { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  successBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
