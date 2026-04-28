/**
 * EditProfileScreen — modifier son profil
 * - Avatar / Banner (via image picker)
 * - Champs : display_name, username, bio, location, website, phone
 * - Sauvegarde via userService.updateMe
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonEditProfile } from '../../components/common';
import { useUser } from '../../context/UserContext';
import { authService } from '../../services/authService';
import { userService } from '../../services/userService';
import { uploadService } from '../../services/uploadService';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import type { User, UserUpdate } from '../../types';

interface Props {
  navigation: any;
}

export const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { refreshUser } = useUser();

  const [user, setUser]             = useState<User | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername]     = useState('');
  const [bio, setBio]               = useState('');
  const [location, setLocation]     = useState('');
  const [website, setWebsite]       = useState('');
  const [phone, setPhone]           = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender]         = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    refreshUser().then(me => {
      if (!me) return;
      setUser(me);
      setFirstName(me.first_name ?? '');
      setLastName(me.last_name ?? '');
      setDisplayName(me.display_name ?? '');
      setUsername(me.username ?? '');
      setBio(me.bio ?? '');
      setLocation(me.location ?? '');
      setWebsite(me.website ?? '');
      setPhone(me.phone ?? '');
      setDateOfBirth(me.date_of_birth ?? '');
      setGender(me.gender ?? '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const pickAvatar = async () => {
    try {
      setAvatarUploading(true);
      const result = await uploadService.pickAndUpload('avatars', 1);
      if (result.assets.length > 0) {
        await userService.updateMe({ avatar_url: result.assets[0].url });
        const me = await refreshUser();
        if (me) setUser(me);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Upload avatar');
    } finally { setAvatarUploading(false); }
  };

  const pickBanner = async () => {
    try {
      const result = await uploadService.pickAndUpload('avatars', 1);
      if (result.assets.length > 0) {
        await userService.updateMe({ banner_url: result.assets[0].url });
        const me = await refreshUser();
        if (me) setUser(me);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Upload bannière');
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
      Alert.alert('Erreur', 'Le username est requis');
      return;
    }
    setSaving(true);
    try {
      const data: UserUpdate = {
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        display_name: displayName.trim() || undefined,
        username: username.trim() || undefined,
        bio: bio.trim() || undefined,
        location: location.trim() || undefined,
        website: website.trim() || undefined,
        phone: phone.trim() || undefined,
        date_of_birth: dateOfBirth.trim() || undefined,
        gender: (gender.trim() as any) || undefined,
      };
      await userService.updateMe(data);
      const me = await refreshUser();
      if (me) setUser(me);
      Alert.alert('Succès', 'Profil mis à jour', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Mise à jour échouée');
    } finally { setSaving(false); }
  };

  const initials = (user?.display_name ?? user?.username ?? '?')[0]?.toUpperCase() ?? '?';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Modifier le profil</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerBtn}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="check" size={22} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <SkeletonEditProfile />
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Banner */}
        <TouchableOpacity onPress={pickBanner} activeOpacity={0.7}>
          <View style={styles.bannerWrap}>
            {user?.banner_url ? (
              <Image source={{ uri: user.banner_url }} style={styles.banner} />
            ) : (
              <View style={[styles.banner, { backgroundColor: colors.surfaceElevated }]}>
                <Icon name="image" size={32} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.bannerOverlay}>
              <Icon name="camera" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, marginLeft: 4 }}>Changer</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.7}>
            <View style={[styles.avatarRing, { borderColor: colors.background }]}>
              {avatarUploading ? (
                <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceElevated }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarInitial}>{initials}</Text>
                </View>
              )}
            </View>
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
              <Icon name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Fields */}
        <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 16 }}>
          <Field label="Prénom" value={firstName} onChange={setFirstName} colors={colors} placeholder="Votre prénom" icon="user" />
          <Field label="Nom" value={lastName} onChange={setLastName} colors={colors} placeholder="Votre nom" icon="user" />
          <Field label="Nom d'affichage" value={displayName} onChange={setDisplayName} colors={colors} placeholder="Comment tu apparais" />
          <Field label="Username" value={username} onChange={setUsername} colors={colors} placeholder="@username" autoCapitalize="none" />
          <Field label="Bio" value={bio} onChange={setBio} colors={colors} placeholder="Parle de toi..." multiline />
          <Field label="Localisation" value={location} onChange={setLocation} colors={colors} placeholder="Ville, Pays" icon="map-pin" />
          <Field label="Site web" value={website} onChange={setWebsite} colors={colors} placeholder="https://..." icon="external-link" autoCapitalize="none" />
          <Field label="Téléphone" value={phone} onChange={setPhone} colors={colors} placeholder="+33..." icon="phone" keyboardType="phone-pad" />
          {/* Date de naissance — calendar picker */}
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTertiary, marginBottom: 4 }}>Date de naissance</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.surfaceElevated, borderRadius: 10, paddingHorizontal: 12,
                minHeight: 44, borderWidth: 1, borderColor: colors.border,
              }}
              activeOpacity={0.7}
            >
              <Icon name="gift" size={16} color={colors.textTertiary} />
              <Text style={{ flex: 1, fontSize: 14, color: dateOfBirth ? colors.textPrimary : colors.textDisabled, paddingVertical: 10 }}>
                {dateOfBirth
                  ? new Date(dateOfBirth).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Sélectionner une date'}
              </Text>
              <Icon name="calendar" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
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
                }
              }}
            />
          )}

          {/* Gender selector */}
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTertiary, marginBottom: 8 }}>Genre</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { key: 'male', label: 'Homme' },
                { key: 'female', label: 'Femme' },
                { key: 'other', label: 'Autre' },
                { key: 'prefer_not_to_say', label: 'Non précisé' },
              ].map(opt => {
                const selected = gender === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setGender(selected ? '' : opt.key)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                      backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                      borderWidth: 1, borderColor: selected ? colors.primary : colors.border,
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : colors.textPrimary }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
};

// ── Field helper ──────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: any;
  placeholder?: string;
  icon?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: any;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, colors, placeholder, icon, multiline, autoCapitalize, keyboardType }) => (
  <View>
    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTertiary, marginBottom: 4 }}>{label}</Text>
    <View style={{
      flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 8,
      backgroundColor: colors.surfaceElevated, borderRadius: 10, paddingHorizontal: 12,
      paddingVertical: multiline ? 10 : 0, minHeight: 44, borderWidth: 1, borderColor: colors.border,
    }}>
      {icon && <Icon name={icon as any} size={16} color={colors.textTertiary} style={{ marginTop: multiline ? 4 : 0 }} />}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        style={{ flex: 1, fontSize: 14, color: colors.textPrimary, paddingVertical: multiline ? 0 : 10, minHeight: multiline ? 80 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
      />
    </View>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  bannerWrap: { height: 150, position: 'relative' },
  banner: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  bannerOverlay: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },

  avatarSection: { alignItems: 'center', marginTop: -40 },
  avatarRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, overflow: 'hidden' },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 24, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: -4, width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
});
