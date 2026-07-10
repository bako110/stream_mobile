import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api';
import { Endpoints } from '../../api/endpoints';
import { Row, Card, PageHeader } from './_shared';

type MonetStatus = 'none' | 'pending' | 'approved' | 'rejected';
type CreatorType = 'musician' | 'creator' | 'dj' | 'comedian' | 'brand' | 'other';

interface EligibilityInfo {
  followers_count: number;
  followers_required: number;
  eligible: boolean;
  eligibility_reasons: string[];
}

const CREATOR_TYPES: { key: CreatorType; icon: string; label: string; sub: string }[] = [
  { key: 'musician', icon: 'music',      label: 'Musicien',              sub: 'Artiste, chanteur, groupe' },
  { key: 'creator',  icon: 'video',      label: 'Créateur de contenu',   sub: 'Vidéaste, streamer, influenceur' },
  { key: 'dj',       icon: 'headphones', label: 'DJ / Beatmaker',        sub: 'Producteur musical' },
  { key: 'comedian', icon: 'smile',      label: 'Humoriste / Performer', sub: 'Stand-up, sketchs' },
  { key: 'brand',    icon: 'briefcase',  label: 'Marque / Entreprise',   sub: 'Produits ou services' },
  { key: 'other',    icon: 'user',       label: 'Autre',                 sub: 'Autre catégorie créative' },
];

const AUDIENCE_OPTIONS = ['< 500', '500–1 000', '1 000–5 000', '5 000–10 000', '> 10 000'];

const GREEN = '#10B981';

export const SettingsMonetisationScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [status,       setStatus]       = useState<MonetStatus>('none');
  const [adminNote,    setAdminNote]    = useState<string | null>(null);
  const [elig,         setElig]         = useState<EligibilityInfo | null>(null);
  const [fetching,     setFetching]     = useState(true);
  const [step,         setStep]         = useState(0);
  const [creatorType,  setCreatorType]  = useState<CreatorType | null>(null);
  const [displayName,  setDisplayName]  = useState('');
  const [description,  setDescription] = useState('');
  const [audience,     setAudience]     = useState<string | null>(null);
  const [socialLinks,  setSocialLinks]  = useState('');
  const [hasRevenue,   setHasRevenue]   = useState(false);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [loading,      setLoading]      = useState(false);

  const canGoStep2 = !!creatorType;
  const canGoStep3 = displayName.trim().length >= 2 && description.trim().length >= 30;
  const canSubmit  = canGoStep3 && acceptsTerms;

  const fetchStatus = async () => {
    try {
      const res = await apiClient.get<{ status: MonetStatus; admin_note: string | null } & EligibilityInfo>(
        Endpoints.monetization.status,
      );
      setStatus(res.data.status);
      setAdminNote(res.data.admin_note ?? null);
      setElig({
        followers_count:     res.data.followers_count,
        followers_required:  res.data.followers_required,
        eligible:            res.data.eligible,
        eligibility_reasons: res.data.eligibility_reasons,
      });
    } catch {}
    finally { setFetching(false); }
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async () => {
    if (!acceptsTerms) {
      Alert.alert('Conditions requises', "Vous devez accepter les conditions d'utilisation GoFolyX Creator Program.");
      return;
    }
    setLoading(true);
    try {
      await apiClient.post(Endpoints.monetization.request, {
        creator_type:         creatorType,
        display_name:         displayName.trim(),
        description:          description.trim(),
        monthly_audience:     audience,
        social_links:         socialLinks.trim() || null,
        has_existing_revenue: hasRevenue,
        accepts_terms:        acceptsTerms,
      });
      setStatus('pending');
      setStep(0);
    } catch (e: any) {
      Alert.alert('Demande refusée', e?.message || "Impossible d'envoyer la demande.");
    } finally { setLoading(false); }
  };

  // ── Status screen ──────────────────────────────────────────────────────────
  const renderStatus = () => {
    const CFG: Record<MonetStatus, { icon: string; color: string; title: string; sub: string }> = {
      none:     { icon: 'bar-chart-2',  color: colors.textTertiary, title: 'Non monétisé',         sub: '' },
      pending:  { icon: 'clock',        color: '#F59E0B',           title: "En cours d'examen",    sub: 'Notre équipe examine votre dossier. Cela peut prendre quelques jours.' },
      approved: { icon: 'check-circle', color: GREEN,               title: 'Monétisation activée', sub: 'Votre compte est monétisé GoFolyX. Accédez à votre espace créateur.' },
      rejected: { icon: 'x-circle',     color: '#EF4444',           title: 'Demande refusée',      sub: (adminNote ? adminNote + '\n\n' : '') + 'Vous pouvez soumettre une nouvelle demande.' },
    };
    const cfg = CFG[status];
    return (
      <View style={[ms.statusCard, { backgroundColor: cfg.color + '12', borderColor: cfg.color + '40' }]}>
        <Icon name={cfg.icon} size={40} color={cfg.color} />
        <Text style={[ms.statusTitle, { color: cfg.color }]}>{cfg.title}</Text>
        <Text style={[ms.statusSub, { color: colors.textSecondary }]}>{cfg.sub}</Text>
        {status === 'approved' && (
          <TouchableOpacity
            style={[ms.primaryBtn, { backgroundColor: GREEN, marginTop: 8 }]}
            onPress={() => nav.navigate('Monetisation')}
          >
            <Icon name="trending-up" size={16} color="#fff" />
            <Text style={ms.primaryBtnText}>Accéder à mon espace créateur</Text>
          </TouchableOpacity>
        )}
        {status === 'rejected' && (
          <TouchableOpacity
            style={[ms.primaryBtn, { backgroundColor: GREEN, marginTop: 8 }]}
            onPress={() => setStep(1)}
          >
            <Icon name="refresh-cw" size={16} color="#fff" />
            <Text style={ms.primaryBtnText}>Soumettre une nouvelle demande</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Step 0 — Hero ──────────────────────────────────────────────────────────
  const renderStep0 = () => (
    <View style={{ gap: 16 }}>
      <View style={[ms.heroBadge, { backgroundColor: GREEN + '15' }]}>
        <View style={[ms.heroBadgeIcon, { backgroundColor: GREEN + '20' }]}>
          <Icon name="bar-chart-2" size={32} color={GREEN} />
        </View>
        <Text style={[ms.heroTitle, { color: colors.textPrimary }]}>Programme Créateur GoFolyX</Text>
        <Text style={[ms.heroSub, { color: colors.textSecondary }]}>
          Monétisez votre contenu et gagnez des revenus grâce à votre communauté.
        </Text>
      </View>

      <Card>
        <Text style={[ms.sectionLabel, { color: colors.textTertiary }]}>CONDITIONS REQUISES</Text>
        {(() => {
          const followersOk = !elig || elig.followers_count >= elig.followers_required;
          const items: { icon: string; label: string; ok: boolean }[] = [
            {
              icon:  'users',
              label: elig ? `${elig.followers_count} / ${elig.followers_required} abonnés sur GoFolyX` : 'Minimum 1000 abonnés sur GoFolyX',
              ok:    followersOk,
            },
            { icon: 'film',         label: 'Au moins 3 publications par semaine en moyenne', ok: true },
            { icon: 'calendar',     label: 'Compte actif depuis au moins 30 jours',           ok: true },
            { icon: 'shield',       label: "Aucune restriction sur le compte, respect des CGU GoFolyX", ok: true },
            { icon: 'clock',        label: 'Validation automatique sous 24h si les conditions restent remplies', ok: true },
          ];
          return items.map((item, i, arr) => (
            <Row key={i} icon={item.icon} label={item.label} color={item.ok ? GREEN : '#EF4444'} last={i === arr.length - 1} />
          ));
        })()}
        {elig && !elig.eligible && elig.eligibility_reasons.length > 0 && (
          <View style={{ marginTop: 10, borderRadius: 10, padding: 10, gap: 4, backgroundColor: '#EF444415' }}>
            {elig.eligibility_reasons.map(reason => (
              <Text key={reason} style={{ fontSize: 12, lineHeight: 17, color: '#EF4444' }}>{reason}</Text>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <Text style={[ms.sectionLabel, { color: colors.textTertiary }]}>CE QUE VOUS OBTENEZ</Text>
        {[
          { icon: 'gift',        text: 'Revenus sur les cadeaux reçus (vues, lives)' },
          { icon: 'credit-card', text: 'Retrait vers compte bancaire ou Mobile Money' },
          { icon: 'bar-chart-2', text: 'Dashboard revenus et statistiques avancées' },
          { icon: 'award',       text: 'Badge "Créateur monétisé" sur votre profil' },
          { icon: 'users',       text: "Accès à l'abonnement payant pour vos fans" },
        ].map((it, i, arr) => (
          <Row key={i} icon={it.icon} label={it.text} color={GREEN} last={i === arr.length - 1} />
        ))}
      </Card>

      <TouchableOpacity
        style={[ms.primaryBtn, { backgroundColor: elig && !elig.eligible ? colors.border : GREEN }]}
        onPress={() => setStep(1)}
        disabled={!!elig && !elig.eligible}
      >
        <Text style={ms.primaryBtnText}>Faire une demande</Text>
        <Icon name="arrow-right" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  // ── Step 1 — Type de créateur ──────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={{ gap: 14 }}>
      <Text style={[ms.stepTitle, { color: colors.textPrimary }]}>Quel type de créateur ?</Text>
      {CREATOR_TYPES.map(t => {
        const selected = creatorType === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={[ms.typeCard, { backgroundColor: colors.surface, borderColor: selected ? GREEN : colors.divider, borderWidth: selected ? 2 : StyleSheet.hairlineWidth }]}
            onPress={() => setCreatorType(t.key)}
            activeOpacity={0.75}
          >
            <View style={[ms.typeIcon, { backgroundColor: selected ? GREEN + '20' : colors.backgroundSecondary }]}>
              <Icon name={t.icon} size={20} color={selected ? GREEN : colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ms.typeLabel, { color: colors.textPrimary }]}>{t.label}</Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{t.sub}</Text>
            </View>
            {selected && <Icon name="check-circle" size={20} color={GREEN} />}
          </TouchableOpacity>
        );
      })}
      <View style={ms.navRow}>
        <TouchableOpacity style={[ms.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(0)}>
          <Icon name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={[ms.secondaryBtnText, { color: colors.textSecondary }]}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ms.primaryBtn, { flex: 1, backgroundColor: canGoStep2 ? GREEN : colors.border }]}
          onPress={() => canGoStep2 && setStep(2)}
          disabled={!canGoStep2}
        >
          <Text style={ms.primaryBtnText}>Continuer</Text>
          <Icon name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Step 2 — Informations ──────────────────────────────────────────────────
  const renderStep2 = () => (
    <View style={{ gap: 14 }}>
      <Text style={[ms.stepTitle, { color: colors.textPrimary }]}>Vos informations</Text>

      <View>
        <Text style={[ms.fieldLabel, { color: colors.textTertiary }]}>NOM DE SCENE / NOM PUBLIC *</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Ex : Sah Douss, DJ Krys…"
          placeholderTextColor={colors.textDisabled}
          style={[ms.input, { borderColor: displayName.trim().length >= 2 ? GREEN : colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
        />
      </View>

      <View>
        <Text style={[ms.fieldLabel, { color: colors.textTertiary }]}>DECRIVEZ VOTRE ACTIVITE CREATRICE *</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Parlez de votre activité, vos réalisations, votre audience…"
          placeholderTextColor={colors.textDisabled}
          multiline
          numberOfLines={4}
          style={[ms.input, ms.inputMulti, { borderColor: description.trim().length >= 30 ? GREEN : colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
        />
        <Text style={{ fontSize: 11, marginTop: 4, textAlign: 'right', color: description.trim().length >= 30 ? '#22C55E' : colors.textDisabled }}>
          {description.trim().length} / 30 min
        </Text>
      </View>

      <View>
        <Text style={[ms.fieldLabel, { color: colors.textTertiary }]}>AUDIENCE MENSUELLE ESTIMEE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
          {AUDIENCE_OPTIONS.map(opt => {
            const selected = audience === opt;
            return (
              <TouchableOpacity
                key={opt}
                onPress={() => setAudience(selected ? null : opt)}
                style={[ms.audienceChip, { backgroundColor: selected ? GREEN + '20' : colors.backgroundSecondary, borderColor: selected ? GREEN : colors.border }]}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? GREEN : colors.textSecondary }}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={[ms.fieldLabel, { color: colors.textTertiary }]}>LIENS RESEAUX / PORTFOLIO (optionnel)</Text>
        <TextInput
          value={socialLinks}
          onChangeText={setSocialLinks}
          placeholder="Instagram, YouTube, site web…"
          placeholderTextColor={colors.textDisabled}
          style={[ms.input, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
        />
      </View>

      <View style={[ms.toggleRow, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
        <View style={{ flex: 1 }}>
          <Text style={[ms.toggleLabel, { color: colors.textPrimary }]}>Revenus existants</Text>
          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>Générez-vous déjà des revenus avec votre contenu ?</Text>
        </View>
        <Switch
          value={hasRevenue}
          onValueChange={setHasRevenue}
          trackColor={{ false: colors.border, true: GREEN + '80' }}
          thumbColor={hasRevenue ? GREEN : colors.textTertiary}
        />
      </View>

      <View style={ms.navRow}>
        <TouchableOpacity style={[ms.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(1)}>
          <Icon name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={[ms.secondaryBtnText, { color: colors.textSecondary }]}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ms.primaryBtn, { flex: 1, backgroundColor: canGoStep3 ? GREEN : colors.border }]}
          onPress={() => canGoStep3 && setStep(3)}
          disabled={!canGoStep3}
        >
          <Text style={ms.primaryBtnText}>Continuer</Text>
          <Icon name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Step 3 — Récap + CGU + Envoi ──────────────────────────────────────────
  const renderStep3 = () => {
    const typeInfo = CREATOR_TYPES.find(t => t.key === creatorType)!;
    return (
      <View style={{ gap: 14 }}>
        <Text style={[ms.stepTitle, { color: colors.textPrimary }]}>Vérifiez votre demande</Text>

        <View style={[ms.summaryCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
          {[
            { label: 'Type',              value: typeInfo?.label },
            { label: 'Nom public',        value: displayName.trim() },
            { label: 'Description',       value: description.trim() },
            ...(audience           ? [{ label: 'Audience',         value: audience }]           : []),
            ...(socialLinks.trim() ? [{ label: 'Liens',            value: socialLinks.trim() }] : []),
            { label: 'Revenus existants', value: hasRevenue ? 'Oui' : 'Non' },
          ].map((row, i, arr) => (
            <View key={i} style={[ms.summaryRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
              <Text style={{ fontSize: 13, color: colors.textTertiary }}>{row.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1, textAlign: 'right' }} numberOfLines={3}>{row.value}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[ms.termsRow, { backgroundColor: colors.surface, borderColor: acceptsTerms ? GREEN + '40' : colors.divider }]}
          onPress={() => setAcceptsTerms(v => !v)}
          activeOpacity={0.8}
        >
          <View style={[ms.checkbox, { borderColor: acceptsTerms ? GREEN : colors.border, backgroundColor: acceptsTerms ? GREEN : 'transparent' }]}>
            {acceptsTerms && <Icon name="check" size={12} color="#fff" />}
          </View>
          <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 19 }}>
            {"J'accepte les "}
            <Text style={{ color: GREEN, fontWeight: '700' }}>Conditions d'utilisation GoFolyX Creator Program</Text>
          </Text>
        </TouchableOpacity>

        <View style={ms.navRow}>
          <TouchableOpacity style={[ms.secondaryBtn, { borderColor: colors.border }]} onPress={() => setStep(2)}>
            <Icon name="arrow-left" size={16} color={colors.textSecondary} />
            <Text style={[ms.secondaryBtnText, { color: colors.textSecondary }]}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ms.primaryBtn, { flex: 1, backgroundColor: canSubmit ? GREEN : colors.border, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={loading || !canSubmit}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Icon name="send" size={15} color="#fff" /><Text style={ms.primaryBtnText}>Envoyer ma demande</Text></>
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
      <PageHeader title="Monetisation GoFolyX" onBack={() => nav.goBack()} />

      {fetching
        ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
        : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {showWizard && (
              <View style={[ms.progressBar, { backgroundColor: colors.backgroundSecondary, borderRadius: 12, marginBottom: 16 }]}>
                {STEPS.map((label, i) => {
                  const done    = step > i + 1;
                  const current = step === i + 1;
                  return (
                    <React.Fragment key={label}>
                      <View style={ms.progressStep}>
                        <View style={[ms.progressDot, { backgroundColor: done || current ? GREEN : colors.border }]}>
                          {done
                            ? <Icon name="check" size={10} color="#fff" />
                            : <Text style={[ms.progressNum, { color: current ? '#fff' : colors.textTertiary }]}>{i + 1}</Text>
                          }
                        </View>
                        <Text style={[ms.progressLabel, { color: current ? GREEN : colors.textTertiary }]}>{label}</Text>
                      </View>
                      {i < STEPS.length - 1 && <View style={[ms.progressLine, { backgroundColor: done ? GREEN : colors.border }]} />}
                    </React.Fragment>
                  );
                })}
              </View>
            )}

            {status === 'pending' || status === 'approved'
              ? renderStatus()
              : step === 0 ? renderStep0()
              : step === 1 ? renderStep1()
              : step === 2 ? renderStep2()
              : renderStep3()
            }
          </ScrollView>
        )
      }
    </View>
  );
};

const ms = StyleSheet.create({
  statusCard:       { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: 'center', gap: 10 },
  statusTitle:      { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  statusSub:        { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  heroBadge:        { borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
  heroBadgeIcon:    { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  heroTitle:        { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroSub:          { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  sectionLabel:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  primaryBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  primaryBtnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  navRow:           { flexDirection: 'row', gap: 10, marginTop: 4 },
  stepTitle:        { fontSize: 20, fontWeight: '800' },
  typeCard:         { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14 },
  typeIcon:         { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeLabel:        { fontSize: 15, fontWeight: '700' },
  fieldLabel:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  input:            { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  inputMulti:       { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  audienceChip:     { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  toggleRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  toggleLabel:      { fontSize: 14, fontWeight: '600' },
  summaryCard:      { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  summaryRow:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  termsRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  checkbox:         { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  progressBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 },
  progressStep:     { alignItems: 'center', gap: 4 },
  progressDot:      { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressNum:      { fontSize: 12, fontWeight: '700' },
  progressLabel:    { fontSize: 10, fontWeight: '600' },
  progressLine:     { flex: 1, height: 2, marginBottom: 14 },
});
