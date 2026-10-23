/**
 * LiveTournamentsScreen — "Tournois", ecran dedie (Explorer) listant les
 * tournois en cours + bouton creer. Extrait de l'ancien LiveMatchesScreen
 * (onglets fusionnes en deux ecrans separes, navigables independamment).
 * S'adapte au theme clair/sombre de l'utilisateur (2026-10) — avant, tout
 * etait code en dur en sombre/orange comme LiveOneVsOneScreen l'etait.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { STATUS_BAR_HEIGHT, HEADER_HEIGHT } from '../../styles';
import { TournamentCard } from '../../components/live/LiveMatchCards';
import { CreateTournamentModal } from '../../components/live/CreateTournamentModal';
import { tournamentService } from '../../services/tournamentService';
import type { ActiveTournament, Tournament } from '../../services/tournamentService';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const LiveTournamentsScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const { addListener, removeListener } = useWs();
  const { theme } = useTheme();
  const { colors } = theme;

  const [tournaments, setTournaments] = useState<ActiveTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const loadTournaments = useCallback(async () => {
    try {
      const p = await tournamentService.listActive(1);
      setTournaments(p.items);
      setPage(1);
      setHasMore(p.has_more);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  // Filet de securite : recharge de temps en temps au cas ou un evenement WS
  // serait manque — le WS reste la source principale de mise a jour.
  useEffect(() => {
    const iv = setInterval(() => { loadTournaments(); }, 60_000);
    return () => clearInterval(iv);
  }, [loadTournaments]);

  useEffect(() => {
    const handler = (payload: WsPayload) => {
      const p = payload as any;
      if (p.type === 'tournament_status_changed') {
        loadTournaments();
      } else if (p.type === 'tournament_participants_updated') {
        setTournaments(prev => prev.map(t => t.id === p.tournament_id ? { ...t, participants_count: p.participants_count } : t));
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [addListener, removeListener, loadTournaments]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const p = await tournamentService.listActive(nextPage);
      setTournaments(prev => [...prev, ...p.items]);
      setHasMore(p.has_more);
      setPage(nextPage);
    } catch {} finally { setLoadingMore(false); }
  }, [loading, loadingMore, hasMore, page]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTournaments().finally(() => setRefreshing(false));
  };

  const handleView = (tournament: ActiveTournament) => {
    nav.navigate('TournamentBracket', { tournamentId: tournament.id });
  };

  const handleCreated = async (t: Tournament) => {
    await loadTournaments();
    nav.navigate('TournamentBracket', { tournamentId: t.id });
  };

  const totalParticipants = tournaments.reduce((sum, t) => sum + (t.participants_count ?? 0), 0);

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      <View style={st.headerOuterWrap}>
        <View style={[st.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Tournois</Text>
          <TouchableOpacity onPress={() => setShowCreate(true)} style={st.createBtn}>
            <Icon name="plus" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={t => t.id}
          numColumns={2}
          contentContainerStyle={st.list}
          ListHeaderComponent={tournaments.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(400).springify()}>
              <LinearGradient colors={[colors.primary + '22', colors.primary + '10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.summaryCard, { borderColor: colors.primary + '30' }]}>
                <View style={[st.summaryIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Icon name="award" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.summaryTitle, { color: colors.textPrimary }]}>
                    {tournaments.length} tournoi{tournaments.length > 1 ? 's' : ''} actif{tournaments.length > 1 ? 's' : ''}
                  </Text>
                  <Text style={[st.summarySub, { color: colors.textTertiary }]}>
                    {totalParticipants.toLocaleString('fr-FR')} participant{totalParticipants > 1 ? 's' : ''} au total
                  </Text>
                </View>
              </LinearGradient>
            </Animated.View>
          ) : null}
          renderItem={({ item }) => (
            <TournamentCard tournament={item} onView={() => handleView(item)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={[st.emptyIconWrap, { backgroundColor: colors.primary + '12' }]}>
                <Icon name="award" size={30} color={colors.primary} />
              </View>
              <Text style={[st.emptyText, { color: colors.textTertiary }]}>Aucun tournoi en cours pour le moment.</Text>
              <TouchableOpacity onPress={() => setShowCreate(true)} activeOpacity={0.85} style={{ marginTop: 4 }}>
                <LinearGradient colors={[colors.primary, colors.primaryDark]} style={st.emptyCreateBtn}>
                  <Icon name="plus" size={14} color="#fff" />
                  <Text style={st.emptyCreateBtnText}>Créer un tournoi</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <CreateTournamentModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </View>
  );
};

// Couleurs retirées des styles statiques (2026-10) — toutes appliquées en
// inline depuis `colors` du thème courant, voir le rendu ci-dessus.
const st = StyleSheet.create({
  root: { flex: 1 },
  // Header flottant en carte arrondie — même design que AppHeader (voir
  // components/common/AppHeader.tsx), au lieu d'une barre plate à bord inférieur.
  headerOuterWrap: {
    paddingTop: STATUS_BAR_HEIGHT,
    zIndex: 100,
  },
  header: {
    height: HEADER_HEIGHT,
    marginHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  createBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, marginTop: 8, marginBottom: 6,
    borderRadius: 18, borderWidth: 1, padding: 15,
  },
  summaryIconWrap: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryTitle: { fontSize: 14, fontWeight: '800' },
  summarySub: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  list: { padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32, fontWeight: '600' },
  emptyCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
  emptyCreateBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
