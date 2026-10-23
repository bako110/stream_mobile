/**
 * AdsScreen — Dashboard annonceur.
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { BackButton, GofolyxLoader, PriceWithLocal } from '../../components/common';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { adService, type Ad, type AdsStats } from '../../services/adService';
import { toastService, showConfirm } from '../../services';

const ADS_PAGE_LIMIT = 20;

// 1 € = 100 GoGold
const EUR_TO_COINS = 100;
const eur2coins = (eur: number) => Math.round(eur * EUR_TO_COINS);
const coins2eur = (GoGold: number) => (GoGold / EUR_TO_COINS).toFixed(2);

// ── Section "Comment ça marche" ────────────────────────────────────────────────
const HowItWorks: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={{ marginBottom: 20 }}>
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ borderRadius: 18, padding: 18, marginBottom: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <MaterialCommunityIcons name="bullhorn" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.black }}>Comment ça marche ?</Text>
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
          <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: FontSize.smPlus, flex: 1, lineHeight: 18 }}>{r.text}</Text>
        </View>
      ))}
    </LinearGradient>

    {/* Tableau CPM */}
    <View style={[{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface, overflow: 'hidden' }]}>
      <View style={{ backgroundColor: colors.primary + '10', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="info" size={13} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.extraBold }}>Tarifs — Coût pour 1 000 impressions (CPM)</Text>
      </View>
      {[
        { cpm: 1,  GoGold: 100,  label: 'Économique', reach: '~1 000',  color: colors.primary },
        { cpm: 2,  GoGold: 200,  label: 'Standard',   reach: '~500',    color: colors.primary },
        { cpm: 5,  GoGold: 500,  label: 'Premium',    reach: '~200',    color: colors.primary },
        { cpm: 10, GoGold: 1000, label: 'Top',        reach: '~100',    color: colors.primary },
      ].map((row, i, arr) => (
        <View key={row.cpm} style={{
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11,
          borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: colors.divider,
        }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color, marginRight: 10 }} />
          <Text style={{ color: colors.textPrimary, fontWeight: FontWeight.bold, fontSize: FontSize.smPlus, width: 70 }}>{row.label}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, fontSize: FontSize.sm }}>
              <PriceWithLocal amountEur={row.cpm} style={{ color: colors.textSecondary, fontSize: FontSize.sm }} /> · <Text style={{ color: row.color, fontWeight: FontWeight.bold }}>{row.GoGold} GoGold</Text> / 1 000 imp.
            </Text>
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus }}>{row.reach} imp/€</Text>
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
            <Text style={{ color: statusColor, fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold }}>
              {adService.statusLabel(item.status)}
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus }}>
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
          {/* Suppression possible quel que soit le statut — même une campagne encore
              active/en pause peut être supprimée directement, pas besoin de l'arrêter
              d'abord (le budget restant est remboursé côté backend). */}
          <TouchableOpacity onPress={onDelete} style={s.iconBtn}>
            <Icon name="trash-2" size={15} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Budget en GoGold + euros */}
      <View style={[s.coinBox, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '25' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.primary, fontSize: FontSize.xsPlus, fontWeight: FontWeight.bold, marginBottom: 2 }}>BUDGET</Text>
          <Text style={{ color: colors.primary, fontSize: FontSize.lg, fontWeight: FontWeight.black }}>
            {goGoldLeft.toLocaleString('fr-FR')} <Text style={{ fontSize: FontSize.sm }}>GoGold restants</Text>
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus, marginTop: 1 }}>
            {goGoldSpent.toLocaleString('fr-FR')} dépensés · {goGoldTotal.toLocaleString('fr-FR')} total
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus }}>
            = <PriceWithLocal amountEur={item.spent_eur} style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus }} /> / <PriceWithLocal amountEur={item.budget_eur} style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus }} />
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={{ backgroundColor: colors.primary + '22', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: FontSize['2xs'], fontWeight: FontWeight.bold, letterSpacing: 0.3 }}>CPM</Text>
            <Text style={{ color: colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.extraBold }}>
              1 000 imp = {cpmGoGold} GoGold
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: FontSize['2xs'] }}>= <PriceWithLocal amountEur={item.cpm_eur ?? 2} style={{ color: colors.textTertiary, fontSize: FontSize['2xs'] }} /></Text>
          </View>
        </View>
      </View>
      {/* gogold_debited — affiché si disponible */}
      {item.gogold_debited != null && (
        <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus, marginTop: -4 }}>
          Débité à la création : {item.gogold_debited.toLocaleString('fr-FR')} GoGold
        </Text>
      )}

      {/* Barre progression */}
      <View>
        <View style={[s.budgetTrack, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[s.budgetFill, {
            width: `${Math.min(100, pct * 100)}%` as any,
            backgroundColor: pct > 0.9 ? '#EF4444' : pct > 0.7 ? '#F59E0B' : colors.primary,
          }]} />
        </View>
        <Text style={{ color: colors.textTertiary, fontSize: FontSize.xs, marginTop: 3 }}>
          {Math.round(pct * 100)}% du budget consommé
        </Text>
      </View>

      {/* Stats */}
      <View style={[s.statsRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 10 }]}>
        {[
          { icon: 'eye',        val: item.impressions.toLocaleString('fr-FR'), lbl: 'Impressions', color: colors.primary },
          { icon: 'mouse-pointer', val: item.clicks.toLocaleString('fr-FR'),  lbl: 'Clics',       color: colors.primary },
          { icon: 'percent',    val: `${item.ctr_pct}%`,                      lbl: 'CTR',         color: colors.primary },
          { icon: 'zap',        val: goGoldLeft.toLocaleString('fr-FR'),        lbl: 'GoGold rest.', color: colors.primary },
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
  const { theme } = useTheme();
  const { colors } = theme;
  const ACCENT = colors.primary;
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [ads,         setAds]         = useState<Ad[]>([]);
  const [stats,       setStats]       = useState<AdsStats | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const pageRef = useRef(1);

  const load = useCallback(async () => {
    try {
      pageRef.current = 1;
      const [res, statsRes] = await Promise.all([
        adService.getMine(1, ADS_PAGE_LIMIT),
        adService.getStats(),
      ]);
      setAds(res.items);
      setHasMore(res.items.length < res.total);
      setStats(statsRes);
    }
    catch { setAds([]); setHasMore(false); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Rechargement à chaque prise de focus — pas seulement au montage initial :
  // après avoir modifié une campagne dans CreateAdScreen puis fait goBack(), cet
  // écran gardait son state périmé (les champs édités, ex. contact_call/
  // contact_whatsapp, semblaient "ne pas s'être enregistrés" au retour, alors que
  // la sauvegarde avait bien réussi côté serveur — juste jamais rechargée ici).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    adService.getMine(nextPage, ADS_PAGE_LIMIT)
      .then(res => {
        pageRef.current = nextPage;
        setAds(prev => {
          const merged = [...prev, ...res.items];
          setHasMore(merged.length < res.total);
          return merged;
        });
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading]);

  // Totaux sur TOUTES les campagnes (endpoint dédié /ads/mine/stats), pas seulement
  // celles déjà chargées à l'écran — restent exacts quel que soit l'état du scroll.
  const totalBudget      = stats?.budget_eur ?? 0;
  const totalSpent       = stats?.spent_eur ?? 0;
  const totalImpressions = stats?.impressions ?? 0;
  const globalCtr        = (stats?.ctr_pct ?? 0).toFixed(2);
  const activeCount      = stats?.active_count ?? 0;
  const totalBudgetGoGold = stats?.gogold_debited ?? 0;

  // Impressions restantes estimées sur les campagnes actives/en pause DÉJÀ
  // CHARGÉES — reste une estimation locale (pas d'agrégat backend pour ce calcul
  // spécifique par CPM individuel), moins critique qu'un vrai total financier.
  const estimatedRemainingImpressions = ads
    .filter(a => a.status === 'active' || a.status === 'paused')
    .reduce((s, a) => {
      const remaining = a.budget_eur - a.spent_eur;
      const cpm = a.cpm_eur > 0 ? a.cpm_eur : 2;
      return s + Math.round((remaining / cpm) * 1000);
    }, 0);

  const handleDelete = (ad: Ad) => {
    const isDraft  = ad.status === 'draft';
    const isActive = ad.status === 'active' || ad.status === 'paused';
    const msg = isDraft
      ? `Supprimer le brouillon "${ad.title}" ?`
      : isActive
      ? `Supprimer la campagne "${ad.title}" ? Elle s'arrêtera immédiatement et le budget restant sera remboursé en GoGold. L'historique (impressions, clics) sera perdu.`
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
        Vue d'ensemble · <Text style={{ color: colors.primary }}>{activeCount} active{activeCount !== 1 ? 's' : ''}</Text>
      </Text>
      {/* Ligne 1 : Budget total + Dépensé + Impressions + CTR */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { lbl: 'Budget total',  val: `${totalBudgetGoGold.toLocaleString('fr-FR')} c`,      sub: <PriceWithLocal amountEur={totalBudget} style={{ fontSize: FontSize['2xs'], color: colors.primary + 'AA', fontWeight: FontWeight.semiBold }} /> },
          { lbl: 'Dépensé',       val: `${(stats?.gogold_spent ?? 0).toLocaleString('fr-FR')} c`, sub: <PriceWithLocal amountEur={totalSpent} style={{ fontSize: FontSize['2xs'], color: colors.primary + 'AA', fontWeight: FontWeight.semiBold }} /> },
          { lbl: 'Impressions',   val: totalImpressions.toLocaleString('fr-FR'),              sub: 'vues réelles' as React.ReactNode },
          { lbl: 'CTR moyen',     val: `${globalCtr}%`,                                       sub: 'taux clic' as React.ReactNode },
        ].map(g => (
          <View key={g.lbl} style={[s.gStat, { backgroundColor: colors.primary + '12', borderRadius: 12, padding: 10 }]}>
            <Text style={[s.gVal, { color: colors.primary }]}>{g.val}</Text>
            <Text style={[{ fontSize: FontSize['2xs'], color: colors.primary + 'AA', fontWeight: FontWeight.semiBold }]}>{g.sub}</Text>
            <Text style={[s.gLbl, { color: colors.textTertiary }]}>{g.lbl}</Text>
          </View>
        ))}
      </View>
      {/* Ligne 2 : Impressions restantes estimées (campagnes actives/pause) */}
      {estimatedRemainingImpressions > 0 && (
        <View style={[s.gStat, { backgroundColor: colors.primary + '12', borderRadius: 12, padding: 10, width: '100%', alignItems: 'flex-start' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="eye" size={13} color={colors.primary} />
            <Text style={[s.gVal, { color: colors.primary, fontSize: FontSize.smPlus }]}>
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
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {/* Header — carte flottante (même design que le reste de l'app).
          paddingTop (status bar) isolé sur un wrapper externe transparent —
          le mélanger au style de la carte ferait apparaître un coin visible
          sous la status bar. */}
      <View style={{ paddingTop: insets.top + 8 }}>
        <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <BackButton onPress={() => nav.goBack()} />
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.textPrimary }]}>Mes publicités</Text>
            <Text style={{ color: colors.textTertiary, fontSize: FontSize.xsPlus, marginTop: 1 }}>100 GoGold = 1 € de budget pub</Text>
          </View>
          <TouchableOpacity
            onPress={() => nav.navigate('CreateAd', { ad: null })}
            style={[s.createBtn, { backgroundColor: colors.primary }]}
          >
            <Icon name="plus" size={15} color="#fff" />
            <Text style={s.createTxt}>Créer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.background ?? '#0a0a0f' }}>
          <GofolyxLoader />
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
              colors={[colors.primary]} tintColor={colors.primary} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
          ListHeaderComponent={
            <View>
              <HowItWorks colors={colors} />
              {GlobalStats}
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: colors.primary + '18' }}>
                <MaterialCommunityIcons name="bullhorn-outline" size={38} color={colors.primary} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Lance ta première campagne</Text>
              <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>
                Touche des milliers d'utilisateurs dès 100 GoGold (1€).{'\n'}
                Tu contrôles ton budget, tu pauses quand tu veux.
              </Text>
              <TouchableOpacity
                style={{ borderRadius: 24, marginTop: 8, paddingHorizontal: 28, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary }}
                onPress={() => nav.navigate('CreateAd', { ad: null })}
              >
                <Icon name="zap" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: FontWeight.extraBold, fontSize: FontSize.basePlus }}>Créer une campagne</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  header:       {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    marginHorizontal: 10, marginBottom: 10, borderRadius: 24, borderWidth: 1,
    shadowColor: '#5B45B5', shadowOpacity: 0.10, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  title:        { fontSize: FontSize.mdPlus, fontWeight: FontWeight.extraBold },
  createBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  createTxt:    { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.smPlus },
  sectionHdr:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6,
                  paddingLeft: 10, borderLeftWidth: 3, borderRadius: 2, marginBottom: -2 },
  sectionDot:   { width: 6, height: 6, borderRadius: 3 },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.extraBold, letterSpacing: 0.5, flex: 1 },
  sectionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  sectionCount: { fontSize: FontSize.xsPlus, fontWeight: FontWeight.extraBold },
  card:        { borderRadius: 18, padding: 16, borderWidth: 1, gap: 12 },
  adTitle:     { fontSize: FontSize.basePlus, fontWeight: FontWeight.extraBold },
  iconBtn:     { padding: 7, borderRadius: 8 },
  coinBox:     { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statsRow:    { flexDirection: 'row', gap: 0 },
  stat:        { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statVal:     { fontSize: FontSize.base, fontWeight: FontWeight.extraBold },
  statLbl:     { fontSize: FontSize['2xs'], marginTop: 1 },
  budgetTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  budgetFill:  { height: 5, borderRadius: 3 },
  globalStats: { borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 12, gap: 10 },
  globalTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  gStat:       { flex: 1, alignItems: 'center' },
  gVal:        { fontSize: FontSize.base, fontWeight: FontWeight.black },
  gLbl:        { fontSize: FontSize['2xs'], marginTop: 2, textAlign: 'center' },
  empty:       { alignItems: 'center', paddingTop: 20, gap: 10, paddingHorizontal: 28 },
  emptyTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.black, textAlign: 'center' },
  emptyDesc:   { fontSize: FontSize.smPlus, textAlign: 'center', lineHeight: 20 },
});
