/**
 * DateTimeField — champ bouton qui ouvre un vrai calendrier (date) puis une
 * roue horaire (heure) via @react-native-community/datetimepicker, au lieu
 * de faire taper une date ISO a la main. Retourne une Date complete via
 * onChange, ou null si effacee.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
}

export const DateTimeField: React.FC<Props> = ({ label, value, onChange, placeholder }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

  const formatted = value
    ? value.toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={{ gap: 6 }}>
      <View style={st.labelRow}>
        <Text style={[st.label, { color: colors.textSecondary }]}>{label}</Text>
        {value && (
          <TouchableOpacity onPress={() => onChange(null)}>
            <Text style={st.clearText}>Effacer</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        style={[st.field, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
        onPress={() => setShowDate(true)}
      >
        <Icon name="calendar" size={16} color={colors.textTertiary} />
        <Text style={[st.fieldText, { color: formatted ? colors.textPrimary : colors.textTertiary }]}>
          {formatted ?? placeholder ?? 'Sélectionner date et heure'}
        </Text>
      </TouchableOpacity>

      {showDate && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display="calendar"
          onChange={(_, d) => {
            setShowDate(false);
            if (d) { setPendingDate(d); setShowTime(true); }
          }}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="time"
          display="clock"
          onChange={(_, t) => {
            setShowTime(false);
            if (t && pendingDate) {
              const merged = new Date(pendingDate);
              merged.setHours(t.getHours(), t.getMinutes(), 0, 0);
              onChange(merged);
            }
            setPendingDate(null);
          }}
        />
      )}
    </View>
  );
};

const st = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: '700' },
  clearText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  fieldText: { flex: 1, fontSize: 14 },
});
