import React from 'react';
import { View, ScrollView, StyleSheet, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { Row, Card, PageHeader } from './_shared';

export const SettingsAProposScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="À propos" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="info"        label="Version"                   value="1.0.0 (build 1)" />
          <Row icon="file-text"   label="Conditions d'utilisation"  onPress={() => nav.navigate('CGU')} />
          <Row icon="shield"      label="Politique de confidentialité" onPress={() => nav.navigate('PolitiqueConfidentialite')} />
          <Row icon="help-circle" label="Aide & Support"            onPress={() => Linking.openURL('mailto:support@folix.app')} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
