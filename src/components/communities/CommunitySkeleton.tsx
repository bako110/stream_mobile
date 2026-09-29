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

// Reflète la disposition réelle de CommunityCard (ligne WhatsApp-style : avatar
// rond à gauche, 2 lignes de texte + séparateur à droite) — avant, ce skeleton
// simulait une carte avec grande bannière en haut, un format qui n'existe plus.
export const CommunitySkeletonCard: React.FC = () => (
  <View style={SK.row}>
    <SkeletonPulse style={SK.avatar} />
    <View style={SK.inner}>
      <View style={SK.row1}>
        <SkeletonPulse style={SK.name} />
        <SkeletonPulse style={SK.members} />
      </View>
      <View style={SK.row2}>
        <SkeletonPulse style={SK.subline} />
        <SkeletonPulse style={SK.pill} />
      </View>
    </View>
  </View>
);

const SK = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 14 },
  inner: {
    flex: 1,
    paddingVertical: 13,
    paddingRight: 16,
    gap: 8,
  },
  row1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { height: 15, width: '45%', borderRadius: 4 },
  members: { height: 12, width: 28, borderRadius: 4 },
  row2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subline: { height: 13, width: '60%', borderRadius: 4 },
  pill: { height: 24, width: 72, borderRadius: 14 },
});
