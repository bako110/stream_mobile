/**
 * Hook WebSocket pour le chat communautaire temps-réel.
 * Se connecte à /api/v1/communities/{communityId}/ws?token=<JWT>
 * Gère la reconnexion automatique et le ping/pong keepalive.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { storage } from '../utils/storage';
import { authService } from '../services/authService';

export interface CommunityWsMessage {
  type: 'community_message';
  id: string;
  community_id: string;
  sender_id: string;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  content: string;
  created_at: string;
  edited_at: string | null;
}

export interface CommunityWsMessageSent {
  type: 'community_message_sent';
  id: string;
  community_id: string;
  sender_id: string;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  content: string;
  created_at: string;
  edited_at: string | null;
}

export interface CommunityWsMessageEdited {
  type: 'community_message_edited';
  id: string;
  community_id: string;
  sender_id: string;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  content: string;
  created_at: string;
  edited_at: string | null;
}

export interface CommunityWsMessageDeleted {
  type: 'community_message_deleted';
  id: string;
  community_id: string;
}

export interface CommunityWsTyping {
  type: 'typing';
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  is_typing: boolean;
}

export interface CommunityWsRecording {
  type: 'recording';
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  is_recording: boolean;
}

export interface CommunityWsOnlineCount {
  type: 'online_count';
  count: number;
}

export interface CommunityWsMemberJoined {
  type: 'community_member_joined';
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  online_count: number;
}

export interface CommunityWsMemberLeft {
  type: 'community_member_left';
  user_id: string;
  username: string | null;
}

export interface CommunityWsMemberKicked {
  type: 'community_member_kicked';
  user_id: string;
  kicked_by: string;
}

export interface CommunityWsMemberRoleChanged {
  type: 'community_member_role_changed';
  user_id: string;
  role: string;
}

export interface CommunityWsCommunityUpdated {
  type: 'community_updated';
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_private: boolean;
}

export interface CommunityWsCommunityDeleted {
  type: 'community_deleted';
  community_id: string;
}

export interface CommunityWsCommunityVerified {
  type: 'community_verified';
  community_id: string;
  is_verified: boolean;
}

export interface CommunityWsAnnouncement {
  type: 'community_announcement';
  id: string; community_id: string; sender_id: string;
  sender_username: string | null; sender_display_name: string | null;
  sender_avatar_url: string | null; message_type: string;
  content: string | null; media_urls: string[];
  reply_to: null; reply_to_id: null;
  is_pinned: boolean; reactions: []; poll: null;
  created_at: string; edited_at: string | null;
}

export interface CommunityWsPollCreated {
  type: 'community_poll_created';
  id: string; community_id: string; sender_id: string;
  sender_username: string | null; sender_display_name: string | null;
  sender_avatar_url: string | null; message_type: string;
  content: string | null; media_urls: string[];
  reply_to: null; reply_to_id: null;
  is_pinned: boolean; reactions: []; poll: unknown;
  created_at: string; edited_at: string | null;
}

export interface CommunityWsMessagePinned {
  type: 'community_message_pinned' | 'community_message_unpinned';
  id: string; community_id: string; sender_id: string;
  sender_username: string | null; sender_display_name: string | null;
  sender_avatar_url: string | null; message_type: string;
  content: string | null; media_urls: string[];
  reply_to: null; reply_to_id: string | null;
  is_pinned: boolean; reactions: unknown[]; poll: unknown;
  created_at: string; edited_at: string | null;
}

export interface CommunityWsReaction {
  type: 'community_message_reaction';
  message_id: string;
  user_id: string;
  emoji: string;
  action: 'added' | 'removed';
  reactions: { emoji: string; count: number; user_ids: string[] }[];
}

export interface CommunityWsPollUpdated {
  type: 'community_poll_updated';
  poll_id: string;
  results: unknown;
}

export type CommunityWsPayload =
  | CommunityWsMessage
  | CommunityWsMessageSent
  | CommunityWsMessageEdited
  | CommunityWsMessageDeleted
  | CommunityWsAnnouncement
  | CommunityWsPollCreated
  | CommunityWsMessagePinned
  | CommunityWsReaction
  | CommunityWsPollUpdated
  | CommunityWsTyping
  | CommunityWsRecording
  | CommunityWsOnlineCount
  | CommunityWsMemberJoined
  | CommunityWsMemberLeft
  | CommunityWsMemberKicked
  | CommunityWsMemberRoleChanged
  | CommunityWsCommunityUpdated
  | CommunityWsCommunityDeleted
  | CommunityWsCommunityVerified
  | { type: 'pong' }
  | { type: 'error'; detail: string };

const WS_BASE = API_BASE_URL.replace(/^http/, 'ws');
const MAX_RETRIES = 6;
const INITIAL_DELAY = 1_000;
const PING_INTERVAL = 25_000;

export function useCommunityWebSocket(
  communityId: string,
  onMessage: (payload: CommunityWsPayload) => void,
) {
  const wsRef        = useRef<WebSocket | null>(null);
  const retryCount   = useRef(0);
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMessageRef = useRef(onMessage);
  const isMounted    = useRef(true);

  const [isConnected, setIsConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const stopPing = useCallback(() => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    const url = `${WS_BASE}/api/v1/communities/${communityId}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      retryCount.current = 0;
      setIsConnected(true);

      stopPing();
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const payload: CommunityWsPayload = JSON.parse(event.data as string);
        if (!isMounted.current) return;
        // Handle online_count internally so screen doesn't need to
        if (payload.type === 'online_count') {
          setOnlineCount(payload.count);
          return;
        }
        if (payload.type === 'community_member_joined') {
          setOnlineCount(payload.online_count);
        }
        onMessageRef.current(payload);
      } catch {
        // ignorer les messages malformés
      }
    };

    ws.onerror = () => {};

    ws.onclose = (event) => {
      if (!isMounted.current) return;
      setIsConnected(false);
      wsRef.current = null;
      stopPing();

      if (event.code === 4001) {
        authService.refresh()
          .then(() => { if (isMounted.current) connect(); })
          .catch(() => {});
        return;
      }

      if (retryCount.current < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, retryCount.current);
        retryCount.current++;
        retryTimer.current = setTimeout(connect, delay);
      }
    };
  }, [communityId, stopPing]);

  useEffect(() => {
    isMounted.current = true;
    connect();
    return () => {
      isMounted.current = false;
      stopPing();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close();
    };
  }, [connect, stopPing]);

  const sendWsMessage = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: isTyping ? 'typing_start' : 'typing_stop' }));
    }
  }, []);

  const sendRecording = useCallback((isRecording: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: isRecording ? 'recording_start' : 'recording_stop' }));
    }
  }, []);

  return { sendWsMessage, sendTyping, sendRecording, isConnected, onlineCount };
}
