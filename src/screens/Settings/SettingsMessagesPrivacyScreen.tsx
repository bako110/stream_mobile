/**
 * SettingsMessagesPrivacyScreen — confidentialité de la messagerie.
 * "Qui peut m'écrire en premier" n'a volontairement PAS de réglage ici : ce
 * cas est déjà géré par le système de demandes de conversation par paire
 * (ConversationRequest, cf. conversation_request_service.py côté backend) —
 * n'importe qui peut envoyer un premier message, qui reste en attente tant
 * que le destinataire n'a pas répondu/accepté/bloqué.
 */
import React, { useCallback, useState } from 'react';
import { View, ScrollView, Switch, StyleSheet, Text } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { userService } from '../../services/userService';
import type { PrivacySettings } from '../../services/userService';
import { Row, Card, PageHeader } from './_shared';
import { GofolyxLoader } from '../../components/common';
import { toastService } from '../../services';

const DEFAULTS: Pick<PrivacySettings, 'privacy_show_online' | 'privacy_read_receipts' | 'privacy_show_typing'> = {
  privacy_show_online:   true,
  privacy_read_receipts: true,
  privacy_show_typing:   true,
};

export const SettingsMessagesPrivacyScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [prefs, setPrefs]     = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [saving, setSaving]   = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    userService.getPrivacy()
      .then(p => {
        if (cancelled) return;
        setPrefs({
          privacy_show_online:   p.privacy_show_online   ?? true,
          privacy_read_receipts: p.privacy_read_receipts ?? true,
          privacy_show_typing:   p.privacy_show_typing   ?? true,
        });
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []));

  const toggle = useCallback(async (field: keyof typeof DEFAULTS) => {
    if (saving) return;
    const newVal = !prefs[field];
    setPrefs(prev => ({ ...prev, [field]: newVal }));
    setSaving(field);
    try {
      await userService.updatePrivacy({ ...prefs, [field]: newVal } as PrivacySettings);
    } catch {
      setPrefs(prev => ({ ...prev, [field]: !newVal }));
      toastService.error('Erreur', 'Impossible de sauvegarder la préférence.');
    } finally {
      setSaving(null);
    }
  }, [prefs, saving]);

  const sw = (field: keyof typeof DEFAULTS) => (
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
      <PageHeader title="Confidentialité des messages" onBack={() => nav.goBack()} />

      {loading ? (
        <GofolyxLoader fullScreen color={colors.primary} />
      ) : error ? (
        <View style={st.centered}>
          <Text style={[st.errorText, { color: colors.textTertiary }]}>
            Impossible de charger les préférences.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <Card>
            <Row icon="check-circle" label="Accusés de lecture"
              value="Les autres voient quand vous avez lu leurs messages"
              right={sw('privacy_read_receipts')} />
            <Row icon="circle" label="Statut en ligne"
              value="Visible par les autres quand vous êtes connecté"
              right={sw('privacy_show_online')} />
            <Row icon="edit-3" label="En train d'écrire…"
              value="Visible pendant que vous rédigez un message"
              right={sw('privacy_show_typing')} last />
          </Card>

          <Text style={[st.note, { color: colors.textTertiary }]}>
            Désactiver les accusés de lecture masque aussi les accusés de lecture des autres pour vous.
          </Text>
        </ScrollView>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  scroll:    { padding: 16, gap: 12, paddingBottom: 40 },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, textAlign: 'center' },
  note:      { fontSize: 12, paddingHorizontal: 4, lineHeight: 17 },
});
