import React, { useState, useCallback } from 'react';
import { View, ScrollView, Switch, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { storage } from '../../utils/storage';
import { Row, Card, PageHeader } from './_shared';
import { GofolyxLoader } from '../../components/common';
import { toastService } from '../../services';
import { getAppPreferences, type StartScreen } from '../../hooks/useAppPreferences';

interface FeedPrefs {
  feed_show_suggested_reels:       boolean;
  feed_show_suggested_people:      boolean;
  feed_show_suggested_communities: boolean;
}

const DEFAULT_FEED_PREFS: FeedPrefs = {
  feed_show_suggested_reels:       true,
  feed_show_suggested_people:      true,
  feed_show_suggested_communities: true,
};

const APP_PREFS_STORAGE_KEY = 'app_preferences';

const START_SCREEN_OPTIONS: { key: StartScreen; label: string; icon: string }[] = [
  { key: 'feed',        label: 'Accueil',      icon: 'home' },
  { key: 'reels',       label: 'Reels',        icon: 'film' },
  { key: 'communities', label: 'Communautés',  icon: 'grid' },
];

export const SettingsContenuScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [feedPrefs, setFeedPrefs] = useState<FeedPrefs>(DEFAULT_FEED_PREFS);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState<string | null>(null);
  const [startScreen,        setStartScreen]        = useState<StartScreen>(() => getAppPreferences().preferred_start_screen);
  const [savingStartScreen,  setSavingStartScreen]   = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      apiClient.get<FeedPrefs>(Endpoints.users.feedPreferences)
        .then(res => {
          if (cancelled) return;
          setFeedPrefs({ ...DEFAULT_FEED_PREFS, ...(res.data ?? {}) });
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      apiClient.get<{ preferred_start_screen: StartScreen }>(Endpoints.users.appPreferences)
        .then(res => {
          if (cancelled || !res.data?.preferred_start_screen) return;
          setStartScreen(res.data.preferred_start_screen);
          storage.setItem(APP_PREFS_STORAGE_KEY, JSON.stringify({ preferred_start_screen: res.data.preferred_start_screen }));
        })
        .catch(() => {/* garder la préférence en cache */});
      return () => { cancelled = true; };
    }, []),
  );

  const selectStartScreen = useCallback(async (next: StartScreen) => {
    if (savingStartScreen || next === startScreen) return;
    const previous = startScreen;
    setStartScreen(next);
    storage.setItem(APP_PREFS_STORAGE_KEY, JSON.stringify({ preferred_start_screen: next }));
    setSavingStartScreen(true);
    try {
      await apiClient.put(Endpoints.users.appPreferences, { preferred_start_screen: next });
    } catch {
      setStartScreen(previous);
      storage.setItem(APP_PREFS_STORAGE_KEY, JSON.stringify({ preferred_start_screen: previous }));
      toastService.error('Erreur', 'Impossible de sauvegarder la préférence.');
    } finally {
      setSavingStartScreen(false);
    }
  }, [startScreen, savingStartScreen]);

  const toggle = useCallback(async (field: keyof FeedPrefs) => {
    if (saving) return;
    const newVal = !feedPrefs[field];
    setFeedPrefs(prev => ({ ...prev, [field]: newVal }));
    setSaving(field);
    try {
      await apiClient.put(Endpoints.users.feedPreferences, { [field]: newVal });
    } catch {
      setFeedPrefs(prev => ({ ...prev, [field]: !newVal }));
      toastService.error('Erreur', 'Impossible de sauvegarder la préférence.');
    } finally {
      setSaving(null);
    }
  }, [feedPrefs, saving]);

  const sw = (field: keyof FeedPrefs) => (
    saving === field
      ? <ActivityIndicator size="small" color={colors.primary} />
      : <Switch
          value={!!feedPrefs[field]}
          onValueChange={() => toggle(field)}
          disabled={!!saving}
          trackColor={{ false: colors.divider ?? '#ccc', true: colors.primary }}
          thumbColor="#fff"
        />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Contenu" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="music"       label="Mes concerts"   color="#E0389A" onPress={() => nav.navigate('Concerts')} />
          <Row icon="calendar"    label="Mes événements" color="#FF9800" onPress={() => nav.navigate('Events')} />
          <Row icon="film"        label="Films & Séries" color="#2196F3" onPress={() => nav.navigate('Films')} />
          <Row icon="trending-up" label="Tendances"      color="#00BCD4" onPress={() => nav.navigate('Trending')} last />
        </Card>

        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Écran de démarrage</Text>
        <Text style={[st.sectionHint, { color: colors.textTertiary }]}>
          L'écran qui s'ouvre au lancement de l'application.
        </Text>
        <View style={st.startScreenRow}>
          {START_SCREEN_OPTIONS.map(opt => {
            const active = startScreen === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => selectStartScreen(opt.key)}
                disabled={savingStartScreen}
                activeOpacity={0.8}
                style={[st.startScreenChip, {
                  borderColor: active ? colors.primary : colors.divider,
                  backgroundColor: active ? colors.primary + '18' : colors.surface,
                }]}
              >
                {savingStartScreen && active ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name={opt.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
                )}
                <Text style={{ color: active ? colors.primary : colors.textSecondary, fontWeight: active ? '700' : '500', fontSize: 13 }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Suggestions dans le fil</Text>
        {loading ? (
          <GofolyxLoader color={colors.primary} />
        ) : (
          <Card>
            <Row icon="film"  label="Reels suggérés"        right={sw('feed_show_suggested_reels')} />
            <Row icon="users" label="Amis suggérés"         right={sw('feed_show_suggested_people')} />
            <Row icon="grid"  label="Communautés suggérées" right={sw('feed_show_suggested_communities')} last />
          </Card>
        )}
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  scroll:       { padding: 16, gap: 12, paddingBottom: 40 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginLeft: 4, marginTop: 4 },
  sectionHint:  { fontSize: 12, marginLeft: 4, marginTop: -8 },
  startScreenRow: { flexDirection: 'row', gap: 10 },
  startScreenChip: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
  },
});
