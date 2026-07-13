/**
 * TournamentBracketScreen — tableau du tournoi en direct (scrollable horizontalement
 * par round), avec possibilite de cloturer les inscriptions manuellement et de se
 * declarer "pret" pour son propre match (demarre un live puis confirme). Design
 * haut de gamme : degrades subtils, ombres douces, entrees animees echelonnees,
 * pulsation douce sur les elements en direct.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Image, Alert, RefreshControl,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInRight, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { tournamentService } from '../../services/tournamentService';
import type { TournamentBracket, TournamentMatch, TournamentRound, TournamentStanding } from '../../services/tournamentService';
import { liveService } from '../../services/liveService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { BackButton } from '../../components/common';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface RouteParams { tournamentId: string; }

const ROUND_LABELS: Record<TournamentRound, string> = {
  qualifications: 'Qualifications',
  round_of_32:    'Seizièmes',
  round_of_16:    'Huitièmes',
  quarterfinal:   'Quarts',
  semifinal:      'Demies',
  final:          'Finale',
  group_stage:    'Phase de groupes',
  losers_round:   'Bracket des perdants',
  grand_final:    'Grande finale',
};

// Pulsation douce du point rouge "en direct" — attire l'oeil sans etre criard.
const LiveDot: React.FC<{ size?: number }> = ({ size = 8 }) => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) }),
      ),
      -1, true,
    );
  }, []); // eslint-disable-line
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#EF4444' }, style]} />
    </View>
  );
};

export const TournamentBracketScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const route = useRoute();
  const { tournamentId } = route.params as RouteParams;
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser } = useUser();
  const { addListener, removeListener } = useWs();

  const [bracket, setBracket]   = useState<TournamentBracket | null>(null);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingMatch, setStartingMatch] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await tournamentService.getBracket(tournamentId);
      setBracket(data);
      if (data.tournament.tournament_type === 'league' || data.tournament.tournament_type === 'group_stage') {
        tournamentService.getStandings(tournamentId).then(setStandings).catch(() => {});
      }
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (payload: WsPayload) => {
      if (payload.tournament_id !== tournamentId) return;
      if (
        payload.type === 'tournament_bracket_generated' ||
        payload.type === 'tournament_match_ready_update' ||
        payload.type === 'tournament_match_started' ||
        payload.type === 'tournament_completed' ||
        payload.type === 'tournament_participant_joined'
      ) {
        load();
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [addListener, removeListener, tournamentId, load]);

  const myParticipant = bracket?.participants.find(p => p.user_id === currentUser?.id) ?? null;

  const findMyMatch = (): TournamentMatch | null => {
    if (!bracket || !myParticipant) return null;
    return bracket.matches.find(
      m => m.status === 'ready' && (m.participant_a_id === myParticipant.id || m.participant_b_id === myParticipant.id),
    ) ?? null;
  };

  const handleGenerateBracket = async () => {
    try {
      await tournamentService.generateBracket(tournamentId);
      await load();
    } catch (e: any) {
      Alert.alert('Impossible de démarrer', e?.message || 'Une erreur est survenue.');
    }
  };

  const handleReady = async () => {
    const match = findMyMatch();
    if (!match || startingMatch) return;
    setStartingMatch(match.id);
    try {
      const { live, token, livekit_url } = await liveService.startLive({ title: 'Battle de tournoi' });
      const updated = await tournamentService.markMatchReady(match.id, live.id);
      if (updated.status === 'live' && updated.battle_id) {
        // On ne passe jamais par SimpleLiveStream dans ce cas : l'autre participant
        // etait deja pret, le battle demarre immediatement — naviguer directement
        // vers BattleScreen evite de laisser un LiveKitRoom de live simple connecte
        // en parallele de celui du battle.
        nav.replace('BattleScreen', { battleId: updated.battle_id });
      } else {
        nav.navigate('SimpleLiveStream', { liveId: live.id, publisherToken: token, livekitUrl: livekit_url });
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible de démarrer le match.");
    } finally {
      setStartingMatch(null);
    }
  };

  const rounds = bracket ? Array.from(new Set(bracket.matches.map(m => m.round))) : [];
  const myMatch = findMyMatch();
  const liveMatches = bracket?.matches.filter(m => m.status === 'live' && m.battle_id) ?? [];

  // ── Statut + position du joueur — vue d'ensemble immediate en entrant sur l'ecran ──
  const myStatus = (): { label: string; color: string; icon: string; opponentName: string | null } | null => {
    if (!bracket || !myParticipant) return null;
    if (bracket.tournament.status === 'completed') {
      const won = bracket.tournament.winner_id === currentUser?.id;
      return won
        ? { label: 'Champion du tournoi 🏆', color: '#FFD700', icon: 'award', opponentName: null }
        : { label: 'Tournoi terminé', color: '#9CA3AF', icon: 'flag', opponentName: null };
    }
    if (bracket.tournament.status === 'registration') {
      return { label: 'Inscrit — en attente du démarrage', color: '#7B3FF2', icon: 'clock', opponentName: null };
    }
    if (myParticipant.eliminated_round) {
      return { label: 'Éliminé', color: '#EF4444', icon: 'x-circle', opponentName: null };
    }
    if (myMatch) {
      const opp = myMatch.participant_a_id === myParticipant.id
        ? bracket.participants.find(p => p.id === myMatch.participant_b_id)
        : bracket.participants.find(p => p.id === myMatch.participant_a_id);
      return { label: 'À toi de jouer', color: '#10B981', icon: 'zap', opponentName: opp?.display_name ?? 'Adversaire à confirmer' };
    }
    const myLiveMatch = liveMatches.find(m => m.participant_a_id === myParticipant.id || m.participant_b_id === myParticipant.id);
    if (myLiveMatch) {
      const opp = myLiveMatch.participant_a_id === myParticipant.id
        ? bracket.participants.find(p => p.id === myLiveMatch.participant_b_id)
        : bracket.participants.find(p => p.id === myLiveMatch.participant_a_id);
      return { label: 'Match en cours', color: '#EF4444', icon: 'radio', opponentName: opp?.display_name ?? null };
    }
    return { label: 'Qualifié — en attente du prochain match', color: '#F59E0B', icon: 'check-circle', opponentName: null };
  };
  const currentPhase = rounds.length > 0
    ? ROUND_LABELS[rounds.find(r => bracket?.matches.some(m => m.round === r && m.status !== 'completed')) ?? rounds[rounds.length - 1]]
    : null;
  const status = myStatus();

  if (loading || !bracket) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator color="#7B3FF2" style={{ marginTop: 80 }} />
      </View>
    );
  }

  const { tournament, participants } = bracket;
  const isOrganizer = tournament.created_by === currentUser?.id;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{tournament.name}</Text>
        {isOrganizer && tournament.status !== 'registration' ? (
          <TouchableOpacity
            style={styles.financeBtn}
            onPress={() => nav.navigate('TournamentFinance', { tournamentId })}
          >
            <Icon name="dollar-sign" size={18} color="#F59E0B" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#7B3FF2" />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {status && (
          <Animated.View entering={FadeInDown.duration(400).springify()}>
            <LinearGradient
              colors={[status.color + '22', status.color + '08']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.statusCard, { borderColor: status.color + '45' }]}
            >
              <View style={[styles.statusIconWrap, { backgroundColor: status.color + '25', shadowColor: status.color }]}>
                <Icon name={status.icon} size={19} color={status.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
                {currentPhase && (
                  <Text style={[styles.statusPhase, { color: colors.textTertiary }]}>Phase actuelle · {currentPhase}</Text>
                )}
                {status.opponentName && (
                  <Text style={[styles.statusOpponent, { color: colors.textPrimary }]}>Adversaire : {status.opponentName}</Text>
                )}
              </View>
              {status.label === 'Match en cours' && <LiveDot size={9} />}
            </LinearGradient>
          </Animated.View>
        )}

        {tournament.prize_pool > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(60).springify()}>
            <LinearGradient
              colors={['#FFD70020', '#FFA00010']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.prizePoolCard}
            >
              <View style={styles.prizePoolIconWrap}>
                <Text style={styles.prizePoolEmoji}>🏆</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.prizePoolLabel}>Cagnotte du tournoi</Text>
                <Text style={styles.prizePoolValue}>{tournament.prize_pool.toLocaleString('fr-FR')} GoGold</Text>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {tournament.status === 'registration' && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(120).springify()}
            style={[styles.regCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.regHeaderRow}>
              <Text style={[styles.regTitle, { color: colors.textPrimary }]}>Inscriptions ouvertes</Text>
              <View style={[styles.regCountPill, { backgroundColor: '#7B3FF218' }]}>
                <Text style={styles.regCountText}>{participants.length} / {tournament.format}</Text>
              </View>
            </View>
            <View style={[styles.regProgressTrack, { backgroundColor: colors.divider }]}>
              <View style={[styles.regProgressFill, { width: `${Math.min(100, (participants.length / tournament.format) * 100)}%` }]} />
            </View>
            {isOrganizer && participants.length >= 2 && (
              <TouchableOpacity activeOpacity={0.85} onPress={handleGenerateBracket}>
                <LinearGradient colors={['#9B65F5', '#7B3FF2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.regBtn}>
                  <Icon name="play" size={14} color="#fff" />
                  <Text style={styles.regBtnText}>Démarrer le tournoi maintenant</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {liveMatches.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(160).springify()} style={styles.liveCenterSection}>
            <View style={styles.liveCenterHeader}>
              <LiveDot />
              <Text style={[styles.liveCenterTitle, { color: colors.textPrimary }]}>
                {liveMatches.length} match{liveMatches.length > 1 ? 's' : ''} en direct
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveCenterRow}>
              {liveMatches.map((match, i) => {
                const partA = participants.find(p => p.id === match.participant_a_id);
                const partB = participants.find(p => p.id === match.participant_b_id);
                return (
                  <Animated.View key={match.id} entering={FadeInRight.duration(350).delay(i * 70)}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => match.battle_id && nav.navigate('BattleScreen', { battleId: match.battle_id })}
                      style={[styles.liveCenterCard, { backgroundColor: colors.surface, borderColor: '#EF444440' }]}
                    >
                      <Text style={[styles.liveCenterNames, { color: colors.textPrimary }]} numberOfLines={1}>
                        {partA?.display_name ?? '—'} <Text style={{ color: colors.textTertiary }}>vs</Text> {partB?.display_name ?? '—'}
                      </Text>
                      <LinearGradient colors={['#9B65F5', '#7B3FF2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.liveCenterWatchBtn}>
                        <Icon name="play" size={10} color="#fff" />
                        <Text style={styles.liveCenterWatchText}>Regarder</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

        {myMatch && (
          <Animated.View entering={FadeInDown.duration(400).delay(200).springify()}>
            <LinearGradient colors={['#7B3FF230', '#7B3FF210']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.myMatchCard}>
              <View style={styles.myMatchIconWrap}>
                <Icon name="zap" size={18} color="#7B3FF2" />
              </View>
              <Text style={[styles.myMatchText, { color: colors.textPrimary }]}>C'est ton tour de jouer !</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={handleReady} disabled={!!startingMatch}>
                <LinearGradient colors={['#9B65F5', '#7B3FF2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.readyBtn}>
                  {startingMatch
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.readyBtnText}>Je suis prêt</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        )}

        {tournament.status === 'completed' && tournament.winner_id && (
          <Animated.View entering={FadeInDown.duration(500).delay(80).springify()}>
            <LinearGradient colors={['#FFD70030', '#FFA00015']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.winnerCard}>
              <View style={styles.winnerIconWrap}>
                <Icon name="award" size={34} color="#FFD700" />
              </View>
              <Text style={styles.winnerText}>
                {participants.find(p => p.user_id === tournament.winner_id)?.display_name ?? 'Champion'} remporte le tournoi !
              </Text>
              {tournament.prize_pool > 0 && (
                <Text style={styles.winnerPrizeText}>+{tournament.prize_pool.toLocaleString('fr-FR')} GoGold</Text>
              )}
            </LinearGradient>
          </Animated.View>
        )}

        {standings.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(240).springify()}
            style={[styles.standingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.standingsTitle, { color: colors.textPrimary }]}>Classement</Text>
            {standings.map((s, i) => (
              <Animated.View
                key={s.user_id}
                entering={FadeInDown.duration(300).delay(280 + i * 40)}
                style={[styles.standingsRow, s.rank === 1 && styles.standingsRowFirst]}
              >
                <Text style={[styles.standingsRank, { color: s.rank === 1 ? '#FFD700' : colors.textTertiary }]}>{s.rank}</Text>
                {s.avatar_url
                  ? <Image source={{ uri: s.avatar_url }} style={styles.standingsAvatar} />
                  : <View style={[styles.standingsAvatar, styles.slotAvatarFallback]}><Icon name="user" size={12} color="rgba(255,255,255,0.4)" /></View>}
                <Text style={[styles.standingsName, { color: colors.textPrimary }]} numberOfLines={1}>{s.display_name ?? 'Participant'}</Text>
                <Text style={[styles.standingsStat, { color: colors.textTertiary }]}>{s.wins}V {s.draws}N {s.losses}D</Text>
                <Text style={[styles.standingsPoints, { color: colors.textPrimary }]}>{s.points} pts</Text>
              </Animated.View>
            ))}
          </Animated.View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bracketRow}>
          {rounds.map((round, roundIdx) => (
            <Animated.View key={round} entering={FadeInRight.duration(400).delay(roundIdx * 90)} style={styles.roundCol}>
              <Text style={[styles.roundTitle, { color: colors.textSecondary }]}>{ROUND_LABELS[round]}</Text>
              {bracket.matches.filter(m => m.round === round).sort((a, b) => a.position - b.position).map((match, matchIdx) => {
                const partA = participants.find(p => p.id === match.participant_a_id);
                const partB = participants.find(p => p.id === match.participant_b_id);
                const isMine = match.id === myMatch?.id;
                const isLive = match.status === 'live';
                const isTappable = isLive && !!match.battle_id;
                return (
                  <Animated.View key={match.id} entering={FadeInDown.duration(350).delay(roundIdx * 90 + matchIdx * 50)}>
                    <TouchableOpacity
                      activeOpacity={isTappable ? 0.7 : 1}
                      disabled={!isTappable}
                      onPress={() => match.battle_id && nav.navigate('BattleScreen', { battleId: match.battle_id })}
                      style={[
                        styles.matchCard,
                        { backgroundColor: colors.surface, borderColor: isMine ? '#7B3FF2' : isLive ? '#EF444455' : colors.border },
                        isMine && styles.matchCardMine,
                      ]}
                    >
                      <MatchSlot
                        name={partA?.display_name ?? (match.status === 'pending' ? '—' : 'En attente')}
                        avatar={partA?.avatar_url}
                        isWinner={match.winner_participant_id === match.participant_a_id}
                        color={colors.textPrimary}
                      />
                      <View style={[styles.matchDivider, { backgroundColor: colors.divider }]} />
                      <MatchSlot
                        name={partB?.display_name ?? (match.status === 'pending' ? '—' : 'En attente')}
                        avatar={partB?.avatar_url}
                        isWinner={match.winner_participant_id === match.participant_b_id}
                        color={colors.textPrimary}
                      />
                      {isLive && (
                        <View style={styles.liveBadge}>
                          <LiveDot size={6} />
                          <Text style={styles.liveBadgeText}>DIRECT</Text>
                        </View>
                      )}
                      {isTappable && (
                        <View style={styles.watchHint}><Icon name="play" size={9} color="#fff" /></View>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.View>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
};

const MatchSlot: React.FC<{ name: string; avatar?: string | null; isWinner: boolean; color: string }> = ({ name, avatar, isWinner, color }) => (
  <View style={styles.slot}>
    {avatar ? (
      <Image source={{ uri: avatar }} style={[styles.slotAvatar, isWinner && styles.slotAvatarWinner]} />
    ) : (
      <View style={[styles.slotAvatar, styles.slotAvatarFallback, isWinner && styles.slotAvatarWinner]}>
        <Icon name="user" size={12} color="rgba(255,255,255,0.4)" />
      </View>
    )}
    <Text style={[styles.slotName, { color }, isWinner && styles.slotNameWinner]} numberOfLines={1}>{name}</Text>
    {isWinner && <Icon name="check-circle" size={14} color="#10B981" />}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  financeBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.15)',
  },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 16,
    borderRadius: 18, borderWidth: 1.5, padding: 14,
  },
  statusIconWrap: {
    width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3,
  },
  statusLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  statusPhase: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  statusOpponent: { fontSize: 12, fontWeight: '700', marginTop: 2 },

  regCard: { margin: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16, gap: 10 },
  regHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  regTitle: { fontSize: 15, fontWeight: '800' },
  regCountPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  regCountText: { color: '#7B3FF2', fontSize: 12, fontWeight: '800' },
  regProgressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  regProgressFill: { height: '100%', backgroundColor: '#7B3FF2', borderRadius: 3 },
  regBtn: { flexDirection: 'row', gap: 8, borderRadius: 13, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  regBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  myMatchCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 16, padding: 14 },
  myMatchIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(123,63,242,0.18)', alignItems: 'center', justifyContent: 'center' },
  myMatchText: { flex: 1, fontSize: 14, fontWeight: '800' },
  readyBtn: { borderRadius: 11, paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  readyBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  liveCenterSection: { marginTop: 18, marginBottom: 4 },
  liveCenterHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  liveCenterTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  liveCenterRow: { paddingHorizontal: 16, gap: 10 },
  liveCenterCard: { width: 210, borderRadius: 16, borderWidth: 1.5, padding: 13, gap: 10 },
  liveCenterNames: { fontSize: 12, fontWeight: '700' },
  liveCenterWatchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11, alignSelf: 'flex-start',
  },
  liveCenterWatchText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  winnerCard: { alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, marginBottom: 12, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#FFD70040' },
  winnerIconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,215,0,0.15)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 4,
  },
  winnerText: { fontSize: 15, fontWeight: '800', color: '#B45309', textAlign: 'center' },
  winnerPrizeText: { fontSize: 19, fontWeight: '900', color: '#B45309' },

  prizePoolCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 18, padding: 15, borderWidth: 1, borderColor: '#FFD70035',
  },
  prizePoolIconWrap: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,215,0,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  prizePoolEmoji: { fontSize: 24 },
  prizePoolLabel: { fontSize: 11, fontWeight: '700', color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.5 },
  prizePoolValue: { fontSize: 19, fontWeight: '900', color: '#B45309', marginTop: 2 },

  standingsCard: { marginHorizontal: 16, marginTop: 12, marginBottom: 16, borderRadius: 18, borderWidth: 1, padding: 15, gap: 2 },
  standingsTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  standingsRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, borderRadius: 10 },
  standingsRowFirst: { backgroundColor: 'rgba(255,215,0,0.08)' },
  standingsRank: { width: 18, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  standingsAvatar: { width: 26, height: 26, borderRadius: 13 },
  standingsName: { flex: 1, fontSize: 13, fontWeight: '700' },
  standingsStat: { fontSize: 11, fontWeight: '600' },
  standingsPoints: { fontSize: 13, fontWeight: '900', minWidth: 48, textAlign: 'right' },

  bracketRow: { paddingHorizontal: 16, gap: 22, paddingBottom: 20, paddingTop: 4 },
  roundCol: { width: 184, gap: 14 },
  roundTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  matchCard: { borderRadius: 14, borderWidth: 1.5, padding: 11, gap: 7 },
  matchCardMine: {
    shadowColor: '#7B3FF2', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  matchDivider: { height: StyleSheet.hairlineWidth },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 },
  slotAvatar: { width: 24, height: 24, borderRadius: 12 },
  slotAvatarWinner: { borderWidth: 1.5, borderColor: '#10B981' },
  slotAvatarFallback: { backgroundColor: 'rgba(120,120,120,0.2)', alignItems: 'center', justifyContent: 'center' },
  slotName: { flex: 1, fontSize: 12, fontWeight: '600' },
  slotNameWinner: { fontWeight: '800' },
  liveBadge: {
    position: 'absolute', top: -9, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EF4444', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3,
  },
  liveBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  watchHint: {
    position: 'absolute', bottom: -8, right: 8, backgroundColor: '#7B3FF2', borderRadius: 9,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
});
