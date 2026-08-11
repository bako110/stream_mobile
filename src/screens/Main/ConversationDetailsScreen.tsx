/**
 * ConversationDetailsScreen — "Détails de la conversation" : tous les
 * paramètres d'une conversation regroupés en un seul endroit (statut de
 * présence, notifications, médias partagés, bloquer/signaler, vider/
 * supprimer), pour ne plus avoir à passer par les Settings généraux.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  Image, FlatList, Switch, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BackButton, AvatarWithBadge, VerifiedBadge } from '../../components/common';
import { ReportModal } from '../../components/common/ReportModal';
import { messageService } from '../../services/messageService';
import { userService } from '../../services/userService';
import { toastService, showConfirm } from '../../services';
import type { Message } from '../../services/messageService';

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

interface RouteParams {
  partnerId:   string;
  partnerName: string;
  avatarUrl?:  string;
  isOnline?:   boolean;
  lastSeen?:   string | null;
  isVerified?: boolean;
}

export const ConversationDetailsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const {
    partnerId, partnerName, avatarUrl,
    isOnline: initialIsOnline, lastSeen: initialLastSeen, isVerified,
  } = route.params as RouteParams;

  const [isOnline]   = useState(initialIsOnline ?? false);
  const [lastSeen]   = useState(initialLastSeen ?? null);

  const [muted, setMuted]           = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [media, setMedia]           = useState<Message[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);

  useFocusEffect(useCallback(() => {
    messageService.getMuteStatus(partnerId).then(setMuted).catch(() => {});
    messageService.getConversationMedia(partnerId).then(setMedia).catch(() => {}).finally(() => setMediaLoading(false));
  }, [partnerId]));

  const toggleMute = async (value: boolean) => {
    setMuted(value);
    setMuteLoading(true);
    try {
      if (value) await messageService.muteConversation(partnerId);
      else       await messageService.unmuteConversation(partnerId);
    } catch {
      setMuted(!value);
      toastService.error('Erreur', 'Impossible de modifier les notifications.');
    } finally {
      setMuteLoading(false);
    }
  };

  const handleBlock = () => {
    showConfirm(
      'Bloquer cet utilisateur',
      `Bloquer ${partnerName} ? Vous ne pourrez plus échanger de messages.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer', style: 'destructive', onPress: async () => {
            try {
              await userService.blockUser(partnerId);
              toastService.success('Bloqué', `${partnerName} a été bloqué.`);
              nav.navigate('Messages');
            } catch {
              toastService.error('Erreur', 'Impossible de bloquer cet utilisateur.');
            }
          },
        },
      ],
    );
  };

  const handleClearChat = () => {
    showConfirm(
      'Vider la conversation',
      'Tous vos messages seront supprimés définitivement, les messages reçus seront masqués de votre côté uniquement. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider quand même', style: 'destructive', onPress: async () => {
            try {
              await messageService.deleteConversation(partnerId);
              toastService.success('Conversation vidée', '');
              nav.navigate('Messages');
            } catch {
              toastService.error('Erreur', 'Impossible de vider la conversation.');
            }
          },
        },
      ],
    );
  };

  const handleDeleteConversation = () => {
    showConfirm(
      'Supprimer la conversation',
      `Supprimer définitivement la conversation avec ${partnerName} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive', onPress: async () => {
            try {
              await messageService.deleteConversation(partnerId);
              nav.navigate('Messages');
            } catch {
              toastService.error('Erreur', 'Impossible de supprimer la conversation.');
            }
          },
        },
      ],
    );
  };

  const STATUS_H = insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: STATUS_H + 8 }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Détails</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={media}
        keyExtractor={m => m.id}
        numColumns={3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        columnWrapperStyle={media.length > 0 ? { gap: 2, paddingHorizontal: 16 } : undefined}
        ListHeaderComponent={
          <View>
            {/* Profil */}
            <TouchableOpacity
              style={styles.profileSection}
              activeOpacity={0.8}
              onPress={() => nav.navigate('UserProfile', { userId: partnerId })}
            >
              <AvatarWithBadge
                avatarUrl={avatarUrl}
                initials={partnerName?.[0]?.toUpperCase() ?? '?'}
                size={88}
                accentColor={colors.primary}
                isOnline={isOnline}
              />
              <View style={styles.nameRow}>
                <Text style={[styles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {partnerName}
                </Text>
                {isVerified && <VerifiedBadge size={16} />}
              </View>
              <View style={styles.statusRow}>
                {isOnline && <View style={styles.onlineDot} />}
                <Text style={[styles.statusText, { color: isOnline ? '#36D9A0' : colors.textTertiary }]}>
                  {isOnline ? 'En ligne' : formatLastSeen(lastSeen)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Actions rapides */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => nav.navigate('Chat', { partnerId, partnerName, avatarUrl, isOnline, lastSeen })}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Icon name="message-circle" size={19} color={colors.primary} />
                </View>
                <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => nav.navigate('Call', { partnerId, partnerName, partnerAvatar: avatarUrl ?? null, callType: 'voice', isIncoming: false })}
              >
                <View style={[styles.quickIcon, { backgroundColor: '#36D9A018' }]}>
                  <Icon name="phone" size={19} color="#36D9A0" />
                </View>
                <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Appel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => nav.navigate('Call', { partnerId, partnerName, partnerAvatar: avatarUrl ?? null, callType: 'video', isIncoming: false })}
              >
                <View style={[styles.quickIcon, { backgroundColor: '#3B82F618' }]}>
                  <Icon name="video" size={19} color="#3B82F6" />
                </View>
                <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Vidéo</Text>
              </TouchableOpacity>
            </View>

            {/* Notifications */}
            <View style={[styles.section, { backgroundColor: colors.surface }]}>
              <View style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: colors.textTertiary + '15' }]}>
                  <Icon name={muted ? 'bell-off' : 'bell'} size={17} color={colors.textPrimary} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.textPrimary, flex: 1 }]}>
                  Notifications
                </Text>
                {muteLoading
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Switch
                      value={!muted}
                      onValueChange={(v) => toggleMute(!v)}
                      trackColor={{ false: colors.textTertiary + '55', true: colors.primary }}
                      thumbColor="#fff"
                    />
                }
              </View>
            </View>

            {/* Médias partagés */}
            <View style={styles.mediaHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
                MÉDIAS PARTAGÉS {media.length > 0 ? `(${media.length})` : ''}
              </Text>
            </View>
            {mediaLoading && (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
            {!mediaLoading && media.length === 0 && (
              <View style={styles.emptyMedia}>
                <Icon name="image" size={28} color={colors.textTertiary} />
                <Text style={[styles.emptyMediaText, { color: colors.textTertiary }]}>Aucun média partagé</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.mediaThumb}
            activeOpacity={0.85}
            onPress={() => nav.navigate('Chat', { partnerId, partnerName, avatarUrl, isOnline, lastSeen })}
          >
            {item.message_type === 'video' ? (
              <>
                <Image source={{ uri: item.attachment_meta?.thumbnail_url || item.attachment_url }} style={styles.mediaImg} />
                <View style={styles.videoOverlay}>
                  <Icon name="play" size={16} color="#fff" />
                </View>
              </>
            ) : (
              <Image source={{ uri: item.attachment_url }} style={styles.mediaImg} />
            )}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <View style={styles.dangerSection}>
            <TouchableOpacity style={[styles.dangerRow, { backgroundColor: colors.surface }]} onPress={handleClearChat}>
              <Icon name="trash" size={18} color={colors.textTertiary} />
              <Text style={[styles.dangerLabel, { color: colors.textPrimary }]}>Vider la conversation</Text>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dangerRow, { backgroundColor: colors.surface }]} onPress={handleDeleteConversation}>
              <Icon name="x-circle" size={18} color={colors.textTertiary} />
              <Text style={[styles.dangerLabel, { color: colors.textPrimary }]}>Supprimer la conversation</Text>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dangerRow, { backgroundColor: colors.surface }]} onPress={() => setShowReport(true)}>
              <Icon name="flag" size={18} color="#F59E0B" />
              <Text style={[styles.dangerLabel, { color: '#F59E0B' }]}>Signaler {partnerName}</Text>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dangerRow, { backgroundColor: colors.surface }]} onPress={handleBlock}>
              <Icon name="slash" size={18} color="#E0389A" />
              <Text style={[styles.dangerLabel, { color: '#E0389A' }]}>Bloquer {partnerName}</Text>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        }
      />

      <ReportModal
        visible={showReport}
        contentType="user"
        contentId={partnerId}
        onClose={() => setShowReport(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 17, fontWeight: '800' },

  profileSection: { alignItems: 'center', paddingVertical: 20, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  profileName: { fontSize: 19, fontWeight: '800', maxWidth: 260 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#36D9A0' },
  statusText: { fontSize: 13, fontWeight: '600' },

  quickActions: { flexDirection: 'row', justifyContent: 'center', gap: 36, paddingBottom: 24 },
  quickBtn: { alignItems: 'center', gap: 6 },
  quickIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '600' },

  section: { marginHorizontal: 16, borderRadius: 14, marginBottom: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '600' },

  mediaHeader: { paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  emptyMedia: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyMediaText: { fontSize: 13 },

  mediaThumb: { flex: 1 / 3, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 2, position: 'relative' },
  mediaImg: { width: '100%', height: '100%' },
  videoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000033',
  },

  dangerSection: { marginHorizontal: 16, marginTop: 24, gap: 8 },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14,
  },
  dangerLabel: { fontSize: 14.5, fontWeight: '600', flex: 1 },
});
