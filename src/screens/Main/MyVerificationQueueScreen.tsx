import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../../navigation/MainNavigator';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { postService } from '../../services/postService';
import { eventService } from '../../services/eventService';
import { concertService } from '../../services/concertService';
import { reelService } from '../../services/reelService';
import { showConfirm } from '../../services/confirmService';
import { toastService } from '../../services';

type QueueContentType = 'reel' | 'post' | 'event' | 'concert';
type AiStatus = 'pending' | 'limited' | 'removed';

interface QueueItem {
  content_type: QueueContentType;
  content_id: string;
  title: string;
  thumbnail_url: string | null;
  created_at: string | null;
  ai_status: AiStatus;
  reason: string | null;
  details: string | null;
}

// Repris tel quel du mapping de components/common/ReportModal.tsx pour rester
// coherent avec le libelle deja affiche quand l'utilisateur signale un contenu.
const REASON_LABEL: Record<string, string> = {
  spam: 'Spam', inappropriate: 'Contenu inapproprié', violence: 'Violence',
  harassment: 'Harcèlement', misinformation: 'Désinformation', other: 'Autre',
};

const TYPE_LABEL: Record<QueueContentType, string> = {
  reel: 'Reel', post: 'Publication', event: 'Événement', concert: 'Concert',
};

const DELETE_FN: Record<QueueContentType, (id: string) => Promise<any>> = {
  reel: reelService.delete, post: postService.delete,
  event: eventService.delete, concert: concertService.delete,
};

export const MyVerificationQueueScreen: React.FC = () => {
  const { theme: { colors, isDark } } = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<QueueItem[]>(Endpoints.reports.me)
      .then(res => setItems(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = useCallback((item: QueueItem) => {
    showConfirm('Supprimer', 'Supprimer ce contenu ? Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await DELETE_FN[item.content_type](item.content_id);
          setItems(prev => prev.filter(i => i.content_id !== item.content_id));
        } catch {
          toastService.error('Erreur', 'Impossible de supprimer.');
        }
      }},
    ]);
  }, []);

  const handleEdit = useCallback((item: QueueItem) => {
    if (item.content_type === 'event') nav.navigate('CreateEvent', { eventId: item.content_id });
    else if (item.content_type === 'concert') nav.navigate('CreateConcert', { concertId: item.content_id });
    // post/reel : pas d'ecran d'edition dedie mobile (edition inline seulement
    // depuis PostCard/ReelsScreen) -- bouton masque pour ces deux types.
  }, [nav]);

  const renderItem = ({ item }: { item: QueueItem }) => {
    const statusColor = item.ai_status === 'pending' ? colors.textTertiary : item.ai_status === 'limited' ? '#F59E0B' : '#EF4444';
    const statusLabel = item.ai_status === 'pending'
      ? 'Vérification en cours…'
      : item.ai_status === 'limited'
        ? 'Diffusion limitée — en revue'
        : 'Retiré automatiquement';
    const canEdit = item.content_type === 'event' || item.content_type === 'concert';

    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderLeftColor: statusColor }]}>
        <View style={s.cardThumbWrap}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={s.cardThumb} />
          ) : (
            <View style={[s.cardThumb, { backgroundColor: statusColor + '15', alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name="shield" size={32} color={statusColor} />
            </View>
          )}
          <View style={[s.typeBadge, { backgroundColor: statusColor }]}>
            <Text style={s.typeBadgeText}>{TYPE_LABEL[item.content_type]}</Text>
          </View>
        </View>

        <View style={{ padding: 14, gap: 8 }}>
          <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={item.ai_status === 'pending' ? 'clock' : 'alert-triangle'} size={13} color={statusColor} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
          </View>

          {item.reason && (
            <Text style={{ fontSize: 12, color: colors.textTertiary }}>
              Raison : {REASON_LABEL[item.reason] ?? item.reason}
            </Text>
          )}

          {item.created_at && (
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>
              {new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' à '}
              {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }}>
            <TouchableOpacity onPress={() => handleDelete(item)} style={[s.actionBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
              <Icon name="trash-2" size={13} color="#EF4444" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#EF4444' }}>Supprimer</Text>
            </TouchableOpacity>
            {canEdit && (
              <TouchableOpacity onPress={() => handleEdit(item)} style={[s.actionBtn, { backgroundColor: statusColor + '18', marginLeft: 'auto' }]}>
                <Icon name="edit-3" size={12} color={statusColor} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor }}>Modifier</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <View style={[s.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.topTitle, { color: colors.textPrimary }]}>Vérifications</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
          <Icon name="shield" size={48} color="#10B981" />
          <Text style={[s.title, { color: colors.textPrimary, textAlign: 'center' }]}>Tout est en ordre</Text>
          <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center' }}>
            Aucun de vos contenus n'est en attente de vérification ou signalé.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => `${item.content_type}-${item.content_id}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }}
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  card: { borderRadius: 18, overflow: 'hidden', borderLeftWidth: 3 },
  cardThumbWrap: { aspectRatio: 16 / 9, position: 'relative' },
  cardThumb: { width: '100%', height: '100%' },
  typeBadge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  title: { fontSize: 14, fontWeight: '700' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
});
