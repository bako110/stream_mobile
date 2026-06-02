/**
 * FolixLoader — barre serpent animée style TikTok/YouTube.
 * Une barre fine en haut de l'écran avec un dégradé qui avance en boucle.
 *
 * Usage :
 *   {loading && <FolixLoader />}
 *   <FolixLoader color="#7B3FF2" />
 *   <FolixLoader fullScreen />   ← centre aussi un fond semi-transparent
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const W = Dimensions.get('window').width;

// Convertit un hex #RRGGBB en rgba(r,g,b,a) — évite les bugs Android avec 'transparent' et hex 8 chiffres
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Props {
  color?: string;
  height?: number;
  fullScreen?: boolean;
}

export const FolixLoader: React.FC<Props> = ({
  color = '#7B3FF2',
  height = 3,
  fullScreen = false,
}) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
    return () => anim.stopAnimation();
  }, []);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-W * 1.2, W * 1.2],
  });

  const barWidth = W * 0.55;

  // Toutes les couleurs en rgba — Android ne supporte pas 'transparent' ni hex 8 chiffres
  const gradientColors = [
    hexToRgba(color, 0),
    hexToRgba(color, 0.6),
    hexToRgba(color, 1),
    hexToRgba(color, 0.6),
    hexToRgba(color, 0),
  ];

  const bar = (
    <View style={[styles.track, { height, backgroundColor: hexToRgba(color, 0.15) }]}>
      <Animated.View
        style={[styles.barWrap, { width: barWidth, height, transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: height / 2 }}
        />
      </Animated.View>
    </View>
  );

  if (!fullScreen) return bar;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bar}
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 9999,
  },
  barWrap: {
    position: 'absolute',
    top: 0,
  },
});
