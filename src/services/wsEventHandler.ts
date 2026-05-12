/**
 * Handler centralisé pour tous les événements WebSocket temps-réel.
 *
 * Chaque type d'event reçu du backend est traité ici et dispatché
 * vers les callbacks appropriés (feed, wallet, stories, notifs, etc.)
 *
 * Usage: monter une seule fois dans WebSocketContext via addListener(wsEventHandler.handle)
 */
import { WsPayload } from '../context/WebSocketContext';

// ── Types des callbacks ───────────────────────────────────────────────────────

export interface ConcertLivePayload {
  concert_id: string;
  title: string;
  artist_id: string;
}

export interface LiveStartedPayload {
  live: {
    id: string;
    user_id: string;
    title: string;
    description?: string | null;
    thumbnail_url?: string | null;
    status: string;
    current_viewers: number;
    peak_viewers: number;
    is_featured: boolean;
    started_at: string;
    ended_at?: string | null;
    user?: {
      id: string;
      username?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
    } | null;
  };
}

export interface LiveViewersUpdatedPayload {
  live_id: string;
  current_viewers: number;
}

export interface WsEventCallbacks {
  // Feed
  onFeedUpdated?: (kind: 'post' | 'reel' | 'event' | 'concert') => void;

  // Live concert
  onConcertLive?: (d: ConcertLivePayload) => void;
  onConcertEnded?: (concert_id: string) => void;

  // Lives spontanés
  onLiveStarted?: (d: LiveStartedPayload) => void;
  onLiveEnded?: (live_id: string) => void;
  onLiveViewersUpdated?: (d: LiveViewersUpdatedPayload) => void;

  // Stories
  onStoryAdded?: (data: StoryAddedPayload) => void;

  // Social — sur le contenu de l'utilisateur courant
  onCommentOnContent?: (data: CommentOnContentPayload) => void;
  onReactionOnContent?: (data: ReactionOnContentPayload) => void;

  // Réseau social
  onNewFollower?: (data: NewFollowerPayload) => void;

  // Wallet
  onCoinTransferReceived?: (data: CoinTransferPayload) => void;
  onGiftReceived?: (data: GiftReceivedPayload) => void;

  // Présence
  onPresence?: (data: PresencePayload) => void;

  // Stories
  onStoryView?: (data: StoryViewPayload) => void;

  // Activité / notifications
  onActivity?: () => void;
  onNotification?: () => void;
}

// ── Payloads ──────────────────────────────────────────────────────────────────

export interface StoryAddedPayload {
  user_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export interface CommentOnContentPayload {
  target_type: string;
  target_id: string;
  comment: any;
  from_user_id: string;
  from_username: string;
  from_display_name?: string;
  from_avatar?: string;
}

export interface ReactionOnContentPayload {
  action: 'added' | 'removed' | 'changed';
  target_type: string;
  target_id: string;
  reaction_type: 'like' | 'dislike';
  from_user_id: string;
  from_username: string;
  from_display_name?: string;
  from_avatar?: string;
}

export interface NewFollowerPayload {
  from_user_id: string;
  from_username: string;
  from_display_name?: string;
  from_avatar?: string;
}

export interface CoinTransferPayload {
  coins_amount: number;
  note?: string;
  from_user_id: string;
  from_username: string;
  from_display_name?: string;
  from_avatar?: string;
}

export interface GiftReceivedPayload {
  coins_amount: number;
  gift_name: string;
  gift_emoji: string;
  reel_id?: string;
  from_user_id: string;
  from_username: string;
  from_display_name?: string;
  from_avatar?: string;
}

export interface PresencePayload {
  user_id: string;
  is_online: boolean;
  last_seen_at?: string;
}

export interface StoryViewPayload {
  story_id: string;
  viewer_id: string;
  viewer_username?: string | null;
  viewer_display_name?: string | null;
  viewer_avatar?: string | null;
  view_count: number;
}

// ── Handler principal ─────────────────────────────────────────────────────────

export function createWsEventHandler(callbacks: WsEventCallbacks) {
  return function handle(payload: WsPayload) {
    switch (payload.type) {

      case 'feed_updated':
        callbacks.onFeedUpdated?.(payload.kind ?? 'post');
        break;

      case 'story_added':
        callbacks.onStoryAdded?.(payload as unknown as StoryAddedPayload);
        break;

      case 'story_view':
        callbacks.onStoryView?.(payload as unknown as StoryViewPayload);
        break;

      case 'comment_on_content':
        callbacks.onCommentOnContent?.(payload as unknown as CommentOnContentPayload);
        break;

      case 'reaction_on_content':
        callbacks.onReactionOnContent?.(payload as unknown as ReactionOnContentPayload);
        break;

      case 'new_follower':
        callbacks.onNewFollower?.(payload as unknown as NewFollowerPayload);
        break;

      case 'coin_transfer_received':
        callbacks.onCoinTransferReceived?.(payload as unknown as CoinTransferPayload);
        callbacks.onNotification?.();
        break;

      case 'gift_received':
        callbacks.onGiftReceived?.(payload as unknown as GiftReceivedPayload);
        callbacks.onNotification?.();
        break;

      case 'concert_live':
        callbacks.onConcertLive?.(payload as unknown as ConcertLivePayload);
        // Aussi déclencher un reload du feed (concert apparu dans le fil)
        callbacks.onFeedUpdated?.('concert');
        break;

      case 'concert_ended':
        callbacks.onConcertEnded?.((payload as any).concert_id);
        break;

      case 'live_started':
        callbacks.onLiveStarted?.(payload as unknown as LiveStartedPayload);
        break;

      case 'live_ended':
        callbacks.onLiveEnded?.((payload as any).live_id);
        break;

      case 'live_viewers_updated':
        callbacks.onLiveViewersUpdated?.(payload as unknown as LiveViewersUpdatedPayload);
        break;

      case 'presence':
        callbacks.onPresence?.(payload as unknown as PresencePayload);
        break;

      case 'activity':
        callbacks.onActivity?.();
        break;

      case 'notification':
        callbacks.onNotification?.();
        break;

      default:
        // Tous les autres types (message, call_offer, etc.) sont gérés
        // directement dans WebSocketContext — on ne les touche pas ici.
        break;
    }
  };
}
