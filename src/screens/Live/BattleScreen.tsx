/**
 * BattleScreen — match live entre deux créateurs, split-screen vertical (comme TikTok
 * Live Battle) : host A en haut, host B en bas, score + countdown superposés, cadeaux
 * animés par camp, chat fusionné des deux lives, classement des supporters, objectif
 * communautaire/boss, effets/annonces IA, et abandon (forfait) qui notifie l'autre côté.
 */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Image, Dimensions, FlatList, TextInput,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import {
  LiveKitRoom, useTracks, VideoTrack,
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
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { WS_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import { LiveGiftOverlay } from '../../components/wallet/LiveGiftOverlay';
import type { GiftNotif, LiveGiftOverlayRef } from '../../components/wallet/LiveGiftOverlay';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

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
        const t = await battleService.getToken(battleId);
        if (!mounted) return;
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
        setBattle(prev => prev ? { ...prev, status: 'ended', score_a: payload.score_a, score_b: payload.score_b, winner_id: payload.winner_id } : prev);
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
  battle, remaining, goal, ranking, floaters, ended, leaving, myId,
  showChat, showRanking, setShowChat, setShowRanking,
  chatInput, setChatInput, messages, chatRef,
  giftTicker, giftNotifsA, giftNotifsB, onGiftShownA, onGiftShownB, giftOverlayA, giftOverlayB,
  effectBanner, onReact, onSendChat, onClose,
}) => {
  const allTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  const trackA = battle ? allTracks.find(t => t.participant.identity === battle.host_a_id) : null;
  const trackB = battle ? allTracks.find(t => t.participant.identity === battle.host_b_id) : null;

  const scoreA = battle?.score_a ?? 0;
  const scoreB = battle?.score_b ?? 0;
  const total = scoreA + scoreB;
  const pctA = total > 0 ? (scoreA / total) * 100 : 50;

  const topDonor = ranking?.top_donor;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Split-screen vertical */}
      <View style={styles.half}>
        {trackA
          ? <VideoTrack trackRef={trackA} style={StyleSheet.absoluteFill} objectFit="cover" />
          : <View style={[StyleSheet.absoluteFill, styles.noVideo]}><ActivityIndicator color="#fff" /></View>}
        {giftTicker.filter(t => t.side === 'a').map(t => (
          <Animated.View key={t.id} entering={FadeIn.duration(250)} exiting={FadeOut.duration(350)} style={[styles.giftTick, styles.giftTickA]}>
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
      </View>
      <View style={styles.half}>
        {trackB
          ? <VideoTrack trackRef={trackB} style={StyleSheet.absoluteFill} objectFit="cover" />
          : <View style={[StyleSheet.absoluteFill, styles.noVideo]}><ActivityIndicator color="#fff" /></View>}
        {giftTicker.filter(t => t.side === 'b').map(t => (
          <Animated.View key={t.id} entering={FadeIn.duration(250)} exiting={FadeOut.duration(350)} style={[styles.giftTick, styles.giftTickB]}>
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
      </View>

      {/* Divider + score bar centrale */}
      <View style={styles.centerBar} pointerEvents="none">
        <View style={styles.scoreBarTrack}>
          <View style={[styles.scoreBarFillA, { width: `${pctA}%` }]} />
        </View>
        <View style={styles.countdownWrap}>
          <Text style={styles.countdownText}>{formatCountdown(remaining)}</Text>
        </View>
        <View style={styles.scoresRow}>
          <Text style={styles.scoreText}>{scoreA}</Text>
          <Icon name="zap" size={16} color="#FFD700" />
          <Text style={styles.scoreText}>{scoreB}</Text>
        </View>
      </View>

      {/* Bandeau effets/annonces IA */}
      {effectBanner && (
        <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(400)} style={styles.effectBanner} pointerEvents="none">
          <Text style={styles.effectIcon}>{weatherIcon(effectBanner.weather)}</Text>
          <Text style={styles.effectText} numberOfLines={2}>{effectBanner.message}</Text>
        </Animated.View>
      )}

      {/* Objectif communautaire / boss */}
      {goal && goal.status === 'active' && (
        <View style={[styles.goalBanner, goal.mode === 'boss' && styles.goalBannerBoss]}>
          <Text style={styles.goalTitle}>{goal.mode === 'boss' ? '🐉 ' : '🎯 '}{goal.title}</Text>
          <View style={styles.goalBarTrack}>
            <View style={[styles.goalBarFill, { width: `${goal.progress_pct}%` }]} />
          </View>
          <Text style={styles.goalPct}>{Math.round(goal.progress_pct)}%</Text>
        </View>
      )}

      {/* Top supporter en badge permanent */}
      {topDonor && (
        <TouchableOpacity style={styles.topDonorBadge} onPress={() => setShowRanking(true)} activeOpacity={0.8}>
          {topDonor.avatar_url
            ? <Image source={{ uri: topDonor.avatar_url }} style={styles.topDonorAvatar} />
            : <View style={[styles.topDonorAvatar, styles.topDonorAvatarFallback]}><Icon name="user" size={10} color="#fff" /></View>}
          <Text style={styles.topDonorLabel} numberOfLines={1}>👑 {topDonor.display_name ?? 'Supporter'}</Text>
        </TouchableOpacity>
      )}

      {/* Reactions flottantes */}
      {floaters.map(f => (
        <Animated.Text
          key={f.id}
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(400)}
          style={[styles.floater, f.side === 'a' ? styles.floaterA : styles.floaterB]}
        >
          ❤️
        </Animated.Text>
      ))}

      {/* Boutons de soutien */}
      <View style={styles.reactRow}>
        <TouchableOpacity style={[styles.reactBtn, styles.reactBtnA]} onPress={() => onReact('a')} activeOpacity={0.8}>
          <Icon name="heart" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.reactBtn, styles.reactBtnB]} onPress={() => onReact('b')} activeOpacity={0.8}>
          <Icon name="heart" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.reactBtn} onPress={() => setShowRanking(true)} activeOpacity={0.8}>
          <Icon name="award" size={18} color="#FFD700" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.reactBtn} onPress={() => setShowChat(!showChat)} activeOpacity={0.8}>
          <Icon name={showChat ? 'message-circle' : 'message-square'} size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Fermer / quitter */}
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8} disabled={leaving}>
        {leaving ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="x" size={20} color="#fff" />}
      </TouchableOpacity>

      {/* Chat fusionne (A + B) */}
      {showChat && !ended && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.chatWrap}
          pointerEvents="box-none"
        >
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
      )}

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
                  <View style={styles.rankRow}>
                    <Text style={styles.rankPos}>{index + 1}</Text>
                    {item.avatar_url
                      ? <Image source={{ uri: item.avatar_url }} style={styles.rankAvatar} />
                      : <View style={[styles.rankAvatar, styles.rankAvatarFallback]}><Icon name="user" size={14} color="rgba(255,255,255,0.5)" /></View>}
                    <Text style={styles.rankName} numberOfLines={1}>{item.display_name ?? 'Supporter'}</Text>
                    <Text style={styles.rankAmount}>{item.gogold_spent} 🪙</Text>
                  </View>
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
        <View style={styles.endedOverlay}>
          <LinearGradient colors={['#7B3FF2', '#4C1D95']} style={styles.endedCard}>
            <Icon name="award" size={48} color="#FFD700" />
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
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  half:  { width: '100%', height: SCREEN_H / 2, backgroundColor: '#111' },
  noVideo: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },

  centerBar: { position: 'absolute', top: SCREEN_H / 2 - 34, left: 0, right: 0, alignItems: 'center', gap: 4 },
  scoreBarTrack: { width: '86%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', flexDirection: 'row' },
  scoreBarFillA: { height: '100%', backgroundColor: '#7B3FF2' },
  countdownWrap: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, marginTop: 6 },
  countdownText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  scoresRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  scoreText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  effectBanner: {
    position: 'absolute', top: 100, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)',
  },
  effectIcon: { fontSize: 20 },
  effectText: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '700' },

  goalBanner: { position: 'absolute', top: 54, left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, padding: 12, gap: 6 },
  goalBannerBoss: { borderWidth: 1.5, borderColor: '#EF4444' },
  goalTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  goalBarTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  goalBarFill: { height: '100%', backgroundColor: '#FFD700' },
  goalPct: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', alignSelf: 'flex-end' },

  topDonorBadge: {
    position: 'absolute', top: SCREEN_H / 2 - 68, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, paddingHorizontal: 8, paddingVertical: 4,
    maxWidth: 150,
  },
  topDonorAvatar: { width: 18, height: 18, borderRadius: 9 },
  topDonorAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  topDonorLabel: { color: '#FFD700', fontSize: 10, fontWeight: '700', flexShrink: 1 },

  floater: { position: 'absolute', fontSize: 24, bottom: 190 },
  floaterA: { right: 44 },
  floaterB: { right: 100 },

  // Cadeaux compacts par cote (retrecis pour tenir dans le split-screen)
  giftTick: { position: 'absolute', left: 8, maxWidth: SCREEN_W * 0.55, zIndex: 30 },
  giftTickA: { bottom: 6 },
  giftTickB: { bottom: 6 },
  giftTickGrad: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  giftTickEmoji: { fontSize: 13 },
  giftTickText: { color: '#fff', fontSize: 10, flexShrink: 1 },
  giftTickSender: { fontWeight: '800' },

  reactRow: { position: 'absolute', right: 10, bottom: 46, gap: 10 },
  reactBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  reactBtnA: { backgroundColor: '#7B3FF2CC' },
  reactBtnB: { backgroundColor: '#F0365ACC' },

  closeBtn: { position: 'absolute', top: 50, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', zIndex: 40 },

  // Chat fusionne
  chatWrap: { position: 'absolute', left: 8, right: 60, bottom: 4, maxHeight: SCREEN_H * 0.24 },
  chatList: { maxHeight: SCREEN_H * 0.18 },
  chatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 2, paddingHorizontal: 4 },
  chatSideDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  chatSideDotA: { backgroundColor: '#7B3FF2' },
  chatSideDotB: { backgroundColor: '#F0365A' },
  chatText: { flex: 1, color: '#fff', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  chatUser: { fontWeight: '800' },
  chatUserA: { color: '#C4B5FD' },
  chatUserB: { color: '#FCA5C5' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 },
  chatInput: { flex: 1, color: '#fff', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chatSendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },

  // Panneau classement
  rankingOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', zIndex: 60 },
  rankingSheet: { backgroundColor: '#14101f', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, gap: 10 },
  rankingHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center' },
  rankingTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rankingEmpty: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rankPos: { width: 20, color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  rankAvatar: { width: 30, height: 30, borderRadius: 15 },
  rankAvatarFallback: { backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  rankName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  rankAmount: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  surpriseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  surpriseText: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  endedOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 70 },
  endedCard: { width: '80%', borderRadius: 24, padding: 28, alignItems: 'center', gap: 12 },
  endedTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  endedScore: { color: 'rgba(255,255,255,0.9)', fontSize: 28, fontWeight: '900' },
  endedBtn: { marginTop: 8, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 },
  endedBtnText: { color: '#4C1D95', fontSize: 14, fontWeight: '800' },
});
