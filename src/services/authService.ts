import { Platform } from 'react-native';
import { apiClient, Endpoints } from '../api';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';
import { setAuthToken, setRefreshTokenFn, setOnUnauthorized, setOnAccountBlocked, triggerUnauthorized } from '../api/client';
import type {
  User, LoginRequest, RegisterRequest,
  AuthToken, PasswordChangeRequest,
} from '../types';
import { removeFCMToken, resetFCMSessionFlag } from './fcmService';

function getDeviceHeaders() {
  const os = Platform.OS; // 'ios' | 'android' | 'web'
  const version = typeof Platform.Version === 'string'
    ? Platform.Version
    : String(Platform.Version);
  const name = os === 'ios'
    ? `iPhone (iOS ${version})`
    : os === 'android'
      ? `Android ${version}`
      : 'Web';
  return {
    'X-Device-Name': name,
    'X-Platform': os,
  };
}

// ── Cache utilisateur (évite les appels répétés à /auth/me) ────────────────
let _cachedUser: User | null = null;
let _cachedAt: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export const invalidateUserCache = () => { _cachedUser = null; _cachedAt = 0; };

export const authService = {
  async login(payload: LoginRequest): Promise<{ user: User } & AuthToken> {
    const res = await apiClient.post<{ access_token: string; refresh_token: string; token_type: string; user: User }>(
      Endpoints.auth.login, payload, { headers: getDeviceHeaders() },
    );
    const { access_token, refresh_token, token_type, user } = res.data;
    authService._saveTokens({ access_token, refresh_token, token_type });
    resetFCMSessionFlag();
    _cachedUser = user;
    _cachedAt = Date.now();
    return { access_token, refresh_token, token_type, user };
  },

  async register(payload: RegisterRequest): Promise<
    ({ needsVerification: false; user: User } & AuthToken) | { needsVerification: true; userId: string }
  > {
    await apiClient.post<User>(Endpoints.auth.register, payload);
    // Auto-login après inscription — identifier = email ou phone
    try {
      const loginRes = await apiClient.post<{ access_token: string; refresh_token: string; token_type: string; user: User }>(
        Endpoints.auth.login,
        { identifier: payload.email ?? payload.phone, password: payload.password },
        { headers: getDeviceHeaders() },
      );
      const { access_token, refresh_token, token_type } = loginRes.data;
      authService._saveTokens({ access_token, refresh_token, token_type });
      // Force un /auth/me pour avoir toutes les données (gofolyx_id, referral_code, etc.)
      const freshUser = await authService.getMe(true);
      return { needsVerification: false, access_token, refresh_token, token_type, user: freshUser };
    } catch (e: any) {
      // Compte créé mais pas encore vérifié (OTP envoyé par email/SMS à
      // l'inscription) — ce n'est pas une erreur, juste une étape de plus.
      const detail = e?.data?.detail ?? e?.response?.data?.detail;
      if (e?.status === 403 && detail && typeof detail === 'object' && detail.code === 'account_unverified') {
        return { needsVerification: true, userId: detail.user_id };
      }
      throw e;
    }
  },

  async verifyRegistration(userId: string, code: string): Promise<User> {
    const res = await apiClient.post<User>(Endpoints.auth.verifyRegistration, { user_id: userId, code });
    return res.data;
  },

  async resendVerificationCode(userId: string): Promise<void> {
    await apiClient.post(Endpoints.auth.resendVerificationCode, { user_id: userId });
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
    try {
      const res = await apiClient.get<User>(Endpoints.auth.me);
      console.log('[getMe] gofolyx_id=', res.data?.gofolyx_id, 'raw keys=', Object.keys(res.data || {}));
      _cachedUser = res.data;
      _cachedAt = now;
      // Persister dans MMKV pour lecture offline
      try { storage.setItem(STORAGE_KEYS.CACHED_USER, JSON.stringify(res.data)); } catch {}
      return _cachedUser!;
    } catch (err) {
      // Offline ou erreur réseau — retourner le user persisté en MMKV
      if (_cachedUser) return _cachedUser;
      try {
        const raw = storage.getItem(STORAGE_KEYS.CACHED_USER);
        if (raw) {
          const saved = JSON.parse(raw) as User;
          _cachedUser = saved;
          _cachedAt = now;
          return saved;
        }
      } catch {}
      throw err;
    }
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
    const res = await apiClient.post<AuthToken>(
      Endpoints.auth.oauthGoogle,
      { provider: 'google', access_token: accessToken },
      { headers: getDeviceHeaders() },
    );
    authService._saveTokens(res.data);
    resetFCMSessionFlag();
    invalidateUserCache();
    return res.data;
  },

  async reactivateGoogle(accessToken: string): Promise<AuthToken> {
    const res = await apiClient.post<AuthToken>(
      Endpoints.auth.oauthGoogleReactivate,
      { provider: 'google', access_token: accessToken },
      { headers: getDeviceHeaders() },
    );
    authService._saveTokens(res.data);
    resetFCMSessionFlag();
    invalidateUserCache();
    return res.data;
  },

  async oauthFacebook(accessToken: string): Promise<AuthToken> {
    const res = await apiClient.post<AuthToken>(
      Endpoints.auth.oauthFacebook,
      { provider: 'facebook', access_token: accessToken },
      { headers: getDeviceHeaders() },
    );
    authService._saveTokens(res.data);
    resetFCMSessionFlag();
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

  loadStoredToken(onUnauthorized?: () => void, onAccountBlocked?: (reason?: string, contact?: string) => void): string | null {
    const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) setAuthToken(token);
    setRefreshTokenFn(async () => {
      const refreshed = await authService.refresh();
      return refreshed.access_token;
    });
    if (onUnauthorized) setOnUnauthorized(onUnauthorized);
    if (onAccountBlocked) setOnAccountBlocked(onAccountBlocked);
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

  /** Deconnexion immediate : efface les tokens ET declenche le callback RootNavigator */
  forceLogout(): void {
    authService._clearTokens();
    triggerUnauthorized();
  },
};
