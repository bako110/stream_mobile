import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, ActivityIndicator, ScrollView,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { eventService } from '../../services/eventService';
import type { TicketScanResult } from '../../types';

interface Props {
  eventId: string;
  eventTitle: string;
  onBack: () => void;
}

type ScanState = 'scanning' | 'loading' | 'result';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const TicketScannerScreen: React.FC<Props> = ({ eventId, eventTitle, onBack }) => {
  const { theme: { colors } } = useTheme();
  const device = useCameraDevice('back');

  const [state, setState] = useState<ScanState>('scanning');
  const [result, setResult] = useState<TicketScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handleCode = useCallback(async (accessCode: string) => {
    if (state !== 'scanning') return;
    setState('loading');
    setError(null);
    try {
      const data = await eventService.scanTicket(eventId, accessCode);
      setResult(data);
      setState('result');
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Billet introuvable');
      setState('result');
    }
  }, [state, eventId]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      const raw = codes[0]?.value;
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.ac && parsed.e === eventId) {
          handleCode(parsed.ac);
        } else if (parsed.e !== eventId) {
          setError("Ce billet n'est pas pour cet événement");
          setState('result');
        } else {
          setError('QR code non reconnu');
          setState('result');
        }
      } catch {
        setError('QR code invalide');
        setState('result');
      }
    },
  });

  const handleValidate = async () => {
    if (!result) return;
    setValidating(true);
    try {
      const updated = await eventService.validateTicketByQr(eventId, result.access_code);
      setResult(updated);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Impossible de valider le billet');
    } finally {
      setValidating(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setState('scanning');
  };

  const isValid = result?.is_valid ?? false;
  const statusColor = error ? '#EF4444' : isValid ? '#10B981' : '#F59E0B';
  const statusIcon  = error ? 'x-circle' : isValid ? 'check-circle' : 'alert-circle';
  const statusLabel = error
    ? error
    : isValid
    ? 'Billet valide'
    : result?.status === 'used'
    ? 'Billet déjà scanné'
    : `Statut : ${result?.status ?? '—'}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[st.header, { paddingTop: Platform.OS === 'ios' ? 56 : 42 }]}
      >
        <TouchableOpacity onPress={onBack} style={st.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={st.headerTitle} numberOfLines={1}>Scanner les billets</Text>
          <Text style={st.headerSub} numberOfLines={1}>{eventTitle}</Text>
        </View>
      </LinearGradient>

      {/* Camera / Result */}
      {state === 'scanning' && device ? (
        <View style={{ flex: 1 }}>
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            codeScanner={codeScanner}
          />
          {/* Viseur */}
          <View style={st.overlay}>
            <View style={st.viewfinder}>
              <View style={[st.corner, st.tl]} />
              <View style={[st.corner, st.tr]} />
              <View style={[st.corner, st.bl]} />
              <View style={[st.corner, st.br]} />
            </View>
            <Text style={st.hint}>Pointez la caméra vers le QR code du billet</Text>
          </View>
        </View>
      ) : state === 'loading' ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[st.loadingTxt, { color: '#fff' }]}>Vérification en cours...</Text>
        </View>
      ) : (
        /* Résultat du scan */
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        >
          {/* Badge statut */}
          <View style={[st.statusBadge, { backgroundColor: `${statusColor}18`, borderColor: statusColor }]}>
            <Icon name={statusIcon} size={22} color={statusColor} />
            <Text style={[st.statusTxt, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {result && (
            <>
              {/* Infos utilisateur */}
              <View style={[st.card, { backgroundColor: colors.surface }]}>
                <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Participant</Text>
                <View style={st.userRow}>
                  <View style={[st.avatar, { backgroundColor: colors.divider }]}>
                    {result.user.avatar_url ? (
                      // eslint-disable-next-line @typescript-eslint/no-var-requires
                      <View style={st.avatarImg}>
                        {/* Image chargée via uri — on utilise le composant natif */}
                        {React.createElement(
                          require('react-native').Image,
                          { source: { uri: result.user.avatar_url }, style: StyleSheet.absoluteFill, resizeMode: 'cover' }
                        )}
                      </View>
                    ) : (
                      <Icon name="user" size={28} color={colors.textTertiary} />
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={st.nameRow}>
                      <Text style={[st.displayName, { color: colors.textPrimary }]}>
                        {result.user.display_name ?? result.user.username ?? 'Utilisateur'}
                      </Text>
                      {result.user.is_verified && (
                        <Icon name="check-circle" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                    {result.user.username && (
                      <Text style={[st.username, { color: colors.textSecondary }]}>@{result.user.username}</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Infos billet */}
              <View style={[st.card, { backgroundColor: colors.surface }]}>
                <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Billet</Text>
                <InfoRow icon="hash" label="Référence" value={result.access_code.slice(0, 12).toUpperCase()} colors={colors} />
                <InfoRow icon="tag" label="Prix payé"
                  value={(Number(result.price_paid) || 0) === 0 ? 'Gratuit' : `${(Number(result.price_paid) || 0).toFixed(2)} €`}
                  colors={colors} />
                <InfoRow icon="calendar" label="Acheté le"
                  value={new Date(result.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  colors={colors} />
                {result.used_at && (
                  <InfoRow icon="clock" label="Scanné le"
                    value={`${formatDate(result.used_at)} à ${formatTime(result.used_at)}`}
                    colors={colors} />
                )}
              </View>

              {/* Infos événement */}
              <View style={[st.card, { backgroundColor: colors.surface }]}>
                <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Événement</Text>
                <InfoRow icon="star" label="Titre" value={result.event.title} colors={colors} />
                <InfoRow icon="calendar" label="Date"
                  value={`${formatDate(result.event.starts_at)} à ${formatTime(result.event.starts_at)}`}
                  colors={colors} />
                {result.event.ends_at && (
                  <InfoRow icon="clock" label="Fin"
                    value={`${formatDate(result.event.ends_at)} à ${formatTime(result.event.ends_at)}`}
                    colors={colors} />
                )}
                {(result.event.venue_name || result.event.venue_city) && (
                  <InfoRow icon="map-pin"
                    label="Lieu"
                    value={[result.event.venue_name, result.event.venue_address, result.event.venue_city]
                      .filter(Boolean).join(', ')}
                    colors={colors} />
                )}
              </View>

              {/* Actions */}
              {isValid && (
                <TouchableOpacity
                  style={[st.validateBtn, { backgroundColor: '#10B981' }]}
                  onPress={handleValidate}
                  disabled={validating}
                >
                  {validating
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Icon name="check" size={18} color="#fff" />
                        <Text style={st.validateTxt}>Valider l'entrée</Text>
                      </>
                  }
                </TouchableOpacity>
              )}
            </>
          )}

          <TouchableOpacity style={[st.scanAgainBtn, { borderColor: colors.primary }]} onPress={reset}>
            <Icon name="camera" size={16} color={colors.primary} />
            <Text style={[st.scanAgainTxt, { color: colors.primary }]}>Scanner un autre billet</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const InfoRow: React.FC<{
  icon: string; label: string; value: string; colors: any;
}> = ({ icon, label, value, colors }) => (
  <View style={st.infoRow}>
    <Icon name={icon as any} size={14} color={colors.primary} style={{ marginTop: 1 }} />
    <View style={{ flex: 1, marginLeft: 8 }}>
      <Text style={[st.infoLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[st.infoValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  </View>
);

const CORNER = 24;
const st = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub:    { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  overlay:      { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  viewfinder:   { width: 240, height: 240, position: 'relative' },
  corner:       { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff', borderWidth: 3 },
  tl:           { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  tr:           { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  bl:           { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  br:           { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  hint:         { color: '#fff', fontSize: 13, textAlign: 'center', marginTop: 24, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },

  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingTxt:   { fontSize: 15, fontWeight: '600' },

  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 14, borderWidth: 1.5, marginBottom: 16 },
  statusTxt:    { fontSize: 15, fontWeight: '700', flex: 1 },

  card:         { borderRadius: 14, padding: 16, marginBottom: 12, gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },

  userRow:      { flexDirection: 'row', alignItems: 'center' },
  avatar:       { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:    { ...StyleSheet.absoluteFillObject },
  nameRow:      { flexDirection: 'row', alignItems: 'center' },
  displayName:  { fontSize: 17, fontWeight: '700' },
  username:     { fontSize: 13, marginTop: 2 },

  infoRow:      { flexDirection: 'row', alignItems: 'flex-start' },
  infoLabel:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue:    { fontSize: 14, fontWeight: '600', marginTop: 2 },

  validateBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 14, marginBottom: 12 },
  validateTxt:  { color: '#fff', fontSize: 15, fontWeight: '800' },

  scanAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  scanAgainTxt: { fontSize: 14, fontWeight: '700' },
});
