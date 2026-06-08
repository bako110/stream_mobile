import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet, Clipboard, ToastAndroid, Platform, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { AppHeader, SkeletonProfile } from '../../components/common';
import { userService, eventService, concertService, reelService, postService } from '../../services';
import { apiClient, Endpoints } from '../../api';
import type { User } from '../../types';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Post } from '../../types/post';
import type { AppColors } from '../../theme/colors';
import { profileStyles as s } from '../../styles/ProfileScreen.styles';
import { QRCodeScreen } from '../Auth/QRCodeScreen';
import { VerifiedBadge } from './SettingsScreen';

interface Props {
  onLogout:         () => void;
  onCreateEvent?:   () => void;
  onCreateConcert?: () => void;
  onEditProfile?:   () => void;
}

// ── ProfileScreen ─────────────────────────────────────────────────────────────

export const ProfileScreen: React.FC<Props> = ({ onLogout, onCreateEvent, onCreateConcert, onEditProfile }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const { currentUser: user, refreshUser, setCurrentUser } = useUser();

  const [loading,    setLoading]    = useState(true);
  const [myEvents,   setMyEvents]   = useState<Event[]>([]);
  const [myConcerts, setMyConcerts] = useState<Concert[]>([]);
  const [myReels,    setMyReels]    = useState<any[]>([]);
  const [myPosts,    setMyPosts]    = useState<Post[]>([]);
  const [draftsTab,  setDraftsTab]  = useState<'events' | 'concerts'>('events');
  const [contentTab, setContentTab] = useState<'posts' | 'reels'>('posts');
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showQR, setShowQR] = useState(false);

  const lastLoadedAtRef = useRef<number>(0);
  const didMountRef     = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let me = await refreshUser();
      if (!me) return;
      if (!me.gofolyx_id) {
        try {
          const r = await apiClient.post<User>(Endpoints.users.generateGoFolyXId);
          me = r.data;
          setCurrentUser(r.data);
        } catch {}
      }

      const [profile, evts, res, reelsRes, postsRes] = await Promise.allSettled([
        userService.getPublicProfile(me!.id),
        eventService.getMyEvents(),
        concertService.getMyConcerts(),
        apiClient.get<any>(`${Endpoints.reels.byUser(me!.id)}?page=1&limit=20`),
        postService.getByUser(me!.id),
      ]);
      if (profile.status === 'fulfilled') {
        setFollowersCount(profile.value.followers_count ?? 0);
        setFollowingCount(profile.value.following_count ?? 0);
      }
      if (evts.status  === 'fulfilled') setMyEvents(evts.value);
      if (res.status   === 'fulfilled') setMyConcerts(res.value);
      if (reelsRes.status === 'fulfilled') {
        const d = reelsRes.value.data;
        setMyReels(Array.isArray(d) ? d : (d?.items ?? []));
      }
      if (postsRes.status === 'fulfilled') setMyPosts(postsRes.value);
      lastLoadedAtRef.current = Date.now();
    } catch (err) {
      if (__DEV__) { console.warn('[ProfileScreen]', err); }
    } finally { setLoading(false); }
  }, [refreshUser]);

  useFocusEffect(useCallback(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      load();
      return;
    }
    const age = Date.now() - lastLoadedAtRef.current;
    if (age > 5_000) load(true);
  }, [load]));

  const displayName = user
    ? (user.display_name
        || `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
        || user.username
        || 'Utilisateur')
    : '—';

  const initials = displayName
    .split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const roleIcon  = user?.role === 'artist' ? 'music'   : user?.role === 'admin' ? 'shield' : 'user';
  const roleLabel = user?.role === 'artist' ? 'Artiste' : user?.role === 'admin' ? 'Admin'  : 'Membre';

  const isCreator = user?.role === 'artist' || user?.role === 'admin';

  const publishedEvents   = useMemo(() => myEvents.filter(e => e.status === 'published'),   [myEvents]);
  const publishedConcerts = useMemo(() => myConcerts.filter(c => c.status === 'published'), [myConcerts]);
  const postsCount        = publishedEvents.length + publishedConcerts.length;

  const recentPublished = useMemo(() => [
    ...publishedEvents.map(e => ({ kind: 'event' as const, data: e })),
    ...publishedConcerts.map(c => ({ kind: 'concert' as const, data: c })),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime())
   .slice(0, 5), [publishedEvents, publishedConcerts]);

  const draftsList = useMemo(() => draftsTab === 'events'
    ? myEvents.filter(e => e.status === 'draft')
    : myConcerts.filter(c => c.status === 'draft'),
  [draftsTab, myEvents, myConcerts]);

  const memberSince = user ? new Date(user.created_at).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric',
  }) : '';

  // Styles locaux pour les boutons icône+label
  const _btnCol: object  = { alignItems: 'center', gap: 4 };
  const _btnIcon: object = { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' };
  const _btnLabel: object = { fontSize: 10, fontWeight: '600' };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <QRCodeScreen visible={showQR} onClose={() => setShowQR(false)} />

      <AppHeader
        title="Profil"
        rightIcon="settings"
        onRightPress={() => nav.navigate('Settings')}
      />

      {loading ? (
        <SkeletonProfile />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

          {/* ── Bannière + Avatar ───────────────────────────────────────── */}
          <View style={{ backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
            {/* Bannière */}
            <View style={{ height: 140, width: '100%' }}>
              {user?.banner_url ? (
                <Image source={{ uri: user.banner_url, cache: 'reload' }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: '100%', height: '100%' }}
                />
              )}
              {/* Bouton modifier la bannière */}
              <TouchableOpacity
                onPress={onEditProfile}
                style={{ position: 'absolute', bottom: 8, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 }}
                activeOpacity={0.8}
              >
                <Icon name="camera" size={13} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Modifier</Text>
              </TouchableOpacity>
            </View>

            {/* Avatar chevauchant */}
            <View style={{ paddingHorizontal: 16, marginTop: -40, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 12 }}>
              <View style={[s.avatarCircle, { borderColor: colors.surface, borderWidth: 4 }]}>
                {user?.avatar_url ? (
                  <Image source={{ uri: user.avatar_url, cache: 'reload' }} style={{ width: '100%', height: '100%', borderRadius: 999 }} />
                ) : (
                  <LinearGradient
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    style={[s.avatarGrad, { borderRadius: 999 }]}
                  >
                    <Text style={[s.avatarInitials, { color: colors.textOnBrand }]}>{initials}</Text>
                  </LinearGradient>
                )}
              </View>
              <TouchableOpacity
                onPress={onEditProfile}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: colors.divider, backgroundColor: colors.surface }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Modifier le profil</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Identité ───────────────────────────────────────── */}
          <View
            style={[s.avatarSection, { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, paddingTop: 4 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <Text style={[s.profileName, { color: colors.textPrimary }]}>{displayName}</Text>
              {user?.is_verified && <VerifiedBadge size={20} />}
            </View>
            {user?.username && (
              <Text style={[s.profileHandle, { color: colors.primary }]}>@{user.username}</Text>
            )}
            {user?.bio ? (
              <Text style={[s.profileBio, { color: colors.textSecondary }]} numberOfLines={3}>
                {user.bio}
              </Text>
            ) : null}

            <View style={[s.roleBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
              <Icon name={roleIcon} size={12} color={colors.primary} />
              <Text style={[s.roleText, { color: colors.primary }]}>{roleLabel}</Text>
            </View>

            {/* Bouton test GoFolyX ID */}
            {!user?.gofolyx_id && (
              <TouchableOpacity
                style={{ marginTop: 10, backgroundColor: '#FF6B00', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, alignSelf: 'center' }}
                onPress={async () => {
                  try {
                    console.log('[TEST] Appel generate-gofolyx-id...', Endpoints.users.generateGoFolyXId);
                    const r = await apiClient.post<User>(Endpoints.users.generateGoFolyXId);
                    console.log('[TEST] Réponse:', JSON.stringify(r.data?.gofolyx_id));
                    setCurrentUser(r.data);
                  } catch (e: any) {
                    console.log('[TEST] Erreur:', e?.message, e?.response?.status, JSON.stringify(e?.response?.data));
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Générer GoFolyX ID</Text>
              </TouchableOpacity>
            )}

            {/* Boutons d'action */}
            <View style={s.actionRow}>
              {/* Modifier le profil */}
              <TouchableOpacity
                style={[s.editBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={onEditProfile}
              >
                <Icon name="edit-2" size={13} color="#fff" />
                <Text style={[s.editBtnText, { color: '#fff' }]}>Modifier</Text>
              </TouchableOpacity>

              {/* Wallet */}
              <TouchableOpacity
                style={[_btnCol]}
                onPress={() => nav.navigate('Wallet')}
                activeOpacity={0.75}
              >
                <View style={[_btnIcon, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <Icon name="credit-card" size={16} color={colors.textSecondary} />
                </View>
                <Text style={[_btnLabel, { color: colors.textTertiary }]}>Wallet</Text>
              </TouchableOpacity>

              {/* Story */}
              <TouchableOpacity
                style={[_btnCol]}
                onPress={() => nav.navigate('MyStories')}
                activeOpacity={0.75}
              >
                <View style={[_btnIcon, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <Icon name="camera" size={16} color={colors.textSecondary} />
                </View>
                <Text style={[_btnLabel, { color: colors.textTertiary }]}>Story</Text>
              </TouchableOpacity>

              {/* QR Code */}
              <TouchableOpacity
                style={[_btnCol]}
                onPress={() => setShowQR(true)}
                activeOpacity={0.75}
              >
                <View style={[_btnIcon, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '40' }]}>
                  <Icon name="grid" size={16} color={colors.primary} />
                </View>
                <Text style={[_btnLabel, { color: colors.primary }]}>QR Code</Text>
              </TouchableOpacity>
            </View>

            {/* Boutons artiste — créer événement / concert */}
            {isCreator && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, paddingHorizontal: 4 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#E0389A' + '60', backgroundColor: '#E0389A' + '10' }}
                  onPress={onCreateEvent}
                  activeOpacity={0.8}
                >
                  <Icon name="calendar" size={13} color="#E0389A" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#E0389A' }}>Créer un événement</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#7B3FF2' + '60', backgroundColor: '#7B3FF2' + '10' }}
                  onPress={onCreateConcert}
                  activeOpacity={0.8}
                >
                  <Icon name="music" size={13} color="#7B3FF2" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#7B3FF2' }}>Créer un concert</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── Stats (Followers / Following / Publications) ───────────── */}
          {user && (
            <View style={s.statsRow}>
              <TouchableOpacity
                style={[s.statCard, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => nav.navigate('Following', { userId: user.id, tab: 'followers' })}
                activeOpacity={0.7}
              >
                <Text style={[s.statValue, { color: colors.textPrimary }]}>{followersCount}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>Abonnés</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.statCard, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => nav.navigate('Following', { userId: user.id, tab: 'following' })}
                activeOpacity={0.7}
              >
                <Text style={[s.statValue, { color: colors.textPrimary }]}>{followingCount}</Text>
                <Text style={[s.statLabel, { color: colors.textTertiary }]}>Abonnements</Text>
              </TouchableOpacity>
              {isCreator && (
                <View style={[s.statCard, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={[s.statValue, { color: colors.textPrimary }]}>{postsCount}</Text>
                  <Text style={[s.statLabel, { color: colors.textTertiary }]}>Publications</Text>
                </View>
              )}
            </View>
          )}

          {/* ── À propos ─────────────────────────────────────────────── */}
          <View style={[s.section, { backgroundColor: colors.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, padding: 16 }]}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>À PROPOS</Text>
            <View style={s.aboutList}>
              {user?.location ? (
                <View style={s.aboutRow}>
                  <Icon name="map-pin" size={16} color={colors.textTertiary} />
                  <Text style={[s.aboutText, { color: colors.textPrimary }]}>
                    Habite à <Text style={{ fontWeight: '700' }}>{user.location}</Text>
                  </Text>
                </View>
              ) : null}
              {user?.website ? (
                <View style={s.aboutRow}>
                  <Icon name="link" size={16} color={colors.textTertiary} />
                  <Text style={[s.aboutText, { color: colors.primary }]}>{user.website}</Text>
                </View>
              ) : null}
              <View style={s.aboutRow}>
                <Icon name="calendar" size={16} color={colors.textTertiary} />
                <Text style={[s.aboutText, { color: colors.textPrimary }]}>
                  Membre depuis <Text style={{ fontWeight: '700' }}>{memberSince}</Text>
                </Text>
              </View>
              {user?.is_verified && (
                <View style={s.aboutRow}>
                  <Icon name="check-circle" size={16} color={colors.accentGreen} />
                  <Text style={[s.aboutText, { color: colors.accentGreen, fontWeight: '600' }]}>
                    Compte vérifié
                  </Text>
                </View>
              )}
              {/* Parrainage — lien vers l'écran dédié */}
              <TouchableOpacity style={s.aboutRow} onPress={() => nav.navigate('Referral')} activeOpacity={0.7}>
                <Icon name="gift" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.aboutText, { color: colors.textPrimary, fontWeight: '600' }]}>
                    Parrainage
                  </Text>
                  {user?.referral_code ? (
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                      Code : <Text style={{ color: colors.primary, fontWeight: '800', letterSpacing: 1.5 }}>{user.referral_code}</Text>
                    </Text>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={14} color={colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.aboutRow, { backgroundColor: colors.primary + '12', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }]}
                activeOpacity={user?.gofolyx_id ? 0.75 : 1}
                onPress={() => {
                  if (!user?.gofolyx_id) return;
                  Clipboard.setString(user.gofolyx_id!);
                  if (Platform.OS === 'android') {
                    ToastAndroid.show('GoFolyX ID copié !', ToastAndroid.SHORT);
                  } else {
                    Alert.alert('Copié', 'GoFolyX ID copié dans le presse-papier.');
                  }
                }}
              >
                <Icon name="at-sign" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 }}>GoFolyX ID</Text>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: user?.gofolyx_id ? colors.primary : colors.textTertiary, letterSpacing: 2 }}>
                    {user?.gofolyx_id ?? 'En cours de génération...'}
                  </Text>
                </View>
                {user?.gofolyx_id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Icon name="copy" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Copier</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>


          {/* ── Publications (Posts / Reels) ──────────────────────────── */}
          <View style={[s.section, { backgroundColor: colors.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, overflow: 'hidden' }]}>
            {/* Onglets */}
            <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
              {(['posts', 'reels'] as const).map(tab => {
                const active = contentTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setContentTab(tab)}
                    activeOpacity={0.7}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: active ? colors.primary : 'transparent' }}
                  >
                    <Icon name={tab === 'posts' ? 'grid' : 'play-circle'} size={15} color={active ? colors.primary : colors.textTertiary} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? colors.primary : colors.textTertiary, marginTop: 3 }}>
                      {tab === 'posts' ? `Posts (${myPosts.length})` : `Reels (${myReels.length})`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Contenu posts */}
            {contentTab === 'posts' && (
              <View style={{ padding: 12, gap: 8 }}>
                {myPosts.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                    <Icon name="edit-3" size={28} color={colors.textTertiary} />
                    <Text style={{ fontSize: 13, color: colors.textTertiary }}>Aucun post publié</Text>
                  </View>
                ) : myPosts.slice(0, 6).map(post => (
                  <TouchableOpacity
                    key={post.id}
                    activeOpacity={0.75}
                    onPress={() => nav.navigate('PostDetail', { postId: post.id })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: colors.surfaceElevated }}
                  >
                    {(post as any).image_url ? (
                      <Image source={{ uri: (post as any).image_url }} style={{ width: 46, height: 46, borderRadius: 8 }} />
                    ) : (
                      <View style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="file-text" size={20} color={colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }} numberOfLines={2}>
                        {(post as any).body || (post as any).content || 'Post'}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                        {new Date((post as any).created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={15} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Contenu reels — grille 3 colonnes */}
            {contentTab === 'reels' && (
              <View style={{ padding: 8 }}>
                {myReels.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                    <Icon name="play-circle" size={28} color={colors.textTertiary} />
                    <Text style={{ fontSize: 13, color: colors.textTertiary }}>Aucun reel publié</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {myReels.slice(0, 9).map(reel => (
                      <TouchableOpacity
                        key={reel.id}
                        activeOpacity={0.8}
                        onPress={() => nav.navigate('UserReels', { userId: user!.id, initialReelId: reel.id, initialReels: myReels })}
                        style={{ width: '31.5%', aspectRatio: 9 / 16, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceElevated }}
                      >
                        {reel.thumbnail_url ? (
                          <Image source={{ uri: reel.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="play" size={24} color={colors.textTertiary} />
                          </View>
                        )}
                        <View style={{ position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Icon name="eye" size={10} color="#fff" />
                          <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{reel.view_count ?? 0}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Mes créations / Brouillons (artistes) ─────────────────── */}
          {isCreator && draftsList.length > 0 && (
            <View style={[s.section, { backgroundColor: colors.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, padding: 16 }]}>
              <View style={s.sectionHeaderRow}>
                <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>BROUILLONS</Text>
                <View style={s.tabSwitch}>
                  {(['events', 'concerts'] as const).map(tab => (
                    <TouchableOpacity
                      key={tab}
                      onPress={() => setDraftsTab(tab)}
                      style={[
                        s.tabSwitchBtn,
                        {
                          backgroundColor: draftsTab === tab ? colors.primary + '22' : 'transparent',
                          borderColor:     draftsTab === tab ? colors.primary         : colors.border,
                        },
                      ]}
                    >
                      <Icon
                        name={tab === 'events' ? 'calendar' : 'music'}
                        size={11}
                        color={draftsTab === tab ? colors.primary : colors.textTertiary}
                      />
                      <Text style={[s.tabSwitchText, { color: draftsTab === tab ? colors.primary : colors.textTertiary }]}>
                        {tab === 'events' ? 'Événements' : 'Concerts'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.creationsScroll}>
                {draftsList.map(item => (
                  <CreationCard
                    key={item.id}
                    title={item.title}
                    status="draft"
                    icon={draftsTab === 'events' ? 'calendar' : 'music'}
                    colors={colors}
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

// ── Sub-composants ────────────────────────────────────────────────────────────

const CreationCard: React.FC<{
  title:  string;
  status: string;
  icon:   string;
  colors: AppColors;
}> = ({ title, status, icon, colors }) => {
  const isPublished = status === 'published';
  return (
    <TouchableOpacity style={[s.creationCard, { backgroundColor: colors.surfaceElevated }]}>
      <LinearGradient
        colors={[colors.gradientStart + '40', colors.gradientEnd + '20']}
        style={s.creationBanner}
      >
        <View style={[s.creationIconWrap, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
          <Icon name={icon} size={26} color={colors.textOnBrand} />
        </View>
      </LinearGradient>
      <View style={s.creationBody}>
        <Text style={[s.creationTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        <View style={[
          s.creationBadge,
          { backgroundColor: isPublished ? colors.accentGreen + '22' : colors.backgroundTertiary },
        ]}>
          <Icon
            name={isPublished ? 'check' : 'file-text'}
            size={8}
            color={isPublished ? colors.accentGreen : colors.textTertiary}
          />
          <Text style={[
            s.creationBadgeText,
            { color: isPublished ? colors.accentGreen : colors.textTertiary },
          ]}>
            {isPublished ? 'PUBLIÉ' : 'BROUILLON'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
