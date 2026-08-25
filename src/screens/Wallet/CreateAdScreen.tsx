/**
 * CreateAdScreen — Créer ou modifier une campagne publicitaire.
 * Accessible depuis AdsScreen.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton, GofolyxLoader, PriceWithLocal } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { adService, type Ad, type AdPlacement, type AdFormat } from '../../services/adService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { launchImageLibrary } from 'react-native-image-picker';
import { toastService, showConfirm } from '../../services';

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

// Defini en dehors du composant pour eviter le remontage a chaque render
const Field: React.FC<{ label: string; textColor: string; children: React.ReactNode }> = ({ label, textColor, children }) => (
  <View style={s.field}>
    <Text style={[s.fieldLabel, { color: textColor }]}>{label}</Text>
    {children}
  </View>
);

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
  const [walletGoGold,  setWalletGoGold]  = useState<number | null>(null);
  // Pré-rempli depuis existingAd en mode édition, sinon le thumbnail_url d'une
  // pub vidéo existante serait écrasé par creative_url (le flux HLS) au submit
  // si l'utilisateur ne retouche pas le média — cf. payload de handleSubmit.
  const [localMedia,     setLocalMedia]     = useState<string | null>(
    existingAd?.thumbnail_url ?? existingAd?.creative_url ?? null,
  );
  const [mediaType,      setMediaType]      = useState<'image' | 'video' | null>(
    existingAd ? (existingAd.format === 'video' ? 'video' : 'image') : null,
  );
  const [uploading,      setUploading]      = useState(false);
  const [uploadStatus,   setUploadStatus]   = useState<string>('');
  const pickingRef  = useRef(false);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Charger le solde wallet
  useEffect(() => {
    apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance)
      .then(r => setWalletGoGold(r.data?.gogold_balance ?? null))
      .catch(() => {});
  }, []);

  // Estimation impressions
  const budget = parseFloat(budgetEur) || 0;
  const estimatedImpressions = cpmEur > 0 ? Math.round((budget / cpmEur) * 1000) : 0;

  const pickCreative = () => {
    if (pickingRef.current || uploading) return;
    showConfirm('Type de créatif', 'Choisir le type de média', [
      {
        text: 'Image',
        onPress: () => _pick('photo'),
      },
      {
        text: 'Vidéo',
        onPress: () => _pick('video'),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const _poll = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await apiClient.get<{
          status: string; hls_url?: string; thumbnail_url?: string;
        }>(Endpoints.upload.videoJobStatus(jobId));
        const { status, hls_url, thumbnail_url } = r.data;
        if (status === 'done') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (hls_url) {
            setCreativeUrl(hls_url);
            if (thumbnail_url) setLocalMedia(thumbnail_url);
          } else {
            toastService.error('Erreur', 'Transcoding HLS échoué.');
            setLocalMedia(null);
          }
          setUploading(false);
          setUploadStatus('');
        } else if (status === 'error') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setUploading(false);
          setUploadStatus('');
          toastService.error('Erreur', 'Impossible de convertir la vidéo.');
          setLocalMedia(null);
        } else {
          setUploadStatus('Conversion HLS en cours…');
        }
      } catch { /* retry next tick */ }
    }, 3000);
  };

  const _pick = (mediaTypeIn: 'photo' | 'video') => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    launchImageLibrary({ mediaType: mediaTypeIn, selectionLimit: 1, quality: 1 }, async (resp) => {
      pickingRef.current = false;
      if (resp.didCancel || resp.errorCode || !resp.assets?.length) return;
      const asset = resp.assets[0];
      const uri   = asset.uri!;
      const isVid = mediaTypeIn === 'video';
      setLocalMedia(uri);
      setMediaType(isVid ? 'video' : 'image');
      setCreativeUrl('');
      setUploading(true);
      setUploadStatus(isVid ? 'Upload vidéo…' : 'Upload image…');

      try {
        const fd = new FormData();
        if (isVid) {
          const ext  = uri.split('.').pop() ?? 'mp4';
          fd.append('file', { uri, name: `ad_video_${Date.now()}.${ext}`, type: asset.type ?? 'video/mp4' } as any);
          const res = await apiClient.upload<{ job_id?: string; hls_url?: string }>(
            Endpoints.upload.video('ads'),
            fd,
          );
          const { job_id, hls_url } = res.data;
          if (hls_url) {
            setCreativeUrl(hls_url);
            setUploading(false);
            setUploadStatus('');
          } else if (job_id) {
            setUploadStatus('Conversion HLS en cours…');
            _poll(job_id);
          } else {
            throw new Error('no job_id');
          }
        } else {
          fd.append('file', { uri, name: `ad_img_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
          const res = await apiClient.upload<{ uploaded: { url: string }[] }>(
            Endpoints.upload.images('ads'),
            fd,
          );
          const url = res.data?.uploaded?.[0]?.url ?? null;
          if (url) setCreativeUrl(url);
          else throw new Error('no url');
          setUploading(false);
          setUploadStatus('');
        }
      } catch {
        toastService.error('Erreur', "Impossible d'uploader le fichier.");
        setLocalMedia(null);
        setMediaType(null);
        setUploading(false);
        setUploadStatus('');
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    });
  };

  const handleSave = useCallback(async () => {
    if (!title.trim())  { toastService.error('Erreur', 'Le titre est requis.'); return; }
    if (budget < 1)     { toastService.error('Erreur', 'Budget minimum : 1 €'); return; }
    if (uploading) { toastService.warning('Patiente', 'Le fichier est encore en cours d\'upload.'); return; }
    if (localMedia && !creativeUrl) { toastService.warning('Patiente', 'La conversion HLS est en cours, réessaie dans quelques secondes.'); return; }
    // Une campagne sans image ni vidéo s'affiche comme un emplacement vide (icône
    // grisée) partout où elle est servie — jamais un cas voulu, toujours un oubli.
    if (!creativeUrl.trim()) {
      toastService.error('Créatif requis', 'Ajoute une image ou une vidéo — une pub sans média ne s\'affiche pas correctement.');
      return;
    }
    // Le champ CTA accepte soit un lien web, soit un numéro de téléphone (même détection
    // que côté affichage dans ReelsScreen.tsx AdSlide, qui choisit "Contactez-nous" +
    // ouverture du composeur d'appel si un numéro est détecté).
    const ctaTrimmed = ctaUrl.trim();
    const isPhoneNumber = !!ctaTrimmed && /^[+()\d\s.-]{6,}$/.test(ctaTrimmed.replace(/^tel:/i, ''));
    if (ctaTrimmed && !ctaTrimmed.startsWith('http') && !isPhoneNumber) {
      toastService.error('Erreur', 'Indique un lien (http:// ou https://) ou un numéro de téléphone valide.');
      return;
    }

    // Vérifier solde avant création
    const goGoldRequired = Math.ceil(budget * 100); // 1 € = 100 GoGold
    if (!isEdit && walletGoGold !== null && walletGoGold < goGoldRequired) {
      toastService.error(
        'Solde insuffisant',
        `Tu as ${walletGoGold.toLocaleString('fr-FR')} GoGold mais ${goGoldRequired.toLocaleString('fr-FR')} sont requis pour ce budget (${budget.toFixed(2)}€).\n\nRecharge ton wallet ou réduis le budget.`,
      );
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
        // Pour une vidéo, creative_url pointe vers le flux HLS (.m3u8) — sans
        // thumbnail_url, rien n'est affichable avant que le lecteur charge le
        // flux (AdCard ne montre alors qu'un placeholder). Pour une image,
        // localMedia == creative_url, donc l'envoyer ici ne change rien de mal.
        thumbnail_url: (mediaType === 'video' ? localMedia : creativeUrl)?.trim() || undefined,
        placement,
        format,
        budget_eur:   budget,
        cpm_eur:      cpmEur,
      };

      if (isEdit) {
        await adService.update(existingAd!.id, payload);
        toastService.success('Modifié', 'Ta campagne a été mise à jour.');
      } else {
        const result = await adService.create(payload);
        const goGoldDebited = (result as any).gogold_debited ?? Math.ceil(budget * 100);
        setWalletGoGold(prev => prev !== null ? prev - goGoldDebited : null);
        toastService.success(
          'Campagne créée ! 🎯',
          `${goGoldDebited.toLocaleString('fr-FR')} GoGold débités. Ta pub est active dans le feed.`,
        );
      }
      nav.goBack();
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? 'Impossible de sauvegarder.');
    } finally {
      setSaving(false);
    }
  }, [title, description, ctaText, ctaUrl, creativeUrl, placement, format, budget, cpmEur, isEdit, existingAd, nav]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Barre de progression sauvegarde */}
      {saving && <GofolyxLoader variant="bar" color={colors.primary} />}

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
          {isEdit ? 'Modifier la pub' : 'Créer une pub'}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[s.saveBtn, { backgroundColor: saving ? colors.border : '#7B3FF2' }]}
        >
          <Text style={s.saveTxt}>{saving ? '...' : (isEdit ? 'Modifier' : 'Créer')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
      >

        {/* Aperçu budget + solde */}
        <View style={[s.estimateCard, { backgroundColor: '#7B3FF222', borderColor: '#7B3FF244' }]}>
          <Icon name="bar-chart-2" size={20} color="#7B3FF2" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#7B3FF2', fontWeight: '800', fontSize: 15 }}>
              ~{estimatedImpressions.toLocaleString('fr-FR')} impressions estimées
            </Text>
            <Text style={{ color: '#7B3FF2', fontSize: 12, opacity: 0.8 }}>
              Coût : {(budget * 100).toLocaleString('fr-FR')} GoGold (<PriceWithLocal amountEur={budget} style={{ color: '#7B3FF2', fontSize: 12, opacity: 0.8 }} />)
            </Text>
            <Text style={{ color: '#7B3FF2', fontSize: 11, opacity: 0.7, marginTop: 1 }}>
              Coût : {(cpmEur / 1000 * 100).toFixed(3)} GoGold/impression
            </Text>
            {walletGoGold !== null && (
              <Text style={{
                color: walletGoGold < budget * 100 ? '#EF4444' : '#10B981',
                fontSize: 12, fontWeight: '700', marginTop: 2,
              }}>
                Solde : {walletGoGold.toLocaleString('fr-FR')} GoGold
                {walletGoGold < budget * 100 ? ' — insuffisant' : ' ✓'}
              </Text>
            )}
          </View>
        </View>

        {/* Titre */}
        <Field label="Titre *" textColor={colors.textSecondary}>
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
        <Field label="Description" textColor={colors.textSecondary}>
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

        {/* Créatif — image ou vidéo */}
        <Field label="Image ou vidéo de la publicité" textColor={colors.textSecondary}>
          <TouchableOpacity
            onPress={pickCreative}
            disabled={uploading}
            activeOpacity={0.8}
            style={[s.imagePicker, {
              backgroundColor: colors.backgroundSecondary,
              borderColor: creativeUrl ? '#7B3FF2' : colors.divider,
            }]}
          >
            {uploading ? (
              <View style={s.imagePickerInner}>
                <View style={{ width: '100%', marginBottom: 8 }}>
                  <GofolyxLoader variant="bar" color={colors.primary} />
                </View>
                <Text style={[s.imagePickerTxt, { color: colors.textTertiary }]}>{uploadStatus || 'Upload en cours…'}</Text>
                {uploadStatus.includes('HLS') && (
                  <Text style={[s.imagePickerHint, { color: colors.textTertiary }]}>
                    La vidéo est convertie en streaming HLS
                  </Text>
                )}
              </View>
            ) : localMedia ? (
              <>
                {mediaType === 'video' ? (
                  <View style={[s.imagePreview, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name="play-circle" size={48} color="rgba(255,255,255,0.8)" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 }}>
                      Vidéo HLS {creativeUrl ? '— prête' : '— en cours…'}
                    </Text>
                  </View>
                ) : (
                  <Image source={{ uri: localMedia }} style={s.imagePreview} resizeMode="cover" />
                )}
                <View style={s.imageEditBadge}>
                  <Icon name={mediaType === 'video' ? 'video' : 'camera'} size={12} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Changer</Text>
                </View>
              </>
            ) : (
              <View style={s.imagePickerInner}>
                <View style={[s.imagePickerIcon, { backgroundColor: '#7B3FF215' }]}>
                  <Icon name="film" size={22} color="#7B3FF2" />
                </View>
                <Text style={[s.imagePickerTxt, { color: colors.textSecondary }]}>
                  Sélectionner image ou vidéo
                </Text>
                <Text style={[s.imagePickerHint, { color: colors.textTertiary }]}>
                  Image : JPG/PNG · Vidéo : MP4 → HLS automatique
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Field>

        {/* CTA */}
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field label="Texte bouton CTA" textColor={colors.textSecondary}>
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

        <Field label="Lien ou numéro de contact (CTA)" textColor={colors.textSecondary}>
          <TextInput
            style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
            value={ctaUrl}
            onChangeText={setCtaUrl}
            placeholder="https://ton-site.com ou +33 6 12 34 56 78"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            // "default" plutôt que "url" — le clavier url gêne la saisie de chiffres/+ sur
            // certains claviers Android, alors que ce champ accepte aussi un numéro de
            // téléphone (l'app détecte le format et affiche "Contactez-nous" à la place
            // de "En savoir plus" — voir ReelsScreen.tsx AdSlide).
            keyboardType="default"
          />
        </Field>

        {/* Placement */}
        <Field label="Emplacement" textColor={colors.textSecondary}>
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
        <Field label="Format" textColor={colors.textSecondary}>
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
        <Field label="CPM — Coût pour 1000 impressions" textColor={colors.textSecondary}>
          <View style={s.chips}>
            {CPM_OPTIONS.map(c => (
              <TouchableOpacity
                key={c.value}
                style={[s.chip, { borderColor: cpmEur === c.value ? '#7B3FF2' : colors.divider,
                  backgroundColor: cpmEur === c.value ? '#7B3FF222' : colors.backgroundSecondary }]}
                onPress={() => setCpmEur(c.value)}
              >
                <PriceWithLocal
                  amountEur={c.value}
                  style={{ color: cpmEur === c.value ? '#7B3FF2' : colors.textPrimary, fontWeight: '800', fontSize: 13 }}
                />
                <Text style={{ color: colors.textTertiary, fontSize: 10 }}>{c.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* Budget */}
        <Field label="Budget total (€) *" textColor={colors.textSecondary}>
          <TextInput
            style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
            value={budgetEur}
            onChangeText={setBudgetEur}
            placeholder="Ex: 50"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
          />
          <Text style={[s.hint, { color: colors.textTertiary }]}>
            Minimum <PriceWithLocal amountEur={1} style={[s.hint, { color: colors.textTertiary }]} /> · La campagne s'arrête quand le budget est épuisé
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
    </View>
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
  hint:            { fontSize: 11, marginTop: 4 },
  infoBox:         { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoTxt:         { flex: 1, fontSize: 12, lineHeight: 18 },
  imagePicker:     { borderWidth: 1.5, borderRadius: 14, overflow: 'hidden', minHeight: 140 },
  imagePickerInner:{ alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  imagePickerIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  imagePickerTxt:  { fontSize: 14, fontWeight: '600' },
  imagePickerHint: { fontSize: 11 },
  imagePreview:    { width: '100%', height: 180 },
  imageEditBadge:  { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
                     backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
});
