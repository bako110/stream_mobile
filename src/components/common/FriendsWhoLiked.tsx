import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { socialService } from '../../services/socialService';

type Friend = {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
};

interface Props {
  entityType: 'reel' | 'event' | 'concert' | 'post' | 'content';
  entityId: string;
  totalLikes: number;
  onPressLikers?: () => void;
  lightText?: boolean;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString('fr')} K`;
  return n.toLocaleString('fr');
}

// Cache simple en mémoire pour éviter de refetch à chaque render
const _cache = new Map<string, Friend[]>();

export const FriendsWhoLiked: React.FC<Props> = ({
  entityType, entityId, totalLikes, onPressLikers, lightText,
}) => {
  const { theme: { colors, isDark } } = useTheme();
  const textColor = lightText ? 'rgba(255,255,255,0.85)' : colors.textSecondary;
  const borderColor = lightText || isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.1)';

  const [friends, setFriends] = useState<Friend[]>(() => _cache.get(`${entityType}:${entityId}`) ?? []);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (totalLikes === 0 || fetchedRef.current) return;
    const cacheKey = `${entityType}:${entityId}`;
    if (_cache.has(cacheKey)) {
      setFriends(_cache.get(cacheKey)!);
      fetchedRef.current = true;
      return;
    }
    fetchedRef.current = true;
    const params: Record<string, string> = { [`${entityType}_id`]: entityId };
    socialService.getFriendsWhoLiked(params as any)
      .then(data => {
        _cache.set(cacheKey, data);
        setFriends(data);
      })
      .catch(() => {});
  }, [entityType, entityId, totalLikes]);

  if (totalLikes === 0) return null;

  const names = friends.map(f => f.display_name ?? f.username ?? '');
  const others = Math.max(0, totalLikes - friends.length);

  let label = '';
  if (friends.length === 0) {
    label = `${fmtCount(totalLikes)} personne${totalLikes > 1 ? 's' : ''} aime${totalLikes > 1 ? 'nt' : ''} ceci`;
  } else if (friends.length === 1 && others === 0) {
    label = `${names[0]} aime ceci`;
  } else if (friends.length === 1) {
    label = `${names[0]} et ${fmtCount(others)} autre${others > 1 ? 's' : ''} aiment ceci`;
  } else if (friends.length >= 2 && others === 0) {
    label = `${names[0]} et ${names[1]} aiment ceci`;
  } else {
    label = `${names[0]} et ${fmtCount(totalLikes - 1)} autre${totalLikes > 2 ? 's' : ''} aiment ceci`;
  }

  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={onPressLikers ? 0.7 : 1}
      onPress={onPressLikers}
      disabled={!onPressLikers}
    >
      {/* Avatars empilés */}
      {friends.length > 0 && (
        <View style={s.avatarsWrap}>
          {friends.slice(0, 3).map((f, i) => (
            <View
              key={f.id}
              style={[
                s.avatarWrap,
                { left: i * 14, zIndex: 3 - i, borderColor },
              ]}
            >
              {f.avatar_url ? (
                <Image source={{ uri: f.avatar_url }} style={s.avatar} />
              ) : (
                <View style={[s.avatarFallback, { backgroundColor: colors.primary + '44' }]}>
                  <Text style={[s.avatarInitial, { color: colors.primary }]}>
                    {(f.display_name ?? f.username ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <Text style={[s.label, { color: textColor }]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const AVATAR_SIZE = 24;

const s = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarsWrap:  { width: AVATAR_SIZE + 14 * 2, height: AVATAR_SIZE, position: 'relative' },
  avatarWrap:   {
    position: 'absolute',
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden', borderWidth: 1.5,
  },
  avatar:        { width: '100%', height: '100%' },
  avatarFallback:{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 8, fontWeight: '800' },
  label:         { fontSize: 12, flex: 1, lineHeight: 16 },
});
