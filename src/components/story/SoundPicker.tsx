import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  StatusBar, ActivityIndicator, TextInput, FlatList,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Sound from 'react-native-sound';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import type { AppColors } from '../../theme/colors';

type SoundTab = 'local' | 'popular' | 'search';

interface OnlineTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string | null;
  url: string;
  usage_count?: number;
}

interface Props {
  colors: AppColors;
  onGoBack: () => void;
  onSelectLocal: () => void;
  onSelectOnline: (url: string, title?: string) => void;
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

function mapSound(s: any): OnlineTrack {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist_name ?? 'Inconnu',
    duration: s.duration_seconds ?? 0,
    thumbnail: s.cover_url ?? null,
    url: s.file_url,
    usage_count: s.usage_count ?? 0,
  };
}

export const SoundPicker: React.FC<Props> = ({ colors, onGoBack, onSelectLocal, onSelectOnline }) => {
  const [tab, setTab] = useState<SoundTab>('popular');
  const [search, setSearch] = useState('');
  const [tracks, setTracks] = useState<OnlineTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const insets = useSafeAreaInsets();

  const stopPreview = useCallback(() => {
    if (soundRef.current) {
      soundRef.current.stop(() => { soundRef.current?.release(); soundRef.current = null; });
    }
    setPlayingId(null);
    setLoadingId(null);
  }, []);

  const togglePreview = useCallback((track: OnlineTrack) => {
    if (playingId === track.id) { stopPreview(); return; }
    stopPreview();
    setLoadingId(track.id);
    Sound.setCategory('Playback');
    const snd = new Sound(track.url, '', err => {
      setLoadingId(null);
      if (err) return;
      soundRef.current = snd;
      setPlayingId(track.id);
      snd.play(success => { if (!success || playingId === track.id) setPlayingId(null); });
    });
  }, [playingId, stopPreview]);

  useEffect(() => () => { stopPreview(); }, [stopPreview]);

  const loadPopular = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<any[]>(Endpoints.sounds.popular);
      const data = Array.isArray(res.data) ? res.data : [];
      setTracks(data.length > 0 ? data.map(mapSound) : FALLBACK_TRACKS);
    } catch {
      setTracks(FALLBACK_TRACKS);
    } finally { setLoading(false); }
  }, []);

  const searchOnline = useCallback(async (q: string) => {
    if (!q.trim()) { setTracks([]); return; }
    setLoading(true);
    try {
      const res = await apiClient.get<any[]>(
        `${Endpoints.sounds.list}?q=${encodeURIComponent(q.trim())}`,
      );
      setTracks(Array.isArray(res.data) ? res.data.map(mapSound) : FALLBACK_TRACKS);
    } catch {
      setTracks(FALLBACK_TRACKS);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'popular') { loadPopular(); }
  }, [tab]);

  useEffect(() => {
    if (tab === 'search') {
      const timer = setTimeout(() => searchOnline(search), 400);
      return () => clearTimeout(timer);
    }
  }, [search, tab]);

  const handleSelect = (track: OnlineTrack) => {
    stopPreview();
    onSelectOnline(track.url, track.title);
    apiClient.post(Endpoints.sounds.use(track.id)).catch(() => {});
  };

  return (
    <View style={[sp.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[sp.header, { paddingTop: insets.top + 14, borderBottomColor: colors.border ?? '#eee' }]}>
        <TouchableOpacity onPress={onGoBack} style={sp.headerBtn}>
          <Icon name="arrow-left" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[sp.headerTitle, { color: colors.textPrimary }]}>Ajouter un son</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[sp.tabRow, { borderBottomColor: colors.divider ?? colors.border }]}>
        {([
          { key: 'popular' as SoundTab, icon: 'trending-up', label: 'Populaires' },
          { key: 'search'  as SoundTab, icon: 'search',       label: 'Rechercher' },
          { key: 'local'   as SoundTab, icon: 'smartphone',   label: 'Mes fichiers' },
        ]).map(({ key: t, icon, label }) => {
          const active = tab === t;
          return (
            <TouchableOpacity key={t} style={[sp.tab, active && sp.tabActive]} onPress={() => setTab(t)} activeOpacity={0.7}>
              <Icon name={icon} size={16} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[sp.tabLabel, { color: active ? colors.primary : colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Popular / Search list */}
      {(tab === 'popular' || tab === 'search') && (
        <View style={{ flex: 1 }}>
          {tab === 'search' && (
            <View style={[sp.searchRow, { backgroundColor: colors.inputBg ?? colors.backgroundSecondary, borderColor: colors.border }]}>
              <Icon name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={[sp.searchInput, { color: colors.textPrimary }]}
                placeholder="Titre, artiste..."
                placeholderTextColor={colors.textDisabled ?? colors.textTertiary}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                autoFocus
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="x" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          )}
          {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />}
          <FlatList
            data={tracks}
            keyExtractor={t => t.id}
            renderItem={({ item }) => {
              const mins = Math.floor(item.duration / 60);
              const secs = Math.floor(item.duration % 60);
              const isPlaying = playingId === item.id;
              const isLoading = loadingId === item.id;
              return (
                <TouchableOpacity
                  style={[sp.trackRow, { borderBottomColor: colors.divider ?? colors.border }]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={[sp.trackThumb, { backgroundColor: colors.backgroundSecondary ?? '#1a1a2e' }]}>
                    <MaterialIcon name={isPlaying ? 'music-note-eighth' : 'music-note'} size={18} color={colors.primary} />
                  </View>
                  <View style={sp.trackInfo}>
                    <Text style={[sp.trackTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[sp.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.artist}{(item.usage_count ?? 0) > 0 ? ` · ${item.usage_count} utilisations` : ''}
                    </Text>
                  </View>
                  {item.duration > 0 && (
                    <Text style={[sp.trackDur, { color: colors.textTertiary }]}>{mins}:{String(secs).padStart(2, '0')}</Text>
                  )}
                  <TouchableOpacity
                    style={[sp.trackPlayBtn, { backgroundColor: isPlaying ? colors.primary + '33' : (colors.backgroundSecondary ?? 'rgba(255,255,255,0.1)') }]}
                    onPress={() => togglePreview(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {isLoading
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Icon name={isPlaying ? 'pause' : 'play'} size={14} color={colors.primary} />
                    }
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              !loading ? (
                <View style={sp.empty}>
                  <MaterialIcon name="music-note-off" size={36} color={colors.textTertiary} />
                  <Text style={[sp.emptyText, { color: colors.textTertiary }]}>
                    {tab === 'search' && !search.trim() ? 'Tapez pour rechercher' : 'Aucun résultat'}
                  </Text>
                </View>
              ) : null
            }
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
          />
        </View>
      )}

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
