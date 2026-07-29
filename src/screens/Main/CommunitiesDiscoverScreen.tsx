import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, ScrollView, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton, CONTENT_CATEGORIES } from '../../components/common';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { communityService } from '../../services/communityService';
import type { CommunityData } from '../../services/communityService';
import { toastService, showConfirm } from '../../services';
import { CommunityCard } from '../../components/communities/CommunityCard';
import { CommunitySkeletonCard } from '../../components/communities/CommunitySkeleton';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Route = { params?: { initialCategory?: string | null } };

export const CommunitiesDiscoverScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const route = useRoute() as unknown as Route;
  const insets = useSafeAreaInsets();

  const [all,            setAll]            = useState<CommunityData[]>([]);
  const [query,          setQuery]          = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(route.params?.initialCategory ?? null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [page,           setPage]           = useState(1);
  const [hasMore,        setHasMore]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const PAGE_SIZE = 20;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await communityService.discover(1, PAGE_SIZE);
      setAll(Array.isArray(data) ? data : []);
      setPage(1);
      setHasMore((data?.length ?? 0) >= PAGE_SIZE);
    } catch { /**/ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await communityService.discover(nextPage, PAGE_SIZE);
      setAll(prev => {
        const seen = new Set(prev.map(c => c.id));
        return [...prev, ...(data ?? []).filter(c => !seen.has(c.id))];
      });
      setPage(nextPage);
      setHasMore((data?.length ?? 0) >= PAGE_SIZE);
    } catch { /**/ }
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, loading, page]);

  const byCategory = activeCategory
    ? all.filter(c => (c as any).category === activeCategory && c.join_status !== 'member')
    : all.filter(c => c.join_status !== 'member');

  const communities = query.trim()
    ? byCategory.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : byCategory;

  const handleJoin = (item: CommunityData) => {
    const price = item.entry_price_gogold ?? 0;
    const needsApproval = item.is_private || item.requires_approval;
    if (price > 0) {
      const label = `${price} GoGold`;
      const note = needsApproval
        ? '\n\nVotre demande sera examinée par l\'admin. Les GoGold sont remboursés en cas de refus.'
        : '';
      showConfirm('Accès payant', `Rejoindre "${item.name}" coûte ${label}.${note}`, [
        { text: 'Annuler', style: 'cancel' },
        { text: `Payer ${label}`, onPress: () => _doJoin(item) },
      ]);
      return;
    }
    _doJoin(item);
  };

  const _doJoin = async (item: CommunityData) => {
    try {
      const res = await communityService.join(item.id);
      if (res.pending) {
        toastService.info(
          'Demande envoyée',
          `Ta demande pour rejoindre "${item.name}" est en attente d'approbation. Tu seras notifié dès que l'admin accepte.`,
        );
      } else if (res.joined) {
        toastService.success('Bienvenue !', `Tu as rejoint "${item.name}".`);
      }
      load(true);
    } catch (e: any) {
      const detail: string = e?.response?.data?.detail ?? '';
      const status: number = e?.response?.status ?? 0;
      if (status === 402 || detail.toLowerCase().includes('gogold')) {
        toastService.error('GoGold insuffisants', `Il te faut ${item.entry_price_gogold ?? '?'} GoGold pour rejoindre cette communauté.`);
      } else if (status === 403) {
        toastService.error('Accès refusé', detail || 'Tu n\'as pas accès à cette communauté.');
      } else if (status === 404) {
        toastService.error('Introuvable', 'Cette communauté n\'existe plus.');
      } else {
        toastService.error('Erreur', detail || 'Impossible de rejoindre cette communauté.');
      }
    }
  };

  const handleCancelRequest = (item: CommunityData) => {
    showConfirm('Annuler la demande', `Annuler votre demande pour "${item.name}" ?`, [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler la demande',
        style: 'destructive',
        onPress: async () => {
          try { await communityService.cancelJoinRequest(item.id); load(true); }
          catch { toastService.error('Erreur', 'Impossible d\'annuler la demande.'); }
        },
      },
    ]);
  };

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={[S.header, { backgroundColor: colors.surface, paddingTop: insets.top + 10, borderBottomColor: colors.divider }]}>
        <View style={S.headerRow}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[S.headerTitle, { color: colors.textPrimary }]}>Découvrir</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={[S.searchWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.divider }]}>
          <Icon name="search" size={15} color={colors.primary} />
          <TextInput
            style={[S.searchInput, { color: colors.textPrimary }]}
            placeholder="Rechercher une communauté…"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoFocus={!route.params?.initialCategory}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Icon name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.chipsScroll} contentContainerStyle={S.chipsRow}>
          <TouchableOpacity
            onPress={() => setActiveCategory(null)}
            style={[S.chip, {
              backgroundColor: !activeCategory ? colors.primary : colors.backgroundSecondary,
              borderColor: !activeCategory ? colors.primary : colors.divider,
            }]}
          >
            <Text style={{ color: !activeCategory ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 12 }}>Toutes</Text>
          </TouchableOpacity>
          {CONTENT_CATEGORIES.filter(c => c.value !== 'autre').map(cat => {
            const active = activeCategory === cat.value;
            return (
              <TouchableOpacity
                key={cat.value}
                onPress={() => setActiveCategory(active ? null : cat.value)}
                style={[S.chip, {
                  backgroundColor: active ? colors.primary : colors.backgroundSecondary,
                  borderColor: active ? colors.primary : colors.divider,
                }]}
              >
                <Text style={{ fontSize: 12 }}>{cat.emoji}</Text>
                <Text style={{ color: active ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 12 }}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && all.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
          <CommunitySkeletonCard />
          <CommunitySkeletonCard />
          <CommunitySkeletonCard />
        </ScrollView>
      ) : (
        <FlatList
          data={communities}
          keyExtractor={c => c.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={communities.length === 0 ? S.emptyContainer : { paddingBottom: 32, paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
          onEndReached={() => {
            // Ne paginer que sans filtre actif — filtre catégorie/recherche se fait
            // côté client sur les pages déjà chargées, paginer dessous n'aiderait
            // pas à trouver plus de résultats correspondant au filtre courant.
            if (!query.trim() && !activeCategory) loadMore();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : null}
          renderItem={({ item }) => (
            <CommunityCard
              item={item}
              isMine={false}
              colors={colors}
              onPress={() => nav.navigate('CommunityDetail', { communityId: item.id })}
              onJoin={() => handleJoin(item)}
              onLeave={() => {}}
              onCancelRequest={() => handleCancelRequest(item)}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 16 }}>
              <LinearGradient colors={['#7B3FF230', '#E0389A20']} style={S.emptyIcon}>
                <Icon name="users" size={36} color="#7B3FF2" />
              </LinearGradient>
              <Text style={[S.emptyTitle, { color: colors.textPrimary }]}>
                {query ? 'Aucun résultat' : 'Aucune communauté'}
              </Text>
              <Text style={[S.emptySub, { color: colors.textTertiary }]}>
                {query ? `Aucun résultat pour "${query}"` : 'Aucune communauté ne correspond à ce filtre pour le moment.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const S = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginHorizontal: 16, marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  chipsScroll: { height: 46 },
  chipsRow: { paddingHorizontal: 16, paddingBottom: 14, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 8,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },

  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingTop: 60 },
  emptyIcon: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
