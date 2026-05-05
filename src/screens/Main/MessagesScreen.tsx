/**
 * MessagesScreen â€” Messagerie directe FoliX
 * ConnectÃ© Ã  l'API /api/v1/messages/conversations
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, Platform, StatusBar,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { SkeletonMessages, VerifiedBadge } from '../../components/common';
import { BorderRadius, Spacing } from '../../theme';
import { messageService } from '../../services/messageService';
import { useWs } from '../../context/WebSocketContext';
import { callHistoryService } from '../../services/callHistoryService';
import type { CallRecord } from '../../services/callHistoryService';
import type { ConversationSummary } from '../../services/messageService';
import type { WsPayload } from '../../context/WebSocketContext';
import { useFocusEffect } from '@react-navigation/native';

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'Ã€ l\'instant';
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

function formatLastSeen(iso?: string | null): string {
  if (!iso) return 'Hors ligne';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'Il y a un instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1)  return 'Hier';
  return `Le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

interface Props { onBack?: () => void; }

export const MessagesScreen: React.FC<Props> = ({ onBack }) => {
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const nav               = useNavigation<any>();
  const { clearUnreadMessages, addListener, removeListener, missedCallCount, clearMissedCalls, sendMessage: sendWsMessage, isConnected } = useWs();
  const [activeTab,  setActiveTab]  = useState<'messages' | 'calls'>('messages');
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [search,        setSearch]        = useState('');

  const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

  const load = useCallback(async () => {
    try {
      const data = await messageService.getConversations();
      setConversations(data);
      return data;
    } catch {
      setConversations([]);
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
    setCallHistory(callHistoryService.getAll());
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
            const preview = payload.content || (payload.message_type === 'voice' ? '🎤 Vocal' : '📎 Pièce jointe');
            const updated = prev.map(c =>
              c.partner_id === realPartner
                ? { ...c, last_message: preview, last_time: payload.created_at, unread_count: c.unread_count + 1 }
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
          {onBack ? (
            <TouchableOpacity style={styles.iconBtn} onPress={onBack}>
              <Icon name="arrow-left" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : <View style={{ width: 40 }} />}

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {activeTab === 'messages' ? 'Messages' : 'Appels'}
            </Text>
            {activeTab === 'messages' && totalUnread > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
              </View>
            )}
          </View>

          {activeTab === 'messages' ? (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.primary + '18' }]}
              onPress={() => nav.navigate('NewConversation' as any)}
            >
              <Icon name="edit" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: '#36D9A0' + '20' }]}
              onPress={() => nav.navigate('NewCall' as any)}
            >
              <Icon name="phone-call" size={18} color="#36D9A0" />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={[styles.tabsRow, { borderBottomColor: colors.divider }]}>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => setActiveTab('messages')}
          >
            <Text style={[styles.tabLabel, { color: activeTab === 'messages' ? colors.primary : colors.textTertiary }]}>
              Messages
            </Text>
            {activeTab === 'messages' && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => { setActiveTab('calls'); clearMissedCalls(); setCallHistory(callHistoryService.getAll()); }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.tabLabel, { color: activeTab === 'calls' ? colors.primary : colors.textTertiary }]}>
                Appels
              </Text>
              {missedCallCount > 0 && activeTab !== 'calls' && (
                <View style={[styles.badge, { backgroundColor: '#E0389A' }]}>
                  <Text style={styles.badgeText}>{missedCallCount > 9 ? '9+' : missedCallCount}</Text>
                </View>
              )}
            </View>
            {activeTab === 'calls' && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        </View>

        {/* Barre de recherche — seulement onglet messages */}
        {activeTab === 'messages' && (
          <View style={[styles.searchBar, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary }]}>
            <Icon name="search" size={15} color={colors.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher une conversation…"
              placeholderTextColor={colors.textDisabled}
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Icon name="x" size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Contenu selon onglet */}
      {activeTab === 'messages' ? (
        loading ? (
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
                onRefresh={() => { setRefreshing(true); loadAndSubscribe(false); }}
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
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(index * 35).springify()}>
                <ConversationRow
                  conv={item}
                  colors={colors}
                  onPress={() => nav.navigate('Chat' as any, {
                    partnerId:   item.partner_id,
                    partnerName: item.partner?.full_name ?? item.partner?.username ?? item.partner_id,
                    avatarUrl:   item.partner?.avatar_url,
                    isOnline:    item.partner?.is_online,
                    lastSeen:    item.partner?.last_seen_at,
                  })}
                  onAvatarPress={() => nav.navigate('UserProfile' as any, { userId: item.partner_id })}
                />
              </Animated.View>
            )}
          />
        )
      ) : (
        <FlatList
          data={callHistory}
          keyExtractor={r => r.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="phone-missed" size={52} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Aucun appel récent</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 35).springify()}>
              <CallRow
                record={item}
                colors={colors}
                onPress={() => nav.navigate('Call' as any, {
                  partnerId:   item.partnerId,
                  partnerName: item.partnerName,
                  callType:    item.callType,
                  isIncoming:  false,
                })}
                onAvatarPress={() => nav.navigate('UserProfile' as any, { userId: item.partnerId })}
              />
            </Animated.View>
          )}
        />
      )}

      {/* FAB — seulement onglet messages */}
      {activeTab === 'messages' && (
        <TouchableOpacity style={[styles.fab, { shadowColor: colors.primary }]} activeOpacity={0.9} onPress={() => nav.navigate('NewConversation' as any)}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.fabInner}
          >
            <Icon name="message-square" size={22} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
};

// â”€â”€ ConversationRow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ConversationRow: React.FC<{ conv: ConversationSummary; colors: any; onPress: () => void; onAvatarPress: () => void }> = ({ conv, colors, onPress, onAvatarPress }) => {
  const unread = (conv.unread_count ?? 0) > 0;
  const name   = conv.partner?.full_name ?? conv.partner?.username ?? conv.partner_id;
  const accent = accentFor(conv.partner_id);
  const isOnline = conv.partner?.is_online === true;

  return (
    <TouchableOpacity
      style={[styles.row, {
        borderBottomColor: colors.divider,
        backgroundColor:   unread ? colors.primary + '08' : 'transparent',
      }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <TouchableOpacity style={styles.avatarWrap} onPress={onAvatarPress} activeOpacity={0.8}>
        <View style={[styles.avatar, { backgroundColor: accent + '22' }]}>
          <Text style={[styles.avatarText, { color: accent }]}>{getInitials(name)}</Text>
        </View>
        {isOnline && <View style={styles.onlineDot} />}
      </TouchableOpacity>

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
            <Text style={[styles.convName, { color: colors.textPrimary, fontWeight: unread ? '800' : '600' }]} numberOfLines={1}>
              {name}
            </Text>
            {conv.partner?.is_verified && <VerifiedBadge size={14} />}
          </View>
          <Text style={[styles.convTime, { color: unread ? colors.primary : colors.textTertiary }]}>
            {formatTime(conv.last_time)}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          <Text
            style={[styles.convLast, { color: unread ? colors.textPrimary : colors.textTertiary, fontWeight: unread ? '600' : '400' }]}
            numberOfLines={1}
          >
            {conv.last_message ?? '\u2026'}
          </Text>
          {unread ? (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.unreadText}>{conv.unread_count > 99 ? '99+' : conv.unread_count}</Text>
            </View>
          ) : (
            <Text style={[styles.lastSeenText, { color: isOnline ? '#36D9A0' : colors.textDisabled }]}>
              {isOnline ? 'En ligne' : formatLastSeen(conv.partner?.last_seen_at)}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── CallRow ────────────────────────────────────────────────────────────────────

const DIR_COLOR: Record<string, string> = {
  outgoing: '#36D9A0',
  incoming: '#3B82F6',
  missed:   '#E0389A',
};
const DIR_ICON: Record<string, string> = {
  outgoing: 'phone-outgoing',
  incoming: 'phone-incoming',
  missed:   'phone-missed',
};
const DIR_LABEL: Record<string, string> = {
  outgoing: 'Appel émis',
  incoming: 'Appel reçu',
  missed:   'Appel manqué',
};

function formatCallTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'À l\'instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `Il y a ${diffH} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDuration(sec: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? ` · ${m}min${s > 0 ? ` ${s}s` : ''}` : ` · ${s}s`;
}

const CallRow: React.FC<{ record: CallRecord; colors: any; onPress: () => void; onAvatarPress: () => void }> = ({ record, colors, onPress, onAvatarPress }) => {
  const accent     = accentFor(record.partnerId);
  const dirColor   = DIR_COLOR[record.direction] ?? '#9390AB';
  const dirIcon    = DIR_ICON[record.direction]  ?? 'phone';
  const dirLabel   = DIR_LABEL[record.direction] ?? '';
  const isMissed   = record.direction === 'missed';

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.divider, backgroundColor: isMissed ? '#E0389A08' : 'transparent' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <TouchableOpacity style={styles.avatarWrap} onPress={onAvatarPress} activeOpacity={0.8}>
        <View style={[styles.avatar, { backgroundColor: accent + '22' }]}>
          <Text style={[styles.avatarText, { color: accent }]}>{getInitials(record.partnerName)}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={[styles.convName, { color: isMissed ? dirColor : colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
            {record.partnerName}
          </Text>
          <Text style={[styles.convTime, { color: colors.textTertiary }]}>{formatCallTime(record.startedAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name={dirIcon} size={13} color={dirColor} />
            <Text style={[styles.convLast, { color: dirColor }]}>
              {dirLabel}{formatDuration(record.durationSec)}
            </Text>
          </View>
          <Icon name={record.callType === 'video' ? 'video' : 'phone'} size={14} color={colors.textTertiary} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

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

  tabsRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: -Spacing[4] },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 8, paddingTop: 2, position: 'relative' },
  tabLabel: { fontSize: 14, fontWeight: '700' },
  tabIndicator: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, borderRadius: 2 },

  searchBar: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: BorderRadius.full, paddingHorizontal: Spacing[3], gap: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 32 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[4], paddingVertical: 13, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: '#36D9A0', borderWidth: 2, borderColor: '#fff' },

  rowContent: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convName: { fontSize: 15, flex: 1, marginRight: 8 },
  convTime: { fontSize: 12 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convLast: { fontSize: 13, flex: 1, marginRight: 8 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  lastSeenText: { fontSize: 11, flexShrink: 0 },

  fab: { position: 'absolute', bottom: 28, right: 20, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  fabInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
