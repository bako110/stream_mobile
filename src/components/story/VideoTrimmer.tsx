import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { VideoView, useVideoPlayer } from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';

const MAX_DURATION = 90; // 1m30s max

interface Props {
  uri:       string;
  duration:  number; // durée réelle en secondes
  // trimmedUri est identique à uri — le vrai découpage se fait côté backend via trim_start/end_sec
  onConfirm: (uri: string, startSec: number, endSec: number) => void;
  onCancel:  () => void;
}

export const VideoTrimmer: React.FC<Props> = ({ uri, duration, onConfirm, onCancel }) => {
  const [startSec, setStartSec] = useState(0);
  const [endSec,   setEndSec]   = useState(Math.min(duration, MAX_DURATION));
  const [applying, setApplying] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer({ uri }, p => {
    p.loop  = false;
    p.muted = false;
  });

  // Prévisualise la position de début quand le slider change
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      try { player.currentTime = startSec; player.pause(); } catch {}
    }, 150);
  }, [startSec]);

  const trimDuration = endSec - startSec;

  const handleConfirm = () => {
    setApplying(true);
    // Pas de découpe locale — on passe les timestamps au backend
    onConfirm(uri, startSec, endSec);
  };

  const fmt = (s: number) => {
    const m   = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const tooLong = trimDuration > MAX_DURATION;
  const tooShort = trimDuration < 1;
  const invalid = tooLong || tooShort;

  return (
    <View style={s.root}>
      {/* Préview vidéo */}
      <View style={s.videoWrap}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          controls={false}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={s.gradTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={s.gradBottom}
          pointerEvents="none"
        />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onCancel} style={s.headerBtn}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={s.badge}>
            <Icon name="scissors" size={12} color="#fff" />
            <Text style={s.badgeText}>Choisir un segment</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Durée sélectionnée */}
        <View style={s.durationBadge}>
          <Text style={s.durationText}>{fmt(trimDuration)}</Text>
          <Text style={s.durationSub}>/ 1m30s max</Text>
        </View>
      </View>

      {/* Contrôles trim */}
      <View style={s.controls}>
        {/* Barre timeline visuelle */}
        <View style={s.timeline}>
          <View style={s.timelineTrack}>
            <View style={[
              s.timelineSelected,
              {
                left:  `${(startSec / duration) * 100}%` as any,
                width: `${(trimDuration / duration) * 100}%` as any,
                backgroundColor: tooLong ? '#EF4444' : '#7B3FF2',
              },
            ]} />
          </View>
        </View>

        {/* Slider début */}
        <View style={s.sliderRow}>
          <View style={[s.sliderIcon, { backgroundColor: '#7B3FF2' }]}>
            <Icon name="skip-back" size={12} color="#fff" />
          </View>
          <View style={s.sliderWrap}>
            <Slider
              style={{ flex: 1, height: 40 }}
              minimumValue={0}
              maximumValue={Math.max(0, endSec - 1)}
              value={startSec}
              step={0.5}
              minimumTrackTintColor="#7B3FF2"
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor="#7B3FF2"
              onValueChange={v => setStartSec(parseFloat(v.toFixed(1)))}
            />
          </View>
          <Text style={s.sliderTime}>{fmt(startSec)}</Text>
        </View>

        {/* Slider fin */}
        <View style={s.sliderRow}>
          <View style={[s.sliderIcon, { backgroundColor: '#E0389A' }]}>
            <Icon name="skip-forward" size={12} color="#fff" />
          </View>
          <View style={s.sliderWrap}>
            <Slider
              style={{ flex: 1, height: 40 }}
              minimumValue={Math.min(startSec + 1, duration)}
              maximumValue={duration}
              value={endSec}
              step={0.5}
              minimumTrackTintColor="#E0389A"
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor="#E0389A"
              onValueChange={v => {
                const clamped = Math.min(parseFloat(v.toFixed(1)), startSec + MAX_DURATION);
                setEndSec(clamped);
              }}
            />
          </View>
          <Text style={s.sliderTime}>{fmt(endSec)}</Text>
        </View>

        {/* Info durée */}
        <View style={[s.infoRow, tooLong && { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
          <Icon
            name={tooLong ? 'alert-triangle' : 'info'}
            size={13}
            color={tooLong ? '#EF4444' : 'rgba(255,255,255,0.5)'}
          />
          <Text style={[s.infoText, tooLong && { color: '#EF4444' }]}>
            {tooLong
              ? `Trop long — max 1m30s (${fmt(MAX_DURATION)})`
              : `Segment sélectionné : ${fmt(startSec)} → ${fmt(endSec)}`
            }
          </Text>
        </View>

        {/* Bouton confirmer */}
        <TouchableOpacity
          style={[s.confirmBtn, invalid && { opacity: 0.4 }]}
          onPress={handleConfirm}
          disabled={applying || invalid}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#7B3FF2', '#E0389A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.confirmInner}
          >
            {applying ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator size={16} color="#fff" />
                <Text style={s.confirmText}>Application…</Text>
              </View>
            ) : (
              <>
                <Icon name="check" size={16} color="#fff" />
                <Text style={s.confirmText}>Utiliser ce segment</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  videoWrap: { flex: 1, position: 'relative' },
  gradTop:   { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  gradBottom:{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },

  header: {
    position: 'absolute', top: 44, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 12,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  durationBadge: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'baseline', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  durationText: { color: '#fff', fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  durationSub:  { color: 'rgba(255,255,255,0.5)', fontSize: 12 },

  controls: {
    backgroundColor: '#111', paddingHorizontal: 20,
    paddingTop: 16, paddingBottom: 32, gap: 12,
  },

  timeline: { height: 6, marginBottom: 4 },
  timelineTrack: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3, overflow: 'hidden',
  },
  timelineSelected: {
    position: 'absolute', top: 0, bottom: 0,
    borderRadius: 3,
  },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  sliderWrap: { flex: 1 },
  sliderTime: {
    color: '#fff', fontSize: 13, fontWeight: '700',
    width: 40, textAlign: 'right', fontVariant: ['tabular-nums'],
  },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
  },
  infoText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, flex: 1 },

  confirmBtn: { borderRadius: 28, overflow: 'hidden', marginTop: 4 },
  confirmInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
