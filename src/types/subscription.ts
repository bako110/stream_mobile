// Aligné sur models/subscription.py et payment.py

export type PlanType = 'free' | 'basic' | 'premium' | 'family';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'past_due' | 'trialing';

export interface PlanConfig {
  price: number;
  screens: number;
  profiles: number;
  downloads: number;
  quality: 'SD' | 'HD' | '4K';
  /** Hauteur vidéo maximale autorisée (480 / 1080 / 2160). */
  maxHeight: number;
}

// Miroir de PLAN_CONFIG (stream_backend/app/db/postgres/models/subscription.py) — le serveur reste
// la source de vérité et applique réellement ces limites (écrans, qualité, quota de téléchargements).
export const PLAN_CONFIG: Record<PlanType, PlanConfig> = {
  free:    { price: 0,    screens: 1, profiles: 1, downloads: 0,  quality: 'SD', maxHeight: 480  },
  basic:   { price: 3.99, screens: 2, profiles: 2, downloads: 5,  quality: 'HD', maxHeight: 1080 },
  premium: { price: 6.99, screens: 4, profiles: 4, downloads: 25, quality: '4K', maxHeight: 2160 },
  family:  { price: 9.99, screens: 6, profiles: 6, downloads: 50, quality: '4K', maxHeight: 2160 },
};

/** Avantages affichés = uniquement ce que le serveur applique réellement. */
export function planFeatures(plan: PlanType): string[] {
  const c = PLAN_CONFIG[plan];
  const f = [plan === 'free' ? 'Contenu standard uniquement' : 'Tout le contenu premium'];
  f.push(`${c.screens} écran${c.screens > 1 ? 's' : ''} simultané${c.screens > 1 ? 's' : ''}`);
  f.push(`Qualité ${c.quality === '4K' ? '4K Ultra HD' : c.quality}`);
  f.push(c.downloads > 0 ? `${c.downloads} téléchargements / mois` : 'Sans téléchargement');
  return f;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: PlanType;
  status: SubscriptionStatus;
  price_paid: number;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  trial_end: string | null;
  downloads_used: number;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentType = 'subscription' | 'ticket' | 'ppv';

export interface Payment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_type: PaymentType;
  stripe_payment_intent_id: string | null;
  description: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  user_id: string;
  concert_id: string | null;
  event_id: string | null;
  payment_id: string;
  qr_code: string | null;
  is_used: boolean;
  used_at: string | null;
  created_at: string;
}
