import { Platform } from 'react-native';
import { API_BASE_URL } from '../utils/constants';
import ReactNativeBlobUtil from 'react-native-blob-util';

// Cache initialise de facon asynchrone au demarrage
let _cachedDeviceName: string = Platform.OS === 'ios'
  ? 'iPhone'
  : `Android ${Platform.Version}`;

// Lit /system/build.prop pour extraire ro.product.model et ro.product.brand
// Fonctionne sur tous les Android sans permission, sans lib native supplementaire
async function _initDeviceName(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const content: string = await ReactNativeBlobUtil.fs.readFile('/system/build.prop', 'utf8');
    const lines = content.split('\n');
    const get = (key: string): string => {
      const line = lines.find(l => l.startsWith(key + '='));
      return line ? line.split('=').slice(1).join('=').trim() : '';
    };
    const model = get('ro.product.model') || get('ro.product.name');
    const brand = get('ro.product.brand') || get('ro.product.manufacturer');
    if (model) {
      const brandCap = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : '';
      const modelLow = model.toLowerCase();
      const brandLow = brandCap.toLowerCase();
      _cachedDeviceName = (brandLow && !modelLow.startsWith(brandLow))
        ? `${brandCap} ${model}`
        : model;
    }
  } catch {
    // Fallback deja defini
  }
}

// Lance la lecture en arriere-plan des le chargement du module
_initDeviceName();

function getDeviceName(): string {
  return _cachedDeviceName;
}

const _PLATFORM = Platform.OS;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;
let _refreshTokenFn: (() => Promise<string>) | null = null;
let _onUnauthorized: (() => void) | null = null;
let _onAccountBlocked: ((reason?: string, contact?: string) => void) | null = null;
let _refreshPromise: Promise<string> | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = (): string | null => authToken;

export const setRefreshTokenFn = (fn: () => Promise<string>) => {
  _refreshTokenFn = fn;
};

export const setOnUnauthorized = (fn: () => void) => {
  _onUnauthorized = fn;
};

export const triggerUnauthorized = () => {
  if (_onUnauthorized) _onUnauthorized();
};

export const setOnAccountBlocked = (fn: (reason?: string, contact?: string) => void) => {
  _onAccountBlocked = fn;
};

const buildHeaders = (extra?: Record<string, string>): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Device-Name': getDeviceName(),
    'X-Platform': _PLATFORM,
    ...extra,
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
};

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_NETWORK_RETRIES = 3;

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
  _retry = false,
  _networkAttempt = 0,
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers: extraHeaders, signal } = options;

  // Timeout 30s — annule la requête si le serveur ne répond pas
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const combinedSignal = signal
    ? (AbortSignal as any).any?.([signal, timeoutController.signal]) ?? timeoutController.signal
    : timeoutController.signal;

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: buildHeaders(extraHeaders),
      body: body ? JSON.stringify(body) : undefined,
      signal: combinedSignal,
    });
    clearTimeout(timeoutId);

    let json: any = null;
    if (response.status !== 204) {
      const text = await response.text();
      try {
        json = JSON.parse(text);
      } catch {
        // Réponse non-JSON (HTML nginx, texte erreur serveur)
        if (!response.ok) {
          throw new ApiError(response.status, `Erreur serveur (${response.status})`, text);
        }
      }
    }

    if (response.status === 401 && !_retry && _refreshTokenFn) {
      try {
        if (!_refreshPromise) {
          _refreshPromise = _refreshTokenFn().finally(() => { _refreshPromise = null; });
        }
        const newToken = await _refreshPromise;
        setAuthToken(newToken);
        return request<T>(endpoint, options, true);
      } catch (refreshErr) {
        // Ne pas déconnecter si c'est une erreur réseau — le token est peut-être encore valide
        const isNetworkErr = refreshErr instanceof ApiError && (refreshErr as ApiError).status === 0;
        if (!isNetworkErr) _onUnauthorized?.();
        throw new ApiError(401, 'Session expirée', json);
      }
    }

    if (!response.ok) {
      if (response.status === 401) _onUnauthorized?.();
      if (response.status === 403 && json?.detail?.code === 'account_blocked') {
        _onAccountBlocked?.(json.detail?.reason, json.detail?.contact);
        throw new ApiError(403, json.detail?.message ?? 'Compte bloqué', json);
      }
      throw new ApiError(
        response.status,
        json?.detail ?? json?.message ?? `Erreur ${response.status}`,
        json,
      );
    }

    return { data: json?.data ?? json, status: response.status, message: json?.message };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof ApiError) throw error;
    // Retry automatique sur erreur réseau (pas sur erreurs HTTP)
    const isNetworkError = (error as Error).name === 'AbortError' || (error as ApiError).status === 0;
    if (isNetworkError && !_retry && _networkAttempt < MAX_NETWORK_RETRIES) {
      const delay = Math.pow(2, _networkAttempt) * 500; // 500ms, 1s, 2s
      await new Promise<void>(res => setTimeout(() => res(), delay));
      return request<T>(endpoint, options, false, _networkAttempt + 1);
    }
    const msg = (error as Error).name === 'AbortError' ? 'Délai dépassé (30s)' : ((error as Error).message ?? 'Network error');
    throw new ApiError(0, msg);
  }
}

export const apiClient = {
  get: <T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  upload: async <T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> => {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        // Content-Type sera multipart/form-data automatiquement
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      // Extraire les fichiers du FormData pour ReactNativeBlobUtil
      const parts: Array<{ name: string; filename: string; type: string; data: string }> = [];
      const textParts: Array<{ name: string; data: string }> = [];

      // @ts-ignore — React Native FormData a getParts()
      const formParts = (formData as any).getParts?.() ?? (formData as any)._parts?.map(([name, value]: [string, any]) => ({ fieldName: name, ...value })) ?? [];

      for (const part of formParts) {
        const fieldName = part.fieldName ?? part.name;
        if (part.uri) {
          // Fichier
          const filePath = part.uri.startsWith('file://') ? part.uri.slice(7) : part.uri;
          parts.push({
            name: fieldName,
            filename: part.fileName ?? part.name ?? `file_${Date.now()}`,
            type: part.type ?? 'application/octet-stream',
            data: ReactNativeBlobUtil.wrap(filePath),
          });
        } else if (typeof part === 'string' || typeof part.string === 'string') {
          textParts.push({ name: fieldName, data: part.string ?? part });
        }
      }

      const allParts = [...textParts, ...parts];

      const response = await ReactNativeBlobUtil.fetch(
        'POST',
        `${API_BASE_URL}${endpoint}`,
        { ...headers, 'Content-Type': 'multipart/form-data' },
        allParts,
      );

      const status = response.respInfo.status;
      const json = response.json();

      if (status < 200 || status >= 300) {
        throw new ApiError(status, json.message ?? json.detail ?? 'Upload failed', json);
      }

      return { data: json.data ?? json, status, message: json.message };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, (error as Error).message ?? 'Network error');
    }
  },
};

export { ApiError };
