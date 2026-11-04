/**
 * phoneAuthService — OTP SMS via Twilio (backend), sans SDK Firebase natif.
 *
 * Flux :
 *   1. sendOtp(phoneE164)         → backend envoie le SMS via Twilio, retourne un session_info
 *   2. verifyOtp(code, opts?)     → backend vérifie le code → JWT
 */
import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import { authService } from './authService';

export interface PhoneVerifyResult {
  access_token:      string;
  refresh_token:     string;
  token_type:        string;
  user_id:           string;
  is_new_user:       boolean;
  profile_incomplete?: boolean;
}

class PhoneAuthService {
  private _sessionInfo: string | null = null;

  /** Etape 1 : le backend envoie le SMS via Twilio. */
  async sendOtp(phoneE164: string): Promise<void> {
    const res = await apiClient.post<{ session_info: string }>(
      Endpoints.auth.phoneSendOtp,
      { phone: phoneE164 },
    );
    this._sessionInfo = res.data.session_info;
  }

  /** Etape 2 : vérifie le code OTP + connecte/crée le compte Gofolyx. */
  async verifyOtp(code: string, opts?: {
    firstName?: string;
    lastName?: string;
    referralCode?: string;
  }): Promise<PhoneVerifyResult> {
    if (!this._sessionInfo) {
      throw new Error('Aucune session OTP en cours. Demandez d\'abord un code.');
    }

    const res = await apiClient.post<PhoneVerifyResult>(
      Endpoints.auth.phoneVerifyOtp,
      {
        session_info:  this._sessionInfo,
        code,
        first_name:    opts?.firstName,
        last_name:     opts?.lastName,
        referral_code: opts?.referralCode,
      },
    );

    authService._saveTokens({
      access_token:  res.data.access_token,
      refresh_token: res.data.refresh_token,
      token_type:    res.data.token_type,
    });

    this._sessionInfo = null;

    // Le backend ne renvoie pas toujours profile_incomplete sur cette réponse —
    // un /auth/me frais est la seule source fiable pour savoir si sexe/date de
    // naissance manquent, avant de laisser l'utilisateur entrer dans l'app.
    const me = await authService.getMe(true);
    return { ...res.data, profile_incomplete: me.profile_incomplete };
  }

  reset() {
    this._sessionInfo = null;
  }
}

export const phoneAuthService = new PhoneAuthService();
