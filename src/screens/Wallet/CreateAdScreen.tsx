/**
 * CreateAdScreen — Créer ou modifier une campagne publicitaire.
 * Accessible depuis AdsScreen.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { adService, type Ad, type AdPlacement, type AdFormat } from '../../services/adService';

const PLACEMENTS: { key: AdPlacement; label: string; icon: string; desc: string }[] = [
  { key: 'feed',    label: 'Feed principal', icon: 'home',       desc: '1 pub toutes les 7 cartes' },
  { key: 'reels',   label: 'Reels',          icon: 'film',       desc: 'Entre les reels' },
  { key: 'stories', label: 'Stories',        icon: 'circle',     desc: 'Entre les stories' },
  { key: 'search',  label: 'Recherche',      icon: 'search',     desc: 'Dans les résultats' },
];

const FORMATS: { key: AdFormat; label: string; icon: string }[] = [
  { key: 'native', label: 'Natif',  icon: 'layout'     },
  { key: 'image',  label: 'Image',  icon: 'image'      },
  { key: 'video',  label: 'Vidéo',  icon: 'video'      },
];

const CPM_OPTIONS = [
  { value: 1.0,  label: '1.00€', desc: 'Économique' },
  { value: 2.0,  label: '2.00€', desc: 'Standard' },
  { value: 5.0,  label: '5.00€', desc: 'Premium' },
  { value: 10.0, label: '10.00€', desc: 'Top' },
];

export const CreateAdScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const existingAd: Ad | null = route.params?.ad ?? null;
  const isEdit = !!existingAd;

  const [title,        setTitle]        = useState(existingAd?.title ?? '');
  const [description,  setDescription]  = useState(existingAd?.description ?? '');
  const [ctaText,      setCtaText]      = useState(existingAd?.cta_text ?? 'En savoir plus');
  const [ctaUrl,       setCtaUrl]       = useState(existingAd?.cta_url ?? '');
  const [creativeUrl,  setCreativeUrl]  = useState(existingAd?.creative_url ?? '');
  const [placement,    setPlacement]    = useState<AdPlacement>(existingAd?.placement ?? 'feed');
  const [format,       setFormat]       = useState<AdFormat>(existingAd?.format ?? 'native');
  const [budgetEur,    setBudgetEur]    = useState(existingAd ? String(existingAd.budget_eur) : '10');
  const [cpmEur,       setCpmEur]       = useState(existingAd ? existingAd.cpm_eur : 2.0);
  const [saving,       setSaving]       = useState(false);

  // Estimation impressions
  const budget = parseFloat(budgetEur) || 0;
  const estimatedImpressions = cpmEur > 0 ? Math.round((budget / cpmEur) * 1000) : 0;

  const handleSave = useCallback(async () => {
    if (!title.trim())  { Alert.alert('Erreur', 'Le titre est requis.'); return; }
    if (budget < 1)     { Alert.alert('Erreur', 'Budget minimum : 1 €'); return; }
    if (ctaUrl && !ctaUrl.startsWith('http')) {
      Alert.alert('Erreur', 'L\'URL doit commencer par http:// ou https://');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title:        title.trim(),
        description:  description.trim() || undefined,
        cta_text:     ctaText.trim() || undefined,
        cta_url:      ctaUrl.trim() || undefined,
        creative_url: creativeUrl.trim() || undefined,
        placement,
        format,
        budget_eur:   budget,
        cpm_eur:      cpmEur,
      };

      if (isEdit) {
        await adService.update(existingAd!.id, payload);
        Alert.alert('Modifié', 'Ta campagne a été mise à jour.');
      } else {
        await adService.create(payload);
        Alert.alert(
          'Campagne créée !',
          'Ta pub est maintenant active et sera diffusée dans le feed.',
        );
      }
      nav.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder.');
    } finally {
      setSaving(false);
    }
  }, [title, description, ctaText, ctaUrl, creativeUrl, placement, format, budget, cpmEur, isEdit, existingAd, nav]);

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={s.field}>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
          {isEdit ? 'Modifier la pub' : 'Créer une pub'}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[s.saveBtn, { backgroundColor: saving ? colors.border : '#7B3FF2' }]}
        >
          {saving
            ? <ActivityIndicator size={14} color="#fff" />
            : <Text style={s.saveTxt}>{isEdit ? 'Modifier' : 'Créer'}</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}>

        {/* Aperçu budget */}
        <View style={[s.estimateCard, { backgroundColor: '#7B3FF222', borderColor: '#7B3FF244' }]}>
          <Icon name="bar-chart-2" size={20} color="#7B3FF2" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#7B3FF2', fontWeight: '800', fontSize: 15 }}>
              ~{estimatedImpressions.toLocaleString('fr-FR')} impressions estimées
            </Text>
            <Text style={{ color: '#7B3FF2', fontSize: 12, opacity: 0.8 }}>
              Avec {budget.toFixed(2)}€ de budget au CPM {cpmEur.toFixed(2)}€
            </Text>
          </View>
        </View>

        {/* Titre */}
        <Field label="Titre *">
          <TextInput
            style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Découvre notre nouveau service !"
            placeholderTextColor={colors.textTertiary}
            maxLength={100}
          />
        </Field>

        {/* Description */}
        <Field label="Description">
          <TextInput
            style={[s.input, s.textarea, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Décris ton offre en quelques mots…"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={200}
            numberOfLines={3}
          />
        </Field>

        {/* URL image/vidéo */}
        <Field label="URL image ou vidéo (créatif)">
          <TextInput
            style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
            value={creativeUrl}
            onChangeText={setCreativeUrl}
            placeholder="https://ton-site.com/image.jpg"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="url"
          />
        </Field>

        {/* CTA */}
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label="Texte bouton CTA">
              <TextInput
                style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
                value={ctaText}
                onChangeText={setCtaText}
                placeholder="En savoir plus"
                placeholderTextColor={colors.textTertiary}
                maxLength={50}
              />
            </Field>
          </View>
        </View>

        <Field label="URL de destination (CTA)">
          <TextInput
            style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
            value={ctaUrl}
            onChangeText={setCtaUrl}
            placeholder="https://ton-site.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="url"
          />
        </Field>

        {/* Placement */}
        <Field label="Emplacement">
          <View style={s.chips}>
            {PLACEMENTS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[s.chip, { borderColor: placement === p.key ? '#7B3FF2' : colors.divider,
                  backgroundColor: placement === p.key ? '#7B3FF222' : colors.backgroundSecondary }]}
                onPress={() => setPlacement(p.key)}
              >
                <Icon name={p.icon} size={14} color={placement === p.key ? '#7B3FF2' : colors.textSecondary} />
                <Text style={{ color: placement === p.key ? '#7B3FF2' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* Format */}
        <Field label="Format">
          <View style={s.chips}>
            {FORMATS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[s.chip, { borderColor: format === f.key ? '#7B3FF2' : colors.divider,
                  backgroundColor: format === f.key ? '#7B3FF222' : colors.backgroundSecondary }]}
                onPress={() => setFormat(f.key)}
              >
                <Icon name={f.icon} size={14} color={format === f.key ? '#7B3FF2' : colors.textSecondary} />
                <Text style={{ color: format === f.key ? '#7B3FF2' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* CPM */}
        <Field label="CPM — Coût pour 1000 impressions">
          <View style={s.chips}>
            {CPM_OPTIONS.map(c => (
              <TouchableOpacity
                key={c.value}
                style={[s.chip, { borderColor: cpmEur === c.value ? '#7B3FF2' : colors.divider,
                  backgroundColor: cpmEur === c.value ? '#7B3FF222' : colors.backgroundSecondary }]}
                onPress={() => setCpmEur(c.value)}
              >
                <Text style={{ color: cpmEur === c.value ? '#7B3FF2' : colors.textPrimary, fontWeight: '800', fontSize: 13 }}>
                  {c.label}
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: 10 }}>{c.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* Budget */}
        <Field label="Budget total (€) *">
          <TextInput
            style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
            value={budgetEur}
            onChangeText={setBudgetEur}
            placeholder="Ex: 50"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
          />
          <Text style={[s.hint, { color: colors.textTertiary }]}>
            Minimum 1 € · La campagne s'arrête quand le budget est épuisé
          </Text>
        </Field>

        {/* Info validation */}
        {!isEdit && (
          <View style={[s.infoBox, { backgroundColor: '#10B98122', borderColor: '#10B98144' }]}>
            <Icon name="zap" size={14} color="#10B981" />
            <Text style={[s.infoTxt, { color: '#10B981' }]}>
              Ta pub sera diffusée immédiatement dans le feed après création.
            </Text>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle:  { flex: 1, fontSize: 17, fontWeight: '800' },
  saveBtn:      { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, minWidth: 70, alignItems: 'center' },
  saveTxt:      { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll:       { padding: 16, gap: 16 },
  estimateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  field:        { gap: 6 },
  fieldLabel:   { fontSize: 13, fontWeight: '600' },
  input:        { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  textarea:     { minHeight: 80, textAlignVertical: 'top' },
  row:          { flexDirection: 'row', gap: 10 },
  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  hint:         { fontSize: 11, marginTop: 4 },
  infoBox:      { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoTxt:      { flex: 1, fontSize: 12, lineHeight: 18 },
});
