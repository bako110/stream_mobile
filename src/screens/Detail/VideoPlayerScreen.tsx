import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { getPlaybackPrefs } from '../../hooks/usePlaybackPrefs';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { useMediaDownload } from '../../hooks/useMediaDownload';

interface Props {
  route: {
    params: {
      url: string;
      title: string;
      videoId?: string;
      contentId?: string;
      episodeId?: string;
      contentType?: 'film' | 'serie_episode';
      thumbnailUrl?: string;
      totalSeconds?: number;
    };
  };
  navigation: { goBack: () => void };
}

export const VideoPlayerScreen: React.FC<Props> = ({ route, navigation }) => {
  useKeepAwake();
  const { url, title, videoId, contentId, episodeId, contentType, thumbnailUrl, totalSeconds } = route.params;
  const insets = useSafeAreaInsets();
  const { get: getDl, download: startDl } = useMediaDownload();
  const dl = getDl(videoId ?? contentId ?? episodeId ?? url);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedSec = useRef(0);

  useEffect(() => {
    StatusBar.setHidden(true, 'none');
    return () => StatusBar.setHidden(false, 'none');
  }, []);

  const [buffering, setBuffering] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const { autoplay } = getPlaybackPrefs();

  const player = useVideoPlayer(
    {
      uri: url,
      bufferConfig: {
        minBufferMs:                      2000,
        maxBufferMs:                      30000,
        bufferForPlaybackMs:              500,
        bufferForPlaybackAfterRebufferMs: 1500,
        preferredForwardBufferDurationMs: 15000,
      },
    },
    p => {
      p.muted = false;
      if (autoplay) p.play();
    },
  );

  useEffect(() => {
    const subBuffer = player.addEventListener('onBuffer', (isBuffering: boolean) => setBuffering(isBuffering));
    const subReady  = player.addEventListener('onReadyToDisplay', () => setInitialLoading(false));
    return () => { subBuffer.remove(); subReady.remove(); };
  }, []);

  // Sauvegarde de la progression toutes les 15 secondes
  useEffect(() => {
    if (!videoId) return;
    progressTimer.current = setInterval(() => {
      const currentSec = Math.floor(player.currentTime ?? 0);
      if (Math.abs(currentSec - lastSavedSec.current) < 5) return;
      lastSavedSec.current = currentSec;
      const params = new URLSearchParams({ progress_sec: String(currentSec) });
      if (totalSeconds) params.append('total_seconds', String(totalSeconds));
      if (contentId)    params.append('content_id', contentId);
      if (episodeId)    params.append('episode_id', episodeId);
      if (contentType)  params.append('content_type', contentType);
      if (title)        params.append('title', title);
      if (thumbnailUrl) params.append('thumbnail_url', thumbnailUrl);
      apiClient.post(`${Endpoints.streaming.progress(videoId)}?${params.toString()}`).catch(() => {});
    }, 15000);
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, [videoId, contentId, episodeId, contentType, title, thumbnailUrl, totalSeconds]);

  const handleDownload = () => startDl(videoId ?? contentId ?? episodeId ?? url, url, true);

  return (
    <View style={s.container}>
      <StatusBar hidden />

      {thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: insets.bottom }}
          resizeMode="cover"
          blurRadius={8}
        />
      ) : null}

      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: insets.bottom }}
        resizeMode="contain"
        controls
      />

      {(initialLoading || buffering) && (
        <View style={s.bufferOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          {initialLoading && (
            <Text style={s.loadingText}>Chargement en cours…</Text>
          )}
        </View>
      )}

      <View style={[s.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>

        <Text style={s.titleText} numberOfLines={1}>{title}</Text>

        <TouchableOpacity onPress={handleDownload} disabled={dl.downloading || !!dl.localUri} style={s.downloadBtn}>
          {dl.downloading ? (
            <View style={s.row}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={s.downloadText}>{dl.progress}%</Text>
            </View>
          ) : (
            <View style={s.row}>
              <Icon name={dl.localUri ? 'check' : 'download'} size={16} color="#fff" />
              <Text style={s.downloadText}>{dl.localUri ? 'Enregistré' : 'Télécharger'}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  topBar:       { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, zIndex: 10 },
  closeBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  titleText:    { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  downloadBtn:  { backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  downloadText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bufferOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 5 },
  loadingText:   { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 14, opacity: 0.85 },
});
