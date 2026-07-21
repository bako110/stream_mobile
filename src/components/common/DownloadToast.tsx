/**
 * DownloadToast — toast global unique affichant la progression du téléchargement en
 * cours, quel que soit l'écran qui l'a déclenché (Reels, posts, messages, viewer
 * image/vidéo...). Rendu une fois au niveau racine (voir RootNavigator), piloté par
 * downloadToastService — reste visible même si l'écran/menu d'origine est fermé, et
 * disparaît seul une fois terminé.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadToastService, type DownloadToastState } from '../../services/downloadToastService';

export const DownloadToast: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DownloadToastState | null>(downloadToastService.getState());
  const slideY = useRef(new Animated.Value(80)).current;
  const wasVisibleRef = useRef(false);

  useEffect(() => downloadToastService.subscribe(setState), []);

  useEffect(() => {
    const visible = !!state;
    if (visible === wasVisibleRef.current) return;
    wasVisibleRef.current = visible;
    Animated.spring(slideY, {
      toValue: visible ? 0 : 80,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [state, slideY]);

  if (!state) return null;

  return (
    <Animated.View
      style={[
        s.wrap,
        { bottom: insets.bottom + 16, transform: [{ translateY: slideY }] },
      ]}
      pointerEvents="none"
    >
      {state.error ? (
        <Icon name="alert-circle" size={16} color="#EF4444" />
      ) : state.done ? (
        <Icon name="check-circle" size={16} color="#22C55E" />
      ) : (
        <ActivityIndicator size="small" color="#fff" />
      )}
      <Text style={s.text}>
        {state.error ? 'Téléchargement échoué' : state.done ? 'Téléchargé' : `Téléchargement… ${state.progress}%`}
      </Text>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(20,18,30,0.92)', borderRadius: 22,
    paddingVertical: 11, paddingHorizontal: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 12, zIndex: 9998, alignSelf: 'center', maxWidth: 320,
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
