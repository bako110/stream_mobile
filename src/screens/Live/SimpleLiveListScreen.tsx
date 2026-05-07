/**
 * SimpleLiveListScreen — Liste des lives spontanés actifs.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, RefreshControl,
  StyleSheet, StatusBar, Platform, Dimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { liveService, type LiveStream } from '../../services/liveService';
import type { MainStackParamList } from '../../navigation/MainNavigator';

type Nav = NativeStackNavigationProp<MainStackParamList>;
const { width: W } = Dimensions.get('window');
const CARD_W = (W - 48) / 2;

export const SimpleLiveListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<Nav>();
  const { currentUser } = useUser();

  const [lives, setLives] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await liveService.getLives();
      setLives(data);
    } catch { /* silencieux */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const iv = setInterval(() => { liveService.getLives().then(d => setLives(d)).catch(() => {}); }, 15_000);
    return () => clearInterval(iv);
  }, []);

  const handlePress = (live: LiveStream) => {
    const isHost = currentUser?.id === live.user_id;
    if (isHost) {
      nav.navigate('SimpleLiveStream', { liveId: live.id });
    } else {
      nav.navigate('SimpleLiveViewer', { liveId: live.id });
    }
  };

  const renderCard = ({ item, index }: { item: LiveStream; index: number }) => {
    const user = item.user;
    const name = user?.display_name ?? user?.username ?? 'Utilisateur';
    const initial = name[0]?.toUpperCase() ?? '?';
    const elapsed = Math.floor((Date.now() - new Date(item.started_at).getTime()) / 1000);
    const elapsedStr = elapsed < 3600
      ? `${Math.floor(elapsed / 60)}m`
      : `${Math.floor(elapsed / 3600)}h`;

    return (
      <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
        <TouchableOpacity
          style={[st.card, { backgroundColor: colors.surface }]}
          activeOpacity={0.85}
          onPress={() => handlePress(item)}
        >
          <View style={st.thumbWrap}>
            {item.thumbnail_url ? (
              <Image source={{ uri: item.thumbnail_url }} style={st.thumb} />
            ) : (
              <LinearGradient
                colors={['#F0365A', '#E0389A']}
                style={[st.thumb, st.thumbCenter]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Icon name="radio" size={32} color="#fff" />
              </LinearGradient>
            )}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFill} />

            {/* LIVE badge */}
            <View style={st.liveBadge}>
              <View style={st.liveDot} />
              <Text style={st.liveBadgeText}>LIVE</Text>
            </View>

            {/* Viewers */}
            <View style={st.viewerBadge}>
              <Icon name="eye" size={11} color="#fff" />
              <Text style={st.viewerText}>{item.current_viewers}</Text>
            </View>

            {/* Duration */}
            <View style={st.durationBadge}>
              <Text style={st.durationText}>{elapsedStr}</Text>
            </View>
          </View>

          <View style={st.info}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={st.avatar} />
              ) : (
                <View style={[st.avatar, st.avatarFallback]}>
                  <Text style={{ color: '#F0365A', fontWeight: '800', fontSize: 11 }}>{initial}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[st.title, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[st.username, { color: colors.textSecondary }]} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={st.headerDot} />
          <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Lives</Text>
        </View>
        <TouchableOpacity
          style={st.goLiveBtn}
          onPress={() => nav.navigate('GoLive')}
        >
          <Icon name="radio" size={14} color="#fff" />
          <Text style={st.goLiveBtnText}>Go Live</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.loadingCenter}>
          <Icon name="radio" size={40} color={colors.textTertiary} />
          <Text style={[{ color: colors.textTertiary, marginTop: 12, fontSize: 14 }]}>Chargement...</Text>
        </View>
      ) : (
        <FlatList
          data={lives}
          keyExtractor={l => l.id}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={st.row}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Animated.View entering={FadeIn} style={st.empty}>
              <View style={[st.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
                <Icon name="radio" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Aucun live en cours</Text>
              <Text style={[st.emptyDesc, { color: colors.textTertiary }]}>
                Sois le premier à démarrer un live !
              </Text>
              <TouchableOpacity style={st.startBtn} onPress={() => nav.navigate('GoLive')}>
                <Icon name="radio" size={16} color="#fff" />
                <Text style={st.startBtnText}>Démarrer un live</Text>
              </TouchableOpacity>
            </Animated.View>
          }
        />
      )}
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 56,
    paddingBottom: 12,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F0365A' },
  goLiveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F0365A',
  },
  goLiveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { gap: 12, marginBottom: 12, paddingHorizontal: 4 },
  card: {
    width: CARD_W, borderRadius: 16, overflow: 'hidden',
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8,
  },
  thumbWrap: { width: '100%', aspectRatio: 3 / 4, position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  thumbCenter: { alignItems: 'center', justifyContent: 'center' },
  liveBadge: {
    position: 'absolute', top: 9, left: 9,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0365A', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  viewerBadge: {
    position: 'absolute', top: 9, right: 9,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
  },
  viewerText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  durationBadge: {
    position: 'absolute', bottom: 7, right: 9,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
  durationText: { color: '#fff', fontSize: 10 },
  info: { padding: 9, gap: 5 },
  avatar: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden' },
  avatarFallback: { backgroundColor: '#F0365A20', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 12, fontWeight: '700' },
  username: { fontSize: 11 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0365A', borderRadius: 24,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
