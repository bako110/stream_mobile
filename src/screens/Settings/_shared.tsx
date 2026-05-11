// Composants partagés entre tous les écrans Settings
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  icon: string; label: string; value?: string;
  onPress?: () => void; color?: string;
  right?: React.ReactNode; danger?: boolean; last?: boolean;
}
export const Row: React.FC<RowProps> = ({ icon, label, value, onPress, color, right, danger, last }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const accent = danger ? '#EF4444' : (color ?? colors.primary);
  return (
    <TouchableOpacity
      style={[sh.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[sh.iconWrap, { backgroundColor: accent + '18' }]}>
        <Icon name={icon} size={17} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: danger ? '#EF4444' : colors.textPrimary }}>{label}</Text>
        {value ? <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{value}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={15} color={colors.textTertiary} /> : null)}
    </TouchableOpacity>
  );
};

// ── Card ──────────────────────────────────────────────────────────────────────

export const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View style={[sh.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
      {children}
    </View>
  );
};

// ── PageHeader ────────────────────────────────────────────────────────────────

export const PageHeader: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View style={[sh.header, { borderBottomColor: colors.divider, backgroundColor: colors.background }]}>
      <TouchableOpacity onPress={onBack} style={sh.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Icon name="arrow-left" size={22} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={[sh.title, { color: colors.textPrimary }]}>{title}</Text>
      <View style={{ width: 44 }} />
    </View>
  );
};

const sh = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  iconWrap:{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  card:    { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, paddingTop: 56 },
  backBtn: { width: 44, alignItems: 'flex-start' },
  title:   { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
});
