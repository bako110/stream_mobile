import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
} from 'react-native';

interface FloatingHeart {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  size: number;
}

const COLORS = ['#FF2D55', '#FF6B6B', '#FF4081', '#FF8A80', '#F06292', '#E91E63'];
const HEARTS = ['❤️', '🧡', '💛', '💜', '💙', '🩷'];

export interface LiveLikeButtonRef {
  trigger: () => void;
  // Anime un coeur venant d'un autre utilisateur (sans déclencher onLike)
  triggerRemote: () => void;
}

interface Props {
  total: number;
  onLike: () => void;
}

export const LiveLikeButton = forwardRef<LiveLikeButtonRef, Props>(({ total, onLike }, ref) => {
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  // displayCount suit total (source de vérité WS) + bump optimiste local
  const [bump, setBump] = useState(0);
  const displayCount = total + bump;
  const counterAnim = useRef(new Animated.Value(1)).current;
  const nextId = useRef(0);

  const spawnHeart = useCallback(() => {
    const id = nextId.current++;
    const x       = new Animated.Value(0);
    const y       = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale   = new Animated.Value(0);

    const targetX = (Math.random() - 0.5) * 60;
    const targetY = -(80 + Math.random() * 160);

    setHearts(prev => [...prev.slice(-20), { id, x, y, opacity, scale, size: 22 + Math.random() * 12 }]);

    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.timing(x,       { toValue: targetX, duration: 800 + Math.random() * 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(y,       { toValue: targetY, duration: 900 + Math.random() * 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start(() => setHearts(prev => prev.filter(h => h.id !== id)));
  }, []);

  const trigger = useCallback(() => {
    // Bump optimiste : +1 local en attendant la confirmation WS
    setBump(b => b + 1);
    counterAnim.setValue(1.4);
    Animated.spring(counterAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    spawnHeart();
    onLike();
  }, [spawnHeart, onLike, counterAnim]);

  const triggerRemote = useCallback(() => {
    // WS recu d'un autre viewer : total sera incrémenté par le parent, pas de bump
    // On remet bump à 0 si on était en avance (WS confirme notre propre like)
    setBump(b => Math.max(0, b - 1));
    counterAnim.setValue(1.3);
    Animated.spring(counterAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    spawnHeart();
  }, [spawnHeart, counterAnim]);

  useImperativeHandle(ref, () => ({ trigger, triggerRemote }), [trigger, triggerRemote]);

  return (
    <View style={st.root} pointerEvents="box-none">
      {hearts.map(h => (
        <Animated.Text
          key={h.id}
          style={[
            st.floatHeart,
            {
              fontSize: h.size,
              color: COLORS[h.id % COLORS.length],
              transform: [
                { translateX: h.x },
                { translateY: h.y },
                { scale: h.scale },
              ],
              opacity: h.opacity,
            },
          ]}
        >
          {HEARTS[h.id % HEARTS.length]}
        </Animated.Text>
      ))}

      <Animated.Text style={[st.count, { transform: [{ scale: counterAnim }] }]}>
        {formatCount(displayCount)}
      </Animated.Text>

      <TouchableOpacity onPress={trigger} activeOpacity={0.7} style={st.btn}>
        <Text style={st.heartIcon}>❤️</Text>
      </TouchableOpacity>
    </View>
  );
});

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const st = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 2,
  },
  floatHeart: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    zIndex: 50,
  },
  count: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  btn: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  heartIcon: { fontSize: 22 },
});
