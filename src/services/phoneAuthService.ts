import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
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
  private _confirmation: FirebaseAuthTypes.ConfirmationResult | null = null;

  /** Etape 1 : demande d'envoi du SMS OTP via Firebase. */
  async sendOtp(phoneE164: string): Promise<void> {
    this._confirmation = await auth().signInWithPhoneNumber(phoneE164, true);
  }

  /** Etape 2 : confirmation du code saisi par l'utilisateur. */
  async confirmOtp(code: string): Promise<FirebaseAuthTypes.UserCredential> {
    if (!this._confirmation) throw new Error('Aucune verification en cours.');
    return this._confirmation.confirm(code);
  }

  /**
   * Etape 3 : envoie l'idToken Firebase au backend GoFolyX
   * pour connexion / inscription / liaison.
   */
  async verifyWithBackend(opts?: {
    firstName?: string;
    lastName?: string;
    referralCode?: string;
  }): Promise<PhoneVerifyResult> {
    const currentUser = auth().currentUser;
    if (!currentUser) throw new Error('Utilisateur Firebase non connecte.');

    const idToken = await currentUser.getIdToken(true);

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

    return res.data;
  }

  /**
   * Lie le numero verifie au compte deja connecte (verification de compte).
   */
  async linkPhoneToAccount(): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) throw new Error('Utilisateur Firebase non connecte.');
    const idToken = await currentUser.getIdToken(true);
    await apiClient.post(Endpoints.auth.phoneLink, { id_token: idToken });
  }

  /** Deconnecte la session Firebase locale (sans toucher aux JWT GoFolyX). */
  async signOutFirebase(): Promise<void> {
    try { await auth().signOut(); } catch { /* ignore */ }
  }

  reset() {
    this._confirmation = null;
  }
}

export const phoneAuthService = new PhoneAuthService();
