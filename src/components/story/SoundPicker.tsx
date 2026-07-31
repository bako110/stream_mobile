import React, { useCallback, useEffect, useRef, useState } from 'react';
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

interface MySound {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;
}

interface Props {
  colors: AppColors;
  onGoBack: () => void;
  onSelectLocal: () => void;
  onSelectSaved: (url: string, title?: string) => void;
}

function mapSound(s: any): MySound {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist_name ?? 'Toi',
    duration: s.duration_seconds ?? 0,
    url: s.file_url,
  };
}

type Tab = 'popular' | 'search' | 'my';

/**
 * Sélection d'un son pour accompagner un reel/story :
 * - "Parcourir mes fichiers" : choisit un fichier audio du téléphone (upload
 *   immédiat au catalogue partagé côté backend, via soundService.uploadFromUri).
 * - "Populaires" (GET /sounds/popular) : accessible sans connexion, onglet par
 *   défaut — évite de dépendre uniquement de "Mes sons" (GET /sounds/my, qui
 *   exige un token valide et échouait silencieusement en 401 si absent/expiré).
 * - "Rechercher" (GET /sounds?q=...) et "Mes sons" — mêmes 3 onglets que la
 *   version web (SoundPickerSheet.tsx), pas de scan de fichiers locaux (aucune
 *   lib fiable pour ça sur RN 0.85+/New Arch).
 */
export const SoundPicker: React.FC<Props> = ({ colors, onGoBack, onSelectLocal, onSelectSaved }) => {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('popular');
  const [search, setSearch] = useState('');
  const [popular, setPopular] = useState<MySound[]>([]);
  const [searchResults, setSearchResults] = useState<MySound[]>([]);
  const [mySounds, setMySounds] = useState<MySound[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMy, setLoadingMy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const soundRef = useRef<Sound | null>(null);

  const stopPreview = useCallback(() => {
    if (soundRef.current) {
      soundRef.current.stop(() => { soundRef.current?.release(); soundRef.current = null; });
    }
    setPlayingId(null);
    setLoadingId(null);
  }, []);

  const togglePreview = useCallback((item: MySound) => {
    if (playingId === item.id) { stopPreview(); return; }
    stopPreview();
    setLoadingId(item.id);
    Sound.setCategory('Playback');
    const snd = new Sound(item.url, '', err => {
      setLoadingId(null);
      if (err) return;
      soundRef.current = snd;
      setPlayingId(item.id);
      snd.play(success => { if (!success) setPlayingId(null); });
    });
  }, [playingId, stopPreview]);

  useEffect(() => () => { stopPreview(); }, [stopPreview]);

  // Populaires — chargé une fois à l'ouverture, sans dépendre de l'auth.
  useEffect(() => {
    setLoadingPopular(true);
    apiClient.get<any[]>(Endpoints.sounds.popular)
      .then(res => setPopular(Array.isArray(res.data) ? res.data.map(mapSound) : []))
      .catch(() => setPopular([]))
      .finally(() => setLoadingPopular(false));
  }, []);

  // Mes sons — chargé seulement quand l'onglet devient actif.
  useEffect(() => {
    if (tab !== 'my') return;
    setLoadingMy(true);
    apiClient.get<any[]>(Endpoints.sounds.my)
      .then(res => setMySounds(Array.isArray(res.data) ? res.data.map(mapSound) : []))
      .catch(() => setMySounds([]))
      .finally(() => setLoadingMy(false));
  }, [tab]);

  // Recherche debounced — filtre côté serveur (titre/artiste).
  useEffect(() => {
    if (tab !== 'search') return;
    if (!search.trim()) { setSearchResults([]); return; }
    setLoadingSearch(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get<any[]>(`${Endpoints.sounds.list}?q=${encodeURIComponent(search.trim())}`);
        setSearchResults(Array.isArray(res.data) ? res.data.map(mapSound) : []);
      } catch {
        setSearchResults([]);
      } finally { setLoadingSearch(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [search, tab]);

  const sounds = tab === 'popular' ? popular : tab === 'search' ? searchResults : mySounds;
  const loading = tab === 'popular' ? loadingPopular : tab === 'search' ? loadingSearch : loadingMy;

  const handleSelect = (item: MySound) => {
    stopPreview();
    onSelectSaved(item.url, item.title);
    apiClient.post(Endpoints.sounds.use(item.id)).catch(() => {});
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

      <ScrollView style={{ flex: 0 }} contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 20 }}>
        <Animated.View entering={FadeInDown.delay(40).springify()}>
          <TouchableOpacity style={sp.localCard} onPress={onSelectLocal} activeOpacity={0.8}>
            <LinearGradient colors={['#E65100', '#FF9800']} style={sp.localCardInner}>
              <View style={sp.localIconWrap}>
                <MaterialIcon name="folder-music" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sp.localLabel}>Parcourir mes fichiers</Text>
                <Text style={sp.localSub}>MP3, M4A, AAC, WAV, OGG</Text>
              </View>
              <Icon name="chevron-right" size={18} color="rgba(255,255,255,0.85)" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Onglets Populaires / Rechercher / Mes sons */}
      <View style={[sp.tabsRow, { borderBottomColor: colors.border ?? '#eee' }]}>
        {([
          { key: 'popular' as Tab, label: 'Populaires', icon: 'trending-up' },
          { key: 'search' as Tab, label: 'Rechercher', icon: 'search' },
          { key: 'my' as Tab, label: 'Mes sons', icon: 'user' },
        ]).map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[sp.tabBtn, active && { borderBottomColor: colors.primary }]}
              onPress={() => setTab(t.key)}
            >
              <Icon name={t.icon} size={13} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[sp.tabLabel, { color: active ? colors.primary : colors.textSecondary }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Recherche — visible uniquement sur l'onglet Rechercher */}
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

      {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />}

      <FlatList
        data={sounds}
        keyExtractor={s => s.id}
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
                <Text style={[sp.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>{item.artist}</Text>
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
              <MaterialIcon name="music-note-off" size={32} color={colors.textTertiary} />
              <Text style={[sp.emptyText, { color: colors.textTertiary }]}>
                {tab === 'search'
                  ? (search.trim() ? 'Aucun résultat' : 'Tape pour rechercher')
                  : tab === 'my'
                  ? "Aucun son enregistré pour l'instant"
                  : 'Aucun son populaire disponible'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
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

  localCard: { borderRadius: 16, overflow: 'hidden' },
  localCardInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  localIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  localLabel: { fontSize: 14, fontWeight: '800', color: '#fff' },
  localSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 18, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 4 },

  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: 12, fontWeight: '700' },

  trackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trackThumb: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  trackInfo: { flex: 1, gap: 2 },
  trackTitle: { fontSize: 14, fontWeight: '600' },
  trackArtist: { fontSize: 12 },
  trackDur: { fontSize: 11, fontWeight: '500' },
  trackPlayBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
});
