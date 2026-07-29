import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RevenueSourceBreakdown } from '../../services/revenueService';

interface Props {
  sources: RevenueSourceBreakdown[];
  accent: string;
  textPrimary: string;
  textTertiary: string;
  trackColor: string;
}

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 100 ? 0 : 2 });
}

export const RevenueSourceList: React.FC<Props> = ({ sources, accent, textPrimary, textTertiary, trackColor }) => {
  if (sources.length === 0) {
    return (
      <Text style={[s.empty, { color: textTertiary }]}>Aucun revenu enregistré pour l'instant</Text>
    );
  }

  const maxEur = Math.max(...sources.map(s => s.eur), 1);

  return (
    <View style={{ gap: 12 }}>
      {sources.map(src => (
        <View key={src.source} style={s.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.rowHeader}>
              <Text style={[s.label, { color: textPrimary }]} numberOfLines={1}>{src.label}</Text>
              <Text style={[s.pct, { color: textTertiary }]}>{src.share_pct}%</Text>
            </View>
            <View style={[s.track, { backgroundColor: trackColor }]}>
              <View style={[s.fill, { width: `${(src.eur / maxEur) * 100}%`, backgroundColor: accent }]} />
            </View>
          </View>
          <View style={s.amountCol}>
            <Text style={[s.amount, { color: textPrimary }]}>{fmtEur(src.eur)}</Text>
            <Text style={[s.count, { color: textTertiary }]}>{src.count} opér.</Text>
          </View>
        </View>
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  empty:     { fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  label:     { fontSize: 13, fontWeight: '700', flex: 1 },
  pct:       { fontSize: 12, fontWeight: '700', marginLeft: 8 },
  track:     { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill:      { height: '100%', borderRadius: 4 },
  amountCol: { alignItems: 'flex-end', minWidth: 74 },
  amount:    { fontSize: 13, fontWeight: '800' },
  count:     { fontSize: 10, marginTop: 1 },
});
