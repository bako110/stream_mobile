import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Dimensions, StatusBar, ActivityIndicator, InteractionManager,
  Modal,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton, ShareBottomSheet, PriceWithLocal } from '../../components/common';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { contentService, toastService, showConfirm } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import type { VideoMeta } from '../../types';
import type { FilmItem } from '../Main/FilmsScreen';

const { height: SH } = Dimensions.get('window');
const BANNER_H = Math.round(SH * 0.5);
const POSTER_W = 100;
const POSTER_H = 150;

const LANG: Record<string, string> = {
  fr: 'Français', en: 'Anglais', es: 'Espagnol',
  ar: 'Arabe', wo: 'Wolof', bm: 'Bambara', ha: 'Haoussa', sw: 'Swahili',
};

interface Props {
  route: { params: { item: FilmItem } };
  navigation: { goBack: () => void; navigate: (screen: string, params: any) => void };
}


// ─────────────────────────────────────────────────────────────────────────────
// Chip
// ─────────────────────────────────────────────────────────────────────────────

const Chip: React.FC<{ icon: string; label: string; colors: any }> = ({ icon, label, colors }) => (
  <View style={[chip.wrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
    <Icon name={icon} size={11} color={colors.primary} />
    <Text style={[chip.txt, { color: colors.textSecondary }]}>{label}</Text>
  </View>
);
const chip = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  txt:  { fontSize: 12, fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────────────────────
// InfoLine
// ─────────────────────────────────────────────────────────────────────────────

const InfoLine: React.FC<{ icon: string; label: string; value: string; colors: any; last?: boolean }> = ({ icon, label, value, colors, last }) => (
  <View style={[il.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
    <View style={[il.iconBox, { backgroundColor: colors.backgroundSecondary }]}>
      <Icon name={icon} size={13} color={colors.primary} />
    </View>
    <Text style={[il.label, { color: colors.textTertiary }]}>{label}</Text>
    <Text style={[il.value, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
  </View>
);
const il = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label:   { flex: 1, fontSize: 13, fontWeight: '500' },
  value:   { fontSize: 13, fontWeight: '700', maxWidth: '50%', textAlign: 'right' },
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export const FilmDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { item }   = route.params;
  const { theme }  = useTheme();
  const { colors } = theme;
  const insets     = useSafeAreaInsets();

  const [videos, setVideos]               = useState<VideoMeta[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [synExpand, setSynExpand]         = useState(false);

  // Accès premium
  const [hasAccess, setHasAccess]         = useState(!item.is_premium);
  const [accessLoading, setAccessLoading] = useState(item.is_premium);
  const [showPaywall, setShowPaywall]     = useState(false);
  const [walletGoGold, setWalletGoGold]     = useState<number | null>(null);
  const [purchasing, setPurchasing]       = useState(false);
  const [launching, setLaunching]         = useState(false);
  const [isSaved, setIsSaved]             = useState(false);
  const [savingFav, setSavingFav]         = useState(false);
  const [stats, setStats]                 = useState<{ view_count: number; purchase_count: number; save_count: number } | null>(null);
  const [watchProgressSec, setWatchProgressSec] = useState(0);

  const isSerie  = item.type === 'serie';
  const banner   = item.banner_url || item.thumbnail_url;
  const synopsis = item.synopsis || item.short_synopsis;
  const goGoldRequired = item.is_premium && item.price ? Math.round(item.price * 100) : 0; // 1 € = 100 GoGold

  // Vérifier l'accès + solde wallet si contenu premium
  useEffect(() => {
    if (!item.is_premium) return;
    const task = InteractionManager.runAfterInteractions(async () => {
      try {
        const endpoint = isSerie
          ? Endpoints.content.serieAccess(item.id)
          : Endpoints.content.filmAccess(item.id);
        const [accessRes, walletRes] = await Promise.all([
          apiClient.get<{ has_access: boolean }>(endpoint),
          apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance),
        ]);
        setHasAccess(accessRes.data.has_access);
        setWalletGoGold(walletRes.data.gogold_balance);
      } catch {
        setHasAccess(false);
      } finally {
        setAccessLoading(false);
      }
    });
    return () => task.cancel();
  }, [item.id, item.is_premium, isSerie]);

  const handlePurchase = useCallback(async () => {
    setPurchasing(true);
    try {
      const endpoint = isSerie
        ? Endpoints.content.seriePurchase(item.id)
        : Endpoints.content.filmPurchase(item.id);
      const res = await apiClient.post<{ gogold_paid: number; new_balance: number }>(endpoint);
      setHasAccess(true);
      setWalletGoGold(res.data.new_balance);
      setShowPaywall(false);
      toastService.success('Acces accordé', `Vous pouvez maintenant regarder "${item.title}".`);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? e?.message ?? 'Erreur inconnue';
      if (detail.includes('insuffisant')) {
        showConfirm(
          'Solde insuffisant',
          `Il vous manque des GoGold. Rechargez votre wallet pour continuer.`,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Recharger', onPress: () => { setShowPaywall(false); navigation.navigate('BuyGoGold' as any, {}); } },
          ],
        );
      } else {
        toastService.error('Erreur', detail);
      }
    } finally {
      setPurchasing(false);
    }
  }, [item.id, item.title, isSerie, navigation]);

  // Charger les vidéos du film après la transition
  useEffect(() => {
    if (isSerie) { setVideosLoading(false); return; }
    const task = InteractionManager.runAfterInteractions(() => {
      contentService.getFilmVideos(item.id)
        .then(v => setVideos(v))
        .catch(() => setVideos([]))
        .finally(() => setVideosLoading(false));
    });
    return () => task.cancel();
  }, [item.id, isSerie]);

  const defaultVideo = videos.find(v => v.is_default) ?? videos[0] ?? null;
  const hasVideo     = !!defaultVideo?.hls_url;

  // Reprise de lecture : progression sauvegardée par VideoPlayerScreen toutes
  // les 15s pendant le visionnage (POST /stream/{video_id}/progress).
  useEffect(() => {
    if (!defaultVideo?.id) return;
    apiClient.get<{ progress_sec: number }>(Endpoints.streaming.progress(defaultVideo.id))
      .then(r => setWatchProgressSec(r.data.progress_sec))
      .catch(() => {});
  }, [defaultVideo?.id]);

  const targetType = isSerie ? 'serie' : 'film';

  useEffect(() => {
    apiClient.get<{ saved: boolean }>(Endpoints.favorites.check(targetType, item.id))
      .then(r => setIsSaved(r.data.saved))
      .catch(() => {});
  }, [item.id, targetType]);

  const handleToggleFav = useCallback(async () => {
    setSavingFav(true);
    try {
      if (isSaved) {
        await apiClient.delete(Endpoints.favorites.unsave(targetType, item.id));
        setIsSaved(false);
      } else {
        await apiClient.post(Endpoints.favorites.save, {
          target_type:      targetType,
          target_id:        item.id,
          target_title:     item.title,
          target_subtitle:  item.year ? String(item.year) : undefined,
          target_thumbnail: item.thumbnail_url ?? undefined,
        });
        setIsSaved(true);
      }
    } catch {
      toastService.error('Erreur', 'Impossible de modifier les favoris.');
    } finally {
      setSavingFav(false);
    }
  }, [isSaved, item.id, item.title, item.year, item.thumbnail_url, targetType]);

  useEffect(() => {
    apiClient.get<{ view_count: number; purchase_count: number; save_count: number }>(
      Endpoints.content.stats(item.id)
    ).then(r => setStats(r.data)).catch(() => {});
  }, [item.id]);

  const [shareOpen, setShareOpen] = useState(false);

  const watchProgressPct = defaultVideo?.duration_sec
    ? Math.min(watchProgressSec / defaultVideo.duration_sec, 1)
    : 0;
  const isResumable = !isSerie && hasVideo && watchProgressSec > 0 && watchProgressPct < 0.9;

  const handleWatch = async () => {
    if (item.is_premium && !hasAccess) {
      setShowPaywall(true);
      return;
    }
    if (isSerie) {
      setLaunching(true);
      navigation.navigate('SerieEpisodes', { item });
      setTimeout(() => setLaunching(false), 800);
    } else if (hasVideo) {
      setLaunching(true);
      const totalSeconds = defaultVideo!.duration_sec ?? undefined;
      const isNearEnd = !!totalSeconds && watchProgressSec >= totalSeconds * 0.9;
      navigation.navigate('VideoPlayer', {
        url:         defaultVideo!.hls_url!,
        title:       item.title,
        videoId:     defaultVideo!.id,
        contentId:   item.id,
        contentType: 'film' as const,
        thumbnailUrl: item.thumbnail_url ?? undefined,
        totalSeconds,
        startAtSec:  watchProgressSec > 0 && !isNearEnd ? watchProgressSec : undefined,
      });
      setTimeout(() => setLaunching(false), 800);
    }
  };

  const formatDuration = (sec: number | null) => {
    if (!sec) return null;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" translucent={false} backgroundColor={colors.background} />

      <ScrollView showsVerticalScrollIndicator={false} bounces>

        {/* ── BANNER ── */}
        <View style={{ height: BANNER_H }}>
          {banner ? (
            <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name={isSerie ? 'tv' : 'film'} size={72} color={colors.textTertiary} />
            </View>
          )}

          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'transparent', 'transparent', colors.background]}
            locations={[0, 0.2, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Retour */}
          <View style={[s.backBtn, { top: insets.top + 8 }]}>
            <BackButton onPress={() => navigation.goBack()} transparent color="#fff" />
          </View>

          {/* Premium / Accès */}
          {item.is_premium && (
            <Animated.View entering={FadeIn.delay(200)} style={[
              s.premBadge,
              { top: insets.top + 8 },
              hasAccess && { backgroundColor: '#10b98133', borderColor: '#10b981', borderWidth: 1 },
            ]}>
              <Icon name={hasAccess ? 'check-circle' : 'star'} size={10} color={hasAccess ? '#10b981' : '#fff'} />
              <Text style={[s.premText, hasAccess && { color: '#10b981' }]}>
                {hasAccess ? 'ACCÈS DÉBLOQUÉ' : 'PREMIUM'}
              </Text>
              {!hasAccess && item.price != null && <PriceWithLocal amountEur={item.price} style={s.premPrice} localStyle={{ color: 'rgba(255,255,255,0.7)' }} />}
            </Animated.View>
          )}
        </View>

        {/* ── BODY ── */}
        <View style={s.body}>

          {/* Poster flottant + titre */}
          <View style={s.headerRow}>
            {item.thumbnail_url && (
              <Animated.View entering={FadeIn.delay(100)}>
                <Image
                  source={{ uri: item.thumbnail_url }}
                  style={[s.poster, { backgroundColor: colors.backgroundSecondary }]}
                  resizeMode="cover"
                />
              </Animated.View>
            )}

            <View style={{ flex: 1, gap: 8 }}>
              <Animated.Text
                entering={FadeInDown.delay(80).duration(350)}
                style={[s.title, { color: colors.textPrimary }]}
                numberOfLines={4}
              >
                {item.title}
              </Animated.Text>

              {item.original_title && item.original_title !== item.title && (
                <Text style={[s.originalTitle, { color: colors.textTertiary }]}>
                  {item.original_title}
                </Text>
              )}

              {item.average_rating ? (
                <Animated.View entering={FadeInDown.delay(120)} style={s.ratingRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Icon
                      key={star}
                      name="star"
                      size={13}
                      color={star <= Math.round(item.average_rating! / 2) ? '#FFB800' : colors.border}
                    />
                  ))}
                  <Text style={[s.ratingVal, { color: colors.textSecondary }]}>
                    {item.average_rating.toFixed(1)} / 10
                  </Text>
                </Animated.View>
              ) : null}

              {/* Durée vidéo si disponible */}
              {!videosLoading && defaultVideo?.duration_sec ? (
                <Text style={[s.duration, { color: colors.textTertiary }]}>
                  <Icon name="clock" size={11} color={colors.textTertiary} />
                  {' '}{formatDuration(defaultVideo.duration_sec)}
                </Text>
              ) : null}
            </View>
          </View>

          {/* ── CHIPS ── */}
          <Animated.View entering={FadeInDown.delay(140).duration(350)} style={s.chips}>
            {item.year     && <Chip icon="calendar" label={String(item.year)} colors={colors} />}
            {item.language && <Chip icon="globe"    label={LANG[item.language] ?? item.language.toUpperCase()} colors={colors} />}
            {isSerie && item.total_seasons ? <Chip icon="layers" label={`${item.total_seasons} saison${item.total_seasons > 1 ? 's' : ''}`} colors={colors} /> : null}
            {item.rating   && <Chip icon="shield"   label={item.rating} colors={colors} />}
          </Animated.View>

          {/* ── CTA ── */}
          <Animated.View entering={FadeInDown.delay(180).duration(350)} style={s.cta}>

            {/* Bouton principal Regarder */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleWatch}
              disabled={(!isSerie && !hasVideo && !videosLoading) || accessLoading || launching}
              style={s.ctaPrimaryOuter}
            >
              <LinearGradient
                colors={
                  item.is_premium && !hasAccess
                    ? ['#E8501A', '#C93D10']
                    : hasVideo || isSerie
                    ? [colors.gradientStart ?? '#7B3FF2', colors.gradientEnd ?? '#5B8DEF']
                    : ['#555', '#444']
                }
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.ctaPrimary}
              >
                {accessLoading || (videosLoading && !isSerie) || launching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon
                    name={item.is_premium && !hasAccess ? 'lock' : hasVideo || isSerie ? 'play' : 'lock'}
                    size={17} color="#fff"
                  />
                )}
                {!(accessLoading || launching) && item.is_premium && !hasAccess ? (
                  <Text style={s.ctaPrimaryText}>
                    Acheter — {goGoldRequired} GoGold (
                    <PriceWithLocal amountEur={item.price!} style={s.ctaPrimaryText} localStyle={{ color: 'rgba(255,255,255,0.7)' }} />
                    )
                  </Text>
                ) : (
                  <Text style={s.ctaPrimaryText}>
                    {accessLoading || launching
                      ? 'Chargement…'
                      : isSerie
                      ? 'Voir les épisodes'
                      : videosLoading
                      ? 'Chargement…'
                      : hasVideo
                      ? (isResumable ? 'Reprendre la lecture' : 'Regarder maintenant')
                      : 'Vidéo non disponible'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {isResumable && (
              <View style={s.resumeBarBg}>
                <View style={[s.resumeBarFill, { width: `${Math.round(watchProgressPct * 100)}%` }]} />
              </View>
            )}

            {/* Secondaires */}
            <View style={s.ctaRow}>
              {item.trailer_url ? (
                <TouchableOpacity
                  style={[s.ctaSecBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                  activeOpacity={0.8}
                >
                  <Icon name="youtube" size={15} color={colors.textSecondary} />
                  <Text style={[s.ctaSecText, { color: colors.textSecondary }]}>Bande-annonce</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[s.ctaIconBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={handleToggleFav}
                disabled={savingFav}
              >
                {savingFav
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Icon name="bookmark" size={16} color={isSaved ? colors.primary : colors.textSecondary} />
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.ctaIconBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => setShareOpen(true)}
              >
                <Icon name="share-2" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── STATS ── */}
          {stats && (
            <Animated.View entering={FadeInDown.delay(200).duration(350)} style={[s.statsRow]}>
              <View style={s.statItem}>
                <Icon name="eye" size={16} color={colors.primary} />
                <Text style={[s.statVal, { color: colors.textPrimary }]}>
                  {stats.view_count >= 1000
                    ? `${(stats.view_count / 1000).toFixed(1)}k`
                    : stats.view_count.toLocaleString('fr-FR')}
                </Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>vues</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
              <View style={s.statItem}>
                <Icon name="shopping-bag" size={16} color={colors.primary} />
                <Text style={[s.statVal, { color: colors.textPrimary }]}>
                  {stats.purchase_count.toLocaleString('fr-FR')}
                </Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>achats</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
              <View style={s.statItem}>
                <Icon name="bookmark" size={16} color={isSaved ? colors.primary : colors.primary} />
                <Text style={[s.statVal, { color: colors.textPrimary }]}>
                  {stats.save_count.toLocaleString('fr-FR')}
                </Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>sauvegardes</Text>
              </View>
            </Animated.View>
          )}

          {/* ── SYNOPSIS ── */}
          {synopsis ? (
            <Animated.View entering={FadeInDown.delay(220).duration(350)} style={[s.section, { borderTopColor: colors.border }]}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Synopsis</Text>
              <Text
                style={[s.synopsisText, { color: colors.textSecondary }]}
                numberOfLines={synExpand ? undefined : 4}
              >
                {synopsis}
              </Text>
              {synopsis.length > 200 && (
                <TouchableOpacity onPress={() => setSynExpand(v => !v)} style={{ marginTop: 6 }}>
                  <Text style={[s.synExpand, { color: colors.primary }]}>
                    {synExpand ? 'Voir moins' : 'Lire la suite'}
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          ) : null}

          {/* ── INFOS ── */}
          <Animated.View entering={FadeInDown.delay(260).duration(350)} style={[s.section, { borderTopColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Informations</Text>
            <View style={[s.infoBlock, { borderColor: colors.border }]}>
              <InfoLine icon={isSerie ? 'tv' : 'film'} label="Type"  value={isSerie ? 'Série' : 'Film'} colors={colors} />
              {item.year     && <InfoLine icon="calendar" label="Année"         value={String(item.year)}                    colors={colors} />}
              {item.language && <InfoLine icon="globe"    label="Langue"        value={LANG[item.language] ?? item.language} colors={colors} />}
              {item.country  && <InfoLine icon="map-pin"  label="Pays"          value={item.country}                         colors={colors} />}
              {item.director && <InfoLine icon="user"     label="Réalisateur"   value={item.director}                        colors={colors} />}
              {item.rating   && <InfoLine icon="shield"   label="Classification" value={item.rating}                         colors={colors} />}
              {!isSerie && hasVideo && defaultVideo?.duration_sec && (
                <InfoLine icon="clock" label="Durée" value={formatDuration(defaultVideo.duration_sec)!} colors={colors} />
              )}
              {stats && (
                <InfoLine icon="eye" label="Vues" value={
                  stats.view_count >= 1000
                    ? `${(stats.view_count / 1000).toFixed(1)}k`
                    : stats.view_count.toLocaleString('fr-FR')
                } colors={colors} last />
              )}
            </View>
          </Animated.View>

        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* ── Modal Paywall ── */}
      <Modal visible={showPaywall} transparent animationType="slide" onRequestClose={() => setShowPaywall(false)}>
        <View style={pw.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowPaywall(false)} />
          <View style={[pw.sheet, { backgroundColor: colors.surface, paddingBottom: 36 + insets.bottom }]}>

            {/* En-tête */}
            <View style={pw.header}>
              <View style={pw.lockCircle}>
                <Icon name="lock" size={28} color="#fff" />
              </View>
              <Text style={[pw.title, { color: colors.textPrimary }]}>Contenu Premium</Text>
              <Text style={[pw.subtitle, { color: colors.textSecondary }]}>
                {item.title}
              </Text>
            </View>

            {/* Prix */}
            <View style={[pw.priceRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[pw.priceLabel, { color: colors.textTertiary }]}>Prix d'accès</Text>
                <Text style={[pw.priceValue, { color: colors.textPrimary }]}>
                  {goGoldRequired} GoGold
                  <Text style={[pw.priceEur, { color: colors.textSecondary }]}> (<PriceWithLocal amountEur={item.price!} style={[pw.priceEur, { color: colors.textSecondary }]} localStyle={{ color: colors.textTertiary }} />)</Text>
                </Text>
              </View>
              <Icon name="zap" size={22} color="#F59E0B" />
            </View>

            {/* Solde wallet */}
            <View style={[pw.balanceRow, { borderColor: colors.border }]}>
              <Icon name="credit-card" size={15} color={colors.textTertiary} />
              <Text style={[pw.balanceTxt, { color: colors.textSecondary }]}>
                Votre solde : <Text style={{ color: walletGoGold !== null && walletGoGold >= goGoldRequired ? '#10B981' : '#EF4444', fontWeight: '700' }}>
                  {walletGoGold ?? '…'} GoGold
                </Text>
              </Text>
              {walletGoGold !== null && walletGoGold < goGoldRequired && (
                <Text style={pw.balanceShort}> — insuffisant</Text>
              )}
            </View>

            {/* Accès à vie */}
            <View style={pw.infoRow}>
              <Icon name="check-circle" size={14} color="#10B981" />
              <Text style={[pw.infoTxt, { color: colors.textSecondary }]}>Accès permanent, regardez quand vous voulez</Text>
            </View>
            <View style={pw.infoRow}>
              <Icon name="check-circle" size={14} color="#10B981" />
              <Text style={[pw.infoTxt, { color: colors.textSecondary }]}>Lié à votre compte GoFolyX</Text>
            </View>

            {/* Boutons */}
            {walletGoGold !== null && walletGoGold < goGoldRequired ? (
              <TouchableOpacity
                style={pw.btnRecharge}
                onPress={() => { setShowPaywall(false); navigation.navigate('BuyGoGold' as any, {}); }}
              >
                <Icon name="plus-circle" size={18} color="#fff" />
                <Text style={pw.btnTxt}>Recharger mon wallet</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={pw.btnBuy}
                onPress={handlePurchase}
                disabled={purchasing}
              >
                {purchasing
                  ? <ActivityIndicator color="#fff" />
                  : <><Icon name="zap" size={18} color="#fff" /><Text style={pw.btnTxt}>Confirmer l'achat — {goGoldRequired} GoGold</Text></>
                }
              </TouchableOpacity>
            )}

            <TouchableOpacity style={pw.btnCancel} onPress={() => setShowPaywall(false)}>
              <Text style={[pw.cancelTxt, { color: colors.textTertiary }]}>Annuler</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      <ShareBottomSheet
        type={isSerie ? 'serie' : 'film'}
        film={item}
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onShareCountChange={() => setStats(s => s ? { ...s, save_count: s.save_count } : s)}
      />

    </View>
  );
};

const s = StyleSheet.create({
  backBtn:      { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  premBadge:    { position: 'absolute', right: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8501A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  premText:     { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  premPrice:    { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginLeft: 2 },

  body:         { paddingHorizontal: 16 },
  headerRow:    { flexDirection: 'row', gap: 14, marginTop: 16, marginBottom: 16, alignItems: 'flex-start' },
  poster:       { width: POSTER_W, height: POSTER_H, borderRadius: 12, marginTop: -(POSTER_H * 0.45) },
  title:        { fontSize: 22, fontWeight: '900', lineHeight: 28, letterSpacing: -0.4 },
  originalTitle:{ fontSize: 13, fontWeight: '500', fontStyle: 'italic' },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingVal:    { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  duration:     { fontSize: 12, fontWeight: '500' },

  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },

  cta:          { gap: 10, marginBottom: 8 },
  ctaPrimaryOuter: { borderRadius: 13, overflow: 'hidden' },
  ctaPrimary:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 },
  ctaPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  resumeBarBg:  { height: 3, borderRadius: 2, backgroundColor: 'rgba(123,63,242,0.15)', overflow: 'hidden', marginTop: -2 },
  resumeBarFill:{ height: 3, borderRadius: 2, backgroundColor: '#7B3FF2' },
  ctaRow:       { flexDirection: 'row', gap: 10 },
  ctaSecBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  ctaSecText:   { fontSize: 13, fontWeight: '700' },
  ctaIconBtn:   { width: 46, height: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },

  section:      { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 20, marginTop: 10, marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  synopsisText: { fontSize: 14, lineHeight: 23, fontWeight: '400' },
  synExpand:    { fontSize: 13, fontWeight: '700' },

  infoBlock:    { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, overflow: 'hidden' },

  statsRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 16, marginBottom: 4 },
  statItem:     { flex: 1, alignItems: 'center', gap: 4 },
  statVal:      { fontSize: 18, fontWeight: '800' },
  statLabel:    { fontSize: 11, fontWeight: '500' },
  statDivider:  { width: StyleSheet.hairlineWidth, height: 36 },
});

const pw = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },

  header:       { alignItems: 'center', gap: 10, marginBottom: 4 },
  lockCircle:   { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E8501A', alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: 20, fontWeight: '900' },
  subtitle:     { fontSize: 13, textAlign: 'center' },

  priceRow:     { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  priceLabel:   { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  priceValue:   { fontSize: 18, fontWeight: '900' },
  priceEur:     { fontSize: 14, fontWeight: '500' },

  balanceRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  balanceTxt:   { fontSize: 13, fontWeight: '500', flex: 1 },
  balanceShort: { fontSize: 12, color: '#EF4444', fontWeight: '700' },

  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoTxt:      { fontSize: 13 },

  btnBuy:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#E8501A', borderRadius: 14, padding: 16 },
  btnRecharge:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#7B3FF2', borderRadius: 14, padding: 16 },
  btnTxt:       { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnCancel:    { alignItems: 'center', paddingVertical: 10 },
  cancelTxt:    { fontSize: 14, fontWeight: '600' },
});
