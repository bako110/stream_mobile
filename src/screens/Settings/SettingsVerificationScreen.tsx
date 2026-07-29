import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import { useUser } from '../../context/UserContext';
import { Row, Card, PageHeader } from './_shared';
import { toastService, showConfirm } from '../../services';

type VerifStatus = 'none' | 'pending' | 'approved' | 'rejected';
type AccountType = 'artist' | 'creator' | 'public_figure' | 'brand' | 'journalist' | 'other';
type BadgePlan = 'monthly' | 'quarterly' | 'yearly';

// Grille tarifaire du badge — abonnement récurrent, débité automatiquement à chaque
// échéance (même montants que app/db/postgres/models/user.py:VERIFICATION_PLAN_CONFIG).
const PLAN_INFO: Record<BadgePlan, { label: string; priceEur: number; months: number; badge?: string }> = {
  monthly:   { label: 'Mensuel',      priceEur: 9,    months: 1 },
  quarterly: { label: '3 mois',       priceEur: 24.30, months: 3, badge: '-10%' },
  yearly:    { label: 'Annuel',       priceEur: 81,   months: 12, badge: '-25%' },
};
const EUR_TO_GOGOLD_RATE = 100; // même taux que côté backend (wallet_service.py)

const ACCOUNT_TYPES: { key: AccountType; icon: string; label: string; sub: string }[] = [
  { key: 'artist',        icon: 'music',     label: 'Artiste',               sub: 'Musicien, chanteur, groupe' },
  { key: 'creator',       icon: 'video',     label: 'Créateur de contenu',   sub: 'YouTubeur, streamer, influenceur' },
  { key: 'public_figure', icon: 'star',      label: 'Personnalité publique', sub: 'Athlète, acteur, personnalité TV' },
  { key: 'brand',         icon: 'briefcase', label: 'Marque / Entreprise',   sub: 'Organisation ou société officielle' },
  { key: 'journalist',    icon: 'edit-2',    label: 'Journaliste / Média',   sub: 'Presse, radio, chaîne d\'info' },
  { key: 'other',         icon: 'user',      label: 'Autre',                 sub: 'Autre catégorie notable' },
];

const BLUE = '#1D9BF0';

export const SettingsVerificationScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const user = route.params?.user ?? null;
  const { theme } = useTheme();
  const { colors } = theme;
  const { refreshUser } = useUser();

  const VERIFICATION_FEE = 500;

  const [status,      setStatus]      = useState<VerifStatus>((user?.verification_status as VerifStatus) ?? 'none');
  const [fetching,    setFetching]    = useState(true);
  const [step,        setStep]        = useState(0);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [fullName,    setFullName]    = useState(user?.display_name ?? '');
  const [bio,         setBio]         = useState('');
  const [links,       setLinks]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [myGoGold,     setMyGoGold]     = useState<number | null>(null);
  const [plan,         setPlan]         = useState<BadgePlan>('monthly');
  const [subInfo,      setSubInfo]      = useState<{ plan: BadgePlan | null; expiresAt: string | null; failedMonths: number } | null>(null);

  const canGoStep2 = !!accountType;
  const canGoStep3 = fullName.trim().length >= 2 && bio.trim().length >= 20;

  const fetchStatus = async () => {
    try {
      const [verifRes, walletRes] = await Promise.all([
        apiClient.get<{ status: VerifStatus; is_verified: boolean; plan?: string; expires_at?: string; failed_months?: number }>(Endpoints.users.verificationStatus),
        apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance),
      ]);
      setStatus(verifRes.data.status);
      setMyGoGold(walletRes.data?.gogold_balance ?? 0);
      setSubInfo({
        plan: (verifRes.data.plan as BadgePlan) ?? null,
        expiresAt: verifRes.data.expires_at ?? null,
        failedMonths: verifRes.data.failed_months ?? 0,
      });
      if (verifRes.data.is_verified || verifRes.data.status === 'approved') await refreshUser();
    } catch {}
    finally { setFetching(false); }
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async () => {
    if (myGoGold !== null && myGoGold < VERIFICATION_FEE) {
      showConfirm(
        'Solde insuffisant',
        `Il te faut ${VERIFICATION_FEE} GoGold pour soumettre une demande.\nTon solde actuel : ${myGoGold} GoGold.\nIl te manque ${VERIFICATION_FEE - myGoGold} GoGold.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Acheter des GoGold', onPress: () => nav.navigate('BuyGoGold') },
        ],
      );
      return;
    }
    setLoading(true);
    try {
      const note = [`Type: ${accountType}`, `Nom: ${fullName.trim()}`, `Bio: ${bio.trim()}`, links.trim() ? `Liens: ${links.trim()}` : ''].filter(Boolean).join('\n');
      await apiClient.post(Endpoints.users.verifyRequest, { note, plan });
      setMyGoGold(prev => prev !== null ? prev - VERIFICATION_FEE : null);
      setStatus('pending');
      setStep(0);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? '';
      if (e?.response?.status === 402 || detail.toLowerCase().includes('insuffisant')) {
        const walletRes = await apiClient.get<{ gogold_balance: number }>(Endpoints.wallet.balance).catch(() => null);
        const realBalance = walletRes?.data?.gogold_balance ?? 0;
        setMyGoGold(realBalance);
        showConfirm(
          'Solde insuffisant',
          `Ton solde est de ${realBalance} GoGold. Il te manque ${VERIFICATION_FEE - realBalance} GoGold.`,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Acheter des GoGold', onPress: () => nav.navigate('BuyGoGold') },
          ],
        );
      } else {
        toastService.error('Erreur', detail || 'Impossible d\'envoyer la demande.');
      }
    } finally { setLoading(false); }
  };

  // ── Status screen ──────────────────────────────────────────────────────────
  const renderStatus = () => {
    const CFG: Record<VerifStatus, { icon: string; color: string; title: string; sub: string }> = {
      none:     { icon: 'shield',       color: colors.textTertiary, title: 'Non vérifié',        sub: '' },
      pending:  { icon: 'clock',        color: '#F59E0B',           title: 'En cours d\'examen', sub: 'Notre équipe examine votre dossier. Cela peut prendre quelques jours.' },
      approved: { icon: 'check-circle', color: BLUE,                title: 'Compte vérifié ✓',   sub: 'Votre compte est certifié GoFolyX.' },
      rejected: { icon: 'x-circle',     color: '#EF4444',           title: 'Demande refusée',    sub: (user?.verification_note ? user.verification_note + '\n\n' : '') + `Tes ${VERIFICATION_FEE} GoGold ont été remboursés dans ton wallet. Tu peux soumettre une nouvelle demande.` },
    };
    const cfg = CFG[status];
    return (
      <View style={[vs.statusCard, { backgroundColor: cfg.color + '12', borderColor: cfg.color + '40' }]}>
        <Icon name={cfg.icon} size={40} color={cfg.color} />
        <Text style={[vs.statusTitle, { color: cfg.color }]}>{cfg.title}</Text>
        <Text style={[vs.statusSub, { color: colors.textSecondary }]}>{cfg.sub}</Text>

        {status === 'approved' && subInfo && (
          <View style={{ width: '100%', gap: 8, marginTop: 4 }}>
            {subInfo.plan && (
              <View style={[vs.subRow, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Icon name="repeat" size={14} color={colors.textSecondary} />
                <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>
                  Abonnement {PLAN_INFO[subInfo.plan].label.toLowerCase()} · {PLAN_INFO[subInfo.plan].priceEur.toFixed(2)} € / {PLAN_INFO[subInfo.plan].months} mois
                </Text>
              </View>
            )}
            {subInfo.expiresAt && (
              <View style={[vs.subRow, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Icon name="calendar" size={14} color={colors.textSecondary} />
                <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>
                  Prochain renouvellement : {new Date(subInfo.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            )}
            {subInfo.failedMonths > 0 && (
              <View style={[vs.subRow, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
                <Icon name="alert-triangle" size={14} color="#F59E0B" />
                <Text style={{ fontSize: 12, color: '#F59E0B', flex: 1, fontWeight: '600' }}>
                  Solde insuffisant lors du dernier renouvellement — recharge ton wallet avant le prochain prélèvement pour ne pas perdre le badge.
                </Text>
              </View>
            )}
          </View>
        )}

        {status === 'rejected' && (
          <TouchableOpacity style={[vs.primaryBtn, { backgroundColor: BLUE, marginTop: 8 }]} onPress={() => setStep(1)}>
            <Icon name="refresh-cw" size={16} color="#fff" />
            <Text style={vs.primaryBtnText}>Soumettre une nouvelle demande</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Step 0 ─────────────────────────────────────────────────────────────────
  const renderStep0 = () => (
    <View style={{ gap: 16 }}>
      <View style={[vs.heroBadge, { backgroundColor: BLUE + '15' }]}>
        <View style={[vs.heroBadgeIcon, { backgroundColor: BLUE + '20' }]}>
          <Icon name="shield" size={32} color={BLUE} />
        </View>
        <Text style={[vs.heroTitle, { color: colors.textPrimary }]}>Badge vérifié GoFolyX</Text>
        <Text style={[vs.heroSub, { color: colors.textSecondary }]}>
          Le badge bleu confirme que ce compte est le vrai compte d'une personnalité, créateur ou marque notable.
        </Text>
      </View>
      <Card>
        {[
          { icon: 'shield',      text: 'Badge bleu visible sur votre profil et contenus' },
          { icon: 'trending-up', text: 'Meilleure visibilité dans les recherches' },
          { icon: 'star',        text: 'Accès prioritaire aux nouvelles fonctionnalités' },
          { icon: 'users',       text: 'Confiance accrue de votre communauté' },
        ].map((it, i, arr) => (
          <Row key={i} icon={it.icon} label={it.text} color={BLUE} last={i === arr.length - 1} />
        ))}
      </Card>
      <TouchableOpacity style={[vs.primaryBtn, { backgroundColor: BLUE }]} onPress={() => setStep(1)}>
        <Text style={vs.primaryBtnText}>Faire une demande</Text>
        <Icon name="arrow-right" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  // ── Step 1 ─────────────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={{ gap: 14 }}>
      <Text style={[vs.stepTitle, { color: colors.textPrimary }]}>Quel type de compte ?</Text>
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
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{t.sub}</Text>
            </View>
            {selected && <Icon name="check-circle" size={20} color={BLUE} />}
          </TouchableOpacity>
        );
      })}
      <View style={vs.navRow}>
        <TouchableOpacity style={[vs.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(0)}>
          <Icon name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={[vs.secondaryBtnText, { color: colors.textSecondary }]}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[vs.primaryBtn, { flex: 1, backgroundColor: canGoStep2 ? BLUE : colors.border }]}
          onPress={() => canGoStep2 && setStep(2)} disabled={!canGoStep2}
        >
          <Text style={vs.primaryBtnText}>Continuer</Text>
          <Icon name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Step 2 ─────────────────────────────────────────────────────────────────
  const renderStep2 = () => (
    <View style={{ gap: 14 }}>
      <Text style={[vs.stepTitle, { color: colors.textPrimary }]}>Vos informations</Text>
      <View>
        <Text style={[vs.fieldLabel, { color: colors.textTertiary }]}>NOM COMPLET OU NOM DE SCÈNE *</Text>
        <TextInput value={fullName} onChangeText={setFullName} placeholder="Ex : Sah Douss, DJ Krys…" placeholderTextColor={colors.textDisabled}
          style={[vs.input, { borderColor: fullName.trim().length >= 2 ? BLUE : colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]} />
      </View>
      <View>
        <Text style={[vs.fieldLabel, { color: colors.textTertiary }]}>POURQUOI MÉRITEZ-VOUS LE BADGE ? *</Text>
        <TextInput value={bio} onChangeText={setBio} placeholder="Ex : Artiste avec 50 000 écoutes sur Spotify…" placeholderTextColor={colors.textDisabled}
          multiline numberOfLines={4}
          style={[vs.input, vs.inputMulti, { borderColor: bio.trim().length >= 20 ? BLUE : colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]} />
        <Text style={[{ fontSize: 11, marginTop: 4, textAlign: 'right', color: bio.trim().length >= 20 ? '#22C55E' : colors.textDisabled }]}>{bio.trim().length} / 20 min</Text>
      </View>
      <View>
        <Text style={[vs.fieldLabel, { color: colors.textTertiary }]}>LIENS (optionnel)</Text>
        <TextInput value={links} onChangeText={setLinks} placeholder="Instagram, Spotify, site web…" placeholderTextColor={colors.textDisabled}
          style={[vs.input, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]} />
      </View>
      <View style={vs.navRow}>
        <TouchableOpacity style={[vs.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(1)}>
          <Icon name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={[vs.secondaryBtnText, { color: colors.textSecondary }]}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[vs.primaryBtn, { flex: 1, backgroundColor: canGoStep3 ? BLUE : colors.border }]}
          onPress={() => canGoStep3 && setStep(3)} disabled={!canGoStep3}
        >
          <Text style={vs.primaryBtnText}>Continuer</Text>
          <Icon name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Step 3 ─────────────────────────────────────────────────────────────────
  const renderStep3 = () => {
    const typeInfo = ACCOUNT_TYPES.find(t => t.key === accountType)!;
    const canAfford = myGoGold === null || myGoGold >= VERIFICATION_FEE;
    const soldeApres = myGoGold !== null ? myGoGold - VERIFICATION_FEE : null;
    return (
      <View style={{ gap: 14 }}>
        <Text style={[vs.stepTitle, { color: colors.textPrimary }]}>Vérifiez votre demande</Text>

        {/* Choix de la durée d'abonnement — le badge est un abonnement récurrent, débité
            automatiquement à chaque échéance (voir bloc paiement plus bas) */}
        <Text style={[vs.fieldLabel, { color: colors.textTertiary }]}>DURÉE DE L'ABONNEMENT AU BADGE</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(Object.keys(PLAN_INFO) as BadgePlan[]).map(key => {
            const info = PLAN_INFO[key];
            const selected = plan === key;
            const perMonth = info.priceEur / info.months;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setPlan(key)}
                style={[vs.planCard, { backgroundColor: selected ? BLUE + '15' : colors.surface, borderColor: selected ? BLUE : colors.divider, borderWidth: selected ? 2 : StyleSheet.hairlineWidth }]}
                activeOpacity={0.8}
              >
                {info.badge && (
                  <View style={[vs.planBadge, { backgroundColor: '#22C55E' }]}>
                    <Text style={vs.planBadgeText}>{info.badge}</Text>
                  </View>
                )}
                <Text style={[vs.planLabel, { color: selected ? BLUE : colors.textPrimary }]}>{info.label}</Text>
                <Text style={[vs.planPrice, { color: colors.textPrimary }]}>{info.priceEur.toFixed(2)} €</Text>
                <Text style={{ fontSize: 10, color: colors.textTertiary }}>{perMonth.toFixed(2)} €/mois</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Recap demande */}
        <View style={[vs.summaryCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          {[
            { label: 'Type', value: typeInfo?.label },
            { label: 'Nom',  value: fullName.trim() },
            { label: 'Justification', value: bio.trim() },
            ...(links.trim() ? [{ label: 'Liens', value: links.trim() }] : []),
          ].map((row, i, arr) => (
            <View key={i} style={[vs.summaryRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
              <Text style={{ fontSize: 13, color: colors.textTertiary }}>{row.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1, textAlign: 'right' }} numberOfLines={3}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Bloc paiement */}
        <View style={[vs.feeBox, { backgroundColor: canAfford ? BLUE + '12' : '#EF444412', borderColor: canAfford ? BLUE + '40' : '#EF444440' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="zap" size={16} color={canAfford ? BLUE : '#EF4444'} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: canAfford ? BLUE : '#EF4444' }}>
              Frais de dossier : {VERIFICATION_FEE} GoGold
            </Text>
          </View>
          {myGoGold !== null && (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
              Ton solde : {myGoGold.toLocaleString('fr-FR')} GoGold
              {canAfford && soldeApres !== null ? `  →  ${soldeApres.toLocaleString('fr-FR')} GoGold après` : ''}
            </Text>
          )}
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
            Une fois approuvée, l'abonnement {PLAN_INFO[plan].label.toLowerCase()} ({PLAN_INFO[plan].priceEur.toFixed(2)} € ≈ {Math.round(PLAN_INFO[plan].priceEur * EUR_TO_GOGOLD_RATE)} GoGold) démarre et se renouvelle automatiquement tous les {PLAN_INFO[plan].months} mois.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 }}>
            <Icon name="rotate-ccw" size={12} color="#22C55E" style={{ marginTop: 2 }} />
            <Text style={{ fontSize: 12, color: '#22C55E', flex: 1, lineHeight: 17 }}>
              Ces GoGold sont remboursés automatiquement dans ton wallet si ta demande est refusée.
            </Text>
          </View>
          {!canAfford && (
            <TouchableOpacity
              onPress={() => nav.navigate('BuyGoGold')}
              style={{ marginTop: 10, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                Acheter des GoGold — il te manque {VERIFICATION_FEE - (myGoGold ?? 0)} GoGold
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={vs.navRow}>
          <TouchableOpacity style={[vs.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(2)}>
            <Icon name="arrow-left" size={16} color={colors.textSecondary} />
            <Text style={[vs.secondaryBtnText, { color: colors.textSecondary }]}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[vs.primaryBtn, { flex: 1, backgroundColor: canAfford ? BLUE : colors.border, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSubmit} disabled={loading || !canAfford}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Icon name="send" size={15} color="#fff" /><Text style={vs.primaryBtnText}>Envoyer — {VERIFICATION_FEE} GoGold</Text></>
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const showWizard = (status === 'none' || status === 'rejected') && step > 0;
  const STEPS = ['Type', 'Infos', 'Envoi'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Vérification GoFolyX" onBack={() => nav.goBack()} />

      {fetching
        ? <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />
        : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {showWizard && (
              <View style={[vs.progressBar, { backgroundColor: colors.backgroundSecondary, borderRadius: 12, marginBottom: 16 }]}>
                {STEPS.map((label, i) => {
                  const done = step > i + 1;
                  const current = step === i + 1;
                  return (
                    <React.Fragment key={label}>
                      <View style={vs.progressStep}>
                        <View style={[vs.progressDot, { backgroundColor: done || current ? BLUE : colors.border }]}>
                          {done ? <Icon name="check" size={10} color="#fff" /> : <Text style={[vs.progressNum, { color: current ? '#fff' : colors.textTertiary }]}>{i + 1}</Text>}
                        </View>
                        <Text style={[vs.progressLabel, { color: current ? BLUE : colors.textTertiary }]}>{label}</Text>
                      </View>
                      {i < STEPS.length - 1 && <View style={[vs.progressLine, { backgroundColor: done ? BLUE : colors.border }]} />}
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
          </ScrollView>
        )
      }
    </View>
  );
};

const vs = StyleSheet.create({
  statusCard:     { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: 'center', gap: 10 },
  statusTitle:    { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  statusSub:      { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  heroBadge:      { borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
  heroBadgeIcon:  { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  heroTitle:      { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroSub:        { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  primaryBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  navRow:         { flexDirection: 'row', gap: 10, marginTop: 4 },
  stepTitle:      { fontSize: 20, fontWeight: '800' },
  typeCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14 },
  typeIcon:       { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeLabel:      { fontSize: 15, fontWeight: '700' },
  fieldLabel:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  input:          { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  inputMulti:     { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  summaryCard:    { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  summaryRow:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  progressBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 },
  progressStep:   { alignItems: 'center', gap: 4 },
  progressDot:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressNum:    { fontSize: 12, fontWeight: '700' },
  progressLabel:  { fontSize: 10, fontWeight: '600' },
  progressLine:   { flex: 1, height: 2, marginBottom: 14 },
  feeBox:         { borderRadius: 16, borderWidth: 1, padding: 14 },
  planCard:       { flex: 1, borderRadius: 14, padding: 10, alignItems: 'center', gap: 3, position: 'relative' },
  planBadge:      { position: 'absolute', top: -8, right: -6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  planBadgeText:  { color: '#fff', fontSize: 9, fontWeight: '800' },
  planLabel:      { fontSize: 12, fontWeight: '700', marginTop: 4 },
  planPrice:      { fontSize: 16, fontWeight: '800' },
  subRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9 },
});
