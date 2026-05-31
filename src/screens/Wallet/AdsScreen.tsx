/**
 * AdsScreen — Dashboard annonceur.
 * Liste des campagnes, stats globales, bouton créer.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { adService, type Ad } from '../../services/adService';

export const AdsScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [ads, setAds]           = useState<Ad[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adService.getMine();
      setAds(data);
    } catch { setAds([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Stats globales ────────────────────────────────────────────────────────
  const totalBudget     = ads.reduce((s, a) => s + a.budget_eur, 0);
  const totalSpent      = ads.reduce((s, a) => s + a.spent_eur, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const totalClicks     = ads.reduce((s, a) => s + a.clicks, 0);
  const globalCtr       = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : '0.00';
  const activeCount     = ads.filter(a => a.status === 'active').length;

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleDelete = (ad: Ad) => {
    if (ad.status !== 'draft') {
      Alert.alert('Impossible', 'Seules les campagnes en brouillon peuvent être supprimées.');
      return;
    }
    Alert.alert('Supprimer', `Supprimer "${ad.title}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await adService.delete(ad.id);
            setAds(prev => prev.filter(a => a.id !== ad.id));
          } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
        },
      },
    ]);
  };

  const handleTogglePause = async (ad: Ad) => {
    try {
      const updated = ad.status === 'active'
        ? await adService.pause(ad.id)
        : await adService.resume(ad.id);
      setAds(prev => prev.map(a => a.id === ad.id ? updated : a));
    } catch { Alert.alert('Erreur', 'Impossible de modifier le statut.'); }
  };

  // ── Render campagne ───────────────────────────────────────────────────────
  const renderAd = ({ item }: { item: Ad }) => {
    const statusColor = adService.statusColor(item.status);
    const remaining = item.budget_eur - item.spent_eur;
    const pct = item.budget_eur > 0 ? item.spent_eur / item.budget_eur : 0;

    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}
        onPress={() => nav.navigate('CreateAd', { ad: item })}
        activeOpacity={0.85}
      >
        {/* Header */}
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[s.adTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[s.statusTxt, { color: statusColor }]}>
                {adService.statusLabel(item.status)}
              </Text>
              <Text style={[s.placementTxt, { color: colors.textTertiary }]}>
                · {item.placement}
              </Text>
            </View>
          </View>
          <View style={s.cardActions}>
            {(item.status === 'active' || item.status === 'paused') && (
              <TouchableOpacity onPress={() => handleTogglePause(item)} style={s.iconBtn}>
                <Icon
                  name={item.status === 'active' ? 'pause' : 'play'}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
            {item.status === 'draft' && (
              <TouchableOpacity onPress={() => handleDelete(item)} style={s.iconBtn}>
                <Icon name="trash-2" size={16} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: colors.textPrimary }]}>
              {item.impressions.toLocaleString('fr-FR')}
            </Text>
            <Text style={[s.statLbl, { color: colors.textTertiary }]}>Impressions</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: colors.textPrimary }]}>
              {item.clicks.toLocaleString('fr-FR')}
            </Text>
            <Text style={[s.statLbl, { color: colors.textTertiary }]}>Clics</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: colors.textPrimary }]}>{item.ctr_pct}%</Text>
            <Text style={[s.statLbl, { color: colors.textTertiary }]}>CTR</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: colors.textPrimary }]}>
              {remaining.toFixed(2)}€
            </Text>
            <Text style={[s.statLbl, { color: colors.textTertiary }]}>Restant</Text>
          </View>
        </View>

        {/* Barre budget */}
        <View style={[s.budgetTrack, { backgroundColor: colors.backgroundSecondary }]}>
          <View
            style={[s.budgetFill, {
              width: `${Math.min(100, pct * 100)}%` as any,
              backgroundColor: pct > 0.9 ? '#EF4444' : '#7B3FF2',
            }]}
          />
        </View>
        <View style={s.budgetRow}>
          <Text style={[s.budgetTxt, { color: colors.textTertiary }]}>
            {item.spent_eur.toFixed(2)}€ dépensés
          </Text>
          <Text style={[s.budgetTxt, { color: colors.textTertiary }]}>
            Budget : {item.budget_eur.toFixed(2)}€
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const s2 = {
    header: { paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12,
      backgroundColor: colors.background, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={s2.header}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={[s.title, { color: colors.textPrimary, flex: 1 }]}>Mes publicités</Text>
        <TouchableOpacity
          onPress={() => nav.navigate('CreateAd', { ad: null })}
          style={[s.createBtn, { backgroundColor: '#7B3FF2' }]}
        >
          <Icon name="plus" size={16} color="#fff" />
          <Text style={s.createTxt}>Créer</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#7B3FF2" size="large" />
        </View>
      ) : (
        <FlatList
          data={ads}
          keyExtractor={a => a.id}
          renderItem={renderAd}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
              colors={['#7B3FF2']} tintColor="#7B3FF2" />
          }
          ListHeaderComponent={ads.length > 0 ? (
            <View style={[s.globalStats, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
              <Text style={[s.globalTitle, { color: colors.textPrimary }]}>
                Vue d'ensemble · {activeCount} active{activeCount !== 1 ? 's' : ''}
              </Text>
              <View style={s.statsRow}>
                {[
                  { label: 'Budget total', value: `${totalBudget.toFixed(0)}€` },
                  { label: 'Dépensé', value: `${totalSpent.toFixed(0)}€` },
                  { label: 'Impressions', value: totalImpressions.toLocaleString('fr-FR') },
                  { label: 'CTR moyen', value: `${globalCtr}%` },
                ].map(g => (
                  <View key={g.label} style={s.gStat}>
                    <Text style={[s.gVal, { color: colors.textPrimary }]}>{g.value}</Text>
                    <Text style={[s.gLbl, { color: colors.textTertiary }]}>{g.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          ListEmptyComponent={
            <View style={s.empty}>
              <MaterialCommunityIcons name="bullhorn-outline" size={48} color={colors.textTertiary} />
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                Aucune campagne
              </Text>
              <Text style={[s.emptyDesc, { color: colors.textTertiary }]}>
                Crée ta première pub pour toucher des milliers d'utilisateurs
              </Text>
              <TouchableOpacity
                style={[s.emptyBtn, { backgroundColor: '#7B3FF2' }]}
                onPress={() => nav.navigate('CreateAd', { ad: null })}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  Créer une campagne
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  title:        { fontSize: 18, fontWeight: '800' },
  createBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  createTxt:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  card:         { borderRadius: 16, padding: 14, borderWidth: 1, gap: 10 },
  cardHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  adTitle:      { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  statusRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot:    { width: 7, height: 7, borderRadius: 4 },
  statusTxt:    { fontSize: 12, fontWeight: '600' },
  placementTxt: { fontSize: 12 },
  cardActions:  { flexDirection: 'row', gap: 4 },
  iconBtn:      { padding: 6 },
  statsRow:     { flexDirection: 'row', gap: 8 },
  stat:         { flex: 1, alignItems: 'center' },
  statVal:      { fontSize: 15, fontWeight: '800' },
  statLbl:      { fontSize: 10, marginTop: 1 },
  budgetTrack:  { height: 4, borderRadius: 2, overflow: 'hidden' },
  budgetFill:   { height: 4, borderRadius: 2 },
  budgetRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  budgetTxt:    { fontSize: 11 },
  globalStats:  { borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 12, gap: 10 },
  globalTitle:  { fontSize: 14, fontWeight: '700' },
  gStat:        { flex: 1, alignItems: 'center' },
  gVal:         { fontSize: 16, fontWeight: '800' },
  gLbl:         { fontSize: 10, marginTop: 1, textAlign: 'center' },
  empty:        { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle:   { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyDesc:    { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn:     { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
});
