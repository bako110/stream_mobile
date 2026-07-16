/**
 * LiveGiftOverlay — animations de cadeaux en direct style TikTok (overlay
 * pur, pas d'UI de sélection — voir LiveGiftBar pour la rangée permanente).
 * - Animation "fusée" montante à l'envoi (notifySent, appelé par LiveGiftBar)
 * - Notifications en overlay quand quelqu'un envoie un cadeau (WS gift_received)
 */
import React, { useEffect, useRef, useState, useImperativeHandle } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Sound from 'react-native-sound';

Sound.setCategory('Ambient', true);

let _giftSentSound: Sound | null = null;
let _giftReceivedSound: Sound | null = null;

function getGiftSentSound(): Sound {
  if (!_giftSentSound) {
    _giftSentSound = new Sound('gift_sent', null as any, () => {});
  }
  return _giftSentSound;
}

function getGiftReceivedSound(): Sound {
  if (!_giftReceivedSound) {
    _giftReceivedSound = new Sound('gift_received', null as any, () => {});
  }
  return _giftReceivedSound;
}

function playGiftSound(type: 'sent' | 'received') {
  const s = type === 'sent' ? getGiftSentSound() : getGiftReceivedSound();
  if (!s.isLoaded()) return;
  s.setCurrentTime(0);
  s.play();
}

const { width: W, height: H } = Dimensions.get('window');

export interface GiftNotif {
  id: string;
  senderName: string;
  emoji: string;
  giftName: string;
  GoGold: number;
}

// ── Animation montante pour chaque cadeau envoyé ──────────────────────────────

const FloatingGift: React.FC<{ emoji: string; onDone: () => void }> = ({ emoji, onDone }) => {
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale   = useRef(new Animated.Value(0.4)).current;
  // Position X aléatoire dans la moitié gauche de l'écran
  const x = useRef(Math.random() * (W * 0.5 - 60) + 20).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y,       { toValue: -(H * 0.65), duration: 2200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,            duration: 2000, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start(onDone);
  }, []);

  return (
    <Animated.Text
      style={[
        g.floatEmoji,
        { left: x, transform: [{ translateY: y }, { scale }], opacity },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
};

// ── Notif cadeau reçu (visible pour tous) ─────────────────────────────────────

const GiftToast: React.FC<{ notif: GiftNotif; onDone: () => void }> = ({ notif, onDone }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const x       = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1,   duration: 300, useNativeDriver: true }),
        Animated.timing(x,       { toValue: 0,   duration: 300, useNativeDriver: true }),
      ]),
      Animated.delay(2500),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0,   duration: 400, useNativeDriver: true }),
        Animated.timing(x,       { toValue: -120, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);

  return (
    <Animated.View style={[g.giftToast, { opacity, transform: [{ translateX: x }] }]}>
      <LinearGradient
        colors={['rgba(255,215,0,0.25)', 'rgba(255,140,0,0.25)']}
        style={g.giftToastBg}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        <Text style={g.giftToastEmoji}>{notif.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={g.giftToastSender} numberOfLines={1}>{notif.senderName}</Text>
          <Text style={g.giftToastName} numberOfLines={1}>
            a envoyé {notif.giftName} · {notif.GoGold} 🪙
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

// ── Composant principal exporté ───────────────────────────────────────────────

export interface LiveGiftOverlayRef {
  // Déclenche l'animation "fusée" montante + le son d'envoi — appelé par
  // LiveGiftBar (rangée permanente) une fois le cadeau réellement envoyé.
  notifySent: (emoji: string) => void;
}

interface Props {
  liveId: string;
  incomingNotifs: GiftNotif[];
  onNotifShown: (id: string) => void;
}

export const LiveGiftOverlay = React.forwardRef<LiveGiftOverlayRef, Props>((
  { incomingNotifs, onNotifShown }, ref,
) => {
  const [floats,      setFloats]      = useState<{ id: string; emoji: string }[]>([]);
  const [activeNotif, setActiveNotif] = useState<GiftNotif | null>(null);

  useImperativeHandle(ref, () => ({
    notifySent: (emoji) => {
      playGiftSound('sent');
      setFloats(prev => [...prev.slice(-7), { id: `sent-${Date.now()}`, emoji }]);
    },
  }), []);

  useEffect(() => {
    if (incomingNotifs.length > 0 && !activeNotif) {
      const next = incomingNotifs[0];
      playGiftSound('received');
      setActiveNotif(next);
      setFloats(prev => [...prev.slice(-7), { id: `notif-${next.id}`, emoji: next.emoji }]);
    }
  }, [incomingNotifs, activeNotif]);

  return (
    <>
      {floats.map(f => (
        <FloatingGift key={f.id} emoji={f.emoji} onDone={() => setFloats(prev => prev.filter(x => x.id !== f.id))} />
      ))}

      {activeNotif && (
        <GiftToast
          key={activeNotif.id}
          notif={activeNotif}
          onDone={() => { onNotifShown(activeNotif.id); setActiveNotif(null); }}
        />
      )}
    </>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  // Emojis flottants
  floatEmoji: {
    position: 'absolute',
    bottom: 120,
    fontSize: 36,
    zIndex: 50,
  },

  // Toast cadeau reçu
  giftToast: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 160 : 140,
    left: 12,
    zIndex: 50,
    maxWidth: W * 0.65,
  },
  giftToastBg: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.4)',
  },
  giftToastEmoji:  { fontSize: 22 },
  giftToastSender: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  giftToastName:   { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
});
