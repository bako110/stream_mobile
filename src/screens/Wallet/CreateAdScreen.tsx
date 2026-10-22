/**
 * CreateAdScreen — Créer ou modifier une campagne publicitaire, en 5 étapes
 * (Média, Contenu, Diffusion, Audience, Budget) plutôt qu'un long formulaire.
 * Accessible depuis AdsScreen.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, Modal, FlatList, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton, GofolyxLoader, PriceWithLocal, CountryMultiSelect, HelpGuideSheet, HelpGuideButton } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { adService, type Ad, type AdPlacement, type AdFormat } from '../../services/adService';
import { eventService } from '../../services/eventService';
import { concertService } from '../../services/concertService';
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

const GENDERS: { key: string; label: string }[] = [
  { key: 'male',               label: 'Hommes' },
  { key: 'female',             label: 'Femmes' },
  { key: 'other',               label: 'Autre' },
  { key: 'prefer_not_to_say',   label: 'Non précisé' },
];

const CPM_OPTIONS = [
  { value: 1.0,  label: '1.00€', desc: 'Économique' },
  { value: 2.0,  label: '2.00€', desc: 'Standard' },
  { value: 5.0,  label: '5.00€', desc: 'Premium' },
  { value: 10.0, label: '10.00€', desc: 'Top' },
];

const STEPS = ['Média', 'Contenu', 'Diffusion', 'Audience', 'Budget'] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

// Texte libre "Côte d'Ivoire, Sénégal" → ["Côte d'Ivoire", "Sénégal"] — même
// idée pour pays et régions, le backend tokenise lui-même pour le matching
// (cf. _matches_country/_matches_region côté serveur), donc pas besoin d'un
// sélecteur à choix fermé ici.
const parseTargetList = (raw: string): string[] | undefined => {
  const items = raw.split(',').map(s => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
};

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

  const [step, setStep] = useState<StepIndex>(0);
  const [showHelp, setShowHelp] = useState(false);

  const [title,        setTitle]        = useState(existingAd?.title ?? '');
  const [description,  setDescription]  = useState(existingAd?.description ?? '');
  const [ctaText,      setCtaText]      = useState(existingAd?.cta_text ?? 'En savoir plus');
  const [ctaUrl,       setCtaUrl]       = useState(existingAd?.cta_url ?? '');
  // Contact direct — numéro unique, utilisable pour l'appel et/ou WhatsApp. Pas
  // exclusif l'un de l'autre : les deux peuvent être cochés en même temps.
  const [contactPhone,    setContactPhone]    = useState(existingAd?.contact_phone ?? '');
  const [contactCall,     setContactCall]     = useState(existingAd?.contact_call ?? false);
  const [contactWhatsapp, setContactWhatsapp] = useState(existingAd?.contact_whatsapp ?? false);
  const [creativeUrl,  setCreativeUrl]  = useState(existingAd?.creative_url ?? '');
  const [placement,    setPlacement]    = useState<AdPlacement>(existingAd?.placement ?? 'feed');
  const [format,       setFormat]       = useState<AdFormat>(existingAd?.format ?? 'native');
  const [budgetEur,    setBudgetEur]    = useState(existingAd ? String(existingAd.budget_eur) : '10');
  const [cpmEur,       setCpmEur]       = useState(existingAd ? existingAd.cpm_eur : 2.0);
  // Ciblage — uniquement modifiable à la création (le backend n'accepte pas de
  // changer le ciblage d'une campagne déjà active via PATCH), pré-rempli en
  // lecture seule en mode édition pour que l'annonceur voie ce qui est actif.
  const [targetCountries, setTargetCountries] = useState<string[]>(existingAd?.target_countries ?? []);
  const [targetRegions,   setTargetRegions]   = useState(existingAd?.target_regions?.join(', ') ?? '');
  const [targetGenders,   setTargetGenders]   = useState<string[]>(existingAd?.target_genders ?? []);
  const [targetAgeMin,    setTargetAgeMin]    = useState(existingAd?.target_age_min != null ? String(existingAd.target_age_min) : '');
  const [targetAgeMax,    setTargetAgeMax]    = useState(existingAd?.target_age_max != null ? String(existingAd.target_age_max) : '');
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

  // Création depuis un contenu déjà publié (2026-10) — sélection d'un event/
  // concert existant dont title/description/thumbnail_url pré-remplissent les
  // champs correspondants ci-dessus (title/description/creativeUrl/localMedia),
  // jamais une étape séparée : l'annonceur garde le même flux en 5 étapes, le
  // choix de source n'est qu'un raccourci au-dessus de l'étape Média.
  // Toujours null en mode édition (une campagne active a déjà son contenu).
  const [sourceContent, setSourceContent] = useState<{ type: 'event' | 'concert'; id: string; title: string } | null>(null);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);

  // Charger le solde wallet
  useEffect(() => {
    apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance)
      .then(r => setWalletGoGold(r.data?.gogold_balance ?? null))
      .catch(() => {});
  }, []);

  // Estimation impressions
  const budget = parseFloat(budgetEur) || 0;
  const estimatedImpressions = cpmEur > 0 ? Math.round((budget / cpmEur) * 1000) : 0;

  // Applique le contenu choisi comme source — pré-remplit title/description/
  // média (jamais écrasé si déjà renseigné manuellement par l'annonceur), et
  // bascule format='native' + mediaType='image' puisque la source fournit
  // toujours une image fixe (thumbnail), jamais une vidéo à transcoder.
  const applySourceContent = useCallback((type: 'event' | 'concert', item: { id: string; title: string; description?: string | null; thumbnail_url?: string | null }) => {
    setSourceContent({ type, id: item.id, title: item.title });
    setSourcePickerOpen(false);
    if (!title.trim()) setTitle(item.title);
    if (!description.trim() && item.description) setDescription(item.description);
    if (item.thumbnail_url) {
      setCreativeUrl(item.thumbnail_url);
      setLocalMedia(item.thumbnail_url);
      setMediaType('image');
      setFormat('native');
    }
  }, [title, description]);

  const clearSourceContent = useCallback(() => setSourceContent(null), []);

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

  // ── Validation par étape — bloque "Suivant" tant que l'étape courante n'est
  // pas valide, pour ne découvrir aucune erreur seulement à la toute fin. ────
  const validateStep = useCallback((s: StepIndex): string | null => {
    if (s === 0) {
      if (uploading) return 'Patiente, le fichier est encore en cours d\'upload.';
      if (localMedia && !creativeUrl) return 'La conversion est en cours, réessaie dans quelques secondes.';
      if (!creativeUrl.trim()) return 'Ajoute une image ou une vidéo pour continuer.';
      return null;
    }
    if (s === 1) {
      if (!title.trim()) return 'Le titre est requis.';
      const ctaTrimmed = ctaUrl.trim();
      const isPhoneNumber = !!ctaTrimmed && /^[+()\d\s.-]{6,}$/.test(ctaTrimmed.replace(/^tel:/i, ''));
      if (ctaTrimmed && !ctaTrimmed.startsWith('http') && !isPhoneNumber) {
        return 'Indique un lien (http:// ou https://) ou un numéro de téléphone valide.';
      }
      const contactPhoneTrimmed = contactPhone.trim();
      if ((contactCall || contactWhatsapp) && !contactPhoneTrimmed) {
        return 'Indique un numéro de téléphone pour le contact direct.';
      }
      if (contactPhoneTrimmed && !/^[+()\d\s.-]{6,}$/.test(contactPhoneTrimmed)) {
        return 'Numéro de téléphone invalide.';
      }
      return null;
    }
    if (s === 3) {
      const ageMinNum = targetAgeMin.trim() ? parseInt(targetAgeMin, 10) : null;
      const ageMaxNum = targetAgeMax.trim() ? parseInt(targetAgeMax, 10) : null;
      if ((ageMinNum !== null && (isNaN(ageMinNum) || ageMinNum < 13 || ageMinNum > 100))
        || (ageMaxNum !== null && (isNaN(ageMaxNum) || ageMaxNum < 13 || ageMaxNum > 100))) {
        return 'Âge cible invalide (entre 13 et 100 ans).';
      }
      if (ageMinNum !== null && ageMaxNum !== null && ageMinNum > ageMaxNum) {
        return 'Âge minimum supérieur à l\'âge maximum.';
      }
      return null;
    }
    if (s === 4) {
      if (budget < 1) return 'Budget minimum : 1 €';
      const goGoldRequired = Math.ceil(budget * 100);
      if (!isEdit && walletGoGold !== null && walletGoGold < goGoldRequired) {
        return `Tu as ${walletGoGold.toLocaleString('fr-FR')} GoGold mais ${goGoldRequired.toLocaleString('fr-FR')} sont requis pour ce budget (${budget.toFixed(2)}€).`;
      }
      return null;
    }
    return null;
  }, [uploading, localMedia, creativeUrl, title, ctaUrl, contactPhone, contactCall, contactWhatsapp, targetAgeMin, targetAgeMax, budget, isEdit, walletGoGold]);

  const goNext = useCallback(() => {
    const err = validateStep(step);
    if (err) { toastService.error('Étape incomplète', err); return; }
    if (step < STEPS.length - 1) setStep((step + 1) as StepIndex);
  }, [step, validateStep]);

  const goPrev = useCallback(() => {
    if (step > 0) setStep((step - 1) as StepIndex);
    else nav.goBack();
  }, [step, nav]);

  const handleSave = useCallback(async () => {
    // Revalide tout (pas seulement l'étape courante) avant l'envoi final —
    // filet de sécurité si une étape précédente a été invalidée en cours de route.
    for (let i = 0 as StepIndex; i < STEPS.length; i++) {
      const err = validateStep(i);
      if (err) { toastService.error('Étape incomplète', err); setStep(i); return; }
    }
    const ctaTrimmed = ctaUrl.trim();
    const contactPhoneTrimmed = contactPhone.trim();

    setSaving(true);
    try {
      const payload = {
        title:        title.trim(),
        description:  description.trim() || undefined,
        cta_text:     ctaText.trim() || undefined,
        cta_url:      ctaTrimmed || undefined,
        contact_phone:    contactPhoneTrimmed || undefined,
        contact_call:     contactCall,
        contact_whatsapp: contactWhatsapp,
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
        // Ciblage — uniquement à la création (le backend ne permet pas de modifier
        // le ciblage d'une campagne existante via PATCH, cf. AdUpdate côté serveur).
        ...(isEdit ? {} : {
          target_countries: targetCountries.length ? targetCountries : undefined,
          target_regions:   parseTargetList(targetRegions),
          target_genders:   targetGenders.length ? targetGenders : undefined,
          target_age_min:   targetAgeMin.trim() ? parseInt(targetAgeMin, 10) : undefined,
          target_age_max:   targetAgeMax.trim() ? parseInt(targetAgeMax, 10) : undefined,
          // Provenance — jamais en édition (une campagne active a déjà son
          // contenu, source_event_id/source_concert_id n'a de sens qu'à la
          // création, cf. AdCreate côté backend).
          source_event_id:   sourceContent?.type === 'event'   ? sourceContent.id : undefined,
          source_concert_id: sourceContent?.type === 'concert' ? sourceContent.id : undefined,
        }),
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
  }, [validateStep, title, description, ctaText, ctaUrl, contactPhone, contactCall, contactWhatsapp, creativeUrl, mediaType, localMedia, placement, format, budget, cpmEur, isEdit, existingAd, targetCountries, targetRegions, targetGenders, targetAgeMin, targetAgeMax, nav]);

  const isLastStep = step === STEPS.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Barre de progression sauvegarde */}
      {saving && <GofolyxLoader variant="bar" color={colors.primary} />}

      {/* Header */}
      <View style={{ paddingTop: insets.top + 8 }}>
        <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={goPrev} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            {isEdit ? 'Modifier la pub' : 'Créer une pub'}
          </Text>
          <HelpGuideButton onPress={() => setShowHelp(true)} />
          <Text style={[s.stepCounter, { color: colors.textTertiary }]}>{step + 1}/{STEPS.length}</Text>
        </View>

        {/* Barre de progression par étapes */}
        <View style={s.progressRow}>
          {STEPS.map((label, i) => (
            <View key={label} style={s.progressItem}>
              <View style={[s.progressDot, {
                backgroundColor: i <= step ? '#7B3FF2' : colors.divider,
                borderColor: i === step ? '#7B3FF2' : 'transparent',
              }]}>
                {i < step ? (
                  <Icon name="check" size={11} color="#fff" />
                ) : (
                  <Text style={{ color: i <= step ? '#fff' : colors.textTertiary, fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold }}>
                    {i + 1}
                  </Text>
                )}
              </View>
              {i < STEPS.length - 1 && (
                <View style={[s.progressLine, { backgroundColor: i < step ? '#7B3FF2' : colors.divider }]} />
              )}
            </View>
          ))}
        </View>
        <Text style={[s.stepLabel, { color: colors.textSecondary }]}>{STEPS[step]}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Étape 1 : Média ──────────────────────────────────────────────── */}
        {step === 0 && (
          <>
          {!isEdit && (
            <Field label="Créer à partir d'un contenu existant (optionnel)" textColor={colors.textSecondary}>
              {sourceContent ? (
                <View style={[s.sourcePickedRow, { backgroundColor: colors.backgroundSecondary, borderColor: '#7B3FF2' }]}>
                  <Icon name={sourceContent.type === 'event' ? 'calendar' : 'music'} size={16} color="#7B3FF2" />
                  <Text style={[s.sourcePickedTxt, { color: colors.textPrimary }]} numberOfLines={1}>{sourceContent.title}</Text>
                  <TouchableOpacity onPress={clearSourceContent} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="x" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setSourcePickerOpen(true)}
                  activeOpacity={0.8}
                  style={[s.sourcePickBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}
                >
                  <Icon name="copy" size={16} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold }}>
                    Choisir un de mes événements ou concerts
                  </Text>
                </TouchableOpacity>
              )}
            </Field>
          )}
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
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, marginTop: 6 }}>
                        Vidéo HLS {creativeUrl ? '— prête' : '— en cours…'}
                      </Text>
                    </View>
                  ) : (
                    <Image source={{ uri: localMedia }} style={s.imagePreview} resizeMode="cover" />
                  )}
                  <View style={s.imageEditBadge}>
                    <Icon name={mediaType === 'video' ? 'video' : 'camera'} size={12} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold }}>Changer</Text>
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
          </>
        )}

        {/* ── Étape 2 : Contenu ────────────────────────────────────────────── */}
        {step === 1 && (
          <>
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

            {/* Contact direct — numéro unique, utilisable pour l'appel et/ou WhatsApp
                (les deux peuvent être cochés en même temps, pas exclusif). */}
            <Field label="Contact direct (optionnel)" textColor={colors.textSecondary}>
              <TextInput
                style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider }]}
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="+226 70 00 00 00"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                keyboardType="phone-pad"
              />
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 10 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
                  onPress={() => setContactCall(v => !v)}
                >
                  <Icon name={contactCall ? 'check-square' : 'square'} size={19} color={contactCall ? '#7B3FF2' : colors.textTertiary} />
                  <Icon name="phone" size={14} color={colors.textSecondary} />
                  <Text style={{ color: colors.textPrimary, fontSize: FontSize.smPlus }}>Appel direct</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
                  onPress={() => setContactWhatsapp(v => !v)}
                >
                  <Icon name={contactWhatsapp ? 'check-square' : 'square'} size={19} color={contactWhatsapp ? '#25D366' : colors.textTertiary} />
                  <Icon name="message-circle" size={14} color={colors.textSecondary} />
                  <Text style={{ color: colors.textPrimary, fontSize: FontSize.smPlus }}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
            </Field>
          </>
        )}

        {/* ── Étape 3 : Diffusion ──────────────────────────────────────────── */}
        {step === 2 && (
          <>
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
                    <Text style={{ color: placement === p.key ? '#7B3FF2' : colors.textSecondary, fontWeight: FontWeight.semiBold, fontSize: FontSize.smPlus }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

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
                    <Text style={{ color: format === f.key ? '#7B3FF2' : colors.textSecondary, fontWeight: FontWeight.semiBold, fontSize: FontSize.smPlus }}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

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
                      style={{ color: cpmEur === c.value ? '#7B3FF2' : colors.textPrimary, fontWeight: FontWeight.extraBold, fontSize: FontSize.smPlus }}
                    />
                    <Text style={{ color: colors.textTertiary, fontSize: FontSize.xs }}>{c.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>
          </>
        )}

        {/* ── Étape 4 : Audience ───────────────────────────────────────────── */}
        {step === 3 && (
          <Field label={`Audience ciblée${isEdit ? ' (lecture seule)' : ' (optionnel)'}`} textColor={colors.textSecondary}>
            <Text style={[s.hint, { color: colors.textTertiary, marginTop: 0, marginBottom: 8 }]}>
              Laisse vide pour toucher tout le monde. Chaque critère rempli restreint l'audience.
            </Text>

            <Text style={[s.subLabel, { color: colors.textSecondary }]}>Sexe</Text>
            <View style={[s.chips, { marginBottom: 12 }]}>
              {GENDERS.map(g => {
                const active = targetGenders.includes(g.key);
                return (
                  <TouchableOpacity
                    key={g.key}
                    disabled={isEdit}
                    style={[s.chip, { borderColor: active ? '#7B3FF2' : colors.divider,
                      backgroundColor: active ? '#7B3FF222' : colors.backgroundSecondary, opacity: isEdit ? 0.6 : 1 }]}
                    onPress={() => setTargetGenders(prev =>
                      prev.includes(g.key) ? prev.filter(k => k !== g.key) : [...prev, g.key],
                    )}
                  >
                    <Text style={{ color: active ? '#7B3FF2' : colors.textSecondary, fontWeight: FontWeight.semiBold, fontSize: FontSize.smPlus }}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[s.subLabel, { color: colors.textSecondary }]}>Tranche d'âge</Text>
            <View style={[s.row, { marginBottom: 12 }]}>
              <TextInput
                editable={!isEdit}
                style={[s.input, { flex: 1, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider, opacity: isEdit ? 0.6 : 1 }]}
                value={targetAgeMin}
                onChangeText={setTargetAgeMin}
                placeholder="Âge min"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={3}
              />
              <TextInput
                editable={!isEdit}
                style={[s.input, { flex: 1, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider, opacity: isEdit ? 0.6 : 1 }]}
                value={targetAgeMax}
                onChangeText={setTargetAgeMax}
                placeholder="Âge max"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>

            <Text style={[s.subLabel, { color: colors.textSecondary }]}>Pays</Text>
            <View style={[{ marginBottom: 12 }, isEdit && { opacity: 0.6 }]} pointerEvents={isEdit ? 'none' : 'auto'}>
              <CountryMultiSelect
                selectedCodes={targetCountries}
                onChange={setTargetCountries}
                placeholder="Tous les pays"
              />
            </View>

            <Text style={[s.subLabel, { color: colors.textSecondary }]}>Région / ville</Text>
            <TextInput
              editable={!isEdit}
              style={[s.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.divider, opacity: isEdit ? 0.6 : 1 }]}
              value={targetRegions}
              onChangeText={setTargetRegions}
              placeholder="Abidjan, Bouaké…"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={[s.hint, { color: colors.textTertiary }]}>
              Séparés par des virgules. Comparé au lieu renseigné sur le profil de chaque utilisateur.
            </Text>
          </Field>
        )}

        {/* ── Étape 5 : Budget + récapitulatif ─────────────────────────────── */}
        {step === 4 && (
          <>
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

            {/* Aperçu budget + solde */}
            <View style={[s.estimateCard, { backgroundColor: '#7B3FF222', borderColor: '#7B3FF244' }]}>
              <Icon name="bar-chart-2" size={20} color="#7B3FF2" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#7B3FF2', fontWeight: FontWeight.extraBold, fontSize: FontSize.basePlus }}>
                  ~{estimatedImpressions.toLocaleString('fr-FR')} impressions estimées
                </Text>
                <Text style={{ color: '#7B3FF2', fontSize: FontSize.sm, opacity: 0.8 }}>
                  Coût : {(budget * 100).toLocaleString('fr-FR')} GoGold (<PriceWithLocal amountEur={budget} style={{ color: '#7B3FF2', fontSize: FontSize.sm, opacity: 0.8 }} />)
                </Text>
                <Text style={{ color: '#7B3FF2', fontSize: FontSize.xsPlus, opacity: 0.7, marginTop: 1 }}>
                  Coût : {(cpmEur / 1000 * 100).toFixed(3)} GoGold/impression
                </Text>
                {walletGoGold !== null && (
                  <Text style={{
                    color: walletGoGold < budget * 100 ? '#EF4444' : '#10B981',
                    fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginTop: 2,
                  }}>
                    Solde : {walletGoGold.toLocaleString('fr-FR')} GoGold
                    {walletGoGold < budget * 100 ? ' — insuffisant' : ' ✓'}
                  </Text>
                )}
              </View>
            </View>

            {/* Récapitulatif rapide de la campagne avant envoi */}
            <View style={[s.recapCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
              <Text style={[s.recapTitle, { color: colors.textPrimary }]}>Récapitulatif</Text>
              {[
                { label: 'Titre',       value: title || '—' },
                { label: 'Emplacement', value: PLACEMENTS.find(p => p.key === placement)?.label ?? placement },
                { label: 'Format',      value: FORMATS.find(f => f.key === format)?.label ?? format },
                { label: 'Audience',    value: targetGenders.length || targetCountries.length || targetAgeMin || targetAgeMax || targetRegions.trim() ? 'Ciblée' : 'Tout le monde' },
              ].map(row => (
                <View key={row.label} style={s.recapRow}>
                  <Text style={[s.recapLabel, { color: colors.textTertiary }]}>{row.label}</Text>
                  <Text style={[s.recapValue, { color: colors.textPrimary }]} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Info validation */}
            {!isEdit && (
              <View style={[s.infoBox, { backgroundColor: '#10B98122', borderColor: '#10B98144' }]}>
                <Icon name="zap" size={14} color="#10B981" />
                <Text style={[s.infoTxt, { color: '#10B981' }]}>
                  Ta pub sera diffusée immédiatement dans le feed après création.
                </Text>
              </View>
            )}
          </>
        )}

      </ScrollView>

      {/* Barre d'action bas d'écran — Suivant / Créer-Modifier */}
      <View style={[s.bottomBar, { backgroundColor: colors.surface, borderColor: colors.divider, paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity onPress={goPrev} style={[s.backStepBtn, { borderColor: colors.divider }]}>
          <Icon name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontWeight: FontWeight.semiBold, fontSize: FontSize.smPlus }}>
            {step === 0 ? 'Annuler' : 'Précédent'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={isLastStep ? handleSave : goNext}
          disabled={saving}
          style={[s.nextBtn, { backgroundColor: saving ? colors.border : '#7B3FF2' }]}
        >
          <Text style={s.nextBtnText}>
            {saving ? '…' : isLastStep ? (isEdit ? 'Modifier' : 'Créer la pub') : 'Suivant'}
          </Text>
          {!saving && <Icon name={isLastStep ? 'check' : 'arrow-right'} size={16} color="#fff" />}
        </TouchableOpacity>
      </View>

      <HelpGuideSheet
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Comment fonctionne une Pub ?"
        intro="Une Pub est une campagne publicitaire payée en euros (débités en GoGold), diffusée automatiquement auprès de l'audience que tu définis — différent du Boost (visibilité de ton propre compte/contenu, payé directement en GoGold, voir Booster)."
        points={[
          { icon: 'image',        title: 'Média',       text: 'Une image ou vidéo obligatoire — sans média, ta pub ne s\'affiche pas correctement dans le feed.' },
          { icon: 'edit-3',       title: 'Contenu',      text: 'Titre, description et un bouton d\'action (lien web, numéro de téléphone, ou appel/WhatsApp direct).' },
          { icon: 'layout',       title: 'Diffusion',    text: 'Choisis où elle apparaît (feed, reels, stories, recherche) et le CPM — le coût pour 1000 impressions.' },
          { icon: 'users',        title: 'Audience',     text: 'Restreins qui la voit par sexe, âge, pays ou région — laisse vide pour toucher tout le monde. Non modifiable après création.' },
          { icon: 'credit-card',  title: 'Budget',       text: 'Le budget total en euros est débité en GoGold à la création. La campagne s\'arrête automatiquement une fois le budget épuisé.' },
        ]}
      />

      <SourceContentPicker
        visible={sourcePickerOpen}
        onClose={() => setSourcePickerOpen(false)}
        onPick={applySourceContent}
      />
    </View>
  );
};

// ── Sélecteur de contenu existant (événement/concert) ───────────────────────
// Liste les propres contenus publiés de l'utilisateur courant uniquement
// (getMyEvents/getMyConcerts, déjà scopés côté backend) — un annonceur ne
// peut créer une pub qu'à partir de ce qu'il a lui-même publié.
const SourceContentPicker: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPick: (type: 'event' | 'concert', item: { id: string; title: string; description?: string | null; thumbnail_url?: string | null }) => void;
}> = ({ visible, onClose, onPick }) => {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'event' | 'concert'>('event');
  const [events, setEvents] = useState<any[]>([]);
  const [concerts, setConcerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!visible || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    Promise.all([
      eventService.getMyEvents().catch(() => []),
      concertService.getMyConcerts().catch(() => []),
    ]).then(([e, c]) => { setEvents(e); setConcerts(c); }).finally(() => setLoading(false));
  }, [visible]);

  const items = tab === 'event' ? events : concerts;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[sp.overlay]}>
        <View style={[sp.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={sp.handle} />
          <View style={sp.header}>
            <Text style={[sp.title, { color: colors.textPrimary }]}>Choisir un contenu</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="x" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[sp.tabs, { borderColor: colors.divider }]}>
            {(['event', 'concert'] as const).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={[sp.tabBtn, tab === t && { borderBottomColor: '#7B3FF2', borderBottomWidth: 2 }]}
              >
                <Text style={{ color: tab === t ? '#7B3FF2' : colors.textTertiary, fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>
                  {t === 'event' ? 'Mes événements' : 'Mes concerts'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center', paddingHorizontal: 24 }}>
              <Text style={{ color: colors.textTertiary, fontSize: FontSize.sm, textAlign: 'center' }}>
                {tab === 'event' ? "Tu n'as pas encore publié d'événement." : "Tu n'as pas encore publié de concert."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={item => item.id}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[sp.row, { borderBottomColor: colors.divider }]}
                  onPress={() => onPick(tab, item)}
                  activeOpacity={0.75}
                >
                  {item.thumbnail_url ? (
                    <Image source={{ uri: item.thumbnail_url }} style={sp.thumb} />
                  ) : (
                    <View style={[sp.thumb, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name={tab === 'event' ? 'calendar' : 'music'} size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <Text style={[sp.rowTitle, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
                  <Icon name="chevron-right" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  header:       {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    marginHorizontal: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  headerTitle:  { flex: 1, fontSize: FontSize.mdPlus, fontWeight: FontWeight.extraBold },
  stepCounter:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  progressRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 14 },
  progressItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  progressDot:  { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  progressLine: { flex: 1, height: 2, marginHorizontal: 4 },
  stepLabel:    { textAlign: 'center', fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, marginTop: 8, marginBottom: 4 },

  scroll:       { padding: 16, gap: 16 },
  estimateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  field:        { gap: 6 },
  fieldLabel:   { fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold },
  subLabel:     { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, marginBottom: 6 },
  input:        { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: FontSize.base },
  textarea:     { minHeight: 80, textAlignVertical: 'top' },
  row:          { flexDirection: 'row', gap: 10 },
  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  hint:            { fontSize: FontSize.xsPlus, marginTop: 4 },
  infoBox:         { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoTxt:         { flex: 1, fontSize: FontSize.sm, lineHeight: 18 },
  imagePicker:     { borderWidth: 1.5, borderRadius: 14, overflow: 'hidden', minHeight: 140 },
  imagePickerInner:{ alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  imagePickerIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  imagePickerTxt:  { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  imagePickerHint: { fontSize: FontSize.xsPlus },
  imagePreview:    { width: '100%', height: 180 },
  imageEditBadge:  { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
                     backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },

  recapCard:  { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  recapTitle: { fontSize: FontSize.smPlus, fontWeight: FontWeight.extraBold, marginBottom: 2 },
  recapRow:   { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  recapLabel: { fontSize: FontSize.sm },
  recapValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, flexShrink: 1, textAlign: 'right' },

  bottomBar: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backStepBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5,
  },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 16,
  },
  nextBtnText: { color: '#fff', fontWeight: FontWeight.extraBold, fontSize: FontSize.base },

  sourcePickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  sourcePickedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
  },
  sourcePickedTxt: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});

const sp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 16 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', alignSelf: 'center', marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.extraBold },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  rowTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
