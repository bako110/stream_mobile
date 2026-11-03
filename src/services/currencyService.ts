import { apiClient, Endpoints } from '../api';

export interface CurrencyInfo {
  code: string;
  label: string;
  symbol: string;
  rate_from_eur: number;
}

export interface CurrenciesResponse {
  base: string;
  currencies: CurrencyInfo[];
}

export const currencyService = {
  async list(): Promise<CurrenciesResponse> {
    const res = await apiClient.get<CurrenciesResponse>(Endpoints.currencies.list);
    return res.data;
  },

  /** Résout la devise locale depuis un code pays ISO2 — null si aucune devise connue pour ce pays. */
  async byCountry(countryCode: string): Promise<CurrencyInfo | null> {
    const res = await apiClient.get<CurrencyInfo | null>(Endpoints.currencies.byCountry(countryCode));
    return res.data ?? null;
  },
};
