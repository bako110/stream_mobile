/**
 * InlineVideoPlayer — lecteur vidéo inline tap-to-play/pause.
 * Utilisé dans PostCard, PostDetailScreen, et partout où une vidéo
 * doit être jouée directement dans le flux sans naviguer vers un écran dédié.
 *
 * Cadrage adaptatif : le composant mesure sa propre largeur (onLayout, pas la
 * largeur d'écran figée) et, dès que la vidéo est chargée (onLoad → width/height
 * réels), recalcule sa hauteur sur le VRAI ratio de la vidéo — clampé entre
 * portrait 3/4 et paysage 16/9 pour ne jamais occuper un écran entier ni
 * devenir une bande trop fine. Avec resizeMode="contain", aucune image n'est
 * rognée pendant la transition estimation → ratio réel.
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  View, TouchableOpacity, StyleSheet, Image, Dimensions,
  Modal, StatusBar, BackHandler,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { getPlaybackPrefs } from '../../hooks/usePlaybackPrefs';

const { width: SCREEN_W } = Dimensions.get('window');

// Bornes de cadrage feed : une vidéo plus portrait que 3/4 est affichée en 3/4
// (le reste tenu par le contain → fines bandes), une plus paysage que 16/9 en
// 16/9. Évite les cartes vidéo hautes comme un écran entier ou plates comme un
// bandeau.
const MIN_RATIO = 3 / 4;   // portrait le plus haut autorisé
const MAX_RATIO = 16 / 9;  // paysage le plus large autorisé
const clampRatio = (r: number) =>
  Number.isFinite(r) && r > 0 ? Math.min(Math.max(r, MIN_RATIO), MAX_RATIO) : 16 / 9;

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
  // 'contain' (défaut) = vidéo entière visible, bandes noires si le ratio du
  // cadre diffère — indispensable quand le ratio réel de la vidéo est inconnu.
  // 'cover' = remplit le cadre en rognant.
  resizeMode?:   'contain' | 'cover';
  // Hauteur imposée par le parent (bannière promo au cadre maîtrisé). Quand
  // fournie, le cadrage auto (mesure + onLoad) est désactivé — la vidéo occupe
  // exactement cette hauteur avec le resizeMode demandé.
  fixedHeight?:  number;
  // Largeur exacte occupée par le lecteur, connue du parent (ex: CARD_INNER_W de
  // PostCard). La passer évite le saut de layout « pleine largeur → largeur
  // réelle » du premier rendu (onLayout arrive une frame trop tard).
  width?:        number;
  // true si `aspectRatio` vient de dimensions RÉELLES stockées côté serveur
  // (post.video_width/height). Dans ce cas on ne « corrige » pas via onLoad —
  // l'estimation EST la vérité, donc aucune bascule de hauteur à la lecture.
  ratioIsExact?: boolean;
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
  resizeMode    = 'contain',
  fixedHeight,
  width: propW,
  ratioIsExact  = false,
}) => {
  const { autoplay: userAutoplay } = getPlaybackPrefs();
  const effectiveAutoPlay = autoPlay ?? userAutoplay;

  const [playing, setPlaying]       = useState(effectiveAutoPlay);
  const [started, setStarted]       = useState(effectiveAutoPlay);
  const [isMuted, setIsMuted]       = useState(muted);
  const [fullscreen, setFullscreen] = useState(false);

  // Largeur réelle occupée par le lecteur. Priorité à la valeur fournie par le
  // parent (pas de saut au 1er rendu) ; sinon mesurée via onLayout ; sinon
  // largeur d'écran en dernier recours.
  const [measuredW, setMeasuredW] = useState(propW ?? 0);
  // Ratio réel de la vidéo une fois chargée. On ne s'en sert QUE si l'estimation
  // n'était pas déjà exacte (ratioIsExact) — évite une bascule de hauteur en
  // pleine lecture quand on connaissait déjà les vraies dimensions.
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = muted;
    if (effectiveAutoPlay) p.play();
  });

  // Dimensions réelles de la vidéo dès qu'elle est décodée (onLoad).
  useEffect(() => {
    if (ratioIsExact || fixedHeight != null) return; // estimation déjà fiable
    let sub: { remove: () => void } | undefined;
    try {
      sub = player.addEventListener('onLoad', (d: { width?: number; height?: number }) => {
        if (d?.width && d?.height && d.width > 0 && d.height > 0) {
          setNaturalRatio(prev => {
            const next = d.width! / d.height!;
            // Ignore un écart minime (< 3%) — pas la peine de re-layouter pour ça.
            return prev != null && Math.abs(prev - next) / next < 0.03 ? prev : next;
          });
        }
      });
    } catch { /* API indispo — on garde l'estimation */ }
    return () => { try { sub?.remove(); } catch {} };
  }, [player, ratioIsExact, fixedHeight]);

  const onWrapLayout = (e: LayoutChangeEvent) => {
    if (propW != null) return; // largeur déjà connue, onLayout inutile
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - measuredW) > 1) setMeasuredW(w);
  };

  // Ratio effectif : le vrai ratio vidéo si on a dû le mesurer, sinon
  // l'estimation passée en prop, le tout clampé aux bornes feed.
  const effectiveRatio = useMemo(
    () => clampRatio(naturalRatio ?? aspectRatio),
    [naturalRatio, aspectRatio],
  );

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

  const baseW = propW ?? (measuredW > 0 ? measuredW : SCREEN_W);
  const height = fixedHeight ?? Math.round(baseW / effectiveRatio);

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
      <View onLayout={onWrapLayout} style={[styles.wrap, { height, borderRadius, overflow: 'hidden' }]}>
        {!started && thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
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
    <View onLayout={onWrapLayout} style={[styles.wrap, { height, borderRadius, overflow: 'hidden' }]}>

      {/* Thumbnail avant le premier play */}
      {!started && thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
        />
      ) : null}

      {/* VideoView */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        resizeMode={resizeMode}
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
