/**
 * LiveOneVsOneScreen — "1 vs 1", ecran dedie (Explorer) listant les battles en
 * direct. Extrait de l'ancien LiveMatchesScreen (onglets fusionnes en deux
 * ecrans separes, navigables independamment). S'adapte au theme clair/sombre
 * de l'utilisateur (2026-10) — avant, tout etait code en dur en sombre/violet,
 * seul ecran de l'app a ne jamais suivre le reglage Apparence.
 */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { STATUS_BAR_HEIGHT, HEADER_HEIGHT } from '../../styles';
import { BattleCard } from '../../components/live/LiveMatchCards';
import { MatchResultModal, type MatchResultData } from '../../components/live/MatchResultModal';
import { battleService } from '../../services/battleService';
import type { ActiveBattle } from '../../services/battleService';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import { useUser } from '../../context/UserContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const LiveOneVsOneScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const { addListener, removeListener } = useWs();
  const { currentUser } = useUser();
  const { theme } = useTheme();
  const { colors } = theme;

  const [battles, setBattles] = useState<ActiveBattle[]>([]);
  // Résultat annoncé à qui reste sur cette liste (n'a pas ouvert BattleScreen) au
  // moment où un match se termine — avant, battle_ended_broadcast ne faisait que
  // retirer la carte, sans jamais dire qui avait gagné.
  const [matchResult, setMatchResult] = useState<MatchResultData | null>(null);
  const battlesRef = useRef(battles);
  battlesRef.current = battles;
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBattles = useCallback(async () => {
    try {
      const p = await battleService.listActive(1);
      setBattles(p.items);
      setPage(1);
      setHasMore(p.has_more);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBattles(); }, [loadBattles]);

  // Filet de securite : recharge de temps en temps au cas ou un evenement WS
  // serait manque — le WS reste la source principale de mise a jour.
  useEffect(() => {
    const iv = setInterval(() => { loadBattles(); }, 60_000);
    return () => clearInterval(iv);
  }, [loadBattles]);

  useEffect(() => {
    const handler = (payload: WsPayload) => {
      const p = payload as any;
      if (p.type === 'battle_started_broadcast') {
        loadBattles();
      } else if (p.type === 'battle_ended_broadcast') {
        // Annonce active pour qui est resté sur cette liste (n'a pas ouvert
        // BattleScreen) — avant, la carte disparaissait juste sans jamais dire
        // qui avait gagné.
        const battle = battlesRef.current.find(b => b.id === p.battle_id);
        if (battle) {
          const winnerId: string | null = p.winner_id ?? null;
          const isDraw = winnerId === null;
          const winnerIsA = winnerId === battle.host_a_id;
          const myId = currentUser?.id ? String(currentUser.id) : null;
          const viewerRole: 'won' | 'lost' | 'spectator' =
            isDraw || !myId ? 'spectator'
            : myId === battle.host_a_id ? (winnerIsA ? 'won' : 'lost')
            : myId === battle.host_b_id ? (winnerIsA ? 'lost' : 'won')
            : 'spectator';
          setMatchResult({
            isDraw,
            viewerRole,
            winnerName: isDraw ? '' : (winnerIsA ? battle.host_a_name : battle.host_b_name) ?? 'Créateur',
            loserName:  isDraw ? '' : (winnerIsA ? battle.host_b_name : battle.host_a_name) ?? 'Créateur',
            winnerAvatar: isDraw ? null : (winnerIsA ? battle.host_a_avatar : battle.host_b_avatar) ?? null,
            scoreA: Number(p.score_a ?? battle.score_a ?? 0),
            scoreB: Number(p.score_b ?? battle.score_b ?? 0),
            winnerGoGold: isDraw ? null : (winnerIsA ? p.score_a : p.score_b) ?? null,
          });
        }
        setBattles(prev => prev.filter(b => b.id !== p.battle_id));
      } else if (p.type === 'battle_score_update_broadcast') {
        setBattles(prev => prev.map(b => b.id === p.battle_id ? { ...b, score_a: p.score_a, score_b: p.score_b } : b));
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [addListener, removeListener, loadBattles]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const p = await battleService.listActive(nextPage);
      setBattles(prev => [...prev, ...p.items]);
      setHasMore(p.has_more);
      setPage(nextPage);
    } catch {} finally { setLoadingMore(false); }
  }, [loading, loadingMore, hasMore, page]);

  const onRefresh = () => {
    setRefreshing(true);
    loadBattles().finally(() => setRefreshing(false));
  };

  const handleWatch = (battle: ActiveBattle) => {
    nav.navigate('BattleScreen', { battleId: battle.id });
  };

  const totalViewers = battles.reduce((sum, b) => sum + (b.viewer_count ?? 0), 0);

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      <View style={st.headerOuterWrap}>
        <View style={[st.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[st.headerTitle, { color: colors.textPrimary }]}>1 vs 1</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={battles}
          keyExtractor={b => b.id}
          numColumns={2}
          contentContainerStyle={st.list}
          ListHeaderComponent={battles.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(400).springify()}>
              <View style={[st.summaryCard, { borderColor: colors.primary + '30', backgroundColor: colors.primary + '22' }]}>
                <View style={[st.summaryIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Icon name="zap" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.summaryTitle, { color: colors.textPrimary }]}>
                    {battles.length} match{battles.length > 1 ? 's' : ''} en direct
                  </Text>
                  <Text style={[st.summarySub, { color: colors.textTertiary }]}>
                    {totalViewers.toLocaleString('fr-FR')} spectateur{totalViewers > 1 ? 's' : ''} en ce moment
                  </Text>
                </View>
                <View style={st.liveDotOuter}>
                  <View style={[st.liveDot, { backgroundColor: colors.liveTag }]} />
                </View>
              </View>
            </Animated.View>
          ) : null}
          renderItem={({ item }) => (
            <BattleCard battle={item} onWatch={() => handleWatch(item)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={[st.emptyIconWrap, { backgroundColor: colors.primary + '12' }]}>
                <Icon name="zap" size={30} color={colors.primary} />
              </View>
              <Text style={[st.emptyText, { color: colors.textTertiary }]}>Aucun match 1 vs 1 en direct pour le moment.</Text>
            </View>
          }
        />
      )}
      <MatchResultModal result={matchResult} onClose={() => setMatchResult(null)} />
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
  liveDotOuter: { width: 10, height: 10 },
  liveDot: { width: 10, height: 10, borderRadius: 5 },

  list: { padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32, fontWeight: '600' },
});
