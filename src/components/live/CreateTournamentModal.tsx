/**
 * CreateTournamentModal — formulaire complet de creation de tournoi : type de
 * bracket, banniere, description, format, visibilite (prive + mot de passe),
 * mode d'inscription (ouvert/validation/invitation), pays/langues autorises,
 * calendrier (fuseau, ouverture/cloture inscriptions, debut prevu), regles,
 * sponsor, frais d'inscription en GoGold.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ScrollView, ActivityIndicator, Alert, Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { ImagePickerSection } from '../common/ImagePickerSection';
import { CountryMultiSelect } from '../common/CountryMultiSelect';
import { LanguageMultiSelect } from '../common/LanguageMultiSelect';
import { TimezoneSelect } from '../common/TimezoneSelect';
import { DateTimeField } from '../common/DateTimeField';
import { tournamentService } from '../../services/tournamentService';
import type { Tournament, TournamentType, TournamentRegistrationMode } from '../../services/tournamentService';

const FORMATS: Array<8 | 16 | 32 | 64> = [8, 16, 32, 64];

const TYPES: { value: TournamentType; label: string; hint: string }[] = [
  { value: 'single_elimination', label: 'Élimination directe', hint: 'Une défaite = éliminé' },
  { value: 'double_elimination', label: 'Double élimination', hint: 'Deux défaites pour être éliminé' },
  { value: 'group_stage',        label: 'Phase de groupes',    hint: 'Groupes puis bracket final' },
  { value: 'league',             label: 'Ligue',                hint: 'Tout le monde s\'affronte' },
];

const REGISTRATION_MODES: { value: TournamentRegistrationMode; label: string; hint: string }[] = [
  { value: 'open',        label: 'Ouvert',     hint: 'Rejoint directement' },
  { value: 'approval',    label: 'Validation', hint: 'Tu valides chaque demande' },
  { value: 'invite_only', label: 'Invitation', hint: 'Uniquement via code' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (tournament: Tournament) => void;
}

export const CreateTournamentModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tournamentType, setTournamentType] = useState<TournamentType>('single_elimination');
  const [format, setFormat] = useState<8 | 16 | 32 | 64>(8);
  const [prize, setPrize] = useState('');

  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [registrationMode, setRegistrationMode] = useState<TournamentRegistrationMode>('open');
  const [allowedCountries, setAllowedCountries] = useState<string[]>([]);
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>([]);

  const [timezone, setTimezone] = useState('');
  const [scheduledStartAt, setScheduledStartAt] = useState<Date | null>(null);
  const [registrationClosesAt, setRegistrationClosesAt] = useState<Date | null>(null);

  const [rules, setRules] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorLogoUrl, setSponsorLogoUrl] = useState<string | null>(null);
  const [entryFeeGogold, setEntryFeeGogold] = useState('');

  const [creating, setCreating] = useState(false);

  const reset = () => {
    setStep(0); setName(''); setDescription(''); setImageUrl(null);
    setTournamentType('single_elimination'); setFormat(8); setPrize('');
    setIsPrivate(false); setPassword(''); setRegistrationMode('open');
    setAllowedCountries([]); setAllowedLanguages([]);
    setTimezone(''); setScheduledStartAt(null); setRegistrationClosesAt(null);
    setRules(''); setSponsorName(''); setSponsorLogoUrl(null); setEntryFeeGogold('');
  };

  const close = () => { onClose(); reset(); };

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    if (isPrivate && !password.trim()) {
      Alert.alert('Mot de passe requis', 'Un tournoi privé nécessite un mot de passe.');
      return;
    }
    setCreating(true);
    try {
      const t = await tournamentService.create({
        name: name.trim(),
        format,
        imageUrl: imageUrl ?? undefined,
        prize: prize.trim() || undefined,
        tournamentType,
        description: description.trim() || undefined,
        isPrivate,
        password: isPrivate ? password.trim() : undefined,
        registrationMode,
        allowedCountries: allowedCountries.length > 0 ? allowedCountries : undefined,
        allowedLanguages: allowedLanguages.length > 0 ? allowedLanguages : undefined,
        timezone: timezone || undefined,
        scheduledStartAt: scheduledStartAt ? scheduledStartAt.toISOString() : undefined,
        registrationClosesAt: registrationClosesAt ? registrationClosesAt.toISOString() : undefined,
        rules: rules.trim() || undefined,
        sponsorName: sponsorName.trim() || undefined,
        sponsorLogoUrl: sponsorLogoUrl ?? undefined,
        entryFeeGogold: entryFeeGogold.trim() ? parseInt(entryFeeGogold, 10) : 0,
      });
      onCreated(t);
      close();
    } catch (e: any) {
      Alert.alert('Impossible de créer le tournoi', e?.response?.data?.detail ?? e?.message ?? 'Une erreur est survenue.');
    } finally {
      setCreating(false);
    }
  };

  const steps = ['Informations', 'Accès', 'Calendrier', 'Règles & sponsor'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={[s.handle, { backgroundColor: colors.divider }]} />

          <View style={s.header}>
            <Text style={[s.title, { color: colors.textPrimary }]}>Créer un tournoi</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="x" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Étapes */}
          <View style={s.stepsRow}>
            {steps.map((label, i) => (
              <TouchableOpacity key={label} style={s.stepBtn} onPress={() => setStep(i)} activeOpacity={0.8}>
                <View style={[s.stepDot, { backgroundColor: i === step ? '#9B65F5' : colors.border }]} />
                <Text style={[s.stepLabel, { color: i === step ? '#9B65F5' : colors.textTertiary }]} numberOfLines={1}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {step === 0 && (
              <View style={{ gap: 12 }}>
                <ImagePickerSection
                  folder="tournaments"
                  maxImages={1}
                  images={imageUrl ? [imageUrl] : []}
                  onImagesChange={(v) => {
                    const arr = typeof v === 'function' ? v(imageUrl ? [imageUrl] : []) : v;
                    setImageUrl(arr[0] ?? null);
                  }}
                  label="Bannière"
                  hint="Image de couverture du tournoi"
                  colors={colors}
                />

                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Nom du tournoi"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                  maxLength={200}
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Description (optionnel)"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.input, s.inputMulti, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                  multiline
                  maxLength={1000}
                />

                <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>TYPE DE TOURNOI</Text>
                <View style={{ gap: 8 }}>
                  {TYPES.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      onPress={() => setTournamentType(t.value)}
                      style={[
                        s.typeRow,
                        { borderColor: tournamentType === t.value ? '#9B65F5' : colors.border, backgroundColor: tournamentType === t.value ? '#9B65F518' : colors.backgroundSecondary },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.typeLabel, { color: colors.textPrimary }]}>{t.label}</Text>
                        <Text style={[s.typeHint, { color: colors.textTertiary }]}>{t.hint}</Text>
                      </View>
                      {tournamentType === t.value && <Icon name="check-circle" size={18} color="#9B65F5" />}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>NOMBRE DE PARTICIPANTS</Text>
                <View style={s.formatRow}>
                  {FORMATS.map(f => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setFormat(f)}
                      style={[
                        s.formatChip,
                        { borderColor: format === f ? '#9B65F5' : colors.border, backgroundColor: format === f ? '#9B65F522' : colors.backgroundSecondary },
                      ]}
                    >
                      <Text style={{ color: format === f ? '#9B65F5' : colors.textSecondary, fontWeight: '700' }}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  value={prize}
                  onChangeText={setPrize}
                  placeholder="Récompense (ex: 500 GoGold)"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                  maxLength={200}
                />
              </View>
            )}

            {step === 1 && (
              <View style={{ gap: 12 }}>
                <View style={[s.switchRow, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.typeLabel, { color: colors.textPrimary }]}>Tournoi privé</Text>
                    <Text style={[s.typeHint, { color: colors.textTertiary }]}>Nécessite un mot de passe pour rejoindre</Text>
                  </View>
                  <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: '#9B65F5' }} />
                </View>
                {isPrivate && (
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Mot de passe du tournoi"
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry
                    style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                  />
                )}

                <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>MODE D'INSCRIPTION</Text>
                <View style={{ gap: 8 }}>
                  {REGISTRATION_MODES.map(m => (
                    <TouchableOpacity
                      key={m.value}
                      onPress={() => setRegistrationMode(m.value)}
                      style={[
                        s.typeRow,
                        { borderColor: registrationMode === m.value ? '#9B65F5' : colors.border, backgroundColor: registrationMode === m.value ? '#9B65F518' : colors.backgroundSecondary },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.typeLabel, { color: colors.textPrimary }]}>{m.label}</Text>
                        <Text style={[s.typeHint, { color: colors.textTertiary }]}>{m.hint}</Text>
                      </View>
                      {registrationMode === m.value && <Icon name="check-circle" size={18} color="#9B65F5" />}
                    </TouchableOpacity>
                  ))}
                </View>
                {registrationMode === 'invite_only' && (
                  <Text style={[s.typeHint, { color: colors.textTertiary }]}>
                    Un code d'invitation sera généré automatiquement à la création.
                  </Text>
                )}

                <CountryMultiSelect
                  selectedCodes={allowedCountries}
                  onChange={setAllowedCountries}
                  placeholder="Pays autorisés — vide = tous"
                />
                <LanguageMultiSelect
                  selectedCodes={allowedLanguages}
                  onChange={setAllowedLanguages}
                  placeholder="Langues autorisées — vide = toutes"
                />

                <TextInput
                  value={entryFeeGogold}
                  onChangeText={v => setEntryFeeGogold(v.replace(/[^0-9]/g, ''))}
                  placeholder="Frais d'inscription en GoGold (0 = gratuit)"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                />
              </View>
            )}

            {step === 2 && (
              <View style={{ gap: 12 }}>
                <TimezoneSelect
                  value={timezone}
                  onChange={setTimezone}
                  placeholder="Sélectionner un fuseau horaire"
                />
                <DateTimeField
                  label="Fin des inscriptions"
                  value={registrationClosesAt}
                  onChange={setRegistrationClosesAt}
                  placeholder="Sélectionner date et heure"
                />
                <DateTimeField
                  label="Début des matchs prévu"
                  value={scheduledStartAt}
                  onChange={setScheduledStartAt}
                  placeholder="Sélectionner date et heure"
                />
                <Text style={[s.typeHint, { color: colors.textTertiary }]}>
                  Des rappels seront envoyés aux participants avant chaque étape clé.
                </Text>
              </View>
            )}

            {step === 3 && (
              <View style={{ gap: 12 }}>
                <TextInput
                  value={rules}
                  onChangeText={setRules}
                  placeholder="Règlement du tournoi (optionnel)"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.input, s.inputMulti, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                  multiline
                  maxLength={2000}
                />
                <TextInput
                  value={sponsorName}
                  onChangeText={setSponsorName}
                  placeholder="Nom du sponsor (optionnel)"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                  maxLength={150}
                />
                <ImagePickerSection
                  folder="tournaments"
                  maxImages={1}
                  images={sponsorLogoUrl ? [sponsorLogoUrl] : []}
                  onImagesChange={(v) => {
                    const arr = typeof v === 'function' ? v(sponsorLogoUrl ? [sponsorLogoUrl] : []) : v;
                    setSponsorLogoUrl(arr[0] ?? null);
                  }}
                  label="Logo du sponsor"
                  colors={colors}
                />
              </View>
            )}
          </ScrollView>

          <View style={s.actions}>
            {step > 0 && (
              <TouchableOpacity style={[s.actionBtn, { borderColor: colors.border }]} onPress={() => setStep(s0 => s0 - 1)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Retour</Text>
              </TouchableOpacity>
            )}
            {step < steps.length - 1 ? (
              <TouchableOpacity
                style={[s.actionBtn, s.actionBtnPrimary, !name.trim() && step === 0 && { opacity: 0.5 }]}
                onPress={() => setStep(s0 => s0 + 1)}
                disabled={step === 0 && !name.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Suivant</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.actionBtn, s.actionBtnPrimary, (!name.trim() || creating) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!name.trim() || creating}
              >
                {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Créer</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800' },

  stepsRow: { flexDirection: 'row', marginBottom: 16, gap: 6 },
  stepBtn: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center' },

  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 4 },

  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  typeLabel: { fontSize: 14, fontWeight: '700' },
  typeHint: { fontSize: 11, marginTop: 2 },

  formatRow: { flexDirection: 'row', gap: 8 },
  formatChip: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  actionBtnPrimary: { backgroundColor: '#9B65F5', borderWidth: 0 },
});
