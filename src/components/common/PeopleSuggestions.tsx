import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { userService } from '../../services/userService';
import { liveService } from '../../services/liveService';
import { useWs } from '../../context/WebSocketContext';
import { toastService } from '../../services/toastService';
import { VerifiedBadge } from './VerifiedBadge';
import { AvatarWithBadge } from './AvatarWithBadge';
import type { UserPublic } from '../../types';
import { FeedCardLayout, FeedRadius } from '../../theme/feed';

// Carte large et visible — 40% de la largeur d'écran SUR TÉLÉPHONE. Sur
// tablette, 40% de la largeur exploserait la carte : plafonné à une largeur
// "confortable" (240px) au lieu de suivre le pourcentage sans limite.
// useWindowDimensions() (réactif : rotation, split-screen, pliable) au lieu
// de Dimensions.get('window') figé une seule fois au chargement du module.
const CARD_MAX_W = 240;
function useCardSizes() {
  const { width: winW } = useWindowDimensions();
  const cardW = Math.min(Math.round(winW * 0.40), CARD_MAX_W);
  return { cardW, coverH: Math.round(cardW * 0.5), avatarSz: Math.round(cardW * 0.4) };
}

interface Props {
  users:       UserPublic[];
  loading:     boolean;
  onUserPress: (userId: string) => void;
  onRefresh:   () => void;
  /**
   * Source de verite partagee de l'etat "je suis cette personne", tenue par
   * l'ecran parent (ex: FeedScreen charge getFollowing au montage et l'update
   * de facon optimiste). Quand elle est fournie, le bouton Suivre s'y fie au
   * lieu de son etat local `itemState` — sinon, en revenant sur l'ecran, le
   * composant se remonte, `itemState` repart vide et le bouton reaffiche
   * "Suivre" pour quelqu'un qu'on suit deja. Optionnelle : sans elle, le
   * composant garde son comportement autonome (cas HomeScreen).
   */
  followingSet?:  Set<string>;
  onToggleFollow?: (userId: string) => void | Promise<void>;
}

type ItemState = Record<string, 'idle' | 'loading' | 'followed' | 'dismissed'>;

export const PeopleSuggestions: React.FC<Props> = ({ users, loading, onUserPress, onRefresh, followingSet, onToggleFollow }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { liveUserIds } = useWs();
  const nav = useNavigation<any>();
  const [itemState, setItemState] = useState<ItemState>({});
  const [joiningLiveId, setJoiningLiveId] = useState<string | null>(null);
  const { cardW: CARD_W, coverH: COVER_H, avatarSz: AVATAR_SZ } = useCardSizes();

  const joinUserLive = useCallback(async (userId: string) => {
    if (joiningLiveId) return;
    setJoiningLiveId(userId);
    try {
      const lives = await liveService.getLives();
      const live = lives.find(l => String(l.user_id) === String(userId));
      if (live) {
        nav.navigate('SimpleLiveViewer', { liveId: live.id });
      } else {
        toastService.warning('Live introuvable', 'Ce live n\'est plus disponible.');
      }
    } catch {
      toastService.error('Erreur', 'Impossible de rejoindre le live pour le moment.');
    } finally {
      setJoiningLiveId(null);
    }
  }, [joiningLiveId, nav]);

  // Mode "controle" : l'ecran parent tient l'etat follow (followingSet +
  // onToggleFollow). On lui delegue l'appel reseau ET le rollback optimiste ;
  // ici on ne garde que l'indicateur de spinner le temps de la promesse.
  const controlled = !!followingSet && !!onToggleFollow;

  const handleFollow = (userId: string) => {
    if (controlled) {
      // Le parent applique deja la bascule de facon optimiste (followingSet)
      // et rollback si l'appel echoue — pas de spinner local a gerer ici.
      onToggleFollow!(userId);
      return;
    }
    setItemState(s => ({ ...s, [userId]: 'loading' }));
    userService.follow(userId)
      .then(() => setItemState(s => ({ ...s, [userId]: 'followed' })))
      .catch(() => setItemState(s => ({ ...s, [userId]: 'idle' })));
  };

  const handleDismiss = (userId: string) => {
    setItemState(s => ({ ...s, [userId]: 'dismissed' }));
  };

  const visible = users.filter(u => itemState[u.id] !== 'dismissed');

  if (!loading && visible.length === 0) return null;

  const skeletons = [0, 1, 2, 3];

  return (
    <View style={[st.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>

      {/* Header */}
      <View style={st.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[st.title, { color: colors.textPrimary }]} numberOfLines={1}>Des gens qui te ressemblent ✨</Text>
          <Text style={[st.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>Élargis ton cercle, un abonnement à la fois</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[st.seeAll, { color: colors.primary }]}>Rafraîchir</Text>
        </TouchableOpacity>
      </View>

      {/* Scroll horizontal */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.list}
      >
        {loading
          ? skeletons.map(i => (
              <View key={i} style={[st.card, { width: CARD_W, backgroundColor: colors.surface, borderColor: colors.divider }]}>
                {/* Cover skeleton */}
                <View style={[st.cover, { height: COVER_H, backgroundColor: colors.surfaceElevated }]} />
                {/* Avatar skeleton */}
                <View style={[st.avatarWrap, {
                  width: AVATAR_SZ + 4, height: AVATAR_SZ + 4, borderRadius: (AVATAR_SZ + 4) / 2,
                  borderColor: colors.background, backgroundColor: colors.surfaceElevated, marginTop: -(AVATAR_SZ / 2),
                }]} />
                <View style={[st.cardBody, { paddingTop: AVATAR_SZ / 2 + 8 }]}>
                  <View style={{ height: 13, width: '65%', borderRadius: 6, backgroundColor: colors.surfaceElevated, marginTop: AVATAR_SZ / 2 + 10 }} />
                  <View style={{ height: 10, width: '45%', borderRadius: 5, backgroundColor: colors.surfaceElevated, marginTop: 7 }} />
                  <View style={[st.btnSkeleton, { backgroundColor: colors.surfaceElevated }]} />
                </View>
              </View>
            ))
          : visible.map(item => {
              const name     = item.display_name ?? item.username ?? 'Utilisateur';
              const initials = name[0]?.toUpperCase() ?? '?';
              const state    = itemState[item.id] ?? 'idle';
              // En mode controle, l'etat "suivi" vient de la source de verite
              // partagee (persiste au remontage du composant) ; sinon on garde
              // l'ancien etat local. `is_following` de l'API sert d'amorce si
              // le parent ne fournit pas encore la liste.
              const followed = controlled
                ? followingSet!.has(item.id)
                : (state === 'followed' || (item as any).is_following === true);

              return (
                <View key={item.id} style={[st.card, { width: CARD_W, backgroundColor: colors.surface, borderColor: colors.divider }]}>

                  {/* Bouton X */}
                  <TouchableOpacity
                    style={[st.closeBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                    onPress={() => handleDismiss(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="x" size={11} color="#fff" />
                  </TouchableOpacity>

                  {/* Cover gradient */}
                  <TouchableOpacity activeOpacity={0.9} onPress={() => onUserPress(item.id)}>
                    <LinearGradient
                      colors={[colors.primary + 'DD', colors.primary + '44']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[st.cover, { height: COVER_H }]}
                    />
                  </TouchableOpacity>

                  {/* Avatar chevauchant */}
                  <View style={{ alignSelf: 'center', marginTop: -(AVATAR_SZ / 2) }}>
                    <TouchableOpacity
                      onPress={() => {
                        const isLive = item.is_live || liveUserIds.has(item.id);
                        if (isLive) joinUserLive(item.id);
                        else onUserPress(item.id);
                      }}
                      activeOpacity={0.9}
                      disabled={joiningLiveId === item.id}
                    >
                      <AvatarWithBadge
                        avatarUrl={item.avatar_url}
                        initials={initials}
                        size={AVATAR_SZ}
                        accentColor={colors.primary}
                        isOnline={item.is_online}
                        isLive={item.is_live || liveUserIds.has(item.id)}
                      />
                      {joiningLiveId === item.id && (
                        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                          <ActivityIndicator color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Infos */}
                  <View style={[st.cardBody, { paddingTop: AVATAR_SZ / 2 + 8 }]}>
                    <TouchableOpacity onPress={() => onUserPress(item.id)} activeOpacity={0.8} style={{ alignItems: 'center', width: '100%' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <Text style={[st.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
                        {item.is_verified && <VerifiedBadge size={13} />}
                      </View>
                      {item.username && (
                        <Text style={[st.handle, { color: colors.textTertiary }]} numberOfLines={1}>@{item.username}</Text>
                      )}
                      {item.is_contact ? (
                        <View style={[st.signalPill, { backgroundColor: colors.primary + '18' }]}>
                          <Icon name="user-check" size={10} color={colors.primary} />
                          <Text style={[st.signalText, { color: colors.primary }]}>Dans vos contacts</Text>
                        </View>
                      ) : item.distance_km != null ? (
                        <View style={[st.signalPill, { backgroundColor: colors.textTertiary + '18' }]}>
                          <Icon name="map-pin" size={10} color={colors.textTertiary} />
                          <Text style={[st.signalText, { color: colors.textTertiary }]}>
                            À {item.distance_km < 1 ? '< 1' : Math.round(item.distance_km)} km
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>

                    {/* Bouton Suivre */}
                    <TouchableOpacity
                      style={[
                        st.followBtn,
                        followed
                          ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border }
                          : { backgroundColor: colors.primary },
                      ]}
                      onPress={() => {
                        if (state === 'loading') return;
                        // Mode controle : un retap sur "Abonne" declenche le
                        // unfollow (le parent gere le sens via followingSet).
                        if (controlled || !followed) handleFollow(item.id);
                      }}
                      disabled={state === 'loading'}
                      activeOpacity={0.8}
                    >
                      {state === 'loading' ? (
                        <ActivityIndicator size="small" color={followed ? colors.primary : '#fff'} />
                      ) : (
                        <>
                          <Icon
                            name={followed ? 'user-check' : 'user-plus'}
                            size={14}
                            color={followed ? colors.textSecondary : '#fff'}
                          />
                          <Text style={[st.followText, { color: followed ? colors.textSecondary : '#fff' }]}>
                            {followed ? 'Abonné ✓' : 'Suivre'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
        }
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  // Carte flottante "douce" — même modèle que PostCard / FeedCard.
  wrap:       {
    paddingTop:       14,
    paddingBottom:    14,
    marginHorizontal: FeedCardLayout.marginHorizontal,
    marginBottom:     FeedCardLayout.gutter,
    borderRadius:     FeedCardLayout.radius,
    borderWidth:      FeedCardLayout.borderWidth,
    overflow:         'hidden',
  },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: FeedCardLayout.padH, marginBottom: 12 },
  title:      { fontSize: 16, fontWeight: '800' },
  subtitle:   { fontSize: 11, marginTop: 2 },
  seeAll:     { fontSize: 13, fontWeight: '700' },
  list:       { paddingHorizontal: FeedCardLayout.padH, gap: 10, paddingBottom: 4 },

  // width/height dépendants de la taille d'écran (CARD_W/COVER_H/AVATAR_SZ) ne
  // sont PAS ici — ils viennent de useCardSizes() et sont appliqués en inline
  // à chaque site d'usage (voir card/cover/avatarWrap/cardBody ci-dessous).
  card:       { borderRadius: FeedRadius.media, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover:      { width: '100%' },
  closeBtn:   { position: 'absolute', top: 8, right: 8, zIndex: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  avatarWrap: { borderWidth: 3, overflow: 'visible', alignSelf: 'center' },

  cardBody:   { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, gap: 4 },
  name:       { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  handle:     { fontSize: 11, textAlign: 'center' },
  signalPill: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  signalText: { fontSize: 10, fontWeight: '700' },

  followBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, borderRadius: 8, paddingVertical: 10, width: '100%' },
  btnSkeleton:{ height: 38, borderRadius: 8, width: '100%', marginTop: 8 },
  followText: { fontSize: 14, fontWeight: '700' },
});
