import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, Dimensions,
  StatusBar, StyleSheet, Animated, PanResponder,
  TouchableWithoutFeedback, Alert, TextInput, Modal, Platform,
  FlatList, ActivityIndicator,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { StoryGroup, StoryViewerUser } from '../../types/story';
import { storyService } from '../../services/storyService';
import { saveService } from '../../services/saveService';

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

// ── Lecteur vidéo story (v7) ──────────────────────────────────────────────────

const StoryVideoView: React.FC<{ uri: string; paused: boolean }> = ({ uri, paused }) => {
  const player = useVideoPlayer({ uri }, p => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (paused) { player.pause(); }
    else        { player.play(); }
  }, [paused]);

  return (
    <VideoView
      player={player}
      style={s.media}
      resizeMode="cover"
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export const StoryViewer: React.FC<Props> = ({
  groups, initialGroupIndex, initialStoryIndex, currentUserId,
  onClose, onNavigateToChat, onNavigateToCall,
}) => {
  const [groupIdx,    setGroupIdx]    = useState(initialGroupIndex);
  const [storyIdx,    setStoryIdx]    = useState(initialStoryIndex ?? 0);
  const [paused,      setPaused]      = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [editMode,    setEditMode]    = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [viewersOpen,    setViewersOpen]    = useState(false);
  const [viewers,        setViewers]        = useState<StoryViewerUser[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [saved, setSaved] = useState(false);


  const progressAnim = useRef(new Animated.Value(0)).current;
  const translateY   = useRef(new Animated.Value(0)).current;

  const group    = groups[groupIdx];
  const story    = group?.stories[storyIdx];
  const total    = group?.stories.length ?? 0;
  const duration = (story?.duration_sec ?? 5) * 1000;
  const isOwn    = !!currentUserId && story?.user_id === currentUserId;
  const accent   = TYPE_COLOR[story?.media_type ?? 'image'] ?? '#7B3FF2';

  // ── Video ──────────────────────────────────────────────────────────────────


  // ── Mark viewed ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (story && !story.viewed_by_me) storyService.markViewed(story.id);
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

  if (!group || !story) return null;

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

        {/* ── Media ─────────────────────────────────────────────────────── */}
        {story.media_type === 'text' && (
          <View style={[s.media, { backgroundColor: story.background_color ?? '#7B3FF2' }]} />
        )}
        {story.media_type === 'image' && story.media_url && (
          <Image source={{ uri: story.media_url }} style={s.media} resizeMode="cover" />
        )}
        {story.media_type === 'video' && story.media_url && (
          <StoryVideoView uri={story.media_url} paused={paused} />
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

        {/* ── Audio badge ────────────────────────────────────────────────── */}
        {story.audio_url && (
          <View style={[s.audioBadge, { borderColor: accent }]}>
            <MaterialIcon name={story.media_type === 'voice' ? 'microphone' : 'music-note'} size={13} color={accent} />
            <Text style={[s.audioBadgeText, { color: accent }]}>
              {story.media_type === 'voice' ? 'Vocal' : 'Son'}
            </Text>
          </View>
        )}

        {/* ── Tap zones ─────────────────────────────────────────────────── */}
        <View style={s.tapZones} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={goPrev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={s.tapLeft} />
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={goNext} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={s.tapRight} />
          </TouchableWithoutFeedback>
        </View>

        {/* ── Bouton vues (propre story) ─────────────────────────────────── */}
        {isOwn && (
          <TouchableOpacity style={s.viewsBtn} onPress={openViewers} activeOpacity={0.8}>
            <Icon name="eye" size={14} color="#fff" />
            <Text style={s.viewsBtnText}>{story.view_count ?? 0} vue{(story.view_count ?? 0) !== 1 ? 's' : ''}</Text>
          </TouchableOpacity>
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

  // ── Audio badge ───────────────────────────────────────────────────────────────
  audioBadge: {
    position: 'absolute', top: '48%', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  audioBadgeText: { fontSize: 12, fontWeight: '700' },

  // ── Tap zones ─────────────────────────────────────────────────────────────────
  tapZones: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', zIndex: 5 },
  tapLeft:  { flex: 1 },
  tapRight: { flex: 2 },

  // ── Views button ──────────────────────────────────────────────────────────────
  viewsBtn: {
    position: 'absolute', bottom: 30, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    zIndex: 8,
  },
  viewsBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

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
