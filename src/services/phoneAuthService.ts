/**
 * phoneAuthService — OTP SMS via Firebase Auth SDK natif.
 *
 * Flux :
 *   1. sendOtp(phoneE164)         → Firebase envoie le SMS, retourne un ConfirmationResult
 *   2. verifyOtp(code, opts?)     → Firebase vérifie le code → idToken → backend GoFolyX → JWT
 */
import auth from '@react-native-firebase/auth';
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
  private _confirmation: ReturnType<typeof auth.prototype.signInWithPhoneNumber> | null = null;

  /** Etape 1 : Firebase envoie le SMS via le SDK natif (pas de reCAPTCHA visible). */
  async sendOtp(phoneE164: string): Promise<void> {
    this._confirmation = await auth().signInWithPhoneNumber(phoneE164);
  }

  /** Etape 2 : vérifie le code OTP + connecte/crée le compte GoFolyX. */
  async verifyOtp(code: string, opts?: {
    firstName?: string;
    lastName?: string;
    referralCode?: string;
  }): Promise<PhoneVerifyResult> {
    if (!this._confirmation) {
      throw new Error('Aucune session OTP en cours. Demandez d\'abord un code.');
    }

    const credential = await this._confirmation.confirm(code);
    if (!credential?.user) {
      throw new Error('Vérification Firebase échouée.');
    }

    const idToken = await credential.user.getIdToken();

    const res = await apiClient.post<PhoneVerifyResult>(
      Endpoints.auth.phoneVerify,
      {
        id_token:      idToken,
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

    this._confirmation = null;
    return res.data;
  }

  reset() {
    this._confirmation = null;
  }
}

export const phoneAuthService = new PhoneAuthService();
