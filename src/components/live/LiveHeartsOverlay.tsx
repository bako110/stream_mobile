import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { View, Animated, StyleSheet, Easing, Dimensions } from 'react-native';

interface FloatingHeart {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  size: number;
  colorIdx: number;
  emojiIdx: number;
}

const COLORS = ['#FF2D55', '#FF6B6B', '#FF4081', '#FF8A80', '#F06292', '#E91E63'];
const HEARTS = ['❤️', '🧡', '💛', '💜', '💙', '🩷'];
const { height: SCREEN_H } = Dimensions.get('window');

export interface LiveHeartsOverlayRef {
  spawn: (count?: number) => void;
}

// Coeurs qui montent depuis le bas-droite de l'ecran vers le haut, façon TikTok
// Live — point d'ancrage FIXE (independant du bouton compteur, qui reste dans
// la barre du haut). La derive laterale part vers la gauche pendant la montee.
export const LiveHeartsOverlay = forwardRef<LiveHeartsOverlayRef>((_props, ref) => {
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const nextId = React.useRef(0);

  const spawnOne = useCallback((delay: number) => {
    const id = nextId.current++;
    const x       = new Animated.Value(0);
    const y       = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale   = new Animated.Value(0);

    // Derive vers la gauche en montant, amplitude variable pour un effet organique
    const targetX = -(30 + Math.random() * 90);
    const targetY = -(SCREEN_H * 0.45 + Math.random() * SCREEN_H * 0.25);

    const heart: FloatingHeart = {
      id, x, y, opacity, scale,
      size: 22 + Math.random() * 12,
      colorIdx: id % COLORS.length,
      emojiIdx: id % HEARTS.length,
    };
    setHearts(prev => [...prev.slice(-24), heart]);

    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
        Animated.timing(x, {
          toValue: targetX,
          duration: 1600 + Math.random() * 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: targetY,
          duration: 1700 + Math.random() * 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(900),
          Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]),
      ]),
    ]).start(() => setHearts(prev => prev.filter(h => h.id !== id)));
  }, []);

  const spawn = useCallback((count: number = 1) => {
    const n = Math.min(count, 8);
    for (let i = 0; i < n; i++) spawnOne(i * 90);
  }, [spawnOne]);

  useImperativeHandle(ref, () => ({ spawn }), [spawn]);

  return (
    <View style={st.root} pointerEvents="none">
      {hearts.map(h => (
        <Animated.Text
          key={h.id}
          style={[
            st.heart,
            {
              fontSize: h.size,
              color: COLORS[h.colorIdx],
              transform: [
                { translateX: h.x },
                { translateY: h.y },
                { scale: h.scale },
              ],
              opacity: h.opacity,
            },
          ]}
        >
          {HEARTS[h.emojiIdx]}
        </Animated.Text>
      ))}
    </View>
  );
});

const st = StyleSheet.create({
  root: {
    position: 'absolute',
    bottom: 90,
    right: 24,
    width: 10,
    height: 10,
  },
  heart: {
    position: 'absolute',
    zIndex: 60,
  },
});
