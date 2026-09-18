import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { showWithdrawUnavailable } from '../../utils/withdrawAlert';
import { Row, Card, PageHeader } from './_shared';

export const SettingsWalletScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser } = useUser();
  const hasPin = !!currentUser?.has_wallet_pin;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Paramètres du wallet" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="lock"          label="Code PIN"              color="#3FEDB6" value={hasPin ? 'Activé — exigé pour cadeau, transfert, retrait' : 'Désactivé — recommandé'} onPress={() => nav.navigate('WalletPin')} />
          <Row icon="shopping-bag"  label="Acheter des GoGold"    color="#FF8C00" value="Packs disponibles"                 onPress={() => nav.navigate('BuyGoGold')} />
          <Row icon="send"          label="Transférer des GoGold" color="#9B65F5" value="Envoyer à un utilisateur"          onPress={() => nav.navigate('Transfer')} />
          <Row icon="arrow-up-right" label="Retirer des GoGold"   color="#3FEDB6" value="Bientôt sur l'app — via gofolyx.com" onPress={showWithdrawUnavailable} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
