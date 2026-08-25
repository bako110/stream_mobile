/**
 * FCM + Notifee — push notifications & full-screen incoming call alerts.
 *
 * - Foreground: handled by WebSocket + NotificationToast (no FCM needed)
 * - Background/quit: FCM wakes the app, Notifee shows a full-screen call UI
 *
 * Call setupFCM() once after login.
 * Call removeFCMToken() on logout.
 */
import {
  getMessaging,
  requestPermission,
  getToken,
  onTokenRefresh,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  deleteToken,
} from '@react-native-firebase/messaging';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
  EventType,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import { navigate } from '../navigation/navigationRef';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';

// ── Channel IDs — incrémenter le suffixe pour forcer recréation si besoin ─────
const CHANNEL_CALLS         = 'incoming_calls_v6';
const CHANNEL_MESSAGES      = 'messages_v6';
const CHANNEL_NOTIFS        = 'notifications_v6';
// Publications des personnes suivies (post/reel/story) — signal discret,
// sans son ni vibration, pour ne pas interrompre l'utilisateur.
const CHANNEL_FRIEND_ACTIVITY = 'friend_activity_v1';

async function _createChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Supprimer les anciens canaux
  await notifee.deleteChannel('incoming_calls').catch(() => {});
  await notifee.deleteChannel('messages').catch(() => {});
  await notifee.deleteChannel('notifications').catch(() => {});
  await notifee.deleteChannel('incoming_calls_v2').catch(() => {});
  await notifee.deleteChannel('messages_v2').catch(() => {});
  await notifee.deleteChannel('notifications_v2').catch(() => {});
  await notifee.deleteChannel('incoming_calls_v3').catch(() => {});
  await notifee.deleteChannel('messages_v3').catch(() => {});
  await notifee.deleteChannel('notifications_v3').catch(() => {});
  await notifee.deleteChannel('incoming_calls_v4').catch(() => {});
  await notifee.deleteChannel('messages_v4').catch(() => {});
  await notifee.deleteChannel('notifications_v4').catch(() => {});
  await notifee.deleteChannel('incoming_calls_v5').catch(() => {});
  await notifee.deleteChannel('messages_v5').catch(() => {});
  await notifee.deleteChannel('notifications_v5').catch(() => {});

  await notifee.createChannel({
    id:               CHANNEL_CALLS,
    name:             'Appels entrants',
    importance:       AndroidImportance.HIGH,
    visibility:       AndroidVisibility.PUBLIC,
    vibration:        true,
    vibrationPattern: [500, 300, 500, 300],
    sound:            'incoming_call',
  });
  await notifee.createChannel({
    id:               CHANNEL_MESSAGES,
    name:             'Messages',
    importance:       AndroidImportance.HIGH,
    visibility:       AndroidVisibility.PRIVATE,
    vibration:        true,
    vibrationPattern: [300, 200, 300, 200],
    sound:            'message_sound',
  });
  await notifee.createChannel({
    id:               CHANNEL_NOTIFS,
    name:             'Notifications',
    importance:       AndroidImportance.HIGH,
    visibility:       AndroidVisibility.PRIVATE,
    vibration:        true,
    vibrationPattern: [250, 250],
    sound:            'notification_sound',
  });
  await notifee.createChannel({
    id:         CHANNEL_FRIEND_ACTIVITY,
    name:       'Publications de mes abonnements',
    importance: AndroidImportance.LOW,
    visibility: AndroidVisibility.PRIVATE,
    vibration:  false,
    sound:      undefined,
  });
}

// ── Show full-screen incoming call notification ───────────────────────────────
export async function showIncomingCallNotification(
  callerId: string,
  callerName: string,
  callerAvatar: string | null,
  callType: 'voice' | 'video',
  callId?: string | null,
): Promise<void> {
  await notifee.displayNotification({
    id:    `call_${callerId}`,
    title: callerName,
    body:  callType === 'video' ? 'Appel vidéo' : 'Appel vocal',
    android: {
      channelId:        CHANNEL_CALLS,
      category:         AndroidCategory.CALL,
      importance:       AndroidImportance.HIGH,
      visibility:       AndroidVisibility.PUBLIC,
      fullScreenAction: {
        id:             'default',
        // Opens MainActivity which triggers the deep-link via onNotificationOpenedApp
      },
      actions: [
        {
          title:    'Refuser',
          pressAction: { id: 'decline' },
        },
        {
          title:    'Accepter',
          pressAction: { id: 'accept', launchActivity: 'default' },
        },
      ],
      pressAction: { id: 'default', launchActivity: 'default' },
      sound: 'incoming_call',
    },
    data: {
      type:        'call_offer',
      call_type:   callType,
      caller_id:   callerId,
      caller_name: callerName,
      caller_avatar: callerAvatar ?? '',
      call_id:     callId ?? '',
    },
  });
}

// ── Cancel the call notification (on hangup) ─────────────────────────────────
export async function cancelCallNotification(callerId: string): Promise<void> {
  await notifee.cancelNotification(`call_${callerId}`);
}

// ── Handle notification action press (background) ────────────────────────────
export function setupNotifeeBackgroundHandler(): void {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;
      const data     = detail.notification?.data as Record<string, string> | undefined;

      await notifee.cancelNotification(detail.notification!.id!);

      if (actionId === 'decline') {
        // Rejeter via REST avec le token stocké dans MMKV
        if (data?.caller_id) {
          try {
            const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
            if (token) {
              const { API_BASE_URL } = require('../utils/constants');
              await fetch(`${API_BASE_URL}/api/v1/messages/call/reject`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body:    JSON.stringify({ caller_id: data.caller_id }),
              });
            }
          } catch {}
        }
      } else if (actionId === 'accept') {
        // Stocker l'intention dans MMKV — l'app la lira au démarrage
        if (data) {
          storage.setItem('pending_call_accept', JSON.stringify({
            caller_id:    data.caller_id,
            caller_name:  data.caller_name,
            caller_avatar: data.caller_avatar ?? '',
            call_type:    data.call_type ?? 'voice',
            call_id:      data.call_id ?? null,
          }));
        }
      }
      // Pour 'default' (tap) : l'app s'ouvre via getInitialNotification
    }
    if (type === EventType.DISMISSED) {
      await notifee.cancelNotification(detail.notification!.id!);
    }
  });
}

// ── Fetch GET /call/pending avec un access token garanti frais ───────────────
// Le token stocke peut avoir expire pendant que l'app etait tuee/en arriere-plan
// (headless task — pas de garantie que RootNavigator ait deja tourne pour
// enregistrer le refresh via apiClient). Sur 401, on rafraichit directement via
// fetch (independant d'apiClient/authService) puis on retente une fois.
async function _fetchPendingCallWithRefresh(apiBaseUrl: string): Promise<any | null> {
  let token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  if (!token) return null;

  const doFetch = (t: string) => fetch(`${apiBaseUrl}/api/v1/messages/call/pending`, {
    headers: { Authorization: `Bearer ${t}` },
  });

  let res = await doFetch(token);
  if (res.status === 401) {
    const refreshToken = storage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) return null;
    try {
      const refreshRes = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!refreshRes.ok) return null;
      const refreshed = await refreshRes.json();
      token = refreshed.access_token;
      storage.setItem(STORAGE_KEYS.ACCESS_TOKEN, refreshed.access_token);
      storage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshed.refresh_token);
      res = await doFetch(token!);
    } catch {
      return null;
    }
  }
  if (!res.ok) return null;
  return res.json();
}

// ── Handle FCM message (background/quit) ─────────────────────────────────────
// Called by setBackgroundMessageHandler — runs in a headless JS task.
// FCM sends data-only messages so this handler always fires (no OS interception).
export async function handleBackgroundFCM(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  const data = remoteMessage?.data;
  if (!data) return;

  await _createChannels();

  const type  = (data.type  as string) ?? '';
  const title = (data.title as string) ?? 'Gofolyx';
  const body  = (data.body  as string) ?? '';

  if (type === 'call_offer') {
    const callerId   = (data.caller_id    as string) ?? '';
    const callerName = (data.caller_name  as string) ?? 'Appel';
    const callerAvatar = (data.caller_avatar as string) || '';
    const callType   = (data.call_type as string) === 'video' ? 'video' : 'voice';

    // Récupérer le SDP complet depuis le backend (le headless task peut faire fetch)
    let offer: any = null;
    let callId: string | null = (data.call_id as string) || null;
    try {
      const { API_BASE_URL } = require('../utils/constants');
      const payload = await _fetchPendingCallWithRefresh(API_BASE_URL);
      if (payload) {
        offer  = payload.sdp ?? null;
        callId = payload.call_id ?? callId;
      }
    } catch {}

    // Stocker dans MMKV — l'app lira ça au retour au foreground
    storage.setItem('pending_incoming_call', JSON.stringify({
      caller_id:    callerId,
      caller_name:  callerName,
      caller_avatar: callerAvatar,
      call_type:    callType,
      call_id:      callId,
      offer,
      received_at:  Date.now(),
    }));

    // L'écran d'appel plein écran vient TOUJOURS de Notifee (fullScreenAction) —
    // un ConnectionService self-managed n'affiche par lui-même AUCUNE UI système
    // (contrairement à ce qu'on pensait) : il ne fait qu'intégrer l'appel au
    // système Telecom (routage audio natif, bouton volume, interruption par un
    // appel GSM classique). Sans cette notification, l'appel restait invisible
    // même quand reportIncomingCall() "réussissait" silencieusement.
    const { callConnectionService } = require('../services/callConnectionService');
    if (callConnectionService.isAvailable) {
      try { await callConnectionService.reportIncomingCall(callerId, callerName, callType === 'video'); } catch {}
    }
    await showIncomingCallNotification(callerId, callerName, callerAvatar || null, callType, callId);
    return;
  }

  if (type === 'missed_call') {
    const callerName  = (data.caller_name as string) || 'Appel manqué';
    const callLabel   = (data.call_type as string) === 'video' ? 'vidéo' : 'vocal';
    await notifee.displayNotification({
      title: callerName,
      body:  `Appel ${callLabel} manqué`,
      android: {
        channelId:    CHANNEL_NOTIFS,
        importance:   AndroidImportance.HIGH,
        sound:        'notification_sound',
        smallIcon:    'ic_notification',
        pressAction:  { id: 'default', launchActivity: 'default' },
      },
      data: data as Record<string, string>,
    });
    return;
  }

  if (type === 'message') {
    const msgTitle = (data.sender_name as string) || title;
    const msgBody  = body || 'Vous avez reçu un message';
    await notifee.displayNotification({
      title: msgTitle,
      body:  msgBody,
      android: {
        channelId:    CHANNEL_MESSAGES,
        importance:   AndroidImportance.HIGH,
        sound:        'message_sound',
        vibrationPattern: [300, 200, 300, 200],
        pressAction:  { id: 'default', launchActivity: 'default' },
      },
      data: data as Record<string, string>,
    });
    return;
  }

  if (type === 'subscription_expired') {
    const subTitle = (data.title as string) || 'Votre abonnement a expire';
    await notifee.displayNotification({
      title: subTitle,
      body:  body,
      android: {
        channelId:        CHANNEL_NOTIFS,
        importance:       AndroidImportance.HIGH,
        sound:            'notification_sound',
        vibrationPattern: [300, 200, 300],
        smallIcon:        'ic_notification',
        pressAction:      { id: 'default', launchActivity: 'default' },
      },
      ios: {
        sound: 'notification_sound.wav',
      },
      data: data as Record<string, string>,
    });
    return;
  }

  if (type === 'event_reminder') {
    const evTitle = (data.title as string) || "Votre evenement s'approche";
    await notifee.displayNotification({
      title: evTitle,
      body:  body,
      android: {
        channelId:        CHANNEL_NOTIFS,
        importance:       AndroidImportance.HIGH,
        sound:            'notification_sound',
        vibrationPattern: [300, 200, 300],
        smallIcon:        'ic_notification',
        pressAction:      { id: 'default', launchActivity: 'default' },
      },
      ios: {
        sound: 'notification_sound.wav',
      },
      data: data as Record<string, string>,
    });
    return;
  }

  // Publication d'un abonnement (post/reel/story) — signal discret, sans son ni
  // vibration (voir SILENT_NOTIFICATION_TYPES côté backend).
  const notificationType = (data.notification_type as string) ?? '';
  if (['post_posted', 'reel_posted', 'story_posted', 'concert_created', 'event_created'].includes(notificationType)) {
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId:   CHANNEL_FRIEND_ACTIVITY,
        importance:  AndroidImportance.LOW,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
      ios: { sound: undefined },
      data: data as Record<string, string>,
    });
    return;
  }

  // Generic notification (follow, reaction, comment, etc.)
  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId:    CHANNEL_NOTIFS,
      importance:   AndroidImportance.HIGH,
      sound:        'notification_sound',
      vibrationPattern: [250, 250],
      pressAction:  { id: 'default', launchActivity: 'default' },
    },
    data: data as Record<string, string>,
  });
}


// ── Handle notification tap (foreground + background open) ───────────────────
function _handleNotificationOpen(data?: Record<string, string>): void {
  if (!data) return;
  const type = data.type;
  if (type === 'call_offer') {
    navigate('Call', {
      partnerId:    data.caller_id   ?? data.from,
      partnerName:  data.caller_name ?? '',
      partnerAvatar: data.caller_avatar || null,
      callType:     (data.call_type as 'voice' | 'video') ?? 'voice',
      isIncoming:   true,
      autoAccept:   data._accept === 'true',
      offer:        undefined,
      callId:       data.call_id || null,
    });
  } else if (type === 'missed_call') {
    navigate('Messages', { initialTab: 'calls' });
  } else if (type === 'message') {
    navigate('Chat', { partnerId: data.sender_id, partnerName: data.sender_name ?? '' });
  } else if (type === 'subscription_expired') {
    const missingGoGold = parseInt(data.missing_gogold ?? '0', 10);
    const missingEur   = parseFloat(data.missing_eur ?? '0');
    navigate('BuyGoGold', { neededGoGold: missingGoGold, neededEur: missingEur });
  } else if (type === 'event_reminder') {
    const refType = data.ref_type ?? '';
    const refId   = data.ref_id   ?? '';
    if (refType === 'concert' && refId) {
      navigate('ConcertDetail', { concertId: refId });
    } else if (refType === 'event' && refId) {
      navigate('EventDetail', { eventId: refId });
    } else {
      navigate('Notifications', undefined);
    }
  } else if (type === 'notification') {
    const notifType = data.notification_type ?? '';
    if (
      notifType === 'wallet_gift_received' ||
      notifType === 'wallet_transfer_received' ||
      notifType === 'wallet_purchase' ||
      notifType === 'wallet_boost' ||
      notifType === 'wallet_withdrawal'
    ) {
      navigate('Wallet', undefined);
    } else {
      navigate('Notifications', undefined);
    }
  } else {
    navigate('Notifications', undefined);
  }
}

// ── Backend token registration ────────────────────────────────────────────────
let _isFirstRegister = true;

async function _registerToken(token: string): Promise<void> {
  try {
    const headers: Record<string, string> = {};
    // Premier enregistrement apres login = nouvelle session → declenche notif push
    if (_isFirstRegister) {
      headers['X-New-Session'] = 'true';
      _isFirstRegister = false;
    }
    await apiClient.post(Endpoints.notifications.deviceToken, {
      token, platform: Platform.OS,
    }, { headers });
    console.log('[FCM] device token registered');
  } catch (e: any) {
    console.warn('[FCM] register token failed:', e?.status, e?.message);
  }
}

export function resetFCMSessionFlag(): void {
  _isFirstRegister = true;
}

async function _unregisterToken(token: string): Promise<void> {
  try {
    await apiClient.post(Endpoints.notifications.deviceToken + '/remove', {
      token, platform: Platform.OS,
    });
  } catch {}
}

// ── Main setup (call after login) ─────────────────────────────────────────────
// Reprend un appel accepté depuis la notification pendant que l'app était en
// arrière-plan/tuée. Appelé en tout premier dans setupFCM() — avant permissions,
// token FCM et enregistrement réseau — pour qu'un souci sur ces étapes annexes
// (lentes, potentiellement en échec) ne retarde/empêche jamais la reprise d'un
// appel déjà accepté par l'utilisateur (sinon: splash → accueil, appel perdu).
export function resumePendingCallAccept(): void {
  const pendingRaw = storage.getItem('pending_call_accept');
  if (!pendingRaw) return;
  storage.removeItem('pending_call_accept');
  try {
    const pending = JSON.parse(pendingRaw);
    let offer: any = null;
    let callId: string | null = pending.call_id ?? null;
    const incomingRaw = storage.getItem('pending_incoming_call');
    if (incomingRaw) {
      storage.removeItem('pending_incoming_call');
      try {
        const incoming = JSON.parse(incomingRaw);
        offer  = incoming.offer ?? null;
        callId = incoming.call_id ?? callId;
      } catch {}
    }
    navigate('Call', {
      partnerId:    pending.caller_id,
      partnerName:  pending.caller_name ?? 'Inconnu',
      partnerAvatar: pending.caller_avatar || null,
      callType:     pending.call_type ?? 'voice',
      isIncoming:   true,
      autoAccept:   true,
      offer,
      callId,
    });
  } catch {}
}

export async function setupFCM(): Promise<void> {
  resumePendingCallAccept();

  await _createChannels();

  const m = getMessaging();

  const authStatus = await requestPermission(m);
  console.log('[FCM] authStatus=', authStatus);
  // 1 = AUTHORIZED, 2 = PROVISIONAL
  const enabled = authStatus === 1 || authStatus === 2;
  if (!enabled) {
    console.log('[FCM] permission denied, push disabled');
    return;
  }

  const token = await getToken(m);
  console.log('[FCM] token=', token ? token.slice(0, 30) + '...' : 'null');
  if (token) await _registerToken(token);

  onTokenRefresh(m, _registerToken);

  // Foreground FCM — fallback si le WS n'a pas livré le call_offer
  // (ex: multi-instance backend, Redis down, WS flap)
  onMessage(m, async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
    const data = remoteMessage?.data;
    if (!data || data.type !== 'call_offer') return;
    const callerId    = (data.caller_id    as string) ?? '';
    const callerName  = (data.caller_name  as string) ?? 'Appel';
    const callerAvatar = (data.caller_avatar as string) || '';
    const callType    = (data.call_type as string) === 'video' ? 'video' : 'voice';
    // Attendre 1s — si le WS a livré, il a déjà navigué. Sinon on prend le relais.
    await new Promise<void>(r => setTimeout(() => r(), 1000));
    // Vérifier si CallScreen est déjà ouvert (navigationRef)
    const { navigationRef: navRef } = require('../navigation/navigationRef');
    const currentRoute = navRef.getCurrentRoute?.();
    if (currentRoute?.name === 'Call') return;
    let offer: any = null;
    try {
      const { API_BASE_URL } = require('../utils/constants');
      const payload = await _fetchPendingCallWithRefresh(API_BASE_URL);
      if (payload) offer = payload.sdp ?? null;
    } catch {}
    navigate('Call', {
      partnerId:    callerId,
      partnerName:  callerName,
      partnerAvatar: callerAvatar || null,
      callType,
      isIncoming:   true,
      offer,
    });
  });

  // App opened from background notification tap
  onNotificationOpenedApp(m, (msg: FirebaseMessagingTypes.RemoteMessage) => {
    _handleNotificationOpen(msg.data as Record<string, string>);
  });

  // Notifee foreground action handler
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;
      const data     = detail.notification?.data as Record<string, string> | undefined;
      notifee.cancelNotification(detail.notification!.id!);
      if (actionId === 'accept') {
        _handleNotificationOpen({ ...data, _accept: 'true' } as Record<string, string>);
      } else if (actionId === 'decline') {
        // Envoyer call_hangup via WebSocket (app est active)
        if (data?.caller_id) {
          try {
            apiClient.post(`/api/v1/messages/call/reject`, { caller_id: data.caller_id });
          } catch {}
        }
      } else if (actionId === 'default') {
        _handleNotificationOpen(data);
      }
    }
  });

  // App opened from quit state (FCM)
  const initial = await getInitialNotification(m);
  if (initial) _handleNotificationOpen(initial.data as Record<string, string>);

  // App opened from quit state (Notifee)
  const initialNotifee = await notifee.getInitialNotification();
  if (initialNotifee) {
    _handleNotificationOpen(initialNotifee.notification.data as Record<string, string>);
  }
}

export async function removeFCMToken(): Promise<void> {
  try {
    const m = getMessaging();
    const token = await getToken(m);
    if (token) await _unregisterToken(token);
    await deleteToken(m);
  } catch {}
}
