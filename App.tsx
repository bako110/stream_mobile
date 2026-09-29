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

  // Vide tout le cache disque des vidéos reels dès que l'app quitte le premier
  // plan (arrière-plan ou fermeture) — choix explicite : le cache ne sert qu'à
  // éviter la compétition réseau entre reels préchargés et actif PENDANT une
  // session, jamais à persister entre deux ouvertures de l'app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        clearReelVideoCache().catch(() => {});
      }
    });
    return () => sub.remove();
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
