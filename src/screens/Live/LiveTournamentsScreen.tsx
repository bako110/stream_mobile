/**
 * LiveTournamentsScreen — "Tournois", ecran dedie (Explorer) listant les
 * tournois en cours + bouton creer. Extrait de l'ancien LiveMatchesScreen
 * (onglets fusionnes en deux ecrans separes, navigables independamment).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { TournamentCard } from '../../components/live/LiveMatchCards';
import { CreateTournamentModal } from '../../components/live/CreateTournamentModal';
import { tournamentService } from '../../services/tournamentService';
import type { ActiveTournament, Tournament } from '../../services/tournamentService';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const LiveTournamentsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { addListener, removeListener } = useWs();

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

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Tournois</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={st.createBtn}>
          <Icon name="plus" size={22} color="#9B65F5" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color="#9B65F5" /></View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={t => t.id}
          numColumns={1}
          contentContainerStyle={st.list}
          renderItem={({ item }) => <TournamentCard tournament={item} onView={() => handleView(item)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9B65F5" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#9B65F5" style={{ marginVertical: 16 }} /> : null}
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
      )}

      <CreateTournamentModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  createBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 14, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  emptyCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
  emptyCreateBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
