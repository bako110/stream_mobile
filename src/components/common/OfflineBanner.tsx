import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useNetwork } from '../../context/NetworkContext';

const BANNER_SHOW_MS = 3000; // disparait apres 3s

export const OfflineBanner: React.FC = () => {
  const { isOnline, isInternetReachable } = useNetwork();
  const insets      = useSafeAreaInsets();
  const translateY  = useRef(new Animated.Value(-80)).current;
  const opacity     = useRef(new Animated.Value(0)).current;

  const offline = !isOnline || !isInternetReachable;

  // 'offline' | 'reconnected' | 'hidden'
  const [mode, setMode]         = useState<'offline' | 'reconnected' | 'hidden'>('hidden');
  const prevOfflineRef          = useRef(offline);
  const hideTimerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const BANNER_H                = 36 + insets.top;

  // Detection transitions reseau
  useEffect(() => {
    const wasOffline = prevOfflineRef.current;
    prevOfflineRef.current = offline;

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (offline) {
      // Vient de passer offline → montrer banner rouge
      setMode('offline');
      // Disparait apres 3s
      hideTimerRef.current = setTimeout(() => setMode('hidden'), BANNER_SHOW_MS);
    } else if (wasOffline) {
      // Vient de revenir online → flash vert
      setMode('reconnected');
      hideTimerRef.current = setTimeout(() => setMode('hidden'), 2000);
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [offline]);

  // Animation entree/sortie selon mode
  useEffect(() => {
    const visible = mode !== 'hidden';
    Animated.parallel([
      Animated.spring(translateY, {
        toValue:         visible ? 0 : -BANNER_H - 10,
        useNativeDriver: true,
        tension:         120,
        friction:        10,
      }),
      Animated.timing(opacity, {
        toValue:         visible ? 1 : 0,
        duration:        200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mode, BANNER_H]);

  const isReconnected = mode === 'reconnected';

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          paddingTop:      insets.top + 6,
          opacity,
          transform:       [{ translateY }],
          backgroundColor: isReconnected ? '#22863a' : '#1a1a1a',
          borderBottomColor: isReconnected ? '#2ea84a' : '#333',
        },
      ]}
      pointerEvents="none"
    >
      <Icon
        name={isReconnected ? 'wifi' : 'wifi-off'}
        size={12}
        color={isReconnected ? '#4ade80' : '#999'}
      />
      <Text style={[styles.text, { color: isReconnected ? '#4ade80' : '#ccc' }]}>
        {isReconnected ? 'Connexion retablie' : 'Hors ligne'}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position:          'absolute',
    top:               0,
    left:              0,
    right:             0,
    zIndex:            99999,
    elevation:         99999,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    paddingBottom:     8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize:      12,
    fontWeight:    '600',
    letterSpacing: 0.3,
  },
});
