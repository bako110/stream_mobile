import React, { useState, useEffect } from 'react';
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
import { uploadVideoFromUri } from '../../services/uploadService';
import type { ConcertType, AccessType, ConcertCreate } from '../../types';
import { createConcertStyles as s } from '../../styles/CreateConcertScreen.styles';

// ── Config ────────────────────────────────────────────────────────────────────

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

// ── Composant ─────────────────────────────────────────────────────────────────

interface Props { onBack?: () => void; concertId?: string; }

export const CreateConcertScreen: React.FC<Props> = ({ onBack, concertId }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const isEditing = !!concertId;

  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [genre,       setGenre]       = useState('');
  const [concertType, setConcertType] = useState<ConcertType>('live');
  const [accessType,  setAccessType]  = useState<AccessType>('free');
  const [venueCity,   setVenueCity]   = useState('');
  const [venueName,   setVenueName]   = useState('');
  const [country,     setCountry]     = useState('Burkina Faso');
  const [schedDate,           setSchedDate]           = useState<Date | null>(null);
  const [schedTime,           setSchedTime]           = useState<Date | null>(null);
  const [showSchedDatePicker, setShowSchedDatePicker] = useState(false);
  const [showSchedTimePicker, setShowSchedTimePicker] = useState(false);
  const [durationMin, setDurationMin] = useState('');
  const [price,       setPrice]       = useState('');
  const [maxViewers,  setMaxViewers]  = useState('');

  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [bannerUrl,    setBannerUrl]    = useState('');
  const [galleryUrls,  setGalleryUrls]  = useState<string[]>([]);
  const [videoUrl,      setVideoUrl]      = useState('');
  const [videoLocalUri, setVideoLocalUri] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [saving,      setSaving]      = useState(false);
  const [publishing,  setPublishing]  = useState(false);
  const [loadingData, setLoadingData] = useState(isEditing);

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
      setCountry(c.venue_country ?? 'France');
      setPrice(c.ticket_price != null ? String(c.ticket_price) : '');
      setMaxViewers(c.max_viewers != null ? String(c.max_viewers) : '');
      setDurationMin(c.duration_min != null ? String(c.duration_min) : '');
      if (c.scheduled_at) {
        const d = new Date(c.scheduled_at);
        setSchedDate(d); setSchedTime(d);
      }
      const imgs = [c.thumbnail_url, c.banner_url].filter(Boolean) as string[];
      setGalleryUrls(imgs);
      if (c.thumbnail_url) setThumbnailUrl(c.thumbnail_url);
      if (c.banner_url)    setBannerUrl(c.banner_url);
      if (c.video_url)     setVideoUrl(c.video_url);
    }).catch(() => Alert.alert('Erreur', 'Impossible de charger le concert.'))
      .finally(() => setLoadingData(false));
  }, [concertId]);

  const publishScale = useSharedValue(1);
  const publishStyle = useAnimatedStyle(() => ({
    transform: [{ scale: publishScale.value }],
  }));

  const [locating, setLocating] = useState(false);

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

          // Ouvrir Maps pour voir l'endroit
          const mapsUrl = Platform.OS === 'ios'
            ? `maps:?ll=${latitude},${longitude}&z=16`
            : `geo:${latitude},${longitude}?z=16`;
          const canOpen = await Linking.canOpenURL(mapsUrl);
          Linking.openURL(canOpen ? mapsUrl : `https://www.google.com/maps?q=${latitude},${longitude}&z=16`);

          // Remplir les champs en arrière-plan
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

  const validate = (): string | null => {
    if (!title.trim())     return 'Le titre est requis.';
    if (!venueCity.trim()) return 'La ville est requise.';
    if (!schedDate)        return 'La date de programmation est requise.';
    if (!schedTime)        return "L'heure de programmation est requise.";
    if (accessType === 'ticket' && (!price || isNaN(Number(price)))) {
      return 'Un prix valide est requis pour les billets.';
    }
    return null;
  };

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
    ticket_price:  accessType === 'ticket' ? Number(price) : undefined,
    max_viewers:   maxViewers ? Number(maxViewers) : undefined,
    thumbnail_url: galleryUrls[0] ?? (thumbnailUrl || undefined),
    banner_url:    bannerUrl || galleryUrls[1] || undefined,
    video_url:     videoUrl.trim() || undefined,
  });

  const resolvePayload = async () => {
    let finalVideoUrl = videoUrl;
    if (videoLocalUri) {
      setUploadingVideo(true);
      const uploaded = await uploadVideoFromUri(videoLocalUri, 'reels');
      setUploadingVideo(false);
      finalVideoUrl = uploaded.url;
      setVideoUrl(uploaded.url);
      setVideoLocalUri('');
    }
    return { ...buildPayload(), video_url: finalVideoUrl || undefined };
  };

  const handleSaveDraft = async () => {
    const err = validate();
    if (err) { Alert.alert('Champs manquants', err); return; }
    setSaving(true);
    try {
      const payload = await resolvePayload();
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
    } finally { setSaving(false); setUploadingVideo(false); }
  };

  const handlePublish = async () => {
    const err = validate();
    if (err) { Alert.alert('Champs manquants', err); return; }

    Alert.alert(
      isEditing ? 'Enregistrer et publier ?' : 'Publier le concert ?',
      'Votre concert sera visible par tous les utilisateurs FoliX.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Publier',
          onPress: async () => {
            publishScale.value = withSpring(0.95, {}, () => { publishScale.value = withSpring(1); });
            setPublishing(true);
            try {
              const payload = await resolvePayload();
              const saved = isEditing
                ? await concertService.update(concertId!, payload)
                : await concertService.create(payload);
              await concertService.publish(saved.id);
              Alert.alert('Concert publié !', 'Votre concert est maintenant live sur FoliX.');
              onBack?.();
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Impossible de publier.');
            } finally { setPublishing(false); setUploadingVideo(false); }
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
      <AppHeader title={isEditing ? 'Modifier le concert' : 'Créer un concert'} onBack={onBack} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(40).springify()}>
            <LinearGradient
              colors={[colors.gradientStart + 'DD', colors.gradientEnd + 'AA']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.heroBanner}
            >
              <Icon name="music" size={52} color={colors.textOnBrand + 'CC'} />
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
          </Animated.View>

          {/* ── Infos générales ──────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>INFORMATIONS</Text>
            <CField label="Titre *"      placeholder="Nom du concert"    value={title}       onChangeText={setTitle}       colors={colors} />
            <CField label="Description"  placeholder="Décrivez le set..." value={description} onChangeText={setDescription} multiline colors={colors} />
          </Animated.View>

          {/* ── Genre ────────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(140).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>GENRE MUSICAL</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {GENRE_PRESETS.map(g => {
                const active = genre === g;
                return (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGenre(active ? '' : g)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical:    7,
                      borderRadius:       20,
                      borderWidth:        1.5,
                      backgroundColor:    active ? colors.primary + '22' : colors.backgroundSecondary,
                      borderColor:        active ? colors.primary         : colors.border,
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
          </Animated.View>

          {/* ── Type de concert ──────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(180).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TYPE DE DIFFUSION</Text>
            <View style={s.typeRow}>
              {CONCERT_TYPES.map(t => {
                const active = concertType === t.type;
                return (
                  <TouchableOpacity
                    key={t.type}
                    onPress={() => setConcertType(t.type)}
                    style={[
                      s.typeBtn,
                      {
                        backgroundColor: active ? colors.primary + '18' : colors.backgroundSecondary,
                        borderColor:     active ? colors.primary         : colors.border,
                      },
                    ]}
                  >
                    <Icon name={t.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[s.typeBtnLabel, { color: active ? colors.primary : colors.textPrimary }]}>
                      {t.label}
                    </Text>
                    <Text style={[s.typeBtnSub, { color: colors.textTertiary }]}>{t.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>

          {/* ── Accès ────────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(220).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>ACCÈS</Text>
            <View style={s.accessGrid}>
              {ACCESS_TYPES.map(a => {
                const active = accessType === a.type;
                return (
                  <TouchableOpacity
                    key={a.type}
                    onPress={() => setAccessType(a.type)}
                    style={[
                      s.accessPill,
                      {
                        backgroundColor: active ? colors.primary + '22' : colors.backgroundSecondary,
                        borderColor:     active ? colors.primary         : colors.border,
                      },
                    ]}
                  >
                    <Icon name={a.icon} size={14} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[s.accessPillText, { color: active ? colors.primary : colors.textSecondary }]}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {accessType === 'ticket' && (
              <Animated.View entering={FadeInDown.springify()} style={[s.priceRow, { marginTop: 12 }]}>
                <View style={[s.currencyTag, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <Text style={[s.currencyText, { color: colors.textPrimary }]}>€</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <CField label="Prix du billet" placeholder="0.00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" colors={colors} />
                </View>
              </Animated.View>
            )}
          </Animated.View>

          {/* ── Lieu & date ──────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(260).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>LIEU & DATE</Text>

            {/* GPS button */}
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

            <CField label="Nom du lieu"  placeholder="Salle, arena..."     value={venueName}   onChangeText={setVenueName}   colors={colors} />
            <CField label="Ville *"      placeholder="Paris"               value={venueCity}   onChangeText={setVenueCity}   colors={colors} />
            <CField label="Pays"         placeholder="France"              value={country}     onChangeText={setCountry}     colors={colors} />
            {/* Date picker */}
            <TouchableOpacity
              style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              onPress={() => setShowSchedDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Date *</Text>
              <Text style={[s.fieldInput, { color: schedDate ? colors.textPrimary : colors.textDisabled }]}>
                {schedDate
                  ? schedDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                  : 'Choisir une date'}
              </Text>
            </TouchableOpacity>

            {/* Time picker */}
            <TouchableOpacity
              style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              onPress={() => setShowSchedTimePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Heure *</Text>
              <Text style={[s.fieldInput, { color: schedTime ? colors.textPrimary : colors.textDisabled }]}>
                {schedTime
                  ? schedTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                  : 'Choisir une heure'}
              </Text>
            </TouchableOpacity>

            {showSchedDatePicker && (
              <DateTimePicker
                value={schedDate ?? new Date()}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowSchedDatePicker(false);
                  if (date) setSchedDate(date);
                }}
              />
            )}
            {showSchedTimePicker && (
              <DateTimePicker
                value={schedTime ?? new Date()}
                mode="time"
                display="default"
                onChange={(_, time) => {
                  setShowSchedTimePicker(false);
                  if (time) setSchedTime(time);
                }}
              />
            )}

            <CField label="Durée (min)"  placeholder="120"                 value={durationMin} onChangeText={setDurationMin} keyboardType="number-pad" colors={colors} />
          </Animated.View>

          {/* ── Capacité ─────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>CAPACITÉ</Text>
            <CField label="Spectateurs max" placeholder="Illimité" value={maxViewers} onChangeText={setMaxViewers} keyboardType="number-pad" colors={colors} />
          </Animated.View>

          {/* ── Médias / Photos ───────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(340).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>MÉDIAS</Text>
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

            <VideoPickerField
              label="Vidéo publicitaire"
              hint="Ajoutez une vidéo promotionnelle pour votre concert"
              localUri={videoLocalUri}
              remoteUrl={videoUrl}
              uploading={uploadingVideo}
              colors={colors}
              onPick={(uri) => { setVideoLocalUri(uri); setVideoUrl(''); }}
              onRemove={() => { setVideoLocalUri(''); setVideoUrl(''); }}
            />
          </Animated.View>
        </ScrollView>

        {/* ── Barre flottante ──────────────────────────────────────────────── */}
        <View style={[s.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          <TouchableOpacity
            onPress={handleSaveDraft}
            disabled={saving || publishing}
            style={[s.draftBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.textSecondary} />
              : <Icon name="save" size={16} color={colors.textSecondary} />
            }
            <Text style={[s.draftBtnText, { color: colors.textSecondary }]}>Brouillon</Text>
          </TouchableOpacity>

          <Animated.View style={[s.publishBtn, publishStyle]}>
            <TouchableOpacity onPress={handlePublish} disabled={saving || publishing}>
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.publishBtnInner}
              >
                {publishing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Icon name="radio" size={16} color="#fff" />
                }
                <Text style={s.publishBtnText}>
                  {publishing ? 'Publication...' : 'Publier'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ── Field ─────────────────────────────────────────────────────────────────────

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
