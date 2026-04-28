import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  FlatList, StyleSheet, TextInputProps, ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

// ── Liste pays (indicatif + drapeau emoji) ────────────────────────────────────
export interface Country {
  code: string;   // ISO alpha-2
  name: string;
  dial: string;   // ex: "+226"
  flag: string;   // emoji
}

const COUNTRIES: Country[] = [
  { code: 'BF', name: 'Burkina Faso',       dial: '+226', flag: '🇧🇫' },
  { code: 'CI', name: "Côte d'Ivoire",      dial: '+225', flag: '🇨🇮' },
  { code: 'SN', name: 'Sénégal',            dial: '+221', flag: '🇸🇳' },
  { code: 'ML', name: 'Mali',               dial: '+223', flag: '🇲🇱' },
  { code: 'GN', name: 'Guinée',             dial: '+224', flag: '🇬🇳' },
  { code: 'TG', name: 'Togo',              dial: '+228', flag: '🇹🇬' },
  { code: 'BJ', name: 'Bénin',             dial: '+229', flag: '🇧🇯' },
  { code: 'NE', name: 'Niger',             dial: '+227', flag: '🇳🇪' },
  { code: 'GH', name: 'Ghana',             dial: '+233', flag: '🇬🇭' },
  { code: 'NG', name: 'Nigéria',           dial: '+234', flag: '🇳🇬' },
  { code: 'CM', name: 'Cameroun',          dial: '+237', flag: '🇨🇲' },
  { code: 'CD', name: 'Congo (RDC)',        dial: '+243', flag: '🇨🇩' },
  { code: 'CG', name: 'Congo',             dial: '+242', flag: '🇨🇬' },
  { code: 'GA', name: 'Gabon',             dial: '+241', flag: '🇬🇦' },
  { code: 'MA', name: 'Maroc',             dial: '+212', flag: '🇲🇦' },
  { code: 'DZ', name: 'Algérie',           dial: '+213', flag: '🇩🇿' },
  { code: 'TN', name: 'Tunisie',           dial: '+216', flag: '🇹🇳' },
  { code: 'EG', name: 'Égypte',            dial: '+20',  flag: '🇪🇬' },
  { code: 'ZA', name: 'Afrique du Sud',    dial: '+27',  flag: '🇿🇦' },
  { code: 'KE', name: 'Kenya',             dial: '+254', flag: '🇰🇪' },
  { code: 'ET', name: 'Éthiopie',          dial: '+251', flag: '🇪🇹' },
  { code: 'TZ', name: 'Tanzanie',          dial: '+255', flag: '🇹🇿' },
  { code: 'UG', name: 'Ouganda',           dial: '+256', flag: '🇺🇬' },
  { code: 'RW', name: 'Rwanda',            dial: '+250', flag: '🇷🇼' },
  { code: 'MG', name: 'Madagascar',        dial: '+261', flag: '🇲🇬' },
  { code: 'FR', name: 'France',            dial: '+33',  flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique',          dial: '+32',  flag: '🇧🇪' },
  { code: 'CH', name: 'Suisse',            dial: '+41',  flag: '🇨🇭' },
  { code: 'CA', name: 'Canada',            dial: '+1',   flag: '🇨🇦' },
  { code: 'US', name: 'États-Unis',        dial: '+1',   flag: '🇺🇸' },
  { code: 'GB', name: 'Royaume-Uni',       dial: '+44',  flag: '🇬🇧' },
  { code: 'DE', name: 'Allemagne',         dial: '+49',  flag: '🇩🇪' },
  { code: 'ES', name: 'Espagne',           dial: '+34',  flag: '🇪🇸' },
  { code: 'IT', name: 'Italie',            dial: '+39',  flag: '🇮🇹' },
  { code: 'PT', name: 'Portugal',          dial: '+351', flag: '🇵🇹' },
  { code: 'BR', name: 'Brésil',            dial: '+55',  flag: '🇧🇷' },
  { code: 'CN', name: 'Chine',             dial: '+86',  flag: '🇨🇳' },
  { code: 'IN', name: 'Inde',              dial: '+91',  flag: '🇮🇳' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // Burkina Faso par défaut

// ── Composant principal ───────────────────────────────────────────────────────

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value:          string;          // numéro sans indicatif
  onChangeText:   (phone: string, full: string, country: Country) => void;
  country:        Country;
  onCountryChange:(c: Country) => void;
  label?:         string;
  error?:         string;
  containerStyle?: ViewStyle;
}

export const PhoneInput = React.forwardRef<TextInput, Props>(({
  value, onChangeText, country, onCountryChange,
  label = 'Numero de telephone', error, containerStyle, ...rest
}, ref) => {
  const { theme } = useTheme();
  const { colors, borderRadius, fontSize } = theme;

  const [focused,  setFocused]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [modal,    setModal]    = useState(false);

  const labelAnim = useSharedValue(value ? 1 : 0);

  const labelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(labelAnim.value, [0, 1], [0, -22]) },
      { scale:      interpolate(labelAnim.value, [0, 1], [1, 0.82]) },
    ],
    color: interpolate(labelAnim.value, [0, 1], [0, 1]) > 0.5
      ? colors.primary : colors.textTertiary,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? colors.error
      : focused ? colors.inputBorderFocus : colors.inputBorder,
    borderWidth: withTiming(focused ? 2 : 1.5, { duration: 160 }),
  }));

  const filtered = useMemo(() =>
    search.trim()
      ? COUNTRIES.filter(c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dial.includes(search) ||
          c.code.toLowerCase().includes(search.toLowerCase())
        )
      : COUNTRIES,
  [search]);

  const handleFocus = (e: any) => {
    setFocused(true);
    labelAnim.value = withTiming(1, { duration: 160 });
    rest.onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setFocused(false);
    if (!value) labelAnim.value = withTiming(0, { duration: 160 });
    rest.onBlur?.(e);
  };

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    onChangeText(digits, country.dial + digits, country);
  };

  const handleCountrySelect = (c: Country) => {
    onCountryChange(c);
    setModal(false);
    setSearch('');
    onChangeText(value, c.dial + value, c);
  };

  return (
    <>
      <View style={[s.wrapper, containerStyle]}>
        <Animated.View style={[
          s.container,
          { backgroundColor: colors.inputBg, borderRadius: borderRadius.md },
          borderStyle,
        ]}>
          {/* Label flottant */}
          <Animated.Text style={[s.label, labelStyle]} pointerEvents="none">
            {label}
          </Animated.Text>

          {/* Bouton pays */}
          <TouchableOpacity
            style={[s.countryBtn, { borderRightColor: focused ? colors.primary : colors.inputBorder }]}
            onPress={() => setModal(true)}
            activeOpacity={0.7}
          >
            <Text style={s.flag}>{country.flag}</Text>
            <Text style={[s.dial, { color: colors.textPrimary }]}>{country.dial}</Text>
            <Icon name="chevron-down" size={12} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* Champ numéro */}
          <TextInput
            ref={ref}
            {...rest}
            value={value}
            onChangeText={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            keyboardType="phone-pad"
            placeholderTextColor="transparent"
            style={[s.input, {
              color: colors.textPrimary,
              fontSize: fontSize.base,
              paddingTop: 20,
              paddingBottom: 8,
            }]}
          />
        </Animated.View>

        {error ? (
          <Text style={[s.errorText, { color: colors.error, fontSize: fontSize.xs }]}>
            {error}
          </Text>
        ) : null}
      </View>

      {/* Modal sélection pays */}
      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          {/* Header modal */}
          <View style={[s.modalHeader, { borderBottomColor: colors.divider }]}>
            <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Choisir un pays</Text>
            <TouchableOpacity onPress={() => { setModal(false); setSearch(''); }}>
              <Icon name="x" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Recherche */}
          <View style={[s.searchWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Icon name="search" size={16} color={colors.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un pays ou indicatif..."
              placeholderTextColor={colors.textTertiary}
              style={[s.searchInput, { color: colors.textPrimary }]}
              autoFocus
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Icon name="x-circle" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Liste */}
          <FlatList
            data={filtered}
            keyExtractor={item => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = item.code === country.code;
              return (
                <TouchableOpacity
                  style={[s.countryRow, { borderBottomColor: colors.divider },
                    selected && { backgroundColor: colors.primary + '12' }]}
                  onPress={() => handleCountrySelect(item)}
                  activeOpacity={0.7}
                >
                  <Text style={s.rowFlag}>{item.flag}</Text>
                  <Text style={[s.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[s.rowDial, { color: selected ? colors.primary : colors.textTertiary }]}>
                    {item.dial}
                  </Text>
                  {selected && <Icon name="check" size={14} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
});

PhoneInput.displayName = 'PhoneInput';

const s = StyleSheet.create({
  wrapper:    { marginBottom: 0 },
  container:  { height: 58, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  label:      { position: 'absolute', left: 110, fontSize: 14, fontWeight: '400' },

  // Bouton pays
  countryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingTop: 20, paddingBottom: 8,
    borderRightWidth: 1, height: '100%',
  },
  flag:  { fontSize: 20 },
  dial:  { fontSize: 13, fontWeight: '700' },

  // Champ
  input:      { flex: 1, paddingHorizontal: 10 },
  errorText:  { marginTop: 4, marginLeft: 4 },

  // Modal
  modal:        { flex: 1 },
  modalHeader:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle:   { fontSize: 18, fontWeight: '800' },
  searchWrap:   {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput:  { flex: 1, fontSize: 14, padding: 0 },
  countryRow:   {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowFlag:  { fontSize: 24 },
  rowName:  { flex: 1, fontSize: 14, fontWeight: '500' },
  rowDial:  { fontSize: 13, fontWeight: '700' },
});
