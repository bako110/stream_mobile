import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';

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
    title: 'Coins & Achats',
    accent: '#FF8C00',
    rows: [
      { icon: 'shopping-bag', color: '#FF8C00', label: 'Acheter des coins',   sub: 'Packs de coins via Stripe',            screen: 'BuyCoins' },
      { icon: 'send',         color: '#9B65F5', label: 'Transférer des coins',sub: 'Envoyer des coins à un utilisateur',   screen: 'Transfer' },
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

export function MonetisationScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#1a0533', '#7B3FF2']} style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Monétisation</Text>
        <View style={{ width: 38 }} />
      </LinearGradient>

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

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: '#fff' },
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
