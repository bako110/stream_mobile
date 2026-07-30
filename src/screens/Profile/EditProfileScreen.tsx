/**
 * EditProfileScreen — modifier son profil
 * - Avatar / Banner (via image picker)
 * - Sections : Photos, Informations personnelles, À propos, Contact
 * - Sauvegarde via userService.updateMe (display_name recalculé depuis prénom/nom)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, SkeletonEditProfile, GoFolyXLoader } from '../../components/common';
import { toastService, showConfirm } from '../../services';
import { useUser } from '../../context/UserContext';
import { userService } from '../../services/userService';
import { uploadService } from '../../services/uploadService';
import type { User, UserUpdate } from '../../types';

interface Props {
  navigation: any;
}

const GENDER_OPTIONS = [
  { key: 'male', label: 'Homme' },
  { key: 'female', label: 'Femme' },
  { key: 'other', label: 'Autre' },
  { key: 'prefer_not_to_say', label: 'Non précisé' },
];

export const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { refreshUser, setCurrentUser } = useUser();

  const [user, setUser]             = useState<User | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [username, setUsername]     = useState('');
  const [bio, setBio]               = useState('');
  const [location, setLocation]     = useState('');
  const [website, setWebsite]       = useState('');
  const [phone, setPhone]           = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender]         = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    refreshUser().then(me => {
      if (!me) return;
      setUser(me);
      setFirstName(me.first_name ?? '');
      setLastName(me.last_name ?? '');
      setUsername(me.username ?? '');
      setBio(me.bio ?? '');
      setLocation(me.location ?? '');
      setWebsite(me.website ?? '');
      setPhone(me.phone ?? '');
      setDateOfBirth(me.date_of_birth ?? '');
      setGender(me.gender ?? '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleAvatar = () => {
    const options: { text: string; onPress: () => void; style?: 'destructive' | 'cancel' | 'default' }[] = [
      {
        text: 'Changer la photo',
        onPress: async () => {
          try {
            setAvatarUploading(true);
            const result = await uploadService.pickAndUpload('avatars', 1);
            if (result.assets.length > 0) {
              const updated = await userService.updateMe({ avatar_url: result.assets[0].url });
              setUser(updated);
              setCurrentUser(updated);
            }
          } catch (e: any) {
            toastService.error('Erreur', e?.message ?? 'Upload avatar');
          } finally { setAvatarUploading(false); }
        },
      },
    ];
    if (user?.avatar_url) {
      options.push({
        text: 'Supprimer la photo',
        style: 'destructive',
        onPress: async () => {
          try {
            setAvatarUploading(true);
            const updated = await userService.updateMe({ avatar_url: null } as any);
            setUser(updated);
            setCurrentUser(updated);
          } catch (e: any) {
            toastService.error('Erreur', e?.message ?? 'Suppression échouée');
          } finally { setAvatarUploading(false); }
        },
      });
    }
    showConfirm('Photo de profil', undefined, [
      ...options,
      { text: 'Annuler', style: 'cancel', onPress: () => {} },
    ]);
  };

  const handleBanner = () => {
    const options: { text: string; onPress: () => void; style?: 'destructive' | 'cancel' | 'default' }[] = [
      {
        text: 'Changer la couverture',
        onPress: async () => {
          try {
            setBannerUploading(true);
            const result = await uploadService.pickAndUpload('avatars', 1);
            if (result.assets.length > 0) {
              const updated = await userService.updateMe({ banner_url: result.assets[0].url });
              setUser(updated);
              setCurrentUser(updated);
            }
          } catch (e: any) {
            toastService.error('Erreur', e?.message ?? 'Upload bannière');
          } finally { setBannerUploading(false); }
        },
      },
    ];
    if (user?.banner_url) {
      options.push({
        text: 'Supprimer la couverture',
        style: 'destructive',
        onPress: async () => {
          try {
            setBannerUploading(true);
            const updated = await userService.updateMe({ banner_url: null } as any);
            setUser(updated);
            setCurrentUser(updated);
          } catch (e: any) {
            toastService.error('Erreur', e?.message ?? 'Suppression échouée');
          } finally { setBannerUploading(false); }
        },
      });
    }
    showConfirm('Photo de couverture', undefined, [
      ...options,
      { text: 'Annuler', style: 'cancel', onPress: () => {} },
    ]);
  };

  const handleSave = async () => {
    if (!username.trim()) {
      toastService.error('Erreur', 'Le username est requis');
      return;
    }
    if (!firstName.trim() && !lastName.trim()) {
      toastService.error('Erreur', 'Renseigne au moins ton prénom ou ton nom');
      return;
    }
    setSaving(true);
    try {
      // display_name n'est plus un champ éditable directement — recalculé ici
      // à partir de prénom/nom, comme à l'inscription (voir auth_service.py:69),
      // pour ne garder qu'une seule source de vérité côté formulaire.
      const computedDisplayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      const data: UserUpdate = {
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        display_name: computedDisplayName || undefined,
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
      showConfirm('Succès', 'Profil mis à jour', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? 'Mise à jour échouée');
    } finally { setSaving(false); }
  };

  const initials = (user?.display_name ?? user?.username ?? '?')[0]?.toUpperCase() ?? '?';
  const bioLength = bio.length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ══ HEADER ══ */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Modifier le profil</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtnWrap} activeOpacity={0.85}>
          <LinearGradient
            colors={saving ? [colors.textDisabled, colors.textDisabled] : [colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.saveBtn}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnTxt}>Enregistrer</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {loading ? (
        <SkeletonEditProfile />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          {/* ══ PHOTOS — banner + avatar ══ */}
          <TouchableOpacity onPress={handleBanner} activeOpacity={0.85}>
            <View style={styles.bannerWrap}>
              {bannerUploading ? (
                <View style={[styles.banner, { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}>
                  <GoFolyXLoader color={colors.primary} />
                </View>
              ) : user?.banner_url ? (
                <Image source={{ uri: user.banner_url }} style={styles.banner} resizeMode="cover" />
              ) : (
                <LinearGradient
                  colors={[colors.gradientStart + '30', colors.gradientEnd + '20']}
                  style={[styles.banner, { alignItems: 'center', justifyContent: 'center' }]}
                >
                  <Icon name="image" size={26} color={colors.textTertiary} />
                  <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 6, fontWeight: '600' }}>Ajouter une couverture</Text>
                </LinearGradient>
              )}
              <View pointerEvents="none" style={styles.bannerFade} />
              {!bannerUploading && (
                <View style={[styles.bannerBadge, { borderColor: colors.background }]}>
                  <Icon name="camera" size={13} color="#fff" />
                </View>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={handleAvatar} activeOpacity={0.85}>
              <View style={[styles.avatarRing, { borderColor: colors.background, backgroundColor: colors.background }]}>
                {avatarUploading ? (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceElevated }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : user?.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
                ) : (
                  <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>{initials}</Text>
                  </LinearGradient>
                )}
              </View>
              <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
                <Icon name="camera" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>

          {/* ══ INFORMATIONS PERSONNELLES ══ */}
          <Animated.View entering={FadeInDown.duration(260).delay(40)}>
            <Section title="Informations personnelles" icon="user" colors={colors}>
              <FieldRow>
                <Field label="Prénom" value={firstName} onChange={setFirstName} colors={colors} placeholder="Prénom" style={{ flex: 1 }} />
                <Field label="Nom" value={lastName} onChange={setLastName} colors={colors} placeholder="Nom" style={{ flex: 1 }} />
              </FieldRow>
              <Field label="Username" value={username} onChange={setUsername} colors={colors} placeholder="username" icon="at-sign" autoCapitalize="none" />
              <View>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>Bio</Text>
                  <Text style={[styles.charCount, { color: bioLength > 1000 ? colors.error : colors.textDisabled }]}>{bioLength}/1000</Text>
                </View>
                <FieldInput value={bio} onChange={setBio} colors={colors} placeholder="Parle de toi en quelques mots…" multiline maxLength={1000} />
              </View>
            </Section>
          </Animated.View>

          {/* ══ À PROPOS ══ */}
          <Animated.View entering={FadeInDown.duration(260).delay(90)}>
            <Section title="À propos" icon="info" colors={colors}>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.textTertiary, marginBottom: 6 }]}>Date de naissance</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={[styles.inputWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Icon name="gift" size={16} color={colors.textTertiary} />
                  <Text style={{ flex: 1, fontSize: 14, color: dateOfBirth ? colors.textPrimary : colors.textDisabled, paddingVertical: 12 }}>
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

              <View>
                <Text style={[styles.fieldLabel, { color: colors.textTertiary, marginBottom: 8 }]}>Genre</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {GENDER_OPTIONS.map(opt => {
                    const selected = gender === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => setGender(selected ? '' : opt.key)}
                        activeOpacity={0.8}
                        style={{ flex: 1 }}
                      >
                        {selected ? (
                          <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.genderPill}>
                            <Text style={styles.genderTxtActive}>{opt.label}</Text>
                          </LinearGradient>
                        ) : (
                          <View style={[styles.genderPill, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }]}>
                            <Text style={[styles.genderTxt, { color: colors.textSecondary }]}>{opt.label}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </Section>
          </Animated.View>

          {/* ══ CONTACT ══ */}
          <Animated.View entering={FadeInDown.duration(260).delay(140)}>
            <Section title="Contact" icon="mail" colors={colors}>
              <Field label="Localisation" value={location} onChange={setLocation} colors={colors} placeholder="Ville, Pays" icon="map-pin" />
              <Field label="Site web" value={website} onChange={setWebsite} colors={colors} placeholder="https://..." icon="link" autoCapitalize="none" />
              <Field label="Téléphone" value={phone} onChange={setPhone} colors={colors} placeholder="+33 6 12 34 56 78" icon="phone" keyboardType="phone-pad" />
            </Section>
          </Animated.View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
};

// ── Section — bloc titré avec icône, regroupe des champs liés ────────────────

const Section: React.FC<{ title: string; icon: string; colors: any; children: React.ReactNode }> = ({ title, icon, colors, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconWrap, { backgroundColor: colors.primary + '18' }]}>
        <Icon name={icon as any} size={13} color={colors.primary} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
    <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
      {children}
    </View>
  </View>
);

const FieldRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>
);

// ── Field / FieldInput — input avec vrai état focus (bordure + fond qui réagissent) ──

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: any;
  placeholder?: string;
  icon?: string;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: any;
  style?: any;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, colors, style, ...rest }) => (
  <View style={style}>
    <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>{label}</Text>
    <FieldInput value={value} onChange={onChange} colors={colors} {...rest} />
  </View>
);

const FieldInput: React.FC<Omit<FieldProps, 'label' | 'style'> & { multiline?: boolean; maxLength?: number }> = ({
  value, onChange, colors, placeholder, icon, autoCapitalize, keyboardType, multiline, maxLength,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[
      styles.inputWrap,
      { backgroundColor: colors.surfaceElevated, borderColor: focused ? colors.primary : colors.border },
      focused && { borderWidth: 1.5, shadowColor: colors.primary, shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: focused ? 2 : 0 },
      multiline && { alignItems: 'flex-start', paddingVertical: 10, minHeight: 90 },
    ]}>
      {icon && <Icon name={icon as any} size={16} color={focused ? colors.primary : colors.textTertiary} style={{ marginTop: multiline ? 3 : 0 }} />}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        style={{
          flex: 1, fontSize: 14.5, color: colors.textPrimary,
          paddingVertical: multiline ? 0 : 12, minHeight: multiline ? 70 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800' },
  saveBtnWrap: { borderRadius: 20, overflow: 'hidden' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
  saveBtnTxt: { color: '#fff', fontSize: 13.5, fontWeight: '800' },

  bannerWrap: { height: 140, position: 'relative' },
  banner: { width: '100%', height: '100%' },
  bannerFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 44, backgroundColor: 'rgba(0,0,0,0.18)' },
  bannerBadge: {
    position: 'absolute', bottom: 10, right: 12, width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },

  avatarSection: { alignItems: 'center', marginTop: -38 },
  avatarRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, overflow: 'hidden' },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarFallback: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 26, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: -2, width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5,
  },

  section: { marginTop: 22, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionIconWrap: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionCard: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 16 },

  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', marginBottom: 6 },
  charCount: { fontSize: 11, fontWeight: '600' },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderRadius: 12, paddingHorizontal: 13, minHeight: 46, borderWidth: 1,
  },

  genderPill: { paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  genderTxt: { fontSize: 12, fontWeight: '700' },
  genderTxtActive: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
