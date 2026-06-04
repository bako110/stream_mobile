import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, RefreshControl, StatusBar,
  Clipboard,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { BackButton, GoFolixLoader } from '../../components/common';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

interface ReferralStats {
  referral_code:        string | null;
  total_referred:       number;
  total_coins_earned:   number;
  monthly_coins_earned: number;
  monthly_cap:          number;
}

interface ReferredUser {
  id:              string;
  username:        string;
  display_name:    string | null;
  avatar_url:      string | null;
  gofolix_id:        string | null;
  joined_at:       string;
  coins_generated: number;
}

export const ReferralScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation();

  const [stats,      setStats]      = useState<ReferralStats | null>(null);
  const [users,      setUsers]      = useState<ReferredUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied,     setCopied]     = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        apiClient.get<ReferralStats>(Endpoints.wallet.referralStats),
        apiClient.get<ReferredUser[]>(Endpoints.wallet.referralUsers).catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    } catch (e: any) {
      console.warn('[Referral] erreur:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCopy = useCallback(() => {
    if (!stats?.referral_code) return;
    Clipboard.setString(stats.referral_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [stats]);

  const handleShare = useCallback(async () => {
    if (!stats?.referral_code) return;
    await Share.share({
      message:
        `Rejoins-moi sur GoFolix ! Utilise mon code de parrainage \`${stats.referral_code}\` lors de ton inscription et gagne 20 coins bonus. Tu peux t'inscrire sur GoFolix maintenant.`,
      title: 'Invite un ami sur GoFolix',
    });
  }, [stats]);

  const monthlyPct = stats
    ? Math.min(100, Math.round((stats.monthly_coins_earned / stats.monthly_cap) * 100))
    : 0;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Parrainage</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.background ?? '#0a0a0f' }}>
          <GoFolixLoader />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        >

          {/* Hero */}
          <LinearGradient
            colors={[colors.primary + '22', colors.gradientEnd + '18']}
            style={[s.heroCard, { borderColor: colors.primary + '30' }]}
          >
            <Text style={[s.heroTitle, { color: colors.textPrimary }]}>Invitez vos amis</Text>
            <Text style={[s.heroSub, { color: colors.textSecondary }]}>
              Gagnez des coins pour chaque ami qui rejoint GoFolix et chaque achat qu'il effectue.
            </Text>

            {/* Récompenses */}
            <View style={s.rewardsRow}>
              <View style={[s.rewardPill, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                <Icon name="user-plus" size={14} color={colors.primary} />
                <Text style={[s.rewardText, { color: colors.primary }]}>+30 coins / inscription</Text>
              </View>
              <View style={[s.rewardPill, { backgroundColor: colors.accentGreen + '18', borderColor: colors.accentGreen + '40' }]}>
                <Icon name="shopping-cart" size={14} color={colors.accentGreen} />
                <Text style={[s.rewardText, { color: colors.accentGreen }]}>+5% sur achats</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Code de parrainage */}
          <View style={[s.codeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.cardLabel, { color: colors.textSecondary }]}>Votre code</Text>
            <View style={s.codeRow}>
              <Text style={[s.codeText, { color: colors.textPrimary }]}>
                {stats?.referral_code ?? '—'}
              </Text>
              <TouchableOpacity
                onPress={handleCopy}
                style={[s.copyBtn, { backgroundColor: copied ? colors.accentGreen + '20' : colors.primary + '15' }]}
              >
                <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? colors.accentGreen : colors.primary} />
                <Text style={[s.copyLabel, { color: copied ? colors.accentGreen : colors.primary }]}>
                  {copied ? 'Copié !' : 'Copier'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.shareBtn, { backgroundColor: colors.primary }]}
              onPress={handleShare}
            >
              <Icon name="share-2" size={16} color="#fff" />
              <Text style={s.shareBtnText}>Inviter des amis</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={s.statsGrid}>
            <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="users" size={20} color={colors.primary} />
              <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats?.total_referred ?? 0}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>Filleuls</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="award" size={20} color={colors.accentGreen} />
              <Text style={[s.statValue, { color: colors.textPrimary }]}>{stats?.total_coins_earned ?? 0}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>Coins gagnés</Text>
            </View>
          </View>

          {/* Plafond mensuel */}
          <View style={[s.capCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.capHeader}>
              <Text style={[s.cardLabel, { color: colors.textSecondary }]}>Ce mois-ci</Text>
              <Text style={[s.capValue, { color: colors.textPrimary }]}>
                {stats?.monthly_coins_earned ?? 0} / {stats?.monthly_cap ?? 500} coins
              </Text>
            </View>
            <View style={[s.capTrack, { backgroundColor: colors.border }]}>
              <View style={[s.capFill, { width: `${monthlyPct}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[s.capNote, { color: colors.textTertiary }]}>
              Plafond : {stats?.monthly_cap ?? 500} coins/mois de commissions affiliation
            </Text>
          </View>

          {/* Comment ca marche */}
          <View style={[s.howCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.howTitle, { color: colors.textPrimary }]}>Comment ca marche ?</Text>
            {[
              { icon: 'share-2', text: 'Partagez votre code avec vos amis' },
              { icon: 'user-check', text: "L'ami entre votre code lors de son inscription" },
              { icon: 'gift', text: 'Il recoit 20 coins, vous recevez 30 coins' },
              { icon: 'percent', text: 'Vous gagnez 5% sur chacun de ses achats (max 500/mois)' },
            ].map((item, i) => (
              <View key={i} style={s.howRow}>
                <View style={[s.howIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Icon name={item.icon as any} size={14} color={colors.primary} />
                </View>
                <Text style={[s.howText, { color: colors.textSecondary }]}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* Liste filleuls */}
          {users.length > 0 && (
            <View style={[s.usersCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.howTitle, { color: colors.textPrimary }]}>
                Mes filleuls ({users.length})
              </Text>
              {users.map((u, i) => {
                const name    = u.display_name ?? u.username;
                const initial = name[0]?.toUpperCase() ?? '?';
                const date    = new Date(u.joined_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
                return (
                  <View key={u.id} style={[
                    s.userRow,
                    i < users.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                  ]}>
                    <View style={[s.userAvatar, { backgroundColor: colors.primary + '33' }]}>
                      <Text style={[s.userInitial, { color: colors.primary }]}>{initial}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.userName, { color: colors.textPrimary }]}>{name}</Text>
                      {u.gofolix_id ? (
                        <Text style={[s.userDate, { color: colors.primary, fontWeight: '700', letterSpacing: 1 }]}>
                          {u.gofolix_id}
                        </Text>
                      ) : null}
                      <Text style={[s.userDate, { color: colors.textTertiary }]}>Inscrit le {date}</Text>
                    </View>
                    {u.coins_generated > 0 && (
                      <View style={[s.userCoins, { backgroundColor: '#FFD70018' }]}>
                        <Text style={s.userCoinsText}>+{u.coins_generated}</Text>
                        <Text style={s.userCoinsLabel}> coins</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root:         { flex: 1 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontWeight: '700' },
  scroll:       { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },

  heroCard:     { borderRadius: 16, padding: 20, borderWidth: 1 },
  heroTitle:    { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  heroSub:      { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  rewardsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rewardPill:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  rewardText:   { fontSize: 12, fontWeight: '600' },

  codeCard:     { borderRadius: 16, padding: 20, borderWidth: 1 },
  cardLabel:    { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  codeRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  codeText:     { fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  copyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  copyLabel:    { fontSize: 13, fontWeight: '700' },
  shareBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  statsGrid:    { flexDirection: 'row', gap: 12 },
  statCard:     { flex: 1, borderRadius: 14, padding: 16, borderWidth: 1, alignItems: 'center', gap: 6 },
  statValue:    { fontSize: 26, fontWeight: '800' },
  statLabel:    { fontSize: 12, fontWeight: '500' },

  capCard:      { borderRadius: 16, padding: 16, borderWidth: 1 },
  capHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  capValue:     { fontSize: 14, fontWeight: '700' },
  capTrack:     { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  capFill:      { height: '100%', borderRadius: 4 },
  capNote:      { fontSize: 11 },

  howCard:      { borderRadius: 16, padding: 16, borderWidth: 1 },
  howTitle:     { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  howRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  howIcon:      { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  howText:      { flex: 1, fontSize: 13, lineHeight: 19 },

  usersCard:    { borderRadius: 16, padding: 16, borderWidth: 1 },
  userRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  userAvatar:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  userInitial:  { fontSize: 16, fontWeight: '800' },
  userName:     { fontSize: 14, fontWeight: '600' },
  userDate:     { fontSize: 11, marginTop: 2 },
  userCoins:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  userCoinsText:  { color: '#FFD700', fontSize: 13, fontWeight: '800' },
  userCoinsLabel: { color: '#FFD700', fontSize: 11, fontWeight: '500' },
});
