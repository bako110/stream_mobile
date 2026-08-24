/**
 * SettingsCallsPrivacyScreen — confidentialité et réglages des appels.
 * "Qui peut m'appeler" est un vrai filtre serveur (call_privacy sur User),
 * distinct du système de demandes de conversation qui ne couvre que la
 * messagerie — vérifié côté backend avant même de router l'offre d'appel
 * (cf. le handler "call_offer" dans routers/messages.py).
 */
import React, { useCallback, useState } from 'react';
import { View, ScrollView, Switch, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { userService } from '../../services/userService';
import type { PrivacySettings, CallPrivacy } from '../../services/userService';
import { callHistoryService } from '../../services/callHistoryService';
import { Row, Card, PageHeader } from './_shared';
import { GoFolyXLoader } from '../../components/common';
import { toastService, showConfirm } from '../../services';

type CallPrefs = Pick<PrivacySettings, 'call_privacy' | 'call_e2e_encryption' | 'call_silence_unknown'>;

const DEFAULTS: CallPrefs = {
  call_privacy:         'everyone',
  call_e2e_encryption:  true,
  call_silence_unknown: false,
};

const CALL_PRIVACY_OPTIONS: { value: CallPrivacy; label: string; icon: string }[] = [
  { value: 'everyone',  label: 'Tout le monde',       icon: 'globe' },
  { value: 'followers', label: 'Abonnements uniquement', icon: 'users' },
  { value: 'none',      label: 'Personne',            icon: 'slash' },
];

export const SettingsCallsPrivacyScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [prefs, setPrefs]     = useState<CallPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [saving, setSaving]   = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    userService.getPrivacy()
      .then(p => {
        if (cancelled) return;
        setPrefs({
          call_privacy:         p.call_privacy         ?? 'everyone',
          call_e2e_encryption:  p.call_e2e_encryption   ?? true,
          call_silence_unknown: p.call_silence_unknown  ?? false,
        });
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []));

  const save = useCallback(async (patch: Partial<CallPrefs>, savingKey: string) => {
    if (saving) return;
    const prevPrefs = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(savingKey);
    try {
      await userService.updatePrivacy(next as PrivacySettings);
    } catch {
      setPrefs(prevPrefs);
      toastService.error('Erreur', 'Impossible de sauvegarder la préférence.');
    } finally {
      setSaving(null);
    }
  }, [prefs, saving]);

  const toggle = useCallback((field: 'call_e2e_encryption' | 'call_silence_unknown') => {
    save({ [field]: !prefs[field] }, field);
  }, [prefs, save]);

  const handleClearHistory = useCallback(() => {
    showConfirm(
      "Vider l'historique",
      "Supprimer tout l'historique des appels ? Cette action est irréversible.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider', style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await callHistoryService.clear();
              toastService.success('Historique vidé');
            } catch {
              toastService.error('Erreur', "Impossible de vider l'historique.");
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  }, []);

  const sw = (field: 'call_e2e_encryption' | 'call_silence_unknown') => (
    <Switch
      value={!!prefs[field]}
      onValueChange={() => toggle(field)}
      disabled={!!saving}
      trackColor={{ false: colors.divider ?? '#ccc', true: colors.primary }}
      thumbColor="#fff"
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Confidentialité des appels" onBack={() => nav.goBack()} />

      {loading ? (
        <GoFolyXLoader fullScreen color={colors.primary} />
      ) : error ? (
        <View style={st.centered}>
          <Text style={[st.errorText, { color: colors.textTertiary }]}>
            Impossible de charger les préférences.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* Qui peut m'appeler */}
          <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>QUI PEUT M'APPELER</Text>
          <Card>
            {CALL_PRIVACY_OPTIONS.map((opt, i) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => save({ call_privacy: opt.value }, 'call_privacy')}
                disabled={!!saving}
                style={[
                  st.optionRow,
                  i < CALL_PRIVACY_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                ]}
                activeOpacity={0.7}
              >
                <View style={[st.iconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Icon name={opt.icon} size={17} color={colors.primary} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>{opt.label}</Text>
                {prefs.call_privacy === opt.value && <Icon name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </Card>

          {/* Anti-spam — n'a d'effet que si call_privacy = everyone */}
          {prefs.call_privacy === 'everyone' && (
            <Card>
              <Row icon="bell-off" label="Sourdine pour les inconnus"
                value="Les appels de comptes que vous ne suivez pas sonnent en silencieux"
                right={sw('call_silence_unknown')} last />
            </Card>
          )}

          {/* Chiffrement */}
          <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>SÉCURITÉ</Text>
          <Card>
            <Row icon="lock" label="Chiffrement de bout en bout"
              value="Vos appels sont chiffrés, personne d'autre ne peut les écouter"
              right={sw('call_e2e_encryption')} last />
          </Card>

          {/* Historique */}
          <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>HISTORIQUE</Text>
          <Card>
            <Row icon="trash-2" label="Vider l'historique des appels"
              danger onPress={clearing ? undefined : handleClearHistory} last />
          </Card>

        </ScrollView>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  scroll:      { padding: 16, gap: 8, paddingBottom: 40 },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:   { fontSize: 14, textAlign: 'center' },
  sectionLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 8, marginLeft: 4 },
  optionRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  iconWrap:    { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
