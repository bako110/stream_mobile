import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';
import type { User } from '../../types/user';

interface Props {
  currentUser: User | null;
  colors: AppColors;
  onPress: () => void;
}

export const CreatePostBox: React.FC<Props> = ({ currentUser, colors, onPress }) => {
  const displayName = currentUser?.display_name ?? currentUser?.first_name ?? currentUser?.username ?? '';
  const initials    = displayName ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';
  const firstName   = displayName.split(' ')[0];

  return (
    <TouchableOpacity
      style={[box.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {currentUser?.avatar_url ? (
        <Image source={{ uri: currentUser.avatar_url }} style={box.avatar} />
      ) : (
        <View style={[box.avatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>{initials}</Text>
        </View>
      )}

      <Text style={[box.placeholder, { color: colors.textTertiary }]}>
        {firstName ? `Quoi de neuf, ${firstName} ?` : 'Quoi de neuf ?'}
      </Text>

      <View style={[box.photoBtn, { borderColor: colors.primary + '55' }]}>
        <Icon name="image" size={16} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
};

const box = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginHorizontal: 12, marginBottom: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  avatar:      { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  placeholder: { flex: 1, fontSize: 15 },
  photoBtn:    { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
