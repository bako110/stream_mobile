import React, { useState, useEffect, useRef } from 'react';
import { Platform, Linking } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme } from '@react-navigation/native';
import { SplashScreen }     from '../screens/Onboarding/SplashScreen';
import { OnboardingScreen } from '../screens/Onboarding/OnboardingScreen';
import { AuthNavigator }    from './AuthNavigator';
import { MainNavigator }    from './MainNavigator';
import { CompleteProfileScreen } from '../screens/Auth/CompleteProfileScreen';
import { CGUScreen }                      from '../screens/Main/CGUScreen';
import { PolitiqueConfidentialiteScreen } from '../screens/Main/PolitiqueConfidentialiteScreen';
import { WebSocketProvider } from '../context/WebSocketContext';
import { UserProvider }      from '../context/UserContext';
import { navigationRef }    from './navigationRef';
import { storage }          from '../utils/storage';
import { STORAGE_KEYS }     from '../utils/constants';
import { authService, accountsService } from '../services';
import { ApiError }         from '../api/client';
import NetInfo              from '@react-native-community/netinfo';
import { useTheme }         from '../hooks/useTheme';
import { decodeId }         from '../utils/slugId';
import { setupFCM, resumePendingCallAccept } from '../services/fcmService';
import { callConnectionService } from '../services/callConnectionService';
import { UpdateBanner } from '../components/common/UpdateBanner';
import { DownloadToast } from '../components/common/DownloadToast';
import { cleanupImageCache } from '../services/imageCacheService';
import { cleanup as cleanupVideoCache } from '../services/videoCacheService';


type AppState = 'splash' | 'onboarding' | 'auth' | 'completeProfile' | 'main';

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
  const [legalOverlay, setLegalOverlay] = useState<'cgu' | 'privacy' | null>(null);
  const [blockedInfo, setBlockedInfo] = useState<{ reason?: string; contact?: string; blockedAt?: string } | null>(null);
  // Incrémenté à chaque bascule/ajout/retrait de compte — utilisé comme `key` sur
  // UserProvider pour forcer un remount complet de la session (WebSocket, state
  // utilisateur, pile de navigation) sans dupliquer la logique de enterMain().
  const [sessionKey, setSessionKey] = useState(0);
  const pendingUrlRef = useRef<string | null>(null);

  // Capturer le deep link reçu avant que l'app soit prête
  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url) pendingUrlRef.current = url;
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (appState !== 'main') {
        pendingUrlRef.current = url;
      }
    });
    return () => sub.remove();
  }, []);

  // Actions de l'utilisateur depuis l'écran d'appel natif Android (répondre/refuser),
  // pris hors de l'app (verrouillé, autre appli) — même logique que les actions Notifee.
  useEffect(() => {
    const unsubscribe = callConnectionService.addListener(async (event, callId) => {
      if (event === 'answer') {
        const pendingRaw = storage.getItem('pending_incoming_call');
        let pending: any = null;
        try { pending = pendingRaw ? JSON.parse(pendingRaw) : null; } catch {}
        storage.setItem('pending_call_accept', JSON.stringify({
          caller_id:    callId,
          caller_name:  pending?.caller_name ?? 'Inconnu',
          caller_avatar: pending?.caller_avatar ?? '',
          call_type:    pending?.call_type ?? 'voice',
          call_id:      pending?.call_id ?? null,
        }));
        resumePendingCallAccept();
      } else if (event === 'reject' || event === 'hangup') {
        try {
          const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
          if (token) {
            const { API_BASE_URL } = require('../utils/constants');
            await fetch(`${API_BASE_URL}/api/v1/messages/call/reject`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body:    JSON.stringify({ caller_id: callId }),
            });
          }
        } catch {}
        storage.removeItem('pending_incoming_call');
      }
    });
    return unsubscribe;
  }, []);

  const navigatePendingUrl = () => {
    const url = pendingUrlRef.current;
    if (!url) return;
    pendingUrlRef.current = null;
    setTimeout(() => Linking.openURL(url).catch(() => {}), 500);
  };

  const handleSplashDone = async () => {
    const onboardingDone = storage.getBoolean(STORAGE_KEYS.ONBOARDING_DONE);
    if (!onboardingDone) {
      setAppState('onboarding');
      return;
    }

    accountsService.migrateIfNeeded();

    const token = authService.loadStoredToken(
      async () => {
        // 401 recu pendant une coupure réseau → ignorer, le token est peut-être encore valide
        const net = await NetInfo.fetch();
        if (!net.isConnected || !net.isInternetReachable) return;
        authService._clearTokens();
        setAppState('auth');
      },
      (reason, contact) => {
        authService._clearTokens();
        setBlockedInfo({ reason, contact });
        setAppState('auth');
      },
    );

    if (!token) {
      setAppState('auth');
      return;
    }

    const enterMain = () => {
      setAppState('main');
      // Priorité absolue : reprendre un appel accepté depuis la notification, avant
      // même setupFCM() (permissions/token/réseau, plus lent et faillible) — sinon
      // l'accueil s'affiche et navigationRef.navigate('Call', ...) arrive trop tard
      // ou jamais si une étape de setupFCM échoue en cours de route.
      setTimeout(() => resumePendingCallAccept(), 50);
      callConnectionService.setup();
      setTimeout(() => {
        setupFCM().catch((e) => console.warn('[FCM] setupFCM splash error:', e?.message ?? e));
      }, 500);
      setTimeout(() => {
        cleanupImageCache().catch(() => {});
        cleanupVideoCache().catch(() => {});
      }, 1000);
      navigatePendingUrl();
    };

    // Verifier que la session est toujours valide (token ou refresh token ok)
    try {
      await authService.getMe(true);
      enterMain();
    } catch (err) {
      // Erreur réseau (offline) → on laisse entrer avec le token stocké
      const isNetworkError = err instanceof ApiError && err.status === 0;
      if (isNetworkError) {
        enterMain();
        return;
      }
      // Vraie erreur HTTP (401, etc.) → tenter le refresh
      try {
        await authService.refresh();
        enterMain();
      } catch (refreshErr) {
        // Refresh aussi échoue en réseau → laisser entrer quand même
        const isRefreshNetworkError = refreshErr instanceof ApiError && (refreshErr as ApiError).status === 0;
        if (isRefreshNetworkError) {
          enterMain();
          return;
        }
        // Session vraiment expirée → déconnexion
        authService._clearTokens();
        setAppState('auth');
      }
    }
  };

  const handleOnboardingDone = () => {
    storage.setBoolean(STORAGE_KEYS.ONBOARDING_DONE, true);
    setAppState('auth');
  };

  const handleAuthSuccess = (profileIncomplete?: boolean) => {
    if (profileIncomplete) {
      setAppState('completeProfile');
      return;
    }
    setAppState('main');
    setTimeout(() => resumePendingCallAccept(), 50);
    callConnectionService.setup();
    setTimeout(() => {
      setupFCM().catch((e) => console.warn('[FCM] setupFCM login error:', e?.message ?? e));
    }, 500);
    setTimeout(() => {
      cleanupImageCache().catch(() => {});
      cleanupVideoCache().catch(() => {});
    }, 1000);
    navigatePendingUrl();
  };
  const handleLogout = () => {
    setAppState('auth');
  };

  // Bascule vers un compte déjà stocké (switchAccount réutilise le refresh_token,
  // aucune re-authentification) — puis remonte la session (WebSocket, UserContext,
  // pile de navigation) via le changement de sessionKey.
  const handleSwitchAccount = async (userId: string) => {
    await accountsService.switchAccount(userId); // erreur propagée à l'appelant UI si échec
    setSessionKey(k => k + 1);
    setTimeout(() => {
      setupFCM().catch((e) => console.warn('[FCM] setupFCM switchAccount error:', e?.message ?? e));
    }, 500);
  };

  // Remonte la session SANS re-basculer — utilisé après un ajout de compte (tokens
  // déjà posés par authService.login/oauthGoogle) ou après un retrait du compte actif
  // (switchAccount déjà exécuté en interne par accountsService.removeAccount).
  const handleSessionRebuildNeeded = () => {
    setSessionKey(k => k + 1);
    setTimeout(() => {
      setupFCM().catch((e) => console.warn('[FCM] setupFCM sessionRebuild error:', e?.message ?? e));
    }, 500);
  };

  // Splash & Onboarding — pas besoin de NavigationContainer
  if (appState === 'splash') {
    return <SplashScreen onFinish={handleSplashDone} />;
  }
  if (appState === 'onboarding') {
    if (legalOverlay === 'cgu')     return <CGUScreen onBack={() => setLegalOverlay(null)} />;
    if (legalOverlay === 'privacy') return <PolitiqueConfidentialiteScreen onBack={() => setLegalOverlay(null)} />;
    return (
      <OnboardingScreen
        onFinish={handleOnboardingDone}
        onGoCGU={() => setLegalOverlay('cgu')}
        onGoPrivacy={() => setLegalOverlay('privacy')}
      />
    );
  }
  if (appState === 'completeProfile') {
    return <CompleteProfileScreen onDone={() => handleAuthSuccess()} />;
  }

  const linking = {
    prefixes: ['gofolyx://', 'https://gofolyx.com', 'https://www.gofolyx.com', 'https://gofolyx.app'],
    config: {
      screens: {
        Tabs: {
          screens: {
            Reels: 'reels',
          },
        },
        PostDetail:    'posts/:postId',
        EventDetail:   'events/:eventId',
        ConcertDetail: 'concerts/:concertId',
        JoinCommunity: 'join/:inviteCode',
        UserProfile:   'user/:userId',
      },
    },
    // Gère /reels?id=<slug> → ouvre ReelsScreen avec le bon reel
    getStateFromPath: (path: string, options: any) => {
      const [pathname, search] = path.split('?');
      const params = new URLSearchParams(search ?? '');
      const slugId = params.get('id');

      if (pathname === '/reels' || pathname === 'reels') {
        if (slugId) {
          const reelId = decodeId(slugId);
          return {
            routes: [{
              name: 'Tabs',
              state: {
                routes: [{ name: 'Reels', params: { initialReelId: reelId } }],
                index: 2,
              },
            }],
          };
        }
        return {
          routes: [{ name: 'Tabs', state: { routes: [{ name: 'Reels' }], index: 2 } }],
        };
      }

      // Déléguer les autres routes au handler par défaut
      const { getStateFromPath: defaultGet } = require('@react-navigation/native');
      return defaultGet(path, options);
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={isDark ? NAV_THEME_DARK : NAV_THEME_LIGHT} linking={linking}>
      {appState === 'main'
        ? (
          <UserProvider key={sessionKey}>
            <WebSocketProvider onAccountBlocked={(reason, contact) => {
              authService._clearTokens();
              setBlockedInfo({
                reason,
                contact,
                blockedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
              });
              setAppState('auth');
            }}>
              <MainNavigator
                onLogout={handleLogout}
                onSwitchAccount={handleSwitchAccount}
                onSessionRebuildNeeded={handleSessionRebuildNeeded}
              />
              <UpdateBanner />
              <DownloadToast />
            </WebSocketProvider>
          </UserProvider>
        )
        : <AuthNavigator onAuthSuccess={handleAuthSuccess} initialBlockedInfo={blockedInfo} />
      }
    </NavigationContainer>
  );
};
