import { useEffect, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { userService } from '../services/userService';

export interface UserCoords {
  lat: number;
  lon: number;
}

// Position deja envoyee au backend pendant la session — evite de spammer
// PUT /me/location a chaque ecran qui appelle ce hook avec les memes coords
// (ConcertsScreen, FeedScreen, HomeScreen, NearbyEventsScreen...).
let lastSyncedCoords: UserCoords | null = null;

/**
 * `enabled` par defaut a false — ne demande la permission localisation que quand
 * l'appelant l'active explicitement (ex: ouverture d'une section "a proximite"),
 * plutot qu'automatiquement des le montage de l'ecran d'accueil.
 *
 * Synchronise systematiquement la position obtenue vers le backend
 * (PUT /me/location) : c'est l'unique source que lit feed_service.py pour le
 * bonus de proximite du feed principal et les suggestions. Avant ce fix,
 * seul FeedScreen appelait ce PUT (via son propre syncLocationForSuggestions,
 * retire) — un utilisateur passant par NearbyEventsScreen/ConcertsScreen sans
 * jamais ouvrir le feed avec la permission accordee gardait latitude/longitude
 * a null en base indefiniment, et le feed ne pouvait jamais le prioriser par
 * proximite malgre une localisation "a proximite" fonctionnelle par ailleurs.
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
            message: 'Gofolyx utilise votre position pour vous proposer les événements près de chez vous.',
            buttonPositive: 'Autoriser',
            buttonNegative: 'Refuser',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }

      Geolocation.getCurrentPosition(
        pos => {
          if (cancelled) return;
          const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setCoords(next);
          if (
            lastSyncedCoords === null ||
            lastSyncedCoords.lat !== next.lat ||
            lastSyncedCoords.lon !== next.lon
          ) {
            lastSyncedCoords = next;
            userService.updateLocation(next.lat, next.lon).catch(() => { lastSyncedCoords = null; });
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
