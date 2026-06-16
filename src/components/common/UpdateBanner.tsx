import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking,
  Animated, Platform, PermissionsAndroid, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { updateService, AppVersionInfo } from '../../services/updateService';

// versionCode courant de l'app (doit correspondre à build.gradle versionCode)
const CURRENT_VERSION_CODE = 1;

interface Props {
  /** Si true, l'utilisateur ne peut pas fermer la bannière */
  force?: boolean;
}

export const UpdateBanner: React.FC<Props> = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const slideY = useRef(new Animated.Value(120)).current;

  useEffect(() => {
    updateService.checkForUpdate().then(v => {
      if (v.version_code > CURRENT_VERSION_CODE) {
        setInfo(v);
        Animated.spring(slideY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }).start();
      }
    }).catch(() => {});
  }, []);

  const dismiss = () => {
    if (info?.force_update) return;
    Animated.timing(slideY, { toValue: 120, duration: 250, useNativeDriver: true }).start(() => {
      setDismissed(true);
    });
  };

  const handleDownload = async () => {
    if (!info?.apk_url) return;

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Permission de stockage',
            message: 'GoFolyX a besoin d\'accéder au stockage pour télécharger la mise à jour.',
            buttonPositive: 'Autoriser',
            buttonNegative: 'Annuler',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      } catch {}

      try {
        // Utiliser react-native-blob-util si disponible, sinon Linking
        const RNBlobUtil = require('react-native-blob-util').default;
        const dirs = RNBlobUtil.fs.dirs;
        const fileName = `gofolyx-${info.version_name}.apk`;
        const destPath = `${dirs.DownloadDir}/${fileName}`;

        setDownloading(true);
        setProgress(0);

        const task = RNBlobUtil.config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            title: `GoFolyX ${info.version_name}`,
            description: 'Téléchargement de la mise à jour...',
            mime: 'application/vnd.android.package-archive',
            path: destPath,
          },
        }).fetch('GET', info.apk_url);

        task.progress((received: number, total: number) => {
          setProgress(Math.round((received / total) * 100));
        });

        await task;
        setDownloading(false);

        // Ouvrir le fichier APK pour installation
        RNBlobUtil.android.actionViewIntent(destPath, 'application/vnd.android.package-archive');
      } catch {
        // Fallback : ouvrir dans le navigateur
        setDownloading(false);
        Linking.openURL(info.apk_url).catch(() => {
          Alert.alert('Erreur', 'Impossible d\'ouvrir le lien de téléchargement.');
        });
      }
    } else {
      // iOS : ouvrir le Store
      Linking.openURL(info.apk_url).catch(() => {});
    }
  };

  if (!info || dismissed) return null;

  const colors = theme.colors;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.primary,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
          transform: [{ translateY: slideY }],
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Barre de progression download */}
      {downloading && (
        <View style={[styles.progressTrack, { backgroundColor: colors.backgroundSecondary }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` as any, backgroundColor: colors.primary },
            ]}
          />
        </View>
      )}

      <View style={styles.row}>
        {/* Icone update */}
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}22` }]}>
          <Text style={styles.iconText}>↑</Text>
        </View>

        {/* Texte */}
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {downloading
              ? `Téléchargement... ${progress}%`
              : `Mise à jour disponible — v${info.version_name}`
            }
          </Text>
          {info.changelog && !downloading && (
            <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={2}>
              {info.changelog}
            </Text>
          )}
        </View>

        {/* Bouton */}
        {!downloading && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleDownload}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Installer</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Fermer (sauf force_update) */}
      {!info.force_update && !downloading && (
        <TouchableOpacity style={styles.closeBtn} onPress={dismiss} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Text style={[styles.closeText, { color: colors.textTertiary }]}>✕</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 2,
    paddingTop: 4,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
    zIndex: 9999,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
    marginHorizontal: -16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingRight: 28,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#7B3FF2',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    flexShrink: 0,
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 12,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
