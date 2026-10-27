// Ouvre un WebSocket et envoie le token JWT dans le premier message plutôt
// qu'en query string (qui finirait dans les logs d'accès des proxys/CDN
// intermédiaires). Le serveur ferme la connexion s'il ne reçoit pas ce
// message d'auth dans les ~10s suivant l'ouverture.
export function openAuthenticatedWs(url: string, token: string): WebSocket {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  });
  return ws;
}

const INITIAL_RETRY_DELAY = 1_000;
const MAX_RETRY_EXPONENT  = 6; // plafonne le backoff à 64s

// Types d'événements extraits de WebSocket lui-même (pas de MessageEvent/
// CloseEvent globaux dans les types React Native) — garantit la compatibilité
// avec les handlers natifs ws.onmessage/onclose sans dépendre des libs DOM.
type WsMessageEvent = Parameters<Exclude<WebSocket['onmessage'], null>>[0];
type WsCloseEvent   = Parameters<Exclude<WebSocket['onclose'],   null>>[0];

/** Interface minimale exposée par une connexion auto-reconnectante — un
 * sous-ensemble stable de WebSocket, pour que l'appelant n'ait jamais besoin
 * de réagir lui-même à la perte/reprise de connexion. */
export interface ReconnectingWs {
  send(data: string): void;
  close(): void;
  onmessage: ((ev: WsMessageEvent) => void) | null;
  /** Rappelé à chaque (re)connexion réussie — utile pour un log debug ou
   * annoncer "connexion rétablie" ; jamais nécessaire pour la logique métier
   * (send()/onmessage continuent de fonctionner de façon transparente). */
  onopen:  (() => void) | null;
  onerror: ((ev: Event) => void) | null;
  /** Rappelé à chaque coupure de la connexion sous-jacente — avant la tentative
   * de reconnexion automatique, jamais après fermeture définitive via close(). */
  onclose: ((ev: WsCloseEvent) => void) | null;
}

/**
 * Variante auto-reconnectante de openAuthenticatedWs — même pattern de
 * backoff exponentiel que WebSocketContext (app-wide), mais réutilisable pour
 * un socket de live (chat/cadeaux/likes temps réel). Sans ça, une coupure
 * réseau brève (changement 4G/WiFi, app en arrière-plan quelques secondes)
 * tuait silencieusement le flux temps réel pour le reste de la session — le
 * live restait affiché mais plus aucun message/cadeau n'arrivait tant que
 * l'utilisateur ne quittait/rouvrait pas l'écran.
 *
 * `onmessage` peut être réaffecté à tout moment par l'appelant (comme sur un
 * WebSocket natif) ; il est préservé automatiquement à travers chaque
 * reconnexion.
 */
export function openReconnectingAuthenticatedWs(url: string, token: string): ReconnectingWs {
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  let closed = false;
  let userOnMessage: ((ev: WsMessageEvent) => void) | null = null;
  let userOnOpen:    (() => void) | null = null;
  let userOnError:   ((ev: Event) => void) | null = null;
  let userOnClose:   ((ev: WsCloseEvent) => void) | null = null;

  const connect = () => {
    if (closed) return;
    const socket = new WebSocket(url);
    ws = socket;

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'auth', token }));
      retryCount = 0;
      userOnOpen?.();
    });

    socket.onmessage = (ev) => { userOnMessage?.(ev); };
    socket.onerror = (ev) => { userOnError?.(ev); };

    socket.onclose = (ev) => {
      if (closed || ws !== socket) return; // remplacé par une reconnexion plus récente — ignorer cet événement obsolète
      ws = null;
      userOnClose?.(ev);
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, Math.min(retryCount, MAX_RETRY_EXPONENT));
      retryCount++;
      retryTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    send(data: string) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(data);
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { ws?.close(); } catch { /* déjà fermé */ }
      ws = null;
    },
    get onmessage() { return userOnMessage; },
    set onmessage(fn: ((ev: WsMessageEvent) => void) | null) { userOnMessage = fn; },
    get onopen() { return userOnOpen; },
    set onopen(fn: (() => void) | null) { userOnOpen = fn; },
    get onerror() { return userOnError; },
    set onerror(fn: ((ev: Event) => void) | null) { userOnError = fn; },
    get onclose() { return userOnClose; },
    set onclose(fn: ((ev: WsCloseEvent) => void) | null) { userOnClose = fn; },
  };
}
