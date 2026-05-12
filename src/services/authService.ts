import { apiClient, Endpoints } from '../api';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';
import { setAuthToken, setRefreshTokenFn, setOnUnauthorized } from '../api/client';
import type {
  User, LoginRequest, RegisterRequest,
  AuthToken, PasswordChangeRequest,
} from '../types';
import { removeFCMToken } from './fcmService';

// ── Cache utilisateur (évite les appels répétés à /auth/me) ────────────────
let _cachedUser: User | null = null;
let _cachedAt: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export const invalidateUserCache = () => { _cachedUser = null; _cachedAt = 0; };

export const authService = {
  async login(payload: LoginRequest): Promise<{ user: User } & AuthToken> {
    const res = await apiClient.post<{ access_token: string; refresh_token: string; token_type: string; user: User }>(Endpoints.auth.login, payload);
    const { access_token, refresh_token, token_type, user } = res.data;
    authService._saveTokens({ access_token, refresh_token, token_type });
    _cachedUser = user;
    _cachedAt = Date.now();
    return { access_token, refresh_token, token_type, user };
  },

  async register(payload: RegisterRequest): Promise<{ user: User } & AuthToken> {
    const regRes = await apiClient.post<User>(Endpoints.auth.register, payload);
    const user = regRes.data;
    // Auto-login après inscription — identifier = email ou phone
    const loginRes = await apiClient.post<{ access_token: string; refresh_token: string; token_type: string; user: User }>(Endpoints.auth.login, {
      identifier: payload.email ?? payload.phone,
      password: payload.password,
    });
    const { access_token, refresh_token, token_type } = loginRes.data;
    authService._saveTokens({ access_token, refresh_token, token_type });
    _cachedUser = loginRes.data.user ?? user;
    _cachedAt = Date.now();
    return { access_token, refresh_token, token_type, user: _cachedUser! };
  },

  async logout(): Promise<void> {
    try {
      await removeFCMToken();
    } catch {}
    try {
      await apiClient.post(Endpoints.auth.logout);
    } catch (err) {
      console.warn('Logout API error (ignoring):', err);
    } finally {
      authService._clearTokens();
    }
  },

  async getMe(forceRefresh = false): Promise<User> {
    const now = Date.now();
    if (!forceRefresh && _cachedUser && (now - _cachedAt) < CACHE_TTL) {
      return _cachedUser;
    }
    const res = await apiClient.get<User>(Endpoints.auth.me);
    _cachedUser = res.data;
    _cachedAt = now;
    return _cachedUser!;
  },

  async refresh(): Promise<AuthToken> {
    const refreshToken = storage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) throw new Error('No refresh token');
    const res = await apiClient.post<AuthToken>(Endpoints.auth.refresh, {
      refresh_token: refreshToken,
    });
    authService._saveTokens(res.data);
    return res.data;
  },

  async changePassword(payload: PasswordChangeRequest): Promise<void> {
    await apiClient.put(Endpoints.auth.changePassword, payload);
  },

  async deactivateSelf(reason: string): Promise<void> {
    await apiClient.post(Endpoints.auth.deactivateSelf, { reason });
  },

  async reactivate(identifier: string, password: string): Promise<{ user: User } & AuthToken> {
    const res = await apiClient.post<{ access_token: string; refresh_token: string; token_type: string; user: User }>(
      Endpoints.auth.reactivate,
      { identifier, password },
    );
    const { access_token, refresh_token, token_type, user } = res.data;
    authService._saveTokens({ access_token, refresh_token, token_type });
    _cachedUser = user;
    _cachedAt = Date.now();
    return { access_token, refresh_token, token_type, user };
  },

  async verifyPassword(currentPassword: string): Promise<void> {
    // Vérifie le mot de passe actuel — le backend retourne 401 si incorrect
    await apiClient.put(Endpoints.auth.changePassword, {
      current_password: currentPassword,
      new_password: currentPassword,
    });
  },

  async oauthGoogle(accessToken: string): Promise<AuthToken> {
    const res = await apiClient.post<AuthToken>(Endpoints.auth.oauthGoogle, { provider: 'google', access_token: accessToken });
    authService._saveTokens(res.data);
    invalidateUserCache();
    return res.data;
  },

  async oauthFacebook(accessToken: string): Promise<AuthToken> {
    const res = await apiClient.post<AuthToken>(Endpoints.auth.oauthFacebook, { provider: 'facebook', access_token: accessToken });
    authService._saveTokens(res.data);
    invalidateUserCache();
    return res.data;
  },

  async forgotPassword(payload: { email?: string; phone?: string; username?: string }): Promise<void> {
    await apiClient.post(Endpoints.auth.forgotPassword, payload);
  },

  async resetPassword(token: string, new_password: string): Promise<void> {
    await apiClient.post(Endpoints.auth.resetPassword, { token, new_password });
  },

  async qrGenerate(): Promise<{ token: string; expires_at: string; ttl_seconds: number }> {
    const res = await apiClient.post<{ token: string; expires_at: string; ttl_seconds: number }>(
      Endpoints.auth.qrGenerate,
    );
    return res.data;
  },

  async qrVerify(token: string): Promise<{ user: User } & AuthToken> {
    const res = await apiClient.post<{ access_token: string; refresh_token: string; token_type: string; user: User }>(
      Endpoints.auth.qrVerify,
      { token },
    );
    const { access_token, refresh_token, token_type, user } = res.data;
    authService._saveTokens({ access_token, refresh_token, token_type });
    _cachedUser = user;
    _cachedAt = Date.now();
    return { access_token, refresh_token, token_type, user };
  },

  async qrStatus(token: string): Promise<{ status: 'pending' | 'scanned' | 'expired'; ttl_seconds?: number }> {
    const res = await apiClient.get<{ status: 'pending' | 'scanned' | 'expired'; ttl_seconds?: number }>(
      Endpoints.auth.qrStatus(token),
    );
    return res.data;
  },

  loadStoredToken(onUnauthorized?: () => void): string | null {
    const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) setAuthToken(token);
    setRefreshTokenFn(async () => {
      const refreshed = await authService.refresh();
      return refreshed.access_token;
    });
    if (onUnauthorized) setOnUnauthorized(onUnauthorized);
    return token;
  },

  _saveTokens(tokens: AuthToken): void {
    storage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
    storage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
    setAuthToken(tokens.access_token);
  },

  _clearTokens(): void {
    storage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    storage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    setAuthToken(null);
    invalidateUserCache();
  },
};
