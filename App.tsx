import React, { useEffect, useState } from 'react';
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
