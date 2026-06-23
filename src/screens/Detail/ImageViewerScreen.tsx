import React from 'react';
import { View, Image, Text, StatusBar, StyleSheet } from 'react-native';
import { BackButton } from '../../components/common';

interface Props {
  route: { params: { url: string; label?: string } };
  navigation: any;
}

export const ImageViewerScreen: React.FC<Props> = ({ route, navigation }) => {
  const { url, label } = route.params;

  return (
    <View style={s.root}>
      <StatusBar hidden />
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      <View style={s.header}>
        <BackButton onPress={() => navigation.goBack()} transparent />
        {label ? <Text style={s.label}>{label}</Text> : null}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
  },
  label: {
    color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 14,
  },
});
