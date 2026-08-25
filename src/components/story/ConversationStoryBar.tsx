/**
 * ConversationStoryBar — barre de stories dédiée à l'écran des conversations (Messages).
 * Séparé de StoryBar (FeedScreen) volontairement : ici les avatars sont entièrement ronds
 * et à la même taille que les avatars de conversation (56px), pas les cartes rectangulaires
 * de StoryBar — les deux écrans doivent garder des formes différentes.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, StyleSheet, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';
import { CachedImage } from '../common';
import { storyService, getViewedStories } from '../../services/storyService';
import { storyUploadState } from '../../services/storyUploadState';
import { networkService } from '../../services/networkService';
import { useWs } from '../../context/WebSocketContext';
import { apiClient, Endpoints } from '../../api';
import type { Story } from '../../types/story';
import type { StoryGroup } from '../../types/story';
import type { User, UserPublic } from '../../types/user';

interface Props {
  currentUser: User | null;
  colors: any;
  // Conversations déjà chargées par MessagesScreen — utilisées comme source
  // "amis proches" pour peupler la barre au-delà des seuls auteurs de story
  // active (fusionnées avec les abonnements ci-dessous, dédupliquées).
  conversations?: Array<{ partner_id: string; partner?: { id?: string; username?: string; full_name?: string; avatar_url?: string | null } }>;
  onNavigateToChat?: (partnerId: string, partnerName: string, avatarUrl?: string) => void;
  onNavigateToCall?: (partnerId: string, partnerName: string, callType: 'voice' | 'video') => void;
  onNavigateToMyStories?: () => void;
}

// Amis sans story active — affichés après les groupes de stories, sans anneau
// dégradé (rien à "voir"), juste pour ouvrir le chat au tap.
interface FriendOnly {
  id:           string;
  username:     string;
  display_name: string;
  avatar_url:   string | null;
}

// Même taille que l'avatar de conversation (MessagesScreen: avatar 56/borderRadius 28)
const AVATAR_SIZE = 56;
const RING_SIZE   = AVATAR_SIZE + 6;

export const ConversationStoryBar: React.FC<Props> = ({ currentUser, colors, conversations, onNavigateToChat, onNavigateToCall, onNavigateToMyStories }) => {
  const [groups,      setGroups]      = useState<StoryGroup[]>([]);
  const [friendsOnly, setFriendsOnly] = useState<FriendOnly[]>([]);
  const [viewerOpen,  setViewerOpen]  = useState(false);
  const [viewerGroup, setViewerGroup] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [isUploading, setIsUploading] = useState(storyUploadState.uploading);
  const { addListener, removeListener } = useWs();

  const load = useCallback(async (forceRefresh = false) => {
    try {
      let data = await storyService.getFeed({ forceRefresh });

      if (data.length === 0) {
        const viewed = getViewedStories();
        if (viewed.length > 0) {
          const byUser = new Map<string, Story[]>();
          viewed.forEach(st => {
            if (!st.author) return;
            const uid = st.author.id ?? st.user_id;
            if (!byUser.has(uid)) byUser.set(uid, []);
            byUser.get(uid)!.push(st);
          });
          data = [...byUser.entries()].map(([, stories]) => ({
            user: stories[0].author!,
            stories,
            has_unseen: false,
          }));
        }
      }

      setGroups(data);
      const onWifi = networkService.isWifi();
      const prefetchGroups = onWifi ? 10 : 3;
      data.slice(0, prefetchGroups).forEach(g => {
        g.stories.slice(0, 2).forEach(st => {
          if (st.thumbnail_url) Image.prefetch(st.thumbnail_url).catch(() => {});
          else if (st.media_url && st.media_type === 'image') Image.prefetch(st.media_url).catch(() => {});
        });
      });
    } catch (e) {
      __DEV__ && console.error('[ConversationStoryBar] getFeed error:', e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(true); }, []);

  useEffect(() => {
    return storyUploadState.subscribe((uploading) => {
      setIsUploading(uploading);
      if (!uploading) load(true);
    });
  }, [load]);

  useEffect(() => {
    const onWs = (payload: any) => {
      if (payload.type === 'new_story' || payload.type === 'story_added') load(true);
    };
    addListener(onWs);
    return () => removeListener(onWs);
  }, [addListener, removeListener, load]);

  // Charge les abonnements pour peupler la barre au-delà des seuls auteurs de
  // story active — fusionnés avec les partenaires de conversation (les deux
  // servent de proxy "amis proches" en l'absence d'un vrai concept de
  // proximité côté backend).
  useEffect(() => {
    if (!currentUser?.id) return;
    apiClient.get<UserPublic[]>(`${Endpoints.users.following(currentUser.id)}?page=1&limit=50`)
      .then(res => {
        const following = Array.isArray(res.data) ? res.data : [];
        const byId = new Map<string, FriendOnly>();
        following.forEach(u => {
          if (u.id === currentUser.id) return;
          byId.set(u.id, {
            id: u.id,
            username: u.username ?? '',
            display_name: u.display_name ?? u.username ?? '',
            avatar_url: u.avatar_url ?? null,
          });
        });
        (conversations ?? []).forEach(c => {
          const p = c.partner;
          const id = p?.id ?? c.partner_id;
          if (!id || id === currentUser.id || byId.has(id)) return;
          byId.set(id, {
            id,
            username: p?.username ?? '',
            display_name: p?.full_name ?? p?.username ?? '',
            avatar_url: p?.avatar_url ?? null,
          });
        });
        setFriendsOnly([...byId.values()]);
      })
      .catch(() => {});
  }, [currentUser?.id, conversations]);

  const myGroup     = useMemo(() => groups.find(g => g.user.id === currentUser?.id), [groups, currentUser?.id]);
  const otherGroups = useMemo(() => groups.filter(g => g.user.id !== currentUser?.id), [groups, currentUser?.id]);
  const allGroups   = useMemo(() => myGroup ? [myGroup, ...otherGroups] : groups, [myGroup, otherGroups, groups]);

  // Amis (conversations + abonnements) qui n'ont pas déjà un groupe de story
  // actif — affichés après, sans anneau dégradé. Ceux qui viennent de publier
  // restent toujours prioritaires (otherGroups, triées non-vues d'abord par
  // le backend) et gardent leur cercle coloré.
  const storyAuthorIds = useMemo(() => new Set(groups.map(g => g.user.id)), [groups]);
  const friendsWithoutStory = useMemo(
    () => friendsOnly.filter(f => !storyAuthorIds.has(f.id)),
    [friendsOnly, storyAuthorIds],
  );

  const openViewer = useCallback((index: number) => {
    const group = (myGroup ? [myGroup, ...otherGroups] : groups)[index];
    if (!group || group.stories.length === 0) return;
    setViewerGroup(index);
    setViewerOpen(true);
  }, [myGroup, otherGroups, groups]);

  const displayName = currentUser?.display_name ?? currentUser?.username ?? 'Vous';
  const initials     = displayName[0]?.toUpperCase() ?? '?';

  const myLastStory = myGroup?.stories[0];
  const myThumb = myLastStory?.thumbnail_url ?? myLastStory?.media_url ?? null;

  return (
    <>
      <View style={[s.container, { borderBottomColor: colors.border ?? '#eee' }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scroll}
        >
          {/* ── Ma story ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={s.item}
            onPress={myGroup
              ? () => onNavigateToMyStories ? onNavigateToMyStories() : openViewer(0)
              : () => setCreatorOpen(true)
            }
          >
            <LinearGradient
              colors={myGroup ? ['#7B3FF2', '#E0389A'] : ['transparent', 'transparent']}
              style={[s.ring, !myGroup && { backgroundColor: colors.border ?? '#ddd' }]}
            >
              <View style={[s.avatarInner, { borderColor: colors.background ?? '#fff' }]}>
                {myThumb ? (
                  <CachedImage uri={myThumb} style={s.avatarImg} resizeMode="cover" />
                ) : currentUser?.avatar_url ? (
                  <CachedImage uri={currentUser.avatar_url} style={s.avatarImg} resizeMode="cover" />
                ) : (
                  <View style={[s.avatarFallback, { backgroundColor: colors.backgroundSecondary ?? '#e0e0e0' }]}>
                    <Text style={[s.avatarInitial, { color: colors.primary ?? '#7B3FF2' }]}>{initials}</Text>
                  </View>
                )}
                {isUploading && (
                  <View style={s.uploadOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
              </View>
            </LinearGradient>
            <TouchableOpacity
              style={[s.addBtn, { backgroundColor: colors.primary ?? '#7B3FF2', borderColor: colors.background ?? '#fff' }]}
              onPress={() => setCreatorOpen(true)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Icon name="plus" size={10} color="#fff" />
            </TouchableOpacity>
            <Text style={[s.label, { color: colors.textSecondary ?? '#666' }]} numberOfLines={1}>
              {myGroup ? 'Ma story' : 'Ajouter'}
            </Text>
          </TouchableOpacity>

          {/* ── Stories des amis ── */}
          {otherGroups.map((group, i) => {
            const idx  = myGroup ? i + 1 : i;
            const user = group.user;
            const name = user.display_name ?? user.username;
            const seen = !group.has_unseen;

            return (
              <TouchableOpacity
                key={group.user.id}
                activeOpacity={0.85}
                style={s.item}
                onPress={() => openViewer(idx)}
              >
                <LinearGradient
                  colors={seen ? [colors.border ?? '#ccc', colors.border ?? '#ccc'] : ['#7B3FF2', '#E0389A']}
                  style={s.ring}
                >
                  <View style={[s.avatarInner, { borderColor: colors.background ?? '#fff' }]}>
                    {user.avatar_url ? (
                      <CachedImage uri={user.avatar_url} style={[s.avatarImg, seen && { opacity: 0.7 }]} resizeMode="cover" />
                    ) : (
                      <View style={[s.avatarFallback, { backgroundColor: seen ? '#aaa' : '#302B63' }]}>
                        <Text style={s.avatarInitial}>{name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                </LinearGradient>
                <Text style={[s.label, { color: colors.textSecondary ?? '#666' }, seen && { opacity: 0.7 }]} numberOfLines={1}>
                  {name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* ── Amis sans story active — conversations + abonnements, pas d'anneau
              dégradé (rien à voir), tap ouvre directement le chat ── */}
          {friendsWithoutStory.map(friend => {
            const name = friend.display_name || friend.username || 'Ami';
            return (
              <TouchableOpacity
                key={friend.id}
                activeOpacity={0.85}
                style={s.item}
                onPress={() => onNavigateToChat?.(friend.id, name, friend.avatar_url ?? undefined)}
              >
                <View style={[s.ring, { backgroundColor: 'transparent' }]}>
                  <View style={[s.avatarInner, { borderColor: colors.background ?? '#fff' }]}>
                    {friend.avatar_url ? (
                      <CachedImage uri={friend.avatar_url} style={s.avatarImg} resizeMode="cover" />
                    ) : (
                      <View style={[s.avatarFallback, { backgroundColor: colors.backgroundSecondary ?? '#e0e0e0' }]}>
                        <Text style={[s.avatarInitial, { color: colors.primary ?? '#7B3FF2' }]}>{name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={[s.label, { color: colors.textSecondary ?? '#666' }]} numberOfLines={1}>
                  {name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* ── Squelette chargement ── */}
          {loading && [0, 1, 2, 3].map(i => (
            <View key={`sk${i}`} style={s.item}>
              <View style={[s.ring, { backgroundColor: colors.backgroundSecondary ?? '#f0f0f0' }]} />
              <View style={{ width: AVATAR_SIZE * 0.6, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors.border ?? '#ddd' }} />
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

const s = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 14,
  },
  item: {
    alignItems: 'center',
    width: RING_SIZE + 4,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: '800', color: '#fff' },
  uploadOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AVATAR_SIZE / 2,
  },
  addBtn: {
    position: 'absolute',
    bottom: 16,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    maxWidth: RING_SIZE + 4,
  },
});
