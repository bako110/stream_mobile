/**
 * ZoomableImage — image plein écran avec pinch-to-zoom, pan (une fois zoomée) et
 * double-tap pour zoomer/dézoomer rapidement. À utiliser dans toutes les visionneuses
 * plein écran (posts, chat, stories, bannières/avatars) pour un comportement uniforme.
 */
import React, { useCallback } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2.5;

interface ZoomableImageProps {
  uri: string;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  onZoomChange?: (zoomed: boolean) => void;
}

export const ZoomableImage: React.FC<ZoomableImageProps> = ({ uri, width, height, style, onZoomChange }) => {
  const scale      = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX     = useSharedValue(0);
  const savedY     = useSharedValue(0);

  const notifyZoom = useCallback((zoomed: boolean) => { onZoomChange?.(zoomed); }, [onZoomChange]);

  const clampTranslation = (s: number) => {
    'worklet';
    const maxX = Math.max(0, (width  * (s - 1)) / 2);
    const maxY = Math.max(0, (height * (s - 1)) / 2);
    translateX.value = Math.min(maxX, Math.max(-maxX, translateX.value));
    translateY.value = Math.min(maxY, Math.max(-maxY, translateY.value));
  };

  const reset = () => {
    'worklet';
    scale.value      = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value      = 0;
    savedY.value      = 0;
    runOnJS(notifyZoom)(false);
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        reset();
      } else {
        savedScale.value = scale.value;
        clampTranslation(scale.value);
        runOnJS(notifyZoom)(true);
      }
    });

  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onUpdate(e => {
      if (scale.value <= 1) return;
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) return;
      clampTranslation(scale.value);
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
      } else {
        scale.value      = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(notifyZoom)(true);
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[{ width, height, overflow: 'hidden' }, style]}>
        <Animated.Image
          source={{ uri }}
          resizeMode="contain"
          style={[StyleSheet.absoluteFill, animatedStyle]}
        />
      </Animated.View>
    </GestureDetector>
  );
};
