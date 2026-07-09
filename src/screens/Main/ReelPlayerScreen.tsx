import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, StatusBar,
  TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import type { Reel } from '../../types';
import { FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2 } from '../Create/ReelEditorScreen';
import type { FilterKey } from '../Create/ReelEditorScreen';
import { BackButton } from '../../components/common';

const { width: SW, height: SH } = Dimensions.get('screen');

const getAuthorLabel = (author?: Reel['author']) => {
  if (!author) return 'Utilisateur';
  return author.display_name || author.username || 'Utilisateur';
};

export const ReelPlayerScreen: React.FC = () => {
  useKeepAwake();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme().theme;

  const reel: Reel = route.params?.reel;

  const [paused, setPaused] = useState(false);
  const [muted,  setMuted]  = useState(false);

  const player = useVideoPlayer(
    reel?.hls_url ? { uri: reel.hls_url } : { uri: 'about:blank' },
    p => {
      p.loop   = true;
      p.muted  = false;
      p.volume = 1.0;
    },
  );

  useEffect(() => {
    if (!reel?.hls_url) return;
    if (!paused) player.play();
    else player.pause();
  }, [paused, reel?.hls_url]);

  useEffect(() => {
    player.muted  = muted;
    player.volume = muted ? 0 : 1.0;
  }, [muted]);

  if (!reel) {
    return (
      <View style={[s.root, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  // Effets visuels
  const filterKey = reel.filter_name as FilterKey | undefined;
  const filtDef   = filterKey ? FILTERS.find(f => f.key === filterKey) : null;
  const filtOp    = filterKey ? (FILTER_VIDEO_OPACITY[filterKey] ?? 0) : 0;
  const filtOp2   = filterKey ? (FILTER_VIDEO_OPACITY2[filterKey] ?? 0) : 0;

  let textLayers: any[]    = [];
  let stickerLayers: any[] = [];
  let drawLayers: any[]    = [];
  try { if (reel.text_layers)    textLayers    = JSON.parse(reel.text_layers);    } catch {}
  try { if (reel.sticker_layers) stickerLayers = JSON.parse(reel.sticker_layers); } catch {}
  try { if (reel.draw_layers)    drawLayers    = JSON.parse(reel.draw_layers);    } catch {}

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Thumbnail en fond */}
      {reel.thumbnail_url && (
        <Image source={{ uri: reel.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      {/* Vidéo */}
      {reel.hls_url ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          controls={false}
          surfaceType="texture"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
      )}

      {/* Tap pour pause */}
      <TouchableOpacity
        activeOpacity={1}
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        onPress={() => setPaused(v => !v)}
      />

      {/* Overlay filtre */}
      {filtDef && filtOp > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: filtDef.overlay, opacity: filtOp, zIndex: 2 }]} />
      )}
      {filtDef && (filtDef as any).overlay2 && filtOp2 > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: (filtDef as any).overlay2, opacity: filtOp2, zIndex: 2 }]} />
      )}

      {/* Text layers */}
      {textLayers.map((l: any) => (
        <View
          key={l.id}
          pointerEvents="none"
          style={{ position: 'absolute', left: l.x, top: l.y, zIndex: 3, transform: [{ rotate: `${l.rotation ?? 0}deg` }, { scale: l.scale ?? 1 }] }}
        >
          <Text
            style={{
              color:            l.color,
              fontSize:         l.fontSize,
              fontWeight:       l.bold   ? '800' : '600',
              fontStyle:        l.italic ? 'italic' : 'normal',
              textDecorationLine: l.underline ? 'underline' : 'none',
              backgroundColor:  l.background ? 'rgba(0,0,0,0.5)' : 'transparent',
              paddingHorizontal: l.background ? 6 : 0,
              paddingVertical:   l.background ? 2 : 0,
              borderRadius:      l.background ? 4 : 0,
              textShadowColor:   'rgba(0,0,0,0.8)',
              textShadowOffset:  { width: 0, height: 1 },
              textShadowRadius:  3,
            }}
          >
            {l.text}
          </Text>
        </View>
      ))}

      {/* Sticker layers */}
      {stickerLayers.map((st: any) => (
        <View key={st.id} pointerEvents="none" style={{ position: 'absolute', left: st.x, top: st.y, zIndex: 4, transform: [{ rotate: `${st.rotation ?? 0}deg` }, { scale: st.scale ?? 1 }] }}>
          <Text style={{ fontSize: 44 }}>{st.emoji}</Text>
        </View>
      ))}

      {/* Draw layers */}
      {drawLayers.map((seg: any, i: number) => {
        if (!seg || !seg.x1) return null;
        const dx  = seg.x2 - seg.x1;
        const dy  = seg.y2 - seg.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View key={i} pointerEvents="none" style={{ position: 'absolute', left: seg.x1, top: seg.y1 - (seg.size ?? 4) / 2, width: len, height: seg.size ?? 4, zIndex: 5, transform: [{ translateX: len / 2 }, { rotate: `${angle}deg` }, { translateX: -len / 2 }], backgroundColor: seg.color ?? '#fff', borderRadius: (seg.size ?? 4) / 2, opacity: seg.opacity ?? 1 }} />
        );
      })}

      {/* Gradient bas */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={s.gradient}
        pointerEvents="none"
      />

      {/* Pause indicator */}
      {paused && (
        <View style={s.pauseIcon} pointerEvents="none">
          <Icon name="pause" size={48} color="rgba(255,255,255,0.75)" />
        </View>
      )}

      {/* Header : retour + mute */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setMuted(v => !v)} style={s.headerBtn} activeOpacity={0.8}>
          <Icon name={muted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Infos bas */}
      <View style={[s.info, { paddingBottom: insets.bottom + 20 }]} pointerEvents="none">
        <Text style={s.author}>{getAuthorLabel(reel.author)}</Text>
        {!!reel.caption && (
          <Text style={s.caption} numberOfLines={3}>{reel.caption}</Text>
        )}
        <View style={s.stats}>
          <Icon name="eye" size={13} color="rgba(255,255,255,0.8)" />
          <Text style={s.statTxt}>{reel.view_count ?? 0}</Text>
          <Icon name="heart" size={13} color="rgba(255,255,255,0.8)" style={{ marginLeft: 12 }} />
          <Text style={s.statTxt}>{reel.like_count ?? 0}</Text>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:       { flex: 1, width: SW, height: SH, backgroundColor: '#000' },
  gradient:   { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', zIndex: 4 },
  spinner:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, justifyContent: 'center', alignItems: 'center' },
  pauseIcon:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, justifyContent: 'center', alignItems: 'center' },
  header:     { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  headerBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  info:       { position: 'absolute', bottom: 0, left: 0, right: 72, zIndex: 6, paddingHorizontal: 16 },
  author:     { color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: 4 },
  caption:    { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18, marginBottom: 6 },
  stats:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTxt:    { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 3 },
});
