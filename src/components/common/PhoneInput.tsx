import React, { useState, useMemo } from 'react';
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

export const COUNTRIES: Country[] = [
  // ── Afrique de l'Ouest ──────────────────────────────────────────────────────
  { code: 'BF', name: 'Burkina Faso',            dial: '+226', flag: '🇧🇫' },
  { code: 'CI', name: "Côte d'Ivoire",           dial: '+225', flag: '🇨🇮' },
  { code: 'SN', name: 'Sénégal',                 dial: '+221', flag: '🇸🇳' },
  { code: 'ML', name: 'Mali',                    dial: '+223', flag: '🇲🇱' },
  { code: 'GN', name: 'Guinée',                  dial: '+224', flag: '🇬🇳' },
  { code: 'TG', name: 'Togo',                    dial: '+228', flag: '🇹🇬' },
  { code: 'BJ', name: 'Bénin',                   dial: '+229', flag: '🇧🇯' },
  { code: 'NE', name: 'Niger',                   dial: '+227', flag: '🇳🇪' },
  { code: 'GH', name: 'Ghana',                   dial: '+233', flag: '🇬🇭' },
  { code: 'NG', name: 'Nigéria',                 dial: '+234', flag: '🇳🇬' },
  { code: 'MR', name: 'Mauritanie',              dial: '+222', flag: '🇲🇷' },
  { code: 'GW', name: 'Guinée-Bissau',           dial: '+245', flag: '🇬🇼' },
  { code: 'GQ', name: 'Guinée équatoriale',      dial: '+240', flag: '🇬🇶' },
  { code: 'SL', name: 'Sierra Leone',            dial: '+232', flag: '🇸🇱' },
  { code: 'LR', name: 'Libéria',                 dial: '+231', flag: '🇱🇷' },
  { code: 'GM', name: 'Gambie',                  dial: '+220', flag: '🇬🇲' },
  { code: 'CV', name: 'Cap-Vert',                dial: '+238', flag: '🇨🇻' },
  // ── Afrique Centrale ────────────────────────────────────────────────────────
  { code: 'CM', name: 'Cameroun',                dial: '+237', flag: '🇨🇲' },
  { code: 'CD', name: 'Congo (RDC)',              dial: '+243', flag: '🇨🇩' },
  { code: 'CG', name: 'Congo',                   dial: '+242', flag: '🇨🇬' },
  { code: 'GA', name: 'Gabon',                   dial: '+241', flag: '🇬🇦' },
  { code: 'CF', name: 'Centrafrique',             dial: '+236', flag: '🇨🇫' },
  { code: 'TD', name: 'Tchad',                   dial: '+235', flag: '🇹🇩' },
  { code: 'ST', name: 'Sao Tomé-et-Príncipe',    dial: '+239', flag: '🇸🇹' },
  // ── Afrique du Nord ─────────────────────────────────────────────────────────
  { code: 'MA', name: 'Maroc',                   dial: '+212', flag: '🇲🇦' },
  { code: 'DZ', name: 'Algérie',                 dial: '+213', flag: '🇩🇿' },
  { code: 'TN', name: 'Tunisie',                 dial: '+216', flag: '🇹🇳' },
  { code: 'EG', name: 'Égypte',                  dial: '+20',  flag: '🇪🇬' },
  { code: 'LY', name: 'Libye',                   dial: '+218', flag: '🇱🇾' },
  { code: 'SD', name: 'Soudan',                  dial: '+249', flag: '🇸🇩' },
  { code: 'SS', name: 'Soudan du Sud',            dial: '+211', flag: '🇸🇸' },
  // ── Afrique de l'Est ────────────────────────────────────────────────────────
  { code: 'KE', name: 'Kenya',                   dial: '+254', flag: '🇰🇪' },
  { code: 'ET', name: 'Éthiopie',                dial: '+251', flag: '🇪🇹' },
  { code: 'TZ', name: 'Tanzanie',                dial: '+255', flag: '🇹🇿' },
  { code: 'UG', name: 'Ouganda',                 dial: '+256', flag: '🇺🇬' },
  { code: 'RW', name: 'Rwanda',                  dial: '+250', flag: '🇷🇼' },
  { code: 'BI', name: 'Burundi',                 dial: '+257', flag: '🇧🇮' },
  { code: 'SO', name: 'Somalie',                 dial: '+252', flag: '🇸🇴' },
  { code: 'DJ', name: 'Djibouti',                dial: '+253', flag: '🇩🇯' },
  { code: 'ER', name: 'Érythrée',                dial: '+291', flag: '🇪🇷' },
  { code: 'MZ', name: 'Mozambique',              dial: '+258', flag: '🇲🇿' },
  { code: 'ZM', name: 'Zambie',                  dial: '+260', flag: '🇿🇲' },
  { code: 'MW', name: 'Malawi',                  dial: '+265', flag: '🇲🇼' },
  { code: 'ZW', name: 'Zimbabwe',                dial: '+263', flag: '🇿🇼' },
  // ── Afrique Australe ────────────────────────────────────────────────────────
  { code: 'ZA', name: 'Afrique du Sud',          dial: '+27',  flag: '🇿🇦' },
  { code: 'NA', name: 'Namibie',                 dial: '+264', flag: '🇳🇦' },
  { code: 'BW', name: 'Botswana',                dial: '+267', flag: '🇧🇼' },
  { code: 'LS', name: 'Lesotho',                 dial: '+266', flag: '🇱🇸' },
  { code: 'SZ', name: 'Eswatini',                dial: '+268', flag: '🇸🇿' },
  { code: 'AO', name: 'Angola',                  dial: '+244', flag: '🇦🇴' },
  // ── Îles de l'Océan Indien ──────────────────────────────────────────────────
  { code: 'MG', name: 'Madagascar',              dial: '+261', flag: '🇲🇬' },
  { code: 'MU', name: 'Maurice',                 dial: '+230', flag: '🇲🇺' },
  { code: 'SC', name: 'Seychelles',              dial: '+248', flag: '🇸🇨' },
  { code: 'KM', name: 'Comores',                 dial: '+269', flag: '🇰🇲' },
  { code: 'RE', name: 'La Réunion',              dial: '+262', flag: '🇷🇪' },
  { code: 'YT', name: 'Mayotte',                 dial: '+262', flag: '🇾🇹' },
  // ── Europe de l'Ouest ───────────────────────────────────────────────────────
  { code: 'FR', name: 'France',                  dial: '+33',  flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique',                dial: '+32',  flag: '🇧🇪' },
  { code: 'CH', name: 'Suisse',                  dial: '+41',  flag: '🇨🇭' },
  { code: 'GB', name: 'Royaume-Uni',             dial: '+44',  flag: '🇬🇧' },
  { code: 'DE', name: 'Allemagne',               dial: '+49',  flag: '🇩🇪' },
  { code: 'ES', name: 'Espagne',                 dial: '+34',  flag: '🇪🇸' },
  { code: 'IT', name: 'Italie',                  dial: '+39',  flag: '🇮🇹' },
  { code: 'PT', name: 'Portugal',                dial: '+351', flag: '🇵🇹' },
  { code: 'NL', name: 'Pays-Bas',                dial: '+31',  flag: '🇳🇱' },
  { code: 'LU', name: 'Luxembourg',              dial: '+352', flag: '🇱🇺' },
  { code: 'AT', name: 'Autriche',                dial: '+43',  flag: '🇦🇹' },
  { code: 'IE', name: 'Irlande',                 dial: '+353', flag: '🇮🇪' },
  { code: 'SE', name: 'Suède',                   dial: '+46',  flag: '🇸🇪' },
  { code: 'NO', name: 'Norvège',                 dial: '+47',  flag: '🇳🇴' },
  { code: 'DK', name: 'Danemark',                dial: '+45',  flag: '🇩🇰' },
  { code: 'FI', name: 'Finlande',                dial: '+358', flag: '🇫🇮' },
  { code: 'IS', name: 'Islande',                 dial: '+354', flag: '🇮🇸' },
  { code: 'GR', name: 'Grèce',                   dial: '+30',  flag: '🇬🇷' },
  { code: 'PL', name: 'Pologne',                 dial: '+48',  flag: '🇵🇱' },
  { code: 'CZ', name: 'République tchèque',      dial: '+420', flag: '🇨🇿' },
  { code: 'SK', name: 'Slovaquie',               dial: '+421', flag: '🇸🇰' },
  { code: 'HU', name: 'Hongrie',                 dial: '+36',  flag: '🇭🇺' },
  { code: 'RO', name: 'Roumanie',                dial: '+40',  flag: '🇷🇴' },
  { code: 'BG', name: 'Bulgarie',                dial: '+359', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatie',                 dial: '+385', flag: '🇭🇷' },
  { code: 'RS', name: 'Serbie',                  dial: '+381', flag: '🇷🇸' },
  { code: 'UA', name: 'Ukraine',                 dial: '+380', flag: '🇺🇦' },
  { code: 'RU', name: 'Russie',                  dial: '+7',   flag: '🇷🇺' },
  // ── Amérique du Nord ────────────────────────────────────────────────────────
  { code: 'US', name: 'États-Unis',              dial: '+1',   flag: '🇺🇸' },
  { code: 'CA', name: 'Canada',                  dial: '+1',   flag: '🇨🇦' },
  { code: 'MX', name: 'Mexique',                 dial: '+52',  flag: '🇲🇽' },
  // ── Amérique Centrale & Caraïbes ────────────────────────────────────────────
  { code: 'GT', name: 'Guatemala',               dial: '+502', flag: '🇬🇹' },
  { code: 'HN', name: 'Honduras',                dial: '+504', flag: '🇭🇳' },
  { code: 'SV', name: 'El Salvador',             dial: '+503', flag: '🇸🇻' },
  { code: 'NI', name: 'Nicaragua',               dial: '+505', flag: '🇳🇮' },
  { code: 'CR', name: 'Costa Rica',              dial: '+506', flag: '🇨🇷' },
  { code: 'PA', name: 'Panama',                  dial: '+507', flag: '🇵🇦' },
  { code: 'CU', name: 'Cuba',                    dial: '+53',  flag: '🇨🇺' },
  { code: 'HT', name: 'Haïti',                   dial: '+509', flag: '🇭🇹' },
  { code: 'DO', name: 'Rép. dominicaine',        dial: '+1',   flag: '🇩🇴' },
  { code: 'JM', name: 'Jamaïque',                dial: '+1',   flag: '🇯🇲' },
  { code: 'TT', name: 'Trinité-et-Tobago',       dial: '+1',   flag: '🇹🇹' },
  { code: 'BB', name: 'Barbade',                 dial: '+1',   flag: '🇧🇧' },
  // ── Amérique du Sud ─────────────────────────────────────────────────────────
  { code: 'BR', name: 'Brésil',                  dial: '+55',  flag: '🇧🇷' },
  { code: 'AR', name: 'Argentine',               dial: '+54',  flag: '🇦🇷' },
  { code: 'CO', name: 'Colombie',                dial: '+57',  flag: '🇨🇴' },
  { code: 'VE', name: 'Venezuela',               dial: '+58',  flag: '🇻🇪' },
  { code: 'PE', name: 'Pérou',                   dial: '+51',  flag: '🇵🇪' },
  { code: 'CL', name: 'Chili',                   dial: '+56',  flag: '🇨🇱' },
  { code: 'EC', name: 'Équateur',                dial: '+593', flag: '🇪🇨' },
  { code: 'BO', name: 'Bolivie',                 dial: '+591', flag: '🇧🇴' },
  { code: 'PY', name: 'Paraguay',                dial: '+595', flag: '🇵🇾' },
  { code: 'UY', name: 'Uruguay',                 dial: '+598', flag: '🇺🇾' },
  { code: 'GY', name: 'Guyana',                  dial: '+592', flag: '🇬🇾' },
  { code: 'SR', name: 'Suriname',                dial: '+597', flag: '🇸🇷' },
  { code: 'GF', name: 'Guyane française',        dial: '+594', flag: '🇬🇫' },
  // ── Moyen-Orient ────────────────────────────────────────────────────────────
  { code: 'TR', name: 'Turquie',                 dial: '+90',  flag: '🇹🇷' },
  { code: 'SA', name: 'Arabie saoudite',         dial: '+966', flag: '🇸🇦' },
  { code: 'AE', name: 'Émirats arabes unis',     dial: '+971', flag: '🇦🇪' },
  { code: 'QA', name: 'Qatar',                   dial: '+974', flag: '🇶🇦' },
  { code: 'KW', name: 'Koweït',                  dial: '+965', flag: '🇰🇼' },
  { code: 'BH', name: 'Bahreïn',                 dial: '+973', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman',                    dial: '+968', flag: '🇴🇲' },
  { code: 'IQ', name: 'Irak',                    dial: '+964', flag: '🇮🇶' },
  { code: 'IR', name: 'Iran',                    dial: '+98',  flag: '🇮🇷' },
  { code: 'JO', name: 'Jordanie',                dial: '+962', flag: '🇯🇴' },
  { code: 'LB', name: 'Liban',                   dial: '+961', flag: '🇱🇧' },
  { code: 'SY', name: 'Syrie',                   dial: '+963', flag: '🇸🇾' },
  { code: 'IL', name: 'Israël',                  dial: '+972', flag: '🇮🇱' },
  { code: 'PS', name: 'Palestine',               dial: '+970', flag: '🇵🇸' },
  { code: 'YE', name: 'Yémen',                   dial: '+967', flag: '🇾🇪' },
  // ── Asie du Sud ─────────────────────────────────────────────────────────────
  { code: 'IN', name: 'Inde',                    dial: '+91',  flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan',                dial: '+92',  flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh',              dial: '+880', flag: '🇧🇩' },
  { code: 'LK', name: 'Sri Lanka',               dial: '+94',  flag: '🇱🇰' },
  { code: 'NP', name: 'Népal',                   dial: '+977', flag: '🇳🇵' },
  { code: 'AF', name: 'Afghanistan',             dial: '+93',  flag: '🇦🇫' },
  // ── Asie du Sud-Est ─────────────────────────────────────────────────────────
  { code: 'ID', name: 'Indonésie',               dial: '+62',  flag: '🇮🇩' },
  { code: 'MY', name: 'Malaisie',                dial: '+60',  flag: '🇲🇾' },
  { code: 'PH', name: 'Philippines',             dial: '+63',  flag: '🇵🇭' },
  { code: 'VN', name: 'Viêt Nam',                dial: '+84',  flag: '🇻🇳' },
  { code: 'TH', name: 'Thaïlande',               dial: '+66',  flag: '🇹🇭' },
  { code: 'SG', name: 'Singapour',               dial: '+65',  flag: '🇸🇬' },
  { code: 'MM', name: 'Myanmar',                 dial: '+95',  flag: '🇲🇲' },
  { code: 'KH', name: 'Cambodge',                dial: '+855', flag: '🇰🇭' },
  { code: 'LA', name: 'Laos',                    dial: '+856', flag: '🇱🇦' },
  // ── Asie de l'Est ───────────────────────────────────────────────────────────
  { code: 'CN', name: 'Chine',                   dial: '+86',  flag: '🇨🇳' },
  { code: 'JP', name: 'Japon',                   dial: '+81',  flag: '🇯🇵' },
  { code: 'KR', name: 'Corée du Sud',            dial: '+82',  flag: '🇰🇷' },
  { code: 'TW', name: 'Taïwan',                  dial: '+886', flag: '🇹🇼' },
  { code: 'HK', name: 'Hong Kong',               dial: '+852', flag: '🇭🇰' },
  // ── Asie Centrale ───────────────────────────────────────────────────────────
  { code: 'KZ', name: 'Kazakhstan',              dial: '+7',   flag: '🇰🇿' },
  { code: 'UZ', name: 'Ouzbékistan',             dial: '+998', flag: '🇺🇿' },
  // ── Océanie ─────────────────────────────────────────────────────────────────
  { code: 'AU', name: 'Australie',               dial: '+61',  flag: '🇦🇺' },
  { code: 'NZ', name: 'Nouvelle-Zélande',        dial: '+64',  flag: '🇳🇿' },
  { code: 'FJ', name: 'Fidji',                   dial: '+679', flag: '🇫🇯' },
  { code: 'PG', name: 'Papouasie-N.-Guinée',     dial: '+675', flag: '🇵🇬' },
  { code: 'NC', name: 'Nouvelle-Calédonie',      dial: '+687', flag: '🇳🇨' },
  { code: 'PF', name: 'Polynésie française',     dial: '+689', flag: '🇵🇫' },
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
