import React, { useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, Vibration,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
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
  accent:    string;
  avatarUrl?:  string | null;
  ref_id?:     string | null;
  ref_type?:   string | null;
  partnerId?:  string;
  partnerName?: string;
  silent?:     boolean;
}

// Publications des personnes suivies — signal discret, pas d'alerte sonore
const SILENT_NOTIF_TYPES = new Set([
  'post_posted', 'reel_posted', 'story_posted', 'concert_created', 'event_created',
]);

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
  post_posted:      'file-text',
  story_posted:     'circle',
  subscription:     'star',
  welcome:          'gift',
  ticket:           'tag',
  concert_live:     'radio',
  system:           'bell',
};

// Une seule couleur d'accent par type — distingue les types de signal d'un
// coup d'œil (like=rouge, abonné=bleu...), jamais un dégradé décoratif à deux
// teintes (l'ancien GRAD_MAP gardait une 2e couleur jamais utilisée depuis le
// retrait des dégradés de l'app — code mort nettoyé ici).
const COLOR_MAP: Record<string, string> = {
  follow:           '#3B82F6',
  reaction:         '#EF4444',
  comment:          '#3B82F6',
  mention:          '#06B6D4',
  profile_view:     '#F59E0B',
  story_view:       '#F59E0B',
  concert_created:  '#7B3FF2',
  event_created:    '#E0389A',
  concert_going:    '#FF7A2F',
  event_going:      '#36D9A0',
  community_joined: '#9B65F5',
  reel_posted:      '#E0389A',
  post_posted:      '#7B3FF2',
  story_posted:     '#F59E0B',
  subscription:     '#36D9A0',
  welcome:          '#7B3FF2',
  ticket:           '#FF7A2F',
  concert_live:     '#EF4444',
};

const DEFAULT_ACCENT = '#7B3FF2';
const { width: SW } = Dimensions.get('window');
const TOAST_W = SW - 32;

export const NotificationToast: React.FC = () => {
  const { addListener, removeListener } = useWs();
  const { theme }  = useTheme();
  const { colors } = theme;
  const insets     = useSafeAreaInsets();

  const [toast, setToast] = React.useState<ToastData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(-140);
  const opacity    = useSharedValue(0);
  const scale      = useSharedValue(0.94);

  const dismiss = useCallback(() => {
    Vibration.cancel();
    opacity.value    = withTiming(0, { duration: 180 });
    translateY.value = withTiming(-140, { duration: 220 }, () => {
      runOnJS(setToast)(null);
    });
  }, []);

  const show = useCallback((data: ToastData) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(data);
    translateY.value = -140;
    opacity.value    = 0;
    scale.value      = 0.94;
    translateY.value = withSpring(0, { damping: 16, stiffness: 180 });
    opacity.value    = withTiming(1, { duration: 200 });
    scale.value      = withSpring(1, { damping: 14, stiffness: 180 });
    if (!data.silent) {
      if (data.kind === 'message') {
        try { _msgSound.stop(); _msgSound.play(); } catch {}
      } else {
        try { _notifSound.stop(); _notifSound.play(); } catch {}
      }
      Vibration.vibrate([0, 150]);
    }
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
          icon:      ICON_MAP[notifType]  ?? 'bell',
          accent:    COLOR_MAP[notifType] ?? DEFAULT_ACCENT,
          ref_id:    payload.ref_id   ?? null,
          ref_type:  payload.ref_type ?? null,
          silent:    SILENT_NOTIF_TYPES.has(notifType),
          avatarUrl: payload.image_url ?? payload.actor?.avatar_url ?? null,
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
          accent:      '#3B82F6',
          avatarUrl:   payload.sender_avatar ?? null,
          partnerId:   payload.sender_id,
          partnerName: payload.sender_name,
        });
        return;
      }
    };

    addListener(onWsEvent);
    return () => removeListener(onWsEvent);
  }, [addListener, removeListener, show]);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
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
      navigate('Tabs', { screen: 'Reels', params: { initialReelId: toast.ref_id } });
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
      <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.touchable}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {toast.avatarUrl ? (
            <View style={[styles.avatarRing, { borderColor: toast.accent }]}>
              <Image source={{ uri: toast.avatarUrl }} style={styles.avatar} />
            </View>
          ) : (
            <View style={[styles.iconWrap, { backgroundColor: `${toast.accent}1A` }]}>
              <Icon name={toast.icon} size={18} color={toast.accent} />
            </View>
          )}
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {toast.title}
            </Text>
            {!!toast.body && (
              <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={1}>
                {toast.body}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.closeBtn}>
            <Icon name="x" size={14} color={colors.textTertiary} />
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
  touchable: { borderRadius: 18 },
  card: {
    flexDirection: 'row',
    alignItems:    'center',
    borderRadius:  18,
    borderWidth:   1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 11,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  avatarRing: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1, gap: 1 },
  title: { fontSize: 13.5, fontWeight: '700' },
  body:  { fontSize: 12, lineHeight: 16 },
  closeBtn: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
});
