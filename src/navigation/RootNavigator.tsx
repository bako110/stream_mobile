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

  const handleSplashDone = () => {
    const onboardingDone = storage.getBoolean(STORAGE_KEYS.ONBOARDING_DONE);
    const token          = authService.loadStoredToken(() => {
      authService._clearTokens();
      setAppState('auth');
    });
    if (!onboardingDone) {
      setAppState('onboarding');
    } else if (token) {
      setAppState('main');
      setupFCM().catch(() => {});
      requestContactsPermission();
    } else {
      setAppState('auth');
    }
  };

  const handleOnboardingDone = () => {
    storage.setBoolean(STORAGE_KEYS.ONBOARDING_DONE, true);
    setAppState('auth');
  };

  const handleAuthSuccess = () => {
    setAppState('main');
    setupFCM().catch(() => {});
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
