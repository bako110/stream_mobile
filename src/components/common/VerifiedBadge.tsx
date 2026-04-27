import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

// Badge bleu FoliX — icône seule
export const VerifiedBadge: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center',
  }}>
    <Icon name="check" size={size * 0.6} color="#fff" />
  </View>
);

// Nom + badge inline
interface Props {
  name: string;
  isVerified?: boolean;
  nameStyle?: object;
  size?: number;
  gap?: number;
}

export const UserNameWithBadge: React.FC<Props> = ({
  name, isVerified, nameStyle, size = 14, gap = 4,
}) => (
  <View style={[s.row, { gap }]}>
    <Text style={nameStyle} numberOfLines={1}>{name}</Text>
    {isVerified && <VerifiedBadge size={size} />}
  </View>
);

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
