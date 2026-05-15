import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Share, Platform, StatusBar, Dimensions, ActivityIndicator, Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useTheme } from '../../hooks/useTheme';
import type { EventTicket } from '../../types/event';
import { getAuthToken } from '../../api';
import { API_BASE_URL } from '../../utils/constants';
import { Endpoints } from '../../api/endpoints';

const { width: SW } = Dimensions.get('window');

interface Props {
  ticket: EventTicket;
  onBack: () => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const MyTicketScreen: React.FC<Props> = ({ ticket, onBack }) => {
  const { theme: { colors } } = useTheme();
  const event = ticket.event;
  const [downloading, setDownloading] = useState(false);

  // is_used : compatibilité avec l'ancien champ + le nouveau champ status
  const isUsed = ticket.status === 'used' || ticket.is_used === true;

  // QR encode access_code + event_id — le scanner appelle GET /events/{e}/scan/{ac}
  const qrData = JSON.stringify({
    ac: ticket.access_code,
    e:  ticket.event_id,
  });

  const handleDownloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const token = getAuthToken();
      const url = `${API_BASE_URL}${Endpoints.events.myTicketPdf(ticket.event_id)}`;
      const dest = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/billet_${ticket.event_id.slice(0, 8)}.pdf`;
      const res = await ReactNativeBlobUtil.config({ path: dest })
        .fetch('GET', url, token ? { Authorization: `Bearer ${token}` } : {});
      if (Platform.OS === 'ios') {
        ReactNativeBlobUtil.ios.presentOptionsMenu(res.path());
      } else {
        await ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/pdf');
      }
    } catch (err: any) {
      console.error('[MyTicketScreen] download error:', err?.message ?? err);
      Alert.alert('Erreur', `Impossible de telecharger le billet.\n${err?.message ?? String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: event?.title ?? 'Mon billet',
        message: `Mon billet pour "${event?.title ?? 'cet événement'}" — Réf: ${(ticket.access_code ?? ticket.id ?? '').slice(0, 8).toUpperCase()}\nVia FoliX`,
      });
    } catch { /**/ }
  };

  const QR_SIZE = SW * 0.6;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[st.header, { paddingTop: Platform.OS === 'ios' ? 56 : 42 }]}
      >
        <TouchableOpacity onPress={onBack} style={st.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Mon billet</Text>
        <View style={st.headerActions}>
          <TouchableOpacity onPress={handleDownloadPdf} style={st.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {downloading
              ? <ActivityIndicator size={18} color="#fff" />
              : <Icon name="download" size={20} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={st.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="share-2" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Carte billet */}
        <View style={[st.ticketCard, { backgroundColor: colors.surface }]}>

          {/* Encoche haut */}
          <View style={st.notchRow}>
            <View style={[st.notch, { backgroundColor: colors.background }]} />
            <View style={[st.dashedLine, { borderColor: colors.divider }]} />
            <View style={[st.notch, { backgroundColor: colors.background }]} />
          </View>

          {/* Titre événement */}
          <View style={st.eventInfo}>
            <Text style={[st.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {event?.title ?? 'Événement'}
            </Text>
            {event?.starts_at && (
              <View style={st.metaRow}>
                <Icon name="calendar" size={13} color={colors.primary} />
                <Text style={[st.metaTxt, { color: colors.textSecondary }]}>
                  {formatDate(event.starts_at)} à {formatTime(event.starts_at)}
                </Text>
              </View>
            )}
            {(event?.venue_city || event?.venue_name) && (
              <View style={st.metaRow}>
                <Icon name="map-pin" size={13} color={colors.primary} />
                <Text style={[st.metaTxt, { color: colors.textSecondary }]}>
                  {[event.venue_name, event.venue_city].filter(Boolean).join(' — ')}
                </Text>
              </View>
            )}
          </View>

          {/* QR Code */}
          <View style={[st.qrWrap, { backgroundColor: '#fff' }]}>
            {ticket.access_code ? (
              <QRCode
                value={qrData}
                size={QR_SIZE}
                color="#000"
                backgroundColor="#fff"
                quietZone={16}
              />
            ) : (
              <View style={{ width: QR_SIZE, height: QR_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="loader" size={40} color={colors.textTertiary} />
                <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 8 }}>QR en chargement...</Text>
              </View>
            )}
          </View>

          {/* Statut utilisé */}
          {isUsed && (
            <View style={[st.usedBanner, { backgroundColor: '#EF444418', borderColor: '#EF4444' }]}>
              <Icon name="x-circle" size={16} color="#EF4444" />
              <Text style={st.usedTxt}>Ce billet a déjà été scanné</Text>
            </View>
          )}

          {/* Instruction scan */}
          {!isUsed && (
            <Text style={[st.scanHint, { color: colors.textTertiary }]}>
              Présente ce QR code à l'entrée pour valider ta place
            </Text>
          )}

          {/* Encoche bas */}
          <View style={st.notchRow}>
            <View style={[st.notch, { backgroundColor: colors.background }]} />
            <View style={[st.dashedLine, { borderColor: colors.divider }]} />
            <View style={[st.notch, { backgroundColor: colors.background }]} />
          </View>

          {/* Pied de billet */}
          <View style={st.ticketFoot}>
            <View style={st.footItem}>
              <Text style={[st.footLabel, { color: colors.textTertiary }]}>N° billet</Text>
              <Text style={[st.footValue, { color: colors.textPrimary }]} numberOfLines={1}>
                #{(ticket.access_code ?? ticket.id ?? '').slice(0, 8).toUpperCase()}
              </Text>
            </View>
            <View style={[st.footDivider, { backgroundColor: colors.divider }]} />
            <View style={st.footItem}>
              <Text style={[st.footLabel, { color: colors.textTertiary }]}>Prix payé</Text>
              <Text style={[st.footValue, { color: colors.textPrimary }]}>
                {(Number(ticket.price_paid) || 0) === 0
                  ? 'Gratuit'
                  : `${(Number(ticket.price_paid) || 0).toFixed(2)} €`}
              </Text>
            </View>
            <View style={[st.footDivider, { backgroundColor: colors.divider }]} />
            <View style={st.footItem}>
              <Text style={[st.footLabel, { color: colors.textTertiary }]}>Acheté le</Text>
              <Text style={[st.footValue, { color: colors.textPrimary }]}>
                {new Date(ticket.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          </View>

        </View>

        {/* Badge statut global */}
        <View style={[st.statusBadge, {
          backgroundColor: isUsed ? '#EF444418' : '#10B98118',
          borderColor:     isUsed ? '#EF4444'   : '#10B981',
        }]}>
          <Icon
            name={isUsed ? 'check-circle' : 'shield'}
            size={16}
            color={isUsed ? '#EF4444' : '#10B981'}
          />
          <Text style={[st.statusTxt, { color: isUsed ? '#EF4444' : '#10B981' }]}>
            {isUsed ? 'Billet déjà utilisé' : "Billet valide — prêt pour l'entrée"}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 18, fontWeight: '800', color: '#fff' },

  ticketCard:  { marginHorizontal: 20, marginTop: 24, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },

  notchRow:    { flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
  notch:       { width: 22, height: 22, borderRadius: 11, marginHorizontal: -11 },
  dashedLine:  { flex: 1, borderTopWidth: 1.5, borderStyle: 'dashed' },

  eventInfo:   { paddingHorizontal: 24, paddingVertical: 20, gap: 8 },
  eventTitle:  { fontSize: 20, fontWeight: '900', lineHeight: 26 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaTxt:     { fontSize: 13, lineHeight: 18 },

  qrWrap:      { alignSelf: 'center', borderRadius: 16, padding: 16, marginVertical: 8 },

  usedBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 24, marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
  usedTxt:     { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  scanHint:    { textAlign: 'center', fontSize: 12, paddingHorizontal: 24, marginTop: 12, lineHeight: 18 },

  ticketFoot:  { flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 16, alignItems: 'center' },
  footItem:    { flex: 1, alignItems: 'center', gap: 4 },
  footLabel:   { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  footValue:   { fontSize: 13, fontWeight: '700' },
  footDivider: { width: 1, height: 32 },

  statusBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1 },
  statusTxt:   { fontSize: 13, fontWeight: '700' },
});
