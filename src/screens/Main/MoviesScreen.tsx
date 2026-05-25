import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Image, RefreshControl,
  StyleSheet, Dimensions, ScrollView, StatusBar, FlatList,
  TextInput,
} from 'react-native';
import Animated, {
  FadeIn, useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { useTheme } from '../../hooks/useTheme';
import { contentService } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import type { FilmItem } from './FilmsScreen';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

const { width: SW } = Dimensions.get('window');
const H_PAD  = 16;
const GUTTER = 10;
const CARD_W = (SW - H_PAD * 2 - GUTTER) / 2;
const HERO_H = Math.round(SW * 0.72);
const HERO_N = 6;

type SortKey = 'recent' | 'rating' | 'year';
type FilterKey = 'all' | 'premium' | 'free';

// ─────────────────────────────────────────────────────────────────────────────
// HERO CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────

const HeroCarousel: React.FC<{
  items: FilmItem[];
  purchasedIds: Set<string>;
  hasActiveSub: boolean;
  onPress: (item: FilmItem) => void;
}> = ({ items, purchasedIds, hasActiveSub, onPress }) => {
  const [idx, setIdx] = useState(0);
  const ref   = useRef<FlatList>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const slides = items.slice(0, HERO_N);

  const advance = useCallback(() => {
    setIdx(prev => {
      const n = (prev + 1) % slides.length;
      ref.current?.scrollToIndex({ index: n, animated: true });
      return n;
    });
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    timer.current = setInterval(advance, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [advance, slides.length]);

  const onScrollEnd = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SW);
    setIdx(i);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(advance, 5000);
  };

  if (!slides.length) return null;

  return (
    <View>
      <FlatList
        ref={ref}
        data={slides}
        keyExtractor={item => item.id}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
        renderItem={({ item }) => (
          <HeroSlide
            item={item}
            purchased={purchasedIds.has(item.id) || (hasActiveSub && !!item.is_premium)}
            onPress={() => onPress(item)}
          />
        )}
      />
      {slides.length > 1 && (
        <View style={hs.indicators}>
          {slides.map((_, i) => (
            <View key={i} style={[hs.dot, i === idx ? hs.dotActive : hs.dotInactive]} />
          ))}
        </View>
      )}
    </View>
  );
};

const HeroSlide: React.FC<{ item: FilmItem; purchased: boolean; onPress: () => void }> = ({ item, purchased, onPress }) => {
  const bg = item.banner_url || item.thumbnail_url;
  const isPremiumUnpaid = item.is_premium && !purchased;
  return (
    <View style={{ width: SW, height: HERO_H }}>
      {bg
        ? <Image source={{ uri: bg }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0d1a', alignItems: 'center', justifyContent: 'center' }]}><Icon name="film" size={64} color="#333" /></View>
      }
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={hs.content}>
        {item.is_premium && (
          purchased
            ? <View style={hs.accessBadge}><Icon name="check-circle" size={9} color="#10b981" /><Text style={hs.accessText}>ACCÈS</Text></View>
            : <View style={hs.premiumBadge}><Icon name="lock" size={9} color="#fff" /><Text style={hs.premiumText}>PREMIUM{item.price ? ` · ${item.price}€` : ''}</Text></View>
        )}
        <Text style={hs.title} numberOfLines={2}>{item.title}</Text>
        <View style={hs.meta}>
          {item.year ? <Text style={hs.metaText}>{item.year}</Text> : null}
          {item.year && item.language ? <Text style={hs.metaDot}>•</Text> : null}
          {item.language ? <Text style={hs.metaText}>{item.language.toUpperCase()}</Text> : null}
          {item.average_rating ? (
            <><Text style={hs.metaDot}>•</Text><Icon name="star" size={10} color="#FFB800" /><Text style={[hs.metaText, { color: '#FFB800' }]}>{item.average_rating.toFixed(1)}</Text></>
          ) : null}
        </View>
        {item.synopsis ? <Text style={hs.synopsis} numberOfLines={2}>{item.synopsis}</Text> : null}
        <View style={hs.buttons}>
          <TouchableOpacity style={[hs.btnWatch, isPremiumUnpaid && { backgroundColor: '#E8501A' }]} onPress={onPress} activeOpacity={0.88}>
            <Icon name={isPremiumUnpaid ? 'lock' : 'play'} size={15} color={isPremiumUnpaid ? '#fff' : '#000'} />
            <Text style={[hs.btnWatchText, isPremiumUnpaid && { color: '#fff' }]}>
              {isPremiumUnpaid ? `Acheter · ${item.price ?? ''}€` : 'Regarder'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={hs.btnMore} onPress={onPress} activeOpacity={0.88}>
            <Icon name="info" size={15} color="#fff" />
            <Text style={hs.btnMoreText}>Détails</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const hs = StyleSheet.create({
  content:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 18, paddingBottom: 28 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#E8501A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, marginBottom: 10 },
  premiumText:  { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  accessBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#10b98122', borderWidth: 1, borderColor: '#10b981', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, marginBottom: 10 },
  accessText:   { color: '#10b981', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title:        { color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 31, letterSpacing: -0.5, marginBottom: 8 },
  meta:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  metaText:     { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  metaDot:      { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
  synopsis:     { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  buttons:      { flexDirection: 'row', gap: 10 },
  btnWatch:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', paddingVertical: 12, borderRadius: 10 },
  btnWatchText: { color: '#000', fontSize: 14, fontWeight: '800' },
  btnMore:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  btnMoreText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  indicators:   { position: 'absolute', bottom: 120, left: 18, flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot:          { height: 3, borderRadius: 2 },
  dotActive:    { width: 22, backgroundColor: '#fff' },
  dotInactive:  { width: 6, backgroundColor: 'rgba(255,255,255,0.35)' },
});

// ─────────────────────────────────────────────────────────────────────────────
// FILTER BAR
// ─────────────────────────────────────────────────────────────────────────────

const FilterBar: React.FC<{
  sort: SortKey;
  filter: FilterKey;
  search: string;
  colors: any;
  onSort: (s: SortKey) => void;
  onFilter: (f: FilterKey) => void;
  onSearch: (q: string) => void;
}> = ({ sort, filter, search, colors, onSort, onFilter, onSearch }) => {
  const SORTS: { key: SortKey; label: string; icon: string }[] = [
    { key: 'recent', label: 'Récent', icon: 'clock' },
    { key: 'rating', label: 'Note', icon: 'star' },
    { key: 'year',   label: 'Année', icon: 'calendar' },
  ];
  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',     label: 'Tous' },
    { key: 'premium', label: 'Premium' },
    { key: 'free',    label: 'Gratuit' },
  ];

  return (
    <View style={{ paddingHorizontal: H_PAD, gap: 10, paddingTop: 14, paddingBottom: 6 }}>
      {/* Recherche */}
      <View style={[fb.searchBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <Icon name="search" size={15} color={colors.textTertiary} />
        <TextInput
          style={[fb.searchInput, { color: colors.textPrimary }]}
          placeholder="Rechercher un film..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={onSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => onSearch('')}>
            <Icon name="x" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tri */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SORTS.map(s => {
          const active = sort === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              onPress={() => onSort(s.key)}
              style={[fb.chip, { backgroundColor: active ? colors.primary : colors.backgroundSecondary, borderColor: active ? colors.primary : colors.border }]}
              activeOpacity={0.8}
            >
              <Icon name={s.icon} size={12} color={active ? '#fff' : colors.textTertiary} />
              <Text style={[fb.chipText, { color: active ? '#fff' : colors.textSecondary }]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={fb.divider} />
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => onFilter(f.key)}
              style={[fb.chip, { backgroundColor: active ? colors.accentOrange + 'ee' : colors.backgroundSecondary, borderColor: active ? colors.accentOrange : colors.border }]}
              activeOpacity={0.8}
            >
              <Text style={[fb.chipText, { color: active ? '#fff' : colors.textSecondary }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const fb = StyleSheet.create({
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  chipText:    { fontSize: 12, fontWeight: '600' },
  divider:     { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(128,128,128,0.3)', marginHorizontal: 2, alignSelf: 'stretch' },
});

// ─────────────────────────────────────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────────────────────────────────────

const Card: React.FC<{
  item: FilmItem;
  colors: any;
  purchased: boolean;
  onPress: () => void;
}> = ({ item, colors, purchased, onPress }) => {
  const scale = useSharedValue(1);
  const anim  = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[{ width: CARD_W }, anim]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
      >
        <View style={[c.poster, { backgroundColor: colors.backgroundSecondary }]}>
          {item.thumbnail_url
            ? <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, c.placeholder]}><Icon name="film" size={32} color={colors.textTertiary} /></View>
          }
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} locations={[0.5, 1]} style={c.gradient} pointerEvents="none" />
          {item.is_premium && (
            purchased
              ? <View style={[c.badge, { backgroundColor: '#10b98133', borderWidth: 1, borderColor: '#10b981' }]}><Icon name="check" size={8} color="#10b981" /><Text style={[c.badgeTxt, { color: '#10b981' }]}>Accès</Text></View>
              : <View style={c.badge}><Icon name="lock" size={8} color="#fff" /><Text style={c.badgeTxt}>{item.price ? `${item.price}€` : 'PPV'}</Text></View>
          )}
          {item.average_rating ? (
            <View style={c.ratingBadge}><Icon name="star" size={8} color="#FFB800" /><Text style={c.ratingText}>{item.average_rating.toFixed(1)}</Text></View>
          ) : null}
          <View style={c.overlay}>
            <Text style={c.overlayTitle} numberOfLines={2}>{item.title}</Text>
            <View style={c.overlayMeta}>
              {item.year ? <Text style={c.overlayMetaTxt}>{item.year}</Text> : null}
              {item.language ? <Text style={c.overlayMetaTxt}> · {item.language.toUpperCase()}</Text> : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const c = StyleSheet.create({
  poster:       { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden' },
  placeholder:  { alignItems: 'center', justifyContent: 'center' },
  gradient:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
  badge:        { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8501A', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  badgeTxt:     { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  ratingBadge:  { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  ratingText:   { color: '#FFB800', fontSize: 10, fontWeight: '700' },
  overlay:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10 },
  overlayTitle: { color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 16, marginBottom: 2 },
  overlayMeta:  { flexDirection: 'row' },
  overlayMetaTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '500' },
});

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────

const SkeletonGrid: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={{ paddingHorizontal: H_PAD, gap: GUTTER }}>
    {Array.from({ length: 3 }).map((_, ri) => (
      <View key={ri} style={{ flexDirection: 'row', gap: GUTTER }}>
        {[0, 1].map(ci => (
          <View key={ci} style={{ width: CARD_W, aspectRatio: 2 / 3, borderRadius: 12, backgroundColor: colors.skeleton ?? colors.backgroundSecondary }} />
        ))}
      </View>
    ))}
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export const MoviesScreen: React.FC = () => {
  const { theme }  = useTheme();
  const { colors } = theme;
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const [items, setItems]           = useState<FilmItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [hasActiveSub, setHasActiveSub] = useState(false);

  const [sort,   setSort]   = useState<SortKey>('recent');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      apiClient.get<{ access_ids: string[] }>(Endpoints.content.myAccesses)
        .then(r => setPurchasedIds(new Set(r.data?.access_ids ?? [])))
        .catch(() => {}),
      apiClient.get<{ is_active?: boolean } | null>(Endpoints.subscriptions.me)
        .then(r => setHasActiveSub(!!(r.data?.is_active)))
        .catch(() => {}),
    ]);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const resp = await contentService.listFilms({
        page: 1,
        limit: 60,
        is_premium: filter === 'premium' ? true : filter === 'free' ? false : undefined,
        sort,
      });
      const raw = Array.isArray(resp) ? resp : (resp as any)?.items ?? [];
      setItems(raw);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, sort]);

  useEffect(() => { load(); }, [load]);

  // Recherche locale uniquement (sur les données déjà chargées)
  const displayed = search.trim()
    ? items.filter(i => {
        const q = search.toLowerCase();
        return (
          i.title.toLowerCase().includes(q) ||
          (i.director ?? '').toLowerCase().includes(q) ||
          String(i.year ?? '').includes(q)
        );
      })
    : items;

  const heroItems = displayed.filter(i => i.banner_url || i.thumbnail_url);

  const rows: [FilmItem, FilmItem | null][] = [];
  for (let i = 0; i < displayed.length; i += 2) {
    rows.push([displayed[i], displayed[i + 1] ?? null]);
  }

  const goDetail = (item: FilmItem) => navigation.navigate('FilmDetail', { item });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Back flottant */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ position: 'absolute', zIndex: 20, top: insets.top + 8, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="arrow-left" size={20} color="#fff" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} progressViewOffset={insets.top} />
      }>
        {/* HERO */}
        {loading && items.length === 0
          ? <View style={{ height: HERO_H, backgroundColor: colors.backgroundSecondary }} />
          : heroItems.length > 0
            ? <HeroCarousel items={heroItems} purchasedIds={purchasedIds} hasActiveSub={hasActiveSub} onPress={goDetail} />
            : <View style={{ height: HERO_H * 0.4, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}><Icon name="film" size={48} color={colors.textTertiary} /></View>
        }

        {/* Titre section */}
        <View style={{ paddingHorizontal: H_PAD, paddingTop: 18 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Films</Text>
          {!loading && <Text style={[s.sectionSub, { color: colors.textTertiary }]}>{displayed.length} titre{displayed.length > 1 ? 's' : ''}</Text>}
        </View>

        {/* Filtres */}
        <FilterBar sort={sort} filter={filter} search={search} colors={colors} onSort={setSort} onFilter={setFilter} onSearch={setSearch} />

        {/* Grille */}
        {loading && items.length === 0 ? (
          <SkeletonGrid colors={colors} />
        ) : displayed.length === 0 ? (
          <Animated.View entering={FadeIn} style={s.empty}>
            <Icon name="film" size={52} color={colors.textTertiary} />
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucun film trouvé</Text>
            <Text style={[s.emptySub, { color: colors.textTertiary }]}>Essaie d'autres filtres</Text>
          </Animated.View>
        ) : (
          <View style={{ paddingHorizontal: H_PAD, gap: GUTTER }}>
            {rows.map(([a, b], ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: GUTTER }}>
                <Card item={a} colors={colors} purchased={purchasedIds.has(a.id) || (hasActiveSub && !!a.is_premium)} onPress={() => goDetail(a)} />
                {b
                  ? <Card item={b} colors={colors} purchased={purchasedIds.has(b.id) || (hasActiveSub && !!b.is_premium)} onPress={() => goDetail(b)} />
                  : <View style={{ width: CARD_W }} />
                }
              </View>
            ))}
          </View>
        )}

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  sectionTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  sectionSub:   { fontSize: 12, fontWeight: '500', marginTop: 2 },
  empty:        { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:   { fontSize: 17, fontWeight: '800' },
  emptySub:     { fontSize: 13, fontWeight: '500' },
});
