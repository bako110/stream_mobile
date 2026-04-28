import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, Alert, RefreshControl, Platform,
  FlatList, Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { StoryViewer } from '../../components/story/StoryViewer';
import { StoryCreator } from '../../components/story/StoryCreator';
import { storyService } from '../../services/storyService';
import { authService } from '../../services/authService';
import type { Story, StoryGroup, StoryViewerUser } from '../../types/story';

interface Props { navigation: any }

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'À l\'instant';
  if (mins < 60) return `il y a ${mins} minute${mins > 1 ? 's' : ''}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `il y a ${hrs} heure${hrs > 1 ? 's' : ''}`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ── Viewers bottom sheet ──────────────────────────────────────────────────────

interface ViewersSheetProps {
  story: Story;
  colors: any;
  onClose: () => void;
  onNavigate: (userId: string) => void;
}

const ViewersSheet: React.FC<ViewersSheetProps> = ({ story, colors, onClose, onNavigate }) => {
  const [viewers, setViewers] = useState<StoryViewerUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storyService.getViewers(story.id)
      .then(setViewers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [story.id]);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={vs.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[vs.sheet, { backgroundColor: colors.surface }]}>
          <View style={[vs.handle, { backgroundColor: colors.divider }]} />
          <View style={[vs.header, { borderBottomColor: colors.divider }]}>
            <Icon name="eye" size={18} color={colors.primary} />
            <Text style={[vs.title, { color: colors.textPrimary }]}>
              {story.view_count} {story.view_count === 1 ? 'vue' : 'vues'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="x" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={loading ? [] : viewers}
            keyExtractor={v => v.id}
            contentContainerStyle={{ paddingBottom: 30 }}
            ListEmptyComponent={
              loading ? null : (
                <View style={vs.empty}>
                  <Icon name="eye-off" size={32} color={colors.textTertiary} />
                  <Text style={[vs.emptyText, { color: colors.textTertiary }]}>
                    Aucun spectateur pour l'instant
                  </Text>
                </View>
              )
            }
            renderItem={({ item: v }) => {
              const name = v.display_name || v.username || '?';
              return (
                <TouchableOpacity
                  style={vs.row}
                  onPress={() => { onClose(); onNavigate(v.id); }}
                  activeOpacity={0.7}
                >
                  {v.avatar_url
                    ? <Image source={{ uri: v.avatar_url }} style={vs.avatar} />
                    : (
                      <LinearGradient colors={['#7B3FF2', '#E0389A']} style={vs.avatarFallback}>
                        <Text style={vs.avatarInitial}>{name[0].toUpperCase()}</Text>
                      </LinearGradient>
                    )
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={[vs.name, { color: colors.textPrimary }]}>{name}</Text>
                    {v.username && <Text style={[vs.username, { color: colors.textTertiary }]}>@{v.username}</Text>}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

const vs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%', paddingTop: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 16, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '600' },
  username: { fontSize: 12, marginTop: 1 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14 },
});

// ── Action Menu ───────────────────────────────────────────────────────────────

interface ActionMenuProps {
  story: Story;
  colors: any;
  onClose: () => void;
  onViewers: () => void;
  onDelete: () => void;
}

const ActionMenu: React.FC<ActionMenuProps> = ({ story, colors, onClose, onViewers, onDelete }) => (
  <Modal transparent animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity style={am.overlay} activeOpacity={1} onPress={onClose}>
      <View style={[am.menu, { backgroundColor: colors.surface }]}>
        <TouchableOpacity style={am.item} onPress={() => { onClose(); onViewers(); }}>
          <Icon name="eye" size={18} color={colors.textPrimary} />
          <Text style={[am.itemText, { color: colors.textPrimary }]}>Voir les vues</Text>
        </TouchableOpacity>
        <View style={[am.divider, { backgroundColor: colors.divider }]} />
        <TouchableOpacity style={am.item} onPress={() => { onClose(); onDelete(); }}>
          <Icon name="trash-2" size={18} color="#FF4444" />
          <Text style={[am.itemText, { color: '#FF4444' }]}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);

const am = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  menu: { marginHorizontal: 12, marginBottom: Platform.OS === 'android' ? 24 : 40, borderRadius: 16, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  itemText: { fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
});

// ── Story Row ─────────────────────────────────────────────────────────────────

interface RowProps {
  story: Story;
  colors: any;
  onPress: (story: Story) => void;
  onMenu: (story: Story) => void;
}

const StoryRow: React.FC<RowProps> = ({ story, colors, onPress, onMenu }) => {
  const isText = story.media_type === 'text';
  const bg = story.background_color ?? '#7B3FF2';
  const hasHeart = story.view_count > 0;

  return (
    <TouchableOpacity
      style={[row.container, { borderBottomColor: colors.divider }]}
      activeOpacity={0.7}
      onPress={() => onPress(story)}
    >
      {/* Thumbnail */}
      <View style={row.thumbWrap}>
        {isText ? (
          <LinearGradient colors={[bg, bg + 'CC']} style={row.thumb}>
            <Text style={row.thumbText} numberOfLines={2}>{story.caption ?? ''}</Text>
          </LinearGradient>
        ) : story.thumbnail_url || story.media_url ? (
          <Image
            source={{ uri: story.thumbnail_url ?? story.media_url ?? '' }}
            style={row.thumb}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient colors={['#7B3FF2', '#E0389A']} style={row.thumb}>
            <Icon name="image" size={22} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        )}
      </View>

      {/* Info */}
      <View style={row.info}>
        <View style={row.titleRow}>
          <Text style={[row.views, { color: colors.textPrimary }]}>
            {story.view_count} {story.view_count === 1 ? 'vue' : 'vues'}
          </Text>
          {hasHeart && (
            <Icon name="heart" size={16} color="#4CAF50" style={{ marginLeft: 6 }} />
          )}
        </View>
        <Text style={[row.time, { color: colors.textSecondary }]}>{timeAgo(story.created_at)}</Text>
      </View>

      {/* Menu dots */}
      <TouchableOpacity
        style={row.menuBtn}
        onPress={() => onMenu(story)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="more-vertical" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const row = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbWrap: { marginRight: 14 },
  thumb: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbText: { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center', paddingHorizontal: 4 },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  views: { fontSize: 16, fontWeight: '600' },
  time: { fontSize: 13, marginTop: 2 },
  menuBtn: { paddingHorizontal: 4 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export const MyStoriesScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [stories,      setStories]      = useState<Story[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [viewerOpen,   setViewerOpen]   = useState(false);
  const [viewerIndex,  setViewerIndex]  = useState(0);
  const [menuStory,    setMenuStory]    = useState<Story | null>(null);
  const [viewersStory, setViewersStory] = useState<Story | null>(null);
  const [creatorOpen,  setCreatorOpen]  = useState(false);
  const [myId,         setMyId]         = useState<string | undefined>(undefined);

  const load = useCallback(async (refresh = false) => {
    try {
      const data = await storyService.getMyStories();
      setStories(data);
    } catch {}
    finally {
      setLoading(false);
      if (refresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    authService.getMe().then(u => setMyId(String(u.id))).catch(() => {});
  }, []);

  const handleOpenViewer = useCallback((story: Story) => {
    const idx = stories.findIndex(s => s.id === story.id);
    setViewerIndex(idx >= 0 ? idx : 0);
    setViewerOpen(true);
  }, [stories]);

  const handleDelete = useCallback((story: Story) => {
    Alert.alert(
      'Supprimer ce statut ?',
      'Il sera définitivement supprimé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              await storyService.delete(story.id);
              setStories(prev => prev.filter(s => s.id !== story.id));
            } catch {
              Alert.alert('Erreur', 'Impossible de supprimer ce statut.');
            }
          },
        },
      ],
    );
  }, []);

  const firstAuthor = stories.find(s => s.author)?.author;
  const myGroup: StoryGroup | null = stories.length > 0 ? {
    user: firstAuthor ?? { id: myId ?? '', username: 'Moi', display_name: null, avatar_url: null },
    stories,
    has_unseen: false,
  } : null;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.background, borderBottomColor: colors.divider }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.textPrimary }]}>Mon statut</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Liste ── */}
      <FlatList
        data={loading ? [] : stories}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <Animated.View entering={FadeInDown.duration(300)} style={s.empty}>
              <LinearGradient colors={['#7B3FF2', '#E0389A']} style={s.emptyIcon}>
                <Icon name="camera" size={36} color="#fff" />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Aucun statut publié</Text>
              <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                Vos statuts apparaissent ici pendant 24h après publication.
              </Text>
            </Animated.View>
          ) : null
        }
        renderItem={({ item }) => (
          <StoryRow
            story={item}
            colors={colors}
            onPress={handleOpenViewer}
            onMenu={setMenuStory}
          />
        )}
        ListFooterComponent={
          stories.length > 0 ? (
            <View style={[s.footer, { backgroundColor: colors.surfaceElevated }]}>
              <MaterialIcon name="lock-outline" size={14} color={colors.textTertiary} />
              <Text style={[s.footerText, { color: colors.textTertiary }]}>
                Vos mises à jour de statut sont{' '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>chiffrées de bout en bout</Text>
                {'. Elles disparaissent au bout de 24 heures.'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />

      {/* ── FAB ajouter ── */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: colors.surface }]}
        onPress={() => setCreatorOpen(true)}
        activeOpacity={0.85}
      >
        <Icon name="camera" size={22} color={colors.textPrimary} />
        <View style={[s.fabPlusBadge, { backgroundColor: colors.primary }]}>
          <Icon name="plus" size={10} color="#fff" />
        </View>
      </TouchableOpacity>

      {/* ── Action menu ── */}
      {menuStory && (
        <ActionMenu
          story={menuStory}
          colors={colors}
          onClose={() => setMenuStory(null)}
          onViewers={() => setViewersStory(menuStory)}
          onDelete={() => handleDelete(menuStory)}
        />
      )}

      {/* ── Viewers sheet ── */}
      {viewersStory && (
        <ViewersSheet
          story={viewersStory}
          colors={colors}
          onClose={() => setViewersStory(null)}
          onNavigate={userId => navigation.navigate('UserProfile', { userId })}
        />
      )}

      {/* ── StoryViewer plein écran ── */}
      {viewerOpen && myGroup && (
        <StoryViewer
          groups={[myGroup]}
          initialGroupIndex={0}
          initialStoryIndex={viewerIndex}
          currentUserId={myId}
          onClose={() => { setViewerOpen(false); load(); }}
        />
      )}

      {/* ── Creator ── */}
      <StoryCreator
        visible={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onCreated={() => { setCreatorOpen(false); load(); }}
      />
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
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40, paddingTop: 80 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  footer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    margin: 16, padding: 14, borderRadius: 12,
  },
  footerText: { flex: 1, fontSize: 13, lineHeight: 18 },

  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 6,
  },
  fabPlusBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
});
