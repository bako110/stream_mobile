/**
 * LiveMatchesHubScreen — écran "Live Matchs" (accessible depuis Explorer),
 * propose les deux modes disponibles : "1 vs 1" et "Tournois". Le clic sur
 * une case mène à l'écran dédié correspondant.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ImageBackground } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { Images } from '../../assets';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const LiveMatchesHubScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Live Matchs</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={st.body}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => nav.navigate('LiveOneVsOne')} style={st.cardWrap}>
          <ImageBackground source={Images.liveMatches1v1} style={st.card} imageStyle={st.cardImage}>
            {/* Le titre "1 VS 1 — COMBAT EN DIRECT" fait déjà partie de l'image —
                juste un léger voile pour la lisibilité de la flèche, pas de texte
                dupliqué par-dessus. */}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={st.cardShade} />
            <View style={st.cardFooter}>
              <View style={st.cardArrow}>
                <Icon name="arrow-right" size={16} color="#fff" />
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.9} onPress={() => nav.navigate('LiveTournaments')} style={st.cardWrap}>
          <ImageBackground source={Images.liveMatchesTournament} style={st.card} imageStyle={st.cardImage}>
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={st.cardShade} />
            <View style={st.cardFooter}>
              <View style={st.cardArrow}>
                <Icon name="arrow-right" size={16} color="#fff" />
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  body: { flex: 1, padding: 16, gap: 16 },
  cardWrap: { flex: 1 },
  card: { flex: 1, borderRadius: 24, overflow: 'hidden', justifyContent: 'flex-end' },
  cardImage: { borderRadius: 24, resizeMode: 'cover' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'flex-end',
    padding: 16,
  },
  cardArrow: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});
