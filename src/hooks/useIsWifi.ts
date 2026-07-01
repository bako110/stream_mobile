import { useEffect, useState } from 'react';
import { networkService } from '../services/networkService';

/** true si Wifi/Ethernet, false en 4G/5G ou connexion inconnue. */
export function useIsWifi(): boolean {
  const [isWifi, setIsWifi] = useState(networkService.isWifi());

  useEffect(() => networkService.subscribe(setIsWifi), []);

  return isWifi;
}
