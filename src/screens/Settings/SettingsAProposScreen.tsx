import React from 'react';
import { View, ScrollView, Alert, StyleSheet } from 'react-native';
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
          <Row icon="info"        label="Version"        value="1.0.0 (build 1)" />
          <Row icon="file-text"   label="CGU"            onPress={() => Alert.alert('Conditions d\'utilisation', 'Les CGU seront disponibles prochainement.')} />
          <Row icon="help-circle" label="Aide & Support" onPress={() => Alert.alert('Support', 'Contactez-nous à support@folix.app')} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
