/**
 * LiveTournamentsScreen — "Tournois", ecran dedie (Explorer) listant les
 * tournois en cours + bouton creer. Extrait de l'ancien LiveMatchesScreen
 * (onglets fusionnes en deux ecrans separes, navigables independamment).
 * Design haut de gamme : fond degrade sombre, header a bordure lumineuse,
 * box de resume en tete de liste.
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

  const totalParticipants = tournaments.reduce((sum, t) => sum + (t.participants_count ?? 0), 0);

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#2A1F0A', '#0B0812', '#0B0812']} style={StyleSheet.absoluteFill} />

      <View style={st.header}>
        <BackButton onPress={() => nav.goBack()} color="#fff" transparent />
        <Text style={st.headerTitle}>Tournois</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={st.createBtn}>
          <Icon name="plus" size={22} color="#F59E0B" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color="#F59E0B" /></View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={t => t.id}
          numColumns={2}
          contentContainerStyle={st.list}
          ListHeaderComponent={tournaments.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(400).springify()}>
              <LinearGradient colors={['#F59E0B22', '#F59E0B10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.summaryCard}>
                <View style={st.summaryIconWrap}>
                  <Icon name="award" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.summaryTitle}>
                    {tournaments.length} tournoi{tournaments.length > 1 ? 's' : ''} actif{tournaments.length > 1 ? 's' : ''}
                  </Text>
                  <Text style={st.summarySub}>
                    {totalParticipants.toLocaleString('fr-FR')} participant{totalParticipants > 1 ? 's' : ''} au total
                  </Text>
                </View>
              </LinearGradient>
            </Animated.View>
          ) : null}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index, 8) * 60)}>
              <TournamentCard tournament={item} onView={() => handleView(item)} />
            </Animated.View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#F59E0B" style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={st.emptyIconWrap}>
                <Icon name="award" size={30} color="#F59E0B" />
              </View>
              <Text style={st.emptyText}>Aucun tournoi en cours pour le moment.</Text>
              <TouchableOpacity onPress={() => setShowCreate(true)} activeOpacity={0.85} style={{ marginTop: 4 }}>
                <LinearGradient colors={['#F59E0B', '#D97706']} style={st.emptyCreateBtn}>
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
  root: { flex: 1, backgroundColor: '#0B0812' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.25)',
    backgroundColor: 'rgba(42,31,10,0.55)',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#F0EFF8' },
  createBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, marginTop: 8, marginBottom: 6,
    borderRadius: 18, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', padding: 15,
  },
  summaryIconWrap: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(245,158,11,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  summaryTitle: { color: '#F0EFF8', fontSize: 14, fontWeight: '800' },
  summarySub: { color: '#9390AB', fontSize: 12, fontWeight: '600', marginTop: 2 },

  list: { padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32, color: '#9390AB', fontWeight: '600' },
  emptyCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
  emptyCreateBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
