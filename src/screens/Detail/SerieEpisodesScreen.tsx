import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { contentService } from '../../services';
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

  const [seasons, setSeasons]         = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [episodes, setEpisodes]       = useState<Episode[]>([]);
  const [epLoading, setEpLoading]     = useState(false);

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
      </View>

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
            {episodes.map(ep => (
              <TouchableOpacity
                key={ep.id}
                onPress={() => handlePlay(ep)}
                activeOpacity={0.8}
                style={[s.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
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
                  {ep.video_url && (
                    <View style={s.playOverlay}>
                      <View style={s.playCircle}>
                        <Icon name="play" size={14} color="#fff" />
                      </View>
                    </View>
                  )}
                  {!ep.video_url && (
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
                    <Text style={[s.epSynopsis, { color: colors.textSecondary }]} numberOfLines={2}>{ep.synopsis}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    {ep.duration_sec ? (
                      <Text style={[s.epDur, { color: colors.textTertiary }]}>
                        <Icon name="clock" size={10} color={colors.textTertiary} /> {fmt(ep.duration_sec)}
                      </Text>
                    ) : null}
                    <View style={[s.badge, { backgroundColor: ep.is_free ? '#10b98118' : colors.primary + '18' }]}>
                      <Text style={[s.badgeTxt, { color: ep.is_free ? '#10b981' : colors.primary }]}>
                        {ep.is_free ? 'Gratuit' : 'Premium'}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:        { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 17, fontWeight: '800' },
  headerSub:      { fontSize: 12, fontWeight: '500', marginTop: 1 },

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

  epNum:          { fontSize: 11, fontWeight: '600' },
  epTitle:        { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  epSynopsis:     { fontSize: 12, lineHeight: 17 },
  epDur:          { fontSize: 11, fontWeight: '500' },
  badge:          { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeTxt:       { fontSize: 11, fontWeight: '700' },
});
