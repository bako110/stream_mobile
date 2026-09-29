import React, { useEffect, useState } from 'react';
import { BackButton } from '../../components/common';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import { showWithdrawUnavailable } from '../../utils/withdrawAlert';

type MonetStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface RowItem {
  icon: string;
  label: string;
  sub: string;
  screen: string;
}

// Une seule couleur d'accent pour tout l'écran (plus d'accent par section ni
// par ligne) — même parti pris que SettingsMonetisationScreen désaturé.
const SECTIONS: { title: string; rows: RowItem[] }[] = [
  {
    title: 'Revenus & Gains',
    rows: [
      { icon: 'trending-up',  label: 'Statistiques',       sub: 'Vues, audience, évolution par contenu', screen: 'CreatorAnalytics' },
      { icon: 'dollar-sign',  label: 'Revenus détaillés',  sub: 'Historique, par mois, par reel',       screen: 'RevenueDetail' },
      { icon: 'credit-card',  label: 'Retirer mes gains',   sub: 'Bientôt sur l\'app — via gofolyx.com', screen: 'Withdraw' },
    ],
  },
  {
    title: 'GoGold & Achats',
    rows: [
      { icon: 'shopping-bag', label: 'Acheter des GoGold',   sub: 'Packs de GoGold via Stripe',            screen: 'BuyGoGold' },
      { icon: 'send',         label: 'Transférer des GoGold',sub: 'Envoyer des GoGold à un utilisateur',   screen: 'Transfer' },
    ],
  },
  {
    title: 'Visibilité',
    rows: [
      { icon: 'zap',          label: 'Booster mon compte',  sub: 'Abonnés, vues, portée de contenu',     screen: 'Boost' },
    ],
  },
];

const GATE_CONFIG: Record<MonetStatus, { icon: string; title: string; message: string }> = {
  none:     { icon: 'lock',        title: 'Monetisation non activee',    message: 'Soumettez une demande pour acceder a votre espace createur.' },
  pending:  { icon: 'clock',       title: 'Demande en cours d\'examen',  message: 'Notre equipe examine votre dossier. Vous serez notifie des la decision.' },
  rejected: { icon: 'x-circle',    title: 'Demande refusee',             message: 'Votre demande a ete refusee. Soumettez une nouvelle demande.' },
  approved: { icon: 'check-circle',title: '',                            message: '' },
};

export function MonetisationScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const ACCENT = colors.primary;

  // preloadedStatus — transmis par SettingsMonetisationScreen quand il vient de
  // rediriger ici (statut 'approved' déjà connu, appel réseau déjà fait) : évite
  // un second fetch et un second spinner qui se succéderaient visiblement à la
  // suite du premier lors de la transition entre les deux écrans.
  const preloadedStatus: MonetStatus | undefined = route.params?.preloadedStatus;

  const [monetStatus, setMonetStatus] = useState<MonetStatus | null>(preloadedStatus ?? null);
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [fetching, setFetching] = useState(!preloadedStatus);

  useEffect(() => {
    if (preloadedStatus) return;
    apiClient
      .get<{ status: MonetStatus; admin_note: string | null }>(Endpoints.monetization.status)
      .then(res => {
        setMonetStatus(res.data.status);
        setAdminNote(res.data.admin_note ?? null);
      })
      .catch(() => setMonetStatus('none'))
      .finally(() => setFetching(false));
  }, [preloadedStatus]);

  if (fetching) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  if (monetStatus !== 'approved') {
    const cfg = GATE_CONFIG[monetStatus ?? 'none'];
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 16 }]}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Monetisation</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
          <View style={[gateStyles.iconWrap, { backgroundColor: ACCENT + '15' }]}>
            <Icon name={cfg.icon} size={36} color={ACCENT} />
          </View>
          <Text style={[gateStyles.title, { color: colors.textPrimary }]}>{cfg.title}</Text>
          <Text style={[gateStyles.message, { color: colors.textSecondary }]}>{cfg.message}</Text>
          {monetStatus === 'rejected' && adminNote && (
            <View style={[gateStyles.reasonBox, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[gateStyles.reasonLabel, { color: colors.textTertiary }]}>Motif du refus</Text>
              <Text style={[gateStyles.reasonText, { color: colors.textSecondary }]}>{adminNote}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[gateStyles.btn, { backgroundColor: ACCENT }]}
            onPress={() => nav.navigate('MonetisationRequest')}
          >
            <Icon name="bar-chart-2" size={16} color="#fff" />
            <Text style={gateStyles.btnText}>Faire une demande</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Monétisation</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {SECTIONS.map(sec => (
          <View key={sec.title} style={styles.section}>
            <View style={[styles.sectionHeader, { borderLeftColor: ACCENT }]}>
              <Text style={[styles.sectionTitle, { color: ACCENT }]}>{sec.title.toUpperCase()}</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
              {sec.rows.map((row, i) => (
                <TouchableOpacity
                  key={row.screen}
                  style={[
                    styles.row,
                    i < sec.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                  ]}
                  onPress={() => (row.screen === 'Withdraw' ? showWithdrawUnavailable() : nav.navigate(row.screen))}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconWrap, { backgroundColor: ACCENT + '22' }]}>
                    <Icon name={row.icon} size={18} color={ACCENT} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{row.label}</Text>
                    <Text style={[styles.rowSub, { color: colors.textTertiary }]}>{row.sub}</Text>
                  </View>
                  <Icon name="chevron-right" size={15} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const gateStyles = StyleSheet.create({
  iconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message:  { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  btn:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 8 },
  btnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  reasonBox:   { borderRadius: 12, padding: 14, gap: 4, width: '100%' },
  reasonLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  reasonText:  { fontSize: 13, lineHeight: 19 },
});

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  scroll:       { padding: 16 },
  section:      { marginBottom: 8 },
  sectionHeader:{ borderLeftWidth: 3, paddingLeft: 10, marginBottom: 8, marginTop: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  card:         { borderRadius: 14, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  iconWrap:     { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel:     { fontSize: 14, fontWeight: '600' },
  rowSub:       { fontSize: 12, marginTop: 2 },
});
