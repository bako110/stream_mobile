/**
 * UserProfileScreen — profil public complet style Facebook
 * - Banner + avatar + infos complètes
 * - Stats (abonnés/abonnements)
 * - Follow/Unfollow + Message
 * - Onglets: Publications (events+concerts) | Reels | À propos
 * - Liste followers/following en modal
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert, FlatList, Dimensions, Modal, StatusBar,
  InteractionManager,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { SkeletonUserProfile, VerifiedBadge } from '../../components/common';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { postService } from '../../services/postService';
import { PostCard } from '../../components/common';
import type { UserPublicProfile, UserPublic } from '../../types/user';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Post } from '../../types/post';

const { width: W } = Dimensions.get('window');

type ContentTab = 'publications' | 'reels' | 'about';

interface Props {
  route: { params: { userId: string } };
  navigation: any;
}

export const UserProfileScreen: React.FC<Props> = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { userId } = route.params;
  const { currentUser } = useUser();

  const [profile, setProfile]   = useState<UserPublicProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [showList, setShowList] = useState<'followers' | 'following' | null>(null);
  const [listUsers, setListUsers] = useState<UserPublic[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Content tabs
  const [activeTab, setActiveTab] = useState<ContentTab>('publications');
  const [userEvents,   setUserEvents]   = useState<Event[]>([]);
  const [userConcerts, setUserConcerts] = useState<Concert[]>([]);
  const [userReels,    setUserReels]    = useState<any[]>([]);
  const [userPosts,    setUserPosts]    = useState<Post[]>([]);
  const [contentLoading, setContentLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const meId = currentUser ? String(currentUser.id) : null;
      const isOwnProfile = meId !== null && meId === String(userId);

      const [p, me] = await Promise.allSettled([
        // Ne pas appeler getPublicProfile sur son propre profil → évite la notif de visite
        isOwnProfile ? Promise.reject(new Error('own')) : userService.getPublicProfile(userId),
        authService.getMe(),
      ]);
      if (p.status === 'fulfilled') {
        setProfile(p.value);
      } else {
        if (me.status === 'fulfilled') {
          const m = me.value;
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
            followers_count: 0,
            following_count: 0,
            is_followed: false,
            is_verified: m.is_verified,
          };
          setProfile(fallback);
        }
      }
      if (me.status === 'fulfilled') {
        setMyId(String(me.value.id));
      }

      // Charger contenu de l'utilisateur
      setContentLoading(true);
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
      setContentLoading(false);
    } catch (e) { console.warn('[UserProfile] load error:', e); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { load(); });
    return () => task.cancel();
  }, [load]);

  const isMe = myId !== null && String(myId) === String(userId);

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

  // Profil privé : aucun champ personnel n'est retourné par le backend
  const isPrivateProfile = !isMe && !profile.is_followed &&
    !profile.first_name && !profile.last_name &&
    !profile.location && !profile.website && !profile.phone &&
    !profile.date_of_birth && !profile.created_at;

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
            onPress={() => profile.banner_url && setViewerUrl(profile.banner_url)}
            style={{ flex: 1 }}
          >
            {profile.banner_url ? (
              <Image source={{ uri: profile.banner_url }} style={styles.banner} />
            ) : (
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                style={styles.banner}
              />
            )}
          </TouchableOpacity>
          <View style={styles.headerOverlay}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
              <Icon name="arrow-left" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {/* ── Avatar ──────────────────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            activeOpacity={profile.avatar_url ? 0.85 : 1}
            onPress={() => profile.avatar_url && setViewerUrl(profile.avatar_url)}
          >
            <View style={[styles.avatarRing, { borderColor: colors.background }]}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarInitial}>{initials}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          {profile.is_verified && (
            <View style={[styles.verifiedBadge, { backgroundColor: colors.primary }]}>
              <Icon name="check" size={10} color="#fff" />
            </View>
          )}
        </View>

        {/* ── Nom + Bio ───────────────────────────────────────────────── */}
        <View style={styles.infoSection}>
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
        </View>

        {/* ── Détails (localisation, site, membre depuis) ──────────── */}
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

        {/* ── Stats ───────────────────────────────────────────────────── */}
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceElevated }]}>
          <TouchableOpacity
            style={styles.statItem}
            onPress={isMe ? undefined : () => openList('followers')}
            activeOpacity={isMe ? 1 : 0.7}
          >
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{profile.followers_count}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Abonnés</Text>
          </TouchableOpacity>
          <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
          <TouchableOpacity
            style={styles.statItem}
            onPress={isMe ? undefined : () => openList('following')}
            activeOpacity={isMe ? 1 : 0.7}
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
                {/* ── Posts ── */}
                {userPosts.map((post, idx) => (
                  <Animated.View key={`post-${post.id}`} entering={FadeInDown.delay(idx * 40).springify()}>
                    <PostCard
                      post={post}
                      colors={colors}
                      currentUserId={myId ?? undefined}
                      onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
                      onAuthorPress={() => {
                        const aid = post.author?.id;
                        if (aid && aid !== userId) navigation.navigate('UserProfile', { userId: aid });
                      }}
                    />
                  </Animated.View>
                ))}

                {/* ── Événements & Concerts ── */}
                {publications.length > 0 && (
                  <>
                    {userPosts.length > 0 && (
                      <View style={[styles.sectionDivider, { backgroundColor: colors.divider }]} />
                    )}
                    {publications.map((pub, idx) => {
                      const isEvent = pub.kind === 'event';
                      const item = pub.data as any;
                      const thumbUrl = item.thumbnail_url ?? item.banner_url;
                      const date = isEvent ? item.starts_at : item.scheduled_at;
                      const city = item.venue_city;
                      const typeIcon = isEvent ? 'calendar' : 'music';
                      const typeLabel = isEvent ? 'Événement' : 'Concert';
                      const accent = isEvent ? '#E0389A' : '#7B3FF2';
                      return (
                        <Animated.View key={`${pub.kind}-${item.id}`} entering={FadeInDown.delay((userPosts.length + idx) * 40).springify()}>
                          <TouchableOpacity
                            style={[styles.pubCard, { backgroundColor: colors.surfaceElevated }]}
                            activeOpacity={0.8}
                            onPress={() => {
                              if (isEvent) navigation.navigate('EventDetail', { eventId: item.id });
                              else navigation.navigate('ConcertDetail', { concertId: item.id });
                            }}
                          >
                            {thumbUrl ? (
                              <Image source={{ uri: thumbUrl }} style={styles.pubThumb} />
                            ) : (
                              <LinearGradient
                                colors={[accent + 'AA', accent + '55']}
                                style={[styles.pubThumb, { alignItems: 'center', justifyContent: 'center' }]}
                              >
                                <Icon name={typeIcon} size={28} color="rgba(255,255,255,0.6)" />
                              </LinearGradient>
                            )}
                            <View style={styles.pubBody}>
                              <View style={[styles.pubTypeBadge, { backgroundColor: accent + '18' }]}>
                                <Icon name={typeIcon} size={10} color={accent} />
                                <Text style={[styles.pubTypeText, { color: accent }]}>{typeLabel}</Text>
                              </View>
                              <Text style={[styles.pubTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                                {item.title}
                              </Text>
                              {item.description ? (
                                <Text style={[styles.pubDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                                  {item.description}
                                </Text>
                              ) : null}
                              <View style={styles.pubMeta}>
                                {date ? (
                                  <View style={styles.pubMetaItem}>
                                    <Icon name="calendar" size={11} color={colors.textTertiary} />
                                    <Text style={[styles.pubMetaText, { color: colors.textTertiary }]}>{formatDate(date)}</Text>
                                  </View>
                                ) : null}
                                {city ? (
                                  <View style={styles.pubMetaItem}>
                                    <Icon name="map-pin" size={11} color={colors.textTertiary} />
                                    <Text style={[styles.pubMetaText, { color: colors.textTertiary }]}>{city}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
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
                    onPress={() => navigation.navigate('Tabs', { screen: 'Reels', params: { initialReelId: reel.id } } as any)}
                  >
                    {reel.thumbnail_url ? (
                      <TouchableOpacity onPress={() => setViewerUrl(reel.thumbnail_url)} activeOpacity={0.85}>
                        <Image source={{ uri: reel.thumbnail_url }} style={styles.reelThumb} />
                      </TouchableOpacity>
                    ) : (
                      <LinearGradient
                        colors={[colors.gradientStart + '80', colors.gradientEnd + '40']}
                        style={[styles.reelThumb, { alignItems: 'center', justifyContent: 'center' }]}
                      >
                        <Icon name="play" size={24} color="rgba(255,255,255,0.7)" />
                      </LinearGradient>
                    )}
                    <View style={styles.reelOverlay}>
                      <Icon name="play" size={14} color="#fff" />
                      <Text style={styles.reelViews}>{reel.view_count ?? 0}</Text>
                    </View>
                    <Text style={[styles.reelCaption, { color: colors.textSecondary }]} numberOfLines={2}>
                      {reel.caption ?? 'Reel'}
                    </Text>
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

      {/* ── Image viewer plein écran ───────────────────────────────── */}
      <Modal
        visible={!!viewerUrl}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerUrl(null)}
      >
        <View style={styles.imgViewer}>
          <StatusBar hidden />
          <TouchableOpacity
            style={styles.imgViewerClose}
            onPress={() => setViewerUrl(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.imgViewerCloseInner}>
              <Icon name="x" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
          {viewerUrl && (
            <Image
              source={{ uri: viewerUrl }}
              style={styles.imgViewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

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

  bannerWrap: { height: 180, position: 'relative' },
  banner: { width: '100%', height: '100%' },
  headerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 48, paddingHorizontal: 16,
  },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },

  avatarSection: { alignItems: 'center', marginTop: -44 },
  avatarRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 4, overflow: 'hidden' },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 28, fontWeight: '800' },
  verifiedBadge: { position: 'absolute', bottom: 2, right: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },

  infoSection: { alignItems: 'center', paddingHorizontal: 20, marginTop: 10, gap: 4 },
  displayName: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  username: { fontSize: 14 },
  bio: { fontSize: 14, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },

  detailsSection: { paddingHorizontal: 20, marginTop: 10, gap: 6 },
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

  // Publication cards
  pubCard: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, overflow: 'hidden',
  },
  pubThumb: { width: 110, height: 110 },
  pubBody: { flex: 1, padding: 12, gap: 4, justifyContent: 'center' },
  pubTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
  },
  pubTypeText: { fontSize: 10, fontWeight: '800' },
  pubTitle: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  pubDesc: { fontSize: 12, lineHeight: 16 },
  pubMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  pubMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pubMetaText: { fontSize: 11 },

  // Reels grid
  reelsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 14, gap: 6,
  },
  reelCard: {
    width: (W - 28 - 12) / 3, borderRadius: 8, overflow: 'hidden', marginBottom: 4,
  },
  reelThumb: { width: '100%', height: 140 },
  reelOverlay: {
    position: 'absolute', bottom: 28, left: 6,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  reelViews: { color: '#fff', fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 },
  reelCaption: { fontSize: 11, padding: 6, lineHeight: 14 },

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

  // Image viewer plein écran
  imgViewer: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  imgViewerImage: { width: '100%', height: '100%' },
  imgViewerClose: {
    position: 'absolute', top: 52, right: 20, zIndex: 10,
  },
  imgViewerCloseInner: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

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
