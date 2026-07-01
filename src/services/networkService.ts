/**
 * networkService — détecte si la connexion est "coûteuse" (4G/5G) vs Wifi.
 * Utilisé pour réduire l'autoplay/préchargement hors wifi (économie de data mobile).
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

let _isWifi = true; // optimiste par défaut tant que NetInfo n'a pas répondu
const listeners = new Set<(isWifi: boolean) => void>();

function applyState(state: NetInfoState): void {
  // Wifi/Ethernet → illimité. Cellulaire (4G/5G) ou inconnu → considéré coûteux.
  const isWifi = state.type === 'wifi' || state.type === 'ethernet';
  if (isWifi !== _isWifi) {
    _isWifi = isWifi;
    listeners.forEach(l => l(isWifi));
  }
}

NetInfo.fetch().then(applyState).catch(() => {});
NetInfo.addEventListener(applyState);

export const networkService = {
  /** Snapshot synchrone — utilisable directement dans un composant. */
  isWifi(): boolean {
    return _isWifi;
  },
  /** true si la connexion est facturée à la donnée (4G/5G) — inverse de isWifi(). */
  isMetered(): boolean {
    return !_isWifi;
  },
  subscribe(listener: (isWifi: boolean) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
