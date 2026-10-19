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
import { capStackDepth }    from './stackHygiene';
import { storage }          from '../utils/storage';
import { STORAGE_KEYS }     from '../utils/constants';
import { authService, accountsService } from '../services';
import { ApiError }         from '../api/client';
import NetInfo              from '@react-native-community/netinfo';
import { useTheme }         from '../hooks/useTheme';
import { decodeId }         from '../utils/slugId';
import { setupFCM } from '../services/fcmService';
import { UpdateBanner } from '../components/common/UpdateBanner';
import { DownloadToast } from '../components/common/DownloadToast';
import { cleanupImageCache } from '../services/imageCacheService';
import { cleanup as cleanupVideoCache } from '../services/videoCacheService';
import { cleanup as cleanupReelVideoCache } from '../services/reelVideoCacheService';
import { startReelsPrefetch } from '../services/reelsPrefetchService';


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

  // Résolution de session (token stocké + vérification réseau getMe/refresh) ET
  // animation de SplashScreen tournent maintenant EN PARALLÈLE au lieu de
  // s'enchaîner : avant, cette résolution ne démarrait qu'au onFinish de
  // l'animation (~1.9s), laissant un écran vide supplémentaire pendant l'appel
  // réseau juste après la disparition du splash. Ici, dès le montage, on
  // calcule le prochain état ("onboarding" | "auth" | "main" + blockedInfo) et
  // on le stocke sans l'appliquer — seul onFinish (fin réelle de l'animation)
  // déclenche la transition visuelle, mais le résultat est déjà prêt la
  // plupart du temps (la vérif réseau est largement plus courte que ~1.9s).
  const resolvedNextStateRef = useRef<{ state: AppState; blocked?: { reason?: string; contact?: string } } | null>(null);
  const splashAnimDoneRef = useRef(false);

  const resolveSession = async (): Promise<{ state: AppState; blocked?: { reason?: string; contact?: string } }> => {
    const onboardingDone = storage.getBoolean(STORAGE_KEYS.ONBOARDING_DONE);
    if (!onboardingDone) return { state: 'onboarding' };

    accountsService.migrateIfNeeded();

    let forcedAuthBlocked: { reason?: string; contact?: string } | undefined;
    const token = authService.loadStoredToken(
      async () => {
        const net = await NetInfo.fetch();
        if (!net.isConnected || !net.isInternetReachable) return;
        authService._clearTokens();
      },
      (reason, contact) => {
        authService._clearTokens();
        forcedAuthBlocked = { reason, contact };
      },
    );

    if (!token || forcedAuthBlocked) {
      return { state: 'auth', blocked: forcedAuthBlocked };
    }

    try {
      const me = await authService.getMe(true);
      // Revérifié à chaque démarrage (pas seulement au login) — un compte
      // OAuth qui a fermé l'app sans compléter sexe/âge ne doit jamais
      // atterrir directement sur le feed à son retour.
      if (me.profile_incomplete) return { state: 'completeProfile' };
      return { state: 'main' };
    } catch (err) {
      const isNetworkError = err instanceof ApiError && err.status === 0;
      if (isNetworkError) return { state: 'main' };
      try {
        const refreshed = await authService.refresh();
        if (refreshed.profile_incomplete) return { state: 'completeProfile' };
        return { state: 'main' };
      } catch (refreshErr) {
        const isRefreshNetworkError = refreshErr instanceof ApiError && (refreshErr as ApiError).status === 0;
        if (isRefreshNetworkError) return { state: 'main' };
        authService._clearTokens();
        return { state: 'auth' };
      }
    }
  };

  const applyResolvedState = (resolved: { state: AppState; blocked?: { reason?: string; contact?: string } }) => {
    if (resolved.blocked) setBlockedInfo(resolved.blocked);
    setAppState(resolved.state);
    if (resolved.state === 'main') {
      // Lancé tout de suite (pas de setTimeout) : la liste des reels + le
      // téléchargement de la 1ère vidéo doivent démarrer le plus tôt possible,
      // pendant que l'utilisateur est encore sur Feed — avant les cleanups de
      // cache ci-dessous, pour ne jamais risquer de nettoyer ce qu'on vient de
      // précharger. ReelsScreen consomme ce résultat à son premier montage
      // (voir reelsPrefetchService) au lieu de refetcher depuis zéro.
      startReelsPrefetch();
      setTimeout(() => {
        setupFCM().catch((e) => console.warn('[FCM] setupFCM splash error:', e?.message ?? e));
      }, 500);
      setTimeout(() => {
        cleanupImageCache().catch(() => {});
        cleanupVideoCache().catch(() => {});
        cleanupReelVideoCache().catch(() => {});
      }, 1000);
      navigatePendingUrl();
    }
  };

  // Démarre la résolution dès le montage (en parallèle de l'animation du
  // splash) — si l'animation est déjà finie quand la résolution arrive (cas
  // rare : réseau très lent), on applique immédiatement.
  useEffect(() => {
    resolveSession().then((resolved) => {
      resolvedNextStateRef.current = resolved;
      if (splashAnimDoneRef.current) applyResolvedState(resolved);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const navigatePendingUrl = () => {
    const url = pendingUrlRef.current;
    if (!url) return;
    pendingUrlRef.current = null;
    setTimeout(() => Linking.openURL(url).catch(() => {}), 500);
  };

  // Appelé à la fin RÉELLE de l'animation de SplashScreen (onFinish) — la
  // résolution de session tourne déjà depuis le montage (cf. useEffect
  // resolveSession ci-dessus) ; la plupart du temps son résultat est déjà
  // disponible ici (vérif réseau << ~1.9s d'animation), donc la transition est
  // immédiate. Sinon (réseau lent), on applique dès que resolveSession() se
  // termine, cf. le .then() dans ce même useEffect.
  const handleSplashDone = () => {
    splashAnimDoneRef.current = true;
    if (resolvedNextStateRef.current) applyResolvedState(resolvedNextStateRef.current);
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
    startReelsPrefetch();
    setTimeout(() => {
      setupFCM().catch((e) => console.warn('[FCM] setupFCM login error:', e?.message ?? e));
    }, 500);
    setTimeout(() => {
      cleanupImageCache().catch(() => {});
      cleanupVideoCache().catch(() => {});
      cleanupReelVideoCache().catch(() => {});
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
    <NavigationContainer
      ref={navigationRef}
      theme={isDark ? NAV_THEME_DARK : NAV_THEME_LIGHT}
      linking={linking}
      // Filet de sécurité contre l'accumulation illimitée d'écrans dans le
      // stack principal (cf. stackHygiene.ts) — vérifie la profondeur après
      // CHAQUE navigation, peu importe sa source (useNavigation() dans un
      // écran, navigationRef pour les deep links/notifications, ou linking).
      onStateChange={() => capStackDepth()}
    >
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
