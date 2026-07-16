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
};
