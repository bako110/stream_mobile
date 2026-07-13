import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useActiveVoice } from '../../context/ActiveVoiceContext';

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SCREEN_BY_SOURCE = { chat: 'Chat', community: 'CommunityChat', channel: 'CommunityChannelChat' } as const;

export const ActiveVoiceBar: React.FC = () => {
  const { activeVoice, togglePause, stopVoice } = useActiveVoice();
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  if (!activeVoice) return null;

  const pct = activeVoice.duration > 0 ? (activeVoice.progress / activeVoice.duration) * 100 : 0;

  const handleReturn = () => {
    nav.navigate(SCREEN_BY_SOURCE[activeVoice.source], activeVoice.returnParams);
  };

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + 8 }]}>
      <LinearGradient
        colors={['#1C1033', '#2A1550']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.bar}
      >
        <TouchableOpacity style={styles.leftSection} onPress={handleReturn} activeOpacity={0.8}>
          {activeVoice.avatarUrl ? (
            <Image source={{ uri: activeVoice.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Icon name="mic" size={16} color="#9B65F5" />
            </View>
          )}

          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{activeVoice.title}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.elapsed}>{formatMs(activeVoice.progress)} / {formatMs(activeVoice.duration)}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.playBtn} onPress={togglePause} activeOpacity={0.8}>
            <Icon name={activeVoice.isPlaying ? 'pause' : 'play'} size={16} color="#7B3FF2" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={stopVoice} activeOpacity={0.8}>
            <Icon name="x" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute', left: 12, right: 12, zIndex: 9998, elevation: 19,
    shadowColor: '#7B3FF2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
  },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, overflow: 'hidden',
  },
  leftSection: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#7B3FF2' },
  avatarFallback: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#7B3FF222',
    borderWidth: 2, borderColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, gap: 3 },
  name: { color: '#F0EFF8', fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(155,101,245,0.25)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#9B65F5', borderRadius: 1.5 },
  elapsed: { color: '#9390AB', fontSize: 10, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  playBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#7B3FF218',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#7B3FF233',
  },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
});
