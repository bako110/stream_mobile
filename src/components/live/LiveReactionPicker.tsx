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
  ScrollView,
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
  // Classiques
  '❤️': 'reaction_heart',
  '💙': 'reaction_blue_heart',
  '💚': 'reaction_green_heart',
  '💜': 'reaction_purple_heart',
  '🩷': 'reaction_pink_heart',

  // Rire
  '😂': 'reaction_laugh',
  '🤣': 'reaction_rofl',
  '😆': 'reaction_funny',

  // Surprise
  '😮': 'reaction_wow',
  '🤯': 'reaction_mind_blown',
  '😲': 'reaction_surprised',

  // Tristesse
  '😢': 'reaction_sad',
  '😭': 'reaction_cry',

  // Colère
  '😡': 'reaction_angry',
  '🤬': 'reaction_rage',

  // Amour
  '😍': 'reaction_love',
  '🥰': 'reaction_love_face',
  '😘': 'reaction_kiss',
  '💋': 'reaction_lips',

  // Applaudissements
  '👏': 'reaction_clap',
  '🙌': 'reaction_celebrate',

  // Feu
  '🔥': 'reaction_fire',
  '💥': 'reaction_boom',
  '⚡': 'reaction_lightning',

  // Fête
  '🎉': 'reaction_party',
  '🎊': 'reaction_confetti',

  // Like
  '👍': 'reaction_like',
  '👎': 'reaction_dislike',

  // Force
  '💪': 'reaction_strength',
  '🦾': 'reaction_power',

  // Argent
  '💰': 'reaction_money',
  '💸': 'reaction_cash',

  // Étoiles
  '⭐': 'reaction_star',
  '🌟': 'reaction_glow',
  '✨': 'reaction_sparkles',

  // Succès
  '🏆': 'reaction_trophy',
  '🥇': 'reaction_gold',

  // Cadeaux
  '🎁': 'reaction_gift',

  // Musique
  '🎵': 'reaction_music',
  '🎶': 'reaction_music_notes',

  // Couronne
  '👑': 'reaction_king',

  // Fusée
  '🚀': 'reaction_rocket',

  // 100%
  '💯': 'reaction_hundred',

  // Check
  '✅': 'reaction_check',

  // OK
  '👌': 'reaction_ok',

  // Salut
  '👋': 'reaction_wave',

  // Prières
  '🙏': 'reaction_pray',

  // Regard
  '👀': 'reaction_eyes',

  // Cerveau
  '🧠': 'reaction_brain',

  // Idée
  '💡': 'reaction_idea',

  // Émotion
  '🥺': 'reaction_pleading',

  // Cool
  '😎': 'reaction_cool',

  // Clin d'œil
  '😉': 'reaction_wink',

  // Sourire
  '😊': 'reaction_smile',
  '😁': 'reaction_grin',

  // Cœur en feu
  '❤️‍🔥': 'reaction_heart_fire',

  // Arc-en-ciel
  '🌈': 'reaction_rainbow',

  // Trèfle
  '🍀': 'reaction_lucky',

  // Soleil
  '☀️': 'reaction_sun',

  // Lune
  '🌙': 'reaction_moon',

  // Cafés
  '☕': 'reaction_coffee',

  // Poulet 😄
  '🍗': 'reaction_chicken',

  // Pizza
  '🍕': 'reaction_pizza',

  // Burger
  '🍔': 'reaction_burger',

  // Glace
  '🍦': 'reaction_icecream',
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
  compact?: boolean;
}

export const LiveReactionPicker = forwardRef<LiveReactionPickerRef, Props>(
  ({ onReact, compact }, ref) => {
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
            pointerEvents="box-none"
            style={{
              opacity: openAnim,
              transform: [
                { scale: openAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                { translateY: openAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
            }}
          >
            <View style={[st.picker, compact && st.pickerCompact]}>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                contentContainerStyle={st.pickerGrid}
                style={st.pickerScroll}
              >
                {REACTIONS.map(r => (
                  <TouchableOpacity
                    key={r.emoji}
                    style={[st.reactionBtn, compact && st.reactionBtnCompact]}
                    onPress={() => handleSelect(r.emoji)}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.reactionEmoji, compact && st.reactionEmojiCompact]}>{r.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        )}

        <TouchableOpacity style={[st.triggerBtn, compact && st.triggerBtnCompact]} onPress={togglePicker} activeOpacity={0.75}>
          <Text style={[st.triggerEmoji, compact && st.triggerEmojiCompact]}>{open ? '✕' : '😊'}</Text>
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
    width: 320,
    backgroundColor: 'rgba(18,18,18,0.95)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 100,
  },
  pickerScroll: {
    maxHeight: 220,
    flexGrow: 0,
    flexShrink: 1,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reactionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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

  // ── Variante compacte : trigger intégré dans le champ de saisie ────────────
  pickerCompact: {
    bottom: 46,
    right: -4,
    width: 260,
  },
  reactionBtnCompact: { width: 34, height: 34, borderRadius: 17 },
  reactionEmojiCompact: { fontSize: 19 },
  triggerBtnCompact: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'transparent', borderWidth: 0,
  },
  triggerEmojiCompact: { fontSize: 13 },
});
