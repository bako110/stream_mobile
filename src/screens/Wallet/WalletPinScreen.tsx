/**
 * WalletPinScreen — gestion du code PIN wallet (Wallet → ⚙️ → Code PIN).
 *
 * PIN optionnel : tant qu'il n'est pas défini, cadeaux/transferts/retraits passent
 * directement. Une fois défini, il est exigé partout (pavé + validation auto).
 *
 * Aucun mot de passe du compte :
 *  - Créer     : pavé → confirmation.
 *  - Modifier  : PIN actuel → nouveau → confirmation.
 *  - Désactiver: PIN actuel.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { useUser } from '../../context/UserContext';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { toastService } from '../../services';
import { PinPad } from '../../components/common';
import { PageHeader, Card } from '../Settings/_shared';

const PIN_LEN = 4;

type Mode = 'menu' | 'create' | 'change' | 'disable';
// Étapes internes :
//  create  : 'pin' → 'confirm'
//  change  : 'current' → 'pin' → 'confirm'
//  disable : 'current'
type Step = 'current' | 'pin' | 'confirm';

function errText(e: any, fallback: string): string {
  const d = e?.data?.detail;
  if (d && typeof d === 'object' && d.message) {
    const left = typeof d.attempts_left === 'number' ? ` (${d.attempts_left} essai${d.attempts_left > 1 ? 's' : ''} restant${d.attempts_left > 1 ? 's' : ''})` : '';
    return `${d.message}${left}`;
  }
  if (typeof d === 'string') return d;
  return e?.message ?? fallback;
}

export const WalletPinScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;
  const { currentUser, refreshUser } = useUser();
  const hasPin = !!currentUser?.has_wallet_pin;

  const [mode, setMode] = useState<Mode>(hasPin ? 'menu' : 'create');
  const [step, setStep] = useState<Step>('pin');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  const [current, setCurrent] = useState('');
  const [pin, setPin]         = useState('');
  const [pin2, setPin2]       = useState('');

  const clear = () => { setCurrent(''); setPin(''); setPin2(''); setErr(''); };

  const enter = (m: Mode) => {
    clear();
    setMode(m);
    setStep(m === 'create' ? 'pin' : 'current');
  };

  const back = () => {
    if (mode === 'menu' || !hasPin) return nav.goBack();
    clear();
    setMode('menu');
  };

  // ── Appels API ─────────────────────────────────────────────────────────────

  const doCreate = async () => {
    setBusy(true); setErr('');
    try {
      await apiClient.post(Endpoints.wallet.pin, { pin });
      await refreshUser();
      toastService.success('Code PIN activé', 'Il sera demandé pour chaque envoi ou retrait.');
      nav.goBack();
    } catch (e: any) {
      setErr(errText(e, 'Impossible de définir le code PIN.'));
      setPin(''); setPin2(''); setStep('pin');
    } finally { setBusy(false); }
  };

  const doChange = async () => {
    setBusy(true); setErr('');
    try {
      await apiClient.post(Endpoints.wallet.pinChange, { old_pin: current, new_pin: pin });
      toastService.success('Code PIN modifié', '');
      nav.goBack();
    } catch (e: any) {
      setErr(errText(e, 'Impossible de modifier le code PIN.'));
      enter('change');
    } finally { setBusy(false); }
  };

  const doDisable = async () => {
    setBusy(true); setErr('');
    try {
      await apiClient.delete(Endpoints.wallet.pin, { current_pin: current });
      await refreshUser();
      toastService.success('Code PIN désactivé', 'Les opérations wallet ne le demandent plus.');
      nav.goBack();
    } catch (e: any) {
      setErr(errText(e, 'Impossible de désactiver le code PIN.'));
      setCurrent('');
    } finally { setBusy(false); }
  };

  // ── Progression pavé ───────────────────────────────────────────────────────

  const onComplete = (code: string) => {
    setErr('');
    if (step === 'current') {
      setCurrent(code);
      if (mode === 'disable') { doDisable(); return; }
      setStep('pin'); // change
      return;
    }
    if (step === 'pin') {
      setPin(code);
      setStep('confirm');
      return;
    }
    // step === 'confirm'
    setPin2(code);
    if (code !== pin) {
      setErr('Les deux codes ne correspondent pas.');
      setPin(''); setPin2(''); setStep('pin');
      return;
    }
    mode === 'change' ? doChange() : doCreate();
  };

  const padValue = step === 'current' ? current : step === 'pin' ? pin : pin2;
  const padOnChange = step === 'current' ? setCurrent : step === 'pin' ? setPin : setPin2;

  const heading = (): string => {
    if (step === 'current') return mode === 'disable' ? 'Saisis ton code PIN' : 'Code actuel';
    if (step === 'pin')     return mode === 'change' ? 'Nouveau code' : 'Choisis un code';
    return 'Confirme le code';
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Code PIN" onBack={back} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Menu (PIN déjà défini) ── */}
          {mode === 'menu' && (
            <>
              <Text style={[st.intro, { color: colors.textSecondary }]}>
                Un code PIN est actif. Il est demandé à chaque envoi de cadeau, transfert ou retrait de GoGold.
              </Text>
              <Card>
                <MenuRow icon="edit-2" color="#9B65F5" label="Modifier le code" onPress={() => enter('change')} colors={colors} />
                <MenuRow icon="trash-2" color="#EF4444" label="Désactiver le code PIN" danger onPress={() => enter('disable')} colors={colors} last />
              </Card>
            </>
          )}

          {/* ── Saisie pavé ── */}
          {mode !== 'menu' && (
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <Text style={[st.h, { color: colors.textPrimary }]}>{heading()}</Text>
              {mode === 'create' && step === 'pin' && (
                <Text style={[st.intro, { color: colors.textSecondary, textAlign: 'center' }]}>
                  {PIN_LEN} chiffres — il protègera tes cadeaux, transferts et retraits.
                </Text>
              )}
              {mode === 'disable' && step === 'current' && (
                <Text style={[st.intro, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Confirme ton code actuel pour retirer la protection.
                </Text>
              )}
              <View style={{ marginTop: 14 }}>
                <PinPad
                  key={`${mode}-${step}`}
                  length={PIN_LEN}
                  value={padValue}
                  onChange={padOnChange}
                  onComplete={onComplete}
                  disabled={busy}
                />
              </View>
              {!!err && <Text style={st.err}>{err}</Text>}
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

// ── sous-composant ───────────────────────────────────────────────────────────

const MenuRow: React.FC<{
  icon: string; label: string; color: string; onPress: () => void;
  danger?: boolean; last?: boolean; colors: any;
}> = ({ icon, label, color, onPress, danger, last, colors }) => (
  <TouchableOpacity
    style={[st.menuRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[st.menuIcon, { backgroundColor: color + '18' }]}>
      <Icon name={icon} size={17} color={color} />
    </View>
    <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: danger ? '#EF4444' : colors.textPrimary }}>{label}</Text>
    <Icon name="chevron-right" size={15} color={colors.textTertiary} />
  </TouchableOpacity>
);

const st = StyleSheet.create({
  scroll:  { padding: 16, paddingBottom: 48 },
  h:       { fontSize: 18, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  intro:   { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  err:     { color: '#EF4444', fontSize: 13, marginTop: 14, textAlign: 'center', fontWeight: '600' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  menuIcon:{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
