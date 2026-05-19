import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ── Réactions disponibles ────────────────────────────────────────────────────

export const REACTIONS = [
  { emoji: '❤️',  label: 'Amour' },
  { emoji: '😂',  label: 'Rires' },
  { emoji: '😮',  label: 'Surpris' },
  { emoji: '😢',  label: 'Triste' },
  { emoji: '😡',  label: 'Colère' },
  { emoji: '🔥',  label: 'Feu' },
  { emoji: '👏',  label: 'Bravo' },
  { emoji: '🎉',  label: 'Fête' },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  size: number;
}

export interface LiveReactionPickerRef {
  triggerRemote: (emoji: string) => void;
}

interface Props {
  onReact: (emoji: string) => void;
}

// ── Composant ────────────────────────────────────────────────────────────────

export const LiveReactionPicker = forwardRef<LiveReactionPickerRef, Props>(
  ({ onReact }, ref) => {
    const [open, setOpen] = useState(false);
    const [floaters, setFloaters] = useState<FloatingEmoji[]>([]);
    const nextId = useRef(0);
    const openAnim = useRef(new Animated.Value(0)).current;

    // Anime l'apparition / disparition du picker
    const togglePicker = useCallback(() => {
      const toValue = open ? 0 : 1;
      Animated.spring(openAnim, {
        toValue,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }).start();
      setOpen(o => !o);
    }, [open, openAnim]);

    // Lance un emoji flottant vers le haut
    const spawnEmoji = useCallback((emoji: string) => {
      const id = nextId.current++;
      const x = new Animated.Value(0);
      const y = new Animated.Value(0);
      const opacity = new Animated.Value(1);
      const scale = new Animated.Value(0);

      const targetX = (Math.random() - 0.5) * 70;
      const targetY = -(100 + Math.random() * 180);

      setFloaters(prev => [
        ...prev.slice(-24),
        { id, emoji, x, y, opacity, scale, size: 26 + Math.random() * 14 },
      ]);

      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(x, {
          toValue: targetX,
          duration: 900 + Math.random() * 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: targetY,
          duration: 1000 + Math.random() * 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(450),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 550,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => setFloaters(prev => prev.filter(f => f.id !== id)));
    }, []);

    const handleSelect = useCallback(
      (emoji: string) => {
        spawnEmoji(emoji);
        setOpen(false);
        Animated.spring(openAnim, {
          toValue: 0,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }).start();
        onReact(emoji);
      },
      [spawnEmoji, onReact, openAnim],
    );

    // Appel externe : anime un emoji reçu d'un autre viewer
    const triggerRemote = useCallback(
      (emoji: string) => {
        spawnEmoji(emoji);
      },
      [spawnEmoji],
    );

    useImperativeHandle(ref, () => ({ triggerRemote }), [triggerRemote]);

    return (
      <View style={st.root} pointerEvents="box-none">
        {/* Emojis flottants */}
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
            pointerEvents="none"
          >
            {f.emoji}
          </Animated.Text>
        ))}

        {/* Picker en arc */}
        {open && (
          <Animated.View
            style={[
              st.picker,
              {
                opacity: openAnim,
                transform: [
                  {
                    scale: openAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.6, 1],
                    }),
                  },
                  {
                    translateY: openAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="box-none"
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
        <TouchableOpacity
          style={st.triggerBtn}
          onPress={togglePicker}
          activeOpacity={0.75}
        >
          <Text style={st.triggerEmoji}>{open ? '✕' : '😊'}</Text>
        </TouchableOpacity>
      </View>
    );
  },
);

// ── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 2,
  },
  floater: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    zIndex: 50,
  },
  picker: {
    position: 'absolute',
    bottom: 60,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    width: 200,
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 40,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 26,
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
    zIndex: 20,
  },
  triggerEmoji: {
    fontSize: 24,
  },
});
