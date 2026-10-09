/**
 * UserProfileScreen — profil public complet style Facebook
 * - Banner + avatar + infos complètes
 * - Stats (abonnés/abonnements)
 * - Follow/Unfollow + Message
 * - Onglets: Publications (events+concerts) | Reels | À propos
 * - Liste followers/following en modal
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, FlatList, StatusBar,
  InteractionManager, useWindowDimensions, Modal,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight } from '../../theme';
import { TAB_BAR_HEIGHT } from '../../styles';
import { formatDurationSec, formatViewerCount } from '../../utils';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { BackButton, SkeletonUserProfile, VerifiedBadge, PriceWithLocal } from '../../components/common';
import { toastService, showConfirm } from '../../services';
import { openPhoneMenu } from '../../utils/phoneMenu';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { postService } from '../../services/postService';
import { liveService } from '../../services/liveService';
import { useWs } from '../../context/WebSocketContext';
import type { UserPublicProfile, UserPublic } from '../../types/user';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Post } from '../../types/post';

// Friend cards dimensions — gap/padding fixes, la largeur reelle (FRIEND_CARD_W
// et al.) est recalculee dans le composant via useWindowDimensions() (reactif
// aux changements de largeur : rotation, split-screen, pliable), plutot que
// Dimensions.get('window') fige une seule fois au chargement du module JS.
const FRIEND_GAP    = 10;
const FRIEND_H_PAD  = 16;

interface Props {
  route: { params: { userId: string } };
  navigation: any;
}

export const UserProfileScreen: React.FC<Props> = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  // Reactif (rotation, split-screen, pliable) — remplace Dimensions.get('window')
  // fige au chargement du module, qui laissait un espace vide a droite des
  // grilles 2/3 colonnes quand la largeur reelle differait de la valeur figee.
  const { width: W } = useWindowDimensions();
  const FRIEND_CARD_W = (W - FRIEND_H_PAD * 2 - FRIEND_GAP * 2) / 3;
  const FRIEND_COVER  = FRIEND_CARD_W * 0.5;
  const FRIEND_AVT    = FRIEND_CARD_W * 0.44;
  // Nombre de colonnes adaptatif : 2/3 sur téléphone, davantage sur tablette /
  // pliable ouvert — sinon les vignettes deviennent démesurées et la grille
  // paraît "mal disposée" sur les grands écrans.
  const PUB_COLS  = Math.max(2, Math.min(4, Math.floor((W - 24) / 200)));
  const pubGridCardW  = (W - 24 - 8 * (PUB_COLS - 1)) / PUB_COLS;
  // Gap fixe entre les cartes des mini-grilles d'aperçu (flex:1 sur chaque
  // carte, pas de largeur calculée — avec moins de cartes que de colonnes,
  // elles s'élargissent pour occuper toute la largeur au lieu de laisser un
  // vide).
  const REEL_GAP = 5;
  const { userId } = route.params;
  const { currentUser } = useUser();
  const { lastPresenceUpdate, liveUserIds } = useWs();

  const [profile, setProfile]   = useState<UserPublicProfile | null>(null);
  const [profileIsOnline, setProfileIsOnline] = useState<boolean | null>(null);
  const [loading, setLoading]   = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [showList, setShowList] = useState<'followers' | 'following' | null>(null);
  const [listUsers, setListUsers] = useState<UserPublic[]>([]);
  const [listPage, setListPage] = useState(1);
  const [listHasMore, setListHasMore] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const LIST_PAGE_LIMIT = 30;
  const [myId, setMyId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [joiningLive, setJoiningLive] = useState(false);
  const openViewer = (url: string, label: string) => {
    navigation.navigate('ImageViewer', { url, label });
  };

  const joinProfileLive = useCallback(async () => {
    if (joiningLive) return;
    setJoiningLive(true);
    try {
      const lives = await liveService.getLives();
      const live = lives.find(l => String(l.user_id) === String(userId));
      if (live) {
        navigation.navigate('SimpleLiveViewer', { liveId: live.id });
      } else {
        toastService.error('Live introuvable', 'Ce live n\'est plus disponible.');
      }
    } catch {
      toastService.error('Erreur', 'Impossible de rejoindre le live pour le moment.');
    } finally {
      setJoiningLive(false);
    }
  }, [joiningLive, userId, navigation]);

  // Cale de status bar : visible seulement une fois la bannière dépassée.
  const [scrolledPastBanner, setScrolledPastBanner] = useState(false);
  const onProfileScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // 180 = hauteur bannière (styles.bannerWrap) ; on bascule ~une ligne avant.
    const past = e.nativeEvent.contentOffset.y > 180 - insets.top - 8;
    setScrolledPastBanner(prev => (prev === past ? prev : past));
  }, [insets.top]);

  // Contenu (publications/reels/galerie/à propos) — aperçus directs (4
  // derniers éléments), plus d'onglets à cliquer. Bottom sheet "Voir tout son
  // contenu" pour choisir la catégorie à voir en détail.
  const [userEvents,   setUserEvents]   = useState<Event[]>([]);
  const [userConcerts, setUserConcerts] = useState<Concert[]>([]);
  const [userReels,    setUserReels]    = useState<any[]>([]);
  const [userPosts,    setUserPosts]    = useState<Post[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [friends, setFriends] = useState<UserPublic[]>([]);
  const [showContentSheet, setShowContentSheet] = useState(false);
  const [showAboutSheet,   setShowAboutSheet]   = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, me, followersRes, followingRes] = await Promise.allSettled([
        userService.getPublicProfile(userId),
        authService.getMe(),
        userService.getFollowers(userId),
        userService.getFollowing(userId),
      ]);
      if (p.status === 'fulfilled') {
        setProfile(p.value);
      } else if (me.status === 'fulfilled') {
        const m = me.value;
        const followersCount = followersRes.status === 'fulfilled' ? followersRes.value.length : 0;
        const followingCount = followingRes.status === 'fulfilled' ? followingRes.value.length : 0;
        const fallback: UserPublicProfile = {
          id: String(m.id),
          username: m.username,
          display_name: m.display_name,
          avatar_url: m.avatar_url,
          banner_url: m.banner_url,
          role: m.role,
          bio: m.bio,
          location: m.location,
          website: m.website,
          first_name: m.first_name,
          last_name: m.last_name,
          phone: m.phone,
          date_of_birth: m.date_of_birth,
          gender: m.gender,
          created_at: m.created_at,
          followers_count: followersCount,
          following_count: followingCount,
          is_followed: false,
          is_verified: m.is_verified,
        };
        setProfile(fallback);
      }
      if (me.status === 'fulfilled') {
        setMyId(String(me.value.id));
      }

      setContentLoading(true);
      const followingList = followingRes.status === 'fulfilled' ? followingRes.value : [];
      const [evts, ccs, reels, posts] = await Promise.allSettled([
        userService.getUserEvents(userId),
        userService.getUserConcerts(userId),
        userService.getUserReels(userId),
        postService.getByUser(userId),
      ]);
      if (evts.status === 'fulfilled')   setUserEvents(evts.value);
      if (ccs.status === 'fulfilled')    setUserConcerts(ccs.value);
      if (reels.status === 'fulfilled')  setUserReels(Array.isArray(reels.value) ? reels.value : []);
      if (posts.status === 'fulfilled')  setUserPosts(posts.value);
      setFriends(followingList.slice(0, 10));
      setContentLoading(false);
    } catch { /**/ }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { load(); });
    return () => task.cancel();
  }, [load]);

  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    const unsub = navigation.addListener('focus', () => { load(); });
    return unsub;
  }, [navigation, load]);

  // Sync is_online initial depuis le profil chargé (null si backend n'a pas renvoyé la data)
  useEffect(() => {
    if (profile) setProfileIsOnline(profile.is_online == null ? null : profile.is_online === true);
  }, [profile?.id, profile?.is_online]);

  // Mise à jour temps réel du statut en ligne via WebSocket
  useEffect(() => {
    if (!lastPresenceUpdate) return;
    if (String(lastPresenceUpdate.user_id) !== String(userId)) return;
    setProfileIsOnline(lastPresenceUpdate.is_online === true);
  }, [lastPresenceUpdate, userId]);

  // Sync avatar/banner instantanément si c'est mon propre profil
  useEffect(() => {
    if (!currentUser || !profile) return;
    if (String(currentUser.id) !== String(userId)) return;
    setProfile(prev => prev ? {
      ...prev,
      avatar_url: currentUser.avatar_url ?? prev.avatar_url,
      banner_url: currentUser.banner_url ?? prev.banner_url,
      display_name: currentUser.display_name ?? prev.display_name,
      username: currentUser.username ?? prev.username,
      bio: currentUser.bio ?? prev.bio,
    } : prev);
  }, [currentUser?.avatar_url, currentUser?.banner_url, currentUser?.display_name]);

  const isMe = myId !== null && String(myId) === String(userId);
  const profileIsLive = !!(profile?.is_live || liveUserIds.has(userId));

  const handleFollow = async () => {
    if (!profile) return;
    setFollowLoading(true);
    try {
      if (profile.is_followed) {
        await userService.unfollow(userId);
      } else {
        await userService.follow(userId);
      }
      setProfile(prev => prev ? {
        ...prev,
        is_followed: !prev.is_followed,
        followers_count: prev.is_followed ? prev.followers_count - 1 : prev.followers_count + 1,
      } : prev);
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? 'Action échouée');
    } finally { setFollowLoading(false); }
  };

  const handleBlock = async () => {
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await userService.unblock(userId);
        setIsBlocked(false);
      } else {
        showConfirm(
          'Bloquer cet utilisateur',
          `${profile?.display_name ?? profile?.username ?? 'Cet utilisateur'} ne pourra plus voir vos activités ni vous contacter.`,
          [
            { text: 'Annuler', style: 'cancel', onPress: () => setBlockLoading(false) },
            {
              text: 'Bloquer', style: 'destructive',
              onPress: async () => {
                try {
                  await userService.block(userId);
                  setIsBlocked(true);
                  setProfile(prev => prev ? { ...prev, is_followed: false } : prev);
                } catch (e: any) {
                  toastService.error('Erreur', e?.message ?? 'Action échouée');
                } finally { setBlockLoading(false); }
              },
            },
          ],
        );
        return;
      }
    } catch (e: any) {
      toastService.error('Erreur', e?.message ?? 'Action échouée');
    } finally { setBlockLoading(false); }
  };

  const openList = async (type: 'followers' | 'following') => {
    setShowList(type);
    setListUsers([]);
    setListPage(1);
    setListHasMore(true);
    try {
      const users = type === 'followers'
        ? await userService.getFollowers(userId, 1, LIST_PAGE_LIMIT)
        : await userService.getFollowing(userId, 1, LIST_PAGE_LIMIT);
      setListUsers(users);
      setListHasMore(users.length === LIST_PAGE_LIMIT);
    } catch { setListUsers([]); setListHasMore(false); }
  };

  const loadMoreList = async () => {
    if (!showList || listLoadingMore || !listHasMore) return;
    setListLoadingMore(true);
    try {
      const nextPage = listPage + 1;
      const users = showList === 'followers'
        ? await userService.getFollowers(userId, nextPage, LIST_PAGE_LIMIT)
        : await userService.getFollowing(userId, nextPage, LIST_PAGE_LIMIT);
      setListUsers(prev => [...prev, ...users]);
      setListPage(nextPage);
      setListHasMore(users.length === LIST_PAGE_LIMIT);
    } catch { setListHasMore(false); }
    finally { setListLoadingMore(false); }
  };

  const bar = (
    <StatusBar
      translucent
      backgroundColor="transparent"
      barStyle={theme.isDark ? 'light-content' : 'dark-content'}
    />
  );

  if (loading) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: colors.background }]}>
        {bar}
        <SkeletonUserProfile />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: colors.background }]}>
        {bar}
        <Icon name="user-x" size={48} color={colors.textTertiary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Profil introuvable</Text>
      </View>
    );
  }

  const displayName = profile.display_name ?? profile.username ?? 'Utilisateur';
  const initials = displayName[0]?.toUpperCase() ?? '?';
  const publications = [
    ...userEvents.map(e => ({ kind: 'event' as const, data: e })),
    ...userConcerts.map(c => ({ kind: 'concert' as const, data: c })),
  ];
  const totalPubs = publications.length + userPosts.length;

  // Profil privé : le backend renvoie is_private=true et un profil minimal
  const isPrivateProfile = !isMe && !!profile.is_private;

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {bar}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 40 }}
        onScroll={onProfileScroll}
        scrollEventThrottle={16}
      >
        {/* ── Hero (bannière + avatar + identité) — défile normalement avec
            le reste du contenu, dans le flux du ScrollView. ── */}
        {/* ── Banner ──────────────────────────────────────────────────── */}
        <View style={styles.bannerWrap}>
          <TouchableOpacity
            activeOpacity={profile.banner_url ? 0.85 : 1}
            onPress={() => profile.banner_url && openViewer(profile.banner_url, 'Photo de couverture')}
            style={{ flex: 1 }}
          >
            {profile.banner_url ? (
              <Image source={{ uri: profile.banner_url }} style={styles.banner} />
            ) : (
              <LinearGradient
                colors={[colors.primary + 'CC', colors.primary + '66']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.banner}
              />
            )}
          </TouchableOpacity>
          <View style={styles.headerOverlay}>
            {/* Haut : bouton retour */}
            <View style={{ flexDirection: 'row', paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
              <BackButton onPress={() => navigation.goBack()} />
            </View>
            {/* Bas : nom sur degrade */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 30 }}
            >
              <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
            </LinearGradient>
          </View>
        </View>

        {/* ── Avatar ──────────────────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarBadgeAnchor}>
          <TouchableOpacity
            activeOpacity={profile.avatar_url || profileIsLive ? 0.85 : 1}
            disabled={joiningLive}
            onPress={() => {
              if (profileIsLive) joinProfileLive();
              else if (profile.avatar_url) openViewer(profile.avatar_url, 'Photo de profil');
            }}
          >
            {profileIsLive ? (
              <LinearGradient colors={['#F0365A', '#E0389A', '#7B3FF2']} style={styles.avatarRingLive}>
                <View style={[styles.avatarRing, { borderWidth: 0, width: 80, height: 80, borderRadius: 40 }]}>
                  {profile.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                      <Text style={styles.avatarInitial}>{initials}</Text>
                    </View>
                  )}
                  {joiningLive && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', borderRadius: 40 }]}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                </View>
                <View style={styles.liveBadgeProfile}>
                  <Text style={styles.liveBadgeProfileText}>LIVE</Text>
                </View>
              </LinearGradient>
            ) : (
              <View style={[styles.avatarRing, { borderColor: colors.background }]}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarInitial}>{initials}</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
          {!profileIsLive && profileIsOnline && (
            <View style={[styles.onlineBadge, { borderColor: colors.background, backgroundColor: '#22C55E' }]} />
          )}
          </View>
        </View>

        {/* ── Nom + Bio + Détails ─────────────────────────────────────── */}
        <View style={[styles.infoSection, { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Text style={[styles.displayName, { color: colors.textPrimary }]}>{displayName}</Text>
            {profile.is_verified && <VerifiedBadge size={20} />}
          </View>
          {profile.username && (
            <Text style={[styles.username, { color: colors.textTertiary }]}>@{profile.username}</Text>
          )}
          {profile.role === 'artist' && (
            <View style={[styles.roleBadge, { backgroundColor: colors.primary + '18' }]}>
              <Icon name="music" size={11} color={colors.primary} />
              <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, color: colors.primary }}>Artiste</Text>
            </View>
          )}
          {profile.bio && (
            <Text style={[styles.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>
          )}

          {/* Détails inline dans le même bloc */}
          {(profile.location || profile.website || profile.phone || profile.created_at) && (
            <View style={styles.detailsSection}>
              {profile.location ? (
                <View style={styles.detailRow}>
                  <Icon name="map-pin" size={14} color={colors.textTertiary} />
                  <Text style={[styles.detailText, { color: colors.textPrimary }]}>
                    Habite à <Text style={{ fontWeight: FontWeight.bold }}>{profile.location}</Text>
                  </Text>
                </View>
              ) : null}
              {profile.website ? (
                <View style={styles.detailRow}>
                  <Icon name="link" size={14} color={colors.primary} />
                  <Text style={[styles.detailText, { color: colors.primary }]}>{profile.website}</Text>
                </View>
              ) : null}
              {profile.phone ? (
                <TouchableOpacity style={styles.detailRow} onPress={() => openPhoneMenu(profile.phone!)} activeOpacity={0.7}>
                  <Icon name="phone" size={14} color={colors.textTertiary} />
                  <Text style={[styles.detailText, { color: colors.primary }]}>{profile.phone}</Text>
                </TouchableOpacity>
              ) : null}
              {profile.created_at ? (
                <View style={styles.detailRow}>
                  <Icon name="clock" size={14} color={colors.textTertiary} />
                  <Text style={[styles.detailText, { color: colors.textPrimary }]}>
                    Membre depuis <Text style={{ fontWeight: FontWeight.bold }}>{formatDate(profile.created_at)}</Text>
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* ── Stats ───────────────────────────────────────────────────── */}
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceElevated }]}>
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => openList('followers')}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{profile.followers_count}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Abonnés</Text>
          </TouchableOpacity>
          <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => openList('following')}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{profile.following_count}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Abonnements</Text>
          </TouchableOpacity>
          <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{totalPubs}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Publications</Text>
          </View>
        </View>

        {/* ── Actions (Follow / Message / Edit) ───────────────────────── */}
        <View style={styles.actionRow}>
          {isMe ? (
            <TouchableOpacity
              style={[styles.followBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Icon name="edit-2" size={16} color={colors.textPrimary} />
              <Text style={[styles.followLabel, { color: colors.textPrimary }]}>Modifier le profil</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.followBtn,
                  {
                    backgroundColor: profile.is_followed ? colors.surfaceElevated : colors.primary,
                    borderColor: profile.is_followed ? colors.border : colors.primary,
                  },
                ]}
                onPress={handleFollow}
                disabled={followLoading}
                activeOpacity={0.7}
              >
                {followLoading ? (
                  <ActivityIndicator size="small" color={profile.is_followed ? colors.textPrimary : '#fff'} />
                ) : (
                  <>
                    <Icon
                      name={profile.is_followed ? 'user-check' : 'user-plus'}
                      size={16}
                      color={profile.is_followed ? colors.textPrimary : '#fff'}
                    />
                    <Text style={[styles.followLabel, { color: profile.is_followed ? colors.textPrimary : '#fff' }]}>
                      {profile.is_followed ? 'Suivi(e)' : 'Suivre'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.msgBtn, { backgroundColor: '#3B82F618', borderColor: '#3B82F640' }]}
                onPress={() => navigation.navigate('Chat', {
                  partnerId:   profile!.id,
                  partnerName: profile!.display_name || profile!.username,
                  avatarUrl:   profile!.avatar_url ?? undefined,
                })}
              >
                <Icon name="message-circle" size={16} color="#3B82F6" />
                <Text style={[styles.msgBtnLabel, { color: '#3B82F6' }]}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.msgBtn, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}
                onPress={() => navigation.navigate('Transfer', {
                  recipientId:     profile!.id,
                  recipientName:   profile!.display_name || profile!.username,
                  recipientAvatar: profile!.avatar_url ?? undefined,
                })}
              >
                <Text style={{ fontSize: FontSize.md }}>🪙</Text>
                <Text style={[styles.msgBtnLabel, { color: '#F59E0B' }]}>Envoyer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.msgBtn, {
                  backgroundColor: isBlocked ? '#FF3B3018' : colors.surfaceElevated,
                  borderColor: isBlocked ? '#FF3B3040' : colors.border,
                }]}
                onPress={handleBlock}
                disabled={blockLoading}
              >
                {blockLoading
                  ? <ActivityIndicator size="small" color="#FF3B30" />
                  : <Icon name={isBlocked ? 'slash' : 'user-x'} size={16} color={isBlocked ? '#FF3B30' : colors.textSecondary} />
                }
                <Text style={[styles.msgBtnLabel, { color: isBlocked ? '#FF3B30' : colors.textSecondary }]}>
                  {isBlocked ? 'Débloquer' : 'Bloquer'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Amis (abonnements) ──────────────────────────────────────── */}
        {friends.length > 0 && (
          <View style={[styles.friendsSection, { backgroundColor: colors.surface }]}>
            <View style={styles.friendsHeader}>
              <View>
                <Text style={[styles.friendsTitle, { color: colors.textPrimary }]}>Amis</Text>
                <Text style={[styles.friendsCount, { color: colors.textTertiary }]}>
                  {profile.following_count} abonnement{profile.following_count > 1 ? 's' : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => openList('following')} activeOpacity={0.7}>
                <Text style={[styles.friendsSeeAll, { color: colors.primary }]}>Voir tout</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.friendsScroll}
            >
              {friends.map(f => {
                const name     = f.display_name || f.username || 'Utilisateur';
                const initials2 = name[0]?.toUpperCase() ?? '?';
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.friendCard, { width: FRIEND_CARD_W, backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}
                    activeOpacity={0.85}
                    onPress={() => navigation.push('UserProfile', { userId: f.id })}
                  >
                    {/* Cover gradient */}
                    <LinearGradient
                      colors={[colors.primary + 'CC', colors.primary + '44']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[styles.friendCover, { height: FRIEND_COVER }]}
                    >
                      {f.is_online && (
                        <View style={[styles.friendOnline, { borderColor: colors.surfaceElevated }]} />
                      )}
                    </LinearGradient>

                    {/* Avatar chevauchant */}
                    <View style={[styles.friendAvtWrap, {
                      width: FRIEND_AVT + 4, height: FRIEND_AVT + 4, borderRadius: (FRIEND_AVT + 4) / 2,
                      borderColor: colors.surface, marginTop: -(FRIEND_AVT / 2),
                    }]}>
                      {f.avatar_url ? (
                        <Image source={{ uri: f.avatar_url }} style={[styles.friendAvtImg, { width: FRIEND_AVT, height: FRIEND_AVT, borderRadius: FRIEND_AVT / 2 }]} />
                      ) : (
                        <LinearGradient colors={[colors.primary, colors.primary + 'AA']} style={[styles.friendAvtImg, { width: FRIEND_AVT, height: FRIEND_AVT, borderRadius: FRIEND_AVT / 2 }]}>
                          <Text style={[styles.friendInitial, { fontSize: FRIEND_AVT * 0.38 }]}>{initials2}</Text>
                        </LinearGradient>
                      )}
                      {f.is_verified && (
                        <View style={[styles.friendVerified, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
                          <Icon name="check" size={7} color="#fff" />
                        </View>
                      )}
                    </View>

                    {/* Nom */}
                    <View style={[styles.friendCardBody, { paddingTop: FRIEND_AVT / 2 + 5 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                        <Text style={[styles.friendName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
                        {f.is_verified && <VerifiedBadge size={11} />}
                      </View>
                      {f.username && (
                        <Text style={[styles.friendHandle, { color: colors.textTertiary }]} numberOfLines={1}>
                          @{f.username}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Bannière profil privé ────────────────────────────────────── */}
        {isPrivateProfile && (
          <View style={[styles.privateBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}>
            <Icon name="lock" size={22} color={colors.textTertiary} />
            <Text style={[styles.privateTitle, { color: colors.textPrimary }]}>Ce profil est privé</Text>
            <Text style={[styles.privateSubtitle, { color: colors.textTertiary }]}>
              Suivez {profile.display_name ?? profile.username} pour voir ses publications et informations.
            </Text>
          </View>
        )}

        {/* ── Aperçus de contenu (Publications / Reels récents) — carte
            flottante (même design que le reste de l'app). Plus d'onglets à
            cliquer : chaque catégorie affiche directement ses 4 derniers
            éléments ; le bouton en bas ouvre le bottom sheet pour voir le
            reste. overflow:'hidden' isolé sur une View enfant distincte de
            celle qui porte l'ombre — les mélanger couperait l'ombre portée
            sur iOS. ─────────────────────────────────────────────── */}
        {!isPrivateProfile && (
        <View style={{
          marginHorizontal: 10, borderRadius: 24, borderWidth: 1, borderColor: colors.divider,
          backgroundColor: colors.surface,
          shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
          shadowOffset: { width: 0, height: 5 }, elevation: 8,
          marginTop: 18,
        }}>
        <View style={{ borderRadius: 24, overflow: 'hidden', padding: 16, gap: 18 }}>

        {contentLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* ── Publications récentes — carte vedette (la plus récente) + grille,
                même langage visuel que la section Reels (styles contentFeatured*
                et reelCard/gridOverlay/gridTitleText partagés). Posts d'abord,
                événements/concerts en complément jusqu'à 4 (logique déjà en
                place), normalisés en une liste unique pour que l'item 0 devienne
                la carte vedette. ──────────────────────────── */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>PUBLICATIONS RÉCENTES</Text>
              {totalPubs === 0 ? (
                <View style={styles.emptyContent}>
                  <Icon name="inbox" size={32} color={colors.textTertiary} />
                  <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Aucune publication</Text>
                </View>
              ) : (
                <>
                  {(() => {
                    const pubItems = [
                      ...userPosts.map(post => {
                        const p = post as any;
                        const thumb = p.thumbnail_url ?? p.media_url ?? p.image_url ?? p.image_urls?.[0] ?? p.media?.[0]?.url ?? null;
                        return {
                          key: `post-${post.id}`,
                          kind: 'post' as const,
                          thumb,
                          caption: p.body || p.content || null,
                          likes: p.likes_count ?? p.like_count ?? 0,
                          comments: p.comments_count ?? p.comment_count ?? 0,
                          onPress: () => navigation.navigate('PostDetail', { postId: post.id }),
                        };
                      }),
                      ...publications.map(pub => {
                        const isEvent = pub.kind === 'event';
                        const item = pub.data as any;
                        return {
                          key: `${pub.kind}-${item.id}`,
                          kind: pub.kind,
                          thumb: item.thumbnail_url ?? item.banner_url ?? null,
                          caption: item.title ?? null,
                          likes: item.like_count ?? 0,
                          comments: item.comment_count ?? 0,
                          typeIcon: isEvent ? 'calendar' : 'music',
                          accent: isEvent ? '#E0389A' : '#7B3FF2',
                          onPress: () => {
                            if (isEvent) navigation.navigate('EventDetail', { eventId: item.id });
                            else navigation.navigate('ConcertDetail', { concertId: item.id });
                          },
                        };
                      }),
                    ].slice(0, 4);

                    const featured = pubItems[0];
                    const rest = pubItems.slice(1, 4);

                    return (
                      <>
                        {/* Carte vedette — publication la plus récente */}
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={featured.onPress}
                          style={[styles.contentFeaturedCard, { backgroundColor: colors.surfaceElevated }]}
                        >
                          {featured.thumb ? (
                            <Image source={{ uri: featured.thumb }} style={styles.contentFeaturedThumb} resizeMode="cover" />
                          ) : featured.kind === 'post' ? (
                            <View style={[styles.contentFeaturedThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary }]}>
                              <Icon name="file-text" size={32} color={colors.textTertiary} />
                            </View>
                          ) : (
                            <LinearGradient
                              colors={[(featured as any).accent + 'CC', (featured as any).accent + '66']}
                              style={[styles.contentFeaturedThumb, { alignItems: 'center', justifyContent: 'center' }]}
                            >
                              <Icon name={(featured as any).typeIcon} size={36} color="rgba(255,255,255,0.8)" />
                            </LinearGradient>
                          )}

                          <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.75)']}
                            style={styles.contentFeaturedOverlay}
                          >
                            {featured.caption ? (
                              <Text style={styles.contentFeaturedTitle} numberOfLines={2}>{featured.caption}</Text>
                            ) : null}
                            <View style={styles.contentFeaturedStatsRow}>
                              <View style={styles.gridMetaRow}>
                                <Icon name="heart" size={12} color="#fff" />
                                <Text style={styles.contentFeaturedStatText}>{formatViewerCount(featured.likes)}</Text>
                                <Text style={styles.contentFeaturedSep}>|</Text>
                                <Icon name="message-circle" size={12} color="#fff" />
                                <Text style={styles.contentFeaturedStatText}>{formatViewerCount(featured.comments)}</Text>
                              </View>
                              {featured.kind === 'post' && (
                                <View style={styles.contentFeaturedAuthorBadge}>
                                  <Icon name="user" size={10} color="#fff" />
                                  <Text style={styles.contentFeaturedStatText} numberOfLines={1}>{isMe ? 'Moi' : displayName}</Text>
                                </View>
                              )}
                            </View>
                          </LinearGradient>
                        </TouchableOpacity>

                        {/* Grille — les 3 publications suivantes. flex:1
                            (pas une largeur fixe) — avec moins de 3
                            éléments, les cartes s'élargissent pour occuper
                            toute la largeur au lieu de laisser un vide. */}
                        {rest.length > 0 && (
                          <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
                            {rest.map((it: any, idx: number) => (
                              <TouchableOpacity
                                key={it.key}
                                style={[
                                  styles.reelCard,
                                  {
                                    flex: 1,
                                    backgroundColor: colors.surfaceElevated,
                                    marginRight: idx === rest.length - 1 ? 0 : REEL_GAP,
                                  },
                                ]}
                                activeOpacity={0.8}
                                onPress={it.onPress}
                              >
                                <View style={styles.reelThumbWrap}>
                                  {it.thumb ? (
                                    <Image source={{ uri: it.thumb }} style={styles.reelThumb} resizeMode="cover" />
                                  ) : it.kind === 'post' ? (
                                    <View style={[styles.reelThumb, styles.reelThumbTextWrap, { backgroundColor: colors.backgroundSecondary }]}>
                                      <Icon name="file-text" size={24} color={colors.textTertiary} />
                                    </View>
                                  ) : (
                                    <LinearGradient
                                      colors={[it.accent + 'CC', it.accent + '66']}
                                      style={[styles.reelThumb, { alignItems: 'center', justifyContent: 'center' }]}
                                    >
                                      <Icon name={it.typeIcon} size={28} color="rgba(255,255,255,0.8)" />
                                    </LinearGradient>
                                  )}
                                  <View style={styles.gridOverlay}>
                                    {it.caption ? (
                                      <Text style={styles.gridTitleText} numberOfLines={1}>{it.caption}</Text>
                                    ) : null}
                                    <View style={styles.gridMetaRow}>
                                      <Icon name="heart" size={9} color="#fff" />
                                      <Text style={styles.gridMetaText}>{it.likes}</Text>
                                      <Icon name="message-circle" size={9} color="#fff" />
                                      <Text style={styles.gridMetaText}>{it.comments}</Text>
                                    </View>
                                  </View>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </View>

            {/* ── Reels récents — carte vedette (le plus récent) + grille ── */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>REELS RÉCENTS</Text>
              {userReels.length === 0 ? (
                <View style={styles.emptyContent}>
                  <Icon name="video" size={32} color={colors.textTertiary} />
                  <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Aucun reel</Text>
                </View>
              ) : (
                <>
                  {/* Carte vedette — reel le plus récent */}
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('UserReels', { userId, initialReelId: userReels[0].id, initialReels: userReels })}
                    style={[styles.contentFeaturedCard, { backgroundColor: colors.surfaceElevated }]}
                  >
                    {userReels[0].thumbnail_url ? (
                      <Image source={{ uri: userReels[0].thumbnail_url }} style={styles.contentFeaturedThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.contentFeaturedThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary }]}>
                        <Icon name="play" size={32} color={colors.textTertiary} />
                      </View>
                    )}

                    {userReels[0].duration_sec != null && (
                      <View style={styles.contentFeaturedDurationBadge}>
                        <Icon name="play" size={10} color="#fff" />
                        <Text style={styles.contentFeaturedDurationText}>{formatDurationSec(userReels[0].duration_sec)}</Text>
                      </View>
                    )}

                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.75)']}
                      style={styles.contentFeaturedOverlay}
                    >
                      {userReels[0].caption ? (
                        <Text style={styles.contentFeaturedTitle} numberOfLines={2}>{userReels[0].caption}</Text>
                      ) : null}
                      <View style={styles.contentFeaturedStatsRow}>
                        <View style={styles.gridMetaRow}>
                          <Icon name="eye" size={12} color="#fff" />
                          <Text style={styles.contentFeaturedStatText}>{formatViewerCount(userReels[0].view_count ?? 0)}</Text>
                          <Text style={styles.contentFeaturedSep}>|</Text>
                          <Icon name="heart" size={12} color="#fff" />
                          <Text style={styles.contentFeaturedStatText}>{formatViewerCount(userReels[0].likes_count ?? 0)}</Text>
                        </View>
                        <View style={styles.contentFeaturedAuthorBadge}>
                          <Icon name="user" size={10} color="#fff" />
                          <Text style={styles.contentFeaturedStatText} numberOfLines={1}>{displayName}</Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Grille — les 3 reels suivants. flex:1 (pas une largeur
                      fixe) — avec moins de 3 éléments, les cartes s'élargissent
                      pour occuper toute la largeur au lieu de laisser un vide. */}
                  {userReels.length > 1 && (
                    <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
                      {userReels.slice(1, 4).map((reel: any, idx: number, arr: any[]) => (
                        <TouchableOpacity
                          key={reel.id}
                          style={[
                            styles.reelCard,
                            {
                              flex: 1,
                              backgroundColor: colors.surfaceElevated,
                              marginRight: idx === arr.length - 1 ? 0 : REEL_GAP,
                            },
                          ]}
                          activeOpacity={0.8}
                          onPress={() => navigation.navigate('UserReels', { userId, initialReelId: reel.id, initialReels: userReels })}
                        >
                          {reel.thumbnail_url ? (
                            <Image source={{ uri: reel.thumbnail_url }} style={styles.reelThumb} resizeMode="cover" />
                          ) : (
                            <View style={[styles.reelThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary }]}>
                              <Icon name="play" size={24} color={colors.textTertiary} />
                            </View>
                          )}

                          {reel.duration_sec != null && (
                            <View style={styles.reelDurationBadge}>
                              <Icon name="play" size={8} color="#fff" />
                              <Text style={styles.reelDurationText}>{formatDurationSec(reel.duration_sec)}</Text>
                            </View>
                          )}

                          <View style={styles.gridOverlay}>
                            {reel.caption ? (
                              <Text style={styles.gridTitleText} numberOfLines={1}>{reel.caption}</Text>
                            ) : null}
                            <View style={styles.gridMetaRow}>
                              <Icon name="eye" size={9} color="#fff" />
                              <Text style={styles.gridMetaText}>{formatViewerCount(reel.view_count ?? 0)}</Text>
                              <Icon name="heart" size={9} color="#fff" />
                              <Text style={styles.gridMetaText}>{formatViewerCount(reel.likes_count ?? 0)}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ── Bouton "Voir tout son contenu" — ouvre le bottom sheet ── */}
            <TouchableOpacity
              onPress={() => setShowContentSheet(true)}
              activeOpacity={0.85}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 13, borderRadius: 14,
                backgroundColor: colors.primary + '14', borderWidth: 1, borderColor: colors.primary + '40',
              }}
            >
              <Icon name="layers" size={16} color={colors.primary} />
              <Text style={{ fontSize: FontSize.basePlus, fontWeight: FontWeight.bold, color: colors.primary }}>
                Voir tout son contenu
              </Text>
            </TouchableOpacity>
          </>
        )}
        </View>
        </View>
        )}
      </ScrollView>

      {/* Cale de status bar — apparaît dès qu'on a défilé au-delà de la
          bannière : le contenu ne "passe" alors plus sous l'heure/la
          batterie sur les écrans à encoche haute, et les icônes système
          restent lisibles. Pilotée par le scroll listener onProfileScroll. */}
      {scrolledPastBanner && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: insets.top,
            backgroundColor: colors.background,
          }}
        />
      )}

      {/* ── Followers/Following list modal ─────────────────────────── */}
      {showList && (
        <View style={styles.listOverlay}>
          <View style={[styles.listPanel, { backgroundColor: colors.surface }]}>
            <View style={[styles.listHeader, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.listTitle, { color: colors.textPrimary }]}>
                {showList === 'followers' ? 'Abonnés' : 'Abonnements'}
              </Text>
              <TouchableOpacity onPress={() => setShowList(null)} style={styles.listClose}>
                <Icon name="x" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={listUsers}
              keyExtractor={u => u.id}
              renderItem={({ item: u }) => {
                const name = u.display_name ?? u.username ?? '?';
                return (
                  <TouchableOpacity
                    style={[styles.listItem, { borderBottomColor: colors.divider }]}
                    onPress={() => { setShowList(null); navigation.push('UserProfile', { userId: u.id }); }}
                  >
                    {u.avatar_url ? (
                      <Image source={{ uri: u.avatar_url }} style={styles.listAvatar} />
                    ) : (
                      <View style={[styles.listAvatarFallback, { backgroundColor: colors.primary + '18' }]}>
                        <Text style={{ color: colors.primary, fontWeight: FontWeight.bold }}>{name[0].toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.semiBold, color: colors.textPrimary }}>{name}</Text>
                      {u.username && <Text style={{ fontSize: FontSize.sm, color: colors.textTertiary }}>@{u.username}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ color: colors.textTertiary }}>Aucun utilisateur</Text>
                </View>
              }
              onEndReached={loadMoreList}
              onEndReachedThreshold={0.4}
              ListFooterComponent={listLoadingMore ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
              ) : null}
            />
          </View>
        </View>
      )}

      {/* ── Bottom sheet "Voir tout son contenu" — glisse depuis le bas,
          propose Publications / Reels / Galerie / À propos. Au choix, ferme
          le sheet et navigue vers l'écran paginé correspondant (ou ouvre le
          second bottom sheet "À propos"). ── */}
      <Modal transparent animationType="slide" visible={showContentSheet} onRequestClose={() => setShowContentSheet(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowContentSheet(false)}
        >
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: insets.bottom + 20, paddingTop: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.divider, alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 6 }}>
              Que souhaitez-vous voir ?
            </Text>
            {([
              { key: 'posts',   label: 'Publications', icon: 'grid' },
              { key: 'reels',   label: 'Reels',         icon: 'play-circle' },
              { key: 'gallery', label: 'Galerie',       icon: 'image' },
              { key: 'about',   label: 'À propos',      icon: 'info' },
            ] as const).map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 15 }}
                activeOpacity={0.7}
                onPress={() => {
                  setShowContentSheet(false);
                  if (opt.key === 'posts') navigation.navigate('UserPosts', { userId });
                  else if (opt.key === 'reels') navigation.navigate('UserReelsGrid', { userId });
                  else if (opt.key === 'gallery') navigation.navigate('UserGallery', { userId });
                  else setShowAboutSheet(true);
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={opt.icon} size={19} color={colors.primary} />
                </View>
                <Text style={{ flex: 1, fontSize: FontSize.basePlus, fontWeight: FontWeight.semiBold, color: colors.textPrimary }}>
                  {opt.label}
                </Text>
                <Icon name="chevron-right" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Bottom sheet "À propos" — vue scrollable courte (bio, lieu, site,
          téléphone, date de naissance, genre, rôle), pas besoin d'un écran
          dédié paginé pour ce contenu. ── */}
      <Modal transparent animationType="slide" visible={showAboutSheet} onRequestClose={() => setShowAboutSheet(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowAboutSheet(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, maxHeight: '75%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.divider, alignSelf: 'center', marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 6 }}>
              <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.extraBold, color: colors.textPrimary }}>À propos</Text>
              <TouchableOpacity onPress={() => setShowAboutSheet(false)} style={{ padding: 4 }}>
                <Icon name="x" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
              <View style={styles.aboutSection}>
                {profile.first_name || profile.last_name ? (
                  <View style={styles.aboutRow}>
                    <Icon name="user" size={16} color={colors.textTertiary} />
                    <Text style={[styles.aboutText, { color: colors.textPrimary }]}>
                      {[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
                    </Text>
                  </View>
                ) : null}
                {profile.location ? (
                  <View style={styles.aboutRow}>
                    <Icon name="map-pin" size={16} color={colors.textTertiary} />
                    <Text style={[styles.aboutText, { color: colors.textPrimary }]}>
                      Habite à <Text style={{ fontWeight: FontWeight.bold }}>{profile.location}</Text>
                    </Text>
                  </View>
                ) : null}
                {profile.website ? (
                  <View style={styles.aboutRow}>
                    <Icon name="link" size={16} color={colors.primary} />
                    <Text style={[styles.aboutText, { color: colors.primary }]}>{profile.website}</Text>
                  </View>
                ) : null}
                {profile.phone ? (
                  <TouchableOpacity style={styles.aboutRow} onPress={() => openPhoneMenu(profile.phone!)} activeOpacity={0.7}>
                    <Icon name="phone" size={16} color={colors.textTertiary} />
                    <Text style={[styles.aboutText, { color: colors.primary }]}>{profile.phone}</Text>
                  </TouchableOpacity>
                ) : null}
                {profile.date_of_birth ? (
                  <View style={styles.aboutRow}>
                    <Icon name="gift" size={16} color={colors.textTertiary} />
                    <Text style={[styles.aboutText, { color: colors.textPrimary }]}>
                      Né(e) le <Text style={{ fontWeight: FontWeight.bold }}>{formatDate(profile.date_of_birth)}</Text>
                    </Text>
                  </View>
                ) : null}
                {profile.gender ? (
                  <View style={styles.aboutRow}>
                    <Icon name="users" size={16} color={colors.textTertiary} />
                    <Text style={[styles.aboutText, { color: colors.textPrimary }]}>
                      {profile.gender === 'male' ? 'Homme' : profile.gender === 'female' ? 'Femme' : profile.gender === 'other' ? 'Autre' : 'Non précisé'}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.aboutRow}>
                  <Icon name="briefcase" size={16} color={colors.textTertiary} />
                  <Text style={[styles.aboutText, { color: colors.textPrimary }]}>
                    {profile.role === 'artist' ? 'Artiste' : profile.role === 'admin' ? 'Administrateur' : 'Membre'}
                  </Text>
                </View>
                {profile.is_verified && (
                  <View style={styles.aboutRow}>
                    <Icon name="check-circle" size={16} color={colors.accentGreen} />
                    <Text style={[styles.aboutText, { color: colors.accentGreen, fontWeight: FontWeight.semiBold }]}>Compte vérifié</Text>
                  </View>
                )}
                {profile.created_at ? (
                  <View style={styles.aboutRow}>
                    <Icon name="clock" size={16} color={colors.textTertiary} />
                    <Text style={[styles.aboutText, { color: colors.textPrimary }]}>
                      Membre depuis <Text style={{ fontWeight: FontWeight.bold }}>{formatDate(profile.created_at)}</Text>
                    </Text>
                  </View>
                ) : null}
                {profile.bio ? (
                  <View style={[styles.aboutBioBox, { backgroundColor: colors.surfaceElevated }]}>
                    <Text style={[styles.aboutBioTitle, { color: colors.textTertiary }]}>BIO</Text>
                    <Text style={[styles.aboutBioText, { color: colors.textPrimary }]}>{profile.bio}</Text>
                  </View>
                ) : null}
                {/* Infos masquées par confidentialité */}
                {!isMe && (!profile.phone || !profile.date_of_birth || !profile.location) && (
                  <View style={[styles.privacyNote, { backgroundColor: colors.surfaceElevated }]}>
                    <Icon name="lock" size={13} color={colors.textTertiary} />
                    <Text style={[styles.privacyNoteText, { color: colors.textTertiary }]}>
                      Certaines informations sont masquées par les paramètres de confidentialité.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bannerWrap: { height: 180, position: 'relative', overflow: 'hidden' },
  banner: { width: '100%', height: '100%', resizeMode: 'cover' },
  headerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'column', justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.extraBold, letterSpacing: 0.2 },

  avatarSection: { alignItems: 'center', marginTop: -44 },
  // Enveloppe l'avatar avec sa taille EXACTE (88px, comme avatarRing) : sert de
  // référence de position pour onlineBadge (absolute). Une largeur explicite
  // est nécessaire ici — alignSelf/alignItems seuls ne suffisent pas à
  // contraindre la largeur d'une View non-flex dans ce contexte, le badge se
  // recalait alors sur toute la largeur de avatarSection (donc côté gauche
  // de l'écran) au lieu du bord droit réel de la photo.
  avatarBadgeAnchor: { width: 88, height: 88, alignSelf: 'center' },
  avatarRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 4, overflow: 'hidden' },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.extraBold },
  // Chevauche le bord du cercle de la photo (80px avatar + 4px bordure ring de
  // chaque côté) — même logique que AvatarWithBadge : légèrement en dehors du
  // bord réel de la photo, pas collé à l'intérieur.
  onlineBadge:   { position: 'absolute', bottom: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#22C55E', borderWidth: 3 },
  avatarRingLive: { width: 92, height: 92, borderRadius: 46, padding: 3, alignItems: 'center', justifyContent: 'center' },
  liveBadgeProfile: { position: 'absolute', alignSelf: 'center', bottom: -4, backgroundColor: '#F0365A', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  liveBadgeProfileText: { color: '#fff', fontSize: FontSize['2xs'], fontWeight: FontWeight.extraBold, letterSpacing: 0.4 },

  infoSection: {
    alignItems: 'center', marginHorizontal: 16, marginTop: 10,
    borderRadius: 16, padding: 16, gap: 4,
  },
  displayName: { fontSize: FontSize['2xl'], fontWeight: FontWeight.extraBold, textAlign: 'center' },
  username: { fontSize: FontSize.base },
  bio: { fontSize: FontSize.base, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },

  detailsSection: { marginTop: 10, gap: 6, alignSelf: 'stretch' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: FontSize.smPlus },

  statsRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 16, borderRadius: 12, paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: FontSize.lg, fontWeight: FontWeight.extraBold },
  statLabel: { fontSize: FontSize.xsPlus, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },

  actionRow: {
    flexDirection: 'row', paddingHorizontal: 16, marginTop: 14, gap: 10, alignItems: 'center',
  },

  friendsSection:  { marginTop: 10, paddingTop: 14, paddingBottom: 16 },
  friendsHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  friendsTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.extraBold },
  friendsCount:    { fontSize: FontSize.xsPlus, marginTop: 2 },
  friendsSeeAll:   { fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },
  friendsScroll:   { paddingHorizontal: 16, gap: FRIEND_GAP, paddingBottom: 4 },

  // Largeurs derivees de FRIEND_CARD_W retirees d'ici — appliquees en style
  // inline dans le composant (voir FRIEND_CARD_W/FRIEND_COVER/FRIEND_AVT
  // calcules via useWindowDimensions()), un StyleSheet.create() module-level
  // ne pouvant pas dependre d'une valeur reactive.
  friendCard:      { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  friendCover:     { width: '100%' },
  friendOnline:    { position: 'absolute', bottom: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: '#22c55e', borderWidth: 2 },

  friendAvtWrap:   { borderWidth: 3, overflow: 'hidden', alignSelf: 'center' },
  friendAvtImg:    { alignItems: 'center', justifyContent: 'center' },
  friendInitial:   { color: '#fff', fontWeight: FontWeight.extraBold },
  friendVerified:  { position: 'absolute', bottom: 1, right: 1, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },

  friendCardBody:  { alignItems: 'center', paddingHorizontal: 6, paddingBottom: 10, gap: 2 },
  friendName:      { fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, textAlign: 'center' },
  friendHandle:    { fontSize: FontSize.xs, textAlign: 'center' },
  followBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: 10, borderWidth: 1,
  },
  followLabel: { fontSize: FontSize.basePlus, fontWeight: FontWeight.bold },
  msgBtn: {
    minWidth: 64, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, gap: 3,
  },
  msgBtnLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  // ── Aperçus de contenu ──────────────────────────────────────────────────
  sectionTitle: { fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, letterSpacing: 1 },

  // ── Content ───────────────────────────────────────────────────────────────
  contentSection: { paddingVertical: 12 },
  emptyContent: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: FontSize.base },

  // Publication grid (2 colonnes adaptatives) — compacte : gap/padding resserres,
  // thumbnail legerement plus bas (4/5 au lieu de 3/4) pour plus de densite sans
  // sacrifier la lisibilite du titre/date/lieu affiches sous chaque carte.
  pubGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, gap: 8, marginBottom: 6,
  },
  // width retiree — appliquee en inline via pubGridCardW (useWindowDimensions())
  pubGridCard: {
    borderRadius: 10, overflow: 'hidden',
  },
  pubGridThumb: { width: '100%', aspectRatio: 4 / 5 },
  pubGridBody: { padding: 8, gap: 4 },
  pubGridTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, lineHeight: 16 },
  pubTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  pubTypeText: { fontSize: 9.5, fontWeight: FontWeight.extraBold },
  pubMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pubMetaText: { fontSize: FontSize.xs },

  // Reels / Posts grid
  // justifyContent: 'space-between' plutôt qu'un gap fixe + largeur calculée
  // en pixels arrondis — élimine tout résidu d'espace à droite causé par
  // l'arrondi flottant (3 cartes + 2 gaps ne retombent pas toujours
  // reelCard : flex:1 appliqué en inline (pas de largeur fixe) — avec moins
  // de cartes que de colonnes, elles s'élargissent pour occuper toute la
  // largeur au lieu de laisser un vide.
  reelCard: {
    aspectRatio: 9 / 16, borderRadius: 8, overflow: 'hidden',
  },
  reelThumbWrap: { position: 'relative' },
  reelThumb: { width: '100%', aspectRatio: 9 / 16 },
  reelThumbTextWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  gridOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 6, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  gridTitleText: {
    color: '#fff', fontSize: 10, fontWeight: FontWeight.bold, marginBottom: 2,
  },
  gridMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridMetaText: {
    color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 2, marginRight: 4,
  },
  reelDurationBadge: {
    position: 'absolute', top: 6, left: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  reelDurationText: { fontSize: 9, color: '#fff', fontWeight: FontWeight.bold },

  // Carte vedette (contenu le plus récent, pleine largeur) — partagée par
  // les sections Reels et Publications récentes (même langage visuel).
  contentFeaturedCard: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: 18,
    overflow: 'hidden', marginBottom: 4,
  },
  contentFeaturedThumb: { width: '100%', height: '100%' },
  contentFeaturedDurationBadge: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  contentFeaturedDurationText: { fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.bold },
  contentFeaturedOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 14, paddingTop: 28, paddingBottom: 12, gap: 4,
  },
  contentFeaturedTitle: { fontSize: FontSize.base, fontWeight: FontWeight.extraBold, color: '#fff' },
  contentFeaturedStatsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  contentFeaturedStatText: { fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.semiBold },
  contentFeaturedSep: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)' },
  contentFeaturedAuthorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)', maxWidth: 120,
  },
  // About
  aboutSection: { gap: 14, marginTop: 8 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aboutText: { fontSize: FontSize.base, flex: 1 },
  aboutBioBox: { padding: 16, borderRadius: 12, marginTop: 8, gap: 6 },
  aboutBioTitle: { fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, letterSpacing: 1 },
  aboutBioText: { fontSize: FontSize.base, lineHeight: 20 },

  // Profil privé
  privateBox: {
    margin: 16, marginTop: 20, padding: 24, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', gap: 10,
  },
  privateTitle: { fontSize: FontSize.mdPlus, fontWeight: FontWeight.bold, textAlign: 'center' },
  privateSubtitle: { fontSize: FontSize.smPlus, textAlign: 'center', lineHeight: 18 },

  sectionDivider: { height: 8, marginVertical: 8 },

  // Note confidentialité dans About
  privacyNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, marginTop: 4,
  },
  privacyNoteText: { fontSize: FontSize.sm, flex: 1, lineHeight: 16 },

  // Followers/Following modal
  listOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  listPanel: {
    height: '65%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.extraBold },
  listClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listAvatar: { width: 40, height: 40, borderRadius: 20 },
  listAvatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
