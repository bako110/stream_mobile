/**
 * useKeepAwake — empêche la mise en veille de l'écran tant que le composant est monté.
 * Utilise InCallManager.setKeepScreenOn (déjà installé pour les appels), sans démarrer
 * de session audio — contrairement à InCallManager.start(), qui reste réservé aux appels.
 */
import { useEffect } from 'react';
import InCallManager from 'react-native-incall-manager';

export function useKeepAwake(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    InCallManager.setKeepScreenOn(true);
    return () => InCallManager.setKeepScreenOn(false);
  }, [enabled]);
}
