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
const CHANNEL_CALLS    = 'incoming_calls_v6';
const CHANNEL_MESSAGES = 'messages_v6';
const CHANNEL_NOTIFS   = 'notifications_v6';

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
}

// ── Show full-screen incoming call notification ───────────────────────────────
export async function showIncomingCallNotification(
  callerId: string,
  callerName: string,
  callerAvatar: string | null,
  callType: 'voice' | 'video',
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
  const title = (data.title as string) ?? 'FoliX';
  const body  = (data.body  as string) ?? '';

  if (type === 'call_offer') {
    await showIncomingCallNotification(
      (data.caller_id    as string) ?? '',
      (data.caller_name  as string) ?? 'Appel',
      (data.caller_avatar as string) || null,
      ((data.call_type   as string) === 'video' ? 'video' : 'voice'),
    );
    return;
  }

  if (type === 'message') {
    await notifee.displayNotification({
      title: (data.sender_name as string) || title,
      body:  body || 'Vous avez reçu un message',
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
      callType:     (data.call_type as 'voice' | 'video') ?? 'voice',
      isIncoming:   true,
      autoAccept:   data._accept === 'true',
      offer:        undefined,
    });
  } else if (type === 'message') {
    navigate('Chat', { partnerId: data.sender_id, partnerName: data.sender_name ?? '' });
  } else {
    navigate('Notifications', undefined);
  }
}

// ── Backend token registration ────────────────────────────────────────────────
async function _registerToken(token: string): Promise<void> {
  try {
    await apiClient.post(Endpoints.notifications.deviceToken, {
      token, platform: Platform.OS,
    });
    console.log('[FCM] device token registered');
  } catch (e: any) {
    console.warn('[FCM] register token failed:', e?.status, e?.message);
  }
}

async function _unregisterToken(token: string): Promise<void> {
  try {
    await apiClient.post(Endpoints.notifications.deviceToken + '/remove', {
      token, platform: Platform.OS,
    });
  } catch {}
}

// ── Main setup (call after login) ─────────────────────────────────────────────
export async function setupFCM(): Promise<void> {
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

  // Foreground FCM — tout ignoré : WebSocket + toast custom gèrent appels et messages
  onMessage(m, async (_remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
    // Rien — le WebSocket déclenche le toast pour les appels et messages en foreground
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

  // Acceptation depuis background — lire l'intention stockée dans MMKV
  const pendingRaw = storage.getItem('pending_call_accept');
  if (pendingRaw) {
    storage.removeItem('pending_call_accept');
    try {
      const pending = JSON.parse(pendingRaw);
      const sdpRaw  = storage.getItem('pending_call_offer_sdp');
      const offer   = sdpRaw ? JSON.parse(sdpRaw) : undefined;
      if (sdpRaw) storage.removeItem('pending_call_offer_sdp');
      navigate('Call', {
        partnerId:    pending.caller_id,
        partnerName:  pending.caller_name ?? 'Inconnu',
        partnerAvatar: pending.caller_avatar || null,
        callType:     pending.call_type ?? 'voice',
        isIncoming:   true,
        autoAccept:   true,
        offer,
      });
    } catch {}
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
