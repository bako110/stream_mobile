import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, Alert, ActivityIndicator, Image, TextInput,
} from 'react-native';
import Animated, { FadeInDown, SlideInRight } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader } from '../../components/common';
import { authService } from '../../services/authService';
import { userService } from '../../services/userService';
import { subscriptionService } from '../../services/subscriptionService';
import { notificationService } from '../../services/notificationService';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import { useNavigation } from '@react-navigation/native';
import type { Subscription } from '../../types';
import type { User } from '../../types/user';

// ── Types ─────────────────────────────────────────────────────────────────────

type Section =
  | 'abonnement' | 'apparence' | 'notifications' | 'lecture'
  | 'compte' | 'contenu' | 'apropos' | 'danger' | 'verification';

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

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  icon: string; label: string; value?: string;
  onPress?: () => void; color?: string;
  right?: React.ReactNode; danger?: boolean; last?: boolean;
}
const Row: React.FC<RowProps> = ({ icon, label, value, onPress, color, right, danger, last }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const accent = danger ? '#EF4444' : (color ?? colors.primary);
  return (
    <TouchableOpacity
      style={[s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[s.iconWrap, { backgroundColor: accent + '18' }]}>
        <Icon name={icon} size={17} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: danger ? '#EF4444' : colors.textPrimary }}>{label}</Text>
        {value ? <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{value}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={15} color={colors.textTertiary} /> : null)}
    </TouchableOpacity>
  );
};

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
      {children}
    </View>
  );
};

// ── SubScreen ─────────────────────────────────────────────────────────────────

const SubScreen: React.FC<{ title: string; onBack: () => void; children: React.ReactNode }> = ({ title, onBack, children }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <Animated.View entering={SlideInRight.duration(280)} style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 10 }]}>
      <View style={[s.subHeader, { borderBottomColor: colors.divider, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.subTitle, { color: colors.textPrimary }]}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Animated.View>
  );
};

// ── VerificationSubScreen ─────────────────────────────────────────────────────

const VerificationSubScreen: React.FC<{ onBack: () => void; user: User | null }> = ({ onBack, user }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [status,   setStatus]   = useState<VerifStatus>((user?.verification_status as VerifStatus) ?? 'none');
  const [note,     setNote]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get<{ status: VerifStatus; note?: string }>(
          Endpoints.users.verificationStatus,
        );
        setStatus(res.data.status);
      } catch {}
      finally { setFetching(false); }
    })();
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await apiClient.post(Endpoints.users.verifyRequest, { note: note.trim() || undefined });
      setStatus('pending');
      Alert.alert('Demande envoyée', 'Votre demande est en cours d\'examen. Vous serez notifié du résultat.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible d\'envoyer la demande.');
    } finally {
      setLoading(false);
    }
  };

  const STATUS_CONFIG: Record<VerifStatus, { icon: string; color: string; title: string; sub: string }> = {
    none:     { icon: 'shield',       color: colors.textTertiary, title: 'Non vérifié',           sub: 'Soumettez une demande pour obtenir le badge FoliX' },
    pending:  { icon: 'clock',        color: '#F59E0B',           title: 'En cours d\'examen',    sub: 'Votre demande est en attente de validation par notre équipe' },
    approved: { icon: 'check-circle', color: '#1D9BF0',           title: 'Compte vérifié',        sub: 'Votre compte est certifié FoliX' },
    rejected: { icon: 'x-circle',     color: '#EF4444',           title: 'Demande refusée',       sub: 'Votre demande n\'a pas été approuvée. Vous pouvez en soumettre une nouvelle.' },
  };

  const cfg = STATUS_CONFIG[status];

  return (
    <SubScreen title="Vérification FoliX" onBack={onBack}>
      {fetching ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Statut actuel */}
          <View style={[s.verifCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            <View style={[s.verifIconWrap, { backgroundColor: cfg.color + '18' }]}>
              <Icon name={cfg.icon} size={28} color={cfg.color} />
              {status === 'approved' && (
                <View style={s.verifCheckOverlay}>
                  <Icon name="check" size={10} color="#fff" />
                </View>
              )}
            </View>
            <Text style={[s.verifTitle, { color: cfg.color }]}>{cfg.title}</Text>
            <Text style={[s.verifSub, { color: colors.textSecondary }]}>{cfg.sub}</Text>

            {status === 'approved' && (
              <View style={s.badgePreview}>
                <Text style={[s.badgePreviewText, { color: colors.textPrimary }]}>
                  {user?.display_name ?? user?.username}
                </Text>
                <VerifiedBadge size={18} />
              </View>
            )}
          </View>

          {/* Ce que ça apporte */}
          <Text style={[s.sectionLabel, { color: colors.textTertiary, marginTop: 24, marginBottom: 10 }]}>
            AVANTAGES DE LA VÉRIFICATION
          </Text>
          <Card>
            {[
              { icon: 'shield',      text: 'Badge bleu visible sur votre profil et vos contenus' },
              { icon: 'trending-up', text: 'Meilleure visibilité dans les recherches et suggestions' },
              { icon: 'star',        text: 'Accès prioritaire aux nouvelles fonctionnalités' },
              { icon: 'users',       text: 'Confiance accrue de votre communauté' },
            ].map((item, i) => (
              <Row key={i} icon={item.icon} label={item.text} color="#1D9BF0" last={i === 3} />
            ))}
          </Card>

          {/* Formulaire de demande */}
          {(status === 'none' || status === 'rejected') && (
            <>
              <Text style={[s.sectionLabel, { color: colors.textTertiary, marginTop: 24, marginBottom: 10 }]}>
                SOUMETTRE UNE DEMANDE
              </Text>
              <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.divider, padding: 14, gap: 14 }]}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
                  Expliquez brièvement pourquoi vous méritez le badge FoliX (artiste, créateur, personnalité publique…).
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ex : Artiste avec 10k abonnés sur Instagram, lien : instagram.com/..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={4}
                  style={[s.verifInput, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
                />
                <TouchableOpacity
                  style={[s.verifBtn, { backgroundColor: '#1D9BF0', opacity: loading ? 0.7 : 1 }]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Icon name="send" size={15} color="#fff" />
                        <Text style={s.verifBtnText}>Envoyer la demande</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </>
      )}
    </SubScreen>
  );
};

// ── SettingsScreen ────────────────────────────────────────────────────────────

interface Props { onLogout?: () => void; }

export const SettingsScreen: React.FC<Props> = ({ onLogout }) => {
  const { theme, toggleTheme } = useTheme();
  const { colors } = theme;
  const nav = useNavigation<any>();

  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [user,         setUser]         = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [loadingUser,  setLoadingUser]  = useState(true);
  const [loggingOut,   setLoggingOut]   = useState(false);
  const [pushEnabled,  setPushEnabled]  = useState(true);
  const [autoPlay,     setAutoPlay]     = useState(true);
  const [hdStream,     setHdStream]     = useState(true);
  const isDark = theme.isDark;

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
      { text: 'Déconnecter', style: 'destructive', onPress: async () => {
        setLoggingOut(true);
        try { await authService.logout(); } catch {}
        onLogout?.();
      }},
    ]);
  };

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

  const planKey   = subscription?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planKey] ?? planKey;
  const planColor = PLAN_COLORS[planKey] ?? colors.primary;
  const planEnd   = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const displayName = user?.display_name ?? user?.username ?? '';
  const initials    = displayName ? displayName[0].toUpperCase() : '?';

  const verifStatus = (user?.verification_status ?? 'none') as VerifStatus;
  const verifSub: Record<VerifStatus, string> = {
    none:     'Obtenir le badge bleu FoliX',
    pending:  'Demande en cours d\'examen',
    approved: 'Compte vérifié',
    rejected: 'Demande refusée — réessayer',
  };

  const SECTIONS: { key: Section; icon: string; label: string; color: string; sub?: string; badge?: React.ReactNode }[] = [
    { key: 'abonnement',    icon: 'star',         label: 'Abonnement',        color: planColor,  sub: planLabel },
    { key: 'verification',  icon: 'shield',        label: 'Vérification FoliX', color: '#1D9BF0',  sub: verifSub[verifStatus],
      badge: user?.is_verified ? <VerifiedBadge size={18} /> : undefined },
    { key: 'apparence',     icon: 'sun',           label: 'Apparence',         color: '#F59E0B',  sub: isDark ? 'Mode sombre' : 'Mode clair' },
    { key: 'notifications', icon: 'bell',          label: 'Notifications',     color: '#3B82F6',  sub: unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : undefined },
    { key: 'lecture',       icon: 'play-circle',   label: 'Lecture',           color: '#10B981' },
    { key: 'compte',        icon: 'user',          label: 'Compte',            color: '#7B3FF2' },
    { key: 'contenu',       icon: 'film',          label: 'Contenu',           color: '#E0389A' },
    { key: 'apropos',       icon: 'info',          label: 'À propos',          color: '#6366F1' },
    { key: 'danger',        icon: 'alert-triangle',label: 'Zone dangereuse',   color: '#EF4444' },
  ];

  // ── Sous-sections ─────────────────────────────────────────────────────────

  const renderSub = () => {
    switch (activeSection) {
      case 'verification':
        return <VerificationSubScreen onBack={() => setActiveSection(null)} user={user} />;

      case 'abonnement':
        return (
          <SubScreen title="Abonnement" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="star" label="Mon plan" value={planEnd ? `Expire le ${planEnd}` : 'Aucun abonnement actif'} color={planColor}
                right={<View style={[s.planBadge, { backgroundColor: planColor + '20', borderColor: planColor + '40' }]}><Text style={[s.planBadgeText, { color: planColor }]}>{planLabel}</Text></View>}
              />
              <Row icon="credit-card" label="Gérer mon abonnement" value="Changer de plan ou résilier" color="#7B3FF2"
                onPress={() => { setActiveSection(null); nav.navigate('Subscriptions'); }} last />
            </Card>
          </SubScreen>
        );

      case 'apparence':
        return (
          <SubScreen title="Apparence" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="moon" label="Mode sombre" last
                right={<Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
              />
            </Card>
          </SubScreen>
        );

      case 'notifications':
        return (
          <SubScreen title="Notifications" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="bell" label="Notifications push"
                right={<Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
              />
              <Row icon="inbox" label="Voir les notifications"
                value={unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Toutes lues'}
                color="#3B82F6" onPress={() => { setActiveSection(null); nav.navigate('Notifications'); }}
              />
              <Row icon="check-circle" label="Tout marquer comme lu" color="#10B981" onPress={handleMarkAllRead} />
              <Row icon="trash-2" label="Effacer toutes les notifications" color="#F59E0B" onPress={handleClearNotifs} last />
            </Card>
          </SubScreen>
        );

      case 'lecture':
        return (
          <SubScreen title="Lecture" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="play" label="Lecture automatique"
                right={<Switch value={autoPlay} onValueChange={setAutoPlay} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
              />
              <Row icon="wifi" label="Streaming HD" value="Utilise plus de données mobiles" last
                right={<Switch value={hdStream} onValueChange={setHdStream} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
              />
            </Card>
          </SubScreen>
        );

      case 'compte':
        return (
          <SubScreen title="Compte" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="user"     label="Modifier le profil"      color="#7B3FF2" onPress={() => { setActiveSection(null); nav.navigate('EditProfile'); }} />
              <Row icon="lock"     label="Changer le mot de passe" color="#9B65F5" onPress={() => { setActiveSection(null); nav.navigate('ChangePassword'); }} />
              <Row icon="shield"   label="Confidentialité"         color="#3B82F6" onPress={() => { setActiveSection(null); nav.navigate('Privacy'); }} />
              <Row icon="slash"    label="Utilisateurs bloqués"    color="#EF4444" onPress={() => { setActiveSection(null); nav.navigate('BlockedUsers'); }} />
              <Row icon="users"    label="Abonnements / Abonnés"   color="#10B981" onPress={() => { setActiveSection(null); nav.navigate('Following'); }} />
              <Row icon="download" label="Télécharger mes données" color="#6366F1" onPress={() => Alert.alert('Bientôt disponible', 'Export de données disponible prochainement.')} last />
            </Card>
          </SubScreen>
        );

      case 'contenu':
        return (
          <SubScreen title="Contenu" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="music"       label="Mes concerts"   color="#E0389A" onPress={() => { setActiveSection(null); nav.navigate('Concerts'); }} />
              <Row icon="calendar"    label="Mes événements" color="#FF9800" onPress={() => { setActiveSection(null); nav.navigate('Events'); }} />
              <Row icon="film"        label="Films & Séries" color="#2196F3" onPress={() => { setActiveSection(null); nav.navigate('Films'); }} />
              <Row icon="trending-up" label="Tendances"      color="#00BCD4" onPress={() => { setActiveSection(null); nav.navigate('Trending'); }} last />
            </Card>
          </SubScreen>
        );

      case 'apropos':
        return (
          <SubScreen title="À propos" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="info"        label="Version"        value="1.0.0 (build 1)" />
              <Row icon="file-text"   label="CGU"            onPress={() => Alert.alert('Conditions d\'utilisation', 'Les CGU seront disponibles prochainement.')} />
              <Row icon="help-circle" label="Aide & Support" onPress={() => Alert.alert('Support', 'Contactez-nous à support@folix.app')} last />
            </Card>
          </SubScreen>
        );

      case 'danger':
        return (
          <SubScreen title="Zone dangereuse" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="alert-triangle" label="Supprimer mon compte" value="Action irréversible" danger onPress={handleDeleteAccount} last />
            </Card>
          </SubScreen>
        );

      default:
        return null;
    }
  };

  // ── Écran principal ───────────────────────────────────────────────────────

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
                onPress={() => setActiveSection(sec.key)}
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

        {/* Déconnexion */}
        <TouchableOpacity
          style={[s.logoutBtn, { borderColor: '#EF4444', marginTop: 24 }]}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.75}
        >
          {loggingOut
            ? <ActivityIndicator color="#EF4444" size="small" />
            : <>
                <Icon name="log-out" size={18} color="#EF4444" />
                <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 15 }}>Se déconnecter</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>

      {/* Sous-section active */}
      {activeSection && renderSub()}
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
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 14,
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
  planBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  planBadgeText: { fontSize: 12, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, borderWidth: 1.5, paddingVertical: 14,
  },
  subHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  subTitle: { fontSize: 17, fontWeight: '700' },

  // Vérification
  verifCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 24, alignItems: 'center', gap: 10,
  },
  verifIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, position: 'relative',
  },
  verifCheckOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  verifTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  verifSub:   { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  badgePreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#1D9BF010',
  },
  badgePreviewText: { fontSize: 14, fontWeight: '700' },
  verifInput: {
    borderWidth: 1, borderRadius: 12, padding: 12,
    fontSize: 13, lineHeight: 20, textAlignVertical: 'top', minHeight: 90,
  },
  verifBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 13,
  },
  verifBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
