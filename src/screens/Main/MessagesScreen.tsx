/**
 * MessagesScreen â€” Messagerie directe FoliX
 * ConnectÃ© Ã  l'API /api/v1/messages/conversations
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert,
  TextInput, StyleSheet, Platform, StatusBar,
  RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets            = useSafeAreaInsets();
  const STATUS_H          = insets.top;
  const { theme, isDark } = useTheme();
  const { colors }        = theme;
  const nav               = useNavigation<any>();
  const route             = useRoute<any>();
  const { clearUnreadMessages, addListener, removeListener, missedCallCount, clearMissedCalls, sendMessage: sendWsMessage, isConnected } = useWs();
  const [activeTab,  setActiveTab]  = useState<'messages' | 'calls'>(
    route.params?.initialTab === 'calls' ? 'calls' : 'messages'
  );
  const [callHistory,       setCallHistory]       = useState<CallRecord[]>([]);
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set());
  const [selectMode,        setSelectMode]        = useState(false);

  const [convSelectedIds,   setConvSelectedIds]   = useState<Set<string>>(new Set());
  const [convSelectMode,    setConvSelectMode]    = useState(false);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [search,        setSearch]        = useState('');


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
    callHistoryService.getAll().then(setCallHistory).catch(() => {});
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

  // ── Calls selection ──────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(callHistory.map(r => r.id)));
  }, [callHistory]);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const deleteSelected = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      'Supprimer',
      `Supprimer ${count} appel${count > 1 ? 's' : ''} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            const ids = Array.from(selectedIds);
            await Promise.all(ids.map(id => callHistoryService.remove(id).catch(() => {})));
            setCallHistory(prev => prev.filter(r => !selectedIds.has(r.id)));
            exitSelect();
          },
        },
      ],
    );
  }, [selectedIds, exitSelect]);

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
    Alert.alert(
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
          ) : selectMode ? (
            // ── Mode sélection appels ──
            <>
              <TouchableOpacity style={styles.iconBtn} onPress={exitSelect}>
                <Icon name="x" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: 16 }]}>
                  {selectedIds.size === 0 ? 'Sélectionner' : `${selectedIds.size} sélectionné${selectedIds.size > 1 ? 's' : ''}`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.primary + '18' }]}
                  onPress={selectedIds.size === callHistory.length ? () => setSelectedIds(new Set()) : selectAll}
                >
                  <Icon
                    name={selectedIds.size === callHistory.length ? 'check-square' : 'square'}
                    size={18}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                {selectedIds.size > 0 && (
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: '#E0389A18' }]}
                    onPress={deleteSelected}
                  >
                    <Icon name="trash-2" size={18} color="#E0389A" />
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            // ── Mode normal ──
            <>
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
                  style={[styles.iconBtn, { backgroundColor: '#36D9A020' }]}
                  onPress={() => nav.navigate('NewCall' as any)}
                >
                  <Icon name="phone-call" size={18} color="#36D9A0" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Tabs */}
        <View style={[styles.tabsRow, { borderBottomColor: colors.divider }]}>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => { setActiveTab('messages'); exitSelect(); }}
          >
            <Text style={[styles.tabLabel, { color: activeTab === 'messages' ? colors.primary : colors.textTertiary }]}>
              Messages
            </Text>
            {activeTab === 'messages' && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => { setActiveTab('calls'); exitConvSelect(); clearMissedCalls(); callHistoryService.getAll().then(setCallHistory).catch(() => {}); }}
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
                  selectMode={convSelectMode}
                  isSelected={convSelectedIds.has(item.partner_id)}
                  onLongPress={() => { setConvSelectMode(true); toggleConvSelect(item.partner_id); }}
                  onPress={convSelectMode
                    ? () => toggleConvSelect(item.partner_id)
                    : () => nav.navigate('Chat' as any, {
                        partnerId:   item.partner_id,
                        partnerName: item.partner?.full_name ?? item.partner?.username ?? item.partner_id,
                        avatarUrl:   item.partner?.avatar_url,
                        isOnline:    item.partner?.is_online,
                        lastSeen:    item.partner?.last_seen_at,
                      })}
                  onAvatarPress={convSelectMode
                    ? () => toggleConvSelect(item.partner_id)
                    : () => nav.navigate('UserProfile' as any, { userId: item.partner_id })}
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                callHistoryService.getAll()
                  .then(setCallHistory)
                  .catch(() => {})
                  .finally(() => setRefreshing(false));
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingVertical: 8 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon name="phone" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyText, { color: colors.textPrimary, fontWeight: '700', fontSize: 16 }]}>Aucun appel récent</Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary, fontSize: 13, marginTop: 6 }]}>Vos appels vocaux et vidéo{'\n'}apparaîtront ici</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <Animated.View entering={FadeInDown.delay(index * 35).springify()}>
                <TouchableOpacity
                  activeOpacity={selectMode ? 0.6 : 1}
                  onLongPress={() => { setSelectMode(true); toggleSelect(item.id); }}
                  onPress={selectMode ? () => toggleSelect(item.id) : undefined}
                  delayLongPress={350}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {selectMode && (
                      <View style={{ paddingLeft: 12 }}>
                        <View style={[
                          sst.checkbox,
                          isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                          !isSelected && { borderColor: colors.textTertiary },
                        ]}>
                          {isSelected && <Icon name="check" size={13} color="#fff" />}
                        </View>
                      </View>
                    )}
                    <View style={{ flex: 1, opacity: selectMode && !isSelected ? 0.5 : 1 }}>
                      <CallRow
                        record={item}
                        colors={colors}
                        onCallBack={selectMode ? () => {} : (type) => nav.navigate('Call' as any, {
                          partnerId:    item.partnerId,
                          partnerName:  item.partnerName,
                          partnerAvatar: item.avatarUrl ?? null,
                          callType:     type,
                          isIncoming:   false,
                        })}
                        onMessage={selectMode ? () => {} : () => nav.navigate('Chat' as any, {
                          partnerId:   item.partnerId,
                          partnerName: item.partnerName,
                        })}
                        onAvatarPress={selectMode ? () => toggleSelect(item.id) : () => nav.navigate('UserProfile' as any, { userId: item.partnerId })}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          }}
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

const ConversationRow: React.FC<{
  conv:          ConversationSummary;
  colors:        any;
  onPress:       () => void;
  onLongPress:   () => void;
  onAvatarPress: () => void;
  selectMode:    boolean;
  isSelected:    boolean;
}> = ({ conv, colors, onPress, onLongPress, onAvatarPress, selectMode, isSelected }) => {
  const unread   = (conv.unread_count ?? 0) > 0;
  const name     = conv.partner?.full_name ?? conv.partner?.username ?? conv.partner_id;
  const accent   = accentFor(conv.partner_id);
  const isOnline = conv.partner?.is_online === true;

  return (
    <TouchableOpacity
      style={[styles.row, {
        borderBottomColor: colors.divider,
        backgroundColor:   isSelected ? colors.primary + '15' : unread ? colors.primary + '08' : 'transparent',
      }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.75}
    >
      {/* Checkbox overlay en mode s\u00e9lection */}
      {selectMode && (
        <View style={{ paddingRight: 8 }}>
          <View style={[
            sst.checkbox,
            isSelected  && { backgroundColor: colors.primary, borderColor: colors.primary },
            !isSelected && { borderColor: colors.textTertiary },
          ]}>
            {isSelected && <Icon name="check" size={13} color="#fff" />}
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.avatarWrap, { opacity: selectMode && !isSelected ? 0.5 : 1 }]}
        onPress={selectMode ? onPress : onAvatarPress}
        activeOpacity={0.8}
      >
        <View style={[styles.avatar, { backgroundColor: accent + '22' }]}>
          <Text style={[styles.avatarText, { color: accent }]}>{getInitials(name)}</Text>
        </View>
        {isOnline && !selectMode && <View style={styles.onlineDot} />}
      </TouchableOpacity>

      <View style={[styles.rowContent, { opacity: selectMode && !isSelected ? 0.5 : 1 }]}>
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
          {unread && !selectMode ? (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.unreadText}>{conv.unread_count > 99 ? '99+' : conv.unread_count}</Text>
            </View>
          ) : !selectMode ? (
            <Text style={[styles.lastSeenText, { color: isOnline ? '#36D9A0' : colors.textDisabled }]}>
              {isOnline ? 'En ligne' : formatLastSeen(conv.partner?.last_seen_at)}
            </Text>
          ) : null}
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
  incoming: 'Reçu',
  missed:   'Manqué',
};

function formatCallDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'À l\'instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diffH < 48)   return 'Hier';
  if (diffH < 168)  return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatCallDuration(sec: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}min ${s > 0 ? `${s}s` : ''}`.trim() : `${s}s`;
}

interface CallRowProps {
  record:        CallRecord;
  colors:        any;
  onCallBack:    (type: 'voice' | 'video') => void;
  onMessage:     () => void;
  onAvatarPress: () => void;
}

const CallRow: React.FC<CallRowProps> = ({ record, colors, onCallBack, onMessage, onAvatarPress }) => {
  const accent    = accentFor(record.partnerId);
  const dirColor  = DIR_COLOR[record.direction] ?? '#9390AB';
  const dirIcon   = DIR_ICON[record.direction]  ?? 'phone';
  const dirLabel  = DIR_LABEL[record.direction] ?? '';
  const isMissed  = record.direction === 'missed';
  const duration  = formatCallDuration(record.durationSec);

  return (
    <View style={[cst.card, { backgroundColor: colors.surface, borderColor: isMissed ? '#E0389A22' : colors.divider }]}>
      {/* Ligne du haut : avatar + infos + date */}
      <View style={cst.topRow}>
        <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.8} style={cst.avatarWrap}>
          {record.avatarUrl ? (
            <Image source={{ uri: record.avatarUrl }} style={[cst.avatar, { borderColor: accent + '44' }]} />
          ) : (
            <View style={[cst.avatar, { backgroundColor: accent + '22', borderColor: accent + '44' }]}>
              <Text style={[cst.avatarText, { color: accent }]}>{getInitials(record.partnerName)}</Text>
            </View>
          )}
          <View style={[cst.typeBadge, { backgroundColor: colors.background }]}>
            <Icon name={record.callType === 'video' ? 'video' : 'phone'} size={10} color={dirColor} />
          </View>
        </TouchableOpacity>

        <View style={cst.info}>
          <Text style={[cst.name, { color: isMissed ? dirColor : colors.textPrimary }]} numberOfLines={1}>
            {record.partnerName}
          </Text>
          <View style={cst.subRow}>
            <Icon name={dirIcon} size={12} color={dirColor} />
            <Text style={[cst.sub, { color: isMissed ? dirColor : colors.textSecondary }]}>
              {dirLabel}{duration ? `  ·  ${duration}` : ''}
            </Text>
          </View>
        </View>

        <Text style={[cst.date, { color: colors.textTertiary }]}>{formatCallDate(record.startedAt)}</Text>
      </View>

      {/* Séparateur */}
      <View style={[cst.divider, { backgroundColor: colors.divider }]} />

      {/* Ligne du bas : boutons horizontaux */}
      <View style={cst.actions}>
        <TouchableOpacity style={cst.actionItem} onPress={() => onCallBack('voice')} activeOpacity={0.75}>
          <Icon name="phone" size={16} color="#36D9A0" />
          <Text style={[cst.actionLabel, { color: '#36D9A0' }]}>Appel vocal</Text>
        </TouchableOpacity>

        <View style={[cst.actionSep, { backgroundColor: colors.divider }]} />

        <TouchableOpacity style={cst.actionItem} onPress={() => onCallBack('video')} activeOpacity={0.75}>
          <Icon name="video" size={16} color="#3B82F6" />
          <Text style={[cst.actionLabel, { color: '#3B82F6' }]}>Vidéo</Text>
        </TouchableOpacity>

        <View style={[cst.actionSep, { backgroundColor: colors.divider }]} />

        <TouchableOpacity style={cst.actionItem} onPress={onMessage} activeOpacity={0.75}>
          <Icon name="message-circle" size={16} color={colors.primary} />
          <Text style={[cst.actionLabel, { color: colors.primary }]}>Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const sst = StyleSheet.create({
  checkbox: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
});

const cst = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical:   5,
    borderRadius:     16,
    borderWidth:      1,
    overflow:         'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       12,
    gap:           12,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  avatarText: { fontSize: 17, fontWeight: '800' },
  typeBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
  },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '700' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sub: { fontSize: 13 },
  date: { fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  actions: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  actionItem: {
    flex: 1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 10,
  },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  actionSep: { width: StyleSheet.hairlineWidth, height: 20 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
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
