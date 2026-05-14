/**
 * InlineVideoPlayer — lecteur vidéo inline tap-to-play/pause.
 * Utilisé dans PostCard, PostDetailScreen, et partout où une vidéo
 * doit être jouée directement dans le flux sans naviguer vers un écran dédié.
 */
import React, { useState, useEffect } from 'react';
import {
  View, TouchableOpacity, StyleSheet, Image, Dimensions,
  Modal, StatusBar, BackHandler,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  uri:           string;
  thumbnailUri?: string | null;
  aspectRatio?:  number;
  borderRadius?: number;
  autoPlay?:     boolean;
  muted?:        boolean;
  showControls?: boolean;
  isActive?:     boolean;
  onPress?:      () => void;
}

export const InlineVideoPlayer: React.FC<Props> = ({
  uri,
  thumbnailUri,
  aspectRatio   = 16 / 9,
  borderRadius  = 12,
  autoPlay      = false,
  muted         = false,
  showControls  = false,
  isActive,
  onPress,
}) => {
  const [playing, setPlaying]       = useState(autoPlay);
  const [started, setStarted]       = useState(autoPlay);
  const [isMuted, setIsMuted]       = useState(muted);
  const [fullscreen, setFullscreen] = useState(false);

  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = muted;
    if (autoPlay) p.play();
  });

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    player.muted = next;
  };

  // Pause/reprend selon visibilité dans le feed
  useEffect(() => {
    if (isActive === undefined) return;
    if (isActive) {
      if (playing) { setStarted(true); player.play(); }
    } else {
      player.pause();
      setPlaying(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (showControls) return;
    if (playing) {
      setStarted(true);
      player.play();
    } else {
      player.pause();
    }
  }, [playing, showControls]);

  const height = Math.round(SCREEN_W / aspectRatio);

  // Ferme le fullscreen via le bouton Android back
  useEffect(() => {
    if (!fullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      return true;
    });
    return () => sub.remove();
  }, [fullscreen]);

  if (showControls) {
    return (
      <View style={[styles.wrap, { height, borderRadius, overflow: 'hidden' }]}>
        {!started && thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}

        {/* Player inline */}
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          controls={false}
        />

        {/* Overlay : tap = play/pause si pas encore démarré */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => {
            if (!started) { setStarted(true); player.play(); setPlaying(true); }
            else { setPlaying(p => { const next = !p; if (next) player.play(); else player.pause(); return next; }); }
          }}
        >
          {!playing && (
            <View style={styles.playOverlay}>
              <View style={styles.playCircle}>
                <Icon name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Bouton volume */}
        {playing && (
          <TouchableOpacity style={styles.muteBtn} onPress={toggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={16} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Bouton plein écran */}
        <TouchableOpacity style={styles.fullscreenBtn} onPress={() => setFullscreen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="maximize" size={18} color="#fff" />
        </TouchableOpacity>

        {/* Modal plein écran */}
        <Modal visible={fullscreen} statusBarTranslucent animationType="fade" onRequestClose={() => setFullscreen(false)}>
          <StatusBar hidden />
          <View style={styles.fsRoot}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              controls={false}
            />

            {/* Bouton fermer */}
            <TouchableOpacity style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <View style={styles.fsCloseCircle}>
                <Icon name="x" size={20} color="#fff" />
              </View>
            </TouchableOpacity>

            {/* Volume en plein écran */}
            <TouchableOpacity style={styles.fsMute} onPress={toggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </Modal>
      </View>
    );
  }

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
        controls={false}
      />

      {/* Overlay tap — navigue vers détails si onPress fourni, sinon play/pause */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onPress ?? (() => setPlaying(p => !p))}
      >
        {!playing && (
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Icon name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Bouton volume (coin bas-droit) */}
      {playing && (
        <TouchableOpacity style={styles.muteBtn} onPress={toggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: '#000',
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
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
  muteBtn: {
    position:        'absolute',
    bottom:          10,
    right:           10,
    width:           34,
    height:          34,
    borderRadius:    17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  fullscreenBtn: {
    position:        'absolute',
    bottom:          10,
    right:           52,
    width:           34,
    height:          34,
    borderRadius:    17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  fsRoot: {
    flex:            1,
    backgroundColor: '#000',
  },
  fsClose: {
    position: 'absolute',
    top:      48,
    left:     16,
    zIndex:   10,
  },
  fsCloseCircle: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  fsMute: {
    position:        'absolute',
    bottom:          40,
    right:           24,
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems:      'center',
    justifyContent:  'center',
  },
});
