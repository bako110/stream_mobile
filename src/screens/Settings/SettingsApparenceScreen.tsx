import React from 'react';
import { View, ScrollView, Switch, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { Row, Card, PageHeader } from './_shared';

export const SettingsApparenceScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme, toggleTheme } = useTheme();
  const { colors } = theme;
  const isDark = theme.isDark;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Apparence" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row
            icon="moon" label="Mode sombre" last
            right={<Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
          />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
