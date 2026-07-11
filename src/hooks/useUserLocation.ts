import { useEffect, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export interface UserCoords {
  lat: number;
  lon: number;
}

/**
 * `enabled` par defaut a false — ne demande la permission localisation que quand
 * l'appelant l'active explicitement (ex: ouverture d'une section "a proximite"),
 * plutot qu'automatiquement des le montage de l'ecran d'accueil.
 */
export function useUserLocation(enabled: boolean = true): UserCoords | null {
  const [coords, setCoords] = useState<UserCoords | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Localisation',
            message: 'GoFolyX utilise votre position pour vous proposer les événements près de chez vous.',
            buttonPositive: 'Autoriser',
            buttonNegative: 'Refuser',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }

      Geolocation.getCurrentPosition(
        pos => {
          if (!cancelled) {
            setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          }
        },
        () => { /* silencieux si refus */ },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
      );
    };

    run();
    return () => { cancelled = true; };
  }, [enabled]);

  return coords;
}
