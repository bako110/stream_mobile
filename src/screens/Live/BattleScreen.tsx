/**
 * BattleScreen — match live entre deux créateurs, split-screen vertical (comme TikTok
 * Live Battle) : host A en haut, host B en bas, score + countdown superposés, réactions
 * de soutien par camp, objectif communautaire/boss si lancé.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Image, Dimensions, Animated,
} from 'react-native';
import {
  LiveKitRoom, useTracks, VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { battleService } from '../../services/battleService';
import type { Battle, BattleGoal } from '../../services/battleService';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { useUser } from '../../context/UserContext';
import { useTheme } from '../../hooks/useTheme';

const { height: SCREEN_H } = Dimensions.get('window');

interface RouteParams {
  battleId: string;
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const BattleScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { battleId } = route.params as RouteParams;
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser } = useUser();
  const { addListener, removeListener } = useWs();

  const [battle, setBattle]   = useState<Battle | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [wsUrl, setWsUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [goal, setGoal]       = useState<BattleGoal | null>(null);
  const [floaters, setFloaters] = useState<{ id: string; side: 'a' | 'b' }[]>([]);
  const [ended, setEnded]     = useState<{ winner_id: string | null; score_a: number; score_b: number } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [battleId]);

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

      if (payload.type === 'battle_goal_started' || payload.type === 'battle_goal_progress') {
        setGoal(payload as unknown as BattleGoal);
      }
      if (payload.type === 'battle_goal_succeeded' || payload.type === 'battle_goal_failed') {
        setGoal(prev => prev ? { ...prev, status: payload.type === 'battle_goal_succeeded' ? 'succeeded' : 'failed' } : prev);
      }

      if (payload.type === 'battle_reaction') {
        const id = `${Date.now()}-${Math.random()}`;
        setFloaters(prev => [...prev, { id, side: payload.side }]);
        setTimeout(() => setFloaters(prev => prev.filter(f => f.id !== id)), 1800);
      }

      if (payload.type === 'battle_ended') {
        setEnded({ winner_id: payload.winner_id, score_a: payload.score_a, score_b: payload.score_b });
        setBattle(prev => prev ? { ...prev, status: 'ended', score_a: payload.score_a, score_b: payload.score_b, winner_id: payload.winner_id } : prev);
      }

      if (payload.type === 'battle_effect') {
        // Annonce/meteo — affichage discret possible plus tard ; pas bloquant pour la V1
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [addListener, removeListener, battleId]);

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

  const handleClose = useCallback(() => {
    nav.goBack();
  }, [nav]);

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
        floaters={floaters}
        ended={ended}
        myId={currentUser?.id ?? null}
        onReact={handleReact}
        onClose={handleClose}
      />
    </LiveKitRoom>
  );
};

const BattleContent: React.FC<{
  battle: Battle | null;
  remaining: number;
  goal: BattleGoal | null;
  floaters: { id: string; side: 'a' | 'b' }[];
  ended: { winner_id: string | null; score_a: number; score_b: number } | null;
  myId: string | null;
  onReact: (side: 'a' | 'b') => void;
  onClose: () => void;
}> = ({ battle, remaining, goal, floaters, ended, myId, onReact, onClose }) => {
  const allTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  const trackA = battle ? allTracks.find(t => t.participant.identity === battle.host_a_id) : null;
  const trackB = battle ? allTracks.find(t => t.participant.identity === battle.host_b_id) : null;

  const scoreA = battle?.score_a ?? 0;
  const scoreB = battle?.score_b ?? 0;
  const total = scoreA + scoreB;
  const pctA = total > 0 ? (scoreA / total) * 100 : 50;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Split-screen vertical */}
      <View style={styles.half}>
        {trackA
          ? <VideoTrack trackRef={trackA} style={StyleSheet.absoluteFill} objectFit="cover" />
          : <View style={[StyleSheet.absoluteFill, styles.noVideo]}><ActivityIndicator color="#fff" /></View>}
      </View>
      <View style={styles.half}>
        {trackB
          ? <VideoTrack trackRef={trackB} style={StyleSheet.absoluteFill} objectFit="cover" />
          : <View style={[StyleSheet.absoluteFill, styles.noVideo]}><ActivityIndicator color="#fff" /></View>}
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

      {/* Objectif communautaire / boss */}
      {goal && goal.status === 'active' && (
        <View style={[styles.goalBanner, goal.mode === 'boss' && styles.goalBannerBoss]}>
          <Text style={styles.goalTitle}>{goal.mode === 'boss' ? '🐉 ' : '🎯 '}{goal.title}</Text>
          <View style={styles.goalBarTrack}>
            <View style={[styles.goalBarFill, { width: `${goal.progress_pct}%` }]} />
          </View>
          <Text style={styles.goalPct}>{goal.progress_pct}%</Text>
        </View>
      )}

      {/* Reactions flottantes */}
      {floaters.map(f => (
        <Animated.Text
          key={f.id}
          style={[
            styles.floater,
            f.side === 'a' ? styles.floaterA : styles.floaterB,
          ]}
        >
          ❤️
        </Animated.Text>
      ))}

      {/* Boutons de soutien */}
      <View style={styles.reactRow}>
        <TouchableOpacity style={[styles.reactBtn, styles.reactBtnA]} onPress={() => onReact('a')} activeOpacity={0.8}>
          <Icon name="heart" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.reactBtn, styles.reactBtnB]} onPress={() => onReact('b')} activeOpacity={0.8}>
          <Icon name="heart" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Fermer */}
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
        <Icon name="x" size={22} color="#fff" />
      </TouchableOpacity>

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

  goalBanner: { position: 'absolute', top: 54, left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, padding: 12, gap: 6 },
  goalBannerBoss: { borderWidth: 1.5, borderColor: '#EF4444' },
  goalTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  goalBarTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  goalBarFill: { height: '100%', backgroundColor: '#FFD700' },
  goalPct: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', alignSelf: 'flex-end' },

  floater: { position: 'absolute', fontSize: 28, bottom: 120 },
  floaterA: { right: 40 },
  floaterB: { right: 100 },

  reactRow: { position: 'absolute', right: 16, bottom: 40, gap: 12 },
  reactBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  reactBtnA: { backgroundColor: '#7B3FF2CC' },
  reactBtnB: { backgroundColor: '#F0365ACC' },

  closeBtn: { position: 'absolute', top: 50, left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },

  endedOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  endedCard: { width: '80%', borderRadius: 24, padding: 28, alignItems: 'center', gap: 12 },
  endedTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  endedScore: { color: 'rgba(255,255,255,0.9)', fontSize: 28, fontWeight: '900' },
  endedBtn: { marginTop: 8, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 },
  endedBtnText: { color: '#4C1D95', fontSize: 14, fontWeight: '800' },
});
