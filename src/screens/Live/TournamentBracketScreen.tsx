/**
 * TournamentBracketScreen — tableau du tournoi en direct (scrollable horizontalement
 * par round), avec possibilite de cloturer les inscriptions manuellement et de se
 * declarer "pret" pour son propre match (demarre un live puis confirme). Design
 * haut de gamme : degrades subtils, ombres douces, entrees animees echelonnees,
 * pulsation douce sur les elements en direct.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Image, Alert, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform,
  Dimensions, Share,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInRight, FadeIn, BounceIn, ZoomIn, withDelay,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { tournamentService } from '../../services/tournamentService';
import { socialService } from '../../services/socialService';
import type { TournamentBracket, TournamentMatch, TournamentRound, TournamentStanding } from '../../services/tournamentService';
import { liveService } from '../../services/liveService';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { BackButton } from '../../components/common';
import { MatchResultModal, type MatchResultData } from '../../components/live/MatchResultModal';

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

const REGISTRATION_MODE_LABELS: Record<string, string> = {
  open:        'Inscription libre — rejoins directement',
  approval:    "Inscription sur validation — l'organisateur doit accepter",
  invite_only: "Sur invitation uniquement — code requis",
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

// Texte tronqué (3 lignes) avec bascule "Voir plus / Voir moins" — utilisé pour
// la description et le règlement, potentiellement longs.
const ExpandableText: React.FC<{ text: string; textStyle: any; linkColor: string; numberOfLines?: number }> = ({
  text, textStyle, linkColor, numberOfLines = 3,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [truncatable, setTruncatable] = useState(false);

  return (
    <View>
      <Text
        style={textStyle}
        numberOfLines={expanded ? undefined : numberOfLines}
        onTextLayout={e => { if (e.nativeEvent.lines.length > numberOfLines) setTruncatable(true); }}
      >
        {text}
      </Text>
      {truncatable && (
        <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.7} style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: linkColor }}>
            {expanded ? 'Voir moins' : 'Voir plus'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// En-tête de section — icône dans un badge coloré + titre, pour repérer chaque
// bloc de détails du tournoi en un coup d'œil (description/infos/sponsor/règlement).
const SectionHeader: React.FC<{ icon: string; label: string; color: string; textColor: string }> = ({
  icon, label, color, textColor,
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View style={[styles.sectionIconWrap, { backgroundColor: color + '20' }]}>
      <Icon name={icon} size={15} color={color} />
    </View>
    <Text style={[styles.aboutTitle, { color: textColor }]}>{label}</Text>
  </View>
);

export const TournamentBracketScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const route = useRoute();
  const { tournamentId } = route.params as RouteParams;
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { currentUser } = useUser();
  const { addListener, removeListener } = useWs();

  const [bracket, setBracket]   = useState<TournamentBracket | null>(null);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [startingMatch, setStartingMatch] = useState<string | null>(null);

  const [showJoin, setShowJoin] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<TournamentMatch | null>(null);
  const [decidingForfeit, setDecidingForfeit] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editRules, setEditRules] = useState('');
  const [editSponsorName, setEditSponsorName] = useState('');
  const [editEntryFee, setEditEntryFee] = useState('');
  const [editPrize, setEditPrize] = useState('');

  // Résultat de MON match annoncé activement — BattleScreen affiche déjà un overlay
  // complet pour qui regarde le live en direct, mais un participant resté sur ce
  // bracket (ou revenu en arrière avant la fin) ne voyait jamais qui avait gagné,
  // seulement le bracket qui se met à jour silencieusement en arrière-plan.
  const [matchResult, setMatchResult] = useState<MatchResultData | null>(null);
  const bracketRef = useRef(bracket);
  bracketRef.current = bracket;
  const currentUserIdRef = useRef(currentUser?.id);
  currentUserIdRef.current = currentUser?.id;
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await tournamentService.getBracket(tournamentId);
      setBracket(data);
      if (data.tournament.tournament_type === 'league' || data.tournament.tournament_type === 'group_stage') {
        tournamentService.getStandings(tournamentId).then(setStandings).catch(() => {});
      }
    } catch (e: any) {
      console.log('[TournamentBracket] load error', e?.message, e?.response?.data, e?.response?.status);
      setLoadError(e?.response?.data?.detail || e?.message || 'Impossible de charger ce tournoi.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (payload: WsPayload) => {
      if (payload.tournament_id !== tournamentId) return;

      if (payload.type === 'tournament_match_completed') {
        // Annonce active du résultat à TOUT LE MONDE présent sur cet écran, pas
        // seulement aux deux participants — un spectateur qui suit le tournoi
        // depuis le bracket doit aussi savoir qui a gagné, pas juste voir la
        // carte se mettre à jour silencieusement. Le bracket est rafraîchi juste
        // après par le load() du bloc générique ci-dessous (même payload, pas de
        // branche exclusive), donc les cartes se mettent à jour en même temps.
        const myId = currentUserIdRef.current;
        const b = bracketRef.current;
        const myPart = b?.participants.find(p => p.user_id === myId) ?? null;
        const isDraw = !!payload.is_draw;
        const winnerId = payload.winner_participant_id;
        const loserId  = payload.loser_participant_id;

        if (isDraw || winnerId) {
          const winner = winnerId ? b?.participants.find(p => String(p.id) === String(winnerId)) ?? null : null;
          const loser  = loserId  ? b?.participants.find(p => String(p.id) === String(loserId))  ?? null : null;
          const viewerRole: 'won' | 'lost' | 'spectator' =
            !myPart || isDraw ? 'spectator'
            : String(myPart.id) === String(winnerId) ? 'won'
            : String(myPart.id) === String(loserId)  ? 'lost'
            : 'spectator';
          setMatchResult({
            isDraw,
            winnerName: winner?.display_name ?? 'Le vainqueur',
            loserName:  loser?.display_name ?? 'Son adversaire',
            winnerAvatar: winner?.avatar_url ?? null,
            scoreA: Number(payload.score_a ?? 0),
            scoreB: Number(payload.score_b ?? 0),
            viewerRole,
          });
        }
        load();
        return;
      }

      if (
        payload.type === 'tournament_bracket_generated' ||
        payload.type === 'tournament_round_generated' ||
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
    if (generating) return;
    setGenerating(true);
    try {
      await tournamentService.generateBracket(tournamentId);
      await load();
    } catch (e: any) {
      Alert.alert('Impossible de démarrer', e?.message || 'Une erreur est survenue.');
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenJoin = () => {
    if (bracket?.tournament.has_password || bracket?.tournament.registration_mode === 'invite_only') {
      setShowJoin(true);
    } else {
      handleJoin();
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      const result = await tournamentService.join(tournamentId, joinPassword || undefined, joinInviteCode || undefined);
      setShowJoin(false);
      setJoinPassword('');
      setJoinInviteCode('');
      if (result.status === 'pending') {
        Alert.alert('Demande envoyée', "L'organisateur doit valider ta demande d'inscription.");
      }
      await load();
    } catch (e: any) {
      Alert.alert('Impossible de rejoindre', e?.response?.data?.detail || e?.message || 'Une erreur est survenue.');
    } finally {
      setJoining(false);
    }
  };

  const handleOpenEdit = () => {
    if (!bracket) return;
    setEditDescription(bracket.tournament.description ?? '');
    setEditRules(bracket.tournament.rules ?? '');
    setEditSponsorName(bracket.tournament.sponsor_name ?? '');
    setEditEntryFee(String(bracket.tournament.entry_fee_gogold ?? 0));
    setEditPrize(bracket.tournament.prize ?? '');
    setShowEdit(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await tournamentService.update(tournamentId, {
        description: editDescription.trim() || undefined,
        rules: editRules.trim() || undefined,
        sponsorName: editSponsorName.trim() || undefined,
        entryFeeGogold: editEntryFee.trim() ? parseInt(editEntryFee, 10) : 0,
        prize: editPrize.trim() || undefined,
      });
      setShowEdit(false);
      await load();
    } catch (e: any) {
      Alert.alert('Impossible de modifier', e?.response?.data?.detail || e?.message || 'Une erreur est survenue.');
    } finally {
      setSaving(false);
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
        const opponentParticipantId = match.participant_a_id === myParticipant?.id ? match.participant_b_id : match.participant_a_id;
        const opponentName = bracket?.participants.find(p => p.id === opponentParticipantId)?.display_name ?? undefined;
        nav.navigate('SimpleLiveStream', {
          liveId: live.id, publisherToken: token, livekitUrl: livekit_url,
          tournamentMatchId: match.id, opponentName,
        });
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible de démarrer le match.");
    } finally {
      setStartingMatch(null);
    }
  };

  const handleForfeit = (winnerParticipantId: string, winnerName: string) => {
    if (!selectedMatch || decidingForfeit) return;
    Alert.alert(
      'Déclarer un forfait',
      `Déclarer ${winnerName} vainqueur par forfait de ce match ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer', style: 'destructive',
          onPress: async () => {
            setDecidingForfeit(true);
            try {
              await tournamentService.declareForfeit(selectedMatch.id, winnerParticipantId);
              setSelectedMatch(null);
              await load();
            } catch (e: any) {
              Alert.alert('Impossible de déclarer ce forfait', e?.response?.data?.detail || e?.message || 'Une erreur est survenue.');
            } finally {
              setDecidingForfeit(false);
            }
          },
        },
      ],
    );
  };

  const rounds = bracket ? Array.from(new Set(bracket.matches.map(m => m.round))) : [];
  const myMatch = findMyMatch();
  const liveMatches = bracket?.matches.filter(m => m.status === 'live' && m.battle_id) ?? [];

  // ── Pagination par round — uniquement pour les formats a progression sequentielle
  // stricte (elimination simple, ou le bracket final knockout d'une phase de groupes) :
  // un seul round est actif a la fois. Double_elimination (deux brackets winners/losers
  // en parallele) et league/group_stage (tous les matchs actifs d'emblee) restent affiches
  // integralement, une pagination round-par-round n'y aurait pas de sens.
  const isSequentialBracket = bracket
    ? bracket.tournament.tournament_type === 'single_elimination'
    || (bracket.tournament.tournament_type === 'group_stage' && rounds.every(r => r !== 'group_stage'))
    : false;
  // Round actif = le premier round (dans l'ordre du bracket) qui a encore un match non
  // termine — s'adapte naturellement au nombre de participants restants (moins de matchs
  // a mesure que des joueurs sont elimines, un "bye" saute directement au round suivant).
  const activeRoundIdx = rounds.findIndex(r => bracket?.matches.some(m => m.round === r && m.status !== 'completed'));
  const displayedRoundIdx = isSequentialBracket
    ? (activeRoundIdx === -1 ? rounds.length - 1 : activeRoundIdx)
    : -1;

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

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator color="#7B3FF2" style={{ marginTop: 80 }} />
      </View>
    );
  }

  if (loadError || !bracket) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Tournoi</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.errorBox}>
          <Icon name="alert-triangle" size={32} color="#EF4444" />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>
            {loadError ?? "Ce tournoi n'a pas pu être chargé."}
          </Text>
          <TouchableOpacity style={styles.errorRetryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.errorRetryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { tournament, participants } = bracket;
  const isOrganizer = tournament.created_by === currentUser?.id;

  const handleShareTournament = async () => {
    try {
      await Share.share({
        title: tournament.name,
        message: `${tournament.name} — rejoins le tournoi sur GoFolyX !\nVia GoFolyX`,
      });
      socialService.share({ platform: 'external', tournament_id: tournamentId }).catch(() => {});
    } catch { /* utilisateur a annulé le partage */ }
  };

  const renderMatchCard = (match: TournamentMatch, matchIdx: number, fullWidth: boolean, roundIdx = 0) => {
    const partA = participants.find(p => p.id === match.participant_a_id);
    const partB = participants.find(p => p.id === match.participant_b_id);
    const isMine = match.id === myMatch?.id;
    const isLive = match.status === 'live';
    const isTappable = match.status !== 'pending';
    return (
      <Animated.View key={match.id} entering={FadeInDown.duration(350).delay(roundIdx * 90 + matchIdx * 50)} style={fullWidth ? { width: '100%' } : undefined}>
        <TouchableOpacity
          activeOpacity={isTappable ? 0.7 : 1}
          disabled={!isTappable}
          onPress={() => setSelectedMatch(match)}
          style={[
            styles.matchCard,
            fullWidth && styles.matchCardFullWidth,
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
            <View style={styles.watchHint}>
              <Icon name={isLive ? 'play' : 'info'} size={9} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider, paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{tournament.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleShareTournament}>
            <Icon name="share-2" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          {isOrganizer && tournament.status !== 'registration' && (
            <TouchableOpacity
              style={styles.financeBtn}
              onPress={() => nav.navigate('TournamentFinance', { tournamentId })}
            >
              <Icon name="dollar-sign" size={18} color="#F59E0B" />
            </TouchableOpacity>
          )}
        </View>
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

            {!isOrganizer && !myParticipant && participants.length < tournament.format && (
              <TouchableOpacity activeOpacity={0.85} onPress={handleOpenJoin}>
                <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.regBtn}>
                  <Icon name="user-plus" size={14} color="#fff" />
                  <Text style={styles.regBtnText}>
                    Rejoindre{tournament.entry_fee_gogold > 0 ? ` (${tournament.entry_fee_gogold} GoGold)` : ''}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {isOrganizer && (
              <View style={styles.regOrganizerRow}>
                <TouchableOpacity
                  style={[styles.regEditBtn, { borderColor: colors.border }]}
                  onPress={handleOpenEdit}
                >
                  <Icon name="settings" size={14} color={colors.textPrimary} />
                  <Text style={[styles.regEditBtnText, { color: colors.textPrimary }]}>Modifier</Text>
                </TouchableOpacity>
                {participants.length >= 2 && (
                  <TouchableOpacity activeOpacity={0.85} onPress={handleGenerateBracket} disabled={generating} style={{ flex: 1 }}>
                    <LinearGradient colors={['#9B65F5', '#7B3FF2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.regBtn, generating && { opacity: 0.6 }]}>
                      {generating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Icon name="play" size={14} color="#fff" />
                          <Text style={styles.regBtnText}>Démarrer maintenant</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Animated.View>
        )}

        {/* Description — section séparée, tronquée avec "Voir plus" si longue */}
        {tournament.description && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(140).springify()}
            style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SectionHeader icon="file-text" label="À propos de ce tournoi" color="#7B3FF2" textColor={colors.textPrimary} />
            <ExpandableText
              text={tournament.description}
              textStyle={[styles.aboutText, { color: colors.textSecondary }]}
              linkColor={colors.primary}
            />
          </Animated.View>
        )}

        {/* Informations pratiques — inscription, frais, dates, restrictions */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(180).springify()}
          style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <SectionHeader icon="info" label="Informations pratiques" color="#0EA5E9" textColor={colors.textPrimary} />

          <View style={styles.aboutRow}>
            <Icon name="users" size={14} color={colors.textTertiary} />
            <Text style={[styles.aboutRowText, { color: colors.textSecondary }]}>
              {REGISTRATION_MODE_LABELS[tournament.registration_mode]}
            </Text>
          </View>

          {tournament.has_password && (
            <View style={styles.aboutRow}>
              <Icon name="lock" size={14} color={colors.textTertiary} />
              <Text style={[styles.aboutRowText, { color: colors.textSecondary }]}>Tournoi privé — mot de passe requis</Text>
            </View>
          )}

          {tournament.entry_fee_gogold > 0 && (
            <View style={styles.aboutRow}>
              <Icon name="credit-card" size={14} color={colors.textTertiary} />
              <Text style={[styles.aboutRowText, { color: colors.textSecondary }]}>
                Frais d'inscription : {tournament.entry_fee_gogold} GoGold
              </Text>
            </View>
          )}

          {tournament.scheduled_start_at && (
            <View style={styles.aboutRow}>
              <Icon name="calendar" size={14} color={colors.textTertiary} />
              <Text style={[styles.aboutRowText, { color: colors.textSecondary }]}>
                Début prévu : {new Date(tournament.scheduled_start_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </View>
          )}

          {tournament.registration_closes_at && (
            <View style={styles.aboutRow}>
              <Icon name="clock" size={14} color={colors.textTertiary} />
              <Text style={[styles.aboutRowText, { color: colors.textSecondary }]}>
                Clôture des inscriptions : {new Date(tournament.registration_closes_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </View>
          )}

          {(tournament.allowed_countries?.length || tournament.allowed_languages?.length) ? (
            <View style={styles.aboutRow}>
              <Icon name="globe" size={14} color={colors.textTertiary} />
              <Text style={[styles.aboutRowText, { color: colors.textSecondary }]}>
                {tournament.allowed_countries?.length ? `Pays : ${tournament.allowed_countries.join(', ')}` : ''}
                {tournament.allowed_countries?.length && tournament.allowed_languages?.length ? ' · ' : ''}
                {tournament.allowed_languages?.length ? `Langues : ${tournament.allowed_languages.join(', ')}` : ''}
              </Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Sponsor — encart mis en avant (logo plus grand), sa propre section */}
        {tournament.sponsor_name && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(220).springify()}
            style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SectionHeader icon="award" label="Sponsor" color="#F59E0B" textColor={colors.textPrimary} />
            <View style={styles.sponsorShowcase}>
              {tournament.sponsor_logo_url ? (
                <Image source={{ uri: tournament.sponsor_logo_url }} style={styles.sponsorShowcaseLogo} />
              ) : (
                <View style={[styles.sponsorShowcaseLogo, styles.sponsorShowcaseLogoFallback, { backgroundColor: '#F59E0B20' }]}>
                  <Icon name="award" size={20} color="#F59E0B" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.sponsorShowcaseLabel, { color: colors.textTertiary }]}>Sponsorisé par</Text>
                <Text style={[styles.sponsorShowcaseName, { color: colors.textPrimary }]} numberOfLines={1}>{tournament.sponsor_name}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Règlement — section séparée, tronqué avec "Voir plus" si long */}
        {tournament.rules && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(260).springify()}
            style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SectionHeader icon="shield" label="Règlement" color="#64748B" textColor={colors.textPrimary} />
            <ExpandableText
              text={tournament.rules}
              textStyle={[styles.aboutRulesText, { color: colors.textSecondary }]}
              linkColor={colors.primary}
            />
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
                      onPress={() => setSelectedMatch(match)}
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

        {isSequentialBracket ? (
          <Animated.View key={rounds[displayedRoundIdx]} entering={FadeInDown.duration(400).springify()} style={styles.roundPage}>
            <View style={styles.roundPageHeader}>
              <Text style={[styles.roundPageTitle, { color: colors.textPrimary }]}>
                {ROUND_LABELS[rounds[displayedRoundIdx]]}
              </Text>
              <Text style={[styles.roundPageProgress, { color: colors.textTertiary }]}>
                Étape {displayedRoundIdx + 1} / {rounds.length}
              </Text>
            </View>
            <View style={styles.roundPageDots}>
              {rounds.map((r, i) => (
                <View
                  key={r}
                  style={[
                    styles.roundPageDot,
                    { backgroundColor: i < displayedRoundIdx ? '#10B981' : i === displayedRoundIdx ? '#7B3FF2' : colors.border },
                  ]}
                />
              ))}
            </View>

            <View style={styles.roundPageGrid}>
              {bracket.matches.filter(m => m.round === rounds[displayedRoundIdx]).sort((a, b) => a.position - b.position).map((match, matchIdx) =>
                renderMatchCard(match, matchIdx, true))}
            </View>

            {displayedRoundIdx > 0 && (
              <View style={[styles.roundPagePrevBox, { borderColor: colors.border }]}>
                <Text style={[styles.roundPagePrevTitle, { color: colors.textSecondary }]}>
                  Résultats · {ROUND_LABELS[rounds[displayedRoundIdx - 1]]}
                </Text>
                {bracket.matches.filter(m => m.round === rounds[displayedRoundIdx - 1]).sort((a, b) => a.position - b.position).map(match => {
                  const winner = participants.find(p => p.id === match.winner_participant_id);
                  const loser = participants.find(p => p.id === (
                    match.winner_participant_id === match.participant_a_id ? match.participant_b_id : match.participant_a_id
                  ));
                  return (
                    <View key={match.id} style={styles.roundPagePrevRow}>
                      <Icon name="award" size={12} color="#FFD700" />
                      <Text style={[styles.roundPagePrevText, { color: colors.textPrimary }]} numberOfLines={1}>
                        {winner?.display_name ?? '—'}
                      </Text>
                      <Text style={[styles.roundPagePrevVs, { color: colors.textTertiary }]}>bat</Text>
                      <Text style={[styles.roundPagePrevText, { color: colors.textTertiary }]} numberOfLines={1}>
                        {loser?.display_name ?? '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </Animated.View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bracketRow}>
            {rounds.map((round, roundIdx) => (
              <Animated.View key={round} entering={FadeInRight.duration(400).delay(roundIdx * 90)} style={styles.roundCol}>
                <Text style={[styles.roundTitle, { color: colors.textSecondary }]}>{ROUND_LABELS[round]}</Text>
                {bracket.matches.filter(m => m.round === round).sort((a, b) => a.position - b.position).map((match, matchIdx) =>
                  renderMatchCard(match, matchIdx, false, roundIdx))}
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </ScrollView>

      <Modal visible={showJoin} transparent animationType="fade" onRequestClose={() => setShowJoin(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Rejoindre le tournoi</Text>
            {tournament.has_password && (
              <TextInput
                style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Mot de passe"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={joinPassword}
                onChangeText={setJoinPassword}
              />
            )}
            {tournament.registration_mode === 'invite_only' && (
              <TextInput
                style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Code d'invitation"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                value={joinInviteCode}
                onChangeText={setJoinInviteCode}
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowJoin(false)}>
                <Text style={[styles.modalCancelText, { color: colors.textTertiary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={handleJoin} disabled={joining}>
                <LinearGradient colors={['#10B981', '#059669']} style={styles.modalSendBtn}>
                  {joining ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSendText}>Rejoindre</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEdit} transparent animationType="fade" onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Modifier le tournoi</Text>
              <Text style={[styles.modalSub, { color: colors.textTertiary }]}>Possible tant que les inscriptions sont ouvertes</Text>

              <Text style={[styles.modalFieldLabel, { color: colors.textSecondary }]}>Description</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Description du tournoi"
                placeholderTextColor={colors.textTertiary}
                multiline
                value={editDescription}
                onChangeText={setEditDescription}
              />

              <Text style={[styles.modalFieldLabel, { color: colors.textSecondary }]}>Récompense (texte libre)</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Ex : 500 GoGold + trophée"
                placeholderTextColor={colors.textTertiary}
                value={editPrize}
                onChangeText={setEditPrize}
              />

              <Text style={[styles.modalFieldLabel, { color: colors.textSecondary }]}>Frais d'inscription (GoGold)</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                value={editEntryFee}
                onChangeText={setEditEntryFee}
              />

              <Text style={[styles.modalFieldLabel, { color: colors.textSecondary }]}>Sponsor</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Nom du sponsor"
                placeholderTextColor={colors.textTertiary}
                value={editSponsorName}
                onChangeText={setEditSponsorName}
              />

              <Text style={[styles.modalFieldLabel, { color: colors.textSecondary }]}>Règlement</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Règles du tournoi"
                placeholderTextColor={colors.textTertiary}
                multiline
                value={editRules}
                onChangeText={setEditRules}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowEdit(false)}>
                  <Text style={[styles.modalCancelText, { color: colors.textTertiary }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} onPress={handleSaveEdit} disabled={saving}>
                  <LinearGradient colors={['#9B65F5', '#7B3FF2']} style={styles.modalSendBtn}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSendText}>Enregistrer</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!selectedMatch} transparent animationType="fade" onRequestClose={() => setSelectedMatch(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            {selectedMatch && (() => {
              const partA = participants.find(p => p.id === selectedMatch.participant_a_id);
              const partB = participants.find(p => p.id === selectedMatch.participant_b_id);
              const isLive = selectedMatch.status === 'live';
              const isCompleted = selectedMatch.status === 'completed' || selectedMatch.status === 'bye';
              const canForfeit = isOrganizer && (selectedMatch.status === 'ready' || selectedMatch.status === 'live')
                && !!selectedMatch.participant_a_id && !!selectedMatch.participant_b_id;
              return (
                <>
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{ROUND_LABELS[selectedMatch.round]}</Text>
                  <Text style={[styles.modalSub, { color: colors.textTertiary }]}>
                    {isLive ? 'Match en direct' : isCompleted ? 'Match terminé' : 'Match prêt à démarrer'}
                  </Text>

                  <View style={styles.matchDetailRow}>
                    <MatchDetailSide
                      name={partA?.display_name ?? 'En attente'}
                      avatar={partA?.avatar_url}
                      isWinner={selectedMatch.winner_participant_id === selectedMatch.participant_a_id}
                      color={colors.textPrimary}
                    />
                    <Text style={[styles.matchDetailVs, { color: colors.textTertiary }]}>VS</Text>
                    <MatchDetailSide
                      name={partB?.display_name ?? 'En attente'}
                      avatar={partB?.avatar_url}
                      isWinner={selectedMatch.winner_participant_id === selectedMatch.participant_b_id}
                      color={colors.textPrimary}
                    />
                  </View>

                  {isLive && (
                    <View style={styles.matchDetailReadyRow}>
                      <Icon name={selectedMatch.a_ready ? 'check-circle' : 'clock'} size={14} color={selectedMatch.a_ready ? '#10B981' : colors.textTertiary} />
                      <Text style={[styles.matchDetailReadyText, { color: colors.textSecondary }]}>{partA?.display_name ?? '—'}</Text>
                      <Icon name={selectedMatch.b_ready ? 'check-circle' : 'clock'} size={14} color={selectedMatch.b_ready ? '#10B981' : colors.textTertiary} style={{ marginLeft: 16 }} />
                      <Text style={[styles.matchDetailReadyText, { color: colors.textSecondary }]}>{partB?.display_name ?? '—'}</Text>
                    </View>
                  )}

                  {canForfeit && (
                    <View style={styles.forfeitBox}>
                      <Text style={[styles.forfeitTitle, { color: colors.textSecondary }]}>
                        Adversaire absent ? Déclare un vainqueur par forfait :
                      </Text>
                      <View style={styles.forfeitBtnsRow}>
                        <TouchableOpacity
                          style={[styles.forfeitBtn, { borderColor: colors.border }]}
                          disabled={decidingForfeit}
                          onPress={() => handleForfeit(selectedMatch.participant_a_id!, partA?.display_name ?? 'Joueur A')}
                        >
                          <Text style={[styles.forfeitBtnText, { color: colors.textPrimary }]} numberOfLines={1}>
                            {partA?.display_name ?? 'Joueur A'} gagne
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.forfeitBtn, { borderColor: colors.border }]}
                          disabled={decidingForfeit}
                          onPress={() => handleForfeit(selectedMatch.participant_b_id!, partB?.display_name ?? 'Joueur B')}
                        >
                          <Text style={[styles.forfeitBtnText, { color: colors.textPrimary }]} numberOfLines={1}>
                            {partB?.display_name ?? 'Joueur B'} gagne
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSelectedMatch(null)}>
                      <Text style={[styles.modalCancelText, { color: colors.textTertiary }]}>Fermer</Text>
                    </TouchableOpacity>
                    {isLive && selectedMatch.battle_id && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => { const battleId = selectedMatch.battle_id!; setSelectedMatch(null); nav.navigate('BattleScreen', { battleId }); }}
                      >
                        <LinearGradient colors={['#9B65F5', '#7B3FF2']} style={styles.modalSendBtn}>
                          <Text style={styles.modalSendText}>Regarder le direct</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Résultat d'un match — annonce active à TOUT LE MONDE présent sur ce bracket
          (les 2 joueurs ET les spectateurs), pas juste une mise à jour silencieuse
          de la carte. Composant partagé avec BattleScreen/LiveOneVsOneScreen — le
          spectateur voit exactement le même écran champion que celui vu par le
          vainqueur lui-même en direct. */}
      <MatchResultModal result={matchResult} onClose={() => setMatchResult(null)} />
    </View>
  );
};

const MatchDetailSide: React.FC<{ name: string; avatar?: string | null; isWinner: boolean; color: string }> = ({ name, avatar, isWinner, color }) => (
  <View style={styles.matchDetailSide}>
    {avatar
      ? <Image source={{ uri: avatar }} style={styles.matchDetailAvatar} />
      : <View style={[styles.matchDetailAvatar, styles.slotAvatarFallback]}><Icon name="user" size={18} color="rgba(255,255,255,0.4)" /></View>}
    <Text style={[styles.matchDetailName, { color }, isWinner && { color: '#FFD700', fontWeight: '800' }]} numberOfLines={2}>{name}</Text>
    {isWinner && <Icon name="award" size={14} color="#FFD700" />}
  </View>
);

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  financeBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  headerIconBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)',
  },

  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  errorText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  errorRetryBtn: { backgroundColor: '#7B3FF2', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 22, marginTop: 6 },
  errorRetryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

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
  regOrganizerRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  regEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 13, borderWidth: 1,
    paddingVertical: 13, paddingHorizontal: 16, justifyContent: 'center',
  },
  regEditBtnText: { fontSize: 13, fontWeight: '700' },

  aboutCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16, gap: 10 },
  aboutTitle: { fontSize: 15, fontWeight: '800' },
  aboutText: { fontSize: 13, lineHeight: 19, marginLeft: 34 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aboutRowText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  aboutRulesText: { fontSize: 12, lineHeight: 18, marginLeft: 34 },
  sectionIconWrap: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sponsorShowcase: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 34 },
  sponsorShowcaseLogo: { width: 44, height: 44, borderRadius: 12 },
  sponsorShowcaseLogoFallback: { alignItems: 'center', justifyContent: 'center' },
  sponsorShowcaseLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  sponsorShowcaseName: { fontSize: 15, fontWeight: '800', marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', borderRadius: 20, padding: 20, gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalSub: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  modalFieldLabel: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  modalInputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  modalCancelBtn: { paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '700' },
  modalSendBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  modalSendText: { color: '#fff', fontSize: 14, fontWeight: '800' },

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
  matchCardFullWidth: { width: '100%' },
  matchCardMine: {
    shadowColor: '#7B3FF2', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },

  roundPage: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20, gap: 14 },
  roundPageHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  roundPageTitle: { fontSize: 18, fontWeight: '900' },
  roundPageProgress: { fontSize: 12, fontWeight: '700' },
  roundPageDots: { flexDirection: 'row', gap: 6 },
  roundPageDot: { flex: 1, height: 4, borderRadius: 2 },
  roundPageGrid: { gap: 12 },
  roundPagePrevBox: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 8 },
  roundPagePrevTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 },
  roundPagePrevRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roundPagePrevText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  roundPagePrevVs: { fontSize: 11, fontWeight: '600' },
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

  matchDetailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 6, gap: 10 },
  matchDetailSide: { flex: 1, alignItems: 'center', gap: 6 },
  matchDetailAvatar: { width: 52, height: 52, borderRadius: 26 },
  matchDetailName: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  matchDetailVs: { fontSize: 12, fontWeight: '800' },
  matchDetailReadyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 8 },
  matchDetailReadyText: { fontSize: 11, fontWeight: '600', marginLeft: 5 },

  forfeitBox: { marginTop: 14, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(120,120,120,0.25)', paddingTop: 14 },
  forfeitTitle: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  forfeitBtnsRow: { flexDirection: 'row', gap: 8 },
  forfeitBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  forfeitBtnText: { fontSize: 12, fontWeight: '700' },
});
