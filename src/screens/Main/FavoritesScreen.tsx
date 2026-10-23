import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  Image, StyleSheet, StatusBar, Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { favoriteService } from '../../services/favoriteService';
import type { FavoriteType } from '../../services/favoriteService';
import { BackButton, GofolyxLoader } from '../../components/common';

type Tab = 'events' | 'concerts' | 'reels' | 'posts' | 'communities' | 'films' | 'series';

const TAB_TO_TYPE: Record<Tab, FavoriteType> = {
  events:      'event',
  concerts:    'concert',
  reels:       'reel',
  posts:       'post',
  communities: 'community',
  films:       'film',
  series:      'serie',
};

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'events',      label: 'Evenements', icon: 'calendar'      },
  { key: 'concerts',    label: 'Concerts',   icon: 'music'          },
  { key: 'films',       label: 'Films',      icon: 'film'           },
  { key: 'series',      label: 'Series',     icon: 'tv'             },
  { key: 'reels',       label: 'Reels',      icon: 'play-circle'    },
  { key: 'posts',       label: 'Posts',      icon: 'file-text'      },
  { key: 'communities', label: 'Communautes',icon: 'users'          },
];

// Convertit un FavoriteOut (API) en objet utilisable par les helpers getThumb/getTitle/getSub
function fromApi(fav: Awaited<ReturnType<typeof favoriteService.list>>[number]): any {
  return {
    id:            fav.target_id,
    title:         fav.target_title,
    name:          fav.target_title,
    caption:       fav.target_title,
    thumbnail_url: fav.target_thumbnail,
    avatar_url:    fav.target_thumbnail,
    cover_url:     fav.target_thumbnail,
    description:   fav.target_subtitle,
    venue_city:    fav.target_subtitle,
    artist_name:   fav.target_subtitle,
    _favId:        fav.id,
  };
}

export const FavoritesScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [tab, setTab]       = useState<Tab>('events');
  const [data, setData]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTabsSheet, setShowTabsSheet] = useState(false);

  const tabRef = useRef(tab);
  tabRef.current = tab;

  const lastLoadedAtRef = useRef<number>(0);
  const didMountRef     = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const favs = await favoriteService.list(TAB_TO_TYPE[tabRef.current]);
      const mapped = Array.isArray(favs) ? favs.map(fromApi) : [];
      setData(mapped);
      lastLoadedAtRef.current = Date.now();
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      refresh();
      return;
    }
    const age = Date.now() - lastLoadedAtRef.current;
    if (age > 60_000) refresh(true);
  }, [refresh]));

  useEffect(() => {
    if (!didMountRef.current) return;
    refresh();
  }, [tab]);

  const handleRemove = async (id: string) => {
    try {
      await favoriteService.unsave(TAB_TO_TYPE[tab], id);
      setData(prev => prev.filter(i => i.id !== id));
    } catch {}
  };

  const handlePress = (item: any) => {
    switch (tab) {
      case 'events':      nav.navigate('EventDetail',    { eventId:     item.id }); break;
      case 'concerts':    nav.navigate('ConcertDetail',  { concertId:   item.id }); break;
      case 'reels':       nav.navigate('ReelDetail',     { reelId:      item.id }); break;
      case 'posts':       nav.navigate('PostDetail',     { postId:      item.id }); break;
      case 'communities': nav.navigate('CommunityChat',  { communityId: item.id, communityName: item.name }); break;
      case 'films':       nav.navigate('FilmDetail',     { item: { id: item.id, type: 'film',  title: item.title, thumbnail_url: item.thumbnail_url } }); break;
      case 'series':      nav.navigate('FilmDetail',     { item: { id: item.id, type: 'serie', title: item.title, thumbnail_url: item.thumbnail_url } }); break;
    }
  };

  const getThumb = (item: any): string | null => {
    return item.thumbnail_url ?? item.cover_url ?? item.avatar_url ?? item.media_urls?.[0] ?? null;
  };

  const getTitle = (item: any): string => {
    return item.title ?? item.name ?? item.caption ?? 'Sans titre';
  };

  const getSub = (item: any): string => {
    if (tab === 'events')      return item.venue_city ?? item.location ?? '';
    if (tab === 'concerts')    return item.venue_city ?? item.artist_name ?? '';
    if (tab === 'reels')       return item.views_count != null ? `${item.views_count} vues` : '';
    if (tab === 'posts')       return item.author?.display_name ?? item.author?.username ?? '';
    if (tab === 'communities') return item.members_count != null ? `${item.members_count} membres` : (item.description ?? '');
    if (tab === 'films')       return item.description ? `${item.description}` : '';
    if (tab === 'series')      return item.description ? `Série · ${item.description}` : 'Série';
    return '';
  };

  const currentTab = TABS.find(t => t.key === tab)!;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
      />

      {/* Header — carte flottante (même design que le reste de l'app).
          paddingTop (status bar) isolé sur un wrapper externe transparent —
          le mélanger au style de la carte ferait apparaître un coin visible
          sous la status bar. */}
      <View style={{ paddingTop: insets.top + 8 }}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => nav.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{currentTab.label}</Text>
          <TouchableOpacity
            onPress={() => setShowTabsSheet(true)}
            style={styles.menuBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="more-vertical" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom sheet — catégories en liste verticale, ouvert via l'icône
          "..." du header (remplace les onglets fixes sous le header). */}
      <Modal
        visible={showTabsSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTabsSheet(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowTabsSheet(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.divider }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Catégories</Text>
            <FlatList
              data={TABS}
              keyExtractor={t => t.key}
              contentContainerStyle={styles.sheetTabsList}
              renderItem={({ item: t }) => {
                const active = tab === t.key;
                return (
                  <TouchableOpacity
                    style={[
                      styles.sheetTabBtn,
                      { backgroundColor: active ? colors.primary + '18' : colors.backgroundSecondary, borderColor: active ? colors.primary : colors.divider },
                    ]}
                    onPress={() => { setTab(t.key); setShowTabsSheet(false); }}
                    activeOpacity={0.8}
                  >
                    <Icon name={t.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.sheetTabLabel, { color: active ? colors.primary : colors.textPrimary, fontWeight: active ? '700' : '600' }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Liste */}
      {loading ? (
        <View style={styles.empty}>
          <GofolyxLoader color={colors.primary} />
        </View>
      ) : null}
      <FlatList
        data={loading ? [] : data}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Icon name={currentTab.icon} size={44} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Aucun favori dans {currentTab.label}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const thumb = getThumb(item);
          const title = getTitle(item);
          const sub   = getSub(item);
          return (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handlePress(item)}
              activeOpacity={0.8}
            >
                {/* Thumbnail */}
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: colors.backgroundSecondary }]}>
                    <Icon name={currentTab.icon} size={20} color={colors.textTertiary} />
                  </View>
                )}

                {/* Infos */}
                <View style={styles.info}>
                  <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
                  {!!sub && (
                    <Text style={[styles.sub, { color: colors.textTertiary }]} numberOfLines={1}>{sub}</Text>
                  )}
                  <View style={[styles.typePill, { backgroundColor: colors.primary + '18' }]}>
                    <Icon name={currentTab.icon} size={10} color={colors.primary} />
                    <Text style={[styles.typeLabel, { color: colors.primary }]}>{currentTab.label}</Text>
                  </View>
                </View>

                {/* Supprimer */}
                <TouchableOpacity
                  onPress={() => handleRemove(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={[styles.removeBtn, { backgroundColor: colors.backgroundSecondary }]}
                >
                  <Icon name="bookmark" size={16} color={colors.primary} />
                </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root:         { flex: 1 },

  header:       {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    marginHorizontal: 10, marginBottom: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  menuBtn:      { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  // Bottom sheet — catégories en liste verticale
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingBottom: 28 },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle:   { fontSize: 16, fontWeight: '800', paddingHorizontal: 20, marginBottom: 12 },
  sheetTabsList:{ paddingHorizontal: 16, gap: 8 },
  sheetTabBtn:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  sheetTabLabel:{ fontSize: 15 },

  list:         { padding: 16, gap: 10 },

  empty:        { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText:    { fontSize: 14 },

  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  thumb:        { width: 58, height: 58, borderRadius: 10 },
  thumbFallback:{ alignItems: 'center', justifyContent: 'center' },
  info:         { flex: 1, gap: 4 },
  title:        { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  sub:          { fontSize: 12 },
  typePill:     { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, marginTop: 2 },
  typeLabel:    { fontSize: 10, fontWeight: '700' },
  removeBtn:    { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
