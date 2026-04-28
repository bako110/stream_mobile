import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, Platform, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { userService } from '../../services/userService';
import type { PrivacySettings } from '../../services/userService';

interface Props { navigation: any; }

interface RowProps {
  icon:        string;
  label:       string;
  description?: string;
  color?:      string;
  value:       boolean;
  onChange:    (v: boolean) => void;
  saving?:     boolean;
  last?:       boolean;
}

const Row: React.FC<RowProps> = ({ icon, label, description, color, value, onChange, saving, last }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View style={[s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
      <View style={[s.iconWrap, { backgroundColor: (color ?? colors.primary) + '18' }]}>
        <Icon name={icon} size={18} color={color ?? colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>{label}</Text>
        {description ? <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{description}</Text> : null}
      </View>
      {saving ? (
        <ActivityIndicator size="small" color={color ?? colors.primary} style={{ marginRight: 4 }} />
      ) : (
        <Switch
          value={!!value}
          onValueChange={onChange}
          trackColor={{ false: colors.divider, true: color ?? colors.primary }}
          thumbColor="#fff"
        />
      )}
    </View>
  );
};

const DEFAULT_SETTINGS: PrivacySettings = {
  privacy_profile_public:  true,
  privacy_show_activity:   true,
  privacy_show_location:   true,
  privacy_allow_messages:  true,
  privacy_show_online:     true,
  privacy_show_phone:      false,
  privacy_show_birthday:   true,
};

function coerceBooleans(data: any): PrivacySettings {
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof PrivacySettings)[]) {
    if (key in data) result[key] = Boolean(data[key]);
  }
  return result;
}

export const PrivacyScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<keyof PrivacySettings | null>(null);
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);

  // ref pour avoir toujours les settings à jour dans les callbacks async
  const settingsRef = useRef<PrivacySettings>(DEFAULT_SETTINGS);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    userService.getPrivacy()
      .then(data => {
        const safe = coerceBooleans(data);
        setSettings(safe);
        settingsRef.current = safe;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = useCallback((field: keyof PrivacySettings) => async (val: boolean) => {
    // Utiliser settingsRef pour éviter les closures stales
    const prev = settingsRef.current;
    const next: PrivacySettings = { ...prev, [field]: val };
    setSettings(next);
    settingsRef.current = next;
    setSaving(field);
    try {
      const updated = await userService.updatePrivacy(next);
      const safe = coerceBooleans(updated);
      setSettings(safe);
      settingsRef.current = safe;
    } catch {
      setSettings(prev);
      settingsRef.current = prev;
    } finally {
      setSaving(null);
    }
  }, []);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.textPrimary }]}>Confidentialité</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, paddingTop: 20 }}>
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceElevated }} />
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ width: '55%', height: 13, borderRadius: 6, backgroundColor: colors.surfaceElevated }} />
                <View style={{ width: '75%', height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated }} />
              </View>
              <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: colors.surfaceElevated }} />
            </View>
          ))}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

          <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>VISIBILITÉ DU PROFIL</Text>
          <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            <Row
              icon="eye" label="Profil public"
              description="Tout le monde peut voir votre profil"
              value={settings.privacy_profile_public}
              saving={saving === 'privacy_profile_public'}
              onChange={toggle('privacy_profile_public')}
            />
            <Row
              icon="activity" label="Afficher l'activité"
              description="Montrer vos événements récents"
              value={settings.privacy_show_activity}
              saving={saving === 'privacy_show_activity'}
              onChange={toggle('privacy_show_activity')}
            />
            <Row
              icon="map-pin" label="Afficher la localisation"
              description="Montrer votre ville sur votre profil"
              value={settings.privacy_show_location}
              saving={saving === 'privacy_show_location'}
              onChange={toggle('privacy_show_location')}
              last
            />
          </View>

          <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>INFORMATIONS PERSONNELLES</Text>
          <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            <Row
              icon="phone" label="Afficher le téléphone"
              description="Visible sur votre profil public"
              color="#10B981"
              value={settings.privacy_show_phone}
              saving={saving === 'privacy_show_phone'}
              onChange={toggle('privacy_show_phone')}
            />
            <Row
              icon="gift" label="Afficher la date de naissance"
              description="Visible sur votre profil public"
              color="#F59E0B"
              value={settings.privacy_show_birthday}
              saving={saving === 'privacy_show_birthday'}
              onChange={toggle('privacy_show_birthday')}
              last
            />
          </View>

          <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>COMMUNICATION</Text>
          <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            <Row
              icon="message-circle" label="Autoriser les messages"
              description="Recevoir des messages de tout le monde"
              color="#3B82F6"
              value={settings.privacy_allow_messages}
              saving={saving === 'privacy_allow_messages'}
              onChange={toggle('privacy_allow_messages')}
            />
            <Row
              icon="wifi" label="Afficher le statut en ligne"
              description="Montrer quand vous êtes connecté(e)"
              color="#7B3FF2"
              value={settings.privacy_show_online}
              saving={saving === 'privacy_show_online'}
              onChange={toggle('privacy_show_online')}
              last
            />
          </View>

        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 56, paddingBottom: 14,
    paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 18, fontWeight: '800' },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    marginBottom: 6, marginTop: 20, paddingHorizontal: 4,
  },
  section: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
