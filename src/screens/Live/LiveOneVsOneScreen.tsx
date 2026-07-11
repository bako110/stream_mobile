/**
 * LiveOneVsOneScreen — "1 vs 1", ecran dedie (Explorer) listant les battles en
 * direct. Extrait de l'ancien LiveMatchesScreen (onglets fusionnes en deux
 * ecrans separes, navigables independamment).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { BattleCard } from '../../components/live/LiveMatchCards';
import { battleService } from '../../services/battleService';
import type { ActiveBattle } from '../../services/battleService';
import { useWs } from '../../context/WebSocketContext';
import type { WsPayload } from '../../context/WebSocketContext';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const LiveOneVsOneScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
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

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>1 vs 1</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color="#9B65F5" /></View>
      ) : (
        <FlatList
          data={battles}
          keyExtractor={b => b.id}
          numColumns={1}
          contentContainerStyle={st.list}
          renderItem={({ item }) => <BattleCard battle={item} onWatch={() => handleWatch(item)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9B65F5" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#9B65F5" style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={st.empty}>
              <Icon name="zap" size={32} color={colors.textTertiary} />
              <Text style={[st.emptyText, { color: colors.textTertiary }]}>Aucun match 1 vs 1 en direct pour le moment.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  list: { padding: 14, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});
