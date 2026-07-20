import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { Card, PageHeader } from './_shared';

export const SettingsDeviseScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;
  const { currencies, selected, loading, error, reload, setCurrencyCode } = useCurrency();

  const renderOption = (code: string | null, label: string, sub: string, last: boolean) => {
    const active = selected?.code === code;
    return (
      <TouchableOpacity
        key={code ?? 'eur'}
        style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
        onPress={() => setCurrencyCode(code)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>{label}</Text>
          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{sub}</Text>
        </View>
        {active && <Icon name="check" size={18} color={colors.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Devise" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[st.hint, { color: colors.textTertiary }]}>
          Les prix restent facturés en euro (EUR). Choisis une devise locale pour voir
          en plus une conversion approximative à côté de chaque montant.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : error ? (
          <View style={{ alignItems: 'center', marginTop: 24, gap: 10 }}>
            <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center' }}>
              Impossible de charger les devises.{'\n'}{error}
            </Text>
            <TouchableOpacity onPress={reload} style={[st.retryBtn, { borderColor: colors.primary }]}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Card>
            {renderOption(null, 'Euro uniquement', 'Aucune conversion affichée', false)}
            {currencies.map((c, i) =>
              renderOption(c.code, c.label, `1 € ≈ ${c.rate_from_eur.toLocaleString('fr-FR')} ${c.symbol}`, i === currencies.length - 1),
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  scroll: { padding: 16 },
  hint:   { fontSize: 12, lineHeight: 17, marginBottom: 14, paddingHorizontal: 4 },
  row:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  retryBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
});
