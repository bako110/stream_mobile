import React, { useState, useCallback } from 'react';
import { View, ScrollView, Switch, Alert, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { notificationService } from '../../services/notificationService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { Row, Card, PageHeader } from './_shared';

interface NotifPrefs {
  notif_push_enabled:  boolean;
  notif_likes:         boolean;
  notif_comments:      boolean;
  notif_follows:       boolean;
  notif_messages:      boolean;
  notif_community:     boolean;
  notif_events:        boolean;
  notif_wallet:        boolean;
  notif_live:          boolean;
  notif_profile_views: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  notif_push_enabled:  true,
  notif_likes:         true,
  notif_comments:      true,
  notif_follows:       true,
  notif_messages:      true,
  notif_community:     true,
  notif_events:        true,
  notif_wallet:        true,
  notif_live:          true,
  notif_profile_views: true,
};

export const SettingsNotificationsScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [prefs,       setPrefs]       = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [saving,      setSaving]      = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Rechargement à chaque fois que l'écran prend le focus
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError(false);

      Promise.all([
        apiClient.get<NotifPrefs>(Endpoints.notifications.preferences),
        notificationService.getUnreadCount(),
      ])
        .then(([prefsRes, count]) => {
          if (cancelled) return;
          setPrefs({ ...DEFAULT_PREFS, ...(prefsRes.data ?? {}) });
          setUnreadCount(typeof count === 'number' ? count : 0);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => { cancelled = true; };
    }, []),
  );

  const toggle = useCallback(async (field: keyof NotifPrefs) => {
    if (saving) return; // empêcher les toggles simultanés
    const newVal = !prefs[field];
    setPrefs(prev => ({ ...prev, [field]: newVal }));
    setSaving(field);
    try {
      await apiClient.put(Endpoints.notifications.preferences, { [field]: newVal });
    } catch {
      setPrefs(prev => ({ ...prev, [field]: !newVal }));
      Alert.alert('Erreur', 'Impossible de sauvegarder la préférence.');
    } finally {
      setSaving(null);
    }
  }, [prefs, saving]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationService.markAllRead();
      setUnreadCount(0);
    } catch {
      Alert.alert('Erreur', 'Impossible de marquer les notifications comme lues.');
    }
  }, []);

  const handleClearNotifs = useCallback(() => {
    Alert.alert(
      'Effacer les notifications',
      'Supprimer toutes vos notifications ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Effacer', style: 'destructive',
          onPress: async () => {
            try {
              await notificationService.deleteAll();
              setUnreadCount(0);
            } catch {
              Alert.alert('Erreur', 'Impossible d\'effacer les notifications.');
            }
          },
        },
      ],
    );
  }, []);

  const sw = (field: keyof NotifPrefs) => (
    saving === field
      ? <ActivityIndicator size="small" color={colors.primary} />
      : <Switch
          value={!!prefs[field]}
          onValueChange={() => toggle(field)}
          disabled={!!saving || (!prefs.notif_push_enabled && field !== 'notif_push_enabled')}
          trackColor={{ false: colors.divider ?? '#ccc', true: colors.primary }}
          thumbColor="#fff"
        />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Notifications" onBack={() => nav.goBack()} />

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={st.centered}>
          <Text style={[st.errorText, { color: colors.textTertiary }]}>
            Impossible de charger les préférences.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* Push global */}
          <Card>
            <Row icon="bell" label="Notifications push" right={sw('notif_push_enabled')} last />
          </Card>

          {/* Par catégorie — désactivé visuellement si push global off */}
          <Card>
            <Row icon="heart"          label="Likes & réactions"      right={sw('notif_likes')}      />
            <Row icon="message-circle" label="Commentaires & mentions" right={sw('notif_comments')}  />
            <Row icon="user-plus"      label="Abonnements"            right={sw('notif_follows')}    />
            <Row icon="send"           label="Messages directs"        right={sw('notif_messages')}   />
            <Row icon="eye"            label="Visites de profil"      right={sw('notif_profile_views')} />
            <Row icon="users"          label="Communautés"            right={sw('notif_community')}  />
            <Row icon="calendar"       label="Événements & rappels"   right={sw('notif_events')}     />
            <Row icon="zap"            label="Wallet & transactions"  right={sw('notif_wallet')}     />
            <Row icon="radio"          label="Lives"                  right={sw('notif_live')} last  />
          </Card>

          {/* Actions rapides */}
          <Card>
            <Row
              icon="inbox"
              label="Voir les notifications"
              value={unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Toutes lues'}
              color="#3B82F6"
              onPress={() => nav.navigate('Notifications')}
            />
            <Row
              icon="check-circle"
              label="Tout marquer comme lu"
              color="#10B981"
              onPress={handleMarkAllRead}
            />
            <Row
              icon="trash-2"
              label="Effacer toutes les notifications"
              color="#F59E0B"
              onPress={handleClearNotifs}
              last
            />
          </Card>

        </ScrollView>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  scroll:     { padding: 16, gap: 12, paddingBottom: 40 },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:  { fontSize: 14, textAlign: 'center' },
});
