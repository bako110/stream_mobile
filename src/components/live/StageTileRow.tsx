/**
 * StageTileRow — Bandeau horizontal "Sur scène (N)" avec de vraies tuiles
 * vidéo (comme la maquette : chaque participant montre sa caméra en direct,
 * pas juste un avatar statique). Fonds ultra-transparents partout — la
 * couleur ne doit jamais masquer le live, seul le texte doit rester lisible.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, FadeIn } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
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

const LiveHeaderDot: React.FC = () => {
  const opacity = useSharedValue(1);
  useEffect(() => { opacity.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true); }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[st.headerDot, style]} />;
};

export const StageTileRow: React.FC<{
  tiles: StageTile[];
  onTapTile?:      (identity: string) => void;
  onLongPressTile?: (identity: string) => void;
  onInvite?: () => void;
}> = ({ tiles, onTapTile, onLongPressTile, onInvite }) => {
  return (
    <View style={st.container}>
      <View style={st.headerRow}>
        <LiveHeaderDot />
        <Text style={st.headerText}>Sur scène</Text>
        <View style={st.headerCountPill}>
          <Text style={st.headerCountText}>{tiles.length}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.row}
      >
        {tiles.map(tile => (
          <Animated.View key={tile.identity} entering={FadeIn.duration(260)}>
            <TouchableOpacity
              style={[st.tile, tile.badge === 'host' && st.tileHost, tile.isSpeaking && st.tileSpeaking]}
              onPress={onTapTile ? () => onTapTile(tile.identity) : undefined}
              onLongPress={onLongPressTile ? () => onLongPressTile(tile.identity) : undefined}
              activeOpacity={0.85}
              delayLongPress={400}
            >
              {/* Coins carrés volontaires sur ces tuiles (voir st.tile) : une
                  vidéo native LiveKit (RTCView/SurfaceView) ne respecte pas de
                  façon fiable le clipping arrondi React Native sur Android,
                  quelle que soit la combinaison essayée (overflow:hidden,
                  renderToHardwareTextureAndroid, zOrder) — un coin restait
                  visible au travers de la bordure arrondie. Carré = zéro
                  artefact possible. */}
              {tile.camOn && tile.track
                ? <VideoTrack trackRef={tile.track} style={StyleSheet.absoluteFill} mirror={tile.mirror} objectFit="cover" />
                : (
                  <View style={[StyleSheet.absoluteFill, st.noCam]}>
                    {tile.avatarUrl
                      ? <Image source={{ uri: tile.avatarUrl }} style={st.avatarImg} />
                      : <Av name={tile.name} size={36} />
                    }
                  </View>
                )
              }

              {/* Voile bas — garde le nom lisible même sur une caméra claire,
                  sans assombrir toute la tuile (contrairement à un fond plat). */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.85)']}
                locations={[0.45, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {tile.badge === 'host' && (
                <View style={st.hostPill}>
                  <Icon name="award" size={8} color="#fff" />
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
          </Animated.View>
        ))}

        {onInvite && (
          <TouchableOpacity style={st.inviteTile} onPress={onInvite} activeOpacity={0.8}>
            <View style={st.inviteIconWrap}>
              <Icon name="plus" size={16} color="rgba(255,255,255,0.9)" />
            </View>
            <Text style={st.inviteText}>Inviter</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

// ── Styles — fonds ultra-transparents, la couleur ne doit jamais masquer le live ──
const st = StyleSheet.create({
  container: { gap: 9 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  headerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F0365A' },
  headerText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerCountPill: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center',
  },
  headerCountText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 9, paddingHorizontal: 2 },

  tile: {
    // Coins carrés (borderRadius: 0) volontaire — voir le commentaire dans le
    // JSX juste au-dessus du rendu vidéo : limite native Android/LiveKit, pas
    // un choix esthétique de départ.
    width: 78, height: 104, overflow: 'hidden',
    backgroundColor: 'rgba(20,16,31,0.5)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  tileHost: { borderColor: '#F0365A' },
  tileSpeaking: { borderColor: '#3FEDB6' },
  noCam: { justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  avatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },

  // Même hauteur (17) et même logique de forme (pilule = rayon = moitié de la
  // hauteur) que micDot juste à côté — avant, hostPill avait un borderRadius
  // fixe à 6 (presque un rectangle) contre un micDot parfaitement rond,
  // incohérent visuellement sur la même ligne du coin haut de la tuile.
  hostPill: {
    position: 'absolute', top: 5, left: 5, height: 17,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(240,54,90,0.95)', borderRadius: 8.5,
    paddingHorizontal: 6,
  },
  hostPillText: { color: '#fff', fontSize: 8.5, fontWeight: '800' },

  micDot: {
    position: 'absolute', top: 5, right: 5,
    width: 17, height: 17, borderRadius: 8.5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  micDotSpeaking: {
    backgroundColor: 'rgba(63,237,182,0.65)',
  },
  badgeNumber: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(59,130,246,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeNumberText: { color: '#fff', fontSize: 8.5, fontWeight: '800' },

  nameRow: {
    position: 'absolute', bottom: 6, left: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  tileName: { color: '#fff', fontSize: 10.5, fontWeight: '700', flexShrink: 1 },

  inviteTile: {
    width: 78, height: 104, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  inviteIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  inviteText: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '600' },
});
