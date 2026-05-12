import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, ActivityIndicator, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services/authService';
import { userService } from '../../services/userService';
import { Row, Card, PageHeader } from './_shared';

interface Props { onLogout?: () => void; }

// ── Raisons communes ─────────────────────────────────────────────────────────
const DELETE_REASONS = [
  { icon: 'user-x',       label: 'Je veux changer de compte',         sub: 'Je crée un nouveau compte' },
  { icon: 'eye-off',      label: 'Problèmes de confidentialité',       sub: 'Je veux protéger mes données' },
  { icon: 'frown',        label: 'Je n\'utilise plus l\'application',  sub: 'Je ne suis plus actif' },
  { icon: 'shield-off',   label: 'Je reçois trop de contenus indésirables', sub: 'Spam, harcèlement, etc.' },
  { icon: 'clock',        label: 'Je veux faire une pause',            sub: 'Je reviendrai peut-être' },
  { icon: 'more-horizontal', label: 'Autre raison',                   sub: 'Une raison personnelle' },
];

const DEACTIVATE_REASONS = [
  { icon: 'clock',        label: 'Je veux faire une pause',            sub: 'Je reviendrai plus tard' },
  { icon: 'eye-off',      label: 'Problèmes de confidentialité',       sub: 'Je veux protéger mes données' },
  { icon: 'battery',      label: 'Je passe trop de temps sur l\'app',  sub: 'Je veux réduire mon usage' },
  { icon: 'shield-off',   label: 'Je reçois trop de notifications',    sub: 'Trop de sollicitations' },
  { icon: 'frown',        label: 'Je n\'apprécie pas l\'expérience',   sub: 'L\'app ne me convient pas' },
  { icon: 'more-horizontal', label: 'Autre raison',                   sub: 'Une raison personnelle' },
];

type FlowType = 'delete' | 'deactivate';
type Step = 'reason' | 'confirm';

// ── Wizard modal ──────────────────────────────────────────────────────────────
interface WizardProps {
  type: FlowType;
  onClose: () => void;
  onSuccess: () => void;
}

const Wizard: React.FC<WizardProps> = ({ type, onClose, onSuccess }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const [step,     setStep]     = useState<Step>('reason');
  const [selected, setSelected] = useState<number | null>(null);
  const [loading,  setLoading]  = useState(false);

  const isDelete = type === 'delete';
  const reasons  = isDelete ? DELETE_REASONS : DEACTIVATE_REASONS;
  const RED      = '#EF4444';
  const ORANGE   = '#F59E0B';
  const accent   = isDelete ? RED : ORANGE;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (isDelete) {
        await userService.deleteMyAccount();
      } else {
        await authService.deactivateSelf(selected !== null ? reasons[selected].label : 'Autre raison');
      }
      await authService.logout();
      onSuccess();
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? 'Une erreur est survenue.';
      onClose();
      setTimeout(() => {
        require('react-native').Alert.alert('Erreur', msg);
      }, 400);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[wz.container, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[wz.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={step === 'confirm' ? () => setStep('reason') : onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name={step === 'confirm' ? 'arrow-left' : 'x'} size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[wz.headerTitle, { color: colors.textPrimary }]}>
          {isDelete ? 'Supprimer mon compte' : 'Désactiver mon compte'}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Barre de progression */}
      <View style={[wz.progressTrack, { backgroundColor: colors.divider }]}>
        <View style={[wz.progressFill, { backgroundColor: accent, width: step === 'reason' ? '50%' : '100%' }]} />
      </View>

      <ScrollView contentContainerStyle={wz.body} showsVerticalScrollIndicator={false}>

        {step === 'reason' ? (
          <>
            {/* Icône */}
            <View style={[wz.heroBadge, { backgroundColor: accent + '15' }]}>
              <Icon name={isDelete ? 'trash-2' : 'pause-circle'} size={34} color={accent} />
            </View>

            <Text style={[wz.stepTitle, { color: colors.textPrimary }]}>
              {isDelete ? 'Pourquoi voulez-vous supprimer votre compte ?' : 'Pourquoi voulez-vous désactiver votre compte ?'}
            </Text>
            <Text style={[wz.stepSub, { color: colors.textTertiary }]}>
              Votre réponse nous aide à améliorer FoliX.
            </Text>

            <View style={{ gap: 10, marginTop: 8 }}>
              {reasons.map((r, i) => {
                const active = selected === i;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[wz.reasonCard, {
                      backgroundColor: active ? accent + '12' : colors.surface,
                      borderColor: active ? accent : colors.divider,
                      borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                    }]}
                    onPress={() => setSelected(i)}
                    activeOpacity={0.75}
                  >
                    <View style={[wz.reasonIcon, { backgroundColor: active ? accent + '20' : colors.backgroundSecondary }]}>
                      <Icon name={r.icon} size={18} color={active ? accent : colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[wz.reasonLabel, { color: active ? accent : colors.textPrimary }]}>{r.label}</Text>
                      <Text style={[wz.reasonSub, { color: colors.textTertiary }]}>{r.sub}</Text>
                    </View>
                    {active && <Icon name="check-circle" size={18} color={accent} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[wz.btn, { backgroundColor: selected !== null ? accent : colors.border, marginTop: 24 }]}
              onPress={() => selected !== null && setStep('confirm')}
              disabled={selected === null}
              activeOpacity={0.8}
            >
              <Text style={wz.btnText}>Continuer</Text>
              <Icon name="arrow-right" size={16} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Récap */}
            <View style={[wz.heroBadge, { backgroundColor: accent + '15' }]}>
              <Icon name={isDelete ? 'alert-octagon' : 'alert-triangle'} size={34} color={accent} />
            </View>

            <Text style={[wz.stepTitle, { color: colors.textPrimary }]}>
              {isDelete ? 'Confirmer la suppression' : 'Confirmer la désactivation'}
            </Text>

            {/* Conséquences */}
            <View style={[wz.consequencesCard, { backgroundColor: accent + '0C', borderColor: accent + '30' }]}>
              {(isDelete ? [
                'Toutes vos données seront définitivement effacées',
                'Vos posts, reels, abonnements et messages seront supprimés',
                'Cette action est irréversible — votre compte ne pourra pas être récupéré',
              ] : [
                'Votre profil sera masqué et inaccessible',
                'Vos abonnés ne pourront plus vous voir',
                'Vous pourrez réactiver votre compte à tout moment',
              ]).map((line, i) => (
                <View key={i} style={wz.consequenceRow}>
                  <Icon name={isDelete ? 'x-circle' : 'info'} size={14} color={accent} style={{ marginTop: 2 }} />
                  <Text style={[wz.consequenceTxt, { color: colors.textSecondary }]}>{line}</Text>
                </View>
              ))}
            </View>

            <Text style={[wz.confirmLabel, { color: colors.textTertiary }]}>
              Raison sélectionnée : <Text style={{ fontWeight: '700', color: colors.textSecondary }}>{selected !== null ? reasons[selected].label : ''}</Text>
            </Text>

            <TouchableOpacity
              style={[wz.btn, { backgroundColor: accent, marginTop: 24, opacity: loading ? 0.7 : 1 }]}
              onPress={handleConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Icon name={isDelete ? 'trash-2' : 'pause-circle'} size={16} color="#fff" />
                    <Text style={wz.btnText}>{isDelete ? 'Supprimer définitivement' : 'Désactiver mon compte'}</Text>
                  </>
              }
            </TouchableOpacity>

            <TouchableOpacity style={[wz.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
              <Text style={[wz.cancelBtnText, { color: colors.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

// ── SettingsDangerScreen ──────────────────────────────────────────────────────
export const SettingsDangerScreen: React.FC<Props> = ({ onLogout }) => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;

  const [flow, setFlow] = useState<FlowType | null>(null);

  const handleSuccess = async () => {
    setFlow(null);
    onLogout?.();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Zone dangereuse" onBack={() => nav.goBack()} />

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Avertissement */}
        <View style={[st.warningBanner, { backgroundColor: '#EF444412', borderColor: '#EF444430' }]}>
          <Icon name="alert-triangle" size={16} color="#EF4444" />
          <Text style={st.warningTxt}>Les actions ci-dessous peuvent affecter ou supprimer définitivement votre compte.</Text>
        </View>

        <Card>
          <Row
            icon="pause-circle"
            label="Désactiver mon compte"
            value="Votre compte sera masqué temporairement"
            color="#F59E0B"
            onPress={() => setFlow('deactivate')}
          />
          <Row
            icon="trash-2"
            label="Supprimer mon compte"
            value="Action irréversible — toutes vos données seront perdues"
            danger
            onPress={() => setFlow('delete')}
            last
          />
        </Card>
      </ScrollView>

      {/* Modal wizard */}
      <Modal
        visible={!!flow}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFlow(null)}
      >
        {flow && (
          <Wizard
            type={flow}
            onClose={() => setFlow(null)}
            onSuccess={handleSuccess}
          />
        )}
      </Modal>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  scroll:        { padding: 16, gap: 16 },
  warningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  warningTxt:    { flex: 1, fontSize: 13, color: '#EF4444', lineHeight: 19 },
});

const wz = StyleSheet.create({
  container:       { flex: 1 },
  header:          {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 20 : 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle:     { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  progressTrack:   { height: 3 },
  progressFill:    { height: 3, borderRadius: 2 },
  body:            { padding: 20, paddingBottom: 48 },
  heroBadge:       { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  stepTitle:       { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  stepSub:         { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 4 },
  reasonCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14 },
  reasonIcon:      { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reasonLabel:     { fontSize: 14, fontWeight: '700' },
  reasonSub:       { fontSize: 12, marginTop: 2 },
  btn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14 },
  btnText:         { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn:       { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginTop: 12 },
  cancelBtnText:   { fontWeight: '600', fontSize: 15 },
  consequencesCard:{ borderRadius: 14, borderWidth: 1, padding: 16, gap: 10, marginTop: 16 },
  consequenceRow:  { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  consequenceTxt:  { flex: 1, fontSize: 13, lineHeight: 19 },
  confirmLabel:    { fontSize: 13, textAlign: 'center', marginTop: 16 },
});
