/**
 * ZoomableImage — image plein écran avec pinch-to-zoom, pan (une fois zoomée) et
 * double-tap pour zoomer/dézoomer rapidement. À utiliser dans toutes les visionneuses
 * plein écran (posts, chat, bannières/avatars) pour un comportement uniforme.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
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
  // Le Pan doit rester desactive tant que l'image n'est pas zoomee, sinon il
  // "gagne" le geste devant le swipe horizontal du carrousel parent (FlatList)
  // des le premier pixel de mouvement, meme s'il ne deplace rien lui-meme.
  const [panEnabled, setPanEnabled] = useState(false);

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setPanEnabled(zoomed);
    onZoomChange?.(zoomed);
  }, [onZoomChange]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      const next = savedScale.value * e.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    })
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1) {
        scale.value      = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value      = 0;
        savedY.value      = 0;
        runOnJS(handleZoomChange)(false);
        return;
      }
      savedScale.value = scale.value;
      const maxX = Math.max(0, (width  * (scale.value - 1)) / 2);
      const maxY = Math.max(0, (height * (scale.value - 1)) / 2);
      translateX.value = Math.min(maxX, Math.max(-maxX, translateX.value));
      translateY.value = Math.min(maxY, Math.max(-maxY, translateY.value));
      savedX.value = translateX.value;
      savedY.value = translateY.value;
      runOnJS(handleZoomChange)(true);
    });

  const panGesture = Gesture.Pan()
    .enabled(panEnabled)
    .averageTouches(true)
    .onUpdate((e) => {
      'worklet';
      if (scale.value <= 1) return;
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1) return;
      const maxX = Math.max(0, (width  * (scale.value - 1)) / 2);
      const maxY = Math.max(0, (height * (scale.value - 1)) / 2);
      translateX.value = Math.min(maxX, Math.max(-maxX, translateX.value));
      translateY.value = Math.min(maxY, Math.max(-maxY, translateY.value));
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1) {
        scale.value      = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value      = 0;
        savedY.value      = 0;
        runOnJS(handleZoomChange)(false);
      } else {
        scale.value      = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(handleZoomChange)(true);
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

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
