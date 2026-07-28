/**
 * TimeSeriesChart — courbe continue avec zone dégradée sous la ligne, pour
 * afficher l'évolution des vues sur une période (heure/jour/semaine/mois).
 * SVG pur (react-native-svg déjà présent), pas de nouvelle dépendance.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableWithoutFeedback, GestureResponderEvent } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle, Line } from 'react-native-svg';
import type { TimeseriesPoint, AnalyticsGranularity } from '../../services/analyticsService';

const CHART_H = 140;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 24;

interface Props {
  data: TimeseriesPoint[];
  granularity: AnalyticsGranularity;
  color: string;
  width?: number;
}

function formatLabel(bucket: string, granularity: AnalyticsGranularity): string {
  const d = new Date(bucket);
  if (isNaN(d.getTime())) return '';
  switch (granularity) {
    case 'hour':  return d.toLocaleTimeString('fr-FR', { hour: '2-digit' });
    case 'day':   return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    case 'week':  return `S${Math.ceil(d.getDate() / 7)}`;
    case 'month': return d.toLocaleDateString('fr-FR', { month: 'short' });
    default:      return '';
  }
}

export const TimeSeriesChart: React.FC<Props> = ({ data, granularity, color, width = 300 }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <View style={{ height: CHART_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Pas encore de données</Text>
      </View>
    );
  }

  const maxViews = Math.max(...data.map(d => d.views), 1);
  const chartInnerH = CHART_H - PADDING_TOP - PADDING_BOTTOM;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((d, i) => ({
    x: data.length > 1 ? i * stepX : width / 2,
    y: PADDING_TOP + chartInnerH - (d.views / maxViews) * chartInnerH,
    d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${CHART_H - PADDING_BOTTOM} L ${points[0].x} ${CHART_H - PADDING_BOTTOM} Z`;

  const handlePress = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    setActiveIdx(closest);
  };

  const active = activeIdx != null ? points[activeIdx] : null;
  const labelStep = Math.max(1, Math.ceil(points.length / 5));

  return (
    <View>
      <TouchableWithoutFeedback onPress={handlePress}>
        <View>
          <Svg width={width} height={CHART_H}>
            <Defs>
              <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.35} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </SvgLinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#areaGrad)" />
            <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {active && (
              <>
                <Line x1={active.x} y1={PADDING_TOP} x2={active.x} y2={CHART_H - PADDING_BOTTOM} stroke={color} strokeWidth={1} strokeDasharray="4,4" opacity={0.5} />
                <Circle cx={active.x} cy={active.y} r={5} fill={color} stroke="#fff" strokeWidth={2} />
              </>
            )}
          </Svg>
        </View>
      </TouchableWithoutFeedback>

      {active && (
        <View style={s.tooltip}>
          <Text style={s.tooltipValue}>{active.d.views.toLocaleString('fr-FR')} vues</Text>
          <Text style={s.tooltipLabel}>{formatLabel(active.d.bucket, granularity)}</Text>
        </View>
      )}

      <View style={s.labelsRow}>
        {points.map((p, i) => (
          (i % labelStep === 0 || i === points.length - 1) ? (
            <Text key={i} style={[s.axisLabel, { position: 'absolute', left: p.x - 16 }]}>
              {formatLabel(p.d.bucket, granularity)}
            </Text>
          ) : null
        ))}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  tooltip:     { alignItems: 'center', marginBottom: 4 },
  tooltipValue:{ fontSize: 13, fontWeight: '800', color: '#111' },
  tooltipLabel:{ fontSize: 11, color: '#6B7280' },
  labelsRow:   { height: 16, position: 'relative' },
  axisLabel:   { fontSize: 9, color: '#9CA3AF', width: 32, textAlign: 'center' },
});
