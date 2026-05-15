import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Image, RefreshControl,
  StyleSheet, Dimensions, ScrollView, StatusBar, FlatList,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
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

type NavProp = NativeStackNavigationProp<MainStackParamList>;

const { width: SW } = Dimensions.get('window');

const H_PAD   = 16;
const GUTTER  = 10;
const CARD_W  = (SW - H_PAD * 2 - GUTTER) / 2;
const HERO_H  = Math.round(SW * 0.72);
const HERO_N  = 6;

type Tab = 'film' | 'serie';

export interface FilmItem {
  id: string;
  type?: 'film' | 'serie';
  title: string;
  original_title?: string | null;
  year?: number;
  language?: string;
  synopsis?: string | null;
  short_synopsis?: string | null;
  director?: string | null;
  cast?: unknown;
  country?: string | null;
  rating?: string | null;
  thumbnail_url?: string | null;
  banner_url?: string | null;
  trailer_url?: string | null;
  is_premium?: boolean;
  price?: number | null;
  status?: string;
  total_seasons?: number;
  view_count?: number;
  average_rating?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO CAROUSEL — style cinéma plein écran
// ─────────────────────────────────────────────────────────────────────────────

const HeroCarousel: React.FC<{
  items: FilmItem[];
  purchasedIds: Set<string>;
  onPress: (item: FilmItem) => void;
}> = ({ items, purchasedIds, onPress }) => {
  const [idx, setIdx] = useState(0);
  const ref = useRef<FlatList>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();
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
    return () => clearInterval(timer.current);
  }, [advance, slides.length]);

  const onScrollEnd = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SW);
    setIdx(i);
    clearInterval(timer.current);
    timer.current = setInterval(advance, 5000);
  };

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
        renderItem={({ item }) => <HeroSlide item={item} purchased={purchasedIds.has(item.id)} onPress={() => onPress(item)} />}
      />

      {/* Indicateurs — en bas à gauche */}
      {slides.length > 1 && (
        <View style={hs.indicators}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                hs.dot,
                i === idx ? hs.dotActive : hs.dotInactive,
              ]}
            />
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
      {bg ? (
        <Image source={{ uri: bg }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}>
          <Icon name="film" size={64} color="#333" />
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={hs.content}>
        {/* Badge premium ou accès */}
        {item.is_premium && (
          purchased ? (
            <View style={hs.accessBadge}>
              <Icon name="check-circle" size={9} color="#10b981" />
              <Text style={hs.accessText}>ACCÈS</Text>
            </View>
          ) : (
            <View style={hs.premiumBadge}>
              <Icon name="lock" size={9} color="#fff" />
              <Text style={hs.premiumText}>PREMIUM{item.price ? ` · ${item.price}€` : ''}</Text>
            </View>
          )
        )}

        <Text style={hs.title} numberOfLines={2}>{item.title}</Text>

        <View style={hs.meta}>
          {item.year ? <Text style={hs.metaText}>{item.year}</Text> : null}
          {item.year && item.language ? <Text style={hs.metaDot}>•</Text> : null}
          {item.language ? <Text style={hs.metaText}>{item.language.toUpperCase()}</Text> : null}
          {item.average_rating ? (
            <>
              <Text style={hs.metaDot}>•</Text>
              <Icon name="star" size={10} color="#FFB800" />
              <Text style={[hs.metaText, { color: '#FFB800' }]}>{item.average_rating.toFixed(1)}</Text>
            </>
          ) : null}
        </View>

        {item.synopsis ? (
          <Text style={hs.synopsis} numberOfLines={2}>{item.synopsis}</Text>
        ) : null}

        <View style={hs.buttons}>
          <TouchableOpacity
            style={[hs.btnWatch, isPremiumUnpaid && { backgroundColor: '#E8501A' }]}
            onPress={onPress}
            activeOpacity={0.88}
          >
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
// TAB SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

const TabSelector: React.FC<{
  tab: Tab;
  onChange: (t: Tab) => void;
  colors: any;
}> = ({ tab, onChange, colors }) => {
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'film', label: 'Films', icon: 'film' },
    { key: 'serie', label: 'Séries', icon: 'tv' },
  ];

  return (
    <View style={[tabs_s.row, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
      {tabs.map(t => {
        const active = tab === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={[tabs_s.btn, active && tabs_s.btnActive]}
            onPress={() => onChange(t.key)}
            activeOpacity={0.8}
          >
            {active ? (
              <LinearGradient
                colors={[colors.gradientStart ?? '#7B3FF2', colors.gradientEnd ?? '#5B8DEF']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={tabs_s.btnInner}
              >
                <Icon name={t.icon} size={13} color="#fff" />
                <Text style={tabs_s.labelActive}>{t.label}</Text>
              </LinearGradient>
            ) : (
              <View style={tabs_s.btnInner}>
                <Icon name={t.icon} size={13} color={colors.textTertiary} />
                <Text style={[tabs_s.label, { color: colors.textTertiary }]}>{t.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const tabs_s = StyleSheet.create({
  row:       { flexDirection: 'row', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 3 },
  btn:       { flex: 1, borderRadius: 10, overflow: 'hidden' },
  btnActive: {},
  btnInner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9 },
  label:     { fontSize: 13, fontWeight: '600' },
  labelActive: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

// ─────────────────────────────────────────────────────────────────────────────
// CARD — poster 2:3 avec overlay
// ─────────────────────────────────────────────────────────────────────────────

const Card: React.FC<{
  item: FilmItem;
  index: number;
  tab: Tab;
  colors: any;
  purchased: boolean;
  onPress: () => void;
}> = ({ item, index, tab, colors, purchased, onPress }) => {
  const scale = useSharedValue(1);
  const anim  = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(400)}
      style={[{ width: CARD_W }, anim]}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
      >
        {/* Poster 2:3 */}
        <View style={[card.poster, { backgroundColor: colors.backgroundSecondary }]}>
          {item.thumbnail_url ? (
            <Image
              source={{ uri: item.thumbnail_url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, card.placeholder]}>
              <Icon name={tab === 'film' ? 'film' : 'tv'} size={32} color={colors.textTertiary} />
            </View>
          )}

          {/* Dégradé bas */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            locations={[0.5, 1]}
            style={card.gradient}
            pointerEvents="none"
          />

          {/* Badge premium ou accès */}
          {item.is_premium && (
            purchased ? (
              <View style={[card.premBadge, { backgroundColor: '#10b98133', borderWidth: 1, borderColor: '#10b981' }]}>
                <Icon name="check" size={8} color="#10b981" />
                <Text style={[card.premBadgeTxt, { color: '#10b981' }]}>Accès</Text>
              </View>
            ) : (
              <View style={card.premBadge}>
                <Icon name="lock" size={8} color="#fff" />
                <Text style={card.premBadgeTxt}>
                  {item.price ? `${item.price}€` : 'PPV'}
                </Text>
              </View>
            )
          )}

          {/* Note en bas à gauche */}
          {item.average_rating ? (
            <View style={card.ratingBadge}>
              <Icon name="star" size={8} color="#FFB800" />
              <Text style={card.ratingText}>{item.average_rating.toFixed(1)}</Text>
            </View>
          ) : null}

          {/* Titre + année sur le poster */}
          <View style={card.overlay}>
            <Text style={card.overlayTitle} numberOfLines={2}>{item.title}</Text>
            <View style={card.overlayMeta}>
              {item.year ? <Text style={card.overlayMetaTxt}>{item.year}</Text> : null}
              {item.year && tab === 'serie' && item.total_seasons ? (
                <Text style={card.overlayMetaTxt}> · {item.total_seasons}S</Text>
              ) : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const card = StyleSheet.create({
  poster:       { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden' },
  placeholder:  { alignItems: 'center', justifyContent: 'center' },
  gradient:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
  premBadge:    { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8501A', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  premBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  ratingBadge:  { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  ratingText:   { color: '#FFB800', fontSize: 10, fontWeight: '700' },
  overlay:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10 },
  overlayTitle: { color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 16, marginBottom: 2 },
  overlayMeta:  { flexDirection: 'row' },
  overlayMetaTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '500' },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ label: string; count: number; colors: any }> = ({ label, count, colors }) => (
  <Animated.View entering={FadeIn.duration(300)} style={sh.row}>
    <View>
      <Text style={[sh.title, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[sh.sub, { color: colors.textTertiary }]}>{count} titre{count > 1 ? 's' : ''}</Text>
    </View>
  </Animated.View>
);

const sh = StyleSheet.create({
  row:   { paddingHorizontal: H_PAD, paddingTop: 20, paddingBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub:   { fontSize: 12, fontWeight: '500', marginTop: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────

const Skeleton: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={{ paddingHorizontal: H_PAD, gap: GUTTER }}>
    {Array.from({ length: 3 }).map((_, ri) => (
      <View key={ri} style={{ flexDirection: 'row', gap: GUTTER }}>
        {[0, 1].map(ci => (
          <View
            key={ci}
            style={{ width: CARD_W, aspectRatio: 2 / 3, borderRadius: 12, backgroundColor: colors.skeleton ?? colors.backgroundSecondary }}
          />
        ))}
      </View>
    ))}
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export const FilmsScreen: React.FC = () => {
  const { theme }   = useTheme();
  const { colors }  = theme;
  const insets      = useSafeAreaInsets();
  const navigation  = useNavigation<NavProp>();

  const [tab, setTab]               = useState<Tab>('film');
  const [items, setItems]           = useState<FilmItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

  // Charger les accès PPV une seule fois
  useEffect(() => {
    apiClient.get<{ access_ids: string[] }>(Endpoints.content.myAccesses)
      .then(r => setPurchasedIds(new Set(r.data?.access_ids ?? [])))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const resp = tab === 'film'
        ? await contentService.listFilms({ page: 1, limit: 40 })
        : await contentService.listSeries({ page: 1, limit: 40 });
      setItems(Array.isArray(resp) ? resp : (resp as any)?.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    load();
  }, [tab]);

  const goDetail = (item: FilmItem) => navigation.navigate('FilmDetail', { item });

  // Grille 2 colonnes — paires de lignes
  const rows: [FilmItem, FilmItem | null][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i], items[i + 1] ?? null]);
  }

  const label = tab === 'film' ? 'Films' : 'Séries';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
            progressViewOffset={insets.top}
          />
        }
      >
        {/* ── HERO ── */}
        {loading ? (
          <View style={{ height: HERO_H, backgroundColor: colors.backgroundSecondary }} />
        ) : items.length > 0 ? (
          <HeroCarousel items={items} purchasedIds={purchasedIds} onPress={goDetail} />
        ) : (
          <View style={{ height: HERO_H * 0.5, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={tab === 'film' ? 'film' : 'tv'} size={48} color={colors.textTertiary} />
          </View>
        )}

        {/* ── TABS ── */}
        <View style={{ paddingHorizontal: H_PAD, paddingTop: 18, paddingBottom: 4 }}>
          <TabSelector tab={tab} onChange={t => setTab(t)} colors={colors} />
        </View>

        {/* ── SECTION HEADER ── */}
        {!loading && <SectionHeader label={label} count={items.length} colors={colors} />}

        {/* ── GRILLE ── */}
        {loading ? (
          <Skeleton colors={colors} />
        ) : items.length === 0 ? (
          <View style={ss.empty}>
            <Icon name={tab === 'film' ? 'film' : 'tv'} size={52} color={colors.textTertiary} />
            <Text style={[ss.emptyTitle, { color: colors.textPrimary }]}>Aucun contenu</Text>
            <Text style={[ss.emptySub, { color: colors.textTertiary }]}>Revenez plus tard</Text>
          </View>
        ) : (
          <View style={ss.grid}>
            {rows.map(([a, b], ri) => (
              <View key={ri} style={ss.row}>
                <Card item={a} index={ri * 2}     tab={tab} colors={colors} purchased={purchasedIds.has(a.id)} onPress={() => goDetail(a)} />
                {b ? (
                  <Card item={b} index={ri * 2 + 1} tab={tab} colors={colors} purchased={purchasedIds.has(b.id)} onPress={() => goDetail(b)} />
                ) : (
                  <View style={{ width: CARD_W }} />
                )}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
};

const ss = StyleSheet.create({
  grid:       { paddingHorizontal: H_PAD, gap: GUTTER },
  row:        { flexDirection: 'row', gap: GUTTER },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptySub:   { fontSize: 13, fontWeight: '500' },
});
