/**
 * FCM + Notifee — push notifications (messages, activité, abonnements…).
 * Les appels 1‑à‑1 ont été retirés de l'app (migrés vers une app dédiée).
 *
 * Call setupFCM() once after login.
 * Call removeFCMToken() on logout.
 */
import {
  getMessaging,
  requestPermission,
  getToken,
  onTokenRefresh,
  onNotificationOpenedApp,
  getInitialNotification,
  deleteToken,
} from '@react-native-firebase/messaging';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import type { NotificationAndroid } from '@notifee/react-native';
import { Platform } from 'react-native';
import { apiClient } from '../api/client';
import { Endpoints } from '../api/endpoints';
import { navigate } from '../navigation/navigationRef';

// ── Channel IDs — incrémenter le suffixe pour forcer recréation si besoin ─────
const CHANNEL_MESSAGES      = 'messages_v6';
const CHANNEL_NOTIFS        = 'notifications_v6';
// Publications des personnes suivies (post/reel/story) — signal discret,
// sans son ni vibration, pour ne pas interrompre l'utilisateur.
const CHANNEL_FRIEND_ACTIVITY = 'friend_activity_v1';

async function _createChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Supprimer les anciens canaux (dont ceux d'appel, désormais inutilisés)
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
  await notifee.deleteChannel('incoming_calls_v6').catch(() => {});

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

// ── Imagerie Android commune : avatar rond (largeIcon) + grande image ─────────
// Donne à TOUTES les notifs le rendu WhatsApp/TikTok : photo de profil de
// l'acteur en pastille ronde à gauche, et grande image dépliable quand le
// contenu en a une (post/reel/story/pièce jointe image).
//
// Notifee accepte directement une URL http(s) pour `largeIcon` et pour
// `style.picture` sur Android (il télécharge et met en cache lui-même) — pas
// besoin de gérer un download/fichier local ici.
//
// Champs lus dans le payload FCM (envoyés par le backend) :
//   - actor_avatar / sender_avatar / caller_avatar  → largeIcon rond
//   - image                                         → BigPictureStyle
function _androidImagery(
  data: Record<string, string> | undefined,
  bodyForStyle?: string,
): Partial<NotificationAndroid> {
  if (!data) return {};
  const avatar =
    data.actor_avatar || data.sender_avatar || data.caller_avatar || '';
  const picture = data.image || '';

  const hasAvatar  = !!avatar  && /^https?:\/\//i.test(avatar);
  const hasPicture = !!picture && /^https?:\/\//i.test(picture);

  const out: Partial<NotificationAndroid> = {};
  if (hasAvatar) {
    out.largeIcon = avatar;
    out.circularLargeIcon = true; // pastille ronde façon WhatsApp
  }
  if (hasPicture) {
    out.style = {
      type:      AndroidStyle.BIGPICTURE,
      picture,
      // Android masque le largeIcon quand la notif est dépliée : on le re-pose
      // ici pour que l'avatar reste visible replié ET déplié (comme WhatsApp).
      // `null` = pas d'avatar → on laisse Android masquer (comportement voulu).
      ...(hasAvatar ? { largeIcon: avatar } : {}),
      ...(bodyForStyle ? { summary: bodyForStyle } : {}),
    };
  }
  return out;
}

// ── Handle notification action press (background) ────────────────────────────
export function setupNotifeeBackgroundHandler(): void {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS || type === EventType.DISMISSED) {
      await notifee.cancelNotification(detail.notification!.id!);
    }
    // Pour 'default' (tap) : l'app s'ouvre via getInitialNotification
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
  const title = (data.title as string) ?? 'Gofolyx';
  const body  = (data.body  as string) ?? '';

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
        smallIcon:    'ic_notification',
        pressAction:  { id: 'default', launchActivity: 'default' },
        ..._androidImagery(data as Record<string, string>, msgBody),
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
        ..._androidImagery(data as Record<string, string>, body),
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
        ..._androidImagery(data as Record<string, string>, body),
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
        smallIcon:   'ic_notification',
        pressAction: { id: 'default', launchActivity: 'default' },
        ..._androidImagery(data as Record<string, string>, body),
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
      smallIcon:    'ic_notification',
      pressAction:  { id: 'default', launchActivity: 'default' },
      ..._androidImagery(data as Record<string, string>, body),
    },
    data: data as Record<string, string>,
  });
}


// ── Handle notification tap (foreground + background open) ───────────────────
function _handleNotificationOpen(data?: Record<string, string>): void {
  if (!data) return;
  const type = data.type;
  if (type === 'message') {
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

  // App opened from background notification tap
  onNotificationOpenedApp(m, (msg: FirebaseMessagingTypes.RemoteMessage) => {
    _handleNotificationOpen(msg.data as Record<string, string>);
  });

  // Notifee foreground action handler — tap sur la notif → navigation
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'default') {
      const data = detail.notification?.data as Record<string, string> | undefined;
      notifee.cancelNotification(detail.notification!.id!);
      _handleNotificationOpen(data);
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
