import React, { useState, useRef, useEffect } from 'react';
import Geolocation from '@react-native-community/geolocation';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, PermissionsAndroid, Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, ImagePickerSection, VideoPickerField } from '../../components/common';
import { eventService } from '../../services';
import { uploadVideoFromUri } from '../../services/uploadService';
import type { EventType, EventAccessType, EventCreate } from '../../types';
import { createEventStyles as s } from '../../styles/CreateEventScreen.styles';

// ── Config statique ───────────────────────────────────────────────────────────

const EVENT_TYPES: Array<{ type: EventType; icon: string; label: string; color: string }> = [
  { type: 'concert',    icon: 'music',    label: 'Concert',      color: '#7B3FF2' },
  { type: 'festival',   icon: 'star',     label: 'Festival',     color: '#FF7A2F' },
  { type: 'birthday',   icon: 'gift',     label: 'Anniversaire', color: '#E0389A' },
  { type: 'conference', icon: 'mic',      label: 'Conférence',   color: '#36D9A0' },
  { type: 'sport',      icon: 'activity', label: 'Sport',        color: '#3B82F6' },
  { type: 'theater',    icon: 'film',     label: 'Théâtre',      color: '#9B65F5' },
  { type: 'exhibition', icon: 'image',    label: 'Exposition',   color: '#36D9A0' },
  { type: 'other',      icon: 'calendar', label: 'Autre',        color: '#9390AB' },
];

const ACCESS_TYPES: Array<{ type: EventAccessType; icon: string; label: string; sub: string }> = [
  { type: 'free',        icon: 'gift',    label: 'Gratuit',     sub: 'Accès libre' },
  { type: 'ticket',      icon: 'tag',     label: 'Payant',      sub: 'Billet requis' },
  { type: 'invite_only', icon: 'lock',    label: 'Sur invite',  sub: 'Liste fermée' },
];

// ── Composant principal ───────────────────────────────────────────────────────

interface Props {
  onBack?:  () => void;
  eventId?: string;
}

export const CreateEventScreen: React.FC<Props> = ({ onBack, eventId }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const isEditing = !!eventId;

  // Form state
  const [title,           setTitle]           = useState('');
  const [description,     setDescription]     = useState('');
  const [eventType,       setEventType]       = useState<EventType>('concert');
  const [customEventType, setCustomEventType] = useState('');
  const [accessType,  setAccessType]  = useState<EventAccessType>('free');
  const [venueCity,   setVenueCity]   = useState('');
  const [venueName,   setVenueName]   = useState('');
  const [venueAddr,   setVenueAddr]   = useState('');
  const [country,     setCountry]     = useState('Burkina Faso');
  const [isOnline,    setIsOnline]    = useState(false);
  const [onlineUrl,   setOnlineUrl]   = useState('');
  const [startDate,   setStartDate]   = useState<Date | null>(null);
  const [startTime,   setStartTime]   = useState<Date | null>(null);
  const [endDate,     setEndDate]     = useState<Date | null>(null);
  const [endTime,     setEndTime]     = useState<Date | null>(null);
  const [price,       setPrice]       = useState('');
  const [maxAttendees,setMaxAttendees]= useState('');

  // Date/Time picker state
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [galleryUrls,    setGalleryUrls]    = useState<string[]>([]);
  const [videoUrl,       setVideoUrl]       = useState('');
  const [videoLocalUri,  setVideoLocalUri]  = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [saving,     setSaving]     = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditing);

  const scrollRef = useRef<ScrollView>(null);

  // ── Charger les données en mode édition ────────────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    eventService.getById(eventId).then(ev => {
      setTitle(ev.title ?? '');
      setDescription(ev.description ?? '');
      setEventType(ev.event_type ?? 'concert');
      setAccessType(ev.access_type ?? 'free');
      setVenueCity(ev.venue_city ?? '');
      setVenueName(ev.venue_name ?? '');
      setVenueAddr(ev.venue_address ?? '');
      setCountry(ev.venue_country ?? 'Burkina Faso');
      setIsOnline(ev.is_online ?? false);
      setOnlineUrl(ev.online_url ?? '');
      setPrice(ev.ticket_price != null ? String(ev.ticket_price) : '');
      setMaxAttendees(ev.max_attendees != null ? String(ev.max_attendees) : '');
      if (ev.starts_at) {
        const d = new Date(ev.starts_at);
        setStartDate(d); setStartTime(d);
      }
      if (ev.ends_at) {
        const d = new Date(ev.ends_at);
        setEndDate(d); setEndTime(d);
      }
      const imgs = [ev.thumbnail_url, ev.banner_url, ...(ev.gallery_urls ?? [])].filter(Boolean) as string[];
      setGalleryUrls(imgs);
      if (ev.video_url) setVideoUrl(ev.video_url);
    }).catch(() => Alert.alert('Erreur', 'Impossible de charger l\'événement.'))
      .finally(() => setLoadingData(false));
  }, [eventId]);

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
          if (addr.road || addr.suburb) setVenueAddr([addr.house_number, addr.road, addr.suburb].filter(Boolean).join(' '));
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

  // Animation bouton publish
  const publishScale = useSharedValue(1);
  const publishStyle = useAnimatedStyle(() => ({
    transform: [{ scale: publishScale.value }],
  }));

  const selectedTypeConfig = EVENT_TYPES.find(t => t.type === eventType)!;

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!title.trim())     return 'Le titre est requis.';
    if (!venueCity.trim()) return 'La ville est requise.';
    if (!startDate)       return 'La date de début est requise.';
    if (!startTime)       return 'L\'heure de début est requise.';
    if (accessType === 'ticket' && (!price || isNaN(Number(price)))) {
      return 'Un prix valide est requis pour un événement payant.';
    }
    return null;
  };

  const buildPayload = (): EventCreate => {
    // Combine date and time for start
    let startsAtStr = '';
    if (startDate && startTime) {
      const combined = new Date(startDate);
      combined.setHours(startTime.getHours(), startTime.getMinutes());
      startsAtStr = combined.toISOString();
    }

    // Combine date and time for end
    let endsAtStr: string | undefined;
    if (endDate && endTime) {
      const combined = new Date(endDate);
      combined.setHours(endTime.getHours(), endTime.getMinutes());
      endsAtStr = combined.toISOString();
    }

    const payload = {
      title:         title.trim(),
      description:   description.trim() || undefined,
      event_type:    eventType,
      access_type:   accessType,
      venue_city:    venueCity.trim(),
      venue_country: country.trim(),
      venue_name:    venueName.trim() || undefined,
      venue_address: venueAddr.trim() || undefined,
      is_online:     isOnline,
      online_url:    isOnline ? onlineUrl.trim() || undefined : undefined,
      starts_at:     startsAtStr,
      ends_at:       endsAtStr,
      ticket_price:  accessType === 'ticket' ? Number(price) : undefined,
      max_attendees: maxAttendees ? Number(maxAttendees) : undefined,
      thumbnail_url: galleryUrls[0] || undefined,
      banner_url:    galleryUrls[1] || undefined,
      gallery_urls: galleryUrls.length > 0 ? galleryUrls : undefined,
      video_url: videoUrl.trim() || undefined,
    };
    // console.log('[CreateEvent] galleryUrls:', galleryUrls, 'thumbnail:', payload.thumbnail_url, 'banner:', payload.banner_url);
    return payload;
  };

  // ── Actions ───────────────────────────────────────────────────────────────

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
        await eventService.update(eventId!, payload);
        Alert.alert('Modifications enregistrées', 'Votre événement a été mis à jour.');
      } else {
        await eventService.create(payload);
        Alert.alert('Brouillon enregistré', 'Votre événement a été sauvegardé en brouillon.');
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
      isEditing ? 'Enregistrer et publier ?' : 'Publier l\'événement ?',
      'Tout le monde pourra voir et rejoindre cet événement.',
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
                ? await eventService.update(eventId!, payload)
                : await eventService.create(payload);
              await eventService.publish(saved.id);
              Alert.alert('Publié !', 'Votre événement est maintenant visible par tous.');
              onBack?.();
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Impossible de publier.');
            } finally { setPublishing(false); setUploadingVideo(false); }
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <AppHeader title={isEditing ? 'Modifier l\'événement' : 'Créer un événement'} onBack={onBack} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Hero banner dynamique ──────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(40).springify()}>
            <LinearGradient
              colors={[selectedTypeConfig.color + 'CC', selectedTypeConfig.color + '66']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.heroBanner}
            >
              <Icon name={selectedTypeConfig.icon} size={52} color="rgba(255,255,255,0.85)" />
              <Text style={[s.heroTitle, { color: '#fff' }]}>
                {title.trim() || 'Nouvel événement'}
              </Text>
              <Text style={[s.heroSub, { color: 'rgba(255,255,255,0.8)' }]}>
                {selectedTypeConfig.label} · {venueCity || 'Lieu à définir'}
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* ── Informations générales ─────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>INFORMATIONS</Text>

            <Field
              label="Titre *"
              placeholder="Nom de l'événement"
              value={title}
              onChangeText={setTitle}
              colors={colors}
            />
            <Field
              label="Description"
              placeholder="Décrivez votre événement..."
              value={description}
              onChangeText={setDescription}
              multiline
              colors={colors}
            />
          </Animated.View>

          {/* ── Type d'événement ──────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(140).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TYPE D'ÉVÉNEMENT</Text>
            <View style={s.typeGrid}>
              {EVENT_TYPES.map(t => {
                const active = eventType === t.type;
                return (
                  <TouchableOpacity
                    key={t.type}
                    onPress={() => { setEventType(t.type); if (t.type !== 'other') setCustomEventType(''); }}
                    style={[
                      s.typePill,
                      {
                        backgroundColor: active ? t.color + '22' : colors.backgroundSecondary,
                        borderColor:     active ? t.color         : colors.border,
                      },
                    ]}
                  >
                    <Icon name={t.icon} size={16} color={active ? t.color : colors.textSecondary} />
                    <Text style={[s.typePillText, { color: active ? t.color : colors.textSecondary }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {eventType === 'other' && (
              <Animated.View entering={FadeInDown.springify()}>
                <Field
                  label="Préciser le type"
                  placeholder="Ex : Mariage, Gala, Soirée privée…"
                  value={customEventType}
                  onChangeText={setCustomEventType}
                  colors={colors}
                />
              </Animated.View>
            )}
          </Animated.View>

          {/* ── Accès & prix ──────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(180).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>ACCÈS</Text>
            <View style={s.accessRow}>
              {ACCESS_TYPES.map(a => {
                const active = accessType === a.type;
                return (
                  <TouchableOpacity
                    key={a.type}
                    onPress={() => setAccessType(a.type)}
                    style={[
                      s.accessBtn,
                      {
                        backgroundColor: active ? colors.primary + '18' : colors.backgroundSecondary,
                        borderColor:     active ? colors.primary         : colors.border,
                      },
                    ]}
                  >
                    <Icon name={a.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[s.accessBtnLabel, { color: active ? colors.primary : colors.textPrimary }]}>
                      {a.label}
                    </Text>
                    <Text style={[s.accessBtnSub, { color: colors.textTertiary }]}>{a.sub}</Text>
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
                  <Field
                    label="Prix du billet"
                    placeholder="0.00"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    colors={colors}
                  />
                </View>
              </Animated.View>
            )}
          </Animated.View>

          {/* ── Lieu ──────────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(220).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>LIEU</Text>

            <View style={[s.switchRow, { borderBottomColor: colors.divider }]}>
              <View style={s.switchLeft}>
                <Text style={[s.switchLabel, { color: colors.textPrimary }]}>Événement en ligne</Text>
                <Text style={[s.switchSub, { color: colors.textTertiary }]}>Diffusion via un lien</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsOnline(v => !v)}
                style={[s.toggle, { backgroundColor: isOnline ? colors.primary : colors.divider }]}
              >
                <Animated.View
                  style={[
                    s.toggleThumb,
                    { backgroundColor: colors.textOnBrand, left: isOnline ? 20 : 2 },
                  ]}
                />
              </TouchableOpacity>
            </View>

            {isOnline ? (
              <Field
                label="Lien de diffusion"
                placeholder="https://..."
                value={onlineUrl}
                onChangeText={setOnlineUrl}
                keyboardType="url"
                colors={colors}
              />
            ) : (
              <>
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

                <Field label="Nom du lieu" placeholder="Salle, stade, espace..." value={venueName} onChangeText={setVenueName} colors={colors} />
                <Field label="Adresse"     placeholder="123 rue de la Paix"       value={venueAddr} onChangeText={setVenueAddr} colors={colors} />
                <Field label="Ville *"     placeholder="Paris"                    value={venueCity} onChangeText={setVenueCity} colors={colors} />
                <Field label="Pays"        placeholder="France"                   value={country}   onChangeText={setCountry}   colors={colors} />
              </>
            )}
          </Animated.View>

          {/* ── Dates ─────────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(260).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>DATES</Text>

            {/* Date de début */}
            <TouchableOpacity
              style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              onPress={() => setShowStartDatePicker(true)}
            >
              <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Date de début *</Text>
              <Text style={[s.fieldInput, { color: startDate ? colors.textPrimary : colors.textDisabled }]}>
                {startDate ? startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Sélectionner une date'}
              </Text>
            </TouchableOpacity>

            {/* Heure de début */}
            <TouchableOpacity
              style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              onPress={() => setShowStartTimePicker(true)}
            >
              <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Heure de début *</Text>
              <Text style={[s.fieldInput, { color: startTime ? colors.textPrimary : colors.textDisabled }]}>
                {startTime ? startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Sélectionner une heure'}
              </Text>
            </TouchableOpacity>

            {/* Date de fin */}
            <TouchableOpacity
              style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              onPress={() => setShowEndDatePicker(true)}
            >
              <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Date de fin</Text>
              <Text style={[s.fieldInput, { color: endDate ? colors.textPrimary : colors.textDisabled }]}>
                {endDate ? endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Optionnel'}
              </Text>
            </TouchableOpacity>

            {/* Heure de fin */}
            <TouchableOpacity
              style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              onPress={() => setShowEndTimePicker(true)}
            >
              <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>Heure de fin</Text>
              <Text style={[s.fieldInput, { color: endTime ? colors.textPrimary : colors.textDisabled }]}>
                {endTime ? endTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Optionnel'}
              </Text>
            </TouchableOpacity>

            {/* Date Time Pickers */}
            {showStartDatePicker && (
              <DateTimePicker
                value={startDate || new Date()}
                mode="date"
                display="calendar"
                onChange={(event, date) => {
                  setShowStartDatePicker(false);
                  if (date) setStartDate(date);
                }}
              />
            )}
            {showStartTimePicker && (
              <DateTimePicker
                value={startTime || new Date()}
                mode="time"
                display="clock"
                onChange={(event, date) => {
                  setShowStartTimePicker(false);
                  if (date) setStartTime(date);
                }}
              />
            )}
            {showEndDatePicker && (
              <DateTimePicker
                value={endDate || new Date()}
                mode="date"
                display="calendar"
                onChange={(event, date) => {
                  setShowEndDatePicker(false);
                  if (date) setEndDate(date);
                }}
              />
            )}
            {showEndTimePicker && (
              <DateTimePicker
                value={endTime || new Date()}
                mode="time"
                display="clock"
                onChange={(event, date) => {
                  setShowEndTimePicker(false);
                  if (date) setEndTime(date);
                }}
              />
            )}
          </Animated.View>

          {/* ── Capacité ──────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>CAPACITÉ</Text>
            <Field
              label="Nombre max de participants"
              placeholder="Illimité"
              value={maxAttendees}
              onChangeText={setMaxAttendees}
              keyboardType="number-pad"
              colors={colors}
            />
          </Animated.View>

          {/* ── Médias / Photos ───────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(340).springify()} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>MÉDIAS</Text>
            <ImagePickerSection
              folder="events"
              maxImages={5}
              images={galleryUrls}
              onImagesChange={setGalleryUrls}
              label="Photos de l'événement"
              hint="1ère image = miniature · 2ème = bannière (max 5)"
              colors={colors}
            />

            <VideoPickerField
              label="Vidéo publicitaire"
              hint="Ajoutez une vidéo promotionnelle pour votre événement"
              localUri={videoLocalUri}
              remoteUrl={videoUrl}
              uploading={uploadingVideo}
              colors={colors}
              onPick={(uri) => { setVideoLocalUri(uri); setVideoUrl(''); }}
              onRemove={() => { setVideoLocalUri(''); setVideoUrl(''); }}
            />
          </Animated.View>
        </ScrollView>

        {/* ── Barre d'actions flottante ──────────────────────────────────── */}
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
                  : <Icon name="globe" size={16} color="#fff" />
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

// ── Sous-composant Field ──────────────────────────────────────────────────────

const Spacing3 = 12; // Spacing[3]

interface FieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad' | 'url' | 'email-address';
  colors: any;
}

const Field: React.FC<FieldProps> = ({
  label, placeholder, value, onChangeText,
  multiline, keyboardType = 'default', colors,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[
      s.fieldWrap,
      {
        backgroundColor: colors.inputBg,
        borderColor:     focused ? colors.primary : colors.inputBorder,
      },
    ]}>
      <Text style={[s.fieldLabel, { color: focused ? colors.primary : colors.textTertiary }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        multiline={multiline}
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          s.fieldInput,
          multiline && s.fieldInputMulti,
          { color: colors.textPrimary },
        ]}
      />
    </View>
  );
};
