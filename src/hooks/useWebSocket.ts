/**
 * Hook WebSocket pour la messagerie temps-réel.
 * Gère la connexion, la reconnexion automatique et l'envoi de messages.
 *
 * Usage :
 *   const { sendWsMessage, isConnected } = useWebSocket((payload) => {
 *     if (payload.type === 'message') { ... }
 *   });
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { storage } from '../utils/storage';
import { authService } from '../services/authService';

export type WsPayload =
  | { type: 'message'; id: string; sender_id: string; receiver_id: string; content: string; message_type?: string; attachment_url?: string; attachment_meta?: any; created_at: string; read: boolean }
  | { type: 'read';    partner_id: string }
  | { type: 'pong' }
  | { type: 'call_offer';  from: string; to?: string; call_type: 'voice' | 'video'; sdp: any }
  | { type: 'call_answer'; from: string; to?: string; sdp: any }
  | { type: 'call_ice';    from: string; to?: string; candidate: any }
  | { type: 'call_hangup'; from: string; to?: string };

const WS_BASE = API_BASE_URL.replace(/^http/, 'ws');
const MAX_RETRIES = 6;
const INITIAL_DELAY = 1_000; // ms

export function useWebSocket(onMessage: (payload: WsPayload) => void) {
  const wsRef        = useRef<WebSocket | null>(null);
  const retryCount   = useRef(0);
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const isMounted    = useRef(true);

  const [isConnected, setIsConnected] = useState(false);

  // Toujours avoir la dernière version du callback
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connect = useCallback(() => {
    const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    const url = `${WS_BASE}/api/v1/messages/ws?token=${encodeURIComponent(token)}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      retryCount.current = 0;
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload: WsPayload = JSON.parse(event.data as string);
        if (isMounted.current) onMessageRef.current(payload);
      } catch {
        // ignorer les messages malformés
      }
    };

    ws.onerror = () => {
      // onclose sera appelé juste après, c'est là qu'on gère la reconnexion
    };

    ws.onclose = (event) => {
      if (!isMounted.current) return;
      setIsConnected(false);
      wsRef.current = null;

      if (event.code === 4001) {
        // Token invalide/expiré → tenter un refresh avant de reconnecter
        authService.refresh()
          .then(() => { if (isMounted.current) connect(); })
          .catch(() => { /* refresh échoué, ne pas reconnecter */ });
        return;
      }

      if (retryCount.current < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, retryCount.current);
        retryCount.current++;
        retryTimer.current = setTimeout(connect, delay);
      }
    };
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connect();
    return () => {
      isMounted.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  /** Envoie un payload JSON brut via le WebSocket. */
  const sendWsMessage = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { sendWsMessage, isConnected };
}
