import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, Image,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import RNBlobUtil from 'react-native-blob-util';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

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
  const { url, title, videoId, contentId, episodeId, contentType, thumbnailUrl, totalSeconds } = route.params;
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedSec = useRef(0);

  useEffect(() => {
    StatusBar.setHidden(true, 'none');
    return () => StatusBar.setHidden(false, 'none');
  }, []);

  const [buffering, setBuffering] = useState(false);

  const player = useVideoPlayer(
    {
      uri: url,
      bufferConfig: {
        minBufferMs:                      3000,
        maxBufferMs:                      20000,
        bufferForPlaybackMs:              1000,
        bufferForPlaybackAfterRebufferMs: 2000,
      },
    },
    p => {
      p.muted = false;
      p.play();
    },
  );

  useEffect(() => {
    const sub = player.addEventListener('onBuffer', (isBuffering: boolean) => setBuffering(isBuffering));
    return () => sub.remove();
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

  const handleDownload = async () => {
    const ext = url.split('.').pop()?.split('?')[0] ?? 'mp4';
    const filename = `${title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    const destPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${filename}`;

    setDownloading(true);
    setDownloadProgress(0);
    try {
      await RNBlobUtil.config({
        path: destPath,
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title,
          description: 'Téléchargement en cours…',
          mime: 'video/mp4',
        },
      })
        .fetch('GET', url)
        .progress((received, total) => {
          setDownloadProgress(Math.round((Number(received) / Number(total)) * 100));
        });
      Alert.alert('Téléchargement terminé', `"${title}" a été sauvegardé dans vos téléchargements.`);
    } catch {
      Alert.alert('Erreur', 'Le téléchargement a échoué. Réessaie plus tard.');
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

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

      {buffering && (
        <View style={s.bufferOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <View style={[s.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
          <Icon name="x" size={20} color="#fff" />
        </TouchableOpacity>

        <Text style={s.titleText} numberOfLines={1}>{title}</Text>

        <TouchableOpacity onPress={handleDownload} disabled={downloading} style={s.downloadBtn}>
          {downloading ? (
            <View style={s.row}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={s.downloadText}>{downloadProgress}%</Text>
            </View>
          ) : (
            <View style={s.row}>
              <Icon name="download" size={16} color="#fff" />
              <Text style={s.downloadText}>Télécharger</Text>
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
  bufferOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 5 },
});
