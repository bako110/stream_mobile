import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { CachedImage } from './CachedImage';

interface Props {
  avatarUrl?: string | null;
  initials?: string;
  size?: number;
  accentColor?: string;
  isOnline?: boolean | null;
  isVerified?: boolean;
  /** Anneau rouge/violet pulsant — l'utilisateur a un live actif en ce moment. */
  isLive?: boolean | null;
  style?: object;
}

export const AvatarWithBadge: React.FC<Props> = ({
  avatarUrl,
  initials = '?',
  size = 40,
  accentColor = '#7B3FF2',
  isOnline,
  isVerified,
  isLive,
  style,
}) => {
  const borderRadius = size / 2;
  const onlineBadgeSize = Math.max(10, Math.round(size * 0.27));
  const verifiedBadgeSize = Math.max(13, Math.round(size * 0.36));
  const pad = Math.ceil(verifiedBadgeSize * 0.4);
  const ringWidth = Math.max(2, Math.round(size * 0.06));
  const outerSize = isLive ? size + ringWidth * 2 : size;
  const containerSize = Math.max(size + pad, outerSize);
  // Les badges (vérifié/online) se positionnent en bottom/right relatifs au conteneur,
  // qui est plus grand que le cercle avatar réel (`size`) pour laisser respirer l'anneau
  // live — sans cet offset, le badge se collait au bord du conteneur au lieu du cercle,
  // et paraissait décalé hors de l'avatar.
  const avatarEdgeInset = containerSize - size;

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!isLive) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(1,    { duration: 800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1, true,
    );
  }, [isLive]); // eslint-disable-line
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const avatarInner = avatarUrl ? (
    <CachedImage uri={avatarUrl} style={{ width: size, height: size, borderRadius }} />
  ) : (
    <LinearGradient
      colors={[accentColor, accentColor + 'AA']}
      style={{ width: size, height: size, borderRadius, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.35, fontWeight: '800' }}>{initials}</Text>
    </LinearGradient>
  );

  return (
    <View style={[{ width: containerSize, height: containerSize }, style]}>
      {/* Avatar (+ anneau live si actif) */}
      {isLive ? (
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: outerSize, height: outerSize }, ringStyle]}>
          <LinearGradient
            colors={['#F0365A', '#E0389A', '#7B3FF2']}
            style={{ width: outerSize, height: outerSize, borderRadius: outerSize / 2, padding: ringWidth, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: size, height: size, borderRadius, overflow: 'hidden' }}>{avatarInner}</View>
          </LinearGradient>
          <View style={[s.liveBadge, { bottom: -2 }]}>
            <Text style={s.liveBadgeText}>LIVE</Text>
          </View>
        </Animated.View>
      ) : (
        <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }}>{avatarInner}</View>
      )}

      {/* Badge vérifié bleu — chevauche le bord bas-droite du cercle avatar réel. */}
      {isVerified && (
        <View style={[s.verified, {
          width: verifiedBadgeSize, height: verifiedBadgeSize,
          borderRadius: verifiedBadgeSize / 2,
          bottom: avatarEdgeInset - verifiedBadgeSize * 0.3,
          right:  avatarEdgeInset - verifiedBadgeSize * 0.3,
        }]}>
          <Icon name="check" size={verifiedBadgeSize * 0.6} color="#fff" />
        </View>
      )}

      {/* Badge online — toujours visible : vert si en ligne, brun si hors ligne (masqué si live, redondant) */}
      {!isLive && isOnline !== undefined && isOnline !== null && (
        <View style={[s.online, {
          width: onlineBadgeSize, height: onlineBadgeSize,
          borderRadius: onlineBadgeSize / 2,
          bottom: avatarEdgeInset - onlineBadgeSize * 0.3,
          left:  isVerified ? avatarEdgeInset - onlineBadgeSize * 0.3 : undefined,
          right: isVerified ? undefined : avatarEdgeInset - onlineBadgeSize * 0.3,
          backgroundColor: isOnline ? '#22C55E' : '#92400E',
        }]} />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  verified: {
    position: 'absolute',
    backgroundColor: '#1D9BF0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  online: {
    position: 'absolute',
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#fff',
  },
  liveBadge: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#F0365A',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
