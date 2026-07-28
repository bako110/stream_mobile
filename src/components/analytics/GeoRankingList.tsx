/**
 * GeoRankingList — classement des pays par nombre de vues, avec drapeau emoji
 * (mapping code pays ISO → emoji, pas de lib supplémentaire) et barre
 * horizontale proportionnelle.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CountryStat } from '../../services/analyticsService';

// Convertit un code ISO-3166 alpha-2 (ex: "FR") en emoji drapeau — chaque lettre
// devient sa "regional indicator symbol" Unicode correspondante.
function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return '🌍';
  const codePoints = [...code.toUpperCase()].map(c => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

interface Props {
  countries: CountryStat[];
  accent: string;
}

export const GeoRankingList: React.FC<Props> = ({ countries, accent }) => {
  if (countries.length === 0) {
    return <Text style={s.empty}>Pas encore de données géographiques</Text>;
  }

  const maxViews = Math.max(...countries.map(c => c.views), 1);

  return (
    <View style={{ gap: 10 }}>
      {countries.map(c => (
        <View key={c.country_code} style={s.row}>
          <Text style={s.flag}>{countryCodeToFlag(c.country_code)}</Text>
          <View style={{ flex: 1 }}>
            <View style={s.rowTop}>
              <Text style={s.countryName} numberOfLines={1}>{c.country_name ?? c.country_code}</Text>
              <Text style={s.pct}>{c.share_pct}%</Text>
            </View>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${(c.views / maxViews) * 100}%`, backgroundColor: accent }]} />
            </View>
          </View>
          <Text style={s.views}>{c.views.toLocaleString('fr-FR')}</Text>
        </View>
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  empty:       { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 12 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flag:        { fontSize: 20 },
  rowTop:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  countryName: { fontSize: 13, fontWeight: '700', color: '#111', flex: 1 },
  pct:         { fontSize: 11, fontWeight: '700', color: '#6B7280', marginLeft: 8 },
  barTrack:    { height: 6, borderRadius: 3, backgroundColor: 'rgba(120,120,120,0.15)', overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: 3 },
  views:       { fontSize: 12, fontWeight: '700', color: '#6B7280', minWidth: 40, textAlign: 'right' },
});
