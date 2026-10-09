import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet, ToastAndroid, Platform,
  Modal, TextInput, KeyboardAvoidingView, Animated,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { FontSize, FontWeight } from '../../theme';
import { formatDurationSec, formatViewerCount } from '../../utils';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { SkeletonProfile } from '../../components/common';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userService, eventService, concertService, reelService, postService, toastService, showConfirm } from '../../services';
import { apiClient, Endpoints } from '../../api';
import type { User } from '../../types';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
import type { Post } from '../../types/post';
import type { AppColors } from '../../theme/colors';
import { profileStyles as s } from '../../styles/ProfileScreen.styles';
import { TAB_BAR_HEIGHT } from '../../styles';
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
  const insets = useSafeAreaInsets();
  const { currentUser: user, refreshUser, setCurrentUser } = useUser();
  // Gap fixe entre les cartes des mini-grilles d'aperçu (flex:1 sur chaque
  // carte, pas de largeur calculée — avec moins de cartes que de colonnes,
  // elles s'élargissent pour occuper toute la largeur au lieu de laisser un
  // vide).
  const REEL_GAP = 5;

  const [loading,    setLoading]    = useState(true);
  const [myEvents,   setMyEvents]   = useState<Event[]>([]);
  const [myConcerts, setMyConcerts] = useState<Concert[]>([]);
  const [myReels,    setMyReels]    = useState<any[]>([]);
  const [myPosts,    setMyPosts]    = useState<Post[]>([]);
  const [draftsTab,  setDraftsTab]  = useState<'events' | 'concerts'>('events');
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showQR, setShowQR] = useState(false);
  // Bottom sheet "Voir le reste de mes contenus" — propose Publications/Reels/Galerie.
  const [showContentSheet, setShowContentSheet] = useState(false);

  // ── Menu "..." (éditer/supprimer) sur mes posts/reels ────────────────────
  const [menuTarget, setMenuTarget] = useState<{ kind: 'post' | 'reel'; id: string } | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editBody,    setEditBody]    = useState('');
  const [editSaving,  setEditSaving]  = useState(false);

  const handleDeletePost = useCallback((id: string) => {
    showConfirm('Supprimer', 'Supprimer ce post ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await postService.delete(id); setMyPosts(prev => prev.filter(p => p.id !== id)); }
        catch { toastService.error('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  }, []);

  const handleDeleteReel = useCallback((id: string) => {
    showConfirm('Supprimer', 'Supprimer ce reel ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await reelService.delete(id); setMyReels(prev => prev.filter(r => r.id !== id)); }
        catch { toastService.error('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  }, []);

  const handleSaveEditPost = useCallback(async () => {
    if (!editingPost || !editBody.trim()) return;
    setEditSaving(true);
    try {
      await postService.update(editingPost.id, { body: editBody.trim() });
      setMyPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, body: editBody.trim() } : p));
      setEditingPost(null);
    } catch { toastService.error('Erreur', 'Impossible de modifier.'); }
    finally { setEditSaving(false); }
  }, [editingPost, editBody]);

  const lastLoadedAtRef = useRef<number>(0);
  const didMountRef     = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // refreshUser retourne toujours un user (cache offline si pas de réseau)
      const me = await refreshUser() ?? user;
      if (!me) { setLoading(false); return; }

      // gofolyx_id seulement si online (appel POST)
      if (!me.gofolyx_id) {
        try {
          const r = await apiClient.post<User>(Endpoints.users.generateGofolyxId);
          setCurrentUser(r.data);
        } catch {}
      }

      const [profile, evts, res, reelsRes, postsRes] = await Promise.allSettled([
        userService.getPublicProfile(me.id),
        eventService.getMyEvents(),
        concertService.getMyConcerts(),
        apiClient.get<any>(`${Endpoints.reels.byUser(me.id)}?page=1&limit=20`),
        postService.getByUser(me.id),
      ]);
      if (profile.status === 'fulfilled') {
        setFollowersCount(profile.value.followers_count ?? 0);
        setFollowingCount(profile.value.following_count ?? 0);
      }
      if (evts.status     === 'fulfilled') setMyEvents(evts.value);
      if (res.status      === 'fulfilled') setMyConcerts(res.value);
      if (reelsRes.status === 'fulfilled') {
        const d = reelsRes.value.data;
        setMyReels(Array.isArray(d) ? d : (d?.items ?? []));
      }
      if (postsRes.status === 'fulfilled') setMyPosts(postsRes.value);
      lastLoadedAtRef.current = Date.now();
    } catch (err) {
      if (__DEV__) { console.warn('[ProfileScreen]', err); }
    } finally { setLoading(false); }
  }, [refreshUser, user]);

  useFocusEffect(useCallback(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      load();
      return;
    }
    const age = Date.now() - lastLoadedAtRef.current;
    if (age > 5_000) load(true);
  }, [load]));

  // Bouton flottant "remonter + rafraîchir" — apparaît après un scroll
  // significatif, comme sur les autres écrans à contenu long. Au clic : remonte
  // en haut ET relance un chargement silencieux (load(true), pas de skeleton
  // plein écran) pour repartir sur des données fraîches.
  const scrollRef = useRef<ScrollView>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopAnim = useRef(new Animated.Value(0)).current;
  const SCROLL_TOP_THRESHOLD = 400;

  const setScrollTopVisible = useCallback((visible: boolean) => {
    setShowScrollTop(prev => {
      if (prev === visible) return prev;
      Animated.timing(scrollTopAnim, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return visible;
    });
  }, [scrollTopAnim]);

  const handleProfileScroll = useCallback((e: any) => {
    const y = e.nativeEvent?.contentOffset?.y ?? 0;
    setScrollTopVisible(y > SCROLL_TOP_THRESHOLD);
  }, [setScrollTopVisible]);

  const handleScrollTopPress = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    load(true);
  }, [load]);

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

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <QRCodeScreen visible={showQR} onClose={() => setShowQR(false)} />

      {/* Titre "Profil" + bouton réglages — barre fixe classique (non animée),
          toujours visible en haut de l'écran. */}
      <View style={[profileHeaderStyles.container, { height: insets.top + PROFILE_HEADER_CONTENT_HEIGHT, paddingTop: insets.top, backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <View style={profileHeaderStyles.inner}>
          <View style={profileHeaderStyles.side} />
          <Text style={[profileHeaderStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            Profil
          </Text>
          <View style={[profileHeaderStyles.side, profileHeaderStyles.right]}>
            <TouchableOpacity
              onPress={() => nav.navigate('Settings')}
              style={profileHeaderStyles.iconBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="settings" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <SkeletonProfile />
      ) : (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 48 }]}
          onScroll={handleProfileScroll}
          scrollEventThrottle={16}
        >

          {/* ── Hero (bannière + avatar + identité) — défile normalement avec
              le reste du contenu, dans le flux du ScrollView. ── */}
          <View style={{ backgroundColor: colors.surface, borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }}>
          <View style={{ height: 150, width: '100%' }}>
          {user?.banner_url ? (
            <Image source={{ uri: user.banner_url, cache: 'reload' }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: '100%', height: '100%' }}
            />
          )}
          {/* Bouton "Modifier la bannière" en haut à droite */}
          <TouchableOpacity
            onPress={onEditProfile}
            style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.50)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}
            activeOpacity={0.8}
          >
            <Icon name="camera" size={13} color="#fff" />
            <Text style={{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semiBold }}>Modifier la bannière</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: -44, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 12 }}>
          <TouchableOpacity onPress={onEditProfile} activeOpacity={0.85} style={{ position: 'relative' }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.surface, overflow: 'hidden' }}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url, cache: 'reload' }} style={{ width: '100%', height: '100%', borderRadius: 44 }} />
              ) : (
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: FontSize['4xl'], fontWeight: FontWeight.black, color: colors.textOnBrand }}>{initials}</Text>
                </LinearGradient>
              )}
            </View>
            <View style={{ position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}>
              <Icon name="edit-2" size={10} color="#fff" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onEditProfile}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22, backgroundColor: colors.primary }}
            activeOpacity={0.8}
          >
            <Icon name="edit-2" size={13} color="#fff" />
            <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' }}>Modifier le profil</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: FontSize.xl, fontWeight: FontWeight.extraBold, color: colors.textPrimary }} numberOfLines={1}>{displayName}</Text>
            {user?.is_verified && <VerifiedBadge size={18} />}
          </View>
          {user?.username && (
            <Text style={{ fontSize: FontSize.smPlus, fontWeight: FontWeight.medium, color: colors.textSecondary }}>@{user.username}</Text>
          )}
          {user?.bio ? (
            <Text style={{ fontSize: FontSize.smPlus, color: colors.textSecondary, lineHeight: 18, marginTop: 4 }} numberOfLines={3}>{user.bio}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: colors.primary + '18', borderWidth: 1, borderColor: colors.primary + '40' }}>
            <Icon name={roleIcon} size={12} color={colors.primary} />
            <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: colors.primary }}>{roleLabel}</Text>
          </View>
        </View>

            {/* Stats Abonnés / Abonnements — deux cards côte à côte */}
            {user && (
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: colors.backgroundSecondary, gap: 3 }}
                  onPress={() => nav.navigate('Following', { userId: user.id, tab: 'followers' })}
                  activeOpacity={0.7}
                >
                  <Icon name="users" size={18} color={colors.textSecondary} style={{ marginBottom: 2 }} />
                  <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.extraBold, color: colors.textPrimary }}>{followersCount}</Text>
                  <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.medium, color: colors.textTertiary }}>Abonnés</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: colors.backgroundSecondary, gap: 3 }}
                  onPress={() => nav.navigate('Following', { userId: user.id, tab: 'following' })}
                  activeOpacity={0.7}
                >
                  <Icon name="user-plus" size={18} color={colors.textSecondary} style={{ marginBottom: 2 }} />
                  <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.extraBold, color: colors.textPrimary }}>{followingCount}</Text>
                  <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.medium, color: colors.textTertiary }}>Abonnements</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Ligne de 4 boutons icônes : Wallet, Story, QR Code, Plus */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 20, gap: 12 }}>
              <TouchableOpacity onPress={() => nav.navigate('Wallet')} activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="credit-card" size={20} color={colors.textSecondary} />
                </View>
                <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold, color: colors.textTertiary }}>Wallet</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => nav.navigate('MyStories')} activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="camera" size={20} color={colors.textSecondary} />
                </View>
                <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold, color: colors.textTertiary }}>Story</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowQR(true)} activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="grid" size={20} color={colors.textSecondary} />
                </View>
                <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold, color: colors.textTertiary }}>QR Code</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => nav.navigate('MyVerificationQueue')} activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="shield" size={20} color={colors.textSecondary} />
                </View>
                <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold, color: colors.textTertiary }}>Vérifs</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => nav.navigate('Settings')} activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="more-horizontal" size={20} color={colors.textSecondary} />
                </View>
                <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.semiBold, color: colors.textTertiary }}>Plus</Text>
              </TouchableOpacity>
            </View>

            {/* Boutons artiste — créer événement / concert */}
            {isCreator && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: -8, marginBottom: 16, paddingHorizontal: 16 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#E0389A' + '60', backgroundColor: '#E0389A' + '10' }}
                  onPress={onCreateEvent}
                  activeOpacity={0.8}
                >
                  <Icon name="calendar" size={13} color="#E0389A" />
                  <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#E0389A' }}>Créer un événement</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#7B3FF2' + '60', backgroundColor: '#7B3FF2' + '10' }}
                  onPress={onCreateConcert}
                  activeOpacity={0.8}
                >
                  <Icon name="music" size={13} color="#7B3FF2" />
                  <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#7B3FF2' }}>Créer un concert</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>

          {/* ── Stats (ancien bloc — conservé pour isCreator Publications) ── */}
          {user && isCreator && (
            <View style={s.statsRow}>
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
                    Habite à <Text style={{ fontWeight: FontWeight.bold }}>{user.location}</Text>
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
                  Membre depuis <Text style={{ fontWeight: FontWeight.bold }}>{memberSince}</Text>
                </Text>
              </View>
              {user?.is_verified && (
                <View style={s.aboutRow}>
                  <Icon name="check-circle" size={16} color={colors.accentGreen} />
                  <Text style={[s.aboutText, { color: colors.accentGreen, fontWeight: FontWeight.semiBold }]}>
                    Compte vérifié
                  </Text>
                </View>
              )}
              {/* Parrainage — lien vers l'écran dédié */}
              <TouchableOpacity style={s.aboutRow} onPress={() => nav.navigate('Referral')} activeOpacity={0.7}>
                <Icon name="gift" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.aboutText, { color: colors.textPrimary, fontWeight: FontWeight.semiBold }]}>
                    Parrainage
                  </Text>
                  {user?.referral_code ? (
                    <Text style={{ fontSize: FontSize.xsPlus, color: colors.textTertiary, marginTop: 1 }}>
                      Code : <Text style={{ color: colors.primary, fontWeight: FontWeight.extraBold, letterSpacing: 1.5 }}>{user.referral_code}</Text>
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
                    ToastAndroid.show('Gofolyx ID copié !', ToastAndroid.SHORT);
                  } else {
                    toastService.success('Copié', 'Gofolyx ID copié dans le presse-papier.');
                  }
                }}
              >
                <Icon name="at-sign" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 }}>Gofolyx ID</Text>
                  <Text style={{ fontSize: FontSize.basePlus, fontWeight: FontWeight.black, color: user?.gofolyx_id ? colors.primary : colors.textTertiary, letterSpacing: 2 }}>
                    {user?.gofolyx_id ?? 'En cours de génération...'}
                  </Text>
                </View>
                {user?.gofolyx_id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Icon name="copy" size={13} color={colors.primary} />
                    <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, color: colors.primary }}>Copier</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>


          {/* ── Publications récentes — 4 derniers posts, aperçu direct (plus
              d'onglets à cliquer). carte flottante (même design que le reste
              de l'app). overflow:'hidden' isolé sur une View enfant distincte
              de celle qui porte l'ombre — les mélanger couperait l'ombre
              portée sur iOS. ──────────────────────────── */}
          <View style={[s.section, {
            backgroundColor: colors.surface, borderColor: colors.divider,
            marginHorizontal: 10, borderRadius: 24, borderWidth: 1,
            shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
            shadowOffset: { width: 0, height: 5 }, elevation: 8,
          }]}>
          <View style={{ borderRadius: 24, overflow: 'hidden', padding: 16, gap: 18 }}>

            {/* ── Publications récentes — carte vedette (la plus récente) + grille,
                même langage visuel que la section Reels juste en dessous
                (carte 4:3 coins 18px, dégradé bas, grille 3 colonnes). Posts
                d'abord, événements/concerts publiés (recentPublished) en
                complément jusqu'à 4 si peu de posts — même logique que
                UserProfileScreen.tsx. Pas de badge durée (pas de vidéo). ── */}
            <View style={{ gap: 8 }}>
              <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>PUBLICATIONS RÉCENTES</Text>
              {(() => {
                // Même résolution que PostDetailScreen/UserPostsScreen : une image
                // simple, un tableau d'images, ou la vignette d'une vidéo — sinon
                // aucune image (post texte pur), pas de carré vide forcé.
                const pubItems = [
                  ...myPosts.map(post => {
                    const p = post as any;
                    const thumb = p.image_urls?.[0] ?? p.image_url ?? p.thumbnail_url ?? null;
                    return {
                      key: `post-${post.id}`,
                      kind: 'post' as const,
                      thumb,
                      caption: p.body || p.content || null,
                      likes: p.likes_count ?? p.like_count ?? 0,
                      comments: p.comments_count ?? p.comment_count ?? 0,
                      onPress: () => nav.navigate('PostDetail', { postId: post.id }),
                      onMenu: () => setMenuTarget({ kind: 'post', id: post.id }),
                    };
                  }),
                  ...recentPublished.map(pub => {
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
                        if (isEvent) nav.navigate('EventDetail', { eventId: item.id });
                        else nav.navigate('ConcertDetail', { concertId: item.id });
                      },
                      onMenu: null,
                    };
                  }),
                ].slice(0, 4);

                if (pubItems.length === 0) {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                      <Icon name="edit-3" size={28} color={colors.textTertiary} />
                      <Text style={{ fontSize: FontSize.smPlus, color: colors.textTertiary }}>Aucun post publié</Text>
                    </View>
                  );
                }

                const featured = pubItems[0] as any;
                const rest = pubItems.slice(1, 4) as any[];
                // Post texte pur (pas d'image) : pas de dégradé, texte posé
                // directement sur fond neutre — un dégradé sur fond uni n'apporte
                // rien et le texte s'y lirait moins bien qu'en pleine carte.
                const featuredIsTextOnlyPost = featured.kind === 'post' && !featured.thumb;

                return (
                  <>
                    {/* Carte vedette — publication la plus récente */}
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={featured.onPress}
                      style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surfaceElevated, marginBottom: 4 }}
                    >
                      {featured.thumb ? (
                        <Image source={{ uri: featured.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : featuredIsTextOnlyPost ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                          <Icon name="file-text" size={28} color={colors.textTertiary} style={{ marginBottom: 10 }} />
                          <Text style={{ fontSize: FontSize.basePlus, fontWeight: FontWeight.semiBold, color: colors.textPrimary, textAlign: 'center' }} numberOfLines={5}>
                            {featured.caption || 'Post'}
                          </Text>
                        </View>
                      ) : (
                        <LinearGradient
                          colors={[featured.accent + 'CC', featured.accent + '66']}
                          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Icon name={featured.typeIcon} size={36} color="rgba(255,255,255,0.8)" />
                        </LinearGradient>
                      )}

                      {featured.onMenu && (
                        <TouchableOpacity
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={featured.onMenu}
                          style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Icon name="more-vertical" size={15} color="#fff" />
                        </TouchableOpacity>
                      )}

                      {!featuredIsTextOnlyPost && (
                        <LinearGradient
                          colors={['transparent', 'rgba(0,0,0,0.75)']}
                          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 28, paddingBottom: 12, gap: 4 }}
                        >
                          {featured.caption ? (
                            <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.extraBold, color: '#fff' }} numberOfLines={2}>
                              {featured.caption}
                            </Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Icon name="heart" size={12} color="#fff" />
                              <Text style={{ fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.semiBold }}>{formatViewerCount(featured.likes)}</Text>
                              <Text style={{ fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)' }}>|</Text>
                              <Icon name="message-circle" size={12} color="#fff" />
                              <Text style={{ fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.semiBold }}>{formatViewerCount(featured.comments)}</Text>
                            </View>
                            {featured.kind === 'post' && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)' }}>
                                <Icon name="user" size={10} color="#fff" />
                                <Text style={{ fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.semiBold }}>Moi</Text>
                              </View>
                            )}
                          </View>
                        </LinearGradient>
                      )}
                    </TouchableOpacity>

                    {/* Grille — les 3 publications suivantes. flex:1 (pas une
                        largeur fixe) — avec moins de 3 éléments, les cartes
                        s'élargissent pour occuper toute la largeur au lieu de
                        laisser un vide à droite. */}
                    {rest.length > 0 && (
                      <View style={{ flexDirection: 'row' }}>
                        {rest.map((it, idx) => {
                          const isTextOnlyPost = it.kind === 'post' && !it.thumb;
                          return (
                            <TouchableOpacity
                              key={it.key}
                              activeOpacity={0.8}
                              onPress={it.onPress}
                              style={{
                                flex: 1, aspectRatio: 9 / 16, borderRadius: 12,
                                overflow: 'hidden', backgroundColor: colors.surfaceElevated,
                                marginRight: idx === rest.length - 1 ? 0 : REEL_GAP,
                              }}
                            >
                              {it.thumb ? (
                                <Image source={{ uri: it.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                              ) : isTextOnlyPost ? (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                                  <Icon name="file-text" size={22} color={colors.textTertiary} style={{ marginBottom: 6 }} />
                                  <Text style={{ fontSize: 10, fontWeight: FontWeight.semiBold, color: colors.textPrimary, textAlign: 'center' }} numberOfLines={3}>
                                    {it.caption || 'Post'}
                                  </Text>
                                </View>
                              ) : (
                                <LinearGradient
                                  colors={[it.accent + 'CC', it.accent + '66']}
                                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <Icon name={it.typeIcon} size={24} color="rgba(255,255,255,0.8)" />
                                </LinearGradient>
                              )}

                              {!isTextOnlyPost && (
                                <LinearGradient
                                  colors={['transparent', 'rgba(0,0,0,0.7)']}
                                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 6, paddingTop: 16, paddingBottom: 6, gap: 2 }}
                                >
                                  {it.caption ? (
                                    <Text style={{ fontSize: 10, fontWeight: FontWeight.bold, color: '#fff' }} numberOfLines={1}>
                                      {it.caption}
                                    </Text>
                                  ) : null}
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                    <Icon name="heart" size={9} color="#fff" />
                                    <Text style={{ fontSize: 9, color: '#fff', fontWeight: FontWeight.bold }}>{formatViewerCount(it.likes)}</Text>
                                    <Icon name="message-circle" size={9} color="#fff" style={{ marginLeft: 4 }} />
                                    <Text style={{ fontSize: 9, color: '#fff', fontWeight: FontWeight.bold }}>{formatViewerCount(it.comments)}</Text>
                                  </View>
                                </LinearGradient>
                              )}

                              {it.onMenu && (
                                <TouchableOpacity
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  onPress={it.onMenu}
                                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <Icon name="more-vertical" size={13} color="#fff" />
                                </TouchableOpacity>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                );
              })()}
            </View>

            {/* ── Reels récents — carte vedette (le plus récent) + grille ── */}
            <View style={{ gap: 8 }}>
              <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>REELS RÉCENTS</Text>
              {myReels.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                  <Icon name="play-circle" size={28} color={colors.textTertiary} />
                  <Text style={{ fontSize: FontSize.smPlus, color: colors.textTertiary }}>Aucun reel publié</Text>
                </View>
              ) : (
                <>
                  {/* Carte vedette — reel le plus récent */}
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => nav.navigate('UserReels', { userId: user!.id, initialReelId: myReels[0].id, initialReels: myReels })}
                    style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surfaceElevated, marginBottom: 4 }}
                  >
                    {myReels[0].thumbnail_url ? (
                      <Image source={{ uri: myReels[0].thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="play" size={32} color={colors.textTertiary} />
                      </View>
                    )}

                    {myReels[0].duration_sec != null && (
                      <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                        <Icon name="play" size={10} color="#fff" />
                        <Text style={{ fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.bold }}>{formatDurationSec(myReels[0].duration_sec)}</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => setMenuTarget({ kind: 'reel', id: myReels[0].id })}
                      style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Icon name="more-vertical" size={15} color="#fff" />
                    </TouchableOpacity>

                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.75)']}
                      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 28, paddingBottom: 12, gap: 4 }}
                    >
                      {myReels[0].caption ? (
                        <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.extraBold, color: '#fff' }} numberOfLines={2}>
                          {myReels[0].caption}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Icon name="eye" size={12} color="#fff" />
                          <Text style={{ fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.semiBold }}>{formatViewerCount(myReels[0].view_count ?? 0)}</Text>
                          <Text style={{ fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)' }}>|</Text>
                          <Icon name="heart" size={12} color="#fff" />
                          <Text style={{ fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.semiBold }}>{formatViewerCount(myReels[0].likes_count ?? 0)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)' }}>
                          <Icon name="user" size={10} color="#fff" />
                          <Text style={{ fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.semiBold }}>Moi</Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Grille — les 3 reels suivants. flex:1 (pas une largeur
                      fixe) — avec moins de 3 éléments, les cartes s'élargissent
                      pour occuper toute la largeur au lieu de laisser un vide. */}
                  {myReels.length > 1 && (
                    <View style={{ flexDirection: 'row' }}>
                      {myReels.slice(1, 4).map((reel, idx, arr) => (
                        <TouchableOpacity
                          key={reel.id}
                          activeOpacity={0.8}
                          onPress={() => nav.navigate('UserReels', { userId: user!.id, initialReelId: reel.id, initialReels: myReels })}
                          style={{
                            flex: 1, aspectRatio: 9 / 16, borderRadius: 12,
                            overflow: 'hidden', backgroundColor: colors.surfaceElevated,
                            marginRight: idx === arr.length - 1 ? 0 : REEL_GAP,
                          }}
                        >
                          {reel.thumbnail_url ? (
                            <Image source={{ uri: reel.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : (
                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                              <Icon name="play" size={24} color={colors.textTertiary} />
                            </View>
                          )}

                          {reel.duration_sec != null && (
                            <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                              <Icon name="play" size={8} color="#fff" />
                              <Text style={{ fontSize: 9, color: '#fff', fontWeight: FontWeight.bold }}>{formatDurationSec(reel.duration_sec)}</Text>
                            </View>
                          )}

                          <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.7)']}
                            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 6, paddingTop: 16, paddingBottom: 6, gap: 2 }}
                          >
                            {reel.caption ? (
                              <Text style={{ fontSize: 10, fontWeight: FontWeight.bold, color: '#fff' }} numberOfLines={1}>
                                {reel.caption}
                              </Text>
                            ) : null}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Icon name="eye" size={9} color="#fff" />
                              <Text style={{ fontSize: 9, color: '#fff', fontWeight: FontWeight.bold }}>{formatViewerCount(reel.view_count ?? 0)}</Text>
                              <Icon name="heart" size={9} color="#fff" style={{ marginLeft: 4 }} />
                              <Text style={{ fontSize: 9, color: '#fff', fontWeight: FontWeight.bold }}>{formatViewerCount(reel.likes_count ?? 0)}</Text>
                            </View>
                          </LinearGradient>

                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => setMenuTarget({ kind: 'reel', id: reel.id })}
                            style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Icon name="more-vertical" size={13} color="#fff" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ── Bouton "Voir le reste de mes contenus" — ouvre le bottom sheet ── */}
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
                Voir le reste de mes contenus
              </Text>
            </TouchableOpacity>
          </View>
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

      {/* Bouton flottant "remonter + rafraîchir" — apparaît au scroll, jamais
          rendu tant qu'il n'a pas été affiché au moins une fois (pointerEvents
          évite qu'il intercepte les taps une fois invisible). Positionné
          au-dessus du footer (TAB_BAR_HEIGHT + insets.bottom + 16), jamais
          masqué par la tab bar. */}
      {showScrollTop && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            st.scrollTopWrap,
            {
              bottom: TAB_BAR_HEIGHT + insets.bottom + 16,
              opacity: scrollTopAnim,
              transform: [{
                scale: scrollTopAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
              }],
            },
          ]}
        >
          <TouchableOpacity
            onPress={handleScrollTopPress}
            activeOpacity={0.85}
            style={[st.scrollTopBtn, { backgroundColor: colors.primary }]}
          >
            <Icon name="chevrons-up" size={22} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Bottom sheet "Voir le reste de mes contenus" — glisse depuis le
          bas, propose Publications / Reels / Galerie. Au choix, ferme le
          sheet et navigue vers l'écran paginé correspondant. ── */}
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
              { key: 'posts',  label: 'Publications', icon: 'grid',        route: 'UserPosts' as const },
              { key: 'reels',  label: 'Reels',         icon: 'play-circle', route: 'UserReelsGrid' as const },
              { key: 'gallery', label: 'Galerie',      icon: 'image',       route: 'UserGallery' as const },
            ]).map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 15 }}
                activeOpacity={0.7}
                onPress={() => {
                  setShowContentSheet(false);
                  if (user) nav.navigate(opt.route, { userId: user.id });
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

      {/* Menu "..." — éditer/supprimer sur mes posts/reels */}
      <Modal transparent animationType="slide" visible={!!menuTarget} onRequestClose={() => setMenuTarget(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          activeOpacity={1} onPress={() => setMenuTarget(null)}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, paddingTop: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.divider, alignSelf: 'center', marginVertical: 8 }} />
            {menuTarget?.kind === 'post' && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
                onPress={() => {
                  const post = myPosts.find(p => p.id === menuTarget.id) ?? null;
                  setEditingPost(post);
                  setEditBody((post as any)?.body ?? '');
                  setMenuTarget(null);
                }}
              >
                <Icon name="edit-2" size={17} color={colors.textPrimary} />
                <Text style={{ fontSize: FontSize.basePlus, fontWeight: FontWeight.semiBold, color: colors.textPrimary }}>Modifier</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
              onPress={() => {
                const target = menuTarget;
                setMenuTarget(null);
                if (!target) return;
                if (target.kind === 'post') handleDeletePost(target.id);
                else handleDeleteReel(target.id);
              }}
            >
              <Icon name="trash-2" size={17} color="#EF4444" />
              <Text style={{ fontSize: FontSize.basePlus, fontWeight: FontWeight.semiBold, color: '#EF4444' }}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Édition rapide d'un post (texte) */}
      <Modal visible={!!editingPost} transparent animationType="slide" onRequestClose={() => setEditingPost(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditingPost(null)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: colors.textPrimary, marginBottom: 12 }}>Modifier le post</Text>
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              multiline
              autoFocus
              style={{ minHeight: 100, fontSize: FontSize.base, color: colors.textPrimary, textAlignVertical: 'top', backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 12 }}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surfaceElevated }}
                onPress={() => setEditingPost(null)}
              >
                <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.textPrimary }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, opacity: editSaving || !editBody.trim() ? 0.6 : 1 }}
                onPress={handleSaveEditPost}
                disabled={editSaving || !editBody.trim()}
              >
                {editSaving ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#fff' }}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

// ── Bouton flottant "remonter + rafraîchir" ───────────────────────────────────
const st = StyleSheet.create({
  scrollTopWrap: {
    position: 'absolute',
    right: 18,
  },
  scrollTopBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
});

// Header simple (pré-refonte carte flottante) — repris de l'ancien AppHeader,
// propre à cet écran uniquement. Hauteur compacte (pas HEADER_HEIGHT, conçue
// pour la carte flottante d'AppHeader.tsx, disproportionnée ici) — laissait
// un grand espace vide au-dessus du titre.
const PROFILE_HEADER_CONTENT_HEIGHT = 50;
const profileHeaderStyles = StyleSheet.create({
  container: {
    width: '100%',
    height: PROFILE_HEADER_CONTENT_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  side: {
    width: 64,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  right: {
    alignItems: 'flex-end',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
});
