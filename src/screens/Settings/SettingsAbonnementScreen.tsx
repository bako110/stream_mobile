import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { subscriptionService } from '../../services/subscriptionService';
import { Row, Card, PageHeader } from './_shared';
import type { Subscription } from '../../types';

const PLAN_LABELS: Record<string, string> = { free: 'Gratuit', basic: 'Basic', premium: 'Premium', family: 'Family' };
const PLAN_COLORS: Record<string, string> = { free: '#9390AB', basic: '#3B82F6', premium: '#7B3FF2', family: '#E0389A' };

export const SettingsAbonnementScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;
  const [sub, setSub] = useState<Subscription | null>(null);

  useEffect(() => {
    subscriptionService.getMyCurrent().then(setSub).catch(() => {});
  }, []);

  const planKey   = sub?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planKey] ?? planKey;
  const planColor = PLAN_COLORS[planKey] ?? colors.primary;
  const planEnd   = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Abonnement" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Row
            icon="star" label="Mon plan"
            value={planEnd ? `Expire le ${planEnd}` : 'Aucun abonnement actif'}
            color={planColor}
            right={
              <View style={[st.badge, { backgroundColor: planColor + '20', borderColor: planColor + '40' }]}>
                <Text style={[st.badgeTxt, { color: planColor }]}>{planLabel}</Text>
              </View>
            }
          />
          <Row
            icon="credit-card" label="Gérer mon abonnement" value="Changer de plan ou résilier"
            color="#7B3FF2" onPress={() => nav.navigate('Subscriptions')} last
          />
        </Card>
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  scroll: { padding: 16 },
  badge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeTxt: { fontSize: 12, fontWeight: '700' },
});
