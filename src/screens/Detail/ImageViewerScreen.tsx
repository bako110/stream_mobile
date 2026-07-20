import React from 'react';
import {
  View, Text, StatusBar, StyleSheet, TouchableOpacity, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../../components/common';
import { ZoomableImage } from '../../components/common/ZoomableImage';
import { useMediaDownload } from '../../hooks/useMediaDownload';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  route: { params: { url: string; label?: string; isMine?: boolean } };
  navigation: any;
}

export const ImageViewerScreen: React.FC<Props> = ({ route, navigation }) => {
  const { url, label, isMine } = route.params;
  const insets = useSafeAreaInsets();
  const { get: getDl, download: startDl } = useMediaDownload();
  const dl = getDl(url);
  const downloading = dl.downloading;
  const progress = dl.progress;

  const handleDownload = () => startDl(url, url, false);

  return (
    <View style={s.root}>
      <StatusBar hidden />
      <ZoomableImage uri={url} width={SW} height={SH} />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} transparent />
        {label ? <Text style={s.label}>{label}</Text> : null}
        {!isMine && (
          <TouchableOpacity style={s.dlBtn} onPress={handleDownload} disabled={downloading}>
            {downloading ? (
              <View style={s.dlBadge}>
                <Text style={s.dlPct}>{progress}%</Text>
              </View>
            ) : (
              <View style={s.dlBadge}>
                <Icon name="download" size={18} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Barre de progression */}
      {!isMine && downloading && (
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 12, paddingHorizontal: 16,
  },
  label: {
    color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 14, flex: 1,
  },
  dlBtn: { marginLeft: 'auto' },
  dlBadge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  dlPct: { color: '#fff', fontSize: 11, fontWeight: '700' },
  progressBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: { height: 3, backgroundColor: '#fff' },
});
