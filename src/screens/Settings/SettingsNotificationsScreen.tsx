import React, { useEffect, useState } from 'react';
import { View, ScrollView, Switch, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { notificationService } from '../../services/notificationService';
import { Row, Card, PageHeader } from './_shared';

export const SettingsNotificationsScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;
  const [pushEnabled, setPushEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    notificationService.getUnreadCount().then(setUnreadCount).catch(() => {});
  }, []);

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Notifications" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="bell" label="Notifications push"
            right={<Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
          />
          <Row icon="inbox" label="Voir les notifications"
            value={unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Toutes lues'}
            color="#3B82F6" onPress={() => nav.navigate('Notifications')}
          />
          <Row icon="check-circle" label="Tout marquer comme lu" color="#10B981" onPress={handleMarkAllRead} />
          <Row icon="trash-2" label="Effacer toutes les notifications" color="#F59E0B" onPress={handleClearNotifs} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
