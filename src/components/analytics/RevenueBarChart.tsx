/**
 * RevenueBarChart — fine enveloppe autour de AreaLineChart pour la série de
 * revenus (gogold/eur), même style visuel que le graphique de vues (courbe +
 * aire dégradée), cohérent avec la version web (RevenueBarChart.tsx).
 */
import React from 'react';
import { AreaLineChart } from './AreaLineChart';
import type { RevenueTimeseriesPoint } from '../../services/revenueService';

interface Props {
  data: RevenueTimeseriesPoint[];
  color: string;
  width?: number;
  metric?: 'eur' | 'gogold';
}

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 100 ? 0 : 2 });
}

export const RevenueBarChart: React.FC<Props> = ({ data, color, width = 300, metric = 'eur' }) => {
  const points = data.map(d => ({
    value: metric === 'eur' ? d.eur : d.gogold,
    label: d.label,
    tooltipValue: `${fmtEur(d.eur)} · ${d.gogold.toLocaleString('fr-FR')} GoGold`,
  }));
  return <AreaLineChart data={points} color={color} width={width} labelEvery={data.length <= 6 ? 1 : undefined} />;
};
