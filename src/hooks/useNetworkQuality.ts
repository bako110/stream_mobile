import { useEffect, useState } from 'react';
import { networkService, type NetworkQuality } from '../services/networkService';

/**
 * 'fast' (wifi/4G+/5G), 'slow' (2G/3G confirmes), 'unknown' (type indetermine,
 * traite avec la meme prudence que 'slow' cote consommateurs — cf.
 * networkService pour le detail des paliers).
 */
export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState(networkService.getQuality());

  useEffect(() => networkService.subscribeQuality(setQuality), []);

  return quality;
}
