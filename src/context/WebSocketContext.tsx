/**
 * Global WebSocket context — persistent connection + call history management.
 *
 * Single source of truth for call records:
 *  - call_offer   → creates a pending entry (direction = outgoing or incoming)
 *  - call_answer  → marks entry as answered, records connectedAt timestamp
 *  - call_hangup  → finalises entry (answered / missed / declined) + persists to MMKV
 *  - 30s timeout  → if pending call still not answered → marks as missed
 */
import React, {
  createContext, useContext, useEffect, useRef, useCallback, useState, useMemo,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { storage } from '../utils/storage';
import { authService } from '../services/authService';
import { messageService } from '../services/messageService';
import { notificationService } from '../services/notificationService';
import { favoriteService } from '../services/favoriteService';
import { cancelCallNotification, showIncomingCallNotification } from '../services/fcmService';
import { navigate } from '../navigation/navigationRef';
import {
  createWsEventHandler,
  type NewFollowerPayload,
  type CoinTransferPayload,
  type GiftReceivedPayload,
  type StoryAddedPayload,
  type StoryViewPayload,
  type CommentOnContentPayload,
  type ReactionOnContentPayload,
  type PresencePayload,
  type ConcertLivePayload,
  type LiveStartedPayload,
  type LiveViewersUpdatedPayload,
} from '../services/wsEventHandler';

export type WsPayload = { [key: string]: any; type: string };
type WsListener = (payload: WsPayload) => void;

// ── Pending call tracker ──────────────────────────────────────────────────────

interface PendingCall {
  partnerId:   string;
  partnerName: string;
  avatarUrl?:  string;
  callType:    'voice' | 'video';
  direction:   'incoming' | 'outgoing';
  startedAt:   string;
  connectedAt: number | null;   // Date.now() when connected
  timeoutId:   ReturnType<typeof setTimeout> | null;
}

export interface CallLogEntry {
  id:          string;
  partnerId:   string;
  partnerName: string;
  avatarUrl?:  string;
  callType:    'voice' | 'video';
  direction:   'incoming' | 'outgoing' | 'missed';
  durationSec: number;
  startedAt:   string;
}

interface WebSocketContextValue {
  sendMessage:              (payload: object) => void;
  isConnected:              boolean;
  addListener:              (fn: WsListener) => void;
  removeListener:           (fn: WsListener) => void;
  unreadMessages:           number;
  unreadActivity:           number;
  unreadNotifications:      number;
  refreshUnread:            () => void;
  clearUnreadMessages:      () => void;
  clearUnreadActivity:      () => void;
  clearUnreadNotifications: () => void;
  setActiveChat:            (partnerId: string | null) => void;
  missedCallCount:          number;
  clearMissedCalls:         () => void;
  notifyCallConnected: (partnerId: string) => void;
  notifyCallEnded:     (partnerId: string) => void;
  markCallAccepted:    (partnerId: string) => void;
  markCallEnded:       (partnerId: string) => void;
  isOutgoingCall:      (partnerId: string) => boolean;
  // Buffer: events arrivés avant que CallScreen soit monté
  drainCallBuffer:     (partnerId: string) => WsPayload[];
  // Events temps-réel enrichis
  lastNewFollower:          NewFollowerPayload | null;
  lastCoinTransfer:         CoinTransferPayload | null;
  lastGiftReceived:         GiftReceivedPayload | null;
  lastStoryAdded:           StoryAddedPayload | null;
  lastStoryView:            StoryViewPayload | null;
  lastCommentOnContent:     CommentOnContentPayload | null;
  lastReactionOnContent:    ReactionOnContentPayload | null;
  lastPresenceUpdate:       PresencePayload | null;
  lastConcertLive:          ConcertLivePayload | null;
  lastLiveStarted:          LiveStartedPayload | null;
  lastLiveEnded:            string | null;
  lastLiveViewersUpdated:   LiveViewersUpdatedPayload | null;
}

const Ctx = createContext<WebSocketContextValue>({
  sendMessage:              () => {},
  isConnected:              false,
  addListener:              () => {},
  removeListener:           () => {},
  unreadMessages:           0,
  unreadActivity:           0,
  unreadNotifications:      0,
  refreshUnread:            () => {},
  clearUnreadMessages:      () => {},
  clearUnreadActivity:      () => {},
  clearUnreadNotifications: () => {},
  setActiveChat:            () => {},
  missedCallCount:          0,
  clearMissedCalls:         () => {},
  notifyCallConnected:      () => {},
  notifyCallEnded:          () => {},
  markCallAccepted:         () => {},
  markCallEnded:            () => {},
  isOutgoingCall:           () => false,
  drainCallBuffer:          () => [],
  lastNewFollower:          null,
  lastCoinTransfer:         null,
  lastGiftReceived:         null,
  lastStoryAdded:           null,
  lastStoryView:            null,
  lastCommentOnContent:     null,
  lastReactionOnContent:    null,
  lastPresenceUpdate:       null,
  lastConcertLive:          null,
  lastLiveStarted:          null,
  lastLiveEnded:            null,
  lastLiveViewersUpdated:   null,
});

const WS_BASE        = API_BASE_URL.replace(/^http/, 'ws');
const INITIAL_DELAY  = 1_000;
const PING_INTERVAL  = 25_000;
const CALL_TIMEOUT   = 30_000;

export const WebSocketProvider: React.FC<{ children: React.ReactNode; onAccountBlocked?: (reason?: string, contact?: string) => void }> = ({ children, onAccountBlocked }) => {
  const wsRef           = useRef<WebSocket | null>(null);
  const retryCount      = useRef(0);
  const retryTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer       = useRef<ReturnType<typeof setInterval> | null>(null);
  const listeners       = useRef<Set<WsListener>>(new Set());
  const isMounted       = useRef(true);
  // Initialise immédiatement depuis MMKV — pas besoin d'attendre getMe()
  const myIdRef         = useRef<string | null>(storage.getItem(STORAGE_KEYS.LAST_USER_ID));
  const activeChatRef   = useRef<string | null>(null);
  const pendingCalls    = useRef<Map<string, PendingCall>>(new Map());
  // Buffer des events call (ice/answer) arrivés avant que CallScreen soit monté
  const callEventBuffer = useRef<Map<string, WsPayload[]>>(new Map());
  // IDs des appels déjà acceptés — bloquer les call_offer dupliqués
  const acceptedCalls   = useRef<Set<string>>(new Set());
  // IDs destinataires des appels sortants en cours — bloquer l'écho call_offer
  const outgoingCallIds = useRef<Set<string>>(new Set());

  const [isConnected,         setIsConnected]         = useState(false);
  const [unreadMessages,      setUnreadMessages]      = useState(0);
  const [unreadActivity,      setUnreadActivity]      = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [missedCallCount,     setMissedCallCount]     = useState(0);

  // États des événements enrichis
  const [lastNewFollower,       setLastNewFollower]       = useState<NewFollowerPayload | null>(null);
  const [lastCoinTransfer,      setLastCoinTransfer]      = useState<CoinTransferPayload | null>(null);
  const [lastGiftReceived,      setLastGiftReceived]      = useState<GiftReceivedPayload | null>(null);
  const [lastStoryAdded,        setLastStoryAdded]        = useState<StoryAddedPayload | null>(null);
  const [lastStoryView,         setLastStoryView]         = useState<StoryViewPayload | null>(null);
  const [lastCommentOnContent,  setLastCommentOnContent]  = useState<CommentOnContentPayload | null>(null);
  const [lastReactionOnContent, setLastReactionOnContent] = useState<ReactionOnContentPayload | null>(null);
  const [lastPresenceUpdate,      setLastPresenceUpdate]      = useState<PresencePayload | null>(null);
  const [lastConcertLive,         setLastConcertLive]         = useState<ConcertLivePayload | null>(null);
  const [lastLiveStarted,         setLastLiveStarted]         = useState<LiveStartedPayload | null>(null);
  const [lastLiveEnded,           setLastLiveEnded]           = useState<string | null>(null);
  const [lastLiveViewersUpdated,  setLastLiveViewersUpdated]  = useState<LiveViewersUpdatedPayload | null>(null);

  const addListener    = useCallback((fn: WsListener) => { listeners.current.add(fn); }, []);
  const removeListener = useCallback((fn: WsListener) => { listeners.current.delete(fn); }, []);
  const setActiveChat  = useCallback((id: string | null) => { activeChatRef.current = id; }, []);

  // Handler centralisé — recréé quand les setters changent (stable car useState)
  const wsEventHandlerRef = useRef(createWsEventHandler({
    onFeedUpdated:        () => { /* géré par FeedScreen via addListener */ },
    onStoryAdded:         (d) => { if (isMounted.current) setLastStoryAdded(d); },
    onStoryView:          (d) => { if (isMounted.current) setLastStoryView(d); },
    onCommentOnContent:   (d) => { if (isMounted.current) { setLastCommentOnContent(d); setUnreadActivity(n => n + 1); } },
    onReactionOnContent:  (d) => { if (isMounted.current) { setLastReactionOnContent(d); setUnreadActivity(n => n + 1); } },
    onNewFollower:        (d) => { if (isMounted.current) { setLastNewFollower(d); setUnreadActivity(n => n + 1); } },
    onCoinTransferReceived: (d) => { if (isMounted.current) { setLastCoinTransfer(d); setUnreadNotifications(n => n + 1); } },
    onGiftReceived:       (d) => { if (isMounted.current) { setLastGiftReceived(d); setUnreadNotifications(n => n + 1); } },
    onPresence:           (d) => { if (isMounted.current) setLastPresenceUpdate(d); },
    onConcertLive:        (d) => { if (isMounted.current) setLastConcertLive(d); },
    onConcertEnded:       ()  => { /* le feed se recharge via onFeedUpdated */ },
    onLiveStarted:        (d) => { if (isMounted.current) setLastLiveStarted(d); },
    onLiveEnded:          (id) => { if (isMounted.current) setLastLiveEnded(id); },
    onLiveViewersUpdated: (d) => { if (isMounted.current) setLastLiveViewersUpdated(d); },
    onActivity:           ()  => { if (isMounted.current) setUnreadActivity(n => n + 1); },
    onNotification:       ()  => { if (isMounted.current) setUnreadNotifications(n => n + 1); },
  }));

  // CallScreen appelle drainCallBuffer au montage pour récupérer les events reçus avant lui
  const drainCallBuffer = useCallback((partnerId: string): WsPayload[] => {
    const buf = callEventBuffer.current.get(partnerId) ?? [];
    callEventBuffer.current.delete(partnerId);
    return buf;
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const finalisePendingCall = useCallback((
    partnerId: string,
    direction: 'incoming' | 'outgoing' | 'missed',
    _connectedAt: number | null,
  ) => {
    const pending = pendingCalls.current.get(partnerId);
    if (!pending) return;
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    pendingCalls.current.delete(partnerId);

    if (direction === 'missed' && isMounted.current) {
      setMissedCallCount(c => c + 1);
    }
  }, []);

  const registerPendingCall = useCallback((
    partnerId:   string,
    partnerName: string,
    avatarUrl:   string | undefined,
    callType:    'voice' | 'video',
    direction:   'incoming' | 'outgoing',
  ) => {
    // Cancel any existing pending entry for this partner (duplicate offer)
    const existing = pendingCalls.current.get(partnerId);
    if (existing?.timeoutId) clearTimeout(existing.timeoutId);

    // 30s timeout → missed uniquement pour incoming, outgoing reste outgoing
    const timeoutId = setTimeout(() => {
      const p = pendingCalls.current.get(partnerId);
      const timeoutDir = p?.direction === 'incoming' ? 'missed' : 'outgoing';
      finalisePendingCall(partnerId, timeoutDir, null);
    }, CALL_TIMEOUT);

    pendingCalls.current.set(partnerId, {
      partnerId, partnerName, avatarUrl, callType, direction,
      startedAt:   new Date().toISOString(),
      connectedAt: null,
      timeoutId,
    });
  }, [finalisePendingCall]);

  // ── Called by CallScreen when WebRTC actually connects ────────────────────

  const notifyCallConnected = useCallback((partnerId: string) => {
    const pending = pendingCalls.current.get(partnerId);
    if (!pending) return;
    // Cancel miss timeout — call is live
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    pendingCalls.current.set(partnerId, { ...pending, connectedAt: Date.now(), timeoutId: null });
  }, []);

  // ── Called by CallScreen on hangup (from either side) ────────────────────

  const notifyCallEnded = useCallback((partnerId: string) => {
    const pending = pendingCalls.current.get(partnerId);
    if (!pending) return;
    const direction = pending.connectedAt
      ? pending.direction          // was connected → answered call
      : pending.direction === 'incoming' ? 'missed' : 'outgoing';
    finalisePendingCall(partnerId, direction, pending.connectedAt);
  }, [finalisePendingCall]);

  // ── Called by CallScreen when user accepts — block duplicate call_offer ───

  const markCallAccepted = useCallback((partnerId: string) => {
    acceptedCalls.current.add(partnerId);
    cancelCallNotification(partnerId).catch(() => {});
  }, []);

  const markCallEnded = useCallback((partnerId: string) => {
    acceptedCalls.current.delete(partnerId);
    outgoingCallIds.current.delete(partnerId);
  }, []);

  const isOutgoingCall = useCallback((partnerId: string): boolean => {
    return outgoingCallIds.current.has(partnerId);
  }, []);

  // ── refreshUnread ─────────────────────────────────────────────────────────

  const refreshUnread = useCallback(() => {
    messageService.getUnreadCount()
      .then(count => { if (isMounted.current) setUnreadMessages(count); })
      .catch(() => {});
    notificationService.getUnreadCount()
      .then(count => { if (isMounted.current) setUnreadNotifications(count); })
      .catch(() => {});
  }, []);

  // ── WebSocket connect ─────────────────────────────────────────────────────
  // Toutes les callbacks appelées depuis onmessage/onclose sont dans des refs
  // pour eviter de recréer connect() a chaque render et de boucler le useEffect.
  const registerPendingCallRef  = useRef(registerPendingCall);
  const finalisePendingCallRef  = useRef(finalisePendingCall);
  const refreshUnreadRef        = useRef(refreshUnread);
  useEffect(() => { registerPendingCallRef.current  = registerPendingCall;  }, [registerPendingCall]);
  useEffect(() => { finalisePendingCallRef.current  = finalisePendingCall;  }, [finalisePendingCall]);
  useEffect(() => { refreshUnreadRef.current        = refreshUnread;        }, [refreshUnread]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    const url = `${WS_BASE}/api/v1/messages/ws?token=${encodeURIComponent(token)}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      retryCount.current = 0;
      setIsConnected(true);
      authService.getMe().then(u => {
        const id = String(u.id);
        myIdRef.current = id;
        storage.setItem(STORAGE_KEYS.LAST_USER_ID, id);
      }).catch(() => {});
      refreshUnreadRef.current();
      favoriteService.syncFromServer().catch(() => {});
      if (pingTimer.current) clearInterval(pingTimer.current);
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const payload: WsPayload = JSON.parse(event.data as string);
        if (payload.type === 'pong') return;

        if (payload.type === 'account_blocked' && isMounted.current) {
          onAccountBlocked?.(payload.reason, payload.contact);
          return;
        }

        // ── Compteurs non-lus ──────────────────────────────────────────────
        if (payload.type === 'message' && isMounted.current) {
          const fromSelf       = payload.sender_id && payload.sender_id === myIdRef.current;
          const fromActiveChat = activeChatRef.current && payload.sender_id === activeChatRef.current;
          if (!fromSelf && !fromActiveChat) {
            setUnreadMessages(prev => prev + 1);
            payload._showToast = true;
          }
        }
        if (payload.type === 'activity'     && isMounted.current) setUnreadActivity(prev => prev + 1);
        if (payload.type === 'notification' && isMounted.current) setUnreadNotifications(prev => prev + 1);

        // ── Appel entrant — ignorer si c'est notre propre appel ou déjà accepté ─
        if (payload.type === 'call_offer' && isMounted.current) {
          const fromSelf    = (myIdRef.current && payload.from === myIdRef.current)
                           || outgoingCallIds.current.has(payload.to);
          const alreadyLive = acceptedCalls.current.has(payload.from);
          if (!fromSelf && !alreadyLive) {
            callEventBuffer.current.delete(payload.from);
            __DEV__ && console.log('[WS] Incoming call from', payload.from_name ?? payload.from);
            registerPendingCallRef.current(
              payload.from,
              payload.from_name ?? 'Inconnu',
              payload.from_avatar ?? undefined,
              payload.call_type ?? 'voice',
              'incoming',
            );
            const appState = AppState.currentState;
            if (appState === 'active') {
              navigate('Call', {
                partnerId:     payload.from,
                partnerName:   payload.from_name ?? 'Inconnu',
                partnerAvatar: payload.from_avatar ?? null,
                callType:      payload.call_type ?? 'voice',
                isIncoming:    true,
                offer:         payload.sdp ?? undefined,
              });
            } else {
              if (payload.sdp) {
                storage.setItem('pending_call_offer_sdp', JSON.stringify(payload.sdp));
              }
              showIncomingCallNotification(
                payload.from,
                payload.from_name ?? 'Appel',
                payload.from_avatar ?? null,
                payload.call_type === 'video' ? 'video' : 'voice',
              ).catch(() => {});
            }
          }
        }

        // ── L'autre a décroché (appel sortant accepté) ─────────────────────
        if (payload.type === 'call_answer' && isMounted.current) {
          const pending = pendingCalls.current.get(payload.from ?? payload.to);
          if (pending) {
            if (pending.timeoutId) clearTimeout(pending.timeoutId);
            pendingCalls.current.set(pending.partnerId, {
              ...pending,
              connectedAt: Date.now(),
              timeoutId:   null,
            });
          }
        }

        // Annuler la notification Notifee si l'appel est raccroché avant réponse
        if (payload.type === 'call_hangup' && isMounted.current) {
          const fromId = payload.from ?? payload.sender_id;
          if (fromId) cancelCallNotification(fromId).catch(() => {});
        }

        // Appel manqué enregistre cote backend → incrémenter le badge
        if (payload.type === 'missed_call' && isMounted.current) {
          setMissedCallCount(c => c + 1);
        }

        // ── Buffer les events call si CallScreen pas encore monté ─────────
        if ((payload.type === 'call_ice' || payload.type === 'call_answer' || payload.type === 'call_hangup') && isMounted.current) {
          const fromId = payload.from ?? payload.sender_id;
          if (fromId) {
            const buf = callEventBuffer.current.get(fromId) ?? [];
            buf.push(payload);
            callEventBuffer.current.set(fromId, buf);
          }
        }

        // Ne pas broadcaster call_offer si c'est notre propre appel
        if (payload.type === 'call_offer') {
          const fromSelf = (myIdRef.current && payload.from === myIdRef.current)
                        || outgoingCallIds.current.has(payload.to);
          if (!fromSelf) {
            listeners.current.forEach(fn => { try { fn(payload); } catch {} });
          }
        } else {
          listeners.current.forEach(fn => { try { fn(payload); } catch {} });
        }

        if (isMounted.current) {
          wsEventHandlerRef.current(payload);
        }
      } catch {}
    };

    ws.onerror = () => {};

    ws.onclose = (event) => {
      if (!isMounted.current) return;
      setIsConnected(false);
      wsRef.current = null;
      if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }

      if (event.code === 4001) {
        // Token expire — refresh puis reconnexion
        authService.refresh()
          .then(() => { if (isMounted.current) connect(); })
          .catch(() => {
            // Refresh impossible (session expirée) — on reessaie dans 30s
            if (isMounted.current) {
              retryTimer.current = setTimeout(connect, 30_000);
            }
          });
        return;
      }

      // Backoff exponentiel — pas de limite : on reessaie indefiniment
      // (le compteur sert juste a calculer le delai, plafonne a 64s)
      const delay = INITIAL_DELAY * Math.pow(2, Math.min(retryCount.current, 6));
      retryCount.current++;
      retryTimer.current = setTimeout(connect, delay);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // deps vides — tout passe par des refs, connect est stable

  useEffect(() => {
    isMounted.current = true;
    connect();
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        // L'app revient au premier plan — forcer reconnexion si WS mort
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryCount.current = 0;
          connect();
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      isMounted.current = false;
      sub.remove();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (pingTimer.current)  clearInterval(pingTimer.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // deps vides — connect est maintenant stable

  const clearUnreadMessages      = useCallback(() => setUnreadMessages(0), []);
  const clearUnreadActivity      = useCallback(() => setUnreadActivity(0), []);
  const clearUnreadNotifications = useCallback(() => setUnreadNotifications(0), []);
  const clearMissedCalls         = useCallback(() => setMissedCallCount(0), []);

  const sendMessage = useCallback((payload: object, _retryMs = 0) => {
    const p = payload as any;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Enregistrer AVANT d'envoyer pour bloquer l'écho immédiat du serveur
      if (p.type === 'call_offer' && isMounted.current) {
        outgoingCallIds.current.add(p.to);
        registerPendingCall(
          p.to,
          p.to_name ?? p.to,
          p.to_avatar ?? undefined,
          p.call_type ?? 'voice',
          'outgoing',
        );
      }
      wsRef.current.send(JSON.stringify(payload));
      return;
    }
    // WS pas encore OPEN — retry jusqu'a 8s pour les messages critiques d'appel
    if (p.type && ['call_offer', 'call_answer', 'call_ice'].includes(p.type) && _retryMs < 8000) {
      setTimeout(() => sendMessage(payload, _retryMs + 200), 200);
    }
  }, [registerPendingCall]);

  const value = useMemo(() => ({
    sendMessage,
    isConnected,
    addListener,
    removeListener,
    unreadMessages,
    unreadActivity,
    unreadNotifications,
    refreshUnread,
    clearUnreadMessages,
    clearUnreadActivity,
    clearUnreadNotifications,
    setActiveChat,
    missedCallCount,
    clearMissedCalls,
    notifyCallConnected,
    notifyCallEnded,
    markCallAccepted,
    markCallEnded,
    isOutgoingCall,
    drainCallBuffer,
    lastNewFollower,
    lastCoinTransfer,
    lastGiftReceived,
    lastStoryAdded,
    lastStoryView,
    lastCommentOnContent,
    lastReactionOnContent,
    lastPresenceUpdate,
    lastConcertLive,
    lastLiveStarted,
    lastLiveEnded,
    lastLiveViewersUpdated,
  }), [
    sendMessage, isConnected, addListener, removeListener,
    unreadMessages, unreadActivity, unreadNotifications,
    refreshUnread, clearUnreadMessages, clearUnreadActivity, clearUnreadNotifications,
    setActiveChat, missedCallCount, clearMissedCalls,
    notifyCallConnected, notifyCallEnded, markCallAccepted, markCallEnded,
    isOutgoingCall, drainCallBuffer,
    lastNewFollower, lastCoinTransfer, lastGiftReceived, lastStoryAdded,
    lastStoryView,
    lastCommentOnContent, lastReactionOnContent, lastPresenceUpdate, lastConcertLive,
    lastLiveStarted, lastLiveEnded, lastLiveViewersUpdated,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useWs() {
  return useContext(Ctx);
}
