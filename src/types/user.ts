// Aligné sur app/db/postgres/models/user.py

export type UserRole = 'user' | 'artist' | 'admin';
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type OAuthProvider = 'google' | 'facebook';
export type VerificationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  // null pour les comptes inscrits par téléphone (le backend masque l'email
  // interne phone_xxx@gofolyx.internal) — utiliser `phone` dans ce cas.
  email: string | null;
  username: string | null;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  location: string | null;
  website: string | null;
  oauth_provider: OAuthProvider | null;
  is_verified: boolean;
  is_active: boolean;
  verification_status?: VerificationStatus;
  verification_note?: string | null;
  verification_requested_at?: string | null;
  referral_code?: string | null;
  gofolyx_id?: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  identifier: string; // email OU username
  password: string;
}

export interface RegisterRequest {
  first_name:    string;
  last_name:     string;
  email?:        string;
  phone?:        string;
  password:      string;
  username?:     string;
  referral_code?: string;
  date_of_birth: string;
  gender:        Gender;
  /** Anti-bot : timestamp (epoch ms) de montage du formulaire. */
  form_started_at?: number;
  /** Anti-bot : honeypot, doit toujours rester vide/undefined pour un humain. */
  website_url?: string;
  /** Anti-bot : identifiant d'appareil stable (voir utils/deviceFingerprint.ts). */
  device_fingerprint?: string;
}

export interface OAuthLoginRequest {
  access_token: string;
}

export interface AuthToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  /** true si le compte (créé via Google/Facebook, qui ne fournissent pas ces infos)
   * doit encore renseigner sa date de naissance et son sexe. */
  profile_incomplete?: boolean;
}

export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
}

export interface UserUpdate {
  first_name?: string;
  last_name?: string;
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: Gender;
  location?: string;
  website?: string;
}

export interface WatchHistoryItem {
  content_id: string;
  episode_id: string | null;
  progress_sec: number;
  completed: boolean;
  watched_at: string;
}

export interface UserPublic {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_verified?: boolean;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  is_online?: boolean | null;
  is_live?: boolean | null;
}

export interface UserPublicProfile extends UserPublic {
  followers_count:        number;
  following_count:        number;
  is_followed:            boolean;
  is_verified:            boolean;
  banner_url?:            string | null;
  first_name?:            string | null;
  last_name?:             string | null;
  phone?:                 string | null;
  date_of_birth?:         string | null;
  gender?:                Gender | null;
  created_at?:            string | null;
  privacy_allow_messages?: boolean;
  privacy_profile_public?: boolean;
  is_private?:             boolean;
}
