import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';

interface Props {
  avatarUrl?: string | null;
  initials?: string;
  size?: number;
  accentColor?: string;
  isOnline?: boolean | null;
  isVerified?: boolean;
  style?: object;
}

export const AvatarWithBadge: React.FC<Props> = ({
  avatarUrl,
  initials = '?',
  size = 40,
  accentColor = '#7B3FF2',
  isOnline,
  isVerified,
  style,
}) => {
  const borderRadius = size / 2;
  const onlineBadgeSize = Math.max(10, Math.round(size * 0.27));
  const verifiedBadgeSize = Math.max(13, Math.round(size * 0.36));
  const pad = Math.ceil(verifiedBadgeSize * 0.4);

  return (
    <View style={[{ width: size + pad, height: size + pad }, style]}>
      {/* Avatar */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius }} />
        ) : (
          <LinearGradient
            colors={[accentColor, accentColor + 'AA']}
            style={{ width: size, height: size, borderRadius, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: size * 0.35, fontWeight: '800' }}>{initials}</Text>
          </LinearGradient>
        )}
      </View>

      {/* Badge vérifié bleu — bas droite */}
      {isVerified && (
        <View style={[s.verified, {
          width: verifiedBadgeSize, height: verifiedBadgeSize,
          borderRadius: verifiedBadgeSize / 2,
          bottom: 0, right: 0,
        }]}>
          <Icon name="check" size={verifiedBadgeSize * 0.6} color="#fff" />
        </View>
      )}

      {/* Badge online vert — bas gauche (ou bas droite si pas de verified) */}
      {isOnline === true && (
        <View style={[s.online, {
          width: onlineBadgeSize, height: onlineBadgeSize,
          borderRadius: onlineBadgeSize / 2,
          bottom: 0,
          left: isVerified ? 0 : undefined,
          right: isVerified ? undefined : 0,
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
});
