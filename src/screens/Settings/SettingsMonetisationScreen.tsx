import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { Row, Card, PageHeader } from './_shared';

export const SettingsMonetisationScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Monétisation" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="bar-chart-2"  label="Dashboard Créateur"  color="#7B3FF2" value="Vues, cadeaux, revenus du mois"    onPress={() => nav.navigate('CreatorDashboard')} />
          <Row icon="trending-up"  label="Mes statistiques"    color="#8B5CF6" value="Vues, likes, partages par contenu" onPress={() => nav.navigate('CreatorStats')} />
          <Row icon="zap"          label="Booster mon compte"  color="#E0389A" value="Abonnés, vues, portée…"            onPress={() => nav.navigate('Boost')} />
          <Row icon="credit-card"  label="Retirer mes gains"   color="#10B981" value="Virement bancaire ou Mobile Money" onPress={() => nav.navigate('Withdraw')} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
