/**
 * TimezoneSelect — champ + modale de selection d'un seul fuseau horaire IANA
 * (avec recherche), au lieu de faire taper "Africa/Abidjan" a la main.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, FlatList, StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

export const TIMEZONES: string[] = [
  'Africa/Abidjan', 'Africa/Accra', 'Africa/Bamako', 'Africa/Dakar', 'Africa/Lome',
  'Africa/Ouagadougou', 'Africa/Conakry', 'Africa/Niamey', 'Africa/Nouakchott',
  'Africa/Cotonou', 'Africa/Lagos', 'Africa/Kinshasa', 'Africa/Douala',
  'Africa/Casablanca', 'Africa/Tunis', 'Africa/Algiers', 'Africa/Cairo',
  'Africa/Nairobi', 'Africa/Addis_Ababa', 'Africa/Johannesburg',
  'Europe/Paris', 'Europe/London', 'Europe/Madrid', 'Europe/Lisbon',
  'Europe/Berlin', 'Europe/Rome', 'Europe/Brussels', 'Europe/Zurich',
  'Europe/Amsterdam', 'Europe/Moscow', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Bogota',
  'America/Buenos_Aires',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Seoul', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Pacific/Auckland',
  'UTC',
];

interface Props {
  value: string;
  onChange: (tz: string) => void;
  placeholder?: string;
}

export const TimezoneSelect: React.FC<Props> = ({ value, onChange, placeholder }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    search.trim()
      ? TIMEZONES.filter(tz => tz.toLowerCase().includes(search.toLowerCase()))
      : TIMEZONES,
  [search]);

  return (
    <>
      <TouchableOpacity
        style={[st.field, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
        onPress={() => setModal(true)}
      >
        <Icon name="clock" size={16} color={colors.textTertiary} />
        <Text style={[st.fieldText, { color: value ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
          {value || placeholder || 'Sélectionner un fuseau horaire'}
        </Text>
        <Icon name="chevron-down" size={14} color={colors.textTertiary} />
      </TouchableOpacity>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={[st.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[st.modalHeader, { borderBottomColor: colors.divider }]}>
            <Text style={[st.modalTitle, { color: colors.textPrimary }]}>Fuseau horaire</Text>
            <TouchableOpacity onPress={() => setModal(false)}>
              <Icon name="x" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={[st.searchWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Icon name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={[st.searchInput, { color: colors.textPrimary }]}
              placeholder="Rechercher (ex: Abidjan, Paris)"
              placeholderTextColor={colors.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {!!value && (
            <TouchableOpacity onPress={() => { onChange(''); setModal(false); }} style={st.clearRow}>
              <Text style={[st.clearText, { color: '#EF4444' }]}>Effacer la sélection</Text>
            </TouchableOpacity>
          )}

          <FlatList
            data={filtered}
            keyExtractor={tz => tz}
            renderItem={({ item }) => {
              const isSelected = value === item;
              return (
                <TouchableOpacity
                  style={[st.row, { borderBottomColor: colors.divider }]}
                  onPress={() => { onChange(item); setModal(false); }}
                >
                  <Text style={[st.rowName, { color: colors.textPrimary }]}>{item}</Text>
                  {isSelected && <Icon name="check" size={18} color="#9B65F5" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
};

const st = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  fieldText: { flex: 1, fontSize: 14 },

  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },

  clearRow: { paddingHorizontal: 16, paddingBottom: 8 },
  clearText: { fontSize: 12, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowName: { fontSize: 14, fontWeight: '600' },
});
