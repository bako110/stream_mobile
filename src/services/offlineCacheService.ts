/**
 * offlineCacheService — persist les données des screens principaux dans MMKV.
 * Utilise localCache (TTL) de storage.ts pour une cohérence maximale.
 */
import { localCache } from '../utils/storage';
import type { Post } from '../types/post';
import type { Reel } from '../types/reel';
import type { CommunityMessageData } from './communityService';
import type { Story } from '../types/story';

// TTL par type de données — assez long pour couvrir une coupure réseau prolongée
const TTL = {
  FEED:          4  * 60 * 60 * 1000,  // 4h
  REELS:         4  * 60 * 60 * 1000,  // 4h
  CONVERSATIONS: 8  * 60 * 60 * 1000,  // 8h
  MESSAGES:      24 * 60 * 60 * 1000,  // 24h
  COMMUNITY:     6  * 60 * 60 * 1000,  // 6h
  MY_STORIES:    24 * 60 * 60 * 1000,  // 24h (durée de vie d'une story)
  NOTIFICATIONS: 48 * 60 * 60 * 1000,  // 48h (plus long pour voir les notifs manquées)
} as const;

// Nombre max de messages gardés par conversation (évite de saturer MMKV)
const MAX_MESSAGES_PER_CONV = 60;

// ── Clés MMKV ────────────────────────────────────────────────────────────────

const KEY = {
  FEED_ITEMS:      'offline:feed_items',
  REELS_ITEMS:     'offline:reels_items',
  CONVERSATIONS:   'offline:conversations',
  CONV_MSGS:       (partnerId: string) => `offline:conv_msgs:${partnerId}`,
  COMMUNITY_MSGS:  (id: string) => `offline:community_msgs:${id}`,
  COMMUNITY_LIST:  'offline:community_list',
  MY_STORIES:      'offline:my_stories',
  NOTIFICATIONS:   'offline:notifications',
  NOTIF_BADGE:     'offline:notif_badge',
} as const;

// Nombre max de notifications gardées en cache
const MAX_NOTIFICATIONS = 100;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CachedFeedItem {
  kind: 'event' | 'concert' | 'reel' | 'reel_row' | 'post' | 'suggestions' | 'communities' | 'ad';
  id:   string;
  data: any;
}

export interface CachedConversation {
  partner_id:        string;
  partner_name:      string;
  partner_avatar?:   string | null;
  last_message?:     string | null;
  last_message_at?:  string | null;
  unread_count:      number;
  is_online?:        boolean;
}

export interface CachedMessage {
  id:               string;
  sender_id:        string;
  receiver_id:      string;
  content:          string;
  message_type:     string;
  created_at:       string;
  read:             boolean;
  deleted?:         boolean;
  edited_at?:       string | null;
  attachment_url?:  string | null;
  attachment_meta?: any;
  reaction?:        string | null;
  reply_to_id?:     string | null;
  reply_to?:        any;
  pinned?:          boolean;
}


export interface CachedCommunity {
  id:             string;
  name:           string;
  description?:   string | null;
  avatar_url?:    string | null;
  members_count:  number;
  is_private:     boolean;
}

export interface CachedNotification {
  id:                string;
  notification_type: string;
  title:             string;
  body:              string;
  ref_id:            string | null;
  ref_type:          string | null;
  is_read:           boolean;
  created_at:        string;
  actor:             { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  // Champs FCM additionnels pour navigation offline
  fcm_type?:         string;
  fcm_data?:         Record<string, string>;
  received_offline?: boolean; // reçue pendant absence de connexion
}

// ── Feed ─────────────────────────────────────────────────────────────────────
// Stratégie :
//   - save*    : stocke avec TTL (fraicheur)
//   - get*     : getPersistent → toujours retourne les données si elles ont été sauvegardées,
//                même si le TTL est expiré (mode offline). Retourne null uniquement si jamais sauvegardé.
//   - isFresh* : indique si le cache est encore frais (TTL non expiré) → évite un re-fetch inutile

export const offlineCacheService = {
  // Feed
  saveFeed(items: CachedFeedItem[]): void {
    try { localCache.set(KEY.FEED_ITEMS, items, TTL.FEED); } catch {}
  },
  getFeed(): CachedFeedItem[] | null {
    return localCache.getPersistent<CachedFeedItem[]>(KEY.FEED_ITEMS);
  },
  isFeedFresh(): boolean {
    return localCache.get<CachedFeedItem[]>(KEY.FEED_ITEMS) !== null;
  },

  // Reels
  saveReels(items: Reel[]): void {
    try { localCache.set(KEY.REELS_ITEMS, items, TTL.REELS); } catch {}
  },
  getReels(): Reel[] | null {
    return localCache.getPersistent<Reel[]>(KEY.REELS_ITEMS);
  },
  isReelsFresh(): boolean {
    return localCache.get<Reel[]>(KEY.REELS_ITEMS) !== null;
  },

  // Conversations
  saveConversations(data: CachedConversation[]): void {
    try { localCache.set(KEY.CONVERSATIONS, data, TTL.CONVERSATIONS); } catch {}
  },
  getConversations(): CachedConversation[] | null {
    return localCache.getPersistent<CachedConversation[]>(KEY.CONVERSATIONS);
  },
  isConversationsFresh(): boolean {
    return localCache.get<CachedConversation[]>(KEY.CONVERSATIONS) !== null;
  },

  // Messages d'une conversation directe
  saveMessages(partnerId: string, messages: CachedMessage[]): void {
    try {
      // Garder seulement les MAX_MESSAGES_PER_CONV plus récents (index 0 = plus récent)
      const toSave = messages.slice(0, MAX_MESSAGES_PER_CONV);
      localCache.set(KEY.CONV_MSGS(partnerId), toSave, TTL.MESSAGES);
    } catch {}
  },
  getMessages(partnerId: string): CachedMessage[] | null {
    return localCache.getPersistent<CachedMessage[]>(KEY.CONV_MSGS(partnerId));
  },

  // Mes stories
  saveMyStories(stories: Story[]): void {
    try { localCache.set(KEY.MY_STORIES, stories, TTL.MY_STORIES); } catch {}
  },
  getMyStories(): Story[] | null {
    return localCache.getPersistent<Story[]>(KEY.MY_STORIES);
  },

  // Community — liste
  saveCommunityList(data: CachedCommunity[]): void {
    try { localCache.set(KEY.COMMUNITY_LIST, data, TTL.COMMUNITY); } catch {}
  },
  getCommunityList(): CachedCommunity[] | null {
    return localCache.getPersistent<CachedCommunity[]>(KEY.COMMUNITY_LIST);
  },

  // Community — messages d'un channel
  saveCommunityMessages(communityId: string, messages: CommunityMessageData[]): void {
    try { localCache.set(KEY.COMMUNITY_MSGS(communityId), messages, TTL.COMMUNITY); } catch {}
  },
  getCommunityMessages(communityId: string): CommunityMessageData[] | null {
    return localCache.getPersistent<CommunityMessageData[]>(KEY.COMMUNITY_MSGS(communityId));
  },

  // Notifications
  saveNotifications(items: CachedNotification[]): void {
    try { localCache.set(KEY.NOTIFICATIONS, items.slice(0, MAX_NOTIFICATIONS), TTL.NOTIFICATIONS); } catch {}
  },
  getNotifications(): CachedNotification[] | null {
    return localCache.getPersistent<CachedNotification[]>(KEY.NOTIFICATIONS);
  },

  // Prepend une nouvelle notif FCM reçue offline (en tête de liste, dédoublonnée par id)
  prependNotification(notif: CachedNotification): void {
    try {
      const existing = localCache.getPersistent<CachedNotification[]>(KEY.NOTIFICATIONS) ?? [];
      const deduped  = existing.filter(n => n.id !== notif.id);
      const next     = [notif, ...deduped].slice(0, MAX_NOTIFICATIONS);
      localCache.set(KEY.NOTIFICATIONS, next, TTL.NOTIFICATIONS);
    } catch {}
  },

  // Badge persistant — survit aux redémarrages même sans connexion
  saveBadge(count: number): void {
    try { localCache.set(KEY.NOTIF_BADGE, count, TTL.NOTIFICATIONS); } catch {}
  },
  getBadge(): number {
    return localCache.getPersistent<number>(KEY.NOTIF_BADGE) ?? 0;
  },
  clearBadge(): void {
    try { localCache.set(KEY.NOTIF_BADGE, 0, TTL.NOTIFICATIONS); } catch {}
  },

  // Marquer une notif offline comme lue
  markNotificationRead(id: string): void {
    try {
      const existing = localCache.getPersistent<CachedNotification[]>(KEY.NOTIFICATIONS) ?? [];
      const next = existing.map(n => n.id === id ? { ...n, is_read: true } : n);
      localCache.set(KEY.NOTIFICATIONS, next, TTL.NOTIFICATIONS);
    } catch {}
  },

  // Marquer toutes comme lues
  markAllNotificationsRead(): void {
    try {
      const existing = localCache.getPersistent<CachedNotification[]>(KEY.NOTIFICATIONS) ?? [];
      const next = existing.map(n => ({ ...n, is_read: true }));
      localCache.set(KEY.NOTIFICATIONS, next, TTL.NOTIFICATIONS);
    } catch {}
  },

  // Supprimer une notif du cache
  removeNotification(id: string): void {
    try {
      const existing = localCache.getPersistent<CachedNotification[]>(KEY.NOTIFICATIONS) ?? [];
      const next = existing.filter(n => n.id !== id);
      localCache.set(KEY.NOTIFICATIONS, next, TTL.NOTIFICATIONS);
    } catch {}
  },

  // Nombre de notifs reçues offline non lues (reçues pendant déconnexion)
  getOfflineUnreadCount(): number {
    const items = localCache.getPersistent<CachedNotification[]>(KEY.NOTIFICATIONS) ?? [];
    return items.filter(n => n.received_offline && !n.is_read).length;
  },
};
