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
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// ── Config visuelle par tier ──────────────────────────────────────────────────

const TIER_THEME = {
  simple: {
    label:      'STANDARD',
    sublabel:   'Accès général',
    icon:       'tag',
    gradient:   ['#4F46E5', '#7B3FF2', '#9B59B6'] as string[],
    qrColor:    '#4F46E5',
    accent:     '#7B3FF2',
    shine:      'rgba(255,255,255,0.08)',
    // Ornements — fleurs simples / géométrique
    ornementsTop: ['✦', '❋', '✦', '❋', '✦'],
    ornementsCorner: '❊',
    pattern: 'geo',
    deco: ['✿', '✾', '✿', '✾'],
    borderStyle: 'solid' as const,
  },
  vip: {
    label:      'VIP',
    sublabel:   'Accès prioritaire',
    icon:       'star',
    gradient:   ['#92400E', '#D97706', '#F59E0B'] as string[],
    qrColor:    '#92400E',
    accent:     '#F59E0B',
    shine:      'rgba(255,215,0,0.12)',
    ornementsTop: ['★', '✿', '★', '✿', '★'],
    ornementsCorner: '✦',
    pattern: 'floral',
    deco: ['🌸', '⋆', '🌸', '⋆'],
    borderStyle: 'solid' as const,
  },
  vvip: {
    label:      'VVIP',
    sublabel:   'Expérience premium',
    icon:       'award',
    gradient:   ['#1E1B4B', '#4C1D95', '#7C3AED'] as string[],
    qrColor:    '#4C1D95',
    accent:     '#A78BFA',
    shine:      'rgba(167,139,250,0.15)',
    ornementsTop: ['✾', '❀', '✾', '❀', '✾'],
    ornementsCorner: '❁',
    pattern: 'rose',
    deco: ['✿', '❋', '✿', '❋'],
    borderStyle: 'solid' as const,
  },
  vvvip: {
    label:      'VVVIP',
    sublabel:   'All-inclusive',
    icon:       'zap',
    gradient:   ['#7F1D1D', '#991B1B', '#EF4444'] as string[],
    qrColor:    '#7F1D1D',
    accent:     '#FCA5A5',
    shine:      'rgba(252,165,165,0.15)',
    ornementsTop: ['♛', '✦', '♛', '✦', '♛'],
    ornementsCorner: '♛',
    pattern: 'crown',
    deco: ['♛', '✦', '♛', '✦'],
    borderStyle: 'solid' as const,
  },
} as const;

type TierKey = keyof typeof TIER_THEME;

// ── Ornements SVG-like en texte ───────────────────────────────────────────────

const OrnementBar: React.FC<{ symbols: readonly string[]; color: string; size?: number }> = ({ symbols, color, size = 14 }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 6 }}>
    {symbols.map((s, i) => (
      <Text key={i} style={{ fontSize: size, color, opacity: i % 2 === 0 ? 1 : 0.5 }}>{s}</Text>
    ))}
  </View>
);

const CornerOrnement: React.FC<{ symbol: string; color: string; position: 'tl' | 'tr' | 'bl' | 'br' }> = ({ symbol, color, position }) => {
  const posStyle: any = {
    position: 'absolute',
    top:    position.startsWith('t') ? 8 : undefined,
    bottom: position.startsWith('b') ? 8 : undefined,
    left:   position.endsWith('l')   ? 8 : undefined,
    right:  position.endsWith('r')   ? 8 : undefined,
  };
  return <Text style={[posStyle, { fontSize: 18, color, opacity: 0.35 }]}>{symbol}</Text>;
};

// Motif de fond spécifique au tier
const TierBackground: React.FC<{ tierKey: TierKey; th: typeof TIER_THEME[TierKey] }> = ({ tierKey, th }) => {
  if (tierKey === 'simple') {
    // Losanges géométriques en arrière-plan
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[0,1,2,3,4].map(i => (
          <Text key={i} style={{
            position: 'absolute', fontSize: 40, opacity: 0.04, color: '#fff',
            top: 20 + i * 60, left: i % 2 === 0 ? 10 : SW * 0.5,
          }}>◇</Text>
        ))}
      </View>
    );
  }
  if (tierKey === 'vip') {
    // Fleurs et étoiles dorées
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {['🌺','✦','🌸','★','🌺','✦'].map((s, i) => (
          <Text key={i} style={{
            position: 'absolute', fontSize: i % 2 === 0 ? 28 : 18, opacity: 0.1,
            top: 10 + i * 55, left: i % 3 === 0 ? 8 : i % 3 === 1 ? SW * 0.45 : SW * 0.75,
          }}>{s}</Text>
        ))}
      </View>
    );
  }
  if (tierKey === 'vvip') {
    // Roses et motifs arabesques
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {['❀','✾','❁','✿','❀','✾','❁'].map((s, i) => (
          <Text key={i} style={{
            position: 'absolute', fontSize: i % 2 === 0 ? 32 : 20, opacity: 0.08,
            top: 5 + i * 50, left: i % 3 === 0 ? 5 : i % 3 === 1 ? SW * 0.4 : SW * 0.72,
          }}>{s}</Text>
        ))}
      </View>
    );
  }
  // vvvip — couronnes et éclairs royaux
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {['♛','✦','♔','⚜','♛','✦','♔'].map((s, i) => (
        <Text key={i} style={{
          position: 'absolute', fontSize: i % 2 === 0 ? 30 : 20, opacity: 0.09,
          top: 8 + i * 50, left: i % 3 === 0 ? 6 : i % 3 === 1 ? SW * 0.42 : SW * 0.73,
        }}>{s}</Text>
      ))}
    </View>
  );
};

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
  const QR_SIZE = SW * 0.52;

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

      {/* ── Header gradient tier ── */}
      <LinearGradient colors={th.gradient} style={[st.header, { paddingTop: Platform.OS === 'ios' ? 52 : 38 }]}>
        <TouchableOpacity onPress={onBack} style={st.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.headerTitle}>Mon billet</Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', letterSpacing: 1 }}>
            {th.label}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={handleDownloadPdf} style={st.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {downloading ? <ActivityIndicator size={18} color="#fff" /> : <Icon name="download" size={20} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={st.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="share-2" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Carte billet ── */}
        <View style={[st.cardShadow, { marginHorizontal: 16, marginTop: 24 }]}>
          <View style={{ borderRadius: 22, overflow: 'hidden' }}>

            {/* ── Bandeau haut coloré avec ornements ── */}
            <LinearGradient colors={th.gradient} style={{ paddingTop: 20, paddingBottom: 0 }}>
              <TierBackground tierKey={tierKey} th={th} />
              <CornerOrnement symbol={th.ornementsCorner} color="#fff" position="tl" />
              <CornerOrnement symbol={th.ornementsCorner} color="#fff" position="tr" />

              {/* Ornements haut */}
              <OrnementBar symbols={th.ornementsTop} color="#fff" size={13} />

              {/* Titre tier */}
              <View style={{ alignItems: 'center', paddingVertical: 10, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 3, fontWeight: '700' }}>
                    ────
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
                    paddingHorizontal: 14, paddingVertical: 5 }}>
                    <Icon name={th.icon} size={14} color="#fff" />
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 2 }}>
                      {th.label}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 3, fontWeight: '700' }}>
                    ────
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600', letterSpacing: 0.5 }}>
                  {th.sublabel}
                </Text>
              </View>

              {/* Ornements bas du bandeau */}
              <OrnementBar symbols={th.deco} color="#fff" size={16} />

              {/* Demi-cercles encoche */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <View style={[st.notch, { backgroundColor: colors.background }]} />
                <View style={{ flex: 1, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)' }} />
                <View style={[st.notch, { backgroundColor: colors.background }]} />
              </View>
            </LinearGradient>

            {/* ── Corps blanc/surface ── */}
            <View style={{ backgroundColor: colors.surface }}>

              {/* Infos événement */}
              <View style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12, gap: 8 }}>
                <Text style={{ fontSize: 19, fontWeight: '900', color: colors.textPrimary, lineHeight: 25 }} numberOfLines={2}>
                  {event?.title ?? 'Événement'}
                </Text>
                {event?.starts_at && (
                  <View style={st.metaRow}>
                    <Icon name="calendar" size={13} color={th.accent} />
                    <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }}>
                      {formatDate(event.starts_at)} à {formatTime(event.starts_at)}
                    </Text>
                  </View>
                )}
                {(event?.venue_city || event?.venue_name) && (
                  <View style={st.metaRow}>
                    <Icon name="map-pin" size={13} color={th.accent} />
                    <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }}>
                      {[event.venue_name, event.venue_city].filter(Boolean).join(' — ')}
                    </Text>
                  </View>
                )}
              </View>

              {/* QR Code avec cadre décoratif tier */}
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                {/* Cadre décoratif */}
                <View style={{
                  padding: 3, borderRadius: 18,
                  borderWidth: 2, borderColor: th.accent + '60',
                  backgroundColor: th.shine,
                }}>
                  <View style={{ padding: 12, borderRadius: 14, backgroundColor: '#fff' }}>
                    {ticket.access_code ? (
                      <QRCode
                        value={qrData}
                        size={QR_SIZE}
                        color={th.qrColor}
                        backgroundColor="#fff"
                        quietZone={10}
                      />
                    ) : (
                      <View style={{ width: QR_SIZE, height: QR_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="loader" size={36} color={th.accent} />
                      </View>
                    )}
                  </View>
                </View>

                {/* Ornements autour QR */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <Text style={{ fontSize: 13, color: th.accent, opacity: 0.6 }}>{th.ornementsTop[0]}</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '600' }}>
                    {isUsed ? 'Billet déjà utilisé' : 'Présente ce QR à l\'entrée'}
                  </Text>
                  <Text style={{ fontSize: 13, color: th.accent, opacity: 0.6 }}>{th.ornementsTop[0]}</Text>
                </View>
              </View>

              {/* Statut utilisé */}
              {isUsed && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                  marginHorizontal: 20, marginBottom: 8, padding: 10, borderRadius: 10,
                  backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF4444' }}>
                  <Icon name="x-circle" size={16} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Ce billet a déjà été scanné</Text>
                </View>
              )}

              {/* Séparateur */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 0 }}>
                <View style={[st.notch, { backgroundColor: colors.background }]} />
                <View style={{ flex: 1, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.divider }} />
                <View style={[st.notch, { backgroundColor: colors.background }]} />
              </View>

              {/* Pied de billet */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14 }}>
                <View style={st.footItem}>
                  <Text style={[st.footLabel, { color: colors.textTertiary }]}>N° billet</Text>
                  <Text style={[st.footValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    #{(ticket.access_code ?? ticket.id ?? '').slice(0, 8).toUpperCase()}
                  </Text>
                </View>
                <View style={[st.footDiv, { backgroundColor: colors.divider }]} />
                <View style={st.footItem}>
                  <Text style={[st.footLabel, { color: colors.textTertiary }]}>Catégorie</Text>
                  <Text style={[st.footValue, { color: th.accent, fontWeight: '900' }]}>{th.label}</Text>
                </View>
                <View style={[st.footDiv, { backgroundColor: colors.divider }]} />
                <View style={st.footItem}>
                  <Text style={[st.footLabel, { color: colors.textTertiary }]}>Prix payé</Text>
                  <Text style={[st.footValue, { color: colors.textPrimary }]}>
                    {(Number(ticket.price_paid) || 0) === 0 ? 'Gratuit' : `${(Number(ticket.price_paid)).toFixed(2)} €`}
                  </Text>
                </View>
                <View style={[st.footDiv, { backgroundColor: colors.divider }]} />
                <View style={st.footItem}>
                  <Text style={[st.footLabel, { color: colors.textTertiary }]}>Date</Text>
                  <Text style={[st.footValue, { color: colors.textPrimary }]}>
                    {new Date(ticket.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>

              {/* Bas décoratif */}
              <LinearGradient colors={[th.gradient[2] + '22', th.gradient[0] + '08']}
                style={{ paddingVertical: 10 }}>
                <OrnementBar symbols={th.ornementsTop} color={th.accent} size={11} />
              </LinearGradient>

            </View>
          </View>
        </View>

        {/* ── Badge statut global ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1,
          backgroundColor: isUsed ? '#EF444418' : '#10B98118',
          borderColor:     isUsed ? '#EF4444'   : '#10B981',
        }}>
          <Icon name={isUsed ? 'check-circle' : 'shield'} size={16} color={isUsed ? '#EF4444' : '#10B981'} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: isUsed ? '#EF4444' : '#10B981' }}>
            {isUsed ? 'Billet déjà utilisé' : "Billet valide — prêt pour l'entrée"}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#fff' },

  cardShadow: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },

  notch:   { width: 24, height: 24, borderRadius: 12, marginHorizontal: -12 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },

  footItem:  { flex: 1, alignItems: 'center', gap: 4 },
  footLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  footValue: { fontSize: 12, fontWeight: '700' },
  footDiv:   { width: 1, height: 30 },
});
