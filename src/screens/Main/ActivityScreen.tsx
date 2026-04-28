import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  RefreshControl, Image, StyleSheet, SectionList,
} from 'react-native';
import Animated, {
  FadeInDown, FadeInRight,
  useSharedValue, useAnimatedStyle, withSpring,
  interpolateColor, withTiming,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonFeed } from '../../components/common';
import { activityService } from '../../services/activityService';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { useWs } from '../../context/WebSocketContext';
import type { ActivityItem } from '../../services/activityService';
import type { AppColors } from '../../theme/colors';

// ── Config types ──────────────────────────────────────────────────────────────

type ActivityTab = 'all' | 'foryou' | 'unread';

const CFG: Record<string, {
  icon: string;
  grad: [string, string];
  label: (name: string, summary?: string | null) => string;
  action?: string;
}> = {
  follow:           { icon: 'user-plus',     grad: ['#3B82F6','#60A5FA'], label: (n) => `vous suit maintenant`,      action: 'Suivre en retour' },
  event_created:    { icon: 'calendar',      grad: ['#E0389A','#F472B6'], label: (n, s) => s || `a créé un événement` },
  concert_created:  { icon: 'music',         grad: ['#7B3FF2','#A78BFA'], label: (n, s) => s || `a créé un concert` },
  event_going:      { icon: 'map-pin',       grad: ['#36D9A0','#6EE7B7'], label: (n, s) => s || `va à un événement` },
  concert_going:    { icon: 'headphones',    grad: ['#FF7A2F','#FCA5A5'], label: (n, s) => s || `va à un concert` },
  community_joined: { icon: 'users',         grad: ['#9B65F5','#C4B5FD'], label: (n, s) => s || `a rejoint une communauté` },
  reel_posted:      { icon: 'film',          grad: ['#E0389A','#FB7185'], label: (n, s) => s || `a posté un reel` },
  comment:          { icon: 'message-circle',grad: ['#3B82F6','#93C5FD'], label: (n, s) => s || `a commenté votre contenu` },
  reaction:         { icon: 'heart',         grad: ['#EF4444','#FCA5A5'], label: (n, s) => s || `a réagi à votre contenu` },
  story_view:       { icon: 'eye',           grad: ['#F59E0B','#FCD34D'], label: (n) => `a vu votre story` },
  mention:          { icon: 'at-sign',       grad: ['#06B6D4','#67E8F9'], label: (n, s) => s || `vous a mentionné` },
  birthday:         { icon: 'gift',          grad: ['#EC4899','#F9A8D4'], label: (n) => `fête son anniversaire aujourd'hui 🎂` },
};

const NAVIGABLE = ['concert_created','concert_going','event_created','event_going','community_joined','reel_posted'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'À l\'instant';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Hier';
  if (days < 7)  return `${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function groupByDate(items: ActivityItem[]): { title: string; data: ActivityItem[] }[] {
  const sections: Record<string, ActivityItem[]> = {};
  const now = Date.now();
  for (const item of items) {
    const diff = now - new Date(item.created_at).getTime();
    const hrs  = diff / 3_600_000;
    let label: string;
    if (hrs < 24)        label = "Aujourd'hui";
    else if (hrs < 48)   label = 'Hier';
    else if (hrs < 168)  label = 'Cette semaine';
    else                 label = 'Plus ancien';
    if (!sections[label]) sections[label] = [];
    sections[label].push(item);
  }
  const ORDER = ["Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien'];
  return ORDER.filter(k => sections[k]).map(k => ({ title: k, data: sections[k] }));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export const ActivityScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const { clearUnreadActivity } = useWs();

  const [items,      setItems]      = useState<ActivityItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState<ActivityTab>('all');
  const [readIds,    setReadIds]    = useState<Set<string>>(new Set());
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const [following,  setFollowing]  = useState<Set<string>>(new Set());
  const [myId,       setMyId]       = useState<string | null>(null);

  useEffect(() => {
    authService.getMe().then(me => setMyId(String(me.id))).catch(() => {});
  }, []);

  const load = useCallback(async (p = 1, refresh = false) => {
    try {
      const raw = await activityService.getFeed(p);
      // Filtrer ses propres activités publiques (on ne veut pas se voir soi-même)
      const me = myId ?? (await authService.getMe().then(u => String(u.id)).catch(() => null));
      if (me && !myId) setMyId(me);
      const data = me
        ? raw.filter(item => !(item.actor_id === me && item.target_user_id === null))
        : raw;
      if (refresh || p === 1) {
        setItems(data);
        // Marquer comme lus après 1s
        setTimeout(() => {
          setReadIds(new Set(data.map(d => d.id)));
          clearUnreadActivity();
        }, 1000);
      } else {
        setItems(prev => {
          const ids = new Set(prev.map(x => x.id));
          return [...prev, ...data.filter(d => !ids.has(d.id))];
        });
      }
      setHasMore(data.length >= 30);
      setPage(p);
    } catch (err) {
      if (__DEV__) console.warn('[ActivityScreen]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { setLoading(true); load(1); }, []);

  const handleFollow = useCallback(async (actorId: string) => {
    setFollowing(prev => { const s = new Set(prev); s.add(actorId); return s; });
    try { await userService.follow(actorId); } catch {
      setFollowing(prev => { const s = new Set(prev); s.delete(actorId); return s; });
    }
  }, []);

  const handlePress = useCallback((item: ActivityItem) => {
    if (!item.ref_id) {
      if (item.actor) nav.navigate('UserProfile', { userId: item.actor.id });
      return;
    }
    const t = item.activity_type;
    if (t === 'concert_created' || t === 'concert_going') {
      nav.navigate('ConcertDetail', { concertId: item.ref_id });
    } else if (t === 'event_created' || t === 'event_going') {
      nav.navigate('EventDetail', { eventId: item.ref_id });
    } else if (t === 'community_joined') {
      nav.navigate('CommunityDetail', { communityId: item.ref_id });
    } else if (t === 'reel_posted') {
      nav.navigate('Reels', { initialReelId: item.ref_id });
    } else if (item.actor) {
      nav.navigate('UserProfile', { userId: item.actor.id });
    }
  }, [nav]);

  // Filtrage selon l'onglet
  const filtered = tab === 'unread'
    ? items.filter(i => !readIds.has(i.id))
    : tab === 'foryou'
    ? items.filter(i => ['reaction','comment','follow','mention'].includes(i.activity_type))
    : items;

  const sections = groupByDate(filtered);
  const unreadCount = items.filter(i => !readIds.has(i.id)).length;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[colors.surface, colors.background]}
        style={s.header}
      >
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Activité</Text>
        {unreadCount > 0 && (
          <View style={[s.unreadBadge, { backgroundColor: colors.primary }]}>
            <Text style={s.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
      </LinearGradient>

      {/* ── Onglets ── */}
      <View style={[s.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {([
          { key: 'all',     label: 'Tout' },
          { key: 'foryou',  label: 'Pour vous' },
          { key: 'unread',  label: `Non lus${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
        ] as const).map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, { color: active ? colors.primary : colors.textTertiary }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Contenu ── */}
      {loading && items.length === 0 ? (
        <SkeletonFeed count={8} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIconWrap, { backgroundColor: colors.surfaceElevated }]}>
            <Icon name="bell" size={36} color={colors.textTertiary} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
            {tab === 'unread' ? 'Tout est lu ✓' : 'Aucune activité'}
          </Text>
          <Text style={[s.emptyText, { color: colors.textTertiary }]}>
            {tab === 'unread'
              ? 'Vous êtes à jour.'
              : 'Suivez des personnes pour voir leur activité ici.'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          onEndReached={() => { if (!loading && hasMore) load(page + 1); }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(1, true); }}
              tintColor={colors.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>{section.title}</Text>
              <View style={[s.sectionLine, { backgroundColor: colors.divider }]} />
            </View>
          )}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 35).springify()}>
              <ActivityCard
                item={item}
                colors={colors}
                isRead={readIds.has(item.id)}
                isFollowing={following.has(item.actor?.id ?? '')}
                onPress={() => handlePress(item)}
                onAvatarPress={() => item.actor && nav.navigate('UserProfile', { userId: item.actor.id })}
                onFollow={() => item.actor && handleFollow(item.actor.id)}
              />
            </Animated.View>
          )}
        />
      )}
    </View>
  );
};

// ── ActivityCard ──────────────────────────────────────────────────────────────

interface CardProps {
  item: ActivityItem;
  colors: AppColors;
  isRead: boolean;
  isFollowing: boolean;
  onPress: () => void;
  onAvatarPress: () => void;
  onFollow: () => void;
}

const ActivityCard: React.FC<CardProps> = ({
  item, colors, isRead, isFollowing, onPress, onAvatarPress, onFollow,
}) => {
  const cfg       = CFG[item.activity_type] ?? CFG.follow;
  const actorName = item.actor?.display_name || item.actor?.username || 'Utilisateur';
  const isNav     = NAVIGABLE.includes(item.activity_type) && !!item.ref_id;
  const isFollow  = item.activity_type === 'follow';
  const isBirthday = item.activity_type === 'birthday';

  return (
    <TouchableOpacity
      style={[
        s.card,
        { backgroundColor: isRead ? colors.surfaceElevated : colors.primary + '0D',
          borderColor: isRead ? 'transparent' : colors.primary + '30',
          borderWidth: 1 },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Dot non-lu */}
      {!isRead && (
        <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />
      )}

      {/* Avatar + badge type */}
      <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.8} style={s.avatarWrap}>
        {item.actor?.avatar_url ? (
          <Image source={{ uri: item.actor.avatar_url }} style={s.avatar} />
        ) : (
          <LinearGradient colors={cfg.grad} style={s.avatarFallback}>
            <Text style={s.avatarInitial}>{actorName[0].toUpperCase()}</Text>
          </LinearGradient>
        )}
        {/* Badge icône type */}
        <LinearGradient colors={cfg.grad} style={s.typeBadge}>
          <Icon name={cfg.icon} size={10} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Texte */}
      <View style={s.textWrap}>
        <Text style={[s.activityText, { color: colors.textPrimary }]} numberOfLines={2}>
          <Text style={{ fontWeight: '700' }}>{actorName} </Text>
          <Text style={{ fontWeight: '400' }}>{cfg.label(actorName, item.summary)}</Text>
        </Text>
        {item.summary && item.summary !== cfg.label(actorName, item.summary) && (
          <Text style={[s.summaryText, { color: colors.textSecondary, backgroundColor: colors.backgroundSecondary }]} numberOfLines={1}>
            {item.summary}
          </Text>
        )}
        <Text style={[s.timeText, { color: colors.textTertiary }]}>{timeAgo(item.created_at)}</Text>
      </View>

      {/* Action rapide */}
      {isFollow && !isFollowing && (
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: colors.primary }]}
          onPress={(e) => { e.stopPropagation(); onFollow(); }}
          activeOpacity={0.8}
        >
          <Icon name="user-plus" size={13} color="#fff" />
          <Text style={s.actionBtnText}>Suivre</Text>
        </TouchableOpacity>
      )}
      {isFollow && isFollowing && (
        <View style={[s.actionBtn, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }]}>
          <Icon name="user-check" size={13} color={colors.textSecondary} />
          <Text style={[s.actionBtnText, { color: colors.textSecondary }]}>Suivi(e)</Text>
        </View>
      )}
      {isNav && !isFollow && (
        <View style={[s.navArrow, { backgroundColor: colors.backgroundSecondary }]}>
          <Icon name="chevron-right" size={16} color={colors.textTertiary} />
        </View>
      )}
      {isBirthday && (
        <View style={s.birthdayEmoji}>
          <Text style={{ fontSize: 24 }}>🎂</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, gap: 10,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', flex: 1 },
  unreadBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  unreadBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 13,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  list: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 2,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionLine:  { flex: 1, height: StyleSheet.hairlineWidth },

  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 16,
    marginBottom: 8, gap: 12,
  },
  unreadDot: {
    position: 'absolute', top: 14, left: 6,
    width: 7, height: 7, borderRadius: 3.5,
  },

  avatarWrap: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '800' },
  typeBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  textWrap: { flex: 1, gap: 3 },
  activityText: { fontSize: 13, lineHeight: 18 },
  summaryText: {
    fontSize: 12, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, marginTop: 2,
  },
  timeText: { fontSize: 11 },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  navArrow: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  birthdayEmoji: { paddingHorizontal: 4 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
