import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking,
  Animated, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { updateService, AppVersionInfo } from '../../services/updateService';

// Doit correspondre à versionCode dans android/app/build.gradle
const CURRENT_VERSION_CODE = 1;

export const UpdateBanner: React.FC = () => {
  const { theme }  = useTheme();
  const insets     = useSafeAreaInsets();
  const [info,      setInfo]      = useState<AppVersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const slideY = useRef(new Animated.Value(140)).current;

  useEffect(() => {
    updateService.checkForUpdate()
      .then(v => {
        if (v.version_code > CURRENT_VERSION_CODE && v.apk_url) {
          setInfo(v);
          Animated.spring(slideY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 70,
            friction: 11,
          }).start();
        }
      })
      .catch(() => {});
  }, []);

  const dismiss = () => {
    if (info?.force_update) return;
    Animated.timing(slideY, { toValue: 140, duration: 220, useNativeDriver: true }).start(() => {
      setDismissed(true);
    });
  };

  const handleInstall = () => {
    if (!info?.apk_url) return;
    // Ouvre l'URL dans le navigateur par défaut →
    // Android propose automatiquement de télécharger l'APK via le DownloadManager système.
    // Aucune permission WRITE_EXTERNAL_STORAGE requise (obsolète sur Android 10+).
    Linking.openURL(info.apk_url).catch(() => {
      Alert.alert('Erreur', "Impossible d'ouvrir le lien de téléchargement.");
    });
  };

  if (!info || dismissed) return null;

  const c = theme.colors;
  const pb = Math.max(insets.bottom, 12);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          backgroundColor: c.surface,
          borderTopColor:  c.primary,
          paddingBottom:   pb,
          transform: [{ translateY: slideY }],
        },
      ]}
    >
      <View style={styles.row}>

        {/* Icone */}
        <View style={[styles.iconBox, { backgroundColor: `${c.primary}20` }]}>
          <Text style={[styles.iconArrow, { color: c.primary }]}>↑</Text>
        </View>

        {/* Texte */}
        <View style={styles.textBox}>
          <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
            {`Mise à jour disponible — v${info.version_name}`}
          </Text>
          {info.changelog
            ? <Text style={[styles.sub, { color: c.textSecondary }]} numberOfLines={2}>{info.changelog}</Text>
            : <Text style={[styles.sub, { color: c.textSecondary }]}>Appuyez sur Installer pour mettre à jour</Text>
          }
        </View>

        {/* Bouton Installer */}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: c.primary }]}
          onPress={handleInstall}
          activeOpacity={0.82}
        >
          <Text style={styles.btnText}>Installer</Text>
        </TouchableOpacity>

      </View>

      {/* Fermer — masqué si force_update */}
      {!info.force_update && (
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={dismiss}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Text style={[styles.closeText, { color: c.textTertiary }]}>✕</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position:      'absolute',
    bottom:        0,
    left:          0,
    right:         0,
    borderTopWidth: 2,
    paddingTop:    6,
    paddingHorizontal: 16,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius:  14,
    elevation:     20,
    zIndex:        9999,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 10,
    paddingRight:   32,
  },
  iconBox: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  iconArrow: {
    fontSize: 22, fontWeight: '900',
  },
  textBox: {
    flex: 1,
  },
  title: {
    fontSize: 13, fontWeight: '700',
  },
  sub: {
    fontSize: 11, marginTop: 2, lineHeight: 15,
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical:   10,
    borderRadius:      22,
    flexShrink:        0,
  },
  btnText: {
    color: '#fff', fontSize: 13, fontWeight: '800',
  },
  closeBtn: {
    position: 'absolute', top: 10, right: 12,
  },
  closeText: {
    fontSize: 15, fontWeight: '600',
  },
});
