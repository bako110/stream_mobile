import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Image, RefreshControl,
  StyleSheet, Dimensions, ScrollView, StatusBar, FlatList,
  TextInput, Modal,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, useSharedValue, useAnimatedStyle,
  withSpring, withTiming, interpolate, Extrapolation,
  useAnimatedScrollHandler, runOnJS,
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
import { searchHistoryService, type SearchHistoryItem } from '../../services/searchHistoryService';
import { BackButton, PriceWithLocal } from '../../components/common';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

const { width: SW, height: SH } = Dimensions.get('window');
const H_PAD   = 14;
const GUTTER  = 8;
const CARD_W  = (SW - H_PAD * 2 - GUTTER) / 2;
const CARD_W_H = Math.round(SW * 0.40);
const HERO_H  = Math.round(SH * 0.58);

const PAGE_LIMIT = 20;
const PURPLE = '#7B3FF2';
const PURPLE_DARK = '#5B2DB0';

type SortKey   = 'recent' | 'rating' | 'seasons' | 'views';
type FilterKey = 'all' | 'premium' | 'free' | 'ongoing';

const GENRES = [
  'Action', 'Aventure', 'Animation', 'Comédie', 'Documentaire',
  'Drame', 'Fantastique', 'Horreur', 'Musical', 'Romance',
  'Science-Fiction', 'Thriller', 'Western', 'Policier', 'Historique',
];

const COUNTRIES = [
  'Sénégal', "Côte d'Ivoire", 'Mali', 'Cameroun', 'Nigeria',
  'Ghana', 'Maroc', 'Algérie', 'Tunisie', 'Égypte',
  'Afrique du Sud', 'Kenya', 'France', 'États-Unis', 'Royaume-Uni',
  'Inde', 'Brésil', 'Mexique', 'Chine', 'Japon', 'Corée du Sud',
];
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'fr', label: 'Français'  },
  { code: 'en', label: 'Anglais'   },
  { code: 'ar', label: 'Arabe'     },
  { code: 'wo', label: 'Wolof'     },
  { code: 'sw', label: 'Swahili'   },
  { code: 'pt', label: 'Portugais' },
  { code: 'es', label: 'Espagnol'  },
  { code: 'hi', label: 'Hindi'     },
  { code: 'zh', label: 'Chinois'   },
  { code: 'ko', label: 'Coréen'    },
  { code: 'ja', label: 'Japonais'  },
];
const RATING_OPTIONS: { value: number; label: string }[] = [
  { value: 0,   label: 'Toutes' },
  { value: 3,   label: '3+'     },
  { value: 3.5, label: '3.5+'   },
  { value: 4,   label: '4+'     },
  { value: 4.5, label: '4.5+'   },
];

// ─────────────────────────────────────────────────────────────────────────────
// SHIMMER
// ─────────────────────────────────────────────────────────────────────────────

const ShimmerCard: React.FC<{ width: number; height: number; colors: any }> = ({ width, height, colors }) => {
  const anim = useSharedValue(0);
  useEffect(() => {
    anim.value = withTiming(1, { duration: 900 });
    const id = setInterval(() => {
      anim.value = 0;
      anim.value = withTiming(1, { duration: 900 });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(anim.value, [0, 0.5, 1], [0.4, 0.8, 0.4], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[{ width, height, borderRadius: 12, backgroundColor: colors.skeleton ?? colors.backgroundSecondary }, style]} />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HERO BANNER — série vedette avec carousel
// ─────────────────────────────────────────────────────────────────────────────

const HeroBanner: React.FC<{
  items: FilmItem[];
  purchasedIds: Set<string>;
  hasActiveSub: boolean;
  onPress: (item: FilmItem) => void;
}> = ({ items, purchasedIds, hasActiveSub, onPress }) => {
  const [idx, setIdx] = useState(0);
  const ref   = useRef<FlatList>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const slides = items.slice(0, 5);

  const advance = useCallback(() => {
    setIdx(prev => {
      const n = (prev + 1) % slides.length;
      ref.current?.scrollToIndex({ index: n, animated: true });
      return n;
    });
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    timer.current = setInterval(advance, 6000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [advance, slides.length]);

  const onScrollEnd = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SW);
    setIdx(i);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(advance, 6000);
  };

  if (!slides.length) return null;

  return (
    <View style={{ height: HERO_H }}>
      <FlatList
        ref={ref}
        data={slides}
        keyExtractor={i => i.id}
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
        <View style={hs.dotsRow}>
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
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#08050f', alignItems: 'center', justifyContent: 'center' }]}><Icon name="tv" size={64} color="#1a1a2e" /></View>
      }
      {/* Gradient violet -> noir pour identité série */}
      <LinearGradient
        colors={[`${PURPLE}00`, `${PURPLE}11`, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)', '#000']}
        locations={[0, 0.2, 0.5, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={hs.content}>
        {/* Type badge */}
        <View style={hs.serieTag}>
          <Icon name="tv" size={9} color={PURPLE} />
          <Text style={hs.serieTagText}>SÉRIE</Text>
        </View>
        <View style={hs.badgeRow}>
          {item.is_premium && (
            purchased
              ? <View style={hs.accessBadge}><Icon name="check-circle" size={9} color="#10b981" /><Text style={hs.accessText}>ACCÈS</Text></View>
              : <View style={hs.premiumBadge}><Icon name="zap" size={9} color="#fff" /><Text style={hs.premiumText}>PREMIUM</Text></View>
          )}
          {item.total_seasons ? (
            <View style={hs.seasonTag}>
              <Icon name="layers" size={9} color={PURPLE} />
              <Text style={hs.seasonTagText}>{item.total_seasons} saison{item.total_seasons > 1 ? 's' : ''}</Text>
            </View>
          ) : null}
          {item.year ? <Text style={hs.yearTag}>{item.year}</Text> : null}
        </View>
        <Text style={hs.title} numberOfLines={2}>{item.title}</Text>
        {item.average_rating ? (
          <View style={hs.ratingRow}>
            {[1,2,3,4,5].map(n => (
              <Icon key={n} name="star" size={11} color={n <= Math.round(item.average_rating! / 2) ? '#FFB800' : 'rgba(255,255,255,0.2)'} />
            ))}
            <Text style={hs.ratingTxt}>{item.average_rating.toFixed(1)}</Text>
          </View>
        ) : null}
        {item.synopsis ? <Text style={hs.synopsis} numberOfLines={2}>{item.synopsis}</Text> : null}
        <View style={hs.buttons}>
          <TouchableOpacity style={[hs.btnWatch, isPremiumUnpaid && { overflow: 'hidden' }]} onPress={onPress} activeOpacity={0.85}>
            {isPremiumUnpaid ? (
              <LinearGradient colors={['#E8501A', '#c43e14']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hs.btnGrad}>
                <Icon name="lock" size={15} color="#fff" />
                <Text style={[hs.btnWatchText, { color: '#fff' }]}>
                  Acheter ·{' '}
                  <PriceWithLocal
                    amountEur={item.price ?? 0}
                    style={[hs.btnWatchText, { color: '#fff' }]}
                    localStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  />
                </Text>
              </LinearGradient>
            ) : (
              <LinearGradient colors={[PURPLE, PURPLE_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hs.btnGrad}>
                <Icon name="play" size={15} color="#fff" />
                <Text style={[hs.btnWatchText, { color: '#fff' }]}>Regarder</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={hs.btnMore} onPress={onPress} activeOpacity={0.85}>
            <View style={hs.btnMoreInner}>
              <Icon name="info" size={15} color="#fff" />
              <Text style={hs.btnMoreText}>Détails</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const hs = StyleSheet.create({
  content:     { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 30 },
  serieTag:    { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: `${PURPLE}25`, borderWidth: 1, borderColor: `${PURPLE}80`, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, marginBottom: 10 },
  serieTagText: { color: PURPLE, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  badgeRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8501A', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  premiumText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  accessBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: '#10b981', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  accessText:  { color: '#10b981', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  seasonTag:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${PURPLE}20`, borderWidth: 1, borderColor: `${PURPLE}60`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  seasonTagText: { color: PURPLE, fontSize: 10, fontWeight: '700' },
  yearTag:     { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  title:       { color: '#fff', fontSize: 27, fontWeight: '900', lineHeight: 32, letterSpacing: -0.7, marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  ratingRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  ratingTxt:   { color: '#FFB800', fontSize: 12, fontWeight: '700', marginLeft: 4 },
  synopsis:    { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 19, marginBottom: 18 },
  buttons:     { flexDirection: 'row', gap: 10 },
  btnWatch:    { flex: 1, borderRadius: 12, overflow: 'hidden' },
  btnGrad:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13 },
  btnWatchText: { fontSize: 14, fontWeight: '800' },
  btnMore:     { overflow: 'hidden', borderRadius: 12 },
  btnMoreInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 22, paddingVertical: 13 },
  btnMoreText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  dotsRow:     { position: 'absolute', bottom: 142, right: 20, flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot:         { height: 3, borderRadius: 2 },
  dotActive:   { width: 20, backgroundColor: PURPLE },
  dotInactive: { width: 5, backgroundColor: 'rgba(255,255,255,0.25)' },
});

// ─────────────────────────────────────────────────────────────────────────────
// HORIZONTAL ROW
// ─────────────────────────────────────────────────────────────────────────────

const HorizontalRow: React.FC<{
  title: string;
  items: FilmItem[];
  purchasedIds: Set<string>;
  hasActiveSub: boolean;
  colors: any;
  onPress: (item: FilmItem) => void;
  accent?: string;
}> = ({ title, items, purchasedIds, hasActiveSub, colors, onPress, accent }) => {
  if (!items.length) return null;
  return (
    <Animated.View entering={FadeInDown.delay(100).springify()} style={{ marginBottom: 24 }}>
      <View style={[rh.header, { paddingHorizontal: H_PAD }]}>
        {accent ? <View style={[rh.accentLine, { backgroundColor: accent }]} /> : null}
        <Text style={[rh.title, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={i => i.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: H_PAD, gap: 10 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
            <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.85}>
              <View style={[rh.card, { backgroundColor: colors.backgroundSecondary }]}>
                {item.thumbnail_url
                  ? <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <View style={[StyleSheet.absoluteFill, rh.placeholder]}><Icon name="tv" size={24} color={colors.textTertiary} /></View>
                }
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} locations={[0.4, 1]} style={rh.gradient} pointerEvents="none" />
                {item.total_seasons ? (
                  <View style={rh.seasonBadge}>
                    <Icon name="layers" size={7} color={PURPLE} />
                    <Text style={rh.seasonBadgeTxt}>{item.total_seasons}S</Text>
                  </View>
                ) : null}
                {item.is_premium && (
                  purchasedIds.has(item.id) || (hasActiveSub && !!item.is_premium)
                    ? <View style={[rh.cornerBadge, { backgroundColor: 'rgba(16,185,129,0.9)' }]}><Icon name="check" size={7} color="#fff" /></View>
                    : <View style={[rh.cornerBadge, { backgroundColor: '#E8501A' }]}><Icon name="zap" size={7} color="#fff" /></View>
                )}
                <View style={rh.overlay}>
                  <Text style={rh.overlayTitle} numberOfLines={2}>{item.title}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}
      />
    </Animated.View>
  );
};

const rh = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  accentLine:  { width: 3, height: 16, borderRadius: 2 },
  title:       { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  card:        { width: CARD_W_H, aspectRatio: 2 / 3, borderRadius: 10, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  gradient:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
  cornerBadge: { position: 'absolute', top: 7, right: 7, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  seasonBadge: { position: 'absolute', top: 7, left: 7, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: `${PURPLE}30`, borderWidth: 1, borderColor: `${PURPLE}80`, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  seasonBadgeTxt: { color: PURPLE, fontSize: 9, fontWeight: '800' },
  overlay:     { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8 },
  overlayTitle: { color: '#fff', fontSize: 11, fontWeight: '800', lineHeight: 14 },
});

// ─────────────────────────────────────────────────────────────────────────────
// GRID CARD
// ─────────────────────────────────────────────────────────────────────────────

const GridCard: React.FC<{
  item: FilmItem;
  colors: any;
  purchased: boolean;
  onPress: () => void;
  index: number;
}> = ({ item, colors, purchased, onPress, index }) => {
  const scale = useSharedValue(1);
  const anim  = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[{ width: CARD_W }, anim]}
      entering={FadeInDown.delay(index * 30).springify()}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.95, { damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
      >
        <View style={[cd.poster, { backgroundColor: colors.backgroundSecondary }]}>
          {item.thumbnail_url
            ? <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, cd.placeholder]}><Icon name="tv" size={32} color={colors.textTertiary} /></View>
          }
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.85)']}
            locations={[0.35, 0.6, 1]}
            style={cd.gradient}
            pointerEvents="none"
          />
          {/* Saisons badge top-left */}
          {item.total_seasons ? (
            <View style={cd.seasonBadge}>
              <Icon name="layers" size={8} color={PURPLE} />
              <Text style={cd.seasonTxt}>{item.total_seasons}S</Text>
            </View>
          ) : null}
          {/* Premium top-right */}
          {item.is_premium && (
            purchased
              ? <View style={[cd.cornerBadge, { backgroundColor: 'rgba(16,185,129,0.9)' }]}><Icon name="check" size={8} color="#fff" /></View>
              : <View style={[cd.cornerBadge, { backgroundColor: '#E8501A' }]}><Icon name="zap" size={8} color="#fff" /></View>
          )}
          {/* Rating */}
          {item.average_rating ? (
            <View style={cd.ratingBadge}>
              <Icon name="star" size={8} color="#FFB800" />
              <Text style={cd.ratingText}>{item.average_rating.toFixed(1)}</Text>
            </View>
          ) : null}
          <View style={cd.overlay}>
            <Text style={cd.overlayTitle} numberOfLines={2}>{item.title}</Text>
            {item.year ? <Text style={cd.overlayMeta}>{item.year}</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const cd = StyleSheet.create({
  poster:      { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  gradient:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%' },
  cornerBadge: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  seasonBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${PURPLE}25`, borderWidth: 1, borderColor: `${PURPLE}70`, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  seasonTxt:   { color: PURPLE, fontSize: 10, fontWeight: '800' },
  ratingBadge: { position: 'absolute', bottom: 40, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  ratingText:  { color: '#FFB800', fontSize: 10, fontWeight: '700' },
  overlay:     { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10 },
  overlayTitle: { color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 16, marginBottom: 2 },
  overlayMeta:  { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '500' },
});

// ─────────────────────────────────────────────────────────────────────────────
// FILTER BAR
// ─────────────────────────────────────────────────────────────────────────────

const SORTS: { key: SortKey; label: string; icon: string }[] = [
  { key: 'recent',  label: 'Récent',    icon: 'clock' },
  { key: 'rating',  label: 'Mieux noté', icon: 'star' },
  { key: 'seasons', label: 'Saisons',   icon: 'layers' },
  { key: 'views',   label: 'Tendance',  icon: 'trending-up' },
];
const FILTERS: { key: FilterKey; label: string; icon?: string }[] = [
  { key: 'all',     label: 'Toutes' },
  { key: 'ongoing', label: 'En cours', icon: 'activity' },
  { key: 'premium', label: 'Premium',  icon: 'zap' },
  { key: 'free',    label: 'Gratuit',  icon: 'gift' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────

const SkeletonSection: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={{ gap: 24 }}>
    <View style={{ paddingHorizontal: H_PAD }}>
      <View style={{ width: 140, height: 16, borderRadius: 8, backgroundColor: colors.skeleton ?? colors.backgroundSecondary, marginBottom: 14 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[0, 1, 2].map(i => <ShimmerCard key={i} width={CARD_W_H} height={Math.round(CARD_W_H * 1.5)} colors={colors} />)}
      </View>
    </View>
    <View style={{ paddingHorizontal: H_PAD, gap: GUTTER }}>
      {[0, 1, 2].map(ri => (
        <View key={ri} style={{ flexDirection: 'row', gap: GUTTER }}>
          <ShimmerCard width={CARD_W} height={Math.round(CARD_W * 1.5)} colors={colors} />
          <ShimmerCard width={CARD_W} height={Math.round(CARD_W * 1.5)} colors={colors} />
        </View>
      ))}
    </View>
  </View>
);


// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export const SeriesScreen: React.FC = () => {
  const { theme }  = useTheme();
  const { colors } = theme;
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const [items, setItems]               = useState<FilmItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [page, setPage]                 = useState(1);
  const [hasMore, setHasMore]           = useState(true);
  const [total, setTotal]               = useState(0);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [hasActiveSub, setHasActiveSub] = useState(false);

  const [sort,      setSort]      = useState<SortKey>('recent');
  const [filter,    setFilter]    = useState<FilterKey>('all');
  const [genre,     setGenre]     = useState('');
  const [country,   setCountry]   = useState('');
  const [language,  setLanguage]  = useState('');
  const [minRating, setMinRating] = useState(0);
  const [filterOpen,     setFilterOpen]     = useState(false);
  const [draftSort,      setDraftSort]      = useState<SortKey>('recent');
  const [draftFilter,    setDraftFilter]    = useState<FilterKey>('all');
  const [draftGenre,     setDraftGenre]     = useState('');
  const [draftCountry,   setDraftCountry]   = useState('');
  const [draftLanguage,  setDraftLanguage]  = useState('');
  const [draftMinRating, setDraftMinRating] = useState(0);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);

  // Debounce 400ms — recherche envoyée au backend
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const historySuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return searchHistory.filter(h => h.query.toLowerCase().includes(q) && h.query.toLowerCase() !== q).slice(0, 5);
  }, [search, searchHistory]);

  const scrollY      = useSharedValue(0);
  const loadMoreRef  = useRef<() => void>(() => {});
  const onScroll     = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
    const { layoutMeasurement, contentOffset, contentSize } = e;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 300) {
      runOnJS(loadMoreRef.current)();
    }
  });
  const loadingRef = useRef(false);

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

  const filterParams = useMemo(() => ({
    is_premium: filter === 'premium' ? true : filter === 'free' ? false : undefined,
    ongoing:    filter === 'ongoing' ? true : undefined,
    sort,
    genre:      genre      || undefined,
    country:    country    || undefined,
    language:   language   || undefined,
    min_rating: minRating  > 0 ? minRating : undefined,
    search:     searchDebounced || undefined,
  }), [filter, sort, genre, country, language, minRating, searchDebounced]);

  // Chargement page 1 — reset complet
  const load = useCallback(async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const resp = await contentService.listSeries({ page: 1, limit: PAGE_LIMIT, ...filterParams });
      const raw = Array.isArray(resp) ? resp : (resp as any)?.items ?? [];
      const tot = (resp as any)?.total ?? raw.length;
      setItems(raw);
      setPage(1);
      setTotal(tot);
      setHasMore(raw.length >= PAGE_LIMIT && raw.length < tot);
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, [filterParams]);

  // Chargement page suivante
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const resp = await contentService.listSeries({ page: nextPage, limit: PAGE_LIMIT, ...filterParams });
      const raw = Array.isArray(resp) ? resp : (resp as any)?.items ?? [];
      const tot = (resp as any)?.total ?? total;
      setItems(prev => {
        const existingIds = new Set(prev.map(i => i.id));
        return [...prev, ...raw.filter((i: FilmItem) => !existingIds.has(i.id))];
      });
      setPage(nextPage);
      setTotal(tot);
      setHasMore(raw.length >= PAGE_LIMIT && (items.length + raw.length) < tot);
    } catch {
      // silencieux
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [hasMore, page, filterParams, items.length, total]);

  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);
  useEffect(() => { load(); }, [load]);

  const displayed = items;

  // Rows thématiques calculées sur les items chargés (pas displayed)
  const heroItems    = items.filter(i => i.banner_url || i.thumbnail_url);
  const topRated     = useMemo(() => [...items].sort((a, b) => (b.average_rating ?? 0) - (a.average_rating ?? 0)).slice(0, 12), [items]);
  const mostSeasons  = useMemo(() => [...items].filter(i => (i.total_seasons ?? 0) > 0).sort((a, b) => (b.total_seasons ?? 0) - (a.total_seasons ?? 0)).slice(0, 12), [items]);
  const premiumItems = useMemo(() => items.filter(i => i.is_premium).slice(0, 12), [items]);

  const rows: [FilmItem, FilmItem | null][] = [];
  for (let i = 0; i < displayed.length; i += 2) {
    rows.push([displayed[i], displayed[i + 1] ?? null]);
  }

  const openFilter = () => {
    setDraftSort(sort);         setDraftFilter(filter);
    setDraftGenre(genre);       setDraftCountry(country);
    setDraftLanguage(language); setDraftMinRating(minRating);
    setFilterOpen(true);
  };
  const applyFilter = () => {
    setSort(draftSort);         setFilter(draftFilter);
    setGenre(draftGenre);       setCountry(draftCountry);
    setLanguage(draftLanguage); setMinRating(draftMinRating);
    setFilterOpen(false);
  };
  const resetFilter = () => {
    setDraftSort('recent');     setDraftFilter('all');
    setDraftGenre('');          setDraftCountry('');
    setDraftLanguage('');       setDraftMinRating(0);
  };
  const hasActiveFilter = !!(genre || country || language || minRating > 0 || sort !== 'recent' || filter !== 'all');
  const hasDraftFilter  = !!(draftGenre || draftCountry || draftLanguage || draftMinRating > 0 || draftSort !== 'recent' || draftFilter !== 'all');

  const goDetail = (item: FilmItem) => navigation.navigate('SerieEpisodes', { item });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── HEADER FIXE ─────────────────────────────────────────────────── */}
      <View style={[hdr.wrap, { paddingTop: insets.top + 6, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {/* Ligne 1 : back + titre TV pill + compteur */}
        <View style={hdr.row1}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[hdr.title, { color: colors.textPrimary }]}>Séries</Text>
            <View style={[hdr.tvPill, { borderColor: `${PURPLE}70`, backgroundColor: `${PURPLE}20` }]}>
              <Icon name="tv" size={9} color={PURPLE} />
              <Text style={[hdr.tvPillTxt, { color: PURPLE }]}>TV</Text>
            </View>
          </View>
          {!loading && total > 0 && (
            <Text style={[hdr.sub, { color: colors.textTertiary }]}>
              {total} série{total > 1 ? 's' : ''}
            </Text>
          )}
        </View>

        {/* Ligne 2 : recherche + bouton filtre */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: H_PAD, paddingBottom: 10 }}>
          <View style={[hdr.searchWrap, { flex: 1, backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Icon name="search" size={14} color={colors.textTertiary} />
            <TextInput
              style={[hdr.searchInput, { color: colors.textPrimary }]}
              placeholder="Rechercher une série..."
              placeholderTextColor={colors.textTertiary}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              onFocus={() => { setSearchFocused(true); setSearchHistory(searchHistoryService.getAll()); }}
              onBlur={() => setSearchFocused(false)}
              onSubmitEditing={() => { if (search.trim()) { searchHistoryService.add(search.trim()); setSearchHistory(searchHistoryService.getAll()); } }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <View style={hdr.clearBtn}><Icon name="x" size={10} color="#fff" /></View>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={openFilter}
            activeOpacity={0.75}
            style={[hdr.filterBtn, {
              backgroundColor: hasActiveFilter ? PURPLE : colors.backgroundSecondary,
              borderColor: hasActiveFilter ? PURPLE : colors.border,
            }]}
          >
            <Icon name="sliders" size={15} color={hasActiveFilter ? '#fff' : colors.textSecondary} />
            {hasActiveFilter && <View style={hdr.filterDot} />}
          </TouchableOpacity>
        </View>

        {/* Chips filtres genre/pays actifs */}
        {hasActiveFilter && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: H_PAD, paddingBottom: 10 }}>
            {genre ? (
              <View style={[hdr.activeChip, { borderColor: PURPLE, backgroundColor: PURPLE + '18' }]}>
                <Icon name="tag" size={10} color={PURPLE} />
                <Text style={[hdr.activeChipTxt, { color: PURPLE }]}>{genre}</Text>
                <TouchableOpacity onPress={() => setGenre('')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Icon name="x" size={10} color={PURPLE} />
                </TouchableOpacity>
              </View>
            ) : null}
            {country ? (
              <View style={[hdr.activeChip, { borderColor: PURPLE, backgroundColor: PURPLE + '18' }]}>
                <Icon name="map-pin" size={10} color={PURPLE} />
                <Text style={[hdr.activeChipTxt, { color: PURPLE }]}>{country}</Text>
                <TouchableOpacity onPress={() => setCountry('')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Icon name="x" size={10} color={PURPLE} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* ── MODAL FILTRES ── */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <TouchableOpacity style={fl.overlay} activeOpacity={1} onPress={() => setFilterOpen(false)} />
        <View style={[fl.sheet, { backgroundColor: colors.surface }]}>
          <View style={[fl.handle, { backgroundColor: colors.border }]} />
          <View style={fl.sheetHeader}>
            <Text style={[fl.sheetTitle, { color: colors.textPrimary }]}>Filtres</Text>
            <TouchableOpacity onPress={resetFilter} activeOpacity={0.7}>
              <Text style={[fl.resetTxt, { color: hasDraftFilter ? PURPLE : colors.textTertiary }]}>Réinitialiser</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>

            {/* Tri */}
            <Text style={[fl.sectionTitle, { color: colors.textSecondary }]}>TRI</Text>
            <View style={fl.tagsWrap}>
              {SORTS.map(s => {
                const active = draftSort === s.key;
                return (
                  <TouchableOpacity key={s.key} onPress={() => setDraftSort(s.key)} activeOpacity={0.75}
                    style={[fl.tag, { backgroundColor: active ? PURPLE : colors.backgroundSecondary, borderColor: active ? PURPLE : colors.border }]}>
                    <Icon name={s.icon} size={11} color={active ? '#fff' : colors.textSecondary} />
                    <Text style={[fl.tagTxt, { color: active ? '#fff' : colors.textSecondary }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Catégorie */}
            <Text style={[fl.sectionTitle, { color: colors.textSecondary, marginTop: 20 }]}>CATÉGORIE</Text>
            <View style={fl.tagsWrap}>
              {FILTERS.map(f => {
                const active = draftFilter === f.key;
                const activeColor = f.key === 'ongoing' ? PURPLE : f.key === 'premium' ? '#E8501A' : f.key === 'free' ? '#10b981' : PURPLE;
                return (
                  <TouchableOpacity key={f.key} onPress={() => setDraftFilter(f.key)} activeOpacity={0.75}
                    style={[fl.tag, { backgroundColor: active ? activeColor : colors.backgroundSecondary, borderColor: active ? activeColor : colors.border }]}>
                    {f.icon ? <Icon name={f.icon} size={11} color={active ? '#fff' : colors.textSecondary} /> : null}
                    <Text style={[fl.tagTxt, { color: active ? '#fff' : colors.textSecondary }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Genre */}
            <Text style={[fl.sectionTitle, { color: colors.textSecondary, marginTop: 20 }]}>TYPE / GENRE</Text>
            <View style={fl.tagsWrap}>
              {GENRES.map(g => {
                const active = draftGenre === g;
                return (
                  <TouchableOpacity key={g} onPress={() => setDraftGenre(active ? '' : g)} activeOpacity={0.75}
                    style={[fl.tag, { backgroundColor: active ? PURPLE : colors.backgroundSecondary, borderColor: active ? PURPLE : colors.border }]}>
                    <Text style={[fl.tagTxt, { color: active ? '#fff' : colors.textSecondary }]}>{g}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Zone */}
            <Text style={[fl.sectionTitle, { color: colors.textSecondary, marginTop: 20 }]}>ZONE / PAYS</Text>
            <View style={fl.tagsWrap}>
              {COUNTRIES.map(c => {
                const active = draftCountry === c;
                return (
                  <TouchableOpacity key={c} onPress={() => setDraftCountry(active ? '' : c)} activeOpacity={0.75}
                    style={[fl.tag, { backgroundColor: active ? PURPLE : colors.backgroundSecondary, borderColor: active ? PURPLE : colors.border }]}>
                    <Text style={[fl.tagTxt, { color: active ? '#fff' : colors.textSecondary }]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Langue */}
            <Text style={[fl.sectionTitle, { color: colors.textSecondary, marginTop: 20 }]}>LANGUE</Text>
            <View style={fl.tagsWrap}>
              {LANGUAGES.map(l => {
                const active = draftLanguage === l.code;
                return (
                  <TouchableOpacity key={l.code} onPress={() => setDraftLanguage(active ? '' : l.code)} activeOpacity={0.75}
                    style={[fl.tag, { backgroundColor: active ? PURPLE : colors.backgroundSecondary, borderColor: active ? PURPLE : colors.border }]}>
                    <Text style={[fl.tagTxt, { color: active ? '#fff' : colors.textSecondary }]}>{l.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Note minimale */}
            <Text style={[fl.sectionTitle, { color: colors.textSecondary, marginTop: 20 }]}>NOTE MINIMALE</Text>
            <View style={fl.tagsWrap}>
              {RATING_OPTIONS.map(r => {
                const active = draftMinRating === r.value;
                return (
                  <TouchableOpacity key={String(r.value)} onPress={() => setDraftMinRating(r.value)} activeOpacity={0.75}
                    style={[fl.tag, { backgroundColor: active ? '#FFB800' : colors.backgroundSecondary, borderColor: active ? '#FFB800' : colors.border }]}>
                    {r.value > 0 ? <Icon name="star" size={11} color={active ? '#fff' : colors.textSecondary} /> : null}
                    <Text style={[fl.tagTxt, { color: active ? '#fff' : colors.textSecondary }]}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <TouchableOpacity onPress={applyFilter} activeOpacity={0.85} style={[fl.applyBtn, { backgroundColor: PURPLE }]}>
            <Text style={fl.applyTxt}>Appliquer</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Panneau historique / suggestions ── */}
      {searchFocused && (
        <>
          {/* Suggestions pendant la frappe */}
          {search.trim() && historySuggestions.length > 0 && (
            <View style={{ backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: H_PAD, paddingTop: 10, paddingBottom: 4 }}>Suggestions</Text>
              {historySuggestions.map((h, i) => (
                <TouchableOpacity
                  key={h.query}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: H_PAD, paddingVertical: 10, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.divider }}
                  activeOpacity={0.7}
                  onPress={() => { setSearch(h.query); searchHistoryService.add(h.query); setSearchHistory(searchHistoryService.getAll()); setSearchFocused(false); }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: PURPLE + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="clock" size={13} color={PURPLE} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, color: colors.textPrimary }} numberOfLines={1}>{h.query}</Text>
                  <Icon name="arrow-up-left" size={13} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Historique complet quand champ vide */}
          {!search.trim() && searchHistory.length > 0 && (
            <View style={{ backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: H_PAD, paddingTop: 12, paddingBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>Récents</Text>
                <TouchableOpacity onPress={() => { searchHistoryService.clear(); setSearchHistory([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: PURPLE }}>Effacer</Text>
                </TouchableOpacity>
              </View>
              {searchHistory.slice(0, 6).map((h, i) => (
                <TouchableOpacity
                  key={h.query}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: H_PAD, paddingVertical: 10, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.divider }}
                  activeOpacity={0.7}
                  onPress={() => { setSearch(h.query); searchHistoryService.add(h.query); setSearchHistory(searchHistoryService.getAll()); setSearchFocused(false); }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="clock" size={13} color={colors.textTertiary} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, color: colors.textPrimary }} numberOfLines={1}>{h.query}</Text>
                  <TouchableOpacity onPress={() => { searchHistoryService.remove(h.query); setSearchHistory(searchHistoryService.getAll()); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="x" size={13} color={colors.textTertiary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={PURPLE} />
        }
      >
        {/* HERO — séries premium uniquement */}
        {!search.trim() && (
          loading && items.length === 0
            ? <View style={{ height: HERO_H, backgroundColor: colors.backgroundSecondary }} />
            : premiumItems.length > 0
              ? <HeroBanner items={premiumItems} purchasedIds={purchasedIds} hasActiveSub={hasActiveSub} onPress={goDetail} />
              : null
        )}

        {loading && items.length === 0 ? (
          <SkeletonSection colors={colors} />
        ) : displayed.length === 0 ? (
          <Animated.View entering={FadeIn} style={ms.empty}>
            <Icon name="tv" size={52} color={colors.textTertiary} />
            <Text style={[ms.emptyTitle, { color: colors.textPrimary }]}>Aucune série trouvée</Text>
            <Text style={[ms.emptySub, { color: colors.textTertiary }]}>Essaie d'autres filtres</Text>
          </Animated.View>
        ) : (
          <>
            {!search && topRated.length > 2 && (
              <HorizontalRow
                title="Mieux notées"
                items={topRated}
                purchasedIds={purchasedIds}
                hasActiveSub={hasActiveSub}
                colors={colors}
                onPress={goDetail}
                accent="#FFB800"
              />
            )}

            {!search && mostSeasons.length > 1 && (
              <HorizontalRow
                title="Plus de saisons"
                items={mostSeasons}
                purchasedIds={purchasedIds}
                hasActiveSub={hasActiveSub}
                colors={colors}
                onPress={goDetail}
                accent={PURPLE}
              />
            )}

            {!search && premiumItems.length > 1 && (
              <HorizontalRow
                title="Premium"
                items={premiumItems}
                purchasedIds={purchasedIds}
                hasActiveSub={hasActiveSub}
                colors={colors}
                onPress={goDetail}
                accent="#E8501A"
              />
            )}

            {/* Label grille */}
            <View style={{ paddingHorizontal: H_PAD, paddingTop: search ? 8 : 24, paddingBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: PURPLE }} />
                <Text style={[ms.gridTitle, { color: colors.textPrimary }]}>
                  {search ? `Résultats · ${displayed.length}` : 'Toutes les séries'}
                </Text>
              </View>
            </View>

            {/* GRILLE */}
            <View style={{ paddingHorizontal: H_PAD, gap: GUTTER }}>
              {rows.map(([a, b], ri) => (
                <View key={ri} style={{ flexDirection: 'row', gap: GUTTER }}>
                  <GridCard item={a} colors={colors} purchased={purchasedIds.has(a.id) || (hasActiveSub && !!a.is_premium)} onPress={() => goDetail(a)} index={ri * 2} />
                  {b
                    ? <GridCard item={b} colors={colors} purchased={purchasedIds.has(b.id) || (hasActiveSub && !!b.is_premium)} onPress={() => goDetail(b)} index={ri * 2 + 1} />
                    : <View style={{ width: CARD_W }} />
                  }
                </View>
              ))}
            </View>
          </>
        )}

        {/* Footer infinite scroll */}
        {loadingMore && (
          <View style={ms.loadMoreRow}>
            <View style={[ms.loadMoreDot, { backgroundColor: PURPLE }]} />
            <View style={[ms.loadMoreDot, { backgroundColor: PURPLE, opacity: 0.6 }]} />
            <View style={[ms.loadMoreDot, { backgroundColor: PURPLE, opacity: 0.3 }]} />
          </View>
        )}
        {!loadingMore && !hasMore && items.length > 0 && !search.trim() && (
          <View style={ms.endRow}>
            <View style={[ms.endLine, { backgroundColor: colors.border }]} />
            <Text style={[ms.endTxt, { color: colors.textTertiary }]}>{total} série{total > 1 ? 's' : ''} au total</Text>
            <View style={[ms.endLine, { backgroundColor: colors.border }]} />
          </View>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </Animated.ScrollView>
    </View>
  );
};

const ms = StyleSheet.create({
  pageTitle:   { fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  purplePill:  { backgroundColor: `${PURPLE}25`, borderWidth: 1, borderColor: `${PURPLE}70`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  purplePillTxt: { color: PURPLE, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  pageSub:     { fontSize: 12, fontWeight: '500', marginTop: 3 },
  gridTitle:   { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  empty:       { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyTitle:  { fontSize: 17, fontWeight: '800' },
  emptySub:    { fontSize: 13, fontWeight: '500' },
  loadMoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 24 },
  loadMoreDot: { width: 7, height: 7, borderRadius: 4 },
  endRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: H_PAD, paddingVertical: 24 },
  endLine:     { flex: 1, height: StyleSheet.hairlineWidth },
  endTxt:      { fontSize: 11, fontWeight: '600' },
});

const hdr = StyleSheet.create({
  wrap:          { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 0 },
  row1:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: H_PAD, paddingBottom: 10 },
  title:         { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  tvPill:        { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  tvPillTxt:     { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sub:           { fontSize: 11, fontWeight: '500' },
  searchWrap:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: H_PAD, marginBottom: 10 },
  searchInput:   { flex: 1, fontSize: 14, padding: 0 },
  clearBtn:      { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(128,128,128,0.5)', alignItems: 'center', justifyContent: 'center' },
  chipActive:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 },
  chipActiveTxt:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  chipInactive:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  chipInactiveTxt: { fontSize: 12, fontWeight: '600' },
  filterBtn:     { width: 36, height: 36, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  filterDot:     { position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  activeChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  activeChipTxt: { fontSize: 12, fontWeight: '600' },
});

const fl = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: '80%' },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle:   { fontSize: 18, fontWeight: '800' },
  resetTxt:     { fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12, paddingHorizontal: 2 },
  tagsWrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  tagTxt:       { fontSize: 13, fontWeight: '600' },
  applyBtn:     { marginTop: 20, marginBottom: 8, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  applyTxt:     { color: '#fff', fontSize: 15, fontWeight: '800' },
});
