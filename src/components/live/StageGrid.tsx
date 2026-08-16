/**
 * StageGrid — grille adaptative pour l'écran live multi-participants, utilisée
 * quand le host n'a épinglé personne en plein écran (spotlight synchronisé,
 * cf. HostVideoView/MultiVideoView + pinned_identity côté backend).
 *
 * Remplace l'ancien comportement "1 spotlight fixe + bandeau scroll" par une
 * disposition qui s'adapte au nombre réel de participants : 1 → plein écran,
 * 2 → deux cases empilées, 3-4 → grille 2×2, 5-6 → grille 2×3, au-delà →
 * grille 3 colonnes qui scroll verticalement. Toutes les tuiles ont le même
 * poids visuel (pas de hiérarchie "principal vs miniature") tant que le host
 * n'a explicitement épinglé personne — cf. StageTileRow.tsx pour la variante
 * "1 spotlight + bandeau", conservée et utilisée quand pinned_identity est défini.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import { VideoTrack } from '@livekit/react-native';
import Icon from 'react-native-vector-icons/Feather';
import type { StageBadge, StageTile } from './StageTileRow';

const Av: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <View style={[st.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{(name || '?')[0].toUpperCase()}</Text>
  </View>
);

const MicDot: React.FC<{ micOn: boolean; isSpeaking?: boolean; size: number }> = ({ micOn, isSpeaking, size }) => {
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
    <Animated.View style={[st.micDot, { width: size, height: size, borderRadius: size / 2 }, animStyle, isSpeaking && micOn && st.micDotSpeaking]}>
      <Icon name={micOn ? 'mic' : 'mic-off'} size={size * 0.55} color={micOn ? '#fff' : '#F0365A'} />
    </Animated.View>
  );
};

/**
 * Calcule (colonnes, lignes visibles avant scroll) selon le nombre de
 * participants — priorise toujours remplir la largeur avant d'empiler
 * verticalement, pour garder des cases aussi grandes que possible.
 */
function gridShape(count: number): { columns: number } {
  if (count <= 1) return { columns: 1 };
  if (count === 2) return { columns: 1 };  // empilées verticalement, chacune large
  if (count <= 4) return { columns: 2 };
  if (count <= 6) return { columns: 2 };
  return { columns: 3 };
}

export const StageGrid: React.FC<{
  tiles: StageTile[];
  onTapTile?:       (identity: string) => void;
  onLongPressTile?: (identity: string) => void;
  onPin?:           (identity: string) => void; // host uniquement — épingle en plein écran pour tous
  canPin?:          boolean;
}> = ({ tiles, onTapTile, onLongPressTile, onPin, canPin }) => {
  const { width, height } = useWindowDimensions();
  const { columns } = gridShape(tiles.length);
  const rows = Math.ceil(tiles.length / columns);

  const GAP = 6;
  const availableW = width - GAP * (columns + 1);
  const availableH = height - GAP * (rows + 1);
  const tileW = availableW / columns;
  // Cap la hauteur pour ne pas étirer des tuiles géantes quand il y a peu de
  // monde (ex: 2 participants sur un grand écran) — garde un ratio proche
  // du portrait mobile plutôt que de remplir tout l'écran verticalement.
  const tileH = Math.min(availableH / rows, tileW * 1.35);

  return (
    <View style={[st.grid, { padding: GAP, gap: GAP }]}>
      {tiles.map(tile => (
        <TouchableOpacity
          key={tile.identity}
          style={[
            st.tile,
            { width: tileW, height: tileH },
            tile.badge === 'host' && st.tileHost,
            tile.isSpeaking && st.tileSpeaking,
          ]}
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
                  : <Av name={tile.name} size={Math.min(tileW, tileH) * 0.32} />
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
            <MicDot micOn={tile.micOn} isSpeaking={tile.isSpeaking} size={18} />
          )}

          {/* Épingler en plein écran pour tous — visible du host seulement */}
          {canPin && onPin && (
            <TouchableOpacity
              style={st.pinBtn}
              onPress={() => onPin(tile.identity)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="maximize" size={13} color="#fff" />
            </TouchableOpacity>
          )}

          <View style={st.nameRow}>
            <Text style={st.tileName} numberOfLines={1}>{tile.name}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },

  tile: {
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(20,16,31,0.35)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  tileHost: { borderColor: '#F0365A' },
  tileSpeaking: { borderColor: '#3FEDB6' },
  noCam: { justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: '#9B65F5', alignItems: 'center', justifyContent: 'center' },

  hostPill: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: 'rgba(240,54,90,0.9)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  hostPillText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  micDot: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  micDotSpeaking: { backgroundColor: 'rgba(63,237,182,0.55)' },

  pinBtn: {
    position: 'absolute', bottom: 6, right: 6,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  nameRow: {
    position: 'absolute', bottom: 6, left: 6, right: 36,
  },
  tileName: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
