import React, { useState, useEffect, useCallback } from 'react';
import {
  View, TouchableOpacity, StyleSheet, Image, Dimensions,
  Modal, StatusBar, BackHandler,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { getPlaybackPrefs } from '../../hooks/usePlaybackPrefs';

const { width: SCREEN_W } = Dimensions.get('window');

// Bornes de hauteur style Facebook/Instagram
const MIN_H = Math.round(SCREEN_W * (9 / 16));  // 16:9 paysage
const MAX_H = Math.round(SCREEN_W * (5 / 4));   // 4:5 portrait (comme Instagram)

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
  aspectRatio,
  borderRadius  = 12,
  autoPlay,
  muted         = false,
  showControls  = false,
  isActive,
  onPress,
}) => {
  const { autoplay: userAutoplay } = getPlaybackPrefs();
  const effectiveAutoPlay = autoPlay ?? userAutoplay;

  const [playing,    setPlaying]    = useState(effectiveAutoPlay);
  const [started,    setStarted]    = useState(effectiveAutoPlay);
  const [isMuted,    setIsMuted]    = useState(muted);
  const [fullscreen, setFullscreen] = useState(false);
  // Hauteur dynamique selon le vrai ratio de la vidéo
  const [videoH, setVideoH] = useState<number>(() => {
    if (aspectRatio) return Math.round(SCREEN_W / aspectRatio);
    return Math.round(SCREEN_W * (9 / 16));
  });

  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = muted;
    if (effectiveAutoPlay) p.play();
  });

  // Récupère le vrai ratio dès que la vidéo est chargée
  const handleLoad = useCallback((data: any) => {
    const w = data?.width  ?? data?.naturalSize?.width;
    const h = data?.height ?? data?.naturalSize?.height;
    if (w && h && w > 0 && h > 0) {
      const computed = Math.round(SCREEN_W * (h / w));
      setVideoH(Math.max(MIN_H, Math.min(MAX_H, computed)));
    }
  }, []);

  useEffect(() => {
    const sub = (player as any).addEventListener?.('onLoad', handleLoad);
    return () => sub?.remove?.();
  }, [player, handleLoad]);

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
      <View style={[styles.wrap, { height: videoH, borderRadius, overflow: 'hidden' }]}>
        {!started && thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : null}

        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          controls={false}
        />

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

        <View
          style={styles.muteBtn}
          onStartShouldSetResponder={() => true}
          onResponderGrant={toggleMute}
        >
          <View style={styles.muteBtnInner}>
            <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={16} color="#fff" />
          </View>
        </View>

        <View
          style={styles.fullscreenBtn}
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => setFullscreen(true)}
        >
          <View style={styles.muteBtnInner}>
            <Icon name="maximize" size={16} color="#fff" />
          </View>
        </View>

        <Modal visible={fullscreen} statusBarTranslucent animationType="fade" onRequestClose={() => setFullscreen(false)}>
          <StatusBar hidden />
          <View style={styles.fsRoot}>
            <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="contain" controls={false} />
            <TouchableOpacity style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <View style={styles.fsCloseCircle}><Icon name="x" size={20} color="#fff" /></View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fsMute} onPress={toggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height: videoH, borderRadius, overflow: 'hidden' }]}>

      {/* Thumbnail avant le premier play */}
      {!started && thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : null}

      {/* VideoView — contain pour voir la vidéo entière */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        controls={false}
      />

      {/* Overlay tap — play/pause ou navigation */}
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

      {/* Bouton volume */}
      <View
        style={styles.muteBtn}
        onStartShouldSetResponder={() => true}
        onResponderGrant={toggleMute}
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
          <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="contain" controls={false} />
          <TouchableOpacity style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={styles.fsCloseCircle}><Icon name="x" size={20} color="#fff" /></View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fsMute} onPress={toggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name={isMuted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
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
    position: 'absolute',
    bottom:   12,
    right:    54,
    zIndex:   10,
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
