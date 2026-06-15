import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { socialService } from '../../services/socialService';

type Friend = {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
};

interface Props {
  entityType: 'reel' | 'event' | 'concert' | 'post' | 'content';
  entityId: string;
  totalLikes: number;
  onPressLikers?: () => void;
  lightText?: boolean; // pour fond sombre (reels)
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')} K`;
  return String(n);
}

export const FriendsWhoLiked: React.FC<Props> = ({ entityType, entityId, totalLikes, onPressLikers, lightText }) => {
  const { theme: { colors } } = useTheme();
  const textColor = lightText ? 'rgba(255,255,255,0.85)' : colors.textSecondary;
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    if (totalLikes === 0) { setFriends([]); return; }
    const params: Record<string, string> = { [`${entityType}_id`]: entityId };
    socialService.getFriendsWhoLiked(params as any).then(setFriends).catch(() => {});
  }, [entityType, entityId, totalLikes]);

  if (totalLikes === 0) return null;

  const others = Math.max(0, totalLikes - friends.length);
  const friendNames = friends.map(f => f.display_name ?? f.username ?? '');

  let label = '';
  if (friends.length === 0) {
    label = `${fmtCount(totalLikes)} personne${totalLikes > 1 ? 's' : ''} aiment ceci`;
  } else if (friends.length === 1 && others === 0) {
    label = `${friendNames[0]} aime ceci`;
  } else if (friends.length === 1) {
    label = `${friendNames[0]} et ${fmtCount(others)} autre${others > 1 ? 's' : ''} aiment ceci`;
  } else if (friends.length >= 2 && others === 0) {
    label = `${friendNames[0]} et ${friendNames[1]} aiment ceci`;
  } else {
    label = `${friendNames[0]} et ${fmtCount(totalLikes - 1)} autre${totalLikes - 1 > 1 ? 's' : ''} aiment ceci`;
  }

  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPressLikers} disabled={!onPressLikers}>
      {friends.slice(0, 3).map((f, i) => (
        <View key={f.id} style={[s.avatarWrap, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]}>
          {f.avatar_url ? (
            <Image source={{ uri: f.avatar_url }} style={s.avatar} />
          ) : (
            <View style={[s.avatarFallback, { backgroundColor: colors.primary + '55' }]}>
              <Text style={[s.avatarInitial, { color: colors.primary }]}>
                {(f.display_name ?? f.username ?? '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      ))}
      {friends.length === 0 && (
        <View style={[s.avatarWrap, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[s.avatarInitial, { color: colors.textTertiary }]}>♥</Text>
        </View>
      )}
      <Text style={[s.label, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarWrap:    { width: 22, height: 22, borderRadius: 11, overflow: 'hidden', borderWidth: 1.5, borderColor: '#fff' },
  avatar:        { width: '100%', height: '100%' },
  avatarFallback:{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 9, fontWeight: '700' },
  label:         { fontSize: 12, flex: 1 },
});
