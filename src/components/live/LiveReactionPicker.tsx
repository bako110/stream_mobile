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
import Sound from 'react-native-sound';

Sound.setCategory('Ambient', true);

const { width: SW, height: SH } = Dimensions.get('window');

// Sur Android, les fichiers res/raw se chargent sans extension, bundle = null
const REACTION_SOUNDS: Record<string, string> = {
  '❤️': 'reaction_heart',
  '😂': 'reaction_laugh',
  '😮': 'reaction_wow',
  '😢': 'reaction_sad',
  '😡': 'reaction_angry',
  '🔥': 'reaction_fire',
  '👏': 'reaction_clap',
  '🎉': 'reaction_party',
};

export const REACTIONS = Object.keys(REACTION_SOUNDS).map(emoji => ({ emoji }));

// Préchargement paresseux — un seul Sound par emoji, rechargé si erreur
const soundCache: Record<string, Sound | null> = {};

function getSound(emoji: string): Sound | null {
  if (soundCache[emoji] !== undefined) return soundCache[emoji];
  const file = REACTION_SOUNDS[emoji];
  if (!file) { soundCache[emoji] = null; return null; }
  const s = new Sound(file, null as any, (err) => {
    if (err) { soundCache[emoji] = null; }
  });
  soundCache[emoji] = s;
  return s;
}

function playReactionSound(emoji: string) {
  const s = getSound(emoji);
  if (!s || !s.isLoaded()) return;
  s.setCurrentTime(0);
  s.play();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FloatingEmoji {
  id: number;
  emoji: string;
  startX: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  size: number;
}

// ── Hook à utiliser dans le screen pour gérer les floaters ────────────────────

export function useReactionFloaters() {
  const [floaters, setFloaters] = useState<FloatingEmoji[]>([]);
  const nextId = useRef(0);

  const spawnOne = useCallback((emoji: string, delay: number) => {
    const id      = nextId.current++;
    const x       = new Animated.Value(0);
    const y       = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale   = new Animated.Value(0);
    const driftX  = (Math.random() - 0.5) * 180;
    const driftY  = -(SH * 0.45 + Math.random() * SH * 0.35);
    const size    = 26 + Math.random() * 24;
    const startX  = SW / 2 - 20 + (Math.random() - 0.5) * 80;

    setTimeout(() => {
      setFloaters(prev => [...prev.slice(-30), { id, emoji, startX, x, y, opacity, scale, size }]);

      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }),
        Animated.timing(x, { toValue: driftX, duration: 900 + Math.random() * 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: driftY, duration: 1000 + Math.random() * 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      ]).start(() => setFloaters(prev => prev.filter(f => f.id !== id)));
    }, delay);
  }, []);

  const spawn = useCallback((emoji: string) => {
    playReactionSound(emoji);
    // 12 emojis en rafale
    for (let i = 0; i < 12; i++) {
      spawnOne(emoji, i * 60);
    }
  }, [spawnOne]);

  return { floaters, spawn };
}

// ── Composant floaters — à placer dans le View root du screen ─────────────────

export const ReactionFloaters: React.FC<{ floaters: FloatingEmoji[] }> = ({ floaters }) => {
  if (floaters.length === 0) return null;
  return (
    <>
      {floaters.map(f => (
        <Animated.Text
          key={f.id}
          pointerEvents="none"
          style={[
            st.floater,
            {
              fontSize: f.size,
              left: f.startX,
              bottom: SH * 0.15,
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
    </>
  );
};

// ── LiveReactionPicker — juste le bouton + panel ──────────────────────────────

export interface LiveReactionPickerRef {
  spawn: (emoji: string) => void;
}

interface Props {
  onReact: (emoji: string) => void;
}

export const LiveReactionPicker = forwardRef<LiveReactionPickerRef, Props>(
  ({ onReact }, ref) => {
    const [open, setOpen] = useState(false);
    const openAnim = useRef(new Animated.Value(0)).current;

    useImperativeHandle(ref, () => ({ spawn: onReact }), [onReact]);

    const togglePicker = useCallback(() => {
      const toValue = open ? 0 : 1;
      Animated.spring(openAnim, { toValue, friction: 6, tension: 120, useNativeDriver: true }).start();
      setOpen(o => !o);
    }, [open, openAnim]);

    const handleSelect = useCallback((emoji: string) => {
      setOpen(false);
      Animated.spring(openAnim, { toValue: 0, friction: 6, tension: 120, useNativeDriver: true }).start();
      onReact(emoji);
    }, [onReact, openAnim]);

    return (
      <View style={st.container}>
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

        <TouchableOpacity style={st.triggerBtn} onPress={togglePicker} activeOpacity={0.75}>
          <Text style={st.triggerEmoji}>{open ? '✕' : '😊'}</Text>
        </TouchableOpacity>
      </View>
    );
  },
);

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  floater: {
    position: 'absolute',
    zIndex: 9999,
  },
  container: {
    alignItems: 'center',
  },
  picker: {
    position: 'absolute',
    bottom: 58,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    width: 104,
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
  reactionEmoji: { fontSize: 24 },
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
  triggerEmoji: { fontSize: 22 },
});
