import React, { createContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';
import { currencyService } from '../services/currencyService';
import type { CurrencyInfo } from '../services/currencyService';
import { getLastKnownCoords } from '../hooks/useUserLocation';
import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';

// Intervalle de poll de la position déjà connue (pas de nouvelle demande GPS
// ici, cf. getLastKnownCoords) — le temps qu'un écran comme FeedScreen
// obtienne la position pendant cette même session.
const COORDS_POLL_MS = 2000;
const COORDS_POLL_MAX_ATTEMPTS = 30; // ~1 min, puis abandon silencieux (reste en EUR)

async function detectCountryCode(lat: number, lon: number): Promise<string | null> {
  const res = await apiClient.get<{ country_code: string | null }>(Endpoints.utils.geocodeCountry(lat, lon));
  return res.data?.country_code ?? null;
}

interface CurrencyContextValue {
  currencies: CurrencyInfo[];
  selected: CurrencyInfo | null; // null = EUR uniquement, pas de devise locale choisie
  loading: boolean;
  error: string | null;
  reload: () => void;
  setCurrencyCode: (code: string | null) => void;
  convertFromEur: (amountEur: number) => number | null;
}

export const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>([]);
  const [code, setCode] = useState<string | null>(() => storage.getItem(STORAGE_KEYS.CURRENCY_CODE) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    currencyService.list()
      .then(res => setCurrencies(res.currencies))
      .catch(err => setError(err?.message ?? 'Erreur de chargement des devises'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setCurrencyCode = useCallback((newCode: string | null) => {
    // Un choix manuel (y compris "Aucune" -> null) marque la détection comme
    // faite pour de bon — sinon le poll d'auto-détection ci-dessous pourrait
    // écraser un "non merci, je reste en EUR" explicite au prochain lancement.
    storage.setItem(STORAGE_KEYS.CURRENCY_AUTO_DETECTED, '1');
    if (newCode) storage.setItem(STORAGE_KEYS.CURRENCY_CODE, newCode);
    else storage.removeItem(STORAGE_KEYS.CURRENCY_CODE);
    setCode(newCode);
  }, []);

  // ── Pré-sélection automatique par pays (premier lancement uniquement) ──────
  // Ne tourne que si l'utilisateur n'a JAMAIS interagi avec le choix de devise
  // (ni choisi une devise locale, ni explicitement gardé l'EUR) — cf. le flag
  // posé par setCurrencyCode ci-dessus. Lit une position déjà connue sans
  // jamais déclencher sa propre demande de permission GPS (cf.
  // getLastKnownCoords) : si aucun écran n'a encore obtenu la position après
  // COORDS_POLL_MAX_ATTEMPTS tentatives, abandon silencieux — rester en EUR
  // par défaut est un résultat acceptable, pas une erreur à retenter sans fin.
  const autoDetectRanRef = useRef(false);
  useEffect(() => {
    if (autoDetectRanRef.current) return;
    if (storage.getItem(STORAGE_KEYS.CURRENCY_AUTO_DETECTED)) return;
    autoDetectRanRef.current = true;

    let cancelled = false;
    let attempts = 0;

    const tryDetect = async () => {
      if (cancelled) return;
      const coords = getLastKnownCoords();
      if (!coords) {
        attempts += 1;
        if (attempts >= COORDS_POLL_MAX_ATTEMPTS) {
          storage.setItem(STORAGE_KEYS.CURRENCY_AUTO_DETECTED, '1');
          return;
        }
        setTimeout(tryDetect, COORDS_POLL_MS);
        return;
      }
      try {
        const countryCode = await detectCountryCode(coords.lat, coords.lon);
        if (cancelled) return;
        if (countryCode) {
          const localCurrency = await currencyService.byCountry(countryCode);
          if (cancelled) return;
          if (localCurrency) {
            storage.setItem(STORAGE_KEYS.CURRENCY_CODE, localCurrency.code);
            setCode(localCurrency.code);
          }
        }
      } catch {
        // silencieux — reste en EUR, retentera au prochain lancement tant que
        // le flag AUTO_DETECTED n'a pas été posé.
        return;
      }
      storage.setItem(STORAGE_KEYS.CURRENCY_AUTO_DETECTED, '1');
    };

    tryDetect();
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(
    () => (code ? currencies.find(c => c.code === code) ?? null : null),
    [code, currencies],
  );

  const convertFromEur = useCallback(
    (amountEur: number) => (selected ? amountEur * selected.rate_from_eur : null),
    [selected],
  );

  const value = useMemo(
    () => ({ currencies, selected, loading, error, reload: load, setCurrencyCode, convertFromEur }),
    [currencies, selected, loading, error, load, setCurrencyCode, convertFromEur],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};
