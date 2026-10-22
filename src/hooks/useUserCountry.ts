import { useEffect, useState, useRef } from 'react';
import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import { storage } from '../utils/storage';
import type { UserCoords } from './useUserLocation';

const STORAGE_KEY = 'user_country_cache';
// Même TTL que le cache serveur (24h) — le pays d'un point donné ne change
// jamais, pas besoin de rafraîchir plus souvent tant que l'utilisateur reste
// dans la même zone.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CountryCache {
  country_name: string | null;
  lat_r: number;
  lon_r: number;
  cachedAt: number;
}

/**
 * Normalise pour comparaison tolérante (accents, casse, espaces/tirets) —
 * venue_country est un champ texte libre saisi par l'organisateur ("Burkina
 * Faso", "burkina-faso"…), jamais un code ISO, donc la comparaison avec le
 * pays déduit du GPS (nom renvoyé par Nominatim) doit être souple plutôt
 * qu'une égalité stricte.
 */
export function normalizeCountryName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/[^a-z]/g, ''); // ne garde que les lettres
}

function readCache(): CountryCache | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CountryCache;
  } catch { return null; }
}

function writeCache(c: CountryCache): void {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch {}
}

/**
 * Déduit automatiquement le nom du pays de l'utilisateur depuis sa position
 * GPS (reverse geocoding côté serveur, jamais demandé explicitement) —
 * utilisé par le carrousel "événements proches / dans ton pays" du feed
 * d'accueil pour comparer à Event.venue_country (normalizeCountryName des
 * deux côtés). Mis en cache localement (24h, position arrondie à 0.1°
 * ~11km) pour ne jamais rappeler l'API à chaque montage tant que
 * l'utilisateur n'a pas significativement changé de position.
 */
export function useUserCountry(coords: UserCoords | null): string | null {
  const [countryName, setCountryName] = useState<string | null>(() => {
    const cached = readCache();
    if (!cached || Date.now() - cached.cachedAt > CACHE_TTL_MS) return null;
    return cached.country_name;
  });
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!coords) return;
    const lat_r = Math.round(coords.lat * 10) / 10;
    const lon_r = Math.round(coords.lon * 10) / 10;
    const key = `${lat_r}:${lon_r}`;
    if (fetchedForRef.current === key) return;

    const cached = readCache();
    if (cached && cached.lat_r === lat_r && cached.lon_r === lon_r && Date.now() - cached.cachedAt <= CACHE_TTL_MS) {
      fetchedForRef.current = key;
      setCountryName(cached.country_name);
      return;
    }

    fetchedForRef.current = key;
    apiClient.get<{ country_code: string | null; country_name: string | null }>(
      Endpoints.utils.geocodeCountry(coords.lat, coords.lon),
    ).then(res => {
      const country_name = res.data?.country_name ?? null;
      writeCache({ country_name, lat_r, lon_r, cachedAt: Date.now() });
      setCountryName(country_name);
    }).catch(() => {});
  }, [coords?.lat, coords?.lon]);

  return countryName;
}
