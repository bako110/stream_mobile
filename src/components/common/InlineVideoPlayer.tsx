/**
 * InlineVideoPlayer — lecteur vidéo inline tap-to-play/pause.
 * Utilisé dans PostCard, PostDetailScreen, et partout où une vidéo
 * doit être jouée directement dans le flux sans naviguer vers un écran dédié.
 */
import React, { useState, useEffect } from 'react';
import {
  View, TouchableOpacity, StyleSheet, Image, Dimensions,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  uri:           string;
  thumbnailUri?: string | null;
  aspectRatio?:  number;      // default 16/9
  borderRadius?: number;
  autoPlay?:     boolean;     // default false — user must tap
  muted?:        boolean;     // default false
}

export const InlineVideoPlayer: React.FC<Props> = ({
  uri,
  thumbnailUri,
  aspectRatio   = 16 / 9,
  borderRadius  = 12,
  autoPlay      = false,
  muted         = false,
}) => {
  const [playing, setPlaying] = useState(autoPlay);
  const [started, setStarted] = useState(autoPlay);

  const player = useVideoPlayer({ uri }, p => {
    p.loop   = true;
    p.muted  = muted;
    if (autoPlay) p.play();
  });

  useEffect(() => {
    if (playing) {
      setStarted(true);
      player.play();
    } else {
      player.pause();
    }
  }, [playing]);

  const height = Math.round(SCREEN_W / aspectRatio);

  return (
    <View style={[styles.wrap, { height, borderRadius, overflow: 'hidden' }]}>

      {/* Thumbnail avant le premier play */}
      {!started && thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}

      {/* VideoView — toujours monté pour éviter un rechargement à chaque play */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        nativeControls={false}
      />

      {/* Overlay tap */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => setPlaying(p => !p)}
      >
        {/* Bouton play/pause centré — visible seulement si pausé */}
        {!playing && (
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Icon name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Badge vidéo (coin haut-droit) */}
      <View style={styles.badge} pointerEvents="none">
        <Icon name="video" size={11} color="#fff" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: '#000',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  playCircle: {
    width:           68,
    height:          68,
    borderRadius:    34,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  badge: {
    position:        'absolute',
    top:             10,
    right:           10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius:    6,
    paddingHorizontal: 6,
    paddingVertical:   3,
  },
});
