import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, StatusBar, ActivityIndicator, Modal, Alert,
  Dimensions, FlatList,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  interpolate, Extrapolation, useAnimatedScrollHandler, withTiming,
  withRepeat, withSequence,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { contentService } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import type { Season, Episode } from '../../types';
import type { FilmItem } from '../Main/FilmsScreen';

const { width: SW, height: SH } = Dimensions.get('window');
const HERO_H  = Math.round(SH * 0.42);
const PURPLE  = '#7B3FF2';
const ORANGE  = '#FF8C00';

interface Props {
  route: { params: { item: FilmItem } };
  navigation: { goBack: () => void; navigate: (screen: string, params: any) => void };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEASON TAB
// ─────────────────────────────────────────────────────────────────────────────

const SeasonTab: React.FC<{
  season: Season;
  active: boolean;
  onPress: () => void;
  colors: any;
}> = ({ season, active, onPress, colors }) => {
  const anim = useSharedValue(active ? 1 : 0);
  useEffect(() => { anim.value = withTiming(active ? 1 : 0, { duration: 200 }); }, [active]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(anim.value, [0, 1], [0.55, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(anim.value, [0, 1], [0.95, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Animated.View style={[st.tab, style]}>
        {active && (
          <LinearGradient
            colors={[PURPLE, '#5B2DB0']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[st.tabInner, !active && { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[st.tabNum, { color: active ? '#fff' : colors.textTertiary }]}>S{season.number}</Text>
          {season.title ? <Text style={[st.tabTitle, { color: active ? 'rgba(255,255,255,0.8)' : colors.textTertiary }]} numberOfLines={1}>{season.title}</Text> : null}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const st = StyleSheet.create({
  tab:      { borderRadius: 10, overflow: 'hidden', marginRight: 8 },
  tabInner: { paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', minWidth: 52 },
  tabNum:   { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  tabTitle: { fontSize: 10, fontWeight: '600', marginTop: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// EPISODE CARD
// ─────────────────────────────────────────────────────────────────────────────

const EpisodeCard: React.FC<{
  ep: Episode;
  index: number;
  locked: boolean;
  isLaunching: boolean;
  colors: any;
  onPress: () => void;
}> = ({ ep, index, locked, isLaunching, colors, onPress }) => {
  const fmt = (sec: number | null) => {
    if (!sec) return null;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
  };

  const hasVideo = !!ep.hls_url || !!ep.video_url;
  const accessColor = locked ? ORANGE : ep.is_free ? '#10b981' : PURPLE;

  return (
    <Animated.View entering={FadeInDown.delay(index * 45).springify()}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[ec.card, { backgroundColor: colors.backgroundSecondary }]}
      >
        {/* Thumbnail */}
        <View style={ec.thumbWrap}>
          {ep.thumbnail_url ? (
            <Image source={{ uri: ep.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, ec.thumbPlaceholder]}>
              <Icon name="film" size={20} color={colors.textTertiary} />
            </View>
          )}
          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* Numéro épisode */}
          <View style={ec.epNumBadge}>
            <Text style={ec.epNumTxt}>{String(ep.number).padStart(2, '0')}</Text>
          </View>
          {/* Overlay action */}
          <View style={ec.overlay}>
            {isLaunching ? (
              <View style={ec.actionCircle}><ActivityIndicator size="small" color="#fff" /></View>
            ) : locked ? (
              <View style={[ec.actionCircle, { backgroundColor: 'rgba(255,140,0,0.85)' }]}>
                <Icon name="lock" size={13} color="#fff" />
              </View>
            ) : hasVideo ? (
              <View style={[ec.actionCircle, { backgroundColor: '#7B3FF2D9' }]}>
                <Icon name="play" size={13} color="#fff" />
              </View>
            ) : (
              <View style={[ec.actionCircle, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                <Icon name="clock" size={13} color="rgba(255,255,255,0.6)" />
              </View>
            )}
          </View>
          {/* Durée bottom-right */}
          {ep.duration_sec ? (
            <View style={ec.durBadge}>
              <Text style={ec.durTxt}>{fmt(ep.duration_sec)}</Text>
            </View>
          ) : null}
        </View>

        {/* Infos */}
        <View style={ec.info}>
          <View style={ec.infoTop}>
            <Text style={[ec.title, { color: colors.textPrimary }]} numberOfLines={2}>{ep.title}</Text>
            <View style={[ec.accessBadge, { backgroundColor: accessColor + '18', borderColor: accessColor + '50', borderWidth: StyleSheet.hairlineWidth }]}>
              <Icon name={locked ? 'lock' : ep.is_free ? 'unlock' : 'zap'} size={9} color={accessColor} />
              <Text style={[ec.accessTxt, { color: accessColor }]}>
                {locked ? 'Verrouillé' : ep.is_free ? 'Gratuit' : 'Premium'}
              </Text>
            </View>
          </View>
          {ep.synopsis ? (
            <Text style={[ec.synopsis, { color: colors.textTertiary }]} numberOfLines={2}>{ep.synopsis}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const ec = StyleSheet.create({
  card:         { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  thumbWrap:    { width: '100%', aspectRatio: 16 / 7, backgroundColor: '#111' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e' },
  overlay:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  actionCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  epNumBadge:   { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  epNumTxt:     { color: '#fff', fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  durBadge:     { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  durTxt:       { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '700' },
  info:         { padding: 12, gap: 6 },
  infoTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title:        { flex: 1, fontSize: 14, fontWeight: '800', lineHeight: 19 },
  accessBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, flexShrink: 0 },
  accessTxt:    { fontSize: 10, fontWeight: '800' },
  synopsis:     { fontSize: 12, lineHeight: 17, fontWeight: '400' },
});

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON ÉPISODES
// ─────────────────────────────────────────────────────────────────────────────

const EpisodeSkeleton: React.FC<{ colors: any }> = ({ colors }) => {
  const anim = useSharedValue(0.4);
  useEffect(() => {
    anim.value = withRepeat(withSequence(
      withTiming(0.8, { duration: 800 }),
      withTiming(0.4, { duration: 800 }),
    ), -1, false);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: anim.value }));
  const bg = colors.skeleton ?? colors.backgroundSecondary;

  return (
    <View style={{ gap: 12 }}>
      {[0, 1, 2].map(i => (
        <Animated.View key={i} style={[{ borderRadius: 14, overflow: 'hidden', backgroundColor: bg }, style]}>
          <View style={{ width: '100%', aspectRatio: 16 / 7, backgroundColor: bg }} />
          <View style={{ padding: 12, gap: 8 }}>
            <View style={{ height: 14, width: '65%', borderRadius: 7, backgroundColor: colors.border }} />
            <View style={{ height: 11, width: '85%', borderRadius: 6, backgroundColor: colors.border }} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export const SerieEpisodesScreen: React.FC<Props> = ({ route, navigation }) => {
  const { item } = route.params;
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [seasons, setSeasons]             = useState<Season[]>([]);
  const [activeSeason, setActiveSeason]   = useState<number>(1);
  const [episodes, setEpisodes]           = useState<Episode[]>([]);
  const [epLoading, setEpLoading]         = useState(false);
  const [synExpand, setSynExpand]         = useState(false);

  // Accès
  const [hasAccess, setHasAccess]         = useState(!item.is_premium);
  const [accessLoading, setAccessLoading] = useState(item.is_premium);
  const [showPaywall, setShowPaywall]     = useState(false);
  const [walletCoins, setWalletCoins]     = useState(0);
  const [purchasing, setPurchasing]       = useState(false);
  const [playingEpId, setPlayingEpId]     = useState<string | null>(null);

  const coinsRequired = Math.round((item.price ?? 0) * 100); // 1 € = 100 coins
  const canAfford     = walletCoins >= coinsRequired;
  const banner        = item.banner_url || item.thumbnail_url;
  const synopsis      = (item as any).synopsis || (item as any).short_synopsis;

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });

  // Header flottant opacité
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HERO_H - 120, HERO_H - 60], [0, 1], Extrapolation.CLAMP),
  }));

  useEffect(() => {
    if (!item.is_premium) return;
    Promise.all([
      apiClient.get<{ has_access: boolean }>(Endpoints.content.serieAccess(item.id)),
      apiClient.get<{ coins_balance: number }>(Endpoints.wallet.balance),
    ])
      .then(([accessRes, walletRes]) => {
        setHasAccess(accessRes.data?.has_access ?? false);
        setWalletCoins(walletRes.data?.coins_balance ?? 0);
      })
      .catch(() => {})
      .finally(() => setAccessLoading(false));
  }, [item.id, item.is_premium]);

  const handlePurchase = useCallback(async () => {
    setPurchasing(true);
    try {
      const res = await apiClient.post<{ new_balance: number }>(
        Endpoints.content.seriePurchase(item.id), {},
      );
      setHasAccess(true);
      setWalletCoins(res.data?.new_balance ?? 0);
      setShowPaywall(false);
      Alert.alert('Accès obtenu', `Vous pouvez maintenant regarder "${item.title}".`);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 402) {
        setShowPaywall(false);
        Alert.alert('Solde insuffisant', 'Rechargez votre wallet pour continuer.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Recharger', onPress: () => navigation.navigate('WalletScreen', {}) },
        ]);
      } else if (status === 409) {
        setHasAccess(true); setShowPaywall(false);
      } else {
        Alert.alert('Erreur', "Impossible de finaliser l'achat.");
      }
    } finally {
      setPurchasing(false);
    }
  }, [item.id, item.title, navigation]);

  useEffect(() => {
    contentService.getSeasons(item.id)
      .then(s => { setSeasons(s); if (s.length > 0) setActiveSeason(s[0].number); })
      .catch(() => setSeasons([]));
  }, [item.id]);

  useEffect(() => {
    if (!activeSeason) return;
    setEpLoading(true);
    contentService.getEpisodes(item.id, activeSeason)
      .then(setEpisodes)
      .catch(() => setEpisodes([]))
      .finally(() => setEpLoading(false));
  }, [item.id, activeSeason]);

  const handlePlay = async (ep: Episode) => {
    const locked = item.is_premium && !hasAccess && !ep.is_free;
    if (locked) { setShowPaywall(true); return; }
    if (!ep.hls_url && !ep.video_url) return;
    setPlayingEpId(ep.id);
    try {
      const video = await contentService.getEpisodeVideo(ep.id).catch(() => null);
      navigation.navigate('VideoPlayer', {
        url:          video?.hls_url ?? ep.hls_url ?? ep.video_url!,
        title:        `${item.title} · E${ep.number} — ${ep.title}`,
        videoId:      video?.id ?? undefined,
        contentId:    item.id,
        episodeId:    ep.id,
        contentType:  'serie_episode' as const,
        thumbnailUrl: ep.thumbnail_url ?? undefined,
        totalSeconds: ep.duration_sec ?? video?.duration_sec ?? undefined,
      });
    } finally {
      setPlayingEpId(null);
    }
  };

  const activeSeasonsObj = seasons.find(s => s.number === activeSeason);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Bouton retour fixe */}
      <View style={[fh.backBtn, { top: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} transparent color="#fff" />
      </View>

      {/* Header titre au scroll */}
      <Animated.View style={[fh.titleBar, { top: insets.top, backgroundColor: colors.background }, headerStyle]}>
        <Text style={[fh.titleTxt, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ── */}
        <View style={{ height: HERO_H }}>
          {banner
            ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#08050f', alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="tv" size={72} color="#1a1a2e" />
              </View>
          }
          {/* Gradients cinématiques */}
          <LinearGradient
            colors={[`${PURPLE}00`, `${PURPLE}15`, 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)', colors.background]}
            locations={[0, 0.2, 0.5, 0.8, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Badge premium / accès */}
          {item.is_premium && (
            <Animated.View
              entering={FadeIn.delay(200)}
              style={[
                fh.premBadge,
                { top: insets.top + 8 },
                hasAccess
                  ? { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: '#10b981', borderWidth: 1 }
                  : { backgroundColor: '#E8501A' },
              ]}
            >
              <Icon name={hasAccess ? 'check-circle' : 'zap'} size={10} color={hasAccess ? '#10b981' : '#fff'} />
              <Text style={[fh.premTxt, { color: hasAccess ? '#10b981' : '#fff' }]}>
                {hasAccess ? 'ACCÈS' : `PREMIUM${item.price ? ` · ${item.price}€` : ''}`}
              </Text>
            </Animated.View>
          )}

          {/* Info bas du hero */}
          <View style={fh.heroBottom}>
            {/* Badge SÉRIE */}
            <View style={fh.serieTag}>
              <Icon name="tv" size={9} color={PURPLE} />
              <Text style={fh.serieTagTxt}>SÉRIE</Text>
            </View>
            <Text style={fh.heroTitle} numberOfLines={2}>{item.title}</Text>
            <View style={fh.heroMeta}>
              {seasons.length > 0 && (
                <View style={fh.metaChip}>
                  <Icon name="layers" size={10} color={PURPLE} />
                  <Text style={fh.metaChipTxt}>{seasons.length} saison{seasons.length > 1 ? 's' : ''}</Text>
                </View>
              )}
              {item.year ? <Text style={fh.metaDot}>{item.year}</Text> : null}
              {item.average_rating ? (
                <View style={fh.metaChip}>
                  <Icon name="star" size={10} color="#FFB800" />
                  <Text style={[fh.metaChipTxt, { color: '#FFB800' }]}>{item.average_rating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── PAYWALL BANNER ── */}
        {item.is_premium && !accessLoading && !hasAccess && (
          <TouchableOpacity onPress={() => setShowPaywall(true)} activeOpacity={0.9} style={pw2.banner}>
            <LinearGradient colors={[ORANGE, '#FF5500']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={pw2.bannerGrad}>
              <View style={pw2.bannerIcon}><Icon name="lock" size={14} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={pw2.bannerTitle}>Déverrouiller toute la série</Text>
                <Text style={pw2.bannerSub}>{coinsRequired} coins · {item.price} €</Text>
              </View>
              <Icon name="chevron-right" size={18} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* ── SYNOPSIS ── */}
        {synopsis ? (
          <Animated.View entering={FadeInDown.delay(60).springify()} style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Text
              style={[sc.synopsis, { color: colors.textSecondary }]}
              numberOfLines={synExpand ? undefined : 3}
            >
              {synopsis}
            </Text>
            {synopsis.length > 140 && (
              <TouchableOpacity onPress={() => setSynExpand(v => !v)} style={{ marginTop: 4 }}>
                <Text style={[sc.synToggle, { color: PURPLE }]}>{synExpand ? 'Voir moins' : 'Lire la suite'}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        ) : null}

        {/* ── ONGLETS SAISONS ── */}
        {seasons.length > 0 && (
          <Animated.View entering={FadeInDown.delay(80).springify()} style={sc.seasonSection}>
            <Text style={[sc.sectionLabel, { color: colors.textTertiary }]}>SAISONS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: 8 }}
            >
              {seasons.map(season => (
                <SeasonTab
                  key={season.id}
                  season={season}
                  active={activeSeason === season.number}
                  onPress={() => setActiveSeason(season.number)}
                  colors={colors}
                />
              ))}
            </ScrollView>

            {/* Titre saison active */}
            {activeSeasonsObj?.title && (
              <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                <Text style={[sc.seasonTitle, { color: colors.textPrimary }]}>{activeSeasonsObj.title}</Text>
                {activeSeasonsObj.year ? (
                  <Text style={[sc.seasonYear, { color: colors.textTertiary }]}>{activeSeasonsObj.year}</Text>
                ) : null}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── LISTE ÉPISODES ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 32 }}>

          {/* Header liste */}
          <View style={sc.epHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: PURPLE }} />
              <Text style={[sc.epHeaderTitle, { color: colors.textPrimary }]}>
                Épisodes
              </Text>
            </View>
            {!epLoading && episodes.length > 0 && (
              <Text style={[sc.epCount, { color: colors.textTertiary }]}>
                {episodes.length} ép.
              </Text>
            )}
          </View>

          {epLoading ? (
            <EpisodeSkeleton colors={colors} />
          ) : episodes.length === 0 ? (
            <Animated.View entering={FadeIn} style={sc.empty}>
              <View style={[sc.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="film" size={28} color={colors.textTertiary} />
              </View>
              <Text style={[sc.emptyTitle, { color: colors.textPrimary }]}>Aucun épisode</Text>
              <Text style={[sc.emptySub, { color: colors.textTertiary }]}>Cette saison n'a pas encore d'épisodes</Text>
            </Animated.View>
          ) : (
            <View>
              {episodes.map((ep, index) => {
                const locked = !!(item.is_premium && !hasAccess && !ep.is_free);
                return (
                  <EpisodeCard
                    key={ep.id}
                    ep={ep}
                    index={index}
                    locked={locked}
                    isLaunching={playingEpId === ep.id}
                    colors={colors}
                    onPress={() => handlePlay(ep)}
                  />
                );
              })}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── MODAL PAYWALL ── */}
      <Modal visible={showPaywall} animationType="slide" transparent onRequestClose={() => setShowPaywall(false)}>
        <View style={pw.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowPaywall(false)} />
          <View style={[pw.sheet, { backgroundColor: colors.backgroundSecondary }]}>

            {/* Poignée */}
            <View style={pw.handle} />

            {/* Lock hero */}
            <View style={pw.lockHero}>
              <LinearGradient colors={[ORANGE, '#FF4500']} style={pw.lockCircle}>
                <Icon name="lock" size={26} color="#fff" />
              </LinearGradient>
              <TouchableOpacity onPress={() => setShowPaywall(false)} style={pw.closeBtn}>
                <Icon name="x" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[pw.title, { color: colors.textPrimary }]}>Série premium</Text>
            <Text style={[pw.subtitle, { color: colors.textSecondary }]}>
              Achat unique pour accéder à tous les épisodes de{'\n'}«{item.title}»
            </Text>

            {/* Rows prix + solde */}
            <View style={[pw.card, { backgroundColor: colors.background }]}>
              <View style={pw.cardRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[pw.iconBox, { backgroundColor: ORANGE + '20' }]}>
                    <Icon name="tag" size={14} color={ORANGE} />
                  </View>
                  <Text style={[pw.cardLabel, { color: colors.textSecondary }]}>Prix</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[pw.cardValue, { color: colors.textPrimary }]}>{coinsRequired} coins</Text>
                  <Text style={[pw.cardSub, { color: colors.textTertiary }]}>{item.price} €</Text>
                </View>
              </View>
              <View style={[pw.divider, { backgroundColor: colors.border }]} />
              <View style={pw.cardRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[pw.iconBox, { backgroundColor: (canAfford ? '#10b981' : '#ef4444') + '20' }]}>
                    <Icon name="credit-card" size={14} color={canAfford ? '#10b981' : '#ef4444'} />
                  </View>
                  <Text style={[pw.cardLabel, { color: colors.textSecondary }]}>Votre solde</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[pw.cardValue, { color: canAfford ? '#10b981' : '#ef4444', fontWeight: '800' }]}>
                    {walletCoins} coins
                  </Text>
                  {!canAfford && (
                    <Text style={[pw.cardSub, { color: '#ef4444' }]}>
                      manque {coinsRequired - walletCoins}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Avantages */}
            <View style={pw.benefits}>
              {[
                { icon: 'check-circle', txt: 'Accès permanent à toute la série' },
                { icon: 'check-circle', txt: 'Tous les épisodes, toutes les saisons' },
                { icon: 'check-circle', txt: 'Lié à votre compte GoFolyX' },
              ].map((b, i) => (
                <View key={i} style={pw.benefit}>
                  <Icon name={b.icon} size={14} color="#10b981" />
                  <Text style={[pw.benefitTxt, { color: colors.textSecondary }]}>{b.txt}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            {canAfford ? (
              <TouchableOpacity
                onPress={handlePurchase}
                disabled={purchasing}
                activeOpacity={0.88}
                style={pw.btnWrap}
              >
                <LinearGradient colors={[ORANGE, '#FF4500']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={pw.btn}>
                  {purchasing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Icon name="unlock" size={17} color="#fff" /><Text style={pw.btnTxt}>Acheter — {coinsRequired} coins</Text></>
                  }
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => { setShowPaywall(false); navigation.navigate('WalletScreen', {}); }}
                activeOpacity={0.88}
                style={pw.btnWrap}
              >
                <LinearGradient colors={[PURPLE, '#5B2DB0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={pw.btn}>
                  <Icon name="plus-circle" size={17} color="#fff" />
                  <Text style={pw.btnTxt}>Recharger — manque {coinsRequired - walletCoins} coins</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setShowPaywall(false)} style={pw.cancelBtn}>
              <Text style={[pw.cancelTxt, { color: colors.textTertiary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const fh = StyleSheet.create({
  backBtn:    { position: 'absolute', zIndex: 30, left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  titleBar:   { position: 'absolute', zIndex: 25, left: 0, right: 0, height: 56, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 60, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.15)' },
  titleTxt:   { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  premBadge:  { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  premTxt:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  heroBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 18, paddingBottom: 20 },
  serieTag:   { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: `${PURPLE}25`, borderWidth: 1, borderColor: `${PURPLE}70`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginBottom: 8 },
  serieTagTxt:{ color: PURPLE, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  heroTitle:  { color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 29, letterSpacing: -0.5, marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  heroMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  metaChipTxt:{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  metaDot:    { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600' },
});

const pw2 = StyleSheet.create({
  banner:     { marginHorizontal: 16, marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  bannerGrad: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  bannerIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  bannerTitle:{ flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  bannerSub:  { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', marginTop: 1 },
});

const sc = StyleSheet.create({
  synopsis:      { fontSize: 14, lineHeight: 22, fontWeight: '400' },
  synToggle:     { fontSize: 13, fontWeight: '700', marginTop: 2 },
  seasonSection: { paddingTop: 20 },
  sectionLabel:  { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, paddingHorizontal: 16, marginBottom: 8 },
  seasonTitle:   { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  seasonYear:    { fontSize: 12, fontWeight: '500', marginTop: 2 },
  epHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  epHeaderTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  epCount:       { fontSize: 12, fontWeight: '600' },
  empty:         { alignItems: 'center', paddingTop: 50, gap: 12 },
  emptyIcon:     { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:    { fontSize: 16, fontWeight: '800' },
  emptySub:      { fontSize: 13, fontWeight: '500', textAlign: 'center' },
});

const pw = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', alignSelf: 'center', marginBottom: 20 },
  lockHero:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16, position: 'relative' },
  lockCircle:  { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  closeBtn:    { position: 'absolute', right: 0, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  subtitle:    { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  card:        { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  cardRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  divider:     { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  iconBox:     { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardLabel:   { fontSize: 13, fontWeight: '600' },
  cardValue:   { fontSize: 15, fontWeight: '800' },
  cardSub:     { fontSize: 11, fontWeight: '500', marginTop: 1 },
  benefits:    { gap: 8, marginBottom: 18 },
  benefit:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitTxt:  { fontSize: 13, fontWeight: '500' },
  btnWrap:     { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  btn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 },
  btnTxt:      { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn:   { alignItems: 'center', paddingVertical: 10 },
  cancelTxt:   { fontSize: 14, fontWeight: '600' },
});
