/**
 * BattleScreen — match live entre deux créateurs, ecran en 3 zones (25% / 25% / 50%) :
 * header (fermer, countdown, score, objectif/effets, top supporter), zone vidéo
 * compacte avec les deux hosts en cartes arrondies centrées côte à côte (façon TikTok
 * Live Battle) séparées par un badge "VS" — halo lumineux pulsé autour du camp en
 * tête, bandeau nom+avatar par créateur, cadeaux animés — puis zone basse (chat
 * fusionné des deux lives, classement des supporters, actions). Abandon (forfait)
 * qui notifie l'autre côté.
 */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Image, Dimensions, FlatList, TextInput,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, {
  FadeIn, FadeOut, SlideInDown, SlideOutDown, SlideInUp, ZoomIn, BounceIn, LinearTransition,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring, withSequence, Easing,
} from 'react-native-reanimated';
import {
  LiveKitRoom, useTracks, useLocalParticipant, VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { battleService } from '../../services/battleService';
import type { Battle, BattleGoal, BattleRanking } from '../../services/battleService';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { useUser } from '../../context/UserContext';
import { userService } from '../../services/userService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import { LiveGiftOverlay } from '../../components/wallet/LiveGiftOverlay';
import type { GiftNotif, LiveGiftOverlayRef } from '../../components/wallet/LiveGiftOverlay';
import { clearLiveEnteringBattle } from '../../utils/battleTransitionFlags';

const { height: SCREEN_H } = Dimensions.get('window');

interface RouteParams {
  battleId: string;
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
      ws = new WebSocket(`${WS_BASE_URL}/api/v1/social/comments/ws/${targetType}/${targetId}?token=${encodeURIComponent(token)}`);
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
  const { battleId } = route.params as RouteParams;
  const { currentUser } = useUser();
  const { addListener, removeListener } = useWs();

  const [battle, setBattle]   = useState<Battle | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [wsUrl, setWsUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [goal, setGoal]       = useState<BattleGoal | null>(null);
  const [ranking, setRanking] = useState<BattleRanking | null>(null);
  const [floaters, setFloaters] = useState<{ id: string; side: 'a' | 'b' }[]>([]);
  const [ended, setEnded]     = useState<{ winner_id: string | null; score_a: number; score_b: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showRanking, setShowRanking] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [giftTicker, setGiftTicker] = useState<GiftTick[]>([]);
  const [giftNotifsA, setGiftNotifsA] = useState<GiftNotif[]>([]);
  const [giftNotifsB, setGiftNotifsB] = useState<GiftNotif[]>([]);
  const [effectBanner, setEffectBanner] = useState<EffectBanner | null>(null);
  const [hostNameA, setHostNameA] = useState('Créateur A');
  const [hostNameB, setHostNameB] = useState('Créateur B');
  const [hostAvatarA, setHostAvatarA] = useState<string | null>(null);
  const [hostAvatarB, setHostAvatarB] = useState<string | null>(null);

  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatRef   = useRef<FlatList<ChatMsg>>(null);
  const giftOverlayA = useRef<LiveGiftOverlayRef>(null);
  const giftOverlayB = useRef<LiveGiftOverlayRef>(null);
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHost = !!currentUser && battle && (currentUser.id === battle.host_a_id || currentUser.id === battle.host_b_id);
  const myHostSide: 'a' | 'b' | null = !battle || !currentUser
    ? null
    : currentUser.id === battle.host_a_id ? 'a' : currentUser.id === battle.host_b_id ? 'b' : null;

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
          setEnded({ winner_id: b.winner_id, score_a: b.score_a, score_b: b.score_b });
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
        .then(p => { setHostNameA(p.display_name || p.username || 'Créateur A'); setHostAvatarA(p.avatar_url); })
        .catch(() => {});
    }
    if (battle?.host_b_id) {
      userService.getPublicProfile(battle.host_b_id)
        .then(p => { setHostNameB(p.display_name || p.username || 'Créateur B'); setHostAvatarB(p.avatar_url); })
        .catch(() => {});
    }
  }, [battle?.host_a_id, battle?.host_b_id]);

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
        setEnded({ winner_id: payload.winner_id, score_a: payload.score_a, score_b: payload.score_b });
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
      setFloaters(prev => [...prev, { id, side: d.side }]);
      setTimeout(() => setFloaters(prev => prev.filter(f => f.id !== id)), 1800);
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
      setGiftTicker(prev => [...prev.slice(-3), tick]);
      setTimeout(() => setGiftTicker(prev => prev.filter(t => t.id !== tick.id)), 4200);
      const notif: GiftNotif = { id: tick.id, senderName, emoji: tick.emoji, giftName: tick.giftName, GoGold: tick.GoGold };
      if (side === 'a') setGiftNotifsA(prev => [...prev, notif]);
      else setGiftNotifsB(prev => [...prev, notif]);
      refreshRanking();
    }
  }, [refreshRanking]);

  useRoomSocket('live', battle?.live_a_id ?? null, useMemo(() => onLiveMessage('a'), [onLiveMessage]));
  useRoomSocket('live', battle?.live_b_id ?? null, useMemo(() => onLiveMessage('b'), [onLiveMessage]));

  // Countdown local — recale sur started_at/duration_seconds a chaque changement de battle
  useEffect(() => {
    if (!battle?.started_at || battle.status !== 'active') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const startedAt = new Date(battle.started_at).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(0, battle.duration_seconds - elapsed));
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [battle?.started_at, battle?.status, battle?.duration_seconds]);

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
    Alert.alert(
      'Quitter le battle ?',
      'Si tu quittes maintenant, tu perds automatiquement ce match.',
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
  }, [isHost, battle, battleId, nav]);

  if (loading || !token || !wsUrl) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: '#000' }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#7B3FF2" />
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect>
      <BattleContent
        battle={battle}
        remaining={remaining}
        goal={goal}
        ranking={ranking}
        floaters={floaters}
        ended={ended}
        leaving={leaving}
        myId={currentUser?.id ?? null}
        myHostSide={myHostSide}
        hostNameA={hostNameA}
        hostNameB={hostNameB}
        hostAvatarA={hostAvatarA}
        hostAvatarB={hostAvatarB}
        showChat={showChat}
        showRanking={showRanking}
        setShowChat={setShowChat}
        setShowRanking={setShowRanking}
        chatInput={chatInput}
        setChatInput={setChatInput}
        messages={messages}
        chatRef={chatRef}
        giftTicker={giftTicker}
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
      />
    </LiveKitRoom>
  );
};

const BattleContent: React.FC<{
  battle: Battle | null;
  remaining: number;
  goal: BattleGoal | null;
  ranking: BattleRanking | null;
  floaters: { id: string; side: 'a' | 'b' }[];
  ended: { winner_id: string | null; score_a: number; score_b: number } | null;
  leaving: boolean;
  myId: string | null;
  myHostSide: 'a' | 'b' | null;
  hostNameA: string;
  hostNameB: string;
  hostAvatarA: string | null;
  hostAvatarB: string | null;
  showChat: boolean;
  showRanking: boolean;
  setShowChat: (v: boolean) => void;
  setShowRanking: (v: boolean) => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  messages: ChatMsg[];
  chatRef: React.RefObject<FlatList<ChatMsg> | null>;
  giftTicker: GiftTick[];
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
}> = ({
  battle, remaining, goal, ranking, floaters, ended, leaving, myId, myHostSide,
  hostNameA, hostNameB, hostAvatarA, hostAvatarB,
  showChat, showRanking, setShowChat, setShowRanking,
  chatInput, setChatInput, messages, chatRef,
  giftTicker, giftNotifsA, giftNotifsB, onGiftShownA, onGiftShownB, giftOverlayA, giftOverlayB,
  effectBanner, onReact, onSendChat, onClose,
}) => {
  const allTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const { localParticipant } = useLocalParticipant();

  // Seul un host publie sa camera/micro dans la room de battle — un viewer ne detient
  // qu'un token subscriber, setCameraEnabled echouerait silencieusement de toute facon,
  // mais on evite explicitement de lui demander la permission camera pour rien.
  useEffect(() => {
    if (!myHostSide) return;
    localParticipant.setCameraEnabled(true).catch(() => {});
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
    return () => {
      localParticipant.setCameraEnabled(false).catch(() => {});
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    };
  }, [myHostSide, localParticipant]);

  const trackA = battle ? allTracks.find(t => t.participant.identity === battle.host_a_id) : null;
  const trackB = battle ? allTracks.find(t => t.participant.identity === battle.host_b_id) : null;

  const scoreA = battle?.score_a ?? 0;
  const scoreB = battle?.score_b ?? 0;
  const total = scoreA + scoreB;
  const pctA = total > 0 ? (scoreA / total) * 100 : 50;
  const leadingSide: 'a' | 'b' | null = total === 0 ? null : scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : null;

  // Bandeau "X mene le combat" — apparait/disparait en fondu a chaque changement de leader,
  // comme les notifications defilantes de TikTok, puis se retire tout seul apres quelques secondes.
  const [leadBanner, setLeadBanner] = useState<{ id: string; side: 'a' | 'b' } | null>(null);
  const prevLeadRef = useRef<'a' | 'b' | null>(null);
  const leadBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (leadingSide && leadingSide !== prevLeadRef.current) {
      if (leadBannerTimerRef.current) clearTimeout(leadBannerTimerRef.current);
      setLeadBanner({ id: `${Date.now()}`, side: leadingSide });
      leadBannerTimerRef.current = setTimeout(() => setLeadBanner(null), 3000);
    }
    prevLeadRef.current = leadingSide;
  }, [leadingSide]);

  const topDonor = ranking?.top_donor;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Header — 25% de l'ecran : fermer, countdown, score, objectif/effets, top supporter */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8} disabled={leaving}>
            {leaving ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="x" size={20} color="#fff" />}
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={styles.countdownWrap}>
              <Text style={styles.countdownText}>{formatCountdown(remaining)}</Text>
            </View>
            <View style={styles.scoreBarTrack}>
              <Animated.View
                layout={LinearTransition.springify().damping(16).stiffness(120)}
                style={[styles.scoreBarFillA, { width: `${pctA}%` }]}
              />
            </View>
            <View style={styles.scoresRow}>
              <BouncyNumber value={scoreA} style={styles.scoreText} />
              <Icon name="zap" size={16} color="#FFD700" />
              <BouncyNumber value={scoreB} style={styles.scoreText} />
            </View>
          </View>

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

        {goal && goal.status === 'active' && (
          <Animated.View
            entering={SlideInDown.duration(400).springify()}
            style={[styles.goalBanner, goal.mode === 'boss' && styles.goalBannerBoss]}
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

      {/* Zone video — 25% de l'ecran, les deux hosts en cartes arrondies centrees */}
      <View style={styles.videoZone}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.videoHalf}>
          {trackA
            ? <VideoTrack trackRef={trackA} style={styles.videoInner} objectFit="cover" />
            : <View style={[styles.videoInner, styles.noVideo]}><ActivityIndicator color="#fff" /></View>}
          {leadingSide === 'a' && <PulsingHalo color="#7B3FF2" />}

          {/* Bandeau nom + avatar du camp A */}
          <Animated.View entering={SlideInUp.duration(450).delay(100)} style={[styles.hostBadge, styles.hostBadgeA]}>
            {hostAvatarA
              ? <Image source={{ uri: hostAvatarA }} style={styles.hostBadgeAvatar} />
              : <View style={[styles.hostBadgeAvatar, styles.hostBadgeAvatarFallback]}><Icon name="user" size={12} color="#fff" /></View>}
            <Text style={styles.hostBadgeName} numberOfLines={1}>{hostNameA}</Text>
            {leadingSide === 'a' && <Text style={styles.hostBadgeCrown}>👑</Text>}
          </Animated.View>

          {giftTicker.filter(t => t.side === 'a').map(t => (
            <Animated.View key={t.id} entering={ZoomIn.duration(280)} exiting={FadeOut.duration(350)} style={styles.giftTick}>
              <LinearGradient colors={['#7B3FF2', '#4C1D95']} style={styles.giftTickGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.giftTickEmoji}>{t.emoji}</Text>
                <Text style={styles.giftTickText} numberOfLines={1}>
                  <Text style={styles.giftTickSender}>{t.senderName} </Text>· {t.GoGold}🪙
                </Text>
              </LinearGradient>
            </Animated.View>
          ))}
          <LiveGiftOverlay
            ref={giftOverlayA}
            liveId={battle?.live_a_id ?? ''}
            incomingNotifs={giftNotifsA}
            onNotifShown={onGiftShownA}
          />
        </Animated.View>

        <View style={styles.vsWrap} pointerEvents="none">
          <Animated.View entering={BounceIn.duration(600).delay(200)} style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </Animated.View>
        </View>

        <Animated.View entering={FadeIn.duration(400)} style={styles.videoHalf}>
          {trackB
            ? <VideoTrack trackRef={trackB} style={styles.videoInner} objectFit="cover" />
            : <View style={[styles.videoInner, styles.noVideo]}><ActivityIndicator color="#fff" /></View>}
          {leadingSide === 'b' && <PulsingHalo color="#F0365A" />}

          {/* Bandeau nom + avatar du camp B */}
          <Animated.View entering={SlideInUp.duration(450).delay(150)} style={[styles.hostBadge, styles.hostBadgeB]}>
            {leadingSide === 'b' && <Text style={styles.hostBadgeCrown}>👑</Text>}
            <Text style={styles.hostBadgeName} numberOfLines={1}>{hostNameB}</Text>
            {hostAvatarB
              ? <Image source={{ uri: hostAvatarB }} style={styles.hostBadgeAvatar} />
              : <View style={[styles.hostBadgeAvatar, styles.hostBadgeAvatarFallback]}><Icon name="user" size={12} color="#fff" /></View>}
          </Animated.View>

          {giftTicker.filter(t => t.side === 'b').map(t => (
            <Animated.View key={t.id} entering={ZoomIn.duration(280)} exiting={FadeOut.duration(350)} style={styles.giftTick}>
              <LinearGradient colors={['#F0365A', '#9B1C3F']} style={styles.giftTickGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.giftTickEmoji}>{t.emoji}</Text>
                <Text style={styles.giftTickText} numberOfLines={1}>
                  <Text style={styles.giftTickSender}>{t.senderName} </Text>· {t.GoGold}🪙
                </Text>
              </LinearGradient>
            </Animated.View>
          ))}
          <LiveGiftOverlay
            ref={giftOverlayB}
            liveId={battle?.live_b_id ?? ''}
            incomingNotifs={giftNotifsB}
            onNotifShown={onGiftShownB}
          />
        </Animated.View>

        {/* Reactions flottantes — defilent verticalement au-dessus des cartes video */}
        {floaters.map(f => (
          <Animated.Text
            key={f.id}
            entering={BounceIn.duration(400)}
            exiting={FadeOut.duration(500)}
            style={[styles.floater, f.side === 'a' ? styles.floaterA : styles.floaterB]}
          >
            ❤️
          </Animated.Text>
        ))}
      </View>

      {/* Bandeau "X mene le combat" — juste sous la video, apparait/disparait en fondu */}
      {leadBanner && (
        <Animated.View
          key={leadBanner.id}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(400)}
          style={[styles.leadBanner, leadBanner.side === 'a' ? styles.leadBannerA : styles.leadBannerB]}
          pointerEvents="none"
        >
          <Text style={styles.leadBannerText} numberOfLines={1}>
            🔥 {leadBanner.side === 'a' ? hostNameA : hostNameB} mène le combat !
          </Text>
        </Animated.View>
      )}

      {/* Zone basse — 25% de l'ecran : chat fusionne + boutons de soutien */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomZone}
      >
        {showChat && !ended && (
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

        {/* Envoyer un cadeau — une carte par competiteur, cote a cote, sans ambiguite sur le destinataire */}
        <View style={styles.giftRow}>
          <TouchableOpacity
            style={[styles.giftCard, styles.giftCardA]}
            onPress={() => battle && giftOverlayA.current?.openGift(battle.host_a_id, hostNameA)}
            activeOpacity={0.85}
          >
            {hostAvatarA
              ? <Image source={{ uri: hostAvatarA }} style={styles.giftCardAvatar} />
              : <View style={[styles.giftCardAvatar, styles.giftCardAvatarFallback]}><Icon name="user" size={14} color="#fff" /></View>}
            <Text style={styles.giftCardName} numberOfLines={1}>{hostNameA}</Text>
            <View style={styles.giftCardIconWrap}>
              <Text style={styles.giftCardIcon}>🎁</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.giftCard, styles.giftCardB]}
            onPress={() => battle && giftOverlayB.current?.openGift(battle.host_b_id, hostNameB)}
            activeOpacity={0.85}
          >
            <View style={styles.giftCardIconWrap}>
              <Text style={styles.giftCardIcon}>🎁</Text>
            </View>
            <Text style={styles.giftCardName} numberOfLines={1}>{hostNameB}</Text>
            {hostAvatarB
              ? <Image source={{ uri: hostAvatarB }} style={styles.giftCardAvatar} />
              : <View style={[styles.giftCardAvatar, styles.giftCardAvatarFallback]}><Icon name="user" size={14} color="#fff" /></View>}
          </TouchableOpacity>
        </View>

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
          <TouchableOpacity style={styles.reactBtn} onPress={() => setShowChat(!showChat)} activeOpacity={0.8}>
            <Icon name={showChat ? 'message-circle' : 'message-square'} size={15} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.chatInputRow}>
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

      {/* Panneau classement supporters */}
      {showRanking && (
        <View style={styles.rankingOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowRanking(false)} />
          <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)} style={styles.rankingSheet}>
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

      {/* Ecran de fin */}
      {ended && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.endedOverlay}>
          <Animated.View entering={BounceIn.duration(700).delay(150)}>
            <LinearGradient colors={['#7B3FF2', '#4C1D95']} style={styles.endedCard}>
              <Animated.View entering={ZoomIn.duration(500).delay(400)}>
                <Icon name="award" size={48} color="#FFD700" />
              </Animated.View>
              <Text style={styles.endedTitle}>
                {ended.winner_id === null
                  ? 'Match nul !'
                  : ended.winner_id === myId
                  ? 'Vous avez gagné !'
                  : 'Battle terminé'}
              </Text>
              <Text style={styles.endedScore}>{ended.score_a} — {ended.score_b}</Text>
              <TouchableOpacity style={styles.endedBtn} onPress={onClose}>
                <Text style={styles.endedBtnText}>Fermer</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
};

const HEADER_H = SCREEN_H * 0.25;
const VIDEO_ZONE_H = SCREEN_H * 0.25;
const BOTTOM_ZONE_H = SCREEN_H * 0.50;

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Header — 25% de l'ecran : fermer, countdown, score, objectif/effets, top supporter
  header: {
    width: '100%', height: HEADER_H, backgroundColor: '#0B0812',
    paddingTop: 46, paddingHorizontal: 14, paddingBottom: 10,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 6 },

  // Zone video — 25% de l'ecran, les deux hosts en cartes arrondies centrees
  videoZone: {
    width: '100%', height: VIDEO_ZONE_H, flexDirection: 'row',
    backgroundColor: '#000', padding: 6, gap: 6, alignItems: 'center',
  },
  videoHalf: {
    flex: 1, height: '100%', backgroundColor: '#111', overflow: 'hidden', position: 'relative',
    borderRadius: 20,
  },
  videoInner: { ...StyleSheet.absoluteFill, borderRadius: 20 },
  noVideo: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },

  // Bandeau "X mene le combat" — juste sous la zone video
  leadBanner: {
    marginHorizontal: 14, marginTop: 6,
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, alignItems: 'center',
  },
  leadBannerA: { backgroundColor: 'rgba(123,63,242,0.18)' },
  leadBannerB: { backgroundColor: 'rgba(240,54,90,0.18)' },
  leadBannerText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Badge VS central entre les deux cartes
  vsWrap: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center', zIndex: 25, marginTop: -16 },
  vsBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFD700', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 8, elevation: 10,
  },
  vsText: { color: '#1a1030', fontSize: 12, fontWeight: '900' },

  // Bandeau nom + avatar par camp
  hostBadge: {
    position: 'absolute', top: 6,
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

  // Zone basse — 50% de l'ecran, fixe : chat (flexible) + actions + saisie (toujours visibles)
  bottomZone: {
    width: '100%', height: BOTTOM_ZONE_H, backgroundColor: '#0B0812',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 },

  // Envoyer un cadeau — carte dediee par competiteur, sans ambiguite sur le destinataire
  giftRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  giftCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 16, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1,
  },
  giftCardA: { backgroundColor: 'rgba(123,63,242,0.14)', borderColor: 'rgba(123,63,242,0.4)' },
  giftCardB: { backgroundColor: 'rgba(240,54,90,0.14)', borderColor: 'rgba(240,54,90,0.4)' },
  giftCardAvatar: { width: 26, height: 26, borderRadius: 13 },
  giftCardAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  giftCardName: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '700' },
  giftCardIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  giftCardIcon: { fontSize: 15 },

  scoreBarTrack: { width: '100%', height: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', flexDirection: 'row' },
  scoreBarFillA: { height: '100%', backgroundColor: '#7B3FF2', borderRadius: 6 },
  countdownWrap: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  countdownText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  scoresRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  effectBanner: {
    width: '100%', marginTop: 6,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 20, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)',
  },
  effectIcon: { fontSize: 20 },
  effectText: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '700' },

  goalBanner: { width: '100%', marginTop: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 12, gap: 6 },
  goalBannerBoss: { borderWidth: 1.5, borderColor: '#EF4444' },
  goalTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  goalBarTrack: { height: 8, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  goalBarFill: { height: '100%', backgroundColor: '#FFD700', borderRadius: 6 },
  goalPct: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', alignSelf: 'flex-end' },

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

  floater: { position: 'absolute', fontSize: 20, bottom: '10%' },
  floaterA: { left: '25%' },
  floaterB: { left: '75%' },

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
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 10, paddingTop: 2 },
  chatInput: { flex: 1, minWidth: 0, color: '#fff', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chatSendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Panneau classement
  rankingOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', zIndex: 60 },
  rankingSheet: { backgroundColor: '#14101f', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 30, gap: 10 },
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

  endedOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 70 },
  endedCard: { width: '80%', borderRadius: 28, padding: 28, alignItems: 'center', gap: 12 },
  endedTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  endedScore: { color: 'rgba(255,255,255,0.9)', fontSize: 28, fontWeight: '900' },
  endedBtn: { marginTop: 8, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 28 },
  endedBtnText: { color: '#4C1D95', fontSize: 14, fontWeight: '800' },
});
