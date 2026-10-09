import React, { useState, useCallback } from 'react';
import { View, ScrollView, Switch, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { Row, Card, PageHeader } from './_shared';
import { GofolyxLoader } from '../../components/common';
import { toastService } from '../../services';

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

export const SettingsContenuScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [feedPrefs, setFeedPrefs] = useState<FeedPrefs>(DEFAULT_FEED_PREFS);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState<string | null>(null);

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
      return () => { cancelled = true; };
    }, []),
  );

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
});
