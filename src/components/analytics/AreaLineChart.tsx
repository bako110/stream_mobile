/**
 * AreaLineChart — courbe + aire dégradée générique, avec tooltip au tap.
 * Équivalent mobile du composant web (src/components/analytics/AreaLineChart.tsx) :
 * ne connaît ni "vues" ni "revenus", juste value/label/tooltipValue déjà formatés
 * par l'appelant — réutilisable pour n'importe quelle série temporelle.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableWithoutFeedback, GestureResponderEvent } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle, Line } from 'react-native-svg';

const CHART_H = 140;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 24;

export interface AreaLineChartPoint {
  value: number;
  label: string;
  tooltipValue: string;
}

interface Props {
  data: AreaLineChartPoint[];
  color: string;
  width?: number;
  height?: number;
  /** Affiche un label sous chaque point plutôt que d'en sauter certains — utile pour peu de points. */
  labelEvery?: number;
}

export const AreaLineChart: React.FC<Props> = ({ data, color, width = 300, height = CHART_H, labelEvery }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Pas encore de données</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const chartInnerH = height - PADDING_TOP - PADDING_BOTTOM;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((d, i) => ({
    x: data.length > 1 ? i * stepX : width / 2,
    y: PADDING_TOP + chartInnerH - (d.value / maxVal) * chartInnerH,
    d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - PADDING_BOTTOM} L ${points[0].x} ${height - PADDING_BOTTOM} Z`;

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
  const step = labelEvery ?? Math.max(1, Math.ceil(points.length / 5));

  return (
    <View>
      <TouchableWithoutFeedback onPress={handlePress}>
        <View>
          <Svg width={width} height={height}>
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
                <Line x1={active.x} y1={PADDING_TOP} x2={active.x} y2={height - PADDING_BOTTOM} stroke={color} strokeWidth={1} strokeDasharray="4,4" opacity={0.5} />
                <Circle cx={active.x} cy={active.y} r={5} fill={color} stroke="#fff" strokeWidth={2} />
              </>
            )}
          </Svg>
        </View>
      </TouchableWithoutFeedback>

      {active && (
        <View style={s.tooltip}>
          <Text style={s.tooltipValue}>{active.d.tooltipValue}</Text>
          <Text style={s.tooltipLabel}>{active.d.label}</Text>
        </View>
      )}

      <View style={[s.labelsRow, { width }]}>
        {points.map((p, i) => {
          const labelWPct = (32 / width) * 100;
          const leftPct = Math.max(0, Math.min(100 - labelWPct, (p.x / width) * 100 - labelWPct / 2));
          return (i % step === 0 || i === points.length - 1) ? (
            <Text key={i} style={[s.axisLabel, { position: 'absolute', left: `${leftPct}%` as any }]}>
              {p.d.label}
            </Text>
          ) : null;
        })}
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
