import React, { useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, Vibration,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sound from 'react-native-sound';
import { useWs, WsPayload } from '../../context/WebSocketContext';
import { useTheme } from '../../hooks/useTheme';
import { navigate } from '../../navigation/navigationRef';

Sound.setCategory('Playback', true);
const _msgSound   = new Sound('message_sound.mp3',   Sound.MAIN_BUNDLE, () => {});
const _notifSound = new Sound('notification_sound.mp3', Sound.MAIN_BUNDLE, () => {});

type ToastKind = 'notification' | 'message';

interface ToastData {
  id:        string;
  kind:      ToastKind;
  title:     string;
  body:      string;
  icon:      string;
  grad:      [string, string];
  avatarUrl?:  string | null;
  ref_id?:     string | null;
  ref_type?:   string | null;
  partnerId?:  string;
  partnerName?: string;
}

const ICON_MAP: Record<string, string> = {
  follow:           'user-plus',
  reaction:         'heart',
  comment:          'message-circle',
  mention:          'at-sign',
  profile_view:     'eye',
  story_view:       'eye',
  concert_created:  'music',
  event_created:    'calendar',
  concert_going:    'headphones',
  event_going:      'map-pin',
  community_joined: 'users',
  reel_posted:      'film',
  subscription:     'star',
  welcome:          'gift',
  ticket:           'tag',
  concert_live:     'radio',
  system:           'bell',
};

const GRAD_MAP: Record<string, [string, string]> = {
  follow:           ['#3B82F6', '#60A5FA'],
  reaction:         ['#EF4444', '#FCA5A5'],
  comment:          ['#3B82F6', '#93C5FD'],
  mention:          ['#06B6D4', '#67E8F9'],
  profile_view:     ['#F59E0B', '#FCD34D'],
  story_view:       ['#F59E0B', '#FCD34D'],
  concert_created:  ['#7B3FF2', '#A78BFA'],
  event_created:    ['#E0389A', '#F472B6'],
  concert_going:    ['#FF7A2F', '#FCA5A5'],
  event_going:      ['#36D9A0', '#6EE7B7'],
  community_joined: ['#9B65F5', '#C4B5FD'],
  reel_posted:      ['#E0389A', '#FB7185'],
  subscription:     ['#36D9A0', '#6EE7B7'],
  welcome:          ['#7B3FF2', '#E0389A'],
  ticket:           ['#FF7A2F', '#FCD34D'],
  concert_live:     ['#EF4444', '#FF7A2F'],
};

const DEFAULT_GRAD: [string, string] = ['#7B3FF2', '#9B65F5'];
const { width: SW } = Dimensions.get('window');
const TOAST_W = SW - 32;

export const NotificationToast: React.FC = () => {
  const { addListener, removeListener } = useWs();
  const { theme }  = useTheme();
  const { colors } = theme;
  const insets     = useSafeAreaInsets();

  const [toast, setToast] = React.useState<ToastData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(-120);
  const opacity    = useSharedValue(0);

  const dismiss = useCallback(() => {
    Vibration.cancel();
    opacity.value    = withTiming(0, { duration: 200 });
    translateY.value = withTiming(-120, { duration: 250 }, () => {
      runOnJS(setToast)(null);
    });
  }, []);

  const show = useCallback((data: ToastData) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(data);
    translateY.value = -120;
    opacity.value    = 0;
    translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
    opacity.value    = withTiming(1, { duration: 180 });
    if (data.kind === 'message') {
      try { _msgSound.stop(); _msgSound.play(); } catch {}
    } else {
      try { _notifSound.stop(); _notifSound.play(); } catch {}
    }
    Vibration.vibrate([0, 150]);
    timerRef.current = setTimeout(dismiss, 4_000);
  }, [dismiss]);

  useEffect(() => {
    const onWsEvent = (payload: WsPayload) => {
      if (payload.type === 'notification') {
        const notifType = payload.notification_type ?? 'system';
        show({
          id:       payload.id ?? String(Date.now()),
          kind:     'notification',
          title:    payload.title ?? 'Notification',
          body:     payload.body  ?? '',
          icon:     ICON_MAP[notifType]  ?? 'bell',
          grad:     GRAD_MAP[notifType]  ?? DEFAULT_GRAD,
          ref_id:   payload.ref_id   ?? null,
          ref_type: payload.ref_type ?? null,
        });
        return;
      }

      if (payload.type === 'message' && payload._showToast) {
        show({
          id:          String(Date.now()),
          kind:        'message',
          title:       payload.sender_name ?? 'Nouveau message',
          body:        payload.content ?? '',
          icon:        'message-circle',
          grad:        ['#3B82F6', '#60A5FA'],
          avatarUrl:   payload.sender_avatar ?? null,
          partnerId:   payload.sender_id,
          partnerName: payload.sender_name,
        });
        return;
      }

      // call_offer et call_hangup gérés par Notifee full-screen uniquement
    };

    addListener(onWsEvent);
    return () => removeListener(onWsEvent);
  }, [addListener, removeListener, show]);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const handlePress = () => {
    if (!toast) return;
    dismiss();
    if (toast.kind === 'message' && toast.partnerId) {
      navigate('Chat', { partnerId: toast.partnerId, partnerName: toast.partnerName ?? '' });
    } else if (toast.ref_type === 'concert' && toast.ref_id) {
      navigate('ConcertDetail', { concertId: toast.ref_id });
    } else if (toast.ref_type === 'event' && toast.ref_id) {
      navigate('EventDetail', { eventId: toast.ref_id });
    } else if (toast.ref_type === 'reel' && toast.ref_id) {
      navigate('Reels', { initialReelId: toast.ref_id });
    } else {
      navigate('Notifications', undefined);
    }
  };

  if (!toast) return null;

  return (
    <Animated.View
      style={[styles.container, { top: insets.top + 8, left: 16 }, animStyle]}
      pointerEvents="box-none"
    >
      <TouchableOpacity activeOpacity={0.92} onPress={handlePress} style={styles.touchable}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <LinearGradient colors={toast.grad} style={styles.leftBar} />
          {toast.avatarUrl ? (
            <Image source={{ uri: toast.avatarUrl }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={toast.grad} style={styles.iconWrap}>
              <Icon name={toast.icon} size={16} color="#fff" />
            </LinearGradient>
          )}
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {toast.title}
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={1}>
              {toast.body}
            </Text>
          </View>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="x" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width:    TOAST_W,
    zIndex:   9999,
    elevation: 99,
  },
  touchable: { borderRadius: 16 },
  card: {
    flexDirection: 'row',
    alignItems:    'center',
    borderRadius:  16,
    paddingRight:  14,
    paddingVertical: 12,
    gap: 10,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  leftBar: {
    width:  4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginLeft: 0,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
  },
  textWrap: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '700' },
  body:  { fontSize: 12, lineHeight: 17 },
});
