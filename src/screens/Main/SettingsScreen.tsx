import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Image,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader } from '../../components/common';
import { authService } from '../../services/authService';
import { subscriptionService } from '../../services/subscriptionService';
import { notificationService } from '../../services/notificationService';
import { useNavigation } from '@react-navigation/native';
import type { Subscription } from '../../types';
import type { User } from '../../types/user';

// ── Types ─────────────────────────────────────────────────────────────────────

type VerifStatus = 'none' | 'pending' | 'approved' | 'rejected';

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuit', basic: 'Basic', premium: 'Premium', family: 'Family',
};
const PLAN_COLORS: Record<string, string> = {
  free: '#9390AB', basic: '#3B82F6', premium: '#7B3FF2', family: '#E0389A',
};

// ── Badge vérifié ─────────────────────────────────────────────────────────────

export const VerifiedBadge: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center',
  }}>
    <Icon name="check" size={size * 0.6} color="#fff" />
  </View>
);

// ── SettingsScreen ────────────────────────────────────────────────────────────

interface Props { onLogout?: () => void; }

export const SettingsScreen: React.FC<Props> = ({ onLogout }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();
  const isDark = theme.isDark;

  const [user,         setUser]         = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [loadingUser,  setLoadingUser]  = useState(true);

  const loadData = useCallback(async () => {
    setLoadingUser(true);
    try {
      const [u, sub, notifCount] = await Promise.allSettled([
        authService.getMe(),
        subscriptionService.getMyCurrent(),
        notificationService.getUnreadCount(),
      ]);
      if (u.status === 'fulfilled')          setUser(u.value);
      if (sub.status === 'fulfilled')        setSubscription(sub.value);
      if (notifCount.status === 'fulfilled') setUnreadCount(notifCount.value);
    } catch {}
    finally { setLoadingUser(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  const handleLogout = () => {
    Alert.alert('Se déconnecter', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnecter', style: 'destructive', onPress: () => {
        authService._clearTokens();
        onLogout?.();
        authService.logout().catch(() => {});
      }},
    ]);
  };

  const planKey   = subscription?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planKey] ?? planKey;
  const planColor = PLAN_COLORS[planKey] ?? colors.primary;

  const displayName = user?.display_name ?? user?.username ?? '';
  const initials    = displayName ? displayName[0].toUpperCase() : '?';

  const verifStatus = (user?.verification_status ?? 'none') as VerifStatus;
  const verifSub: Record<VerifStatus, string> = {
    none:     'Obtenir le badge bleu FoliX',
    pending:  'Demande en cours d\'examen',
    approved: 'Compte vérifié',
    rejected: 'Demande refusée — réessayer',
  };

  type SectionDef = {
    key: string;
    icon: string;
    label: string;
    color: string;
    sub?: string;
    badge?: React.ReactNode;
    onPress: () => void;
  };

  const SECTIONS: SectionDef[] = [
    { key: 'wallet',       icon: 'dollar-sign',    label: 'Mon Wallet',         color: '#FFD700', sub: 'Solde, achats, transferts',   onPress: () => nav.navigate('SettingsWallet') },
    { key: 'monetisation', icon: 'bar-chart-2',    label: 'Monétisation',       color: '#7B3FF2', sub: 'Dashboard, stats, revenus',   onPress: () => nav.navigate('SettingsMonetisation') },
    { key: 'abonnement',   icon: 'star',           label: 'Abonnement',         color: planColor, sub: planLabel,                     onPress: () => nav.navigate('SettingsAbonnement') },
    { key: 'verification', icon: 'shield',         label: 'Vérification FoliX', color: '#1D9BF0', sub: verifSub[verifStatus],
      badge: user?.is_verified ? <VerifiedBadge size={18} /> : undefined,
      onPress: () => nav.navigate('SettingsVerification', { user }) },
    { key: 'apparence',    icon: 'sun',            label: 'Apparence',          color: '#F59E0B', sub: isDark ? 'Mode sombre' : 'Mode clair', onPress: () => nav.navigate('SettingsApparence') },
    { key: 'notifications',icon: 'bell',           label: 'Notifications',      color: '#3B82F6',
      sub: unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : undefined,
      onPress: () => nav.navigate('SettingsNotifications') },
    { key: 'lecture',      icon: 'play-circle',    label: 'Lecture',            color: '#10B981', onPress: () => nav.navigate('SettingsLecture') },
    { key: 'compte',       icon: 'user',           label: 'Compte',             color: '#7B3FF2', onPress: () => nav.navigate('SettingsCompte') },
    { key: 'contenu',      icon: 'film',           label: 'Contenu',            color: '#E0389A', onPress: () => nav.navigate('SettingsContenu') },
    { key: 'apropos',      icon: 'info',           label: 'À propos',           color: '#6366F1', onPress: () => nav.navigate('SettingsAPropos') },
    { key: 'danger',       icon: 'alert-triangle', label: 'Zone dangereuse',    color: '#EF4444', onPress: () => nav.navigate('SettingsDanger') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Paramètres" variant="default" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Profil */}
        <Animated.View entering={FadeInDown.springify()} style={{ marginBottom: 24 }}>
          <TouchableOpacity
            style={[s.profileCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}
            onPress={() => nav.navigate('EditProfile')}
            activeOpacity={0.85}
          >
            {loadingUser ? (
              <View style={[s.avatarCircle, { backgroundColor: colors.backgroundSecondary }]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={s.avatarCircle} />
            ) : (
              <LinearGradient colors={[colors.primary, colors.primary + 'AA']} style={s.avatarCircle}>
                <Text style={s.avatarInitial}>{initials}</Text>
              </LinearGradient>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  {user?.display_name ?? user?.username ?? '...'}
                </Text>
                {user?.is_verified && <VerifiedBadge size={16} />}
              </View>
              <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 2 }}>
                {user?.email ?? ''}
              </Text>
            </View>
            <Icon name="edit-2" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Liste des sections */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          {SECTIONS.map((sec, i) => (
            <Animated.View key={sec.key} entering={FadeInDown.delay(i * 40).springify()}>
              <TouchableOpacity
                style={[s.sectionRow, i < SECTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
                onPress={sec.onPress}
                activeOpacity={0.7}
              >
                <View style={[s.iconWrap, { backgroundColor: sec.color + '18' }]}>
                  <Icon name={sec.icon} size={18} color={sec.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.sectionLabel, { color: sec.key === 'danger' ? '#EF4444' : colors.textPrimary }]}>
                      {sec.label}
                    </Text>
                    {sec.badge}
                  </View>
                  {sec.sub ? (
                    <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{sec.sub}</Text>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

        {/* Scanner QR web */}
        <TouchableOpacity
          style={[s.logoutBtn, { borderColor: '#7B3FF2', marginTop: 16 }]}
          onPress={() => nav.navigate('WebQRScanner')}
          activeOpacity={0.75}
        >
          <Icon name="monitor" size={18} color="#7B3FF2" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#7B3FF2', fontWeight: '700', fontSize: 15 }}>Connecter le site web</Text>
            <Text style={{ color: '#7B3FF2', fontSize: 11, opacity: 0.7, marginTop: 1 }}>Scanner le QR code sur folix.com</Text>
          </View>
          <Icon name="camera" size={16} color="#7B3FF2" />
        </TouchableOpacity>

        {/* Déconnexion */}
        <TouchableOpacity
          style={[s.logoutBtn, { borderColor: '#EF4444', marginTop: 10 }]}
          onPress={handleLogout}
          activeOpacity={0.75}
        >
          <Icon name="log-out" size={18} color="#EF4444" />
          <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 15 }}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 15, paddingHorizontal: 14,
  },
  sectionLabel: { fontSize: 15, fontWeight: '600' },
  iconWrap: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14,
  },
  avatarCircle: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarInitial: { color: '#fff', fontSize: 22, fontWeight: '800' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, borderWidth: 1.5, paddingVertical: 14,
  },
});
