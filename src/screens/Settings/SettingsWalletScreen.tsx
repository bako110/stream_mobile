import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { Row, Card, PageHeader } from './_shared';

export const SettingsWalletScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Mon Wallet" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="dollar-sign"  label="Mon Wallet"           color="#FFD700" value="Solde et historique transactions"  onPress={() => nav.navigate('Wallet')} />
          <Row icon="shopping-bag" label="Acheter des coins"    color="#FF8C00" value="Packs disponibles"                 onPress={() => nav.navigate('BuyCoins')} />
          <Row icon="send"         label="Transférer des coins" color="#9B65F5" value="Envoyer à un utilisateur"          onPress={() => nav.navigate('Transfer')} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
