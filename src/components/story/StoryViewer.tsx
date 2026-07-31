import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, Dimensions,
  StatusBar, StyleSheet, Animated, PanResponder,
  TouchableWithoutFeedback, TextInput, Modal, Platform,
  FlatList, ActivityIndicator, Easing, Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TextLayer, DrawPath, MaskRect, StickerLayer } from './StoryMediaEditor';
import { VideoView, useVideoPlayer } from 'react-native-video';
import type { VideoPlayerStatus } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { StoryGroup, StoryViewerUser } from '../../types/story';
import { storyService } from '../../services/storyService';
import { showConfirm } from '../../services/confirmService';
import { saveService } from '../../services/saveService';
import { useWs } from '../../context/WebSocketContext';
import { GoFolyXLoader, HeartRain, LikeNamesFeed } from '../common';
import { getLocalUri, getLocalUriAsync, cacheInBackground, invalidateCacheEntry } from '../../services/videoCacheService';
import { apiClient } from '../../api/client';
import { networkService } from '../../services/networkService';
import { useIsWifi } from '../../hooks/useIsWifi';

const AudioRecorderPlayerModule = require('react-native-audio-recorder-player');
const AudioRecorderPlayerClass = AudioRecorderPlayerModule.default || AudioRecorderPlayerModule;
const audioPlayer = new AudioRecorderPlayerClass();

const { width: W, height: H } = Dimensions.get('window');

const FONT_MAP: Record<string, { fontFamily?: string; fontWeight?: 'normal' | 'bold' | '900'; fontStyle?: 'normal' | 'italic' }> = {
  classic:   { fontWeight: 'bold' },
  serif:     { fontFamily: 'serif',                 fontWeight: 'normal' },
  mono:      { fontFamily: 'monospace',             fontWeight: 'bold' },
  cursive:   { fontFamily: 'cursive',               fontWeight: 'normal' },
  condensed: { fontFamily: 'sans-serif-condensed',  fontWeight: '900' },
  italic:    { fontFamily: 'serif',                 fontWeight: 'normal', fontStyle: 'italic' },
};

// Couleur accent par type de media
const TYPE_COLOR: Record<string, string> = {
  text:        '#7B3FF2',
  image:       '#2196F3',
  video:       '#E91E63',
  audio:       '#FF9800',
  voice:       '#00BCD4',
  image_audio: '#4CAF50',
};

interface Props {
  groups:             StoryGroup[];
  initialGroupIndex:  number;
  initialStoryIndex?: number;
  currentUserId?:     string;
  onClose:            () => void;
  onNavigateToChat?:  (partnerId: string, partnerName: string, avatarUrl?: string) => void;
  onNavigateToCall?:  (partnerId: string, partnerName: string, callType: 'voice' | 'video', avatarUrl?: string) => void;
}

// ── Lecteur vidéo story ───────────────────────────────────────────────────────

// Buffer continu — charge tous les segments HLS au fur et à mesure (story affichée à l'écran)
const BUFFER_CFG = {
  minBufferMs:                      8000,   // garde au moins 8s chargées en permanence
  maxBufferMs:                      60000,  // charge jusqu'à 60s en avance (toute la story)
  bufferForPlaybackMs:              500,    // attend 500ms avant de démarrer (évite les micro-stops)
  bufferForPlaybackAfterRebufferMs: 1500,   // 1.5s après rebuffer
};

// Buffer réduit pour les voisins PRÉCHARGÉS (pas encore affichés) — un voisin n'a besoin
// que de quelques secondes pour démarrer instantanément, pas de 60s de vidéo entière
// téléchargée pour rien s'il n'est jamais atteint.
const PRELOAD_BUFFER_CFG = {
  minBufferMs:                      2000,
  maxBufferMs:                      8000,
  bufferForPlaybackMs:              500,
  bufferForPlaybackAfterRebufferMs: 1500,
};

// ── Image avec fondu au chargement ───────────────────────────────────────────
const StoryImageView = React.memo(({ uri, bgColor }: { uri: string; bgColor?: string }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  return (
    <View style={[s.media, { backgroundColor: bgColor ?? '#000' }]}>
      <Animated.Image
        source={{ uri }}
        style={[s.media, { opacity }]}
        resizeMode="contain"
        onLoad={() => Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start()}
      />
    </View>
  );
});

const StoryVideoView: React.FC<{ uri: string; paused: boolean; onReady: () => void; onBuffering?: (b: boolean) => void; thumbnail?: string | null }> = React.memo(({ uri, paused, onReady, onBuffering, thumbnail }) => {
  const [buffering,    setBuffering]    = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const isHls = uri.includes('.m3u8');

  // Vérifie synchrone d'abord — si déjà en cache index, on démarre sans loader
  const syncLocal = !isHls ? getLocalUri(uri) : null;
  const [resolvedUri, setResolvedUri] = useState<string>(syncLocal ?? uri);
  // Fichier local confirmé ou thumbnail dispo → pas de spinner de départ
  const [ready, setReady] = useState(() => !!syncLocal);
  // Thumbnail affiché tant que la vidéo n'est pas prête (évite le spinner brut)
  const [showThumb, setShowThumb] = useState(() => !syncLocal && !!thumbnail);

  useEffect(() => {
    let cancelled = false;
    if (isHls) return; // HLS : pas de cache disque possible

    getLocalUriAsync(uri).then(local => {
      if (cancelled) return;
      if (local) {
        setResolvedUri(local);
        setReady(true);
        setShowThumb(false);
        onReady();
      } else {
        setResolvedUri(uri);
        cacheInBackground(uri).catch(() => {});
      }
    });
    return () => { cancelled = true; };
  }, [uri]);

  const playUri = (!usedFallback && resolvedUri) ? resolvedUri : uri;

  const player = useVideoPlayer(
    { uri: playUri, bufferConfig: BUFFER_CFG },
    p => {
      p.loop   = false;
      p.muted  = false;
      p.volume = 1.0;
      p.preload().catch(() => {});
      if (!paused) p.play();
    },
  );

  useEffect(() => {
    if (paused) player.pause();
    else        player.play();
  }, [paused, player]);

  useEffect(() => {
    if (!resolvedUri || resolvedUri === player.src?.uri) return;
    player.replaceSourceAsync({ uri: resolvedUri, bufferConfig: BUFFER_CFG }).catch(() => {});
  }, [resolvedUri]);

  useEffect(() => {
    const bufSub = player.addEventListener('onBuffer', (isBuffering: boolean) => {
      setBuffering(isBuffering);
      onBuffering?.(isBuffering);
    });
    const stsSub = player.addEventListener('onStatusChange', (status: VideoPlayerStatus) => {
      if (status === 'readyToPlay' && !ready) {
        setReady(true);
        setShowThumb(false);
        onReady();
      }
    });
    const errSub = player.addEventListener('onError', () => {
      if (resolvedUri !== uri && !usedFallback) {
        invalidateCacheEntry(uri);
        setUsedFallback(true);
        setResolvedUri(uri);
        setReady(false);
      }
    });
    return () => { bufSub.remove(); stsSub.remove(); errSub.remove(); };
  }, [resolvedUri, usedFallback]);

  return (
    <View style={s.media}>
      <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {/* Thumbnail par-dessus pendant le buffering — disparait quand la vidéo est prête */}
      {showThumb && thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      {/* Spinner uniquement si pas de thumbnail et pas encore prête */}
      {(!ready || buffering) && !showThumb && (
        <GoFolyXLoader variant="reel" color="#ffffff" />
      )}
    </View>
  );
}, (prev, next) => prev.uri === next.uri && prev.paused === next.paused && prev.thumbnail === next.thumbnail);

// ── Préchargeur silencieux — instancie un player et appelle preload() ─────────
// Rendu invisible, libéré au unmount automatiquement par react-native-video

const VideoPreloader: React.FC<{ uri: string }> = ({ uri }) => {
  const localUri = getLocalUri(uri);
  const playUri  = localUri ?? uri;
  // Hors wifi, on ne précharge qu'un buffer minimal et on ne télécharge pas le fichier
  // complet en cache — sinon chaque voisin (jusqu'à 4 en simultané) coûte des Mo de
  // données mobiles même s'il n'est jamais visionné.
  const isWifi = networkService.isWifi();

  const player = useVideoPlayer(
    { uri: playUri, bufferConfig: isWifi ? BUFFER_CFG : PRELOAD_BUFFER_CFG },
    p => { p.muted = true; p.volume = 0; },
  );
  useEffect(() => {
    player.preload().catch(() => {});
    // Sauvegarde en background si pas encore en cache — uniquement en wifi
    if (isWifi && !localUri && uri && !uri.includes('.m3u8')) {
      cacheInBackground(uri).catch(() => {});
    }
    return () => { try { player.pause(); } catch {} };
  }, [uri]);
  return null;
};

// ── Music Player Widget animé ────────────────────────────────────────────────

const BAR_COUNT = 20;

const MusicWidget: React.FC<{ audioUrl: string; audioName?: string | null; accent: string; playing: boolean; mediaType: string }> = ({
  audioUrl, audioName, accent, playing, mediaType,
}) => {
  const vinylSpin  = useRef(new Animated.Value(0)).current;
  const spinAnim   = useRef<Animated.CompositeAnimation | null>(null);
  const barAnims   = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(Math.random()))).current;
  const barLoops   = useRef<Animated.CompositeAnimation[]>([]);
  const glowAnim   = useRef(new Animated.Value(0)).current;

  // Vrai titre (audio_name, résolu depuis le catalogue Sound côté backend) —
  // fallback sur le nom de fichier de l'URL seulement pour les anciennes
  // stories publiées avant l'ajout de ce champ.
  const trackName = (() => {
    if (audioName && audioName.trim()) {
      return audioName.length > 30 ? audioName.slice(0, 30) + '…' : audioName;
    }
    try {
      const seg = audioUrl.split('/').pop()?.split('?')[0] ?? '';
      const clean = decodeURIComponent(seg).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      return clean.length > 30 ? clean.slice(0, 30) + '…' : clean || 'Musique';
    } catch { return 'Musique'; }
  })();

  const startSpin = useCallback(() => {
    spinAnim.current?.stop();
    spinAnim.current = Animated.loop(
      Animated.timing(vinylSpin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
    );
    spinAnim.current.start();
  }, []);

  const stopSpin = useCallback(() => {
    spinAnim.current?.stop();
  }, []);

  const startBars = useCallback(() => {
    barLoops.current.forEach(l => l.stop());
    barLoops.current = barAnims.map((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 0.15 + Math.random() * 0.85, duration: 180 + i * 22, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(anim, { toValue: 0.05 + Math.random() * 0.5,  duration: 180 + i * 18, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ]),
      );
      loop.start();
      return loop;
    });
  }, []);

  const stopBars = useCallback(() => {
    barLoops.current.forEach(l => l.stop());
    barAnims.forEach(a => Animated.timing(a, { toValue: 0.12, duration: 300, useNativeDriver: false }).start());
  }, []);

  const startGlow = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    ).start();
  }, []);

  useEffect(() => {
    if (playing) { startSpin(); startBars(); startGlow(); }
    else { stopSpin(); stopBars(); }
  }, [playing]);

  useEffect(() => () => { stopSpin(); stopBars(); }, []);

  const spinDeg = vinylSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  const isVoice = mediaType === 'voice';

  return (
    <View style={mw.container} pointerEvents="none">
      {/* Glow de fond */}
      <Animated.View style={[mw.glow, { backgroundColor: accent, opacity: glowOpacity }]} />

      {/* Vinyle / micro */}
      <View style={mw.vinylWrap}>
        <Animated.View style={[mw.vinyl, { transform: [{ rotate: spinDeg }] }]}>
          <LinearGradient
            colors={['#1a1a2e', '#16213E', '#0F3460', '#1a1a2e']}
            style={mw.vinylInner}
          />
          {/* Sillons */}
          {[28, 22, 16].map(r => (
            <View key={r} style={[mw.groove, { width: r * 2, height: r * 2, borderRadius: r, borderColor: 'rgba(255,255,255,0.06)' }]} />
          ))}
          {/* Centre coloré */}
          <View style={[mw.vinylCenter, { backgroundColor: accent }]}>
            <MaterialIcon name={isVoice ? 'microphone' : 'music-note'} size={11} color="#fff" />
          </View>
        </Animated.View>
        {/* Bras de lecture */}
        {!isVoice && (
          <View style={mw.tonearm}>
            <View style={[mw.tonearmLine, { backgroundColor: 'rgba(255,255,255,0.5)' }]} />
            <View style={[mw.tonearmHead, { backgroundColor: accent }]} />
          </View>
        )}
      </View>

      {/* Infos + barres */}
      <View style={mw.info}>
        <View style={mw.labelRow}>
          <MaterialIcon name={isVoice ? 'microphone-variant' : 'music-circle'} size={12} color={accent} />
          <Text style={[mw.typeLabel, { color: accent }]}>{isVoice ? 'Vocal' : 'Musique'}</Text>
          {playing && (
            <View style={[mw.liveChip, { backgroundColor: accent + '25', borderColor: accent + '60' }]}>
              <View style={[mw.liveDot, { backgroundColor: accent }]} />
              <Text style={[mw.liveText, { color: accent }]}>EN COURS</Text>
            </View>
          )}
        </View>

        <Text style={mw.trackName} numberOfLines={1}>{trackName}</Text>

        {/* Barres d'onde */}
        <View style={mw.waveRow}>
          {barAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                mw.bar,
                {
                  backgroundColor: accent,
                  height: anim.interpolate({ inputRange: [0, 1], outputRange: [3, 22] }),
                  opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

// ─── StoryAdSlide — pub plein ecran entre groupes de stories ─────────────────

interface AdInfo { id: string; title: string; description?: string; cta_text?: string; cta_url?: string; creative_url?: string; thumbnail_url?: string; }

const StoryAdSlide: React.FC<{ ad: AdInfo; onSkip: () => void }> = ({ ad, onSkip }) => {
  const { width: W, height: H } = Dimensions.get('window');
  const isVideo = !!(ad.creative_url && (ad.creative_url.includes('.m3u8') || ad.creative_url.includes('/hls/')));
  const adPlayer = useVideoPlayer(
    isVideo && ad.creative_url ? { uri: ad.creative_url } : 'about:blank',
    p => { p.loop = true; p.muted = false; p.volume = 1; },
  );
  useEffect(() => {
    if (!isVideo) return;
    try { adPlayer.play(); } catch {}
    return () => { try { adPlayer.pause(); } catch {} };
  }, [isVideo, adPlayer]);

  // Barre de progression animee (5s)
  const prog = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(prog, { toValue: 1, duration: 5000, useNativeDriver: false }).start();
  }, [prog]);

  // L'impression est déjà enregistrée dans goNext() au moment d'afficher la pub.
  // On ne la refait pas ici pour éviter le double comptage.

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={{ width: W, height: H, backgroundColor: '#000' }}>
        <StatusBar hidden translucent />

        {/* Media */}
        {isVideo && ad.creative_url ? (
          <VideoView player={adPlayer} style={{ position: 'absolute', width: W, height: H }} resizeMode="cover" controls={false} />
        ) : (ad.creative_url || ad.thumbnail_url) ? (
          <Image source={{ uri: ad.creative_url || ad.thumbnail_url }} style={{ position: 'absolute', width: W, height: H }} resizeMode="cover" />
        ) : (
          // Pas de creative — fond gradient avec cercles decoratifs
          <LinearGradient colors={['#3B0764', '#7B3FF2', '#E0389A']} locations={[0, 0.5, 1]} style={{ position: 'absolute', width: W, height: H }}>
            <View style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <View style={{ position: 'absolute', bottom: -60, left: -30, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(255,255,255,0.05)' }} />
          </LinearGradient>
        )}

        {/* Gradient bas */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
          locations={[0.35, 0.65, 1]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.55 }}
        />

        {/* Barre progression */}
        <View style={{ position: 'absolute', top: 44, left: 8, right: 8, height: 2.5, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 }}>
          <Animated.View style={{ height: '100%', backgroundColor: '#fff', borderRadius: 2, width: prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
        </View>

        {/* Label Sponsorisé + bouton fermer */}
        <View style={{ position: 'absolute', top: 52, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600' }}>Sponsorisé</Text>
            <Icon name="globe" size={10} color="rgba(255,255,255,0.45)" />
          </View>
          <TouchableOpacity
            onPress={onSkip}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 16, padding: 6 }}
          >
            <Icon name="x" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Contenu bas */}
        <View style={{ position: 'absolute', bottom: 72, left: 20, right: 20 }}>
          {/* Ligne annonceur */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
              <Icon name="zap" size={16} color="#fff" />
            </View>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
              {ad.title}
            </Text>
          </View>
          {ad.description ? (
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20, marginBottom: 18 }} numberOfLines={2}>{ad.description}</Text>
          ) : null}
          {ad.cta_url ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                apiClient.post(`/api/v1/ads/${ad.id}/click`).catch(() => {});
                if (ad.cta_url) Linking.openURL(ad.cta_url).catch(() => {});
                onSkip();
              }}
              style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{ad.cta_text || 'En savoir plus'}</Text>
              <Icon name="chevron-right" size={14} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

// ── StoryOverlaysRenderer — affiche les overlays sauvegardes sur une story ───

interface Overlays {
  textLayers: TextLayer[];
  drawPaths:  DrawPath[];
  masks:      MaskRect[];
  stickers:   StickerLayer[];
}

const StoryOverlaysRenderer: React.FC<{ overlaysJson: string }> = ({ overlaysJson }) => {
  let overlays: Overlays | null = null;
  try { overlays = JSON.parse(overlaysJson) as Overlays; } catch { return null; }
  if (!overlays) return null;

  const { textLayers, drawPaths, masks, stickers } = overlays;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Dessins SVG */}
      {drawPaths.length > 0 && (
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          {drawPaths.map(p => (
            <Path
              key={p.id}
              d={p.d}
              stroke={p.color}
              strokeWidth={p.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      )}

      {/* Masques — coordonnees normalisees 0-1 */}
      {masks.map(m => (
        <View
          key={m.id}
          style={{
            position: 'absolute',
            left: m.x * W, top: m.y * H,
            width: m.w * W, height: m.h * H,
            backgroundColor: m.color ?? '#000000',
            opacity: m.opacity ?? 1,
            borderRadius: 4,
          }}
        />
      ))}

      {/* Textes */}
      {textLayers.map(l => {
        const bgStyle = l.bg === 'none'
          ? {}
          : { backgroundColor: l.bg === 'solid' ? l.bgColor : l.bgColor + 'BB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 };
        return (
          <View
            key={l.id}
            style={[{
              position: 'absolute',
              left: l.x * W,
              top:  l.y * H,
              transform: [{ scale: l.scale }, { rotate: `${l.rotation}rad` }],
            }, bgStyle]}
          >
            <Text style={{
              color:      l.color,
              fontSize:   l.fontSize,
              fontWeight: l.bold ? 'bold' : 'normal',
              textShadowColor:  l.bg === 'none' ? 'rgba(0,0,0,0.7)' : 'transparent',
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 3,
            }}>
              {l.text}
            </Text>
          </View>
        );
      })}

      {/* Stickers */}
      {stickers.map(s => (
        <Text
          key={s.id}
          style={{
            position:  'absolute',
            left:      s.x * W - 24,
            top:       s.y * H - 24,
            fontSize:  42,
            transform: [{ scale: s.scale }, { rotate: `${s.rotation}rad` }],
          }}
        >
          {s.emoji}
        </Text>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export const StoryViewer: React.FC<Props> = ({
  groups, initialGroupIndex, initialStoryIndex, currentUserId,
  onClose, onNavigateToChat, onNavigateToCall,
}) => {
  const { addListener, removeListener } = useWs();
  const isWifi = useIsWifi();
  const insets  = useSafeAreaInsets();

  const [groupIdx,    setGroupIdx]    = useState(initialGroupIndex);
  const [storyIdx,    setStoryIdx]    = useState(initialStoryIndex ?? 0);
  const [paused,      setPaused]      = useState(false);
  type StoryAdInfo = { id: string; title: string; description?: string; cta_text?: string; cta_url?: string; creative_url?: string; thumbnail_url?: string };
  // Une ad par TRANSITION entre groupes (clé = groupIdx qu'on quitte), pas une ad unique
  // réutilisée à chaque changement de créateur — avant, la même pub apparaissait à
  // chaque transition, quel que soit le nombre de stories vues.
  const [adSlots,     setAdSlots]     = useState<Map<number, StoryAdInfo>>(new Map());
  const adSlotsRef    = useRef(adSlots);
  adSlotsRef.current = adSlots;
  const servedStoryAdIdsRef = useRef<Set<string>>(new Set());
  const loadingStoryAdSlotsRef = useRef<Set<number>>(new Set());
  const storyAd = adSlots.get(groupIdx) ?? null;
  const [showStoryAd, setShowStoryAd] = useState(false);
  const storyAdTimerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextGroupIdxRef               = useRef<number>(0); // groupe cible apres la pub

  const loadStoryAdForSlot = useCallback((slotIdx: number, allowRepeat = false) => {
    if (loadingStoryAdSlotsRef.current.has(slotIdx) || adSlotsRef.current.has(slotIdx)) return;
    loadingStoryAdSlotsRef.current.add(slotIdx);
    const excludeIds = allowRepeat ? '' : Array.from(servedStoryAdIdsRef.current).slice(-20).join(',');
    const qs = excludeIds ? `&exclude_ids=${encodeURIComponent(excludeIds)}` : '';
    apiClient.get<StoryAdInfo | null>(`/api/v1/ads/feed/next?placement=stories${qs}`)
      .then(r => {
        loadingStoryAdSlotsRef.current.delete(slotIdx);
        // Stock de pubs actives épuisé pour cette session — recommence le cycle sans
        // exclusion plutôt que de ne plus jamais afficher de pub après épuisement
        // (même raisonnement que ReelsScreen.tsx loadAdForSlot).
        if (!r?.data?.id) {
          if (excludeIds) loadStoryAdForSlot(slotIdx, true);
          return;
        }
        servedStoryAdIdsRef.current.add(r.data.id);
        setAdSlots(prev => {
          const next = new Map(prev);
          next.set(slotIdx, r.data as StoryAdInfo);
          return next;
        });
      })
      .catch(() => { loadingStoryAdSlotsRef.current.delete(slotIdx); });
  }, []);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [editMode,    setEditMode]    = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [viewersOpen,    setViewersOpen]    = useState(false);
  const [viewersTab,     setViewersTab]     = useState<'views' | 'replies'>('views');
  const [viewers,        setViewers]        = useState<StoryViewerUser[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [replies,        setReplies]        = useState<any[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [videoReady,     setVideoReady]     = useState(false);
  const [videoBuffering, setVideoBuffering] = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [liked,       setLiked]       = useState(false);
  const [likeCount,   setLikeCount]   = useState(0);
  const [likeToast,   setLikeToast]   = useState<{ name: string; avatar: string | null } | null>(null);

  // Réponse story (style WhatsApp)
  const [replyText,     setReplyText]     = useState('');
  const [replyFocused,  setReplyFocused]  = useState(false);
  const [replySending,  setReplySending]  = useState(false);
  const [replySent,     setReplySent]     = useState(false);
  const replyInputRef = useRef<any>(null);

  // Cœur flottant style WhatsApp
  const heartAnim   = useRef(new Animated.Value(0)).current;
  const heartScale  = useRef(new Animated.Value(0)).current;
  const lastTapRef  = useRef(0);


  const progressAnim = useRef(new Animated.Value(0)).current;
  const translateY   = useRef(new Animated.Value(0)).current;

  const group    = groups[groupIdx];
  const story    = group?.stories[storyIdx];
  const total    = group?.stories.length ?? 0;
  const duration = (story?.duration_sec ?? 5) * 1000;
  const isOwn    = !!currentUserId && story?.user_id === currentUserId;
  const accent   = TYPE_COLOR[story?.media_type ?? 'image'] ?? '#7B3FF2';

  // ── Video ──────────────────────────────────────────────────────────────────


  // ── Prefetch — stories + groupes en avance (portée réduite hors wifi) ───────

  useEffect(() => {
    const urls: string[] = [];
    const curStories = groups[groupIdx]?.stories ?? [];

    // Toutes les stories restantes du groupe courant
    for (let i = storyIdx + 1; i < curStories.length; i++) {
      const st = curStories[i];
      if (st?.media_url && st.media_type === 'image') urls.push(st.media_url);
    }
    // Groupes suivants — uniquement en wifi (2 groupes), sinon seulement le prochain
    const aheadLimit = isWifi ? groupIdx + 2 : groupIdx + 1;
    for (let g = groupIdx + 1; g <= Math.min(aheadLimit, groups.length - 1); g++) {
      for (const st of groups[g]?.stories ?? []) {
        if (st.media_url && st.media_type === 'image') urls.push(st.media_url);
      }
    }
    // Groupe précédent (navigation retour) — uniquement en wifi
    if (isWifi && groupIdx > 0) {
      for (const st of groups[groupIdx - 1]?.stories ?? []) {
        if (st.media_url && st.media_type === 'image') urls.push(st.media_url);
      }
    }

    // Prefetch images en arrière-plan — jamais de vidéo via Image.prefetch
    urls.forEach(url => { Image.prefetch(url).catch(() => {}); });
  }, [storyIdx, groupIdx, isWifi]);

  // ── Charger la pub du groupe courant, et précharger celle du suivant en avance
  // pour qu'elle soit prête avant la transition (jamais la même pub deux fois). ────
  useEffect(() => {
    loadStoryAdForSlot(groupIdx);
    loadStoryAdForSlot(groupIdx + 1);
    return () => { if (storyAdTimerRef.current) clearTimeout(storyAdTimerRef.current); };
  }, [groupIdx, loadStoryAdForSlot]);

  // ── Mark viewed ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (story && !isOwn) storyService.markViewed(story.id, story);
  }, [story?.id]);

  // ── Saved state ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (story?.id) setSaved(saveService.isStorySaved(story.id));
  }, [story?.id]);

  const handleSave = useCallback(() => {
    if (!story) return;
    if (saved) { saveService.unsaveStory(story.id); setSaved(false); }
    else       { saveService.saveStory(story);      setSaved(true); }
  }, [story, saved]);

  // ── Like state — reset à chaque story ────────────────────────────────────

  useEffect(() => {
    setLiked(story?.liked_by_me ?? false);
    setLikeCount(story?.like_count ?? 0);
  }, [story?.id]);

  // ── WS : écoute story_liked (propriétaire reçoit la notif) ───────────────

  useEffect(() => {
    const handler = (payload: any) => {
      if (payload.type !== 'story_liked') return;
      if (payload.story_id === story?.id) {
        setLikeCount(payload.like_count ?? 0);
        setLikeToast({ name: payload.liker_display_name ?? payload.liker_username ?? 'Quelqu\'un', avatar: payload.liker_avatar ?? null });
        setTimeout(() => setLikeToast(null), 3000);
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [story?.id, addListener, removeListener]);

  // ── Double-tap like ───────────────────────────────────────────────────────

  const showHeartAnim = useCallback(() => {
    heartScale.setValue(0);
    heartAnim.setValue(0);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(heartAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, [heartAnim, heartScale]);

  const handleLikeBtn = useCallback(() => {
    if (!story || isOwn) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    if (newLiked) showHeartAnim();
    storyService.like(story.id).catch(() => {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    });
  }, [story, liked, isOwn, showHeartAnim]);

  const handleReplyFocus = useCallback(() => {
    setReplyFocused(true);
    setPaused(true);
  }, []);

  const handleReplyBlur = useCallback(() => {
    setReplyFocused(false);
    if (!replyText.trim()) setPaused(false);
  }, [replyText]);

  const handleSendReply = useCallback(async () => {
    if (!story || !replyText.trim() || replySending) return;
    setReplySending(true);
    try {
      await storyService.reply(story.id, replyText.trim());
      setReplyText('');
      setReplyFocused(false);
      setReplySent(true);
      setPaused(false);
      setTimeout(() => setReplySent(false), 2500);
    } catch {
      // silencieux — le DM échoue, on ne bloque pas l'UX
    } finally {
      setReplySending(false);
    }
  }, [story, replyText, replySending]);

  // ── Audio ──────────────────────────────────────────────────────────────────

  const stopAudio = useCallback(async () => {
    try { await audioPlayer.stopPlayer(); audioPlayer.removePlayBackListener(); } catch {}
  }, []);

  useEffect(() => {
    if (story?.audio_url && !paused) {
      audioPlayer.startPlayer(story.audio_url!).catch(() => {});
      audioPlayer.addPlayBackListener(() => {});
    } else {
      stopAudio();
    }
    return () => { stopAudio(); };
  }, [story?.id, paused]);

  // ── Reset videoReady on story change ──────────────────────────────────────

  useEffect(() => {
    setVideoBuffering(false);
    setPaused(false); // force resume a chaque changement de story
    if (story?.media_type === 'video') setVideoReady(false);
    else setVideoReady(true);
  }, [story?.id, storyIdx, groupIdx]);  // reset aussi sur changement de groupe

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    setPaused(false); // force resume
    if (storyIdx < total - 1) {
      setStoryIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      const nextGroup = groupIdx + 1;
      if (storyAd) {
        // Afficher la pub puis passer au groupe suivant
        nextGroupIdxRef.current = nextGroup;
        setPaused(true);
        setShowStoryAd(true);
        apiClient.post(`/api/v1/ads/${storyAd.id}/impression`).catch(() => {});
        if (storyAdTimerRef.current) clearTimeout(storyAdTimerRef.current);
        storyAdTimerRef.current = setTimeout(() => {
          setShowStoryAd(false);
          setPaused(false);
          setGroupIdx(nextGroupIdxRef.current);
          setStoryIdx(0);
        }, 5000);
      } else {
        setGroupIdx(nextGroup); setStoryIdx(0);
      }
    } else {
      onClose();
    }
  }, [storyIdx, total, groupIdx, groups.length, storyAd]);

  // ── Progress ───────────────────────────────────────────────────────────────

  const goNextRef = useRef(goNext);
  useEffect(() => { goNextRef.current = goNext; }, [goNext]);

  const startProgress = useCallback(() => {
    progressAnim.stopAnimation();   // stopper toute animation en cours avant de redémarrer
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1, duration,
      useNativeDriver: false,       // width% ne supporte pas native driver
    }).start(({ finished }) => { if (finished) goNextRef.current(); });
  }, [duration]);                   // plus de storyIdx/groupIdx → callback stable

  useEffect(() => {
    if (!paused && !menuOpen && !editMode && videoReady && !videoBuffering) startProgress();
    else progressAnim.stopAnimation();
  }, [storyIdx, groupIdx, paused, menuOpen, editMode, videoReady, videoBuffering]);

  const goPrev = useCallback(() => {
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    setPaused(false); // force resume — evite que la story reste figee
    if (storyIdx > 0) { setStoryIdx(i => i - 1); }
    else if (groupIdx > 0) {
      setGroupIdx(g => g - 1);
      setStoryIdx(groups[groupIdx - 1].stories.length - 1);
    }
  }, [storyIdx, groupIdx, groups]);

  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTapRight = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      if (!isOwn && story && !liked) {
        setLiked(true);
        setLikeCount(c => c + 1);
        showHeartAnim();
        storyService.like(story.id).catch(() => {
          setLiked(false);
          setLikeCount(c => Math.max(0, c - 1));
        });
      }
    } else {
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        goNext();
      }, 280);
    }
    lastTapRef.current = now;
  }, [story, liked, isOwn, showHeartAnim, goNext]);

  // ── Swipe vertical (fermer) + horizontal (changer de groupe) ─────────────────

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 10 || Math.abs(gs.dx) > 15,
      onPanResponderGrant: () => setPaused(true),
      onPanResponderMove: (_, gs) => {
        // Swipe vertical → translateY (fermer)
        if (Math.abs(gs.dy) > Math.abs(gs.dx) && gs.dy > 0) {
          translateY.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        const isHorizontal = Math.abs(gs.dx) > Math.abs(gs.dy);
        if (isHorizontal) {
          // Swipe gauche → groupe suivant
          if (gs.dx < -60 && groupIdx < groups.length - 1) {
            progressAnim.stopAnimation();
            stopAudio();
            setGroupIdx(g => g + 1);
            setStoryIdx(0);
            return;
          }
          // Swipe droite → groupe précédent
          if (gs.dx > 60 && groupIdx > 0) {
            progressAnim.stopAnimation();
            stopAudio();
            setGroupIdx(g => g - 1);
            setStoryIdx(0);
            return;
          }
          setPaused(false);
        } else if (gs.dy > 120) {
          stopAudio();
          Animated.timing(translateY, { toValue: H, duration: 200, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start(() => setPaused(false));
        }
      },
    })
  ).current;

  // ── Own story actions ──────────────────────────────────────────────────────

  const handleDelete = () => {
    setMenuOpen(false);
    showConfirm('Supprimer', 'Supprimer cette story ?', [
      { text: 'Annuler', style: 'cancel', onPress: () => setPaused(false) },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await storyService.delete(story.id);
            if (total > 1) setStoryIdx(storyIdx < total - 1 ? storyIdx : storyIdx - 1);
            else { stopAudio(); onClose(); }
          } catch {}
        },
      },
    ]);
  };

  const handleEditOpen = () => {
    setMenuOpen(false);
    setEditCaption(story.caption ?? '');
    setEditMode(true);
  };

  const handleEditSave = async () => {
    try {
      await storyService.edit(story.id, { caption: editCaption || undefined });
      story.caption = editCaption || null;
    } catch {}
    setEditMode(false); setPaused(false);
  };

  const openViewers = async (tab: 'views' | 'replies' = 'views') => {
    setPaused(true);
    setViewersOpen(true);
    setViewersTab(tab);
    if (tab === 'views') {
      setViewersLoading(true);
      try { setViewers(await storyService.getViewers(story.id)); }
      catch { setViewers([]); }
      finally { setViewersLoading(false); }
    } else {
      setRepliesLoading(true);
      try { setReplies(await storyService.getReplies(story.id)); }
      catch { setReplies([]); }
      finally { setRepliesLoading(false); }
    }
  };

  const switchViewersTab = async (tab: 'views' | 'replies') => {
    setViewersTab(tab);
    if (tab === 'views' && viewers.length === 0) {
      setViewersLoading(true);
      try { setViewers(await storyService.getViewers(story.id)); }
      catch { setViewers([]); }
      finally { setViewersLoading(false); }
    } else if (tab === 'replies' && replies.length === 0) {
      setRepliesLoading(true);
      try { setReplies(await storyService.getReplies(story.id)); }
      catch { setReplies([]); }
      finally { setRepliesLoading(false); }
    }
  };

  const closeViewers = () => { setViewersOpen(false); setViewersTab('views'); setPaused(false); };

  // Si storyIdx hors limites (stories supprimees/expirees), aller a la premiere disponible
  if (!group || !group.user) return null;
  if (!story) {
    if (group.stories.length > 0) {
      // Corriger l'index silencieusement
      setStoryIdx(0);
      return null;
    }
    // Groupe vide → passer au suivant ou fermer
    if (groupIdx < groups.length - 1) {
      setGroupIdx(g => g + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
    return null;
  }

  const author = group.user;
  const timeAgo = (() => {
    const diff = (Date.now() - new Date(story.created_at).getTime()) / 1000;
    if (diff < 60)   return 'A l\'instant';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    return `${Math.floor(diff / 3600)} h`;
  })();

  // ── Render ─────────────────────────────────────────────────────────────────

  // Slide pub entre groupes — avec lecture video si HLS
  if (showStoryAd && storyAd) {
    return <StoryAdSlide ad={storyAd} onSkip={() => {
      if (storyAdTimerRef.current) clearTimeout(storyAdTimerRef.current);
      setShowStoryAd(false);
      setPaused(false);
      setGroupIdx(nextGroupIdxRef.current);
      setStoryIdx(0);
    }} />;
  }

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => { stopAudio(); onClose(); }}>
      <Animated.View style={[s.root, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <StatusBar hidden translucent backgroundColor="transparent" />

        {/* ── Préchargeurs vidéo invisibles ─────────────────────────────────────
            Wifi : story suivante + 2 premiers groupes suivants + groupe précédent.
            Hors wifi : uniquement la story suivante immédiate — préchargement des
            groupes est un pur confort visuel, pas une nécessité, et coûtait jusqu'à
            4 vidéos entières téléchargées en données mobiles pour rien. */}
        {group.stories[storyIdx + 1]?.media_type === 'video' && group.stories[storyIdx + 1]?.media_url && (
          <VideoPreloader key={`cur-next-${group.stories[storyIdx + 1].id}`} uri={group.stories[storyIdx + 1].mp4_url ?? group.stories[storyIdx + 1].media_url!} />
        )}
        {isWifi && [groupIdx + 1, groupIdx + 2].map(gi => {
          const g = groups[gi];
          const st = g?.stories[0];
          if (!st || st.media_type !== 'video' || !st.media_url) return null;
          return <VideoPreloader key={`grp-${gi}-${st.id}`} uri={st.mp4_url ?? st.media_url!} />;
        })}
        {isWifi && groupIdx > 0 && (() => {
          const prev = groups[groupIdx - 1];
          const lastSt = prev?.stories[prev.stories.length - 1];
          if (!lastSt || lastSt.media_type !== 'video' || !lastSt.media_url) return null;
          return <VideoPreloader key={`prev-${lastSt.id}`} uri={lastSt.mp4_url ?? lastSt.media_url!} />;
        })()}

        {/* ── Media ─────────────────────────────────────────────────────── */}
        {story.media_type === 'text' && (
          <View style={[s.media, { backgroundColor: story.background_color ?? '#7B3FF2' }]} />
        )}
        {story.media_type === 'image' && story.media_url && (
          <StoryImageView uri={story.media_url} bgColor={story.background_color ?? undefined} />
        )}
        {story.media_type === 'video' && story.media_url && (
          <StoryVideoView
            key={story.id}
            uri={story.mp4_url ?? story.media_url}
            paused={paused}
            onReady={() => setVideoReady(true)}
            onBuffering={setVideoBuffering}
            thumbnail={story.thumbnail_url ?? null}
          />
        )}
        {(story.media_type === 'image' || story.media_type === 'video') &&
          story.filter_overlay_color && (story.filter_overlay_opacity ?? 0) > 0 && (
          <View
            style={[StyleSheet.absoluteFill, {
              backgroundColor: story.filter_overlay_color,
              opacity: story.filter_overlay_opacity!,
            }]}
            pointerEvents="none"
          />
        )}
        {!!story.overlays_json && (
          <StoryOverlaysRenderer overlaysJson={story.overlays_json} />
        )}
        {story.media_type === 'audio' && (
          <LinearGradient colors={[story.background_color ?? '#FF9800', '#000']} style={s.media}>
            <View style={s.mediaCenter}>
              <MaterialIcon name="music-note-outline" size={100} color="rgba(255,255,255,0.1)" />
            </View>
          </LinearGradient>
        )}
        {story.media_type === 'voice' && (
          <LinearGradient colors={['#0F0C29', '#302B63']} style={s.media}>
            <View style={s.mediaCenter}>
              <MaterialIcon name="microphone-outline" size={100} color="rgba(255,255,255,0.1)" />
            </View>
          </LinearGradient>
        )}

        {/* ── Gradients UI ──────────────────────────────────────────────── */}
        <LinearGradient colors={['rgba(0,0,0,0.72)', 'transparent']} style={s.gradTop}    pointerEvents="none" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={s.gradBottom} pointerEvents="none" />

        {/* ── Barres de progression ──────────────────────────────────────── */}
        <View style={s.barsRow}>
          {group.stories.map((_, i) => (
            <View key={i} style={[s.barBg, { flex: 1 }]}>
              <Animated.View style={[s.barFill, { backgroundColor: accent, width: i < storyIdx ? '100%' : i === storyIdx ? progressAnim.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }) : '0%' }]} />
            </View>
          ))}
        </View>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={s.header}>
          {/* Auteur */}
          <View style={s.authorRow}>
            <View style={[s.avatarRing, { borderColor: accent }]}>
              {author.avatar_url
                ? <Image source={{ uri: author.avatar_url }} style={s.avatar} />
                : <View style={[s.avatarFallback, { backgroundColor: accent }]}>
                    <Text style={s.avatarLetter}>{(author.display_name ?? author.username)[0].toUpperCase()}</Text>
                  </View>
              }
            </View>
            <View>
              <Text style={s.authorName}>{author.display_name ?? author.username}</Text>
              <View style={s.metaRow}>
                <View style={[s.typeDot, { backgroundColor: accent }]} />
                <Text style={s.timeAgo}>{timeAgo}</Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={s.headerRight}>
            {isOwn ? (
              <TouchableOpacity onPress={() => { setPaused(true); setMenuOpen(true); }} style={s.hBtn}>
                <Icon name="more-horizontal" size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleSave} style={s.hBtn}>
                <Icon name="bookmark" size={19} color={saved ? '#FFD700' : '#fff'} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { stopAudio(); onClose(); }} style={[s.hBtn, s.hBtnClose]}>
              <Icon name="x" size={19} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Caption ───────────────────────────────────────────────────── */}
        {story.caption ? (
          <View style={story.media_type === 'text' ? s.captionCenter : s.captionBottom} pointerEvents="none">
            <View style={story.media_type !== 'text' ? s.captionPill : undefined}>
              <Text style={[
                s.captionText,
                story.media_type === 'text' && {
                  fontSize:   story.caption.length > 100 ? 18 : story.caption.length > 50 ? 24 : 30,
                  ...(FONT_MAP[story.font_style ?? 'classic'] ?? FONT_MAP.classic),
                },
              ]}>
                {story.caption}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Music widget ───────────────────────────────────────────────── */}
        {story.audio_url && (
          <MusicWidget
            audioUrl={story.audio_url}
            audioName={story.audio_name}
            accent={accent}
            playing={!paused}
            mediaType={story.media_type}
          />
        )}

        {/* ── Tap zones (double-tap = like) ─────────────────────────────── */}
        <View style={s.tapZones} pointerEvents="box-none">
          <TouchableWithoutFeedback
            onPress={goPrev}
            onPressIn={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          >
            <View style={s.tapLeft} />
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback
            onPress={handleTapRight}
            onPressIn={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          >
            <View style={s.tapRight} />
          </TouchableWithoutFeedback>
        </View>

        {/* ── Cœur flottant (double-tap) ────────────────────────────────── */}
        <Animated.View
          pointerEvents="none"
          style={[
            s.floatingHeart,
            {
              opacity: heartAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1, 0] }),
              transform: [
                { scale: heartScale },
                { translateY: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
              ],
            },
          ]}
        >
          <Text style={{ fontSize: 72 }}>❤️</Text>
        </Animated.View>

        {/* ── Bouton like (story des autres) + bouton vues (propre story) ── */}
        {/* ── Avatars navigation groupes (sauter d'une personne à l'autre) ── */}
        {groups.length > 1 && !viewersOpen && !menuOpen && !editMode && !replyFocused && (
          <View style={s.groupNav} pointerEvents="box-none">
            {/* Groupe précédent */}
            {groupIdx > 0 && (() => {
              const prev = groups[groupIdx - 1];
              return (
                <TouchableOpacity
                  style={s.groupNavBtn}
                  onPress={() => { progressAnim.stopAnimation(); stopAudio(); setGroupIdx(g => g - 1); setStoryIdx(0); }}
                  activeOpacity={0.8}
                >
                  <Icon name="chevron-left" size={14} color="rgba(255,255,255,0.7)" />
                  {prev.user?.avatar_url
                    ? <Animated.Image source={{ uri: prev.user.avatar_url }} style={s.groupNavAvatar} />
                    : <View style={[s.groupNavAvatar, s.groupNavAvatarFallback]}>
                        <Text style={s.groupNavInitial}>
                          {(prev.user?.display_name || prev.user?.username || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                  }
                  <Text style={s.groupNavName} numberOfLines={1}>
                    {prev.user?.display_name || prev.user?.username}
                  </Text>
                </TouchableOpacity>
              );
            })()}

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* Groupe suivant */}
            {groupIdx < groups.length - 1 && (() => {
              const next = groups[groupIdx + 1];
              return (
                <TouchableOpacity
                  style={[s.groupNavBtn, { flexDirection: 'row-reverse' }]}
                  onPress={() => { progressAnim.stopAnimation(); stopAudio(); setGroupIdx(g => g + 1); setStoryIdx(0); }}
                  activeOpacity={0.8}
                >
                  <Icon name="chevron-right" size={14} color="rgba(255,255,255,0.7)" />
                  {next.user?.avatar_url
                    ? <Animated.Image source={{ uri: next.user.avatar_url }} style={s.groupNavAvatar} />
                    : <View style={[s.groupNavAvatar, s.groupNavAvatarFallback]}>
                        <Text style={s.groupNavInitial}>
                          {(next.user?.display_name || next.user?.username || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                  }
                  <Text style={s.groupNavName} numberOfLines={1}>
                    {next.user?.display_name || next.user?.username}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        )}

        <View style={s.bottomBar}>
          {/* Pluie de cœurs + défilement des noms qui aiment — story très aimée */}
          <HeartRain active={!paused} likeCount={likeCount} contentId={story.id} />
          <LikeNamesFeed active={!paused} likeCount={likeCount} contentId={story.id} kind="story" />

          {isOwn ? (
            <TouchableOpacity style={s.viewsBtn} onPress={() => openViewers('views')} activeOpacity={0.8}>
              <Icon name="eye" size={14} color="#fff" />
              <Text style={s.viewsBtnText}>{story.view_count ?? 0} vue{(story.view_count ?? 0) !== 1 ? 's' : ''}</Text>
              {likeCount > 0 && (
                <>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', marginHorizontal: 4 }}>·</Text>
                  <Icon name="heart" size={14} color="#E0389A" />
                  <Text style={s.viewsBtnText}>{likeCount}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.likeBtn} onPress={handleLikeBtn} activeOpacity={0.8}>
              <Icon name="heart" size={22} color={liked ? '#E0389A' : '#fff'} />
              {likeCount > 0 && (
                <Text style={[s.likeBtnText, { color: liked ? '#E0389A' : '#fff' }]}>{likeCount}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Champ réponse story (style WhatsApp) — uniquement pour les autres ── */}
        {!isOwn && !viewersOpen && !menuOpen && !editMode && (
          <View style={s.replyBar} pointerEvents="box-none">
            <TouchableOpacity
              style={[s.replyInput, replyFocused && s.replyInputFocused]}
              activeOpacity={1}
              onPress={() => replyInputRef.current?.focus()}
            >
              <TextInput
                ref={replyInputRef}
                style={s.replyInputText}
                placeholder={`Répondre à ${group?.user?.display_name ?? group?.user?.username ?? ''}…`}
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={replyText}
                onChangeText={setReplyText}
                onFocus={handleReplyFocus}
                onBlur={handleReplyBlur}
                returnKeyType="send"
                onSubmitEditing={handleSendReply}
                multiline={false}
                maxLength={500}
              />
            </TouchableOpacity>

            {!replyFocused && !replyText && (
              <TouchableOpacity style={s.replyEmoji} onPress={() => { setReplyText('❤️'); }}>
                <Text style={{ fontSize: 24 }}>❤️</Text>
              </TouchableOpacity>
            )}

            {(replyText.trim().length > 0 || replyFocused) && (
              <TouchableOpacity
                style={[s.replySendBtn, { opacity: replySending ? 0.5 : 1 }]}
                onPress={handleSendReply}
                disabled={replySending || !replyText.trim()}
              >
                {replySending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Icon name="send" size={18} color="#fff" />
                }
              </TouchableOpacity>
            )}
          </View>
        )}

        {replySent && (
          <View style={s.replySentToast} pointerEvents="none">
            <Icon name="check-circle" size={14} color="#25D366" />
            <Text style={s.replySentText}>Message envoyé</Text>
          </View>
        )}

        {/* ── Toast like reçu (propriétaire) ───────────────────────────── */}
        {likeToast && (
          <View style={s.likeToast} pointerEvents="none">
            {likeToast.avatar ? (
              <Image source={{ uri: likeToast.avatar }} style={s.likeToastAvatar} />
            ) : (
              <View style={[s.likeToastAvatar, { backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{likeToast.name[0].toUpperCase()}</Text>
              </View>
            )}
            <Text style={s.likeToastText}>
              <Text style={{ fontWeight: '800' }}>{likeToast.name}</Text> a aimé ta story ❤️
            </Text>
          </View>
        )}

        {/* ── Panel vues + réponses ─────────────────────────────────────── */}
        {viewersOpen && (
          <TouchableWithoutFeedback onPress={closeViewers}>
            <View style={s.sheetOverlay}>
              <TouchableWithoutFeedback>
                <View style={[s.viewersPanel, { paddingBottom: 36 + insets.bottom }]}>
                  <View style={s.panelHandle} />

                  {/* Onglets */}
                  <View style={s.panelTabs}>
                    <TouchableOpacity
                      style={[s.panelTab, viewersTab === 'views' && { borderBottomColor: accent }]}
                      onPress={() => switchViewersTab('views')}
                    >
                      <Icon name="eye" size={14} color={viewersTab === 'views' ? accent : 'rgba(255,255,255,0.4)'} />
                      <Text style={[s.panelTabText, { color: viewersTab === 'views' ? accent : 'rgba(255,255,255,0.4)' }]}>
                        Vues{viewers.length > 0 ? ` (${viewers.length})` : ''}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.panelTab, viewersTab === 'replies' && { borderBottomColor: accent }]}
                      onPress={() => switchViewersTab('replies')}
                    >
                      <Icon name="message-circle" size={14} color={viewersTab === 'replies' ? accent : 'rgba(255,255,255,0.4)'} />
                      <Text style={[s.panelTabText, { color: viewersTab === 'replies' ? accent : 'rgba(255,255,255,0.4)' }]}>
                        Réponses{replies.length > 0 ? ` (${replies.length})` : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Contenu onglet Vues */}
                  {viewersTab === 'views' && (
                    viewersLoading ? (
                      <GoFolyXLoader color={accent} height={2} />
                    ) : viewers.length === 0 ? (
                      <View style={s.emptyBox}>
                        <Icon name="eye-off" size={38} color="rgba(255,255,255,0.2)" />
                        <Text style={s.emptyText}>Aucune vue pour l'instant</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={viewers}
                        keyExtractor={v => v.id}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item: v }) => {
                          const vName = v.display_name ?? v.username ?? 'Utilisateur';
                          const vTime = (() => {
                            const d = (Date.now() - new Date(v.viewed_at).getTime()) / 1000;
                            if (d < 60) return 'A l\'instant';
                            if (d < 3600) return `${Math.floor(d / 60)} min`;
                            if (d < 86400) return `${Math.floor(d / 3600)} h`;
                            return `${Math.floor(d / 86400)} j`;
                          })();
                          return (
                            <View style={s.viewerRow}>
                              {v.avatar_url
                                ? <Image source={{ uri: v.avatar_url }} style={s.viewerAvatar} />
                                : <View style={[s.viewerAvatarFallback, { backgroundColor: accent }]}>
                                    <Text style={s.viewerAvatarLetter}>{vName[0].toUpperCase()}</Text>
                                  </View>
                              }
                              <View style={s.viewerInfo}>
                                <Text style={s.viewerName}>{vName}</Text>
                                <Text style={s.viewerMeta}>@{v.username} · {vTime}</Text>
                              </View>
                              <View style={s.viewerActions}>
                                <TouchableOpacity
                                  style={s.vActBtn}
                                  onPress={() => { closeViewers(); onNavigateToChat?.(v.id, vName, v.avatar_url ?? undefined); }}
                                >
                                  <Icon name="message-circle" size={16} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[s.vActBtn, { backgroundColor: '#25D366' }]}
                                  onPress={() => { closeViewers(); onNavigateToCall?.(v.id, vName, 'voice', v.avatar_url ?? undefined); }}
                                >
                                  <Icon name="phone" size={16} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[s.vActBtn, { backgroundColor: accent }]}
                                  onPress={() => { closeViewers(); onNavigateToCall?.(v.id, vName, 'video', v.avatar_url ?? undefined); }}
                                >
                                  <Icon name="video" size={16} color="#fff" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        }}
                      />
                    )
                  )}

                  {/* Contenu onglet Réponses */}
                  {viewersTab === 'replies' && (
                    repliesLoading ? (
                      <GoFolyXLoader color={accent} height={2} />
                    ) : replies.length === 0 ? (
                      <View style={s.emptyBox}>
                        <Icon name="message-circle" size={38} color="rgba(255,255,255,0.2)" />
                        <Text style={s.emptyText}>Aucune réponse pour l'instant</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={replies}
                        keyExtractor={r => r.id}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item: r }) => {
                          const rName = r.sender?.display_name ?? r.sender?.username ?? 'Utilisateur';
                          const rTime = (() => {
                            const d = (Date.now() - new Date(r.created_at).getTime()) / 1000;
                            if (d < 60) return 'A l\'instant';
                            if (d < 3600) return `${Math.floor(d / 60)} min`;
                            if (d < 86400) return `${Math.floor(d / 3600)} h`;
                            return `${Math.floor(d / 86400)} j`;
                          })();
                          return (
                            <View style={s.viewerRow}>
                              {r.sender?.avatar_url
                                ? <Image source={{ uri: r.sender.avatar_url }} style={s.viewerAvatar} />
                                : <View style={[s.viewerAvatarFallback, { backgroundColor: accent }]}>
                                    <Text style={s.viewerAvatarLetter}>{rName[0].toUpperCase()}</Text>
                                  </View>
                              }
                              <View style={s.viewerInfo}>
                                <Text style={s.viewerName}>{rName}</Text>
                                <Text style={s.replyContent} numberOfLines={2}>{r.content}</Text>
                                <Text style={s.viewerMeta}>{rTime}</Text>
                              </View>
                              <View style={s.viewerActions}>
                                <TouchableOpacity
                                  style={s.vActBtn}
                                  onPress={() => { closeViewers(); onNavigateToChat?.(r.sender.id, rName, r.sender?.avatar_url ?? undefined); }}
                                >
                                  <Icon name="message-circle" size={16} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[s.vActBtn, { backgroundColor: '#25D366' }]}
                                  onPress={() => { closeViewers(); onNavigateToCall?.(r.sender.id, rName, 'voice', r.sender?.avatar_url ?? undefined); }}
                                >
                                  <Icon name="phone" size={16} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[s.vActBtn, { backgroundColor: accent }]}
                                  onPress={() => { closeViewers(); onNavigateToCall?.(r.sender.id, rName, 'video', r.sender?.avatar_url ?? undefined); }}
                                >
                                  <Icon name="video" size={16} color="#fff" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        }}
                      />
                    )
                  )}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        )}

        {/* ── Menu actions ──────────────────────────────────────────────── */}
        {menuOpen && (
          <TouchableWithoutFeedback onPress={() => { setMenuOpen(false); setPaused(false); }}>
            <View style={s.sheetOverlay}>
              <View style={[s.menuSheet, { paddingBottom: 34 + insets.bottom }]}>
                <View style={s.panelHandle} />
                <TouchableOpacity style={s.menuItem} onPress={handleEditOpen}>
                  <View style={[s.menuIconBox, { backgroundColor: '#7B3FF226' }]}>
                    <Icon name="edit-2" size={16} color="#7B3FF2" />
                  </View>
                  <Text style={s.menuText}>Modifier la legende</Text>
                  <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
                <TouchableOpacity style={s.menuItem} onPress={handleDelete}>
                  <View style={[s.menuIconBox, { backgroundColor: 'rgba(255,68,68,0.15)' }]}>
                    <Icon name="trash-2" size={16} color="#FF4444" />
                  </View>
                  <Text style={[s.menuText, { color: '#FF4444' }]}>Supprimer la story</Text>
                  <Icon name="chevron-right" size={16} color="rgba(255,68,68,0.3)" />
                </TouchableOpacity>
                <TouchableOpacity style={[s.menuItem, s.menuCancel]} onPress={() => { setMenuOpen(false); setPaused(false); }}>
                  <Text style={s.menuCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        )}

        {/* ── Modal edition caption ──────────────────────────────────────── */}
        <Modal visible={editMode} transparent animationType="slide">
          <View style={s.editOverlay}>
            <View style={[s.editSheet, { paddingBottom: 36 + insets.bottom }]}>
              <View style={s.panelHandle} />
              <Text style={s.editTitle}>Modifier la legende</Text>
              <TextInput
                style={s.editInput}
                value={editCaption}
                onChangeText={setEditCaption}
                placeholder="Ecrire une legende..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                multiline autoFocus
              />
              <View style={s.editBtns}>
                <TouchableOpacity style={s.editCancelBtn} onPress={() => { setEditMode(false); setPaused(false); }}>
                  <Text style={s.editCancelText}>Annuler</Text>
                </TouchableOpacity>
                <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.editSaveGrad}>
                  <TouchableOpacity onPress={handleEditSave}>
                    <Text style={s.editSaveText}>Enregistrer</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>
          </View>
        </Modal>

      </Animated.View>
    </Modal>
  );
};

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  media:  { width: W, height: H },
  mediaCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bufferOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 20,
  },

  gradTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 },

  // ── Progress bars ────────────────────────────────────────────────────────────
  barsRow: {
    position: 'absolute', top: Platform.OS === 'android' ? 46 : 52,
    left: 10, right: 10,
    flexDirection: 'row', gap: 4, zIndex: 10,
  },
  barBg:   { height: 2.5, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },

  // ── Header ────────────────────────────────────────────────────────────────────
  header: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 58 : 64,
    left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 10,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarRing: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar:        { width: 38, height: 38, borderRadius: 19 },
  avatarFallback:{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarLetter:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  authorName:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  typeDot:       { width: 5, height: 5, borderRadius: 3 },
  timeAgo:       { color: 'rgba(255,255,255,0.65)', fontSize: 11 },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.3)' },
  hBtnClose:   { backgroundColor: 'rgba(255,255,255,0.15)' },

  // ── Caption ───────────────────────────────────────────────────────────────────
  captionCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28,
  },
  captionBottom: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 150 : 136, left: 16, right: 16,
  },
  captionPill: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  captionText: {
    color: '#fff', fontSize: 15, fontWeight: '500', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // ── Tap zones ─────────────────────────────────────────────────────────────────
  tapZones: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', zIndex: 5 },
  tapLeft:  { flex: 1 },
  tapRight: { flex: 2 },

  // ── Navigation groupes ─────────────────────────────────────────────────────────
  groupNav: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 138 : 124,
    left: 0, right: 0, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, zIndex: 8,
  },
  groupNavBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 10,
    maxWidth: 140,
  },
  groupNavAvatar:       { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  groupNavAvatarFallback:{ backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  groupNavInitial:      { color: '#fff', fontSize: 11, fontWeight: '800' },
  groupNavName:         { color: '#fff', fontSize: 11, fontWeight: '600', maxWidth: 70 },

  // ── Bottom bar (like / views) ─────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 76, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', zIndex: 8,
  },
  viewsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  viewsBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  likeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24,
  },
  likeBtnText: { fontSize: 13, fontWeight: '800' },

  // ── Floating heart ────────────────────────────────────────────────────────────
  floatingHeart: {
    position: 'absolute',
    bottom: H * 0.3,
    alignSelf: 'center',
    zIndex: 30,
  },

  // ── Like toast ────────────────────────────────────────────────────────────────
  likeToast: {
    position: 'absolute', top: Platform.OS === 'android' ? 110 : 120,
    left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
    zIndex: 40,
  },
  likeToastAvatar: { width: 32, height: 32, borderRadius: 16 },
  likeToastText:   { color: '#fff', fontSize: 13, flex: 1 },

  // ── Sheets ────────────────────────────────────────────────────────────────────
  sheetOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', zIndex: 20,
  },
  panelHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 10, marginBottom: 12,
  },

  // ── Viewers panel ─────────────────────────────────────────────────────────────
  viewersPanel: {
    backgroundColor: '#12121E', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: H * 0.75,
  },
  viewersPanelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  viewersPanelTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Onglets Vues / Réponses
  panelTabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  panelTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  panelTabActive: {
    borderBottomColor: 'transparent',
  },
  panelTabText: { fontSize: 13, fontWeight: '700' },
  replyContent:  { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2, lineHeight: 17 },
  emptyBox: { alignItems: 'center', paddingVertical: 44, gap: 12 },
  emptyText:{ color: 'rgba(255,255,255,0.35)', fontSize: 14 },

  viewerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  viewerAvatar:        { width: 44, height: 44, borderRadius: 22 },
  viewerAvatarFallback:{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  viewerAvatarLetter:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  viewerInfo:          { flex: 1 },
  viewerName:          { color: '#fff', fontSize: 14, fontWeight: '600' },
  viewerMeta:          { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  viewerActions:       { flexDirection: 'row', gap: 8 },
  vActBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Menu actions ──────────────────────────────────────────────────────────────
  menuSheet: {
    backgroundColor: '#12121E', borderTopLeftRadius: 22, borderTopRightRadius: 22,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  menuIconBox: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuText:    { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
  menuCancel:  { justifyContent: 'center', marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  menuCancelText: { flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '500' },

  // ── Edit modal ────────────────────────────────────────────────────────────────
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  editSheet:   { backgroundColor: '#12121E', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20 },
  editTitle:   { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 16 },
  editInput:   {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14,
    color: '#fff', fontSize: 15, padding: 14, minHeight: 90, textAlignVertical: 'top',
  },
  editBtns:       { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  editCancelBtn:  { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  editCancelText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  editSaveGrad:   { borderRadius: 12, overflow: 'hidden', paddingHorizontal: 22, paddingVertical: 12 },
  editSaveText:   { color: '#fff', fontWeight: '800' },

  // ── Reply bar (style WhatsApp) ────────────────────────────────────────────────
  replyBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 20,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 15,
  },
  replyInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    minHeight: 44,
  },
  replyInputFocused: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  replyInputText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  replyEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySentToast: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 50,
  },
  replySentText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

// ── MusicWidget styles ──────────────────────────────────────────────────────
const mw = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 110,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  glow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -10,
    alignSelf: 'center',
  },
  vinylWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  vinyl: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  vinylInner: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 38,
  },
  groove: {
    position: 'absolute',
    borderWidth: 1,
  },
  vinylCenter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tonearm: {
    position: 'absolute',
    top: -4,
    right: -8,
    width: 28,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    transform: [{ rotate: '-30deg' }],
  },
  tonearmLine: {
    width: 2,
    height: 36,
    borderRadius: 1,
  },
  tonearmHead: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: -2,
  },
  info: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  trackName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    maxWidth: W - 80,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
    marginTop: 2,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    opacity: 0.85,
  },
});
