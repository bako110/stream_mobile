import React, { useState, useCallback } from 'react';
import { View, ScrollView, Switch, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { Row, Card, PageHeader } from './_shared';
import { GofolyxLoader } from '../../components/common';
import { toastService } from '../../services';
import { getAppPreferences, setCachedAppPreferences, type StartScreen, type AppPreferences } from '../../hooks/useAppPreferences';

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
  // Un seul objet complet (pas des champs isolés) : le PUT /app-preferences
  // attend tout AppPreferences et écrase TOUTES ses colonnes avec ce qui est
  // envoyé (cf. update_app_preferences côté backend, data.model_dump()) — un
  // appel qui n'enverrait que preferred_start_screen réinitialiserait
  // silencieusement feed_autoplay_reels à sa valeur par défaut à chaque fois
  // qu'on change l'écran de démarrage, et inversement. On garde donc toujours
  // l'état complet en mémoire et on le renvoie intégralement à chaque PUT.
  const [appPrefs,            setAppPrefs]            = useState<AppPreferences>(() => getAppPreferences());
  const [savingStartScreen,   setSavingStartScreen]    = useState(false);
  const [savingAutoplay,      setSavingAutoplay]       = useState(false);

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
      apiClient.get<AppPreferences>(Endpoints.users.appPreferences)
        .then(res => {
          if (cancelled || !res.data) return;
          setAppPrefs(res.data);
          setCachedAppPreferences(res.data);
        })
        .catch(() => {/* garder la préférence en cache */});
      return () => { cancelled = true; };
    }, []),
  );

  const selectStartScreen = useCallback(async (next: StartScreen) => {
    if (savingStartScreen || next === appPrefs.preferred_start_screen) return;
    const previous = appPrefs;
    const updated = { ...appPrefs, preferred_start_screen: next };
    setAppPrefs(updated);
    setCachedAppPreferences(updated);
    setSavingStartScreen(true);
    try {
      await apiClient.put(Endpoints.users.appPreferences, updated);
      const labels: Record<StartScreen, string> = { feed: 'Accueil', reels: 'Reels', communities: 'Communautés' };
      toastService.success('Préférence enregistrée', `${labels[next]} s'ouvrira au démarrage de l'app.`);
    } catch {
      setAppPrefs(previous);
      setCachedAppPreferences(previous);
      toastService.error('Erreur', 'Impossible de sauvegarder la préférence.');
    } finally {
      setSavingStartScreen(false);
    }
  }, [appPrefs, savingStartScreen]);

  const toggleAutoplay = useCallback(async () => {
    if (savingAutoplay) return;
    const previous = appPrefs;
    const updated = { ...appPrefs, feed_autoplay_reels: !appPrefs.feed_autoplay_reels };
    setAppPrefs(updated);
    setCachedAppPreferences(updated);
    setSavingAutoplay(true);
    try {
      await apiClient.put(Endpoints.users.appPreferences, updated);
    } catch {
      setAppPrefs(previous);
      setCachedAppPreferences(previous);
      toastService.error('Erreur', 'Impossible de sauvegarder la préférence.');
    } finally {
      setSavingAutoplay(false);
    }
  }, [appPrefs, savingAutoplay]);

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
        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Navigation</Text>
        <Text style={[st.sectionHint, { color: colors.textTertiary }]}>
          Accède rapidement à tes concerts, événements, films et séries, et aux contenus tendance.
        </Text>
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
            const active = appPrefs.preferred_start_screen === opt.key;
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

        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Reels dans le fil</Text>
        <Card>
          <Row
            icon="play-circle"
            label="Lecture automatique"
            last
            right={
              savingAutoplay
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Switch
                    value={appPrefs.feed_autoplay_reels}
                    onValueChange={toggleAutoplay}
                    disabled={savingAutoplay}
                    trackColor={{ false: colors.divider ?? '#ccc', true: colors.primary }}
                    thumbColor="#fff"
                  />
            }
          />
        </Card>
        <Text style={[st.sectionHint, { color: colors.textTertiary, marginTop: -4 }]}>
          Les reels rencontrés en scrollant dans l'accueil se lisent automatiquement (sans son).
        </Text>

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
