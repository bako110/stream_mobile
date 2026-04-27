import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo, SocialAuthButton } from '../../components/common';

interface Props {
  onGoBack:      () => void;
  onAuthSuccess: () => void;
}

export const SocialLoginScreen: React.FC<Props> = ({ onGoBack, onAuthSuccess }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Orbe haut */}
      <View style={styles.orbTR} pointerEvents="none">
        <LinearGradient
          colors={[colors.primary + '45', colors.gradientEnd + '20', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Bouton retour */}
      <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.backRow}>
        <TouchableOpacity onPress={onGoBack} style={[styles.backBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Icon name="arrow-left" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.content}>
        {/* Logo */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.logoWrap}>
          <AppLogo size="md" />
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(160).duration(500)}
          style={[styles.title, { color: colors.textPrimary }]}>
          Continuer avec
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(210).duration(500)}
          style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choisissez un réseau social pour vous connecter rapidement
        </Animated.Text>

        {/* Boutons sociaux */}
        <Animated.View entering={FadeInDown.delay(280).springify()} style={styles.socialList}>
          <SocialAuthButton provider="google"   onPress={() => {}} />
          <SocialAuthButton provider="facebook" onPress={() => {}} style={{ marginTop: 12 }} />
        </Animated.View>

        {/* Séparateur info */}
        <Animated.View entering={FadeInDown.delay(360).duration(400)} style={styles.infoBox}>
          <LinearGradient
            colors={[colors.primary + '10', colors.gradientEnd + '08']}
            style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
          />
          <Icon name="shield" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Nous ne publions jamais rien sur vos réseaux sans votre accord.
          </Text>
        </Animated.View>
      </View>

      {/* Orbe bas */}
      <View style={styles.orbBL} pointerEvents="none">
        <LinearGradient
          colors={['transparent', colors.accentOrange + '22', colors.gradientEnd + '28']}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root:      { flex: 1 },
  orbTR:     { position: 'absolute', top: -100, right: -80, width: 280, height: 280, borderRadius: 140, overflow: 'hidden' },
  orbBL:     { position: 'absolute', bottom: -80, left: -60, width: 240, height: 240, borderRadius: 120, overflow: 'hidden' },
  backRow:   { paddingTop: 56, paddingHorizontal: 20 },
  backBtn:   {
    alignSelf: 'flex-start', padding: 10, borderRadius: 12, borderWidth: 1,
  },
  content:   { flex: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 40 },
  logoWrap:  { alignItems: 'center', marginBottom: 20 },
  title:     { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle:  { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 32, color: '#888' },
  socialList:{ gap: 0 },
  infoBox:   {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 28, padding: 14, borderRadius: 14, overflow: 'hidden',
  },
  infoText:  { flex: 1, fontSize: 13, lineHeight: 19 },
});
