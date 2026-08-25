import React, { useState, useCallback } from 'react';
import { View, ScrollView, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { storage } from '../../utils/storage';
import { Row, Card, PageHeader } from './_shared';
import { GofolyxLoader } from '../../components/common';
import { toastService } from '../../services';

interface PlaybackPrefs {
  autoplay:     boolean;
  hd_streaming: boolean;
  record_live_enabled: boolean;
}

const STORAGE_KEY = 'playback_prefs';
const DEFAULT_PREFS: PlaybackPrefs = { autoplay: true, hd_streaming: false, record_live_enabled: false };

function loadCached(): PlaybackPrefs {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

export const SettingsLectureScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [prefs,   setPrefs]   = useState<PlaybackPrefs>(loadCached);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<keyof PlaybackPrefs | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      apiClient.get<PlaybackPrefs>(Endpoints.users.playback)
        .then(res => {
          if (cancelled) return;
          const merged = { ...DEFAULT_PREFS, ...(res.data ?? {}) };
          setPrefs(merged);
          storage.setItem(STORAGE_KEY, JSON.stringify(merged));
        })
        .catch(() => {/* garder les prefs en cache */})
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, []),
  );

  const toggle = useCallback(async (field: keyof PlaybackPrefs) => {
    if (saving) return;
    const newVal = !prefs[field];
    const updated = { ...prefs, [field]: newVal };
    setPrefs(updated);
    storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSaving(field);
    try {
      await apiClient.put(Endpoints.users.playback, updated);
    } catch {
      setPrefs(prefs);
      storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      toastService.error('Erreur', 'Impossible de sauvegarder la préférence.');
    } finally {
      setSaving(null);
    }
  }, [prefs, saving]);

  const sw = (field: keyof PlaybackPrefs) =>
    saving === field
      ? <ActivityIndicator size="small" color={colors.primary} />
      : <Switch
          value={!!prefs[field]}
          onValueChange={() => toggle(field)}
          disabled={!!saving}
          trackColor={{ false: colors.divider ?? '#ccc', true: colors.primary }}
          thumbColor="#fff"
        />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Lecture" onBack={() => nav.goBack()} />
      {loading ? (
        <GofolyxLoader fullScreen color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <Card>
            <Row icon="play" label="Lecture automatique"
              right={sw('autoplay')}
            />
            <Row icon="wifi" label="Streaming HD" value="Utilise plus de données mobiles"
              right={sw('hd_streaming')}
            />
            <Row icon="video" label="Enregistrer mes lives" value="Sauvegarde une vidéo complète (vidéo + chat) de tes lives, battles et concerts"
              last right={sw('record_live_enabled')}
            />
          </Card>
        </ScrollView>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  scroll:   { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
