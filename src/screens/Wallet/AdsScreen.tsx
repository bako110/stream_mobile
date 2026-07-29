/**
 * AdsScreen — Dashboard annonceur.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { BackButton, GoFolyXLoader, PriceWithLocal } from '../../components/common';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { adService, type Ad } from '../../services/adService';
import { toastService, showConfirm } from '../../services';

// 1 € = 100 GoGold
const EUR_TO_COINS = 100;
const eur2coins = (eur: number) => Math.round(eur * EUR_TO_COINS);
const coins2eur = (GoGold: number) => (GoGold / EUR_TO_COINS).toFixed(2);

// ── Section "Comment ça marche" ────────────────────────────────────────────────
const HowItWorks: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={{ marginBottom: 20 }}>
    <LinearGradient
      colors={['#7B3FF2', '#E0389A']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ borderRadius: 18, padding: 18, marginBottom: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <MaterialCommunityIcons name="bullhorn" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>Comment ça marche ?</Text>
      </View>
      {[
        { icon: 'zap',        text: 'Tu paies en GoGold — 100 GoGold = 1 €' },
        { icon: 'eye',        text: 'Ta pub apparaît dans le feed de milliers d\'utilisateurs' },
        { icon: 'bar-chart-2',text: 'Tu suis impressions, clics et CTR en temps réel' },
        { icon: 'pause',      text: 'Tu peux mettre en pause ou arrêter à tout moment' },
      ].map(r => (
        <View key={r.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={r.icon} size={12} color="#fff" />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, flex: 1, lineHeight: 18 }}>{r.text}</Text>
        </View>
      ))}
    </LinearGradient>

    {/* Tableau CPM */}
    <View style={[{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface, overflow: 'hidden' }]}>
      <View style={{ backgroundColor: '#7B3FF210', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="info" size={13} color="#7B3FF2" />
        <Text style={{ color: '#7B3FF2', fontSize: 12, fontWeight: '800' }}>Tarifs — Coût pour 1 000 impressions (CPM)</Text>
      </View>
      {[
        { cpm: 1,  GoGold: 100,  label: 'Économique', reach: '~1 000',  color: '#10B981' },
        { cpm: 2,  GoGold: 200,  label: 'Standard',   reach: '~500',    color: '#3B82F6' },
        { cpm: 5,  GoGold: 500,  label: 'Premium',    reach: '~200',    color: '#F59E0B' },
        { cpm: 10, GoGold: 1000, label: 'Top',        reach: '~100',    color: '#E0389A' },
      ].map((row, i, arr) => (
        <View key={row.cpm} style={{
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11,
          borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: colors.divider,
        }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color, marginRight: 10 }} />
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13, width: 70 }}>{row.label}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              <PriceWithLocal amountEur={row.cpm} style={{ color: colors.textSecondary, fontSize: 12 }} /> · <Text style={{ color: row.color, fontWeight: '700' }}>{row.GoGold} GoGold</Text> / 1 000 imp.
            </Text>
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>{row.reach} imp/€</Text>
        </View>
      ))}
    </View>
  </View>
);

// ── Carte campagne ─────────────────────────────────────────────────────────────
const AdCard: React.FC<{
  item: Ad; colors: any;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}> = ({ item, colors, onEdit, onToggle, onDelete }) => {
  const statusColor = adService.statusColor(item.status);
  const pct         = item.budget_eur > 0 ? item.spent_eur / item.budget_eur : 0;
  const goGoldTotal  = (item as any).gogold_debited  ?? eur2coins(item.budget_eur);
  const goGoldSpent  = (item as any).gogold_spent    ?? eur2coins(item.spent_eur);
  const goGoldLeft   = (item as any).gogold_remaining ?? Math.max(0, goGoldTotal - goGoldSpent);
  const cpmGoGold    = eur2coins(item.cpm_eur ?? 2);

  const PLACEMENT_LABELS: Record<string, string> = {
    feed: 'Feed principal', reels: 'Reels', stories: 'Stories', search: 'Recherche',
  };

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}
      onPress={onEdit}
      activeOpacity={0.85}
    >
      {/* Header titre + actions */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.adTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>
              {adService.statusLabel(item.status)}
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
              · {PLACEMENT_LABELS[item.placement] ?? item.placement}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {(item.status === 'active' || item.status === 'paused') && (
            <TouchableOpacity onPress={onToggle} style={s.iconBtn}>
              <Icon name={item.status === 'active' ? 'pause' : 'play'} size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          {item.status === 'draft' && (
            <TouchableOpacity onPress={onDelete} style={s.iconBtn}>
              <Icon name="trash-2" size={15} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Budget en GoGold + euros */}
      <View style={[s.coinBox, { backgroundColor: '#7B3FF210', borderColor: '#7B3FF225' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#7B3FF2', fontSize: 11, fontWeight: '700', marginBottom: 2 }}>BUDGET</Text>
          <Text style={{ color: '#7B3FF2', fontSize: 18, fontWeight: '900' }}>
            {goGoldLeft.toLocaleString('fr-FR')} <Text style={{ fontSize: 12 }}>GoGold restants</Text>
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 1 }}>
            {goGoldSpent.toLocaleString('fr-FR')} dépensés · {goGoldTotal.toLocaleString('fr-FR')} total
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
            = <PriceWithLocal amountEur={item.spent_eur} style={{ color: colors.textTertiary, fontSize: 11 }} /> / <PriceWithLocal amountEur={item.budget_eur} style={{ color: colors.textTertiary, fontSize: 11 }} />
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={{ backgroundColor: '#7B3FF222', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#7B3FF2', fontSize: 9, fontWeight: '700', letterSpacing: 0.3 }}>CPM</Text>
            <Text style={{ color: '#7B3FF2', fontSize: 10, fontWeight: '800' }}>
              1 000 imp = {cpmGoGold} GoGold
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 9 }}>= <PriceWithLocal amountEur={item.cpm_eur ?? 2} style={{ color: colors.textTertiary, fontSize: 9 }} /></Text>
          </View>
        </View>
      </View>
      {/* gogold_debited — affiché si disponible */}
      {item.gogold_debited != null && (
        <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: -4 }}>
          Débité à la création : {item.gogold_debited.toLocaleString('fr-FR')} GoGold
        </Text>
      )}

      {/* Barre progression */}
      <View>
        <View style={[s.budgetTrack, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[s.budgetFill, {
            width: `${Math.min(100, pct * 100)}%` as any,
            backgroundColor: pct > 0.9 ? '#EF4444' : pct > 0.7 ? '#F59E0B' : '#7B3FF2',
          }]} />
        </View>
        <Text style={{ color: colors.textTertiary, fontSize: 10, marginTop: 3 }}>
          {Math.round(pct * 100)}% du budget consommé
        </Text>
      </View>

      {/* Stats */}
      <View style={[s.statsRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 10 }]}>
        {[
          { icon: 'eye',        val: item.impressions.toLocaleString('fr-FR'), lbl: 'Impressions', color: '#3B82F6' },
          { icon: 'mouse-pointer', val: item.clicks.toLocaleString('fr-FR'),  lbl: 'Clics',       color: '#10B981' },
          { icon: 'percent',    val: `${item.ctr_pct}%`,                      lbl: 'CTR',         color: '#F59E0B' },
          { icon: 'zap',        val: goGoldLeft.toLocaleString('fr-FR'),        lbl: 'GoGold rest.', color: '#E0389A' },
        ].map(st => (
          <View key={st.lbl} style={s.stat}>
            <Icon name={st.icon} size={13} color={st.color} style={{ marginBottom: 3 }} />
            <Text style={[s.statVal, { color: colors.textPrimary }]}>{st.val}</Text>
            <Text style={[s.statLbl, { color: colors.textTertiary }]}>{st.lbl}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
};

// ── Screen ─────────────────────────────────────────────────────────────────────
export const AdsScreen: React.FC = () => {
  const { theme: { colors } } = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [ads,        setAds]        = useState<Ad[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setAds(await adService.getMine()); }
    catch { setAds([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalBudget      = ads.reduce((s, a) => s + a.budget_eur, 0);
  const totalSpent       = ads.reduce((s, a) => s + a.spent_eur, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const totalClicks      = ads.reduce((s, a) => s + a.clicks, 0);
  const globalCtr        = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : '0.00';
  const activeCount      = ads.filter(a => a.status === 'active').length;

  // Budget total en GoGold : somme des gogold_debited si disponibles, sinon eur2coins(budget_eur)
  const totalBudgetGoGold = ads.reduce((s, a) =>
    s + (a.gogold_debited != null ? a.gogold_debited : eur2coins(a.budget_eur)), 0);

  // Impressions restantes estimées sur les campagnes actives/en pause
  const estimatedRemainingImpressions = ads
    .filter(a => a.status === 'active' || a.status === 'paused')
    .reduce((s, a) => {
      const remaining = a.budget_eur - a.spent_eur;
      const cpm = a.cpm_eur > 0 ? a.cpm_eur : 2;
      return s + Math.round((remaining / cpm) * 1000);
    }, 0);

  const handleDelete = (ad: Ad) => {
    if (ad.status === 'active' || ad.status === 'paused') {
      toastService.warning('Impossible', 'Arrêtez la campagne avant de la supprimer.');
      return;
    }
    const isDraft    = ad.status === 'draft';
    const isArchived = ad.status === 'ended' || ad.status === 'rejected';
    const msg = isDraft
      ? `Supprimer le brouillon "${ad.title}" ?`
      : `Supprimer la campagne terminée "${ad.title}" ? L'historique (impressions, clics) sera perdu.`;
    showConfirm('Supprimer', msg, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await adService.delete(ad.id); setAds(prev => prev.filter(a => a.id !== ad.id)); }
        catch { toastService.error('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  };

  const handleToggle = async (ad: Ad) => {
    try {
      const updated = ad.status === 'active' ? await adService.pause(ad.id) : await adService.resume(ad.id);
      setAds(prev => prev.map(a => a.id === ad.id ? updated : a));
    } catch { toastService.error('Erreur', 'Impossible de modifier le statut.'); }
  };

  // ── Construction de la liste avec separateurs de sections ────────────────
  type SectionHeader = { __header: true; label: string; icon: string; color: string; count: number };
  type FlatRow = SectionHeader | Ad;

  const flatData: FlatRow[] = (() => {
    const sections: { status: string; label: string; icon: string; color: string }[] = [
      { status: 'active',  label: 'En ligne',    icon: 'zap',     color: '#10B981' },
      { status: 'paused',  label: 'En pause',    icon: 'pause',   color: '#F59E0B' },
      { status: 'draft',   label: 'Brouillons',  icon: 'edit-2',  color: '#6B7280' },
      { status: 'ended',   label: 'Terminees',   icon: 'check',   color: '#6B7280' },
      { status: 'rejected',label: 'Refusees',    icon: 'x-circle',color: '#EF4444' },
    ];
    const rows: FlatRow[] = [];
    for (const sec of sections) {
      const group = ads.filter(a => a.status === sec.status);
      if (group.length === 0) continue;
      rows.push({ __header: true, label: sec.label, icon: sec.icon, color: sec.color, count: group.length });
      group.forEach(a => rows.push(a));
    }
    return rows;
  })();

  const GlobalStats = ads.length > 0 ? (
    <View style={[s.globalStats, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
      <Text style={[s.globalTitle, { color: colors.textPrimary }]}>
        Vue d'ensemble · <Text style={{ color: '#10B981' }}>{activeCount} active{activeCount !== 1 ? 's' : ''}</Text>
      </Text>
      {/* Ligne 1 : Budget total + Dépensé + Impressions + CTR */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { lbl: 'Budget total',  val: `${totalBudgetGoGold.toLocaleString('fr-FR')} c`,      sub: <PriceWithLocal amountEur={totalBudget} style={{ fontSize: 9, color: '#7B3FF2AA', fontWeight: '600' }} />,  color: '#7B3FF2' },
          { lbl: 'Dépensé',       val: `${eur2coins(totalSpent).toLocaleString('fr-FR')} c`, sub: <PriceWithLocal amountEur={totalSpent} style={{ fontSize: 9, color: '#E0389AAA', fontWeight: '600' }} />,   color: '#E0389A' },
          { lbl: 'Impressions',   val: totalImpressions.toLocaleString('fr-FR'),              sub: 'vues réelles' as React.ReactNode,                color: '#3B82F6' },
          { lbl: 'CTR moyen',     val: `${globalCtr}%`,                                       sub: 'taux clic' as React.ReactNode,                   color: '#F59E0B' },
        ].map(g => (
          <View key={g.lbl} style={[s.gStat, { backgroundColor: g.color + '12', borderRadius: 12, padding: 10 }]}>
            <Text style={[s.gVal, { color: g.color }]}>{g.val}</Text>
            <Text style={[{ fontSize: 9, color: g.color + 'AA', fontWeight: '600' }]}>{g.sub}</Text>
            <Text style={[s.gLbl, { color: colors.textTertiary }]}>{g.lbl}</Text>
          </View>
        ))}
      </View>
      {/* Ligne 2 : Impressions restantes estimées (campagnes actives/pause) */}
      {estimatedRemainingImpressions > 0 && (
        <View style={[s.gStat, { backgroundColor: '#10B98112', borderRadius: 12, padding: 10, width: '100%', alignItems: 'flex-start' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="eye" size={13} color="#10B981" />
            <Text style={[s.gVal, { color: '#10B981', fontSize: 13 }]}>
              ~{estimatedRemainingImpressions.toLocaleString('fr-FR')} imp. restantes estimées
            </Text>
          </View>
          <Text style={[s.gLbl, { color: colors.textTertiary, marginTop: 2 }]}>
            Sur budget restant des campagnes actives / en pause
          </Text>
        </View>
      )}
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12,
        backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', gap: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
      }}>
        <BackButton onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.textPrimary }]}>Mes publicités</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 1 }}>100 GoGold = 1 € de budget pub</Text>
        </View>
        <TouchableOpacity
          onPress={() => nav.navigate('CreateAd', { ad: null })}
          style={[s.createBtn, { backgroundColor: '#7B3FF2' }]}
        >
          <Icon name="plus" size={15} color="#fff" />
          <Text style={s.createTxt}>Créer</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.background ?? '#0a0a0f' }}>
          <GoFolyXLoader />
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(row: any) => row.__header ? `hdr-${row.label}` : (row as Ad).id}
          renderItem={({ item }: { item: any }) => {
            if (item.__header) {
              return (
                <View style={[s.sectionHdr, { borderLeftColor: item.color }]}>
                  <View style={[s.sectionDot, { backgroundColor: item.color }]} />
                  <Icon name={item.icon} size={13} color={item.color} />
                  <Text style={[s.sectionLabel, { color: item.color }]}>{item.label}</Text>
                  <View style={[s.sectionBadge, { backgroundColor: item.color + '22' }]}>
                    <Text style={[s.sectionCount, { color: item.color }]}>{item.count}</Text>
                  </View>
                </View>
              );
            }
            const ad = item as Ad;
            return (
              <AdCard
                item={ad}
                colors={colors}
                onEdit={() => nav.navigate('CreateAd', { ad })}
                onToggle={() => handleToggle(ad)}
                onDelete={() => handleDelete(ad)}
              />
            );
          }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
              colors={['#7B3FF2']} tintColor="#7B3FF2" />
          }
          ListHeaderComponent={
            <View>
              <HowItWorks colors={colors} />
              {GlobalStats}
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <LinearGradient colors={['#7B3FF222', '#E0389A11']} style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="bullhorn-outline" size={38} color="#7B3FF2" />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Lance ta première campagne</Text>
              <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>
                Touche des milliers d'utilisateurs dès 100 GoGold (1€).{'\n'}
                Tu contrôles ton budget, tu pauses quand tu veux.
              </Text>
              <TouchableOpacity
                style={{ overflow: 'hidden', borderRadius: 24, marginTop: 8 }}
                onPress={() => nav.navigate('CreateAd', { ad: null })}
              >
                <LinearGradient colors={['#7B3FF2', '#E0389A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingHorizontal: 28, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="zap" size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Créer une campagne</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  title:        { fontSize: 17, fontWeight: '800' },
  createBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  createTxt:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  sectionHdr:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6,
                  paddingLeft: 10, borderLeftWidth: 3, borderRadius: 2, marginBottom: -2 },
  sectionDot:   { width: 6, height: 6, borderRadius: 3 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, flex: 1 },
  sectionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  sectionCount: { fontSize: 11, fontWeight: '800' },
  card:        { borderRadius: 18, padding: 16, borderWidth: 1, gap: 12 },
  adTitle:     { fontSize: 15, fontWeight: '800' },
  iconBtn:     { padding: 7, borderRadius: 8 },
  coinBox:     { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statsRow:    { flexDirection: 'row', gap: 0 },
  stat:        { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statVal:     { fontSize: 14, fontWeight: '800' },
  statLbl:     { fontSize: 9, marginTop: 1 },
  budgetTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  budgetFill:  { height: 5, borderRadius: 3 },
  globalStats: { borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 12, gap: 10 },
  globalTitle: { fontSize: 14, fontWeight: '700' },
  gStat:       { flex: 1, alignItems: 'center' },
  gVal:        { fontSize: 14, fontWeight: '900' },
  gLbl:        { fontSize: 9, marginTop: 2, textAlign: 'center' },
  empty:       { alignItems: 'center', paddingTop: 20, gap: 10, paddingHorizontal: 28 },
  emptyTitle:  { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyDesc:   { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
