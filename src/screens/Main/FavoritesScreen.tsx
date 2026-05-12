import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  Image, StyleSheet, StatusBar,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { saveService } from '../../services';

type Tab = 'events' | 'concerts' | 'reels' | 'posts' | 'communities';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'events',      label: 'Evenements', icon: 'calendar'      },
  { key: 'concerts',    label: 'Concerts',   icon: 'music'          },
  { key: 'reels',       label: 'Reels',      icon: 'play-circle'    },
  { key: 'posts',       label: 'Posts',      icon: 'file-text'      },
  { key: 'communities', label: 'Communautes',icon: 'users'          },
];

export const FavoritesScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [tab, setTab]   = useState<Tab>('events');
  const [data, setData] = useState<any[]>([]);

  const refresh = useCallback(() => {
    switch (tab) {
      case 'events':      setData(saveService.getSavedEvents());       break;
      case 'concerts':    setData(saveService.getSavedConcerts());     break;
      case 'reels':       setData(saveService.getSavedReels());        break;
      case 'posts':       setData(saveService.getSavedPosts());        break;
      case 'communities': setData(saveService.getSavedCommunities());  break;
    }
  }, [tab]);

  useFocusEffect(refresh);

  const handleRemove = (id: string) => {
    switch (tab) {
      case 'events':      saveService.unsaveEvent(id);       break;
      case 'concerts':    saveService.unsaveConcert(id);     break;
      case 'reels':       saveService.unsaveReel(id);        break;
      case 'posts':       saveService.unsavePost(id);        break;
      case 'communities': saveService.unsaveCommunity(id);   break;
    }
    refresh();
  };

  const handlePress = (item: any) => {
    switch (tab) {
      case 'events':      nav.navigate('EventDetail',    { eventId:     item.id }); break;
      case 'concerts':    nav.navigate('ConcertDetail',  { concertId:   item.id }); break;
      case 'reels':       nav.navigate('ReelDetail',     { reelId:      item.id }); break;
      case 'posts':       nav.navigate('PostDetail',     { postId:      item.id }); break;
      case 'communities': nav.navigate('CommunityChat',  { communityId: item.id, communityName: item.name }); break;
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
    return '';
  };

  const currentTab = TABS.find(t => t.key === tab)!;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Favoris</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Onglets */}
      <View style={[styles.tabsWrap, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <FlatList
          data={TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={t => t.key}
          contentContainerStyle={styles.tabsList}
          renderItem={({ item: t }) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                style={[styles.tabBtn, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.7}
              >
                <Icon name={t.icon} size={14} color={active ? colors.primary : colors.textTertiary} />
                <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.textTertiary, fontWeight: active ? '700' : '400' }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Liste */}
      <FlatList
        data={data}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name={currentTab.icon} size={44} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              Aucun favori dans {currentTab.label}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const thumb = getThumb(item);
          const title = getTitle(item);
          const sub   = getSub(item);
          return (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
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
            </Animated.View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root:         { flex: 1 },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700' },

  tabsWrap:     { borderBottomWidth: StyleSheet.hairlineWidth },
  tabsList:     { paddingHorizontal: 8 },
  tabBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
  tabLabel:     { fontSize: 13 },

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
