import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, StyleSheet, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';
import { VerifiedBadge, CachedImage } from '../common';
import { storyService, getViewedStories } from '../../services/storyService';
import { storyUploadState } from '../../services/storyUploadState';
import { networkService } from '../../services/networkService';
import { useWs } from '../../context/WebSocketContext';
import type { Story } from '../../types/story';
import type { StoryGroup } from '../../types/story';
import type { User } from '../../types/user';

interface Props {
  currentUser: User | null;
  colors: any;
  onNavigateToChat?: (partnerId: string, partnerName: string, avatarUrl?: string) => void;
  onNavigateToMyStories?: () => void;
}

// ── Dimensions ─────────────────────────────────────────────────────────────────
// La carte occupe désormais toute la hauteur de la barre (plus d'espace vide
// au-dessus/dessous) : padding vertical du scroll ramené au minimum, hauteur de
// carte recalculée en conséquence — largeur inchangée (tokens du feed).
import { StoryCard as StoryCardToken } from '../../theme/feed';
const CARD_W   = StoryCardToken.w;      // 72
const RADIUS   = StoryCardToken.radius; // 12
const CARD_GAP = StoryCardToken.gap;    // 8
const BAR_V_PAD = 6;    // marge haut/bas minimale de la barre
const CARD_H = 124;     // hauteur de carte — la barre ne garde qu'une mince
                        // respiration autour (BAR_V_PAD de chaque côté)

// Même palette que web/MediaPlaceholder — gradient déterministe depuis le nom
const PALETTES: [string, string, string][] = [
  ['#1a0533', '#7B3FF2', '#E0389A'],
  ['#0f172a', '#3B82F6', '#06B6D4'],
  ['#0c1a0f', '#22C55E', '#36D9A0'],
  ['#1a0f00', '#F59E0B', '#FF7A2F'],
  ['#1a000d', '#F0365A', '#E0389A'],
  ['#0d0d1a', '#8B5CF6', '#7B3FF2'],
];
function paletteBySeed(seed: string): [string, string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h * 31 + seed.charCodeAt(i)) >>> 0);
  return PALETTES[h % PALETTES.length];
}

export const StoryBar: React.FC<Props> = ({ currentUser, colors, onNavigateToChat, onNavigateToMyStories }) => {
  const [groups,      setGroups]      = useState<StoryGroup[]>([]);
  const [viewerOpen,  setViewerOpen]  = useState(false);
  const [viewerGroup, setViewerGroup] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [isUploading, setIsUploading] = useState(storyUploadState.uploading);
  const { addListener, removeListener } = useWs();

  const load = useCallback(async (forceRefresh = false) => {
    try {
      let data = await storyService.getFeed({ forceRefresh });

      // Fallback ultime : reconstruire un feed depuis les stories vues localement
      // (utilisé quand offline ET aucun feed en cache persistant)
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
            has_unseen: false, // déjà vues
          }));
        }
      }

      setGroups(data);
      // Précharger uniquement les thumbnails (petites images, coût négligeable) des
      // premiers groupes pour que la barre s'affiche déjà avec ses miniatures. Les
      // vidéos ne sont JAMAIS téléchargées ici — StoryViewer s'en charge lui-même,
      // uniquement pour la story réellement ouverte (+ la suivante en avance), pas
      // pour tout le feed juste parce qu'il est affiché.
      const onWifi = networkService.isWifi();
      const prefetchGroups = onWifi ? 10 : 3;
      data.slice(0, prefetchGroups).forEach(g => {
        g.stories.slice(0, 2).forEach(st => {
          if (st.thumbnail_url) Image.prefetch(st.thumbnail_url).catch(() => {});
          else if (st.media_url && st.media_type === 'image') Image.prefetch(st.media_url).catch(() => {});
        });
      });
    } catch (e) {
      __DEV__ && console.error('[StoryBar] getFeed error:', e);
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

  const myGroup     = useMemo(() => groups.find(g => g.user.id === currentUser?.id), [groups, currentUser?.id]);
  const otherGroups = useMemo(() => groups.filter(g => g.user.id !== currentUser?.id), [groups, currentUser?.id]);
  const allGroups   = useMemo(() => myGroup ? [myGroup, ...otherGroups] : groups, [myGroup, otherGroups, groups]);

  const openViewer = useCallback((index: number) => {
    const group = (myGroup ? [myGroup, ...otherGroups] : groups)[index];
    if (!group || group.stories.length === 0) return; // groupe vide — rien a afficher
    setViewerGroup(index);
    setViewerOpen(true);
  }, [myGroup, otherGroups, groups]);

  const displayName = currentUser?.display_name ?? currentUser?.username ?? 'Vous';
  const initials    = displayName[0]?.toUpperCase() ?? '?';

  // Dégradé de marque — depuis le thème, jamais en dur (le web l'a tokenisé).
  const brandGrad: [string, string] = [
    colors.gradientStart ?? colors.primary ?? '#7B3FF2',
    colors.gradientEnd   ?? '#E0389A',
  ];

  // Derniere story publiee (index 0 car backend trie DESC)
  const myLastStory = myGroup?.stories[0];
  const myThumb = myLastStory?.thumbnail_url ?? myLastStory?.media_url ?? null;
  const myBg    = myLastStory?.background_color ?? null;

  return (
    <>
      <View style={[s.container, { borderBottomColor: colors.border ?? '#eee', backgroundColor: colors.background ?? '#fff' }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          snapToInterval={CARD_W + 4 + CARD_GAP}
          decelerationRate="fast"
          snapToAlignment="start"
        >
          {/* ── Ma story ── */}
          {myGroup ? (
            // A déjà une story : carte "photo de fond" classique, comme les autres.
            <LinearGradient colors={brandGrad} style={s.cardBorderWrap}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={s.card}
                onPress={() => onNavigateToMyStories ? onNavigateToMyStories() : openViewer(0)}
              >
                {myThumb ? (
                  <CachedImage uri={myThumb} style={[s.cardBg, { width: CARD_W, height: CARD_H }]} resizeMode="cover" />
                ) : myBg ? (
                  <View style={[s.cardBg, { backgroundColor: myBg }]} />
                ) : (
                  <View style={[s.cardBg, { backgroundColor: colors.backgroundSecondary ?? '#f0f0f0' }]} />
                )}

                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={s.cardOverlay} />

                {isUploading && (
                  <ActivityIndicator size="small" color="#fff" style={{ position: 'absolute', top: 8, right: 8 }} />
                )}

                <View style={s.cardAvatarWrap}>
                  {!isUploading ? (
                    <LinearGradient colors={brandGrad} style={s.cardAvatarRing}>
                      <View style={s.cardAvatarInner}>
                        {currentUser?.avatar_url
                          ? <CachedImage uri={currentUser.avatar_url} style={s.cardAvatar} />
                          : <View style={[s.cardAvatarFallback, { backgroundColor: colors.primary ?? '#7B3FF2' }]}>
                              <Text style={s.cardAvatarInitial}>{initials}</Text>
                            </View>
                        }
                      </View>
                    </LinearGradient>
                  ) : (
                    <View style={s.cardAvatarInner}>
                      {currentUser?.avatar_url
                        ? <CachedImage uri={currentUser.avatar_url} style={s.cardAvatar} />
                        : <View style={[s.cardAvatarFallback, { backgroundColor: colors.backgroundSecondary ?? '#e0e0e0' }]}>
                            <Text style={[s.cardAvatarInitial, { color: colors.primary ?? '#7B3FF2' }]}>{initials}</Text>
                          </View>
                      }
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={[s.addBtn, { backgroundColor: colors.primary ?? '#7B3FF2', borderColor: colors.background ?? '#fff' }]}
                  onPress={() => setCreatorOpen(true)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Icon name="plus" size={11} color="#fff" />
                </TouchableOpacity>

                <Text style={s.cardLabelAbs} numberOfLines={1}>Ma story</Text>
                {myGroup.stories.length > 1 && (
                  <Text style={s.cardCount}>{myGroup.stories.length} stories</Text>
                )}
              </TouchableOpacity>
            </LinearGradient>
          ) : (
            // Pas encore de story : carte "Ajouter" — fond dégradé uni (pas de
            // photo plaquée arbitrairement), avatar centré avec + superposé,
            // grande initiale, comme la référence.
            <View style={[s.cardBorderWrap, { padding: 0 }]}>
              <TouchableOpacity activeOpacity={0.85} style={s.card} onPress={() => setCreatorOpen(true)}>
                <LinearGradient colors={brandGrad} style={s.cardBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

                <View style={s.addCardBody}>
                  <View style={s.addCardAvatarWrap}>
                    <View style={s.addCardAvatarInner}>
                      {currentUser?.avatar_url
                        ? <CachedImage uri={currentUser.avatar_url} style={s.cardAvatar} />
                        : <View style={[s.cardAvatarFallback, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                            <Text style={s.cardAvatarInitial}>{initials}</Text>
                          </View>
                      }
                    </View>
                    <TouchableOpacity
                      style={[s.addBtnOnAvatar, { backgroundColor: colors.primary ?? '#7B3FF2', borderColor: colors.gradientEnd ?? '#E0389A' }]}
                      onPress={() => setCreatorOpen(true)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Icon name="plus" size={11} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <Text style={s.addCardInitial} numberOfLines={1}>{initials}</Text>
                </View>

                <Text style={s.cardLabelAbs} numberOfLines={1}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Stories des autres ── */}
          {otherGroups.map((group, i) => {
            const idx    = myGroup ? i + 1 : i;
            const user   = group.user;
            const name   = user.display_name ?? user.username;
            // Index 0 = dernière story publiée (backend ORDER BY created_at DESC)
            const last   = group.stories[0];
            const thumb  = last?.thumbnail_url ?? last?.media_url ?? null;
            const bg      = last?.background_color ?? null;
            const caption = last?.caption ?? null;
            const isText  = last?.media_type === 'text';
            const isVideo = last?.media_type === 'video';
            const seen    = !group.has_unseen;
            const [pc0, pc1, pc2] = paletteBySeed(name);
            const fallbackGrad: [string, string, string] = [pc0, pc1, pc2];
            const noMedia = !thumb && !bg;

            const cardContent = (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[s.card, seen && s.cardSeen]}
                onPress={() => openViewer(idx)}
              >
                {/* Fond card */}
                {thumb ? (
                  <CachedImage
                    uri={thumb}
                    style={[s.cardBg, { width: CARD_W, height: CARD_H }, seen && { opacity: 0.65 }]}
                    resizeMode="cover"
                  />
                ) : noMedia ? (
                  // Aucun média : gradient déterministe depuis le nom (style WhatsApp)
                  <LinearGradient
                    colors={seen ? ['#555', '#444', '#333'] : fallbackGrad}
                    style={s.cardBg}
                  />
                ) : (
                  <View style={[s.cardBg, { backgroundColor: bg!, opacity: seen ? 0.65 : 1 }]} />
                )}

                {/* Caption pour les stories texte */}
                {isText && caption ? (
                  <View style={s.textStoryCaption}>
                    <Text style={s.textStoryCaptionText} numberOfLines={4}>{caption}</Text>
                  </View>
                ) : isVideo && noMedia ? (
                  // Vidéo sans thumbnail — icône play centré
                  <View style={s.textStoryCaption}>
                    <Icon name="play-circle" size={28} color="rgba(255,255,255,0.8)" />
                  </View>
                ) : null}

                {/* Overlay bas (seulement si image/video pour garder lisibilité) */}
                {!isText && (
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.6)']}
                    style={s.cardOverlay}
                  />
                )}

                {/* Mini avatar haut gauche */}
                <View style={s.cardAvatarWrap}>
                  <View style={s.cardMiniAvatarInner}>
                    {user.avatar_url
                      ? <CachedImage uri={user.avatar_url} style={[s.cardAvatar, seen && { opacity: 0.7 }]} />
                      : <View style={[s.cardAvatarFallback, { backgroundColor: seen ? '#aaa' : '#302B63' }]}>
                          <Text style={s.cardAvatarInitial}>{name[0]?.toUpperCase()}</Text>
                        </View>
                    }
                  </View>
                </View>

                {/* Nom + badge verifie + count */}
                <View style={s.cardBottom}>
                  {user.is_verified && <VerifiedBadge size={10} />}
                  <Text style={[s.cardLabelInline, seen && { opacity: 0.7 }]} numberOfLines={1}>
                    {name.split(' ')[0]}
                  </Text>
                  {group.stories.length > 1 && (
                    <Text style={[s.cardCount, seen && { opacity: 0.7 }]}>
                      {group.stories.length} stories
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );

            // Bordure gradient pour non-vu, bordure simple pour vu
            if (!seen) {
              return (
                <LinearGradient
                  key={group.user.id}
                  colors={brandGrad}
                  style={s.cardBorderWrap}
                >
                  {cardContent}
                </LinearGradient>
              );
            }
            return (
              <View
                key={group.user.id}
                style={[s.cardBorderWrap, { backgroundColor: colors.border ?? '#ccc' }]}
              >
                {cardContent}
              </View>
            );
          })}

          {/* ── Squelette chargement — même boîte exacte que les vraies cartes
              (cardBorderWrap inclus) pour qu'aucun saut de layout ne se produise
              quand les stories arrivent. Masqué dès qu'on a des groupes. ──── */}
          {loading && groups.length === 0 && [0, 1, 2, 3].map(i => (
            <View key={`sk${i}`} style={[s.cardBorderWrap, { backgroundColor: colors.border ?? '#ccc' }]}>
              <View style={[s.card, { backgroundColor: colors.backgroundSecondary ?? '#f0f0f0' }]}>
                <View style={[s.cardBg, { backgroundColor: colors.backgroundSecondary ?? '#e8e8e8' }]} />
                <View style={{ position: 'absolute', bottom: 10, left: 8, width: 36, height: 7, borderRadius: 4, backgroundColor: colors.border ?? '#ddd' }} />
              </View>
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
          onNavigateToChat={onNavigateToChat}        />
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
    height: CARD_H + 4 + BAR_V_PAD * 2,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical:   BAR_V_PAD,
    gap:               CARD_GAP,
    alignItems:        'flex-start',
  },

  // ── Wrapper bordure (gradient non-vu / gris vu) ────────────────────────────
  cardBorderWrap: {
    width:        CARD_W + 4,
    height:       CARD_H + 4,
    borderRadius: RADIUS + 2,
    padding:      2,
  },

  // ── Carte principale ────────────────────────────────────────────────────────
  card: {
    width:        CARD_W,
    height:       CARD_H,
    borderRadius: RADIUS,
    overflow:     'hidden',
    position:     'relative',
    backgroundColor: '#1a1a2e',
  },
  cardSeen: {
    opacity: 0.85,
  },
  cardBg: {
    position:     'absolute',
    top:          0,
    left:         0,
    width:        CARD_W,
    height:       CARD_H,
    borderRadius: RADIUS,
  },
  cardOverlay: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    height:   CARD_H * 0.45,
    borderBottomLeftRadius:  RADIUS,
    borderBottomRightRadius: RADIUS,
  },

  // ── Avatar haut gauche ───────────────────────────────────────────────────────
  cardAvatarWrap: {
    position: 'absolute',
    top:      8,
    left:     8,
  },
  cardAvatarRing: {
    width:         30,
    height:        30,
    borderRadius:  15,
    padding:       2,
    alignItems:    'center',
    justifyContent:'center',
  },
  cardAvatarInner: {
    width:        24,
    height:       24,
    borderRadius: 12,
    overflow:     'hidden',
    borderWidth:  1.5,
    borderColor:  '#fff',
  },
  cardMiniAvatarInner: {
    width:        28,
    height:       28,
    borderRadius: 14,
    overflow:     'hidden',
    borderWidth:  2,
    borderColor:  '#fff',
  },
  cardAvatar: { width: '100%', height: '100%' },
  cardAvatarFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  cardAvatarInitial: { fontSize: 11, fontWeight: '800', color: '#fff' },

  // ── Bouton + ─────────────────────────────────────────────────────────────────
  addBtn: {
    position:      'absolute',
    top:           26,
    left:          24,
    width:         18,
    height:        18,
    borderRadius:  9,
    alignItems:    'center',
    justifyContent:'center',
    borderWidth:   2,
  },

  // ── Carte "Ajouter" (pas encore de story) — fond dégradé uni ────────────────
  addCardBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addCardAvatarWrap: { position: 'relative' },
  addCardAvatarInner: {
    width: 34, height: 34, borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)',
  },
  addBtnOnAvatar: {
    position: 'absolute', bottom: -3, right: -3,
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  addCardInitial: {
    fontSize: 30,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
  },

  // ── Caption story texte (centré dans la carte) ───────────────────────────────
  textStoryCaption: {
    ...StyleSheet.absoluteFill,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical:   24,
  },
  textStoryCaptionText: {
    fontSize:   10,
    fontWeight: '700',
    color:      '#fff',
    textAlign:  'center',
    lineHeight: 14,
    textShadowColor:  'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // ── Texte bas de la carte ─────────────────────────────────────────────────────
  // Pour "Ma story" / "Ajouter" — position absolute directe
  cardLabelAbs: {
    position:   'absolute',
    bottom:     8,
    left:       6,
    right:      6,
    fontSize:   11,
    fontWeight: '700',
    color:      '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Pour les autres users — dans cardBottom
  cardBottom: {
    position:   'absolute',
    bottom:     8,
    left:       6,
    right:      6,
    gap:        2,
  },
  cardLabelInline: {
    fontSize:   11,
    fontWeight: '700',
    color:      '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardCount: {
    fontSize:   9,
    fontWeight: '600',
    color:      'rgba(255,255,255,0.85)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
