import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader, SkeletonSubscriptions } from '../../components/common';
import { subscriptionService } from '../../services/subscriptionService';
import type { Subscription } from '../../types';

const PLAN_COLORS: Record<string, string[]> = {
  basic:    ['#3B82F6', '#6366F1'],
  standard: ['#7B3FF2', '#A855F7'],
  premium:  ['#E0389A', '#F43F5E'],
};
const PLAN_LABELS: Record<string, string> = {
  basic:    'Essentiel',
  standard: 'Standard',
  premium:  'Premium',
};
const PLAN_FEATURES: Record<string, string[]> = {
  basic:    ['HD 720p', '1 écran', 'Téléchargements limités'],
  standard: ['Full HD 1080p', '2 écrans simultanés', 'Téléchargements illimités'],
  premium:  ['4K Ultra HD', '4 écrans simultanés', 'Téléchargements illimités', 'Accès anticipé'],
};

export const SubscriptionsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, fontSize } = theme;

  const [current,   setCurrent]   = useState<Subscription | null>(null);
  const [history,   setHistory]   = useState<Subscription[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [cancelling,setCancelling]= useState(false);

  const load = useCallback(async () => {
    try {
      const [cur, hist] = await Promise.all([
        subscriptionService.getMyCurrent(),
        subscriptionService.getHistory().catch(() => []),
      ]);
      setCurrent(cur);
      setHistory(Array.isArray(hist) ? hist : []);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const handleCancel = () => {
    Alert.alert(
      'Résilier l\'abonnement',
      'Voulez-vous vraiment résilier votre abonnement? Vous garderez l\'accès jusqu\'à la fin de la période payée.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Résilier', style: 'destructive', onPress: async () => {
          setCancelling(true);
          try { await subscriptionService.cancel(); await load(); }
          catch { Alert.alert('Erreur', 'Impossible de résilier l\'abonnement.'); }
          finally { setCancelling(false); }
        }},
      ],
    );
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Abonnements" variant="default" />
      <SkeletonSubscriptions />
    </View>
  );

  const plan = (current?.plan ?? 'basic') as string;
  const gradColors = PLAN_COLORS[plan] ?? PLAN_COLORS.basic;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Abonnements" variant="default" />

      <FlatList
        data={history}
        keyExtractor={i => String(i.id ?? Math.random())}
        contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <>
            {current ? (
              <Animated.View entering={FadeInDown.springify()}>
                <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View>
                      <Text style={styles.cardLabel}>Plan actuel</Text>
                      <Text style={styles.cardPlan}>{PLAN_LABELS[plan] ?? plan}</Text>
                    </View>
                    <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Actif</Text></View>
                  </View>
                  <View style={styles.featuresWrap}>
                    {(PLAN_FEATURES[plan] ?? []).map(f => (
                      <View key={f} style={styles.featureRow}>
                        <Icon name="check" size={13} color="#fff" style={{ marginTop: 1 }} />
                        <Text style={styles.featureText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                  {current.end_date && (
                    <Text style={styles.renewText}>Renouvellement : {new Date(current.end_date).toLocaleDateString('fr-FR')}</Text>
                  )}
                  <TouchableOpacity onPress={handleCancel} disabled={cancelling} style={styles.cancelBtn}>
                    {cancelling
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.cancelBtnText}>Résilier</Text>
                    }
                  </TouchableOpacity>
                </LinearGradient>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown.springify()} style={[styles.noSubCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Icon name="award" size={36} color={colors.textTertiary} />
                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: fontSize.md, marginTop: 10 }}>Aucun abonnement actif</Text>
                <Text style={{ color: colors.textTertiary, fontSize: fontSize.sm, textAlign: 'center', marginTop: 6 }}>Choisissez un plan pour accéder à tout le contenu exclusif.</Text>
                {(['basic', 'standard', 'premium'] as const).map((p, idx) => (
                  <Animated.View key={p} entering={FadeInDown.delay(idx * 80).springify()} style={{ width: '100%', marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.planBtn, { backgroundColor: (PLAN_COLORS[p]?.[0] ?? colors.primary) + '18', borderColor: PLAN_COLORS[p]?.[0] ?? colors.primary }]}
                      activeOpacity={0.8}
                      onPress={() => subscriptionService.subscribe(p as any).then(load).catch(() => Alert.alert('Erreur', 'Abonnement impossible.'))}
                    >
                      <Text style={{ color: PLAN_COLORS[p]?.[0] ?? colors.primary, fontWeight: '700', fontSize: fontSize.sm }}>{PLAN_LABELS[p]}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </Animated.View>
            )}

            {history.length > 0 && (
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Historique</Text>
            )}
          </>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 30).springify()}>
            <View style={[styles.histRow, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
              <View>
                <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: fontSize.sm }}>{PLAN_LABELS[(item.plan ?? 'basic') as string] ?? item.plan}</Text>
                {item.start_date && <Text style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>{new Date(item.start_date).toLocaleDateString('fr-FR')}</Text>}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? '#10B981' : colors.textTertiary }]}>
                <Text style={styles.statusBadgeText}>{item.status === 'active' ? 'Actif' : 'Terminé'}</Text>
              </View>
            </View>
          </Animated.View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card:            { borderRadius: 18, padding: 20 },
  cardTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel:       { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  cardPlan:        { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  activeBadge:     { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  featuresWrap:    { marginTop: 14, gap: 6 },
  featureRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  featureText:     { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  renewText:       { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 14 },
  cancelBtn:       { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  noSubCard:       { borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, gap: 0 },
  planBtn:         { borderRadius: 12, borderWidth: 1.5, paddingVertical: 12, alignItems: 'center' },
  sectionTitle:    { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  histRow:         { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
