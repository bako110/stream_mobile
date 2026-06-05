/**
 * phoneAuthService — OTP SMS via backend GoFolyX (Firebase REST côté serveur).
 * Aucun SDK natif Firebase requis, pas de rebuild Android/iOS nécessaire.
 *
 * Flux :
 *   1. sendOtp(phoneE164)      → POST /auth/phone/send-otp   → sessionInfo
 *   2. verifyOtp(sessionInfo, code, opts?) → POST /auth/phone/verify-otp → JWT
 */
import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import { authService } from './authService';

export interface PhoneVerifyResult {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  user_id:       string;
  is_new_user:   boolean;
}

class PhoneAuthService {
  private _sessionInfo: string | null = null;

  /** Etape 1 : demande d'envoi du SMS via le backend (Firebase REST). */
  async sendOtp(phoneE164: string): Promise<void> {
    const res = await apiClient.post<{ session_info: string }>(
      Endpoints.auth.phoneSendOtp,
      { phone: phoneE164 },
    );
    this._sessionInfo = res.data.session_info;
  }

  /** Etape 2 : vérifie le code + connecte/crée le compte. */
  async verifyOtp(code: string, opts?: {
    firstName?: string;
    lastName?: string;
    referralCode?: string;
  }): Promise<PhoneVerifyResult> {
    if (!this._sessionInfo) throw new Error('Aucune session OTP en cours. Demandez d\'abord un code.');

    const res = await apiClient.post<PhoneVerifyResult>(
      Endpoints.auth.phoneVerifyOtp,
      {
        session_info:  this._sessionInfo,
        code:          code.trim(),
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
    return res.data;
  }

  reset() {
    this._sessionInfo = null;
  }
}

export const phoneAuthService = new PhoneAuthService();
