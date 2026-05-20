import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet, Clipboard, ToastAndroid, Platform, Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { AppHeader, SkeletonProfile } from '../../components/common';
import { userService, eventService, concertService } from '../../services';
import type { User } from '../../types';
import type { Event } from '../../types/event';
import type { Concert } from '../../types/concert';
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
  const { currentUser: user, refreshUser } = useUser();

  const [loading,    setLoading]    = useState(true);
  const [myEvents,   setMyEvents]   = useState<Event[]>([]);
  const [myConcerts, setMyConcerts] = useState<Concert[]>([]);
  const [draftsTab,  setDraftsTab]  = useState<'events' | 'concerts'>('events');
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showQR, setShowQR] = useState(false);

  const lastLoadedAtRef = useRef<number>(0);
  const didMountRef     = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const me = await refreshUser();
      if (!me) return;

      const [profile, evts, res] = await Promise.allSettled([
        userService.getPublicProfile(me.id),
        eventService.getMyEvents(),
        concertService.getMyConcerts(),
      ]);
      if (profile.status === 'fulfilled') {
        setFollowersCount(profile.value.followers_count ?? 0);
        setFollowingCount(profile.value.following_count ?? 0);
      }
      if (evts.status === 'fulfilled') setMyEvents(evts.value);
      if (res.status  === 'fulfilled') setMyConcerts(res.value);
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
    if (age > 60_000) load(true);
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

          {/* ── Avatar & identité ───────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.delay(60).springify()}
            style={[s.avatarSection, { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider }]}
          >
            <View style={[s.avatarCircle, { borderColor: colors.primary + '50' }]}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  style={s.avatarGrad}
                >
                  <Text style={[s.avatarInitials, { color: colors.textOnBrand }]}>{initials}</Text>
                </LinearGradient>
              )}
            </View>

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
          </Animated.View>

          {/* ── Stats (Followers / Following / Publications) ───────────── */}
          {user && (
            <Animated.View entering={FadeInDown.delay(100).springify()} style={s.statsRow}>
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
            </Animated.View>
          )}

          {/* ── À propos ─────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(130).springify()} style={[s.section, { backgroundColor: colors.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, padding: 16 }]}>
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
              {user?.referral_code && (
                <TouchableOpacity style={s.aboutRow} onPress={() => nav.navigate('Referral')} activeOpacity={0.7}>
                  <Icon name="gift" size={16} color={colors.primary} />
                  <Text style={[s.aboutText, { color: colors.textPrimary }]}>
                    Code parrainage :{' '}
                    <Text style={{ fontWeight: '800', color: colors.primary, letterSpacing: 2 }}>
                      {user.referral_code}
                    </Text>
                  </Text>
                  <Icon name="chevron-right" size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.aboutRow, { backgroundColor: colors.primary + '12', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }]}
                activeOpacity={user?.folix_id ? 0.75 : 1}
                onPress={() => {
                  if (!user?.folix_id) return;
                  Clipboard.setString(user.folix_id!);
                  if (Platform.OS === 'android') {
                    ToastAndroid.show('FoliX ID copié !', ToastAndroid.SHORT);
                  } else {
                    Alert.alert('Copié', 'FoliX ID copié dans le presse-papier.');
                  }
                }}
              >
                <Icon name="at-sign" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 }}>FoliX ID</Text>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: user?.folix_id ? colors.primary : colors.textTertiary, letterSpacing: 2 }}>
                    {user?.folix_id ?? 'En cours de génération...'}
                  </Text>
                </View>
                {user?.folix_id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Icon name="copy" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Copier</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </Animated.View>


          {/* ── Publications récentes ─────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(190).springify()} style={[s.section, { backgroundColor: colors.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, padding: 16 }]}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>PUBLICATIONS</Text>
            {recentPublished.length > 0 ? (
              <View style={{ gap: 10, marginTop: 4 }}>
                {recentPublished.map(pub => {
                  const isEvt = pub.kind === 'event';
                  const item = pub.data as any;
                  const pubDate = new Date(item.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  });
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[s.pubCard, { backgroundColor: colors.surfaceElevated }]}
                      activeOpacity={0.7}
                      onPress={() => nav.navigate(
                        isEvt ? 'EventDetail' : 'ConcertDetail',
                        isEvt ? { eventId: item.id } : { concertId: item.id },
                      )}
                    >
                      {(item.thumbnail_url || item.banner_url) ? (
                        <Image
                          source={{ uri: item.thumbnail_url ?? item.banner_url }}
                          style={s.pubThumb}
                        />
                      ) : (
                        <View style={[s.pubThumb, { backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }]}>
                          <Icon name={isEvt ? 'calendar' : 'music'} size={20} color={colors.primary} />
                        </View>
                      )}
                      <View style={s.pubBody}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[s.pubTypeBadge, { backgroundColor: (isEvt ? '#E0389A' : '#7B3FF2') + '18' }]}>
                            <Icon name={isEvt ? 'calendar' : 'music'} size={9} color={isEvt ? '#E0389A' : '#7B3FF2'} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isEvt ? '#E0389A' : '#7B3FF2' }}>
                              {isEvt ? 'ÉVÉNEMENT' : 'CONCERT'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[s.pubTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textTertiary }}>{pubDate}</Text>
                      </View>
                      <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                <Icon name="edit-3" size={28} color={colors.textTertiary} />
                <Text style={{ fontSize: 13, color: colors.textTertiary }}>
                  Aucune publication pour le moment
                </Text>
              </View>
            )}
          </Animated.View>

          {/* ── Mes créations / Brouillons (artistes) ─────────────────── */}
          {isCreator && draftsList.length > 0 && (
            <Animated.View entering={FadeInDown.delay(220).springify()} style={[s.section, { backgroundColor: colors.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, padding: 16 }]}>
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
            </Animated.View>
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
