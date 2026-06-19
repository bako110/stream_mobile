import React from 'react';
import { View, Image, TouchableOpacity, Text, StatusBar, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <View style={s.backBtn}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </View>
        </TouchableOpacity>
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
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 14,
  },
});
