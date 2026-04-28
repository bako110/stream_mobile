import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'react-native-video';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';

interface VideoPickerFieldProps {
  label?:     string;
  hint?:      string;
  localUri:   string;
  remoteUrl:  string;
  uploading?: boolean;
  colors:     AppColors;
  onPick:     (uri: string) => void;
  onRemove:   () => void;
}

// Composant interne monté seulement quand on a une URI valide
const VideoPreview: React.FC<{
  uri: string;
  isLocal: boolean;
  uploading: boolean;
  onRemove: () => void;
}> = ({ uri, isLocal, uploading, onRemove }) => {
  const player = useVideoPlayer({ uri }, p => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  return (
    <View style={styles.preview}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        controls
      />
      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.uploadingText}>Upload en cours…</Text>
        </View>
      )}
      {!uploading && (
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove} activeOpacity={0.8}>
          <Icon name="x" size={16} color="#fff" />
        </TouchableOpacity>
      )}
      {isLocal && !uploading && (
        <View style={styles.localBadge}>
          <Icon name="clock" size={10} color="#fff" />
          <Text style={styles.localBadgeText}>Upload au moment de sauvegarder</Text>
        </View>
      )}
    </View>
  );
};

export const VideoPickerField: React.FC<VideoPickerFieldProps> = ({
  label = 'Vidéo publicitaire',
  hint  = 'Ajoutez une vidéo promotionnelle',
  localUri, remoteUrl, uploading = false,
  colors, onPick, onRemove,
}) => {
  const activeUri = localUri || remoteUrl;

  const handlePick = () => {
    launchImageLibrary(
      { mediaType: 'video', selectionLimit: 1, videoQuality: 'medium' as any },
      (response) => {
        if (response.didCancel) return;
        if (response.errorCode) {
          Alert.alert('Erreur', response.errorMessage ?? 'Impossible de sélectionner la vidéo.');
          return;
        }
        const asset = response.assets?.[0];
        if (asset?.uri) onPick(asset.uri);
      },
    );
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textTertiary }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.hint, { color: colors.textDisabled }]}>{hint}</Text>

      {activeUri ? (
        <View style={[styles.previewContainer, { backgroundColor: colors.backgroundSecondary }]}>
          <VideoPreview
            uri={activeUri}
            isLocal={!!localUri}
            uploading={uploading}
            onRemove={onRemove}
          />
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.pickBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
          onPress={handlePick}
          activeOpacity={0.75}
        >
          <View style={[styles.pickIcon, { backgroundColor: colors.primary + '18' }]}>
            <Icon name="video" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.pickLabel, { color: colors.textPrimary }]}>Sélectionner une vidéo</Text>
          <Text style={[styles.pickSub, { color: colors.textTertiary }]}>MP4 · MOV · Max 100 MB</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap:  { marginTop: 16 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  hint:  { fontSize: 12, marginBottom: 10 },

  previewContainer: {
    width: '100%', height: 220,
    borderRadius: 12, overflow: 'hidden',
  },
  preview: {
    width: '100%', height: '100%',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  uploadingText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  removeBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  localBadge: {
    position: 'absolute', bottom: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  localBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },

  pickBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12,
    padding: 24, alignItems: 'center', gap: 8,
  },
  pickIcon:  { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  pickLabel: { fontSize: 15, fontWeight: '700' },
  pickSub:   { fontSize: 12 },
});
