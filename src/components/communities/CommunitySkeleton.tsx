import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const SkeletonPulse: React.FC<{ style?: object }> = ({ style }) => {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[{ backgroundColor: '#2A2A3A', borderRadius: 10, opacity: anim }, style]}
    />
  );
};

export const CommunitySkeletonCard: React.FC = () => (
  <View style={SK.card}>
    <SkeletonPulse style={SK.banner} />
    <View style={SK.body}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <SkeletonPulse style={SK.avatar} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonPulse style={SK.line1} />
          <SkeletonPulse style={SK.line2} />
        </View>
      </View>
      <SkeletonPulse style={SK.btn} />
    </View>
  </View>
);

const SK = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  banner: { height: 120, borderRadius: 0 },
  body: { padding: 14 },
  avatar: { width: 52, height: 52, borderRadius: 14 },
  line1: { height: 14, width: '60%' },
  line2: { height: 11, width: '40%' },
  btn: { height: 40, borderRadius: 12 },
});
