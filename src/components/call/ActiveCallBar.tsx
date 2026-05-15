import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useActiveCall } from '../../context/ActiveCallContext';
import { useWs } from '../../context/WebSocketContext';

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export const ActiveCallBar: React.FC = () => {
  const { activeCall, endCall } = useActiveCall();
  const { sendMessage: sendWs, notifyCallEnded, markCallEnded } = useWs();
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();

  if (!activeCall?.isActive) return null;

  const handleReturn = () => {
    nav.navigate('Call', {
      partnerId:     activeCall.partnerId,
      partnerName:   activeCall.partnerName,
      partnerAvatar: activeCall.partnerAvatar ?? null,
      callType:      activeCall.callType,
      isIncoming:    false,
      fromMinimized: true,
    });
  };

  const handleHangup = () => {
    sendWs({ type: 'call_hangup', to: activeCall.partnerId });
    notifyCallEnded(activeCall.partnerId);
    markCallEnded(activeCall.partnerId);
    endCall();
  };

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + 8 }]}>
      <LinearGradient
        colors={['#1C1033', '#2A1550']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.bar}
      >
        {/* Avatar */}
        <TouchableOpacity style={styles.leftSection} onPress={handleReturn} activeOpacity={0.8}>
          {activeCall.partnerAvatar ? (
            <Image source={{ uri: activeCall.partnerAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{getInitials(activeCall.partnerName)}</Text>
            </View>
          )}

          {/* Infos */}
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{activeCall.partnerName}</Text>
            <View style={styles.statusRow}>
              <View style={styles.activeDot} />
              <Text style={styles.elapsed}>{formatElapsed(activeCall.elapsed)}</Text>
              <Text style={styles.type}>
                {activeCall.callType === 'video' ? '· Vidéo' : '· Vocal'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Boutons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.returnBtn} onPress={handleReturn} activeOpacity={0.8}>
            <Icon name="maximize-2" size={16} color="#7B3FF2" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.hangupBtn} onPress={handleHangup} activeOpacity={0.8}>
            <Icon name="phone-off" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position:   'absolute',
    left:       12,
    right:      12,
    zIndex:     9999,
    elevation:  20,
    shadowColor: '#7B3FF2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  bar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    borderRadius:   18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems:    'center',
    flex:          1,
    gap:           10,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 2, borderColor: '#7B3FF2',
  },
  avatarFallback: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#7B3FF222',
    borderWidth: 2, borderColor: '#7B3FF2',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#9B65F5', fontSize: 14, fontWeight: '800' },
  info: { flex: 1 },
  name: { color: '#F0EFF8', fontSize: 14, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  activeDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#36D9A0',
  },
  elapsed: { color: '#36D9A0', fontSize: 12, fontWeight: '600' },
  type:    { color: '#9390AB', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  returnBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#7B3FF218',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#7B3FF233',
  },
  hangupBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#E0389A',
    alignItems: 'center', justifyContent: 'center',
  },
});
