/**
 * CountryMultiSelect — champ + modale de selection multiple de pays (avec
 * recherche), base sur la liste COUNTRIES deja utilisee par PhoneInput.
 * Utilise pour restreindre un tournoi a certains pays (allowed_countries).
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, FlatList, StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { COUNTRIES } from './PhoneInput';
import type { Country } from './PhoneInput';

interface Props {
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
}

export const CountryMultiSelect: React.FC<Props> = ({ selectedCodes, onChange, placeholder }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    search.trim()
      ? COUNTRIES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()))
      : COUNTRIES,
  [search]);

  const selected = COUNTRIES.filter(c => selectedCodes.includes(c.code));

  const toggle = (code: string) => {
    onChange(selectedCodes.includes(code) ? selectedCodes.filter(c => c !== code) : [...selectedCodes, code]);
  };

  return (
    <>
      <TouchableOpacity
        style={[st.field, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
        onPress={() => setModal(true)}
      >
        <Icon name="globe" size={16} color={colors.textTertiary} />
        {selected.length > 0 ? (
          <Text style={[st.fieldText, { color: colors.textPrimary }]} numberOfLines={1}>
            {selected.map(c => `${c.flag} ${c.code}`).join('  ')}
          </Text>
        ) : (
          <Text style={[st.fieldText, { color: colors.textTertiary }]}>{placeholder ?? 'Tous les pays'}</Text>
        )}
        <Icon name="chevron-down" size={14} color={colors.textTertiary} />
      </TouchableOpacity>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={[st.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[st.modalHeader, { borderBottomColor: colors.divider, paddingTop: insets.top + 14 }]}>
            <Text style={[st.modalTitle, { color: colors.textPrimary }]}>Pays autorisés</Text>
            <TouchableOpacity onPress={() => setModal(false)}>
              <Icon name="x" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={[st.searchWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Icon name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={[st.searchInput, { color: colors.textPrimary }]}
              placeholder="Rechercher un pays"
              placeholderTextColor={colors.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {selected.length > 0 && (
            <TouchableOpacity onPress={() => onChange([])} style={st.clearRow}>
              <Text style={[st.clearText, { color: '#EF4444' }]}>Effacer la sélection ({selected.length})</Text>
            </TouchableOpacity>
          )}

          <FlatList
            data={filtered}
            keyExtractor={c => c.code}
            renderItem={({ item }) => {
              const isSelected = selectedCodes.includes(item.code);
              return (
                <TouchableOpacity
                  style={[st.row, { borderBottomColor: colors.divider }]}
                  onPress={() => toggle(item.code)}
                >
                  <Text style={st.flag}>{item.flag}</Text>
                  <Text style={[st.rowName, { color: colors.textPrimary }]}>{item.name}</Text>
                  <Icon
                    name={isSelected ? 'check-square' : 'square'}
                    size={20}
                    color={isSelected ? '#9B65F5' : colors.textTertiary}
                  />
                </TouchableOpacity>
              );
            }}
          />

          <TouchableOpacity style={st.doneBtn} onPress={() => setModal(false)}>
            <Text style={st.doneBtnText}>Terminé</Text>
          </TouchableOpacity>
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
    paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },

  clearRow: { paddingHorizontal: 16, paddingBottom: 8 },
  clearText: { fontSize: 12, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  flag: { fontSize: 20 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600' },

  doneBtn: { margin: 16, backgroundColor: '#7B3FF2', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
