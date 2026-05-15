import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, StatusBar, ActivityIndicator, Modal, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { ExpandableText } from '../../components/common';
import { contentService } from '../../services';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import type { Season, Episode } from '../../types';
import type { FilmItem } from '../Main/FilmsScreen';

interface Props {
  route: { params: { item: FilmItem } };
  navigation: { goBack: () => void; navigate: (screen: string, params: any) => void };
}

export const SerieEpisodesScreen: React.FC<Props> = ({ route, navigation }) => {
  const { item } = route.params;
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [seasons, setSeasons]           = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [episodes, setEpisodes]         = useState<Episode[]>([]);
  const [epLoading, setEpLoading]       = useState(false);

  // PPV
  const [hasAccess, setHasAccess]       = useState(!item.is_premium);
  const [accessLoading, setAccessLoading] = useState(item.is_premium);
  const [showPaywall, setShowPaywall]   = useState(false);
  const [walletCoins, setWalletCoins]   = useState(0);
  const [purchasing, setPurchasing]     = useState(false);

  const coinsRequired = Math.round((item.price ?? 0) * 200);

  // Vérifie l'accès et le solde au chargement
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
        Endpoints.content.seriePurchase(item.id),
        {},
      );
      setHasAccess(true);
      setWalletCoins(res.data?.new_balance ?? 0);
      setShowPaywall(false);
      Alert.alert('Acces obtenu', `Vous pouvez maintenant regarder "${item.title}".`);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 402) {
        const needed: number = err?.response?.data?.detail?.coins_needed ?? coinsRequired;
        setShowPaywall(false);
        Alert.alert(
          'Solde insuffisant',
          `Il vous faut ${needed} coins supplémentaires.\nVoulez-vous recharger votre wallet ?`,
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Recharger',
              onPress: () => navigation.navigate('WalletScreen', {}),
            },
          ],
        );
      } else if (status === 409) {
        setHasAccess(true);
        setShowPaywall(false);
      } else {
        Alert.alert('Erreur', "Impossible de finaliser l'achat. Réessayez.");
      }
    } finally {
      setPurchasing(false);
    }
  }, [item.id, item.title, coinsRequired, navigation]);

  useEffect(() => {
    contentService.getSeasons(item.id)
      .then(s => {
        setSeasons(s);
        if (s.length > 0) setActiveSeason(s[0].number);
      })
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

  const fmt = (sec: number | null) => {
    if (!sec) return null;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  };

  const handlePlay = async (ep: Episode) => {
    // video_url null = backend a masqué l'URL (série premium non achetée)
    const isPremiumLocked = (item.is_premium === true && !hasAccess && !ep.is_free) || (!ep.is_free && !ep.video_url);
    if (isPremiumLocked) {
      setShowPaywall(true);
      return;
    }
    if (!ep.video_url) return;
    const title = `${item.title} · E${ep.number} — ${ep.title}`;
    const video = await contentService.getEpisodeVideo(ep.id).catch(() => null);
    navigation.navigate('VideoPlayer', {
      url:          ep.video_url,
      title,
      videoId:      video?.id ?? undefined,
      contentId:    item.id,
      episodeId:    ep.id,
      contentType:  'serie_episode' as const,
      thumbnailUrl: ep.thumbnail_url ?? undefined,
      totalSeconds: ep.duration_sec  ?? video?.duration_sec ?? undefined,
    });
  };

  const canAfford = walletCoins >= coinsRequired;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[s.headerSub, { color: colors.textTertiary }]}>
            {seasons.length > 0 ? `${seasons.length} saison${seasons.length > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        {item.is_premium && !accessLoading && !hasAccess && (
          <View style={s.premiumBadge}>
            <Icon name="lock" size={11} color="#FF8C00" />
            <Text style={s.premiumBadgeTxt}>Premium</Text>
          </View>
        )}
      </View>

      {/* Bannière paywall si premium non acheté */}
      {item.is_premium && !accessLoading && !hasAccess && (
        <TouchableOpacity
          onPress={() => setShowPaywall(true)}
          activeOpacity={0.9}
          style={s.paywallBanner}
        >
          <LinearGradient
            colors={['#FF8C00', '#FF5500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.paywallBannerGrad}
          >
            <Icon name="lock" size={16} color="#fff" />
            <Text style={s.paywallBannerTxt}>
              Série premium · {coinsRequired} coins ({item.price} €)
            </Text>
            <Icon name="chevron-right" size={16} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Onglets saisons */}
      {seasons.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.seasonBar}
          style={[s.seasonBarWrap, { borderBottomColor: colors.border }]}
        >
          {seasons.map(season => {
            const active = activeSeason === season.number;
            return (
              <TouchableOpacity
                key={season.id}
                onPress={() => setActiveSeason(season.number)}
                style={[
                  s.seasonTab,
                  active
                    ? { borderBottomColor: colors.primary, borderBottomWidth: 2 }
                    : { borderBottomColor: 'transparent', borderBottomWidth: 2 },
                ]}
              >
                <Text style={[s.seasonTabTxt, { color: active ? colors.primary : colors.textSecondary }]}>
                  {season.title ? season.title : `Saison ${season.number}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Liste épisodes */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {epLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : episodes.length === 0 ? (
          <Text style={[s.empty, { color: colors.textTertiary }]}>Aucun épisode disponible</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {episodes.map(ep => {
              const locked = item.is_premium && !hasAccess && !ep.is_free;
              return (
                <TouchableOpacity
                  key={ep.id}
                  onPress={() => handlePlay(ep)}
                  activeOpacity={0.8}
                  style={[
                    s.card,
                    { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                    locked && { opacity: 0.75 },
                  ]}
                >
                  {/* Thumbnail */}
                  <View style={s.thumbWrap}>
                    {ep.thumbnail_url ? (
                      <Image source={{ uri: ep.thumbnail_url }} style={s.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[s.thumb, { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                        <Icon name="film" size={22} color={colors.textTertiary} />
                      </View>
                    )}
                    {locked ? (
                      <View style={[s.playOverlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                        <View style={s.lockCircle}>
                          <Icon name="lock" size={14} color="#FF8C00" />
                        </View>
                      </View>
                    ) : ep.video_url ? (
                      <View style={s.playOverlay}>
                        <View style={s.playCircle}>
                          <Icon name="play" size={14} color="#fff" />
                        </View>
                      </View>
                    ) : (
                      <View style={[s.playOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                        <Icon name="lock" size={16} color="rgba(255,255,255,0.6)" />
                      </View>
                    )}
                  </View>

                  {/* Infos */}
                  <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
                    <Text style={[s.epNum, { color: colors.textTertiary }]}>Épisode {ep.number}</Text>
                    <Text style={[s.epTitle, { color: colors.textPrimary }]} numberOfLines={2}>{ep.title}</Text>
                    {ep.synopsis ? (
                      <ExpandableText
                        text={ep.synopsis}
                        maxLines={2}
                        primaryColor={colors.primary}
                        textStyle={[s.epSynopsis, { color: colors.textSecondary }]}
                      />
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      {ep.duration_sec ? (
                        <Text style={[s.epDur, { color: colors.textTertiary }]}>
                          <Icon name="clock" size={10} color={colors.textTertiary} /> {fmt(ep.duration_sec)}
                        </Text>
                      ) : null}
                      {locked ? (
                        <View style={[s.badge, { backgroundColor: '#FF8C0018' }]}>
                          <Text style={[s.badgeTxt, { color: '#FF8C00' }]}>Verrouillé</Text>
                        </View>
                      ) : (
                        <View style={[s.badge, { backgroundColor: ep.is_free ? '#10b98118' : colors.primary + '18' }]}>
                          <Text style={[s.badgeTxt, { color: ep.is_free ? '#10b981' : colors.primary }]}>
                            {ep.is_free ? 'Gratuit' : 'Premium'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal paywall */}
      <Modal
        visible={showPaywall}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPaywall(false)}
      >
        <View style={pw.backdrop}>
          <View style={[pw.sheet, { backgroundColor: colors.backgroundSecondary }]}>
            {/* Header */}
            <View style={pw.headerRow}>
              <View style={pw.lockCircleOuter}>
                <LinearGradient colors={['#FF8C00', '#FF5500']} style={pw.lockCircleGrad}>
                  <Icon name="lock" size={24} color="#fff" />
                </LinearGradient>
              </View>
              <TouchableOpacity onPress={() => setShowPaywall(false)} style={pw.closeBtn}>
                <Icon name="x" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[pw.title, { color: colors.textPrimary }]}>Série premium</Text>
            <Text style={[pw.subtitle, { color: colors.textSecondary }]}>
              "{item.title}" nécessite un achat unique pour accéder à tous les épisodes.
            </Text>

            {/* Prix */}
            <View style={[pw.row, { backgroundColor: colors.background }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="tag" size={16} color="#FF8C00" />
                <Text style={[pw.rowLabel, { color: colors.textSecondary }]}>Prix</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[pw.rowValue, { color: colors.textPrimary }]}>{coinsRequired} coins</Text>
                <View style={pw.eurBadge}>
                  <Text style={pw.eurTxt}>{item.price} €</Text>
                </View>
              </View>
            </View>

            {/* Solde */}
            <View style={[pw.row, { backgroundColor: colors.background }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="credit-card" size={16} color={canAfford ? '#10b981' : '#ef4444'} />
                <Text style={[pw.rowLabel, { color: colors.textSecondary }]}>Votre solde</Text>
              </View>
              <Text style={[pw.rowValue, { color: canAfford ? '#10b981' : '#ef4444', fontWeight: '800' }]}>
                {walletCoins} coins
              </Text>
            </View>

            {/* Infos */}
            <View style={pw.infoBlock}>
              <View style={pw.infoRow}>
                <Icon name="check-circle" size={14} color="#10b981" />
                <Text style={[pw.infoTxt, { color: colors.textSecondary }]}>Accès permanent à toute la série</Text>
              </View>
              <View style={pw.infoRow}>
                <Icon name="check-circle" size={14} color="#10b981" />
                <Text style={[pw.infoTxt, { color: colors.textSecondary }]}>Lié à votre compte</Text>
              </View>
              <View style={pw.infoRow}>
                <Icon name="check-circle" size={14} color="#10b981" />
                <Text style={[pw.infoTxt, { color: colors.textSecondary }]}>Tous les épisodes disponibles</Text>
              </View>
            </View>

            {/* CTA */}
            {canAfford ? (
              <TouchableOpacity
                onPress={handlePurchase}
                disabled={purchasing}
                activeOpacity={0.85}
                style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}
              >
                <LinearGradient colors={['#FF8C00', '#FF5500']} style={pw.buyBtn}>
                  {purchasing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Icon name="unlock" size={18} color="#fff" />
                        <Text style={pw.buyBtnTxt}>Acheter — {coinsRequired} coins</Text>
                      </>
                  }
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setShowPaywall(false);
                  navigation.navigate('WalletScreen', {});
                }}
                activeOpacity={0.85}
                style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}
              >
                <LinearGradient colors={['#7C3AED', '#5B21B6']} style={pw.buyBtn}>
                  <Icon name="plus-circle" size={18} color="#fff" />
                  <Text style={pw.buyBtnTxt}>
                    Recharger — manque {coinsRequired - walletCoins} coins
                  </Text>
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

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:        { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 17, fontWeight: '800' },
  headerSub:      { fontSize: 12, fontWeight: '500', marginTop: 1 },

  premiumBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF8C0020', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  premiumBadgeTxt:{ fontSize: 12, fontWeight: '700', color: '#FF8C00' },

  paywallBanner:  { marginHorizontal: 16, marginTop: 10, borderRadius: 12, overflow: 'hidden' },
  paywallBannerGrad: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  paywallBannerTxt:  { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },

  seasonBarWrap:  { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  seasonBar:      { paddingHorizontal: 16, gap: 4 },
  seasonTab:      { paddingHorizontal: 16, paddingVertical: 12 },
  seasonTabTxt:   { fontSize: 14, fontWeight: '700' },

  empty:          { textAlign: 'center', marginTop: 60, fontSize: 14 },

  card:           { flexDirection: 'row', gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  thumbWrap:      { width: 120, height: 72, borderRadius: 8, overflow: 'hidden' },
  thumb:          { width: 120, height: 72 },
  playOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playCircle:     { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  lockCircle:     { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },

  epNum:          { fontSize: 11, fontWeight: '600' },
  epTitle:        { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  epSynopsis:     { fontSize: 12, lineHeight: 17 },
  epDur:          { fontSize: 11, fontWeight: '500' },
  badge:          { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeTxt:       { fontSize: 11, fontWeight: '700' },
});

const pw = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:          { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },

  headerRow:      { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  lockCircleOuter:{ width: 72, height: 72, borderRadius: 36, overflow: 'hidden' },
  lockCircleGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  closeBtn:       { position: 'absolute', right: 0, top: 0, padding: 4 },

  title:          { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  subtitle:       { fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 },

  row:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8 },
  rowLabel:       { fontSize: 13, fontWeight: '600' },
  rowValue:       { fontSize: 15, fontWeight: '700' },

  eurBadge:       { backgroundColor: '#FF8C0020', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  eurTxt:         { fontSize: 12, fontWeight: '700', color: '#FF8C00' },

  infoBlock:      { gap: 8, marginVertical: 16 },
  infoRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoTxt:        { fontSize: 13 },

  buyBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 24 },
  buyBtnTxt:      { color: '#fff', fontSize: 16, fontWeight: '800' },

  cancelBtn:      { alignItems: 'center', paddingVertical: 12 },
  cancelTxt:      { fontSize: 14, fontWeight: '600' },
});
