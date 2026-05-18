import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, PermissionsAndroid, Linking,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, ImagePickerSection, VideoPickerField } from '../../components/common';
import { concertService } from '../../services';
import { backgroundUploadService } from '../../services/backgroundUploadService';
import type { ConcertType, AccessType, ConcertCreate } from '../../types';
import { createConcertStyles as s } from '../../styles/CreateConcertScreen.styles';

// ── Config ────────────────────────────────────────────────────────────────────

const STEPS = ['Infos', 'Accès & Prix', 'Lieu & Date', 'Médias', 'Révision'];

const CONCERT_TYPES: Array<{ type: ConcertType; icon: string; label: string; sub: string }> = [
  { type: 'live',            icon: 'radio',    label: 'Live',          sub: 'En direct'   },
  { type: 'replay',          icon: 'film',     label: 'Replay',        sub: 'Rediffusion' },
  { type: 'live_and_replay', icon: 'layers',   label: 'Live + Replay', sub: 'Les deux'    },
];

const ACCESS_TYPES: Array<{ type: AccessType; icon: string; label: string }> = [
  { type: 'free',         icon: 'gift',   label: 'Gratuit'      },
  { type: 'subscription', icon: 'star',   label: 'Abonnement'   },
  { type: 'ticket',       icon: 'tag',    label: 'Billet'       },
  { type: 'ppv',          icon: 'eye',    label: 'Pay-per-view' },
];

const GENRE_PRESETS = ['Pop', 'Rock', 'Hip-Hop', 'R&B', 'Jazz', 'Classique', 'Électronique', 'Reggae', 'Afrobeats'];

const TICKET_TIERS: Array<{ key: 'simple' | 'vip' | 'vvip' | 'vvvip'; icon: string; label: string; sub: string; color: string }> = [
  { key: 'simple', icon: 'tag',    label: 'Simple', sub: 'Entrée standard',  color: '#6B7280' },
  { key: 'vip',    icon: 'star',   label: 'VIP',    sub: 'Accès privilégié', color: '#F59E0B' },
  { key: 'vvip',   icon: 'award',  label: 'VVIP',   sub: 'Expérience premium', color: '#8B5CF6' },
  { key: 'vvvip',  icon: 'zap',    label: 'VVVIP',  sub: 'Elite exclusif',   color: '#EF4444' },
];

// ── Composant ─────────────────────────────────────────────────────────────────

interface Props { onBack?: () => void; concertId?: string; }

export const CreateConcertScreen: React.FC<Props> = ({ onBack, concertId }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const isEditing = !!concertId;

  const [step, setStep] = useState(0);

  // ── Étape 0 : Infos ─────────────────────────────────────────────────────
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [genre,       setGenre]       = useState('');
  const [concertType, setConcertType] = useState<ConcertType>('live');
  const [maxViewers,  setMaxViewers]  = useState('');
  const [durationMin, setDurationMin] = useState('');

  // ── Étape 1 : Accès & Prix ──────────────────────────────────────────────
  const [accessType,   setAccessType]   = useState<AccessType>('free');
  const [priceSimple,  setPriceSimple]  = useState('');
  const [priceVip,     setPriceVip]     = useState('');
  const [priceVvip,    setPriceVvip]    = useState('');
  const [priceVvvip,   setPriceVvvip]   = useState('');

  // ── Étape 2 : Lieu & Date ───────────────────────────────────────────────
  const [venueCity,   setVenueCity]   = useState('');
  const [venueName,   setVenueName]   = useState('');
  const [country,     setCountry]     = useState('Burkina Faso');
  const [schedDate,           setSchedDate]           = useState<Date | null>(null);
  const [schedTime,           setSchedTime]           = useState<Date | null>(null);
  const [showSchedDatePicker, setShowSchedDatePicker] = useState(false);
  const [showSchedTimePicker, setShowSchedTimePicker] = useState(false);
  const [locating,    setLocating]    = useState(false);

  // ── Étape 3 : Médias ────────────────────────────────────────────────────
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [bannerUrl,    setBannerUrl]    = useState('');
  const [galleryUrls,  setGalleryUrls]  = useState<string[]>([]);
  const [videoUrl,      setVideoUrl]      = useState('');
  const [videoLocalUri, setVideoLocalUri] = useState('');

  const [saving,     setSaving]     = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditing);

  const publishScale = useSharedValue(1);
  const publishStyle = useAnimatedStyle(() => ({
    transform: [{ scale: publishScale.value }],
  }));

  // ── Charger les données en mode édition ──────────────────────────────────
  useEffect(() => {
    if (!concertId) return;
    concertService.getById(concertId).then(c => {
      setTitle(c.title ?? '');
      setDescription(c.description ?? '');
      setGenre(c.genre ?? '');
      setConcertType(c.concert_type ?? 'live');
      setAccessType(c.access_type ?? 'free');
      setVenueCity(c.venue_city ?? '');
      setVenueName(c.venue_name ?? '');
      setCountry(c.venue_country ?? 'Burkina Faso');
      setMaxViewers(c.max_viewers != null ? String(c.max_viewers) : '');
      setDurationMin(c.duration_min != null ? String(c.duration_min) : '');
      if (c.ticket_price      != null) setPriceSimple(String(c.ticket_price));
      if (c.ticket_price_vip  != null) setPriceVip(String(c.ticket_price_vip));
      if (c.ticket_price_vvip != null) setPriceVvip(String(c.ticket_price_vvip));
      if (c.ticket_price_vvvip != null) setPriceVvvip(String(c.ticket_price_vvvip));
      if (c.scheduled_at) {
        const d = new Date(c.scheduled_at);
        setSchedDate(d); setSchedTime(d);
      }
      if (c.thumbnail_url) setThumbnailUrl(c.thumbnail_url);
      if (c.banner_url)    setBannerUrl(c.banner_url);
      if (c.video_url)     setVideoUrl(c.video_url);
      const imgs = [c.thumbnail_url, c.banner_url].filter(Boolean) as string[];
      setGalleryUrls(imgs);
    }).catch(() => Alert.alert('Erreur', 'Impossible de charger le concert.'))
      .finally(() => setLoadingData(false));
  }, [concertId]);

  // ── Validation par étape ─────────────────────────────────────────────────
  const validateStep = useCallback((s: number): string | null => {
    switch (s) {
      case 0:
        if (!title.trim()) return 'Le titre est requis.';
        return null;
      case 1:
        if (accessType === 'ticket') {
          if (!priceSimple || isNaN(Number(priceSimple))) return 'Le prix Simple est requis.';
        }
        return null;
      case 2:
        if (!venueCity.trim()) return 'La ville est requise.';
        if (!schedDate)        return 'La date est requise.';
        if (!schedTime)        return "L'heure est requise.";
        return null;
      default:
        return null;
    }
  }, [title, accessType, priceSimple, venueCity, schedDate, schedTime]);

  const goNext = () => {
    const err = validateStep(step);
    if (err) { Alert.alert('Champs manquants', err); return; }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (step === 0) { onBack?.(); return; }
    setStep(s => s - 1);
  };

  // ── GPS ──────────────────────────────────────────────────────────────────
  const handleGetLocation = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        { title: 'Localisation', message: 'FoliX a besoin de votre position pour remplir le lieu.', buttonPositive: 'OK' },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission refusée', 'Activez la localisation dans les paramètres.');
        return;
      }
    }
    setLocating(true);
    Geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const mapsUrl = Platform.OS === 'ios'
            ? `maps:?ll=${latitude},${longitude}&z=16`
            : `geo:${latitude},${longitude}?z=16`;
          const canOpen = await Linking.canOpenURL(mapsUrl);
          Linking.openURL(canOpen ? mapsUrl : `https://www.google.com/maps?q=${latitude},${longitude}&z=16`);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'fr' } },
          );
          const data = await res.json();
          const addr = data.address ?? {};
          setVenueCity(addr.city ?? addr.town ?? addr.village ?? addr.county ?? '');
          setCountry(addr.country ?? '');
          if (addr.road) setVenueName(addr.road);
        } catch {
          Alert.alert('Erreur', 'Impossible de récupérer la position.');
        } finally { setLocating(false); }
      },
      () => {
        setLocating(false);
        Alert.alert('Erreur GPS', 'Position introuvable. Vérifiez votre GPS.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ── Payload ──────────────────────────────────────────────────────────────
  const buildPayload = (): ConcertCreate => ({
    title:         title.trim(),
    description:   description.trim() || undefined,
    genre:         genre.trim() || undefined,
    concert_type:  concertType,
    access_type:   accessType,
    venue_city:    venueCity.trim(),
    venue_country: country.trim(),
    venue_name:    venueName.trim() || undefined,
    scheduled_at:  (() => {
      const d = new Date(schedDate!);
      d.setHours(schedTime!.getHours(), schedTime!.getMinutes(), 0, 0);
      return d.toISOString();
    })(),
    duration_min:  durationMin ? Number(durationMin) : undefined,
    ticket_price:       accessType === 'ticket' && priceSimple ? Number(priceSimple) : undefined,
    ticket_price_vip:   accessType === 'ticket' && priceVip   ? Number(priceVip)    : undefined,
    ticket_price_vvip:  accessType === 'ticket' && priceVvip  ? Number(priceVvip)   : undefined,
    ticket_price_vvvip: accessType === 'ticket' && priceVvvip ? Number(priceVvvip)  : undefined,
    max_viewers:   maxViewers ? Number(maxViewers) : undefined,
    thumbnail_url: galleryUrls[0] ?? (thumbnailUrl || undefined),
    banner_url:    bannerUrl || galleryUrls[1] || undefined,
    video_url:     videoUrl.trim() || undefined,
  });

  // ── Brouillon ────────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    const err = validateStep(0);
    if (err) { Alert.alert('Champs manquants', err); return; }
    setSaving(true);
    try {
      const payload = { ...buildPayload(), video_url: videoUrl || undefined };
      if (isEditing) {
        await concertService.update(concertId!, payload);
        Alert.alert('Modifications enregistrées', 'Votre concert a été mis à jour.');
      } else {
        await concertService.create(payload);
        Alert.alert('Brouillon enregistré', 'Votre concert a été sauvegardé en brouillon.');
      }
      onBack?.();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder.');
    } finally { setSaving(false); }
  };

  // ── Publier ──────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const err = validateStep(i);
      if (err) { Alert.alert(`Étape ${i + 1} incomplète`, err); setStep(i); return; }
    }

    Alert.alert(
      isEditing ? 'Enregistrer et publier ?' : 'Publier le concert ?',
      'Votre concert sera visible par tous les utilisateurs FoliX.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Publier',
          onPress: () => {
            publishScale.value = withSpring(0.95, {}, () => { publishScale.value = withSpring(1); });
            setPublishing(true);

            const basePayload = buildPayload();
            const capturedLocalUri = videoLocalUri;
            const capturedTitle    = title.trim() || 'Concert';
            const isEdit           = isEditing;
            const editId           = concertId;

            setPublishing(false);
            onBack?.();

            if (capturedLocalUri) {
              backgroundUploadService.enqueueVideo({
                localUri: capturedLocalUri,
                folder:   'concerts',
                type:     'concert',
                label:    capturedTitle,
                onDone: async (result) => {
                  const payload = { ...basePayload, video_url: result.videoUrl, thumbnail_url: result.thumbnailUrl ?? basePayload.thumbnail_url };
                  const saved = isEdit
                    ? await concertService.update(editId!, payload)
                    : await concertService.create(payload);
                  await concertService.publish(saved.id);
                },
              });
            } else {
              const payload = { ...basePayload, video_url: videoUrl || undefined };
              (isEdit
                ? concertService.update(editId!, payload)
                : concertService.create(payload)
              ).then(saved => concertService.publish(saved.id)).catch(() => {});
            }
          },
        },
      ],
    );
  };

  if (loadingData) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <AppHeader title={isEditing ? 'Modifier le concert' : 'Créer un concert'} onBack={goBack} />

      {/* ── Stepper ──────────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 }}>
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <View style={{ alignItems: 'center' }}>
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: i < step ? colors.primary : i === step ? colors.primary + '22' : colors.backgroundSecondary,
                borderWidth: 1.5,
                borderColor: i <= step ? colors.primary : colors.border,
              }}>
                {i < step
                  ? <Icon name="check" size={13} color={colors.textOnBrand ?? '#fff'} />
                  : <Text style={{ fontSize: 11, fontWeight: '700', color: i === step ? colors.primary : colors.textTertiary }}>{i + 1}</Text>
                }
              </View>
              {i === step && (
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.primary, marginTop: 3, textAlign: 'center' }} numberOfLines={1}>
                  {label}
                </Text>
              )}
            </View>
            {i < STEPS.length - 1 && (
              <View style={{
                flex: 1, height: 1.5, marginHorizontal: 3, marginBottom: i === step || i + 1 === step ? 10 : 0,
                backgroundColor: i < step ? colors.primary : colors.border,
              }} />
            )}
          </React.Fragment>
        ))}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          key={step}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── ÉTAPE 0 : Infos ──────────────────────────────────────────── */}
          {step === 0 && (
            <Animated.View entering={FadeInDown.springify()}>
              {/* Hero */}
              <LinearGradient
                colors={[colors.gradientStart + 'DD', colors.gradientEnd + 'AA']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.heroBanner}
              >
                <Icon name="music" size={44} color={colors.textOnBrand + 'CC'} />
                <Text style={[s.heroTitle, { color: colors.textOnBrand }]}>
                  {title.trim() || 'Nouveau concert'}
                </Text>
                <Text style={[s.heroSub, { color: colors.textOnBrand + 'CC' }]}>
                  {genre || 'Genre non défini'} · {venueCity || 'Lieu à définir'}
                </Text>
                {concertType === 'live' && (
                  <View style={[s.liveIndicator, { backgroundColor: colors.accentOrange }]}>
                    <View style={[s.liveDot, { backgroundColor: colors.textOnBrand }]} />
                    <Text style={[s.liveText, { color: colors.textOnBrand }]}>LIVE</Text>
                  </View>
                )}
              </LinearGradient>

              {/* Titre & description */}
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>INFORMATIONS</Text>
                <CField label="Titre *" placeholder="Nom du concert" value={title} onChangeText={setTitle} colors={colors} />
                <CField label="Description" placeholder="Décrivez le set..." value={description} onChangeText={setDescription} multiline colors={colors} />
              </View>

              {/* Genre */}
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>GENRE MUSICAL</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {GENRE_PRESETS.map(g => {
                    const active = genre === g;
                    return (
                      <TouchableOpacity
                        key={g}
                        onPress={() => setGenre(active ? '' : g)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                          borderWidth: 1.5,
                          backgroundColor: active ? colors.primary + '22' : colors.backgroundSecondary,
                          borderColor: active ? colors.primary : colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? colors.primary : colors.textSecondary }}>
                          {g}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <CField
                  label="Ou saisir un genre personnalisé"
                  placeholder="Ex : Zouk, Gospel, Coupé-décalé…"
                  value={GENRE_PRESETS.includes(genre) ? '' : genre}
                  onChangeText={v => setGenre(v)}
                  colors={colors}
                />
              </View>

              {/* Type de diffusion */}
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TYPE DE DIFFUSION</Text>
                <View style={s.typeRow}>
                  {CONCERT_TYPES.map(t => {
                    const active = concertType === t.type;
                    return (
                      <TouchableOpacity
                        key={t.type}
                        onPress={() => setConcertType(t.type)}
                        style={[s.typeBtn, {
                          backgroundColor: active ? colors.primary + '18' : colors.backgroundSecondary,
                          borderColor: active ? colors.primary : colors.border,
                        }]}
                      >
                        <Icon name={t.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
                        <Text style={[s.typeBtnLabel, { color: active ? colors.primary : colors.textPrimary }]}>{t.label}</Text>
                        <Text style={[s.typeBtnSub, { color: colors.textTertiary }]}>{t.sub}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Capacité & durée */}
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>PARAMÈTRES</Text>
                <CField label="Spectateurs max" placeholder="Illimité" value={maxViewers} onChangeText={setMaxViewers} keyboardType="number-pad" colors={colors} />
                <CField label="Durée (min)" placeholder="120" value={durationMin} onChangeText={setDurationMin} keyboardType="number-pad" colors={colors} />
              </View>
            </Animated.View>
          )}

          {/* ── ÉTAPE 1 : Accès & Prix ───────────────────────────────────── */}
          {step === 1 && (
            <Animated.View entering={FadeInDown.springify()}>
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TYPE D'ACCÈS</Text>
                <View style={s.accessGrid}>
                  {ACCESS_TYPES.map(a => {
                    const active = accessType === a.type;
                    return (
                      <TouchableOpacity
                        key={a.type}
                        onPress={() => setAccessType(a.type)}
                        style={[s.accessPill, {
                          backgroundColor: active ? colors.primary + '22' : colors.backgroundSecondary,
                          borderColor: active ? colors.primary : colors.border,
                        }]}
                      >
                        <Icon name={a.icon} size={14} color={active ? colors.primary : colors.textSecondary} />
                        <Text style={[s.accessPillText, { color: active ? colors.primary : colors.textSecondary }]}>{a.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {accessType === 'ticket' && (
                <Animated.View entering={FadeInDown.springify()} style={s.section}>
                  <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TARIFS PAR CATÉGORIE</Text>
                  {TICKET_TIERS.map(tier => {
                    const val = tier.key === 'simple' ? priceSimple
                              : tier.key === 'vip'    ? priceVip
                              : tier.key === 'vvip'   ? priceVvip
                              :                         priceVvvip;
                    const setter = tier.key === 'simple' ? setPriceSimple
                                 : tier.key === 'vip'    ? setPriceVip
                                 : tier.key === 'vvip'   ? setPriceVvip
                                 :                         setPriceVvvip;
                    const required = tier.key === 'simple';
                    return (
                      <View
                        key={tier.key}
                        style={{
                          borderRadius: 12, borderWidth: 1.5, borderColor: tier.color + '55',
                          backgroundColor: tier.color + '0D', padding: 14, marginBottom: 12,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <View style={{
                            width: 32, height: 32, borderRadius: 8,
                            backgroundColor: tier.color + '22', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Icon name={tier.icon} size={16} color={tier.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: tier.color }}>
                              {tier.label}{required ? ' *' : ''}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.textTertiary }}>{tier.sub}</Text>
                          </View>
                          {val ? (
                            <View style={{
                              backgroundColor: tier.color + '22', borderRadius: 8,
                              paddingHorizontal: 10, paddingVertical: 4,
                            }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: tier.color }}>{val} €</Text>
                            </View>
                          ) : null}
                        </View>
                        <TextInput
                          value={val}
                          onChangeText={setter}
                          placeholder={required ? 'Prix requis…' : 'Laisser vide pour désactiver'}
                          placeholderTextColor={colors.textDisabled}
                          keyboardType="decimal-pad"
                          style={{
                            backgroundColor: colors.inputBg, borderWidth: 1, borderColor: tier.color + '44',
                            borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                            fontSize: 15, color: colors.textPrimary,
                          }}
                        />
                      </View>
                    );
                  })}
                </Animated.View>
              )}

              {accessType === 'ppv' && (
                <Animated.View entering={FadeInDown.springify()} style={s.section}>
                  <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>PRIX PAY-PER-VIEW</Text>
                  <View style={[s.priceRow, { marginTop: 4 }]}>
                    <View style={[s.currencyTag, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                      <Text style={[s.currencyText, { color: colors.textPrimary }]}>€</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <CField label="Prix d'accès *" placeholder="0.00" value={priceSimple} onChangeText={setPriceSimple} keyboardType="decimal-pad" colors={colors} />
                    </View>
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          )}

          {/* ── ÉTAPE 2 : Lieu & Date ────────────────────────────────────── */}
          {step === 2 && (
            <Animated.View entering={FadeInDown.springify()}>
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>LIEU</Text>
                <TouchableOpacity
                  onPress={handleGetLocation}
                  disabled={locating}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
                    backgroundColor: colors.primary + '18', borderWidth: 1.5,
                    borderColor: colors.primary + '55', marginBottom: 12,
                  }}
                >
                  {locating
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Icon name="map-pin" size={16} color={colors.primary} />
                  }
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                    {locating ? 'Localisation en cours...' : 'Utiliser ma position GPS'}
                  </Text>
                </TouchableOpacity>
                <CField label="Nom du lieu" placeholder="Salle, arena..." value={venueName} onChangeText={setVenueName} colors={colors} />
                <CField label="Ville *" placeholder="Paris" value={venueCity} onChangeText={setVenueCity} colors={colors} />
                <CField label="Pays" placeholder="France" value={country} onChangeText={setCountry} colors={colors} />
              </View>

              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>DATE & HEURE</Text>
                <DateField
                  label="Date *"
                  value={schedDate}
                  placeholder="Choisir une date"
                  onPress={() => setShowSchedDatePicker(true)}
                  format={d => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  colors={colors}
                />
                <DateField
                  label="Heure *"
                  value={schedTime}
                  placeholder="Choisir une heure"
                  onPress={() => setShowSchedTimePicker(true)}
                  format={d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  colors={colors}
                />
                {showSchedDatePicker && (
                  <DateTimePicker
                    value={schedDate ?? new Date()}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(_, date) => { setShowSchedDatePicker(false); if (date) setSchedDate(date); }}
                  />
                )}
                {showSchedTimePicker && (
                  <DateTimePicker
                    value={schedTime ?? new Date()}
                    mode="time"
                    display="default"
                    onChange={(_, time) => { setShowSchedTimePicker(false); if (time) setSchedTime(time); }}
                  />
                )}
              </View>
            </Animated.View>
          )}

          {/* ── ÉTAPE 3 : Médias ─────────────────────────────────────────── */}
          {step === 3 && (
            <Animated.View entering={FadeInDown.springify()}>
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>PHOTOS</Text>
                <ImagePickerSection
                  folder="concerts"
                  maxImages={5}
                  images={galleryUrls}
                  onImagesChange={(urls) => {
                    const resolved = typeof urls === 'function' ? urls(galleryUrls) : urls;
                    setGalleryUrls(resolved);
                    if (resolved[0]) setThumbnailUrl(resolved[0]);
                    if (resolved[1]) setBannerUrl(resolved[1]);
                  }}
                  label="Photos du concert"
                  hint="1ère image = miniature · 2ème = bannière (max 5)"
                  colors={colors}
                />
              </View>

              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>VIDÉO PROMOTIONNELLE</Text>
                <VideoPickerField
                  label="Vidéo publicitaire"
                  hint="Ajoutez une vidéo promotionnelle pour votre concert"
                  localUri={videoLocalUri}
                  remoteUrl={videoUrl}
                  uploading={false}
                  colors={colors}
                  onPick={(uri) => { setVideoLocalUri(uri); setVideoUrl(''); }}
                  onRemove={() => { setVideoLocalUri(''); setVideoUrl(''); }}
                />
              </View>
            </Animated.View>
          )}

          {/* ── ÉTAPE 4 : Révision ───────────────────────────────────────── */}
          {step === 4 && (
            <Animated.View entering={FadeInDown.springify()}>
              {/* Hero récap */}
              <LinearGradient
                colors={[colors.gradientStart + 'DD', colors.gradientEnd + 'AA']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[s.heroBanner, { marginBottom: 24 }]}
              >
                <Icon name="music" size={40} color={colors.textOnBrand + 'CC'} />
                <Text style={[s.heroTitle, { color: colors.textOnBrand }]} numberOfLines={1}>
                  {title.trim() || 'Concert'}
                </Text>
                <Text style={[s.heroSub, { color: colors.textOnBrand + 'CC' }]}>
                  {genre || '—'} · {venueCity || '—'}
                </Text>
                {concertType === 'live' && (
                  <View style={[s.liveIndicator, { backgroundColor: colors.accentOrange }]}>
                    <View style={[s.liveDot, { backgroundColor: colors.textOnBrand }]} />
                    <Text style={[s.liveText, { color: colors.textOnBrand }]}>LIVE</Text>
                  </View>
                )}
              </LinearGradient>

              {/* Bloc infos */}
              <ReviewBlock title="Informations" colors={colors}>
                <ReviewRow label="Titre"       value={title}       colors={colors} />
                <ReviewRow label="Description" value={description || '—'} colors={colors} />
                <ReviewRow label="Genre"       value={genre || '—'} colors={colors} />
                <ReviewRow label="Type"        value={CONCERT_TYPES.find(t => t.type === concertType)?.label ?? concertType} colors={colors} />
                <ReviewRow label="Durée"       value={durationMin ? `${durationMin} min` : '—'} colors={colors} />
                <ReviewRow label="Spectateurs max" value={maxViewers || 'Illimité'} colors={colors} />
              </ReviewBlock>

              {/* Bloc accès */}
              <ReviewBlock title="Accès & Prix" colors={colors}>
                <ReviewRow label="Accès" value={ACCESS_TYPES.find(a => a.type === accessType)?.label ?? accessType} colors={colors} />
                {accessType === 'ticket' && (
                  <>
                    {priceSimple ? <ReviewRow label="Simple" value={`${priceSimple} €`} colors={colors} /> : null}
                    {priceVip    ? <ReviewRow label="VIP"    value={`${priceVip} €`}    colors={colors} /> : null}
                    {priceVvip   ? <ReviewRow label="VVIP"   value={`${priceVvip} €`}   colors={colors} /> : null}
                    {priceVvvip  ? <ReviewRow label="VVVIP"  value={`${priceVvvip} €`}  colors={colors} /> : null}
                  </>
                )}
                {accessType === 'ppv' && priceSimple ? (
                  <ReviewRow label="PPV" value={`${priceSimple} €`} colors={colors} />
                ) : null}
              </ReviewBlock>

              {/* Bloc lieu */}
              <ReviewBlock title="Lieu & Date" colors={colors}>
                <ReviewRow label="Lieu"  value={[venueName, venueCity, country].filter(Boolean).join(', ') || '—'} colors={colors} />
                <ReviewRow label="Date"  value={schedDate ? schedDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'} colors={colors} />
                <ReviewRow label="Heure" value={schedTime ? schedTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'} colors={colors} />
              </ReviewBlock>

              {/* Bloc médias */}
              <ReviewBlock title="Médias" colors={colors}>
                <ReviewRow label="Photos"         value={galleryUrls.length ? `${galleryUrls.length} photo(s)` : 'Aucune'} colors={colors} />
                <ReviewRow label="Vidéo promo"    value={videoLocalUri ? 'Vidéo locale prête' : videoUrl ? 'URL définie' : 'Aucune'} colors={colors} />
              </ReviewBlock>
            </Animated.View>
          )}
        </ScrollView>

        {/* ── Barre de navigation ──────────────────────────────────────────── */}
        <View style={[s.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          <TouchableOpacity
            onPress={goBack}
            style={[s.draftBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
          >
            <Icon name="chevron-left" size={16} color={colors.textSecondary} />
            <Text style={[s.draftBtnText, { color: colors.textSecondary }]}>Retour</Text>
          </TouchableOpacity>

          {step === 0 && (
            <TouchableOpacity
              onPress={handleSaveDraft}
              disabled={saving}
              style={[s.draftBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.textSecondary} />
                : <Icon name="save" size={16} color={colors.textSecondary} />
              }
              <Text style={[s.draftBtnText, { color: colors.textSecondary }]}>Brouillon</Text>
            </TouchableOpacity>
          )}

          <Animated.View style={[s.publishBtn, publishStyle]}>
            <TouchableOpacity
              onPress={step < STEPS.length - 1 ? goNext : handlePublish}
              disabled={saving || publishing}
            >
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.publishBtnInner}
              >
                {publishing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Icon name={step < STEPS.length - 1 ? 'chevron-right' : 'radio'} size={16} color="#fff" />
                }
                <Text style={s.publishBtnText}>
                  {publishing ? 'Publication...' : step < STEPS.length - 1 ? 'Suivant' : 'Publier'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ── Sous-composants ───────────────────────────────────────────────────────────

interface CFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad' | 'url' | 'email-address';
  colors: any;
}

const CField: React.FC<CFieldProps> = ({
  label, placeholder, value, onChangeText, multiline, keyboardType = 'default', colors,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[
      s.fieldWrap,
      { backgroundColor: colors.inputBg, borderColor: focused ? colors.primary : colors.inputBorder },
    ]}>
      <Text style={[s.fieldLabel, { color: focused ? colors.primary : colors.textTertiary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        multiline={multiline}
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[s.fieldInput, multiline && s.fieldInputMulti, { color: colors.textPrimary }]}
      />
    </View>
  );
};

interface DateFieldProps {
  label: string;
  value: Date | null;
  placeholder: string;
  onPress: () => void;
  format: (d: Date) => string;
  colors: any;
}

const DateField: React.FC<DateFieldProps> = ({ label, value, placeholder, onPress, format, colors }) => (
  <TouchableOpacity
    style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>{label}</Text>
    <Text style={[s.fieldInput, { color: value ? colors.textPrimary : colors.textDisabled }]}>
      {value ? format(value) : placeholder}
    </Text>
  </TouchableOpacity>
);

const ReviewBlock: React.FC<{ title: string; colors: any; children: React.ReactNode }> = ({ title, colors, children }) => (
  <View style={{
    backgroundColor: colors.backgroundSecondary, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: 'hidden',
  }}>
    <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: colors.textTertiary }}>{title.toUpperCase()}</Text>
    </View>
    <View style={{ paddingHorizontal: 14, paddingVertical: 4 }}>{children}</View>
  </View>
);

const ReviewRow: React.FC<{ label: string; value: string; colors: any }> = ({ label, value, colors }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
    <Text style={{ fontSize: 13, color: colors.textTertiary, flex: 1 }}>{label}</Text>
    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 2, textAlign: 'right' }} numberOfLines={2}>{value}</Text>
  </View>
);

// StyleSheet for ReviewRow hairline
import { StyleSheet } from 'react-native';
