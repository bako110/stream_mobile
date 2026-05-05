/**
 * ImagePickerSection — sélection et upload d'images vers Cloudinary.
 *
 * Props :
 *   folder        — dossier Cloudinary cible ('concerts' | 'events' | ...)
 *   maxImages     — nombre max d'images (défaut 5)
 *   images        — liste d'URLs distantes actuelles (état parent)
 *   onImagesChange — callback appelé quand la liste change
 *   label         — titre de la section (défaut "Photos")
 *   hint          — sous-titre (défaut "Sélectionnez jusqu'à N images")
 *   colors        — palette de couleurs du thème
 *
 * Comportement :
 *   1. Appui sur "+" → launchImageLibrary
 *   2. Preview locale immédiate (uri locale)
 *   3. Upload vers Cloudinary via le backend
 *   4. Remplacement de la preview locale par l'URL Cloudinary
 *   5. Croix rouge pour supprimer une image
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import type { Asset } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Feather';
import type { AppColors } from '../../theme/colors';
import type { UploadFolder, UploadedImage } from '../../services/uploadService';
import { API_BASE_URL, STORAGE_KEYS } from '../../utils/constants';
import { storage } from '../../utils/storage';
import ReactNativeBlobUtil from 'react-native-blob-util';

interface ImagePickerSectionProps {
  folder:          UploadFolder;
  maxImages?:      number;
  images:          string[];                    // URLs Cloudinary
  onImagesChange:  (urls: string[] | ((prev: string[]) => string[])) => void;
  label?:          string;
  hint?:           string;
  colors:          AppColors;
}

interface LocalImage {
  localUri:  string;
  remoteUrl: string | null;  // null = upload en cours
  publicId:  string | null;
  uploading: boolean;
  error:     boolean;
}

export const ImagePickerSection: React.FC<ImagePickerSectionProps> = ({
  folder,
  maxImages = 5,
  images,
  onImagesChange,
  label = 'Photos',
  hint,
  colors,
}) => {
  const [locals, setLocals] = useState<LocalImage[]>([]);
  const pickingRef = useRef(false);

  const canAdd = images.length + locals.filter(l => l.uploading).length < maxImages;

  const handlePick = () => {
    if (!canAdd) {
      Alert.alert('Maximum atteint', `Vous pouvez ajouter au maximum ${maxImages} images.`);
      return;
    }
    if (pickingRef.current) return;
    pickingRef.current = true;

    const remaining = maxImages - images.length;

    launchImageLibrary(
      { mediaType: 'photo', selectionLimit: remaining, quality: 1 },
      async (response) => {
        pickingRef.current = false;
        if (response.didCancel || !response.assets?.length) return;
        if (response.errorCode) {
          Alert.alert('Erreur', response.errorMessage ?? 'Impossible d\'accéder à la galerie');
          return;
        }

        const selected: Asset[] = response.assets ?? [];

        // Ajouter les previews locales immédiatement
        const newLocals: LocalImage[] = selected.map(a => ({
          localUri:  a.uri ?? '',
          remoteUrl: null,
          publicId:  null,
          uploading: true,
          error:     false,
        }));

        setLocals(prev => [...prev, ...newLocals]);

        // Upload toutes les images en une seule requête
        try {
          const results = await uploadViaPresigned(selected.filter(a => a.uri) as Asset[], folder);

          // Supprimer les previews locales uploadées — elles seront affichées via `images`
          setLocals(prev => prev.filter(l => !newLocals.find(n => n.localUri === l.localUri)));

          onImagesChange((prev: string[]) => [...prev, ...results.map((r: UploadedImage) => r.url)]);
        } catch (err: any) {
          console.warn('[ImagePickerSection] upload failed:', err);
          Alert.alert('Upload échoué', err?.message ?? "Les images n'ont pas pu être envoyées. Vérifiez votre connexion.");
          setLocals(prev => prev.map(l => l.uploading ? { ...l, uploading: false, error: true } : l));
        }
      },
    );
  };

  const handleRemoveRemote = (url: string) => {
    onImagesChange(images.filter(u => u !== url));
  };

  const handleRemoveLocal = (localUri: string) => {
    setLocals(prev => prev.filter(l => l.localUri !== localUri));
  };

  const actualHint = hint ?? `Sélectionnez jusqu'à ${maxImages} images`;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textTertiary }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.hint, { color: colors.textTertiary }]}>{actualHint}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {/* Images déjà uploadées */}
        {images.map((url, idx) => (
          <View key={url + idx} style={styles.thumb}>
            <Image source={{ uri: url }} style={styles.thumbImg} resizeMode="cover" />
            <TouchableOpacity
              style={[styles.removeBadge, { backgroundColor: colors.accentOrange }]}
              onPress={() => handleRemoveRemote(url)}
            >
              <Icon name="x" size={10} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Images en cours d'upload */}
        {locals.map((l, idx) => (
          <View key={l.localUri + idx} style={styles.thumb}>
            <Image source={{ uri: l.localUri }} style={[styles.thumbImg, l.error && styles.thumbError]} resizeMode="cover" />
            {l.uploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
            {l.error && (
              <View style={[styles.uploadingOverlay, { backgroundColor: 'rgba(220,50,50,0.6)' }]}>
                <Icon name="alert-circle" size={18} color="#fff" />
              </View>
            )}
            {!l.uploading && (
              <TouchableOpacity
                style={[styles.removeBadge, { backgroundColor: l.error ? '#e53' : colors.accentOrange }]}
                onPress={() => handleRemoveLocal(l.localUri)}
              >
                <Icon name="x" size={10} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Bouton ajouter */}
        {canAdd && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={handlePick}
          >
            <Icon name="plus" size={22} color={colors.primary} />
            <Text style={[styles.addText, { color: colors.primary }]}>
              {images.length === 0 ? 'Ajouter' : 'Ajouter\nune photo'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

// ── Upload helper — presigned URL (mobile → R2 direct) ───────────────────────

async function uploadViaPresigned(assets: Asset[], folder: UploadFolder): Promise<UploadedImage[]> {
  const token = storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const presignedUrl = `${API_BASE_URL}/api/v1/upload/presigned`;

  return Promise.all(
    assets.filter(a => a.uri).map(async (asset) => {
      const contentType = asset.type ?? 'image/jpeg';
      const filename = asset.fileName ?? `photo_${Date.now()}.jpg`;

      // 1. Obtenir la presigned URL depuis le backend
      const presignRes = await ReactNativeBlobUtil.fetch(
        'POST',
        presignedUrl,
        {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        JSON.stringify({ folder, filename, content_type: contentType }),
      );
      if (presignRes.respInfo.status >= 300) {
        const err = presignRes.json();
        throw new Error(err?.detail ?? `Presign error ${presignRes.respInfo.status}`);
      }
      const { upload_url, public_url } = presignRes.json();

      // 2. Upload direct vers R2 via PUT
      const uploadRes = await ReactNativeBlobUtil.fetch(
        'PUT',
        upload_url,
        { 'Content-Type': contentType },
        ReactNativeBlobUtil.wrap(asset.uri!.replace('file://', '')) as any,
      );
      if (uploadRes.respInfo.status >= 300) {
        throw new Error(`R2 upload error ${uploadRes.respInfo.status}`);
      }

      return { url: public_url, public_id: public_url } as UploadedImage;
    })
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const THUMB_SIZE = 90;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    marginBottom: 10,
  },
  row: {
    gap: 10,
    paddingBottom: 4,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
  },
  thumbImg: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumbError: {
    opacity: 0.5,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
