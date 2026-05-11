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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../../context/UserContext';
import type { Subscription } from '../../types';
import type { User } from '../../types/user';

// ── Types ─────────────────────────────────────────────────────────────────────

type Section =
  | 'abonnement' | 'apparence' | 'notifications' | 'lecture'
  | 'compte' | 'contenu' | 'apropos' | 'danger' | 'verification' | 'wallet';

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
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={SlideInRight.duration(280)} style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 200 }]}>
      <View style={[s.subHeader, { borderBottomColor: colors.divider, backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
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

// ── VerificationSubScreen — wizard 4 étapes ──────────────────────────────────

type AccountType = 'artist' | 'creator' | 'public_figure' | 'brand' | 'journalist' | 'other';

const ACCOUNT_TYPES: { key: AccountType; icon: string; label: string; sub: string }[] = [
  { key: 'artist',        icon: 'music',      label: 'Artiste',              sub: 'Musicien, chanteur, groupe' },
  { key: 'creator',       icon: 'video',      label: 'Créateur de contenu',  sub: 'YouTubeur, streamer, influenceur' },
  { key: 'public_figure', icon: 'star',       label: 'Personnalité publique',sub: 'Athlète, acteur, personnalité TV' },
  { key: 'brand',         icon: 'briefcase',  label: 'Marque / Entreprise',  sub: 'Organisation ou société officielle' },
  { key: 'journalist',    icon: 'edit-2',     label: 'Journaliste / Média',  sub: 'Presse, radio, chaîne d\'info' },
  { key: 'other',         icon: 'user',       label: 'Autre',                sub: 'Autre catégorie notable' },
];

const BLUE = '#1D9BF0';

const VerificationSubScreen: React.FC<{ onBack: () => void; user: User | null }> = ({ onBack, user }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { refreshUser } = useUser();

  const [status,      setStatus]      = useState<VerifStatus>((user?.verification_status as VerifStatus) ?? 'none');
  const [fetching,    setFetching]    = useState(true);
  const [step,        setStep]        = useState(0); // 0=intro 1=type 2=info 3=confirm
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [fullName,    setFullName]    = useState(user?.display_name ?? '');
  const [bio,         setBio]         = useState('');
  const [links,       setLinks]       = useState('');
  const [loading,     setLoading]     = useState(false);

  const canGoStep2 = !!accountType;
  const canGoStep3 = fullName.trim().length >= 2 && bio.trim().length >= 20;

  const fetchStatus = async () => {
    try {
      const res = await apiClient.get<{ status: VerifStatus; is_verified: boolean }>(Endpoints.users.verificationStatus);
      setStatus(res.data.status);
      if (res.data.is_verified || res.data.status === 'approved') await refreshUser();
    } catch {}
    finally { setFetching(false); }
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const note = [
        `Type: ${accountType}`,
        `Nom: ${fullName.trim()}`,
        `Bio: ${bio.trim()}`,
        links.trim() ? `Liens: ${links.trim()}` : '',
      ].filter(Boolean).join('\n');
      await apiClient.post(Endpoints.users.verifyRequest, { note });
      setStatus('pending');
      setStep(0);
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail ?? 'Impossible d\'envoyer la demande.');
    } finally {
      setLoading(false);
    }
  };

  // ── Rendu statut déjà défini (pending / approved / rejected) ──────────────
  const renderStatus = () => {
    const CFG: Record<VerifStatus, { icon: string; color: string; title: string; sub: string }> = {
      none:     { icon: 'shield',       color: colors.textTertiary, title: 'Non vérifié',         sub: '' },
      pending:  { icon: 'clock',        color: '#F59E0B',           title: 'En cours d\'examen',  sub: 'Notre équipe examine votre dossier. Cela peut prendre quelques jours.' },
      approved: { icon: 'check-circle', color: BLUE,                title: 'Compte vérifié ✓',    sub: 'Votre compte est certifié FoliX.' },
      rejected: { icon: 'x-circle',     color: '#EF4444',           title: 'Demande refusée',     sub: user?.verification_note ?? 'Votre demande n\'a pas été approuvée. Vous pouvez en soumettre une nouvelle.' },
    };
    const cfg = CFG[status];
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={[vs.statusCard, { backgroundColor: cfg.color + '12', borderColor: cfg.color + '40' }]}>
          <Icon name={cfg.icon} size={40} color={cfg.color} />
          <Text style={[vs.statusTitle, { color: cfg.color }]}>{cfg.title}</Text>
          <Text style={[vs.statusSub, { color: colors.textSecondary }]}>{cfg.sub}</Text>
          {status === 'approved' && (
            <View style={[vs.badgeRow, { backgroundColor: colors.surface }]}>
              <Text style={[vs.badgeName, { color: colors.textPrimary }]}>{user?.display_name ?? user?.username}</Text>
              <VerifiedBadge size={18} />
            </View>
          )}
        </View>

        {status === 'approved' && (
          <View style={[vs.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            {[
              { icon: 'shield',      text: 'Badge bleu sur votre profil et vos contenus' },
              { icon: 'trending-up', text: 'Priorité dans les recherches et suggestions' },
              { icon: 'star',        text: 'Accès anticipé aux nouvelles fonctionnalités' },
              { icon: 'users',       text: 'Confiance renforcée de votre communauté' },
            ].map((it, i, arr) => (
              <Row key={i} icon={it.icon} label={it.text} color={BLUE} last={i === arr.length - 1} />
            ))}
          </View>
        )}

        {status === 'rejected' && (
          <TouchableOpacity
            style={[vs.primaryBtn, { backgroundColor: BLUE }]}
            onPress={() => setStep(1)}
          >
            <Icon name="refresh-cw" size={16} color="#fff" />
            <Text style={vs.primaryBtnText}>Soumettre une nouvelle demande</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  };

  // ── Étape 0 : intro & critères ─────────────────────────────────────────────
  const renderStep0 = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
      <View style={[vs.heroBadge, { backgroundColor: BLUE + '15' }]}>
        <View style={vs.heroBadgeIcon}>
          <Icon name="shield" size={32} color={BLUE} />
          <View style={vs.heroBadgeCheck}>
            <Icon name="check" size={9} color="#fff" />
          </View>
        </View>
        <Text style={[vs.heroTitle, { color: colors.textPrimary }]}>Badge vérifié FoliX</Text>
        <Text style={[vs.heroSub, { color: colors.textSecondary }]}>
          Le badge bleu confirme que ce compte est le vrai compte d'une personnalité, créateur ou marque notable.
        </Text>
      </View>

      <Text style={[vs.sectionLabel, { color: colors.textTertiary }]}>QUI PEUT ÊTRE VÉRIFIÉ ?</Text>
      <View style={[vs.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        {[
          { icon: 'check', text: 'Artiste ou musicien avec audience active' },
          { icon: 'check', text: 'Créateur de contenu avec présence notable' },
          { icon: 'check', text: 'Personnalité publique, athlète ou acteur' },
          { icon: 'check', text: 'Marque ou organisation officielle' },
          { icon: 'check', text: 'Journaliste ou media reconnu' },
        ].map((it, i, arr) => (
          <View key={i} style={[vs.criteriaRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
            <View style={[vs.criteriaCheck, { backgroundColor: '#22C55E20' }]}>
              <Icon name={it.icon} size={12} color="#22C55E" />
            </View>
            <Text style={[vs.criteriaText, { color: colors.textPrimary }]}>{it.text}</Text>
          </View>
        ))}
      </View>

      <Text style={[vs.sectionLabel, { color: colors.textTertiary }]}>CE QUE ÇA VOUS APPORTE</Text>
      <View style={[vs.card, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        {[
          { icon: 'shield',      text: 'Badge bleu visible sur votre profil et contenus' },
          { icon: 'trending-up', text: 'Meilleure visibilité dans les recherches' },
          { icon: 'star',        text: 'Accès prioritaire aux nouvelles fonctionnalités' },
          { icon: 'users',       text: 'Confiance accrue de votre communauté' },
        ].map((it, i, arr) => (
          <Row key={i} icon={it.icon} label={it.text} color={BLUE} last={i === arr.length - 1} />
        ))}
      </View>

      <TouchableOpacity style={[vs.primaryBtn, { backgroundColor: BLUE }]} onPress={() => setStep(1)}>
        <Text style={vs.primaryBtnText}>Faire une demande</Text>
        <Icon name="arrow-right" size={16} color="#fff" />
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Étape 1 : type de compte ───────────────────────────────────────────────
  const renderStep1 = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
      <Text style={[vs.stepTitle, { color: colors.textPrimary }]}>Quel type de compte ?</Text>
      <Text style={[vs.stepSub, { color: colors.textSecondary }]}>
        Choisissez la catégorie qui correspond le mieux à votre activité.
      </Text>
      <View style={{ gap: 10 }}>
        {ACCOUNT_TYPES.map(t => {
          const selected = accountType === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[vs.typeCard, { backgroundColor: colors.surface, borderColor: selected ? BLUE : colors.divider, borderWidth: selected ? 2 : StyleSheet.hairlineWidth }]}
              onPress={() => setAccountType(t.key)}
              activeOpacity={0.75}
            >
              <View style={[vs.typeIcon, { backgroundColor: selected ? BLUE + '20' : colors.backgroundSecondary }]}>
                <Icon name={t.icon} size={20} color={selected ? BLUE : colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[vs.typeLabel, { color: colors.textPrimary }]}>{t.label}</Text>
                <Text style={[vs.typeSub, { color: colors.textTertiary }]}>{t.sub}</Text>
              </View>
              {selected && <Icon name="check-circle" size={20} color={BLUE} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={vs.navRow}>
        <TouchableOpacity style={[vs.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(0)}>
          <Icon name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={[vs.secondaryBtnText, { color: colors.textSecondary }]}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[vs.primaryBtn, { flex: 1, backgroundColor: canGoStep2 ? BLUE : colors.border }]}
          onPress={() => canGoStep2 && setStep(2)}
          disabled={!canGoStep2}
        >
          <Text style={vs.primaryBtnText}>Continuer</Text>
          <Icon name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ── Étape 2 : informations ─────────────────────────────────────────────────
  const renderStep2 = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={[vs.stepTitle, { color: colors.textPrimary }]}>Vos informations</Text>
      <Text style={[vs.stepSub, { color: colors.textSecondary }]}>
        Ces informations aident notre équipe à vérifier votre identité et votre notoriété.
      </Text>

      <View style={{ gap: 12 }}>
        <View>
          <Text style={[vs.fieldLabel, { color: colors.textTertiary }]}>NOM COMPLET OU NOM DE SCÈNE *</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Ex : Sah Douss, DJ Krys…"
            placeholderTextColor={colors.textDisabled}
            style={[vs.input, { borderColor: fullName.trim().length >= 2 ? BLUE : colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
          />
        </View>

        <View>
          <Text style={[vs.fieldLabel, { color: colors.textTertiary }]}>POURQUOI MÉRITEZ-VOUS LE BADGE ? *</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Ex : Artiste avec 50 000 écoutes sur Spotify, présence sur 3 plateformes…"
            placeholderTextColor={colors.textDisabled}
            multiline
            numberOfLines={4}
            style={[vs.input, vs.inputMulti, { borderColor: bio.trim().length >= 20 ? BLUE : colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
          />
          <Text style={[vs.charHint, { color: bio.trim().length >= 20 ? '#22C55E' : colors.textDisabled }]}>
            {bio.trim().length} / 20 min
          </Text>
        </View>

        <View>
          <Text style={[vs.fieldLabel, { color: colors.textTertiary }]}>LIENS (optionnel)</Text>
          <TextInput
            value={links}
            onChangeText={setLinks}
            placeholder="Instagram, Spotify, site web…"
            placeholderTextColor={colors.textDisabled}
            style={[vs.input, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
          />
          <Text style={[vs.charHint, { color: colors.textDisabled }]}>Séparez les liens par une virgule</Text>
        </View>
      </View>

      <View style={vs.navRow}>
        <TouchableOpacity style={[vs.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(1)}>
          <Icon name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={[vs.secondaryBtnText, { color: colors.textSecondary }]}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[vs.primaryBtn, { flex: 1, backgroundColor: canGoStep3 ? BLUE : colors.border }]}
          onPress={() => canGoStep3 && setStep(3)}
          disabled={!canGoStep3}
        >
          <Text style={vs.primaryBtnText}>Continuer</Text>
          <Icon name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ── Étape 3 : récapitulatif & envoi ───────────────────────────────────────
  const renderStep3 = () => {
    const typeInfo = ACCOUNT_TYPES.find(t => t.key === accountType)!;
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Text style={[vs.stepTitle, { color: colors.textPrimary }]}>Vérifiez votre demande</Text>
        <Text style={[vs.stepSub, { color: colors.textSecondary }]}>
          Relisez votre dossier avant de l'envoyer. Notre équipe répond sous 3 à 7 jours.
        </Text>

        <View style={[vs.summaryCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          <View style={vs.summaryRow}>
            <Text style={[vs.summaryLabel, { color: colors.textTertiary }]}>Type de compte</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={typeInfo.icon} size={14} color={BLUE} />
              <Text style={[vs.summaryValue, { color: colors.textPrimary }]}>{typeInfo.label}</Text>
            </View>
          </View>
          <View style={[vs.summaryDivider, { backgroundColor: colors.divider }]} />
          <View style={vs.summaryRow}>
            <Text style={[vs.summaryLabel, { color: colors.textTertiary }]}>Nom</Text>
            <Text style={[vs.summaryValue, { color: colors.textPrimary }]}>{fullName.trim()}</Text>
          </View>
          <View style={[vs.summaryDivider, { backgroundColor: colors.divider }]} />
          <View style={[vs.summaryRow, { alignItems: 'flex-start' }]}>
            <Text style={[vs.summaryLabel, { color: colors.textTertiary }]}>Justification</Text>
            <Text style={[vs.summaryValue, { color: colors.textPrimary, flex: 1, textAlign: 'right', lineHeight: 20 }]}>{bio.trim()}</Text>
          </View>
          {links.trim() ? (
            <>
              <View style={[vs.summaryDivider, { backgroundColor: colors.divider }]} />
              <View style={[vs.summaryRow, { alignItems: 'flex-start' }]}>
                <Text style={[vs.summaryLabel, { color: colors.textTertiary }]}>Liens</Text>
                <Text style={[vs.summaryValue, { color: BLUE, flex: 1, textAlign: 'right' }]}>{links.trim()}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={[vs.notice, { backgroundColor: '#F59E0B12', borderColor: '#F59E0B40' }]}>
          <Icon name="info" size={14} color="#F59E0B" />
          <Text style={[vs.noticeText, { color: colors.textSecondary }]}>
            Fournir de fausses informations entraîne le rejet définitif de votre demande.
          </Text>
        </View>

        <View style={vs.navRow}>
          <TouchableOpacity style={[vs.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(2)}>
            <Icon name="arrow-left" size={16} color={colors.textSecondary} />
            <Text style={[vs.secondaryBtnText, { color: colors.textSecondary }]}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[vs.primaryBtn, { flex: 1, backgroundColor: BLUE, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Icon name="send" size={15} color="#fff" />
                  <Text style={vs.primaryBtnText}>Envoyer la demande</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ── Barre de progression ───────────────────────────────────────────────────
  const showWizard = (status === 'none' || status === 'rejected') && step > 0;
  const STEPS = ['Type', 'Infos', 'Envoi'];

  return (
    <SubScreen title="Vérification FoliX" onBack={onBack}>
      {fetching ? (
        <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />
      ) : (
        <>
          {showWizard && (
            <View style={[vs.progressBar, { backgroundColor: colors.backgroundSecondary }]}>
              {STEPS.map((label, i) => {
                const done    = step > i + 1;
                const current = step === i + 1;
                return (
                  <React.Fragment key={label}>
                    <View style={vs.progressStep}>
                      <View style={[vs.progressDot, { backgroundColor: done || current ? BLUE : colors.border }]}>
                        {done
                          ? <Icon name="check" size={10} color="#fff" />
                          : <Text style={[vs.progressNum, { color: current ? '#fff' : colors.textTertiary }]}>{i + 1}</Text>
                        }
                      </View>
                      <Text style={[vs.progressLabel, { color: current ? BLUE : colors.textTertiary }]}>{label}</Text>
                    </View>
                    {i < STEPS.length - 1 && (
                      <View style={[vs.progressLine, { backgroundColor: done ? BLUE : colors.border }]} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {status === 'pending' || status === 'approved' ? renderStatus() :
            step === 0 ? renderStep0() :
            step === 1 ? renderStep1() :
            step === 2 ? renderStep2() :
            renderStep3()
          }
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
      { text: 'Déconnecter', style: 'destructive', onPress: () => {
        // _clearTokens en premier — synchrone et immédiat
        authService._clearTokens();
        // Puis on navigue vers auth
        onLogout?.();
        // Nettoyage en arrière-plan (pas besoin d'attendre)
        authService.logout().catch(() => {});
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
    { key: 'wallet',        icon: 'dollar-sign',   label: 'Wallet & Monétisation', color: '#FFD700' },
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
      case 'wallet':
        return (
          <SubScreen title="Wallet & Monétisation" onBack={() => setActiveSection(null)}>
            <Card>
              <Row icon="dollar-sign"  label="Mon Wallet"              color="#FFD700" onPress={() => { setActiveSection(null); nav.navigate('Wallet'); }} />
              <Row icon="shopping-bag" label="Acheter des coins"        color="#FF8C00" onPress={() => { setActiveSection(null); nav.navigate('BuyCoins'); }} />
              <Row icon="zap"          label="Booster mon compte"       color="#E0389A" value="Abonnés, vues, portée…" onPress={() => { setActiveSection(null); nav.navigate('Boost'); }} />
              <Row icon="bar-chart-2"  label="Dashboard Créateur"       color="#7B3FF2" onPress={() => { setActiveSection(null); nav.navigate('CreatorDashboard'); }} />
              <Row icon="trending-up"  label="Mes statistiques"         color="#8B5CF6" value="Vues, likes, partages…" onPress={() => { setActiveSection(null); nav.navigate('CreatorStats'); }} />
              <Row icon="send"         label="Transférer des coins"     color="#9B65F5" onPress={() => { setActiveSection(null); nav.navigate('Transfer'); }} />
              <Row icon="credit-card"  label="Retirer mes gains"        color="#10B981" onPress={() => { setActiveSection(null); nav.navigate('Withdraw'); }} last />
            </Card>
          </SubScreen>
        );

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
              <Row icon="monitor"  label="Connecter le site web"   color="#7B3FF2" value="Scanner un QR" onPress={() => { setActiveSection(null); nav.navigate('WebQRScanner'); }} />
              <Row icon="slash"    label="Utilisateurs bloqués"    color="#EF4444" onPress={() => { setActiveSection(null); nav.navigate('BlockedUsers'); }} />
              <Row icon="users"    label="Abonnements / Abonnés"   color="#10B981" onPress={() => { setActiveSection(null); nav.navigate('Following'); }} />
              <Row icon="zap"      label="Booster mon compte"      color="#E0389A" value="Gagne des abonnés et des vues" onPress={() => { setActiveSection(null); nav.navigate('Boost'); }} />
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
    paddingHorizontal: 16, paddingBottom: 14,
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

// ── Styles wizard vérification ────────────────────────────────────────────────
const vs = StyleSheet.create({
  // Status card
  statusCard:    { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: 'center', gap: 10 },
  statusTitle:   { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  statusSub:     { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  badgeRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginTop: 4 },
  badgeName:     { fontSize: 14, fontWeight: '700' },
  card:          { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  // Hero intro
  heroBadge:     { borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
  heroBadgeIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#1D9BF020', alignItems: 'center', justifyContent: 'center' },
  heroBadgeCheck:{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  heroTitle:     { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroSub:       { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },

  // Critères
  criteriaRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  criteriaCheck: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  criteriaText:  { fontSize: 14, lineHeight: 20, flex: 1 },

  // Boutons
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  primaryBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  navRow:        { flexDirection: 'row', gap: 10, marginTop: 4 },

  // Progress bar
  progressBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 },
  progressStep:  { alignItems: 'center', gap: 4 },
  progressDot:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressNum:   { fontSize: 12, fontWeight: '700' },
  progressLabel: { fontSize: 10, fontWeight: '600' },
  progressLine:  { flex: 1, height: 2, marginBottom: 14 },

  // Step titles
  stepTitle:     { fontSize: 20, fontWeight: '800' },
  stepSub:       { fontSize: 13, lineHeight: 20 },

  // Type cards
  typeCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14 },
  typeIcon:      { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeLabel:     { fontSize: 15, fontWeight: '700' },
  typeSub:       { fontSize: 12, marginTop: 2 },

  // Form fields
  fieldLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  input:         { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  inputMulti:    { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  charHint:      { fontSize: 11, marginTop: 4, textAlign: 'right' },

  // Summary
  summaryCard:   { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  summaryRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  summaryDivider:{ height: StyleSheet.hairlineWidth },
  summaryLabel:  { fontSize: 13 },
  summaryValue:  { fontSize: 14, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },

  // Notice
  notice:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  noticeText:    { fontSize: 12, lineHeight: 18, flex: 1 },
});
