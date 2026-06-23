import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, Dimensions, StatusBar,
  TouchableOpacity, ActivityIndicator, Image,
  ScrollView, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userService } from '../../services/userService';
import type { Reel } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { BackButton } from '../../components/common';
import { FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2 } from '../Create/ReelEditorScreen';
import type { FilterKey } from '../Create/ReelEditorScreen';

const { width: SW, height: SH } = Dimensions.get('screen');

const getLabel = (r: Reel) =>
  r.author?.display_name || r.author?.username || 'Utilisateur';

// ── Slide individuelle ────────────────────────────────────────────────────────

interface SlideProps {
  reel: Reel;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
}

const Slide: React.FC<SlideProps> = memo(({ reel, isActive, muted, onToggleMute }) => {
  const [paused, setPaused] = useState(false);

  const player = useVideoPlayer(
    reel.hls_url ? { uri: reel.hls_url } : { uri: 'about:blank' },
    p => {
      p.loop   = true;
      p.muted  = muted;
      p.volume = muted ? 0 : 1.0;
    },
  );

  useEffect(() => {
    if (isActive && !paused) player.play();
    else player.pause();
  }, [isActive, paused]);

  useEffect(() => {
    player.muted  = muted;
    player.volume = muted ? 0 : 1.0;
  }, [muted]);

  useEffect(() => { if (!isActive) setPaused(false); }, [isActive]);

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
    <View style={{ width: SW, height: SH, backgroundColor: '#000' }}>
      {reel.thumbnail_url && (
        <Image source={{ uri: reel.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" controls={false} surfaceType="texture" />

      {/* Tap pour pause */}
      <TouchableOpacity
        activeOpacity={1}
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        onPress={() => setPaused(v => !v)}
      />

      {/* Overlay filtre */}
      {filtDef && filtOp > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: filtDef.overlay, opacity: filtOp, zIndex: 2 }} />
      )}
      {filtDef && (filtDef as any).overlay2 && filtOp2 > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: (filtDef as any).overlay2, opacity: filtOp2, zIndex: 2 }} />
      )}

      {/* Text layers */}
      {textLayers.map((l: any) => (
        <View key={l.id} pointerEvents="none" style={{ position: 'absolute', left: l.x, top: l.y, zIndex: 3, transform: [{ rotate: `${l.rotation ?? 0}deg` }, { scale: l.scale ?? 1 }] }}>
          <Text style={{ color: l.color, fontSize: l.fontSize, fontWeight: l.bold ? '800' : '600', fontStyle: l.italic ? 'italic' : 'normal', textDecorationLine: l.underline ? 'underline' : 'none', backgroundColor: l.background ? 'rgba(0,0,0,0.5)' : 'transparent', paddingHorizontal: l.background ? 6 : 0, paddingVertical: l.background ? 2 : 0, borderRadius: l.background ? 4 : 0, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
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

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', zIndex: 6 }}
        pointerEvents="none"
      />

      {/* Caption */}
      {reel.caption ? (
        <View style={st.caption} pointerEvents="none">
          <Text style={st.captionTxt} numberOfLines={3}>{reel.caption}</Text>
        </View>
      ) : null}

      {/* Mute */}
      <TouchableOpacity style={st.muteBtn} onPress={onToggleMute} activeOpacity={0.8}>
        <Icon name={muted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
      </TouchableOpacity>

      {/* Pause indicator */}
      {paused && (
        <View style={st.pauseIcon} pointerEvents="none">
          <Icon name="pause" size={40} color="rgba(255,255,255,0.7)" />
        </View>
      )}
    </View>
  );
});

// ── UserReelsScreen ───────────────────────────────────────────────────────────

export const UserReelsScreen: React.FC = () => {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const { userId, initialReelId, initialReels } = route.params as {
    userId: string;
    initialReelId?: string;
    initialReels?: Reel[];
  };

  const buildList = (data: Reel[]) => {
    const list = data.filter((r: Reel) => !!r.hls_url);
    if (initialReelId) {
      const idx = list.findIndex(r => r.id === initialReelId);
      if (idx > 0) { const [cur] = list.splice(idx, 1); list.unshift(cur); }
    }
    return list;
  };

  const [reels,   setReels]   = useState<Reel[]>(() =>
    initialReels ? buildList([...initialReels]) : []
  );
  const [loading, setLoading] = useState(!initialReels || initialReels.length === 0);
  const [curIdx,  setCurIdx]  = useState(0);
  const [muted,   setMuted]   = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await userService.getUserReels(userId) as Reel[];
      setReels(buildList(Array.isArray(data) ? data : []));
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, [userId, initialReelId]);

  useEffect(() => {
    if (!initialReels || initialReels.length === 0) load();
  }, []);

  const onScroll = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
    setCurIdx(idx);
  }, []);

  const authorName = reels[0] ? getLabel(reels[0]) : 'Reels';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : reels.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Icon name="film" size={44} color="rgba(255,255,255,0.3)" />
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>Aucun reel</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          disableIntervalMomentum
          onMomentumScrollEnd={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{ width: SW * reels.length }}
        >
          {reels.map((r, i) => (
            <Slide
              key={r.id}
              reel={r}
              isActive={i === curIdx}
              muted={muted}
              onToggleMute={() => setMuted(v => !v)}
            />
          ))}
        </ScrollView>
      )}

      {/* Header flottant */}
      <View style={[st.header, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={st.headerName}>{authorName}</Text>
          {reels.length > 1 && (
            <Text style={st.headerCount}>{curIdx + 1} / {reels.length}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => nav.navigate('UserProfile', { userId })}
          style={st.iconBtn}
        >
          <Icon name="user" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerName:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerCount: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  caption: {
    position: 'absolute', bottom: 70, left: 16, right: 16, zIndex: 3,
  },
  captionTxt: { color: '#fff', fontSize: 13, lineHeight: 19 },
  muteBtn: {
    position: 'absolute', bottom: 24, right: 16, zIndex: 4,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  pauseIcon: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
});
