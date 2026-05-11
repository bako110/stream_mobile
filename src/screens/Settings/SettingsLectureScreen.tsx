import React, { useState } from 'react';
import { View, ScrollView, Switch, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { Row, Card, PageHeader } from './_shared';

export const SettingsLectureScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;
  const [autoPlay, setAutoPlay] = useState(true);
  const [hdStream, setHdStream] = useState(true);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Lecture" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="play" label="Lecture automatique"
            right={<Switch value={autoPlay} onValueChange={setAutoPlay} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
          />
          <Row icon="wifi" label="Streaming HD" value="Utilise plus de données mobiles" last
            right={<Switch value={hdStream} onValueChange={setHdStream} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
          />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
