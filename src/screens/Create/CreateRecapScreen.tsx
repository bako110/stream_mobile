/**
 * CreateRecapScreen — étape 3 (finale) du flow de publication : récapitulatif
 * avant publication, façon TikTok. Montre l'aperçu final (média + filtre +
 * texte/stickers déjà appliqués) dans une carte téléphone, résume les choix
 * (filtre, vitesse, musique, description), et lance la publication.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Dimensions,
  StatusBar, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import type { ReelEditResult, FilterKey } from './ReelEditorScreen';
import { FILTERS, FILTER_VIDEO_OPACITY, FILTER_VIDEO_OPACITY2 } from './ReelEditorScreen';

const { width: W, height: SCREEN_H } = Dimensions.get('window');
const CARD_H = Math.min(Math.round(W * 16 / 9) + 40, SCREEN_H * 0.56);

interface Props {
  mediaUri:      string;
  isPhoto:       boolean;
  thumbnailUri:  string | null;
  caption:       string;
  editResult:    ReelEditResult | null;
  videoDuration: number;
  isRemix:       boolean;
  publishing:    boolean;
  onBack:        () => void;
  onEditCaption: () => void;
  onPublish:     () => void;
}

function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export const CreateRecapScreen: React.FC<Props> = ({
  mediaUri, isPhoto, thumbnailUri, caption, editResult, videoDuration,
  isRemix, publishing, onBack, onEditCaption, onPublish,
}) => {
  const insets = useSafeAreaInsets();
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const videoSource = useMemo(() => ({ uri: mediaUri }), [mediaUri]);
  const player = useVideoPlayer(isPhoto ? 'about:blank' : videoSource, p => {
    p.loop  = true;
    p.muted = false;
  });

  useEffect(() => {
    if (isPhoto) return;
    try { player.pause(); } catch {}
  }, [isPhoto, player]);

  const togglePlay = useCallback(() => {
    if (isPhoto) return;
    if (previewPlaying) { player.pause(); setPreviewPlaying(false); }
    else { player.play(); setPreviewPlaying(true); }
  }, [isPhoto, previewPlaying, player]);

  const filterDef = editResult ? FILTERS.find(f => f.key === editResult.filter) : null;
  const filterOp  = editResult ? (FILTER_VIDEO_OPACITY[editResult.filter as FilterKey] ?? 0) : 0;
  const filterOp2 = editResult && filterDef ? (FILTER_VIDEO_OPACITY2[editResult.filter as FilterKey] ?? 0) : 0;

  // Résumé des choix — chaque ligne n'apparaît que si pertinente, jamais de
  // valeur "par défaut" affichée pour ne pas noyer les vrais choix faits.
  const summaryRows: { icon: string; label: string; value: string }[] = [];
  if (editResult) {
    if (editResult.filter !== 'original') {
      summaryRows.push({ icon: 'sliders', label: 'Filtre', value: filterDef?.label ?? editResult.filter });
    }
    if (editResult.speed !== 1) {
      summaryRows.push({ icon: 'zap', label: 'Vitesse', value: `${editResult.speed}×` });
    }
    if (editResult.musicName) {
      summaryRows.push({ icon: 'music', label: 'Son', value: editResult.musicName });
    }
    if (editResult.layers.length > 0) {
      summaryRows.push({ icon: 'type', label: 'Texte', value: `${editResult.layers.length} calque${editResult.layers.length > 1 ? 's' : ''}` });
    }
    if ((editResult.stickers?.length ?? 0) > 0) {
      summaryRows.push({ icon: 'smile', label: 'Stickers', value: `${editResult.stickers.length}` });
    }
  }
  const durationLabel = isPhoto ? 'Photo · 5s' : fmtDuration(
    editResult ? editResult.endSec - editResult.startSec : videoDuration
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ══ HEADER ══ */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.headerBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} disabled={publishing}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={s.stepsRow}>
          <View style={[s.stepDot, s.stepDotDone]} />
          <View style={[s.stepDot, s.stepDotDone]} />
          <View style={[s.stepDot, s.stepDotDone]} />
          <View style={[s.stepDot, s.stepDotActive]} />
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.Text entering={FadeInDown.duration(300)} style={s.title}>
          {isRemix ? 'Prêt à remixer' : 'Prêt à publier'}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.duration(300).delay(60)} style={s.subtitle}>
          Vérifie ton reel avant de le partager avec le monde
        </Animated.Text>

        {/* ══ CARTE APERÇU — cadre "téléphone" ══ */}
        <Animated.View entering={FadeIn.duration(340).delay(100)} style={s.previewFrame}>
          <TouchableOpacity activeOpacity={0.95} onPress={togglePlay} style={s.previewInner}>
            {isPhoto ? (
              <>
                {/* Fond flouté agrandi — comble l'espace autour d'une photo dont
                    le ratio ne correspond pas au cadre, sans jamais la recadrer
                    (image d'origine affichée en "contain" par-dessus). */}
                <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={Platform.OS === 'android' ? 10 : 20} />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
                <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              </>
            ) : (
              <VideoView player={player} style={StyleSheet.absoluteFill} resizeMode="cover" controls={false} />
            )}

            {filterDef && filterOp > 0 && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: filterDef.overlay, opacity: filterOp }]} />
            )}
            {filterDef?.overlay2 && filterOp2 > 0 && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: filterDef.overlay2, opacity: filterOp2 }]} />
            )}

            <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.35)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60 }} />
            <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.8)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90 }} />

            {!isPhoto && !previewPlaying && (
              <View style={s.playOverlay} pointerEvents="none">
                <View style={s.playCircle}><Icon name="play" size={24} color="#fff" /></View>
              </View>
            )}

            <View style={s.durationBadge} pointerEvents="none">
              <Icon name={isPhoto ? 'image' : 'clock'} size={10} color="#fff" />
              <Text style={s.durationTxt}>{durationLabel}</Text>
            </View>

            {caption ? (
              <View style={s.captionOverlay} pointerEvents="none">
                <Text style={s.captionOverlayTxt} numberOfLines={2}>{caption}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </Animated.View>

        {/* ══ RÉSUMÉ DES CHOIX ══ */}
        {summaryRows.length > 0 && (
          <Animated.View entering={FadeInDown.duration(300).delay(160)} style={s.summaryCard}>
            {summaryRows.map((row, i) => (
              <View key={row.label} style={[s.summaryRow, i < summaryRows.length - 1 && s.summaryRowBorder]}>
                <View style={s.summaryIconWrap}><Icon name={row.icon as any} size={14} color="#C084FC" /></View>
                <Text style={s.summaryLabel} numberOfLines={1}>{row.label}</Text>
                <Text style={s.summaryValue} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ══ DESCRIPTION ══ */}
        <Animated.View entering={FadeInDown.duration(300).delay(200)}>
          <TouchableOpacity style={s.captionRow} onPress={onEditCaption} activeOpacity={0.8} disabled={publishing}>
            <Icon name="align-left" size={15} color="rgba(255,255,255,0.6)" />
            <Text style={s.captionRowTxt} numberOfLines={2}>
              {caption || 'Aucune description — appuie pour en ajouter une'}
            </Text>
            <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* ══ CTA PUBLIER ══ */}
      <Animated.View entering={FadeInUp.duration(320)} style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
        <TouchableOpacity onPress={onPublish} activeOpacity={0.88} disabled={publishing} style={[s.publishBtnWrap, publishing && { opacity: 0.7 }]}>
          <LinearGradient colors={['#7B3FF2', '#C026D3', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.publishBtn}>
            {publishing ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={s.publishBtnTxt}>Publication…</Text>
              </>
            ) : (
              <>
                <Icon name="send" size={17} color="#fff" />
                <Text style={s.publishBtnTxt}>{isRemix ? 'Publier le remix' : 'Publier'}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050308' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  stepsRow: { flexDirection: 'row', gap: 6 },
  stepDot: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  stepDotDone: { backgroundColor: 'rgba(224,56,154,0.55)' },
  stepDotActive: { backgroundColor: '#C026D3', width: 22 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 4 },

  previewFrame: {
    alignSelf: 'center', width: '78%', height: CARD_H, marginTop: 22,
    borderRadius: 26, overflow: 'hidden', backgroundColor: '#000',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#7B3FF2', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  previewInner: { flex: 1 },

  playOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  playCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },

  durationBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  durationTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },

  captionOverlay: { position: 'absolute', bottom: 10, left: 12, right: 12 },
  captionOverlayTxt: { color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 16, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  summaryCard: {
    marginTop: 22, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  summaryRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  summaryIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(192,132,252,0.15)', alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, fontWeight: '600', width: 62 },
  summaryValue: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'right' },

  captionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  captionRowTxt: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },

  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  publishBtnWrap: { borderRadius: 28, overflow: 'hidden', shadowColor: '#C026D3', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 17 },
  publishBtnTxt: { color: '#fff', fontSize: 16.5, fontWeight: '900', letterSpacing: 0.2 },
});
