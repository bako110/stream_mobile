/**
 * StageTileRow — Bandeau horizontal "Sur scène (N)" avec de vraies tuiles
 * vidéo (comme la maquette : chaque participant montre sa caméra en direct,
 * pas juste un avatar statique). Fonds ultra-transparents partout — la
 * couleur ne doit jamais masquer le live, seul le texte doit rester lisible.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import { VideoTrack } from '@livekit/react-native';
import Icon from 'react-native-vector-icons/Feather';

export type StageBadge = 'host' | 'star' | number | 'bolt' | null;

// Type structurel minimal compatible avec le retour de useTracks() de LiveKit.
export type StageTrackRef = Parameters<typeof VideoTrack>[0]['trackRef'];

export interface StageTile {
  identity:   string;
  name:       string;
  track:      StageTrackRef | null;
  camOn:      boolean;
  avatarUrl?: string | null;
  mirror?:    boolean;
  badge?:     StageBadge;
  micOn?:     boolean;
  isSpeaking?: boolean;
}

const Av: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <View style={[st.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{(name || '?')[0].toUpperCase()}</Text>
  </View>
);

const MicDot: React.FC<{ micOn: boolean; isSpeaking?: boolean }> = ({ micOn, isSpeaking }) => {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isSpeaking && micOn) {
      scale.value = withRepeat(withTiming(1.25, { duration: 260 }), -1, true);
    } else {
      scale.value = withTiming(1, { duration: 150 });
    }
  }, [isSpeaking, micOn, scale]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[st.micDot, animStyle, isSpeaking && micOn && st.micDotSpeaking]}>
      <Icon name={micOn ? 'mic' : 'mic-off'} size={8} color={micOn ? '#fff' : '#F0365A'} />
    </Animated.View>
  );
};

const BadgeIcon: React.FC<{ badge: StageBadge }> = ({ badge }) => {
  if (badge === null || badge === undefined) return null;
  if (badge === 'star') return <Icon name="star" size={10} color="#F59E0B" />;
  if (badge === 'bolt') return <Icon name="zap" size={10} color="#3FEDB6" />;
  if (badge === 'host') return null; // le badge "Hôte" est un pill séparé, pas une icône
  return (
    <View style={st.badgeNumber}>
      <Text style={st.badgeNumberText}>{badge}</Text>
    </View>
  );
};

export const StageTileRow: React.FC<{
  tiles: StageTile[];
  onTapTile?:      (identity: string) => void;
  onLongPressTile?: (identity: string) => void;
  onInvite?: () => void;
}> = ({ tiles, onTapTile, onLongPressTile, onInvite }) => {
  return (
    <View style={st.container}>
      <Text style={st.headerText}>Sur scène ({tiles.length})</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.row}
      >
        {tiles.map(tile => (
          <TouchableOpacity
            key={tile.identity}
            style={[st.tile, tile.badge === 'host' && st.tileHost, tile.isSpeaking && st.tileSpeaking]}
            onPress={onTapTile ? () => onTapTile(tile.identity) : undefined}
            onLongPress={onLongPressTile ? () => onLongPressTile(tile.identity) : undefined}
            activeOpacity={0.85}
            delayLongPress={400}
          >
            {tile.camOn && tile.track
              ? <VideoTrack trackRef={tile.track} style={StyleSheet.absoluteFill} mirror={tile.mirror} objectFit="cover" />
              : (
                <View style={[StyleSheet.absoluteFill, st.noCam]}>
                  {tile.avatarUrl
                    ? <Image source={{ uri: tile.avatarUrl }} style={st.avatarImg} />
                    : <Av name={tile.name} size={32} />
                  }
                </View>
              )
            }

            {tile.badge === 'host' && (
              <View style={st.hostPill}>
                <Text style={st.hostPillText}>Hôte</Text>
              </View>
            )}

            {tile.micOn !== undefined && (
              <MicDot micOn={tile.micOn} isSpeaking={tile.isSpeaking} />
            )}

            <View style={st.nameRow}>
              <Text style={st.tileName} numberOfLines={1}>{tile.name}</Text>
              <BadgeIcon badge={tile.badge ?? null} />
            </View>
          </TouchableOpacity>
        ))}

        {onInvite && (
          <TouchableOpacity style={st.inviteTile} onPress={onInvite} activeOpacity={0.8}>
            <Icon name="plus" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={st.inviteText}>Inviter</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

// ── Styles — fonds ultra-transparents, la couleur ne doit jamais masquer le live ──
const st = StyleSheet.create({
  container: { gap: 8 },
  headerText: { color: '#fff', fontSize: 13, fontWeight: '700', paddingHorizontal: 2 },
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },

  tile: {
    width: 72, height: 96, borderRadius: 12, overflow: 'hidden',
    backgroundColor: 'rgba(20,16,31,0.35)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  tileHost: { borderColor: '#F0365A' },
  tileSpeaking: { borderColor: '#3FEDB6' },
  noCam: { justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center' },

  hostPill: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: 'rgba(240,54,90,0.9)', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 1.5,
  },
  hostPillText: { color: '#fff', fontSize: 8, fontWeight: '800' },

  micDot: {
    position: 'absolute', top: 4, right: 4,
    width: 15, height: 15, borderRadius: 7.5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  micDotSpeaking: {
    backgroundColor: 'rgba(63,237,182,0.55)',
  },
  badgeNumber: {
    width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: 'rgba(59,130,246,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeNumberText: { color: '#fff', fontSize: 8, fontWeight: '800' },

  nameRow: {
    position: 'absolute', bottom: 4, left: 4, right: 4,
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  tileName: { color: '#fff', fontSize: 10, fontWeight: '700', flexShrink: 1 },

  inviteTile: {
    width: 72, height: 96, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  inviteText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600' },
});
