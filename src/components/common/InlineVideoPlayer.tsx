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
import { getPlaybackPrefs } from '../../hooks/usePlaybackPrefs';

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
  autoPlay,
  muted         = false,
  showControls  = false,
  isActive,
  onPress,
}) => {
  const { autoplay: userAutoplay } = getPlaybackPrefs();
  const effectiveAutoPlay = autoPlay ?? userAutoplay;

  const [playing, setPlaying]       = useState(effectiveAutoPlay);
  const [started, setStarted]       = useState(effectiveAutoPlay);
  const [isMuted, setIsMuted]       = useState(muted);
  const [fullscreen, setFullscreen] = useState(false);

  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = muted;
    if (effectiveAutoPlay) p.play();
  });

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    player.muted  = next;
    player.volume = next ? 0 : 1;
  };

  // Autoplay/pause selon visibilité dans le feed
  useEffect(() => {
    if (isActive === undefined) return;
    if (isActive && userAutoplay) {
      player.muted  = true;
      player.volume = 0;
      setIsMuted(true);
      setStarted(true);
      setPlaying(true);
      player.play();
    } else if (!isActive) {
      player.pause();
      setPlaying(false);
    }
  }, [isActive, userAutoplay]);

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

        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          controls={false}
          surfaceType="texture"
        />

        {/* Overlay play/pause central */}
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

        {/* Bouton volume — capture le touch avant l'overlay */}
        <View
          style={styles.muteBtn}
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => {
            const next = !isMuted;
            setIsMuted(next);
            player.muted  = next;
            player.volume = next ? 0 : 1;
          }}
        >
          <View style={styles.muteBtnInner}>
            <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={16} color="#fff" />
          </View>
        </View>

        {/* Bouton plein écran */}
        <View
          style={styles.fullscreenBtn}
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => setFullscreen(true)}
        >
          <View style={styles.muteBtnInner}>
            <Icon name="maximize" size={16} color="#fff" />
          </View>
        </View>

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

      {/* VideoView */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        controls={false}
        surfaceType="texture"
      />

      {/* Overlay tap central — play/pause ou navigation */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onPress ?? (() => setPlaying(p => !p))}
      >
        {!playing && (
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Icon name="play" size={32} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Bouton volume — capture le touch AVANT l'overlay via onStartShouldSetResponder */}
      <View
        style={styles.muteBtn}
        onStartShouldSetResponder={() => true}
        onResponderGrant={() => {
          const next = !isMuted;
          setIsMuted(next);
          player.muted = next;
          player.volume = next ? 0 : 1;
        }}
      >
        <View style={styles.muteBtnInner}>
          <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={16} color="#fff" />
        </View>
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
    position: 'absolute',
    bottom:   12,
    right:    12,
    zIndex:   10,
  },
  muteBtnInner: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.18)',
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
