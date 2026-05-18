import React, { useState, useRef, useEffect } from 'react';
import Geolocation from '@react-native-community/geolocation';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Linking,
  KeyboardAvoidingView, Platform, PermissionsAndroid,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, {
  FadeInDown, FadeInRight, FadeOutLeft,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, ImagePickerSection, VideoPickerField } from '../../components/common';
import { eventService } from '../../services';
import { backgroundUploadService } from '../../services/backgroundUploadService';
import type { EventType, EventAccessType, EventCreate } from '../../types';
import { createEventStyles as s } from '../../styles/CreateEventScreen.styles';

// ── Config ─────────────────────────────────────────────────────────────────────

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
  { type: 'free',        icon: 'gift',  label: 'Gratuit',    sub: 'Accès libre'   },
  { type: 'ticket',      icon: 'tag',   label: 'Payant',     sub: 'Billet requis' },
  { type: 'invite_only', icon: 'lock',  label: 'Sur invite', sub: 'Liste fermée'  },
];

const TICKET_TIERS = [
  { key: 'simple', label: 'Simple',  icon: 'tag',    color: '#36D9A0', sub: 'Accès standard'       },
  { key: 'vip',    label: 'VIP',     icon: 'star',   color: '#7B3FF2', sub: 'Accès privilégié'     },
  { key: 'vvip',   label: 'VVIP',    icon: 'award',  color: '#E0389A', sub: 'Expérience premium'   },
  { key: 'vvvip',  label: 'VVVIP',   icon: 'zap',    color: '#FF7A2F', sub: 'Accès ultra exclusif' },
] as const;

type TicketTierKey = typeof TICKET_TIERS[number]['key'];

const STEPS = ['Infos', 'Accès', 'Lieu', 'Médias', 'Révision'] as const;
type Step = 0 | 1 | 2 | 3 | 4;

// ── Composant ──────────────────────────────────────────────────────────────────

interface Props { onBack?: () => void; eventId?: string; }

export const CreateEventScreen: React.FC<Props> = ({ onBack, eventId }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const isEditing = !!eventId;

  const [step, setStep] = useState<Step>(0);

  // Form state
  const [title,           setTitle]           = useState('');
  const [description,     setDescription]     = useState('');
  const [eventType,       setEventType]       = useState<EventType>('concert');
  const [customEventType, setCustomEventType] = useState('');
  const [accessType,      setAccessType]      = useState<EventAccessType>('free');

  // Prix par catégorie
  const [priceSimple, setPriceSimple] = useState('');
  const [priceVip,    setPriceVip]    = useState('');
  const [priceVvip,   setPriceVvip]   = useState('');
  const [priceVvvip,  setPriceVvvip]  = useState('');

  const [venueCity,    setVenueCity]    = useState('');
  const [venueName,    setVenueName]    = useState('');
  const [venueAddr,    setVenueAddr]    = useState('');
  const [country,      setCountry]      = useState('Burkina Faso');
  const [isOnline,     setIsOnline]     = useState(false);

  // Position géocodée confirmée { lat, lon, label }
  const [geoCoords,    setGeoCoords]    = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [geocoding,    setGeocoding]    = useState(false);
  const [onlineUrl,    setOnlineUrl]    = useState('');
  const [startDate,    setStartDate]    = useState<Date | null>(null);
  const [startTime,    setStartTime]    = useState<Date | null>(null);
  const [endDate,      setEndDate]      = useState<Date | null>(null);
  const [endTime,      setEndTime]      = useState<Date | null>(null);
  const [maxAttendees, setMaxAttendees] = useState('');

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker,   setShowEndDatePicker]   = useState(false);
  const [showEndTimePicker,   setShowEndTimePicker]   = useState(false);

  const [galleryUrls,   setGalleryUrls]   = useState<string[]>([]);
  const [videoUrl,      setVideoUrl]      = useState('');
  const [videoLocalUri, setVideoLocalUri] = useState('');
  const [saving,        setSaving]        = useState(false);
  const [publishing,    setPublishing]    = useState(false);
  const [loadingData,   setLoadingData]   = useState(isEditing);
  const [locating,      setLocating]      = useState(false);

  const scrollRef   = useRef<ScrollView>(null);
  const publishScale = useSharedValue(1);
  const publishStyle = useAnimatedStyle(() => ({ transform: [{ scale: publishScale.value }] }));

  // ── Chargement édition ────────────────────────────────────────────────────
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
      setMaxAttendees(ev.max_attendees != null ? String(ev.max_attendees) : '');
      // Prix legacy → simple
      if (ev.ticket_price      != null) setPriceSimple(String(ev.ticket_price));
      if (ev.ticket_price_vip  != null) setPriceVip(String(ev.ticket_price_vip));
      if (ev.ticket_price_vvip != null) setPriceVvip(String(ev.ticket_price_vvip));
      if (ev.ticket_price_vvvip != null) setPriceVvvip(String(ev.ticket_price_vvvip));
      if (ev.starts_at) { const d = new Date(ev.starts_at); setStartDate(d); setStartTime(d); }
      if (ev.ends_at)   { const d = new Date(ev.ends_at);   setEndDate(d);   setEndTime(d);   }
      const imgs = [ev.thumbnail_url, ev.banner_url, ...(ev.gallery_urls ?? [])].filter(Boolean) as string[];
      setGalleryUrls(imgs);
      if (ev.video_url) setVideoUrl(ev.video_url);
    }).catch(() => Alert.alert('Erreur', "Impossible de charger l'événement."))
      .finally(() => setLoadingData(false));
  }, [eventId]);

  // ── GPS : reverse geocoding ───────────────────────────────────────────────
  const handleGetLocation = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        { title: 'Localisation', message: 'FoliX a besoin de votre position.', buttonPositive: 'OK' },
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
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'fr', 'User-Agent': 'FoliX-App/1.0' } },
          );
          const data = await res.json();
          const addr = data.address ?? {};
          const city    = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
          const ctry    = addr.country ?? '';
          const road    = addr.road ?? '';
          const addrStr = [addr.house_number, road, addr.suburb].filter(Boolean).join(' ');
          const label   = data.display_name ?? [addrStr, city, ctry].filter(Boolean).join(', ');
          setVenueCity(city);
          setCountry(ctry);
          if (road)    setVenueName(road);
          if (addrStr) setVenueAddr(addrStr);
          setGeoCoords({ lat: latitude, lon: longitude, label });
        } catch {
          Alert.alert('Erreur', 'Impossible de récupérer la position.');
        } finally {
          setLocating(false);
        }
      },
      () => { setLocating(false); Alert.alert('Erreur GPS', 'Position introuvable.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ── Forward geocoding : quand l'adresse est saisie manuellement ───────────
  const handleForwardGeocode = async () => {
    const query = [venueAddr, venueCity, country].filter(Boolean).join(', ');
    if (!query.trim()) return;
    setGeocoding(true);
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'fr', 'User-Agent': 'FoliX-App/1.0' } },
      );
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setGeoCoords({ lat: parseFloat(lat), lon: parseFloat(lon), label: display_name });
      } else {
        setGeoCoords(null);
      }
    } catch {
      setGeoCoords(null);
    } finally {
      setGeocoding(false);
    }
  };

  // ── Validation par étape ──────────────────────────────────────────────────
  const validateStep = (s: Step): string | null => {
    if (s === 0) {
      if (!title.trim()) return 'Le titre est requis.';
    }
    if (s === 1) {
      if (accessType === 'ticket' && !priceSimple && !priceVip && !priceVvip && !priceVvvip) {
        return 'Renseigne au moins un prix.';
      }
      if (accessType === 'ticket') {
        for (const [key, val] of [['Simple', priceSimple], ['VIP', priceVip], ['VVIP', priceVvip], ['VVVIP', priceVvvip]] as [string, string][]) {
          if (val && isNaN(Number(val))) return `Prix ${key} invalide.`;
        }
      }
    }
    if (s === 2) {
      if (!venueCity.trim()) return 'La ville est requise.';
      if (!startDate)        return 'La date de début est requise.';
      if (!startTime)        return "L'heure de début est requise.";
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { Alert.alert('Champs manquants', err); return; }
    setStep((step + 1) as Step);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const goPrev = () => {
    setStep((step - 1) as Step);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // ── Payload ───────────────────────────────────────────────────────────────
  const buildPayload = (): EventCreate => {
    let startsAtStr = '';
    if (startDate && startTime) {
      const d = new Date(startDate);
      d.setHours(startTime.getHours(), startTime.getMinutes());
      startsAtStr = d.toISOString();
    }
    let endsAtStr: string | undefined;
    if (endDate && endTime) {
      const d = new Date(endDate);
      d.setHours(endTime.getHours(), endTime.getMinutes());
      endsAtStr = d.toISOString();
    }
    return {
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
      // Prix par catégorie — on envoie le prix simple comme ticket_price (compat backend)
      ticket_price:  accessType === 'ticket' && priceSimple ? Number(priceSimple) : undefined,
      ticket_price_vip:   accessType === 'ticket' && priceVip   ? Number(priceVip)   : undefined,
      ticket_price_vvip:  accessType === 'ticket' && priceVvip  ? Number(priceVvip)  : undefined,
      ticket_price_vvvip: accessType === 'ticket' && priceVvvip ? Number(priceVvvip) : undefined,
      max_attendees: maxAttendees ? Number(maxAttendees) : undefined,
      thumbnail_url: galleryUrls[0] || undefined,
      banner_url:    galleryUrls[1] || undefined,
      gallery_urls:  galleryUrls.length > 0 ? galleryUrls : undefined,
      video_url:     videoUrl.trim() || undefined,
    } as any;
  };

  // ── Actions finales ───────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    // Validation globale au moment de sauvegarder
    for (let i = 0; i <= 2; i++) {
      const err = validateStep(i as Step);
      if (err) { Alert.alert('Champs manquants', err); return; }
    }
    setSaving(true);
    try {
      const payload = { ...buildPayload(), video_url: videoUrl || undefined };
      if (isEditing) {
        await eventService.update(eventId!, payload);
        Alert.alert('Modifications enregistrées', 'Votre événement a été mis à jour.');
      } else {
        await eventService.create(payload);
        Alert.alert('Brouillon enregistré', 'Votre événement a été sauvegardé.');
      }
      onBack?.();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder.');
    } finally { setSaving(false); }
  };

  const handlePublish = async () => {
    for (let i = 0; i <= 2; i++) {
      const err = validateStep(i as Step);
      if (err) { Alert.alert('Champs manquants', err); return; }
    }
    Alert.alert(
      isEditing ? 'Enregistrer et publier ?' : "Publier l'événement ?",
      'Tout le monde pourra voir et rejoindre cet événement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Publier',
          onPress: () => {
            publishScale.value = withSpring(0.95, {}, () => { publishScale.value = withSpring(1); });
            const basePayload      = buildPayload();
            const capturedLocalUri = videoLocalUri;
            const capturedTitle    = title.trim() || 'Événement';
            const isEdit = isEditing; const editId = eventId;
            setPublishing(false); onBack?.();
            if (capturedLocalUri) {
              backgroundUploadService.enqueueVideo({
                localUri: capturedLocalUri, folder: 'events', type: 'event', label: capturedTitle,
                onDone: async (result) => {
                  const payload = { ...basePayload, video_url: result.videoUrl, thumbnail_url: result.thumbnailUrl ?? basePayload.thumbnail_url };
                  const saved = isEdit ? await eventService.update(editId!, payload) : await eventService.create(payload);
                  await eventService.publish(saved.id);
                },
              });
            } else {
              const payload = { ...basePayload, video_url: videoUrl || undefined };
              (isEdit ? eventService.update(editId!, payload) : eventService.create(payload))
                .then(saved => eventService.publish(saved.id)).catch(() => {});
            }
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

  const selectedTypeConfig = EVENT_TYPES.find(t => t.type === eventType)!;
  const isLastStep = step === STEPS.length - 1;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <AppHeader title={isEditing ? "Modifier l'événement" : 'Créer un événement'} onBack={onBack} />

      {/* ── Stepper ──────────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
        {STEPS.map((label, i) => {
          const done   = i < step;
          const active = i === step;
          return (
            <React.Fragment key={label}>
              <TouchableOpacity
                onPress={() => { if (done) { setStep(i as Step); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }}
                style={{ alignItems: 'center', gap: 4 }}
                disabled={!done}
              >
                <View style={{
                  width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done ? colors.primary : active ? colors.primary + '22' : colors.backgroundSecondary,
                  borderWidth: 2,
                  borderColor: done || active ? colors.primary : colors.border,
                }}>
                  {done
                    ? <Icon name="check" size={14} color="#fff" />
                    : <Text style={{ fontSize: 11, fontWeight: '800', color: active ? colors.primary : colors.textDisabled }}>{i + 1}</Text>
                  }
                </View>
                <Text style={{ fontSize: 9, fontWeight: '700', color: active ? colors.primary : done ? colors.primary : colors.textDisabled }}>
                  {label}
                </Text>
              </TouchableOpacity>
              {i < STEPS.length - 1 && (
                <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: i < step ? colors.primary : colors.divider, marginBottom: 16 }} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ── ÉTAPE 0 : Informations ────────────────────────────────────── */}
          {step === 0 && (
            <Animated.View entering={FadeInRight.springify()}>
              {/* Hero dynamique */}
              <LinearGradient
                colors={[selectedTypeConfig.color + 'CC', selectedTypeConfig.color + '55']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.heroBanner}
              >
                <Icon name={selectedTypeConfig.icon} size={52} color="rgba(255,255,255,0.85)" />
                <Text style={[s.heroTitle, { color: '#fff' }]}>{title.trim() || 'Nouvel événement'}</Text>
                <Text style={[s.heroSub, { color: 'rgba(255,255,255,0.8)' }]}>{selectedTypeConfig.label} · {venueCity || 'Lieu à définir'}</Text>
              </LinearGradient>

              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>INFORMATIONS GÉNÉRALES</Text>
                <Field label="Titre *" placeholder="Nom de l'événement" value={title} onChangeText={setTitle} colors={colors} />
                <Field label="Description" placeholder="Décrivez votre événement..." value={description} onChangeText={setDescription} multiline colors={colors} />
              </View>

              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TYPE D'ÉVÉNEMENT</Text>
                <View style={s.typeGrid}>
                  {EVENT_TYPES.map(t => {
                    const active = eventType === t.type;
                    return (
                      <TouchableOpacity
                        key={t.type}
                        onPress={() => { setEventType(t.type); if (t.type !== 'other') setCustomEventType(''); }}
                        style={[s.typePill, { backgroundColor: active ? t.color + '22' : colors.backgroundSecondary, borderColor: active ? t.color : colors.border }]}
                      >
                        <Icon name={t.icon} size={16} color={active ? t.color : colors.textSecondary} />
                        <Text style={[s.typePillText, { color: active ? t.color : colors.textSecondary }]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {eventType === 'other' && (
                  <Field label="Préciser le type" placeholder="Ex : Mariage, Gala..." value={customEventType} onChangeText={setCustomEventType} colors={colors} />
                )}
              </View>
            </Animated.View>
          )}

          {/* ── ÉTAPE 1 : Accès & Prix ───────────────────────────────────── */}
          {step === 1 && (
            <Animated.View entering={FadeInRight.springify()}>
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>TYPE D'ACCÈS</Text>
                <View style={s.accessRow}>
                  {ACCESS_TYPES.map(a => {
                    const active = accessType === a.type;
                    return (
                      <TouchableOpacity
                        key={a.type}
                        onPress={() => setAccessType(a.type)}
                        style={[s.accessBtn, { backgroundColor: active ? colors.primary + '18' : colors.backgroundSecondary, borderColor: active ? colors.primary : colors.border }]}
                      >
                        <Icon name={a.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
                        <Text style={[s.accessBtnLabel, { color: active ? colors.primary : colors.textPrimary }]}>{a.label}</Text>
                        <Text style={[s.accessBtnSub, { color: colors.textTertiary }]}>{a.sub}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {accessType === 'ticket' && (
                <Animated.View entering={FadeInDown.springify()} style={s.section}>
                  <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>PRIX PAR CATÉGORIE</Text>
                  <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 16, lineHeight: 18 }}>
                    Laisse vide les catégories que tu ne souhaites pas proposer.
                  </Text>
                  {TICKET_TIERS.map(tier => {
                    const valMap: Record<TicketTierKey, string> = { simple: priceSimple, vip: priceVip, vvip: priceVvip, vvvip: priceVvvip };
                    const setMap: Record<TicketTierKey, (v: string) => void> = { simple: setPriceSimple, vip: setPriceVip, vvip: setPriceVvip, vvvip: setPriceVvvip };
                    return (
                      <View key={tier.key} style={{ marginBottom: 12, borderRadius: 14, borderWidth: 1.5, borderColor: valMap[tier.key] ? tier.color : colors.border, backgroundColor: valMap[tier.key] ? tier.color + '0D' : colors.backgroundSecondary, overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tier.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name={tier.icon} size={15} color={tier.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: tier.color }}>{tier.label}</Text>
                            <Text style={{ fontSize: 11, color: colors.textTertiary }}>{tier.sub}</Text>
                          </View>
                          {valMap[tier.key] ? (
                            <View style={{ backgroundColor: tier.color + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: tier.color }}>{valMap[tier.key]} €</Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 11, color: colors.textDisabled }}>Non proposé</Text>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }}>
                          <Text style={{ paddingHorizontal: 12, fontSize: 15, fontWeight: '700', color: tier.color }}>€</Text>
                          <TextInput
                            value={valMap[tier.key]}
                            onChangeText={setMap[tier.key]}
                            placeholder="0.00"
                            placeholderTextColor={colors.textDisabled}
                            keyboardType="decimal-pad"
                            style={{ flex: 1, paddingVertical: 10, paddingRight: 12, fontSize: 15, color: colors.textPrimary }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </Animated.View>
              )}

              {accessType === 'invite_only' && (
                <View style={s.section}>
                  <View style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <Icon name="lock" size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Événement sur invitation</Text>
                      <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, lineHeight: 18 }}>Seules les personnes que tu invites pourront participer. Tu pourras gérer la liste depuis la page de l'événement.</Text>
                    </View>
                  </View>
                </View>
              )}

              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>CAPACITÉ</Text>
                <Field label="Nombre max de participants" placeholder="Illimité" value={maxAttendees} onChangeText={setMaxAttendees} keyboardType="number-pad" colors={colors} />
              </View>
            </Animated.View>
          )}

          {/* ── ÉTAPE 2 : Lieu & Dates ───────────────────────────────────── */}
          {step === 2 && (
            <Animated.View entering={FadeInRight.springify()}>
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>LIEU</Text>
                <View style={[s.switchRow, { borderBottomColor: colors.divider }]}>
                  <View style={s.switchLeft}>
                    <Text style={[s.switchLabel, { color: colors.textPrimary }]}>Événement en ligne</Text>
                    <Text style={[s.switchSub, { color: colors.textTertiary }]}>Diffusion via un lien</Text>
                  </View>
                  <TouchableOpacity onPress={() => setIsOnline(v => !v)} style={[s.toggle, { backgroundColor: isOnline ? colors.primary : colors.divider }]}>
                    <Animated.View style={[s.toggleThumb, { backgroundColor: colors.textOnBrand, left: isOnline ? 20 : 2 }]} />
                  </TouchableOpacity>
                </View>
                {isOnline ? (
                  <Field label="Lien de diffusion" placeholder="https://..." value={onlineUrl} onChangeText={setOnlineUrl} keyboardType="url" colors={colors} />
                ) : (
                  <>
                    {/* Bouton GPS */}
                    <TouchableOpacity
                      onPress={handleGetLocation} disabled={locating}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.primary + '18', borderWidth: 1.5, borderColor: colors.primary + '55', marginBottom: 12 }}
                    >
                      {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="map-pin" size={16} color={colors.primary} />}
                      <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>{locating ? 'Localisation en cours...' : 'Utiliser ma position GPS'}</Text>
                    </TouchableOpacity>

                    {/* Champs adresse — onBlur déclenche le forward geocoding */}
                    <Field label="Nom du lieu"  placeholder="Salle, stade..."    value={venueName} onChangeText={v => { setVenueName(v); setGeoCoords(null); }} colors={colors} />
                    <Field label="Adresse"      placeholder="123 rue de la Paix" value={venueAddr} onChangeText={v => { setVenueAddr(v); setGeoCoords(null); }} onBlur={handleForwardGeocode} colors={colors} />
                    <Field label="Ville *"      placeholder="Paris"              value={venueCity} onChangeText={v => { setVenueCity(v); setGeoCoords(null); }} onBlur={handleForwardGeocode} colors={colors} />
                    <Field label="Pays"         placeholder="France"             value={country}   onChangeText={v => { setCountry(v);   setGeoCoords(null); }} onBlur={handleForwardGeocode} colors={colors} />

                    {/* Indicateur de position géocodée */}
                    {geocoding && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.backgroundSecondary, marginTop: 4 }}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={{ fontSize: 12, color: colors.textTertiary }}>Recherche de la position...</Text>
                      </View>
                    )}
                    {!geocoding && geoCoords && (
                      <View style={{ marginTop: 4, borderRadius: 12, borderWidth: 1.5, borderColor: '#10B981', backgroundColor: '#10B98110', overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#10B98122', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                            <Icon name="check-circle" size={16} color="#10B981" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#10B981', marginBottom: 2 }}>Position trouvée</Text>
                            <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16 }} numberOfLines={2}>
                              {geoCoords.label}
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 3 }}>
                              {geoCoords.lat.toFixed(5)}, {geoCoords.lon.toFixed(5)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              const url = `https://www.google.com/maps?q=${geoCoords.lat},${geoCoords.lon}&z=16`;
                              Linking.openURL(url);
                            }}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#10B98122', borderWidth: 1, borderColor: '#10B98155' }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>Voir</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                    {!geocoding && !geoCoords && (venueCity.trim() || venueAddr.trim()) && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.backgroundSecondary, marginTop: 4, borderWidth: 1, borderColor: colors.border }}>
                        <Icon name="alert-circle" size={14} color={colors.textTertiary} />
                        <Text style={{ fontSize: 11, color: colors.textTertiary, flex: 1 }}>
                          Position non confirmée — quitte un champ pour vérifier l'adresse.
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>DATES</Text>
                <DateField label="Date de début *"  value={startDate ? startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : null} placeholder="Sélectionner une date" onPress={() => setShowStartDatePicker(true)} colors={colors} />
                <DateField label="Heure de début *" value={startTime ? startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null}              placeholder="Sélectionner une heure" onPress={() => setShowStartTimePicker(true)} colors={colors} />
                <DateField label="Date de fin"      value={endDate   ? endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : null}   placeholder="Optionnel"              onPress={() => setShowEndDatePicker(true)}   colors={colors} />
                <DateField label="Heure de fin"     value={endTime   ? endTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null}                placeholder="Optionnel"              onPress={() => setShowEndTimePicker(true)}   colors={colors} />
                {showStartDatePicker && <DateTimePicker value={startDate || new Date()} mode="date" display="calendar" onChange={(_, d) => { setShowStartDatePicker(false); if (d) setStartDate(d); }} />}
                {showStartTimePicker && <DateTimePicker value={startTime || new Date()} mode="time" display="clock"    onChange={(_, d) => { setShowStartTimePicker(false); if (d) setStartTime(d); }} />}
                {showEndDatePicker   && <DateTimePicker value={endDate   || new Date()} mode="date" display="calendar" onChange={(_, d) => { setShowEndDatePicker(false);   if (d) setEndDate(d);   }} />}
                {showEndTimePicker   && <DateTimePicker value={endTime   || new Date()} mode="time" display="clock"    onChange={(_, d) => { setShowEndTimePicker(false);   if (d) setEndTime(d);   }} />}
              </View>
            </Animated.View>
          )}

          {/* ── ÉTAPE 3 : Médias ─────────────────────────────────────────── */}
          {step === 3 && (
            <Animated.View entering={FadeInRight.springify()}>
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>PHOTOS</Text>
                <ImagePickerSection folder="events" maxImages={5} images={galleryUrls} onImagesChange={setGalleryUrls} label="Photos de l'événement" hint="1ère image = miniature · 2ème = bannière (max 5)" colors={colors} />
              </View>
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>VIDÉO PROMOTIONNELLE</Text>
                <VideoPickerField label="Vidéo publicitaire" hint="Courte vidéo de présentation de l'événement" localUri={videoLocalUri} remoteUrl={videoUrl} uploading={false} colors={colors} onPick={(uri) => { setVideoLocalUri(uri); setVideoUrl(''); }} onRemove={() => { setVideoLocalUri(''); setVideoUrl(''); }} />
              </View>
            </Animated.View>
          )}

          {/* ── ÉTAPE 4 : Révision ───────────────────────────────────────── */}
          {step === 4 && (
            <Animated.View entering={FadeInRight.springify()}>
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>RÉCAPITULATIF</Text>

                <ReviewRow icon="type"     label="Titre"      value={title}              colors={colors} />
                <ReviewRow icon="calendar" label="Type"       value={selectedTypeConfig.label} colors={colors} />
                <ReviewRow icon="tag"      label="Accès"      value={ACCESS_TYPES.find(a => a.type === accessType)?.label ?? ''} colors={colors} />

                {accessType === 'ticket' && (
                  <View style={{ marginVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                    {TICKET_TIERS.map(tier => {
                      const valMap: Record<TicketTierKey, string> = { simple: priceSimple, vip: priceVip, vvip: priceVvip, vvvip: priceVvvip };
                      if (!valMap[tier.key]) return null;
                      return (
                        <View key={tier.key} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 12 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tier.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name={tier.icon} size={13} color={tier.color} />
                          </View>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{tier.label}</Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: tier.color }}>{valMap[tier.key]} €</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                <ReviewRow icon="map-pin"  label="Ville"      value={venueCity}          colors={colors} />
                <ReviewRow icon="clock"    label="Début"      value={startDate && startTime ? `${startDate.toLocaleDateString('fr-FR')} ${startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '—'} colors={colors} />
                {endDate && <ReviewRow icon="clock" label="Fin" value={`${endDate.toLocaleDateString('fr-FR')} ${endTime?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) ?? ''}`} colors={colors} />}
                <ReviewRow icon="image"    label="Photos"     value={`${galleryUrls.length} photo${galleryUrls.length > 1 ? 's' : ''}`} colors={colors} />
              </View>
            </Animated.View>
          )}

          {/* Espace bas */}
          <View style={{ height: 20 }} />
        </ScrollView>

        {/* ── Barre navigation étapes ──────────────────────────────────────── */}
        <View style={[s.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          {step > 0 && (
            <TouchableOpacity
              onPress={goPrev}
              style={[s.draftBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
            >
              <Icon name="arrow-left" size={16} color={colors.textSecondary} />
              <Text style={[s.draftBtnText, { color: colors.textSecondary }]}>Retour</Text>
            </TouchableOpacity>
          )}

          {step === 0 && (
            <TouchableOpacity
              onPress={handleSaveDraft} disabled={saving}
              style={[s.draftBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
            >
              {saving ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Icon name="save" size={16} color={colors.textSecondary} />}
              <Text style={[s.draftBtnText, { color: colors.textSecondary }]}>Brouillon</Text>
            </TouchableOpacity>
          )}

          <Animated.View style={[{ flex: 1 }, isLastStep ? s.publishBtn : {}, publishStyle]}>
            {isLastStep ? (
              <TouchableOpacity onPress={handlePublish} disabled={saving || publishing} style={{ flex: 1 }}>
                <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.publishBtnInner}>
                  {publishing ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="globe" size={16} color="#fff" />}
                  <Text style={s.publishBtnText}>{publishing ? 'Publication...' : 'Publier'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={goNext} style={{ flex: 1 }}>
                <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.publishBtnInner}>
                  <Text style={s.publishBtnText}>Suivant</Text>
                  <Icon name="arrow-right" size={16} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ── Sous-composants ───────────────────────────────────────────────────────────

interface FieldProps {
  label: string; placeholder: string; value: string;
  onChangeText: (t: string) => void;
  onBlur?: () => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad' | 'url' | 'email-address';
  colors: any;
}
const Field: React.FC<FieldProps> = ({ label, placeholder, value, onChangeText, onBlur, multiline, keyboardType = 'default', colors }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: focused ? colors.primary : colors.inputBorder }]}>
      <Text style={[s.fieldLabel, { color: focused ? colors.primary : colors.textTertiary }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textDisabled} multiline={multiline} keyboardType={keyboardType} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur?.(); }} style={[s.fieldInput, multiline && s.fieldInputMulti, { color: colors.textPrimary }]} />
    </View>
  );
};

interface DateFieldProps { label: string; value: string | null; placeholder: string; onPress: () => void; colors: any; }
const DateField: React.FC<DateFieldProps> = ({ label, value, placeholder, onPress, colors }) => (
  <TouchableOpacity style={[s.fieldWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]} onPress={onPress}>
    <Text style={[s.fieldLabel, { color: colors.textTertiary }]}>{label}</Text>
    <Text style={[s.fieldInput, { color: value ? colors.textPrimary : colors.textDisabled }]}>{value ?? placeholder}</Text>
  </TouchableOpacity>
);

interface ReviewRowProps { icon: string; label: string; value: string; colors: any; }
const ReviewRow: React.FC<ReviewRowProps> = ({ icon, label, value, colors }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
    <Icon name={icon} size={16} color={colors.textTertiary} />
    <Text style={{ width: 80, fontSize: 12, color: colors.textTertiary, fontWeight: '600' }}>{label}</Text>
    <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>{value || '—'}</Text>
  </View>
);
