import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  StatusBar, Platform, ActivityIndicator, TextInput, FlatList,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { apiClient } from '../../api';
import type { AppColors } from '../../theme/colors';

type SoundTab = 'local' | 'online';

interface OnlineTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string | null;
  url: string;
}

interface Props {
  colors: AppColors;
  onGoBack: () => void;
  onSelectLocal: () => void;
  onSelectOnline: (url: string) => void;
}

const FALLBACK_TRACKS: OnlineTrack[] = [
  { id: '1', title: 'Lofi Chill Beat', artist: 'Free Music', duration: 30, thumbnail: null, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: '2', title: 'Ambient Piano', artist: 'Free Music', duration: 45, thumbnail: null, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: '3', title: 'Acoustic Guitar', artist: 'Free Music', duration: 25, thumbnail: null, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: '4', title: 'Deep Bass Loop', artist: 'Free Music', duration: 20, thumbnail: null, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: '5', title: 'Tropical Vibes', artist: 'Free Music', duration: 35, thumbnail: null, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: '6', title: 'Synthwave Retro', artist: 'Free Music', duration: 40, thumbnail: null, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { id: '7', title: 'Calm Nature', artist: 'Free Music', duration: 30, thumbnail: null, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
  { id: '8', title: 'EDM Drop', artist: 'Free Music', duration: 15, thumbnail: null, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
];

export const SoundPicker: React.FC<Props> = ({ colors, onGoBack, onSelectLocal, onSelectOnline }) => {
  const [tab, setTab] = useState<SoundTab>('local');
  const [search, setSearch] = useState('');
  const [tracks, setTracks] = useState<OnlineTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const searchOnline = useCallback(async (q: string) => {
    if (!q.trim()) { setTracks(FALLBACK_TRACKS); return; }
    setLoading(true);
    try {
      const res = await apiClient.get<{ tracks: OnlineTrack[] }>(
        `/api/v1/music/search?q=${encodeURIComponent(q.trim())}&limit=20`,
      );
      setTracks(Array.isArray(res.data?.tracks) ? res.data.tracks : FALLBACK_TRACKS);
    } catch {
      setTracks(FALLBACK_TRACKS);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'online') {
      const timer = setTimeout(() => searchOnline(search), 400);
      return () => clearTimeout(timer);
    }
  }, [search, tab]);

  const handleSelect = (track: OnlineTrack) => { onSelectOnline(track.url); };

  return (
    <View style={[sp.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[sp.header, { paddingTop: Platform.OS === 'android' ? 48 : 56, borderBottomColor: colors.border ?? '#eee' }]}>
        <TouchableOpacity onPress={onGoBack} style={sp.headerBtn}>
          <Icon name="arrow-left" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[sp.headerTitle, { color: colors.textPrimary }]}>Ajouter un son</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[sp.tabRow, { borderBottomColor: colors.divider ?? colors.border }]}>
        {(['local', 'online'] as SoundTab[]).map(t => {
          const active = tab === t;
          return (
            <TouchableOpacity key={t} style={[sp.tab, active && sp.tabActive]} onPress={() => setTab(t)} activeOpacity={0.7}>
              <Icon name={t === 'local' ? 'smartphone' : 'globe'} size={16} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[sp.tabLabel, { color: active ? colors.primary : colors.textSecondary }]}>
                {t === 'local' ? 'Mes fichiers' : 'En ligne'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Local */}
      {tab === 'local' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={sp.localContent}>
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            <TouchableOpacity style={sp.localCard} onPress={onSelectLocal} activeOpacity={0.8}>
              <LinearGradient colors={['#E65100', '#FF9800']} style={sp.localCardInner}>
                <View style={sp.localIconWrap}>
                  <MaterialIcon name="folder-music" size={28} color="#fff" />
                </View>
                <Text style={sp.localLabel}>Parcourir mes fichiers</Text>
                <Text style={sp.localSub}>MP3, M4A, AAC, WAV, OGG</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(140).springify()} style={[sp.tipBox, { backgroundColor: colors.surface ?? colors.backgroundSecondary }]}>
            <Icon name="info" size={14} color={colors.textTertiary ?? colors.textSecondary} />
            <Text style={[sp.tipText, { color: colors.textTertiary ?? colors.textSecondary }]}>
              Choisissez un fichier audio depuis votre téléphone pour accompagner votre story
            </Text>
          </Animated.View>
        </ScrollView>
      )}

      {/* Online */}
      {tab === 'online' && (
        <View style={{ flex: 1 }}>
          <View style={[sp.searchRow, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary, borderColor: colors.border }]}>
            <Icon name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={[sp.searchInput, { color: colors.textPrimary }]}
              placeholder="Rechercher une musique..."
              placeholderTextColor={colors.textDisabled ?? colors.textTertiary}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="x" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />}

          <FlatList
            data={tracks}
            keyExtractor={t => t.id}
            renderItem={({ item }) => {
              const mins = Math.floor(item.duration / 60);
              const secs = Math.floor(item.duration % 60);
              const isPlaying = playingId === item.id;
              return (
                <TouchableOpacity
                  style={[sp.trackRow, { borderBottomColor: colors.divider ?? colors.border }]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={[sp.trackThumb, { backgroundColor: colors.backgroundSecondary ?? '#1a1a2e' }]}>
                    <MaterialIcon name="music-note" size={18} color={colors.primary} />
                  </View>
                  <View style={sp.trackInfo}>
                    <Text style={[sp.trackTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[sp.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>{item.artist}</Text>
                  </View>
                  <Text style={[sp.trackDur, { color: colors.textTertiary }]}>{mins}:{String(secs).padStart(2, '0')}</Text>
                  <TouchableOpacity
                    style={[sp.trackPlayBtn, { backgroundColor: colors.backgroundSecondary ?? 'rgba(255,255,255,0.1)' }]}
                    onPress={() => setPlayingId(prev => prev === item.id ? null : item.id)}
                  >
                    <Icon name={isPlaying ? 'pause' : 'play'} size={14} color={colors.primary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              !loading ? (
                <View style={sp.empty}>
                  <MaterialIcon name="music-note-off" size={36} color={colors.textTertiary} />
                  <Text style={[sp.emptyText, { color: colors.textTertiary }]}>
                    {search.trim() ? 'Aucun résultat' : 'Recherchez une musique'}
                  </Text>
                </View>
              ) : null
            }
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
          />
        </View>
      )}
    </View>
  );
};

const sp = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: {},
  tabLabel: { fontSize: 13, fontWeight: '600' },
  localContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 },
  localCard: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 6 },
  localCardInner: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 10 },
  localIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  localLabel: { fontSize: 15, fontWeight: '800', color: '#fff' },
  localSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  tipBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16 },
  tipText: { fontSize: 12, flex: 1, lineHeight: 18 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 16, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 4 },
  trackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trackThumb: {
    width: 40, height: 40, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  trackInfo: { flex: 1, gap: 2 },
  trackTitle: { fontSize: 14, fontWeight: '600' },
  trackArtist: { fontSize: 12 },
  trackDur: { fontSize: 11, fontWeight: '500' },
  trackPlayBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 13 },
});
