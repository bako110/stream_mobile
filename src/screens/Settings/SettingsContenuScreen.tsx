import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { Row, Card, PageHeader } from './_shared';

export const SettingsContenuScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Contenu" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="music"       label="Mes concerts"   color="#E0389A" onPress={() => nav.navigate('Concerts')} />
          <Row icon="calendar"    label="Mes événements" color="#FF9800" onPress={() => nav.navigate('Events')} />
          <Row icon="film"        label="Films & Séries" color="#2196F3" onPress={() => nav.navigate('Films')} />
          <Row icon="trending-up" label="Tendances"      color="#00BCD4" onPress={() => nav.navigate('Trending')} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
