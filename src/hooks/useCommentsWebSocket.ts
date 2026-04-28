/**
 * Hook WebSocket temps-réel pour les commentaires d'une cible.
 * Se connecte à /api/v1/social/comments/ws/{targetType}/{targetId}?token=...
 * Gère reconnexion exponentielle + refresh JWT sur code 4001.
 */
import { useEffect, useRef, useCallback } from 'react';
import { WS_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { storage } from '../utils/storage';
import { authService } from '../services/authService';
import type { Comment } from '../types';

export type CommentWsEvent =
  | { type: 'comment_added';    comment: Comment }
  | { type: 'comment_updated';  comment_id: string; body: string; is_edited: boolean }
  | { type: 'comment_deleted';  comment_id: string }
  | { type: 'reaction_updated'; comment_id: string; like_count: number; dislike_count: number }
  | { type: 'pong' };

const MAX_RETRIES    = 6;
const INITIAL_DELAY  = 1_000;

interface Options {
  targetType: 'reel' | 'content' | 'concert' | 'event' | null;
  targetId:   string | null | undefined;
  enabled:    boolean;
  onEvent:    (event: CommentWsEvent) => void;
}

export function useCommentsWebSocket({ targetType, targetId, enabled, onEvent }: Options) {
  const wsRef      = useRef<WebSocket | null>(null);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const isMounted  = useRef(true);
  const pingTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const disconnect = useCallback(() => {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    if (pingTimer.current)  { clearInterval(pingTimer.current); pingTimer.current = null; }
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    retryCount.current = 0;
  }, []);

  const connect = useCallback(() => {
    if (!isMounted.current || !targetType || !targetId) return;

    const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    const url = `${WS_BASE_URL}/api/v1/social/comments/ws/${targetType}/${targetId}?token=${encodeURIComponent(token)}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      retryCount.current = 0;
      // Ping toutes les 30s pour maintenir la connexion
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30_000);
    };

    ws.onmessage = (event) => {
      try {
        const payload: CommentWsEvent = JSON.parse(event.data as string);
        if (isMounted.current && payload.type !== 'pong') {
          onEventRef.current(payload);
        }
      } catch { /* ignorer */ }
    };

    ws.onerror = () => { /* onclose suit */ };

    ws.onclose = (event) => {
      if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
      if (!isMounted.current) return;
      wsRef.current = null;

      if (event.code === 4001) {
        authService.refresh()
          .then(() => { if (isMounted.current) connect(); })
          .catch(() => { });
        return;
      }

      if (retryCount.current < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, retryCount.current);
        retryCount.current++;
        retryTimer.current = setTimeout(connect, delay);
      }
    };
  }, [targetType, targetId]);

  useEffect(() => {
    isMounted.current = true;
    if (enabled && targetType && targetId) {
      connect();
    }
    return () => {
      isMounted.current = false;
      disconnect();
    };
  }, [enabled, targetType, targetId, connect, disconnect]);
}
