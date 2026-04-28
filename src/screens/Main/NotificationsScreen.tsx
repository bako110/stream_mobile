import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Image,
} from 'react-native';
import Animated, {
  FadeInDown, useAnimatedStyle, useSharedValue,
  withTiming, runOnJS, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonFeed } from '../../components/common';
import { notificationService, NotifItem } from '../../services/notificationService';
import { useWs } from '../../context/WebSocketContext';

// ── Config visuelle ────────────────────────────────────────────────────────────

const CFG: Record<string, { icon: string; grad: [string, string] }> = {
  follow:           { icon: 'user-plus',      grad: ['#3B82F6', '#60A5FA'] },
  reaction:         { icon: 'heart',          grad: ['#EF4444', '#FCA5A5'] },
  comment:          { icon: 'message-circle', grad: ['#3B82F6', '#93C5FD'] },
  mention:          { icon: 'at-sign',        grad: ['#06B6D4', '#67E8F9'] },
  profile_view:     { icon: 'eye',            grad: ['#F59E0B', '#FCD34D'] },
  story_view:       { icon: 'eye',            grad: ['#F59E0B', '#FCD34D'] },
  concert_created:  { icon: 'music',          grad: ['#7B3FF2', '#A78BFA'] },
  event_created:    { icon: 'calendar',       grad: ['#E0389A', '#F472B6'] },
  concert_going:    { icon: 'headphones',     grad: ['#FF7A2F', '#FCA5A5'] },
  event_going:      { icon: 'map-pin',        grad: ['#36D9A0', '#6EE7B7'] },
  community_joined: { icon: 'users',          grad: ['#9B65F5', '#C4B5FD'] },
  reel_posted:      { icon: 'film',           grad: ['#E0389A', '#FB7185'] },
  subscription:     { icon: 'star',           grad: ['#36D9A0', '#6EE7B7'] },
  welcome:          { icon: 'gift',           grad: ['#7B3FF2', '#E0389A'] },
  ticket:           { icon: 'tag',            grad: ['#FF7A2F', '#FCD34D'] },
  concert_live:     { icon: 'radio',          grad: ['#EF4444', '#FF7A2F'] },
};
const DEFAULT_CFG = { icon: 'bell', grad: ['#7B3FF2', '#9B65F5'] as [string, string] };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return 'À l\'instant';
  if (mins < 60)  return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Hier';
  if (days < 7)   return `${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export const NotificationsScreen: React.FC = () => {
  const { theme }  = useTheme();
  const { colors, fontSize } = theme;
  const nav = useNavigation<any>();
  const { addListener, removeListener, clearUnreadNotifications } = useWs();

  const [items,      setItems]      = useState<NotifItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const [filter,     setFilter]     = useState<'all' | 'unread'>('all');
  const loadingMore = useRef(false);

  const load = useCallback(async (p = 1, refresh = false) => {
    try {
      const data = await notificationService.getList(p, 30, filter === 'unread');
      if (refresh || p === 1) {
        setItems(data);
        setPage(1);
        clearUnreadNotifications();
      } else {
        setItems(prev => {
          const ids = new Set(prev.map(x => x.id));
          return [...prev, ...data.filter(d => !ids.has(d.id))];
        });
        setPage(p);
      }
      setHasMore(data.length >= 30);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
      loadingMore.current = false;
    }
  }, [filter, clearUnreadNotifications]);

  useEffect(() => { setLoading(true); load(1); }, [filter]);

  // Injection temps réel
  useEffect(() => {
    const onMessage = (payload: any) => {
      if (payload.type !== 'notification') return;
      const newItem: NotifItem = {
        id:                payload.id ?? `ws-${Date.now()}`,
        notification_type: payload.notification_type ?? 'system',
        title:             payload.title ?? 'Notification',
        body:              payload.body  ?? '',
        ref_id:            payload.ref_id   ?? null,
        ref_type:          payload.ref_type ?? null,
        is_read:           false,
        created_at:        payload.created_at ?? new Date().toISOString(),
        actor:             payload.actor ?? null,
      };
      setItems(prev => prev.some(x => x.id === newItem.id) ? prev : [newItem, ...prev]);
    };
    addListener(onMessage);
    return () => removeListener(onMessage);
  }, [addListener, removeListener]);

  const markAllRead = useCallback(async () => {
    setItems(prev => prev.map(x => ({ ...x, is_read: true })));
    clearUnreadNotifications();
    try { await notificationService.markAllRead(); } catch {}
  }, [clearUnreadNotifications]);

  const markOneRead = useCallback(async (id: string) => {
    setItems(prev => prev.map(x => x.id === id ? { ...x, is_read: true } : x));
    try { await notificationService.markRead(id); } catch {}
  }, []);

  const removeItem = useCallback(async (id: string) => {
    setItems(prev => prev.filter(x => x.id !== id));
    try { await notificationService.deleteOne(id); } catch {}
  }, []);

  const handlePress = useCallback((item: NotifItem) => {
    if (!item.is_read) markOneRead(item.id);
    if (!item.ref_id) return;
    if (item.ref_type === 'concert')   nav.navigate('ConcertDetail',   { concertId: item.ref_id });
    else if (item.ref_type === 'event') nav.navigate('EventDetail',     { eventId:   item.ref_id });
    else if (item.ref_type === 'reel')  nav.navigate('Reels',           { initialReelId: item.ref_id });
    else if (item.ref_type === 'community') nav.navigate('CommunityDetail', { communityId: item.ref_id });
  }, [nav, markOneRead]);

  const loadMore = useCallback(() => {
    if (loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    load(page + 1);
  }, [hasMore, page, load]);

  const unreadCount = items.filter(x => !x.is_read).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <LinearGradient colors={[colors.surface, colors.background]} style={s.header}>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={[s.unreadBadge, { backgroundColor: colors.primary }]}>
            <Text style={s.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={[s.readAllBtn, { borderColor: colors.border }]}>
            <Icon name="check" size={14} color={colors.primary} />
            <Text style={[s.readAllText, { color: colors.primary }]}>Tout lire</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* Filtres */}
      <View style={[s.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {(['all', 'unread'] as const).map(f => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[s.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, { color: active ? colors.primary : colors.textTertiary }]}>
                {f === 'all' ? 'Toutes' : `Non lues${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && items.length === 0 ? (
        <SkeletonFeed count={8} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(1, true); }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={[s.emptyIconWrap, { backgroundColor: colors.surfaceElevated }]}>
                <Icon name="bell-off" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {filter === 'unread' ? 'Tout est lu ✓' : 'Aucune notification'}
              </Text>
              <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                {filter === 'unread' ? 'Vous êtes à jour.' : 'Vos notifications apparaîtront ici.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <NotifCard
              key={item.id}
              item={item}
              index={index}
              colors={colors}
              fontSize={fontSize}
              onPress={() => handlePress(item)}
              onDelete={() => removeItem(item.id)}
              onMarkRead={() => markOneRead(item.id)}
            />
          )}
        />
      )}
    </View>
  );
};

// ── NotifCard avec swipe-to-delete ────────────────────────────────────────────

interface CardProps {
  item:       NotifItem;
  index:      number;
  colors:     any;
  fontSize:   any;
  onPress:    () => void;
  onDelete:   () => void;
  onMarkRead: () => void;
}

const SWIPE_THRESHOLD = -80;

const NotifCard: React.FC<CardProps> = ({ item, index, colors, fontSize, onPress, onDelete, onMarkRead }) => {
  const cfg    = CFG[item.notification_type] ?? DEFAULT_CFG;
  const isRead = item.is_read;

  const translateX = useSharedValue(0);
  const height     = useSharedValue(72);
  const opacity    = useSharedValue(1);

  const doDelete = useCallback(() => {
    height.value  = withTiming(0,  { duration: 250 });
    opacity.value = withTiming(0,  { duration: 200 }, () => runOnJS(onDelete)());
  }, [onDelete]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate(e => {
      if (e.translationX < 0) translateX.value = e.translationX;
    })
    .onEnd(e => {
      if (e.translationX < SWIPE_THRESHOLD) {
        translateX.value = withTiming(-300, { duration: 200 }, () => runOnJS(doDelete)());
      } else {
        translateX.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    height:    height.value,
    opacity:   opacity.value,
    overflow:  'hidden',
  }));

  // Indicateur rouge "Supprimer" derrière la carte
  const deleteReveal = useAnimatedStyle(() => ({
    opacity: translateX.value < -20 ? withTiming(1) : withTiming(0),
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 25).springify()} style={{ marginBottom: 8 }}>
      {/* Fond rouge derrière */}
      <Animated.View style={[StyleSheet.absoluteFill, s.deleteBack, deleteReveal]}>
        <Icon name="trash-2" size={20} color="#fff" />
        <Text style={s.deleteBackText}>Supprimer</Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <TouchableOpacity
            style={[
              s.card,
              {
                backgroundColor: isRead ? colors.surface : colors.primary + '0D',
                borderColor:     isRead ? 'transparent' : colors.primary + '30',
                borderWidth: 1,
              },
            ]}
            activeOpacity={0.8}
            onPress={onPress}
            onLongPress={!isRead ? onMarkRead : undefined}
          >
            {/* Dot non-lu */}
            {!isRead && <View style={[s.dot, { backgroundColor: colors.primary }]} />}

            {/* Avatar acteur ou icône type */}
            {item.actor?.avatar_url ? (
              <View style={s.avatarWrap}>
                <Image source={{ uri: item.actor.avatar_url }} style={s.avatar} />
                <LinearGradient colors={cfg.grad as [string, string]} style={s.typeBadge}>
                  <Icon name={cfg.icon} size={9} color="#fff" />
                </LinearGradient>
              </View>
            ) : (
              <LinearGradient colors={cfg.grad as [string, string]} style={s.iconWrap}>
                <Icon name={cfg.icon} size={18} color="#fff" />
              </LinearGradient>
            )}

            {/* Texte */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{ fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: isRead ? '400' : '700', lineHeight: 18 }}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <Text
                style={{ fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 16 }}
                numberOfLines={2}
              >
                {item.body}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
                {timeAgo(item.created_at)}
              </Text>
            </View>

            {/* Chevron si navigable */}
            {!!item.ref_id && (
              <View style={[s.chevron, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="chevron-right" size={14} color={colors.textTertiary} />
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, gap: 10,
  },
  headerTitle:  { fontSize: 26, fontWeight: '800', flex: 1 },
  unreadBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  unreadBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  readAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  readAllText: { fontSize: 12, fontWeight: '600' },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 13,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 16, gap: 12,
  },
  dot: { position: 'absolute', top: 14, left: 6, width: 7, height: 7, borderRadius: 3.5 },

  avatarWrap: { position: 'relative' },
  avatar:     { width: 46, height: 46, borderRadius: 23 },
  typeBadge:  {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },

  chevron: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  deleteBack: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 6, borderRadius: 16,
    backgroundColor: '#EF4444', paddingRight: 20,
  },
  deleteBackText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80, paddingHorizontal: 40 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
