/**
 * networkService — détecte si la connexion est "coûteuse" (4G/5G) vs Wifi,
 * ET sa qualité approximative (rapide / lente / inconnue) pour adapter le
 * buffer vidéo sur les connexions faibles (2G/3G, zones mal couvertes).
 *
 * Tier de qualité (2026-09) : jusqu'ici isWifi() était BINAIRE (wifi vs tout
 * le reste), donc une 5G et une 2G lente recevaient exactement le meme
 * bufferConfig cote ReelsScreen (cf. "hors wifi" dans le composant reel) --
 * sur un appareil/reseau faible, le buffer "cellulaire" (deja reduit vs
 * wifi) restait encore trop ambitieux pour une vraie connexion lente,
 * causant des rebuffers frequents plutot qu'un chargement plus progressif
 * mais fluide. NetworkQuality distingue maintenant 3 paliers : 'fast'
 * (wifi/ethernet/4G+/5G), 'slow' (2G/3G confirmes par NetInfo), 'unknown'
 * (type indetermine -- traite comme 'slow' par prudence, jamais comme
 * 'fast' par defaut : mieux vaut un buffer trop prudent sur une bonne
 * connexion qu'un buffer trop ambitieux sur une mauvaise).
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export type NetworkQuality = 'fast' | 'slow' | 'unknown';

let _isWifi = true; // optimiste par défaut tant que NetInfo n'a pas répondu
let _quality: NetworkQuality = 'fast'; // meme optimisme initial que _isWifi
const listeners = new Set<(isWifi: boolean) => void>();
const qualityListeners = new Set<(quality: NetworkQuality) => void>();

// Generations cellulaires considerees lentes -- '2g'/'3g' uniquement,
// '4g'/'5g' rejoignent 'fast'. cellularGeneration peut etre absent meme en
// cellulaire (appareil/OS qui ne le remonte pas) : traite comme 'unknown',
// jamais suppose 'fast' par defaut (cf. docstring plus haut).
const SLOW_CELLULAR_GENERATIONS = new Set(['2g', '3g']);

function computeQuality(state: NetInfoState): NetworkQuality {
  if (state.type === 'wifi' || state.type === 'ethernet') return 'fast';
  if (state.type === 'cellular') {
    const gen = (state.details as { cellularGeneration?: string } | null)?.cellularGeneration;
    if (gen && SLOW_CELLULAR_GENERATIONS.has(gen)) return 'slow';
    if (gen === '4g' || gen === '5g') return 'fast';
    return 'unknown'; // cellulaire sans generation remontee
  }
  return 'unknown'; // type 'none'/'unknown'/'other'/'bluetooth'/'wimax'/'vpn'
}

function applyState(state: NetInfoState): void {
  // Wifi/Ethernet → illimité. Cellulaire (4G/5G) ou inconnu → considéré coûteux.
  const isWifi = state.type === 'wifi' || state.type === 'ethernet';
  if (isWifi !== _isWifi) {
    _isWifi = isWifi;
    listeners.forEach(l => l(isWifi));
  }

  const quality = computeQuality(state);
  if (quality !== _quality) {
    _quality = quality;
    qualityListeners.forEach(l => l(quality));
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
  /** Qualité réseau approximative — voir NetworkQuality et le commentaire de tête. */
  getQuality(): NetworkQuality {
    return _quality;
  },
  subscribe(listener: (isWifi: boolean) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  subscribeQuality(listener: (quality: NetworkQuality) => void): () => void {
    qualityListeners.add(listener);
    return () => qualityListeners.delete(listener);
  },
};
