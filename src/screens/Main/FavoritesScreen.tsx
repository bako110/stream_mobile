import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader } from '../../components/common';
import { saveService } from '../../services';

export const FavoritesScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, fontSize } = theme;
  const nav = useNavigation<any>();
  const [tab, setTab]     = useState<'events' | 'concerts' | 'reels'>('events');
  const [data, setData]   = useState<any[]>([]);

  const refresh = useCallback(() => {
    if (tab === 'events')   setData(saveService.getSavedEvents());
    if (tab === 'concerts') setData(saveService.getSavedConcerts());
    if (tab === 'reels')    setData(saveService.getSavedReels?.() ?? []);
  }, [tab]);

  // Reload quand l'écran revient au premier plan ou quand le tab change
  useFocusEffect(refresh);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Favoris" variant="default" />

      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        {(['events', 'concerts', 'reels'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: tab === t ? '700' : '400', color: tab === t ? colors.primary : colors.textSecondary }}>
              {t === 'events' ? '📅 Evénem.' : t === 'concerts' ? '🎵 Concerts' : '🎥 Reels'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={data}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Icon name="star" size={44} color={colors.textTertiary} />
            <Text style={{ color: colors.textTertiary, marginTop: 12 }}>Aucun favori sauvegardé</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                if (tab === 'events')   nav.navigate('EventDetail',  { eventId:   item.id });
                if (tab === 'concerts') nav.navigate('ConcertDetail',{ concertId: item.id });
              }}
              activeOpacity={0.8}
            >
              {item.thumbnail_url ? (
                <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name={tab === 'events' ? 'calendar' : tab === 'concerts' ? 'music' : 'video'} size={22} color={colors.textTertiary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>
                  {item.title ?? item.caption ?? 'Sans titre'}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 3 }}>
                  {item.venue_city ?? item.location ?? ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (tab === 'events')   saveService.unsaveEvent(item.id);
                  if (tab === 'concerts') saveService.unsaveConcert(item.id);
                  if (tab === 'reels')    saveService.unsaveReel(item.id);
                  refresh();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="x" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </TouchableOpacity>
          </Animated.View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  tabs:  { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:   { flex: 1, alignItems: 'center', paddingVertical: 12 },
  center:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, borderWidth: 1 },
  thumb: { width: 54, height: 54, borderRadius: 10 },
});
