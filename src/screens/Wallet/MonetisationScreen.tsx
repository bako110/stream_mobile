import React, { useEffect, useState } from 'react';
import { BackButton } from '../../components/common';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';

type MonetStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface RowItem {
  icon: string;
  color: string;
  label: string;
  sub: string;
  screen: string;
}

const SECTIONS: { title: string; accent: string; rows: RowItem[] }[] = [
  {
    title: 'Revenus & Gains',
    accent: '#FFD700',
    rows: [
      { icon: 'bar-chart-2',  color: '#7B3FF2', label: 'Dashboard Créateur',  sub: 'Vues, cadeaux, revenus du mois',       screen: 'CreatorDashboard' },
      { icon: 'trending-up',  color: '#8B5CF6', label: 'Mes statistiques',    sub: 'Vues, likes, partages par contenu',    screen: 'CreatorStats' },
      { icon: 'credit-card',  color: '#10B981', label: 'Retirer mes gains',   sub: 'Virement bancaire ou Mobile Money',    screen: 'Withdraw' },
    ],
  },
  {
    title: 'GoGold & Achats',
    accent: '#FF8C00',
    rows: [
      { icon: 'shopping-bag', color: '#FF8C00', label: 'Acheter des GoGold',   sub: 'Packs de GoGold via Stripe',            screen: 'BuyGoGold' },
      { icon: 'send',         color: '#9B65F5', label: 'Transférer des GoGold',sub: 'Envoyer des GoGold à un utilisateur',   screen: 'Transfer' },
    ],
  },
  {
    title: 'Visibilité',
    accent: '#E0389A',
    rows: [
      { icon: 'zap',          color: '#E0389A', label: 'Booster mon compte',  sub: 'Abonnés, vues, portée de contenu',     screen: 'Boost' },
    ],
  },
];

const GREEN = '#10B981';

const GATE_CONFIG: Record<MonetStatus, { icon: string; title: string; message: string }> = {
  none:     { icon: 'lock',        title: 'Monetisation non activee',    message: 'Soumettez une demande pour acceder a votre espace createur.' },
  pending:  { icon: 'clock',       title: 'Demande en cours d\'examen',  message: 'Notre equipe examine votre dossier. Vous serez notifie des la decision.' },
  rejected: { icon: 'x-circle',    title: 'Demande refusee',             message: 'Votre demande a ete refusee. Soumettez une nouvelle demande.' },
  approved: { icon: 'check-circle',title: '',                            message: '' },
};

export function MonetisationScreen() {
  const nav = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [monetStatus, setMonetStatus] = useState<MonetStatus | null>(null);
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ status: MonetStatus; admin_note: string | null }>(Endpoints.monetization.status)
      .then(res => {
        setMonetStatus(res.data.status);
        setAdminNote(res.data.admin_note ?? null);
      })
      .catch(() => setMonetStatus('none'))
      .finally(() => setFetching(false));
  }, []);

  if (fetching) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GREEN} />
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
          <View style={[gateStyles.iconWrap, { backgroundColor: '#EF444415' }]}>
            <Icon name={cfg.icon} size={36} color="#EF4444" />
          </View>
          <Text style={[gateStyles.title, { color: colors.textPrimary }]}>{cfg.title}</Text>
          <Text style={[gateStyles.message, { color: colors.textSecondary }]}>{cfg.message}</Text>
          {monetStatus === 'rejected' && adminNote && (
            <View style={[gateStyles.reasonBox, { backgroundColor: '#EF444415' }]}>
              <Text style={[gateStyles.reasonLabel, { color: '#EF4444' }]}>Motif du refus</Text>
              <Text style={[gateStyles.reasonText, { color: colors.textSecondary }]}>{adminNote}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[gateStyles.btn, { backgroundColor: GREEN }]}
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
            <View style={[styles.sectionHeader, { borderLeftColor: sec.accent }]}>
              <Text style={[styles.sectionTitle, { color: sec.accent }]}>{sec.title.toUpperCase()}</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
              {sec.rows.map((row, i) => (
                <TouchableOpacity
                  key={row.screen}
                  style={[
                    styles.row,
                    i < sec.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                  ]}
                  onPress={() => nav.navigate(row.screen)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconWrap, { backgroundColor: row.color + '22' }]}>
                    <Icon name={row.icon} size={18} color={row.color} />
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
