import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  Image, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { storyService } from '../../services/storyService';
import type { StoryViewerUser } from '../../types/story';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'À l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `il y a ${hrs}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export const StoryViewersScreen: React.FC = () => {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { storyId, viewCount } = route.params as { storyId: string; viewCount: number; myId?: string };
  const myId: string | undefined = route.params?.myId;

  const { theme } = useTheme();
  const { colors } = theme;

  const [viewers, setViewers] = useState<StoryViewerUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storyService.getViewers(storyId)
      .then(data => setViewers(myId ? data.filter(v => v.id !== myId) : data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [storyId, myId]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.divider, backgroundColor: colors.background }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Icon name="eye" size={18} color={colors.primary} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            {viewCount} {viewCount === 1 ? 'vue' : 'vues'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={viewers}
          keyExtractor={v => v.id}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="eye-off" size={40} color={colors.textTertiary} />
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucun spectateur</Text>
              <Text style={[s.emptySub, { color: colors.textTertiary }]}>
                Personne n'a encore vu ce statut.
              </Text>
            </View>
          }
          renderItem={({ item: v, index }) => {
            const name = v.display_name || v.username || '?';
            return (
              <TouchableOpacity
                style={[s.row, { borderBottomColor: colors.divider }]}
                onPress={() => nav.navigate('UserProfile', { userId: v.id })}
                activeOpacity={0.7}
              >
                {v.avatar_url ? (
                  <Image source={{ uri: v.avatar_url }} style={s.avatar} />
                ) : (
                  <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.avatarFallback}>
                    <Text style={s.avatarInitial}>{name[0].toUpperCase()}</Text>
                  </LinearGradient>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: colors.textPrimary }]}>{name}</Text>
                  {v.username && (
                    <Text style={[s.username, { color: colors.textTertiary }]}>@{v.username}</Text>
                  )}
                </View>
                <Text style={[s.time, { color: colors.textTertiary }]}>{timeAgo(v.viewed_at)}</Text>
                <Icon name="chevron-right" size={14} color={colors.textTertiary} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar:        { width: 46, height: 46, borderRadius: 23 },
  avatarFallback:{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 17, fontWeight: '700' },
  name:          { fontSize: 15, fontWeight: '600' },
  username:      { fontSize: 12, marginTop: 2 },
  time:          { fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 100 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub:   { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
