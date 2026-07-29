/**
 * accountsService — multi-compte façon TikTok (jusqu'à MAX_ACCOUNTS comptes
 * stockés localement). Les clés MMKV existantes (ACCESS_TOKEN/REFRESH_TOKEN/
 * CACHED_USER/LAST_USER_ID, gérées par authService) restent la source de
 * vérité pour le compte ACTIF courant — ce service ajoute une couche par-dessus
 * (liste de comptes en miroir), sans rien changer au fonctionnement mono-compte
 * existant (WebSocketContext, fcmService, api/client ne sont pas concernés).
 */
import { storage } from '../utils/storage';
import { STORAGE_KEYS, MAX_ACCOUNTS } from '../utils/constants';
import { setAuthToken } from '../api/client';
import { authService, invalidateUserCache } from './authService';
import { resetFCMSessionFlag, removeFCMToken } from './fcmService';
import type { User, AuthToken } from '../types/user';

export interface StoredAccount {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_active: boolean;
  added_at: number;
}

function _readAll(): StoredAccount[] {
  try {
    const raw = storage.getItem(STORAGE_KEYS.ACCOUNTS);
    return raw ? (JSON.parse(raw) as StoredAccount[]) : [];
  } catch { return []; }
}

function _writeAll(accounts: StoredAccount[]): void {
  storage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
}

function _toStoredAccount(tokens: AuthToken, user: User, isActive: boolean): StoredAccount {
  return {
    user_id: String(user.id),
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type ?? 'bearer',
    display_name: user.display_name ?? user.username ?? '',
    username: user.username ?? '',
    avatar_url: user.avatar_url ?? null,
    is_active: isActive,
    added_at: Date.now(),
  };
}

export const accountsService = {
  /** Migration idempotente — à appeler tôt (RootNavigator, avant loadStoredToken).
   * Si la liste de comptes n'existe pas encore mais qu'une session active existe,
   * reconstruit un slot unique depuis les clés MMKV existantes. */
  migrateIfNeeded(): void {
    if (storage.contains(STORAGE_KEYS.ACCOUNTS)) return;
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshToken = storage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!accessToken || !refreshToken) { _writeAll([]); return; }

    let cachedUser: User | null = null;
    try {
      const raw = storage.getItem(STORAGE_KEYS.CACHED_USER);
      cachedUser = raw ? (JSON.parse(raw) as User) : null;
    } catch {}

    const userId = cachedUser?.id ? String(cachedUser.id) : (storage.getItem(STORAGE_KEYS.LAST_USER_ID) ?? 'unknown');
    _writeAll([{
      user_id: userId,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      display_name: cachedUser?.display_name ?? cachedUser?.username ?? '',
      username: cachedUser?.username ?? '',
      avatar_url: cachedUser?.avatar_url ?? null,
      is_active: true,
      added_at: Date.now(),
    }]);
  },

  listAccounts(): StoredAccount[] {
    return _readAll();
  },

  getActiveAccount(): StoredAccount | null {
    return _readAll().find(a => a.is_active) ?? null;
  },

  canAddAccount(): boolean {
    return _readAll().length < MAX_ACCOUNTS;
  },

  /**
   * Appelée juste APRÈS un login/oauthGoogle réussi en mode "ajout" (le nouveau
   * token est déjà actif en mémoire/MMKV via authService.login/oauthGoogle).
   * Enregistre ce compte dans la liste et le marque actif ; les autres slots
   * passent is_active=false mais gardent leurs tokens intacts — pas besoin de
   * ré-authentification pour y revenir plus tard.
   */
  async addCurrentSessionAsAccount(): Promise<StoredAccount> {
    const user = await authService.getMe(true);
    const accessToken = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshToken = storage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!accessToken || !refreshToken) throw new Error('Session active introuvable');

    const accounts = _readAll();
    const next = _toStoredAccount(
      { access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer' },
      user,
      true,
    );
    const withoutDup = accounts.filter(a => a.user_id !== next.user_id);
    const updated = [...withoutDup.map(a => ({ ...a, is_active: false })), next];
    _writeAll(updated.slice(-MAX_ACCOUNTS)); // garde-fou — ne dépasse jamais MAX_ACCOUNTS
    return next;
  },

  /**
   * Bascule vers un compte déjà stocké. Ne fait AUCUN appel réseau de connexion —
   * réutilise le refresh_token stocké. Rafraîchit le profil (getMe) une fois la
   * bascule faite ; une erreur ici (ex: refresh token expiré) remonte à l'appelant.
   */
  async switchAccount(userId: string): Promise<StoredAccount> {
    const accounts = _readAll();
    const target = accounts.find(a => a.user_id === userId);
    if (!target) throw new Error('Compte introuvable');

    // 1) Invalider les caches mémoire de l'ancien compte + désenregistrer son
    // device token (sinon push mal routées pendant la fenêtre de transition).
    invalidateUserCache();
    try { await removeFCMToken(); } catch {}

    // 2) Réécrire les clés actives (source de vérité lue par tout le reste de l'app)
    storage.setItem(STORAGE_KEYS.ACCESS_TOKEN, target.access_token);
    storage.setItem(STORAGE_KEYS.REFRESH_TOKEN, target.refresh_token);
    storage.removeItem(STORAGE_KEYS.CACHED_USER); // forcer un re-fetch propre, pas de flash de l'ancien user
    storage.setItem(STORAGE_KEYS.LAST_USER_ID, target.user_id);
    setAuthToken(target.access_token);

    // 3) Marquer ce slot actif, les autres inactifs
    _writeAll(accounts.map(a => ({ ...a, is_active: a.user_id === userId })));

    // 4) Re-déclencher X-New-Session au prochain setupFCM()
    resetFCMSessionFlag();

    // 5) Re-fetch profil frais — une vraie erreur 401 propage ici, l'appelant UI décide
    const user = await authService.getMe(true);

    // Rafraîchir le cache local de la liste avec les données à jour (avatar/nom)
    const refreshed = _readAll().map(a => a.user_id === userId
      ? { ...a, display_name: user.display_name ?? user.username ?? a.display_name, username: user.username ?? a.username, avatar_url: user.avatar_url ?? a.avatar_url }
      : a);
    _writeAll(refreshed);

    // setupFCM() est déclenché par l'appelant (RootNavigator) après le remount de session
    return target;
  },

  /**
   * Retire un compte de la liste — pas une déconnexion globale. Si c'est le
   * compte actif, bascule automatiquement vers le premier compte restant, ou
   * déconnexion complète (logout serveur) si plus aucun compte ne reste.
   */
  async removeAccount(userId: string): Promise<StoredAccount | null> {
    const accounts = _readAll();
    const removed = accounts.find(a => a.user_id === userId);
    const remaining = accounts.filter(a => a.user_id !== userId);

    if (removed?.is_active) {
      if (remaining.length === 0) {
        // Dernier compte retiré = déconnexion complète — réutilise authService.logout()
        // tel quel (révoque le refresh token côté serveur), pas seulement un nettoyage local.
        _writeAll([]);
        await authService.logout().catch(() => {});
        return null;
      }
      _writeAll(remaining);
      return accountsService.switchAccount(remaining[0].user_id);
    }

    _writeAll(remaining);
    return accountsService.getActiveAccount();
  },
};
