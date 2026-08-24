/**
 * BattleScreen — match live entre deux créateurs, structure alignée sur le web
 * (BattlePage.tsx) : header épuré (fermer, participants, titre "BATTLE LIVE" +
 * pastille pulsante, top supporter), rangée hosts (avatar/nom/j'aime/Suivre),
 * barre de score pleine largeur (dégradé dynamique + message de hype), zone
 * vidéo flexible avec les deux hosts en cartes arrondies côte à côte (façon
 * TikTok Live Battle) séparées par un badge "VS" + countdown flottants — halo
 * pulsé autour du camp en tête, bandeau nom+avatar par créateur, cadeaux
 * animés — puis zone basse fixe (chat fusionné des deux lives, classement des
 * supporters, actions). Abandon (forfait) qui notifie l'autre côté.
 */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Image, Dimensions, FlatList, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, {
  FadeIn, FadeOut, SlideInDown, SlideOutDown, SlideInUp, ZoomIn, BounceIn, LinearTransition,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring, withSequence, Easing,
} from 'react-native-reanimated';
import {
  LiveKitRoom, useTracks, useLocalParticipant, useConnectionState, useParticipants, VideoTrack,
} from '@livekit/react-native';
import { Track, VideoPresets, ConnectionState, RemoteTrackPublication } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MatchResultModal } from '../../components/live/MatchResultModal';
import { GoFolyXLoader } from '../../components/common';
import { battleService } from '../../services/battleService';
import type { Battle, BattleGoal, BattleRanking } from '../../services/battleService';
import { showConfirm } from '../../services';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { useUser } from '../../context/UserContext';
import { userService } from '../../services/userService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { openAuthenticatedWs } from '../../utils/authenticatedWs';
import { storage } from '../../utils/storage';
import { LiveGiftOverlay } from '../../components/wallet/LiveGiftOverlay';
import type { GiftNotif, LiveGiftOverlayRef } from '../../components/wallet/LiveGiftOverlay';
import { LiveGiftBar } from '../../components/wallet/LiveGiftBar';
import { clearLiveEnteringBattle } from '../../utils/battleTransitionFlags';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { configureLiveAudioSession } from '../../utils/liveAudioSession';
import { participantAvatarUrl } from '../../utils/livekitParticipant';
import { LiveParticipantsModal } from '../../components/live/LiveParticipantsModal';

const { height: SCREEN_H } = Dimensions.get('window');

// A partir de ce montant, un cadeau declenche l'animation plein ecran avec le nom
// du donateur (en plus de la couronne temporaire, systematique quel que soit le montant).
const BIG_GIFT_THRESHOLD = 500;

// ── LiveKit quality config ─────────────────────────────────────────────────────
// Chaque host publie et souscrit symetriquement dans la meme room de battle —
// sans ces options explicites, la publication/souscription video peut echouer
// silencieusement a la connexion initiale et ne se retablir qu'a une reconnexion.
const BATTLE_ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: {
    videoCodec: 'h264' as const,
    simulcast: true,
    videoSimulcastLayers: [VideoPresets.h720],
    videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 },
  },
};

interface RouteParams {
  battleId: string;
  followedHostId?: string;
}

interface ChatMsg {
  id: string;
  side: 'a' | 'b';
  user: string;
  text: string;
}

interface GiftTick {
  id: string;
  side: 'a' | 'b';
  senderName: string;
  emoji: string;
  giftName: string;
  GoGold: number;
}

interface EffectBanner {
  id: string;
  message: string;
  weather: string;
}

// Cœur de soutien — monte du bas vers le haut avec un léger drift horizontal et un
// fondu progressif, façon TikTok Live Battle (purement visuel, sans impact sur le score).
const HEART_RISE_DURATION = 1800;
const HEART_RISE_DISTANCE = 160;

function RisingHeart({ drift }: { drift: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: HEART_RISE_DURATION, easing: Easing.out(Easing.quad) });
  }, []); // eslint-disable-line

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * -HEART_RISE_DISTANCE },
      { translateX: progress.value * drift },
      { scale: 0.7 + progress.value * 0.5 },
    ],
    opacity: progress.value < 0.1 ? progress.value / 0.1 : progress.value > 0.7 ? (1 - progress.value) / 0.3 : 1,
  }));

  return (
    <Animated.Text style={[styles.floater, style]}>❤️</Animated.Text>
  );
}

// Couronne temporaire — pop + leger rebond au-dessus de l'avatar du destinataire
// a chaque cadeau recu, puis fondu (independant du score, purement festif).
const CROWN_DURATION = 2600;

function CrownPop() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSequence(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.8)) }),
      withTiming(1, { duration: CROWN_DURATION - 320 - 400 }),
      withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) }),
    );
  }, []); // eslint-disable-line

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: progress.value }, { translateY: (1 - progress.value) * 10 }],
    opacity: progress.value,
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.crownPop, style]}>
      <Text style={styles.crownPopEmoji}>👑</Text>
    </Animated.View>
  );
}

// Toute la moitié vidéo est cliquable pour ouvrir l'envoi de cadeau au host
// concerné (portage du comportement web BattleVideoHalf onClick), en plus de
// la giftCard dédiée déjà présente en bas d'écran.
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Badge de cadeau flottant — le retrait est géré par son propre useEffect au
// montage (mount = démarre le timer), pas par le parent, pour ne jamais
// redémarrer/décaler le timer sur un re-render du parent.
function GiftTickItem({ tick, colors, onExpire }: { tick: GiftTick; colors: [string, string]; onExpire: (id: string) => void }) {
  useEffect(() => {
    const removeTimer = setTimeout(() => onExpire(tick.id), 2000);
    return () => clearTimeout(removeTimer);
  }, [tick.id, onExpire]);

  return (
    <Animated.View entering={ZoomIn.duration(280)} exiting={FadeOut.duration(350)} style={styles.giftTick}>
      <LinearGradient colors={colors} style={styles.giftTickGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <Text style={styles.giftTickEmoji}>{tick.emoji}</Text>
        <Text style={styles.giftTickText} numberOfLines={1}>
          <Text style={styles.giftTickSender}>{tick.senderName} </Text>· {tick.GoGold}🪙
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

function VerifiedCheck() {
  return (
    <View style={styles.verifiedCheck}>
      <Icon name="check" size={8} color="#fff" />
    </View>
  );
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function weatherIcon(weather: string): string {
  switch (weather) {
    case 'fire_rain':  return '🔥';
    case 'lightning':  return '⚡';
    case 'fireworks':  return '🎆';
    case 'petals':     return '🌸';
    default:           return '✨';
  }
}

/** Pastille rouge pulsante à côté du titre "BATTLE LIVE", comme le web (animate-pulse). */
const PulsingDot: React.FC = () => {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: 0.5 + pulse.value * 0.5 }));
  return <Animated.View style={[styles.headerPulsingDot, style]} />;
};

/** Halo lumineux qui respire doucement autour du cadre du camp en tete du score. */
const PulsingHalo: React.FC<{ color: string }> = ({ color }) => {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.45,
    shadowOpacity: 0.35 + pulse.value * 0.45,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        style,
        {
          borderWidth: 3,
          borderColor: color,
          borderRadius: 22,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 16,
          elevation: 12,
        },
      ]}
    />
  );
};

/** Nombre qui rebondit legerement a chaque changement de valeur (score). */
const BouncyNumber: React.FC<{ value: number; style: any }> = ({ value, style }) => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.35, { duration: 140, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 6, stiffness: 180 }),
    );
  }, [value, scale]);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.Text style={[style, animStyle]}>{value}</Animated.Text>
  );
};

// ── Message de hype contextuel — façon TikTok Live, réagit à l'état réel du
// match (temps restant, score, écart, retournement) plutôt que de défiler au
// hasard. Portage exact de useHypeMessage (stream_web/BattlePage.tsx) : priorité
// du plus urgent au plus générique — dernières secondes > retournement tout
// juste survenu > match ultra serré > un camp mène largement > accueil.
function useHypeMessage(params: {
  remaining: number; scoreA: number; scoreB: number;
  leadingSide: 'a' | 'b' | null; hostNameA: string; hostNameB: string;
  isActive: boolean;
}): { text: string; key: string } {
  const { remaining, scoreA, scoreB, leadingSide, hostNameA, hostNameB, isActive } = params;
  const prevLeaderRef = useRef<'a' | 'b' | null>(null);
  const [flipMsg, setFlipMsg] = useState<{ text: string; key: string } | null>(null);

  useEffect(() => {
    const prev = prevLeaderRef.current;
    if (prev !== null && leadingSide !== null && prev !== leadingSide) {
      const name = leadingSide === 'a' ? hostNameA : hostNameB;
      setFlipMsg({ text: `🔥 ${name} prend le dessus !`, key: `flip-${Date.now()}` });
      const t = setTimeout(() => setFlipMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [leadingSide, hostNameA, hostNameB]);
  useEffect(() => { prevLeaderRef.current = leadingSide; }, [leadingSide]);

  return useMemo(() => {
    if (!isActive) return { text: '⚔️ Le combat va commencer…', key: 'idle' };
    if (flipMsg) return flipMsg;
    if (remaining <= 10 && remaining > 0) return { text: '⏱️ DERNIERS INSTANTS !!', key: 'final-seconds' };
    if (remaining <= 30 && remaining > 10) return { text: '⚡ Ça se termine bientôt…', key: 'closing' };

    const total = scoreA + scoreB;
    if (total === 0) return { text: '💬 Envoie un cadeau pour soutenir ton camp !', key: 'start' };

    const diff = Math.abs(scoreA - scoreB);
    const diffPct = total > 0 ? (diff / total) * 100 : 0;

    if (diffPct < 10) return { text: '😱 Match ULTRA serré, tout peut basculer !', key: 'tight' };
    if (leadingSide) {
      const leaderName = leadingSide === 'a' ? hostNameA : hostNameB;
      const trailingName = leadingSide === 'a' ? hostNameB : hostNameA;
      return diffPct > 60
        ? { text: `👑 ${leaderName} domine le combat !`, key: 'dominant' }
        : { text: `💪 ${trailingName} peut encore renverser la situation !`, key: 'comeback' };
    }
    return { text: '🎯 Qui va prendre l\'avantage ?', key: 'neutral' };
  }, [isActive, flipMsg, remaining, scoreA, scoreB, leadingSide, hostNameA, hostNameB]);
}

function HypeBanner({ message }: { message: { text: string; key: string } }) {
  return (
    <Animated.Text key={message.key} entering={FadeIn.duration(280)} style={styles.hypeText} numberOfLines={1}>
      {message.text}
    </Animated.Text>
  );
}

/** Ouvre une connexion brute vers /comments/ws/{targetType}/{targetId}, avec reconnexion simple. */
function useRoomSocket(
  targetType: 'live' | 'battle',
  targetId: string | null,
  onMessage: (data: any) => void,
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!targetId) return;
    const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    let ws: WebSocket | null = null;
    let closedByUs = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = openAuthenticatedWs(`${WS_BASE_URL}/api/v1/social/comments/ws/${targetType}/${targetId}`, token);
      ws.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data as string)); } catch {}
      };
      ws.onclose = () => {
        if (!closedByUs) retryTimer = setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      closedByUs = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [targetType, targetId]);
}

export const BattleScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { battleId, followedHostId } = route.params as RouteParams;
  const { currentUser } = useUser();
  const { addListener, removeListener } = useWs();
  useKeepAwake();
  useEffect(() => { configureLiveAudioSession(); }, []);

  const [battle, setBattle]   = useState<Battle | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [wsUrl, setWsUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [goal, setGoal]       = useState<BattleGoal | null>(null);
  const [ranking, setRanking] = useState<BattleRanking | null>(null);
  const [floaters, setFloaters] = useState<{ id: string; side: 'a' | 'b'; drift: number }[]>([]);
  // Compteur de coeurs par camp — purement indicatif, sans effet sur le score du match.
  const [heartCountA, setHeartCountA] = useState(0);
  const [heartCountB, setHeartCountB] = useState(0);
  const [ended, setEnded]     = useState<{ winner_id: string | null; score_a: number; score_b: number; forfeitBy?: string | null; forfeitPenalty?: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [giftTickerA, setGiftTickerA] = useState<GiftTick[]>([]);
  const [giftTickerB, setGiftTickerB] = useState<GiftTick[]>([]);
  const expireGiftTickA = useCallback((id: string) => setGiftTickerA(prev => prev.filter(t => t.id !== id)), []);
  const expireGiftTickB = useCallback((id: string) => setGiftTickerB(prev => prev.filter(t => t.id !== id)), []);
  const [giftNotifsA, setGiftNotifsA] = useState<GiftNotif[]>([]);
  const [giftNotifsB, setGiftNotifsB] = useState<GiftNotif[]>([]);
  // Couronne temporaire sur l'avatar du destinataire — a chaque cadeau, quel que
  // soit son montant. Cle unique (id) pour rejouer l'animation meme si le meme
  // camp recoit deux cadeaux coup sur coup.
  const [crownA, setCrownA] = useState<string | null>(null);
  const [crownB, setCrownB] = useState<string | null>(null);
  // Overlay plein ecran pour les gros cadeaux (>= BIG_GIFT_THRESHOLD GoGold)
  const [bigGift, setBigGift] = useState<{ id: string; senderName: string; emoji: string; giftName: string; GoGold: number } | null>(null);
  const [effectBanner, setEffectBanner] = useState<EffectBanner | null>(null);
  const [hostNameA, setHostNameA] = useState('Créateur A');
  const [hostNameB, setHostNameB] = useState('Créateur B');
  const [hostAvatarA, setHostAvatarA] = useState<string | null>(null);
  const [hostAvatarB, setHostAvatarB] = useState<string | null>(null);
  const [verifiedA, setVerifiedA] = useState(false);
  const [verifiedB, setVerifiedB] = useState(false);
  const [followingA, setFollowingA] = useState(false);
  const [followingB, setFollowingB] = useState(false);
  const [likesA, setLikesA] = useState(0);
  const [likesB, setLikesB] = useState(0);
  // Carte "top donateurs" (classement en bas de chaque moitié vidéo) — visible
  // tant que des cadeaux arrivent pour ce camp, masquée après 8s sans nouveau
  // cadeau (réapparaît instantanément dès le suivant) — même comportement que
  // le web (BattlePage.tsx), pour ne pas rester figée en permanence dès le
  // premier cadeau reçu.
  const [showDonorsA, setShowDonorsA] = useState(false);
  const [showDonorsB, setShowDonorsB] = useState(false);
  const donorsHideTimerA = useRef<ReturnType<typeof setTimeout> | null>(null);
  const donorsHideTimerB = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpDonorsVisibility = useCallback((side: 'a' | 'b') => {
    const setShow = side === 'a' ? setShowDonorsA : setShowDonorsB;
    const timerRef = side === 'a' ? donorsHideTimerA : donorsHideTimerB;
    setShow(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 8000);
  }, []);
  useEffect(() => () => {
    if (donorsHideTimerA.current) clearTimeout(donorsHideTimerA.current);
    if (donorsHideTimerB.current) clearTimeout(donorsHideTimerB.current);
  }, []);

  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoEndTriggeredRef = useRef(false);
  const chatRef   = useRef<FlatList<ChatMsg>>(null);
  const giftOverlayA = useRef<LiveGiftOverlayRef>(null);
  const giftOverlayB = useRef<LiveGiftOverlayRef>(null);
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHost = !!currentUser && battle && (currentUser.id === battle.host_a_id || currentUser.id === battle.host_b_id);
  const myHostSide: 'a' | 'b' | null = !battle || !currentUser
    ? null
    : currentUser.id === battle.host_a_id ? 'a' : currentUser.id === battle.host_b_id ? 'b' : null;

  // Enregistrement — n'importe lequel des deux hosts peut démarrer/arrêter
  // pendant le match (PATCH /battles/{id}/recording), même pattern que le web.
  const [isRecording, setIsRecording] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  useEffect(() => { setIsRecording(!!battle?.is_recording); }, [battle?.is_recording]);
  const toggleRecording = useCallback(async () => {
    if (recordingLoading || !battleId) return;
    setRecordingLoading(true);
    const next = !isRecording;
    try {
      const r = await battleService.toggleRecording(battleId, next);
      setIsRecording(r.recording);
    } catch {
      // 503 = quota d'enregistrement épuisé côté LiveKit, ou autre échec — l'état reste inchangé
    } finally {
      setRecordingLoading(false);
    }
  }, [battleId, isRecording, recordingLoading]);

  // Cote suivi par un viewer (pas un host) avant l'entree en battle — sert a couper
  // l'audio du camp adverse pour lui. Un host, lui, doit toujours entendre les deux cotes.
  const followedSide: 'a' | 'b' | null = myHostSide
    ? null
    : !battle || !followedHostId
      ? null
      : followedHostId === battle.host_a_id ? 'a' : followedHostId === battle.host_b_id ? 'b' : null;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Recupere l'etat courant du battle des l'ouverture — sans ca, live_a_id/
        // live_b_id/host_a_id/host_b_id restent vides tant qu'aucun evenement WS
        // "battle_started" n'a ete recu APRES le montage de l'ecran, ce qui bloque
        // tout affichage video si l'ecran est ouvert apres coup (relance app, retour
        // en arriere, viewer qui rejoint en cours de match).
        const [b, t] = await Promise.all([
          battleService.get(battleId),
          battleService.getToken(battleId),
        ]);
        if (!mounted) return;
        setBattle(b);
        if (b.status === 'active') {
          setRemaining(Math.max(0, b.duration_seconds - Math.floor((Date.now() - new Date(b.started_at ?? Date.now()).getTime()) / 1000)));
        } else if (b.status === 'ended') {
          setEnded({ winner_id: b.winner_id, score_a: b.score_a, score_b: b.score_b, forfeitBy: null, forfeitPenalty: 0 });
        }
        setToken(t.token);
        setWsUrl(t.ws_url);
        const activeGoal = await battleService.getActiveGoal(battleId).catch(() => null);
        if (mounted) setGoal(activeGoal);
        const rank = await battleService.getRanking(battleId).catch(() => null);
        if (mounted) setRanking(rank);
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [battleId]);

  const refreshRanking = useCallback(() => {
    battleService.getRanking(battleId).then(setRanking).catch(() => {});
  }, [battleId]);

  useEffect(() => {
    if (battle?.host_a_id) {
      userService.getPublicProfile(battle.host_a_id)
        .then(p => {
          setHostNameA(p.display_name || p.username || 'Créateur A');
          setHostAvatarA(p.avatar_url);
          setVerifiedA(!!p.is_verified);
          setFollowingA(!!p.is_followed);
        })
        .catch(() => {});
    }
    if (battle?.host_b_id) {
      userService.getPublicProfile(battle.host_b_id)
        .then(p => {
          setHostNameB(p.display_name || p.username || 'Créateur B');
          setHostAvatarB(p.avatar_url);
          setVerifiedB(!!p.is_verified);
          setFollowingB(!!p.is_followed);
        })
        .catch(() => {});
    }
  }, [battle?.host_a_id, battle?.host_b_id]);

  // "X j'aime" affiché sous chaque host = like_count du LIVE d'origine (pas le
  // nombre d'abonnés du compte) — vient de GET /lives/{id}, mis à jour en temps
  // réel via l'event WS like_added (cf. onLiveMessage plus bas).
  useEffect(() => {
    if (battle?.live_a_id) {
      apiClient.get<any>(Endpoints.lives.byId(battle.live_a_id))
        .then(r => setLikesA(r.data?.like_count ?? 0))
        .catch(() => {});
    }
    if (battle?.live_b_id) {
      apiClient.get<any>(Endpoints.lives.byId(battle.live_b_id))
        .then(r => setLikesB(r.data?.like_count ?? 0))
        .catch(() => {});
    }
  }, [battle?.live_a_id, battle?.live_b_id]);

  const toggleFollow = useCallback(async (side: 'a' | 'b') => {
    if (!battle) return;
    const hostId = side === 'a' ? battle.host_a_id : battle.host_b_id;
    const currentlyFollowing = side === 'a' ? followingA : followingB;
    const setFollowing = side === 'a' ? setFollowingA : setFollowingB;
    setFollowing(!currentlyFollowing);
    try {
      if (currentlyFollowing) await userService.unfollow(hostId);
      else await userService.follow(hostId);
    } catch {
      setFollowing(currentlyFollowing);
    }
  }, [battle, followingA, followingB]);

  const showEffect = useCallback((message: string, weather: string) => {
    if (effectTimerRef.current) clearTimeout(effectTimerRef.current);
    const id = `${Date.now()}-${Math.random()}`;
    setEffectBanner({ id, message, weather });
    effectTimerRef.current = setTimeout(() => setEffectBanner(null), 4000);
  }, []);

  // ── WS global (par utilisateur) — evenements adresses aux deux hosts ────────
  useEffect(() => {
    const handler = (payload: WsPayload) => {
      if (payload.battle_id !== battleId) return;

      if (payload.type === 'battle_started') {
        setBattle(prev => ({
          ...(prev ?? {}),
          id: battleId,
          live_a_id: payload.live_a_id,
          live_b_id: payload.live_b_id,
          host_a_id: payload.host_a_id,
          host_b_id: payload.host_b_id,
          status: 'active',
          duration_seconds: payload.duration_seconds,
          started_at: payload.started_at,
        } as Battle));
        setRemaining(payload.duration_seconds);
      }

      if (payload.type === 'battle_ended') {
        setEnded({
          winner_id: payload.winner_id, score_a: payload.score_a, score_b: payload.score_b,
          forfeitBy: payload.forfeit_by ?? null, forfeitPenalty: payload.forfeit_penalty ?? 0,
        });
        setBattle(prev => {
          if (!prev) return prev;
          clearLiveEnteringBattle(prev.live_a_id);
          clearLiveEnteringBattle(prev.live_b_id);
          return { ...prev, status: 'ended', score_a: payload.score_a, score_b: payload.score_b, winner_id: payload.winner_id };
        });
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [addListener, removeListener, battleId]);

  // ── WS room "battle" — reactions, effets IA, objectifs ──────────────────────
  useRoomSocket('battle', battleId, useCallback((d: any) => {
    if (d.type === 'battle_reaction') {
      const id = `${Date.now()}-${Math.random()}`;
      const drift = (Math.random() - 0.5) * 40;
      setFloaters(prev => [...prev, { id, side: d.side, drift }]);
      setTimeout(() => setFloaters(prev => prev.filter(f => f.id !== id)), HEART_RISE_DURATION);
      if (d.side === 'a') setHeartCountA(c => c + 1); else setHeartCountB(c => c + 1);
    }
    if (d.type === 'battle_score_update') {
      setBattle(prev => prev ? { ...prev, score_a: d.score_a, score_b: d.score_b } : prev);
    }
    if (d.type === 'battle_goal_started' || d.type === 'battle_goal_progress') {
      setGoal(d as unknown as BattleGoal);
    }
    if (d.type === 'battle_goal_succeeded' || d.type === 'battle_goal_failed') {
      setGoal(prev => prev ? { ...prev, status: d.type === 'battle_goal_succeeded' ? 'succeeded' : 'failed' } : prev);
    }
    if (d.type === 'battle_effect' && d.message) {
      showEffect(d.message, d.weather ?? 'none');
    }
  }, [showEffect]));

  // ── WS room "live" cote A et cote B — chat + cadeaux fusionnes ──────────────
  const onLiveMessage = useCallback((side: 'a' | 'b') => (d: any) => {
    if (d.type === 'comment_added' && d.comment && String(d.comment.body ?? '').trim()) {
      const c = d.comment;
      const user = c.author?.display_name ?? c.author?.username ?? 'Anonyme';
      setMessages(prev => [...prev.slice(-149), { id: c.id ?? String(Date.now()), side, user, text: c.body }]);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 80);
    }
    if (d.type === 'gift_received' && d.gift) {
      const gf = d.gift;
      const senderName = gf.sender?.display_name ?? gf.sender?.username ?? 'Quelqu\'un';
      const tick: GiftTick = {
        id: gf.id ?? `${Date.now()}-${Math.random()}`,
        side,
        senderName,
        emoji: gf.gift_type?.emoji ?? '🎁',
        giftName: gf.gift_type?.name ?? 'Cadeau',
        GoGold: gf.gogold_spent ?? 0,
      };
      // UN SEUL badge affiché à la fois par camp (le plus récent remplace le
      // précédent), pas un empilement — en cas de cadeaux rapprochés, empiler
      // plusieurs tickets simultanés donnait l'illusion d'un badge figé en
      // continu à l'écran. Le retrait est géré par GiftTickItem lui-même.
      (side === 'a' ? setGiftTickerA : setGiftTickerB)([tick]);
      const notif: GiftNotif = { id: tick.id, senderName, emoji: tick.emoji, giftName: tick.giftName, GoGold: tick.GoGold };
      if (side === 'a') setGiftNotifsA(prev => [...prev, notif]);
      else setGiftNotifsB(prev => [...prev, notif]);
      refreshRanking();
      bumpDonorsVisibility(side);

      // Couronne temporaire sur l'avatar du destinataire — a chaque cadeau, sans condition de montant
      if (side === 'a') setCrownA(tick.id); else setCrownB(tick.id);
      setTimeout(() => { if (side === 'a') setCrownA(prev => prev === tick.id ? null : prev); else setCrownB(prev => prev === tick.id ? null : prev); }, CROWN_DURATION);

      // Gros cadeau — animation plein ecran avec le nom du donateur
      if (tick.GoGold >= BIG_GIFT_THRESHOLD) {
        setBigGift({ id: tick.id, senderName, emoji: tick.emoji, giftName: tick.giftName, GoGold: tick.GoGold });
        setTimeout(() => setBigGift(prev => prev?.id === tick.id ? null : prev), 3800);
      }
    }
    if (d.type === 'like_added' && typeof d.total === 'number') {
      (side === 'a' ? setLikesA : setLikesB)(d.total);
    }
  }, [refreshRanking, bumpDonorsVisibility]);

  useRoomSocket('live', battle?.live_a_id ?? null, useMemo(() => onLiveMessage('a'), [onLiveMessage]));
  useRoomSocket('live', battle?.live_b_id ?? null, useMemo(() => onLiveMessage('b'), [onLiveMessage]));

  // Countdown local — recale sur started_at/duration_seconds a chaque changement de battle.
  // Des que le temps est ecoule, on ne se contente plus d'attendre le WS "battle_ended"
  // (envoye par la tache serveur qui ne tourne qu'une fois par minute, jusqu'a 59s de
  // retard) : le premier host dont l'app atteint 0 declenche lui-meme la cloture cote
  // serveur — le match coupe immediatement et affiche le vainqueur sans attendre.
  useEffect(() => {
    if (!battle?.started_at || battle.status !== 'active') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    autoEndTriggeredRef.current = false;
    const startedAt = new Date(battle.started_at).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, battle.duration_seconds - elapsed);
      setRemaining(left);
      if (left === 0 && isHost && !autoEndTriggeredRef.current) {
        autoEndTriggeredRef.current = true;
        battleService.end(battleId).catch(() => {});
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [battle?.started_at, battle?.status, battle?.duration_seconds, isHost, battleId]);

  const handleReact = useCallback((side: 'a' | 'b') => {
    battleService.react(battleId, side).catch(() => {});
  }, [battleId]);

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !battle) return;
    setChatInput('');
    const liveId = myHostSide === 'b' ? battle.live_b_id : battle.live_a_id;
    try { await apiClient.post(Endpoints.social.comments, { body: text, live_id: liveId }); } catch {}
  }, [chatInput, battle, myHostSide]);

  const handleClose = useCallback(() => {
    if (!isHost || !battle || battle.status !== 'active') {
      nav.goBack();
      return;
    }

    const myScore     = myHostSide === 'b' ? battle.score_b : battle.score_a;
    const otherScore   = myHostSide === 'b' ? battle.score_a : battle.score_b;
    const isLeading    = myScore > otherScore;
    const halfGogold   = Math.floor(myScore / 2);

    showConfirm(
      'Quitter le battle ?',
      isLeading && halfGogold > 0
        ? `Tu es en tête, mais si tu abandonnes maintenant tu perds automatiquement ce match ET tu reverses la moitié de tes GoGold gagnés (${halfGogold} GoGold) à ton adversaire.`
        : 'Si tu quittes maintenant, tu perds automatiquement ce match.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Abandonner',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try { await battleService.end(battleId, true); } catch {}
            if (battle) {
              clearLiveEnteringBattle(battle.live_a_id);
              clearLiveEnteringBattle(battle.live_b_id);
            }
            nav.goBack();
          },
        },
      ],
    );
  }, [isHost, battle, battleId, nav, myHostSide]);

  if (loading || !token || !wsUrl) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: '#000' }]}>
        <StatusBar barStyle="light-content" />
        <GoFolyXLoader variant="reel" color="#7B3FF2" />
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect options={BATTLE_ROOM_OPTIONS}>
      <BattleContent
        battle={battle}
        remaining={remaining}
        goal={goal}
        ranking={ranking}
        floaters={floaters}
        heartCountA={heartCountA}
        heartCountB={heartCountB}
        ended={ended}
        leaving={leaving}
        myId={currentUser?.id ?? null}
        myHostSide={myHostSide}
        followedSide={followedSide}
        hostNameA={hostNameA}
        hostNameB={hostNameB}
        hostAvatarA={hostAvatarA}
        hostAvatarB={hostAvatarB}
        verifiedA={verifiedA}
        verifiedB={verifiedB}
        followingA={followingA}
        followingB={followingB}
        likesA={likesA}
        likesB={likesB}
        showDonorsA={showDonorsA}
        showDonorsB={showDonorsB}
        onToggleFollow={toggleFollow}
        showRanking={showRanking}
        setShowRanking={setShowRanking}
        chatInput={chatInput}
        setChatInput={setChatInput}
        messages={messages}
        chatRef={chatRef}
        giftTickerA={giftTickerA}
        giftTickerB={giftTickerB}
        onGiftTickExpireA={expireGiftTickA}
        onGiftTickExpireB={expireGiftTickB}
        crownA={crownA}
        crownB={crownB}
        bigGift={bigGift}
        giftNotifsA={giftNotifsA}
        giftNotifsB={giftNotifsB}
        onGiftShownA={(id) => setGiftNotifsA(prev => prev.filter(n => n.id !== id))}
        onGiftShownB={(id) => setGiftNotifsB(prev => prev.filter(n => n.id !== id))}
        giftOverlayA={giftOverlayA}
        giftOverlayB={giftOverlayB}
        effectBanner={effectBanner}
        onReact={handleReact}
        onSendChat={handleSendChat}
        onClose={handleClose}
        isHost={!!isHost}
        isRecording={isRecording}
        recordingLoading={recordingLoading}
        onToggleRecording={toggleRecording}
      />
    </LiveKitRoom>
  );
};

const BattleContent: React.FC<{
  battle: Battle | null;
  remaining: number;
  goal: BattleGoal | null;
  ranking: BattleRanking | null;
  floaters: { id: string; side: 'a' | 'b'; drift: number }[];
  heartCountA: number;
  heartCountB: number;
  ended: { winner_id: string | null; score_a: number; score_b: number; forfeitBy?: string | null; forfeitPenalty?: number } | null;
  leaving: boolean;
  myId: string | null;
  myHostSide: 'a' | 'b' | null;
  followedSide: 'a' | 'b' | null;
  hostNameA: string;
  hostNameB: string;
  hostAvatarA: string | null;
  hostAvatarB: string | null;
  verifiedA: boolean;
  verifiedB: boolean;
  followingA: boolean;
  followingB: boolean;
  likesA: number;
  likesB: number;
  showDonorsA: boolean;
  showDonorsB: boolean;
  onToggleFollow: (side: 'a' | 'b') => void;
  showRanking: boolean;
  setShowRanking: (v: boolean) => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  messages: ChatMsg[];
  chatRef: React.RefObject<FlatList<ChatMsg> | null>;
  giftTickerA: GiftTick[];
  giftTickerB: GiftTick[];
  onGiftTickExpireA: (id: string) => void;
  onGiftTickExpireB: (id: string) => void;
  crownA: string | null;
  crownB: string | null;
  bigGift: { id: string; senderName: string; emoji: string; giftName: string; GoGold: number } | null;
  giftNotifsA: GiftNotif[];
  giftNotifsB: GiftNotif[];
  onGiftShownA: (id: string) => void;
  onGiftShownB: (id: string) => void;
  giftOverlayA: React.RefObject<LiveGiftOverlayRef | null>;
  giftOverlayB: React.RefObject<LiveGiftOverlayRef | null>;
  effectBanner: EffectBanner | null;
  onReact: (side: 'a' | 'b') => void;
  onSendChat: () => void;
  onClose: () => void;
  isHost: boolean;
  isRecording: boolean;
  recordingLoading: boolean;
  onToggleRecording: () => void;
}> = ({
  battle, remaining, goal, ranking, floaters, heartCountA, heartCountB, ended, leaving, myId, myHostSide, followedSide,
  hostNameA, hostNameB, hostAvatarA, hostAvatarB,
  verifiedA, verifiedB, followingA, followingB, likesA, likesB, showDonorsA, showDonorsB, onToggleFollow,
  showRanking, setShowRanking,
  chatInput, setChatInput, messages, chatRef,
  giftTickerA, giftTickerB, onGiftTickExpireA, onGiftTickExpireB, crownA, crownB, bigGift, giftNotifsA, giftNotifsB, onGiftShownA, onGiftShownB, giftOverlayA, giftOverlayB,
  effectBanner, onReact, onSendChat, onClose,
  isHost, isRecording, recordingLoading, onToggleRecording,
}) => {
  const allTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const allAudioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const roomParticipants = useParticipants();
  const insets = useSafeAreaInsets();
  const [showParticipants, setShowParticipants] = useState(false);
  // Destinataire actuel de la rangée de cadeaux — quel camp (A ou B) tapoté
  const [giftSide, setGiftSide] = useState<'a' | 'b' | null>(null);

  // Viewer qui ne suit qu'un camp : coupe l'audio de l'adversaire cote reception, sans
  // toucher a la publication (les hosts, eux, doivent toujours s'entendre l'un l'autre).
  useEffect(() => {
    if (!battle || !followedSide) return;
    const mutedHostId = followedSide === 'a' ? battle.host_b_id : battle.host_a_id;
    const pub = allAudioTracks.find(t => t.participant.identity === mutedHostId)?.publication;
    if (!(pub instanceof RemoteTrackPublication)) return;
    pub.setEnabled(false);
    return () => pub.setEnabled(true);
  }, [battle, followedSide, allAudioTracks]);

  // Seul un host publie sa camera/micro dans la room de battle — un viewer ne detient
  // qu'un token subscriber, setCameraEnabled echouerait silencieusement de toute facon,
  // mais on evite explicitement de lui demander la permission camera pour rien.
  // On attend l'etat Connected (pas juste le montage du composant) car la publication
  // demandee avant la fin de la negociation WebRTC echoue silencieusement (.catch avale
  // l'erreur) et ne se rattrapait jamais tant que l'ecran n'etait pas remonte (hot-reload).
  useEffect(() => {
    if (!myHostSide || connectionState !== ConnectionState.Connected) return;
    localParticipant.setCameraEnabled(true).catch(() => {});
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
    return () => {
      localParticipant.setCameraEnabled(false).catch(() => {});
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    };
  }, [myHostSide, localParticipant, connectionState]);

  const trackA = battle ? allTracks.find(t => t.participant.identity === battle.host_a_id) : null;
  const trackB = battle ? allTracks.find(t => t.participant.identity === battle.host_b_id) : null;

  const scoreA = battle?.score_a ?? 0;
  const scoreB = battle?.score_b ?? 0;
  const total = scoreA + scoreB;
  const pctA = total > 0 ? (scoreA / total) * 100 : 50;
  const leadingSide: 'a' | 'b' | null = total === 0 ? null : scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : null;
  // Position de la ligne de partage de la barre de score — reflète la part réelle
  // de chaque camp, bornée [15,85] pour qu'aucun camp ne disparaisse visuellement
  // de la barre même en cas de domination écrasante (même règle que le web).
  const scoreSplitPct = total > 0 ? Math.min(85, Math.max(15, pctA)) : 50;

  const hypeMessage = useHypeMessage({
    remaining, scoreA, scoreB, leadingSide, hostNameA, hostNameB,
    isActive: battle?.status === 'active',
  });

  const topDonor = ranking?.top_donor;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Header — épuré comme le web (BattlePage.tsx) : fermer, participants,
          titre "BATTLE LIVE" + pastille pulsante centré, top supporter/classement.
          Countdown et score sont sortis d'ici (cf. score bar sous les hosts et
          VS+countdown flottants au centre de la vidéo, comme le web). */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8} disabled={leaving}>
            {leaving ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="x" size={20} color="#fff" />}
          </TouchableOpacity>

          <TouchableOpacity style={styles.participantsBtn} onPress={() => setShowParticipants(true)} activeOpacity={0.8}>
            <Icon name="users" size={13} color="#fff" />
            <Text style={styles.participantsBtnText}>{roomParticipants.length}</Text>
          </TouchableOpacity>

          {isHost && (
            <TouchableOpacity
              style={[styles.participantsBtn, isRecording && styles.recordingBtnActive]}
              onPress={onToggleRecording}
              disabled={recordingLoading}
              activeOpacity={0.8}
            >
              {recordingLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name={isRecording ? 'check-circle' : 'video'} size={13} color={isRecording ? '#F0365A' : '#fff'} />}
            </TouchableOpacity>
          )}

          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitleText}>BATTLE LIVE</Text>
            <PulsingDot />
          </View>

          <View style={styles.headerSpacer} />

          {topDonor ? (
            <Animated.View entering={ZoomIn.duration(350).springify()}>
              <TouchableOpacity style={styles.topDonorBadge} onPress={() => setShowRanking(true)} activeOpacity={0.8}>
                {topDonor.avatar_url
                  ? <Image source={{ uri: topDonor.avatar_url }} style={styles.topDonorAvatar} />
                  : <View style={[styles.topDonorAvatar, styles.topDonorAvatarFallback]}><Icon name="user" size={10} color="#fff" /></View>}
                <Text style={styles.topDonorLabel} numberOfLines={1}>👑 {topDonor.display_name ?? 'Supporter'}</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <TouchableOpacity style={styles.rankShortcut} onPress={() => setShowRanking(true)} activeOpacity={0.8}>
              <Icon name="award" size={18} color="#FFD700" />
            </TouchableOpacity>
          )}
        </View>

        {effectBanner && (
          <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(400)} style={styles.effectBanner} pointerEvents="none">
            <Text style={styles.effectIcon}>{weatherIcon(effectBanner.weather)}</Text>
            <Text style={styles.effectText} numberOfLines={2}>{effectBanner.message}</Text>
          </Animated.View>
        )}

      </View>

      {/* Rangée hosts — avatar + nom + badge vérifié + compteur j'aime + Suivre,
          un par camp (portage du design web BattlePage.tsx). */}
      <View style={styles.hostsRow}>
        <View style={styles.hostsRowSide}>
          {hostAvatarA
            ? <Image source={{ uri: hostAvatarA }} style={styles.hostsRowAvatar} />
            : <View style={[styles.hostsRowAvatar, styles.hostsRowAvatarFallbackA]}><Icon name="user" size={14} color="#fff" /></View>}
          <View style={styles.hostsRowInfo}>
            <View style={styles.hostsRowNameLine}>
              <Text style={styles.hostsRowName} numberOfLines={1}>{hostNameA}</Text>
              {verifiedA && <VerifiedCheck />}
            </View>
            <Text style={styles.hostsRowLikes}>{likesA.toLocaleString('fr-FR')} j'aime</Text>
          </View>
          {myHostSide !== 'a' && (
            <TouchableOpacity
              style={[styles.followBtn, followingA ? styles.followBtnActive : styles.followBtnA]}
              onPress={() => onToggleFollow('a')} activeOpacity={0.85}>
              <Text style={styles.followBtnText}>{followingA ? 'Suivi' : 'Suivre'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Même ordre JSX que le côté A (avatar → info → bouton) — c'est le
            conteneur (hostsRowSideRight, row-reverse) qui inverse l'affichage
            visuel, pas le JSX lui-même. Avant ce fix, le JSX était pré-inversé
            à la main ET le conteneur inversait une seconde fois : sans bouton
            Suivre (host qui se regarde), row-reverse recalculait l'espacement
            différemment et l'avatar/nom/like se retrouvaient placés au hasard. */}
        <View style={[styles.hostsRowSide, styles.hostsRowSideRight]}>
          {hostAvatarB
            ? <Image source={{ uri: hostAvatarB }} style={styles.hostsRowAvatar} />
            : <View style={[styles.hostsRowAvatar, styles.hostsRowAvatarFallbackB]}><Icon name="user" size={14} color="#fff" /></View>}
          <View style={[styles.hostsRowInfo, styles.hostsRowInfoRight]}>
            <View style={[styles.hostsRowNameLine, styles.hostsRowNameLineRight]}>
              {verifiedB && <VerifiedCheck />}
              <Text style={styles.hostsRowName} numberOfLines={1}>{hostNameB}</Text>
            </View>
            <Text style={styles.hostsRowLikes}>{likesB.toLocaleString('fr-FR')} j'aime</Text>
          </View>
          {myHostSide !== 'b' && (
            <TouchableOpacity
              style={[styles.followBtn, followingB ? styles.followBtnActive : styles.followBtnB]}
              onPress={() => onToggleFollow('b')} activeOpacity={0.85}>
              <Text style={styles.followBtnText}>{followingB ? 'Suivi' : 'Suivre'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Barre de score pleine largeur — un score par camp aux extrémités,
          dégradé violet→rose dont la ligne de partage suit réellement la
          proportion du score de chaque camp (scoreSplitPct), comme le web
          (BattlePage.tsx) — remplace l'ancienne barre compacte du header. */}
      <View style={styles.scoreBarTrack}>
        <LinearGradient
          colors={['#7B3FF2', '#4C1D95', '#9B1C3F', '#F0365A']}
          locations={[0, Math.max(0, scoreSplitPct / 100 - 0.02), Math.min(1, scoreSplitPct / 100 + 0.02), 1]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <BouncyNumber value={scoreA} style={styles.scoreText} />
        <HypeBanner message={hypeMessage} />
        <BouncyNumber value={scoreB} style={styles.scoreText} />
      </View>

      {/* Zone video — occupe l'espace restant, les deux hosts en cartes arrondies centrees */}
      <View style={styles.videoZone}>
        <LinearGradient
          colors={['#150F24', '#1C0F18', '#150F24']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <AnimatedTouchable
          entering={FadeIn.duration(400)}
          activeOpacity={0.92}
          onPress={() => setGiftSide(prev => (prev === 'a' ? null : 'a'))}
          style={[
            styles.videoHalf, styles.videoHalfA,
            leadingSide === 'a' && [styles.videoHalfLeading, styles.videoHalfLeadingA],
          ]}
        >
          {trackA
            ? <VideoTrack trackRef={trackA} style={styles.videoInner} objectFit="cover" />
            : <View style={[styles.videoInner, styles.noVideo]}><ActivityIndicator color="#fff" /></View>}
          {leadingSide === 'a' && <PulsingHalo color="#7B3FF2" />}

          {/* Badge WIN ×N — victoires historiques du host A */}
          {(battle?.win_count_a ?? 0) > 0 && (
            <View style={styles.winBadge}>
              <Text style={styles.winBadgeLabel}>WIN</Text>
              <Text style={styles.winBadgeCount}>×{battle?.win_count_a}</Text>
            </View>
          )}

          {/* Bandeau nom + avatar du camp A */}
          <Animated.View entering={SlideInUp.duration(450).delay(100)} style={[styles.hostBadge, styles.hostBadgeA]}>
            {crownA && <CrownPop key={crownA} />}
            {hostAvatarA
              ? <Image source={{ uri: hostAvatarA }} style={styles.hostBadgeAvatar} />
              : <View style={[styles.hostBadgeAvatar, styles.hostBadgeAvatarFallback]}><Icon name="user" size={12} color="#fff" /></View>}
            <Text style={styles.hostBadgeName} numberOfLines={1}>{hostNameA}</Text>
            {leadingSide === 'a' && <Text style={styles.hostBadgeCrown}>👑</Text>}
          </Animated.View>

          {/* Compteur de coeurs recus — purement indicatif, sans effet sur le score */}
          <View style={[styles.heartCounter, styles.heartCounterA]}>
            <Text style={styles.heartCounterIcon}>❤️</Text>
            <Text style={styles.heartCounterText}>{heartCountA}</Text>
          </View>

          {giftTickerA.map(t => (
            <GiftTickItem key={t.id} tick={t} colors={['#7B3FF2', '#4C1D95']} onExpire={onGiftTickExpireA} />
          ))}
          <LiveGiftOverlay
            ref={giftOverlayA}
            liveId={battle?.live_a_id ?? ''}
            incomingNotifs={giftNotifsA}
            onNotifShown={onGiftShownA}
          />

          {/* Top 3 donateurs du camp A — visible tant que des cadeaux arrivent */}
          {showDonorsA && (ranking?.top_donors_a?.length ?? 0) > 0 && (
            <View style={styles.donorsCards} pointerEvents="none">
              {(ranking?.top_donors_a ?? []).slice(0, 3).map(d => (
                <View key={d.id} style={styles.donorCard}>
                  {d.avatar_url
                    ? <Image source={{ uri: d.avatar_url }} style={styles.donorCardAvatar} />
                    : <View style={[styles.donorCardAvatar, styles.donorCardAvatarFallback]}><Icon name="user" size={11} color="#fff" /></View>}
                  <View style={styles.donorCardInfo}>
                    <Text style={styles.donorCardName} numberOfLines={1}>{d.display_name}</Text>
                    <Text style={styles.donorCardGift} numberOfLines={1}>a envoyé {d.last_gift_name ?? 'un cadeau'}</Text>
                  </View>
                  {!!d.last_gift_emoji && <Text style={styles.donorCardEmoji}>{d.last_gift_emoji}</Text>}
                  <Text style={styles.donorCardCount}>×{d.gifts_count}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Avatars top supporters en cascade + badge MVP */}
          {(ranking?.top_donors_a?.length ?? 0) > 0 && (
            <View style={styles.mvpRow} pointerEvents="none">
              {(ranking?.top_donors_a ?? []).slice(0, 3).map((d, i) => (
                d.avatar_url
                  ? <Image key={d.id} source={{ uri: d.avatar_url }} style={[styles.mvpAvatar, i > 0 && { marginLeft: -8 }]} />
                  : <View key={d.id} style={[styles.mvpAvatar, styles.mvpAvatarFallbackA, i > 0 && { marginLeft: -8 }]}><Icon name="user" size={10} color="#fff" /></View>
              ))}
              <View style={styles.mvpBadge}><Text style={styles.mvpBadgeText}>MVP</Text></View>
            </View>
          )}
        </AnimatedTouchable>

        {/* VS + countdown flottants au centre de la zone vidéo, comme le web
            (BattlePage.tsx) — le countdown n'est plus dans le header. */}
        <View style={styles.vsWrap} pointerEvents="none">
          <Animated.View entering={BounceIn.duration(600).delay(200)} style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </Animated.View>
          <View style={styles.centerCountdownWrap}>
            <Text style={styles.centerCountdownText}>{formatCountdown(remaining)}</Text>
          </View>
        </View>

        <AnimatedTouchable
          entering={FadeIn.duration(400)}
          activeOpacity={0.92}
          onPress={() => setGiftSide(prev => (prev === 'b' ? null : 'b'))}
          style={[
            styles.videoHalf, styles.videoHalfB,
            leadingSide === 'b' && [styles.videoHalfLeading, styles.videoHalfLeadingB],
          ]}
        >
          {trackB
            ? <VideoTrack trackRef={trackB} style={styles.videoInner} objectFit="cover" />
            : <View style={[styles.videoInner, styles.noVideo]}><ActivityIndicator color="#fff" /></View>}
          {leadingSide === 'b' && <PulsingHalo color="#F0365A" />}

          {/* Badge WIN ×N — victoires historiques du host B */}
          {(battle?.win_count_b ?? 0) > 0 && (
            <View style={[styles.winBadge, styles.winBadgeRight]}>
              <Text style={styles.winBadgeLabel}>WIN</Text>
              <Text style={styles.winBadgeCount}>×{battle?.win_count_b}</Text>
            </View>
          )}

          {/* Bandeau nom + avatar du camp B */}
          <Animated.View entering={SlideInUp.duration(450).delay(150)} style={[styles.hostBadge, styles.hostBadgeB]}>
            {leadingSide === 'b' && <Text style={styles.hostBadgeCrown}>👑</Text>}
            <Text style={styles.hostBadgeName} numberOfLines={1}>{hostNameB}</Text>
            {hostAvatarB
              ? <Image source={{ uri: hostAvatarB }} style={styles.hostBadgeAvatar} />
              : <View style={[styles.hostBadgeAvatar, styles.hostBadgeAvatarFallback]}><Icon name="user" size={12} color="#fff" /></View>}
            {crownB && <CrownPop key={crownB} />}
          </Animated.View>

          {/* Compteur de coeurs recus — purement indicatif, sans effet sur le score */}
          <View style={[styles.heartCounter, styles.heartCounterB]}>
            <Text style={styles.heartCounterIcon}>❤️</Text>
            <Text style={styles.heartCounterText}>{heartCountB}</Text>
          </View>

          {giftTickerB.map(t => (
            <GiftTickItem key={t.id} tick={t} colors={['#F0365A', '#9B1C3F']} onExpire={onGiftTickExpireB} />
          ))}
          <LiveGiftOverlay
            ref={giftOverlayB}
            liveId={battle?.live_b_id ?? ''}
            incomingNotifs={giftNotifsB}
            onNotifShown={onGiftShownB}
          />

          {/* Top 3 donateurs du camp B — visible tant que des cadeaux arrivent */}
          {showDonorsB && (ranking?.top_donors_b?.length ?? 0) > 0 && (
            <View style={styles.donorsCards} pointerEvents="none">
              {(ranking?.top_donors_b ?? []).slice(0, 3).map(d => (
                <View key={d.id} style={styles.donorCard}>
                  {d.avatar_url
                    ? <Image source={{ uri: d.avatar_url }} style={styles.donorCardAvatar} />
                    : <View style={[styles.donorCardAvatar, styles.donorCardAvatarFallback]}><Icon name="user" size={11} color="#fff" /></View>}
                  <View style={styles.donorCardInfo}>
                    <Text style={styles.donorCardName} numberOfLines={1}>{d.display_name}</Text>
                    <Text style={styles.donorCardGift} numberOfLines={1}>a envoyé {d.last_gift_name ?? 'un cadeau'}</Text>
                  </View>
                  {!!d.last_gift_emoji && <Text style={styles.donorCardEmoji}>{d.last_gift_emoji}</Text>}
                  <Text style={styles.donorCardCount}>×{d.gifts_count}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Avatars top supporters en cascade + badge MVP */}
          {(ranking?.top_donors_b?.length ?? 0) > 0 && (
            <View style={styles.mvpRow} pointerEvents="none">
              {(ranking?.top_donors_b ?? []).slice(0, 3).map((d, i) => (
                d.avatar_url
                  ? <Image key={d.id} source={{ uri: d.avatar_url }} style={[styles.mvpAvatar, i > 0 && { marginLeft: -8 }]} />
                  : <View key={d.id} style={[styles.mvpAvatar, styles.mvpAvatarFallbackB, i > 0 && { marginLeft: -8 }]}><Icon name="user" size={10} color="#fff" /></View>
              ))}
              <View style={styles.mvpBadge}><Text style={styles.mvpBadgeText}>MVP</Text></View>
            </View>
          )}
        </AnimatedTouchable>

        {/* Reactions flottantes — montent du bas vers le haut a cote de chaque camp,
            purement visuelles (ne comptent pas dans le score, seuls les cadeaux comptent) */}
        {floaters.map(f => (
          <View key={f.id} style={f.side === 'a' ? styles.floaterAnchorA : styles.floaterAnchorB} pointerEvents="none">
            <RisingHeart drift={f.drift} />
          </View>
        ))}

        {/* Objectif communautaire — centré en bas de la zone vidéo (déplacé du
            header, comme côté web) plutôt qu'en haut de l'écran. */}
        {goal && goal.status === 'active' && (
          <Animated.View
            entering={SlideInDown.duration(400).springify()}
            style={[styles.goalBanner, goal.mode === 'boss' && styles.goalBannerBoss]}
            pointerEvents="none"
          >
            <Text style={styles.goalTitle}>{goal.mode === 'boss' ? '🐉 ' : '🎯 '}{goal.title}</Text>
            <View style={styles.goalBarTrack}>
              <Animated.View
                layout={LinearTransition.springify().damping(14)}
                style={[styles.goalBarFill, { width: `${goal.progress_pct}%` }]}
              />
            </View>
            <Text style={styles.goalPct}>{Math.round(goal.progress_pct)}%</Text>
          </Animated.View>
        )}
      </View>


      {/* Zone basse — 45% de l'ecran : chat fusionne + boutons de soutien.
          Wrapper externe (bottomZoneShadow) porte l'ombre portee vers le haut
          — une View avec overflow:hidden (nécessaire pour les coins arrondis)
          coupe toute ombre placée sur elle-même, d'où ce conteneur séparé qui,
          lui, n'a pas de overflow:hidden et laisse l'ombre se dessiner. */}
      <View style={styles.bottomZoneShadow}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomZone}
      >
        {!ended && (
          <FlatList
            ref={chatRef}
            data={messages}
            keyExtractor={m => m.id}
            style={styles.chatList}
            contentContainerStyle={{ paddingVertical: 6 }}
            renderItem={({ item }) => (
              <View style={styles.chatRow}>
                <View style={[styles.chatSideDot, item.side === 'a' ? styles.chatSideDotA : styles.chatSideDotB]} />
                <Text style={styles.chatText} numberOfLines={2}>
                  <Text style={[styles.chatUser, item.side === 'a' ? styles.chatUserA : styles.chatUserB]}>{item.user}</Text>
                  {'  '}{item.text}
                </Text>
              </View>
            )}
          />
        )}

        {/* Envoyer un cadeau — une carte par competiteur, cote a cote, sans ambiguite sur le destinataire.
            Tapoter bascule l'affichage de la rangée de cadeaux (tap sur un cadeau = envoi immédiat). */}
        <View style={styles.giftRow}>
          <TouchableOpacity
            style={[styles.giftCard, styles.giftCardA, giftSide === 'a' && styles.giftCardActive]}
            onPress={() => setGiftSide(prev => (prev === 'a' ? null : 'a'))}
            activeOpacity={0.85}
          >
            {hostAvatarA
              ? <Image source={{ uri: hostAvatarA }} style={styles.giftCardAvatar} />
              : <View style={[styles.giftCardAvatar, styles.giftCardAvatarFallback]}><Icon name="user" size={10} color="#fff" /></View>}
            <Text style={styles.giftCardName} numberOfLines={1}>{hostNameA}</Text>
            <View style={styles.giftCardIconWrap}>
              <Text style={styles.giftCardIcon}>🎁</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.giftCard, styles.giftCardB, giftSide === 'b' && styles.giftCardActive]}
            onPress={() => setGiftSide(prev => (prev === 'b' ? null : 'b'))}
            activeOpacity={0.85}
          >
            <View style={styles.giftCardIconWrap}>
              <Text style={styles.giftCardIcon}>🎁</Text>
            </View>
            <Text style={styles.giftCardName} numberOfLines={1}>{hostNameB}</Text>
            {hostAvatarB
              ? <Image source={{ uri: hostAvatarB }} style={styles.giftCardAvatar} />
              : <View style={[styles.giftCardAvatar, styles.giftCardAvatarFallback]}><Icon name="user" size={10} color="#fff" /></View>}
          </TouchableOpacity>
        </View>

        {giftSide && battle && (
          <LiveGiftBar
            liveId={giftSide === 'a' ? battle.live_a_id : battle.live_b_id}
            receiverId={giftSide === 'a' ? battle.host_a_id : battle.host_b_id}
            onGiftSent={(emoji) => (giftSide === 'a' ? giftOverlayA : giftOverlayB).current?.notifySent(emoji)}
          />
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.reactBtn, styles.reactBtnA]} onPress={() => onReact('a')} activeOpacity={0.8}>
            <Icon name="heart" size={15} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reactBtn, styles.reactBtnB]} onPress={() => onReact('b')} activeOpacity={0.8}>
            <Icon name="heart" size={15} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.reactBtn} onPress={() => setShowRanking(true)} activeOpacity={0.8}>
            <Icon name="award" size={15} color="#FFD700" />
          </TouchableOpacity>
        </View>

        <View style={[styles.chatInputRow, { paddingBottom: 10 + insets.bottom }]}>
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Écris un commentaire…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.chatInput}
            onSubmitEditing={onSendChat}
            returnKeyType="send"
          />
          <TouchableOpacity onPress={onSendChat} style={styles.chatSendBtn}>
            <Icon name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </View>

      {/* Panneau classement supporters */}
      {showRanking && (
        <View style={styles.rankingOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowRanking(false)} />
          <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)} style={[styles.rankingSheet, { paddingBottom: 30 + insets.bottom }]}>
            <View style={styles.rankingHandle} />
            <Text style={styles.rankingTitle}>🏆 Classement des supporters</Text>
            {!ranking || ranking.top_10.length === 0 ? (
              <Text style={styles.rankingEmpty}>Aucun cadeau envoyé pour le moment.</Text>
            ) : (
              <FlatList
                data={ranking.top_10}
                keyExtractor={(item, idx) => `${item.id}-${idx}`}
                style={{ maxHeight: SCREEN_H * 0.4 }}
                renderItem={({ item, index }) => (
                  <Animated.View entering={SlideInDown.duration(300).delay(index * 40)} style={styles.rankRow}>
                    <Text style={styles.rankPos}>{index + 1}</Text>
                    {item.avatar_url
                      ? <Image source={{ uri: item.avatar_url }} style={styles.rankAvatar} />
                      : <View style={[styles.rankAvatar, styles.rankAvatarFallback]}><Icon name="user" size={14} color="rgba(255,255,255,0.5)" /></View>}
                    <Text style={styles.rankName} numberOfLines={1}>{item.display_name ?? 'Supporter'}</Text>
                    <Text style={styles.rankAmount}>{item.gogold_spent} 🪙</Text>
                  </Animated.View>
                )}
              />
            )}
            {ranking?.surprise && (
              <View style={styles.surpriseRow}>
                <Icon name="star" size={14} color="#FFD700" />
                <Text style={styles.surpriseText}>Supporter surprise : {ranking.surprise.display_name ?? 'Anonyme'}</Text>
              </View>
            )}
          </Animated.View>
        </View>
      )}

      <LiveParticipantsModal
        visible={showParticipants}
        onClose={() => setShowParticipants(false)}
        participants={roomParticipants.map(p => ({
          identity:  p.identity,
          name:      p.name || p.identity,
          avatarUrl: participantAvatarUrl(p.metadata),
          isHost:    p.identity === battle?.host_a_id || p.identity === battle?.host_b_id,
        }))}
      />

      {/* Gros cadeau — banniere plein ecran avec trone + nom du donateur, "il est le roi" */}
      {bigGift && (
        <Animated.View
          key={bigGift.id}
          entering={ZoomIn.duration(450).springify()}
          exiting={FadeOut.duration(350)}
          style={styles.bigGiftOverlay}
          pointerEvents="none"
        >
          <LinearGradient colors={['#F59E0B', '#F0365A', '#9B65F5']} style={styles.bigGiftGlow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.bigGiftThroneWrap}>
              <Animated.Text entering={BounceIn.duration(650).delay(100)} style={styles.bigGiftThrone}>🪑</Animated.Text>
              <Animated.Text entering={ZoomIn.duration(500).delay(350).springify()} style={styles.bigGiftCrownOnThrone}>👑</Animated.Text>
            </View>
            <Text style={styles.bigGiftKingLabel}>LE ROI DU MATCH</Text>
            <Animated.Text entering={BounceIn.duration(600).delay(500)} style={styles.bigGiftEmoji}>{bigGift.emoji}</Animated.Text>
            <Text style={styles.bigGiftGiftName}>{bigGift.giftName}</Text>
            <Text style={styles.bigGiftSender} numberOfLines={1}>{bigGift.senderName}</Text>
            <View style={styles.bigGiftGogoldPill}>
              <Text style={styles.bigGiftGogoldText}>🪙 {bigGift.GoGold.toLocaleString('fr-FR')} GoGold</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Ecran de fin — composant partagé (même design que TournamentBracketScreen/
          LiveOneVsOneScreen), pour que le résultat soit identique quel que soit
          l'écran d'où on le voit. */}
      {ended && (() => {
        const iWon = ended.winner_id !== null && ended.winner_id === myId;
        const winnerName = ended.winner_id === battle?.host_a_id ? hostNameA : hostNameB;
        const loserName  = ended.winner_id === battle?.host_a_id ? hostNameB : hostNameA;
        const winnerAvatar = ended.winner_id === battle?.host_a_id ? hostAvatarA : hostAvatarB;
        const winnerGoGold = ended.winner_id === battle?.host_a_id ? ended.score_a : ended.score_b;
        const viewerRole: 'won' | 'lost' | 'spectator' =
          ended.winner_id === null ? 'spectator' : iWon ? 'won' : ended.winner_id === myId ? 'spectator' : 'lost';

        return (
          <MatchResultModal
            result={{
              isDraw: ended.winner_id === null,
              viewerRole,
              winnerName,
              loserName,
              winnerAvatar,
              scoreA: ended.score_a,
              scoreB: ended.score_b,
              winnerGoGold,
              forfeitPenalty: ended.forfeitPenalty ?? null,
              forfeitByMe: ended.forfeitBy === myId,
            }}
            onClose={onClose}
          />
        );
      })()}
    </View>
  );
};

const BOTTOM_ZONE_H = SCREEN_H * 0.45;

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Header — épuré comme le web : fermer, participants, titre BATTLE LIVE,
  // objectif/effets, top supporter. Auto-dimensionné (plus de hauteur fixe
  // HEADER_H) puisqu'il ne porte plus qu'une seule ligne de contrôles.
  header: {
    width: '100%', backgroundColor: 'rgba(11,8,18,0.92)',
    paddingHorizontal: 14, paddingBottom: 10,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    borderBottomWidth: 1, borderBottomColor: 'rgba(155,101,245,0.35)',
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitleWrap: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  headerTitleText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  headerPulsingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  headerSpacer: { flex: 1 },

  // Zone video — absorbe tout l'espace restant (comme le web, flex-1) plutôt
  // qu'une hauteur fixe : header/hostsRow/scoreBar sont maintenant auto-
  // dimensionnés, plus jamais figés à 15% de l'écran.
  videoZone: {
    width: '100%', flex: 1, flexDirection: 'row',
    backgroundColor: '#000', padding: 10, gap: 8, alignItems: 'center',
  },
  videoHalf: {
    flex: 1, height: '100%', backgroundColor: '#111', overflow: 'hidden', position: 'relative',
    borderRadius: 18, borderWidth: 1.5,
  },
  videoHalfA: { borderColor: 'rgba(155,101,245,0.4)' },
  videoHalfB: { borderColor: 'rgba(240,54,90,0.4)' },
  videoHalfLeading: { borderWidth: 2, shadowOpacity: 0.9, shadowRadius: 14, elevation: 10 },
  videoHalfLeadingA: { borderColor: '#9B65F5', shadowColor: '#9B65F5' },
  videoHalfLeadingB: { borderColor: '#F0365A', shadowColor: '#F0365A' },
  // Radius légèrement inférieur au conteneur (videoHalf: 18) pour rester bien
  // à l'intérieur du cadre — un radius interne égal ou supérieur au radius
  // externe laisse dépasser des coins carrés de la vidéo hors du cadre arrondi.
  videoInner: { ...StyleSheet.absoluteFill, borderRadius: 16 },
  noVideo: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },

  // Badge VS + countdown, centrés entre les deux cartes (comme le web)
  vsWrap: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center', zIndex: 25, marginTop: -24 },
  vsBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFD700', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 8, elevation: 10,
  },
  vsText: { color: '#1a1030', fontSize: 12, fontWeight: '900' },

  // Bandeau nom + avatar par camp — décalé sous le badge WIN (top: 6, hauteur
  // ~22px) pour ne jamais le chevaucher ; avant ce fix les deux badges étaient
  // à la même position (top: 6) et se superposaient visuellement.
  hostBadge: {
    position: 'absolute', top: 32,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 18,
    paddingVertical: 3, paddingHorizontal: 7, maxWidth: '92%',
    zIndex: 15,
  },
  hostBadgeA: { left: 6 },
  hostBadgeB: { right: 6 },
  hostBadgeAvatar: { width: 18, height: 18, borderRadius: 9 },
  hostBadgeAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  hostBadgeName: { color: '#fff', fontSize: 11, fontWeight: '700', flexShrink: 1 },
  hostBadgeCrown: { fontSize: 12 },
  crownPop: {
    position: 'absolute', top: -20, left: 0, right: 0, alignItems: 'center', zIndex: 20,
  },
  crownPopEmoji: {
    fontSize: 22, textShadowColor: 'rgba(255,215,0,0.9)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
  },

  // Compteur de coeurs recus par camp — juste sous le bandeau nom/avatar
  // Sous le badge nom (hostBadge: top 32, hauteur ~24px) — même logique de
  // cascade verticale que winBadge → hostBadge → heartCounter, chacun décalé
  // pour ne jamais chevaucher le précédent.
  heartCounter: {
    position: 'absolute', top: 60,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14,
    paddingVertical: 2, paddingHorizontal: 7,
    zIndex: 15,
  },
  heartCounterA: { left: 6 },
  heartCounterB: { right: 6 },
  heartCounterIcon: { fontSize: 11 },
  heartCounterText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Wrapper externe — porte l'ombre portée vers le haut (effet "feuille posée
  // par-dessus la vidéo"), séparé de bottomZone qui a overflow:hidden pour ses
  // coins arrondis (un overflow:hidden coupe toute ombre placée sur le même
  // élément, d'où ce conteneur dédié uniquement à l'ombre).
  bottomZoneShadow: {
    width: '100%', height: BOTTOM_ZONE_H,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5, shadowRadius: 14, elevation: 18,
  },
  // Zone basse — 45% de l'ecran, fixe : chat (flexible) + actions + saisie
  // (toujours visibles) — même teinte violette que le header (rgba(11,8,18,…))
  // au lieu d'un noir pur qui tranchait avec le reste de l'écran.
  bottomZone: {
    width: '100%', height: '100%', backgroundColor: 'rgba(15,11,26,0.97)',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 },

  // Envoyer un cadeau — carte dediee par competiteur, sans ambiguite sur le destinataire
  giftRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingTop: 6 },
  giftCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 13, paddingVertical: 5, paddingHorizontal: 7,
    borderWidth: 1,
  },
  giftCardA: { backgroundColor: 'rgba(123,63,242,0.14)', borderColor: 'rgba(123,63,242,0.4)' },
  giftCardB: { backgroundColor: 'rgba(240,54,90,0.14)', borderColor: 'rgba(240,54,90,0.4)' },
  giftCardActive: { borderWidth: 2, opacity: 1 },
  giftCardAvatar: { width: 19, height: 19, borderRadius: 10 },
  giftCardAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  giftCardName: { flex: 1, color: '#fff', fontSize: 11, fontWeight: '700' },
  giftCardIconWrap: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  giftCardIcon: { fontSize: 11 },

  // Barre de score pleine largeur, juste sous la rangée hosts — même fond et
  // même logique de dégradé dynamique que le web (BattlePage.tsx).
  scoreBarTrack: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8, overflow: 'hidden',
    backgroundColor: '#2A1D42',
  },
  scoreText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hypeText: {
    flex: 1, minWidth: 0, textAlign: 'center',
    color: '#fff', fontSize: 11, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },

  // Countdown flottant au centre de la vidéo, sous le badge VS (comme le web)
  centerCountdownWrap: {
    marginTop: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  centerCountdownText: {
    color: '#fff', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },

  effectBanner: {
    width: '100%', marginTop: 6,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 20, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)',
  },
  effectIcon: { fontSize: 20 },
  effectText: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '700' },

  // Objectif communautaire — centré en bas de la zone vidéo (déplacé du header)
  goalBanner: {
    position: 'absolute', bottom: 8, left: '12%', right: '12%',
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20, padding: 10, gap: 5,
    zIndex: 25,
  },
  goalBannerBoss: { borderWidth: 1.5, borderColor: '#EF4444' },
  goalTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  goalBarTrack: { height: 7, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  goalBarFill: { height: '100%', backgroundColor: '#FFD700', borderRadius: 6 },
  goalPct: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600', alignSelf: 'flex-end' },

  // Rangée hosts — sous le header, avatar+nom+vérifié+j'aime+Suivre par camp
  hostsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 6, gap: 6,
  },
  hostsRowSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  hostsRowSideRight: { flexDirection: 'row-reverse' },
  hostsRowAvatar: { width: 30, height: 30, borderRadius: 15 },
  hostsRowAvatarFallbackA: { backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  hostsRowAvatarFallbackB: { backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center' },
  hostsRowInfo: { flex: 1, minWidth: 0 },
  hostsRowInfoRight: { alignItems: 'flex-end' },
  hostsRowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hostsRowNameLineRight: { flexDirection: 'row-reverse' },
  hostsRowName: { color: '#fff', fontSize: 12, fontWeight: '700', maxWidth: 110 },
  hostsRowLikes: { color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 1 },
  verifiedCheck: {
    width: 13, height: 13, borderRadius: 7, backgroundColor: '#1D9BF0',
    alignItems: 'center', justifyContent: 'center',
  },
  followBtn: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  followBtnA: { backgroundColor: '#7B3FF2' },
  followBtnB: { backgroundColor: '#F0365A' },
  followBtnActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  followBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Badge "WIN xN" — victoires historiques, coin haut de chaque moitié vidéo
  winBadge: {
    position: 'absolute', top: 6, left: 6, zIndex: 16,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.4)',
  },
  winBadgeRight: { left: undefined, right: 6 },
  winBadgeLabel: { color: '#FFD700', fontSize: 9, fontWeight: '900', fontStyle: 'italic' },
  winBadgeCount: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Cartes "top donateurs" — classement par camp, au-dessus des avatars MVP
  donorsCards: {
    position: 'absolute', bottom: 30, left: 6, right: 6, gap: 4, zIndex: 15,
  },
  donorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(20,16,28,0.65)', borderRadius: 12,
    paddingVertical: 4, paddingHorizontal: 6, paddingLeft: 3,
  },
  donorCardAvatar: { width: 24, height: 24, borderRadius: 12 },
  donorCardAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  donorCardInfo: { flex: 1, minWidth: 0 },
  donorCardName: { color: '#fff', fontSize: 10, fontWeight: '700' },
  donorCardGift: { color: 'rgba(255,255,255,0.65)', fontSize: 9, marginTop: 1 },
  donorCardEmoji: { fontSize: 16 },
  donorCardCount: { color: '#FDE68A', fontSize: 11, fontWeight: '900' },

  // Avatars top supporters en cascade + badge MVP — coin bas de chaque moitié
  mvpRow: {
    position: 'absolute', bottom: 6, left: 6, zIndex: 15,
    flexDirection: 'row', alignItems: 'center',
  },
  mvpAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#0B0812' },
  mvpAvatarFallbackA: { backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  mvpAvatarFallbackB: { backgroundColor: '#F0365A', alignItems: 'center', justifyContent: 'center' },
  mvpBadge: { marginLeft: 4, backgroundColor: '#FFD700', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5 },
  mvpBadgeText: { color: '#000', fontSize: 8, fontWeight: '900' },

  topDonorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,215,0,0.14)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6,
    maxWidth: 110, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  topDonorAvatar: { width: 18, height: 18, borderRadius: 9 },
  topDonorAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  topDonorLabel: { color: '#FFD700', fontSize: 10, fontWeight: '700', flexShrink: 1 },

  rankShortcut: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,215,0,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },

  floaterAnchorA: { position: 'absolute', bottom: '10%', left: '25%' },
  floaterAnchorB: { position: 'absolute', bottom: '10%', left: '60%' },
  floater: { fontSize: 20 },

  // Cadeaux compacts par cote (retrecis pour tenir dans le split-screen)
  giftTick: { position: 'absolute', bottom: 4, left: 4, right: 4, zIndex: 30 },
  giftTickGrad: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 16, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start' },
  giftTickEmoji: { fontSize: 11 },
  giftTickText: { color: '#fff', fontSize: 9, flexShrink: 1 },
  giftTickSender: { fontWeight: '800' },

  reactBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  reactBtnA: { backgroundColor: '#7B3FF2CC' },
  reactBtnB: { backgroundColor: '#F0365ACC' },
  giftBtnEmoji: { fontSize: 16 },

  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  participantsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
  },
  participantsBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  recordingBtnActive: { backgroundColor: 'rgba(240,54,90,0.25)', paddingHorizontal: 8 },

  // Chat fusionne
  chatList: { flex: 1 },
  chatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 2, paddingHorizontal: 4 },
  chatSideDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  chatSideDotA: { backgroundColor: '#7B3FF2' },
  chatSideDotB: { backgroundColor: '#F0365A' },
  chatText: { flex: 1, color: '#fff', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  chatUser: { fontWeight: '800' },
  chatUserA: { color: '#C4B5FD' },
  chatUserB: { color: '#FCA5C5' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 2 },
  chatInput: { flex: 1, minWidth: 0, color: '#fff', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chatSendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Panneau classement
  rankingOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', zIndex: 60 },
  rankingSheet: { backgroundColor: '#14101f', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 10 },
  rankingHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center' },
  rankingTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rankingEmpty: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 14 },
  rankPos: { width: 20, color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  rankAvatar: { width: 30, height: 30, borderRadius: 15 },
  rankAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  rankName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  rankAmount: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  surpriseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  surpriseText: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  bigGiftOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 80, backgroundColor: 'rgba(0,0,0,0.35)' },
  bigGiftGlow: {
    width: '78%', borderRadius: 28, paddingVertical: 26, paddingHorizontal: 20, alignItems: 'center', gap: 6,
    shadowColor: '#F0365A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 24, elevation: 20,
  },
  bigGiftThroneWrap: { alignItems: 'center', justifyContent: 'center' },
  bigGiftThrone: {
    fontSize: 90,
    textShadowColor: 'rgba(255,215,0,0.85)', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 },
  },
  bigGiftCrownOnThrone: { position: 'absolute', top: -8, alignSelf: 'center', fontSize: 34 },
  bigGiftKingLabel: {
    color: '#FFD700', fontSize: 13, fontWeight: '900', letterSpacing: 1.5,
    marginTop: 10, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
  bigGiftEmoji: { fontSize: 44, marginTop: 4 },
  bigGiftGiftName: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 },
  bigGiftSender: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 2 },
  bigGiftGogoldPill: {
    marginTop: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  bigGiftGogoldText: { color: '#FFD700', fontSize: 14, fontWeight: '800' },

});
