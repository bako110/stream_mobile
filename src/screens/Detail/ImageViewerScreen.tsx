import React, { useState } from 'react';
import {
  View, Text, StatusBar, StyleSheet, TouchableOpacity, Alert, Platform,
  PermissionsAndroid, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../../components/common';
import { ZoomableImage } from '../../components/common/ZoomableImage';

const { width: SW, height: SH } = Dimensions.get('window');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RNBlobUtil = require('react-native-blob-util').default;

interface Props {
  route: { params: { url: string; label?: string; isMine?: boolean } };
  navigation: any;
}

export const ImageViewerScreen: React.FC<Props> = ({ route, navigation }) => {
  const { url, label, isMine } = route.params;
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [progress,    setProgress]    = useState(0);

  const handleDownload = async () => {
    if (downloading) return;

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        { title: 'Permission requise', message: 'Autoriser la sauvegarde dans vos téléchargements.', buttonPositive: 'Autoriser', buttonNegative: 'Refuser' },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission refusée', 'Impossible de sauvegarder sans permission.');
        return;
      }
    }

    const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
    const filename = `image_${Date.now()}.${ext}`;
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    };
    const mime = mimeMap[ext] ?? 'image/jpeg';
    const destPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${filename}`;

    setDownloading(true);
    setProgress(0);
    try {
      await RNBlobUtil.config({
        path: destPath,
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title: label ?? filename,
          description: 'Téléchargement en cours…',
          mime,
        },
      })
        .fetch('GET', url)
        .progress((received: number, total: number) => {
          setProgress(Math.round((Number(received) / Number(total)) * 100));
        });
      Alert.alert('Téléchargement terminé', 'Image sauvegardée dans vos téléchargements.');
    } catch {
      Alert.alert('Erreur', 'Le téléchargement a échoué. Réessaie plus tard.');
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

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
