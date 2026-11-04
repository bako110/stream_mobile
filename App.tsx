import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { ThemeProvider } from './src/context/ThemeContext';
import { CurrencyProvider } from './src/context/CurrencyContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Toast } from './src/components/common/Toast';
import { ConfirmModal } from './src/components/common/ConfirmModal';
import { apiClient } from './src/api';
import { Endpoints } from './src/api/endpoints';
import { clearAll as clearReelVideoCache } from './src/services/reelVideoCacheService';
import { storage } from './src/utils/storage';

const STRIPE_KEY_RETRY_MS = 4000;

export default function App() {
  // Clé publique Stripe — nécessite un utilisateur connecté (endpoint
  // authentifié) : au tout premier lancement le token n'est pas encore posé,
  // donc le fetch échoue une ou plusieurs fois avant le login. Sur Android,
  // PaymentSheet plante avec "PaymentConfiguration was not initialized" si
  // StripeProvider est monté avec une clé vide puis mise à jour plus tard —
  // on retente donc jusqu'à obtenir une vraie clé au lieu de se contenter du
  // premier échec.
  const [stripeKey, setStripeKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const attempt = () => {
      apiClient.get<{ publishable_key: string }>(Endpoints.wallet.stripeConfig)
        .then(res => {
          if (cancelled) return;
          if (res.data.publishable_key) setStripeKey(res.data.publishable_key);
          else timer = setTimeout(attempt, STRIPE_KEY_RETRY_MS);
        })
        .catch(() => { if (!cancelled) timer = setTimeout(attempt, STRIPE_KEY_RETRY_MS); });
    };
    attempt();

    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  // Vide le cache disque des vidéos reels seulement après un VRAI passage en
  // arrière-plan de 12h — on mise au maximum sur le cache (économie de data
  // mobile, demande explicite) plutôt que de le vider à la moindre occasion.
  //
  // 'inactive' SEUL ne doit jamais déclencher la purge (bug corrigé 2026-11,
  // confirmé : vidéos déjà en cache disque retéléchargées en boucle). Sur iOS,
  // AppState passe par 'inactive' pour de nombreuses interruptions transitoires
  // anodines — centre de notifications, appel entrant, feuille de partage
  // native, sélecteur de permissions — qui ne quittent jamais réellement l'app.
  //
  // Un setTimeout seul ne suffit pas pour un délai de 12h : l'OS peut tuer le
  // process JS pendant une mise en arrière-plan aussi longue, perdant le timer
  // sans jamais purger. L'horodatage d'entrée en arrière-plan est donc persisté
  // (MMKV, survit à un kill) et revérifié à CHAQUE retour en 'active' — la
  // purge a lieu si 12h se sont écoulées depuis, que l'app ait été tuée
  // entre-temps ou non. Le setTimeout reste utile pour le cas où l'app tourne
  // en arrière-plan sans jamais être tuée (rare mais possible, tâches de fond).
  useEffect(() => {
    const BACKGROUND_PURGE_DELAY_MS = 12 * 3600_000; // 12h
    const BG_SINCE_KEY = 'reel_cache_bg_since';
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Au démarrage : si l'app a été tuée pendant >= 12h d'arrière-plan, purge
    // immédiatement (le setTimeout de la session précédente a été perdu).
    const since = storage.getItem(BG_SINCE_KEY);
    if (since) {
      const elapsed = Date.now() - Number(since);
      if (elapsed >= BACKGROUND_PURGE_DELAY_MS) clearReelVideoCache().catch(() => {});
      storage.removeItem(BG_SINCE_KEY);
    }

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        storage.setItem(BG_SINCE_KEY, String(Date.now()));
        timer = setTimeout(() => {
          clearReelVideoCache().catch(() => {});
          storage.removeItem(BG_SINCE_KEY);
        }, BACKGROUND_PURGE_DELAY_MS);
      } else if (nextState === 'active') {
        if (timer) { clearTimeout(timer); timer = null; }
        storage.removeItem(BG_SINCE_KEY);
      }
    });
    return () => { sub.remove(); if (timer) clearTimeout(timer); };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider publishableKey={stripeKey ?? ''}>
          <ThemeProvider>
            <CurrencyProvider>
              <RootNavigator />
              <Toast />
              <ConfirmModal />
            </CurrencyProvider>
          </ThemeProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
