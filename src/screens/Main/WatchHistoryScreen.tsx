import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

interface HistoryEntry {
  _id: string;
  video_id: string;
  content_id?: string;
  episode_id?: string;
  content_type?: 'film' | 'serie_episode';
  title?: string;
  thumbnail_url?: string;
  last_position_sec: number;
  total_seconds?: number;
  completed: boolean;
  last_watched_at: string;
}

interface Props {
  navigation: { goBack: () => void; navigate: (screen: string, params: any) => void };
}

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`;
  return `${m}min ${s.toString().padStart(2, '0')}s`;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'À l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const TYPE_CONFIG = {
  film: { icon: 'film', label: 'Film', color: '#6366f1' },
  serie_episode: { icon: 'tv', label: 'Épisode', color: '#10b981' },
  default: { icon: 'play-circle', label: 'Vidéo', color: '#f59e0b' },
};

export const WatchHistoryScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<HistoryEntry[]>(Endpoints.users.watchHistory)
      .then(res => setHistory(res.data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  const inProgress = history.filter(h => !h.completed && h.last_position_sec > 0);
  const completed  = history.filter(h => h.completed);

  const renderEntry = (entry: HistoryEntry) => {
    const cfg = TYPE_CONFIG[entry.content_type ?? 'default'] ?? TYPE_CONFIG.default;
    const progress = entry.total_seconds && entry.total_seconds > 0
      ? Math.min(entry.last_position_sec / entry.total_seconds, 1)
      : null;

    return (
      <TouchableOpacity
        key={entry._id}
        activeOpacity={0.8}
        style={[s.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
        onPress={() => {
          // Relancer depuis la position sauvegardée — navigate vers VideoPlayer si on a l'URL
        }}
      >
        {/* Thumbnail */}
        <View style={s.thumbWrap}>
          {entry.thumbnail_url ? (
            <Image source={{ uri: entry.thumbnail_url }} style={s.thumb} resizeMode="cover" />
          ) : (
            <View style={[s.thumb, { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name={cfg.icon} size={24} color={colors.textTertiary} />
            </View>
          )}
          {/* Barre de progression */}
          {progress !== null && (
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: cfg.color }]} />
            </View>
          )}
          {entry.completed && (
            <View style={[s.completedBadge, { backgroundColor: cfg.color }]}>
              <Icon name="check" size={10} color="#fff" />
            </View>
          )}
        </View>

        {/* Infos */}
        <View style={{ flex: 1, gap: 4 }}>
          {/* Badge type */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[s.typeBadge, { backgroundColor: cfg.color + '22' }]}>
              <Icon name={cfg.icon} size={10} color={cfg.color} />
              <Text style={[s.typeTxt, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={[s.ago, { color: colors.textTertiary }]}>{timeAgo(entry.last_watched_at)}</Text>
          </View>

          <Text style={[s.entryTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {entry.title ?? 'Sans titre'}
          </Text>

          {/* Temps visionné */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="clock" size={11} color={colors.textTertiary} />
            <Text style={[s.timeText, { color: colors.textTertiary }]}>
              {entry.completed
                ? `Terminé · ${entry.total_seconds ? fmt(entry.total_seconds) : ''}`
                : `${fmt(entry.last_position_sec)} visionné${entry.total_seconds ? ` / ${fmt(entry.total_seconds)}` : ''}`}
            </Text>
          </View>

          {/* Barre de progression texte */}
          {progress !== null && !entry.completed && (
            <Text style={[s.progressTxt, { color: cfg.color }]}>
              {Math.round(progress * 100)}% visionné
            </Text>
          )}
        </View>

        <Icon name="play-circle" size={22} color={colors.textTertiary} style={{ alignSelf: 'center' }} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Historique</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : history.length === 0 ? (
        <View style={s.empty}>
          <Icon name="clock" size={48} color={colors.textTertiary} />
          <Text style={[s.emptyTxt, { color: colors.textTertiary }]}>Aucun contenu regardé</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>

          {/* En cours */}
          {inProgress.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Icon name="play" size={14} color="#f59e0b" />
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>En cours</Text>
                <Text style={[s.sectionCount, { color: colors.textTertiary }]}>{inProgress.length}</Text>
              </View>
              {inProgress.map(renderEntry)}
            </View>
          )}

          {/* Terminés */}
          {completed.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Icon name="check-circle" size={14} color="#10b981" />
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Terminés</Text>
                <Text style={[s.sectionCount, { color: colors.textTertiary }]}>{completed.length}</Text>
              </View>
              {completed.map(renderEntry)}
            </View>
          )}

        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 20, fontWeight: '800' },

  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTxt:     { fontSize: 15, fontWeight: '500' },

  section:      { marginBottom: 24 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  sectionCount: { fontSize: 13, fontWeight: '600' },

  card:         { flexDirection: 'row', gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginBottom: 10 },
  thumbWrap:    { width: 110, height: 65, borderRadius: 8, overflow: 'hidden' },
  thumb:        { width: 110, height: 65 },
  progressBarBg:{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  progressBarFill: { height: 3 },
  completedBadge:{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  typeBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  typeTxt:      { fontSize: 10, fontWeight: '700' },
  ago:          { fontSize: 11, fontWeight: '500' },
  entryTitle:   { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  timeText:     { fontSize: 11, fontWeight: '500' },
  progressTxt:  { fontSize: 11, fontWeight: '700' },
});
