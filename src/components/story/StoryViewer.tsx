import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, Dimensions,
  StatusBar, StyleSheet, Animated, PanResponder,
  TouchableWithoutFeedback, Alert, TextInput, Modal, Platform,
  FlatList, ActivityIndicator, Easing,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { StoryGroup, StoryViewerUser } from '../../types/story';
import { storyService } from '../../services/storyService';
import { saveService } from '../../services/saveService';
import { useWs } from '../../context/WebSocketContext';

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
  onNavigateToCall?:  (partnerId: string, partnerName: string, callType: 'voice' | 'video') => void;
}

// ── Lecteur vidéo story ───────────────────────────────────────────────────────

const BUFFER_CFG = {
  minBufferMs:                      2000,
  maxBufferMs:                      15000,
  bufferForPlaybackMs:              800,
  bufferForPlaybackAfterRebufferMs: 1500,
};

const StoryVideoView: React.FC<{ uri: string; paused: boolean }> = ({ uri, paused }) => {
  const [buffering, setBuffering] = useState(false);

  const player = useVideoPlayer(
    { uri, bufferConfig: BUFFER_CFG },
    p => {
      p.loop   = false;
      p.muted  = false;
      p.volume = 1.0;
      if (!paused) p.play();
    },
  );

  useEffect(() => {
    if (paused) player.pause();
    else        player.play();
  }, [paused]);

  // Détecte les stalls via onBuffer
  useEffect(() => {
    const sub = player.addEventListener('onBuffer', (isBuffering: boolean) => setBuffering(isBuffering));
    return () => sub.remove();
  }, []);

  return (
    <View style={s.media}>
      <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {buffering && (
        <View style={s.bufferOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
};

// ── Préchargeur silencieux — instancie un player et appelle preload() ─────────
// Rendu invisible, libéré au unmount automatiquement par react-native-video

const VideoPreloader: React.FC<{ uri: string }> = ({ uri }) => {
  const player = useVideoPlayer(
    { uri, bufferConfig: BUFFER_CFG },
    p => { p.muted = true; p.volume = 0; },
  );
  useEffect(() => {
    player.preload().catch(() => {});
    return () => { try { player.pause(); } catch {} };
  }, [uri]);
  return null;
};

// ── Music Player Widget animé ────────────────────────────────────────────────

const BAR_COUNT = 20;

const MusicWidget: React.FC<{ audioUrl: string; accent: string; playing: boolean; mediaType: string }> = ({
  audioUrl, accent, playing, mediaType,
}) => {
  const vinylSpin  = useRef(new Animated.Value(0)).current;
  const spinAnim   = useRef<Animated.CompositeAnimation | null>(null);
  const barAnims   = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(Math.random()))).current;
  const barLoops   = useRef<Animated.CompositeAnimation[]>([]);
  const glowAnim   = useRef(new Animated.Value(0)).current;

  // Nom du track extrait de l'URL
  const trackName = (() => {
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

// ─────────────────────────────────────────────────────────────────────────────

export const StoryViewer: React.FC<Props> = ({
  groups, initialGroupIndex, initialStoryIndex, currentUserId,
  onClose, onNavigateToChat, onNavigateToCall,
}) => {
  const { addListener, removeListener } = useWs();

  const [groupIdx,    setGroupIdx]    = useState(initialGroupIndex);
  const [storyIdx,    setStoryIdx]    = useState(initialStoryIndex ?? 0);
  const [paused,      setPaused]      = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [editMode,    setEditMode]    = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [viewersOpen,    setViewersOpen]    = useState(false);
  const [viewers,        setViewers]        = useState<StoryViewerUser[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [liked,       setLiked]       = useState(false);
  const [likeCount,   setLikeCount]   = useState(0);
  const [likeToast,   setLikeToast]   = useState<{ name: string; avatar: string | null } | null>(null);

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


  // ── Prefetch des médias suivants (WhatsApp-style) ─────────────────────────

  useEffect(() => {
    // Collecte les 3 prochains médias (stories suivantes + groupe suivant)
    const nextUrls: string[] = [];
    const curStories = groups[groupIdx]?.stories ?? [];

    // Stories suivantes dans le groupe courant
    for (let i = storyIdx + 1; i < Math.min(storyIdx + 3, curStories.length); i++) {
      const url = curStories[i]?.media_url;
      if (url) nextUrls.push(url);
    }
    // Première story du groupe suivant
    const nextGroup = groups[groupIdx + 1];
    if (nextGroup?.stories[0]?.media_url) nextUrls.push(nextGroup.stories[0].media_url);

    // Prefetch en arrière-plan — silencieux
    nextUrls.forEach(url => Image.prefetch(url).catch(() => {}));
  }, [storyIdx, groupIdx]);

  // ── Mark viewed ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (story && !story.viewed_by_me && !isOwn) storyService.markViewed(story.id);
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

  // ── Progress ───────────────────────────────────────────────────────────────

  const startProgress = useCallback(() => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, { toValue: 1, duration, useNativeDriver: false })
      .start(({ finished }) => { if (finished) goNext(); });
  }, [storyIdx, groupIdx, duration]);

  useEffect(() => {
    if (!paused && !menuOpen && !editMode) startProgress();
    else progressAnim.stopAnimation();
  }, [storyIdx, groupIdx, paused, menuOpen, editMode]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    progressAnim.stopAnimation();
    if (storyIdx < total - 1) {
      setStoryIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(g => g + 1); setStoryIdx(0);
    } else {
      onClose();
    }
  }, [storyIdx, total, groupIdx, groups.length]);

  const goPrev = useCallback(() => {
    progressAnim.stopAnimation();
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

  // ── Swipe down to close ────────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10 && gs.dy > 0,
      onPanResponderGrant:  () => setPaused(true),
      onPanResponderMove:   (_, gs) => { if (gs.dy > 0) translateY.setValue(gs.dy); },
      onPanResponderRelease:(_, gs) => {
        if (gs.dy > 120) {
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
    Alert.alert('Supprimer', 'Supprimer cette story ?', [
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

  const openViewers = async () => {
    setPaused(true); setViewersOpen(true); setViewersLoading(true);
    try { setViewers(await storyService.getViewers(story.id)); }
    catch { setViewers([]); }
    finally { setViewersLoading(false); }
  };

  const closeViewers = () => { setViewersOpen(false); setPaused(false); };

  if (!group || !story || !group.user) return null;

  const author = group.user;
  const timeAgo = (() => {
    const diff = (Date.now() - new Date(story.created_at).getTime()) / 1000;
    if (diff < 60)   return 'A l\'instant';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    return `${Math.floor(diff / 3600)} h`;
  })();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => { stopAudio(); onClose(); }}>
      <Animated.View style={[s.root, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <StatusBar hidden translucent backgroundColor="transparent" />

        {/* ── Préchargeurs vidéo invisibles — story suivante + 1ère du groupe suivant */}
        {group.stories[storyIdx + 1]?.media_type === 'video' && group.stories[storyIdx + 1]?.media_url && (
          <VideoPreloader key={group.stories[storyIdx + 1].id} uri={group.stories[storyIdx + 1].media_url!} />
        )}
        {groups[groupIdx + 1]?.stories[0]?.media_type === 'video' && groups[groupIdx + 1]?.stories[0]?.media_url && (
          <VideoPreloader key={groups[groupIdx + 1].stories[0].id} uri={groups[groupIdx + 1].stories[0].media_url!} />
        )}

        {/* ── Media ─────────────────────────────────────────────────────── */}
        {story.media_type === 'text' && (
          <View style={[s.media, { backgroundColor: story.background_color ?? '#7B3FF2' }]} />
        )}
        {story.media_type === 'image' && story.media_url && (
          <Image source={{ uri: story.media_url }} style={s.media} resizeMode="cover" />
        )}
        {story.media_type === 'video' && story.media_url && (
          <StoryVideoView key={story.id} uri={story.media_url} paused={paused} />
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
            accent={accent}
            playing={!paused}
            mediaType={story.media_type}
          />
        )}

        {/* ── Tap zones (double-tap = like) ─────────────────────────────── */}
        <View style={s.tapZones} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={goPrev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={s.tapLeft} />
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback
            onPress={handleTapRight}
            onLongPress={() => setPaused(true)}
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
        <View style={s.bottomBar}>
          {isOwn ? (
            <TouchableOpacity style={s.viewsBtn} onPress={openViewers} activeOpacity={0.8}>
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

        {/* ── Panel vues ────────────────────────────────────────────────── */}
        {viewersOpen && (
          <TouchableWithoutFeedback onPress={closeViewers}>
            <View style={s.sheetOverlay}>
              <TouchableWithoutFeedback>
                <View style={s.viewersPanel}>
                  <View style={s.panelHandle} />
                  <View style={s.viewersPanelHeader}>
                    <Icon name="eye" size={15} color={accent} />
                    <Text style={s.viewersPanelTitle}>{viewers.length} vue{viewers.length !== 1 ? 's' : ''}</Text>
                  </View>
                  {viewersLoading ? (
                    <ActivityIndicator color={accent} style={{ marginTop: 32 }} />
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
                              <TouchableOpacity style={s.vActBtn} onPress={() => { closeViewers(); onNavigateToChat?.(v.id, vName, v.avatar_url ?? undefined); }}>
                                <Icon name="message-circle" size={16} color="#fff" />
                              </TouchableOpacity>
                              <TouchableOpacity style={[s.vActBtn, { backgroundColor: '#25D366' }]} onPress={() => { closeViewers(); onNavigateToCall?.(v.id, vName, 'voice'); }}>
                                <Icon name="phone" size={16} color="#fff" />
                              </TouchableOpacity>
                              <TouchableOpacity style={[s.vActBtn, { backgroundColor: accent }]} onPress={() => { closeViewers(); onNavigateToCall?.(v.id, vName, 'video'); }}>
                                <Icon name="video" size={16} color="#fff" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      }}
                    />
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
              <View style={s.menuSheet}>
                <View style={s.panelHandle} />
                <TouchableOpacity style={s.menuItem} onPress={handleEditOpen}>
                  <View style={[s.menuIconBox, { backgroundColor: 'rgba(123,63,242,0.15)' }]}>
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
            <View style={s.editSheet}>
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
    position: 'absolute', bottom: 80, left: 16, right: 16,
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

  // ── Bottom bar (like / views) ─────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute', bottom: 30, left: 16, right: 16,
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
    paddingBottom: 36, maxHeight: H * 0.72,
  },
  viewersPanelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  viewersPanelTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
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
    paddingBottom: 34,
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
  editSheet:   { backgroundColor: '#12121E', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36 },
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
