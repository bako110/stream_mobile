import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { LoginManager, AccessToken } from 'react-native-fbsdk-next';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo, SocialAuthButton } from '../../components/common';
import { authService } from '../../services/authService';

GoogleSignin.configure({
  webClientId: '862524928219-ojtrr3me5atb36mnd99fu71h37e94pte.apps.googleusercontent.com',
  offlineAccess: false,
});

interface Props {
  onGoBack:      () => void;
  onAuthSuccess: () => void;
}

export const SocialLoginScreen: React.FC<Props> = ({ onGoBack, onAuthSuccess }) => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;

  const [loading, setLoading] = useState<'google' | 'facebook' | null>(null);

  const handleGoogle = useCallback(async () => {
    setLoading('google');
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut();
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      await authService.oauthGoogle(tokens.accessToken);
      onAuthSuccess();
    } catch (e: any) {
      if (e.code !== statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert('Erreur Google', e?.message ?? 'Connexion impossible');
      }
    } finally {
      setLoading(null);
    }
  }, [onAuthSuccess]);

  const handleFacebook = useCallback(async () => {
    setLoading('facebook');
    try {
      const result = await LoginManager.logInWithPermissions(['public_profile', 'email']);
      if (result.isCancelled) return;
      const data = await AccessToken.getCurrentAccessToken();
      if (!data) throw new Error('Token Facebook manquant');
      await authService.oauthFacebook(data.accessToken);
      onAuthSuccess();
    } catch (e: any) {
      Alert.alert('Erreur Facebook', e?.message ?? 'Connexion impossible');
    } finally {
      setLoading(null);
    }
  }, [onAuthSuccess]);

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
          <View style={{ opacity: loading === 'google' ? 0.6 : 1 }}>
            <SocialAuthButton
              provider="google"
              onPress={handleGoogle}
            />
            {loading === 'google' && (
              <ActivityIndicator style={styles.spinner} color={colors.primary} />
            )}
          </View>
          <View style={{ opacity: loading === 'facebook' ? 0.6 : 1, marginTop: 12 }}>
            <SocialAuthButton
              provider="facebook"
              onPress={handleFacebook}
            />
            {loading === 'facebook' && (
              <ActivityIndicator style={styles.spinner} color="#1877F2" />
            )}
          </View>
        </Animated.View>

        {/* Info */}
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
  backBtn:   { alignSelf: 'flex-start', padding: 10, borderRadius: 12, borderWidth: 1 },
  content:   { flex: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 40 },
  logoWrap:  { alignItems: 'center', marginBottom: 20 },
  title:     { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle:  { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 32, color: '#888' },
  socialList:{ gap: 0 },
  spinner:   { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  infoBox:   {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 28, padding: 14, borderRadius: 14, overflow: 'hidden',
  },
  infoText:  { flex: 1, fontSize: 13, lineHeight: 19 },
});
