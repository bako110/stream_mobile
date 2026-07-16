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
  StyleSheet, ActivityIndicator, Alert, FlatList, Dimensions,
  InteractionManager,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { BackButton, SkeletonUserProfile, VerifiedBadge } from '../../components/common';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { postService } from '../../services/postService';
import { liveService } from '../../services/liveService';
import { useWs } from '../../context/WebSocketContext';
import type { UserPublicProfile, UserPublic } from '../../types/user';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Post } from '../../types/post';

const { width: W } = Dimensions.get('window');

// Friend cards dimensions
const FRIEND_GAP    = 10;
const FRIEND_H_PAD  = 16;
const FRIEND_CARD_W = (W - FRIEND_H_PAD * 2 - FRIEND_GAP * 2) / 3;
const FRIEND_COVER  = FRIEND_CARD_W * 0.5;
const FRIEND_AVT    = FRIEND_CARD_W * 0.44;

type ContentTab = 'publications' | 'reels' | 'about';

interface Props {
  route: { params: { userId: string } };
  navigation: any;
}

export const UserProfileScreen: React.FC<Props> = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { userId } = route.params;
  const { currentUser } = useUser();
  const { lastPresenceUpdate, liveUserIds } = useWs();

  const [profile, setProfile]   = useState<UserPublicProfile | null>(null);
  const [profileIsOnline, setProfileIsOnline] = useState<boolean | null>(null);
  const [loading, setLoading]   = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [showList, setShowList] = useState<'followers' | 'following' | null>(null);
  const [listUsers, setListUsers] = useState<UserPublic[]>([]);
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
        Alert.alert('Live introuvable', 'Ce live n\'est plus disponible.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de rejoindre le live pour le moment.');
    } finally {
      setJoiningLive(false);
    }
  }, [joiningLive, userId, navigation]);

  // Content tabs
  const [activeTab, setActiveTab] = useState<ContentTab>('publications');
  const [userEvents,   setUserEvents]   = useState<Event[]>([]);
  const [userConcerts, setUserConcerts] = useState<Concert[]>([]);
  const [userReels,    setUserReels]    = useState<any[]>([]);
  const [userPosts,    setUserPosts]    = useState<Post[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [friends, setFriends] = useState<UserPublic[]>([]);

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
      Alert.alert('Erreur', e?.message ?? 'Action échouée');
    } finally { setFollowLoading(false); }
  };

  const handleBlock = async () => {
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await userService.unblock(userId);
        setIsBlocked(false);
      } else {
        Alert.alert(
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
                  Alert.alert('Erreur', e?.message ?? 'Action échouée');
                } finally { setBlockLoading(false); }
              },
            },
          ],
        );
        return;
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Action échouée');
    } finally { setBlockLoading(false); }
  };

  const openList = async (type: 'followers' | 'following') => {
    setShowList(type);
    try {
      const users = type === 'followers'
        ? await userService.getFollowers(userId)
        : await userService.getFollowing(userId);
      setListUsers(users);
    } catch { setListUsers([]); }
  };

  if (loading) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: colors.background }]}>
        <SkeletonUserProfile />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: colors.background }]}>
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
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
          {!profileIsLive && profileIsOnline != null && (
            <View style={[styles.onlineBadge, { borderColor: colors.background, backgroundColor: profileIsOnline ? '#22C55E' : '#92400E' }]} />
          )}
          {profile.is_verified && (
            <View style={[styles.verifiedBadge, { backgroundColor: colors.primary }]}>
              <Icon name="check" size={10} color="#fff" />
            </View>
          )}
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
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Artiste</Text>
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
                    Habite à <Text style={{ fontWeight: '700' }}>{profile.location}</Text>
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
                <View style={styles.detailRow}>
                  <Icon name="phone" size={14} color={colors.textTertiary} />
                  <Text style={[styles.detailText, { color: colors.textPrimary }]}>{profile.phone}</Text>
                </View>
              ) : null}
              {profile.created_at ? (
                <View style={styles.detailRow}>
                  <Icon name="clock" size={14} color={colors.textTertiary} />
                  <Text style={[styles.detailText, { color: colors.textPrimary }]}>
                    Membre depuis <Text style={{ fontWeight: '700' }}>{formatDate(profile.created_at)}</Text>
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
                style={[styles.msgBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => navigation.navigate('Chat', {
                  partnerId:   profile!.id,
                  partnerName: profile!.display_name || profile!.username,
                  avatarUrl:   profile!.avatar_url ?? undefined,
                })}
              >
                <Icon name="message-circle" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.msgBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => navigation.navigate('Transfer', {
                  recipientId:     profile!.id,
                  recipientName:   profile!.display_name || profile!.username,
                  recipientAvatar: profile!.avatar_url ?? undefined,
                })}
              >
                <Text style={{ fontSize: 16 }}>🪙</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.msgBtn, {
                  backgroundColor: isBlocked ? '#FF3B3018' : colors.surfaceElevated,
                  borderColor: isBlocked ? '#FF3B30' : colors.border,
                }]}
                onPress={handleBlock}
                disabled={blockLoading}
              >
                {blockLoading
                  ? <ActivityIndicator size="small" color="#FF3B30" />
                  : <Icon name={isBlocked ? 'slash' : 'user-x'} size={16} color={isBlocked ? '#FF3B30' : colors.textSecondary} />
                }
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
                    style={[styles.friendCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}
                    activeOpacity={0.85}
                    onPress={() => navigation.push('UserProfile', { userId: f.id })}
                  >
                    {/* Cover gradient */}
                    <LinearGradient
                      colors={[colors.primary + 'CC', colors.primary + '44']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={styles.friendCover}
                    >
                      {f.is_online && (
                        <View style={[styles.friendOnline, { borderColor: colors.surfaceElevated }]} />
                      )}
                    </LinearGradient>

                    {/* Avatar chevauchant */}
                    <View style={[styles.friendAvtWrap, { borderColor: colors.surface, marginTop: -(FRIEND_AVT / 2) }]}>
                      {f.avatar_url ? (
                        <Image source={{ uri: f.avatar_url }} style={styles.friendAvtImg} />
                      ) : (
                        <LinearGradient colors={[colors.primary, colors.primary + 'AA']} style={styles.friendAvtImg}>
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
                    <View style={styles.friendCardBody}>
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

        {/* ── Onglets contenu ─────────────────────────────────────────── */}
        {!isPrivateProfile && (
        <View style={[styles.tabBar, { borderBottomColor: colors.divider }]}>
          {([
            { key: 'publications' as const, label: 'Publications', icon: 'grid' },
            { key: 'reels' as const,        label: 'Reels',        icon: 'play-circle' },
            { key: 'about' as const,        label: 'À propos',     icon: 'info' },
          ]).map(tab => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabItem, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Icon name={tab.icon} size={18} color={active ? colors.primary : colors.textTertiary} />
                <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.textTertiary }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        )}

        {/* ── Contenu des onglets ─────────────────────────────────────── */}
        {!isPrivateProfile && contentLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !isPrivateProfile && activeTab === 'publications' ? (
          <View style={styles.contentSection}>
            {totalPubs === 0 ? (
              <View style={styles.emptyContent}>
                <Icon name="inbox" size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Aucune publication</Text>
              </View>
            ) : (
              <>
                {/* ── Posts — grille 3 colonnes ── */}
                {userPosts.length > 0 && (
                  <View style={styles.reelsGrid}>
                    {userPosts.map((post) => {
                      const p = post as any;
                      const thumb = p.thumbnail_url ?? p.media_url ?? p.image_url ?? p.media?.[0]?.url;
                      const likes  = p.likes_count  ?? p.like_count  ?? 0;
                      const cmts   = p.comments_count ?? p.comment_count ?? 0;
                      const label  = p.title ?? p.caption ?? p.content ?? '';
                      return (
                        <TouchableOpacity
                          key={`post-${post.id}`}
                          style={[styles.reelCard, { backgroundColor: colors.surfaceElevated }]}
                          activeOpacity={0.8}
                          onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
                        >
                          {thumb ? (
                            <Image source={{ uri: thumb }} style={styles.reelThumb} resizeMode="cover" />
                          ) : (
                            <LinearGradient
                              colors={[colors.gradientStart + '80', colors.gradientEnd + '40']}
                              style={[styles.reelThumb, { alignItems: 'center', justifyContent: 'center' }]}
                            >
                              <Icon name="image" size={24} color="rgba(255,255,255,0.6)" />
                            </LinearGradient>
                          )}
                          {/* overlay meta */}
                          <View style={styles.gridOverlay}>
                            <View style={styles.gridMetaRow}>
                              <Icon name="heart" size={11} color="#fff" />
                              <Text style={styles.gridMetaText}>{likes}</Text>
                              <Icon name="message-circle" size={11} color="#fff" />
                              <Text style={styles.gridMetaText}>{cmts}</Text>
                            </View>
                          </View>
                          {label ? (
                            <Text style={[styles.reelCaption, { color: colors.textSecondary }]} numberOfLines={1}>
                              {label}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ── Événements & Concerts — grille 2 colonnes ── */}
                {publications.length > 0 && (
                  <>
                    {userPosts.length > 0 && (
                      <View style={[styles.sectionDivider, { backgroundColor: colors.divider }]} />
                    )}
                    <View style={styles.pubGrid}>
                      {publications.map((pub) => {
                        const isEvent = pub.kind === 'event';
                        const item = pub.data as any;
                        const thumbUrl = item.thumbnail_url ?? item.banner_url;
                        const date = isEvent ? item.starts_at : item.scheduled_at;
                        const typeIcon = isEvent ? 'calendar' : 'music';
                        const typeLabel = isEvent ? 'Événement' : 'Concert';
                        const accent = isEvent ? '#E0389A' : '#7B3FF2';
                        return (
                          <TouchableOpacity
                            key={`${pub.kind}-${item.id}`}
                            style={[styles.pubGridCard, { backgroundColor: colors.surfaceElevated }]}
                            activeOpacity={0.8}
                            onPress={() => {
                              if (isEvent) navigation.navigate('EventDetail', { eventId: item.id });
                              else navigation.navigate('ConcertDetail', { concertId: item.id });
                            }}
                          >
                            {thumbUrl ? (
                              <Image source={{ uri: thumbUrl }} style={styles.pubGridThumb} resizeMode="cover" />
                            ) : (
                              <LinearGradient
                                colors={[accent + 'CC', accent + '66']}
                                style={[styles.pubGridThumb, { alignItems: 'center', justifyContent: 'center' }]}
                              >
                                <Icon name={typeIcon} size={32} color="rgba(255,255,255,0.8)" />
                              </LinearGradient>
                            )}
                            <View style={styles.pubGridBody}>
                              <View style={[styles.pubTypeBadge, { backgroundColor: accent + '18' }]}>
                                <Icon name={typeIcon} size={9} color={accent} />
                                <Text style={[styles.pubTypeText, { color: accent }]}>{typeLabel}</Text>
                              </View>
                              <Text style={[styles.pubGridTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                                {item.title}
                              </Text>
                              {date ? (
                                <View style={styles.pubMetaItem}>
                                  <Icon name="calendar" size={10} color={colors.textTertiary} />
                                  <Text style={[styles.pubMetaText, { color: colors.textTertiary }]}>{formatDate(date)}</Text>
                                </View>
                              ) : null}
                              {(item.venue_city ?? item.location) ? (
                                <View style={styles.pubMetaItem}>
                                  <Icon name="map-pin" size={10} color={colors.textTertiary} />
                                  <Text style={[styles.pubMetaText, { color: colors.textTertiary }]} numberOfLines={1}>
                                    {item.venue_city ?? item.location}
                                  </Text>
                                </View>
                              ) : null}
                              {item.ticket_price != null ? (
                                <View style={styles.pubMetaItem}>
                                  <Icon name="tag" size={10} color={accent} />
                                  <Text style={[styles.pubMetaText, { color: accent, fontWeight: '700' }]}>
                                    {item.ticket_price === 0 ? 'Gratuit' : `${item.ticket_price} GoGold`}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        ) : !isPrivateProfile && activeTab === 'reels' ? (
          <View style={styles.contentSection}>
            {userReels.length === 0 ? (
              <View style={styles.emptyContent}>
                <Icon name="video" size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Aucun reel</Text>
              </View>
            ) : (
              <View style={styles.reelsGrid}>
                {userReels.map((reel: any) => (
                  <TouchableOpacity
                    key={reel.id}
                    style={[styles.reelCard, { backgroundColor: colors.surfaceElevated }]}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('UserReels', { userId, initialReelId: reel.id, initialReels: userReels })}
                  >
                    {reel.thumbnail_url ? (
                      <Image source={{ uri: reel.thumbnail_url }} style={styles.reelThumb} resizeMode="cover" />
                    ) : (
                      <LinearGradient
                        colors={[colors.gradientStart + '80', colors.gradientEnd + '40']}
                        style={[styles.reelThumb, { alignItems: 'center', justifyContent: 'center' }]}
                      >
                        <Icon name="play" size={24} color="rgba(255,255,255,0.7)" />
                      </LinearGradient>
                    )}
                    {/* overlay meta : vues + likes */}
                    <View style={styles.gridOverlay}>
                      <View style={styles.gridMetaRow}>
                        <Icon name="play" size={11} color="#fff" />
                        <Text style={styles.gridMetaText}>{reel.view_count ?? 0}</Text>
                        <Icon name="heart" size={11} color="#fff" />
                        <Text style={styles.gridMetaText}>{reel.likes_count ?? 0}</Text>
                      </View>
                    </View>
                    {reel.caption ? (
                      <Text style={[styles.reelCaption, { color: colors.textSecondary }]} numberOfLines={1}>
                        {reel.caption}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : !isPrivateProfile ? (
          /* ── À propos ────────────────────────────────────────────── */
          <View style={[styles.contentSection, { paddingHorizontal: 20 }]}>
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
                    Habite à <Text style={{ fontWeight: '700' }}>{profile.location}</Text>
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
                <View style={styles.aboutRow}>
                  <Icon name="phone" size={16} color={colors.textTertiary} />
                  <Text style={[styles.aboutText, { color: colors.textPrimary }]}>{profile.phone}</Text>
                </View>
              ) : null}
              {profile.date_of_birth ? (
                <View style={styles.aboutRow}>
                  <Icon name="gift" size={16} color={colors.textTertiary} />
                  <Text style={[styles.aboutText, { color: colors.textPrimary }]}>
                    Né(e) le <Text style={{ fontWeight: '700' }}>{formatDate(profile.date_of_birth)}</Text>
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
                  <Text style={[styles.aboutText, { color: colors.accentGreen, fontWeight: '600' }]}>Compte vérifié</Text>
                </View>
              )}
              {profile.created_at ? (
                <View style={styles.aboutRow}>
                  <Icon name="clock" size={16} color={colors.textTertiary} />
                  <Text style={[styles.aboutText, { color: colors.textPrimary }]}>
                    Membre depuis <Text style={{ fontWeight: '700' }}>{formatDate(profile.created_at)}</Text>
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
          </View>
        ) : null}
      </ScrollView>


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
                        <Text style={{ color: colors.primary, fontWeight: '700' }}>{name[0].toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{name}</Text>
                      {u.username && <Text style={{ fontSize: 12, color: colors.textTertiary }}>@{u.username}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ color: colors.textTertiary }}>Aucun utilisateur</Text>
                </View>
              }
            />
          </View>
        </View>
      )}
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
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },

  avatarSection: { alignItems: 'center', marginTop: -44 },
  avatarRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 4, overflow: 'hidden' },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 28, fontWeight: '800' },
  verifiedBadge: { position: 'absolute', bottom: 2, right: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  onlineBadge:   { position: 'absolute', bottom: 4, left: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#22C55E', borderWidth: 3 },
  avatarRingLive: { width: 92, height: 92, borderRadius: 46, padding: 3, alignItems: 'center', justifyContent: 'center' },
  liveBadgeProfile: { position: 'absolute', alignSelf: 'center', bottom: -4, backgroundColor: '#F0365A', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  liveBadgeProfileText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  infoSection: {
    alignItems: 'center', marginHorizontal: 16, marginTop: 10,
    borderRadius: 16, padding: 16, gap: 4,
  },
  displayName: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  username: { fontSize: 14 },
  bio: { fontSize: 14, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },

  detailsSection: { marginTop: 10, gap: 6, alignSelf: 'stretch' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13 },

  statsRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 16, borderRadius: 12, paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },

  actionRow: {
    flexDirection: 'row', paddingHorizontal: 16, marginTop: 14, gap: 10, alignItems: 'center',
  },

  friendsSection:  { marginTop: 10, paddingTop: 14, paddingBottom: 16 },
  friendsHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  friendsTitle:    { fontSize: 16, fontWeight: '800' },
  friendsCount:    { fontSize: 11, marginTop: 2 },
  friendsSeeAll:   { fontSize: 13, fontWeight: '700' },
  friendsScroll:   { paddingHorizontal: 16, gap: FRIEND_GAP, paddingBottom: 4 },

  friendCard:      { width: FRIEND_CARD_W, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  friendCover:     { width: '100%', height: FRIEND_COVER },
  friendOnline:    { position: 'absolute', bottom: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: '#22c55e', borderWidth: 2 },

  friendAvtWrap:   { width: FRIEND_AVT + 4, height: FRIEND_AVT + 4, borderRadius: (FRIEND_AVT + 4) / 2, borderWidth: 3, overflow: 'hidden', alignSelf: 'center' },
  friendAvtImg:    { width: FRIEND_AVT, height: FRIEND_AVT, borderRadius: FRIEND_AVT / 2, alignItems: 'center', justifyContent: 'center' },
  friendInitial:   { color: '#fff', fontWeight: '800' },
  friendVerified:  { position: 'absolute', bottom: 1, right: 1, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },

  friendCardBody:  { alignItems: 'center', paddingHorizontal: 6, paddingBottom: 10, paddingTop: FRIEND_AVT / 2 + 5, gap: 2 },
  friendName:      { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  friendHandle:    { fontSize: 10, textAlign: 'center' },
  followBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: 10, borderWidth: 1,
  },
  followLabel: { fontSize: 15, fontWeight: '700' },
  msgBtn: {
    width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },

  // ── Tabs ──────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row', marginTop: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  tabLabel: { fontSize: 13, fontWeight: '600' },

  // ── Content ───────────────────────────────────────────────────────────────
  contentSection: { paddingVertical: 12 },
  emptyContent: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14 },

  // Publication grid (2 colonnes adaptatives)
  pubGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, gap: 10, marginBottom: 8,
  },
  pubGridCard: {
    width: (W - 24 - 10) / 2, borderRadius: 12, overflow: 'hidden',
  },
  pubGridThumb: { width: '100%', aspectRatio: 3 / 4 },
  pubGridBody: { padding: 10, gap: 5 },
  pubGridTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  pubTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4,
  },
  pubTypeText: { fontSize: 10, fontWeight: '800' },
  pubMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pubMetaText: { fontSize: 11 },

  // Reels / Posts grid
  reelsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 14, gap: 6,
  },
  reelCard: {
    width: (W - 28 - 12) / 3, borderRadius: 8, overflow: 'hidden', marginBottom: 4,
  },
  reelThumb: { width: '100%', aspectRatio: 9 / 16 },
  gridOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 6, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  gridMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridMetaText: {
    color: '#fff', fontSize: 10, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 2, marginRight: 4,
  },
  reelCaption: { fontSize: 11, paddingHorizontal: 6, paddingVertical: 4, lineHeight: 14 },

  // About
  aboutSection: { gap: 14, marginTop: 8 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aboutText: { fontSize: 14, flex: 1 },
  aboutBioBox: { padding: 16, borderRadius: 12, marginTop: 8, gap: 6 },
  aboutBioTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  aboutBioText: { fontSize: 14, lineHeight: 20 },

  // Profil privé
  privateBox: {
    margin: 16, marginTop: 20, padding: 24, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', gap: 10,
  },
  privateTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  privateSubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  sectionDivider: { height: 8, marginVertical: 8 },

  // Note confidentialité dans About
  privacyNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, marginTop: 4,
  },
  privacyNoteText: { fontSize: 12, flex: 1, lineHeight: 16 },

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
  listTitle: { fontSize: 18, fontWeight: '800' },
  listClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listAvatar: { width: 40, height: 40, borderRadius: 20 },
  listAvatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
