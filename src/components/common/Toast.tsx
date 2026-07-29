import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { toastService, ToastState, ToastType } from '../../services/toastService';

const { width: SW } = Dimensions.get('window');
const TOAST_W = SW - 32;

const ICON_BY_TYPE: Record<ToastType, string> = {
  success: 'check-circle',
  error: 'x-circle',
  info: 'info',
  warning: 'alert-triangle',
};

export const Toast: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [toast, setToast] = React.useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    opacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(-120, { duration: 250 }, () => {
      runOnJS(setToast)(null);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = toastService.subscribe(state => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (!state) {
        dismiss();
        return;
      }
      setToast(state);
      translateY.value = -120;
      opacity.value = 0;
      translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 180 });
    });
    return unsubscribe;
  }, [dismiss]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!toast) return null;

  const color = colors[toast.type];
  const colorBg = colors[`${toast.type}Bg` as const];

  return (
    <Animated.View
      style={[styles.container, { top: insets.top + 8, left: 16 }, animStyle]}
      pointerEvents="box-none"
    >
      <TouchableOpacity activeOpacity={0.92} onPress={() => toastService.hide()} style={styles.touchable}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={[styles.leftBar, { backgroundColor: color }]} />
          <View style={[styles.iconWrap, { backgroundColor: colorBg }]}>
            <Icon name={ICON_BY_TYPE[toast.type]} size={18} color={color} />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {toast.title}
            </Text>
            {!!toast.message && (
              <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
                {toast.message}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: TOAST_W,
    zIndex: 10000,
    elevation: 100,
  },
  touchable: { borderRadius: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingRight: 14,
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
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 12, lineHeight: 17 },
});
