/**
 * FCM + Notifee — push notifications & full-screen incoming call alerts.
 *
 * - Foreground: handled by WebSocket + NotificationToast (no FCM needed)
 * - Background/quit: FCM wakes the app, Notifee shows a full-screen call UI
 *
 * Call setupFCM() once after login.
 * Call removeFCMToken() on logout.
 */
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
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

// ── Channel IDs — incrémenter le suffixe pour forcer recréation si besoin ─────
const CHANNEL_CALLS    = 'incoming_calls_v2';
const CHANNEL_MESSAGES = 'messages_v2';
const CHANNEL_NOTIFS   = 'notifications_v2';

async function _createChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Supprimer les anciens canaux sans son
  await notifee.deleteChannel('incoming_calls').catch(() => {});
  await notifee.deleteChannel('messages').catch(() => {});
  await notifee.deleteChannel('notifications').catch(() => {});

  await notifee.createChannel({
    id:               CHANNEL_CALLS,
    name:             'Appels entrants',
    importance:       AndroidImportance.HIGH,
    visibility:       AndroidVisibility.PUBLIC,
    vibration:        true,
    vibrationPattern: [0, 500, 300, 500],
    sound:            'default',
  });
  await notifee.createChannel({
    id:               CHANNEL_MESSAGES,
    name:             'Messages',
    importance:       AndroidImportance.HIGH,
    visibility:       AndroidVisibility.PRIVATE,
    vibration:        true,
    vibrationPattern: [0, 300, 200, 300],
    sound:            'default',
  });
  await notifee.createChannel({
    id:               CHANNEL_NOTIFS,
    name:             'Notifications',
    importance:       AndroidImportance.HIGH,
    visibility:       AndroidVisibility.PRIVATE,
    vibration:        true,
    vibrationPattern: [0, 250],
    sound:            'default',
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
    body:  callType === 'video' ? 'Appel vidéo entrant' : 'Appel vocal entrant',
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
          title:    '❌ Refuser',
          pressAction: { id: 'decline' },
        },
        {
          title:    '✅ Accepter',
          pressAction: { id: 'accept', launchActivity: 'default' },
        },
      ],
      pressAction: { id: 'default', launchActivity: 'default' },
      sound: 'default',
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
      const data     = detail.notification?.data;
      if (actionId === 'decline') {
        await notifee.cancelNotification(detail.notification!.id!);
      } else if (actionId === 'accept' || actionId === 'default') {
        await notifee.cancelNotification(detail.notification!.id!);
        // App will open — navigate handled by getInitialNotification
      }
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
      (data.from         as string) ?? '',
      (data.caller_name  as string) ?? 'Appel entrant',
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
        sound:        'default',
        vibrationPattern: [0, 300, 200, 300],
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
      sound:        'default',
      vibrationPattern: [0, 250],
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
      partnerId:   data.caller_id   ?? data.from,
      partnerName: data.caller_name ?? '',
      callType:    (data.call_type as 'voice' | 'video') ?? 'voice',
      isIncoming:  true,
      offer:       undefined,
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

  const authStatus = await messaging().requestPermission();
  console.log('[FCM] authStatus=', authStatus);
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  if (!enabled) {
    console.log('[FCM] permission denied, push disabled');
    return;
  }

  const token = await messaging().getToken();
  console.log('[FCM] token=', token ? token.slice(0, 30) + '...' : 'null');
  if (token) await _registerToken(token);

  messaging().onTokenRefresh(_registerToken);

  // Foreground FCM message → Notifee uniquement pour les appels entrants
  // Messages et notifications génériques : gérés par le toast WebSocket (évite le double affichage)
  messaging().onMessage(async (remoteMessage) => {
    const type = remoteMessage.data?.type as string | undefined;
    if (type === 'call_offer') {
      await handleBackgroundFCM(remoteMessage);
    }
  });

  // App opened from background notification tap
  messaging().onNotificationOpenedApp((msg) => {
    _handleNotificationOpen(msg.data as Record<string, string>);
  });

  // Notifee foreground action handler
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (actionId === 'accept') {
        notifee.cancelNotification(detail.notification!.id!);
        _handleNotificationOpen(data);
      } else if (actionId === 'decline') {
        notifee.cancelNotification(detail.notification!.id!);
      } else if (actionId === 'default') {
        _handleNotificationOpen(data);
      }
    }
  });

  // App opened from quit state (FCM)
  const initial = await messaging().getInitialNotification();
  if (initial) _handleNotificationOpen(initial.data as Record<string, string>);

  // App opened from quit state (Notifee)
  const initialNotifee = await notifee.getInitialNotification();
  if (initialNotifee) {
    _handleNotificationOpen(initialNotifee.notification.data as Record<string, string>);
  }
}

export async function removeFCMToken(): Promise<void> {
  try {
    const token = await messaging().getToken();
    if (token) await _unregisterToken(token);
    await messaging().deleteToken();
  } catch {}
}
