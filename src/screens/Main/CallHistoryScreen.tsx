/**
 * CallHistoryScreen — Historique des appels, écran séparé (extrait de
 * MessagesScreen : plus d'onglet "Appels", accessible via le bouton téléphone
 * du header Messages).
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, StatusBar, Image, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { callHistoryService } from '../../services/callHistoryService';
import type { CallRecord } from '../../services/callHistoryService';
import { useWs } from '../../context/WebSocketContext';
import { useFocusEffect } from '@react-navigation/native';
import { showConfirm } from '../../services';

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const ACCENT_COLORS = ['#7B3FF2','#FF7A2F','#E0389A','#36D9A0','#3B82F6','#9B65F5','#EF4444','#F59E0B'];
function accentFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return ACCENT_COLORS[h % ACCENT_COLORS.length]!;
}

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

export const CallHistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const { missedCallCount, clearMissedCalls } = useWs();

  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [refreshing,  setRefreshing]  = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode,  setSelectMode]  = useState(false);

  useFocusEffect(useCallback(() => {
    callHistoryService.getAll().then(setCallHistory).catch(() => {});
    clearMissedCalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

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
    showConfirm(
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

  const STATUS_H = insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: STATUS_H + 8 }]}>
        {selectMode ? (
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
                <Icon name={selectedIds.size === callHistory.length ? 'check-square' : 'square'} size={18} color={colors.primary} />
              </TouchableOpacity>
              {selectedIds.size > 0 && (
                <TouchableOpacity style={[styles.iconBtn, { backgroundColor: '#E0389A18' }]} onPress={deleteSelected}>
                  <Icon name="trash-2" size={18} color="#E0389A" />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <BackButton onPress={() => nav.goBack()} />
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Appels</Text>
              {missedCallCount > 0 && (
                <View style={[styles.badge, { backgroundColor: '#E0389A' }]}>
                  <Text style={styles.badgeText}>{missedCallCount > 99 ? '99+' : missedCallCount}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: '#36D9A020' }]}
              onPress={() => nav.navigate('NewCall')}
            >
              <Icon name="phone-call" size={18} color="#36D9A0" />
            </TouchableOpacity>
          </>
        )}
      </View>

      <FlatList
        data={callHistory}
        keyExtractor={r => r.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              callHistoryService.getAll().then(setCallHistory).catch(() => {}).finally(() => setRefreshing(false));
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
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id);
          return (
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
                      cst.checkbox,
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
                    onCallBack={selectMode ? () => {} : (type) => nav.navigate('Call', {
                      partnerId:    item.partnerId,
                      partnerName:  item.partnerName,
                      partnerAvatar: item.avatarUrl ?? null,
                      callType:     type,
                      isIncoming:   false,
                    })}
                    onMessage={selectMode ? () => {} : () => nav.navigate('Chat', {
                      partnerId:   item.partnerId,
                      partnerName: item.partnerName,
                    })}
                    onAvatarPress={selectMode ? () => toggleSelect(item.id) : () => nav.navigate('UserProfile', { userId: item.partnerId })}
                  />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

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

      <View style={[cst.divider, { backgroundColor: colors.divider }]} />

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

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 32 },
});

const cst = StyleSheet.create({
  checkbox: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    marginHorizontal: 16, marginVertical: 5, borderRadius: 16, borderWidth: 1, overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
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
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
  },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  actionSep: { width: StyleSheet.hairlineWidth, height: 20 },
});
