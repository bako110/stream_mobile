import { API_BASE_URL } from '../utils/constants';
import ReactNativeBlobUtil from 'react-native-blob-util';

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

export const setRefreshTokenFn = (fn: () => Promise<string>) => {
  _refreshTokenFn = fn;
};

export const setOnUnauthorized = (fn: () => void) => {
  _onUnauthorized = fn;
};

export const setOnAccountBlocked = (fn: (reason?: string, contact?: string) => void) => {
  _onAccountBlocked = fn;
};

const buildHeaders = (extra?: Record<string, string>): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
};

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
  _retry = false,
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers: extraHeaders, signal } = options;

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: buildHeaders(extraHeaders),
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

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
      } catch {
        _onUnauthorized?.();
        throw new ApiError(401, 'Session expirée', json);
      }
    }

    if (!response.ok) {
      if (response.status === 401) _onUnauthorized?.();
      if (response.status === 403 && json?.detail?.code === 'account_blocked') {
        _onAccountBlocked?.(json.detail?.reason, json.detail?.contact);
        // Ne pas propager l'erreur — le callback gère l'affichage
        return { data: null as T, status: response.status };
      }
      throw new ApiError(
        response.status,
        json?.detail ?? json?.message ?? `Erreur ${response.status}`,
        json,
      );
    }

    return { data: json?.data ?? json, status: response.status, message: json?.message };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, (error as Error).message ?? 'Network error');
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
