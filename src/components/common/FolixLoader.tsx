/**
 * FolixLoader — deux modes :
 *
 * Mode "bar" (défaut) — barre serpent en haut de l'écran, pour les pages
 *   {loading && <FolixLoader />}
 *   <FolixLoader color="#7B3FF2" />
 *
 * Mode "reel" — spinner centré plein écran sombre, pour les reels/vidéos
 *   <FolixLoader variant="reel" />
 *   <FolixLoader variant="reel" color="#ffffff" />
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const W = Dimensions.get('window').width;

// Convertit un hex en rgba — robuste : gère #RGB, #RRGGBB, valeurs invalides
function hexToRgba(hex: string, alpha: number): string {
  try {
    let h = (hex ?? '#7B3FF2').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (h.length > 6)   h = h.substring(0, 6);
    if (h.length !== 6) return `rgba(123,63,242,${alpha})`;
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(123,63,242,${alpha})`;
    return `rgba(${r},${g},${b},${alpha})`;
  } catch {
    return `rgba(123,63,242,${alpha})`;
  }
}

interface Props {
  color?:   string;
  height?:  number;
  fullScreen?: boolean;
  variant?: 'bar' | 'reel';
}

// ── Spinner centré style TikTok — pour les reels ──────────────────────────────
const ReelSpinner: React.FC<{ color: string }> = ({ color }) => {
  const rot = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rot, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.8, duration: 450, useNativeDriver: true }),
      ])
    ).start();
    return () => { rot.stopAnimation(); scale.stopAnimation(); };
  }, []);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const SIZE = 44;
  const STROKE = 3.5;
  const r = hexToRgba(color, 1);
  const rFade = hexToRgba(color, 0.25);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.reelCenter}>
        <Animated.View style={[
          styles.spinner,
          {
            width: SIZE, height: SIZE, borderRadius: SIZE / 2,
            borderWidth: STROKE,
            borderTopColor: r,
            borderRightColor: r,
            borderBottomColor: rFade,
            borderLeftColor: rFade,
            transform: [{ rotate }, { scale }],
          }
        ]} />
      </View>
    </View>
  );
};

// ── Barre serpent — pour les pages ────────────────────────────────────────────
export const FolixLoader: React.FC<Props> = ({
  color    = '#7B3FF2',
  height   = 3,
  fullScreen = false,
  variant  = 'bar',
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

  // Mode reel → spinner centré
  if (variant === 'reel') return <ReelSpinner color={color} />;

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-W * 1.2, W * 1.2],
  });

  const barWidth = W * 0.55;

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
    top: 0, left: 0, right: 0,
    overflow: 'hidden',
    zIndex: 9999,
  },
  barWrap: {
    position: 'absolute',
    top: 0,
  },
  reelCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    backgroundColor: 'transparent',
  },
});
