import React from 'react';
import { View, ScrollView, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services/authService';
import { userService } from '../../services/userService';
import { Row, Card, PageHeader } from './_shared';

interface Props { onLogout?: () => void; }

export const SettingsDangerScreen: React.FC<Props> = ({ onLogout }) => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const handleDeleteAccount = () => {
    Alert.alert('Supprimer le compte', 'Votre compte sera définitivement supprimé. Toutes vos données seront effacées.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Continuer', style: 'destructive', onPress: () => {
        Alert.alert('Confirmer la suppression', 'Êtes-vous absolument sûr ? Cette action est irréversible.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: async () => {
            try {
              await userService.deleteMyAccount();
              await authService.logout();
              onLogout?.();
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Impossible de supprimer le compte.');
            }
          }},
        ]);
      }},
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Zone dangereuse" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="alert-triangle" label="Supprimer mon compte" value="Action irréversible" danger onPress={handleDeleteAccount} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
