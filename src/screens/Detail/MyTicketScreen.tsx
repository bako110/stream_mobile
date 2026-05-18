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

interface Props { ticket: EventTicket; onBack: () => void; }

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// ── Thème par tier ────────────────────────────────────────────────────────────

const TIER_THEME = {
  simple: {
    label:    'STANDARD',
    sublabel: 'Accès général',
    icon:     'tag',
    gradient: ['#4F46E5', '#7B3FF2', '#9B59B6'] as string[],
    qrColor:  '#4F46E5',
    accent:   '#7B3FF2',
    deco:     '✦ ❋ ✦ ❋ ✦',
    corner:   '❊',
  },
  vip: {
    label:    'VIP',
    sublabel: 'Accès prioritaire',
    icon:     'star',
    gradient: ['#92400E', '#D97706', '#F59E0B'] as string[],
    qrColor:  '#92400E',
    accent:   '#F59E0B',
    deco:     '★ ✿ ★ ✿ ★',
    corner:   '★',
  },
  vvip: {
    label:    'VVIP',
    sublabel: 'Expérience premium',
    icon:     'award',
    gradient: ['#1E1B4B', '#4C1D95', '#7C3AED'] as string[],
    qrColor:  '#4C1D95',
    accent:   '#A78BFA',
    deco:     '✾ ❀ ✾ ❀ ✾',
    corner:   '❁',
  },
  vvvip: {
    label:    'VVVIP',
    sublabel: 'All-inclusive',
    icon:     'zap',
    gradient: ['#7F1D1D', '#991B1B', '#EF4444'] as string[],
    qrColor:  '#7F1D1D',
    accent:   '#FCA5A5',
    deco:     '♛ ✦ ♛ ✦ ♛',
    corner:   '♛',
  },
} as const;

type TierKey = keyof typeof TIER_THEME;

// ── Composant principal ───────────────────────────────────────────────────────

export const MyTicketScreen: React.FC<Props> = ({ ticket, onBack }) => {
  const { theme: { colors } } = useTheme();
  const event = ticket.event;
  const [downloading, setDownloading] = useState(false);

  const isUsed  = ticket.status === 'used' || ticket.is_used === true;
  const tierKey = ((ticket.ticket_tier ?? 'simple') as string) in TIER_THEME
    ? (ticket.ticket_tier as TierKey)
    : 'simple';
  const th = TIER_THEME[tierKey];

  const qrData = JSON.stringify({ ac: ticket.access_code, e: ticket.event_id });
  const QR_SIZE = SW * 0.42;

  const handleDownloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const token = getAuthToken();
      const url  = `${API_BASE_URL}${Endpoints.events.myTicketPdf(ticket.event_id)}`;
      const dest = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/billet_${ticket.event_id.slice(0, 8)}.pdf`;
      const res  = await ReactNativeBlobUtil.config({ path: dest })
        .fetch('GET', url, token ? { Authorization: `Bearer ${token}` } : {});
      if (Platform.OS === 'ios') {
        ReactNativeBlobUtil.ios.presentOptionsMenu(res.path());
      } else {
        await ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/pdf');
      }
    } catch (err: any) {
      Alert.alert('Erreur', `Impossible de télécharger le billet.\n${err?.message ?? String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: event?.title ?? 'Mon billet',
        message: `Mon billet ${th.label} pour "${event?.title ?? 'cet événement'}" — Réf: ${(ticket.access_code ?? ticket.id ?? '').slice(0, 8).toUpperCase()}\nVia FoliX`,
      });
    } catch { /**/ }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={th.gradient} style={[st.header, { paddingTop: Platform.OS === 'ios' ? 52 : 38 }]}>
        <TouchableOpacity onPress={onBack} style={st.hBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.hTitle}>Mon billet</Text>
          <Text style={st.hSub}>{th.label}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={handleDownloadPdf} style={st.hBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {downloading ? <ActivityIndicator size={16} color="#fff" /> : <Icon name="download" size={18} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={st.hBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="share-2" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

        {/* ── Carte billet compacte ── */}
        <View style={[st.card, { marginHorizontal: 14, marginTop: 14 }]}>
          <View style={{ borderRadius: 16, overflow: 'hidden' }}>

            {/* Bandeau haut */}
            <LinearGradient colors={th.gradient} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Coin gauche */}
                <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>{th.corner}</Text>

                {/* Badge tier centré */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
                  paddingHorizontal: 12, paddingVertical: 4 }}>
                  <Icon name={th.icon} size={12} color="#fff" />
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 1.5 }}>
                    {th.label}
                  </Text>
                </View>

                {/* Coin droit */}
                <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>{th.corner}</Text>
              </View>

              {/* Ligne déco */}
              <Text style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.35)',
                letterSpacing: 6, marginTop: 4 }}>
                {th.deco}
              </Text>

              {/* Encoche */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <View style={[st.notch, { backgroundColor: colors.background }]} />
                <View style={{ flex: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)' }} />
                <View style={[st.notch, { backgroundColor: colors.background }]} />
              </View>
            </LinearGradient>

            {/* Corps */}
            <View style={{ backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 }}>

              {/* Titre événement */}
              <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary, lineHeight: 22 }} numberOfLines={2}>
                {event?.title ?? 'Événement'}
              </Text>

              {/* Méta compacte */}
              <View style={{ gap: 4, marginTop: 6 }}>
                {event?.starts_at && (
                  <View style={st.metaRow}>
                    <Icon name="calendar" size={12} color={th.accent} />
                    <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>
                      {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
                    </Text>
                  </View>
                )}
                {(event?.venue_city || event?.venue_name) && (
                  <View style={st.metaRow}>
                    <Icon name="map-pin" size={12} color={th.accent} />
                    <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>
                      {[event.venue_name, event.venue_city].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                )}
              </View>

              {/* QR Code */}
              <View style={{ alignItems: 'center', paddingVertical: 14 }}>
                <View style={{
                  padding: 2, borderRadius: 14, borderWidth: 2, borderColor: th.accent + '80',
                }}>
                  <View style={{ padding: 8, borderRadius: 11, backgroundColor: '#fff' }}>
                    {ticket.access_code ? (
                      <QRCode
                        value={qrData}
                        size={QR_SIZE}
                        color={th.qrColor}
                        backgroundColor="#fff"
                        quietZone={6}
                      />
                    ) : (
                      <View style={{ width: QR_SIZE, height: QR_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="loader" size={28} color={th.accent} />
                      </View>
                    )}
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '600', marginTop: 6 }}>
                  {isUsed ? '⚠ Billet déjà utilisé' : 'Présente ce QR à l\'entrée'}
                </Text>
              </View>

              {/* Statut utilisé */}
              {isUsed && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                  marginBottom: 10, padding: 8, borderRadius: 8,
                  backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF4444' }}>
                  <Icon name="x-circle" size={14} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Ce billet a déjà été scanné</Text>
                </View>
              )}

              {/* Séparateur */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[st.notch, { backgroundColor: colors.background }]} />
                <View style={{ flex: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.divider }} />
                <View style={[st.notch, { backgroundColor: colors.background }]} />
              </View>

              {/* Footer 4 colonnes */}
              <View style={{ flexDirection: 'row', paddingVertical: 10 }}>
                <View style={st.footItem}>
                  <Text style={[st.footLbl, { color: colors.textTertiary }]}>N° BILLET</Text>
                  <Text style={[st.footVal, { color: colors.textPrimary }]} numberOfLines={1}>
                    #{(ticket.access_code ?? ticket.id ?? '').slice(0, 8).toUpperCase()}
                  </Text>
                </View>
                <View style={[st.footDiv, { backgroundColor: colors.divider }]} />
                <View style={st.footItem}>
                  <Text style={[st.footLbl, { color: colors.textTertiary }]}>CATÉGORIE</Text>
                  <Text style={[st.footVal, { color: th.accent, fontWeight: '900' }]}>{th.label}</Text>
                </View>
                <View style={[st.footDiv, { backgroundColor: colors.divider }]} />
                <View style={st.footItem}>
                  <Text style={[st.footLbl, { color: colors.textTertiary }]}>PRIX</Text>
                  <Text style={[st.footVal, { color: colors.textPrimary }]}>
                    {(Number(ticket.price_paid) || 0) === 0 ? 'Gratuit' : `${(Number(ticket.price_paid)).toFixed(0)} €`}
                  </Text>
                </View>
                <View style={[st.footDiv, { backgroundColor: colors.divider }]} />
                <View style={st.footItem}>
                  <Text style={[st.footLbl, { color: colors.textTertiary }]}>DATE</Text>
                  <Text style={[st.footVal, { color: colors.textPrimary }]}>
                    {new Date(ticket.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>

              {/* Bas décoratif */}
              <LinearGradient colors={[th.gradient[0] + '18', th.gradient[2] + '06']}
                style={{ paddingVertical: 6, marginHorizontal: -16 }}>
                <Text style={{ textAlign: 'center', fontSize: 9, color: th.accent,
                  opacity: 0.7, letterSpacing: 8 }}>
                  {th.deco}
                </Text>
              </LinearGradient>

            </View>
          </View>
        </View>

        {/* Statut global */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginHorizontal: 14, marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1,
          backgroundColor: isUsed ? '#EF444418' : '#10B98118',
          borderColor:     isUsed ? '#EF4444'   : '#10B981',
        }}>
          <Icon name={isUsed ? 'check-circle' : 'shield'} size={14} color={isUsed ? '#EF4444' : '#10B981'} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: isUsed ? '#EF4444' : '#10B981' }}>
            {isUsed ? 'Billet déjà utilisé' : "Billet valide — prêt pour l'entrée"}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  hBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  hTitle: { fontSize: 15, fontWeight: '900', color: '#fff' },
  hSub:   { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 1 },

  card:    { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  notch:   { width: 20, height: 20, borderRadius: 10, marginHorizontal: -10 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },

  footItem: { flex: 1, alignItems: 'center', gap: 3 },
  footLbl:  { fontSize: 8, fontWeight: '700', letterSpacing: 0.3 },
  footVal:  { fontSize: 11, fontWeight: '700' },
  footDiv:  { width: 1, height: 26 },
});
