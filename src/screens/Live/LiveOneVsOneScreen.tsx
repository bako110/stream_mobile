/**
 * LiveOneVsOneScreen — "1 vs 1", ecran dedie (Explorer) listant les battles en
 * direct. Extrait de l'ancien LiveMatchesScreen (onglets fusionnes en deux
 * ecrans separes, navigables independamment). Design haut de gamme : fond
 * degrade sombre, header a bordure lumineuse, box de resume en tete de liste.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackButton } from '../../components/common';
import { BattleCard } from '../../components/live/LiveMatchCards';
import { battleService } from '../../services/battleService';
import type { ActiveBattle } from '../../services/battleService';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const LiveOneVsOneScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const { addListener, removeListener } = useWs();

  const [battles, setBattles] = useState<ActiveBattle[]>([]);
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
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1C1033', '#0B0812', '#0B0812']} style={StyleSheet.absoluteFill} />

      <View style={st.header}>
        <BackButton onPress={() => nav.goBack()} color="#fff" transparent />
        <Text style={st.headerTitle}>1 vs 1</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color="#9B65F5" /></View>
      ) : (
        <FlatList
          data={battles}
          keyExtractor={b => b.id}
          numColumns={2}
          contentContainerStyle={st.list}
          ListHeaderComponent={battles.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(400).springify()}>
              <LinearGradient colors={['#9B65F522', '#7B3FF210']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.summaryCard}>
                <View style={st.summaryIconWrap}>
                  <Icon name="zap" size={20} color="#9B65F5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.summaryTitle}>
                    {battles.length} match{battles.length > 1 ? 's' : ''} en direct
                  </Text>
                  <Text style={st.summarySub}>
                    {totalViewers.toLocaleString('fr-FR')} spectateur{totalViewers > 1 ? 's' : ''} en ce moment
                  </Text>
                </View>
                <View style={st.liveDotOuter}>
                  <View style={st.liveDot} />
                </View>
              </LinearGradient>
            </Animated.View>
          ) : null}
          renderItem={({ item }) => (
            <BattleCard battle={item} onWatch={() => handleWatch(item)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9B65F5" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#9B65F5" style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={st.emptyIconWrap}>
                <Icon name="zap" size={30} color="#9B65F5" />
              </View>
              <Text style={st.emptyText}>Aucun match 1 vs 1 en direct pour le moment.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0812' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(155,101,245,0.25)',
    backgroundColor: 'rgba(28,16,51,0.55)',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#F0EFF8' },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, marginTop: 8, marginBottom: 6,
    borderRadius: 18, borderWidth: 1, borderColor: 'rgba(155,101,245,0.3)', padding: 15,
  },
  summaryIconWrap: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(155,101,245,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  summaryTitle: { color: '#F0EFF8', fontSize: 14, fontWeight: '800' },
  summarySub: { color: '#9390AB', fontSize: 12, fontWeight: '600', marginTop: 2 },
  liveDotOuter: { width: 10, height: 10 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },

  list: { padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(155,101,245,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32, color: '#9390AB', fontWeight: '600' },
});
