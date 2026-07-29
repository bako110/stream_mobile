import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, StatusBar,
  TouchableOpacity, Image, ActivityIndicator, FlatList,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { VideoView, useVideoPlayer } from 'react-native-video';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { userService } from '../../services/userService';
import { reelService } from '../../services/reelService';
import { CachedImage } from '../../components/common/CachedImage';
import type { Reel } from '../../types';
import { FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2 } from '../Create/ReelEditorScreen';
import type { FilterKey } from '../Create/ReelEditorScreen';
import { BackButton, GoFolyXLoader } from '../../components/common';

const { width: SW, height: SH } = Dimensions.get('screen');
const PAGE_LIMIT = 20;
const PLAYER_H_EXPANDED  = Math.round(SH * 0.75);
const PLAYER_H_COLLAPSED = Math.round(SH * 0.15);
const GRID_COLS = 3;
const GRID_GAP = 2;
const GRID_ITEM_W = (SW - GRID_GAP * (GRID_COLS + 1)) / GRID_COLS;

const getAuthorLabel = (author?: Reel['author']) => {
  if (!author) return 'Utilisateur';
  return author.display_name || author.username || 'Utilisateur';
};

// ── Player du reel actif — occupe le haut de l'écran (75%), réductible en petite
// bande (15%) via la flèche pour laisser plus de place à la grille du bas. ─────
const ActivePlayer: React.FC<{
  reel: Reel; muted: boolean; collapsed: boolean;
  onToggleMute: () => void; onToggleCollapse: () => void; onBack: () => void;
}> = ({
  reel, muted, collapsed, onToggleMute, onToggleCollapse, onBack,
}) => {
  const insets = useSafeAreaInsets();
  const [paused, setPaused] = useState(false);

  const player = useVideoPlayer(
    reel.hls_url
      ? {
          uri: reel.hls_url,
          bufferConfig: {
            minBufferMs: 2_000,
            maxBufferMs: 50_000,
            bufferForPlaybackMs: 1_500,
            bufferForPlaybackAfterRebufferMs: 2_000,
          },
        }
      : { uri: 'about:blank' },
    p => {
      p.loop   = true;
      p.muted  = muted;
      p.volume = muted ? 0 : 1.0;
    },
  );

  useEffect(() => {
    if (!reel.hls_url) return;
    if (!paused) player.play();
    else player.pause();
  }, [paused, reel.hls_url]);

  useEffect(() => {
    player.muted  = muted;
    player.volume = muted ? 0 : 1.0;
  }, [muted]);

  const filterKey = reel.filter_name as FilterKey | undefined;
  const filtDef   = filterKey ? FILTERS.find(f => f.key === filterKey) : null;
  const filtOp    = filterKey ? (FILTER_VIDEO_OPACITY[filterKey] ?? 0) : 0;
  const filtOp2   = filterKey ? (FILTER_VIDEO_OPACITY2[filterKey] ?? 0) : 0;

  let textLayers: any[]    = [];
  let stickerLayers: any[] = [];
  try { if (reel.text_layers)    textLayers    = JSON.parse(reel.text_layers);    } catch {}
  try { if (reel.sticker_layers) stickerLayers = JSON.parse(reel.sticker_layers); } catch {}

  const playerH = collapsed ? PLAYER_H_COLLAPSED : PLAYER_H_EXPANDED;

  return (
    <View style={[s.player, { height: playerH }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {reel.thumbnail_url && (
        <Image source={{ uri: reel.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

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

      <TouchableOpacity
        activeOpacity={1}
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        onPress={() => collapsed ? onToggleCollapse() : setPaused(v => !v)}
      />

      {!collapsed && filtDef && filtOp > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: filtDef.overlay, opacity: filtOp, zIndex: 2 }]} />
      )}
      {!collapsed && filtDef && (filtDef as any).overlay2 && filtOp2 > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: (filtDef as any).overlay2, opacity: filtOp2, zIndex: 2 }]} />
      )}

      {!collapsed && textLayers.map((l: any) => (
        <View
          key={l.id}
          pointerEvents="none"
          style={{ position: 'absolute', left: l.x, top: l.y, zIndex: 3, transform: [{ rotate: `${l.rotation ?? 0}deg` }, { scale: l.scale ?? 1 }] }}
        >
          <Text
            style={{
              color: l.color, fontSize: l.fontSize,
              fontWeight: l.bold ? '800' : '600',
              fontStyle: l.italic ? 'italic' : 'normal',
              textDecorationLine: l.underline ? 'underline' : 'none',
              backgroundColor: l.background ? 'rgba(0,0,0,0.5)' : 'transparent',
              paddingHorizontal: l.background ? 6 : 0,
              paddingVertical: l.background ? 2 : 0,
              borderRadius: l.background ? 4 : 0,
              textShadowColor: 'rgba(0,0,0,0.8)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
            }}
          >
            {l.text}
          </Text>
        </View>
      ))}

      {!collapsed && stickerLayers.map((st: any) => (
        <View key={st.id} pointerEvents="none" style={{ position: 'absolute', left: st.x, top: st.y, zIndex: 4, transform: [{ rotate: `${st.rotation ?? 0}deg` }, { scale: st.scale ?? 1 }] }}>
          <Text style={{ fontSize: 40 }}>{st.emoji}</Text>
        </View>
      ))}

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={s.gradient} pointerEvents="none" />

      {!collapsed && paused && (
        <View style={s.pauseIcon} pointerEvents="none">
          <Icon name="pause" size={48} color="rgba(255,255,255,0.75)" />
        </View>
      )}

      {/* Header : retour + mute + flèche pour réduire/agrandir le player */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }} />
        {!collapsed && (
          <TouchableOpacity onPress={onToggleMute} style={s.headerBtn} activeOpacity={0.8}>
            <Icon name={muted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onToggleCollapse} style={[s.headerBtn, { marginLeft: 8 }]} activeOpacity={0.8}>
          <Icon name={collapsed ? 'chevron-up' : 'chevron-down'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Infos bas — masquées en mode réduit, pas la place */}
      {!collapsed && (
        <View style={s.info} pointerEvents="none">
          <Text style={s.author}>{getAuthorLabel(reel.author)}</Text>
          {!!reel.caption && (
            <Text style={s.caption} numberOfLines={2}>{reel.caption}</Text>
          )}
          <View style={s.stats}>
            <Icon name="eye" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={s.statTxt}>{(reel.view_count ?? 0).toLocaleString('fr')}</Text>
            <Icon name="heart" size={13} color="rgba(255,255,255,0.8)" style={{ marginLeft: 12 }} />
            <Text style={s.statTxt}>{(reel.like_count ?? 0).toLocaleString('fr')}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

// ── Vignette grille du bas ──────────────────────────────────────────────────────
const GridThumb: React.FC<{ reel: Reel; onPress: () => void }> = ({ reel, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ width: GRID_ITEM_W, marginLeft: GRID_GAP, marginBottom: GRID_GAP }}>
    <View style={[s.gridThumb, { aspectRatio: 9 / 16 }]}>
      {reel.thumbnail_url ? (
        <CachedImage uri={reel.thumbnail_url} style={{ width: '100%', height: '100%' }} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }]}>
          <Icon name="video" size={20} color="rgba(255,255,255,0.3)" />
        </View>
      )}
      <View style={s.gridThumbStats}>
        <Icon name="play" size={10} color="#fff" />
        <Text style={s.gridThumbStatsTxt}>{(reel.view_count ?? 0).toLocaleString('fr')}</Text>
      </View>
    </View>
  </TouchableOpacity>
);

// ── Écran — chargé UNIQUEMENT depuis un résultat de recherche, indépendant de
// ReelsScreen (pas de feed global, pas de pub, pas d'onglet "mine") pour ne pas
// perturber le comportement du feed principal des reels. ────────────────────
export const SearchReelViewerScreen: React.FC = () => {
  useKeepAwake();
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const { colors } = useTheme().theme;

  const initialReel: Reel | undefined     = route.params?.reel;
  const initialReelId: string | undefined = route.params?.reelId ?? initialReel?.id;
  const authorId: string | undefined      = route.params?.authorId ?? initialReel?.author?.id;

  // Deux chargements totalement indépendants :
  // 1) le reel cliqué — via GET /reels/{id}, garanti complet (hls_url inclus),
  //    ne dépend jamais de la liste de l'auteur.
  // 2) la grille du bas — via GET /users/{id}/reels, chargée en parallèle, ne
  //    bloque jamais l'affichage du reel actif.
  const [reels,       setReels]       = useState<Reel[]>(initialReel?.hls_url ? [initialReel] : []);
  const [activeReel,  setActiveReel]  = useState<Reel | undefined>(initialReel?.hls_url ? initialReel : undefined);
  const [loading,     setLoading]     = useState(!activeReel);
  const [loadErr,     setLoadErr]     = useState(false);
  const [gridLoading, setGridLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [muted,       setMuted]       = useState(false);
  const [collapsed,   setCollapsed]   = useState(false);

  const pageRef        = useRef(1);
  const loadingMoreRef = useRef(false);

  // 1) Reel cliqué — chargé pour lui-même, immédiatement, sans dépendre de la grille.
  useEffect(() => {
    if (!initialReelId) { if (!activeReel) setLoadErr(true); setLoading(false); return; }
    let cancelled = false;
    reelService.getById(initialReelId)
      .then((r: Reel) => {
        if (cancelled || !r?.hls_url) { if (!cancelled && !activeReel) setLoadErr(true); return; }
        setActiveReel(r);
        setReels(prev => prev.some(x => x.id === r.id) ? prev.map(x => x.id === r.id ? r : x) : [r, ...prev]);
      })
      .catch(() => { if (!cancelled && !activeReel) setLoadErr(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReelId]);

  // 2) Grille du bas — charge les autres reels de l'auteur, en parallèle, sans
  // jamais toucher activeReel automatiquement (seul un clic sur une vignette le fait).
  useEffect(() => {
    if (!authorId) { setGridLoading(false); return; }
    let cancelled = false;
    userService.getUserReels(authorId, 1, PAGE_LIMIT)
      .then((data: any) => {
        if (cancelled) return;
        const items = (Array.isArray(data) ? data : []).filter((r: Reel) => !!r.hls_url);
        setReels(prev => {
          const ids = new Set(prev.map(r => r.id));
          return [...prev, ...items.filter((r: Reel) => !ids.has(r.id))];
        });
        setHasMore(items.length >= PAGE_LIMIT);
        pageRef.current = 1;
      })
      .catch(() => setHasMore(false))
      .finally(() => { if (!cancelled) setGridLoading(false); });
    return () => { cancelled = true; };
  }, [authorId]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || !authorId) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const data = await userService.getUserReels(authorId, nextPage, PAGE_LIMIT) as Reel[];
      const items = (Array.isArray(data) ? data : []).filter(r => !!r.hls_url);
      setReels(prev => {
        const ids = new Set(prev.map(r => r.id));
        return [...prev, ...items.filter(r => !ids.has(r.id))];
      });
      pageRef.current = nextPage;
      setHasMore(items.length >= PAGE_LIMIT);
    } catch {
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [authorId, hasMore]);

  if (loadErr && !activeReel) {
    return (
      <View style={[s.root, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32 }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <Icon name="alert-triangle" size={32} color="rgba(255,255,255,0.6)" />
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center' }}>
          Impossible de charger ce reel.
        </Text>
        <TouchableOpacity onPress={() => nav.goBack()} style={{ marginTop: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!activeReel) {
    return (
      <View style={[s.root, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <GoFolyXLoader variant="reel" color="#ffffff" />
      </View>
    );
  }

  const others = reels.filter(r => r.id !== activeReel.id);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ActivePlayer
        key={activeReel.id}
        reel={activeReel}
        muted={muted}
        collapsed={collapsed}
        onToggleMute={() => setMuted(v => !v)}
        onToggleCollapse={() => setCollapsed(v => !v)}
        onBack={() => nav.goBack()}
      />

      <View style={s.gridWrap}>
        <View style={s.gridHeader}>
          <Text style={[s.gridHeaderTxt, { color: colors.textPrimary }]}>
            Autres reels de {getAuthorLabel(activeReel.author)}
          </Text>
        </View>
        {gridLoading && reels.length <= 1 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={colors.textTertiary} size="small" />
          </View>
        ) : others.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Text style={{ color: colors.textTertiary, fontSize: 12 }}>Aucun autre reel</Text>
          </View>
        ) : (
          <FlatList
            data={others}
            keyExtractor={r => r.id}
            numColumns={GRID_COLS}
            renderItem={({ item }) => (
              <GridThumb reel={item} onPress={() => setActiveReel(item)} />
            )}
            contentContainerStyle={{ paddingTop: GRID_GAP, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            // Réduit automatiquement le player dès qu'on commence à scroller la
            // grille (pas besoin de taper la flèche) ; le réagrandit quand on
            // revient tout en haut.
            onScroll={({ nativeEvent }) => {
              const y = nativeEvent.contentOffset.y;
              if (y > 12 && !collapsed) setCollapsed(true);
              else if (y <= 0 && collapsed) setCollapsed(false);
            }}
            scrollEventThrottle={32}
            ListFooterComponent={loadingMore ? (
              <ActivityIndicator color={colors.textTertiary} size="small" style={{ marginTop: 12 }} />
            ) : null}
          />
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root:       { flex: 1 },
  player:     { width: SW, backgroundColor: '#000' },
  gradient:   { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', zIndex: 4 },
  pauseIcon:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, justifyContent: 'center', alignItems: 'center' },
  header:     { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  headerBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  info:       { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 6, paddingHorizontal: 16, paddingBottom: 14 },
  author:     { color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: 4 },
  caption:    { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18, marginBottom: 6 },
  stats:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTxt:    { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 3 },

  gridWrap:       { flex: 1 },
  gridHeader:     { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  gridHeaderTxt:  { fontSize: 13, fontWeight: '800' },
  gridThumb:      { width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  gridThumbStats: { position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridThumbStatsTxt: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
