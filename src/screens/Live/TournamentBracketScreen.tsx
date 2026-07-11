/**
 * TournamentBracketScreen — tableau du tournoi en direct (scrollable horizontalement
 * par round), avec possibilite de cloturer les inscriptions manuellement et de se
 * declarer "pret" pour son propre match (demarre un live puis confirme).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Image, Alert, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { tournamentService } from '../../services/tournamentService';
import type { TournamentBracket, TournamentMatch, TournamentRound } from '../../services/tournamentService';
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

export const TournamentBracketScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const route = useRoute();
  const { tournamentId } = route.params as RouteParams;
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser } = useUser();
  const { addListener, removeListener } = useWs();

  const [bracket, setBracket]   = useState<TournamentBracket | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingMatch, setStartingMatch] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await tournamentService.getBracket(tournamentId);
      setBracket(data);
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
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#7B3FF2" />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {tournament.status === 'registration' && (
          <View style={[styles.regCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.regTitle, { color: colors.textPrimary }]}>Inscriptions ouvertes</Text>
            <Text style={[styles.regSub, { color: colors.textTertiary }]}>
              {participants.length} / {tournament.format} inscrits
            </Text>
            {isOrganizer && participants.length >= 2 && (
              <TouchableOpacity style={styles.regBtn} onPress={handleGenerateBracket}>
                <Text style={styles.regBtnText}>Démarrer le tournoi maintenant</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {myMatch && (
          <View style={[styles.myMatchCard, { backgroundColor: '#7B3FF215', borderColor: '#7B3FF2' }]}>
            <Icon name="zap" size={18} color="#7B3FF2" />
            <Text style={[styles.myMatchText, { color: colors.textPrimary }]}>C'est ton tour de jouer !</Text>
            <TouchableOpacity style={styles.readyBtn} onPress={handleReady} disabled={!!startingMatch}>
              {startingMatch
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.readyBtnText}>Je suis prêt</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {tournament.status === 'completed' && tournament.winner_id && (
          <View style={[styles.winnerCard]}>
            <Icon name="award" size={32} color="#FFD700" />
            <Text style={styles.winnerText}>
              {participants.find(p => p.user_id === tournament.winner_id)?.display_name ?? 'Champion'} remporte le tournoi !
            </Text>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bracketRow}>
          {rounds.map(round => (
            <View key={round} style={styles.roundCol}>
              <Text style={[styles.roundTitle, { color: colors.textSecondary }]}>{ROUND_LABELS[round]}</Text>
              {bracket.matches.filter(m => m.round === round).sort((a, b) => a.position - b.position).map(match => {
                const partA = participants.find(p => p.id === match.participant_a_id);
                const partB = participants.find(p => p.id === match.participant_b_id);
                const isMine = match.id === myMatch?.id;
                return (
                  <View key={match.id} style={[styles.matchCard, { backgroundColor: colors.surface, borderColor: isMine ? '#7B3FF2' : colors.border }]}>
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
                    {match.status === 'live' && (
                      <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>EN DIRECT</Text></View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
};

const MatchSlot: React.FC<{ name: string; avatar?: string | null; isWinner: boolean; color: string }> = ({ name, avatar, isWinner, color }) => (
  <View style={styles.slot}>
    {avatar ? (
      <Image source={{ uri: avatar }} style={styles.slotAvatar} />
    ) : (
      <View style={[styles.slotAvatar, styles.slotAvatarFallback]}>
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

  regCard: { margin: 16, borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  regTitle: { fontSize: 15, fontWeight: '700' },
  regSub: { fontSize: 13 },
  regBtn: { marginTop: 8, backgroundColor: '#7B3FF2', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  regBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  myMatchCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  myMatchText: { flex: 1, fontSize: 14, fontWeight: '700' },
  readyBtn: { backgroundColor: '#7B3FF2', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  readyBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  winnerCard: { alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20, backgroundColor: '#FFD70022' },
  winnerText: { fontSize: 15, fontWeight: '800', color: '#B45309', textAlign: 'center' },

  bracketRow: { paddingHorizontal: 16, gap: 20, paddingBottom: 20 },
  roundCol: { width: 180, gap: 12 },
  roundTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  matchCard: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 6 },
  matchDivider: { height: StyleSheet.hairlineWidth },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  slotAvatar: { width: 22, height: 22, borderRadius: 11 },
  slotAvatarFallback: { backgroundColor: 'rgba(120,120,120,0.2)', alignItems: 'center', justifyContent: 'center' },
  slotName: { flex: 1, fontSize: 12, fontWeight: '600' },
  slotNameWinner: { fontWeight: '800' },
  liveBadge: { position: 'absolute', top: -8, right: 8, backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  liveBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
