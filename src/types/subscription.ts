// Aligné sur models/subscription.py et payment.py

export type PlanType = 'free' | 'basic' | 'premium' | 'family';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'past_due' | 'trialing';

export interface PlanConfig {
  price: number;
  screens: number;
  profiles: number;
  downloads: number;
  quality: '480p' | '720p' | '1080p' | '4k';
}

export const PLAN_CONFIG: Record<PlanType, PlanConfig> = {
  free:    { price: 0,     screens: 1, profiles: 1, downloads: 0,  quality: '480p'  },
  basic:   { price: 5.99,  screens: 1, profiles: 1, downloads: 0,  quality: '720p'  },
  premium: { price: 9.99,  screens: 2, profiles: 3, downloads: 10, quality: '1080p' },
  family:  { price: 14.99, screens: 5, profiles: 6, downloads: 30, quality: '4k'    },
};

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
