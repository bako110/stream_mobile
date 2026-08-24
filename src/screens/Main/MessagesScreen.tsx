/**
 * MessagesScreen — Messagerie directe GoFolyX
 * Connecté à l'API /api/v1/messages/conversations
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, Platform, StatusBar,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonMessages, VerifiedBadge, AvatarWithBadge } from '../../components/common';
import { BorderRadius, Spacing } from '../../theme';
import { messageService } from '../../services/messageService';
import { useWs } from '../../context/WebSocketContext';
import type { ConversationSummary, MessageType } from '../../services/messageService';
import type { WsPayload } from '../../context/WebSocketContext';
import { useFocusEffect } from '@react-navigation/native';
import { BackButton } from '../../components/common';
import { ConversationStoryBar } from '../../components/story';
import { useUser } from '../../context/UserContext';
import { showConfirm } from '../../services';

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'À l\'instant';
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1)  return 'Hier';
  if (diffD < 7)    return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const ACCENT_COLORS = ['#7B3FF2','#FF7A2F','#E0389A','#36D9A0','#3B82F6','#9B65F5','#EF4444','#F59E0B'];
function accentFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return ACCENT_COLORS[h % ACCENT_COLORS.length]!;
}

// Aperçu du dernier message façon WhatsApp — libellé texte selon le type
// (sans contenu réel pour les médias, pas d'emoji), sinon le texte tel quel
// pour un message classique.
function formatLastMessagePreview(lastMessage: string | null | undefined, lastType: MessageType | undefined): string {
  switch (lastType) {
    case 'voice':    return 'Message vocal';
    case 'image':    return 'Photo';
    case 'video':    return 'Vidéo';
    case 'file':     return 'Document';
    case 'sticker':  return 'Sticker';
    case 'location': return 'Position';
    case 'share':    return 'Publication partagée';
    default:         return lastMessage || '…';
  }
}

interface Props { onBack?: () => void; }


export const MessagesScreen: React.FC<Props> = ({ onBack }) => {
  const insets            = useSafeAreaInsets();
  const STATUS_H          = insets.top;
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const nav               = useNavigation<any>();
  const { clearUnreadMessages, addListener, removeListener, missedCallCount, sendMessage: sendWsMessage, isConnected, liveUserIds } = useWs();

  const [convSelectedIds,   setConvSelectedIds]   = useState<Set<string>>(new Set());
  const [convSelectMode,    setConvSelectMode]    = useState(false);

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [search,        setSearch]        = useState('');
  // Barre de recherche masquée par défaut — remplacée par la barre de stories tant
  // qu'on ne clique pas sur l'icône recherche (à la place de l'ancien bouton
  // "nouveau message"). Se referme et vide le texte au clic sur la croix.
  const [searchOpen,    setSearchOpen]    = useState(false);
  const { currentUser } = useUser();

  // Callbacks pour StoryBar/StoryViewer — même signature attendue par le composant
  // partagé avec FeedScreen ("Répondre"/"Appeler" depuis une story ouvre le chat/
  // appel directement, cohérent avec le fait d'être déjà dans l'écran messagerie).
  const onStoryNavigateToChat = useCallback((partnerId: string, partnerName: string, avatarUrl?: string) => {
    nav.navigate('Chat' as any, { partnerId, partnerName, avatarUrl });
  }, [nav]);
  const onStoryNavigateToCall = useCallback((partnerId: string, partnerName: string, callType: 'voice' | 'video') => {
    nav.navigate('Call' as any, { partnerId, partnerName, callType, isIncoming: false });
  }, [nav]);


  const load = useCallback(async () => {
    try {
      const data = await messageService.getConversations();
      setConversations(data);
      return data;
    } catch {
      return [];
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { clearUnreadMessages(); }, []);

  const isConnectedRef = useRef(isConnected);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  const lastLoadAt = useRef<number>(0);

  const loadAndSubscribe = useCallback((showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    lastLoadAt.current = Date.now();

    messageService.getConversations()
      .then(data => {
        setConversations(data);
        if (!isConnectedRef.current) return;
        data.forEach(c => {
          if (c.partner_id) sendWsMessage({ type: 'subscribe_presence', user_id: c.partner_id });
        });
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [sendWsMessage]);

  const isFirstLoad = useRef(true);
  useFocusEffect(useCallback(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      loadAndSubscribe(true);
    } else {
      // Re-focus : recharge seulement si > 30s depuis le dernier chargement
      if (Date.now() - lastLoadAt.current > 30_000) {
        loadAndSubscribe(false);
      } else {
        // Données fraîches — juste re-souscrire présence sans recharger
        if (isConnectedRef.current) {
          setConversations(prev => {
            prev.forEach(c => {
              if (c.partner_id) sendWsMessage({ type: 'subscribe_presence', user_id: c.partner_id });
            });
            return prev;
          });
        }
      }
    }
    return () => { setSearch(''); };
  }, [loadAndSubscribe, sendWsMessage]));

  // Reconnexion WS : re-souscrire présence sans recharger si données récentes
  useEffect(() => {
    if (!isConnected) return;
    if (Date.now() - lastLoadAt.current > 30_000) {
      loadAndSubscribe(false);
    } else {
      setConversations(prev => {
        prev.forEach(c => {
          if (c.partner_id) sendWsMessage({ type: 'subscribe_presence', user_id: c.partner_id });
        });
        return prev;
      });
    }
  }, [isConnected, loadAndSubscribe, sendWsMessage]);

  // Real-time updates via WS
  useEffect(() => {
    const handler = (payload: WsPayload) => {
      if (payload.type === 'message') {
        const senderId = payload.sender_id as string;
        const receiverId = payload.receiver_id as string;
        setConversations(prev => {
          const realPartner = prev.find(c => c.partner_id === senderId) ? senderId
            : prev.find(c => c.partner_id === receiverId) ? receiverId
            : senderId;

          const existing = prev.find(c => c.partner_id === realPartner);
          if (existing) {
            const updated = prev.map(c =>
              c.partner_id === realPartner
                ? {
                    ...c,
                    last_message: (payload.content as string) ?? '',
                    last_type: payload.message_type as MessageType | undefined,
                    last_time: payload.created_at,
                    unread_count: c.unread_count + 1,
                  }
                : c,
            );
            const target = updated.find(c => c.partner_id === realPartner)!;
            return [target, ...updated.filter(c => c.partner_id !== realPartner)];
          }
          load();
          return prev;
        });
      } else if (payload.type === 'presence') {
        setConversations(prev => prev.map(c =>
          c.partner_id === payload.user_id
            ? { ...c, partner: c.partner ? { ...c.partner, is_online: payload.is_online === true, last_seen_at: payload.last_seen_at ?? c.partner.last_seen_at } : c.partner }
            : c,
        ));
      } else if (payload.type === 'message_deleted') {
        load();
      }
    };
    addListener(handler);
    return () => { removeListener(handler); };
  }, [addListener, removeListener, load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c =>
      (c.partner?.username  ?? '').toLowerCase().includes(q) ||
      (c.partner?.full_name ?? '').toLowerCase().includes(q) ||
      (c.last_message       ?? '').toLowerCase().includes(q),
    );
  }, [search, conversations]);

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  // ── Conversations selection ───────────────────────────────────────────────────
  const toggleConvSelect = useCallback((id: string) => {
    setConvSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAllConvs = useCallback(() => {
    setConvSelectedIds(new Set(filtered.map(c => c.partner_id)));
  }, [filtered]);

  const exitConvSelect = useCallback(() => {
    setConvSelectMode(false);
    setConvSelectedIds(new Set());
  }, []);

  const deleteConvsSelected = useCallback(() => {
    const count = convSelectedIds.size;
    showConfirm(
      'Supprimer',
      `Supprimer ${count} conversation${count > 1 ? 's' : ''} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            const ids = Array.from(convSelectedIds);
            await Promise.all(ids.map(id => messageService.deleteConversation(id).catch(() => {})));
            setConversations(prev => prev.filter(c => !convSelectedIds.has(c.partner_id)));
            exitConvSelect();
          },
        },
      ],
    );
  }, [convSelectedIds, exitConvSelect]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: STATUS_H + 8 }]}>
        <View style={styles.headerRow}>
          {convSelectMode ? (
            // ── Mode sélection conversations ──
            <>
              <TouchableOpacity style={styles.iconBtn} onPress={exitConvSelect}>
                <Icon name="x" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: 16 }]}>
                  {convSelectedIds.size === 0 ? 'Sélectionner' : `${convSelectedIds.size} sélectionné${convSelectedIds.size > 1 ? 's' : ''}`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.primary + '18' }]}
                  onPress={convSelectedIds.size === filtered.length ? () => setConvSelectedIds(new Set()) : selectAllConvs}
                >
                  <Icon
                    name={convSelectedIds.size === filtered.length ? 'check-square' : 'square'}
                    size={18}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                {convSelectedIds.size > 0 && (
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: '#E0389A18' }]}
                    onPress={deleteConvsSelected}
                  >
                    <Icon name="trash-2" size={18} color="#E0389A" />
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            // ── Mode normal ──
            <>
              <BackButton onPress={onBack ?? (() => nav.goBack())} />

              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                  Messages
                </Text>
                {totalUnread > 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.badgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: '#36D9A020' }]}
                  onPress={() => nav.navigate('CallHistory' as any)}
                >
                  <Icon name="phone" size={18} color="#36D9A0" />
                  {missedCallCount > 0 && (
                    <View style={[styles.miniBadge, { backgroundColor: '#E0389A' }]}>
                      <Text style={styles.miniBadgeText}>{missedCallCount > 9 ? '9+' : missedCallCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.primary + '18' }]}
                  onPress={() => {
                    setSearchOpen(o => !o);
                    setSearch(''); // la recherche disparaît vidée, jamais de texte résiduel au ré-ouvrir
                  }}
                >
                  <Icon name={searchOpen ? 'x' : 'search'} size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Barre de recherche (apparaît au clic sur l'icône loupe du header)
            OU barre de stories par défaut, jamais les deux. */}
        {searchOpen ? (
          <View style={[styles.searchBar, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary }]}>
            <Icon name="search" size={15} color={colors.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher une conversation…"
              placeholderTextColor={colors.textDisabled}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoFocus
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Icon name="x" size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <ConversationStoryBar
            currentUser={currentUser}
            colors={colors}
            onNavigateToChat={onStoryNavigateToChat}
            onNavigateToCall={onStoryNavigateToCall}
          />
        )}
      </View>

      {/* Liste des conversations */}
      {loading ? (
        <SkeletonMessages />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.partner_id}
          extraData={filtered}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadAndSubscribe(false);
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="message-circle" size={52} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                {search ? 'Aucune conversation trouvée' : 'Démarrez votre première conversation'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ConversationRow
                conv={item}
                colors={colors}
                isLive={item.partner?.is_live || liveUserIds.has(item.partner_id)}
                selectMode={convSelectMode}
                isSelected={convSelectedIds.has(item.partner_id)}
                onLongPress={() => { setConvSelectMode(true); toggleConvSelect(item.partner_id); }}
                onPress={convSelectMode
                  ? () => toggleConvSelect(item.partner_id)
                  : () => {
                      // Marque lu localement tout de suite — évite d'attendre le rechargement (>30s) au retour
                      setConversations(prev => prev.map(c =>
                        c.partner_id === item.partner_id ? { ...c, unread_count: 0 } : c,
                      ));
                      nav.navigate('Chat' as any, {
                        partnerId:   item.partner_id,
                        partnerName: item.partner?.full_name ?? item.partner?.username ?? item.partner_id,
                        avatarUrl:   item.partner?.avatar_url,
                        isOnline:    item.partner?.is_online,
                        lastSeen:    item.partner?.last_seen_at,
                      });
                    }}
                onAvatarPress={convSelectMode
                  ? () => toggleConvSelect(item.partner_id)
                  : () => nav.navigate('UserProfile' as any, { userId: item.partner_id })}
              />
          )}
        />
      )}

      {/* FAB nouveau message */}
      <TouchableOpacity style={[styles.fab, { shadowColor: colors.primary }]} activeOpacity={0.9} onPress={() => nav.navigate('NewConversation' as any)}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Icon name="message-square" size={22} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

// ── ConversationRow ──────────────────────────────────────────────────────────

const ConversationRow: React.FC<{
  conv:          ConversationSummary;
  colors:        any;
  onPress:       () => void;
  onLongPress:   () => void;
  onAvatarPress: () => void;
  selectMode:    boolean;
  isSelected:    boolean;
  isLive?:       boolean;
}> = ({ conv, colors, onPress, onLongPress, onAvatarPress, selectMode, isSelected, isLive }) => {
  const unread   = (conv.unread_count ?? 0) > 0;
  const name     = conv.partner?.full_name ?? conv.partner?.username ?? conv.partner_id;
  const accent   = accentFor(conv.partner_id);
  const isOnline = conv.partner?.is_online === true;
  const avatarUri = conv.partner?.avatar_url;

  return (
    <TouchableOpacity
      style={[styles.row, {
        backgroundColor: isSelected ? colors.primary + '15' : 'transparent',
      }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
    >
      {/* Checkbox overlay en mode sélection */}
      {selectMode && (
        <View style={{ paddingRight: 4 }}>
          <View style={[
            sst.checkbox,
            isSelected  && { backgroundColor: colors.primary, borderColor: colors.primary },
            !isSelected && { borderColor: colors.textTertiary },
          ]}>
            {isSelected && <Icon name="check" size={13} color="#fff" />}
          </View>
        </View>
      )}

      {/* Avatar */}
      <TouchableOpacity
        style={[styles.avatarWrap, { opacity: selectMode && !isSelected ? 0.5 : 1 }]}
        onPress={selectMode ? onPress : onAvatarPress}
        activeOpacity={0.8}
      >
        <AvatarWithBadge
          avatarUrl={avatarUri}
          initials={getInitials(name)}
          size={56}
          accentColor={accent}
          isOnline={selectMode ? undefined : isOnline}
          isLive={selectMode ? undefined : isLive}
        />
      </TouchableOpacity>

      {/* Content */}
      <View style={[styles.rowContent, { opacity: selectMode && !isSelected ? 0.6 : 1 }]}>
        {/* Ligne 1 : nom + heure */}
        <View style={styles.rowTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 8 }}>
            <Text
              style={[styles.convName, { color: colors.textPrimary, fontWeight: unread ? '700' : '500' }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            {conv.partner?.is_verified && <VerifiedBadge size={13} />}
            {conv.request_status === 'pending_incoming' && (
              <View style={[sst.newRequestPill, { backgroundColor: colors.primary }]}>
                <Text style={sst.newRequestPillText}>Demande</Text>
              </View>
            )}
          </View>
          <Text style={[styles.convTime, { color: unread ? colors.primary : colors.textTertiary, fontWeight: unread ? '600' : '400' }]}>
            {formatTime(conv.last_time)}
          </Text>
        </View>

        {/* Ligne 2 : aperçu message + badge/statut */}
        <View style={styles.rowBottom}>
          <Text
            style={[styles.convLast, { color: unread ? colors.textSecondary : colors.textTertiary, fontWeight: unread ? '500' : '400' }]}
            numberOfLines={1}
          >
            {formatLastMessagePreview(conv.last_message, conv.last_type)}
          </Text>
          {unread && !selectMode ? (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.unreadText}>{conv.unread_count > 99 ? '99+' : conv.unread_count}</Text>
            </View>
          ) : !selectMode && isOnline ? (
            <View style={styles.onlinePill}>
              <View style={styles.onlinePillDot} />
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const sst = StyleSheet.create({
  checkbox: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  newRequestPill: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  newRequestPillText: { fontSize: 10, fontWeight: '700', color: '#fff' },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[3], gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  miniBadge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  miniBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  searchBar: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: BorderRadius.full, paddingHorizontal: Spacing[3], gap: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 32 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: 11, gap: 13 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: 6.5, backgroundColor: '#36D9A0', borderWidth: 2.5, borderColor: '#fff' },

  rowContent: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convName: { fontSize: 15, flex: 1 },
  convTime: { fontSize: 12, flexShrink: 0 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  convLast: { fontSize: 13, flex: 1 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  lastSeenText: { fontSize: 11, flexShrink: 0 },
  onlinePill: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#36D9A0', flexShrink: 0 },
  onlinePillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#36D9A0' },

  fab: { position: 'absolute', bottom: 28, right: 20, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  fabInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
