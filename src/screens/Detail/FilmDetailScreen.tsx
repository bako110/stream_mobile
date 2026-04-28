import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Dimensions, StatusBar, ActivityIndicator, Modal, Platform,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { useTheme } from '../../hooks/useTheme';
import { contentService } from '../../services';
import type { VideoMeta } from '../../types';
import type { FilmItem } from '../Main/FilmsScreen';

const { width: SW, height: SH } = Dimensions.get('window');
const BANNER_H = Math.round(SH * 0.5);
const POSTER_W = 100;
const POSTER_H = 150;

const LANG: Record<string, string> = {
  fr: 'Français', en: 'Anglais', es: 'Espagnol',
  ar: 'Arabe', wo: 'Wolof', bm: 'Bambara', ha: 'Haoussa', sw: 'Swahili',
};

interface Props {
  route: { params: { item: FilmItem } };
  navigation: { goBack: () => void };
}

// ─────────────────────────────────────────────────────────────────────────────
// Video Player Modal — plein écran (react-native-video v7)
// ─────────────────────────────────────────────────────────────────────────────

const VideoPlayer: React.FC<{
  url: string;
  title: string;
  onClose: () => void;
}> = ({ url, title, onClose }) => {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden />
      <View style={vp.container}>
        <Video
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          controls
          paused={false}
          muted={false}
          ignoreSilentSwitch="ignore"
          useTextureView={false}
        />
        {/* Bouton fermer par-dessus les contrôles natifs */}
        <TouchableOpacity
          onPress={onClose}
          style={[vp.closeBtn, { top: Platform.OS === 'ios' ? 52 : 36 }]}
        >
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>
        {/* Titre */}
        <View style={[vp.titleBar, { top: Platform.OS === 'ios' ? 52 : 36 }]}>
          <View style={{ width: 40 }} />
          <Text style={vp.titleText} numberOfLines={1}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>
    </Modal>
  );
};

const vp = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  closeBtn:  { position: 'absolute', left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  titleBar:  { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  titleText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});

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

  const [videos, setVideos]           = useState<VideoMeta[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [playingUrl, setPlayingUrl]   = useState<string | null>(null);
  const [synExpand, setSynExpand]     = useState(false);

  const isSerie  = item.type === 'serie';
  const banner   = item.banner_url || item.thumbnail_url;
  const synopsis = item.synopsis || item.short_synopsis;

  // Charger les vidéos du film
  useEffect(() => {
    if (isSerie) { setVideosLoading(false); return; }
    contentService.getFilmVideos(item.id)
      .then(v => setVideos(v))
      .catch(() => setVideos([]))
      .finally(() => setVideosLoading(false));
  }, [item.id, isSerie]);

  const defaultVideo = videos.find(v => v.is_default) ?? videos[0] ?? null;
  const hasVideo     = !!defaultVideo?.hls_url;

  const handleWatch = () => {
    if (hasVideo) {
      setPlayingUrl(defaultVideo!.hls_url!);
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
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Player modal */}
      {playingUrl && (
        <VideoPlayer
          url={playingUrl}
          title={item.title}
          onClose={() => setPlayingUrl(null)}
        />
      )}

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
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[s.backBtn, { top: insets.top + 8 }]}
          >
            <Icon name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Premium */}
          {item.is_premium && (
            <Animated.View entering={FadeIn.delay(200)} style={[s.premBadge, { top: insets.top + 8 }]}>
              <Icon name="star" size={10} color="#fff" />
              <Text style={s.premText}>PREMIUM</Text>
              {item.price != null && <Text style={s.premPrice}>{item.price} €</Text>}
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
              disabled={!isSerie && !hasVideo && !videosLoading}
              style={s.ctaPrimaryOuter}
            >
              <LinearGradient
                colors={
                  hasVideo || isSerie
                    ? [colors.gradientStart ?? '#7B3FF2', colors.gradientEnd ?? '#5B8DEF']
                    : ['#555', '#444']
                }
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.ctaPrimary}
              >
                {videosLoading && !isSerie ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name={hasVideo || isSerie ? 'play' : 'lock'} size={17} color="#fff" />
                )}
                <Text style={s.ctaPrimaryText}>
                  {isSerie
                    ? 'Voir les épisodes'
                    : videosLoading
                    ? 'Chargement…'
                    : hasVideo
                    ? 'Regarder maintenant'
                    : 'Vidéo non disponible'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

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
              >
                <Icon name="bookmark" size={16} color={colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.ctaIconBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <Icon name="share-2" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </Animated.View>

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
              {item.view_count != null && (
                <InfoLine icon="eye" label="Vues" value={item.view_count.toLocaleString('fr-FR')} colors={colors} last />
              )}
            </View>
          </Animated.View>

        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
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
  ctaRow:       { flexDirection: 'row', gap: 10 },
  ctaSecBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  ctaSecText:   { fontSize: 13, fontWeight: '700' },
  ctaIconBtn:   { width: 46, height: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },

  section:      { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 20, marginTop: 10, marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  synopsisText: { fontSize: 14, lineHeight: 23, fontWeight: '400' },
  synExpand:    { fontSize: 13, fontWeight: '700' },

  infoBlock:    { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, overflow: 'hidden' },
});
