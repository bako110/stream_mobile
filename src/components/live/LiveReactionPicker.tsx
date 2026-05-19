import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

// ── Réactions disponibles ────────────────────────────────────────────────────

export const REACTIONS = [
  { emoji: '❤️' },
  { emoji: '😂' },
  { emoji: '😮' },
  { emoji: '😢' },
  { emoji: '😡' },
  { emoji: '🔥' },
  { emoji: '👏' },
  { emoji: '🎉' },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface FloatingEmoji {
  id: number;
  emoji: string;
  startX: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  size: number;
}

export interface LiveReactionPickerRef {
  // Déclenche un emoji flottant depuis l'extérieur (WS remote)
  triggerRemote: (emoji: string) => void;
}

interface Props {
  onReact: (emoji: string) => void;
}

// ── Composant ────────────────────────────────────────────────────────────────

export const LiveReactionPicker = forwardRef<LiveReactionPickerRef, Props>(
  ({ onReact }, ref) => {
    const [open, setOpen] = useState(false);
    // Les flottants sont rendus dans un View absoluteFill séparé
    const [floaters, setFloaters] = useState<FloatingEmoji[]>([]);
    const nextId = useRef(0);
    const openAnim = useRef(new Animated.Value(0)).current;

    const togglePicker = useCallback(() => {
      const toValue = open ? 0 : 1;
      Animated.spring(openAnim, { toValue, friction: 6, tension: 120, useNativeDriver: true }).start();
      setOpen(o => !o);
    }, [open, openAnim]);

    // Spawn depuis le bas-droit de l'écran, monte vers le haut style TikTok
    const spawnEmoji = useCallback((emoji: string) => {
      const id = nextId.current++;
      const x       = new Animated.Value(0);
      const y       = new Animated.Value(0);
      const opacity = new Animated.Value(1);
      const scale   = new Animated.Value(0);
      // Légère variation horizontale autour du centre
      const driftX  = (Math.random() - 0.5) * 80;
      const driftY  = -(SH * 0.55 + Math.random() * SH * 0.2);
      const size    = 28 + Math.random() * 12;

      setFloaters(prev => [...prev.slice(-20), { id, emoji, startX: 0, x, y, opacity, scale, size }]);

      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(x,       { toValue: driftX, duration: 1000 + Math.random() * 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y,       { toValue: driftY, duration: 1200 + Math.random() * 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(500),
          Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]),
      ]).start(() => setFloaters(prev => prev.filter(f => f.id !== id)));
    }, []);

    const handleSelect = useCallback((emoji: string) => {
      spawnEmoji(emoji);
      setOpen(false);
      Animated.spring(openAnim, { toValue: 0, friction: 6, tension: 120, useNativeDriver: true }).start();
      onReact(emoji);
    }, [spawnEmoji, onReact, openAnim]);

    const triggerRemote = useCallback((emoji: string) => {
      spawnEmoji(emoji);
    }, [spawnEmoji]);

    useImperativeHandle(ref, () => ({ triggerRemote }), [triggerRemote]);

    return (
      <>
        {/* ── Emojis flottants — rendu au niveau racine via absoluteFill ── */}
        {floaters.length > 0 && (
          <View style={st.floatLayer} pointerEvents="none">
            {floaters.map(f => (
              <Animated.Text
                key={f.id}
                style={[
                  st.floater,
                  {
                    fontSize: f.size,
                    transform: [
                      { translateX: f.x },
                      { translateY: f.y },
                      { scale: f.scale },
                    ],
                    opacity: f.opacity,
                  },
                ]}
              >
                {f.emoji}
              </Animated.Text>
            ))}
          </View>
        )}

        {/* ── Bouton + picker ── */}
        <View style={st.container}>
          {/* Panel emojis — s'ouvre vers la gauche */}
          {open && (
            <Animated.View
              style={[
                st.picker,
                {
                  opacity: openAnim,
                  transform: [
                    { scale: openAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                    { translateY: openAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                  ],
                },
              ]}
            >
              {REACTIONS.map(r => (
                <TouchableOpacity
                  key={r.emoji}
                  style={st.reactionBtn}
                  onPress={() => handleSelect(r.emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={st.reactionEmoji}>{r.emoji}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Bouton déclencheur */}
          <TouchableOpacity style={st.triggerBtn} onPress={togglePicker} activeOpacity={0.75}>
            <Text style={st.triggerEmoji}>{open ? '✕' : '😊'}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  },
);

// ── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // Couche absoluteFill — ancrée centre-bas de l'écran, les emojis montent au centre
  floatLayer: {
    position: 'absolute',
    bottom: SH * 0.12,
    left: SW / 2 - 30,   // centré horizontalement
    width: 60,
    height: 1,
    zIndex: 999,
    overflow: 'visible',
  },
  floater: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    zIndex: 999,
  },

  container: {
    alignItems: 'center',
    gap: 0,
  },
  picker: {
    position: 'absolute',
    bottom: 58,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    width: Math.min(104, SW * 0.28),
    backgroundColor: 'rgba(18,18,18,0.92)',
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 100,
  },
  reactionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 24,
  },
  triggerBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  triggerEmoji: {
    fontSize: 22,
  },
});
