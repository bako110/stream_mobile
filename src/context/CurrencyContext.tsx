import React, { createContext, useState, useCallback, useMemo, useEffect } from 'react';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';
import { currencyService } from '../services/currencyService';
import type { CurrencyInfo } from '../services/currencyService';

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
    if (newCode) storage.setItem(STORAGE_KEYS.CURRENCY_CODE, newCode);
    else storage.removeItem(STORAGE_KEYS.CURRENCY_CODE);
    setCode(newCode);
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
