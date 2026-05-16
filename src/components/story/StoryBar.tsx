import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';
import { VerifiedBadge } from '../common';
import { storyService } from '../../services/storyService';
import { useWs } from '../../context/WebSocketContext';
import type { StoryGroup } from '../../types/story';
import type { User } from '../../types/user';

interface Props {
  currentUser: User | null;
  colors: any;
  onNavigateToChat?: (partnerId: string, partnerName: string, avatarUrl?: string) => void;
  onNavigateToCall?: (partnerId: string, partnerName: string, callType: 'voice' | 'video') => void;
  onNavigateToMyStories?: () => void;
}

export const StoryBar: React.FC<Props> = ({ currentUser, colors, onNavigateToChat, onNavigateToCall, onNavigateToMyStories }) => {
  const [groups,      setGroups]      = useState<StoryGroup[]>([]);
  const [viewerOpen,  setViewerOpen]  = useState(false);
  const [viewerGroup, setViewerGroup] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const { addListener, removeListener } = useWs();

  const load = useCallback(async (forceRefresh = false) => {
    try {
      const data = await storyService.getFeed({ forceRefresh });
      setGroups(data);
      // Precharger medias des 10 premiers groupes (2 stories chacun)
      data.slice(0, 10).forEach(g => {
        g.stories.slice(0, 2).forEach(st => {
          if (st.thumbnail_url) Image.prefetch(st.thumbnail_url).catch(() => {});
          else if (st.media_url && st.media_type === 'image') Image.prefetch(st.media_url).catch(() => {});
        });
      });
    } catch (e) {
      __DEV__ && console.error('[StoryBar] getFeed error:', e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(false); }, []);

  useEffect(() => {
    const onWs = (payload: any) => {
      // Nouvelle story arrivee — forcer un refresh reseau (invalide le cache)
      if (payload.type === 'new_story' || payload.type === 'story_added') load(true);
    };
    addListener(onWs);
    return () => removeListener(onWs);
  }, [addListener, removeListener, load]);

  const myGroup     = groups.find(g => g.user.id === currentUser?.id);
  const otherGroups = groups.filter(g => g.user.id !== currentUser?.id);
  const allGroups   = myGroup ? [myGroup, ...otherGroups] : groups;

  const openViewer = (index: number) => { setViewerGroup(index); setViewerOpen(true); };

  const displayName = currentUser?.display_name ?? currentUser?.username ?? 'Vous';
  const initials    = displayName[0]?.toUpperCase() ?? '?';

  return (
    <>
      <View style={[s.container, { backgroundColor: 'transparent', borderBottomColor: colors.border ?? '#eee' }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
        >
          {/* ── Mon avatar ── */}
          <Animated.View entering={FadeIn.duration(300)}>
            <TouchableOpacity
              style={s.item}
              activeOpacity={0.8}
              onPress={myGroup
                ? () => onNavigateToMyStories ? onNavigateToMyStories() : openViewer(0)
                : () => setCreatorOpen(true)
              }
            >
              <View style={s.myWrap}>
                {myGroup ? (
                  <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.ring}>
                    <View style={s.avatarInner}>
                      {currentUser?.avatar_url
                        ? <Image source={{ uri: currentUser.avatar_url }} style={s.avatar} />
                        : <View style={[s.avatarFallback, { backgroundColor: '#7B3FF2' }]}>
                            <Text style={s.avatarInitial}>{initials}</Text>
                          </View>
                      }
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={[s.ring, s.ringEmpty, { borderColor: colors.border ?? '#ddd' }]}>
                    <View style={s.avatarInner}>
                      {currentUser?.avatar_url
                        ? <Image source={{ uri: currentUser.avatar_url }} style={s.avatar} />
                        : <View style={[s.avatarFallback, { backgroundColor: colors.backgroundSecondary ?? '#f0f0f0' }]}>
                            <Text style={[s.avatarInitial, { color: colors.primary ?? '#7B3FF2' }]}>{initials}</Text>
                          </View>
                      }
                    </View>
                  </View>
                )}
                {/* Bouton + */}
                <TouchableOpacity
                  style={[s.addPill, { backgroundColor: colors.primary ?? '#7B3FF2', borderColor: colors.background }]}
                  onPress={() => setCreatorOpen(true)}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Icon name="plus" size={9} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={[s.name, { color: colors.textSecondary }]} numberOfLines={1}>
                {myGroup ? 'Ma story' : 'Ajouter'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Separateur ── */}
          {(otherGroups.length > 0 || loading) && (
            <View style={[s.sep, { backgroundColor: colors.border ?? '#eee' }]} />
          )}

          {/* ── Stories des autres ── */}
          {otherGroups.map((group, i) => {
            const idx       = myGroup ? i + 1 : i;
            const user      = group.user;
            const name      = user.display_name ?? user.username;
            const firstStory = group.stories[0];
            const thumb     = firstStory?.thumbnail_url ?? firstStory?.media_url ?? null;
            return (
              <Animated.View key={group.user.id} entering={FadeInRight.delay(i * 50).duration(300)}>
                <TouchableOpacity style={s.item} activeOpacity={0.8} onPress={() => openViewer(idx)}>
                  <View style={s.storyWrap}>
                    {group.has_unseen ? (
                      <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.ring}>
                        <View style={s.avatarInner}>
                          {thumb
                            ? <Image source={{ uri: thumb }} style={s.avatar} resizeMode="cover" />
                            : user.avatar_url
                              ? <Image source={{ uri: user.avatar_url }} style={s.avatar} />
                              : <View style={[s.avatarFallback, { backgroundColor: '#302B63' }]}>
                                  <Text style={s.avatarInitial}>{name[0]?.toUpperCase()}</Text>
                                </View>
                          }
                        </View>
                      </LinearGradient>
                    ) : (
                      <View style={[s.ring, s.ringEmpty, { borderColor: colors.border ?? '#ddd' }]}>
                        <View style={s.avatarInner}>
                          {thumb
                            ? <Image source={{ uri: thumb }} style={[s.avatar, s.avatarSeen]} resizeMode="cover" />
                            : user.avatar_url
                              ? <Image source={{ uri: user.avatar_url }} style={[s.avatar, s.avatarSeen]} />
                              : <View style={[s.avatarFallback, { backgroundColor: colors.backgroundSecondary ?? '#f0f0f0' }]}>
                                  <Text style={[s.avatarInitial, { color: colors.textSecondary, opacity: 0.6 }]}>{name[0]?.toUpperCase()}</Text>
                                </View>
                          }
                        </View>
                      </View>
                    )}
                    {/* Avatar en overlay en bas à gauche */}
                    {thumb && user.avatar_url && (
                      <View style={s.avatarOverlay}>
                        <Image source={{ uri: user.avatar_url }} style={s.avatarOverlayImg} />
                      </View>
                    )}
                    {/* Nombre de stories si > 1 */}
                    {group.stories.length > 1 && (
                      <View style={[s.countBadge, { backgroundColor: colors.primary ?? '#7B3FF2' }]}>
                        <Text style={s.countText}>{group.stories.length}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    <Text style={[s.name, { color: group.has_unseen ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
                      {name.split(' ')[0]}
                    </Text>
                    {user.is_verified && <VerifiedBadge size={11} />}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}

          {/* ── Squelette chargement ── */}
          {loading && [0, 1, 2, 3].map(i => (
            <View key={`sk${i}`} style={s.item}>
              <View style={[s.ring, s.ringEmpty, { borderColor: 'transparent', backgroundColor: colors.backgroundSecondary ?? '#f0f0f0' }]} />
              <View style={{ width: 40, height: 7, borderRadius: 4, backgroundColor: colors.backgroundSecondary ?? '#f0f0f0', marginTop: 7 }} />
            </View>
          ))}
        </ScrollView>
      </View>

      {viewerOpen && allGroups.length > 0 && (
        <StoryViewer
          groups={allGroups}
          initialGroupIndex={viewerGroup}
          currentUserId={currentUser?.id}
          onClose={() => { setViewerOpen(false); load(false); }}
          onNavigateToChat={onNavigateToChat}
          onNavigateToCall={onNavigateToCall}
        />
      )}

      <StoryCreator
        visible={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onCreated={() => { setCreatorOpen(false); load(true); }}
      />
    </>
  );
};

const RING_SIZE   = 52;
const AVATAR_SIZE = RING_SIZE - 5;

const s = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 80,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical:   6,
    gap:               8,
    alignItems:        'center',
    flexGrow: 1,
  },
  item: {
    alignItems: 'center',
    gap:        4,
    width:      RING_SIZE + 4,
  },

  // ── Rings ────────────────────────────────────────────────────────────────────
  myWrap:   { position: 'relative' },
  storyWrap:{ position: 'relative' },
  ring: {
    width:         RING_SIZE,
    height:        RING_SIZE,
    borderRadius:  RING_SIZE / 2,
    padding:       2.5,
    alignItems:    'center',
    justifyContent:'center',
  },
  ringEmpty: {
    backgroundColor: 'transparent',
    borderWidth:     2,
  },
  avatarInner: {
    width:         AVATAR_SIZE,
    height:        AVATAR_SIZE,
    borderRadius:  AVATAR_SIZE / 2,
    overflow:      'hidden',
    backgroundColor: '#fff',
  },
  avatar:      { width: '100%', height: '100%' },
  avatarSeen:  { opacity: 0.65 },
  avatarFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 17, fontWeight: '800', color: '#fff' },

  // ── Add pill ─────────────────────────────────────────────────────────────────
  addPill: {
    position:      'absolute',
    bottom:        -1,
    right:         -1,
    width:         18,
    height:        18,
    borderRadius:  9,
    alignItems:    'center',
    justifyContent:'center',
    borderWidth:   2,
  },

  // ── Count badge ──────────────────────────────────────────────────────────────
  countBadge: {
    position:     'absolute',
    top:          0,
    right:        0,
    minWidth:     15,
    height:       15,
    borderRadius: 8,
    alignItems:   'center',
    justifyContent:'center',
    paddingHorizontal: 3,
  },
  countText: { color: '#fff', fontSize: 8, fontWeight: '800' },

  // ── Avatar overlay (sur thumbnail) ───────────────────────────────────────────
  avatarOverlay:    { position: 'absolute', bottom: 0, left: 0, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#fff', overflow: 'hidden' },
  avatarOverlayImg: { width: '100%', height: '100%' },

  // ── Separateur ───────────────────────────────────────────────────────────────
  sep: { width: 1, height: 40, borderRadius: 1, marginHorizontal: 4 },

  // ── Label ────────────────────────────────────────────────────────────────────
  name: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
