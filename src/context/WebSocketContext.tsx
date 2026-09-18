/**
 * Global WebSocket context — persistent connection + unread counters + realtime
 * events (follows, gifts, stories, live…). Les appels 1‑à‑1 ont été retirés de
 * l'app (migrés vers une app dédiée).
 */
import React, {
  createContext, useContext, useEffect, useRef, useCallback, useState, useMemo,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
import { openAuthenticatedWs } from '../utils/authenticatedWs';
import { storage } from '../utils/storage';
import { authService } from '../services/authService';
import { messageService } from '../services/messageService';
import { notificationService } from '../services/notificationService';
import { favoriteService } from '../services/favoriteService';
import { liveService } from '../services/liveService';
import {
  createWsEventHandler,
  type NewFollowerPayload,
  type GoGoldTransferPayload,
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
  // Events temps-réel enrichis
  lastNewFollower:          NewFollowerPayload | null;
  lastGoGoldTransfer:         GoGoldTransferPayload | null;
  lastGiftReceived:         GiftReceivedPayload | null;
  lastStoryAdded:           StoryAddedPayload | null;
  lastStoryView:            StoryViewPayload | null;
  lastCommentOnContent:     CommentOnContentPayload | null;
  lastReactionOnContent:    ReactionOnContentPayload | null;
  lastPresenceUpdate:       PresencePayload | null;
  lastConcertLive:          ConcertLivePayload | null;
  lastLiveStarted:          LiveStartedPayload | null;
  lastLiveEnded:            string | null;
  liveUserIds:              Set<string>;
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
  lastNewFollower:          null,
  lastGoGoldTransfer:         null,
  lastGiftReceived:         null,
  lastStoryAdded:           null,
  lastStoryView:            null,
  lastCommentOnContent:     null,
  lastReactionOnContent:    null,
  lastPresenceUpdate:       null,
  lastConcertLive:          null,
  lastLiveStarted:          null,
  lastLiveEnded:            null,
  liveUserIds:              new Set(),
  lastLiveViewersUpdated:   null,
});

const WS_BASE        = API_BASE_URL.replace(/^http/, 'ws');
const INITIAL_DELAY  = 1_000;
const PING_INTERVAL  = 25_000;

export const WebSocketProvider: React.FC<{ children: React.ReactNode; onAccountBlocked?: (reason?: string, contact?: string) => void }> = ({ children, onAccountBlocked }) => {
  const wsRef           = useRef<WebSocket | null>(null);
  const retryCount      = useRef(0);
  const retryTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer       = useRef<ReturnType<typeof setInterval> | null>(null);
  const listeners       = useRef<Set<WsListener>>(new Set());
  const isMounted       = useRef(true);
  // Initialise immédiatement depuis MMKV — pas besoin d'attendre getMe()
  const myIdRef           = useRef<string | null>(storage.getItem(STORAGE_KEYS.LAST_USER_ID));
  // true uniquement après confirmation via getMe() — évite les faux positifs fromSelf
  const myIdConfirmedRef  = useRef<boolean>(false);
  const activeChatRef   = useRef<string | null>(null);

  const [isConnected,         setIsConnected]         = useState(false);
  const [unreadMessages,      setUnreadMessages]      = useState(0);
  const [unreadActivity,      setUnreadActivity]      = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // États des événements enrichis
  const [lastNewFollower,       setLastNewFollower]       = useState<NewFollowerPayload | null>(null);
  const [lastGoGoldTransfer,      setLastGoGoldTransfer]      = useState<GoGoldTransferPayload | null>(null);
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
  // IDs des utilisateurs actuellement en live — alimente l'anneau "Live" sur les avatars
  // partout dans l'app, mis à jour en temps réel sans recharger l'écran.
  const [liveUserIds,             setLiveUserIds]             = useState<Set<string>>(new Set());

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
    onGoGoldTransferReceived: (d) => { if (isMounted.current) { setLastGoGoldTransfer(d); setUnreadNotifications(n => n + 1); } },
    onGiftReceived:       (d) => { if (isMounted.current) { setLastGiftReceived(d); setUnreadNotifications(n => n + 1); } },
    onPresence:           (d) => { if (isMounted.current) setLastPresenceUpdate(d); },
    onConcertLive:        (d) => { if (isMounted.current) setLastConcertLive(d); },
    onConcertEnded:       ()  => { /* le feed se recharge via onFeedUpdated */ },
    onLiveStarted:        (d) => {
      if (!isMounted.current) return;
      setLastLiveStarted(d);
      const uid = d.live?.user_id;
      if (uid) setLiveUserIds(prev => { const next = new Set(prev); next.add(uid); return next; });
    },
    onLiveEnded:          (id, uid) => {
      if (!isMounted.current) return;
      setLastLiveEnded(id);
      if (uid) setLiveUserIds(prev => { const next = new Set(prev); next.delete(uid); return next; });
    },
    onLiveViewersUpdated: (d) => { if (isMounted.current) setLastLiveViewersUpdated(d); },
    onActivity:           ()  => { if (isMounted.current) setUnreadActivity(n => n + 1); },
    onNotification:       ()  => { if (isMounted.current) setUnreadNotifications(n => n + 1); },
  }));

  // ── refreshUnread ─────────────────────────────────────────────────────────

  const refreshUnread = useCallback(() => {
    messageService.getUnreadCount()
      .then(count => { if (isMounted.current) setUnreadMessages(count); })
      .catch(() => {});
    notificationService.getUnreadCount()
      .then(count => { if (isMounted.current) setUnreadNotifications(count); })
      .catch(() => {});
    // Lives déjà actifs à la connexion — sinon liveUserIds resterait vide jusqu'au
    // prochain live_started reçu en direct pendant la session.
    liveService.getLives()
      .then(lives => { if (isMounted.current) setLiveUserIds(new Set(lives.map(l => l.user_id))); })
      .catch(() => {});
  }, []);

  // ── WebSocket connect ─────────────────────────────────────────────────────
  // Toutes les callbacks appelées depuis onmessage/onclose sont dans des refs
  // pour eviter de recréer connect() a chaque render et de boucler le useEffect.
  const refreshUnreadRef        = useRef(refreshUnread);
  useEffect(() => { refreshUnreadRef.current        = refreshUnread;        }, [refreshUnread]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    const url = `${WS_BASE}/api/v1/messages/ws`;
    const ws  = openAuthenticatedWs(url, token);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      retryCount.current = 0;
      setIsConnected(true);
      authService.getMe().then(u => {
        if (!isMounted.current) return;
        const id = String(u.id);
        myIdRef.current          = id;
        myIdConfirmedRef.current = true;
        storage.setItem(STORAGE_KEYS.LAST_USER_ID, id);
      }).catch(() => {});
      if (isMounted.current) refreshUnreadRef.current();
      favoriteService.syncFromServer().catch(() => {});
      if (pingTimer.current) clearInterval(pingTimer.current);
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        const payload: WsPayload = JSON.parse(raw);
        if (payload.type === 'pong') return;

        if (payload.type === 'account_blocked' && isMounted.current) {
          onAccountBlocked?.(payload.reason, payload.contact);
          return;
        }

        if (payload.type === 'message' && isMounted.current) {
          const fromSelf       = payload.sender_id && payload.sender_id === myIdRef.current;
          const fromActiveChat = activeChatRef.current && payload.sender_id === activeChatRef.current;
          if (!fromSelf && !fromActiveChat) {
            setUnreadMessages(prev => prev + 1);
            payload._showToast = true;
          }
        }
        if (payload.type === 'activity' && isMounted.current) setUnreadActivity(prev => prev + 1);
        // NOTE: l'incrément de unreadNotifications pour 'notification' et les types
        // planning est géré exclusivement par wsEventHandler (onNotification / onPlanningUpdate)
        // pour éviter les doublons.

        listeners.current.forEach(fn => { try { fn(payload); } catch {} });

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
        // Retour au premier plan : reconnecter si WS mort
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED || wsRef.current.readyState === WebSocket.CLOSING) {
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryCount.current = 0;
          connect();
        } else if (wsRef.current.readyState === WebSocket.OPEN) {
          // WS vivant en background — signaler qu'on est de nouveau actif
          wsRef.current.send(JSON.stringify({ type: 'presence_update', is_online: true }));
        }
      } else if (next === 'background') {
        // Signaler qu'on est hors ligne
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'presence_update', is_online: false }));
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

  const sendMessage = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // ── Contexte stable (connexion + actions) — re-render rare ──────────────
  const stableValue = useMemo(() => ({
    sendMessage,
    isConnected,
    addListener,
    removeListener,
    refreshUnread,
    setActiveChat,
    lastNewFollower,
    lastGoGoldTransfer,
    lastGiftReceived,
    lastStoryAdded,
    lastStoryView,
    lastCommentOnContent,
    lastReactionOnContent,
    lastPresenceUpdate,
    lastConcertLive,
    lastLiveStarted,
    lastLiveEnded,
    liveUserIds,
    lastLiveViewersUpdated,
  }), [
    sendMessage, isConnected, addListener, removeListener,
    refreshUnread, setActiveChat,
    lastNewFollower, lastGoGoldTransfer, lastGiftReceived, lastStoryAdded,
    lastStoryView, lastCommentOnContent, lastReactionOnContent, lastPresenceUpdate,
    lastConcertLive, lastLiveStarted, lastLiveEnded, liveUserIds, lastLiveViewersUpdated,
  ]);

  // ── Contexte compteurs (change souvent) — isolé pour éviter re-renders ──
  const unreadValue = useMemo(() => ({
    unreadMessages,
    unreadActivity,
    unreadNotifications,
    clearUnreadMessages,
    clearUnreadActivity,
    clearUnreadNotifications,
  }), [
    unreadMessages, unreadActivity, unreadNotifications,
    clearUnreadMessages, clearUnreadActivity, clearUnreadNotifications,
  ]);

  // Merge les deux pour l'interface publique (rétrocompatibilité totale)
  const value = useMemo(() => ({ ...stableValue, ...unreadValue }), [stableValue, unreadValue]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useWs() {
  return useContext(Ctx);
}
