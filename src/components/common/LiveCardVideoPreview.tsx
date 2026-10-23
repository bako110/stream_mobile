import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { LiveKitRoom, useTracks, VideoTrack } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { liveService } from '../../services/liveService';
import { LiveThumbnailBackground } from './LiveThumbnailBackground';

interface Props {
  liveId: string;
  thumbnailUrl?: string | null;
  avatarUrl?: string | null;
  initials?: string;
  avatarSize?: number;
  accentColor?: string;
}

// adaptiveStream : LiveKit réduit automatiquement la résolution reçue à la
// taille réelle du <VideoTrack> affiché — une miniature de carte ne tire donc
// quasiment rien en bande passante, pas besoin d'une config qualité séparée.
const PREVIEW_ROOM_OPTIONS = { adaptiveStream: true, dynacast: false };

/**
 * Aperçu vidéo en direct (muet) pour une carte de la liste des lives —
 * remplace LiveThumbnailBackground (image statique/dégradé) par une vraie
 * connexion LiveKit tant que la carte est montée. Le parent est responsable
 * de ne monter ce composant que pour les cartes réellement visibles
 * (viewabilityConfig sur la FlatList) : chaque instance ouvre une connexion
 * WebRTC réelle, coûteuse en batterie/réseau si multipliée sans limite.
 */
export const LiveCardVideoPreview: React.FC<Props> = ({
  liveId, thumbnailUrl, avatarUrl, initials, avatarSize, accentColor,
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setToken(null);
    setWsUrl(null);
    liveService.getToken(liveId)
      .then(t => { if (!cancelled) { setToken(t.token); setWsUrl(t.livekit_url); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [liveId]);

  const fallback = (
    <LiveThumbnailBackground
      thumbnailUrl={thumbnailUrl}
      avatarUrl={avatarUrl}
      initials={initials}
      avatarSize={avatarSize}
      accentColor={accentColor}
    />
  );

  if (!token || !wsUrl) return fallback;

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect audio={false} video={false} options={PREVIEW_ROOM_OPTIONS}>
      <PreviewTrack fallback={fallback} />
    </LiveKitRoom>
  );
};

const PreviewTrack: React.FC<{ fallback: React.ReactElement }> = ({ fallback }) => {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const camTrack = tracks.find(t => !t.publication?.isMuted);
  if (!camTrack) return fallback;

  return <VideoTrack trackRef={camTrack} style={StyleSheet.absoluteFill} objectFit="cover" />;
};
