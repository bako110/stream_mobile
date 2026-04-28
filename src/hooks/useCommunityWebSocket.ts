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

export type CommunityWsPayload =
  | CommunityWsMessage
  | CommunityWsMessageEdited
  | CommunityWsMessageDeleted
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

      // Keepalive ping toutes les 25s
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
        if (isMounted.current) onMessageRef.current(payload);
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
        // Token invalide → tenter refresh
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

  return { sendWsMessage, isConnected };
}
