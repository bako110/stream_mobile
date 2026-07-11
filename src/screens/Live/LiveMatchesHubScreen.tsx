/**
 * LiveMatchesHubScreen — écran "Live Matchs" (accessible depuis Explorer),
 * propose les deux modes disponibles : "1 vs 1" et "Tournois". Le clic sur
 * une case mène à l'écran dédié correspondant.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const LiveMatchesHubScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Live Matchs</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={st.body}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => nav.navigate('LiveOneVsOne')} style={st.cardWrap}>
          <LinearGradient colors={['#9B65F5', '#6D3FC4']} style={st.card}>
            <View style={st.cardIconWrap}>
              <Icon name="zap" size={32} color="#fff" />
            </View>
            <Text style={st.cardTitle}>1 vs 1</Text>
            <Text style={st.cardSub}>Battles en direct entre créateurs</Text>
            <View style={st.cardArrow}>
              <Icon name="arrow-right" size={16} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.9} onPress={() => nav.navigate('LiveTournaments')} style={st.cardWrap}>
          <LinearGradient colors={['#F59E0B', '#C2760A']} style={st.card}>
            <View style={st.cardIconWrap}>
              <Icon name="award" size={32} color="#fff" />
            </View>
            <Text style={st.cardTitle}>Tournois</Text>
            <Text style={st.cardSub}>Compétitions à élimination, ligues et plus</Text>
            <View style={st.cardArrow}>
              <Icon name="arrow-right" size={16} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  body: { flex: 1, padding: 16, gap: 16 },
  cardWrap: { flex: 1 },
  card: { flex: 1, borderRadius: 24, padding: 22, justifyContent: 'flex-end' },
  cardIconWrap: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  cardTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 6 },
  cardSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginBottom: 14 },
  cardArrow: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
  },
});
