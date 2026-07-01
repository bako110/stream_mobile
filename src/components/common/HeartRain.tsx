import React, { useEffect, useState, useRef } from 'react';
import { View, Image, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Pluie de cœurs — se déclenche une fois à l'arrivée sur un contenu très aimé ──
export const HEART_RAIN_THRESHOLD = 1000;
const HEART_RAIN_COUNT  = 24;
const HEART_RAIN_COLORS = ['#7B3FF2', '#E0389A', '#F0365A', '#A855F7'];

// Évite de rejouer l'effet si l'utilisateur revient sur le même contenu dans la session
const _heartRainPlayed = new Set<string>();

interface Drop { id: number; left: number; delay: number; duration: number; size: number; color: string }

function FallingHeart({ drop }: { drop: Drop }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      drop.delay * 1000,
      withTiming(1, { duration: drop.duration * 1000, easing: Easing.in(Easing.quad) }),
    );
  }, [drop.delay, drop.duration]); // eslint-disable-line

  const style = useAnimatedStyle(() => {
    const travel = SCREEN_H * 1.15;
    return {
      transform: [
        { translateY: progress.value * travel },
        { rotate: `${progress.value * 35}deg` },
      ],
      opacity: progress.value < 0.08 ? progress.value / 0.08 : progress.value > 0.85 ? (1 - progress.value) / 0.15 : 0.85,
    };
  });

  return (
    <Animated.View style={[{ position: 'absolute', left: drop.left, top: -40 }, style]}>
      <Icon name="heart" size={drop.size} color={drop.color} />
    </Animated.View>
  );
}

export function HeartRain({ active, likeCount, contentId }: { active: boolean; likeCount: number; contentId: string }) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!active || likeCount < HEART_RAIN_THRESHOLD || _heartRainPlayed.has(contentId)) return;
    _heartRainPlayed.add(contentId);
    setDrops(Array.from({ length: HEART_RAIN_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * (SCREEN_W - 30),
      delay: Math.random() * 0.5,
      duration: 2.2 + Math.random() * 1.2,
      size: 18 + Math.random() * 20,
      color: HEART_RAIN_COLORS[i % HEART_RAIN_COLORS.length],
    })));
    setPlaying(true);
    const t = setTimeout(() => setPlaying(false), 3800);
    return () => clearTimeout(t);
  }, [active, likeCount, contentId]);

  if (!playing) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {drops.map(d => <FallingHeart key={d.id} drop={d} />)}
    </View>
  );
}

// ── Avatars des derniers utilisateurs à avoir liké — coin bas-gauche, style TikTok ──
interface RecentLiker { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; }
const _recentLikersCache = new Map<string, RecentLiker[]>();

export function RecentLikersAvatars({ active, likeCount, contentId, kind }: {
  active: boolean; likeCount: number; contentId: string; kind: 'reel' | 'story';
}) {
  const [likers, setLikers] = useState<RecentLiker[]>(() => _recentLikersCache.get(contentId) ?? []);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!active || likeCount < HEART_RAIN_THRESHOLD || fetchedRef.current) return;
    fetchedRef.current = true;
    const url = kind === 'reel'
      ? `${Endpoints.social.reactionUsers}?reel_id=${contentId}&limit=3`
      : `${Endpoints.stories.likers(contentId)}?limit=3`;
    apiClient.get<RecentLiker[]>(url)
      .then(r => {
        const data = Array.isArray(r.data) ? r.data.slice(0, 3) : [];
        _recentLikersCache.set(contentId, data);
        setLikers(data);
      })
      .catch(() => {});
  }, [active, likeCount, contentId, kind]);

  if (likers.length === 0) return null;

  return (
    <View style={s.row} pointerEvents="none">
      {likers.map((u, i) => (
        <View key={u.id} style={[s.avatarWrap, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]}>
          {u.avatar_url ? (
            <Image source={{ uri: u.avatar_url }} style={s.avatar} />
          ) : (
            <View style={s.avatarFallback}>
              <Text style={s.avatarInitial}>{(u.display_name ?? u.username ?? '?')[0]?.toUpperCase()}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { position: 'absolute', bottom: 90, left: 12, flexDirection: 'row', zIndex: 5 },
  avatarWrap: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7B3FF2' },
  avatarInitial: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
