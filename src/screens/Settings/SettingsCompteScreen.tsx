import React from 'react';
import { View, ScrollView, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { Row, Card, PageHeader } from './_shared';

export const SettingsCompteScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Compte" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row icon="user"     label="Modifier le profil"      color="#7B3FF2" onPress={() => nav.navigate('EditProfile')} />
          <Row icon="lock"     label="Changer le mot de passe" color="#9B65F5" onPress={() => nav.navigate('ChangePassword')} />
          <Row icon="shield"   label="Confidentialité"         color="#3B82F6" onPress={() => nav.navigate('Privacy')} />
          <Row icon="monitor"  label="Connecter le site web"   color="#7B3FF2" value="Scanner un QR" onPress={() => nav.navigate('WebQRScanner')} />
          <Row icon="slash"    label="Utilisateurs bloqués"    color="#EF4444" onPress={() => nav.navigate('BlockedUsers')} />
          <Row icon="users"    label="Abonnements / Abonnés"   color="#10B981" onPress={() => nav.navigate('Following')} />
          <Row icon="zap"      label="Booster mon compte"      color="#E0389A" value="Gagne des abonnés et des vues" onPress={() => nav.navigate('Boost')} />
          <Row icon="download" label="Télécharger mes données" color="#6366F1"
            onPress={() => Alert.alert('Bientôt disponible', 'Export de données disponible prochainement.')} last />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({ scroll: { padding: 16 } });
