import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Image, Alert,
} from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue,
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
  follow:                    { icon: 'user-plus',      grad: ['#3B82F6', '#60A5FA'] },
  reaction:                  { icon: 'heart',          grad: ['#EF4444', '#FCA5A5'] },
  comment:                   { icon: 'message-circle', grad: ['#3B82F6', '#93C5FD'] },
  mention:                   { icon: 'at-sign',        grad: ['#06B6D4', '#67E8F9'] },
  profile_view:              { icon: 'eye',            grad: ['#F59E0B', '#FCD34D'] },
  story_view:                { icon: 'eye',            grad: ['#F59E0B', '#FCD34D'] },
  concert_created:           { icon: 'music',          grad: ['#7B3FF2', '#A78BFA'] },
  event_created:             { icon: 'calendar',       grad: ['#E0389A', '#F472B6'] },
  concert_going:             { icon: 'headphones',     grad: ['#FF7A2F', '#FCA5A5'] },
  event_going:               { icon: 'map-pin',        grad: ['#36D9A0', '#6EE7B7'] },
  community_joined:          { icon: 'users',          grad: ['#9B65F5', '#C4B5FD'] },
  reel_posted:               { icon: 'film',           grad: ['#E0389A', '#FB7185'] },
  subscription:              { icon: 'star',           grad: ['#36D9A0', '#6EE7B7'] },
  welcome:                   { icon: 'gift',           grad: ['#7B3FF2', '#E0389A'] },
  ticket:                    { icon: 'tag',            grad: ['#FF7A2F', '#FCD34D'] },
  concert_live:              { icon: 'radio',          grad: ['#EF4444', '#FF7A2F'] },
  system:                    { icon: 'shield',         grad: ['#6366F1', '#8B5CF6'] },
  security:                  { icon: 'lock',           grad: ['#EF4444', '#F97316'] },
  planning_invite:           { icon: 'calendar',       grad: ['#7B3FF2', '#9B65F5'] },
  planning_invite_response:  { icon: 'check-circle',   grad: ['#10B981', '#34D399'] },
  planning_reminder:         { icon: 'clock',          grad: ['#F59E0B', '#FBBF24'] },
  planning_cancelled:        { icon: 'x-circle',       grad: ['#EF4444', '#F87171'] },
};
const DEFAULT_CFG = { icon: 'bell', grad: ['#7B3FF2', '#9B65F5'] as [string, string] };

const USER_NOTIF_TYPES = new Set([
  'follow', 'profile_view', 'story_view', 'mention', 'reaction', 'comment',
  'subscription', 'reel_posted',
]);

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

  const [items,       setItems]       = useState<NotifItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(true);
  const [filter,      setFilter]      = useState<'all' | 'unread'>('all');
  const [selectMode,  setSelectMode]  = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    // Naviguer immédiatement, marquer lu en arrière-plan
    if (!item.is_read) markOneRead(item.id);

    if (USER_NOTIF_TYPES.has(item.notification_type) && item.actor?.id) {
      nav.navigate('UserProfile', { userId: item.actor.id });
      return;
    }

    // Types planning → ouvrir le planning
    if (
      item.notification_type === 'planning_invite' ||
      item.notification_type === 'planning_invite_response' ||
      item.notification_type === 'planning_reminder' ||
      item.notification_type === 'planning_cancelled'
    ) {
      nav.navigate('Planning');
      return;
    }

    if (!item.ref_id) return;
    if (item.ref_type === 'concert')         nav.navigate('ConcertDetail',   { concertId:     item.ref_id });
    else if (item.ref_type === 'event')      nav.navigate('EventDetail',     { eventId:       item.ref_id });
    else if (item.ref_type === 'reel')       nav.navigate('Reels',           { initialReelId: item.ref_id });
    else if (item.ref_type === 'user')       nav.navigate('UserProfile',     { userId:        item.ref_id });
    else if (item.ref_type === 'community')  nav.navigate('CommunityDetail', { communityId:   item.ref_id });
    else if (item.ref_type === 'planning_invite' || item.ref_type === 'planning_entry') nav.navigate('Planning');
  }, [nav, markOneRead]);

  const loadMore = useCallback(() => {
    if (loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    load(page + 1);
  }, [hasMore, page, load]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Supprimer les notifications',
      `Supprimer ${selectedIds.size} notification${selectedIds.size > 1 ? 's' : ''} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: () => {
            const ids = [...selectedIds];
            setItems(prev => prev.filter(x => !selectedIds.has(x.id)));
            exitSelectMode();
            ids.forEach(id => notificationService.deleteOne(id).catch(() => {}));
          },
        },
      ],
    );
  }, [selectedIds, exitSelectMode]);

  const unreadCount  = items.filter(x => !x.is_read).length;
  const allSelected  = items.length > 0 && selectedIds.size === items.length;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(x => x.id)));
  }, [allSelected, items]);

  const deleteAll = useCallback(() => {
    if (items.length === 0) return;
    Alert.alert(
      'Supprimer toutes les notifications',
      `Supprimer ${items.length} notification${items.length > 1 ? 's' : ''} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout supprimer', style: 'destructive',
          onPress: async () => {
            setItems([]);
            try { await notificationService.deleteAll(); } catch {}
          },
        },
      ],
    );
  }, [items]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <LinearGradient colors={[colors.surface, colors.background]} style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Notifications</Text>
        {unreadCount > 0 && !selectMode && (
          <View style={[s.unreadBadge, { backgroundColor: colors.primary }]}>
            <Text style={s.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {!selectMode ? (
          <>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllRead} style={[s.readAllBtn, { borderColor: colors.border }]}>
                <Icon name="check" size={14} color={colors.primary} />
                <Text style={[s.readAllText, { color: colors.primary }]}>Tout lire</Text>
              </TouchableOpacity>
            )}
            {items.length > 0 && (
              <>
                <TouchableOpacity onPress={deleteAll} style={[s.readAllBtn, { borderColor: '#FF3B30', marginLeft: 6 }]}>
                  <Icon name="trash-2" size={14} color="#FF3B30" />
                  <Text style={[s.readAllText, { color: '#FF3B30' }]}>Tout supprimer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectMode(true)} style={[s.readAllBtn, { borderColor: colors.border, marginLeft: 6 }]}>
                  <Icon name="check-square" size={14} color={colors.textSecondary} />
                  <Text style={[s.readAllText, { color: colors.textSecondary }]}>Sélectionner</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity onPress={toggleSelectAll} style={[s.readAllBtn, { borderColor: colors.primary }]}>
              <Icon name={allSelected ? 'check-square' : 'square'} size={14} color={colors.primary} />
              <Text style={[s.readAllText, { color: colors.primary }]}>
                {allSelected ? 'Désélectionner' : 'Tout sélectionner'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={deleteSelected} disabled={selectedIds.size === 0}
              style={[s.readAllBtn, { borderColor: selectedIds.size > 0 ? '#FF3B30' : colors.border }]}>
              <Icon name="trash-2" size={14} color={selectedIds.size > 0 ? '#FF3B30' : colors.textTertiary} />
              <Text style={[s.readAllText, { color: selectedIds.size > 0 ? '#FF3B30' : colors.textTertiary }]}>
                {selectedIds.size > 0 ? `Supprimer (${selectedIds.size})` : 'Supprimer'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={exitSelectMode} style={[s.readAllBtn, { borderColor: colors.border }]}>
              <Icon name="x" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
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
          ListHeaderComponent={!selectMode && items.length > 0 ? (
            <View style={[s.swipeHint, { backgroundColor: colors.surfaceElevated }]}>
              <Icon name="arrow-left" size={12} color={colors.textTertiary} />
              <Text style={[s.swipeHintText, { color: colors.textTertiary }]}>
                Glissez vers la gauche pour supprimer
              </Text>
            </View>
          ) : null}
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
          renderItem={({ item }) => (
            <NotifCard
              key={item.id}
              item={item}
              colors={colors}
              fontSize={fontSize}
              selectMode={selectMode}
              selected={selectedIds.has(item.id)}
              onPress={() => selectMode ? toggleSelect(item.id) : handlePress(item)}
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
  item:        NotifItem;
  colors:      any;
  fontSize:    any;
  selectMode:  boolean;
  selected:    boolean;
  onPress:     () => void;
  onDelete:    () => void;
  onMarkRead:  () => void;
}

const SWIPE_THRESHOLD = -80;

const NotifCard: React.FC<CardProps> = React.memo(({ item, colors, fontSize, selectMode, selected, onPress, onDelete, onMarkRead }) => {
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
    <Animated.View style={{ marginBottom: 8 }}>
      {/* Fond rouge derrière — masqué en mode sélection */}
      {!selectMode && (
        <Animated.View style={[StyleSheet.absoluteFill, s.deleteBack, deleteReveal]}>
          <Icon name="trash-2" size={20} color="#fff" />
          <Text style={s.deleteBackText}>Supprimer</Text>
        </Animated.View>
      )}

      <GestureDetector gesture={selectMode ? Gesture.Pan() : pan}>
        <Animated.View style={selectMode ? { overflow: 'hidden' } : cardStyle}>
          <TouchableOpacity
            style={[
              s.card,
              {
                backgroundColor: selected
                  ? colors.primary + '22'
                  : isRead ? colors.surface : colors.primary + '0D',
                borderColor: selected
                  ? colors.primary
                  : isRead ? 'transparent' : colors.primary + '30',
                borderWidth: 1,
              },
            ]}
            activeOpacity={0.8}
            onPress={onPress}
            onLongPress={!selectMode && !isRead ? onMarkRead : undefined}
          >
            {/* Dot non-lu */}
            {!isRead && !selectMode && <View style={[s.dot, { backgroundColor: colors.primary }]} />}

            {/* Checkbox en mode sélection */}
            {selectMode && (
              <View style={[s.checkbox, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                {selected && <Icon name="check" size={12} color="#fff" />}
              </View>
            )}

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
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, gap: 10,
  },
  headerTitle:  { fontSize: 26, fontWeight: '800' },
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

  backBtn: {
    marginRight: 4,
    padding: 4,
  },

  swipeHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10,
  },
  swipeHintText: { fontSize: 12 },

  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#aaa',
    alignItems: 'center', justifyContent: 'center',
  },

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
