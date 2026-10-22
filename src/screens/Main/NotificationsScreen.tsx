import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Image, Linking, Modal,
} from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue,
  withTiming, runOnJS, withSpring, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { FontSize, FontWeight } from '../../theme';
import { SkeletonFeed, BackButton } from '../../components/common';
import { showConfirm } from '../../services';
import { notificationService, NotifItem } from '../../services/notificationService';
import { useWs } from '../../context/WebSocketContext';
import { getStoreUrl } from '../../utils/constants';

// ── Config visuelle ────────────────────────────────────────────────────────────

// Une seule couleur d'accent pour toutes les notifications "normales" —
// seules les alertes réelles (contenu retiré, sécurité, vérification révoquée,
// erreur de paiement, refus modération) gardent le rouge, pour rester
// immédiatement reconnaissables comme des cas à traiter d'urgence.
const DANGER = '#EF4444';
const CFG: Record<string, { icon: string; danger?: boolean }> = {
  follow:                    { icon: 'user-plus' },
  reaction:                  { icon: 'heart' },
  comment:                   { icon: 'message-circle' },
  mention:                   { icon: 'at-sign' },
  profile_view:              { icon: 'eye' },
  story_view:                { icon: 'eye' },
  concert_created:           { icon: 'music' },
  event_created:             { icon: 'calendar' },
  concert_going:             { icon: 'headphones' },
  event_going:               { icon: 'map-pin' },
  community_joined:          { icon: 'users' },
  reel_posted:               { icon: 'film' },
  post_posted:               { icon: 'file-text' },
  repost:                    { icon: 'repeat' },
  story_posted:              { icon: 'circle' },
  subscription:              { icon: 'star' },
  welcome:                   { icon: 'gift' },
  ticket:                    { icon: 'tag' },
  concert_live:              { icon: 'radio' },
  system:                    { icon: 'shield' },
  security:                  { icon: 'lock',           danger: true },
  planning_invite:           { icon: 'calendar' },
  planning_invite_response:  { icon: 'check-circle' },
  planning_reminder:         { icon: 'clock' },
  planning_cancelled:        { icon: 'x-circle',       danger: true },
  content_removed:           { icon: 'alert-triangle', danger: true },
  app_update:                { icon: 'download' },
  verification_renewed:      { icon: 'check-circle' },
  verification_payment_failed: { icon: 'alert-triangle', danger: true },
  verification_revoked:      { icon: 'shield-off',     danger: true },
  boost_started:             { icon: 'zap' },
  boost_expiring:            { icon: 'clock' },
  boost_ended:               { icon: 'check-circle' },
  ad_started:                { icon: 'trending-up' },
  ad_ended:                  { icon: 'flag' },
  // Moderation IA (2026-08) — verdict apres analyse automatique d'un reel
  // publie par l'utilisateur (cf. recommendation_system/ai_service).
  reel_analysis_cleared:     { icon: 'check-circle' },
  reel_analysis_limited:     { icon: 'alert-circle' },
  reel_analysis_removed:     { icon: 'alert-triangle', danger: true },
};
const DEFAULT_CFG = { icon: 'bell', danger: false };

// Types "sociaux purs" qui ouvrent toujours le profil de l'acteur — 'reaction'
// et 'comment' ont été retirés de cette liste : ils portent un ref_type/ref_id
// vers le contenu concerné (post/reel) et doivent ouvrir CE contenu, pas le
// profil de la personne qui a réagi/commenté (bug corrigé : la notif "Bako a
// commenté votre publication" ouvrait le profil de Bako au lieu du post).
const USER_NOTIF_TYPES = new Set([
  'follow', 'profile_view', 'story_view', 'mention', 'subscription', 'reel_posted',
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
  const [showActionsSheet, setShowActionsSheet] = useState(false);
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
    else if (item.ref_type === 'live')       nav.navigate('SimpleLiveViewer', { liveId:       item.ref_id });
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
      {/* Header — carte flottante (même design que le reste de l'app).
          paddingTop (status bar) isolé sur un wrapper externe transparent —
          le mélanger au style de la carte ferait apparaître un coin visible
          sous la status bar. */}
      <View style={{ paddingTop: insets.top + 8 }}>
      <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        {/* Ligne 1 : retour + titre + badge + menu actions (à droite, même ligne) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[s.headerTitle, { color: colors.textPrimary, flex: 1 }]}>Notifications</Text>
          {unreadCount > 0 && !selectMode && (
            <View style={[s.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={s.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
          {!selectMode && (unreadCount > 0 || items.length > 0) && (
            <TouchableOpacity
              onPress={() => setShowActionsSheet(true)}
              style={s.menuBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="more-vertical" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Ligne 2 : actions — uniquement en mode sélection active, feedback
            d'état immédiat nécessaire pendant qu'on sélectionne. Les actions
            du mode normal (Tout lire / Tout supprimer / Sélectionner) sont
            maintenant dans le bottom sheet ouvert via l'icône "..." ci-dessus. */}
        {selectMode && (
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
      </View>
      </View>

      {/* Bottom sheet — actions du mode normal (Tout lire / Tout supprimer /
          Sélectionner), ouvert via l'icône "..." du header. */}
      <Modal
        visible={showActionsSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowActionsSheet(false)}
      >
        <TouchableOpacity
          style={s.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowActionsSheet(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[s.sheet, { backgroundColor: colors.surface }]}>
            <View style={[s.sheetHandle, { backgroundColor: colors.divider }]} />
            {unreadCount > 0 && (
              <TouchableOpacity
                style={s.sheetItem}
                onPress={() => { setShowActionsSheet(false); markAllRead(); }}
              >
                <Icon name="check" size={18} color={colors.primary} />
                <Text style={[s.sheetItemText, { color: colors.textPrimary }]}>Tout lire</Text>
              </TouchableOpacity>
            )}
            {items.length > 0 && (
              <>
                <TouchableOpacity
                  style={s.sheetItem}
                  onPress={() => { setShowActionsSheet(false); deleteAll(); }}
                >
                  <Icon name="trash-2" size={18} color="#FF3B30" />
                  <Text style={[s.sheetItemText, { color: '#FF3B30' }]}>Tout supprimer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.sheetItem}
                  onPress={() => { setShowActionsSheet(false); setSelectMode(true); }}
                >
                  <Icon name="check-square" size={18} color={colors.textSecondary} />
                  <Text style={[s.sheetItemText, { color: colors.textPrimary }]}>Sélectionner</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Filtres */}
      <View style={[s.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.divider, marginTop: 10 }]}>
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
  const badgeColor = cfg.danger ? DANGER : colors.primary;
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
                <View style={[s.typeBadge, { backgroundColor: badgeColor }]}>
                  <Icon name={cfg.icon} size={9} color="#fff" />
                </View>
              </View>
            ) : item.actor?.avatar_url ? (
              <View style={s.avatarWrap}>
                <Image source={{ uri: item.actor.avatar_url }} style={s.avatar} />
                <View style={[s.typeBadge, { backgroundColor: badgeColor }]}>
                  <Icon name={cfg.icon} size={9} color="#fff" />
                </View>
              </View>
            ) : (
              <View style={[s.iconWrap, { backgroundColor: badgeColor }]}>
                <Icon name={cfg.icon} size={20} color="#fff" />
              </View>
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
                  <Text style={{ fontSize: FontSize.xsPlus, color: colors.primary, fontWeight: FontWeight.bold, marginTop: 1 }}>
                    {expanded ? 'Voir moins' : 'Voir plus'}
                  </Text>
                </TouchableOpacity>
              )}
              <Text style={{ fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
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
    paddingHorizontal: 16, paddingVertical: 12,
    marginHorizontal: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  headerTitle:  { fontSize: FontSize['2xl'], fontWeight: FontWeight.extraBold },
  unreadBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  unreadBadgeText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  menuBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  // Bottom sheet — actions du mode normal
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 28, paddingTop: 10 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  sheetItemText: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  readAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  readAllText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 13,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold },

  swipeHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10,
  },
  swipeHintText: { fontSize: FontSize.sm },

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
  updateBtnText: { color: '#fff', fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold },

  deleteBack: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 6, borderRadius: 16,
    backgroundColor: '#EF4444', paddingRight: 20,
  },
  deleteBackText: { color: '#fff', fontSize: FontSize.smPlus, fontWeight: FontWeight.bold },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80, paddingHorizontal: 40 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyText:  { fontSize: FontSize.base, textAlign: 'center', lineHeight: 20 },
});
