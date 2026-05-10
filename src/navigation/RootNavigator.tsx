import React, { useState } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme } from '@react-navigation/native';
import { SplashScreen }     from '../screens/Onboarding/SplashScreen';
import { OnboardingScreen } from '../screens/Onboarding/OnboardingScreen';
import { AuthNavigator }    from './AuthNavigator';
import { MainNavigator }    from './MainNavigator';
import { WebSocketProvider } from '../context/WebSocketContext';
import { UserProvider }      from '../context/UserContext';
import { navigationRef }    from './navigationRef';
import { storage }          from '../utils/storage';
import { STORAGE_KEYS }     from '../utils/constants';
import { authService }      from '../services';
import { useTheme }         from '../hooks/useTheme';
import { setupFCM } from '../services/fcmService';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

async function requestContactsPermission() {
  try {
    const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CONTACTS : PERMISSIONS.ANDROID.READ_CONTACTS;
    const status = await check(perm);
    if (status === RESULTS.DENIED) await request(perm);
  } catch {}
}

type AppState = 'splash' | 'onboarding' | 'auth' | 'main';

const NAV_THEME_LIGHT: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary:      '#7B3FF2',
    background:   '#FFFFFF',
    card:         '#FFFFFF',
    text:         '#12101F',
    border:       '#E0DFF0',
    notification: '#7B3FF2',
  },
};

const NAV_THEME_DARK: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary:      '#9B65F5',
    background:   '#0D0D1A',
    card:         '#161625',
    text:         '#F0EFF8',
    border:       '#2A2840',
    notification: '#9B65F5',
  },
};

export const RootNavigator: React.FC = () => {
  const { isDark } = useTheme();
  const [appState, setAppState] = useState<AppState>('splash');

  const handleSplashDone = async () => {
    const onboardingDone = storage.getBoolean(STORAGE_KEYS.ONBOARDING_DONE);
    if (!onboardingDone) {
      setAppState('onboarding');
      return;
    }

    const token = authService.loadStoredToken(() => {
      authService._clearTokens();
      setAppState('auth');
    });

    if (!token) {
      setAppState('auth');
      return;
    }

    // Verifier que la session est toujours valide (token ou refresh token ok)
    try {
      await authService.getMe(true);
      setAppState('main');
      setupFCM().catch((e) => console.warn('[FCM] setupFCM splash error:', e?.message ?? e));
      requestContactsPermission();
    } catch {
      // getMe a echoue — tenter le refresh
      try {
        await authService.refresh();
        setAppState('main');
        setupFCM().catch((e) => console.warn('[FCM] setupFCM splash error:', e?.message ?? e));
        requestContactsPermission();
      } catch {
        // Refresh aussi echoue — session completement expiree
        authService._clearTokens();
        setAppState('auth');
      }
    }
  };

  const handleOnboardingDone = () => {
    storage.setBoolean(STORAGE_KEYS.ONBOARDING_DONE, true);
    setAppState('auth');
  };

  const handleAuthSuccess = () => {
    setAppState('main');
    console.log('[FCM] calling setupFCM from login...');
    setupFCM().catch((e) => console.warn('[FCM] setupFCM login error:', e?.message ?? e));
    requestContactsPermission();
  };
  const handleLogout = () => {
    setAppState('auth');
  };

  // Splash & Onboarding — pas besoin de NavigationContainer
  if (appState === 'splash') {
    return <SplashScreen onFinish={handleSplashDone} />;
  }
  if (appState === 'onboarding') {
    return <OnboardingScreen onFinish={handleOnboardingDone} />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={isDark ? NAV_THEME_DARK : NAV_THEME_LIGHT}>
      {appState === 'main'
        ? <UserProvider><WebSocketProvider><MainNavigator onLogout={handleLogout} /></WebSocketProvider></UserProvider>
        : <AuthNavigator onAuthSuccess={handleAuthSuccess} />
      }
    </NavigationContainer>
  );
};
