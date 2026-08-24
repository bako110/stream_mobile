import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Image, Linking,
} from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue,
  withTiming, runOnJS, withSpring, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonFeed, BackButton } from '../../components/common';
import { showConfirm } from '../../services';
import { notificationService, NotifItem } from '../../services/notificationService';
import { useWs } from '../../context/WebSocketContext';
import { getStoreUrl } from '../../utils/constants';

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
  post_posted:               { icon: 'file-text',      grad: ['#7B3FF2', '#A78BFA'] },
  story_posted:              { icon: 'circle',         grad: ['#F59E0B', '#FCD34D'] },
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
  content_removed:           { icon: 'alert-triangle', grad: ['#EF4444', '#F97316'] },
  app_update:                { icon: 'download',       grad: ['#7B3FF2', '#E0389A'] },
  verification_renewed:      { icon: 'check-circle',   grad: ['#1D9BF0', '#60A5FA'] },
  verification_payment_failed: { icon: 'alert-triangle', grad: ['#F59E0B', '#FBBF24'] },
  verification_revoked:      { icon: 'shield-off',     grad: ['#EF4444', '#F87171'] },
  boost_started:             { icon: 'zap',            grad: ['#9B65F5', '#C4B5FD'] },
  boost_expiring:            { icon: 'clock',          grad: ['#F59E0B', '#FBBF24'] },
  boost_ended:               { icon: 'check-circle',   grad: ['#6B7280', '#9CA3AF'] },
  ad_started:                { icon: 'trending-up',    grad: ['#F97316', '#FB923C'] },
  ad_ended:                  { icon: 'flag',           grad: ['#6B7280', '#9CA3AF'] },
  // Moderation IA (2026-08) — verdict apres analyse automatique d'un reel
  // publie par l'utilisateur (cf. recommendation_system/ai_service).
  reel_analysis_cleared:     { icon: 'check-circle',   grad: ['#10B981', '#34D399'] },
  reel_analysis_limited:     { icon: 'alert-circle',   grad: ['#F59E0B', '#FBBF24'] },
  reel_analysis_removed:     { icon: 'alert-triangle', grad: ['#EF4444', '#F87171'] },
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
  const insets = useSafeAreaInsets();
  const { addListener, removeListener, clearUnreadNotifications } = useWs();

  const [items,       setItems]       = useState<any[]>([]);
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
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingMore.current = false;
    }
  }, [filter, clearUnreadNotifications]);

  useEffect(() => { setLoading(true); load(1); }, [filter]);

  // Injection temps réel — ignore si pas d'id réel (évite doublons avec le reload API)
  useEffect(() => {
    const onMessage = (payload: any) => {
      if (payload.type !== 'notification') return;
      // Sans id persistant on ne peut pas dédupliquer → on recharge depuis l'API
      if (!payload.id) { load(1, true); return; }
      const newItem: NotifItem = {
        id:                payload.id,
        notification_type: payload.notification_type ?? 'system',
        title:             payload.title ?? 'Notification',
        body:              payload.body  ?? '',
        ref_id:            payload.ref_id   ?? null,
        ref_type:          payload.ref_type ?? null,
        image_url:         payload.image_url ?? null,
        is_read:           false,
        created_at:        payload.created_at ?? new Date().toISOString(),
        actor:             payload.actor ?? null,
      };
      setItems(prev => prev.some(x => x.id === newItem.id) ? prev : [newItem, ...prev]);
    };
    addListener(onMessage);
    return () => removeListener(onMessage);
  }, [addListener, removeListener, load]);

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
    // Ouvrir un profil consomme la notif — une fois le profil visité, elle n'a plus
    // d'utilité (contrairement à un commentaire/reel qu'on peut revouloir retrouver
    // plus tard) : supprimée plutôt que simplement marquée lue.
    if (USER_NOTIF_TYPES.has(item.notification_type) && item.actor?.id) {
      nav.navigate('UserProfile', { userId: item.actor.id });
      removeItem(item.id);
      return;
    }

    // Naviguer immédiatement, marquer lu en arrière-plan
    if (!item.is_read) markOneRead(item.id);

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

    // Mise à jour app — ouvre toujours le store de LA PLATEFORME RÉELLE de l'appareil
    // (Platform.OS), jamais celle ciblée par l'admin (item.ref_id ne sert qu'au filtrage
    // serveur des destinataires, pas à choisir quel store ouvrir sur ce device précis).
    if (item.notification_type === 'app_update') {
      const url = getStoreUrl();
      if (url) Linking.openURL(url).catch(() => {});
      return;
    }

    if (item.notification_type === 'boost_started' || item.notification_type === 'boost_expiring' || item.notification_type === 'boost_ended') {
      nav.navigate('Boost');
      return;
    }
    if (item.notification_type === 'ad_started' || item.notification_type === 'ad_ended') {
      nav.navigate('Ads');
      return;
    }

    if (!item.ref_id) return;

    // Verdict d'analyse IA (cf. recommendation_system/ai_service) — route vers
    // l'ecran de suivi dedie plutot que l'ecran de detail generique, intercepte
    // avant la cascade par ref_type car reel_analysis_* porte aussi un ref_type
    // valide (reel/post/event/concert) qui matcherait sinon le bloc generique.
    if (item.notification_type.startsWith('reel_analysis_') && item.ref_type) {
      nav.navigate('AiAnalysisStatus', {
        contentType: item.ref_type as any,
        contentId: item.ref_id,
        initialStatus: 'done',
      });
      return;
    }

    if (item.ref_type === 'concert')         nav.navigate('ConcertDetail',   { concertId:     item.ref_id });
    else if (item.ref_type === 'event')      nav.navigate('EventDetail',     { eventId:       item.ref_id });
    else if (item.ref_type === 'reel')       nav.navigate('Tabs', { screen: 'Reels', params: { initialReelId: item.ref_id } });
    else if (item.ref_type === 'post')       nav.navigate('PostDetail',      { postId:        item.ref_id });
    else if (item.ref_type === 'story' && item.actor?.id) { nav.navigate('UserProfile', { userId: item.actor.id }); removeItem(item.id); }
    else if (item.ref_type === 'user')       { nav.navigate('UserProfile',   { userId:        item.ref_id }); removeItem(item.id); }
    else if (item.ref_type === 'community')  nav.navigate('CommunityDetail', { communityId:   item.ref_id });
    else if (item.ref_type === 'planning_invite' || item.ref_type === 'planning_entry') nav.navigate('Planning');
  }, [nav, markOneRead, removeItem]);

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
    showConfirm(
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
            notificationService.deleteMany(ids).catch(() => {});
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
    showConfirm(
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
      <LinearGradient colors={[colors.surface, colors.background]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        {/* Ligne 1 : retour + titre + badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Notifications</Text>
          {unreadCount > 0 && !selectMode && (
            <View style={[s.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={s.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>

        {/* Ligne 2 : actions */}
        {!selectMode ? (
          (unreadCount > 0 || items.length > 0) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={markAllRead} style={[s.readAllBtn, { borderColor: colors.border }]}>
                  <Icon name="check" size={14} color={colors.primary} />
                  <Text style={[s.readAllText, { color: colors.primary }]}>Tout lire</Text>
                </TouchableOpacity>
              )}
              {items.length > 0 && (
                <>
                  <TouchableOpacity onPress={deleteAll} style={[s.readAllBtn, { borderColor: '#FF3B30' }]}>
                    <Icon name="trash-2" size={14} color="#FF3B30" />
                    <Text style={[s.readAllText, { color: '#FF3B30' }]}>Tout supprimer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelectMode(true)} style={[s.readAllBtn, { borderColor: colors.border }]}>
                    <Icon name="check-square" size={14} color={colors.textSecondary} />
                    <Text style={[s.readAllText, { color: colors.textSecondary }]}>Selectionner</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <TouchableOpacity onPress={toggleSelectAll} style={[s.readAllBtn, { borderColor: colors.primary }]}>
              <Icon name={allSelected ? 'check-square' : 'square'} size={14} color={colors.primary} />
              <Text style={[s.readAllText, { color: colors.primary }]}>
                {allSelected ? 'Deselectionner' : 'Tout selectionner'}
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
  const [expanded, setExpanded]   = useState(false);
  const [truncated, setTruncated] = useState(false);

  const translateX = useSharedValue(0);
  const opacity    = useSharedValue(1);

  const doDelete = useCallback(() => {
    opacity.value = withTiming(0, { duration: 200 }, () => runOnJS(onDelete)());
  }, [onDelete, opacity]);

  const pan = Gesture.Pan()
    // Seule la gauche déclenche la suppression — activeOffsetX([-10, Infinity]) laisse le
    // scroll vertical de la FlatList gagner sur un geste vers la droite ou vertical, au
    // lieu d'attendre un mouvement dans N'IMPORTE QUELLE direction avant de s'activer
    // (activeOffsetX([-10, 10]) précédent), ce qui donnait une sensation de démarrage lent.
    .activeOffsetX([-10, Number.POSITIVE_INFINITY])
    .failOffsetY([-10, 10])
    .onUpdate(e => {
      if (e.translationX < 0) translateX.value = e.translationX;
    })
    .onEnd(e => {
      if (e.translationX < SWIPE_THRESHOLD) {
        // doDelete() est une fonction JS normale (pas un worklet) — l'appeler directement
        // depuis ce callback, exécuté sur le thread UI, plantait avec "Tried to
        // synchronously call a non-worklet function on the UI thread". runOnJS renvoie
        // l'appel sur le thread JS, seul endroit où doDelete peut s'exécuter.
        translateX.value = withTiming(-300, { duration: 200 }, () => { runOnJS(doDelete)(); });
      } else {
        translateX.value = withSpring(0);
      }
    });

  // Plus de hauteur figée à 72 — le corps du message peut s'étendre sur plusieurs lignes
  // une fois "Voir plus" cliqué, la carte doit pouvoir grandir librement. La suppression
  // se fait par glissement + fondu (translateX + opacity), pas par effondrement de hauteur —
  // l'item disparaît de la liste dès que le state parent le retire après le fondu.
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity:   opacity.value,
  }));

  // Indicateur rouge "Supprimer" derrière la carte — opacité interpolée directement sur
  // translateX (suit le doigt à chaque frame, sans latence) plutôt que withTiming
  // relancé à chaque changement de côté du seuil, qui faisait saccader le glissement en
  // superposant des animations de 250ms jamais terminées les unes sur les autres.
  const deleteReveal = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-20, -60], [0, 1], Extrapolation.CLAMP),
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

            {/* Miniature du contenu (ex: pub, boost, contenu supprimé) > avatar acteur > icône type —
                priorité à l'image dès qu'une existe, présentée en carte média (pas un simple avatar rond)
                pour se distinguer visuellement d'une notif purement sociale. */}
            {item.image_url ? (
              <View style={s.mediaWrap}>
                <Image source={{ uri: item.image_url }} style={s.media} />
                <LinearGradient colors={cfg.grad as [string, string]} style={s.typeBadge}>
                  <Icon name={cfg.icon} size={9} color="#fff" />
                </LinearGradient>
              </View>
            ) : item.actor?.avatar_url ? (
              <View style={s.avatarWrap}>
                <Image source={{ uri: item.actor.avatar_url }} style={s.avatar} />
                <LinearGradient colors={cfg.grad as [string, string]} style={s.typeBadge}>
                  <Icon name={cfg.icon} size={9} color="#fff" />
                </LinearGradient>
              </View>
            ) : (
              <LinearGradient colors={cfg.grad as [string, string]} style={s.iconWrap}>
                <Icon name={cfg.icon} size={20} color="#fff" />
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
                numberOfLines={expanded ? undefined : 2}
                onTextLayout={e => {
                  if (!expanded && e.nativeEvent.lines.length >= 2) setTruncated(true);
                }}
              >
                {item.body}
              </Text>
              {truncated && (
                <TouchableOpacity
                  onPress={() => setExpanded(v => !v)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 1 }}>
                    {expanded ? 'Voir moins' : 'Voir plus'}
                  </Text>
                </TouchableOpacity>
              )}
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
                {timeAgo(item.created_at)}
              </Text>
            </View>

            {/* Bouton "Mettre à jour" — dédié, jamais un simple chevron générique */}
            {item.notification_type === 'app_update' ? (
              <TouchableOpacity
                onPress={() => { const url = getStoreUrl(); if (url) Linking.openURL(url).catch(() => {}); }}
                style={[s.updateBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Icon name="download" size={13} color="#fff" />
                <Text style={s.updateBtnText}>Mettre à jour</Text>
              </TouchableOpacity>
            ) : !!item.ref_id ? (
              <View style={[s.chevron, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="chevron-right" size={14} color={colors.textTertiary} />
              </View>
            ) : null}
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'column',
    paddingHorizontal: 16, paddingBottom: 12,
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
  mediaWrap:  { position: 'relative' },
  media:      { width: 56, height: 56, borderRadius: 14 },
  typeBadge:  {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },

  chevron: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  updateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16,
  },
  updateBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },

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
