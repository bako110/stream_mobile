/**
 * ReachCard — répartition "vu / pas vu" parmi les abonnés du créateur, pour
 * un contenu précis. Double-barre horizontale + pourcentage.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import type { ReachStats } from '../../services/analyticsService';

interface Props {
  reach: ReachStats;
  accent: string;
}

export const ReachCard: React.FC<Props> = ({ reach, accent }) => {
  if (reach.total_followers === 0) {
    return (
      <Text style={s.empty}>Pas encore d'abonnés pour calculer la portée</Text>
    );
  }

  const seenPct = reach.seen_pct ?? 0;

  return (
    <View>
      <View style={s.headerRow}>
        <Text style={s.bigPct}>{seenPct}%</Text>
        <Text style={s.bigPctLabel}>de vos abonnés ont vu ce contenu</Text>
      </View>

      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${seenPct}%`, backgroundColor: accent }]} />
      </View>

      <View style={s.legendRow}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: accent }]} />
          <Icon name="eye" size={12} color="#6B7280" />
          <Text style={s.legendText}>{reach.seen.toLocaleString('fr-FR')} vu</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: 'rgba(120,120,120,0.25)' }]} />
          <Icon name="eye-off" size={12} color="#6B7280" />
          <Text style={s.legendText}>{reach.not_seen.toLocaleString('fr-FR')} pas vu</Text>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  empty:       { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 12 },
  headerRow:   { alignItems: 'center', marginBottom: 10 },
  bigPct:      { fontSize: 30, fontWeight: '900', color: '#111' },
  bigPctLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  barTrack:    { height: 10, borderRadius: 5, backgroundColor: 'rgba(120,120,120,0.15)', overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: 5 },
  legendRow:   { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendText:  { fontSize: 12, fontWeight: '700', color: '#6B7280' },
});
