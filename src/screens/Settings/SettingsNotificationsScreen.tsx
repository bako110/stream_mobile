import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, Switch, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { notificationService } from '../../services/notificationService';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { Row, Card, PageHeader } from './_shared';

interface NotifPrefs {
  notif_push_enabled: boolean;
  notif_likes:        boolean;
  notif_comments:     boolean;
  notif_follows:      boolean;
  notif_messages:     boolean;
  notif_community:    boolean;
  notif_events:       boolean;
  notif_wallet:       boolean;
  notif_live:         boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  notif_push_enabled: true,
  notif_likes:        true,
  notif_comments:     true,
  notif_follows:      true,
  notif_messages:     true,
  notif_community:    true,
  notif_events:       true,
  notif_wallet:       true,
  notif_live:         true,
};

export const SettingsNotificationsScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [prefs,      setPrefs]      = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState<string | null>(null);
  const [unreadCount,setUnreadCount]= useState(0);

  useEffect(() => {
    Promise.all([
      apiClient.get<NotifPrefs>(Endpoints.notifications.preferences),
      notificationService.getUnreadCount(),
    ]).then(([prefsRes, count]) => {
      setPrefs(prefsRes.data ?? DEFAULT_PREFS);
      setUnreadCount(count);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggle = useCallback(async (field: keyof NotifPrefs) => {
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
  }, [prefs]);

  const handleMarkAllRead = async () => {
    try { await notificationService.markAllRead(); setUnreadCount(0); }
    catch { Alert.alert('Erreur', 'Impossible de marquer les notifications.'); }
  };

  const handleClearNotifs = () => {
    Alert.alert('Effacer les notifications', 'Supprimer toutes vos notifications ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: async () => {
        try { await notificationService.deleteAll(); setUnreadCount(0); }
        catch { Alert.alert('Erreur', 'Impossible d\'effacer les notifications.'); }
      }},
    ]);
  };

  const sw = (field: keyof NotifPrefs) => (
    saving === field
      ? <ActivityIndicator size="small" color={colors.primary} />
      : <Switch
          value={prefs[field]}
          onValueChange={() => toggle(field)}
          disabled={!prefs.notif_push_enabled && field !== 'notif_push_enabled'}
          trackColor={{ true: colors.primary }}
          thumbColor="#fff"
        />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Notifications" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Push global */}
            <Card>
              <Row icon="bell" label="Notifications push" right={sw('notif_push_enabled')} last />
            </Card>

            {/* Par catégorie */}
            <Card>
              <Row icon="heart"         label="Likes & réactions"     right={sw('notif_likes')}      />
              <Row icon="message-circle"label="Commentaires & mentions"right={sw('notif_comments')}  />
              <Row icon="user-plus"     label="Abonnements"           right={sw('notif_follows')}    />
              <Row icon="send"          label="Messages directs"       right={sw('notif_messages')}   />
              <Row icon="users"         label="Communautés"           right={sw('notif_community')}  />
              <Row icon="calendar"      label="Événements & rappels"  right={sw('notif_events')}     />
              <Row icon="zap"           label="Wallet & transactions" right={sw('notif_wallet')}     />
              <Row icon="radio"         label="Lives"                 right={sw('notif_live')} last  />
            </Card>

            {/* Actions */}
            <Card>
              <Row icon="inbox" label="Voir les notifications"
                value={unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Toutes lues'}
                color="#3B82F6" onPress={() => nav.navigate('Notifications')}
              />
              <Row icon="check-circle" label="Tout marquer comme lu" color="#10B981" onPress={handleMarkAllRead} />
              <Row icon="trash-2" label="Effacer toutes les notifications" color="#F59E0B" onPress={handleClearNotifs} last />
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16, gap: 12 } });
