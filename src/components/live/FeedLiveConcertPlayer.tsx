/**
 * Lecture live INLINE d'un concert directement dans une carte du feed —
 * uniquement quand cette carte est la carte active du scroll (isActive),
 * exactement comme une vidéo reel : connexion LiveKit ouverte à l'entrée
 * dans le viewport, fermée à la sortie. Les autres cartes gardent leur
 * couverture statique (gérée par l'appelant, pas ce composant).
 *
 * Volontairement minimal — pas de chat, pas de stage, pas de contrôle plein
 * écran : pour ça l'utilisateur tape la carte et va sur ConcertDetailScreen/
 * LiveViewerScreen. Ici uniquement le flux vidéo + badge LIVE + viewers.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import {
  LiveKitRoom,
  useRemoteParticipants,
  VideoTrack,
  useTracks,
} from '@livekit/react-native';
import { Track, VideoPresets } from 'livekit-client';
import Icon from 'react-native-vector-icons/Feather';
import { CachedImage } from '../common';
import { consumeConcertLivePrefetch, prefetchConcertLive } from '../../utils/livePrefetch';
import { concertService, liveService } from '../../services';

const ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: false,
  publishDefaults: {
    videoCodec: 'h264' as const,
    videoSimulcastLayers: [VideoPresets.h360], // carte compacte — pas besoin du h720 du plein écran
  },
};

const FeedLiveVideo: React.FC<{ muted: boolean }> = ({ muted }) => {
  const remoteParticipants = useRemoteParticipants();
  const allCamTracks = useTracks([Track.Source.Camera]);
  const allMicTracks = useTracks([Track.Source.Microphone]);

  // Coupe reellement la reception audio native (pas juste le volume) tant que
  // la carte est en muet — comportement par defaut attendu dans un scroll de
  // feed, contrairement au plein ecran ou l'intention de regarder est explicite.
  useEffect(() => {
    allMicTracks.forEach(t => { try { t.publication?.setEnabled(!muted); } catch {} });
  }, [muted, allMicTracks]);

  if (remoteParticipants.length === 0 || allCamTracks.length === 0) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="small" color="#fff" />
      </View>
    );
  }
  return <VideoTrack trackRef={allCamTracks[0]} style={StyleSheet.absoluteFill} objectFit="cover" />;
};

interface Props {
  concertId: string;
  thumbnailUrl?: string | null;
  isActive: boolean;
  muted: boolean;
}

export const FeedLiveConcertPlayer: React.FC<Props> = ({ concertId, thumbnailUrl, isActive, muted }) => {
  const [conn, setConn] = useState<{ token: string; wsUrl: string } | null>(null);

  useEffect(() => {
    if (!isActive) { setConn(null); return; }
    let cancelled = false;

    const preloaded = consumeConcertLivePrefetch(concertId);
    if (preloaded) {
      setConn({ token: preloaded.token, wsUrl: preloaded.wsUrl });
      return;
    }

    (async () => {
      try {
        const concert = await concertService.getById(concertId);
        if (cancelled || concert.status !== 'live' || concert.access_type !== 'free') return;
        const result = concert.live_id
          ? await liveService.getToken(concert.live_id)
          : await concertService.getStreamToken(concertId);
        if (!cancelled) setConn({ token: result.token, wsUrl: result.livekit_url });
      } catch {
        /* best-effort — reste sur la couverture statique en cas d'échec */
      }
    })();

    return () => { cancelled = true; };
  }, [isActive, concertId]);

  // Dès que la carte DEVIENT active, on relance aussi un prefetch — couvre le
  // cas où elle n'a jamais été préchargée via onPressIn (ex. apparue direct
  // dans le viewport après un scroll rapide, sans survol préalable).
  useEffect(() => {
    if (isActive) prefetchConcertLive(concertId);
  }, [isActive, concertId]);

  if (!isActive || !conn) {
    return thumbnailUrl ? (
      <CachedImage uri={thumbnailUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
    ) : (
      <View style={[StyleSheet.absoluteFill, st.fallback]}>
        <Icon name="radio" size={32} color="rgba(255,255,255,0.3)" />
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={conn.wsUrl} token={conn.token} connect audio={false} video={false} options={ROOM_OPTIONS}>
      <View style={StyleSheet.absoluteFill}>
        <FeedLiveVideo muted={muted} />
      </View>
    </LiveKitRoom>
  );
};

const st = StyleSheet.create({
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A22' },
});
