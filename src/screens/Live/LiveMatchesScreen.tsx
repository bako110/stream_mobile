/**
 * LiveMatchesScreen — "Live Matchs", section Explorer regroupant les battles 1 vs 1
 * en direct et les tournois en cours. Deux onglets : "1 vs 1" (grille de battles
 * actifs, enrichis hosts/score/viewers/gogold/supporters) et "Tournois" (cartes
 * détaillées + bouton créer un tournoi).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, VerifiedBadge } from '../../components/common';
import { battleService } from '../../services/battleService';
import type { ActiveBattle } from '../../services/battleService';
import { tournamentService } from '../../services/tournamentService';
import type { ActiveTournament, Tournament } from '../../services/tournamentService';
import { CreateTournamentModal } from '../../components/live/CreateTournamentModal';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

type Tab = '1v1' | 'tournaments';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}

function formatRemaining(startedAt: string | null, durationSeconds: number): string {
  if (!startedAt) return formatCountdown(durationSeconds);
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  return formatCountdown(Math.max(0, durationSeconds - elapsed));
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TOURNAMENT_STATUS_LABEL: Record<string, string> = {
  registration: 'Inscriptions ouvertes',
  ongoing:      'En cours',
  completed:    'Terminé',
  cancelled:    'Annulé',
};

// ── Carte Battle 1 vs 1 ───────────────────────────────────────────────────────

const BattleCard: React.FC<{ battle: ActiveBattle; onWatch: () => void }> = ({ battle, onWatch }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const total = battle.score_a + battle.score_b;
  const pctA = total > 0 ? (battle.score_a / total) * 100 : 50;

  // Tick local chaque seconde — sans ca le "temps restant" ne bougeait qu'au
  // prochain rafraichissement de la liste (jusqu'a 60s avec le nouveau polling
  // de secours), au lieu de defiler naturellement comme un vrai chronometre.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <Animated.View entering={FadeIn.duration(300)} style={[st.battleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <LinearGradient colors={['#9B65F512', '#F0365A0C']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

      <View style={st.battleHeader}>
        <View style={st.battleLiveBadge}>
          <View style={st.battleLiveDot} />
          <Text style={st.battleLiveBadgeText}>EN DIRECT</Text>
        </View>
        <View style={st.battleTimerWrap}>
          <Icon name="clock" size={11} color="rgba(255,255,255,0.7)" />
          <Text style={st.battleTimerText}>{formatRemaining(battle.started_at, battle.duration_seconds)}</Text>
        </View>
      </View>

      {/* Photos + noms des deux créateurs */}
      <View style={st.battleHostsRow}>
        <View style={st.battleHostCol}>
          {battle.host_a_avatar
            ? <Image source={{ uri: battle.host_a_avatar }} style={st.battleAvatar} />
            : <View style={[st.battleAvatar, st.battleAvatarFallback]}><Icon name="user" size={20} color="#fff" /></View>}
          <View style={st.battleHostNameRow}>
            <Text style={[st.battleHostName, { color: colors.textPrimary }]} numberOfLines={1}>{battle.host_a_name ?? 'Créateur'}</Text>
            {battle.host_a_verified && <VerifiedBadge size={12} />}
          </View>
        </View>

        <View style={st.battleVsWrap}>
          <LinearGradient colors={['#9B65F5', '#F0365A']} style={st.battleVsBadge}>
            <Text style={st.battleVsText}>VS</Text>
          </LinearGradient>
        </View>

        <View style={st.battleHostCol}>
          {battle.host_b_avatar
            ? <Image source={{ uri: battle.host_b_avatar }} style={st.battleAvatar} />
            : <View style={[st.battleAvatar, st.battleAvatarFallback]}><Icon name="user" size={20} color="#fff" /></View>}
          <View style={st.battleHostNameRow}>
            <Text style={[st.battleHostName, { color: colors.textPrimary }]} numberOfLines={1}>{battle.host_b_name ?? 'Créateur'}</Text>
            {battle.host_b_verified && <VerifiedBadge size={12} />}
          </View>
        </View>
      </View>

      {/* Score + barre de progression */}
      <View style={st.battleScoreRow}>
        <Text style={st.battleScoreText}>{battle.score_a}</Text>
        <View style={st.battleScoreBarTrack}>
          <Animated.View layout={LinearTransition.springify()} style={[st.battleScoreBarFill, { width: `${pctA}%` }]} />
        </View>
        <Text style={st.battleScoreText}>{battle.score_b}</Text>
      </View>

      {/* Stats : viewers / gogold / cadeaux / supporters */}
      <View style={[st.battleStatsRow, { borderTopColor: colors.divider }]}>
        <View style={st.battleStat}>
          <Icon name="eye" size={12} color={colors.textTertiary} />
          <Text style={[st.battleStatText, { color: colors.textSecondary }]}>{formatCount(battle.viewer_count)}</Text>
        </View>
        <View style={st.battleStat}>
          <Text style={st.battleStatEmoji}>🪙</Text>
          <Text style={[st.battleStatText, { color: colors.textSecondary }]}>{formatCount(battle.score_a + battle.score_b)}</Text>
        </View>
        <View style={st.battleStat}>
          <Icon name="gift" size={12} color={colors.textTertiary} />
          <Text style={[st.battleStatText, { color: colors.textSecondary }]}>{formatCount(battle.gifts_count)}</Text>
        </View>
        <View style={st.battleStat}>
          <Icon name="heart" size={12} color={colors.textTertiary} />
          <Text style={[st.battleStatText, { color: colors.textSecondary }]}>{formatCount(battle.supporters_count)}</Text>
        </View>
      </View>

      <TouchableOpacity onPress={onWatch} activeOpacity={0.88}>
        <LinearGradient colors={['#9B65F5', '#F0365A']} style={st.watchBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Icon name="play" size={14} color="#fff" />
          <Text style={st.watchBtnText}>Regarder</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Carte Tournoi ─────────────────────────────────────────────────────────────

const TournamentCard: React.FC<{ tournament: ActiveTournament; onView: () => void }> = ({ tournament, onView }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const statusColor = tournament.status === 'ongoing' ? '#10B981' : '#F59E0B';

  return (
    <Animated.View entering={FadeIn.duration(300)} style={[st.tourCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={st.tourImageWrap}>
        {tournament.image_url
          ? <Image source={{ uri: tournament.image_url }} style={st.tourImage} />
          : <LinearGradient colors={['#9B65F5', '#7B3FF2']} style={st.tourImage}>
              <Icon name="award" size={34} color="rgba(255,255,255,0.85)" />
            </LinearGradient>}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={st.tourImageGrad} />
        <View style={[st.tourStatusBadge, { backgroundColor: statusColor }]}>
          <Text style={st.tourStatusText}>{TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}</Text>
        </View>
        <View style={st.tourFormatBadge}>
          <Text style={st.tourFormatText}>{tournament.format} joueurs</Text>
        </View>
      </View>

      <View style={st.tourBody}>
        <Text style={[st.tourName, { color: colors.textPrimary }]} numberOfLines={1}>{tournament.name}</Text>

        <View style={st.tourOrganizerRow}>
          {tournament.organizer_avatar
            ? <Image source={{ uri: tournament.organizer_avatar }} style={st.tourOrganizerAvatar} />
            : <View style={[st.tourOrganizerAvatar, st.tourOrganizerAvatarFallback]}><Icon name="user" size={10} color="#fff" /></View>}
          <Text style={[st.tourOrganizerText, { color: colors.textSecondary }]} numberOfLines={1}>
            Par {tournament.organizer_name ?? 'Organisateur'}
          </Text>
        </View>

        {tournament.prize && (
          <View style={st.tourPrizeRow}>
            <Text style={st.tourPrizeEmoji}>🏆</Text>
            <Text style={st.tourPrizeText} numberOfLines={1}>{tournament.prize}</Text>
          </View>
        )}

        <View style={[st.tourStatsRow, { borderTopColor: colors.divider }]}>
          <View style={st.tourStat}>
            <Icon name="users" size={12} color={colors.textTertiary} />
            <Text style={[st.tourStatText, { color: colors.textSecondary }]}>
              {tournament.participants_count}/{tournament.max_participants}
            </Text>
          </View>
          <View style={st.tourStat}>
            <Icon name="eye" size={12} color={colors.textTertiary} />
            <Text style={[st.tourStatText, { color: colors.textSecondary }]}>{formatCount(tournament.spectator_count)}</Text>
          </View>
        </View>

        <View style={st.tourDatesRow}>
          <View style={{ flex: 1 }}>
            <Text style={[st.tourDateLabel, { color: colors.textTertiary }]}>Début</Text>
            <Text style={[st.tourDateValue, { color: colors.textSecondary }]}>{formatDate(tournament.started_at ?? tournament.created_at)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.tourDateLabel, { color: colors.textTertiary }]}>Fin</Text>
            <Text style={[st.tourDateValue, { color: colors.textSecondary }]}>{tournament.ended_at ? formatDate(tournament.ended_at) : '—'}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={onView} activeOpacity={0.88}>
          <LinearGradient colors={['#9B65F5', '#7B3FF2']} style={st.watchBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Icon name="eye" size={14} color="#fff" />
            <Text style={st.watchBtnText}>Voir</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// ── Écran principal ────────────────────────────────────────────────────────────

export const LiveMatchesScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { addListener, removeListener } = useWs();

  const [tab, setTab] = useState<Tab>('1v1');

  // 1 vs 1
  const [battles, setBattles]           = useState<ActiveBattle[]>([]);
  const [battlesLoading, setBattlesLoading] = useState(true);
  const [battlesPage, setBattlesPage]   = useState(1);
  const [battlesHasMore, setBattlesHasMore] = useState(false);
  const [battlesLoadingMore, setBattlesLoadingMore] = useState(false);

  // Tournois
  const [tournaments, setTournaments]           = useState<ActiveTournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [tournamentsPage, setTournamentsPage]   = useState(1);
  const [tournamentsHasMore, setTournamentsHasMore] = useState(false);
  const [tournamentsLoadingMore, setTournamentsLoadingMore] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // Création de tournoi
  const [showCreate, setShowCreate] = useState(false);

  const loadBattles = useCallback(async () => {
    try {
      const p = await battleService.listActive(1);
      setBattles(p.items);
      setBattlesPage(1);
      setBattlesHasMore(p.has_more);
    } catch {} finally { setBattlesLoading(false); }
  }, []);

  const loadTournaments = useCallback(async () => {
    try {
      const p = await tournamentService.listActive(1);
      setTournaments(p.items);
      setTournamentsPage(1);
      setTournamentsHasMore(p.has_more);
    } catch {} finally { setTournamentsLoading(false); }
  }, []);

  useEffect(() => { loadBattles(); }, [loadBattles]);
  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  // Filet de securite : recharge de temps en temps au cas ou un evenement WS
  // serait manque (reconnexion, perte reseau ponctuelle) — le WS reste la source
  // principale de mise a jour, ce polling espace ne sert que de rattrapage.
  useEffect(() => {
    const iv = setInterval(() => { loadBattles(); loadTournaments(); }, 60_000);
    return () => clearInterval(iv);
  }, [loadBattles, loadTournaments]);

  // Temps reel : demarrage/fin de battle, score, tournoi qui change de statut ou
  // dont le nombre de participants bouge — sans ca la liste ne se mettait a jour
  // qu'au prochain polling (jusqu'a 15s de retard pour les battles, jamais pour
  // les tournois hors pull-to-refresh).
  useEffect(() => {
    const handler = (payload: WsPayload) => {
      const p = payload as any;
      if (p.type === 'battle_started_broadcast') {
        loadBattles();
      } else if (p.type === 'battle_ended_broadcast') {
        setBattles(prev => prev.filter(b => b.id !== p.battle_id));
      } else if (p.type === 'battle_score_update_broadcast') {
        setBattles(prev => prev.map(b => b.id === p.battle_id ? { ...b, score_a: p.score_a, score_b: p.score_b } : b));
      } else if (p.type === 'tournament_status_changed') {
        loadTournaments();
      } else if (p.type === 'tournament_participants_updated') {
        setTournaments(prev => prev.map(t => t.id === p.tournament_id ? { ...t, participants_count: p.participants_count } : t));
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [addListener, removeListener, loadBattles, loadTournaments]);

  const loadMoreBattles = useCallback(async () => {
    if (battlesLoading || battlesLoadingMore || !battlesHasMore) return;
    setBattlesLoadingMore(true);
    try {
      const nextPage = battlesPage + 1;
      const p = await battleService.listActive(nextPage);
      setBattles(prev => [...prev, ...p.items]);
      setBattlesHasMore(p.has_more);
      setBattlesPage(nextPage);
    } catch {} finally { setBattlesLoadingMore(false); }
  }, [battlesLoading, battlesLoadingMore, battlesHasMore, battlesPage]);

  const loadMoreTournaments = useCallback(async () => {
    if (tournamentsLoading || tournamentsLoadingMore || !tournamentsHasMore) return;
    setTournamentsLoadingMore(true);
    try {
      const nextPage = tournamentsPage + 1;
      const p = await tournamentService.listActive(nextPage);
      setTournaments(prev => [...prev, ...p.items]);
      setTournamentsHasMore(p.has_more);
      setTournamentsPage(nextPage);
    } catch {} finally { setTournamentsLoadingMore(false); }
  }, [tournamentsLoading, tournamentsLoadingMore, tournamentsHasMore, tournamentsPage]);

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([loadBattles(), loadTournaments()]).finally(() => setRefreshing(false));
  };

  const handleWatchBattle = (battle: ActiveBattle) => {
    nav.navigate('BattleScreen', { battleId: battle.id });
  };

  const handleViewTournament = (tournament: ActiveTournament) => {
    nav.navigate('TournamentBracket', { tournamentId: tournament.id });
  };

  const handleTournamentCreated = async (t: Tournament) => {
    await loadTournaments();
    nav.navigate('TournamentBracket', { tournamentId: t.id });
  };

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Live Matchs</Text>
        {tab === 'tournaments' ? (
          <TouchableOpacity onPress={() => setShowCreate(true)} style={st.createBtn}>
            <Icon name="plus" size={22} color="#9B65F5" />
          </TouchableOpacity>
        ) : <View style={{ width: 38 }} />}
      </View>

      {/* Onglets */}
      <View style={[st.tabsRow, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity style={st.tabBtn} onPress={() => setTab('1v1')} activeOpacity={0.8}>
          <Text style={[st.tabText, { color: tab === '1v1' ? '#9B65F5' : colors.textTertiary }]}>1 vs 1</Text>
          {tab === '1v1' && <View style={st.tabIndicator} />}
        </TouchableOpacity>
        <TouchableOpacity style={st.tabBtn} onPress={() => setTab('tournaments')} activeOpacity={0.8}>
          <Text style={[st.tabText, { color: tab === 'tournaments' ? '#9B65F5' : colors.textTertiary }]}>Tournois</Text>
          {tab === 'tournaments' && <View style={st.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {tab === '1v1' ? (
        battlesLoading ? (
          <View style={st.center}><ActivityIndicator color="#9B65F5" /></View>
        ) : (
          <FlatList
            key="battles-list"
            data={battles}
            keyExtractor={b => b.id}
            numColumns={1}
            contentContainerStyle={st.list}
            renderItem={({ item }) => <BattleCard battle={item} onWatch={() => handleWatchBattle(item)} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9B65F5" />}
            onEndReached={loadMoreBattles}
            onEndReachedThreshold={0.4}
            ListFooterComponent={battlesLoadingMore ? <ActivityIndicator color="#9B65F5" style={{ marginVertical: 16 }} /> : null}
            ListEmptyComponent={
              <View style={st.empty}>
                <Icon name="zap" size={32} color={colors.textTertiary} />
                <Text style={[st.emptyText, { color: colors.textTertiary }]}>Aucun match 1 vs 1 en direct pour le moment.</Text>
              </View>
            }
          />
        )
      ) : (
        tournamentsLoading ? (
          <View style={st.center}><ActivityIndicator color="#9B65F5" /></View>
        ) : (
          <FlatList
            key="tournaments-list"
            data={tournaments}
            keyExtractor={t => t.id}
            numColumns={1}
            contentContainerStyle={st.list}
            renderItem={({ item }) => <TournamentCard tournament={item} onView={() => handleViewTournament(item)} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9B65F5" />}
            onEndReached={loadMoreTournaments}
            onEndReachedThreshold={0.4}
            ListFooterComponent={tournamentsLoadingMore ? <ActivityIndicator color="#9B65F5" style={{ marginVertical: 16 }} /> : null}
            ListEmptyComponent={
              <View style={st.empty}>
                <Icon name="award" size={32} color={colors.textTertiary} />
                <Text style={[st.emptyText, { color: colors.textTertiary }]}>Aucun tournoi en cours pour le moment.</Text>
                <TouchableOpacity onPress={() => setShowCreate(true)} activeOpacity={0.85} style={{ marginTop: 12 }}>
                  <LinearGradient colors={['#9B65F5', '#7B3FF2']} style={st.emptyCreateBtn}>
                    <Icon name="plus" size={14} color="#fff" />
                    <Text style={st.emptyCreateBtnText}>Créer un tournoi</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            }
          />
        )
      )}

      <CreateTournamentModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleTournamentCreated}
      />
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  createBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  tabsRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 8 },
  tabText: { fontSize: 14, fontWeight: '700' },
  tabIndicator: { width: 32, height: 3, borderRadius: 2, backgroundColor: '#9B65F5' },

  list: { padding: 14, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  emptyCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
  emptyCreateBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  watchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, height: 44, marginTop: 12 },
  watchBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // ── Carte battle 1v1 ──────────────────────────────────────────────────────
  battleCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 14 },
  battleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  battleLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0365A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  battleLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  battleLiveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  battleTimerWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  battleTimerText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  battleHostsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  battleHostCol: { flex: 1, alignItems: 'center', gap: 6 },
  battleAvatar: { width: 56, height: 56, borderRadius: 28 },
  battleAvatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center' },
  battleHostNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  battleHostName: { fontSize: 13, fontWeight: '700', maxWidth: 100 },
  battleVsWrap: { width: 48, alignItems: 'center' },
  battleVsBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  battleVsText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  battleScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  battleScoreText: { fontSize: 15, fontWeight: '800', color: '#FFD700', width: 36, textAlign: 'center' },
  battleScoreBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(155,101,245,0.15)', overflow: 'hidden' },
  battleScoreBarFill: { height: '100%', backgroundColor: '#9B65F5', borderRadius: 3 },

  battleStatsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  battleStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  battleStatEmoji: { fontSize: 11 },
  battleStatText: { fontSize: 11, fontWeight: '700' },

  // ── Carte tournoi ─────────────────────────────────────────────────────────
  tourCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  tourImageWrap: { width: '100%', height: 130, position: 'relative' },
  tourImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  tourImageGrad: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  tourStatusBadge: { position: 'absolute', top: 10, left: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tourStatusText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tourFormatBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tourFormatText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  tourBody: { padding: 14, gap: 8 },
  tourName: { fontSize: 16, fontWeight: '800' },
  tourOrganizerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tourOrganizerAvatar: { width: 18, height: 18, borderRadius: 9 },
  tourOrganizerAvatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center' },
  tourOrganizerText: { fontSize: 12, fontWeight: '600' },
  tourPrizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  tourPrizeEmoji: { fontSize: 13 },
  tourPrizeText: { color: '#F59E0B', fontSize: 12, fontWeight: '700' },

  tourStatsRow: { flexDirection: 'row', gap: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  tourStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tourStatText: { fontSize: 12, fontWeight: '700' },

  tourDatesRow: { flexDirection: 'row', gap: 12 },
  tourDateLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  tourDateValue: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 4 },
  formatRow: { flexDirection: 'row', gap: 8 },
  formatChip: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: '#9B65F5', borderWidth: 0 },
});
